// 7c · M3 The trip not taken (docs/build/campaign-design.md §10.3; campaigns.md §2). Any home: an old soloist at the
// home outfitter's dock can't go this year. Each year's has a fixed name, a local past and a family (minis.js SOLOISTS:
// "Arvid Lund, retired from the Virginia plant; his daughter drove him up"). He asks you to paddle his route and bring
// back a picture from five places on his list (photo matches: a print taken on each lake). Saying yes to him is the yes
// (an accept choice). Back at the dock with all five: his thanks ($30 at the tally). Ends without you: he goes home at
// freeze-up; the page keeps the pictures you got. Never Walt (bible §9: Walt is never shown after 1998): no line or
// lake of his names Walt, Canada, a stone, a stump or a starred site (scripts/cmp-7c-unit.mjs checks). Yearly.
//
// Facts (ep.M3_<k>.): shot.<i> (a print on his list's i-th lake) · all · back (shown him all five) · shut
import { CYCLES, cycleWhen, idOf, soloist } from '../../minis.js';

export function m3(k) {
  const id = idOf('M3', k), P = `ep.${id}`, S = soloist(k);
  return {
    id, kind: 'mini', title: 'The trip not taken', slot: false, region: { eps: [] }, mini: 'M3', cycle: k,
    window: { date: '05-15..11-10', when: cycleWhen(k), reopen: 'yearly' },
    cast: ['soloist'],
    soloist: S,
    doors: [
      { kind: 'person', who: 'soloist', line: `m3.hello.${S.s}` },   // at the home dock: meeting him starts nothing
      { kind: 'choice', yes: true },                                  // "I'll go." (feed-minis.js: episodes.yes)
    ],
    started: `f:${P}.yes`,
    steps: [
      { when: `count(${P}.shot.*)>=${S.route.length}`, then: [`f:${P}.all`] },
      { when: `f:${P}.back`, then: ['pay:30@m3.pay', `f:${P}.paid`] },
    ],
    ends: [
      { id: 'thanks', when: `f:${P}.back`, line: 'm3.end.thanks' },
      { id: 'home', when: `f:${P}.shut & !f:${P}.back`, line: 'm3.end.home' },
    ],
    page: [
      { when: 'true', text: `m3.page.who.${S.s}` },
      { when: 'true', text: `m3.page.list.${S.r}` },
      { when: `count(${P}.shot.*)>=1`, text: 'm3.page.first' },
      { when: `count(${P}.shot.*)>=3`, text: 'm3.page.three' },
      { when: `f:${P}.all`, text: 'm3.page.all' },
    ],
    first: 'm3.first',
    feeds: [],
    climax: null,
  };
}
export default Array.from({ length: CYCLES }, (_, k) => m3(k));
