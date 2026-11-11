// Act I's story topics on the keepers (stream T; docs/story/20-opening.md §5.2 the return, §7.3 the first rings, §12.4
// the doors' rings; 70-world-texture.md §8 the keepers on Walt). The shape is topics.js's:
//   { id, ask (a text id), when, once?, top? (in gold at the top, not under "Ask about…"), pri?,
//     byKeeper? (the keeper's own 70 §8 line on this topic label, and its "Go on"), manner? [6 ids in MANNERS order],
//     at? { ep: id } (said at that store instead), say? id, josie? id (her line after, at home), extra? [{ when, id }],
//     then? [action], ring? target, lead?, label?, ringFact?, pri? ("Ask about…" shows three story topics, the newest
//     part of the story first: the return 3, the keepers' own 3.4–3.8, the first rings 4–4.4, the doors 5) }
// A ring target is { ep } (a landing), { lake: name } or { x, z, r }. Node only.
const LG = ['20:7.3.lg.1', '20:7.3.lg.2', '20:7.3.lg.3', '20:7.3.lg.4', '20:7.3.lg.5', '20:7.3.lg.6'];
const GEAR = ['20:5.2.8', '20:5.2.9', '20:5.2.10', '20:5.2.11', '20:5.2.12', '20:5.2.13'];

// the easy nicknames any keeper knows (bible 5.3.4; 20 §5.2): on the Walt page unmatched (stream B writes
// nickseen:<id>, stream P's sensor: the page shows it), not yet inked (stream P's ink.<id>)
export const NICKS = [
  { id: 'frontporch', place: 'lake.lakeone', name: 'the Front Porch', lake: 'Lake One', say: '70.5.3.14', walt: '20:5.2.w2' },
  { id: 'kek', place: 'lake.kek', name: 'the Kek', lake: 'Kekekabic Lake', say: '70.5.3.15' },
  { id: 'littlesag', place: 'lake.littlesag', name: 'Little Sag', lake: 'Little Saganaga Lake', say: '70.5.3.17' },
  { id: 'fourtowns', place: 'lake.fourtown', name: 'Four Towns', lake: 'Fourtown Lake', say: '70.5.3.16' },
];

export const KEEPER_TOPICS = [
  // --- 5.2 the return: the front desk knows nothing ------------------------------------------------------------------
  { id: 'gear', top: true, once: true, ask: '20:5.2.c1', when: 'f:nb.found', byKeeper: 'Whose gear?', manner: GEAR, josie: '20:5.2.14',
    then: ['walt:20:5.2.w1', 'f:walt.gear={ep}'] },
  { id: 'brm14', pri: 3, once: true, ask: '20:5.2.c3', when: 'f:nb.found & !f:knows.boreal', say: '20:5.2.15', josie: '20:5.2.16' },
  { id: 'backroom', pri: 3, once: true, ask: '20:5.2.c4', when: 'f:nb.found', say: '20:5.2.17' },
  { id: 'bunkhouse', pri: 3.1, once: true, ask: '20:5.2.c6', when: 'f:nb.found & read:NB88 & ep:25', say: '20:5.2.18', then: ['walt:20:5.2.w3'] },
  ...NICKS.map((n) => ({ id: `nick.${n.id}`, pri: 3.2, once: true, ask: n.id === 'frontporch' ? '20:5.2.c5' : { from: '20:5.2.c5', swap: ['the Front Porch', n.name] },
    when: `f:nb.found & nickseen:${n.id} & !f:ink.${n.id}`, say: n.say, ring: { lake: n.lake, place: n.place }, label: n.lake, ringFact: `ring.${n.id}`,
    then: n.walt ? [`walt:${n.walt}`] : [] })),
  // --- 70 §8: the keepers' own topics (Did you know Walt? opens at S2; Who's been asking? at t1) --------------------
  { id: 'knewwalt', pri: 3.4, once: true, label: 'Did you know Walt?', when: 'stage>=S2', byKeeper: 'Did you know Walt?' },
  { id: 'asking', pri: 3.6, once: true, label: 'Who’s been asking?', when: 'tier>=1', byKeeper: 'Who\'s been asking?' },
  // --- 7.3 the first rings (after the porch: the lead is on the Walt page) ------------------------------------------
  { id: 'lg', pri: 4.2, once: true, ask: '20:7.3.c1', when: 'f:door.crews.taken | f:door.crews.declined', manner: LG,
    extra: [{ when: 'homefarm', id: '20:7.3.farm' }, { when: '!homefarm', id: '20:7.3.drive' }],
    ring: { ep: 33, place: 'ep33' }, label: 'Little Gabbro', lead: 'crews', ringFact: 'ring.lg' },
  { id: 'bewest', pri: 4.4, once: true, ask: '20:7.3.c2', when: 'f:ring.lg', say: '20:7.3.1',
    // wide enough to hold the crews' landing (−25825, 29925) without marking it (20 §7.3)
    ring: { x: -25520, z: 29790, r: 650, place: 'baldeagle.west' }, label: 'Bald Eagle, west shore', lead: 'crews', ringFact: 'ring.bewest', then: ['walt:20:7.3.w1'] },
  { id: 'farm', pri: 4, once: true, ask: '20:7.3.c3', when: '(f:tauno.said.t5 | f:door.crews.declined) & !ep:31 & !f:ring.farm', say: '20:7.3.2',
    ring: { ep: 31, place: 'farm31' }, label: 'Farm Lake', ringFact: 'ring.farm' },
  { id: 'oldman', pri: 3.8, once: true, ask: '20:7.3.c4', when: 'f:tauno.porch.done | f:tauno.porch.declined1', at: { 31: '20:7.3.3' }, say: '20:7.3.4' },
  // --- 12.4 the doors' rings (after the turn, while the door is named) ----------------------------------------------
  { id: 'moose', pri: 5, once: true, ask: '20:12.4.c1', when: 'f:door.guiding.named & !f:door.guiding.ringed', at: { 25: '20:12.4.2' }, say: '20:12.4.1',
    ring: { ep: 25, place: 'moose25' }, ringWhen: '!ep:25', label: 'Moose Lake', then: ['f:door.guiding.ringed'] },
  { id: 'sawbill', pri: 5, once: true, ask: '20:12.4.c2', when: 'f:door.boys.named & !f:door.boys.ringed', say: '20:12.4.3',
    ring: { ep: 38, place: 'sawbill38' }, ringWhen: '!ep:38', label: 'Sawbill', then: ['f:door.boys.ringed'] },
  { id: 'aili', pri: 5, once: true, ask: '20:12.4.c3', when: 'f:door.family.named & !f:door.family.ringed', say: '20:12.4.4',
    ring: { ep: 12, place: 'lv12' }, ringWhen: '!ep:12', label: 'Little Vermilion', then: ['f:door.family.ringed'] },
  { id: 'farm2', pri: 4.9, once: true, ask: '20:12.4.c4', when: 'f:door.mining.named & !f:ring.farm & !ep:31', say: '20:7.3.2',
    ring: { ep: 31, place: 'farm31' }, label: 'Farm Lake', ringFact: 'ring.farm', then: ['f:door.mining.ringed'] },
];

// "Who'd know about Walt?" (campaign-design §5.1, the floor): every keeper, once the notebook is found, names the
// person of the least-advanced unsolved lock in the doc's own words; player-pulled, so never spent
export const FLOOR = {
  label: 'Who’d know about Walt?', when: 'f:nb.found',
  answers: [
    { when: '!f:tauno.porch.done & !f:tauno.porch.declined1', say: '20:0.1' },
    { when: '!f:tauno.turn', at: { 31: '20:7.3.3' }, say: '20:7.3.4' },
    { when: '!f:door.guiding.open', at: { 25: '20:12.4.2' }, say: '20:12.4.1' },
    { when: '!f:door.boys.open', say: '20:12.4.3' },
    { when: '!f:door.family.open', say: '20:12.4.4' },
    { say: '20:7.3.3' },
  ],
};
