// The guiding years as a record on the episodes runner (docs/build/campaign-design.md §10.1–10.2: "Arcs on the same
// runner"; story Round 4, stream A3; docs/story/31-guiding-years.md). Stream E's episodes.js reads it: `kind: 'arc'`,
// `slot: false` (no slots: owner, Part 3 #4), the climax (`door`, `choice`) for the director's spacing (D's
// beats.climax), the yield for the big findings. The arc's scenes are story-data/guiding.js and its patterns
// rules-guiding.js, so it has no steps of its own.
//
// The arc's yes: the first sit on Hap's bench, or "I'm Marlys." (guiding.js writes door.guiding.open: the thing done at
// its place). Meeting Hap or Marlys on the porch or at the counter is a person door. The arc ends with the night's choice
// (door.guiding.done: GY-13, "bring it in, or let it lie"). Hap's shore lunch (GY-T1) and the overdue party (GY-T4) are
// favours inside the arc, never a key; the board's home-turf tasks (GY-T5–T7) are existing kinds on Gus's board.
//
//   climax   door.guiding.climax (the night played to 06:00); choice.sheila ('in' | 'lie': exclusive)
//   yield    door.guiding.yield (= hap.farend, GY-06: lock 2 key A, the arc's big finding)
//   window   Hap's summers (the second weekend of June to Labor Day) for the day and the real talk; Sheila July–October
//            for the drift test; Marlys ice-out to October. Nothing expires (31 §12.3): every one of them is back next year
//   leaves   the facts the endings read (Round 3 N, 31 §12.2): sheila.in, hap.photo (the print on the wall), marlys.north
//            (the look at the lot gone), rick.met, door.guiding.done
export default {
  id: 'guiding', kind: 'arc', title: 'The guiding years', slot: false,
  region: { eps: [25] },
  cast: ['marlys', 'hap', 'nate', 'sheila', 'rick'],
  doors: [
    { kind: 'person', who: 'hap', at: 'porch:25' },
    { kind: 'person', who: 'marlys', at: 'counter:25' },
    { kind: 'place', yes: true, when: 'f:door.guiding.open', at: 'porch:25' },
  ],
  steps: [],
  page: [],
  ends: [{ id: 'done', when: 'f:door.guiding.done' }],
  first: null,
  feeds: [],
  climax: { door: 'door.guiding.climax', choice: 'choice.sheila' },
  yield: 'door.guiding.yield',
  leaves: ['sheila.in', 'hap.photo', 'marlys.north', 'rick.met', 'door.guiding.done'],
};
