import { FLOAT_OFFSET, LENGTH } from './canoe.js';
import { resample } from './props.js';
import { clamp, lerp, smoothstep } from './rng.js';
import { windHeight } from './waves.js';
import { GROUND, surfaceAt } from './terrain-build.js';
import { HULL, keelAt, section } from './hull.js';
import { paceOf, LIFE, SEEN } from './pace.js';

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

// The paddle at life pace (pace.js LIFE): a steady stroke holds 1.6 m/s (5.8 km an hour, a tripper's steady cruise)
// with the aluminium canoe and the ash paddle, Shift 2.0; about 57 strokes a minute of 1.6 m each. (It had been 1.11 m/s,
// a dawdle of 1.2 m strokes, the owner, 2026-10-23.) The thrust is pulsed over the first half of each stroke, so its mean
// is accel / pi, and the cruise is where that meets the drag: 0.31 v^2 + 0.12 v. While you travel at Trip pace each
// stroke glides farther: the hull is moved at `speed` times the boost (updatePaddle), and everything that reads `speed`
// (the energy, a capsize, a bump on the shore, the loons, the clock's "under way") reads the speed at life.
const PADDLE = { accel: 3.1, hustle: 4.65, reverse: 1.35, drag: 0.31, lin: 0.12, yaw: 0.65, strokeRate: 0.95, hustleRate: 1.35 };
// m/s at life (pace.js LIFE): a walk, Shift a jog, and a carry before the load slows it; face: how fast the walker turns
// to where the keys point. On a portage trail the walker is time-lapsed as the canoe is on the water (SEEN, pace.js).
const WALK = { speed: LIFE.walk, hustle: LIFE.jog, carry: LIFE.carry, carryHustle: LIFE.carryHustle, face: 7 };
// fb2 E: the load on foot without the canoe: it slows the walk only past kg, as (kg / LOAD.kg) ^ -walk (it had been the
// carry's ^ -0.6); up a flight of steps the walk slows by up to STAIRS.slow as the feet rise at STAIRS.climb m/s
const LOAD = { kg: 40, walk: 0.35 };
const STAIRS = { slow: 0.25, climb: [0.2, 0.6] };
// The boost on the water (pace.js) eases back to the pace's floor only where the hull needs it: a bank dead ahead (AHEAD:
// the metres of open water along the bow, from AHEAD[0] none to AHEAD[1] all, so it does not hit the shore at speed), a
// slow stroke (the speed at life over the cruise, CRUISING) and a hard turn (the yaw rate over the paddle's, TURNING).
// A shore alongside, a creek, a landing or a dock leave it alone. It comes up over about a second and goes in a third.
const BOOST = { ahead: [5, 16], reach: 30, cruising: [0.35, 0.85], turning: [0.35, 0.9], up: 1.1, down: 3.5 };
// On foot the walker has a height of his own (this.foot): the drawn ground, or the top of a rock, a log or a stump he
// has stepped, hopped, vaulted or climbed onto. STEP_UP is how high a step he takes without a hop (a low slab, a small
// rock, a thin log); BODY_R the body's reach round its centre, which every solid holds off (a trunk, a rock's or a
// log's parts, a cliff's blocks, a wall); HEAD how high he stands (a rock jutting over that is walked under); Space
// hops about HOP metres.
const STEP_UP = 0.35, BODY_R = 0.32, HEAD = 1.75, GRAVITY = 9.81, HOP = 0.42, HOP_V = Math.sqrt(2 * GRAVITY * HOP), ROCK_GRADE = Math.tan((38 * Math.PI) / 180);
const _push = { x: 0, z: 0 }, _held = { x: 0, z: 0, hit: false, trunk: null };
// fb C: getting over things (Space while moving into them). A vault takes him over something waist high and thin (a
// down log, a low rock: up to VAULT.max over the feet and VAULT.thin across) to the ground beyond; a climb takes him up
// onto something up to CLIMB.max high with room to stand on top (a boulder, a ledge, a bank, a dock from the water),
// hands then a knee then standing, in CLIMB.dur seconds from the lowest to the highest. A drop of more than DROP_MAX
// off a rock or a ledge is refused at its edge.
const VAULT = { max: 1.15, thin: 1.3, dur: 0.62 };
const CLIMB = { max: 2.05, fromWater: 1.05, dur: [0.8, 1.5] };
const DROP_MAX = 2.6;
// LOW_OVER: the lowest thing Space gets over rather than hops at, a little under a step: the collision holds the body
// off a log whose top only peaks over a step at a ring of its stem, and that must be vaulted, not hopped into (the join)
const LOW_OVER = STEP_UP - 0.1;
const SPACE = { early: 0.8, ahead: 1.0, reach: [0.35, 0.65, 1.0] }; // a Space pressed this long before, this far short of (looked for from each reach), a vault or a climb waits for it
// fb C: the water on foot. Wading slows you with the depth; past SWIM_DEPTH (chest deep) you swim, and you stand again
// under STAND_DEPTH; with the canoe overhead you go no deeper than CARRY_DEPTH. A swimmer is held off whatever stands
// within SWIM_CLEAR of the surface (a rock out of the water, a dock).
const SWIM_DEPTH = 1.15, STAND_DEPTH = 1.0, CARRY_DEPTH = 0.9, SWIM_CLEAR = 0.4;
const SWIM = { speed: 0.8, hustle: 1.2, turn: 1.6 };
const CAPSIZE = { threshold: 0.36, build: 1.1, recover: 0.6 };
const LANDING_RADIUS = 28;
const ASHORE_RADIUS = 6;      // metres of water between the hull and a shore within which you can step out
const TRAIL_WIDTH = 5;        // metres either side of a portage that walk like the trail
const HULL_REACH = 3;         // metres from a canoe on the ground within which you can shoulder or launch it
const GROUNDS = 40;           // metres around an outfitter's landing that are its cleared yard and dock
const FLOAT_SD = -3.5;        // shoreAt where a canoe floats clear (the paddle wants 1.2 m under the middle and 0.5 m under the ends)
const MAX_GRADE = Math.tan((40 * Math.PI) / 180);
const RODS = 5.0292;
const HULL_PIVOT_LIFT = 0.3;  // canoe.js dropHull stands the hull's pivot this far above the height it is given
// The hull's bottom in its own frame (+x bow, +y up, +z starboard), sampled for seating it on the ground: the keel
// from stem to stem and the bilges either side at five stations.
const HULL_BOTTOM = (() => {
  const pts = [], s = { y: 0, z: 0 }, half = HULL.L / 2;
  for (let k = -5; k <= 5; k++) { const u = k * 0.17; pts.push([u * half, keelAt(u), 0]); }
  for (const u of [-0.6, -0.3, 0, 0.3, 0.6]) for (const t of [0.3, 0.6]) { section(u, t, s); pts.push([u * half, s.y, s.z], [u * half, s.y, -s.z]); }
  return pts;
})();
const LAND = { rock: 'Bare rock', rockDark: 'A rock face', rockLichen: 'Bare rock', meadow: 'A clearing', burn: 'Old burn', forest: 'The woods', forestLight: 'The woods', forestDark: 'Dark spruce' };

export class Player {
  constructor(world, canoe, input) {
    this.world = world; this.canoe = canoe; this.input = input;
    this.mode = 'paddle'; // 'paddle' | 'carry' (the canoe on your shoulders) | 'walk' (on foot, the canoe on the ground somewhere) | 'swim'
    this.x = world.meta.start.x; this.z = world.meta.start.z;
    this.heading = 0; this.speed = 0; this.groundSpeed = 0; this.yawRate = 0; this.time = 0;
    this.strokeCount = 0;
    this.prompt = null;
    this.timeScale = 1;
    // the pace (pace.js, settings): 'trip' time-lapses travel, 'real' is life. boost is the time-lapse the canoe or the
    // walker moves at this frame (1 at life); trip.js runs the clock at it while you travel
    this.pace = 'trip';
    this.boost = 1; this.lapseT = 1;
    this.paceSpeed = 0;          // the speed made good per hour of the game's clock while travelling (the readout's km/h)
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
    canoe.ground = (x, z) => this.footGround(x, z); // the walker's feet find the ground (or the rock) under each foot
    canoe.terrain = (x, z) => this.groundAt(x, z); // fb2 E: and the terrain alone, for how steep the hill is
    this.foot = null; // on foot: { y, vy, air, t, land, near, peak } (updateFoot)
    // fb C: what the body is doing, for the figure to animate (canoe.js; the contract in the 2026-10-24 brief):
    //   kind     'idle' | 'walk' | 'jog' | 'wade' | 'step' | 'vault' | 'climb' | 'jump' | 'fall' | 'land' | 'swim' |
    //            'tread' | 'paddle' (and later 'sit' | 'crouch')
    //   t        seconds since this kind began; dur, u: a timed move's length and t / dur (0 and 0 for an open one)
    //   from, to { x, y, z } the feet where the move began and where it ends (both here for an open one); top: the
    //            top of what is stepped, vaulted or climbed (null otherwise); heading: the way it goes (as this.heading)
    //   speed    m/s over the ground at life; depth: water at the feet (m); carry: the canoe overhead
    //   nearD, far  for a vault or a climb: metres from `from` along `heading` to the near and far edges of what is got
    //            over (far -1 when it runs on: a ledge, a big rock); null otherwise
    this.move = { kind: 'paddle', t: 0, dur: 0, u: 0, from: { x: this.x, y: 0, z: this.z }, to: { x: this.x, y: 0, z: this.z }, top: null, heading: this.heading, speed: 0, depth: 0, carry: false };
    this.act = null;   // fb C: a vault or a climb under way (startAct, updateAct)
    this.restAt = null; // fb C: where restHull laid the hull (afterRig keeps it there through a swim from shore)
  }

  get forward() { return { x: Math.cos(this.heading), z: -Math.sin(this.heading) }; }
  get paceTable() { return paceOf(this.pace); }
  // the speed the water and the sound are shown at: the speed at life, scaled toward the game's old cruise while the
  // boost is up (the bow wave and the wash of a time-lapse read as a canoe under way, not a planing one)
  get feltSpeed() { return Math.abs(this.speed) * Math.min(this.boost, 2.1); }
  get lakeId() { return this.world.lakeIdAt(this.x, this.z); }
  get onFoot() { return this.mode === 'carry' || this.mode === 'walk'; }
  get altitude() { return this.onFoot ? (this.foot ? this.foot.y : this.groundAt(this.x, this.z)) : this.world.levelAt(this.x, this.z); }
  get waveHeightHere() { return this.wind && this.water ? windHeight(this.wind.speed, this.water.fetchAt(this.x, this.z)) : 0.05; }
  // where the canoe lies when it is not with you (beached or set down), for the map
  get hullDown() { return this.carry && this.carry.drop ? this.carry.drop : null; }
  get modeLabel() {
    if (this.mode === 'carry') return this.onTrail ? 'Portaging' : 'Carrying the canoe';
    if (this.mode === 'walk') return 'On foot';
    return this.mode === 'swim' ? 'Swimming' : 'Paddling';
  }
  // the height things stand on: the terrain as it is drawn (tiles.js groundAt: the mesh's own triangles)
  groundAt(x, z) { const t = this.world.tiles; return t ? t.groundAt(x, z) : surfaceAt(this.world, x, z); }
  // What the walker stands on at (x, z): the drawn ground, or whatever of the things near him (treesNear: a rock's own
  // geometry, a log's or a stump's top) rises over it there but no higher than `reach` (a step over the feet).
  supportAt(x, z, reach, near) {
    let y = this.groundAt(x, z);
    if (near) for (const t of near) {
      if (t.shape) { if (t.shape.maxY > y) { const h = t.shape.heightAt(x, z); if (h > y && h <= reach) y = h; } }
      else if (t.top !== undefined && t.top > y && t.top <= reach) {
        const dx = x - t.x, dz = z - t.z;
        if (t.box ? Math.abs(dx * t.ux + dz * t.uz) <= t.hx && Math.abs(-dx * t.uz + dz * t.ux) <= t.hz : dx * dx + dz * dz <= t.r * t.r) y = t.top;
      }
    }
    return y;
  }
  // How steep the rock the walker would stand on at (x, z) is there (rise over run, over 15 cm, on that rock's own
  // surface: a sample off its edge is left out, so the edge of a slab is a step, not a slope); 0 off any rock.
  rockSlope(x, z, reach, near, minTop = -Infinity) {
    let rock = null, top = -Infinity;
    for (const t of near) if (t.shape && t.shape.maxY > top && t.shape.maxY > minTop) { const h = t.shape.heightAt(x, z); if (h > top && h <= reach) { top = h; rock = t.shape; } }
    if (!rock) return 0;
    const e = 0.15, d = (dx, dz) => { const h = rock.heightAt(x + dx, z + dz); return h > -Infinity ? h - top : NaN; };
    const one = (a, b) => (a === a && b === b ? (a - b) / (2 * e) : a === a ? a / e : b === b ? -b / e : 0);
    return Math.hypot(one(d(e, 0), d(-e, 0)), one(d(0, e), d(0, -e)));
  }
  // the ground under a foot of the walker's (canoe.js plants the feet on it)
  footGround(x, z) { const ft = this.foot; return ft && ft.near && this.onFoot ? this.supportAt(x, z, ft.y + STEP_UP, ft.near) : this.groundAt(x, z); }

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
    if (!this.onFoot) { this.foot = null; this.act = null; } // stepping ashore again starts from the ground
    if (this.teleporting) { this.prompt = { key: null, text: 'Loading the map…' }; this.placeOnWater(); this.groundSpeed = 0; return; }
    const x0 = this.x, z0 = this.z;
    if (this.landing || this.ashore || this.mode === 'swim') this.easeBoost(1, dt); // nosing in, a landing, a swim: at life
    if (this.landing) this.updateLanding(dt);
    else if (this.ashore) this.updateAshore(dt);
    else if (this.onFoot) this.updateFoot(dt);
    else if (this.mode === 'swim') this.updateSwim(dt);
    else this.updatePaddle(dt);
    if (this.mode === 'paddle' || this.landing || this.ashore) this.setMove('paddle', dt, { y: this.level }); // fb C
    // the speed made good over the ground, for the GPS fix and the tally: what was actually covered this frame, not
    // what the legs or the paddle asked for (a trunk, a wall or deep water holds you while `speed` still says you are
    // walking); a jump across the map is not a speed. paceSpeed is the same per hour of the clock (over the boost): the
    // readout's km/h, which at either pace is the speed at life
    const d = Math.hypot(this.x - x0, this.z - z0);
    if (dt > 0 && d < 4) {
      const k = 1 - Math.exp(-dt * 8);
      this.groundSpeed += (d / dt - this.groundSpeed) * k;
      // the readout's is averaged over about a second and a half, so it gives the pace the strokes or the steps make good
      // rather than the surge and the glide inside each one
      this.paceSpeed += (d / dt / Math.max(1, this.boost) - this.paceSpeed) * (1 - Math.exp(-dt * 0.7));
    }
  }

  // the boost toward `want`: up over about a second, down in a third of one
  easeBoost(want, dt) {
    const k = want > this.boost ? BOOST.up : BOOST.down;
    this.boost += (want - this.boost) * (1 - Math.exp(-dt * k));
    if (Math.abs(this.boost - want) < 0.002) this.boost = want;
  }
  // How clear the water is for the boost (0 to 1): the bank dead ahead along the bow (marched along the shore distance
  // field; a tile not yet in counts as shore, so the canoe never runs at speed into the edge of what has loaded). Only
  // the last few metres count: a shore alongside, a landing or a dock leave the speed alone.
  clearAhead() {
    const w = this.world, f = this.forward, dir = this.speed < 0 ? -1 : 1;
    let t = 2.5, hit = BOOST.reach;
    for (let i = 0; i < 16 && t < BOOST.reach; i++) {
      const px = this.x + f.x * t * dir, pz = this.z + f.z * t * dir;
      const sd = w.isReady(px, pz) ? w.shoreAt(px, pz) : 0;
      if (sd > -2) { hit = t; break; }
      t += Math.max(3, -sd - 2);
    }
    return smoothstep(BOOST.ahead[0], BOOST.ahead[1], hit);
  }

  updatePaddle(dt) {
    const inp = this.input, w = this.world, st = this.canoe.state;
    if (this.season && this.season.ice > 0.5) {
      // the lakes are frozen: nothing to paddle until ice-out in early May
      this.speed *= 0.9; this.yawRate = 0; st.power *= 0.9; this.easeBoost(1, dt);
      this.placeOnWater(dt);
      this.prompt = { key: null, text: 'Iced in: the lakes are frozen until ice-out in early May (= steps the date)' };
      return;
    }
    const rodUp = !!(this.fishing && this.fishing.rodUp);
    const climbing = st.climb > 0; // still hauling yourself back in after a capsize
    const idleHands = rodUp || climbing;
    let fwd = idleHands ? 0 : (inp.held('KeyW', 'ArrowUp') ? 1 : 0) - (inp.held('KeyS', 'ArrowDown') ? 1 : 0);
    const turn = idleHands ? 0 : (inp.held('KeyA', 'ArrowLeft') ? 1 : 0) - (inp.held('KeyD', 'ArrowRight') ? 1 : 0);
    const hustle = inp.held('ShiftLeft', 'ShiftRight');
    const brace = !rodUp && inp.held('Space');           // a low brace steadies the hull but you cannot paddle
    if (brace) fwd = 0;
    const paddling = fwd !== 0 || turn !== 0;
    st.drive = fwd; st.hustle = hustle;
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
    const phase0 = st.stroke, prate = paddling || st.stroke > 0.02 ? rate * (fwd < 0 ? 0.8 : 1) : 0; // for the thrust's steps
    if (paddling || st.stroke > 0.02) {
      const prev = st.stroke;
      st.stroke = (st.stroke + dt * rate * (fwd < 0 ? 0.8 : 1)) % 1;
      // every seventh stroke the paddle changes sides: decided at the exit, so the recovery carries it across
      if (prev < 0.5 && st.stroke >= 0.5 && !biased && (this.strokeCount + 1) % 7 === 0) st.side *= -1;
      if (st.stroke < prev) this.strokeCount++;
      if (!paddling && st.stroke < prev) st.stroke = 0;
    }
    if (biased) st.side = steer > 0 ? 1 : -1;
    st.turn = steer;
    st.power += ((paddling ? 1 : 0) - st.power) * (1 - Math.exp(-dt * 6));
    // the stroke's thrust pulses (the catch to the exit, the first half of the cycle) and the hull's drag, in steps of
    // no more than 1/40 s, so the 2 and 4 keys (a longer dt) cruise as fast as 1× does
    const thrust = fwd > 0 ? (hustle ? PADDLE.hustle : PADDLE.accel) : fwd < 0 ? -PADDLE.reverse : turn !== 0 ? 0.29 : 0; // sweep strokes still push a little
    const cruise = this.gear ? this.gear.cruise : 1; // hubs 2B: the paddle and the hull's cruise (shop.js player.gear)
    const nSub = Math.max(1, Math.ceil(dt * 40)), h = dt / nSub;
    for (let k = 0; k < nSub; k++) {
      const ph = (phase0 + (k + 0.5) * h * prate) % 1;
      this.speed += thrust * (ph < 0.5 ? Math.sin((ph / 0.5) * Math.PI) : 0) * h;
      this.speed -= ((this.speed * Math.abs(this.speed) * PADDLE.drag) / cruise + this.speed * PADDLE.lin) / cruise * h;
    }
    const yawTarget = steer * PADDLE.yaw * (0.55 + 0.45 * clamp(Math.abs(this.speed) / 0.72, 0, 1)) * (this.speed < -0.1 ? -1 : 1);
    this.yawRate += (yawTarget - this.yawRate) * (1 - Math.exp(-dt * 3.5));
    // the pace (pace.js): under way on a forward stroke the hull is time-lapsed up to the pace's T on open water (from its
    // floor, life), eased off by a slow stroke, a hard turn and the last few metres of a bank dead ahead (not by a shore
    // alongside or a landing: the owner did not like it slowing there)
    const P = this.paceTable, B = P.floor || 1;
    let boostWant = B;
    this.lapseT = P.water; // the pace's own time-lapse here (the HUD's "trip ×6")
    if (P.water > B && fwd > 0 && !idleHands) {
      const cruise = LIFE.cruise * (this.gear ? this.gear.cruise : 1);
      const k = smoothstep(BOOST.cruising[0], BOOST.cruising[1], this.speed / cruise)
        * (1 - 0.85 * smoothstep(BOOST.turning[0], BOOST.turning[1], Math.abs(this.yawRate) / PADDLE.yaw))
        * this.clearAhead();
      boostWant = B + (P.water - B) * k;
    }
    this.easeBoost(boostWant, dt);
    const vb = this.speed * this.boost; // the speed the hull is moved at
    // the whole hull must stay in the water (and on a tile that has finished streaming in): centre, bow and stern are tested
    const ok = (x, z, h) => {
      const fx = Math.cos(h), fz = -Math.sin(h);
      return w.inBounds(x, z, 40) && w.isReady(x, z) && w.shoreAt(x, z) < -1.2 && w.shoreAt(x + fx * 2.3, z + fz * 2.3) < -0.5 && w.shoreAt(x - fx * 2.3, z - fz * 2.3) < -0.5;
    };
    const newHeading = this.heading + this.yawRate * dt;
    if (ok(this.x, this.z, newHeading) || !ok(this.x, this.z, this.heading)) this.heading = newHeading; else this.yawRate = 0;
    const f = this.forward;
    const nx = this.x + f.x * vb * dt, nz = this.z + f.z * vb * dt;
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
      const drift = 0.022 * U * dt * this.boost; // the drift is time-lapsed with the hull
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
    const steady = CAPSIZE.threshold * (this.gear ? this.gear.stability : 1); this.balance = clamp(this.balance + (risk > steady ? (risk - steady) * CAPSIZE.build : -CAPSIZE.recover) * dt, 0, 1); // hubs 2B: a steadier hull takes more sea
    this.extraRoll = this.balance * 0.4 * Math.sin(this.time * 3.1) * (brace ? 0.5 : 1);
    this.placeOnWater(dt);
    this.emitWater(dt);
    if (this.balance >= 1) { this.capsize(); return; }
    const warning = this.balance > 0.25;
    if (warning) this.prompt = brace ? { key: 'Space', text: 'Bracing… · hold it until the swell passes, or turn the bow into the waves' } : { key: 'Space', text: 'Brace · broadside to the swell: turn the bow into the waves, or hold still' };
    if (climbing) { this.prompt = { key: null, text: 'Climbing back in…' }; return; }
    if (rodUp) return;
    // a portage landing takes the canoe to the trailhead; any other bank close enough lets you step out
    const land = this.suppressLanding ? null : this.nearestLanding();
    const gap = this.shoreGap();
    if (land) {
      const p = land.def;
      if (!warning) this.prompt = { key: 'E', text: `Portage: ${p.name} · ${p.rods} rods (${p.lengthM} m)${gap ? ' &nbsp; <kbd>Q</kbd>Go ashore here' : ''}` }; // the sea's warning outranks the shore
      if (inp.pressed('KeyE')) this.landing = { land, t: 0 };
      else if (gap && inp.pressed('KeyQ')) this.goAshore(gap);
    } else if (gap) {
      if (!warning) this.prompt = { key: 'E', text: 'Go ashore' };
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
    st.power = 0.5; st.stroke = (st.stroke + dt * 0.8) % 1; st.drive = 1; st.turn = 0;
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
    this.x = px; this.z = pz; this.heading = heading; this.speed = 0; this.yawRate = 0; this.boost = 1;
    this.mode = 'walk'; this.ashore = null; this.balance = 0; this.extraRoll = 0; this.bob = null;
    this.carry = { trail: null, drop: { x: hx, z: hz, heading }, hitCooldown: 0, from: null, choice: true };
    this.canoe.state.stroke = 0; this.canoe.state.power = 0;
    this.restHull(hx, hz, heading);
    this.placeOnGround();
    if (this.audio) this.audio.paddleDip();
  }

  // Over you go. The hull floats upside down and drifts downwind; you are in the water beside it, swimming.
  capsize() {
    const f = this.forward, r = { x: -f.z, z: f.x }, side = this.canoe.state.side;
    this.swim = { hull: { cx: this.x, cz: this.z, heading: this.heading }, t: 0 };
    this.x += r.x * side * 1.1; this.z += r.z * side * 1.1;
    this.mode = 'swim'; this.speed = 0; this.yawRate = 0; this.balance = 0; this.extraRoll = 0;
    const st = this.canoe.state;
    st.mode = 'swim'; st.swimHull = true; st.swimHeading = this.heading; st.power = 0; st.swimSide = side;
    if (this.audio) { this.audio.paddleDip(); this.audio.paddleDip(); }
    const h = this.swim.hull;
    if (this.ripples) for (let i = 0; i < 40; i++) {
      const a = Math.random() * Math.PI * 2, rr = 0.5 + Math.random() * 2.5;
      this.ripples.spawn(1, h.cx + Math.cos(a) * rr * 0.6, this.level + 0.05, h.cz + Math.sin(a) * rr * 0.6, 0.08 + Math.random() * 0.1, 0.05, 0.6 + Math.random() * 0.5, Math.cos(a) * rr, 1.5 + Math.random() * 2.5, Math.sin(a) * rr);
    }
  }

  // In the water: after a capsize beside the overturned hull (swim.hull), or from the shore past your depth with the
  // canoe left where it lies (swim.hull null). W swims a slow breaststroke (Shift a hard one), still you tread water;
  // the energy pays more for it (energy.js). A rock standing out of the water or a dock holds you off; from the shore,
  // where it is shallow enough you stand and wade out, and Space held into a rock, a dock or a bank low enough over the
  // water climbs you out onto it. E at the canoe: right it and climb in (a capsize), or push the beached canoe off and
  // climb in.
  updateSwim(dt) {
    const inp = this.input, w = this.world, sw = this.swim, st = this.canoe.state, rig = this.canoe.rig, hull = sw.hull;
    sw.t += dt;
    const hustle = inp.held('ShiftLeft', 'ShiftRight');
    const { moving, mx, mz } = this.steerOnFoot(dt, SWIM.turn * 3);
    this.speed += ((moving ? 1 : 0) * (hustle ? SWIM.hustle : SWIM.speed) - this.speed) * (1 - Math.exp(-dt * 3));
    const wd = this.wind ? this.wind.dir : { x: 0, z: 0 }, U = this.wind ? this.wind.speed : 0;
    // after a capsize you stay out where the hull is (no wading off and leaving it upside down); from the shore anywhere
    const swimOk = (x, z) => w.inBounds(x, z, 40) && w.isReady(x, z) && (!hull || w.shoreAt(x, z) < -0.5);
    let nx = this.x + (mx * this.speed + wd.x * 0.01 * U) * dt, nz = this.z + (mz * this.speed + wd.z * 0.01 * U) * dt;
    if (!swimOk(nx, nz)) { nx = this.x; nz = this.z; this.speed *= 0.5; }
    this.level = w.levelAt(nx, nz);
    // held off whatever stands within SWIM_CLEAR of the surface (as if his feet were there: clearOf holds off what
    // rises a step over the feet)
    const near = w.tiles ? w.tiles.treesNear(nx, nz, 4.5) : [], yb = this.level - SWIM_CLEAR - STEP_UP;
    // the overturned hull floats beside you: you swim round it, not through it
    if (hull) near.push({ x: hull.cx, z: hull.cz, ux: Math.cos(hull.heading), uz: -Math.sin(hull.heading), hx: 2.3, hz: 0.42, box: true });
    this.clearOf(nx, nz, yb, near, _held);
    if (_held.hit) {
      nx = _held.x; nz = _held.z;
      if (this.blockedAt(nx, nz, yb, near) && !this.blockedAt(this.x, this.z, yb, near)) { nx = this.x; nz = this.z; }
    }
    if (!hull && this.carry) { // (a swim from shore always has the canoe somewhere: this.carry.drop)
      // shallow enough to stand: on your feet, wading
      const bed = this.supportAt(nx, nz, this.level - 0.2, near);
      if (this.level - bed < STAND_DEPTH && w.shoreAt(nx, nz) > -40) { this.x = nx; this.z = nz; this.leaveWater(bed); this.setMove('wade', dt, { depth: this.level - bed }); return; }
      // Space held into something low enough over the water: climb out onto it
      if (moving && (inp.held('Space') || inp.pressed('Space'))) {
        const a = this.traverseAhead(this.x, this.z, this.level - 1.0, mx, mz, near, true);
        if (a) {
          this.leaveWater(this.level - 1.1);
          this.startAct(a, this.level - 1.1);
          this.prompt = null;
          return;
        }
      }
    }
    this.x = nx; this.z = nz;
    const waveS = this.water ? this.water.waveAt(this.x, this.z) : 0;
    if (hull) {
      // the empty hull drifts downwind faster than you swim, so do not dawdle
      const cx = hull.cx + wd.x * 0.035 * U * dt, cz = hull.cz + wd.z * 0.035 * U * dt;
      if (w.shoreAt(cx, cz) < -1.5 && w.isReady(cx, cz)) { hull.cx = cx; hull.cz = cz; }
      hull.heading += 0.05 * dt;
      const waveC = this.water ? this.water.waveAt(hull.cx, hull.cz) : 0;
      rig.position.set(hull.cx, w.levelAt(hull.cx, hull.cz) + 0.05 + waveC, hull.cz);
      rig.rotation.set(0, hull.heading, 0);
    } else {
      rig.position.set(this.x, this.level, this.z);
      rig.rotation.set(0, this.heading, 0);
    }
    this.canoe.swimmer.set(this.x, this.level + waveS - 0.15, this.z);
    st.mode = 'swim'; st.swimHull = !!hull; st.swimHeading = this.heading;
    // the stroke from what the swimmer actually makes good
    const moved = Math.hypot(this.x - (this._fx ?? this.x), this.z - (this._fz ?? this.z));
    const raw = dt > 0 && moved < 1 ? Math.min(3, moved / dt) : 0;
    this._fx = this.x; this._fz = this.z;
    st.speed += (raw - st.speed) * (1 - Math.exp(-dt * 12));
    st.walkSpeed += ((Math.abs(this.speed) > 0.05 ? 1 : 0) - st.walkSpeed) * (1 - Math.exp(-dt * 6));
    st.walk += (0.6 + Math.abs(this.speed)) * dt * 3.0;
    const bedHere = this.groundAt(this.x, this.z);
    this.setMove(this.speed > 0.15 ? 'swim' : 'tread', dt, { y: this.level, depth: Math.max(0, this.level - bedHere), speed: raw });
    if (hull) {
      const d = Math.hypot(hull.cx - this.x, hull.cz - this.z);
      if (d < 2.4) {
        this.prompt = { key: 'E', text: 'Right the canoe and climb back in' };
        if (inp.pressed('KeyE')) {
          // which side of the hull you are on: the canoe rights itself and you haul in over that gunwale
          const rx = Math.sin(hull.heading), rz = Math.cos(hull.heading);
          st.climbSide = (this.x - hull.cx) * rx + (this.z - hull.cz) * rz >= 0 ? 1 : -1;
          st.climb = 1.4; // seconds of righting the hull and climbing in (canoe.js counts it down)
          this.mode = 'paddle'; this.x = hull.cx; this.z = hull.cz; this.heading = hull.heading; this.speed = 0; this.yawRate = 0;
          this.swim = null; st.mode = 'paddle'; st.swimHull = false; st.stroke = 0; st.power = 0; this.bob = null; this.balance = 0;
          this.placeOnWater();
        }
      } else this.prompt = { key: null, text: `You are in the water — swim to the canoe (${d.toFixed(0)} m)` };
      return;
    }
    // from the shore: the canoe where you left it
    const drop = this.carry && this.carry.drop, dd = drop ? Math.hypot(drop.x - this.x, drop.z - this.z) : Infinity;
    if (dd < 3.4) {
      this.prompt = { key: 'E', text: 'Push the canoe off and climb in' };
      if (inp.pressed('KeyE')) {
        const L = this.launchFrom(drop.x, drop.z, 10);
        if (L) {
          const side = (this.x - drop.x) * Math.sin(drop.heading) + (this.z - drop.z) * Math.cos(drop.heading) >= 0 ? 1 : -1;
          this.launch(L);
          if (this.mode === 'paddle') { st.climbSide = side; st.climb = 1.4; st.swimHull = false; }
        } else this.prompt = { key: null, text: 'The canoe lies too far up the bank — wade ashore and launch it' };
      }
      return;
    }
    const far = drop ? (dd < 1000 ? `${dd.toFixed(0)} m` : `${(dd / 1000).toFixed(1)} km`) : null;
    this.prompt = { key: null, text: `Swimming${far ? ` · the canoe is ${far} away` : ''}` };
  }

  // fb C: after canoe.update (main.js). canoe.js's swim pose is the capsize's, the hull turned over beside the swimmer; a
  // swim from shore leaves the hull lying where it was beached, so it is put back there
  afterRig() {
    if (this.mode !== 'swim' || !this.swim || this.swim.hull || !this.restAt) return;
    const h = this.canoe.hull;
    if (h.parent === this.canoe.rig) return;
    h.position.copy(this.restAt.p); h.rotation.copy(this.restAt.r); h.updateMatrixWorld();
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
    const felt = Math.sign(this.speed) * this.feltSpeed; // the bow lifts, and the water line shows, as at the old cruise
    const pitch = Math.atan2(hb - hs, 4) * 0.6 + felt * 0.012;
    const roll = Math.atan2(hr - hl, 1) * 0.5 + this.yawRate * 0.12 + st.side * st.power * 0.035 * Math.sin(st.stroke * Math.PI * 2) + this.extraRoll;
    const k = 1 - Math.exp(-dt * 5);
    if (!this.bob || !Number.isFinite(this.bob.y)) this.bob = { y, pitch, roll };
    if (!Number.isFinite(y)) return;
    this.bob.y += (y - this.bob.y) * k; this.bob.pitch += (pitch - this.bob.pitch) * k; this.bob.roll += (roll - this.bob.roll) * k;
    rig.position.set(this.x, this.bob.y, this.z);
    rig.rotation.set(0, this.heading, 0);
    rig.rotateZ(-this.bob.pitch);
    rig.rotateX(this.bob.roll);
    st.mode = 'paddle'; st.speed = felt;
  }

  // wake rings behind the stern, a bow ripple, and splashes where the paddle bites
  emitWater(dt) {
    if (!this.ripples) return;
    // the flecks and the splashes read the felt speed (the speed at life, toward the old cruise under the boost), and
    // the flecks come as many to the metre as at life however fast the time-lapse carries the hull
    const sp = this.feltSpeed, f = this.forward, y = this.level + 0.04, st = this.canoe.state;
    // a few soft flecks shed from the bow wave and the stern eddy, left behind as a thin trail (the line round
    // the hull itself is canoe.js's water line)
    if (sp > 0.35) {
      const r = { x: -f.z, z: f.x };
      this.bubbleAcc += dt * (5 + 17 * Math.min(1, sp / 2.5)) * this.timeScale * (this.boost / Math.min(this.boost, 2.1));
      while (this.bubbleAcc >= 1) {
        this.bubbleAcc -= 1;
        let t = Math.random() * 2 - 1;
        t = Math.sign(t) * Math.pow(Math.abs(t), 0.3);
        const side = Math.random() < 0.5 ? -1 : 1;
        const hw = 0.42 * Math.pow(1 - Math.pow(Math.abs(t), 4), 0.6) + 0.1;
        const along = t * 2.5;
        const px = this.x + f.x * along + r.x * side * hw, pz = this.z + f.z * along + r.z * side * hw;
        const out = 0.2 + Math.random() * 0.35, back = (0.05 + Math.random() * 0.2) * sp;
        this.ripples.spawn(3, px, this.level + 0.03, pz, 0.03 + Math.random() * 0.04, 0.07 + Math.random() * 0.08, 1.0 + Math.random() * 1.2,
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
    this.canoe.state.power = 0.5; this.canoe.state.stroke = (this.canoe.state.stroke + dt * 0.8) % 1; this.canoe.state.drive = 1; this.canoe.state.turn = 0;
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
    rig.position.set(this.x, (this.foot ? this.foot.y : this.groundAt(this.x, this.z)) + 0.1, this.z);
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

  // ---- fb C: the walker among things: what holds him, what is under him, what he can get over ----------------------

  // the water over the feet at (x, z) when they stand at y (0 on dry land)
  depthAt(x, z, y) {
    const w = this.world;
    return w.shoreAt(x, z) < 1 ? Math.max(0, w.levelAt(x, z) - y) : 0;
  }

  // The walker's circle at (x, z), the feet at y, held clear of everything in `near`: the trunks, the solids' parts that
  // rise more than a step over the feet (and start below his head), the props taller than a step (a wall, a tent, a
  // post; a deck no higher than a step is stood on). Round up to four times, as one push can send him into another.
  // Into out { x, z, hit, trunk } (trunk: a trunk or a small solid, a scree block or a stump, that held him: he eases
  // round it rather than standing stuck against it; a big rock or a wall he stands at, to climb it say).
  clearOf(x, z, y, near, out) {
    const level = y + STEP_UP, head = y + HEAD, R = BODY_R;
    out.hit = false; out.trunk = null; out.solid = null;
    const small = (s) => s.maxX - s.minX < 1.6 && s.maxZ - s.minZ < 1.6;
    for (let pass = 0; pass < 4; pass++) {
      let moved = false;
      for (const t of near) {
        if (t.shape) { if (t.shape.push(x, z, R, level, head, _push)) { x = _push.x; z = _push.z; moved = true; out.solid = t; if (small(t.shape)) out.trunk = t; } continue; }
        if (t.top !== undefined && t.top <= level) continue;
        if (t.box) {
          // fb2 E: the circle against the box itself, its corners round (the R-grown rectangle's square corners held a
          // walker passing a wall's end, a flight's side or a door post by a few centimetres his circle never touched)
          const px = x - t.x, pz = z - t.z, a = px * t.ux + pz * t.uz, b = -px * t.uz + pz * t.ux;
          const ca = clamp(a, -t.hx, t.hx), cb = clamp(b, -t.hz, t.hz), ea = a - ca, eb = b - cb, e2 = ea * ea + eb * eb;
          if (e2 >= R * R) continue;
          if (e2 > 1e-10) { // outside the box, within R of it: out along the line from its nearest point
            const e = Math.sqrt(e2), k = (R - e) / e, da = ea * k, db = eb * k;
            x += t.ux * da - t.uz * db; z += t.uz * da + t.ux * db;
          } else { // the middle inside it: out by the nearer side, as before
            const da = t.hx + R - Math.abs(a), db = t.hz + R - Math.abs(b);
            if (da < db) { const s = Math.sign(a) || 1; x += t.ux * s * da; z += t.uz * s * da; }
            else { const s = Math.sign(b) || 1; x += -t.uz * s * db; z += t.ux * s * db; }
          }
          moved = true;
          continue;
        }
        const dx = x - t.x, dz = z - t.z, d = Math.hypot(dx, dz), keep = t.r + R;
        if (d < keep) {
          if (d > 1e-4) { x = t.x + (dx / d) * keep; z = t.z + (dz / d) * keep; } else x = t.x + keep;
          moved = true;
          if (t.top === undefined && !t.tent) out.trunk = t;
        }
      }
      if (!moved) break;
      out.hit = true;
    }
    out.x = x; out.z = z;
    return out;
  }

  // does the walker's circle at (x, z), the feet at y, reach into anything (by more than a few centimetres)?
  blockedAt(x, z, y, near) {
    const level = y + STEP_UP, head = y + HEAD, R = BODY_R - 0.04;
    for (const t of near) {
      if (t.shape) { if (t.shape.overlaps(x, z, R, level, head, 0)) return true; continue; }
      if (t.top !== undefined && t.top <= level) continue;
      const dx = x - t.x, dz = z - t.z;
      if (t.box) { // (fb2 E: corners round, as clearOf's)
        const a = dx * t.ux + dz * t.uz, b = -dx * t.uz + dz * t.ux, ea = a - clamp(a, -t.hx, t.hx), eb = b - clamp(b, -t.hz, t.hz);
        if (ea * ea + eb * eb < R * R) return true;
        continue;
      }
      if (dx * dx + dz * dz < (t.r + R) ** 2) return true;
    }
    return false;
  }

  // the top of whatever is at (x, z) seen from above, for getting over it: the drawn ground, a solid's top there (a rock,
  // a log, a cliff's block), a prop's top; Infinity inside a trunk, a wall or a prop with no top. fb2 E: and inside a
  // store's stairs, its deck and the walls beside a flight (stream C's `stair`, `store` and `wall` boxes): they are
  // walked up (a tread is a step, STEP_UP), never climbed or vaulted, so Space is not offered at them
  topAt(x, z, near) {
    let y = this.groundAt(x, z);
    for (const t of near) {
      if (t.shape) { if (t.shape.maxY > y) { const h = t.shape.heightAt(x, z); if (h > y) y = h; } continue; }
      const dx = x - t.x, dz = z - t.z;
      const inside = t.box ? Math.abs(dx * t.ux + dz * t.uz) <= t.hx && Math.abs(-dx * t.uz + dz * t.ux) <= t.hz : dx * dx + dz * dz <= t.r * t.r;
      if (inside) { if (t.top === undefined || t.stair || t.store || t.wall) return Infinity; if (t.top > y) y = t.top; }
    }
    return y;
  }

  // can he stand at (x, z) at height y: on a solid's top no steeper than a rock's walkable grade, on the ground no
  // steeper than a hill's
  standable(x, z, y, near) {
    if (y > this.groundAt(x, z) + 0.05) return this.rockSlope(x, z, y + 0.02, near) <= ROCK_GRADE;
    const e = 0.4, gx = this.groundAt(x + e, z) - this.groundAt(x - e, z), gz = this.groundAt(x, z + e) - this.groundAt(x, z - e);
    return Math.hypot(gx, gz) / (2 * e) <= MAX_GRADE;
  }

  // What is ahead along (mx, mz) for Space to get over, from (x, z) with the feet at y0: { kind: 'vault' | 'climb', top,
  // nearD, far, dur, to: { x, y, z }, heading } or null. Its near edge is the first place, from the body's middle to
  // 0.7 m past its edge, where the top rises abruptly (steeper than a slope can be walked) more than a step over the
  // feet; its top the highest of it, sampled on until it falls back (the far edge) or 2.6 m on. A thin one no higher
  // than the waist is vaulted when there is room to land beyond it; otherwise he climbs onto it if there is room to
  // stand on top. From the water (y0 the feet as a swimmer's) only a climb.
  traverseAhead(x, z, y0, mx, mz, near, fromWater = false) {
    const S = 0.08, w = this.world, heading = Math.atan2(-mz, mx);
    let prev = this.topAt(x, z, near), nearD = -1;
    if (prev === Infinity) return null;
    for (let d = S; d <= BODY_R + 0.7; d += S) {
      const h = this.topAt(x + mx * d, z + mz * d, near);
      if (h === Infinity) return null; // a trunk or a wall first: nothing to get over
      if (h > y0 + LOW_OVER && h - prev > 0.06) { nearD = d; break; }
      prev = h;
    }
    if (nearD < 0) return null;
    let top = -Infinity, far = -1;
    for (let d = nearD; d <= nearD + 2.6; d += S) {
      const h = this.topAt(x + mx * d, z + mz * d, near);
      if (h === Infinity) { if (d - nearD < 0.5) return null; break; }
      if (h <= y0 + LOW_OVER || h < top - 0.5) { far = d; break; }
      if (h > top) top = h;
    }
    const h = top - y0;
    if (!(h > LOW_OVER)) return null;
    // over: a thin one no higher than the waist, with room to land beyond
    if (!fromWater && far >= 0 && h <= VAULT.max && far - nearD <= VAULT.thin) {
      for (const extra of [0.12, 0.3, 0.5]) {
        const d = far + BODY_R + extra, lx = x + mx * d, lz = z + mz * d;
        if (!w.isReady(lx, lz) || !w.inBounds(lx, lz, 40)) break;
        const ly = this.supportAt(lx, lz, y0 + STEP_UP, near);
        if (ly < y0 - DROP_MAX || this.depthAt(lx, lz, ly) > STAND_DEPTH) break;
        if (this.blockedAt(lx, lz, ly, near)) continue;
        return { kind: 'vault', top, nearD, far, dur: VAULT.dur + 0.2 * Math.max(0, h - 0.6), to: { x: lx, y: ly, z: lz }, heading };
      }
    }
    // onto: room to stand on top, the body just past the near edge (the top there, which on a sloping rock is lower
    // than its crown further in)
    for (const inset of [0.06, 0.2, 0.4, 0.65]) {
      const d = nearD + BODY_R + inset;
      if (far >= 0 && d > far - 0.04) break;
      const lx = x + mx * d, lz = z + mz * d, ly = this.topAt(lx, lz, near);
      if (ly === Infinity || ly <= y0 + STEP_UP * 0.6 || ly - y0 > CLIMB.max) continue;
      if (!this.standable(lx, lz, ly, near) || this.blockedAt(lx, lz, ly, near)) continue;
      const dur = CLIMB.dur[0] + (CLIMB.dur[1] - CLIMB.dur[0]) * clamp((ly - y0 - 0.5) / 1.5, 0, 1);
      return { kind: 'climb', top: ly, nearD, far, dur, to: { x: lx, y: ly, z: lz }, heading };
    }
    return null;
  }

  // a vault or a climb begins (traverseAhead's answer), from the feet at fromY
  startAct(a, fromY) {
    const ft = this.foot;
    this.act = { ...a, t: 0, from: { x: this.x, y: fromY, z: this.z }, speed: this.speed };
    ft.air = false; ft.vy = 0; ft.y = fromY;
    this.setMove(a.kind, 0, { restart: true, dur: a.dur, from: this.act.from, to: a.to, top: a.top, heading: a.heading, nearD: a.nearD, far: a.far });
    if (this.audio) this.audio.paddleDip();
  }

  // The body along a vault or a climb (the feet's path; canoe.js poses the limbs on it). A vault: a hand on the top and
  // up (the feet over it a little before halfway), across, and down on the far side, easing in and out. A climb: up
  // the face with the hands on the edge (to u 0.35, the feet as high as the hands let them), a knee onto the edge with
  // the body over it (to 0.7), then standing up and stepping in to where he stands.
  updateAct(dt) {
    const A = this.act, ft = this.foot;
    A.t += dt;
    const u = clamp(A.t / A.dur, 0, 1), fx = A.from.x, fz = A.from.z, tx = A.to.x, tz = A.to.z;
    const L = Math.hypot(tx - fx, tz - fz) || 1e-6, ux = (tx - fx) / L, uz = (tz - fz) / L;
    const ease = (k) => (1 - Math.cos(Math.PI * clamp(k, 0, 1))) / 2;
    let d, y;
    if (A.kind === 'vault') {
      const peak = A.top + 0.1;
      d = L * ease(u);
      y = u < 0.45 ? A.from.y + (peak - A.from.y) * Math.sin((u / 0.45) * Math.PI / 2) : peak + (A.to.y - peak) * (1 - Math.cos(((u - 0.45) / 0.55) * Math.PI / 2));
    } else {
      const edge = Math.max(0, A.nearD - BODY_R * 0.6), over = A.nearD + 0.04, hang = A.top - Math.min(0.95, 0.6 * (A.top - A.from.y));
      if (u < 0.35) { const k = ease(u / 0.35); d = edge * k; y = A.from.y + (hang - A.from.y) * k; }
      else if (u < 0.7) { const k = ease((u - 0.35) / 0.35); d = edge + (over - edge) * k; y = hang + (A.top - 0.3 - hang) * k; }
      else { const k = ease((u - 0.7) / 0.3); d = over + (L - over) * k; y = A.top - 0.3 + (A.to.y - A.top + 0.3) * k; }
    }
    this.x = fx + ux * d; this.z = fz + uz * d; ft.y = y; ft.air = false; ft.vy = 0;
    this.setMove(A.kind, dt, { dur: A.dur, from: A.from, to: A.to, top: A.top, heading: A.heading, nearD: A.nearD, far: A.far });
    if (u >= 1) {
      this.x = tx; this.z = tz; ft.y = A.to.y; ft.peak = ft.y;
      this.speed = A.kind === 'vault' ? A.speed : 0;
      if (A.kind === 'vault') ft.land = 0.5;
      this.act = null;
    }
  }

  // The move the body is making, for the figure (this.move, see the constructor): kind kept with its clock running, or
  // started afresh (restart, or a new kind); a timed one keeps its from, to and top, an open one is here
  setMove(kind, dt, o = {}) {
    const m = this.move, y = o.y ?? (this.foot ? this.foot.y : this.level);
    if (m.kind !== kind || o.restart) {
      m.kind = kind; m.t = 0; m.dur = o.dur || 0;
      m.from = o.from || { x: this.x, y, z: this.z };
      m.to = o.to || { x: this.x, y, z: this.z };
      m.top = o.top ?? null;
    } else {
      m.t += dt;
      if (!m.dur) { m.from.x = m.to.x = this.x; m.from.y = m.to.y = y; m.from.z = m.to.z = this.z; }
    }
    m.u = m.dur ? clamp(m.t / m.dur, 0, 1) : 0;
    m.heading = o.heading ?? this.heading;
    m.speed = o.speed ?? (this.onFoot || this.mode === 'swim' ? this.canoe.state.speed / Math.max(1, this.boost) : Math.abs(this.speed));
    m.depth = o.depth ?? 0;
    m.nearD = o.nearD ?? null; m.far = o.far ?? null;
    m.carry = this.mode === 'carry';
  }

  // in over your depth on foot: you swim, the canoe left where it lies
  enterSwim() {
    const st = this.canoe.state, w = this.world;
    this.mode = 'swim'; this.swim = { hull: null, t: 0 }; this.act = null; this.foot = null;
    this.speed = Math.min(this.speed, SWIM.speed); this.level = w.levelAt(this.x, this.z);
    st.mode = 'swim'; st.swimHull = false; st.swimHeading = this.heading; st.power = 0; st.swimSide = 1;
    if (this.audio) this.audio.paddleDip();
    if (this.ripples) for (let i = 0; i < 14; i++) {
      const a = Math.random() * Math.PI * 2, rr = 0.3 + Math.random() * 1.2;
      this.ripples.spawn(1, this.x + Math.cos(a) * 0.3, this.level + 0.05, this.z + Math.sin(a) * 0.3, 0.06 + Math.random() * 0.08, 0.05, 0.5 + Math.random() * 0.4, Math.cos(a) * rr, 1 + Math.random() * 1.5, Math.sin(a) * rr);
    }
  }
  // out of the water onto your feet at y (shallow enough to stand, or onto what you climbed)
  leaveWater(y) {
    this.mode = 'walk'; this.swim = null;
    this.foot = { y, vy: 0, air: false, t: 0, land: 0, near: null, peak: y };
    this.canoe.state.mode = 'walk'; this.canoe.state.swimHull = false;
    this.placeOnGround();
  }

  // On foot, with or without the canoe, anywhere on the land. A portage trail walks at full speed and so do the woods:
  // the bush does not slow you, only a hill does, with a 40° slope a wall, and the water does, with its depth. Every
  // solid holds you off at its drawn edge and you slide along it (clearOf); Space gets you over what you walk into
  // (traverseAhead: a vault, a climb) or hops. With the hull overhead it catches on trees and may come down. Past your
  // depth you swim (enterSwim), unless the canoe is on your shoulders.
  updateFoot(dt) {
    const inp = this.input, c = this.carry, st = this.canoe.state, w = this.world;
    const carrying = !c.drop;
    const hustle = inp.held('ShiftLeft', 'ShiftRight');
    c.hitCooldown -= dt;
    const ft = this.foot || (this.foot = { y: this.groundAt(this.x, this.z), vy: 0, air: false, t: 0, land: 0, near: null, peak: 0 });
    const footY0 = ft.y;
    const trail = this.nearestTrail(this.x, this.z), onTrail = !!trail && trail.dist < TRAIL_WIDTH;
    const camp = this.nearCampsite(this.x, this.z), yard = !camp && this.nearEntry(this.x, this.z, GROUNDS);
    this.onTrail = onTrail; this.campsite = camp;
    const cls = GROUND[(w.coverCell(w.cellI(this.x), w.cellJ(this.z)) >> 16) & 255];
    let note = null, moving = false, mx = 0, mz = 0, nx = this.x, nz = this.z, swimNow = false, stepUp = -1;
    const f = this.forward;
    if (this.act) {
      this.updateAct(dt);
      nx = this.x; nz = this.z;
      ft.near = w.tiles ? w.tiles.treesNear(nx, nz, 4.5) : [];
    } else {
      ({ moving, mx, mz } = this.steerOnFoot(dt, WALK.face)); // (mx, mz): the way the walker goes; f: the way the body faces
      const fwd = moving ? 1 : 0;
      // the going: the woods walk at the same pace as a trail (a bushwhacking crawl is no fun); a trail, a campsite and
      // an outfitter's yard are graded, so the hill costs them less
      const cleared = onTrail || !!camp || yard;
      let going = 1;
      // the hill: the grade a step ahead in the direction of travel slows you and a 40° slope stops you; a trail is
      // graded, so half the penalty and never a wall; stood on a rock, a log or a deck the ground's grade is not yours
      const step = 1.5, onSolid = ft.y > this.groundAt(this.x, this.z) + 0.15;
      const grade = (this.groundAt(this.x + mx * step, this.z + mz * step) - this.groundAt(this.x, this.z)) / step;
      let wall = null;
      if (!onTrail && !onSolid && grade > MAX_GRADE) wall = 'Too steep to climb here';
      else if (!onTrail && !onSolid && grade < -1.2) wall = 'A drop — find another way down';
      // fb2 E: stood on something (a flight of steps, a rock, a deck) its own rise is the hill, not the ground's under it:
      // up a flight at about a stride a second (ft.climb, m/s), a little slower, as people take stairs
      else if (onSolid) going *= 1 - STAIRS.slow * smoothstep(STAIRS.climb[0], STAIRS.climb[1], ft.climb || 0);
      else if (grade > 0) going *= 1 - (cleared ? 0.45 : 0.7) * Math.pow(Math.min(1, grade / MAX_GRADE), 1.3);
      else going *= 1 - (cleared ? 0.2 : 0.4) * Math.min(1, -grade / MAX_GRADE);
      // a heavy pack (the trip's food, the canoe's weight) is a slower walk; the water drags at the legs. fb2 E: on foot
      // without the canoe a load slows you only past LOAD.kg, and gently (LOAD.walk): a pack on the back, a barrel on the
      // chest and the rod in hand (12-35 kg) walk the owner's 3 mph; 60 kg is about 13 % slower. Under the canoe the carry
      // keeps its own (the portage's 3 km an hour with 55 kg, pace.js)
      const base = carrying ? (hustle ? WALK.carryHustle : WALK.carry) / Math.pow(Math.max(1, this.loadFactor), 0.6)
        : (hustle ? WALK.hustle : WALK.speed) / Math.pow(Math.max(1, (this.loadKg || 0) / LOAD.kg), LOAD.walk);
      const wade = 1 - 0.5 * smoothstep(0.25, SWIM_DEPTH, this.depthAt(this.x, this.z, ft.y));
      if (fwd !== 0 && wall) note = wall;
      // Space: over or onto what you are walking into (a vault, a climb), else a hop; with the canoe overhead a
      // stagger under it (no one jumps with a canoe on their shoulders)
      // A press a stride early is kept SPACE.early seconds: something to get over that far ahead is walked up to and
      // got over, not hopped into (the fb join, 2026-10-24: Space a metre short of a 1.2 m rock only hopped)
      const tap = inp.pressed('Space'), held = inp.held('Space');
      if (tap) ft.spaceT = SPACE.early; else if (ft.spaceT > 0) ft.spaceT -= dt;
      let started = false;
      const nearNow = ft.near || (w.tiles ? w.tiles.treesNear(this.x, this.z, 4.5) : []);
      if (!ft.air && !carrying && moving && (tap || held || ft.spaceT > 0)) {
        const a = this.traverseAhead(this.x, this.z, ft.y, mx, mz, nearNow);
        if (a) { this.startAct(a, ft.y); started = true; ft.spaceT = 0; }
      }
      if (!started && tap && !ft.air) {
        if (carrying) st.stagger = 1;
        else {
          // something to get over a stride or so ahead keeps the press for when he reaches it. Looked for from a few
          // points short of the stride, read from the feet there (downhill to a log they are lower): from a full stride
          // ahead a thin log a stride away is already underfoot, nothing rises, and he would hop into it (main, 2026-10-24)
          const ahead = moving && SPACE.reach.some((r) => {
            const ax = this.x + mx * r, az = this.z + mz * r;
            return this.traverseAhead(ax, az, this.supportAt(ax, az, ft.y + STEP_UP, nearNow), mx, mz, nearNow);
          });
          if (!ahead) { ft.air = true; ft.vy = HOP_V; ft.t = 0; ft.peak = ft.y; ft.hop = true; ft.spaceT = 0; }
        }
      }
      if (!started) {
        const want = wall && !ft.air ? 0 : fwd * base * Math.max(0.55, going) * wade;
        this.speed += (want - this.speed) * (1 - Math.exp(-dt * (ft.air ? 1.5 : 6))); // in the air the legs cannot push
        // the pace on a portage trail (pace.js): the walker time-lapsed so he is seen at about SEEN (a carry at 2.5 m/s, a
        // walk at 2.3), up to the pace's trail T; off a trail, at a campsite or in a yard he walks at life
        const P = this.paceTable;
        let boostWant = 1;
        if (onTrail && P.trail > 1 && fwd) {
          const seen = carrying ? (hustle ? SEEN.carryHustle : SEEN.carry) : (hustle ? SEEN.jog : SEEN.walk);
          boostWant = clamp(seen / Math.max(0.1, base), 1, P.trail);
        }
        if (boostWant > 1 || !onTrail) this.lapseT = boostWant; // (standing on a trail keeps the trail's number for the HUD)
        this.easeBoost(boostWant, dt);
        nx = this.x + mx * this.speed * this.boost * dt; nz = this.z + mz * this.speed * this.boost * dt;
        if (!w.inBounds(nx, nz, 40)) { nx = this.x; nz = this.z; this.speed = 0; note = 'Edge of the map — turn back'; }
        else if (!w.isReady(nx, nz)) { nx = this.x; nz = this.z; this.speed = 0; note = 'Loading the land ahead…'; }
        const near = w.tiles ? w.tiles.treesNear(nx, nz, 4.5) : [];
        ft.near = near;
        // fb2 E: the feet's height for what holds him and what he steps up onto: what is under him now, if his feet are
        // still easing up to it (up a flight at a jog they lag a few centimetres, and the tread two up, 0.30 m over the
        // one he is on, must stay within a step of it)
        const feetY = ft.air ? ft.y : Math.max(ft.y, this.supportAt(this.x, this.z, ft.y + STEP_UP, near));
        const reach = feetY + STEP_UP;
        // held off everything at its drawn edge, sliding along it; eased round a trunk to whichever side you were
        // already passing on; still caught in a corner between two after that, you stay where you were
        this.clearOf(nx, nz, feetY, near, _held);
        ft.easeAge = (ft.easeAge ?? 9) + dt;
        let pressed = false;
        if (_held.hit) {
          nx = _held.x; nz = _held.z; pressed = true;
          // a trunk or a small rock: eased round at once. A boulder you walk into nearly head on with nothing to get over
          // (no vault or climb offered): after a moment, eased round it too (a face to climb, a wall, a cliff: you stand)
          const made = Math.hypot(nx - this.x, nz - this.z) / Math.max(1e-6, dt * this.boost), sol = _held.solid;
          // (once easing round one, met again within half a second it is eased round at once: no stop and go)
          ft.stuck = moving && made < 0.3 * Math.max(0.3, this.speed) ? (ft.stuck || 0) + dt : 0;
          const big = sol && !sol.cliff && sol.shape.maxX - sol.shape.minX < 5 && sol.shape.maxZ - sol.shape.minZ < 5 && !ft.hint && (ft.stuck > 0.35 || (sol === ft.easing && ft.easeAge < 0.5));
          if (big) { ft.easing = sol; ft.easeAge = 0; }
          const t = _held.trunk || (big ? sol : null);
          if (t && moving) {
            const s = t.shape, cx = s ? (s.minX + s.maxX) / 2 : t.x, cz = s ? (s.minZ + s.maxZ) / 2 : t.z, side = Math.sign((nx - cx) * -mz + (nz - cz) * mx) || 1;
            const ease = (_held.trunk ? 1.2 : 0.9) * dt;
            nx += -mz * side * ease; nz += mx * side * ease;
            this.clearOf(nx, nz, feetY, near, _held); nx = _held.x; nz = _held.z;
          }
          if (this.blockedAt(nx, nz, feetY, near) && !this.blockedAt(this.x, this.z, feetY, near)) { nx = this.x; nz = this.z; }
        } else ft.stuck = 0;
        if (carrying) {
          for (const t of near) {
            if (t.shape || t.box) continue; // the hull rides above a boulder or a log; a wall already holds the walker off
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
        // the feet's height: on the ground or on what was stepped onto; a hop or a step off an edge flies until it meets
        // what is under it again (a bank too high to clear stops the hop's way forward)
        let support = this.supportAt(nx, nz, reach, near);
        if (ft.air && support > ft.y + STEP_UP) { nx = this.x; nz = this.z; this.speed *= 0.5; support = this.supportAt(nx, nz, reach, near); }
        // A step up onto a rock is onto a tread: where its surface is steeper than a walkable slope (a boulder's flank) the
        // walker is held at its foot as at a wall, sliding along it if he can, so he does not climb it a step at a time.
        // Read at the body's leading edge (the flank's foot is the rock's drawn edge on the ground); a rock no taller than a
        // step from the feet (a pebble, a low slab) is stepped onto whatever its slope.
        if (!ft.air && moving) {
          const flank = (px, pz, dx, dz) => {
            const lx = px + dx * BODY_R * 0.9, lz = pz + dz * BODY_R * 0.9, ly = this.supportAt(lx, lz, reach, near);
            return ly > ft.y + 0.05 && ly > this.groundAt(lx, lz) + 0.02 && this.rockSlope(lx, lz, reach, near, ft.y + STEP_UP) > ROCK_GRADE;
          };
          const sx = nx - this.x, sz = nz - this.z, sl = Math.hypot(sx, sz);
          if (sl > 1e-6 && flank(nx, nz, sx / sl, sz / sl)) {
            // slide: the step turned along the flank, the least turn whose leading edge is not on it
            let done = false;
            for (const a of [0.5, -0.5, 1.0, -1.0, 1.45, -1.45]) {
              const c = Math.cos(a), s = Math.sin(a), rx = (sx * c - sz * s) / sl, rz = (sx * s + sz * c) / sl;
              const qx = this.x + rx * sl * c, qz = this.z + rz * sl * c;
              if (!flank(qx, qz, rx, rz) && !this.blockedAt(qx, qz, ft.y, near)) { nx = qx; nz = qz; done = true; break; }
            }
            if (!done) { nx = this.x; nz = this.z; }
            support = this.supportAt(nx, nz, reach, near);
            pressed = true;
          }
        }
        // a long drop off a rock or a ledge is refused at its edge (into the water is a jump in, and is let go)
        if (!ft.air && support < ft.y - DROP_MAX && this.depthAt(nx, nz, support) < SWIM_DEPTH) {
          nx = this.x; nz = this.z; support = this.supportAt(nx, nz, reach, near); note = note || 'A long drop — find another way down';
        }
        // the water: with the canoe overhead no deeper than CARRY_DEPTH (a step back toward the bank always goes: a
        // portage whose trail ends out in the water, the Kawishiwi River end of the Lake One carry, shoulders the canoe
        // past it); without it, past your depth you swim. A dock's deck stands over the water (the depth is to it).
        const deep = this.depthAt(nx, nz, support);
        if (carrying && deep > CARRY_DEPTH && deep > this.depthAt(this.x, this.z, ft.y) + 0.005) {
          nx = this.x; nz = this.z; this.speed *= 0.3; note = 'Too deep to wade with the canoe overhead'; support = this.supportAt(nx, nz, reach, near);
        } else if (!carrying && deep > SWIM_DEPTH && (!ft.air || ft.y < w.levelAt(nx, nz) - 0.3)) swimNow = true;
        // rubbing along something bleeds a little of the walk (about three quarters of it stays, so a slide along a
        // face keeps going); held fast against it, most of it (the legs' own stride reads the ground made good)
        if (pressed && moving && dt > 0) {
          const made = Math.hypot(nx - this.x, nz - this.z) / (dt * this.boost);
          this.speed *= Math.exp(-dt * (made < 0.15 * this.speed ? 8 : 2));
        }
        // pressed against something to get over: say so
        ft.hint = false;
        if (pressed && moving && !carrying && !ft.air && !note) {
          const a = this.traverseAhead(nx, nz, ft.y, mx, mz, near);
          if (a) { note = a.kind === 'vault' ? '<kbd>Space</kbd>Vault over' : '<kbd>Space</kbd>Climb up'; ft.hint = true; }
        }
        if (ft.air) {
          ft.vy -= GRAVITY * dt; ft.y += ft.vy * dt; ft.t += dt; ft.peak = Math.max(ft.peak, ft.y);
          if (ft.vy <= 0 && ft.y <= support) {
            const fall = ft.peak - support;
            ft.land = Math.min(1, 0.4 + 0.2 * -ft.vy); ft.y = support; ft.vy = 0; ft.air = false; ft.hop = false; // the soundscape plays the landing (audio.js)
            if (fall > 0.6) ft.landT = 0.3;
          }
        } else if (support < ft.y - 0.22) { ft.air = true; ft.vy = 0; ft.t = 0.25; ft.peak = ft.y; ft.hop = false; } // off an edge: a short fall (no take-off)
        else {
          if (support > ft.y + 0.12) stepUp = support;
          ft.y = support > ft.y ? ft.y + (support - ft.y) * (1 - Math.exp(-dt * 25)) : support;
        }
      }
    }
    // fb2 E: how fast the feet are rising (m/s at life), for the stairs' pace
    ft.climb = (ft.climb || 0) + ((dt > 0 && !ft.air && !this.act ? (ft.y - footY0) / (dt * Math.max(1, this.boost)) : 0) - (ft.climb || 0)) * (1 - Math.exp(-dt * 6));
    ft.land = Math.max(0, ft.land - dt * 3);
    st.air = ft.air; st.airT = ft.t; st.vy = ft.vy; st.land = ft.land;
    st.stagger = Math.max(0, (st.stagger || 0) - dt * 1.6);
    this.x = nx; this.z = nz;
    // the gait from the ground the feet actually cover (a trunk or a wall holds you while `speed` still walks; a vault
    // or a climb is not a stride)
    const moved = Math.hypot(this.x - (this._fx ?? this.x), this.z - (this._fz ?? this.z));
    const raw = dt > 0 && moved < 1 ? Math.min(5, moved / dt) : 0;
    st.speed += (raw - st.speed) * (1 - Math.exp(-dt * 12));
    const striding = !this.act && raw / Math.max(1, this.boost) > 0.12;
    st.walkSpeed += ((striding ? 1 : 0) - st.walkSpeed) * (1 - Math.exp(-dt * 8));
    if (!this.act) st.walk += raw * dt * 4.2;
    this._fx = this.x; this._fz = this.z; st.hustle = hustle;
    // which way the legs are going, in the body's frame, for the rig: ahead (1) or back (-1), and across to
    // the right (1) or left (-1); the pose blends a stride, a back-step and a side-step from these
    const goF = moving ? mx * f.x + mz * f.z : 0, goL = moving ? mx * -f.z + mz * f.x : 0, kd = 1 - Math.exp(-dt * 10);
    st.moveFwd += (goF - st.moveFwd) * kd; st.moveLat += (goL - st.moveLat) * kd;
    this.placeOnGround();
    // the move, for the figure
    const depth = this.depthAt(this.x, this.z, ft.y), A = this.act;
    if (A) { /* set in updateAct */ }
    else if (ft.air) this.setMove(ft.hop ? 'jump' : 'fall', dt, { depth });
    else if (ft.landT > 0) { this.setMove('land', dt, { dur: 0.3, depth }); ft.landT -= dt; }
    else if (stepUp > 0 && !(this.move.kind === 'step' && this.move.t < 0.15)) { this.setMove('step', dt, { restart: true, dur: 0.3, top: stepUp, to: { x: this.x + mx * 0.3, y: stepUp, z: this.z + mz * 0.3 }, depth }); }
    else if (this.move.kind === 'step' && this.move.t < this.move.dur) this.setMove('step', dt, { dur: this.move.dur, top: this.move.top, depth });
    else if (striding) this.setMove(depth > 0.3 ? 'wade' : hustle && raw / Math.max(1, this.boost) > WALK.speed * 1.15 ? 'jog' : 'walk', dt, { depth });
    else this.setMove('idle', dt, { depth });
    // where you are, for the HUD header
    if (camp) { const id = this.nearWater(camp.x, camp.z, 6); this.placeName = camp.name ? `${camp.name} campsite` : `Campsite${id ? ' · ' + (w.lakeName(id) || 'unnamed water') : ''}`; }
    else if (onTrail) this.placeName = trail.def.name;
    else { const id = this.nearWater(this.x, this.z, 8); this.placeName = id ? `${w.lakeName(id) || 'Unnamed water'} shore` : LAND[cls] || 'The woods'; }
    let trailText = null;
    if (onTrail) {
      const p = this.trailPoint(trail.trail, trail.along);
      const remaining = p.tx * f.x + p.tz * f.z >= 0 ? trail.trail.length - trail.along : trail.along;
      const rods = Math.round(remaining / RODS);
      trailText = `${trail.def.name} · ${rods} ${rods === 1 ? 'rod' : 'rods'} to go`;
    }
    if (A) this.prompt = null;
    else this.footPrompts(c, trail, note, trailText);
    if (swimNow) this.enterSwim();
  }

  // one prompt line: a note or where you are, then the keys that do something here
  say(info, ...acts) {
    const keys = acts.filter(Boolean).map(([k, t]) => `<kbd>${k}</kbd>${t}`).join(' &nbsp; ');
    const text = info ? (keys ? `${info} &nbsp;·&nbsp; ${keys}` : info) : keys;
    this.prompt = text ? { key: null, text } : null;
  }

  footPrompts(c, trail, note, trailText) {
    if (this.packs && this.packs.footPrompts(c, trail, note, trailText)) return; // trip core B: the packs take over the portage prompts where they change them (packs.js)
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

  // Lay the hull on the ground at (x, z), bow along heading. It takes the slope under it along its length (plus
  // pitchExtra for a hull that came down crooked) and across it, then settles until its bottom (the keel and the
  // bilges, sampled) rests on the drawn ground without cutting into it. Over water an end rests on the water.
  restHull(x, z, heading, pitchExtra = 0) {
    const w = this.world, fx = Math.cos(heading), fz = -Math.sin(heading), rx = -fz, rz = fx; // bow, starboard
    const under = (px, pz) => { const s = this.groundAt(px, pz); return w.shoreAt(px, pz) < 0 ? Math.max(s, w.levelAt(px, pz)) : s; };
    const hb = under(x + fx * 2.2, z + fz * 2.2), hs = under(x - fx * 2.2, z - fz * 2.2);
    let cross = 0;
    for (const a of [-1.4, 0, 1.4]) cross += under(x + fx * a + rx * 0.45, z + fz * a + rz * 0.45) - under(x + fx * a - rx * 0.45, z + fz * a - rz * 0.45);
    const pitch = Math.atan2(hb - hs, 4.4) + pitchExtra, roll = clamp(-Math.atan2(cross / 3, 0.9), -0.3, 0.3); // + roll lowers the starboard side
    const ch = Math.cos(heading), sh = Math.sin(heading), cp = Math.cos(pitch), sp = Math.sin(pitch), cr = Math.cos(roll), sr = Math.sin(roll);
    let y = -Infinity;
    for (const [px, py, pz] of HULL_BOTTOM) {
      const y1 = py * cr - pz * sr, z1 = py * sr + pz * cr;           // roll about the keel line
      const x2 = px * cp - y1 * sp, y2 = px * sp + y1 * cp;           // pitch about the beam
      y = Math.max(y, under(x + x2 * ch + z1 * sh, z - x2 * sh + z1 * ch) - y2); // turned to the heading
    }
    this.canoe.dropHull(x, y - HULL_PIVOT_LIFT, z, heading, pitch);
    this.canoe.hull.rotation.set(roll, heading, pitch, 'YZX');
    this.canoe.hull.updateMatrixWorld();
    this.restAt = { p: this.canoe.hull.position.clone(), r: this.canoe.hull.rotation.clone() }; // fb C: kept there through a swim (afterRig)
  }

  dropHull(set = false) {
    const c = this.carry, f = this.forward;
    const x = this.x + f.x * (set ? 1.4 : 0.9), z = this.z + f.z * (set ? 1.4 : 0.9), heading = this.heading + (set ? 0 : (Math.random() - 0.5) * 0.8);
    c.drop = { x, z, heading }; c.choice = false;
    this.restHull(x, z, heading, set ? 0 : 0.2);
    this.mode = 'walk'; this.canoe.state.mode = 'walk';
    if (!set) this.dropCount = (this.dropCount || 0) + 1; // the journal counts the times the hull came down
    this.prompt = { key: null, text: set ? 'You set the canoe down' : 'The canoe came down' };
  }

  // Back on foot where a save left you (main.js, on load): at (x, z), the canoe on the ground where it lay. False when
  // either spot is not on land with its tile in (then the canoe goes back on the water, as for a trail or a carry).
  standAt({ x, z, heading = 0, drop }) {
    const w = this.world, land = (px, pz) => w.isReady(px, pz) && w.inBounds(px, pz, 40) && w.shoreAt(px, pz) > 0.3;
    if (!drop || !land(x, z) || !land(drop.x, drop.z)) return false;
    this.mode = 'walk'; this.x = x; this.z = z; this.heading = heading; this.speed = 0; this.yawRate = 0; this.foot = null; this.act = null; this.boost = 1;
    this.landing = null; this.ashore = null; this.swim = null; this.bob = null;
    this.carry = { trail: null, drop: { x: drop.x, z: drop.z, heading: drop.heading }, hitCooldown: 0, from: null, choice: false };
    this.restHull(drop.x, drop.z, drop.heading);
    this.placeOnGround();
    return true;
  }

  pickUpHull() {
    this.canoe.pickUpHull();
    const c = this.carry;
    c.drop = null; c.hitCooldown = 1.0; c.choice = false; c.from = { x: this.x, z: this.z };
    this.mode = 'carry'; this.canoe.state.mode = 'carry';
  }

  // Jump to the nearest open water around a map point (minimap click, entry point). The tiles around the
  // target stream in first; the canoe sits still until they are there. Open water is looked for in tiers: a spot
  // 6 m off the shore within 120 m (the lakes); then, for a narrow river or a small lake that has none, the spot
  // nearest the point 2.5 m off the shore within 120 m (a canoe is under a metre wide); then 6 m off the shore
  // out to 600 m; only then is the jump refused.
  async teleport(x, z) {
    const w = this.world;
    if (this.teleporting) return false;
    this.teleporting = true;
    try {
      if (w.tiles) await w.tiles.ensure(x, z, 130);
      const nearest = (reach, step, sd) => {
        let best = null;
        for (let dz = -reach; dz <= reach; dz += step) for (let dx = -reach; dx <= reach; dx += step) {
          const d = Math.hypot(dx, dz);
          if (best && d >= best.d) continue;
          const px = x + dx, pz = z + dz;
          if (!w.inBounds(px, pz, 50) || !w.isReady(px, pz) || w.shoreAt(px, pz) > sd) continue;
          best = { x: px, z: pz, d };
        }
        return best;
      };
      let best = nearest(120, 5, -6) || nearest(120, 2, -2.5);
      if (!best) {
        if (w.tiles) await w.tiles.ensure(x, z, 610);
        best = nearest(600, 5, -6);
      }
      if (!best) return false;
      if (this.carry && this.carry.drop) this.canoe.pickUpHull(); // the canoe comes along
      this.mode = 'paddle'; this.carry = null; this.landing = null; this.ashore = null; this.swim = null;
      this.x = best.x; this.z = best.z; this.speed = 0; this.yawRate = 0; this.boost = 1;
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
    if (this.packs && this.packs.beforeLaunch(l) === false) return; // trip core B: the packs load up first, unless one is still back up the trail (packs.js)
    if (this.carry && this.carry.drop) this.canoe.pickUpHull();
    const dir = this.world.deeperDir(l.x, l.z);
    this.mode = 'paddle'; this.carry = null; this.ashore = null; this.balance = 0; this.extraRoll = 0;
    this.x = l.x; this.z = l.z;
    this.heading = Math.atan2(-dir.z, dir.x);
    this.speed = 0.5; this.yawRate = 0; this.boost = 1;
    this.canoe.state.stroke = 0; this.canoe.state.power = 0; this.canoe.state.mode = 'paddle';
    this.bob = null;
    this.placeOnWater();
  }
}
