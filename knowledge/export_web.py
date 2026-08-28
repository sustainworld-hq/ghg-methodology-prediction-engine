"""Export the knowledge base for the static site.

GitHub Pages has no backend, so the hosted evidence search is lexical (BM25 in
the browser) over the real corpus. The full hybrid pipeline - BM25 fused with
dense embeddings - stays local, because shipping 1,609 384-dimension vectors
plus a transformer to every visitor is not a reasonable trade for a demo.

Writes to data/ at the repo root, which the site fetches. All paths on D:.
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0, str(HERE / "ingest"))

from common import connect  # noqa: E402

OUT = ROOT / "data"

# Keep the payload honest but small: strip the running header that PyMuPDF
# picks up at the top of nearly every chunk, and normalise whitespace.
HEADER_NOISE = re.compile(
    r"^(?:Technical Guidance for Calculating Scope 3 Emissions|"
    r"Volume \d+: [A-Za-z ]+|Chapter \d+: [A-Za-z ,]+|"
    r"\d{4} IPCC Guidelines for National Greenhouse Gas Inventories|"
    r"\d{4} Refinement to the \d{4} IPCC Guidelines[A-Za-z ]*)\s*", re.I)


def clean(text: str) -> str:
    t = " ".join((text or "").split())
    for _ in range(3):
        t = HEADER_NOISE.sub("", t).strip()
    return t


def main() -> int:
    con = connect()
    OUT.mkdir(exist_ok=True)

    docs = {}
    for r in con.execute(
            "SELECT doc_id, title, publisher, edition, year, family, page_count, "
            "provisional FROM documents WHERE status='active' "
            "ORDER BY publisher, year, title"):
        docs[r["doc_id"]] = {
            "t": r["title"], "p": r["publisher"], "e": r["edition"],
            "y": r["year"], "f": r["family"], "pp": r["page_count"],
            "prov": bool(r["provisional"]),
        }

    chunks = []
    for r in con.execute(
            "SELECT c.chunk_id, c.doc_id, c.page_start, c.page_end, "
            "c.category_tag, c.scope_tag, s.path, c.text "
            "FROM chunks c LEFT JOIN sections s ON s.section_id=c.section_id "
            "ORDER BY c.doc_id, c.ordinal"):
        body = clean(r["text"])
        if len(body) < 120:
            continue
        chunks.append({
            "i": r["chunk_id"], "d": r["doc_id"],
            "a": r["page_start"], "b": r["page_end"],
            "c": r["category_tag"], "s": r["scope_tag"],
            "x": (r["path"] or "")[:160],
            "w": body,
        })

    # families with more than one edition, so the site can flag supersession
    fams: dict[str, list] = {}
    for d, m in docs.items():
        fams.setdefault(m["f"], []).append({"id": d, "y": m["y"], "e": m["e"]})
    multi = {k: sorted(v, key=lambda x: -x["y"])
             for k, v in fams.items() if len(v) > 1}

    payload = {
        "generated_from": "knowledge/store/knowledge.db",
        "retrieval": "lexical (BM25) in-browser; hybrid BM25+dense runs locally",
        "documents": docs, "multi_edition": multi, "chunks": chunks,
    }
    dest = OUT / "corpus.json"
    dest.write_text(json.dumps(payload, separators=(",", ":"), ensure_ascii=False),
                    encoding="utf-8")

    size = dest.stat().st_size / 1024 / 1024
    print(f"wrote {dest}")
    print(f"  {len(docs)} documents, {len(chunks)} chunks, {size:.2f} MB")
    print(f"  {len(multi)} multi-edition families")
    if size > 8:
        print("  WARNING: payload is large for a static site")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
