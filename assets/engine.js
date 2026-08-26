/* ==========================================================================
   SustainGHG - Methodology Prediction Engine :: THE ENGINE
   --------------------------------------------------------------------------
   Pure logic. No DOM, no globals, no defaults, no guessing. Given the same
   activity record it always returns the same prediction - that is the whole
   point of the module. The UI in ui.js only displays what these return.
   ========================================================================== */

var esc = function (s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
};
var fmtNum = function (v) {
  var n = Number(v);
  if (!isFinite(n)) return String(v);
  return n.toLocaleString('en-IN', { maximumFractionDigits: 4 });
};

/* ============================ 2. THE ENGINE ==============================
   Pure. No DOM, no defaults, no inference. Given the same record it returns
   the same prediction, which is the entire point of the module.            */

/* A field counts as present when it holds a value the table can read.
   A numeric zero is not an activity; a blank select is not a choice.       */
function isPresent(values, id) {
  const v = values[id];
  if (v === undefined || v === null || String(v).trim() === '') return false;
  if (FIELDS[id] && FIELDS[id].kind === 'number') {
    const n = Number(v);
    return isFinite(n) && n > 0;
  }
  return true;
}

/* Every field the current table can read, including unit companions. */
function usedFieldsOf(cat) {
  const set = new Set(['activityCategory', 'activityType', 'reportingYear', 'country']);
  cat.rules.forEach(function (r) {
    r.requires.concat(r.optional || []).forEach(function (f) {
      set.add(f);
      if (FIELDS[f] && FIELDS[f].unitOf) set.add(FIELDS[f].unitOf);
    });
  });
  return set;
}

/* --- validation ---------------------------------------------------------- */

function validate(values, cat) {
  const checks = [];
  const errors = [];
  const warnings = [];
  const YEAR_MIN = 2021, YEAR_MAX = 2027;

  /* 1 - category identified */
  checks.push({
    name: 'Activity category identified',
    status: 'pass',
    detail: cat.table + ' ' + cat.tableVersion
  });

  /* 2 - required fields present */
  const readable = cat.fields.filter(function (f) { return isPresent(values, f); });
  if (!values.activityType) {
    warnings.push('No activity template selected. Template narrows expected inputs but does not change rule priority.');
  }
  if (readable.length === 0) {
    warnings.push('No measurable input was supplied for this category. Every rule will fail its input test.');
  }
  checks.push({
    name: 'Required fields checked',
    status: readable.length === 0 ? 'warn' : 'pass',
    detail: readable.length + ' of ' + cat.fields.length + ' inputs populated'
  });

  /* 3 - units */
  let unitsChecked = 0;
  Object.keys(FIELDS).forEach(function (id) {
    const f = FIELDS[id];
    if (!f.unitOf || !isPresent(values, id)) return;
    unitsChecked++;
    const unit = values[f.unitOf];
    const allowed = FIELDS[f.unitOf].options;
    if (!unit || String(unit).trim() === '') {
      errors.push(f.label + ' was given as ' + fmtNum(values[id]) +
        ' with no unit. The engine will not assume one.');
    } else if (allowed.indexOf(unit) === -1) {
      errors.push(f.label + ' carries unit "' + unit + '", which is not in the governed ' +
        FIELDS[f.unitOf].dim + ' unit set.');
    }
  });
  checks.push({
    name: 'Units validated',
    status: errors.length ? 'fail' : 'pass',
    detail: unitsChecked === 0 ? 'no quantities to check' :
      unitsChecked + ' quantity/unit ' + (unitsChecked === 1 ? 'pair' : 'pairs')
  });

  /* 4 - values */
  const valueErrors = [];
  Object.keys(values).forEach(function (id) {
    const f = FIELDS[id];
    if (!f || f.kind !== 'number') return;
    const raw = String(values[id]).trim();
    if (raw === '') return;
    const n = Number(raw);
    if (!isFinite(n)) valueErrors.push(f.label + ' is not a number.');
    else if (n < 0) valueErrors.push(f.label + ' is negative (' + raw + '). Activity data cannot be below zero.');
    else if (n === 0) warnings.push(f.label + ' is zero and will be read as "not provided".');
  });
  if (isPresent(values, 'leakRate') && Number(values.leakRate) > 100) {
    valueErrors.push('Assumed Leak Rate is above 100%.');
  }
  if (isPresent(values, 'ownershipShare') && Number(values.ownershipShare) > 100) {
    valueErrors.push('Ownership Share is above 100%.');
  }
  const yr = Number(values.reportingYear);
  if (!isFinite(yr) || yr < YEAR_MIN || yr > YEAR_MAX) {
    valueErrors.push('Reporting Year ' + values.reportingYear + ' is outside the open window ' +
      YEAR_MIN + '-' + YEAR_MAX + '.');
  }
  valueErrors.forEach(function (e) { errors.push(e); });
  checks.push({
    name: 'Input values validated',
    status: valueErrors.length ? 'fail' : 'pass',
    detail: valueErrors.length ? valueErrors.length + ' rejected' : 'ranges and signs in bounds'
  });

  /* 5 - coherence: things that are legal but suspicious */
  const u = values.distanceUnit;
  if (u === 'tonne.km' && !isPresent(values, 'freightMass')) {
    warnings.push('Distance is in tonne.km but no shipment weight was supplied. Confirm the distance is already weight-adjusted.');
  }
  if (u === 'passenger.km' && /Road — HGV|Sea — Container|Air — Freight|Rail — Freight/.test(values.mode || '')) {
    warnings.push('passenger.km is paired with a freight mode. Check the unit against the movement type.');
  }
  if (isPresent(values, 'spend') && isPresent(values, 'distance')) {
    warnings.push('Both spend and distance are present. Spend sits below distance in this table and will not be selected.');
  }
  if (cat.id === 'purchasedElectricity' && isPresent(values, 'gridRegion') && isPresent(values, 'contractualInstrument')) {
    warnings.push('Grid region and a contractual instrument are both present. Dual reporting expects both figures; this run predicts the location-based method only.');
  }
  checks.push({
    name: 'Cross-field coherence',
    status: warnings.length ? 'warn' : 'pass',
    detail: warnings.length ? warnings.length + ' advisory' : 'no conflicts'
  });

  return { checks: checks, errors: errors, warnings: warnings, ok: errors.length === 0 };
}

/* --- rule evaluation ----------------------------------------------------- */

function evaluate(values, cat) {
  const evaluations = cat.rules.map(function (rule) {
    const present = [], missing = [];
    rule.requires.forEach(function (f) {
      (isPresent(values, f) ? present : missing).push(f);
    });
    const optionalPresent = (rule.optional || []).filter(function (f) { return isPresent(values, f); });
    return {
      rule: rule,
      satisfied: missing.length === 0,
      present: present,
      missing: missing,
      optionalPresent: optionalPresent,
      status: 'pending'
    };
  });

  let matched = null;
  evaluations.forEach(function (e) {
    if (e.satisfied && !matched) { matched = e; e.status = 'hit'; }
    else if (e.satisfied) { e.status = 'lower'; }
    else { e.status = 'miss'; }
  });

  const code = matched ? matched.rule.methodology : 'INSUFFICIENT';
  return {
    category: cat,
    evaluations: evaluations,
    matched: matched,
    methodologyCode: code,
    methodology: METHODOLOGIES[code],
    fieldsRead: cat.rules.reduce(function (acc, r) {
      r.requires.forEach(function (f) { if (acc.indexOf(f) === -1) acc.push(f); });
      return acc;
    }, [])
  };
}

/* --- a stable fingerprint of the record, to make determinism visible ----- */
function recordHash(values, cat) {
  const keys = Object.keys(values).filter(function (k) { return String(values[k]).trim() !== ''; }).sort();
  const canon = cat.id + '|' + keys.map(function (k) { return k + '=' + values[k]; }).join('|');
  let h = 0x811c9dc5;
  for (let i = 0; i < canon.length; i++) {
    h ^= canon.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return ('00000000' + h.toString(16)).slice(-8).toUpperCase();
}

/* --- narrative built from the evaluation, never hand-written ------------- */

function explain(run) {
  const cat = run.category;
  if (run.matched) {
    const r = run.matched.rule;
    const names = run.matched.present.map(function (f) { return '<em>' + esc(FIELDS[f].short) + '</em>'; });
    const list = names.length === 1 ? names[0]
      : names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1];
    const outranked = run.evaluations.filter(function (e) { return e.status === 'lower'; });
    let txt = list + ' were provided on this activity record, satisfying <em>' + esc(r.id) +
      '</em> — priority ' + r.priority + ' of ' + cat.rules.length + ' in the ' + esc(cat.label) +
      ' decision table. Evaluation stopped at the first satisfied rule, so the predicted methodology is <em>' +
      esc(run.methodology.name) + '</em>.';
    if (outranked.length) {
      txt += ' ' + (outranked.length === 1 ? 'Rule ' + outranked[0].rule.id + ' was also satisfied but sits'
        : 'Rules ' + outranked.map(function (e) { return e.rule.id; }).join(' and ') + ' were also satisfied but sit') +
        ' lower in the governed priority order, so ' + (outranked.length === 1 ? 'it was' : 'they were') +
        ' recorded and not selected.';
    }
    return txt;
  }
  const gaps = run.evaluations.map(function (e) {
    return e.rule.id + ' needs ' + e.missing.map(function (f) { return FIELDS[f].short; }).join(' and ');
  });
  return 'No rule in the ' + esc(cat.label) + ' decision table was satisfied. ' +
    esc(gaps.join('; ')) + '. The engine does not substitute a default factor or fall back to a ' +
    'lower-quality method that was not authorised for this record, so the activity is returned for completion.';
}

/* --- the audit trace ----------------------------------------------------- */

function buildTrace(run, validation, values) {
  const cat = run.category;
  const steps = [];
  const push = function (t, v, tone) { steps.push({ t: t, v: v, tone: tone || '' }); };

  push('Activity category identified', cat.label + '  (' + cat.scope + ' · ' + cat.ghgCat + ')', 'ok');
  push('Decision table loaded', cat.table + ' ' + cat.tableVersion + ' — ' + cat.rules.length + ' rules', 'ok');
  push('Input validation completed',
    validation.checks.filter(function (c) { return c.status === 'pass'; }).length + ' of ' +
    validation.checks.length + ' checks clean, ' + validation.warnings.length + ' advisory',
    validation.errors.length ? 'no' : 'ok');

  run.evaluations.forEach(function (e) {
    push('Rule ' + e.rule.priority + ' evaluated', e.rule.id + ' — ' + e.rule.label);
    if (e.satisfied) {
      push('Required inputs present', 'YES — ' + e.present.map(function (f) {
        return FIELDS[f].short + '=' + (FIELDS[f].kind === 'number' ? fmtNum(values[f]) : values[f]);
      }).join(', '), 'ok');
      push(e.status === 'hit' ? 'Rule matched' : 'Rule matched but outranked',
        METHODOLOGIES[e.rule.methodology].name +
        (e.status === 'hit' ? '' : ' — priority ' + e.rule.priority + ' below the selected rule'),
        e.status === 'hit' ? 'ok' : '');
    } else {
      push('Required inputs present', 'NO — missing ' + e.missing.map(function (f) {
        return FIELDS[f].short;
      }).join(', '), 'no');
    }
  });

  if (run.matched) {
    push('Prediction completed',
      run.methodology.name + ' — ' + run.methodology.tier + ' data, ' +
      run.methodology.confidence.toLowerCase() + ' confidence', 'ok');
  } else {
    push('Prediction halted', 'Insufficient Data — no governed rule satisfied', 'no');
  }
  return steps;
}

function auditPayload(run, validation, values) {
  const cat = run.category;
  const input = {};
  Object.keys(values).forEach(function (k) {
    if (String(values[k]).trim() !== '') input[k] = values[k];
  });
  return {
    predictionId: run.predictionId,
    generatedAt: run.generatedAt,
    inputFingerprint: run.hash,
    engine: {
      type: 'deterministic-rule-table',
      registryVersion: REGISTRY.version,
      inference: 'none',
      silentDefaults: false
    },
    activityRecord: input,
    decisionTable: {
      id: cat.table, version: cat.tableVersion,
      category: cat.label, scope: cat.scope, ghgCategory: cat.ghgCat,
      rulesInTable: cat.rules.length
    },
    validation: {
      passed: validation.ok,
      checks: validation.checks.map(function (c) { return { check: c.name, status: c.status, detail: c.detail }; }),
      errors: validation.errors,
      advisories: validation.warnings
    },
    ruleEvaluation: run.evaluations.map(function (e) {
      return {
        ruleId: e.rule.id, priority: e.rule.priority, requires: e.rule.requires,
        satisfied: e.satisfied, missing: e.missing, outcome: e.status
      };
    }),
    prediction: run.matched ? {
      methodology: run.methodologyCode,
      methodologyName: run.methodology.name,
      ruleMatched: run.matched.rule.id,
      priority: run.matched.rule.priority,
      dataQualityTier: run.methodology.tier,
      confidence: run.methodology.confidence,
      status: 'SUCCESSFULLY_PREDICTED'
    } : {
      methodology: 'INSUFFICIENT',
      methodologyName: 'Insufficient Data',
      ruleMatched: null, priority: null,
      dataQualityTier: null, confidence: 'None',
      status: 'INSUFFICIENT_DATA'
    }
  };
}
