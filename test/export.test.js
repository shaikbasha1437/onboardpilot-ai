const test = require('node:test'); const assert = require('node:assert');
const X = require('../js/exporter.js'); const S = require('../js/seed.js'); const KB = require('../js/kb.js'); const H = require('../js/handbook.js'); const P = require('../js/plan.js');
const hires = S.demoHires('2026-11-14'); const kb = KB.build(H.DOCS);
test('plan Markdown has phases, statuses, sources and the simulation note', () => {
  const md = X.planMarkdown(hires[0], kb, '2026-11-14');
  assert.match(md, /^# Onboarding plan: Dana Ruiz/); assert.match(md, /## First week/); assert.match(md, /- \[x\] /); assert.match(md, /\(overdue\)/); assert.match(md, /see "Security essentials/); assert.match(md, /simulated/);
});
test('CSV escapes quotes and neutralises spreadsheet formulas', () => {
  assert.strictEqual(X.csvCell('=HYPERLINK("x")'), '"\'=HYPERLINK(""x"")"'); assert.strictEqual(X.csvCell('+1'), "'+1"); assert.strictEqual(X.csvCell('a,b'), '"a,b"');
  const csv = X.tasksCsv(hires, '2026-11-14'); const lines = csv.trim().split('\r\n');
  assert.strictEqual(lines[0], 'hire,role,team,start_date,phase,task,owner,due,status,done_at'); assert.strictEqual(lines.length - 1, hires.reduce((a, h) => a + h.tasks.length, 0));
});
test('backups never contain keys or settings, and round-trip', () => {
  const state = { hires: JSON.parse(JSON.stringify(hires)), docs: H.DOCS, templates: P.DEFAULT_TEMPLATES, usingDemoDocs: true, settings: { key: 'sk-proj-SHOULDNOTLEAK000000000' }, keys: { openai: 'sk-proj-SHOULDNOTLEAK000000000' } };
  state.hires[0].apiKey = 'sk-ant-SHOULDNOTLEAK0000000000'; state.hires[0].chat = [{ role: 'user', text: 'my key is sk-proj-ABCDEFGHIJKLMNOPQRSTUV' }];
  const j = X.backupJson(state); assert.doesNotMatch(j, /SHOULDNOTLEAK|ABCDEFGHIJKLMNOP/); assert.match(j, /\[redacted key\]/);
  const back = X.parseBackup(j); assert.strictEqual(back.hires.length, 4); assert.strictEqual(back.hires[0].name, 'Dana Ruiz');
  assert.throws(() => X.parseBackup('{"app":"other"}'), /not an OnboardPilot backup/); assert.throws(() => X.parseBackup('nope'), /not valid JSON/);
  assert.throws(() => X.parseBackup(JSON.stringify({ app: 'onboardpilot-ai', data: { hires: [{ id: 'x', name: 'y', tasks: [], startDate: 'bad' }] } })), /missing required/);
});
