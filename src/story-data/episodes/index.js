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
// 7b: begin
import S5 from './s5-plane.js';
import S6 from './s6-whiskey.js';
const SIDE7B = [S5, S6];
// 7b: end
import guiding from './arc-guiding.js'; // a3: the guiding years' arc (Round 4)
import S1 from './s1-ollie.js'; // s: the man on the portage (Round 4)
import S8 from './s8-sled.js'; // s: the sled on the lunch rock (Round 4)
import family from './arc-family.js'; // a4: the family arc (Round 6)
import { G_EPISODES } from '../endgames.js'; // g: the secret missions after the journalist ending (one record each)
// 7c: begin (the mini-campaigns M1–M6: one record per cycle for the yearly ones, minis.js)
import M1 from './m1-bear.js';
import M2 from './m2-fog.js';
import M3 from './m3-soloist.js';
import M4 from './m4-rangers.js';
import M5 from './m5-freezeup.js';
import M6 from './m6-longstay.js';
export const MINIS = [...M1, M2, ...M3, ...M4, ...M5, M6];
// 7c: end

export const EPISODES = [S7, S9, mining, guiding, S1, S8, ...SIDE7A, ...MINIS, family, ...SIDE7B, ...G_EPISODES /* g */]; // (a3: guiding; s: S1, S8; 7a: ...SIDE7A; 7c: ...MINIS; a4: family; 7b: ...SIDE7B; g: ...G_EPISODES)

