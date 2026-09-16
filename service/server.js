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
const SNAP_DIR = path.join(ROOT, 'ruleset', 'snapshots');
const ENGINE_VERSION = '3.0.0';

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

function decide(RS, record) {
  const E = RS.E;
  const catKey = record.category || record.activityCategory;
  const cat = E.CATEGORY_BY_ID[catKey];
  if (!cat) {
    return { status: 'NO_RULESET',
             detail: `no approved rules for category "${catKey}"` };
  }

  const values = Object.assign({ activityCategory: cat.id }, record.inputs || record);

  const v = E.validate(values, cat);
  if (!v.ok) {
    return { status: 'VALIDATION_FAILED', errors: v.errors,
             category: cat.category || cat.id };
  }

  const r = E.evaluate(values, cat);
  const out = {
    status: r.status || (r.matched ? 'MATCHED' : 'INSUFFICIENT_DATA'),
    framework: RS.snap.framework,
    category: cat.category || cat.id,
    ruleset_version: RS.version,
    engine_version: ENGINE_VERSION,
    input_fingerprint: E.recordHash(values, cat),
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
      rule: e.rule.id,
      methodology: e.rule.methodology,
      missing: e.missing,
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

/* shape = category + which fields are populated. Same shape, same decision. */
function shapeKey(RS, record) {
  const catKey = record.category || record.activityCategory;
  const inputs = record.inputs || record;
  const present = Object.keys(inputs)
    .filter(k => RS.E.isPresent(inputs, k)).sort().join(',');
  return catKey + '|' + present;
}

function decideCached(RS, record) {
  const key = shapeKey(RS, record);
  let hit = RS.shapeCache.get(key);
  if (hit === undefined) {
    hit = decide(RS, record);
    RS.shapeCache.set(key, hit);
  }
  /* fingerprint is per-record, not per-shape */
  const catKey = record.category || record.activityCategory;
  const cat = RS.E.CATEGORY_BY_ID[catKey];
  const out = Object.assign({}, hit);
  if (cat && hit.status !== 'NO_RULESET') {
    const values = Object.assign({ activityCategory: cat.id },
                                 record.inputs || record);
    out.input_fingerprint = RS.E.recordHash(values, cat);
  }
  return out;
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
        return json(res, 200, decide(RS, body));
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
          results.push(d);
        });
        const ms = Number(process.hrtime.bigint() - t0) / 1e6;

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
    console.log('  http://127.0.0.1:5100');
  });
  return server;
}

if (require.main === module) {
  const i = process.argv.indexOf('--ruleset');
  start(i > -1 ? process.argv[i + 1] : newestVersion());
}

module.exports = { loadRuleset, decide, decideCached, newestVersion, start };
