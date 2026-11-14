/* OnboardPilot storage: localStorage for settings, theme and (only if you choose) your API key;
   IndexedDB for hires, handbook and templates, with a localStorage fallback if IndexedDB is blocked. */
(function (root) {
  'use strict';
  const ls = { get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }, del(k) { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } } };
  let dbp = null;
  function db() { if (dbp) return dbp; dbp = new Promise((res, rej) => { if (typeof indexedDB === 'undefined') { rej(new Error('IndexedDB unavailable')); return; } const r = indexedDB.open('onboardpilot', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); return dbp; }
  async function tx(mode, fn) { const d = await db(); return new Promise((res, rej) => { const t = d.transaction('kv', mode); const req = fn(t.objectStore('kv')); t.oncomplete = () => res(req && req.result); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error || new Error('aborted')); }); }
  const FALLBACK = 'op.state';
  async function load() { try { const v = await tx('readonly', (s) => s.get('state')); if (v) return v; } catch (e) { /* fall through */ } return ls.get(FALLBACK, null); }
  let pending = null; let timer = null;
  async function saveNow(state) { const copy = JSON.parse(JSON.stringify(state)); try { await tx('readwrite', (s) => s.put(copy, 'state')); ls.del(FALLBACK); return 'idb'; } catch (e) { return ls.set(FALLBACK, copy) ? 'ls' : 'memory'; } }
  function save(state) { pending = state; clearTimeout(timer); timer = setTimeout(() => { const s = pending; pending = null; saveNow(s); }, 150); }
  async function flush() { if (pending) { clearTimeout(timer); const s = pending; pending = null; return saveNow(s); } }
  async function clear() { clearTimeout(timer); pending = null; try { await tx('readwrite', (s) => s.delete('state')); } catch (e) { /* ignore */ } ls.del(FALLBACK); }
  if (typeof addEventListener !== 'undefined') addEventListener('pagehide', () => { flush(); });
  root.OPStore = { ls, load, save, saveNow, flush, clear };
})(typeof self !== 'undefined' ? self : this);
