// The mining years' things (story Round 2, stream A2; docs/story/30-mining-years.md §4.3, §4.5, §4.7, §6.3; 90 §11):
// the sample bottles, Leo's lid with its stamp, the crew map (a book page), the broken shovel blade. Loaded only under
// STORY_ON (main.js's a2 block), so with the flag off none of these is defined. Items never say their use: a bottle has
// no description, the lid's only words are its stamp (read off the item, item.leolid.stamp), the blade only its name.
//
//   defineMiningItems(T)   T(id) → the words (topics.js T): the lid's stamp, the crew map's labels. Idempotent
//   giveItem(inventory, id, n = 1) → n given · takeItem(inventory, id, n = 1) → n taken · has(inventory, id) → count
//   ITEM   the ids: bottle, lid, blade, map ('page:crewmap')
//   (the `give:item.<id>[*n]` action is E's handler, feed-episodes.js: the join took out A2's stand-in)
import { defineItem, definePage } from './items.js';

export const ITEM = { bottle: 'samplebottle', lid: 'leolid', blade: 'shovelblade', map: 'page:crewmap' };

let done = false;
export function defineMiningItems(T = () => null) {
  if (done) return ITEM;
  done = true;
  // 30 §4.3: three sample bottles in a mesh bag, a new kind with no description; handed back at the tailgate
  defineItem({ id: ITEM.bottle, name: 'Sample bottle', short: 'Bottle', kind: 'tool', w: 1, h: 2, kg: 0.15, stack: 3, price: 0, sold: false, identity: '', story: 'a2' });
  // 30 §4.3: Leo's lid, a rotten slat with a punched stamp on its end (its words are the stamp: "L.P.  3-76   KP-4   120–135")
  defineItem({ id: ITEM.lid, name: 'Box lid', short: 'Lid', kind: 'gear', w: 2, h: 1, kg: 0.4, price: 0, sold: false, unique: true, identity: T('item.leolid.stamp') || '', story: 'a2' });
  // 30 §4.7: the snapped shovel blade, new once, rusted (Dan buys junk: Round 6)
  defineItem({ id: ITEM.blade, name: 'Shovel blade, broken', short: 'Blade', kind: 'gear', w: 2, h: 2, kg: 0.9, price: 0, sold: false, identity: '', story: 'a2' });
  // 30 §4.5: the crew map, a book page (not a map sheet: it cannot be pencilled). Its words: the item's anchors
  definePage({ id: 'crewmap', title: 'The crew map', ref: 'item.crewmap.map', by: 'Tauno' });
  return ITEM;
}

export function has(inv, id) { try { return inv && typeof inv.count === 'function' ? inv.count(id, { reachable: false }) : 0; } catch { return 0; } }
export function giveItem(inv, id, n = 1) {
  let k = 0;
  for (let i = 0; i < n; i++) { try { if (inv && inv.give(id)) k++; } catch (e) { console.warn('mining: give', id, e); } }
  try { if (k && typeof inv.write === 'function') inv.write(); } catch { /* the inventory's own */ }
  return k;
}
export function takeItem(inv, id, n = 1) {
  let k = 0;
  for (let i = 0; i < n; i++) { try { if (inv && inv.remove(id, 1)) k++; } catch { break; } }
  try { if (k && typeof inv.write === 'function') inv.write(); } catch { /* the inventory's own */ }
  return k;
}
