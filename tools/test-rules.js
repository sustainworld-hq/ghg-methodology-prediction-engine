/* Regression harness for the decision tables and the engine.
   Runs headlessly - engine.js has no DOM dependencies, which is the point.

   Run: node tools/test-rules.js        (exit 1 on any failure)              */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const ctx = { console, out: {} };
vm.createContext(ctx);
vm.runInContext(
  fs.readFileSync(path.join(root, 'assets/decision-tables.js'), 'utf8') + '\n' +
  fs.readFileSync(path.join(root, 'assets/engine.js'), 'utf8') + `
  out.SCENARIOS=SCENARIOS; out.CATEGORIES=CATEGORIES; out.CATEGORY_BY_ID=CATEGORY_BY_ID;
  out.FIELDS=FIELDS; out.METHODOLOGIES=METHODOLOGIES; out.SOURCES=SOURCES;
  out.CORE_FIELDS=CORE_FIELDS; out.isPresent=isPresent; out.validate=validate;
  out.evaluate=evaluate; out.recordHash=recordHash; out.explain=explain;
  out.buildTrace=buildTrace; out.auditPayload=auditPayload;`, ctx);
const E = ctx.out;

let failures = 0;
const fail = (msg) => { failures++; console.log('  FAIL  ' + msg); };
const section = (t) => console.log('\n' + t);

/* --- 1. every example predicts what it advertises ------------------------ */

section('Examples');
E.SCENARIOS.forEach(function (s, i) {
  const cat = E.CATEGORY_BY_ID[s.values.activityCategory];
  const v = Object.assign({}, s.values);
  cat.fields.forEach(function (f) {           // mirror the UI's unit defaulting
    const u = E.FIELDS[f].unitOf;
    if (u && v[u] === undefined && E.isPresent(v, f)) v[u] = E.FIELDS[u].options[0];
  });
  const val = E.validate(v, cat);
  const actual = !val.ok ? 'Validation failure' : E.evaluate(v, cat).methodology.name;
  if (actual !== s.expect) {
    fail(`#${i + 1} ${s.name}: expected "${s.expect}", got "${actual}"`);
    val.errors.forEach(e => console.log('        ' + e));
  } else {
    console.log(`  ok    #${String(i + 1).padStart(2)} ${s.name} -> ${actual}`);
  }
  if (val.ok) {                                // display builders must not throw
    const run = E.evaluate(v, cat);
    run.predictionId = 'TEST'; run.generatedAt = '1970-01-01T00:00:00Z';
    run.hash = E.recordHash(v, cat);
    try { E.explain(run); E.buildTrace(run, val, v); E.auditPayload(run, val, v); }
    catch (err) { fail(`#${i + 1} ${s.name}: display builder threw - ${err.message}`); }
  }
});

/* --- 2. referential integrity ------------------------------------------- */

section('References');
E.CATEGORIES.forEach(function (c) {
  c.fields.forEach(f => { if (!E.FIELDS[f]) fail(`${c.id}: unknown field "${f}"`); });
  Object.keys(c.fieldOptions || {}).forEach(f => {
    if (!E.FIELDS[f]) fail(`${c.id}: fieldOptions for unknown field "${f}"`);
  });
  c.rules.forEach(function (r) {
    if (!E.METHODOLOGIES[r.methodology]) fail(`${r.id}: unknown methodology "${r.methodology}"`);
    r.requires.concat(r.optional || []).forEach(f => {
      if (!E.FIELDS[f]) fail(`${r.id}: requires unknown field "${f}"`);
    });
    if (!r.note) fail(`${r.id}: no note explaining why it ranks here`);
  });
});
E.CORE_FIELDS.forEach(f => { if (!E.FIELDS[f]) fail(`CORE_FIELDS: unknown field "${f}"`); });
Object.keys(E.FIELDS).forEach(function (k) {
  const f = E.FIELDS[k];
  if (f.unitOf && !E.FIELDS[f.unitOf]) fail(`${k}: unitOf points at missing "${f.unitOf}"`);
  if (!f.dict) fail(`${k}: no dictionary definition`);
});
console.log('  ok    every rule, field and methodology reference resolves');

/* --- 3. tables are ordered best-data-first ------------------------------- */
/* Corporate Standard p.44: use the most accurate approach available. A table
   that offers a proxy above a primary method would contradict that.         */

section('Priority ordering');
const RANK = { 'Primary': 0, 'Secondary': 1, 'Proxy': 2, '—': 3 };
E.CATEGORIES.forEach(function (c) {
  let worst = -1;
  c.rules.forEach(function (r) {
    const tier = RANK[E.METHODOLOGIES[r.methodology].tier];
    if (tier < worst) {
      fail(`${c.label}: ${r.id} (${E.METHODOLOGIES[r.methodology].tier}) ranks below a lower-quality rule`);
    }
    worst = Math.max(worst, tier);
  });
});
console.log('  ok    no table offers a rougher method above a better one');

/* --- 4. provenance ------------------------------------------------------- */

section('Provenance');
const uncited = Object.keys(E.METHODOLOGIES).filter(k => !E.METHODOLOGIES[k].source);
if (uncited.length) fail('methods with no citation: ' + uncited.join(', '));
const held = Object.keys(E.METHODOLOGIES).filter(k => E.SOURCES[E.METHODOLOGIES[k].source.src].held);
console.log(`  ok    ${held.length}/${Object.keys(E.METHODOLOGIES).length} methods cite a document on file`);
console.log(`  note  ${Object.keys(E.METHODOLOGIES).length - held.length} rely on documents not held - see docs/METHODOLOGY-RULES.md`);

/* --- 5. determinism ------------------------------------------------------ */

section('Determinism');
const s0 = E.SCENARIOS[0], c0 = E.CATEGORY_BY_ID[s0.values.activityCategory];
const seen = new Set();
for (let i = 0; i < 25; i++) {
  seen.add(E.evaluate(s0.values, c0).methodologyCode + '/' + E.recordHash(s0.values, c0));
}
if (seen.size !== 1) fail('same record produced ' + seen.size + ' different outcomes');
else console.log('  ok    25 runs of the same record -> 1 outcome (' + [...seen][0] + ')');

/* --- summary ------------------------------------------------------------- */

const rules = E.CATEGORIES.reduce((a, c) => a + c.rules.length, 0);
console.log('\n' + (failures
  ? failures + ' FAILURE' + (failures === 1 ? '' : 'S')
  : `PASS - ${E.CATEGORIES.length} activities, ${rules} rules, ${E.SCENARIOS.length} examples`));
process.exit(failures ? 1 : 0);
