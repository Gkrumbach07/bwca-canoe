// The story layer's rules (stream L, Round 1; docs/build/campaign-design.md §7.1). A place's own verbs and triggers
// (story-places.json, walt-sites.js) act through story-layer.js; these are the patterns across places.
//
// Ids are never reused (story-data/retired.js).
export const RULES_LAYER = [
  // §7.1: three different stones looked at set lock 4's key B (locks.js L4B reads knows.stones)
  { id: 'layer.stones3', when: 'count(stone.*)>=3', then: ['f:knows.stones'] },
  // 20 §11.3: NB20's second-ink line makes sense anywhere once the pink tape is seen and the page is read (20 §11.3: "or anywhere once landing.pink is set")
  { id: 'layer.nb20pink', when: 'f:landing.pink & read:NB20', then: ['f:landing.nb20', 'walt:20:11.3.w2'] },
];
