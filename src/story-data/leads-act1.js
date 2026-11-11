// Act I's leads, rings and nicknames (docs/build/campaign-design.md §4, §4.1; docs/story/20-opening.md §7, §11, §12;
// 10-notebook.md §2.1, §7, §11.2; 03-places.md). Stream P (Round 1). Read by leads.js and pencil.js; story-lint.mjs
// checks it (check 5: leads and inks).
//
//   LAKES  key → { name, x, z }       a lake by its name and a point on it (03-places.md), never by a baked id
//   PLACES key → { ep | store | lake | layer, x?, z?, r, label }   what a ring is drawn round
//          ep: the entry point's put-in · store: the outfitter's store · lake: the lake's own ring · layer: a
//          story-places.json id (stream L), with x/z as the fallback while the layer has no such place
//   LEADS  [{ id, born, subject: { place } | { person, where? }, ring: { by, ask, r }, walt, followed?, closes, after? }]
//          (§4: one Walt line, a topic, a ring only when a person draws it or the player pencils it)
//   ASKS   [{ id, choice, ask?, if, ring, lead?, then?, once, doc }]   the keepers' "could you ring …" topics: T's
//          topics.js offers leads.asks(ctx) and calls leads.ask(id, ctx); `choice` is the text id of the player's line
//          (src/story-data/text), `say` the keeper's (null where the doc's lines have no anchor yet: a K2 leftover).
//          A ring for a door's lead (guiding, boys, family, mining) also sets door.<arc>.ringed (20 §12.4)
//   INK    [{ nick, label, lake, nb, when, auto?, walt?, match? }]   bible 5.3.4: a pencilled nickname inks only when its
//          `when` holds (a keeper's ring on that lake, or presence plus a lock key: never `true`). `auto` inks without a
//          pencil (the far end, on entering Gull with an L2 key). `match` is what a keeper's ring on the lake gives (the
//          entry understood and the Walt line), pencil or not
//   LINES  id → { text, doc }         Walt-page lines the docs give in prose but the extract has no anchor for yet
//          (20 §7.1 Leads, §12.3 U5 Gives): the words are the doc's, copied; the K2 anchor pass replaces them

export const LAKES = {
  lakeone: { name: 'Lake One', x: -19840, z: 18418 },
  kek: { name: 'Kekekabic Lake', x: 2124, z: 2722 },
  littlesag: { name: 'Little Saganaga Lake', x: 15919, z: 6185 },
  fourtown: { name: 'Fourtown Lake', x: -43257, z: 1058 },
  baldeagle: { name: 'Bald Eagle Lake', x: -25071, z: 29412 },
  gabbro: { name: 'Gabbro Lake', x: -27857, z: 26210 },
  gull: { name: 'Gull Lake', x: -21414, z: 27033 },
};

export const PLACES = {
  ep33: { ep: 33, r: 260, label: 'Little Gabbro' },
  // wide enough to hold the crews' landing (−25825, 29925) without marking it (20 §7.3): ~500 m from the centre
  'baldeagle.west': { x: -25450, z: 29600, r: 850, label: 'Bald Eagle, west shore' },
  farm31: { store: 31, r: 260, label: 'Farm' },
  moose25: { store: 25, r: 260, label: 'Moose Lake' },
  sawbill38: { store: 38, r: 260, label: 'Sawbill' },
  lv12: { store: 12, r: 260, label: 'Little Vermilion' },
  'crews.landing': { layer: 'crews.landing', x: -25825, z: 29925, r: 120, label: 'the crews\' landing' },
  // a nickname's lake, rung by a keeper who knows the common name (20 §5.2)
  'lake.lakeone': { lake: 'lakeone', r: 900, label: 'Lake One' },
  'lake.kek': { lake: 'kek', r: 1400, label: 'Kekekabic' },
  'lake.littlesag': { lake: 'littlesag', r: 1300, label: 'Little Saganaga' },
  'lake.fourtown': { lake: 'fourtown', r: 1200, label: 'Fourtown' },
};

// (the join: every lead's Walt line is now the docs' own words by id: 20:11.2.w1, 20:7.1.lead.tauno, and T's U5 lines
// w.door.<arc> (walt-lines.js refs 20:U5.w.*), so a door's line is written once whoever writes it first. The easy
// nicknames other than the Front Porch have no Walt line in the docs: none is invented here, a writers' leftover)
export const LINES = {};

export const LEADS = [
  // T5: "Go look at the old crews' landing on Bald Eagle. West shore. Is the crib still there?" (taken or declined at
  // the door, the lead is on the Walt page in words either way: 20 §11.1). Tauno marks nothing; any keeper will.
  { id: 'crews', born: 'f:door.crews.taken | f:door.crews.declined', subject: { place: 'crews.landing' },
    ring: { by: null, ask: 'keeper:any', r: 850 }, walt: '20:11.2.w1',
    followed: 'near:crews.landing/300', closes: 'f:crews.seen', after: '20:11.2.w2' },
  // "I'm on the porch at Farm most mornings." (T5.6, X2.1): a person lead with its where. Born when he has said Farm (the
  // door, taken or declined: tauno.said.t5), and only once his name is said (20 §6.3: "Otherwise he stays 'the old man on
  // the porch' until 1.3"; the line names him): on the cold path the turn names him and U5's mining door says Farm
  { id: 'tauno', born: 'f:tauno.said.t5 & f:knows.tauno', subject: { person: 'tauno', where: { store: 31, hours: '6-11', words: 'mornings, on the porch at Farm' } },
    ring: { by: null, ask: 'keeper:any' }, walt: '20:7.1.lead.tauno', closes: 'f:tauno.turn' },
  // U5, the four doors (20 §12.3); each closes when its room opens (Round 2 on)
  { id: 'guiding', born: 'f:door.guiding.named', subject: { person: 'marlys', where: { store: 25, words: 'at Moose Lake, a couple of days a week' } },
    ring: { by: null, ask: 'keeper:any' }, walt: 'w.door.guiding', closes: 'f:door.guiding.open' },
  { id: 'boys', born: 'f:door.boys.named', subject: { place: 'sawbill38' },
    ring: { by: null, ask: 'keeper:any' }, walt: 'w.door.boys', closes: 'f:door.boys.open' },
  { id: 'family', born: 'f:door.family.named', subject: { person: 'aili', where: { store: 12, words: 'at Crane Lake, the motel next to the Little Vermilion store' } },
    ring: { by: null, ask: 'keeper:any' }, walt: 'w.door.family', closes: 'f:door.family.open' },
  { id: 'mining', born: 'f:door.mining.named', subject: { person: 'tauno', where: { store: 31, hours: '6-11', words: 'mornings, on the porch at Farm' } },
    ring: { by: null, ask: 'keeper:any' }, walt: 'w.door.mining', closes: 'f:door.mining.open' },
];

// the keepers' rings, asked for (20 §7.3, §12.4, §5.2). `if` is read with the counter's args ({ ep }); `once` per season.
export const ASKS = [
  { id: 'ring.ep33', choice: '20:7.3.c1', say: null, if: 'f:door.crews.taken | f:door.crews.declined', ring: 'ep33', lead: 'crews', once: true, doc: '20 §7.3' },
  { id: 'ring.baldeagle', choice: '20:7.3.c2', say: '20:7.3.1', if: 'ringed:ep33', ring: 'baldeagle.west', lead: 'crews', then: ['f:door.crews.ringed', 'walt:20:7.3.w1'], once: true, doc: '20 §7.3' },
  { id: 'ring.farm', choice: '20:7.3.c3', say: '20:7.3.2', if: '(f:tauno.porch.done | f:door.crews.declined | f:door.mining.named) & !ep:31', ring: 'farm31', lead: ['tauno', 'mining'], once: true, doc: '20 §7.3, §12.4' },
  { id: 'ring.moose', choice: '20:12.4.c1', say: '20:12.4.1', if: 'f:door.guiding.named', ring: 'moose25', lead: 'guiding', once: true, doc: '20 §12.4' },
  { id: 'ring.sawbill', choice: '20:12.4.c2', say: '20:12.4.3', if: 'f:door.boys.named', ring: 'sawbill38', lead: 'boys', once: true, doc: '20 §12.4' },
  { id: 'ring.lv', choice: '20:12.4.c3', say: '20:12.4.4', if: 'f:door.family.named', ring: 'lv12', lead: 'family', once: true, doc: '20 §12.4' },
  // the easy nicknames: any keeper knows the common name (20 §5.2): "If: that nickname is on the Walt page, unmatched"
  { id: 'nick.frontporch', choice: '20:5.2.c5', say: null, if: 'nickseen:frontporch & !und:NB01', ring: 'lake.lakeone', once: true, doc: '20 §5.2' },
  { id: 'nick.kek', choice: null, ask: 'Ever hear a lake called the Kek?', say: null, if: 'nickseen:kek & !und:NB29', ring: 'lake.kek', once: true, doc: '20 §5.2' },
  { id: 'nick.littlesag', choice: null, ask: 'Ever hear a lake called Little Sag?', say: null, if: 'nickseen:littlesag & !und:NB16', ring: 'lake.littlesag', once: true, doc: '20 §5.2' },
  { id: 'nick.fourtowns', choice: null, ask: 'Ever hear a lake called Four Towns?', say: null, if: 'nickseen:fourtowns & !und:NB22', ring: 'lake.fourtown', once: true, doc: '20 §5.2' },
];

// bible 5.3.4, 10 §2.1: the nicknames the pencil can ink. `seen` are the entries that show the nickname (a read of any
// puts it on the Walt page, unmatched; the cutscene's excerpts do the same through pencil.seeNick)
export const INK = [
  { nick: 'frontporch', label: 'the Front Porch', lake: 'lakeone', nb: 'NB01', seen: ['NB01', 'NB68'], when: 'ringon:lakeone | nbphoto:P3',
    match: { when: 'ringon:lakeone', then: ['und:NB01', 'walt:20:5.2.w2'] } },
  { nick: 'kek', label: 'the Kek', lake: 'kek', nb: 'NB29', seen: ['NB29', 'NB78'], when: 'ringon:kek | nbphoto:P9',
    match: { when: 'ringon:kek', then: ['und:NB29'] } },
  { nick: 'littlesag', label: 'Little Sag', lake: 'littlesag', nb: 'NB16', seen: ['NB16', 'NB07'], when: 'ringon:littlesag | nbphoto:P8',
    match: { when: 'ringon:littlesag', then: ['und:NB16'] } },
  { nick: 'fourtowns', label: 'Four Towns', lake: 'fourtown', nb: 'NB22', seen: ['NB22', 'NB26'], when: 'ringon:fourtown',
    match: { when: 'ringon:fourtown', then: ['und:NB22'] } },
  // decoded by Tauno (10 §7): the pencil inks once the entry is understood and the lake confirms it
  { nick: 'vwater', label: 'V.\'s water', lake: 'baldeagle', nb: 'NB20', seen: ['NB20', 'NB39'], when: 'und:NB20 & (ringon:baldeagle | onlake:baldeagle)' },
  { nick: 'twostump', label: 'Two Stump', lake: 'gabbro', nb: 'NB31', seen: ['NB31'], when: 'und:NB31 & (ringon:gabbro | onlake:gabbro)' },
  // the far end: nobody rings it; inked by the world only (lock 2), on Gull with any L2 key, pencil or not
  { nick: 'farend', label: 'the far end', lake: 'gull', nb: 'NB21', seen: ['NB21', 'NB27', 'NB32', 'NB39', 'NB46'], when: 'any(key.L2*) & onlake:gull', auto: true, walt: 'walt.nb.und.5' },
];
