import * as THREE from 'three';
import { PropBuilder, propMaterial, TILE } from './prop-kit.js';
import { GROUND } from './terrain-build.js';
import { dayOfYear } from './astro.js';
import { word, plural } from './hud.js';
import { mulberry32, hash2 } from './rng.js';
import { save } from './save.js';
import { step as rustle } from './audio-voices.js';
import { ITEMS, defineItem } from './items.js';

// Berries and mushrooms (fb G, 2026-10-24). The owner: "its hard to find blueberries, also add in more of the classic
// berries you would see and where they would show up, same with mushrooms". This replaces the one blueberry patch a
// campsite had (chores.js, hubs 3A) with the Boundary Waters' classic forage, each in its own ground and season:
//
//   wild strawberries   June 10 - July 8     the meadows, the open rock, trail edges and campsites
//   juneberries         June 25 - July 25    shrubs on the rock and the shore, the sunny woods' edges
//   wild blueberries    July 10 - August 20  the burns, the lichen rock, the jack pine
//   raspberries         July 15 - August 25  the clearings and the burns, and all along the portage trails
//   pin cherries        August               small trees in the burns and the clearings
//   bunchberries        June - September     the forest floor; white flowers, then red berries: left for the grouse
//   chanterelles        July 10 - August     golden in the moss under the conifers
//   hedgehogs           August 10 - Sept     pale caps under the spruce and fir
//   lobster mushrooms   August               bright orange-red in the mixed woods
//   false chanterelles  August - September   (orange caps on a rotten log: not sure about these, you leave them)
//
// Where: the ground is cut into CELL-metre cells; each cell near you is read once (the tile's ground class and canopy
// shade, world.coverCell), and holds a patch or nothing by a hash of the cell, the odds raised near a campsite and along
// a portage trail (the edges are where the light gets in). A patch is drawn in its season only, seated on the ground and
// tilted to it, its fruit a little bigger than life so it reads from a few steps off.
// Findable: the colours are the fruit's own and strong; walking up within RUSTLE metres a patch rustles (the soft brush
// of leaves, audio-voices step) and a glint winks over it; the first ripe patch of a kind each day is named in a note.
// Picking: E within reach, on foot. It takes its time on the clock (the walker crouched, the clock passed over a second
// or so, like the camp's chores), and puts a pint, a handful or a bag into a container you can reach as an item (stream
// A's inventory: window.__game.inventory.place, the items defined here through defineItem). With no inventory, or no
// room, the berries are eaten as you pick (the food need, as the patch at the campsite did). A berries notice still
// wanting pints takes them into its tin first (chores.js). Each patch gives a few pints a day; a mushroom patch, picked,
// comes back in REGROW days. The day's picking is saved in the trip's document (trip.state.forage).
//
// What main.js asks of it: before() ahead of player.update (E for the patch whose prompt was showing, the input held
// while picking) and update(dt) after camp.update (the cells, the drawing, the prompt and the picking).

const CELL = 24;            // metres: one patch at most a cell
const NEAR = 96;            // metres: cells read out to this far
const DROP = 170;           // metres: cells forgotten past this
const PER_FRAME = 6;        // cells read a frame at most
const BASE = 0.12;          // odds a cell holds a patch, per unit of habitat weight
const RUSTLE = 7;           // metres: a ripe patch rustles and glints when you come within this
const NAME_AT = 14;         // metres: the first ripe patch of a kind each day is named from this far
const REGROW = 5;           // days for a picked mushroom patch to come back
const SITE_R = 70, TRAIL_R = 12;

const D = (m, d) => [m - 1, d]; // a date as [month 0-based, day]
const tone = (hex, rng, dl = 0.06, dh = 0.015) => new THREE.Color(hex).offsetHSL((rng() - 0.5) * dh, 0, (rng() - 0.5) * dl);
const pickR = (rng, list) => list[Math.floor(rng() * list.length)];
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const absDay = (year, doy) => Math.round(Date.UTC(year, 0, doy) / 86400000);
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

// --- what grows ---------------------------------------------------------------------------------------------------------
// ground: weight by the tile's ground class (the berries mostly in the open: the burns, the rock, the clearings, a little
// under the trees); weight: the whole kind's share; site, trail, shore: how much likelier within SITE_R of a campsite
// (their clearings), TRAIL_R of a portage trail (its edges), 15 m of the water (the open shore rock); reach: metres from the
// patch's centre at which E picks; tall: casts a shadow. pick: { unit, per (a patch a day), minutes, food (eaten as
// picked: the food need), item } (none for the decor and the lookalike). seen: the note for the first ripe patch of a
// kind each day.
export const FORAGE = {
  strawberries: {
    name: 'Wild strawberries', short: 'strawberries', kind: 'berry', from: D(6, 10), to: D(7, 8), look: 'strawberry',
    ground: { meadow: 1, burn: 0.6, rockLichen: 0.55, rock: 0.3, forestLight: 0.25, forest: 0.1, forestDark: 0.06 }, site: 3.5, trail: 3, shore: 1, reach: 1.9,
    pick: { unit: 'handful', per: 2, minutes: 15, food: 0.06, verb: 'Pick' },
    seen: 'Wild strawberries in the grass here, tiny and red.',
    got: 'A handful of wild strawberries, no bigger than a fingernail and sweeter than any you can buy.',
  },
  juneberries: {
    name: 'Juneberries', short: 'juneberries', kind: 'berry', from: D(6, 25), to: D(7, 25), look: 'juneberry', tall: true,
    ground: { forestLight: 0.8, rockLichen: 0.7, rock: 0.6, meadow: 0.5, burn: 0.5, forest: 0.2, forestDark: 0.12 }, site: 2.2, trail: 1.6, shore: 2.5, reach: 2.2,
    pick: { unit: 'pint', per: 2, minutes: 20, food: 0.13, verb: 'Pick' },
    seen: 'A juneberry bush, hung with dark ripe berries.',
    got: 'A pint of juneberries, purple and seedy-sweet, like a small blueberry that grew up into a bush.',
  },
  blueberries: {
    name: 'Wild blueberries', short: 'blueberries', kind: 'berry', from: D(7, 10), to: D(8, 20), look: 'blueberry',
    ground: { burn: 1.2, rockLichen: 1.2, rock: 0.9, forestLight: 0.7, meadow: 0.3, forest: 0.35, forestDark: 0.2 }, site: 4, trail: 2.2, shore: 2, reach: 2.3,
    pick: { unit: 'pint', per: 3, minutes: 20, food: 0.15, verb: 'Pick' },
    seen: 'Blueberries! The low bushes here are blue with them.',
    got: 'A pint of blueberries, warm from the sun. Most of them go in by the handful.',
  },
  raspberries: {
    name: 'Raspberries', short: 'raspberries', kind: 'berry', from: D(7, 15), to: D(8, 25), look: 'raspberry', tall: true,
    ground: { meadow: 1, burn: 1, forestLight: 0.4, rockLichen: 0.2, forest: 0.15, forestDark: 0.08 }, site: 2.5, trail: 4.5, shore: 1, reach: 2.2,
    pick: { unit: 'pint', per: 3, minutes: 20, food: 0.14, verb: 'Pick' },
    seen: 'Raspberry canes, red with ripe berries.',
    got: 'A pint of raspberries, and a few scratches on the wrists for them.',
  },
  pincherries: {
    name: 'Pin cherries', short: 'pin cherries', kind: 'berry', from: D(8, 1), to: D(8, 31), look: 'pincherry', tall: true,
    ground: { burn: 1, meadow: 0.7, forestLight: 0.5, forest: 0.15, forestDark: 0.08 }, site: 2, trail: 3, shore: 1, reach: 2.3,
    pick: { unit: 'handful', per: 2, minutes: 15, food: 0.05, verb: 'Pick' },
    seen: 'A pin cherry, its little clusters bright red.',
    got: 'A handful of pin cherries: sour, and mostly stone. Better as jelly, but they go down.',
  },
  bunchberries: {
    name: 'Bunchberries', short: 'bunchberries', kind: 'decor', from: D(6, 1), to: D(9, 30), look: 'bunchberry',
    ground: { forest: 1, forestDark: 0.8, forestLight: 0.5 }, site: 1, trail: 1.2, shore: 1, reach: 1.8, weight: 0.35,
    seen: null,
    say: 'Bunchberries · pretty, mealy and seedy: you leave them for the grouse',
  },
  chanterelles: {
    name: 'Chanterelles', short: 'chanterelles', kind: 'mushroom', from: D(7, 10), to: D(8, 31), look: 'chanterelle',
    ground: { forestDark: 1, forest: 0.8, forestLight: 0.3 }, site: 1.4, trail: 1.4, shore: 1, reach: 1.7, weight: 0.35,
    pick: { unit: 'bag', per: 1, minutes: 10, food: 0.1, verb: 'Gather' },
    seen: 'A flash of gold in the moss: chanterelles.',
    got: 'A bag of chanterelles, smelling faintly of apricots. They want a pan and a little butter.',
  },
  hedgehogs: {
    name: 'Hedgehog mushrooms', short: 'hedgehogs', kind: 'mushroom', from: D(8, 10), to: D(9, 30), look: 'hedgehog',
    ground: { forest: 1, forestDark: 0.8, forestLight: 0.4 }, site: 1.3, trail: 1.3, shore: 1, reach: 1.7, weight: 0.3,
    pick: { unit: 'bag', per: 1, minutes: 10, food: 0.1, verb: 'Gather' },
    seen: 'Hedgehog mushrooms, pale under the spruce.',
    got: 'A bag of hedgehogs: little teeth underneath where the gills should be, and nothing poisonous looks like them.',
  },
  lobsters: {
    name: 'Lobster mushrooms', short: 'lobster mushrooms', kind: 'mushroom', from: D(8, 1), to: D(8, 31), look: 'lobster',
    ground: { forest: 1, forestLight: 0.7, forestDark: 0.5 }, site: 1.3, trail: 1.3, shore: 1, reach: 1.7, weight: 0.25,
    pick: { unit: 'bag', per: 1, minutes: 10, food: 0.12, verb: 'Gather' },
    seen: 'Something bright orange-red on the forest floor: lobster mushrooms.',
    got: 'A bag of lobster mushrooms, hard and orange as a boiled claw. Firm enough to keep a day or two.',
  },
  falsechanterelles: {
    name: 'Orange mushrooms', short: 'orange mushrooms', kind: 'lookalike', from: D(8, 1), to: D(9, 30), look: 'falsechanterelle',
    ground: { forestDark: 1, forest: 0.7 }, site: 1, trail: 1, shore: 1, reach: 1.8, weight: 0.15,
    seen: 'Orange caps on a rotten log.',
    left: 'Orange caps on a rotten log, bright as chanterelles but with true gills and a soft stem. Not sure about these. You leave them.',
  },
};
export const FORAGE_IDS = Object.keys(FORAGE);
const dayOf = (year, md) => dayOfYear(year, md[0], md[1]);
export function inSeason(id, year, doy) { const s = FORAGE[id]; return !!s && doy >= dayOf(year, s.from) && doy <= dayOf(year, s.to); }

// The items, for stream A's inventory (items.js defineItem): a pint, a handful or a bag. Mushrooms want cooking; berries
// are eaten as they are. icon: a draw key, with draw(ctx, size) for whoever paints icons (stream B's invUI) wanting one.
const ITEM_LOOK = {
  strawberries: { fruit: ['#d42a30', '#e3403f'], leaf: '#5c8d3d', n: 9, r: 0.075 },
  juneberries: { fruit: ['#3d2a4c', '#4b2f58', '#8e3346'], leaf: '#5b7f3c', n: 11, r: 0.07 },
  blueberries: { fruit: ['#4c5f96', '#5a6ba2', '#404e82'], leaf: '#5e8139', n: 12, r: 0.07 },
  raspberries: { fruit: ['#c2263a', '#d23446'], leaf: '#5d8a3a', n: 10, r: 0.08 },
  pincherries: { fruit: ['#d12b2b', '#e0383a', '#b82024'], leaf: '#6a9a48', n: 10, r: 0.065 },
  chanterelles: { cap: '#e9a63b', under: '#f2c46a', n: 4 },
  hedgehogs: { cap: '#e3b886', under: '#f0dcc0', n: 3 },
  lobsters: { cap: '#e2532a', under: '#c63f1c', n: 3 },
};
function drawIcon(id, ctx, size) {
  const L = ITEM_LOOK[id], s = size, rng = mulberry32(id.length * 977 + 13);
  ctx.save(); ctx.clearRect(0, 0, s, s);
  // a birchbark cup or a small cloth bag under it
  ctx.fillStyle = FORAGE[id].kind === 'mushroom' ? '#d8cdb4' : '#e9e2cf';
  ctx.beginPath(); ctx.moveTo(s * 0.18, s * 0.5); ctx.lineTo(s * 0.82, s * 0.5); ctx.lineTo(s * 0.72, s * 0.9); ctx.lineTo(s * 0.28, s * 0.9); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = 'rgba(60,45,30,0.55)'; ctx.lineWidth = Math.max(1, s * 0.03); ctx.stroke();
  if (L.fruit) {
    if (L.leaf) { ctx.fillStyle = L.leaf; ctx.beginPath(); ctx.ellipse(s * 0.64, s * 0.36, s * 0.16, s * 0.07, -0.5, 0, Math.PI * 2); ctx.fill(); }
    for (let i = 0; i < L.n; i++) {
      const x = s * (0.3 + rng() * 0.4), y = s * (0.32 + rng() * 0.2), r = s * L.r * (0.85 + rng() * 0.3);
      ctx.fillStyle = pickR(rng, L.fruit); ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.beginPath(); ctx.arc(x - r * 0.35, y - r * 0.35, r * 0.3, 0, Math.PI * 2); ctx.fill();
    }
  } else {
    for (let i = 0; i < L.n; i++) {
      const x = s * (0.3 + (i / Math.max(1, L.n - 1)) * 0.4), y = s * (0.36 + rng() * 0.08), w = s * (0.13 + rng() * 0.05);
      ctx.fillStyle = L.under; ctx.fillRect(x - w * 0.18, y, w * 0.36, s * 0.16);
      ctx.fillStyle = L.cap; ctx.beginPath(); ctx.ellipse(x, y, w, w * 0.45, 0, Math.PI, 0); ctx.fill();
    }
  }
  ctx.restore();
}
export const FORAGE_ITEMS = FORAGE_IDS.filter((id) => FORAGE[id].pick).map((id) => {
  const s = FORAGE[id], p = s.pick, mush = s.kind === 'mushroom';
  return {
    id, name: `${s.name}, a ${p.unit}`, kind: 'forage', w: 1, h: 1, kg: p.unit === 'pint' ? 0.35 : p.unit === 'bag' ? 0.3 : 0.12, stack: 4, price: 0,
    eat: { food: p.food, cook: mush, lift: p.food * 0.5 }, icon: `forage:${id}`, draw: (ctx, size) => drawIcon(id, ctx, size),
    words: `${s.name}, picked on the trip. ${mush ? 'Cook them first: on the grate with supper.' : 'Eat them as they are, or keep them for the pancakes.'}`,
  };
});
// defined as the module loads, before the inventory restores a save: a pint kept in the barrel comes back with it
for (const def of FORAGE_ITEMS) if (!ITEMS[def.id]) defineItem(def);

// --- the looks --------------------------------------------------------------------------------------------------------
// Firewatch's graphic foliage: big simple faceted shapes coloured by the light. Each look is built once per variant in
// its own frame (y up from the ground at its centre) as one geometry: the plant, then the fruit in `groups` runs (a pick
// hides one: the patch's own view of the shared buffers draws fewer of them).
let ICO = null;
function icosahedron() {
  if (ICO) return ICO;
  const g = new THREE.IcosahedronGeometry(1, 0), pos = g.getAttribute('position'), verts = [], idx = [], seen = new Map();
  for (let i = 0; i < pos.count; i++) {
    const k = `${pos.getX(i).toFixed(3)},${pos.getY(i).toFixed(3)},${pos.getZ(i).toFixed(3)}`;
    let j = seen.get(k);
    if (j === undefined) { j = verts.length; seen.set(k, j); verts.push([pos.getX(i), pos.getY(i), pos.getZ(i)]); }
    idx.push(j);
  }
  g.dispose();
  return (ICO = { verts, idx });
}
// a faceted mound (leaves, moss, a mushroom's cap): an icosahedron squashed, jittered, flat-bottomed at `floor`
function mound(b, rng, cx, cy, cz, rx, ry, rz, cols, { floor = -0.35, jit = 0.3 } = {}) {
  const { verts, idx } = icosahedron();
  const P = verts.map(([x, y, z]) => { const j = 1 - jit / 2 + rng() * jit; return { x: cx + x * rx * j, y: cy + Math.max(floor, y) * ry * j, z: cz + z * rz * j }; });
  for (let i = 0; i < idx.length; i += 3) {
    const A = P[idx[i]], B = P[idx[i + 1]], C = P[idx[i + 2]], col = typeof cols === 'function' ? cols() : tone(pickR(rng, cols), rng, 0.08, 0.02);
    const ux = B.x - A.x, uy = B.y - A.y, uz = B.z - A.z, vx = C.x - A.x, vy = C.y - A.y, vz = C.z - A.z;
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz);
    if (l < 1e-12) continue;
    const n = { x: nx / l, y: ny / l, z: nz / l };
    for (const Q of [A, B, C]) b.vert(Q, n, Q.x * 3, Q.z * 3, TILE.PLAIN, col);
  }
}
// a berry: a little octahedron (its eight faces' normals worked out once)
const OCT = [];
for (const sx of [1, -1]) for (const sy of [1, -1]) for (const sz of [1, -1]) OCT.push({ sx, sy, sz, flip: sx * sy * sz < 0, n: new THREE.Vector3(sx, sy / 0.9, sz).normalize() });
function berry(b, p, r, col) {
  const h = r * 0.9;
  for (const o of OCT) {
    const X = { x: p.x + o.sx * r, y: p.y, z: p.z }, Y = { x: p.x, y: p.y + o.sy * h, z: p.z }, Z = { x: p.x, y: p.y, z: p.z + o.sz * r };
    for (const Q of o.flip ? [X, Z, Y] : [X, Y, Z]) b.vert(Q, o.n, 0.5, 0.5, TILE.PLAIN, col);
  }
}
// a flat leaf, both faces: a diamond from p along dir (unit, in the leaf's plane) len long, wid wide, its plane tilted
// up by `up` (the normal's lean)
function leaf(b, p, dir, len, wid, col, lift = 0.3) {
  const side = V(-dir.z, 0, dir.x).normalize(), n = V(0, 1, 0).addScaledVector(dir, -lift).normalize();
  const tip = p.clone().addScaledVector(dir, len).add(V(0, len * lift * 0.5, 0)), mid = p.clone().addScaledVector(dir, len * 0.45);
  const L = mid.clone().addScaledVector(side, wid / 2), R = mid.clone().addScaledVector(side, -wid / 2), dn = n.clone().negate();
  const under = col.clone().multiplyScalar(0.82);
  for (const [a, c, d] of [[p, L, tip], [p, tip, R]]) { b.vert(a, n, 0.5, 0.5, TILE.PLAIN, col); b.vert(c, n, 0.5, 0.5, TILE.PLAIN, col); b.vert(d, n, 0.5, 0.5, TILE.PLAIN, col); }
  for (const [a, c, d] of [[p, tip, L], [p, R, tip]]) { b.vert(a, dn, 0.5, 0.5, TILE.PLAIN, under); b.vert(c, dn, 0.5, 0.5, TILE.PLAIN, under); b.vert(d, dn, 0.5, 0.5, TILE.PLAIN, under); }
}
// a mushroom: a tapered stem and a cap (dome or funnel: the centre above or below the rim), its underside paler
function mushroom(b, rng, x, y, z, { h, r, stemR, capCol, underCol, stemCol, funnel = false, tilt = 0.15 }) {
  const lean = V((rng() - 0.5) * tilt, 1, (rng() - 0.5) * tilt).normalize();
  const top = V(x, y, z).addScaledVector(lean, h);
  b.cyl(V(x, y - 0.01, z), top, stemR * 1.15, stemR * (funnel ? 1.5 : 1), 5, TILE.PLAIN, stemCol);
  const n = 8, rim = [], wav = funnel ? 0.012 : 0.004, c = top.clone().add(V(0, funnel ? -0.25 * r : 0.42 * r, 0));
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2 + rng() * 0.25, rr = r * (0.88 + rng() * 0.24);
    rim.push(V(top.x + Math.cos(a) * rr, top.y + (funnel ? 0.1 * r : 0) + (rng() - 0.5) * wav * (r / 0.04), top.z + Math.sin(a) * rr));
  }
  const col = tone(capCol, rng, 0.06, 0.012), under = tone(underCol, rng, 0.05, 0.01), bot = top.clone().add(V(0, -0.12 * r, 0));
  for (let k = 0; k < n; k++) {
    const A = rim[k], B = rim[(k + 1) % n];
    const nt = B.clone().sub(c).cross(A.clone().sub(c)).normalize(); if (nt.y < 0) nt.negate();
    b.vert(c, nt, 0.5, 0.5, TILE.PLAIN, col); b.vert(B, nt, 0.5, 0.5, TILE.PLAIN, col); b.vert(A, nt, 0.5, 0.5, TILE.PLAIN, col);
    const nb = V(0, -1, 0);
    b.vert(bot, nb, 0.5, 0.5, TILE.PLAIN, under); b.vert(A, nb, 0.5, 0.5, TILE.PLAIN, under); b.vert(B, nb, 0.5, 0.5, TILE.PLAIN, under);
  }
}
const GREENS = {
  blue: [0x5e8139, 0x6e9042, 0x527235, 0x7f9b4a, 0x63863f],
  rasp: [0x4f7a34, 0x5d8a3a, 0x6b9443, 0x587f37],
  june: [0x5b7f3c, 0x678c45, 0x4d6f33, 0x6f9148],
  cherry: [0x6a9a48, 0x76a352, 0x5e8c40, 0x82aa5a],
  straw: [0x4f7f35, 0x5c8d3d, 0x6a9a45],
  bunch: [0x3f7034, 0x4a7d3a, 0x56893f],
  moss: [0x4d6b30, 0x5a7a36, 0x46622c],
};
// each look: (rng, stage) => { plant: PropBuilder, fruit: [PropBuilder, ...] }
const LOOKS = {
  blueberry(rng) {
    const lv = new PropBuilder(), fr = [new PropBuilder(), new PropBuilder(), new PropBuilder()], blues = [0x4c5f96, 0x5a6ba2, 0x404e82, 0x5f6a9a];
    const bushes = 20 + Math.floor(rng() * 6);
    let nb = 0;
    for (let i = 0; i < bushes; i++) {
      const a = rng() * 6.28, d = Math.sqrt(rng()), bx = Math.cos(a) * d * 1.35, bz = Math.sin(a) * d * 1.0;
      const s = (1.1 + rng() * 0.6) * (1.15 - 0.3 * d), clumps = 4 + Math.floor(rng() * 3);
      for (let m = 0; m < clumps; m++) {
        const t = rng() * 6.28, o = m ? (0.06 + rng() * 0.13) * s : 0, mx = bx + Math.cos(t) * o, mz = bz + Math.sin(t) * o;
        const rx = (0.08 + rng() * 0.05) * s, ry = (0.07 + rng() * 0.04) * s, my = ry * 0.45 + Math.max(0, (0.22 - o) * 0.75 * s) + rng() * 0.04;
        mound(lv, rng, mx, my, mz, rx, ry, rx * (0.8 + rng() * 0.35), rng() < 0.03 ? [0x7d6a3c] : GREENS.blue);
        // a cluster of berries proud on the clump's shoulder, drawn bigger than life (a real one is a centimetre across)
        const ct = rng() * 6.28, u = 0.2 + rng() * 0.5, col = tone(pickR(rng, blues), rng, 0.08, 0.012);
        const cx = mx + Math.cos(ct) * rx * u * 1.12, cz = mz + Math.sin(ct) * rx * u * 1.12, cy = my + ry * Math.sqrt(Math.max(0, 1 - u * u)) * 1.1;
        const many = 3 + Math.floor(rng() * 3);
        for (let q = 0; q < many; q++) {
          const a2 = (q / many) * 6.28 + rng() * 0.6, d2 = q ? 0.022 + rng() * 0.014 : 0, r = 0.02 + rng() * 0.007;
          berry(fr[nb % 3], V(cx + Math.cos(a2) * d2, cy + r * 0.6 + (q ? -rng() * 0.012 : 0.008), cz + Math.sin(a2) * d2), r, q % 3 === 2 ? col.clone().offsetHSL(0, 0, 0.06) : col);
        }
        nb++;
      }
    }
    return { plant: lv, fruit: fr };
  },
  raspberry(rng) {
    const pl = new PropBuilder(), fr = [new PropBuilder(), new PropBuilder(), new PropBuilder()], reds = [0xc2263a, 0xd23446, 0xb81f33, 0xd83a4c];
    const canes = 15 + Math.floor(rng() * 6), caneCol = new THREE.Color(0x7a4a34);
    let nf = 0;
    for (let i = 0; i < canes; i++) {
      const a = rng() * 6.28, d = Math.sqrt(rng()) * 0.95, x0 = Math.cos(a) * d, z0 = Math.sin(a) * d * 0.8, out = a + (rng() - 0.5) * 0.9;
      const hgt = 0.6 + rng() * 0.5, reach = 0.3 + rng() * 0.35, ox = Math.cos(out), oz = Math.sin(out);
      const pts = [V(x0, 0, z0), V(x0 + ox * reach * 0.25, hgt * 0.72, z0 + oz * reach * 0.25), V(x0 + ox * reach * 0.7, hgt, z0 + oz * reach * 0.7), V(x0 + ox * reach, hgt * 0.8, z0 + oz * reach)];
      pl.tube(pts, 0.012, 4, TILE.PLAIN, caneCol.clone().offsetHSL(0, 0, (rng() - 0.5) * 0.06));
      // the compound leaves along the cane: broad flat-topped mounds, a thicket from a few steps off
      for (const t of [0.15, 0.32, 0.5, 0.68, 0.86, 0.98]) {
        const k = Math.min(2, Math.floor(t * 3)), A = pts[k], B = pts[k + 1], f = t * 3 - k, p = A.clone().lerp(B, f);
        const sz = 0.13 + rng() * 0.06 + (t < 0.4 ? 0.04 : 0);
        mound(pl, rng, p.x + (rng() - 0.5) * 0.18, p.y + 0.02, p.z + (rng() - 0.5) * 0.18, sz, 0.06, sz * (0.8 + rng() * 0.3), GREENS.rasp, { floor: -0.6 });
      }
      // berries: at the tip and under the leaves, three to five a cluster
      for (const t of [1, 0.75, 0.5]) {
        if (t < 0.6 && rng() < 0.5) continue;
        const k = Math.min(2, Math.floor(t * 3 - 1e-6)), A = pts[k], B = pts[k + 1], f = t * 3 - k, p = A.clone().lerp(B, f);
        const many = 3 + Math.floor(rng() * 3), col = tone(pickR(rng, reds), rng, 0.08, 0.01), side = rng() * 6.28;
        const cx = p.x + Math.cos(side) * 0.1, cz = p.z + Math.sin(side) * 0.1;
        for (let q = 0; q < many; q++) berry(fr[nf % 3], V(cx + (rng() - 0.5) * 0.09, p.y - 0.02 - rng() * 0.06, cz + (rng() - 0.5) * 0.09), 0.023 + rng() * 0.005, col);
        nf++;
      }
    }
    return { plant: pl, fruit: fr };
  },
  juneberry(rng) {
    const pl = new PropBuilder(), fr = [new PropBuilder(), new PropBuilder()], purples = [0x56376f, 0x4a2f66, 0x643f82, 0x3f2a5a], red = 0xa8405a;
    const stems = 4 + Math.floor(rng() * 3), bark = new THREE.Color(0x857b70), tops = [];
    for (let i = 0; i < stems; i++) {
      const a = rng() * 6.28, lean = 0.25 + rng() * 0.3, h = 1.4 + rng() * 0.8;
      const top = V(Math.cos(a) * lean * h * 0.55, h, Math.sin(a) * lean * h * 0.55);
      pl.tube([V(Math.cos(a) * 0.06, 0, Math.sin(a) * 0.06), V(top.x * 0.4, h * 0.45, top.z * 0.4), top], (u) => 0.032 * (1 - 0.6 * u), 5, TILE.BARK, bark.clone().offsetHSL(0, 0, (rng() - 0.5) * 0.05));
      tops.push(top);
    }
    let nf = 0;
    const blobs = 15 + Math.floor(rng() * 5);
    for (let i = 0; i < blobs; i++) {
      const t = pickR(rng, tops), u = 0.4 + rng() * 0.65, a = rng() * 6.28, d = 0.12 + rng() * 0.38, y = t.y * u;
      const cx = t.x * u + Math.cos(a) * d, cz = t.z * u + Math.sin(a) * d, rx = 0.2 + rng() * 0.1, ry = 0.14 + rng() * 0.05;
      mound(pl, rng, cx, y, cz, rx, ry, rx * (0.8 + rng() * 0.3), GREENS.june);
      // a drooping cluster on the mound's outer side, where it shows
      if (rng() < 0.85) {
        const ca = Math.atan2(cz, cx) + (rng() - 0.5) * 1.2, many = 6 + Math.floor(rng() * 5), ripe = rng() < 0.8;
        const px = cx + Math.cos(ca) * rx * 0.95, pz = cz + Math.sin(ca) * rx * 0.95, py = y - ry * 0.15;
        for (let q = 0; q < many; q++) berry(fr[nf % 2], V(px + (rng() - 0.5) * 0.1, py - rng() * 0.1, pz + (rng() - 0.5) * 0.1), 0.023 + rng() * 0.006, tone(ripe || q % 2 ? pickR(rng, purples) : red, rng, 0.06, 0.01));
        nf++;
      }
    }
    return { plant: pl, fruit: fr };
  },
  pincherry(rng) {
    const pl = new PropBuilder(), fr = [new PropBuilder(), new PropBuilder()], reds = [0xd12b2b, 0xe0383a, 0xb82024];
    const bark = new THREE.Color(0x6e3b2f), h = 2.4 + rng() * 0.8, lean = V((rng() - 0.5) * 0.3, 1, (rng() - 0.5) * 0.3).normalize();
    const top = lean.clone().multiplyScalar(h);
    pl.tube([V(0, 0, 0), lean.clone().multiplyScalar(h * 0.5), top], (u) => 0.05 * (1 - 0.6 * u), 6, TILE.BARK, bark);
    const branches = [];
    for (let i = 0; i < 4 + Math.floor(rng() * 2); i++) {
      const s = 0.45 + rng() * 0.45, a = rng() * 6.28, base = lean.clone().multiplyScalar(h * s), len = 0.5 + rng() * 0.4;
      const end = base.clone().add(V(Math.cos(a) * len, 0.25 + rng() * 0.3, Math.sin(a) * len));
      pl.tube([base, end], 0.016, 4, TILE.BARK, bark);
      branches.push(end);
    }
    branches.push(top);
    let nf = 0;
    for (const e of branches) {
      for (let m = 0; m < 3; m++) {
        const rx = 0.22 + rng() * 0.1, ry = 0.16 + rng() * 0.05, cx = e.x + (rng() - 0.5) * 0.45, cy = e.y + (rng() - 0.4) * 0.35, cz = e.z + (rng() - 0.5) * 0.45;
        mound(pl, rng, cx, cy, cz, rx, ry, rx, GREENS.cherry);
        // an umbrella cluster on long stems, hanging out under the leaves' edge where it shows
        const ca = Math.atan2(cz, cx) + (rng() - 0.5) * 1.4, many = 5 + Math.floor(rng() * 4), px = cx + Math.cos(ca) * rx * 0.95, pz = cz + Math.sin(ca) * rx * 0.95, py = cy - ry * 0.45;
        const col = tone(pickR(rng, reds), rng, 0.06, 0.01);
        for (let q = 0; q < many; q++) { const a2 = (q / many) * 6.28; berry(fr[nf % 2], V(px + Math.cos(a2) * 0.05, py - 0.05 - rng() * 0.04, pz + Math.sin(a2) * 0.05), 0.024 + rng() * 0.004, col); }
        nf++;
      }
    }
    return { plant: pl, fruit: fr };
  },
  strawberry(rng) {
    const pl = new PropBuilder(), fr = [new PropBuilder(), new PropBuilder()], reds = [0xd12a2f, 0xe03a3a, 0xc8242a];
    const n = 55 + Math.floor(rng() * 20);
    let nf = 0;
    for (let i = 0; i < n; i++) {
      const a = rng() * 6.28, d = Math.sqrt(rng()) * 0.95, x = Math.cos(a) * d, z = Math.sin(a) * d * 0.8, y = 0.06 + rng() * 0.07;
      const col = tone(pickR(rng, GREENS.straw), rng, 0.08, 0.02), r0 = rng() * 6.28;
      for (let k = 0; k < 3; k++) { const t = r0 + (k / 3) * 6.28; leaf(pl, V(x, y, z), V(Math.cos(t), 0, Math.sin(t)), 0.075, 0.055, col, 0.2); }
      if (rng() < 0.55) { // a berry or two hanging out past the leaves on its own stalk
        for (let q = 0, m = 1 + (rng() < 0.4 ? 1 : 0); q < m; q++) {
          const ba = rng() * 6.28, p = V(x + Math.cos(ba) * 0.085, 0.035 + rng() * 0.03, z + Math.sin(ba) * 0.085);
          berry(fr[nf % 2], p, 0.017 + rng() * 0.005, tone(pickR(rng, reds), rng, 0.06, 0.01)); nf++;
        }
      } else if (rng() < 0.3) { // a white flower, five petals round a yellow eye
        const p = V(x + 0.04, y + 0.025, z), w = new THREE.Color(0xf4f1e6), yl = new THREE.Color(0xe8c64a);
        for (let k = 0; k < 5; k++) { const t = (k / 5) * 6.28; leaf(pl, p, V(Math.cos(t), 0, Math.sin(t)), 0.018, 0.016, w, 0); }
        berry(pl, p.clone().add(V(0, 0.003, 0)), 0.005, yl);
      }
    }
    return { plant: pl, fruit: fr };
  },
  bunchberry(rng, stage) {
    const pl = new PropBuilder(), whorls = 38 + Math.floor(rng() * 18), white = new THREE.Color(0xf2efe4), reds = [0xd0262a, 0xe1373a];
    for (let i = 0; i < whorls; i++) {
      const a = rng() * 6.28, d = Math.sqrt(rng()) * 1.1, x = Math.cos(a) * d, z = Math.sin(a) * d * 0.85, y = 0.09 + rng() * 0.06;
      const col = tone(pickR(rng, GREENS.bunch), rng, 0.08, 0.02), r0 = rng() * 6.28;
      for (let k = 0; k < 6; k++) { const t = r0 + (k / 6) * 6.28; leaf(pl, V(x, y, z), V(Math.cos(t), 0, Math.sin(t)), 0.07, 0.042, col, 0.12); }
      if (rng() < 0.55) {
        const p = V(x, y + 0.025, z);
        if (stage === 'berry') { const col2 = tone(pickR(rng, reds), rng, 0.06, 0.01); for (let q = 0; q < 5; q++) { const t = (q / 5) * 6.28; berry(pl, p.clone().add(V(Math.cos(t) * 0.011, rng() * 0.008, Math.sin(t) * 0.011)), 0.009, col2); } }
        else for (let k = 0; k < 4; k++) { const t = r0 + 0.4 + (k / 4) * 6.28; leaf(pl, p, V(Math.cos(t), 0, Math.sin(t)), 0.026, 0.02, white, 0); }
      }
    }
    return { plant: pl, fruit: [] };
  },
  chanterelle(rng) {
    const pl = new PropBuilder(), fr = [new PropBuilder()];
    for (let i = 0; i < 4; i++) mound(pl, rng, (rng() - 0.5) * 0.7, 0, (rng() - 0.5) * 0.6, 0.25 + rng() * 0.15, 0.05, 0.22 + rng() * 0.12, GREENS.moss, { floor: 0 });
    const n = 6 + Math.floor(rng() * 6);
    for (let i = 0; i < n; i++) {
      const a = rng() * 6.28, d = Math.sqrt(rng()) * 0.5;
      mushroom(fr[0], rng, Math.cos(a) * d, 0.02, Math.sin(a) * d * 0.8, { h: 0.045 + rng() * 0.04, r: 0.04 + rng() * 0.025, stemR: 0.011, capCol: pickR(rng, [0xe9a63b, 0xf0b440, 0xe39a30]), underCol: 0xf2c46a, stemCol: new THREE.Color(0xeab654), funnel: true });
    }
    return { plant: pl, fruit: fr };
  },
  hedgehog(rng) {
    const pl = new PropBuilder(), fr = [new PropBuilder()];
    const n = 5 + Math.floor(rng() * 5);
    for (let i = 0; i < n; i++) {
      const a = rng() * 6.28, d = Math.sqrt(rng()) * 0.42;
      mushroom(fr[0], rng, Math.cos(a) * d, 0, Math.sin(a) * d, { h: 0.05 + rng() * 0.035, r: 0.058 + rng() * 0.03, stemR: 0.015, capCol: pickR(rng, [0xe3b886, 0xdcae7c, 0xeac39a]), underCol: 0xf0dcc0, stemCol: new THREE.Color(0xefe6d2), tilt: 0.3 });
    }
    // a few needles' worth of duff heaped round them
    for (let i = 0; i < 3; i++) mound(pl, rng, (rng() - 0.5) * 0.5, 0, (rng() - 0.5) * 0.5, 0.14, 0.025, 0.12, [0x8a7254, 0x7a6448], { floor: 0 });
    return { plant: pl, fruit: fr };
  },
  lobster(rng) {
    const pl = new PropBuilder(), fr = [new PropBuilder()], oranges = [0xe2532a, 0xd9471f, 0xec6a36];
    const n = 2 + Math.floor(rng() * 3);
    for (let i = 0; i < n; i++) {
      const a = rng() * 6.28, d = rng() * 0.3, x = Math.cos(a) * d, z = Math.sin(a) * d;
      mound(fr[0], rng, x, 0.03, z, 0.06 + rng() * 0.03, 0.05 + rng() * 0.025, 0.05 + rng() * 0.03, oranges, { floor: -0.5, jit: 0.6 });
      mound(fr[0], rng, x + (rng() - 0.5) * 0.05, 0.075, z + (rng() - 0.5) * 0.05, 0.045, 0.03, 0.04, oranges, { jit: 0.6 });
    }
    for (let i = 0; i < 3; i++) mound(pl, rng, (rng() - 0.5) * 0.5, 0, (rng() - 0.5) * 0.5, 0.15, 0.025, 0.12, [0x8a7254, 0x6f5a40], { floor: 0 });
    return { plant: pl, fruit: fr };
  },
  falsechanterelle(rng) {
    const pl = new PropBuilder(), fr = [new PropBuilder()];
    // a rotten log, half sunk in the duff, moss on its back
    const a = rng() * 3.14, ca = Math.cos(a), sa = Math.sin(a), half = 0.6 + rng() * 0.3, r = 0.09 + rng() * 0.03;
    pl.cyl(V(-ca * half, r * 0.6, -sa * half), V(ca * half, r * 0.5, sa * half), r, r * 0.9, 7, TILE.BARK, new THREE.Color(0x4a3b2c), { cap0: true, cap1: true, capCol: new THREE.Color(0x6b5440) });
    for (let i = 0; i < 3; i++) { const t = (rng() - 0.5) * 1.4 * half; mound(pl, rng, ca * t, r * 1.35, sa * t, 0.12, 0.03, 0.08, GREENS.moss, { floor: 0 }); }
    const n = 5 + Math.floor(rng() * 4);
    for (let i = 0; i < n; i++) {
      const t = (rng() - 0.5) * 1.6 * half, s = (rng() - 0.5) * r * 1.2;
      mushroom(fr[0], rng, ca * t - sa * s, r * 1.4, sa * t + ca * s, { h: 0.035 + rng() * 0.025, r: 0.03 + rng() * 0.02, stemR: 0.008, capCol: pickR(rng, [0xe0761f, 0xd8691a, 0xea8228]), underCol: 0xc85a14, stemCol: new THREE.Color(0xd8732a), funnel: true });
    }
    return { plant: pl, fruit: fr };
  },
};
// shade baked by hand: darker low down and facing down (no bake: these are built as you go)
function shadeBy(geo, top) {
  const P = geo.getAttribute('position'), N = geo.getAttribute('normal'), O = geo.getAttribute('aOcc');
  for (let i = 0; i < O.count; i++) O.setX(i, (0.6 + 0.4 * Math.min(1, Math.max(0, (P.getY(i) + 0.02) / top))) * (N.getY(i) < -0.2 ? 0.75 : 1));
  O.needsUpdate = true;
  return geo;
}
// the built looks, shared: key `${look}:${variant}:${stage}` -> { geo, plant, groups: [vertex counts] }
const BUILT = new Map();
function built(look, variant, stage = '') {
  const key = `${look}:${variant}:${stage}`;
  let b = BUILT.get(key);
  if (b) return b;
  const rng = mulberry32(((variant + 1) * 7919 + look.length * 131 + stage.length * 17) >>> 0);
  const { plant, fruit } = LOOKS[look](rng, stage), all = new PropBuilder();
  const p0 = plant.count, groups = fruit.map((f) => f.count);
  all.p = plant.p.concat(...fruit.map((f) => f.p)); all.n = plant.n.concat(...fruit.map((f) => f.n)); all.c = plant.c.concat(...fruit.map((f) => f.c));
  all.uv = plant.uv.concat(...fruit.map((f) => f.uv)); all.t = plant.t.concat(...fruit.map((f) => f.t)); all.o = plant.o.concat(...fruit.map((f) => f.o));
  const geo = all.build();
  geo.computeBoundingBox();
  shadeBy(geo, Math.max(0.12, geo.boundingBox.max.y * 0.8));
  b = { geo, plant: p0, groups, tris: geo.getAttribute('position').count / 3, pool: [] };
  BUILT.set(key, b);
  return b;
}
const VARIANTS = 3;

// the glint: a small soft star, winking over a ripe patch you have walked up to
function glintTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,245,1)'); g.addColorStop(0.18, 'rgba(255,250,225,0.65)'); g.addColorStop(1, 'rgba(255,245,210,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  x.globalCompositeOperation = 'lighter'; x.fillStyle = 'rgba(255,255,240,0.55)';
  x.fillRect(31, 4, 2, 56); x.fillRect(4, 31, 56, 2);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// --- the forage ---------------------------------------------------------------------------------------------------------
export class Forage {
  // opts: { world, player, day, tiles, scene, camp, hud, energy, audio, outfitter }
  constructor(opts) {
    Object.assign(this, opts);
    this.cells = new Map();        // cell key -> patch | null (nothing grows there); unset: not read yet
    this.queue = [];               // cells to read, nearest first
    this.drawn = new Set();        // patches with a mesh
    this.seasonSig = '';
    this.s = { v: 1, picked: {}, named: {} }; // picked: patch key -> [abs day, n]; named: species -> abs day
    this.stateRef = undefined;
    this.busy = null;              // { t, patch, sp, hours, passed }
    this.armed = null;             // the patch whose E prompt showed last frame
    this.near = null;              // the nearest patch in reach this frame
    this.rustled = new Set();
    this.defined = false; this.defineT = 0;
    this.t = 0; this.cellT = 0;
    this.lastCell = null;
    this.mat = propMaterial();
    this.group = new THREE.Group(); this.group.name = 'forage';
    this.scene.add(this.group);
    this.glint = new THREE.Sprite(new THREE.SpriteMaterial({ map: glintTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0, fog: false }));
    this.glint.scale.setScalar(0.32); this.glint.visible = false; this.glint.renderOrder = 15;
    this.scene.add(this.glint);
    this.glintAt = null; this.glintT = 0;
    this.index();
  }

  // campsites and portage trails bucketed by 256 m, for the odds near them
  index() {
    const B = 256, k = (i, j) => `${i},${j}`;
    this.sites = new Map(); this.trails = new Map();
    for (const c of this.world.campsites) { const key = k(Math.floor(c.x / B), Math.floor(c.z / B)); if (!this.sites.has(key)) this.sites.set(key, []); this.sites.get(key).push(c); }
    for (const p of this.world.portages) {
      const b = p.bbox || [Infinity, Infinity, -Infinity, -Infinity];
      for (let i = Math.floor((b[0] - TRAIL_R) / B); i <= Math.floor((b[2] + TRAIL_R) / B); i++) for (let j = Math.floor((b[1] - TRAIL_R) / B); j <= Math.floor((b[3] + TRAIL_R) / B); j++) {
        const key = k(i, j); if (!this.trails.has(key)) this.trails.set(key, []); this.trails.get(key).push(p);
      }
    }
    this.B = B;
  }
  bucket(map, x, z) { return map.get(`${Math.floor(x / this.B)},${Math.floor(z / this.B)}`) || []; }
  nearestSite(x, z) {
    let best = null, bd = Infinity;
    for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) for (const c of this.bucket(this.sites, x + di * this.B, z + dj * this.B)) { const d = Math.hypot(c.x - x, c.z - z); if (d < bd) { bd = d; best = c; } }
    return best ? { site: best, d: bd } : null;
  }
  // the nearest point of a portage trail within TRAIL_R: { d, x, z (the point on the trail), tx, tz (its direction) }
  nearestTrail(x, z) {
    let best = null;
    for (const p of this.bucket(this.trails, x, z)) {
      const b = p.bbox;
      if (b && (x < b[0] - TRAIL_R || x > b[2] + TRAIL_R || z < b[1] - TRAIL_R || z > b[3] + TRAIL_R)) continue;
      const pts = p.pts;
      for (let i = 1; i < pts.length; i++) {
        const ax = pts[i - 1][0], az = pts[i - 1][1], bx = pts[i][0], bz = pts[i][1], dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1;
        const u = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2)), px = ax + dx * u, pz = az + dz * u, d = Math.hypot(x - px, z - pz);
        if (d < TRAIL_R && (!best || d < best.d)) { const l = Math.sqrt(L2); best = { d, x: px, z: pz, tx: dx / l, tz: dz / l }; }
      }
    }
    return best;
  }

  get today() { const d = this.day; return absDay(d.year, d.doy); }
  get trip() { return this.camp && this.camp.trip; }
  get chores() { return this.camp && this.camp.chores; }
  // the species in season today (the decor's look by its stage)
  seasonNow() { const d = this.day; return FORAGE_IDS.filter((id) => inSeason(id, d.year, d.doy)); }
  stageOf(id) { const d = this.day; return id === 'bunchberries' ? (d.doy >= dayOfYear(d.year, 7, 1) ? 'berry' : 'flower') : ''; }

  // --- the cells -------------------------------------------------------------------------------------------------------
  cellKey(ci, cj) { return `${ci},${cj}`; }
  // what grows in cell (ci, cj) today: a patch, null, or undefined while its ground is not in yet
  readCell(ci, cj, season) {
    const w = this.world, seed = 5101;
    const h = (k) => hash2(ci * 7 + k, cj * 13 - k, seed + k);
    const tries = [[h(1), h(2)], [h(3), h(4)], [h(5), h(6)], [h(7), h(8)]];
    let id = null;
    for (let k = 0; k < tries.length; k++) {
      let x = (ci + 0.12 + tries[k][0] * 0.76) * CELL, z = (cj + 0.12 + tries[k][1] * 0.76) * CELL;
      const cv = w.coverCell(w.cellI(x), w.cellJ(z));
      if (!cv) return undefined; // its ground is not in yet: read it again later
      const cls = GROUND[(cv >> 16) & 255], sd = w.shoreAt(x, z);
      if (!(sd > 1.5)) continue;
      const site = this.nearestSite(x, z), trail = this.nearestTrail(x, z);
      if (!id) {
        // the cell's one roll, at its first spot on land: the weights there (the ground, a campsite near, a trail near,
        // the shore) give the odds of a patch and which kind
        const ws = [];
        let sum = 0;
        for (const sid of season) {
          const S = FORAGE[sid];
          let wgt = (S.ground[cls] || 0) * (S.weight ?? 1);
          if (!wgt) continue;
          if (site && site.d < SITE_R) wgt *= 1 + (S.site - 1) * (1 - Math.max(0, Math.min(1, (site.d - 25) / (SITE_R - 25))));
          if (trail) wgt *= 1 + (S.trail - 1) * (1 - Math.max(0, Math.min(1, (trail.d - 4) / (TRAIL_R - 4))));
          if (sd < 15) wgt *= S.shore;
          ws.push([sid, wgt]); sum += wgt;
        }
        if (!sum || h(10) > Math.min(0.8, BASE * sum)) return null;
        let r = h(20) * sum;
        id = ws[0][0];
        for (const [i2, wgt] of ws) { if ((r -= wgt) <= 0) { id = i2; break; } }
      } else if (!FORAGE[id].ground[cls]) continue;
      const S = FORAGE[id];
      // along a trail, set back to its edge (the light comes in there; never on the trail itself)
      if (trail && trail.d < 7) {
        const side = ((x - trail.x) * -trail.tz + (z - trail.z) * trail.tx) >= 0 ? 1 : -1, off = 2.4 + h(30 + k) * 1.4;
        x = trail.x - trail.tz * side * off; z = trail.z + trail.tx * side * off;
      }
      const p = this.spotOk(x, z, S, site);
      if (!p) continue;
      return { key: `${Math.round(x)}:${Math.round(z)}`, id, x, z, y: p.y, n: p.n, variant: Math.floor(h(40 + k) * VARIANTS), cell: this.cellKey(ci, cj), mesh: null, left: -1 };
    }
    return null;
  }
  // ground for a patch at (x, z): dry, not steep, clear of trunks and rocks, of a campsite's ring, pad, bench and latrine,
  // of the portage trail itself and of an outfitter's yard. Its height and the ground's normal, or null.
  spotOk(x, z, s, site) {
    const w = this.world, t = this.tiles;
    if (!(w.shoreAt(x, z) > (s.shore > 1 ? 1.2 : 2.2))) return null;
    const r = s.tall ? 1.1 : s.kind === 'mushroom' || s.kind === 'lookalike' ? 0.5 : 1.0;
    const hs = [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r]].map(([u, v]) => t.groundAt(x + u, z + v));
    if (hs.some((v) => !Number.isFinite(v))) return null;
    const lo = Math.min(...hs), hi = Math.max(...hs);
    if (hi - lo > (s.tall ? 0.7 : 0.5)) return null;
    if (t.treesNear(x, z, s.tall ? 1.4 : 0.9).length) return null;
    const L = site && site.site.layout;
    if (L && [L.fire, L.pad, L.bench, L.latrine].some((q) => q && Math.hypot(q.x - x, q.z - z) < 5)) return null;
    const tr = this.nearestTrail(x, z);
    if (tr && tr.d < 1.7) return null;
    for (const e of w.entryPoints) if (Math.abs(e.x - x) < 60 && Math.abs(e.z - z) < 60 && Math.hypot(e.x - x, e.z - z) < 50) return null;
    const n = new THREE.Vector3(hs[2] - hs[1], 2 * r, hs[4] - hs[3]).normalize();
    if (n.y < 0.93) n.set(n.x * 0.35, 1, n.z * 0.35).normalize(); // a lean toward the slope, never more than a little
    return { y: hs[0], n };
  }
  // the cells around (x, z) queued nearest first; far ones and their meshes let go
  refreshCells(x, z) {
    const ci0 = Math.floor(x / CELL), cj0 = Math.floor(z / CELL), R = Math.ceil(NEAR / CELL), q = [];
    for (let dj = -R; dj <= R; dj++) for (let di = -R; di <= R; di++) {
      const ci = ci0 + di, cj = cj0 + dj, cx = (ci + 0.5) * CELL - x, cz = (cj + 0.5) * CELL - z, d = Math.hypot(cx, cz);
      if (d > NEAR + CELL) continue;
      if (this.cells.get(this.cellKey(ci, cj)) === undefined) q.push([d, ci, cj]);
    }
    q.sort((a, b) => a[0] - b[0]);
    this.queue = q;
    for (const [k, p] of this.cells) {
      if (!p) { const [ci, cj] = k.split(',').map(Number); if (Math.hypot((ci + 0.5) * CELL - x, (cj + 0.5) * CELL - z) > DROP) this.cells.delete(k); continue; }
      if (Math.hypot(p.x - x, p.z - z) > DROP) { this.unbuild(p); this.cells.delete(k); }
    }
  }
  dropAll() { for (const p of this.cells.values()) if (p) this.unbuild(p); this.cells.clear(); this.queue = []; this.rustled.clear(); this.lastCell = null; }

  // --- drawing ---------------------------------------------------------------------------------------------------------
  build(p) {
    const s = FORAGE[p.id], b = built(s.look, p.variant, this.stageOf(p.id));
    // a view of the look's shared buffers with a draw range of its own (the fruit left on this patch); views are kept
    // in a pool per look, never disposed (disposing a view would delete the shared buffers under every other view)
    let geo = b.pool.pop();
    if (!geo) {
      geo = new THREE.BufferGeometry();
      for (const k of ['position', 'normal', 'color', 'aPropUv', 'aPropTile', 'aOcc']) geo.setAttribute(k, b.geo.getAttribute(k));
      geo.boundingSphere = b.geo.boundingSphere; geo.boundingBox = b.geo.boundingBox;
    }
    geo.setDrawRange(0, Infinity);
    const m = new THREE.Mesh(geo, this.mat);
    m.castShadow = !!s.tall; m.receiveShadow = true;
    m.position.set(p.x, p.y - 0.02, p.z);
    m.quaternion.setFromUnitVectors(_up, p.n);
    m.rotateY(hash2(Math.round(p.x), Math.round(p.z), 77) * 6.28);
    m.updateMatrix(); m.matrixAutoUpdate = false; m.updateMatrixWorld(true);
    m.name = `forage ${p.id}`;
    p.mesh = m; p.built = b; p.left = -1;
    this.group.add(m);
    this.drawn.add(p);
  }
  unbuild(p) {
    if (!p.mesh) return;
    this.group.remove(p.mesh);
    p.built.pool.push(p.mesh.geometry);
    p.mesh = null; p.built = null; this.drawn.delete(p);
  }
  // what is left on a patch today: pints (or handfuls, or a bag); Infinity for the decor and the lookalike
  leftOn(p) {
    const s = FORAGE[p.id];
    if (!s.pick) return Infinity;
    const pk = this.s.picked[p.key];
    if (s.kind === 'mushroom') return pk && this.today - pk[0] < REGROW ? 0 : 1;
    return s.pick.per - (pk && pk[0] === this.today ? pk[1] : 0);
  }
  // the fruit drawn to match what is left (the groups past it hidden)
  showLeft(p) {
    const s = FORAGE[p.id], b = p.built, left = this.leftOn(p);
    if (!b || left === p.left) return;
    p.left = left;
    const n = b.groups.length, keep = !s.pick ? n : s.kind === 'mushroom' ? (left > 0 ? n : 0) : Math.max(0, Math.min(n, Math.round((left / s.pick.per) * n)));
    let count = b.plant;
    for (let i = 0; i < keep; i++) count += b.groups[i];
    p.mesh.geometry.setDrawRange(0, count);
    p.mesh.visible = count > 0;
  }

  // --- the frame -------------------------------------------------------------------------------------------------------
  // before player.update: E for the patch whose prompt showed last frame; the walker held while picking
  before() {
    const p = this.player, inp = p.input;
    if (this.busy) { inp.paused = true; return; }
    const a = this.armed;
    this.armed = null;
    if (!a || inp.paused || p.mode !== 'walk' || !inp.once.has('KeyE')) return;
    if (Math.hypot(a.x - p.x, a.z - p.z) > FORAGE[a.id].reach + 0.5) return;
    inp.once.delete('KeyE'); // this E is the patch's (the camp's own E and the rest never see it)
    this.start(a);
  }
  // after camp.update: the saved part, the season, the cells, the drawing, the prompt and the picking
  update(dt) {
    const p = this.player;
    const st = this.camp && this.camp.state;
    if (st !== this.stateRef) { this.stateRef = st; this.restore(); }
    this.define(dt);
    if ((this.t -= dt) <= 0) {
      this.t = 1;
      const sig = this.seasonNow().map((id) => `${id}${this.stageOf(id)}`).join(',') + `|${this.today}`;
      if (sig.split('|')[0] !== this.seasonSig.split('|')[0]) this.dropAll();
      this.seasonSig = sig;
    }
    const on = (p.mode === 'walk' || p.mode === 'paddle' || p.mode === 'carry') && !p.teleporting;
    if (on) {
      const ci = Math.floor(p.x / CELL), cj = Math.floor(p.z / CELL), ck = `${ci},${cj}`;
      if (ck !== this.lastCell || (this.cellT -= dt) <= 0) { this.lastCell = ck; this.cellT = 2; this.refreshCells(p.x, p.z); }
      const season = this.seasonNow();
      for (let n = 0; n < PER_FRAME && this.queue.length; n++) {
        const [, i, j] = this.queue.shift(), k = this.cellKey(i, j);
        if (this.cells.get(k) !== undefined) continue;
        const res = this.readCell(i, j, season);
        if (res !== undefined) this.cells.set(k, res);
      }
    }
    this.draw(on, dt);
    if (this.busy) { this.working(dt); return; }
    this.prompt();
  }
  // meshes for the patches near enough to see, hidden past their reach, the fruit as left; the rustle and the glint
  draw(on, dt) {
    const p = this.player;
    let glint = null, gd = Infinity;
    for (const q of this.cells.values()) {
      if (!q) continue;
      const s = FORAGE[q.id], d = Math.hypot(q.x - p.x, q.z - p.z), far = s.tall ? 110 : s.kind === 'berry' ? 80 : 50;
      if (on && d < far) { if (!q.mesh) this.build(q); q.mesh.visible = true; this.showLeft(q); } else if (q.mesh) { q.mesh.visible = false; if (d > far + 30) this.unbuild(q); }
      if (!q.mesh || !on || p.mode !== 'walk') continue;
      const ripe = s.kind !== 'decor' && this.leftOn(q) > 0;
      if (!ripe) continue;
      if (d < RUSTLE) {
        if (!this.rustled.has(q.key)) { this.rustled.add(q.key); this.rustle(q); }
        if (d < gd) { gd = d; glint = q; }
      } else if (d > RUSTLE + 4) this.rustled.delete(q.key);
      if (d < NAME_AT && s.seen && this.s.named[q.id] !== this.today && this.camp && !this.camp.busy) {
        this.s.named[q.id] = this.today;
        this.note(s.seen, 5);
      }
    }
    // the glint: winks every couple of seconds over the nearest ripe patch within RUSTLE
    const gl = this.glint;
    if (glint && glint.mesh && !this.busy) {
      if (this.glintAt !== glint) { this.glintAt = glint; this.glintT = 0; }
      this.glintT += dt;
      const s = FORAGE[glint.id], top = glint.built ? glint.built.geo.boundingBox.max.y : 0.3, k = (this.glintT % 2.4) / 2.4;
      const a = Math.max(0, Math.sin(Math.min(1, k / 0.35) * Math.PI));
      gl.position.set(glint.x + 0.15, glint.y + Math.min(top, s.tall ? 1.4 : top) + 0.12, glint.z - 0.1);
      gl.material.opacity = 0.8 * a; gl.scale.setScalar(0.08 + 0.12 * a);
      gl.visible = a > 0.01;
    } else { gl.visible = false; this.glintAt = null; }
  }
  rustle(q) {
    const au = this.audio;
    if (!au || !au.ctx || !au.enabled) return;
    try { rustle(au, 'grass', { x: q.x, y: q.y + 0.3, z: q.z }); } catch { /* the sound is a nicety */ }
  }
  note(text, s = 5) { if (this.hud && text) this.hud.note(text, s); }

  // the nearest patch in reach, on foot, when E is ours to take
  free() {
    const p = this.player, c = this.camp, o = this.outfitter;
    if (p.mode !== 'walk' || p.teleporting || p.input.paused) return false;
    if (c && (c.busy || c.night || (c.chores && c.chores.card && c.chores.card.open))) return false;
    if (o && o.visit && o.visit.inside) return false;
    const pr = p.prompt;
    if (!pr || pr.soft) return true; // soft: a thing carried offers only Q (packs.js), kept on the patch's line
    if (!pr.key && !/<kbd>/.test(pr.text || '')) return true;
    // the camp's E anywhere on a site or by the trees gives way to a patch you are standing at
    return pr.key === 'E' && /^(Gather firewood|Pitch the tent)/.test(pr.text || '');
  }
  prompt() {
    const p = this.player, was = p.prompt, tail = was && was.tail; // a carried thing's Q (packs.js; kept by the camp's E)
    this.patchPrompt();
    if (tail && p.prompt && p.prompt !== was) p.prompt = { ...p.prompt, text: `${p.prompt.text}${tail}`, tail };
  }
  patchPrompt() {
    const p = this.player;
    this.near = null;
    if (!this.free()) return;
    let best = null, bd = Infinity;
    for (const q of this.drawn) {
      const s = FORAGE[q.id], d = Math.hypot(q.x - p.x, q.z - p.z);
      if (d < s.reach && d < bd) { bd = d; best = q; }
    }
    if (!best) return;
    const s = FORAGE[best.id];
    this.near = best;
    if (s.kind === 'decor') { if (!p.prompt) p.prompt = { key: null, text: s.say }; return; }
    if (s.kind === 'lookalike') { p.prompt = { key: 'E', text: 'Look at the orange mushrooms · on the rotten log' }; this.armed = best; return; }
    const left = this.leftOn(best), P = s.pick;
    if (left <= 0) { p.prompt = { key: null, text: s.kind === 'mushroom' ? `${s.name} · picked: more will come up in a few days` : `${s.name} · picked clean today; more ripen by tomorrow` }; return; }
    const tin = best.id === 'blueberries' && this.chores && this.chores.pintsWanted && this.chores.pintsWanted() > this.chores.pints;
    const more = s.kind === 'mushroom' ? 'a few here' : `${word(left)} ${plural(left, P.unit)} on the ${best.id === 'raspberries' ? 'canes' : s.tall ? 'branches' : 'plants'}`;
    p.prompt = { key: 'E', text: `${P.verb} ${s.short} · a ${P.unit}, ${P.minutes} min${tin ? ', for the notice' : ''} · ${more}` };
    this.armed = best;
  }

  // --- picking ---------------------------------------------------------------------------------------------------------
  start(q) {
    const s = FORAGE[q.id];
    if (s.kind === 'lookalike') { this.lookalike(q); return; }
    if (!s.pick || this.leftOn(q) <= 0) return;
    this.busy = { t: 0, q, s, hours: s.pick.minutes / 60, passed: 0, seconds: s.kind === 'mushroom' ? 1.0 : 1.4 };
    this.rustle(q);
  }
  working(dt) {
    const b = this.busy, p = this.player, cs = p.canoe && p.canoe.state;
    if (cs) cs.crouch = 1; // down on the heels (canoe.js state.crouch: the camp sets it back each frame)
    b.t += dt;
    const k = Math.min(1, b.t / b.seconds), want = b.hours * k;
    if (this.camp && this.camp.pass) this.camp.pass(want - b.passed);
    b.passed = want;
    p.prompt = { key: null, text: `${b.s.kind === 'mushroom' ? 'Gathering' : 'Picking'} ${b.s.short}…` };
    if (k >= 1) { this.busy = null; if (cs) cs.crouch = 0; this.picked(b.q); }
  }
  picked(q) {
    const s = FORAGE[q.id], P = s.pick, today = this.today, pk = this.s.picked[q.key];
    this.s.picked[q.key] = [today, (pk && pk[0] === today && s.kind !== 'mushroom' ? pk[1] : 0) + 1];
    this.showLeft(q);
    const unit = `a ${P.unit} of ${s.short}`;
    // a berries notice still wanting pints takes blueberries into its tin first (chores.js)
    const ch = this.chores;
    if (q.id === 'blueberries' && ch && ch.pintsWanted && ch.pintsWanted() > ch.pints) {
      ch.s.pints++;
      const t = ch.berryNotice ? ch.berryNotice() : null;
      this.note(`A pint of blueberries into the tin${t ? ` for “${t.title}”` : ''}: ${word(ch.s.pints)} of ${word(ch.pintsWanted())}.`, 5);
      ch.persist();
      this.persist();
      return;
    }
    const where = this.stow(q.id);
    if (where) this.note(`${cap(unit)} into ${where}.`, 5);
    else if (s.kind === 'mushroom' && this.inventory()) this.note(`No room for ${unit} in anything you can reach. You leave them for the squirrels.`, 5);
    else {
      // no inventory to put it in (or no room): eaten as picked, the food need as the campsite's patch gave it
      const e = this.energy;
      if (e && e.live && e.needs) e.needs.food = Math.min(1, e.needs.food + P.food);
      this.note(s.kind === 'mushroom' ? `${s.got} They go in the pot with supper.` : s.got, 5);
    }
    if (this.trip && this.trip.log) this.trip.log('forage', { id: q.id, unit: P.unit, stowed: !!where });
    this.persist();
  }
  lookalike(q) {
    const s = FORAGE[q.id];
    this.note(s.left, 7);
    if (this.trip && this.trip.log) this.trip.log('forage', { id: q.id, left: true, words: 'Not sure about these, left them.' });
  }
  inventory() { const g = typeof window !== 'undefined' ? window.__game : null; return g && g.inventory && typeof g.inventory.place === 'function' ? g.inventory : null; }
  // into a container you can reach (stream A's inventory.place): its words ("the food barrel"), or null
  stow(id) {
    const inv = this.inventory();
    if (!inv) return null;
    let r = null;
    try { r = inv.place(id, 1); } catch (err) { console.warn('forage: inventory.place', err); return null; }
    if (!r || !r.ok) return null;
    const g = window.__game, c = inv.containers && inv.containers.find((k) => k.id === r.cId), it = c && g.items && g.items.ITEMS ? g.items.ITEMS[c.item] : null;
    const name = it && it.name ? it.name.replace(/^(an?|the) /i, '') : '';
    if (!name) return 'your pack';
    const low = `${name[0].toLowerCase()}${name.slice(1)}`;
    return /^your /i.test(name) ? low : `the ${low}`; // "your pockets", "the blue food barrel, 60 L"
  }
  // the items, once stream A's items.js is in (main.js sets window.__game.items)
  define(dt) {
    if (this.defined || (this.defineT -= dt) > 0) return;
    this.defineT = 2;
    const g = typeof window !== 'undefined' ? window.__game : null, it = g && g.items;
    if (!it || typeof it.defineItem !== 'function') return;
    for (const def of FORAGE_ITEMS) { try { if (!it.ITEMS || !it.ITEMS[def.id]) it.defineItem(def); } catch (err) { console.warn('forage: defineItem', def.id, err); } }
    this.defined = true;
  }

  // --- for the tests and the look board ------------------------------------------------------------------------------
  // a patch of `id` at (x, z), drawn now (in or out of season), replacing whatever its cell held
  plant(id, x, z, variant = 0) {
    const s = FORAGE[id], ci = Math.floor(x / CELL), cj = Math.floor(z / CELL), k = this.cellKey(ci, cj), old = this.cells.get(k);
    if (old) this.unbuild(old);
    const y = this.tiles.groundAt(x, z), q = { key: `${Math.round(x)}:${Math.round(z)}`, id, x, z, y, n: new THREE.Vector3(0, 1, 0), variant, cell: k, mesh: null, left: -1 };
    if (!s) return null;
    this.cells.set(k, q);
    return q;
  }
  list() { const p = this.player; return [...this.cells.values()].filter(Boolean).map((q) => ({ id: q.id, key: q.key, x: +q.x.toFixed(1), z: +q.z.toFixed(1), d: +Math.hypot(q.x - p.x, q.z - p.z).toFixed(1), drawn: !!(q.mesh && q.mesh.visible), left: this.leftOn(q), tris: q.built ? q.built.tris : 0 })).sort((a, b) => a.d - b.d); }

  // --- saving ----------------------------------------------------------------------------------------------------------
  persist() {
    const today = this.today;
    for (const k of Object.keys(this.s.picked)) if (today - this.s.picked[k][0] >= REGROW) delete this.s.picked[k];
    const c = this.camp, st = c && c.state, doc = { v: 1, picked: { ...this.s.picked }, named: { ...this.s.named } };
    if (st) { st.forage = doc; if (c.outfitter && c.outfitter.save) c.outfitter.save(); }
    else save.write('forage', doc);
  }
  restore() {
    const st = this.camp && this.camp.state, d = st ? st.forage : save.read('forage');
    this.s = { v: 1, picked: {}, named: {} };
    if (d && d.v === 1) {
      if (d.picked && typeof d.picked === 'object') for (const [k, v] of Object.entries(d.picked)) if (Array.isArray(v) && v.length === 2) this.s.picked[k] = [v[0] | 0, v[1] | 0];
      if (d.named && typeof d.named === 'object') this.s.named = { ...d.named };
    }
    for (const q of this.drawn) q.left = -1;
  }
}
const _up = new THREE.Vector3(0, 1, 0);
