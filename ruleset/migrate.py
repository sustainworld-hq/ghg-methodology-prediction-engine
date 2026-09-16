"""Migrate assets/decision-tables.js into the governed ruleset store.

The JS is read by running node and dumping JSON, not by parsing it with a
regex: the definitions are the real ones or the migration is worthless.

Honesty about what is being migrated
------------------------------------
These 70 rules were hand-authored. They are in production today, so they are
recorded as APPROVED — but `approved_by` says exactly what that approval was,
and every preference rank is recorded as LEGACY_TABLE_ORDER rather than
EXPLICIT_STANDARD_GUIDANCE.

That distinction is the whole point. Array position in a JS file is not
evidence that a standard ranks one method above another. Step 2 of the build
order is to retire LEGACY_TABLE_ORDER: each rank either gets promoted to
EXPLICIT_STANDARD_GUIDANCE with the sentence that establishes it, or set to
NULL because the framework does not in fact order those methods.

  python ruleset/migrate.py --version 2026.09.01
"""

from __future__ import annotations

import argparse
import json
import re
import sqlite3
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
DB_PATH = HERE / "store.db"

FRAMEWORK = "GHG_PROTOCOL"

DUMP_JS = r"""
const fs=require('fs'), vm=require('vm');
const ctx={console,out:{}}; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(process.argv[2],'utf8') +
  "\nout.CATEGORIES=CATEGORIES;out.METHODOLOGIES=METHODOLOGIES;" +
  "out.FIELDS=FIELDS;out.REGISTRY=REGISTRY;out.SOURCES=SOURCES;", ctx);
process.stdout.write(JSON.stringify(ctx.out));
"""


def load_js_tables() -> dict:
    script = HERE / "_dump.js"
    script.write_text(DUMP_JS, encoding="utf-8")
    try:
        out = subprocess.run(
            ["node", str(script), str(ROOT / "assets" / "decision-tables.js")],
            capture_output=True, text=True, encoding="utf-8", check=True)
        return json.loads(out.stdout)
    finally:
        script.unlink(missing_ok=True)


def const_case(s: str) -> str:
    """businessTravel -> BUSINESS_TRAVEL"""
    s = re.sub(r"(?<!^)(?=[A-Z])", "_", s)
    return re.sub(r"[^A-Za-z0-9]+", "_", s).upper().strip("_")


def rule_id(category: str, methodology: str, n: int) -> str:
    """Full category code, not an abbreviation.

    Initials collided: PURCHASED_STEAM and PROCESSING_SOLD both give "PS", so
    two different rules could claim one id. A governed identifier that is not
    unique is worse than a long one.
    """
    return f"{category}__{methodology}__{n:03d}"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--version", default=datetime.now(timezone.utc).strftime("%Y.%m.%d"))
    ap.add_argument("--force", action="store_true",
                    help="replace this version if it already exists and is DRAFT")
    a = ap.parse_args()
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")

    js = load_js_tables()
    con = sqlite3.connect(DB_PATH)
    con.row_factory = sqlite3.Row
    con.executescript((HERE / "schema.sql").read_text(encoding="utf-8"))

    existing = con.execute("SELECT status FROM ruleset_version WHERE version=?",
                           (a.version,)).fetchone()
    if existing:
        if existing["status"] == "PUBLISHED":
            print(f"{a.version} is PUBLISHED and immutable. Use a new version.",
                  file=sys.stderr)
            return 1
        if not a.force:
            print(f"{a.version} already exists as DRAFT. Pass --force to replace.",
                  file=sys.stderr)
            return 1
        for t in ("methodology_rule", "rule_category", "methodology",
                  "field_definition"):
            con.execute(f"DELETE FROM {t} WHERE ruleset_version=?", (a.version,))
        con.execute("DELETE FROM ruleset_version WHERE version=?", (a.version,))

    con.execute(
        "INSERT INTO ruleset_version (version, framework, status, created_at, notes) "
        "VALUES (?,?,?,?,?)",
        (a.version, FRAMEWORK, "DRAFT", now,
         "Migrated from hand-authored assets/decision-tables.js. Preference "
         "ranks carry basis LEGACY_TABLE_ORDER and are NOT evidence that the "
         "standard orders these methods."))

    # ---- field dictionary -------------------------------------------------
    for fid, f in js["FIELDS"].items():
        con.execute(
            "INSERT INTO field_definition (ruleset_version, field_id, label, "
            "short_label, kind, unit_field, dimension, options, definition, "
            "is_context) VALUES (?,?,?,?,?,?,?,?,?,?)",
            (a.version, fid, f.get("label", fid), f.get("short"),
             f.get("kind", "text"), f.get("unitOf"), f.get("dim"),
             json.dumps(f.get("options", [])), f.get("dict"),
             1 if f.get("context") else 0))

    # ---- methodology catalogue -------------------------------------------
    sources = js.get("SOURCES", {})
    for code, m in js["METHODOLOGIES"].items():
        src = m.get("source") or {}
        held = bool(sources.get(src.get("src", ""), {}).get("held"))
        ref = (f"{sources.get(src.get('src',''),{}).get('short','')} {src.get('ref','')}"
               .strip() or None)
        con.execute(
            "INSERT INTO methodology (ruleset_version, code, name, data_tier, "
            "confidence, description, source_ref, source_verified) "
            "VALUES (?,?,?,?,?,?,?,?)",
            (a.version, code, m["name"], m.get("tier"), m.get("confidence"),
             m.get("blurb"), ref, 1 if held else 0))

    # ---- categories and rules --------------------------------------------
    n_rules = 0
    for cat in js["CATEGORIES"]:
        cat_code = const_case(cat["id"])
        con.execute(
            "INSERT INTO rule_category (ruleset_version, category, legacy_id, "
            "framework, label, scope, framework_ref, templates, form_fields, "
            "field_options) VALUES (?,?,?,?,?,?,?,?,?,?)",
            (a.version, cat_code, cat["id"], FRAMEWORK, cat["label"], cat.get("scope"),
             cat.get("ghgCat"), json.dumps(cat.get("templates", [])),
             json.dumps(cat.get("fields", [])),
             json.dumps(cat.get("fieldOptions", {}))))

        for i, r in enumerate(cat["rules"], start=1):
            rid = rule_id(cat_code, r["methodology"], i)
            con.execute(
                "INSERT INTO methodology_rule ("
                " ruleset_version, rule_id, framework, category, methodology,"
                " required_inputs, optional_inputs, preconditions,"
                " preference_rank, preference_basis, preference_evidence,"
                " applies_count, selection_basis,"
                " status, approved_by, approved_at, note) "
                "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                (a.version, rid, FRAMEWORK, cat_code, r["methodology"],
                 json.dumps(r["requires"]), json.dumps(r.get("optional", [])),
                 json.dumps([]),
                 i, "LEGACY_TABLE_ORDER",
                 "Position in the hand-authored table. Not verified against "
                 "the standard.",
                 "one_of", "unstated",
                 "APPROVED",
                 "baseline-migration: in production before governance existed; "
                 "not board-reviewed",
                 now, r.get("note")))
            n_rules += 1

    con.commit()

    print(f"ruleset {a.version} (DRAFT)")
    print(f"  {len(js['CATEGORIES'])} categories")
    print(f"  {n_rules} rules")
    print(f"  {len(js['METHODOLOGIES'])} methodologies "
          f"({sum(1 for m in js['METHODOLOGIES'].values() if (m.get('source') or {}).get('src') and sources.get(m['source']['src'],{}).get('held'))} source-verified)")
    print(f"  {len(js['FIELDS'])} fields")
    print(f"  store: {DB_PATH}")
    print()
    print("  Every preference rank carries basis LEGACY_TABLE_ORDER.")
    print("  That is technical debt, recorded as such. Step 2 retires it.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
