// 7c · M5 The freeze-up run (docs/build/campaign-design.md §10.3; campaigns.md §2). Two retired guides at Farm 31 (or Hog
// Creek 36) bet you can't make the last trip of the year: their route (minis.js FREEZE_ROUTES, one a year), out and back to
// the counter before the ice. Taking the bet is the yes (a counter topic). Skim ice in the bays, broken with the paddle
// handle (skimice: season.js's ice coming in); the route's lakes paddled; back at the counter while it is still open
// water. Ends without you: the ice wins (ice-in at the landing, or the window's end). Late October to ice-in. Yearly.
//
// Facts (ep.M5_<k>.): bet (the topic) · lake.<i> (paddled) · skim (broke skim ice) · round (every lake) · back · iced · shut
import { CYCLES, cycleWhen, idOf, freezeRoute } from '../../minis.js';

export function m5(k) {
  const id = idOf('M5', k), P = `ep.${id}`, R = freezeRoute(k);
  return {
    id, kind: 'mini', title: 'The freeze-up run', slot: false, region: { eps: [31, 36] }, mini: 'M5', cycle: k,
    window: { date: '10-20..12-20', when: cycleWhen(k), reopen: 'yearly' },
    cast: ['guides'],
    route: R,
    doors: [
      { kind: 'rumour', line: '70.6.9.4' },                          // 70's November word ("Skim ice in the bays…"): starts nothing
      { kind: 'place', yes: true, when: `f:${P}.bet` },               // the bet taken at the counter
    ],
    started: `f:${P}.yes`,
    topics: [
      { id: `${id}.bet`, once: true, ask: 'm5.ask.bet', when: `!f:${P}.bet & ep:${R.from}`, say: `m5.say.bet.${R.i}`, then: [`f:${P}.bet`] },
      { id: `${id}.back`, once: true, ask: 'm5.ask.back', when: `f:${P}.round & !f:${P}.end & ep:${R.from}`, say: 'm5.say.back', then: [`f:${P}.back`] },
    ],
    steps: [
      { when: `count(${P}.lake.*)>=${R.lakes.length}`, then: [`f:${P}.round`] },
    ],
    ends: [
      { id: 'made', when: `f:${P}.back`, line: 'm5.end.made' },
      { id: 'ice', when: `(f:${P}.iced | f:${P}.shut) & !f:${P}.back`, line: 'm5.end.ice' },
    ],
    page: [
      { when: 'true', text: `m5.page.bet.${R.i}` },
      { when: `f:${P}.skim`, text: 'm5.page.skim' },
      { when: `count(${P}.lake.*)>=1`, text: 'm5.page.out' },
      { when: `f:${P}.round`, text: 'm5.page.round' },
    ],
    first: 'm5.first',
    feeds: [],
    climax: null,
  };
}
export default Array.from({ length: CYCLES }, (_, k) => m5(k));
