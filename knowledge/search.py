"""Stage 1.7 — hybrid retrieval over the methodology corpus.

BM25 for lexical precision, dense embeddings for paraphrase, fused with
Reciprocal Rank Fusion. Every result carries the citation a governed rule
needs: publisher, document, edition, section path and page range.

  python search.py "spend-based method for purchased goods"
  python search.py --json --k 10 "market-based method dual reporting"
  python search.py --publisher IPCC "choice of method decision tree"
"""

from __future__ import annotations

import argparse
import json
import math
import pickle
import sys
from collections import Counter, defaultdict

sys.path.insert(0, str(__import__("pathlib").Path(__file__).resolve().parent / "ingest"))
from common import STORE, connect  # noqa: E402

RRF_K = 60          # standard RRF damping constant
POOL = 60           # how deep each retriever goes before fusion

_K1, _B = 1.5, 0.75


def _load_bm25():
    with open(STORE / "bm25.pkl", "rb") as fh:
        return pickle.load(fh)


def _tokenize(text: str) -> list[str]:
    import re
    return re.findall(r"[a-z0-9]+(?:[-_][a-z0-9]+)*", text.lower())


def bm25_rank(bm25, query: str, k: int) -> list[str]:
    terms = _tokenize(query)
    scores: dict[int, float] = defaultdict(float)
    lens, avgdl = bm25["lens"], bm25["avgdl"]
    for term, qf in Counter(terms).items():
        idf = bm25["idf"].get(term)
        if idf is None:
            continue
        for i, tf in bm25["postings"].get(term, ()):
            denom = tf + _K1 * (1 - _B + _B * lens[i] / avgdl)
            scores[i] += idf * (tf * (_K1 + 1)) / denom
    top = sorted(scores.items(), key=lambda kv: -kv[1])[:k]
    return [bm25["chunk_ids"][i] for i, _ in top]


def dense_rank(query: str, k: int) -> list[str]:
    import numpy as np
    import faiss
    from sentence_transformers import SentenceTransformer

    meta = json.loads((STORE / "index_meta.json").read_text(encoding="utf-8"))
    model = SentenceTransformer(meta["model"])
    q = model.encode([meta.get("query_prefix", "") + query],
                     normalize_embeddings=True, convert_to_numpy=True).astype("float32")
    index = faiss.read_index(str(STORE / "dense.faiss"))
    ids = np.load(STORE / "dense_ids.npy", allow_pickle=True)
    _, idx = index.search(q, min(k, index.ntotal))
    return [str(ids[i]) for i in idx[0] if i >= 0]


def rrf(rankings: list[list[str]], weights: list[float] | None = None) -> list[tuple[str, float]]:
    weights = weights or [1.0] * len(rankings)
    score: dict[str, float] = defaultdict(float)
    for ranking, w in zip(rankings, weights):
        for rank, cid in enumerate(ranking):
            score[cid] += w / (RRF_K + rank + 1)
    return sorted(score.items(), key=lambda kv: -kv[1])


def hydrate(con, chunk_ids: list[str]) -> dict:
    if not chunk_ids:
        return {}
    marks = ",".join("?" * len(chunk_ids))
    rows = con.execute(
        f"SELECT c.chunk_id, c.text, c.page_start, c.page_end, c.scope_tag, "
        f"c.category_tag, s.path, s.heading, "
        f"d.filename, d.title, d.publisher, d.edition, d.year, d.family "
        f"FROM chunks c "
        f"LEFT JOIN sections s ON s.section_id = c.section_id "
        f"JOIN documents d ON d.doc_id = c.doc_id "
        f"WHERE c.chunk_id IN ({marks})", chunk_ids).fetchall()
    return {r["chunk_id"]: dict(r) for r in rows}


def search(query: str, k: int = 8, publisher: str | None = None,
           scope: str | None = None, edition_year: int | None = None) -> list[dict]:
    con = connect()
    bm25 = _load_bm25()

    lex = bm25_rank(bm25, query, POOL)
    den = dense_rank(query, POOL)
    fused = rrf([lex, den])

    lex_pos = {c: i for i, c in enumerate(lex)}
    den_pos = {c: i for i, c in enumerate(den)}

    meta = hydrate(con, [c for c, _ in fused[:POOL * 2]])
    out = []
    for cid, sc in fused:
        m = meta.get(cid)
        if not m:
            continue
        if publisher and m["publisher"] != publisher:
            continue
        if scope and m["scope_tag"] != scope:
            continue
        if edition_year and m["year"] != edition_year:
            continue
        out.append({
            "score": round(sc, 5),
            "found_by": ("both" if cid in lex_pos and cid in den_pos
                         else "lexical" if cid in lex_pos else "dense"),
            "publisher": m["publisher"],
            "document": m["title"],
            "file": m["filename"],
            "edition": m["edition"],
            "year": m["year"],
            "section": m["path"],
            "pages": (f"p{m['page_start']}" if m["page_start"] == m["page_end"]
                      else f"pp{m['page_start']}-{m['page_end']}"),
            "scope": m["scope_tag"],
            "category": m["category_tag"],
            "chunk_id": cid,
            "text": m["text"],
        })
        if len(out) >= k:
            break
    return out


def main() -> int:
    ap = argparse.ArgumentParser(description="Search the methodology corpus.")
    ap.add_argument("query", nargs="+")
    ap.add_argument("--k", type=int, default=6)
    ap.add_argument("--json", action="store_true")
    ap.add_argument("--publisher")
    ap.add_argument("--scope")
    ap.add_argument("--chars", type=int, default=420)
    a = ap.parse_args()

    q = " ".join(a.query)
    hits = search(q, k=a.k, publisher=a.publisher, scope=a.scope)

    if a.json:
        print(json.dumps({"query": q, "results": hits}, indent=2, ensure_ascii=False))
        return 0

    print(f'\nQuery: "{q}"   ({len(hits)} results)\n')
    for i, h in enumerate(hits, 1):
        print(f"[{i}] {h['publisher']} — {h['document']}")
        print(f"    {h['edition']} ({h['year']}) · {h['pages']} · {h['found_by']} · score {h['score']}")
        if h["section"]:
            print(f"    § {h['section'][:96]}")
        body = " ".join(h["text"].split())[:a.chars]
        print(f"    {body}…")
        print()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
