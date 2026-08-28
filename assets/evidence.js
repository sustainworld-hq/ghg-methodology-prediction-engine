/* ==========================================================================
   SustainGHG — Evidence search (hosted)

   Searches the real methodology corpus in the browser and returns passages
   with their document, edition, section and page.

   The hosted search is LEXICAL ONLY. Shipping 1,568 384-dimension vectors and
   a transformer to every visitor is not a reasonable trade for a demo, so the
   dense half of the hybrid retriever stays local. The page says so rather than
   implying the full pipeline runs here.
   ========================================================================== */

var EV = {
  status: 'idle',      // idle | loading | ready | error
  data: null,
  idx: null,
  err: '',
  q: '',
  hits: []
};

var EV_TOKEN = /[a-z0-9]+(?:[-_][a-z0-9]+)*/g;

function evTokens(t) {
  return String(t).toLowerCase().match(EV_TOKEN) || [];
}

/* BM25 over the corpus. Same scoring as the Python retriever's lexical half,
   so a query behaves the same here as it does locally. */
function evBuildIndex(chunks) {
  var df = Object.create(null), docs = [], lens = [], total = 0, i, j, k;
  for (i = 0; i < chunks.length; i++) {
    var toks = evTokens(chunks[i].w), tf = Object.create(null), n = 0;
    for (j = 0; j < toks.length; j++) {
      tf[toks[j]] = (tf[toks[j]] || 0) + 1;
      n++;
    }
    for (k in tf) df[k] = (df[k] || 0) + 1;
    docs.push(tf); lens.push(n); total += n;
  }
  var N = chunks.length, idf = Object.create(null), t;
  for (t in df) idf[t] = Math.log(1 + (N - df[t] + 0.5) / (df[t] + 0.5));
  return { docs: docs, lens: lens, idf: idf, avgdl: total / Math.max(N, 1), n: N };
}

function evSearch(idx, chunks, query, limit) {
  var terms = evTokens(query);
  if (!terms.length) return [];
  var k1 = 1.5, b = 0.75, scored = [], i, j;
  for (i = 0; i < idx.n; i++) {
    var s = 0, tf = idx.docs[i], len = idx.lens[i];
    for (j = 0; j < terms.length; j++) {
      var f = tf[terms[j]];
      if (!f) continue;
      s += idx.idf[terms[j]] * (f * (k1 + 1)) /
           (f + k1 * (1 - b + b * len / idx.avgdl));
    }
    if (s > 0) scored.push([i, s]);
  }
  scored.sort(function (x, y) { return y[1] - x[1]; });
  return scored.slice(0, limit || 12).map(function (p) {
    return { c: chunks[p[0]], score: p[1] };
  });
}

function evLoad() {
  if (EV.status === 'loading' || EV.status === 'ready') return;
  EV.status = 'loading';
  renderEvidence();
  fetch('data/corpus.json')
    .then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    })
    .then(function (d) {
      EV.data = d;
      EV.idx = evBuildIndex(d.chunks);
      EV.status = 'ready';
      renderEvidence();
    })
    .catch(function (e) {
      EV.status = 'error';
      EV.err = String((e && e.message) || e);
      renderEvidence();
    });
}

function evMark(text, query) {
  var out = esc(text);
  evTokens(query).forEach(function (t) {
    if (t.length < 3) return;
    out = out.replace(new RegExp('(' + t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi'),
                      '<mark>$1</mark>');
  });
  return out;
}

function evIntro() {
  return '<section class="intro">' +
    '<h1>The evidence behind the rules</h1>' +
    '<p>Every rule this tool applies should trace back to a published standard. ' +
    'Search the actual methodology documents — GHG Protocol standards, IPCC ' +
    'guidelines and the DEFRA methodology — and get the passage with its ' +
    'document, edition, section and page.</p></section>';
}

function renderEvidence() {
  var host = $('#evidenceView');
  if (!host) return;

  if (EV.status === 'idle' || EV.status === 'loading') {
    host.innerHTML = '<div class="page wide">' + evIntro() +
      '<div class="card"><div class="prog-row"><span class="prog-ico">' +
      '<span class="spinner"></span></span><span>Loading the document index…' +
      '</span></div></div></div>';
    if (EV.status === 'idle') evLoad();
    return;
  }

  if (EV.status === 'error') {
    host.innerHTML = '<div class="page wide">' + evIntro() +
      '<div class="card"><h2 class="answer-name small">This view needs the hosted page</h2>' +
      '<p class="block-hint" style="margin-top:10px">Evidence search loads the ' +
      'document index over the network, which browsers block when a page is ' +
      'opened directly from a file. Open the published link, or run a local ' +
      'server from the project folder.</p>' +
      '<p class="det-meta">' + esc(EV.err) + '</p></div></div>';
    return;
  }

  var d = EV.data;
  var docIds = Object.keys(d.documents);
  var byPub = {};
  docIds.forEach(function (id) {
    var m = d.documents[id];
    (byPub[m.p] = byPub[m.p] || []).push({ id: id, m: m });
  });

  var results = '';
  if (EV.q.trim()) {
    if (!EV.hits.length) {
      results = '<p class="empty">Nothing in the corpus matches that.</p>';
    } else {
      results = EV.hits.map(function (h) {
        var m = d.documents[h.c.d];
        var newer = (d.multi_edition[m.f] || []).filter(function (e) {
          return e.y > m.y;
        });
        var pages = h.c.a === h.c.b ? 'p' + h.c.a : 'pp' + h.c.a + '–' + h.c.b;
        return '<article class="ev-hit">' +
          '<div class="ev-cite"><b>' + esc(m.t) + '</b>' +
          '<span>' + esc(m.p) + ' · ' + esc(m.e) + ' (' + m.y + ') · ' +
          pages + '</span></div>' +
          (m.prov ? '<div class="ev-warn">Draft — not the published standard</div>' : '') +
          (newer.length ? '<div class="ev-warn amber">A newer edition exists: ' +
            esc(newer[0].e) + ' (' + newer[0].y + ')</div>' : '') +
          (h.c.x ? '<div class="ev-sec">§ ' + esc(h.c.x) + '</div>' : '') +
          '<p class="ev-text">' + evMark(h.c.w.slice(0, 520), EV.q) + '…</p>' +
          '</article>';
      }).join('');
    }
  }

  var egs = ['market-based method contractual instruments',
             'tonne-kilometre freight transport',
             'tier 1 tier 2 decision tree',
             'hotel nights accommodation'];

  host.innerHTML = '<div class="page wide">' + evIntro() +
    '<div class="card">' +
      '<div class="ev-bar">' +
        '<input type="search" id="evQ" value="' + esc(EV.q) + '" ' +
        'placeholder="Ask about a calculation method…" ' +
        'aria-label="Search the methodology documents">' +
        '<button class="btn btn-primary" type="button" id="evGo">Search</button>' +
      '</div>' +
      '<div class="ev-examples"><span>Try:</span>' +
        egs.map(function (q) {
          return '<button type="button" class="ev-eg" data-q="' + esc(q) + '">' +
                 esc(q) + '</button>';
        }).join('') +
      '</div>' +
      '<p class="det-meta" style="margin-top:14px">' + d.chunks.length +
      ' passages from ' + docIds.length + ' documents · ' +
      esc(d.retrieval) + '</p>' +
    '</div>' +
    (results ? '<div class="ev-results">' + results + '</div>' : '') +
    '<section class="cat"><div class="cat-head"><h2>Documents indexed</h2>' +
    '<span class="cat-meta">' + docIds.length + ' documents</span></div>' +
    Object.keys(byPub).sort().map(function (pub) {
      return '<div class="ev-pub"><h3>' + esc(pub) + '</h3><ul>' +
        byPub[pub].map(function (x) {
          return '<li><b>' + esc(x.m.t) + '</b> <span>' + esc(x.m.e) +
                 ' (' + x.m.y + ') · ' + x.m.pp + 'pp</span></li>';
        }).join('') + '</ul></div>';
    }).join('') + '</section></div>';

  var run = function () {
    EV.q = $('#evQ').value;
    EV.hits = evSearch(EV.idx, d.chunks, EV.q, 12);
    renderEvidence();
    var f = $('#evQ');
    if (f) { f.focus(); f.setSelectionRange(f.value.length, f.value.length); }
  };
  $('#evGo').addEventListener('click', run);
  $('#evQ').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') run();
  });
  host.querySelectorAll('.ev-eg').forEach(function (b) {
    b.addEventListener('click', function () { $('#evQ').value = b.dataset.q; run(); });
  });
}
