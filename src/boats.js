// Loose hulls, the drift and the tow line (stream m, campaign Round 4; docs/story/90-game-needs.md §7: "A loose empty
// hull drifting with the wind (upright, swamped or empty), short range, grounding on the first shore downwind", "A tow
// line: a second hull on a short line behind the canoe", "Swamp it / Let go on a towed hull, only in the drift test",
// "The canoe adrift at dawn"; 31-guiding-years GY-11, 40-company-and-press §5). Only under STORY_ON (main.js m: block).
//
// A hull is a handle over a drawn canoe: a spare is an actors.js boat with no crew (the same hull, the same budgets, no
// new program), the player's own is player.carry.drop (the canoe left lying, re-laid by player.restHull as it moves).
//
//   boats.attach({ world, water, wind, player, actors, pointer, day, camera, story, scene })
//   boats.spare({ x, z, heading, hull, verbs, id }) → h          a second, empty canoe afloat there
//   boats.loose(canoe, { state }) → h                             it drifts down the wind until it grounds
//   boats.swamp(h) · boats.letGo(h) · boats.tow(a, b) · boats.untow(b) · boats.remove(h) · boats.list() · boats.stats()
//   boats.on(evt, fn) → off      'loose' 'swamped' 'letgo' 'tow' 'untow' 'grounded' { h, x, z, lake } 'turnedAway'
//   boats.update(dt)             each frame after the player moves (real seconds; the drift runs on game seconds)
//   h { id, kind: 'spare'|'player', x, z, heading, state: 'upright'|'swamped'|'over', loose, grounded, towedBy, drift }
//
// The drift (life m/s per m/s of wind, times the lee's share of it, water.js shelterAt; on game time, so 20–40 game
// minutes take a swamped hull the 550 m of GY-11's mid-Birch to the north shore in a 10–15 mph south wind): an empty hull
// rides high and goes fastest, a swamped one with the surface water, an overturned one between (player.js's own capsize
// drift is 0.035). It grounds where the water under its downwind end is shallower than DRIFT.ground or the bank is
// reached, and stays. Nothing is said: the hull just goes (31 GY-11: "Nothing is said and nothing is shown").
import * as THREE from 'three';
import { PropBuilder, propMaterial, TILE } from './prop-kit.js';
import { buildBilge } from './hullwater.js';
import { CLOCK } from './pace.js';

export const DRIFT = {
  upright: 0.06, swamped: 0.045, over: 0.035, // m/s at life per m/s of wind
  sink: 0.26,        // m a swamped hull sits lower (its gunwales awash)
  list: 0.07,        // rad: and the list of the water in it
  ground: 0.32,      // m of water under its downwind end where it grounds
  end: 2.3,          // m from the middle to an end (the hull's half length, near enough)
  turn: 0.05,        // rad/s (game): how fast a loose hull swings broadside to the wind
  line: 4.5,         // m: the tow line, stern to bow
  drag: { upright: 0.06, swamped: 0.35, over: 0.25 }, // the tow's drag on the leader's speed (1/s at life)
  reach: 7,          // m: the dot finds a spare from the canoe within
};
const wrapPi = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const fwd = (h) => ({ x: Math.cos(h), z: -Math.sin(h) }); // the player's heading convention: +x at 0, -z at pi/2

let ROPE_GEO = null;
function ropeGeo() {
  if (ROPE_GEO) return ROPE_GEO;
  const b = new PropBuilder(), V = (x, y, z) => new THREE.Vector3(x, y, z);
  b.cyl(V(0, 0, 0), V(0, 1, 0), 0.012, 0.012, 5, TILE.FIBRE, new THREE.Color(0xc9b27a));
  return (ROPE_GEO = b.build());
}

class Boats {
  constructor() {
    this.g = null; this.hulls = []; this.seq = 1; this.fns = new Map(); this.n = { loose: 0, grounded: 0, swamped: 0, tows: 0 };
    this.offs = [];
  }
  attach(ctx) {
    this.g = ctx;
    const pt = ctx.pointer;
    if (pt && !this.offs.length) {
      if (typeof pt.registerWater === 'function') this.offs.push(pt.registerWater((ray, near) => this.targets(ray, near, true)));
      if (typeof pt.register === 'function') this.offs.push(pt.register((ray, near) => this.targets(ray, near, false)));
    }
    return this;
  }
  on(evt, fn) { if (!this.fns.has(evt)) this.fns.set(evt, new Set()); this.fns.get(evt).add(fn); return () => this.fns.get(evt).delete(fn); }
  emit(evt, data) {
    for (const f of [...(this.fns.get(evt) || []), ...(this.fns.get('*') || [])]) { try { f(data, evt); } catch (e) { console.warn('boats', evt, e); } }
    const s = this.g && this.g.story; if (s && typeof s.emit === 'function' && s.v === 2) { try { s.emit(`boat:${evt}`, { id: data && data.h ? data.h.id : null, x: data && data.x, z: data && data.z, lake: data && data.lake }); } catch { /* the story's */ } }
  }
  get rate() { const d = this.g && this.g.day; return d && Number.isFinite(d.rate) && d.rate > 0 ? d.rate : CLOCK; }

  // --- making and naming hulls -------------------------------------------------------------------------------------
  spare({ x, z, heading = 0, hull = 'aluminium', verbs = false, id = null } = {}) {
    const A = this.g && this.g.actors;
    if (!A) return null;
    const b = A.boat({ key: `m:spare:${this.seq}`, hull, crew: [], packs: 0 });
    const h = { id: id || `spare${this.seq++}`, kind: 'spare', boat: b, x, z, heading, state: 'upright', loose: false, grounded: null, towedBy: null, verbs: !!verbs, drift: 0, from: null, t: 0 };
    b.placeAt({ x, z, heading });
    this.hulls.push(h);
    return h;
  }
  handle(canoe) {
    if (!canoe) return null;
    if (canoe === 'player') {
      let h = this.hulls.find((q) => q.kind === 'player');
      const p = this.g && this.g.player, d = p && p.carry && p.carry.drop;
      if (!d) return null;
      if (!h) { h = { id: 'player', kind: 'player', x: d.x, z: d.z, heading: d.heading, state: 'upright', loose: false, grounded: null, towedBy: null, verbs: false, drift: 0, from: null, t: 0 }; this.hulls.push(h); }
      return h;
    }
    if (this.hulls.includes(canoe)) return canoe;
    const byBoat = this.hulls.find((q) => q.boat === canoe);
    if (byBoat) return byBoat;
    if (canoe && typeof canoe.placeAt === 'function') { // an actors boat of someone else's: taken over as a spare
      const h = { id: `spare${this.seq++}`, kind: 'spare', boat: canoe, x: canoe.x, z: canoe.z, heading: canoe.heading, state: 'upright', loose: false, grounded: null, towedBy: null, verbs: false, drift: 0, from: null, t: 0 };
      this.hulls.push(h); return h;
    }
    return null;
  }
  list() { return this.hulls; }
  find(id) { return this.hulls.find((h) => h.id === id) || null; }

  // --- the verbs ----------------------------------------------------------------------------------------------------
  loose(canoe, { state = null } = {}) {
    const h = this.handle(canoe); if (!h) return null;
    if (h.towedBy) this.untow(h, true);
    if (state) h.state = state;
    h.loose = true; h.grounded = null; h.from = { x: h.x, z: h.z }; h.drift = 0; h.t = 0; h.away = false;
    this.n.loose++;
    this.emit('loose', { h, x: h.x, z: h.z });
    return h;
  }
  swamp(canoe) {
    const h = this.handle(canoe); if (!h || h.state === 'swamped') return h;
    h.state = 'swamped'; h.rollT = 1.2; // (the roll: over to the gunwale, filling, settling back with it awash)
    this.n.swamped++;
    const r = this.g && this.g.ripples, w = this.g && this.g.world;
    if (r && w) { const lv = w.levelAt(h.x, h.z); for (let i = 0; i < 30; i++) { const a = Math.random() * 6.283, d = Math.random() * 2; r.spawn(1, h.x + Math.cos(a) * d * 0.5, lv + 0.05, h.z + Math.sin(a) * d * 0.5, 0.06, 0.05, 0.6, Math.cos(a) * d, 1 + Math.random() * 2, Math.sin(a) * d); } }
    if (this.g && this.g.audio && this.g.audio.paddleDip) { try { this.g.audio.paddleDip(); this.g.audio.paddleDip(); } catch { /* sound only */ } }
    this.emit('swamped', { h, x: h.x, z: h.z });
    return h;
  }
  letGo(canoe) {
    const h = this.handle(canoe); if (!h) return null;
    this.emit('letgo', { h, x: h.x, z: h.z });
    return this.loose(h);
  }
  // b on a short line behind a (a: 'player' or a handle). Only a hull on the water takes a line
  tow(a, b) {
    const hb = this.handle(b); if (!hb || hb.kind === 'player') return null;
    const lead = a === 'player' || a == null ? 'player' : this.handle(a);
    if (!lead) return null;
    hb.towedBy = lead; hb.loose = false; hb.grounded = null;
    this.n.tows++;
    this.ensureRope(hb);
    this.emit('tow', { h: hb, x: hb.x, z: hb.z });
    return hb;
  }
  untow(b, quiet = false) {
    const h = this.handle(b); if (!h || !h.towedBy) return h;
    h.towedBy = null;
    if (h.rope) h.rope.visible = false;
    if (!quiet) this.emit('untow', { h, x: h.x, z: h.z });
    return h;
  }
  remove(canoe) {
    const h = this.handle(canoe); if (!h) return;
    this.untow(h, true);
    if (h.rope) { h.rope.removeFromParent(); h.rope = null; }
    if (h.bilge) { h.bilge.removeFromParent(); h.bilge = null; }
    if (h.boat) h.boat.remove();
    this.hulls = this.hulls.filter((q) => q !== h);
  }
  clear() { for (const h of this.hulls.slice()) this.remove(h); }

  ensureRope(h) {
    if (h.rope || !this.g || !this.g.scene) { if (h.rope) h.rope.visible = true; return; }
    const m = new THREE.Mesh(ropeGeo(), propMaterial());
    m.name = 'tow line'; m.matrixAutoUpdate = true; m.frustumCulled = false;
    this.g.scene.add(m); h.rope = m;
  }

  // --- per frame ----------------------------------------------------------------------------------------------------
  update(dt) {
    if (!this.g || !(dt > 0) || !this.hulls.length) return;
    const gdt = Math.min(dt, 0.25) * this.rate; // (game seconds: the drift is on the one clock)
    for (const h of this.hulls.slice()) {
      if (h.kind === 'player' && !this.playerHullHere(h)) { this.hulls = this.hulls.filter((q) => q !== h); continue; }
      if (h.towedBy) this.towStep(h, dt);
      else if (h.loose && !h.grounded) this.driftStep(h, gdt);
      if (h.grounded && !h.away) this.watchAway(h);
      this.place(h, dt);
    }
  }
  // the player's own canoe stays a handle only while it lies where it was left (in it, on the shoulders: not loose)
  playerHullHere(h) {
    const p = this.g.player, d = p && p.carry && p.carry.drop;
    if (!d || p.mode === 'paddle' || p.mode === 'carry') return false;
    if (Math.hypot(d.x - h.x, d.z - h.z) > 0.5) { h.x = d.x; h.z = d.z; h.heading = d.heading; } // (moved by someone else: follow it)
    return true;
  }
  windHere(x, z) {
    const W = this.g.wind, wa = this.g.water;
    if (!W) return { x: 0, z: 0, U: 0 };
    const d = W.gustDir || W.dir, U = Number.isFinite(W.gustSpeed) ? W.gustSpeed : W.speed || 0;
    const sh = wa && typeof wa.shelterAt === 'function' ? wa.shelterAt(x, z) : 1;
    return { x: d.x, z: d.z, U: U * (Number.isFinite(sh) ? sh : 1) };
  }
  // water under (x, z), m: the level over the bed (0 or less on land)
  depthAt(x, z) {
    const w = this.g.world;
    if (!w || !w.isReady(x, z)) return null;
    if (w.shoreAt(x, z) > -0.3) return 0;
    const lv = w.levelAt(x, z), bed = typeof w.heightAt === 'function' ? w.heightAt(x, z) : lv - 5;
    return Number.isFinite(lv) && Number.isFinite(bed) ? lv - bed : 5;
  }
  driftStep(h, gdt) {
    const w0 = this.windHere(h.x, h.z), wd = h.air && w0.U < h.air.U ? h.air : w0, v = (DRIFT[h.state] || DRIFT.upright) * wd.U;
    h.t += gdt;
    if (!(v > 1e-4)) return;
    const step = Math.min(v * gdt, 6); // (never more than a few metres a frame: a jump of the clock is not a drift)
    const nx = h.x + wd.x * step, nz = h.z + wd.z * step;
    // the downwind end first: aground where it would touch
    const ex = nx + wd.x * 0.5 * DRIFT.end, ez = nz + wd.z * 0.5 * DRIFT.end;
    const dep = this.depthAt(ex, ez);
    if (dep === null) return; // (the tile not in yet: it waits)
    if (dep < DRIFT.ground) { this.ground(h); return; }
    h.x = nx; h.z = nz; h.drift += step;
    // an empty hull swings broadside to the wind and goes sideways; a swamped one turns slowly any way it likes
    const down = Math.atan2(-wd.z, wd.x), side = [wrapPi(down + Math.PI / 2), wrapPi(down - Math.PI / 2)];
    const want = Math.abs(wrapPi(side[0] - h.heading)) < Math.abs(wrapPi(side[1] - h.heading)) ? side[0] : side[1];
    const k = h.state === 'swamped' ? 0.35 : 1;
    h.heading = wrapPi(h.heading + Math.max(-1, Math.min(1, wrapPi(want - h.heading))) * DRIFT.turn * k * gdt * 0.2);
  }
  // where a loose hull would ground from where it is, on this wind (or its air): stepped ahead without moving it
  predict(canoe, { max = 3000, step = 4 } = {}) {
    const h = this.handle(canoe); if (!h) return null;
    const w0 = this.windHere(h.x, h.z), wd = h.air && w0.U < h.air.U ? h.air : w0, L = Math.hypot(wd.x, wd.z) || 1;
    if (!(wd.U > 0.05)) return null;
    let x = h.x, z = h.z;
    for (let d = 0; d < max; d += step) {
      const nx = x + (wd.x / L) * step, nz = z + (wd.z / L) * step, dep = this.depthAt(nx + (wd.x / L) * 0.5 * DRIFT.end, nz + (wd.z / L) * 0.5 * DRIFT.end);
      if (dep === null) return { x, z, partial: true };
      if (dep < DRIFT.ground) return { x: nx, z: nz, m: d };
      x = nx; z = nz;
    }
    return { x, z, partial: true };
  }
  ground(h) {
    const w = this.g.world, d = this.g.day;
    const lake = w && w.lakeIdAt ? w.lakeIdAt(h.x, h.z) : null;
    h.grounded = { x: +h.x.toFixed(1), z: +h.z.toFixed(1), lake, abs: d && Number.isFinite(d.year) ? Math.round(Date.UTC(d.year, 0, d.doy) / 86400000) : null, hours: d ? +(+d.hours || 0).toFixed(2) : null, drift: Math.round(h.drift), t: Math.round(h.t) };
    this.n.grounded++;
    this.emit('grounded', { h, x: h.x, z: h.z, lake });
  }
  // a grounded hull: the first time the view turns away from it (the camera's forward over 100° off the way to it), or
  // the player is 250 m off: GY-11's "when the player turns away from the grounded hull"
  watchAway(h) {
    const cam = this.g.camera, p = this.g.player;
    if (!cam || !p) return;
    const e = cam.matrixWorld.elements, fx = -e[8], fz = -e[10], dx = h.x - cam.position.x, dz = h.z - cam.position.z, L = Math.hypot(dx, dz) || 1, fl = Math.hypot(fx, fz) || 1;
    const cosA = (fx * dx + fz * dz) / (L * fl), far = Math.hypot(h.x - p.x, h.z - p.z) > 250;
    h.seen = h.seen || cosA > 0.7; // (it has to have been looked at first)
    if (far || (h.seen && cosA < -0.17)) { h.away = true; this.emit('turnedAway', { h, x: h.x, z: h.z, lake: h.grounded && h.grounded.lake }); }
  }
  leaderOf(h) {
    const L = h.towedBy, p = this.g.player;
    if (L === 'player') return p && p.mode === 'paddle' ? { x: p.x, z: p.z, heading: p.heading, player: true } : null;
    return L && Number.isFinite(L.x) ? { x: L.x, z: L.z, heading: L.heading } : null;
  }
  towStep(h, dt) {
    const L = this.leaderOf(h);
    if (!L) { // the leader went ashore (or capsized): the line is let go, the spare stays where it floats, tied off on nothing
      this.untow(h);
      return;
    }
    const f = fwd(L.heading), sx = L.x - f.x * DRIFT.end, sz = L.z - f.z * DRIFT.end;
    const hf = fwd(h.heading), bx = h.x + hf.x * DRIFT.end, bz = h.z + hf.z * DRIFT.end;
    const dx = sx - bx, dz = sz - bz, d = Math.hypot(dx, dz);
    if (d > DRIFT.line) {
      const pull = (d - DRIFT.line) / d;
      h.x += dx * pull; h.z += dz * pull;
      const want = Math.atan2(-(sz - h.z), sx - h.x);
      h.heading = wrapPi(h.heading + wrapPi(want - h.heading) * Math.min(1, dt * 2.5));
    }
    // the drag on the leader (the player's hull at life): more with a swamped hull behind
    const p = this.g.player;
    if (L.player && p && Number.isFinite(p.speed)) p.speed *= Math.exp(-(DRIFT.drag[h.state] || 0.06) * dt);
    // the line: from the stern's deck to the bow's, a little sag ignored
    if (h.rope) {
      const w = this.g.world, lv = w.levelAt(h.x, h.z);
      const a = new THREE.Vector3(sx, lv + 0.42, sz), b = new THREE.Vector3(bx, lv + (h.state === 'swamped' ? 0.18 : 0.4), bz), ab = b.clone().sub(a), len = ab.length();
      h.rope.position.copy(a); h.rope.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), ab.normalize()); h.rope.scale.set(1, len, 1); h.rope.visible = true;
    }
  }
  // the drawn hull where the handle is
  place(h, dt) {
    if (h.kind === 'player') {
      const p = this.g.player, d = p && p.carry && p.carry.drop;
      if (!d) return;
      const moved = Math.hypot(d.x - h.x, d.z - h.z) > 0.05 || Math.abs(wrapPi(d.heading - h.heading)) > 0.01;
      if (moved && ((h.layT = (h.layT || 0) + dt) > 0.12 || h.grounded)) { h.layT = 0; d.x = h.x; d.z = h.z; d.heading = h.heading; try { p.restHull(h.x, h.z, h.heading); } catch (e) { void e; } }
      return;
    }
    const b = h.boat; if (!b || b.removed) return;
    const lv = this.g.world ? this.g.world.levelAt(h.x, h.z) : null;
    b.drive({ x: h.x, z: h.z, heading: h.heading, v: 0, exact: true, level: Number.isFinite(lv) ? lv : null });
    // m: the swamped hull sits low with a list (actors.js Boat.sink/list, the m: block in placeRoot)
    const sw = h.state === 'swamped';
    if (h.rollT > 0) h.rollT = Math.max(0, h.rollT - dt);
    const roll = h.rollT > 0 ? Math.sin((1 - h.rollT / 1.2) * Math.PI) * 0.9 : 0;
    b.sink = sw ? DRIFT.sink * (h.rollT > 0 ? 1 - h.rollT / 1.2 : 1) : 0; b.list = (sw ? DRIFT.list : 0) + roll;
    if (sw) {
      if (!h.bilge && this.g.water) { h.bilge = buildBilge(this.g.water); b.root.add(h.bilge); }
      if (h.bilge && h.bilge.parent !== b.root) b.root.add(h.bilge);
      if (h.bilge && b.near) h.bilge.userData.update(dt, 1);
    }
  }

  // --- the dot: Swamp it / Let go on a towed spare, Take the line on a loose one (verbs: the drift test's only) -------
  targets(ray, near, water) {
    const p = this.g && this.g.player;
    if (!p || !this.hulls.length) return null;
    const out = [];
    for (const h of this.hulls) {
      if (!h.verbs || h.kind !== 'spare' || !h.boat) continue;
      if (near.flat(h.x, h.z) > (water ? DRIFT.reach : 3.2)) continue;
      const lv = this.g.world.levelAt(h.x, h.z), hit = near.sphere(h.x, lv + 0.3, h.z, 1.5);
      if (!hit) continue;
      const label = h.state === 'swamped' ? 'the spare, swamped' : 'the spare canoe';
      let e = null, q = null;
      if (h.towedBy && water) {
        if (h.state !== 'swamped') { e = { verb: 'Swamp it', run: () => this.swamp(h) }; q = { verb: 'Let go', run: () => this.letGo(h) }; }
        else e = { verb: 'Let go', run: () => this.letGo(h) };
      } else if (!h.towedBy && water && p.mode === 'paddle') {
        e = { verb: 'Take the line', run: () => this.tow('player', h) };
      } else if (!h.towedBy && !water && h.grounded) {
        e = { verb: 'Look', run: () => this.emit('looked', { h, x: h.x, z: h.z }) };
      }
      if (!e) continue;
      out.push({ dist: hit.t, miss: hit.miss, target: { kind: 'canoe', ref: h.id, label, e, ...(q ? { q } : {}), box: { x: h.x, y: lv + 0.25, z: h.z, hx: 2.4, hy: 0.4, hz: 0.45, heading: h.heading } } });
    }
    return out;
  }
  stats() {
    return { ...this.n, hulls: this.hulls.map((h) => ({ id: h.id, kind: h.kind, x: +h.x.toFixed(1), z: +h.z.toFixed(1), heading: +h.heading.toFixed(3), state: h.state, loose: h.loose, towed: !!h.towedBy, grounded: h.grounded, drift: Math.round(h.drift) })) };
  }
}

export const boats = new Boats();
