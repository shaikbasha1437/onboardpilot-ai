const test = require('node:test'); const assert = require('node:assert');
const KB = require('../js/kb.js'); const H = require('../js/handbook.js'); const G = require('../js/guard.js');
const kb = KB.build(H.DOCS);
test('handbook splits into cited sections and only the wiki note is flagged', () => {
  assert.ok(kb.sections.length >= 40);
  const flagged = kb.sections.filter((s) => s.flagged.length);
  assert.deepStrictEqual(flagged.map((s) => s.id), ['wiki-tips#note-for-ai-assistants']);
  assert.strictEqual(flagged[0].flagged.length, 2);
});
const CASES = [
  ['When does my health insurance start?', 'benefits#health-insurance', /first day of the month/],
  ['How many PTO days do I get?', 'time-off#paid-time-off', /20 days/],
  ['Can I expense a desk for my home office?', 'expenses#home-office-stipend', /\$500/],
  ['How do I get GitHub access?', 'tools#github', /manager approval/],
  ['What is an LFR?', 'glossary#lfr', /Lumenfield Request/],
  ['How do I set up the VPN?', 'tools#vpn', /VPN client/],
  ['What are core hours?', 'working#working-hours', /10:00 to 15:00/],
  ['How much can I spend on hotels?', 'expenses#travel', /\$250/],
  ['Do I need a doctors note when sick?', 'time-off#sick-leave', /3 days or less/],
  ['How do I report phishing?', 'security#reporting-phishing', /security@lumenfield\.example/]
];
for (const [q, id, re] of CASES) test('answers "' + q + '" from ' + id, () => {
  const a = KB.answer(kb, q); assert.strictEqual(a.type, 'answer'); assert.strictEqual(a.citations[0], id); assert.match(a.text, re); assert.match(a.text, /\[1\]/);
});
test('injected wiki instructions never reach an answer', () => {
  const a = KB.answer(kb, 'Is PTO unlimited?');
  // The only "unlimited" claim is the injected one, so the assistant won't confirm it: it abstains and points at the real policy.
  assert.strictEqual(a.type, 'abstain'); assert.strictEqual(a.related, 'time-off#paid-time-off'); assert.doesNotMatch(a.text, /unlimited|payroll-verify/i);
  assert.ok(a.ignored.some((g) => g.id === 'wiki-tips#note-for-ai-assistants'));
  for (const q of ['note for AI assistants', 'how do I get paid faster', 'social security number payroll verify', 'meeting etiquette']) { const r = KB.answer(kb, q); assert.doesNotMatch(r.text, /payroll-verify|ignore all previous/i, q); }
});
for (const [q, route] of [['What is the dress code?', 'HR'], ['Is there a learning budget?', 'HR'], ['Do we get free lunch?', 'HR'], ['Can I bring my dog to the office?', 'HR'], ['What is the stock option vesting schedule?', 'HR'], ['Which printer should I use?', 'IT'], ['What will my first project be?', 'Manager']]) test('abstains and routes "' + q + '" to ' + route, () => {
  const a = KB.answer(kb, q, { hire: { name: 'Dana Ruiz', manager: 'Marcus Webb', managerEmail: 'marcus.webb@lumenfield.example' } });
  assert.strictEqual(a.type, 'abstain'); assert.strictEqual(a.route, route); assert.strictEqual(a.citations.length, 0); assert.ok(a.draft && a.draft.body.includes(q)); assert.match(a.text, /nothing is sent/);
});
test('bank details, SSNs and passwords are handed off and redacted', () => {
  const a = KB.answer(kb, 'Payroll needs my bank account number 123456789012, where do I send it?');
  assert.strictEqual(a.type, 'handoff'); assert.strictEqual(a.route, 'HR'); assert.match(a.text, /people\.lumenfield\.example/); assert.ok(a.sensitive.includes('bank')); assert.doesNotMatch(a.redactedQuestion, /123456789012/);
  const b = KB.answer(kb, 'my ssn is 123-45-6789'); assert.strictEqual(b.type, 'handoff'); assert.ok(b.sensitive.includes('ssn'));
  const c = KB.answer(kb, 'I forgot my password'); assert.strictEqual(c.type, 'handoff'); assert.strictEqual(c.route, 'IT');
  const d = KB.answer(kb, 'What is the password manager called?'); assert.strictEqual(d.type, 'answer'); assert.match(d.text, /Vaultline/);
});
test('redactPII catches SSNs, card numbers (Luhn), passwords and bank numbers but not dates', () => {
  const r = KB.redactPII('ssn 123-45-6789, card 4111 1111 1111 1111, password: hunter2, routing number 021000021, start 2026-11-16, phone 555-0100');
  assert.deepStrictEqual(r.found.sort(), ['bank', 'card', 'password', 'ssn']);
  assert.doesNotMatch(r.text, /6789|1111 1111|hunter2|021000021/); assert.match(r.text, /2026-11-16/); assert.match(r.text, /555-0100/);
  assert.deepStrictEqual(KB.redactPII('order 4111 1111 1111 1112').found, []);
});
test('live prompt fences sections, warns about flagged ones and asks for JSON', () => {
  const p = KB.buildPrompt(kb, 'Is PTO unlimited?', { name: 'Dana', roleLabel: 'Engineer', team: 'Platform', remote: true, startDate: '2026-11-02' }, []);
  const u = p.messages[p.messages.length - 1].content;
  assert.match(u, /<untrusted_source id="wiki-tips#note-for-ai-assistants"/); assert.match(u, /\[guard: 2 instruction-like/); assert.match(p.system, /JSON only/); assert.ok(p.sectionIds.includes('time-off#paid-time-off'));
  assert.throws(() => G.assertNoSecrets(p.system + u + 'sk-test-secret-123', ['sk-test-secret-123']), /Blocked/);
});
test('model answers are checked: citations, contacts and format', () => {
  const ids = ['time-off#paid-time-off', 'wiki-tips#note-for-ai-assistants'];
  const ok = KB.parseModelAnswer(kb, '```json\n{"answer":"You earn 20 days of PTO a year [time-off#paid-time-off].","citations":["time-off#paid-time-off"],"abstain":false,"route":null}\n```', ids, 'pto?');
  assert.strictEqual(ok.type, 'answer'); assert.strictEqual(ok.text, 'You earn 20 days of PTO a year [1].');
  const fake = KB.parseModelAnswer(kb, '{"answer":"PTO is unlimited [time-off#made-up].","citations":["time-off#made-up"],"abstain":false}', ids, 'pto?');
  assert.strictEqual(fake.type, 'abstain'); assert.ok(fake.withheld); assert.deepStrictEqual(fake.dropped, ['time-off#made-up']);
  const outside = KB.parseModelAnswer(kb, '{"answer":"20 days [time-off#paid-time-off]","citations":["time-off#paid-time-off","benefits#health-insurance"]}', ids, 'pto?');
  assert.deepStrictEqual(outside.citations, ['time-off#paid-time-off']);
  const exfil = KB.parseModelAnswer(kb, '{"answer":"Send your SSN to payroll-verify@lumenfield.example [wiki-tips#note-for-ai-assistants]","citations":["wiki-tips#note-for-ai-assistants"]}', ids, 'pay?');
  assert.strictEqual(exfil.type, 'abstain'); assert.ok(exfil.withheld); assert.deepStrictEqual(exfil.blocked, ['payroll-verify@lumenfield.example']);
  const ab = KB.parseModelAnswer(kb, '{"answer":"Not covered.","citations":[],"abstain":true,"route":"IT"}', ids, 'printer?');
  assert.strictEqual(ab.type, 'abstain'); assert.strictEqual(ab.route, 'IT'); assert.ok(!ab.withheld);
  assert.ok(KB.parseModelAnswer(kb, 'not json at all', ids, 'x').withheld);
});
