// The guiding years' rules (story Round 4, stream A3; docs/story/31-guiding-years.md GY-06, GY-08, GY-11, GY-12). The
// scenes are data (guiding.js) played by topics.js; the places' verbs and triggers are story-places.json's (gy.* places)
// and guiding-cast.js's (the bunkhouse, the boathouse loft, the night). These are the patterns across them: the hinge,
// and the Walt-page lines that need two things held. Every effect is a `when:` on facts and notebook marks, so a migrated
// or re-run save gets them. In story.js's data from its construction (all-rules.js), never added later (chk-coop C2).
export const RULES_GUIDING = [
  // the hinge (bible 5.6, 31 GY-11 Gives): the one line for Walt turns from "They say Walt drowned." to "Went north." the
  // moment story.north holds: the drift test (stream m writes drift.done), or two of the others (Liisa's cards, Danielle's
  // log, the alders' stone, Gord). walt-lines.js's row for walt.nb.und.6 `replaces` 20:T4.w5 (drawn crossed out above it)
  { id: 'g.north', when: 'north', then: ['walt:walt.nb.und.6', 'f:knows.north'] },
  // "Two canoes, both found on the shore the wind couldn't put them on." (GY-11 with Eino's wind known; GY-09b with Ollie's log)
  { id: 'g.canoes', when: 'f:drift.done & (f:knows.eino | f:sheila.ollie)', then: ['walt:31:GY-11.gives.3', 'f:echo.canoes'] },
  // the alders (GY-11 optional): the white stone and the cut rope; it counts toward north (story.north reads birch.stone)
  { id: 'g.alders', when: 'f:drift.alders', then: ['walt:31:GY-11.alders.1', 'f:birch.stone'] },
  { id: 'g.alders.sign', when: 'f:drift.alders & f:aili.stone', then: ['walt:31:GY-11.alders.2'] },
  // Walt's way (stream m writes drift.walt): "Five hours, in the dark. Same as him." under N38
  { id: 'g.waltway', when: 'f:drift.walt', then: ['walt:31:GY-11.waltway.1'] },
  // the loft (GY-12): the register in hand: the two W.H.s, the message, and the lie set against what she kept
  { id: 'g.register', when: 'f:gy.register', then: ['walt:31:GY-12.5', 'walt:31:GY-12.6', 'f:knows.message', 'f:knows.wade.register'] },
  { id: 'g.register.lie', when: 'f:gy.register & f:said.marlys.week', then: ['walt:31:GY-12.c5', 'f:lie.marlys.week'] },
  // the number on the message is Denny's (hard informant evidence, bible 5.7): the register and Denny's card both held
  { id: 'g.denny', when: 'f:gy.register & (f:denny.card | f:nb.page.dennycard)', then: ['walt:31:GY-12.c4', 'f:case.denny.message=hard'] },
  // the rafter by the loft's window (GY-12): the initials; Eino's once his name is known
  { id: 'g.initials', when: 'f:gy.rafter', then: ['walt:31:GY-12.rafter.1'] },
  { id: 'g.initials.eino', when: 'f:gy.rafter & f:knows.eino', then: ['walt:31:GY-12.rafter.2'] },
  // Rick's canoe and NB83 together (GY-08 Gives): "That's the one."
  { id: 'g.rick.nb83', when: 'f:rick.canoe & read:NB83', then: ['walt:31:GY-08.canoe.9'] },
  // the arc's doors (the scenes write them; these hold a save that has only one half)
  { id: 'g.open', when: 'f:hap.met | f:marlys.met', then: ['f:door.guiding.open'] },
  { id: 'g.yield', when: 'f:hap.farend', then: ['f:door.guiding.yield'] },
  { id: 'g.done', when: 'f:choice.sheila', then: ['f:door.guiding.done'] },
  // the tow landing's real side, stood at (the Sucker end of P194) or told (Rick, Nate): what GY-05b needs
  { id: 'g.tow', when: 'f:gy.tow', then: ['f:gy.tow.seen'] },
];
