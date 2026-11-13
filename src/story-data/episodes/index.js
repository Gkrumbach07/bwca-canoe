// Every record on the one runner (episodes.js), in one list: the story is built with their compiled rules from its
// construction (rules-episodes.js → all-rules.js), so the data hash holds (chk-coop C2). A stream adds its record here,
// one import line (A2's arc-mining.js: the join).
import S7 from './s7-mummos.js';
import S9 from './s9-coffee.js';
import mining from './arc-mining.js'; // a2: the mining years' arc (the join)
// 7c: begin (the mini-campaigns M1–M6: one record per cycle for the yearly ones, minis.js)
import M1 from './m1-bear.js';
import M2 from './m2-fog.js';
import M3 from './m3-soloist.js';
import M4 from './m4-rangers.js';
import M5 from './m5-freezeup.js';
import M6 from './m6-longstay.js';
export const MINIS = [...M1, M2, ...M3, ...M4, ...M5, M6];
// 7c: end

export const EPISODES = [S7, S9, mining, ...MINIS /* 7c */];
