"""Step 2a — find where the standards actually state a method ordering.

Retires LEGACY_TABLE_ORDER honestly. For each category this searches the
indexed corpus for language that *establishes a preference between named
methods*, and writes a review worksheet. It proposes nothing on its own: a
human reads the quotes and decides.

Deliberately lexical, not model-driven. Detection must be reviewable and
reproducible — a reviewer has to be able to check why a passage was surfaced,
and re-running must surface the same passages. A model belongs in the
authoring plane for reading prose, not for deciding what counts as evidence
that a standard ranks its methods.

  python ruleset/gather_preference_evidence.py --version 2026.09.02
  -> ruleset/preference-evidence.json
"""

from __future__ import annotations

import argparse
import json
import re
import sqlite3
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0, str(ROOT / "knowledge"))
sys.path.insert(0, str(ROOT / "knowledge" / "ingest"))

OUT = HERE / "preference-evidence.json"

# Language that establishes an order BETWEEN methods. Each pattern is a claim
# about English usage in standards, and each is listed so a reviewer can argue
# with it.
ORDERING_PATTERNS = [
    (r"if\s+(?:the\s+)?[\w\s,\-]{0,90}?method[s]?\s+(?:is|are)\s+not\s+feasible",
     "explicit fallback: names methods that must be infeasible first"),
    (r"if\s+[\w\s,\-]{0,90}?(?:data|information)\s+(?:is|are)\s+not\s+available",
     "fallback on data availability"),
    (r"(?:where|when)\s+[\w\s,\-]{0,60}?(?:is|are)\s+(?:not\s+)?(?:available|feasible)",
     "conditional availability"),
    (r"in\s+order\s+of\s+preference", "explicit preference ordering"),
    (r"(?:is|are)\s+(?:the\s+)?(?:most|more)\s+accurate", "accuracy comparison"),
    (r"prefer(?:red|able|ence)\b", "preference language"),
    (r"should\s+(?:be\s+)?(?:use|used|apply|applied)\b", "normative direction"),
    (r"as\s+a\s+last\s+resort", "last resort"),
    (r"only\s+(?:be\s+)?(?:use|used)\s+(?:if|when)", "restricted use"),
    (r"hierarch", "explicit hierarchy"),
    (r"decision\s+tree", "defers to a decision tree"),
]
COMPILED = [(re.compile(p, re.I), why) for p, why in ORDERING_PATTERNS]

# Does the sentence mention a method by name? Ordering language that names no
# method is usually about data quality generally, not about ranking methods.
METHOD_NAME = re.compile(
    r"(supplier[- ]specific|hybrid|average[- ]data|spend[- ]based|distance[- ]based|"
    r"fuel[- ]based|site[- ]specific|asset[- ]specific|location[- ]based|"
    r"market[- ]based|waste[- ]type|investment[- ]specific|tier\s*[123])\s*method?",
    re.I)


def sentences(text: str) -> list[str]:
    flat = " ".join((text or "").split())
    return [s.strip() for s in re.split(r"(?<=[.;:])\s+", flat) if len(s.strip()) > 30]


def scan(text: str) -> list[dict]:
    hits = []
    for s in sentences(text):
        why = [w for pat, w in COMPILED if pat.search(s)]
        if not why:
            continue
        named = sorted({m.group(0).lower() for m in METHOD_NAME.finditer(s)})
        hits.append({"sentence": s[:900], "signals": why,
                     "methods_named": named,
                     "strength": "strong" if named else "weak"})
    return hits


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--version", required=True)
    ap.add_argument("--per-category", type=int, default=8)
    a = ap.parse_args()

    from common import connect as kb_connect
    from search import search

    store = sqlite3.connect(HERE / "store.db")
    store.row_factory = sqlite3.Row
    kb = kb_connect()

    cats = store.execute(
        "SELECT category, label, scope FROM rule_category WHERE ruleset_version=? "
        "ORDER BY category", (a.version,)).fetchall()
    if not cats:
        print(f"no categories for {a.version}", file=sys.stderr)
        return 1

    report = {"ruleset_version": a.version, "method": "lexical scan, no model",
              "patterns": [p for p, _ in ORDERING_PATTERNS], "categories": []}

    for c in cats:
        rules = store.execute(
            "SELECT rule_id, methodology, preference_rank FROM methodology_rule "
            "WHERE ruleset_version=? AND category=? ORDER BY preference_rank",
            (a.version, c["category"])).fetchall()

        found: list[dict] = []
        seen = set()
        for h in search(f"{c['label']} calculation method", k=a.per_category):
            row = kb.execute(
                "SELECT c.text, c.page_start, c.page_end, d.title, d.edition, d.year "
                "FROM chunks c JOIN documents d ON d.doc_id=c.doc_id "
                "WHERE c.chunk_id=?", (h["chunk_id"],)).fetchone()
            if not row:
                continue
            for hit in scan(row["text"]):
                key = hit["sentence"][:80]
                if key in seen:
                    continue
                seen.add(key)
                hit["source"] = {
                    "document": row["title"], "edition": row["edition"],
                    "year": row["year"], "chunk_id": h["chunk_id"],
                    "pages": (f"p{row['page_start']}"
                              if row["page_start"] == row["page_end"]
                              else f"pp{row['page_start']}-{row['page_end']}")}
                found.append(hit)

        strong = [f for f in found if f["strength"] == "strong"]
        report["categories"].append({
            "category": c["category"], "label": c["label"], "scope": c["scope"],
            "rules": [dict(r) for r in rules],
            "strong_evidence": strong[:6],
            "weak_evidence_count": len(found) - len(strong),
            "decision": None,          # filled in by review
            "decided_by": None,
            "rationale": None,
        })

    OUT.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")

    n_strong = sum(1 for c in report["categories"] if c["strong_evidence"])
    print(f"scanned {len(cats)} categories of ruleset {a.version}")
    print(f"  {n_strong} have sentences that name methods AND use ordering language")
    print(f"  {len(cats) - n_strong} have none — candidates for preference_rank = NULL")
    print(f"  worksheet: {OUT}")
    print()
    for c in report["categories"]:
        mark = "EVIDENCE" if c["strong_evidence"] else "   none "
        print(f"  {mark}  {c['label'][:44]:<44} "
              f"{len(c['strong_evidence'])} strong / {c['weak_evidence_count']} weak")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
