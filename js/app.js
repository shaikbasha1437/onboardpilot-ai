/* OnboardPilot AI app: hire picker and viewer roles, plan checklists, cited chat, approval-gated access,
   knowledge checks, meetings and drafts, team dashboard, handbook upload, plan templates, settings,
   exports and backups. Modal and undo-toast utilities are shared with the earlier AgentKit apps. */
(function () {
  'use strict';
  const $ = (s, r) => (r || document).querySelector(s); const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const OP = window.OP; const T = OP.text; const G = OP.guard; const HB = OP.handbook; const KB = OP.kb; const P = OP.plan; const A = OP.access; const Q = OP.quiz; const PE = OP.people; const DOCS = OP.docs; const X = OP.exporter; const SEED = OP.seed;
  const LLM = window.AgentKit.llm; const WEBLLM = window.OPWebLLM; const ST = window.OPStore; const ls = ST.ls;
  const esc = T.esc; const clone = (x) => JSON.parse(JSON.stringify(x));
  const LS = { settings: 'op.settings', keys: 'op.keys', theme: 'op.theme', visited: 'op.visited' };
  const PROVIDERS = Object.assign({}, LLM.PROVIDERS, { webllm: { label: 'In-browser (WebLLM, experimental)', defaultModel: WEBLLM.MODELS[0].id, models: WEBLLM.MODELS.map((m) => m.id), needsKey: false } });
  const DEFAULTS = { mode: 'demo', provider: 'openai', models: {}, baseUrl: '', remember: false, viewer: 'hire', tab: 'plan', planFilter: 'all' };
  let settings = Object.assign({}, DEFAULTS, ls.get(LS.settings, {}));
  let keys = settings.remember ? ls.get(LS.keys, {}) : {};
  let state = null; let kb = null; let busy = false; let quizDraft = null;
  const today = () => P.todayLocal();
  const saveSettings = () => { ls.set(LS.settings, settings); if (settings.remember) ls.set(LS.keys, keys); else ls.del(LS.keys); };
  const persist = () => ST.save(state);
  const hire = () => state.hires.find((h) => h.id === state.current) || state.hires[0] || null;
  const viewer = () => { const h = hire(); return settings.viewer === 'manager' ? { role: 'manager', name: h ? h.manager : 'Manager' } : settings.viewer === 'admin' ? { role: 'admin', name: 'Hana Sato' } : { role: 'hire', name: h ? h.name : 'New hire' }; };
  const isAdmin = () => settings.viewer === 'admin'; const isLead = () => settings.viewer !== 'hire';

  /* ---------------- toast with undo ---------------- */
  let toastTimer = null;
  function toast(msg, undo) {
    const t = $('#toast');
    t.innerHTML = '<span>' + esc(msg) + '</span>' + (undo ? '<button type="button" id="toast-undo">Undo</button>' : '');
    t.classList.add('show');
    if (undo) $('#toast-undo').onclick = () => { t.classList.remove('show'); undo(); };
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), undo ? 8000 : 3800);
  }
  function snapshot(label) { const before = clone(state); return () => { state = before; rebuildKb(); persist(); renderAll(); toast(label + ' undone.'); }; }
  /* ---------------- modals: X, Cancel, Esc, backdrop, Back; discard prompt for unsaved edits ---------------- */
  let modal = null; let lastFocus = null;
  function openModal(title, html, o) {
    const op = o || {};
    if (modal) removeModal('replaced'); else lastFocus = document.activeElement;
    window.history.pushState({ opModal: true }, '');
    $('#modal-host').innerHTML = '<div class="backdrop"><section class="modal ' + (op.wide ? 'wide' : '') + '" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div class="modal-header"><h2 id="modal-title">' + esc(title) + '</h2><button type="button" data-close="x" aria-label="Close">×</button></div><div class="modal-body">' + html + '</div><div class="modal-footer">' + (op.extraFooter || '') + '<button type="button" data-close="cancel">' + esc(op.cancelLabel || (op.save ? 'Cancel' : 'Close')) + '</button>' + (op.save ? '<button type="button" id="modal-save" class="primary">' + esc(op.saveLabel || 'Save') + '</button>' : '') + '</div></section></div>';
    modal = { dirty: false, watch: !!op.dirty, onClose: op.onClose || null, name: op.name || '' };
    document.body.style.overflow = 'hidden';
    $('.backdrop').addEventListener('mousedown', (e) => { if (e.target.classList.contains('backdrop')) closeModal(); });
    $$('[data-close]').forEach((b) => (b.onclick = () => closeModal()));
    $('.modal-body').addEventListener('input', () => { if (modal && modal.watch) modal.dirty = true; });
    if (op.save) $('#modal-save').onclick = () => op.save();
    if (op.onmount) op.onmount();
    setTimeout(() => { if (!modal) return; const first = $('.modal-body input:not([type=checkbox]):not([type=radio]):not([type=hidden]):not([type=file]):not([readonly]),.modal-body textarea,.modal-body select'); const el = op.focusFirst && first ? first : $('.modal [data-close=x]'); if (el) el.focus(); }, 0);
  }
  function removeModal(reason) { const m = modal; modal = null; $('#modal-host').innerHTML = ''; document.body.style.overflow = ''; if (reason !== 'replaced' && lastFocus && lastFocus.focus && document.contains(lastFocus)) lastFocus.focus({ preventScroll: true }); if (m && m.onClose) m.onClose(reason || 'cancel'); }
  function closeModal(force, reason) { if (!modal || modal.closing) return; if (!force && modal.dirty && !confirm('Discard unsaved changes?')) return; modal.dirty = false; modal.closing = true; modal.reason = reason; const m = modal; window.history.back(); setTimeout(() => { if (modal === m) removeModal(m.reason); }, 800); }
  addEventListener('popstate', () => { if (!modal) return; if (!modal.closing && modal.dirty && !confirm('Discard unsaved changes?')) { window.history.pushState({ opModal: true }, ''); return; } removeModal(modal.reason); });
  addEventListener('keydown', (e) => {
    if (!modal) return;
    if (e.key === 'Escape') { e.preventDefault(); closeModal(); return; }
    if (e.key === 'Tab') { const els = $$('.modal button,.modal input,.modal select,.modal textarea,.modal a[href]').filter((x) => !x.disabled && x.offsetParent !== null); if (!els.length) return; const f = els[0]; const l = els[els.length - 1]; if (e.shiftKey && document.activeElement === f) { l.focus(); e.preventDefault(); } else if (!e.shiftKey && document.activeElement === l) { f.focus(); e.preventDefault(); } }
  });
  function download(name, data, type) { const blob = new Blob([data], { type: type || 'text/plain' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500); }
  async function copy(text) { try { await navigator.clipboard.writeText(text); toast('Copied. Nothing was sent.'); } catch (e) { toast('Copy failed; select the text and copy it yourself.'); } }
  const fileSlug = (s) => String(s || 'export').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  /* ---------------- state ---------------- */
  function fresh() { const t = today(); const templates = clone(P.DEFAULT_TEMPLATES); const hires = SEED.demoHires(t, templates); return { version: 1, seededOn: t, hires, docs: clone(HB.DOCS), usingDemoDocs: true, templates, current: hires[0].id }; }
  function rebuildKb() { kb = KB.build(state.docs.length ? state.docs : []); }

  /* ---------------- header / context ---------------- */
  function renderContext() {
    const sel = $('#hire-select'); const h = hire();
    sel.innerHTML = state.hires.map((x) => '<option value="' + esc(x.id) + '"' + (h && x.id === h.id ? ' selected' : '') + '>' + esc(x.name) + ' \u2014 ' + esc(x.roleLabel) + '</option>').join('') || '<option value="">No hires yet</option>';
    $('#viewer').value = settings.viewer;
    $('#viewer').options[1].textContent = 'Manager' + (h ? ' (' + h.manager + ')' : '');
    $('#viewer').options[0].textContent = 'New hire' + (h ? ' (' + h.name + ')' : '');
    $('#edit-hire').disabled = !h || !isLead(); $('#delete-hire').disabled = !h || !isLead(); $('#add-hire').disabled = !isLead();
    $('#add-hire').title = isLead() ? '' : 'Switch to Manager or HR admin to add a hire';
    const live = settings.mode === 'live'; const pv = PROVIDERS[settings.provider];
    $('#mode-pill').textContent = live ? 'Live mode \u00b7 ' + pv.label + ' \u00b7 ' + modelFor() : 'Demo mode \u00b7 no key';
    $('#mode-pill').className = 'pill ' + (live ? 'ok' : '');
    if (!h) { $('#hire-summary').innerHTML = '<span>Add a new hire to build a plan.</span>'; return; }
    const pr = P.progress(h.tasks, today()); const pend = h.access.filter((r) => r.status === 'proposed').length;
    $('#hire-summary').innerHTML = '<span><b>' + esc(h.team) + '</b> team</span><span>' + (h.remote ? 'Remote' : 'Office') + ' \u00b7 ' + esc(h.location) + '</span><span>Starts ' + esc(P.prettyDate(h.startDate)) + ' \u00b7 <b>' + esc(P.stage(h, today())) + '</b></span><span>Manager <b>' + esc(h.manager) + '</b> \u00b7 Buddy <b>' + esc(h.buddy) + '</b></span><span><b>' + pr.pct + '%</b> done</span>' + (pr.overdueCount ? '<span class="pill bad">' + pr.overdueCount + ' overdue</span>' : '') + (pend ? '<span class="pill warn">' + pend + ' access awaiting approval</span>' : '');
  }
  function renderTabs() { $$('#tabs [data-tab]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === settings.tab))); }
  function renderAll() { renderContext(); renderTabs(); renderPanel(); }
  function renderPanel() {
    const p = $('#panel'); const h = hire();
    const fn = { plan: renderPlan, ask: renderAsk, access: renderAccess, learn: renderLearn, people: renderPeople, team: renderTeam, handbook: renderHandbook, templates: renderTemplates }[settings.tab] || renderPlan;
    if (!h && !['team', 'handbook', 'templates'].includes(settings.tab)) { p.innerHTML = '<div class="empty">No new hires. ' + (isLead() ? '<button type="button" class="primary" data-act="add-hire">+ New hire</button>' : 'Switch to Manager or HR admin to add one.') + '</div>'; return; }
    p.innerHTML = fn(h);
    if (settings.tab === 'ask') { const c = $('#chat-end'); if (c && h.chat.length) c.scrollIntoView({ block: 'nearest' }); }
  }
  const ownerPill = (o) => '<span class="pill">' + esc(P.OWNERS[o] || o) + '</span>';
  const statusPill = (s) => ({ overdue: '<span class="pill bad">Overdue</span>', soon: '<span class="pill warn">Due soon</span>', done: '<span class="pill ok">Done</span>', open: '' }[s]);
  const secLabel = (id) => { const s = kb.byId[id]; return s ? s.docTitle + ' \u203a ' + s.title : id; };

  /* ---------------- plan ---------------- */
  function renderPlan(h) {
    const t = today(); const pr = P.progress(h.tasks, t); const f = settings.planFilter;
    const mine = (x) => (settings.viewer === 'hire' ? x.owner === 'hire' : settings.viewer === 'manager' ? x.owner === 'manager' : true);
    const show = (x) => f === 'all' || (f === 'mine' && mine(x)) || (f === 'overdue' && P.status(x, t) === 'overdue') || (f === 'open' && !x.done);
    const opt = (v, l) => '<option value="' + v + '"' + (f === v ? ' selected' : '') + '>' + l + '</option>';
    let html = '<div class="toolbar"><div class="grow"><div class="row"><b>' + pr.done + ' of ' + pr.total + ' done</b><span class="muted small">' + esc(P.stage(h, t)) + '</span></div><div class="bar" style="margin-top:6px" role="img" aria-label="Progress ' + pr.pct + '%"><i style="width:' + pr.pct + '%"></i></div></div>' +
      '<label class="sr-only" for="plan-filter">Show</label><select id="plan-filter" style="width:auto">' + opt('all', 'All tasks') + opt('mine', settings.viewer === 'hire' ? 'My tasks' : settings.viewer === 'manager' ? 'Manager tasks' : 'All owners') + opt('open', 'Not done') + opt('overdue', 'Overdue') + '</select>' +
      '<button type="button" data-act="add-task">+ Task</button>' + (isLead() ? '<button type="button" data-act="regen">Rebuild from template</button>' : '') + '</div>';
    if (pr.overdueCount) html += '<div class="note bad" style="margin:0 0 12px">' + pr.overdueCount + ' overdue: ' + Object.entries(pr.byOwner).map(([o, n]) => n + ' for ' + esc(P.OWNERS[o] || o)).join(', ') + '. ' + (isLead() ? '<button type="button" class="linkish" data-act="nudges">Draft nudges</button>' : 'Your manager can send reminders.') + '</div>';
    let any = false;
    for (const ph of P.PHASES) {
      const ts = h.tasks.filter((x) => x.phase === ph.id && show(x)); if (!ts.length) continue; any = true;
      const all = h.tasks.filter((x) => x.phase === ph.id);
      html += '<section class="phase"><h3>' + esc(ph.label) + ' <span class="pill">' + all.filter((x) => x.done).length + '/' + all.length + '</span></h3>' + ts.map((x) => {
        const s = P.status(x, t);
        return '<div class="task' + (x.done ? ' done' : '') + '" data-s="' + s + '" data-id="' + esc(x.id) + '"><input type="checkbox" data-act="toggle" aria-label="Done: ' + esc(x.title) + '"' + (x.done ? ' checked' : '') + '><div><div class="tt">' + esc(x.title) + '</div><div class="meta">' + ownerPill(x.owner) + '<span>Due ' + esc(P.prettyDate(x.due)) + '</span>' + statusPill(s) + (x.ref && kb.byId[x.ref] ? '<button type="button" class="linkish" data-act="open-sec" data-sec="' + esc(x.ref) + '">' + esc(secLabel(x.ref)) + '</button>' : '') + (x.quiz && !x.done ? '<button type="button" class="linkish" data-act="go-quiz" data-quiz="' + esc(x.quiz) + '">Take the check</button>' : '') + (x.note ? '<span>\u00b7 ' + esc(x.note) + '</span>' : '') + '</div></div><div class="acts"><button type="button" class="small-btn" data-act="edit-task">Edit</button><button type="button" class="small-btn danger" data-act="del-task" aria-label="Delete ' + esc(x.title) + '">Delete</button></div></div>';
      }).join('') + '</section>';
    }
    if (!any) html += '<div class="empty">Nothing matches this filter.</div>';
    return html;
  }
  function toggleTask(id, done) {
    const h = hire(); const x = h.tasks.find((y) => y.id === id); if (!x) return;
    x.done = done; x.doneAt = done ? new Date().toISOString() : null; x.doneBy = done ? viewer().name : null; persist(); renderContext(); renderPanel();
  }
  const opts = (sel, v) => Object.entries(sel).map(([k, l]) => '<option value="' + esc(k) + '"' + (k === v ? ' selected' : '') + '>' + esc(l) + '</option>').join('');
  function taskForm(x) {
    const phases = Object.fromEntries(P.PHASES.map((p) => [p.id, p.label]));
    return '<div class="field"><label for="tf-title">Task <span class="muted">(required)</span></label><input id="tf-title" maxlength="160" value="' + esc(x.title || '') + '"><div class="err" id="tf-err" hidden></div></div>' +
      '<div class="row2"><div class="field"><label for="tf-phase">Phase</label><select id="tf-phase">' + opts(phases, x.phase || 'week1') + '</select></div><div class="field"><label for="tf-owner">Owner</label><select id="tf-owner">' + opts(P.OWNERS, x.owner || 'hire') + '</select></div></div>' +
      '<div class="row2"><div class="field"><label for="tf-due">Due date</label><input id="tf-due" type="date" value="' + esc(x.due || today()) + '"></div><div class="field"><label for="tf-ref">Handbook link</label><select id="tf-ref"><option value="">None</option>' + kb.sections.map((s) => '<option value="' + esc(s.id) + '"' + (s.id === x.ref ? ' selected' : '') + '>' + esc(s.docTitle + ' \u203a ' + s.title) + '</option>').join('') + '</select></div></div>' +
      '<div class="field"><label for="tf-note">Note</label><input id="tf-note" maxlength="200" value="' + esc(x.note || '') + '"><div class="help">Don\u2019t put passwords, ID numbers or bank details here.</div></div>';
  }
  function editTask(id) {
    const h = hire(); const x = id ? h.tasks.find((y) => y.id === id) : null;
    openModal(x ? 'Edit task' : 'Add a task', taskForm(x || {}), { dirty: true, name: 'task', focusFirst: true, save: () => {
      const title = $('#tf-title').value.trim(); const due = $('#tf-due').value; const note = $('#tf-note').value.trim(); const err = $('#tf-err');
      const bad = !title ? 'Give the task a title.' : !P.isDate(due) ? 'Pick a valid due date.' : A.checkText(title + ' ' + note);
      if (bad) { err.hidden = false; err.textContent = bad; $('#tf-title').focus(); return; }
      const undo = snapshot(x ? 'Task edit' : 'New task'); const hh = hire();
      const t = x ? hh.tasks.find((y) => y.id === id) : { id: P.uid('task'), done: false, doneAt: null, day: P.daysBetween(hh.startDate, due), quiz: '' };
      Object.assign(t, { title, phase: $('#tf-phase').value, owner: $('#tf-owner').value, due, ref: $('#tf-ref').value, note });
      if (!x) hh.tasks.push(t);
      const order = Object.fromEntries(P.PHASES.map((p, i) => [p.id, i])); hh.tasks.sort((a, b) => order[a.phase] - order[b.phase] || a.due.localeCompare(b.due));
      persist(); modal.dirty = false; closeModal(true, 'saved'); renderAll(); toast(x ? 'Task saved.' : 'Task added.', undo);
    } });
  }
  function deleteTask(id) { const h = hire(); const i = h.tasks.findIndex((y) => y.id === id); if (i < 0) return; const undo = snapshot('Delete'); const [x] = h.tasks.splice(i, 1); persist(); renderAll(); toast('Deleted \u201c' + x.title + '\u201d.', undo); }
  function regenPlan() {
    const h = hire(); const undo = snapshot('Rebuild');
    const doneTitles = new Set(h.tasks.filter((x) => x.done).map((x) => x.title)); const fresh = P.generate(h, state.templates);
    for (const x of fresh) if (doneTitles.has(x.title)) { x.done = true; x.doneAt = new Date().toISOString(); }
    h.tasks = fresh; persist(); renderAll(); toast('Plan rebuilt from the ' + h.roleLabel + ' template; finished tasks kept.', undo);
  }

  /* ---------------- ask ---------------- */
  const SAMPLES = ['When does my health insurance start?', 'How many PTO days do I get?', 'Can I expense a desk for my home office?', 'How do I get GitHub access?', 'What is an LFR?', 'Is PTO unlimited?', 'Can I bring my dog to the office?', 'Payroll needs my bank account number, where do I send it?'];
  function citeButtons(m) { return m.citations && m.citations.length ? '<div class="cites">' + m.citations.map((id, i) => '<button type="button" class="cite" data-act="open-sec" data-sec="' + esc(id) + '">[' + (i + 1) + '] ' + esc(secLabel(id)) + '</button>').join('') + '</div>' : ''; }
  function draftBox(d) { return '<div class="draft"><div class="hd"><span><b>Draft to ' + esc(d.to) + '</b> <span class="pill">Not sent</span></span><button type="button" class="small-btn" data-act="copy" data-text="' + esc((d.subject ? 'Subject: ' + d.subject + '\n\n' : '') + d.body) + '">Copy</button></div>' + (d.subject ? '<div class="small muted">Subject: ' + esc(d.subject) + '</div>' : '') + '<pre>' + esc(d.body) + '</pre></div>'; }
  function renderMsg(m) {
    if (m.role === 'user') return '<div class="bubble user"><div class="who">' + esc(m.by || 'You') + '</div><p>' + esc(m.text) + '</p>' + (m.redacted ? '<div class="note bad">Removed before saving: ' + esc(m.redacted.join(', ')) + '. This chat never keeps them.</div>' : '') + '</div>';
    const cls = m.type === 'abstain' ? 'abstain' : m.type === 'handoff' ? 'handoff' : m.type === 'error' ? 'error' : 'answer';
    const who = m.type === 'abstain' ? 'Not in the handbook \u00b7 routed to ' + (m.route === 'Manager' ? 'manager' : m.route) : m.type === 'handoff' ? 'Hand-off \u00b7 ' + (m.route === 'IT' ? 'IT help desk' : 'official HR portal') : m.type === 'error' ? 'Live call failed' : 'Answer from the handbook';
    return '<div class="bubble ' + cls + '"><div class="who">' + esc(who) + '</div><p>' + esc(m.text) + '</p>' + citeButtons(m) +
      (m.related && kb.byId[m.related] ? '<div class="cites related"><span class="small muted">Closest section, not a direct answer:</span><button type="button" class="cite" data-act="open-sec" data-sec="' + esc(m.related) + '">' + esc(secLabel(m.related)) + '</button></div>' : '') +
      (m.ignored && m.ignored.length ? '<div class="note">Guard: ignored ' + m.ignored.map((g) => g.count + ' instruction-like sentence' + (g.count === 1 ? '' : 's') + ' in \u201c' + esc(g.title) + '\u201d').join('; ') + '. Text inside documents is treated as data, never as instructions.</div>' : '') +
      (m.withheld ? '<div class="note bad">The model\u2019s reply was withheld because it did not pass the citation and safety checks.</div>' : '') +
      (m.draft ? draftBox(m.draft) : '') + (m.meta ? '<div class="small muted" style="margin-top:6px">' + esc(m.meta) + '</div>' : '') + '</div>';
  }
  function renderAsk(h) {
    const live = settings.mode === 'live';
    return '<div class="grid2 ask-grid"><div><div class="chat" id="chat">' + (h.chat.length ? h.chat.map(renderMsg).join('') : '<div class="empty">Ask anything about benefits, time off, expenses, security, tools, teams or company terms. Answers cite the handbook; if it isn\u2019t there, you get a hand-off to the right person instead of a guess.</div>') + '<div id="chat-end"></div></div>' +
      '<form id="ask-form" class="composer" autocomplete="off"><div><label for="ask-input" class="sr-only">Your question</label><textarea id="ask-input" rows="2" maxlength="600" placeholder="Ask the onboarding assistant\u2026"></textarea></div><button type="submit" class="primary" id="ask-btn"' + (busy ? ' disabled' : '') + '>' + (busy ? 'Thinking\u2026' : 'Ask') + '</button></form>' +
      '<div class="chips" id="samples">' + SAMPLES.map((s) => '<button type="button" class="chip" data-act="sample">' + esc(s) + '</button>').join('') + '</div></div>' +
      '<aside class="panel"><h2>How answers work</h2><p class="small">' + (live ? 'Live mode: the top handbook sections are sent, fenced as untrusted data, to <b>' + esc(PROVIDERS[settings.provider].label) + '</b>. Replies must cite those sections; anything uncited, or with contact details the sources don\u2019t contain, is withheld.' : 'Demo mode: BM25 retrieval over the handbook picks the best sections and quotes the matching sentences. No AI model, no key, nothing leaves the page.') + '</p><p class="small">Bank details, tax forms, ID numbers and passwords are never taken here. They are removed before anything is stored, and you\u2019re pointed to the official HR portal (' + esc(HB.COMPANY.portal) + ').</p><p class="small">Instruction-like text inside documents is flagged and ignored. The demo wiki contains one such note on purpose.</p>' + (h.chat.length ? '<button type="button" class="danger" data-act="clear-chat">Clear chat</button>' : '') + '</aside></div>';
  }
  function modelFor() { return settings.models[settings.provider] || PROVIDERS[settings.provider].defaultModel; }
  async function ask(q) {
    const h = hire(); q = String(q || '').trim(); if (!q || busy) return;
    const red = KB.redactPII(q); const stored = red.found.length ? red.text : q;
    h.chat.push({ role: 'user', text: stored, by: viewer().name, at: new Date().toISOString(), redacted: red.found.length ? red.found.map((f) => ({ ssn: 'Social Security number', bank: 'bank or routing number', card: 'card number', password: 'password' }[f])) : null });
    const demoAns = KB.answer(kb, q, { hire: h });
    const useLive = settings.mode === 'live' && demoAns.type !== 'handoff';
    if (!useLive) { h.chat.push(Object.assign({ role: 'assistant', at: new Date().toISOString(), meta: 'Demo engine (BM25 retrieval)' }, demoAns)); persist(); renderAll(); return; }
    busy = true; renderPanel();
    try {
      const prompt = KB.buildPrompt(kb, stored, h, h.chat.slice(0, -1));
      G.assertNoSecrets(prompt.system + JSON.stringify(prompt.messages), Object.values(keys).filter(Boolean));
      let r;
      if (settings.provider === 'webllm') r = await WEBLLM.call(modelFor(), prompt, (p) => { const b = $('#ask-btn'); if (b) b.textContent = 'Loading model ' + Math.round((p.progress || 0) * 100) + '%'; });
      else r = await LLM.call({ provider: settings.provider, key: keys[settings.provider] || '', model: modelFor(), baseUrl: settings.provider === 'compatible' ? settings.baseUrl : '' }, prompt);
      const a = KB.parseModelAnswer(kb, r.text, prompt.sectionIds, stored, h);
      a.meta = PROVIDERS[settings.provider].label + ' \u00b7 ' + (r.model || modelFor()) + ' \u00b7 ' + r.latencyMs + ' ms \u00b7 ' + r.usage.input + '+' + r.usage.output + ' tokens' + (r.cost != null ? ' \u00b7 ~$' + r.cost.toFixed(5) : '');
      if (a.dropped && a.dropped.length) a.meta += ' \u00b7 dropped ' + a.dropped.length + ' invalid citation(s)';
      h.chat.push(Object.assign({ role: 'assistant', at: new Date().toISOString() }, a));
    } catch (e) {
      h.chat.push({ role: 'assistant', type: 'error', text: G.redactKeys(e.message), at: new Date().toISOString() });
      h.chat.push(Object.assign({ role: 'assistant', at: new Date().toISOString(), meta: 'Demo engine answer, shown because the live call failed' }, demoAns));
    } finally { busy = false; persist(); if (settings.tab === 'ask') renderPanel(); }
  }

  /* ---------------- access ---------------- */
  function renderAccess(h) {
    const v = viewer(); const can = A.canApprove(v, h);
    const st = { proposed: '<span class="pill warn">Awaiting approval</span>', approved: '<span class="pill">Approved \u00b7 not yet provisioned</span>', done: '<span class="pill ok">Provisioned (simulated)</span>', rejected: '<span class="pill bad">Rejected</span>' };
    const pending = h.access.filter((r) => r.status === 'proposed').length; const approved = h.access.filter((r) => r.status === 'approved').length;
    let html = '<div class="toolbar"><div class="grow small muted">The agent proposes accounts and equipment from the ' + esc(h.roleLabel) + ' template. Nothing is provisioned until ' + esc(h.manager) + ' or an HR admin approves it, and provisioning here is simulated.</div><button type="button" data-act="propose">Propose from role</button><button type="button" data-act="add-req">+ Request something else</button>' + (can && pending ? '<button type="button" data-act="approve-all">Approve all (' + pending + ')</button>' : '') + (can && approved ? '<button type="button" class="primary" data-act="exec-all">Provision approved (' + approved + ')</button>' : '') + '</div>';
    html += '<div class="note ok" style="margin:0 0 12px"><b>Personal details hand-off:</b> bank details, tax forms, ID numbers and emergency contacts go only in the official HR portal at ' + esc(HB.COMPANY.portal) + '. OnboardPilot never asks for them, and IT never needs your password.</div>';
    if (!can) html += '<div class="note" style="margin:0 0 12px">Viewing as ' + esc(v.name) + '. Only ' + esc(h.manager) + ' (Manager view) or an HR admin can approve. ' + (settings.viewer === 'hire' ? 'Switch \u201cViewing as\u201d to try the approval step.' : '') + '</div>';
    if (!h.access.length) html += '<div class="empty">No access requests yet. Use \u201cPropose from role\u201d.</div>';
    html += h.access.map((r) => '<div class="req" data-id="' + esc(r.id) + '" data-status="' + r.status + '"><div><h3>' + esc(r.label) + ' ' + st[r.status] + '</h3><div class="small muted">' + esc(r.level) + (r.reason ? ' \u00b7 ' + esc(r.reason) : '') + (r.ref && kb.byId[r.ref] ? ' \u00b7 <button type="button" class="linkish" data-act="open-sec" data-sec="' + esc(r.ref) + '">policy</button>' : '') + '</div>' + (r.result ? '<div class="small" style="margin-top:4px">' + esc(r.result) + '</div>' : '') + '<details><summary>Audit log (' + r.log.length + ')</summary><ul>' + r.log.map((l) => '<li>' + esc(new Date(l.at).toLocaleString()) + ' \u00b7 ' + esc(l.by) + ': ' + esc(l.what) + '</li>').join('') + '</ul></details></div><div class="acts">' +
      (r.status === 'proposed' && can ? '<button type="button" class="small-btn" data-act="approve">Approve</button><button type="button" class="small-btn danger" data-act="reject">Reject</button>' : '') +
      (r.status === 'approved' && can ? '<button type="button" class="small-btn primary" data-act="exec">Provision (simulated)</button><button type="button" class="small-btn danger" data-act="reject">Revoke approval</button>' : '') +
      (r.status === 'proposed' && !can ? '<span class="small muted">Waiting for ' + esc(h.manager) + '</span>' : '') +
      (r.status === 'rejected' || (r.status === 'proposed' && r.proposedBy === 'manual') ? '<button type="button" class="small-btn" data-act="del-req">Remove</button>' : '') + '</div></div>').join('');
    return html;
  }
  function syncAccessTask(h) { const t = h.tasks.find((x) => /approve access requests/i.test(x.title)); if (t && !t.done && !h.access.some((r) => r.status === 'proposed' || r.status === 'approved')) { t.done = true; t.doneAt = new Date().toISOString(); t.doneBy = viewer().name; } }
  function accessAct(act, id) {
    const h = hire(); const v = viewer(); const r = h.access.find((x) => x.id === id);
    try {
      if (act === 'approve') { const undo = snapshot('Approval'); A.approve(r, v, h); persist(); renderAll(); toast('Approved ' + r.label + '. Provision it when ready.', undo); }
      if (act === 'reject') { const undo = snapshot('Rejection'); A.reject(r, v, h); syncAccessTask(h); persist(); renderAll(); toast('Rejected ' + r.label + '.', undo); }
      if (act === 'exec') { const undo = snapshot('Provisioning'); A.execute(r, h); syncAccessTask(h); persist(); renderAll(); toast(r.result, undo); }
      if (act === 'del-req') { const undo = snapshot('Remove'); h.access = h.access.filter((x) => x.id !== id); persist(); renderAll(); toast('Removed ' + r.label + '.', undo); }
      if (act === 'approve-all') { const undo = snapshot('Approve all'); let n = 0; for (const x of h.access) if (x.status === 'proposed') { A.approve(x, v, h); n++; } persist(); renderAll(); toast('Approved ' + n + ' request' + (n === 1 ? '' : 's') + '.', undo); }
      if (act === 'exec-all') { const undo = snapshot('Provisioning'); let n = 0; for (const x of h.access) if (x.status === 'approved') { A.execute(x, h); n++; } syncAccessTask(h); persist(); renderAll(); toast('Provisioned ' + n + ' (simulated).', undo); }
      if (act === 'propose') { const add = A.propose(h, h.access); if (!add.length) { toast('Everything the ' + h.roleLabel + ' template needs is already requested.'); return; } const undo = snapshot('Proposal'); h.access = h.access.concat(add); persist(); renderAll(); toast('Proposed ' + add.length + ' request' + (add.length === 1 ? '' : 's') + ' for approval.', undo); }
    } catch (e) { toast(e.message); }
  }
  function addRequest() {
    openModal('Request access or equipment', '<div class="field"><label for="ar-sys">System or equipment <span class="muted">(required)</span></label><input id="ar-sys" maxlength="80" placeholder="e.g. Analytics dashboard"></div><div class="field"><label for="ar-level">Access level</label><input id="ar-level" maxlength="80" placeholder="e.g. Read-only"></div><div class="field"><label for="ar-why">Why it\u2019s needed</label><textarea id="ar-why" rows="3" maxlength="300"></textarea><div class="help">Never include passwords, ID numbers or bank details. IT sets passwords through single sign-on.</div></div><div class="err" id="ar-err" hidden></div>', { dirty: true, focusFirst: true, saveLabel: 'Submit for approval', name: 'add-req', save: () => {
      const h = hire();
      try { const r = A.addCustom(h, $('#ar-sys').value, $('#ar-level').value, $('#ar-why').value); r.log[0].by = viewer().name; const undo = snapshot('Request'); h.access.push(r); persist(); modal.dirty = false; closeModal(true, 'saved'); renderAll(); toast('Requested ' + r.label + '; waiting for approval.', undo); } catch (e) { const er = $('#ar-err'); er.hidden = false; er.textContent = e.message; }
    } });
  }

  /* ---------------- learn ---------------- */
  function renderLearn(h) {
    if (quizDraft && quizDraft.hireId === h.id) return renderQuiz(h);
    return '<p class="muted small" style="margin-top:0">Short checks on the handbook. Pass with 80% to complete the matching plan task. Each answer links to its source.</p><div class="cards">' + Object.entries(Q.MODULES).map(([id, m]) => { const s = h.quiz[id]; return '<div class="card" data-quiz="' + id + '"><h3>' + esc(m.title) + '</h3><div class="small muted">' + m.questions.length + ' questions \u00b7 source: ' + esc(secLabel(m.ref)) + '</div><div>' + (s ? (s.best >= 80 ? '<span class="pill ok">Passed \u00b7 best ' + s.best + '%</span>' : '<span class="pill warn">Best ' + s.best + '%, not passed yet</span>') : '<span class="pill">Not started</span>') + '</div><div class="row"><button type="button" class="primary" data-act="start-quiz" data-quiz="' + id + '">' + (s ? 'Retake' : 'Start') + '</button></div></div>'; }).join('') + '</div>';
  }
  function renderQuiz() {
    const m = Q.MODULES[quizDraft.id]; const g = quizDraft.graded;
    return '<div class="toolbar"><h2 class="grow" style="margin:0;font-size:17px">' + esc(m.title) + '</h2><button type="button" data-act="quit-quiz">' + (g ? 'Back to modules' : 'Leave check') + '</button></div><form id="quiz-form">' + m.questions.map((q, i) => { const r = g && g.results[i]; return '<fieldset class="q' + (r ? (r.correct ? ' right' : ' wrong') : '') + '"><legend>' + (i + 1) + '. ' + esc(q.q) + '</legend>' + q.options.map((o, j) => '<label><input type="radio" name="q' + i + '" value="' + j + '"' + (quizDraft.answers[i] === j ? ' checked' : '') + (g ? ' disabled' : '') + '> <span>' + esc(o) + (g && j === q.answer ? ' <span class="pill ok">Correct answer</span>' : '') + '</span></label>').join('') + (g ? '<div class="small">Source: <button type="button" class="linkish" data-act="open-sec" data-sec="' + esc(q.ref) + '">' + esc(secLabel(q.ref)) + '</button></div>' : '') + '</fieldset>'; }).join('') +
      (g ? '<div class="note ' + (g.passed ? 'ok' : 'bad') + '" id="quiz-result">' + g.score + ' of ' + g.total + ' (' + g.pct + '%). ' + (g.passed ? 'Passed; the plan task is marked done.' : 'Not passed yet; review the sources and retake.') + '</div><div class="row" style="margin-top:10px"><button type="button" data-act="start-quiz" data-quiz="' + quizDraft.id + '">Retake</button><button type="button" class="primary" data-act="quit-quiz">Done</button></div>' : '<div class="err" id="quiz-err" hidden></div><button type="submit" class="primary">Submit answers</button>') + '</form>';
  }
  function submitQuiz() {
    const h = hire(); const m = Q.MODULES[quizDraft.id];
    const answers = m.questions.map((q, i) => { const c = $('input[name="q' + i + '"]:checked'); return c ? Number(c.value) : null; });
    if (answers.some((a) => a == null)) { const e = $('#quiz-err'); e.hidden = false; e.textContent = 'Answer every question first (' + answers.filter((a) => a == null).length + ' left).'; return; }
    const g = Q.grade(quizDraft.id, answers); quizDraft.answers = answers; quizDraft.graded = g;
    const prev = h.quiz[quizDraft.id] || { best: 0 }; h.quiz[quizDraft.id] = { best: Math.max(prev.best || 0, g.pct), last: g.pct, at: new Date().toISOString() };
    if (g.passed) { const t = h.tasks.find((x) => x.quiz === quizDraft.id); if (t && !t.done) { t.done = true; t.doneAt = new Date().toISOString(); t.doneBy = h.name; } }
    persist(); renderAll(); const r = $('#quiz-result'); if (r) r.scrollIntoView({ block: 'center' });
  }

  /* ---------------- people ---------------- */
  function renderPeople(h) {
    const ms = PE.suggestMeetings(h); const ds = PE.welcomeDrafts(h); const ns = PE.nudges(h, h.tasks, today());
    const fmt = (m) => P.prettyDate(m.date) + ', ' + m.time + ' (' + m.tz.replace(/_/g, ' ') + ')';
    return '<div class="grid2"><section><div class="toolbar"><h2 class="grow" style="margin:0;font-size:16px">Suggested meetings</h2><button type="button" data-act="ics-all">All as .ics</button></div>' + ms.map((m) => '<div class="req"><div><h3>' + esc(m.title) + '</h3><div class="small muted">' + esc(fmt(m)) + ' \u00b7 ' + m.mins + ' min' + (m.rrule ? ' \u00b7 weekly \u00d74' : '') + ' \u00b7 with ' + esc(m.with) + '</div><div class="small">' + esc(m.purpose) + '</div></div><div class="acts"><button type="button" class="small-btn" data-act="ics-one" data-m="' + esc(m.id) + '" aria-label="Download ' + esc(m.title) + ' as .ics">.ics</button></div></div>').join('') + '<p class="small muted">Calendar files use METHOD:PUBLISH, so importing one adds the event to your own calendar without emailing anyone. Times are in the hire\u2019s time zone.</p></section>' +
      '<section><h2 style="margin:0 0 10px;font-size:16px">Drafted messages</h2>' + ds.map((d) => '<div class="draft"><div class="hd"><span><b>' + esc(d.kind) + '</b> to ' + esc(d.to) + ' <span class="pill">Draft \u00b7 not sent</span></span><button type="button" class="small-btn" data-act="copy" data-text="' + esc((d.subject ? 'Subject: ' + d.subject + '\n\n' : '') + d.body) + '">Copy</button></div>' + (d.subject ? '<div class="small muted">Subject: ' + esc(d.subject) + '</div>' : '') + '<pre>' + esc(d.body) + '</pre></div>').join('') +
      '<h2 style="margin:16px 0 10px;font-size:16px">Nudges for overdue items</h2>' + (ns.length ? ns.map((n) => draftBox(n)).join('') : '<div class="empty">Nothing overdue for ' + esc(h.name) + '.</div>') + '</section></div>';
  }
  function icsFor(h, ids) { const ms = PE.suggestMeetings(h).filter((m) => !ids || ids.includes(m.id)); return PE.ics(ms.map((m) => PE.meetingEvent(h, m))); }

  /* ---------------- team dashboard ---------------- */
  function renderTeam() {
    const t = today(); if (!isLead()) return '<div class="empty">The team dashboard is for managers and HR. Switch \u201cViewing as\u201d to Manager or HR admin.</div>';
    const rows = state.hires.map((h) => ({ h, pr: P.progress(h.tasks, t), pend: h.access.filter((r) => r.status === 'proposed' || r.status === 'approved').length, quiz: Object.keys(Q.MODULES).filter((k) => h.quiz[k] && h.quiz[k].best >= 80).length }));
    const tot = rows.reduce((a, r) => ({ over: a.over + r.pr.overdueCount, pend: a.pend + r.pend, pct: a.pct + r.pr.pct }), { over: 0, pend: 0, pct: 0 });
    return '<div class="kpis"><div class="kpi"><b>' + rows.length + '</b><span>new hires</span></div><div class="kpi"><b>' + (rows.length ? Math.round(tot.pct / rows.length) : 0) + '%</b><span>average progress</span></div><div class="kpi"><b>' + tot.over + '</b><span>overdue items</span></div><div class="kpi"><b>' + tot.pend + '</b><span>access requests open</span></div></div>' +
      '<div class="toolbar"><div class="grow small muted">Click a name to open their plan.</div><button type="button" data-act="nudges-all"' + (tot.over ? '' : ' disabled') + '>Draft nudges for all overdue</button></div>' +
      '<div class="table-wrap"><table class="tbl stack"><thead><tr><th>Hire</th><th>Role \u00b7 team</th><th>Stage</th><th>Progress</th><th>Overdue</th><th>Access open</th><th>Checks passed</th></tr></thead><tbody>' + rows.map((r) => '<tr><td data-l="Hire"><button type="button" class="linkish" data-act="pick-hire" data-hid="' + esc(r.h.id) + '">' + esc(r.h.name) + '</button></td><td data-l="Role">' + esc(r.h.roleLabel) + ' \u00b7 ' + esc(r.h.team) + '</td><td data-l="Stage">' + esc(P.stage(r.h, t)) + '</td><td data-l="Progress"><div class="row" style="flex-wrap:nowrap"><div class="bar" style="width:90px"><i style="width:' + r.pr.pct + '%"></i></div><span class="small">' + r.pr.pct + '%</span></div></td><td data-l="Overdue">' + (r.pr.overdueCount ? '<span class="pill bad">' + r.pr.overdueCount + '</span>' : '0') + '</td><td data-l="Access open">' + r.pend + '</td><td data-l="Checks passed">' + r.quiz + ' / ' + Object.keys(Q.MODULES).length + '</td></tr>').join('') + '</tbody></table></div>';
  }
  function showNudges(list) {
    const t = today(); const all = list.flatMap((h) => PE.nudges(h, h.tasks, t));
    openModal('Nudge drafts (' + all.length + ')', all.length ? '<p class="small muted" style="margin-top:0">Drafts only. Copy one into your mail or chat app if you want to send it.</p>' + all.map((n) => draftBox(n)).join('') : '<div class="empty">Nothing overdue.</div>', { wide: true, name: 'nudges', onmount: () => $$('.modal [data-act="copy"]').forEach((b) => (b.onclick = () => copy(b.dataset.text))) });
  }

  /* ---------------- handbook ---------------- */
  function renderHandbook() {
    const docs = state.docs; const counts = Object.fromEntries(docs.map((d) => [d.id, kb.sections.filter((s) => s.docId === d.id)]));
    return '<div class="toolbar"><div class="grow small muted">' + (state.usingDemoDocs ? 'Demo handbook for the fictional Lumenfield Labs.' : 'Your handbook' + (docs.some((d) => !d.uploaded) ? ' (includes demo docs)' : '') + '.') + ' ' + kb.sections.length + ' sections, ' + kb.flaggedCount + ' flagged sentence' + (kb.flaggedCount === 1 ? '' : 's') + '.</div>' + (isAdmin() ? '<button type="button" class="primary" data-act="upload">Upload handbook</button>' + (!state.usingDemoDocs ? '<button type="button" data-act="restore-docs">Restore demo handbook</button>' : '') : '<span class="small muted">Switch to HR admin to upload your own handbook.</span>') + '</div>' +
      (docs.length ? '<div class="cards">' + docs.map((d) => { const secs = counts[d.id] || []; const fl = secs.reduce((a, s) => a + s.flagged.length, 0); return '<div class="card" data-doc="' + esc(d.id) + '"><h3>' + esc(d.title) + '</h3><div class="small muted">' + secs.length + ' section' + (secs.length === 1 ? '' : 's') + ' \u00b7 ' + esc(d.owner || '') + (d.updated ? ' \u00b7 updated ' + esc(d.updated) : '') + (d.source ? ' \u00b7 from ' + esc(d.source) : '') + '</div>' + (fl ? '<div><span class="pill bad">' + fl + ' instruction-like sentence' + (fl === 1 ? '' : 's') + ' flagged</span></div>' : '') + '<div class="row"><button type="button" data-act="open-doc" data-doc="' + esc(d.id) + '">Read</button>' + (isAdmin() ? '<button type="button" class="danger" data-act="del-doc" data-doc="' + esc(d.id) + '">Remove</button>' : '') + '</div></div>'; }).join('') + '</div>' : '<div class="empty">No handbook documents. The assistant will hand every question to a person until you upload one or restore the demo.</div>');
  }
  function highlightFlags(sec) { let html = esc(sec.text); for (const f of sec.flagged) html = html.split(esc(f.sentence)).join('<mark class="flag" title="Flagged: ' + esc(f.rules.join(', ')) + '">' + esc(f.sentence) + '</mark>'); return html; }
  const secDomId = (id) => 'sec-' + id.replace(/[^a-z0-9-]/g, '_');
  function openDoc(docId, secId) {
    const secs = kb.sections.filter((s) => s.docId === docId); const d = state.docs.find((x) => x.id === docId);
    openModal(d ? d.title : 'Section', (secs.some((s) => s.flagged.length) ? '<div class="note bad" style="margin:0 0 10px">Highlighted sentences look like instructions aimed at AI assistants. The assistant treats them as data and never repeats or follows them.</div>' : '') + secs.map((s) => '<div class="sec' + (s.id === secId ? ' hl' : '') + '" id="' + esc(secDomId(s.id)) + '"><h4>' + esc(s.title) + ' <span class="small muted mono">' + esc(s.id) + '</span></h4><div class="body">' + highlightFlags(s) + '</div></div>').join(''), { wide: true, name: 'doc', onmount: () => { if (secId) { const el = document.getElementById(secDomId(secId)); if (el) el.scrollIntoView({ block: 'center' }); } } });
  }
  function uploadModal() {
    openModal('Upload your handbook', '<p class="small muted" style="margin-top:0">Markdown, text, PDF or Word (.docx), up to 5 MB each. Files are read in this browser and never uploaded. Headings become citable sections.</p><div class="field"><label for="up-files">Files</label><input id="up-files" type="file" multiple accept=".md,.markdown,.txt,.pdf,.docx,text/plain,text/markdown,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"></div><div class="field"><label for="up-paste">Or paste text</label><textarea id="up-paste" rows="6" placeholder="# Remote work policy&#10;&#10;## Equipment&#10;..."></textarea></div><div class="field"><label for="up-title">Title for pasted text</label><input id="up-title" maxlength="80" placeholder="Pasted policy"></div><fieldset class="q"><legend>What to do with the current handbook</legend><label><input type="radio" name="up-mode" value="replace" checked> <span>Replace it with my documents</span></label><label><input type="radio" name="up-mode" value="add"> <span>Add my documents alongside it</span></label></fieldset><div class="err" id="up-err" hidden></div><div id="up-status" class="small"></div>', { dirty: true, saveLabel: 'Import', name: 'upload', save: async () => {
      const err = $('#up-err'); err.hidden = true; const files = Array.from($('#up-files').files || []); const paste = $('#up-paste').value.trim();
      if (!files.length && !paste) { err.hidden = false; err.textContent = 'Choose a file or paste some text first.'; return; }
      const m0 = modal; $('#modal-save').disabled = true; $('#up-status').textContent = 'Reading\u2026';
      const out = []; const fails = [];
      for (const f of files) { try { out.push(await DOCS.parseFile({ name: f.name, size: f.size, bytes: new Uint8Array(await f.arrayBuffer()) })); } catch (e) { fails.push(e.message); } }
      if (paste) { const title = $('#up-title').value.trim() || 'Pasted policy'; out.push({ id: KB.slug(title), title, owner: 'HR', updated: today(), text: DOCS.txtToMd(paste, title), source: 'pasted text', uploaded: true }); }
      if (!modal || modal !== m0) return;
      $('#modal-save').disabled = false;
      if (!out.length) { err.hidden = false; err.textContent = fails.join(' ') || 'Nothing could be read.'; $('#up-status').textContent = ''; return; }
      const replace = $('input[name="up-mode"]:checked').value === 'replace'; const undo = snapshot('Import');
      const docs = DOCS.uniqueIds(out, replace ? [] : state.docs);
      state.docs = replace ? docs : state.docs.concat(docs); state.usingDemoDocs = false; rebuildKb(); persist();
      const secs = docs.reduce((a, d) => a + KB.sectionsOf(d).length, 0); const fl = docs.reduce((a, d) => a + KB.sectionsOf(d).reduce((b, s) => b + s.flagged.length, 0), 0);
      modal.dirty = false; closeModal(true, 'saved'); renderAll(); toast('Imported ' + docs.length + ' doc' + (docs.length === 1 ? '' : 's') + ', ' + secs + ' sections' + (fl ? ', ' + fl + ' flagged sentence' + (fl === 1 ? '' : 's') : '') + (fails.length ? '. Skipped: ' + fails.join(' ') : '.'), undo);
    } });
  }

  /* ---------------- templates ---------------- */
  function renderTemplates() {
    return '<div class="toolbar"><div class="grow small muted">Templates decide which tasks a new plan gets. \u201cEveryone\u201d applies to all roles; tasks marked remote or office apply only there. Day 0 is the start date; weekend dates move to the nearest weekday.</div>' + (isAdmin() ? '<button type="button" data-act="reset-tpl">Reset to defaults</button>' : '<span class="small muted">Switch to HR admin to edit.</span>') + '</div><div class="cards">' + Object.entries(state.templates).map(([id, t]) => '<div class="card" data-tpl="' + esc(id) + '"><h3>' + esc(t.label) + '</h3><div class="small muted">' + t.tasks.length + ' tasks \u00b7 ' + P.PHASES.map((p) => { const n = t.tasks.filter((x) => x.phase === p.id).length; return n ? n + ' ' + p.label.toLowerCase() : ''; }).filter(Boolean).join(', ') + '</div><div class="row"><button type="button" data-act="edit-tpl" data-tpl="' + esc(id) + '">' + (isAdmin() ? 'Edit' : 'View') + '</button></div></div>').join('') + '</div>';
  }
  function tplRow(x) {
    const dis = isAdmin() ? '' : ' disabled';
    return '<div class="trow" data-ref="' + esc(x.ref || '') + '" data-quiz="' + esc(x.quiz || '') + '"><input aria-label="Task title" class="t-title" maxlength="160" value="' + esc(x.title) + '"' + dis + '><select aria-label="Phase" class="t-phase"' + dis + '>' + opts(Object.fromEntries(P.PHASES.map((p) => [p.id, p.label])), x.phase) + '</select><select aria-label="Owner" class="t-owner"' + dis + '>' + opts(P.OWNERS, x.owner) + '</select><input aria-label="Day" class="t-day" type="number" min="-14" max="120" value="' + esc(x.day) + '"' + dis + '><select aria-label="Applies to" class="t-where"' + dis + '>' + opts({ any: 'Everyone', remote: 'Remote only', office: 'Office only' }, x.where || 'any') + '</select>' + (isAdmin() ? '<button type="button" class="small-btn danger" data-tdel aria-label="Remove task">\u00d7</button>' : '<span></span>') + '</div>';
  }
  function editTemplate(id) {
    const tpl = state.templates[id];
    openModal((isAdmin() ? 'Edit template: ' : 'Template: ') + tpl.label, '<div class="field"><label for="tpl-label">Template name</label><input id="tpl-label" maxlength="60" value="' + esc(tpl.label) + '"' + (isAdmin() ? '' : ' disabled') + '></div><div class="trow head"><span>Task</span><span>Phase</span><span>Owner</span><span>Day</span><span>Applies to</span><span></span></div><div id="tpl-rows">' + tpl.tasks.map(tplRow).join('') + '</div>' + (isAdmin() ? '<button type="button" id="tpl-add">+ Add task</button>' : '') + '<div class="err" id="tpl-err" hidden></div>', { wide: true, dirty: true, name: 'template', save: isAdmin() ? () => {
      const rows = $$('#tpl-rows .trow').map((r) => ({ title: $('.t-title', r).value, phase: $('.t-phase', r).value, owner: $('.t-owner', r).value, day: $('.t-day', r).value === '' ? NaN : Number($('.t-day', r).value), where: $('.t-where', r).value, ref: r.dataset.ref, quiz: r.dataset.quiz }));
      const v = P.validateTemplate({ label: $('#tpl-label').value, tasks: rows });
      if (!v.ok) { const e = $('#tpl-err'); e.hidden = false; e.textContent = v.errors.slice(0, 3).join(' '); return; }
      const undo = snapshot('Template edit'); state.templates[id] = v.template;
      for (const h of state.hires) if (h.role === id) h.roleLabel = v.template.label;
      persist(); modal.dirty = false; closeModal(true, 'saved'); renderAll(); toast('Template saved. New plans use it; \u201cRebuild from template\u201d updates an existing plan.', undo);
    } : null, onmount: () => {
      const add = $('#tpl-add'); if (add) add.onclick = () => { $('#tpl-rows').insertAdjacentHTML('beforeend', tplRow({ title: '', phase: 'week1', owner: 'hire', day: 3, where: 'any' })); modal.dirty = true; const ins = $$('#tpl-rows .t-title'); ins[ins.length - 1].focus(); };
      $('#tpl-rows').addEventListener('click', (e) => { const b = e.target.closest('[data-tdel]'); if (b) { b.closest('.trow').remove(); modal.dirty = true; } });
    } });
  }

  /* ---------------- hires ---------------- */
  function hireForm(h) {
    const roles = Object.entries(state.templates).filter(([k]) => k !== 'common'); const tz = (h && h.timezone) || 'America/Chicago';
    const tzs = SEED.TIMEZONES.includes(tz) ? SEED.TIMEZONES : SEED.TIMEZONES.concat([tz]);
    return '<div class="row2"><div class="field"><label for="hf-name">Full name <span class="muted">(required)</span></label><input id="hf-name" maxlength="80" value="' + esc(h ? h.name : '') + '" autocomplete="off"></div><div class="field"><label for="hf-role">Role</label><select id="hf-role"' + (h ? ' disabled' : '') + '>' + roles.map(([k, t]) => '<option value="' + esc(k) + '"' + (h && h.role === k ? ' selected' : '') + '>' + esc(t.label) + '</option>').join('') + '</select>' + (h ? '<div class="help">To change role, add the hire again.</div>' : '') + '</div></div>' +
      '<div class="row2"><div class="field"><label for="hf-team">Team <span class="muted">(required)</span></label><input id="hf-team" maxlength="60" value="' + esc(h ? h.team : '') + '"></div><div class="field"><label for="hf-start">Start date <span class="muted">(required)</span></label><input id="hf-start" type="date" value="' + esc(h ? h.startDate : P.nextMonday(today())) + '"></div></div>' +
      '<div class="row2"><div class="field"><span class="lbl">Work setup</span><label class="check"><input type="checkbox" id="hf-remote"' + (!h || h.remote ? ' checked' : '') + '> <span>Remote</span></label></div><div class="field"><label for="hf-loc">Location</label><input id="hf-loc" maxlength="60" value="' + esc(h ? h.location : 'Remote (US Central)') + '"></div></div>' +
      '<div class="field"><label for="hf-tz">Time zone</label><select id="hf-tz">' + tzs.map((z) => '<option' + (tz === z ? ' selected' : '') + '>' + esc(z) + '</option>').join('') + '</select></div>' +
      '<div class="row2"><div class="field"><label for="hf-mgr">Manager <span class="muted">(required)</span></label><input id="hf-mgr" maxlength="80" value="' + esc(h ? h.manager : '') + '"></div><div class="field"><label for="hf-buddy">Buddy <span class="muted">(required)</span></label><input id="hf-buddy" maxlength="80" value="' + esc(h ? h.buddy : '') + '"></div></div>' +
      '<p class="small muted">Work details only. Personal details like home address, bank details and ID numbers belong in the official HR portal, not here.</p><div class="err" id="hf-err" hidden></div>';
  }
  function hireModal(edit) {
    const h = edit ? hire() : null;
    openModal(h ? 'Edit ' + h.name : 'Add a new hire', hireForm(h), { dirty: true, focusFirst: true, name: 'hire', saveLabel: h ? 'Save' : 'Create plan', save: () => {
      const f = { name: $('#hf-name').value.trim(), role: $('#hf-role').value, team: $('#hf-team').value.trim(), startDate: $('#hf-start').value, remote: $('#hf-remote').checked, location: $('#hf-loc').value.trim(), timezone: $('#hf-tz').value, manager: $('#hf-mgr').value.trim(), buddy: $('#hf-buddy').value.trim() };
      const miss = [['name', 'full name'], ['team', 'team'], ['manager', 'manager'], ['buddy', 'buddy']].filter(([k]) => !f[k]).map(([, l]) => l);
      const err = miss.length ? 'Add the ' + miss.join(', ') + '.' : !P.isDate(f.startDate) ? 'Pick a valid start date.' : A.checkText([f.name, f.team, f.location, f.manager, f.buddy].join(' '));
      if (err) { const e = $('#hf-err'); e.hidden = false; e.textContent = err; return; }
      if (h) {
        const undo = snapshot('Profile edit'); const hh = hire(); const moved = hh.startDate !== f.startDate || hh.remote !== f.remote;
        Object.assign(hh, { name: f.name, email: PE.emailOf(f.name), team: f.team, startDate: f.startDate, remote: f.remote, location: f.location || (f.remote ? 'Remote' : 'Office'), timezone: f.timezone, manager: f.manager, managerEmail: PE.emailOf(f.manager), buddy: f.buddy, buddyEmail: PE.emailOf(f.buddy) });
        if (moved) { const done = new Set(hh.tasks.filter((x) => x.done).map((x) => x.title)); hh.tasks = P.generate(hh, state.templates); hh.tasks.forEach((x) => { if (done.has(x.title)) { x.done = true; x.doneAt = new Date().toISOString(); } }); }
        persist(); modal.dirty = false; closeModal(true, 'saved'); renderAll(); toast('Profile saved' + (moved ? '; due dates recalculated.' : '.'), undo);
      } else {
        const undo = snapshot('New hire'); const nh = SEED.makeHire(f, state.templates); state.hires.push(nh); state.current = nh.id; settings.tab = 'plan'; saveSettings();
        persist(); modal.dirty = false; closeModal(true, 'saved'); renderAll(); toast('Created a ' + nh.tasks.length + '-task plan and ' + nh.access.length + ' access requests for ' + nh.name + '.', undo);
      }
    } });
  }
  function deleteHire() { const h = hire(); if (!h) return; const undo = snapshot('Remove'); state.hires = state.hires.filter((x) => x.id !== h.id); state.current = state.hires[0] ? state.hires[0].id : null; quizDraft = null; persist(); renderAll(); toast('Removed ' + h.name + ' and their plan.', undo); }

  /* ---------------- settings ---------------- */
  function settingsModal() {
    const pv = settings.provider;
    const body = '<fieldset class="q"><legend>Mode</legend><label><input type="radio" name="s-mode" value="demo"' + (settings.mode === 'demo' ? ' checked' : '') + '> <span><b>Demo</b>: retrieval engine in the page, no key, nothing sent anywhere.</span></label><label><input type="radio" name="s-mode" value="live"' + (settings.mode === 'live' ? ' checked' : '') + '> <span><b>Live</b>: your own AI provider answers chat questions, still grounded in and checked against the handbook.</span></label></fieldset>' +
      '<div class="field"><label for="s-prov">Provider</label><select id="s-prov">' + Object.entries(PROVIDERS).map(([k, p]) => '<option value="' + k + '"' + (k === pv ? ' selected' : '') + '>' + esc(p.label) + '</option>').join('') + '</select></div>' +
      '<div class="field"><label for="s-model">Model</label><input id="s-model" list="s-models" value="' + esc(modelFor()) + '"><datalist id="s-models"></datalist></div>' +
      '<div class="field" id="s-key-wrap"><label for="s-key">API key</label><input id="s-key" type="password" autocomplete="off" spellcheck="false" value="' + esc(keys[pv] || '') + '"><div class="help" id="s-key-help"></div></div>' +
      '<div class="field" id="s-base-wrap"><label for="s-base">Base URL</label><input id="s-base" value="' + esc(settings.baseUrl || LLM.PROVIDERS.compatible.baseUrl) + '"><div class="chips">' + LLM.PRESETS.map((p) => '<button type="button" class="chip" data-preset="' + p.id + '">' + esc(p.label) + '</button>').join('') + '</div><div class="help">Local servers must allow this site (CORS); for Ollama set OLLAMA_ORIGINS. Your browser may ask to allow local network access.</div></div>' +
      '<label class="check"><input type="checkbox" id="s-remember"' + (settings.remember ? ' checked' : '') + '> <span>Remember my key in this browser (localStorage). Off: the key is kept only until you close or reload the tab.</span></label>' +
      '<p class="small muted">Your key goes only from this page to the provider you pick. It is never put in exports, backups or links. Live mode sends your question and the matching handbook sections; personal data is removed first.</p><div class="row"><button type="button" class="danger" id="s-forget">Forget all keys</button></div><div class="err" id="s-err" hidden></div>';
    openModal('Settings', body, { dirty: true, name: 'settings', save: () => {
      const mode = $('input[name="s-mode"]:checked').value; const prov = $('#s-prov').value; const key = $('#s-key').value.trim(); const p = PROVIDERS[prov];
      if (mode === 'live' && p.needsKey && !key) { const e = $('#s-err'); e.hidden = false; e.textContent = 'Live mode with ' + p.label + ' needs a key. Or choose Demo, OpenAI-compatible (local) or WebLLM.'; return; }
      if (mode === 'live' && prov === 'webllm' && !WEBLLM.available()) { const e = $('#s-err'); e.hidden = false; e.textContent = 'WebGPU is not available in this browser, so WebLLM cannot run here.'; return; }
      settings.mode = mode; settings.provider = prov; settings.models[prov] = $('#s-model').value.trim() || p.defaultModel; settings.remember = $('#s-remember').checked;
      if (prov === 'compatible') settings.baseUrl = $('#s-base').value.trim();
      if (LLM.PROVIDERS[prov]) { if (key) keys[prov] = key; else delete keys[prov]; }
      saveSettings(); modal.dirty = false; closeModal(true, 'saved'); renderAll(); toast(mode === 'live' ? 'Live mode on with ' + p.label + '.' : 'Demo mode on.');
    }, onmount: () => {
      const sync = () => { const k = $('#s-prov').value; const p = PROVIDERS[k]; $('#s-key-wrap').hidden = !LLM.PROVIDERS[k]; $('#s-base-wrap').hidden = k !== 'compatible'; $('#s-models').innerHTML = p.models.map((m) => '<option value="' + esc(m) + '">').join(''); $('#s-key-help').innerHTML = LLM.PROVIDERS[k] ? (p.needsKey ? 'Starts with ' + esc(p.keyHint) + '. Get one at <a href="' + esc(p.keyUrl) + '" target="_blank" rel="noopener">' + esc(new URL(p.keyUrl).host) + '</a>.' : 'Optional for local servers; needed for OpenRouter.') : ''; };
      $('#s-prov').addEventListener('change', () => { const k = $('#s-prov').value; $('#s-model').value = settings.models[k] || PROVIDERS[k].defaultModel; $('#s-key').value = keys[k] || ''; sync(); });
      $$('[data-preset]').forEach((b) => (b.onclick = () => { const p = LLM.PRESETS.find((x) => x.id === b.dataset.preset); $('#s-base').value = p.baseUrl; $('#s-model').value = p.model; modal.dirty = true; }));
      $('#s-forget').onclick = () => { keys = {}; ls.del(LS.keys); $('#s-key').value = ''; if (settings.mode === 'live' && PROVIDERS[settings.provider].needsKey) settings.mode = 'demo'; saveSettings(); renderContext(); toast('Keys forgotten.'); };
      sync();
    } });
  }
  /* ---------------- export / import / reset ---------------- */
  function exportModal() {
    const h = hire();
    openModal('Export and backup', '<p class="small muted" style="margin-top:0">Exports never include settings or API keys.</p><div class="cards">' +
      '<div class="card"><h3>This plan</h3><div class="small muted">' + esc(h ? h.name : 'No hire selected') + '</div><div class="row"><button type="button" data-ex="md"' + (h ? '' : ' disabled') + '>Markdown</button><button type="button" data-ex="tasks-ics"' + (h ? '' : ' disabled') + '>Due dates (.ics)</button><button type="button" data-ex="meet-ics"' + (h ? '' : ' disabled') + '>Meetings (.ics)</button></div></div>' +
      '<div class="card"><h3>All hires</h3><div class="small muted">Every task with owner, due date and status.</div><div class="row"><button type="button" data-ex="csv">Tasks (CSV)</button></div></div>' +
      '<div class="card"><h3>Backup</h3><div class="small muted">Hires, handbook and templates as JSON. Restore it here or in another browser.</div><div class="row"><button type="button" data-ex="json">Download backup</button><label class="button" for="imp-file" tabindex="0" id="imp-label">Restore\u2026</label><input id="imp-file" type="file" accept=".json,application/json" class="sr-only"></div></div>' +
      '<div class="card"><h3>Start over</h3><div class="small muted">Reset everything to the demo data. You can undo right after.</div><div class="row"><button type="button" class="danger" data-ex="reset">Reset all data</button></div></div></div>', { wide: true, name: 'export', onmount: () => {
      $$('[data-ex]').forEach((b) => (b.onclick = () => doExport(b.dataset.ex)));
      $('#imp-label').onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('#imp-file').click(); } };
      $('#imp-file').onchange = async (e) => { const f = e.target.files[0]; if (!f) return; try { const d = X.parseBackup(await f.text()); const undo = snapshot('Restore'); state = Object.assign(fresh(), d, { current: d.hires[0] ? d.hires[0].id : null }); state.hires.forEach((x) => { x.chat = x.chat || []; x.quiz = x.quiz || {}; x.access = x.access || []; }); if (!d.templates) state.templates = clone(P.DEFAULT_TEMPLATES); if (!Array.isArray(d.docs)) { state.docs = clone(HB.DOCS); state.usingDemoDocs = true; } rebuildKb(); quizDraft = null; persist(); closeModal(true); renderAll(); toast('Restored ' + d.hires.length + ' hire' + (d.hires.length === 1 ? '' : 's') + ' from backup.', undo); } catch (er) { toast(er.message); } };
    } });
  }
  function doExport(kind) {
    const h = hire(); const t = today();
    if (kind === 'md') download('onboarding-plan-' + fileSlug(h.name) + '.md', X.planMarkdown(h, kb, t), 'text/markdown');
    if (kind === 'csv') download('onboarding-tasks-' + t + '.csv', X.tasksCsv(state.hires, t), 'text/csv');
    if (kind === 'json') download('onboardpilot-backup-' + t + '.json', X.backupJson(state), 'application/json');
    if (kind === 'tasks-ics') download('onboarding-due-dates-' + fileSlug(h.name) + '.ics', PE.ics(PE.taskEvents(h, h.tasks)), 'text/calendar');
    if (kind === 'meet-ics') download('onboarding-meetings-' + fileSlug(h.name) + '.ics', icsFor(h), 'text/calendar');
    if (kind === 'reset') { const undo = snapshot('Reset'); state = fresh(); rebuildKb(); quizDraft = null; persist(); closeModal(true); renderAll(); toast('Reset to the demo data.', undo); return; }
    toast('Downloaded.');
  }
  function helpModal() {
    openModal('How OnboardPilot works', '<h3 style="margin-top:0">What it does</h3><ul><li><b>Plan</b>: a 90-day checklist built from role templates, remote or office, and the start date. Weekend due dates move to the nearest weekday. Overdue items get drafted nudges.</li><li><b>Ask</b>: answers come only from the handbook, with numbered citations to the exact section. If the handbook doesn\u2019t cover it, the assistant says so and drafts a question to HR, IT or the manager.</li><li><b>Access</b>: the agent proposes accounts and equipment for the role. Only the manager or an HR admin can approve, and only approved requests can be provisioned.</li><li><b>Learn</b>: short knowledge checks; passing completes the plan task.</li><li><b>People</b>: suggested intro meetings as .ics files, plus welcome, buddy and team drafts.</li><li><b>Handbook</b> and <b>Templates</b>: HR admins can upload their own handbook (MD, TXT, PDF, DOCX) and edit plan templates.</li></ul><h3>What is simulated</h3><ul><li>Lumenfield Labs, its people and policies are fictional; all addresses are on <code>.example</code> domains.</li><li>Provisioning writes an audit entry and a made-up reference. No real account, laptop order or ticket is created.</li><li>Messages, nudges and invites are drafts. Nothing is emailed or posted; .ics files use METHOD:PUBLISH so imports don\u2019t notify anyone.</li><li>\u201cViewing as\u201d is a role switch for the demo, not real sign-in or permissions.</li></ul><h3>Safety</h3><ul><li>Bank details, tax forms, ID numbers and passwords are never asked for or stored. If typed into chat they\u2019re removed before saving, and the hire is pointed to the official HR portal.</li><li>Instruction-like text inside documents is flagged and ignored. In live mode the model sees sections fenced as untrusted data, and replies without valid citations, or with contact details the sources don\u2019t contain, are withheld.</li><li>Your API key stays in this browser and is never included in exports or backups.</li></ul>', { wide: true, name: 'help' });
  }

  /* ---------------- events ---------------- */
  function bind() {
    $('#nav-theme').onclick = () => { const d = document.documentElement.classList.toggle('dark'); ls.set(LS.theme, d ? 'dark' : 'light'); };
    $('#nav-settings').onclick = settingsModal; $('#nav-export').onclick = exportModal; $('#nav-help').onclick = helpModal;
    $('#add-hire').onclick = () => hireModal(false); $('#edit-hire').onclick = () => hireModal(true); $('#delete-hire').onclick = deleteHire;
    $('#hire-select').onchange = (e) => { state.current = e.target.value; quizDraft = null; persist(); renderAll(); };
    $('#viewer').onchange = (e) => { settings.viewer = e.target.value; saveSettings(); renderAll(); };
    $('#tabs').addEventListener('click', (e) => { const b = e.target.closest('[data-tab]'); if (!b) return; settings.tab = b.dataset.tab; saveSettings(); renderTabs(); renderPanel(); });
    $('#tabs').addEventListener('keydown', (e) => { if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return; const bs = $$('#tabs [data-tab]'); const i = bs.indexOf(document.activeElement); if (i < 0) return; const n = bs[(i + (e.key === 'ArrowRight' ? 1 : bs.length - 1)) % bs.length]; n.focus(); n.click(); });
    const panel = $('#panel');
    panel.addEventListener('change', (e) => {
      if (e.target.id === 'plan-filter') { settings.planFilter = e.target.value; saveSettings(); renderPanel(); }
      if (e.target.dataset.act === 'toggle') toggleTask(e.target.closest('.task').dataset.id, e.target.checked);
      if (quizDraft && e.target.name && /^q\d+$/.test(e.target.name)) quizDraft.answers[Number(e.target.name.slice(1))] = Number(e.target.value);
    });
    panel.addEventListener('submit', (e) => { e.preventDefault(); if (e.target.id === 'ask-form') { const v = $('#ask-input').value; $('#ask-input').value = ''; ask(v); } if (e.target.id === 'quiz-form') submitQuiz(); });
    panel.addEventListener('keydown', (e) => { if (e.target.id === 'ask-input' && e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('#ask-form').requestSubmit(); } });
    panel.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]'); if (!b || b.dataset.act === 'toggle') return; const act = b.dataset.act; const h = hire();
      const holder = b.closest('[data-id]'); const id = holder ? holder.dataset.id : null;
      if (act === 'add-hire') hireModal(false);
      if (act === 'add-task') editTask(null);
      if (act === 'edit-task') editTask(id);
      if (act === 'del-task') deleteTask(id);
      if (act === 'regen') regenPlan();
      if (act === 'nudges') showNudges([h]);
      if (act === 'nudges-all') showNudges(state.hires);
      if (act === 'open-sec') { const s = kb.byId[b.dataset.sec]; if (s) openDoc(s.docId, s.id); else toast('That section is no longer in the handbook.'); }
      if (act === 'open-doc') openDoc(b.dataset.doc);
      if (act === 'go-quiz') { settings.tab = 'learn'; quizDraft = { id: b.dataset.quiz, hireId: h.id, answers: [], graded: null }; saveSettings(); renderAll(); }
      if (act === 'sample') ask(b.textContent);
      if (act === 'copy') copy(b.dataset.text);
      if (act === 'clear-chat') { const undo = snapshot('Clear chat'); h.chat = []; persist(); renderPanel(); toast('Chat cleared.', undo); }
      if (['approve', 'reject', 'exec', 'del-req', 'approve-all', 'exec-all', 'propose'].includes(act)) accessAct(act, id);
      if (act === 'add-req') addRequest();
      if (act === 'start-quiz') { quizDraft = { id: b.dataset.quiz, hireId: h.id, answers: [], graded: null }; renderPanel(); }
      if (act === 'quit-quiz') { quizDraft = null; renderPanel(); }
      if (act === 'ics-all') download('onboarding-meetings-' + fileSlug(h.name) + '.ics', icsFor(h), 'text/calendar');
      if (act === 'ics-one') download(fileSlug(b.dataset.m) + '-' + fileSlug(h.name) + '.ics', icsFor(h, [b.dataset.m]), 'text/calendar');
      if (act === 'pick-hire') { state.current = b.dataset.hid; settings.tab = 'plan'; quizDraft = null; saveSettings(); persist(); renderAll(); }
      if (act === 'upload') uploadModal();
      if (act === 'restore-docs') { const undo = snapshot('Restore'); state.docs = clone(HB.DOCS); state.usingDemoDocs = true; rebuildKb(); persist(); renderAll(); toast('Demo handbook restored.', undo); }
      if (act === 'del-doc') { const d = state.docs.find((x) => x.id === b.dataset.doc); const undo = snapshot('Remove'); state.docs = state.docs.filter((x) => x.id !== b.dataset.doc); state.usingDemoDocs = false; rebuildKb(); persist(); renderAll(); toast('Removed \u201c' + d.title + '\u201d from the handbook.', undo); }
      if (act === 'edit-tpl') editTemplate(b.dataset.tpl);
      if (act === 'reset-tpl') { const undo = snapshot('Template reset'); state.templates = clone(P.DEFAULT_TEMPLATES); persist(); renderAll(); toast('Templates reset to defaults.', undo); }
    });
  }
  async function init() {
    bind();
    let loaded = null; try { loaded = await ST.load(); } catch (e) { loaded = null; }
    state = loaded && Array.isArray(loaded.hires) ? loaded : fresh();
    if (!state.templates) state.templates = clone(P.DEFAULT_TEMPLATES); if (!Array.isArray(state.docs)) state.docs = clone(HB.DOCS);
    if (!state.hires.find((h) => h.id === state.current)) state.current = state.hires[0] ? state.hires[0].id : null;
    rebuildKb(); if (!loaded) await ST.saveNow(state);
    if (!PROVIDERS[settings.provider]) settings.provider = 'openai';
    if (settings.mode === 'live' && PROVIDERS[settings.provider].needsKey && !keys[settings.provider]) settings.mode = 'demo';
    renderAll();
    if (!ls.get(LS.visited, false)) { ls.set(LS.visited, true); toast('Welcome! This is demo data for a fictional company. Switch \u201cViewing as\u201d to see the manager and HR side.'); }
    document.documentElement.dataset.ready = '1';
  }
  window.OnboardPilotApp = { get state() { return state; }, get modal() { return modal ? modal.name : null; }, get settings() { return settings; }, get kb() { return kb; }, get busy() { return busy; }, get hasKeys() { return Object.keys(keys).length; }, ask, flush: () => ST.flush() };
  init();
})();
