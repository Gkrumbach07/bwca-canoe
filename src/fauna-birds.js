import * as THREE from 'three';
import { eagleModels, gullModels, ravenModels } from './fauna-models.js';
import { Parts, frameMatrix, partMatrix, topOf, smooth, clamp, wrapAngle, turnToward, headingOf } from './fauna-kit.js';

// The birds of the open sky over the lakes (fauna.js drives them): a bald eagle that sits on a tall pine or a
// snag at the shore, soars in wide circles over the lake and now and then swoops to the water for a fish;
// herring gulls standing on a rock out in the lake, a couple soaring; and in the winter only the odd raven,
// rowing across on its black wings, sometimes dropping onto the ice. One flight model for all of them:
//   soar    circling a centre that drifts with the wind, banked into the turn, wings set in a shallow V
//   glide   straight toward a point, flapping when it has to climb (the eagle's swoop, the climb out, the
//           approach to a perch or a rock, the raven's crossing)
//   perch / stand   on a tree top, a rock or the ice, wings folded along the flanks
// Each bird is three instanced parts, its body and its two wings; a folded wing is the wing turned back along
// the flank and shortened (see fold()).

const KINDS = {
  //            wing root (x, y, |z|), folded z, cruise m/s, flap Hz, flap amplitude, how often it flaps, call
  eagle: { root: [0.03, 0.04, 0.1], foldZ: 0.115, speed: 10, hz: 2.2, amp: 0.55, flappy: 0.08, perchPitch: 0.75, perchUp: 0.36, call: 'eagle-call', fingers: true },
  gull: { root: [0.02, 0.035, 0.07], foldZ: 0.085, speed: 8, hz: 3.2, amp: 0.6, flappy: 0.35, perchPitch: 0.18, perchUp: 0.07, call: null },
  raven: { root: [0.02, 0.035, 0.08], foldZ: 0.09, speed: 9, hz: 3.0, amp: 0.65, flappy: 0.6, perchPitch: 0.22, perchUp: 0.075, call: null, fingers: true },
};
const _m = new THREE.Matrix4(), _w = new THREE.Matrix4(), _v = new THREE.Vector3();
// what an eagle would rather sit on (vegetation.js SPECIES): a snag, a big pine; a spruce will do; a birch hardly
const PERCH_BONUS = { 5: 9, 8: 7, 0: 6, 2: 5, 9: 2, 1: 0, 4: -2, 3: -6 };

function makeBird(kind, i) {
  return {
    kind, i, k: KINDS[kind], alive: false, state: 'soar', t: 0, x: 0, y: 0, z: 0, heading: 0, pitch: 0, roll: 0, speed: KINDS[kind].speed,
    cx: 0, cz: 0, R: 60, alt: 60, ang: 0, dir: 1, tx: 0, ty: 0, tz: 0, next: null, flap: 0, phase: Math.random() * 6, burst: 0,
    fold: 0, perchY: 0, holdT: 0, callT: 20 + Math.random() * 60, ground: 0, hopT: 2,
  };
}

export class Birds {
  constructor(fauna, scene, mats) {
    this.f = fauna;
    const mk = (geo, kind, n) => ({
      // high and small: not worth the mirror pass
      body: new Parts(scene, geo.body, mats.solid, n, { name: `${kind} body`, reflect: false }),
      wingR: new Parts(scene, geo.wingR, mats.solid, n, { name: `${kind} wing`, reflect: false }),
      wingL: new Parts(scene, geo.wingL, mats.solid, n, { name: `${kind} wing`, reflect: false }),
    });
    this.parts = { eagle: mk(eagleModels(), 'eagle', 2), gull: mk(gullModels(), 'gull', 5), raven: mk(ravenModels(), 'raven', 1) };
    this.eagles = [makeBird('eagle', 0), makeBird('eagle', 1)];
    this.gulls = [0, 1, 2, 3, 4].map((i) => makeBird('gull', i));
    this.raven = makeBird('raven', 0);
    this.ravenT = 20;
    this.rock = null;   // the gulls' rock: { x, z, y, r }
    this.rockT = 0;
    this.perches = [];  // shore pines and snags found for the eagles: { x, z, y, sp }
    this.eagleT = 0;
  }

  // ---- where they sit ---------------------------------------------------------------------------------------
  // A tall pine or a snag right at the shore, 120-600 m from (x, z), preferring the view: of the biggest trunks
  // within a stone's throw of the water along a few bearings, the tallest drawn tree, a snag or a white or red
  // pine first, the nearer the water the better.
  findPerch(x, z, near = 120, far = 600, dir = null) {
    const w = this.f.world, rng = this.f.rng;
    let best = null, tried = 0;
    for (let k = 0; k < 24 && tried < 6; k++) {
      let a = rng() * Math.PI * 2;
      if (dir && k < 16) a = Math.atan2(dir.z, dir.x) + (rng() - 0.5) * 1.4;
      // walk out to the nearest shore along this bearing
      let px = NaN, pz = NaN;
      for (let d = near; d < far; d += 8) { const qx = x + Math.cos(a) * d, qz = z + Math.sin(a) * d, s = w.shoreAt(qx, qz); if (s > 0 && s < 10 && w.isReady(qx, qz)) { px = qx; pz = qz; break; } }
      if (Number.isNaN(px) || !w.tiles) continue;
      tried++;
      const trunks = w.tiles.treesNear(px, pz, 20).filter((t) => !t.rock && !t.box && t.r > 0.18 && w.shoreAt(t.x, t.z) < 12).sort((p, q) => q.r - p.r).slice(0, 4);
      for (const t of trunks) {
        const top = topOf(w, t.x, t.z, 0.6), ground = w.heightAt(t.x, t.z);
        if (!top || top.y - ground < 8) continue;
        const score = top.y - ground + (PERCH_BONUS[top.sp] ?? -8) - 0.4 * w.shoreAt(t.x, t.z);
        if (!best || score > best.score) best = { x: top.x, z: top.z, y: top.y, sp: top.sp, score };
      }
    }
    // the winner's crown, all of it: the bird sits on its highest point
    if (best) { const top = topOf(w, best.x, best.z, 0.3, true); if (top) { best.x = top.x; best.z = top.z; best.y = top.y; } }
    return best;
  }
  // A rock out in the lake for the gulls: a boulder standing out of the water or a bare islet, with open water
  // round most of it (the more the better) and no trees on it.
  findRock(x, z, dir = null, near = 60, far = 500) {
    const w = this.f.world, rng = this.f.rng;
    let best = null;
    for (let k = 0; k < 220; k++) {
      let a = rng() * Math.PI * 2;
      if (dir && k < 110) a = Math.atan2(dir.z, dir.x) + (rng() - 0.5) * 1.6;
      const d = near + rng() * (far - near), qx = x + Math.cos(a) * d, qz = z + Math.sin(a) * d;
      if (!w.isReady(qx, qz)) continue;
      const s = w.shoreAt(qx, qz);
      if (s < -6 || s > 12) continue;
      let wet = 0;
      for (let j = 0; j < 8; j++) { const b = (j / 8) * Math.PI * 2; if (w.shoreAt(qx + Math.cos(b) * 25, qz + Math.sin(b) * 25) < -2) wet++; }
      if (wet < 5 || (best && wet + 1 < best.wet)) continue;
      const near8 = w.tiles ? w.tiles.treesNear(qx, qz, 8) : [];
      if (near8.some((t) => !t.rock)) continue; // trees on it: not a gulls' rock
      const boulder = near8.filter((t) => t.rock).sort((p, q) => q.r - p.r)[0];
      let rock = null;
      if (boulder) {
        const top = topOf(w, boulder.x, boulder.z, 0.5), lv = w.levelAt(qx, qz);
        if (top && top.y > lv + 0.3) rock = { x: boulder.x, z: boulder.z, y: top.y, r: Math.max(0.4, boulder.r * 0.5), wet, score: wet + Math.min(1.5, top.y - lv) };
      } else if (s > 0.5) rock = { x: qx, z: qz, y: w.heightAt(qx, qz), r: Math.min(3, s * 0.5), ground: true, wet, score: wet + 0.5 };
      if (rock && (!best || rock.score > best.score)) best = rock;
      if (best && best.wet >= 7) break;
    }
    return best;
  }

  // ---- flight ------------------------------------------------------------------------------------------------
  soar(b, cx, cz, R, alt) {
    b.state = 'soar'; b.t = 0; b.cx = cx; b.cz = cz; b.R = R; b.alt = alt;
    b.ang = Math.atan2(b.z - cz, b.x - cx); b.dir = this.f.rng() < 0.5 ? 1 : -1;
  }
  glide(b, tx, ty, tz, next, speed = b.k.speed) { b.state = 'glide'; b.t = 0; b.tx = tx; b.ty = ty; b.tz = tz; b.next = next; b.speed = speed; }

  // the wings: spread (flap angle, sweep) blended toward folded by b.fold
  wings(P, b, scale) {
    const k = b.k, f = b.fold, span = 1 - 0.58 * f;
    // folded with the leading edge down for a gull (its grey upper side shows), up for the fingered wings of an
    // eagle or a raven so the primaries lie down along the tail instead of sticking up over it
    const roll = (Math.PI / 2 + 0.12) * (k.fingers ? -1 : 1);
    const rx = -b.flap * (1 - f) + roll * f, ry = (b.sweep || 0) * (1 - f) - (Math.PI / 2 - 0.06) * f;
    const oz = k.root[2] * (1 - f) + k.foldZ * f, droop = 0.2 * f; // folded, the tips lie down over the tail
    P.wingR.push(partMatrix(_w, _m, k.root[0] * scale, k.root[1] * scale, oz * scale, rx, ry, droop, 'ZXY', 1, 1, span));
    P.wingL.push(partMatrix(_w, _m, k.root[0] * scale, k.root[1] * scale, -oz * scale, -rx, -ry, droop, 'ZXY', 1, 1, span));
  }

  fly(b, dt) {
    const f = this.f, rng = f.rng;
    b.t += dt;
    let wantFlap = 0;
    if (b.state === 'soar') {
      // round the circle, its centre drifting downwind, the height breathing
      const v = b.k.speed * 0.9, om = (v / b.R) * b.dir;
      b.ang += om * dt;
      const wind = f.water && f.water.wind;
      if (wind) { b.cx += wind.x * 0.4 * dt; b.cz += wind.z * 0.4 * dt; }
      const nx = b.cx + Math.cos(b.ang) * b.R, nz = b.cz + Math.sin(b.ang) * b.R, ny = f.levelRef + b.alt + Math.sin(b.t * 0.13 + b.i) * 4;
      const dx = nx - b.x, dz = nz - b.z;
      if (dx * dx + dz * dz > 1e-6) b.heading = turnToward(b.heading, headingOf(dx, dz), dt * 2.5);
      // onto the circle at no more than flying speed (it may come in from a glide well off it)
      const dd = Math.hypot(dx, dz), step = Math.min(dd * Math.min(1, dt * 2), v * 1.3 * dt);
      if (dd > 1e-6) { b.x += (dx / dd) * step; b.z += (dz / dd) * step; }
      b.y += clamp(ny - b.y, -v * 0.3 * dt, v * 0.3 * dt);
      if (dd > b.R * 0.5) b.ang = Math.atan2(b.z - b.cz, b.x - b.cx) + b.dir * 0.4; // aim a little ahead round the circle
      b.roll += (-b.dir * Math.atan((v * v) / (9.8 * b.R)) - b.roll) * Math.min(1, dt * 2);
      b.pitch += (0 - b.pitch) * Math.min(1, dt * 2);
      b.burst -= dt;
      if (b.burst <= 0 && rng() < b.k.flappy * dt) b.burst = 1 + rng() * 2;
      wantFlap = b.burst > 0 ? 1 : 0;
    } else if (b.state === 'glide') {
      const dx = b.tx - b.x, dy = b.ty - b.y, dz = b.tz - b.z, d = Math.hypot(dx, dz), d3 = Math.hypot(d, dy);
      b.heading = turnToward(b.heading, headingOf(dx, dz), dt * 1.8);
      const fx = Math.cos(b.heading), fz = -Math.sin(b.heading);
      const climb = clamp(dy / Math.max(d, 1), -0.6, 0.5);
      const v = b.speed * (b.next === 'perch' || b.next === 'stand' ? clamp(d3 / 25, 0.25, 1) : 1);
      b.x += fx * v * dt; b.z += fz * v * dt; b.y += clamp(dy, -v * 0.7 * dt, v * 0.5 * dt);
      b.pitch += (Math.atan(climb) * 0.8 - b.pitch) * Math.min(1, dt * 3);
      b.roll += (clamp(-wrapAngle(headingOf(dx, dz) - b.heading) * 0.8, -0.6, 0.6) - b.roll) * Math.min(1, dt * 3);
      wantFlap = climb > 0.05 || b.kind === 'raven' ? 1 : (b.next === 'perch' || b.next === 'stand') && d3 < 12 ? 1 : 0;
      if (b.kind === 'raven') wantFlap = Math.sin(b.t * 0.9) > -0.3 ? 1 : 0; // flap, flap, glide
      const reach = b.next === 'perch' || b.next === 'stand' ? Math.max(1.2, v * 0.7) : 1.5; // a slow landing stops a little short and settles
      if (d3 < reach || (b.next === 'away' && (b.t > 40 || Math.hypot(b.x - f.cx, b.z - f.cz) > 700))) this.arrive(b);
    } else if (b.state === 'strike') {
      // the eagle at the water: feet down, wings high, a splash, then away
      b.pitch += (0.7 - b.pitch) * Math.min(1, dt * 6);
      b.y += (f.levelAt(b.x, b.z) + 0.6 - b.y) * Math.min(1, dt * 5);
      const fx = Math.cos(b.heading), fz = -Math.sin(b.heading);
      b.x += fx * 3 * dt; b.z += fz * 3 * dt;
      wantFlap = 1;
      if (!b.splashed && b.t > 0.35) { b.splashed = true; f.splash(b.x, b.z, 1.2); f.emit('splash', b.x, f.levelAt(b.x, b.z), b.z, 0.9); }
      if (b.t > 1.1) {
        const p = this.perches[b.i];
        if (p && rng() < 0.6) this.glide(b, p.x, p.y + b.k.perchUp, p.z, 'perch', b.k.speed * 0.8);
        else this.glide(b, b.x + fx * 120, f.levelRef + 60, b.z + fz * 120, 'soar', b.k.speed * 0.8);
      }
    } else if (b.state === 'perch' || b.state === 'stand') {
      b.pitch += (b.k.perchPitch - b.pitch) * Math.min(1, dt * 3);
      b.roll += (0 - b.roll) * Math.min(1, dt * 3);
      // settle onto the very spot (the glide stops a little short of it)
      b.y += (b.perchY - b.y) * Math.min(1, dt * 4);
      b.x += (b.tx - b.x) * Math.min(1, dt * 4); b.z += (b.tz - b.z) * Math.min(1, dt * 4);
      b.holdT -= dt;
      if (b.state === 'stand') {
        b.hopT -= dt;
        if (b.hopT <= 0) { b.hopT = 2 + rng() * 6; b.heading += (rng() - 0.5) * 1.6; }
      }
    }
    // wingbeats: spread to a beat when flapping, set in a shallow V when soaring, folded when sitting
    const sitting = b.state === 'perch' || b.state === 'stand';
    b.fold += ((sitting ? 1 : 0) - b.fold) * Math.min(1, dt * (sitting ? 2.5 : 5));
    const beat = b.state === 'strike' ? 0.55 + 0.6 * Math.sin(b.t * Math.PI * 2 * 2.6) : wantFlap ? 0.1 + b.k.amp * Math.sin(b.phase) : 0.1;
    if (wantFlap || b.state === 'strike') b.phase += dt * Math.PI * 2 * b.k.hz;
    b.flap += (beat - b.flap) * Math.min(1, dt * 12);
    b.sweep = b.state === 'strike' ? 0.3 : 0;
    if (b.k.call && !sitting && b.state !== 'strike') { b.callT -= dt; if (b.callT <= 0) { b.callT = 40 + rng() * 120; f.emit(b.k.call, b.x, b.y, b.z, 1); } }
    else if (b.k.call && sitting) { b.callT -= dt * 0.5; if (b.callT <= 0) { b.callT = 50 + rng() * 120; f.emit(b.k.call, b.x, b.y, b.z, 1); } }
  }

  // what a glide ends in
  arrive(b) {
    const f = this.f;
    if (b.next === 'perch') { b.state = 'perch'; b.t = 0; b.perchY = b.ty; b.holdT = 40 + f.rng() * 110; b.speed = b.k.speed; }
    else if (b.next === 'stand') { b.state = 'stand'; b.t = 0; b.perchY = b.ty; b.holdT = 30 + f.rng() * 90; b.speed = b.k.speed; }
    else if (b.next === 'strike') { b.state = 'strike'; b.t = 0; b.splashed = false; }
    else if (b.next === 'away') { b.alive = false; }
    else if (b.plan) { b.plan = false; this.soar(b, b.cx, b.cz, 40 + f.rng() * 40, b.alt); } // the circle it took off for
    else this.soar(b, b.x + Math.sin(b.heading) * 60, b.z + Math.cos(b.heading) * 60, 50 + f.rng() * 40, b.y - f.levelRef);
  }

  takeOff(b, cx, cz, alt) {
    const fx = Math.cos(b.heading), fz = -Math.sin(b.heading);
    this.glide(b, b.x + fx * 50, b.y + 18, b.z + fz * 50, 'soar', b.k.speed * 0.8);
    b.cx = cx; b.cz = cz; b.alt = alt; b.plan = true;
  }

  // ---- the day's birds ---------------------------------------------------------------------------------------
  update(dt, gates) {
    const f = this.f, rng = f.rng;
    for (const k in this.parts) for (const p in this.parts[k]) { const q = this.parts[k][p]; q.begin(); q.shadow = false; }
    const px = f.px, pz = f.pz;

    // eagles: the season the lakes are open, by daylight
    const eagleOn = gates.eagle;
    this.eagleT -= dt;
    for (const b of this.eagles) {
      if (b.i === 1 && !gates.eaglePair) { b.alive = false; continue; }
      if (b.alive && Math.hypot(b.x - px, b.z - pz) > 1600) b.alive = false;
      if (!b.alive && eagleOn && this.eagleT <= 0) {
        this.eagleT = 5;
        const p = this.findPerch(px, pz, 150, 600, f.view);
        if (p) this.perches[b.i] = p;
        const per = this.perches[b.i];
        b.alive = true; b.t = 0; b.fold = 0;
        if (per && rng() < 0.5) { Object.assign(b, { x: per.x, y: per.y + b.k.perchUp, z: per.z, tx: per.x, tz: per.z, state: 'perch', perchY: per.y + b.k.perchUp, holdT: 30 + rng() * 90, heading: rng() * 6.28, fold: 1 }); }
        else {
          const a = rng() * 6.28, R = 50 + rng() * 40;
          b.x = px + Math.cos(a) * 300; b.z = pz + Math.sin(a) * 300; b.y = f.levelRef + 70; b.heading = rng() * 6.28;
          this.soar(b, f.openNear(px, pz, 220).x, f._open.z, R, 55 + rng() * 50);
        }
      }
      if (!b.alive) continue;
      if (!eagleOn && b.state !== 'glide') { const fx = Math.cos(b.heading), fz = -Math.sin(b.heading); this.glide(b, b.x + fx * 1500, b.y + 80, b.z + fz * 1500, 'away'); }
      // what it does next
      if (b.state === 'perch' && b.holdT <= 0) { const o = f.openNear(b.x, b.z, 200); this.takeOff(b, o.x, o.z, 50 + rng() * 50); }
      else if (b.state === 'soar' && b.t > 60 + (b.i * 37) % 50) {
        const r = rng();
        if (r < 0.4) {
          // a swoop: down to open water inside the circle
          const o = f.openNear(b.cx, b.cz, 80, 18);
          if (o.ok) this.glide(b, o.x, f.levelAt(o.x, o.z) + 1.8, o.z, 'strike', b.k.speed * 1.35);
          else b.t = 0;
        } else if (r < 0.75 && this.perches[b.i]) { const p = this.perches[b.i]; this.glide(b, p.x, p.y + b.k.perchUp, p.z, 'perch', b.k.speed * 0.85); }
        else b.t = 0;
      }
      this.fly(b, dt);
      this.draw(this.parts.eagle, b, 1);
    }

    // gulls: on their rock out in the lake, a couple soaring; gone when the lakes freeze
    this.rockT -= dt;
    if (gates.gull && (!this.rock || Math.hypot(this.rock.x - px, this.rock.z - pz) > 900) && this.rockT <= 0) {
      this.rockT = 8;
      const r = this.findRock(px, pz, f.view);
      if (r) { this.rock = r; for (const g of this.gulls) if (Math.hypot(g.x - f.cx, g.z - f.cz) > 300) g.alive = false; } // the ones in sight fly there in their own time
    }
    for (const g of this.gulls) {
      if (!gates.gull) { if (g.alive && g.state !== 'glide') { const fx = Math.cos(g.heading), fz = -Math.sin(g.heading); this.glide(g, g.x + fx * 900, g.y + 40, g.z + fz * 900, 'away'); } if (!g.alive) continue; }
      else if (!g.alive || Math.hypot(g.x - px, g.z - pz) > 1300) {
        const rock = this.rock, standing = rock && g.i < this.room(rock);
        if (!standing && !gates.gullFly) { g.alive = false; continue; }
        g.alive = true; g.t = 0;
        if (standing) this.place(g, rock);
        else {
          const o = f.openNear(px, pz, 260), a = rng() * 6.28;
          g.x = o.x + Math.cos(a) * 40; g.z = o.z + Math.sin(a) * 40; g.y = f.levelRef + 30; g.heading = rng() * 6.28; g.fold = 0;
          this.soar(g, o.x, o.z, 25 + rng() * 30, 18 + rng() * 25);
        }
      }
      // standing gulls take off now and then (not after dark); soaring ones come down to the rock, and all of
      // them that can at nightfall
      if (g.state === 'stand' && g.holdT <= 0) { if (gates.gullFly && (rng() < 0.5 || !this.rock)) { const o = f.openNear(g.x, g.z, 150); this.takeOff(g, o.x, o.z, 18 + rng() * 25); } else g.holdT = 20 + rng() * 60; }
      else if (!gates.gullFly && g.state === 'soar') {
        if (this.rock && g.i < this.room(this.rock)) { const s = this.standSpot(g, this.rock); this.glide(g, s.x, s.y, s.z, 'stand', g.k.speed * 0.8); }
        else { const fx = Math.cos(g.heading), fz = -Math.sin(g.heading); this.glide(g, g.x + fx * 900, g.y + 20, g.z + fz * 900, 'away'); }
      }
      else if (g.state === 'soar' && g.t > 50 && this.rock && g.i < this.room(this.rock) && rng() < 0.01) { const s = this.standSpot(g, this.rock); this.glide(g, s.x, s.y, s.z, 'stand', g.k.speed * 0.8); }
      this.fly(g, dt);
      this.draw(this.parts.gull, g, 1);
    }

    // the raven: only in the winter, crossing now and then, sometimes landing on the ice
    const r = this.raven;
    if (!gates.raven && r.alive && r.next !== 'away' && r.state !== 'glide') { const fx = Math.cos(r.heading), fz = -Math.sin(r.heading); this.glide(r, r.x + fx * 600, r.y + 30, r.z + fz * 600, 'away'); }
    if (gates.raven && !r.alive) {
      this.ravenT -= dt;
      if (this.ravenT <= 0) { this.ravenT = 70 + rng() * 140; this.ravenPass(rng() < 0.35); }
    }
    if (r.alive) {
      if (Math.hypot(r.x - px, r.z - pz) > 900) r.alive = false;
      else {
        if (r.state === 'stand' && r.holdT <= 0) { const fx = Math.cos(r.heading), fz = -Math.sin(r.heading); this.glide(r, r.x + fx * 500, r.y + 35, r.z + fz * 500, 'away'); }
        else if (r.state === 'soar' && r.t > 12) { const fx = Math.cos(r.heading), fz = -Math.sin(r.heading); this.glide(r, r.x + fx * 500, r.y + 10, r.z + fz * 500, 'away'); }
        this.fly(r, dt);
        this.draw(this.parts.raven, r, 1);
      }
    }
    for (const k in this.parts) for (const p in this.parts[k]) { const q = this.parts[k][p]; q.mesh.castShadow = q.shadow; q.end(); }
  }

  // a raven across the view, 25-40 m up; `land` drops it onto the ice ahead
  ravenPass(land, inView = false) {
    const f = this.f, rng = f.rng, r = this.raven, v = f.view;
    const sx = -v.z, sz = v.x, side = rng() < 0.5 ? 1 : -1, ahead = inView ? 45 + rng() * 25 : 60 + rng() * 120;
    const cx = f.cx + v.x * ahead, cz = f.cz + v.z * ahead;
    r.alive = true; r.t = 0; r.fold = 0;
    r.x = cx + sx * side * (inView ? 60 : 220); r.z = cz + sz * side * (inView ? 60 : 220); r.y = f.levelRef + 28 + rng() * 12;
    r.heading = headingOf(-sx * side, -sz * side);
    if (land) {
      // onto the ice in front of the player
      let lx = cx, lz = cz;
      if (f.world.shoreAt(lx, lz) > -3) { const o = f.openNear(cx, cz, 60); lx = o.x; lz = o.z; }
      this.glide(r, lx, f.levelAt(lx, lz) + r.k.perchUp, lz, 'stand', r.k.speed * 0.8);
    } else this.glide(r, cx - sx * side * 260, r.y + (rng() - 0.5) * 8, cz - sz * side * 260, 'away');
    return { x: r.x, z: r.z, land };
  }

  // how many gulls the rock has room for (a body length apart), and a gull's place on it: the first on the
  // top, the others round it a little lower down the rock's shoulders
  room(rock) { return rock.ground ? 3 : rock.r < 0.55 ? 1 : rock.r < 1.0 ? 2 : 3; }
  standSpot(g, rock) {
    const k = g.i % 3, a = k * 2.3 + 0.4, d = k === 0 ? 0 : Math.max(0.36, rock.r * 0.55);
    _v.set(rock.x + Math.cos(a) * d, 0, rock.z + Math.sin(a) * d);
    _v.y = (rock.ground ? this.f.world.heightAt(_v.x, _v.z) : rock.y - 0.12 * k) + g.k.perchUp;
    return _v;
  }
  place(g, rock) {
    const s = this.standSpot(g, rock), wind = this.f.water && this.f.water.wind;
    Object.assign(g, { x: s.x, y: s.y, z: s.z, tx: s.x, tz: s.z, perchY: s.y, state: 'stand', holdT: 30 + this.f.rng() * 120, fold: 1, pitch: g.k.perchPitch });
    g.heading = (wind ? headingOf(-wind.x, -wind.z) : 0) + (this.f.rng() - 0.5) * 0.7; // into the wind
  }

  draw(P, b, scale) {
    const d = Math.hypot(b.x - this.f.cx, b.z - this.f.cz);
    if (!b.alive || d > 1500) return;
    // a bird sitting near the camera grounds itself with its shadow on the rock, the ice or the crown under it
    if (b.fold > 0.5 && d < 70) P.body.shadow = P.wingR.shadow = P.wingL.shadow = true;
    frameMatrix(_m, b.x, b.y, b.z, b.heading, b.pitch, b.roll, scale);
    P.body.push(_m);
    this.wings(P, b, scale);
  }

  // debug: an eagle soaring over the lake in view, on its perch, or swooping; the gulls on their rock; a raven
  force(kind) {
    const f = this.f, rng = f.rng, b = this.eagles[0], v = f.view;
    if (kind === 'eagle' || kind === 'eagle-soar') {
      const o = f.openNear(f.cx + v.x * 110, f.cz + v.z * 110, 90);
      b.alive = true; b.fold = 0; b.x = o.x - v.z * 60; b.z = o.z + v.x * 60; b.y = f.levelRef + 45; b.heading = headingOf(v.z, -v.x);
      this.soar(b, o.x, o.z, 45, 38);
    } else if (kind === 'eagle-perch') {
      const p = this.findPerch(f.cx, f.cz, 40, 260, v) || this.findPerch(f.cx, f.cz, 40, 400, null);
      if (!p) return 'no perch found';
      this.perches[0] = p;
      Object.assign(b, { alive: true, x: p.x, y: p.y + b.k.perchUp, z: p.z, tx: p.x, tz: p.z, perchY: p.y + b.k.perchUp, state: 'perch', holdT: 600, fold: 1, pitch: b.k.perchPitch, roll: 0, t: 0 });
      b.heading = headingOf(f.cx - p.x, f.cz - p.z) + 0.9;
      return p;
    } else if (kind === 'eagle-swoop') {
      const o = f.openNear(f.cx + v.x * 70, f.cz + v.z * 70, 50, 15);
      b.alive = true; b.fold = 0; b.x = o.x - v.z * 70 - v.x * 30; b.z = o.z + v.x * 70 - v.z * 30; b.y = f.levelRef + 40;
      b.heading = headingOf(o.x - b.x, o.z - b.z);
      this.glide(b, o.x, f.levelAt(o.x, o.z) + 1.8, o.z, 'strike', b.k.speed * 1.35);
    } else if (kind === 'gulls') {
      const r = this.findRock(f.cx, f.cz, v, 30, 260) || this.findRock(f.cx, f.cz, null, 30, 500);
      if (!r) return 'no rock found';
      this.rock = r;
      for (const g of this.gulls) { g.alive = true; g.t = 0; if (g.i < this.room(r)) this.place(g, r); else { g.x = r.x + rng() * 30; g.z = r.z + rng() * 30; g.y = f.levelRef + 25; g.fold = 0; this.soar(g, r.x, r.z, 30 + g.i * 6, 15 + g.i * 4); } }
      return r;
    } else if (kind === 'raven') return this.ravenPass(false, true);
    else if (kind === 'raven-ice') return this.ravenPass(true, true);
    return kind;
  }

  get active() { const n = []; for (const b of [...this.eagles, ...this.gulls, this.raven]) if (b.alive) n.push(`${b.kind}:${b.state}`); return n; }
}
