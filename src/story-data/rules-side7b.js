// Round 7 stream 7b's rules (docs/story/60-side-stories.md S5, S6). Not episode steps: what they give outlives the
// window (60 S5: "The key survives; the case doesn't"), so they read the world's facts, not the yes. In story.js's data
// from its construction (all-rules.js), never added later (chk-coop C2).
export const RULES_SIDE7B = [
  // 60 S5 "The pilot's chart": the chart in the book (kept, or read off the Round Lake wall) and the notch looked at
  // from Gull's east bay (feed-side7b.js writes s5.notch only with the page held): lock 2 key D and lock 3 key D
  { id: '7b.chart', when: 'f:nb.page.pilotchart & f:s5.notch', then: ['f:ep.S5.chart', 'walt:S5.the-pilots-chart-book.w1'] },
  // the chart off the wall: looked at there, the book gets the page (60 S5 "Pete, with the case": once they've looked)
  { id: '7b.wall', when: 'f:s5.wall.read & !f:nb.page.pilotchart', then: ['give:page.pilotchart'] },
  // 60 S6 "The pit": the moss comes back only for someone who knows something is here (Orrin's route, N08 read at the
  // pond); the yes is the place door (the moss cleared)
  { id: '7b.s6.know', when: 'f:s6.route | f:s6.here', then: ['f:s6.know'] },
  // 60 S6 "Red herrings": for a main-story player, the Walt page in their words
  { id: '7b.s6.bottles', when: 'f:s6.ledger & f:nb.found', then: ['walt:S6.red-herrings.w1'] },
];
