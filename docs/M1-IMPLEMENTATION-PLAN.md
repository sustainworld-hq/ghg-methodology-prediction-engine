# M1 — Document Intelligence: Implementation Plan

Turning 24 methodology PDFs into a searchable, citable knowledge base.

**Status:** plan only. Nothing built. The deterministic engine is not touched.

---

## 1. Scope

**M1 delivers:** documents → text → structure → chunks → embeddings → a search
interface that returns passages *with citations you can put in a rule*.

**M1 does not deliver:** rule extraction, LLM calls, candidate rules, approval
workflow, or any change to `assets/decision-tables.js`. Those are M2 and M3.

The test of M1 is narrow and objective: **can it find the passage that would
settle one of the ten methods we currently cannot evidence?** If retrieval can't
do that reliably, M2 has nothing to extract from and building it is premature.

---

## 2. What is actually in the corpus

Measured, not assumed — 24 PDFs, 1,456 pages, 4.16M characters (~1.04M tokens).
**Every file is a true text PDF.** No OCR needed anywhere, which removes the
single largest risk from a document pipeline.

### GHG Protocol — 6 files (1 duplicate)

| File | Pages | Note |
| --- | --- | --- |
| `ghg-protocol-revised.pdf` | 116 | Corporate Standard (2004). Already analysed |
| `ghg-protocol-revised (1).pdf` | 116 | **Exact duplicate** (same MD5) — drop |
| `Corporate-Value-Chain-Accounting-Reporing-Standard_041613_2.pdf` | 152 | Scope 3 Standard (2011) — the 15 categories |
| `Scope3_Calculation_Guidance_0.pdf` | 182 | Scope 3 Technical Guidance — **the single most valuable file** |
| `GHG Protocol Scope 2 Guidance.pdf` | 87 | Location/market-based, dual reporting |
| `Simplified_Guide_GHG_Management_Organizations.pdf` | 20 | Introductory |

### IPCC 2006 Guidelines — 8 chapters

`V1_3_Ch3_Uncertainties`, `V1_4_Ch4_MethodChoice`, `V1_5_Ch5_Timeseries`,
`V1_6_Ch6_QA_QC`, `V1_8_Ch8_Reporting_Guidance`, `V2_2_Ch2_Stationary_Combustion`,
`V2_3_Ch3_Mobile_Combustion`, `V2_4_Ch4_Fugitive_Emissions`, `V2_5_Ch5_CCS`.

`V1_4_Ch4_MethodChoice` matters disproportionately — it is the source of the
Tier 1/2/3 decision trees, i.e. the *original* formal statement of the
"most accurate method available" principle our engine implements.

### IPCC 2019 Refinement — 7 chapters

`19R_V1_Ch02_DataCollection` … `19R_V1_Ch07_Precursors_Indirect`,
plus `19R_V2_2_Ch02_Stationary_Combustion`.

### Other publishers — 2 files

| File | Pages | Note |
| --- | --- | --- |
| `2026-GHG-conversion-factors-methodology-report.pdf` | 152 | DEFRA methodology |
| `ghg-emission-factors-hub-2025.pdf` | 5 | EPA. 14,329 chars/page — dense **factor tables, not prose** |

### Four findings that shape the design

**F1 — The corpus closes our evidence gap.** All ten methods flagged as
unevidenced in `docs/METHODOLOGY-RULES.md` have their governing document here.
That makes the gap list a ready-made evaluation set (§6).

**F2 — Editions collide, and not cleanly.** `19R_V1_Ch04_MethodChoice` (32pp)
and `V1_4_Ch4_MethodChoice` (30pp) are the same chapter in two editions. But
`19R_V2_2_Ch02_Stationary_Combustion` is **5 pages against the 2006 edition's
47** — it is a partial amendment, not a replacement. So supersession is
**per-section, never per-document**. A pipeline that assumes "2019 replaces
2006" would silently hide most of the stationary combustion guidance.

**F3 — One file is not prose.** The EPA factors hub is tabular factor data. It
belongs to the emission-factor module, not methodology rules. Including it in a
prose-tuned chunker would produce garbage chunks. Recommend excluding from M1
(see open question Q4).

**F4 — The corpus is small.** ~2,000 chunks expected. This is decisively *not*
a scale problem, which means we should spend the effort budget on **retrieval
precision and citation accuracy**, not on infrastructure.

---

## 3. Design decisions

### D1 — Structure-aware chunking, not fixed-size windows

Standards are not flowing prose. They are numbered sections, decision trees and
method tables. Blind 500-token windows would cut a method definition away from
the activity data it requires — exactly the pairing M2 needs to extract a rule.

Chunk **within** detected section boundaries; never span a heading. Carry the
section path (`Chapter 6 › 6.2 Calculating emissions › Method 1`) on every chunk.

### D2 — Hybrid retrieval: BM25 + dense, fused

Method names in this domain are *lexical*: "distance-based", "tonne-kilometre",
"average-data method", "supplier-specific method". Dense embeddings blur exactly
those distinctions; a query for "spend-based method" will happily return
passages about "average-data method" because they are semantically adjacent.

BM25 catches the exact phrase. Dense catches the paraphrase. Fuse with Reciprocal
Rank Fusion. This is the single highest-leverage quality decision in M1.

### D3 — Local embeddings, no API

`sentence-transformers` + `torch 2.9 (CPU)` + `faiss` are already installed.
`BAAI/bge-small-en-v1.5` (~130MB, 384-dim) downloads once from HuggingFace
(reachable, verified) and then runs offline.

This makes M1 **free, offline, reproducible, and free of the provider question**
that M2 must answer. ~2,000 chunks on CPU is a couple of minutes.

### D4 — SQLite + FAISS, not a vector database service

At 2,000 chunks a vector DB is pure operational overhead. SQLite holds documents,
sections, chunks and metadata; FAISS holds a flat index (exact search — no
approximation error to debug). Both are files, both are diffable in behaviour,
both work with zero services running.

### D5 — Python pipeline, JSON handoff

The runtime app stays browser JavaScript. M1 is Python because that is where the
libraries are. The two never share a process — M2/M3 will emit **JSON rule
candidates** that a human approves before anything reaches `decision-tables.js`.

### D6 — Editions and supersession are first-class

Every document row carries `publisher`, `edition`, `year`, `supersedes`. Every
retrieved passage reports its edition. Following F2, supersession is recorded
**per section**, and a passage from a superseded section is flagged, not deleted
— an auditor may need to know what the 2006 text said.

---

## 4. Data model

```sql
documents(
  doc_id, filename, sha256, publisher, title, edition, year,
  page_count, status,            -- active | duplicate | superseded
  supersedes_doc_id
)

sections(
  section_id, doc_id, path,      -- "Chapter 6 › 6.2 › Method 1"
  heading, level, page_start, page_end,
  superseded_by_section_id       -- per-section, per F2
)

chunks(
  chunk_id, doc_id, section_id, ordinal,
  text, token_count, page_start, page_end,
  scope_tag,                     -- scope1 | scope2 | scope3 | cross | null
  category_tag                   -- "Category 6" etc. where determinable
)
```

FAISS index maps `row_id → chunk_id`. A retrieval result is therefore always
citable as *document + edition + section path + page range* — which is precisely
the shape `METHODOLOGY_SOURCES` already expects.

---

## 5. Pipeline stages

| Stage | Does | Output |
| --- | --- | --- |
| **1.1 Register** | Hash, dedupe, classify publisher/edition | `documents` rows; the known duplicate dropped |
| **1.2 Extract** | PyMuPDF text with page and font-size spans | Raw text + layout per page |
| **1.3 Segment** | Detect headings from font size/weight and numbering; build section tree | `sections` rows |
| **1.4 Chunk** | ~700 tokens, 100 overlap, never crossing a heading | `chunks` rows |
| **1.5 Tag** | Scope/category tags by keyword and section path | `scope_tag`, `category_tag` |
| **1.6 Embed** | `bge-small-en-v1.5`, batched, CPU | FAISS flat index |
| **1.7 Retrieve** | BM25 + dense, RRF fusion, edition-aware filter | Ranked passages with citations |
| **1.8 Evaluate** | Run the gold set, report recall | Pass/fail against §6 |

Stage 1.3 is the one carrying real risk — heading detection across four
publishers' typography. Mitigation: a per-publisher heading profile, and stage
1.3 emits a section-tree dump for eyeball review before anything is embedded.

---

## 6. Acceptance criteria

M1 is done when retrieval finds the evidence for the ten methods we cannot
currently cite. Each is a query with a known-correct target document:

| # | Query | Must retrieve from |
| --- | --- | --- |
| 1 | spend-based method for purchased goods, required activity data | Scope 3 Calculation Guidance |
| 2 | EEIO / environmentally-extended input-output screening | Scope 3 Calculation Guidance |
| 3 | market-based method, contractual instruments, dual reporting | Scope 2 Guidance |
| 4 | tonne-kilometre / weight-distance method for freight | Scope 3 Calculation Guidance, Cat 4 |
| 5 | hotel nights / accommodation average-data method | Scope 3 Calculation Guidance, Cat 6 |
| 6 | use of sold products, direct use-phase energy | Scope 3 Calculation Guidance, Cat 11 |
| 7 | fuel-based method for sold products in use | Scope 3 Calculation Guidance, Cat 11 |
| 8 | processing of sold products, site-specific method | Scope 3 Calculation Guidance, Cat 10 |
| 9 | investments, investee emissions allocated by share | Scope 3 Calculation Guidance, Cat 15 |
| 10 | economic allocation by revenue for investments | Scope 3 Calculation Guidance, Cat 15 |

Plus two control queries that must **not** produce false confidence:

| # | Query | Expected |
| --- | --- | --- |
| C1 | choice of method / tier decision tree | IPCC `V1_4_Ch4_MethodChoice` — *not* a GHG Protocol file |
| C2 | operating-hours activity data | Should surface the PAS Table 8.6 family, confirming the earlier finding |

**Thresholds:** correct document in top-5 for **≥9/10**; a human reading the top-10
finds the actual method statement for **≥8/10**. Below that, fix retrieval before
starting M2 — a weak retriever guarantees a hallucinating extractor.

The eval set lives in `knowledge/eval/gold-queries.json` and runs as a script,
so retrieval changes are measured rather than argued about.

---

## 7. Deliverables

```
knowledge/
  corpus/                    # PDFs (gitignored — 29MB)
  ingest/
    01_register.py
    02_extract.py
    03_segment.py
    04_chunk.py
    05_embed.py
    run_all.py
  search.py                  # query CLI + JSON output
  eval/
    gold-queries.json
    run_eval.py
  store/                     # SQLite + FAISS (gitignored)
  README.md
requirements.txt
```

Code in git; corpus and index out of git. `run_all.py` is idempotent — re-running
after adding a PDF processes only what changed.

---

## 8. Explicitly not in M1

No LLM calls. No rule extraction. No candidate rules. No approval UI. No changes
to the engine, the decision tables, or the shipped HTML page. No emission factors.

---

## 9. Open decisions — needed from you

**Q1 — Which model provider for M2? ANSWERED: Groq.** M1 needs none. M2 will
use Groq (an OpenAI-compatible API serving open-weight models). The key must be
read from the `GROQ_API_KEY` environment variable — it is never committed, and
the key shared during this work should be rotated because it was transmitted in
plaintext.

**Q2 — Edition precedence policy. ANSWERED: (b), and now enforced in code.**
Retrieval returns every edition and labels it. Stating the policy proved not to
be enough: measured, the 5-page 2019 stationary-combustion amendment holds 5
chunks against the 2006 chapter's 56, so it first appeared at rank 14 and was
invisible to anything reading the top 5. `search()` now flags any hit whose
family has a newer edition and pulls unrepresented editions into the results.

**Q2 (original wording).** When the 2019 Refinement amends a 2006
chapter, should retrieval (a) prefer 2019 and flag 2006 as superseded, (b) return
both and let the reviewer choose, or (c) prefer whichever your reporting
programme mandates? This is a governance call, not a technical one. My
recommendation is **(b)** for M1 — surfacing both is honest, and M3's reviewer
decides.

**Q3 — Where should the corpus live?** It is currently in `Downloads`, which is
not a stable path. Recommend copying to `knowledge/corpus/` and gitignoring it.

**Q4 — Is the EPA factors hub in M1?** It is factor tables, not methodology
prose (F3). Recommend excluding it from M1 and holding it for the factor module.

---

## 10. Effort

| Stage | Rough size |
| --- | --- |
| 1.1–1.2 register + extract | small — PyMuPDF already proven on these files |
| 1.3 segment | **largest risk**, needs iteration across four typographies |
| 1.4–1.6 chunk, tag, embed | small |
| 1.7 retrieve | moderate — hybrid fusion and edition filtering |
| 1.8 eval | small, but gates everything |

Sequence: 1.1 → 1.2 → **1.3 with a review checkpoint** → 1.4–1.6 → 1.7 → 1.8.
The checkpoint after segmentation matters: if the section trees are wrong,
everything downstream inherits the error, and it is far cheaper to catch it in a
tree dump than in bad retrieval results.
