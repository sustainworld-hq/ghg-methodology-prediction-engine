/* ==========================================================================
   SustainGHG - Methodology Prediction Engine :: THE INTERFACE
   --------------------------------------------------------------------------
   Displays what engine.js works out. Keeps the everyday path short: pick an
   example or fill in a few fields, press one button, read one answer. All
   the working-out lives behind "Show how we decided".
   ========================================================================== */

var $ = function (sel, root) { return (root || document).querySelector(sel); };
var el = function (tag, cls, html) {
  var n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html !== undefined) n.innerHTML = html;
  return n;
};
var REDUCED = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
var timers = [];
var clearTimers = function () { timers.forEach(clearTimeout); timers = []; };
var at = function (ms, fn) { timers.push(setTimeout(fn, REDUCED ? 0 : ms)); };
var scrollTo_ = function (node, block) {
  node.scrollIntoView({ behavior: REDUCED ? 'auto' : 'smooth', block: block || 'start' });
};

var ICONS = {
  check:   'M3 8.5l3.2 3.2L13 4.8',
  x:       'M4 4l8 8M12 4l-8 8',
  dash:    'M4 8h8',
  right:   'M6 3.5l5 4.5-5 4.5',
  down:    'M3.5 6l4.5 5 4.5-5',
  alert:   'M8 2.4L14.4 13.4H1.6zM8 6.6v3.1M8 11.4v.1',
  info:    'M8 2.4a5.6 5.6 0 100 11.2A5.6 5.6 0 008 2.4zM8 7.4v3.6M8 5.2v.1',
  copy:    'M5.5 5.5h8v8h-8zM10.5 5.5v-3h-8v8h3',
  leaf:    'M3 13V6.5M3 6.5h5a2.5 2.5 0 002.5-2.5V3M3 9.5h7.5a2.5 2.5 0 012.5 2.5V13'
};
var ico = function (name, size) {
  var s = size || 16;
  return '<svg width="' + s + '" height="' + s + '" viewBox="0 0 16 16" aria-hidden="true" fill="none" ' +
    'stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="' + ICONS[name] + '"/></svg>';
};

/* --- plain words for things the tables call by their technical name ------ */

var FRIENDLY = {
  mode: 'How they travelled',
  gridRegion: 'Which electricity grid',
  contractualInstrument: 'Green energy certificate or contract',
  sectorCode: 'Industry sector',
  supplierData: 'Data received from the supplier',
  freightMass: 'How much was shipped',
  materialMass: 'How much was bought',
  steamSource: 'What the supplier reports',
  processingEnergy: 'Energy the customer uses to process it',
  investeeEmissions: 'Emissions the investee reported',
  refrigerantRecharge: 'Refrigerant topped up (kg)',
  equipmentCharge: 'Refrigerant the equipment holds (kg)',
  leakRate: 'Expected yearly leak rate (%)'
};
var labelOf = function (id) { return FRIENDLY[id] || FIELDS[id].label; };

var TIER_PLAIN = {
  'Primary':   'Based on the actual activity data you provided.',
  'Secondary': 'Based on an industry average, because exact data was not available.',
  'Proxy':     'A rough estimate from money spent. Fine for screening, not for reporting.'
};

/* ------------------------------------------------------------- the state -- */

var state = {
  tab: 'find',
  values: {},
  scenario: null,
  showAllExamples: false,
  libScope: 'All',
  libSearch: '',
  seq: 0,
  hasResult: false
};

var currentCategory = function () {
  return CATEGORY_BY_ID[state.values.activityCategory] || CATEGORIES[0];
};

/* --------------------------------------------------------------- examples -- */

function renderScenarios() {
  var host = $('#scenarioGrid');
  host.innerHTML = '';
  var shown = state.showAllExamples ? SCENARIOS : SCENARIOS.slice(0, 6);
  shown.forEach(function (s, i) {
    var b = el('button', 'example');
    b.type = 'button';
    b.setAttribute('aria-pressed', state.scenario === i ? 'true' : 'false');
    b.innerHTML =
      '<span class="example-name">' + esc(s.name) + '</span>' +
      '<span class="example-desc">' + esc(s.desc) + '</span>' +
      '<span class="example-out' + (s.tone === 'clay' ? ' warn' : '') + '">' +
      ico('right', 11) + esc(s.expect) + '</span>';
    b.addEventListener('click', function () { loadScenario(i); });
    host.appendChild(b);
  });
  $('#moreExamples').textContent = state.showAllExamples
    ? 'Show fewer examples'
    : 'Show all ' + SCENARIOS.length + ' examples';
}

function loadScenario(i, quiet) {
  var s = SCENARIOS[i];
  state.scenario = i;
  state.values = {};
  Object.keys(s.values).forEach(function (k) { state.values[k] = s.values[k]; });

  var cat = CATEGORY_BY_ID[state.values.activityCategory];
  cat.fields.forEach(function (f) {
    var u = FIELDS[f].unitOf;
    if (u && state.values[u] === undefined && isPresent(state.values, f)) {
      state.values[u] = FIELDS[u].options[0];
    }
  });

  clearOutput();
  renderScenarios();
  renderForm();
  if (!quiet) scrollTo_($('#inputCard'), 'center');
}

/* ------------------------------------------------------------------- form -- */

function optionsFor(id, cat) {
  if (cat && cat.fieldOptions && cat.fieldOptions[id]) return cat.fieldOptions[id];
  return FIELDS[id].options || [];
}

function inputFor(id, cat) {
  var f = FIELDS[id], node;
  if (f.kind === 'select') {
    node = el('select');
    node.appendChild(new Option(f.context ? 'Choose…' : 'Not provided', ''));
    optionsFor(id, cat).forEach(function (o) { node.appendChild(new Option(o, o)); });
    node.value = state.values[id] || '';
  } else {
    node = el('input');
    node.type = f.kind === 'number' ? 'number' : 'text';
    if (f.kind === 'number') { node.min = '0'; node.step = 'any'; node.inputMode = 'decimal'; }
    node.placeholder = f.placeholder || '';
    node.value = state.values[id] || '';
  }
  node.id = 'fld-' + id;
  node.addEventListener('input', function () { onFieldChange(id, node.value); });
  node.addEventListener('change', function () { onFieldChange(id, node.value); });
  return node;
}

function fieldRow(id, cat, small) {
  var f = FIELDS[id];
  var wrap = el('div', 'field' + (small ? ' field-sm' : ''));
  var lab = el('label', 'field-label', esc(labelOf(id)));
  lab.setAttribute('for', 'fld-' + id);
  wrap.appendChild(lab);
  if (f.unitOf) {
    var pair = el('div', 'pair');
    pair.appendChild(inputFor(id, cat));
    var u = inputFor(f.unitOf, cat);
    u.setAttribute('aria-label', FIELDS[f.unitOf].label);
    pair.appendChild(u);
    wrap.appendChild(pair);
  } else {
    wrap.appendChild(inputFor(id, cat));
  }
  return wrap;
}

function renderForm() {
  var cat = currentCategory();
  var host = $('#formBody');
  host.innerHTML = '';

  /* what kind of activity */
  var top = el('div', 'form-grid');

  var catField = el('div', 'field');
  var catLab = el('label', 'field-label', 'What kind of activity?');
  catLab.setAttribute('for', 'fld-activityCategory');
  catField.appendChild(catLab);
  var sel = el('select');
  sel.id = 'fld-activityCategory';
  ['Scope 1', 'Scope 2', 'Scope 3'].forEach(function (scope) {
    var g = el('optgroup');
    g.label = scope;
    CATEGORIES.filter(function (c) { return c.scope === scope; })
      .forEach(function (c) { g.appendChild(new Option(c.label, c.id)); });
    sel.appendChild(g);
  });
  sel.value = cat.id;
  sel.addEventListener('change', function () {
    state.values = {
      activityCategory: sel.value,
      activityType: CATEGORY_BY_ID[sel.value].templates[0],
      reportingYear: state.values.reportingYear || '2026',
      country: state.values.country || 'India',
      region: state.values.region || ''
    };
    state.scenario = null;
    clearOutput(); renderScenarios(); renderForm();
    var first = $('#formBody .field-block input, #formBody .field-block select');
    if (first) first.focus();
  });
  catField.appendChild(sel);
  top.appendChild(catField);

  var tField = el('div', 'field');
  var tLab = el('label', 'field-label', 'Type of record');
  tLab.setAttribute('for', 'fld-activityType');
  tField.appendChild(tLab);
  var tSel = el('select');
  tSel.id = 'fld-activityType';
  tSel.appendChild(new Option('Choose…', ''));
  cat.templates.forEach(function (t) { tSel.appendChild(new Option(t, t)); });
  tSel.value = state.values.activityType || '';
  tSel.addEventListener('change', function () { onFieldChange('activityType', tSel.value); });
  tField.appendChild(tSel);
  top.appendChild(tField);
  host.appendChild(top);

  /* what you know about it */
  var block = el('div', 'field-block');
  block.appendChild(el('p', 'block-hint',
    'Fill in whatever you have. Anything you leave blank is simply treated as unknown — ' +
    'we never invent a value.'));
  var grid = el('div', 'form-grid');
  cat.fields.forEach(function (id) { grid.appendChild(fieldRow(id, cat)); });
  block.appendChild(grid);
  host.appendChild(block);

  /* where and when */
  var ctx = el('div', 'field-block quiet');
  ctx.appendChild(el('p', 'block-hint', 'Where and when'));
  var cgrid = el('div', 'form-grid');
  ['country', 'region', 'reportingYear'].forEach(function (id) {
    cgrid.appendChild(fieldRow(id, cat, true));
  });
  ctx.appendChild(cgrid);
  host.appendChild(ctx);
}

function onFieldChange(id, value) {
  state.values[id] = value;
  state.scenario = null;
  renderScenarios();
  if (state.hasResult) {
    clearOutput();
    $('#staleNote').hidden = false;
  }
}

function clearOutput() {
  clearTimers();
  state.hasResult = false;
  $('#output').innerHTML = '';
  $('#staleNote').hidden = true;
}

/* ---------------------------------------------------------------- predict -- */

function predict() {
  clearTimers();
  var cat = currentCategory();
  var values = state.values;
  var out = $('#output');
  out.innerHTML = '';
  $('#staleNote').hidden = true;
  state.seq++;

  var validation = validate(values, cat);

  var prog = el('div', 'progress');
  var lines = [
    'Checking what you entered',
    'Loading the rules for ' + cat.label.toLowerCase(),
    'Matching your data against them'
  ];
  prog.innerHTML = lines.map(function (t, i) {
    return '<div class="prog-row" data-p="' + i + '"><span class="prog-ico"><span class="spinner"></span></span>' +
      '<span>' + esc(t) + '</span></div>';
  }).join('');
  out.appendChild(prog);
  scrollTo_(prog, 'center');

  lines.forEach(function (t, i) {
    at(200 + i * 260, function () {
      var row = prog.querySelector('[data-p="' + i + '"]');
      var bad = (i === 0 && !validation.ok);
      row.className = 'prog-row ' + (bad ? 'bad' : 'good');
      row.querySelector('.prog-ico').innerHTML = ico(bad ? 'x' : 'check', 14);
    });
  });

  if (!validation.ok) {
    at(200 + 260, function () {
      prog.querySelectorAll('[data-p="1"],[data-p="2"]').forEach(function (r) { r.remove(); });
      showValidationProblem(validation, out);
    });
    return;
  }

  at(200 + lines.length * 260 + 220, function () {
    prog.remove();
    var run = evaluate(values, cat);
    run.predictionId = 'PRD-' + new Date().getFullYear() + '-' + String(state.seq).padStart(4, '0');
    run.generatedAt = new Date().toISOString();
    run.hash = recordHash(values, cat);
    showAnswer(run, validation, out);
  });
}

/* --------------------------------------------------------- the three ends -- */

function showValidationProblem(validation, out) {
  state.hasResult = true;
  var card = el('section', 'answer bad');
  card.innerHTML =
    '<div class="answer-mark">' + ico('alert', 22) + '</div>' +
    '<h2 class="answer-name small">Something needs fixing first</h2>' +
    '<p class="answer-why">We stopped before matching any rule. We will not guess at a missing ' +
    'unit or accept a value that cannot be right.</p>' +
    '<ul class="fixlist">' + validation.errors.map(function (e) {
      return '<li>' + esc(e) + '</li>';
    }).join('') + '</ul>' +
    '<div class="answer-actions"><button class="btn" type="button" data-act="edit">Go back and fix it</button></div>';
  out.appendChild(card);
  wireActions(card);
  scrollTo_(card, 'center');
}

function showAnswer(run, validation, out) {
  state.hasResult = true;
  var cat = run.category;
  var m = run.methodology;
  var ok = !!run.matched;
  var card = el('section', 'answer' + (ok ? '' : ' warn'));

  if (ok) {
    var r = run.matched.rule;
    var given = run.matched.present.map(function (f) {
      var v = FIELDS[f].kind === 'number' ? fmtNum(state.values[f]) : state.values[f];
      var unit = FIELDS[f].unitOf ? ' ' + (state.values[FIELDS[f].unitOf] || '') : '';
      return '<b>' + esc(labelOf(f)) + '</b> (' + esc(v + unit) + ')';
    });
    var givenText = given.length === 1 ? given[0]
      : given.slice(0, -1).join(', ') + ' and ' + given[given.length - 1];

    card.innerHTML =
      '<div class="answer-mark">' + ico('check', 22) + '</div>' +
      '<p class="answer-lead">Use the</p>' +
      '<h2 class="answer-name">' + esc(m.name) + ' method</h2>' +
      '<p class="answer-why">You gave us ' + givenText + '. That is rule ' + r.priority +
      ' of ' + cat.rules.length + ' for ' + esc(cat.label.toLowerCase()) + ', and it is the ' +
      'best method available for what you know.</p>' +
      '<div class="answer-facts">' +
        fact('Activity', cat.label) +
        fact('Rule matched', r.label) +
        fact('Confidence', m.confidence) +
      '</div>' +
      '<p class="answer-tier">' + ico('info', 14) + ' ' + esc(TIER_PLAIN[m.tier] || '') + '</p>' +
      '<div class="answer-actions">' +
        '<button class="btn btn-primary" type="button" data-act="another">Try another</button>' +
        '<button class="btn" type="button" data-act="edit">Change my answers</button>' +
      '</div>';
  } else {
    card.innerHTML =
      '<div class="answer-mark">' + ico('info', 22) + '</div>' +
      '<h2 class="answer-name small">We need a little more</h2>' +
      '<p class="answer-why">Nothing you entered is enough to pick a method for ' +
      esc(cat.label.toLowerCase()) + '. Add any <b>one</b> of these and we can answer:</p>' +
      '<ul class="optionlist">' + run.evaluations.map(function (e) {
        return '<li><button type="button" class="optbtn" data-fill="' + esc(e.missing[0]) + '">' +
          '<span class="opt-need">' + e.missing.map(function (f) {
            return esc(labelOf(f));
          }).join(' and ') + '</span>' +
          '<span class="opt-arrow">' + ico('right', 11) + '</span>' +
          '<span class="opt-meth">' + esc(METHODOLOGIES[e.rule.methodology].name) + '</span></button></li>';
      }).join('') + '</ul>' +
      '<div class="answer-actions">' +
        '<button class="btn" type="button" data-act="edit">Go back to the form</button>' +
      '</div>';
  }

  out.appendChild(card);
  wireActions(card);
  out.appendChild(buildDetails(run, validation));
  scrollTo_(card, 'center');
}

function fact(k, v) {
  return '<div class="fact"><span class="fact-k">' + esc(k) + '</span>' +
    '<span class="fact-v">' + esc(v) + '</span></div>';
}

function wireActions(card) {
  card.querySelectorAll('[data-act]').forEach(function (b) {
    b.addEventListener('click', function () {
      if (b.dataset.act === 'another') {
        clearOutput();
        scrollTo_($('#examplesCard'), 'start');
      } else {
        scrollTo_($('#inputCard'), 'start');
      }
    });
  });
  card.querySelectorAll('[data-fill]').forEach(function (b) {
    b.addEventListener('click', function () {
      scrollTo_($('#inputCard'), 'start');
      var node = $('#fld-' + b.dataset.fill);
      if (node) at(REDUCED ? 0 : 420, function () { node.focus(); });
    });
  });
}

/* ----------------------------------------------------- show how we decided -- */

function buildDetails(run, validation) {
  var cat = run.category;
  var det = el('details', 'details');
  var steps = buildTrace(run, validation, state.values);

  det.innerHTML =
    '<summary><span class="sum-t">Show how we decided</span>' +
    '<span class="sum-caret">' + ico('down', 15) + '</span></summary>' +
    '<div class="details-body">' +

      '<div class="det-block"><h3>1. We checked what you entered</h3>' +
      '<ul class="checklist">' + validation.checks.map(function (c) {
        return '<li class="' + c.status + '">' + ico(c.status === 'fail' ? 'x' : 'check', 13) +
          '<span>' + esc(c.name) + '</span><em>' + esc(c.detail) + '</em></li>';
      }).join('') + '</ul>' +
      (validation.warnings.length
        ? '<p class="det-note">' + ico('info', 13) + ' ' + esc(validation.warnings[0]) + '</p>' : '') +
      '</div>' +

      '<div class="det-block"><h3>2. We loaded the rules for ' + esc(cat.label.toLowerCase()) + '</h3>' +
      '<p class="det-note">Rules are tried from the top. The first one whose inputs you have ' +
      'is the one we use — better data always wins over a rough estimate.</p>' +
      '<div class="table-wrap">' + tableHTML(cat, run, false) + '</div></div>' +

      '<div class="det-block"><h3>3. We checked each rule in turn</h3>' +
      '<ul class="rulelist">' + run.evaluations.map(function (e) {
        var cls = e.status === 'hit' ? 'hit' : e.status === 'lower' ? 'lower' : 'miss';
        var verdict = e.status === 'hit' ? 'This is the one'
          : e.status === 'lower' ? 'Would work, but ranks lower' : 'Not enough data';
        var why = e.status === 'miss'
          ? 'Missing ' + e.missing.map(function (f) { return labelOf(f); }).join(' and ') + '.'
          : 'You have ' + e.present.map(function (f) { return labelOf(f); }).join(' and ') + '.';
        return '<li class="' + cls + '">' +
          '<span class="rl-ico">' + ico(e.status === 'hit' ? 'check' : e.status === 'miss' ? 'x' : 'dash', 13) + '</span>' +
          '<span class="rl-main"><b>Rule ' + e.rule.priority + ' — ' + esc(e.rule.label) + '</b>' +
          '<span class="rl-why">' + esc(why) + '</span></span>' +
          '<span class="rl-verdict">' + esc(verdict) + '</span></li>';
      }).join('') + '</ul></div>' +

      '<div class="det-block"><h3>4. Step-by-step record</h3>' +
      '<p class="det-note">Kept for audit. The same activity record always produces this ' +
      'same result — there is no model and no randomness anywhere in this module.</p>' +
      '<ol class="trace">' + steps.map(function (s) {
        return '<li class="' + s.tone + '"><span class="tr-t">' + esc(s.t) + '</span>' +
          '<span class="tr-v">' + esc(s.v) + '</span></li>';
      }).join('') + '</ol></div>' +

      '<div class="det-foot">' +
      '<span class="det-meta">' + esc(run.predictionId) + ' · table ' + esc(cat.table) + ' ' +
      esc(cat.tableVersion) + ' · record ' + esc(run.hash) + '</span>' +
      '<button class="btn btn-sm" type="button" id="copyJson">' + ico('copy', 13) + ' Copy full record</button>' +
      '</div>' +
    '</div>';

  det.querySelector('#copyJson').addEventListener('click', function (ev) {
    var btn = ev.currentTarget;
    var text = JSON.stringify(auditPayload(run, validation, state.values), null, 2);
    var done = function () {
      btn.innerHTML = ico('check', 13) + ' Copied';
      setTimeout(function () { btn.innerHTML = ico('copy', 13) + ' Copy full record'; }, 1600);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function () {});
    } else {
      var ta = el('textarea'); ta.value = text; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); done(); } catch (e) {}
      document.body.removeChild(ta);
    }
  });
  return det;
}

function tableHTML(cat, run, withNotes) {
  var rows = cat.rules.map(function (rule, i) {
    var m = METHODOLOGIES[rule.methodology];
    var ev = run ? run.evaluations[i] : null;
    var needs = rule.requires.map(function (f) {
      var cls = ev ? (ev.present.indexOf(f) > -1 ? ' ok' : ' miss') : '';
      return '<span class="need' + cls + '">' + esc(labelOf(f)) + '</span>';
    }).join('<span class="need-plus">+</span>');
    var result = ev
      ? (ev.status === 'hit' ? '<span class="res ok">Used</span>'
        : ev.status === 'lower' ? '<span class="res low">Ranks lower</span>'
        : '<span class="res no">Not enough data</span>')
      : '<span class="res">' + esc(m.confidence) + ' confidence</span>';
    return '<tr class="' + (ev && ev.status === 'hit' ? 'is-hit' : '') + '">' +
      '<td class="c-pri">' + rule.priority + '</td>' +
      '<td><div class="needs">' + needs + '</div>' +
      (withNotes ? '<p class="rule-note">' + esc(rule.note) + '</p>' : '') + '</td>' +
      '<td class="c-meth"><b>' + esc(m.name) + '</b></td>' +
      '<td class="c-res">' + result + '</td></tr>';
  }).join('');

  return '<table class="dt"><thead><tr><th>Order</th><th>What you need</th>' +
    '<th>Method</th><th>' + (run ? 'Result' : 'Data quality') + '</th></tr></thead><tbody>' + rows +
    '<tr class="is-dim"><td class="c-pri">—</td><td><span class="need">None of the above</span></td>' +
    '<td class="c-meth"><b>Not enough data</b></td><td class="c-res">' +
    (run && !run.matched ? '<span class="res no">This record</span>' : '<span class="res">—</span>') +
    '</td></tr></tbody></table>';
}

/* ---------------------------------------------------------------- library -- */

function renderLibrary() {
  var host = $('#libraryView');
  var q = state.libSearch.trim().toLowerCase();
  var cats = CATEGORIES.filter(function (c) {
    if (state.libScope !== 'All' && c.scope !== state.libScope) return false;
    if (!q) return true;
    return (c.label + ' ' + c.ghgCat + ' ' + c.templates.join(' ') + ' ' +
      c.rules.map(function (r) { return r.label + ' ' + METHODOLOGIES[r.methodology].name; }).join(' ')
    ).toLowerCase().indexOf(q) > -1;
  });
  var ruleCount = CATEGORIES.reduce(function (a, c) { return a + c.rules.length; }, 0);

  host.innerHTML =
    '<div class="page wide">' +
      '<section class="intro">' +
      '<h1>All the rules</h1>' +
      '<p>Every activity we can pick a method for. Rules are listed in the order we try them: ' +
      'the best-quality method first, a rough estimate from spending last. Nothing else decides ' +
      'the answer — change a table here and the tool behaves differently, which is the point.</p>' +
      '<p class="stats"><b>' + CATEGORIES.length + '</b> activities · <b>' + ruleCount +
      '</b> rules · <b>' + (Object.keys(METHODOLOGIES).length - 1) + '</b> methods</p>' +
      '</section>' +

      '<div class="lib-bar">' +
        '<input type="search" id="libSearch" placeholder="Search activities, rules or methods…" ' +
        'value="' + esc(state.libSearch) + '" aria-label="Search the rules">' +
        '<div class="filters">' + ['All', 'Scope 1', 'Scope 2', 'Scope 3'].map(function (s) {
          return '<button type="button" class="filter" data-scope="' + s + '" aria-pressed="' +
            (state.libScope === s ? 'true' : 'false') + '">' + s + '</button>';
        }).join('') + '</div>' +
      '</div>' +

      (cats.length ? cats.map(function (c) {
        return '<section class="cat"><div class="cat-head">' +
          '<h2>' + esc(c.label) + '</h2>' +
          '<span class="cat-meta">' + esc(c.scope) + ' · ' + esc(c.ghgCat) + ' · ' +
          c.rules.length + ' rules</span></div>' +
          '<div class="table-wrap">' + tableHTML(c, null, true) + '</div></section>';
      }).join('') : '<p class="empty">Nothing matches “' + esc(state.libSearch) + '”.</p>') +

      '<section class="cat"><div class="cat-head"><h2>What each method means</h2>' +
      '<span class="cat-meta">' + Object.keys(METHODOLOGIES).filter(function (k) {
        return SOURCES[METHODOLOGIES[k].source.src].held;
      }).length + ' of ' + Object.keys(METHODOLOGIES).length +
      ' checked against a standard we hold</span></div>' +
      '<div class="table-wrap"><table class="dt"><thead><tr><th>Method</th><th>What it does</th>' +
      '<th>Data quality</th><th>Comes from</th></tr></thead><tbody>' +
      Object.keys(METHODOLOGIES).map(function (k) {
        var m = METHODOLOGIES[k], s = m.source, src = SOURCES[s.src];
        var prov = src.held
          ? '<span class="src ok" title="' + esc(s.note) + '">' + esc(src.short) + ' ' + esc(s.ref) + '</span>'
          : '<span class="src todo" title="' + esc(s.note) + '">' + esc(src.short) + ' — not verified</span>';
        return '<tr><td class="c-meth"><b>' + esc(m.name) + '</b></td>' +
          '<td>' + esc(m.blurb) + '</td>' +
          '<td class="c-res"><span class="res">' + esc(m.tier === '—' ? '—' :
            m.tier + ' · ' + m.confidence + ' confidence') + '</span></td>' +
          '<td class="c-src">' + prov + '</td></tr>';
      }).join('') + '</tbody></table></div>' +
      '<p class="src-note">Hover a source to see the wording it rests on. ' +
      '“Not verified” means the rule is defensible but the governing document has not been ' +
      'read against these tables — see <code>docs/METHODOLOGY-RULES.md</code>.</p></section>' +
    '</div>';

  host.querySelectorAll('.filter').forEach(function (b) {
    b.addEventListener('click', function () { state.libScope = b.dataset.scope; renderLibrary(); });
  });
  var search = $('#libSearch');
  search.addEventListener('input', function () {
    state.libSearch = search.value;
    var pos = search.selectionStart;
    renderLibrary();
    var s2 = $('#libSearch');
    s2.focus(); s2.setSelectionRange(pos, pos);
  });
}

/* ----------------------------------------------------------------- chrome -- */

function setTab(tab) {
  state.tab = tab;
  $('#findView').hidden = tab !== 'find';
  $('#libraryView').hidden = tab !== 'library';
  $('#evidenceView').hidden = tab !== 'evidence';
  document.querySelectorAll('.tab').forEach(function (t) {
    t.setAttribute('aria-selected', t.dataset.tab === tab ? 'true' : 'false');
  });
  if (tab === 'library') renderLibrary();
  if (tab === 'evidence') renderEvidence();
  window.scrollTo({ top: 0, behavior: 'auto' });
}

function init() {
  loadScenario(0, true);

  $('#predictBtn').addEventListener('click', predict);
  $('#resetBtn').addEventListener('click', function () {
    state.scenario = null;
    state.values = {
      activityCategory: currentCategory().id, activityType: '',
      reportingYear: '2026', country: 'India', region: ''
    };
    clearOutput(); renderScenarios(); renderForm();
  });
  $('#moreExamples').addEventListener('click', function () {
    state.showAllExamples = !state.showAllExamples;
    renderScenarios();
  });
  document.querySelectorAll('.tab').forEach(function (t) {
    t.addEventListener('click', function () { setTab(t.dataset.tab); });
  });
  document.querySelectorAll('[data-ico]').forEach(function (n) {
    n.innerHTML = ico(n.dataset.ico, Number(n.dataset.size || 16));
  });

  $('#footMeta').textContent =
    CATEGORIES.length + ' activities · ' +
    CATEGORIES.reduce(function (a, c) { return a + c.rules.length; }, 0) + ' rules · ' +
    'rule set ' + REGISTRY.version;
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
