/* OnboardPilot plans: editable role templates, date maths (weekday-adjusted due dates), plan generation
   per hire (role, remote or office, start date), progress, overdue and due-soon detection. Pure functions. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else (root.OP = root.OP || {}).plan = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const PHASES = [
    { id: 'pre', label: 'Before day one' }, { id: 'day1', label: 'First day' }, { id: 'week1', label: 'First week' },
    { id: 'd30', label: 'First 30 days' }, { id: 'd60', label: 'Days 31 to 60' }, { id: 'd90', label: 'Days 61 to 90' }
  ];
  const OWNERS = { hire: 'New hire', manager: 'Manager', buddy: 'Buddy', IT: 'IT', HR: 'People team' };
  const t = (title, phase, owner, day, extra) => Object.assign({ title, phase, owner, day, where: 'any' }, extra || {});
  const DEFAULT_TEMPLATES = {
    common: { label: 'Everyone', tasks: [
      t('Ship laptop and confirm delivery', 'pre', 'IT', -3, { where: 'remote', ref: 'tools#your-laptop' }),
      t('Create email account and send the sign-in link', 'pre', 'IT', -2, { ref: 'tools#email-and-calendar' }),
      t('Pick a buddy and introduce them', 'pre', 'manager', -2, { ref: 'working#buddy-program' }),
      t('Collect badge and laptop at reception', 'day1', 'hire', 0, { where: 'office', ref: 'working#office-access' }),
      t('Set up MFA and the Vaultline password manager', 'day1', 'hire', 0, { ref: 'security#multi-factor-authentication' }),
      t('Join #welcome, #announcements, your team channel and #help-it', 'day1', 'hire', 0, { ref: 'tools#slack' }),
      t('First 1:1 with your manager: agree 30, 60 and 90 day goals', 'day1', 'manager', 0, { ref: 'working#one-on-ones' }),
      t('Coffee chat with your buddy', 'day1', 'buddy', 0, { ref: 'working#buddy-program' }),
      t('Review and approve access requests', 'week1', 'manager', 1, { ref: 'tools#requesting-access' }),
      t('Read your team\u2019s onboarding doc', 'week1', 'hire', 2, { ref: 'working#your-first-week' }),
      t('Security essentials knowledge check', 'week1', 'hire', 4, { quiz: 'security', ref: 'security#security-training' }),
      t('Benefits and time off knowledge check', 'd30', 'hire', 14, { quiz: 'benefits', ref: 'benefits#health-insurance' }),
      t('Tools and expenses knowledge check', 'd30', 'hire', 14, { quiz: 'tools', ref: 'tools#requesting-access' }),
      t('Enroll in health benefits in the People portal', 'd30', 'hire', 25, { ref: 'benefits#health-insurance' }),
      t('30-day check-in with your manager', 'd30', 'manager', 30, { ref: 'working#30-60-and-90-day-check-ins' }),
      t('Claim the home office stipend in Ledgerly', 'd60', 'hire', 45, { where: 'remote', ref: 'expenses#home-office-stipend' }),
      t('60-day check-in with your manager', 'd60', 'manager', 60, { ref: 'working#30-60-and-90-day-check-ins' }),
      t('Buddy program wrap-up', 'd90', 'buddy', 88, { ref: 'working#buddy-program' }),
      t('90-day check-in and goals for next quarter', 'd90', 'manager', 90, { ref: 'working#30-60-and-90-day-check-ins' })
    ] },
    engineer: { label: 'Software engineer', tasks: [
      t('Set up your dev environment on the gold path', 'week1', 'hire', 1, { ref: 'glossary#gold-path' }),
      t('Request GitHub and VPN access', 'week1', 'hire', 1, { ref: 'tools#github' }),
      t('Pair with your buddy on a small first change', 'week1', 'buddy', 4),
      t('Attend the Thursday architecture review', 'd30', 'hire', 10, { ref: 'org#engineering' }),
      t('Read the LFR guide and review one open LFR', 'd30', 'hire', 21, { ref: 'glossary#lfr' }),
      t('Own a small feature end to end', 'd60', 'hire', 55),
      t('Demo your work at Ship Room', 'd90', 'hire', 85, { ref: 'glossary#ship-room' })
    ] },
    sales: { label: 'Account executive', tasks: [
      t('Shadow your first customer call', 'week1', 'hire', 2, { ref: 'org#sales' }),
      t('CRM training and pipeline review with your manager', 'week1', 'manager', 3),
      t('Ask your manager about a corporate card', 'week1', 'hire', 4, { ref: 'expenses#corporate-card' }),
      t('Shadow at least five customer calls', 'd30', 'hire', 12, { ref: 'org#sales' }),
      t('Run your first discovery call with your manager listening', 'd30', 'hire', 30),
      t('Take over a book of ten accounts', 'd60', 'manager', 55),
      t('Progress your first deal to proposal stage', 'd90', 'hire', 85)
    ] },
    designer: { label: 'Product designer', tasks: [
      t('Tour the Prism design system', 'week1', 'hire', 2, { ref: 'org#product-and-design' }),
      t('Attend Tuesday design critique', 'week1', 'hire', 4, { ref: 'org#product-and-design' }),
      t('Pair with a product manager on a squad brief', 'd30', 'hire', 20),
      t('Present a design at critique', 'd60', 'hire', 45, { ref: 'org#product-and-design' }),
      t('Ship a design to production', 'd90', 'hire', 85)
    ] },
    support: { label: 'Support specialist', tasks: [
      t('Shadow tickets with the support team lead', 'week1', 'hire', 1, { ref: 'org#customer-support' }),
      t('Learn the helpdesk macros and tone guide', 'week1', 'hire', 3),
      t('Take your own ticket queue', 'd30', 'manager', 10, { ref: 'org#customer-support' }),
      t('Handle your first escalation with a lead', 'd30', 'hire', 25),
      t('Write or update one help-center article', 'd60', 'hire', 50),
      t('Run a support retro with the team', 'd90', 'hire', 85)
    ] }
  };
  /* ---------- dates (YYYY-MM-DD strings, UTC maths so time zones never shift a day) ---------- */
  const D = (s) => { const [y, m, d] = String(s).split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); };
  const S = (dt) => dt.toISOString().slice(0, 10);
  function isDate(s) { return /^\d{4}-\d{2}-\d{2}$/.test(String(s || '')) && S(D(s)) === s; }
  function addDays(s, n) { const d = D(s); d.setUTCDate(d.getUTCDate() + n); return S(d); }
  function weekday(s) { return D(s).getUTCDay(); }
  /* Move weekend dates to the nearest working day in the direction of travel (before start: Friday; after: Monday). */
  function workday(s, back) { let d = s; while (weekday(d) === 0 || weekday(d) === 6) d = addDays(d, back ? -1 : 1); return d; }
  function dueDate(start, day) { return workday(addDays(start, day), day < 0); }
  function daysBetween(a, b) { return Math.round((D(b) - D(a)) / 86400000); }
  function todayLocal(now) { const d = now || new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function nextMonday(s) { let d = addDays(s, 1); while (weekday(d) !== 1) d = addDays(d, 1); return d; }
  function prettyDate(s) { if (!isDate(s)) return s || ''; return D(s).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }); }

  let seq = 0; const uid = (p) => (p || 't') + '-' + Date.now().toString(36) + '-' + (++seq).toString(36) + Math.random().toString(36).slice(2, 6);
  function templateTasks(templates, role, remote) {
    const tm = templates || DEFAULT_TEMPLATES; const where = remote ? 'remote' : 'office';
    return [].concat((tm.common && tm.common.tasks) || [], (tm[role] && tm[role].tasks) || []).filter((x) => !x.where || x.where === 'any' || x.where === where);
  }
  function generate(hire, templates) {
    const order = Object.fromEntries(PHASES.map((p, i) => [p.id, i]));
    return templateTasks(templates, hire.role, hire.remote).map((x) => ({ id: uid('task'), title: x.title, phase: x.phase, owner: x.owner, due: dueDate(hire.startDate, Number(x.day) || 0), day: Number(x.day) || 0, ref: x.ref || '', quiz: x.quiz || '', done: false, doneAt: null, note: '' }))
      .sort((a, b) => order[a.phase] - order[b.phase] || a.due.localeCompare(b.due));
  }
  function status(task, today) { if (task.done) return 'done'; if (task.due < today) return 'overdue'; if (daysBetween(today, task.due) <= 2) return 'soon'; return 'open'; }
  function progress(tasks, today) {
    const total = tasks.length; const done = tasks.filter((x) => x.done).length;
    const overdue = tasks.filter((x) => status(x, today) === 'overdue');
    const byPhase = PHASES.map((p) => { const ts = tasks.filter((x) => x.phase === p.id); return { id: p.id, label: p.label, total: ts.length, done: ts.filter((x) => x.done).length }; }).filter((p) => p.total);
    const byOwner = {}; for (const x of overdue) byOwner[x.owner] = (byOwner[x.owner] || 0) + 1;
    return { total, done, pct: total ? Math.round((done / total) * 100) : 0, overdue, overdueCount: overdue.length, byPhase, byOwner, soon: tasks.filter((x) => status(x, today) === 'soon') };
  }
  function dayNumber(hire, today) { return daysBetween(hire.startDate, today); }
  function stage(hire, today) { const n = dayNumber(hire, today); if (n < 0) return 'Starts in ' + -n + ' day' + (n === -1 ? '' : 's'); if (n === 0) return 'Day one'; if (n <= 90) return 'Day ' + n + ' of 90'; return 'Onboarding window complete'; }
  /* Validate a template edited in the UI. Returns { ok, errors:[...], template }. */
  function validateTemplate(tpl) {
    const errors = []; const phases = new Set(PHASES.map((p) => p.id));
    const tasks = (tpl.tasks || []).map((x, i) => {
      const title = String(x.title || '').trim(); const day = Number(x.day);
      if (!title) errors.push('Task ' + (i + 1) + ' needs a title.');
      if (!phases.has(x.phase)) errors.push('Task ' + (i + 1) + ' has an unknown phase.');
      if (!OWNERS[x.owner]) errors.push('Task ' + (i + 1) + ' has an unknown owner.');
      if (!Number.isFinite(day) || day < -14 || day > 120) errors.push('Task ' + (i + 1) + ': day must be a number from -14 to 120.');
      return { title, phase: x.phase, owner: x.owner, day: Number.isFinite(day) ? Math.round(day) : 0, where: ['any', 'remote', 'office'].includes(x.where) ? x.where : 'any', ref: x.ref || '', quiz: x.quiz || '' };
    });
    if (!String(tpl.label || '').trim()) errors.push('The template needs a name.');
    return { ok: !errors.length, errors, template: { label: String(tpl.label || '').trim(), tasks } };
  }
  return { PHASES, OWNERS, DEFAULT_TEMPLATES, isDate, addDays, weekday, workday, dueDate, daysBetween, todayLocal, nextMonday, prettyDate, uid, templateTasks, generate, status, progress, dayNumber, stage, validateTemplate };
});
