// Round 7 stream 7b's talk (docs/story/60-side-stories.md S5, S6): the scenes of the two people the stream stages, the
// keepers' topics, and the topics for people other streams own (the join pushes them into those trees, as sides-s.js's
// HAP_S8 does). Every line is the doc's by id (side.json) or a build draft (drafted.json, 95-drafted-lines.md "Stream
// 7b"). Node only: feed-side7b.js plays the scenes through topics.js's SceneRun.
//
//   PETE         Pete Haldane at the Round Lake 51 counter (60 S5 "Conversations": Pete; "Pete, with the case")
//   ORRIN        Orrin Gilbertson at the Little Vermilion 12 counter (60 S6 "Conversations": Orrin; "The choice")
//   KEEPER_7B    keeper topics (topics.add): Arvid at 51 on where the plane is, René at 12 ("Heard anything?", the society)
//   HAP_S5       Hap's S5 topics, for stream a3's Hap (31): the join does HAP_HUB.push(...HAP_S5)
//   AILI_S6      Aili's lines after the ledger and the print, for the family's Aili (33, stream a4)
//   GORD_S6      Gord's line on bootleggers (33; Gord is re-sited to the US side by a4)

const HAS_CASE = 'f:ep.S5.case & !f:ep.S5.given & !f:ep.S5.kept';
const HAS_LEDGER = 'f:nb.page.ledger1928 & !f:ep.S6.sold & !f:ep.S6.society';

export const PETE = { id: 'pete', who: 'pete', nodes: {
  open: { say: [{ first: [{ id: 'S5.conv.11', when: HAS_CASE }, { id: 'S5.conv.1' }] }], then: ['f:pete.met'],
    go: [
      { ask: 'S5.conv.c6', when: HAS_CASE, say: ['S5.conv.12', 'S5.conv.13'], then: ['f:ep.S5.given', 'do:given'], end: true },
      { ask: 'S5.conv.c7', when: HAS_CASE, say: ['S5.conv.14', 'S5.conv.15'], to: 'photo' },
      { ask: 'S5.conv.c1', once: 'plane', say: ['S5.conv.2', 'S5.conv.3'], then: ['do:yes'] },
      { ask: 'S5.conv.c2', once: 'where', say: ['S5.conv.4'] },
      { ask: 'S5.conv.c3', once: 'why', say: ['S5.conv.5', 'S5.conv.6'] },
      { ask: 'S5.conv.c4', once: 'first', say: ['S5.conv.7'], then: ['do:yes'] },
      // (needs: N11 read; or the keeper's rumour)
      { ask: 'S5.conv.c5', once: 'north', when: '(read:NB29 | f:asked.walt.7b.kekwhere) & !f:s5.pete.found & !f:ep.S5.case', to: 'tell' },
    ] },
  tell: { go: [
    { ask: 'd95.7b.S5.c.tell', say: ['S5.conv.8', 'S5.conv.9'], then: ['f:ep.S5.told', 'do:yes'], to: 'more' },
    { ask: 'd95.7b.S5.c.keep', then: ['do:yes'], to: 'more' },
  ] },
  more: { go: [], hub: 'open' },
  photo: { go: [
    { ask: 'S5.conv.c8', say: ['S5.conv.16'], then: ['f:ep.S5.photo', 'f:ep.S5.kept'], end: true },
    { ask: 'S5.conv.c9', say: ['S5.conv.17'], then: ['f:ep.S5.kept'], end: true },
  ] },
} };

export const ORRIN = { id: 'orrin', who: 'orrin', nodes: {
  open: { say: [{ first: [{ id: 'S6.conv.10', when: HAS_LEDGER }, { id: 'S6.society.3', when: 'f:ep.S6.society & !f:orrin.said.glass' }, { id: 'S6.conv.1' }] }],
    then: ['f:orrin.met', { when: 'f:ep.S6.society', then: ['f:orrin.said.glass'] }],
    go: [
      { ask: 'd95.7b.S6.c.sell', when: HAS_LEDGER, say: ['S6.sell.1'], then: ['f:ep.S6.sold', 'do:sold'] },
      { ask: 'S6.conv.c8', when: HAS_LEDGER, once: 'do', say: ['S6.conv.11'] },
      { ask: 'd95.7b.S6.c.bottle', when: 'f:s6.bottle & !f:ep.S6.bottle.sold', say: ['S6.sell.2'], then: ['f:ep.S6.bottle.sold', 'do:bottle'] },
      { ask: 'S6.conv.c1', once: 'collect', say: ['S6.conv.2'] },
      // (needs: the story from Aili or René, or N08)
      { ask: 'S6.conv.c2', once: 'road', when: 'f:s6.story | read:NB23', say: ['S6.conv.3', 'S6.conv.4'], to: 'name' },
      { ask: 'S6.conv.c5', once: 'why', say: ['S6.conv.7'] },
      { ask: 'S6.conv.c6', once: 'mining', when: 'f:nb.found', say: ['S6.conv.8'] },
      { ask: 'S6.conv.c7', once: 'pay', when: '!f:nb.page.ledger1928', say: ['S6.conv.9'] },
    ] },
  // "You know what they call that lake now?": the ring on Bootleg either way
  name: { go: [
    { ask: 'S6.conv.c3', say: ['S6.conv.5'], then: ['f:s6.route', 'do:ring', 'do:yes'], to: 'more' },
    { ask: 'S6.conv.c4', say: ['S6.conv.6'], then: ['f:s6.route', 'do:ring', 'do:yes'], to: 'more' },
  ] },
  more: { go: [], hub: 'open' },
} };

// keeper topics (topics.js add: the shape of topics-act1.js)
export const KEEPER_7B = [
  // 60 S5 "How it starts": the Round Lake keeper's own extra, for players who ask where (Pete met)
  { id: '7b.kekwhere', pri: 3.7, once: true, ask: 'S5.conv.c2', when: 'ep:51 & f:pete.met & !f:s5.pete.found', say: 'S5.rumour.2' },
  // 60 S6 "How it starts": René at the counter, "Heard anything?"
  { id: '7b.rene', pri: 3.7, once: true, ask: 'S6.rene.1', when: 'ep:12 & !f:ep.S6.end', say: 'S6.rene.2', then: ['f:s6.story'] },
  // 60 S6 "The choice": the ledger to the historical society, through René
  { id: '7b.society', pri: 4.6, once: true, ask: 'd95.7b.S6.c.society', when: `ep:12 & ${HAS_LEDGER}`, say: 'S6.society.1', then: ['f:ep.S6.society'] },
];

// stream a3's Hap (31 HAP_HUB), weekends on the Moose Lake 25 porch (60 S5 "Hap")
export const HAP_S5 = [
  { ask: 'S5.conv.c10', once: 's5.plane', say: ['S5.conv.18', 'S5.conv.19'], to: 's5colour' },
  { ask: 'S5.conv.c13', once: 's5.where', when: 'f:hap.said.s5.plane', say: ['S5.conv.22'] },
  // (needs: N11 read, Hap's trust from the guiding arc)
  { ask: 'S5.conv.c14', once: 's5.walt', when: 'read:NB29 & f:hap.day', say: ['S5.conv.23', 'S5.conv.24'] },
];
// its follow-up node (the join adds it to HAP.nodes): "What colour was it?" / "Red and cream."
export const HAP_S5_NODES = {
  s5colour: { go: [
    { ask: 'S5.conv.c11', once: 's5.colour', say: ['S5.conv.20'], to: 's5colour' },
    { ask: 'S5.conv.c12', once: 's5.red', when: 'f:hap.said.s5.colour', say: ['S5.conv.21'] },
  ], hub: 'hub' },
};
// the family's Aili (33, stream a4): after the ledger (shown, or a print of its page), the print of N.N. 1928, the bottle
export const AILI_S6 = [
  { ask: null, show: 'page:ledger1928', when: 'f:s6.ledger', once: 's6.ledger', say: ['S6.conv.12', 'S6.conv.13'] },
  { ask: null, print: 's6.nn', once: 's6.nn', say: ['S6.conv.14'] },
  { ask: null, show: 'rye1928', once: 's6.rye', say: ['S6.conv.16'] },
];
export const GORD_S6 = [{ ask: null, once: 's6.rye', when: 'f:s6.story | f:s6.ledger', say: ['S6.conv.15'] }];
