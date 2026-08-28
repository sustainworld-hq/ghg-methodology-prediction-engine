/* Round-trip validation.

   Runs ground-truth activity records through the deterministic engine and
   compares the predicted method with what the standards say it should be.

   The point is not to test the engine - tools/test-rules.js does that. The
   point is to have ONE measuring stick that works against ANY decision table,
   so that when M2/M3 derive tables from the documents we can ask the only
   question that matters:

       do the derived rules behave like the authored ones?

   Usage
     node tools/roundtrip.js                          test the authored tables
     node tools/roundtrip.js --tables path/to/x.js    test a derived table set
     node tools/roundtrip.js --diff path/to/x.js      compare rules, authored vs derived
     node tools/roundtrip.js --strict                 fail on known-defect cases too
*/

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const CASES = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'tests', 'activity-cases.json'), 'utf8'));

function loadTables(tablesPath) {
  const ctx = { console, out: {} };
  vm.createContext(ctx);
  vm.runInContext(
    fs.readFileSync(tablesPath, 'utf8') + '\n' +
    fs.readFileSync(path.join(ROOT, 'assets', 'engine.js'), 'utf8') + `
    out.CATEGORIES=CATEGORIES; out.CATEGORY_BY_ID=CATEGORY_BY_ID;
    out.FIELDS=FIELDS; out.METHODOLOGIES=METHODOLOGIES;
    out.isPresent=isPresent; out.validate=validate; out.evaluate=evaluate;`, ctx);
  return ctx.out;
}

function run(E, record) {
  const cat = E.CATEGORY_BY_ID[record.activityCategory];
  if (!cat) return { actual: '__unknown_category__' };
  const v = E.validate(record, cat);
  if (!v.ok) return { actual: '__validation_failure__', errors: v.errors };
  const r = E.evaluate(record, cat);
  return {
    actual: r.methodology.name,
    rule: r.matched ? r.matched.rule.id : null,
    priority: r.matched ? r.matched.rule.priority : null,
    alsoQualified: r.evaluations.filter(e => e.status === 'lower')
                               .map(e => E.METHODOLOGIES[e.rule.methodology].name),
  };
}

/* ---------------------------------------------------------------- report -- */

function report(E, label, strict) {
  const rows = CASES.cases.map(c => {
    const res = run(E, c.record);
    const pass = res.actual === c.expect;
    return { c, res, pass };
  });

  const known = rows.filter(r => r.c.expect_is_wrong);
  const real = rows.filter(r => !r.c.expect_is_wrong);
  const failed = real.filter(r => !r.pass);

  console.log(`\n=== ${label} ===\n`);
  const byTest = {};
  rows.forEach(r => (r.c.tests || ['other']).forEach(t => {
    byTest[t] = byTest[t] || { pass: 0, total: 0 };
    byTest[t].total++;
    if (r.pass) byTest[t].pass++;
  }));

  rows.forEach(r => {
    const mark = r.c.expect_is_wrong ? 'DEFECT' : (r.pass ? 'pass  ' : 'FAIL  ');
    const extra = r.res.rule ? `  ${r.res.rule} p${r.res.priority}` : '';
    console.log(`  ${mark} ${r.c.id.padEnd(30)} ${r.res.actual}${extra}`);
    if (!r.pass && !r.c.expect_is_wrong) {
      console.log(`         expected: ${r.c.expect}`);
      console.log(`         basis:    ${r.c.basis}${r.c.cite ? ' — ' + r.c.cite : ''}`);
      console.log(`         why:      ${r.c.why}`);
    }
    if (r.res.alsoQualified && r.res.alsoQualified.length) {
      console.log(`         (also qualified, outranked: ${r.res.alsoQualified.join(', ')})`);
    }
  });

  console.log('\n  by what it tests:');
  Object.keys(byTest).sort().forEach(t => {
    const b = byTest[t];
    console.log(`    ${t.padEnd(12)} ${b.pass}/${b.total}   ${CASES.tests_key[t] || ''}`);
  });

  const cited = real.filter(r => r.c.basis === 'cited').length;
  console.log(`\n  ${cited}/${real.length} expectations are backed by a citation; ` +
              `the rest are engineering judgement.`);

  if (known.length) {
    console.log(`\n  ${known.length} case(s) record a KNOWN DEFECT rather than correct behaviour:`);
    known.forEach(r => console.log(`    ${r.c.id} — ${r.c.name}`));
  }

  const bad = failed.length + (strict ? known.length : 0);
  console.log(`\n  ${real.length - failed.length}/${real.length} passing` +
              (bad ? `  — ${bad} FAILING` : ''));
  return bad;
}

/* ------------------------------------------------------------------ diff -- */

function diff(a, b, labelA, labelB) {
  console.log(`\n=== rule diff: ${labelA} vs ${labelB} ===\n`);
  const idsA = new Set(a.CATEGORIES.map(c => c.id));
  const idsB = new Set(b.CATEGORIES.map(c => c.id));
  let changes = 0;

  [...idsA].filter(i => !idsB.has(i)).forEach(i => {
    console.log(`  only in ${labelA}: category ${i}`); changes++;
  });
  [...idsB].filter(i => !idsA.has(i)).forEach(i => {
    console.log(`  only in ${labelB}: category ${i}`); changes++;
  });

  a.CATEGORIES.filter(c => idsB.has(c.id)).forEach(ca => {
    const cb = b.CATEGORIES.find(x => x.id === ca.id);
    const sig = (E, r) => `${r.requires.join('+')} -> ${r.methodology}`;
    const ra = ca.rules.map(r => sig(a, r));
    const rb = cb.rules.map(r => sig(b, r));
    if (JSON.stringify(ra) !== JSON.stringify(rb)) {
      changes++;
      console.log(`  ${ca.label}`);
      const n = Math.max(ra.length, rb.length);
      for (let i = 0; i < n; i++) {
        if (ra[i] === rb[i]) continue;
        console.log(`     priority ${i + 1}`);
        console.log(`       ${labelA}: ${ra[i] || '(none)'}`);
        console.log(`       ${labelB}: ${rb[i] || '(none)'}`);
      }
    }
  });
  console.log(changes ? `\n  ${changes} categor(y/ies) differ` : '\n  identical');
  return changes;
}

/* ------------------------------------------------------------------ main -- */

function main() {
  const argv = process.argv.slice(2);
  const get = f => { const i = argv.indexOf(f); return i > -1 ? argv[i + 1] : null; };
  const strict = argv.includes('--strict');
  const authored = path.join(ROOT, 'assets', 'decision-tables.js');
  const alt = get('--tables') || get('--diff');

  const A = loadTables(authored);

  if (get('--diff')) {
    const B = loadTables(path.resolve(get('--diff')));
    diff(A, B, 'authored', path.basename(get('--diff')));
    const failA = report(A, 'authored tables', strict);
    const failB = report(B, path.basename(get('--diff')), strict);
    console.log(`\n${'='.repeat(64)}`);
    console.log(failA === failB
      ? `Both table sets fail the same ${failA} case(s) — derived behaviour matches.`
      : `DIVERGENCE: authored fails ${failA}, derived fails ${failB}.`);
    return failB > failA ? 1 : 0;
  }

  const target = alt ? path.resolve(alt) : authored;
  const E = alt ? loadTables(target) : A;
  const bad = report(E, alt ? path.basename(target) : 'authored tables', strict);

  console.log('\nThis is the gate M2/M3 must eventually pass with DERIVED tables:');
  console.log('  node tools/roundtrip.js --diff <derived-tables.js>');
  return bad ? 1 : 0;
}

process.exit(main());
