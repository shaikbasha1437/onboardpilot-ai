# OnboardPilot AI

An onboarding agent that runs entirely in your browser. It builds a personalized 90-day plan for each new hire, answers handbook questions with citations (and hands off to a person when the handbook doesn't cover something), proposes account and equipment requests that wait for a manager's approval, runs short knowledge checks, and drafts intro meetings and welcome messages without sending anything.

**Live app:** https://shaikbasha1437.github.io/onboardpilot-ai/

The demo runs on a fictional company, Lumenfield Labs, with four fictional hires at different stages. Every address uses the reserved `.example` domain. No key and no sign-up are needed.

## What it does

| Area | What you get |
| --- | --- |
| **Plan** | Checklists for before day one, the first day, the first week, and days 30, 60 and 90. Each task has an owner (new hire, manager, buddy, IT or the People team) and a due date based on the role, remote or office setup and start date. Weekend dates move to the nearest weekday. Overdue and due-soon items are flagged. |
| **Ask** | A chat grounded in the handbook (benefits, time off, expenses, security, tools, org chart, glossary). Every answer cites the exact section. If the handbook doesn't cover a question, the assistant says so, points to the closest section if there is one, and drafts a question to HR, IT or the manager. |
| **Access** | The agent proposes email, Slack, laptop, password manager, GitHub, VPN, Figma, CRM or helpdesk access from the role. Only the hire's manager or an HR admin can approve, and only approved requests can be provisioned. Provisioning is simulated and every step goes into an audit log. |
| **Learn** | Short multiple-choice checks (security, benefits and time off, tools and expenses). Every question links to its source. Passing with 80% completes the matching plan task. |
| **People** | Suggested meetings (welcome 1:1, buddy coffee, weekly buddy check-ins, team intro, a cross-functional intro and the 30-day check-in) as `.ics` files, plus drafted welcome, team and buddy messages and nudges for overdue items. |
| **Team dashboard** | Every hire's progress, overdue items, open access requests and checks passed, with nudge drafts for everything overdue. |
| **Handbook** | HR admins can upload their own handbook as Markdown, text, PDF or Word (.docx). They can replace the demo or add to it, paste text, remove documents with undo, or restore the demo. |
| **Templates** | HR admins can edit the plan templates per role: tasks, phase, owner, day offset, and whether a task applies to remote or office hires. |
| **Exports** | Plan as Markdown, all tasks as CSV, due dates and meetings as `.ics`, and a JSON backup that you can restore. Exports never include settings or keys. |

"Viewing as" switches between the new hire, the manager and an HR admin, so you can try the approval and admin flows. It's a demo role switch, not sign-in.

## Modes

- **Demo (default, no key).** A BM25 retrieval engine in the page picks the best sections and quotes the matching sentences. To answer, the best section has to cover more than half of the question's weight, where rare words count more. If it doesn't, the assistant abstains. Nothing leaves the page.
- **Live (your key).** Chat questions go to your own provider: OpenAI, Anthropic (sent with the `anthropic-dangerous-direct-browser-access` header), Google Gemini, or any OpenAI-compatible endpoint such as OpenRouter, Ollama or LM Studio. You can also pick an optional in-browser model through WebLLM (needs WebGPU). The model sees only the top handbook sections, fenced as untrusted data, and has to reply in JSON with citations. Replies are checked before they're shown:
  - Citations must point to sections that were actually sent. Anything else is dropped.
  - An answer left with no valid citation is withheld and becomes a hand-off.
  - Email addresses or links that don't appear in the cited, unflagged text get the reply blocked.
  - So does any request to send an SSN, bank details or a password.
  - If the call fails, you see the error and the demo engine's answer.

Your key stays in this browser. It is never put in exports, backups or links. By default it's held in memory only; tick "Remember my key" to keep it in localStorage.

## Safety

- **No sensitive personal data.** Bank details, tax forms, Social Security numbers, card numbers and passwords are never asked for or stored.
  - If someone types them into chat, they're removed before anything is saved or sent, and the person is pointed to the official HR portal.
  - Access requests, tasks and hire profiles refuse them too.
- **Prompt injection.** Instruction-like sentences inside documents are flagged in the Handbook view and never used in answers. The demo's community wiki page has two on purpose: an "ignore all previous instructions" line and a request to email an SSN to a lookalike address.
- **Approval gate.** The provisioning function refuses any request that a manager or HR admin hasn't approved, and the hire can't approve their own requests.
- **Nothing is sent.** Messages, nudges and invites are drafts with a Copy button. `.ics` files use `METHOD:PUBLISH`, so importing one adds an event to your own calendar without emailing attendees.

## What is simulated (honest notes)

- Lumenfield Labs, its people, policies, tools (Vaultline, Ledgerly) and addresses are invented.
- Provisioning creates no real account, laptop order or ticket. It writes a made-up reference and an audit entry.
- The "official HR portal" is a fictional `.example` URL.
- Viewer roles are a UI switch, not authentication.
- There's no server. A Slack or HRIS adapter would need real credentials and a hosted endpoint, which the app doesn't need to show the flow. Plans, chats and approvals live in this browser (IndexedDB, with a localStorage fallback), and the JSON backup moves them between browsers.
- PDF import reads the text layer only (no OCR). DOCX import reads paragraphs, headings and lists, not tables or images.

## Run it yourself

It's a static site with no build step:

```sh
git clone https://github.com/shaikbasha1437/onboardpilot-ai
cd onboardpilot-ai
python3 -m http.server 8080   # then open http://localhost:8080
```

It works offline after the first visit. The service worker is network-first with a versioned cache. To use a local model, run Ollama with `OLLAMA_ORIGINS` set to your site's origin, then pick "OpenAI-compatible" and the Ollama preset in Settings. Chrome and Firefox may ask before a public page can reach localhost.

## Tests

```sh
npm test   # Node's built-in test runner, no dependencies
```

The tests cover:

- Retrieval answers and citations, abstention and routing.
- Injection flagging, PII redaction, and checks on live-mode replies (mocked providers).
- Plan dates, the access approval gate and quiz grading.
- `.ics` output (line folding, escaping, daylight saving).
- DOCX and text import, CSV formula escaping, and keys stripped from backups.
- A hygiene check on every public file.

## Project layout

```
index.html, styles.css, sw.js, manifest.webmanifest
js/handbook.js   demo handbook (fictional)
js/kb.js         sections, BM25 answers, abstention, routing, PII redaction, live prompt + reply checks
js/plan.js       templates, due dates, progress
js/access.js     proposals, approval gate, simulated provisioning
js/quiz.js       knowledge checks
js/people.js     meetings, drafts, nudges, .ics
js/docs.js       MD/TXT/PDF/DOCX import
js/exporter.js   Markdown, CSV, JSON backup
js/llm.js        bring-your-own-key provider client; js/webllm.js optional in-browser model
vendor/pdfjs     pdf.js (Apache-2.0), loaded only when you import a PDF
```

## License

MIT. pdf.js is Apache-2.0 (see `vendor/pdfjs/LICENSE`).
