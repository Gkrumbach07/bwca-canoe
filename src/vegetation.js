import * as THREE from 'three';
import { GeoBuilder, vary } from './geobuilder.js';
import { mulberry32, hash2 } from './rng.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { angularRock, makeRockMaterial, makeToonMaterial, smoothToon, setToonSun } from './rocks.js';
import { REGION } from './placement.js';

// Tree, shrub and boulder geometry. Placement lives in placement.js (it runs in the build worker); this file
// turns a tile's placement bins into instanced meshes in tile-local coordinates. Everything is welded smooth
// and shaded with the stepped toon ramp (see rocks.js): low-poly silhouettes, soft painted volumes.
//
// The near variants (docs/look.md, pass 4): trunks in two or three segments with a bend, a base flare and a
// shade side baked into the vertex colour; crowns as six to twelve clusters offset to one side, lit on top
// and dark and cool underneath; spruce as uneven whorls with a ragged tip; twelve variants per species that
// spread height 0.6–1.6 with leaners, a giant and a runt. Near the camera a stand draws three variants of
// each species (makeVegetationMeshes, pass 5), further out one per region. The far twins (LOW) draw the
// forest at distance and must stay cheap.
//
// Pass 5 adds the understory (hazel, alder, a young fir, bracken) and the deadfall (logs, stumps) and the
// granite outcrops, appended to SPECIES.

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const DEAD = 0x4a3f36;  // a dead lower branch
const SCAR = 0x2a221d;  // a birch's branch scar
const sm = (t) => { t = Math.min(1, Math.max(0, t)); return t * t * (3 - 2 * t); };
const SPREAD = (rng) => rng() + rng() - 1; // a triangular spread in (-1, 1), most near 0

// Size and age across the twelve variants of a species: most ordinary, two leaners, a giant and a runt.
// `size` scales the height (0.6–1.6), `lean` is how far off plumb the top ends up as a fraction of the
// height, `girth` the trunk's radius against the species' norm (0.6–1.5).
const ROLES = ['norm', 'norm', 'lean', 'norm', 'norm', 'giant', 'norm', 'norm', 'lean', 'norm', 'runt', 'norm'];
function profile(v, rng) {
  const role = ROLES[v % ROLES.length];
  const size = role === 'giant' ? 1.45 + rng() * 0.15 : role === 'runt' ? 0.66 + rng() * 0.12 : 0.8 + rng() * 0.4;
  const off = role === 'lean' ? 0.13 + rng() * 0.08 : 0.015 + rng() * 0.045, a = rng() * 6.28;
  const girth = (0.6 + rng() * 0.9) * (role === 'giant' ? 1.2 : role === 'runt' ? 0.85 : 1);
  return { role, size, girth, lean: [Math.cos(a) * off, Math.sin(a) * off], bow: [SPREAD(rng) * 0.03, SPREAD(rng) * 0.03] };
}
const leanOf = (P, h) => [P.lean[0] * h, P.lean[1] * h];
const bowOf = (P, h) => [P.bow[0] * h, P.bow[1] * h];

// The two colours of a crown for one tree, drifted together in hue so no two trees are the same green, and
// a gradient maker: `t` runs from the dark underside (0) to the lit top (1). Leaf hues stay in the band
// tagLeaves looks for (0.1–0.47, saturated) so the seasons can still turn and drop them.
function crownColors(topHex, underHex, rng) {
  const drift = (rng() - 0.5) * 0.05, dl = (rng() - 0.5) * 0.08;
  const top = vary(topHex, rng, 0.04).offsetHSL(drift, 0, dl), under = vary(underHex, rng, 0.04).offsetHSL(drift * 0.6, 0, dl * 0.5);
  return { top, under, at: (t, shift = 0) => under.clone().lerp(top, sm(t)).offsetHSL(0, 0, shift) };
}
// A crown of `count` clusters around (cx, cy, cz) within an ellipsoid (rx, ry, rz), pushed to one side by
// `bias` (a fraction of rx along a random bearing): bigger near the heart, smaller and lower at the fringe.
// Each cluster's colour runs from the crown's underside to its top, plus its own position in the crown.
function clusters(g, rng, cx, cy, cz, rx, ry, rz, count, lumpR, cols, o = {}) {
  const { n = 5, sy = 0.8, jitter = 0.35, bias = 0.4, flat = 1 } = o;
  const ba = rng() * 6.28, bx = Math.cos(ba) * bias * rx, bz = Math.sin(ba) * bias * rz;
  const y0 = cy - ry - lumpR * sy, y1 = cy + ry + lumpR * sy;
  for (let i = 0; i < count; i++) {
    const heart = i < Math.ceil(count * 0.4);
    const ox = SPREAD(rng) * rx * (heart ? 0.55 : 1), oy = SPREAD(rng) * ry * (heart ? 0.6 : 1) * flat, oz = SPREAD(rng) * rz * (heart ? 0.55 : 1);
    const r = lumpR * (heart ? 1 + rng() * 0.35 : 0.65 + rng() * 0.45), shift = (rng() - 0.5) * 0.07;
    const x = cx + bx + ox, y = cy + oy, z = cz + bz + oz;
    g.lump(x, y, z, r, heart ? n : Math.max(4, n - 1), rng, jitter, 1 + (rng() - 0.5) * 0.4, sy, 1 + (rng() - 0.5) * 0.4, (p, tl) => cols.at(0.55 * (p.y - y0) / (y1 - y0) + 0.45 * tl, shift));
  }
}
// A few dead lower branches: thin drooping tubes off the stem between heights t0 and t1.
function deadBranches(g, rng, at, count, t0, t1, L0, L1, bark) {
  const col = vary(DEAD, rng, 0.08);
  for (let i = 0; i < count; i++) {
    const t = t0 + rng() * (t1 - t0), a = rng() * 6.28, L = L0 + rng() * (L1 - L0), s = at(t);
    const p0 = V(s.x + Math.cos(a) * s.r * 0.8, s.y, s.z + Math.sin(a) * s.r * 0.8);
    g.limb(p0, V(s.x + Math.cos(a) * L, s.y - L * (0.05 + rng() * 0.2), s.z + Math.sin(a) * L), 0.05 + s.r * 0.12, 0.02, 3, bark ? col.clone().lerp(bark, 0.3) : col, rng);
  }
}

// ---------- species (full detail) ------------------------------------------------

function whitePine(rng, v) {
  const g = new GeoBuilder(), P = profile(v, rng);
  const h = 16 * P.size, bark = vary(0x5a4030, rng), cols = crownColors(0x5f9a52, 0x2a4a34, rng);
  const T = g.stem(0, -0.5, 0, 0.45 * P.girth, 0.14 * P.girth, h * 0.84, 5, bark, rng, { lean: leanOf(P, h), bow: bowOf(P, h), flare: 0.45, shade: 0.32 });
  deadBranches(g, rng, T.at, 1 + Math.floor(rng() * 2), 0.28, 0.48, 0.9, 1.7, bark);
  // chunky plates of foliage stacked unevenly up the top half of the stem, overlapping, the upper ones
  // swept to one side; a rounded leader on top
  const ba = rng() * 6.28, bias = 0.3 + rng() * 0.3, R = (2.2 + rng() * 0.6) * (0.75 + P.size * 0.35);
  const plates = 4 + Math.floor(rng() * 2), y0 = h * 0.42, y1 = h * 1.02;
  const gaps = []; for (let i = 0; i < plates - 1; i++) gaps.push(0.6 + rng() * 0.9);
  const sum = gaps.reduce((a, b) => a + b, 0);
  let t = 0.48 + rng() * 0.05;
  for (let i = 0; i < plates; i++) {
    const f = (t - 0.48) / 0.5, s = T.at(Math.min(1, t)), rr = R * (1.1 - f * 0.5) * (0.8 + rng() * 0.4);
    const sw = bias * R * f, x = s.x + Math.cos(ba) * sw + SPREAD(rng) * R * 0.45, y = s.y + rr * 0.15, z = s.z + Math.sin(ba) * sw + SPREAD(rng) * R * 0.45;
    const shift = (rng() - 0.5) * 0.06;
    g.lump(x, y, z, rr, i < 2 ? 5 : 4, rng, 0.4, 1 + (rng() - 0.5) * 0.4, 0.6 + rng() * 0.2, 1 + (rng() - 0.5) * 0.4, (p, tl) => cols.at(0.6 * (p.y - y0) / (y1 - y0) + 0.4 * tl, shift));
    if (i < plates - 1) t += (gaps[i] / sum) * 0.5;
  }
  const top = T.at(1);
  g.lump(top.x + SPREAD(rng) * 0.5, h * 0.96, top.z + SPREAD(rng) * 0.5, R * 0.45, 4, rng, 0.45, 0.9, 1.1, 0.9, (p, tl) => cols.at(0.7 + 0.3 * tl));
  return g.build();
}
function spruce(rng, v) {
  const g = new GeoBuilder(), P = profile(v, rng);
  const h = 12.5 * P.size, bark = vary(0x4a3a2c, rng), cols = crownColors(0x3f7a48, 0x22402f, rng);
  const T = g.stem(0, -0.5, 0, 0.3 * P.girth, 0.05, h, 5, bark, rng, { lean: leanOf(P, h), bow: bowOf(P, h), flare: 0.35, shade: 0.3 });
  deadBranches(g, rng, T.at, 2 + Math.floor(rng() * 2), 0.1, 0.3, 0.7, 1.5, bark);
  // five to seven whorls, unevenly spaced, each a little off the axis, the lowest wide and the tip a spike
  const whorls = 5 + Math.floor(rng() * 2), R = (2.1 + rng() * 0.5) * (0.8 + P.size * 0.3);
  let t = 0.14 + rng() * 0.06;
  const gaps = []; for (let i = 0; i < whorls - 1; i++) gaps.push(0.6 + rng() * 0.9);
  const sum = gaps.reduce((a, b) => a + b, 0), span = 0.82 - t;
  for (let i = 0; i < whorls; i++) {
    const s = T.at(t), f = (t - 0.14) / 0.72, rr = R * (1.05 - f * 0.78) * (0.8 + rng() * 0.4), ch = (2 + rng() * 1.2) * (0.7 + P.size * 0.35);
    const x = s.x + SPREAD(rng) * 0.35, z = s.z + SPREAD(rng) * 0.35, y = s.y - ch * 0.15, shift = (rng() - 0.5) * 0.06;
    g.cone(x, y, z, rr, ch, 5, (p) => cols.at(0.15 + 0.85 * (p.y - y) / ch, shift), rng, 0.3);
    if (i < whorls - 1) t += (gaps[i] / sum) * span;
  }
  const top = T.at(1);
  g.cone(top.x + SPREAD(rng) * 0.2, h * 0.86, top.z + SPREAD(rng) * 0.2, R * 0.22, h * 0.2, 4, (p) => cols.at(0.4 + 0.6 * (p.y - h * 0.86) / (h * 0.2)), rng, 0.3);
  return g.build();
}
function redPine(rng, v) {
  const g = new GeoBuilder(), P = profile(v, rng);
  const h = 15 * P.size, bark = vary(0x8a4a2e, rng), cols = crownColors(0x629a48, 0x2b4b30, rng);
  const T = g.stem(0, -0.5, 0, 0.42 * P.girth, 0.18 * P.girth, h * 0.9, 5, bark, rng, { lean: leanOf(P, h), bow: [P.bow[0] * h * 0.5, P.bow[1] * h * 0.5], flare: 0.35, shade: 0.3 });
  deadBranches(g, rng, T.at, 2, 0.35, 0.6, 0.8, 1.4, bark);
  const R = (1.5 + rng() * 0.6) * (0.75 + P.size * 0.35), top = T.at(1);
  // a rounded tufted crown about the top of the stem, and one or two tufts on short limbs below it
  clusters(g, rng, top.x, h * 0.9, top.z, R * 1.1, R * 0.7, R * 1.1, 5 + Math.floor(rng() * 2), R * 0.66, cols, { n: 5, sy: 0.85, bias: 0.35 });
  for (let i = 0; i < 1; i++) {
    const t = 0.62 + rng() * 0.18, a = rng() * 6.28, L = 1 + rng() * 1.2, s = T.at(t), shift = (rng() - 0.5) * 0.06;
    const tip = V(s.x + Math.cos(a) * L, s.y + L * 0.3, s.z + Math.sin(a) * L);
    g.limb(V(s.x, s.y, s.z), tip, 0.08, 0.03, 3, bark, rng);
    g.lump(tip.x, tip.y + 0.3, tip.z, R * 0.45, 4, rng, 0.4, 1.2, 0.7, 1.2, (p, tl) => cols.at(0.25 + 0.5 * tl, shift));
  }
  return g.build();
}
function birch(rng, v) {
  const g = new GeoBuilder(), P = profile(v, rng);
  const h = 10.5 * P.size, bark = vary(0xe6e2d6, rng, 0.04), cols = crownColors(0x8fb552, 0x2d5a3c, rng);
  const lean = leanOf(P, h * 1.3), forked = v % 4 === 1;
  const T = g.stem(0, -0.5, 0, 0.2 * P.girth, 0.06 * P.girth, h * 0.78, 5, bark, rng, { lean, bow: bowOf(P, h), flare: 0.3, shade: 0.28, ts: [0, 0.1, 0.5, 1] });
  // branch scars: dark lenses down the lower trunk, and one to three short stubs higher up
  const scars = 4 + Math.floor(rng() * 3);
  for (let i = 0; i < scars; i++) { const t = 0.08 + rng() * 0.62, s = T.at(t); g.scar(T.at, t, rng() * 6.28, s.r * (0.9 + rng() * 0.5), s.r * (0.6 + rng() * 0.4), new THREE.Color(SCAR)); }
  const stubCol = bark.clone().lerp(new THREE.Color(DEAD), 0.55);
  for (let i = 0; i < 1 + Math.floor(rng() * 3); i++) {
    const t = 0.4 + rng() * 0.4, a = rng() * 6.28, L = 0.45 + rng() * 0.5, s = T.at(t);
    g.limb(V(s.x + Math.cos(a) * s.r * 0.7, s.y, s.z + Math.sin(a) * s.r * 0.7), V(s.x + Math.cos(a) * L, s.y + L * (0.4 + rng() * 0.5), s.z + Math.sin(a) * L), 0.035 + s.r * 0.25, 0.015, 3, stubCol, rng);
  }
  const top = T.at(1), R = (1.5 + rng() * 0.6) * (0.75 + P.size * 0.35);
  let fork = null;
  if (forked) {
    const s = T.at(0.22), a = rng() * 6.28, L = h * (0.5 + rng() * 0.15), fl = [Math.cos(a) * h * 0.28 + lean[0] * 0.5, Math.sin(a) * h * 0.28 + lean[1] * 0.5];
    fork = g.stem(s.x, s.y, s.z, s.r * 0.72, 0.05, L, 5, bark, rng, { lean: fl, bow: [0, 0], flare: 0, shade: 0.28, ts: [0, 0.5, 1] });
    const f = fork.at(1);
    clusters(g, rng, f.x, f.y + R * 0.4, f.z, R * 0.85, R * 0.9, R * 0.85, 4, R * 0.55, cols, { n: 4, sy: 1.05, bias: 0.3 });
  }
  clusters(g, rng, top.x, h * 0.78 + R * 0.5, top.z, R * (forked ? 0.85 : 1.05), R * 1.15, R * (forked ? 0.85 : 1.05), forked ? 5 : 6 + Math.floor(rng() * 2), R * 0.62, cols, { n: 5, sy: 1.05, bias: 0.35 });
  return g.build();
}
function cedar(rng, v) {
  const g = new GeoBuilder(), P = profile(v, rng);
  const h = 8 * P.size, bark = vary(0x6b4a34, rng), cols = crownColors(0x4f843e, 0x264330, rng);
  const T = g.stem(0, -0.5, 0, 0.36 * P.girth, 0.1, h * 0.55, 5, bark, rng, { lean: leanOf(P, h), bow: bowOf(P, h), flare: 0.5, shade: 0.3, ts: [0, 0.12, 1] });
  deadBranches(g, rng, T.at, 1 + Math.floor(rng() * 2), 0.2, 0.6, 0.6, 1.2, bark);
  const tiers = 3 + Math.floor(rng() * 2), R = (2.2 + rng() * 0.5) * (0.8 + P.size * 0.3);
  for (let i = 0; i < tiers; i++) {
    const t = i / tiers, s = T.at(Math.min(1, t * 1.6)), rr = R * (1 - t * 0.5) * (0.85 + rng() * 0.3), ch = (2.8 + rng()) * (0.75 + P.size * 0.3);
    const x = s.x + SPREAD(rng) * 0.4, z = s.z + SPREAD(rng) * 0.4, y = h * (0.08 + t * 0.62), shift = (rng() - 0.5) * 0.06;
    g.cone(x, y, z, rr, ch, 5, (p) => cols.at(0.1 + 0.9 * (p.y - y) / ch, shift), rng, 0.4);
  }
  return g.build();
}
function snag(rng, v) {
  const g = new GeoBuilder(), P = profile(v, rng);
  const h = 9 * P.size, col = vary(0x9a9388, rng, 0.08);
  const T = g.stem(0, -0.5, 0, 0.35 * P.girth, 0.07, h, 5, col, rng, { lean: leanOf(P, h * 1.2), bow: bowOf(P, h * 1.5), flare: 0.45, shade: 0.35, jag: 0.35 + rng() * 0.5, cap: true });
  for (let i = 0; i < 2 + Math.floor(rng() * 3); i++) {
    const t = 0.35 + rng() * 0.5, a = rng() * 6.28, L = 0.6 + rng() * 1.6, s = T.at(t);
    g.limb(V(s.x, s.y, s.z), V(s.x + Math.cos(a) * L, s.y + L * (0.1 + rng() * 0.4), s.z + Math.sin(a) * L), 0.04 + s.r * 0.25, 0.02, 3, col, rng);
  }
  return g.build();
}
// old-growth pine: a long bare trunk with a few stub branches and a small ragged crown swept to one side
function tallPine(rng, v) {
  const g = new GeoBuilder(), P = profile(v, rng);
  const h = 20 * P.size, bark = vary(0x6b4a34, rng), cols = crownColors(0x5a9650, 0x2a4a34, rng);
  const T = g.stem(0, -0.5, 0, 0.45 * P.girth, 0.16 * P.girth, h * 0.93, P.role === 'giant' ? 6 : 5, bark, rng, { lean: leanOf(P, h), bow: bowOf(P, h), flare: 0.5, shade: 0.32 });
  const R = (1.7 + rng() * 0.6) * (0.75 + P.size * 0.35);
  for (let i = 0; i < 2 + Math.floor(rng() * 2); i++) {
    const t = 0.5 + rng() * 0.32, a = rng() * 6.28, L = 1.2 + rng() * 1.6, s = T.at(t), shift = (rng() - 0.5) * 0.06;
    const tip = V(s.x + Math.cos(a) * L, s.y + L * (0.15 + rng() * 0.2), s.z + Math.sin(a) * L);
    g.limb(V(s.x, s.y, s.z), tip, 0.05 + s.r * 0.2, 0.03, 3, bark, rng);
    if (rng() < 0.65) g.lump(tip.x, tip.y + 0.3, tip.z, R * 0.42, 4, rng, 0.45, 1.3, 0.65, 1.3, (p, tl) => cols.at(0.2 + 0.6 * tl, shift));
  }
  const top = T.at(1);
  clusters(g, rng, top.x, h * 0.93, top.z, R * 1.2, R * 0.4, R * 1.2, 5 + Math.floor(rng() * 2), R * 0.62, cols, { n: 5, sy: 0.7, bias: 0.6 });
  return g.build();
}
// jack pine of the bare rock: short, crooked, a few limbs with ragged tufts
function jackPine(rng, v) {
  const g = new GeoBuilder(), P = profile(v, rng);
  const h = 6 * P.size, bark = vary(0x6a5038, rng), cols = crownColors(0x6f8e3a, 0x31492a, rng);
  const T = g.stem(0, -0.5, 0, 0.22 * P.girth, 0.05, h, 5, bark, rng, { lean: leanOf(P, h * 1.4), bow: [P.bow[0] * h * 3, P.bow[1] * h * 3], wig: 0.06, flare: 0.35, shade: 0.3 });
  const n = 3 + Math.floor(rng() * 2);
  for (let i = 0; i < n; i++) {
    const t = 0.35 + rng() * 0.55, a = rng() * 6.28, L = 0.9 + rng() * 1.1, s = T.at(t), shift = (rng() - 0.5) * 0.07;
    const tip = V(s.x + Math.cos(a) * L, s.y + L * (0.1 + rng() * 0.5), s.z + Math.sin(a) * L);
    g.limb(V(s.x, s.y, s.z), tip, 0.04 + s.r * 0.25, 0.02, 3, bark, rng);
    g.lump(tip.x, tip.y + 0.25, tip.z, 0.55 + rng() * 0.45, 4, rng, 0.55, 1.3, 0.6, 1.3, (p, tl) => cols.at(0.2 + 0.6 * tl, shift));
    if (rng() < 0.4) g.lump(tip.x + SPREAD(rng) * 0.7, tip.y + 0.5, tip.z + SPREAD(rng) * 0.7, 0.4 + rng() * 0.3, 4, rng, 0.55, 1.1, 0.7, 1.1, (p, tl) => cols.at(0.35 + 0.6 * tl, shift));
  }
  const top = T.at(1);
  g.lump(top.x, h + 0.1, top.z, 0.7 + rng() * 0.4, 4, rng, 0.5, 1.2, 0.75, 1.2, (p, tl) => cols.at(0.45 + 0.55 * tl));
  return g.build();
}
function shrub(rng) {
  const g = new GeoBuilder();
  const base = [0x5c8a3a, 0x6f9440, 0x4e7a34, 0x7f9a44][Math.floor(rng() * 4)], cols = crownColors(base, 0x2b4a28, rng);
  const n = 2 + (rng() < 0.5 ? 1 : 0);
  for (let i = 0; i < n; i++) { const shift = (rng() - 0.5) * 0.06; g.lump((rng() - 0.5) * 1.0, 0.5 + rng() * 0.3, (rng() - 0.5) * 1.0, 0.6 + rng() * 0.5, 5, rng, 0.4, 1.3, 0.75, 1.3, (p, tl) => cols.at(0.2 + 0.8 * tl, shift)); }
  return g.build();
}

// ---------- the understory and the deadfall (docs/look.md, pass 5) --------------
// Cheap shapes: a few thin stems and a handful of small clusters, 25–60 triangles each, because there are as
// many of them as there are trees. Leaf colours sit in tagLeaves's band (hue 0.1–0.47, saturated) so the
// deciduous ones turn and drop with the season; the sapling is a young fir and keeps its needles.

// beaked hazel: three or four stems fanning out of one root, hidden in round clusters that overlap into one
// loose vase-shaped mass from knee height to the top
function hazel(rng) {
  const g = new GeoBuilder(), size = 0.8 + rng() * 0.45, h = 2.2 * size;
  const bark = vary(0x6a5440, rng, 0.06), cols = crownColors(0x78a24c, 0x37552f, rng);
  const stems = 3 + Math.floor(rng() * 2), a0 = rng() * 6.28;
  for (let i = 0; i < stems; i++) {
    const a = a0 + (i / stems) * 6.28 + (rng() - 0.5) * 0.7, out = h * (0.2 + rng() * 0.15), shift = (rng() - 0.5) * 0.07;
    const tip = V(Math.cos(a) * out, h * (0.62 + rng() * 0.22), Math.sin(a) * out);
    g.limb(V(Math.cos(a) * 0.05, -0.2, Math.sin(a) * 0.05), tip, 0.035 * size, 0.014, 3, bark, rng);
    g.lump(tip.x, tip.y, tip.z, (0.6 + rng() * 0.2) * size, 4, rng, 0.4, 1.15, 0.95, 1.15, (p, tl) => cols.at(0.25 + 0.7 * tl, shift));
    if (rng() < 0.6) g.lump(tip.x * 0.55, tip.y * 0.5, tip.z * 0.55, (0.45 + rng() * 0.15) * size, 4, rng, 0.4, 1.2, 0.9, 1.2, (p, tl) => cols.at(0.1 + 0.55 * tl, shift));
  }
  g.lump(SPREAD(rng) * 0.2, h * 0.88, SPREAD(rng) * 0.2, 0.55 * size, 4, rng, 0.4, 1.1, 1.0, 1.1, (p, tl) => cols.at(0.45 + 0.55 * tl));
  return g.build();
}
// speckled alder: a sprawling clump of grey stems leaning out from the wet ground, round clusters of dark
// leaves along their upper half
function alder(rng) {
  const g = new GeoBuilder(), size = 0.85 + rng() * 0.4, h = 2.8 * size;
  const bark = vary(0x75706a, rng, 0.06), cols = crownColors(0x5f8c44, 0x2e4c2d, rng);
  const stems = 3 + Math.floor(rng() * 2), a0 = rng() * 6.28;
  for (let i = 0; i < stems; i++) {
    const a = a0 + (i / stems) * 6.28 + (rng() - 0.5) * 0.8, lean = 0.3 + rng() * 0.35, L = h * (0.8 + rng() * 0.3), shift = (rng() - 0.5) * 0.06;
    const tip = V(Math.cos(a) * Math.sin(lean) * L, Math.cos(lean) * L, Math.sin(a) * Math.sin(lean) * L);
    g.limb(V(0, -0.2, 0), tip, 0.05 * size, 0.02, 3, bark, rng);
    g.lump(tip.x * 0.9, tip.y * 0.92, tip.z * 0.9, (0.68 + rng() * 0.2) * size, 4, rng, 0.4, 1.2, 0.95, 1.2, (p, tl) => cols.at(0.25 + 0.7 * tl, shift));
    g.lump(tip.x * 0.55, tip.y * 0.58, tip.z * 0.55, (0.52 + rng() * 0.15) * size, 4, rng, 0.4, 1.2, 0.9, 1.2, (p, tl) => cols.at(0.1 + 0.6 * tl, shift));
  }
  return g.build();
}
// a young balsam fir coming up in the gaps: a thin stem and three or four tiers, the lowest widest
function sapling(rng) {
  const g = new GeoBuilder(), size = 0.7 + rng() * 0.5, h = 2.6 * size;
  const cols = crownColors(0x4b8a52, 0x24452f, rng), lean = [SPREAD(rng) * 0.12 * h, SPREAD(rng) * 0.12 * h];
  g.limb(V(0, -0.2, 0), V(lean[0], h, lean[1]), 0.045 * size, 0.012, 3, vary(0x5a4a38, rng, 0.06), rng);
  const tiers = 3 + Math.floor(rng() * 2), R = (0.62 + rng() * 0.2) * size;
  for (let i = 0; i < tiers; i++) {
    const t = 0.18 + (i / tiers) * 0.62, rr = R * (1.05 - (i / tiers) * 0.7), ch = h * (0.34 - i * 0.03), shift = (rng() - 0.5) * 0.06;
    const y = h * t;
    g.cone(lean[0] * t + SPREAD(rng) * 0.08, y, lean[1] * t + SPREAD(rng) * 0.08, rr, ch, 5, (p) => cols.at(0.15 + 0.85 * (p.y - y) / ch, shift), rng, 0.35);
  }
  return g.build();
}
// bracken: five to seven fronds arching out of the ground, each folded along its midrib so the lit top shows
function fern(rng) {
  const g = new GeoBuilder(), cols = crownColors(0x8aac4c, 0x46632f, rng);
  const fronds = 5 + Math.floor(rng() * 3), R = 0.75 + rng() * 0.3, a0 = rng() * 6.28, down = V(0, -3, 0);
  for (let i = 0; i < fronds; i++) {
    const a = a0 + (i / fronds) * 6.28 + (rng() - 0.5) * 0.6, L = R * (0.75 + rng() * 0.45), rise = (0.45 + rng() * 0.35) * L;
    const cx = Math.cos(a), cz = Math.sin(a), px = -cz, pz = cx, w = L * (0.16 + rng() * 0.06), top = rise * 1.05, shift = (rng() - 0.5) * 0.08;
    const base = V(cx * 0.05, 0.0, cz * 0.05), mid = V(cx * L * 0.5, rise, cz * L * 0.5), tip = V(cx * L, rise * 0.35, cz * L);
    const left = V(mid.x + px * w, rise - w * 0.45, mid.z + pz * w), right = V(mid.x - px * w, rise - w * 0.45, mid.z - pz * w);
    const col = (p) => cols.at(0.25 + 0.75 * Math.max(0, p.y) / top, shift);
    g.tri(base, left, mid, col, down); g.tri(base, mid, right, col, down);
    g.tri(mid, left, tip, col, down); g.tri(mid, tip, right, col, down);
  }
  return g.build();
}
// A fallen trunk lying along local x on the ground, about 6.8 m: bark weathered silver-brown, a few broken
// stubs, a root plate torn up at one end (+x) or a broken butt; one in three is a birch, whose bark outlasts
// its wood. props.js holds the walker off it with a box 3.4 m by 0.36 m at the instance's scale.
function log(rng, v) {
  const g = new GeoBuilder(), L = 6.4 + rng() * 0.8, r = 0.28 + rng() * 0.08, birchLog = v % 3 === 2;
  const bark = birchLog ? vary(0xd9d3c5, rng, 0.04) : vary(v % 2 ? 0x8a7a66 : 0x7d6a55, rng, 0.07);
  // built standing up the y axis from the butt, then laid down: the lit +x side of the stem ends up on top
  const T = g.stem(0, 0, 0, r, r * 0.55, L, 5, bark, rng, { lean: [SPREAD(rng) * 0.15, SPREAD(rng) * 0.15], bow: [0, SPREAD(rng) * 0.12], flare: 0.35, shade: 0.4, ts: [0, 0.12, 0.6, 1], jag: 0.25, cap: true });
  if (birchLog) for (let i = 0; i < 3; i++) { const t = 0.15 + rng() * 0.7; g.scar(T.at, t, rng() * 6.28, r * 0.9, r * 0.6, new THREE.Color(SCAR)); }
  for (let i = 0; i < 1 + Math.floor(rng() * 3); i++) {
    const t = 0.3 + rng() * 0.6, a = (rng() - 0.5) * 2.4, s = T.at(t), len = 0.4 + rng() * 0.6;
    g.limb(V(s.x + Math.cos(a) * s.r * 0.6, s.y, s.z + Math.sin(a) * s.r * 0.6), V(s.x + Math.cos(a) * len, s.y + len * 0.4, s.z + Math.sin(a) * len), 0.06, 0.02, 3, vary(DEAD, rng, 0.08), rng);
  }
  const b = T.at(0);
  if (v % 2 === 0) {
    // the root plate: a ragged disc of earth and roots standing on edge
    const R = 0.9 + rng() * 0.4, soil = vary(0x5b4838, rng, 0.06), dark = soil.clone().offsetHSL(0, 0, -0.08);
    g.lump(b.x, b.y + 0.05, b.z, R, 6, rng, 0.35, 1, 0.2, 1, (p, tl) => (tl > 0.5 ? soil : dark));
  } else {
    // a broken butt: close the open end with a short splintered cone
    const ring = g.ring(b.x, b.y + 0.02, b.z, b.r * 1.02, 5, rng, 0.2);
    g.fan(V(b.x, b.y - 0.18, b.z), ring, vary(0x8a7354, rng, 0.06), V(b.x, b.y + 0.4, b.z));
  }
  const geo = g.build();
  geo.translate(0, -L / 2, 0);
  geo.rotateZ(Math.PI / 2); // y (the stem) -> -x, x (the lit side) -> +y; the butt ends up at +x
  geo.translate(0, r * 0.9, 0);
  return geo;
}
// a stump: a short flared stem with a broken or rotted top and two or three roots running into the ground
function stump(rng, v) {
  const g = new GeoBuilder(), h = 0.5 + rng() * 0.5, r = 0.25 + rng() * 0.07;
  const bark = vary(v % 2 ? 0x6b5444 : 0x5e4b3c, rng, 0.06);
  g.stem(0, -0.4, 0, r, r * 0.85, h + 0.4, 6, bark, rng, { flare: 0.55, shade: 0.3, ts: [0, 0.35, 1], jag: 0.2 + rng() * 0.25, cap: true });
  for (let i = 0; i < 2 + Math.floor(rng() * 2); i++) {
    const a = rng() * 6.28, len = 0.5 + rng() * 0.4;
    g.limb(V(Math.cos(a) * r * 0.6, 0.12, Math.sin(a) * r * 0.6), V(Math.cos(a) * (r + len), -0.12, Math.sin(a) * (r + len)), 0.09, 0.03, 3, bark, rng);
  }
  return g.build();
}
// A granite outcrop breaking the floor: two to four slabs and blocks of the Shield rock pushed together into a
// low ledge about two units across (placement.js scales it 2.6–5 and sinks it, props.js holds the walker off
// it with a circle of the instance's scale).
function outcrop(rng) {
  const parts = [], n = 2 + Math.floor(rng() * 3);
  for (let i = 0; i < n; i++) {
    const geo = angularRock(rng, i === 0 || rng() < 0.6 ? 'slab' : 'block');
    const s = i === 0 ? 0.85 : 0.4 + rng() * 0.3, a = rng() * 6.28, d = i === 0 ? 0 : 0.35 + rng() * 0.45;
    geo.scale(s, s * (i === 0 ? 0.85 : 1), s);
    geo.rotateY(rng() * 6.28);
    geo.translate(Math.cos(a) * d, i === 0 ? 0 : -0.05 * rng(), Math.sin(a) * d);
    parts.push(geo);
  }
  const geo = mergeGeometries(parts);
  geo.computeBoundingSphere();
  return geo;
}

// ---------- low-detail twins for distant regions ---------------------------------

function lowConifer(rng, h, r, cols, trunkCol, lift = 0.2) {
  const g = new GeoBuilder();
  g.cone(0, h * lift, 0, r, h * (0.55 - lift), 5, cols[0], rng, 0.15);
  g.cone(0, h * 0.5, 0, r * 0.6, h * 0.5, 5, cols[1], rng, 0.15);
  return g.build();
}
// a diamond: two cones base to base, the cheapest round-ish canopy
function lowBlob(rng, y, r, col) {
  const g = new GeoBuilder();
  const ring = g.ring(0, y, 0, r, 5, rng, 0.1);
  g.fan(new THREE.Vector3(0, y + r * 0.9, 0), ring, col, new THREE.Vector3(0, y, 0));
  g.fan(new THREE.Vector3(0, y - r * 0.8, 0), ring, col, new THREE.Vector3(0, y, 0));
  return g;
}
function lowShrub(rng) {
  const g = new GeoBuilder();
  const base = [0x5c8a3a, 0x6f9440, 0x4e7a34, 0x7f9a44][Math.floor(rng() * 4)];
  const n = 1 + (rng() < 0.5 ? 1 : 0);
  for (let i = 0; i < n; i++) g.blob((rng() - 0.5) * 0.9, 0.55 + rng() * 0.3, (rng() - 0.5) * 0.9, 0.7 + rng() * 0.6, vary(base, rng, 0.1), rng, 0.4, 1.3, 0.7, 1.2);
  return g.build();
}
const LOW = {
  whitePine: (rng) => lowConifer(rng, 14 + rng() * 5, 3.2, [vary(0x2f5a3a, rng), vary(0x356341, rng)], vary(0x5a4030, rng), 0.35),
  spruce: (rng) => lowConifer(rng, 10 + rng() * 6, 2.2, [vary(0x274a2f, rng), vary(0x3a6a3e, rng)], vary(0x4a3a2c, rng), 0.12),
  redPine: (rng) => { const h = 12 + rng() * 6; const g = lowBlob(rng, h, 2.6, vary(0x3b6b36, rng)); g.trunk(0, -0.5, 0, 0.4, 0.25, h, 3, vary(0x8a4a2e, rng), rng); return g.build(); },
  birch: (rng) => { const h = 8 + rng() * 5; const g = lowBlob(rng, h * 0.75, 2.4, vary(0x7da84a, rng, 0.1)); g.trunk(0, -0.5, 0, 0.2, 0.1, h * 0.7, 3, vary(0xe6e2d6, rng, 0.04), rng); return g.build(); },
  cedar: (rng) => lowConifer(rng, 7 + rng() * 3, 2.3, [vary(0x2d5436, rng), vary(0x2d5436, rng)], vary(0x6b4a34, rng), 0.1),
  snag: (rng) => { const g = new GeoBuilder(); g.trunk(0, -0.5, 0, 0.3, 0.08, 7 + rng() * 5, 4, vary(0x9a9388, rng, 0.08), rng); return g.build(); },
  boulder: (rng) => angularRock(rng, 'block'),
  shrub: lowShrub,
  tallPine: (rng) => { const h = 17 + rng() * 6; const g = lowBlob(rng, h * 0.93, 2.4, vary(0x3b6b42, rng)); g.trunk(0, -0.5, 0, 0.4, 0.2, h * 0.9, 3, vary(0x6b4a34, rng), rng); return g.build(); },
  jackPine: (rng) => { const h = 4.5 + rng() * 3.5; const g = lowBlob(rng, h * 0.85, 1.5, vary(0x4a7438, rng, 0.1)); g.trunk(0, -0.5, 0, 0.2, 0.08, h * 0.8, 3, vary(0x6a5038, rng), rng); return g.build(); },
  hazel: (rng) => lowBlob(rng, 1.5, 1.1, vary(0x6a9446, rng, 0.08)).build(),
  alder: (rng) => lowBlob(rng, 1.9, 1.35, vary(0x557f3e, rng, 0.08)).build(),
  sapling: (rng) => new GeoBuilder().cone(0, 0, 0, 0.65, 2.3, 4, vary(0x356640, rng), rng, 0.15).build(),
  fern: (rng) => lowBlob(rng, 0.25, 0.55, vary(0x7d9e48, rng, 0.08)).build(),
  log: (rng) => { const g = new GeoBuilder(); g.trunk(0, -3.4, 0, 0.32, 0.2, 6.8, 3, vary(0x857360, rng, 0.07), rng); const geo = g.build(); geo.rotateZ(Math.PI / 2); geo.translate(0, 0.26, 0); return geo; },
  stump: (rng) => { const g = new GeoBuilder(); g.trunk(0, -0.4, 0, 0.32, 0.26, 1.1, 4, vary(0x625040, rng, 0.06), rng); return g.build(); },
  outcrop: (rng) => { const geo = angularRock(rng, 'slab'); geo.scale(0.85, 0.7, 0.85); return geo; },
};

// index order must match placement.js SPECIES. `leaves`: deciduous, with an autumn colour (linear rgb).
// `variants`: geometry variants built for the species (trees get twelve: see profile()).
const ROCK_KINDS = ['slab', 'block', 'boulder'];
const TREE_VARIANTS = 12;
export const SPECIES = [
  { name: 'whitePine', make: whitePine, variants: TREE_VARIANTS },
  { name: 'spruce', make: spruce, variants: TREE_VARIANTS },
  { name: 'redPine', make: redPine, variants: TREE_VARIANTS },
  { name: 'birch', make: birch, leaves: [0.86, 0.56, 0.12], variants: TREE_VARIANTS },
  { name: 'cedar', make: cedar, variants: TREE_VARIANTS },
  { name: 'snag', make: snag, variants: TREE_VARIANTS },
  { name: 'boulder', make: (rng, v) => angularRock(rng, ROCK_KINDS[v % 3]), rock: true, variants: 9 },
  { name: 'shrub', make: shrub, leaves: [0.72, 0.22, 0.08], variants: 6 },
  { name: 'tallPine', make: tallPine, variants: TREE_VARIANTS },
  { name: 'jackPine', make: jackPine, variants: TREE_VARIANTS },
  // the understory and the deadfall: small, so binned in 320 m regions (placement.js) and drawn only near the
  // camera, the low twin past `lod` metres to the region centre and nothing past `cull`; `shadow: false`
  // for the ferns, whose shadow is lost in the ambient occlusion anyway
  { name: 'hazel', make: hazel, leaves: [0.8, 0.58, 0.1], variants: 6, lod: 380, cull: 620 },
  { name: 'alder', make: alder, leaves: [0.42, 0.4, 0.1], variants: 6, lod: 380, cull: 620 },
  { name: 'sapling', make: sapling, variants: 6, lod: 380, cull: 620 },
  { name: 'fern', make: fern, leaves: [0.6, 0.26, 0.05], variants: 4, lod: 300, cull: 460, shadow: false },
  { name: 'log', make: log, variants: 6, lod: 380, cull: 620 },
  { name: 'stump', make: stump, variants: 4, lod: 300, cull: 520 },
  { name: 'outcrop', make: outcrop, rock: true, variants: 6 },
];
const VARIANTS = 4;
const LOD_DISTANCE = 750;  // metres from the camera to a region centre before its low-detail twin is used
const CULL_DISTANCE = 3200; // beyond this a region's trees are not drawn at all
// The understory is walked through, and the fallen logs, stumps and outcrops are held off by their own
// footprints (props.js reads them from the meshes; a carried canoe rides over a stump as over a boulder), so
// none of them are trunks for the collision in tiles.js.
const NOT_TRUNKS = new Set([7, 10, 11, 12, 13, 14, 15, 16]);
const NORMS = [...Array(TREE_VARIANTS).keys()].filter((v) => ROLES[v % ROLES.length] === 'norm');
// A bin's variant groups are drawn apart while the camera is within NEAR_GROUPS metres of the bin's region
// (its nearest edge, not its centre, so the region underfoot always is); further out one mesh draws them all.
// Nothing casts a shadow from a region more than SHADOW_REACH metres away: the far cascade ends at 300 m.
const NEAR_GROUPS = 220;
const SHADOW_REACH = 330;
export const LOD_SCALE = { value: 1 }; // the settings panel scales both distances (0.5 = half, 2 = double)

// Marks foliage vertices (greens and yellows with some saturation; bark, snow-white birch and grey are not)
// so the season can recolour and drop the leaves and leave the trunk alone.
function tagLeaves(geo) {
  const col = geo.getAttribute('color'), leaf = new Float32Array(col.count), c = new THREE.Color(), hsl = { h: 0, s: 0, l: 0 };
  for (let i = 0; i < col.count; i++) {
    c.setRGB(col.getX(i), col.getY(i), col.getZ(i)).getHSL(hsl);
    leaf[i] = hsl.s > 0.2 && hsl.h > 0.1 && hsl.h < 0.47 ? 1 : 0;
  }
  geo.setAttribute('aLeaf', new THREE.BufferAttribute(leaf, 1));
  return geo;
}

// The toon material for a deciduous species: leaves go gold or red in the fall, come in pale in spring, and
// are gone between leaf-drop and leaf-out. The backlit rim of the plain toon material carries over.
function makeLeafMaterial(autumn) {
  const m = makeToonMaterial();
  const u = { uFall: { value: 0 }, uSpring: { value: 0 }, uLeafOn: { value: 1 }, uAutumn: { value: new THREE.Vector3(autumn[0], autumn[1], autumn[2]) } };
  const rim = m.onBeforeCompile;
  m.onBeforeCompile = (shader) => {
    rim(shader);
    Object.assign(shader.uniforms, u);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aLeaf;\nvarying float vLeaf;\nuniform float uFall, uSpring;\nuniform vec3 uAutumn;')
      .replace('#include <color_vertex>', '#include <color_vertex>\n vLeaf = aLeaf;\n if (aLeaf > 0.5) { float lum = dot(vColor.rgb, vec3(0.3, 0.5, 0.2)); vColor.rgb = mix(vColor.rgb, uAutumn * (0.5 + 1.2 * lum), uFall); vColor.rgb = mix(vColor.rgb, vColor.rgb * vec3(1.05, 1.12, 0.72), uSpring); }');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vLeaf;\nuniform float uLeafOn;')
      .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\n if (vLeaf > 0.5 && uLeafOn < 0.5) discard;');
  };
  m.customProgramCacheKey = () => 'toon-leaves';
  m.userData.u = u;
  return m;
}

// Geometry variants (built once) and the shared materials. `setSun(dir, amount)` points the backlit rim of
// every toon material at the sun (world-space direction toward it); main.js calls it with the day's sunDir.
export function makeVegetationKit(seed = 3) {
  const variants = SPECIES.map((s) => Array.from({ length: s.variants || VARIANTS }, (_, v) => {
    const full = s.make(mulberry32(seed * 131 + v * 17 + s.name.length), v);
    const low = LOW[s.name](mulberry32(seed * 131 + v * 17 + s.name.length));
    if (s.rock) return { full, low };
    const out = { full: smoothToon(full), low: smoothToon(low) };
    if (s.leaves) { tagLeaves(out.full); tagLeaves(out.low); }
    return out;
  }));
  const material = makeToonMaterial();
  const rockMaterial = makeRockMaterial();
  const leafMaterials = SPECIES.map((s) => (s.leaves ? makeLeafMaterial(s.leaves) : null));
  const materialFor = (sp) => (SPECIES[sp].rock ? rockMaterial : leafMaterials[sp] || material);
  const setSeason = (season) => {
    for (const m of leafMaterials) if (m) { m.userData.u.uFall.value = season.fall; m.userData.u.uSpring.value = season.spring; m.userData.u.uLeafOn.value = season.leafOn; }
  };
  const setSun = (dir, amount = 1) => setToonSun(dir, amount);
  return { variants, material, rockMaterial, materialFor, setSeason, setSun, seed };
}

// Which geometry variant each variant group of a (region, species) bin draws. The groups get different
// variants; for the trees the two big groups take ordinary trees and the small third group any variant, so a
// leaner, a giant or a runt turns up now and then rather than filling a whole region; the rocks step through
// the kinds (slab, block, boulder) in turn.
function variantsFor(b, nv, ng) {
  const h = hash2(b.rx * 7919 + b.rz, b.sp, 9);
  if (nv === TREE_VARIANTS && ng === 3) {
    const i = Math.floor(h * NORMS.length), j = (i + 1 + Math.floor(hash2(b.rx * 7919 + b.rz, b.sp, 10) * (NORMS.length - 1))) % NORMS.length;
    let k = Math.floor(hash2(b.rx * 7919 + b.rz, b.sp, 11) * nv);
    while (k === NORMS[i] || k === NORMS[j]) k = (k + 1) % nv;
    return [NORMS[i], NORMS[j], k];
  }
  const base = Math.floor(h * nv), step = SPECIES[b.sp].rock ? 1 : Math.max(1, Math.floor(nv / ng));
  return Array.from({ length: ng }, (_, g) => (base + g * step) % nv);
}

// Instanced meshes for one tile's placement bins, matrices and colours straight from the worker: one mesh per
// bin, a bin being one (region, species), the region 640 m or 320 m for the small species. A bin's instances come sorted into variant groups (b.groups:
// the count in each). Far off, the bin's mesh draws all of them with one variant (the low twin past the LOD
// distance), so the forest beyond costs one draw call per bin as before. In and beside the region underfoot
// the mesh draws only its first group, and the other groups are drawn by meshes of their own, each with its
// own variant, so a stand shows several trees of a kind; those are made the first time they are wanted
// (updateVegetationLOD) and share the bin's instance arrays.
// The collision (tiles.js treesNear) reads the same list of bins for trunks and boulders, so the bins of the
// shrubs, the understory, the deadfall and the outcrops leave it once drawn (see NOT_TRUNKS).
export function makeVegetationMeshes(bins, kit) {
  const meshes = [];
  for (const b of bins) {
    if (!b.count) continue;
    const S = SPECIES[b.sp], vs = kit.variants[b.sp], material = kit.materialFor(b.sp);
    const groups = b.groups && b.groups.filter(Boolean).length > 1 ? b.groups : null;
    const picks = variantsFor(b, vs.length, groups ? groups.length : 1), v = vs[picks[0]];
    const mesh = new THREE.InstancedMesh(v.full, material, b.count);
    mesh.instanceMatrix = new THREE.InstancedBufferAttribute(b.matrices, 16);
    mesh.instanceColor = new THREE.InstancedBufferAttribute(b.colors, 3);
    mesh.castShadow = S.shadow !== false;
    mesh.receiveShadow = true;
    mesh.computeBoundingSphere(); // over every instance, with the full geometry; kept across LOD swaps
    // A tile never moves once installed, so the world matrix is set once, by updateVegetationLOD the first
    // time it sees the mesh in its tile group, and the scene's per-render update leaves it alone (there are
    // hundreds of these per tile, and the update ran twice a frame).
    mesh.matrixAutoUpdate = false;
    mesh.matrixWorldAutoUpdate = false;
    mesh.userData.sp = b.sp;
    mesh.userData.lod = {
      full: v.full, low: v.low, cx: b.cx, cz: b.cz, half: (b.size || REGION) / 2, total: b.count,
      lod: S.lod || LOD_DISTANCE, cull: S.cull || CULL_DISTANCE, shadow: S.shadow !== false,
      groups: groups ? { counts: groups, geos: picks.map((i) => vs[i].full), meshes: null } : null,
    };
    meshes.push(mesh);
  }
  for (let i = bins.length - 1; i >= 0; i--) if (NOT_TRUNKS.has(bins[i].sp)) bins.splice(i, 1);
  return meshes;
}

// The meshes for a bin's variant groups after the first, made on first use beside the bin's own mesh (in its
// tile group, so the tile's disposal takes them too).
function groupMeshes(m) {
  const G = m.userData.lod.groups, out = [];
  for (let g = 1, start = G.counts[0]; g < G.counts.length; start += G.counts[g], g++) {
    const n = G.counts[g];
    if (!n) continue;
    const k = new THREE.InstancedMesh(G.geos[g], m.material, n);
    k.instanceMatrix = new THREE.InstancedBufferAttribute(m.instanceMatrix.array.subarray(start * 16, (start + n) * 16), 16);
    k.instanceColor = new THREE.InstancedBufferAttribute(m.instanceColor.array.subarray(start * 3, (start + n) * 3), 3);
    k.receiveShadow = true;
    k.computeBoundingSphere();
    k.matrixAutoUpdate = false; k.matrixWorldAutoUpdate = false;
    k.matrix.copy(m.matrix); k.matrixWorld.copy(m.matrixWorld);
    m.parent.add(k);
    out.push(k);
  }
  return out;
}

// Distance-based LOD and culling for any mesh carrying userData.lod (trees, shrubs, rocks, lake vegetation).
// A bin with variant groups draws them apart while the camera is within NEAR_GROUPS of its region (the
// nearest edge, so the region underfoot always does), and all together with one variant beyond. Shadows only
// from regions within SHADOW_REACH (for the meshes that carry a region and cast at all).
export function updateVegetationLOD(meshes, camPos) {
  const s = LOD_SCALE.value;
  for (const m of meshes) {
    const l = m.userData.lod;
    if (!m.matrixWorldAutoUpdate && !l.placed && m.parent) { m.parent.updateWorldMatrix(true, false); m.matrixWorld.multiplyMatrices(m.parent.matrixWorld, m.matrix); l.placed = true; }
    const d = Math.hypot(l.cx - camPos.x, l.cz - camPos.z);
    m.visible = d < l.cull * s;
    let want = d > l.lod * s ? l.low : l.full;
    if (l.half) {
      const de = Math.hypot(Math.max(0, Math.abs(camPos.x - l.cx) - l.half), Math.max(0, Math.abs(camPos.z - l.cz) - l.half));
      m.castShadow = l.shadow && de < SHADOW_REACH;
      const G = l.groups;
      if (G) {
        const near = m.visible && de < NEAR_GROUPS * s;
        if (near && !G.meshes && m.parent) G.meshes = groupMeshes(m);
        if (G.meshes) for (const k of G.meshes) { k.visible = near; k.castShadow = m.castShadow; }
        m.count = near && G.meshes ? G.counts[0] : l.total;
        if (near) want = l.full;
      }
    }
    if (m.geometry !== want) m.geometry = want;
  }
}
