import * as THREE from 'three';
import { mulberry32, hash2 } from './rng.js';
import { beaverModels, lodgeModel, mooseModels, fishModel, insectModels, MOOSE } from './fauna-models.js';
import { makeFaunaMaterials, Parts, frameMatrix, partMatrix, deeper, depthAt, shelterAt, waterRun, smooth, clamp, wrapAngle, turnToward, headingOf, lightOf, emit } from './fauna-kit.js';
import { Birds } from './fauna-birds.js';
import { RiseRings } from './fauna-rings.js';

// The rest of the Boundary Waters' wildlife, spawned round the player from the world's own queries (no
// placement): a beaver lodge in a sheltered shallow bay with its beaver out at dawn and dusk; a moose at a shore
// or standing in the shallows at dawn and dusk in summer and fall, rare; a bald eagle on a shore pine and
// soaring over the lake; gulls on a rock out in the lake; fish rising as rings on calm water at dusk; dragonflies
// and damselflies over the reeds and the pads on summer days; and in the winter only the odd raven over the ice.
// The loons are loons.js's.
//
//   const fauna = new Fauna(world, water, scene, { loons });            // shares the loons' materials
//   const ctx = { player, world, water, day, camera, ripples, audio };   // made once, passed every frame
//   fauna.update(dt * timeScale, ctx);
//   fauna.force('moose');   // debug: summon one near the player (see force()); fauna.stats: what is out
//
// Every species is a small fixed pool of instanced parts (fauna-kit.js), drawn in one call per part however
// many are out; nothing allocates per frame. Animals come only on ready tiles, go when far behind, keep off
// the player and the canoe; swimmers only on water, the moose in the water only in the shallows by the shore.
// Sounds go through audio.emit(kind, { x, y, z, size }) when the audio has it.

const _m = new THREE.Matrix4(), _h = new THREE.Matrix4(), _l = new THREE.Matrix4(), _v = new THREE.Vector3();
const _d = { x: 0, z: 0 }, _spot = { x: 0, z: 0, ok: false };
const LODGE_CELL = 800;
const GAIT = [0.25, 0.75, 0, 0.5]; // a moose's walk: each leg's phase (fore left, fore right, hind left, hind right)

export class Fauna {
  constructor(world, water, scene, { loons = null, materials = null } = {}) {
    this.world = world; this.water = water; this.scene = scene; this.loons = loons;
    this.rng = mulberry32(77);
    const mats = this.materials = materials || (loons && loons.materials) || makeFaunaMaterials(water);
    this.beavers = new Beavers(this, scene, mats);
    this.moose = new Moose(this, scene, mats);
    this.birds = new Birds(this, scene, mats);
    this.fish = new Fish(this, scene, mats);
    this.insects = new Insects(this, scene, mats);
    this.light = { dawn: 0, dusk: 0, elev: 30, day: 1, night: 0 };
    this.gates = { beaver: false, moose: false, eagle: false, eaglePair: false, gull: false, gullFly: true, fish: 0, insects: false, raven: false };
    this.forced = { beaver: 0, moose: 0, fish: 0, insects: 0 };
    this.view = { x: 1, z: 0 };
    this._open = { x: 0, z: 0, ok: false };
    this.px = 0; this.pz = 0; this.cx = 0; this.cz = 0; this.levelRef = 0;
  }

  // ---- shared helpers ------------------------------------------------------------------------------------------
  levelAt(x, z) { return this.world.levelAt(x, z, 3); }
  emit(kind, x, y, z, size = 1) { emit(this.audio, kind, x, y, z, size, Math.hypot(x - this.cx, z - this.cz)); }
  ring(x, z, s0, s1, life, y = null) { if (this.ripples) this.ripples.spawn(3, x, y ?? this.levelAt(x, z), z, s0, s1, life); }
  splash(x, z, size, n = 8) {
    const r = this.ripples;
    if (!r || Math.hypot(x - this.cx, z - this.cz) > 250) return;
    const y = this.levelAt(x, z);
    for (let k = 0; k < n; k++) { const a = this.rng() * 6.28, s = (0.3 + this.rng() * 0.9) * size; r.spawn(1, x + Math.cos(a) * 0.2 * size, y, z + Math.sin(a) * 0.2 * size, 0.04 + 0.05 * size, 0.02, 0.5 + this.rng() * 0.4, Math.cos(a) * s, (1.2 + this.rng() * 1.6) * Math.sqrt(size), Math.sin(a) * s); }
    r.spawn(3, x, y, z, 0.3 * size, 1.8 * size, 2.8);
  }
  // open water (at least `clear` m off the shore) near (x, z), within r; into this._open (ok false: fell back)
  openNear(x, z, r, clear = 30) {
    const w = this.world, o = this._open;
    for (let k = 0; k < 30; k++) {
      const a = this.rng() * 6.28, d = this.rng() * r, qx = x + Math.cos(a) * d, qz = z + Math.sin(a) * d;
      if (w.isReady(qx, qz) && w.shoreAt(qx, qz) < -clear) { o.x = qx; o.z = qz; o.ok = true; return o; }
    }
    o.x = x; o.z = z; o.ok = false;
    return o;
  }
  // far enough off the player and the canoe (on foot, the canoe lies wherever it was left)
  clearOfPlayer(x, z, r) {
    const p = this.player;
    if (Math.hypot(x - p.x, z - p.z) < r) return false;
    const rig = p.canoe && p.canoe.rig;
    if (rig && Math.hypot(x - rig.position.x, z - rig.position.z) < r) return false;
    return true;
  }

  // ---- the frame -------------------------------------------------------------------------------------------------
  update(dt, ctx) {
    const { player, day, camera, ripples, audio, water } = ctx;
    this.player = player; this.ripples = ripples; this.audio = audio; if (water) this.water = water;
    this.px = player.x; this.pz = player.z;
    if (camera) {
      camera.getWorldDirection(_v);
      const n = Math.hypot(_v.x, _v.z) || 1;
      this.view.x = _v.x / n; this.view.z = _v.z / n; this.cx = camera.position.x; this.cz = camera.position.z;
    } else { this.view.x = Math.cos(player.heading); this.view.z = -Math.sin(player.heading); this.cx = player.x; this.cz = player.z; }
    this.levelRef = this.levelAt(player.x, player.z);
    this.afloat = player.mode === 'paddle' || player.mode === 'swim';
    const L = lightOf(day, this.light), s = day.season, doy = s.doy, open = s.ice < 0.5;
    this.dayDoy = doy;
    for (const k in this.forced) if (this.forced[k] > 0) this.forced[k] -= dt;
    // the season's and the hour's gates (see the header)
    const G = this.gates, crep = Math.max(L.dawn, L.dusk);
    G.beaver = open && ((doy > 105 && doy < 320 && (crep > 0.3 || L.night > 0.6)) || this.forced.beaver > 0); // under the ice all winter
    this.frozen = !open;
    G.moose = (open && doy >= 140 && doy <= 300 && crep > 0.4) || this.forced.moose > 0;
    G.eagle = open && doy > 90 && doy < 330 && L.elev > -3;
    G.eaglePair = G.eagle && doy > 110 && doy < 230;
    G.gull = s.ice < 0.3 && doy > 100 && doy < 300;
    G.gullFly = L.elev > -4; // after dark the gulls sit on their rock
    G.fish = this.forced.fish > 0 ? 1 : open && s.waterTemp > 7 ? (L.dusk + 0.3 * L.dawn + 0.02 * L.day) * (1 - 0.8 * L.night * (1 - L.dusk)) : 0;
    G.insects = (doy >= 155 && doy <= 240 && L.elev > 12 && s.cold < 0.45 && open) || this.forced.insects > 0;
    G.raven = s.ice >= 0.5 && L.elev > -2;
    this.beavers.update(dt, G.beaver);
    this.moose.update(dt, G.moose);
    this.birds.update(dt, G);
    this.fish.update(dt, G.fish);
    this.insects.update(dt, G.insects);
  }

  // Debug: summon an animal near the player, in front of the camera, ignoring the hour and the season for a
  // couple of minutes ('none' ends that). Kinds: 'moose', 'beaver' (and its lodge), 'lodge', 'eagle' (soaring),
  // 'eagle-perch', 'eagle-swoop', 'gulls', 'raven', 'raven-ice', 'fish' (a dusk rise), 'fish-jump', 'insects',
  // and 'loon-pair', 'loon-chick', 'loon-dive', 'loon-run', 'loon-flap', 'loon-call' (passed to the loons).
  // Takes effect at once once a frame has run, so a screenshot can follow after a few steps.
  force(kind = 'moose') {
    if (kind === 'none') { for (const k in this.forced) this.forced[k] = 0; for (const m of this.moose.list) m.calm = 0; return 'back to the season and the hour'; }
    if (kind.startsWith('loon')) return this.loons ? this.loons.force(kind.split('-')[1] || 'pair') : 'no loons';
    if (!this.player) return 'run a frame first';
    if (kind === 'moose') { this.forced.moose = 180; return this.moose.spawn(true); }
    if (kind === 'beaver' || kind === 'lodge') { this.forced.beaver = 180; return this.beavers.force(kind === 'beaver'); }
    if (kind === 'fish') { this.forced.fish = 90; return 'rising'; }
    if (kind === 'fish-jump') { this.forced.fish = 30; return this.fish.jumpInView(); }
    if (kind === 'insects') { this.forced.insects = 180; this.insects.anchorT = 0; return 'insects'; }
    return this.birds.force(kind);
  }

  // what is out, and what it costs this frame: instanced draws (one per part with any instance) and triangles
  get stats() {
    let calls = 0, tris = 0;
    const count = (p) => { if (p.n) { calls++; tris += p.n * p.triangles; } };
    for (const s of [this.beavers, this.moose, this.fish, this.insects]) for (const p of s.pools) count(p);
    for (const k in this.birds.parts) for (const p in this.birds.parts[k]) count(this.birds.parts[k][p]);
    if (this.loons) for (const k in this.loons.parts) count(this.loons.parts[k]);
    return { calls, tris, birds: this.birds.active, moose: this.moose.list.filter((m) => m.alive).map((m) => m.state), beaver: this.beavers.list.map((b) => b.state), lodges: this.beavers.near.length };
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Beavers. Lodges are found per 800 m cell of the map: a cell's own seed decides whether beavers live there and
// picks among its candidate spots the most sheltered shallow water with a soft bank (so the same bay has the
// same lodge every visit); the two lodges nearest the player are drawn. Each has a beaver that comes out at
// dawn and dusk (and through the night), swims the shore with a V of rings off its head, feeds, and slaps its
// tail and dives when you come close.

class Beavers {
  constructor(f, scene, mats) {
    this.f = f;
    const m = beaverModels();
    this.lodge = new Parts(scene, lodgeModel(), mats.solid, 2, { shadow: true, name: 'beaver lodge' });
    this.body = new Parts(scene, m.body, mats.float, 2, { name: 'beaver' });
    this.tail = new Parts(scene, m.tail, mats.float, 2, { name: 'beaver tail' });
    this.pools = [this.lodge, this.body, this.tail];
    this.cells = new Map();
    this.near = [];
    this.list = [0, 1].map((i) => ({ i, lodge: null, state: 'home', t: 0, wait: 10, x: 0, z: 0, heading: 0, speed: 0, y: -0.4, pitch: 0, tail: 0, tx: 0, tz: 0, legs: 0, wake: 0, cool: 0, under: 0, slapped: false }));
    this.scanT = 0;
  }

  // the cell's lodge: { x, z, yaw, level } or null (none here) or undefined (its tiles are not in yet)
  evaluate(ci, cj, forced = false) {
    const w = this.f.world, rng = mulberry32((hash2(ci, cj, 41) * 4294967296) >>> 0);
    if (!forced && rng() > 0.6) return null;
    const cands = [];
    for (let k = 0; k < 40; k++) {
      const x = w.originX + (ci + rng()) * LODGE_CELL, z = w.originZ + (cj + rng()) * LODGE_CELL;
      if (!w.isReady(x, z)) { if (!forced) return undefined; continue; }
      const s = w.shoreAt(x, z);
      if (s > -2 || s < -8) continue;
      const dep = w.levelAt(x, z) - w.heightAt(x, z);
      if (dep < 0.3 || dep > 2.2) continue;
      const sh = shelterAt(w, x, z, 8, 60);
      if (sh < (forced ? 0.25 : 0.5)) continue;
      cands.push({ x, z, score: sh + rng() * 0.2 });
    }
    cands.sort((a, b) => b.score - a.score);
    for (const c of cands) {
      // not by a campsite, a landing or a portage
      if (w.campsites.some((p) => Math.abs(p.x - c.x) < 120 && Math.abs(p.z - c.z) < 120)) continue;
      if (w.entryPoints.some((p) => Math.abs(p.x - c.x) < 200 && Math.abs(p.z - c.z) < 200)) continue;
      if (w.portages.some((p) => p.bbox && c.x > p.bbox[0] - 80 && c.x < p.bbox[2] + 80 && c.z > p.bbox[1] - 80 && c.z < p.bbox[3] + 80)) continue;
      // against the bank: walk in until the shore is a metre off
      let x = c.x, z = c.z;
      deeper(w, x, z, _d);
      for (let i = 0; i < 40 && w.shoreAt(x, z) < -1.2; i++) { x -= _d.x * 0.5; z -= _d.z * 0.5; }
      deeper(w, x, z, _d);
      return { x, z, yaw: headingOf(_d.x, _d.z), level: w.levelAt(x, z), key: `${ci},${cj}` };
    }
    return null;
  }

  scan() {
    const f = this.f, w = f.world;
    const ci = Math.floor((f.px - w.originX) / LODGE_CELL), cj = Math.floor((f.pz - w.originZ) / LODGE_CELL);
    // one new cell a scan, the player's first
    for (let r = 0; r <= 1; r++) for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
      if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
      const key = (ci + di) * 100000 + (cj + dj);
      if (this.cells.has(key)) continue;
      const v = this.evaluate(ci + di, cj + dj);
      if (v !== undefined) { this.cells.set(key, v); if (this.cells.size > 200) this.cells.delete(this.cells.keys().next().value); }
      r = 2; break;
    }
    this.pickNear();
  }
  pickNear() {
    const f = this.f;
    this.near.length = 0;
    for (const v of this.cells.values()) if (v && Math.hypot(v.x - f.px, v.z - f.pz) < 1100) this.near.push(v);
    this.near.sort((a, b) => Math.hypot(a.x - f.px, a.z - f.pz) - Math.hypot(b.x - f.px, b.z - f.pz));
    if (this.near.length > 2) this.near.length = 2;
  }

  // a waypoint along the shore near the lodge, into _spot
  waypoint(b, home = false) {
    const f = this.f, w = f.world, L = b.lodge;
    if (home) { _spot.x = L.x + Math.cos(L.yaw) * 2.8; _spot.z = L.z - Math.sin(L.yaw) * 2.8; return true; }
    for (let k = 0; k < 20; k++) {
      const a = f.rng() * 6.28, d = 20 + f.rng() * 110, x = L.x + Math.cos(a) * d, z = L.z + Math.sin(a) * d, s = w.shoreAt(x, z);
      if (s < -16 || s > -2.5 || !w.isReady(x, z) || !waterRun(w, b.x, b.z, x, z, 1)) continue;
      _spot.x = x; _spot.z = z; return true;
    }
    return false;
  }

  force(swim) {
    const f = this.f, w = f.world;
    let L = this.near[0];
    if (!L || Math.hypot(L.x - f.px, L.z - f.pz) > 500) {
      // the nearest workable bay, the cell lottery aside
      const ci = Math.floor((f.px - w.originX) / LODGE_CELL), cj = Math.floor((f.pz - w.originZ) / LODGE_CELL);
      let best = null;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        const v = this.evaluate(ci + di, cj + dj, true);
        if (v && (!best || Math.hypot(v.x - f.px, v.z - f.pz) < Math.hypot(best.x - f.px, best.z - f.pz))) best = v;
      }
      if (!best) return 'no bay found';
      this.cells.set((Math.floor((best.x - w.originX) / LODGE_CELL)) * 100000 + Math.floor((best.z - w.originZ) / LODGE_CELL), best);
      this.pickNear();
      L = this.near[0];
    }
    const b = this.list.find((q) => q.lodge === L) || this.list[0];
    b.lodge = L;
    if (swim) {
      // out of the lodge already, swimming along in front of it
      b.state = 'swim'; b.t = 0; b.y = 0; b.cool = 20;
      b.x = L.x + Math.cos(L.yaw) * 6; b.z = L.z - Math.sin(L.yaw) * 6;
      if (this.waypoint(b)) { b.tx = _spot.x; b.tz = _spot.z; } else { b.tx = b.x + 30; b.tz = b.z; }
      b.heading = headingOf(b.tx - b.x, b.tz - b.z); b.legs = 4;
    }
    return { x: L.x, z: L.z, yaw: L.yaw };
  }

  update(dt, active) {
    const f = this.f, w = f.world, P = f.player;
    for (const p of this.pools) p.begin();
    this.scanT -= dt;
    if (this.scanT <= 0) { this.scanT = 1.5; this.scan(); }
    for (const L of this.near) if (Math.hypot(L.x - f.cx, L.z - f.cz) < 1200) this.lodge.push(frameMatrix(_m, L.x, L.level, L.z, L.yaw));
    // each beaver keeps its lodge while that lodge is among the near ones; a lodge left free goes to a beaver
    // without one
    const [b0, b1] = this.list, n0 = this.near[0] || null, n1 = this.near[1] || null;
    for (const b of this.list) if (b.lodge && b.lodge !== n0 && b.lodge !== n1) { b.lodge = null; b.state = 'home'; }
    for (const L of this.near) {
      if (b0.lodge === L || b1.lodge === L) continue;
      const b = !b0.lodge ? b0 : !b1.lodge ? b1 : null;
      if (b) { b.lodge = L; b.state = 'home'; b.wait = 5 + f.rng() * 40; }
    }
    for (const b of this.list) {
      const L = b.lodge;
      if (!L) continue;
      if (f.frozen) { b.state = 'home'; b.wait = 60; continue; } // the lake froze over: in the lodge till spring
      b.t += dt; b.cool -= dt;
      const dP = Math.hypot(b.x - P.x, b.z - P.z);
      const near = (f.afloat && dP < 28) || (!f.afloat && dP < 16 && w.shoreAt(P.x, P.z) < 8);
      if (b.state === 'home') {
        b.wait -= dt;
        if (active && b.wait <= 0 && Math.hypot(L.x - P.x, L.z - P.z) > 40) {
          // out through the underwater door on the lakeward side
          b.x = L.x + Math.cos(L.yaw) * 3.2; b.z = L.z - Math.sin(L.yaw) * 3.2; b.heading = L.yaw;
          b.state = 'surface'; b.t = 0; b.legs = 3 + ((f.rng() * 3) | 0); f.ring(b.x, b.z, 0.3, 1.5, 2.6);
          if (this.waypoint(b)) { b.tx = _spot.x; b.tz = _spot.z; } else { b.tx = b.x; b.tz = b.z; }
        }
        continue;
      }
      if ((b.state === 'swim' || b.state === 'feed') && near && b.cool <= 0) { b.state = 'slap'; b.t = 0; b.slapped = false; b.cool = 30; }
      if (b.state === 'surface') { b.y = -0.35 * (1 - smooth(0, 0.9, b.t)); if (b.t > 0.9) { b.state = 'swim'; b.t = 0; } }
      else if (b.state === 'swim') {
        const dx = b.tx - b.x, dz = b.tz - b.z, d = Math.hypot(dx, dz);
        b.heading = turnToward(b.heading, headingOf(dx, dz), dt * 1.2);
        b.speed += (0.65 - b.speed) * Math.min(1, dt);
        const fx = Math.cos(b.heading), fz = -Math.sin(b.heading), nx = b.x + fx * b.speed * dt, nz = b.z + fz * b.speed * dt;
        if (w.shoreAt(nx, nz) < -0.8 && f.clearOfPlayer(nx, nz, 3)) { b.x = nx; b.z = nz; } else b.heading += dt * 1.5;
        b.wake += b.speed * dt;
        if (d < 2) {
          if (b.legs <= 0 || !active) {
            if (Math.hypot(b.x - L.x, b.z - L.z) < 6) { b.state = 'home'; b.wait = active ? 60 + f.rng() * 120 : 600; f.ring(b.x, b.z, 0.3, 1.4, 2.4); }
            else { this.waypoint(b, true); b.tx = _spot.x; b.tz = _spot.z; }
          } else { b.state = 'feed'; b.t = 0; b.feed = 8 + f.rng() * 18; b.legs--; }
        }
      } else if (b.state === 'feed') {
        // floating at the bank, chewing, drifting a little
        b.speed *= Math.max(0, 1 - dt * 2);
        b.heading += Math.sin(b.t * 0.4) * 0.15 * dt;
        if (b.t > b.feed) { b.state = 'swim'; b.t = 0; if (b.legs > 0 && active && this.waypoint(b)) { b.tx = _spot.x; b.tz = _spot.z; } else { this.waypoint(b, true); b.tx = _spot.x; b.tz = _spot.z; } }
      } else if (b.state === 'slap') {
        // nose down, tail up and over, and down on the water with a crack
        if (!b.slapped && b.t > 0.42) {
          b.slapped = true;
          const fx = Math.cos(b.heading), fz = -Math.sin(b.heading), tx = b.x - fx * 0.55, tz = b.z - fz * 0.55;
          f.splash(tx, tz, 1.0, 12); f.ring(tx, tz, 0.4, 2.6, 3.2);
          f.emit('beaver-slap', tx, f.levelAt(tx, tz), tz, 1);
        }
        if (b.t > 0.9) {
          b.state = 'under'; b.t = 0; b.under = 25 + f.rng() * 35;
          // home, or off along the shore away from you
          if (f.rng() < 0.6) this.waypoint(b, true); else if (!this.waypoint(b)) this.waypoint(b, true);
          b.tx = _spot.x; b.tz = _spot.z;
        }
      } else if (b.state === 'under') {
        const k = Math.min(1, dt / Math.max(0.5, b.under - b.t));
        b.x += (b.tx - b.x) * k; b.z += (b.tz - b.z) * k;
        if (b.t > b.under) {
          if (!active || Math.hypot(b.x - L.x, b.z - L.z) < 6 || Math.hypot(b.x - P.x, b.z - P.z) < 30) { b.state = 'home'; b.wait = 40 + f.rng() * 80; }
          else { b.state = 'surface'; b.t = 0; f.ring(b.x, b.z, 0.3, 1.4, 2.4); if (this.waypoint(b)) { b.tx = _spot.x; b.tz = _spot.z; } }
        }
      }
      if (b.state === 'under' || b.state === 'home') continue;
      // the pose: head up, the back awash; the slap tips it nose down and throws the tail over
      let pitch = 0.02 * Math.sin(b.t * 2.1), tail = 0.05 * Math.sin(b.t * 3), y = b.state === 'surface' ? b.y : 0;
      if (b.state === 'slap') {
        const t = b.t;
        pitch = -0.7 * smooth(0, 0.45, t); y = -0.25 * smooth(0.2, 0.9, t);
        tail = t < 0.32 ? 1.6 * smooth(0, 0.32, t) : 1.6 - 1.9 * smooth(0.32, 0.45, t);
      } else if (b.state === 'feed') pitch = 0.08 + 0.04 * Math.sin(b.t * 7);
      if (Math.hypot(b.x - f.cx, b.z - f.cz) > 500) continue;
      const lv = f.levelAt(b.x, b.z);
      frameMatrix(_m, b.x, lv + y + 0.025, b.z, b.heading, pitch);
      this.body.push(_m);
      this.tail.push(partMatrix(_h, _m, -0.33, -0.1, 0, 0, 0, tail, 'XYZ'));
      // the V: rings off the nose, spreading back
      if (b.wake > 0.22 && b.state === 'swim' && Math.hypot(b.x - f.cx, b.z - f.cz) < 200 && f.ripples) {
        b.wake = 0;
        const fx = Math.cos(b.heading), fz = -Math.sin(b.heading), sx = -fz, sz = fx, nx = b.x + fx * 0.36, nz = b.z + fz * 0.36;
        for (let sg = -1; sg <= 1; sg += 2) {
          f.ripples.spawn(3, nx + sx * sg * 0.08, lv, nz + sz * sg * 0.08, 0.16, 0.9, 4.2, sx * sg * 0.2 - fx * 0.03, 0, sz * sg * 0.2 - fz * 0.03);
          f.ripples.spawn(3, nx + sx * sg * 0.14, lv, nz + sz * sg * 0.14, 0.1, 0.55, 3.0, sx * sg * 0.12 - fx * 0.05, 0, sz * sg * 0.12 - fz * 0.05);
        }
      }
    }
    for (const p of this.pools) p.end();
  }
}

// ---------------------------------------------------------------------------------------------------------------
// The moose. Rare: about one sighting an hour of play. In the hours round sunrise and sunset from June to
// October a countdown runs, and when it ends a moose (a cow, a bull, or in summer a cow with her calf) is put at
// a shore or standing in the shallows 70-220 m off, in view. It feeds head down in the water, lifts its head
// streaming and chews, wades a few steps; when you come close it lifts its head, watches you, and walks off
// into the trees, wading out first.

class Moose {
  constructor(f, scene, mats) {
    this.f = f;
    const m = mooseModels();
    this.body = new Parts(scene, m.body, mats.solid, 2, { shadow: true, name: 'moose' });
    this.bull = new Parts(scene, m.bull, mats.solid, 1, { shadow: true, name: 'moose head' });
    this.cow = new Parts(scene, m.cow, mats.solid, 2, { shadow: true, name: 'moose head' });
    this.legs = new Parts(scene, m.leg, mats.solid, 8, { shadow: true, name: 'moose legs' });
    this.pools = [this.body, this.bull, this.cow, this.legs];
    this.list = [0, 1].map((i) => ({ i, alive: false, bull: false, scale: 1, state: 'feed', t: 0, x: 0, z: 0, heading: 0, speed: 0, head: -0.9, headYaw: 0, phase: 0, hold: 5, tx: 0, tz: 0, calm: 0, waded: 0, grunt: 30 }));
    this.next = 300 + f.rng() * 600; // seconds of moose hours until the next one
  }

  // a spot for a moose: standing in shallow water by the shore (most often) or at the shore's edge, into _spot
  findSpot(near, far, inView) {
    const f = this.f, w = f.world;
    for (let k = 0; k < 160; k++) {
      let a = f.rng() * 6.28;
      if (inView || k < 100) a = Math.atan2(f.view.z, f.view.x) + (f.rng() - 0.5) * 1.5;
      const d = near + f.rng() * (far - near), x = f.cx + Math.cos(a) * d, z = f.cz + Math.sin(a) * d;
      if (!w.isReady(x, z) || !f.clearOfPlayer(x, z, near * 0.8)) continue;
      const s = w.shoreAt(x, z), wet = inView || f.rng() < 0.75; // a summoned moose stands in the water
      if (wet) { if (s < -6 || s > -1) continue; const dep = depthAt(w, x, z); if (dep < 0.25 || dep > 0.85) continue; }
      else if (s < 0.5 || s > 4) continue;
      // a way out into the woods behind it
      deeper(w, x, z, _d);
      if (w.shoreAt(x - _d.x * 30, z - _d.z * 30) < 12) continue;
      if (w.campsites.some((p) => Math.abs(p.x - x) < 100 && Math.abs(p.z - z) < 100)) continue;
      _spot.x = x; _spot.z = z;
      return true;
    }
    return false;
  }

  spawn(forced = false) {
    const f = this.f;
    if (!this.findSpot(forced ? 45 : 70, forced ? 120 : 220, forced)) return 'no shore found';
    const season = f.dayDoy || 200;
    const calfSeason = season > 150 && season < 245, r = f.rng();
    const cowCalf = calfSeason && r < 0.4, bull = !cowCalf && r < (season >= 245 ? 0.7 : 0.55);
    const [a, b] = this.list, w = f.world;
    deeper(w, _spot.x, _spot.z, _d);
    Object.assign(a, { alive: true, bull, scale: bull ? 1.04 : 0.94, state: 'feed', t: 0, x: _spot.x, z: _spot.z, heading: headingOf(-_d.z, _d.x) + (f.rng() - 0.5) * 1.2, speed: 0, head: -0.9, hold: 4 + f.rng() * 5, calm: forced ? 150 : 0, grunt: 10 + f.rng() * 40 });
    if (!forced) {
      // it steps out of the trees: starts in the woods behind the spot and walks down to the water
      let x = _spot.x, z = _spot.z;
      for (let i = 0; i < 30 && w.shoreAt(x, z) < 14; i++) { x -= _d.x; z -= _d.z; }
      a.tx = a.x; a.tz = a.z; a.x = x; a.z = z; a.state = 'arrive'; a.heading = headingOf(a.tx - x, a.tz - z); a.head = -0.25;
    }
    b.alive = false;
    if (cowCalf) {
      const hx = Math.cos(a.heading), hz = -Math.sin(a.heading);
      Object.assign(b, { alive: true, bull: false, scale: 0.56, state: 'feed', t: 0, x: a.x - hx * 3 + hz * 1.5, z: a.z - hz * 3 - hx * 1.5, heading: a.heading + 0.4, speed: 0, head: -0.3, hold: 3, calm: a.calm });
      if (w.shoreAt(b.x, b.z) < -5) { b.x = a.x; b.z = a.z; }
    }
    return { x: _spot.x, z: _spot.z, bull, calf: cowCalf };
  }

  update(dt, active) {
    const f = this.f, w = f.world, P = f.player;
    for (const p of this.pools) p.begin();
    const [cow] = this.list;
    if (!cow.alive && active) {
      this.next -= dt;
      if (this.next <= 0) { const r = this.spawn(false); this.next = typeof r === 'string' ? 20 : 900 + f.rng() * 900; }
    }
    for (const m of this.list) {
      if (!m.alive) continue;
      const lead = m.i === 1 ? this.list[0] : null;
      m.t += dt; m.calm -= dt;
      const dP = Math.hypot(m.x - P.x, m.z - P.z), dC = Math.hypot(m.x - f.cx, m.z - f.cz);
      // spooked: the canoe within 55 m (80 m coming fast), a walker within 35; the hour over
      const close = (f.afloat && (dP < 55 || (dP < 80 && P.speed > 1.2))) || (!f.afloat && dP < 35);
      if (!lead && m.calm <= 0 && (m.state === 'feed' || m.state === 'chew' || m.state === 'wade' || m.state === 'arrive') && (close || !active)) {
        m.state = close ? 'alert' : 'leave'; m.t = 0; m.hold = 2 + f.rng() * 3;
        if (m.bull && close && f.rng() < 0.6) f.emit('moose-grunt', m.x, w.heightAt(m.x, m.z) + 1.6, m.z, 1.2);
      }
      if (lead) { if ((lead.state === 'alert' || lead.state === 'leave') && m.state !== lead.state) { m.state = lead.state; m.t = 0; } if (!lead.alive) m.alive = false; }
      let speed = 0, headWant = -0.2, yawWant = 0;
      if (m.state === 'arrive') {
        speed = 0.8; headWant = -0.25;
        if (Math.hypot(m.tx - m.x, m.tz - m.z) < 0.8 || m.t > 90) { m.state = 'feed'; m.t = 0; m.hold = 4 + f.rng() * 5; }
      } else if (m.state === 'feed') {
        headWant = -1.05;
        if (m.t > m.hold) {
          m.state = 'chew'; m.t = 0; m.hold = 3 + f.rng() * 5;
          // the head comes up out of the water streaming
          if (depthAt(w, m.x, m.z) > 0.2) { const hx = Math.cos(m.heading), hz = -Math.sin(m.heading), mx = m.x + hx * 1.9 * m.scale, mz = m.z + hz * 1.9 * m.scale; f.splash(mx, mz, 0.35, 6); f.emit('moose-wade', mx, f.levelAt(mx, mz), mz, 0.6); }
        }
      } else if (m.state === 'chew') {
        headWant = -0.12 + 0.03 * Math.sin(m.t * 5);
        yawWant = 0.3 * Math.sin(m.t * 0.5 + m.i);
        if (m.t > m.hold) {
          if (f.rng() < 0.45) {
            // a few steps along the shallows
            const a = m.heading + (f.rng() - 0.5) * 1.6, d = 4 + f.rng() * 8, tx = m.x + Math.cos(a) * d, tz = m.z - Math.sin(a) * d, s = w.shoreAt(tx, tz);
            if (s > -5 && s < 3 && depthAt(w, tx, tz) < 0.85) { m.state = 'wade'; m.t = 0; m.tx = tx; m.tz = tz; } else { m.state = 'feed'; m.t = 0; m.hold = 5 + f.rng() * 6; }
          } else { m.state = 'feed'; m.t = 0; m.hold = 5 + f.rng() * 6; }
        }
      } else if (m.state === 'wade') {
        speed = 0.45; headWant = -0.35;
        if (Math.hypot(m.tx - m.x, m.tz - m.z) < 0.6 || m.t > 30) { m.state = 'feed'; m.t = 0; m.hold = 5 + f.rng() * 6; }
      } else if (m.state === 'alert') {
        headWant = 0.12; yawWant = clamp(wrapAngle(headingOf(P.x - m.x, P.z - m.z) - m.heading), -0.8, 0.8);
        if (m.t > m.hold || dP < 25) {
          m.state = 'leave'; m.t = 0;
          if (f.rng() < 0.4) f.emit('moose-grunt', m.x, w.heightAt(m.x, m.z) + 1.6, m.z, m.bull ? 1.2 : 0.8);
        }
      } else if (m.state === 'leave') {
        // up the shore and into the trees, away from you
        speed = dP < 30 ? 1.8 : 1.15; headWant = -0.25;
        deeper(w, m.x, m.z, _d);
        const awayX = m.x - P.x, awayZ = m.z - P.z, al = Math.hypot(awayX, awayZ) || 1;
        m.tx = m.x - _d.x * 10 + (awayX / al) * 4; m.tz = m.z - _d.z * 10 + (awayZ / al) * 4;
        if (w.shoreAt(m.x, m.z) > 40 || dP > 450 || (w.shoreAt(m.x, m.z) > 20 && dC > 120)) { m.alive = false; continue; }
      }
      if (lead && m.state !== 'leave' && m.state !== 'alert') {
        // the calf keeps near its mother
        const dx = lead.x - m.x, dz = lead.z - m.z, d = Math.hypot(dx, dz);
        if (d > 4.5) { speed = Math.min(1.4, (d - 3) * 0.5); m.tx = lead.x; m.tz = lead.z; }
      }
      if (speed > 0) {
        const want = headingOf(m.tx - m.x, m.tz - m.z);
        m.heading = turnToward(m.heading, want, dt * 0.9);
        // steer round trunks on land
        if (w.shoreAt(m.x, m.z) > 0 && w.tiles && (m.t % 0.5) < dt) {
          const fx = Math.cos(m.heading), fz = -Math.sin(m.heading), trees = w.tiles.treesNear(m.x + fx * 2.5, m.z + fz * 2.5, 1.2);
          if (trees.length) m.heading += 0.6 * (m.i ? -1 : 1);
        }
      }
      m.speed += (speed - m.speed) * Math.min(1, dt * 1.5);
      if (m.speed > 0.01) {
        const fx = Math.cos(m.heading), fz = -Math.sin(m.heading), nx = m.x + fx * m.speed * dt, nz = m.z + fz * m.speed * dt;
        // in the water only where it can wade
        if ((w.shoreAt(nx, nz) > -1 || depthAt(w, nx, nz) < 0.95) && f.clearOfPlayer(nx, nz, 4)) { m.x = nx; m.z = nz; }
        m.phase += (m.speed * dt) / (1.7 * m.scale);
        // wading: rings round the legs and the slosh
        if (depthAt(w, m.x, m.z) > 0.12) {
          m.waded += m.speed * dt;
          if (m.waded > 0.8) { m.waded = 0; f.ring(m.x + fx * 0.6, m.z + fz * 0.6, 0.3, 1.8, 2.6); f.ring(m.x - fx * 0.8, m.z - fz * 0.8, 0.3, 1.5, 2.4); f.emit('moose-wade', m.x, f.levelAt(m.x, m.z), m.z, m.scale); }
        }
      }
      m.head += (headWant - m.head) * Math.min(1, dt * 1.6);
      m.headYaw += (yawWant - m.headYaw) * Math.min(1, dt * 1.6);
      if (m.bull) { m.grunt -= dt; if (m.grunt <= 0) { m.grunt = 40 + f.rng() * 80; if ((f.dayDoy || 0) >= 245) f.emit('moose-grunt', m.x, w.heightAt(m.x, m.z) + 1.6, m.z, 1.2); } }
      if (dC > 900) continue;
      // the pose: feet on the ground or the bed, the body following the slope
      const s = m.scale, fx = Math.cos(m.heading), fz = -Math.sin(m.heading);
      const hf = w.heightAt(m.x + fx * 0.8 * s, m.z + fz * 0.8 * s), hb = w.heightAt(m.x - fx * 0.9 * s, m.z - fz * 0.9 * s);
      const pitch = Math.atan2(hf - hb, 1.7 * s) * 0.8, y = Math.min(hf, hb) + Math.abs(hf - hb) * 0.35 + 0.02 * Math.abs(Math.sin(m.phase * Math.PI * 2)) * (m.speed > 0.1 ? 1 : 0);
      frameMatrix(_m, m.x, y, m.z, m.heading, pitch, 0, s);
      this.body.push(_m);
      (m.bull ? this.bull : this.cow).push(partMatrix(_h, _m, MOOSE.neck[0], MOOSE.neck[1], 0, 0, m.headYaw, m.head, 'YZX'));
      // a lateral walk: left hind, left fore, right hind, right fore
      const amp = Math.min(1, m.speed / 0.4) * 0.32;
      for (let k = 0; k < 4; k++) {
        const L = MOOSE.legs[k], sw = Math.sin((m.phase + GAIT[k]) * Math.PI * 2) * amp;
        this.legs.push(partMatrix(_l, _m, L[0], L[1], L[2], 0, 0, sw, 'XYZ'));
      }
    }
    for (const p of this.pools) p.end();
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Fish rising: rings on calm water at dusk (a few at dawn, the odd one by day), more in the sheltered bays and
// near the shore than out in the open, now and then a second ring after the first, and the odd jump.

class Fish {
  constructor(f, scene, mats) {
    this.f = f;
    this.parts = new Parts(scene, fishModel(), mats.solid, 2, { name: 'fish', reflect: false });
    this.pools = [this.parts];
    this.rings = new RiseRings(f.water);
    scene.add(this.rings.mesh);
    this.acc = 0;
    this.later = Array.from({ length: 8 }, () => ({ t: -1, x: 0, z: 0 }));
    this.jumps = [0, 1].map(() => ({ t: -1, x: 0, z: 0, dx: 0, dz: 0, h: 0.6, len: 1.2, dur: 0.7 }));
  }

  // a spot for a rise, into _spot: weighted to quiet water near the shore
  spot() {
    const f = this.f, w = f.world, rng = f.rng;
    for (let k = 0; k < 6; k++) {
      let a = rng() * 6.28;
      if (rng() < 0.7) a = Math.atan2(f.view.z, f.view.x) + (rng() - 0.5) * 2;
      const d = 8 + rng() ** 1.5 * 90, x = f.cx + Math.cos(a) * d, z = f.cz + Math.sin(a) * d;
      if (!w.isReady(x, z)) continue;
      const s = w.shoreAt(x, z);
      if (s > -2.5 || !f.clearOfPlayer(x, z, 4)) continue;
      const nearShore = 1 - smooth(8, 70, -s), sh = shelterAt(w, x, z, 4, 50);
      if (rng() > 0.25 + 0.75 * (0.55 * sh + 0.45 * nearShore)) continue;
      _spot.x = x; _spot.z = z;
      return true;
    }
    return false;
  }

  rise(x, z) {
    const f = this.f;
    // the ring (with its fainter twin inside), and now and then another after it, a fish taking twice
    this.rings.spawn(x, f.levelAt(x, z), z, 2.4 + f.rng() * 1.6, 3.6 + f.rng() * 1.2);
    if (f.ripples && f.rng() < 0.5) { const y = f.levelAt(x, z); f.ripples.spawn(1, x, y, z, 0.035, 0.015, 0.35, (f.rng() - 0.5) * 0.3, 0.6, (f.rng() - 0.5) * 0.3); }
    if (f.rng() < 0.45) for (const l of this.later) if (l.t < 0) { l.t = 0.3 + f.rng() * 0.5; l.x = x; l.z = z; break; }
    if (Math.hypot(x - f.cx, z - f.cz) < 90) f.emit('fish-rise', x, f.levelAt(x, z), z, 0.3);
  }

  jump(x, z) {
    const f = this.f;
    for (const j of this.jumps) if (j.t < 0) {
      const a = f.rng() * 6.28;
      Object.assign(j, { t: 0, x, z, dx: Math.cos(a), dz: Math.sin(a), h: 0.4 + f.rng() * 0.5, len: 0.8 + f.rng() * 0.8, dur: 0.6 + f.rng() * 0.2, y: f.levelAt(x, z) });
      f.splash(x, z, 0.4, 5);
      return j;
    }
    return null;
  }
  jumpInView() {
    const f = this.f, w = f.world;
    for (let k = 0; k < 40; k++) {
      const d = 14 + f.rng() * 16, a = Math.atan2(f.view.z, f.view.x) + (f.rng() - 0.5) * 0.6, x = f.cx + Math.cos(a) * d, z = f.cz + Math.sin(a) * d;
      if (w.shoreAt(x, z) < -3) { const j = this.jump(x, z); return j ? { x, z } : 'busy'; }
    }
    return 'no water in view';
  }

  update(dt, rate) {
    const f = this.f, wind = f.water && f.water.wind ? f.water.wind.speed : 2;
    this.parts.begin();
    // calm water only: gone by a moderate breeze
    const calm = 1 - smooth(1.5, 5, wind);
    this.acc += dt * rate * calm * 2.4;
    while (this.acc > 0) {
      this.acc -= 0.5 + f.rng();
      if (!this.spot()) continue;
      if (f.rng() < 0.06) this.jump(_spot.x, _spot.z); else this.rise(_spot.x, _spot.z);
    }
    for (const l of this.later) if (l.t >= 0) { l.t -= dt; if (l.t < 0) this.rings.spawn(l.x, f.levelAt(l.x, l.z), l.z, 1.6 + f.rng(), 3.2); }
    this.rings.update(dt);
    for (const j of this.jumps) {
      if (j.t < 0) continue;
      j.t += dt;
      const u = j.t / j.dur;
      if (u >= 1) { j.t = -1; const ex = j.x + j.dx * j.len, ez = j.z + j.dz * j.len; f.splash(ex, ez, 0.45, 6); this.rings.spawn(ex, j.y, ez, 3.2, 4.2); f.emit('splash', ex, j.y, ez, 0.35); continue; }
      const x = j.x + j.dx * j.len * u, z = j.z + j.dz * j.len * u, y = j.y + 4 * j.h * u * (1 - u) - 0.1;
      const pitch = Math.atan2(4 * j.h * (1 - 2 * u), j.len) * 0.9;
      this.parts.push(frameMatrix(_m, x, y, z, headingOf(j.dx, j.dz), pitch, 0.4 * Math.sin(u * 9)));
    }
    this.parts.end();
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Dragonflies and damselflies over the reeds and the lily pads on summer days, round the camera only. Each
// keeps to a plant (the aquatic instances the tile drew there, else the shallows along the shore), hovers,
// darts a metre or two, hovers again; the damselflies lower and slower, resting on a reed now and then.

class Insects {
  constructor(f, scene, mats) {
    this.f = f;
    const m = insectModels();
    this.dragon = new Parts(scene, m.dragon, mats.solid, 10, { name: 'dragonflies', reflect: false });
    this.damsel = new Parts(scene, m.damsel, mats.solid, 8, { name: 'damselflies', reflect: false });
    this.pools = [this.dragon, this.damsel];
    this.list = Array.from({ length: 18 }, (_, i) => ({ i, damsel: i >= 10, alive: false, anchor: 0, x: 0, y: 0, z: 0, ax: 0, ay: 0, az: 0, sx: 0, sy: 0, sz: 0, tx: 0, ty: 0, tz: 0, t: 0, dur: 1, darting: false, heading: 0 }));
    this.anchors = Array.from({ length: 24 }, () => ({ x: 0, y: 0, z: 0 }));
    this.nAnchors = 0;
    this.anchorT = 0;
  }

  // the reeds and the pads near the camera: the aquatic instances the tiles drew (their bins carry no species
  // and draw after the water), else shallow water along the nearest shore
  findAnchors() {
    const f = this.f, w = f.world, tm = w.tiles;
    let n = 0;
    if (tm) {
      const [tx, ty] = w.tileOf(f.cx, f.cz), e = tm.tiles.get(tm.key(tx, ty));
      if (e && e.state === 'ready' && e.veg) for (const m of e.veg) {
        if (m.userData.sp !== undefined || m.renderOrder !== 11 || !m.instanceMatrix) continue;
        const a = m.instanceMatrix.array, cnt = m.count;
        for (let i = 0; i < cnt && n < this.anchors.length; i += 1) {
          const x = a[i * 16 + 12] + e.ox, z = a[i * 16 + 14] + e.oz;
          if (Math.abs(x - f.cx) > 30 || Math.abs(z - f.cz) > 30) continue;
          const an = this.anchors[n++]; an.x = x; an.y = a[i * 16 + 13]; an.z = z;
          i += 3; // spread along the stand rather than all on one clump
        }
      }
    }
    for (let k = 0; k < 40 && n < 8; k++) {
      const a = f.rng() * 6.28, d = 4 + f.rng() * 26, x = f.cx + Math.cos(a) * d, z = f.cz + Math.sin(a) * d, s = w.shoreAt(x, z);
      if (s < -10 || s > -0.5 || !w.isReady(x, z)) continue;
      const an = this.anchors[n++]; an.x = x; an.y = f.levelAt(x, z); an.z = z;
    }
    this.nAnchors = n;
  }

  pick(b, dart) {
    const f = this.f, A = this.anchors[b.anchor], r = b.damsel ? 0.7 : 2.2, rng = f.rng;
    b.sx = b.x; b.sy = b.y; b.sz = b.z;
    b.tx = A.x + (rng() - 0.5) * r * 2; b.tz = A.z + (rng() - 0.5) * r * 2;
    b.ty = A.y + (b.damsel ? 0.15 + rng() * 0.45 : 0.4 + rng() * 1.0);
    // not into the canoe or the paddler
    const P = f.player;
    if (Math.hypot(b.tx - P.x, b.tz - P.z) < 1.6) { b.tx += (b.tx - P.x) * 1.5; b.tz += (b.tz - P.z) * 1.5; b.ty += 0.5; }
    b.t = 0; b.darting = dart;
    b.dur = dart ? (b.damsel ? 0.35 + rng() * 0.4 : 0.12 + rng() * 0.25) : (b.damsel ? 0.8 + rng() * 3 : 0.3 + rng() * 1.6);
    if (dart) b.heading = turnToward(b.heading, headingOf(b.tx - b.x, b.tz - b.z), 3);
  }

  update(dt, active) {
    const f = this.f;
    this.dragon.begin(); this.damsel.begin();
    if (active) { this.anchorT -= dt; if (this.anchorT <= 0) { this.anchorT = 3; this.findAnchors(); } }
    for (const b of this.list) {
      if (!active || !this.nAnchors) { b.alive = false; continue; }
      if (!b.alive || Math.hypot(b.x - f.cx, b.z - f.cz) > 45) {
        b.alive = true; b.anchor = (f.rng() * this.nAnchors) | 0;
        const A = this.anchors[b.anchor];
        b.x = A.x; b.y = A.y + 0.6; b.z = A.z; b.heading = f.rng() * 6.28;
        this.pick(b, false);
      }
      b.t += dt;
      if (b.t >= b.dur) {
        if (!b.darting && f.rng() < 0.08) b.anchor = (f.rng() * this.nAnchors) | 0; // off to another plant
        if (b.darting) { b.sx = b.tx; b.sy = b.ty; b.sz = b.tz; b.t = 0; b.darting = false; b.dur = b.damsel ? 0.8 + f.rng() * 3 : 0.3 + f.rng() * 1.6; }
        else this.pick(b, true);
      }
      if (b.darting) {
        const u = smooth(0, 1, b.t / b.dur);
        b.x = b.sx + (b.tx - b.sx) * u; b.y = b.sy + (b.ty - b.sy) * u; b.z = b.sz + (b.tz - b.sz) * u;
      } else {
        // a hover: tiny jitters on the spot
        b.x = b.sx + Math.sin(b.t * 13 + b.i) * 0.02; b.y = b.sy + Math.sin(b.t * 9 + b.i * 2) * 0.03; b.z = b.sz + Math.cos(b.t * 11 + b.i) * 0.02;
        b.heading += Math.sin(b.t * 2 + b.i) * dt * 0.6;
      }
      if (Math.hypot(b.x - f.cx, b.z - f.cz) > 40) continue;
      frameMatrix(_m, b.x, b.y, b.z, b.heading, b.darting ? -0.1 : 0.05, 0);
      (b.damsel ? this.damsel : this.dragon).push(_m);
    }
    this.dragon.end(); this.damsel.end();
  }
}
