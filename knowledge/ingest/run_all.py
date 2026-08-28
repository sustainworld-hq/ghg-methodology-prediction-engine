"""Run the whole M1 pipeline in order.

  python ingest/run_all.py            # full rebuild
  python ingest/run_all.py --from 3   # resume at segmentation

Each stage writes its own tables, so a stage can be re-run in isolation while
tuning. Stage 3 is the one worth reviewing by eye - read
knowledge/store/section-trees.txt before trusting anything downstream.
"""

from __future__ import annotations

import argparse
import runpy
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent

STAGES = [
    (1, "01_register.py", "register + dedupe the corpus"),
    (2, "02_extract.py", "extract text and font metrics"),
    (3, "03_segment.py", "detect headings, build section trees"),
    (4, "04_chunk.py", "chunk within sections, tag scope/category"),
    (5, "05_embed.py", "build BM25 and FAISS indexes"),
]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--from", dest="start", type=int, default=1)
    ap.add_argument("--only", type=int)
    a = ap.parse_args()

    sys.path.insert(0, str(HERE))
    for num, script, desc in STAGES:
        if a.only and num != a.only:
            continue
        if num < a.start:
            continue
        print(f"\n{'=' * 72}\n[{num}/5] {desc}\n{'=' * 72}")
        t0 = time.time()
        try:
            runpy.run_path(str(HERE / script), run_name="__main__")
        except SystemExit as e:
            if e.code:
                print(f"\nStage {num} failed with exit code {e.code}")
                return int(e.code)
        print(f"  ({time.time() - t0:.1f}s)")

    print("\nPipeline complete. Next:")
    print("  python search.py \"spend-based method for purchased goods\"")
    print("  python eval/run_eval.py")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
