// The informant's rules (campaign stream i, Round 5; docs/story/32-the-boys.md §5.10–§5.17, §6; campaign-design §5.2
// "Lies", "The informant is no special code", §12 "Never stuck"). The scenes are data (informant.js) played by topics.js;
// these are the patterns across them: the case's pieces and the Walt page's lines in the player's words (32 §6), Frank
// cleared, the reveal opened, the note's fallback, the choice's consequences under the names the endings read. Every
// effect is a `when:` on facts and notebook marks (a migrated or re-run save gets them). In story.js's data from its
// construction (all-rules.js), never added later (chk-coop C2).
//
// Pieces other streams write and these count: case.denny.nicknames (b5: Carol, the fire, Sparky), case.denny.rochester
// (b5: Bob), case.denny.message (a3: the register's message and Denny's card, the pad). The canary's piece is written by
// informant-cast.js the day it comes back (it names a lake: canary.hard).
const NICKS = '(f:boys.nicknames | f:denny.sparky | f:denny.deduced)';
export const RULES_INFORMANT = [
  // --- the case (32 §6) ----------------------------------------------------------------------------------------------------
  // tell 1 + a dated record: the register's weekday column, Sheila's page two (Fri 18 Oct) → the 17th was a Thursday
  { id: 'i.cal', when: 'f:gy.register | f:sheila.report', then: ['f:cal.2019-10-17.thu'] },
  { id: 'i.tuesday', when: 'f:denny.tell1 & f:cal.2019-10-17.thu', then: ['f:lie.denny.tuesday', 'f:case.denny.tuesday=soft', 'walt:32:6.3'] },
  // tell 2: "He said he was in all week." (the register adds the Monday)
  { id: 'i.allweek', when: 'f:denny.tell2', then: ['f:case.denny.inallweek=soft', 'walt:32:5.12.w2'] },
  { id: 'i.allweek.monday', when: 'f:denny.tell2 & f:gy.register', then: ['walt:32:5.12.w2b'] },
  // tell 3: "Somebody talked."
  { id: 'i.talked', when: 'f:denny.tell3', then: ['f:case.denny.talked=soft', 'walt:32:5.12.w3'] },
  // N34–N35 decoded (NB78, NB79) with the nicknames known: Whiskey the Kek, Sparky the river
  { id: 'i.river', when: `read:NB78 & read:NB79 & ${NICKS}`, then: ['f:case.denny.river=soft', 'walt:32:6.2'] },
  // 5.13 #3 the deduction: Frank's "the Kek", Denny's "the river", N34 read: the page matches the names itself
  { id: 'i.deduce', when: 'f:frank.kek & f:denny.rings & read:NB78 & !f:boys.nicknames & !f:denny.sparky', then: ['f:denny.deduced', 'f:case.denny.nicknames=soft', 'walt:32:5.13.deduce'] },
  // 5.10 the Isabella camp: the receipt; with N35 read, the Tuesday; with Denny's rings, the piece
  { id: 'i.receipt', when: 'f:isabella.receipt', then: ['walt:32:5.10.w'] },
  { id: 'i.receipt.n35', when: 'f:isabella.receipt & read:NB79', then: ['walt:32:5.10.w35'] },
  { id: 'i.isabella', when: 'f:isabella.receipt & f:denny.rings', then: ['f:case.denny.isabella=soft'] },
  // the canary seen or heard (informant-cast.js writes case.denny.canary with the lake): the page's line
  { id: 'i.canary.seen', when: 'f:case.denny.canary & f:canary.how=seen', then: ['walt:32:5.11.seen'] },
  { id: 'i.canary.heard', when: 'f:case.denny.canary & f:canary.how=heard', then: ['walt:32:5.11.heard'] },
  { id: 'i.canary.shared', when: 'f:canary.shared', then: ['walt:32:5.11.shared'] },
  // the note (32 §5.17): a soft piece
  { id: 'i.note', when: 'f:denny.note', then: ['f:case.denny.note=soft', 'walt:32:6.7'] },

  // --- Frank cleared (32 §5.13): the canary told only to him came back empty; the nicknames and N34–N35; the deduction ------
  { id: 'i.clear.canary', when: 'f:canary.clear.frank', then: ['f:frank.cleared', 'walt:32:5.11.clear'] },
  { id: 'i.clear.bob', when: 'f:canary.clear.bob', then: ['walt:d95.i.clear.bob'] },
  { id: 'i.clear.nicks', when: `${NICKS} & read:NB78 & read:NB79`, then: ['f:frank.cleared'] },
  { id: 'i.clear.deduce', when: 'f:denny.deduced', then: ['f:frank.cleared'] },
  { id: 'i.frank.whiskey', when: 'f:frank.whiskey', then: ['walt:32:5.14.flare'] },
  { id: 'i.frank.notfrank', when: 'f:frank.notfrank', then: ['walt:32:6.14'] },
  // the folder (5.13): its line; after the reveal, the arithmetic
  { id: 'i.folder', when: 'f:frank.folder', then: ['walt:32:5.13.folder.w'] },
  { id: 'i.folder.sum', when: 'f:frank.folder & f:denny.revealed', then: ['walt:32:5.13.folder.w2'] },

  // --- the reveal (campaign-design §5.2: three pieces, one hard, met twice; or the note) -------------------------------------
  { id: 'i.reveal.open', when: 'count(case.denny.*)>=3 & any(case.denny.*=hard) & met:denny>=2', then: ['f:denny.reveal.open'] },
  { id: 'i.reveal.note', when: 'f:denny.note', then: ['f:denny.reveal.open'] },
  // the gives (32 §5.15): the call, L2E (locks.js reads denny.revealed), the heading resolved
  { id: 'i.revealed', when: 'f:denny.revealed', then: ['walt:32:5.15.call', 'walt:32:5.15.hill', 'walt:32:5.15.resolved', 'f:knows.wade'] },
  // the choice under the names the endings and the run read (endings.js: denny.turned / toldon / left; run.js: choice.denny)
  { id: 'i.turned', when: 'f:choice.denny=turn', then: ['f:denny.turned'] },
  { id: 'i.toldon', when: 'f:choice.denny=told', then: ['f:denny.toldon'] },
  { id: 'i.left', when: 'f:choice.denny=left', then: ['f:denny.left'] },

  // --- never stuck (§12): the note after the canoe adrift, or three weeks after tier 4 -----------------------------------
  { id: 'i.note.due', fallback: 'denny.reveal.open', when: '(f:ev.adrift | (f:tier.4 & days.since(tier.4)>=21)) & !f:denny.revealed', then: ['f:denny.note.due'] },
];
