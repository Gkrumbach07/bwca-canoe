import { FLOAT_OFFSET, LENGTH } from './canoe.js';
import { resample } from './props.js';
import { clamp, lerp } from './rng.js';
import { windHeight } from './waves.js';
import { GROUND, surfaceAt } from './terrain-build.js';

export class Input {
  constructor() {
    this.down = new Set(); this.once = new Set();
    this.paused = false; // a panel is open: keys are not the paddle's
    window.addEventListener('keydown', (e) => { if (e.target && e.target.tagName === 'SELECT') return; if (e.repeat) return; this.down.add(e.code); this.once.add(e.code); if (['Space', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault(); });
    window.addEventListener('keyup', (e) => this.down.delete(e.code));
    window.addEventListener('blur', () => this.down.clear());
  }
  held(...codes) { return !this.paused && codes.some((c) => this.down.has(c)); }
  pressed(code) { const p = this.once.has(code); this.once.delete(code); return p && !this.paused; }
  endFrame() { this.once.clear(); }
}

const PADDLE = { accel: 3.4, hustle: 5.2, reverse: 1.6, drag: 0.15, lin: 0.12, yaw: 0.65, strokeRate: 0.95, hustleRate: 1.35 };
const WALK = { speed: 1.5, hustle: 2.2, carry: 1.2, carryHustle: 1.7, face: 7 }; // face: how fast the walker turns to where the keys point
const SWIM = { speed: 0.85, hustle: 1.25, turn: 1.6 };
const CAPSIZE = { threshold: 0.36, build: 1.1, recover: 0.6 };
const LANDING_RADIUS = 28;
const ASHORE_RADIUS = 6;      // metres of water between the hull and a shore within which you can step out
const TRAIL_WIDTH = 5;        // metres either side of a portage that walk like the trail
const HULL_REACH = 3;         // metres from a canoe on the ground within which you can shoulder or launch it
const GROUNDS = 40;           // metres around an outfitter's landing that are its cleared yard and dock
const FLOAT_SD = -3.5;        // shoreAt where a canoe floats clear (the paddle wants 1.2 m under the middle and 0.5 m under the ends)
const WADE_SD = -2.5;         // shoreAt beyond which the water is too deep to wade
const MAX_GRADE = Math.tan((40 * Math.PI) / 180);
const RODS = 5.0292;
// how the bush walks compared with a trail, by ground class (terrain-build GROUND): open bedrock and a
// meadow are easy, the forest is brush and deadfall, dark spruce is a thicket, a burn a tangle of fallen snags
const GOING = { rock: 1.0, rockDark: 0.85, rockLichen: 1.0, forest: 0.8, forestLight: 0.9, forestDark: 0.65, meadow: 0.95, burn: 0.7 };
const LAND = { rock: 'Bare rock', rockDark: 'A rock face', rockLichen: 'Bare rock', meadow: 'A clearing', burn: 'Old burn', forest: 'The woods', forestLight: 'The woods', forestDark: 'Dark spruce' };

export class Player {
  constructor(world, canoe, input) {
    this.world = world; this.canoe = canoe; this.input = input;
    this.mode = 'paddle'; // 'paddle' | 'carry' (the canoe on your shoulders) | 'walk' (on foot, the canoe on the ground somewhere) | 'swim'
    this.x = world.meta.start.x; this.z = world.meta.start.z;
    this.heading = 0; this.speed = 0; this.yawRate = 0; this.time = 0;
    this.strokeCount = 0;
    this.prompt = null;
    this.timeScale = 1;
    this.trailCache = new Map(); // portage -> resampled trail, built on first use
    this.carry = null; // on foot: { trail, drop: { x, z, heading } | null, hitCooldown, from: { x, z } | null, choice }
    this.landing = null; // auto-pilot toward a portage launch point
    this.ashore = null;  // auto-pilot nosing in to a bank: { sx, sz, t }
    this.placeName = null; this.campsite = null; this.onTrail = false; // where you are on foot, for the HUD
    this.placeCache = { ci: NaN, cj: NaN, id: 0 };
    this.ripples = null; this.water = null; this.audio = null; this.wind = null; // set by main
    this.balance = 0; this.extraRoll = 0; this.swim = null; // capsize meter and the swim after a capsize
    this.bubbleAcc = 0; this.prevStroke = 0; this.level = 0;
    this.teleporting = false;
    this.fishing = null; // set by main: while its rod is up the paddle rests and W / Space / E belong to it
    this.loadFactor = 1;          // the pack's weight on the portages: 1 empty, set by the trip (food, the canoe)
    this.suppressLanding = false; // at an outfitter's dock E is the outfitter's, not a portage's
    this.chase = null;            // set by main: the view's bearing (walking is read against it) and the cursor
    this.cursorSteer = false;     // settings: with W held the bow seeks the cursor's point on the water
    this.assist = 0;              // the eased steering toward where you point, when that is on
    this.footLatch = { keys: 4, h: 0 }; // on foot without mouse look: the bearing the held keys meant when pressed
    const d = world.deeperDir(this.x, this.z);
    this.heading = Math.atan2(-d.z, d.x);
  }

  get forward() { return { x: Math.cos(this.heading), z: -Math.sin(this.heading) }; }
  get lakeId() { return this.world.lakeIdAt(this.x, this.z); }
  get onFoot() { return this.mode === 'carry' || this.mode === 'walk'; }
  get altitude() { return this.onFoot ? this.groundAt(this.x, this.z) : this.world.levelAt(this.x, this.z); }
  get waveHeightHere() { return this.wind && this.water ? windHeight(this.wind.speed, this.water.fetchAt(this.x, this.z)) : 0.05; }
  // where the canoe lies when it is not with you (beached or set down), for the map
  get hullDown() { return this.carry && this.carry.drop ? this.carry.drop : null; }
  get modeLabel() {
    if (this.mode === 'carry') return this.onTrail ? 'Portaging' : 'Carrying the canoe';
    if (this.mode === 'walk') return 'On foot';
    return this.mode === 'swim' ? 'Swimming' : 'Paddling';
  }
  // the height things stand on: the terrain as the mesh is built (reshaped in the shore band)
  groundAt(x, z) { return surfaceAt(this.world, x, z); }

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

  // the portage trail nearest (x, z) within r metres: { def, trail, dist, along } or null
  nearestTrail(x, z, r = 30) {
    let best = null;
    for (const p of this.world.portages) {
      const b = p.bbox;
      if (x < b[0] - r || x > b[2] + r || z < b[1] - r || z > b[3] + r) continue;
      const trail = this.trailFor(p), n = this.nearestOnTrail(trail, x, z);
      if (n.dist < r && (!best || n.dist < best.dist)) best = { def: p, trail, dist: n.dist, along: n.along };
    }
    return best;
  }

  nearCampsite(x, z, r = 10) {
    let best = null;
    for (const c of this.world.campsites) {
      const dx = c.x - x, dz = c.z - z;
      if (dx > r || dx < -r || dz > r || dz < -r) continue;
      const d = Math.hypot(dx, dz);
      if (d < r && (!best || d < best.d)) best = { site: c, d };
    }
    return best ? best.site : null;
  }

  // an outfitter's landing within r metres: its yard and dock are cleared ground
  nearEntry(x, z, r) {
    for (const e of this.world.entryPoints) {
      const dx = e.x - x, dz = e.z - z;
      if (dx < r && dx > -r && dz < r && dz > -r && dx * dx + dz * dz < r * r) return true;
    }
    return false;
  }

  // The move keys as a vector in the view's frame: W into the screen, D to its right.
  moveKeys() {
    const inp = this.input;
    const iy = (inp.held('KeyW', 'ArrowUp') ? 1 : 0) - (inp.held('KeyS', 'ArrowDown') ? 1 : 0);
    const ix = (inp.held('KeyD', 'ArrowRight') ? 1 : 0) - (inp.held('KeyA', 'ArrowLeft') ? 1 : 0);
    return { ix, iy, keys: (ix + 1) * 3 + (iy + 1), moving: ix !== 0 || iy !== 0 };
  }

  // Which way to face and which way to go, from the keys. With mouse look (first person, and on foot in
  // third person) the body faces the look at once and the keys move relative to it, A and D strafing.
  // Otherwise (swimming in third person) the keys name a bearing relative to the view, fixed while they are
  // held, and the body turns to face it at `face` rad/s and moves along its own heading.
  steerOnFoot(dt, face) {
    const { ix, iy, keys, moving } = this.moveKeys(), ch = this.chase, L = this.footLatch;
    if (ch && ch.mouseLook) {
      this.heading = ch.forwardYaw;
      const f = this.forward, r = { x: -f.z, z: f.x };
      const mx = f.x * iy + r.x * ix, mz = f.z * iy + r.z * ix, n = Math.hypot(mx, mz) || 1;
      return { moving, mx: mx / n, mz: mz / n };
    }
    if (moving && (keys !== L.keys || !ch || ch.dragging)) {
      const vy = ch ? ch.forwardYaw : this.heading;
      const fx = Math.cos(vy), fz = -Math.sin(vy), rx = -fz, rz = fx;
      L.h = Math.atan2(-(fz * iy + rz * ix), fx * iy + rx * ix);
    }
    L.keys = keys;
    if (moving) { let dh = L.h - this.heading; dh = Math.atan2(Math.sin(dh), Math.cos(dh)); this.heading += clamp(dh, -face * dt, face * dt); }
    const f = this.forward;
    return { moving, mx: f.x, mz: f.z };
  }

  // the lake whose water is nearest (x, z) within r cells, or 0; remembered per cell
  nearWater(x, z, r = 8) {
    const w = this.world, ci = w.cellI(x), cj = w.cellJ(z), pc = this.placeCache;
    if (pc.ci === ci && pc.cj === cj && pc.r === r) return pc.id;
    let best = 0, bd = Infinity;
    for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
      const id = w.lakeCell(ci + di, cj + dj);
      if (!id) continue;
      const d = di * di + dj * dj;
      if (d < bd) { bd = d; best = id; }
    }
    pc.ci = ci; pc.cj = cj; pc.r = r; pc.id = best;
    return best;
  }

  update(dt) {
    dt *= this.timeScale;
    this.time += dt;
    this.prompt = null; this.placeName = null; this.campsite = null; this.onTrail = false;
    if (this.teleporting) { this.prompt = { key: null, text: 'Loading the map…' }; this.placeOnWater(); return; }
    if (this.landing) this.updateLanding(dt);
    else if (this.ashore) this.updateAshore(dt);
    else if (this.onFoot) this.updateFoot(dt);
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
    // A/D turn while held, as sweep strokes. With steering by where you point switched on (settings) and
    // neither held, paddling forward brings the bow round toward the cursor's point on the water, or toward
    // the look in first person; the assist eases so the hull swings, not snaps.
    let steer = turn;
    if (this.cursorSteer) {
      let want = 0;
      if (turn === 0 && fwd > 0 && this.chase) {
        if (this.chase.mode === 'first') { // from the seat there is no cursor: the bow seeks the look
          const dh = this.chase.lookYaw;
          want = Math.abs(dh) < 0.04 ? 0 : clamp(dh / 0.3, -1, 1);
        } else {
          const pt = this.chase.cursorOnPlane(this.level);
          if (pt) {
            let dh = Math.atan2(-(pt.z - this.z), pt.x - this.x) - this.heading; dh = Math.atan2(Math.sin(dh), Math.cos(dh));
            want = Math.hypot(pt.x - this.x, pt.z - this.z) < 3 ? 0 : clamp(dh / 0.3, -1, 1);
          }
        }
      }
      this.assist += (want - this.assist) * (1 - Math.exp(-dt * 8));
      if (turn === 0) steer = this.assist;
    } else this.assist = 0;
    // stroke cycle drives both the animation and the thrust pulses
    const rate = hustle ? PADDLE.hustleRate : PADDLE.strokeRate;
    const biased = Math.abs(steer) > 0.15; // the paddle stays on the side that holds the course
    if (paddling || st.stroke > 0.02) {
      const prev = st.stroke;
      st.stroke = (st.stroke + dt * rate * (fwd < 0 ? 0.8 : 1)) % 1;
      if (st.stroke < prev) { this.strokeCount++; if (!biased && this.strokeCount % 7 === 0) st.side *= -1; }
      if (!paddling && st.stroke < prev) st.stroke = 0;
    }
    if (biased) st.side = steer > 0 ? 1 : -1;
    st.power += ((paddling ? 1 : 0) - st.power) * (1 - Math.exp(-dt * 6));
    const pulse = st.stroke < 0.5 ? Math.sin((st.stroke / 0.5) * Math.PI) : 0;
    let a = 0;
    if (fwd > 0) a = (hustle ? PADDLE.hustle : PADDLE.accel) * pulse;
    else if (fwd < 0) a = -PADDLE.reverse * pulse;
    else if (turn !== 0) a = 0.6 * pulse; // sweep strokes still push a little
    this.speed += a * dt;
    this.speed -= (this.speed * Math.abs(this.speed) * PADDLE.drag + this.speed * PADDLE.lin) * dt;
    const yawTarget = steer * PADDLE.yaw * (0.55 + 0.45 * clamp(Math.abs(this.speed) / 1.5, 0, 1)) * (this.speed < -0.2 ? -1 : 1);
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
    if (rodUp) return;
    // a portage landing takes the canoe to the trailhead; any other bank close enough lets you step out
    const land = this.suppressLanding ? null : this.nearestLanding();
    const gap = this.shoreGap();
    if (land) {
      const p = land.def;
      this.prompt = { key: 'E', text: `Portage: ${p.name} · ${p.rods} rods (${p.lengthM} m)${gap ? ' &nbsp; <kbd>Q</kbd>Go ashore here' : ''}` };
      if (inp.pressed('KeyE')) this.landing = { land, t: 0 };
      else if (gap && inp.pressed('KeyQ')) this.goAshore(gap);
    } else if (gap) {
      this.prompt = { key: 'E', text: 'Go ashore' };
      if (inp.pressed('KeyE')) this.goAshore(gap);
    }
  }

  // The nearest shore to the hull (middle, bow and stern are tried): { x, z, sd } of the closest sample, or
  // null when there is more than ASHORE_RADIUS metres of water between.
  shoreGap() {
    const w = this.world, f = this.forward;
    let best = null;
    for (const t of [0, 2.4, -2.4]) {
      const px = this.x + f.x * t, pz = this.z + f.z * t, sd = w.shoreAt(px, pz);
      if (-sd < ASHORE_RADIUS && (!best || sd > best.sd)) best = { x: px, z: pz, sd };
    }
    return best;
  }

  // Nose in: steer for the point of the shoreline nearest the hull, then step out there.
  goAshore(at) {
    const g = this.world.deeperDir(at.x, at.z);
    this.ashore = { sx: at.x + g.x * at.sd, sz: at.z + g.z * at.sd, t: 0 };
  }

  updateAshore(dt) {
    const A = this.ashore, w = this.world, st = this.canoe.state;
    A.t += dt;
    const dx = A.sx - this.x, dz = A.sz - this.z, d = Math.hypot(dx, dz);
    const target = Math.atan2(-dz, dx);
    let dh = target - this.heading; dh = Math.atan2(Math.sin(dh), Math.cos(dh));
    this.heading += dh * (1 - Math.exp(-dt * 2.5));
    this.speed = lerp(this.speed, 1.2, 1 - Math.exp(-dt * 2));
    const f = this.forward;
    this.x += f.x * this.speed * dt; this.z += f.z * this.speed * dt;
    st.power = 0.5; st.stroke = (st.stroke + dt * 0.8) % 1;
    this.placeOnWater(dt);
    this.emitWater(dt);
    this.prompt = { key: null, text: 'Nosing in…' };
    const bowSd = w.shoreAt(this.x + f.x * 2.6, this.z + f.z * 2.6);
    if (bowSd > 0.6 || d < 1.0 || A.t > 8) this.stepOut();
  }

  // The bow grounds: the hull is beached with its nose up the bank and its stern afloat, and you stand beside
  // it on the land with the choice of shouldering it or leaving it there.
  stepOut() {
    const w = this.world;
    let sx = this.x, sz = this.z, sd = w.shoreAt(sx, sz);
    for (let i = 0; i < 12 && Math.abs(sd) > 0.15; i++) { const g = w.deeperDir(sx, sz); sx += g.x * sd; sz += g.z * sd; sd = w.shoreAt(sx, sz); } // walk the distance field onto the waterline
    const g = w.deeperDir(sx, sz), lx = -g.x, lz = -g.z; // landward
    const heading = Math.atan2(-lz, lx);
    const hx = sx + lx * 0.8, hz = sz + lz * 0.8;
    const side = this.canoe.state.side || 1, rx = -lz, rz = lx;
    let px = sx + lx * 2.2 + rx * side * 1.3, pz = sz + lz * 2.2 + rz * side * 1.3;
    if (w.shoreAt(px, pz) < 0.3 || !w.isReady(px, pz)) { px = sx + lx * 3.0; pz = sz + lz * 3.0; }
    this.x = px; this.z = pz; this.heading = heading; this.speed = 0; this.yawRate = 0;
    this.mode = 'walk'; this.ashore = null; this.balance = 0; this.extraRoll = 0; this.bob = null;
    this.carry = { trail: null, drop: { x: hx, z: hz, heading }, hitCooldown: 0, from: null, choice: true };
    this.canoe.state.stroke = 0; this.canoe.state.power = 0;
    this.restHull(hx, hz, heading);
    this.placeOnGround();
    if (this.audio) this.audio.paddleDip();
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
    const hustle = inp.held('ShiftLeft', 'ShiftRight');
    const { moving, mx, mz } = this.steerOnFoot(dt, SWIM.turn * 3);
    this.speed += ((moving ? 1 : 0) * (hustle ? SWIM.hustle : SWIM.speed) - this.speed) * (1 - Math.exp(-dt * 4));
    const wd = this.wind ? this.wind.dir : { x: 0, z: 0 }, U = this.wind ? this.wind.speed : 0;
    const swimOk = (x, z) => w.inBounds(x, z, 40) && w.isReady(x, z) && w.shoreAt(x, z) < -0.5;
    const nx = this.x + (mx * this.speed + wd.x * 0.01 * U) * dt, nz = this.z + (mz * this.speed + wd.z * 0.01 * U) * dt;
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
      this.carry = { trail, drop: null, hitCooldown: 0, from: { x: p.x, z: p.z }, choice: false };
      this.x = p.x; this.z = p.z;
      this.heading = Math.atan2(-p.tz * dir, p.tx * dir);
      this.landing = null; this.speed = 0; this.yawRate = 0; this.bob = null;
      this.placeOnGround();
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

  placeOnGround() {
    const rig = this.canoe.rig;
    rig.position.set(this.x, this.groundAt(this.x, this.z) + 0.1, this.z);
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

  // On foot, with or without the canoe, anywhere on the land. Steer with A/D. A portage trail walks at full
  // speed; off it the ground says how thick the bush is and a hill costs more, with a 40° slope a wall. Trunks
  // block you, and with the hull overhead it catches on trees and may come down. Water past the knees stops you.
  updateFoot(dt) {
    const inp = this.input, c = this.carry, st = this.canoe.state, w = this.world;
    const carrying = !c.drop;
    const hustle = inp.held('ShiftLeft', 'ShiftRight');
    c.hitCooldown -= dt;
    const { moving, mx, mz } = this.steerOnFoot(dt, WALK.face); // (mx, mz): the way the walker goes; f: the way the body faces
    const fwd = moving ? 1 : 0;
    const f = this.forward;
    const trail = this.nearestTrail(this.x, this.z), onTrail = !!trail && trail.dist < TRAIL_WIDTH;
    const camp = this.nearCampsite(this.x, this.z), yard = !camp && this.nearEntry(this.x, this.z, GROUNDS);
    this.onTrail = onTrail; this.campsite = camp;
    let note = null;
    // the going: a trail, a campsite and an outfitter's yard are cleared; elsewhere the ground class says how
    // thick the bush is, and the first metres of cedar and alder up from a shore are thicker still
    const cls = GROUND[(w.coverCell(w.cellI(this.x), w.cellJ(this.z)) >> 16) & 255];
    const cleared = onTrail || !!camp || yard;
    let going = 1;
    if (!cleared) {
      const sd = w.shoreAt(this.x, this.z);
      going = (GOING[cls] ?? 0.8) * (sd < 12 ? 0.85 + 0.15 * clamp((sd - 3) / 9, 0, 1) : 1);
    }
    // the hill: the grade a step ahead in the direction of travel slows you and a 40° slope stops you; a
    // trail is graded, so half the penalty and never a wall
    const step = 1.5;
    const grade = (this.groundAt(this.x + mx * step, this.z + mz * step) - this.groundAt(this.x, this.z)) / step;
    let wall = null;
    if (!onTrail && grade > MAX_GRADE) wall = 'Too steep to climb here';
    else if (!onTrail && grade < -1.2) wall = 'A drop — find another way down';
    else if (grade > 0) going *= 1 - (cleared ? 0.45 : 0.7) * Math.pow(Math.min(1, grade / MAX_GRADE), 1.3);
    else going *= 1 - (cleared ? 0.2 : 0.4) * Math.min(1, -grade / MAX_GRADE);
    // a heavy pack (the trip's food, the canoe's weight) is a slower walk
    const base = (carrying ? (hustle ? WALK.carryHustle : WALK.carry) : (hustle ? WALK.hustle : WALK.speed)) / Math.pow(Math.max(1, this.loadFactor), 0.6);
    if (fwd !== 0 && wall) note = wall;
    const want = wall ? 0 : fwd * base * Math.max(0.3, going);
    this.speed += (want - this.speed) * (1 - Math.exp(-dt * 6));
    let nx = this.x + mx * this.speed * dt, nz = this.z + mz * this.speed * dt;
    if (!w.inBounds(nx, nz, 40)) { nx = this.x; nz = this.z; this.speed = 0; note = 'Edge of the map — turn back'; }
    else if (!w.isReady(nx, nz)) { nx = this.x; nz = this.z; this.speed = 0; note = 'Loading the land ahead…'; }
    else if (w.shoreAt(nx, nz) < WADE_SD) { nx = this.x; nz = this.z; this.speed *= 0.3; note = 'Too deep to wade'; }
    const trees = w.tiles ? w.tiles.treesNear(nx, nz, 4.5) : [];
    for (const t of trees) {
      if (t.box) { // a dock, a shack, a tent: held off the nearest face, sliding along it
        const px = nx - t.x, pz = nz - t.z, a = px * t.ux + pz * t.uz, b = -px * t.uz + pz * t.ux;
        const ka = t.hx + 0.35, kb = t.hz + 0.35;
        if (Math.abs(a) < ka && Math.abs(b) < kb) {
          const da = ka - Math.abs(a), db = kb - Math.abs(b);
          if (da < db) { const s = Math.sign(a) || 1; nx += t.ux * s * da; nz += t.uz * s * da; }
          else { const s = Math.sign(b) || 1; nx += -t.uz * s * db; nz += t.ux * s * db; }
          this.speed *= 0.8;
        }
        continue;
      }
      const dx = nx - t.x, dz = nz - t.z, d = Math.hypot(dx, dz), keep = t.r + 0.35;
      if (d < keep && d > 1e-4) {
        // held off the trunk, and eased round it to whichever side you were already passing on
        const side = Math.sign(dx * -mz + dz * mx) || 1;
        nx = t.x + (dx / d) * keep - mz * side * 0.02; nz = t.z + (dz / d) * keep + mx * side * 0.02;
        this.speed *= 0.8;
      }
    }
    if (carrying) {
      for (const t of trees) {
        if (t.rock || t.box) continue; // the hull rides above a boulder; a wall already holds the walker off
        // the hull overhead is a 5 m log from 2.2 m behind the walker to 3 m ahead
        const px = t.x - nx, pz = t.z - nz, along = px * f.x + pz * f.z;
        if (along < -2.2 || along > 3.0) continue;
        const across = Math.abs(px * -f.z + pz * f.x);
        const hullHalf = 0.46 * Math.pow(Math.max(0, 1 - Math.pow(Math.abs((along - 0.35) / 2.6), 4)), 0.6) + 0.05;
        if (across < t.r + hullHalf && c.hitCooldown <= 0) {
          c.hitCooldown = 1.3;
          nx = this.x; nz = this.z; this.speed = -0.25;
          if (this.audio) this.audio.paddleDip();
          if (Math.random() < 0.45) { this.dropHull(); note = 'The canoe came down'; } else note = 'The canoe caught a tree';
          break;
        }
      }
    }
    this.x = nx; this.z = nz;
    st.walkSpeed += ((Math.abs(this.speed) > 0.05 ? 1 : 0) - st.walkSpeed) * (1 - Math.exp(-dt * 8));
    st.walk += Math.abs(this.speed) * dt * 4.2;
    this.placeOnGround();
    if (!note && !cleared && fwd !== 0 && going < 0.6) note = going < 0.42 ? 'Thick brush…' : 'Bushwhacking…';
    // where you are, for the HUD header
    if (camp) { const id = this.nearWater(camp.x, camp.z, 6); this.placeName = camp.name ? `${camp.name} campsite` : `Campsite${id ? ' · ' + (w.lakeName(id) || 'unnamed water') : ''}`; }
    else if (onTrail) this.placeName = trail.def.name;
    else { const id = this.nearWater(this.x, this.z, 8); this.placeName = id ? `${w.lakeName(id) || 'Unnamed water'} shore` : LAND[cls] || 'The woods'; }
    let trailText = null;
    if (onTrail) {
      const p = this.trailPoint(trail.trail, trail.along);
      const remaining = p.tx * f.x + p.tz * f.z >= 0 ? trail.trail.length - trail.along : trail.along;
      trailText = `${trail.def.name} · ${Math.round(remaining / RODS)} rods to go`;
    }
    this.footPrompts(c, trail, note, trailText);
  }

  // one prompt line: a note or where you are, then the keys that do something here
  say(info, ...acts) {
    const keys = acts.filter(Boolean).map(([k, t]) => `<kbd>${k}</kbd>${t}`).join(' &nbsp; ');
    const text = info ? (keys ? `${info} &nbsp;·&nbsp; ${keys}` : info) : keys;
    this.prompt = text ? { key: null, text } : null;
  }

  footPrompts(c, trail, note, trailText) {
    const inp = this.input, w = this.world;
    const lakeOf = (id) => w.lakeName(id) || 'the water';
    if (c.drop) {
      const d = c.drop, dd = Math.hypot(d.x - this.x, d.z - this.z);
      if (dd > HULL_REACH) c.choice = false;
      if (dd <= HULL_REACH) {
        if (c.choice) { // just stepped out: take it along, or leave it beached here
          this.say(note, ['E', 'Shoulder the canoe'], ['Q', 'Leave it here']);
          if (inp.pressed('KeyE')) this.pickUpHull(); else if (inp.pressed('KeyQ')) c.choice = false;
          return;
        }
        const L = this.launchFrom(d.x, d.z, 8); // a canoe lying at the water's edge; one further up the bank is carried
        if (L && L.deep) {
          this.say(note, ['E', `Launch onto ${lakeOf(L.lake)}`], ['Q', 'Shoulder the canoe']);
          if (inp.pressed('KeyE')) this.launch(L); else if (inp.pressed('KeyQ')) this.pickUpHull();
        } else {
          this.say(note || (L ? 'Too shallow to launch here' : null), ['E', 'Shoulder the canoe']);
          if (inp.pressed('KeyE')) this.pickUpHull();
        }
        return;
      }
      this.say(note || trailText || `The canoe is ${dd < 1000 ? `${dd.toFixed(0)} m` : `${(dd / 1000).toFixed(1)} km`} away`);
      return;
    }
    // carrying: launch at a trail end where the map says, or at any shore with a metre of water within reach,
    // once you have walked a few steps from where you shouldered it (so E does not put it straight back in);
    // otherwise set it down
    if (c.from && Math.hypot(c.from.x - this.x, c.from.z - this.z) > 6) c.from = null;
    const away = !c.from;
    let L = null;
    if (trail && trail.dist < 12) {
      const pts = trail.trail.pts, e0 = pts[0], e1 = pts[pts.length - 1];
      const d0 = Math.hypot(e0[0] - this.x, e0[1] - this.z), d1 = Math.hypot(e1[0] - this.x, e1[1] - this.z);
      if (Math.min(d0, d1) < 5) { const l = trail.def.launch[d1 < d0 ? 1 : 0]; L = { x: l.x, z: l.z, lake: l.lake, deep: true }; }
    }
    if (!L && w.shoreAt(this.x, this.z) < 8) L = this.launchFrom(this.x, this.z, 12);
    if (L && L.deep && away) {
      this.say(note || trailText, ['E', `Launch onto ${lakeOf(L.lake)}`], ['Q', 'Set the canoe down']);
      if (inp.pressed('KeyE')) this.launch(L); else if (inp.pressed('KeyQ')) this.dropHull(true);
    } else {
      this.say(note || trailText || (L && !L.deep ? 'Too shallow to launch here' : null), ['E', 'Set the canoe down']);
      if (inp.pressed('KeyE')) this.dropHull(true);
    }
  }

  // March from (x, z) toward deeper water: the first point where a canoe floats clear of the shore, and whether
  // a metre of depth lies within reach beyond it. null when no open water is within `reach` metres.
  launchFrom(x, z, reach = 14) {
    const w = this.world;
    let px = x, pz = z, sd = w.shoreAt(px, pz);
    for (let i = 0; i < reach && sd > FLOAT_SD; i++) { const g = w.deeperDir(px, pz); px += g.x; pz += g.z; sd = w.shoreAt(px, pz); }
    if (sd > FLOAT_SD || !w.isReady(px, pz) || !w.inBounds(px, pz, 40)) return null;
    const lx = px, lz = pz;
    let deep = false;
    for (let i = 0; i < 14 && !deep; i++) {
      if (w.levelAt(px, pz) - w.heightAt(px, pz) >= 1) deep = true;
      else { const g = w.deeperDir(px, pz); px += g.x; pz += g.z; }
    }
    return { x: lx, z: lz, deep, lake: w.lakeIdAt(lx, lz) };
  }

  // Lay the hull on the ground at (x, z): it follows the slope under its ends, and floats where an end is in the water.
  restHull(x, z, heading, pitchExtra = 0) {
    const w = this.world, f = { x: Math.cos(heading), z: -Math.sin(heading) };
    const under = (px, pz) => { const s = this.groundAt(px, pz); return w.shoreAt(px, pz) < 0 ? Math.max(s, w.levelAt(px, pz)) : s; };
    const hb = under(x + f.x * 2.2, z + f.z * 2.2), hs = under(x - f.x * 2.2, z - f.z * 2.2);
    this.canoe.dropHull(x, Math.max(under(x, z), (hb + hs) / 2), z, heading, Math.atan2(hb - hs, 4.4) + pitchExtra);
  }

  dropHull(set = false) {
    const c = this.carry, f = this.forward;
    const x = this.x + f.x * (set ? 1.4 : 0.9), z = this.z + f.z * (set ? 1.4 : 0.9), heading = this.heading + (set ? 0 : (Math.random() - 0.5) * 0.8);
    c.drop = { x, z, heading }; c.choice = false;
    this.restHull(x, z, heading, set ? 0 : 0.2);
    this.mode = 'walk'; this.canoe.state.mode = 'walk';
    this.prompt = { key: null, text: set ? 'You set the canoe down' : 'The canoe came down' };
  }

  pickUpHull() {
    this.canoe.pickUpHull();
    const c = this.carry;
    c.drop = null; c.hitCooldown = 1.0; c.choice = false; c.from = { x: this.x, z: this.z };
    this.mode = 'carry'; this.canoe.state.mode = 'carry';
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
      if (this.carry && this.carry.drop) this.canoe.pickUpHull(); // the canoe comes along
      this.mode = 'paddle'; this.carry = null; this.landing = null; this.ashore = null; this.swim = null;
      this.x = best.x; this.z = best.z; this.speed = 0; this.yawRate = 0;
      if (w.tiles) await w.tiles.ensure(this.x, this.z, 20);
      const dir = w.deeperDir(this.x, this.z);
      this.heading = Math.atan2(-dir.z, dir.x);
      this.canoe.state.stroke = 0; this.canoe.state.power = 0; this.canoe.state.mode = 'paddle';
      this.bob = null;
      this.placeOnWater();
      return true;
    } finally { this.teleporting = false; }
  }

  // Back in the canoe at l (a portage launch point or a spot found by launchFrom), pushed off toward deeper water.
  launch(l) {
    if (this.carry && this.carry.drop) this.canoe.pickUpHull();
    const dir = this.world.deeperDir(l.x, l.z);
    this.mode = 'paddle'; this.carry = null; this.ashore = null; this.balance = 0; this.extraRoll = 0;
    this.x = l.x; this.z = l.z;
    this.heading = Math.atan2(-dir.z, dir.x);
    this.speed = 0.8; this.yawRate = 0;
    this.canoe.state.stroke = 0; this.canoe.state.power = 0; this.canoe.state.mode = 'paddle';
    this.bob = null;
    this.placeOnWater();
  }
}
