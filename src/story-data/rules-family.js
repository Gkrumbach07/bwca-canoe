// The family arc's rules (campaign Round 6, stream a4; docs/story/33-family.md §5, §6.7, §6.9, §8). The scenes are data
// (family.js) played by topics.js through family-cast.js; these are the patterns across them. In story.js's data from its
// construction (all-rules.js), never added later (chk-coop C2).
export const RULES_FAMILY = [
  // 33 §5 Aili's door, step 1 "Sit": two days of visits, or one visit carrying his tent (family-cast.js writes aili.day2
  // on a second day's visit; the first meeting carrying the bundle writes aili.tent)
  { id: 'a4.sit', when: 'f:aili.met & (f:aili.tent | f:aili.day2)', then: ['f:aili.sit', 'ppl:aili.trust=1'] },
  { id: 'a4.stone', when: 'f:aili.stone', then: ['ppl:aili.trust=2'] },
  // 33 §8 tiers: asking Aili about Walt is one of tier 1's places (as asking Len is, Round 0's rule); the arc started is
  // tier 2's trigger (rules-core.js tier2 reads door.family.open)
  { id: 'a4.tier1', when: 'f:asked.aili.walt', then: ['f:tier.1'] },
  // 33 §6.7 the chase happened (any way it went): the Walt line waits for the denial (the scene's); the second boat
  // photographed is kept for it (jon.second)
  // 33 §6.9 the cards: lock 4 key D and a "went north" piece are the can's (family.js LIISA can)
  // 33 §8 "To the other arcs": the guiding years' box and the guest book (Marlys met after the book)
  { id: 'a4.guiding', when: 'f:aili.guestbook & (f:door.guiding.done | f:marlys.met)', then: ['walt:33:8.guiding'] },
  // the Carp end of Carp Portage (re-sited; docs/story/dlc-quetico.md): the stump and the cairn looked at
  { id: 'a4.carp', when: 'f:carp.stump & f:carp.stone', then: ['walt:a4:w.carp'] },
  // the arc done when the porch is: the climax is the arc's end (episodes.js ends)
];
