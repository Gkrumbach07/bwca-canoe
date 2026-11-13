#!/usr/bin/env node
// The far end's places, written into src/story-places.json (story Round 3, stream F; docs/story/50-finale.md §2–§6.9,
// 03-places.md §2). The camp's inside is laid out here in the cabin's own frame (x the left hand as you come in at the
// front door, z out of the back door toward the pit at ~126°) and turned into the world's x/z offsets the resolver
// reads, so the json stays plain data. Run it, then `node scripts/story-places.mjs --write`.
//   node scripts/far-places.mjs        (replaces this stream's entries; leaves every other place as it is)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const F = path.join(ROOT, 'src', 'story-places.json');
const PJ = JSON.parse(fs.readFileSync(F, 'utf8'));
const MINE = /^(gull\.|pond4747\.|waltcamp$|cellar$|stash\.)/;

const r2 = (v) => Math.round(v * 100) / 100;
const BEAR = 126, YAW = +(Math.atan2(Math.sin(BEAR * Math.PI / 180), -Math.cos(BEAR * Math.PI / 180))).toFixed(4); // (54°: the cabin's +z on 126°)
const fwd = [Math.sin(BEAR * Math.PI / 180), -Math.cos(BEAR * Math.PI / 180)], left = [fwd[1] * -1 * -1, -fwd[0]]; // left of facing 126° is 36°
left[0] = Math.sin(36 * Math.PI / 180); left[1] = -Math.cos(36 * Math.PI / 180);
const W = (x, z) => [r2(x * left[0] + z * fwd[0]), r2(x * left[1] + z * fwd[1])]; // cabin frame → world offsets
const dot = (name, when = 'true') => [{ when, name }];
const FLOOR = 0.22;
const inside = (id, x, z, kit, o = {}) => ({ id: `waltcamp.${id}`, kit, at: W(x, z), yaw: YAW, show: 'true', ...o });

const places = [
  // 50 §2: the landing sign at the dam, the creek mouth of Gull's east bay
  { id: 'gull.sign', name: 'Gull Lake, the east bay: the beaver dam at the creek mouth (the far end\'s landing)', doc: '50 §2; 03 §2 step 1; 90 §4',
    x: -19790, z: 26772, lake: 'Gull Lake', clear: 6, r: 40,
    props: [
      { id: 'gull.dam', kit: 'creekDam', at: [-5, -1], opts: { w: 14 }, show: 'true', wet: 'any' },
      { id: 'gull.stump', kit: 'stumpCut', at: [3, 3], show: 'true', wet: 'any', dot: dot('Stump') },
      { id: 'gull.stone', kit: 'quartzCobble', on: 'gull.stump', at: [3, 3], show: 'true', wet: 'any', dot: dot('White stone') },
      { id: 'gull.rod', kit: 'rodStanding', at: [1.4, 1.6], show: 'lowwater', wet: 'any', dot: dot('Old pipe') },
      { id: 'gull.step', kit: 'mudStep', at: [2, 2.2], show: 'lowwater', wet: 'any' },
    ],
    verbs: [],
    triggers: [
      { on: 'enter', r: 700, then: ['f:gull.eastbay'] },
      { on: 'enter', r: 25, then: ['f:gull.dam'] },
      { on: 'enter', r: 25, when: 'lowwater', then: ['f:gull.stump.lowwater', 'f:gull.rod.seen'] },
    ] },
  // 03 §2a: the burnt point, the headland closing the east bay on the north-west; NB55 read (or opened) here, on the line
  { id: 'gull.burntpoint', name: 'Gull Lake, the burnt point (the headland closing the east bay)', doc: '03 §2a; 10 NB55; lock 3 key C',
    x: -21250, z: 26550, lake: 'Gull Lake', r: 260, props: [], verbs: [],
    triggers: [
      { on: 'readHere', nb: 'NB55', r: 300, then: ['f:nb.burntpoint'] },
      { on: 'stand', s: 6, r: 260, when: 'read:NB55', then: ['f:nb.burntpoint'] },
    ] },
  // 03 §2a: the notch cut in the crest behind the creek mouth, the skyline from the bay (built from far off)
  { id: 'gull.notch', name: 'The notch on the rise behind Gull\'s creek mouth', doc: '03 §2a; 90 §13 check 5',
    x: -19340, z: 26805, clear: 24, r: 30, far: 2400,
    props: [{ id: 'gull.notch', kit: 'notchCleft', at: [0, 0], show: 'true', opts: { gap: 7, h: 11 } }], verbs: [], triggers: [] },
  // 50 §3.1: the flowage's east bank, the 1976 crew line's orange dabs on fire-killed pine
  { id: 'pond4747.eastbank', name: 'The flowage behind Gull\'s dam, the east bank (pond 4747)', doc: '50 §3.1; 03 §2 step 2; lock 5 key C',
    x: -19768, z: 26960, r: 70,
    props: [
      { id: 'gull.blaze.1', kit: 'burntSnag', at: [-2, -55], opts: { dab: true }, show: 'true', dot: [{ when: 'f:tauno.blazes', name: 'Old blaze' }, { when: 'true', name: 'Burnt pine' }] },
      { id: 'gull.blaze.2', kit: 'burntSnag', at: [1, 30], opts: { dab: true }, show: 'true', dot: [{ when: 'f:tauno.blazes', name: 'Old blaze' }, { when: 'true', name: 'Burnt pine' }] },
      { id: 'gull.blaze.3', kit: 'burntSnag', at: [5, 88], opts: { dab: true }, show: 'true', dot: [{ when: 'f:tauno.blazes', name: 'Old blaze' }, { when: 'true', name: 'Burnt pine' }] },
    ],
    verbs: [],
    triggers: [{ on: 'enter', r: 70, then: ['f:ev.blazes=pond4747'] }] },
  // 50 §4: Walt's camp on the knob, under the cedar
  { id: 'waltcamp', name: 'The knob behind Gull\'s flowage: Walt\'s camp under the cedar', doc: '50 §4; 03 §2 step 3; lock 6 key A',
    x: -19385, z: 27355, clear: 7, r: 40, hideFromMap: true,
    props: [
      { id: 'waltcamp.cabin', kit: 'waltcamp', at: [0, 0], yaw: YAW, show: 'true', solid: true },
      inside('cot', 0.78, -0.35, 'spot', { opts: { y: FLOOR + 0.4, r: 0.45 }, dot: dot('Cot') }),
      inside('boots', 0.72, -0.6, 'spot', { opts: { y: FLOOR + 0.12, r: 0.18 }, dot: dot('Boots') }),
      inside('stove', 0.78, 1.05, 'spot', { opts: { y: FLOOR + 0.35, r: 0.32 }, dot: dot('Stove') }),
      inside('shelf', 0.07, 1.28, 'spot', { opts: { y: FLOOR + 0.75, r: 0.4 }, dot: dot('Shelf') }),
      inside('corebox', -0.12, 1.28, 'spot', { opts: { y: FLOOR + 0.4, r: 0.2 }, dot: dot('Core box') }),
      inside('photo', -0.12, 1.25, 'photograph', { lift: FLOOR + 0.93, show: '!f:camp.photo', dot: dot('Photograph') }),
      inside('note', -0.12, 1.25, 'noteSquare', { lift: FLOOR + 0.93, show: 'f:camp.photo & !f:camp.june', dot: dot('Note') }),
      inside('marks', 0.42, -1.42, 'spot', { opts: { y: 1.3, r: 0.25 }, dot: dot('Pencil marks') }),
      inside('hatchet', 0.2, -1.4, 'spot', { opts: { y: 1.5, r: 0.18 }, dot: dot('Hatchet') }),
      inside('sun', -0.65, 1.42, 'spot', { opts: { y: 1.45, r: 0.22 }, dot: dot('Pencil sun') }),
      inside('floor', 0.25, 0.85, 'floorboard', { show: '!f:nb.torn', dot: dot('White stone') }),
      inside('floor.up', 0.25, 0.85, 'floorboard', { show: 'f:nb.torn', opts: { lifted: true }, dot: dot('White stone') }),
      inside('can', 0.25, 0.75, 'coffeeCan', { show: 'f:nb.torn', dot: dot('Coffee can') }),
      // the cedar island on the knob's lee (north-east) side
      ...[[4, -5], [7.5, -1], [2, -8.5], [8, -6.5], [5, -11], [10.5, -3.5], [12, -8], [-2.5, -9]].map(([x, z], k) => ({ id: `waltcamp.cedar.${k + 1}`, kit: 'cedar', at: [x, z], show: 'true' })),
      // two knee-high stumps sawn before the fire, near the knob on the way up (S8's eye)
      { id: 'waltcamp.stump.1', kit: 'oldStump', at: [-21, -12], show: 'true', dotWhen: 'f:ep.S8.done', dot: dot('Cut stump') },
      { id: 'waltcamp.stump.2', kit: 'oldStump', at: [-27, -16.5], show: 'true', dotWhen: 'f:ep.S8.done', dot: dot('Cut stump') },
      // the core chips from the back door's step up the ridge (Tauno's core spill)
      ...[2.6, 6, 11, 18, 27, 38].map((d, k) => ({ id: `waltcamp.chips.${k + 1}`, kit: 'coreChips', at: [r2(fwd[0] * d + left[0] * 0.65), r2(fwd[1] * d + left[1] * 0.65)], yaw: YAW, show: 'true', dotWhen: 'f:tauno.pit', dot: dot('Core chips') })),
    ],
    verbs: [
      { prop: 'waltcamp.cot', verb: 'Sit', when: 'true', then: ['f:camp.cot'] },
      { prop: 'waltcamp.shelf', verb: 'Look', when: '!f:camp.shelf', then: ['f:camp.shelf'] },
      { prop: 'waltcamp.shelf', verb: 'Take', when: 'f:camp.shelf & !f:camp.shelf.taken', then: ['f:camp.shelf.taken', 'give:item.waltmatches', 'give:item.woolsocks', 'give:item.oldtin'] },
      { prop: 'waltcamp.corebox', verb: 'Look', when: '!f:camp.corebox', then: ['f:camp.corebox'] },
      { prop: 'waltcamp.photo', verb: 'Pick up', when: 'true', then: ['f:camp.photo', 'give:page.flycamp'] },
      { prop: 'waltcamp.note', verb: 'Read', when: 'true', then: ['f:camp.june', 'give:page.junenote', 'walt:50:4.5.w.june'] },
      { prop: 'waltcamp.marks', verb: 'Look', when: '!f:camp.marks', then: ['f:camp.marks', 'walt:50:4.6.w.marks'] },
      { prop: 'waltcamp.floor', verb: 'Lift', when: 'f:knows.stonesign', then: ['f:nb.torn', 'f:find.big.camp', 'walt:50:4.3.w.floor'] },
    ],
    triggers: [{ on: 'enter', r: 14, then: ['f:camp.found'] }] },
  // 50 §5: the cellar, the E-7 test pit on the ridge, 622 m at ~126° from the camp
  { id: 'cellar', name: 'The ridge above the knob: the old pit (the cellar)', doc: '50 §5; 03 §2 step 4; 90 §13 check 6',
    x: -18885, z: 27725, clear: 3.5, r: 30, hideFromMap: true,
    props: [
      { id: 'cellar.pit', kit: 'pit', at: [0, 0], show: '!f:pit.cleared', dotWhen: 'any(key.L6*)', dot: dot('Old pit') },
      { id: 'cellar.lid', kit: 'pitLid', at: [0, 0], show: 'f:pit.cleared & !f:pit.lifted', dot: dot('Lid') },
      { id: 'cellar.hole', kit: 'pitOpen', at: [0, 0], show: 'f:pit.lifted' },
      { id: 'cellar.can.1', kit: 'ammoCan', at: [-0.2, 0], lift: -0.7, show: 'f:pit.lifted & !f:pit.can.1', dot: dot('Can') },
      { id: 'cellar.can.2', kit: 'ammoCan', at: [0.2, 0.05], lift: -0.7, show: 'f:pit.lifted & !f:pit.can.2', dot: dot('Can') },
      { id: 'cellar.note', kit: 'fieldNote', at: [-0.2, 0], lift: -0.48, show: 'f:pit.lifted & !f:pit.note', dot: dot('Note') },
    ],
    verbs: [
      // the co-op gate (Part 3 #1): absent while a friend is in the room (peers: stream C's coop-story.js; kit 'pit')
      { prop: 'cellar.pit', verb: 'Clear the moss', when: 'any(key.L6*) & !iceseason & peers=0', then: ['f:pit.cleared'] },
      { prop: 'cellar.lid', verb: 'Lift', when: 'true', then: ['f:pit.lifted'] },
      { prop: 'cellar.note', verb: 'Pick up', when: 'true', then: ['f:pit.note', 'give:page.einonote', 'walt:50:5.3.w.eino'] },
      { prop: 'cellar.can.1', verb: 'Take', when: 'f:pit.note', then: ['f:pit.can.1'] },
      { prop: 'cellar.can.2', verb: 'Take', when: 'f:pit.note', then: ['f:pit.can.2'] },
    ],
    triggers: [] },
  // 50 §6.9: the run's stashes, each at its carry's end (by the carry, as the resolver finds it in the release)
  { id: 'stash.paddle', name: 'Pietro Lake, the P530 landing: the spare paddle under the cedar', doc: '50 §6.9; 10 NB66; lock 4 key E',
    portage: 'far.p530', end: [-22705, 26855], r: 25,
    props: [
      { id: 'stash.paddle.cedar', kit: 'cedar', at: [4.5, 13], show: 'true' },
      { id: 'stash.paddle', kit: 'sparePaddle', at: [2.4, 10], show: '!f:stash.paddle', dot: dot('Paddle') },
      { id: 'stash.paddle.stone', kit: 'quartzCobble', at: [2.8, 10], lift: 0.04, show: 'true', dot: dot('White stone') },
    ],
    verbs: [{ prop: 'stash.paddle', verb: 'Take', when: 'true', then: ['f:stash.paddle', 'f:stash.paddle.found', 'give:item.sparepaddle'] }],
    triggers: [{ on: 'enter', r: 9, then: ['f:stash.paddle.found'] }] },
  { id: 'stash.drybag', name: 'Camdre Lake, the top of the 121 (P24): the dry bag in the rocks', doc: '50 §6.9; 10 NB61, NB68',
    portage: 'far.p24', end: [-22275, 24745], r: 25,
    props: [{ id: 'stash.drybag', kit: 'dryBag', at: [3, 3.5], show: 'true', dot: dot('Dry bag') }],
    verbs: [{ prop: 'stash.drybag', verb: 'Open', when: '!f:stash.drybag', then: ['f:stash.drybag', 'give:item.scanner'] }],
    triggers: [] },
  { id: 'stash.grumman', name: 'Rock Island Lake, the north end of the 214 (P26): the old Grumman in the alders', doc: '50 §6.9; 10 NB62',
    portage: 'far.p26', end: [-20475, 22625], r: 25,
    props: [{ id: 'stash.grumman', kit: 'grumman', at: [5, 3], show: 'true', dot: dot('Canoe') }],
    verbs: [{ prop: 'stash.grumman', verb: 'Get under', when: 'run.active', then: ['f:stash.grumman.under'] }],
    triggers: [{ on: 'enter', r: 10, then: ['f:stash.grumman'] }] },
];

// the hidden carry (50 §3, 03 §2 steps 1–3): the dam's back, up the creek's east bank to pond 4747, east and up to the knob
const carries = [{
  id: 'story:gullcarry', doc: '50 §3; 03 §2; bible 6.5 3.5', hidden: true, lake: 'Gull Lake',
  launch: [-19797, 26764],
  way: [[-19787, 26770], [-19778, 26800], [-19784, 26842], [-19786, 26880], [-19770, 26920], [-19772, 26960], [-19769, 27000],
    [-19771, 27040], [-19790, 27072], [-19776, 27102], [-19756, 27126], [-19700, 27162], [-19600, 27222], [-19500, 27290],
    [-19422, 27334], [-19391, 27350]],
}];
const portages = [
  { id: 'far.p530', v3: 'P530', rods: 50, name: 'Pietro Lake – Gull Lake', doc: '50 §6.7 leg 2, §6.9 (the spare paddle)' },
  { id: 'far.p24', v3: 'P24', rods: 121, name: 'Camdre Lake – Clearwater Lake', doc: '50 §6.7 leg 3, §6.9 (the dry bag)' },
  { id: 'far.p26', v3: 'P26', name: 'Clearwater Lake – Rock Island Lake', doc: '50 §6.7 leg 5, §6.9 (the Grumman); drawn 217 rods, Walt\'s 214' },
];

PJ.places = (PJ.places || []).filter((p) => !MINE.test(p.id)).concat(places);
PJ.portages = (PJ.portages || []).filter((p) => !/^far\./.test(p.id)).concat(portages);
PJ.carries = (PJ.carries || []).filter((c) => c.id !== 'story:gullcarry').concat(carries);
fs.writeFileSync(F, JSON.stringify(PJ, null, 2) + '\n');
console.log(`far-places: ${places.length} places, ${carries.length} carry, ${portages.length} portages written (yaw ${YAW})`);
