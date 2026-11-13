// 7c · M2 Singing in the fog (docs/build/campaign-design.md §10.3; campaigns.md §2). On Lac La Croix at dawn in fog,
// French voices and a canoe song, and four big canoes pass that you never catch (fogvoices: mist.js's fog, the voices
// placed in it). Hearing them there is the yes (the thing done at its place); so is reading the logbook in its box at
// Loon Falls (a yes at its place). The logbook leads east along the voyageur road on the US side: a box at each falls and
// carry (Loon Falls, Curtain Falls, Basswood Falls, Prairie Portage's US end, Knife Lake), each with the brigade's line
// for the day before you came. Never settled. Owner, Part 3 #4: it never closes by itself, it stays open until solved:
// the logbook filled at all five, then a keeper says the brigade passed Grand Portage (past the edge). Not yearly.
//
// Facts (ep.M2.): heard (fogvoices: within earshot long enough) · close (got near, never caught) · log.<place> (the box
// read) · told (a keeper's word after the fifth) · end
import { FOG_ROUTE } from '../../minis.js';

const P = 'ep.M2';
export default {
  id: 'M2', kind: 'mini', title: 'Singing in the fog', slot: false, region: { eps: [12, 80] }, mini: 'M2',
  window: { always: true },          // (never closes by itself; the fog dawns themselves are Jun–Sep: feed-minis.js)
  cast: [],
  doors: [
    { kind: 'place', yes: true, when: `f:${P}.heard` },                // the voices heard on Lac La Croix at dawn
    { kind: 'place', yes: true, when: `f:${P}.log.loon` },             // the logbook read in its box at Loon Falls
    { kind: 'rumour', line: 'm2.rumour' },                             // a keeper at Little Vermilion: starts nothing
  ],
  started: `f:${P}.yes`,
  places: [],
  steps: [
    { when: `count(${P}.log.*)>=${FOG_ROUTE.length}`, then: [`f:${P}.filled`] },
  ],
  ends: [{ id: 'passed', when: `f:${P}.told`, line: 'm2.end' }],
  page: [
    { when: `f:${P}.heard`, text: 'm2.page.heard' },
    { when: `f:${P}.close`, text: 'm2.page.close' },
    ...FOG_ROUTE.map((r) => ({ when: `f:${P}.log.${r.id}`, text: `m2.page.log.${r.id}` })),
    { when: `f:${P}.filled`, text: 'm2.page.filled' },
  ],
  first: 'm2.first',
  feeds: [],
  climax: null,
};
