/* OnboardPilot access requests: the agent proposes accounts and equipment from the hire's role, but
   nothing is provisioned until a manager (or HR admin) who is not the hire approves it. Provisioning is
   simulated: it writes an audit entry and a made-up reference, and never calls a real system.
   Requests never carry passwords, Social Security numbers or bank details. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./kb.js'));
  else (root.OP = root.OP || {}).access = factory(root.OP.kb);
})(typeof self !== 'undefined' ? self : this, function (KB) {
  'use strict';
  const SYSTEMS = {
    email: { label: 'Email and calendar', level: 'Standard mailbox', roles: ['*'], ref: 'tools#email-and-calendar' },
    slack: { label: 'Slack', level: 'Member', roles: ['*'], ref: 'tools#slack' },
    laptop: { label: 'Laptop', level: 'Standard build', roles: ['*'], ref: 'tools#your-laptop' },
    vaultline: { label: 'Vaultline password manager', level: 'Personal vault', roles: ['*'], ref: 'security#passwords-and-password-manager' },
    github: { label: 'GitHub (lumenfield-labs org)', level: 'Member, SSO + MFA', roles: ['engineer', 'designer'], ref: 'tools#github' },
    vpn: { label: 'VPN', level: 'Staging and dashboards', roles: ['engineer', 'support'], ref: 'tools#vpn' },
    figma: { label: 'Figma', level: 'Editor', roles: ['designer'] },
    crm: { label: 'CRM', level: 'Sales seat', roles: ['sales'] },
    helpdesk: { label: 'Helpdesk console', level: 'Agent', roles: ['support'] },
    ledgerly: { label: 'Ledgerly expenses', level: 'Submitter', roles: ['*'], ref: 'expenses#submitting-expenses' }
  };
  const REASONS = { email: 'Needed from day one for mail, calendar and single sign-on.', slack: 'Team chat, #welcome and #help-it.', laptop: 'Primary work device.', vaultline: 'Required by the security policy for every work password.', github: 'Repository access for the role.', vpn: 'Staging systems and internal dashboards.', figma: 'Design work and handoff.', crm: 'Pipeline and account management.', helpdesk: 'Working the support queue.', ledgerly: 'Submitting expenses and stipends.' };
  let seq = 0; const rid = () => 'acc-' + Date.now().toString(36) + '-' + (++seq).toString(36);
  function propose(hire, existing) {
    const have = new Set((existing || []).filter((r) => r.status !== 'rejected').map((r) => r.system));
    return Object.keys(SYSTEMS).filter((k) => !have.has(k) && (SYSTEMS[k].roles.includes('*') || SYSTEMS[k].roles.includes(hire.role)))
      .map((k) => ({ id: rid(), system: k, label: SYSTEMS[k].label, level: SYSTEMS[k].level + (k === 'laptop' ? (hire.remote ? ', courier to home address on file in the People portal' : ', pickup at the IT bar') : ''), reason: REASONS[k], ref: SYSTEMS[k].ref || '', status: 'proposed', proposedBy: 'agent', log: [{ at: new Date().toISOString(), by: 'OnboardPilot', what: 'Proposed from the ' + hire.roleLabel + ' template' }] }));
  }
  /* Text fields on a request may not contain sensitive data. Returns an error string or ''. */
  function checkText(s) {
    const r = KB.redactPII(s); if (r.found.length) return 'Remove the ' + r.found.join(', ') + ': access requests never carry passwords, Social Security numbers or bank details. Personal details go in the official HR portal.';
    if (/\b(password|passcode|ssn|social security|routing number|bank account)\b/i.test(String(s || ''))) return 'Access requests don\u2019t take passwords or personal financial details. Use the official HR portal for personal details; IT sets passwords through single sign-on.';
    return '';
  }
  function canApprove(viewer, hire) { return (viewer.role === 'manager' || viewer.role === 'admin') && viewer.name !== hire.name; }
  function approve(req, viewer, hire) {
    if (!canApprove(viewer, hire)) throw new Error('Only the hire\u2019s manager or an HR admin can approve access.');
    if (req.status !== 'proposed') throw new Error('Only proposed requests can be approved.');
    req.status = 'approved'; req.approvedBy = viewer.name; req.approvedAt = new Date().toISOString(); req.log.push({ at: req.approvedAt, by: viewer.name, what: 'Approved' }); return req;
  }
  function reject(req, viewer, hire, why) {
    if (!canApprove(viewer, hire)) throw new Error('Only the hire\u2019s manager or an HR admin can reject access.');
    if (req.status !== 'proposed' && req.status !== 'approved') throw new Error('This request can no longer be rejected.');
    req.status = 'rejected'; req.log.push({ at: new Date().toISOString(), by: viewer.name, what: 'Rejected' + (why ? ': ' + why : '') }); return req;
  }
  /* Simulated provisioning: refuses anything not approved. */
  function execute(req, hire) {
    if (req.status !== 'approved' || !req.approvedBy) throw new Error('Blocked: "' + req.label + '" has not been approved by a manager.');
    const ref = (req.system === 'laptop' ? 'SHIP-' : 'PRV-') + Math.abs(hash(hire.id + req.system)).toString(36).toUpperCase().slice(0, 6);
    const user = hire.email || '';
    const result = req.system === 'laptop' ? 'Laptop order ' + ref + ' created (simulated).' : req.label + ' account for ' + user + ' created (simulated, ref ' + ref + ').';
    req.status = 'done'; req.result = result; req.doneAt = new Date().toISOString(); req.log.push({ at: req.doneAt, by: 'OnboardPilot (simulated)', what: result }); return req;
  }
  function hash(s) { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) | 0; return h; }
  function addCustom(hire, system, level, reason) {
    const err = checkText(system + ' ' + level + ' ' + reason); if (err) throw new Error(err);
    if (!String(system || '').trim()) throw new Error('Name the system or equipment.');
    return { id: rid(), system: 'custom-' + KB.slug(system), label: String(system).trim(), level: String(level || '').trim() || 'Standard', reason: String(reason || '').trim(), ref: '', status: 'proposed', proposedBy: 'manual', log: [{ at: new Date().toISOString(), by: hire.name, what: 'Requested manually' }] };
  }
  return { SYSTEMS, propose, checkText, canApprove, approve, reject, execute, addCustom };
});
