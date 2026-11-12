// The mining years as a record on the episodes runner (docs/build/campaign-design.md §10.1–10.2: "Arcs on the same
// runner"; story Round 2, stream A2). Stream E's episodes.js reads it: `kind: 'arc'`, `slot: false` (no slots: owner,
// Part 3 #4), the climax (`door`, `choice`) for the director's spacing (D's beats.climax), the yield for the big
// findings. The arc's scenes are story-data/mining.js and its patterns rules-mining.js, so it has no steps of its own.
//
// The arc's yes (the join, on E's runner): the first Farm morning, sat on the bench (mining.js FARM 'first' writes
// door.mining.open): the thing done at its place, a `place` door the runner compiles (ep.mining.door1 → ep.mining.yes).
// Meeting Tauno is a person door (no yes). The arc ends with door.mining.done (ep.mining.end = done).
//
// The Kettle notice is the record's flyer on Farm's board (owner call 10; 30 §4.3 "The notice"; tasks.flyerHook through
// feed-episodes.js, the join):
//   when    the flyer is up: Tauno's "The pads" heard, June to October, and `kettlenotice` (kettle.js, from
//           feed-weather.js's rain days: from 18:00 of a forecast two-day rain's first day to 5 days after it stops)
//   text    its words (30:4.3.notice); `keeper` the keeper's two lines (30:4.3.keeper.*, read by kettle.flyers for rigs)
//   then    taking it writes kettle.notice (rules-mining.js m.notice.ring rings the pad); yes: false (the arc's yes is
//           the bench, above)
// Outside the board's count, no deadline, never paid at the tally (the $35 is Tasha's pay: at the day's end).
export default {
  id: 'mining', kind: 'arc', title: 'The mining years', slot: false,
  region: { eps: [31, 33, 30] },
  cast: ['tauno', 'len', 'mary', 'tasha', 'brekke'],
  doors: [
    { kind: 'person', who: 'tauno', at: 'porch:31' },
    { kind: 'place', yes: true, when: 'f:door.mining.open', at: 'porch:31' }, // (the bench sat on: the arc's yes)
  ],
  flyer: { ep: 31, text: '30:4.3.notice', when: 'f:tauno.said.pads & month:6-10 & kettlenotice & !f:kettle.done',
    then: ['f:kettle.notice'], yes: false, keeper: ['30:4.3.keeper.1', '30:4.3.keeper.2'] },
  steps: [],
  page: [],
  ends: [{ id: 'done', when: 'f:door.mining.done' }],
  first: null,
  feeds: [],
  climax: { door: 'door.mining.climax', choice: 'tauno.record' },
  yield: 'door.mining.yield',
  // the facts Round 3's endings read (campaign-design Part 4, "Stubs it adds for Round 3")
  leaves: ['tauno.record', 'mary.promised', 'tasha.metTauno', 'stations.known', 'door.mining.done'],
};
