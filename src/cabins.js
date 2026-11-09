// A few cabins at the edge (round 4, stream C; docs/build/edge-and-roads.md, the owner's "yes"): private cabins and their
// docks on Burntside, White Iron, Vermilion and Gunflint, just past the Boundary Waters' line, so the "private land" the
// edge notice speaks of is something you see. Real spots (src/cabins.json, scripts/cabins.mjs: OpenStreetMap's
// buildings on those shores where the map has them, plausible shore spots near a road where it has too few).
//
// They are scenery: nothing to open, take or sit on, no NPC goes to them, no notice or party uses them. Each is built
// into the props mesh of the tile it stands in (props.js tilePropsSteps: no draw call of its own, the props' own
// material and program), on the ground the props stand on (ctx.H, the 10 m mesh; detail.js re-seats it with the rest of
// the props as the LiDAR chunks come and go), its piers reaching down to the ground at each one.
//   cabinExclusions(world) → [x1, z1, x2, z2, -r] lawns (props.js exclusionsFor): no tree or rock in a cabin or on its dock
//   tileCabins(ctx, pieces) → builds those whose spot is in the tile (ctx as props.js's), pushes the walker's boxes
//   world.cabins            { list (the table), built: Map index → layout, skipped: Map index → why } for the rigs
//                           (scripts/r4-cabins-test.mjs); `?cabins=off` leaves them all out
import * as THREE from 'three';
import { mulberry32 } from './rng.js';
import { PropBuilder, TILE, occlude, obb } from './prop-kit.js';
import { zoneAt, ZONE, EDGE } from './edge.js';
import { nearestRoad } from './roads.js';
import TABLE from './cabins.json';

// `?cabins=off` leaves them out (the rig's A/B)
const OFF = typeof location !== 'undefined' && /[?&]cabins=off\b/.test(location.search);
export const CABINS = OFF ? [] : TABLE.cabins || [];
// a cabin: walls' height to the eave, the roof's pitch (rise per run), its overhang, the front deck's depth; the floor's
// least height over the highest ground under it; the steepest ground a cabin is built on (m of fall across it)
export const CABIN = { eave: 2.45, pitch: 0.62, over: 0.45, deck: 1.9, lift: 0.3, steep: 2.6 };
// a dock: half width, its deck over the water, how far it starts back on the bank, the depth wanted at its end
export const CABIN_DOCK = { hw: 0.85, over: 0.42, back: 1.4, deep: 0.45, max: 18 };

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const C = (hex) => new THREE.Color(hex);
const tone = (hex, rng, dl = 0.05) => new THREE.Color(hex).offsetHSL((rng() - 0.5) * 0.012, 0, (rng() - 0.5) * dl);
const STAINS = [0x6b4a2f, 0x7d3426, 0x4a5440, 0x8a6a42, 0xc9c1ae, 0x5a3b28, 0x9b5a3a];
const ROOFS = [0x3d4a3a, 0x6e3527, 0x55564c, 0x2f302d, 0x4b4f55];
const TRIMS = [0xe0d8c4, 0x2f2a24, 0xd9cdb0, 0x6b2e22];
const DOORS = [0x7a2e22, 0x3f5a46, 0x2e3b4f, 0x6b4a2f, 0xc4a25a];

function state(world) {
  if (!world.cabins) world.cabins = { list: CABINS, built: new Map(), skipped: new Map() };
  return world.cabins;
}

// The vegetation's lawns (no tree, brush or rock; the grass through): the cabin with its deck and a yard round it, and
// the dock's line from the cabin to the water.
export function cabinExclusions() {
  const segs = [];
  for (const c of CABINS) {
    const r = Math.hypot(c.w, c.d + CABIN.deck) / 2 + 3.5;
    segs.push([c.x, c.z, c.x + c.fx * 1.5, c.z + c.fz * 1.5, -r]);
    if (c.dock) segs.push([c.x, c.z, c.dock.x + c.dock.dx * 3, c.dock.z + c.dock.dz * 3, -3]);
  }
  return segs;
}

// Why a cabin is left out where the world has moved round it since the table was made (another stream's road, a lot,
// the edge's band): null when it stands.
function blocked(world, c) {
  if (EDGE.ready && zoneAt(c.x, c.z) !== ZONE.OUT) return 'inside the edge';
  const rd = nearestRoad(world, c.x, c.z, 22);
  if (rd) return `a road ${rd.d.toFixed(0)} m off`;
  for (const ep of world.entryPoints || []) if (Math.hypot(ep.x - c.x, ep.z - c.z) < 180) return `entry point ${ep.ep}`;
  for (const s of world.campsites || []) if (Math.hypot(s.x - c.x, s.z - c.z) < 100) return 'a campsite';
  return null;
}

export function* tileCabins(ctx, pieces) {
  const S = state(ctx.world);
  for (let i = 0; i < CABINS.length; i++) {
    const c = CABINS[i];
    if (!ctx.inside(c.x, c.z)) continue;
    const why = blocked(ctx.world, c);
    if (why) { S.skipped.set(i, why); continue; }
    const L = buildCabin(ctx, c, pieces);
    if (L) { S.built.set(i, L); S.skipped.delete(i); } else S.skipped.set(i, 'the ground');
    yield;
  }
}

// --- one cabin -------------------------------------------------------------------------------------------------------
// A frame at the cabin: a along the front wall (X), b out the front toward the water (F), y the height. The front's
// deck looks at the lake; the ridge runs along the front.
function buildCabin(ctx, c, pieces) {
  const rng = mulberry32(9127 + c.seed);
  const { ox, oz, H } = ctx, F = V(c.fx, 0, c.fz).normalize(), X = V(-F.z, 0, F.x), Y = V(0, 1, 0);
  const W = (a, b) => [c.x + X.x * a + F.x * b, c.z + X.z * a + F.z * b];
  const P = (a, y, b) => { const [x, z] = W(a, b); return V(x - ox, y, z - oz); };
  const G = (a, b) => { const [x, z] = W(a, b); return H(x, z); };
  const hw = c.w / 2, hd = c.d / 2, dk = CABIN.deck;
  // the ground under it, cabin and deck: built on piers over its highest point
  let gMin = Infinity, gMax = -Infinity;
  for (let i = 0; i <= 4; i++) for (let j = 0; j <= 5; j++) {
    const a = -hw + (i / 4) * c.w, b = -hd + (j / 5) * (c.d + dk), g = G(a, b);
    if (!(g === g)) return null;
    if (ctx.tg.shoreAt && ctx.tg.shoreAt(...W(a, b)) < 0.5) return null; // (the water reached it: the bake's shore and the map's differ)
    gMin = Math.min(gMin, g); gMax = Math.max(gMax, g);
  }
  if (gMax - gMin > CABIN.steep) return null;
  const y0 = gMax + CABIN.lift, E = CABIN.eave, top = y0 + E, ridge = top + hd * CABIN.pitch;
  const stain = tone(STAINS[Math.floor(rng() * STAINS.length)], rng), roofCol = tone(ROOFS[Math.floor(rng() * ROOFS.length)], rng, 0.03);
  const trim = C(TRIMS[Math.floor(rng() * TRIMS.length)]), doorCol = C(DOORS[Math.floor(rng() * DOORS.length)]), pierCol = tone(0x6b6156, rng);
  const b = new PropBuilder(), occ = [];

  // piers: a post under each corner and every 2.5 m round the sill and under the deck's front, down into the ground
  const post = (a, bb, yTop) => { const g = G(a, bb) - 0.35; b.box(P(a, (g + yTop) / 2, bb), X, Y, F, 0.1, (yTop - g) / 2, 0.1, TILE.WOOD, pierCol, { grain: 'y', endTile: TILE.END }); };
  const na = Math.max(2, Math.round(c.w / 2.5)), nb = Math.max(2, Math.round(c.d / 2.5));
  for (let i = 0; i <= na; i++) for (const bb of [-hd + 0.12, hd - 0.12, hd + dk - 0.12]) post(-hw + 0.12 + (i / na) * (c.w - 0.24), bb, y0 - 0.18);
  for (let j = 1; j < nb; j++) for (const a of [-hw + 0.12, hw - 0.12]) post(a, -hd + (j / nb) * c.d, y0 - 0.18);
  // the sill all round (a dark band over the piers)
  b.box(P(0, y0 - 0.12, 0), X, Y, F, hw + 0.02, 0.12, hd + 0.02, TILE.WOOD, stain.clone().offsetHSL(0, 0, -0.08), { grain: 'x', skip: ['+y'] });

  // the walls (siding along them), the corner boards
  const wt = 0.14;
  b.box(P(0, y0 + E / 2, hd - wt / 2), X, Y, F, hw, E / 2, wt / 2, TILE.WOOD, stain, { grain: 'x', skip: ['-z'] });
  b.box(P(0, y0 + E / 2, -hd + wt / 2), X, Y, F, hw, E / 2, wt / 2, TILE.WOOD, stain, { grain: 'x', skip: ['+z'] });
  for (const s of [-1, 1]) b.box(P(s * (hw - wt / 2), y0 + E / 2, 0), X, Y, F, wt / 2, E / 2, hd - wt, TILE.WOOD, stain, { grain: 'z', skip: [s > 0 ? '-x' : '+x'] });
  for (const sa of [-1, 1]) for (const sb of [-1, 1]) b.box(P(sa * (hw + 0.005), y0 + E / 2, sb * (hd + 0.005)), X, Y, F, 0.07, E / 2, 0.07, TILE.WOOD, trim, { grain: 'y' });
  occ.push(obb(P(0, y0 + E / 2, 0), X, Y, F, hw, E / 2, hd));
  // the gable ends, boards up and down
  for (const s of [-1, 1]) {
    const a = s * (hw + 0.002);
    b.face([P(a, top, -hd), P(a, top, hd), P(a, ridge, 0)], TILE.WOOD, stain.clone().offsetHSL(0, 0, 0.02), { ref: P(0, top, 0), U: Y });
  }
  // the roof: two slabs from the eaves, past the walls by the overhang, to the ridge, and a cap along it
  const run = hd + CABIN.over, eaveY = top - CABIN.over * CABIN.pitch, slope = Math.hypot(run, ridge - eaveY);
  for (const s of [-1, 1]) {
    const down = V(F.x * s * run, eaveY - ridge, F.z * s * run).normalize(), up = new THREE.Vector3().crossVectors(down, X).normalize();
    if (up.y < 0) up.negate();
    const mid = P(0, (ridge + eaveY) / 2, s * run / 2).addScaledVector(up, 0.06);
    b.box(mid, X, up, down, hw + CABIN.over, 0.06, slope / 2, TILE.ROOF, roofCol, { grain: 'z', endTile: TILE.WOOD, shift: [rng(), 0] });
    occ.push(obb(mid, X, up, down, hw + CABIN.over, 0.06, slope / 2));
  }
  b.box(P(0, ridge + 0.1, 0), X, Y, F, hw + CABIN.over + 0.02, 0.05, 0.14, TILE.ROOF, roofCol.clone().offsetHSL(0, 0, -0.05), { grain: 'x' });

  // the door and the windows (glass in a trim frame), proud of the walls
  const dA = (rng() < 0.5 ? -1 : 1) * Math.min(hw - 1.2, hw * 0.45);
  b.box(P(dA, y0 + 1.02, hd + 0.03), X, Y, F, 0.5, 1.04, 0.03, TILE.WOOD, trim, { grain: 'y' });
  b.box(P(dA, y0 + 1.0, hd + 0.05), X, Y, F, 0.43, 0.99, 0.02, TILE.PAINT, doorCol, { grain: 'y' });
  const glass = C(0x8fa3a6);
  const windowAt = (a, bOut, n, wHalf) => { // n the wall's outward normal (X or F, signed)
    const cy = y0 + 1.45, Xw = n === 'F' ? X : F, Nw = n === 'F' ? F : X, s = Math.sign(bOut);
    const at = (u, y, out) => (n === 'F' ? P(u, y, bOut + s * out) : P(bOut + s * out, y, u));
    b.box(at(a, cy, 0.03), Xw, Y, Nw, wHalf + 0.08, 0.58, 0.03, TILE.WOOD, trim, { grain: 'x' });
    const g0 = at(a - wHalf, cy - 0.5, 0.065), g1 = at(a + wHalf, cy - 0.5, 0.065), g2 = at(a + wHalf, cy + 0.5, 0.065), g3 = at(a - wHalf, cy + 0.5, 0.065);
    b.face([g0, g1, g2, g3], TILE.GLASS, glass, { ref: at(a, cy, -1), uvs: [[0.03, 0.97], [0.97, 0.97], [0.97, 0.03], [0.03, 0.03]] });
  };
  { const fw = Math.min(0.85, Math.max(0.45, (hw - 0.5) * 0.3)), a = -Math.sign(dA) * Math.max(fw + 0.2, Math.min(hw - fw - 0.35, hw * 0.5)); windowAt(a, hd, 'F', fw); } // (the big window, the far side of the door)
  for (const s of [-1, 1]) windowAt(0, s * hw, 'X', Math.min(0.6, hd - 0.9));
  windowAt(0, -hd, 'F', 0.45);

  // the deck across the front, on its piers, with a rail where it stands high, and steps down to the ground
  const deckY = y0 - 0.04, gFront = Math.min(G(-hw, hd + dk), G(0, hd + dk), G(hw, hd + dk));
  const deckCol = tone(0x9a8a72, rng, 0.04);
  for (let s = hd + 0.02; s < hd + dk - 0.01;) { const s1 = Math.min(hd + dk, s + 0.6); b.box(P(0, deckY - 0.03, (s + s1) / 2), X, Y, F, hw, 0.03, (s1 - s) / 2 - 0.006, TILE.WOOD, deckCol.clone().offsetHSL(0, 0, (rng() - 0.5) * 0.05), { grain: 'x', skip: ['-y'], shift: [rng() * 4, rng() * 4] }); s = s1; }
  const stairA = dA, high = deckY - gFront;
  if (high > 0.6) {
    const railY = deckY + 0.9;
    for (let i = 0; i <= na; i++) { const a = -hw + 0.06 + (i / na) * (c.w - 0.12); if (Math.abs(a - stairA) < 0.65) continue; b.box(P(a, (deckY + railY) / 2, hd + dk - 0.06), X, Y, F, 0.045, (railY - deckY) / 2, 0.045, TILE.WOOD, trim, { grain: 'y' }); }
    for (const [a0, a1] of [[-hw, stairA - 0.6], [stairA + 0.6, hw]]) if (a1 - a0 > 0.2) b.box(P((a0 + a1) / 2, railY, hd + dk - 0.06), X, Y, F, (a1 - a0) / 2, 0.04, 0.05, TILE.WOOD, trim, { grain: 'x' });
    for (const s of [-1, 1]) b.box(P(s * (hw - 0.06), railY, hd + dk / 2), X, Y, F, 0.05, 0.04, dk / 2, TILE.WOOD, trim, { grain: 'z' });
  }
  if (high > 0.2) { // the steps: risers of under 0.2 m down to the ground in front
    const n = Math.min(14, Math.ceil(high / 0.19)), rise = high / n;
    for (let k = 1; k <= n; k++) {
      const ty = deckY - k * rise, tb = hd + dk + (k - 0.5) * 0.28, g = G(stairA, tb);
      if (ty < g - 0.05) break;
      b.box(P(stairA, (ty + Math.max(g - 0.2, ty - 0.35)) / 2, tb), X, Y, F, 0.55, (ty - Math.max(g - 0.2, ty - 0.35)) / 2, 0.14, TILE.WOOD, deckCol, { grain: 'x' });
    }
  }
  // a chimney of stone up the back of one end, and the propane tank by the back wall (what a lake cabin has)
  if (rng() < 0.65) {
    const ca = (rng() < 0.5 ? -1 : 1) * (hw - 0.7), cb = -hd * 0.45;
    b.box(P(ca, (G(ca, cb) - 0.2 + ridge + 0.6) / 2, cb), X, Y, F, 0.32, (ridge + 0.6 - G(ca, cb) + 0.2) / 2, 0.32, TILE.STONE, tone(0x8e877e, rng, 0.06));
  }
  if (rng() < 0.7) {
    const ta = (rng() - 0.5) * (c.w - 2.4), tb = -hd - 1.6, g = G(ta, tb);
    b.cyl(P(ta - 0.62, g + 0.55, tb), P(ta + 0.62, g + 0.55, tb), 0.36, 0.36, 10, TILE.METAL, C(0xd8d6cf), { cap0: true, cap1: true, capTile: TILE.METAL });
    for (const s of [-0.4, 0.4]) b.box(P(ta + s, g + 0.1, tb), X, Y, F, 0.05, 0.2, 0.25, TILE.METAL, C(0x6a6862));
    ctx.obstacles.push({ x: W(ta, tb)[0], z: W(ta, tb)[1], ux: X.x, uz: X.z, hx: 0.75, hz: 0.4, box: true });
  }
  const geo = b.build();
  occlude(geo, occ, { ground: (x, z) => H(x + ox, z + oz), rays: 6, reach: 0.8, floor: 0.4 });
  pieces.push(geo);
  // the walker: the cabin and its deck one box (nothing to go into); the steps too
  const [mx, mz] = W(0, dk / 2);
  ctx.obstacles.push({ x: mx, z: mz, ux: X.x, uz: X.z, hx: hw + 0.1, hz: hd + dk / 2 + 0.1, box: true });
  const layout = { x: c.x, z: c.z, lake: c.lake, floor: y0, ridge, ground: [gMin, gMax], fx: F.x, fz: F.z, w: c.w, d: c.d, dock: null };
  if (c.dock) layout.dock = buildDock(ctx, c, pieces, rng);
  return layout;
}

// --- its dock --------------------------------------------------------------------------------------------------------
// Along the table's line from the cabin to the water: the shore found on the drawn ground (where it drops under the
// lake's level), the dock from a little up the bank out until the water under its end is deep enough.
function buildDock(ctx, c, pieces, rng) {
  const lake = ctx.world.lakes && ctx.world.lakes[c.lake - 1], level = lake ? lake.level : null;
  if (!Number.isFinite(level)) return null;
  const { ox, oz, H } = ctx, D = c.dock, F = V(D.dx, 0, D.dz).normalize(), X = V(-F.z, 0, F.x), Y = V(0, 1, 0);
  const W = (a, s) => [D.x + X.x * a + F.x * s, D.z + X.z * a + F.z * s];
  const P = (a, y, s) => { const [x, z] = W(a, s); return V(x - ox, y, z - oz); };
  const G = (a, s) => { const [x, z] = W(a, s); return H(x, z); };
  let shore = null;
  for (let s = -15; s <= 30; s += 0.5) if (G(0, s) < level - 0.02) { shore = s; break; }
  if (shore === null) return null;
  const back = shore - CABIN_DOCK.back;
  // not into the cabin's yard: the dock's foot past the deck's steps
  const [bx, bz] = W(0, back), cabinR = Math.hypot((bx - c.x) * c.fx + (bz - c.z) * c.fz, 0);
  if (cabinR < c.d / 2 + CABIN.deck + 1.2) return null;
  let end = shore + Math.min(D.len, CABIN_DOCK.max);
  while (end < shore + CABIN_DOCK.max && level - G(0, end) < CABIN_DOCK.deep) end += 1;
  const deckY = Math.max(level + CABIN_DOCK.over, G(0, back) + 0.06), hw = CABIN_DOCK.hw, b = new PropBuilder(), occ = [];
  const dry = C(0x9d978b), wet = C(0x4b4239);
  for (let s = back; s < end - 0.01;) {
    const s1 = Math.min(end, s + 0.16 + rng() * 0.06);
    b.box(P((rng() - 0.5) * 0.02, deckY - 0.025, (s + s1) / 2), X, Y, F, hw, 0.025, (s1 - s) / 2 - 0.005, TILE.WOOD, dry.clone().offsetHSL(0, 0, (rng() - 0.5) * 0.07), { grain: 'x', skip: ['-y'], shift: [rng() * 4, rng() * 4] });
    s = s1;
  }
  for (const a of [-hw + 0.08, hw - 0.08]) b.box(P(a, deckY - 0.13, (back + end) / 2), X, Y, F, 0.03, 0.08, (end - back) / 2, TILE.WOOD, tone(0x6f675b, rng), { grain: 'z' });
  occ.push(obb(P(0, deckY - 0.08, (back + end) / 2), X, Y, F, hw, 0.08, (end - back) / 2));
  for (let s = end - 0.2; s > back + 0.3; s -= 2.4) for (const side of [-1, 1]) {
    const a = side * (hw + 0.06), bed = G(a, s) - 0.45, t = deckY + 0.04;
    b.cyl(P(a, bed, s), P(a, t, s), 0.08, 0.075, 7, TILE.WOOD, (k) => (bed + k * (t - bed) < level + 0.1 ? wet : C(0x857b6b)), { ts: [0, Math.max(0.01, Math.min(0.99, (level + 0.1 - bed) / (t - bed))), 1], cap1: true, phase: rng() * 6 });
  }
  const geo = b.build();
  occlude(geo, occ, { ground: (x, z) => H(x + ox, z + oz), rays: 6, reach: 0.6, floor: 0.4 });
  pieces.push(geo);
  const [mx, mz] = W(0, (back + end) / 2);
  ctx.obstacles.push({ x: mx, z: mz, ux: F.x, uz: F.z, hx: (end - back) / 2, hz: hw, box: true, top: deckY }); // (stood on, as a store's dock)
  const [sx, sz] = W(0, back), [ex, ez] = W(0, end);
  return { from: { x: sx, z: sz }, to: { x: ex, z: ez }, deckY, level, len: end - back };
}
