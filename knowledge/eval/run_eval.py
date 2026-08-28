"""Stage 1.8 — measure retrieval against the gold set.

M1 is not finished when the index builds. It is finished when it reliably
returns the passage that would settle a rule we cannot currently evidence.
This script is the gate before M2: a weak retriever guarantees a hallucinating
extractor.

  python eval/run_eval.py
  python eval/run_eval.py --k 10 --verbose
  python eval/run_eval.py --compare      # hybrid vs lexical-only vs dense-only
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
KNOWLEDGE = HERE.parent
sys.path.insert(0, str(KNOWLEDGE))
sys.path.insert(0, str(KNOWLEDGE / "ingest"))

import search as S                      # noqa: E402
from common import connect              # noqa: E402

GOLD = json.loads((HERE / "gold-queries.json").read_text(encoding="utf-8"))


def doc_ids_for(hits: list[dict], con) -> list[str]:
    """Map result rows back to doc_id for scoring."""
    by_file = {r["filename"]: r["doc_id"]
               for r in con.execute("SELECT doc_id, filename FROM documents")}
    return [by_file.get(h["file"], "?") for h in hits]


def run_mode(q: str, mode: str, k: int) -> list[str]:
    bm25 = S._load_bm25()
    if mode == "lexical":
        return S.bm25_rank(bm25, q, k)
    if mode == "dense":
        return S.dense_rank(q, k)
    return [c for c, _ in S.rrf([S.bm25_rank(bm25, q, S.POOL),
                                 S.dense_rank(q, S.POOL)])][:k]


def evaluate(mode: str, k: int, verbose: bool = False) -> dict:
    con = connect()
    chunk_doc = {r["chunk_id"]: r["doc_id"]
                 for r in con.execute("SELECT chunk_id, doc_id FROM chunks")}
    chunk_cat = {r["chunk_id"]: r["category_tag"]
                 for r in con.execute("SELECT chunk_id, category_tag FROM chunks")}
    doc_family = {r["doc_id"]: r["family"]
                  for r in con.execute("SELECT doc_id, family FROM documents")}

    gold = [q for q in GOLD["queries"] if not q.get("control")]
    ctrl = [q for q in GOLD["queries"] if q.get("control")]
    results, hits_at = [], 0

    for q in GOLD["queries"]:
        ranked = run_mode(q["query"], mode, k)
        docs = [chunk_doc.get(c, "?") for c in ranked]
        # Matching on family rather than doc_id survives a file being renamed
        # or an edition being swapped - which is exactly what happened when the
        # draft Scope 2 Guidance was replaced by the published one.
        want = set(q.get("expect_doc", []))
        want_fam = set(q.get("expect_family", []))
        want_cat = q.get("expect_category")
        # Strict rank: first hit that is the right document AND, where the
        # query names one, the right scope 3 category. Document-level alone is
        # saturated - 9 of 10 gold queries target the same document, so every
        # retriever scores 10/10 and the metric discriminates nothing.
        rank = None
        for i, (c, d) in enumerate(zip(ranked, docs), 1):
            hit_doc = d in want or (want_fam and doc_family.get(d) in want_fam)
            if hit_doc and (want_cat is None or chunk_cat.get(c) == want_cat):
                rank = i
                break
        cat_ok = None if want_cat is None else rank is not None
        ok = rank is not None and rank <= GOLD["thresholds"]["doc_in_top"]
        if ok and not q.get("control"):
            hits_at += 1
        results.append({"id": q["id"], "rank": rank, "ok": ok,
                        "control": bool(q.get("control")), "cat_ok": cat_ok,
                        "query": q["query"], "top_docs": docs[:3]})
        if verbose:
            print(f"  {q['id']:<4} rank={rank}  {'PASS' if ok else 'FAIL'}"
                  f"{'  cat=' + str(cat_ok) if cat_ok is not None else ''}")
            for d in dict.fromkeys(docs[:4]):
                print(f"         {d}")

    ranks = [r["rank"] for r in results if not r["control"]]
    mrr = sum(1 / r for r in ranks if r) / max(len(ranks), 1)
    at1 = sum(1 for r in ranks if r == 1)
    return {"mode": mode, "recall": hits_at / max(len(gold), 1),
            "mrr": round(mrr, 3), "rank1": at1,
            "gold_n": len(gold), "gold_hits": hits_at,
            "controls_ok": all(r["ok"] for r in results if r["control"]),
            "results": results}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--k", type=int, default=10)
    ap.add_argument("--verbose", action="store_true")
    ap.add_argument("--compare", action="store_true")
    a = ap.parse_args()

    modes = ["hybrid", "lexical", "dense"] if a.compare else ["hybrid"]
    reports = []
    for m in modes:
        print(f"\n=== {m} ===")
        reports.append(evaluate(m, a.k, verbose=a.verbose or not a.compare))

    print("\n" + "=" * 70)
    print(f"{'mode':<10} {'recall@' + str(GOLD['thresholds']['doc_in_top']):<12} "
          f"{'MRR':<7} {'rank-1':<8} controls")
    for r in reports:
        print(f"{r['mode']:<10} {r['gold_hits']}/{r['gold_n']} ({r['recall']:.0%}){'':<3} "
              f"{r['mrr']:<7} {r['rank1']}/{r['gold_n']}{'':<4} "
              f"{'pass' if r['controls_ok'] else 'FAIL'}")

    main_report = reports[0]
    threshold = GOLD["thresholds"]["doc_recall_min"]
    ok = main_report["recall"] >= threshold and main_report["controls_ok"]
    print()
    if ok:
        print(f"M1 GATE: PASS  (recall {main_report['recall']:.0%} >= {threshold:.0%}, controls pass)")
    else:
        print(f"M1 GATE: FAIL  (recall {main_report['recall']:.0%}, "
              f"controls {'pass' if main_report['controls_ok'] else 'fail'})")
        for r in main_report["results"]:
            if not r["ok"]:
                print(f"   {r['id']}  rank={r['rank']}  top={r['top_docs']}")
                print(f"        {r['query']}")

    (HERE / "last-run.json").write_text(
        json.dumps(reports, indent=2), encoding="utf-8")
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
