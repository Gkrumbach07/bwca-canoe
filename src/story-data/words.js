// The story's words in the browser (stream B, Round 1; campaign-design §13): text/*.json (story-extract.mjs) loaded once,
// each file its own chunk, and looked up by id. Only story modules import this, and they load only under STORY_ON, so
// with the flag off not one of these files is fetched. In Node (the lint imports every story-data module) there is no
// Vite to expand the glob: the table stays empty there.
//
//   await loadText() → the table · text(id) → entry | null (after loadText) · say(id, vars?) → its words, {x} filled
//   nbText() → nb.json's table (the notebook's pages)
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
