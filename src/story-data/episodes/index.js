// Every record on the one runner (episodes.js), in one list: the story is built with their compiled rules from its
// construction (rules-episodes.js → all-rules.js), so the data hash holds (chk-coop C2). A stream adds its record here,
// one import line (A2's arc-mining.js: the join).
import S7 from './s7-mummos.js';
import S9 from './s9-coffee.js';
import mining from './arc-mining.js'; // a2: the mining years' arc (the join)
// 7b: begin
import S5 from './s5-plane.js';
import S6 from './s6-whiskey.js';
const SIDE7B = [S5, S6];
// 7b: end

export const EPISODES = [S7, S9, mining, ...SIDE7B]; // (7b: ...SIDE7B)
