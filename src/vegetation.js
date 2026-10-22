import * as THREE from 'three';
import { GeoBuilder, vary } from './geobuilder.js';
import { mulberry32, hash2 } from './rng.js';
import { angularRock, makeRockMaterial, makeFoliageMaterial, smoothToon } from './rocks.js';

// Tree, shrub and boulder geometry. Placement lives in placement.js (it runs in the build worker); this file
// turns a tile's placement bins into instanced meshes in tile-local coordinates. Everything is welded smooth
// and shaded with the look's smooth light, wrapped on the leaves, occlusion baked in (rocks.js smoothToon).
//
// The near variants (docs/look.md, pass 4): trunks in two or three segments with a bend, a base flare and a
// shade side baked into the vertex colour; crowns as six to twelve clusters offset to one side, lit on top
// and dark and cool underneath; spruce as uneven whorls with a ragged tip; twelve variants per species that
// spread height 0.6–1.6 with leaners, a giant and a runt. One variant serves a whole 640 m region
// (makeVegetationMeshes picks it by region), so the variety within a stand comes from yaw, scale, squash
// and tint. The far twins (LOW) are untouched: they draw the forest at distance and must stay cheap.

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
  const h = 16 * P.size, bark = vary(0x66503d, rng), cols = crownColors(0x5ead52, 0x2f5b46, rng);
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
  const h = 12.5 * P.size, bark = vary(0x55463a, rng), cols = crownColors(0x45924f, 0x2a5141, rng);
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
  const h = 15 * P.size, bark = vary(0x8d5235, rng), cols = crownColors(0x68a94c, 0x305a43, rng);
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
  const h = 10.5 * P.size, bark = vary(0xe6e2d6, rng, 0.04), cols = crownColors(0x97bb58, 0x32674d, rng);
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
  const h = 8 * P.size, bark = vary(0x74563e, rng), cols = crownColors(0x5f9c49, 0x2e5644, rng);
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
  const h = 20 * P.size, bark = vary(0x74563e, rng), cols = crownColors(0x5ead52, 0x2f5b46, rng);
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
  const h = 6 * P.size, bark = vary(0x705843, rng), cols = crownColors(0x82a145, 0x335b41, rng);
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
  const base = [0x6da145, 0x7ba54a, 0x5e9546, 0x91af4b][Math.floor(rng() * 4)], cols = crownColors(base, 0x305a41, rng);
  const n = 2 + (rng() < 0.5 ? 1 : 0);
  for (let i = 0; i < n; i++) { const shift = (rng() - 0.5) * 0.06; g.lump((rng() - 0.5) * 1.0, 0.5 + rng() * 0.3, (rng() - 0.5) * 1.0, 0.6 + rng() * 0.5, 5, rng, 0.4, 1.3, 0.75, 1.3, (p, tl) => cols.at(0.2 + 0.8 * tl, shift)); }
  return g.build();
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
  const base = [0x6da145, 0x7ba54a, 0x5e9546, 0x91af4b][Math.floor(rng() * 4)];
  const n = 1 + (rng() < 0.5 ? 1 : 0);
  for (let i = 0; i < n; i++) g.blob((rng() - 0.5) * 0.9, 0.55 + rng() * 0.3, (rng() - 0.5) * 0.9, 0.7 + rng() * 0.6, vary(base, rng, 0.1), rng, 0.4, 1.3, 0.7, 1.2);
  return g.build();
}
const LOW = {
  whitePine: (rng) => lowConifer(rng, 14 + rng() * 5, 3.2, [vary(0x377642, rng), vary(0x3e8447, rng)], vary(0x66503d, rng), 0.35),
  spruce: (rng) => lowConifer(rng, 10 + rng() * 6, 2.2, [vary(0x2f603f, rng), vary(0x3b7d44, rng)], vary(0x55463a, rng), 0.12),
  redPine: (rng) => { const h = 12 + rng() * 6; const g = lowBlob(rng, h, 2.6, vary(0x598d3f, rng)); g.trunk(0, -0.5, 0, 0.4, 0.25, h, 3, vary(0x8d5235, rng), rng); return g.build(); },
  birch: (rng) => { const h = 8 + rng() * 5; const g = lowBlob(rng, h * 0.75, 2.4, vary(0x8eb54a, rng, 0.1)); g.trunk(0, -0.5, 0, 0.2, 0.1, h * 0.7, 3, vary(0xe6e2d6, rng, 0.04), rng); return g.build(); },
  cedar: (rng) => lowConifer(rng, 7 + rng() * 3, 2.3, [vary(0x376c45, rng), vary(0x376c45, rng)], vary(0x74563e, rng), 0.1),
  snag: (rng) => { const g = new GeoBuilder(); g.trunk(0, -0.5, 0, 0.3, 0.08, 7 + rng() * 5, 4, vary(0x9a9388, rng, 0.08), rng); return g.build(); },
  boulder: (rng) => angularRock(rng, 'block'),
  shrub: lowShrub,
  tallPine: (rng) => { const h = 17 + rng() * 6; const g = lowBlob(rng, h * 0.93, 2.4, vary(0x4e8b41, rng)); g.trunk(0, -0.5, 0, 0.4, 0.2, h * 0.9, 3, vary(0x74563e, rng), rng); return g.build(); },
  jackPine: (rng) => { const h = 4.5 + rng() * 3.5; const g = lowBlob(rng, h * 0.85, 1.5, vary(0x6c8d3f, rng, 0.1)); g.trunk(0, -0.5, 0, 0.2, 0.08, h * 0.8, 3, vary(0x705843, rng), rng); return g.build(); },
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
];
const VARIANTS = 4;
const LOD_DISTANCE = 750;  // metres from the camera to a region centre before its low-detail twin is used
const CULL_DISTANCE = 3200; // beyond this a region's trees are not drawn at all
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

// The foliage material for a deciduous species (the look's wrapped Lambert, rocks.js): leaves go gold or red
// in the fall, come in pale in spring, and are gone between leaf-drop and leaf-out.
function makeLeafMaterial(autumn) {
  const u = { uFall: { value: 0 }, uSpring: { value: 0 }, uLeafOn: { value: 1 }, uAutumn: { value: new THREE.Vector3(autumn[0], autumn[1], autumn[2]) } };
  const m = makeFoliageMaterial({}, (shader) => {
    Object.assign(shader.uniforms, u);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aLeaf;\nvarying float vLeaf;\nuniform float uFall, uSpring;\nuniform vec3 uAutumn;')
      .replace('#include <color_vertex>', '#include <color_vertex>\n vLeaf = aLeaf;\n if (aLeaf > 0.5) { float lum = dot(vColor.rgb, vec3(0.3, 0.5, 0.2)); vColor.rgb = mix(vColor.rgb, uAutumn * (0.5 + 1.2 * lum), uFall); vColor.rgb = mix(vColor.rgb, vColor.rgb * vec3(1.05, 1.12, 0.72), uSpring); }');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vLeaf;\nuniform float uLeafOn;')
      .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\n if (vLeaf > 0.5 && uLeafOn < 0.5) discard;');
  }, 'look-leaves');
  m.userData.u = u;
  return m;
}

// Geometry variants (built once) and the shared materials.
export function makeVegetationKit(seed = 3) {
  const variants = SPECIES.map((s) => Array.from({ length: s.variants || VARIANTS }, (_, v) => {
    const full = s.make(mulberry32(seed * 131 + v * 17 + s.name.length), v);
    const low = LOW[s.name](mulberry32(seed * 131 + v * 17 + s.name.length));
    if (s.rock) return { full, low };
    const out = { full: smoothToon(full), low: smoothToon(low) };
    if (s.leaves) { tagLeaves(out.full); tagLeaves(out.low); }
    return out;
  }));
  const material = makeFoliageMaterial();
  const rockMaterial = makeRockMaterial();
  const leafMaterials = SPECIES.map((s) => (s.leaves ? makeLeafMaterial(s.leaves) : null));
  const materialFor = (sp) => (SPECIES[sp].rock ? rockMaterial : leafMaterials[sp] || material);
  const setSeason = (season) => {
    for (const m of leafMaterials) if (m) { m.userData.u.uFall.value = season.fall; m.userData.u.uSpring.value = season.spring; m.userData.u.uLeafOn.value = season.leafOn; }
  };
  return { variants, material, rockMaterial, materialFor, setSeason, seed };
}

// One instanced mesh per (region, species) bin, matrices and colours straight from the worker.
export function makeVegetationMeshes(bins, kit) {
  const meshes = [];
  for (const b of bins) {
    if (!b.count) continue;
    const vs = kit.variants[b.sp];
    const v = vs[Math.floor(hash2(b.rx * 7919 + b.rz, b.sp, 9) * vs.length)];
    const mesh = new THREE.InstancedMesh(v.full, kit.materialFor(b.sp), b.count);
    mesh.instanceMatrix = new THREE.InstancedBufferAttribute(b.matrices, 16);
    mesh.instanceColor = new THREE.InstancedBufferAttribute(b.colors, 3);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.computeBoundingSphere(); // computed once with the full geometry, kept across LOD swaps
    mesh.matrixAutoUpdate = false;
    mesh.userData.lod = { full: v.full, low: v.low, cx: b.cx, cz: b.cz, lod: LOD_DISTANCE, cull: CULL_DISTANCE };
    meshes.push(mesh);
  }
  return meshes;
}

// Distance-based LOD and culling for any mesh carrying userData.lod (trees, shrubs, rocks, lake vegetation).
export function updateVegetationLOD(meshes, camPos) {
  for (const m of meshes) {
    const l = m.userData.lod;
    const d = Math.hypot(l.cx - camPos.x, l.cz - camPos.z), s = LOD_SCALE.value;
    m.visible = d < l.cull * s;
    const want = d > l.lod * s ? l.low : l.full;
    if (m.geometry !== want) m.geometry = want;
  }
}
