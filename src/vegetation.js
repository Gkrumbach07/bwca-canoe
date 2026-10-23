import * as THREE from 'three';
import { GeoBuilder, CardBuilder, vary } from './geobuilder.js';
import { mulberry32, hash2, smoothstep } from './rng.js';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { angularRock, makeRockMaterial, smoothToon, screeBlock } from './rocks.js';
import { cliffModule, cliffModuleFar, makeCliffMaterial } from './cliffs.js';
import { GROUPS } from './placement.js';
import { makeLookMaterial, FOLIAGE_WRAP } from './shading.js';
import { bakeOcclusion } from './occlusion.js';
import { foliageAtlas } from './textures.js';
import { REGION } from './placement.js';
import { SWAY, glslSway } from './wind.js';

// Tree, shrub and boulder geometry. Placement lives in placement.js (it runs in the build worker); this file
// turns a tile's placement bins into instanced meshes in tile-local coordinates.
//
// Foliage as cards on branches (docs/look.md, pivot pass 2). A tree is a mesh trunk (segmented, bent, flared,
// scarred, the tree pass's work), a skeleton of branches off it and, hung on the branches, alpha-tested cards
// that sample painted sprites from the foliage atlas (textures.js): leaf clusters where a broadleaf's twigs end,
// needle sprays crossed along a conifer's whorl branches, brushes of long needles on a pine's branchlets. Every
// card's anchor sits on a branch, so nothing floats. The cards' shading normals point away from the crown (a
// spruce's out from its stem and up, all leaned toward the sky), so the crown shades as one soft volume under
// the smooth light, and the occlusion bake (occlusion.js) dims the inside of it, half as much as the bark (a
// crown is lit through). Back-lit leaves glow with the sun let through them (leafGlow, see CARD), brightest at
// a crown's open edges. The material (makeCardMaterial) lowers the alpha cutoff with distance: near, the leaf
// edges show; far, every card fills out to its sprite's halo and the crown reads as one flat shape. Bark and cards share one geometry and one material per species, so the draw
// calls stay one per bin; the bark is told apart by its uv (-1, -1) and its zero wrap.
//
// Twelve variants per tree species spread height 0.6–1.6 with leaners, a giant and a runt (profile). Near the
// camera a stand draws three variants of each species (makeVegetationMeshes, pass 5), further out one per
// region, and past the LOD distance the far twin: two big cards crossed on the crown in a far sprite, sized
// and coloured from its own near variant so the swap keeps the silhouette (farTwin).
//
// Pass 5 added the understory (hazel, alder, a young fir, bracken), the deadfall (logs, stumps) and the
// granite outcrops; the deadfall and the rocks are solid geometry (rocks.js) and stay so. The bluff pass added
// the tamarack, the aspen and the black spruce, the scree's blocks (rocks.js screeBlock) and the cliff modules
// (cliffs.js).

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const UP = V(0, 1, 0);
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
// a card colour from the crown's gradient by height between y0 and y1, with the cluster's own small shift;
// `lo` is where the lowest cards start on it (the underside colour itself is never reached in full)
const shade = (cols, y0, y1, rng, lo = 0.35) => { const shift = (rng() - 0.5) * 0.06; return (p) => cols.at(lo + (1 - lo) * (p.y - y0) / (y1 - y0), shift); };

// A few dead lower branches: thin drooping tubes off the stem between heights t0 and t1.
function deadBranches(g, rng, at, count, t0, t1, L0, L1, bark) {
  const col = vary(DEAD, rng, 0.08);
  for (let i = 0; i < count; i++) {
    const t = t0 + rng() * (t1 - t0), a = rng() * 6.28, L = L0 + rng() * (L1 - L0), s = at(t);
    const p0 = V(s.x + Math.cos(a) * s.r * 0.8, s.y, s.z + Math.sin(a) * s.r * 0.8);
    g.limb(p0, V(s.x + Math.cos(a) * L, s.y - L * (0.05 + rng() * 0.2), s.z + Math.sin(a) * L), 0.05 + s.r * 0.12, 0.02, 3, bark ? col.clone().lerp(bark, 0.3) : col, rng);
  }
}

// ---------- the skeleton and the cards ----------------------------------------------

const dirAt = (az, el) => V(Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el));
const perp = (d) => (Math.abs(d.y) < 0.9 ? V(0, 1, 0) : V(1, 0, 0)).cross(d).normalize();
const vec = (s) => V(s.x, s.y, s.z);
// Card shading normals. away: from the centre c of an ellipsoid (rx, ry, rz), the crown of a broadleaf or a
// pine's tuft of branches. outward: from the stem's axis at the corner's height, tipped up by `up`, the cone
// of a conifer's whorls. mix: a blend of two.
const away = (c, rx, ry, rz) => (p) => V((p.x - c.x) / (rx * rx), (p.y - c.y) / (ry * ry), (p.z - c.z) / (rz * rz)).normalize();
const outward = (T, base, H, up) => (p) => {
  const a = T.at(Math.min(1, Math.max(0, (p.y - base) / H))), v = V(p.x - a.x, 0, p.z - a.z), L = v.length();
  return (L > 1e-3 ? v.divideScalar(L) : v.set(0, 0, 0)).addScaledVector(UP, up).normalize();
};
const mix = (a, b, k) => (p) => a(p).multiplyScalar(1 - k).addScaledVector(b(p), k).normalize();
// skyward: a normal turned toward the sky, its elevation e going to e (1 - k) + 90° k (k 0.3: straight down
// ends up 63° down, level 27° up), keeping its heading (or, pointing straight down, the heading from the
// crown's axis through c). The tops then take all of the sky fill and the undersides some, so a crown seen
// from below is a lit mass, not a black one.
const skyward = (nrm, c, k) => (p) => {
  const n = nrm(p);
  let dx = n.x, dz = n.z, hl = Math.hypot(dx, dz);
  if (hl < 1e-3) { dx = p.x - c.x; dz = p.z - c.z; hl = Math.hypot(dx, dz) || 1; if (hl === 1 && !dx && !dz) dx = 1; }
  const e = Math.asin(Math.max(-1, Math.min(1, n.y))) * (1 - k) + (Math.PI / 2) * k, ce = Math.cos(e) / hl;
  return V(dx * ce, Math.sin(e), dz * ce);
};

// A leaf cluster where a twig ends: two cards crossed about a line leaning out of the crown (`out`), so it
// is never seen edge-on, or one card facing out (`single`), size metres across, centred on the twig.
function leafy(cards, slot, p, out, size, nrm, col, rng, single = false) {
  if (single) {
    const ax = perp(out).applyAxisAngle(out, rng() * 6.28), ay = out.clone().cross(ax).normalize();
    cards.card(slot, p, ax, ay, size, size, nrm, col);
    return;
  }
  const a = out.clone().add(V(SPREAD(rng), SPREAD(rng), SPREAD(rng)).multiplyScalar(0.9)).normalize();
  cards.cross(slot, p, a, perp(a).applyAxisAngle(a, rng() * 6.28), size, size, nrm, col);
}
// Needles along a conifer branch from o in direction d: two spray (or tuft) cards crossed on it, the first
// lying in the branch's own tilt and the second standing, rolled a little at random, `len` from the anchor out
// and `wid` across.
function needles(cards, slot, o, d, len, wid, nrm, col, rng) {
  const flat = UP.clone().cross(d);
  if (flat.lengthSq() < 1e-6) flat.set(1, 0, 0);
  flat.normalize().applyAxisAngle(d, SPREAD(rng) * 0.35);
  cards.cross(slot, o, d, flat, len, wid, nrm, col, 0.5); // anchored at the stem end: swell it about half as far
}

// The tree's two parts into one geometry: the bark welded and smoothed (one smooth volume per coloured part,
// as rocks.js smoothToon does), the cards with their own normals; uv (-1, -1) and no wrap on the bark, the
// foliage wrap on the cards; then the occlusion bake over both, against a ground plane at y 0.3 (placement
// sinks trees about that far), so the inner crown and the trunk under it go dark. The cards count as solid
// in the bake although half of each is cut away, so the floor is kept high, and the cards keep only
// CARD_AO of what the bake takes off (a card deep in the crown ends at 1 - 0.5 CARD_AO of its colour: leaves
// pass light on to the ones behind them, so the inside of a crown is dim, not dark). How open each card
// corner is (0 deep inside, 1 in the clear) goes to the material as aOcc, where it says how much sun a
// back-lit leaf lets through. The bake runs on a stand-in without the second card of each crossed pair (it
// hangs where the first does and takes the first's values, corner for corner): about half the cards, about
// half the time.
const BAKE = { rays: 12, floor: 0.5 };
const CARD_AO = 0.55;
const withWrap = (geo, w) => geo.setAttribute('aWrap', new THREE.Float32BufferAttribute(new Float32Array(geo.getAttribute('position').count).fill(w), 1));
function finish(g, cards, { ground = 0.3, reach = null, bake = true } = {}) {
  const parts = [];
  let bark = null;
  if (g && g.p.length) {
    const raw = g.build();
    raw.deleteAttribute('normal');
    bark = mergeVertices(raw, 1e-4);
    bark.computeVertexNormals();
    const n = bark.getAttribute('position').count;
    bark.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n * 2).fill(-1), 2));
    withWrap(bark, 0);
    bark.setAttribute('aGrow', new THREE.Float32BufferAttribute(new Float32Array(n * 3), 3));
    parts.push(bark);
  }
  const nc = cards ? cards.count : 0;
  if (nc) parts.push(withWrap(cards.build(), FOLIAGE_WRAP));
  const geo = parts.length > 1 ? mergeGeometries(parts) : parts[0];
  const n = geo.getAttribute('position').count, open = new Float32Array(n).fill(1);
  if (bake) {
    const lead = nc ? withWrap(cards.build((k) => cards.pair[k] < 0), FOLIAGE_WRAP) : null;
    const proxy = lead && bark ? mergeGeometries([bark, lead]) : lead || bark.clone();
    const pc = proxy.getAttribute('color').array, was = pc.slice();
    bakeOcclusion(proxy, { ...BAKE, ground, reach });
    const kAt = (i) => { const a = Math.max(was[i * 3], was[i * 3 + 1], was[i * 3 + 2]); return a > 1e-6 ? Math.max(pc[i * 3], pc[i * 3 + 1], pc[i * 3 + 2]) / a : 1; };
    const C = geo.getAttribute('color').array, nb = bark ? bark.getAttribute('position').count : 0;
    for (let i = 0; i < nb; i++) { const k = kAt(i); for (let c = 0; c < 3; c++) C[i * 3 + c] *= k; }
    const slot = new Int32Array(nc);
    for (let k = 0, m = 0; k < nc; k++) slot[k] = cards.pair[k] < 0 ? m++ : slot[cards.pair[k]];
    for (let k = 0; k < nc; k++) for (let q = 0; q < 4; q++) {
      const i = nb + k * 4 + q, kk = kAt(nb + slot[k] * 4 + q), lift = 1 - CARD_AO * (1 - kk);
      for (let c = 0; c < 3; c++) C[i * 3 + c] *= lift;
      open[i] = Math.min(1, Math.max(0, (kk - BAKE.floor) / (1 - BAKE.floor)));
    }
    geo.getAttribute('color').needsUpdate = true;
    geo.userData.occlusion = proxy.userData.occlusion;
  }
  geo.setAttribute('aOcc', new THREE.Float32BufferAttribute(open, 1));
  geo.computeBoundingSphere();
  return geo;
}
// Solid geometry (the deadfall, a snag's far twin) for the same material: rocks.js smoothToon, and the bark's uv.
function solid(geo) {
  if (geo.getAttribute('uv')) return geo;
  const g = smoothToon(geo), n = g.getAttribute('position').count;
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n * 2).fill(-1), 2));
  g.setAttribute('aGrow', new THREE.Float32BufferAttribute(new Float32Array(n * 3), 3));
  g.setAttribute('aOcc', new THREE.Float32BufferAttribute(new Float32Array(n).fill(1), 1));
  return g;
}

// A broadleaf crown off a stem: `n` branches between the stem's t0 and t1, turned by the golden angle, rising
// at rise[0] low down to rise[1] at the top and drooping at the ends, longest low; each with a side branch
// from its outer half; leaf clusters at every twig end and along the outer half. The crown is the ellipsoid
// (C, R, ry) the cards' normals point away from.
function broadCrown(g, cards, rng, S, o) {
  const { t0, t1, n, R, C, ry, size, slot, twig, cols, y0, y1, rise = [0.55, 1.05], droop = 0.4, side = 1 } = o;
  const nrm = skyward(away(C, R * 1.15, ry, R * 1.15), C, 0.3), az0 = rng() * 6.28;
  const outOf = (p) => p.clone().sub(C).normalize();
  for (let i = 0; i < n; i++) {
    const f = (i + 0.5) / n, t = t0 + (t1 - t0) * f + SPREAD(rng) * 0.03, s = S.at(t);
    const az = az0 + i * 2.4 + SPREAD(rng) * 0.5, el = rise[0] + (rise[1] - rise[0]) * f + SPREAD(rng) * 0.15;
    const L = R * (1.2 - 0.6 * f) * (0.8 + rng() * 0.35);
    const p0 = vec(s), p1 = p0.clone().addScaledVector(dirAt(az, el), L * 0.5), p2 = p1.clone().addScaledVector(dirAt(az + SPREAD(rng) * 0.3, el - droop), L * 0.5);
    const B = g.branch([p0, p1, p2], Math.max(0.025, s.r * 0.5), 0.012, 3, twig, rng);
    // clusters down the branch from its tip: crossed at the tip and halfway in, single between, so the
    // leaves run the whole outer two thirds of it and overlap into one mass with the next branch's
    for (const [u, single, k] of [[1, false, 1], [0.8, true, 0.92], [0.6, false, 0.85], [0.42, true, 0.75]]) {
      if (u < 0.7 && L < R * 0.6) continue;
      const q = B.at(u + SPREAD(rng) * 0.04).p;
      leafy(cards, slot, q, outOf(q), size * (0.85 + rng() * 0.3) * k, nrm, shade(cols, y0, y1, rng), rng, single);
    }
    if (rng() < side) {
      const q = B.at(0.4 + rng() * 0.25), sd = perp(q.d).applyAxisAngle(q.d, rng() * 6.28);
      const d3 = q.d.clone().addScaledVector(sd, 0.9).addScaledVector(UP, 0.15).normalize();
      const e = q.p.clone().addScaledVector(d3, L * (0.4 + rng() * 0.2));
      g.branch([q.p, e], Math.max(0.012, q.r * 0.8), 0.008, 3, twig, rng);
      leafy(cards, slot, e, outOf(e), size * (0.8 + rng() * 0.3), nrm, shade(cols, y0, y1, rng), rng);
      const m = q.p.clone().lerp(e, 0.55);
      leafy(cards, slot, m, outOf(m), size * (0.7 + rng() * 0.25), nrm, shade(cols, y0, y1, rng), rng, true);
    }
  }
}

// A conifer's whorls up a stem: `whorls` levels between t0 and t1, unevenly spaced, `nb(f)` branches each
// (f 0 at the lowest whorl, 1 at the top), spread R(f) wide and drooping by droop(f) radians; each branch two
// crossed sprays from the stem out past its tip, and a bark tube on the branches where `tube(f)`.
function whorls(g, cards, rng, T, o) {
  const { t0, t1, count, nb, R, droop, tube, nrm, cols, y0, y1, bark, slot = 'spray', wid = 0.6, rise = 0, fan = 0, lo = 0.3 } = o;
  const gaps = []; for (let i = 0; i < count - 1; i++) gaps.push(0.6 + rng() * 0.9);
  const sum = gaps.reduce((a, b) => a + b, 0) || 1;
  let t = t0;
  for (let i = 0; i < count; i++) {
    const f = i / Math.max(1, count - 1), s = T.at(t), k = nb(f), az0 = rng() * 6.28, p0 = vec(s);
    for (let j = 0; j < k; j++) {
      const az = az0 + (j / k) * 6.28 + SPREAD(rng) * 0.5, L = R(f) * (0.85 + rng() * 0.3);
      const d = dirAt(az, rise - droop(f) + SPREAD(rng) * 0.1);
      if (tube(f)) g.branch([p0, p0.clone().addScaledVector(d, L * 0.92)], 0.02 + s.r * 0.25, 0.01, 3, bark, rng);
      needles(cards, slot, p0, d, L * 1.12, L * wid, nrm, shade(cols, y0, y1, rng, lo), rng);
      // a second, shorter pair off the branch's outer half, swung to one side and drooping a little more:
      // the branch reads as a fan of sprays, not one bottle brush
      if (rng() < fan) {
        const q = p0.clone().addScaledVector(d, L * (0.3 + rng() * 0.2)), sw = (rng() < 0.5 ? -1 : 1) * (0.45 + rng() * 0.35);
        const d2 = d.clone().applyAxisAngle(UP, sw).addScaledVector(UP, -0.18).normalize();
        needles(cards, slot, q, d2, L * 0.75, L * wid * 0.8, nrm, shade(cols, y0, y1, rng, lo), rng);
      }
    }
    if (i < count - 1) t += (gaps[i] / sum) * (t1 - t0);
  }
}

// Pine branches carrying brushes of long needles: `n` branches between the stem's t0 and t1, each out at
// elevation el(f) and bending up at the end; tufts (crossed tuft cards pointing out and up) at the tip and
// along the outer part. Normals away from the branch's own plate (a centre under its outer half) blended
// with the crown's.
function pineBranches(g, cards, rng, T, o) {
  const { t0, t1, n, L: Lf, el, tufts = 3, crown, cols, y0, y1, bark, size, segs = 2, swing = 0, bias = 0, crooked = 0, rise = [0.4, 0.4], step = 0.3 } = o;
  const az0 = rng() * 6.28;
  for (let i = 0; i < n; i++) {
    const f = (i + 0.5) / n, t = t0 + (t1 - t0) * f + SPREAD(rng) * 0.03, s = T.at(t);
    const az = az0 + i * 2.4 + SPREAD(rng) * 0.6, L = Lf(f) * (1 + bias * Math.cos(az - swing)) * (0.8 + rng() * 0.35);
    const e = el(f) + SPREAD(rng) * 0.12, p0 = vec(s), pts = [p0];
    if (segs > 1) {
      const p1 = p0.clone().addScaledVector(dirAt(az + SPREAD(rng) * crooked, e), L * 0.55);
      pts.push(p1, p1.clone().addScaledVector(dirAt(az + SPREAD(rng) * (0.25 + crooked), e + 0.3 + SPREAD(rng) * crooked), L * 0.45));
    } else pts.push(p0.clone().addScaledVector(dirAt(az, e), L));
    const B = g.branch(pts, 0.03 + s.r * 0.3, 0.012, 3, bark, rng);
    const plate = B.at(0.65).p.addScaledVector(UP, -0.7), nrm = skyward(mix(crown, away(plate, L * 0.7, 0.9, L * 0.7), 0.5), plate, 0.25);
    // tufts from the tip inward every `step` of the branch, pointing out and up by rise[0] + rng * rise[1]
    // (low for a white pine's level plates), alternately swung to either side so they spread into a plate
    for (let k = 0; k < tufts; k++) {
      const u = k === 0 ? 1 : 1 - k * step - rng() * 0.08, q = B.at(u);
      const d = q.d.clone().addScaledVector(UP, rise[0] + rng() * rise[1]).addScaledVector(perp(q.d), (k % 2 ? 1 : -1) * (k ? 0.35 : 0) + SPREAD(rng) * 0.7).normalize();
      const w = size * (0.8 + rng() * 0.35) * (k === 0 ? 1 : 0.88);
      needles(cards, 'tuft', q.p, d, w, w * 0.58, nrm, shade(cols, y0, y1, rng, 0.3), rng);
    }
  }
}

// ---------- species (full detail) ------------------------------------------------

// Eastern white pine: a tall trunk, four or five uneven tiers of long level branches swept to one side,
// upturned at the ends, soft brushes of needles on them that read as plates; a ragged leader.
function whitePine(rng, v) {
  const g = new GeoBuilder(), cards = new CardBuilder(), P = profile(v, rng);
  const h = 16 * P.size, bark = vary(0x66503d, rng), cols = crownColors(0x6cbf5c, 0x386a52, rng);
  const T = g.stem(0, -0.5, 0, 0.45 * P.girth, 0.07, h * 0.98, 5, bark, rng, { lean: leanOf(P, h), bow: bowOf(P, h), flare: 0.45, shade: 0.32, ts: [0, 0.1, 0.45, 0.75, 1] });
  deadBranches(g, rng, T.at, 1 + Math.floor(rng() * 2), 0.25, 0.4, 0.9, 1.7, bark);
  const R = (2.2 + rng() * 0.6) * (0.75 + P.size * 0.35), top = T.at(0.8), C = V(top.x, h * 0.72, top.z);
  const y0 = h * 0.42, y1 = h, crown = away(C, R * 1.2, h * 0.35, R * 1.2);
  // level branches carrying five tufts each from the tip in, laid nearly flat and swung either side: the
  // layered plates of a white pine
  pineBranches(g, cards, rng, T, { t0: 0.42, t1: 0.92, n: 10 + Math.floor(rng() * 2), L: (f) => R * (1.15 - f * 0.55), el: (f) => 0.04 + f * 0.25, tufts: 5, step: 0.17, rise: [0.08, 0.25], crown, cols, y0, y1, bark, size: 3.2 * (0.75 + P.size * 0.25), swing: rng() * 6.28, bias: 0.3 });
  const tp = T.at(1), lead = vec(tp);
  needles(cards, 'tuft', lead.clone().addScaledVector(UP, -1.6), UP.clone().addScaledVector(perp(UP).applyAxisAngle(UP, rng() * 6.28), 0.5).normalize(), 2.8, 1.7, skyward(crown, C, 0.25), shade(cols, y0, y1, rng), rng);
  return finish(g, cards);
}
// White spruce: a straight stem in a narrow cone of seven or eight whorls, the branches drooping, longest low,
// a spire on top; bark on the lower branches (the upper ones are needle sprays crossed on their twig).
function spruce(rng, v) {
  const g = new GeoBuilder(), cards = new CardBuilder(), P = profile(v, rng);
  const h = 12.5 * P.size, bark = vary(0x55463a, rng), cols = crownColors(0x52ab5c, 0x3a6b56, rng);
  const T = g.stem(0, -0.5, 0, 0.3 * P.girth, 0.04, h, 4, bark, rng, { lean: leanOf(P, h), bow: bowOf(P, h), flare: 0.35, shade: 0.3 });
  deadBranches(g, rng, T.at, Math.floor(rng() * 2), 0.05, 0.12, 0.6, 1.2, bark);
  const R = (2.0 + rng() * 0.5) * (0.8 + P.size * 0.3), nrm = outward(T, -0.5, h, 1.0);
  // seven or eight whorls of four or five drooping branches, one in eight fanned with a second pair of
  // sprays: a dense cone in layers (the spruce is the commonest tree, so its count is held tight)
  whorls(g, cards, rng, T, { t0: 0.08, t1: 0.83, count: 7 + Math.floor(rng() * 2), nb: (f) => (f < 0.45 ? 5 : 4), R: (f) => R * (1 - f * 0.75) + 0.25, droop: (f) => 0.22 + 0.34 * (1 - f), tube: (f) => f < 0.08, nrm, cols, y0: 0, y1: h, bark, wid: 1.15, fan: 0.12, lo: 0.4 });
  const a = T.at(0.84), b = T.at(1), d = vec(b).sub(vec(a)), L = d.length();
  needles(cards, 'spray', vec(a), d.normalize(), L * 1.25, 0.55, nrm, shade(cols, 0, h, rng), rng);
  return finish(g, cards);
}
// Red pine: a long straight reddish trunk and a rounded crown of upswept branches ending in dense tufts.
function redPine(rng, v) {
  const g = new GeoBuilder(), cards = new CardBuilder(), P = profile(v, rng);
  const h = 15 * P.size, bark = vary(0x8d5235, rng), cols = crownColors(0x77bd56, 0x386650, rng);
  const T = g.stem(0, -0.5, 0, 0.42 * P.girth, 0.08, h * 0.97, 5, bark, rng, { lean: leanOf(P, h), bow: [P.bow[0] * h * 0.5, P.bow[1] * h * 0.5], flare: 0.35, shade: 0.3, ts: [0, 0.1, 0.5, 0.8, 1] });
  deadBranches(g, rng, T.at, 2, 0.35, 0.55, 0.8, 1.4, bark);
  const R = (1.5 + rng() * 0.6) * (0.75 + P.size * 0.35), tp = T.at(0.85), C = V(tp.x, h * 0.83, tp.z);
  const y0 = h * 0.6, y1 = h * 1.05, crown = away(C, R * 1.25, R * 0.9, R * 1.25);
  pineBranches(g, cards, rng, T, { t0: 0.6, t1: 0.93, n: 9 + Math.floor(rng() * 2), L: (f) => R * (1.1 - f * 0.45), el: (f) => 0.45 + f * 0.5, tufts: 4, step: 0.24, segs: 1, crown, cols, y0, y1, bark, size: 2.8 * (0.75 + P.size * 0.25) });
  needles(cards, 'tuft', vec(T.at(0.94)), UP.clone().addScaledVector(perp(UP).applyAxisAngle(UP, rng() * 6.28), 0.4).normalize(), 2.6, 1.6, skyward(crown, C, 0.25), shade(cols, y0, y1, rng), rng);
  return finish(g, cards);
}
// Paper birch: a white trunk running up into the crown as the leader, branches climbing off it, drooping at
// the ends, side branches, small-leaved clusters at every twig end; one in four forks low.
function birch(rng, v) {
  const g = new GeoBuilder(), cards = new CardBuilder(), P = profile(v, rng);
  const h = 10.5 * P.size, bark = vary(0xe6e2d6, rng, 0.04), cols = crownColors(0xa6cc5e, 0x3d7656, rng);
  const lean = leanOf(P, h * 1.3), forked = v % 4 === 1, twig = bark.clone().lerp(new THREE.Color(0x4f3d32), 0.62);
  const T = g.stem(0, -0.5, 0, 0.2 * P.girth, 0.035, h * 0.96, 5, bark, rng, { lean, bow: bowOf(P, h), flare: 0.3, shade: 0.28, ts: [0, 0.1, 0.55, 1] });
  // branch scars: dark lenses down the lower trunk, and one to three short dead stubs below the crown
  const scars = 4 + Math.floor(rng() * 3);
  for (let i = 0; i < scars; i++) { const t = 0.08 + rng() * 0.5, s = T.at(t); g.scar(T.at, t, rng() * 6.28, s.r * (0.9 + rng() * 0.5), s.r * (0.6 + rng() * 0.4), new THREE.Color(SCAR)); }
  const stubCol = bark.clone().lerp(new THREE.Color(DEAD), 0.55);
  for (let i = 0; i < 1 + Math.floor(rng() * 3); i++) {
    const t = 0.3 + rng() * 0.18, a = rng() * 6.28, L = 0.45 + rng() * 0.5, s = T.at(t);
    g.limb(V(s.x + Math.cos(a) * s.r * 0.7, s.y, s.z + Math.sin(a) * s.r * 0.7), V(s.x + Math.cos(a) * L, s.y + L * (0.4 + rng() * 0.5), s.z + Math.sin(a) * L), 0.035 + s.r * 0.25, 0.015, 3, stubCol, rng);
  }
  const R = (1.5 + rng() * 0.6) * (0.75 + P.size * 0.35), c = T.at(0.72), C = V(c.x, c.y, c.z), ry = h * 0.3;
  const y0 = C.y - ry, y1 = C.y + ry * 1.2, size = 2.4 * (0.8 + P.size * 0.2);
  const o = { R: R * (forked ? 0.85 : 1), C, ry, size, slot: 'leaf', twig, cols, y0, y1 };
  broadCrown(g, cards, rng, T, { ...o, t0: 0.44, t1: 0.9, n: (forked ? 5 : 6) + Math.floor(rng() * 2) });
  if (forked) {
    const s = T.at(0.22), a = rng() * 6.28, L = h * (0.55 + rng() * 0.12), fl = [Math.cos(a) * h * 0.28 + lean[0] * 0.5, Math.sin(a) * h * 0.28 + lean[1] * 0.5];
    const F = g.stem(s.x, s.y, s.z, s.r * 0.72, 0.03, L, 5, bark, rng, { lean: fl, bow: [0, 0], flare: 0, shade: 0.28, ts: [0, 0.5, 1] });
    const fc = F.at(0.75);
    broadCrown(g, cards, rng, F, { ...o, C: V(fc.x, fc.y, fc.z), R: R * 0.8, t0: 0.5, t1: 0.9, n: 3 + Math.floor(rng() * 2) });
    leafy(cards, 'leaf', vec(F.at(1)), UP, size, skyward(away(C, R * 1.15, ry, R * 1.15), C, 0.3), shade(cols, y0, y1, rng), rng);
  }
  const nrm = skyward(away(C, R * 1.15, ry, R * 1.15), C, 0.3);
  // the leader's cluster crossed about a line leaning well off plumb, so from below neither card is edge-on
  leafy(cards, 'leaf', vec(T.at(1)), perp(UP).applyAxisAngle(UP, rng() * 6.28).addScaledVector(UP, 1.1).normalize(), size, nrm, shade(cols, y0, y1, rng), rng);
  leafy(cards, 'leaf', vec(T.at(0.9)), perp(UP).applyAxisAngle(UP, rng() * 6.28).addScaledVector(UP, 0.6).normalize(), size * 0.9, nrm, shade(cols, y0, y1, rng), rng, true);
  // sprigs straight off the leader inside the crown, so the gaps between the branches show leaves, not sky
  for (let i = 0; i < 3; i++) {
    const t = 0.6 + i * 0.1 + SPREAD(rng) * 0.03, out = dirAt(rng() * 6.28, 0.2 + rng() * 0.4);
    leafy(cards, 'leaf', vec(T.at(t)), out, size * (0.75 + rng() * 0.2), nrm, shade(cols, y0, y1, rng), rng, true);
  }
  return finish(g, cards);
}
// Northern white cedar: a short stout trunk in a narrow cone of upswept branches thick with flat sprays.
function cedar(rng, v) {
  const g = new GeoBuilder(), cards = new CardBuilder(), P = profile(v, rng);
  const h = 8 * P.size, bark = vary(0x74563e, rng), cols = crownColors(0x6bb053, 0x37624d, rng);
  const T = g.stem(0, -0.5, 0, 0.36 * P.girth, 0.05, h * 0.95, 5, bark, rng, { lean: leanOf(P, h), bow: bowOf(P, h), flare: 0.5, shade: 0.3, ts: [0, 0.12, 0.6, 1] });
  deadBranches(g, rng, T.at, 1 + Math.floor(rng() * 2), 0.08, 0.2, 0.6, 1.2, bark);
  const R = (1.8 + rng() * 0.5) * (0.8 + P.size * 0.3), nrm = outward(T, -0.5, h * 0.95, 0.7);
  whorls(g, cards, rng, T, { t0: 0.1, t1: 0.86, count: 6, nb: () => 4, R: (f) => R * (1 - f * 0.65) + 0.25, droop: (f) => -0.15 - 0.2 * f, tube: (f) => f < 0.2, nrm, cols, y0: 0, y1: h, bark, wid: 1.0, fan: 0.25 });
  const a = T.at(0.86), b = T.at(1), d = vec(b).sub(vec(a));
  needles(cards, 'spray', vec(a), d.clone().normalize(), d.length() * 1.5, 0.6, nrm, shade(cols, 0, h, rng), rng);
  return finish(g, cards);
}
function snag(rng, v) {
  const g = new GeoBuilder(), P = profile(v, rng);
  const h = 9 * P.size, col = vary(0x9a9388, rng, 0.08);
  const T = g.stem(0, -0.5, 0, 0.35 * P.girth, 0.07, h, 5, col, rng, { lean: leanOf(P, h * 1.2), bow: bowOf(P, h * 1.5), flare: 0.45, shade: 0.35, jag: 0.35 + rng() * 0.5, cap: true });
  for (let i = 0; i < 2 + Math.floor(rng() * 3); i++) {
    const t = 0.35 + rng() * 0.5, a = rng() * 6.28, L = 0.6 + rng() * 1.6, s = T.at(t);
    g.limb(V(s.x, s.y, s.z), V(s.x + Math.cos(a) * L, s.y + L * (0.1 + rng() * 0.4), s.z + Math.sin(a) * L), 0.04 + s.r * 0.25, 0.02, 3, col, rng);
  }
  return finish(g, null);
}
// old-growth pine: a long bare trunk with a few stub branches and a small ragged crown swept to one side
function tallPine(rng, v) {
  const g = new GeoBuilder(), cards = new CardBuilder(), P = profile(v, rng);
  const h = 20 * P.size, bark = vary(0x74563e, rng), cols = crownColors(0x6cbf5c, 0x386a52, rng);
  const T = g.stem(0, -0.5, 0, 0.45 * P.girth, 0.08, h * 0.97, P.role === 'giant' ? 6 : 5, bark, rng, { lean: leanOf(P, h), bow: bowOf(P, h), flare: 0.5, shade: 0.32, ts: [0, 0.1, 0.5, 0.8, 1] });
  deadBranches(g, rng, T.at, 2 + Math.floor(rng() * 2), 0.4, 0.68, 0.7, 1.5, bark);
  const R = (1.7 + rng() * 0.6) * (0.75 + P.size * 0.35), tp = T.at(0.88), C = V(tp.x, h * 0.86, tp.z);
  const y0 = h * 0.7, y1 = h * 1.02, crown = away(C, R * 1.3, R * 0.6, R * 1.3);
  pineBranches(g, cards, rng, T, { t0: 0.7, t1: 0.95, n: 7 + Math.floor(rng() * 2), L: (f) => R * (1.2 - f * 0.5), el: (f) => 0.1 + f * 0.35, tufts: 4, step: 0.22, rise: [0.15, 0.3], crown, cols, y0, y1, bark, size: 3.1 * (0.75 + P.size * 0.25), swing: rng() * 6.28, bias: 0.55 });
  needles(cards, 'tuft', vec(T.at(0.95)), UP.clone().addScaledVector(perp(UP).applyAxisAngle(UP, rng() * 6.28), 0.6).normalize(), 2.8, 1.7, skyward(crown, C, 0.25), shade(cols, y0, y1, rng), rng);
  return finish(g, cards);
}
// jack pine of the bare rock: short, crooked, sparse scraggly limbs with a few ragged tufts
function jackPine(rng, v) {
  const g = new GeoBuilder(), cards = new CardBuilder(), P = profile(v, rng);
  const h = 6 * P.size, bark = vary(0x705843, rng), cols = crownColors(0x8fb34c, 0x3a664a, rng);
  const T = g.stem(0, -0.5, 0, 0.22 * P.girth, 0.04, h, 5, bark, rng, { lean: leanOf(P, h * 1.4), bow: [P.bow[0] * h * 3, P.bow[1] * h * 3], wig: 0.06, flare: 0.35, shade: 0.3 });
  deadBranches(g, rng, T.at, 1 + Math.floor(rng() * 2), 0.2, 0.45, 0.5, 1.0, bark);
  const R = (1.3 + rng() * 0.5) * (0.8 + P.size * 0.3), tp = T.at(0.75), C = V(tp.x, tp.y, tp.z);
  const y0 = h * 0.3, y1 = h * 1.1, crown = away(C, R * 1.3, h * 0.45, R * 1.3);
  pineBranches(g, cards, rng, T, { t0: 0.35, t1: 0.92, n: 5 + Math.floor(rng() * 2), L: (f) => R * (1.15 - f * 0.4), el: (f) => 0.15 + f * 0.45, tufts: 2, crown, cols, y0, y1, bark, size: 1.9, crooked: 0.6 });
  needles(cards, 'tuft', vec(T.at(0.95)), UP.clone().addScaledVector(perp(UP).applyAxisAngle(UP, rng() * 6.28), 0.7).normalize(), 1.3, 0.75, crown, shade(cols, y0, y1, rng), rng);
  return finish(g, cards);
}
// Tamarack: the deciduous conifer of the bogs and the wet lowlands, a narrow open cone of thin, nearly level
// branches with short soft sprays along them, a light green in summer, gold in October, bare in winter (its
// needles are tagged as leaves, so they turn and drop with the season, on their own later timing: setSeason).
// Every branch has its bark, so a bare tamarack still reads as a tree.
function tamarack(rng, v) {
  const g = new GeoBuilder(), cards = new CardBuilder(), P = profile(v, rng);
  const h = 13 * P.size, bark = vary(0x6b5546, rng), cols = crownColors(0x9cc865, 0x4d7d4e, rng);
  const T = g.stem(0, -0.5, 0, 0.26 * P.girth, 0.035, h, 5, bark, rng, { lean: leanOf(P, h), bow: bowOf(P, h), flare: 0.3, shade: 0.3, ts: [0, 0.12, 0.6, 1] });
  deadBranches(g, rng, T.at, 2 + Math.floor(rng() * 2), 0.06, 0.25, 0.6, 1.3, bark);
  const R = (1.6 + rng() * 0.5) * (0.8 + P.size * 0.3), nrm = outward(T, -0.5, h, 0.8);
  whorls(g, cards, rng, T, { t0: 0.22, t1: 0.9, count: 8 + Math.floor(rng() * 2), nb: (f) => (f < 0.5 ? 4 : 3), R: (f) => R * (1 - f * 0.75) + 0.2, droop: (f) => 0.05 + 0.15 * (1 - f), rise: 0.12, tube: () => true, nrm, cols, y0: 0, y1: h, bark, wid: 0.55, fan: 0.3, lo: 0.45 });
  const a = T.at(0.9), b = T.at(1), d = vec(b).sub(vec(a));
  needles(cards, 'spray', vec(a), d.clone().normalize(), d.length() * 1.3, 0.4, nrm, shade(cols, 0, h, rng), rng);
  return finish(g, cards);
}
// Quaking aspen: a straight pale trunk, grey-green with black scars where its branches fell and bare far up, a
// narrow rounded crown high on it, a lighter, yellower green than the birch's; gold in the fall. It grows in
// clones (placement.js aspenAt), so a stand is all of a kind.
function aspen(rng, v) {
  const g = new GeoBuilder(), cards = new CardBuilder(), P = profile(v, rng);
  const h = 13 * P.size, bark = vary(0xbfc2b0, rng, 0.03), cols = crownColors(0xb3cf5c, 0x4c7a4c, rng);
  const lean = leanOf(P, h), twig = bark.clone().lerp(new THREE.Color(0x4a4a3e), 0.55);
  const T = g.stem(0, -0.5, 0, 0.19 * P.girth, 0.035, h * 0.96, 5, bark, rng, { lean, bow: bowOf(P, h), flare: 0.25, shade: 0.3, ts: [0, 0.1, 0.6, 1] });
  for (let i = 0, n = 5 + Math.floor(rng() * 4); i < n; i++) { const t = 0.06 + rng() * 0.55, s = T.at(t); g.scar(T.at, t, rng() * 6.28, s.r * (0.6 + rng() * 0.4), s.r * (0.5 + rng() * 0.4), new THREE.Color(0x2a2a26)); }
  const R = (1.3 + rng() * 0.5) * (0.75 + P.size * 0.3), c = T.at(0.78), C = V(c.x, c.y, c.z), ry = h * 0.24;
  const y0 = C.y - ry, y1 = C.y + ry * 1.2, size = 2.0 * (0.8 + P.size * 0.2);
  broadCrown(g, cards, rng, T, { R, C, ry, size, slot: 'leaf', twig, cols, y0, y1, t0: 0.55, t1: 0.92, n: 7 + Math.floor(rng() * 2), rise: [0.75, 1.15], droop: 0.25 });
  const nrm = skyward(away(C, R * 1.15, ry, R * 1.15), C, 0.3);
  leafy(cards, 'leaf', vec(T.at(1)), perp(UP).applyAxisAngle(UP, rng() * 6.28).addScaledVector(UP, 1.1).normalize(), size, nrm, shade(cols, y0, y1, rng), rng);
  for (let i = 0; i < 3; i++) leafy(cards, 'leaf', vec(T.at(0.66 + i * 0.09)), dirAt(rng() * 6.28, 0.2 + rng() * 0.4), size * 0.8, nrm, shade(cols, y0, y1, rng), rng, true);
  return finish(g, cards);
}
// Black spruce: the bog's spruce, a thin dark spire of short drooping branches with a dense club of them near the
// top and dead twigs low down; a dark blue-green.
function blackSpruce(rng, v) {
  const g = new GeoBuilder(), cards = new CardBuilder(), P = profile(v, rng);
  const h = 11 * P.size, bark = vary(0x4f4339, rng), cols = crownColors(0x467a5c, 0x2c4d45, rng);
  const T = g.stem(0, -0.5, 0, 0.2 * P.girth, 0.03, h, 4, bark, rng, { lean: leanOf(P, h), bow: bowOf(P, h), flare: 0.3, shade: 0.3 });
  deadBranches(g, rng, T.at, 2 + Math.floor(rng() * 3), 0.05, 0.3, 0.4, 0.9, bark);
  const R = (0.95 + rng() * 0.3) * (0.85 + P.size * 0.2), nrm = outward(T, -0.5, h, 0.9);
  whorls(g, cards, rng, T, { t0: 0.18, t1: 0.78, count: 8 + Math.floor(rng() * 2), nb: () => 4, R: (f) => R * (1 - f * 0.55) + 0.15, droop: (f) => 0.4 + 0.25 * (1 - f), tube: (f) => f < 0.1, nrm, cols, y0: 0, y1: h, bark, wid: 0.9, fan: 0.1, lo: 0.4 });
  whorls(g, cards, rng, T, { t0: 0.82, t1: 0.92, count: 2, nb: () => 5, R: () => R * 0.55, droop: () => 0.3, tube: () => false, nrm, cols, y0: 0, y1: h, bark, wid: 1.0, lo: 0.55 });
  const a = T.at(0.93), b = T.at(1), d = vec(b).sub(vec(a));
  needles(cards, 'spray', vec(a), d.clone().normalize(), d.length() * 1.4, 0.4, nrm, shade(cols, 0, h, rng), rng);
  return finish(g, cards);
}

// a low leafy shrub: two or three stems from one root with round-leaved clusters on them
function shrub(rng) {
  const g = new GeoBuilder(), cards = new CardBuilder(), size = 0.8 + rng() * 0.35;
  const base = [0x6da145, 0x7ba54a, 0x5e9546, 0x91af4b][Math.floor(rng() * 4)], cols = crownColors(base, 0x305a41, rng), bark = vary(0x5e4b3c, rng, 0.06);
  const C = V(0, 0.55 * size, 0), nrm = away(C, 0.9 * size, 0.6 * size, 0.9 * size);
  const stems = 2 + (rng() < 0.5 ? 1 : 0), a0 = rng() * 6.28;
  for (let i = 0; i < stems; i++) {
    const a = a0 + (i / stems) * 6.28 + SPREAD(rng) * 0.6, tip = V(Math.cos(a) * 0.45 * size, (0.75 + rng() * 0.3) * size, Math.sin(a) * 0.45 * size);
    g.branch([V(0, -0.15, 0), tip], 0.025 * size, 0.01, 3, bark, rng);
    leafy(cards, 'leafRound', tip, tip.clone().sub(C).normalize(), 0.95 * size, nrm, shade(cols, 0, size, rng), rng);
    if (rng() < 0.6) leafy(cards, 'leafRound', tip.clone().multiplyScalar(0.55), tip.clone().sub(C).setY(0).normalize(), 0.8 * size, nrm, shade(cols, 0, size, rng), rng, true);
  }
  return finish(g, cards, { ground: 0 });
}

// ---------- the understory (docs/look.md, pass 5) --------------------------------
// As many of them as there are trees, so cheap: a few stems, a handful of cards. Leaf colours sit in
// tagLeaves's band (hue 0.1–0.47, saturated) so the deciduous ones turn and drop with the season; the
// sapling is a young fir and keeps its needles.

// A multi-stemmed shrub: `stems` stems fanning out of one root, each curving out (lean radians off plumb),
// round-leaved clusters on the upper half and at the tip, a side shoot on some.
function clump(rng, o) {
  const { h, size, stems, lean, bark, cols, side = 0.5 } = o;
  const g = new GeoBuilder(), cards = new CardBuilder(), C = V(0, h * 0.6, 0), nrm = away(C, h * 0.6, h * 0.45, h * 0.6);
  const a0 = rng() * 6.28;
  for (let i = 0; i < stems; i++) {
    const a = a0 + (i / stems) * 6.28 + SPREAD(rng) * 0.7, ln = lean[0] + rng() * (lean[1] - lean[0]), L = h * (0.85 + rng() * 0.3);
    const d1 = dirAt(a, Math.PI / 2 - ln * 0.75), d2 = dirAt(a + SPREAD(rng) * 0.25, Math.PI / 2 - ln * 1.15);
    const p0 = V(Math.cos(a) * 0.05, -0.2, Math.sin(a) * 0.05), p1 = p0.clone().addScaledVector(d1, L * 0.5), p2 = p1.clone().addScaledVector(d2, L * 0.55);
    const B = g.branch([p0, p1, p2], 0.035 * size, 0.012, 3, bark, rng);
    for (const [u, single] of [[1, false], [0.72, true], [0.48, true]]) {
      const q = B.at(u).p, out = q.clone().sub(C).normalize();
      leafy(cards, 'leafRound', q, out, size * (0.8 + rng() * 0.3) * (u < 1 ? 0.85 : 1), nrm, shade(cols, 0, h * 1.1, rng, 0.15), rng, single);
    }
    if (rng() < side) {
      const q = B.at(0.45), e = q.p.clone().addScaledVector(q.d.clone().addScaledVector(perp(q.d), 0.9).normalize(), L * 0.35);
      g.branch([q.p, e], 0.015 * size, 0.008, 3, bark, rng);
      leafy(cards, 'leafRound', e, e.clone().sub(C).normalize(), size * 0.75, nrm, shade(cols, 0, h * 1.1, rng, 0.15), rng, true);
    }
  }
  return finish(g, cards, { reach: h * 0.6 });
}
// beaked hazel: three or four stems fanning up out of one root into a loose vase of broad leaves
function hazel(rng) {
  const size = 0.8 + rng() * 0.45;
  return clump(rng, { h: 2.2 * size, size: 1.1 * size, stems: 3 + Math.floor(rng() * 2), lean: [0.25, 0.5], bark: vary(0x6a5440, rng, 0.06), cols: crownColors(0x78a24c, 0x37552f, rng) });
}
// speckled alder: a sprawling clump of grey stems leaning out from the wet ground, dark leaves on their upper half
function alder(rng) {
  const size = 0.85 + rng() * 0.4;
  return clump(rng, { h: 2.6 * size, size: 1.15 * size, stems: 3 + Math.floor(rng() * 2), lean: [0.35, 0.7], bark: vary(0x75706a, rng, 0.06), cols: crownColors(0x5f8c44, 0x2e4c2d, rng), side: 0.35 });
}
// a young balsam fir coming up in the gaps: a thin stem, three or four whorls of level sprays, the lowest widest
function sapling(rng) {
  const g = new GeoBuilder(), cards = new CardBuilder(), size = 0.7 + rng() * 0.5, h = 2.6 * size;
  const cols = crownColors(0x4b8a52, 0x24452f, rng), bark = vary(0x5a4a38, rng, 0.06);
  const T = g.stem(0, -0.2, 0, 0.045 * size, 0.012, h + 0.2, 3, bark, rng, { lean: [SPREAD(rng) * 0.12 * h, SPREAD(rng) * 0.12 * h], flare: 0, shade: 0.2, ts: [0, 0.5, 1] });
  const R = (0.62 + rng() * 0.2) * size, nrm = outward(T, -0.2, h + 0.2, 0.5);
  whorls(g, cards, rng, T, { t0: 0.2, t1: 0.82, count: 3 + Math.floor(rng() * 2), nb: () => 3, R: (f) => R * (1.05 - f * 0.6), droop: () => 0.05, tube: () => false, nrm, cols, y0: 0, y1: h, bark, wid: 0.65 });
  const a = T.at(0.82), b = T.at(1), d = vec(b).sub(vec(a));
  needles(cards, 'spray', vec(a), d.clone().normalize(), d.length() * 1.3, 0.3 * size, nrm, shade(cols, 0, h, rng), rng);
  return finish(g, cards, { reach: h * 0.4 });
}
// bracken: five to seven fronds on their stalks, arching out of the ground and leaning back up at the tips
function fern(rng) {
  const cards = new CardBuilder(), cols = crownColors(0x8aac4c, 0x46632f, rng);
  const fronds = 7 + Math.floor(rng() * 3), R = 0.95 + rng() * 0.35, a0 = rng() * 6.28;
  for (let i = 0; i < fronds; i++) {
    const a = a0 + (i / fronds) * 6.28 + SPREAD(rng) * 0.5, L = R * (0.8 + rng() * 0.45), tilt = 0.55 + rng() * 0.4;
    const out = V(Math.cos(a), 0, Math.sin(a)), dir = out.clone().multiplyScalar(Math.sin(tilt)).addScaledVector(UP, Math.cos(tilt)).normalize();
    const across = UP.clone().cross(out).normalize().applyAxisAngle(dir, SPREAD(rng) * 0.3);
    // the frond faces up (whichever way round the card is wound) and a little out
    const face = across.clone().cross(dir).normalize();
    if (face.y < 0) face.negate();
    const n = face.addScaledVector(out, 0.35).normalize(), nrm = () => n.clone();
    cards.card('frond', V(out.x * 0.04, -0.05, out.z * 0.04), across, dir, L * 0.62, L, nrm, shade(cols, 0, L, rng, 0.3));
  }
  return finish(null, cards, { ground: 0, reach: 0.5 });
}

// ---------- the deadfall and the outcrops (pass 5; solid, see solid()) ----------------

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


// ---------- far twins for distant regions -----------------------------------------
// Past the LOD distance a tree is two big cards crossed on its crown in a far sprite (textures.js farCone,
// farPine, farOval, composed from the near sprites), sized from its own near variant's cards and coloured
// their mean colour (the occlusion included), over two crossed bark quads where the trunk shows. The cards'
// normals run out from the axis across each card and tip up toward the top, so the far crown still shades
// round. Four to eight triangles, about half what the old cone and diamond twins cost.

// What a near variant's crown spans: the cards' height range, centre and reach, their mean colour, the bark's.
// The cards are taken swollen as far as the material swells them at the LOD distance, so the twin that
// replaces the tree there has the silhouette the tree had. The mean colour leans to the open cards (aOcc),
// the outer ones that make up what a far crown shows, not the dim ones inside it.
function crownInfo(geo, grow = CARD.uCardGrow.value.x) {
  const raw = geo.getAttribute('position'), gr = geo.getAttribute('aGrow'), uv = geo.getAttribute('uv'), col = geo.getAttribute('color'), occ = geo.getAttribute('aOcc');
  const pos = raw.clone();
  if (gr) for (let i = 0; i < pos.count; i++) pos.setXYZ(i, raw.getX(i) + gr.getX(i) * grow, raw.getY(i) + gr.getY(i) * grow, raw.getZ(i) + gr.getZ(i) * grow);
  const I = { y0: Infinity, y1: -Infinity, cx: 0, cz: 0, r: 0, n: 0, leaf: new THREE.Color(0, 0, 0), bark: new THREE.Color(0, 0, 0), trunkR: 0.1 };
  let nb = 0, wl = 0;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    if (uv.getX(i) >= 0) {
      I.y0 = Math.min(I.y0, y); I.y1 = Math.max(I.y1, y); I.cx += pos.getX(i); I.cz += pos.getZ(i); I.n++;
      const w = 0.2 + (occ ? occ.getX(i) : 1);
      I.leaf.r += col.getX(i) * w; I.leaf.g += col.getY(i) * w; I.leaf.b += col.getZ(i) * w; wl += w;
    } else {
      I.bark.r += col.getX(i); I.bark.g += col.getY(i); I.bark.b += col.getZ(i); nb++;
      if (y > 1 && y < 2) I.trunkR = Math.max(I.trunkR, Math.hypot(pos.getX(i), pos.getZ(i)));
    }
  }
  if (I.n) { I.cx /= I.n; I.cz /= I.n; I.leaf.multiplyScalar(1 / wl); }
  if (nb) I.bark.multiplyScalar(1 / nb);
  // the reach and the lower edge as percentiles of the card corners: a card's corners overshoot its leaves,
  // and at the LOD distance the near tree reads by its mass, not its extremes
  const d = [], ys = [];
  for (let i = 0; i < pos.count; i++) if (uv.getX(i) >= 0) { d.push(Math.hypot(pos.getX(i) - I.cx, pos.getZ(i) - I.cz)); ys.push(pos.getY(i)); }
  d.sort((a, b) => a - b); ys.sort((a, b) => a - b);
  if (d.length) { I.r = d[Math.floor(d.length * 0.7)]; I.y0 = ys[Math.floor(ys.length * 0.08)]; I.y1 = ys[Math.floor(ys.length * 0.97)]; } else I.r = 1;
  return I;
}
// `slot` the far sprite; `trunk` how far up the crown the bark quads reach (0: none); `widen` scales the width
function farTwin(I, slot, rng, { trunk = 0, widen = 1, lift = 0 } = {}) {
  const cards = new CardBuilder({ grow: false }), g = new GeoBuilder();
  const yaw = rng() * 6.28, a = V(Math.cos(yaw), 0, Math.sin(yaw)), b = V(-Math.sin(yaw), 0, Math.cos(yaw));
  const y0 = I.y0 + (I.y1 - I.y0) * lift, H = I.y1 - y0, W = I.r * 2 * widen, o = V(I.cx, y0, I.cz);
  const low = I.leaf.clone().multiplyScalar(0.82), high = I.leaf.clone().multiplyScalar(1.1);
  const col = (p) => low.clone().lerp(high, sm((p.y - y0) / H));
  const nrm = (ax) => (p) => ax.clone().multiplyScalar(p.clone().sub(o).dot(ax) / (W / 2)).addScaledVector(UP, 0.5 + 0.5 * (p.y - y0) / H).normalize();
  cards.card(slot, o, a, UP, W, H, nrm(a), col);
  cards.card(slot, o, b, UP, W, H, nrm(b), col);
  if (trunk > 0) {
    const top = V(I.cx, y0 + H * trunk, I.cz), w = I.trunkR * 1.2;
    for (const ax of [a, b]) g.quad(V(-ax.x * w, -0.5, -ax.z * w), V(ax.x * w, -0.5, ax.z * w), top.clone().addScaledVector(ax, w * 0.5), top.clone().addScaledVector(ax, -w * 0.5), I.bark, V(ax.z, 0, -ax.x));
  }
  return finish(g, cards, { bake: false });
}
function lowShrub(rng) {
  const g = new GeoBuilder();
  const base = [0x6da145, 0x7ba54a, 0x5e9546, 0x91af4b][Math.floor(rng() * 4)];
  const n = 1 + (rng() < 0.5 ? 1 : 0);
  for (let i = 0; i < n; i++) g.blob((rng() - 0.5) * 0.9, 0.55 + rng() * 0.3, (rng() - 0.5) * 0.9, 0.7 + rng() * 0.6, vary(base, rng, 0.1), rng, 0.4, 1.3, 0.7, 1.2);
  return g.build();
}
// (rng, crownInfo of the near variant) -> geometry
const LOW = {
  whitePine: (rng, I) => farTwin(I, 'farPine', rng, { trunk: 0.3, widen: 0.95, lift: 0.08 }),
  spruce: (rng, I) => farTwin(I, 'farCone', rng, { widen: 1.05 }),
  redPine: (rng, I) => farTwin(I, 'farPine', rng, { trunk: 0.35, widen: 0.95, lift: 0.05 }),
  birch: (rng, I) => farTwin(I, 'farOval', rng, { trunk: 0.35, widen: 0.9 }),
  cedar: (rng, I) => farTwin(I, 'farCone', rng, { widen: 1.05 }),
  snag: (rng) => { const g = new GeoBuilder(); g.trunk(0, -0.5, 0, 0.3, 0.08, 7 + rng() * 5, 4, vary(0x9a9388, rng, 0.08), rng); return g.build(); },
  boulder: (rng) => angularRock(rng, 'block'),
  shrub: (rng, I) => (I.n ? farTwin(I, 'farOval', rng, { widen: 1.1 }) : lowShrub(rng)),
  tallPine: (rng, I) => farTwin(I, 'farPine', rng, { trunk: 0.4, widen: 0.95, lift: 0.05 }),
  jackPine: (rng, I) => farTwin(I, 'farPine', rng, { trunk: 0.3, widen: 0.85 }),
  hazel: (rng, I) => farTwin(I, 'farOval', rng, { widen: 1.1 }),
  alder: (rng, I) => farTwin(I, 'farOval', rng, { widen: 1.1 }),
  sapling: (rng, I) => farTwin(I, 'farCone', rng, { widen: 1.1 }),
  fern: (rng, I) => farTwin(I, 'frond', rng, { widen: 0.7 }),
  log: (rng) => { const g = new GeoBuilder(); g.trunk(0, -3.4, 0, 0.32, 0.2, 6.8, 3, vary(0x857360, rng, 0.07), rng); const geo = g.build(); geo.rotateZ(Math.PI / 2); geo.translate(0, 0.26, 0); return geo; },
  stump: (rng) => { const g = new GeoBuilder(); g.trunk(0, -0.4, 0, 0.32, 0.26, 1.1, 4, vary(0x625040, rng, 0.06), rng); return g.build(); },
  outcrop: (rng) => { const geo = angularRock(rng, 'slab'); geo.scale(0.85, 0.7, 0.85); return geo; },
  tamarack: (rng, I) => farTwin(I, 'farCone', rng, { trunk: 0.25, widen: 0.95 }),
  aspen: (rng, I) => farTwin(I, 'farOval', rng, { trunk: 0.45, widen: 0.85 }),
  blackSpruce: (rng, I) => farTwin(I, 'farCone', rng, { widen: 0.9 }),
  talus: (rng) => screeBlock(rng),
  cliff: (rng) => cliffModuleFar(rng),
};

// index order must match placement.js SPECIES. `leaves`: deciduous, with an autumn colour (linear rgb).
// `variants`: geometry variants built for the species (trees get twelve: see profile()).
const ROCK_KINDS = ['slab', 'block', 'boulder'];
const TREE_VARIANTS = 12;
// Guests (placement.js GUEST): the old white pine, the black spruce and the aspen are drawn in the white pine's,
// the spruce's and the birch's bins, so they cost no draw calls of their own far off. Their variants follow the
// host's, made the host's height (`fit`), and they take the host's material (the aspen's leaves turn with the
// birch's gold). Their own slots below hold no variants.
export const SPECIES = [
  { name: 'whitePine', make: whitePine, variants: TREE_VARIANTS, guest: { name: 'tallPine', make: tallPine, variants: TREE_VARIANTS, fit: 16 / 20 } },
  { name: 'spruce', make: spruce, variants: TREE_VARIANTS, guest: { name: 'blackSpruce', make: blackSpruce, variants: 6, fit: 12.5 / 11 } },
  { name: 'redPine', make: redPine, variants: TREE_VARIANTS },
  { name: 'birch', make: birch, leaves: [0.86, 0.56, 0.12], variants: TREE_VARIANTS, guest: { name: 'aspen', make: aspen, variants: 6, leaves: true, fit: 10.5 / 13 } },
  { name: 'cedar', make: cedar, variants: TREE_VARIANTS },
  { name: 'snag', make: snag, variants: TREE_VARIANTS },
  { name: 'boulder', make: (rng, v) => angularRock(rng, ROCK_KINDS[v % 3]), rock: true, variants: 9 },
  { name: 'shrub', make: shrub, leaves: [0.72, 0.22, 0.08], variants: 6 },
  { name: 'tallPine', guestOf: 0 },
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
  // the bluff pass: the tamarack (gold late in October, bare in winter: its own timing, tamarackSeason); the
  // aspen's and the black spruce's slots (guests, above); the scree's small blocks (many, so small regions, near
  // only and no shadows); the cliff modules (cliffs.js; their own material), seen a long way off, so their far
  // twin late
  { name: 'tamarack', make: tamarack, leaves: [0.9, 0.62, 0.16], variants: 6, roles: true, season: 'tamarack' },
  { name: 'aspen', guestOf: 3, roles: true },
  { name: 'blackSpruce', guestOf: 1, roles: true },
  { name: 'talus', make: (rng) => screeBlock(rng), rock: true, variants: 4, lod: 320, cull: 700, shadow: false },
  { name: 'cliff', make: cliffModule, rock: true, cliff: true, variants: 4, lod: 1100 },
];
const VARIANTS = 4;
const LOD_DISTANCE = 750;  // metres from the camera to a region centre before its low-detail twin is used
const CULL_DISTANCE = 3200; // beyond this a region's trees are not drawn at all
// The understory is walked through, and the fallen logs, stumps and outcrops are held off by their own
// footprints (props.js reads them from the meshes; a carried canoe rides over a stump as over a boulder), so
// none of them are trunks for the collision in tiles.js.
const NOT_TRUNKS = new Set([7, 10, 11, 12, 13, 14, 15, 16, 20, 21]);
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

// ---------- the foliage material ---------------------------------------------------
// One material for a species' bark and cards: the look's Lambert (shading.js), the wrap read per vertex (the
// cards wrap the light past the terminator, dotNL * 0.6 + 0.4; bark does not), double-sided without three's
// back-face normal flip (a card seen from behind keeps its outward normal instead of being lit from below).
// A card fragment samples its sprite and is cut where the sprite's alpha falls under the cutoff, which falls
// with distance from the eye: uCardCut = (near cutoff, far cutoff, distance where it starts to fall, where it
// reaches the far one). The near cutoff sits above the sprites' halo (textures.js), so the leaf and needle
// edges show; the far one under it, so the cards fill out to flat shapes. The deciduous species add the
// season: gold or red in the fall, pale in spring, gone between leaf-drop and leaf-out.
// The depth material (makeCardDepth) cuts the same way, so the cards cast leaf-shaped shadows and bare
// branches cast bare shadows; it reads the eye from uEye (in the shadow pass the camera is the sun's).
// Back-lit leaves glow (leafGlow): when the sun is behind a card as the eye sees it, the card lets some of the
// sun through in its own colour, saturated (the warm green of a leaf held up to the light, gold in the fall).
// It rides on the sun's own light as the shadow map left it, so the leaves at a crown's edge, which the sun
// reaches, glow, and the ones on the near side of a thick crown, which it does not, stay dim; the open cards
// (aOcc) let more through than the ones deep inside, and the thin edges of the sprite a little more than its
// middle. Past the shadows' reach every leaf would glow as if at the edge, so it falls to 40 % out there.
export const CARD = {
  uCardMap: { value: null },
  uCardCut: { value: new THREE.Vector4(0.5, 0.12, 6, 60) },
  // the swell: x how much a card grows about its anchor at full distance (0.6 = 60 % bigger), y and z the
  // distances it starts and finishes growing over; up close a card is exactly where its branch put it
  uCardGrow: { value: new THREE.Vector3(0.7, 35, 250) },
  uEye: { value: new THREE.Vector3() },
  // the glow: x how strong (against the sun's direct light on a leaf facing it), y the lobe's sharpness (a
  // power of how straight the sun is behind the card), z and w the distances it fades to 40 % over
  uLeafGlow: { value: new THREE.Vector4(1.2, 4, 150, 400) },
};
const noFlip = THREE.ShaderChunk.normal_fragment_begin.replace('normal *= faceDirection;', '');
if (noFlip === THREE.ShaderChunk.normal_fragment_begin) console.warn('vegetation: normal chunk changed, cards seen from behind will go dark');

// ---------- the sway ---------------------------------------------------------------
// The wind (wind.js SWAY, the same wind the water reads) bends every tree from the base of its trunk, the top
// furthest (as the square of the height over the species' height): a lean downwind that grows with the wind's
// pressure and deepens under a gust, and a swing about it at the tree's own slow rate, mostly along the wind. The
// gusts are a world-space field rolling downwind, read at the trunk's base, so the trees of a stand lean together
// as a gust crosses it, and the field runs across tile seams. On top, the branches bob (more the further out from
// the stem, each height and side in its own phase) and the leaf cards flutter about their anchors (the birch, which
// stands in for the aspen, trembling fastest). The flutter and the bob fade with distance, well before the far
// twin takes over, and the twin bends exactly as its tree did, so the switch shows nothing. Bare branches sway as
// branches. The shadow pass's depth material runs the same code, so the shadows move with the crowns. Per species
// (by name, so a species without an entry, the deadfall say, stands still): the lean in radians at 12 m/s under a
// gust, the flutter in radians in a fresh breeze, the sway's rate and the flutter's (Hz), and the height (m).
const SWAY_BY = {
  whitePine: [0.026, 0.03, 0.26, 2.0, 16],
  spruce: [0.018, 0.02, 0.32, 2.4, 12.5],
  redPine: [0.024, 0.03, 0.28, 2.0, 15],
  birch: [0.065, 0.08, 0.42, 4.0, 10.5],
  cedar: [0.02, 0.025, 0.34, 2.4, 8],
  snag: [0.008, 0, 0.3, 1, 9],
  shrub: [0.08, 0.06, 0.8, 3.0, 1.0],
  tallPine: [0.028, 0.03, 0.22, 2.0, 20],
  jackPine: [0.032, 0.035, 0.36, 2.4, 6],
  hazel: [0.09, 0.07, 0.7, 3.2, 2.2],
  alder: [0.09, 0.065, 0.65, 3.0, 2.6],
  sapling: [0.07, 0.025, 0.8, 2.6, 2.6],
  fern: [0.15, 0.06, 1.0, 2.8, 1.0],
};
const swayUniforms = (name) => {
  const s = SWAY_BY[name] || [0, 0, 0.3, 1, 10];
  return { uSway: { value: new THREE.Vector4(s[0], s[1], s[2], s[3]) }, uSwayH: { value: s[4] } };
};
const swayPars = glslSway + /* glsl */ `
  uniform vec4 uSway;
  uniform float uSwayH;
  // the sway of a vertex at p (object space, the swell applied), grow its offset from its card's anchor, dist its
  // distance from the eye; anchor is where its card hangs (position - aGrow, exact for the leaves); returned in
  // object space
  vec3 treeSway(vec3 p, vec3 anchor, vec3 grow, float dist) {
    #ifdef USE_INSTANCING
      mat3 M = mat3(instanceMatrix); vec3 base = instanceMatrix[3].xyz;
    #else
      mat3 M = mat3(1.0); vec3 base = vec3(0.0);
    #endif
    vec3 off = M * p;   // from the trunk's base, in the tile's axes (metres)
    float y = max(off.y, 0.0), load = uSwayWind.z;
    vec2 W = uSwayWind.xy;
    vec2 bw = (modelMatrix * vec4(base, 1.0)).xz;   // the trunk's base, world xz
    float g = swayGustAt(bw) * uSwayGust.w, h = swayHash(floor(bw * 3.0));   // the gust over it, the tree's own number
    float t = uSwayGust.z, ph = swayOmega(uSway.z * (0.85 + 0.3 * h)) * t + h * 6.2831853;
    // the crown: the lean and the swing along the wind, a smaller swing across it
    float along = uSway.x * load * (0.4 + 0.6 * g + (0.3 + 0.4 * g) * sin(ph));
    float across = uSway.x * load * (0.1 + 0.2 * g) * sin(ph * 0.71 + 1.9);
    float bend = y * y / uSwayH;
    vec3 d = vec3(W.x * along - W.y * across, 0.0, W.y * along + W.x * across) * bend;
    // the branches: out from the stem they bob, each height and side in its own phase
    float r = length(off.xz), near = 1.0 - smoothstep(250.0, 600.0, dist);
    float bob = uSway.x * 0.5 * load * (0.4 + 0.6 * g) * r * sin(swayOmega(uSway.z * 2.3) * t + h * 3.1 + off.y * 0.9 + dot(off.xz, vec2(0.7, 0.5))) * near;
    d += vec3(W.x * 0.5, 1.0, W.y * 0.5) * bob;
    vec3 o = swayToObject(M, d);
    // the leaves: each card turned a little about its anchor, in a phase of its own
    float fl = uSway.y * smoothstep(1.5, 10.0, uSwayWind.w) * (0.6 + 0.4 * g) * (1.0 - smoothstep(60.0, 220.0, dist));
    if (fl > 0.0) {
      float pc = dot(anchor, vec3(3.1, 2.3, 2.7));
      float ang = fl * (sin(swayOmega(uSway.w) * t + pc) + 0.35 * sin(swayOmega(uSway.w * 1.7) * t + pc * 1.3));
      o += ang * cross(normalize(vec3(sin(pc * 1.7), 0.6, cos(pc * 1.3))), grow);
    }
    return o;
  }
`;
const cardVarying = 'varying vec2 vCardUv;\nvarying float vCardDist;';
const cardPars = 'attribute vec3 aGrow;\nuniform vec3 uCardGrow;\n' + cardVarying + '\n' + swayPars;
// replaces <begin_vertex>: the distance from the eye, the card swollen about its anchor by it, and the sway
const cardBegin = (eye) => `
  vec3 transformed = vec3( position );
  vCardUv = uv;
  { vec4 cw = vec4( transformed, 1.0 );
  #ifdef USE_INSTANCING
    cw = instanceMatrix * cw;
  #endif
    vCardDist = distance( ( modelMatrix * cw ).xyz, ${eye} ); }
  transformed += aGrow * uCardGrow.x * smoothstep( uCardGrow.y, uCardGrow.z, vCardDist );
  transformed += treeSway( transformed, position - aGrow, aGrow, vCardDist );`;
const cardCut = `
  vec4 cardTex = texture2D( uCardMap, max( vCardUv, 0.0 ) );
  float cardCut = mix( uCardCut.x, uCardCut.y, smoothstep( uCardCut.z, uCardCut.w, vCardDist ) );
  if ( vCardUv.x >= 0.0 && cardTex.a < cardCut ) discard;`;
// the glow (see CARD): declared after the light chunk (it needs LambertMaterial), it wraps RE_Direct, whatever
// the look named it, so the sun's light reaches it with its shadow already applied
const glowPars = `
uniform vec4 uLeafGlow;
varying float vCardOpen;
float leafGlow = 0.0;
void RE_Direct_Leaf( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in LambertMaterial material, inout ReflectedLight reflectedLight ) {
  RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
  if ( leafGlow > 0.0 ) {
    float back = saturate( -dot( geometryViewDir, directLight.direction ) );
    vec3 t = material.diffuseColor;
    t = mix( t, t * t / max( dot( t, vec3( 0.3, 0.5, 0.2 ) ), 1e-3 ), 0.4 );
    reflectedLight.directDiffuse += leafGlow * uLeafGlow.x * pow( back, uLeafGlow.y ) * directLight.color * BRDF_Lambert( t );
  }
}
#undef RE_Direct
#define RE_Direct RE_Direct_Leaf
`;
// in main, once the sprite is read: how much this leaf lets through
const glowAt = `
  if ( vCardUv.x >= 0.0 ) leafGlow = mix( 0.2, 1.0, vCardOpen ) * ( 0.4 + 0.6 * ( 1.0 - smoothstep( cardCut, 1.0, cardTex.a ) ) ) * mix( 1.0, 0.4, smoothstep( uLeafGlow.z, uLeafGlow.w, vCardDist ) );`;

// `species` names the sway (SWAY_BY): one material per species, all sharing one program
function makeCardMaterial(autumn, species = null) {
  const u = autumn ? { uFall: { value: 0 }, uSpring: { value: 0 }, uLeafOn: { value: 1 }, uAutumn: { value: new THREE.Vector3(autumn[0], autumn[1], autumn[2]) } } : {};
  const sw = swayUniforms(species);
  const m = makeLookMaterial({ side: THREE.DoubleSide }, {
    wrap: 'varying', name: autumn ? 'look-cards-leaves' : 'look-cards',
    compile: (shader) => {
      Object.assign(shader.uniforms, CARD, u, SWAY, sw);
      let vs = shader.vertexShader.replace('#include <common>', '#include <common>\n' + cardPars + '\nattribute float aOcc;\nvarying float vCardOpen;' + (autumn ? '\nattribute float aLeaf;\nvarying float vLeaf;\nuniform float uFall, uSpring;\nuniform vec3 uAutumn;' : ''))
        .replace('#include <begin_vertex>', cardBegin('cameraPosition') + '\n  vCardOpen = aOcc;');
      if (autumn) vs = vs.replace('#include <color_vertex>', '#include <color_vertex>\n vLeaf = aLeaf;\n if (aLeaf > 0.5) { float lum = dot(vColor.rgb, vec3(0.3, 0.5, 0.2)); vColor.rgb = mix(vColor.rgb, uAutumn * (0.5 + 1.2 * lum), uFall); vColor.rgb = mix(vColor.rgb, vColor.rgb * vec3(1.05, 1.12, 0.72), uSpring); }');
      shader.vertexShader = vs;
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform sampler2D uCardMap;\nuniform vec4 uCardCut;\n' + cardVarying + (autumn ? '\nvarying float vLeaf;\nuniform float uLeafOn;' : ''))
        .replace('#include <shadowmap_pars_fragment>', '#include <shadowmap_pars_fragment>\n' + glowPars)
        .replace('#include <map_fragment>', '#include <map_fragment>\n' + cardCut + (autumn ? '\n  if (vLeaf > 0.5 && uLeafOn < 0.5) discard;' : '') + '\n  if ( vCardUv.x >= 0.0 ) diffuseColor.rgb *= cardTex.rgb;' + glowAt)
        .replace('#include <normal_fragment_begin>', noFlip);
    },
  });
  m.userData.u = u;
  m.userData.sway = sw;
  m.userData.depth = makeCardDepth(u.uLeafOn || null, sw);
  return m;
}
function makeCardDepth(leafOn, sw) {
  const m = new THREE.MeshDepthMaterial();
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, CARD, SWAY, sw, leafOn ? { uLeafOn: leafOn } : {});
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uEye;\n' + cardPars + (leafOn ? '\nattribute float aLeaf;\nvarying float vLeaf;' : ''))
      .replace('#include <begin_vertex>', cardBegin('uEye') + (leafOn ? '\n  vLeaf = aLeaf;' : ''));
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D uCardMap;\nuniform vec4 uCardCut;\n' + cardVarying + (leafOn ? '\nuniform float uLeafOn;\nvarying float vLeaf;' : ''))
      // the bark draws only its back faces into the shadow map, as a one-sided material would, so the lit
      // side of a trunk does not shadow itself
      .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\n' + cardCut + '\n  if ( vCardUv.x < 0.0 && gl_FrontFacing ) discard;' + (leafOn ? '\n  if ( vLeaf > 0.5 && uLeafOn < 0.5 ) discard;' : ''));
  };
  m.customProgramCacheKey = () => (leafOn ? 'card-depth-leaves' : 'card-depth');
  return m;
}

// A guest's geometry made the host's height (placement.js GUEST: its instances carry the inverse in their scale):
// the positions and the cards' swell, about the foot.
function fitGuest(geo, k) {
  geo.scale(k, k, k);
  const g = geo.getAttribute('aGrow');
  if (g) { for (let i = 0; i < g.array.length; i++) g.array[i] *= k; g.needsUpdate = true; }
  geo.computeBoundingSphere();
}

// The tamarack turns after the broadleaves and holds its gold longer: gold from early to mid October (the
// birch and aspen from late September), its needles down in the first days of November.
function tamarackSeason(s) {
  const d = s.doy, bare = smoothstep(300, 312, d);
  return { fall: smoothstep(268, 284, d) * (1 - smoothstep(301, 312, d)), spring: s.spring, leafOn: s.leaf > 0.5 && bare < 0.5 ? 1 : 0 };
}

// Geometry variants (built once) and the shared materials.
export function makeVegetationKit(seed = 3) {
  CARD.uCardMap.value = foliageAtlas();
  const t0 = performance.now();
  const build = (s, v) => {
    const rs = seed * 131 + v * 17 + s.name.length;
    if (s.rock) return { full: s.make(mulberry32(rs), v), low: LOW[s.name](mulberry32(rs)) };
    const full = solid(s.make(mulberry32(rs), v));
    const low = solid(LOW[s.name](mulberry32(rs + 7), crownInfo(full)));
    if (s.leaves) { tagLeaves(full); tagLeaves(low); }
    if (s.fit) for (const geo of [full, low]) fitGuest(geo, s.fit);
    return { full, low };
  };
  // a host's own variants, then its guest's; a guest's own slot holds none (it is never binned)
  const variants = SPECIES.map((s) => (s.guestOf !== undefined ? [] : [
    ...Array.from({ length: s.variants || VARIANTS }, (_, v) => build(s, v)),
    ...(s.guest ? Array.from({ length: s.guest.variants }, (_, v) => build(s.guest, v)) : []),
  ]));
  const material = makeCardMaterial(null);
  const rockMaterial = makeRockMaterial();
  const leafMaterials = SPECIES.map((s) => (s.leaves ? makeCardMaterial(s.leaves, s.name) : null));
  const cardMaterials = SPECIES.map((s, i) => leafMaterials[i] || (s.rock ? null : makeCardMaterial(null, s.name))); // each species sways its own way
  const materialFor = (sp) => (SPECIES[sp].rock ? rockMaterial : cardMaterials[sp] || material);
  const depthFor = (sp) => (SPECIES[sp].rock ? undefined : materialFor(sp).userData.depth);
  const cliffMaterial = makeCliffMaterial(); // the cliff modules' own (makeVegetationMeshes picks it)
  const setSeason = (season) => {
    leafMaterials.forEach((m, sp) => {
      if (!m) return;
      const s = SPECIES[sp].season === 'tamarack' ? tamarackSeason(season) : season;
      m.userData.u.uFall.value = s.fall; m.userData.u.uSpring.value = s.spring; m.userData.u.uLeafOn.value = s.leafOn;
    });
  };
  const ms = performance.now() - t0;
  return { variants, material, rockMaterial, cliffMaterial, materialFor, depthFor, setSeason, seed, ms };
}

// Which geometry variant each variant group of a (region, species) bin draws. The groups get different
// variants; for the trees (and the bluff pass's, `roles`, of six variants) the two big groups take ordinary
// trees and the small third group any variant, so a leaner, a giant or a runt turns up now and then rather than
// filling a whole region; the rocks step through the kinds (slab, block, boulder) in turn.
function variantsFor(b, nv, ng) {
  const S = SPECIES[b.sp];
  if (S.guest && ng > 1) {
    // the host's groups from its own variants, the guest's from its own (after the host's)
    const own = S.variants, hg = GROUPS[b.sp], guestSp = SPECIES.findIndex((q) => q.guestOf === b.sp);
    return [...pickVariants(b, own, Math.min(hg, ng)), ...(ng > hg ? pickVariants({ rx: b.rx, rz: b.rz, sp: guestSp }, nv - own, ng - hg).map((v) => v + own) : [])];
  }
  return pickVariants(b, S.guest ? S.variants : nv, ng);
}
function pickVariants(b, nv, ng) {
  const S = SPECIES[b.sp];
  const h = hash2(b.rx * 7919 + b.rz, b.sp, 9);
  if ((nv === TREE_VARIANTS && ng === 3) || (S.roles && ng >= 2)) {
    const norms = NORMS.filter((v) => v < nv);
    const i = Math.floor(h * norms.length), j = (i + 1 + Math.floor(hash2(b.rx * 7919 + b.rz, b.sp, 10) * (norms.length - 1))) % norms.length;
    if (ng === 2) return [norms[i], norms[j]];
    let k = Math.floor(hash2(b.rx * 7919 + b.rz, b.sp, 11) * nv);
    while (k === norms[i] || k === norms[j]) k = (k + 1) % nv;
    return [norms[i], norms[j], k];
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
    const S = SPECIES[b.sp], vs = kit.variants[b.sp], material = S.cliff ? kit.cliffMaterial : kit.materialFor(b.sp);
    const groups = b.groups && b.groups.filter(Boolean).length > 1 ? b.groups : null;
    // a bin with one group in it draws that group's variant (a guest's alone, say)
    const only = !groups && b.groups ? b.groups.findIndex(Boolean) : 0;
    const picks = only > 0 ? [variantsFor(b, vs.length, b.groups.length)[only]] : variantsFor(b, vs.length, groups ? groups.length : 1), v = vs[picks[0]];
    const mesh = new THREE.InstancedMesh(v.full, material, b.count);
    mesh.instanceMatrix = new THREE.InstancedBufferAttribute(b.matrices, 16);
    mesh.instanceColor = new THREE.InstancedBufferAttribute(b.colors, 3);
    mesh.castShadow = S.shadow !== false;
    mesh.receiveShadow = true;
    mesh.customDepthMaterial = kit.depthFor(b.sp); // the cards' alpha in the shadow pass
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
    k.customDepthMaterial = m.customDepthMaterial;
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
  CARD.uEye.value.copy(camPos); // where the shadow pass measures the cards' distance from
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
