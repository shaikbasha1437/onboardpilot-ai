/* OnboardPilot AI service worker: network-first with a versioned per-file cache, so updates show up on the
   next online load and the app still opens (and the demo still runs) offline. */
const VERSION = 'onboardpilot-v1';
const FILES = ['./', './index.html', './styles.css', './manifest.webmanifest', './icons/icon.svg', './icons/icon-192.png', './icons/icon-512.png', './js/access.js', './js/app.js', './js/docs.js', './js/exporter.js', './js/guard.js', './js/handbook.js', './js/kb.js', './js/llm.js', './js/people.js', './js/plan.js', './js/quiz.js', './js/seed.js', './js/store.js', './js/text.js', './js/webllm.js'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(VERSION).then((c) => Promise.all(FILES.map((f) => c.add(new Request(f, { cache: 'reload' })).catch(() => null)))).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith('onboardpilot-') && k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const req = e.request; if (req.method !== 'GET') return;
  const url = new URL(req.url); if (url.origin !== location.origin) return;
  const key = url.origin + url.pathname;
  e.respondWith(fetch(req).then((res) => { if (res && res.ok && res.type === 'basic') { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(key, copy)); } return res; })
    .catch(() => caches.open(VERSION).then((c) => c.match(key).then((m) => m || (req.mode === 'navigate' ? c.match(new URL('./index.html', self.registration.scope).href) : undefined)).then((m) => m || new Response('Offline and not cached yet.', { status: 503, headers: { 'content-type': 'text/plain' } })))));
});
