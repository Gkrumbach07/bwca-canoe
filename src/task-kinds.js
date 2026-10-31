import * as THREE from 'three';
import { registerKind, KINDS, WORDS, NUMBERS, siteFeature, lakeNearGrid, shoreSpot, fishWith } from './tasks.js';
import { PropBuilder, propMaterial, TILE, bakeSelf, buildHull } from './prop-kit.js';
import { groundAt } from './props.js';
import { defineItem, itemDef } from './items.js';
import { hold } from './hold.js';
import { word, plural, esc } from './hud.js';
import { mulberry32 } from './rng.js';
import { SPECIES as FISH } from './fishing.js';
import { outfitterProfile, abundanceOf } from './outfitters.js';
import { MOMENTS, TEACH } from './hints.js';

// Content pass 1, stream A (the owner, 2026-10-25: "start filling in content. this means, more varied tasks"): seven
// more kinds of notice for the boards, each a real piece of Boundary Waters work with a clear end, paid where it was
// posted like every notice (tasks.js).
//
//   deadfall  Trail crew: a spruce down across a named portage. It is drawn across the trail and is solid (tiles.dynamic:
//             a canoe on your shoulders will not go over it; on foot Space climbs it). With a saw in reach, hold E on
//             it: two cuts and the length rolled off the trail. Hand tools only: it is a wilderness.
//   litter    Leave No Trace: a party left a mess at a named campsite (crushed cans and a bottle, which are not allowed
//             in the Boundary Waters at all, a torn tarp, a bird's nest of line, a foil wrapper). Each piece is drawn
//             where it lies; E packs it out into your pack (an item, 'litter'), and the counter takes it off you.
//   secchi    The Citizen Lake Monitoring Program: the counter lends the disk (an item, 'secchi'); at the lake's deep
//             spot, still, between ten and four, hold E to lower it till it is gone and raise it till it shows. The
//             reading is the lake's own clarity (world.js estimateSecchi), a little less in a chop.
//   loons     The DNR's midsummer loon count on a named lake: turn toward each loon and keep it ahead a moment, within
//             120 m, and it is counted (loons.js's birds, seen from where you are and not behind the land; they dive if
//             the canoe comes within 26 m, so a count is made from a respectful distance).
//   report    A route report: paddle a named chain of lakes, portage by portage, and say how it went. Each lake is
//             noted as you paddle on it; the map rings the ones still to go.
//   canoe     A rental left behind: an outfitter's canoe pulled up and turned over at a named campsite. Find it (the
//             ring is the stretch of shore the party remembers) and read the number on its bow (E).
//   lunch     The shore lunch class: two or three of one kind of fish into the cooler (as the fish notices), for the
//             guests to learn to fillet on the rock. The keeper's pencil rings where they are biting.
//
// The first time each new action matters it is taught (hints.js moments, pushed onto its table here): the blowdown,
// the litter, the deep spot, the loons. Nothing is said for good: the thing that needs the saw or the disk says so on
// its own line. The props are on the props' one material (prop-kit.js), so no new shader program.
//
//   import { attachTaskKinds } from './task-kinds.js';
//   attachTaskKinds({ tasks, pointer, hints, inventory, chores, tiles, camera, loons, wind, hud })   (main.js content A)
//   exposes window.__game.taskKinds = { kinds, state, models } for the console and the tests

const { hopsText, compass, pickR, kmFrom, cap, district, fishName } = WORDS;
const { RANGE, SPECIES_PAY, PAY_MAX, TIGHT, AREA, SITE_LABEL, AREA_LABEL } = NUMBERS;
const rangeOf = (band) => Math.min(RANGE, (NUMBERS.BAND_KM || {})[band] ?? RANGE); // (tuning: a medium notice within a day's reach, tasks.js BAND_KM)
const BAND = { local: [0, 1], medium: [1, 2], far: [2, 4] };

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const UP = new THREE.Vector3(0, 1, 0);
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const C = (hex) => new THREE.Color(hex);
const nowS = () => (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;

// what the kinds read that the tasks do not hold: set by attachTaskKinds, else window.__game's
const G = {};
const game = () => (typeof window !== 'undefined' && window.__game) || {};
const ref = (k) => G[k] || game()[k] || null;
const inv = () => { const i = ref('inventory'); return i && i.attached ? i : null; };
export const state = { near: {}, seen: new Map(), lastCount: 0 };
// what a notice keeps only while the page is up (the dwell on a loon, the route's next look): never saved with it
const TRANSIENT = new Map();
const tr = (t) => { let o = TRANSIENT.get(t.id); if (!o) TRANSIENT.set(t.id, (o = { keys: [] })); return o; };

// --- the clue writer's shared steps ----------------------------------------------------------------------------------
// a lake's portages from the landing, or null when it is not reached by water
const hopsOf = (T, c, lakeId) => { const r = c.reach.get(T.basinOf(lakeId)); return r ? r.hops : null; };
const inBand = (h, band) => h != null && h >= band[0] && h <= band[1];
// the campsites a band's notice may name: within RANGE, a band's portages in, not already named by a notice of this kind
function siteCands(T, c, kind, band = BAND[c.band]) {
  const w = T.world, L = c.landing, out = [];
  w.campsites.forEach((s, i) => {
    if (Math.abs(s.x - L.x) > RANGE || Math.abs(s.z - L.z) > RANGE) return;
    const d = Math.hypot(s.x - L.x, s.z - L.z);
    if (d > rangeOf(c.band) || T.used(kind, i)) return;
    const h = hopsOf(T, c, T.lakeNear(s.x, s.z));
    if (inBand(h, band)) out.push({ s, i, d, hops: h });
  });
  return c.band === 'far' ? out.sort((a, b) => b.hops - a.hops || a.d - b.d) : out.sort((a, b) => a.d - b.d);
}
// a candidate site read off its tile: its lake, the lake's name, the site's feature and the words for where it is
async function readSite(T, c, cand) {
  const tg = await T.peek(cand.s.x, cand.s.z);
  if (!tg) return null;
  const lakeId = lakeNearGrid(tg, cand.s.x, cand.s.z, 8), h = hopsOf(T, c, lakeId);
  if (!lakeId || !inBand(h, BAND[c.band])) return null;
  const lake = T.lakeRec(lakeId), name = T.lakeName(lakeId);
  if (!name) return null;
  const feature = siteFeature(tg, cand.s.x, cand.s.z);
  const site = { island: 'the island site', point: 'the site out on the point', bay: 'the site tucked into the bay', shore: 'the campsite' }[feature];
  const body = /river|creek/i.test(name) ? 'the river' : 'the lake';
  const dir = lake && lake.cells >= 2500 ? (feature !== 'island' ? ` on the ${compass(cand.s.x - lake.cx, cand.s.z - lake.cz)} side of ${body}` : ` toward the ${compass(cand.s.x - lake.cx, cand.s.z - lake.cz)} end`) : '';
  return { tg, lakeId, lake, name, feature, site, dir, hops: h };
}
// a campsite notice's pencil ring: tight and named where the site is known (an island's is the island's), else the
// stretch of the lake the notice describes
function siteRing(T, t, label = null) {
  const s = typeof t.site === 'number' ? T.world.campsites[t.site] : null;
  if (!s) return t.hint || null;
  if (t.feature === 'island' || T.known(s.x, s.z)) return { x: s.x, z: s.z, r: TIGHT, label: label || SITE_LABEL[t.feature] || 'the campsite', tight: true };
  return T.hintFor(t.lakeId, s, AREA_LABEL[t.feature] || null);
}
// a portage notice's candidates, as the survey's: named both ends, within RANGE, a band's portages in
function portageCands(T, c, kind, minRods) {
  const w = T.world, L = c.landing, hb = { local: [0, 1], medium: [1, 2], far: [2, 3] }[c.band], out = [];
  w.portages.forEach((p, i) => {
    if (p.rods < minRods || T.used(kind, i) || !p.pts || p.pts.length < 3) return;
    const d = Math.hypot(p.pts[0][0] - L.x, p.pts[0][1] - L.z);
    if (d > rangeOf(c.band)) return;
    const ra = hopsOf(T, c, p.launch[0].lake), rb = hopsOf(T, c, p.launch[1].lake);
    if (ra == null && rb == null) return;
    const near = (ra ?? 99) <= (rb ?? 99) ? 0 : 1, hops = Math.min(ra ?? 99, rb ?? 99);
    if (!inBand(hops, hb)) return;
    const toName = T.lakeName(p.launch[1 - near].lake), fromName = T.lakeName(p.launch[near].lake);
    if (!toName || !fromName || toName === fromName) return;
    out.push({ p, i, near, hops, d, toName, fromName });
  });
  return out;
}
// the point a share u of the way along a polyline, and its direction there
function along(pts, u) {
  let total = 0;
  for (let k = 1; k < pts.length; k++) total += Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]);
  let want = total * u;
  for (let k = 1; k < pts.length; k++) {
    const ax = pts[k - 1][0], az = pts[k - 1][1], seg = Math.hypot(pts[k][0] - ax, pts[k][1] - az);
    if (want <= seg || k === pts.length - 1) {
      const f = seg > 0 ? Math.min(1, want / seg) : 0, dx = (pts[k][0] - ax) / (seg || 1), dz = (pts[k][1] - az) / (seg || 1);
      return { x: ax + (pts[k][0] - ax) * f, z: az + (pts[k][1] - az) * f, dx, dz, total };
    }
    want -= seg;
  }
  return null;
}
// the player's lake as the notices name it (a channel takes the nearest lake's name)
const lakeHere = (T) => { const p = T.player, w = T.world; return w.lakeIdAt(p.x, p.z) || T.lakeNear(p.x, p.z, 4); };
const sameLake = (T, a, b) => !!a && !!b && (a === b || (T.lakeName(a) && T.lakeName(a) === T.lakeName(b) && T.basinOf(a) === T.basinOf(b)));
const landingName = (T, t) => { const L = T.landing(t.from); return L ? L.name : 'the outfitter'; };
const backTo = (T, t) => `${landingName(T, t)}, entry point ${t.from}`;
// "Tell Kawishiwi Lodge & Outfitters how it went: entry point 30." (as the survey's "Tell … what you saw: entry point …")
const tell = (T, t, what = '') => `Tell ${landingName(T, t)}${what ? ` ${what}` : ''}: entry point ${t.from}.`;

// --- the props: built on the props' one material ---------------------------------------------------------------------
const MODELS = {};
function meshOf(geo, name) { const m = new THREE.Mesh(geo, propMaterial()); m.castShadow = true; m.receiveShadow = true; m.name = name; return m; }
// a spruce come down across the trail, lying along x (−L/2 .. L/2), the butt at −x with its root plate torn up, the top
// broken off; its middle at the origin, its underside on y = 0. cut: the middle length sawn out and gone.
function deadfallGeo(cut, seed) {
  const k = `deadfall:${cut ? 1 : 0}:${seed % 4}`;
  if (MODELS[k]) return MODELS[k];
  const rng = mulberry32(900 + seed), b = new PropBuilder(), bark = C(0x5d4d3f), dark = C(0x3e342b), wood = C(0xc8ac80), soil = C(0x4a3b2c);
  const L = 4.8, r0 = 0.24, r1 = 0.13, rAt = (x) => r0 + (r1 - r0) * ((x + L / 2) / L);
  const piece = (x0, x1, endA, endB) => {
    b.cyl(V(x0, rAt(x0), 0), V(x1, rAt(x1), 0), rAt(x0), rAt(x1), 9, TILE.BARK, bark, { cap0: endA, cap1: endB, capTile: TILE.END, capCol: wood, jitter: 0.012, rng });
  };
  if (!cut) piece(-L / 2, L / 2, false, true);
  else { piece(-L / 2, -0.75, false, true); piece(0.75, L / 2, true, true); }
  // the root plate at the butt: a torn disc of roots and soil stood on its edge
  const rp = 0.75, sides = 11, cx = -L / 2 - 0.05;
  const rim = Array.from({ length: sides }, (_, i) => { const a = (i / sides) * Math.PI * 2, rr = rp * (0.75 + rng() * 0.35); return V(cx + (rng() - 0.5) * 0.08, 0.32 + Math.sin(a) * rr * 0.85, Math.cos(a) * rr); });
  for (let i = 0; i < sides; i++) {
    const a = rim[i], c2 = rim[(i + 1) % sides];
    b.face([V(cx - 0.12, 0.32, 0), a, c2], TILE.BARK, soil, { ref: V(cx + 1, 0.32, 0) });
    b.face([V(cx + 0.1, 0.32, 0), c2, a], TILE.BARK, dark, { ref: V(cx - 1, 0.32, 0) });
  }
  // broken branch stubs, up and to the sides
  for (let i = 0; i < 7; i++) {
    const x = -L / 2 + 0.8 + rng() * (L - 1.2);
    if (cut && Math.abs(x) < 0.85) continue;
    const a = (rng() - 0.5) * 2.4, len = 0.18 + rng() * 0.35, r = rAt(x), y = r, dirY = Math.cos(a), dirZ = Math.sin(a);
    b.cyl(V(x, y + dirY * r * 0.8, dirZ * r * 0.8), V(x + 0.1, y + dirY * (r + len), dirZ * (r + len)), 0.03, 0.012, 4, TILE.BARK, dark, {});
  }
  // the sawn middle, rolled off beside the trail (+z), and a scatter of sawdust on the ground where it was
  if (cut) {
    b.cyl(V(-0.7, 0.2, 1.55), V(0.7, 0.19, 1.62), 0.2, 0.19, 9, TILE.BARK, bark, { cap0: true, cap1: true, capTile: TILE.END, capCol: wood });
    for (const sx of [-0.75, 0.75]) for (let j = 0; j < 5; j++) { const px = sx + (rng() - 0.5) * 0.35, pz = (rng() - 0.5) * 0.5, s = 0.05 + rng() * 0.05; b.face([V(px - s, 0.012, pz - s), V(px + s, 0.012, pz - s * 0.6), V(px, 0.012, pz + s)], TILE.PLAIN, C(0xd9c49c), { ref: V(px, -1, pz) }); }
  }
  const geo = b.build();
  bakeSelf(geo, { rays: 8, reach: 0.4, ground: 0, floor: 0.5 });
  return (MODELS[k] = geo);
}
// litter: a crushed can, a glass bottle, a torn blue tarp, a bird's nest of line, a foil wrapper (each about its origin
// on the ground)
const LITTER = {
  can: { label: 'a crushed can', short: 'a can' },
  bottle: { label: 'a glass bottle', short: 'a bottle' },
  tarp: { label: 'a torn tarp', short: 'the tarp' },
  line: { label: 'a tangle of fishing line', short: 'the line' },
  foil: { label: 'a foil wrapper', short: 'the foil' },
};
const LITTER_ORDER = ['can', 'tarp', 'line', 'bottle', 'can', 'foil'];
function litterGeo(kind) {
  const k = `litter:${kind}`;
  if (MODELS[k]) return MODELS[k];
  const rng = mulberry32(kind.length * 77), b = new PropBuilder(), X = V(1, 0, 0), Y = V(0, 1, 0), Z = V(0, 0, 1);
  if (kind === 'can') {
    // on its side, crushed in the middle, red and silver
    b.cyl(V(-0.06, 0.03, 0), V(-0.005, 0.022, 0.004), 0.032, 0.02, 10, TILE.METAL, C(0xa9271f), { cap0: true, capTile: TILE.METAL, capCol: C(0xb8b8b4) });
    b.cyl(V(-0.005, 0.022, 0.004), V(0.06, 0.03, 0), 0.02, 0.032, 10, TILE.METAL, C(0xa9271f), { cap1: true, capTile: TILE.METAL, capCol: C(0xb8b8b4) });
  } else if (kind === 'bottle') {
    b.cyl(V(-0.1, 0.035, 0), V(0.04, 0.035, 0), 0.034, 0.034, 10, TILE.GLASS, C(0x4f6a34), { cap0: true, capTile: TILE.GLASS, capCol: C(0x41582a) });
    b.cyl(V(0.04, 0.035, 0), V(0.1, 0.035, 0), 0.034, 0.013, 10, TILE.GLASS, C(0x4f6a34), {});
    b.cyl(V(0.1, 0.035, 0), V(0.13, 0.035, 0), 0.013, 0.013, 8, TILE.GLASS, C(0x4f6a34), { cap1: true, capTile: TILE.GLASS, capCol: C(0x41582a) });
  } else if (kind === 'tarp') {
    // a crumpled sheet of blue poly, torn at one corner, a grommet showing
    const blue = C(0x2f5e9e), pts = [];
    for (let i = 0; i < 9; i++) { const a = (i / 9) * Math.PI * 2, r = 0.32 + rng() * 0.22; pts.push(V(Math.cos(a) * r, 0.01 + rng() * 0.07, Math.sin(a) * r * 0.75)); }
    const mid = V(0, 0.09, 0);
    for (let i = 0; i < pts.length; i++) b.face([mid, pts[i], pts[(i + 1) % pts.length]], TILE.CANVAS, i % 2 ? blue : blue.clone().offsetHSL(0, 0, -0.06), { ref: V(0, -1, 0) });
    b.cyl(V(0.3, 0.03, 0.05), V(0.3, 0.045, 0.05), 0.018, 0.018, 8, TILE.METAL, C(0xb0b0a8), { cap1: true, capTile: TILE.METAL, capCol: C(0x9a9a92) });
  } else if (kind === 'line') {
    // a bird's nest of clear-green monofilament with a red-and-white bobber caught in it
    const mono = C(0x8fb59a);
    for (let k2 = 0; k2 < 4; k2++) {
      const loop = [];
      for (let i = 0; i <= 16; i++) { const a = (i / 16) * Math.PI * 2, r = 0.07 + rng() * 0.05; loop.push(V(Math.cos(a) * r + (rng() - 0.5) * 0.02, 0.01 + rng() * 0.03, Math.sin(a) * r * (0.6 + k2 * 0.12))); }
      b.tube(loop, 0.0022, 3, TILE.PLAIN, mono);
    }
    b.cyl(V(0.09, 0.028, 0.02), V(0.09, 0.052, 0.02), 0.026, 0.02, 8, TILE.PAINT, C(0xb3261e), { cap0: true, capTile: TILE.PAINT, capCol: C(0xf0ece2) });
    b.cyl(V(0.09, 0.052, 0.02), V(0.09, 0.07, 0.02), 0.02, 0.004, 8, TILE.PAINT, C(0xf0ece2), {});
  } else {
    // a balled-up foil wrapper
    const foil = C(0xc9c6bf);
    b.box(V(0, 0.022, 0), X, Y, Z, 0.035, 0.022, 0.028, TILE.METAL, foil, {});
    b.box(V(0.03, 0.015, 0.02), X, Y, Z, 0.02, 0.014, 0.02, TILE.METAL, foil.clone().offsetHSL(0, 0, -0.08), {});
  }
  const geo = b.build();
  geo.scale(1.3, 1.3, 1.3); // (read from a standing eye: a crushed can is a hand long)
  bakeSelf(geo, { rays: 6, reach: 0.1, ground: 0, floor: 0.55 });
  return (MODELS[k] = geo);
}
// a rental canoe turned over on the shore: the props' hull (prop-kit.js buildHull), keel up
const HULLS = {
  grumman: { shell: 0xa9adb0, inner: 0x9ea2a4, wood: 0x8d9194, cane: 0x6c6f71, words: 'an aluminium Grumman', short: 'Grumman' },
  wenonah: { shell: 0x3e6a4b, inner: 0xa38d62, wood: 0x6e4b2e, cane: 0xb89a63, words: 'a green Wenonah', short: 'Wenonah' },
};
function hullGeo(make) {
  const k = `hull:${make}`;
  if (MODELS[k]) return MODELS[k];
  const H = HULLS[make] || HULLS.grumman, b = new PropBuilder();
  buildHull(b, C(H.shell), C(H.inner), C(H.wood), C(H.cane));
  const geo = b.build();
  geo.rotateX(Math.PI); // keel up, the gunwales on the ground
  geo.computeBoundingBox();
  geo.translate(0, -geo.boundingBox.min.y, 0);
  bakeSelf(geo, { rays: 8, reach: 0.6, ground: 0, floor: 0.45 });
  return (MODELS[k] = geo);
}
// lay a mesh on the drawn ground at (x, z) turned to `yaw` (radians about up), tilted with the slope
function setOnGround(m, w, x, z, yaw, tilt = true, lift = 0) {
  const e = 0.3, gy = groundAt(w, x, z);
  const up = tilt ? new THREE.Vector3(-(groundAt(w, x + e, z) - groundAt(w, x - e, z)), 2 * e, -(groundAt(w, x, z + e) - groundAt(w, x, z - e))).normalize() : UP;
  m.position.set(x, gy + lift - 0.006, z);
  m.quaternion.setFromUnitVectors(UP, up).multiply(new THREE.Quaternion().setFromAxisAngle(UP, yaw));
  m.updateMatrixWorld(true);
  return gy;
}
// the shared geometry of a prop stays when its notice's prop goes (tasks.removeProp)
function shared(m) { m.userData.shared = true; return m; }

// --- the items the kinds hand you -------------------------------------------------------------------------------------
// (the schema: name, an identity of 50 characters or less, the weight; the counter takes them back)
function drawBag(c, s) {
  c.save(); c.scale(s / 48, s / 48);
  c.fillStyle = '#d9d6cc'; c.strokeStyle = '#6f6a5c'; c.lineWidth = 1.6;
  c.beginPath(); c.moveTo(14, 18); c.quadraticCurveTo(8, 40, 16, 43); c.lineTo(33, 43); c.quadraticCurveTo(41, 40, 34, 18); c.closePath(); c.fill(); c.stroke();
  c.beginPath(); c.moveTo(18, 18); c.lineTo(22, 9); c.lineTo(26, 13); c.lineTo(30, 8); c.lineTo(31, 18); c.fillStyle = '#c9c5b9'; c.fill(); c.stroke();
  c.fillStyle = '#a9271f'; c.fillRect(19, 27, 9, 6); c.fillStyle = '#4f6a34'; c.fillRect(27, 31, 5, 8);
  c.restore();
}
function drawDisk(c, s) {
  c.save(); c.scale(s / 48, s / 48);
  c.strokeStyle = '#3a3a36'; c.lineWidth = 1.4;
  c.fillStyle = '#f3f1ea'; c.beginPath(); c.arc(24, 28, 15, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#1d1f22';
  for (const a of [0, Math.PI]) { c.beginPath(); c.moveTo(24, 28); c.arc(24, 28, 15, a, a + Math.PI / 2); c.closePath(); c.fill(); }
  c.beginPath(); c.arc(24, 28, 15, 0, Math.PI * 2); c.stroke();
  c.strokeStyle = '#b3893c'; c.lineWidth = 1.6; c.beginPath(); c.moveTo(24, 13); c.bezierCurveTo(22, 8, 30, 6, 33, 3); c.stroke();
  c.restore();
}
defineItem({ id: 'litter', name: 'Litter', short: 'Litter', kind: 'gear', w: 1, h: 1, kg: 0.15, stack: 8, price: 0, sold: false, identity: 'Packed out from a campsite', icon: 'litter', draw: drawBag });
defineItem({ id: 'secchi', name: 'Secchi disk', short: 'Secchi', kind: 'tool', w: 2, h: 2, kg: 0.6, stack: 1, price: 0, sold: false, identity: 'On loan from the lake monitoring program', icon: 'secchi', draw: drawDisk });

// =======================================================================================================================
// deadfall: a spruce across a named portage, cleared with the saw
const SAW = [
  { name: 'First cut', doing: 'Sawing through beside the trail', minutes: 7, seconds: 2.6 },
  { name: 'Second cut', doing: 'Sawing through on the far side', minutes: 7, seconds: 2.6 },
  { name: 'Off the trail', doing: 'Rolling the length off the trail', minutes: 3, seconds: 1.6 },
];
const DEADFALL = {
  titles: ['Blowdown on the portage', 'A tree across the trail', 'Saw work wanted'],
  whys: ['A Scout troop comes through on Thursday.', 'Two groups turned back at it already.', 'The trail crew is three portages behind.', 'A canoe won’t go over it, so folks are wading round through the brush.'],
};
const SHOW_R = 650;     // metres within which the blowdown is drawn
const LOG = { half: 2.4, r: 0.24, top: 0.5 };
function sawInReach() {
  const ch = ref('chores');
  if (ch && typeof ch.hasSaw === 'function') { try { return ch.hasSaw(); } catch { /* fall back */ } }
  const i = inv(); return i ? i.count('saw', { reachable: true }) > 0 : !!(ref('player') && ref('player').gear && ref('player').gear.saw);
}
registerKind('deadfall', {
  label: 'Trail crew', weight: { local: 0.45, medium: 0.6, far: 0.55 },
  make(T, c) {
    let cands = portageCands(T, c, 'deadfall', c.band === 'local' ? 20 : 35);
    if (!cands.length) return null;
    if (c.band === 'far' && cands.some((x) => x.p.rods >= 80)) cands = cands.filter((x) => x.p.rods >= 80);
    const sorted = c.band === 'far' ? cands.sort((a, b) => b.hops - a.hops || b.p.rods - a.p.rods) : cands.sort((a, b) => a.d - b.d);
    const cand = pickR(c.rng, sorted.slice(0, c.band === 'far' ? 6 : 10));
    const { p, near, hops, toName, fromName } = cand;
    // somewhere in the middle third of the carry, from the near end
    const pts = near === 0 ? p.pts : [...p.pts].reverse(), u = 0.33 + c.rng() * 0.34, a = along(pts, u);
    if (!a) return null;
    const way = u < 0.45 ? 'a third of the way over' : u > 0.55 ? 'two thirds of the way over' : 'halfway over';
    const sign = c.rng() < 0.5 ? `the ${district(c.ep)} trail crew` : 'the portage crew';
    const text = `A spruce came down across the ${p.rods}-rod portage from ${fromName} to ${toName}${hopsText(hops)}, ${way}. Bring a saw and clear it. ${pickR(c.rng, DEADFALL.whys)}`;
    const at = { x: Math.round(a.x * 10) / 10, z: Math.round(a.z * 10) / 10, dx: +a.dx.toFixed(3), dz: +a.dz.toFixed(3) };
    return { key: cand.i, portage: cand.i, rods: p.rods, hops, lakeId: p.launch[near].lake, to: toName, fromLake: fromName, at, cuts: 0, km: kmFrom(c.landing, at.x, at.z),
      title: pickR(c.rng, DEADFALL.titles), text, sign, hint: T.hintFor(p.launch[near].lake, at, `the portage to ${toName}`) };
  },
  pay(t) { return Math.min(PAY_MAX, 14 + Math.round((t.rods || 0) / 25) + Math.round(2 * (t.km || 0))); }, // (the survey's pay and a little more for the saw work)
  update(T, t) { placeDeadfall(T, t); },
  cleanup(T, t) { unblock(T, t); },
  target(T, t) {
    const a = t.at; if (!a) return undefined;
    // the portage is named in the notice: on a map that shows it, the blowdown is ringed on the trail
    if (T.known(a.x, a.z)) return { x: a.x, z: a.z, r: TIGHT, label: 'the blowdown', tight: true };
    return T.hintFor(t.lakeId, a, `the portage to ${t.to}`);
  },
  progress(t) { return t.cuts ? `${word(t.cuts)} of three done at the blowdown` : `the blowdown is across the ${t.rods}-rod portage`; },
  fraction(t) { return (t.cuts || 0) / SAW.length; },
  doneWords() { return 'the trail is clear'; },
});
// the trunk's two ends on the ground and its solid (the walker's box: tiles.dynamic) once its tile is in
function placeDeadfall(T, t) {
  const p = T.player, w = T.world, a = t.at;
  if (!a) return null;
  const d = Math.hypot(a.x - p.x, a.z - p.z);
  let m = T.props.get(t.id);
  if (!m) {
    if (d > SHOW_R || !w.isReady(a.x, a.z)) return null;
    // across the trail: the trunk's axis square to the trail's direction there, turned a little
    const rng = mulberry32(t.id * 131 + 7), skew = (rng() - 0.5) * 0.5, ax = -a.dz, az = a.dx;
    const ux = ax * Math.cos(skew) - az * Math.sin(skew), uz = ax * Math.sin(skew) + az * Math.cos(skew);
    const yaw = Math.atan2(-uz, ux);
    m = shared(meshOf(deadfallGeo(t.status === 'done', t.id), 'task blowdown'));
    // its underside on the higher of the ground under its middle and its two ends (it rests on its stubs)
    const gs = [-LOG.half, -LOG.half / 2, 0, LOG.half / 2, LOG.half].map((s) => groundAt(w, a.x + ux * s, a.z + uz * s));
    const g0 = Math.max(gs[2], (gs[0] + gs[4]) / 2, gs[1] - 0.05, gs[3] - 0.05);
    m.position.set(a.x, g0 + 0.04, a.z);
    m.quaternion.setFromAxisAngle(UP, yaw);
    m.updateMatrixWorld(true);
    m.userData.log = { ux, uz, y: g0, yaw };
    T.scene.add(m); T.props.set(t.id, m);
  }
  if (t.status !== 'done') block(T, t, m);
  state.near.deadfall = state.near.deadfall || (d < 10 ? t : null);
  return m;
}
function block(T, t, m) {
  const tiles = ref('tiles') || (T.world && T.world.tiles);
  if (!tiles || !m || !m.userData.log) return;
  const L = m.userData.log, list = tiles.dynamic || (tiles.dynamic = []);
  if (m.userData.obstacle && list.includes(m.userData.obstacle)) return;
  const ob = { x: t.at.x, z: t.at.z, box: true, ux: L.ux, uz: L.uz, hx: LOG.half, hz: LOG.r, top: L.y + 0.04 + LOG.r * 2 + 0.02, task: t.id };
  m.userData.obstacle = ob; list.push(ob);
}
function unblock(T, t) {
  const m = T.props.get(t.id), tiles = ref('tiles') || (T.world && T.world.tiles);
  const ob = m && m.userData.obstacle;
  if (!ob || !tiles || !tiles.dynamic) return;
  const i = tiles.dynamic.indexOf(ob);
  if (i >= 0) tiles.dynamic.splice(i, 1);
  m.userData.obstacle = null;
}
// hold E on the blowdown with the saw in reach: two cuts and the middle rolled off; let go and it waits at the last
function beginSaw(T, t, o = {}) {
  const p = T.player, at = Math.min(SAW.length, t.cuts || 0);
  const key = (o && o.key) || 'KeyE';
  return hold.begin({
    id: `deadfall:${t.id}`, label: 'Clearing the blowdown', phases: SAW, at, crouch: true, near: { x: p.x, z: p.z, r: 2.6 }, key, keys: [...new Set([key, 'Mouse0', ...((o && o.keys) || [])])],
    onPhase: (i) => { t.cuts = i + 1; T.changed(); },
    onDone: () => {
      t.cuts = SAW.length; t.status = 'done';
      unblock(T, t); T.removeProp(t.id); placeDeadfall(T, t); // the cut look, and the trail open
      // (the content join: a canoe set down across the log comes down onto the ground with it)
      const d = p.carry && p.carry.drop;
      if (d && typeof p.restHull === 'function' && Math.hypot(d.x - t.at.x, d.z - t.at.z) < 8) p.restHull(d.x, d.z, d.heading || 0);
      T.note(`The trail is clear. ${tell(T, t)}`);
      T.changed(); T.boardChanged();
    },
  });
}

// =======================================================================================================================
// litter: pack out what a party left at a named campsite
const LITTER_WORDS = {
  titles: ['Pack it out', 'A campsite left in a mess', 'Leave No Trace'],
  leads: [
    ['A party left their mess behind: cans, a bottle, a torn tarp, line in the brush. {lake}{hops}: {site}{dir}. Pack it all out.', 'the Forest Service, {district} district'],
    ['The last group left their trash at the site, and cans and glass aren’t even allowed in here. {lake}{hops}: {site}{dir}. Pack it out for us.', 'the wilderness ranger'],
    ['Somebody’s litter at a campsite, and the ranger is stretched thin. {lake}{hops}: {site}{dir}. Bring every scrap back out.', 'the counter'],
  ],
};
registerKind('litter', {
  label: 'Leave No Trace', weight: { local: 0.6, medium: 0.55, far: 0.4 },
  async make(T, c) {
    const pool = siteCands(T, c, 'litter').slice(0, 14);
    for (let k = 0; k < 4 && pool.length; k++) {
      const cand = pool.splice(Math.floor(c.rng() * pool.length), 1)[0], s = await readSite(T, c, cand);
      if (!s) continue;
      const [lead, sign] = pickR(c.rng, LITTER_WORDS.leads), n = c.band === 'local' ? 4 : c.band === 'medium' ? 5 : 6;
      const text = WORDS.fill(lead, { site: s.site, lake: cap(s.name), hops: hopsText(s.hops), dir: s.dir });
      return { key: cand.i, site: cand.i, lakeId: s.lakeId, feature: s.feature, hops: s.hops, need: n, got: 0, km: kmFrom(c.landing, cand.s.x, cand.s.z),
        title: pickR(c.rng, LITTER_WORDS.titles), text, sign: WORDS.fill(sign, { district: district(c.ep) }), hint: T.hintFor(s.lakeId, cand.s, AREA_LABEL[s.feature] || null) };
    }
    return null;
  },
  pay(t) { return Math.min(PAY_MAX, 12 + 4 * (t.hops ?? 1) + Math.round(1.5 * (t.km || 0))); },
  update(T, t) { placeLitter(T, t); },
  onClaim(T, t) { const i = inv(); if (i && t.got) { try { i.remove('litter', t.got); } catch { /* gone already */ } } },
  onDrop(T, t) { t.got = 0; if (Array.isArray(t.bits)) for (const b of t.bits) b.got = false; },
  target(T, t) { return siteRing(T, t); },
  progress(t) { const n = t.need || 4, g = t.got || 0; return g ? `${word(g)} of ${word(n)} pieces packed out` : `${word(n)} pieces of litter at the site`; },
  fraction(t) { return (t.got || 0) / (t.need || 4); },
  doneWords(t) { return `${word(t.got || t.need)} pieces packed out`; },
});
// the pieces where they lie: round the site on dry ground, kept once laid (t.bits)
function placeLitter(T, t) {
  const w = T.world, p = T.player, s = w.campsites[t.site];
  if (!s) return;
  const d = Math.hypot(s.x - p.x, s.z - p.z);
  if (d > 260 || !w.isReady(s.x, s.z)) return;
  if (!Array.isArray(t.bits)) {
    // round the fire ring, the tent pads and the landing (the site's layout, props.js, once its tile is built)
    const f = s.layout && s.layout.fire;
    if (!f) return;
    const rng = mulberry32(t.id * 7919 + 3), bits = [], tiles = ref('tiles');
    for (let k = 0; k < 160 && bits.length < (t.need || 4); k++) {
      const a = rng() * Math.PI * 2, r = 2.2 + rng() * 7, x = f.x + Math.cos(a) * r, z = f.z + Math.sin(a) * r;
      const sh = w.shoreAt(x, z);
      if (!(sh > 1.2) || bits.some((b) => Math.hypot(b.x - x, b.z - z) < 1.8)) continue;
      if (tiles && tiles.treesNear && tiles.treesNear(x, z, 1.1).length) continue; // in the open: not by a trunk, a rock, the ring or a bench
      bits.push({ k: LITTER_ORDER[bits.length % LITTER_ORDER.length], x: Math.round(x * 10) / 10, z: Math.round(z * 10) / 10, rot: +(rng() * 6.28).toFixed(2), got: false });
    }
    if (!bits.length) return;
    t.bits = bits; t.need = bits.length;
    T.changed();
  }
  let g = T.props.get(t.id);
  if (!g) {
    g = new THREE.Group(); g.name = 'task litter';
    t.bits.forEach((b, i) => {
      const m = shared(meshOf(litterGeo(b.k), `litter ${b.k}`));
      setOnGround(m, w, b.x, b.z, b.rot, true, 0);
      m.visible = !b.got; m.userData.bit = i;
      g.add(m);
    });
    T.scene.add(g); T.props.set(t.id, g);
  }
  if (t.bits.some((b) => !b.got && Math.hypot(b.x - p.x, b.z - p.z) < 7)) state.near.litter = t;
}
// is there room for a piece of litter: a stack of it with room, a place in a pack you carry, or a free hand
function litterRoom() {
  const i = inv(); if (!i) return true;
  try {
    const ok = (c) => c.item !== 'crate' && c.item !== 'pile' && !i.spec(c).one && !(itemDef(c.item) || {}).station;
    for (const c of i.reachable()) if (ok(c) && c.grid.some((e) => e.id === 'litter' && e.qty < 8)) return true;
    for (const c of i.reachable()) if (ok(c) && i.firstFit(c.id, 'litter')) return true;
    return i.freeHand() >= 0;
  } catch { return true; }
}
function pickLitter(T, t, k) {
  const b = t.bits && t.bits[k];
  if (!b || b.got || t.status !== 'open') return false;
  const i = inv();
  if (i) {
    let r = i.place('litter', 1, {});
    if (!r || !r.ok) r = i.toHandNew('litter');
    if (!r || r.ok === false) { T.note('No room for it: a pack on your back, or a free hand.'); return false; }
  }
  b.got = true; t.got = t.bits.filter((x) => x.got).length;
  const g = T.props.get(t.id); if (g) for (const m of g.children) if (m.userData.bit === k) m.visible = false;
  const left = (t.need || t.bits.length) - t.got;
  if (left <= 0) { t.status = 'done'; T.note(`That’s the lot packed out. Bring it back to ${backTo(T, t)}.`); }
  else T.note(`Packed out: ${LITTER[b.k] ? LITTER[b.k].label : 'litter'}. ${cap(word(left))} more ${plural(left, 'piece')}.`);
  if (T.audio && typeof T.audio.paddleDip === 'function') T.audio.paddleDip();
  T.changed(); T.boardChanged();
  return true;
}

// =======================================================================================================================
// secchi: a clarity reading at a named lake's deep spot, for the Citizen Lake Monitoring Program
const SECCHI = [
  { name: 'Over the side', doing: 'Over the shady side', minutes: 1, seconds: 1.0 },
  { name: 'Gone', doing: 'Lowering it', minutes: 3, seconds: 3.2 },
  { name: 'Back in sight', doing: 'Raising it slowly', minutes: 2, seconds: 2.0 },
  { name: 'Noted', doing: 'Reading the marks on the line', minutes: 1, seconds: 1.0 },
];
const STATION_R = 170;   // metres from the deep spot that are the station
const HOURS = [10, 16];  // the program's window: the sun high
const SECCHI_WORDS = {
  titles: ['A Secchi reading', 'Lake clarity wanted', 'For the lake monitors'],
  texts: [
    ['The lake monitoring program wants a Secchi reading on {lake}{hops}. We lend the disk. Out at the deep spot, {d} m, lower it till it’s gone. Between ten and four.', 'the Citizen Lake Monitoring Program'],
    ['The state’s lake monitors want a clarity reading on {lake}{hops}. The disk is on loan from us: the deep spot, {d} m of water, between ten and four, and sit still.', 'MPCA lake monitoring, by letter'],
  ],
};
registerKind('secchi', {
  label: 'Lake monitoring', weight: { local: 0.45, medium: 0.5, far: 0.35 },
  async make(T, c) {
    const w = T.world, L = c.landing, band = BAND[c.band], cands = [];
    for (const l of w.lakes) {
      if (!l || !l.name || l.cells < 3000 || l.river || l.creek || /\b(River|Creek)\b/.test(l.name) || T.used('secchi', l.id)) continue;
      if (Math.abs(l.cx - L.x) > RANGE || Math.abs(l.cz - L.z) > RANGE) continue;
      const d = Math.hypot(l.cx - L.x, l.cz - L.z), h = hopsOf(T, c, l.id);
      if (d <= rangeOf(c.band) && inBand(h, band)) cands.push({ l, d, h });
    }
    const pool = (c.band === 'far' ? cands.sort((a, b) => b.h - a.h || a.d - b.d) : cands.sort((a, b) => a.d - b.d)).slice(0, 10);
    for (let k = 0; k < 4 && pool.length; k++) {
      const cand = pool.splice(Math.floor(c.rng() * pool.length), 1)[0], l = cand.l;
      const st = await deepSpot(T, l);
      if (!st || st.depth < Math.max(4, (l.secchi || 2.6) + 1.2)) continue;
      const [say, sign] = pickR(c.rng, SECCHI_WORDS.texts);
      const text = WORDS.fill(say, { lake: l.name, hops: hopsText(cand.h), d: Math.round(st.depth) });
      return { key: l.id, lakeId: l.id, station: st, hops: cand.h, km: kmFrom(L, st.x, st.z), title: pickR(c.rng, SECCHI_WORDS.titles), text, sign };
    }
    return null;
  },
  pay(t) { return Math.min(50, 14 + Math.round(2 * (t.km || 0))); },
  onTake(T, t) {
    const i = inv(); if (!i) return;
    if (i.count('secchi', { reachable: false }) > 0) return;
    try {
      if (i.give('secchi')) {
        t.lent = true;
        // (the content join: with the packs full it went to Keeping without a word, and a player paddled off without it)
        const h = i.find('secchi', { reachable: false })[0], kept = !!(h && h.c && (h.c.item === 'crate' || h.c.where === 'stash'));
        T.note(`The keeper lends you the Secchi disk on its marked line.${kept ? ' No room on you: it waits in Keeping (I).' : ''}`);
      }
    } catch (e) { console.warn('secchi: lend', e); }
  },
  onDrop(T, t) { const i = inv(); if (i && t.lent) { try { if (i.remove('secchi', 1)) T.note('You hand the Secchi disk back.'); } catch { /* gone */ } } t.lent = false; },
  onClaim(T, t) { const i = inv(); if (i && t.lent) { try { i.remove('secchi', 1); } catch { /* gone */ } } },
  update(T, t) { atStation(T, t); },
  use(T, t) { return beginSecchi(T, t); },
  target(T, t) { const s = t.station; return s ? { x: s.x, z: s.z, r: STATION_R, label: `the deep spot, ${Math.round(s.depth)} m`, tight: true } : undefined; },
  progress(t) { return t.reading ? `${t.reading.toFixed(1)} m` : 'no reading yet'; },
  doneWords(t) { return t.reading ? `${t.reading.toFixed(1)} m` : ''; },
});
// the deepest water of a lake in the tile under its middle (the sounding the program reads at)
async function deepSpot(T, l) {
  const tg = await T.peek(l.cx, l.cz);
  if (!tg) return null;
  let best = null;
  const S = tg.side;
  for (let j = 0; j < S; j += 2) for (let i = 0; i < S; i += 2) {
    if (tg.lake[j * S + i] !== l.id) continue;
    const x = tg.cellX(tg.i0 + i), z = tg.cellZ(tg.j0 + j), d = tg.levelAt(x, z) - tg.heightAt(x, z);
    if (tg.shoreAt(x, z) > -25) continue; // off the shore, out on open water
    if (!best || d > best.depth) best = { x: Math.round(x), z: Math.round(z), depth: +d.toFixed(1) };
  }
  return best;
}
// at the station: the line for what is missing, or E held to lower the disk
function atStation(T, t) {
  const p = T.player, s = t.station;
  if (!s || p.mode !== 'paddle' || p.landing || p.teleporting || hold.active) return;
  const d = Math.hypot(s.x - p.x, s.z - p.z);
  if (d > STATION_R || !sameLake(T, lakeHere(T), t.lakeId)) return;
  state.near.secchi = t;
  const i = inv(), disk = !i || i.count('secchi', { reachable: true }) > 0, h = T.day ? T.day.hours : 12;
  const why = !disk ? 'the disk' : h < HOURS[0] || h >= HOURS[1] ? '10 am to 4 pm' : Math.abs(p.speed || 0) > 0.6 ? 'sit still' : null;
  if (why) { if (!p.prompt) p.prompt = { key: null, text: `The deep spot · ${why}` }; return; }
  p.prompt = { key: 'E', text: 'Lower the Secchi disk · hold' };
  T.inReach = t;
  // E already held down while the canoe came to rest: it goes on from here, no second press wanted
  if (p.input && p.input.down && p.input.down.has('KeyE') && !p.input.paused) beginSecchi(T, t);
}
// the disk on its marked line over the side, drawn while it is read (the water hides it once it is down a little)
let diskProp = null;
function diskRig(T) {
  if (diskProp) return diskProp;
  const b = new PropBuilder(), white = C(0xf2f0e8), black = C(0x1c1e21), n = 16, R = 0.1;
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2, col = Math.floor((i / n) * 4) % 2 ? black : white;
    const p0 = V(Math.cos(a0) * R, 0.012, Math.sin(a0) * R), p1 = V(Math.cos(a1) * R, 0.012, Math.sin(a1) * R);
    b.face([V(0, 0.012, 0), p0, p1], TILE.PAINT, col, { ref: V(0, -1, 0) });
    b.face([V(0, 0, 0), V(p1.x, 0, p1.z), V(p0.x, 0, p0.z)], TILE.PAINT, col, { ref: V(0, 1, 0) });
    b.face([V(p0.x, 0, p0.z), V(p1.x, 0, p1.z), p1, p0], TILE.METAL, C(0x8a8c88), { ref: V(0, 0.006, 0) });
  }
  b.cyl(V(0, 0.012, 0), V(0, 0.05, 0), 0.006, 0.004, 5, TILE.METAL, C(0x8a8c88), {});
  const disk = meshOf(b.build(), 'secchi disk');
  const lb = new PropBuilder();
  lb.cyl(V(0, 0, 0), V(0, 1, 0), 0.0065, 0.0065, 5, TILE.ROPE, C(0xd8c48e), {});
  const line = meshOf(lb.build(), 'secchi line');
  line.castShadow = false;
  diskProp = new THREE.Group(); diskProp.name = 'task secchi disk'; diskProp.add(disk, line); diskProp.visible = false;
  diskProp.userData = { disk, line };
  T.scene.add(diskProp);
  return diskProp;
}
// the disk at `down` metres under the water (negative: above it), on the canoe's right side by the stern seat
function poseDisk(T, down) {
  const g = diskRig(T), p = T.player, h = p.heading || 0, fx = Math.cos(h), fz = -Math.sin(h), rx = Math.sin(h), rz = Math.cos(h);
  const lv = T.world.levelAt(p.x, p.z), x = p.x + fx * -0.62 + rx * 0.6, z = p.z + fz * -0.62 + rz * 0.6;
  const hand = new THREE.Vector3(p.x + fx * -0.85 + rx * 0.4, lv + 0.5, p.z + fz * -0.85 + rz * 0.4);
  const { disk, line } = g.userData;
  disk.position.set(x, lv - down, z); disk.rotation.set(0, h, down > 0.05 ? 0 : 0.2);
  disk.visible = down < 1.2; // (lost to the water's own colour past a metre)
  const top = hand, bot = new THREE.Vector3(x, lv - Math.max(0, Math.min(down, 1.2)) + 0.05, z), d = top.clone().sub(bot);
  line.position.copy(bot); line.scale.set(1, Math.max(0.01, d.length()), 1);
  line.quaternion.setFromUnitVectors(UP, d.normalize());
  g.visible = true;
  g.traverse((o) => o.updateMatrixWorld && o.updateMatrixWorld(true));
}
function beginSecchi(T, t) {
  const p = T.player, l = T.lakeRec(t.lakeId), s0 = (l && l.secchi) || 2.6;
  // a chop and a grey sky cut the reading a little (the program asks for calm and sun)
  const wind = ref('wind'), wx = wind && Number.isFinite(wind.speed) ? wind.speed : 3, weather = ref('weather');
  const k = (wx > 6 ? 0.92 : wx > 4 ? 0.96 : 1) * (weather && weather.rain > 0.2 ? 0.95 : 1);
  const gone = +(s0 * k * 1.04).toFixed(1), back = +(s0 * k * 0.96).toFixed(1);
  const phases = SECCHI.map((ph) => ({ ...ph }));
  return hold.begin({
    id: `secchi:${t.id}`, label: 'The Secchi disk', phases, at: 0, still: true, near: { x: p.x, z: p.z, r: 10 }, key: 'KeyE', keys: ['KeyE', 'Mouse0'],
    onTick: (at, j) => {
      const i = Math.min(j.phases.length - 1, Math.floor(at + 1e-9)), f = at - i;
      if (i === 0) poseDisk(T, -0.4 * (1 - f));
      else if (i === 1) { j.phases[1].doing = `Down ${(gone * f).toFixed(1)} m`; poseDisk(T, gone * f); }
      else if (i === 2) { j.phases[1].doing = `Gone at ${gone.toFixed(1)} m`; j.phases[2].doing = `Up to ${(gone - (gone - back) * f).toFixed(1)} m`; poseDisk(T, gone - (gone - back) * f); }
      else if (i === 3) { j.phases[2].doing = `In sight at ${back.toFixed(1)} m`; poseDisk(T, back * (1 - f) - 0.35 * f); }
    },
    onStop: () => { if (diskProp) diskProp.visible = false; },
    onDone: () => {
      if (diskProp) diskProp.visible = false;
      t.reading = Math.round(((gone + back) / 2) * 10) / 10; t.status = 'done';
      T.note(`Gone at ${gone.toFixed(1)} m, back in sight at ${back.toFixed(1)}: ${t.reading.toFixed(1)} m on ${T.lakeName(t.lakeId) || 'the lake'}. Take it to ${backTo(T, t)}.`);
      T.changed(); T.boardChanged();
    },
  });
}

// =======================================================================================================================
// loons: the DNR's midsummer count on a named lake
const LOON_SEASON = [152, 243];   // June to August (the count is in July)
const LOON_R = 120;               // metres within which a loon is counted
const DWELL = 1.0;                // real seconds a loon is kept ahead in the view
// of the half field of view: ahead of you, the middle third across and anywhere up and down the frame (from the canoe
// the third-person view looks down on the hull, and a loon out on the water sits up by the far shore)
const MIDDLE = { u: 0.34, v: 0.96 };
const LOON_WORDS = {
  titles: ['The loon count', 'Loons on {lake}', 'Count the loons'],
  texts: [
    ['The midsummer loon count: how many on {lake}{hops}? Paddle it slow and turn toward each one you see. {need} or more, and note any chicks.', 'the DNR loon count'],
    ['Loons for the state’s count on {lake}{hops}: {n} at least, chicks noted. Go quiet and give the nesting islands room.', 'Minnesota Loon Monitoring, by letter'],
  ],
};
registerKind('loons', {
  label: 'Loon count', weight: { local: 0.4, medium: 0.45, far: 0.3 },
  make(T, c) {
    const doy = T.day ? T.day.doy : 190;
    if (doy < LOON_SEASON[0] || doy > LOON_SEASON[1]) return null;
    const w = T.world, L = c.landing, band = BAND[c.band], cands = [];
    for (const l of w.lakes) {
      if (!l || !l.name || l.cells < 5000 || l.river || /\b(River|Creek)\b/.test(l.name) || T.used('loons', l.id)) continue;
      if (Math.abs(l.cx - L.x) > RANGE || Math.abs(l.cz - L.z) > RANGE) continue;
      const d = Math.hypot(l.cx - L.x, l.cz - L.z), h = hopsOf(T, c, l.id);
      if (d <= rangeOf(c.band) && inBand(h, band)) cands.push({ l, d, h });
    }
    if (!cands.length) return null;
    const cand = pickR(c.rng, cands.sort((a, b) => (c.band === 'far' ? b.h - a.h : 0) || a.d - b.d).slice(0, 8)), l = cand.l;
    const need = c.band === 'local' ? 3 : 4, [say, sign] = pickR(c.rng, LOON_WORDS.texts);
    return { key: l.id, lakeId: l.id, hops: cand.h, need, got: 0, chicks: 0, km: kmFrom(L, l.cx, l.cz),
      title: WORDS.fill(pickR(c.rng, LOON_WORDS.titles), { lake: l.name }), text: WORDS.fill(say, { lake: l.name, hops: hopsText(cand.h), need: cap(word(need)), n: word(need) }), sign, hint: T.hintFor(l.id, null, 'the loon count') };
  },
  pay(t) { return Math.min(45, 12 + Math.round(1.5 * (t.km || 0))); },
  update(T, t, dt) { countLoons(T, t, dt); },
  onDrop(T, t) { t.got = 0; t.chicks = 0; TRANSIENT.delete(t.id); },
  target(T, t) { return T.hintFor(t.lakeId, null, 'the loon count'); },
  progress(t) { const n = t.need || 4, g = t.got || 0; return g ? `${word(g)} of ${word(n)} loons counted${t.chicks ? `, ${word(t.chicks)} ${plural(t.chicks, 'chick')}` : ''}` : `${word(n)} loons to count`; },
  fraction(t) { return (t.got || 0) / (t.need || 4); },
  doneWords(t) { return `${word(t.got || 0)} loons${t.chicks ? `, ${word(t.chicks)} ${plural(t.chicks, 'chick')}` : ''}`; },
});
const _inv = new THREE.Matrix4(), _q = new THREE.Vector3(), _e = new THREE.Vector3();
// a loon's own count key: its slot and how many times it has been laid out again (loons.js re-lays a far group ahead)
function loonKey(l) {
  const s = state.seen.get(l.i) || { x: l.x, z: l.z, n: 0, alive: l.alive };
  if (!s.alive && l.alive) s.n++;
  else if (Math.hypot(l.x - s.x, l.z - s.z) > 60) s.n++;
  s.x = l.x; s.z = l.z; s.alive = l.alive; state.seen.set(l.i, s);
  return `${l.i}:${s.n}`;
}
// in the middle of the view, near enough and not behind the land: { u, v, d } or null
function inMiddle(cam, w, x, y, z) {
  _q.set(x, y, z).applyMatrix4(_inv);
  if (_q.z > -2) return null;
  const tanV = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)), tanH = tanV * (cam.aspect || 1.6);
  const u = _q.x / -_q.z / tanH, v = _q.y / -_q.z / tanV;
  _e.setFromMatrixPosition(cam.matrixWorld);
  const d = Math.hypot(x - _e.x, z - _e.z);
  for (let i = 1; i < 12; i++) { const f = i / 12; if (w.heightAt(_e.x + (x - _e.x) * f, _e.z + (z - _e.z) * f) > _e.y + (y - _e.y) * f + 0.3) return { u, v, d, hidden: true }; }
  return { u, v, d, hidden: false };
}
function countLoons(T, t, dt = 1 / 60) {
  const p = T.player, w = T.world, cam = ref('camera'), L = ref('loons');
  const q = tr(t);
  if (!cam || !L || !L.loons || !sameLake(T, lakeHere(T), t.lakeId) || p.teleporting) { q.dwell = null; return; }
  const dtR = Math.min(0.25, dt || 0); // the frame's own seconds
  cam.updateMatrixWorld(); _inv.copy(cam.matrixWorld).invert();
  const keys = q.keys;
  let best = null, seenAny = false;
  for (const l of L.loons) {
    if (!l.alive || l.state === 'under') { loonKey(l); continue; }
    const k = loonKey(l), d0 = Math.hypot(l.x - p.x, l.z - p.z);
    if (d0 > LOON_R || !sameLake(T, w.lakeIdAt(l.x, l.z), t.lakeId)) continue;
    const at = inMiddle(cam, w, l.x, (l.level || 0) + 0.2, l.z);
    if (!at || at.hidden) continue;
    if (Math.abs(at.u) <= 1 && Math.abs(at.v) <= 1) seenAny = true;
    if (keys.includes(k) || Math.abs(at.u) > MIDDLE.u || Math.abs(at.v) > MIDDLE.v) continue;
    if (!best || at.u * at.u + at.v * at.v < best.m) best = { l, k, m: at.u * at.u + at.v * at.v };
  }
  if (seenAny) state.near.loons = t;
  if (!best) { q.dwell = null; return; }
  if (!q.dwell || q.dwell.k !== best.k) q.dwell = { k: best.k, s: 0 };
  q.dwell.s += dtR;
  if (!p.prompt && q.dwell.s > 0.15) p.prompt = { key: null, text: 'A loon · counting' };
  if (q.dwell.s < DWELL) return;
  keys.push(best.k); if (keys.length > 24) keys.splice(0, keys.length - 24);
  t.got = (t.got || 0) + 1; q.dwell = null;
  const ch = best.l.chick >= 0 && L.chicks && L.chicks[best.l.chick] && L.chicks[best.l.chick].alive;
  if (ch) t.chicks = (t.chicks || 0) + 1;
  const n = t.need || 4, lake = T.lakeName(t.lakeId) || 'the lake';
  if (t.got >= n) { t.status = 'done'; T.note(`${cap(word(t.got))} loons on ${lake}${t.chicks ? `, and ${word(t.chicks)} ${plural(t.chicks, 'chick')}` : ''}. Take the count to ${backTo(T, t)}.`); }
  else T.note(`A loon${ch ? ' with a chick' : ''}: ${word(t.got)} of ${word(n)} counted on ${lake}.`);
  T.changed(); T.boardChanged();
}

// =======================================================================================================================
// report: a named chain of lakes paddled, portage by portage, and how it went
const REPORT_WORDS = {
  titles: ['A route report', 'Word from up the chain', 'How’s the route?'],
  whys: ['A family books it next week.', 'The route board by the door is due a new page.', 'We haven’t had word from that way in a fortnight.', 'Somebody said the beavers have the water up.'],
};
// the named lakes joined by a portage, by lake id (cached per world)
const LINKS = new WeakMap();
function lakeLinks(T) {
  const w = T.world;
  let m = LINKS.get(w);
  if (m) return m;
  m = new Map();
  w.portages.forEach((p, i) => {
    const a = p.launch[0].lake, b = p.launch[1].lake, na = T.lakeName(a), nb = T.lakeName(b);
    if (!a || !b || !na || !nb || na === nb) return;
    for (const [x, y] of [[a, b], [b, a]]) { if (!m.has(x)) m.set(x, []); if (!m.get(x).some((e) => T.lakeName(e.to) === T.lakeName(y))) m.get(x).push({ to: y, portage: i, rods: p.rods }); }
  });
  LINKS.set(w, m);
  return m;
}
const listWords = (names) => (names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`);
registerKind('report', {
  label: 'Route report', weight: { local: 0.3, medium: 0.5, far: 0.55 },
  make(T, c) {
    const links = lakeLinks(T), start = c.landing.lake, n = c.band === 'local' ? 2 : c.band === 'medium' ? 3 : 4;
    if (!start || !T.lakeName(start)) return null;
    // a walk out from the landing's lake, a lake a portage, never back on a name already on it (a few tries)
    let route = null;
    for (let tries = 0; tries < 8 && !route; tries++) {
      const names = new Set([T.lakeName(start)]), out = [];
      let at = start;
      while (out.length < n) {
        const next = (links.get(at) || []).filter((e) => !names.has(T.lakeName(e.to)));
        if (!next.length) break;
        const e = pickR(c.rng, next); names.add(T.lakeName(e.to)); out.push(e); at = e.to;
      }
      if (out.length >= Math.max(2, n - 1) && !T.used('report', out.map((e) => e.to).join('>'))) route = out;
    }
    if (!route) return null;
    const lakes = route.map((e) => { const l = T.lakeRec(e.to); return { id: e.to, name: T.lakeName(e.to), x: Math.round(l ? l.cx : 0), z: Math.round(l ? l.cz : 0), rods: e.rods, seen: false }; });
    let km = 0, px = c.landing.x, pz = c.landing.z;
    for (const l of lakes) { km += Math.hypot(l.x - px, l.z - pz) / 1000; px = l.x; pz = l.z; }
    const names = lakes.map((l) => l.name), longest = Math.max(...lakes.map((l) => l.rods || 0));
    const text = `From ${T.lakeName(start)}, paddle on by ${listWords(names)}: ${word(lakes.length)} ${plural(lakes.length, 'portage')}, the longest ${longest} rods. Tell us how it is: the water, the carries, the sites taken. ${pickR(c.rng, REPORT_WORDS.whys)}`;
    return { key: lakes.map((l) => l.id).join('>'), lakeId: lakes[0].id, route: lakes, km: +km.toFixed(1), title: pickR(c.rng, REPORT_WORDS.titles), text, sign: c.rng() < 0.5 ? 'the route board' : 'the trip planner by the door' };
  },
  pay(t) { return Math.min(PAY_MAX, 8 + 3 * (t.route ? t.route.length : 2) + Math.round(1.2 * (t.km || 0))); },
  update(T, t) { onRoute(T, t); },
  onDrop(T, t) { if (t.route) for (const l of t.route) l.seen = false; },
  targets(T, t) { return (t.route || []).filter((l) => !l.seen).map((l) => ringFor(T, l)); },
  target(T, t) { const l = (t.route || []).find((x) => !x.seen); return l ? ringFor(T, l) : null; },
  progress(t) { const left = (t.route || []).filter((l) => !l.seen).map((l) => l.name); return left.length ? `${listWords(left)} to go` : 'the route paddled'; },
  fraction(t) { const r = t.route || []; return r.length ? r.filter((l) => l.seen).length / r.length : 0; },
  doneWords() { return 'the route paddled'; },
});
function ringFor(T, l) { const rec = T.lakeRec(l.id), lakeR = rec ? Math.sqrt((rec.cells * 100) / Math.PI) : 500; return { x: l.x, z: l.z, r: Math.round(clamp(lakeR * 0.7, 300, AREA[1])), label: l.name }; }
function onRoute(T, t) {
  const p = T.player, now = nowS(), q = tr(t);
  if ((q.lookT || 0) > now || !(p.mode === 'paddle' || p.mode === 'swim') || p.teleporting) return;
  q.lookT = now + 0.5;
  const here = T.world.lakeIdAt(p.x, p.z); if (!here) return;
  const name = T.lakeName(here), l = (t.route || []).find((x) => !x.seen && (x.id === here || (name && x.name === name && T.basinOf(x.id) === T.basinOf(here))));
  if (!l) return;
  l.seen = true;
  const left = t.route.filter((x) => !x.seen).map((x) => x.name);
  if (!left.length) { t.status = 'done'; T.note(`${l.name}: that’s the route. ${tell(T, t, 'how it went')}`); }
  else T.note(`${l.name}: noted for the report. ${listWords(left)} to go.`);
  T.changed(); T.boardChanged();
}

// =======================================================================================================================
// canoe: a rental left turned over at a named campsite; find it and read its number
const CANOE_WORDS = {
  titles: ['A rental left behind', 'Missing: one canoe', 'Our canoe, somewhere on {lake}'],
  leads: [
    ['One of our rentals never came home: {canoe}, number {n}. Its party came out early with another group and left it pulled up. {lake}{hops}: {site}{dir}, they think. Find it and read me the number on the bow.', 'the rental desk'],
    ['{Canoe}, number {n}, left turned over on the shore when its party hitched a ride out with friends. {lake}{hops}: {site}{dir}, near enough. Find it so we can fetch it.', 'the counter'],
  ],
};
registerKind('canoe', {
  label: 'Lost and found', weight: { local: 0.3, medium: 0.45, far: 0.5 },
  async make(T, c) {
    const pool = siteCands(T, c, 'canoe').slice(0, 14);
    for (let k = 0; k < 4 && pool.length; k++) {
      const cand = pool.splice(Math.floor(c.rng() * pool.length), 1)[0], s = await readSite(T, c, cand);
      if (!s) continue;
      const spot = shoreSpot(s.tg, cand.s.x, cand.s.z, false);
      if (!spot) continue;
      const make = c.rng() < 0.55 ? 'grumman' : 'wenonah', n = 3 + Math.floor(c.rng() * 38), [lead, sign] = pickR(c.rng, CANOE_WORDS.leads);
      const text = WORDS.fill(lead, { canoe: HULLS[make].words, Canoe: cap(HULLS[make].words), n, site: s.site, lake: cap(s.name), hops: hopsText(s.hops), dir: s.dir });
      return { key: cand.i, site: cand.i, lakeId: s.lakeId, feature: s.feature, hops: s.hops, make, number: n, at: spot, km: kmFrom(c.landing, spot.x, spot.z),
        title: WORDS.fill(pickR(c.rng, CANOE_WORDS.titles), { lake: s.name }), text, sign, hint: T.hintFor(s.lakeId, cand.s, AREA_LABEL[s.feature] || null) };
    }
    return null;
  },
  pay(t) { return Math.min(PAY_MAX, 15 + 5 * (t.hops ?? 1) + Math.round(1.5 * (t.km || 0))); },
  update(T, t) { placeCanoe(T, t); },
  use(T, t) { return foundCanoe(T, t); },
  // the stretch of shore the party remembers, never the spot (it is found by looking)
  target(T, t) { const s = T.world.campsites[t.site]; return s ? (t.feature === 'island' ? { x: s.x, z: s.z, r: 260, label: 'the island', tight: false } : T.hintFor(t.lakeId, s, AREA_LABEL[t.feature] || null)) : undefined; },
  progress(t) { return `the ${HULLS[t.make] ? HULLS[t.make].short : 'canoe'} is still out there`; },
  doneWords(t) { return `${HULLS[t.make] ? HULLS[t.make].short : 'canoe'} ${t.number} found`; },
});
// the hull turned over a couple of metres up the bank from where the canoes pull up, its bow to the water
function placeCanoe(T, t) {
  const p = T.player, w = T.world, a = t.at;
  if (!a) return;
  const d = Math.hypot(a.x - p.x, a.z - p.z);
  let m = T.props.get(t.id);
  if (!m) {
    if (d > 900 || !w.isReady(a.x, a.z)) return;
    // up the bank: away from the water by the shore's own gradient, along the shore to the first clear stretch (no rock,
    // trunk or ring under the hull)
    const up = (x, z) => { const e = 0.6, gx = w.shoreAt(x + e, z) - w.shoreAt(x - e, z), gz = w.shoreAt(x, z + e) - w.shoreAt(x, z - e), n = Math.hypot(gx, gz) || 1; return { x: gx / n, z: gz / n }; };
    const tiles = ref('tiles'), u0 = up(a.x, a.z);
    let x = a.x, z = a.z;
    for (const k of [0, 1.6, -1.6, 3.2, -3.2, 4.8, -4.8, 6.4, -6.4]) {
      let cx = a.x - u0.z * k, cz = a.z + u0.x * k;
      for (let j = 0; j < 10 && w.shoreAt(cx, cz) < 2.4; j++) { const d = up(cx, cz); cx += d.x * 0.4; cz += d.z * 0.4; }
      if (w.shoreAt(cx, cz) < 1.5) continue;
      if (tiles && tiles.treesNear && tiles.treesNear(cx, cz, 2.3).some((o) => o.shape || o.box || (o.r || 0) > 0.05)) continue;
      x = cx; z = cz; break;
    }
    const g0 = up(x, z), gx = g0.x, gz = g0.z;
    const yaw = Math.atan2(gz, -gx) + 0.35; // pulled straight up the bank, a little skew
    m = shared(meshOf(hullGeo(t.make), 'task rental canoe'));
    setOnGround(m, w, x, z, yaw, true, 0);
    m.userData.spot = { x, z, yaw };
    T.scene.add(m); T.props.set(t.id, m);
  }
  const s = m.userData.spot;
  // from the canoe, near enough to read: E (tasks.before takes it ahead of "Go ashore")
  if (s && p.mode === 'paddle' && !p.landing && !p.teleporting && Math.hypot(s.x - p.x, s.z - p.z) < 9) {
    p.prompt = { key: 'E', text: `Read the number · the ${HULLS[t.make] ? HULLS[t.make].short : 'canoe'}` };
    T.inReach = t;
  }
}
function foundCanoe(T, t) {
  if (t.status !== 'open') return false;
  t.status = 'done'; t.found = T.today();
  T.note(`${cap(HULLS[t.make] ? HULLS[t.make].words : 'a canoe')}, number ${t.number}: theirs. ${tell(T, t, 'where it lies')}`);
  T.changed(); T.boardChanged();
  return true;
}

// =======================================================================================================================
// lunch: fish for the shore lunch class. As the fish notices (the owner, 2026-10-31): the fish are kept like any
// other and handed over at the board that posted it (tasks.js handIn), into its cooler there
const LUNCH_WORDS = {
  titles: ['Fish for the shore lunch', 'The shore lunch class', 'Shore lunch on Saturday'],
  texts: [
    ['Shore lunch class on Saturday: {n} {fish} for the pan, any size, kept cold. The guests learn to fillet them on the rock.', 'the guide shack'],
    ['{N} {fish} for the shore lunch the guides cook out on the point. Any size; keep them, and keep them cold.', 'Deb, in the café'],
  ],
};
const LUNCH_FISH = ['walleye', 'walleye', 'perch', 'smallmouth'];
const plFish = (sp, n) => (n === 1 ? fishName(sp) : sp === 'perch' ? 'perch' : sp === 'walleye' ? 'walleye' : `${fishName(sp)}`);
registerKind('lunch', {
  label: 'For the kitchen', weight: { local: 0.45, medium: 0.4, far: 0 }, handsIn: true,
  make(T, c) {
    const held = new Set(c.board.map((t) => t && (t.kind === 'lunch' || t.kind === 'fish') && t.species).filter(Boolean));
    const sp = pickR(c.rng, LUNCH_FISH.filter((s) => !held.has(s))) || 'perch';
    const n = c.band === 'local' ? 2 : 3, [say, sign] = pickR(c.rng, LUNCH_WORDS.texts);
    const text = WORDS.fill(say, { n: word(n), N: cap(word(n)), fish: plFish(sp, n) });
    const out = { species: sp, need: n, title: pickR(c.rng, LUNCH_WORDS.titles), text, sign };
    // the keeper's pencil: where they are biting (the outfitter's own hint for that fish, outfitters.js)
    const label = sp === 'walleye' ? 'walleye, at dusk' : sp === 'perch' ? 'perch, in the weeds' : 'smallmouth, on the rocks';
    try {
      const pr = outfitterProfile(c.ep, T.world), h = pr && pr.hints.find((x) => x.kind === sp);
      if (h) out.hint = { x: h.x, z: h.z, r: Math.min(AREA[1], h.r || 600), label };
    } catch { /* no profile */ }
    // else the lake close by where they are thickest this year (fishing.js's own abundance, as the keepers read it)
    if (!out.hint) {
      const L = c.landing, near = [];
      for (const l of T.world.lakes) {
        if (!l || !l.name || l.cells < 1000 || l.river || Math.abs(l.cx - L.x) > 8000 || Math.abs(l.cz - L.z) > 8000) continue;
        const h = hopsOf(T, c, l.id); if (h == null || h > 1) continue;
        near.push({ l, d: Math.hypot(l.cx - L.x, l.cz - L.z) });
      }
      const best = near.sort((a, b) => a.d - b.d).slice(0, 6).sort((a, b) => abundanceOf(b.l.id, sp, b.l.cells) - abundanceOf(a.l.id, sp, a.l.cells))[0];
      if (best) out.hint = T.hintFor(best.l.id, null, label);
    }
    return out;
  },
  pay(t) { return Math.min(PAY_MAX, 4 + (t.need || 2) * Math.round(0.55 * (SPECIES_PAY[t.species] || 12))); },
  onTake(T, t) { t.cooler = []; },
  fits(T, t, ev) { return !!ev.kept && t.status === 'open' && (!t.species || t.species === ev.species); },
  target(T, t) { return t.hint && Number.isFinite(t.hint.x) ? { ...t.hint } : null; },
  progress(t) {
    const c = t.cooler || [], n = t.need || 2, f = t.status === 'open' ? fishWith(t) : null;
    const given = c.length ? `${word(c.length)} of ${word(n)} handed over` : '', have = f ? `${f.words} with you` : '';
    return [given, have].filter(Boolean).join(', ') || `${word(n)} ${plFish(t.species, n)} to catch and bring back`;
  },
  fraction(t) { const f = t.status === 'open' ? fishWith(t) : null; return Math.min(1, ((t.cooler || []).length + (f ? f.length * 0.5 : 0)) / (t.need || 2)); },
  doneWords(t) { return `${word((t.cooler || []).length)} handed over`; },
});

// =======================================================================================================================
// the dot (pointer.js) on foot: the blowdown (hold E with the saw), each piece of litter (E), the rental canoe (E)
export function taskKindTargets(tasks) {
  return (ray, near) => {
    if (!tasks || !tasks.active) return null;
    const out = [], w = tasks.world;
    for (const t of tasks.active) {
      if (t.status !== 'open') continue;
      const m = tasks.props.get(t.id);
      if (!m) continue;
      if (t.kind === 'deadfall' && m.userData.log && t.at) {
        const L = m.userData.log, a = t.at, y = L.y + 0.04 + LOG.r;
        // within reach of its nearest point
        const px = near.x - a.x, pz = near.z - a.z, s = clamp(px * L.ux + pz * L.uz, -LOG.half, LOG.half);
        if (Math.hypot(near.x - (a.x + L.ux * s), near.z - (a.z + L.uz * s)) > 2.4) continue;
        const hit = near.segment(a.x - L.ux * LOG.half, y, a.z - L.uz * LOG.half, a.x + L.ux * LOG.half, y, a.z + L.uz * LOG.half, LOG.r + 0.12);
        if (!hit) continue;
        const saw = sawInReach(), left = SAW.length - (t.cuts || 0);
        out.push({ dist: hit.t, miss: hit.miss, target: { kind: 'blowdown', ref: `task:${t.id}`, label: 'the blowdown', mesh: m,
          hint: t.cuts ? `${word(left)} ${plural(left, 'step')} left` : null,
          e: { verb: 'Saw through', held: true, why: saw ? null : 'Saw through: needs a saw',
            needs: [{ label: 'A saw in reach', done: saw, chip: 'saw', note: saw ? null : 'in a pack you carry, a hand, or the canoe beside you' }],
            next: saw ? '' : 'A folding saw ($18 at any outfitter), carried in a pack or a hand', run: (o) => beginSaw(tasks, t, o) } } });
      } else if (t.kind === 'litter' && Array.isArray(t.bits)) {
        for (const c of m.children) {
          const b = t.bits[c.userData.bit];
          if (!b || b.got || !c.visible || near.flat(b.x, b.z) > 3.2) continue; // (a little past the dot's 2.6: low on the ground, the third-person view can't look down on it closer)
          const hit = near.sphere(c.position.x, c.position.y + 0.05, c.position.z, b.k === 'tarp' ? 0.45 : 0.34); // (a can is small: a generous reach for the dot)
          if (!hit) continue;
          const room = litterRoom();
          out.push({ dist: hit.t, miss: hit.miss, target: { kind: 'item', ref: `litter:${t.id}:${c.userData.bit}`, label: LITTER[b.k] ? LITTER[b.k].label : 'litter', mesh: c,
            e: { verb: 'Pack it out', why: room ? null : 'Pack it out: no room', needs: [{ label: 'Room in a pack or a free hand', done: room, chip: 'no room' }], next: room ? '' : 'Put a pack on, or free a hand', run: () => pickLitter(tasks, t, c.userData.bit) } } });
        }
      } else if (t.kind === 'canoe' && m.userData.spot) {
        const s = m.userData.spot;
        if (near.flat(s.x, s.z) > 3.4) continue;
        const gy = groundAt(w, s.x, s.z), hit = near.box({ x: s.x, y: gy + 0.25, z: s.z, hx: 2.5, hy: 0.32, hz: 0.48, heading: s.yaw });
        if (!hit) continue;
        out.push({ dist: hit.t, miss: hit.miss, target: { kind: 'item', ref: `task:${t.id}`, label: `the ${HULLS[t.make] ? HULLS[t.make].short : 'canoe'}, turned over`, mesh: m, e: { verb: 'Read the number', run: () => foundCanoe(tasks, t) } } });
      }
    }
    return out;
  };
}

// =======================================================================================================================
// the first-time moments (hints.js): pushed onto its table, their triggers read here
const MINE = [
  { id: 'deadfall', prio: TEACH, recur: 'once', stuck: 45, text: 'Blowdown across the trail. With a saw in reach, hold {E} on it to clear it.' },
  { id: 'litter', prio: TEACH, recur: 'once', text: 'Litter left behind. {E} on each piece packs it out.' },
  { id: 'secchi', prio: TEACH, recur: 'once', stuck: 40, text: 'The deep spot. Sit still and hold {E} to lower the disk.' },
  { id: 'loons', prio: TEACH, recur: 'once', stuck: 50, text: 'Loons. Turn toward one and keep it ahead a moment to count it.' },
];
const DUE = {
  deadfall: () => {
    const t = state.near.deadfall; if (!t || t.status !== 'open') return false;
    const p = ref('player');
    if (p && p.mode === 'carry') return { lv: 1, text: 'Blowdown across the trail. Set the canoe down; a saw clears it, {E} held.' };
    if (!sawInReach()) return { lv: 1, text: 'Blowdown across the trail: a saw clears it. On foot, {Space} climbs over.' };
    return true;
  },
  litter: () => !!(state.near.litter && state.near.litter.status === 'open' && ref('player') && ref('player').mode === 'walk'),
  secchi: () => { const t = state.near.secchi; if (!t || t.status !== 'open') return false; const i = inv(); return !i || i.count('secchi', { reachable: true }) > 0 ? true : { lv: 1, text: 'The deep spot, and no disk in the canoe: it’s needed in reach.' }; },
  loons: () => !!(state.near.loons && state.near.loons.status === 'open'),
};

// --- wiring (main.js content A) -----------------------------------------------------------------------------------------
export function attachTaskKinds(o = {}) {
  Object.assign(G, o);
  const { tasks, pointer, hints } = o;
  if (pointer && typeof pointer.register === 'function' && tasks && !G.pointerOn) { G.pointerOn = true; pointer.register(taskKindTargets(tasks)); }
  // the moments: onto hints.js's table once, their triggers ahead of its own
  if (hints && !G.momentsOn) {
    G.momentsOn = true;
    if (typeof hints.addMoment === 'function') for (const m of MINE) hints.addMoment(m, DUE[m.id]);
    else {
      for (const m of MINE) if (!MOMENTS.some((x) => x.id === m.id)) MOMENTS.push(m);
      const due0 = hints.due.bind(hints);
      hints.due = (id, rec) => (DUE[id] ? DUE[id](rec) : due0(id, rec));
    }
  }
  // what is near, looked at afresh each frame: the kinds' update (tasks.update) sets it for the moments
  if (tasks && !G.frameOn) {
    G.frameOn = true;
    const upd = tasks.update.bind(tasks);
    tasks.update = (dt) => { state.near = {}; upd(dt); };
  }
  if (typeof window !== 'undefined' && window.__game) window.__game.taskKinds = { kinds: Object.keys(KIND_KEYS), state, models: MODELS, targets: tasks ? taskKindTargets(tasks) : null };
  return { kinds: KIND_KEYS };
}
export const KIND_KEYS = { deadfall: KINDS.deadfall, litter: KINDS.litter, secchi: KINDS.secchi, loons: KINDS.loons, report: KINDS.report, canoe: KINDS.canoe, lunch: KINDS.lunch };
void esc; void FISH;
