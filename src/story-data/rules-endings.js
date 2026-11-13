// The endings' dated after-effects (story Round 3, stream n; campaign-design §9 "the epilogue is facts read everywhere,
// plus a dated queue"; 50 §9.1 "After it, in order", §12.1). The ending itself is written by endings.js through
// story-data/endings.js commitEnding (the dawn lot's hand-over); everything after it is a fact here, read by the board,
// the props, the pools, the cast and the tally. Timers run on the story clock (story-rules.js `after`).
export const RULES_ENDINGS = [
  // the paper: the Ledger's front page (J/JN) or Maggie's column (M), two game weeks after the ending
  { id: 'n.paper', when: 'f:end', after: { days: [14, 14] }, then: ['f:world.paper'] },
  // journalist: Walt's photo by the Moose Lake register once the story is out (Marlys); the trench closed (+14 days)
  { id: 'n.photo', when: 'end:J|JN & f:world.paper', then: ['f:world.walt.photo'] },
  { id: 'n.trench', when: 'end:J|JN', after: { days: [14, 14] }, then: ['f:world.trench.closed'] },
  // week 3: the last Thursday may play; Brekke resigns "for health reasons", Wade's contract ends
  { id: 'n.resign', when: 'end:J|JN', after: { days: [21, 21] }, then: ['f:world.resign'] },
  // week 4: the sheriff reopens Eino's file and closes it again
  { id: 'n.file', when: 'end:J|JN', after: { days: [28, 28] }, then: ['f:world.file'] },
  // Sheila brought in: the county reviews Walt's 2019 search, finds nothing it can prove
  { id: 'n.sheila', when: 'end:J|JN & f:sheila.in', after: { days: [28, 28] }, then: ['f:world.sheila.review'] },
  // Tasha leads the new sampling (her board notice at Farm from then on, each month of open water)
  { id: 'n.sampling', when: 'end:J|JN', after: { days: [30, 30] }, then: ['f:world.sampling'] },
  // money: survey stakes along the Kettle creek and the Little Gabbro road, a rig's sound on weekdays (+30 days)
  { id: 'n.stakes', when: 'end:M', after: { days: [30, 30] }, then: ['f:world.stakes'] },
  // the cellar's dot after the end: "An empty pit." (f's pit reads world.pit.empty)
  { id: 'n.pit', when: 'f:end | f:run.out', then: ['f:world.pit.empty'] },
];
