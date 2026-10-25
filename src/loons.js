import * as THREE from 'three';
import { mulberry32 } from './rng.js';
import { loonModels } from './fauna-models.js';
import { makeFaunaMaterials, Parts, frameMatrix, partMatrix, deeper, waterRun, smooth, clamp, turnToward, headingOf, lightOf, emit } from './fauna-kit.js';

// Common loons. Six adults and two chicks live round the player: pairs on their territories from ice-out to
// August (a chick riding a parent's back in early July, swimming beside it later in the summer), loose rafts in
// September and October, the odd single all season. They swim low with a V of rings off the breast, look
// about, dip their heads to peer for fish, dive with a smooth forward arc and come up far off, now and then
// rear up and flap, or run flapping across the water. They call at dusk and through the night far more than by
// day, and answer each other: a wail answered by the mate's wail, a yodel by a rival's, a tremolo when the
// canoe comes close, when most of them dive. They keep off the canoe and off the shore, and leave the lakes when
// they freeze.
//
// Drawn as instanced parts (fauna-kit.js): the body, the head and neck, the two wings (only while flapping)
// and the chicks, each one call for all of them. main.js passes the frame's context as the fourth argument
// (`{ day, camera, ripples, audio }`); without it they still swim, dive and call, just with no wake and no clock.

const DIVE = 1.1, SURFACE = 0.9, FLAP = 3.4;
const NECK = [0.27, 0, 0];
const CALL = { wail: 'loon-wail', tremolo: 'loon-tremolo', yodel: 'loon-yodel' };
const _m = new THREE.Matrix4(), _h = new THREE.Matrix4(), _w = new THREE.Matrix4(), _c = new THREE.Matrix4();
const _d = { x: 0, z: 0 }, _spot = { x: 0, z: 0 };
const LIGHT = { dawn: 0, dusk: 0, elev: 30, day: 1, night: 0 };

export class Loons {
  constructor(world, water, scene, count = 6, audio = null, ripples = null, materials = null) {
    this.world = world; this.water = water; this.audio = audio; this.ripples = ripples;
    this.rng = mulberry32(21);
    const g = loonModels(), mats = materials || makeFaunaMaterials(water);
    this.materials = mats;
    this.parts = {
      body: new Parts(scene, g.body, mats.float, count, { name: 'loon body' }),
      head: new Parts(scene, g.head, mats.float, count, { name: 'loon head' }),
      wingR: new Parts(scene, g.wingR, mats.float, count, { name: 'loon wing' }),
      wingL: new Parts(scene, g.wingL, mats.float, count, { name: 'loon wing' }),
      chick: new Parts(scene, g.chick, mats.float, 2, { name: 'loon chick' }),
    };
    this.loons = Array.from({ length: count }, (_, i) => ({
      i, alive: false, x: 0, z: 0, level: 0, levelAt: { x: NaN, z: NaN }, heading: 0, speed: 0.35, state: 'swim', t: 0,
      y: 0, pitch: 0, lead: -1, ox: 0, oz: 0, male: i % 2 === 0, chick: -1,
      callT: 20 + this.rng() * 60, replyT: -1, replyKind: 'wail', replyDepth: 0,
      headYaw: 0, headTarget: 0, headT: 0, peer: 0, peerT: 10 + this.rng() * 30, fishT: 40 + this.rng() * 120, showT: 120 + this.rng() * 400,
      alarmCool: 0, wake: 0, tx: 0, tz: 0, run: 0, wanderT: 0,
    }));
    this.chicks = [0, 1].map((i) => ({ i, alive: false, parent: -1, ride: true, x: 0, z: 0, heading: 0, size: 1, bob: this.rng() * 6 }));
    this.forced = null; // a debug request (force()) waiting for the next update
    this.season = -1;   // the day the population was laid out for
  }

  // --- where they go ----------------------------------------------------------------------------------------
  // a water spot `near`..`far` m from (px, pz) at least `clear` m off the shore, into _spot; prefers ahead of `dir`
  findSpot(px, pz, near, far, clear, dir = null) {
    const w = this.world;
    for (let tries = 0; tries < 60; tries++) {
      let a = this.rng() * Math.PI * 2;
      if (dir && tries < 30) a = Math.atan2(dir.z, dir.x) + (this.rng() - 0.5) * 1.6;
      const d = near + this.rng() * (far - near), x = px + Math.cos(a) * d, z = pz + Math.sin(a) * d;
      if (w.inBounds(x, z, 60) && w.isReady(x, z) && w.shoreAt(x, z) < -clear) { _spot.x = x; _spot.z = z; return true; }
    }
    return false;
  }
  // a spot near (x, z) for a follower or a surfacing bird, into _spot
  nearSpot(x, z, near, far, clear, awayX = NaN, awayZ = NaN) {
    const w = this.world;
    for (let k = 0; k < 24; k++) {
      let a = this.rng() * Math.PI * 2;
      if (!Number.isNaN(awayX) && k < 16) a = Math.atan2(z - awayZ, x - awayX) + (this.rng() - 0.5) * 1.4;
      const d = near + this.rng() * (far - near), nx = x + Math.cos(a) * d, nz = z + Math.sin(a) * d;
      if (w.isReady(nx, nz) && w.shoreAt(nx, nz) < -clear && waterRun(w, x, z, nx, nz, 1)) { _spot.x = nx; _spot.z = nz; return true; }
    }
    return false;
  }

  // The year's arrangement: pairs in spring, pairs with chicks in summer, rafts in the fall, singles between.
  layout(doy) {
    const L = this.loons, C = this.chicks;
    for (const l of L) { l.alive = false; l.lead = -1; l.chick = -1; }
    for (const c of C) { c.alive = false; c.parent = -1; }
    const groups = doy >= 245 ? [3, 2, 1] : [2, 2, 1, 1];
    let k = 0;
    for (const size of groups) {
      if (k >= L.length) break;
      const leader = k;
      for (let j = 0; j < size && k < L.length; j++, k++) {
        const l = L[k];
        l.lead = j === 0 ? -1 : leader;
        const a = this.rng() * Math.PI * 2, d = 3 + this.rng() * (size > 2 ? 14 : 9);
        l.ox = Math.cos(a) * d; l.oz = Math.sin(a) * d;
      }
    }
    // chicks: hatched late June, riding a back for the first two weeks or so, then paddling alongside
    if (doy >= 176 && doy < 240) {
      const pairs = [0, 2];
      for (let c = 0; c < C.length; c++) {
        if (c === 1 && (doy < 186 || this.rng() < 0.4)) break;
        const parent = pairs[c] + (this.rng() < 0.5 ? 0 : 1);
        if (parent >= L.length) break;
        C[c].parent = parent; C[c].ride = doy < 198; C[c].size = clamp(0.8 + (doy - 176) / 60, 0.8, 1.6);
        L[parent].chick = c;
      }
    }
    this.season = doy;
  }

  // (Re)place a group round a fresh spot 150-450 m from the player (a pair with a chick in a quieter bay).
  spawnGroup(leader, px, pz, dir = null, near = 150, far = 450, clear = 0) {
    const L = this.loons, w = this.world, lead = L[leader];
    const quiet = L.some((l) => (l.i === leader || l.lead === leader) && l.chick >= 0);
    if (!this.findSpot(px, pz, near, far, clear || (quiet ? 18 : 25), dir)) return false;
    const sx = _spot.x, sz = _spot.z;
    for (const l of L) {
      if (l.i !== leader && l.lead !== leader) continue;
      let x = sx, z = sz;
      if (l.lead >= 0) { x += l.ox; z += l.oz; if (w.shoreAt(x, z) > -6) { x = sx + (this.rng() - 0.5) * 4; z = sz + (this.rng() - 0.5) * 4; } }
      Object.assign(l, { x, z, alive: true, state: 'swim', t: 0, y: 0, pitch: 0, speed: 0.3 + this.rng() * 0.15, heading: lead.heading || this.rng() * 6.28 });
      l.levelAt.x = NaN;
      if (l.chick >= 0) { const c = this.chicks[l.chick]; c.alive = true; c.x = x - 1.2; c.z = z; c.heading = l.heading; }
    }
    return true;
  }

  levelOf(l) {
    if (!(Math.abs(l.x - l.levelAt.x) < 8 && Math.abs(l.z - l.levelAt.z) < 8)) { l.level = this.world.levelAt(l.x, l.z); l.levelAt.x = l.x; l.levelAt.z = l.z; }
    return l.level;
  }

  // --- debug: summon a scene for a screenshot ---------------------------------------------------------------
  // 'pair' a pair 25 m ahead of the camera, 'chick' the same with a chick riding, 'dive' / 'run' / 'flap' the
  // nearest loon in view does it, 'call' it wails and the others answer.
  force(kind = 'pair') { this.forced = kind; return kind; }

  applyForce(player, camera) {
    const kind = this.forced; this.forced = null;
    const L = this.loons;
    let fx = Math.cos(player.heading), fz = -Math.sin(player.heading), ox = player.x, oz = player.z;
    if (camera) { camera.getWorldDirection(_v); const n = Math.hypot(_v.x, _v.z) || 1; fx = _v.x / n; fz = _v.z / n; ox = camera.position.x; oz = camera.position.z; }
    if (kind === 'pair' || kind === 'chick') {
      if (kind === 'chick' && this.chicks[0].parent < 0) { this.chicks[0].parent = 0; L[0].chick = 0; }
      if (kind === 'chick') { this.chicks[0].ride = true; this.chicks[0].size = 1; }
      L[1].lead = 0; L[1].ox = 3.5; L[1].oz = 2.5;
      _d.x = fx; _d.z = fz;
      // in front of the camera, as close as the water allows
      let ok = false;
      for (const [near, far] of [[20, 32], [15, 60], [10, 120]]) if ((ok = this.spawnGroup(0, ox, oz, _d, near, far, 6))) break;
      if (ok) { L[0].heading = headingOf(-fz, fx); L[1].heading = L[0].heading; L[0].alarmCool = 60; L[1].alarmCool = 60; }
      return;
    }
    // the nearest bird swimming in front of the camera
    let best = null, bd = Infinity;
    for (const l of L) {
      if (!l.alive || l.state !== 'swim') continue;
      const dx = l.x - ox, dz = l.z - oz, d = Math.hypot(dx, dz);
      if ((dx * fx + dz * fz) / (d || 1) > 0.5 && d < bd) { bd = d; best = l; }
    }
    if (!best) return;
    if (kind === 'dive') this.startDive(best, NaN, NaN, false);
    else if (kind === 'run') this.startRun(best, true);
    else if (kind === 'flap') { best.state = 'flap'; best.t = 0; }
    else if (kind === 'call') this.call(best, 'wail', 2);
  }

  // --- behaviours -------------------------------------------------------------------------------------------
  startDive(l, awayX, awayZ, alarm) {
    l.state = 'dive'; l.t = 0;
    const far = alarm ? 100 : 50, near = alarm ? 40 : 15;
    if (this.nearSpot(l.x, l.z, near, far, 8, awayX, awayZ)) { l.tx = _spot.x; l.tz = _spot.z; } else { l.tx = l.x; l.tz = l.z; }
    const d = Math.hypot(l.tx - l.x, l.tz - l.z);
    l.under = clamp(d / 2.2, alarm ? 18 : 12, 45) * (0.8 + this.rng() * 0.4);
    l.splash = alarm && this.rng() < 0.5;
    this.ring(l.x, l.z, 0.3, 1.6, 2.6);
    if (l.splash) this.splash(l, 0.5);
  }
  startRun(l, force = false) {
    const fx = Math.cos(l.heading), fz = -Math.sin(l.heading);
    if (!force && !waterRun(this.world, l.x, l.z, l.x + fx * 60, l.z + fz * 60, 10)) return false;
    l.state = 'run'; l.t = 0; l.run = 8 + this.rng() * 4;
    this.splash(l, 0.6);
    return true;
  }
  call(l, kind, depth = 0) {
    const light = this.light, dist = Math.hypot(l.x - this.px, l.z - this.pz);
    emit(this.audio, CALL[kind], l.x, this.levelOf(l) + 0.3, l.z, 1, dist);
    // an answer: the mate (or the bird it follows), else another bird on the lake; a yodel is answered by a rival
    if (depth <= 0) return;
    let to = null;
    const mate = this.loons.find((m) => m.alive && m !== l && (m.lead === l.i || l.lead === m.i || (l.lead >= 0 && m.lead === l.lead)));
    if (kind !== 'yodel' && mate && this.rng() < 0.75) to = mate;
    else { const others = this.loons.filter((m) => m.alive && m !== l && m !== mate && m.state !== 'under'); if (others.length) to = others[(this.rng() * others.length) | 0]; }
    if (!to || to.replyT > 0 || this.rng() > (to === mate ? 0.8 : 0.45)) return;
    to.replyT = 1.5 + this.rng() * 4 + (to === mate ? 0 : 2);
    to.replyKind = kind === 'yodel' ? (to.male && to.lead < 0 ? 'yodel' : 'tremolo') : kind === 'tremolo' ? (this.rng() < 0.6 ? 'tremolo' : 'wail') : 'wail';
    to.replyDepth = depth - 1 + (light.night > 0.5 && this.rng() < 0.25 ? 1 : 0); // a chorus now and then on a summer night
  }
  ring(x, z, s0, s1, life) { const r = this.rip; if (r) r.spawn(3, x, this.world.levelAt(x, z), z, s0, s1, life); }
  splash(l, size) {
    const r = this.rip, lv = this.levelOf(l);
    if (r) for (let k = 0; k < 7; k++) { const a = this.rng() * 6.28, s = 0.4 + this.rng() * 0.8; r.spawn(1, l.x + Math.cos(a) * 0.2, lv, l.z + Math.sin(a) * 0.2, 0.05 + size * 0.04, 0.02, 0.5 + this.rng() * 0.3, Math.cos(a) * s, 1.2 + this.rng() * 1.4 * size, Math.sin(a) * s); }
    emit(this.audio, 'splash', l.x, lv, l.z, size, Math.hypot(l.x - this.px, l.z - this.pz));
  }

  update(dt, player, season = null, ctx = null) {
    const w = this.world, P = this.parts;
    this.rip = (ctx && ctx.ripples) || this.ripples;
    if (ctx && ctx.audio) this.audio = ctx.audio;
    this.light = ctx && ctx.day ? lightOf(ctx.day, LIGHT) : LIGHT;
    const camera = ctx && ctx.camera;
    this.px = player.x; this.pz = player.z;
    for (const k in P) P[k].begin();
    if (season && season.loons < 0.5 && !this.forced) {
      for (const l of this.loons) l.alive = false;
      for (const c of this.chicks) c.alive = false;
      this.season = -1;
      for (const k in P) P[k].end();
      return;
    }
    const doy = season ? season.doy : 180;
    if (this.season < 0 || Math.abs(doy - this.season) > 12) this.layout(doy);
    if (this.forced) this.applyForce(player, camera);
    const afloat = player.mode === 'paddle' || player.mode === 'swim';
    const cx = camera ? camera.position.x : player.x, cz = camera ? camera.position.z : player.z;
    const chatty = 0.2 + 1.6 * Math.max(this.light.dusk, this.light.dawn * 0.6, this.light.night);

    for (const l of this.loons) {
      // a group that has drifted far behind the player is laid out again ahead of it
      if (l.lead < 0 && (!l.alive || Math.hypot(l.x - player.x, l.z - player.z) > 700)) {
        // somewhere out of sight: behind the camera, if there is water there
        if (camera) { camera.getWorldDirection(_v); _d.x = -_v.x; _d.z = -_v.z; }
        if (!this.spawnGroup(l.i, player.x, player.z, camera ? _d : null, 200, 450)) continue;
      }
      if (l.lead >= 0 && !this.loons[l.lead].alive) continue;
      if (!l.alive) continue;
      const lead = l.lead >= 0 ? this.loons[l.lead] : null;
      const dPlayer = Math.hypot(l.x - player.x, l.z - player.z);
      l.t += dt; l.alarmCool -= dt;
      const swimming = l.state === 'swim' || l.state === 'flee';

      // the canoe coming close: most dive, a parent with a chick on its back swims off calling
      if (swimming && afloat && l.alarmCool <= 0 && (dPlayer < 26 || (dPlayer < 45 && player.speed > 0.8))) {
        l.alarmCool = 25;
        if (this.rng() < 0.5) this.call(l, 'tremolo', 1);
        if (l.chick >= 0 || this.rng() < 0.22) { l.state = 'flee'; l.t = 0; l.flee = 10 + this.rng() * 6; l.heading = headingOf(l.x - player.x, l.z - player.z) + (this.rng() - 0.5) * 0.6; }
        else if (this.rng() < 0.12) { l.heading = headingOf(l.x - player.x, l.z - player.z); if (!this.startRun(l)) this.startDive(l, player.x, player.z, true); }
        else this.startDive(l, player.x, player.z, true);
      }

      if (l.state === 'swim' || l.state === 'flee') {
        let want = l.heading, speed = l.state === 'flee' ? 1.1 : 0.32;
        if (l.state === 'flee' && l.t > l.flee) l.state = 'swim';
        if (lead && l.state === 'swim') {
          // keep station on the bird it follows, faster the further it has fallen behind
          const tx = lead.x + l.ox, tz = lead.z + l.oz, dx = tx - l.x, dz = tz - l.z, d = Math.hypot(dx, dz);
          if (lead.state === 'under' || lead.state === 'dive') speed = 0.2;
          else { speed = clamp(0.1 + d * 0.06, 0.1, 1.0); if (d > 1.5) want = headingOf(dx, dz); else want = lead.heading; }
          if (lead.state === 'dive' && lead.t < dt * 1.5 && this.rng() < 0.4 && l.chick < 0) { this.startDive(l, NaN, NaN, false); continue; }
        } else if (l.state === 'swim') {
          // wander, and turn away from the shore ahead
          l.wanderT -= dt;
          if (l.wanderT <= 0) { l.wanderT = 6 + this.rng() * 14; l.wander = (this.rng() - 0.5) * 1.2; }
          want = l.heading + (l.wander || 0) * dt * 3;
        }
        const fx = Math.cos(want), fz = -Math.sin(want);
        if (w.shoreAt(l.x + fx * 12, l.z + fz * 12) > -7) { deeper(w, l.x, l.z, _d); want = headingOf(_d.x, _d.z); }
        l.heading = turnToward(l.heading, want, dt * 0.9);
        l.speed += (speed - l.speed) * Math.min(1, dt * 1.5);
        const hx = Math.cos(l.heading), hz = -Math.sin(l.heading);
        let nx = l.x + hx * l.speed * dt, nz = l.z + hz * l.speed * dt;
        // never into the canoe
        if (Math.hypot(nx - player.x, nz - player.z) < 6) { nx = l.x; nz = l.z; l.heading += dt; }
        if (w.shoreAt(nx, nz) < -4) { l.x = nx; l.z = nz; } else l.heading += dt * 2;
        l.wake += l.speed * dt;
        // fishing dives, a stretch of the wings, the odd run
        if (l.state === 'swim' && !lead) {
          l.fishT -= dt; l.showT -= dt;
          if (l.fishT <= 0) { l.fishT = 50 + this.rng() * 150; if (l.chick < 0 || !this.chicks[l.chick].ride) this.startDive(l, NaN, NaN, false); }
          else if (l.showT <= 0) { l.showT = 150 + this.rng() * 400; if (l.chick < 0) { if (this.rng() < 0.3) this.startRun(l); else { l.state = 'flap'; l.t = 0; } } }
        } else if (l.state === 'swim' && lead) {
          l.showT -= dt;
          if (l.showT <= 0) { l.showT = 200 + this.rng() * 400; if (l.chick < 0) { l.state = 'flap'; l.t = 0; } }
        }
      } else if (l.state === 'dive') {
        const hx = Math.cos(l.heading), hz = -Math.sin(l.heading);
        l.x += hx * 0.5 * dt; l.z += hz * 0.5 * dt;
        if (l.t >= DIVE) { l.state = 'under'; l.t = 0; }
      } else if (l.state === 'under') {
        // swims on underwater toward where it will come up
        const f = Math.min(1, dt / Math.max(0.5, l.under - l.t));
        l.x += (l.tx - l.x) * f; l.z += (l.tz - l.z) * f;
        if (l.t >= l.under) { l.state = 'surface'; l.t = 0; l.heading = this.rng() * 6.28; this.ring(l.x, l.z, 0.3, 1.4, 2.4); }
      } else if (l.state === 'surface') {
        // (a call on surfacing, half as often by day as at dawn, dusk and night: polish B, the lake was busy at noon)
        if (l.t >= SURFACE) { l.state = 'swim'; l.t = 0; if (this.rng() < 0.15 + 0.15 * Math.max(this.light.dusk, this.light.dawn, this.light.night)) l.callT = Math.min(l.callT, 2 + this.rng() * 3); }
      } else if (l.state === 'flap') {
        if (l.t >= FLAP) { l.state = 'swim'; l.t = 0; }
      } else if (l.state === 'run') {
        const landing = l.t > l.run - 1.6, v = landing ? 4.2 * Math.max(0, (l.run - l.t) / 1.6) : Math.min(4.6, l.t * 3);
        const hx = Math.cos(l.heading), hz = -Math.sin(l.heading), nx = l.x + hx * v * dt, nz = l.z + hz * v * dt;
        if (w.shoreAt(nx, nz) < -6) { l.x = nx; l.z = nz; } else if (!landing) l.t = l.run - 1.6;
        l.patter = (l.patter || 0) + dt;
        if (this.rip && l.patter > (landing ? 0.2 : 0.09) && Math.hypot(l.x - cx, l.z - cz) < 200) {
          l.patter = 0;
          const lv = this.levelOf(l), bx = l.x - hx * 0.35, bz = l.z - hz * 0.35;
          for (let k = 0; k < 2; k++) this.rip.spawn(1, bx + (this.rng() - 0.5) * 0.3, lv, bz + (this.rng() - 0.5) * 0.3, 0.05, 0.02, 0.45, -hx * 0.6 + (this.rng() - 0.5), 0.9 + this.rng() * 0.9, -hz * 0.6 + (this.rng() - 0.5));
          this.rip.spawn(3, bx, lv, bz, 0.15, 0.7, 1.6);
        }
        if (l.t >= l.run) { l.state = 'swim'; l.t = 0; this.splash(l, 0.7); this.ring(l.x, l.z, 0.4, 2.2, 2.8); }
      }

      // calls: wails, tremolos and the males' yodels, mostly at dusk and through the night
      if (l.state !== 'under' && l.state !== 'dive') {
        if (l.replyT > 0) { l.replyT -= dt; if (l.replyT <= 0) this.call(l, l.replyKind, l.replyDepth); }
        l.callT -= dt * chatty;
        if (l.callT <= 0) {
          l.callT = 160 + this.rng() * 320;
          const r = this.rng(), night = this.light.night > 0.5 || this.light.dusk > 0.5;
          const kind = night ? (r < 0.45 ? 'wail' : r < 0.7 || !l.male || l.lead >= 0 ? 'tremolo' : 'yodel') : (r < 0.45 ? 'wail' : 'tremolo');
          this.call(l, kind, 2);
        }
      }

      // the pose
      let y = 0, pitch = 0, wings = false, flap = 0, sweep = 0;
      if (l.state === 'dive') {
        const f = l.t / DIVE, s = Math.sin(f * Math.PI * 0.5);
        pitch = -0.85 * s; y = -0.62 * f * f - 0.05 * Math.sin(f * Math.PI);
        if (l.splash && f < 0.3) pitch -= 0.3 * Math.sin(f / 0.3 * Math.PI);
      } else if (l.state === 'under') y = -2;
      else if (l.state === 'surface') { const f = l.t / SURFACE, e = 1 - (1 - f) * (1 - f); y = -0.45 * (1 - e); pitch = 0.4 * (1 - f) * Math.sin(Math.min(1, f * 1.5) * Math.PI * 0.5 + 0.6); }
      else if (l.state === 'flap') {
        const f = l.t / FLAP, rise = smooth(0, 0.18, f) * (1 - smooth(0.72, 1, f));
        pitch = 1.05 * rise; y = 0.2 * rise;
        if (rise > 0.35) { wings = true; flap = 0.3 + 0.85 * Math.sin(l.t * Math.PI * 2 * 2.1); sweep = 0.2; }
      } else if (l.state === 'run') {
        const landing = l.t > l.run - 1.6, up = smooth(0, 1.2, l.t) * (landing ? Math.max(0, (l.run - l.t) / 1.6) : 1);
        pitch = 0.32 * up + (landing ? 0.25 * up : 0); y = 0.1 * up;
        wings = true; flap = landing ? 0.95 : 0.25 + 0.95 * Math.sin(l.t * Math.PI * 2 * 4.2); sweep = landing ? 0.35 : 0.05;
      } else {
        pitch = 0.02 * Math.sin(l.t * 1.3 + l.i);
      }
      l.y += (y - l.y) * (l.state === 'swim' ? Math.min(1, dt * 4) : 1); l.pitch = pitch;
      if (l.state === 'under' || Math.hypot(l.x - cx, l.z - cz) > 700) continue;

      // the head: looks about, now and then dips to peer underwater
      l.headT -= dt;
      if (l.headT <= 0) { l.headT = 1.5 + this.rng() * 4; l.headTarget = (this.rng() - 0.5) * 1.2; }
      l.headYaw = turnToward(l.headYaw, l.state === 'swim' ? l.headTarget : 0, dt * 1.5);
      l.peerT -= dt;
      if (l.peerT <= 0 && l.state === 'swim') { l.peerT = 15 + this.rng() * 40; l.peerFor = 2 + this.rng() * 3; }
      l.peerFor = (l.peerFor || 0) - dt;
      l.peer += ((l.peerFor > 0 ? 1 : 0) - l.peer) * Math.min(1, dt * 3);
      const lv = this.levelOf(l);
      frameMatrix(_m, l.x, lv + l.y, l.z, l.heading, l.pitch);
      P.body.push(_m);
      partMatrix(_h, _m, NECK[0], NECK[1], NECK[2], 0, l.headYaw, -1.05 * l.peer - (l.state === 'run' ? 0.25 : 0), 'YZX');
      P.head.push(_h);
      if (wings) {
        P.wingR.push(partMatrix(_w, _m, 0.02, 0.03, 0.12, -flap, sweep, 0, 'XYZ'));
        P.wingL.push(partMatrix(_w, _m, 0.02, 0.03, -0.12, flap, -sweep, 0, 'XYZ'));
      }
      // the wake: a pair of rings off the breast every third of a metre, spreading into a V
      if (this.rip && l.wake > 0.33 && l.y > -0.2 && Math.hypot(l.x - cx, l.z - cz) < 160) {
        l.wake = 0;
        const hx = Math.cos(l.heading), hz = -Math.sin(l.heading), sx = -hz, sz = hx, bx = l.x + hx * 0.22, bz = l.z + hz * 0.22;
        for (let sg = -1; sg <= 1; sg += 2) this.rip.spawn(3, bx + sx * sg * 0.1, lv, bz + sz * sg * 0.1, 0.12, 0.5, 2.6, sx * sg * 0.13 - hx * 0.05, 0, sz * sg * 0.13 - hz * 0.05);
      }
    }

    // the chicks: riding a parent's back, or paddling at its side
    for (const c of this.chicks) {
      const p = c.parent >= 0 ? this.loons[c.parent] : null;
      if (!c.alive || !p || !p.alive) continue;
      c.bob += dt;
      if (c.ride && p.state !== 'under' && p.state !== 'dive' && p.state !== 'run') {
        frameMatrix(_m, p.x, this.levelOf(p) + p.y, p.z, p.heading, p.pitch);
        P.chick.push(partMatrix(_c, _m, -0.07, 0.055, 0.0, 0, 0.15 * Math.sin(c.bob * 0.7), 0, 'YZX'));
        c.x = p.x; c.z = p.z; c.heading = p.heading;
      } else {
        // beside the parent, a little behind; waits where it is while the parent is under
        const hx = Math.cos(p.heading), hz = -Math.sin(p.heading);
        const tx = p.x - hx * 1.4 - hz * 0.9, tz = p.z - hz * 1.4 + hx * 0.9, dx = tx - c.x, dz = tz - c.z, d = Math.hypot(dx, dz);
        if (p.state !== 'under' && p.state !== 'dive' && d > 0.3) {
          const v = Math.min(1.2, d * 0.8) * dt / d;
          if (w.shoreAt(c.x + dx * v, c.z + dz * v) < -2) { c.x += dx * v; c.z += dz * v; }
          c.heading = turnToward(c.heading, headingOf(dx, dz), dt * 2);
        }
        if (Math.hypot(c.x - cx, c.z - cz) > 700) continue;
        frameMatrix(_c, c.x, w.levelAt(c.x, c.z, 2) + 0.03, c.z, c.heading, 0.03 * Math.sin(c.bob * 2), 0, c.size * 0.9);
        P.chick.push(_c);
      }
    }
    for (const k in P) P[k].end();
  }

  // for the HUD or a debug panel: how many are drawn, and their triangles this frame
  get stats() { let calls = 0, tris = 0; for (const k in this.parts) { const p = this.parts[k]; if (p.n) { calls++; tris += p.n * p.triangles; } } return { calls, tris }; }
}

const _v = new THREE.Vector3();
