/* SustainGHG — live methodology prediction service.
 *
 * The execution plane. It loads ONE published ruleset snapshot plus the
 * evidence bundle that ships with it, and answers prediction requests.
 *
 * What it deliberately cannot do
 * ------------------------------
 *   no model provider      no PDF parser      no vector index
 *   no corpus access       no writes to the ruleset
 *
 * Those are not conventions. This file requires only Node builtins, and
 * service/boundary.test.js fails the build if that stops being true. If the
 * process cannot reach a model, it cannot quietly start depending on one.
 *
 * Why Node rather than Python: assets/engine.js is the rule evaluator and it
 * is already tested. A second implementation in another language is the most
 * likely source of a governed system giving two different answers to the same
 * record, so there is exactly one.
 *
 *   node service/server.js                       newest published ruleset
 *   node service/server.js --ruleset 2026.09.07  pin a version
 */

'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const AUDIT_DIR = path.join(__dirname, 'audit');
const SNAP_DIR = path.join(ROOT, 'ruleset', 'snapshots');
const ENGINE_VERSION = '3.0.0';

/* --------------------------------------------------------------- audit --- */
/* Append-only JSONL, one file per UTC day.
 *
 * Not SQLite. node:sqlite exists but is flagged experimental and "might change
 * at any time", which is the wrong property for a record that has to be
 * readable during a 2029 review of a 2026 decision. A JSONL line needs no
 * library, no schema migration and no running service to read.
 *
 * Only what is needed to REPLAY the decision is stored, never a prose trace:
 * the trace is a pure function of (input_snapshot, ruleset_version,
 * engine_version), so it is regenerated on demand. At 10k records per batch
 * that is the difference between kilobytes and gigabytes.
 *
 * The execution plane writes here and nowhere else. It has no write access to
 * the governed ruleset store, by design and by test. */

let auditSeq = 0;
const auditSeen = new Set();   // (batch_id, record_id) seen this process

function auditPath(when) {
  return path.join(AUDIT_DIR, `audit-${when.toISOString().slice(0, 10)}.jsonl`);
}

function auditLoadSeen() {
  if (!fs.existsSync(AUDIT_DIR)) return;
  for (const f of fs.readdirSync(AUDIT_DIR)) {
    if (!f.endsWith('.jsonl')) continue;
    const lines = fs.readFileSync(path.join(AUDIT_DIR, f), 'utf8').split('\n');
    for (const l of lines) {
      if (!l.trim()) continue;
      try {
        const e = JSON.parse(l);
        if (e.batch_id) auditSeen.add(e.batch_id + '\u0000' + e.record_id);
      } catch (err) { /* a truncated tail must not stop the service */ }
    }
  }
}

function auditWrite(entries) {
  if (!entries.length) return { written: 0, skipped: 0 };
  fs.mkdirSync(AUDIT_DIR, { recursive: true });
  const now = new Date();
  const out = [];
  let skipped = 0;
  for (const e of entries) {
    const key = (e.batch_id || '') + '\u0000' + e.record_id;
    if (e.batch_id && auditSeen.has(key)) { skipped++; continue; }
    if (e.batch_id) auditSeen.add(key);
    out.push(JSON.stringify(Object.assign(
      { prediction_id: `${now.toISOString()}#${++auditSeq}` }, e)));
  }
  if (out.length) fs.appendFileSync(auditPath(now), out.join('\n') + '\n');
  return { written: out.length, skipped };
}

function auditEntry(RS, record, decision, batchId) {
  const inputs = record.inputs || record;
  return {
    batch_id: batchId || null,
    record_id: record.record_id || null,
    ruleset_version: RS.version,
    engine_version: ENGINE_VERSION,
    input_fingerprint: decision.input_fingerprint || null,
    /* kept because the upstream row may change later; the audit must show what
       was evaluated, not what the source system says today */
    input_snapshot: Object.assign({ __category: record.category ||
                                    record.activityCategory }, inputs),
    status: decision.status,
    methodology: decision.methodology || null,
    matched_rule: decision.matched_rule || null,
    decided_at: new Date().toISOString(),
  };
}

/* ------------------------------------------------------------- loading --- */

function newestVersion() {
  const versions = fs.readdirSync(SNAP_DIR)
    .map(f => (f.match(/^ruleset-(.+)\.tables\.js$/) || [])[1])
    .filter(Boolean).sort();
  if (!versions.length) throw new Error('no published ruleset in ' + SNAP_DIR);
  return versions[versions.length - 1];
}

function loadRuleset(version) {
  const tablesPath = path.join(SNAP_DIR, `ruleset-${version}.tables.js`);
  const snapPath = path.join(SNAP_DIR, `ruleset-${version}.json`);
  const evPath = path.join(SNAP_DIR, `ruleset-${version}.evidence.json`);

  const ctx = { console, out: {} };
  vm.createContext(ctx);
  vm.runInContext(
    fs.readFileSync(tablesPath, 'utf8') + '\n' +
    fs.readFileSync(path.join(ROOT, 'assets', 'engine.js'), 'utf8') + `
    out.CATEGORY_BY_ID=CATEGORY_BY_ID; out.CATEGORIES=CATEGORIES;
    out.FIELDS=FIELDS; out.METHODOLOGIES=METHODOLOGIES;
    out.validate=validate; out.evaluate=evaluate; out.isPresent=isPresent;
    out.recordHash=recordHash;`, ctx);

  const snap = JSON.parse(fs.readFileSync(snapPath, 'utf8'));
  const evidence = fs.existsSync(evPath)
    ? JSON.parse(fs.readFileSync(evPath, 'utf8')) : { passages: {} };

  /* The snapshot carries the hash it was published with. Recomputing it here
     would duplicate the canonicalisation rules; instead we hash the file we
     actually loaded, so a tampered artefact is visible even if its embedded
     hash still claims otherwise. */
  const loadedDigest = crypto.createHash('sha256')
    .update(fs.readFileSync(snapPath)).digest('hex');

  return {
    version, E: ctx.out, snap, evidence,
    publishedSha: snap.sha256 || null,
    loadedFileSha: loadedDigest,
    publishedBy: snap.published_by || null,
    publishedAt: snap.published_at || null,
    /* shape -> decision. Valid only within one ruleset version, so it lives
       on the ruleset object and dies when the version changes. */
    shapeCache: new Map(),
  };
}

/* ------------------------------------------------------------ deciding --- */

function resolve(RS, record) {
  const catKey = record.category || record.activityCategory;
  const cat = RS.E.CATEGORY_BY_ID[catKey];
  if (!cat) return { cat: null, catKey };
  const values = Object.assign({ activityCategory: cat.id },
                               record.inputs || record);
  return { cat, catKey, values };
}

function decide(RS, record) {
  const { cat, catKey, values } = resolve(RS, record);
  if (!cat) {
    return { status: 'NO_RULESET',
             detail: `no approved rules for category "${catKey}"` };
  }
  const v = RS.E.validate(values, cat);
  /* The fingerprint identifies the RECORD, so it is emitted whatever the
     outcome. Omitting it on failure made the batch and replay paths disagree
     about 387 validation failures that were in fact identical. */
  const fingerprint = RS.E.recordHash(values, cat);
  if (!v.ok) {
    return { status: 'VALIDATION_FAILED', errors: v.errors,
             category: cat.category || cat.id,
             ruleset_version: RS.version, engine_version: ENGINE_VERSION,
             input_fingerprint: fingerprint };
  }
  return shape(RS, cat, RS.E.evaluate(values, cat), fingerprint);
}

function shape(RS, cat, r, fingerprint) {
  const out = {
    status: r.status || (r.matched ? 'MATCHED' : 'INSUFFICIENT_DATA'),
    framework: RS.snap.framework,
    category: cat.category || cat.id,
    ruleset_version: RS.version,
    engine_version: ENGINE_VERSION,
    input_fingerprint: fingerprint,
  };

  if (out.status === 'MATCHED') {
    const rule = r.matched.rule;
    out.methodology = rule.methodology;
    out.methodology_name = r.methodology.name;
    out.matched_rule = rule.id;
    out.required_inputs = rule.requires;
    out.inputs_satisfied = r.matched.present;
    out.preference_basis = rule.preference_basis || null;
    out.evidence = evidenceFor(RS, rule);
  } else if (out.status === 'MULTIPLE_APPLICABLE' ||
             out.status === 'DUAL_REPORTING_REQUIRED') {
    out.applicable = r.applicable.map(e => ({
      methodology: e.rule.methodology,
      methodology_name: (RS.E.METHODOLOGIES[e.rule.methodology] || {}).name,
      rule: e.rule.id,
      required_inputs: e.rule.requires,
      evidence: evidenceFor(RS, e.rule),
    }));
    out.reason = r.ambiguityReason;
    if (out.status === 'MULTIPLE_APPLICABLE') {
      out.resolution = 'The framework establishes no preference between these. ' +
        'Resolve by organisation policy, recorded as preference_basis = ' +
        'ORGANISATION_POLICY, or by human review.';
    }
  } else {
    out.gaps = r.evaluations.map(e => ({
      rule: e.rule.id, methodology: e.rule.methodology, missing: e.missing,
    }));
  }
  return out;
}

function evidenceFor(RS, rule) {
  const cat = RS.snap.categories.find(c => (c.legacy_id || c.category) === rule.id.split('__')[0]
    || c.category === rule.id.split('__')[0]);
  const sr = cat && cat.rules.find(x => x.rule_id === rule.id);
  const src = sr && sr.source;
  if (!src || !src.document) return null;
  const passage = src.chunk_id ? RS.evidence.passages[src.chunk_id] : null;
  return {
    document: src.document, edition: src.edition, page: src.page,
    quote: src.quote || null,
    passage: passage ? passage.text : null,
    passage_id: src.chunk_id || null,
  };
}

/* Caching, done soundly.
 *
 * Rule MATCHING is presence-based, so two records with the same category and
 * the same populated-field set always match the same rule. VALIDATION is not:
 * it reads values — the reporting year must be in the open window, numbers
 * must be positive, a leak rate must be under 100. Caching on shape alone let
 * a record with leakRate 50 and one with leakRate 3000 share a decision, which
 * replay caught as 18 unreproducible entries.
 *
 * So validation runs per record, always, and only the rule evaluation is
 * cached. Validation is a handful of comparisons; the saving was never there.
 */

function shapeKey(RS, cat, values) {
  const present = Object.keys(values)
    .filter(k => RS.E.isPresent(values, k)).sort().join(',');
  return cat.id + '|' + present;
}

function decideCached(RS, record) {
  const { cat, catKey, values } = resolve(RS, record);
  if (!cat) {
    return { status: 'NO_RULESET',
             detail: `no approved rules for category "${catKey}"` };
  }

  const v = RS.E.validate(values, cat);          // never cached
  const fingerprint = RS.E.recordHash(values, cat);
  if (!v.ok) {
    return { status: 'VALIDATION_FAILED', errors: v.errors,
             category: cat.category || cat.id,
             ruleset_version: RS.version, engine_version: ENGINE_VERSION,
             input_fingerprint: fingerprint };
  }

  const key = shapeKey(RS, cat, values);
  let r = RS.shapeCache.get(key);
  if (r === undefined) {
    r = RS.E.evaluate(values, cat);
    RS.shapeCache.set(key, r);
  }
  return shape(RS, cat, r, fingerprint);
}

/* ------------------------------------------------------------- serving --- */

function json(res, code, body) {
  const b = JSON.stringify(body, null, 2);
  res.writeHead(code, { 'Content-Type': 'application/json',
                        'Content-Length': Buffer.byteLength(b) });
  res.end(b);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let n = 0; const parts = [];
    req.on('data', c => {
      n += c.length;
      if (n > 64 * 1024 * 1024) { reject(new Error('body too large')); req.destroy(); }
      parts.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(parts).toString('utf8')));
    req.on('error', reject);
  });
}

function start(version) {
  const RS = loadRuleset(version);
  const rules = RS.snap.categories.reduce((a, c) => a + c.rules.length, 0);

  auditLoadSeen();

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    try {
      if (req.method === 'GET' && url.pathname === '/healthz') {
        return json(res, 200, { ok: true, ruleset: RS.version });
      }

      if (req.method === 'GET' && url.pathname === '/v1/ruleset') {
        return json(res, 200, {
          ruleset_version: RS.version,
          framework: RS.snap.framework,
          published_at: RS.publishedAt,
          published_by: RS.publishedBy,
          snapshot_sha256: RS.publishedSha,
          loaded_file_sha256: RS.loadedFileSha,
          categories: RS.snap.categories.length,
          rules: rules,
          evidence_passages: Object.keys(RS.evidence.passages || {}).length,
          engine_version: ENGINE_VERSION,
          model_in_request_path: false,
          notes: RS.snap.notes,
        });
      }

      if (req.method === 'POST' && url.pathname === '/v1/methodology:predict') {
        const body = JSON.parse(await readBody(req) || '{}');
        const d = decide(RS, body);
        auditWrite([auditEntry(RS, body, d, body.batch_id)]);
        return json(res, 200, d);
      }

      if (req.method === 'POST' && url.pathname === '/v1/methodology:predictBatch') {
        const raw = await readBody(req);
        const lines = raw.split('\n').map(l => l.trim()).filter(Boolean);
        if (!lines.length) return json(res, 400, { error: 'empty batch' });

        let header = {};
        try { header = JSON.parse(lines[0]); } catch (e) { /* headerless */ }
        const hasHeader = header && header.batch_id !== undefined;
        const recs = (hasHeader ? lines.slice(1) : lines);

        if (hasHeader && header.ruleset_version &&
            header.ruleset_version !== RS.version) {
          /* Pinning matters: a batch decided against two different rulesets is
             an inventory nobody can explain. Refuse rather than silently use
             a different version. */
          return json(res, 409, {
            error: 'ruleset_version_mismatch',
            requested: header.ruleset_version, loaded: RS.version,
            detail: 'Start the service on the requested version, or omit it.' });
        }

        const t0 = process.hrtime.bigint();
        const results = [];
        const recsParsed = [];
        let bad = 0;
        recs.forEach((line, i) => {
          let rec;
          try { rec = JSON.parse(line); }
          catch (e) {
            bad++;
            results.push({ record_id: `line:${i + (hasHeader ? 2 : 1)}`,
                           status: 'VALIDATION_FAILED',
                           errors: ['record is not valid JSON'] });
            return;
          }
          /* One bad record never fails the batch. */
          const d = decideCached(RS, rec);
          d.record_id = rec.record_id || `line:${i + (hasHeader ? 2 : 1)}`;
          recsParsed.push(rec);
          results.push(d);
        });
        const ms = Number(process.hrtime.bigint() - t0) / 1e6;

        const audited = auditWrite(results
          .filter(r => !String(r.record_id).startsWith('line:') || r.status !== 'VALIDATION_FAILED')
          .map((r, i) => auditEntry(RS, recsParsed[i] || { record_id: r.record_id },
                                    r, header.batch_id)));

        const counts = {};
        results.forEach(r => { counts[r.status] = (counts[r.status] || 0) + 1; });
        return json(res, 200, {
          batch_id: header.batch_id || null,
          ruleset_version: RS.version,
          engine_version: ENGINE_VERSION,
          records: results.length,
          unparseable: bad,
          distinct_shapes: RS.shapeCache.size,
          elapsed_ms: Math.round(ms * 100) / 100,
          audit: audited,
          status_counts: counts,
          results,
        });
      }

      return json(res, 404, { error: 'not found' });
    } catch (e) {
      return json(res, 500, { error: String(e && e.message || e) });
    }
  });

  server.listen(5100, '127.0.0.1', () => {
    console.log(`methodology service — ruleset ${RS.version}`);
    console.log(`  ${RS.snap.categories.length} categories, ${rules} rules, ` +
                `${Object.keys(RS.evidence.passages || {}).length} evidence passages`);
    console.log(`  sha256 ${String(RS.publishedSha).slice(0, 16)}…`);
  console.log('  no model, no PDF parser, no vector index in this process');
    console.log(`  audit -> ${path.relative(ROOT, AUDIT_DIR)}/ (append-only JSONL)`);
    console.log('  http://127.0.0.1:5100');
  });
  return server;
}

if (require.main === module) {
  const i = process.argv.indexOf('--ruleset');
  start(i > -1 ? process.argv[i + 1] : newestVersion());
}

module.exports = { loadRuleset, decide, decideCached, newestVersion, start };
