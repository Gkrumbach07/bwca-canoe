// The drift test's night and the canoe adrift (stream m, campaign Round 4; 31-guiding-years GY-11 "Set piece B: the
// drift test (the hinge)", "Walt's way"; 40-company-and-press §5 "The warning: the canoe adrift"). The mechanics are
// boats.js (the spare, the line, Swamp it, Let go, the drift), motorboat.js (Sheila's squad boat) and rescue.js; this is
// the night that strings them. Sheila's talk and the arrangement are stream a3's (31 GY-09..11's topics): a3 calls
// squadNight at 21:00 on drift.arranged's day, and says "Page two." on squad:back. Only under STORY_ON.
//
//   night.attach({ story, boats, motorboat, world, player, outfitter, veil, day, hud, wind, pointer, texts })
//   night.squadNight({ ep = 25, at = 21 }) → Promise<{ ok, why? }>   the ride out, the spare on a line, the bypass
//   night.rideBack() → Promise                                        E "Ride back" on the squad boat at the bypass
//   night.rentSpare({ ep = 25 }) → h                                   a second canoe at the dock, on your line (Walt's way)
//   night.adrift({ site, air }) → { from, end } | null                40 §5: the player's canoe 30 m off, loose
//   night.update(dt) · night.state · night.stats()
// Facts written (facts.js `drift.`, `ev.`): drift.done ('swamped'), drift.left, drift.alders, drift.walt; ev.adrift.
// Story events: squad:out, squad:bypass { left }, squad:back { left }.

export const DRIFT_SPOT = { x: -14000, z: 3800, r: 350 };   // 03-places §3: mid-Birch
export const ALDERS = { x: -14000, z: 4460, r: 18 };        // 03-places §5: the recommended alders bay
export const BIRCH = 83, MOOSE_EP = 25;
const BYPASS = { id: 46, name: /Sucker.*Birch|Birch.*Sucker/i, sucker: { x: -14545, z: 4775 }, birch: { x: -14445, z: 4755 } };
const RIDE_H = 50 / 60;                                     // the ride up the chain, about fifty game minutes (GY-11)
// the writers' lines (31 GY-11), by a3's anchors in story-data/text/guiding.json; the doc's own words where the text
// file is not in (a3's branch until the join)
const LINES = {
  '31:GY-11.3': 'Take the spare. You’re not swamping your own boat for my curiosity. … Swamp it out there. His was full. … I’ll be here. Don’t make me come looking.',
  '31:GY-11.back.1': 'Leave it. It’s where it’d go.',
  '31:GY-11.permit': 'You’re with the squad tonight. Nobody’s writing you a ticket.',
};
const SHEILA_LOOK = { skin: 0xd9b49a, shirt: 0x2f4a6a, cuff: 0x3a5a80, pants: 0x3a3a38, belt: 0x2a2018, pfd: 0xd8641e, pfdDark: 0x8f4214, strap: 0x2a2a2a, boot: 0x3a2e24, sole: 0x2a221c, lace: 0x3b2a1c, hair: 0x9a948a, beard: 0xd9b49a, hat: 0x2f3f52, band: 0x1e2a36, wear: { hat: true, bun: true, scale: 0.96 } };

class DriftNight {
  constructor() { this.g = null; this.state = null; this.walt = null; this.offs = []; this.n = { nights: 0, done: 0, walt: 0, adrift: 0 }; }
  attach(g) {
    this.g = g;
    const B = g.boats;
    if (B && !this.offs.length) {
      this.offs.push(B.on('grounded', (d) => this.onGrounded(d)));
      this.offs.push(B.on('turnedAway', (d) => this.onAway(d)));
    }
    const pt = g.pointer;
    if (pt && typeof pt.register === 'function' && !this.ptOff) {
      const fn = (ray, near) => this.targets(ray, near);
      this.ptOff = [pt.register(fn), typeof pt.registerWater === 'function' ? pt.registerWater(fn) : null];
    }
    return this;
  }
  line(id) {
    const T = this.g.texts || (typeof window !== 'undefined' && window.__game && window.__game.storyTalk && window.__game.storyTalk.texts);
    try { const e = T && T.entry ? T.entry(id) : null; if (e && typeof e.text === 'string') return e.text; } catch { /* the words' */ }
    return LINES[id] || '';
  }
  say(id, s = 6) { const w = this.line(id), h = this.g.hud; if (w && h && typeof h.note === 'function') h.note(`SHEILA: “${w}”`, s); }
  set(k, v = true) { const s = this.g.story; if (s && s.v === 2 && typeof s.set === 'function' && !s.has(k)) { try { s.set(k, v, 'm'); } catch (e) { console.warn('m: fact', k, e); } } }
  emit(evt, d = {}) { const s = this.g.story; if (s && s.v === 2 && typeof s.emit === 'function') { try { s.emit(evt, d); } catch { /* the story's */ } } }
  bypass() {
    const w = this.g.world, all = w && typeof w.portagesPublic === 'function' ? w.portagesPublic() : [], P = all[BYPASS.id];
    const ok = P && BYPASS.name.test(P.name || '') ? P : all.find((q) => q && BYPASS.name.test(q.name || '')) || null;
    if (ok && ok.launch && ok.launch.length >= 2) {
      const b = ok.launch.find((l) => l.lake === BIRCH) || ok.launch[1], s = ok.launch.find((l) => l !== b) || ok.launch[0];
      return { birch: { x: b.x, z: b.z }, sucker: { x: s.x, z: s.z } };
    }
    return { birch: BYPASS.birch, sucker: BYPASS.sucker };
  }
  landing(ep) {
    const { rides, outfitter: o } = this.g;
    return (rides && rides.landing ? rides.landing(ep) : null) || (o && o.landing ? o.landing(ep) : null);
  }

  // --- GY-11: the night ---------------------------------------------------------------------------------------------
  async squadNight({ ep = MOOSE_EP, at = 21 } = {}) {
    const g = this.g, p = g.player;
    if (!g || !p) return { ok: false, why: 'not attached' };
    if (this.state && this.state.stage !== 'done') return { ok: false, why: 'busy' };
    const L = this.landing(ep);
    if (L && Math.hypot(L.x - p.x, L.z - p.z) > 450) return { ok: false, why: 'away' }; // (not at the landing: Sheila goes without you; a3 says so next time)
    const by = this.bypass();
    this.state = { stage: 'ride', ep, at, by, spare: null, boat: null, left: false, swamped: false };
    this.n.nights++;
    this.emit('squad:out', { ep });
    const card = {
      kicker: `${(L && L.name) || 'Moose Lake'} → the Birch bypass · with Sheila`,
      text: '',
      sub: 'Up Moose, Newfound and Sucker in the dark, about fifty minutes: the motor and the wake, your canoe and the squad’s old aluminium spare on a line behind. At the bypass the motor stops. Two carries: your canoe, then the spare.',
      fadeIn: 1.4, hold: 4, fadeOut: 2,
      onDark: () => this.atBypass(),
    };
    if (g.veil) await g.veil.card(card); else await card.onDark();
    this.say('31:GY-11.3', 9);
    return { ok: true };
  }
  async atBypass() {
    const g = this.g, S = this.state, by = S.by, o = g.outfitter;
    if (g.day && typeof g.day.advance === 'function') g.day.advance(RIDE_H);
    // the player afloat at the Birch end; the squad boat idling, motor off, at the Sucker end
    const ok = o && o.onTeleport ? await o.onTeleport(by.birch.x, by.birch.z) : false;
    S.boat = g.motorboat ? g.motorboat.spawn({ kind: 'squad', at: by.sucker, force: true, driver: { look: SHEILA_LOOK, name: 'Sheila' }, key: 'm:squad' }) : null;
    if (S.boat && !S.boat.why) { S.boat.off = true; S.boat.anchor(); } else S.boat = null;
    // the spare, a canoe's length behind, on its line
    const p = g.player, f = { x: Math.cos(p.heading), z: -Math.sin(p.heading) };
    S.spare = g.boats.spare({ x: p.x - f.x * 7, z: p.z - f.z * 7, heading: p.heading, hull: 'aluminium', verbs: true, id: 'squadSpare' });
    if (S.spare) g.boats.tow('player', S.spare);
    S.stage = 'birch';
    return ok;
  }
  onGrounded({ h }) {
    const S = this.state;
    const ours = (S && S.spare === h) || (this.walt && this.walt.spare === h) || (h && h.id === 'squadSpare');
    if (!ours || !h.grounded) return;
    h.northShore = h.grounded.lake === BIRCH && h.grounded.z < DRIFT_SPOT.z; // (z grows south: the north shore is upwind's far side)
  }
  // the book changes quietly when the player turns away from the grounded hull (GY-11)
  onAway({ h }) {
    const ours = (this.state && this.state.spare === h) || (this.walt && this.walt.spare === h);
    if (!ours || h.state !== 'swamped' || !h.grounded) return;
    this.done(h);
  }
  done(h) {
    if (h.doneSet) return;
    h.doneSet = true; this.n.done++;
    this.set('drift.done', 'swamped');
  }
  // the squad boat's dot: "Ride back" within reach of it (on foot at the bypass, or paddling up to it)
  targets(ray, near) {
    const S = this.state;
    if (!S || S.stage !== 'birch' || !S.boat) return null;
    const b = S.boat;
    if (near.flat(b.x, b.z) > 40) return null;
    const hit = near.sphere(b.x, b.y + 0.6, b.z, 2.6);
    if (!hit) return null;
    return [{ dist: hit.t, miss: hit.miss, target: { kind: 'boat', ref: 'm:squad', label: 'the squad boat', e: { verb: 'Ride back', run: () => { this.rideBack(); } }, box: { x: b.x, y: b.y + 0.4, z: b.z, hx: 2.8, hy: 0.6, hz: 1, heading: b.heading } } }];
  }
  async rideBack() {
    const g = this.g, S = this.state;
    if (!S || S.stage !== 'birch') return false;
    S.stage = 'back';
    const h = S.spare, by = S.by;
    // left: the spare not brought back to the bypass (grounded on the far shore, or loose out there)
    const near = h && Math.hypot(h.x - by.birch.x, h.z - by.birch.z) < 120;
    S.left = !!h && !near;
    if (h && h.grounded && h.state === 'swamped') this.done(h); // (at the latest when they reach the bypass)
    if (S.left) { this.set('drift.left', h.grounded ? 'shore' : 'water'); this.say('31:GY-11.back.1', 6); }
    this.emit('squad:bypass', { left: S.left });
    const L = this.landing(S.ep);
    const card = {
      kicker: `The Birch bypass → ${(L && L.name) || 'Moose Lake'} · with Sheila`, text: '',
      sub: 'Back down the chain in the dark: the motor and nothing else.',
      fadeIn: 1.4, hold: 3, fadeOut: 2,
      onDark: async () => {
        if (S.boat) { S.boat.remove(); S.boat = null; }
        if (h) g.boats.remove(h);
        if (g.day && typeof g.day.advance === 'function') g.day.advance(RIDE_H);
        if (L && g.outfitter && g.outfitter.onTeleport) await g.outfitter.onTeleport(L.x, L.z);
      },
    };
    if (g.veil) await g.veil.card(card); else await card.onDark();
    S.stage = 'done';
    if (S.held && g.wind) { g.wind.override = null; S.held = false; }
    this.emit('squad:back', { left: S.left });
    return true;
  }

  // --- Walt's way: alone, a second canoe in tow, out of the Moose Lake dock after 23:00 on a south wind, mid-Birch within
  // five game hours ("Five hours, in the dark. Same as him.": a3's rule turns drift.walt into the book's line) ------
  rentSpare({ ep = MOOSE_EP } = {}) {
    const g = this.g, p = g.player;
    const h = g.boats.spare({ x: p.x - Math.cos(p.heading) * 7, z: p.z + Math.sin(p.heading) * 7, heading: p.heading, verbs: true, id: `rental${ep}` });
    if (h && p.mode === 'paddle') g.boats.tow('player', h);
    return h;
  }
  southNight() {
    const { wind: W, day: d } = this.g;
    if (!W || !d) return false;
    const h = d.hours, from = W.from;
    return (h >= 23 || h < 5) && from >= 135 && from <= 205;
  }
  watchWalt() {
    const g = this.g, p = g.player, B = g.boats;
    if (!p || !B || (this.state && this.state.stage === 'birch')) return;
    const towed = B.list().find((h) => h.towedBy === 'player');
    const L = this.landing(MOOSE_EP), abs = g.day ? g.day.year * 400 * 24 + g.day.doy * 24 + g.day.hours : 0;
    if (!this.walt && towed && p.mode === 'paddle' && L && Math.hypot(L.x - p.x, L.z - p.z) < 300 && this.southNight()) this.walt = { t0: abs, spare: towed, lit: false };
    const W = this.walt;
    if (!W) return;
    if (abs - W.t0 > 5) { if (!W.reached) this.walt = null; return; } // (five game hours)
    if (g.headlamp && g.headlamp.on) W.lit = true; // ("no light": noted, not refused; a3 can read it)
    if (!W.reached && Math.hypot(p.x - DRIFT_SPOT.x, p.z - DRIFT_SPOT.z) < DRIFT_SPOT.r) {
      W.reached = true; this.n.walt++;
      this.set('drift.walt', W.lit ? 'lit' : 'dark');
    }
  }

  // --- 40 §5: the canoe adrift. The player's canoe, where it lies, 30 m off the landing on the water and loose: the
  // morning air off the land carries it across the bay (or the wind, if there is more of it). The paddles go where the
  // drift will ground (end): the caller stands them there (the company stream's scene) ------------------------------
  adrift({ site = null, air = 3.5 } = {}) {
    const g = this.g, p = g.player, w = g.world, d = p && p.carry && p.carry.drop;
    if (!d || !w) return null;
    let x = d.x, z = d.z;
    for (let i = 0; i < 40; i++) {
      const dir = w.deeperDir ? w.deeperDir(x, z) : { x: 0, z: 0 };
      const L = Math.hypot(dir.x, dir.z); if (!(L > 0)) break;
      x += (dir.x / L) * 1.5; z += (dir.z / L) * 1.5;
      if (Math.hypot(x - d.x, z - d.z) >= 30 && w.shoreAt(x, z) < -3) break;
    }
    const off = { x: +x.toFixed(1), z: +z.toFixed(1) }, dir = w.deeperDir ? w.deeperDir(off.x, off.z) : { x: 1, z: 0 }, dl = Math.hypot(dir.x, dir.z) || 1;
    d.x = off.x; d.z = off.z; d.heading = Math.atan2(dir.x, dir.z); // (broadside to the shore it left)
    try { p.restHull(d.x, d.z, d.heading); } catch { /* laid next frame */ }
    const h = g.boats.loose('player', { state: 'upright' });
    if (!h) return null;
    h.x = d.x; h.z = d.z; h.heading = d.heading;
    h.air = { x: dir.x / dl, z: dir.z / dl, U: air }; // the air draining off the land, as m/s of wind (3.5: a bay of 250 m in about twenty game minutes)
    const end = g.boats.predict(h);
    this.n.adrift++;
    this.set('ev.adrift', site != null ? String(site) : (w.lakeIdAt ? String(w.lakeIdAt(d.x, d.z)) : 'here'));
    return { from: off, end, h };
  }

  update() {
    const S = this.state, g = this.g, p = g && g.player;
    if (!p) return;
    this.watchWalt();
    if (S && S.stage === 'birch') {
      // the night Sheila named is a south wind (GY-11: SSE 10–15): held there while the test is on, let go after
      const W = g.wind;
      if (W) { if (!(W.from >= 150 && W.from <= 180)) W.from = 160; if (W.override == null || S.held) { S.held = true; W.override = 5.6; } }
      if (Math.hypot(p.x - ALDERS.x, p.z - ALDERS.z) < ALDERS.r) this.set('drift.alders', true);
      const h = S.spare;
      if (h && h.grounded && h.state === 'swamped' && Math.hypot(p.x - S.by.birch.x, p.z - S.by.birch.z) < 60 && !h.doneSet) this.done(h);
    }
  }
  stats() {
    const S = this.state;
    return { ...this.n, stage: S ? S.stage : null, left: S ? S.left : null, spare: S && S.spare ? { x: Math.round(S.spare.x), z: Math.round(S.spare.z), state: S.spare.state, grounded: S.spare.grounded, towed: !!S.spare.towedBy } : null, boat: S && S.boat ? { x: Math.round(S.boat.x), z: Math.round(S.boat.z) } : null, walt: this.walt ? { reached: !!this.walt.reached, lit: this.walt.lit } : null };
  }
}

export const night = new DriftNight();
