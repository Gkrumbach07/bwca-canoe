// The boys' rings and places (campaign stream b5, Round 5; docs/story/32-the-boys.md §4 "Pencil rings"). The shapes
// are leads-act1.js's; leads.js merges these into its tables (its // b5: line), so pencil.js and the keepers see them.
// story-lint.mjs checks every leads-*.js (check 5).
//
//   PLACES  the Sawbill store is act1's sawbill38; Farm is farm31; here: Little Sag C1210 ("same site every year"),
//           Frost C1125 (Carol's favour), the Sawbill EP 38 landing (Bob), and Denny's five on the Isabella River in Bog
//           67's reach (32 §5.6: a river site below the rapids, a carry on the river, the Isabella Lake landing, a pool
//           below a rapid, Bog's store). Builders' picks on the river below Isabella Lake (v9 x/z; 32 §5.6: "Builders
//           pick the river site, the carry and the pool in v9"); stream i's Isabella camp (5.10) stands at isabella.site
//   No ring anywhere in this arc points at Baker (32 §4).
export const LAKES = {
  frost: { name: 'Frost Lake', x: 29466, z: 10877 },
};

export const PLACES = {
  'boys.c1210': { layer: 'boys.c1210', x: 15082, z: 6845, r: 160, label: 'Little Sag, the site with the rock' },
  'boys.frost': { layer: 'boys.frost', x: 30072, z: 10720, r: 160, label: 'Frost, Gene\'s' },
  'boys.landing': { ep: 38, r: 200, label: 'the Sawbill landing' },
  // Denny's rings (32 §5.6), on the Isabella River below Isabella Lake: the river site is C911 (−12550, 30700), the
  // watchers' 2019 camp (03 §1b, §9 #2); the carry the 103-rod one just below it (USFS 7175); the pool below the rapid
  // at the carry's lower end; the landing where the river leaves Isabella Lake (EP 35's water)
  'isabella.site': { x: -12550, z: 30700, r: 140, label: 'the site he liked, below the rapids' },
  'isabella.carry': { x: -11315, z: 31435, r: 160, label: 'a carry on the river' },
  'isabella.pool': { x: -11560, z: 31300, r: 110, label: 'a pool below a rapid' },
  'isabella.landing': { x: -3800, z: 31030, r: 220, label: 'the landing on Isabella Lake' },
  bog67: { store: 67, r: 260, label: 'Bog' },
};

export const LINES = {};
export const LEADS = [];
export const ASKS = [];
export const INK = [];
