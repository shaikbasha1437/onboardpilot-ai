/* OnboardPilot demo data: four fictional Lumenfield Labs hires at different stages, dated relative to
   the day you first open the app so there is always something overdue, due soon and done. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./plan.js'), require('./access.js'), require('./people.js'));
  else (root.OP = root.OP || {}).seed = factory(root.OP.plan, root.OP.access, root.OP.people);
})(typeof self !== 'undefined' ? self : this, function (P, A, PE) {
  'use strict';
  const ROLES = { engineer: 'Software engineer', sales: 'Account executive', designer: 'Product designer', support: 'Support specialist' };
  const TIMEZONES = ['America/Chicago', 'America/New_York', 'America/Denver', 'America/Los_Angeles', 'America/Toronto', 'America/Vancouver', 'Europe/London', 'Europe/Berlin', 'Asia/Kolkata', 'Asia/Singapore', 'Australia/Sydney', 'UTC'];
  function mondayOnOrBefore(s) { let d = s; while (P.weekday(d) !== 1) d = P.addDays(d, -1); return d; }
  function makeHire(f, templates) {
    const h = { id: 'hire-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7), name: String(f.name).trim(), email: PE.emailOf(f.name), role: f.role, roleLabel: (templates && templates[f.role] && templates[f.role].label) || ROLES[f.role] || f.role, team: String(f.team).trim(), remote: !!f.remote, location: String(f.location || (f.remote ? 'Remote' : 'Office')).trim(), timezone: f.timezone || 'America/Chicago', startDate: f.startDate, manager: String(f.manager).trim(), managerEmail: PE.emailOf(f.manager), buddy: String(f.buddy).trim(), buddyEmail: PE.emailOf(f.buddy), createdAt: new Date().toISOString(), quiz: {}, chat: [] };
    h.tasks = P.generate(h, templates);
    h.access = A.propose(h, []);
    return h;
  }
  function demoHires(today, templates) {
    const defs = [
      { name: 'Dana Ruiz', role: 'engineer', team: 'Platform', remote: true, location: 'Remote (US Central)', timezone: 'America/Chicago', startDate: mondayOnOrBefore(P.addDays(today, -9)), manager: 'Marcus Webb', buddy: 'Aiko Tanaka', open: ['Security essentials knowledge check', 'Request GitHub and VPN access', 'Review and approve access requests'], approved: ['email', 'slack', 'laptop', 'vaultline'] },
      { name: 'Sam Okoye', role: 'sales', team: 'Mid-market Sales', remote: false, location: 'Austin office', timezone: 'America/Chicago', startDate: P.nextMonday(today), manager: 'Carmen Reyes', buddy: 'Luis Ortega', open: [], approved: [] , doneTitles: ['Create email account and send the sign-in link'] },
      { name: 'Maya Chen', role: 'designer', team: 'Design', remote: true, location: 'Remote (US Mountain)', timezone: 'America/Denver', startDate: mondayOnOrBefore(P.addDays(today, -35)), manager: 'Ana Folau', buddy: 'Ben Adeyemi', open: ['Pair with a product manager on a squad brief'], approved: ['email', 'slack', 'laptop', 'vaultline', 'github', 'figma', 'ledgerly'], quiz: { security: { best: 100, last: 100 }, benefits: { best: 80, last: 80 }, tools: { best: 80, last: 60 } } },
      { name: 'Jordan Blake', role: 'support', team: 'Customer Support', remote: false, location: 'Toronto office', timezone: 'America/Toronto', startDate: mondayOnOrBefore(P.addDays(today, -2)), manager: 'Kofi Mensah', buddy: 'Nia Brooks', open: ['Set up MFA and the Vaultline password manager'], approved: ['email', 'slack', 'laptop'] }
    ];
    return defs.map((d) => {
      const h = makeHire(d, templates);
      for (const x of h.tasks) {
        const before = x.due < today;
        if ((before && !d.open.includes(x.title)) || (d.doneTitles || []).includes(x.title)) { x.done = true; x.doneAt = x.due + 'T17:00:00.000Z'; x.doneBy = x.owner === 'hire' ? h.name : x.owner === 'manager' ? h.manager : x.owner === 'buddy' ? h.buddy : x.owner; }
        if (x.quiz && d.quiz && d.quiz[x.quiz] && d.quiz[x.quiz].best >= 80) { x.done = true; x.doneAt = x.doneAt || x.due + 'T17:00:00.000Z'; }
      }
      for (const r of h.access) if (d.approved.includes(r.system)) { A.approve(r, { role: 'manager', name: h.manager }, h); A.execute(r, h); }
      h.quiz = d.quiz || {}; h.demo = true;
      return h;
    });
  }
  return { ROLES, TIMEZONES, makeHire, demoHires, mondayOnOrBefore };
});
