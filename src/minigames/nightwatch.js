// The night at two on Big Moose (docs/story/60-side-stories.md S2 "The set piece: two in the morning"; Round 7 stream
// 7a). Pure: the clock, the player and the lamp come in through update(); the caller (feed-side7a.js) draws the animals
// where the handle says, plays the cues, and judges the prints with frameOk / subjectsFor. Results through api.emit /
// api.done: 'charged', 'lit', 'bear' along the way, 'done' at the end (minigames.say: the story's mg:nightwatch event
// and the fact mg.nightwatch.<result>).
//
// The table (60 S2), in game hours:
//   02:00        footfalls on the ridge 40 m behind the tent, heavy, step … step … stop, left to right over 1.5 min:
//                a cow moose in deadfall, front and hind feet landing nearly together ("two legs by the sound")
//   02:03        two hollow knocks: her calf's hoof on a hollow log
//   02:04        a minute of silence: they have stopped to listen to you (the unexplained frame's minute)
//   02:05–02:12  branches ripped down and a low huff at the ridge's east end: a black bear standing at the serviceberry
// The player: in the tent the sounds pass; out on foot with the lamp off, within ~10 m of the calf the cow bluff-charges
// (a step back, a crouch, an energy cost: the caller's); the lamp on: eyeshine two metres up, the moose freeze and go
// (lit prints within ~25 m are clear); the bear, lit, stands, turns its head, drops and leaves; food on the ground makes
// it bear.js's camp visit instead (the caller's).
//
//   nightwatch(opts, api) → handle      opts { ridge: { a: {x,z}, b: {x,z} } (the ridge line, west → east, 40 m behind
//                                       the tent), tent: {x,z}, berry: {x,z}, logAt: {x,z}, birches: {x,z}, hung, seed,
//                                       hours (the clock at the start) }
//   handle.update(dt, { hours, player: { x, z, onFoot }, lamp: 'off'|'red'|'white', face: { x, z } }) → null | { done }
//   handle.cues → [{ kind: 'step'|'knock'|'huff'|'rip', x, z, n }] (drained by the caller) · phase · flags
//   handle.moose() / calf() / bear() → { x, z, heading, pose, show } (pose: 'walk'|'stand'|'freeze'|'charge'|'flee'|
//                                      'upright'|'down'|'gone')
//   handle.frameOk({ eye, dir, lamp }) → bool       a picture toward the two birches in the silent minute, lamp off
//   handle.subjectsFor({ eye, dir, lamp }) → ['s2.moose'|'s2.bear']   what a lit print holds clearly
export const NIGHT = {
  start: 2.0,                 // h: the sleep breaks
  walk: [2.0, 2.025],         // h: the cow's walk along the ridge (1.5 game minutes)
  knock: 2.05,                // h: the calf's two knocks (02:03)
  quiet: [2.0667, 2.0833],    // h: the minute of silence (02:04–02:05)
  bear: [2.0833, 2.2],        // h: the bear at the serviceberry (02:05–02:12)
  end: 2.2,                   // h
  chargeR: 10,                // m from the calf: the cow's bluff charge (lamp off, on foot)
  litR: 25,                   // m: a lit print is clear within this
  lampDeg: 26,                // ° off the lamp's line that it lights
  frameDeg: 22,               // ° off the camera's line the two birches must sit within
  frameD: [12, 90],           // m to the birches
  stepEvery: 1.6 / 60,        // h between the cow's steps (game time: ~1.6 game minutes is too slow; see stepGap)
};
const hash = (s) => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h >>> 0; };
const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const angTo = (eye, dir, x, z) => {
  const dx = x - eye.x, dz = z - eye.z, d = Math.hypot(dx, dz) || 1, dl = Math.hypot(dir.x, dir.z) || 1;
  const c = (dx * dir.x + dz * dir.z) / (d * dl);
  return { d, deg: (Math.acos(Math.max(-1, Math.min(1, c))) * 180) / Math.PI };
};

export function nightwatch(opts = {}, api = {}) {
  const R = opts.ridge || { a: { x: -30, z: 40 }, b: { x: 30, z: 40 } };
  const berry = opts.berry || R.b, tent = opts.tent || { x: 0, z: 0 }, birches = opts.birches || { x: (R.a.x + R.b.x) / 2, z: (R.a.z + R.b.z) / 2 };
  const h0 = Number.isFinite(opts.hours) ? opts.hours : NIGHT.start;
  const seed = hash(String(opts.seed ?? 'S2'));
  const along = (t) => ({ x: lerp(R.a.x, R.b.x, t), z: lerp(R.a.z, R.b.z, t) });
  const ridgeHeading = Math.atan2(-(R.b.z - R.a.z), R.b.x - R.a.x);
  const h = {
    phase: 'walk', hours: h0, cues: [], flags: { out: false, lit: false, charged: false, bearLit: false, eyes: false, raid: !opts.hung }, done: null,
    mooseState: 'walk', bearState: 'hidden', fled: null, chargeT: 0, steps: 0, knocks: 0, rips: 0,
    // where the cow is along the ridge: walking 0 → 0.75 over the walk, standing still through the quiet, gone after
    mooseT() {
      const t = this.hours;
      if (t < NIGHT.walk[0]) return 0;
      if (t < NIGHT.walk[1]) return 0.75 * ((t - NIGHT.walk[0]) / (NIGHT.walk[1] - NIGHT.walk[0]));
      return 0.75;
    },
    moose() {
      if (this.fled != null || this.hours >= NIGHT.bear[0] + 0.01) {
        // gone east along the ridge and over it
        const k = clamp01((this.hours - (this.fled ?? NIGHT.bear[0])) * 60 / 1.5);
        const p = along(0.75 + 0.25 * k);
        return { ...p, heading: ridgeHeading, pose: k >= 1 ? 'gone' : 'flee', show: k < 1 };
      }
      const p = along(this.mooseT());
      const pose = this.chargeT > 0 ? 'charge' : this.mooseState === 'freeze' ? 'freeze' : this.hours < NIGHT.walk[1] ? 'walk' : 'stand';
      if (this.chargeT > 0 && this.player) {
        const k = 1 - this.chargeT / 2.2, dx = this.player.x - p.x, dz = this.player.z - p.z, d = Math.hypot(dx, dz) || 1, reach = Math.max(0, d - 3.5) * Math.sin(Math.PI * k);
        return { x: p.x + (dx / d) * reach, z: p.z + (dz / d) * reach, heading: Math.atan2(-dz, dx), pose, show: true };
      }
      return { ...p, heading: ridgeHeading, pose, show: true };
    },
    calf() {
      const m = this.moose(), back = 4.5, dx = Math.cos(m.heading), dz = -Math.sin(m.heading);
      return { x: m.x - dx * back, z: m.z - dz * back, heading: m.heading, pose: m.pose === 'charge' ? 'stand' : m.pose, show: m.show };
    },
    bear() {
      const t = this.hours;
      if (t < NIGHT.bear[0] || this.bearState === 'gone') return { x: berry.x, z: berry.z, heading: 0, pose: 'gone', show: false };
      if (this.flags.raid && opts.raid !== false) return { x: berry.x, z: berry.z, heading: 0, pose: 'gone', show: false }; // (bear.js's visit has it)
      const pose = this.bearState === 'down' ? 'down' : 'upright';
      return { x: berry.x + 0.6, z: berry.z + 0.4, heading: Math.atan2(-(tent.z - berry.z), tent.x - berry.x), pose, show: true };
    },
    cue(kind, x, z, n = 1) { this.cues.push({ kind, x, z, n, at: this.hours }); },
    update(dt, { hours, player = null, lamp = 'off', face = null } = {}) {
      if (this.done) return this.done;
      const was = this.hours;
      if (Number.isFinite(hours)) this.hours = hours; else this.hours += dt / 3600;
      this.player = player;
      const t = this.hours;
      // the cow's steps on the ridge: a pair landing together (front and hind), then a stop
      if (t < NIGHT.walk[1] + 0.003 && this.fled == null) {
        const n = Math.floor((t - NIGHT.walk[0]) / ((NIGHT.walk[1] - NIGHT.walk[0]) / 9));
        if (n > this.steps && n <= 10) { this.steps = n; const p = along(this.mooseT()); if (n % 3 !== 0) this.cue('step', p.x, p.z, 2); }
      }
      if (was < NIGHT.knock && t >= NIGHT.knock && this.fled == null) { const c = this.calf(); this.cue('knock', opts.logAt ? opts.logAt.x : c.x, opts.logAt ? opts.logAt.z : c.z, 2); this.knocks = 2; }
      this.phase = t < NIGHT.walk[1] ? 'walk' : t < NIGHT.quiet[0] ? 'knock' : t < NIGHT.quiet[1] ? 'quiet' : t < NIGHT.end ? 'bear' : 'end';
      // the bear: rips and huffs at the serviceberry, every 40 s of game time or so, until lit or done
      if (this.phase === 'bear' && this.bearState !== 'gone' && !(this.flags.raid && opts.raid !== false)) {
        if (this.bearState === 'hidden') { this.bearState = 'up'; api.emit && api.emit('bear', { hung: !!opts.hung }); }
        const k = Math.floor((t - NIGHT.bear[0]) * 60 / 0.7);
        if (k > this.rips) { this.rips = k; this.cue(k % 3 === 2 ? 'huff' : 'rip', berry.x, berry.z, 1); }
      } else if (this.phase === 'bear' && this.flags.raid && opts.raid !== false && this.bearState === 'hidden') { this.bearState = 'raid'; api.emit && api.emit('bear', { hung: false, raid: true }); }
      if (player) {
        const dTent = Math.hypot(player.x - tent.x, player.z - tent.z);
        if (player.onFoot && dTent > 6 && !this.flags.out) { this.flags.out = true; api.emit && api.emit('out', {}); }
        // the lamp on the moose: eyeshine, they freeze, then go
        const m = this.moose();
        if (m.show && m.pose !== 'flee' && lamp === 'white' && face) {
          const a = angTo(player, face, m.x, m.z);
          if (a.deg < NIGHT.lampDeg && a.d < 60) {
            if (!this.flags.eyes) { this.flags.eyes = true; this.mooseState = 'freeze'; this.freezeAt = t; api.emit && api.emit('lit', { d: Math.round(a.d) }); this.flags.lit = true; }
          }
        }
        if (this.mooseState === 'freeze' && this.fled == null && t - this.freezeAt > 0.012) this.fled = t;
        // lamp off, on foot, near the calf: the bluff charge (once)
        const c = this.calf();
        if (c.show && player.onFoot && lamp !== 'white' && !this.flags.charged && this.fled == null && Math.hypot(player.x - c.x, player.z - c.z) < NIGHT.chargeR) {
          this.flags.charged = true; this.chargeT = 2.2; api.emit && api.emit('charged', {});
        }
        if (this.chargeT > 0) { this.chargeT -= dt; if (this.chargeT <= 0) { this.chargeT = 0; this.fled = t; } }
        // the lamp on the bear: it stands, turns its head, drops to four feet and leaves
        const b = this.bear();
        if (b.show && lamp === 'white' && face) {
          const a = angTo(player, face, b.x, b.z);
          if (a.deg < NIGHT.lampDeg && a.d < 45 && !this.flags.bearLit) { this.flags.bearLit = true; this.bearLitAt = t; api.emit && api.emit('bearlit', {}); }
        }
        if (this.flags.bearLit && this.bearState === 'up' && t - this.bearLitAt > 0.006) this.bearState = 'down';
        if (this.bearState === 'down' && t - this.bearLitAt > 0.015) this.bearState = 'gone';
      }
      if (t >= NIGHT.end) return this.finish();
      return null;
    },
    // the frame: in the silent minute, lamp off, the camera on the two birches (never in the live view; once a save:
    // the caller's)
    frameOk({ eye, dir, lamp = 'off', hours = this.hours } = {}) {
      if (!eye || !dir || lamp === 'white') return false;
      if (!(hours >= NIGHT.quiet[0] && hours < NIGHT.quiet[1])) return false;
      const a = angTo(eye, dir, birches.x, birches.z);
      return a.deg <= NIGHT.frameDeg && a.d >= NIGHT.frameD[0] && a.d <= NIGHT.frameD[1];
    },
    subjectsFor({ eye, dir, lamp = 'off' } = {}) {
      const out = [];
      if (!eye || !dir || lamp !== 'white') return out;
      const m = this.moose(); if (m.show) { const a = angTo(eye, dir, m.x, m.z); if (a.deg < 20 && a.d <= NIGHT.litR) out.push('s2.moose'); }
      const b = this.bear(); if (b.show) { const a = angTo(eye, dir, b.x, b.z); if (a.deg < 20 && a.d <= NIGHT.litR) out.push('s2.bear'); }
      return out;
    },
    finish(result = 'done') {
      if (this.done) return this.done;
      this.done = { done: true, result };
      if (typeof api.done === 'function') api.done(result, { ...this.flags });
      return this.done;
    },
    cancel() { this.done = this.done || { done: true, result: 'cancelled' }; },
  };
  void seed;
  return h;
}
