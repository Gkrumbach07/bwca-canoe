// The boys' rules (campaign stream b5, Round 5; docs/story/32-the-boys.md §5, §6, §11 "State"). The scenes are data
// (boys.js) played by topics.js; the places' own verbs and triggers are story-places.json's (boys.c1210, boys.frost).
// These are the patterns across them: Bob's trust, the Walt-page lines (in the player's words, as met: 32 §6), lock 3's
// yield, and NB55 understood by the slide matched. Every effect is a `when:` on facts and notebook marks, so a migrated
// or re-run save gets them. In story.js's data from its construction (all-rules.js), never added later (chk-coop C2).
//
// The informant's case (32 §5.10–§5.17: the canary, tells 2 and 3, the folder, the reveal) is stream i's; the pieces
// written here (case.denny.nicknames, case.denny.rochester) and the frames' lines are what it counts.
export const RULES_BOYS = [
  // 32 §3.1: Bob's trust opens on the round bought, Carol's favour done, or the laker bet fished (any one is enough)
  { id: 'b5.trust', when: 'f:boys.round | f:carol.paddle.shown | f:boys.bet', then: ['f:bob.trust'] },
  // --- the Walt page (32 §6; the doc's lines by their anchors) ----------------------------------------------------------
  { id: 'b5.tell1', when: 'f:denny.tell1', then: ['walt:w.b5.tell1'] },
  { id: 'b5.rings', when: 'f:denny.rings', then: ['walt:w.b5.rings'] },
  { id: 'b5.sparky', when: 'f:denny.sparky & !f:boys.nicknames', then: ['walt:w.b5.sparky'] },
  { id: 'b5.nicknames', when: 'f:boys.nicknames', then: ['walt:32:6.1'] },
  { id: 'b5.patch', when: 'f:frank.patch', then: ['walt:32:6.12'] },
  { id: 'b5.lot', when: 'f:frank.lot', then: ['walt:32:6.13'] },
  { id: 'b5.kek', when: 'f:frank.kek', then: ['walt:w.b5.kek'] },
  { id: 'b5.cleared', when: 'f:frank.cleared', then: ['walt:w.b5.frankguards', 'walt:w.b5.notfrank'] },
  { id: 'b5.rochester', when: 'f:bob.rochester', then: ['walt:32:6.9'] },
  { id: 'b5.walt2019', when: 'f:bob.walt2019', then: ['walt:32:6.10'] },
  // 5.9.6 the 1998 story (lock 3 key A: bob.eastbay | frank.eastbay, locks.js), and the far end's east bay once lock 2 is inked
  { id: 'b5.1998', when: 'f:boys.story1998', then: ['walt:w.b5.1998'] },
  { id: 'b5.1998matt', when: 'f:bob.matt98', then: ['walt:w.b5.1998matt'] },
  { id: 'b5.eastbay', when: 'f:boys.story1998 & f:ink.farend', then: ['walt:w.b5.eastbay'] },
  // 5.3 the slide taken; L3B the slide matched (minigames/silhouette.js: mg.silhouette.matched); NB55 understood (f's UND
  // row reads gene.slide.matched as well: und: is idempotent)
  { id: 'b5.slide', when: 'f:boys.slide', then: ['walt:w.b5.slide'] },
  { id: 'b5.match', when: 'f:mg.silhouette.matched & f:boys.slide', then: ['f:gene.slide.matched'] },
  { id: 'b5.matched', when: 'f:gene.slide.matched', then: ['walt:w.b5.match', 'und:NB55'] },
  // 5.9.8 the flare casing at Walt's rock, with the nickname's story known
  { id: 'b5.flare', when: 'f:boys.flare & (f:boys.nicknames | f:denny.sparky)', then: ['walt:w.b5.flare'] },
  { id: 'b5.pan', when: 'f:boys.pan', then: ['walt:w.b5.pan'] },
  // 32 §4 "Count toward the midpoint": the shore is the arc's big finding, once, from whichever of 3A or 3B lands first
  { id: 'b5.yield', when: 'f:key.L3A | f:key.L3B', then: ['f:door.boys.yield'] },
  // (10 §11.2's NB60 and NB64 are understood by notebook.js's UND rows, its b5: block)
];
