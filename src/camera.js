import * as THREE from 'three';
import { clamp } from './rng.js';
import { storeLayouts } from './props.js';

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
//   soft  the crowns, which the trunks stand for: a cone of boughs from a metre up to about 50 trunk radii, as wide
//         at the bottom as about 5.5 radii; the camera sinks in a little, but is not pulled all the way to the walker
// The things come from tiles.treesNear (trunks, rocks with their RockShape, the tiles' obstacles and the camp's tents);
// logs ({ log, ax, az, bx, bz, r, top }) are read too where the walker's collision gives them.
const SIGHT = { margin: 0.12, step: 0.18, crownFrom: 1.0, crownTop: 50, crownR: 5.5, crownMin: 0.8, crownMax: 2.8, wall: 4.0, shelf: 1.5, post: 2.5, ceiling: 2.55 };
// the pull: min, the closest the camera comes (m); margin, how far it stays off what it meets; softFoot / softCanoe, the
// closest a crown alone pulls it; out, the rate (1/s) it eases back out once clear
const PULL = { min: 0.45, margin: 0.28, softFoot: 2.6, softCanoe: 4.5, out: 2.2 };
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
export function sightLine(world, ax, ay, az, bx, by, bz, out = {}) {
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
    let t = Math.min(exit(pa, da, Ly.size.iW - m), exit(pb, db, Ly.size.iD - m));
    if (S.dy > 1e-6) t = Math.min(t, (Ly.floorY + SIGHT.ceiling - ay) / S.dy);
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
    if (o.log) {
      // a log: a capsule along the ground from (ax, az) to (bx, bz), up to its top
      const lx = o.bx - o.ax, lz = o.bz - o.az, l2 = lx * lx + lz * lz || 1e-9, top = o.top ?? ground(o.ax, o.az) + 2 * o.r;
      for (let i = 0; i <= steps; i++) {
        const t = i / steps; if (t >= hard) break;
        const [x, y, z] = at(t); if (y > top) continue;
        const u = Math.min(1, Math.max(0, ((x - o.ax) * lx + (z - o.az) * lz) / l2));
        if (Math.hypot(x - o.ax - lx * u, z - o.az - lz * u) < o.r + SIGHT.margin) { hard = t; out.what = 'log'; break; }
      }
      continue;
    }
    // a box: up to its top; one without (a wall) about 4 m, or indoors (the shelves, the counter: the walls are the
    // interior's box above) a shelf's height
    if (o.box) { const t = boxT(S, o, o.top !== undefined ? o.top : indoors ? floorY + SIGHT.shelf : ground(o.x, o.z) + SIGHT.wall); if (t < hard) { hard = t; out.what = 'box'; } continue; }
    if (o.rock && o.shape) {
      // a rock: inside where the point is under its top; only the samples over its footprint are asked
      const sh = o.shape;
      for (let i = 0; i <= steps; i++) {
        const t = i / steps; if (t >= hard) break;
        const [x, y, z] = at(t);
        if (y > sh.maxY + 0.1 || x < sh.minX - 0.1 || x > sh.maxX + 0.1 || z < sh.minZ - 0.1 || z > sh.maxZ + 0.1) continue;
        if (y < sh.heightAt(x, z) + SIGHT.margin) { hard = t; out.what = 'rock'; break; }
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
      if (t < hard && ay + S.dy * t < top) { hard = t; out.what = 'post'; }
      continue;
    }
    const g = ground(o.x, o.z);
    // a trunk: hard at its radius
    const t = circleT(S, o.x, o.z, o.r + SIGHT.margin);
    if (t < hard) { hard = t; out.what = 'trunk'; }
    if (indoors) continue;
    // and its crown: a cone of boughs, soft; one the pivot stands in is the walker's own shade, not in the way
    const y0 = g + SIGHT.crownFrom, y1 = g + Math.max(6, SIGHT.crownTop * o.r), R0 = Math.min(SIGHT.crownMax, Math.max(SIGHT.crownMin, SIGHT.crownR * o.r));
    const coneR = (y) => (y < y0 || y > y1 ? -1 : R0 * (y1 - y) / (y1 - y0));
    if (Math.hypot(ax - o.x, az - o.z) < coneR(ay)) continue;
    if (circleT(S, o.x, o.z, R0) === Infinity) continue;
    for (let i = 1; i <= steps; i++) {
      const tt = i / steps; if (tt >= soft || tt >= hard) break;
      const [x, y, z] = at(tt), r = coneR(y);
      if (r > 0 && Math.hypot(x - o.x, z - o.z) < r) { soft = tt; break; }
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
    this.pull = Infinity;     // the distance the pull allows now (m), eased back out
    this.sight = null;        // the last sightLine: { hard, soft } metres along the line from the pivot
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

  update(dt, player, carrying) {
    if (this.focus) {
      const k = this.first ? 1 : 1 - Math.exp(-dt * 4);
      this.pos.lerp(this.focus.pos, k); this.look.lerp(this.focus.look, k);
      this.first = false;
      this.camera.position.copy(this.pos);
      this.camera.lookAt(this.look);
      return;
    }
    const onFoot = carrying || player.mode === 'carry' || player.mode === 'walk';
    const footLook = this.mode === 'third' && onFoot;
    if (footLook && !this.footLook) { this.viewYaw = player.heading; this.viewPitch = 0; this.forwardYaw = player.heading; } // stepping out: look where the body faces
    this.footLook = footLook;
    if (this.locked && !this.wantsLock) { try { document.exitPointerLock(); } catch (_) { /* nothing to release */ } }
    this.lastHeading = player.heading;
    if (this.mode === 'first') return this.updateFirst(dt, player);
    let yaw, pitch;
    if (footLook) {
      // the camera sits behind the walker, who faces the look; the mouse's tilt swings the camera up or down
      if (this.first) { this.viewYaw = player.heading; this.viewPitch = 0; }
      this.userYaw = 0; this.userPitch = 0;
      this.forwardYaw = this.viewYaw;
      yaw = player.heading + Math.PI;
      pitch = clamp(this.pitch - this.viewPitch * 0.6, -0.1, 1.1);
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
    const px = tx + Math.cos(yaw) * Math.cos(pitch) * dist, pz = tz - Math.sin(yaw) * Math.cos(pitch) * dist;
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
    // the time-lapse (pace.js) and the game speed: the camera is carried by the share of the move beyond life, so it
    // trails the canoe or the walker by what it would at life pace, not six (or twenty-four) times as far at Trip pace
    const lapse = Math.max(1, (player.boost || 1) * (player.timeScale || 1)), last = this.lastTarget;
    if (last && !this.first && lapse > 1) {
      const dx = tx - last.x, dz = tz - last.z;
      if (dx * dx + dz * dz < 2500) { const s = 1 - 1 / lapse; this.pos.x += dx * s; this.pos.z += dz * s; this.look.x += dx * s; this.look.z += dz * s; }
    }
    this.lastTarget = { x: tx, z: tz };
    const k = this.first ? 1 : 1 - Math.exp(-dt * (footLook ? 12 : 5));
    this.pos.lerp(new THREE.Vector3(px, py, pz), k);
    this.look.lerp(new THREE.Vector3(tx + player.forward.x * 2, ty + 0.4, tz + player.forward.z * 2), this.first ? 1 : 1 - Math.exp(-dt * (footLook ? 16 : 8)));
    const cam = this.pullIn(dt, tx, ty, tz, onFoot);
    this.first = false;
    this.camera.position.copy(cam);
    this.camera.lookAt(this.look);
  }

  // Minecraft's camera: along the line from the pivot to where the chase would put it, in at once ahead of anything
  // solid (sightLine), and back out gently once the way is clear. Crowns pull it in only part of the way. this.pos
  // stays the unobstructed chase, so the pull is all there is to undo. Close in, the near plane comes in too.
  pullIn(dt, tx, ty, tz, onFoot) {
    const out = this._cam || (this._cam = new THREE.Vector3());
    if (!this.occlusion) { this.pull = Infinity; this.setNear(0.3); return out.copy(this.pos); }
    // indoors the chase keeps under the ceiling, sliding along it rather than coming in to the walker's head
    const P = this._base || (this._base = new THREE.Vector3());
    P.copy(this.pos);
    for (const L of storeLayouts()) if (L.inside && L.inside(tx, tz)) { P.y = Math.min(P.y, L.floorY + SIGHT.ceiling - 0.2); break; }
    const dx = P.x - tx, dy = P.y - ty, dz = P.z - tz, len = Math.hypot(dx, dy, dz);
    if (len < 0.6) { this.pull = len; this.setNear(0.3); return out.copy(P); }
    const hit = (this.sight = sightLine(this.world, tx, ty, tz, P.x, P.y, P.z, this.sight || {}));
    let allow = len;
    if (hit.hard < Infinity) allow = Math.min(allow, Math.max(PULL.min, hit.hard - PULL.margin));
    if (hit.soft < Infinity) allow = Math.min(allow, Math.max(Math.min(len, onFoot ? PULL.softFoot : PULL.softCanoe), hit.soft - PULL.margin));
    if (this.first || !Number.isFinite(this.pull) || allow <= this.pull) this.pull = allow;
    else this.pull = Math.min(allow, this.pull + (allow - this.pull) * (1 - Math.exp(-dt * PULL.out)) + dt * 0.4);
    const d = Math.min(len, this.pull);
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
