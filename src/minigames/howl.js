// Howl and listen (docs/story/60-side-stories.md S4 "The set pieces"; Round 7 stream 7a). Pure. At a survey station
// between 23:00 and 04:00 the player howls (their own bad howl, the caller's sound); three game minutes of quiet; if the
// pack is in hearing (seeded nightly inside its range, best near 03:00) the answer comes from its bearing, loud or faint
// by distance, the pups' yips over it in August; a station near a cliff can throw the first answer off the wall (from
// the mirrored side). The player turns to face the sound and marks it: the bearing they face is the line (pencil.bearing,
// the caller's), so a careless mark is a wrong line. Three lines from three stations cross in a ring (crossing()).
//
//   packAt({ year, doy, seed, range: { x, z, r } }) → { x, z }      the pack tonight (a seeded point in its range)
//   bearingDeg(dx, dz) → 0..360 (0 north = −z, clockwise: hud.js drawPencil's bearing)
//   canHowl(hours) → bool · crossing([{ x, z, deg }]) → { x, z, r } | null
//   howl(opts, api) → handle   opts { station: { id, x, z, cliff? (deg the wall faces) }, pack: { x, z }, month, seed,
//                              hours }
//     handle.update(dt, { hours }) → null | { done, result: 'marked' | 'silent' | 'cancelled' }
//     handle.phase 'quiet' | 'answer' | 'listen'    handle.cues → [{ kind: 'answer', deg, loud, pups, echo }]
//     handle.mark(faceDeg) → { deg, true, off } | null   (in 'answer' / 'listen' only)
export const HOWL = {
  hours: [23, 4],       // h: a station's Howl, 23:00 to 04:00
  quiet: 3 / 60,        // h: three game minutes before the answer
  listen: 6 / 60,       // h: the answer can be marked for this long after it comes
  hear: 4200,           // m: the pack is heard within this
  best: 3,              // h: best near 03:00
  chance: [0.55, 0.9],  // the answer's chance, far from 03:00 → at it (in hearing)
};
const hash = (s) => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h >>> 0; };
const rngOf = (seed) => { let a = hash(String(seed)) || 1; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
export const bearingDeg = (dx, dz) => (((Math.atan2(dx, -dz) * 180) / Math.PI) % 360 + 360) % 360;
export const angDiff = (a, b) => { const d = (((a - b) % 360) + 540) % 360 - 180; return Math.abs(d); };
export const canHowl = (h) => h >= HOWL.hours[0] || h < HOWL.hours[1];

export function packAt({ year = 2026, doy = 180, seed = 'agnes', range = { x: -66500, z: -16500, r: 1800 } } = {}) {
  const R = rngOf(`pack:${seed}:${year}:${doy}`), a = R() * Math.PI * 2, d = Math.sqrt(R()) * range.r;
  return { x: range.x + Math.cos(a) * d, z: range.z + Math.sin(a) * d };
}

// where lines cross: the mean of every pair's crossing (in front of both stations), r its spread (at least 250 m)
export function crossing(lines = []) {
  const pts = [];
  for (let i = 0; i < lines.length; i++) for (let j = i + 1; j < lines.length; j++) {
    const A = lines[i], B = lines[j], ta = (A.deg * Math.PI) / 180, tb = (B.deg * Math.PI) / 180;
    const ax = Math.sin(ta), az = -Math.cos(ta), bx = Math.sin(tb), bz = -Math.cos(tb);
    const den = ax * bz - az * bx; if (Math.abs(den) < 1e-6) continue;
    const s = ((B.x - A.x) * bz - (B.z - A.z) * bx) / den, u = ((B.x - A.x) * az - (B.z - A.z) * ax) / den;
    if (s < 0 || u < 0) continue;
    pts.push({ x: A.x + ax * s, z: A.z + az * s });
  }
  if (!pts.length) return null;
  const x = pts.reduce((s, p) => s + p.x, 0) / pts.length, z = pts.reduce((s, p) => s + p.z, 0) / pts.length;
  const r = Math.max(250, ...pts.map((p) => Math.hypot(p.x - x, p.z - z)));
  return { x, z, r };
}

export function howl(opts = {}, api = {}) {
  const S = opts.station || { id: 'st', x: 0, z: 0 }, P = opts.pack || { x: 0, z: -2000 };
  const R = rngOf(`howl:${opts.seed ?? 0}:${S.id}`);
  const h0 = Number.isFinite(opts.hours) ? opts.hours : 0;
  const d = Math.hypot(P.x - S.x, P.z - S.z), trueDeg = bearingDeg(P.x - S.x, P.z - S.z);
  const dh = Math.abs((((h0 - HOWL.best) % 24) + 36) % 24 - 12); // hours from 03:00
  const heard = d <= HOWL.hear && R() < HOWL.chance[0] + (HOWL.chance[1] - HOWL.chance[0]) * (1 - Math.min(1, dh / 4));
  // a cliff's echo: the first answer seems to come off the wall (mirrored across the wall's line)
  const echo = Number.isFinite(S.cliff) && angDiff(S.cliff, trueDeg) < 100 && R() < 0.6;
  const heardDeg = echo ? S.cliff : trueDeg; // (off the wall: from the cliff's side)
  const loud = Math.max(0.08, 1 - d / HOWL.hear);
  const h = {
    station: S, phase: 'quiet', t: 0, hours: h0, cues: [], done: null, answer: null,
    update(dt, { hours } = {}) {
      if (this.done) return this.done;
      const gh = Number.isFinite(hours) ? ((hours - h0 + 24) % 24) : (this.t += dt / 3600);
      if (Number.isFinite(hours)) this.t = gh;
      if (this.phase === 'quiet' && this.t >= HOWL.quiet) {
        if (!heard) return this.finish('silent', { d: Math.round(d) });
        this.phase = 'answer';
        this.answer = { deg: heardDeg, loud, pups: opts.month === 8, echo, at: this.t };
        this.cues.push({ kind: 'answer', ...this.answer });
        // an echo: the true answer follows a few seconds after, from its own side
        if (echo) this.cues.push({ kind: 'answer', deg: trueDeg, loud: loud * 0.8, pups: opts.month === 8, echo: false, delay: 3.5 });
        if (typeof api.emit === 'function') api.emit('answered', { deg: Math.round(trueDeg), d: Math.round(d), echo });
      }
      if (this.phase === 'answer' && this.t - this.answer.at > 0.004) this.phase = 'listen';
      if ((this.phase === 'answer' || this.phase === 'listen') && this.t - this.answer.at > HOWL.listen) return this.finish('unmarked', {});
      return null;
    },
    mark(faceDeg) {
      if (this.done || !(this.phase === 'answer' || this.phase === 'listen')) return null;
      const r = { deg: ((faceDeg % 360) + 360) % 360, true: trueDeg, off: angDiff(faceDeg, trueDeg) };
      this.finish('marked', { deg: Math.round(r.deg), off: Math.round(r.off), station: S.id });
      return r;
    },
    finish(result, data = {}) { this.done = { done: true, result }; if (typeof api.done === 'function') api.done(result, data); return this.done; },
    cancel() { this.done = this.done || { done: true, result: 'cancelled' }; },
  };
  return h;
}
