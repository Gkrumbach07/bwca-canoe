// The run's checkpoint (campaign-design §8.5; docs/story/50-finale.md §6.12; Owner call 2; Round 3 stream R). One at a
// time, saved per season slot under `bwca-canoe:story-cp`, written at the lift, every stash taken, every portage end
// reached and every tie-off begun, and only from a good state (stealth unseen, no watcher within 400 m, energy over the
// floor, neither cold nor wet), so a reset never lands the player back in a doomed spot.
//
//   checkpoint.attach(g)        g: { story, save, kv, isSeasonKey, player, canoe, chase, day, energy, inventory, trip,
//                               explored, tripStats, veil, hud, run }
//   checkpoint.write(kind, place, { force }) → cp | null   (null: not a good state; the last good one is kept)
//   checkpoint.good() → { ok, why }
//   checkpoint.reset(reason) → Promise   caught | evac | swamp | cold | icein: §8.5's steps 0–8 behind a veil fade
//   checkpoint.resume() → Promise        boot: a reset left pending by a page closed during the fade is finished
//   checkpoint.cp · checkpoint.clear()  · checkpoint.place(cp) (the pose only: the ice-in turn's wake, stream w)
// No fact is written by a catch: facts set since (a stash found) stay; the inventory goes back whole and the stash
// finds since are given again (found stays found); food eaten since comes back.
import { RUN_TUNE } from './stealth.js';
import { RUN_ITEM } from './run-items.js';

export const CP_NS = 'story-cp';
const frames = (n = 2) => new Promise((res) => { let k = 0; const f = () => (++k >= n ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); });

export class Checkpoint {
  constructor() { this.g = null; this.cp = null; this.seq = 0; this.busy = false; this.lastLine = -1; this.catchesSave = 0; }
  attach(g) {
    this.g = g;
    const d = g.save.read(CP_NS);
    if (d && d.v === 1 && d.cp) { this.cp = d.cp; this.seq = d.seq | 0; this.pending = d.pending || null; this.catchesSave = d.catchesSave | 0; this.lastLine = d.lastLine ?? -1; }
    return this;
  }
  persist() { this.g.save.write(CP_NS, { v: 1, cp: this.cp, seq: this.seq, pending: this.pending || null, catchesSave: this.catchesSave, lastLine: this.lastLine }); }
  clear() { this.cp = null; this.pending = null; this.persist(); }

  good() {
    const g = this.g, r = g.run, e = g.energy, p = g.player;
    if (r && r.stealth && r.stealth.worst() !== 'unseen') return { ok: false, why: 'watched' };
    if (r && r.watchers && r.watchers.nearest(p.x, p.z) < RUN_TUNE.cpClear) return { ok: false, why: 'a watcher near' };
    if (e && e.value < RUN_TUNE.cpEnergy) return { ok: false, why: 'spent' };
    if (e && e.needs && e.needs.warmth < 0.3) return { ok: false, why: 'cold' };
    if ((e && e.soaked > 0.4) || p.mode === 'swim') return { ok: false, why: 'wet' };
    if (p.teleporting || p.landing) return { ok: false, why: 'moving' };
    return { ok: true, why: '' };
  }
  snapshot(kind, place) {
    const g = this.g, p = g.player, d = g.day, cs = g.canoe && g.canoe.state, hull = g.canoe && g.canoe.group;
    const drop = p.mode === 'walk' && p.carry && p.carry.drop ? p.carry.drop : null;
    const q = hull ? hull.quaternion : null;
    const r = g.run;
    return {
      v: 1, id: `cp-${this.seq + 1}`, kind, place, seq: this.seq + 1, tick: g.story && g.story.doc ? g.story.doc.tick : 0,
      clock: { year: d.year, doy: d.doy, hours: d.hours },
      player: { x: p.x, z: p.z, heading: p.heading, mode: p.mode === 'carry' ? 'walk' : p.mode },
      canoe: drop ? { x: drop.x, z: drop.z, h: drop.heading, down: true } : { x: p.x, z: p.z, h: p.heading, q: q ? [q.x, q.y, q.z, q.w] : null, bilge: p.bilge || 0, down: false },
      inv: g.inventory ? g.inventory.serialize() : null,
      energy: g.energy ? g.energy.serialize() : null,
      lamp: { on: !!(g.headlamp && g.headlamp.on), lens: g.headlamp && g.headlamp.lens || 'white' },
      logSeq: g.trip && g.trip.state && g.trip.state.log ? g.trip.state.log.length : 0,
      explored: { runs: g.explored && g.explored.runs ? g.explored.runs.length : 0 },
      stats: g.tripStats ? g.tripStats.serialize() : null,
      leg: r ? r.legId : null, seed: r ? r.seed : 0, catches: r ? { ...r.catches } : {}, help: r ? { ...r.help } : {},
      found: [], // stash items taken since (given again on a reset)
      cs: cs ? { mode: cs.mode } : null,
    };
  }
  write(kind, place = null, { force = false } = {}) {
    const g = this.g;
    if (!g || this.busy) return null;
    if (!force) { const ok = this.good(); if (!ok.ok) return null; }
    this.cp = this.snapshot(kind, place); this.seq = this.cp.seq; this.pending = null;
    this.persist();
    try { g.story.emit('run:checkpoint', { cp: { id: this.cp.id, kind, place } }); } catch { /* the bus */ }
    return this.cp;
  }
  // a stash's thing taken after the checkpoint: it stays found through a reset
  found(id) { if (this.cp && id) { this.cp.found.push(id); this.persist(); } }

  // the pose only: on foot with the hull set down, or afloat in place (player.placeAt, stream R's)
  async place(cp = this.cp) {
    const g = this.g, p = g.player;
    if (!cp) return false;
    let ok = false;
    if (typeof p.placeAt === 'function') ok = await p.placeAt(cp.player, cp.canoe);
    else ok = await p.teleport(cp.player.x, cp.player.z);
    await frames(3);
    try { if (g.chase && g.chase.snap) g.chase.snap(); } catch { /* the camera's */ }
    return ok;
  }

  // §8.5 caught → reset. reason: 'caught' | 'evac' | 'swamp' | 'cold' | 'icein'. who: the watcher (a road landing: Wade
  // on shore; else over a radio). The line is Wade's (50 §6.12): the first catch of a save always plays the first.
  async reset(reason = 'caught', { line = null, quiet = false } = {}) {
    const g = this.g, cp = this.cp;
    if (!cp || this.busy) return false;
    this.busy = true;
    // 0. pending, so a page closed during the fade finishes the reset at boot
    this.pending = 'reset'; this.persist();
    const r = g.run, leg = r ? r.legId : cp.leg;
    try {
      const say = line || (reason === 'caught' ? this.wadeLine(r) : null);
      const card = {
        kicker: '', text: say ? `“${say}”` : '', sub: '', fadeIn: 1.2, hold: 2.2, fadeOut: 1.8,
        onDark: async () => { await this.restore(cp, reason, leg); },
      };
      if (g.veil && !quiet) await g.veil.card(card);
      else await card.onDark();
    } finally { this.busy = false; }
    return true;
  }
  wadeLine(r) {
    const T = (id) => (this.g.text ? this.g.text(id) : null);
    const lines = [1, 2, 3, 4, 5].map((n) => T(`run.wade.${n}`)).filter(Boolean);
    if (!lines.length) return null;
    const dawn = r && r.firstLight && T('run.wade.6');
    let k;
    if (this.catchesSave === 0) k = 0;
    else if (dawn) { this.catchesSave++; this.persist(); return dawn; }
    else { do { k = 1 + Math.floor(Math.random() * (lines.length - 1)); } while (k === this.lastLine && lines.length > 2); }
    this.catchesSave++; this.lastLine = k; this.persist();
    return lines[k];
  }
  async restore(cp, reason, leg) {
    const g = this.g, kv = g.kv;
    // 2. freeze the season's keys while the restore puts every module back
    const was = kv && typeof kv.frozenTest === 'function' ? kv.frozenTest() : null;
    if (kv && g.isSeasonKey) kv.freeze((k) => g.isSeasonKey(k) && !/story-cp$/.test(k));
    try {
      // 4. the clock (first: the walker's placing reads the tiles at the place, the sky at the hour)
      const d = g.day;
      d.setClock(cp.clock.year, cp.clock.doy, cp.clock.hours);
      // 3. the pose
      await this.place(cp);
      // 5. the inventory whole, then the stash finds since; energy (food eaten since comes back: Owner call 2)
      const inv = g.inventory;
      if (inv && cp.inv) {
        inv.restore(cp.inv);
        for (const id of cp.found || []) { try { if (!inv.count(id, { reachable: false })) inv.give(id); } catch { /* */ } }
        try { inv.emit('restore'); } catch { /* */ }
      }
      if (g.energy && cp.energy) { if (typeof g.energy.rewindTo === 'function') g.energy.rewindTo(cp.energy); else g.energy.restore(cp.energy); }
      if (g.headlamp && cp.lamp) { g.headlamp.toggle(!!cp.lamp.on); }
      // 6. roll the caught leg out of the record
      const t = g.trip;
      if (t && t.state && Array.isArray(t.state.log) && t.state.log.length > cp.logSeq) t.state.log.length = cp.logSeq;
      if (g.explored && Array.isArray(g.explored.runs) && g.explored.runs.length > cp.explored.runs) { g.explored.runs.length = cp.explored.runs; g.explored.open = false; try { g.explored.invalidate(); } catch { /* */ } }
      if (g.tripStats && cp.stats) g.tripStats.restore(cp.stats);
      if (g.player) g.player.bilge = 0;
      // 7. reseed; the third try's help
      const r = g.run;
      if (r && typeof r.afterReset === 'function') r.afterReset(cp, reason, leg);
    } finally {
      // 8. unfreeze, force-write each module and the checkpoint (pending cleared)
      if (kv) kv.freeze(was || null);
      this.pending = null; this.persist();
      try { if (g.inventory) g.inventory.write(); } catch { /* */ }
      try { if (g.explored && g.explored.write) g.explored.write(); } catch { /* */ }
      try { if (g.tripStats) g.tripStats.write(); } catch { /* */ }
      try { if (g.saver) g.saver.write(); } catch { /* */ }
      try { if (g.energySave) g.energySave(); } catch { /* */ }
      try { if (g.story && g.story.save) g.story.save(); } catch { /* */ }
      try { g.story.emit('run:reset', { cp: { id: cp.id, kind: cp.kind, place: cp.place }, reason }); } catch { /* */ }
    }
  }
  // boot: a reset the page closed on is finished before control is handed back
  async resume() {
    if (this.pending !== 'reset' || !this.cp) return false;
    this.busy = true;
    try { await this.restore(this.cp, 'reload', this.cp.leg); } finally { this.busy = false; }
    return true;
  }
}
export const checkpoint = new Checkpoint();
export { RUN_ITEM };
