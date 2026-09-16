"""Step 2b — retire LEGACY_TABLE_ORDER, rule by rule.

For every rule, one question only:

    Does a sentence in the standard explicitly place THIS method relative to
    the alternatives?

Yes  -> preference_rank kept, basis EXPLICIT_STANDARD_GUIDANCE, quote recorded
No   -> preference_rank NULL, basis NULL, evidence NULL

NULL is the default. A rank survives only by producing its evidence. Nothing is
inferred from document order, table order, section order, how often a method is
mentioned, or what the application did yesterday — inferring from any of those
is exactly what produced the debt being retired.

Creates a new DRAFT version; published versions are immutable.

  python ruleset/apply_preference_review.py --from 2026.09.02 --to 2026.09.03 --dry-run
"""

from __future__ import annotations

import argparse
import json
import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
EVIDENCE = HERE / "preference-evidence.json"
DB_PATH = HERE / "store.db"

# How each methodology appears in the standards' own prose. Plain lower-cased
# substrings, no regex: this has to be obviously correct to a reviewer, and an
# earlier regex version failed silently — reporting "no evidence" for evidence
# sitting in plain view, which is the one failure this step cannot afford.
# Several codes share a phrase, which is why comparisons below are made on
# phrases rather than on codes.
METHOD_PROSE = {
    "SPEND_BASED":   ["spend-based method", "spend based method"],
    "EEIO":          ["spend-based method", "eeio"],
    "SUPPLIER_SPEC": ["supplier-specific method", "site-specific method"],
    "AVG_MASS":      ["average-data method"],
    "AVG_DATA":      ["average-data method"],
    "WASTE_TREAT":   ["average-data method"],
    "FLOOR_AREA":    ["average-data method", "floor-area"],
    "ECON_ALLOC":    ["average-data method", "revenue-based"],
    "DIST_BASED":    ["distance-based method", "distance method"],
    "VEH_DIST":      ["distance-based method", "vehicle-distance"],
    "WT_DIST":       ["weight-distance", "tonne-kilometre", "distance-based method"],
    "FUEL_BASED":    ["fuel-based method"],
    "USE_FUEL":      ["fuel-based method"],
    "LOC_BASED":     ["location-based method"],
    "MKT_BASED":     ["market-based method"],
    "ASSET_SPEC":    ["asset-specific method", "site-specific method"],
    "SITE_PROC":     ["site-specific method"],
    "WASTE_TYPE":    ["waste-type-specific method"],
    "INVEST_SPEC":   ["investment-specific method"],
    "USE_DIRECT":    ["direct use-phase"],
}

TRIGGERS = (" if ", " where ", " when ")
INFEASIBLE = ("not feasible", "cannot be applied", "is not available",
              "are not available", "is unavailable", "are unavailable")
SUPERLATIVE = ("is the most accurate", "are the most accurate", "is most accurate")
# A figure reference is real guidance, but PDF extraction scrambles flowcharts,
# so an order cannot be read from the text layer.
TREE = "decision tree"


def names(methodology: str, text: str) -> bool:
    t = text.lower()
    return any(p in t for p in METHOD_PROSE.get(methodology, []))


def prose_forms(text: str) -> set[str]:
    """Distinct method PHRASES present, not codes.

    Five codes map to "average-data method". Counting codes made a single
    phrase look like five different methods.
    """
    t = text.lower()
    return {p for pats in METHOD_PROSE.values() for p in pats if p in t}


def split_fallback(sentence: str):
    """"<subject> if <antecedent> not feasible <consequent>" -> the three parts.

    "If X, Y, Z are not feasible ... apply W" establishes exactly one fact:
    W ranks below X, Y and Z. It says nothing about how X, Y and Z rank against
    each other, so only W can earn a rank from it.
    """
    low = sentence.lower()
    ti, tlen = -1, 0
    for trig in TRIGGERS:
        i = low.find(trig)
        if i != -1 and (ti == -1 or i < ti):
            ti, tlen = i, len(trig)
    if ti == -1:
        return None
    after = ti + tlen
    ii, ilen = -1, 0
    for inf in INFEASIBLE:
        i = low.find(inf, after)
        if i != -1 and (ii == -1 or i < ii):
            ii, ilen = i, len(inf)
    if ii == -1:
        return None
    return sentence[:ti], sentence[after:ii], sentence[ii + ilen:]


def assess(rule: dict, evidence: list) -> dict:
    """Decide one rule. Default NULL; a rank survives only on clear evidence."""
    meth = rule["methodology"]

    for e in evidence:
        s = " ".join(e["sentence"].split())
        if TREE in s.lower():
            continue

        parts = split_fallback(s)
        if parts:
            subj, ante, cons = parts
            # The fallback method is named either in the run-in heading before
            # the "if" ("Spend-based method If the ... are not feasible...") or
            # in the consequent. The antecedent names what it falls back FROM.
            if (names(meth, cons) or names(meth, subj)) and not names(meth, ante):
                above = sorted(prose_forms(ante) - set(METHOD_PROSE.get(meth, [])))
                if above:
                    return {"keep": True, "kind": "ranks_last",
                            "relative_to": above, "quote": s,
                            "source": e["source"],
                            "why": "named as the fallback when the listed methods "
                                   "are not feasible, so it ranks below all of them"}
            continue

        low = s.lower()
        for sup in SUPERLATIVE:
            i = low.find(sup)
            if i != -1 and names(meth, s[:i]):
                return {"keep": True, "kind": "most_accurate",
                        "relative_to": [], "quote": s, "source": e["source"],
                        "why": "the standard calls this method the most accurate"}

    return {"keep": False, "kind": None, "relative_to": [], "quote": None,
            "source": None,
            "why": "no sentence places this method relative to the alternatives"}


def renumber(decisions: list) -> None:
    """Keep ranks a clean sequence inside each category.

    Evidence normally establishes only that one method is LAST, so that rule
    takes the bottom position and everything else is NULL — there is nothing to
    interleave with.
    """
    by_cat: dict = {}
    for r, d in decisions:
        by_cat.setdefault(r["category"], []).append((r, d))
    for items in by_cat.values():
        total = len(items)
        for _, d in items:
            if d["keep"]:
                d["new_rank"] = total if d["kind"] == "ranks_last" else 1


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--from", dest="src", required=True)
    ap.add_argument("--to", dest="dst", required=True)
    ap.add_argument("--by",
                    default="claude-assisted evidence review; NOT board-approved")
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()

    if not EVIDENCE.exists():
        print("run gather_preference_evidence.py first", file=sys.stderr)
        return 1
    ev = json.loads(EVIDENCE.read_text(encoding="utf-8"))
    by_cat = {c["category"]: c for c in ev["categories"]}

    con = sqlite3.connect(DB_PATH)
    con.row_factory = sqlite3.Row
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")

    rules = con.execute(
        "SELECT * FROM methodology_rule WHERE ruleset_version=? "
        "ORDER BY category, preference_rank", (a.src,)).fetchall()
    if not rules:
        print(f"no rules in {a.src}", file=sys.stderr)
        return 1

    decisions = []
    for r in rules:
        cat = by_cat.get(r["category"], {})
        decisions.append((dict(r), assess(dict(r), cat.get("strong_evidence", []))))
    renumber(decisions)

    kept = [d for _, d in decisions if d["keep"]]
    print(f"{len(rules)} rules reviewed against gathered evidence")
    print(f"  {len(kept)} keep a rank, each backed by a quote")
    print(f"  {len(rules) - len(kept)} -> preference_rank NULL")
    print()

    cur = None
    for r, d in decisions:
        if r["category"] != cur:
            cur = r["category"]
            print(f"  {cur}")
        if d["keep"]:
            print(f"      KEEP  {r['preference_rank']} -> {d['new_rank']}  "
                  f"{r['methodology']}  below {', '.join(d['relative_to']) or '-'}")
            print(f"            {d['source']['document'][:38]} {d['source']['pages']}")
        else:
            print(f"      NULL  was {r['preference_rank']}  {r['methodology']}")

    if a.dry_run:
        print("\ndry run — nothing written")
        return 0

    if con.execute("SELECT 1 FROM ruleset_version WHERE version=?",
                   (a.dst,)).fetchone():
        print(f"\n{a.dst} already exists.", file=sys.stderr)
        return 1

    src_v = con.execute("SELECT * FROM ruleset_version WHERE version=?",
                        (a.src,)).fetchone()
    con.execute(
        "INSERT INTO ruleset_version (version, framework, status, created_at, notes) "
        "VALUES (?,?,?,?,?)",
        (a.dst, src_v["framework"], "DRAFT", now,
         f"Derived from {a.src}. LEGACY_TABLE_ORDER retired: a rank survives "
         f"only where a sentence explicitly places the method relative to the "
         f"alternatives. {len(rules) - len(kept)} of {len(rules)} ranks NULL."))

    for t in ("rule_category", "methodology", "field_definition"):
        for row in con.execute(f"SELECT * FROM {t} WHERE ruleset_version=?",
                               (a.src,)).fetchall():
            vals = dict(row)
            vals["ruleset_version"] = a.dst
            con.execute(f"INSERT INTO {t} ({','.join(vals)}) "
                        f"VALUES ({','.join('?' * len(vals))})", list(vals.values()))

    for r, d in decisions:
        v = dict(r)
        v["ruleset_version"] = a.dst
        v["supersedes_rule_id"] = r["rule_id"]
        v["approved_by"] = a.by
        v["approved_at"] = now
        if d["keep"]:
            src = d["source"]
            v["preference_rank"] = d["new_rank"]
            v["preference_basis"] = "EXPLICIT_STANDARD_GUIDANCE"
            v["preference_evidence"] = json.dumps(
                {"quote": d["quote"], "positions": d["kind"],
                 "relative_to": d["relative_to"], "why": d["why"],
                 "source": src}, ensure_ascii=False)
            v["source_document"] = src["document"]
            v["source_edition"] = src["edition"]
            v["source_year"] = src["year"]
            v["source_page"] = src["pages"]
            v["source_chunk_id"] = src["chunk_id"]
            v["evidence_quote"] = d["quote"]
        else:
            v["preference_rank"] = None
            v["preference_basis"] = None
            v["preference_evidence"] = None
        con.execute(f"INSERT INTO methodology_rule ({','.join(v)}) "
                    f"VALUES ({','.join('?' * len(v))})", list(v.values()))

    con.commit()
    print(f"\nwrote DRAFT ruleset {a.dst}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
