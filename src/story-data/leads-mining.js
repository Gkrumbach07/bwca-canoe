// The mining years' leads, rings and nickname (story Round 2, stream A2; docs/story/30-mining-years.md §4.1, §4.3, §4.7;
// 10-notebook.md §7). The shapes are leads-act1.js's; leads.js merges these into its tables (its // a2: block), so
// pencil.js and the keepers see them too. story-lint.mjs checks every leads-*.js (check 5).
//
//   LAKES  pietro (the back door's lake)
//   PLACES kettle, westpads, grade, crewscountry (rings drawn round them; `layer` places are story-places.json's)
//   LEADS  pads: Tauno's "The pads" (30 §4.1). Its Walt line is his own words (30:4.1.30, walt-lines.js w.lead.pads):
//          the doc gives no Walt-page line for it (a writers' leftover), so the lead's subject is what he said
//   ASKS   the Farm keeper's rings (30 §4.1): "the old crews' country" after "Where, exactly?"; "the old grade" and "the
//          west pads" after "The pads". The player's question has no words in the docs: `ask` is the place's own name,
//          as Round 1's easy nicknames are (a writers' leftover)
//   INK    the back door = Pietro (30 §4.7, bible 5.3.4): pencilled and inked once the dig is seen and NB70 read, on Pietro
export const LAKES = {
  pietro: { name: 'Pietro Lake', x: -22437, z: 26032 },
};

export const PLACES = {
  kettle: { layer: 'kettle', x: -26950, z: 30600, r: 360, label: 'the Kettle pad' },
  westpads: { layer: 'westpads', x: -26300, z: 30260, r: 520, label: 'the west pads' },
  grade: { layer: 'westpads', x: -25960, z: 30060, r: 220, label: 'the old grade' },
  crewscountry: { x: -26600, z: 28400, r: 2600, label: 'the old crews\' country' },
};

export const LINES = {};

export const LEADS = [
  // "Go after a rain. Two days of it. Then tell me if the creek still runs orange." Followed near the pad; closed by the
  // hollow stood in (kettle.visited), rain or none (30 §4.3: nothing in the funnel waits on the weather)
  { id: 'pads', born: 'f:tauno.said.pads', subject: { place: 'kettle' }, ring: { by: null, ask: 'keeper:31' }, walt: 'w.lead.pads',
    followed: 'near:kettle/450', closes: 'f:kettle.visited' },
];

export const ASKS = [
  { id: 'ring.crewscountry', choice: null, ask: 'The old crews\' country?', say: null, if: 'f:tauno.drilled & ep:31', ring: 'crewscountry', once: true, doc: '30 §4.1 "Where, exactly?"' },
  { id: 'ring.grade', choice: null, ask: 'The old grade?', say: null, if: 'f:tauno.said.pads & ep:31', ring: 'grade', lead: 'pads', once: true, doc: '30 §4.1 "The pads"' },
  { id: 'ring.westpads', choice: null, ask: 'The west pads?', say: null, if: 'f:tauno.said.pads & ep:31', ring: 'westpads', lead: 'pads', once: true, doc: '30 §4.1 "The pads"' },
];

export const INK = [
  { nick: 'backdoor', label: 'the back door', lake: 'pietro', nb: 'NB70', seen: ['NB66', 'NB68', 'NB70', 'NB73'], when: 'f:pietro.dig.seen & read:NB70 & (onlake:pietro | ringon:pietro)' },
];
