// Every record on the one runner (episodes.js), in one list: the story is built with their compiled rules from its
// construction (rules-episodes.js → all-rules.js), so the data hash holds (chk-coop C2). A stream adds its record here,
// one import line (A2's arc-mining.js: the join).
import S7 from './s7-mummos.js';
import S9 from './s9-coffee.js';
import mining from './arc-mining.js'; // a2: the mining years' arc (the join)
import S1 from './s1-ollie.js'; // s: the man on the portage (Round 4)
import S8 from './s8-sled.js'; // s: the sled on the lunch rock (Round 4)

export const EPISODES = [S7, S9, mining, S1, S8]; // (s: S1, S8)
