// S7 · Mummo's (docs/story/60-side-stories.md S7; campaign-design Part 4 Round 2, the second slice's step 13). The
// words are the doc's, by id (text/side.json). Rose's notice on Gus's board at Moose Lake 25 is the flyer (31 GY-T6,
// about 25 May – 25 June): taking it is the yes. Rose at the window on Tuesdays; "Where are the lilacs?" rings the Inlet
// Bay shore (inking Mummo's if pencilled: leads-act1.js INK); the place past P194 on the US shore (s7.mummos); a June
// print of the lilacs at the old camp, shown to her ("Look at this", show.js): S7.conv.7–9 and $25. It never ends
// without you (60: "It doesn't"); owner call 7: it ends with Rose this round (Aili's hand-in is Round 6).
export default {
  id: 'S7', kind: 'side', title: 'Mummo\'s', slot: false, region: { eps: [25] },
  // the notice's dates (31 GY-T6) and Rose's Tuesdays; the lilacs' own bloom is season.js lilacBloom (window:lilac)
  window: { date: '05-25..06-25', reopen: 'yearly' },
  cast: ['rose'],
  flyer: { ep: 25, text: 'S7.notice', style: 'photo', want: 'place' },
  doors: [
    { kind: 'flyer', yes: true },                       // taking the notice is the yes
    { kind: 'person', who: 'rose' },                    // Tuesdays at the window: meeting her starts nothing
    { kind: 'rumour', line: '70.6.1.11' },              // the keepers' rumour (ambient.js's own pool): names the place
    { kind: 'entry', nb: 'NB35' },                      // read anywhere: a head start; at the step, the swimming rock
  ],
  started: 'f:ep.S7.yes',
  places: ['s7.mummos'],
  // Rose's table by Moose Lake 25's window, Tuesdays (owner call 8: a table by the store's window; the hours a default)
  rose: { ep: 25, when: 'dow:tue & hour:9-15' },
  // the camera's survey here (feed-episodes.js, by the layer's props): "the lilacs at the old camp" (lilacs in bloom in
  // frame at this shore) and "the stone step" (60 S7 The set piece)
  photo: [
    { id: 's7.lilacs.camp', words: 'S7.the-set-piece.c1', props: ['s7.lilacs', 's7.lilacs2'], d: 80, deg: 24, when: 'window:lilac' },
    { id: 's7.step', words: 'S7.the-set-piece.c2', props: ['s7.step'], d: 22, deg: 22 },
  ],
  pins: ['s7.lilacs.camp'],
  // show.js: what Rose wants to see (a print of the lilacs at the old camp), and what she says
  wants: [{ who: 'rose', print: 's7.lilacs.camp', when: 'f:ep.S7.yes & !f:ep.S7.shown', say: ['S7.conv.7', 'S7.conv.8', 'S7.conv.9'], then: ['f:ep.S7.shown'] }],
  steps: [
    // Rose's $25 for the print (D's pay: handler: owed now, paid at the next trip-end tally with the line "$25 from
    // Rose.", 60 S7 "What it gives", until the writers give the tally its own words)
    { when: 'f:ep.S7.shown', then: ['pay:25@d95.S7.pay', 'f:ep.S7.paid'] }, // (x: the tally's drafted line, docs/story/95)
  ],
  // not steps (no yes needed): the main story's line when a player swims off the rock (60 S7 The place)
  rules: [
    { id: 'ep.S7.swim', when: 'f:ep.S7.swam & f:nb.found', then: ['walt:S7.the-place.w2'] },
  ],
  ends: [{ id: 'rose', when: 'f:ep.S7.shown', line: 'S7.end' }],
  page: [
    // x: begin (60 §0.3: the page lines were never written; drafted in the player's hand, docs/story/95; the notice's
    // own words head the page once it is taken, episodes.js notice)
    { when: 'f:ep.S7.rose', text: 'd95.S7.page.rose' },
    { when: 'f:rose.said.whose', text: 'd95.S7.page.whose' },
    { when: 'f:ep.S7.asked', text: 'd95.S7.page.where' },
    { when: 'f:rose.said.boys', text: 'd95.S7.page.boys' },
    { when: 'f:ep.S7.step | f:ep.S7.ashore', text: 'd95.S7.page.step' },
    // x: end
    { when: 'here:NB35', text: 'S7.the-place.w1' },
  ],
  titles: [{ when: 'f:ep.S7.asked | read:NB35', title: 'Mummo\'s' }, { when: 'true', title: 'Rose G.' }],
  first: 'S7.first',
  feeds: ['ink.mummos'],
  climax: null,
};
