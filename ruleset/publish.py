"""Publish a ruleset version as an immutable snapshot, and emit the artefacts
the execution plane reads.

Publishing does three things:

  1. freezes the version — PUBLISHED rows can never be edited again
  2. writes snapshots/ruleset-<version>.json, content-hashed
  3. writes snapshots/ruleset-<version>.tables.js, the same content in the
     shape the deterministic engine already consumes

The .js artefact matters more than it looks: it lets the existing engine and
the round-trip harness run against the published ruleset with no code change,
which is how the migration proves itself lossless rather than asserting it.

  python ruleset/publish.py --version 2026.09.01 --by "J Subramani"
  python ruleset/publish.py --version 2026.09.01 --verify
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
DB_PATH = HERE / "store.db"
SNAP_DIR = HERE / "snapshots"


def build_snapshot(con, version: str) -> dict:
    v = con.execute("SELECT * FROM ruleset_version WHERE version=?",
                    (version,)).fetchone()
    if not v:
        raise SystemExit(f"no such ruleset version: {version}")

    fields = {}
    for r in con.execute(
            "SELECT * FROM field_definition WHERE ruleset_version=? "
            "ORDER BY field_id", (version,)):
        f = {"label": r["label"], "short": r["short_label"] or r["label"],
             "kind": r["kind"], "dict": r["definition"]}
        if r["unit_field"]:
            f["unitOf"] = r["unit_field"]
        if r["dimension"]:
            f["dim"] = r["dimension"]
        opts = json.loads(r["options"])
        if opts:
            f["options"] = opts
        if r["is_context"]:
            f["context"] = True
        fields[r["field_id"]] = f

    methods = {}
    for r in con.execute(
            "SELECT * FROM methodology WHERE ruleset_version=? ORDER BY code",
            (version,)):
        methods[r["code"]] = {
            "name": r["name"], "tier": r["data_tier"],
            "confidence": r["confidence"], "blurb": r["description"],
            "source_ref": r["source_ref"],
            "source_verified": bool(r["source_verified"])}

    cats = []
    for c in con.execute(
            "SELECT * FROM rule_category WHERE ruleset_version=? "
            "ORDER BY category", (version,)):
        rules = []
        for r in con.execute(
                "SELECT * FROM methodology_rule WHERE ruleset_version=? "
                "AND category=? AND status='APPROVED' "
                # NULL rank means UNORDERED, not worst. Sorting NULLs to 9999
                # pushed them below a rule the standard explicitly places LAST,
                # emitting the known-last fallback first. Unordered rules come
                # before it; among themselves their order is arbitrary, which
                # is the ambiguity MULTIPLE_APPLICABLE must surface.
                "ORDER BY CASE WHEN preference_rank IS NULL THEN 0 ELSE 1 END, "
                "preference_rank, rule_id",
                (version, c["category"])):
            rules.append({
                "rule_id": r["rule_id"],
                "methodology": r["methodology"],
                "requires": json.loads(r["required_inputs"]),
                "optional": json.loads(r["optional_inputs"]),
                "preconditions": json.loads(r["preconditions"]),
                "preference_rank": r["preference_rank"],
                "preference_basis": r["preference_basis"],
                "applies_count": r["applies_count"],
                "selection_basis": r["selection_basis"],
                "note": r["note"],
                "source": {"document": r["source_document"],
                           "edition": r["source_edition"],
                           "page": r["source_page"],
                           # carried so the evidence bundle can resolve the
                           # full passage at publish time
                           "chunk_id": r["source_chunk_id"],
                           "quote": r["evidence_quote"]},
            })
        cats.append({
            "category": c["category"], "legacy_id": c["legacy_id"],
            "label": c["label"],
            "framework": c["framework"], "scope": c["scope"],
            "framework_ref": c["framework_ref"],
            "templates": json.loads(c["templates"]),
            "fields": json.loads(c["form_fields"]),
            "fieldOptions": json.loads(c["field_options"]),
            "rules": rules})

    return {
        "ruleset_version": version,
        "framework": v["framework"],
        "notes": v["notes"],
        "fields": fields,
        "methodologies": methods,
        "categories": cats,
    }


def build_evidence(con, version: str, snap: dict) -> dict:
    """The cited passages, in full, keyed by chunk id.

    Read from the knowledge store at publish time and frozen. After this the
    execution plane needs nothing but the snapshot and this file.
    """
    wanted = {}
    for c in snap["categories"]:
        for r in c["rules"]:
            cid = r.get("source", {}).get("chunk_id") if r.get("source") else None
            if cid:
                wanted[cid] = r["rule_id"]
    passages = {}
    if wanted:
        import sys as _sys
        from pathlib import Path as _P
        _sys.path.insert(0, str(_P(__file__).resolve().parents[1] / "knowledge" / "ingest"))
        try:
            from common import connect as kb_connect
            kb = kb_connect()
            marks = ",".join("?" * len(wanted))
            for row in kb.execute(
                    f"SELECT c.chunk_id, c.text, c.page_start, c.page_end, s.path, "
                    f"d.title, d.edition, d.year FROM chunks c "
                    f"LEFT JOIN sections s ON s.section_id=c.section_id "
                    f"JOIN documents d ON d.doc_id=c.doc_id "
                    f"WHERE c.chunk_id IN ({marks})", list(wanted)):
                passages[row["chunk_id"]] = {
                    "document": row["title"], "edition": row["edition"],
                    "year": row["year"], "section": row["path"],
                    "pages": (f"p{row['page_start']}"
                              if row["page_start"] == row["page_end"]
                              else f"pp{row['page_start']}-{row['page_end']}"),
                    "text": " ".join((row["text"] or "").split()),
                    "cited_by": wanted[row["chunk_id"]]}
        except Exception as e:  # knowledge store absent: publish must still work
            return {"ruleset_version": version, "passages": {},
                    "warning": f"evidence not bundled: {type(e).__name__}"}
    missing = sorted(set(wanted) - set(passages))
    return {"ruleset_version": version, "passages": passages,
            "cited_chunks": len(wanted), "bundled": len(passages),
            "missing": missing}


def canonical(snapshot: dict) -> str:
    """Stable serialisation — the hash must not depend on key order."""
    return json.dumps(snapshot, sort_keys=True, separators=(",", ":"),
                      ensure_ascii=False)


def sha256_of(snapshot: dict) -> str:
    return hashlib.sha256(canonical(snapshot).encode("utf-8")).hexdigest()


def as_tables_js(snap: dict) -> str:
    """Emit the snapshot in the shape assets/engine.js already consumes.

    The engine is unchanged; only its input moves from a hand-edited file to a
    published artefact. That is what makes the migration verifiable.
    """
    cats = []
    for c in snap["categories"]:
        rules = []
        for i, r in enumerate(c["rules"], start=1):
            rules.append({
                "priority": i,
                "id": r["rule_id"],
                "label": " + ".join(snap["fields"][f]["short"]
                                    for f in r["requires"]),
                "requires": r["requires"],
                "optional": r["optional"],
                "methodology": r["methodology"],
                "note": r["note"],
                # null is meaningful: the standard establishes no order here.
                # The engine distinguishes null from "ranked last".
                "preference_rank": r["preference_rank"],
                "preference_basis": r["preference_basis"],
                "applies_count": r["applies_count"],
            })
        cats.append({
            "id": c.get("legacy_id") or c["category"],
            "category": c["category"], "label": c["label"], "scope": c["scope"],
            "ghgCat": c["framework_ref"], "table": c["category"],
            "tableVersion": snap["ruleset_version"],
            "templates": c["templates"], "fields": c["fields"],
            "fieldOptions": c["fieldOptions"], "rules": rules})

    meths = {k: {"name": m["name"], "tier": m["tier"],
                 "confidence": m["confidence"], "blurb": m["blurb"]}
             for k, m in snap["methodologies"].items()}

    j = lambda o: json.dumps(o, indent=2, ensure_ascii=False)  # noqa: E731
    return f"""/* GENERATED — published ruleset {snap['ruleset_version']}.
   Do not edit. Produced by ruleset/publish.py from the governed store.
   Editing this file does not change the ruleset; it only makes the artefact
   disagree with its own hash. */

const REGISTRY = {j({"version": snap["ruleset_version"],
                     "approved": snap.get("published_at", ""),
                     "owner": "GHG Methodology Governance Board",
                     "standard": snap.get("notes", "")})};

const FIELDS = {j(snap['fields'])};

const METHODOLOGIES = {j(meths)};

const CATEGORIES = {j(cats)};

/* Both identifiers resolve: the governed code and the one records were
   written against before the ruleset was formalised. Renaming an identifier
   must not orphan historical activity data. */
const CATEGORY_BY_ID = {{}};
CATEGORIES.forEach(function (c) {{
  CATEGORY_BY_ID[c.id] = c;
  if (c.category && c.category !== c.id) CATEGORY_BY_ID[c.category] = c;
}});

const CORE_FIELDS = ['distance', 'mode', 'fuelQuantity', 'fuelType',
  'energyConsumption', 'gridRegion', 'spend', 'contractualInstrument'];

const SOURCES = {{}};
const METHODOLOGY_SOURCES = {{}};
"""


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--version", required=True)
    ap.add_argument("--by")
    ap.add_argument("--verify", action="store_true",
                    help="re-hash the stored snapshot and compare")
    a = ap.parse_args()

    con = sqlite3.connect(DB_PATH)
    con.row_factory = sqlite3.Row
    SNAP_DIR.mkdir(exist_ok=True)
    snap_path = SNAP_DIR / f"ruleset-{a.version}.json"

    if a.verify:
        row = con.execute("SELECT snapshot_sha256, status FROM ruleset_version "
                          "WHERE version=?", (a.version,)).fetchone()
        if not row or not row["snapshot_sha256"]:
            print(f"{a.version} has not been published.", file=sys.stderr)
            return 1
        on_disk = json.loads(snap_path.read_text(encoding="utf-8"))
        recorded = row["snapshot_sha256"]
        actual = sha256_of({k: v for k, v in on_disk.items()
                            if k not in ("published_at", "published_by", "sha256")})
        rebuilt = sha256_of(build_snapshot(con, a.version))
        print(f"ruleset {a.version} ({row['status']})")
        print(f"  recorded hash        {recorded[:16]}…")
        print(f"  snapshot on disk     {actual[:16]}…  "
              f"{'MATCH' if actual == recorded else 'ALTERED'}")
        print(f"  rebuilt from store   {rebuilt[:16]}…  "
              f"{'MATCH' if rebuilt == recorded else 'ALTERED — the store changed'}")
        return 0 if (actual == recorded and rebuilt == recorded) else 1

    if not a.by:
        print("--by is required: publishing records who is accountable.",
              file=sys.stderr)
        return 2

    row = con.execute("SELECT status FROM ruleset_version WHERE version=?",
                      (a.version,)).fetchone()
    if not row:
        print(f"no such version: {a.version}", file=sys.stderr)
        return 1
    if row["status"] == "PUBLISHED":
        print(f"{a.version} is already published and immutable.", file=sys.stderr)
        return 1

    unapproved = con.execute(
        "SELECT COUNT(*) FROM methodology_rule WHERE ruleset_version=? "
        "AND status <> 'APPROVED'", (a.version,)).fetchone()[0]
    if unapproved:
        print(f"{unapproved} rule(s) are not APPROVED. Publishing is blocked.",
              file=sys.stderr)
        return 1

    snap = build_snapshot(con, a.version)
    digest = sha256_of(snap)
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")

    out = dict(snap, published_at=now, published_by=a.by, sha256=digest)
    snap_path.write_text(json.dumps(out, indent=2, ensure_ascii=False),
                         encoding="utf-8")
    (SNAP_DIR / f"ruleset-{a.version}.tables.js").write_text(
        as_tables_js(out), encoding="utf-8")

    # Evidence travels WITH the ruleset. The execution plane must be able to
    # return the passage behind a decision without reaching into the vector
    # index or the corpus, because reaching into either reopens the boundary
    # the architecture exists to hold. Only chunks a rule actually cites are
    # included, so this stays small.
    ev = build_evidence(con, a.version, snap)
    (SNAP_DIR / f"ruleset-{a.version}.evidence.json").write_text(
        json.dumps(ev, indent=2, ensure_ascii=False), encoding="utf-8")

    con.execute("UPDATE ruleset_version SET status='PUBLISHED', published_at=?, "
                "published_by=?, snapshot_sha256=? WHERE version=?",
                (now, a.by, digest, a.version))
    con.commit()

    legacy = con.execute(
        "SELECT COUNT(*) FROM methodology_rule WHERE ruleset_version=? "
        "AND preference_basis='LEGACY_TABLE_ORDER'", (a.version,)).fetchone()[0]

    print(f"published ruleset {a.version}")
    print(f"  sha256   {digest}")
    print(f"  snapshot {snap_path.name}")
    print(f"  engine   {snap_path.stem}.tables.js")
    print(f"  by       {a.by}")
    if legacy:
        print()
        print(f"  WARNING: {legacy} rule(s) still rank by LEGACY_TABLE_ORDER.")
        print("  Those ranks are inherited, not evidence from the standard.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
