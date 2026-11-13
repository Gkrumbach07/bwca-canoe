// 7c · M4 The ranger crew (docs/build/campaign-design.md §10.3; campaigns.md §2; bible 4.9). Tom Becker and his partner
// keep turning up all summer: on the water (stream s's fixed party `tom`, Lake One and Insula) and at the Moose Lake 25 and
// Farm 31 counters on their days in. Three meetings, a favour each (existing board kinds: litter, blowdown; held at
// once, paid at the tally like any notice), a name at the second; in fall (October) the fourth favour is one of their
// last checks (lastcheck). The first favour taken is the yes (an accept choice). Ends without you: they rotate out in
// fall. Runs alongside the rest (no slot). Yearly: Tom stays Tom (bible); the partner changes (minis.js PARTNERS).
//
// Facts (ep.M4_<k>.): met.1|2|3 · favour.<n> (taken) · done.<n> (the notice done) · last (the fourth offered) · shut
import { CYCLES, cycleWhen, idOf, rangers } from '../../minis.js';

export function m4(k) {
  const id = idOf('M4', k), P = `ep.${id}`, R = rangers(k);
  return {
    id, kind: 'mini', title: 'The ranger crew', slot: false, region: { eps: [25, 31, 30] }, mini: 'M4', cycle: k,
    window: { months: '6-10', when: cycleWhen(k), reopen: 'yearly' },
    cast: ['tom'],
    partner: R,
    doors: [
      { kind: 'person', who: 'tom', line: '70.7.2.22' },              // Tom's "Where'd you come in? Good camp.": starts nothing
      { kind: 'choice', yes: true },                                  // the first favour taken (feed-minis.js: episodes.yes)
    ],
    started: `f:${P}.yes`,
    steps: [
      { when: `f:${P}.done.1 & f:${P}.done.2 & f:${P}.done.3`, then: [`f:${P}.three`] },
    ],
    ends: [
      { id: 'last', when: `f:${P}.done.4`, line: 'm4.end.last' },
      { id: 'rotated', when: `f:${P}.shut & !f:${P}.done.4`, line: 'm4.end.rotated' },
    ],
    page: [
      { when: 'true', text: 'm4.page.met1' },
      { when: `f:${P}.met.2`, text: `m4.page.partner.${R.p}` },
      { when: `f:${P}.met.3`, text: 'm4.page.met3' },
      { when: `f:${P}.three`, text: 'm4.page.three' },
      { when: `f:${P}.last`, text: 'm4.page.last' },
    ],
    first: 'm4.first',
    feeds: [],
    climax: null,
  };
}
export default Array.from({ length: CYCLES }, (_, k) => m4(k));
