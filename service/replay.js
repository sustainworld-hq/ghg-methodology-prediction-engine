/* Replay every audited decision and prove it still reproduces.
 *
 * This is what makes the audit trail worth keeping. Each entry records the
 * input snapshot, the ruleset version and the engine version — enough to
 * re-run the decision exactly. If a replay disagrees with what was recorded,
 * something that was supposed to be immutable was not, and that is precisely
 * the alarm you want.
 *
 * No model. Re-deciding with a model would prove nothing, because the point is
 * that the production path is deterministic.
 *
 * Run it on a schedule, not only when someone asks.
 *
 *   node service/replay.js
 *   node service/replay.js --since 2026-09-01 --verbose
 */

'use strict';

const fs = require('fs');
const path = require('path');

const svc = require('./server.js');
const AUDIT_DIR = path.join(__dirname, 'audit');

function entries(since) {
  if (!fs.existsSync(AUDIT_DIR)) return [];
  const out = [];
  for (const f of fs.readdirSync(AUDIT_DIR).sort()) {
    if (!f.endsWith('.jsonl')) continue;
    const day = (f.match(/audit-(\d{4}-\d{2}-\d{2})\.jsonl/) || [])[1];
    if (since && day && day < since) continue;
    const text = fs.readFileSync(path.join(AUDIT_DIR, f), 'utf8');
    text.split('\n').forEach((line, i) => {
      if (!line.trim()) return;
      try { out.push(JSON.parse(line)); }
      catch (e) { out.push({ __corrupt: true, file: f, line: i + 1 }); }
    });
  }
  return out;
}

function main() {
  const argv = process.argv.slice(2);
  const since = argv.includes('--since') ? argv[argv.indexOf('--since') + 1] : null;
  const verbose = argv.includes('--verbose');

  const all = entries(since);
  if (!all.length) {
    console.log('no audit entries found in ' + path.relative(process.cwd(), AUDIT_DIR));
    return 0;
  }

  const corrupt = all.filter(e => e.__corrupt);
  const rows = all.filter(e => !e.__corrupt);

  /* Load each ruleset version once. An entry naming a version whose snapshot
     is gone is itself a finding: the decision can no longer be explained. */
  const cache = new Map();
  function rulesetFor(v) {
    if (!cache.has(v)) {
      try { cache.set(v, svc.loadRuleset(v)); }
      catch (e) { cache.set(v, null); }
    }
    return cache.get(v);
  }

  let same = 0;
  const mismatches = [];
  const unreplayable = [];

  for (const e of rows) {
    const RS = rulesetFor(e.ruleset_version);
    if (!RS) {
      unreplayable.push({ e, why: `ruleset ${e.ruleset_version} is not on disk` });
      continue;
    }
    if (e.engine_version !== '3.0.0') {
      unreplayable.push({ e, why: `recorded under engine ${e.engine_version}, ` +
                                  `this binary is 3.0.0` });
      continue;
    }
    const snap = Object.assign({}, e.input_snapshot);
    const category = snap.__category;
    delete snap.__category;

    const now = svc.decide(RS, { category, inputs: snap });
    const agrees = now.status === e.status &&
                   (now.matched_rule || null) === (e.matched_rule || null) &&
                   (now.input_fingerprint || null) === (e.input_fingerprint || null);
    if (agrees) { same++; if (verbose) console.log(`  ok    ${e.record_id} ${e.status}`); }
    else {
      mismatches.push({ e, now });
      console.log(`  DIFFERS  ${e.record_id || e.prediction_id}`);
      console.log(`     recorded: ${e.status} / ${e.matched_rule || '-'} / ${e.input_fingerprint}`);
      console.log(`     replayed: ${now.status} / ${now.matched_rule || '-'} / ${now.input_fingerprint}`);
      console.log(`     ruleset ${e.ruleset_version}, decided ${e.decided_at}`);
    }
  }

  console.log();
  console.log(`replayed ${rows.length} audited decision(s)`);
  console.log(`  reproduced exactly : ${same}`);
  console.log(`  DIFFER             : ${mismatches.length}`);
  console.log(`  not replayable     : ${unreplayable.length}`);
  console.log(`  corrupt lines      : ${corrupt.length}`);
  for (const u of unreplayable.slice(0, 5)) {
    console.log(`     ${u.e.record_id || u.e.prediction_id}: ${u.why}`);
  }

  if (mismatches.length) {
    console.log('\nALARM: a recorded decision no longer reproduces. Either a');
    console.log('published ruleset was modified in place, or the engine changed');
    console.log('semantics without a version bump. Both are governance failures.');
  } else if (!unreplayable.length && !corrupt.length) {
    console.log('\nPASS — every audited decision reproduces exactly.');
  }
  return mismatches.length ? 1 : 0;
}

if (require.main === module) process.exit(main());
module.exports = { entries };
