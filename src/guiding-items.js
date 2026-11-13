// The guiding years' things (story Round 4, stream A3; docs/story/31-guiding-years.md GY-04, GY-07, GY-09, GY-12; 90
// "Book pages given by people", "Loaned items that must go back"): Hap's 1986 print (a loan: "Hap's. Give it back." while
// held, gone back to him at GY-07), Sheila's page two (the report from the squad boat's first-aid box), the 2019 register,
// the message off the phone pad and Marlys's 2019 clipping (from the bottom of the 2020 box in the boathouse loft), and
// Hap's hair jigs (a unique lure: a jig; items never say their use). Loaded only under STORY_ON (main.js's a3 block).
import { defineItem, definePage, takesOn } from './items.js';

export const ITEM = { print: 'page:happrint', report: 'page:sheilareport', register: 'page:register2019', message: 'page:message', clipping: 'page:clipping2019', jigs: 'lure:hapjigs' };
let done = false;
export function defineGuidingItems() {
  if (done) return ITEM;
  done = true;
  definePage({ id: 'happrint', title: 'Hap\'s picture, 1986', ref: '31:GY-04.day.8', by: 'Hap', loan: { back: 'hap' } });
  definePage({ id: 'sheilareport', title: 'Page two', ref: 'sheila.report', by: 'Sheila' });
  definePage({ id: 'register2019', title: 'BUNKHOUSE 2019', ref: 'register.helstrom', by: null });
  definePage({ id: 'message', title: 'A sheet off a phone pad', ref: '31:register.message', by: null });
  definePage({ id: 'clipping2019', title: 'A clipping, 2019', ref: 'clipping.2019', by: null });
  defineItem({ id: ITEM.jigs, name: 'Hair jigs in a flat tin', short: 'Hair jigs', kind: 'lure', kg: 0.02, price: 0, sold: false, unique: true, lure: 'jig', identity: 'Tied by hand', onYou: [takesOn('jig')], story: 'a3' });
  return ITEM;
}
export function count(inv, id) { try { return inv && typeof inv.count === 'function' ? inv.count(id, { reachable: false }) : 0; } catch { return 0; } }
export function take(inv, id) { try { const ok = inv && inv.remove(id, 1); if (ok && typeof inv.write === 'function') inv.write(); return !!ok; } catch { return false; } }
