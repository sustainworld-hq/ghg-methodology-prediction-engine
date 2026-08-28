# M1 — Document Intelligence

Turns the methodology corpus into a searchable, citable knowledge base.

**This module makes no LLM calls.** It is the retrieval foundation that M2
(rule extraction) will read from. Nothing here touches the deterministic engine
or the decision tables.

---

## Run it

```bash
pip install -r ../requirements.txt

python ingest/run_all.py                       # full rebuild
python ingest/run_all.py --only 3              # re-run one stage while tuning

python search.py "spend-based method for purchased goods"
python search.py --json --k 10 "market-based dual reporting"
python search.py --publisher IPCC "choice of method decision tree"

python eval/run_eval.py                        # the M1 gate
python eval/run_eval.py --compare              # hybrid vs lexical vs dense
```

After the first run everything is local. Set `HF_HUB_OFFLINE=1` to stop
sentence-transformers checking HuggingFace for updates on every load.

---

## Pipeline

| Stage | Script | Does |
| --- | --- | --- |
| 1.1 | `01_register.py` | Hash, dedupe, attach publisher/edition from the explicit registry |
| 1.2 | `02_extract.py` | PyMuPDF text plus line-level font metrics per page |
| 1.3 | `03_segment.py` | Detect headings, build section trees |
| 1.4 | `04_chunk.py` | Chunk within sections; tag scope and Scope 3 category |
| 1.5/1.6 | `05_embed.py` | BM25 index and FAISS dense index |
| 1.7 | `search.py` | Hybrid retrieval with citations |
| 1.8 | `eval/run_eval.py` | Measure against the gold set |

**Review stage 1.3 by eye.** `store/section-trees.txt` is the dump. If the
section trees are wrong, every chunk, citation and retrieval result inherits
the error, and it is far cheaper to spot here.

---

## Design decisions worth knowing

**Headings are detected by font size, not bold.** These documents bold body
paragraphs, figure labels and table cells; bold alone is mostly noise. Real
headings run 1.2×–3× body size.

**Body size is measured from prose lines only** (longer than 60 characters).
Taking the mode over all lines gets multi-column documents wrong: the Scope 3
Guidance is 9.5pt dominated by table text while its running prose is 12pt, and
a naive mode turned whole paragraphs into "sections".

**Running headers are removed by frequency,** not by a regex list. Any
candidate appearing on more than 15% of pages is page furniture.

**Chunks never cross a section boundary.** A method definition and the activity
data it requires live in the same section. Splitting them would leave M2
extracting a rule with no inputs.

**Retrieval is hybrid.** Method names here are lexical — "tonne-kilometre",
"spend-based method", "environmentally-extended input-output" — and dense
vectors blur exactly those distinctions. BM25 catches the phrase, embeddings
catch the paraphrase, Reciprocal Rank Fusion combines them. `--compare` in the
eval shows what each contributes.

**Editions are modelled per section, not per document.** The IPCC 2019
Refinement does not replace the 2006 Guidelines: the refined stationary
combustion chapter is 5 pages against the 2006 edition's 47. Retrieval returns
both and reports the edition; a reviewer decides.

---

## What a result looks like

```json
{
  "publisher": "GHG Protocol",
  "document": "Technical Guidance for Calculating Scope 3 Emissions",
  "edition": "Version 1.0",
  "year": 2013,
  "section": "Category 6: Business Travel > Calculating emissions",
  "pages": "pp81-82",
  "category": "Category 6",
  "found_by": "both",
  "text": "..."
}
```

Publisher, document, edition, section and page range — the exact shape
`METHODOLOGY_SOURCES` in `assets/decision-tables.js` already expects, so an
extracted rule can carry a citation a reviewer can check.

---

## The gate

`eval/gold-queries.json` holds ten queries whose correct answer we already know:
the ten methods `docs/METHODOLOGY-RULES.md` records as unevidenced. Plus two
controls — one that must return IPCC rather than GHG Protocol, guarding against
the assumption that every methodology question is a GHG Protocol question.

M1 passes when the correct document is in the top 5 for at least 9 of 10, and
both controls pass. **Do not start M2 before this passes.** A weak retriever
guarantees a hallucinating extractor.

---

## Store

`store/` (gitignored) holds `knowledge.db` (SQLite: documents, pages, sections,
chunks), `bm25.pkl`, `dense.faiss`, `dense_ids.npy`, and the reviewable
`section-trees.txt`. `corpus/` (gitignored) holds the PDFs.

The EPA emission-factors hub is deliberately excluded: it is factor tables, not
methodology prose, and belongs to the factor module.
