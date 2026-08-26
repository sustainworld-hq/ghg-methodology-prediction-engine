/* Bundles index.html + assets/* into one standalone HTML page.
   Run:  node build.js   ->   methodology-prediction-engine.html

   The output is a complete HTML document with the CSS and JS inlined:
   double-click it, email it, or drop it on any static host. No server,
   no build tooling, no dependencies at runtime.

   Keep working in index.html + assets/ — this is only the shipping copy. */

const fs = require('fs');
const path = require('path');

const read = function (p) { return fs.readFileSync(path.join(__dirname, p), 'utf8'); };
const wrap = function (src) { return '<script>\n' + src + '\n</script>'; };

const SOURCES = ['assets/styles.css', 'assets/decision-tables.js', 'assets/engine.js', 'assets/ui.js'];

let out = read('index.html');

out = out.replace('<link rel="stylesheet" href="assets/styles.css">',
                  '<style>\n' + read('assets/styles.css') + '\n</style>');

['assets/decision-tables.js', 'assets/engine.js', 'assets/ui.js'].forEach(function (js) {
  out = out.replace('<script src="' + js + '"></script>', wrap(read(js)));
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
