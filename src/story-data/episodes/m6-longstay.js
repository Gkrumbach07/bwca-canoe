// 7c · M6 The long stay (docs/build/campaign-design.md §10.3; campaigns.md §2). Any counter: a topic you start. Go in and
// stay thirty days with one resupply; the project is yours (a record goal: fifty lakes, every species, a photo series,
// thirty nights out; record.js and the book count it: feed-minis.js longCounts). Choosing the project at the counter is
// the yes. Little story, real weight. No set piece, no window ("any 30 days"); it ends as yours either way: the goal
// reached, or the thirty days over. Not yearly (§10.3: "—").
//
// Facts (ep.M6.): p.<project> (the choice) · half · done · over · resupply.1|2 (the store visits)
import { LONG_PROJECTS } from '../../minis.js';

const P = 'ep.M6';
export default {
  id: 'M6', kind: 'mini', title: 'The long stay', slot: false, region: { eps: [] }, mini: 'M6',
  window: { always: true },
  cast: [],
  doors: [
    { kind: 'place', yes: true, when: LONG_PROJECTS.map((p) => `f:${P}.p.${p.id}`).join(' | ') }, // the project chosen at a counter
  ],
  started: `f:${P}.yes`,
  topics: [
    { id: 'M6.ask', once: true, ask: 'm6.ask', when: `!f:${P}.yes & in:store`, say: 'm6.say' },
    ...LONG_PROJECTS.map((p) => ({ id: `M6.p.${p.id}`, ask: `m6.ask.${p.id}`, when: `f:asked.walt.M6.ask & !f:${P}.yes & in:store`, say: `m6.say.${p.id}`, then: [`f:${P}.p.${p.id}`] })),
  ],
  steps: [],
  ends: [
    { id: 'done', when: `f:${P}.done`, line: 'm6.end.done' },
    { id: 'yours', when: `f:${P}.over & !f:${P}.done`, line: 'm6.end.yours' },
  ],
  page: [
    ...LONG_PROJECTS.map((p) => ({ when: `f:${P}.p.${p.id}`, text: `m6.page.${p.id}` })),
    { when: `f:${P}.half`, text: 'm6.page.half' },
    { when: `f:${P}.resupply.1`, text: 'm6.page.resupply' },
    { when: `f:${P}.resupply.2`, text: 'm6.page.second' },
  ],
  first: 'm6.first',
  feeds: [],
  climax: null,
};
