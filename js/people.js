/* OnboardPilot people: buddy and intro meeting suggestions, drafted welcome and intro messages, nudges
   for overdue items, and RFC 5545 calendar files. Everything here is a draft: nothing is sent, and the
   .ics files use METHOD:PUBLISH so importing one never emails attendees. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./plan.js'), require('./handbook.js'));
  else (root.OP = root.OP || {}).people = factory(root.OP.plan, root.OP.handbook);
})(typeof self !== 'undefined' ? self : this, function (P, H) {
  'use strict';
  const DOMAIN = H.COMPANY.domain;
  const CONTACTS = {
    engineer: { name: 'Elena Park', title: 'Product manager, Platform', why: 'how product and engineering plan work together' },
    sales: { name: 'Ravi Desai', title: 'Solutions engineer', why: 'how technical discovery and demos work' },
    designer: { name: 'Tom\u00e1s Rivera', title: 'Prism design system lead', why: 'the components and patterns you will use most' },
    support: { name: 'Ines Duarte', title: 'Product support liaison', why: 'how bugs move from the queue to engineering' }
  };
  const first = (n) => String(n || '').split(/\s+/)[0];
  const emailOf = (n) => String(n || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z ]/g, '').trim().replace(/\s+/g, '.') + '@' + DOMAIN;
  function teamAlias(team) { return String(team || 'team').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '-team@' + DOMAIN; }
  /* Meeting suggestions. Times are wall-clock in the hire's time zone. */
  function suggestMeetings(hire) {
    const s = hire.startDate; const c = CONTACTS[hire.role] || CONTACTS.engineer; const out = [];
    const add = (id, title, withName, withEmail, date, time, mins, purpose, extra) => out.push(Object.assign({ id, title, with: withName, withEmail, date, time, mins, tz: hire.timezone, purpose }, extra || {}));
    add('welcome-1on1', 'Welcome 1:1: ' + hire.name + ' and ' + hire.manager, hire.manager, hire.managerEmail, s, '10:00', 45, 'Welcome, walk through the onboarding plan and agree 30, 60 and 90 day goals.');
    add('buddy-coffee', 'Coffee with your buddy ' + first(hire.buddy), hire.buddy, hire.buddyEmail, s, '14:00', 30, 'Informal hello; the buddy is the go-to person for small questions.');
    add('buddy-weekly', 'Weekly buddy check-in', hire.buddy, hire.buddyEmail, P.workday(P.addDays(s, 7)), '15:30', 20, 'Short weekly check-in for the first month.', { rrule: 'FREQ=WEEKLY;COUNT=4' });
    add('team-intro', 'Say hello at the ' + hire.team + ' standup', hire.team + ' team', teamAlias(hire.team), P.workday(P.addDays(s, 1)), '10:30', 15, 'Quick introduction to the team.');
    add('cross-intro', 'Intro: ' + c.name + ' (' + c.title + ')', c.name, emailOf(c.name), P.workday(P.addDays(s, 3)), '11:00', 30, 'Learn ' + c.why + '.');
    add('checkin-30', '30-day check-in', hire.manager, hire.managerEmail, P.dueDate(s, 30), '10:00', 30, 'Progress against your 30-day goals; feedback both ways.');
    return out;
  }
  function welcomeDrafts(hire) {
    const s = P.prettyDate(hire.startDate);
    return [
      { id: 'welcome-hire', kind: 'Email', from: hire.manager, to: hire.personalEmailNote || hire.name + ' (personal email on file in the People portal)', subject: 'Welcome to ' + H.COMPANY.name + ', ' + first(hire.name) + '!', body: 'Hi ' + first(hire.name) + ',\n\nWe\u2019re excited to have you join the ' + hire.team + ' team on ' + s + '. ' + (hire.remote ? 'Your laptop is on its way and should arrive a few days before you start.' : 'Pick up your badge and laptop at reception when you arrive.') + '\n\nOn day one we\u2019ll have a welcome 1:1 at 10:00 and you\u2019ll have coffee with your buddy, ' + hire.buddy + '. Your onboarding plan lists everything for the first 90 days, and you can ask the onboarding assistant any handbook question.\n\nPlease don\u2019t email bank details or ID numbers to anyone; those go only in the People portal.\n\nSee you soon,\n' + hire.manager },
      { id: 'team-announce', kind: 'Slack post', from: hire.manager, to: '#' + String(hire.team).toLowerCase().replace(/[^a-z0-9]+/g, '-'), subject: '', body: ':wave: Please welcome ' + hire.name + ', who joins us as ' + hire.roleLabel + ' on ' + s + '! ' + first(hire.buddy) + ' is their buddy. Say hi in thread and share one thing you wish you\u2019d known in your first week.' },
      { id: 'buddy-intro', kind: 'Email', from: hire.manager, to: hire.buddy + ' <' + hire.buddyEmail + '>', subject: 'You\u2019re ' + first(hire.name) + '\u2019s onboarding buddy', body: 'Hi ' + first(hire.buddy) + ',\n\nThanks for being ' + hire.name + '\u2019s buddy. They start on ' + s + (hire.remote ? ' (remote, ' + hire.location + ')' : ' in ' + hire.location) + '. I\u2019ve suggested a coffee on day one and a short weekly check-in for the first month.\n\nThanks!\n' + hire.manager }
    ];
  }
  /* Nudges for overdue tasks, one draft per owner. */
  function nudges(hire, tasks, today) {
    const over = tasks.filter((x) => !x.done && x.due < today); const groups = {};
    for (const x of over) (groups[x.owner] = groups[x.owner] || []).push(x);
    const target = { hire: [hire.name, hire.email], manager: [hire.manager, hire.managerEmail], buddy: [hire.buddy, hire.buddyEmail], IT: ['IT help desk', H.COMPANY.itEmail], HR: ['People team', H.COMPANY.hrEmail] };
    return Object.keys(groups).map((owner) => {
      const [name, email] = target[owner] || [owner, '']; const items = groups[owner];
      const lines = items.map((x) => '\u2022 ' + x.title + ' (due ' + P.prettyDate(x.due) + ', ' + P.daysBetween(x.due, today) + ' day' + (P.daysBetween(x.due, today) === 1 ? '' : 's') + ' overdue)').join('\n');
      return { owner, to: name + (email ? ' <' + email + '>' : ''), subject: 'Onboarding reminder for ' + hire.name + ': ' + items.length + ' overdue item' + (items.length === 1 ? '' : 's'), body: 'Hi ' + first(name) + ',\n\nA friendly reminder about ' + (owner === 'hire' ? 'your' : hire.name + '\u2019s') + ' onboarding:\n\n' + lines + '\n\nIf something is blocked, reply and we\u2019ll sort it out.\n\nThanks!', items: items.map((x) => x.id) };
    });
  }
  /* ---------- time zones ---------- */
  function tzOffsetMin(utcMs, tz) {
    const f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const p = Object.fromEntries(f.formatToParts(new Date(utcMs)).map((x) => [x.type, x.value]));
    return (Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second) - utcMs) / 60000;
  }
  /* Wall-clock date + time in an IANA zone -> UTC Date. */
  function zonedToUtc(date, time, tz) {
    const [y, m, d] = date.split('-').map(Number); const [hh, mm] = time.split(':').map(Number);
    const wall = Date.UTC(y, m - 1, d, hh, mm);
    let t = wall - tzOffsetMin(wall, tz) * 60000; t = wall - tzOffsetMin(t, tz) * 60000;
    return new Date(t);
  }
  /* ---------- iCalendar ---------- */
  const icsEsc = (s) => String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
  function fold(line) {
    const enc = new TextEncoder(); if (enc.encode(line).length <= 75) return line;
    const out = []; let cur = ''; let len = 0; const lim = () => (out.length ? 74 : 75);
    for (const ch of line) { const n = enc.encode(ch).length; if (len + n > lim()) { out.push(cur); cur = ''; len = 0; } cur += ch; len += n; }
    out.push(cur); return out.join('\r\n ');
  }
  const stamp = (d) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  function ics(events, o) {
    const now = (o && o.now) || new Date();
    const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//OnboardPilot AI//Onboarding//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
    for (const e of events) {
      L.push('BEGIN:VEVENT', 'UID:' + e.uid + '@onboardpilot.' + DOMAIN, 'DTSTAMP:' + stamp(now));
      if (e.allDay) { L.push('DTSTART;VALUE=DATE:' + e.date.replace(/-/g, ''), 'DTEND;VALUE=DATE:' + P.addDays(e.date, 1).replace(/-/g, '')); }
      else { const st = zonedToUtc(e.date, e.time, e.tz || 'UTC'); L.push('DTSTART:' + stamp(st), 'DTEND:' + stamp(new Date(st.getTime() + e.mins * 60000))); }
      if (e.rrule) L.push('RRULE:' + e.rrule);
      L.push('SUMMARY:' + icsEsc(e.title));
      if (e.description) L.push('DESCRIPTION:' + icsEsc(e.description));
      if (e.organizer) L.push('ORGANIZER;CN=' + icsEsc(e.organizer.name) + ':mailto:' + e.organizer.email);
      for (const a of e.attendees || []) if (a.email && /@/.test(a.email)) L.push('ATTENDEE;CN=' + icsEsc(a.name) + ';RSVP=FALSE:mailto:' + a.email);
      L.push('END:VEVENT');
    }
    L.push('END:VCALENDAR');
    return L.map(fold).join('\r\n') + '\r\n';
  }
  function meetingEvent(hire, m) {
    return { uid: hire.id + '-' + m.id, title: m.title, date: m.date, time: m.time, mins: m.mins, tz: m.tz, rrule: m.rrule, description: m.purpose + '\n\nDrafted by OnboardPilot. Importing this file does not send invitations.', organizer: { name: hire.manager, email: hire.managerEmail }, attendees: [{ name: hire.name, email: hire.email }, { name: m.with, email: m.withEmail }] };
  }
  function taskEvents(hire, tasks) { return tasks.filter((x) => !x.done).map((x) => ({ uid: hire.id + '-' + x.id, title: 'Onboarding: ' + x.title, date: x.due, allDay: true, description: 'Owner: ' + (P.OWNERS[x.owner] || x.owner) + ' for ' + hire.name })); }
  return { CONTACTS, emailOf, teamAlias, suggestMeetings, welcomeDrafts, nudges, tzOffsetMin, zonedToUtc, icsEsc, fold, ics, meetingEvent, taskEvents };
});
