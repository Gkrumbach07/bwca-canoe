// The company and the press's rules (campaign Round 6, stream p; docs/story/40-company-and-press.md §2, §4.1, §5, §6.2;
// bible 6.4; campaign-design §12 "Never stuck"). The scenes are company.js's; these are the facts that follow from facts.
export const RULES_COMPANY = [
  // the second big finding, stamped (the fallback call counts trips from it)
  { id: 'p.big2', when: 'bigCount>=2', then: ['f:tauno.big2'] },
  // the fallback call (40 §6.2): no call by the third big finding, or two trips past the second with no Farm porch visit
  // (Tauno asks on the first porch visit after it); whoever of Marlys, Sheila, Carol or René the player sees first says so
  { id: 'p.fallback', when: '!f:tauno.call & !f:maggie.called & (bigCount>=3 | (trips.since(tauno.big2)>=2 & !f:tauno.call.asked))', then: ['f:maggie.fallback'] },
  // the midpoint (bible 6.4, 40 §4.1): the first trip that begins after two big findings, tier 2 and the call
  { id: 'p.midpoint', on: 'trip:start', when: 'bigCount>=2 & tier>=2 & (f:tauno.call | f:maggie.called | f:maggie.fallback)', then: ['f:midpoint'] },
  // the canoe adrift starts tier 4 if September hasn't already (40 §5)
  { id: 'p.tier4', when: 'tier>=3 & f:ev.adrift', then: ['f:tier.4'] },
  // the Walt page's second halves (40 §3.4 after N31, §4.2 after N36)
  { id: 'p.w.search', when: 'f:ev.search', then: ['walt:40.w.search.1'] },
  { id: 'p.w.search2', when: 'f:ev.search & read:NB81', then: ['walt:40.w.search.2'] },
  { id: 'p.w.stranger', when: 'f:ev.stranger', then: ['walt:40.w.stranger.1'] },
  { id: 'p.w.stranger2', when: 'f:ev.stranger & read:NB71', then: ['walt:40.w.stranger.2'] },
  { id: 'p.w.putin', when: 'f:wade.putin', then: ['walt:40.w.putin.1'] },
  // the canoe adrift's line: the echo known (the drift test, Ollie's or Tauno's account) or not
  { id: 'p.w.adrift', when: 'f:ev.adrift & (f:drift.done | any(ollie.*) | f:tauno.turn)', then: ['walt:40.w.adrift.echo'] },
  { id: 'p.w.adrift2', when: 'f:ev.adrift & !f:drift.done & !any(ollie.*) & !f:tauno.turn', then: ['walt:40.w.adrift.plain'] },
];
