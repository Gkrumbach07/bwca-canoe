// Saved state in localStorage, one JSON document per namespace under `bwca-canoe:<ns>`. Any feature keeps
// its own namespace (`save.read('fishing')`, `save.write('fishing', {...})`) so nothing steps on anything
// else; `trip` (position, heading, clock, camera) and `settings` are the shell's. Reads never throw: a
// missing or unparsable entry gives the fallback, and a browser that refuses storage (private mode, quota)
// is treated as empty.
const PREFIX = 'bwca-canoe:';

export const save = {
  key(ns) { return PREFIX + ns; },
  has(ns) { try { return localStorage.getItem(this.key(ns)) != null; } catch { return false; } },
  read(ns, fallback = null) {
    try {
      const raw = localStorage.getItem(this.key(ns));
      return raw == null ? fallback : JSON.parse(raw);
    } catch { return fallback; }
  },
  write(ns, value) {
    try { localStorage.setItem(this.key(ns), JSON.stringify(value)); return true; } catch { return false; }
  },
  // merge a few fields into the namespace's document
  patch(ns, fields) { return this.write(ns, Object.assign(this.read(ns, {}) || {}, fields)); },
  clear(ns) { try { localStorage.removeItem(this.key(ns)); } catch { /* nothing to clear */ } },
  // every namespace we hold
  namespaces() {
    const out = [];
    try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.startsWith(PREFIX)) out.push(k.slice(PREFIX.length)); } } catch { /* no storage */ }
    return out;
  },
};

// The trip: where the canoe is, which way it points, the day clock and the camera, written every few
// seconds while playing so "Paddle in" picks the trip up where it stopped. `read()` returns null when
// there is nothing to continue.
export class TripSaver {
  constructor(player, day, chase, interval = 4) {
    this.player = player; this.day = day; this.chase = chase;
    this.interval = interval; this.t = 0; this.enabled = false;
    window.addEventListener('pagehide', () => { if (this.enabled) this.write(); });
    document.addEventListener('visibilitychange', () => { if (this.enabled && document.visibilityState === 'hidden') this.write(); });
  }
  static read() {
    const t = save.read('trip');
    return t && Number.isFinite(t.x) && Number.isFinite(t.z) ? t : null;
  }
  snapshot() {
    const p = this.player, d = this.day, drop = p.mode === 'walk' && p.carry && p.carry.drop; // on foot: where the canoe lies
    return { v: 1, x: p.x, z: p.z, heading: p.heading, mode: p.mode, drop: drop ? { x: drop.x, z: drop.z, heading: drop.heading } : null, year: d.year, doy: d.doy, hours: d.hours, running: d.running, camera: this.chase.mode, timeScale: p.timeScale, savedAt: Date.now() };
  }
  write() { if (!this.player.teleporting) save.write('trip', this.snapshot()); }
  clear() { save.clear('trip'); }
  update(dt) {
    if (!this.enabled) return;
    this.t += dt;
    if (this.t >= this.interval) { this.t = 0; this.write(); }
  }
}
