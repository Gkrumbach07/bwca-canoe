// Recipes: what a pot makes of what is in it (the owner, 2026-10-31: "I'm cooking oatmeal and it needs water and fire …
// if I put on a pot and oatmeal onto the fire, then it still needs water … the building blocks are, you have the raw
// materials, which might be water or oatmeal. And then you have the tool, which might be a lit fire … Food goes in pot").
//
// The furnace pattern, with a pot in it: a STATION (a lit fire under the grate, or the canister stove) heats a VESSEL (a
// pot: items.js def.pot, a small container), and what is IN the vessel (the raw things and the water, an entry of its
// own) is matched against this one table. While the match holds and the station burns, the vessel works on the game
// clock; when it is done the cooked things and the water left over (boiled now, safe, hot) are in the pot. Change what is
// in the pot and it starts again. cook.js runs it; this file is data and the match, and imports nothing that draws.
//
//   RECIPES                  [{ id, takes, water, minutes, out, word, dry? }] one row per raw thing that cooks
//   recipeFor(def)           the row for a raw thing, or null (it won't cook)
//   outOf(row, def)          the item id that comes out
//   boilMinutes(litres)      game minutes from cold to a rolling boil
//   plan(entries, vessel)    what the vessel would do now: { ok, wait, chip, why, dishes, water, need, left, minutes,
//                            word, boil, sig }   (entries: the vessel's grid; vessel: 'pot' | 'grate')
//
// Water in a pot is one grid entry: WATER.lake (lake water as it comes, untreated) or WATER.clean (boiled or treated:
// safe); its `left` is the litres and data.hot the game hour it stays hot until (a brew wants it hot). A drop of lake
// water in the pot makes the whole of it lake water, as in the bottle (energy.js).
import { itemDef } from './items.js';

export const WATER = { lake: 'water:lake', clean: 'water:clean' };
export const isWater = (id) => id === WATER.lake || id === WATER.clean;
export const BOIL = { base: 3, perLitre: 3 };   // game minutes to a rolling boil: 3, and 3 more a litre (2 L: 9 min)
export const HOT_HOURS = 1;                     // game hours boiled water stays hot enough for a cup
export const STOVE_SPEED = 1 / 0.6;             // the stove cooks in 0.6 of the fire's time (kit.js's old STOVE_K)
export const MIN_WATER = 0.05;                  // litres: less than this in a pot is a wet bottom, not water

// One row per raw thing that cooks. takes: an item id, or a test on its def. water: litres it takes from the pot's water
// (what is left over boils). minutes: game minutes over a lit fire. dry: it fries, and won't in a pot with water in it.
// (The minutes and litres were cook.js's COOK and kit.js's additions; one table now.)
export const RECIPES = [
  { id: 'oatmeal', takes: 'meal:breakfast', water: 0.25, minutes: 10, out: 'hot:breakfast', word: 'Cooking' },
  { id: 'supper', takes: 'meal:supper', water: 0.4, minutes: 15, out: 'hot:supper', word: 'Cooking' },
  { id: 'freeze', takes: 'meal:freeze', water: 0.5, minutes: 10, out: 'hot:freeze', word: 'Soaking' },
  { id: 'pancakes', takes: 'meal:pancakes', water: 0.25, minutes: 12, out: 'hot:pancakes', word: 'Cooking' },
  { id: 'chili', takes: 'meal:chili', water: 0.5, minutes: 10, out: 'hot:chili', word: 'Soaking' },
  { id: 'bannock', takes: 'meal:bannock', water: 0.2, minutes: 15, out: 'hot:bannock', word: 'Cooking' },
  { id: 'fillet', takes: (d) => d.kind === 'fish' && !!d.fillet, water: 0, minutes: 6, dry: true, out: 'fried', word: 'Frying' },
  { id: 'fish', takes: (d) => d.kind === 'fish', water: 0, minutes: 10, dry: true, out: 'fried', word: 'Frying' },
];

export function recipeFor(d) {
  if (!d || !d.eat || !d.eat.cook || d.cooked) return null;
  for (const r of RECIPES) if (typeof r.takes === 'function' ? r.takes(d) : r.takes === d.id) return r;
  // a meal from another file with no row of its own: a plain supper's
  return d.kind === 'meal' ? { ...RECIPES[1], id: d.id, takes: d.id, out: d.cooksTo || 'hot:supper' } : null;
}
export function outOf(r, d) {
  if (r.out !== 'fried') return d.cooksTo || r.out;
  const sp = d.species || String(d.id).replace(/^(fish|fillet):/, '');
  return itemDef(`fried:${sp}`) ? `fried:${sp}` : 'fried:fish';
}
export const boilMinutes = (l) => BOIL.base + BOIL.perLitre * Math.max(0, l);
const r2 = (x) => Math.round(x * 100) / 100;

// What the vessel would do now. vessel 'pot': the meals, the fish and the water in it; 'grate': a fish laid straight on
// the bars goes on a green stick over the coals, and anything else raw there wants a pot.
// → { ok, wait: null | 'empty' | 'water' | 'wet' | 'pot' | 'nocook' | 'done', chip, why, dishes: [{ e, d, r, out }], water:
// { l, lake, e } | null, need (litres the dishes take), left (litres after), minutes, word, boil, sig }
export function plan(entries, vessel = 'pot', now = 0) {
  const dishes = [], strays = [];
  let water = null;
  for (const e of entries || []) {
    if (!e || e.box) continue;
    if (isWater(e.id)) { const l = Number.isFinite(e.left) ? e.left : 0; water = { l: (water ? water.l : 0) + l, lake: (water && water.lake) || e.id === WATER.lake, e, hot: e.data && Number.isFinite(e.data.hot) && e.data.hot > now }; continue; }
    const d = itemDef(e.id); if (!d || d.cooked) continue;
    const r = recipeFor(d);
    if (!r) { strays.push({ e, d }); continue; }
    if (vessel === 'grate' && !r.dry) { strays.push({ e, d, pot: true }); continue; }
    dishes.push({ e, d, r, out: outOf(r, d) });
  }
  const l = water ? water.l : 0, wet = l >= MIN_WATER;
  const need = dishes.reduce((s, x) => s + (x.r.water || 0) * (x.e.qty || 1), 0);
  const sig = [...dishes.map((x) => `${x.e.uid}x${x.e.qty || 1}`).sort(), `w${r2(l)}${water && water.lake ? 'L' : ''}`].join('|');
  const base = { dishes, water, need: r2(need), left: r2(Math.max(0, l - need)), sig, boil: false, minutes: 0, word: '' };
  const no = (wait, chip, why, more = {}) => ({ ...base, ok: false, wait, chip, why, ...more });
  if (vessel === 'grate' && strays.some((s) => s.pot)) { if (!dishes.length) return no('pot', 'into a pot', 'Wants a pot'); }
  if (!dishes.length) {
    if (wet && (water.lake || !water.hot)) return { ...base, ok: true, boil: true, minutes: boilMinutes(l), word: water.lake ? 'Boiling' : 'Heating' };
    if (wet) return no('done', '', 'Hot water');
    return no(strays.length ? 'nocook' : 'empty', strays.length ? 'won’t cook' : '', strays.length ? 'Nothing here cooks' : 'Nothing in it');
  }
  const dry = dishes.some((x) => x.r.dry), soak = dishes.some((x) => !x.r.dry);
  if (dry && soak) return no('wet', 'fish apart', 'Fish fries on its own, not with a meal');
  if (dry && wet) return no('wet', 'tip the water out', 'Fish fries in a dry pot');
  if (need > l + 1e-6) { const short = r2(need - l); return no('water', `water ${(Math.ceil(short * 10 - 1e-6) / 10).toFixed(1)} L`, `Needs ${short} L more water`, { short }); }
  const minutes = Math.max(...dishes.map((x) => x.r.minutes), wet ? boilMinutes(l) : 0);
  return { ...base, ok: true, minutes, word: dishes[0].r.word || 'Cooking', boil: wet };
}
