# Methodology Prediction — Enterprise Architecture

Target: a core service that answers *"which calculation method applies to this
activity?"* for **10,000+ records in a single call**, reproducibly, with an
audit trail that survives a 2029 review of a 2026 decision.

**Status:** specification. The prototype in this repo implements parts of it and
violates others; §10 says exactly which.

---

## 1. The governing principle

> Use AI to help **understand** the standards.
> Use governed, versioned rules to **decide**.
> Use deterministic code to **execute**.

A model must never be in the request path of a production prediction. Not
because models are bad at reading standards — the extraction results show they
are quite good — but because a prediction that depends on a model call is not
reproducible, not auditable, and not fast enough at 10k records.

---

## 2. Three planes, separated by hard boundaries

```
  AUTHORING PLANE                 offline, LLM-assisted, slow, fallible
  ─────────────────
  standards → parse → retrieve → extract → validate
                                              │
                                     candidate rules
                                              │
  ════════════════ approval gate ═════════════╪══════════════════════
                                              │
  GOVERNANCE PLANE                human decision, versioned, immutable
  ────────────────                            │
                              reviewed · mapped · ranked · published
                                              │
                                    RULESET vYYYY.MM.DD
                                              │
  ════════════════ publish boundary ══════════╪══════════════════════
                                              │
  EXECUTION PLANE                 online, pure, deterministic, fast
  ───────────────                             │
  activity records ─────────────────────────► evaluator ──► decisions
                                                              + audit
```

**The boundaries are enforced, not conventional.** The execution service has no
network access to a model provider, no PDF parser, no vector index, and no
write access to the ruleset. It can only read a published, immutable snapshot.
If it *cannot* call a model, it cannot accidentally start doing so.

---

## 3. The ruleset is the source of truth

Not the PDFs, not the vector index, not the model. A relational table, versioned
and immutable once published.

```sql
CREATE TABLE methodology_rule (
  rule_id             TEXT PRIMARY KEY,      -- PGS_SPEND_001
  ruleset_version     TEXT NOT NULL,         -- 2026.09.01
  framework           TEXT NOT NULL,         -- GHG_PROTOCOL | ISO_14064 | DEFRA
  category            TEXT NOT NULL,         -- PURCHASED_GOODS_SERVICES
  methodology         TEXT NOT NULL,         -- SPEND_BASED

  -- APPLICABILITY: can this method be used at all?
  required_inputs     JSONB NOT NULL,        -- ["spend","currency"]
  optional_inputs     JSONB DEFAULT '[]',
  preconditions       JSONB DEFAULT '[]',    -- structured, evaluable

  -- PREFERENCE: should it be used, given alternatives? SEPARATE. See §4.
  preference_rank     INTEGER,               -- NULL = standard states none
  preference_basis    TEXT,                  -- EXPLICIT_STANDARD_GUIDANCE
                                             -- | ORGANISATION_POLICY | NONE
  preference_evidence TEXT,                  -- the sentence establishing it

  -- PROVENANCE: part of the rule, not a footnote
  source_document     TEXT NOT NULL,
  source_edition      TEXT NOT NULL,
  source_year         INTEGER NOT NULL,
  source_page         TEXT NOT NULL,
  source_chunk_id     TEXT,
  evidence_quote      TEXT NOT NULL,

  -- GOVERNANCE
  status              TEXT NOT NULL,         -- DRAFT|APPROVED|SUPERSEDED|WITHDRAWN
  approved_by         TEXT,
  approved_at         TIMESTAMPTZ,
  supersedes_rule_id  TEXT,

  -- how it was produced, for reconstruction
  extraction_model    TEXT,
  extraction_prompt   TEXT,
  extraction_schema   TEXT,

  CONSTRAINT approved_needs_signoff
    CHECK (status <> 'APPROVED' OR (approved_by IS NOT NULL AND approved_at IS NOT NULL)),
  CONSTRAINT preference_needs_basis
    CHECK (preference_rank IS NULL OR preference_basis IS NOT NULL)
);

CREATE UNIQUE INDEX ON methodology_rule (ruleset_version, rule_id);
CREATE INDEX ON methodology_rule (ruleset_version, framework, category)
  WHERE status = 'APPROVED';
```

Two constraints carry real weight. `approved_needs_signoff` makes an unapproved
rule unpublishable at the schema level. `preference_needs_basis` makes it
impossible to record a priority without saying where it came from — which is
the guard against §4.

**Published rulesets are immutable.** A correction is a new version, never an
UPDATE. A 2029 auditor asks for `2026.09.01` and gets exactly the bytes that
produced the 2026 decision.

**The engine is generic; frameworks are data.** `framework` is a column, never a
code branch. Adding ISO 14064 or a national GHG programme means inserting rows,
not writing a second engine.

---

## 4. Applicability and preference are different things, and must not be merged

This is the single most dangerous place to be sloppy.

A standard describing four methods in some order has **not** thereby published
a preference hierarchy. Sometimes it has — Scope 3 Technical Guidance p.33 says
spend-based applies *"if the supplier-specific method, hybrid method, and
average-data method are not feasible"*, which is an explicit ranking. Often it
has not, and document order is just document order.

So:

| Question | Field | If the standard is silent |
| --- | --- | --- |
| *Can* this method be used? | `required_inputs`, `preconditions` | Rule is not extractable; reject |
| *Should* it be preferred? | `preference_rank`, `preference_basis` | **`preference_rank` stays NULL** |

A NULL rank is not a gap to be filled by a model or by a developer's intuition.
It is a true statement: the framework does not order these methods. The engine
handles that explicitly (§6), and an organisation may add its own ordering with
`preference_basis = ORGANISATION_POLICY` — visibly, as policy, not disguised as
the standard's requirement.

> **The prototype violates this.** It derives ordering from counting
> `ranks_below` relations, which manufactures a total order even where the
> documents establish only a partial one. Production must not.

---

## 5. Batch execution: the 10k-record path

### Measured baseline

The deterministic evaluator, benchmarked on this repo's 23 categories and
70 rules:

| | 10,000 records | per record |
| --- | --- | --- |
| Naive: validate + evaluate each | **135 ms** | 13.5 µs |
| Shape-memoised | **44 ms** | 4.4 µs |

Identical outputs both ways. **Rule evaluation is not the bottleneck** — it is
roughly 0.1% of a realistic request budget. Design effort belongs in I/O,
audit, and correctness, not in optimising the matcher.

### Shape memoisation

Because matching is presence-based, two records with the same category and the
same *set of populated fields* always yield the same decision. Key on that
shape:

```
shape = category | sorted(field ids where isPresent(record, field))
```

10,000 synthetic records collapsed to 684 shapes. **Real ERP extracts cluster far
harder** — a travel export is thousands of rows of the same three shapes — so
expect better in production, but do not promise a number you have not measured
on the customer's data.

The cache is valid only within one `ruleset_version`. Key it accordingly and
drop it on version change.

### Batch contract

```http
POST /v1/methodology:predictBatch
Idempotency-Key: 7f3c…                 required; retries must not double-write
Content-Type: application/x-ndjson
```

```jsonc
// first line: batch header
{"ruleset_version":"2026.09.01","framework":"GHG_PROTOCOL","batch_id":"b-8891"}
// then one record per line
{"record_id":"INV-000001","category":"BUSINESS_TRAVEL","inputs":{"distance":1200,"distance_unit":"passenger.km","mode":"AIR_SHORT_HAUL"}}
```

Rules that are not negotiable at this size:

**Pin the ruleset at batch start.** Resolve `latest-approved` to a concrete
version once, in the header, and evaluate all 10,000 records against that
snapshot. A ruleset that changes mid-batch produces an inventory whose rows were
decided by different rules — unexplainable to an auditor.

**Never fail the batch for one bad record.** Every record returns a status.
Malformed input is a per-record `VALIDATION_FAILED`, not a 400 for the batch.

**Stream.** NDJSON in and out, bounded memory, first results before the last
record is read. A 10k JSON array forces full materialisation for no benefit.

**No per-record database round trip.** Load the ruleset snapshot once (it is
kilobytes) into memory. An N+1 query pattern is what actually breaks at 10k,
not the matcher.

**Parallelism is unnecessary below ~1M records.** The evaluator is pure, so it
parallelises trivially — but at 13.5 µs/record, adding workers adds coordination
cost and non-determinism in ordering for no gain. Do not.

### Per-record result

```jsonc
{
  "record_id": "INV-000001",
  "status": "MATCHED",              // see §6 for the full set
  "methodology": "DISTANCE_BASED",
  "matched_rule": "BT_DIST_001",
  "framework": "GHG_PROTOCOL",
  "category": "BUSINESS_TRAVEL",
  "required_inputs": ["distance", "mode"],
  "inputs_satisfied": ["distance", "mode"],
  "source": {"document": "Scope 3 Technical Guidance", "edition": "1.0", "page": "p42"},
  "ruleset_version": "2026.09.01",
  "input_fingerprint": "531DD5A2"
}
```

---

## 6. Ambiguity is an outcome, not a tie to be broken

Given distance **and** fuel **and** spend, several methods are applicable. If
the framework establishes a preference, apply it. **If it does not, say so.**

| Status | Meaning | Downstream |
| --- | --- | --- |
| `MATCHED` | Exactly one applicable, or a framework preference resolved it | Proceed |
| `MULTIPLE_APPLICABLE` | Several applicable, **no governed preference exists** | Policy or human review |
| `DUAL_REPORTING_REQUIRED` | Framework requires more than one result (Scope 2) | Compute **all** listed |
| `INSUFFICIENT_DATA` | No rule's inputs satisfied | Return the gap per rule |
| `VALIDATION_FAILED` | Record unreadable — bad unit, negative, closed year | Reject the record |
| `NO_RULESET` | No approved rules for framework + category | Escalate; never guess |

`MULTIPLE_APPLICABLE` is the honest answer that a confidence score papers over.
"94% confident it's distance-based" is not a governed decision; "the standard
does not rank these, your policy must" is.

`DUAL_REPORTING_REQUIRED` exists because Scope 2 needs it. A single-answer
return type cannot express it, which is a design constraint on the API, not an
edge case to bolt on later.

---

## 7. Audit: store what is needed to *replay*, not a fat trace per record

At 10k records per call, storing a full prose decision trace per record is
gigabytes of redundant text.

It is also unnecessary. **Because execution is deterministic and the ruleset is
immutable, the trace is a pure function of (record, ruleset_version).** Store
the inputs to that function and regenerate the trace on demand:

```sql
CREATE TABLE prediction_audit (
  prediction_id    BIGSERIAL PRIMARY KEY,
  batch_id         TEXT NOT NULL,
  record_id        TEXT NOT NULL,
  ruleset_version  TEXT NOT NULL,
  engine_version   TEXT NOT NULL,
  input_fingerprint TEXT NOT NULL,   -- hash of the canonicalised record
  input_snapshot   JSONB NOT NULL,   -- the record as evaluated
  status           TEXT NOT NULL,
  methodology      TEXT,
  matched_rule     TEXT,
  decided_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Replay check: re-run `input_snapshot` against `ruleset_version` on
`engine_version` and assert the same `matched_rule`. If it differs, something
that was supposed to be immutable was not — which is precisely the alarm you
want. **Run this as a scheduled job, not only on request.**

`input_snapshot` is kept because the upstream system's record may later change;
the audit must show what was evaluated, not what the row says today.

---

## 8. Versioning: everything, or the audit fails

| Versioned | Why |
| --- | --- |
| Framework | GHG Protocol amends (Scope 2 Guidance amended the Corporate Standard) |
| Source document + edition | A 2019 refinement may amend only part of a 2006 chapter |
| Ruleset | The unit an auditor asks for |
| Individual rule | Rules are superseded independently |
| Field dictionary | A field's meaning changing silently invalidates old decisions |
| Extraction schema | Needed to interpret how a candidate was produced |
| Model + prompt | Needed to reproduce an authoring decision |
| Engine | The evaluator's own semantics can change |

A decision record naming `ruleset 2026.09.01` + `engine 3.2.0` is fully
reconstructible. One naming only "the GHG Protocol" is not.

---

## 9. Authoring plane: pipeline, metrics, and no silent retries

```
PDF → parse → section detect → table extract → candidate passages
    → structured extraction → schema validation → evidence verification
    → candidate rule → review queue
```

**Quote verification is the load-bearing check.** Every claim carries a verbatim
quote checked against the cited passage before a human sees it. That converts
"did it hallucinate?" from judgement into string comparison.

**Extraction failure is a recorded outcome.** `EXTRACTION_FAILED` on the passage,
surfaced in coverage metrics. Not a retry loop until something parses — that
selects for output the schema accepts rather than output that is true.

Track, per run: extraction success rate · evidence coverage (passages with a
method found ÷ passages that contain one) · citation accuracy · schema
validity · unmapped field count · unresolved passages · **false methodology
matches** (caught by §11).

> The prototype currently loses ~50% of passages to `HTTP 400 failed to generate
> JSON` on long and tabular text. That is an extraction-pipeline defect — the
> fix is better passage preparation (table extraction, splitting long
> passages), not a larger model.

---

## 10. Field mapping is controlled vocabulary, never inference

```
source phrase → controlled mapping table → canonical field
                        │
                   no entry?
                        ↓
              UNKNOWN_FIELD → review queue
```

Never `UNKNOWN_FIELD → model's best guess → accept`. This repo produced the
canonical example: *"Amount spent on purchased goods"* → `materialMass`, marked
**confident**. A wrong mapping does not look wrong; it becomes an
authoritative-looking required input on a governed rule.

An unmapped input is cheap — someone reads it. A mis-mapped one is expensive and
silent. Bias the threshold hard toward `UNKNOWN_FIELD`.

---

## 11. Golden dataset before model selection

Build the benchmark, then pick the model — not the reverse.

**Tier 1 — activity → methodology.** Several hundred verified activity records
with the expected outcome, including `MULTIPLE_APPLICABLE`, `INSUFFICIENT_DATA`
and `VALIDATION_FAILED`. Expectations must be authored **independently of the
ruleset**, or the test is circular and proves nothing. This repo's
`tests/activity-cases.json` is the shape, at 20 cases; production needs
hundreds, and it should record for each whether the expectation is
citation-backed or judgement.

**Tier 2 — passage → candidate rule.** Labelled passages for the extractor:
schema validity, quote accuracy, input extraction, selection semantics,
citation accuracy, invention rate, latency, cost. Labels written **before** any
model runs — otherwise a disagreement between grader and model is
unattributable. This repo learned that the hard way: a first bake-off scored
0/3 on semantics, and the contract was at fault, not the model.

**The round-trip test is the one that matters.** Derived ruleset → engine →
Tier 1 cases → compare against the authored baseline. `tools/roundtrip.js
--diff` is that gate.

---

## 12. Where the prototype stands against this

| Requirement | Prototype | Gap |
| --- | --- | --- |
| Deterministic execution plane | ✅ pure functions, no DOM, no state | — |
| No model in request path | ❌ `server/app.py` calls Groq on a cache miss | **Violates §1** |
| Ruleset as source of truth | ✅ relational store, versioned, hashed snapshots | — |
| Immutable published versions | ✅ enforced; a fix requires a new version | — |
| Applicability ≠ preference | ✅ separate columns; 65 of 70 ranks NULL for want of evidence | — |
| `MULTIPLE_APPLICABLE` status | ✅ returned when several apply and nothing orders them | — |
| `DUAL_REPORTING_REQUIRED` | ✅ Scope 2 recorded `all_of`; engine returns both | — |
| Batch API | ❌ single record | Not built |
| Replayable audit | ⚠️ fingerprint exists, no store | Add `prediction_audit` |
| Quote verification | ✅ V1, rejects before human sees it | — |
| Controlled field mapping | ⚠️ lexicon, 4/5 on its own tests | Move to a reviewed table |
| Golden dataset | ⚠️ 20 cases, 13 citation-backed | Needs hundreds |
| Framework as data | ⚠️ single framework assumed | Add `framework` dimension |

Steps 1-3 of the build order are done. The remaining violation is that
`server/app.py` still calls a model on a cache miss (§1); the batch endpoint and
replayable audit store (§5, §7) are not built.

---

## 13. Build order

1. **Ruleset store + versioning.** Move `decision-tables.js` into the schema in
   §3 with a real version. Everything else depends on it.
2. **Split applicability from preference.** Add `preference_basis`; set
   `preference_rank = NULL` wherever the standard does not actually order the
   methods. Expect this to change some current answers — that is the point.
3. **Add the ambiguity statuses**, including `DUAL_REPORTING_REQUIRED`. This
   changes the return type, so do it before anything consumes the API.
4. **Batch endpoint + replayable audit.** Straightforward once 1–3 are done.
5. **Take the model out of the request path.** Extraction becomes a scheduled
   authoring job writing candidates to the review queue.
6. **Grow the golden dataset**, then run the model bake-off against it.

Steps 1–4 need no model at all. They are the enterprise-grade part, and they are
mostly schema and discipline rather than research.
