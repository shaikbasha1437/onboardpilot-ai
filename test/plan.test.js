const test = require('node:test'); const assert = require('node:assert');
const P = require('../js/plan.js'); const S = require('../js/seed.js'); const KB = require('../js/kb.js'); const H = require('../js/handbook.js');
test('due dates skip weekends in the direction of travel', () => {
  assert.strictEqual(P.dueDate('2026-11-16', 0), '2026-11-16');
  assert.strictEqual(P.dueDate('2026-11-16', 5), '2026-11-23'); // Saturday -> Monday
  assert.strictEqual(P.dueDate('2026-11-16', -2), '2026-11-13'); // Saturday before start -> Friday
  assert.strictEqual(P.dueDate('2026-11-16', 30), '2026-12-16');
  assert.ok(P.isDate('2026-02-28') && !P.isDate('2026-02-30') && !P.isDate('nope'));
});
test('plans depend on role and remote or office', () => {
  const remote = P.generate({ role: 'engineer', remote: true, startDate: '2026-11-16' });
  const office = P.generate({ role: 'sales', remote: false, startDate: '2026-11-16' });
  assert.ok(remote.some((t) => /home office stipend/.test(t.title)) && !remote.some((t) => /badge/.test(t.title)));
  assert.ok(office.some((t) => /badge/.test(t.title)) && !office.some((t) => /home office/.test(t.title)));
  assert.ok(remote.some((t) => /GitHub/.test(t.title)) && !office.some((t) => /GitHub/.test(t.title)));
  assert.ok(office.some((t) => /customer calls/.test(t.title)));
  for (const ph of ['pre', 'day1', 'week1', 'd30', 'd60', 'd90']) assert.ok(remote.some((t) => t.phase === ph), ph);
  const order = remote.map((t) => P.PHASES.findIndex((p) => p.id === t.phase)); assert.deepStrictEqual(order, order.slice().sort((a, b) => a - b));
});
test('every template handbook link points at a real section', () => {
  const kb = KB.build(H.DOCS);
  for (const [k, t] of Object.entries(P.DEFAULT_TEMPLATES)) for (const x of t.tasks) if (x.ref) assert.ok(kb.byId[x.ref], k + ': ' + x.ref);
});
test('progress, overdue and stage', () => {
  const ts = P.generate({ role: 'support', remote: false, startDate: '2026-11-02' });
  const pr = P.progress(ts, '2026-11-14'); assert.strictEqual(pr.done, 0); assert.ok(pr.overdueCount > 5); assert.ok(pr.byOwner.hire > 0);
  ts.forEach((t) => (t.done = true)); assert.strictEqual(P.progress(ts, '2026-11-14').pct, 100);
  assert.strictEqual(P.stage({ startDate: '2026-11-16' }, '2026-11-14'), 'Starts in 2 days');
  assert.strictEqual(P.stage({ startDate: '2026-11-02' }, '2026-11-14'), 'Day 12 of 90');
  assert.strictEqual(P.status({ done: false, due: '2026-11-15' }, '2026-11-14'), 'soon');
});
test('template validation reports every problem', () => {
  const v = P.validateTemplate({ label: '', tasks: [{ title: '', phase: 'x', owner: 'ceo', day: 400 }] });
  assert.ok(!v.ok); assert.strictEqual(v.errors.length, 5);
  const ok = P.validateTemplate({ label: 'Data analyst', tasks: [{ title: 'Get warehouse access', phase: 'week1', owner: 'hire', day: '2', where: 'weird' }] });
  assert.ok(ok.ok); assert.strictEqual(ok.template.tasks[0].day, 2); assert.strictEqual(ok.template.tasks[0].where, 'any');
});
test('demo seed has hires at different stages with something overdue and pending', () => {
  const hs = S.demoHires('2026-11-14');
  assert.strictEqual(hs.length, 4);
  const dana = hs[0]; assert.strictEqual(dana.startDate, '2026-11-02'); assert.ok(P.progress(dana.tasks, '2026-11-14').overdueCount >= 2);
  assert.ok(dana.access.some((r) => r.status === 'proposed') && dana.access.some((r) => r.status === 'done'));
  assert.ok(hs.some((h) => h.startDate > '2026-11-14'));
  for (const h of hs) { assert.match(h.email, /@lumenfield\.example$/); assert.match(h.managerEmail, /@lumenfield\.example$/); }
});
