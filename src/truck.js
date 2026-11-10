// The truck on the roads (stream E3, docs/build/edge-and-roads.md "The truck"). One pickup with a canoe on its rack, a
// merged mesh of the props' own material (no new shader program; one draw call, and its shadow, while it is in view),
// driven along the roads' routes (roads.js routeOf: each start's way out, from the lot or the yard to where its road
// is cut off in the trees):
//   leave(ep)        a ride has left you at a trailhead's lot or an outfitter's door: the truck stands in the lot (or
//                    behind the store) as the fade lifts, then pulls out down the road and is gone round the bend
//   come(ep) → Promise   a pickup: the truck comes up the road into the lot and stops; resolves once it has (or at
//                    once when there is no road, or you are not there to see it)
//   park(ep)         stands at an outfitter's, behind the store (the one you were picked up by, the one you are at)
// With nothing to do, it stands behind the nearest store you are at (within PARK_NEAR m), else it is put away.
// `?roads=off` (no roads): never drawn. window.__game.truck in the rigs.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PropBuilder, propMaterial, TILE, buildHull } from './prop-kit.js';
import { routeOf, deckAt } from './roads.js';
import { trailheadLayout, LOT_R } from './trailhead.js';
import { yardOf } from './props.js';
import { isOutfitter, OUTFITTER_EPS } from './outfitters.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const C = (hex) => new THREE.Color(hex);
export const TRUCK = { speed: 9, accel: 1.6, wheelbase: 3.35, track: 1.86, axles: [1.72, -1.63], squash: 0.1, wait: 2.5, come: 80, see: 260, parkNear: 320, comeMax: 12, maxSnap: 320 };
// (round 5: track the tyres' own middles, 0.93 m either side; axles where the wheels are built, along the body)

// the pickup, in its own frame: +z forward, y up from the ground under its wheels
function truckGeometry() {
  const b = new PropBuilder(), X = V(1, 0, 0), Y = V(0, 1, 0), Z = V(0, 0, 1);
  const paint = C(0x7d3328), dark = C(0x2a2826), chrome = C(0x8b8d8e), tyre = C(0x161616), glass = C(0x26302f);
  b.box(V(0, 0.72, -0.05), X, Y, Z, 0.97, 0.22, 2.62, TILE.PAINT, paint);            // the body's lower half
  b.box(V(0, 1.12, 1.95), X, Y, Z, 0.95, 0.2, 0.68, TILE.PAINT, paint);               // the hood
  b.box(V(0, 1.38, 0.55), X, Y, Z, 0.95, 0.46, 0.78, TILE.PAINT, paint);              // the cab
  b.box(V(0, 1.5, 0.55), X, Y, Z, 0.955, 0.24, 0.7, TILE.GLASS, glass);               // its windows, round it
  for (const s of [-1, 1]) b.box(V(0.92 * s, 1.12, -1.45), X, Y, Z, 0.05, 0.2, 1.12, TILE.PAINT, paint); // the bed's sides
  b.box(V(0, 1.12, -2.6), X, Y, Z, 0.97, 0.2, 0.05, TILE.PAINT, paint);               // the tailgate
  b.box(V(0, 0.62, 2.68), X, Y, Z, 1.0, 0.1, 0.06, TILE.METAL, chrome);               // the bumpers
  b.box(V(0, 0.62, -2.7), X, Y, Z, 1.0, 0.1, 0.06, TILE.METAL, chrome);
  b.box(V(0, 1.06, 2.64), X, Y, Z, 0.7, 0.13, 0.02, TILE.METAL, dark);                // the grille
  for (const zw of [1.72, -1.63]) for (const s of [-1, 1]) {
    b.cyl(V(0.82 * s, 0.4, zw), V(1.04 * s, 0.4, zw), 0.4, 0.4, 12, TILE.PLAIN, tyre, { cap0: true, cap1: true, capTile: TILE.PLAIN, capCol: tyre });
    b.cyl(V(1.035 * s, 0.4, zw), V(1.045 * s, 0.4, zw), 0.22, 0.22, 10, TILE.METAL, chrome, { cap1: s > 0, cap0: s < 0, capTile: TILE.METAL, capCol: chrome });
  }
  // the rack: a bar over the cab, a bar on posts at the tailgate, the canoe upside down along them
  b.box(V(0, 1.9, 0.55), X, Y, Z, 0.95, 0.03, 0.04, TILE.METAL, dark);
  for (const s of [-1, 1]) b.box(V(0.9 * s, 1.55, -2.45), X, Y, Z, 0.03, 0.36, 0.03, TILE.METAL, dark);
  b.box(V(0, 1.92, -2.45), X, Y, Z, 0.95, 0.03, 0.04, TILE.METAL, dark);
  const g = b.build();
  const h = new PropBuilder(), shell = C(0x5b7a5a);
  buildHull(h, shell, shell.clone().offsetHSL(0, -0.05, 0.06), C(0x8a6a48), C(0xb59a6a));
  const hull = h.build();
  // the hull is built along x, gunwales up: turned over and along the truck, its gunwales on the bars
  hull.applyMatrix4(new THREE.Matrix4().makeRotationY(Math.PI / 2).multiply(new THREE.Matrix4().makeRotationX(Math.PI)));
  hull.translate(0, 1.95 + 0.43, -0.9);
  const out = mergeGeometries([g, hull]);
  out.computeBoundingSphere();
  // (the rack's canoe is the tail of the draw: drawn only while the truck has none of yours to bring or has just left
  // yours in the lot, where it lies: setRack)
  out.userData.bare = g.index ? g.index.count : g.attributes.position.count;
  return out;
}

// a path's samples: cumulative lengths for pose-at-s
function pathOf(pts) {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  return { pts, cum, len: cum[cum.length - 1] };
}
function at(path, s) {
  const { pts, cum } = path, n = pts.length;
  if (s <= 0) return [pts[0][0], pts[0][1]];
  if (s >= path.len) return [pts[n - 1][0], pts[n - 1][1]];
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cum[m] <= s) lo = m; else hi = m; }
  const t = (s - cum[lo]) / Math.max(1e-6, cum[hi] - cum[lo]);
  return [pts[lo][0] + (pts[hi][0] - pts[lo][0]) * t, pts[lo][1] + (pts[hi][1] - pts[lo][1]) * t];
}
// corners rounded (a fillet up to r m along each leg), as a truck turns
function smooth(pts, r = 6) {
  if (pts.length < 3) return pts;
  const out = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) {
    const [ax, az] = pts[i - 1], [bx, bz] = pts[i], [cx, cz] = pts[i + 1];
    const l1 = Math.hypot(bx - ax, bz - az), l2 = Math.hypot(cx - bx, cz - bz), rr = Math.min(r, l1 / 2.2, l2 / 2.2);
    if (!(rr > 0.2)) { out.push(pts[i]); continue; }
    const p0 = [bx + ((ax - bx) / l1) * rr, bz + ((az - bz) / l1) * rr], p2 = [bx + ((cx - bx) / l2) * rr, bz + ((cz - bz) / l2) * rr];
    for (let k = 0; k <= 4; k++) { const t = k / 4, u = 1 - t; out.push([u * u * p0[0] + 2 * u * t * bx + t * t * p2[0], u * u * p0[1] + 2 * u * t * bz + t * t * p2[1]]); }
  }
  out.push(pts[pts.length - 1]);
  return out;
}

export class Truck {
  // { world, scene, groundAt (x, z) → y, player }
  constructor({ world, scene, groundAt, player = null }) {
    this.world = world; this.scene = scene; this.groundAt = groundAt; this.player = player;
    this.mesh = null; this.job = null; this.parkedAt = null;
    this.drawn = 0; // frames drawn (the rigs)
  }
  ensure() {
    if (this.mesh) return this.mesh;
    const m = new THREE.Mesh(truckGeometry(), propMaterial());
    m.name = 'truck'; m.castShadow = true; m.receiveShadow = true; m.visible = false; m.matrixAutoUpdate = false;
    m.onAfterRender = () => { this.drawn++; };
    this.scene.add(m);
    return (this.mesh = m);
  }
  // where the truck stands at a start (an entry point, or 'h<ep>'): { x, z, heading, path (from there out the road) } or
  // null (no road)
  // (round 4: every start's road is drawn to it, a made two-track over dry ground where it is off its road, so the truck
  // drives to them all; a route the table marks drive 0 is park only. A store's route begins at the truck's stand behind
  // it: stand)
  spot(key, drive = false) {
    const R = routeOf(this.world, key);
    if (!R || R.pts.length < 2) return null;
    if (drive && (R.drive === false || (R.drive == null && R.snap > TRUCK.maxSnap))) return null;
    const ep = Number(String(key).replace(/^h/, ''));
    let P = null;
    if (R.stand) P = R.pts[0];
    else if (isOutfitter(ep) && !String(key).startsWith('h')) {
      const Y = yardOf(ep);
      if (Y) { const back = Math.min(...Y.rects.map((r) => r[2])) - 4.5; P = [Y.x + Y.bx * back, Y.z + Y.bz * back]; }
    }
    // (round 4: in a lot, clear of its sign, its permit box and the portage's sign at the trail's road end, the lot's
    // middle: the way out of the lot is the nearest of the road's points the truck can reach without passing them)
    const L = !R.stand ? trailheadLayout(ep) : null, inLot = !!(L && L.lot && !(isOutfitter(ep) && !String(key).startsWith('h')));
    if (inLot) P = [L.lot.x, L.lot.z];
    const keep = inLot ? [L.sign, L.box].filter(Boolean).map((q) => [q.x, q.z]) : [];
    const clearOf = (a, b) => keep.every(([x, z]) => { const ex = b[0] - a[0], ez = b[1] - a[1], L2 = ex * ex + ez * ez, t = L2 ? Math.max(0, Math.min(1, ((x - a[0]) * ex + (z - a[1]) * ez) / L2)) : 0; return Math.hypot(x - a[0] - ex * t, z - a[1] - ez * t) > 2.4; });
    // out along the road from the nearest of its points to the spot (never back through the lot or the yard)
    let j = 0;
    if (P) {
      let bd = Infinity;
      for (let i = 0; i < R.pts.length; i++) { const d = Math.hypot(R.pts[i][0] - P[0], R.pts[i][1] - P[1]); if (d < bd && (d > 60 || clearOf(P, R.pts[i]))) { bd = d; j = i; } }
    }
    const way = R.pts.slice(j);
    if (P && Math.hypot(way[0][0] - P[0], way[0][1] - P[1]) > 1) way.unshift(P);
    if (!P) P = way[0];
    // stand a few metres into the way, facing out (in a lot: inside its ring, its tail past the lot's middle)
    const path = pathOf(smooth(way));
    const s0 = Math.min(path.len * 0.5, inLot ? LOT_R - 1.5 : P === way[0] ? 1 : 3);
    const [x, z] = at(path, s0), [x1, z1] = at(path, s0 + 2);
    return { x, z, heading: Math.atan2(x1 - x, z1 - z), path, s0 };
  }
  // the pose at s along a path, its wheels on the ground (round 5, the owner: "The trucks float in the air"): each of the
  // four wheels read on the ground as drawn under its own tyre (tiles.groundAt, or a bridge's deck: deckAt), the body
  // pitched by the axles' heights and rolled by the sides', set on the plane through them; where the four are not on one
  // plane (a twist), raised only once a tyre would be pressed in past SQUASH (a tyre a little into the ground reads as its weight on it; one off it as a float), so two float and two press in by the twist alike (this.gap: the
  // worst wheel's gap, the rigs)
  pose(path, s) {
    const m = this.ensure(), half = TRUCK.wheelbase / 2, A = TRUCK.axles;
    const [fx, fz] = at(path, s + half), [bx, bz] = at(path, s - half);
    let dx = fx - bx, dz = fz - bz; const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L;
    const cx = (fx + bx) / 2, cz = (fz + bz) / 2, rx = dz, rz = -dx, w = TRUCK.track / 2;
    const G = (x, z) => { const g = this.groundAt(x, z), d = deckAt(this.world, x, z); return Number.isFinite(g) ? Math.max(g, d) : d; };
    const W = this.wheels || (this.wheels = new Float64Array(4));
    const o = (A[0] + A[1]) / 2; // (the axles' middle, along the body)
    let k = 0;
    for (const a of A) for (const sd of [-1, 1]) W[k++] = G(cx + dx * (a - o) + rx * w * sd, cz + dz * (a - o) + rz * w * sd);
    // (W: front left, front right, back left, back right)
    const ok = W.every((v) => Number.isFinite(v)), fin = Array.from(W).filter((v) => Number.isFinite(v));
    const mean = ok ? (W[0] + W[1] + W[2] + W[3]) / 4 : fin.length ? Math.max(...fin) : (this.lastY ?? 0); // (no ground under it yet: the last)
    const pitch = ok ? ((W[0] + W[1]) - (W[2] + W[3])) / 2 / (A[0] - A[1]) : 0, roll = ok ? ((W[1] + W[3]) - (W[0] + W[2])) / 2 / TRUCK.track : 0;
    const twist = ok ? Math.abs(W[0] - W[1] - W[2] + W[3]) / 4 : 0;
    const lift = Math.max(0, twist - TRUCK.squash);
    const fwd = V(dx, pitch, dz).normalize(), right = V(rx, roll, rz).normalize();
    const up = fwd.clone().cross(right).normalize(); // (forward × right is up: right here is +x of a truck facing +z)
    const Xa = up.clone().cross(fwd).normalize();
    // the body's origin sits o m behind the axles' middle, on the plane: y there, then down by the tyre's own sink
    const y = mean - pitch * o + lift - 0.015;
    m.matrix.makeBasis(Xa, up, fwd).setPosition(cx - dx * o, y, cz - dz * o);
    m.matrixWorldNeedsUpdate = true;
    m.visible = true;
    this.x = cx; this.z = cz;
    this.gap = ok ? twist + lift : NaN; // (the most a tyre stands off its ground; the most one is pressed in: SQUASH)
    this.lastY = mean;
    this.wheelY = ok ? Array.from(W) : null;
  }
  hide() { if (this.mesh) this.mesh.visible = false; this.job = null; this.parkedAt = null; }
  // the canoe on the rack: a parked truck behind a store has one of its own; one that has just left yours (in the lot,
  // at the dock) or comes to fetch you and yours drives with the rack bare (playtest r4-final: "the canoe off the
  // roof" while one still rode on it)
  setRack(on) { const m = this.ensure(); m.geometry.setDrawRange(0, on ? Infinity : m.geometry.userData.bare); this.rack = !!on; }
  park(key) {
    const S = this.spot(key);
    if (!S) return false;
    this.job = { kind: 'park', key: String(key), path: S.path, s: S.s0, v: 0 };
    this.parkedAt = String(key);
    this.setRack(true);
    this.pose(S.path, S.s0);
    return true;
  }
  leave(key) {
    const S = this.spot(key, true);
    if (!S) return false;
    this.job = { kind: 'leave', key: String(key), path: S.path, s: S.s0, v: 0, wait: TRUCK.wait };
    this.parkedAt = null; this.gone = String(key);
    this.setRack(false);
    this.pose(S.path, S.s0);
    return true;
  }
  come(key) {
    const S = this.spot(key, true), p = this.player;
    if (!S || (p && Math.hypot(p.x - S.x, p.z - S.z) > TRUCK.see)) return Promise.resolve(false);
    return new Promise((done) => {
      const from = Math.min(S.path.len, S.s0 + TRUCK.come);
      this.job = { kind: 'come', key: String(key), path: S.path, s: from, v: TRUCK.speed * 0.8, stop: S.s0, done, t: 0 };
      this.parkedAt = null;
      this.setRack(false);
      this.pose(S.path, from);
    });
  }
  update(dt) {
    const J = this.job, p = this.player;
    if (!J) return this.idle();
    if (J.kind === 'park') { if (p && Math.hypot(p.x - this.x, p.z - this.z) > TRUCK.parkNear * 2) this.hide(); return; }
    if (J.kind === 'leave') {
      if (J.wait > 0) { J.wait -= dt; return; }
      J.v = Math.min(TRUCK.speed, J.v + TRUCK.accel * dt);
      J.s += J.v * dt;
      if (J.s >= J.path.len - TRUCK.wheelbase || (p && Math.hypot(p.x - this.x, p.z - this.z) > TRUCK.see * 2)) { this.hide(); return; }
      this.pose(J.path, J.s);
      return;
    }
    if (J.kind === 'come') {
      J.t += dt;
      const left = J.s - J.stop;
      J.v = Math.max(0.6, Math.min(TRUCK.speed, Math.sqrt(2 * 1.2 * Math.max(0, left))));
      J.s = Math.max(J.stop, J.s - J.v * dt);
      this.pose(J.path, J.s);
      if (J.s <= J.stop + 0.05 || J.t > TRUCK.comeMax) {
        this.pose(J.path, J.stop);
        this.job = { kind: 'park', key: J.key, path: J.path, s: J.stop, v: 0 };
        this.parkedAt = J.key; // (the rack stays bare: it has come for yours)
        J.done(true);
      }
    }
  }
  // nothing to do: behind the store you are at, else away
  idle() {
    const p = this.player;
    if (!p || !this.world.roads) return;
    if ((this.idleT = (this.idleT || 0) + 1) % 30) return; // (twice a second is plenty)
    for (const ep of OUTFITTER_EPS) {
      const Y = yardOf(ep);
      if (!Y) continue;
      const d = Math.hypot(Y.x - p.x, Y.z - p.z);
      if (this.gone === String(ep)) { if (d > TRUCK.parkNear * 2) this.gone = null; continue; } // (the one that just drove off stays gone)
      if (d < TRUCK.parkNear && this.park(ep)) return;
    }
  }
}
