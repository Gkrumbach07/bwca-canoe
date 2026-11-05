// What each outfitter alone sells (game-loop round, stream B; the owner, 2026-11-02: "its own shelf: premium items only
// sold there, and discounts on its specialty"). Two things a counter, each made or brought in by that outfitter and
// sold at no other: a spray deck on the big water, a tumpline on the river side, a trade blanket at the border, and so
// on. They are gear in player.gear's terms (shop.js applyGear reads `effect`, one per family, the best of a family
// counts), so what they do is small and felt; their words say only what they are (the owner's rule: items never say
// what they are for). The shop stocks them at their host only (shop.js stock), on the shelf named.
//
// And each outfitter's specialty (specialty): a kind of thing it sells 15 % under the others' price (shop.js price):
// a family ('rod', 'net', 'yoke', 'pad', 'saw', 'camera', 'dilly'), a slot ('canoe', 'paddle', 'tent', 'filter') or a
// whole shelf ('food', 'tackle', 'lure').
//
//   PREMIUM { id: { id, host, name, shelf, family, kind, price, kg, effect, identity } }, PREMIUM_BY_HOST { ep: [ids] }
//   SPECIALTY { ep: { family | slot | shelf, off, words } }, specialtyMatch(item, sp) → bool
import { defineItem, ITEMS } from './items.js';

// footprints and pictures of the families (inv-ui.js FAMILY's): [w, h, icon]
const LOOK = { yoke: [3, 1, 'cedaryoke'], net: [2, 3, 'net'], blanket: [2, 2, 'blanket'], jacket: [2, 1, 'jacket'], sail: [1, 4, 'sail'], cover: [2, 2, 'cover'],
  tump: [1, 1, 'tump'], leaders: [1, 1, 'leaders'], kneelers: [2, 1, 'kneelers'] };
// [id, host, name, family, effect, price, kg, identity]
const ROWS = [
  ['kit:vermcover', 1, 'Vermilion spray cover', 'cover', { stability: 1.16 }, 65, 1.5, 'Snap-down canvas, three panels'],
  ['kit:vermkneel', 1, 'Resort kneeling pads', 'kneelers', { effort: 0.96 }, 16, 0.5, 'Sheepskin over felt, the resort’s brand burnt in'],
  ['kit:slimtump', 6, 'Echo Trail tumpline', 'tump', { carry: 0.87 }, 19, 0.4, 'Moosehide strap, braided ends'],
  ['kit:slimnet', 6, 'Burntside landing net', 'net', { snap: 1.12 }, 22, 0.8, 'Ash hoop, a deep cotton bag'],
  ['kit:crnleaders', 12, 'Border steel leaders', 'leaders', { snap: 1.09 }, 7, 0.05, 'Steel wire, twisted by hand · twelve to a card'],
  ['kit:crnyoke', 12, 'Beatty Portage yoke', 'yoke', { carry: 0.82 }, 36, 1.6, 'White cedar, the hollows carved deep'],
  ['kit:sioukneel', 16, 'Sioux River kneeling pads', 'kneelers', { effort: 0.95 }, 18, 0.5, 'Sheepskin over felt, cut to a canoe’s floor'],
  ['kit:siouyoke', 16, 'Moose River portage yoke', 'yoke', { carry: 0.81 }, 36, 1.6, 'White cedar, shaped to the shoulders'],
  ['kit:moosesail', 25, 'Basswood sail', 'sail', { cruise: 1.035 }, 48, 1.8, 'Square of canvas on two spruce poles'],
  ['kit:moosenet', 25, 'Moose Lake landing net', 'net', { snap: 1.12 }, 22, 0.8, 'Bent ash and cotton mesh'],
  ['kit:farmblanket', 31, 'Aho wool blanket', 'blanket', { sleepAdd: 0.045 }, 30, 1.4, 'Grey wool, knitted edge'],
  ['kit:farmkneel', 31, 'Farm Lake kneeling pads', 'kneelers', { effort: 0.96 }, 16, 0.5, 'Felt pads, sewn in canvas'],
  ['kit:hogtump', 36, 'Hog Creek tumpline', 'tump', { carry: 0.88 }, 18, 0.4, 'Tanned leather, a wide brow band'],
  ['kit:hogjacket', 36, 'Perent Lake bug jacket', 'jacket', { sleepAdd: 0.025 }, 15, 0.3, 'Green mesh, hood and cuffs'],
  ['kit:sawjacket', 38, 'Sawbill bug jacket', 'jacket', { sleepAdd: 0.025 }, 14, 0.3, 'Mesh hood and sleeves'],
  ['kit:sawkneel', 38, 'Sawbill kneeling pads', 'kneelers', { effort: 0.955 }, 16, 0.5, 'Sheepskin, the wool left long'],
  ['kit:brulecover', 40, 'Brule Lake spray cover', 'cover', { stability: 1.14 }, 62, 1.5, 'Waxed canvas, snaps along the gunwales'],
  ['kit:homerblanket', 40, 'Homer Lake wool blanket', 'blanket', { sleepAdd: 0.045 }, 30, 1.4, 'Red wool, black stripes at the ends'],
  ['kit:poplarsail', 49, 'Poplar Lake sail', 'sail', { cruise: 1.03 }, 46, 1.8, 'Tan canvas on two spruce spars'],
  ['kit:poplarnet', 49, 'Bratvold landing net', 'net', { snap: 1.13 }, 24, 0.8, 'Birch hoop, knotted cotton'],
  ['kit:roundcover', 51, 'Round Lake spray deck', 'cover', { stability: 1.2 }, 72, 1.6, 'Three-piece canvas deck, snapped down tight'],
  ['kit:tuscyoke', 51, 'Tuscarora carry yoke', 'yoke', { carry: 0.8 }, 38, 1.7, 'Cedar, padded with old elk hide'],
  ['kit:bearcover', 64, 'Clearwater spray cover', 'cover', { stability: 1.17 }, 68, 1.5, 'Blue canvas deck, brass snaps'],
  ['kit:bearjacket', 64, 'East Bearskin bug jacket', 'jacket', { sleepAdd: 0.03 }, 16, 0.3, 'Mesh hood, elastic at the wrists'],
  ['kit:bogyoke', 67, 'Isabella River yoke', 'yoke', { carry: 0.82 }, 34, 1.6, 'Ash bow, sheepskin under it'],
  ['kit:bogkneel', 67, 'Bog Lake kneeling pads', 'kneelers', { effort: 0.955 }, 17, 0.5, 'Old wool felt, double thick'],
  ['kit:johnblanket', 69, 'Arrowhead wool blanket', 'blanket', { sleepAdd: 0.05 }, 32, 1.5, 'Undyed wool, a painted corner'],
  ['kit:johnnet', 69, 'Fowl Lakes landing net', 'net', { snap: 1.12 }, 23, 0.8, 'Spruce hoop, linen mesh'],
];
const ON_YOU = (f) => {
  const out = [], t = (v) => `×${+(+v).toFixed(2)}`;
  if (Number.isFinite(f.cruise)) out.push({ label: 'Cruise', value: t(f.cruise) });
  if (Number.isFinite(f.effort)) out.push({ label: 'Effort', value: t(f.effort) });
  if (Number.isFinite(f.stability)) out.push({ label: 'Steady', value: t(f.stability) });
  if (Number.isFinite(f.carry)) out.push({ label: 'Carrying', value: `energy ${t(f.carry)}` });
  if (Number.isFinite(f.snap)) out.push({ label: 'Line', value: t(f.snap) });
  if (Number.isFinite(f.sleepAdd)) out.push({ need: 'rest', add: Math.round(f.sleepAdd * 100), when: 'a night' });
  return out;
};
const SHELF = { net: 'tackle', leaders: 'tackle' };
export const PREMIUM = {};
export const PREMIUM_BY_HOST = {};
for (const [id, host, name, family, effect, price, kg, identity] of ROWS) {
  const [w, h, icon] = LOOK[family] || [1, 1, 'jig'];
  const it = { id, host, name, family, effect, price, kg, identity, shelf: SHELF[family] || 'gear', kind: 'gear', premium: true };
  PREMIUM[id] = it;
  (PREMIUM_BY_HOST[host] || (PREMIUM_BY_HOST[host] = [])).push(id);
  if (!ITEMS[id]) defineItem({ id, name, short: name.split(' ').slice(-2).join(' '), kind: 'gear', w, h, kg, price, icon, identity, onYou: ON_YOU(effect) });
}

// the specialties: 15 % under the others' price for that kind of thing
const OFF = 0.15;
export const SPECIALTY = {
  1: { family: 'net', words: 'landing nets' },
  6: { shelf: 'lure', words: 'lures' },
  12: { slot: 'tent', words: 'tents' },
  16: { family: 'yoke', words: 'yokes' },
  25: { slot: 'canoe', words: 'canoes' },
  31: { shelf: 'food', words: 'food' },
  36: { slot: 'filter', words: 'water filters' },
  38: { shelf: 'tackle', words: 'tackle and bait' },
  40: { family: 'pad', words: 'sleeping pads' },
  49: { slot: 'paddle', words: 'paddles' },
  51: { family: 'rod', words: 'rods' },
  64: { family: 'camera', words: 'cameras' },
  67: { family: 'saw', words: 'saws' },
  69: { family: 'dilly', words: 'dilly bobs' },
};
for (const k of Object.keys(SPECIALTY)) SPECIALTY[k].off = OFF;
// whether a shop item (shop.js CATALOG's shape: shelf, family, slot) is of a specialty
export function specialtyMatch(it, sp) {
  if (!it || !sp || it.premium) return false;
  if (sp.family && it.family === sp.family) return true;
  if (sp.slot && it.slot === sp.slot) return true;
  if (sp.shelf && it.shelf === sp.shelf && !it.use) return true;
  return false;
}
