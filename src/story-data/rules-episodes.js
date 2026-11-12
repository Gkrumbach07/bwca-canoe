// The episodes' rules (docs/build/campaign-design.md §10; Round 2 stream E): every record's yes doors, steps and ends
// compiled once (episodes.js compileEpisode), and each record's own extra rules (`rules`: what needs no yes, a main-story
// line), so story-lint checks them as rules and all-rules.js builds the story with them.
import { EPISODES } from './episodes/index.js';
import { compileEpisodes } from '../episodes.js';

export const RULES_EPISODES = [...compileEpisodes(EPISODES), ...EPISODES.flatMap((E) => E.rules || [])];
