// The boys as a record on the episodes runner (docs/build/campaign-design.md §10.1–10.2 "Arcs on the same runner";
// campaign stream b5, Round 5; docs/story/32-the-boys.md §0, §4). Stream E's episodes.js reads it: `kind: 'arc'`,
// `slot: false` (no slots: owner, Part 3 #4), the climax for the director's spacing (the last night at Little Sag,
// 14 August, or the cabin to October: stream i's reveal), the yield for the big findings (the shore, lock 3: 3A or 3B,
// whichever lands first; rules-boys.js b5.yield). The scenes are story-data/boys.js and the patterns rules-boys.js, so
// it has no steps of its own.
//
// The arc's yes: Carol met at the Sawbill counter (boys.js CAROL 'hello' writes door.boys.open: the room opens and the
// lead closes), the thing done at its place. The photo favour is the record's photo target (Gene's paddle in the pine at
// Frost C1125; feed-episodes.js matches a print against the layer's prop) and its want (Carol, "Look at this…": show.js)
export default {
  id: 'boys', kind: 'arc', title: 'The boys', slot: false,
  region: { eps: [38, 31] },
  cast: ['carol', 'bob', 'frank', 'denny'],
  doors: [
    { kind: 'person', who: 'carol', at: 'store:38' },
    { kind: 'place', yes: true, when: 'f:door.boys.open', at: 'store:38' },
  ],
  places: ['boys.c1210', 'boys.frost'],
  // the photo favour (32 §5.2): complete when the paddle is in frame and readable
  photo: [{ id: 'b5.paddle', words: '32:5.2.c1', props: ['boys.paddle'], d: 35, deg: 20 }],
  wants: [{ who: 'carol', print: 'b5.paddle', when: 'f:carol.favour & !f:carol.paddle.shown',
    say: ['32:5.2.back.1', '32:5.2.back.2', '32:5.2.back.3', '32:5.2.back.4'], then: ['f:carol.paddle.shown', 'f:carol.slides.invited'] }],
  steps: [],
  page: [],
  ends: [{ id: 'done', when: 'f:door.boys.done' }],
  first: null,
  feeds: [],
  climax: { door: 'door.boys.climax', choice: 'denny.reveal' },
  yield: 'door.boys.yield',
  // the facts the endings read (32 §10: the pan for good, the round, Denny's state is stream i's)
  leaves: ['boys.pan', 'boys.round', 'boys.bet.won', 'gene.slide.matched', 'boys.story1998'],
};
