// Every stream's rules, in one list the story is built with (the Round 1 join). A rule added after the story attaches
// changes its data hash, and the quiet re-run that follows rewrites a co-op guest's own story2 before the join makes it a
// mirror (chk-coop C2, met by streams B, L and T). So no stream adds rules at runtime: each rules-*.js is listed here,
// (named all-rules.js, not rules-*.js: story-lint reads each rules-*.js once) and story.js builds every StoryV2 with this list unless a caller passes its own.
import { RULES_CORE } from './rules-core.js';
import { RULES_BOOK } from './rules-book.js';
import { RULES_LAYER } from './rules-layer.js';
import { RULES_TALK } from './rules-talk.js';
import { RULES_EPISODES } from './rules-episodes.js'; // e: every episode's steps (episodes/index.js)

export const RULES_ALL = [...RULES_CORE, ...RULES_BOOK, ...RULES_LAYER, ...RULES_TALK, ...RULES_EPISODES];
