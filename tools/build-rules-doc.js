/* Generates docs/METHODOLOGY-RULES.md from assets/decision-tables.js.

   The analysis prose is written here; the rule tables are generated from the
   data, so the document cannot drift out of step with what the engine does.

   Run: node tools/build-rules-doc.js                                        */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const ctx = { console, out: {} };
vm.createContext(ctx);
vm.runInContext(
  fs.readFileSync(path.join(root, 'assets/decision-tables.js'), 'utf8') +
  '\nout.CATEGORIES=CATEGORIES;out.METHODOLOGIES=METHODOLOGIES;out.SOURCES=SOURCES;' +
  'out.FIELDS=FIELDS;out.REGISTRY=REGISTRY;', ctx);
const { CATEGORIES, METHODOLOGIES, SOURCES, FIELDS, REGISTRY } = ctx.out;

const esc = (s) => String(s).replace(/\|/g, '\\|');
const cite = (m) => {
  const s = m.source;
  return SOURCES[s.src].held
    ? `${SOURCES[s.src].short} ${s.ref}`
    : `_${SOURCES[s.src].short}_ — **not held**`;
};

const ruleCount = CATEGORIES.reduce((a, c) => a + c.rules.length, 0);
const held = Object.keys(METHODOLOGIES).filter(k => SOURCES[METHODOLOGIES[k].source.src].held);
const notHeld = Object.keys(METHODOLOGIES).filter(k => !SOURCES[METHODOLOGIES[k].source.src].held);

/* ---------------------------------------------------------- generated ---- */

const methodTable = [
  '| Method | Data tier | Evidenced by | On what basis |',
  '| --- | --- | --- | --- |',
  ...Object.keys(METHODOLOGIES).map(k => {
    const m = METHODOLOGIES[k];
    return `| **${esc(m.name)}** | ${esc(m.tier)} | ${cite(m)} | ${esc(m.source.note)} |`;
  })
].join('\n');

const byScope = ['Scope 1', 'Scope 2', 'Scope 3'];
const ruleTables = byScope.map(scope => {
  const cats = CATEGORIES.filter(c => c.scope === scope);
  return `### ${scope}\n\n` + cats.map(c => {
    const rows = c.rules.map(r => {
      const m = METHODOLOGIES[r.methodology];
      const needs = r.requires.map(f => FIELDS[f].short).join(' + ') +
        (r.optional ? ' _(+ ' + r.optional.map(f => FIELDS[f].short).join(', ') + ' optional)_' : '');
      return `| ${r.priority} | \`${r.id}\` | ${esc(needs)} | ${esc(m.name)} | ${esc(m.tier)} | ${cite(m)} |`;
    }).join('\n');
    return [
      `#### ${c.label}`,
      '',
      `\`${c.table} ${c.tableVersion}\` · ${c.ghgCat} · ${c.rules.length} rules`,
      '',
      '| Order | Rule | Required inputs | Method | Tier | Evidenced by |',
      '| --- | --- | --- | --- | --- | --- |',
      rows,
      `| — | — | _no valid match_ | **Insufficient Data** | — | Corporate Standard p.44 |`,
      ''
    ].join('\n');
  }).join('\n');
}).join('\n');

/* ------------------------------------------------------------- prose ----- */

const doc = `# Methodology Rules — Source Analysis

What the two GHG Protocol documents on file actually authorise, and where each
rule in \`assets/decision-tables.js\` comes from.

**Generated** from the rule data by \`tools/build-rules-doc.js\`. Do not edit by hand.

**Documents read**

| Document | Pages | Status |
| --- | --- | --- |
| GHG Protocol Corporate Accounting and Reporting Standard, Revised Edition (2004) | 116 | Read in full |
| GHG Protocol Policy and Action Standard (2014) | 192 | Read in full |

**Headline:** of ${Object.keys(METHODOLOGIES).length} methods in the engine,
**${held.length} are evidenced** by these two documents and **${notHeld.length} are not**.
The gap is not an error in the tables — it is that the documents governing most
Scope 3 methods were not among the files supplied.

---

## 1. What each document actually covers

### Corporate Standard — directly relevant

This is the document that governs the engine. Chapter 6, *Identifying and
Calculating GHG Emissions*, is the operative text.

**Source categories (p.43).** The standard names exactly four Scope 1 source
categories: *stationary combustion, mobile combustion, process emissions,
fugitive emissions*. The engine's four Scope 1 tables map one-to-one onto these.

**The calculation hierarchy (p.44).** The standard sets out three approaches in
descending order of accuracy:

> Direct measurement of GHG emissions by monitoring concentration and flow rate
> is not common. More often, emissions may be calculated based on a **mass
> balance or stoichiometric basis** specific to a facility or process. However,
> the most common approach for calculating GHG emissions is through the
> application of **documented emission factors**.

and refers to the IPCC's *"hierarchy of calculation approaches and techniques
ranging from the application of generic emission factors to direct monitoring."*

**Typical data by scope (p.44).**

| Scope | What the standard expects | Engine method |
| --- | --- | --- |
| 1 | "purchased quantities of commercial fuels ... using published emission factors" | Fuel-based |
| 2 | "metered electricity consumption and supplier-specific, local grid, or other published emission factors" | Location-based / Supplier-specific |
| 3 | "activity data such as fuel use or passenger miles" | Fuel-based / Distance-based |

**Scope 3 activities (p.31).** An *indicative list* only — extraction and
production of purchased materials and fuels; transport-related activities;
employee business travel; commuting; transportation of sold products and waste;
electricity-related activities not in Scope 2; leased assets, franchises and
outsourced activities; use of sold products; waste disposal. Note what is
**absent**: capital goods, processing of sold products, and investments.

### Policy and Action Standard — not directly relevant

This document is about estimating the GHG effect of **government policies**, at
national, subnational or municipal level. It says so itself (p.9):

> This standard ... details a general process that users should follow when
> conducting an assessment, but **it does not prescribe specific calculation
> methodologies, tools, or data sources**.

It cannot authorise an activity-level method, and nothing in the engine should
cite it as the reason a rule exists. Two things do transfer, and both are
principles rather than methods:

1. **Accuracy tiering (Table 8.5, p.85).** Three levels, ordered by data source:
   *international default values* → *national average values* →
   *jurisdiction- or source-specific data*. This is the same ladder the engine
   calls Proxy → Secondary → Primary.
2. **Activity-data families (Table 8.6, p.87).** Litres of fuel, kWh of
   electricity, kg of material, km travelled, hours operated, m² occupied, kg of
   waste. Six of these seven map onto method families already in the engine.

---

## 2. The basis for priority ordering

This is the single most important finding, because rule *order* is what the
engine actually does. Both documents state the same principle independently.

**Corporate Standard, p.44:**

> Companies should use the **most accurate calculation approach available** to
> them and that is appropriate for their reporting context.

> In most cases, if **source- or facility-specific emission factors are
> available, they are preferable** to more generic or general emission factors.

**Policy and Action Standard, p.85:**

> In general, users should follow the **most accurate approach that is
> feasible**. ... more source-specific data often yield more accurate results
> than default data.

The engine's core behaviour — try rules top-down, take the first whose inputs
are present, never fall back to a rougher method when a better one qualifies —
is a direct implementation of that sentence. Every table is ordered
source-specific first, monetary proxy last.

The one thing neither document supplies is the ordering *within* a category —
for example whether fuel-based outranks distance-based for an owned vehicle.
That comes from the GHG Protocol calculation tools, which are not held.

---

## 3. Method families and their evidence

${methodTable}

---

## 4. The complete rule set

${CATEGORIES.length} activities, ${ruleCount} rules, as the engine evaluates them.

${ruleTables}

---

## 5. What these two documents do not cover

Each of these is a real gap. The rules exist and are defensible, but this repo
cannot currently evidence them from the files supplied.

| Missing document | What depends on it |
| --- | --- |
| **Scope 3 Standard (2011)** | The fifteen numbered Scope 3 categories. The engine labels categories \`Category 1\`…\`Category 15\`; the Corporate Standard's p.31 list is indicative and unnumbered, and omits capital goods, processing of sold products and investments entirely. |
| **Scope 3 Technical Guidance (2013)** | Every spend-based and EEIO method, the tonne-kilometre freight method, and accommodation night averages — ${notHeld.filter(k => METHODOLOGIES[k].source.src === 'S3TG').length} methods in total. |
| **Scope 2 Guidance (2015)** | Location-based / market-based dual reporting. The Corporate Standard (2004) predates it and treats RECs as an offsetting matter (p.61), not as a parallel accounting method. The engine's \`PE-RULES\` ordering — location-based at priority 1, market-based at 2 — is **not** supported by anything read here. |
| **GHG Protocol calculation tools** | Rule ordering within a category, and the refrigerant screening approaches. |
| **PCAF Standard** | Categories 15 investment methods and the data-quality scores referenced in the rule notes. |

### Correction to make

\`REGISTRY.standard\` currently reads *"GHG Protocol Corporate Standard + Scope 3
Standard (2011)"*. Only the first of those has been read. Either obtain the
Scope 3 Standard or narrow the claim.

---

## 6. Recommended change: operating-hours method

Policy and Action Standard Table 8.6 (p.87) lists *"hours of time operated"*
against *"kg SF6 emitted per hour of time operated"* as a standard activity-data
family. The engine has no equivalent, and it is a real gap for standby
generators, process refrigeration and leased equipment, where run-hours are
often the only meter available.

This would add a rule, which changes predictions, so it is **not** applied. To
adopt it, add to \`FIELDS\`:

\`\`\`js
operatingHours: {
  label: 'Operating Hours', short: 'Operating Hours', kind: 'number', placeholder: '0',
  dict: 'Run-hours of the equipment in the period. Supports the operating-hours method.'
}
\`\`\`

to \`METHODOLOGIES\`:

\`\`\`js
HOURS_BASED: { name: 'Operating-hours based', tier: 'Secondary', confidence: 'Medium',
               blurb: 'Applies a per-hour factor to metered equipment run-time.' }
\`\`\`

and a rule below the fuel-based rule in \`stationaryCombustion\`:

\`\`\`js
{ requires: ['operatingHours', 'fuelType'], methodology: 'HOURS_BASED',
  note: 'Run-hours where no fuel meter exists. PAS Table 8.6, p.87.' }
\`\`\`

---

*Rule set ${REGISTRY.version}. Regenerate with \`node tools/build-rules-doc.js\`.*
`;

fs.mkdirSync(path.join(root, 'docs'), { recursive: true });
const dest = path.join(root, 'docs', 'METHODOLOGY-RULES.md');
fs.writeFileSync(dest, doc, 'utf8');
console.log('wrote ' + dest + '  (' + (doc.length / 1024).toFixed(1) + ' KB)');
console.log('  ' + CATEGORIES.length + ' activities, ' + ruleCount + ' rules, ' +
  held.length + ' methods evidenced, ' + notHeld.length + ' not');
