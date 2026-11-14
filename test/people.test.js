const test = require('node:test'); const assert = require('node:assert');
const PE = require('../js/people.js'); const S = require('../js/seed.js');
const [dana] = S.demoHires('2026-11-14');
test('wall-clock times convert to UTC across daylight saving', () => {
  assert.strictEqual(PE.zonedToUtc('2026-11-16', '10:00', 'America/Chicago').toISOString(), '2026-11-16T16:00:00.000Z');
  assert.strictEqual(PE.zonedToUtc('2026-07-01', '10:00', 'America/Chicago').toISOString(), '2026-07-01T15:00:00.000Z');
  assert.strictEqual(PE.zonedToUtc('2026-11-16', '10:00', 'Asia/Kolkata').toISOString(), '2026-11-16T04:30:00.000Z');
});
test('meeting suggestions cover manager, buddy, team and a cross-functional intro', () => {
  const ms = PE.suggestMeetings(dana); const ids = ms.map((m) => m.id);
  for (const id of ['welcome-1on1', 'buddy-coffee', 'buddy-weekly', 'team-intro', 'cross-intro', 'checkin-30']) assert.ok(ids.includes(id), id);
  assert.strictEqual(ms[0].date, dana.startDate); assert.ok(ms.every((m) => [1, 2, 3, 4, 5].includes(new Date(m.date + 'T12:00:00Z').getUTCDay())));
  assert.ok(ms.every((m) => /@lumenfield\.example$/.test(m.withEmail)));
});
test('.ics output is valid RFC 5545 and never invites anyone', () => {
  const ev = PE.suggestMeetings(dana).map((m) => PE.meetingEvent(dana, m));
  ev[0].title = 'Welcome; with commas, and a very long title that will definitely need folding because it is longer than seventy-five octets \u2014 caf\u00e9';
  const s = PE.ics(ev, { now: new Date('2026-11-14T12:00:00Z') });
  assert.ok(s.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n')); assert.ok(s.endsWith('END:VCALENDAR\r\n'));
  assert.match(s, /METHOD:PUBLISH/); assert.doesNotMatch(s, /METHOD:REQUEST/); assert.match(s, /RRULE:FREQ=WEEKLY;COUNT=4/);
  assert.strictEqual((s.match(/BEGIN:VEVENT/g) || []).length, 6); assert.match(s, /DTSTART:20261102T160000Z/);
  for (const line of s.split('\r\n')) assert.ok(Buffer.byteLength(line) <= 75, line);
  const unfolded = s.replace(/\r\n /g, ''); assert.match(unfolded, /SUMMARY:Welcome\\; with commas\\, and/); assert.match(unfolded, /caf\u00e9/);
  assert.match(unfolded, /ATTENDEE;CN=Dana Ruiz;RSVP=FALSE:mailto:dana\.ruiz@lumenfield\.example/);
  const allDay = PE.ics(PE.taskEvents(dana, dana.tasks)); assert.match(allDay, /DTSTART;VALUE=DATE:\d{8}/);
});
test('drafts and nudges are addressed correctly and never ask for personal data', () => {
  const ds = PE.welcomeDrafts(dana); assert.strictEqual(ds.length, 3);
  for (const d of ds) assert.doesNotMatch(d.body, /send (me |us )?your (bank|ssn|social)/i);
  assert.match(ds[0].body, /People portal/);
  const ns = PE.nudges(dana, dana.tasks, '2026-11-14'); assert.ok(ns.length >= 2);
  const mgr = ns.find((n) => n.owner === 'manager'); assert.match(mgr.to, /Marcus Webb <marcus\.webb@lumenfield\.example>/); assert.match(mgr.body, /overdue/);
  assert.strictEqual(PE.nudges(dana, dana.tasks.map((t) => Object.assign({}, t, { done: true })), '2026-11-14').length, 0);
  assert.strictEqual(PE.emailOf('Tom\u00e1s Rivera'), 'tomas.rivera@lumenfield.example');
});
