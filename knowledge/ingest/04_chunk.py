"""Stage 1.4 — chunk within sections, and tag scope/category.

Chunks never cross a section boundary. That is the point: a method definition
and the activity data it requires sit in the same section, and splitting them
apart would leave M2 extracting a rule with no inputs.

Page attribution: a page belongs to the last section that started at or before
it. Sections beginning mid-page therefore claim the whole page, which is a
little coarse but keeps citations page-accurate and attribution non-overlapping.
"""

from __future__ import annotations

import re

from common import connect

# Sized in words, not BPE tokens: tiktoken needs a network download that is
# blocked here, and the embedding model applies its own tokenizer regardless.
# ~520 words lands near 700 tokens for this kind of technical prose.
TARGET_WORDS = 520
OVERLAP_WORDS = 75
MIN_CHUNK_WORDS = 30

WORD_RE = re.compile(r"\S+")


def count_tokens(text: str) -> int:
    """Approximate BPE tokens. Good enough for sizing and for reporting."""
    return int(len(WORD_RE.findall(text)) * 1.33)

CATEGORY_RE = re.compile(r"category\s+(\d+)", re.I)

SCOPE1_HINTS = re.compile(
    r"stationary combustion|mobile combustion|fugitive|process emission|"
    r"direct emission|scope 1", re.I)
SCOPE2_HINTS = re.compile(
    r"purchased electricity|purchased steam|location-based|market-based|"
    r"scope 2|contractual instrument", re.I)
SCOPE3_HINTS = re.compile(r"scope 3|value chain|upstream|downstream", re.I)


def scope_for(doc_row, path: str, text: str) -> str | None:
    hay = f"{path}\n{text[:900]}"
    fam = doc_row["family"] or ""
    if fam == "ghgp-scope2":
        return "scope2"
    if fam in ("ghgp-scope3-standard", "ghgp-scope3-guidance"):
        return "scope3"
    if fam.startswith("ipcc-v2"):
        return "scope1"
    if SCOPE2_HINTS.search(hay):
        return "scope2"
    if SCOPE3_HINTS.search(hay):
        return "scope3"
    if SCOPE1_HINTS.search(hay):
        return "scope1"
    return None


def split_tokens(pages: list[tuple[int, str]]) -> list[tuple[str, int, int]]:
    """Windowed split that keeps track of which pages each window came from."""
    words: list[str] = []
    owner: list[int] = []          # page number per word
    for page_no, text in pages:
        w = WORD_RE.findall(text)
        words.extend(w)
        owner.extend([page_no] * len(w))

    out: list[tuple[str, int, int]] = []
    if not words:
        return out
    step = TARGET_WORDS - OVERLAP_WORDS
    i = 0
    while i < len(words):
        window = words[i:i + TARGET_WORDS]
        if len(window) < MIN_CHUNK_WORDS and out:
            break
        pg = owner[i:i + TARGET_WORDS]
        text = " ".join(window).strip()
        if text:
            out.append((text, min(pg), max(pg)))
        if i + TARGET_WORDS >= len(words):
            break
        i += step
    return out


def main() -> int:
    con = connect()
    con.execute("DELETE FROM chunks")

    docs = con.execute(
        "SELECT * FROM documents WHERE status='active' ORDER BY filename").fetchall()

    total = 0
    for d in docs:
        pages = {r["page_no"]: (r["text"] or "")
                 for r in con.execute(
                     "SELECT page_no, text FROM pages WHERE doc_id=? AND page_no>0",
                     (d["doc_id"],))}
        secs = con.execute(
            "SELECT * FROM sections WHERE doc_id=? ORDER BY page_start, ordinal",
            (d["doc_id"],)).fetchall()

        # page -> section (last section starting at or before the page)
        owner: dict[int, object] = {}
        cur = None
        si = 0
        for p in range(1, d["page_count"] + 1):
            while si < len(secs) and secs[si]["page_start"] <= p:
                cur = secs[si]
                si += 1
            owner[p] = cur

        buckets: dict[str, list[tuple[int, str]]] = {}
        meta: dict[str, object] = {}
        for p in sorted(pages):
            sec = owner.get(p)
            key = sec["section_id"] if sec is not None else f"{d['doc_id']}#s-none"
            buckets.setdefault(key, []).append((p, pages[p]))
            if key not in meta:
                meta[key] = sec

        rows = []
        n = 0
        for key, plist in buckets.items():
            sec = meta[key]
            path = sec["path"] if sec is not None else "(front matter)"
            for text, p0, p1 in split_tokens(plist):
                cat = CATEGORY_RE.search(path)
                rows.append((
                    f"{d['doc_id']}#c{n:05d}", d["doc_id"],
                    key if sec is not None else None, n,
                    text, count_tokens(text), p0, p1,
                    scope_for(d, path, text),
                    f"Category {cat.group(1)}" if cat else None))
                n += 1

        con.executemany(
            "INSERT INTO chunks (chunk_id, doc_id, section_id, ordinal, text, "
            "token_count, page_start, page_end, scope_tag, category_tag) "
            "VALUES (?,?,?,?,?,?,?,?,?,?)", rows)
        total += len(rows)
        print(f"  {len(rows):>5} chunks  {d['filename'][:56]}")

    con.commit()
    stats = con.execute(
        "SELECT COUNT(*) n, AVG(token_count) avg, MIN(token_count) mn, "
        "MAX(token_count) mx FROM chunks").fetchone()
    tagged = con.execute(
        "SELECT COUNT(*) FROM chunks WHERE scope_tag IS NOT NULL").fetchone()[0]
    cats = con.execute(
        "SELECT COUNT(*) FROM chunks WHERE category_tag IS NOT NULL").fetchone()[0]
    print()
    print(f"{stats['n']} chunks | avg {stats['avg']:.0f} tokens "
          f"(min {stats['mn']}, max {stats['mx']})")
    print(f"{tagged} carry a scope tag, {cats} carry a scope 3 category tag")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
