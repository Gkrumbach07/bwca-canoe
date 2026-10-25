import * as THREE from 'three';
import { PropBuilder, propMaterial, TILE } from './prop-kit.js';
import { registerKind } from './tasks.js';
import { dayOfYear } from './astro.js';
import { word, plural } from './hud.js';
import { mulberry32, hash2 } from './rng.js';
import { save } from './save.js';
import { GROUND } from './terrain-build.js';
import { itemDef, defineItem, WOOD_DRY, LIGHT_PIECES } from './items.js';
import { inventory as INVENTORY } from './inventory.js';
import { FIRE, woodCount, lights, LOW_H } from './fire.js';
import { hold } from './hold.js';
import { Cook, hiss, woodKnock, strike } from './cook.js';
import { Tarp } from './tarp.js'; // fb4 E: the tarp pitched like the tent, on trees or poles

// Camp chores (hubs phase 3, stream A; redone by camp 2, the owner's feedback of 2026-10-24: "picking up firewood
// should be actually walking around camp and finding loose branches and logs, putting them in your inventory", "need
// cooking and eating is not super intersting ... you make a fire so you can cook so you can eat", "the toilet actually
// you should actually sit", and "also you should be able to snuff out fire ... it doesnt do it automatically when you
// leave"). Nothing at camp happens by itself now; each thing that takes time is held (hold.js's ring):
// - Firewood is things you find. Dead branches (items.js wood:branch, 1×2) and short logs (wood:log, 1×3) lie about
//   every site (SITE_WOOD, more under the trees and by the down logs) and here and there in the woods (WOODS: more in the
//   dark spruce and the burns), placed by the ground (the same every time) and coming back REGROW days after they were
//   picked up. E pointed at one (pointer.js, nearby.js) picks it up: into an armload in a free hand (items.js woodarms,
//   a hand's container; drawn here), else into what you carry. With the folding saw in reach (player.gear.saw and the
//   item), a down log's panel in the book saws it, held: three cuts, a short log dropped by it at each. Wood set down
//   from the book (its Ground area: a pile on the ground, by the ring or anywhere) is a woodpile, drawn stacked.
// - The fire (fire.js), worked from its card (wc A: stream B's cards.open('fire'), on the fire ring's E; nearby.js's
//   fire object) and from the dot (Q Douse, held): its Fuel is a fixed container at the ring (firefuel); the wood
//   dragged into it is the fire laid. fb5 A (the owner's third round of 2026-10-25: "it should just light when enough
//   fuel is added automatically", "why cant i burn a pole?"): it lights by itself the moment a piece goes in and the
//   ring holds a dry branch and LIGHT_PIECES dry pieces in all (catchFire: a match struck, a flare, the catch, its
//   sound); a pole burns like a log. Burning, it takes its next piece from the ring while under KEEP hours are left
//   (the long-burning first, the quick ones once it is low), so it burns full while there is wood in it and burns down
//   after; Douse (held, the only button) puts it out: water, stirred in, water again, the steam boiling up and the hiss,
//   the coals cold, and what wood is left in the ring drowned with it. Left, it smoulders until morning (fire.js
//   FIRE.smoulder), and any dry piece on the hot coals brings it back. What the ring is short of is fireNeed's one chip
//   (the dot) and fireNeeds' chips (the card). The fire's events (fire.js on/events: lit, low, coals, out, wet) are said
//   here. A down log with the saw to hand reads "E Saw · hold" (beginSaw).
// - Cooking and eating: cook.js (the pot on the grate, the wait, the cooked things, the bench).
// - The latrine (wc A): E Sit at the box in the trees (props.js c.layout.latrine; the dot, nearby.js) walks you to it
//   and sits you down (player.sitAt, stream C; else cook.js sitAt), ten quiet minutes on their own; rest +0.05 once a day.
// - Blueberries are forage.js's (fb G); a pint a berries notice still wants goes into the tin here (s.pints).
// - Sleep with a wake time: camp.js's Rest-until dial (wc A); the wake-time card here is the old one, kept for its CSS.
// And two notices for the boards (tasks.js registerKind): blueberries for the café ($10 a pint, in season) and firewood
// for the sauna ($6 an armful of three pieces), handed over on foot at the posting outfitter's store.
//
// Nothing here takes E (fb2 A: E is the pointer's: pick up, talk, open, get in). What camp.js asks of it: before(),
// update(dt), ashore() (for the leaving note); nearby.js asks the fire's (fuelBin, grate,
// fireInfo, fireNeed(s), douse), the latrine's, the saw's and the wood's; main.js (camp 2) asks move(),
// beforePose(), afterPose(). Everything is saved in the trip's document (trip.state.chores), or under its own key with no
// trip.

// fb2 A (the owner's second feedback of 2026-10-24: "the fire could be thought of as a container ... separate bins that
// you could drag things from your inventory ... onto the fire"): the fire ring is worked from the book (nearby.js), its
// fuel a fixed container at the ring like the grate, and the grate takes a raw meal or a fish dragged onto it. Both are
// stations: never where a thing picked up is put away (inventory.place).
defineItem({ id: 'firefuel', name: 'In the fire ring', short: 'Fuel', kind: 'container', w: 1, h: 1, kg: 0, fixed: true, station: true, container: { cols: 4, rows: 3, accepts: ['firewood'] }, icon: 'firewood', words: 'Wood laid in the ring.' });
defineItem({ id: 'grate', station: true, container: { cols: 4, rows: 2, accepts: ['food', 'tool', 'meal', 'fish'] } });
// fb3 B (the owner, 2026-10-25: "things like sleeping bag and tarp … feel like they have no use"): rain on a ring with no
// tarp over it burns a fire down RAIN.burn times faster and wets the wood in it through after RAIN.wetAfter hours (it
// won't light for RAIN.wetFor); rain on a pack on the ground with no tarp soaks the gear after RAIN.packAfter hours
// (trip.state.wet, and the pack's at.wet). fb4 E (the owner's second round of 2026-10-25: "when you put a tarp up now, it
// kind of just floats in the air"): the tarp is pitched like the tent, on a ridge line between trees or on poles
// (tarp.js), and what lies under its sheet (tarp.covers) stays dry. Last round's `tarpup` (the tarp floating over the
// ring or a pack, a container on the ground) is gone: one found in a save becomes the tarp folded in a pile there.
defineItem({ id: 'tarpup', name: 'Rain tarp, pitched', short: 'Tarp up', kind: 'container', w: 1, h: 1, kg: 0, fixed: true, container: { cols: 2, rows: 2, accepts: [] }, icon: 'tarp', verbs: [], words: 'The tarp, folded where it was pitched.' });
const RAIN = { on: 0.3, burn: 1, wetAfter: 1 / 3, wetFor: 3, packAfter: 0.5, dry: 0.5 };
// fb5 A (the owner: "why cant i burn a pole?"): a pole is fuel, and burns about as long as a short log (stream B's items.js
// makes it so; this only when its def is older)
{ const d = itemDef('pole'); if (d && (d.kind !== 'firewood' || !Number.isFinite(d.burn))) defineItem({ id: 'pole', kind: 'firewood', burn: FIRE.log }); }
// fb4 E: the poles lying about for a tarp (tarp.js), found like the wood: a few round each site, most by the down logs and
// under the trees, and now and then in the woods; one cut from a down log with the saw (POLE_CUT: two a log a day)
const SITE_POLES = { n: 6, tries: 70, from: 4, to: 23 };
const POLE_CUT = [{ name: 'Pole cut', doing: 'Sawing a straight length off the down spruce and trimming its twigs', minutes: 6, seconds: 1.6 }];
const POLES_A_LOG = 2;
// fb4 E (decision 2): the evening's firewood as have of need: pieces enough for about four hours of fire after supper
const EVENING = { pieces: 8, hours: 4 };
const KEEP = 1.1;            // fb2 A: game hours of burning left under which a fire takes its next piece from the ring
export const WOOD = { reach: 1.45, regrow: 2, pile: 12, ringR: 2.4, near: 58, drop: 95, cell: 24 };
// (to: inside the camp's area, camp.js AREA_R 25 m, so walking about for wood never takes you out of the camp's reach)
const SITE_WOOD = { branches: 12, logs: 5, tries: 90, from: 4.5, to: 23 };
const WOODS = { forestDark: 1, forest: 0.75, forestLight: 0.6, burn: 1.3, meadow: 0.12, rock: 0.15, rockLichen: 0.15, rockDark: 0.2 };
const LATRINE_REST = 0.05, SAW_REACH = 0.95;
export const SEASON = { from: [6, 10], to: [7, 20] }; // [month (0-based), day]: July 10 to August 20, the blueberries
export const PAY = { pint: 10, armful: 6 };
const ARMFUL = 3;            // pieces of wood a notice's "armful" is
// the wake times on the card: first light (camp.js wakeTime: a quarter hour after sunrise, or later after a late night)
const DOUSE = [
  { name: 'Drowned', doing: 'Pouring a pot of lake water on it', minutes: 3, seconds: 1.1 },
  { name: 'Stirred', doing: 'Stirring the ash in with a stick', minutes: 3, seconds: 1.0 },
  { name: 'Cold', doing: 'More water, and the back of a hand to the ash', minutes: 3, seconds: 0.9 },
];
const SAW = [1, 2, 3].map((i) => ({ name: `${['First', 'Second', 'Third'][i - 1]} length`, doing: 'Sawing through the dead spruce', minutes: 5, seconds: 1.25 }));
const LATRINE = [{ name: 'Done', doing: 'A quiet few minutes back in the trees', minutes: 10, seconds: 3.4 }];

const absDay = (year, doy) => Math.round(Date.UTC(year, 0, doy) / 86400000);
export function berrySeason(year, doy) { return doy >= dayOfYear(year, ...SEASON.from) && doy <= dayOfYear(year, ...SEASON.to); }
const pickR = (rng, list) => list[Math.floor(rng() * list.length)];
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const tone = (hex, rng, dl = 0.06, dh = 0.015) => new THREE.Color(hex).offsetHSL((rng() - 0.5) * dh, 0, (rng() - 0.5) * dl);
const keyOf = (c) => `${Math.round(c.x)}:${Math.round(c.z)}`; // camp.js campKey
const strHash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
const isWood = (id) => { const d = itemDef(id); return !!(d && d.kind === 'firewood'); };
const burnOf = (id) => { const d = itemDef(id); return d && Number.isFinite(d.burn) ? d.burn : FIRE.branch; };
const LENGTH = { branch: [1.05, 1.3, 1.5], log: [0.46, 0.52, 0.5], pole: [2.05, 2.2, 2.35] }; // m: each variant's length
const pieceItem = (kind) => (kind === 'log' ? 'wood:log' : kind === 'pole' ? 'pole' : 'wood:branch');
const pieceName = (kind) => (kind === 'log' ? 'short log' : kind === 'pole' ? 'dead pole' : 'dead branch');

let current = null; // the one Chores (the notices' kinds read it)

// --- the looks --------------------------------------------------------------------------------------------------------
// Shade baked by hand for the small things (no bake: they are built often): darker low down and facing down
function shadeBy(geo, f) {
  const P = geo.getAttribute('position'), N = geo.getAttribute('normal'), O = geo.getAttribute('aOcc');
  for (let i = 0; i < O.count; i++) O.setX(i, f(P.getY(i), N.getY(i)));
  O.needsUpdate = true;
  return geo;
}
// The woodpile by a fire ring, in its own frame (x along the first layer, y up from the ground): three layers of five
// split lengths crossed on the one below, birch and pine, some split to show the pale wood. Three geometries.
function woodpileGeometry() {
  const rng = mulberry32(911), out = [];
  const birch = 0xcdc6b6, pine = 0x5e4a39, inner = 0xc6a77c, end = 0xcfb894;
  let y = 0;
  for (let layer = 0; layer < 3; layer++) {
    const b = new PropBuilder(), along = layer % 2 === 0, n = 5;
    let top = 0;
    for (let i = 0; i < n; i++) {
      const r = 0.05 + rng() * 0.026, off = (i - (n - 1) / 2) * 0.145 + (rng() - 0.5) * 0.025, h = y + r * 0.92, len = 0.6 + rng() * 0.14;
      const sl = (rng() - 0.5) * 0.08, sk = (rng() - 0.5) * 0.09, bark = rng() < 0.45 ? tone(birch, rng, 0.08) : tone(pine, rng, 0.1);
      const p0 = along ? V(-len / 2 + sl, h, off - sk) : V(off - sk, h, -len / 2 + sl), p1 = along ? V(len / 2 + sl, h + (rng() - 0.5) * 0.015, off + sk) : V(off + sk, h + (rng() - 0.5) * 0.015, len / 2 + sl);
      const split = rng() < 0.55, up = V(Math.cos(rng() * 6.28), 0.6 + rng(), Math.sin(rng() * 6.28)).normalize();
      b.cyl(p0, p1, r, r * 0.94, 7, TILE.BARK, bark, { arc: split ? [Math.PI * 0.1, Math.PI * 1.25] : null, flatTile: TILE.SPLIT, flatCol: tone(inner, rng, 0.08), cap0: true, cap1: true, capCol: tone(end, rng, 0.08), phase: rng() * 6, up });
      top = Math.max(top, h + r);
    }
    const g = b.build();
    const y0 = y, y1 = top;
    shadeBy(g, (py, ny) => (0.62 + 0.38 * Math.min(1, Math.max(0, (py - y0) / Math.max(0.05, y1 - y0)))) * (ny < -0.3 ? 0.72 : 1) * (layer === 0 ? 0.9 : 1));
    out.push(g);
    y = top - 0.035;
  }
  return out;
}
// A loose piece lying on the ground, in its own frame (along x, the bottom on y = 0): a dead branch (crooked, tapering,
// a stub of a twig or two, grey bark or birch) or a short log (a sawn length, the pale ends showing). Variant v (0..2).
function pieceGeometry(kind, v) {
  const rng = mulberry32(4401 + v * 97 + (kind === 'log' ? 7 : kind === 'pole' ? 13 : 0)), b = new PropBuilder();
  const len = LENGTH[kind][v];
  if (kind === 'pole') { // fb4 E: a straight dead pole, grey and weathered, tapering, a broken stub or two, the butt sawn
    const r = 0.026 + v * 0.003, bark = tone(0x8b8276, rng, 0.07), pts = [];
    for (let i = 0; i <= 4; i++) { const t = i / 4; pts.push(V(-len / 2 + len * t, r * (1 - 0.3 * t) + Math.sin(t * 2.2 + v) * 0.006, Math.sin(t * 2.7 + v) * 0.012)); }
    b.tube(pts, (t) => r * (1 - 0.4 * t), 6, TILE.BARK, bark, { cap0: true, cap1: true });
    for (let k = 0; k < 2; k++) { const t = 0.35 + 0.3 * k, base = pts[Math.round(t * 4)], side = k ? 1 : -1; b.tube([base.clone(), base.clone().add(V(0.05, 0.01, side * 0.06))], (q) => r * 0.38 * (1 - 0.6 * q), 4, TILE.BARK, bark, { cap1: true }); }
  } else if (kind === 'branch') {
    const r = 0.022 + v * 0.006, birch = v === 1, bark = birch ? tone(0xd2cbbd, rng, 0.06) : tone(0x6b5d50, rng, 0.08), pts = [];
    for (let i = 0; i <= 5; i++) { const t = i / 5; pts.push(V(-len / 2 + len * t, r * (1 - 0.35 * t) + Math.sin(t * 5 + v) * 0.012, Math.sin(t * 3.3 + v * 2) * 0.035)); }
    b.tube(pts, (t) => r * (1 - 0.55 * t), 6, TILE.BARK, bark, { cap0: true, cap1: true });
    for (let k = 0; k < 2; k++) {
      const t = 0.3 + 0.35 * k + rng() * 0.08, base = pts[Math.round(t * 5)], side = k ? 1 : -1, l = 0.16 + rng() * 0.12;
      b.tube([base.clone(), base.clone().add(V(l * 0.6, 0.012 + rng() * 0.02, side * l * 0.8))], (q) => r * 0.42 * (1 - 0.6 * q), 4, TILE.BARK, bark, { cap1: true });
    }
    if (birch) for (let k = 0; k < 3; k++) { const t = 0.15 + k * 0.3, p0 = pts[Math.round(t * 5)]; b.cyl(V(p0.x - 0.015, p0.y, p0.z), V(p0.x + 0.015, p0.y, p0.z), r * 1.04, r * 1.04, 6, TILE.BARK, tone(0x34302b, rng, 0.05)); }
  } else {
    const r = 0.055 + v * 0.012, birch = v === 2, bark = birch ? tone(0xd8d1c3, rng, 0.05) : tone(v === 0 ? 0x5d4c3c : 0x705f4c, rng, 0.08), end = tone(0xcdb48a, rng, 0.06);
    b.cyl(V(-len / 2, r, 0), V(len / 2, r * 0.97, 0.01), r, r * 0.94, 9, TILE.BARK, bark, { cap0: true, cap1: true, capCol: end, phase: rng() * 6 });
    if (birch) for (let k = 0; k < 3; k++) { const x = -len / 2 + len * (0.2 + k * 0.28); b.cyl(V(x - 0.012, r, 0), V(x + 0.012, r, 0), r * 1.03, r * 1.03, 9, TILE.BARK, tone(0x3a342d, rng, 0.05)); }
  }
  return shadeBy(b.build(), (py, ny) => (ny < -0.35 ? 0.55 : 0.78 + 0.22 * Math.min(1, py / 0.12)));
}
// many pieces in one geometry: each variant's buffers moved by its piece's matrix (positions and normals), the rest copied
function mergePieces(list, geos) {
  let n = 0;
  for (const it of list) n += geos[it.g].getAttribute('position').count;
  const P = new Float32Array(n * 3), N = new Float32Array(n * 3), Cl = new Float32Array(n * 3), U = new Float32Array(n * 2), Tl = new Float32Array(n), O = new Float32Array(n);
  const m = new THREE.Matrix4(), nm = new THREE.Matrix3(), v = new THREE.Vector3();
  let o = 0;
  for (const it of list) {
    const g = geos[it.g], gp = g.getAttribute('position'), gn = g.getAttribute('normal'), c = g.getAttribute('color').array, uv = g.getAttribute('aPropUv').array, tl = g.getAttribute('aPropTile').array, oc = g.getAttribute('aOcc').array;
    m.compose(it.pos, it.q, it.s || _one); nm.getNormalMatrix(m);
    for (let i = 0; i < gp.count; i++) {
      v.fromBufferAttribute(gp, i).applyMatrix4(m); P[(o + i) * 3] = v.x; P[(o + i) * 3 + 1] = v.y; P[(o + i) * 3 + 2] = v.z;
      v.fromBufferAttribute(gn, i).applyMatrix3(nm).normalize(); N[(o + i) * 3] = v.x; N[(o + i) * 3 + 1] = v.y; N[(o + i) * 3 + 2] = v.z;
    }
    Cl.set(c, o * 3); U.set(uv, o * 2); Tl.set(tl, o); O.set(oc, o);
    o += gp.count;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(P, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(N, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(Cl, 3)); geo.setAttribute('aPropUv', new THREE.BufferAttribute(U, 2));
  geo.setAttribute('aPropTile', new THREE.BufferAttribute(Tl, 1)); geo.setAttribute('aOcc', new THREE.BufferAttribute(O, 1));
  geo.computeBoundingSphere();
  return geo;
}
const _one = new THREE.Vector3(1, 1, 1);
// an icon for the book: a dead branch or a short log on paper (inv-ui.js draws an item's own draw(ctx, size))
function drawPiece(kind) {
  return (c, s) => {
    c.save(); c.translate(s / 2, s / 2); c.rotate(-0.5);
    const L = s * (kind === 'log' ? 0.62 : 0.86), R = s * (kind === 'log' ? 0.13 : 0.05);
    c.fillStyle = kind === 'log' ? '#6a5643' : '#7a6c5e'; c.strokeStyle = '#2f2820'; c.lineWidth = Math.max(1, s / 40);
    c.beginPath(); c.moveTo(-L / 2, -R); c.lineTo(L / 2, -R * 0.9); c.lineTo(L / 2, R * 0.9); c.lineTo(-L / 2, R); c.closePath(); c.fill(); c.stroke();
    if (kind === 'log') { c.fillStyle = '#d2b88c'; c.beginPath(); c.ellipse(L / 2, 0, R * 0.42, R * 0.92, 0, 0, Math.PI * 2); c.fill(); c.stroke(); c.strokeStyle = '#a88a5c'; c.beginPath(); c.ellipse(L / 2, 0, R * 0.2, R * 0.45, 0, 0, Math.PI * 2); c.stroke(); }
    else { c.beginPath(); c.moveTo(-L * 0.1, -R); c.lineTo(L * 0.08, -R * 4.2); c.moveTo(L * 0.22, R); c.lineTo(L * 0.36, R * 3.6); c.stroke(); }
    c.restore();
  };
}
function drawHot(fish) {
  return (c, s) => {
    c.save(); c.translate(s / 2, s * 0.58);
    c.strokeStyle = '#2f2820'; c.lineWidth = Math.max(1, s / 36);
    if (fish) {
      c.fillStyle = '#4a4744'; c.beginPath(); c.ellipse(0, 0, s * 0.38, s * 0.14, 0, 0, Math.PI * 2); c.fill(); c.stroke();
      c.fillStyle = '#c88a3c'; c.beginPath(); c.ellipse(0, -s * 0.02, s * 0.27, s * 0.07, 0, 0, Math.PI * 2); c.fill();
    } else {
      c.fillStyle = '#3d3a37'; c.fillRect(-s * 0.26, -s * 0.14, s * 0.52, s * 0.3); c.strokeRect(-s * 0.26, -s * 0.14, s * 0.52, s * 0.3);
      c.fillStyle = '#c9a565'; c.beginPath(); c.ellipse(0, -s * 0.14, s * 0.26, s * 0.06, 0, 0, Math.PI * 2); c.fill(); c.stroke();
    }
    c.strokeStyle = 'rgba(80,80,80,.55)'; c.lineWidth = Math.max(1, s / 30);
    for (const x of [-0.12, 0.02, 0.15]) { c.beginPath(); c.moveTo(s * x, -s * 0.22); c.bezierCurveTo(s * (x + 0.07), -s * 0.3, s * (x - 0.07), -s * 0.38, s * x, -s * 0.48); c.stroke(); }
    c.restore();
  };
}
// the icons on the items (items.js defines them; a def's draw is merged in)
for (const [id, fn] of [['wood:branch', drawPiece('branch')], ['wood:log', drawPiece('log')], ['hot:supper', drawHot(false)], ['hot:breakfast', drawHot(false)], ['hot:freeze', drawHot(false)]]) { const d = itemDef(id); if (d) d.draw = fn; }
for (const id of Object.keys(itemDef('fried:fish') ? { 'fried:walleye': 1, 'fried:pike': 1, 'fried:smallmouth': 1, 'fried:laketrout': 1, 'fried:perch': 1, 'fried:crappie': 1, 'fried:fish': 1 } : {})) { const d = itemDef(id); if (d) d.draw = drawHot(true); }

// --- the chores --------------------------------------------------------------------------------------------------------
export class Chores {
  // camp: the Camp (camp.js); everything else comes through it (the world, the player, the day, the energy, the scene,
  // the tiles, the fires, the outfitter); tasks (tasks.js) is set by main.js
  constructor(camp) {
    this.camp = camp; this.tasks = null;
    this.inv = INVENTORY;
    this.s = blank();           // what is saved (serialize)
    this.stateRef = undefined;  // the trip's document the saved part was read from
    this.t = 0;
    this.lit = new Set();       // the fires you lit or laid (keys): saved with their state
    this.ringSeen = new Map();  // fb5 A: ring key -> { st, low, wet } as last seen (the events say the changes); bins seen this session
    this.steamT = 0; this.steamAt = null;
    this.cells = new Map();     // the woods' wood: cell key -> [pieces] | null (none); unset: not read yet
    this.sites = new Map();     // site key -> [pieces] (its wood, made once its layout is in)
    this.near = [];             // the pieces drawn now
    this.dirty = true; this.cellT = 0; this.lastCell = '';
    this.mat = propMaterial();
    this.pieceGeos = []; this.pieceIdx = {};
    for (const kind of ['branch', 'log', 'pole']) for (let v = 0; v < 3; v++) { this.pieceIdx[`${kind}${v}`] = this.pieceGeos.length; this.pieceGeos.push(pieceGeometry(kind, v)); }
    this.poleNear = [];         // fb4 E: the loose poles drawn now (apart from `near`, the wood: nearby.js lists that)
    this.sitePoles = new Map(); // site key -> [poles] (made once its layout is in)
    this.field = new THREE.Mesh(new THREE.BufferGeometry(), this.mat);
    this.field.name = 'firewood'; this.field.castShadow = true; this.field.receiveShadow = true; this.field.matrixAutoUpdate = false; this.field.frustumCulled = false; this.field.visible = false;
    camp.scene.add(this.field);
    this.pileMeshes = [];       // fb2 A: the woodpiles drawn (piles of wood set down from the book): [{ group, layers, ref }]
    this.bundles = new Map();   // armload container id -> { mesh, sig }
    this.cook = new Cook(this);
    this.tarp = new Tarp(this); // fb4 E: the rain tarp's rigs (main.js puts it on window.__game and the pointer)
    this.hold = hold; // the held-progress ring (hold.js), for the tests
    current = this;
  }
  get world() { return this.camp.world; }
  get player() { return this.camp.player; }
  get energy() { return this.camp.energy; }
  get fires() { return this.camp.fires; }
  get day() { return this.camp.day; }
  get today() { const d = this.day; return absDay(d.year, d.doy); }
  get now() { return this.camp.now; }
  get pints() { return this.s.pints; }
  note(t, s) { this.camp.note(t, s); }
  keyOf(site) { return keyOf(site); }
  holdActive() { return !!hold.active; }
  sound(fn, at, ...a) { const au = this.camp.audio; if (!au || !au.ctx || !au.enabled) return; try { fn(au, at, ...a); } catch { /* a nicety */ } }

  // --- what is in reach --------------------------------------------------------------------------------------------
  // the containers in the camp's reach: stream 1's inventory.campReach (anything within the site's area at your own
  // camp), else the food pool (what you carry and what is set out at camp)
  campPool() {
    const inv = this.inv;
    if (!inv || !inv.attached) return [];
    try { return (typeof inv.campReach === 'function' ? inv.campReach() : inv.foodPool()) || []; } catch { return inv.reachable(); }
  }
  // the grate's container at site `key` (items.js 'grate': on the ground at the ring, at.grate = key); made with `site`
  grate(key, site = null) {
    const inv = this.inv;
    if (!inv || !inv.attached) return null;
    let g = inv.containers.find((c) => c.item === 'grate' && c.at && c.at.grate === key);
    if (!g && site && site.layout) {
      const f = site.layout.fire;
      g = inv.addContainer('grate', 'ground', { x: f.x, z: f.z, y: f.y + 0.32, heading: 0, camp: true, grate: key }, { quiet: true });
    }
    return g || null;
  }
  dropEmptyGrate(key) {
    const inv = this.inv, i = inv.containers.findIndex((c) => c.item === 'grate' && c.at && c.at.grate === key && !c.grid.length);
    if (i >= 0) { inv.containers.splice(i, 1); inv.emit('containers'); }
  }
  // fb2 A: the ring's fuel (items.js-style 'firefuel', defined above: on the ground at the ring, at.fuel = key): the wood
  // dragged into it from the book is the fire laid, and once lit it burns a piece at a time (syncFire); made with `site`
  fuelBin(key, site = null) {
    const inv = this.inv;
    if (!inv || !inv.attached) return null;
    let b = inv.containers.find((c) => c.item === 'firefuel' && c.at && c.at.fuel === key);
    if (!b && site && site.layout) {
      const f = site.layout.fire;
      b = inv.addContainer('firefuel', 'ground', { x: f.x, z: f.z, y: f.y + 0.05, heading: 0, camp: true, fuel: key, ring: { x: f.x, y: f.y, z: f.z, a: f.a || 0 }, v: 2 }, { quiet: true });
    }
    return b || null;
  }
  // the pieces in a fuel bin, one each: [{ id, e, burn }]
  // (fb5 A: the dry pieces first, then the wet; the grid's order otherwise)
  binUnits(b) { const out = []; if (b) for (const e of b.grid) if (!e.box && isWood(e.id)) for (let i = 0; i < e.qty; i++) out.push({ id: e.id, e, burn: burnOf(e.id) }); return out.sort((x, y) => wetU(x) - wetU(y)); }
  binHours(b) { return this.binUnits(b).reduce((s, u) => s + u.burn, 0); }
  // one piece out of the bin (its burn), or 0
  takeFromBin(b, u) { return b && this.inv.take(b.id, u.e.uid, 1) ? u.burn : 0; }
  // an armload with room for item `id`: one you hold, or a new one in a free hand (null when both hands are full)
  armloads() { const inv = this.inv; return inv && inv.attached ? inv.containers.filter((c) => c.item === 'woodarms' && c.where === 'hands') : []; }
  armFor(id, make = true) {
    const inv = this.inv;
    for (const c of this.armloads()) if (inv.firstFit(c, id)) return c;
    if (!make || inv.freeHand() < 0) return null;
    return inv.addContainer('woodarms', 'hands', null, { quiet: true, hand: inv.freeHand() });
  }
  woodCount(units) { const b = units.filter((u) => u.id !== 'wood:log').length, l = units.length - b; return { b, l, n: units.length }; }
  woodWords(units) { const { b, l } = this.woodCount(units); return [b ? `${word(b)} ${plural(b, 'branch', 'branches')}` : '', l ? `${word(l)} ${plural(l, 'log')}` : ''].filter(Boolean).join(' and ') || 'no wood'; }

  // --- the frame ------------------------------------------------------------------------------------------------------
  // before player.update (camp.before): the walker held while sitting or setting the pot on (fb2 A: nothing at camp is
  // done on E any more; the jobs are the book's, nearby.js)
  before() { this.cook.before(); }
  // after the player has moved (camp.update, before its prompts): the saved part, the wood about, the fires' steam and
  // their fuel, the pot, the woodpiles
  update(dt) {
    const c = this.camp, p = this.player;
    if (c.state !== this.stateRef) { this.stateRef = c.state; this.restore(); }
    if (!this.tripHooked && c.trip && c.trip.on) { this.tripHooked = true; for (const k of ['exit', 'evac']) c.trip.on(k, () => this.tripEnded()); }
    this.cook.update(dt);
    this.dropEmptyArms();
    // the steam of a fire put out boils up a while after
    if (this.steamT > 0 && this.steamAt) { this.steamT -= dt; this.fires.steamAt('douse', this.steamAt, Math.min(1, this.steamT / 1.4)); }
    // the wood about: the cells round you read as you go, the drawn set rebuilt when it changes
    const on = (p.mode === 'walk' || p.mode === 'paddle' || p.mode === 'carry') && !p.teleporting;
    if (on && ((this.cellT -= dt) <= 0)) { this.cellT = 0.5; this.restoreDrops(); this.refreshWood(p.x, p.z); this.migratePiles(); }
    if (this.redrawIn > 0 && (this.redrawIn -= dt) <= 0) this.dirty = true;
    if (this.dirty) this.drawWood();
    // (fb5 A: a change in the inventory, a piece dropped in the ring, syncs the rings on the next frame: it catches at once)
    if (!this.invHooked && this.inv && this.inv.attached && typeof this.inv.onChange === 'function') { this.invHooked = true; this.inv.onChange(() => { this.fuelT = Math.min(this.fuelT || 0, 0.02); }); }
    if ((this.fuelT = (this.fuelT || 0) - dt) <= 0) { this.fuelT = 0.25; this.syncFires(); this.syncRain(); this.migrateTarps(); }
    this.tarp.update(dt); // fb4 E: the pitch armed, the rigs and the ghost drawn
  }
  // fb4 E: last round's tarp floating over a ring or a pack (a `tarpup` container on the ground) becomes the tarp folded
  // in a pile where it stood, to be pitched again on trees or poles
  migrateTarps() {
    const inv = this.inv;
    if (!inv || !inv.attached) return;
    for (let i = inv.containers.length - 1; i >= 0; i--) {
      const c = inv.containers[i];
      if (c.item !== 'tarpup') continue;
      inv.containers.splice(i, 1);
      if (c.where === 'ground' && c.at && c.grid.length) {
        const pile = inv.addContainer('pile', 'ground', { x: c.at.x, z: c.at.z, y: Number.isFinite(c.at.y) ? c.at.y : this.player.groundAt(c.at.x, c.at.z), heading: c.at.heading || 0, left: true, ...(c.at.camp ? { camp: c.at.camp } : {}) }, { quiet: true });
        for (const e of c.grid) if (!e.box) inv.put(pile, e.id, { qty: e.qty || 1, data: e.data || null, quiet: true });
        inv.emit('ground');
      } else if (c.grid.length) for (const e of c.grid) if (!e.box) inv.place(e.id, e.qty || 1, { crate: true, quiet: true });
      inv.emit('containers');
    }
  }
  covered(x, z) { return !!(this.tarp && this.tarp.covers(x, z)); }

  // --- fb3 B: the tarp and the rain -----------------------------------------------------------------------------------
  // the rain falling here, 0–1 (none inside a store)
  rainNow() {
    const W = this.camp.weather, L = W && W.look;
    if (!L || !(L.rain > 0)) return 0;
    const en = this.energy;
    try { if (en && typeof en.inside === 'function' && en.inside()) return 0; } catch { /* no store */ }
    return Math.max(0, L.rain * (1 - 0.5 * (L.snow || 0)));
  }
  // the book's right-click on the tarp (inventory.verb('tarp') calls this, or tarp.verb itself): Pitch the tarp where you
  // stand, on trees or poles (tarp.js) → { enabled, why, needs, next, label, run }
  tarpVerb(c, e) { return this.tarp.verb(c, e); }
  // a container that holds gear the rain can get into: a pack or a barrel (worn on the back or the chest), not the
  // bucket, the tackle box or a pile
  isGear(c) { const d = itemDef(c.item); return !!(d && d.wear && !d.fixed && !d.station && !d.dry); } // (content C: a waterproof pack keeps the rain out)
  // a few times a second: rain on the packs set down with no tarp over them soaks the gear after a while; it dries in
  // the dry (the ring's wood is syncFire's)
  syncRain() {
    const inv = this.inv, p = this.player, now = this.now, last = Number.isFinite(this.rainT) ? this.rainT : now;
    this.rainT = now;
    if (!inv || !inv.attached) return;
    const dh = Math.max(0, Math.min(1, now - last)), rain = this.rainNow(), tr = this.camp.trip;
    if (!(dh > 0)) return;
    for (const c of inv.containers) {
      if (c.where !== 'ground' || !c.at || !this.isGear(c)) continue;
      if (Math.abs(c.at.x - p.x) > 80 || Math.abs(c.at.z - p.z) > 80) continue;
      // (fb4 E: under the tarp's sheet it stays dry; `at.wet` says the pack is wet through, for its status in the book)
      if (rain > RAIN.on && !this.covered(c.at.x, c.at.z)) {
        c.at.rainH = (c.at.rainH || 0) + dh * rain;
        if (c.at.rainH >= RAIN.packAfter) c.at.wet = true;
        if (c.at.rainH >= RAIN.packAfter && tr && tr.state && !tr.state.wet && tr.adventure) { tr.state.wet = true; this.note(`Rain has got into the ${lowerName(c)} on the ground: the gear is wet until a fire dries it. Under the tarp it would have kept dry.`, 6); }
      } else if (c.at.rainH) { c.at.rainH = Math.max(0, c.at.rainH - dh * RAIN.dry); if (c.at.rainH < RAIN.packAfter * 0.5) delete c.at.wet; }
    }
  }

  // --- the fire (fb2 A: from the book) -------------------------------------------------------------------------------
  // Every ring with a fuel bin, a few times a second: what lies in the ring is the fire laid (drawn so) until it is lit;
  // a fire burning takes its next piece from the ring while under KEEP hours are left, so it burns full while there is
  // wood in the ring and burns down after (a night's jump burns the ring's wood on in turn, as it would have); a dead
  // branch dropped on hot coals catches them again; a cold ring with nothing in it is no fire at all.
  syncFires() {
    const inv = this.inv;
    if (!inv || !inv.attached || !this.fires) return;
    for (const b of inv.containers) if (b.item === 'firefuel' && b.at && b.at.fuel) this.syncFire(b.at.fuel, b);
  }
  syncFire(key, b = this.fuelBin(key)) {
    const F = this.fires, now = this.now;
    if (!F || !b) return;
    const units = this.binUnits(b), at = b.at.ring || { x: b.at.x, y: b.at.y - 0.05, z: b.at.z, a: 0 };
    const last = Number.isFinite(b.at.syncT) ? b.at.syncT : now;
    b.at.syncT = now;
    let f = F.get(key), changed = false;
    // fb3 B: rain on the ring with no tarp over it: a burning fire burns down RAIN.burn times faster, and the wood in the
    // ring is wet through after RAIN.wetAfter hours of it (it won't light for RAIN.wetFor hours); dry weather dries it
    const rain = this.rainNow(), dh = Math.max(0, Math.min(1, now - last));
    if (rain > RAIN.on && dh > 0 && !this.covered(at.x, at.z)) { // (fb4 E: under the tarp's sheet it stays dry)
      b.at.rainH = (b.at.rainH || 0) + dh * rain;
      if (f && !f.laid && now < f.until) f.until = Math.max(now, f.until - dh * rain * RAIN.burn);
      if (b.at.rainH >= RAIN.wetAfter) {
        b.at.wetUntil = now + RAIN.wetFor;
      }
    } else if (b.at.rainH && dh > 0) b.at.rainH = Math.max(0, b.at.rainH - dh * RAIN.dry);
    // a fire laid before the ring had a bin (an older save): its wood is in the ring as branches
    if (f && f.laid && !units.length && !b.at.v) { b.at.v = 2; for (let n = Math.max(2, Math.round(f.laid / FIRE.branch)); n > 0; n--) if (!this.inv.put(b, 'wood:branch', { quiet: true })) break; return; }
    b.at.v = 2;
    // fb5 A: a piece put in (more pieces than last seen) arms the ring: lit by itself when it holds enough dry wood (and
    // you are by it, to strike the match); an old save's laid fire is armed once, quietly, as it loads
    const seen = this.ringSeen.get(key), first = !seen;
    const n = units.length, prevN = Number.isFinite(b.at.n) ? b.at.n : n;
    if (n > prevN) b.at.armed = true;
    if (first && f && f.laid && b.at.armed === undefined) b.at.armed = true;
    b.at.n = n;
    const dry = units.filter((u) => !wetU(u));
    // the dry pieces fed while it burns: the long-burning while there is time, the quick ones once it is low
    const chain = () => {
      let fed = 0;
      f = F.get(key);
      while (dry.length && f.until - now < KEEP) {
        const left = f.until - now, by = (u) => u.burn;
        const i = dry.reduce((bi, u, k) => (left > 0.25 ? by(u) > by(dry[bi]) : by(u) < by(dry[bi])) ? k : bi, 0);
        const u = dry.splice(i, 1)[0], h = this.takeFromBin(b, u);
        if (!h) break;
        f.until = Math.min(Math.max(now, f.until) + FIRE.most, f.until + h); fed++;
      }
      return fed;
    };
    if (f && !f.laid && f.lit > -1e8) {
      const st = F.state(key);
      // burning, or burnt out since it was last seen burning (the night's jump): the ring's wood burns on in turn
      if (st === 'burning' || (f.until >= last - 1e-6 && f.until < now)) { changed = chain() > 0; }
      else if (st === 'coals' && dry.length) {
        // any dry piece on the hot coals catches them again (the quick-catching first)
        const i = dry.reduce((bi, u, k) => (u.burn < dry[bi].burn ? k : bi), 0), br = dry.splice(i, 1)[0], h = this.takeFromBin(b, br);
        if (h) {
          const quiet = first || !this.byRing(at);
          F.feed(key, now, h, { flare: !quiet }); this.lit.add(key); chain(); changed = true; b.at.armed = false;
          if (!quiet) this.sound(strike, { x: at.x, y: at.y + 0.2, z: at.z }, true);
          this.ringEvent(key, 'lit', { relit: true, quiet });
        }
      } else if (st === 'none') { F.douse(key); this.lit.delete(key); f = null; changed = true; }
      if (f) { this.ringWatch(key, b); if (changed) { this.inv.emit('items'); this.persist(); } return; }
    }
    // not lit: the wood in the ring is a fire laid, or there is none
    if (units.length) {
      const hours = units.reduce((s, u) => s + u.burn, 0);
      if (f && f.laid) f.laid = hours; else if (!f) { F.lay(key, at, hours); this.lit.add(key); }
      const c = woodCount(units);
      if (b.at.armed && lights(c) && (first || this.byRing(at))) { this.catchFire(key, b, at, { quiet: first }); return; }
    } else if (f && f.laid) { F.douse(key); this.lit.delete(key); }
    this.ringWatch(key, b);
  }
  // you are by the ring (someone there to strike the match): within 6 m of it on foot
  byRing(at, r = 6) { const p = this.player; return !!(p && (p.mode === 'walk' || p.mode === 'carry') && Math.hypot(p.x - at.x, p.z - at.z) <= r); }
  // fb5 A: the ring catches: the dry kindling (the old armful, else the quickest-burning dry piece, a branch) kindled, a
  // match struck and the flare (fire.js), the rest of the dry wood fed in turn; quiet (a save loading): no match, no sound
  catchFire(key, b, at, { quiet = false } = {}) {
    const F = this.fires, units = this.binUnits(b).filter((u) => !wetU(u));
    const arm = units.find((u) => u.id === 'firewood'), br = units.filter((u) => u.id === 'wood:branch');
    const k = arm || br[0] || units[0];
    const h = k ? this.takeFromBin(b, k) : 0;
    if (!h) return false;
    const f = F.get(key); if (f) f.laid = 0;
    F.kindle(key, at, this.now, h, { flare: !quiet }); this.lit.add(key);
    b.at.armed = false; b.at.syncT = this.now;
    this.syncFire(key, b); // (the rest of the dry wood in turn)
    if (!quiet) this.sound(strike, { x: at.x, y: at.y + 0.2, z: at.z }, false);
    this.ringEvent(key, 'lit', { relit: false, quiet });
    this.inv.emit('items'); this.persist();
    return true;
  }
  // the fire's events (fire.js emit): said once a change is seen
  ringEvent(key, type, more = {}) { const F = this.fires; if (F && typeof F.emit === 'function') F.emit(type, { key, ...more }); }
  // each sync: burning low (under LOW_H of wood in all, once a burn), down to coals, gone cold; wet wood keeping a ring
  // that has enough pieces from catching (once, until it changes)
  ringWatch(key, b) {
    const F = this.fires, st = F.state(key), was = this.ringSeen.get(key) || { st, low: false, wet: false };
    const units = this.binUnits(b), burn = F.burn(key, units);
    const low = !!(burn && burn.left < LOW_H), c = woodCount(units), wet = st !== 'burning' && !!b.at.armed && c.wet > 0 && !lights(c) && c.n >= LIGHT_PIECES;
    if (this.ringSeen.has(key)) {
      if (low && !was.low) this.ringEvent(key, 'low', { left: burn.left });
      if (was.st === 'burning' && st === 'coals' && !((F.get(key) || {}).out > 0)) this.ringEvent(key, 'coals'); // (not while it is being put out)
      if ((was.st === 'coals' || was.st === 'burning') && (st === 'none' || st === 'laid')) this.ringEvent(key, 'out', { doused: !!this.dousedNow });
      if (wet && !was.wet) this.ringEvent(key, 'wet');
    }
    this.dousedNow = false;
    this.ringSeen.set(key, { st, low: low || (was.low && !!burn && burn.left < LOW_H + 0.05), wet });
  }
  ringAt(site) { const f = site.layout.fire; return { x: f.x, y: f.y, z: f.z, a: f.a || 0 }; }
  // what the ring holds now, for its panel: { state, left (h burning), fuel (h in the ring), units, hours, kindling }
  fireInfo(key) {
    const F = this.fires, b = this.fuelBin(key), units = this.binUnits(b), st = F ? F.state(key) : 'none';
    const left = F ? F.left(key) : 0, fuel = units.reduce((s, u) => s + u.burn, 0);
    const kindling = units.some((u) => u.id === 'wood:branch' || u.id === 'firewood');
    return { state: st, left, fuel, hours: left + fuel, units, kindling, bin: b };
  }
  // fb5 A: what the ring at `key` is short of, as chips (fire.js ringNeed): [{ kind, text, n?, item?, lead? }] or null
  // (burning, or enough dry wood in it); with no key, the ring of the site you are at
  fireNeeds(key = null) {
    const k = key || this.hereKey();
    if (!k || !this.fires) return null;
    const b = this.fuelBin(k);
    return this.fires.ringNeed(k, this.binUnits(b));
  }
  // the one chip (the dot's line, stream E's moments): { kind, text, n?, item? } or null
  fireNeed(key = null) { const n = this.fireNeeds(key); return n && n.length ? n[0] : null; }
  hereKey() { const p = this.player, s = this.camp.nearestSite ? this.camp.nearestSite(p.x, p.z, 25, true) : null; return s ? keyOf(s) : null; }
  // the ring's check (fire.js lightCheck): enabled when nothing is missing; why its first chip
  lightCheck(key) { return this.fires.lightCheck(key, this.binUnits(this.fuelBin(key))); }
  lightProblem(key) { const c = this.lightCheck(key); return c.enabled ? null : c.why; }
  // a piece in the ring's fuel as a status (inventory.status, through main.js's fb5 A block; the owner, 2026-10-25: "i dont
  // need to know a stick burns this much and can be used for this on hover"): its state word alone, Wet (or Drying by
  // the lit fire), else nothing: no "on the fire", no burn time, no timer
  fuelStatus(c, e) {
    if (!c || c.item !== 'firefuel' || !e || e.box || !isWood(e.id)) return null;
    if (!(e.data && e.data.wet > 0)) return null;
    const lit = !!(c.at && this.fires && this.fires.isLit(c.at.fuel));
    return lit ? { label: 'Drying', mark: 'drying' } : { label: 'Wet', mark: 'wet' };
  }
  douseCheck(key) { return this.fires.douseCheck(key); }
  // held: water on it, stirred in, water again, the steam boiling up and the hiss, the coals cold; let go, it stays as
  // far as it got. What wood was still in the ring stays there, wet through, a fire laid.
  douse(site, key, opts = {}) {
    const F = this.fires, p = this.player, f = F.get(key), at = this.ringAt(site);
    if (!f || f.laid) return null;
    const start = Math.min(2, Math.floor((f.out || 0) * 3 + 1e-6)), pos = { x: at.x, y: at.y + 0.3, z: at.z };
    let fx = false;
    return hold.begin({
      id: 'fire-out', label: 'Putting the fire out', phases: DOUSE, at: start, crouch: !opts.book, near: { x: p.x, z: p.z, r: 2.5 }, ...opts,
      onTick: (a) => {
        if (!fx) { fx = true; this.sound(hiss, pos, 1); }
        F.douseK(key, a / DOUSE.length);
        this.steamAt = { x: at.x, y: at.y + 0.05, z: at.z }; this.steamT = Math.max(this.steamT, 1.4);
      },
      onPhase: (i) => {
        if (i === 0) { // drowned: no wood burning, and what is left in the ring drowned with it (fb5 A: so it does not catch again by itself)
          const g = F.get(key); if (g && g.until > this.now) g.until = this.now; this.sound(hiss, pos, 1.2);
          const b = this.fuelBin(key);
          if (b) { b.at.armed = false; for (const e of b.grid) if (!e.box && isWood(e.id)) e.data = { ...(e.data || {}), wet: WOOD_DRY.air }; this.inv.emit('items'); }
        }
        if (i === 1) this.sound(hiss, pos, 0.7);
      },
      onDone: () => {
        F.douse(key); this.lit.delete(key); this.steamT = 2.6;
        const b = this.fuelBin(key); if (b) b.at.syncT = this.now;
        this.note('The fire is out.', 3);
        this.dousedNow = true;
        this.syncFire(key, b);
        this.persist();
      },
      onStop: (job) => {
        F.douseK(key, job.done / DOUSE.length);
        if (job.done > 0 && job.done < DOUSE.length) this.note('The coals are still hot.', 3);
        this.persist();
      },
    });
  }

  // --- the latrine ---------------------------------------------------------------------------------------------------
  // wc A: E Sit at the box (the dot, nearby.js): you walk back to it and sit (stream C's player.sitAt through `seat`,
  // else cook.sitAt), and ten quiet minutes pass on their own (an auto hold, no key held); the rest bonus once a day.
  // E or a move key stands you up (nearby.js cancels the hold once you are up). seat: { sit(spot) → bool, stand(),
  // seated() → bool } or null for cook.js's own
  latrine(site, seat = null) {
    if (hold.active || this.cook.busy) return null;
    const spot = this.cook.latrineSpot(site), own = !(seat && typeof seat.sit === 'function');
    if (own) { this.cook.sitAt(spot); this.cook.seat.quiet = true; }
    else if (seat.sit(spot) === false) { this.note('Not from here: stand by the box.', 3); return null; }
    const seated = () => (own ? !!(this.cook.seat && this.cook.seat.phase === 'seated') : !!seat.seated());
    const up = () => { if (own) this.cook.standUp(); else seat.stand(); };
    this.latrineSat = false;
    return hold.begin({
      id: 'latrine', label: 'The latrine', phases: LATRINE, near: { x: spot.stand.x, z: spot.stand.z, r: 6 }, auto: true,
      wait: () => { const s = seated(); if (s) this.latrineSat = true; return !s; },
      onDone: () => {
        const e = this.energy, first = this.s.latrine !== this.today;
        this.s.latrine = this.today;
        if (first && e && e.live && e.needs) {
          // the rest need is the night's rest under a ceiling that falls with the hours awake (energy.js restCeiling: a
          // thirtieth an hour), so the box gives back what an hour and a half less awake would, and the night's share too
          const want = Math.min(1, e.needs.rest + LATRINE_REST);
          if (Number.isFinite(e.awakeSince)) e.awakeSince = Math.min(e.now, e.awakeSince + LATRINE_REST * 30);
          e.needs.rest = want;
        }
        this.note(first ? 'Ten quiet minutes on the box back in the trees, a red squirrel scolding. A little more rested.' : 'Ten quiet minutes on the box back in the trees.', 5);
        up();
        this.persist();
      },
      onStop: () => { if (own) this.cook.standUp(); },
    });
  }
  // the latrine's hold stops once you have got up from the box early (nearby.js, each frame): seated() as above
  latrineUp(seated) { if (hold.is('latrine') && this.latrineSat && !seated()) { this.latrineSat = false; hold.cancel(); } }
  usedLatrine() { return this.s.latrine === this.today; }

  // --- the wood about ----------------------------------------------------------------------------------------------
  // A piece at (x, z) of `kind` with variant from rng, lying on the ground: clear of trunks, rocks, logs and anything
  // built, off the water, the ring, the pad, the bench, the latrine and the woodpile, on ground it lies flat on (its ends'
  // ground no more than a third of its length apart). The piece, or null.
  // (loose: where it falls, the checks but the ground's let go: a length dropped by your feet)
  pieceAt(key, kind, x, z, rng, site = null, loose = false) {
    const w = this.world, t = this.camp.tiles;
    if (!w.isReady(x, z) || !(w.shoreAt(x, z) > (loose ? 0.3 : 2))) return null;
    const v = Math.floor(rng() * 3), len = LENGTH[kind][v], yaw = rng() * Math.PI * 2, cx = Math.cos(yaw), sz = -Math.sin(yaw);
    const x0 = x - cx * len / 2, z0 = z - sz * len / 2, x1 = x + cx * len / 2, z1 = z + sz * len / 2;
    const g0 = t.groundAt(x0, z0), g1 = t.groundAt(x1, z1), g = t.groundAt(x, z);
    if (![g0, g1, g].every(Number.isFinite)) return null;
    if (loose) { const y = (g0 + g1) / 2 - 0.012, q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, Math.atan2(g1 - g0, len), 'YXZ')); return { key, kind, v, x, y, z, len, yaw, pos: new THREE.Vector3(x, y, z), q, g: this.pieceIdx[`${kind}${v}`] }; }
    if (Math.abs(g1 - g0) > len * 0.34 || Math.abs((g0 + g1) / 2 - g) > 0.08) return null;
    const L = site && site.layout;
    if (L) for (const [q, r] of [[L.fire, 3.2], [L.pad, 3.4], [L.bench, 2.2], [L.latrine, 2.2]]) if (q && Math.hypot(q.x - x, q.z - z) < r) return null;
    if (site && Math.hypot(this.pileSpot(site).x - x, this.pileSpot(site).z - z) < 1.6) return null;
    for (const o of t.treesNear(x, z, len / 2 + 0.3)) {
      if (o.shape) { for (const [px, pz] of [[x, z], [x0, z0], [x1, z1]]) if (o.shape.heightAt(px, pz) > Math.min(g0, g1) + 0.02) return null; continue; }
      if (o.box) { const dx = x - o.x, dz = z - o.z; if (Math.abs(dx * o.ux + dz * o.uz) < o.hx + 0.35 && Math.abs(-dx * o.uz + dz * o.ux) < o.hz + 0.35) return null; continue; }
      // a trunk: off the piece's line by its radius and a little
      const ux = cx, uz = sz, px = o.x - x0, pz = o.z - z0, along = Math.max(0, Math.min(len, px * ux + pz * uz));
      if (Math.hypot(o.x - (x0 + ux * along), o.z - (z0 + uz * along)) < (o.r || 0.3) + 0.12) return null;
    }
    const y = (g0 + g1) / 2 - 0.012, pitch = Math.atan2(g1 - g0, len);
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, pitch, 'YXZ'));
    return { key, kind, v, x, y, z, len, yaw, pos: new THREE.Vector3(x, y, z), q, g: this.pieceIdx[`${kind}${v}`] };
  }
  // a site's wood: SITE_WOOD.branches dead branches and SITE_WOOD.logs short logs about it, most under the trees and by
  // the down logs (the same every time: the site's key seeds it)
  siteWood(site) {
    const key = keyOf(site);
    let list = this.sites.get(key);
    if (list) return list;
    const L = site.layout; if (!L) return null;
    const f = L.fire, t = this.camp.tiles, rng = mulberry32(strHash(key) ^ 0x5eed);
    const near = t.treesNear(f.x, f.z, SITE_WOOD.to);
    const trunks = near.filter((o) => !o.shape && !o.box && (o.r || 0) > 0.07 && Math.hypot(o.x - f.x, o.z - f.z) > SITE_WOOD.from);
    const logs = near.filter((o) => o.log);
    list = [];
    let nb = 0, nl = 0;
    for (let i = 0; i < SITE_WOOD.tries && (nb < SITE_WOOD.branches || nl < SITE_WOOD.logs); i++) {
      const kind = nb >= SITE_WOOD.branches ? 'log' : nl >= SITE_WOOD.logs ? 'branch' : rng() < 0.32 ? 'log' : 'branch', r = rng();
      let x, z;
      if (logs.length && r < 0.25) {
        const g = logs[Math.floor(rng() * logs.length)], u = 0.15 + rng() * 0.7, lx = g.ax + (g.bx - g.ax) * u, lz = g.az + (g.bz - g.az) * u;
        const dl = Math.hypot(g.bx - g.ax, g.bz - g.az) || 1, nx = -(g.bz - g.az) / dl, nz = (g.bx - g.ax) / dl, side = rng() < 0.5 ? -1 : 1, off = (g.rad || 0.2) + 0.45 + rng() * 0.7;
        x = lx + nx * side * off; z = lz + nz * side * off;
      } else if (trunks.length && r < 0.86) {
        const g = trunks[Math.floor(rng() * trunks.length)], a = rng() * Math.PI * 2, d = (g.r || 0.2) + 0.6 + rng() * 1.9;
        x = g.x + Math.cos(a) * d; z = g.z + Math.sin(a) * d;
      } else { const a = rng() * Math.PI * 2, d = SITE_WOOD.from + 2 + rng() * (SITE_WOOD.to - SITE_WOOD.from - 4); x = f.x + Math.cos(a) * d; z = f.z + Math.sin(a) * d; }
      const dd = Math.hypot(x - f.x, z - f.z);
      if (dd < SITE_WOOD.from || dd > SITE_WOOD.to) continue;
      const p = this.pieceAt(`s:${key}:${i}`, kind, x, z, rng, site);
      if (!p) continue;
      list.push(p); if (kind === 'log') nl++; else nb++;
    }
    this.sites.set(key, list);
    return list;
  }
  // fb4 E: a site's dead poles (SITE_POLES), by the down logs and under the trees, seeded apart from its wood (so the
  // wood lies where it always has)
  sitePoleList(site) {
    const key = keyOf(site);
    let list = this.sitePoles.get(key);
    if (list) return list;
    const L = site.layout; if (!L) return null;
    const f = L.fire, rng = mulberry32(strHash(key) ^ 0x9013), near = this.camp.tiles.treesNear(f.x, f.z, SITE_POLES.to);
    const trunks = near.filter((o) => !o.shape && !o.box && (o.r || 0) > 0.07 && Math.hypot(o.x - f.x, o.z - f.z) > SITE_POLES.from), logs = near.filter((o) => o.log);
    list = [];
    for (let i = 0; i < SITE_POLES.tries && list.length < SITE_POLES.n; i++) {
      let x, z;
      const r = rng();
      if (logs.length && r < 0.4) { const g = logs[Math.floor(rng() * logs.length)], u = 0.2 + rng() * 0.6, side = rng() < 0.5 ? -1 : 1, dl = Math.hypot(g.bx - g.ax, g.bz - g.az) || 1; x = g.ax + (g.bx - g.ax) * u - ((g.bz - g.az) / dl) * side * ((g.rad || 0.2) + 0.5); z = g.az + (g.bz - g.az) * u + ((g.bx - g.ax) / dl) * side * ((g.rad || 0.2) + 0.5); }
      else if (trunks.length && r < 0.9) { const g = trunks[Math.floor(rng() * trunks.length)], a = rng() * Math.PI * 2, d = (g.r || 0.2) + 1.2 + rng() * 2; x = g.x + Math.cos(a) * d; z = g.z + Math.sin(a) * d; }
      else { const a = rng() * Math.PI * 2, d = SITE_POLES.from + 3 + rng() * (SITE_POLES.to - SITE_POLES.from - 5); x = f.x + Math.cos(a) * d; z = f.z + Math.sin(a) * d; }
      const dd = Math.hypot(x - f.x, z - f.z);
      if (dd < SITE_POLES.from || dd > SITE_POLES.to) continue;
      const p = this.pieceAt(`p:${key}:${i}`, 'pole', x, z, rng, site);
      if (p) list.push(p);
    }
    this.sitePoles.set(key, list);
    return list;
  }
  // a cell of the woods away from any site: nothing in the open, a branch or two under the trees, more in the dark spruce
  // and the old burns (undefined while its ground is not in)
  cellWood(ci, cj) {
    const w = this.world, C = WOOD.cell, cx = (ci + 0.5) * C, cz = (cj + 0.5) * C;
    const cv = w.coverCell(w.cellI(cx), w.cellJ(cz));
    if (!cv || !w.isReady(cx, cz)) return undefined;
    if (this.camp.nearestSite(cx, cz, SITE_WOOD.to + 14, false)) return null; // a site's own wood covers it
    const cls = GROUND[(cv >> 16) & 255], wgt = WOODS[cls] || 0, h = (k) => hash2(ci * 7 + k, cj * 13 - k, 911 + k);
    const n = Math.floor(wgt * 1.6 + h(1) * 1.2 - 0.25);
    const trunks = this.camp.tiles.treesNear(cx, cz, C * 0.6).filter((o) => !o.shape && !o.box && (o.r || 0) > 0.07);
    const rng = mulberry32(Math.floor(h(2) * 4294967295)), out = [];
    for (let k = 0; k < n * 3 && out.length < n; k++) {
      const kind = rng() < 0.25 ? 'log' : 'branch';
      let x, z;
      if (trunks.length && rng() < 0.85) { const g = trunks[Math.floor(rng() * trunks.length)], a = rng() * Math.PI * 2, d = (g.r || 0.2) + 0.6 + rng() * 1.8; x = g.x + Math.cos(a) * d; z = g.z + Math.sin(a) * d; }
      else { x = cx + (rng() - 0.5) * C * 0.9; z = cz + (rng() - 0.5) * C * 0.9; }
      const p = this.pieceAt(`w:${ci}:${cj}:${k}`, kind, x, z, rng);
      if (p) out.push(p);
    }
    // fb4 E: a dead pole now and then under the trees (its own seed: the wood above lies where it always has)
    if (trunks.length && h(5) < wgt * 0.5) {
      const r2 = mulberry32(Math.floor(h(6) * 4294967295));
      for (let k = 0; k < 4; k++) { const g = trunks[Math.floor(r2() * trunks.length)], a = r2() * Math.PI * 2, d = (g.r || 0.2) + 1 + r2() * 2; const p = this.pieceAt(`wp:${ci}:${cj}:${k}`, 'pole', g.x + Math.cos(a) * d, g.z + Math.sin(a) * d, r2); if (p) { out.push(p); break; } }
    }
    return out.length ? out : null;
  }
  // the pieces round (x, z): the sites' and the woods' (cells read a few a time), and what the saw dropped
  refreshWood(x, z) {
    const C = WOOD.cell, ci0 = Math.floor(x / C), cj0 = Math.floor(z / C), R = Math.ceil(WOOD.near / C);
    let read = 0;
    for (let dj = -R; dj <= R && read < 6; dj++) for (let di = -R; di <= R && read < 6; di++) {
      const ci = ci0 + di, cj = cj0 + dj, k = `${ci},${cj}`;
      if (this.cells.get(k) !== undefined) continue;
      if (Math.hypot((ci + 0.5) * C - x, (cj + 0.5) * C - z) > WOOD.near + C) continue;
      const r = this.cellWood(ci, cj);
      read++;
      if (r !== undefined) { this.cells.set(k, r); if (r) this.dirty = true; }
    }
    for (const [k, v] of this.cells) { const [ci, cj] = k.split(',').map(Number); if (Math.hypot((ci + 0.5) * C - x, (cj + 0.5) * C - z) > WOOD.drop) { this.cells.delete(k); if (v) this.dirty = true; } }
    for (const c of this.world.campsites) {
      if (Math.abs(c.x - x) > 120 || Math.abs(c.z - z) > 120 || !c.layout) continue;
      if (!this.sites.has(keyOf(c))) { this.siteWood(c); this.dirty = true; }
      if (!this.sitePoles.has(keyOf(c))) { this.sitePoleList(c); this.dirty = true; }
    }
    const sig = `${ci0},${cj0}|${this.today}`;
    if (sig !== this.lastCell) { this.lastCell = sig; this.dirty = true; }
  }
  available(pc) { const t = this.s.taken[pc.key]; return t == null || this.today - t >= WOOD.regrow; }
  // every piece about, available or not
  *allPieces() {
    for (const list of this.sites.values()) yield* list;
    for (const list of this.sitePoles.values()) yield* list;
    for (const list of this.cells.values()) if (list) yield* list;
    for (const d of this.dropped) yield d;
  }
  nearestPiece(x, z, r) {
    let best = null, bd = r;
    for (const pc of this.near) {
      const d = Math.hypot(pc.x - x, pc.z - z) - Math.min(0.35, pc.len * 0.3);
      if (d < bd) { bd = d; best = pc; }
    }
    return best ? { ...best, d: Math.max(0, bd), ref: best } : null;
  }
  // the pieces near you, in one geometry (rebuilt when what is there changes)
  drawWood() {
    this.dirty = false;
    const p = this.player, tent = this.camp.camp, list = [], poles = [];
    for (const pc of this.allPieces()) {
      if (Math.abs(pc.x - p.x) > WOOD.near || Math.abs(pc.z - p.z) > WOOD.near) continue;
      if (!this.available(pc)) continue;
      if (tent && Math.hypot(tent.x - pc.x, tent.z - pc.z) < 2.3) continue; // under your tent
      (pc.kind === 'pole' ? poles : list).push(pc);
    }
    this.near = list.slice(); this.poleNear = poles; // (fb4 E: the poles apart: the book's Here and the dot's wood read `near`)
    list.push(...poles); // (drawn together)
    const old = this.field.geometry;
    this.field.geometry = list.length ? mergePieces(list, this.pieceGeos) : new THREE.BufferGeometry();
    old.dispose();
    this.field.visible = list.length > 0;
  }
  get dropped() { return this._dropped || (this._dropped = []); }
  // E at a piece (the pointer, nearby.js): into an armload (a free hand), else into what you carry
  pickUp(pc) {
    if (pc.kind === 'pole') return this.pickUpPole(pc);
    const inv = this.inv, id = pieceItem(pc.kind), name = pieceName(pc.kind);
    const arm = this.armFor(id, true);
    let ok = !!(arm && inv.put(arm, id, { quiet: true })), where = 'your arms';
    if (!ok) {
      const pool = inv.reachable().filter((c) => c.item !== 'grate' && c.item !== 'pockets' && c.item !== 'crate');
      const r = inv.place(id, 1, { pool, quiet: true });
      ok = r.ok;
      const c = r.cId && inv.cont(r.cId);
      if (c) where = `the ${lowerName(c)}`;
    }
    if (!ok) { this.note('Your hands are full, and nothing you carry has room for it.', 3.5); return; }
    this.claimPiece(pc);
    this.redrawIn = 0.28; // it leaves the ground as the hand gets to it
    this.cook.gesture = { t: 0, dur: 0.5, say: `Picking up the ${name}…` };
    this.sound(woodKnock, { x: pc.x, y: pc.y + 0.1, z: pc.z }, pc.kind === 'log');
    const n = this.armloads().reduce((s, c) => s + c.grid.reduce((k, e) => k + e.qty, 0), 0);
    // (fb5 A: no standing count for the evening; the ring says what it is short of)
    this.note(where === 'your arms' ? `A ${name} · ${n} in your arms.` : `A ${name}, into ${where}.`, 2);
    inv.emit('items');
    this.persist();
  }
  // fb4 E: a dead pole off the ground: onto the poles in a hand (four to an armful), into a free hand, else into what
  // you carry; the count for the tarp said
  pickUpPole(pc) {
    const inv = this.inv, d = itemDef('pole'), stack = (d && d.stack) || 1;
    let ok = false, where = 'your hand';
    const held = inv.containers.find((c) => c.where === 'hands' && c.grid.length === 1 && c.grid[0].id === 'pole' && c.grid[0].qty < stack);
    if (held && inv.put(held, 'pole', { quiet: true })) ok = true;
    else if (inv.freeHand() >= 0 && typeof inv.toHandNew === 'function' && inv.canHand('pole')) ok = inv.toHandNew('pole').ok;
    if (!ok) {
      const pool = inv.reachable().filter((c) => c.item !== 'grate' && c.item !== 'pockets' && c.item !== 'crate' && !(itemDef(c.item) || {}).station);
      const r = inv.place('pole', 1, { pool, quiet: true });
      ok = r.ok;
      const c = r.cId && inv.cont(r.cId);
      if (c) where = `the ${lowerName(c)}`;
    }
    if (!ok) { this.note('Your hands are full, and nothing you carry has room for it.', 3.5); return; }
    this.claimPiece(pc);
    this.redrawIn = 0.28;
    this.cook.gesture = { t: 0, dur: 0.5, say: 'Picking up the dead pole…' };
    this.sound(woodKnock, { x: pc.x, y: pc.y + 0.1, z: pc.z }, false);
    this.note(`A dead pole, into ${where}.`, 2.5);
    inv.emit('items');
    this.persist();
  }
  // fb4 E (decision 2): the evening's firewood at the camp you are at, as have of need: the pieces in the ring, the
  // woodpiles at the site and what you carry, against about four hours of fire: { have, need, unit, hours, label } or null
  nightWood(key = null) {
    const inv = this.inv;
    if (!inv || !inv.attached) return null;
    const a = this.camp.reachArea ? this.camp.reachArea() : null, k = key || (a && a.key);
    if (!k) return null;
    const site = this.camp.registry.site(k), f = site && site.layout ? site.layout.fire : null;
    if (!f) return null;
    let have = 0, hours = 0;
    const count = (c) => { for (const e of c.grid) if (!e.box && isWood(e.id)) { have += e.qty; hours += e.qty * burnOf(e.id); } };
    const bin = this.fuelBin(k);
    if (bin) count(bin);
    for (const c of inv.containers) {
      if (c === bin) continue;
      const r = inv.root(c), w = r.where;
      if (['hands', 'back', 'chest', 'pockets'].includes(w) || (w === 'ground' && r.at && Math.hypot(r.at.x - f.x, r.at.z - f.z) <= 25)) count(c);
    }
    return { label: 'Firewood for the evening', have, need: EVENING.pieces, unit: 'pieces', hours: +hours.toFixed(1), needHours: EVENING.hours };
  }
  // a piece off the ground (into a container: E, or a drag out of the book's Ground area, nearby.takePiece): gone
  // until it grows back (the saw's lengths for good)
  claimPiece(pc) {
    if (pc.key.startsWith('d:')) { const i = this.dropped.indexOf(pc); if (i >= 0) this.dropped.splice(i, 1); } else this.s.taken[pc.key] = this.today;
    this.redrawIn = Math.min(this.redrawIn > 0 ? this.redrawIn : 0.28, 0.28);
  }
  // can you pick piece pc up now: an armload with room, a free hand, or room in what you carry
  canTakePiece(pc) {
    const inv = this.inv, id = pieceItem(pc.kind);
    if (!inv || !inv.attached) return false;
    if (pc.kind === 'pole') { const s = (itemDef('pole') || {}).stack || 1; if (inv.containers.some((c) => c.where === 'hands' && c.grid.length === 1 && c.grid[0].id === 'pole' && c.grid[0].qty < s)) return true; if (inv.freeHand() >= 0) return true; }
    else if (this.armFor(id, false) || inv.freeHand() >= 0) return true;
    return inv.reachable().some((c) => c.item !== 'grate' && c.item !== 'pockets' && c.item !== 'crate' && !(itemDef(c.item) || {}).station && inv.firstFit(c, id));
  }
  // an armload with nothing in it is no thing at all
  dropEmptyArms() {
    const inv = this.inv;
    if (!inv || !inv.attached) return;
    for (let i = inv.containers.length - 1; i >= 0; i--) { const c = inv.containers[i]; if (c.item === 'woodarms' && !c.grid.length && c.where !== 'stash') { inv.containers.splice(i, 1); inv.emit('containers'); } }
  }

  // --- the saw -----------------------------------------------------------------------------------------------------------
  hasSaw() {
    const p = this.player, inv = this.inv;
    if (!(p.gear && p.gear.saw) && !(inv && inv.attached)) return false;
    if (!inv || !inv.attached) return !!(p.gear && p.gear.saw);
    return this.campPool().some((c) => c.grid.some((e) => e.id === 'saw' || e.id === 'axehead')) || inv.count('saw') > 0 || inv.count('axehead') > 0; // (content C: the Hudson’s Bay axe cuts as the saw does)
  }
  // fb2 A: the down log you stand at with the saw to hand (the book's panel): { log, k, cuts, d } or null
  sawTarget(r = SAW_REACH) {
    const p = this.player;
    if (p.mode !== 'walk' || !this.hasSaw()) return null;
    const log = this.camp.tiles.treesNear(p.x, p.z, 2.4).filter((o) => o.log).map((o) => ({ o, d: capsule(p.x, p.z, o) - (o.rad || 0.2) })).sort((a, b) => a.d - b.d)[0];
    if (!log || log.d > r) return null;
    const k = `${Math.round(log.o.x)}:${Math.round(log.o.z)}`, s = this.s.sawn[k], cuts = s && this.today - s.day < WOOD.regrow ? s.cuts : 0;
    return { log: log.o, k, cuts, d: log.d, left: SAW.length - cuts };
  }
  beginSaw(log, k, cuts, opts = {}) {
    const p = this.player;
    if (cuts >= SAW.length) return null;
    return hold.begin({
      id: 'saw', label: 'The folding saw', phases: SAW, at: cuts, crouch: true, near: { x: p.x, z: p.z, r: 2.5 }, ...opts,
      onPhase: (i) => {
        const was = this.s.sawn[k], keep = was && this.today - was.day < WOOD.regrow ? was.poles || 0 : 0;
        this.s.sawn[k] = { day: this.today, cuts: i + 1, ...(keep ? { poles: keep } : {}) }; // (fb4 E: the poles cut from it today kept)
        // the length drops beside the log, on your side of it
        const u = 0.25 + 0.25 * i, lx = log.ax + (log.bx - log.ax) * u, lz = log.az + (log.bz - log.az) * u;
        const dl = Math.hypot(log.bx - log.ax, log.bz - log.az) || 1; let nx = -(log.bz - log.az) / dl, nz = (log.bx - log.ax) / dl;
        if ((p.x - lx) * nx + (p.z - lz) * nz < 0) { nx = -nx; nz = -nz; }
        const rng = mulberry32(strHash(k) + i * 31 + this.today);
        let pc = null;
        for (let t = 0; t < 6 && !pc; t++) pc = this.pieceAt(`d:${k}:${this.today}:${i}`, 'log', lx + nx * ((log.rad || 0.2) + 0.4 + t * 0.2), lz + nz * ((log.rad || 0.2) + 0.4 + t * 0.2), rng);
        if (!pc) pc = this.pieceAt(`d:${k}:${this.today}:${i}`, 'log', p.x + (lx - p.x) * 0.35 + (i - 1) * 0.3 * -nz, p.z + (lz - p.z) * 0.35 + (i - 1) * 0.3 * nx, rng, null, true); // by your feet
        if (pc) { this.dropped.push(pc); this.dirty = true; this.sound(woodKnock, { x: pc.x, y: pc.y + 0.1, z: pc.z }, true); }
        this.persist();
      },
      onDone: () => this.note('Three short lengths of dry spruce lie by the log.', 4),
    });
  }
  // fb4 E: the down log you stand at, saw or not (stream A's dot reads it in place of sawTarget): E Saw and Q Cut a pole,
  // each held, each greyed with its checklist when the saw is not in reach or the log has given what it has today.
  // → { log, k, d, label, hint, e, q } or null
  downLogTarget(r = SAW_REACH) {
    const p = this.player;
    if (p.mode !== 'walk') return null;
    const log = this.camp.tiles.treesNear(p.x, p.z, 2.4).filter((o) => o.log).map((o) => ({ o, d: capsule(p.x, p.z, o) - (o.rad || 0.2) })).sort((a, b) => a.d - b.d)[0];
    if (!log || log.d > r) return null;
    const k = `${Math.round(log.o.x)}:${Math.round(log.o.z)}`, s = this.s.sawn[k], fresh = !!(s && this.today - s.day < WOOD.regrow);
    const cuts = fresh ? s.cuts || 0 : 0, poles = fresh ? s.poles || 0 : 0, saw = this.hasSaw(), left = SAW.length - cuts, pl = POLES_A_LOG - poles;
    const keys = (o) => { const kk = (o && o.key) || 'KeyE'; return { key: kk, keys: [...new Set([kk, 'Mouse0', ...((o && o.keys) || [])])] }; };
    const sawNeed = { label: 'The folding saw in reach', done: saw, note: saw ? null : 'in a pack you carry, a hand, or the canoe beside you' };
    const getSaw = 'The folding saw does it ($18 at an outfitter); till then, dead branches and poles lie about the camp';
    const e = {
      verb: 'Saw', held: true, why: !saw ? 'Saw: needs the folding saw' : left > 0 ? null : 'Sawn already: no more till another day',
      needs: [sawNeed, { label: 'Short logs left in it', have: left, need: SAW.length, unit: 'logs' }],
      next: !saw ? getSaw : left > 0 ? `Hold E: ${word(left)} ${plural(left, 'cut')}, 5 min each, a short log by it at each` : 'Another down log, or dead branches off the ground',
      run: (o) => this.beginSaw(log.o, k, cuts, keys(o)),
    };
    const q = {
      verb: 'Cut a pole', held: true, why: !saw ? 'Cut a pole: needs the saw' : pl > 0 ? null : 'Two poles cut from it today already',
      needs: [sawNeed, { label: 'Poles left in it today', have: pl, need: POLES_A_LOG, unit: 'poles' }],
      next: !saw ? getSaw : pl > 0 ? 'Hold Q: a straight two-metre pole off its top, 6 min' : 'Another down log, or dead poles lying under the trees',
      run: (o) => this.beginPoleCut(log.o, k, keys(o)),
    };
    const hint = left ? `${word(left)} short ${plural(left, 'log')} in it` : 'sawn up';
    return { log: log.o, k, d: log.d, label: 'a down spruce', hint, e, q, cuts, left };
  }
  // held: a pole cut off a down log with the saw, dropped by it on your side (E picks it up)
  beginPoleCut(log, k, opts = {}) {
    const p = this.player;
    if (!this.hasSaw()) { this.note('Cutting a pole needs the folding saw in reach.', 3); return null; }
    return hold.begin({
      id: 'pole-cut', label: 'Cutting a pole', phases: POLE_CUT, at: 0, crouch: true, near: { x: p.x, z: p.z, r: 2.5 }, ...opts,
      onPhase: () => {
        const s = this.s.sawn[k], fresh = !!(s && this.today - s.day < WOOD.regrow), n = (fresh ? s.poles || 0 : 0) + 1;
        this.s.sawn[k] = { day: this.today, cuts: fresh ? s.cuts || 0 : 0, poles: n };
        const u = 0.3 + 0.35 * (n - 1), lx = log.ax + (log.bx - log.ax) * u, lz = log.az + (log.bz - log.az) * u;
        const dl = Math.hypot(log.bx - log.ax, log.bz - log.az) || 1; let nx = -(log.bz - log.az) / dl, nz = (log.bx - log.ax) / dl;
        if ((p.x - lx) * nx + (p.z - lz) * nz < 0) { nx = -nx; nz = -nz; }
        const rng = mulberry32(strHash(k) + n * 57 + this.today), key = `d:${k}:${this.today}:p${n}`;
        let pc = null;
        for (let t = 0; t < 6 && !pc; t++) pc = this.pieceAt(key, 'pole', lx + nx * ((log.rad || 0.2) + 0.45 + t * 0.2), lz + nz * ((log.rad || 0.2) + 0.45 + t * 0.2), rng);
        if (!pc) pc = this.pieceAt(key, 'pole', p.x + (lx - p.x) * 0.4, p.z + (lz - p.z) * 0.4, rng, null, true);
        if (pc) { this.dropped.push(pc); this.dirty = true; this.sound(woodKnock, { x: pc.x, y: pc.y + 0.1, z: pc.z }, false); }
        this.note('A pole off the log: it lies by it.', 3);
        this.persist();
      },
    });
  }
  // fb4 E (decision 2): the latrine's line on the dot: the ten minutes, and the rest it gives once a day
  latrineNeeds() {
    const used = this.usedLatrine();
    return {
      hint: used ? 'used today' : `rest +${Math.round(LATRINE_REST * 100)} %, once a day`,
      needs: [{ label: 'Ten quiet minutes, sat', done: false }, { label: `Rest +${Math.round(LATRINE_REST * 100)} % (once a day)`, done: used }],
      next: used ? 'E sits you down: ten quiet minutes, no rest bonus again today' : 'E sits you down for ten quiet minutes; E or a move key stands you up',
    };
  }
  // fb4 E: the checklists onto the dot's targets that stream A's nearby.js does not give them yet (its own fields win):
  // the down log's Q Cut a pole (and the log with no saw in reach, greyed), the latrine's line, the hang's steps
  decorateTargets(list, ray, near) {
    if (!Array.isArray(list) || hold.active || this.cook.busy || this.player.mode !== 'walk') return list;
    const dl = this.downLogTarget(1.8), hg = this.camp.hang;
    let logShown = false;
    for (const c of list) {
      const t = c && c.target;
      if (!t) continue;
      if (t.kind === 'downLog') { logShown = true; if (dl) { if (!t.q) t.q = dl.q; if (t.e && !t.e.needs) Object.assign(t.e, { needs: dl.e.needs, next: dl.e.next }); } }
      else if (t.kind === 'seat' && /latrine/.test(t.label || '')) { const ln = this.latrineNeeds(); if (!t.hint) t.hint = ln.hint; if (t.e && !t.e.needs) Object.assign(t.e, { needs: ln.needs, next: ln.next }); }
      else if (t.kind === 'tree' && t.e && !t.e.needs && hg) { const tr = hg.treeTarget(); if (tr) Object.assign(t.e, { needs: tr.needs, next: tr.next }); }
      else if (t.kind === 'barrelHung' && t.e && !t.e.needs && hg) { const h = hg.hungTarget(); if (h) Object.assign(t.e, { needs: h.needs, next: h.next }); }
    }
    if (!logShown && dl && near && typeof near.segment === 'function') {
      const o = dl.log, p = this.player, ga = p.groundAt(o.ax, o.az), gb = p.groundAt(o.bx, o.bz), r = (o.rad || 0.2) + 0.08;
      const hit = near.segment(o.ax, ga + r, o.az, o.bx, gb + r, o.bz, r + 0.06);
      if (hit) list.push({ dist: hit.t, miss: hit.miss, target: { kind: 'downLog', ref: `downLog:${dl.k}`, label: dl.label, hint: dl.hint, e: dl.e, q: dl.q } });
    }
    return list;
  }

  // --- the woodpiles (fb2 A) --------------------------------------------------------------------------------------------
  // A woodpile is wood set down on the ground from the book (its Ground area: inventory.drop makes a 'pile' there), by
  // the ring or anywhere; a pile with only wood in it is drawn as a stacked woodpile (a layer for every few pieces), not
  // as the bag a pile of things is (containers.js). The old stack by the ring (s.piles, camp 2) becomes such a pile at
  // its spot once that site's ground is in.
  woodOnly(c) { return c.item === 'pile' && c.where === 'ground' && c.at && c.grid.length > 0 && c.grid.every((e) => !e.box && isWood(e.id)) && c.grid.some((e) => e.id !== 'pole'); } // (fb5 A: poles are fuel too, but a pile of poles alone lies as poles)
  pieceCount(c) { return c.grid.reduce((s, e) => s + e.qty, 0); }
  migratePiles() {
    const inv = this.inv;
    if (!inv || !inv.attached || !this.s.piles) return;
    for (const key of Object.keys(this.s.piles)) {
      const site = this.camp.registry.site(key);
      if (!site || !site.layout || !this.world.isReady(site.layout.fire.x, site.layout.fire.z)) continue;
      const s = this.pileSpot(site), pile = inv.addContainer('pile', 'ground', { x: s.x, z: s.z, y: s.y, heading: -s.a, camp: key }, { quiet: true });
      for (const [id, n] of Object.entries(this.s.piles[key])) for (let i = 0; i < n; i++) if (!inv.put(pile, id, { quiet: true })) break;
      delete this.s.piles[key];
      inv.emit('ground'); this.persist();
    }
  }
  // where a site's old stack went: a step and a half from the ring on its back side (away from the water), clear of the
  // bench, the pad and any trunk, on ground that is near level; { x, z, a, y } (a: the first layer's bearing)
  pileSpot(site) {
    if (site.pileSpot) return site.pileSpot;
    const L = site.layout, f = L.fire, t = this.camp.tiles, back = f.a || 0;
    let best = null;
    for (let k = 0; k < 16; k++) {
      const a = back + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.39, x = f.x + Math.cos(a) * 1.85, z = f.z + Math.sin(a) * 1.85;
      if (this.world.shoreAt(x, z) < 1.2) continue;
      if (Math.hypot(L.bench.x - x, L.bench.z - z) < 1.6 || Math.hypot(L.pad.x - x, L.pad.z - z) < 2.6) continue;
      if (t.treesNear(x, z, 0.7).some((o) => !(o.x === f.x && o.z === f.z))) continue;
      let lo = Infinity, hi = -Infinity;
      for (const [u, v] of [[-0.35, -0.35], [0.35, -0.35], [0.35, 0.35], [-0.35, 0.35]]) { const h = t.groundAt(x + u, z + v); lo = Math.min(lo, h); hi = Math.max(hi, h); }
      const score = hi - lo + Math.ceil(k / 2) * 0.03;
      if (!best || score < best.score) best = { x, z, a: a + Math.PI / 2, score, y: lo };
    }
    if (!best) best = { x: f.x + Math.cos(back) * 1.85, z: f.z + Math.sin(back) * 1.85, a: back + Math.PI / 2, y: t.groundAt(f.x, f.z) };
    site.pileSpot = best;
    return best;
  }
  // the woodpiles near you drawn (after the containers are posed: their bag hidden), the rest parked
  drawPiles() {
    const inv = this.inv, p = this.player, view = typeof window !== 'undefined' && window.__game ? window.__game.invView : null;
    const want = [];
    if (inv && inv.attached) for (const c of inv.containers) if (this.woodOnly(c) && Math.abs(c.at.x - p.x) < 150 && Math.abs(c.at.z - p.z) < 150) want.push(c);
    want.sort((a, b) => Math.hypot(a.at.x - p.x, a.at.z - p.z) - Math.hypot(b.at.x - p.x, b.at.z - p.z));
    const pool = this.pileMeshes || (this.pileMeshes = []);
    want.length = Math.min(want.length, 6);
    want.forEach((c, i) => {
      let m = pool[i];
      if (!m) {
        const group = new THREE.Group();
        group.name = 'woodpile';
        const layers = (this.pileGeos || (this.pileGeos = woodpileGeometry())).map((g) => { const k = new THREE.Mesh(g, this.mat); k.castShadow = true; k.receiveShadow = true; k.matrixAutoUpdate = false; group.add(k); return k; });
        group.matrixAutoUpdate = false;
        this.camp.scene.add(group);
        m = pool[i] = { group, layers };
      }
      const n = Math.min(3, Math.ceil(this.pieceCount(c) / 4)), y = Number.isFinite(c.at.y) ? c.at.y : this.camp.tiles.groundAt(c.at.x, c.at.z);
      const sig = `${c.id}|${n}|${c.at.x.toFixed(2)},${c.at.z.toFixed(2)},${y.toFixed(2)}`;
      if (m.sig !== sig) {
        m.sig = sig; m.ref = c.id;
        m.group.position.set(c.at.x, Math.min(this.camp.tiles.groundAt(c.at.x, c.at.z), y + 0.06) - 0.015, c.at.z); m.group.rotation.set(0, (c.at.heading || 0) + Math.PI / 2, 0);
        m.group.updateMatrix(); m.group.updateMatrixWorld(true);
        m.layers.forEach((l, k) => { l.visible = k < n; });
      }
      m.group.visible = true;
      const bag = view && view.objs && view.objs.get(c.id);
      if (bag) bag.visible = false;
    });
    for (let i = want.length; i < pool.length; i++) { pool[i].group.visible = false; pool[i].ref = null; }
  }
  // the woodpile drawn for pile `cId` (the pointer's rim), or null
  pileMesh(cId) { const m = (this.pileMeshes || []).find((q) => q.ref === cId && q.group.visible); return m || null; }

  // --- the figure (main.js camp 2) --------------------------------------------------------------------------------------
  move() { return this.cook.move(); }
  beforePose() { this.cook.beforePose(); }
  // after the pose: the armloads in the hands (and set down on the ground), the spoon and the pot
  afterPose() {
    this.cook.afterPose();
    this.drawPiles(); // fb2 A: the woodpiles set down from the book (their bag hidden)
    const inv = this.inv, p = this.player, cn = p.canoe, seen = new Set(), S = this.cook.seat, sat = !!(S && S.phase !== 'walk');
    if (inv && inv.attached && cn && cn.figure) {
      for (const c of inv.containers) {
        if (c.item !== 'woodarms' || !c.grid.length || !(c.where === 'hands' || (c.where === 'ground' && c.at))) continue;
        seen.add(c.id);
        const b = this.bundleFor(c), m = b.mesh;
        if (c.where === 'hands') {
          if (p.mode === 'carry') { m.visible = false; continue; }
          if (sat) { // set down beside the bench, or the box, while you sit
            const fx = Math.cos(S.heading), fz = -Math.sin(S.heading), side = c.hand === 1 ? -1 : 1, x = S.seat.x - fz * side * 0.75, z = S.seat.z + fx * side * 0.75;
            m.position.set(x, p.groundAt(x, z) + 0.06, z); m.rotation.set(0, S.heading + 0.3, 0); m.visible = true;
            continue;
          }
          // carried at the hip under the arm, along the way you face, the far end a little down
          const hand = cn.figure.bones[c.hand === 1 ? 'handL' : 'handR'], v = _v1;
          hand.getWorldPosition(v);
          const fx = Math.cos(p.heading), fz = -Math.sin(p.heading), side = c.hand === 1 ? -1 : 1;
          m.position.set(v.x + fx * 0.08 - fz * side * 0.06, v.y + 0.07, v.z + fz * 0.08 + fx * side * 0.06);
          m.rotation.set(0, p.heading + side * 0.12, -0.16);
        } else { m.position.set(c.at.x, (Number.isFinite(c.at.y) ? c.at.y : p.groundAt(c.at.x, c.at.z)) - 0.01, c.at.z); m.rotation.set(0, c.at.heading || 0, 0); }
        m.visible = true;
      }
    }
    for (const [k, b] of this.bundles) if (!seen.has(k)) { b.mesh.visible = false; if (!inv.cont(k)) { this.camp.scene.remove(b.mesh); b.mesh.geometry.dispose(); this.bundles.delete(k); } }
  }
  // an armload's look: its pieces side by side along the arm, the logs under the branches (rebuilt when it changes)
  bundleFor(c) {
    let b = this.bundles.get(c.id);
    const ids = c.grid.flatMap((e) => Array(e.qty).fill(e.id)).sort(), sig = ids.join(',');
    if (b && b.sig === sig) return b;
    const list = [];
    let logs = 0, brs = 0;
    for (const id of ids) {
      // (content D: a dead pole is carried as the pole it is, under the arm at its middle, not as a short branch)
      const log = id === 'wood:log', pole = id === 'pole', i = log ? logs++ : brs++, v = (i + (log ? 1 : 2)) % 3;
      const z = log ? (i - 0.5) * 0.13 : (i - 1) * 0.06, y = log ? 0 : 0.11 + (i % 2) * 0.03;
      list.push({ g: this.pieceIdx[`${pole ? 'pole' : log ? 'log' : 'branch'}${v}`], pos: new THREE.Vector3(log ? 0 : 0.05, y - 0.08, z), q: new THREE.Quaternion().setFromEuler(new THREE.Euler(0, (i % 2 ? 0.08 : -0.06), 0)), s: log || pole ? _one : new THREE.Vector3(0.6, 1, 1) });
    }
    const geo = mergePieces(list, this.pieceGeos);
    if (!b) { const mesh = new THREE.Mesh(geo, this.mat); mesh.castShadow = true; mesh.name = 'armload'; this.camp.scene.add(mesh); b = { mesh, sig }; this.bundles.set(c.id, b); }
    else { b.mesh.geometry.dispose(); b.mesh.geometry = geo; b.sig = sig; }
    return b;
  }

  // --- leaving, and a trip's end ----------------------------------------------------------------------------------------
  // what is still burning ashore near you, for the leaving note (camp.js): phrases
  ashore() {
    const F = this.fires, p = this.player, out = [];
    let burning = false, coals = false;
    for (const key of this.lit) {
      const f = F.get(key); if (!f || Math.hypot(f.at.x - p.x, f.at.z - p.z) > 400) continue;
      const st = F.state(key);
      if (st === 'burning') burning = true; else if (st === 'coals') coals = true;
    }
    if (burning) out.push('the fire is still burning'); else if (coals) out.push('the coals are still smouldering');
    return [...out, ...this.cook.ashore(), ...this.tarp.ashore(p.x, p.z)];
  }
  // a trip ended (at a counter, or an evacuation): the fires you lit go out and the pot comes home with the rest
  tripEnded() {
    const F = this.fires, inv = this.inv;
    for (const key of this.lit) if (F.get(key)) F.douse(key);
    this.lit.clear();
    this.tarp.tripEnded(); // fb4 E: the tarp goes to the outfitters with the tent
    this.cook.pot = null;
    if (inv && inv.attached) {
      for (let i = inv.containers.length - 1; i >= 0; i--) {
        const c = inv.containers[i];
        if (c.item !== 'grate') continue;
        for (const e of c.grid) if (e.id === 'pot' && inv.crate) inv.put(inv.crate, 'pot', { quiet: true });
        inv.containers.splice(i, 1);
      }
      inv.emit('containers');
    }
    this.persist();
  }

  offered() {}
  // the old hooks (camp.js before camp 2): the prompts are this module's own now
  spotPrompts() { return false; }
  gatherPrompt() { return false; }

  // --- the notices ----------------------------------------------------------------------------------------------------
  // the pints the berries notices taken on still want, from any board
  pintsWanted() { return this.notices('berries').reduce((s, t) => s + Math.max(0, (t.need || 1) - (t.got || 0)), 0); }
  berryNotice() { return this.notices('berries')[0] || null; }
  notices(kind) { const T = this.tasks; return T ? T.active.filter((t) => t.kind === kind && t.status === 'open') : []; }
  // the wood you carry, a piece at a time (the armloads and what is on you), for a notice's armfuls
  carriedWood() {
    const inv = this.inv, out = [];
    if (!inv || !inv.attached) return out;
    for (const c of inv.containers) if (['hands', 'back', 'chest', 'pockets'].includes(inv.rootWhere(c))) for (const e of c.grid) if (!e.box && isWood(e.id)) for (let i = 0; i < e.qty; i++) out.push({ id: e.id, c, e });
    return out;
  }

  // --- saving ---------------------------------------------------------------------------------------------------------
  serialize() {
    const F = this.fires, fires = [];
    for (const key of this.lit) { const r = F && F.record(key); if (r) fires.push(r); }
    const today = this.today;
    for (const k of Object.keys(this.s.taken)) if (today - this.s.taken[k] >= WOOD.regrow) delete this.s.taken[k];
    for (const k of Object.keys(this.s.sawn)) if (today - this.s.sawn[k].day >= WOOD.regrow) delete this.s.sawn[k];
    return {
      v: 2, piles: this.s.piles, pints: this.s.pints, latrine: this.s.latrine, taken: this.s.taken, sawn: this.s.sawn,
      dropped: this.dropped.map((d) => ({ key: d.key, kind: d.kind, v: d.v, yaw: +d.yaw.toFixed(3), x: +d.x.toFixed(2), z: +d.z.toFixed(2) })),
      fires, cook: this.cook.serialize(), tarps: this.tarp.serialize(),
    };
  }
  persist() {
    const c = this.camp, st = c.state;
    if (st) { st.chores = this.serialize(); if (c.outfitter && c.outfitter.save) c.outfitter.save(); }
    else save.write('chores', this.serialize());
  }
  restore() {
    const st = this.camp.state, d = st ? st.chores : save.read('chores'), F = this.fires;
    for (const key of this.lit) if (F && F.get(key)) F.douse(key); // another trip's fires
    this.lit.clear(); this.ringSeen.clear();
    this.s = blank(); this._dropped = []; this.dirty = true;
    this.tarp.restore(d && d.v === 2 ? d.tarps || [] : []); // fb4 E: the rigs pitched on this trip (another trip's come down)
    if (d && d.v === 1) { // hubs 3A's armfuls: a stack by a ring becomes two branches and a log an armful
      this.s.pints = Math.max(0, d.pints | 0); this.s.latrine = d.latrine ?? null;
      if (d.pile && d.pile.key && d.pile.n > 0) this.s.piles[d.pile.key] = { 'wood:branch': 2 * Math.min(3, d.pile.n | 0), 'wood:log': Math.min(3, d.pile.n | 0) };
    } else if (d && d.v === 2) {
      this.s.pints = Math.max(0, d.pints | 0); this.s.latrine = d.latrine ?? null;
      if (d.piles && typeof d.piles === 'object') for (const [k, p] of Object.entries(d.piles)) { const q = {}; for (const [id, n] of Object.entries(p || {})) if (isWood(id) && n > 0) q[id] = Math.min(WOOD.pile, n | 0); if (Object.keys(q).length) this.s.piles[k] = q; }
      if (d.taken && typeof d.taken === 'object') this.s.taken = { ...d.taken };
      if (d.sawn && typeof d.sawn === 'object') this.s.sawn = { ...d.sawn };
      this.pendingDrops = Array.isArray(d.dropped) ? d.dropped.slice(0, 40) : [];
      for (const r of Array.isArray(d.fires) ? d.fires : []) { if (!F || !r || !r.key) continue; if (!r.laid && this.now >= r.until + FIRE.smoulder) continue; if (F.restoreRecord(r)) this.lit.add(r.key); }
      this.cook.restore(d.cook || null);
    }
  }
  // the saw's lengths come back once their ground is in
  restoreDrops() {
    const q = this.pendingDrops;
    if (!q || !q.length) return;
    this.pendingDrops = [];
    for (const d of q) {
      if (!this.world.isReady(d.x, d.z)) { this.pendingDrops.push(d); continue; }
      const kind = d.kind === 'log' ? 'log' : d.kind === 'pole' ? 'pole' : 'branch', yaw = Number.isFinite(d.yaw) ? d.yaw : null;
      const pc = this.pieceAt(d.key, kind, d.x, d.z, yaw == null ? mulberry32(strHash(d.key)) : seqRng([Number.isFinite(d.v) ? (d.v + 0.5) / 3 : 0.5, yaw / (Math.PI * 2)]), null, true);
      if (pc) { this.dropped.push(pc); this.dirty = true; }
    }
  }
}
const blank = () => ({ piles: {}, pints: 0, latrine: null, taken: {}, sawn: {} });
const wetU = (u) => (u && u.e && u.e.data && u.e.data.wet > 0 ? 1 : 0); // fb5 A: a ring's piece is wet
// a "random" that gives these numbers in turn (a saved piece's variant and bearing, for pieceAt)
const seqRng = (xs) => { let i = 0; return () => xs[Math.min(xs.length - 1, i++)]; };
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const _v1 = new THREE.Vector3();
const lowerName = (c) => { const d = itemDef(c.item), n = (d && (d.short || d.name)) || 'pack'; return /^(Duluth|Johnson)/.test(n) ? n : n.charAt(0).toLowerCase() + n.slice(1).replace(/, \d+ L$/, ''); }; // (a name stays a name: "the Duluth pack #3")
// "an hour", "about 2 h", "half an hour"
function hoursWords(h) { if (h < 0.75) return 'half an hour'; if (h < 1.25) return 'an hour'; return `${Math.round(h * 2) / 2} h`.replace('.5 h', '½ h'); }
// the distance from (x, z) to a down log's stem (tiles.js: the capsule from (ax, az) to (bx, bz))
function capsule(x, z, o) {
  const dx = o.bx - o.ax, dz = o.bz - o.az, L2 = dx * dx + dz * dz || 1, u = Math.max(0, Math.min(1, ((x - o.ax) * dx + (z - o.az) * dz) / L2));
  return Math.hypot(x - (o.ax + dx * u), z - (o.az + dz * u));
}

// --- the notices -------------------------------------------------------------------------------------------------------
// Blueberries for the kitchen ($10 a pint) and an armful for the stove ($6 an armful of three pieces), each posted at an
// outfitter and handed over on foot at its store (tasks.update while taken on: the store's visit is that outfitter's),
// then claimed at its counter. The berries are posted only in their season.
const BERRY_WORDS = [
  { need: 3, title: 'Blueberries for pies', text: 'Three pints of wild blueberries for the pies. They come on in the burns and on the lichen rock above the campsites.', sign: 'Deb, in the café' },
  { need: 1, title: 'A pint of blueberries', text: 'One pint for the Sunday pancakes. The open rock by the campsites is where they grow.', sign: 'the cook' },
  { need: 2, title: 'Blueberries for jam', text: 'Two pints for a batch of jam. Pick them where the old fire went through.', sign: 'Lorraine, cabin 4' },
];
const WOOD_WORDS = [
  { need: 1, title: 'Wood for the sauna', text: 'The sauna stove is hungry. An armful of dead and down from any campsite, three good pieces, left by the door.', sign: 'the lodge' },
  { need: 2, title: 'Firewood wanted', text: 'Two armfuls for the bunkhouse stove. Dead and down only, please: no live trees.', sign: 'the bunkhouse' },
  { need: 1, title: 'Wood for the smoker', text: 'An armful of dry wood for the smokehouse. Birch burns sweetest.', sign: 'the smokehouse out back' },
];
// at the posting outfitter's store, on foot: what you have goes over, up to what the notice wants
function handOver(T, t, have, take, words) {
  const o = T.outfitter, v = o && o.visit;
  if (!current || !v || v.ep !== t.from || T.player.teleporting) return;
  const want = (t.need || 1) - (t.got || 0), n = Math.min(want, have);
  if (n <= 0) return;
  take(n); t.got = (t.got || 0) + n;
  const done = t.got >= (t.need || 1);
  if (done) t.status = 'done';
  T.note(words(n, done, (t.need || 1) - t.got));
  current.persist(); T.changed(); T.boardChanged();
}
registerKind('berries', {
  label: 'For the kitchen', weight: { local: 0.9, medium: 0.45, far: 0 },
  make(T, c) {
    const d = T.day || (typeof window !== 'undefined' && window.__game ? window.__game.day : null);
    if (!d || !berrySeason(d.year, d.doy) || c.board.some((t) => t && t.kind === 'berries')) return null;
    const W = pickR(c.rng, BERRY_WORDS);
    return { need: W.need, got: 0, title: W.title, text: W.text, sign: W.sign };
  },
  pay(t) { return PAY.pint * (t.need || 1); },
  update(T, t) {
    handOver(T, t, current ? current.s.pints : 0, (n) => { current.s.pints -= n; }, (n, done, more) => `You hand over ${word(n)} ${plural(n, 'pint')} of blueberries. ${done ? 'Claim it at the counter.' : `${cap(word(more))} more wanted.`}`);
  },
  progress(t) { const n = t.need || 1, g = t.got || 0, tin = current ? Math.min(current.s.pints, n - g) : 0; return g ? `${word(g)} of ${word(n)} ${plural(n, 'pint')} handed over${tin ? `, ${word(tin)} in the tin` : ''}` : tin ? `${word(tin)} of ${word(n)} in the tin` : `${word(n)} ${plural(n, 'pint')} to pick, in season`; },
});
registerKind('firewood', {
  label: 'Wood for the stove', weight: { local: 0.8, medium: 0.25, far: 0 },
  make(T, c) {
    if (c.board.some((t) => t && t.kind === 'firewood')) return null;
    const W = pickR(c.rng, WOOD_WORDS);
    return { need: W.need, got: 0, title: W.title, text: W.text, sign: W.sign };
  },
  pay(t) { return PAY.armful * (t.need || 1); },
  update(T, t) {
    const wood = current ? current.carriedWood() : [];
    handOver(T, t, Math.floor(wood.length / ARMFUL), (n) => { for (const u of wood.slice(0, n * ARMFUL)) current.inv.take(u.c.id, u.e.uid, 1); current.inv.emit('items'); }, (n, done, more) => `You stack ${word(n)} ${plural(n, 'armful')} of wood by the door. ${done ? 'Claim it at the counter.' : `${cap(word(more))} more wanted.`}`);
  },
  progress(t) { const n = t.need || 1, g = t.got || 0; return g ? `${word(g)} of ${word(n)} handed over` : `${word(n)} ${plural(n, 'armful')} to bring in (three pieces an armful)`; },
});
