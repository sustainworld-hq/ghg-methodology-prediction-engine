# SustainGHG — Methodology Prediction Engine (prototype)

Answers one question:

> **Which GHG calculation method applies to this activity — and why?**

Pick an example or fill in a few fields, press one button, get one answer. The
working-out sits behind *Show how we decided*, so the everyday path stays short.

**In scope:** picking the method.
**Not in scope:** choosing an emission factor, calculating emissions, chat, retrieval, dashboards.

---

## Run it

Open **`methodology-prediction-engine.html`** in any browser. One file, everything inlined —
no server, no install, no dependencies. Drop it on any static host and it works as-is.

For development open `index.html` instead: same page, but CSS and JS stay in `assets/`
where they are easier to edit. After changing anything there, regenerate the single file:

```bash
node build.js
```

The build fails loudly if anything doesn't get inlined, so you can't ship a page with
dead references.

---

## Files

| File | What it is |
| --- | --- |
| `methodology-prediction-engine.html` | **The deliverable.** Standalone page |
| `index.html` | Development copy, links to `assets/` |
| `assets/decision-tables.js` | **The rules.** Field dictionary, method catalogue, 23 decision tables, examples |
| `assets/engine.js` | Pure logic. No DOM, no state, no defaults |
| `assets/ui.js` | Everything on screen |
| `assets/styles.css` | Plain white, one green accent |
| `build.js` | Inlines it all into the standalone page |
| `docs/METHODOLOGY-RULES.md` | **Source analysis.** Every rule traced to the standard that authorises it |
| `tools/test-rules.js` | Headless regression harness — examples, references, ordering, determinism |
| `tools/build-rules-doc.js` | Regenerates the source analysis from the rule data |

The split matters: `engine.js` holds no DOM references and no globals, so you can test it
headlessly, reuse it server-side, or swap the interface without touching the logic.

---

## How it decides

`engine.js` exposes eight pure functions. Three do the work:

```js
isPresent(values, fieldId)   // a value the rules can actually read
validate(values, category)   // 5 checks -> blocking errors + advisories
evaluate(values, category)   // rules in priority order, first match wins
```

`evaluate` returns a verdict for *every* rule, not just the winner — that is what makes
the explanation and the audit trace possible. Each rule ends up one of three ways:

- **Used** — all required inputs present, and the highest-priority rule to qualify
- **Ranks lower** — inputs present, but a better rule already won
- **Not enough data** — one or more required inputs missing

If nothing qualifies, the answer is *We need a little more*, listing the exact fields that
would unlock each method. Clicking one jumps to that field. Nothing is ever assumed.

### Why it is not AI

Every answer carries a record fingerprint (FNV-1a over the canonicalised input). Same data
in, same fingerprint, same method out — every time. No model, no ranking, no randomness.
The tables in `decision-tables.js` are the entire engine.

---

## Standards basis

The rules were checked against the GHG Protocol documents on file. **21 of 31 methods
are evidenced; 10 are not** — the documents governing most Scope 3 methods (Scope 3
Standard, Scope 3 Technical Guidance, Scope 2 Guidance) have not been read against
these tables. Every method carries its citation in `METHODOLOGY_SOURCES`, and the app
shows it in the *All the rules* tab, flagging unverified ones.

The priority ordering rests on one sentence, Corporate Standard p.44:

> Companies should use the most accurate calculation approach available to them.

`tools/test-rules.js` enforces that as an invariant: no table may offer a rougher
method above a better one. Full analysis in [docs/METHODOLOGY-RULES.md](docs/METHODOLOGY-RULES.md).

```bash
node tools/test-rules.js        # regression harness, exit 1 on failure
node tools/build-rules-doc.js   # regenerate the source analysis
```

---

## The rules

**23 activities · 70 rules · 30 methods · 56 fields**, covering Scope 1, Scope 2 and all
fifteen Scope 3 categories. Browse them under *All the rules*, with search and scope filters.

Rules are ordered by the quality of answer they produce, best first:

| Quality | Confidence | Examples |
| --- | --- | --- |
| Primary — your real data | High | Distance-based, Fuel-based, Location-based, Supplier-specific |
| Secondary — an average | Medium | Average-data, Treatment-specific, Floor-area based |
| Proxy — a rough estimate | Low | Spend-based, Spend-based (EEIO), Simplified screening |

Business travel, as the tool shows it:

| Order | What you need | Method |
| --- | --- | --- |
| 1 | Distance + Mode | Distance-based |
| 2 | Fuel Quantity + Fuel Type | Fuel-based |
| 3 | Spend + Currency | Spend-based |
| — | None of the above | Not enough data |

---

## Adding an activity

Append one object to `CATEGORIES` in `assets/decision-tables.js`. Rule numbers and labels
are derived from array order at the bottom of that file, so the order you write is the
order the tool tries:

```js
{
  id: 'myCategory', label: 'My Category',
  scope: 'Scope 3', ghgCat: 'Category 6',
  table: 'MY-RULES', tableVersion: 'v1.0',
  templates: ['Template A'],
  fields: ['distance', 'mode', 'spend'],   // what shows on the form
  rules: [
    { requires: ['distance', 'mode'], methodology: 'DIST_BASED', note: 'Why this ranks first.' },
    { requires: ['spend', 'currency'], methodology: 'SPEND_BASED', note: 'Rough fallback.' }
  ]
}
```

Nothing in `engine.js` or `ui.js` changes. The form, the table, the rule-by-rule list, the
trace and the library entry all come from that object.

To add a *field*, add it to `FIELDS` with a `short` label, a `kind` and a `dict` definition.
If its technical name reads badly on screen, add a plain-English override to `FRIENDLY`
at the top of `ui.js`.

---

## Validation

Five checks run before any rule is read. Two can block; the rest only advise.

| Check | Blocks? |
| --- | --- |
| Activity category identified | no |
| Required fields checked | no — advises when nothing measurable was given |
| Units validated | **yes** — a quantity with no unit, or a unit outside the allowed set |
| Input values validated | **yes** — negatives, non-numbers, out-of-range %, year outside 2021–2027 |
| Cross-field coherence | no — e.g. `passenger.km` paired with a freight mode |

---

## Examples

Twelve preloaded records; six shown by default. Every one is checked by the test harness.

| # | Example | Answer |
| --- | --- | --- |
| 1 | Air travel, distance known | Distance-based |
| 2 | Company vehicle, fuel purchased | Fuel-based |
| 3 | Business travel, spend only | Spend-based |
| 4 | Electricity, grid region known | Location-based |
| 5 | Electricity, I-REC contract | Market-based |
| 6 | Travel record with no measures | Not enough data |
| 7 | Inbound freight, weight and distance | Weight-distance |
| 8 | Purchased goods, supplier footprint | Supplier-specific |
| 9 | Waste, weighbridge ticket | Waste-type-specific |
| 10 | Refrigerant recharge log | Material-balance |
| 11 | Investment, investee reports | Investment-specific |
| 12 | Distance with no unit | Blocked at validation |

---

## Prototype boundaries

- The tables are illustrative and GHG-Protocol-shaped, not audited content. Real use needs
  sign-off per table and per version.
- Table versions and approval dates are static strings, not a real registry.
- The audit record is built for display and copy; nothing is stored.
