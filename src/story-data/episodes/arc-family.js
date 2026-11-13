// The family arc as a record on the episodes runner (campaign-design §10.1–10.2 "Arcs on the same runner"; campaign
// Round 6, stream a4; docs/story/33-family.md). `kind: 'arc'`, `slot: false` (no slots: Part 3 #4); the climax (the can
// on the porch: door.family.climax, choice.aili) for the director's spacing; the yield (the landing sign: aili.stone
// writes door.family.yield). The scenes are story-data/family.js, the patterns rules-family.js: no steps of its own.
//
// The arc's yes: the first meeting at Aili's counter (door.family.open, 33 §6.2 "The family arc has started"), the thing
// done at its place. Tauno's naming of her door (20 U5) and the keeper's ring are person and rumour doors (no yes).
export default {
  id: 'family', kind: 'arc', title: 'Aili\'s coffee', slot: false,
  region: { eps: [12] },
  cast: ['aili', 'jon', 'liisa', 'gord'],
  doors: [
    { kind: 'person', who: 'aili', at: 'store:12' },
    { kind: 'place', yes: true, when: 'f:door.family.open', at: 'store:12' },
  ],
  steps: [],
  page: [],
  ends: [{ id: 'done', when: 'f:door.family.done' }],
  first: null,
  feeds: [],
  climax: { door: 'door.family.climax', choice: 'choice.aili' },
  yield: 'door.family.yield',
  // the facts the endings read (33 §9): her choice, the stone, Jon won, the cards seen, June's pot on the counter
  leaves: ['choice.aili', 'aili.stone', 'jon.won', 'cards.seen', 'aili.pot', 'aili.sat'],
};
