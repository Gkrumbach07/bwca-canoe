// S6 · The whiskey road (docs/story/60-side-stories.md S6; campaign-design Part 4 Round 7, 7B). Orrin Gilbertson at
// Little Vermilion 12 (cabin four of Aili's motel: he takes his coffee at the store's counter, afternoons, ice-out to
// freeze-up); René's "Heard anything?" at the counter; the carving N.N. 1928 at the Loon Lake end of the Beatty's foot
// trail (s6.beatty); the cut line of healed blazes from Bootleg's quiet shore inland past a beaver pond to the pit
// (s6.bootleg). The pit (f's pit look: the square slump, bunchberry in a square, planks under moss): Clear the moss once
// the player knows something is here (Orrin's route, N08 read at the pond), then each plank in turn, Pull (the
// minigame's bookkeeping, minigames/pitopen.js; the layer's verbs). The crate: broken amber glass, three bottles (one
// full, seal on: item rye1928), the oilcloth packet (page:ledger1928). From then on the dot reads an old pit anywhere
// (ep.S6.done: lock 6 key C, the cellar's moss "A square slump. Somebody dug here and covered it."). The choice:
// Orrin ($250; the bottle $40), the historical society through René (the card by his till), or keep it. Orrin leaves at
// freeze-up; a story started and the pit not opened: next spring a stranger has dug it (s6.dug).
export default {
  id: 'S6', kind: 'side', title: 'The whiskey road', slot: false, region: { eps: [12, 9] },
  window: { months: '5-11', reopen: 'yearly' },
  cast: ['orrin'],
  doors: [
    { kind: 'person', who: 'orrin' },                        // the coffee counter: meeting him starts nothing
    { kind: 'choice', yes: true },                           // "The whiskey road." (his route told)
    { kind: 'rumour', line: 'S6.rene.2' },                   // René, "Heard anything?"
    { kind: 'entry', nb: 'NB23' },                           // N08 read anywhere: Bootleg, the beaver pond
    { kind: 'entry', nb: 'NB23', yes: true },                // N08 read at the pond
    { kind: 'place', yes: true, when: 'f:s6.moss' },         // the moss cleared at the pit
  ],
  started: 'f:ep.S6.yes',
  places: ['s6.bootleg', 's6.beatty'],
  orrin: { ep: 12, when: 'hour:13-18' },
  photo: [{ id: 's6.nn', props: ['s6.carving'], d: 10, deg: 35 }],
  pins: ['s6.nn'],
  steps: [
    { when: 'f:s6.plank.1 & f:s6.plank.2 & f:s6.plank.4 & f:s6.plank.5', then: ['f:ep.S6.done'] }, // (plank 3 fell in long ago: the gap)
    { when: 'f:s6.ledger', then: ['f:ep.S6.ledger'] },
    { when: 'f:ep.S6.sold', then: ['pay:250@d95.7b.S6.pay.sell'] },
    { when: 'f:ep.S6.bottle.sold', then: ['pay:40@d95.7b.S6.pay.bottle'] },
  ],
  ends: [
    { id: 'sold', when: 'f:ep.S6.sold', line: 'd95.7b.S6.end.sold' },
    { id: 'society', when: 'f:ep.S6.society', line: 'd95.7b.S6.end.society' },
    { id: 'kept', when: 'f:ep.S6.shut & f:ep.S6.ledger', line: 'd95.7b.S6.end.kept' },
    { id: 'without', when: 'f:ep.S6.shut & !f:ep.S6.ledger', line: 'S6.without' },
  ],
  page: [
    { when: 'f:orrin.met', text: 'd95.7b.S6.page.orrin' },
    { when: 'f:s6.route', text: 'd95.7b.S6.page.route' },
    { when: 'read:NB23', text: 'd95.7b.S6.page.walt' },
    { when: 'f:s6.carving', text: 'd95.7b.S6.page.carving' },
    { when: 'f:s6.blazes', text: 'd95.7b.S6.page.blazes' },
    { when: 'f:ep.S6.done', text: 'd95.7b.S6.page.pit' },
  ],
  titles: [{ when: 'true', title: 'The whiskey road' }],
  // (the first, "Found a bootlegger's pit.", is stamped as the last plank comes out: feed-side7b.js, S6.first)
  feeds: ['ep.S6.done'],
  climax: null,
};
