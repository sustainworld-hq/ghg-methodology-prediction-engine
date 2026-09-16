# Factor Resolution — Plan

How an activity record, once its **methodology** is decided, becomes an **exact
emission factor** from a named publisher, deterministically and without a model.

**Status:** plan. Nothing built.

---

## 0. The most important finding first

**Do not build a factor store. One already exists.**

`SustainFactor-AI-Master-Architecture.pdf` specifies a complete product —
FastAPI + PostgreSQL 16 + React, publishers DEFRA / IEA / IPCC, four modules
with named owners. You own Module 2. It already has:

| | |
| --- | --- |
| `publisher` | `publisher_code`, `adapter_code`, `key_includes_year` |
| `library` | one publisher + one geography (DEFRA UK, IPCC Global, IEA Grid) |
| `dataset_version` | `source_year`, `source_file_hash`, draft/final |
| `category_node` | hierarchical `path_codes`, level, scope |
| `emission_factor` | `value NUMERIC(24,10)`, `unit_id`, `gas_id`, `region_code`, `reference_year` |
| `unit` | `si_factor`, `quantity_kind` |
| `gas` | `gwp_ar5`, `gwp_ar6`, `is_aggregate` |
| `release` | immutable approved snapshot; assigned to customers in M4 |

It also already enforces the discipline we arrived at independently here: a hard
mutable/immutable boundary, and two distinct versioning axes (`dataset_version`
for what DEFRA published, `release` for what you froze).

**So the work is not storage. It is the layer between the two systems.**

SustainFactor's four verbs are Organise, Populate, Freeze, Distribute. None of
them is *Resolve*. Given an activity record and a chosen methodology, deciding
**which publisher, which row, which vintage** is nobody's job yet. That gap is
this plan.

---

## 1. Where it sits

```
  activity record
        │
        ▼
  METHODOLOGY ENGINE          service/server.js — built, deterministic
  ruleset 2026.09.xx
        │
   MATCHED? ──── no ──► MULTIPLE_APPLICABLE / INSUFFICIENT_DATA
        │                      stop. A factor cannot be chosen for a
        │                      methodology that has not been chosen.
       yes
        ▼
  FACTOR RESOLVER             ◄── THIS PLAN
  binding policy vN
        │
        ├─ publisher precedence   (declared policy, not inference)
        ├─ taxonomy binding       (our fields → category_node path)
        ├─ geography resolution   (with explicit widening)
        ├─ vintage selection      (reporting year vs dataset_version)
        ├─ unit compatibility     (quantity_kind + si_factor)
        └─ gas / GWP basis        (AR5 vs AR6, pinned)
        │
        ▼
  SUSTAINFACTOR RELEASE       read-only, pinned release id
        │
        ▼
  factor value + full provenance + audit
```

**The resolver reads a pinned release. It never reads a draft library.** Same
rule as the methodology engine reading a published snapshot: if the thing you
decided against can still change, the decision cannot be replayed.

---

## 2. Correcting one assumption

> "take the methodology with highest score"

There is no score, deliberately. The engine returns `MATCHED` when one method
applies or a governed preference resolves it, and `MULTIPLE_APPLICABLE` when
several apply and the framework orders none of them. In the last 10,000-record
run that was **1,458 records**.

Adding a score to break those ties would reintroduce exactly the invented
hierarchy that steps 2 and 3 removed — 65 of 70 ranks were deleted precisely
because array position was being read as evidence. A number labelled "score"
would be the same mistake wearing a better name.

So: **factor resolution is gated on `MATCHED`.** Anything else is returned to
the caller for resolution by policy or by a human. That is a product decision
with a real cost — roughly 15% of records need a human or an
`ORGANISATION_POLICY` rule before they can be calculated — and it should be
made knowingly rather than hidden behind a tie-break.

---

## 3. The hard part: which publisher?

This is the question you asked, and it has the same shape as method preference.

**You cannot derive "DEFRA over IPCC" from the documents.** No standard says
it. What actually decides it:

| Driver | Example |
| --- | --- |
| Reporting programme | UK SECR filing effectively mandates DEFRA |
| Geography | IEA has country grid intensities; CEA is authoritative for the Indian grid; DEFRA is UK-specific |
| Data specificity | supplier-specific > national > international default (Corporate Standard p.44) |
| Category coverage | IPCC covers stationary/mobile/fugitive well; DEFRA covers business travel and waste well |

So publisher precedence is **declared policy, versioned and owned** — the same
treatment `preference_basis` gets for methods:

```sql
CREATE TABLE factor_binding_policy (
  policy_version   TEXT NOT NULL,        -- 2026.10.01
  scope_key        TEXT NOT NULL,        -- category + geography + programme
  category         TEXT,                 -- NULL = any
  geography        TEXT,                 -- 'IN', 'GB', NULL = any
  reporting_programme TEXT,              -- 'SECR' | 'CSRD' | 'VOLUNTARY' | NULL
  publisher_code   TEXT NOT NULL,
  precedence       INTEGER,              -- NULL = no declared preference
  basis            TEXT NOT NULL,        -- REGULATORY_REQUIREMENT
                                         -- | GEOGRAPHIC_AUTHORITY
                                         -- | ORGANISATION_POLICY
                                         -- | NONE
  evidence         TEXT,                 -- the rule or clause that compels it
  status           TEXT NOT NULL,
  approved_by      TEXT, approved_at TEXT,
  CHECK (precedence IS NULL OR basis IS NOT NULL),
  CHECK (status <> 'APPROVED' OR (approved_by IS NOT NULL AND approved_at IS NOT NULL))
);
```

Note `basis` is **not** `EXPLICIT_STANDARD_GUIDANCE` here. Nothing in a standard
ranks publishers. Honest values are "the regulator requires it", "this body is
authoritative for this geography", or "we chose it". If two publishers tie with
no declared precedence, the answer is `MULTIPLE_FACTORS_APPLICABLE`, not a
coin toss.

---

## 4. Taxonomy binding is the real engineering problem

Our engine speaks `{mode: 'Road — Car (Diesel)', fuelType: 'Diesel'}`. DEFRA
speaks `Passenger vehicles › Cars (by size) › Diesel › Medium car`. IPCC speaks
`1.A.3.b Road Transportation › Diesel Cars`. Same physical thing, three
vocabularies.

`category_node.path_codes` already exists per library. What is missing is the
**binding table**: our field combination → a publisher's node.

```sql
CREATE TABLE factor_binding (
  policy_version  TEXT NOT NULL,
  methodology     TEXT NOT NULL,        -- DIST_BASED
  selector        TEXT NOT NULL,        -- JSON: {"mode":"Road — Car (Diesel)"}
  publisher_code  TEXT NOT NULL,
  path_codes      TEXT NOT NULL,        -- the category_node it binds to
  required_gas    TEXT,                 -- CO2E
  gwp_basis       TEXT,                 -- AR5 | AR6
  confidence      TEXT NOT NULL,        -- EXACT | NARROWER | BROADER
  approved_by     TEXT, approved_at TEXT
);
```

Three properties that matter:

**`confidence` is not decoration.** `EXACT` means the publisher node is the same
thing. `BROADER` means we are using "average car" for "medium diesel car" — a
real loss of specificity that must surface in the result, not be swallowed.

**Bindings are authored, not inferred at runtime.** This is where an LLM could
legitimately help — proposing candidate bindings from publisher category names
during M2 ingestion, for a human to approve. It belongs in the authoring plane,
behind the same quote-verification and approval gate as methodology rules. It
must never run at resolution time.

**Unbound is an outcome.** If no binding exists, return `NO_BINDING` and name
the gap. Do not fall back to a broader node silently — that is the same failure
as a silent default.

---

## 5. Unit compatibility is a gate, not a nicety

The activity is `500 litre`. The factor may be `kgCO2e per litre` (direct),
`kgCO2e per kWh` (needs net calorific value), or `kgCO2e per tonne` (needs
density). SustainFactor's `unit.si_factor` and `unit.quantity_kind` make
same-kind conversion mechanical.

Cross-kind conversion is **not** mechanical: litres → kWh requires an NCV,
which is itself a published factor with its own provenance and vintage. So:

- same `quantity_kind` → convert by `si_factor`, record the conversion
- different `quantity_kind` → require a **governed conversion factor**, resolved
  by this same resolver, and record the chain
- no conversion path → `UNIT_INCOMPATIBLE`, never an approximation

A calculation that silently multiplied litres by a per-kWh factor would be
wrong by roughly a factor of ten and would look completely normal.

---

## 6. The other three axes

**Vintage.** A 2026 activity needs the factor set applicable to 2026. If only
2024 exists, that is `STALE_VINTAGE` — allowed only if policy permits, and
recorded either way. Note `publisher.key_includes_year` already exists in the
schema, which suggests this was anticipated.

**Geography.** Resolve narrowest-first: grid region → country → region group →
global. Each widening is recorded (`GEOGRAPHY_WIDENED`) with what was asked for
and what was used. Policy may forbid widening for a given programme.

**Gas and GWP basis.** `gas.gwp_ar5` and `gwp_ar6` are both in the schema, so
the same physical factor yields different CO2e depending on basis. The basis is
**pinned per reporting programme**, never chosen per record, or two rows in one
inventory become incomparable.

---

## 7. Outcomes

Same vocabulary discipline as the methodology engine — ambiguity and absence are
answers, not errors.

| Status | Meaning |
| --- | --- |
| `FACTOR_SELECTED` | one factor, fully bound, units compatible |
| `MULTIPLE_FACTORS_APPLICABLE` | several publishers/rows qualify, no declared precedence |
| `NO_BINDING` | our selector maps to no publisher node |
| `NO_FACTOR` | bound, but the release holds no matching row |
| `UNIT_INCOMPATIBLE` | no governed conversion path |
| `GEOGRAPHY_WIDENED` | selected, but less specific than asked — flagged |
| `STALE_VINTAGE` | only an out-of-window dataset available |
| `METHOD_NOT_RESOLVED` | upstream returned ambiguity; resolution cannot start |

---

## 8. The result record

A calculation is only reproducible if **both** versions are pinned together:

```jsonc
{
  "status": "FACTOR_SELECTED",
  "methodology": "DIST_BASED",
  "methodology_ruleset_version": "2026.09.07",
  "factor": {
    "publisher": "DEFRA",
    "release_id": "DEFRA-UK-2026.1",
    "dataset_version": "DEFRA 2026",
    "path_codes": "passenger_vehicles/cars_by_size/diesel/medium",
    "value": "0.1684300000",
    "unit": "kgCO2e/km",
    "gas": "CO2E",
    "gwp_basis": "AR5",
    "reference_year": 2026,
    "source_row_no": 4412
  },
  "binding": { "confidence": "EXACT", "policy_version": "2026.10.01" },
  "conversions": [],
  "widenings": [],
  "input_fingerprint": "3B8503CA"
}
```

`release_id` matters more than it looks. SustainFactor M4 assigns releases to
customers, so two customers on different releases will legitimately get
different numbers for the same activity — and must be able to prove why.

---

## 9. Why no LLM, and where one would be legitimate

Factor resolution is a **typed join over a governed schema**: filter by
methodology, binding, geography, vintage, unit kind; order by declared
precedence; return one row or declare ambiguity. That is a database problem. A
model would add latency, cost and non-determinism to something that needs none
of them, and it is the arithmetic path of a reported inventory.

The one place a model earns its place is **authoring the bindings** in §4 —
proposing that DEFRA's `Cars (by size) › Diesel › Medium car` corresponds to our
`Road — Car (Diesel)`, for a human to approve, once, offline. Same plane, same
gate, same approval record as methodology extraction.

---

## 10. What we do not have yet

| Needed | Status |
| --- | --- |
| Factor values | **absent.** The corpus holds methodology prose only; the DEFRA file is the methodology report, not the conversion-factor spreadsheet |
| DEFRA factors | `Emission_Factors_for_Cross_Sector_Tools_V2.0_0.xlsx` and the 2017 cross-sector workbook are in Downloads, unexamined |
| IEA | `IEA.postman_collection-221020.zip` — an **API**, not a file, and commercially licensed. Redistribution limits need checking before anything is cached |
| IPCC factors | in the Guidelines PDFs as tables; 65 chunks in the corpus match a `kgCO2e/unit` pattern, so some are already indexed |
| SustainFactor instance | not running here. Whether to integrate against a real one or a local stub is the first decision |

---

## 11. Proposed order

1. **Decide the integration point.** Does the resolver call SustainFactor's API,
   or read a replicated release? This determines everything else and is a
   conversation with Manasa and Indhupriyan, not a technical toss-up.
2. **Load one publisher, one category, end to end.** DEFRA business travel from
   the XLSX. Narrow and real beats broad and hypothetical.
3. **Author bindings for that slice** and prove `EXACT` vs `BROADER` behaves.
4. **Build the resolver** with the §7 outcomes and the §8 record.
5. **Extend the round-trip harness**: activity → methodology → factor → expected
   value, so a wrong binding fails a test rather than a customer's inventory.
6. **Then widen** to a second publisher, which is where precedence first bites.

Steps 1–5 need no model and no IEA licence.

---

## 12. Questions for you

**Q1 — Integration point.** API call to SustainFactor, or a replicated release
read locally? Latency, coupling and who operates it all follow from this.

**Q2 — Is resolution Module 2's job, or a fifth module?** SustainFactor's four
verbs do not include Resolve. If it is yours, it changes Module 2's scope; if it
is a new module, it needs an owner. Worth raising with the team before code.

**Q3 — Gating on `MATCHED`.** ~15% of records currently return
`MULTIPLE_APPLICABLE` and would stop here. Do we accept a human/policy step for
those, or do we first do the `ORGANISATION_POLICY` work to resolve the common
ones? My recommendation is the latter, before factors, because otherwise the
gap shows up as "the calculator does not work".

**Q4 — IEA licensing.** Can factor values from the IEA API be cached in a
release and distributed to customers? That is a contract question that could
invalidate the design, so it is worth answering early.
