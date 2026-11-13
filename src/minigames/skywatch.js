// A night on Fourtown (docs/story/60-side-stories.md S3 "The set piece: the calendar and the sky"; Round 7 stream 7a).
// Pure: what tonight's sky and shore hold, from the date, the seed and the weather the caller reads; and the one light's
// own handle (it reads the lamp and the distance). The caller (feed-side7a.js) draws the lights (side7a-draw.js), plays
// the waiting night's beat, and judges prints against what is up (subjectsFor).
//
//   strongNights(year, seed) → [doy]    two or three seeded strong aurora nights a month, September and October
//   trainNights(year, seed) → [doy]     the sheet's satellite-train dates (clear nights, an hour or two after dark)
//   forecast(year, doy, seed) → { from, to } | null   the next strong night within the week (the board's card)
//   forecastWords(f, year) → "NORTHERN LIGHTS: Sept 22–23, strong" (60 S3's card, in its own format)
//   plan({ year, doy, seed, moon, clear, calm, wet, warm, partyNorth, logged, oneSeen, lastOne, lastBeat, dusk })
//     → { events: [{ kind: 'aurora'|'train'|'lantern'|'foxfire'|'onelight', from, to }], beat: { kind, at } | null }
//       hours past midnight run on: 25 is 01:00. The one light: the first calm, moonless night after two lights logged,
//       then at most once a week, never with a party at the north end; the beat (beaver, owl, voices, moose) one a night
//       between 21:00 and 01:00, never the same two nights running, never on the one light's night
//   onelight(opts, api) → handle   opts { at: { x, z } (over the north bay), wind: { x, z } (where the wind goes),
//                                  hours, seed }
//     handle.update(dt, { hours, player, lamp, face }) → null | { done, result: 'out' | 'faded' }
//     handle.pos() → { x, z, y, a (0..1) }    it drifts slowly upwind; out the moment a lamp shows white at it, or the
//                                            paddler comes within 300 m; with the lamp off or red it holds 1–3 minutes
//   subjectsFor({ eye, dir, events, hours, pos }) → ['s3.aurora'|'s3.train'|'s3.lantern'|'s3.onelight']
export const SKY = {
  aurora: [23, 26],        // h: 23:00–02:00 on a strong night
  train: [1, 2],           // h after dusk
  oneR: 300,               // m: paddled this near, it goes out
  oneHold: [1 / 60, 3 / 60], // h it holds with the lamp off or red
  oneDrift: 0.25,          // m/s upwind
  lampDeg: 30,             // ° off the lamp's line that a white lamp "shows" toward it
  beats: ['beaver', 'owl', 'voices', 'moose'],
};
const hash = (s) => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h >>> 0; };
const rngOf = (seed) => { let a = hash(String(seed)) || 1; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
const leap = (y) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
const doyOf = (y, m, d) => { const L = [31, leap(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]; let n = d; for (let i = 0; i < m - 1; i++) n += L[i]; return n; };
const mdOf = (y, doy) => { const L = [31, leap(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]; let m = 0; while (m < 12 && doy > L[m]) { doy -= L[m]; m++; } return { month: m + 1, day: doy }; };
const MON = ['Jan', 'Feb', 'March', 'April', 'May', 'June', 'July', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec'];

export function strongNights(year, seed = 'fourtown') {
  const out = [];
  for (const m of [9, 10]) {
    const R = rngOf(`aurora:${seed}:${year}:${m}`), n = R() < 0.5 ? 2 : 3, first = doyOf(year, m, 1), len = 30;
    for (let i = 0; i < n; i++) out.push(first + Math.floor(((i + R() * 0.8) / n) * (len - 2)));
  }
  return [...new Set(out)].sort((a, b) => a - b);
}
export function trainNights(year, seed = 'fourtown') {
  const out = [], R = rngOf(`train:${seed}:${year}`);
  for (let d = doyOf(year, 9, 1) + Math.floor(R() * 4); d <= doyOf(year, 10, 31); d += 5 + Math.floor(R() * 4)) out.push(d);
  return out;
}
export function forecast(year, doy, seed) {
  const s = strongNights(year, seed).find((d) => d >= doy && d <= doy + 7);
  return s != null ? { from: s, to: s + 1 } : null;
}
export function forecastWords(f, year) {
  if (!f) return null;
  const a = mdOf(year, f.from), b = mdOf(year, f.to);
  return `NORTHERN LIGHTS: ${MON[a.month - 1]} ${a.day}–${a.month === b.month ? b.day : `${MON[b.month - 1]} ${b.day}`}, strong`;
}

export function plan({ year = 2026, doy = 260, seed = 'fourtown', moon = 0, clear = true, calm = true, wet = false, warm = false, partyNorth = false, logged = 0, oneSeen = false, lastOne = -99, lastBeat = null, dusk = 20 } = {}) {
  const ev = [];
  // (a strong night's aurora shows from 23:00 the night of, and its small hours belong to the night before: doy is the evening's)
  if (clear && strongNights(year, seed).includes(doy)) ev.push({ kind: 'aurora', from: SKY.aurora[0], to: SKY.aurora[1] });
  if (clear && trainNights(year, seed).includes(doy)) ev.push({ kind: 'train', from: dusk + SKY.train[0], to: dusk + SKY.train[0] + 0.12 });
  if (calm && warm && partyNorth) ev.push({ kind: 'lantern', from: 21.5, to: 24.5 });
  if (wet) ev.push({ kind: 'foxfire', from: dusk + 0.5, to: 29.5 });
  const R = rngOf(`night:${seed}:${year}:${doy}`);
  const oneOk = logged >= 2 && calm && moon < 0.25 && !partyNorth && (!oneSeen || doy - lastOne >= 7) && (!oneSeen || R() < 0.35);
  let beat = null;
  if (oneOk) { const at = 24.5 + R() * 1.2; ev.push({ kind: 'onelight', from: at, to: at + 0.25 }); }
  else {
    const pool = SKY.beats.filter((b) => b !== lastBeat && (b !== 'voices' || calm));
    beat = { kind: pool[Math.floor(R() * pool.length) % pool.length], at: 21 + R() * 4 };
  }
  return { events: ev, beat };
}
const active = (events, hours, kind) => events.find((e) => e.kind === kind && ((hours >= e.from && hours < e.to) || (hours + 24 >= e.from && hours + 24 < e.to)));
export { active };

const angTo = (eye, dir, x, z) => {
  const dx = x - eye.x, dz = z - eye.z, d = Math.hypot(dx, dz) || 1, dl = Math.hypot(dir.x, dir.z) || 1;
  return { d, deg: (Math.acos(Math.max(-1, Math.min(1, (dx * dir.x + dz * dir.z) / (d * dl)))) * 180) / Math.PI };
};
// what a print holds of tonight's lights: the aurora and the train by the direction (north; west, climbing), the lantern
// and the one light by where they are
export function subjectsFor({ eye, dir, events = [], hours = 0, lantern = null, one = null } = {}) {
  const out = [];
  if (!eye || !dir) return out;
  const yawDeg = (((Math.atan2(dir.x, -dir.z) * 180) / Math.PI) + 360) % 360, up = dir.y ?? 0;
  if (active(events, hours, 'aurora') && (yawDeg < 50 || yawDeg > 310) && up > -0.1) out.push('s3.aurora');
  if (active(events, hours, 'train') && yawDeg > 200 && yawDeg < 340 && up > 0) out.push('s3.train');
  if (lantern && active(events, hours, 'lantern')) { const a = angTo(eye, dir, lantern.x, lantern.z); if (a.deg < 18 && a.d < 1500) out.push('s3.lantern'); }
  if (one && one.a > 0.2) { const a = angTo(eye, dir, one.x, one.z); if (a.deg < 15 && a.d < 1400) out.push('s3.onelight'); }
  return out;
}

export function onelight(opts = {}, api = {}) {
  const R = rngOf(`one:${opts.seed ?? 0}`), hold = SKY.oneHold[0] + R() * (SKY.oneHold[1] - SKY.oneHold[0]);
  const w = opts.wind || { x: 0, z: 1 }, wl = Math.hypot(w.x, w.z) || 1;
  const h = {
    x: opts.at ? opts.at.x : 0, z: opts.at ? opts.at.z : 0, y: 2.5, a: 0, t: 0, hours: opts.hours || 0, done: null, seen: false, fading: false,
    pos() { return { x: this.x, z: this.z, y: this.y, a: this.a }; },
    update(dt, { player = null, lamp = 'off', face = null } = {}) {
      if (this.done) return this.done;
      this.t += dt;
      // it drifts upwind (against where the wind goes), slowly
      this.x -= (w.x / wl) * SKY.oneDrift * dt; this.z -= (w.z / wl) * SKY.oneDrift * dt;
      if (!this.fading) this.a = Math.min(1, this.a + dt / 2.5);
      if (player) {
        const d = Math.hypot(this.x - player.x, this.z - player.z);
        if (d < 1400 && !this.seen) { this.seen = true; if (typeof api.emit === 'function') api.emit('seen', { d: Math.round(d) }); }
        if (d < SKY.oneR) return this.finish('out', { why: 'near' });
        if (lamp === 'white' && face) { const a = angTo(player, face, this.x, this.z); if (a.deg < SKY.lampDeg) return this.finish('out', { why: 'lamp' }); }
      }
      // with the lamp off or red it holds a minute to three (game time: dt is real seconds × the clock's rate, the caller's)
      if ((opts.gameT ? opts.gameT() : this.t / 3600 * 8) > hold) this.fading = true;
      if (this.fading) { this.a = Math.max(0, this.a - dt / 4); if (this.a <= 0) return this.finish('faded', {}); }
      return null;
    },
    finish(result, data) { this.a = 0; this.done = { done: true, result }; if (typeof api.done === 'function') api.done(result, data); return this.done; },
    cancel() { this.done = this.done || { done: true, result: 'cancelled' }; },
  };
  return h;
}
