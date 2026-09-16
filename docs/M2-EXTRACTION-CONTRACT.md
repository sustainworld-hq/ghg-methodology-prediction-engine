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

  ### 2.1 Not every method set is first-match — and one field could not say so

Scope 2 Guidance requires dual reporting: **both** figures. IPCC selects a tier
against a published decision tree. Neither is "first satisfied rule wins".

The first version of this contract used a single `selection_semantics` field
with values `first_match | multi_applicable | tier_selection | conditional |
unclear`. **That field was unlabellable, and the first bake-off proved it.**
Consider two real passages:

> **A.** *"If the supplier-specific method, hybrid method, and average-data
> method are not feasible (e.g., due to data limitations), companies should
> apply the average spend-based method"*
> — Scope 3 Technical Guidance p.33

> **B.** *"Companies shall ensure that any contractual instruments used in the
> market-based method total meet the Scope 2 Quality Criteria"*
> — Scope 2 Guidance p.62

Both are "if X then Y". `first_match` and `conditional` were each defensible
for both. When the model answered `conditional`, we could not tell whether the
model was wrong or the contract was vague — which makes the benchmark
worthless.

The cause was that one field was answering **two independent questions**. They
are now two fields.

#### `applies_count` — how many methods does the reporter end up using?

| Value | Meaning |
| --- | --- |
| `one_of` | A single method is used for this activity |
| `all_of` | More than one applies and **all** results are required |
| `unstated` | The passage does not say |

#### `selection_basis` — what decides which one?

| Value | Meaning |
| --- | --- |
| `other_method_availability` | Turns on whether another **named calculation method** is feasible |
| `published_decision_tree` | Defers to a decision tree, figure or tier procedure |
| `activity_condition` | A condition about data, instruments, activity or circumstances — **not** another method |
| `unstated` | No basis given |

#### The procedure, applied in order

**`selection_basis`** — first match wins:

1. Does this method's use depend on another **named calculation method** being unavailable or infeasible? → `other_method_availability`
2. Does the passage point to a decision tree, figure or tier-selection procedure? → `published_decision_tree`
3. Does it state a condition that is **not** about another calculation method? → `activity_condition`
4. Otherwise → `unstated`

**`applies_count`** — first match wins:

1. More than one method's result required for the same activity? → `all_of`
2. A single method is applied? → `one_of`
3. Silent → `unstated`

The single question separating rules 1 and 3 is: **is the thing named in the
condition a calculation method?** That is checkable, so grader and model apply
it identically. Passage A names three methods → rule 1. Passage B names
contractual instruments → rule 3.

Under the two fields, the four shapes come out cleanly and without overlap:

| Passage | `applies_count` | `selection_basis` |
| --- | --- | --- |
| A — spend-based fallback | `one_of` | `other_method_availability` |
| B — instrument quality criteria | `one_of` | `activity_condition` |
| C — IPCC tier decision tree | `one_of` | `published_decision_tree` |
| D — Scope 2 dual reporting | `all_of` | `unstated` |

Agreed labels for real passages live in `knowledge/m2/semantics-gold.json`,
written **before** any model is run. A model may only be graded against labels
that already existed.

#### Ordering relations are directional

`fallback_of | preferred_over | alternative_to` had the same overlap problem —
the first two describe one relation seen from either end. One direction only:

| Value | Meaning |
| --- | --- |
| `ranks_below` | The named method is used **instead of this one** when feasible |
| `ranks_above` | This method is used **instead of the named one** when feasible |
| `no_stated_order` | Both offered, no preference stated |

Always expressed from the extracted method's point of view. M3 turns a set of
`ranks_below` relations into the integers the engine needs.

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

    "applies_count": "one_of",
    "selection_basis": "other_method_availability",
    "ordering_relations": [
      { "relation": "ranks_below",
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
  - `applies_count` and `selection_basis` are not both `unstated`

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
