// The tent in its phases (the camp redone, 2026-10-24: "setting up tent should be done where you say set up tent, should
// go through phases, like flat staked, poles up, tent up, raintarp on"). camp.js pitches it where you stand to, holding
// E (hold.js) through four phases, and strikes it the same way backwards; each phase has its own look. Two kinds:
// - The dome (the dome and the four-season tent, items.js), its door on the side:
//   1. the footprint staked: a groundsheet flat on the ground, a stake at each corner;
//   2. the poles up: two shock-corded poles crossed corner to corner over it, arched;
//   3. the tent up: the inner tent clipped to the poles, pale canvas and its mesh top;
//   4. the rain fly on: the dome's coloured fly over all of it (props.js buildTentMesh).
// - The A-frame (the starting kit's), a ridge tent end on, its door at the front end (camp join, 2026-10-24: it was
//   drawn as the dome):
//   1. the floor staked: the tent's floor flat, a stake at each corner;
//   2. the A-poles up: an A of two poles at each end and the ridge pole between their tops;
//   3. the tent hung: the canvas hung from the ridge, its walls guyed out, the door in the front end;
//   4. the rain fly on: the fly over the ridge, the vestibule out over the door (props.js buildAFrameMesh).
// Between phases a part grows into place (the sheet unrolls, the poles stand up, the tent and the fly rise), so a hold
// let go mid-phase shows where it got to until the camp snaps it back to the last phase finished.
//
// Everything is drawn on the props' one material (prop-kit.js propMaterial, which the fly's mesh already uses): no new
// program. The ghost (where you would pitch: green on good ground, red where you can't) is a translucent copy of the
// fly and the footprint of each kind; its material is the only new one, and it is drawn every frame (parked far under
// the ground when not wanted), so it is compiled behind the title card and never in the frame it first shows.
import * as THREE from 'three';
import { buildTentMesh, buildAFrameMesh, TENT_SIZE, AFRAME_SIZE, aframeRidge } from './props.js';
import { TILE, PropBuilder } from './prop-kit.js';

const { a: TA, b: TB, h: TH } = TENT_SIZE;
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const C = (h) => new THREE.Color(h);
const ease = (k) => { const t = Math.min(1, Math.max(0, k)); return t * t * (3 - 2 * t); };
// the dome's footprint (a rounded rectangle) and its height at a share r of the way out, as props.js tentBuild draws it
const foot = (t) => { const c = Math.cos(t), s = Math.sin(t); return [TA * Math.sign(c) * Math.abs(c) ** 0.62, TB * Math.sign(s) * Math.abs(s) ** 0.62]; };
const hY = (r) => TH * Math.max(0, 1 - r ** 2.6) ** 0.55;

// The pitch, phase by phase: its name once done, what is being done meanwhile, its game minutes (a quarter hour in all,
// as the old pitch took) and its real seconds while E is held. The strike runs the other way, a phase per phase stood.
export const PITCH = [
  { name: 'Footprint staked', doing: 'Staking out the footprint', minutes: 4, seconds: 1.3 },
  { name: 'Poles up', doing: 'Raising the poles', minutes: 4, seconds: 1.3 },
  { name: 'Tent up', doing: 'Clipping the tent to the poles', minutes: 4, seconds: 1.3 },
  { name: 'Rain fly on', doing: 'Throwing the fly over and staking it out', minutes: 3, seconds: 1.2 },
];
export const STRIKE = [ // STRIKE[i] takes the tent from stage 4 - i to 3 - i
  { name: 'Fly off', doing: 'Unstaking the fly and folding it', minutes: 3, seconds: 1.1 },
  { name: 'Tent down', doing: 'Unclipping the tent from the poles', minutes: 3, seconds: 1.1 },
  { name: 'Poles down', doing: 'Folding the poles', minutes: 2, seconds: 1.0 },
  { name: 'Rolled up', doing: 'Pulling the stakes and rolling it all up', minutes: 3, seconds: 1.2 },
];
export const STAGE_WORDS = ['not pitched', 'the footprint staked', 'the poles up', 'the tent up, no fly', 'pitched, the fly on'];
const PITCH_A = [
  { name: 'Floor staked', doing: 'Staking out the floor, a corner at a time', minutes: 4, seconds: 1.3 },
  { name: 'A-poles up', doing: 'Standing up the A-poles at each end, the ridge pole between', minutes: 4, seconds: 1.3 },
  { name: 'Tent hung', doing: 'Hanging the tent from the ridge and guying out the walls', minutes: 4, seconds: 1.3 },
  { name: 'Rain fly on', doing: 'Throwing the fly over the ridge and staking out the vestibule', minutes: 3, seconds: 1.2 },
];
const STRIKE_A = [
  { name: 'Fly off', doing: 'Unstaking the vestibule and folding the fly', minutes: 3, seconds: 1.1 },
  { name: 'Tent down', doing: 'Unhooking the tent from the ridge', minutes: 3, seconds: 1.1 },
  { name: 'Poles down', doing: 'Taking down the ridge pole and the A-poles', minutes: 2, seconds: 1.0 },
  { name: 'Rolled up', doing: 'Pulling the stakes and rolling it all up', minutes: 3, seconds: 1.2 },
];
const STAGE_WORDS_A = ['not pitched', 'the floor staked', 'the A-poles up', 'the tent hung, no fly', 'pitched, the fly on'];
// the fly's colour by the tent (items.js): the A-frame rust, the dome green, the four-season blue
export const TENT_FLY = { aframe: 0xa8693f, dome: 0x5c7a55, fourseason: 0x56708a };
// each kind's phases, words and size (props.js: half across, half along the door's way; the A-frame's vestibule)
export const TENT_KINDS = {
  dome: { pitch: PITCH, strike: STRIKE, words: STAGE_WORDS, size: TENT_SIZE },
  aframe: { pitch: PITCH_A, strike: STRIKE_A, words: STAGE_WORDS_A, size: AFRAME_SIZE },
};
// a tent item's kind: the A-frame (and a save from before the phases, whose item is not known), else a dome
export const kindOf = (item) => (item == null || item === 'aframe' ? 'aframe' : 'dome');
export const tentOf = (item) => TENT_KINDS[kindOf(item)];

// --- the bugs' refuge (cons C, "bugs at dusk": bugs.js) ---------------------------------------------------------------
// The tent closed is the one place the mosquitoes and the blackflies can't follow: the fly on and zipped down, and you
// inside it (the Rest dial open, or the night). Up without its fly the door's mesh is left open to them, and with no
// tent standing the night is under the stars. → 'closed' | 'open' | 'stars'
export function shelterOf(camp) {
  const c = camp && camp.camp;
  return !c || !(c.stage >= 3) ? 'stars' : c.stage >= 4 ? 'closed' : 'open';
}
export const insideTent = (camp) => !!(camp && (camp.night || camp.dialOpen));
// bugs.js sets `out`: () => the bugs are out where you stand (the Rest with no fly then says they get in)
export const TENT_BUGS = { out: null };
const bugsOut = () => { try { return !!(TENT_BUGS.out && TENT_BUGS.out()); } catch { return false; } };

// --- the checklists (fb4 E, the owner's second round of 2026-10-25, decision 2: "if I can't use something, I want to
// know exactly why ... some sort of checklist or timer or quantity out of total") ---------------------------------------
// The pitch's phases as steps, those done ticked, each with its minutes: [{ label, done, minutes }]
export function tentSteps(item, stage = 0) {
  return tentOf(item).pitch.map((ph, i) => ({ label: `${ph.name} · ${ph.minutes} min`, done: stage > i, minutes: ph.minutes }));
}
const minutesLeft = (item, stage) => tentOf(item).pitch.slice(stage).reduce((s, ph) => s + ph.minutes, 0);
const bearingOf = (dx, dz) => ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'][Math.round((((Math.atan2(dx, -dz) * 180) / Math.PI + 360) % 360) / 45) % 8]; // (+z is south)
const low = (s) => (/^[A-Z]-/.test(s) ? s : s.charAt(0).toLowerCase() + s.slice(1)); // ("A-poles" keeps its capital)
const far = (d) => (d < 1000 ? `${Math.max(10, Math.round(d / 10) * 10)} m` : `${(d / 1000).toFixed(1)} km`);
// camp.js tentActions() (your tent's two keys on the dot) with their checklists: E Carry on pitching / Put the fly on with
// the steps and the minutes to go; Q Rest until… with no fly says what the fly is for; Strike the steps back down
export function withTentNeeds(camp, ta) {
  const c = camp && camp.camp;
  if (!ta || !c) return ta;
  const K = tentOf(c.item), st = c.stage;
  const fill = (a, needs, next) => { if (a && !a.needs) Object.assign(a, { needs, next }); };
  if (st < 4) {
    const left = minutesLeft(c.item, st), fly = K.pitch[3];
    const pitchA = ta.e && /pitching|fly/i.test(ta.e.verb) ? ta.e : null;
    fill(pitchA, tentSteps(c.item, st), st === 3 ? `Hold E: the rain fly on in ${fly.minutes} min; without it the rain comes through the mesh` : `Hold E: ${low(K.pitch[st].name)} next, ${left} min to the fly on`);
    const rest = ta.q && /Rest/.test(ta.q.verb) ? ta.q : null;
    const bugs = bugsOut(); // (cons C: and in bug season the mosquitoes come in at the open door)
    fill(rest, [{ label: `Rain fly on · ${fly.minutes} min`, done: false }, { label: 'A night’s rest with no fly: 90 %, and rain through the mesh', done: false }, ...(bugs ? [{ label: 'No fly: the bugs get in', done: false, chip: 'bugs get in' }] : [])], `Put the fly on first (hold E, ${fly.minutes} min): a dry night${bugs ? ', no bugs' : ''} and the full rest`);
  }
  const strike = [ta.e, ta.q].find((a) => a && /Strike/.test(a.verb));
  fill(strike, K.strike.slice(4 - st).map((ph) => ({ label: `${ph.name} · ${ph.minutes} min`, done: false })), `Hold Q to strike it: ${K.strike.slice(4 - st).reduce((s, ph) => s + ph.minutes, 0)} min, back into the pack it came from`);
  const rest = st >= 4 && ta.e && /Rest/.test(ta.e.verb) ? ta.e : null;
  fill(rest, [{ label: 'The tent up, the fly on', done: true }], 'E opens the dial: first light, 7:00, noon, dusk or any hour by ← →');
  return ta;
}
// The book's Pitch (and the bagged tent's Q): why not now, the steps, and the one thing to do. tent: camp.tentByUid(uid)
// → { why, needs, next }
export function pitchNeeds(camp, tent) {
  const why = camp.pitchRefused(tent), p = camp.player, item = tent && tent.def ? tent.def.id : 'aframe';
  const steps = tentSteps(item, 0), all = minutesLeft(item, 0);
  if (!why) return { why: null, needs: steps, next: `The ghost goes where you look: on green ground, hold E or a click, about ${all} min` };
  const c = camp.camp, needs = [];
  let next = null;
  if (/not within reach/.test(why)) { needs.push({ label: 'The tent within reach', done: false, note: 'in a pack you carry, or set down at this camp' }); next = 'Carry the pack the tent is in, or set it down here.'; }
  else if (/on foot/.test(why)) { needs.push({ label: 'On foot, ashore', done: false }); next = 'Go ashore first.'; }
  else if (/outfitter/.test(why)) { needs.push({ label: 'Out of the outfitter’s yard', done: false }); next = 'Pitch it at a campsite out on the lakes.'; }
  else if (c) {
    const d = Math.hypot(c.x - p.x, c.z - p.z);
    needs.push({ label: 'Your tent struck', done: false, note: d > 30 ? `it stands ${far(d)} ${bearingOf(c.x - p.x, c.z - p.z)}` : tentOf(c.item).words[c.stage] || 'standing' });
    next = d > 30 ? `Walk back to it (${far(d)} ${bearingOf(c.x - p.x, c.z - p.z)}) and hold Q at it to strike it, or pitch there.` : c.stage >= 4 ? 'Hold Q at it to strike it first.' : 'Point at it and hold E to carry on pitching, or hold Q to strike it.';
  } else if (/campsite|another party/.test(why)) {
    needs.push({ label: /another party/.test(why) ? 'A site no one holds' : 'At a campsite (Adventure)', done: false });
    const n = camp.registry && camp.registry.nearestFree ? camp.registry.nearestFree(p.x, p.z, 6000) : null;
    next = n ? `The nearest free campsite is ${far(n.d)} ${bearingOf(n.site.x - p.x, n.site.z - p.z)}.` : 'Find a free campsite on your map.';
  } else needs.push({ label: why, done: false });
  return { why: why.charAt(0).toUpperCase() + why.slice(1), needs: [...needs, ...steps], next };
}

// --- the dome's parts ----------------------------------------------------------------------------------------------
function footprintGeometry() {
  const b = new PropBuilder(), S = 20, sheet = C(0x4d584c), stake = C(0x8f8c86), cord = C(0xc8c2b0);
  const below = V(0, -1, 0);
  for (let k = 0; k < S; k++) {
    const t0 = (k / S) * Math.PI * 2, t1 = ((k + 1) / S) * Math.PI * 2, [a, b0] = foot(t0), [c, d] = foot(t1);
    b.face([V(0, 0.05, 0), V(a * 1.02, 0.045, b0 * 1.02), V(c * 1.02, 0.045, d * 1.02)], TILE.CANVAS, sheet, { ref: below });
  }
  // the hem's edge a shade darker, a hand's width wide
  for (let k = 0; k < S; k++) {
    const t0 = (k / S) * Math.PI * 2, t1 = ((k + 1) / S) * Math.PI * 2, [a, b0] = foot(t0), [c, d] = foot(t1);
    b.face([V(a * 0.94, 0.052, b0 * 0.94), V(a * 1.03, 0.05, b0 * 1.03), V(c * 1.03, 0.05, d * 1.03), V(c * 0.94, 0.052, d * 0.94)], TILE.CANVAS, sheet.clone().multiplyScalar(0.72), { ref: below });
  }
  // a stake at each corner (where the poles will stand) and its loop of cord from the sheet's corner
  for (let k = 0; k < 4; k++) {
    const t = Math.PI / 4 + (k * Math.PI) / 2, [fx, fz] = foot(t), out = Math.hypot(fx, fz), ux = fx / out, uz = fz / out;
    const sx = fx + ux * 0.22, sz = fz + uz * 0.22;
    b.box(V(sx, 0.02, sz), V(1, 0, 0), V(0, 1, 0), V(0, 0, 1), 0.006, 0.07, 0.006, TILE.METAL, stake, { grain: 'y' });
    b.tube([V(fx * 1.01, 0.05, fz * 1.01), V(sx, 0.07, sz)], 0.004, 3, TILE.PLAIN, cord);
  }
  return b.build();
}
// two poles corner to corner over the top, crossing at the peak, their ends in the footprint's corner grommets
function polesGeometry() {
  const b = new PropBuilder(), metal = C(0xc3c8cc), N = 14;
  for (const t0 of [Math.PI / 4, (Math.PI * 3) / 4]) {
    const [fx, fz] = foot(t0), pts = [];
    for (let i = 0; i <= N; i++) { const s = -1 + (2 * i) / N, r = Math.abs(s) * 0.995; pts.push(V(fx * s * 0.99, 0.04 + hY(r) * 0.975, fz * s * 0.99)); }
    b.tube(pts, 0.009, 5, TILE.PLAIN, metal);
  }
  return b.build();
}
// the inner tent hung from the poles: a dome a little inside the fly's, pale canvas below and the mesh top darker, the
// door's panel on the +z side
function innerGeometry() {
  const b = new PropBuilder(), S = 16, K = 5, canvas = C(0xe2c98a), mesh = C(0x9c9a8a), door = C(0xcdb377);
  const pt = (t, r) => { const [fx, fz] = foot(t); return V(fx * r * 0.965, 0.04 + hY(r) * 0.92, fz * r * 0.965); };
  const inside = V(0, 0.32, 0);
  for (let i = 0; i < K; i++) for (let k = 0; k < S; k++) {
    const r0 = ((i / K) ** 0.85) * 0.995, r1 = (((i + 1) / K) ** 0.85) * 0.995, t0 = (k / S) * Math.PI * 2 + Math.PI / 4, t1 = ((k + 1) / S) * Math.PI * 2 + Math.PI / 4;
    const tm = (t0 + t1) / 2, dz = Math.exp(-((Math.atan2(Math.sin(tm - Math.PI / 2), Math.cos(tm - Math.PI / 2)) / 0.5) ** 2));
    const col = r1 < 0.62 ? mesh : dz > 0.4 && r0 > 0.3 ? door : canvas;
    const q = [pt(t0, r0), pt(t1, r0), pt(t1, r1), pt(t0, r1)];
    if (i === 0) b.face([q[0], q[2], q[3]], TILE.CANVAS, col, { ref: inside }); else b.face(q, TILE.CANVAS, col, { ref: inside });
  }
  return b.build();
}

// --- the A-frame's parts (props.js AFRAME_SIZE: x across, z along the ridge, the door at +z) ---------------------
const { a: AW, b: AL, h: AH } = AFRAME_SIZE;
const AFW = AW * 0.96, AFL = AL * 0.98; // the floor's half width and half length
// the floor staked out: a dark bathtub floor, its edge turned up a little, a stake and its cord at each corner
function aframeFootprint() {
  const b = new PropBuilder(), sheet = C(0x4d584c), stake = C(0x8f8c86), cord = C(0xc8c2b0), below = V(0, -1, 0);
  b.face([V(-AFW, 0.05, -AFL), V(AFW, 0.05, -AFL), V(AFW, 0.05, AFL), V(-AFW, 0.05, AFL)], TILE.CANVAS, sheet, { ref: below });
  const rim = sheet.clone().multiplyScalar(0.72), r = 0.07;
  for (const [a, c] of [[V(-AFW, 0, -AFL), V(AFW, 0, -AFL)], [V(AFW, 0, -AFL), V(AFW, 0, AFL)], [V(AFW, 0, AFL), V(-AFW, 0, AFL)], [V(-AFW, 0, AFL), V(-AFW, 0, -AFL)]]) {
    const inw = V(-(a.x + c.x) / 2, 0, -(a.z + c.z) / 2).normalize().multiplyScalar(r);
    b.face([a.clone().setY(0.052).add(inw), c.clone().setY(0.052).add(inw), c.clone().setY(0.05), a.clone().setY(0.05)], TILE.CANVAS, rim, { ref: below });
    b.face([a.clone().setY(0.05), c.clone().setY(0.05), c.clone().setY(0.1), a.clone().setY(0.1)], TILE.CANVAS, rim, { ref: V(0, 0.3, 0) }); // the tub's lip
  }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const cx = sx * AFW, cz = sz * AFL, px = cx + sx * 0.16, pz = cz + sz * 0.16;
    b.box(V(px, 0.02, pz), V(1, 0, 0), V(0, 1, 0), V(0, 0, 1), 0.006, 0.07, 0.006, TILE.METAL, stake, { grain: 'y' });
    b.tube([V(cx, 0.06, cz), V(px, 0.07, pz)], 0.004, 3, TILE.PLAIN, cord);
  }
  return b.build();
}
// an A of two poles at each end, their feet at the floor's corners and their tops crossed under the ridge, and the ridge
// pole laid between the two crossings (sagging a touch)
function aframePoles() {
  const b = new PropBuilder(), metal = C(0xc3c8cc), dark = C(0x6d7276);
  for (const z of [-AFL, AFL]) {
    const top = V(0, aframeRidge(z / 0.98 * 1.03) - 0.02, z);
    for (const s of [-1, 1]) b.tube([V(s * AFW * 0.98, 0.03, z), top.clone().add(V(-s * 0.03, 0.05, 0))], 0.009, 5, TILE.PLAIN, metal);
    b.cyl(top.clone().add(V(0, -0.02, -0.015)), top.clone().add(V(0, -0.02, 0.015)), 0.016, 0.016, 6, TILE.PLAIN, dark); // the crossing's clamp
  }
  const ridge = [];
  for (let i = 0; i <= 8; i++) { const z = -AFL + (2 * AFL * i) / 8; ridge.push(V(0, aframeRidge((z / AFL) * AL * 1.03) - 0.025, z)); }
  b.tube(ridge, 0.01, 5, TILE.PLAIN, metal);
  return b.build();
}
// the canvas hung from the ridge: two walls down to the floor's edges, a short sidewall at the foot of each, the back
// end closed and the front end with its door (zipped, a darker panel), a little inside the fly
function aframeInner() {
  const b = new PropBuilder(), canvas = C(0xe2c98a), wall = C(0xd6bd80), floor = C(0x6b6a5a), door = C(0xcdb377), zip = C(0x5d5444);
  const inside = V(0, 0.32, 0), top = (z) => aframeRidge((z / AFL) * AL * 1.03) - 0.06, SW = 0.16; // a sidewall's height
  const n = 6;
  for (const s of [-1, 1]) for (let i = 0; i < n; i++) {
    const z0 = -AFL + (2 * AFL * i) / n, z1 = -AFL + (2 * AFL * (i + 1)) / n;
    b.face([V(0, top(z0), z0), V(0, top(z1), z1), V(s * AFW * 0.97, SW, z1), V(s * AFW * 0.97, SW, z0)], TILE.CANVAS, canvas, { ref: inside });
    b.face([V(s * AFW * 0.97, SW, z0), V(s * AFW * 0.97, SW, z1), V(s * AFW, 0.05, z1), V(s * AFW, 0.05, z0)], TILE.CANVAS, floor, { ref: inside });
  }
  for (const z of [-AFL, AFL]) {
    const sz = Math.sign(z), ref = V(0, 0.32, -sz);
    b.face([V(-AFW * 0.97, SW, z), V(AFW * 0.97, SW, z), V(0, top(z), z)], TILE.CANVAS, wall, { ref });
    b.face([V(-AFW, 0.05, z), V(AFW, 0.05, z), V(AFW * 0.97, SW, z), V(-AFW * 0.97, SW, z)], TILE.CANVAS, floor, { ref });
    if (sz > 0) { // the door: a tall panel, rounded at the top, zipped down the middle
      const d = [], R = 0.27, y0 = 0.08, y1 = 0.62, zz = z + 0.006;
      d.push(V(-R, y0, zz));
      for (let k = 0; k <= 6; k++) { const a = Math.PI - (k / 6) * Math.PI; d.push(V(Math.cos(a) * R, y1 + Math.sin(a) * R * 0.55, zz)); }
      d.push(V(R, y0, zz));
      b.face(d, TILE.CANVAS, door, { ref: V(0, 0.4, z - 1) });
      b.tube([V(0, y0, zz + 0.003), V(0, y1 + R * 0.55, zz + 0.003)], 0.005, 3, TILE.PLAIN, zip);
    }
  }
  return b.build();
}

let geos = null;
const partGeos = (kind) => {
  if (!geos) geos = {};
  if (!geos[kind]) geos[kind] = kind === 'aframe' ? { footprint: aframeFootprint(), poles: aframePoles(), inner: aframeInner() } : { footprint: footprintGeometry(), poles: polesGeometry(), inner: innerGeometry() };
  return geos[kind];
};
const flyOf = (kind, colour) => (kind === 'aframe' ? buildAFrameMesh(colour) : buildTentMesh(colour));

// One tent's parts, standing where camp.js pitches it: set(at) shows it at `at` phases done (0 to 4, fractional between)
export class TentStages {
  constructor(scene, kind, colour) {
    this.kind = kind === 'aframe' ? 'aframe' : 'dome';
    const fly = flyOf(this.kind, colour), mat = fly.material, G = partGeos(this.kind);
    this.group = new THREE.Group();
    this.group.name = 'tent-stages'; this.group.matrixAutoUpdate = false; this.group.visible = false;
    const mk = (geo) => { const m = new THREE.Mesh(geo, mat); m.castShadow = true; m.receiveShadow = true; m.matrixAutoUpdate = false; this.group.add(m); return m; };
    this.footprint = mk(G.footprint); this.poles = mk(G.poles); this.inner = mk(G.inner);
    fly.matrixAutoUpdate = false; this.fly = fly; this.group.add(fly);
    this.colour = colour;
    this.at = -1;
    scene.add(this.group);
  }
  // the tent's world matrix (props.js tentPose)
  place(matrix) { this.group.matrix.copy(matrix); this.group.matrixWorldNeedsUpdate = true; this.group.updateMatrixWorld(true); }
  set(at) {
    at = Math.max(0, Math.min(4, at));
    if (Math.abs(at - this.at) < 1e-4 && this.group.visible) return;
    this.at = at;
    this.group.visible = at > 0.001;
    const part = (m, k, sx, sy, sz, dy = 0) => {
      m.visible = k > 0.001;
      if (!m.visible) return;
      m.matrix.makeScale(sx, sy, sz); m.matrix.setPosition(0, dy, 0); m.matrixWorldNeedsUpdate = true;
    };
    // the sheet unrolls from the middle out
    const f = ease(at); part(this.footprint, at, 0.2 + 0.8 * f, 1, 0.35 + 0.65 * f);
    // the poles bow up from flat (the dome's) or stand up from lying (the A-frame's)
    const p = ease(at - 1); part(this.poles, at - 1, 1 + 0.1 * (1 - p), 0.06 + 0.94 * p, 1 + 0.1 * (1 - p));
    // the tent rises on its clips (or up the ridge)
    const t = ease(at - 2); part(this.inner, at - 2, 1, 0.12 + 0.88 * t, 1);
    // the fly goes over from above and settles
    const y = ease(at - 3); part(this.fly, at - 3, 1.1 - 0.1 * y, 0.75 + 0.25 * y, 1.1 - 0.1 * y, 0.35 * (1 - y));
    this.group.updateMatrixWorld(true);
  }
  hide() { this.group.visible = false; this.at = -1; }
  dispose() { this.group.removeFromParent(); }
}

// The ghost: where the tent would go, green on good ground and red where it can't. One translucent material, a colour
// per state, and a shape per kind; drawn every frame (parked under the world when not wanted) so its program is made
// once, at the start.
const GOOD = 0x86e29a, BAD = 0xf06a55;
export class TentGhost {
  constructor(scene) {
    this.mat = new THREE.MeshBasicMaterial({ color: GOOD, transparent: true, opacity: 0.34, depthWrite: false, side: THREE.DoubleSide });
    this.groups = {};
    for (const kind of ['dome', 'aframe']) {
      const fly = flyOf(kind, 0xffffff), G = partGeos(kind), group = new THREE.Group();
      group.name = `tent-ghost-${kind}`; group.matrixAutoUpdate = false; group.renderOrder = 5;
      for (const geo of [fly.geometry, G.footprint]) {
        const m = new THREE.Mesh(geo, this.mat);
        m.frustumCulled = false; m.castShadow = false; m.receiveShadow = false; m.renderOrder = 5; m.matrixAutoUpdate = false;
        group.add(m);
      }
      this.groups[kind] = group;
      scene.add(group);
    }
    this.on = false; this.ok = true; this.kind = 'aframe';
    this.park();
  }
  park() {
    for (const g of Object.values(this.groups)) { g.matrix.makeTranslation(0, -1e4, 0); g.matrixWorldNeedsUpdate = true; g.updateMatrixWorld(true); }
    this.on = false;
  }
  // kind: 'dome' or 'aframe' (kindOf the tent in reach)
  show(matrix, ok, kind = 'aframe') {
    if (kind !== this.kind && this.on) this.park();
    this.kind = kind === 'dome' ? 'dome' : 'aframe';
    const g = this.groups[this.kind];
    g.matrix.copy(matrix); g.matrixWorldNeedsUpdate = true; g.updateMatrixWorld(true);
    if (ok !== this.ok || !this.on) { this.mat.color.setHex(ok ? GOOD : BAD); this.mat.opacity = ok ? 0.34 : 0.42; }
    this.ok = ok; this.on = true;
  }
}
