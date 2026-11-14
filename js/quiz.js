/* OnboardPilot knowledge checks: short multiple-choice modules, each question tied to the handbook
   section that answers it. Grading is pure; passing (80%) completes the linked plan task. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else (root.OP = root.OP || {}).quiz = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const PASS = 0.8;
  const MODULES = {
    security: { title: 'Security essentials', ref: 'security#security-training', questions: [
      { q: 'Someone on Slack says they are from IT and asks for your password to fix your account. What do you do?', options: ['Send it, IT needs it', 'Send it only by direct message', 'Don\u2019t share it and report the request', 'Change it first, then send it'], answer: 2, ref: 'security#passwords-and-password-manager' },
      { q: 'Which second factor is NOT accepted for MFA?', options: ['Hardware security key', 'Authenticator app', 'SMS codes'], answer: 2, ref: 'security#multi-factor-authentication' },
      { q: 'Your laptop is stolen. How soon must you report it to security?', options: ['Within one hour', 'By the end of the week', 'At your next 1:1'], answer: 0, ref: 'security#reporting-phishing' },
      { q: 'How is customer data classified?', options: ['Internal', 'Confidential', 'Restricted', 'Public'], answer: 2, ref: 'security#data-classification' },
      { q: 'Where should every work password live?', options: ['A notes app', 'Vaultline, the company password manager', 'Your browser profile'], answer: 1, ref: 'security#passwords-and-password-manager' }
    ] },
    benefits: { title: 'Benefits and time off', ref: 'benefits#health-insurance', questions: [
      { q: 'How long do you have to enroll in health benefits?', options: ['7 days', '30 days from your start date', '90 days'], answer: 1, ref: 'benefits#health-insurance' },
      { q: 'How many PTO days do full-time employees earn per year?', options: ['15', '20', 'Unlimited'], answer: 1, ref: 'time-off#paid-time-off' },
      { q: 'How many unused PTO days carry over into the next year?', options: ['None', 'Up to 5', 'All of them'], answer: 1, ref: 'time-off#paid-time-off' },
      { q: 'Where do you enter bank details for direct deposit?', options: ['Reply to an email from payroll', 'Post them in #help-it', 'Only in the People portal'], answer: 2, ref: 'benefits#updating-personal-and-payroll-details' },
      { q: 'Up to what share of base salary does Lumenfield match 401(k) contributions?', options: ['2%', '4%', '6%'], answer: 1, ref: 'benefits#retirement-plan' }
    ] },
    tools: { title: 'Tools and expenses', ref: 'tools#requesting-access', questions: [
      { q: 'Who approves access to tools like GitHub and the VPN?', options: ['Your manager', 'Your buddy', 'Nobody, it is automatic'], answer: 0, ref: 'tools#requesting-access' },
      { q: 'Within how many days must expenses be submitted?', options: ['7', '30', '90'], answer: 1, ref: 'expenses#submitting-expenses' },
      { q: 'Receipts are required for purchases over...', options: ['$10', '$25', '$100'], answer: 1, ref: 'expenses#submitting-expenses' },
      { q: 'The home office stipend for remote employees is...', options: ['$250', '$500, claimed within 60 days', '$1,000 per year'], answer: 1, ref: 'expenses#home-office-stipend' },
      { q: 'Where do you ask IT questions?', options: ['#help-it or it-help@lumenfield.example', '#random', 'Your manager only'], answer: 0, ref: 'tools#slack' }
    ] }
  };
  /* answers: array of chosen option indexes (null = unanswered). */
  function grade(moduleId, answers) {
    const m = MODULES[moduleId]; if (!m) throw new Error('Unknown module ' + moduleId);
    const results = m.questions.map((q, i) => ({ i, correct: answers[i] === q.answer, chosen: answers[i] == null ? null : answers[i], answer: q.answer, ref: q.ref }));
    const score = results.filter((r) => r.correct).length; const total = m.questions.length;
    return { moduleId, score, total, pct: Math.round((score / total) * 100), passed: score / total >= PASS, results, unanswered: results.filter((r) => r.chosen == null).length };
  }
  return { PASS, MODULES, grade };
});
