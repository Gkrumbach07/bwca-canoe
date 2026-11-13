// S2 · The Squatch night (docs/story/60-side-stories.md S2; campaign-design Part 4 Round 7, 7A). Duane Halvorsen of the
// Twin Ports Tattler, weekends in the Moose River North 16 lot; the west site on Big Moose under the ridge (s2.ridge);
// the night at two in the morning (minigames/nightwatch.js): a cow moose and her calf in the deadfall, a minute of
// silence (the unexplained frame), a bear at the serviceberry; the snag off the point and Tie off (stream r's verb).
// Owner Part 3 #4: the Squatch year never closes by itself: no `without` end; it stays open until solved (a print of
// what walked the ridge shown to Duane, or the frame sold or kept). Duane's notice is up June–September each year.
// The yes: the notice taken, Duane's offer accepted in talk (episodes.yes, feed-side7a.js), N14 (NB36) read at the site,
// or the night itself happening to a player at the site (the thing done at its place).
export default {
  id: 'S2', kind: 'side', title: 'The Squatch night', slot: false, region: { eps: [16, 8, 19] },
  window: { months: '6-9', reopen: 'yearly' },
  cast: ['duane'],
  flyer: { ep: 16, text: 'S2.notice', style: 'notice', want: 'photo' },
  doors: [
    { kind: 'flyer', yes: true },                         // the Tattler's notice on Leon's board
    { kind: 'person', who: 'duane' },                     // weekends in the lot: meeting him starts nothing
    { kind: 'choice', yes: true },                        // "Where do I camp?" / "What do you pay?": his offer taken
    { kind: 'rumour', line: '70.6.1.6' },                 // the tabloid in Duluth: names the thing, starts nothing
    { kind: 'entry', nb: 'NB36' },                        // N14 read anywhere: the site and the hour
    { kind: 'entry', nb: 'NB36', yes: true },             // N14 read at the site: the snag offers Tie off that night
    { kind: 'place', yes: true, on: 'mg:nightwatch' },    // the night at two, at the site: the thing done at its place
  ],
  started: 'f:ep.S2.yes',
  places: ['s2.ridge'],
  // Duane in the lot (feed-side7a.js: npcs.standAt by the store at 16): weekends, June – September
  duane: { ep: 16, when: '(dow:sat | dow:sun) & hour:9-18' },
  // the camera's targets (feed-side7a.js judges a print against the night's own record, not the layer: what was on the
  // ridge at that minute): s2.moose (lit, within 25 m), s2.bear (standing, lit), s2.tracks (by day after), s2.frame
  pins: ['s2.moose', 's2.bear', 's2.tracks', 's2.frame'],
  wants: [
    { who: 'duane', print: 's2.moose', when: 'f:ep.S2.yes & !f:ep.S2.shown.moose', say: ['S2.conv.11', 'S2.conv.12'], then: ['f:ep.S2.shown.moose'] },
    { who: 'duane', print: 's2.bear', when: 'f:ep.S2.yes & !f:ep.S2.shown.bear', say: ['S2.conv.13', 'S2.conv.14'], then: ['f:ep.S2.shown.bear'] },
    { who: 'duane', print: 's2.tracks', when: 'f:ep.S2.yes & !f:ep.S2.shown.tracks', say: ['S2.conv.15', 'S2.conv.16'], then: ['f:ep.S2.shown.tracks'] },
    // the frame: "Where were you standing?" and the sell-or-keep (Duane's scene node 'frame', feed-side7a.js)
    { who: 'duane', print: 's2.frame', when: 'f:ep.S2.yes & !f:ep.S2.sold & !f:ep.S2.kept', say: ['S2.conv.18'], then: ['f:ep.S2.shown.frame'], to: 'frame' },
  ],
  steps: [
    { when: 'f:mg.nightwatch.done', then: ['f:ep.S2.night'] },
    { when: 'f:ep.S2.shown.moose', then: ['pay:20@d95.7a.S2.pay.20'] },
    { when: 'f:ep.S2.shown.bear', then: ['pay:20@d95.7a.S2.pay.20'] },
    { when: 'f:ep.S2.shown.tracks', then: ['pay:10@d95.7a.S2.pay.10'] },
    { when: 'f:ep.S2.sold', then: ['pay:200@d95.7a.S2.pay.200'] },
  ],
  ends: [
    { id: 'sold', when: 'f:ep.S2.sold', line: 'd95.7a.S2.end.sold' },
    { id: 'kept', when: 'f:ep.S2.kept', line: 'd95.7a.S2.end.kept' },
    { id: 'solved', when: '(f:ep.S2.shown.moose | f:ep.S2.shown.bear | f:ep.S2.shown.tracks) & !f:ep.S2.frame', line: 'd95.7a.S2.end.solved' },
  ],
  page: [
    { when: 'f:duane.met', text: 'd95.7a.S2.page.duane' },
    { when: 'f:duane.said.where', text: 'd95.7a.S2.page.site' },
    { when: 'here:NB36', text: 'd95.7a.S2.page.walt' },
    { when: 'f:ep.S2.night', text: 'd95.7a.S2.page.night' },
    { when: 'f:ep.S2.tracks.seen', text: 'd95.7a.S2.page.tracks' },
    { when: 'f:ep.S2.frame', text: 'd95.7a.S2.page.frame' },
  ],
  titles: [{ when: 'f:ep.S2.night', title: 'The Squatch night' }, { when: 'true', title: 'The Tattler' }],
  // (the first stamped, "A night afloat", is the first sleep tied off: stamped by feed-side7a.js at that sleep, not at the end)
  feeds: ['tieoff.learned'],
  climax: null,
};
