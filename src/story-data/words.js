// The story's words for the game (stream T, Round 1): the extract's JSON files, loaded on demand. Only a story module
// behind STORY_ON calls this, so with the flag off nothing outside story-data names the text (k2-test 6) and the words
// are never fetched. → { opening, world, … } (each the file's parsed JSON)
const FILES = {
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
  await Promise.all(names.map(async (n) => { const f = FILES[n]; if (!f) return; const m = await f(); out[n] = m.default || m; }));
  return out;
}
