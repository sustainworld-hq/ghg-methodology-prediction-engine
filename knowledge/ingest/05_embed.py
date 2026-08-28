"""Stage 1.5/1.6 — embed chunks and build both indexes.

Dense: BAAI/bge-small-en-v1.5 (384-dim), normalised, FAISS IndexFlatIP so
cosine similarity is exact. At ~2,000 chunks approximate search would buy
nothing and cost debuggability.

Lexical: BM25 over the same chunks. Method names in this domain are lexical
("tonne-kilometre", "spend-based method", "environmentally-extended input-
output"), and dense vectors blur exactly those distinctions. search.py fuses
the two.

Runs on CPU, offline after the model downloads once.
"""

from __future__ import annotations

import os

# Keep transformers on PyTorch. Letting it probe TensorFlow pulls in a second
# framework, costs a lot of memory, and was killing this process mid-encode.
os.environ.setdefault("USE_TF", "0")
os.environ.setdefault("TRANSFORMERS_NO_TF", "1")
os.environ.setdefault("USE_TORCH", "1")
os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "3")
os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")

import json
import math
import pickle
import re
from collections import Counter

import numpy as np

from common import STORE, connect

MODEL_NAME = "BAAI/bge-small-en-v1.5"
BATCH = 16
MAX_SEQ = 512          # bge-small's limit; longer input is truncated anyway

# bge models want a short instruction prefix on the query side only.
QUERY_PREFIX = "Represent this sentence for searching relevant passages: "

TOKEN_RE = re.compile(r"[a-z0-9]+(?:[-_][a-z0-9]+)*")


def tokenize(text: str) -> list[str]:
    """Keeps hyphenated technical terms intact - 'spend-based' is one token."""
    return TOKEN_RE.findall(text.lower())


def build_bm25(chunk_ids: list[str], texts: list[str]) -> dict:
    docs = [tokenize(t) for t in texts]
    df: Counter = Counter()
    for d in docs:
        df.update(set(d))
    n = len(docs)
    idf = {t: math.log(1 + (n - c + 0.5) / (c + 0.5)) for t, c in df.items()}
    lens = [len(d) for d in docs]
    avgdl = sum(lens) / max(n, 1)
    postings: dict[str, list[tuple[int, int]]] = {}
    for i, d in enumerate(docs):
        for term, freq in Counter(d).items():
            postings.setdefault(term, []).append((i, freq))
    return {"chunk_ids": chunk_ids, "idf": idf, "postings": postings,
            "lens": lens, "avgdl": avgdl, "n": n}


def main() -> int:
    con = connect()
    rows = con.execute(
        "SELECT c.chunk_id, c.text, c.doc_id, s.path "
        "FROM chunks c LEFT JOIN sections s ON s.section_id = c.section_id "
        "ORDER BY c.doc_id, c.ordinal").fetchall()
    if not rows:
        print("No chunks. Run 04_chunk.py first.")
        return 1

    chunk_ids = [r["chunk_id"] for r in rows]
    # Prepending the section path gives the embedding the context the passage
    # itself often omits ("this method requires..." - which method? which category?).
    texts = [((r["path"] + "\n\n") if r["path"] else "") + r["text"] for r in rows]

    print(f"{len(rows)} chunks to index")

    print("Building BM25 index...")
    bm25 = build_bm25(chunk_ids, texts)
    with open(STORE / "bm25.pkl", "wb") as fh:
        pickle.dump(bm25, fh)
    print(f"  {len(bm25['idf'])} distinct terms, avg doc length {bm25['avgdl']:.0f}")

    print(f"Loading {MODEL_NAME} (downloads ~130MB on first run)...")
    from sentence_transformers import SentenceTransformer
    import faiss

    model = SentenceTransformer(MODEL_NAME)
    model.max_seq_length = MAX_SEQ
    print(f"  max_seq_length={model.max_seq_length}, batch={BATCH}")

    # Encode in visible slices. A silent death inside one giant encode() call
    # is very hard to diagnose; this reports how far it got.
    parts = []
    STEP = 128
    for i in range(0, len(texts), STEP):
        sl = texts[i:i + STEP]
        parts.append(model.encode(sl, batch_size=BATCH, show_progress_bar=False,
                                  normalize_embeddings=True, convert_to_numpy=True))
        print(f"  embedded {min(i + STEP, len(texts))}/{len(texts)}", flush=True)
    vecs = np.vstack(parts).astype("float32")

    index = faiss.IndexFlatIP(vecs.shape[1])
    index.add(vecs)
    faiss.write_index(index, str(STORE / "dense.faiss"))
    np.save(STORE / "dense_ids.npy", np.array(chunk_ids, dtype=object),
            allow_pickle=True)

    (STORE / "index_meta.json").write_text(json.dumps({
        "model": MODEL_NAME, "dim": int(vecs.shape[1]),
        "chunks": len(chunk_ids), "query_prefix": QUERY_PREFIX,
    }, indent=2), encoding="utf-8")

    print(f"  FAISS index: {index.ntotal} vectors, dim {vecs.shape[1]}")
    print("Done.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
