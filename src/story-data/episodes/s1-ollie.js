// S1 · The man on the portage (docs/story/60-side-stories.md S1; campaign-design §10.1's example record, Part 4 Round 4
// stream S). Ollie Pekkala walks the Stuart Portage (563 r, the EP 19 road end north to the Stuart River) on Tuesday and
// Thursday evenings, June to the end of September (feed-sides.js: his place on the trail is a function of the clock).
// Passing him counts a meeting (story.meet('ollie')); the third time he stops (conversation A, sides-s.js OLLIE_A). His
// offer accepted ("You're on.") is the yes. The loaded carry is the `timedCarry` minigame (minigames/timed-carry.js): road
// end to river end, canoe and a pack, one trip, against the squad's 49 minutes; results mg:timedCarry. After it (beaten,
// or carried twice) conversation B at the river end gives his search log (a book page, S1.log) and, with the main story,
// the Eino half of the echo. It never ends without you: out of its window the page says he's back in June.
import { OLLIE_ECHO } from '../sides-s.js';

export default {
  id: 'S1', kind: 'side', title: 'The man on the Stuart', slot: false, region: { eps: [16, 19] },
  // the first Tuesday of June to the last Thursday of September (the walk evenings themselves: OLLIE.days in sides-s.js)
  window: { date: '06-01..09-30', reopen: 'yearly' },
  cast: ['ollie'],
  doors: [
    { kind: 'person', who: 'ollie' },                   // passing him on a walk evening: starts nothing
    { kind: 'rumour', line: '70.6.1.5' },               // "Fella on the Stuart Portage at dusk…" (the keepers' rumour pool)
    { kind: 'rumour', line: 'S1.leon' },                // Leon at Moose River North 16 (a keeper topic, feed-sides.js)
    { kind: 'entry', nb: 'NB30' },                      // N12 read anywhere: the portage and the time of day
    { kind: 'choice', yes: true },                      // his offer accepted (OLLIE_A: "You're on." → episodes.yes)
  ],
  started: 'f:ep.S1.yes',
  places: ['s1.stuart', 's1.river'],
  steps: [
    // the loaded carry's results (mg:timedCarry, feed-sides.js counts the tries in eps.S1.tries): beaten; or a second try
    { when: 'f:mg.timedCarry.beat', then: ['f:ep.S1.beat'] },
    { when: 'f:ep.S1.try2', then: ['f:ep.S1.twice'] },
  ],
  // not steps (no yes needed): N12 read on the Stuart is the small finding (the book marks "he was here": readHere)
  rules: [OLLIE_ECHO],
  ends: [
    // (B's log page given: the episode is done; the stamp is the beat's, else the carried-twice alternative)
    { id: 'beat', when: 'f:ep.S1.log & f:ep.S1.beat', line: 'd95.s1.end.log', first: 'S1.first#0' },
    { id: 'carried', when: 'f:ep.S1.log & !f:ep.S1.beat', line: 'd95.s1.end.log', first: 'S1.first#1' },
  ],
  page: [
    { when: 'true', text: 'd95.s1.page.1' },
    { when: 'f:ollie.squad', text: 'd95.s1.page.2' },
    { when: '!f:ep.S1.beat & !f:ep.S1.twice & !f:ep.S1.missed', text: 'd95.s1.page.3' },
    { when: 'f:ep.S1.missed & !f:ep.S1.beat & !f:ep.S1.twice', text: 'd95.s1.page.missed' },
    { when: 'f:ep.S1.beat', text: 'd95.s1.page.beat' },
    { when: 'f:ep.S1.twice & !f:ep.S1.beat', text: 'd95.s1.page.twice' },
    { when: 'f:ep.S1.log', text: 'd95.s1.page.log' },
    // (out of his walk months and not done: the page's last line, 60 §0.3 / "The window and how it ends without you")
    { when: '!window:S1 & !f:ep.S1.log', text: 'side.last.1' },
  ],
  titles: [{ when: 'true', title: 'The man on the Stuart' }],
  first: 'S1.first#0',
  feeds: ['echo.eino'],
  climax: null,
};
