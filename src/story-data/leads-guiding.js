// The guiding years' leads, rings and nicknames (story Round 4, stream A3; docs/story/31-guiding-years.md GY-02, GY-04,
// GY-06, GY-06c, GY-08, GY-09b; 10-notebook.md §7). The shapes are leads-act1.js's; leads.js merges these into its
// tables (its // a3: line), so pencil.js and the keepers see them too. story-lint.mjs checks every leads-*.js (check 5).
//
//   LAKES  insula (the Kitchen), ottertrack (the Long Room), moose (the Front Room), birch, inletbay (Hap's day)
//   PLACES Hap's day's five rings (the dock, the tow landing at Prairie's Sucker end, the Inlet Bay shore, the reef, the
//          lunch rock), the far end's two lakes Gus rings (Little Gabbro, Bald Eagle: never Gull or Pietro, GY-06), the
//          Stuart Portage (Ollie, S1), the nickname lakes. Positions: lake-facts.json lon/lat through the bake's projection
//          (Insula, Ottertrack, Sucker, Birch); P194's ends from names-portages.json; the reef and the lunch rock are
//          picked on Inlet Bay's US side (31 §13 check 2: to confirm against v9's depth and shore, scripts/story-places.mjs)
//   LEADS  rick ("Ricky took a picture.", GY-04); the far end (Hap's, GY-06: Little Gabbro, across Bald Eagle); Ollie
//          (Sheila's "Ollie walks the Stuart Portage", GY-09b); aili (the lilacs, GY-05d in June)
//   ASKS   Gus's rings (GY-04 "Hap's day? Everybody gets Hap's day.", GY-06 "Little Gabbro? Bald Eagle?…", GY-06c "Hap says
//          Insula? Then it's Insula."); the player's question is the doc's own words where it has them, else the place's
//          own name (a writers' leftover, as A2's)
//   INK    the Front Room = Moose Lake (Marlys, GY-02), the Kitchen = Insula and the Long Room = Ottertrack (Hap, GY-06c):
//          a pencilled nickname inks once a keeper's ring is on that lake (bible 5.3.4)
export const LAKES = {
  moose: { name: 'Moose Lake', x: -22400, z: 11350 },
  insula: { name: 'Lake Insula', x: -6719, z: 20215 },
  ottertrack: { name: 'Ottertrack Lake', x: 7580, z: -7999 },
  birch: { name: 'Birch Lake', x: -14000, z: 3800 },
  sucker: { name: 'Sucker Lake', x: -17185, z: 5334 },
};

export const PLACES = {
  moosedock: { store: 25, r: 90, label: 'the Moose Lake dock' },
  towlanding: { layer: 'gy.tow', x: -16605, z: 4549, r: 140, label: 'the tow landing at Prairie' },
  inletbay: { layer: 's7.mummos', x: -17300, z: 3600, r: 700, label: 'Inlet Bay' },
  reef: { layer: 'gy.reef', x: -17150, z: 3350, r: 220, label: 'the reef past the second island' },
  lunchrock: { layer: 'gy.lunch', x: -17850, z: 3550, r: 160, label: 'the lunch rock' },
  littlegabbro: { ep: 33, r: 300, label: 'Little Gabbro' },
  baldeagle: { lake: 'baldeagle', r: 1600, label: 'Bald Eagle' },
  stuart: { x: -58693, z: -9815, r: 400, label: 'the Stuart Portage' },
  'lake.insula': { lake: 'insula', r: 2400, label: 'Insula' },
  'lake.ottertrack': { lake: 'ottertrack', r: 2000, label: 'Ottertrack' },
  'lake.moose': { lake: 'moose', r: 1400, label: 'Moose Lake' },
  'alders': { layer: 'gy.alders', x: -14100, z: 4500, r: 120, label: 'the alders on Birch' },
};

export const LINES = {};

export const LEADS = [
  // "Ricky took a picture." (GY-04): Rick at the Moose Lake store early or late; closed when he's met
  { id: 'rick', born: 'f:hap.day', subject: { person: 'rick', where: { store: 25, hours: '5-7', words: 'at Moose Lake, early or late' } },
    ring: { by: null, ask: 'keeper:25' }, walt: '31:GY-04.gives.1', closes: 'f:rick.met' },
  // Hap's far end (GY-06): Little Gabbro, across Bald Eagle; closed when the far end is inked (lock 2 solved)
  { id: 'hapfarend', born: 'f:hap.farend', subject: { place: 'littlegabbro' }, ring: { by: null, ask: 'keeper:25' }, walt: '31:GY-06.gives',
    followed: 'near:littlegabbro/400', closes: 'f:ink.farend' },
  // Sheila's Ollie (GY-09b): the Stuart Portage, Tuesday and Thursday evenings (S1, stream s)
  { id: 'ollie', born: 'f:sheila.said.ollie', subject: { person: 'ollie', where: { place: 'stuart', words: 'on the Stuart Portage, Tuesday and Thursday evenings' } },
    ring: { by: null, ask: 'keeper:25' }, walt: '31:GY-09b.2', closes: 'met:ollie>=1' },
];

export const ASKS = [
  { id: 'ring.hapsday', choice: null, ask: 'Hap\'s day?', say: '31:GY-04.gives.2', if: 'f:hap.day & ep:25', ring: 'towlanding',
    then: ['ring:moosedock', 'ring:inletbay', 'ring:reef', 'ring:lunchrock'], once: true, doc: '31 GY-04 Gives' },
  { id: 'ring.hapfarend', choice: null, ask: 'Little Gabbro? Bald Eagle?', say: '31:GY-16.rings', if: 'f:hap.farend & ep:25', ring: 'littlegabbro',
    lead: 'hapfarend', then: ['ring:baldeagle'], once: true, doc: '31 GY-06 Gives, GY-16' },
  { id: 'ring.insula', choice: null, ask: 'Hap says Insula?', say: '31:GY-06c.gus', if: 'f:hap.said.kitchen & ep:25', ring: 'lake.insula', once: true, doc: '31 GY-06c' },
  { id: 'ring.ottertrack', choice: null, ask: 'Hap says Ottertrack?', say: null, if: 'f:hap.said.longroom & ep:25', ring: 'lake.ottertrack', once: true, doc: '31 GY-06c' },
  { id: 'ring.stuart', choice: null, ask: 'The Stuart Portage?', say: null, if: 'f:sheila.said.ollie & ep:25', ring: 'stuart', lead: 'ollie', once: true, doc: '31 GY-09b' },
];

export const INK = [
  { nick: 'frontroom', label: 'the Front Room', lake: 'moose', nb: 'NB35', seen: ['NB35', 'NB65', 'NB75', 'NB85'], when: 'f:knows.frontroom & (ringon:moose | onlake:moose)' },
  { nick: 'kitchen', label: 'the Kitchen', lake: 'insula', nb: 'NB03', seen: ['NB03', 'NB06'], when: 'f:knows.kitchen & (ringon:insula | onlake:insula)' },
  { nick: 'longroom', label: 'the Long Room', lake: 'ottertrack', nb: 'NB24', seen: ['NB24'], when: 'f:knows.longroom & (ringon:ottertrack | onlake:ottertrack)' },
];
