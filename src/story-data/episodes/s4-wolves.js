// S4 · The wolves (docs/story/60-side-stories.md S4; campaign-design Part 4 Round 7, 7A). Kari Vang, Fridays at Leon's
// post (Moose River North 16); the tracks taught once on the landing's mud (from then the dot reads prints anywhere:
// side7a-tracks in feed-side7a.js, shared with 40 and 50); the howl survey at three stations (minigames/howl.js: Howl
// at a stake between 23:00 and 04:00, three game minutes of quiet, the answer from a bearing, Mark facing it: a
// pencilled bearing line, pencil.bearing); three lines cross: a ring west of Agnes (the Weeny Lake primitive area,
// pma-1, the nearest real PMA west of Agnes: 60 S4's fallback); ravens over a seeded kill; in August the pup count from
// the ridge 400 m off the meadow (closer than 200 m, the meadow empties); the choice of who learns where (Lyle, $60);
// Kari's report at Leon's counter in October. Her grant ends 15 October: the window, no reopen (she does not come back).
export default {
  id: 'S4', kind: 'side', title: 'The wolves', slot: false, region: { eps: [16] },
  window: { date: '06-01..10-15' },
  cast: ['kari', 'lyle'],
  flyer: { ep: 16, text: 'S4.notice', style: 'notice', want: 'job' },
  doors: [
    { kind: 'flyer', yes: true },                         // the survey notice on Leon's board
    { kind: 'person', who: 'kari' },                      // Fridays at the store: meeting her starts nothing
    { kind: 'choice', yes: true },                        // "What's the job?": the second pair of ears taken on
    { kind: 'rumour', line: '70.6.1.8' },
    { kind: 'entry', nb: 'NB44' },                        // N17 read anywhere
    { kind: 'entry', nb: 'NB44', yes: true },             // N17 read at C698: the loons answer the wolves that night
  ],
  started: 'f:ep.S4.yes',
  places: ['s4.st1', 's4.st2', 's4.st3', 's4.meadow'],
  kari: { ep: 16, when: 'dow:fri & hour:9-17' },
  lyle: { ep: 16, when: 'month:8 & (dow:tue | dow:wed | dow:thu) & hour:10-16' },
  pins: ['s4.kill', 's4.pups'],
  wants: [
    { who: 'kari', print: 's4.pups', when: 'f:ep.S4.yes & !f:ep.S4.counted & !f:ep.S4.moved', say: ['S4.conv.17'], then: ['f:ep.S4.counted'] },
    { who: 'kari', print: 's4.kill', when: 'f:ep.S4.yes & !f:ep.S4.kill.shown', say: [], then: ['f:ep.S4.kill.shown'] },
  ],
  steps: [
    { when: 'f:ep.S4.st1', then: ['pay:15@d95.7a.S4.pay.station'] },
    { when: 'f:ep.S4.st2', then: ['pay:15@d95.7a.S4.pay.station'] },
    { when: 'f:ep.S4.st3', then: ['pay:15@d95.7a.S4.pay.station'] },
    { when: 'f:ep.S4.st1 & f:ep.S4.st2 & f:ep.S4.st3', then: ['f:ep.S4.ring'] },
    { when: 'f:ep.S4.counted', then: ['pay:40@d95.7a.S4.pay.count'] },
    { when: 'f:ep.S4.lyle', then: ['pay:60@d95.7a.S4.pay.lyle', 'f:ep.S4.told'] },
    { when: 'f:ep.S4.told & !f:ep.S4.counted', then: ['f:ep.S4.moved'] },
  ],
  ends: [
    { id: 'report', when: 'f:ep.S4.report', line: 'S0.last.3' },
    { id: 'without', when: 'f:ep.S4.shut & !f:ep.S4.st1 & !f:ep.S4.st2 & !f:ep.S4.st3', line: 'S0.last.3' },
  ],
  page: [
    { when: 'f:kari.met', text: 'd95.7a.S4.page.kari' },
    { when: 'f:ep.S4.tracks', text: 'd95.7a.S4.page.tracks' },
    { when: 'f:ep.S4.st1', text: 'd95.7a.S4.page.st1' },
    { when: 'f:ep.S4.st2', text: 'd95.7a.S4.page.st2' },
    { when: 'f:ep.S4.st3', text: 'd95.7a.S4.page.st3' },
    { when: 'f:ep.S4.ring', text: 'd95.7a.S4.page.ring' },
    { when: 'f:ep.S4.kill', text: 'd95.7a.S4.page.kill' },
    { when: 'f:ep.S4.counted', text: 'd95.7a.S4.page.count' },
    { when: 'f:ep.S4.told', text: 'd95.7a.S4.page.told' },
  ],
  titles: [{ when: 'true', title: 'The wolves' }],
  // (the firsts, "Wolves answered" and "Counted the pups", are stamped at their moments by feed-side7a.js: S4.first)
  feeds: ['tracks.read'],
  climax: null,
};
