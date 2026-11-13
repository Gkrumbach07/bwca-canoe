// S8 · The sled on the lunch rock (docs/story/60-side-stories.md S8; campaign-design Part 4 Round 4 stream S). Lake
// Insula, "the Kitchen": the old sled on a bare granite point at a narrows half a kilometre from Walt's C1655 (s8.rock);
// Emil's creek straight across the lake to the south, a beaver house at its mouth (s8.creek); the clearing 200 m up the
// creek inside the 2011 Pagami Creek burn, in fifteen-year jack pine (s8.clearing: two cut stumps on a line, the
// stovepipe, the square hollow, the bed spring and under it the tin, "E.R. 1947"). Tom Becker's ranger crew is a fixed
// party (parties.js FIXED_PARTIES 'tom'); the Ostbys camp by the rock 3–9 August ('ostbys'); Hap's three topics are in
// sides-s.js HAP_S8 (his tree is stream a3's). The clearing's things read as plain things until Tom teaches the eye
// ("What would an old cabin site look like?"), then as a reading: that reading is lock 5 key B (f:ep.S8.done, locks.js
// L5B) and survives the window, since Tom's teaching does. The third week of September the crew hauls the sled unless
// Tom was told to leave it (the world's own end, ep.S8.gone, with or without you).
export default {
  id: 'S8', kind: 'side', title: 'The sled on the lunch rock', slot: false, region: { eps: [25, 30] },
  // until mid September: Tom's crew is on Insula the third week (60 S8 "At a glance")
  window: { date: '06-01..09-14', reopen: 'yearly' },
  cast: ['tom'],
  doors: [
    { kind: 'person', who: 'tom', line: 'S8.tom' },             // Tom on the water or at the Moose Lake store: starts nothing
    { kind: 'rumour', line: '70.6.1.12' },                       // "Tom Becker's crew is going to haul that old sled…"
    { kind: 'rumour', line: 'S8.rumour.2' },                     // Gus at Moose Lake 25
    { kind: 'entry', nb: 'NB37' },                              // N16 read anywhere: the Kitchen, the sled on the lunch rock
    { kind: 'entry', nb: 'NB37', yes: true },                   // read at the lunch rock (here:NB37): the yes
    { kind: 'place', yes: true, when: 'f:ep.S8.sled' },         // E Look at the sled: the thing done at its place, the yes
  ],
  started: 'f:ep.S8.yes',
  places: ['s8.rock', 's8.creek', 's8.clearing'],
  // the camera's survey (feed-episodes.js matches a print against these; feed-sides.js reads the matches: f:ep.S8.print)
  photo: [
    { id: 's8.clearing', words: 'd95.s8.photo.clearing', props: ['s8.hollow', 's8.spring', 's8.stump1', 's8.stump2', 's8.pipe'], d: 30, deg: 30 },
    { id: 's8.sled', words: 'd95.s8.photo.sled', props: ['s8.sled'], d: 40, deg: 22 },
  ],
  pins: ['s8.clearing', 's8.sled'],
  steps: [
    // the clearing found (its enter trigger, or the first of its things looked at)
    { when: 'f:ep.S8.clearing | f:ep.S8.looked', then: ['f:ep.S8.found'] },
  ],
  // not steps (no yes needed): Tom's eye and the reading (lock 5 key B, survives the window); the sled hauled in the third
  // week of September unless Tom was told to leave it; the brass spinner hooked in the rock is Walt's, with N16 read there
  rules: [
    { id: 'ep.S8.read', when: 'f:ep.S8.taught & f:ep.S8.looked', then: ['f:ep.S8.done'] },
    { id: 'ep.S8.gone', when: 'date:09-15..12-31 & !f:ep.S8.leave', then: ['f:ep.S8.gone'] },
  ],
  ends: [
    { id: 'heritage', when: 'f:ep.S8.leave', line: 'd95.s8.end.heritage', first: null },
    { id: 'hauled', when: 'f:ep.S8.haul', line: 'side.last.2', first: null },
    { id: 'without', when: '(f:ep.S8.shut | f:ep.S8.gone) & !f:ep.S8.leave & !f:ep.S8.haul', line: 'side.last.2', first: null },
  ],
  page: [
    { when: 'true', text: 'd95.s8.page.1' },
    { when: 'f:tom.said.why', text: 'd95.s8.page.rule' },
    { when: 'f:tom.said.when', text: 'd95.s8.page.crew' },
    { when: 'f:ep.S8.hap.why | f:ep.S8.hap.trapper', text: 'd95.s8.page.emil' },
    { when: 'f:ep.S8.hap.creek | f:ep.S8.creekknown | f:tom.said.where', text: 'd95.s8.page.creek' },
    { when: 'f:ep.S8.snap', text: 'd95.s8.page.snap' },
    { when: 'f:ep.S8.found', text: 'd95.s8.page.found' },
    { when: 'f:ep.S8.tin', text: 'd95.s8.page.tin' },
  ],
  titles: [{ when: 'read:NB37', title: 'The Kitchen' }, { when: 'true', title: 'The sled on the lunch rock' }],
  first: 'S8.first', // (stamped when the clearing is found: feed-sides.js; the ends stamp nothing more)
  feeds: ['key.L5B'],
  climax: null,
};
