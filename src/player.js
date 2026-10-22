import { FLOAT_OFFSET, LENGTH } from './canoe.js';
import { resample } from './props.js';
import { clamp, lerp } from './rng.js';
import { windHeight } from './waves.js';

export class Input {
  constructor() {
    this.down = new Set(); this.once = new Set();
    window.addEventListener('keydown', (e) => { if (e.target && e.target.tagName === 'SELECT') return; if (e.repeat) return; this.down.add(e.code); this.once.add(e.code); if (['Space', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault(); });
    window.addEventListener('keyup', (e) => this.down.delete(e.code));
    window.addEventListener('blur', () => this.down.clear());
  }
  held(...codes) { return codes.some((c) => this.down.has(c)); }
  pressed(code) { const p = this.once.has(code); this.once.delete(code); return p; }
  endFrame() { this.once.clear(); }
}

const PADDLE = { accel: 3.4, hustle: 5.2, reverse: 1.6, drag: 0.15, lin: 0.12, yaw: 0.65, strokeRate: 0.95, hustleRate: 1.35 };
const WALK = { speed: 1.35, hustle: 2.1, turn: 1.7 };
const SWIM = { speed: 0.85, hustle: 1.25, turn: 1.6 };
const CAPSIZE = { threshold: 0.36, build: 1.1, recover: 0.6 };
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
    this.trailCache = new Map(); // portage -> resampled trail, built on first use
    this.carry = null; // { trail, dist, dir }
    this.landing = null; // auto-pilot toward a launch point
    this.ripples = null; this.water = null; this.audio = null; this.wind = null; // set by main
    this.balance = 0; this.extraRoll = 0; this.swim = null; // capsize meter and the swim after a capsize
    this.bubbleAcc = 0; this.prevStroke = 0; this.level = 0;
    this.teleporting = false;
    this.fishing = null; // set by main: while its rod is up the paddle rests and W / Space / E belong to it
    const d = world.deeperDir(this.x, this.z);
    this.heading = Math.atan2(-d.z, d.x);
  }

  get forward() { return { x: Math.cos(this.heading), z: -Math.sin(this.heading) }; }
  get lakeId() { return this.world.lakeIdAt(this.x, this.z); }
  get altitude() { return this.mode === 'carry' ? this.world.heightAt(this.x, this.z) : this.world.levelAt(this.x, this.z); }
  get waveHeightHere() { return this.wind && this.water ? windHeight(this.wind.speed, this.water.fetchAt(this.x, this.z)) : 0.05; }

  trailFor(p) {
    let t = this.trailCache.get(p);
    if (!t) {
      const pts = resample(p.pts, 1.5);
      const cum = [0];
      for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
      t = { def: p, pts, cum, length: cum[cum.length - 1] };
      this.trailCache.set(p, t);
    }
    return t;
  }

  nearestLanding() {
    let best = null;
    for (const p of this.world.portages) {
      for (let end = 0; end < 2; end++) {
        const l = p.launch[end];
        const d = Math.hypot(l.x - this.x, l.z - this.z);
        if (d < LANDING_RADIUS && (!best || d < best.d)) best = { def: p, end, d, launch: l };
      }
    }
    if (best) best.trail = this.trailFor(best.def);
    return best;
  }

  update(dt) {
    dt *= this.timeScale;
    this.time += dt;
    this.prompt = null;
    if (this.teleporting) { this.prompt = { key: null, text: 'Loading the map…' }; this.placeOnWater(); return; }
    if (this.landing) this.updateLanding(dt);
    else if (this.mode === 'carry') this.updateCarry(dt);
    else if (this.mode === 'swim') this.updateSwim(dt);
    else this.updatePaddle(dt);
  }

  updatePaddle(dt) {
    const inp = this.input, w = this.world, st = this.canoe.state;
    if (this.season && this.season.ice > 0.5) {
      // the lakes are frozen: nothing to paddle until ice-out in early May
      this.speed *= 0.9; this.yawRate = 0; st.power *= 0.9;
      this.placeOnWater(dt);
      this.prompt = { key: null, text: 'Iced in: the lakes are frozen until ice-out in early May (= steps the date)' };
      return;
    }
    const rodUp = !!(this.fishing && this.fishing.rodUp);
    let fwd = rodUp ? 0 : (inp.held('KeyW', 'ArrowUp') ? 1 : 0) - (inp.held('KeyS', 'ArrowDown') ? 1 : 0);
    const turn = rodUp ? 0 : (inp.held('KeyA', 'ArrowLeft') ? 1 : 0) - (inp.held('KeyD', 'ArrowRight') ? 1 : 0);
    const hustle = inp.held('ShiftLeft', 'ShiftRight');
    const brace = !rodUp && inp.held('Space');           // a low brace steadies the hull but you cannot paddle
    if (brace) fwd = 0;
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
    // the whole hull must stay in the water (and on a tile that has finished streaming in): centre, bow and stern are tested
    const ok = (x, z, h) => {
      const fx = Math.cos(h), fz = -Math.sin(h);
      return w.inBounds(x, z, 40) && w.isReady(x, z) && w.shoreAt(x, z) < -1.2 && w.shoreAt(x + fx * 2.3, z + fz * 2.3) < -0.5 && w.shoreAt(x - fx * 2.3, z - fz * 2.3) < -0.5;
    };
    const newHeading = this.heading + this.yawRate * dt;
    if (ok(this.x, this.z, newHeading) || !ok(this.x, this.z, this.heading)) this.heading = newHeading; else this.yawRate = 0;
    const f = this.forward;
    const nx = this.x + f.x * this.speed * dt, nz = this.z + f.z * this.speed * dt;
    if (ok(nx, nz, this.heading)) { this.x = nx; this.z = nz; }
    else if (ok(nx, this.z, this.heading)) { this.x = nx; this.speed *= 0.7; }
    else if (ok(this.x, nz, this.heading)) { this.z = nz; this.speed *= 0.7; }
    else {
      this.speed *= -0.15;
      if (!w.inBounds(nx, nz, 40)) this.prompt = { text: 'Edge of the map — turn back', key: null };
      else if (!w.isReady(nx, nz)) this.prompt = { text: 'Loading the lake ahead…', key: null };
    }
    // the wind pushes the hull downwind and swings the bow off the wind (a solo canoe weathercocks)
    if (this.wind) {
      const wd = this.wind.dir, U = this.wind.speed;
      const drift = 0.022 * U * dt;
      const dx = this.x + wd.x * drift, dz = this.z + wd.z * drift;
      if (ok(dx, dz, this.heading)) { this.x = dx; this.z = dz; }
      let dh = Math.atan2(-wd.z, wd.x) - this.heading; dh = Math.atan2(Math.sin(dh), Math.cos(dh));
      this.heading += Math.sin(dh) * 0.004 * U * dt;
    }
    // broadside to a big sea the canoe rolls; quartering the waves or bracing keeps it under you
    const H = this.waveHeightHere;
    const wd = this.wind ? this.wind.dir : { x: 0, z: 1 };
    const cosRel = f.x * wd.x + f.z * wd.z, broadside = Math.sqrt(Math.max(0, 1 - cosRel * cosRel));
    const risk = H * Math.pow(broadside, 1.2) * (brace ? 0.4 : 1);
    this.balance = clamp(this.balance + (risk > CAPSIZE.threshold ? (risk - CAPSIZE.threshold) * CAPSIZE.build : -CAPSIZE.recover) * dt, 0, 1);
    this.extraRoll = this.balance * 0.4 * Math.sin(this.time * 3.1) * (brace ? 0.5 : 1);
    this.placeOnWater(dt);
    this.emitWater(dt);
    if (this.balance >= 1) { this.capsize(); return; }
    if (this.balance > 0.25) this.prompt = { key: null, text: brace ? 'Bracing…' : 'Broadside to the waves — quarter them, or hold Space to brace' };
    const land = rodUp ? null : this.nearestLanding();
    if (land) {
      const p = land.def;
      this.prompt = { key: 'E', text: `Portage: ${p.name} · ${p.rods} rods (${p.lengthM} m)` };
      if (this.input.pressed('KeyE')) this.landing = { land, t: 0 };
    }
  }

  // Over you go. The hull floats upside down and drifts downwind; you are in the water beside it.
  capsize() {
    const f = this.forward, r = { x: -f.z, z: f.x }, side = this.canoe.state.side;
    this.swim = { cx: this.x, cz: this.z, heading: this.heading, t: 0 };
    this.x += r.x * side * 1.1; this.z += r.z * side * 1.1;
    this.mode = 'swim'; this.speed = 0; this.yawRate = 0; this.balance = 0; this.extraRoll = 0;
    this.canoe.state.mode = 'swim'; this.canoe.state.swimHeading = this.heading; this.canoe.state.power = 0;
    if (this.audio) { this.audio.paddleDip(); this.audio.paddleDip(); }
    if (this.ripples) for (let i = 0; i < 40; i++) {
      const a = Math.random() * Math.PI * 2, rr = 0.5 + Math.random() * 2.5;
      this.ripples.spawn(1, this.swim.cx + Math.cos(a) * rr * 0.6, this.level + 0.05, this.swim.cz + Math.sin(a) * rr * 0.6, 0.08 + Math.random() * 0.1, 0.05, 0.6 + Math.random() * 0.5, Math.cos(a) * rr, 1.5 + Math.random() * 2.5, Math.sin(a) * rr);
    }
  }

  updateSwim(dt) {
    const inp = this.input, w = this.world, sw = this.swim, st = this.canoe.state, rig = this.canoe.rig;
    sw.t += dt;
    const fwd = (inp.held('KeyW', 'ArrowUp') ? 1 : 0) - (inp.held('KeyS', 'ArrowDown') ? 1 : 0);
    const turn = (inp.held('KeyA', 'ArrowLeft') ? 1 : 0) - (inp.held('KeyD', 'ArrowRight') ? 1 : 0);
    const hustle = inp.held('ShiftLeft', 'ShiftRight');
    this.heading += turn * SWIM.turn * dt;
    this.speed += (fwd * (hustle ? SWIM.hustle : SWIM.speed) - this.speed) * (1 - Math.exp(-dt * 4));
    const f = this.forward;
    const wd = this.wind ? this.wind.dir : { x: 0, z: 0 }, U = this.wind ? this.wind.speed : 0;
    const swimOk = (x, z) => w.inBounds(x, z, 40) && w.isReady(x, z) && w.shoreAt(x, z) < -0.5;
    const nx = this.x + (f.x * this.speed + wd.x * 0.01 * U) * dt, nz = this.z + (f.z * this.speed + wd.z * 0.01 * U) * dt;
    if (swimOk(nx, nz)) { this.x = nx; this.z = nz; } else this.speed = 0;
    // the empty hull drifts downwind faster than you swim, so do not dawdle
    const cx = sw.cx + wd.x * 0.035 * U * dt, cz = sw.cz + wd.z * 0.035 * U * dt;
    if (w.shoreAt(cx, cz) < -1.5 && w.isReady(cx, cz)) { sw.cx = cx; sw.cz = cz; }
    sw.heading += 0.05 * dt;
    this.level = w.levelAt(this.x, this.z);
    const waveC = this.water ? this.water.waveAt(sw.cx, sw.cz) : 0, waveS = this.water ? this.water.waveAt(this.x, this.z) : 0;
    rig.position.set(sw.cx, w.levelAt(sw.cx, sw.cz) + 0.05 + waveC, sw.cz);
    rig.rotation.set(0, sw.heading, 0);
    this.canoe.swimmer.set(this.x, this.level + waveS - 0.15, this.z);
    st.mode = 'swim'; st.swimHeading = this.heading;
    st.walkSpeed += ((Math.abs(this.speed) > 0.05 ? 1 : 0) - st.walkSpeed) * (1 - Math.exp(-dt * 6));
    st.walk += (0.6 + Math.abs(this.speed)) * dt * 3.0;
    const d = Math.hypot(sw.cx - this.x, sw.cz - this.z);
    if (d < 2.4) {
      this.prompt = { key: 'E', text: 'Right the canoe and climb back in' };
      if (inp.pressed('KeyE')) {
        this.mode = 'paddle'; this.x = sw.cx; this.z = sw.cz; this.heading = sw.heading; this.speed = 0; this.yawRate = 0;
        this.swim = null; st.mode = 'paddle'; st.stroke = 0; this.bob = null; this.balance = 0;
        this.placeOnWater();
      }
    } else this.prompt = { key: null, text: `You are in the water — swim to the canoe (${d.toFixed(0)} m)` };
  }

  placeOnWater(dt = 1 / 60) {
    const w = this.world, rig = this.canoe.rig, st = this.canoe.state;
    const level = w.levelAt(this.x, this.z);
    this.level = level;
    const f = this.forward, r = { x: -f.z, z: f.x };
    const wave = (dx, dz) => (this.water ? this.water.waveAt(this.x + dx, this.z + dz) : 0);
    // a hull averages the water under it: sample five points along the keel, pitch from the ends
    const hb = wave(f.x * 2, f.z * 2), hs = wave(-f.x * 2, -f.z * 2), hm = wave(0, 0), h1 = wave(f.x, f.z), h2 = wave(-f.x, -f.z);
    const hr = wave(r.x * 0.5, r.z * 0.5), hl = wave(-r.x * 0.5, -r.z * 0.5);
    const y = level + FLOAT_OFFSET + (hb + hs + hm + h1 + h2) / 5;
    const pitch = Math.atan2(hb - hs, 4) * 0.6 + this.speed * 0.012;
    const roll = Math.atan2(hr - hl, 1) * 0.5 + this.yawRate * 0.12 + st.side * st.power * 0.035 * Math.sin(st.stroke * Math.PI * 2) + this.extraRoll;
    const k = 1 - Math.exp(-dt * 5);
    if (!this.bob || !Number.isFinite(this.bob.y)) this.bob = { y, pitch, roll };
    if (!Number.isFinite(y)) return;
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
    const L = this.landing, trail = L.land.trail;
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
      const dir = L.land.end === 0 ? 1 : -1;
      const p = this.trailPoint(trail, L.land.end === 0 ? 0 : trail.length);
      this.carry = { trail, dir, drop: null, hitCooldown: 0, startEnd: L.land.end, leftStart: false };
      this.x = p.x; this.z = p.z;
      this.heading = Math.atan2(-p.tz * dir, p.tx * dir);
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
    const rig = this.canoe.rig;
    rig.position.set(this.x, this.world.heightAt(this.x, this.z) + 0.1, this.z);
    rig.rotation.set(0, this.heading, 0);
    this.canoe.state.mode = this.carry && this.carry.drop ? 'walk' : 'carry';
  }

  // nearest point of the trail to (x, z): its distance, and how far along the trail it lies
  nearestOnTrail(trail, x, z) {
    const { pts, cum } = trail;
    let best = { dist: Infinity, along: 0 };
    for (let i = 1; i < pts.length; i++) {
      const ax = pts[i - 1][0], az = pts[i - 1][1], bx = pts[i][0], bz = pts[i][1];
      const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1e-6;
      const t = clamp(((x - ax) * dx + (z - az) * dz) / L2, 0, 1);
      const d = Math.hypot(x - (ax + dx * t), z - (az + dz * t));
      if (d < best.dist) best = { dist: d, along: cum[i - 1] + t * Math.sqrt(L2) };
    }
    return best;
  }

  // Portaging is walked, not ridden: steer with A/D, stay near the trail (the bush beside it is slow, and
  // past 14 m it turns you back), trunks block you, and the hull overhead catches on trees. A caught hull
  // may come down; then you walk back and shoulder it again.
  updateCarry(dt) {
    const inp = this.input, c = this.carry, st = this.canoe.state, w = this.world, trail = c.trail;
    const fwd = (inp.held('KeyW', 'ArrowUp') ? 1 : 0) - (inp.held('KeyS', 'ArrowDown') ? 1 : 0);
    const turn = (inp.held('KeyA', 'ArrowLeft') ? 1 : 0) - (inp.held('KeyD', 'ArrowRight') ? 1 : 0);
    const hustle = inp.held('ShiftLeft', 'ShiftRight');
    const dropped = !!c.drop;
    this.heading += turn * WALK.turn * dt * (this.speed < -0.1 ? -1 : 1);
    this.speed += (fwd * (hustle ? WALK.hustle : WALK.speed) * (dropped ? 1.2 : 1) - this.speed) * (1 - Math.exp(-dt * 6));
    const f = this.forward;
    let nx = this.x + f.x * this.speed * dt, nz = this.z + f.z * this.speed * dt;
    let note = null;
    const near = this.nearestOnTrail(trail, nx, nz);
    if (near.dist > 14) { nx = this.x; nz = this.z; this.speed *= 0.5; note = 'Thick brush — back to the trail'; }
    else if (near.dist > 6) { this.speed *= 0.5; note = 'Bushwhacking…'; }
    const trees = w.tiles ? w.tiles.treesNear(nx, nz, 4.5) : [];
    for (const t of trees) {
      const d = Math.hypot(t.x - nx, t.z - nz), keep = t.r + 0.35;
      if (d < keep && d > 1e-4) { nx = t.x + ((nx - t.x) / d) * keep; nz = t.z + ((nz - t.z) / d) * keep; this.speed *= 0.3; }
    }
    if (!dropped) {
      c.hitCooldown -= dt;
      for (const t of trees) {
        // the hull overhead is a 5 m log from 2.2 m behind the walker to 3 m ahead
        const px = t.x - nx, pz = t.z - nz, along = px * f.x + pz * f.z;
        if (along < -2.2 || along > 3.0) continue;
        const across = Math.abs(px * -f.z + pz * f.x);
        const hullHalf = 0.46 * Math.pow(Math.max(0, 1 - Math.pow(Math.abs((along - 0.35) / 2.6), 4)), 0.6) + 0.05;
        if (across < t.r + hullHalf && c.hitCooldown <= 0) {
          c.hitCooldown = 1.3;
          nx = this.x; nz = this.z; this.speed = -0.25;
          if (this.audio) this.audio.paddleDip();
          if (Math.random() < 0.45) this.dropHull(); else note = 'The canoe caught a tree';
          break;
        }
      }
    }
    this.x = nx; this.z = nz;
    st.walkSpeed += ((Math.abs(this.speed) > 0.05 ? 1 : 0) - st.walkSpeed) * (1 - Math.exp(-dt * 8));
    st.walk += Math.abs(this.speed) * dt * 4.2;
    this.placeOnTrail();
    if (dropped) {
      const dd = Math.hypot(c.drop.x - this.x, c.drop.z - this.z);
      if (dd < 2.6) { this.prompt = { key: 'E', text: 'Shoulder the canoe' }; if (inp.pressed('KeyE')) this.pickUpHull(); }
      else this.prompt = { key: null, text: `The canoe is on the ground ${dd.toFixed(0)} m back` };
      return;
    }
    const pts = trail.pts, e0 = pts[0], e1 = pts[pts.length - 1];
    const d0 = Math.hypot(e0[0] - this.x, e0[1] - this.z), d1 = Math.hypot(e1[0] - this.x, e1[1] - this.z);
    if ((c.startEnd === 0 ? d0 : d1) > 9) c.leftStart = true; // you can turn back and launch where you landed, once you have walked away
    const canLaunch = (end) => end !== c.startEnd || c.leftStart;
    if ((d0 < 5 && canLaunch(0)) || (d1 < 5 && canLaunch(1))) {
      const endIdx = d1 < d0 && canLaunch(1) ? 1 : 0;
      this.prompt = { key: 'E', text: `Launch onto ${w.lakeName(trail.def.launch[endIdx].lake) || 'the water'}` };
      if (inp.pressed('KeyE')) this.launch(trail.def.launch[endIdx]);
    } else {
      const remaining = c.dir > 0 ? trail.length - near.along : near.along;
      this.prompt = { key: null, text: note || `${trail.def.name} · ${Math.round(remaining / 5.0292)} rods to go` };
    }
  }

  dropHull() {
    const c = this.carry, f = this.forward;
    const x = this.x + f.x * 0.9, z = this.z + f.z * 0.9, heading = this.heading + (Math.random() - 0.5) * 0.8;
    c.drop = { x, z, heading };
    this.canoe.dropHull(x, this.world.heightAt(x, z), z, heading);
    this.canoe.state.mode = 'walk';
    this.prompt = { key: null, text: 'The canoe came down' };
  }

  pickUpHull() {
    this.canoe.pickUpHull();
    this.carry.drop = null; this.carry.hitCooldown = 1.0;
    this.canoe.state.mode = 'carry';
  }

  // Jump to the nearest open water around a map point (minimap click, entry point). The tiles around the
  // target stream in first; the canoe sits still until they are there.
  async teleport(x, z) {
    const w = this.world;
    if (this.teleporting) return false;
    this.teleporting = true;
    try {
      if (w.tiles) await w.tiles.ensure(x, z, 130);
      let best = null;
      for (let dz = -120; dz <= 120; dz += 5) for (let dx = -120; dx <= 120; dx += 5) {
        const px = x + dx, pz = z + dz;
        if (!w.inBounds(px, pz, 50) || !w.isReady(px, pz) || w.shoreAt(px, pz) > -6) continue;
        const d = Math.hypot(dx, dz);
        if (!best || d < best.d) best = { x: px, z: pz, d };
      }
      if (!best) return false;
      this.mode = 'paddle'; this.carry = null; this.landing = null;
      this.x = best.x; this.z = best.z; this.speed = 0; this.yawRate = 0;
      if (w.tiles) await w.tiles.ensure(this.x, this.z, 20);
      const dir = w.deeperDir(this.x, this.z);
      this.heading = Math.atan2(-dir.z, dir.x);
      this.canoe.state.stroke = 0; this.canoe.state.power = 0;
      this.bob = null;
      this.placeOnWater();
      return true;
    } finally { this.teleporting = false; }
  }

  launch(l) {
    const dir = this.world.deeperDir(l.x, l.z);
    this.mode = 'paddle'; this.carry = null; this.balance = 0; this.extraRoll = 0;
    this.x = l.x; this.z = l.z;
    this.heading = Math.atan2(-dir.z, dir.x);
    this.speed = 0.8; this.yawRate = 0;
    this.canoe.state.stroke = 0; this.canoe.state.power = 0;
    this.placeOnWater();
  }
}
