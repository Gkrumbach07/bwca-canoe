// The run's things (docs/story/50-finale.md §5.4, §6.8, §6.9; Round 3 stream R). Loaded only under STORY_ON (run.js),
// so with the flag off none of these is defined. Items never say their use.
//
//   defineRunItems()   the two ammunition cans (5 kg each, kept: never sold, given, offered or lost; they ride in a pack
//                      like any 5 kg thing; set down, only Pick up; the 50 m leash is run.js's), the scanner (the
//                      Camdre dry bag's handheld) and the spare paddle (the Pietro end of P530, under the white stone)
//   giveCans(inventory) → n · hasCans(inventory) → count (anywhere: on you, in the canoe, on the ground)
//   RUN_ITEM ids · isRunCan(id)
import { defineItem, itemDef } from './items.js';

export const RUN_ITEM = { can: 'ammocan', scanner: 'scanner', paddle: 'sparepaddle' };
let done = false;
export function defineRunItems() {
  if (done) return RUN_ITEM;
  done = true;
  // §5.4: olive drab, about 30 cm, a hinged lid on a clamp, tarred shut; about 5 kg (one has a piece of rock in it)
  defineItem({ id: RUN_ITEM.can, name: 'Ammunition can', short: 'Can', kind: 'gear', w: 2, h: 1, kg: 5, price: 0, sold: false, icon: 'crate', model: 'crate', tint: 0x4b5233,
    identity: 'Olive drab, the lid tarred shut', kept: true, runCan: true, story: 'r' });
  // §6.8: a handheld scanner, lithium batteries in a bread bag marked 2017, set to scan
  defineItem({ id: RUN_ITEM.scanner, name: 'Handheld scanner', short: 'Scanner', kind: 'tool', w: 1, h: 2, kg: 0.35, price: 0, sold: false, unique: true, icon: 'headlamp',
    identity: 'Set to scan · batteries in a bread bag marked 2017', kept: true, run: true, story: 'r' });
  // §6.9: a spare paddle (a long thing, as the other paddles are, when items.js has one; else gear)
  if (!itemDef(RUN_ITEM.paddle)) defineItem({ id: RUN_ITEM.paddle, name: 'Spare paddle', short: 'Paddle', kind: 'gear', w: 1, h: 4, kg: 0.9, price: 0, sold: false, identity: 'Ash, the grip worn smooth', run: true, story: 'r' });
  return RUN_ITEM;
}
export const isRunCan = (id) => { const d = itemDef(id); return !!(d && d.runCan); };
export function hasCans(inv) { try { return inv && typeof inv.count === 'function' ? inv.count(RUN_ITEM.can, { reachable: false }) : 0; } catch { return 0; } }
export function giveCans(inv, n = 2) {
  let k = 0;
  for (let i = 0; i < n; i++) { try { if (inv && inv.give(RUN_ITEM.can)) k++; } catch (e) { console.warn('run: the cans', e); } }
  try { if (k && typeof inv.write === 'function') inv.write(); } catch { /* the inventory's own */ }
  return k;
}
// where the cans are: on you / in reach ('carried'), or set down on the ground at { x, z } (the 50 m leash reads these)
export function cansDown(inv) {
  const out = [];
  if (!inv || !Array.isArray(inv.containers)) return out;
  for (const c of inv.containers) {
    if (!c.grid || !c.grid.some((e) => e.id === RUN_ITEM.can)) continue;
    if (c.where === 'ground' && c.at) out.push({ x: c.at.x, z: c.at.z, c });
  }
  return out;
}
