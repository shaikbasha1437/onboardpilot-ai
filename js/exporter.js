/* OnboardPilot exports: plan Markdown, task CSV (spreadsheet-formula safe), full JSON backup and import.
   Settings and API keys are never part of an export; key-like strings are redacted as a last check. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./plan.js'), require('./guard.js'));
  else (root.OP = root.OP || {}).exporter = factory(root.OP.plan, root.OP.guard);
})(typeof self !== 'undefined' ? self : this, function (P, G) {
  'use strict';
  function planMarkdown(hire, kb, today) {
    const pr = P.progress(hire.tasks, today);
    const L = ['# Onboarding plan: ' + hire.name, '', '- Role: ' + hire.roleLabel + ', ' + hire.team + ' team', '- Location: ' + (hire.remote ? 'Remote' : 'Office') + ' (' + hire.location + ')', '- Start date: ' + hire.startDate + ' (' + P.stage(hire, today) + ')', '- Manager: ' + hire.manager + '; buddy: ' + hire.buddy, '- Progress: ' + pr.done + ' of ' + pr.total + ' done (' + pr.pct + '%), ' + pr.overdueCount + ' overdue', ''];
    for (const ph of P.PHASES) {
      const ts = hire.tasks.filter((x) => x.phase === ph.id); if (!ts.length) continue;
      L.push('## ' + ph.label, '');
      for (const x of ts) { const sec = kb && x.ref && kb.byId[x.ref]; L.push('- [' + (x.done ? 'x' : ' ') + '] ' + x.title + ' \u2014 ' + (P.OWNERS[x.owner] || x.owner) + ', due ' + x.due + (P.status(x, today) === 'overdue' ? ' (overdue)' : '') + (sec ? ' \u2014 see "' + sec.docTitle + ' \u203a ' + sec.title + '"' : '')); }
      L.push('');
    }
    if (hire.access && hire.access.length) { L.push('## Access requests', ''); for (const r of hire.access) L.push('- ' + r.label + ' (' + r.level + '): ' + r.status + (r.approvedBy ? ', approved by ' + r.approvedBy : '') + (r.result ? ' \u2014 ' + r.result : '')); L.push(''); }
    L.push('_Exported from OnboardPilot AI. Provisioning shown here is simulated; fictional demo data uses .example addresses._');
    return G.redactKeys(L.join('\n')) + '\n';
  }
  function csvCell(v) { let s = String(v == null ? '' : v); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }
  function tasksCsv(hires, today) {
    const rows = [['hire', 'role', 'team', 'start_date', 'phase', 'task', 'owner', 'due', 'status', 'done_at']];
    for (const h of hires) for (const x of h.tasks) rows.push([h.name, h.roleLabel, h.team, h.startDate, x.phase, x.title, P.OWNERS[x.owner] || x.owner, x.due, P.status(x, today), x.doneAt || '']);
    return G.redactKeys(rows.map((r) => r.map(csvCell).join(',')).join('\r\n')) + '\r\n';
  }
  const DROP = /^(key|keys|apiKey|api_key|token|secret|password|settings)$/i;
  function scrub(v) { if (Array.isArray(v)) return v.map(scrub); if (v && typeof v === 'object') { const o = {}; for (const k of Object.keys(v)) if (!DROP.test(k)) o[k] = scrub(v[k]); return o; } return typeof v === 'string' ? G.redactKeys(v) : v; }
  function backupJson(state) { return JSON.stringify({ app: 'onboardpilot-ai', version: 1, exportedAt: new Date().toISOString(), data: scrub({ hires: state.hires, docs: state.docs, templates: state.templates, usingDemoDocs: state.usingDemoDocs }) }, null, 2); }
  function parseBackup(text) {
    let j; try { j = JSON.parse(text); } catch (e) { throw new Error('That file is not valid JSON.'); }
    if (!j || j.app !== 'onboardpilot-ai' || !j.data || !Array.isArray(j.data.hires)) throw new Error('That is not an OnboardPilot backup.');
    for (const h of j.data.hires) if (!h || !h.id || !h.name || !Array.isArray(h.tasks) || !P.isDate(h.startDate)) throw new Error('A hire in the backup is missing required fields.');
    return scrub(j.data);
  }
  return { planMarkdown, csvCell, tasksCsv, backupJson, parseBackup, scrub };
});
