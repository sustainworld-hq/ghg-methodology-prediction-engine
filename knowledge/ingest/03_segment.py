"""Stage 1.3 — detect headings and build a section tree.

Design notes, from looking at what these documents actually do:

* Bold is a weak signal. The Scope 3 Guidance bolds body paragraphs, figure
  labels and table cells. Using bold alone produces mostly noise.
* Font size is the strong signal. Real section headings run 1.2x-3x body size
  ("Category 1: Purchased Goods and Services" is 28pt against 9.5pt body).
* Headings wrap. "Category 1:" and "Purchased Goods and Services" are two
  lines at the same size and must be merged.
* Table and figure captions are large and bold but are NOT sections.
* Calculation method names ("Spend-based method - estimates...") are bold
  *body* text inside a category section. They must stay in the section, not
  become sections themselves - that pairing is what M2 needs to read.

Writes a reviewable tree dump to knowledge/store/section-trees.txt.
"""

from __future__ import annotations

import json
import re
import sqlite3

from common import STORE, connect

SIZE_RATIO = 1.18          # heading must be at least this much bigger than body
MAX_HEADING_WORDS = 18
MIN_HEADING_CHARS = 3

# Structural numbering that marks a section even at body size.
NUMBERED = re.compile(
    r"^(?:"
    r"chapter\s+\d+"
    r"|appendix\s+[a-z0-9]"
    r"|annex\s+[a-z0-9]"
    r"|part\s+[ivx]+\b"
    r"|category\s+\d+"
    r"|\d+(?:\.\d+){0,3}\s+\S"
    r")", re.I)

# Large-and-bold, but not a section.
NOT_SECTION = re.compile(
    r"^(?:table|figure|fig\.|box|exhibit|equation|eq\.|source:|note:|notes:)\b", re.I)

# Page furniture that repeats and should never open a section.
FURNITURE = re.compile(
    r"^(?:page\s+\d+|\d+\s*$|chapter\s+\d+\s*$|"
    r"greenhouse gas protocol|ghg protocol|"
    r"2006 ipcc guidelines|volume\s+\d+|"
    r"technical guidance for calculating scope 3 emissions)\s*$", re.I)


TOC_LEADER = re.compile(r"\.{4,}")


def prose_body_size(lines: list[dict]) -> float:
    """Modal size among *prose* lines only.

    Taking the mode over every line gets this wrong on multi-column documents:
    the Scope 3 Guidance is 9.5pt dominated by table and caption text while its
    running prose is 12pt, so a naive mode makes whole paragraphs look like
    headings. Long lines are prose; measure those.
    """
    weight: dict[float, int] = {}
    for ln in lines:
        if len(ln["t"]) < 60:
            continue
        weight[ln["s"]] = weight.get(ln["s"], 0) + len(ln["t"])
    if not weight:                              # very short document
        for ln in lines:
            weight[ln["s"]] = weight.get(ln["s"], 0) + len(ln["t"])
    return max(weight, key=weight.get) if weight else 10.0


def looks_like_body(text: str, numbered: bool) -> bool:
    """Sentence-shaped or wrapped text is not a heading, however it is styled."""
    words = text.split()
    cap = MAX_HEADING_WORDS if numbered else 12
    if len(words) > cap:
        return True
    if text.endswith("-"):                      # hyphenated line wrap
        return True
    if text[:1].islower():                      # continuation of a sentence
        return True
    if TOC_LEADER.search(text):                 # table-of-contents dot leaders
        return True
    # a bolded lead-in like "Spend-based method - estimates emissions for ..."
    if re.search(r" [-–—] ", text):
        head = re.split(r" [-–—] ", text, maxsplit=1)[0]
        if len(words) > 8 and len(head.split()) <= 4:
            return True
    return False


def candidates(doc_id: str, con: sqlite3.Connection, body: float) -> list[dict]:
    """Heading candidates in reading order, wrapped lines already merged."""
    rows = con.execute(
        "SELECT page_no, spans FROM pages WHERE doc_id=? AND page_no>0 "
        "ORDER BY page_no", (doc_id,)).fetchall()

    # Text that repeats across many pages is running header/footer furniture,
    # whatever its typography. Frequency catches what a regex list cannot.
    freq: dict[str, int] = {}
    for r in rows:
        for t in {ln["t"].strip() for ln in json.loads(r["spans"])}:
            freq[t] = freq.get(t, 0) + 1
    repeat_limit = max(3, int(len(rows) * 0.15))

    hits: list[dict] = []
    for r in rows:
        page = r["page_no"]
        lines = json.loads(r["spans"])
        for ln in lines:
            text = ln["t"].strip()
            if len(text) < MIN_HEADING_CHARS:
                continue
            if freq.get(text, 0) > repeat_limit:
                continue
            if FURNITURE.match(text) or NOT_SECTION.match(text):
                continue
            big = ln["s"] >= body * SIZE_RATIO
            numbered = bool(NUMBERED.match(text))
            if not (big or (numbered and (ln["b"] or ln["s"] >= body))):
                continue
            if looks_like_body(text, numbered):
                continue
            if not re.search(r"[A-Za-z]", text):
                continue
            hits.append({"page": page, "size": ln["s"], "bold": ln["b"],
                         "y": ln["y"], "x": ln["x"], "text": text,
                         "numbered": numbered})

    # merge consecutive candidates that are the same size on the same page and
    # vertically adjacent - a wrapped heading
    merged: list[dict] = []
    for h in hits:
        if merged:
            p = merged[-1]
            same = (p["page"] == h["page"] and abs(p["size"] - h["size"]) < 0.2
                    and 0 <= h["y"] - p["y"] <= p["size"] * 2.2)
            if same and len(p["text"].split()) + len(h["text"].split()) <= MAX_HEADING_WORDS:
                p["text"] = (p["text"].rstrip(":") + ": " if p["text"].endswith(":")
                             else p["text"] + " ") + h["text"]
                p["y"] = h["y"]
                continue
        merged.append(dict(h))
    return merged


def assign_levels(hits: list[dict]) -> None:
    """Bigger type means a higher-level heading; numbering depth refines it."""
    sizes = sorted({h["size"] for h in hits}, reverse=True)
    rank = {s: i for i, s in enumerate(sizes)}
    for h in hits:
        lvl = rank[h["size"]]
        m = re.match(r"^(\d+(?:\.\d+)*)", h["text"])
        if m:
            lvl = max(lvl, m.group(1).count(".") )
        h["level"] = min(lvl, 5)


def main() -> int:
    con = connect()
    docs = con.execute(
        "SELECT doc_id, filename, title, publisher, page_count FROM documents "
        "WHERE status='active' ORDER BY publisher, filename").fetchall()

    con.execute("DELETE FROM sections")
    report = []
    total_sections = 0

    for d in docs:
        all_lines = []
        for r in con.execute("SELECT spans FROM pages WHERE doc_id=? AND page_no>0",
                             (d["doc_id"],)):
            all_lines.extend(json.loads(r["spans"]))
        body = prose_body_size(all_lines)

        hits = candidates(d["doc_id"], con, body)
        assign_levels(hits)

        # page text lengths, to size each section
        plen = {r["page_no"]: len(r["text"] or "")
                for r in con.execute("SELECT page_no, text FROM pages "
                                     "WHERE doc_id=? AND page_no>0", (d["doc_id"],))}

        rows = []
        stack: list[tuple[int, str]] = []
        for i, h in enumerate(hits):
            end = hits[i + 1]["page"] if i + 1 < len(hits) else d["page_count"]
            while stack and stack[-1][0] >= h["level"]:
                stack.pop()
            path = " > ".join([s[1] for s in stack] + [h["text"]])
            stack.append((h["level"], h["text"]))
            chars = sum(plen.get(p, 0) for p in range(h["page"], max(end, h["page"]) + 1))
            rows.append((f"{d['doc_id']}#s{i:04d}", d["doc_id"], i, path,
                         h["text"], h["level"], h["page"], end, chars))

        con.executemany(
            "INSERT INTO sections (section_id, doc_id, ordinal, path, heading, "
            "level, page_start, page_end, char_count) VALUES (?,?,?,?,?,?,?,?,?)", rows)
        total_sections += len(rows)

        per_page = len(rows) / max(d["page_count"], 1)
        flag = "  <-- CHECK" if per_page > 4 or len(rows) < 3 else ""
        report.append(f"{d['filename']}  [{d['publisher']}]  body {body}pt  "
                      f"{len(rows)} sections over {d['page_count']}pp "
                      f"({per_page:.1f}/page){flag}")
        for r in rows[:400]:
            report.append(f"    p{r[6]:>4}  L{r[5]}  {'  ' * r[5]}{r[4][:88]}")
        report.append("")

    con.commit()

    out = STORE / "section-trees.txt"
    out.write_text("\n".join(report), encoding="utf-8")

    print(f"Built {total_sections} sections across {len(docs)} documents")
    print(f"Tree dump written to {out}")
    print()
    for d in docs:
        n = con.execute("SELECT COUNT(*) FROM sections WHERE doc_id=?",
                        (d["doc_id"],)).fetchone()[0]
        pp = n / max(d["page_count"], 1)
        flag = " <-- CHECK" if pp > 4 or n < 3 else ""
        print(f"  {n:>5} sections  {pp:>5.2f}/pp  {d['filename'][:52]}{flag}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
