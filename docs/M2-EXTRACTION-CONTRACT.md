  # M2 — Extraction Contract

  What the model is allowed to produce from retrieved evidence, and what is
  mechanically checked before a human ever sees it.

  **Status:** contract only. No extraction code written.

  **Provider:** Groq (OpenAI-compatible API, open-weight models). Key read from
  `GROQ_API_KEY` — never committed, never hardcoded.

  ---

  ## 1. The authority boundary

  The model is a **methodology analyst**, not a policy-maker. It reads passages
  M1 retrieved and reports what they say. It does not decide what our engine does.

  | M2 may produce | M2 may **not** produce |
  | --- | --- |
  | The method a passage describes | A priority integer |
  | The inputs the passage names as required | Whether we adopt the method |
  | Ordering *relations* the passage states ("X if Y not feasible") | The resolved rule order |
  | The applicability conditions stated | A data-quality tier for our tables |
  | A verbatim quote supporting each claim | Anything not present in the passage |
  | `insufficient_evidence` | A guess to fill a required field |

  Priority is the clearest case. The Scope 3 Guidance says spend-based applies
  *"if the supplier-specific method, hybrid method, and average-data method are
  not feasible"*. That is a **relation between methods**, and M2 records it as
  such. Turning four relations into the integers `1,2,3,4` is M3's job, because
  that is where the accountability sits.

  ---

  ## 2. Four things the corpus forced into the schema

  These are not hypotheticals. Each was found by reading real retrieved passages.

  ### 2.1 Not every method set is first-match

  Scope 2 Guidance §7.2, verbatim: *"This Guidance requires that companies
  calculate scope 2 in two ways."* Both figures are reported. A schema that only
  expresses "first satisfied rule wins" cannot represent this, and would silently
  turn a dual-reporting requirement into a single answer.

  IPCC is different again — Tier 1/2/3 is selected by data availability against
  a published decision tree, not by our priority order.

  So `selection_semantics` is a required, first-class field:

  | Value | Meaning |
  | --- | --- |
  | `first_match` | Ordered fallback; the best feasible method is used |
  | `multi_applicable` | More than one method applies **and all must be reported** |
  | `tier_selection` | Chosen against a published decision tree (IPCC tiers) |
  | `conditional` | Applies only when a stated condition holds |
  | `unclear` | The passage does not establish which |

  ### 2.2 Some passages exist to say nothing changed

  `19R_V2_2_Ch02_Stationary_Combustion` contains the phrase **"No refinement"
  13 times**: §2.3.1 Choice of method — *No refinement.* An extractor asked to
  find a method there will invent one. So `outcome: "no_change"` is a valid,
  expected result, and the prompt names it explicitly.

  That document also warns: *"Users are expected to go to Mapping Tables in Annex
  2, before reading this chapter."* Any extraction from it is therefore marked
  `requires_external_mapping: true`.

  ### 2.3 One corpus document is a draft

  All 87 pages of `GHG Protocol Scope 2 Guidance.pdf` carry **"DRAFT FOR PUBLIC
  COMMENT", March 2014**. The final Guidance was published January 2015. It is
  registered as provisional, retrieval flags it, and every extraction inheriting
  from it is `provisional: true` and **blocked from approval in M3** until the
  final text is supplied.

  This matters more than it sounds: three of the ten methods we set out to
  evidence (`MKT_BASED` among them) depend on this document.

  ### 2.4 Document vocabulary is not our vocabulary

  The passage says *"distance travelled by mode of transport"*. Our table says
  `requires: ['distance','mode']`. Forcing the model to emit our field ids would
  hide every input it cannot map.

  So inputs are captured **twice**:

  - `inputs_verbatim` — the document's own words, always populated
  - `inputs_mapped` — ids from the closed `FIELDS` vocabulary, `null` per item where no confident mapping exists

  An unmapped input is a **finding**, not an error — it usually means our field
  dictionary is missing something. The "hybrid method" named in Category 1, which
  we have no methodology for at all, was discovered exactly this way.

  ---

  ## 3. The record

  One record per (method × category × source passage set).

  ```jsonc
  {
    "outcome": "extracted",          // extracted | no_change | insufficient_evidence
    "activity_category": "Category 1: Purchased Goods and Services",
    "method_name_verbatim": "Spend-based method",
    "method_description": "…as the passage states it…",

    "selection_semantics": "first_match",
    "ordering_relations": [
      { "type": "fallback_of",
        "other_method_verbatim": "average-data method",
        "condition_verbatim": "if the supplier-specific method, hybrid method, and average-data method are not feasible" }
    ],

    "inputs_verbatim": ["economic value of purchased goods and services"],
    "inputs_mapped":   [{ "verbatim": "economic value of purchased goods and services",
                          "field_id": "spend", "confident": true }],
    "optional_inputs_verbatim": [],
    "applicability_conditions": ["due to data limitations"],

    "data_quality_signal_verbatim": null,   // only if the passage says it
    "requires_external_mapping": false,

    "evidence": {
      "quote": "If the supplier-specific method, hybrid method, and average-data method are not feasible (e.g., due to data limitations), companies should apply the average spend-based method",
      "chunk_id": "scope3-calculation-guidance-0#c00xxx",
      "document": "Technical Guidance for Calculating Scope 3 Emissions",
      "edition": "Version 1.0",
      "year": 2013,
      "section": "Category 1: Purchased Goods and Services",
      "pages": "p33",
      "provisional": false
    },

    "extractor": { "model": "…", "prompt_version": "m2-v1", "run_id": "…" }
  }
  ```

  Note what is absent: no `priority`, no `tier`, no `confidence` score from the
  model, no mapping to our `METHODOLOGIES` codes. Those are M3 decisions.

  ---

  ## 4. Validation — before a human sees anything

  Five checks, all mechanical. A record failing any of the first three is
  **rejected, not shown**. This is the layer that makes extraction safe.

  | # | Check | On failure |
  | --- | --- | --- |
  | V1 | **Quote verification.** `evidence.quote`, normalised for whitespace, must appear verbatim in the cited `chunk_id` | Reject — the model paraphrased or invented |
  | V2 | **Schema conformance.** Required fields present, enums in range | Reject |
  | V3 | **Citation integrity.** `chunk_id` exists; document, edition, pages match the store, not the model's memory | Reject and overwrite from the store |
  | V4 | **Vocabulary check.** Every `field_id` exists in `FIELDS` | Set `confident: false`, flag for review |
  | V5 | **Provisional inheritance.** `provisional` copied from the store, never from the model | Overwrite |

  **V1 is the important one.** It converts "did the model hallucinate?" from a
  judgement call into a string comparison. Anything the model asserts must be
  findable in the text it was given, or the record does not exist. That is the
  same principle the runtime engine already runs on — no silent defaults — applied
  to extraction.

  ### Confidence is computed, not asked

  We will not ask the model how confident it is; self-reported confidence from an
  LLM is close to noise. Confidence is derived from signals we can check:

  - quote verifies exactly (V1) — required, not a bonus
  - every input mapped to a known field (V4)
  - corroborated by more than one retrieved chunk
  - source is not provisional
  - `selection_semantics` is not `unclear`

  Reported as `high` / `medium` / `low` with the contributing signals listed, so a
  reviewer sees *why*.

  ---

  ## 5. Prompt shape

  - **One method per call.** Batching invites the model to blur two methods together.
  - **Passages supplied with ids.** The model must cite the `chunk_id` it used.
  - **Structured output enforced** via the API's JSON-schema mode, so malformed
    records fail at the API rather than in our parser.
  - **`insufficient_evidence` is an explicitly encouraged answer.** The prompt
    states that returning it is correct behaviour, not failure. Most extraction
    systems fail because the model is implicitly rewarded for always producing
    something.
  - **No outside knowledge.** The model is told its own knowledge of the GHG
    Protocol is inadmissible; only the supplied passages count. V1 enforces it.

  ---

  ## 6. What M2 outputs, and where it stops

  `knowledge/candidates/*.json` — validated candidate records, plus a rejection
  log with the reason each discarded record failed.

  M2 writes **nothing** to `assets/decision-tables.js`. It does not rank, adopt,
  or reconcile against existing rules. Reconciliation — "the document says four
  methods, our table has three" — is M3.

  ---

  ## 7. Success criteria

  Same discipline as the M1 gate: known answers, measured.

  1. **Re-derive what we already know.** For the 21 methods already evidenced in
    `docs/METHODOLOGY-RULES.md`, M2 should extract a matching method and inputs.
    Disagreements are investigated — they may be our error, not the extractor's.
  2. **Close the ten gaps** with quote-verified citations.
  3. **Zero V1 failures reaching output.** Any hallucination must be caught by
    quote verification, never by a reviewer.
  4. **Find the known unknowns.** The Category 1 "hybrid method" is absent from
    our tables. If M2 does not surface it, recall is too low.

  ---

  ## 8. Open questions for you

  **Q1 — Which Groq model?** Extraction is structured, high-volume and needs
  strong instruction-following rather than deep reasoning. I would run a bake-off
  on ~10 passages before committing, since this is measurable rather than a
  matter of opinion.

  **Q2 — Should M2 propose a mapping to our `METHODOLOGIES` codes?** My
  recommendation is **no** for v1: emit `method_name_verbatim` and let M3 map it.
  Mapping is where a wrong guess becomes an authoritative-looking code.

  **Q3 — Get the final Scope 2 Guidance (2015).** Three of the ten target methods
  depend on a document we only hold as a March 2014 draft. Worth sourcing before
  M2 runs, or those three stay provisional whatever we do.
