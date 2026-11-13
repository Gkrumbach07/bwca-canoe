// Detection on the run (docs/story/50-finale.md §6.4, §6.5; campaign-design §8.4; Round 3 stream R). Pure: no game
// imports, so story-unit checks the tables in Node. run.js hands it the player's signal and each watcher; it keeps
// each watcher's state and says when the player is caught. There is no meter: the world shows the state (a light
// that holds, two clicks, the loons, the scanner's words).
//
//   RUN_TUNE                       the doc's numbers, verbatim (§6.4), and the checkpoint's floor
//   sightRange({ lamp, moving, moon, day, cover, fog }) → metres a watcher can pick the player out at
//   hearRange(kind, windMph) → metres a sound carries
//   new Stealth()  .judge(w, sig, dtGameMin, now) → 'caught' | null    w: a watcher { id, x, z, light, cone, posted }
//                  .hear(kind, x, z, windMph, watchers, now)          a sound: noticed for each within range
//                  .worst() → 'unseen' | 'noticed' | 'seen' | 'lost'  .reset() (a reset: everyone back to unseen)
//                  .on(fn) fn(evt, w, data) evt: 'noticed' | 'seen' | 'lost' | 'caught' | 'unseen'
export const RUN_TUNE = {
  // §6.4 how far a watcher can pick the player out, at night: [open water, against a shore, in reeds, under the Grumman]
  white: [800, 250, 40, 0], red: [80, 40, 10, 0], moon: [120, 35, 8, 0], dark: [50, 20, 5, 0], day: [1500, 400, 30, 0],
  stillReeds: 3,       // lamp off and still in reeds
  fogK: 0.5,           // fog or the dawn mist halves every figure
  dawnFogOpen: 30,     // a thick bank at dawn on Lake One: open water cut to 30 m
  cone: 150,           // the watchers' own lights: cones about 150 m long
  // §6.4 how far a watcher hears: [calm, wind 8–15 mph, over 15 mph]
  hear: { paddle: [80, 30, 0], bail: [60, 25, 0], pack: [300, 120, 50], hull: [300, 120, 50], grumman: [400, 150, 60] },
  noticeHold: 2,       // s (real): a sighting held 2 s is seen
  twiceMin: 10,        // game minutes: noticed twice within this is seen
  lostMin: 10,         // game minutes with no sighting after seen: lost
  searchMin: 60,       // game minutes a lost watcher searches the last-seen spot
  caughtLight: 25,     // m: within this, a light held on the player for caughtHold s is a catch
  caughtHold: 3,
  landPosted: 10,      // m: landing within this of a posted watcher is a catch
  sweepEnd: 15,        // m: a watcher's light finding the player at a portage end
  near: 1500,          // m: watchers further than this are not judged (§8.4 "per watcher within 1.5 km")
  cpClear: 400,        // §8.5: no watcher within this for a checkpoint
  cpEnergy: 0.25,      // §8.5: energy above this for a checkpoint
  windCover: 15,       // mph: wind over this covers the paddle
};
export const MPH = 2.23694; // m/s → mph

const COVER = { open: 0, shore: 1, reeds: 2, under: 3 };
export function sightRange({ lamp = 'off', moving = true, moon = false, day = false, cover = 'open', fog = 0, dawnFog = false } = {}) {
  const c = COVER[cover] ?? 0;
  if (c === 3) return 0;
  let r;
  if (day) r = RUN_TUNE.day[c];
  else if (lamp === 'white') r = RUN_TUNE.white[c];
  else if (lamp === 'red') r = RUN_TUNE.red[c];
  else {
    r = (moon ? RUN_TUNE.moon : RUN_TUNE.dark)[c];
    if (!moving) r = c === 2 ? RUN_TUNE.stillReeds : r / 2;
  }
  if (fog > 0.35) r *= RUN_TUNE.fogK;
  if (dawnFog && c === 0) r = Math.min(r, RUN_TUNE.dawnFogOpen);
  return r;
}
export function hearRange(kind, windMph = 0) {
  const row = RUN_TUNE.hear[kind];
  if (!row) return 0;
  return windMph > RUN_TUNE.windCover ? row[2] : windMph >= 8 ? row[1] : row[0];
}

const ORDER = { unseen: 0, lost: 1, noticed: 2, seen: 3 };

export class Stealth {
  constructor() { this.st = new Map(); this.fns = new Set(); }
  on(fn) { this.fns.add(fn); return () => this.fns.delete(fn); }
  say(evt, w, data = {}) { for (const fn of this.fns) { try { fn(evt, w, data); } catch (e) { console.warn('stealth', evt, e); } } }
  of(w) {
    let s = this.st.get(w.id);
    if (!s) { s = { state: 'unseen', held: 0, lightHeld: 0, noticedAt: [], seenAt: -1e9, lastSight: -1e9, last: null }; this.st.set(w.id, s); }
    return s;
  }
  state(id) { const s = this.st.get(id); return s ? s.state : 'unseen'; }
  worst() { let b = 'unseen'; for (const s of this.st.values()) if (ORDER[s.state] > ORDER[b]) b = s.state; return b; }
  reset() { this.st.clear(); this.say('unseen', null); }
  set(w, s, state, now, data = {}) {
    if (s.state === state) return;
    s.state = state;
    if (state === 'seen') s.seenAt = now;
    this.say(state, w, data);
  }
  noticeAt(w, s, now, where) {
    s.noticedAt = s.noticedAt.filter((t) => now - t <= RUN_TUNE.twiceMin / 60);
    s.noticedAt.push(now);
    s.last = where;
    if (s.state === 'seen') return;
    if (s.noticedAt.length >= 2) this.set(w, s, 'seen', now, where);
    else this.set(w, s, 'noticed', now, where);
  }
  // one watcher, one step. sig: the player's signal { x, z, lamp, moving, moon, day, cover, fog, dawnFog, landing,
  // atEnd, still }. dt: real seconds; now: game hours (abs). The catch rules are §6.4's three.
  judge(w, sig, dt, now) {
    const s = this.of(w), d = Math.hypot(w.x - sig.x, w.z - sig.z);
    if (d > RUN_TUNE.near) { this.decay(w, s, now); return null; }
    const R = sightRange(sig);
    // the player's own light is seen at its figure from anywhere; a dark player only in a watcher's cone, or by a
    // watcher sitting dark (One, lamp off, the eyes used to the night), and never past the figure
    const lit = sig.lamp !== 'off' && !sig.day;
    const inCone = w.light && w.cone ? coneHas(w, sig.x, sig.z) : false;
    const sees = d <= R && (lit || sig.day || inCone || !w.light) && !w.blind && (w.los == null || w.los);
    if (sees) {
      s.held += dt; s.lastSight = now; s.last = { x: sig.x, z: sig.z };
      if (s.state === 'unseen' || s.state === 'lost') this.noticeAt(w, s, now, s.last);
      if (s.held >= RUN_TUNE.noticeHold && s.state !== 'seen') this.set(w, s, 'seen', now, s.last);
    } else { s.held = Math.max(0, s.held - dt * 0.5); this.decay(w, s, now); }
    // the catch
    if (!sig.day && w.light && inCone && d <= RUN_TUNE.caughtLight && sigVisibleClose(sig)) {
      s.lightHeld += dt;
      if (s.lightHeld >= RUN_TUNE.caughtHold) { this.say('caught', w, { how: 'light', d }); return 'caught'; }
    } else s.lightHeld = 0;
    if (sig.landing && w.posted && d <= RUN_TUNE.landPosted) { this.say('caught', w, { how: 'landing', d }); return 'caught'; }
    if (sig.atEnd && w.light && inCone && d <= RUN_TUNE.sweepEnd && sig.cover !== 'under') { this.say('caught', w, { how: 'sweep', d }); return 'caught'; }
    return null;
  }
  decay(w, s, now) {
    if (s.state === 'seen' && now - s.lastSight > RUN_TUNE.lostMin / 60) this.set(w, s, 'lost', now, s.last);
    else if (s.state === 'noticed' && now - s.lastSight > RUN_TUNE.lostMin / 60) this.set(w, s, 'unseen', now);
    else if (s.state === 'lost' && now - s.lastSight > RUN_TUNE.searchMin / 60) this.set(w, s, 'unseen', now);
  }
  // a sound (a pack on rock, a hull knocking, the paddle, a bail): noticed by each watcher within its range
  hear(kind, x, z, windMph, watchers, now) {
    const r = hearRange(kind, windMph);
    if (r <= 0) return 0;
    let n = 0;
    for (const w of watchers) {
      if (w.deaf) continue;
      if (Math.hypot(w.x - x, w.z - z) > r) continue;
      const s = this.of(w);
      this.noticeAt(w, s, now, { x, z, sound: kind }); n++;
    }
    return n;
  }
}
// a still, dark player in reeds or under the Grumman is never held at close range (§6.7's builders' note)
function sigVisibleClose(sig) { return !(sig.cover === 'under' || (!sig.moving && sig.lamp === 'off' && sig.cover === 'reeds')); }
export function coneHas(w, x, z) {
  const dx = x - w.x, dz = z - w.z, d = Math.hypot(dx, dz);
  if (d > (w.coneLen || RUN_TUNE.cone)) return false;
  if (d < 4) return true;
  const a = Math.atan2(dz, dx), da = Math.abs(((a - w.cone + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI);
  return da < (w.coneHalf || 0.22);
}
