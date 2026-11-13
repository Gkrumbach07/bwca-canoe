// The family arc's leads and rings (campaign Round 6, stream a4; docs/story/33-family.md §6.7–§6.9; the re-sites of
// docs/story/dlc-quetico.md). The shapes are leads-act1.js's; leads.js merges these (its a4 block).
//
//   LAKES  sandpoint, carp (rings drawn on them)
//   PLACES carp (Danielle's "the Carp end": the stump and her cairn, the US end of Carp Portage)
//   LEADS  monday: Liisa's "Come back Monday." (followed at the Little Vermilion store; closed by the can)
export const LAKES = {
  sandpoint: { name: 'Sand Point Lake', x: -94423, z: -31191 },
  carp: { name: 'Carp Lake', x: -9500, z: 1500 },
};
export const PLACES = {
  carp: { layer: 'a4.carp', x: -10054, z: 2049, r: 160, label: 'the Carp end' },
};
export const LINES = {};
export const LEADS = [
  { id: 'monday', born: 'f:liisa.monday', subject: { person: 'liisa', where: { store: 12, words: 'at the Little Vermilion counter, on a Monday' } }, ring: { by: null, ask: 'keeper:12' }, walt: '33:6.9.w.1',
    followed: 'ep:12', closes: 'f:cards.seen' },
];
export const ASKS = [];
export const INK = [];
