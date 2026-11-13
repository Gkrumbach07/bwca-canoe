// Every record on the one runner (episodes.js), in one list: the story is built with their compiled rules from its
// construction (rules-episodes.js → all-rules.js), so the data hash holds (chk-coop C2). A stream adds its record here,
// one import line (A2's arc-mining.js: the join).
import S7 from './s7-mummos.js';
import S9 from './s9-coffee.js';
import mining from './arc-mining.js'; // a2: the mining years' arc (the join)
import family from './arc-family.js'; // a4: the family arc (Round 6)

export const EPISODES = [S7, S9, mining, family];
