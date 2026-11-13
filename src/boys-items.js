// The boys' things (campaign stream b5, Round 5; docs/story/32-the-boys.md §5.3, §5.6, §5.9.4, §5.9.5, §5.9.8, §11):
// Gene's September 1998 slide, Denny's card, Walt's black steel pan (lent, "Keep it in the pack till the fifteenth"),
// one of Walt's spoons for the laker bet (lent for the evening), the spent flare cartridge from the crack in Walt's rock
// (a keepsake). Loaded only under STORY_ON (main.js's b5 block), so with the flag off none of these is defined. Items
// never say their use: the slide's words are what's on it (the book's line, 32:5.3.slide.1), the card's its printing.
//
//   defineBoysItems(T)   T(id) → the words (topics.js T). Idempotent
//   ITEM   the ids
import { defineItem } from './items.js';

export const ITEM = { slide: 'geneslide', card: 'dennycard', pan: 'waltpan', spoon: 'waltspoon', flare: 'flarecase' };
// the card as the book shows it (32 §3.3 "His card"; §11 "Text tokens": the 555-01xx number is fictional)
const CARD = 'DENNIS RASK · RASK AGENCY · INSURANCE · DULUTH. The office number crossed out in ballpoint; under it, by hand: 218-555-0163';

let done = false;
export function defineBoysItems(T = () => null) {
  if (done) return ITEM;
  done = true;
  // 32 §5.3: a 35 mm slide in a cardboard mount, Gene's hand on it
  defineItem({ id: ITEM.slide, name: 'Slide, Sept 98', short: 'Slide', kind: 'gear', w: 1, h: 1, kg: 0.005, price: 0, sold: false, unique: true, unsellable: true, identity: T('32:5.3.slide.1') || '', story: 'b5' });
  defineItem({ id: ITEM.card, name: 'Denny\'s card', short: 'Card', kind: 'gear', w: 1, h: 1, kg: 0.002, price: 0, sold: false, unique: true, unsellable: true, identity: CARD, story: 'b5' });
  // 32 §5.9.4: black steel, wrapped in a towel; nobody's cooked in it since 2011
  defineItem({ id: ITEM.pan, name: 'Walt\'s pan', short: 'Pan', kind: 'gear', w: 2, h: 2, kg: 1.4, price: 0, sold: false, unique: true, unsellable: true, identity: 'Black steel, wrapped in a towel', story: 'b5' });
  // 32 §5.9.5: hammered, silver with a copper back, the paint gone
  defineItem({ id: ITEM.spoon, name: 'Walt\'s spoon', short: 'Spoon', kind: 'gear', w: 1, h: 1, kg: 0.02, price: 0, sold: false, unique: true, unsellable: true, identity: 'Hammered, silver with a copper back', story: 'b5' });
  // 32 §5.9.8: a spent flare cartridge, faded red
  defineItem({ id: ITEM.flare, name: 'An old flare cartridge', short: 'Flare', kind: 'gear', w: 1, h: 1, kg: 0.03, price: 0, sold: false, unique: true, unsellable: true, identity: 'Faded red, spent', story: 'b5' });
  return ITEM;
}

export function has(inv, id) { try { return inv && typeof inv.count === 'function' ? inv.count(id, { reachable: false }) : 0; } catch { return 0; } }
export function takeItem(inv, id, n = 1) {
  let k = 0;
  for (let i = 0; i < n; i++) { try { if (inv && inv.remove(id, 1)) k++; } catch { break; } }
  try { if (k && typeof inv.write === 'function') inv.write(); } catch { /* the inventory's own */ }
  return k;
}
