const test = require('node:test'); const assert = require('node:assert');
const A = require('../js/access.js'); const Q = require('../js/quiz.js'); const KB = require('../js/kb.js'); const H = require('../js/handbook.js');
const hire = { id: 'h1', name: 'Dana Ruiz', email: 'dana.ruiz@lumenfield.example', role: 'engineer', roleLabel: 'Software engineer', remote: true, manager: 'Marcus Webb' };
test('the agent proposes access by role', () => {
  const eng = A.propose(hire, []).map((r) => r.system); const sales = A.propose(Object.assign({}, hire, { role: 'sales' }), []).map((r) => r.system);
  assert.ok(eng.includes('github') && eng.includes('vpn') && !eng.includes('crm'));
  assert.ok(sales.includes('crm') && !sales.includes('github'));
  assert.ok(A.propose(hire, []).every((r) => r.status === 'proposed'));
  const first = A.propose(hire, []); assert.strictEqual(A.propose(hire, first).length, 0);
});
test('nothing is provisioned without manager approval', () => {
  const [r] = A.propose(hire, []);
  assert.throws(() => A.execute(r, hire), /not been approved/);
  assert.throws(() => A.approve(r, { role: 'hire', name: 'Dana Ruiz' }, hire), /Only the hire/);
  assert.throws(() => A.approve(r, { role: 'manager', name: 'Dana Ruiz' }, hire), /Only the hire/); // cannot approve yourself
  A.approve(r, { role: 'manager', name: 'Marcus Webb' }, hire); assert.strictEqual(r.status, 'approved');
  A.execute(r, hire); assert.strictEqual(r.status, 'done'); assert.match(r.result, /simulated/); assert.strictEqual(r.log.length, 3);
  assert.throws(() => A.approve(r, { role: 'admin', name: 'Hana Sato' }, hire), /Only proposed/);
});
test('rejected requests cannot be provisioned', () => {
  const [r] = A.propose(hire, []); A.reject(r, { role: 'admin', name: 'Hana Sato' }, hire, 'not needed');
  assert.throws(() => A.execute(r, hire), /not been approved/); assert.match(r.log[r.log.length - 1].what, /not needed/);
});
test('requests never carry passwords, SSNs or bank details', () => {
  assert.match(A.checkText('my password is hunter2'), /never carry/);
  assert.match(A.checkText('SSN 123-45-6789'), /never carry/);
  assert.match(A.checkText('please set the password to something'), /don\u2019t take passwords/);
  assert.strictEqual(A.checkText('Read-only access to dashboards'), '');
  assert.throws(() => A.addCustom(hire, 'Payroll', 'Admin', 'bank account 12345678901'), /never carry/);
  const r = A.addCustom(hire, 'Analytics dashboard', 'Read-only', 'Weekly metrics'); assert.strictEqual(r.status, 'proposed'); assert.strictEqual(r.system, 'custom-analytics-dashboard');
});
test('quiz modules grade correctly and cite real sections', () => {
  const kb = KB.build(H.DOCS);
  for (const [id, m] of Object.entries(Q.MODULES)) { assert.ok(kb.byId[m.ref], id); for (const q of m.questions) { assert.ok(kb.byId[q.ref], q.ref); assert.ok(q.answer >= 0 && q.answer < q.options.length); } }
  const right = Q.MODULES.security.questions.map((q) => q.answer);
  assert.ok(Q.grade('security', right).passed); assert.strictEqual(Q.grade('security', right).pct, 100);
  const one = right.slice(); one[0] = (one[0] + 1) % 4; assert.ok(Q.grade('security', one).passed); // 4/5 = 80%
  const two = one.slice(); two[1] = (two[1] + 1) % 3; assert.ok(!Q.grade('security', two).passed);
  assert.strictEqual(Q.grade('benefits', [null, null]).unanswered, 5);
});
