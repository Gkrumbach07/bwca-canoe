// The story's words in the browser (Round 1: streams B and T; campaign-design §13): text/*.json (story-extract.mjs),
// each file its own chunk. Only story modules import this, and they load only under STORY_ON, so with the flag off not
// one of these files is fetched (and nothing outside story-data names the text: k2-test 6). In Node (the lint imports
// every story-data module) there is no Vite to expand the glob: loadText's table stays empty there.
//
//   await loadText() → the table · text(id) → entry | null (after loadText) · say(id, vars?) → its words, {x} filled
//   nbText() → nb.json's table (the notebook's pages)
//   await loadWords(['opening', 'world']) → { opening, world } (each the file's parsed JSON; stream T)
const FILES = import.meta.env ? import.meta.glob('./text/*.json', { import: 'default' }) : {};
const all = new Map();
let nb = null, loading = null;

export function loadText() {
  if (loading) return loading;
  loading = Promise.all(Object.entries(FILES).map(async ([path, load]) => {
    try { const j = await load(); const t = (j && j.text) || {}; if (/\/nb\.json$/.test(path)) nb = t; for (const [id, e] of Object.entries(t)) if (!all.has(id)) all.set(id, e); }
    catch (e) { console.warn('story words', path, e); }
  })).then(() => all);
  return loading;
}
export const text = (id) => all.get(id) || null;
export const nbText = () => nb || {};
export function say(id, vars = {}) {
  const e = all.get(id);
  if (!e) return '';
  return String(e.text || '').replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? String(vars[k]) : m));
}

// st-t: whole files by name (the same chunks the glob makes: Vite shares one module per file)
const NAMED = {
  opening: () => import('./text/opening.json'),
  world: () => import('./text/world.json'),
  nb: () => import('./text/nb.json'),
  mining: () => import('./text/mining.json'),
  guiding: () => import('./text/guiding.json'),
  boys: () => import('./text/boys.json'),
  family: () => import('./text/family.json'),
  company: () => import('./text/company.json'),
  finale: () => import('./text/finale.json'),
  side: () => import('./text/side.json'),
};
export async function loadWords(names = ['opening', 'world']) {
  const out = {};
  await Promise.all(names.map(async (n) => { const f = NAMED[n]; if (!f) return; const m = await f(); out[n] = m.default || m; }));
  return out;
}
