// Every stream's rules, in one list the story is built with (the Round 1 join). A rule added after the story attaches
// changes its data hash, and the quiet re-run that follows rewrites a co-op guest's own story2 before the join makes it a
// mirror (chk-coop C2, met by streams B, L and T). So no stream adds rules at runtime: each rules-*.js is listed here,
// (named all-rules.js, not rules-*.js: story-lint reads each rules-*.js once) and story.js builds every StoryV2 with this list unless a caller passes its own.
import { RULES_CORE } from './rules-core.js';
import { RULES_BOOK } from './rules-book.js';
import { RULES_LAYER } from './rules-layer.js';
import { RULES_TALK } from './rules-talk.js';
import { RULES_BEATS } from './rules-beats.js'; // d: the director (stream D, Round 2)
import { RULES_MINING } from './rules-mining.js'; // a2: the mining years (Round 2)
import { RULES_EPISODES } from './rules-episodes.js'; // e: every episode's steps (episodes/index.js)
import { RULES_FAREND } from './rules-farend.js'; // f: the far end (Round 3)
import { RULES_ENDINGS } from './rules-endings.js'; // n: the endings' dated after-effects (Round 3)
import { RULES_X } from './rules-x.js'; // x: the campaign run's chapter 2 finish
import { RULES_GUIDING } from './rules-guiding.js'; // a3: the guiding years (Round 4)
import { RULES_COMPANY } from './rules-company.js'; // p: the company and the press (Round 6)
import { RULES_FAMILY } from './rules-family.js'; // a4: the family (Round 6)
import { RULES_SIDE7B } from './rules-side7b.js'; // 7b: S5 the chart (L2D, L3D), S6 the eye for a pit (L6C)
import { RULES_BOYS } from './rules-boys.js'; // b5: the boys (Round 5)
import { RULES_INFORMANT } from './rules-informant.js'; // i: the informant (Round 5)

export const RULES_ALL = [...RULES_CORE, ...RULES_BOOK, ...RULES_LAYER, ...RULES_TALK, ...RULES_BEATS, ...RULES_MINING, ...RULES_EPISODES, ...RULES_FAREND, ...RULES_ENDINGS, ...RULES_X, ...RULES_GUIDING, ...RULES_COMPANY, ...RULES_FAMILY, ...RULES_SIDE7B, ...RULES_BOYS, ...RULES_INFORMANT]; // (7b: ...RULES_SIDE7B)

