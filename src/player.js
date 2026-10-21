import * as THREE from 'three';
import { FLOAT_OFFSET, LENGTH } from './canoe.js';
import { waveHeight } from './water.js';
import { resample } from './props.js';
import { clamp, lerp } from './rng.js';

export class Input {
  constructor() {
    this.down = new Set(); this.once = new Set();
    window.addEventListener('keydown', (e) => { if (e.repeat) return; this.down.add(e.code); this.once.add(e.code); if (['Space', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault(); });
    window.addEventListener('keyup', (e) => this.down.delete(e.code));
    window.addEventListener('blur', () => this.down.clear());
  }
  held(...codes) { return codes.some((c) => this.down.has(c)); }
  pressed(code) { const p = this.once.has(code); this.once.delete(code); return p; }
  endFrame() { this.once.clear(); }
}

const PADDLE = { accel: 3.4, hustle: 5.2, reverse: 1.6, drag: 0.15, lin: 0.12, yaw: 0.65, strokeRate: 0.95, hustleRate: 1.35 };
const WALK = { speed: 1.35, hustle: 2.1 };
const LANDING_RADIUS = 28;

export class Player {
  constructor(world, canoe, input) {
    this.world = world; this.canoe = canoe; this.input = input;
    this.mode = 'paddle';
    this.x = world.meta.start.x; this.z = world.meta.start.z;
    this.heading = 0; this.speed = 0; this.yawRate = 0; this.time = 0;
    this.strokeCount = 0;
    this.prompt = null;
    this.timeScale = 1;
    // portage state
    this.trails = world.portages.map((p) => {
      const pts = resample(p.pts, 1.5);
      const cum = [0];
      for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
      return { def: p, pts, cum, length: cum[cum.length - 1] };
    });
    this.carry = null; // { trail, dist, dir }
    this.landing = null; // auto-pilot toward a launch point
    this.ripples = null; this.wakeV = null; // set by main
    this.bubbleAcc = 0; this.prevStroke = 0; this.level = 0;
    const d = world.deeperDir(this.x, this.z);
    this.heading = Math.atan2(-d.z, d.x);
  }

  get forward() { return { x: Math.cos(this.heading), z: -Math.sin(this.heading) }; }
  get lakeId() { return this.world.lakeIdAt(this.x, this.z); }
  get altitude() { return this.mode === 'carry' ? this.world.heightAt(this.x, this.z) : this.world.levelAt(this.x, this.z); }

  nearestLanding() {
    let best = null;
    for (const t of this.trails) {
      t.def.launch.forEach((l, end) => {
        const d = Math.hypot(l.x - this.x, l.z - this.z);
        if (d < LANDING_RADIUS && (!best || d < best.d)) best = { trail: t, end, d, launch: l };
      });
    }
    return best;
  }

  update(dt) {
    dt *= this.timeScale;
    this.time += dt;
    this.prompt = null;
    if (this.landing) this.updateLanding(dt);
    else if (this.mode === 'carry') this.updateCarry(dt);
    else this.updatePaddle(dt);
  }

  updatePaddle(dt) {
    const inp = this.input, w = this.world, st = this.canoe.state;
    const fwd = (inp.held('KeyW', 'ArrowUp') ? 1 : 0) - (inp.held('KeyS', 'ArrowDown') ? 1 : 0);
    const turn = (inp.held('KeyA', 'ArrowLeft') ? 1 : 0) - (inp.held('KeyD', 'ArrowRight') ? 1 : 0);
    const hustle = inp.held('ShiftLeft', 'ShiftRight');
    const paddling = fwd !== 0 || turn !== 0;
    // stroke cycle drives both the animation and the thrust pulses
    const rate = hustle ? PADDLE.hustleRate : PADDLE.strokeRate;
    if (paddling || st.stroke > 0.02) {
      const prev = st.stroke;
      st.stroke = (st.stroke + dt * rate * (fwd < 0 ? 0.8 : 1)) % 1;
      if (st.stroke < prev) { this.strokeCount++; if (turn === 0 && this.strokeCount % 7 === 0) st.side *= -1; }
      if (!paddling && st.stroke < prev) st.stroke = 0;
    }
    if (turn !== 0) st.side = turn > 0 ? 1 : -1;
    st.power += ((paddling ? 1 : 0) - st.power) * (1 - Math.exp(-dt * 6));
    const pulse = st.stroke < 0.5 ? Math.sin((st.stroke / 0.5) * Math.PI) : 0;
    let a = 0;
    if (fwd > 0) a = (hustle ? PADDLE.hustle : PADDLE.accel) * pulse;
    else if (fwd < 0) a = -PADDLE.reverse * pulse;
    else if (turn !== 0) a = 0.6 * pulse; // sweep strokes still push a little
    this.speed += a * dt;
    this.speed -= (this.speed * Math.abs(this.speed) * PADDLE.drag + this.speed * PADDLE.lin) * dt;
    const yawTarget = turn * PADDLE.yaw * (0.55 + 0.45 * clamp(Math.abs(this.speed) / 1.5, 0, 1)) * (this.speed < -0.2 ? -1 : 1);
    this.yawRate += (yawTarget - this.yawRate) * (1 - Math.exp(-dt * 3.5));
    // the whole hull must stay in the water: centre, bow and stern are tested
    const ok = (x, z, h) => {
      const fx = Math.cos(h), fz = -Math.sin(h);
      return w.inBounds(x, z, 40) && w.shoreAt(x, z) < -1.2 && w.shoreAt(x + fx * 2.3, z + fz * 2.3) < -0.5 && w.shoreAt(x - fx * 2.3, z - fz * 2.3) < -0.5;
    };
    const newHeading = this.heading + this.yawRate * dt;
    if (ok(this.x, this.z, newHeading) || !ok(this.x, this.z, this.heading)) this.heading = newHeading; else this.yawRate = 0;
    const f = this.forward;
    const nx = this.x + f.x * this.speed * dt, nz = this.z + f.z * this.speed * dt;
    if (ok(nx, nz, this.heading)) { this.x = nx; this.z = nz; }
    else if (ok(nx, this.z, this.heading)) { this.x = nx; this.speed *= 0.7; }
    else if (ok(this.x, nz, this.heading)) { this.z = nz; this.speed *= 0.7; }
    else { this.speed *= -0.15; if (!w.inBounds(nx, nz, 40)) this.prompt = { text: 'Edge of the map — turn back', key: null }; }
    this.placeOnWater(dt);
    this.emitWater(dt);
    const land = this.nearestLanding();
    if (land) {
      const p = land.trail.def;
      this.prompt = { key: 'E', text: `Portage: ${p.name} · ${p.rods} rods (${p.lengthM} m)` };
      if (this.input.pressed('KeyE')) this.landing = { land, t: 0 };
    }
  }

  placeOnWater(dt = 1 / 60) {
    const w = this.world, rig = this.canoe.rig, st = this.canoe.state;
    const level = w.levelAt(this.x, this.z);
    this.level = level;
    const shore = w.shoreAt(this.x, this.z);
    const f = this.forward, r = { x: -f.z, z: f.x };
    const t = this.water ? this.water.time : this.time;
    const wave = (dx, dz) => waveHeight(this.x + dx, this.z + dz, t, w);
    // a hull averages the water under it: sample five points along the keel, pitch from the ends
    const hb = wave(f.x * 2, f.z * 2), hs = wave(-f.x * 2, -f.z * 2), hm = wave(0, 0), h1 = wave(f.x, f.z), h2 = wave(-f.x, -f.z);
    const hr = wave(r.x * 0.5, r.z * 0.5), hl = wave(-r.x * 0.5, -r.z * 0.5);
    const y = level + FLOAT_OFFSET + (hb + hs + hm + h1 + h2) / 5;
    const pitch = Math.atan2(hb - hs, 4) * 0.6 + this.speed * 0.012;
    const roll = Math.atan2(hr - hl, 1) * 0.5 + this.yawRate * 0.12 + st.side * st.power * 0.035 * Math.sin(st.stroke * Math.PI * 2);
    const k = 1 - Math.exp(-dt * 5);
    if (!this.bob) this.bob = { y, pitch, roll };
    this.bob.y += (y - this.bob.y) * k; this.bob.pitch += (pitch - this.bob.pitch) * k; this.bob.roll += (roll - this.bob.roll) * k;
    rig.position.set(this.x, this.bob.y, this.z);
    rig.rotation.set(0, this.heading, 0);
    rig.rotateZ(-this.bob.pitch);
    rig.rotateX(this.bob.roll);
    st.mode = 'paddle';
  }

  // wake rings behind the stern, a bow ripple, and splashes where the paddle bites
  emitWater(dt) {
    if (!this.ripples) return;
    const sp = Math.abs(this.speed), f = this.forward, y = this.level + 0.04, st = this.canoe.state;
    // foam bubbles shed from the hull's waterline, most at the bow and stern, left behind as a trail
    if (sp > 0.25) {
      const r = { x: -f.z, z: f.x };
      this.bubbleAcc += dt * (14 + 46 * Math.min(1, sp / 2.5)) * this.timeScale;
      while (this.bubbleAcc >= 1) {
        this.bubbleAcc -= 1;
        let t = Math.random() * 2 - 1;
        t = Math.sign(t) * Math.pow(Math.abs(t), 0.45);
        const side = Math.random() < 0.5 ? -1 : 1;
        const hw = 0.42 * Math.pow(1 - Math.pow(Math.abs(t), 4), 0.6) + 0.1;
        const along = t * 2.5;
        const px = this.x + f.x * along + r.x * side * hw, pz = this.z + f.z * along + r.z * side * hw;
        const out = 0.2 + Math.random() * 0.35, back = (0.05 + Math.random() * 0.2) * sp;
        this.ripples.spawn(3, px, this.level + 0.03, pz, 0.06 + Math.random() * 0.08, 0.16 + Math.random() * 0.2, 1.3 + Math.random() * 1.5,
          r.x * side * out - f.x * back, 0, r.z * side * out - f.z * back);
      }
    }
    if (st.power > 0.4) {
      const prev = this.prevStroke, cur = st.stroke;
      const catchNow = prev > 0.85 && cur < 0.15, exitNow = prev < 0.5 && cur >= 0.5;
      if (catchNow || exitNow) {
        if (catchNow && this.audio) this.audio.paddleDip();
        const b = st.blade.clone();
        this.canoe.rig.localToWorld(b);
        const n = catchNow ? 7 : 4;
        for (let i = 0; i < n; i++) {
          const a = Math.random() * Math.PI * 2, r = 0.4 + Math.random() * 1.2;
          this.ripples.spawn(1, b.x, y + 0.05, b.z, 0.07 + Math.random() * 0.08, 0.05, 0.55 + Math.random() * 0.3,
            Math.cos(a) * r + f.x * sp * 0.4, 1.2 + Math.random() * 1.8, Math.sin(a) * r + f.z * sp * 0.4);
        }
      }
      this.prevStroke = cur;
    }
  }

  updateLanding(dt) {
    // glide the canoe to the launch point, then shoulder it at the trail end
    const L = this.landing, l = L.land.launch, trail = L.land.trail;
    const end = trail.def.pts[L.land.end === 0 ? 0 : trail.def.pts.length - 1];
    const tx = end[0], tz = end[1];
    const dx = tx - this.x, dz = tz - this.z, d = Math.hypot(dx, dz);
    const target = Math.atan2(-dz, dx);
    let dh = target - this.heading; dh = Math.atan2(Math.sin(dh), Math.cos(dh));
    this.heading += dh * (1 - Math.exp(-dt * 2.5));
    this.speed = lerp(this.speed, 1.4, 1 - Math.exp(-dt * 2));
    const f = this.forward;
    this.x += f.x * this.speed * dt; this.z += f.z * this.speed * dt;
    this.canoe.state.power = 0.5; this.canoe.state.stroke = (this.canoe.state.stroke + dt * 0.8) % 1;
    this.placeOnWater(dt);
    this.emitWater(dt);
    this.prompt = { key: null, text: 'Landing…' };
    if (d < 4.5 || this.world.shoreAt(this.x, this.z) > -0.6 || (L.t += dt) > 8) {
      this.mode = 'carry';
      this.carry = { trail, dir: L.land.end === 0 ? 1 : -1, dist: L.land.end === 0 ? 0 : trail.length };
      this.landing = null; this.speed = 0; this.yawRate = 0;
      this.placeOnTrail();
    }
  }

  trailPoint(trail, dist) {
    const { pts, cum } = trail;
    let i = 1;
    while (i < cum.length - 1 && cum[i] < dist) i++;
    const t = clamp((dist - cum[i - 1]) / Math.max(1e-6, cum[i] - cum[i - 1]), 0, 1);
    const x = lerp(pts[i - 1][0], pts[i][0], t), z = lerp(pts[i - 1][1], pts[i][1], t);
    let tx = pts[i][0] - pts[i - 1][0], tz = pts[i][1] - pts[i - 1][1];
    const L = Math.hypot(tx, tz) || 1;
    return { x, z, tx: tx / L, tz: tz / L };
  }

  placeOnTrail() {
    const c = this.carry, p = this.trailPoint(c.trail, c.dist);
    this.x = p.x; this.z = p.z;
    this.heading = Math.atan2(-p.tz * c.dir, p.tx * c.dir);
    const rig = this.canoe.rig;
    rig.position.set(this.x, this.world.heightAt(this.x, this.z) + 0.1, this.z);
    rig.rotation.set(0, this.heading, 0);
    this.canoe.state.mode = 'carry';
  }

  updateCarry(dt) {
    const inp = this.input, c = this.carry, st = this.canoe.state;
    const fwd = (inp.held('KeyW', 'ArrowUp') ? 1 : 0) - (inp.held('KeyS', 'ArrowDown') ? 1 : 0);
    const hustle = inp.held('ShiftLeft', 'ShiftRight');
    const target = fwd * (hustle ? WALK.hustle : WALK.speed);
    this.speed += (target - this.speed) * (1 - Math.exp(-dt * 6));
    c.dist = clamp(c.dist + this.speed * c.dir * dt, 0, c.trail.length);
    st.walkSpeed += ((Math.abs(this.speed) > 0.05 ? 1 : 0) - st.walkSpeed) * (1 - Math.exp(-dt * 8));
    st.walk += Math.abs(this.speed) * dt * 4.2;
    this.placeOnTrail();
    if (this.wakeV) this.wakeV.mesh.visible = false;
    const atEnd = c.dir > 0 ? c.dist >= c.trail.length - 0.01 : c.dist <= 0.01;
    const atStart = c.dir > 0 ? c.dist <= 0.01 : c.dist >= c.trail.length - 0.01;
    const remaining = c.dir > 0 ? c.trail.length - c.dist : c.dist;
    if (atEnd || atStart) {
      const endIdx = (c.dir > 0) === atEnd ? 1 : 0;
      this.prompt = { key: 'E', text: `Launch onto ${this.world.lakeName(c.trail.def.launch[endIdx].lake) || 'the water'}` };
      if (inp.pressed('KeyE')) this.launch(c.trail.def.launch[endIdx]);
    } else {
      this.prompt = { key: null, text: `${c.trail.def.name} · ${Math.round(remaining / 5.0292)} rods to go` };
    }
  }

  // jump to the nearest open water around a map point (minimap click)
  teleport(x, z) {
    const w = this.world;
    let best = null;
    for (let dz = -120; dz <= 120; dz += 5) for (let dx = -120; dx <= 120; dx += 5) {
      const px = x + dx, pz = z + dz;
      if (!w.inBounds(px, pz, 50) || w.shoreAt(px, pz) > -6) continue;
      const d = Math.hypot(dx, dz);
      if (!best || d < best.d) best = { x: px, z: pz, d };
    }
    if (!best) return false;
    this.mode = 'paddle'; this.carry = null; this.landing = null;
    this.x = best.x; this.z = best.z; this.speed = 0; this.yawRate = 0;
    const dir = w.deeperDir(this.x, this.z);
    this.heading = Math.atan2(-dir.z, dir.x);
    this.canoe.state.stroke = 0; this.canoe.state.power = 0;
    this.placeOnWater();
    return true;
  }

  launch(l) {
    const dir = this.world.deeperDir(l.x, l.z);
    this.mode = 'paddle'; this.carry = null;
    this.x = l.x; this.z = l.z;
    this.heading = Math.atan2(-dir.z, dir.x);
    this.speed = 0.8; this.yawRate = 0;
    this.canoe.state.stroke = 0; this.canoe.state.power = 0;
    this.placeOnWater();
  }
}
