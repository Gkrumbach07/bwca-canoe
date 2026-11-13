// S3 · Lights over Four Towns (docs/story/60-side-stories.md S3; campaign-design Part 4 Round 7, 7A). Elaine Sundquist
// and the sky book at the Slim 6 counter (afternoons); nights on Fourtown (minigames/skywatch.js): the northern lights on
// the seeded strong nights, the satellite train, a fog lantern at a party's north-end site, foxfire on the north shore in
// a wet week, and the one light over the north bay that goes out when a lamp shows white. Each light logged with Elaine
// (a print, or the foxfire carried in); at the second she finds Walt's line in the binder (S3.walt.square), and from then
// the loose stone in C1000's fire ring offers Lift: the tin, the red lens (item 'redlens'; fitted, H shows red: the
// run's red light, stream r). The one light logged: her first question mark, the end.
// The window: the notice from 25 August, Elaine's book open to 31 October; closed, the story waits for next September
// (no end without you: the tin stays under its stone).
export default {
  id: 'S3', kind: 'side', title: 'Lights over Four Towns', slot: false, region: { eps: [6] },
  window: { date: '08-25..10-31', reopen: 'yearly' },
  cast: ['elaine'],
  flyer: { ep: 6, text: 'S3.notice', style: 'notice', want: 'photo' },
  doors: [
    { kind: 'flyer', yes: true },                         // E.S.'s notice on Joanne's board
    { kind: 'person', who: 'elaine' },                    // at the counter: meeting her starts nothing
    { kind: 'choice', yes: true },                        // her sheet taken ("You want the sky book")
    { kind: 'rumour', line: '70.6.1.7' },
    { kind: 'entry', nb: 'NB26' },                        // N09 read anywhere
    { kind: 'entry', nb: 'NB26', yes: true },             // N09 read at the long rock: P10 matches (the small finding)
  ],
  started: 'f:ep.S3.yes',
  places: ['s3.longrock', 's3.northbay'],
  elaine: { ep: 6, when: 'hour:13-17' },
  pins: ['s3.aurora', 's3.train', 's3.lantern', 's3.onelight'],
  // logging a light (show.js: the print to Elaine, or the foxfire handed over): her words, then "Write it in."
  wants: [
    { who: 'elaine', print: 's3.aurora', when: 'f:ep.S3.yes & !f:ep.S3.log.aurora', say: ['S3.conv.7'], then: ['f:ep.S3.log.aurora'] },
    { who: 'elaine', print: 's3.train', when: 'f:ep.S3.yes & !f:ep.S3.log.train', say: ['S3.conv.8'], then: ['f:ep.S3.log.train'] },
    { who: 'elaine', print: 's3.lantern', when: 'f:ep.S3.yes & !f:ep.S3.log.lantern', say: ['S3.conv.9'], then: ['f:ep.S3.log.lantern'] },
    { who: 'elaine', item: 'foxfire', when: 'f:ep.S3.yes & !f:ep.S3.log.foxfire', say: ['S3.conv.10'], then: ['f:ep.S3.log.foxfire'], give: true },
    { who: 'elaine', print: 's3.onelight', when: 'f:ep.S3.yes & !f:ep.S3.mark', say: ['S3.conv.11'], then: ['f:ep.S3.told'], to: 'one' },
  ],
  steps: [
    // the first light logged: the one sentence the run needs (said in her scene; here the fact for the run, 50 6.4)
    { when: 'f:ep.S3.log.aurora | f:ep.S3.log.train | f:ep.S3.log.lantern | f:ep.S3.log.foxfire', then: ['f:ep.S3.match'] },
    // the second: Walt's line in the binder (her scene's 'square' node says it); the stone at the long rock lifts
    { when: 'count(ep.S3.log.*)>=2', then: ['f:ep.S3.two'] },
    { when: 'f:ep.S3.tin', then: ['f:lens.red.found'] },
  ],
  ends: [{ id: 'mark', when: 'f:ep.S3.mark', line: 'd95.7a.S3.end' }],
  page: [
    { when: 'f:elaine.met', text: 'd95.7a.S3.page.elaine' },
    { when: 'f:ep.S3.log.aurora', text: 'd95.7a.S3.page.aurora' },
    { when: 'f:ep.S3.log.train', text: 'd95.7a.S3.page.train' },
    { when: 'f:ep.S3.log.lantern', text: 'd95.7a.S3.page.lantern' },
    { when: 'f:ep.S3.log.foxfire', text: 'd95.7a.S3.page.foxfire' },
    { when: 'f:ep.S3.square', text: 'd95.7a.S3.page.square' },
    { when: 'f:ep.S3.tin', text: 'd95.7a.S3.page.tin' },
    { when: 'f:ep.S3.onelight', text: 'd95.7a.S3.page.one' },
  ],
  titles: [{ when: 'true', title: 'Lights over Four Towns' }],
  // (the firsts, "Logged the northern lights" and "Saw the light on Fourtown", are stamped at their moments by
  // feed-side7a.js: S3.first and S3.first2)
  feeds: ['lens.red'],
  climax: null,
};
