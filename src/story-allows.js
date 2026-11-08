// STUB (K1b, campaign-design §8.3 "No camping", §15): story.allows(verb) gates a verb at its source, so the run can make
// Pitch, the tarp, lighting a fire and Rest-in-tent ABSENT (filtered out of nearby.js / inv-ui.js lists, never greyed).
// R (Round 3, run.js) adds the real rule; until then everything is allowed, so a caller wired in Round 1 changes nothing.
//
//   story.allows(verb, ctx?) → bool        verb: 'pitch' | 'tarp' | 'light' | 'rest' | 'rest:tent' | any verb id
//                                          ctx: whatever the source knows ({ site, item, … })
//   story.allows.add(fn) → off             fn(verb, ctx) → false to refuse (anything else: no say); the first false wins
//   story.allows.rules()                   how many rules are in (rigs)
//
// Callers keep it cheap: one call per list build, not per frame. A thrown rule is ignored (allowed).
const rules = new Set();

export function allows(verb, ctx = {}) {
  for (const fn of rules) {
    let r;
    try { r = fn(verb, ctx); } catch (e) { console.warn('story.allows', verb, e); continue; }
    if (r === false) return false;
  }
  return true;
}
allows.add = (fn) => { if (typeof fn !== 'function') throw new Error('story.allows.add: a function'); rules.add(fn); return () => rules.delete(fn); };
allows.rules = () => rules.size;
allows.stub = true;

// the verbs the run withholds (R fills the rule; listed here so callers name them the same)
export const RUN_VERBS = Object.freeze(['pitch', 'tarp', 'light', 'rest:tent']);
