"""Stage 1.2 — extract text and layout.

Two outputs per page: the plain text, and a compact line-level record of font
metrics. Stage 1.3 needs the metrics to tell a heading from a sentence, and
keeping them here means segmentation can be re-tuned without re-opening a
single PDF.

Duplicates are skipped — they carry no information the canonical copy lacks.
"""

from __future__ import annotations

import fitz

from common import CORPUS, connect, jdump

# Lines longer than this are certainly body text; storing their metrics is waste.
MAX_HEADING_CHARS = 130


def line_records(page) -> list[dict]:
    """One record per line: text, max font size, bold flag, x-offset."""
    out = []
    data = page.get_text("dict")
    for block in data.get("blocks", []):
        if block.get("type") != 0:          # 0 = text
            continue
        for line in block.get("lines", []):
            spans = line.get("spans", [])
            if not spans:
                continue
            text = "".join(s.get("text", "") for s in spans).strip()
            if not text or len(text) > MAX_HEADING_CHARS:
                continue
            size = max(round(s.get("size", 0), 1) for s in spans)
            # PyMuPDF flags: bit 4 (16) = bold
            bold = any(int(s.get("flags", 0)) & 16 for s in spans)
            font = spans[0].get("font", "")
            x0 = round(line["bbox"][0], 1)
            y0 = round(line["bbox"][1], 1)
            out.append({"t": text, "s": size, "b": int(bold),
                        "f": font, "x": x0, "y": y0})
    return out


def body_size(all_lines: list[dict]) -> float:
    """Modal font size weighted by characters — the document's body text size."""
    weight: dict[float, int] = {}
    for ln in all_lines:
        weight[ln["s"]] = weight.get(ln["s"], 0) + len(ln["t"])
    return max(weight, key=weight.get) if weight else 10.0


def main() -> int:
    con = connect()
    docs = con.execute(
        "SELECT doc_id, filename, page_count FROM documents "
        "WHERE status='active' ORDER BY filename").fetchall()

    con.execute("DELETE FROM pages")
    total_pages = total_lines = 0

    for d in docs:
        path = CORPUS / d["filename"]
        rows = []
        collected: list[dict] = []
        with fitz.open(path) as doc:
            for i, page in enumerate(doc, start=1):
                text = page.get_text("text")
                lines = line_records(page)
                collected.extend(lines)
                rows.append((d["doc_id"], i, text, jdump(lines)))
        bsize = body_size(collected)
        con.executemany(
            "INSERT INTO pages (doc_id, page_no, text, spans) VALUES (?,?,?,?)", rows)
        # stash the body size on the document for stage 1.3
        con.execute("UPDATE documents SET char_count=? WHERE doc_id=?",
                    (sum(len(r[2]) for r in rows), d["doc_id"]))
        con.execute(
            "INSERT OR REPLACE INTO pages (doc_id, page_no, text, spans) "
            "VALUES (?,?,?,?)", (d["doc_id"], 0, "", jdump({"body_size": bsize})))
        total_pages += len(rows)
        total_lines += len(collected)
        print(f"  {len(rows):>4}pp  body~{bsize:>4.1f}pt  {len(collected):>5} lines  {d['filename'][:52]}")

    con.commit()
    print()
    print(f"Extracted {total_pages} pages from {len(docs)} documents, "
          f"{total_lines} candidate heading lines retained")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
