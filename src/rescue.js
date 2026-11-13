// The rescue-boat ride (stream m, campaign Round 4; bible 6.4 "Sheila's rescue boat", Part 3 owner call 3: "ask to be
// evacuated for a hefty fee (a rescue). No fail screen."). A motorboat (motorboat.js) comes out to you where you are,
// seen coming, then a faded ride (the veil, as the truck's drives are) to where it is taking you, the clock moved by the
// water's distance. Only under STORY_ON (main.js m: block).
//
//   rescue.attach({ world, player, outfitter, rides, veil, day, profile, trip, hud, motorboat })
//   rescue.ride(to, { by = 'squad' | 'outfitter', fee = 0, why = null, who = '', kicker, text, sub, come = true })
//     → Promise<{ ok, hours, price, to }>
//     to: an entry point's number (its landing: an outfitter's dock and door), or { x, z, name }
//     fee: taken from what is in hand, never a debt (the truck's rule: it takes what you have)
//   rescue.evacuate(why, { fee }) → Promise<bool>: the boat comes, then trip.evacuate(why, { fee }) as today (season-turn's
//     ice-in rescue: stream w calls this instead of trip.evacuate to have the boat seen)
//   rescue.come({ kind, near }) → Promise<mb | null>: only the boat coming (the squad night's start uses it too)
//   rescue.busy, rescue.last
import { motorboat as MB } from './motorboat.js';

export const RESCUE = { kmh: 25, base: 0.25, comeFrom: 380, comeMax: 15, stand: 9 }; // ride time: 15 min + km at 25 km/h; the boat comes from ~380 m, seen for at most 15 s
const rideTime = (h) => { const m = Math.max(5, Math.round((h * 60) / 5) * 5); return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ` ${String(m % 60).padStart(2, '0')}` : ''}`; };

class Rescue {
  constructor() { this.g = null; this.busy = false; this.last = null; this.boat = null; }
  attach(g) { this.g = g; return this; }
  get mb() { return (this.g && this.g.motorboat) || MB; }
  dest(to) {
    const g = this.g;
    if (to == null) { const tr = g.trip, n = tr && typeof tr.nearestKnownOutfitter === 'function' ? tr.nearestKnownOutfitter() : null; return n ? { ...n, x: n.x, z: n.z, ep: n.ep, name: n.name } : null; }
    if (typeof to === 'number' || /^\d+$/.test(String(to))) {
      const ep = Number(to), r = g.rides, o = g.outfitter;
      const l = (r && typeof r.landing === 'function' ? r.landing(ep) : null) || (o && typeof o.landing === 'function' ? o.landing(ep) : null);
      return l ? { ...l, ep } : null;
    }
    return Number.isFinite(to.x) && Number.isFinite(to.z) ? to : null;
  }
  // a point on open water about `near` metres from the player, upwind of nothing in particular: the boat starts there
  startNear(near = RESCUE.comeFrom) {
    const { world: w, player: p } = this.g;
    const lake = w.lakeIdAt ? w.lakeIdAt(p.x, p.z) : null;
    let best = null;
    for (const r of [near, near * 0.6, near * 0.35, 120]) {
      for (let a = 0; a < 24; a++) {
        const x = p.x + Math.cos((a * Math.PI) / 12) * r, z = p.z + Math.sin((a * Math.PI) / 12) * r;
        if (!w.isReady(x, z) || w.shoreAt(x, z) > -15) continue;
        if (lake && w.lakeIdAt && w.lakeIdAt(x, z) !== lake) continue;
        const sh = w.shoreAt(x, z); if (!best || sh < best.sh) best = { x, z, sh };
      }
      if (best) return best;
    }
    return null;
  }
  // the boat coming to where you are (seen; at most comeMax real seconds, and not at all under a test driver unless forced)
  async come({ kind = 'squad', driver = null, near = RESCUE.comeFrom, force = false } = {}) {
    const g = this.g, p = g.player;
    if (!p) return null;
    const headless = typeof navigator !== 'undefined' && navigator.webdriver && !force && !this.forceCome;
    const s = this.startNear(near);
    if (!s) return null;
    const mb = this.mb.spawn({ kind, at: s, force: true, driver, key: `m:rescue:${Date.now() % 1e6}` });
    if (!mb || mb.why) return null;
    this.boat = mb;
    // to a stand-off beside you (on the water toward where it came from)
    const dx = s.x - p.x, dz = s.z - p.z, d = Math.hypot(dx, dz) || 1, tx = p.x + (dx / d) * RESCUE.stand, tz = p.z + (dz / d) * RESCUE.stand;
    if (headless) { mb.x = tx + (dx / d) * 30; mb.z = tz + (dz / d) * 30; }
    await new Promise((res) => {
      let done = false; const fin = () => { if (!done) { done = true; res(); } };
      mb.goTo(tx, tz, { onEnd: fin });
      setTimeout(fin, (headless ? 2 : RESCUE.comeMax) * 1000);
    });
    return mb;
  }
  take(fee, why) {
    const pr = this.g.profile; if (!fee || !pr) return 0;
    const paid = Math.min(fee, Math.max(0, pr.money || 0));
    if (paid > 0 && !pr.spend(paid, why || 'a rescue')) return 0;
    return paid;
  }
  async ride(to = null, { by = 'squad', fee = 0, why = null, who = '', kicker = null, text = '', sub = null, come = true, driver = null } = {}) {
    const g = this.g;
    if (!g || this.busy) return { ok: false, why: 'busy' };
    const dest = this.dest(to);
    if (!dest) return { ok: false, why: 'nowhere' };
    this.busy = true;
    try {
      if (come) await this.come({ kind: by === 'squad' ? 'squad' : 'tow', driver });
      const p = g.player, km = (Math.hypot(dest.x - p.x, dest.z - p.z) * 1.25) / 1000, hours = RESCUE.base + km / RESCUE.kmh;
      const paid = this.take(fee, why ? `a rescue: ${why}` : 'a rescue');
      const name = dest.name || dest.place || 'the landing';
      const card = {
        kicker: kicker || `${by === 'squad' ? 'The rescue squad' : 'The outfitter’s boat'} → ${name}${who ? ` · with ${who}` : ''}`,
        text,
        sub: sub || `The canoe on a line behind, ${rideTime(hours)} on the water to ${name}.${paid ? ` $${paid}.` : ''}`,
        fadeIn: 1.2, hold: 3.2, fadeOut: 1.8,
        onDark: async () => {
          if (this.boat) { this.boat.remove(); this.boat = null; }
          const o = g.outfitter, ok = o && o.onTeleport ? await o.onTeleport(dest.x, dest.z) : false;
          if (g.rides && typeof g.rides.clock === 'function') g.rides.clock(hours); else if (g.day && g.day.advance) g.day.advance(hours);
          if (ok && dest.ep != null && o && typeof o.layout === 'function' && typeof o.updateArrival === 'function' && dest.outfitter !== false) {
            o.lineKind = 'welcome'; o.arrivedBy = 'ride'; o.arrival = { why: 'ride', ep: dest.ep, t: 0, pending: true };
          }
          const core = o && o.core; if (core && typeof core.log === 'function') core.log('rescue', { to: dest.ep ?? null, km: +km.toFixed(1), hours: +hours.toFixed(2), price: paid, why });
          return ok;
        },
      };
      if (g.veil) await g.veil.card(card); else await card.onDark();
      this.last = { ok: true, to: dest.ep ?? { x: dest.x, z: dest.z }, km: +km.toFixed(2), hours: +hours.toFixed(3), price: paid, by };
      if (g.story && g.story.v === 2 && typeof g.story.emit === 'function') { try { g.story.emit('rescue:ride', this.last); } catch { /* the story's */ } }
      return this.last;
    } finally {
      if (this.boat) { this.boat.remove(); this.boat = null; }
      this.busy = false;
    }
  }
  async evacuate(why = 'spent', { fee = 0 } = {}) {
    const g = this.g, tr = g && g.trip;
    if (!tr || this.busy || tr.evacuating || !tr.active) return false;
    this.busy = true;
    // (on the ice no boat can come: the rescue walks in over it under the card, as before; open water, the squad's boat)
    const iced = why === 'ice' || !!(tr.state && tr.state.iced);
    try { if (!iced) await this.come({ kind: 'squad' }); } finally { this.busy = false; }
    const ok = tr.evacuate(why, { fee });
    const b = this.boat; this.boat = null;
    if (b) setTimeout(() => b.remove(), 2500); // (gone under the card's dark)
    return ok;
  }
}

export const rescue = new Rescue();
