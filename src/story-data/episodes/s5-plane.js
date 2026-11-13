// S5 · The plane on the Kek (docs/story/60-side-stories.md S5; campaign-design Part 4 Round 7, 7B). Pete Haldane at the
// Round Lake 51 counter, June to Labor Day; the wreck in 3.5 m off the Kek's quiet north shore (kek.plane), read from the
// canoe only on a calm, bright day (wind under 5 mph, 10:00–15:00, clear sky); Dive over it (minigames/dive.js: no
// breath bar, the view narrows and a heartbeat comes up; cold; three dives: see it, work the case free with E held, again
// if the breath ran out); the canoe drifts while you are under if there is wind; Get in from the water. The case holds
// the pilot's 1949 chart (page:pilotchart); keep it, or give it to Pete (the chart framed on the Round Lake wall, $60).
// Told "north", Pete finds it himself on the next calm bright day ($40, the card); without you he finds it on the first
// calm bright day after 20 August, by Labor Day at the latest (the chart goes up on the wall all the same: the key
// survives). The chart in the book, stood in Gull's east bay looking at the notch: ep.S5.chart, lock 2 key D and lock 3
// key D (rules-side7b.js, not a step: the key survives the window). Labor Day is taken as 7 September every year.
export default {
  id: 'S5', kind: 'side', title: 'The plane on the Kek', slot: false, region: { eps: [51] },
  window: { date: '05-15..09-07', when: '!f:s5.pete.found' },
  cast: ['pete'],
  doors: [
    { kind: 'person', who: 'pete' },                         // the counter: meeting him starts nothing
    { kind: 'choice', yes: true },                           // past the opener ("An airplane?", "What if I find it first?")
    { kind: 'rumour', line: 'S5.rumour.1' },                 // 70 6.1's, the keepers'
    { kind: 'entry', nb: 'NB29' },                           // N11 read anywhere: the north shore, 12 ft, calm
    { kind: 'entry', nb: 'NB29', yes: true },                // N11 read on the Kek's north shore
    { kind: 'place', yes: true, when: 'f:s5.wreck.seen' },   // the wreck seen through calm water
  ],
  started: 'f:ep.S5.yes',
  places: ['kek.plane'],
  pete: { ep: 51, when: 'hour:9-17' },
  steps: [
    { when: 'f:s5.case', then: ['f:ep.S5.case'] },
    { when: 'f:ep.S5.told & f:s5.pete.found', then: ['f:ep.S5.helped', 'pay:40@d95.7b.S5.pay.told'] },
    { when: 'f:ep.S5.given', then: ['pay:60@d95.7b.S5.pay.given', 'f:s5.wall'] },
  ],
  ends: [
    { id: 'given', when: 'f:ep.S5.given', line: 'd95.7b.S5.end.given' },
    { id: 'kept', when: 'f:ep.S5.kept & f:ep.S5.photo', line: 'd95.7b.S5.end.kept' },
    { id: 'keptno', when: 'f:ep.S5.kept & !f:ep.S5.photo', line: 'd95.7b.S5.end.keptno' },
    { id: 'shutkept', when: 'f:ep.S5.shut & f:ep.S5.case & !f:ep.S5.kept & !f:ep.S5.given', line: 'd95.7b.S5.end.keptno' },
    { id: 'told', when: 'f:ep.S5.helped', line: 'd95.7b.S5.end.told' },
    { id: 'pete', when: 'f:s5.pete.found & !f:ep.S5.case & !f:ep.S5.told', line: 'S5.without' },
  ],
  page: [
    { when: 'f:pete.met', text: 'd95.7b.S5.page.pete' },
    { when: 'f:pete.said.where', text: 'd95.7b.S5.page.south' },
    { when: 'read:NB29', text: 'd95.7b.S5.page.walt' },
    { when: 'f:ep.S5.told', text: 'd95.7b.S5.page.told' },
    { when: 'f:s5.wreck.seen | f:s5.dived', text: 'd95.7b.S5.page.seen' },
    { when: 'f:ep.S5.case', text: 'd95.7b.S5.page.case' },
  ],
  titles: [{ when: 'true', title: 'The plane on the Kek' }],
  // (the first, "Dived a wreck.", is stamped at the first dive by feed-side7b.js: S5.first)
  feeds: ['ep.S5.chart'],
  climax: null,
};
