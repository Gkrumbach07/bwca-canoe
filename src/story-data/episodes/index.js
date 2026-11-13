// Every record on the one runner (episodes.js), in one list: the story is built with their compiled rules from its
// construction (rules-episodes.js → all-rules.js), so the data hash holds (chk-coop C2). A stream adds its record here,
// one import line (A2's arc-mining.js: the join).
import S7 from './s7-mummos.js';
import S9 from './s9-coffee.js';
import mining from './arc-mining.js'; // a2: the mining years' arc (the join)
// 7a: begin
import S2 from './s2-squatch.js';
import S3 from './s3-lights.js';
import S4 from './s4-wolves.js';
const SIDE7A = [S2, S3, S4];
// 7a: end
import guiding from './arc-guiding.js'; // a3: the guiding years' arc (Round 4)

export const EPISODES = [S7, S9, mining, guiding, ...SIDE7A]; // (a3: guiding; 7a: ...SIDE7A)
