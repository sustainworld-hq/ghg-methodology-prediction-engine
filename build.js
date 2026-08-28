/* Bundles index.html + assets/* into one standalone HTML page.
   Run:  node build.js   ->   methodology-prediction-engine.html

   The output is a complete HTML document with the CSS and JS inlined:
   double-click it, email it, or drop it on any static host.

   Note: the hosted Evidence tab additionally fetches data/corpus.json, which
   a browser will not load from a file:// page. The standalone file therefore
   shows a clear message there and works fully for everything else.

   Keep working in index.html + assets/ — this is only the shipping copy. */

const fs = require('fs');
const path = require('path');

const read = function (p) { return fs.readFileSync(path.join(__dirname, p), 'utf8'); };
const wrap = function (src) { return '<script>\n' + src + '\n</script>'; };

const SCRIPTS = [
  'assets/decision-tables.js',
  'assets/engine.js',
  'assets/evidence.js',
  'assets/ui.js',
];
const SOURCES = ['assets/styles.css'].concat(SCRIPTS);

let out = read('index.html');

/* A replacer FUNCTION, never a replacement string.
   String replacements expand $&, $1, $` and $' inside the replacement — and
   our sources legitimately contain '\\$&' (the standard regex-escape idiom in
   evidence.js). As a string replacement that gets silently rewritten into the
   matched <script> tag, corrupting the bundle without raising an error. */
const inline = function (needle, body) {
  out = out.replace(needle, function () { return body; });
};

inline('<link rel="stylesheet" href="assets/styles.css">',
       '<style>\n' + read('assets/styles.css') + '\n</style>');

SCRIPTS.forEach(function (js) {
  inline('<script src="' + js + '"></script>', wrap(read(js)));
});

/* fail loudly rather than shipping a page with dead references */
SOURCES.forEach(function (ref) {
  if (out.indexOf(ref) !== -1) {
    console.error('ERROR: ' + ref + ' was not inlined — check the tag in index.html matches exactly.');
    process.exit(1);
  }
});

const dest = path.join(__dirname, 'methodology-prediction-engine.html');
fs.writeFileSync(dest, out, 'utf8');
console.log('wrote ' + dest + '  (' + (out.length / 1024).toFixed(1) + ' KB, self-contained)');
