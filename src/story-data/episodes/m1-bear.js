// 7c · M1 The raspberry bear (docs/build/campaign-design.md §10.3; docs/plans/campaigns.md §2). A bear on a chain of
// lakes has learned that campers mean food. The ranger's notice on the boards at Moose Lake 25 and Farm 31 (July–August)
// is the yes. The chain's parties are the witnesses (feed-minis.js: their raids at real parties' real sites, a torn pack
// in a party's word); the signs at three of the chain's sites (claw marks on a hung pack, scat full of raspberry seeds, a
// barrel dragged into the brush) give its range and hours; a night watch at the chain shows it (bearsign). The choice:
// document it for the ranger (relocation at a site you pick at the counter: the fee, $40 at the tally) or teach the
// chain's camps to hang food (three camps) until it gives up. Ends without you: rangers trap it in September; its fate
// counts the camps that fed it, yours included. Yearly: a new chain each cycle (minis.js).
//
// Facts (all under ep.M1_<k>.): sign.claw|scat|barrel (the layer's Look at a sign) · range · seen (watched it come) ·
// photo (a print of it at night) · documented · site.a|b|c + relocate (the counter) · taught.<party> · gaveup ·
// fed.1… (threshold: the nights it was fed on the chain) · fedme (one of them yours) · shut (the window) · paid
import { CYCLES, cycleWhen, idOf, chainOf, RELOCATE } from '../../minis.js';

export function m1(k) {
  const id = idOf('M1', k), P = `ep.${id}`, ch = chainOf(k);
  return {
    id, kind: 'mini', title: 'The raspberry bear', slot: false, region: { eps: [25, 31] }, mini: 'M1', cycle: k,
    window: { months: '7-8', when: cycleWhen(k), reopen: 'yearly' },
    cast: ['ranger'],
    flyer: { ep: [25, 31], text: `m1.notice.${ch}`, style: 'notice' },
    doors: [
      { kind: 'flyer', yes: true },                                   // the ranger's notice taken: the yes
      { kind: 'person', who: 'party', line: 'm1.bark.torn' },         // a party on the chain with a torn pack: starts nothing
      { kind: 'rumour', line: 'm1.rumour' },                          // a keeper's word: starts nothing
    ],
    started: `f:${P}.yes`,
    chain: ch,
    steps: [
      { when: `count(${P}.sign.*)>=2`, then: [`f:${P}.range`] },
      { when: `f:${P}.range & (f:${P}.seen | f:${P}.photo)`, then: [`f:${P}.documented`] },
      { when: `count(${P}.taught.*)>=3 & !f:${P}.relocate`, then: [`f:${P}.gaveup`] },
      { when: `f:${P}.relocate`, then: ['pay:40@m1.pay', `f:${P}.paid`] },
    ],
    // the counter at 25 or 31, once it is documented: where the ranger moves it (60's "a site you pick")
    topics: [
      { id: `${id}.bear`, once: true, ask: 'm1.ask.bear', when: `f:${P}.yes & !f:${P}.end & !f:${P}.documented & (ep:25 | ep:31)`, say: 'm1.say.bear' },
      ...RELOCATE.map((s) => ({ id: `${id}.site.${s}`, ask: `m1.ask.site.${s}`, when: `f:${P}.documented & !f:${P}.relocate & !f:${P}.gaveup & !f:${P}.end & (ep:25 | ep:31)`, say: 'm1.say.site', then: [`f:${P}.site.${s}`, `f:${P}.relocate`] })),
    ],
    ends: [
      { id: 'relocated', when: `f:${P}.relocate`, line: 'm1.end.relocated' },
      { id: 'gaveup', when: `f:${P}.gaveup`, line: 'm1.end.gaveup' },
      { id: 'trapped', when: `f:${P}.shut & !f:${P}.fed.4`, line: 'm1.end.trapped' },
      { id: 'lost', when: `f:${P}.shut & f:${P}.fed.4`, line: 'm1.end.lost' },
    ],
    page: [
      { when: 'true', text: `m1.page.chain.${ch}` },
      { when: `f:${P}.sign.claw`, text: 'm1.page.claw' },
      { when: `f:${P}.sign.scat`, text: 'm1.page.scat' },
      { when: `f:${P}.sign.barrel`, text: 'm1.page.barrel' },
      { when: `f:${P}.range`, text: 'm1.page.range' },
      { when: `f:${P}.seen`, text: 'm1.page.seen' },
      { when: `f:${P}.photo`, text: 'm1.page.photo' },
      { when: `count(${P}.taught.*)>=1`, text: 'm1.page.taught' },
      { when: `f:${P}.fed.2`, text: 'm1.page.fed' },
      { when: `f:${P}.fedme`, text: 'm1.page.fedme' },
    ],
    first: 'm1.first',
    feeds: [],
    climax: null,
  };
}
export default Array.from({ length: CYCLES }, (_, k) => m1(k));
