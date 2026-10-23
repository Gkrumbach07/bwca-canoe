import { Shape, V3, col, smooth } from './fauna-kit.js';
import { mulberry32 } from './rng.js';

// The animals as simple strong shapes (docs/look.md: "a smooth sphere grounded by soft occlusion"), a few
// hundred triangles each, built once at startup from lofted rings with the occlusion baked in. Every model
// faces +x with +y up; the parts that move (a head, a wing, a leg, a tail) are separate geometries with their
// pivot at the origin, so the animal is drawn as a handful of instanced parts (fauna-kit.js Parts).
//
// Sizes are life size: a common loon about 0.85 m bill to tail, a beaver a metre with its tail, a bull moose
// 1.9 m at the shoulder, a bald eagle 2 m across the wings, a herring gull 1.4 m, a raven 1.2 m.

const X = V3(1, 0, 0), Y = V3(0, 1, 0), Z = V3(0, 0, 1);
const SIDE = V3(0, 0, -1); // for a loft along +x: the ring's angle pi/2 is up, 0 is -z, pi is +z

// rings along +x from a table of [x, y, half width, half height]; paint(th, p, row) -> [colour, kind, u, v]
function body(s, rows, n, paint, opts = { capStart: true, capEnd: true }) {
  const rings = rows.map((r, i) => s.ring(V3(r[0], r[1], r[4] || 0), X, SIDE, n, r[2], r[3], (th, p) => paint(th, p, i, r)));
  return s.loft(rings, opts);
}

// A wing reaching out along +z from the shoulder at the origin: rows [z, leading edge x, chord, thickness],
// `top` above and `under` below, `tipAt` a colour change toward the tip; `fingers` primaries splayed past the
// last row (an eagle's or a raven's), else the wing closes to `tip`.
function wing(rows, { top, under, tipTop = null, tipFrom = Infinity, fingers = 0, fingerLen = 0.2, fingerW = 0.03, tip = null, n = 6 }) {
  const s = new Shape();
  const paint = (th, p) => {
    const up = Math.sin(th) >= 0, c = (up ? (tipTop && p.z > tipFrom ? tipTop : top) : under).clone();
    return [c];
  };
  const rings = rows.map(([z, lead, chord, thick]) => s.ring(V3(lead - chord / 2, 0, z), Z, X, n, chord / 2, thick, paint));
  const last = rows[rows.length - 1];
  s.loft(rings, { capStart: true, tipEnd: fingers ? null : (tip || V3(last[1] - last[2] * 0.7, 0, last[0] + 0.08)), capEnd: !!fingers });
  for (let f = 0; f < fingers; f++) {
    // splayed across the trailing half of the hand, the front one longest
    const k = fingers === 1 ? 0.5 : f / (fingers - 1), z0 = last[0] - 0.02, x0 = last[1] - last[2] * (0.12 + 0.72 * k);
    const ang = -0.15 - k * 0.55, L = fingerLen * (1.05 - 0.35 * k), dx = Math.sin(ang) * L, dz = Math.cos(ang) * L;
    const pts = [[V3(x0, 0, z0), fingerW, last[3] * 0.8], [V3(x0 + dx * 0.55, 0, z0 + dz * 0.55), fingerW * 0.85, last[3] * 0.6]];
    s.tube(pts, Y, 4, paint, { capStart: true, tipEnd: V3(x0 + dx, 0, z0 + dz) });
  }
  return s;
}

const done = (s, opts) => s.build(opts);

// ---------------------------------------------------------------------------------------------------------
// The common loon in breeding plumage: black head with a green sheen, a dagger bill, the white necklace of
// short stripes, the checkered back (big white squares on the mantle, rows of small spots on the flanks), a
// white breast and belly that show only when it rears up, a red eye. It swims low: the waterline is y = 0
// and the back stands about 6 cm above it.

const LOON_BLACK = col(0x121619), LOON_WHITE = col(0xe2e2db), LOON_HEAD = col(0x0f1716), BILL = col(0x272c31), EYE = col(0xa3101a);

export function loonModels() {
  // body: the waterline round its middle
  const b = new Shape();
  const rows = [[-0.45, 0.0, 0.012, 0.01], [-0.39, -0.008, 0.05, 0.034], [-0.29, -0.022, 0.1, 0.066], [-0.15, -0.04, 0.146, 0.098],
    [0.0, -0.05, 0.162, 0.114], [0.13, -0.046, 0.152, 0.11], [0.23, -0.03, 0.118, 0.096], [0.3, -0.004, 0.076, 0.084], [0.335, 0.03, 0.036, 0.05]];
  body(b, rows, 14, (th, p, i, r) => {
    const up = Math.sin(th), x = r[0];
    // white only underneath and up the breast: the flanks at the waterline stay black, so clear water
    // never shows a white hull
    const breast = smooth(0.16, 0.3, x) * smooth(0.02, -0.06, p.y);
    const c = LOON_WHITE.clone().lerp(LOON_BLACK, Math.max(0, smooth(-0.13, -0.085, p.y) - breast));
    const mantle = smooth(0.3, 0.85, up) * smooth(-0.26, -0.1, x) * (1 - smooth(0.08, 0.2, x));
    const cell = 0.019 + 0.016 * mantle, arc = (th - Math.PI / 2) * (r[2] + r[3]) * 0.5;
    return [c, x > 0.27 || x < -0.42 ? 0 : 1, x / cell, arc / cell];
  });
  // the head and neck: pivot at the neck's base (body x 0.27, on the waterline)
  const h = new Shape();
  const neck = [[V3(-0.035, -0.035, 0), 0.07, 0.075], [V3(0.0, 0.04, 0), 0.057, 0.06], [V3(0.04, 0.11, 0), 0.049, 0.053], [V3(0.075, 0.17, 0), 0.049, 0.053], [V3(0.1, 0.205, 0), 0.051, 0.055]];
  h.tube(neck, SIDE, 12, (th, p, f) => {
    const throat = -Math.sin(th); // the ring's pi/2 faces the back of the neck here
    const v = throat > 0.55 ? -4 : (f - 0.42) / 0.19;
    return [LOON_BLACK, 2, (th / (Math.PI * 2)) * 24, v];
  }, { capStart: true });
  body(h, [[0.055, 0.212, 0.043, 0.048], [0.095, 0.227, 0.054, 0.06], [0.14, 0.229, 0.05, 0.058], [0.185, 0.217, 0.038, 0.045], [0.214, 0.205, 0.027, 0.031]], 12, () => [LOON_HEAD], { capStart: true, capEnd: true });
  body(h, [[0.208, 0.205, 0.023, 0.027], [0.26, 0.2, 0.014, 0.017]], 8, () => [BILL], { capStart: true, tipEnd: V3(0.335, 0.191, 0) });
  h.bead(V3(0.15, 0.24, 0.047), 0.011, EYE, 1, 0.8, 0.5).bead(V3(0.15, 0.24, -0.047), 0.011, EYE, 1, 0.8, 0.5);
  // wings, out of sight unless it flaps or runs: dark above, white below
  const w = wing([[0.02, 0.1, 0.2, 0.02], [0.22, 0.1, 0.19, 0.016], [0.42, 0.06, 0.14, 0.012], [0.56, 0.0, 0.07, 0.008]], { top: col(0x181b1e), under: col(0xd9d9d2), tip: V3(-0.06, 0, 0.64) });
  // the chick: a sooty ball of down with a short dark bill
  const c = new Shape();
  body(c, [[-0.085, 0.0, 0.012, 0.01], [-0.065, 0.006, 0.045, 0.038], [-0.02, 0.014, 0.06, 0.052], [0.035, 0.018, 0.055, 0.05], [0.065, 0.026, 0.03, 0.034]], 10, (th, p) => [col(0x3a322c).lerp(col(0x6e655c), smooth(0.0, -0.03, p.y))]);
  body(c, [[0.04, 0.07, 0.026, 0.028], [0.07, 0.083, 0.034, 0.036], [0.1, 0.082, 0.028, 0.03], [0.118, 0.078, 0.014, 0.016]], 8, () => [col(0x2f2924)], { capStart: true, tipEnd: V3(0.145, 0.074, 0) });
  c.tube([[V3(0.045, 0.02, 0), 0.022, 0.024], [V3(0.06, 0.06, 0), 0.02, 0.022]], SIDE, 6, () => [col(0x342d27)], {});
  return {
    body: done(b, { reach: 0.1 }), head: done(h, { reach: 0.08 }), wingR: done(w, { reach: 0.06 }), wingL: done(w.mirrorZ(), { reach: 0.06 }),
    chick: done(c, { reach: 0.05 }),
  };
}

// ---------------------------------------------------------------------------------------------------------
// The beaver swimming: only its head and the hump of its back above the water, its flat tail (a part of its
// own, for the slap) trailing behind at the surface.

export function beaverModels() {
  const s = new Shape(), fur = col(0x6e4a2e), dark = col(0x523621);
  body(s, [[-0.36, -0.1, 0.03, 0.028], [-0.3, -0.1, 0.11, 0.088], [-0.15, -0.09, 0.158, 0.118], [0.0, -0.086, 0.165, 0.124], [0.12, -0.08, 0.13, 0.11],
    [0.2, -0.062, 0.09, 0.086], [0.26, -0.036, 0.084, 0.075], [0.33, -0.036, 0.07, 0.06], [0.39, -0.046, 0.045, 0.04], [0.418, -0.05, 0.022, 0.022]], 12,
  (th, p) => [fur.clone().lerp(dark, smooth(-0.02, 0.04, p.y))], { capStart: true, tipEnd: V3(0.43, -0.052, 0) });
  s.bead(V3(0.31, 0.012, 0.05), 0.01, col(0x0c0a09)).bead(V3(0.31, 0.012, -0.05), 0.01, col(0x0c0a09));
  s.bead(V3(0.268, 0.035, 0.056), 0.017, dark, 0.6, 1, 0.8).bead(V3(0.268, 0.035, -0.056), 0.017, dark, 0.6, 1, 0.8);
  s.bead(V3(0.426, -0.044, 0), 0.016, col(0x161210), 0.8, 0.8, 1.2);
  const t = new Shape(), scale = col(0x2a2622);
  body(t, [[0.0, 0.0, 0.035, 0.024], [-0.06, 0.0, 0.068, 0.02], [-0.17, 0.0, 0.076, 0.017], [-0.26, 0.0, 0.058, 0.015]], 8, () => [scale], { capStart: true, tipEnd: V3(-0.31, 0, 0) });
  return { body: done(s, { reach: 0.08 }), tail: done(t, { reach: 0.05 }) };
}

// The lodge: a dome of mud and sticks against the bank, about five metres across and a metre and a half out
// of the water, sticks laid every way over it, and the winter feed pile, branches pushed into the mud off its
// lakeward side (+x). The waterline is y = 0, the bed about 0.6 m down.
export function lodgeModel(seed = 5) {
  const rng = mulberry32(seed), s = new Shape();
  const prof = [[-0.7, 2.8], [0.0, 2.6], [0.35, 2.35], [0.7, 1.95], [1.02, 1.42], [1.28, 0.85], [1.45, 0.38]];
  const radiusAt = (y) => { for (let i = 1; i < prof.length; i++) if (y <= prof[i][0]) { const [y0, r0] = prof[i - 1], [y1, r1] = prof[i]; return r0 + (r1 - r0) * (y - y0) / (y1 - y0); } return 0.3; };
  const mud = col(0x6b5e50), stick = col(0x968974), wet = col(0x463d34);
  // a lumpy dome: each ring pushed in and out unevenly, and leaning a little off true
  const N = 16, rings = prof.map(([y, r], k) => {
    const ring = s.ring(V3(0.08 * k, y, -0.05 * k), Y, X, N, r, r, (th, p) => [mud.clone().lerp(stick, rng() * 0.7).lerp(wet, smooth(0.25, -0.1, p.y))]);
    ring.forEach((q) => { const f = 0.88 + rng() * 0.24; q.p.x = 0.08 * k + (q.p.x - 0.08 * k) * f; q.p.z = -0.05 * k + (q.p.z + 0.05 * k) * f; q.p.y += (rng() - 0.5) * 0.12; });
    return ring;
  });
  s.loft(rings, { capStart: true, tipEnd: V3(0.55, 1.55, -0.35) });
  const sticks = [col(0x9c9484), col(0x5a4b3d), col(0xc9bb9e), col(0x7a6853), col(0xb0a58f)];
  const stickAt = (p0, p1, r, c) => s.tube([[p0, r, r], [p1, r * 0.7, r * 0.7]], Y, 3, () => [c], {});
  // sticks laid over the dome every way, each tangent to it at its middle
  for (let k = 0; k < 64; k++) {
    const a = rng() * Math.PI * 2, y = -0.15 + rng() ** 0.75 * 1.45, R = radiusAt(y), rr = 0.03 + rng() * 0.03;
    const kk = (y + 0.7) / 2.15 * 6, c = V3(0.08 * kk, 0, -0.05 * kk);
    const nrm = V3(Math.cos(a), (R - radiusAt(y + 0.1)) * 6, Math.sin(a)).normalize();
    const p = V3(c.x + Math.cos(a) * R, y, c.z + Math.sin(a) * R).addScaledVector(nrm, rr * 0.8);
    const merid = V3(-Math.cos(a) * nrm.y, Math.hypot(nrm.x, nrm.z), -Math.sin(a) * nrm.y).normalize(), par = V3(-Math.sin(a), 0, Math.cos(a));
    const phi = rng() < 0.55 ? (rng() - 0.5) * 0.7 : rng() * Math.PI;
    const along = merid.multiplyScalar(Math.cos(phi)).addScaledVector(par, Math.sin(phi)).multiplyScalar(0.4 + rng() * 0.55);
    stickAt(p.clone().sub(along), p.clone().add(along), rr, sticks[(rng() * sticks.length) | 0]);
  }
  // the feed pile: branches pushed into the mud lakeward, poking up out of the water every way, a few in leaf
  const leaf = col(0x6d7f3a);
  for (let k = 0; k < 26; k++) {
    const a = rng() * Math.PI * 2, d = rng() * 1.4, bx = 4.4 + Math.cos(a) * d, bz = Math.sin(a) * d * 1.3;
    const tilt = 0.5 + rng() * 0.8, az = rng() * Math.PI * 2, L = 1.0 + rng() * 1.2;
    const p0 = V3(bx, -0.6, bz), dir = V3(Math.cos(az) * Math.sin(tilt), Math.cos(tilt), Math.sin(az) * Math.sin(tilt)), p1 = p0.clone().addScaledVector(dir, L);
    stickAt(p0, p1, 0.025 + rng() * 0.02, sticks[(rng() * sticks.length) | 0]);
    if (rng() < 0.5) { const m = p0.clone().lerp(p1, 0.65), f = m.clone().add(V3((rng() - 0.5) * 0.6, 0.25, (rng() - 0.5) * 0.6)); stickAt(m, f, 0.016, sticks[1]); }
    if (rng() < 0.3 && p1.y > 0.15) s.bead(p1, 0.07 + rng() * 0.05, leaf.clone().offsetHSL((rng() - 0.5) * 0.04, -0.1, (rng() - 0.5) * 0.06), 1.4, 0.5, 1.1);
  }
  return done(s, { reach: 0.6, ground: -0.65, floor: 0.4, rays: 16 });
}

// ---------------------------------------------------------------------------------------------------------
// The moose: a deep dark body on long pale-stockinged legs, the hump over the shoulders, a long head with the
// overhanging muzzle and the bell under the throat; the bull with broad palmate antlers. Parts: the body, the
// head and neck (pivot at the top of the neck's root, body (1.0, 1.62)), one leg (pivot at the top, hoof at
// y = -1.15) drawn four times. Feet at y = 0.

export const MOOSE = { neck: [1.0, 1.62], legs: [[0.6, 1.17, 0.2], [0.6, 1.17, -0.2], [-0.84, 1.19, 0.21], [-0.84, 1.19, -0.21]] };

export function mooseModels() {
  const coat = col(0x3a2b20), back = col(0x4a3a2c), belly = col(0x281e17);
  const b = new Shape();
  body(b, [[-1.2, 1.42, 0.06, 0.06], [-1.12, 1.42, 0.24, 0.28], [-0.9, 1.43, 0.34, 0.33], [-0.5, 1.42, 0.38, 0.35], [-0.1, 1.43, 0.4, 0.36],
    [0.3, 1.47, 0.4, 0.4], [0.62, 1.52, 0.36, 0.43], [0.88, 1.5, 0.28, 0.38], [1.02, 1.53, 0.15, 0.24], [1.07, 1.56, 0.05, 0.08]], 12,
  (th, p) => [coat.clone().lerp(back, smooth(1.6, 1.9, p.y)).lerp(belly, smooth(1.25, 1.1, p.y))]);
  b.tube([[V3(-1.16, 1.6, 0), 0.05, 0.04], [V3(-1.22, 1.5, 0), 0.04, 0.03]], SIDE, 5, () => [coat], { capStart: true, tipEnd: V3(-1.24, 1.42, 0) }); // the stub of a tail
  const head = (bull) => {
    const h = new Shape(), hc = col(0x433224), muzzle = col(0x2a1f17);
    h.tube([[V3(-0.12, -0.05, 0), 0.25, 0.3], [V3(0.12, 0.0, 0), 0.22, 0.26], [V3(0.3, 0.04, 0), 0.17, 0.21]], SIDE, 10, () => [coat], { capStart: true });
    h.tube([[V3(0.28, 0.1, 0), 0.15, 0.19], [V3(0.46, 0.04, 0), 0.14, 0.17], [V3(0.64, -0.08, 0), 0.11, 0.14], [V3(0.8, -0.19, 0), 0.115, 0.15], [V3(0.92, -0.28, 0), 0.1, 0.13]], SIDE, 10,
      (th, p, f) => [hc.clone().lerp(muzzle, smooth(0.6, 0.95, f))], { capStart: true, tipEnd: V3(0.98, -0.34, 0) });
    for (const sg of [1, -1]) {
      h.tube([[V3(0.36, 0.2, 0.09 * sg), 0.05, 0.03], [V3(0.3, 0.33, 0.2 * sg), 0.06, 0.025]], X, 6, () => [hc], { capStart: true, tipEnd: V3(0.24, 0.43, 0.27 * sg) }); // the ears
      h.bead(V3(0.56, 0.06, 0.12 * sg), 0.022, col(0x0b0908));
    }
    h.tube([[V3(0.3, -0.12, 0), 0.03, 0.08], [V3(0.27, -0.3, 0), 0.025, 0.07]], Z, 6, () => [coat], { capStart: true, tipEnd: V3(0.25, -0.44, 0) }); // the bell
    if (bull) {
      const horn = col(0xc4b79c);
      for (const sg of [1, -1]) {
        h.tube([[V3(0.42, 0.24, 0.08 * sg), 0.04, 0.04], [V3(0.42, 0.3, 0.26 * sg), 0.045, 0.045]], Y, 6, () => [horn], { capStart: true });
        // the palm: a broad flat plate swept out, up and back, its rim tined
        const rows = [[V3(0.42, 0.31, 0.26 * sg), 0.06, 0.035], [V3(0.36, 0.42, 0.46 * sg), 0.2, 0.03], [V3(0.28, 0.5, 0.64 * sg), 0.22, 0.025], [V3(0.2, 0.56, 0.76 * sg), 0.14, 0.02]];
        h.tube(rows, Y, 6, () => [horn], { capEnd: true });
        for (let k = 0; k < 5; k++) {
          const t = k / 4, base = V3(0.42 - 0.24 * t, 0.36 + 0.24 * t, (0.4 + 0.38 * t) * sg).add(V3(0.12 - 0.05 * t, 0.06, 0));
          h.tube([[base, 0.025, 0.02], [base.clone().add(V3(0.04, 0.08, 0.02 * sg)), 0.016, 0.014]], X, 4, () => [horn], { capStart: true, tipEnd: base.clone().add(V3(0.06, 0.17, 0.04 * sg)) });
        }
      }
    }
    return h;
  };
  const l = new Shape(), stocking = col(0x8a7c6a), hoof = col(0x1c1814);
  l.tube([[V3(0, 0.08, 0), 0.13, 0.17], [V3(0, -0.3, 0), 0.085, 0.11], [V3(0.02, -0.55, 0), 0.06, 0.065], [V3(0, -0.92, 0), 0.042, 0.045], [V3(0.015, -1.06, 0), 0.055, 0.06], [V3(0.025, -1.15, 0), 0.06, 0.07]], Z, 8,
    (th, p) => [coat.clone().lerp(stocking, smooth(-0.3, -0.55, p.y)).lerp(hoof, smooth(-1.02, -1.07, p.y))], { capStart: true, capEnd: true });
  return { body: done(b, { reach: 0.5 }), bull: done(head(true), { reach: 0.3 }), cow: done(head(false), { reach: 0.3 }), leg: done(l, { reach: 0.2, ground: -1.15 }) };
}

// ---------------------------------------------------------------------------------------------------------
// Birds of the open sky, one builder: a body lofted from tail to bill, a tail fan, and two wings (separate, so
// they flap and fold; a folded wing is the same wing turned back along the flank and shortened).

function bird({ rows, colourAt, bill, billColour, tail, tailColour, wingRows, wingOpts, s = 1 }) {
  const b = new Shape();
  body(b, rows.map((r) => [r[0] * s, r[1] * s, r[2] * s, r[3] * s]), 12, (th, p) => [colourAt(p.x / s, Math.sin(th))]);
  body(b, bill.rows.map((r) => [r[0] * s, r[1] * s, r[2] * s, r[3] * s]), 8, () => [billColour], { capStart: true, tipEnd: bill.tip.clone().multiplyScalar(s) });
  body(b, tail.map((r) => [r[0] * s, r[1] * s, r[2] * s, r[3] * s]), 6, () => [tailColour], { capStart: true, capEnd: true });
  const w = wing(wingRows.map((r) => r.map((v) => v * s)), { ...wingOpts, fingerLen: (wingOpts.fingerLen || 0.2) * s, fingerW: (wingOpts.fingerW || 0.03) * s, tip: wingOpts.tip ? wingOpts.tip.clone().multiplyScalar(s) : null, tipFrom: (wingOpts.tipFrom ?? Infinity) * s });
  return { body: done(b, { reach: 0.1 * s }), wingR: done(w, { reach: 0.08 * s }), wingL: done(w.mirrorZ(), { reach: 0.08 * s }) };
}

export function eagleModels() {
  const brown = col(0x3a291c), white = col(0xece8df);
  return bird({
    rows: [[-0.2, 0, 0.05, 0.045], [-0.1, 0.005, 0.11, 0.1], [0.04, 0.012, 0.13, 0.12], [0.15, 0.03, 0.1, 0.1], [0.22, 0.05, 0.068, 0.072], [0.28, 0.06, 0.064, 0.068], [0.335, 0.058, 0.05, 0.05], [0.37, 0.05, 0.032, 0.034]],
    colourAt: (x) => brown.clone().lerp(white, smooth(0.17, 0.215, x)),
    bill: { rows: [[0.36, 0.048, 0.028, 0.03], [0.405, 0.042, 0.019, 0.022]], tip: V3(0.44, 0.018, 0) }, billColour: col(0xd8a21c),
    tail: [[-0.16, 0.0, 0.05, 0.015], [-0.3, -0.005, 0.1, 0.014], [-0.44, -0.01, 0.125, 0.012]], tailColour: white,
    wingRows: [[0.04, 0.12, 0.36, 0.034], [0.3, 0.13, 0.4, 0.03], [0.6, 0.1, 0.38, 0.024], [0.8, 0.05, 0.3, 0.02]],
    wingOpts: { top: col(0x35261a), under: col(0x2a1f17), fingers: 5, fingerLen: 0.24, fingerW: 0.034 },
  });
}

export function gullModels() {
  const white = col(0xf0efea), grey = col(0x96a0a8);
  return bird({
    rows: [[-0.17, 0.01, 0.035, 0.03], [-0.09, 0.01, 0.075, 0.07], [0.03, 0.015, 0.09, 0.085], [0.12, 0.03, 0.07, 0.07], [0.17, 0.05, 0.048, 0.052], [0.215, 0.056, 0.045, 0.048], [0.25, 0.052, 0.03, 0.032]],
    colourAt: (x, up) => white.clone().lerp(grey, smooth(0.25, 0.6, up) * smooth(-0.15, -0.08, x) * (1 - smooth(0.1, 0.15, x))),
    bill: { rows: [[0.245, 0.05, 0.016, 0.02], [0.28, 0.045, 0.011, 0.014]], tip: V3(0.305, 0.036, 0) }, billColour: col(0xdcc23a),
    tail: [[-0.13, 0.01, 0.035, 0.01], [-0.25, 0.008, 0.07, 0.009]], tailColour: white,
    wingRows: [[0.03, 0.08, 0.2, 0.024], [0.24, 0.08, 0.2, 0.02], [0.48, 0.04, 0.155, 0.015], [0.64, -0.03, 0.085, 0.011]],
    wingOpts: { top: grey, under: col(0xe8e8e3), tipTop: col(0x1b1b1c), tipFrom: 0.52, tip: V3(-0.12, 0, 0.76) },
  });
}

export function ravenModels() {
  const black = col(0x0e1013);
  return bird({
    rows: [[-0.16, 0.0, 0.04, 0.035], [-0.08, 0.005, 0.08, 0.075], [0.04, 0.012, 0.095, 0.09], [0.13, 0.03, 0.075, 0.075], [0.19, 0.05, 0.055, 0.058], [0.24, 0.056, 0.052, 0.054], [0.28, 0.052, 0.036, 0.038]],
    colourAt: () => black,
    bill: { rows: [[0.27, 0.05, 0.026, 0.03], [0.32, 0.044, 0.017, 0.02]], tip: V3(0.355, 0.03, 0) }, billColour: col(0x111214),
    tail: [[-0.13, 0.0, 0.035, 0.012], [-0.24, -0.005, 0.07, 0.011], [-0.32, -0.01, 0.05, 0.01]], tailColour: black,
    wingRows: [[0.03, 0.09, 0.25, 0.026], [0.24, 0.09, 0.26, 0.022], [0.42, 0.06, 0.23, 0.018]],
    wingOpts: { top: col(0x101215), under: col(0x15171a), fingers: 4, fingerLen: 0.18, fingerW: 0.03 },
  });
}

// ---------------------------------------------------------------------------------------------------------
// The small things: a jumping fish (a smallmouth's olive back and pale belly), a dragonfly (a green darner,
// green thorax and blue abdomen, four clear wings drawn pale) and a damselfly (a bluet, its wings shut over its
// back), the insects at 1.7x life so they read at a paddle's length.

export function fishModel() {
  const s = new Shape(), back = col(0x4b5134), belly = col(0xcac8b9);
  const paint = (th, p) => [belly.clone().lerp(back, smooth(-0.01, 0.03, p.y))];
  body(s, [[-0.16, 0, 0.006, 0.026], [-0.12, 0, 0.014, 0.03], [-0.05, 0.002, 0.03, 0.05], [0.04, 0.004, 0.034, 0.058], [0.11, 0.002, 0.024, 0.04], [0.145, 0, 0.012, 0.018]], 8, paint, { capStart: true, tipEnd: V3(0.165, -0.003, 0) });
  body(s, [[-0.155, 0, 0.004, 0.02], [-0.215, 0, 0.003, 0.055]], 4, () => [back], { capStart: true, capEnd: true }); // the tail fin
  return done(s, { reach: 0.04 });
}

export function insectModels() {
  const k = 1.7;
  const dragon = new Shape(), thorax = col(0x4f8c3a), abdomen = col(0x2e6db3), wingC = col(0xd7e2e8);
  body(dragon, [[-0.075, 0.0, 0.0022, 0.0022], [-0.05, 0.0, 0.0034, 0.0034], [-0.015, 0.0, 0.004, 0.004]].map((r) => r.map((v) => v * k)), 4, () => [abdomen], { capStart: true, capEnd: true });
  body(dragon, [[-0.017, 0.0, 0.006, 0.006], [0.0, 0.001, 0.0075, 0.0075], [0.012, 0.001, 0.006, 0.006]].map((r) => r.map((v) => v * k)), 6, () => [thorax], { capStart: true, capEnd: true });
  dragon.bead(V3(0.017 * k, 0.002 * k, 0), 0.006 * k, col(0x2b4f3a), 0.8, 0.9, 1.2);
  for (const [x, chord] of [[0.004, 0.011], [-0.007, 0.014]]) {
    const w = wing([[0.004, x + chord / 2, chord, 0.0006], [0.03, x + chord / 2, chord * 0.9, 0.0005], [0.048, x + chord * 0.3, chord * 0.5, 0.0004]].map((r) => r.map((v) => v * k)), { top: wingC, under: wingC, n: 4, tip: V3((x - chord * 0.1) * k, 0.003 * k, 0.054 * k) });
    dragon.merge(w).merge(w.mirrorZ());
  }
  const damsel = new Shape(), blue = col(0x3c8fe6), tipC = col(0x14202e);
  body(damsel, [[-0.05, 0.0, 0.0014, 0.0014], [-0.03, 0.0, 0.0018, 0.0018], [-0.01, 0.0, 0.002, 0.002]].map((r) => r.map((v) => v * k)), 4, (th, p) => [blue.clone().lerp(tipC, smooth(-0.04 * k, -0.046 * k, p.x))], { capStart: true, capEnd: true });
  body(damsel, [[-0.011, 0.0, 0.0032, 0.0032], [0.002, 0.0006, 0.0036, 0.0036]].map((r) => r.map((v) => v * k)), 5, () => [blue], { capStart: true, capEnd: true });
  damsel.bead(V3(0.006 * k, 0.001 * k, 0), 0.004 * k, col(0x16304a), 0.7, 0.8, 1.5);
  damsel.tube([[V3(-0.002 * k, 0.004 * k, 0), 0.0012 * k, 0.004 * k], [V3(-0.022 * k, 0.005 * k, 0), 0.001 * k, 0.0045 * k]], X, 4, () => [wingC], { capStart: true, tipEnd: V3(-0.034 * k, 0.005 * k, 0) });
  return { dragon: done(dragon, { reach: 0.01 }), damsel: done(damsel, { reach: 0.008 }) };
}
