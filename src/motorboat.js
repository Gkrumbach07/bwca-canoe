// The motorboat actor (stream m, campaign Round 4; 90-game-needs §6: "A motorboat actor that can trail, idle, anchor
// and stop at a line: Sheila's squad boat, Jon's grey guide boat, the rented boat, Gord's Thursday boat, Brekke's
// launch"; 33-family §6.7 and §11 for the trailing; 31 GY-11 for the squad boat; 30 §4.6 for the launch). Only under
// STORY_ON (main.js m: block).
//
// A drawn boat (prop-kit faces in the props' one material: no new program) with a driver (an actors.js person sat at the
// tiller or the wheel), on the water's level and its waves, a wake, and the motor's drone (its only sound). It moves at
// seen speeds (m/s as the player sees them, like the canoe's 12.5), never through land: a step that would ground turns
// it along the shore, and water too thin for its leg stops it at the mouth.
//
//   motorboat.attach({ scene, world, water, wind, player, actors, day, ripples, audio, camera })
//   motorboat.spawn({ lake, path, driver, kind, at, heading, speed, force, home }) → mb | { why }
//     kind   'squad' | 'guide' | 'rented' | 'launch' | 'tow'      driver: a look, { look, name }, or false (none)
//     lake   a lake id or name (the motor check); force: true skips it      at: { x, z } (else path[0])
//   mb.run(path, { speed, onEnd }) · mb.goTo(x, z, opts) · mb.idle() · mb.anchor() · mb.stopAt(line) · mb.clearLines()
//   mb.trail(target, { near, far, lose, home }) · mb.remove() · mb.on(evt, fn): 'arrived' 'lost' 'stopped' 'home'
//   mb.x, z, heading, v, mode ('idle' | 'run' | 'anchor' | 'trail' | 'lee' | 'stopped' | 'home' | 'lost'), lost
//   motorboat.allowed(lake) → bool · motorboat.list() · motorboat.update(dt) · motorboat.stats()
import * as THREE from 'three';
import { PropBuilder, propMaterial, TILE } from './prop-kit.js';
import { tripperLook } from './actors.js';
import { setPos } from './audio-kit.js';

// The motor routes of the wilderness (the BWCAW motor-use lakes) and the big water outside it: a boat is drawn only on
// these unless forced. By name (the release's lake names).
export const MOTOR_LAKES = new Set([
  'Moose Lake', 'Newfound Lake', 'Sucker Lake', 'Basswood Lake', 'Fall Lake', 'Newton Lake', 'Saganaga Lake', 'Sea Gull Lake',
  'Clearwater Lake', 'East Bearskin Lake', 'Trout Lake', 'Lac La Croix', 'Little Vermilion Lake', 'Loon Lake', 'Snowbank Lake',
  'Farm Lake', 'White Iron Lake', 'Garden Lake', 'Birch Lake (Babbitt)', 'Burntside Lake', 'Crane Lake', 'Sand Point Lake',
  'Namakan Lake', 'Kabetogama Lake', 'Rainy Lake', 'Shagawa Lake', 'Gunflint Lake', 'Poplar Lake', 'Seagull Lake',
]);
// the kinds: length (m), beam, sheer height, the hull's colours, motor (tiller | inboard | console), cruise seen (m/s)
export const KINDS = {
  squad: { L: 5.6, W: 1.9, H: 0.78, hull: 0xe8e6df, band: 0xa8322a, inside: 0x8f9396, motor: 'console', speed: 16, draft: 0.5 },
  guide: { L: 5.5, W: 1.75, H: 0.72, hull: 0x7d8186, band: 0xb3302b, inside: 0x6c7075, motor: 'tiller', speed: 15, draft: 0.45, bowStripe: true },
  rented: { L: 4.9, W: 1.6, H: 0.66, hull: 0xb9bcbf, band: 0x6f7a80, inside: 0x9a9da0, motor: 'tiller', speed: 13, draft: 0.4, aerial: true },
  launch: { L: 7.2, W: 2.0, H: 0.85, hull: 0x7a4a26, band: 0xe9dcc4, inside: 0xb0804e, motor: 'inboard', speed: 12, draft: 0.7, varnish: true },
  tow: { L: 7.8, W: 2.4, H: 0.7, hull: 0xa9adb0, band: 0x2f5a8a, inside: 0x8c9093, motor: 'console', speed: 14, draft: 0.6, racks: true },
};
const MOTOR = { tiller: 92, console: 70, inboard: 54 }; // Hz: the drone's fundamental at a cruise
const wrapPi = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const fwd = (h) => ({ x: Math.cos(h), z: -Math.sin(h) });
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const C = (hex) => new THREE.Color(hex);

// --- the drawn boat (its frame: +x the bow, +y up, +z starboard, the origin on the water line amidships) -------------
const GEO = {};
export function boatGeometry(kind) {
  if (GEO[kind]) return GEO[kind];
  const K = KINDS[kind] || KINDS.guide, b = new PropBuilder(), N = 14, hull = C(K.hull), band = C(K.band), ins = C(K.inside), dark = C(0x2a2c2e);
  const half = K.L / 2, stn = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N, x = -half + t * K.L;
    const w = (K.W / 2) * (t < 0.62 ? 1 - 0.06 * (1 - t / 0.62) : Math.pow(Math.max(0, 1 - (t - 0.62) / 0.38), 0.7)) + 0.02;
    const sheer = K.H * (0.62 + 0.38 * Math.pow(t, 2.2)) - K.draft * 0.25, keel = -K.draft * (t > 0.8 ? 1 - (t - 0.8) * 2.5 : 1);
    stn.push({ x, w, sheer, keel });
  }
  for (let i = 0; i < N; i++) {
    const a = stn[i], c = stn[i + 1];
    for (const s of [-1, 1]) {
      // the topsides (a band of colour under the gunwale), the bilge to the keel
      const bandY = (q) => q.sheer - 0.14;
      b.quad(V(a.x, a.sheer, s * a.w), V(c.x, c.sheer, s * c.w), V(c.x, bandY(c), s * c.w), V(a.x, bandY(a), s * a.w), K.varnish ? TILE.WOOD : TILE.PAINT, band, { ref: V(a.x, 0, 0) });
      b.quad(V(a.x, bandY(a), s * a.w), V(c.x, bandY(c), s * c.w), V(c.x, c.keel * 0.3, s * c.w * 0.82), V(a.x, a.keel * 0.3, s * a.w * 0.82), K.varnish ? TILE.WOOD : TILE.METAL, hull, { ref: V(a.x, 0, 0) });
      b.quad(V(a.x, a.keel * 0.3, s * a.w * 0.82), V(c.x, c.keel * 0.3, s * c.w * 0.82), V(c.x, c.keel, 0), V(a.x, a.keel, 0), TILE.METAL, hull, { ref: V(a.x, 0.5, 0) });
      // the inside, a shade darker, so it reads as an open boat from above
      b.quad(V(a.x, a.sheer - 0.02, s * (a.w - 0.03)), V(c.x, c.sheer - 0.02, s * (c.w - 0.03)), V(c.x, 0.05, s * c.w * 0.7), V(a.x, 0.05, s * a.w * 0.7), TILE.METAL, ins, { ref: V(a.x, K.H, 0) });
    }
    b.quad(V(a.x, 0.05, -a.w * 0.7), V(c.x, 0.05, -c.w * 0.7), V(c.x, 0.05, c.w * 0.7), V(a.x, 0.05, a.w * 0.7), K.varnish ? TILE.WOOD : TILE.METAL, ins, { ref: V(a.x, -1, 0) });
  }
  // the transom
  const s0 = stn[0];
  b.quad(V(s0.x, s0.sheer, -s0.w), V(s0.x, s0.sheer, s0.w), V(s0.x, s0.keel * 0.3, s0.w * 0.82), V(s0.x, s0.keel * 0.3, -s0.w * 0.82), TILE.PAINT, band, { ref: V(0, 0, 0) });
  // seats
  for (const t of [0.22, 0.5, 0.74]) { const st = stn[Math.round(t * N)]; b.box(V(st.x, st.sheer - 0.22, 0), V(1, 0, 0), V(0, 1, 0), V(0, 0, 1), 0.18, 0.03, st.w * 0.95, TILE.WOOD, C(K.varnish ? 0xc9955e : 0x8d8f91)); }
  // a red stripe at the bow (Jon's)
  if (K.bowStripe) { const a = stn[N - 3], c = stn[N - 2]; for (const s of [-1, 1]) b.quad(V(a.x, a.sheer + 0.005, s * (a.w + 0.012)), V(c.x, c.sheer + 0.005, s * (c.w + 0.012)), V(c.x, c.sheer - 0.25, s * (c.w + 0.012)), V(a.x, a.sheer - 0.25, s * (a.w + 0.012)), TILE.PAINT, C(0xc22a24), { ref: V(a.x, 0, 0) }); }
  // the motor: a tiller outboard on the transom, a console amidships with the outboard behind, or an inboard's engine box
  const ty = s0.sheer;
  if (K.motor === 'tiller' || K.motor === 'console') {
    b.box(V(s0.x - 0.18, ty + 0.18, 0), V(1, 0, 0), V(0, 1, 0), V(0, 0, 1), 0.24, 0.24, 0.2, TILE.PAINT, dark);
    b.cyl(V(s0.x - 0.2, ty - 0.05, 0), V(s0.x - 0.2, -K.draft - 0.35, 0), 0.06, 0.05, 6, TILE.METAL, dark);
    b.box(V(s0.x - 0.2, -K.draft - 0.38, 0), V(1, 0, 0), V(0, 1, 0), V(0, 0, 1), 0.16, 0.05, 0.06, TILE.METAL, dark);
    if (K.motor === 'tiller') b.cyl(V(s0.x - 0.1, ty + 0.14, 0), V(s0.x + 0.6, ty + 0.18, 0), 0.025, 0.025, 5, TILE.METAL, dark);
  }
  if (K.motor === 'console') {
    const st = stn[Math.round(0.45 * N)];
    b.box(V(st.x, 0.5, 0.25), V(1, 0, 0), V(0, 1, 0), V(0, 0, 1), 0.3, 0.45, 0.28, TILE.PAINT, C(K.hull));
    b.box(V(st.x + 0.12, 1.02, 0.25), V(0.6, 0.8, 0), V(-0.8, 0.6, 0), V(0, 0, 1), 0.02, 0.16, 0.26, TILE.GLASS, C(0x88a0a8));
    b.cyl(V(st.x - 0.18, 0.86, 0.25), V(st.x - 0.24, 0.9, 0.25), 0.12, 0.12, 8, TILE.METAL, dark);
  }
  if (K.motor === 'inboard') {
    const st = stn[Math.round(0.38 * N)];
    b.box(V(st.x, 0.3, 0), V(1, 0, 0), V(0, 1, 0), V(0, 0, 1), 0.45, 0.22, 0.4, TILE.WOOD, C(0x8a5a30));
    const sw = stn[Math.round(0.6 * N)];
    b.box(V(sw.x, sw.sheer + 0.2, 0), V(0.7, 0.7, 0), V(-0.7, 0.7, 0), V(0, 0, 1), 0.02, 0.2, sw.w * 0.85, TILE.GLASS, C(0x88a0a8));
    b.cyl(V(st.x - 0.5, 0.75, 0.3), V(st.x - 0.6, 0.8, 0.3), 0.14, 0.14, 8, TILE.WOOD, C(0x5a3a1e)); // the wheel
  }
  if (K.aerial) b.cyl(V(s0.x + 0.5, ty, -s0.w * 0.8), V(s0.x + 0.45, ty + 2.1, -s0.w * 0.8), 0.012, 0.006, 4, TILE.METAL, dark);
  if (K.racks) for (const t of [0.35, 0.65]) { const st = stn[Math.round(t * N)]; b.box(V(st.x, st.sheer + 0.35, 0), V(1, 0, 0), V(0, 1, 0), V(0, 0, 1), 0.04, 0.04, st.w + 0.15, TILE.METAL, dark); for (const s of [-1, 1]) b.cyl(V(st.x, st.sheer, s * st.w), V(st.x, st.sheer + 0.35, s * st.w), 0.025, 0.025, 4, TILE.METAL, dark); }
  return (GEO[kind] = b.build());
}
// where the driver sits, in the boat's frame: { x, top (the seat's top), heading off the bow }
function driverSeat(kind) {
  const K = KINDS[kind] || KINDS.guide, half = K.L / 2;
  if (K.motor === 'tiller') return { x: -half + 0.55, top: 0.36, turn: 0 };
  if (K.motor === 'console') return { x: -half + K.L * 0.36, top: 0.42, turn: 0, z: 0.25 };
  return { x: -half + K.L * 0.3, top: 0.4, turn: 0, z: 0.3 };
}

// the drone: an oscillator through a lowpass and a panner, its gain by distance and throttle (no ctx: nothing)
class Drone {
  constructor(au, kind) {
    this.au = au; const ctx = au.ctx; this.kind = kind;
    this.o = ctx.createOscillator(); this.o.type = 'sawtooth'; this.o.frequency.value = MOTOR[(KINDS[kind] || KINDS.guide).motor] || 80;
    this.o2 = ctx.createOscillator(); this.o2.type = 'square'; this.o2.frequency.value = this.o.frequency.value * 0.5;
    this.f = ctx.createBiquadFilter(); this.f.type = 'lowpass'; this.f.frequency.value = 700; this.f.Q.value = 0.8;
    this.g = ctx.createGain(); this.g.gain.value = 0;
    this.p = ctx.createPanner(); this.p.panningModel = 'equalpower'; this.p.distanceModel = 'inverse'; this.p.refDistance = 25; this.p.rolloffFactor = 1; this.p.maxDistance = 20000;
    this.o.connect(this.f); this.o2.connect(this.f); this.f.connect(this.g); this.g.connect(this.p); this.p.connect(au.dry || au.master);
    this.o.start(); this.o2.start();
  }
  set(x, y, z, throttle, on) {
    const au = this.au, t = au.ctx.currentTime;
    try { au.place(this.p, { x, y, z }); } catch { setPos(this.p, x, y, z); }
    const base = MOTOR[(KINDS[this.kind] || KINDS.guide).motor] || 80, f = base * (0.55 + 0.6 * throttle);
    this.o.frequency.setTargetAtTime(f, t, 0.3); this.o2.frequency.setTargetAtTime(f * 0.5, t, 0.3);
    this.f.frequency.setTargetAtTime(400 + 900 * throttle, t, 0.3);
    this.g.gain.setTargetAtTime(on ? 0.05 + 0.1 * throttle : 0, t, 0.4);
  }
  free() { try { this.o.stop(); this.o2.stop(); } catch { /* stopped */ } for (const n of [this.o, this.o2, this.f, this.g, this.p]) { try { n.disconnect(); } catch { /* gone */ } } }
}

class Motorboat {
  constructor(layer, { kind = 'guide', at, heading = 0, speed = null, driver = null, home = null, key = null }) {
    this.layer = layer; this.kind = KINDS[kind] ? kind : 'guide'; this.K = KINDS[this.kind];
    this.key = key || `m:boat:${layer.seq++}`;
    this.x = at.x; this.z = at.z; this.y = 0; this.heading = heading; this.v = 0; this.want = 0; this.cruise = speed || this.K.speed;
    this.mode = 'idle'; this.path = null; this.pi = 0; this.onEnd = null; this.lines = []; this.home = home; this.lost = false;
    this.fns = new Map(); this.pitch = 0; this.roll = 0; this.wakeAcc = 0; this.removed = false;
    this.mesh = new THREE.Mesh(boatGeometry(this.kind), propMaterial());
    this.mesh.name = `motorboat ${this.kind}`; this.mesh.castShadow = true; this.mesh.receiveShadow = true;
    this.root = new THREE.Group(); this.root.add(this.mesh); layer.scene.add(this.root);
    this.seat = driverSeat(this.kind);
    this.driver = null;
    if (driver !== false && layer.actors) {
      const look = driver && driver.look ? driver.look : driver && driver.skin ? driver : tripperLook((this.key.length * 977 + layer.seq * 31) | 0);
      this.driver = layer.actors.person({ key: `${this.key}:driver`, look, name: (driver && driver.name) || null });
    }
    this.drone = null; this.T = { sight: 0, seenHeading: null, lastSeen: null, stopT: 0 };
  }
  on(evt, fn) { if (!this.fns.has(evt)) this.fns.set(evt, new Set()); this.fns.get(evt).add(fn); return () => this.fns.get(evt).delete(fn); }
  emit(evt, d) { for (const f of this.fns.get(evt) || []) { try { f(d, this); } catch (e) { console.warn('motorboat', evt, e); } } this.layer.emit(evt, { mb: this, ...(d || {}) }); }
  run(path, { speed = null, onEnd = null } = {}) { this.path = (path || []).map((p) => (Array.isArray(p) ? [p[0], p[1]] : [p.x, p.z])); this.pi = 0; this.mode = 'run'; this.onEnd = onEnd; if (speed) this.cruise = speed; return this; }
  goTo(x, z, opts = {}) { return this.run([[x, z]], opts); }
  idle() { this.mode = 'idle'; this.path = null; return this; }
  anchor() { this.mode = 'anchor'; this.path = null; return this; }
  stopAt(line) { if (line && line.length === 2) this.lines.push(line.map((p) => (Array.isArray(p) ? p : [p.x, p.z]))); return this; }
  clearLines() { this.lines = []; return this; }
  // 33 §6.7: hold near–far behind the target, mirror its stops, turn away when it comes at the boat, run for the lee in a
  // blow, stop at a line or a narrows mouth, lose it after `lose` game seconds out of sight plus a heading change
  trail(target = 'player', { near = 300, far = 500, lose = 120, home = null } = {}) {
    this.mode = 'trail'; this.trailT = { target, near, far, lose }; this.lost = false; if (home) this.home = home; this.T.sight = 0; this.T.seenHeading = null; return this;
  }
  remove() { this.layer.drop(this); }
  targetPos() {
    const t = this.trailT && this.trailT.target, p = this.layer.g.player;
    if (t === 'player' || !t) return p ? { x: p.x, z: p.z, heading: p.heading, v: Math.abs(p.speed || 0) * (p.boost || 1) } : null;
    return { x: t.x, z: t.z, heading: t.heading || 0, v: t.v || 0 };
  }
  // the water under a point deep enough for the leg (null: the tile not in)
  deepAt(x, z) {
    const w = this.layer.g.world;
    if (!w || !w.isReady(x, z)) return null;
    if (w.shoreAt(x, z) > -2) return false;
    const lv = w.levelAt(x, z), bed = typeof w.heightAt === 'function' ? w.heightAt(x, z) : lv - 5;
    return lv - bed > this.K.draft + 0.6;
  }
  crossesLine(ax, az, bx, bz) {
    for (const [[x1, z1], [x2, z2]] of this.lines) {
      const d = (bx - ax) * (z2 - z1) - (bz - az) * (x2 - x1); if (Math.abs(d) < 1e-9) continue;
      const t = ((x1 - ax) * (z2 - z1) - (z1 - az) * (x2 - x1)) / d, u = ((x1 - ax) * (bz - az) - (z1 - az) * (bx - ax)) / d;
      if (t >= 0 && t <= 1 && u >= 0 && u <= 1) return true;
    }
    return false;
  }
  // steer toward (tx, tz) at speed sp: a step that would ground turns along the shore (the nearest heading with water)
  steer(tx, tz, sp, dt) {
    const want = Math.atan2(-(tz - this.z), tx - this.x);
    let h = this.heading + clamp(wrapPi(want - this.heading), -0.7 * dt, 0.7 * dt);
    this.v += (sp - this.v) * (1 - Math.exp(-dt * (sp > this.v ? 0.8 : 1.4)));
    const step = this.v * dt, look = Math.max(12, step * 3);
    let ok = false;
    for (const off of [0, 0.35, -0.35, 0.7, -0.7, 1.1, -1.1, 1.6, -1.6]) {
      const hh = h + off, f = fwd(hh), d = this.deepAt(this.x + f.x * look, this.z + f.z * look);
      if (d === null) { this.v *= 0.5; return 'wait'; }
      if (d) { h = off ? this.heading + clamp(wrapPi(hh - this.heading), -1.2 * dt, 1.2 * dt) : h; ok = true; break; }
    }
    if (!ok) { this.v *= Math.exp(-dt * 3); return 'blocked'; }
    const f = fwd(h), nx = this.x + f.x * step, nz = this.z + f.z * step;
    if (this.lines.length && this.crossesLine(this.x, this.z, nx + f.x * 8, nz + f.z * 8)) { this.v = 0; return 'line'; }
    this.heading = wrapPi(h); this.x = nx; this.z = nz;
    return 'ok';
  }
  sees(p) {
    const w = this.layer.g.world, dx = p.x - this.x, dz = p.z - this.z, L = Math.hypot(dx, dz), n = Math.ceil(L / 25);
    for (let i = 1; i < n; i++) { const x = this.x + (dx * i) / n, z = this.z + (dz * i) / n; if (w.isReady(x, z) && w.shoreAt(x, z) > 2) return false; }
    return true;
  }
  tick(dt, gdt) {
    if (this.mode === 'run' && this.path) {
      const P = this.path[this.pi];
      if (!P) { this.mode = 'idle'; } else {
        const d = Math.hypot(P[0] - this.x, P[1] - this.z), last = this.pi === this.path.length - 1;
        const sp = last ? Math.min(this.cruise, Math.max(1.2, d * 0.35)) : this.cruise;
        const r = this.steer(P[0], P[1], sp, dt);
        if (r === 'line') { this.mode = 'stopped'; this.emit('stopped', { why: 'line' }); }
        if (d < (last ? 3 : 14)) {
          this.pi++;
          if (this.pi >= this.path.length) { this.mode = 'idle'; this.v = 0; const f = this.onEnd; this.onEnd = null; this.emit('arrived', {}); if (f) f(this); }
        }
      }
    } else if (this.mode === 'trail') this.trailTick(dt, gdt);
    else if (this.mode === 'lee' && this.leeAt) {
      const d = Math.hypot(this.leeAt.x - this.x, this.leeAt.z - this.z);
      if (d > 10) this.steer(this.leeAt.x, this.leeAt.z, Math.min(this.cruise, d * 0.3 + 1), dt); else this.v *= Math.exp(-dt * 2);
      const p = this.targetPos(); if (p && Math.hypot(p.x - this.x, p.z - this.z) > 900) this.loseIt('wind');
    } else if (this.mode === 'home' && this.home) {
      const d = Math.hypot(this.home.x - this.x, this.home.z - this.z);
      if (this.steer(this.home.x, this.home.z, this.cruise, dt) === 'line' || d < 20) { this.mode = 'idle'; this.emit('home', {}); }
    } else this.v *= Math.exp(-dt * (this.mode === 'anchor' ? 3 : 1.2));
  }
  trailTick(dt, gdt) {
    const T = this.trailT, p = this.targetPos(), g = this.layer.g;
    if (!p) { this.v *= Math.exp(-dt); return; }
    // dusk: it peels off toward home (33 §6.7: "the grey boat peels off at dusk toward Crane")
    const hrs = g.day ? g.day.hours : 12;
    if (hrs > 20.25 || hrs < 4) { this.mode = this.home ? 'home' : 'idle'; this.emit('peel', {}); return; }
    // the blow: over 15 mph (6.7 m/s), on open water, the small boat runs for the lee
    const W = g.wind, wa = g.water;
    if (W && W.speed > 6.7 && wa && typeof wa.shelterAt === 'function' && wa.shelterAt(this.x, this.z) > 0.7) {
      const lee = this.findLee(); if (lee) { this.leeAt = lee; this.mode = 'lee'; this.emit('lee', lee); return; }
    }
    const dx = p.x - this.x, dz = p.z - this.z, d = Math.hypot(dx, dz);
    // out of sight: two game minutes behind land, and a new heading since, and it has lost you
    const seen = this.sees(p);
    if (seen) { this.T.sight = 0; this.T.seenHeading = p.heading; this.T.lastSeen = { x: p.x, z: p.z }; }
    else {
      this.T.sight += gdt;
      const turned = this.T.seenHeading !== null && Math.abs(wrapPi(p.heading - this.T.seenHeading)) > 0.6;
      if (this.T.sight > T.lose && turned) { this.loseIt('islands'); return; }
      // it searches toward where it last saw you
      if (this.T.lastSeen) { this.steer(this.T.lastSeen.x, this.T.lastSeen.z, this.cruise * 0.6, dt); return; }
    }
    // coming at it: turned toward it and moving, it turns away and idles off
    const toB = Math.atan2(-(this.z - p.z), this.x - p.x), facing = Math.abs(wrapPi(p.heading - toB)) < 0.45 && p.v > 1;
    if (facing && d < T.far + 100) { const away = { x: this.x + (this.x - p.x), z: this.z + (this.z - p.z) }; this.steer(away.x, away.z, 3, dt); this.T.away = true; return; }
    this.T.away = false;
    if (p.v < 0.6) { this.v *= Math.exp(-dt * 1.5); this.mode = 'trail'; this.fishing = true; return; } // (it stops when you stop: someone in it pretends to fish)
    this.fishing = false;
    const holdAt = (T.near + T.far) / 2, sp = d > T.far ? Math.min(this.cruise * 1.3, p.v + 4) : d < T.near ? Math.max(0, p.v - 3) : p.v * (0.85 + 0.3 * clamp((d - holdAt) / (T.far - T.near), -1, 1));
    const r = this.steer(p.x, p.z, sp, dt);
    if (r === 'line') { this.mode = 'stopped'; this.emit('stopped', { why: 'line' }); }
    else if (r === 'blocked' && d > 200) { this.mode = 'stopped'; this.emit('stopped', { why: 'narrows' }); }
  }
  loseIt(why) { this.lost = true; this.mode = this.home ? 'home' : 'idle'; this.emit('lost', { why }); }
  findLee() {
    const wa = this.layer.g.water;
    let best = null;
    for (const r of [150, 300, 500]) for (let a = 0; a < 16; a++) {
      const x = this.x + Math.cos((a * Math.PI) / 8) * r, z = this.z + Math.sin((a * Math.PI) / 8) * r;
      if (!this.deepAt(x, z)) continue;
      const s = wa.shelterAt(x, z); if (s < 0.55 && (!best || s < best.s)) best = { x, z, s };
    }
    return best;
  }
  place(dt) {
    const g = this.layer.g, w = g.world, wa = g.water, f = fwd(this.heading);
    const lv = w.levelAt(this.x, this.z), wave = (a) => (wa && wa.waveAt ? wa.waveAt(this.x + f.x * a, this.z + f.z * a) : 0);
    const hb = wave(this.K.L / 2), hs = wave(-this.K.L / 2), y = (Number.isFinite(lv) ? lv : this.y) + (hb + hs) / 2;
    const plane = clamp(this.v / this.cruise, 0, 1), pitch = Math.atan2(hb - hs, this.K.L) * 0.6 + 0.07 * plane * (1 - 0.5 * plane);
    const k = 1 - Math.exp(-dt * 4);
    this.y += (y - this.y) * (Number.isFinite(this.y) && this.y !== 0 ? k : 1); this.pitch += (pitch - this.pitch) * k;
    this.roll += (clamp(this.yawRate || 0, -0.4, 0.4) * 0.2 - this.roll) * k;
    const R = this.root; R.position.set(this.x, this.y, this.z); R.rotation.set(0, this.heading, 0); R.rotateZ(this.pitch); R.rotateX(this.roll);
    // the driver at the seat (sat: actors.js poseSit), facing the bow
    if (this.driver) {
      const s = this.seat, sx = this.x + f.x * s.x - f.z * (s.z || 0), sz = this.z + f.z * s.x + f.x * (s.z || 0);
      this.driver.drive({ x: sx, z: sz, heading: this.heading + (s.turn || 0), v: 0, mode: 'stand', anim: { sit: this.y + s.top }, y: this.y + 0.05, snap: true });
    }
    // the wake: a V of flecks off the stern while under way
    const rp = g.ripples, near = g.player ? Math.hypot(this.x - g.player.x, this.z - g.player.z) < 300 : false;
    if (rp && near && this.v > 1) {
      this.wakeAcc += dt * (4 + this.v * 0.8);
      while (this.wakeAcc >= 1) {
        this.wakeAcc -= 1;
        const side = Math.random() < 0.5 ? -1 : 1, back = this.K.L / 2 + Math.random() * 1.5, rx = -f.z, rz = f.x;
        rp.spawn(3, this.x - f.x * back + rx * side * 0.6, (Number.isFinite(lv) ? lv : this.y) + 0.03, this.z - f.z * back + rz * side * 0.6, 0.05, 0.1, 1.6 + Math.random(), rx * side * 0.9 - f.x * 0.4, 0, rz * side * 0.9 - f.z * 0.4);
      }
    }
    // the drone (its only sound)
    const au = g.audio;
    if (au && au.ctx && au.enabled !== false) {
      if (!this.drone) { try { this.drone = new Drone(au, this.kind); } catch { this.drone = false; } }
      if (this.drone) this.drone.set(this.x, this.y + 0.5, this.z, clamp(this.v / this.cruise, 0, 1), this.mode !== 'anchor' && !(this.mode === 'idle' && this.off));
    }
  }
}

class MotorboatLayer {
  constructor() { this.g = null; this.boats = []; this.seq = 1; this.fns = new Map(); }
  attach(g) { this.g = g; return this; }
  get scene() { return this.g && this.g.scene; }
  get actors() { return this.g && this.g.actors; }
  on(evt, fn) { if (!this.fns.has(evt)) this.fns.set(evt, new Set()); this.fns.get(evt).add(fn); return () => this.fns.get(evt).delete(fn); }
  emit(evt, d) { for (const f of this.fns.get(evt) || []) { try { f(d); } catch (e) { console.warn('motorboat', evt, e); } } }
  lakeOf(lake) {
    const w = this.g && this.g.world; if (!w) return null;
    if (typeof lake === 'number') return w.lakeName(lake);
    return lake || null;
  }
  allowed(lake) { const n = this.lakeOf(lake); return !!n && (MOTOR_LAKES.has(n) || [...MOTOR_LAKES].some((m) => n.startsWith(m))); }
  spawn({ lake = null, path = null, driver = null, kind = 'guide', at = null, heading = null, speed = null, force = false, home = null, key = null } = {}) {
    if (!this.g || !this.g.scene) return { why: 'not attached' };
    const pts = (path || []).map((p) => (Array.isArray(p) ? [p[0], p[1]] : [p.x, p.z]));
    const start = at ? { x: at.x, z: at.z } : pts.length ? { x: pts[0][0], z: pts[0][1] } : null;
    if (!start) return { why: 'no place' };
    const w = this.g.world, lk = lake ?? (w && w.lakeIdAt ? w.lakeIdAt(start.x, start.z) : null);
    if (!force && !this.allowed(lk)) return { why: `no motors on ${this.lakeOf(lk) || 'this water'}` };
    const h0 = heading ?? (pts.length > 1 ? Math.atan2(-(pts[1][1] - pts[0][1]), pts[1][0] - pts[0][0]) : 0);
    const mb = new Motorboat(this, { kind, at: start, heading: h0, speed, driver, home, key });
    this.boats.push(mb);
    if (pts.length > 1 || (pts.length === 1 && at)) mb.run(at ? pts : pts.slice(1));
    mb.place(0);
    return mb;
  }
  drop(mb) {
    mb.removed = true; mb.root.removeFromParent();
    if (mb.driver) mb.driver.remove();
    if (mb.drone) mb.drone.free();
    this.boats = this.boats.filter((b) => b !== mb);
  }
  list() { return this.boats; }
  clear() { for (const b of this.boats.slice()) b.remove(); }
  update(dt) {
    if (!this.g || !(dt > 0)) return;
    const rate = this.g.day && this.g.day.rate > 0 ? this.g.day.rate : 8, gdt = Math.min(dt, 0.25) * rate;
    for (const b of this.boats.slice()) { const h0 = b.heading; b.tick(Math.min(dt, 0.25), gdt); b.yawRate = wrapPi(b.heading - h0) / Math.max(dt, 1e-3); b.place(Math.min(dt, 0.25)); }
  }
  stats() { return this.boats.map((b) => ({ key: b.key, kind: b.kind, x: +b.x.toFixed(1), z: +b.z.toFixed(1), heading: +b.heading.toFixed(3), v: +b.v.toFixed(2), mode: b.mode, lost: b.lost, driver: !!b.driver, fishing: !!b.fishing })); }
}

export const motorboat = new MotorboatLayer();
