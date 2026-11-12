// The mining years' rules (story Round 2, stream A2; docs/story/30-mining-years.md §4.2–§4.7). The scenes themselves are
// data (mining.js) played by topics.js; the places' own verbs and triggers are story-places.json's (westpads, kettle,
// pietro.dig, twostump). These are the patterns across them: the Walt-page lines that need two things held, and the
// wrong hill's key. Every effect is a `when:` on facts and notebook marks, so a migrated or re-run save gets them.
// In story.js's data from its construction (all-rules.js), never added later (chk-coop C2).
export const RULES_MINING = [
  // 30 §4.2 Len's "never right", paired once Denny's reveal is on the page too ("Same words.")
  { id: 'm.len.walt', when: 'f:said.len.walt & f:denny.revealed', then: ['walt:30:4.2/len-saari-first-meeting.w1'] },
  // 30 §4.2 "Elsie": "every day but Thursday", once Thursdays are known (Tauno's "Lunch with who?")
  { id: 'm.len.elsie', when: 'f:len.elsie & f:knows.thursday', then: ['walt:30:4.2/len-saari-first-meeting.w4'] },
  // 30 §4.6 / owner call 4: the two men at the Thursday table, seen (the cast writes brekke.seen)
  { id: 'm.thursday', when: 'f:brekke.seen', then: ['walt:30:4.6/the-thursday-lunch-tier.w1'] },
  // 30 §4.3 the Kettle hollow stood in: the west pads seen (L1C) as well (the place's enter trigger writes both; this
  // holds a save that has only one)
  { id: 'm.kettle.pads', when: 'f:kettle.visited', then: ['f:westpads.seen'] },
  // 30 §4.3: the notice taken rings the pad (if it isn't rung already: pencil.js's second voice)
  { id: 'm.notice.ring', when: 'f:kettle.notice', then: ['ring:kettle'] },
  // 30 §4.7 the wrong hill, by what the player holds: the crew map; NB70 (the back door); both (lock 2 key C)
  { id: 'm.pietro.map', when: 'f:pietro.dig.seen & (f:door.mining.yield | f:maggie.e7copy)', then: ['walt:30:4.7.w.1'] },
  { id: 'm.pietro.nb70', when: 'f:pietro.dig.seen & read:NB70', then: ['walt:30:4.7.w.2.2', 'f:knows.backdoor'] },
  { id: 'm.pietro.both', when: 'f:pietro.dig.seen & (f:door.mining.yield | f:maggie.e7copy) & read:NB70', then: ['f:pietro.wronghill', 'walt:30:4.7.w.3'] },
];
