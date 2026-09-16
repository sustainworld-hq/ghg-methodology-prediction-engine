"""M2 — turn retrieved evidence into candidate methodology rules.

Pipeline for one activity (or one uploaded document):

    find method-bearing passages   (M1 retrieval, no model)
              |
    one Groq call per passage      (reports what the passage says)
              |
    five mechanical validators     (contract.py — quote, schema, citation,
              |                     vocabulary, provisional)
    candidate records              (for a human to approve; nothing auto-adopted)

Writes to knowledge/candidates/. Nothing here touches assets/decision-tables.js.

  python knowledge/m2/extract.py --activity "purchased goods and services"
  python knowledge/m2/extract.py --doc <doc_id> --limit 8
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.path.insert(0, str(ROOT / "knowledge"))
sys.path.insert(0, str(ROOT / "knowledge" / "ingest"))

import contract  # noqa: E402
from common import connect  # noqa: E402

OUT_DIR = ROOT / "knowledge" / "candidates"

# Passages worth spending a call on. A standard is mostly prose about scope,
# boundaries and reporting; only some of it defines a calculation method.
METHOD_HINTS = (
    "method", "calculat", "shall be estimated", "should apply",
    "activity data", "emission factor", "tier ", "approach",
)


def fields_vocab() -> dict:
    """The FIELDS dictionary, read out of the JS so there is one definition."""
    import re
    src = (ROOT / "assets" / "decision-tables.js").read_text(encoding="utf-8")
    out = {}
    for m in re.finditer(
            r"^\s{2}(\w+):\s*\{(.*?)^\s{2}\},?$", src, re.S | re.M):
        fid, body = m.group(1), m.group(2)
        lab = re.search(r"label:\s*'([^']*)'", body)
        sho = re.search(r"short:\s*'([^']*)'", body)
        if lab:
            out[fid] = {"label": lab.group(1),
                        "short": sho.group(1) if sho else lab.group(1)}
        if len(out) > 200:
            break
    return out


def candidate_passages(activity: str | None, doc_id: str | None,
                       limit: int) -> list[dict]:
    """Retrieval only. No model has been called at this point."""
    con = connect()
    rows: list[dict] = []

    if doc_id:
        q = ("SELECT c.chunk_id, c.text, c.page_start, c.page_end, s.path, "
             "d.title, d.edition, d.year, d.provisional "
             "FROM chunks c LEFT JOIN sections s ON s.section_id=c.section_id "
             "JOIN documents d ON d.doc_id=c.doc_id "
             "WHERE c.doc_id=? ORDER BY c.ordinal")
        for r in con.execute(q, (doc_id,)):
            low = (r["text"] or "").lower()
            if not any(h in low for h in METHOD_HINTS):
                continue
            rows.append(_row(r))
    else:
        sys.path.insert(0, str(ROOT / "knowledge"))
        from search import search
        for h in search(f"{activity} calculation method activity data", k=limit * 2):
            r = con.execute(
                "SELECT c.chunk_id, c.text, c.page_start, c.page_end, s.path, "
                "d.title, d.edition, d.year, d.provisional "
                "FROM chunks c LEFT JOIN sections s ON s.section_id=c.section_id "
                "JOIN documents d ON d.doc_id=c.doc_id WHERE c.chunk_id=?",
                (h["chunk_id"],)).fetchone()
            if r:
                rows.append(_row(r))
    return rows[:limit]


def _row(r) -> dict:
    return {
        "chunk_id": r["chunk_id"], "text": r["text"],
        "document": r["title"], "edition": r["edition"], "year": r["year"],
        "section": r["path"] or "",
        "pages": (f"p{r['page_start']}" if r["page_start"] == r["page_end"]
                  else f"pp{r['page_start']}-{r['page_end']}"),
        "provisional": bool(r["provisional"]),
    }


def extract(activity: str | None = None, doc_id: str | None = None,
            limit: int = 8, model: str = contract.DEFAULT_MODEL,
            pause: float = 2.0, progress=None) -> dict:
    """Run the pipeline. `progress(stage, detail)` is called for UI feedback."""
    def say(stage, detail=""):
        if progress:
            progress(stage, detail)

    vocab = fields_vocab()
    say("retrieving", "searching the indexed documents")
    passages = candidate_passages(activity, doc_id, limit)
    say("retrieved", f"{len(passages)} candidate passages")

    accepted, rejected = [], []
    for i, p in enumerate(passages, 1):
        say("extracting", f"passage {i} of {len(passages)} — {p['document'][:40]} {p['pages']}")
        res = contract.call(
            contract.user_prompt(p["chunk_id"], p["section"], p["text"],
                                 activity or "this activity"),
            model=model)
        if "error" in res:
            rejected.append({"chunk_id": p["chunk_id"], "rejected_by": "call",
                             "problems": [res["error"]], "pages": p["pages"],
                             "document": p["document"]})
            continue

        v = contract.validate(res["obj"], p, vocab)
        if not v["ok"]:
            rejected.append({"chunk_id": p["chunk_id"],
                             "rejected_by": v["rejected_by"],
                             "problems": v["problems"], "pages": p["pages"],
                             "document": p["document"],
                             "claimed": res["obj"].get("method_name_verbatim")})
            continue

        rec = v["record"]
        if rec["outcome"] != "extracted":
            rejected.append({"chunk_id": p["chunk_id"],
                             "rejected_by": rec["outcome"],
                             "problems": [f"model reported {rec['outcome']}"],
                             "pages": p["pages"], "document": p["document"]})
            continue

        rec["activity"] = activity or doc_id
        rec["extractor"] = {"model": model, "prompt_version": "m2-v2",
                            "contract": "two-field selection semantics"}
        accepted.append(rec)
        if pause:
            time.sleep(pause)

    say("done", f"{len(accepted)} candidates, {len(rejected)} rejected")
    return {"activity": activity, "doc_id": doc_id, "model": model,
            "passages_considered": len(passages),
            "candidates": accepted, "rejected": rejected}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--activity")
    ap.add_argument("--doc")
    ap.add_argument("--limit", type=int, default=8)
    ap.add_argument("--model", default=contract.DEFAULT_MODEL)
    ap.add_argument("--pause", type=float, default=2.0)
    a = ap.parse_args()
    if not a.activity and not a.doc:
        print("give --activity or --doc", file=sys.stderr)
        return 2

    res = extract(a.activity, a.doc, a.limit, a.model, a.pause,
                  progress=lambda s, d: print(f"  [{s}] {d}", flush=True))

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    slug = (a.activity or a.doc).lower().replace(" ", "-")[:50]
    dest = OUT_DIR / f"{slug}.json"
    dest.write_text(json.dumps(res, indent=2, ensure_ascii=False), encoding="utf-8")

    print(f"\n{len(res['candidates'])} candidate rule(s):\n")
    for c in res["candidates"]:
        print(f"  {c['method_name_verbatim']}")
        print(f"    inputs   : {', '.join(c['inputs_verbatim']) or '—'}")
        print(f"    mapped   : {', '.join(m['field_id'] for m in c['inputs_mapped'] if m['field_id']) or '—'}")
        if c["unmapped_inputs"]:
            print(f"    UNMAPPED : {', '.join(c['unmapped_inputs'])}")
        print(f"    semantics: {c['applies_count']} / {c['selection_basis']}")
        for r in c["ordering_relations"]:
            print(f"    order    : {r['relation']} {r['other_method_verbatim']}")
        print(f"    source   : {c['evidence']['document']} {c['evidence']['pages']}")
        print(f"    confidence: {c['confidence']}")
        print()
    if res["rejected"]:
        print(f"{len(res['rejected'])} rejected before review:")
        for r in res["rejected"]:
            print(f"  [{r['rejected_by']}] {r['document'][:38]} {r['pages']} — {r['problems'][0][:80]}")
    print(f"\nwritten: {dest}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
