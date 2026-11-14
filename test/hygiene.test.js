const test = require('node:test'); const assert = require('node:assert'); const fs = require('node:fs'); const path = require('node:path');
const ROOT = path.join(__dirname, '..');
function files(dir) { return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => { const p = path.join(dir, e.name); if (e.isDirectory()) return ['node_modules', '.git', 'vendor'].includes(e.name) ? [] : files(p); return /\.(js|html|css|md|json|webmanifest|svg)$/.test(e.name) ? [p] : []; }); }
test('public files carry no numbering labels, real-looking keys or non-example addresses', () => {
  for (const f of files(ROOT)) {
    if (f.endsWith('hygiene.test.js')) continue;
    const s = fs.readFileSync(f, 'utf8');
    assert.doesNotMatch(s, /\bproject\s+\d+\b|\bof 15\b|\bpart \d+ of\b/i, f);
    assert.doesNotMatch(s, /\bF-1\b|\bvisa\b/i, f);
    assert.doesNotMatch(s, /\bsk-(proj-)?[A-Za-z0-9]{32,}|AIza[0-9A-Za-z_-]{35}/, f);
    for (const m of s.match(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g) || []) assert.ok(/\.example$|noreply\.github\.com$|^git@github\.com$|@\d|@[\w-]+\.(js|mjs|css)$/.test(m), f + ': ' + m);
  }
});
