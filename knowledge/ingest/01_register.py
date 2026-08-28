"""Stage 1.1 — register the corpus.

Hashes every PDF, detects exact duplicates, and attaches publisher/edition
metadata from the explicit registry in common.py. A file not in the registry is
reported and skipped rather than guessed at: an unlabelled document would
produce citations nobody can check.
"""

from __future__ import annotations

import hashlib
import sys

import fitz

from common import CORPUS, REGISTRY, connect, doc_id_for


def sha256(path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for block in iter(lambda: fh.read(1 << 20), b""):
            h.update(block)
    return h.hexdigest()


def main() -> int:
    con = connect()
    # Order matters: the first file with a given hash becomes canonical, so
    # prefer the cleanly-named copy over a "foo (1).pdf" download artefact.
    pdfs = sorted(CORPUS.glob("*.pdf"), key=lambda p: ("(" in p.name, p.name))
    if not pdfs:
        print(f"No PDFs found in {CORPUS}", file=sys.stderr)
        return 1

    seen_hash: dict[str, str] = {}
    unregistered, rows = [], []

    for path in pdfs:
        name = path.name
        if name not in REGISTRY:
            unregistered.append(name)
            continue

        publisher, title, edition, year, family = REGISTRY[name]
        digest = sha256(path)
        doc_id = doc_id_for(name)

        with fitz.open(path) as doc:
            page_count = doc.page_count
            char_count = sum(len(p.get_text("text")) for p in doc)

        if digest in seen_hash:
            status, dup_of = "duplicate", seen_hash[digest]
        else:
            status, dup_of = "active", None
            seen_hash[digest] = doc_id

        rows.append((doc_id, name, digest, publisher, title, edition, year,
                     family, page_count, char_count, status, dup_of))

    con.execute("DELETE FROM documents")
    con.executemany(
        "INSERT INTO documents (doc_id, filename, sha256, publisher, title, "
        "edition, year, family, page_count, char_count, status, duplicate_of) "
        "VALUES (?,?,?,?,?,?,?,?,?,?,?,?)", rows)
    con.commit()

    active = [r for r in rows if r[10] == "active"]
    dupes = [r for r in rows if r[10] == "duplicate"]

    print(f"Registered {len(rows)} documents "
          f"({len(active)} active, {len(dupes)} duplicate)")
    print()
    by_pub: dict[str, list] = {}
    for r in active:
        by_pub.setdefault(r[3], []).append(r)
    for pub in sorted(by_pub):
        docs = by_pub[pub]
        pages = sum(d[8] for d in docs)
        print(f"  {pub:<14} {len(docs):>2} docs, {pages:>5} pages")
        for d in sorted(docs, key=lambda x: x[1]):
            print(f"      {d[8]:>4}pp  [{d[5]}]  {d[4][:62]}")
    if dupes:
        print()
        for d in dupes:
            print(f"  DUPLICATE  {d[1]}  ->  same bytes as {d[11]}")
    if unregistered:
        print()
        print("  NOT REGISTERED (skipped - add to REGISTRY in common.py):")
        for n in unregistered:
            print(f"      {n}")

    # families holding more than one edition: supersession must be resolved
    fam: dict[str, list] = {}
    for r in active:
        fam.setdefault(r[7], []).append(r)
    multi = {k: v for k, v in fam.items() if len(v) > 1}
    if multi:
        print()
        print("  MULTI-EDITION FAMILIES (per-section supersession applies):")
        for k, v in sorted(multi.items()):
            eds = ", ".join(f"{d[5]} ({d[8]}pp)" for d in sorted(v, key=lambda x: x[6]))
            print(f"      {k:<16} {eds}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
