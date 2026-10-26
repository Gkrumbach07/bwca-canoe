import * as THREE from 'three';
import { clamp, smoothstep } from './rng.js';
import { storeLayouts } from './props.js';
import { makeLookMaterial } from './shading.js';

const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

// ---------------------------------------------------------------------------------------------------------------------
// What stands between the pivot (the walker's head, or a little over the canoe) and the third-person camera, the way
// Minecraft pulls its camera in (the owner, 2026-10-24: "when the camera is behind something like a tree in 3rd person
// view, we need to move the camera forward until it is out of the way"). Two kinds, in metres along the line from the
// pivot, into `out`:
//   hard  the view must not pass it: trunks (cylinders at the collision radius), rocks and bluffs (their drawn shape: a
//         point under the rock's top is inside it), logs, stumps and posts, the props' boxes (a store's walls and the
//         dock up to their tops; a wall without a top stands about 4 m), the ground, and inside a store its interior
//         box (the walls, the doorway and the ceiling: the camera never ends up outside them)
//   soft  the crowns (crownsNear: each tree's crown from its species and scale), only when asked (opts.crowns): the
//         chase no longer pulls in for them (fb2 E: it sees through them, SEE)
// The things come from tiles.treesNear (trunks, rocks with their RockShape, the tiles' obstacles and the camp's tents);
// solids with a shape (rocks, outcrops, bluff modules, logs, stumps) are read by it, a log without one as a capsule of its
// stem radius (rad).
// fb2 E (the owner, 2026-10-24: "the whole thing where the camera snaps to being in front of any trees that are in the
// way is kind of glitchy. And when it's in that snapped mode ... it just feels weird"): the trees no longer pull the
// camera in. Their crowns, boughs, trunks and the understory between the camera and the walker are seen through instead
// (SEE, below: a screen-door dither on the vegetation's own materials), and a trunk is hard only when it is big
// (SIGHT.bigTrunk m) and the camera would stand in it or just behind it (within SIGHT.trunkNear m of the camera's end
// of the line). The rest is as it was: the ground and the water, rocks, outcrops, bluffs, logs and stumps by their drawn
// shape, the props' boxes, and inside a store its walls and ceiling.
// (doorHalf, doorTop: the store's door, props.js DOOR, 1.2 m wide and 2.05 m high; stoop: how far out through it the
// camera may stand)
const SIGHT = { margin: 0.12, step: 0.18, wall: 4.0, shelf: 1.5, post: 2.5, ceiling: 2.55, bigTrunk: 0.35, trunkNear: 1.4, doorHalf: 0.6, doorTop: 2.05, stoop: 1.1 };
// the pull, along the line from the walker: min, the closest the camera comes (m); margin, how far it stays off what it
// meets (the spring works inside it, so the camera never goes into the thing itself); inW, the spring's rate coming in
// (rad/s, critically damped: about a tenth of a second); hold, the seconds the way must stay clear before it eases out;
// hyst, how much further out (m) the clear way must reach before that starts; outW, the spring's rate going out; door,
// how close it comes at a store's threshold, from doorReach m out; side, how far either side the indoor feelers reach
const PULL = { min: 0.45, margin: 0.3, inW: 18, hold: 0.35, hyst: 0.3, outW: 3.2, door: 1.1, doorReach: 3.0, side: 1.4 };
// fb2 E: the see-through. Every vegetation material's fragment (camera.js seeThrough patches them before they compile:
// the same two programs, no new one) is dropped by a 4 x 4 ordered dither where it lies in a cone round the line from
// the camera (uSeeA) to the walker's chest (uSeeB), stopping uSee.w short of him, at most uSee.x strong (a ghost of the
// tree stays); and anything within uSeeLens of the lens goes altogether, so the camera is never inside a bough. Only
// in the pass drawn from the chase camera itself (not the water's mirror, the title's orbit or a close-up), and not
// in the shadow pass (the depth material is left alone).
// polish A: the cone opens from the lens (uSee.y m there, uSee.z m more per metre along the line, at least 0.9 m at the
// walker), so on the screen it is a disc about the walker a little bigger than he is, with a soft rim; it was 1 m
// across at the lens, which at the lens is the whole frame, so half the view was a screen door on the carry and at a
// forest edge. The lens bubble is smaller for the same reason.
export const SEE = {
  uSee: { value: new THREE.Vector4(0, 0.12, 0.13, 0.05) },
  uSeeLens: { value: new THREE.Vector2(0.45, 0.8) },
  uSeeA: { value: new THREE.Vector3() },
  uSeeB: { value: new THREE.Vector3() },
};
const SEE_STRENGTH = 0.95;
const SHOULDER = 0.75; // m: how far right of him the view moves looking all the way down (ChaseCamera.update)
const CARRY_PITCH = 0.1; // rad: the chase's tilt on foot under the canoe (0.27 elsewhere; polish A)
const seePars = /* glsl */ `
uniform vec4 uSee;
uniform vec2 uSeeLens;
uniform vec3 uSeeA, uSeeB;
varying vec3 vSeeW;
float seeBayer( vec2 p ) {
  ivec2 q = ivec2( mod( floor( p ), 4.0 ) );
  float b[16] = float[16]( 0.0, 8.0, 2.0, 10.0, 12.0, 4.0, 14.0, 6.0, 3.0, 11.0, 1.0, 9.0, 15.0, 7.0, 13.0, 5.0 );
  return ( b[ q.x + q.y * 4 ] + 0.5 ) / 16.0;
}
float seeFade() {
  vec3 ab = uSeeB - uSeeA, ap = vSeeW - uSeeA;
  float L = length( ab );
  if ( L < 0.05 ) return 0.0;
  vec3 u = ab / L;
  float s = dot( ap, u ), d = length( ap - u * clamp( s, 0.0, L ) ), r = uSee.y + clamp( s, 0.0, L ) * max( uSee.z, 0.9 / L );
  float cone = ( 1.0 - smoothstep( 0.45 * r, r, d ) ) * smoothstep( -0.3, 0.2, s ) * ( 1.0 - smoothstep( L - uSee.w - 0.4, L - uSee.w, s ) );
  float lens = 1.0 - smoothstep( uSeeLens.x, uSeeLens.y, length( ap ) );
  return max( cone * uSee.x, lens * step( 0.001, uSee.x ) );
}`;
const seeFrag = /* glsl */ `
  if ( uSee.x > 0.0 && seeFade() > seeBayer( gl_FragCoord.xy ) ) discard;`;
const seeVert = /* glsl */ `
  { vec4 seeW = vec4( transformed, 1.0 );
  #ifdef USE_INSTANCING
    seeW = instanceMatrix * seeW;
  #endif
    vSeeW = ( modelMatrix * seeW ).xyz; }`;
function patchSee(m, camera, chase) {
  if (!m || m.userData.see) return;
  const compile = m.onBeforeCompile, key = m.customProgramCacheKey, before = m.onBeforeRender;
  m.onBeforeCompile = function (shader, renderer) {
    compile.call(this, shader, renderer);
    Object.assign(shader.uniforms, SEE);
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vSeeW;').replace('#include <project_vertex>', '#include <project_vertex>' + seeVert);
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\n' + seePars).replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>' + seeFrag);
  };
  m.customProgramCacheKey = function () { return key.call(this) + '|see'; };
  // on only in a pass drawn from where the chase put the camera (the uniforms go up again whenever the camera changes)
  m.onBeforeRender = function (renderer, scene, cam, ...rest) {
    before.call(this, renderer, scene, cam, ...rest);
    SEE.uSee.value.x = cam === camera && cam.position.distanceToSquared(SEE.uSeeA.value) < 0.01 ? chase.seeStrength : 0;
  };
  m.userData.see = true;
}
// p2 B (the owner, 2026-10-26: "in first person i cant see portage trail while having canoe on back"): from the eyes
// under the canoe. The view had come up level (half the screen the hull's inside), and the hull's invisible lid at the
// gunwales (canoe.js: a depth-only plane that keeps the water out of a floating hull) hid everything drawn after it,
// the trail's tread and the water among them (main.js hides it on the carry). Now, as a portager looks: taking the canoe
// up in first person (or turning to first person under it) the look tips down the trail (FP_CARRY.pitch, about 17
// degrees; the mouse moves it as ever), the bow rides higher on the shoulders (FP_CARRY.bow, canoe.js state.carryBow,
// over its own 5 degrees), and the hull near the eye is seen through: the player's hull draws with a copy of its
// material dithered out (the 4 x 4 screen door of SEE) within FP_CARRY.near metres of the eye, fading back in by
// FP_CARRY.far, and only above the eye, never quite gone (FP_CARRY.ghost), so the hull's inside overhead stops filling
// the screen while the gunwales at the shoulders, running forward to the bow, and the bow itself stay. Third person is
// as it was.
export const FP_CARRY = { pitch: -0.3, bow: 0.08, near: 0.9, far: 2.4, ghost: 0.82 };
const HULL_SEE = { uHullSee: { value: new THREE.Vector4(0, 0, 0, 0) }, uHullSeeR: { value: new THREE.Vector2(FP_CARRY.near, FP_CARRY.far) } };
function hullSeeMaterial(from) {
  return makeLookMaterial({ vertexColors: from.vertexColors, color: from.color }, {
    wrap: from.userData && from.userData.look ? from.userData.look.wrap : 0, name: 'look-solid-see',
    compile: (shader) => {
      Object.assign(shader.uniforms, HULL_SEE);
      shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vSeeW;').replace('#include <project_vertex>', '#include <project_vertex>' + seeVert);
      shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>
uniform vec4 uHullSee;
uniform vec2 uHullSeeR;
varying vec3 vSeeW;
float seeBayer( vec2 p ) {
  ivec2 q = ivec2( mod( floor( p ), 4.0 ) );
  float b[16] = float[16]( 0.0, 8.0, 2.0, 10.0, 12.0, 4.0, 14.0, 6.0, 3.0, 11.0, 1.0, 9.0, 15.0, 7.0, 13.0, 5.0 );
  return ( b[ q.x + q.y * 4 ] + 0.5 ) / 16.0;
}`).replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
  if ( uHullSee.w > 0.0 && uHullSee.w * ( 1.0 - smoothstep( uHullSeeR.x, uHullSeeR.y, length( vSeeW - uHullSee.xyz ) ) ) * smoothstep( -0.06, 0.1, vSeeW.y - uHullSee.y ) > seeBayer( gl_FragCoord.xy ) ) discard;`);
    },
  });
}
const _seg = { ax: 0, ay: 0, az: 0, dx: 0, dy: 0, dz: 0, L: 0 };
// the first t in [0, 1] where the 2D segment enters a circle of radius r round (cx, cz), or Infinity (inside at the
// start counts as 0)
function circleT(S, cx, cz, r) {
  const fx = S.ax - cx, fz = S.az - cz, a = S.dx * S.dx + S.dz * S.dz, b = fx * S.dx + fz * S.dz, c = fx * fx + fz * fz - r * r;
  if (c <= 0) return 0;
  if (a < 1e-12) return Infinity;
  const disc = b * b - a * c;
  if (disc < 0) return Infinity;
  const t = (-b - Math.sqrt(disc)) / a;
  return t >= 0 && t <= 1 ? t : Infinity;
}
// is the segment's start inside the box's footprint (with the margin): the thing the walker stands in or sits on
// (fb3 A: the bench's obstacle has no top, so it read as a wall round the seated walker's head and pulled the chase in
// to PULL.min; the owner, 2026-10-25: "sitting on a bench zooms me in in 3rd person and doesnt let me use my zoom level")
function insideBox(S, o) {
  const px = S.ax - o.x, pz = S.az - o.z, m = SIGHT.margin;
  return Math.abs(px * o.ux + pz * o.uz) <= o.hx + m && Math.abs(-px * o.uz + pz * o.ux) <= o.hz + m;
}
// an oriented box (centre x, z; its a axis ux, uz; half sizes hx along a, hz across; y from -inf to top): entry t
function boxT(S, o, top) {
  const px = S.ax - o.x, pz = S.az - o.z;
  const a0 = px * o.ux + pz * o.uz, b0 = -px * o.uz + pz * o.ux;
  const da = S.dx * o.ux + S.dz * o.uz, db = -S.dx * o.uz + S.dz * o.ux;
  let t0 = 0, t1 = 1;
  const slab = (p, d, h) => {
    if (Math.abs(d) < 1e-9) return Math.abs(p) <= h;
    let u = (-h - p) / d, v = (h - p) / d;
    if (u > v) { const w = u; u = v; v = w; }
    if (u > t0) t0 = u; if (v < t1) t1 = v;
    return t0 <= t1;
  };
  const m = SIGHT.margin;
  if (!slab(a0, da, o.hx + m) || !slab(b0, db, o.hz + m)) return Infinity;
  // the height: under the top over [t0, t1]
  if (S.dy >= 0) { if (S.ay + S.dy * t0 > top) return Infinity; }
  else { const tt = (top - S.ay) / S.dy; if (tt > t1) return Infinity; if (tt > t0) t0 = tt; }
  return t0;
}
// The crowns, from the tiles' own trees (the vegetation bins: species and scale per instance), gathered once per tile
// a slice at a time and hashed by 8 m cell. Per species (vegetation.js SPECIES order; the guests are drawn in their
// hosts' bins): its height at unit scale, the crown's bottom and top as shares of it, its widest radius, and whether
// it is a cone widest at the bottom (the spruces, the cedar, the tamarack) or a round crown (the white pine's tiers,
// the birch, the red and jack pines). A little generous below: boughs droop. Measured from the drawn trees (vegetation.js makers, the
// median of every variant; the radius about nine tenths of the bough tips'): the cones keep `top` of their radius at
// the top, as the spruce's and the cedar's boughs do (at the join, a cedar's 3.4 m boughs filled the carry's view while
// the old 2.1 m cone let the camera sit in them).
const CROWN = { 0: [19.5, 0.22, 1.1, 5.6, 0], 1: [16, 0.0, 1.0, 3.2, 1, 0.4], 2: [19, 0.45, 1.08, 4.0, 0], 3: [13, 0.25, 1.08, 3.6, 0], 4: [9.9, 0.0, 1.02, 3.3, 1, 0.35], 9: [8.6, 0.18, 1.08, 3.1, 0], 17: [15.4, 0.06, 1.0, 2.9, 1, 0.35] };
const CELL = 8, crownTiles = new WeakMap();
function crownsOf(e, budget) {
  let c = crownTiles.get(e);
  if (!c) { c = { bin: 0, i: 0, done: false, hash: new Map() }; crownTiles.set(e, c); }
  if (c.done) return c;
  const bins = e.vegBins || [];
  let n = 0;
  while (c.bin < bins.length) {
    const b = bins[c.bin], K = CROWN[b.sp];
    if (!K || !b.count) { c.bin++; c.i = 0; continue; }
    const M = b.matrices;
    for (; c.i < b.count; c.i++) {
      if (++n > budget) return c;
      const o = c.i * 16, s = Math.hypot(M[o], M[o + 1], M[o + 2]);
      if (s < 0.05) continue;
      const x = M[o + 12] + e.ox, y = M[o + 13], z = M[o + 14] + e.oz, h = K[0] * s;
      const rec = { x, z, y0: y + K[1] * h, y1: y + K[2] * h, R: K[3] * (0.6 + 0.4 * s), cone: K[4], top: K[5] || 0 };
      const key = Math.floor(x / CELL) * 65536 + Math.floor(z / CELL);
      let a = c.hash.get(key);
      if (!a) c.hash.set(key, (a = []));
      a.push(rec);
    }
    c.bin++; c.i = 0;
  }
  c.done = true;
  return c;
}
// the crowns whose middle is within r (plus their own reach) of (x, z); a tile not yet gathered gathers up to 4000
// trees a call, so a fresh tile costs a few frames of a millisecond rather than one long one
function crownsNear(world, x, z, r, out) {
  out.length = 0;
  const T = world.tiles;
  if (!T || !T.tiles || !world.tileOf) return out;
  const [tx0, ty0] = world.tileOf(x - r - 3, z - r - 3), [tx1, ty1] = world.tileOf(x + r + 3, z + r + 3);
  for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
    const e = T.tiles.get(T.key(tx, ty));
    if (!e || e.state !== 'ready' || !e.vegBins) continue;
    const c = crownsOf(e, 4000);
    for (let cz = Math.floor((z - r - 3) / CELL); cz <= Math.floor((z + r + 3) / CELL); cz++) for (let cx = Math.floor((x - r - 3) / CELL); cx <= Math.floor((x + r + 3) / CELL); cx++) {
      const a = c.hash.get(cx * 65536 + cz);
      if (a) for (const t of a) if (Math.abs(t.x - x) <= r + t.R && Math.abs(t.z - z) <= r + t.R) out.push(t);
    }
  }
  return out;
}
const _crowns = [];
// a crown's radius at height y, or -1 outside its height
function crownR(t, y) {
  if (y < t.y0 || y > t.y1) return -1;
  const f = (y - t.y0) / (t.y1 - t.y0);
  return t.cone ? t.R * (1 - f * (1 - t.top)) : t.R * Math.sqrt(Math.max(0, 1 - (2 * f - 1) * (2 * f - 1)));
}

const _props = new Set();
function propsNear(world, x, z, r) {
  _props.clear();
  const T = world.tiles;
  if (!T || !T.tiles || !world.tileOf) return _props;
  const [tx0, ty0] = world.tileOf(x - r, z - r), [tx1, ty1] = world.tileOf(x + r, z + r);
  for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
    const e = T.tiles.get(T.key(tx, ty));
    if (e && e.obstacles) for (const o of e.obstacles) _props.add(o);
  }
  for (const o of T.dynamic || []) _props.add(o);
  return _props;
}
export function sightLine(world, ax, ay, az, bx, by, bz, out = {}, opts = {}) {
  out.hard = Infinity; out.soft = Infinity; out.what = null;
  const S = _seg;
  S.ax = ax; S.ay = ay; S.az = az; S.dx = bx - ax; S.dy = by - ay; S.dz = bz - az;
  const L = (S.L = Math.hypot(S.dx, S.dy, S.dz));
  if (L < 0.05) return out;
  const tiles = world.tiles;
  const ground = (x, z) => (tiles ? tiles.groundAt(x, z) : world.heightAt(x, z));
  let hard = 1, indoors = false, floorY = 0;
  const at = (t) => [ax + S.dx * t, ay + S.dy * t, az + S.dz * t];
  // inside a store: its interior box, walls, doorway and ceiling alike
  for (const Ly of storeLayouts()) {
    if (!Ly.inside || !Ly.inside(ax, az)) continue;
    indoors = true;
    const c = Ly.centre, A = Ly.axes.a, B = Ly.axes.b, m = 0.18;
    const pa = (ax - c.x) * A.x + (az - c.z) * A.z, pb = (ax - c.x) * B.x + (az - c.z) * B.z;
    const da = S.dx * A.x + S.dz * A.z, db = S.dx * B.x + S.dz * B.z;
    const exit = (p, d, h) => (Math.abs(d) < 1e-9 ? Infinity : d > 0 ? (h - p) / d : (-h - p) / d);
    const ta = exit(pa, da, Ly.size.iW - m), tc = S.dy > 1e-6 ? (Ly.floorY + SIGHT.ceiling - ay) / S.dy : Infinity;
    let tb = exit(pb, db, Ly.size.iD - m);
    // fb2 E: out through the open door (the front wall, +b, inside the door's gap and under its head), the camera may stand
    // a little way out on the stoop, looking in: so stepping in does not throw it from the porch to the walker's head,
    // and turning away from the door inside brings it to the wall beside it, not from far out
    if (tb <= Math.min(ta, tc) && db > 0 && Ly.door) {
      const dA = (Ly.door.x - c.x) * A.x + (Ly.door.z - c.z) * A.z, ea = pa + da * tb, ey = ay + S.dy * tb;
      if (Math.abs(ea - dA) < SIGHT.doorHalf - 0.12 && ey < Ly.floorY + SIGHT.doorTop - 0.12) tb += (SIGHT.stoop + PULL.margin) / L;
    }
    const t = Math.min(ta, tb, tc);
    if (t < hard) { hard = Math.max(0, t); out.what = 'store'; }
    floorY = Ly.floorY;
    break;
  }
  // the things near the line
  const mx = ax + S.dx / 2, mz = az + S.dz / 2, half = Math.hypot(S.dx, S.dz) / 2;
  const near = tiles && tiles.treesNear ? tiles.treesNear(mx, mz, half + 1) : [];
  // the props' own round things (posts, a fire ring, the latrine) look like trunks in that list: known by being the
  // tiles' obstacles (and the camp's tents) rather than fresh records
  const props = propsNear(world, mx, mz, half + 1);
  let soft = Infinity;
  const steps = Math.max(2, Math.ceil(L / SIGHT.step));
  for (const o of near) {
    // a box: up to its top; one without (a wall) about 4 m, or indoors (the shelves, the counter: the walls are the
    // interior's box above) a shelf's height
    if (o.box) {
      if (insideBox(S, o)) continue; // fb3 A: the seat he sits on (or anything he stands in) is not in the way
      const t = boxT(S, o, o.top !== undefined ? o.top : o.seeTop !== undefined ? o.seeTop : indoors ? floorY + SIGHT.shelf : ground(o.x, o.z) + SIGHT.wall); // (seeTop: a bench, props.js) if (t < hard) { hard = t; out.what = 'box'; } continue;
    }
    if (o.shape && o.shape.heightAt) {
      // a solid by its drawn shape (a rock, an outcrop, a bluff's module, a log, a stump): inside where the point is
      // under its top; only the samples over its footprint are asked
      const sh = o.shape, bb = sh.minX !== undefined;
      for (let i = 0; i <= steps; i++) {
        const t = i / steps; if (t >= hard) break;
        const [x, y, z] = at(t);
        if (bb && (y > sh.maxY + 0.1 || x < sh.minX - 0.1 || x > sh.maxX + 0.1 || z < sh.minZ - 0.1 || z > sh.maxZ + 0.1)) continue;
        if (y < sh.heightAt(x, z) + SIGHT.margin) { hard = t; out.what = o.log ? 'log' : o.cliff ? 'cliff' : 'rock'; break; }
      }
      continue;
    }
    if (o.log) {
      // a log without a shape: a capsule along the ground from (ax, az) to (bx, bz), its stem's radius, up to its top
      const rad = o.rad ?? o.r, lx = o.bx - o.ax, lz = o.bz - o.az, l2 = lx * lx + lz * lz || 1e-9, top = o.top ?? ground(o.ax, o.az) + 2 * rad;
      for (let i = 0; i <= steps; i++) {
        const t = i / steps; if (t >= hard) break;
        const [x, y, z] = at(t); if (y > top) continue;
        const u = Math.min(1, Math.max(0, ((x - o.ax) * lx + (z - o.az) * lz) / l2));
        if (Math.hypot(x - o.ax - lx * u, z - o.az - lz * u) < rad + SIGHT.margin) { hard = t; out.what = 'log'; break; }
      }
      continue;
    }
    if (o.r === undefined) continue;
    if (o.top !== undefined || o.rock || props.has(o)) {
      // a stump, a round rock of a prop, a sign post, the latrine, a fire ring: a cylinder up to its top (a prop's
      // without one by its size); a porch post is too thin to bother the view
      if (o.top === undefined && !o.rock && o.r < 0.1) continue;
      const top = o.top !== undefined ? o.top : ground(o.x, o.z) + (o.rock ? SIGHT.post : o.r >= 0.6 ? 0.4 : 1.1);
      const t = circleT(S, o.x, o.z, o.r + SIGHT.margin);
      if (t <= 0) continue; // fb3 A: sat on the latrine (its post holds the pivot): not in the way
      if (t < hard && ay + S.dy * t < top) { hard = t; out.what = 'post'; }
      continue;
    }
    // a trunk: seen through (SEE) unless it is big and the camera would stand in it or just behind it (fb2 E)
    if (o.r < SIGHT.bigTrunk) continue;
    const t = circleT(S, o.x, o.z, o.r + SIGHT.margin);
    if (t < hard && (1 - t) * L < SIGHT.trunkNear) { hard = t; out.what = 'trunk'; }
  }
  // the crowns, soft (fb2 E: only when asked; the chase sees through them); one the pivot stands in is the walker's
  // own shade, not in the way
  if (!indoors && opts.crowns) {
    for (const c of crownsNear(world, mx, mz, half + 1, _crowns)) {
      const r0 = crownR(c, ay);
      if (r0 > 0 && Math.hypot(ax - c.x, az - c.z) < r0) continue;
      if (circleT(S, c.x, c.z, c.R) === Infinity) continue;
      for (let i = 1; i <= steps; i++) {
        const tt = i / steps; if (tt >= soft || tt >= hard) break;
        const [x, y, z] = at(tt), r = crownR(c, y);
        if (r > 0 && Math.hypot(x - c.x, z - c.z) < r) { soft = tt; break; }
      }
    }
  }
  // the ground (and the water) along the line, finer than the lift's five samples
  for (let i = 1; i <= steps; i++) {
    const t = i / steps; if (t >= hard) break;
    const [x, y, z] = at(t);
    if (y < Math.max(ground(x, z), world.levelAt(x, z)) + 0.15) { hard = t; out.what = 'ground'; break; }
  }
  out.hard = hard < 1 ? hard * L : Infinity;
  out.soft = soft < hard && soft < 1 ? soft * L : Infinity;
  return out;
}

export class ChaseCamera {
  constructor(camera, dom, world) {
    this.camera = camera; this.world = world;
    this.distance = 10; this.yaw = 0; this.pitch = 0.27; this.userYaw = 0; this.userPitch = 0;
    this.pos = new THREE.Vector3(); this.look = new THREE.Vector3(); this.first = true;
    this.lastInput = 0;
    this.mode = 'third';
    this.sensitivity = 1; this.invert = false; // mouse look, set from the settings panel
    this.head = new THREE.Vector3();
    this.dom = dom;
    // The mouse looks the way it does in Minecraft wherever the body faces the look: in first person, and on
    // foot in third person (the camera sits behind the walker, who turns with the mouse). The pointer is
    // captured on the first key or click once the game is running, every movement turns the look at once,
    // and Esc gives the pointer back (Esc again opens the menu). Without the capture (refused, or released)
    // holding the button and dragging looks the same way. From behind the canoe the cursor stays free: a drag
    // orbits unless something (the rod) has locked the orbit, and the cursor is kept in view coordinates for
    // aiming and steering. Captured, there is no cursor and the rod aims down the middle of the view.
    this.orbitLocked = false;
    this.cursor = { x: 0, y: 0, inside: false };
    this.locked = false;
    this.allowLock = false;  // main: the game is running, with no card, panel or big map up
    this.footLook = false;   // third person on foot
    this.viewYaw = 0; this.viewPitch = 0; // the look: bearing and tilt, world space
    this.lookYaw = 0;        // the look's bearing relative to the body (the bow seeks it when asked)
    this.focus = null; // { pos, look } world vectors: a close-up that overrides the chase while it is set
    this.forwardYaw = 0;    // the bearing straight into the view: what W means (player.js)
    this.lastHeading = null; // the player's heading last frame
    this.cursorSteer = false; // the canoe follows the cursor (settings): shown by the pointer
    this.occlusion = true;    // third person: pulled in ahead of what stands in the way (pullIn)
    this.roomAware = true;    // and kept inside a store's walls, so a store need not switch to first person (outfitter.js reads it)
    this.pull = Infinity;     // the distance the solid things allow now (m), on a spring
    this.pullV = 0;           // fb2 E: the spring's speed (m/s)
    this.pullHold = 0;        // fb2 E: seconds the way has been clear (it eases out after PULL.hold)
    this.sight = null;        // the last sightLine: { hard, soft } metres along the line from the pivot
    this.seeStrength = 0;     // fb2 E: how strongly the vegetation between the camera and the walker is seen through (SEE)
    const lock = () => {
      if (!this.wantsLock || this.locked) return;
      try { const p = dom.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (_) { /* not allowed here; dragging looks instead */ }
    };
    document.addEventListener('pointerlockchange', () => { this.locked = document.pointerLockElement === dom; if (this.locked) this.cursor.inside = false; });
    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyV') this.setMode(this.mode === 'third' ? 'first' : 'third');
      lock(); // any key will do: the first W takes the mouse
    });
    let dragging = false, lx = 0, ly = 0;
    dom.addEventListener('pointerdown', (e) => {
      if (this.mouseLook) { lock(); dragging = true; return; }
      if (this.orbitLocked) return;
      dragging = true; lx = e.clientX; ly = e.clientY;
      try { dom.setPointerCapture(e.pointerId); } catch (_) { /* a synthetic pointer has no capture */ }
    });
    dom.addEventListener('pointerup', () => { dragging = false; });
    dom.addEventListener('pointermove', (e) => {
      const s = this.sensitivity, inv = this.invert ? -1 : 1;
      if (this.mouseLook) {
        if (!this.locked && !dragging) { this.trackCursor(e); return; }
        this.viewYaw = wrap(this.viewYaw - e.movementX * 0.0022 * s);
        this.viewPitch = clamp(this.viewPitch - e.movementY * 0.0022 * s * inv, -1.25, 1.25);
        this.forwardYaw = this.viewYaw; // the body reads it this very frame
        this.lastInput = performance.now();
        return;
      }
      this.trackCursor(e);
      if (!dragging) return;
      this.userYaw -= (e.clientX - lx) * 0.006 * s; this.userPitch = clamp(this.userPitch - (e.clientY - ly) * 0.004 * s * inv, -0.25, 0.9);
      lx = e.clientX; ly = e.clientY; this.lastInput = performance.now();
    });
    dom.addEventListener('pointerleave', () => { this.cursor.inside = false; });
    dom.addEventListener('wheel', (e) => { this.distance = clamp(this.distance * Math.exp(e.deltaY * 0.0012), 4, 40); e.preventDefault(); }, { passive: false });
  }

  // fb2 E: see through the trees between the camera and the walker (SEE): patch the vegetation kit's card materials
  // (every tree, shrub and fern; not the rocks or the cliffs) before they first compile (main.js, right after this camera
  // is made)
  seeThrough(kit) {
    if (!kit || !kit.materialFor) return;
    const mats = new Set([kit.material]);
    for (let sp = 0; sp < (kit.variants || []).length; sp++) { const m = kit.materialFor(sp); if (m && m.userData && m.userData.depth) mats.add(m); }
    for (const m of mats) patchSee(m, this.camera, this);
  }

  // p2 B: the player's hull, seen through near the eye on a first-person carry (FP_CARRY). Its see-through copy of the
  // material is made now and hung on a hidden mesh in the scene, so the compile behind the title card makes its program
  // (main.js, before the prewarm); the hull takes it only while it is overhead in first person (carryView).
  seeHull(canoe, scene) {
    const mesh = canoe && canoe.hull && canoe.hull.children.find((c) => c.isMesh && c.material && c.material.colorWrite !== false);
    if (!mesh) return;
    this.hullSee = { mesh, base: mesh.material, see: hullSeeMaterial(mesh.material), canoe, on: false, carried: false };
    const warm = new THREE.Mesh(mesh.geometry, this.hullSee.see);
    warm.visible = false; warm.frustumCulled = false; warm.name = 'p2b-hull-see-prewarm';
    if (scene) scene.add(warm);
  }

  // p2 B: the first-person carry view, each frame (update): the look tipped down the trail as the carry starts in first
  // person, the bow lifted, the near hull seen through; all of it off in third person or once the canoe is down
  carryView(player, first, carry) {
    const H = this.hullSee, on = first && carry && !this.focus;
    if (on && (!H || !H.carried)) this.viewPitch = Math.min(this.viewPitch, FP_CARRY.pitch); // (a look already further down stays)
    if (H) H.carried = on;
    if (player.canoe && player.canoe.state) player.canoe.state.carryBow = on ? FP_CARRY.bow : 0;
    if (!H) return;
    if (H.mesh.material !== H.see && H.mesh.material !== H.base) { H.base = H.mesh.material; H.see = hullSeeMaterial(H.base); } // (the hull's material was swapped elsewhere)
    H.mesh.material = on ? H.see : H.base;
    HULL_SEE.uHullSee.value.set(this.head.x, this.head.y, this.head.z, on ? FP_CARRY.ghost : 0);
  }

  get mouseLook() { return this.mode === 'first' || this.footLook; }
  get wantsLock() { return this.allowLock && this.mouseLook; }

  // jump straight to the new spot (after a teleport) instead of gliding across the map
  snap() { this.first = true; this.userYaw = 0; this.userPitch = 0; this.lastHeading = null; }

  get dragging() { return performance.now() - this.lastInput < 200; }

  trackCursor(e) {
    const r = this.dom.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) { this.cursor.x = ((e.clientX - r.left) / r.width) * 2 - 1; this.cursor.y = -((e.clientY - r.top) / r.height) * 2 + 1; this.cursor.inside = true; }
  }

  setCursorSteer(on) { this.cursorSteer = on; this.dom.style.cursor = on ? 'crosshair' : ''; }

  // Where the ray through the cursor meets the horizontal plane at height y: { x, z } in world space, or null
  // when the cursor is off the page, above the horizon or too far out.
  cursorOnPlane(y) {
    if (!this.cursor.inside) return null;
    const p = new THREE.Vector3(this.cursor.x, this.cursor.y, 0.5).unproject(this.camera);
    const o = this.camera.position, d = p.sub(o);
    if (d.y >= -1e-4) return null;
    const t = (y - o.y) / d.y;
    if (!(t >= 0 && t <= 600)) return null; // also catches a NaN projection (a zero-sized view)
    const x = o.x + d.x * t, z = o.z + d.z * t;
    return Number.isFinite(x) && Number.isFinite(z) ? { x, z } : null;
  }

  setMode(mode) {
    this.mode = mode;
    this.userYaw = 0; this.userPitch = 0;
    if (this.lastHeading !== null) this.forwardYaw = this.lastHeading; // straight ahead until the first frame
    this.camera.fov = mode === 'first' ? 72 : 60;
    // from the eyes the hands, the paddle and the rod come within a few centimetres: a near plane close in
    this.camera.near = mode === 'first' ? 0.05 : 0.3;
    this.camera.updateProjectionMatrix();
    this.first = true;
  }

  // fb3 join: the chase eases from where it was (the lerps of pos and look, the pull's spring), so a NaN once (the eye or
  // the walker for a frame) stayed for good: a lerp from NaN is NaN, snap() could not clear it, and every frame threw in
  // the audio's listener. Started afresh about the walker (or where it last was), the view's look kept where it is finite.
  heal(player) {
    const f = Number.isFinite, h = f(player.heading) ? player.heading : f(this.viewYaw) ? this.viewYaw : 0;
    const x = f(player.x) ? player.x : 0, z = f(player.z) ? player.z : 0, y = f(player.altitude) ? player.altitude : 0;
    this.pos.set(x - Math.cos(h) * 4, y + 2.5, z + Math.sin(h) * 4); this.look.set(x, y + 1.5, z); this.head.copy(this.pos);
    if (!f(this.viewYaw)) this.viewYaw = h;
    if (!f(this.forwardYaw)) this.forwardYaw = this.viewYaw;
    if (!f(this.viewPitch)) this.viewPitch = 0;
    if (!f(this.userYaw)) this.userYaw = 0;
    if (!f(this.userPitch)) this.userPitch = 0;
    this.pull = Infinity; this.pullV = 0; this.pullHold = 0; this.sight = null; this.lastTarget = null;
    this.first = true;
  }

  update(dt, player, carrying) {
    const P = this.pos, L = this.look; // fb3 join: never left poisoned (heal)
    if (!Number.isFinite(P.x + P.y + P.z + L.x + L.y + L.z + this.viewYaw + this.viewPitch + this.forwardYaw + this.pullV)) this.heal(player);
    this.seeStrength = 0; // (fb2 E: on again below, in third person behind the walker or the canoe)
    if (this.focus) {
      const k = this.first ? 1 : 1 - Math.exp(-dt * 4);
      this.pos.lerp(this.focus.pos, k); this.look.lerp(this.focus.look, k);
      this.first = false;
      this.camera.position.copy(this.pos);
      this.camera.lookAt(this.look);
      this.carryView(player, false, false); // p2 B
      return;
    }
    const onFoot = carrying || player.mode === 'carry' || player.mode === 'walk';
    const footLook = this.mode === 'third' && onFoot;
    if (footLook && !this.footLook) { this.viewYaw = player.heading; this.viewPitch = 0; this.forwardYaw = player.heading; } // stepping out: look where the body faces
    this.footLook = footLook;
    if (this.locked && !this.wantsLock) { try { document.exitPointerLock(); } catch (_) { /* nothing to release */ } }
    this.lastHeading = player.heading;
    if (this.mode === 'first') { const r = this.updateFirst(dt, player); this.carryView(player, true, carrying || player.mode === 'carry'); return r; } // p2 B
    this.carryView(player, false, false); // p2 B
    let yaw, pitch;
    const carry = carrying || player.mode === 'carry';
    if (footLook) {
      // the camera sits behind the walker, who faces the look; the mouse's tilt swings the camera up or down
      if (this.first) { this.viewYaw = player.heading; this.viewPitch = 0; }
      this.userYaw = 0; this.userPitch = 0;
      this.forwardYaw = this.viewYaw;
      yaw = player.heading + Math.PI;
      // polish A: under the canoe the chase sits lower (CARRY_PITCH), so the hull overhead is seen nearly edge-on with
      // his body and legs under its gunwales, as a portager looks from behind; from the usual tilt its stern hid him
      pitch = clamp((carry ? CARRY_PITCH : this.pitch) - this.viewPitch * 0.6, -0.1, 1.1);
    } else {
      // behind the canoe: a drag orbits, and the view eases back behind the hull once the drag is over
      this.userYaw = wrap(this.userYaw);
      if (performance.now() - this.lastInput > 2500 && Math.abs(player.speed) > 0.3) {
        const k = 1 - Math.exp(-dt * 0.8);
        this.userYaw -= this.userYaw * k; this.userPitch -= this.userPitch * k;
      }
      yaw = player.heading + Math.PI + this.userYaw;
      this.forwardYaw = player.heading + this.userYaw;
      pitch = this.pitch + this.userPitch;
    }
    const dist = this.distance * (onFoot ? 0.8 : 1);
    const tx = player.x, tz = player.z;
    const ty = (onFoot ? player.altitude + 1.6 : this.world.levelAt(tx, tz) + 0.6);
    // fb2 E: looking down on foot the view moves over his right shoulder (the camera and the look point together, up to
    // SHOULDER m), so what is pointed at by his feet shows beside his head on the screen, not under it (stream A's
    // crosshair: a branch at his feet, the fire ring); level, it is straight behind him as before
    const down = footLook ? smoothstep(0, 1, -this.viewPitch) : 0, shx = -player.forward.z * SHOULDER * down, shz = player.forward.x * SHOULDER * down;
    const px = tx + shx + Math.cos(yaw) * Math.cos(pitch) * dist, pz = tz + shz - Math.sin(yaw) * Math.cos(pitch) * dist;
    let py = ty + Math.sin(pitch) * dist;
    // never below the ground or the water, anywhere along the line from the paddler to the camera: on a slope
    // the hill behind you lifts the camera instead of swallowing it
    const tiles = this.world.tiles;
    for (let s = 0.2; s <= 1.001; s += 0.2) {
      const sx = tx + (px - tx) * s, sz = tz + (pz - tz) * s;
      const h = tiles ? tiles.groundAt(sx, sz) : this.world.heightAt(sx, sz); // the drawn ground (tiles.js)
      const ground = Math.max(h, this.world.levelAt(sx, sz)) + 1.5;
      const need = ty + (ground - ty) / s;
      if (py < need) py = need;
    }
    // the time-lapse (pace.js): the camera is carried by the share of the move beyond life, so it trails the canoe or
    // the walker by what it would at life pace, not eight times as far
    const lapse = Math.max(1, player.boost || 1), last = this.lastTarget;
    if (last && !this.first && lapse > 1) {
      const dx = tx - last.x, dz = tz - last.z;
      if (dx * dx + dz * dz < 2500) { const s = 1 - 1 / lapse; this.pos.x += dx * s; this.pos.z += dz * s; this.look.x += dx * s; this.look.z += dz * s; }
    }
    this.lastTarget = { x: tx, z: tz };
    const k = this.first ? 1 : 1 - Math.exp(-dt * (footLook ? 12 : 5));
    this.pos.lerp(new THREE.Vector3(px, py, pz), k);
    // the point looked at: 2 m ahead of him at about head height; on foot, as the view tilts down it slides in and down
    // to the ground a stride ahead (fb2 E, for stream A's crosshair: looking all the way down, the middle of the screen is
    // on the ground 1.2 m in front of him, where a branch at his feet can be pointed at, as over-the-shoulder games look
    // down at the hands)
    let ahead = 2, ly = ty + (carry ? -0.3 : 0.4); // (polish A: on the carry the look is at his chest, under the hull, not at the hull)
    if (footLook) {
      const s = clamp(-this.viewPitch / 1.0, 0, 1);
      if (s > 0) {
        ahead = 2 - 0.8 * s;
        const gx = tx + shx + player.forward.x * ahead, gz = tz + shz + player.forward.z * ahead;
        const gy = (player.footGround ? player.footGround(gx, gz) : tiles ? tiles.groundAt(gx, gz) : this.world.heightAt(gx, gz)) + 0.05; // a deck or a step underfoot too
        ly = ty + 0.4 + (gy - ty - 0.4) * s * s * (3 - 2 * s);
      }
    }
    this.look.lerp(new THREE.Vector3(tx + shx + player.forward.x * ahead, ly, tz + shz + player.forward.z * ahead), this.first ? 1 : 1 - Math.exp(-dt * (footLook ? 16 : 8)));
    const cam = this.pullIn(dt, tx, ty, tz);
    this.first = false;
    // fb2 E: pulled in, the camera keeps the bearing and tilt it has at full length (a spring arm: it slides toward the
    // walker along the line, the walker stays where he is on the screen and the mouse turns the view exactly as it does
    // out in the open); it had turned to look at the point ahead of him from wherever the pull left it, so close in the
    // view tipped down and swung with every move
    const dir = (this._dir || (this._dir = new THREE.Vector3())).subVectors(this.look, this.pos);
    this.camera.position.copy(cam);
    if (dir.lengthSq() > 1e-8) this.camera.lookAt(dir.add(cam)); else this.camera.lookAt(this.look);
    // the see-through's line: from the lens to the walker's chest, or the paddler's
    this.seeStrength = SEE_STRENGTH;
    SEE.uSeeA.value.copy(this.camera.position);
    SEE.uSeeB.value.set(tx, onFoot ? ty - 0.4 : ty + 0.2, tz);
  }

  // The camera along the line from the pivot to where the chase would put it, held short of anything solid (sightLine:
  // the ground, rocks, walls, a big trunk at the lens; fb2 E: the trees are seen through instead, SEE). The pull rides a
  // critically damped spring: in quickly (PULL.inW) but never past the thing itself (the spring works inside the margin),
  // and out only once the way has stayed clear PULL.hyst further out for PULL.hold seconds, then gently (PULL.outW), so
  // an edge grazing the line does not pump it in and out. this.pos stays the unobstructed chase. Close in, the near
  // plane comes in too.
  pullIn(dt, tx, ty, tz) {
    const out = this._cam || (this._cam = new THREE.Vector3());
    if (!this.occlusion) { this.pull = Infinity; this.pullV = 0; this.setNear(0.3); return out.copy(this.pos); }
    // indoors the chase keeps under the ceiling, sliding along it rather than coming in to the walker's head
    const P = this._base || (this._base = new THREE.Vector3());
    P.copy(this.pos);
    for (const L of storeLayouts()) if (L.inside && L.inside(tx, tz)) { P.y = Math.min(P.y, L.floorY + SIGHT.ceiling - 0.2); break; }
    const dx = P.x - tx, dy = P.y - ty, dz = P.z - tz, len = Math.hypot(dx, dy, dz);
    if (len < 0.6) { this.pull = len; this.pullV = 0; this.setNear(0.3); return out.copy(P); }
    const hit = (this.sight = sightLine(this.world, tx, ty, tz, P.x, P.y, P.z, this.sight || {}));
    let want = hit.hard < Infinity ? Math.max(PULL.min, hit.hard - PULL.margin) : len;
    // coming up to a store's door from outside the camera comes in on the spring (to PULL.door m at the threshold), so
    // stepping in does not throw it from out in the yard to inside the walls in a frame; leaving, it eases back out
    if (!hit.what || hit.what !== 'store') for (const Ly of storeLayouts()) {
      const dd = Ly.door ? Math.hypot(tx - Ly.door.x, tz - Ly.door.z) : Infinity;
      if (dd < PULL.doorReach) { want = Math.min(want, PULL.door + (len - PULL.door) * smoothstep(0.4, PULL.doorReach, dd)); break; }
    }
    // indoors two more lines either side of the camera (PULL.side m across at its end) feel for the walls ahead of it:
    // turning toward a wall or a corner it comes in on the spring before the middle line meets the wall and has to stop it
    if (hit.what === 'store') {
      const sx = -dz / len, sz = dx / len, h2 = Math.hypot(sx, sz) || 1, side = this._side || (this._side = {});
      for (const k of [-1, 1]) {
        const s2 = sightLine(this.world, tx, ty, tz, P.x + (sx / h2) * PULL.side * k, P.y, P.z + (sz / h2) * PULL.side * k, side);
        if (s2.hard < Infinity) want = Math.min(want, Math.max(PULL.min, s2.hard - PULL.margin));
      }
    }
    // the thing itself: never past it (a trunk at the lens is seen through meanwhile, SEE's lens, so the spring has it)
    const limit = hit.hard < Infinity && hit.what !== 'trunk' ? Math.max(PULL.min, hit.hard - 0.08) : len;
    let d = this.pull, v = this.pullV;
    if (this.first || !Number.isFinite(d)) { d = want; v = 0; this.pullHold = 0; }
    else {
      d = Math.min(d, len);
      const spring = (w, k) => { // critically damped toward k at rate w
        const x0 = d - k, b = v + w * x0, e = Math.exp(-w * dt);
        d = k + (x0 + b * dt) * e; v = (v - w * b * dt) * e;
      };
      if (want < d - 0.005) { this.pullHold = 0; spring(PULL.inW, want); }
      else if (want > d + PULL.hyst || (want >= len && d < len)) {
        this.pullHold += dt;
        if (this.pullHold > PULL.hold) spring(PULL.outW, want); else v = 0;
      } else { this.pullHold = 0; v = 0; }
    }
    if (d > limit) { d = limit; v = Math.min(0, v); } // (a wall met all at once: there at once)
    d = Math.max(PULL.min * 0.5, Math.min(d, len));
    this.pull = d; this.pullV = v;
    this.setNear(d < 1.8 ? Math.max(0.06, 0.3 * d / 1.8) : 0.3);
    return out.set(tx + (dx / len) * d, ty + (dy / len) * d, tz + (dz / len) * d);
  }

  setNear(n) {
    if (Math.abs(this.camera.near - n) < 0.01) return;
    this.camera.near = n; this.camera.updateProjectionMatrix();
  }

  // From the paddler's eyes. The look is the mouse's, at once, and fixed in the world: on foot and swimming
  // the body faces it (player.js reads forwardYaw); seated, the hull turns under it, and with steering by
  // the look the bow comes round to where you are looking. Entering the view (or a snap) looks straight ahead.
  // The eye is the rig's (canoe.js eye): just ahead of the face in the direction of the look, carried with
  // the body exactly (no lag behind a moving body), so no angle looks into the body.
  updateFirst(dt, player) {
    const fresh = this.first;
    if (this.first) { this.viewYaw = player.heading; this.viewPitch = 0; }
    this.viewYaw = wrap(this.viewYaw);
    this.lookYaw = wrap(this.viewYaw - player.heading);
    this.userYaw = this.lookYaw;
    const yaw = this.viewYaw;
    this.forwardYaw = yaw;
    const pitch = this.viewPitch;
    player.canoe.eye(this.head, wrap(yaw - player.heading), pitch, dt, fresh); // a snap or a new view starts the eye afresh
    this.pos.copy(this.head);
    this.look.set(this.pos.x + Math.cos(yaw) * Math.cos(pitch), this.pos.y + Math.sin(pitch), this.pos.z - Math.sin(yaw) * Math.cos(pitch));
    this.first = false;
    this.camera.position.copy(this.pos);
    this.camera.lookAt(this.look);
  }
}
