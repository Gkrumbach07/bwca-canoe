// The far end's rules (story Round 3, stream F; docs/story/50-finale.md §2–§5, 10-notebook.md §11.2). The places' own
// verbs and triggers are story-places.json's (gull.sign, gull.burntpoint, pond4747.eastbank, waltcamp, cellar, stash.*);
// what the dot rests on is farend.js's SEEN. These are the patterns across them: which lock-4 keys make the stone
// understood (50 §2.4's table), the landing's inking, the Walt page's lines that need two things held. Every effect is
// a `when:` on facts and notebook marks, so a migrated or re-run save gets them. In story.js's data from its
// construction (all-rules.js), never added later (chk-coop C2).
export const RULES_FAREND = [
  // 50 §2.4: "the stone understood" is lock 4's A, B, D, or E (N28 read and the Pietro paddle-stone seen); C (fall low
  // water) counts for the landing only, never for the floorboard
  { id: 'f.stonesign', when: 'f:key.L4A | f:key.L4B | f:key.L4D | f:key.L4E', then: ['f:knows.stonesign'] },
  // 50 §6.9 / 10 NB66: the spare paddle's white stone seen with N28 (NB66) read is lock 4's key E
  { id: 'f.paddlestash', when: 'f:stash.paddle.found & read:NB66', then: ['f:nb.paddlestash', 'walt:50:6.7.w.paddle'] },
  // 50 §2.4: the far end inks at the dam with any key that counts for the landing, pencilled or not (C: in fall only;
  // gull.stump.lowwater is written only at low water)
  { id: 'f.dam.ink', when: 'f:gull.dam & (f:knows.stonesign | f:gull.stump.lowwater)', then: ['f:ink.farend'] },
  // 50 §2.4 the Walt page, once each, the first time each is true
  { id: 'f.eastbay', when: 'f:gull.eastbay & any(key.L2*)', then: ['walt:50:2.4.1'] },
  { id: 'f.dam.stone', when: 'f:gull.stone.seen & f:knows.stonesign', then: ['walt:50:2.4.2'] },
  { id: 'f.dam.rod', when: 'f:gull.rod.seen & f:tauno.drilled', then: ['walt:50:2.4.3'] },
  { id: 'f.dam.paddle', when: 'f:gull.dam & f:stash.paddle.found', then: ['walt:50:2.4.4'] },
  // 50 §3.1: the orange dabs read as blazes only to someone Tauno has told
  { id: 'f.blazes', when: 'f:ev.blazes & f:tauno.blazes', then: ['walt:50:3.1.w.blaze'] },
  // §7.2 / 50 §3.1: the carry walked to the camp: N21 (NB54) understood, lock 5's key A; the camp reached inks the far end
  { id: 'f.longway', when: 'f:camp.found & f:gull.dam', then: ['f:nb.longway'] },
  { id: 'f.camp.ink', when: 'f:camp.found', then: ['f:ink.farend'] },
  // 50 §4.3 the core boxes: this knob is E-7 (a lock-2 and lock-6 bridge)
  { id: 'f.corebox', when: 'f:camp.corebox', then: ['f:knows.e7', 'walt:50:4.3.w.corebox'] },
  // 50 §4.4: after the three torn pages are read (they slot into their stubs at the lift: the book has them at once; the
  // summary waits an hour of the clock, so it reads as a thought after them, not with the floorboard's line)
  { id: 'f.pages', when: 'f:nb.torn', after: { hours: 1 }, then: ['walt:50:4.4.w.pages'] },
  // 50 §4.6: the tally; the second sentence only with N25 and N26 (NB61, NB62) read
  { id: 'f.tally', when: 'f:camp.marks & read:NB61 & read:NB62', then: ['walt:50:4.6.w.tally'] },
  { id: 'f.tally2', when: 'f:camp.marks & !(read:NB61 & read:NB62)', then: ['walt:50:4.6.w.tally2'] },
  // 50 §5.2: the pit is only ground to someone without a lock-6 key; with one, the dot names it once
  { id: 'f.pit.seen', when: 'f:pit.seen & any(key.L6*)', then: ['f:pit.known'] },
];
