/* The execution plane's boundary, enforced rather than documented.
 *
 * §1 of docs/ENTERPRISE-ARCHITECTURE.md says the prediction service has no
 * model provider, no PDF parser, no vector index and no write access to the
 * ruleset. A comment saying so decays the first time someone adds an import
 * "just for a moment". This fails the build instead.
 *
 *   node service/boundary.test.js
 */

'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');

const ROOT = path.join(__dirname, '..');
const SERVICE = path.join(__dirname, 'server.js');

let failures = 0;
const fail = m => { failures++; console.log('  FAIL  ' + m); };
const ok = m => console.log('  ok    ' + m);

/* --- 1. only Node builtins may be required -------------------------------- */

const ALLOWED = new Set(['http', 'fs', 'path', 'vm', 'crypto', 'url', 'os',
                         'util', 'stream', 'events', 'assert']);
const src = fs.readFileSync(SERVICE, 'utf8');
const required = [...src.matchAll(/require\(['"]([^'"]+)['"]\)/g)].map(m => m[1]);
const foreign = required.filter(r => !ALLOWED.has(r) && !r.startsWith('.'));
if (foreign.length) fail('service requires non-builtin modules: ' + foreign.join(', '));
else ok(`requires only Node builtins (${[...new Set(required)].join(', ')})`);

/* --- 2. no relative import escapes into the authoring plane --------------- */

const rel = required.filter(r => r.startsWith('.'));
if (rel.length) fail('service has relative imports: ' + rel.join(', '));
else ok('no imports from the authoring plane');

/* --- 3. nothing that smells like a model client, parser or index ---------- */

const BANNED = [
  ['groq', /groq/i], ['openai', /openai/i], ['anthropic', /anthropic/i],
  ['api key', /api[_-]?key/i], ['completions endpoint', /chat\/completions/i],
  ['pdf parser', /\bfitz\b|pdfjs|pdf-parse|pymupdf/i],
  ['vector index', /faiss|embedding|sentence[-_]transformer/i],
  ['corpus path', /knowledge[\/\\]corpus/i],
  ['knowledge store', /knowledge\.db/i],
];
BANNED.forEach(([label, re]) => {
  /* the file's own prose says what it does NOT do; only flag real code */
  const code = src.split('\n')
    .filter(l => !/^\s*(\*|\/\*|\/\/)/.test(l)).join('\n');
  if (re.test(code)) fail(`service mentions ${label} in code`);
});
if (!failures) ok('no model client, PDF parser, vector index or corpus access');

/* --- 4. it only reads published artefacts, never the ruleset store -------- */

if (/store\.db/.test(src)) fail('service touches the ruleset store directly');
else ok('reads published snapshots only, never the governed store');

/* --- 5. and it actually works: load, decide, serve ------------------------ */

const svc = require('./server.js');
const version = svc.newestVersion();
const RS = svc.loadRuleset(version);
ok(`loaded ruleset ${version} (${RS.snap.categories.length} categories)`);

const CTX = { reportingYear: '2026', country: 'India' };
const withCtx = o => Object.assign({}, CTX, o);

const cases = [
  ['single applicable method',
   { category: 'purchasedElectricity',
     inputs: withCtx({ energyConsumption: '5000', energyUnit: 'kWh',
               gridRegion: 'Southern Region (SR)' }) }, 'MATCHED'],
  ['several apply, nothing orders them',
   { category: 'mobileCombustion',
     inputs: withCtx({ fuelQuantity: '64', fuelUnit: 'litre', fuelType: 'Diesel',
               distance: '820', distanceUnit: 'km',
               mode: 'Road — Car (Diesel)' }) }, 'MULTIPLE_APPLICABLE'],
  ['framework wants both figures',
   { category: 'purchasedElectricity',
     inputs: withCtx({ energyConsumption: '5000', energyUnit: 'kWh',
               gridRegion: 'Southern Region (SR)',
               contractualInstrument: 'I-REC (India)' }) },
   'DUAL_REPORTING_REQUIRED'],
  ['nothing measurable',
   { category: 'businessTravel', inputs: withCtx({}) }, 'INSUFFICIENT_DATA'],
  ['unknown category',
   { category: 'NOT_A_CATEGORY', inputs: withCtx({}) }, 'NO_RULESET'],
  ['quantity with no unit',
   { category: 'businessTravel',
     inputs: withCtx({ distance: '1200', mode: 'Air — Short Haul (<1,600 km)' }) },
   'VALIDATION_FAILED'],
];

cases.forEach(([label, rec, want]) => {
  const got = svc.decide(RS, rec).status;
  if (got === want) ok(`${label} -> ${got}`);
  else fail(`${label}: expected ${want}, got ${got}`);
});

/* --- 6. determinism across repeated calls --------------------------------- */

const rec = cases[0][1];
const seen = new Set();
for (let i = 0; i < 50; i++) {
  const d = svc.decide(RS, rec);
  seen.add(d.status + '/' + d.matched_rule + '/' + d.input_fingerprint);
}
if (seen.size !== 1) fail(`50 identical calls produced ${seen.size} outcomes`);
else ok('50 identical calls -> 1 outcome ' + [...seen][0]);

/* --- 7. the shape cache must not change any answer ------------------------ */

const probe = [];
RS.snap.categories.slice(0, 12).forEach(c => {
  const legacy = c.legacy_id || c.category;
  probe.push({ category: legacy, inputs: withCtx({}) });
  const r0 = c.rules[0];
  if (r0) {
    const inputs = Object.assign({}, CTX);
    r0.requires.forEach(f => {
      const fd = RS.snap.fields[f];
      inputs[f] = fd && fd.kind === 'number' ? '100'
        : (fd && fd.options ? fd.options[0] : 'x');
      if (fd && fd.unitOf) inputs[fd.unitOf] = RS.snap.fields[fd.unitOf].options[0];
    });
    probe.push({ category: legacy, inputs });
  }
});
let drift = 0;
probe.forEach(p => {
  const direct = svc.decide(RS, p);
  const cached = svc.decideCached(RS, p);
  if (direct.status !== cached.status ||
      direct.matched_rule !== cached.matched_rule) drift++;
});
if (drift) fail(`${drift}/${probe.length} records differ between direct and cached`);
else ok(`shape cache agrees with direct evaluation on ${probe.length} records`);

/* The cache bug replay actually caught: identical shape, different values.
   Validation reads values, so these two must NOT share a decision. */
const sameShape = [
  { category: 'fugitiveRefrigerants',
    inputs: withCtx({ refrigerantType: 'R-410A', equipmentCharge: '310',
                      leakRate: '8' }) },
  { category: 'fugitiveRefrigerants',
    inputs: withCtx({ refrigerantType: 'R-410A', equipmentCharge: '310',
                      leakRate: '3000' }) },   // over 100% — must be rejected
];
const s0 = svc.decideCached(RS, sameShape[0]).status;
const s1 = svc.decideCached(RS, sameShape[1]).status;
if (s0 === s1) fail(`value-sensitive validation was cached away: both -> ${s0}`);
else ok(`identical shape, different values -> ${s0} and ${s1}`);

const yr = [
  { category: 'businessTravel', inputs: Object.assign({}, CTX,
      { distance: '100', distanceUnit: 'km', mode: 'Rail — Intercity' }) },
  { category: 'businessTravel', inputs: Object.assign({}, CTX,
      { reportingYear: '2019', distance: '100', distanceUnit: 'km',
        mode: 'Rail — Intercity' }) },        // outside the open window
];
const y0 = svc.decideCached(RS, yr[0]).status;
const y1 = svc.decideCached(RS, yr[1]).status;
if (y0 === y1) fail(`closed reporting year was cached away: both -> ${y0}`);
else ok(`same shape, closed reporting year -> ${y0} and ${y1}`);

/* --- 8. batch: one bad record must not fail the batch --------------------- */

/* port 0 = let the OS pick. The test must be runnable while the real
   service is up; it used to die with EADDRINUSE. */
const server = svc.start(version, 0);
setTimeout(() => {
  const ndjson = [
    JSON.stringify({ batch_id: 'b-test', ruleset_version: version }),
    JSON.stringify({ record_id: 'r1', category: 'purchasedElectricity',
                     inputs: withCtx({ energyConsumption: '5000', energyUnit: 'kWh',
                               gridRegion: 'Southern Region (SR)' }) }),
    '{ this is not json',
    JSON.stringify({ record_id: 'r3', category: 'businessTravel', inputs: withCtx({}) }),
  ].join('\n');

  const req = http.request(
    { host: '127.0.0.1', port: server.address().port, method: 'POST',
      path: '/v1/methodology:predictBatch',
      headers: { 'Content-Type': 'application/x-ndjson' } },
    resp => {
      let b = '';
      resp.on('data', d => { b += d; });
      resp.on('end', () => {
        const r = JSON.parse(b);
        if (r.records === 3 && r.unparseable === 1) {
          ok(`batch survived a malformed record (${r.records} results, ` +
             `${r.unparseable} unparseable)`);
        } else {
          fail(`batch handling wrong: ${JSON.stringify(r.status_counts)}`);
        }
        server.close();
        console.log('\n' + (failures ? `${failures} FAILING`
          : 'PASS — execution plane boundary holds'));
        process.exit(failures ? 1 : 0);
      });
    });
  req.on('error', e => { fail('batch request failed: ' + e.message);
                         server.close(); process.exit(1); });
  req.end(ndjson);
}, 300);
