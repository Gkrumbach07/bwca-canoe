// The loaded carry against a time (docs/story/60-side-stories.md S1 "The set piece"; campaign-design §10.2's
// minigames, Part 4 Round 4 stream S: `timedCarry`). No timer on screen: the player knows the time as Ollie does, by the
// clock. Two clock readings: the moment you leave the start landing with the canoe up and a pack on, and the moment the
// canoe comes down at the far landing. One trip (the game's single carry); a set-down to rest is allowed and costs its
// minutes. Pure: no game imports (the probe hands it the world), so scripts/cmp-s-unit.mjs runs it in Node.
//
//   timedCarry(opts, api) → handle      (minigames.register('timedCarry', timedCarry))
//     opts { start: { x, z }, end: { x, z }, pts?: [[x, z]…] (the trail, for "off the trail"), record: min (49),
//            probe() → { x, z, hours (game hours, absolute: day*24 + h), carrying (the canoe up), pack (one on your back) },
//            tune?: { startR, endR, leaveR, idle (h), giveUp (h), offTrail (m) } }
//     handle.update(dt) → null | { done: true, result, mins }   result: 'beat' | 'missed' | 'gaveup'
//     handle.state → 'armed' | 'running' | 'done' · handle.t0 (hours at the start) · handle.mins (so far) · handle.cancel()
//   armed    the canoe up and a pack on, within startR of the start: the time runs from the moment you are leaveR past it
//   running  the canoe down within endR of the end: done (its minutes against the record); down elsewhere is a rest
//   gave up  the canoe left down longer than `idle`, or you are back at the start without it, or `giveUp` hours gone,
//            or you are off the trail by more than offTrail (60 S1: "canoe down and left, or the player walks back")
export const TIMED_CARRY = { record: 49, startR: 45, endR: 45, leaveR: 25, idle: 25 / 60, giveUp: 2.5, offTrail: 220 };

const d2 = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
function distToLine(pts, x, z) {
  let best = Infinity;
  for (let i = 1; i < (pts || []).length; i++) {
    const [ax, az] = pts[i - 1], [bx, bz] = pts[i], dx = bx - ax, dz = bz - az, L = dx * dx + dz * dz;
    const t = L > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L)) : 0;
    best = Math.min(best, Math.hypot(ax + dx * t - x, az + dz * t - z));
  }
  return best;
}

export function timedCarry(opts = {}, api = {}) {
  const T = { ...TIMED_CARRY, ...(opts.tune || {}) }, record = opts.record ?? T.record;
  if (!opts.start || !opts.end || typeof opts.probe !== 'function') return null;
  const h = {
    state: 'armed', t0: null, mins: 0, downAt: null, rests: 0, record,
    update() {
      if (h.state === 'done') return null;
      const p = opts.probe(); if (!p || !Number.isFinite(p.x)) return null;
      const hours = p.hours;
      if (h.state === 'armed') {
        // (the canoe up and a pack on near the start: the clock starts as you walk off the landing)
        if (p.carrying && p.pack && d2(p, opts.start) > T.leaveR && d2(p, opts.start) < T.startR + T.leaveR + 40) { h.state = 'running'; h.t0 = hours; }
        return null;
      }
      h.mins = (hours - h.t0) * 60;
      if (!p.carrying) {
        if (d2(p, opts.end) < T.endR) return finish(h.mins <= record ? 'beat' : 'missed');
        if (h.downAt == null) { h.downAt = hours; h.rests++; }
        if (hours - h.downAt > T.idle || d2(p, opts.start) < T.leaveR) return finish('gaveup');
      } else h.downAt = null;
      if (hours - h.t0 > T.giveUp) return finish('gaveup');
      if (opts.pts && distToLine(opts.pts, p.x, p.z) > T.offTrail) return finish('gaveup');
      return null;
    },
    cancel() { h.state = 'done'; },
  };
  function finish(result) {
    h.state = 'done';
    const r = { done: true, result, mins: Math.round(h.mins * 10) / 10, rests: h.rests, record };
    if (typeof api.done === 'function') api.done(result, { mins: r.mins, rests: r.rests, record });
    return r;
  }
  return h;
}
