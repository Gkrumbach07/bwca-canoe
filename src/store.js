// Where the saves live (2026-11-01, the owner: "i dont like saves being made in local storage, is that really the best
// spot?"). Every key the game keeps (`bwca-canoe:*`, `bwca-canoe-*`, the slots' `bwca-canoe@*`) is in IndexedDB, in the
// database `bwca-canoe-store`, and the browser is asked once to keep it (navigator.storage.persist(), so it is not
// evicted under disk pressure). localStorage is only the fallback when IndexedDB is refused.
//
// The game reads its saves synchronously, all through the boot (save.js mounts the season slot before main() reads
// anything), so this module loads every key into memory first: it has a top-level await, and every module that imports
// it (save.js and so everything that saves) is evaluated only once the keys are in. After that:
//   kv.getItem(k) · setItem(k, v) · removeItem(k) · key(i) · length   the Storage API, from memory
//   kv.flush() → Promise                                             every write so far is in IndexedDB
//   kv.backend                                                       'idb' | 'local' (the fallback) | 'memory' (none)
//   kv.freeze(test)                                                  drop writes whose key passes test (a stale tab)
//   kv.onTab(fn)                                                     fn(msg) on another tab's message
//   kv.persisted · kv.persist()                                      the browser's promise to keep the store
//   kv.clear()                                                       every game key gone (tests, a fresh profile)
//
// Writes go into one IndexedDB transaction per burst (a microtask after the synchronous writes that made it), so the
// autosave's several keys are one transaction and a write in a pagehide handler is under way before the page goes.
// A season switch (save.js) awaits flush() before it reloads.
//
// Moving the old saves: when localStorage holds game keys (a save from before this module, a session that fell back,
// or a test rig that seeded one), they are the newest: they replace the store's keys as a whole season, are read back,
// and only then are removed from localStorage. `bwca-canoe-geo` (the GPS bridge's live fix to other tabs) stays in
// localStorage: it is a message, not a save.
//
// One tab at a time: a tab that opens says so on a BroadcastChannel, and an older tab of the game stops saving
// (save.js marks it stale), so two tabs never mix their writes.

const DB = 'bwca-canoe-store', OS = 'kv', BACKUP = 'backup', CHANNEL = 'bwca-canoe-store';
const GAME_KEY = /^bwca-canoe[:@-]/;
const LOCAL_ONLY = new Set(['bwca-canoe-geo']);
const isGameKey = (k) => typeof k === 'string' && GAME_KEY.test(k) && !LOCAL_ONLY.has(k);
const OPEN_WAIT = 4000; // ms to wait for IndexedDB to open (a blocked upgrade in another tab) before falling back

const local = () => { try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; } };
function legacyKeys() {
  const ls = local(), out = {};
  if (!ls) return out;
  try { for (let i = 0; i < ls.length; i++) { const k = ls.key(i); if (isGameKey(k)) out[k] = ls.getItem(k); } } catch { /* unreadable */ }
  return out;
}

function openDb() {
  return new Promise((res) => {
    let done = false;
    const end = (db) => { if (!done) { done = true; res(db); } };
    setTimeout(() => end(null), OPEN_WAIT);
    try {
      if (typeof indexedDB === 'undefined') { end(null); return; }
      const r = indexedDB.open(DB, 1);
      r.onupgradeneeded = () => { for (const n of [OS, BACKUP]) if (!r.result.objectStoreNames.contains(n)) r.result.createObjectStore(n); };
      r.onsuccess = () => { if (done) { try { r.result.close(); } catch { /* late */ } return; } end(r.result); };
      r.onerror = () => end(null);
      r.onblocked = () => end(null);
    } catch { end(null); }
  });
}
function readAll(db) {
  return new Promise((res) => {
    try {
      const tx = db.transaction(OS, 'readonly'), st = tx.objectStore(OS), keys = st.getAllKeys(), vals = st.getAll();
      tx.oncomplete = () => { const m = new Map(); keys.result.forEach((k, i) => { if (typeof vals.result[i] === 'string') m.set(String(k), vals.result[i]); }); res(m); };
      tx.onerror = tx.onabort = () => res(null);
    } catch { res(null); }
  });
}
// puts (value a string) and deletes (value null) in one transaction; true once committed
// replace: the store emptied first, what it held kept under BACKUP (the time) so a replace can be undone by hand
function commit(db, changes, replace = null) {
  return new Promise((res) => {
    try {
      const tx = db.transaction(replace ? [OS, BACKUP] : OS, 'readwrite'), st = tx.objectStore(OS);
      if (replace) { tx.objectStore(BACKUP).put(JSON.stringify(Object.fromEntries(replace)), new Date().toISOString()); st.clear(); }
      for (const [k, v] of changes) { if (v == null) st.delete(k); else st.put(v, k); }
      tx.oncomplete = () => res(true);
      tx.onerror = tx.onabort = () => res(false);
    } catch { res(false); }
  });
}

const mem = new Map();
let db = null, backend = 'memory', frozen = null;
const pending = new Map();
let queued = false, inflight = Promise.resolve(true);

// --- the boot: every key into memory before anything reads ---
async function boot() {
  db = await openDb();
  const old = legacyKeys(), oldN = Object.keys(old).length;
  if (db) {
    const have = await readAll(db);
    if (have) {
      if (oldN) {
        // the old saves are the newest: with a season in them they become the store (what it held kept in BACKUP);
        // a few loose keys with none are laid over it. Read back, then they leave localStorage
        const whole = 'bwca-canoe:profile' in old || 'bwca-canoe@slots' in old;
        const ok = await commit(db, Object.entries(old), whole && have.size ? have : null);
        const back = ok ? await readAll(db) : null;
        if (back && Object.entries(old).every(([k, v]) => back.get(k) === v)) {
          for (const [k, v] of back) mem.set(k, v);
          const ls = local(); for (const k of Object.keys(old)) { try { ls.removeItem(k); } catch { /* left: moved again next time */ } }
          console.info(`saves: moved ${oldN} keys from localStorage to IndexedDB`);
          backend = 'idb'; return;
        }
        console.warn('saves: could not move the old saves into IndexedDB; staying on localStorage');
      } else { for (const [k, v] of have) mem.set(k, v); backend = 'idb'; return; }
    }
    try { db.close(); } catch { /* gone */ }
    db = null;
  }
  if (local()) { backend = 'local'; return; } // the fallback: kv passes straight through to localStorage
  backend = 'memory';
}
try { await boot(); } catch (e) { console.warn('saves: the store did not start', e); if (local()) backend = 'local'; }

function schedule() {
  if (queued) return;
  queued = true;
  queueMicrotask(() => { queued = false; flushNow(); });
}
function flushNow() {
  if (!db || !pending.size) return inflight;
  const changes = [...pending]; pending.clear();
  inflight = inflight.then(() => commit(db, changes)).then((ok) => {
    if (!ok) { for (const [k, v] of changes) if (!pending.has(k)) pending.set(k, v); console.warn('saves: a write to IndexedDB failed; it will be tried again'); }
    return ok;
  });
  return inflight;
}

let channel = null;
const tabFns = [];
const TAB = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
try {
  channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(CHANNEL);
  if (channel) {
    channel.onmessage = (e) => { const m = e.data; if (m && m.tab !== TAB) for (const fn of tabFns) { try { fn(m); } catch (err) { console.warn(err); } } };
    channel.postMessage({ type: 'open', tab: TAB, at: Date.now() });
  }
} catch { channel = null; }

if (typeof window !== 'undefined') {
  const out = () => { flushNow(); };
  window.addEventListener('pagehide', out);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') out(); });
}

let persisted = null;
async function persist() {
  try {
    if (backend !== 'idb' || !navigator.storage || !navigator.storage.persist) return false;
    if (persisted == null && navigator.storage.persisted) persisted = await navigator.storage.persisted();
    if (!persisted) persisted = await navigator.storage.persist();
    return persisted;
  } catch { return false; }
}
// asked once, on the first press or click (Firefox shows its own question; Chrome and Safari decide on their own)
if (typeof window !== 'undefined' && backend === 'idb') {
  const ask = () => { window.removeEventListener('pointerdown', ask, true); window.removeEventListener('keydown', ask, true); persist(); };
  window.addEventListener('pointerdown', ask, true); window.addEventListener('keydown', ask, true);
}

export const kv = {
  get backend() { return backend; },
  get persisted() { return persisted; },
  get tab() { return TAB; },
  get length() { if (backend === 'local') return local().length; return mem.size; },
  key(i) { if (backend === 'local') return local().key(i); return [...mem.keys()][i] ?? null; },
  getItem(k) {
    k = String(k);
    if (backend === 'local' || LOCAL_ONLY.has(k)) { try { return local().getItem(k); } catch { return null; } }
    return mem.has(k) ? mem.get(k) : null;
  },
  setItem(k, v) {
    k = String(k); v = String(v);
    if (frozen && frozen(k)) return;
    if (backend === 'local' || LOCAL_ONLY.has(k)) { local().setItem(k, v); return; } // (throws when full, as localStorage does)
    mem.set(k, v);
    if (db) { pending.set(k, v); schedule(); }
  },
  removeItem(k) {
    k = String(k);
    if (frozen && frozen(k)) return;
    if (backend === 'local' || LOCAL_ONLY.has(k)) { try { local().removeItem(k); } catch { /* none */ } return; }
    mem.delete(k);
    if (db) { pending.set(k, null); schedule(); }
  },
  flush() { return flushNow(); },
  freeze(test) { frozen = test; },
  onTab(fn) { tabFns.push(fn); },
  tell(msg) { try { if (channel) channel.postMessage({ ...msg, tab: TAB }); } catch { /* none */ } },
  persist,
  // every game key gone, here and in localStorage (a fresh profile for tests)
  async clear() {
    for (const k of [...mem.keys()]) if (isGameKey(k)) { mem.delete(k); if (db) pending.set(k, null); }
    const ls = local(); if (ls) for (const k of Object.keys(legacyKeys())) { try { ls.removeItem(k); } catch { /* none */ } }
    return flushNow();
  },
};
