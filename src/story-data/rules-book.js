// The book's rules (stream B, Round 1; campaign-design §6.2, §6.3; docs/story/10-notebook.md §11): the Walt page's
// lines from reading and from understanding, and each page understood when its world confirmation holds. notebook.js
// adds these to the story (story.addRules) when the book is installed; story-lint.mjs reads them as it reads every
// rules-*.js. Every effect is a `when:` on facts and notebook marks, so a migrated or re-run save gets its lines.
//
// The words: walt-lines.js (each line's section) and text/nb.json (walt.nb.*, 10 §11.3 anchored by the writers).
import { UND, BACK_COVER, NICKS, NICK_PAGES } from './notebook.js';

// the entries on which a nickname first shows (any of Walt's own place names): reading one adds "He calls places by
// his own names." once (10 §11.3)
const nickPages = (kind) => [...new Set(NICKS.filter((n) => n.kind === kind).flatMap((n) => NICK_PAGES[n.nick] || []))].sort();

export const RULES_BOOK = [
  // --- from reading (10 §11.3 walt.nb.read; once each, when the page is first read) -------------------------------------
  { id: 'nb.read.nick', when: nickPages('place').map((nb) => `read:${nb}`).join(' | '), then: ['walt:walt.nb.read.1'] },
  { id: 'nb.read.v', when: 'read:NB35', then: ['walt:walt.nb.read.2'] },
  { id: 'nb.read.cups', when: 'read:NB04 & (read:NB06 | read:NB24)', then: ['walt:walt.nb.read.3'] },
  { id: 'nb.read.stub', when: 'f:nb.stub.seen', then: ['walt:walt.nb.read.4'] },
  { id: 'nb.read.fold', when: 'read:NB81', then: ['walt:walt.nb.read.5'] },
  // --- understood (10 §11.2): the margin note and the underline are drawn by the reader from und:<NB>; the Walt line is
  // the nickname matched (walt-lines.js gives the words where the docs do) -----------------------------------------------
  ...UND.filter((u) => u.when).map((u) => ({ id: `nb.und.${u.nb}`, when: u.when, then: [`und:${u.nb}`] })),
  // --- the back cover (campaign-design §6.2): 205/50 is lock 2 key B (locks.js reads f:bc.205-50); the others' ticks
  // and their "he was here" are written by the book itself on the carry (notebook.js), the line here --------------------
  ...BACK_COVER.filter((r) => r.line).map((r) => ({ id: `nb.bc.${r.n.replace('/', '-')}`, when: `f:bc.${r.n.replace('/', '-')}`, then: [`walt:${r.line}`] })),
];
