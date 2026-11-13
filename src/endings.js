// The endings in the world (story Round 3, stream n; docs/build/campaign-design.md §9, Part 3 #5–#6; docs/story/50-finale.md
// §7.3–§12; 70-world-texture.md §6.7–§6.8): the dawn lot (its vehicles, Maggie, Dan, Wade, the loading party, the
// permit-box phone, the bench and its Rest, the lot's edge "Not with these."), the come-out held while it is staged and
// fired after the choice, walking away unchosen (run.out), the money and the consulting fee on the tally, the postcard at
// the home counter, the people's first lines after the paper, the board by ending (the four who liked Walt; Tasha's
// sampling at Farm), the money ending's upcharge, the props by ending (the Ledger on every counter, Walt's photo at Moose
// Lake, the closed trench or the survey stakes at the Kettle creek), Maggie after, Tom and the camp. Loaded only under
// STORY_ON (main.js's n block). A co-op guest's story is a mirror: nothing is staged or written for them.
//
//   endings.attach({ story, talk, topics, npcs, cast, outfitter, player, day, world, scene, tiles, actors, pointer, hud,
//                    inventory, profile, tasks, camp, beats })
//   endings.update(dt)            the lot, the props by ending, Maggie after, the postcard's bark
//   endings.holdComeOut(ep) → bool   outfitter.js (n block): the trip does not come out in this lot while it is staged
//   endings.upcharge(ep) → ×      shop.js (n block): the money ending's cold shoulder, per owner
//   endings.board(slots, ep)      tasks.boardFilterFn: the board by ending
//   endings.tomScene(speaker) → bool   Tom Becker's "history or junk?" (12.4), for whoever stages Tom (journalist only)
//   endings.staged() · endings.debug { stage(ep), arrive(), skip(h), choose('J'|'JN'|'M'), runStub(on), postcard() }
import * as THREE from 'three';
import { SceneRun, T } from './topics.js';
import { registerSensor } from './story-cond.js';
import { PropBuilder, propMaterial, TILE } from './prop-kit.js';
import { trailheadAt, trailheadLayout, LOT_R } from './trailhead.js';
import { storeLayout } from './props.js';
import { hostOf, OUTFITTER_EPS } from './outfitters.js';
import { FieldPerson } from './kettle.js';
import { SPOT_OF } from './cast.js';
import { kit, rngFor } from './story-props.js';
import { definePage, itemDef } from './items.js';
import { registerKind, KINDS } from './tasks.js';
import { KETTLE } from './story-data/mining.js';
import * as N from './story-data/endings.js';

for (const [k, v] of Object.entries(N.N_SENSORS)) registerSensor(k, v);
const CANS = 'ammocan';          // r's run-items.js: two of them
const TICK = 0.25;               // s between checks
const NEAR_STORE = 45;           // m: a store's props by ending are hung within this
const EDGE = 2.5;                // m past the lot's radius: the edge of the lot
const AWAY = 26;                 // m from the lot's middle, away from the landing: walked out of the dawn lot
const PARTY_R = 12;              // m: the loading party's barks
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const C = (hex) => new THREE.Color(hex);

// --- a vehicle in the lot: a pickup or the grey wagon, one merged mesh of the props' material ----------------------------
function vehicleGeo(kind, paint) {
  const b = new PropBuilder(), X = V(1, 0, 0), Y = V(0, 1, 0), Z = V(0, 0, 1);
  const body = C(paint), dark = C(0x2a2826), chrome = C(0x8b8d8e), tyre = C(0x161616), glass = C(0x26302f), frost = C(0xc8d0d4);
  const wagon = kind === 'wagon';
  b.box(V(0, 0.72, -0.05), X, Y, Z, 0.95, 0.22, wagon ? 2.4 : 2.62, TILE.PAINT, body);
  b.box(V(0, 1.1, 1.85), X, Y, Z, 0.93, 0.18, 0.62, TILE.PAINT, body);                     // the hood
  if (wagon) {
    b.box(V(0, 1.32, -0.35), X, Y, Z, 0.93, 0.42, 1.55, TILE.PAINT, body);               // the long roof
    b.box(V(0, 1.42, -0.35), X, Y, Z, 0.935, 0.22, 1.5, TILE.GLASS, glass);
  } else {
    b.box(V(0, 1.38, 0.55), X, Y, Z, 0.93, 0.46, 0.78, TILE.PAINT, body);                // the cab
    b.box(V(0, 1.5, 0.55), X, Y, Z, 0.935, 0.24, 0.7, TILE.GLASS, glass);
    for (const s of [-1, 1]) b.box(V(0.9 * s, 1.1, -1.45), X, Y, Z, 0.05, 0.2, 1.12, TILE.PAINT, body);
    b.box(V(0, 1.1, -2.6), X, Y, Z, 0.95, 0.2, 0.05, TILE.PAINT, body);                  // the tailgate
  }
  b.box(V(0, 1.21, 1.38), X, Y, Z, 0.9, 0.012, 0.28, TILE.GLASS, kind === 'idle' ? glass : frost); // the windshield's frost (none on the idling truck: 50 §8.4's tell)
  b.box(V(0, 0.62, 2.62), X, Y, Z, 0.98, 0.1, 0.06, TILE.METAL, chrome);
  b.box(V(0, 0.62, -2.68), X, Y, Z, 0.98, 0.1, 0.06, TILE.METAL, chrome);
  b.box(V(0, 1.04, 2.6), X, Y, Z, 0.7, 0.13, 0.02, TILE.METAL, dark);
  for (const zw of [1.6, -1.55]) for (const s of [-1, 1]) b.cyl(V(0.8 * s, 0.38, zw), V(1.0 * s, 0.38, zw), 0.38, 0.38, 12, TILE.PLAIN, tyre, { cap0: true, cap1: true, capTile: TILE.PLAIN, capCol: tyre });
  const g = b.build(); g.computeBoundingSphere(); return g;
}
// small things: the permit-box phone (a grey handset box on the post), a bench, a folded paper on a counter, a framed
// photo, a run of orange fence with its sign
function smallGeo(kind) {
  const b = new PropBuilder(), X = V(1, 0, 0), Y = V(0, 1, 0), Z = V(0, 0, 1);
  if (kind === 'phone') { b.box(V(0, 1.25, 0), X, Y, Z, 0.14, 0.2, 0.08, TILE.METAL, C(0x5a5f62)); b.box(V(0, 1.27, 0.09), X, Y, Z, 0.05, 0.14, 0.03, TILE.PLAIN, C(0x1d1d1d)); }
  else if (kind === 'bench') { b.box(V(0, 0.45, 0), X, Y, Z, 0.9, 0.04, 0.2, TILE.WOOD, C(0x7a5a3a)); for (const s of [-1, 1]) b.box(V(0.75 * s, 0.22, 0), X, Y, Z, 0.05, 0.22, 0.18, TILE.WOOD, C(0x5a4028)); }
  else if (kind === 'paper') { b.box(V(0, 0.006, 0), X, Y, Z, 0.17, 0.006, 0.28, TILE.PLAIN, C(0xe8e2d2)); b.box(V(0, 0.013, -0.2), X, Y, Z, 0.15, 0.002, 0.03, TILE.PLAIN, C(0x2a2a2a)); }
  else if (kind === 'frame') { b.box(V(0, 0, 0), X, Y, Z, 0.16, 0.12, 0.015, TILE.WOOD, C(0x3a2a1a)); b.box(V(0, 0, 0.016), X, Y, Z, 0.13, 0.09, 0.004, TILE.PLAIN, C(0x8a8478)); }
  else if (kind === 'fence') { for (let i = -4; i <= 4; i++) b.box(V(i * 1.5, 0.55, 0), X, Y, Z, 0.03, 0.55, 0.03, TILE.WOOD, C(0x6a5a40)); b.box(V(0, 0.75, 0), X, Y, Z, 6.2, 0.22, 0.01, TILE.PLAIN, C(0xe0601c)); b.box(V(7, 0.9, 0.2), X, Y, Z, 0.35, 0.22, 0.02, TILE.SIGN, C(0xe8e4d8)); b.box(V(7, 0.45, 0.2), X, Y, Z, 0.03, 0.45, 0.03, TILE.WOOD, C(0x6a5a40)); }
  const g = b.build(); g.computeBoundingSphere(); return g;
}

class Endings {
  constructor() { this.c = {}; this.t = 0; this.lot = null; this.props = new Map(); this.offs = []; this.stub = null; this.saidOnce = new Set(); this.pinning = false; this.debug = this.makeDebug(); }
  get story() { return this.c.story; }
  get on() { const s = this.story; return !!(s && s.mode !== 'mirror'); }
  attach(c = {}) {
    Object.assign(this.c, c);
    const s = this.story; if (!s) return this;
    s.endings = this;
    // the run's sensor is r's (run.js); until it is in the build, a stub the rigs turn on (debug.runStub)
    if (!s.sensors.has('run.active')) this.offs.push(s.sensor('run.active', () => !!this.stub && s.has('run.lifted') && !s.has('run.done') && !s.has('run.out') && !s.has('end')));
    const o = this.c.outfitter;
    if (o) {
      o.storyHold = (ep) => this.holdComeOut(ep);
      if (o.shop) o.shop.storyMul = (ep) => this.upcharge(ep);
    }
    if (s.run) s.run.onArrive = (ep) => this.holdComeOut(ep); // (r's arrival hook: the come-out is ours)
    if (this.c.tasks) this.c.tasks.boardFilterFn = (slots, ep) => this.board(slots, ep);
    registerSampling();
    try { definePage({ id: 'postcard', title: 'A postcard', ref: 'postcard' }); } catch { /* defined */ }
    try { definePage({ id: 'ledger', title: 'The Northland Ledger', ref: 'paper.ledger.j' }); } catch { /* defined */ }
    try { definePage({ id: 'column', title: 'The Northland Ledger, page 4', ref: 'paper.column.m' }); } catch { /* defined */ }
    this.wrapTalk();
    this.wrapJosie();
    this.openCans();
    this.offs.push(s.on('store:enter', (e) => this.storeEnter(e && e.ep)));
    this.offs.push(s.on('season', () => this.unstage()));
    return this;
  }

  // --- opening the cans (50 §5.5): Open on an ammo can (r's item) puts the four papers in the book (close-ups by their
  // anchors: cans.fieldbook, cans.report.q3, cans.ledger, cans.memo) and marks them read (cans.opened, cans.memo.read:
  // Maggie reads the carbon aloud only to a player who never opened them). Never needed for an ending -----------------
  openCans() {
    const i = this.c.inventory; if (!i || typeof i.verb !== 'function' || i.nCans) return;
    i.nCans = true;
    const PAPERS = [['fieldbook', 'Four field books', 'cans.fieldbook'], ['report', 'The pencilled report', 'cans.report.q3'], ['ledger', 'A cash ledger', 'cans.ledger'], ['memo', 'A yellow carbon', 'cans.memo']];
    for (const [id, title, ref] of PAPERS) { try { definePage({ id: `cans.${id}`, title, ref }); } catch { /* defined */ } }
    const addOpen = () => { const d = itemDef(CANS); if (d && Array.isArray(d.verbs) && !d.verbs.some((v) => v.id === 'open')) d.verbs.push({ id: 'open', label: 'Open' }); else if (d && !d.verbs) d.verbs = [{ id: 'open', label: 'Open' }]; return !!d; };
    if (!addOpen()) { let n = 0; const tm = setInterval(() => { if (addOpen() || ++n > 120) clearInterval(tm); }, 1000); } // (r's item is defined when its module loads)
    const verb0 = i.verb.bind(i);
    i.verb = (id, ref) => {
      if (id !== 'open') return verb0(id, ref);
      let r = null; try { r = i.refOf(ref); } catch { r = null; }
      if (!r || !r.e || r.e.id !== CANS) return verb0(id, ref);
      const s = this.story;
      if (s.has('cans.opened')) return { enabled: false, why: 'Opened already', label: 'Open', needs: [], next: 'The papers are in your book', run: () => {} };
      return { enabled: true, why: null, label: 'Open', needs: [], next: '', run: () => {
        for (const [pid] of PAPERS) { try { if (!i.has(`page:cans.${pid}`)) i.give(`page:cans.${pid}`); } catch (err) { console.warn('n: the papers', err); } }
        s.set('cans.opened', true, 'n:cans'); s.set('cans.memo.read', true, 'n:cans');
        const h = this.c.hud; if (h) h.note(`${T('50:5.5.c1') || 'The papers'}: four field books, a pencilled report, a ledger, a yellow carbon. In your book.`, 6);
      } };
    };
  }

  // --- the run as it stands ----------------------------------------------------------------------------------------------
  talking() { const D = this.c.talk; return !!(D && D.convo); }
  runActive() { const s = this.story; return !!(s && (s.readSensor('run.active') === true)); }
  cans() { const i = this.c.inventory; try { return i ? i.count(CANS, { reachable: false }) : 0; } catch { return 0; } }
  // after walking away unchosen: the vehicles are back at first light at any served lot, any later day (§9)
  outWaiting() { const s = this.story; if (!s || !s.has('run.out') || s.has('end') || this.cans() < 1) return false; const f = s.fact('run.out'); return !!f && s.time().abs > f.abs; }
  served(ep) { try { return hostOf(ep, this.c.world) != null; } catch { return true; } }
  holdComeOut(ep) {
    if (!this.on || !(this.runActive() || this.outWaiting())) return false;
    if (this.lot && this.lot.done) return false;
    void ep; return true; // (an unserved lot too: "Nobody here. Not with these." — never out with the cans)
  }
  upcharge(ep) { return this.on ? N.upcharge(this.story, ep) : 1; }

  // --- the frame's work ----------------------------------------------------------------------------------------------------
  update(dt) {
    if (!this.on) return;
    this.t += dt; if (this.t < TICK) return; this.t = 0;
    this.wrapTally();
    try { this.lotTick(); } catch (e) { if (!this.warned) { this.warned = true; console.warn('n: the dawn lot', e); } }
    try { this.propsTick(); this.maggieTick(); this.thursdayTick(); } catch (e) { if (!this.warnedP) { this.warnedP = true; console.warn('n: the epilogue', e); } }
  }

  // --- the dawn lot (50 §8) ------------------------------------------------------------------------------------------------
  lotTick() {
    const s = this.story, p = this.c.player; if (!p) return;
    if (!this.lot) {
      if (s.has('end') || !(this.runActive() || this.outWaiting()) || !p.onFoot) return;
      const th = trailheadAt(p.x, p.z); if (!th || th.where !== 'lot') { this.thoughtAt = null; return; }
      const ep = th.L.ep, served = this.served(ep), t = s.time();
      if (!served) { this.thought(N.RAW.nobody, `nobody:${ep}`); return; }
      const plan = N.lotFor(s, ep, { abs: t.abs, hours: t.hours, served });
      if (!plan.stage) { if (plan.why === 'dark') this.thought(N.RAW.notWith, `dark:${ep}:${t.abs}`); return; }
      this.stageLot(th.L, plan);
      return;
    }
    const L = this.lot.L, now = s.nowAbs();
    // Maggie's morning call: the permit-box phone rings with the keeper's line, then her wagon forty minutes on
    if (!this.lot.maggie && this.lot.callAt != null && now >= this.lot.callAt && !this.lot.called) { this.lot.called = true; this.ring(); }
    if (!this.lot.maggie && this.lot.wagonAt != null && now >= this.lot.wagonAt) this.wagonIn();
    if (this.lot.danAt != null && now >= this.lot.danAt && !this.lot.danMoved) this.danToPhone();
    if (this.lot.done) return;
    // the ending written and the lot's last scene never closed (a talk walked away from): out anyway, 20 s on
    if (s.has('end')) { if (!this.lot.endAt) this.lot.endAt = performance.now(); else if (performance.now() - this.lot.endAt > 20000 && !this.talking()) this.finish(0); }
    // the loading party's barks, each once, as you pass
    this.partyTick(p);
    // the lot's edge: never down to the landing with the cans; away up the road is walking out unchosen (§9)
    if (this.lot.handed) return;
    const dl = Math.hypot(p.x - L.lot.x, p.z - L.lot.z);
    if (dl > L.lot.r + EDGE) {
      const dw = Math.hypot(p.x - L.landing.x, p.z - L.landing.z), dw0 = Math.hypot(L.lot.x - L.landing.x, L.lot.z - L.landing.z);
      if (dw < dw0 || p.mode === 'paddle') {
        // toward the landing: refused with one thought, back onto the gravel
        const k = (L.lot.r + EDGE - 0.6) / dl; if (p.mode !== 'paddle') { p.x = L.lot.x + (p.x - L.lot.x) * k; p.z = L.lot.z + (p.z - L.lot.z) * k; }
        this.thought(N.RAW.notWith, `edge:${Math.floor(performance.now() / 4000)}`);
      } else if (dl > AWAY) this.walkAway();
    }
  }
  thought(text, key) { if (this.saidOnce.has(key)) return; this.saidOnce.add(key); const h = this.c.hud; if (h && text) h.note(text, 4); }
  stageLot(L, plan) {
    const s = this.story, d = norm(L.landing.x - L.lot.x, L.landing.z - L.lot.z), q = { x: -d.z, z: d.x }, at = (a, b) => ({ x: L.lot.x + d.x * a + q.x * b, z: L.lot.z + d.z * a + q.z * b });
    const face = (from, to) => Math.atan2(to.x - from.x, to.z - from.z);
    const lot = this.lot = { L, ep: L.ep, plan, at: s.nowAbs(), people: new Map(), meshes: [], targets: [], handed: false, done: false, said: new Set(), maggie: false, called: false };
    s.set('run.arrived', L.ep, 'n:lot');
    // Dan's truck (Brekke in the passenger seat, window up) at one end, the grey wagon's place at the other, Wade's
    // pickup idling by the permit box
    const truckAt = at(-1, -4.6), wagonAt = at(-1, 4.6), wadeAt = { x: L.box.x - d.x * 2.6 + q.x * 1.2, z: L.box.z - d.z * 2.6 + q.z * 1.2 };
    lot.spots = { truckAt, wagonAt, wadeAt };
    this.mesh('truck', vehicleGeo('pickup', 0x2f4a6a), truckAt, face(truckAt, L.landing));
    this.mesh('wadetruck', vehicleGeo('idle', 0xd8d8d2), wadeAt, face(wadeAt, L.lot));
    this.mesh('phone', smallGeo('phone'), { x: L.box.x + q.x * 0.3, z: L.box.z + q.z * 0.3 }, face(L.box, L.lot));
    const bench = at(-L.lot.r + 1.2, 0); this.mesh('bench', smallGeo('bench'), bench, face(bench, L.lot)); lot.spots.bench = bench;
    this.person('dan', { x: truckAt.x + q.x * 1.2 - d.x * 1.6, z: truckAt.z + q.z * 1.2 - d.z * 1.6 }, face(truckAt, L.lot), () => this.talkDan());
    this.person('wade', { x: wadeAt.x - q.x * 1.3, z: wadeAt.z - q.z * 1.3 }, face(wadeAt, L.lot), () => this.talkWade());
    // the loading party at the landing: a father in his sixties and his grown son (50 §8.1)
    const la = { x: L.landing.x - d.x * 3, z: L.landing.z - d.z * 3 };
    this.person('father', { x: la.x + q.x * 1, z: la.z + q.z * 1 }, face(la, L.landing), null, 'A man loading a canoe');
    this.person('son', { x: la.x - q.x * 1, z: la.z - q.z * 1 }, face(la, L.landing), null, 'His son');
    // the phone and the bench as things the dot points at
    this.target({ x: L.box.x, z: L.box.z, r: 2.2, label: 'Permit box phone', verb: () => (this.danCard() && !s.has('phone.dan') ? 'Call the number on Dan\'s card' : null), run: () => this.phone() });
    this.target({ x: bench.x, z: bench.z, r: 1.8, label: 'Bench', verb: () => 'Rest', run: () => this.rest() });
    // Maggie: here already, or the morning call and forty minutes, or (never met) an hour after first light
    const now = s.nowAbs(), t = s.time(), dawn = t.abs + N.FIRST_LIGHT / 24;
    if (plan.wagon === 'here') this.wagonIn();
    else if (plan.wagon === 'call') { lot.callAt = now + 0.25 / 24; lot.wagonAt = lot.callAt + N.MAGGIE_CALL / 24; }
    else { lot.wagonAt = Math.max(now + 0.25 / 24, dawn + N.STRANGER_WAIT / 24); }
    if (s.emit) s.emit('lot:staged', { ep: L.ep, wagon: plan.wagon });
  }
  wagonIn() {
    const lot = this.lot; if (!lot || lot.maggie || lot.done) return;
    lot.maggie = true; lot.wagonAt = null;
    const L = lot.L, w = lot.spots.wagonAt, dir = Math.atan2(L.landing.x - w.x, L.landing.z - w.z);
    this.mesh('wagon', vehicleGeo('wagon', 0x8c8f8e), w, dir);
    const q = norm(L.lot.x - w.x, L.lot.z - w.z);
    this.person('maggie', { x: w.x + q.x * 1.4, z: w.z + q.z * 1.4 }, Math.atan2(L.lot.x - w.x, L.lot.z - w.z), () => this.talkMaggie());
  }
  ring() { const w = T('40:6.9.14'); const P = this.lot && this.lot.people.get('wade'); void P; if (w && this.c.hud) this.c.hud.note(`The phone at the permit box rings. “${w}”`, 7); }
  danCard() { const s = this.story, i = this.c.inventory; let has = false; try { has = !!(i && (i.count('dancard', { reachable: false }) > 0)); } catch { /* none */ } return has || s.has('dan.card'); }
  phone() {
    const s = this.story, lot = this.lot; if (!lot || s.has('phone.dan') || !this.danCard()) return false;
    s.set('phone.dan', true, 'n:phone');
    const h = this.c.hud; if (h) h.note(phoneLine(), 6);
    lot.danAt = s.nowAbs() + N.PHONE_WAIT / 24;
    return true;
  }
  danToPhone() { const lot = this.lot; lot.danMoved = true; const P = lot.people.get('dan'); if (P && P.moveTo) P.moveTo(lot.L.box.x + 1.2, lot.L.box.z + 1.2); }
  rest() {
    const cp = this.c.camp; if (cp && typeof cp.restDial === 'function') { try { if (cp.restDial({ bench: true })) return true; } catch (e) { console.warn('n: the bench', e); } } // j1: camp's bench dial, story.allows('rest', { bench: true }) (r's rule)
    const d = this.c.day; if (d && typeof d.advance === 'function') d.advance(0.5); return true;
  }
  partyTick(p) {
    const lot = this.lot, F = lot.people.get('father'), S = lot.people.get('son'); if (!F || !S) return;
    const near = Math.min(Math.hypot(p.x - F.x, p.z - F.z), Math.hypot(p.x - S.x, p.z - S.z));
    if (near > PARTY_R) return;
    const order = [['son', '50.lot.party.1'], ['father', '50.lot.party.2'], ['son', '50.lot.party.3'], ['father', '50.lot.party.4']];
    const next = order.find(([, id]) => !lot.said.has(id));
    const since = performance.now() - (lot.barkAt || 0);
    if (next && since > 5000) { lot.said.add(next[1]); lot.barkAt = performance.now(); (next[0] === 'son' ? S : F).say(T(next[1])); }
    else if (!next && lot.handed && !lot.said.has(N.PARTY_DAWN) && since > 5000) { lot.said.add(N.PARTY_DAWN); F.say(T(N.PARTY_DAWN)); }
  }
  // --- people, meshes and the dot's targets in the lot ---------------------------------------------------------------------
  person(who, at, heading, onTalk, name = null) {
    const c = this.c; if (!c.actors) return null;
    const P = new FieldPerson(c, who, { x: at.x, z: at.z, heading, name });
    if (onTalk) P.onTalk = onTalk;
    this.lot.people.set(who, P);
    return P;
  }
  mesh(key, geo, at, heading) {
    const sc = this.c.scene; if (!sc || !geo) return null;
    const m = new THREE.Mesh(geo, propMaterial()), y = this.ground(at.x, at.z);
    m.name = `n ${key}`; m.position.set(at.x, y, at.z); m.rotation.y = heading; m.castShadow = true; m.receiveShadow = true;
    m.matrixAutoUpdate = false; m.updateMatrix(); m.updateMatrixWorld(true); sc.add(m);
    if (this.lot) this.lot.meshes.push([key, m]);
    return m;
  }
  dropMesh(key) { const lot = this.lot; if (!lot) return; lot.meshes = lot.meshes.filter(([k, m]) => { if (k !== key) return true; if (m.parent) m.parent.remove(m); m.geometry.dispose(); return false; }); }
  ground(x, z) { const t = this.c.tiles; try { const y = t && typeof t.groundAt === 'function' ? t.groundAt(x, z) : 0; return Number.isFinite(y) ? y : 0; } catch { return 0; } }
  target(T0) {
    const pt = this.c.pointer; if (!pt || typeof pt.register !== 'function') return;
    const off = pt.register((ray, near) => {
      if (!near || near.flat(T0.x, T0.z) > T0.r + 0.6) return null;
      const verb = T0.verb(); if (!verb) return null;
      const hit = near.sphere(T0.x, this.ground(T0.x, T0.z) + 0.9, T0.z, 0.8); if (!hit) return null;
      return [{ dist: hit.t, miss: hit.miss, target: { kind: 'thing', ref: `n:${T0.label}`, label: T0.label, e: { verb, run: T0.run } } }];
    });
    (this.lot ? this.lot.targets : this.offs).push(off);
  }
  unstage() {
    const lot = this.lot; if (!lot) return;
    for (const P of lot.people.values()) { try { P.remove(); } catch { /* gone */ } }
    for (const [, m] of lot.meshes) { if (m.parent) m.parent.remove(m); m.geometry.dispose(); }
    for (const off of lot.targets) { try { off(); } catch { /* gone */ } }
    this.lot = null;
  }
  walkAway() {
    const s = this.story, lot = this.lot; if (!lot) return;
    const ep = lot.ep;
    if (s.run && typeof s.run.walkOut === 'function') { try { s.run.walkOut(ep); } catch (e) { console.warn('n: walk out', e); } }
    if (!s.has('run.out')) s.set('run.out', ep, 'n:lot');
    if (s.emit) s.emit('run:out', { ep });
    this.stub = null;
    this.unstage();
  }

  // --- the scenes ----------------------------------------------------------------------------------------------------------
  args() {
    const s = this.story, keys = s.keys('cans.');
    return { ep: this.lot ? this.lot.ep : null, carbonRead: s.has('cans.memo.read') || keys.some(([k]) => /memo|carbon/.test(k)), einoNote: s.has('pit.note') || s.has('nb.einonote'),
      stranger: !(s.has('maggie.met') || (s.doc && s.doc.ppl && s.doc.ppl.maggie && s.doc.ppl.maggie.met)), danCard: this.danCard(),
      needled: s.has('brekke.needled') || s.has('stations.known'), farm: !!(this.lot && this.lot.ep === 31), sledArgued: s.has('tom.sled') };
  }
  open(P, def, start, hooks, onEnd) {
    const D = this.c.talk, TP = this.c.topics; if (!D || !TP || !P) return false;
    const run = new SceneRun(TP, def, { who: def.who, args: this.args(), hooks, onEnd: (at) => { P.talking = false; if (onEnd) onEnd(at); } });
    P.talking = true;
    return D.open({ speaker: P.speaker, name: P.name, role: '', room: null, start: () => run.node(start), bye: () => { P.talking = false; return null; } });
  }
  talkWade() { const P = this.lot && this.lot.people.get('wade'); return this.open(P, N.WADE, 'start', {}); }
  talkMaggie() {
    const lot = this.lot, s = this.story, P = lot && lot.people.get('maggie'); if (!P || lot.handed && lot.letter === 'M') return false;
    const a = this.args(); if (!a.stranger) s.meet('maggie', 'n:lot');
    let walt = 'kept';
    return this.open(P, N.MAGGIE, 'start', {
      handed: () => { lot.handed = true; },
      carbon: () => { s.set('end.carbon', 'maggie', 'n:maggie'); },
      named: () => { walt = 'named'; this.commit('J', { walt }); },
      kept: () => { walt = 'kept'; this.commit('J', { walt }); },
      close: () => {},
    }, (at) => { if (at === 'who') this.afterMaggie(); });
  }
  talkDan() {
    const lot = this.lot; if (!lot) return false;
    const P = lot.people.get('dan');
    if (this.story.has('end')) return lot.letter !== 'M' && !lot.danAside ? this.danAside() : false;
    const s = this.story, read = (v) => { if (!s.has('end.read')) s.set('end.read', v, 'n:brekke'); };
    return this.open(P, N.DAN_M, 'start', {
      turnback: () => {},
      handover: () => { this.commit('M', {}); },
      readyes: () => read('yes'), readno: () => read('no'), readsilent: () => read('silent'),
      close: () => {},
    }, (at) => { if (at === 'ring') this.afterDan(); });
  }
  danAside() {
    const lot = this.lot, P = lot && lot.people.get('dan'), p = this.c.player; if (!P) return false;
    lot.danAside = true;
    if (p && P.moveTo) { const d = norm(P.x - p.x, P.z - p.z); P.moveTo(p.x + d.x * 1.6, p.z + d.z * 1.6, Math.atan2(-d.x, -d.z)); } // (Dan walks over)
    return this.open(P, N.DAN_J, 'start', {}, () => this.finish(1500));
  }
  commit(end, { walt = 'kept', read = null } = {}) {
    const s = this.story, lot = this.lot; if (!lot || s.has('end')) return false;
    const ok = N.commitEnding(s, { end, walt, read, lot: lot.ep, src: 'n:lot' });
    if (!ok) return false;
    lot.letter = s.get('end'); lot.handed = true;
    // the cans change hands
    const i = this.c.inventory; try { if (i) i.remove(CANS, Math.max(1, this.cans())); } catch (e) { console.warn('n: the cans', e); }
    if (end === 'M') s.action('pay', `${N.MONEY} ${N.TALLY.money}`, { rule: 'n:money' });
    // story-meta: the endings seen (the player's, across seasons)
    try { const m = s.meta(); const e = Array.isArray(m.endings) ? m.endings.slice() : []; if (!e.includes(lot.letter)) e.push(lot.letter); s.setMeta({ endings: e }); } catch { /* meta */ }
    this.stub = null;
    return true;
  }
  // the journalist: the wagon pulls out, Wade's truck already gone; Brekke's window two inches; then Dan walks over
  afterMaggie() {
    const lot = this.lot; if (!lot) return;
    const s = this.story, h = this.c.hud;
    setTimeout(() => {
      if (!this.lot) return;
      const M = lot.people.get('maggie'); if (M) { M.remove(); lot.people.delete('maggie'); } this.dropMesh('wagon');
      const W = lot.people.get('wade'); if (W) { W.remove(); lot.people.delete('wade'); } this.dropMesh('wadetruck');
      if (this.args().needled) { const w = T('50:9.1.13'); if (w && h) h.note(`Brekke: “${w}”`, 5); }
      if (lot.ep === 31) { const P = this.c.hud; if (P) P.note(`Tauno: “${s.has('tauno.record') ? N.RAW.taunoIf.text : N.RAW.taunoGood.text}”`, 5); }
      this.danAside();
    }, 1800);
  }
  // the money: Maggie watches with her window down, then drives out; Dan's truck goes
  afterDan() {
    const lot = this.lot; if (!lot) return;
    setTimeout(() => { if (!this.lot) return; const M = lot.people.get('maggie'); if (M) { M.remove(); lot.people.delete('maggie'); } this.dropMesh('wagon'); this.finish(2500); }, 1500);
  }
  // the trip comes out here now (the hold lifted), and the lot empties
  finish(ms = 0) {
    const lot = this.lot; if (!lot || lot.done) return;
    lot.done = true;
    setTimeout(() => {
      const o = this.c.outfitter, e = o && typeof o.entry === 'function' ? o.entry(lot.ep) : null;
      try { if (o && e && o.trip && o.trip.active) o.comeIn(e); } catch (err) { console.warn('n: the come-out', err); }
      if (this.story.emit) this.story.emit('lot:done', { ep: lot.ep, end: this.story.get('end') });
      setTimeout(() => { if (this.lot === lot) this.unstage(); }, 6000);
    }, ms);
  }

  // --- the trip-end tally: consulting (50 §10) ------------------------------------------------------------------------------
  wrapTally() {
    const s = this.story; if (this.tallyWrapped || typeof s.tallyLines !== 'function') return;
    const prev = s.tallyLines; this.tallyWrapped = true;
    s.tallyLines = (o) => {
      const out = prev(o) || [];
      try {
        if (N.consultingDue(s) && !(this.lot && this.lot.letter === 'M')) { // (not on the ending's own trip: its $25,000 is there)
          const p = s.profile || (s.ctx && s.ctx.profile) || this.c.profile; if (p && typeof p.earn === 'function') p.earn(N.CONSULTING, 'story');
          out.push({ id: `story:n.consulting:${s.time().abs}`, title: N.TALLY.consulting, pay: N.CONSULTING, kind: 'story', from: null });
        }
      } catch (e) { console.warn('n: consulting', e); }
      return out;
    };
  }

  // --- the board (campaign-design §9; 50 §12.2) ----------------------------------------------------------------------------
  board(slots, ep) {
    const s = this.story; if (!this.on) return slots;
    const out = N.boardFilter(s, slots, ep);
    if (out !== slots && !s.has(`end.board.${ep}`)) { s.set(`end.board.${ep}`, true, 'n:board'); const w = T(N.BOARD_EMPTY); if (w && this.c.hud) this.c.hud.note(`“${w}”`, 5); }
    if (Number(ep) === N.KETTLE_FARM && N.samplingOpen(s)) this.pinSampling(ep);
    return out;
  }
  async pinSampling(ep) {
    const Tk = this.c.tasks, d = this.c.day; if (!Tk || this.pinning || !d) return;
    const month = `${d.year}-${monthOf(d.doy)}`, doy = d.doy;
    if (doy < 135 || doy > 290) return; // open water
    const seen = [...Tk.ads.values(), ...(Tk.active || [])].some((t) => t && t.kind === 'tashasampling' && t.month === month);
    if (seen) return;
    this.pinning = true;
    try {
      const t = await Tk.makeKind('tashasampling', ep, 'medium');
      const b = Tk.boards && Tk.boards[ep];
      if (t && b) { t.month = month; const i = 2; const old = b.slots[i] != null ? Tk.ads.get(b.slots[i]) : null; if (old && old.status === 'offered') Tk.ads.delete(old.id); b.slots[i] = t.id; Tk.changed(); if (typeof Tk.boardChanged === 'function') Tk.boardChanged(); }
    } catch (e) { console.warn('n: Tasha\'s sampling', e); } finally { this.pinning = false; }
  }

  // --- the postcard (50 §11) -----------------------------------------------------------------------------------------------
  postcardDue() {
    const s = this.story; if (!s || !s.has('end') || s.has('world.postcard') || !s.has('world.paper')) return false;
    const f = s.fact('end'), t = s.time();
    return t.abs - f.abs >= N.PAPER_DAYS || new Date(t.abs * 864e5).getUTCFullYear() > new Date(f.abs * 864e5).getUTCFullYear();
  }
  storeEnter(ep) {
    if (!this.on || !this.postcardDue()) return;
    const C0 = this.c.cast; if (!C0 || ep !== C0.home()) return;
    setTimeout(() => { const st = this.josie(); if (st && st.h && st.h.say) { try { st.h.say(T('50:11.1').split('?')[0] + '?'); } catch { /* not drawn */ } } }, 1200);
  }
  josie() { const C0 = this.c.cast; if (!C0 || !C0.live) return null; for (const st of C0.live.values()) if (st.who === 'josie') return st; return null; }
  wrapJosie() {
    const C0 = this.c.cast; if (!C0 || typeof C0.talk !== 'function') return;
    const t0 = C0.talk.bind(C0);
    C0.talk = (who) => (who === 'josie' && this.postcardDue() ? this.postcardTalk() || t0(who) : t0(who));
  }
  postcardTalk() {
    const D = this.c.talk, TP = this.c.topics; if (!D || !TP) return false;
    let st = this.josie(), sp = st && st.h && st.h.speaker, room = st ? st.ep : null;
    if (!sp) {
      // (Josie not seated: the onboarding's staffer stands there, or the cast is off this visit) she comes out to the counter
      const C0 = this.c.cast, home = C0 && C0.home(), L = home != null ? storeLayout(home) : null, at = L && SPOT_OF(L, 'counter');
      if (!at) return false;
      if (this.josieF) this.josieF.remove();
      this.josieF = new FieldPerson(this.c, 'josie', { x: at.x, z: at.z, heading: at.heading, name: 'Josie' });
      sp = this.josieF.speaker; room = home;
    }
    const run = new SceneRun(TP, N.JOSIE_CARD, { who: 'josie', args: {}, hooks: { card: () => this.giveCard() } });
    return D.open({ speaker: sp, name: 'Josie', role: '', room, start: () => run.node('start'), bye: () => { if (this.josieF) { const f = this.josieF; this.josieF = null; setTimeout(() => f.remove(), 4000); } return null; } });
  }
  giveCard() {
    const s = this.story; if (s.has('world.postcard')) return;
    const i = this.c.inventory; try { if (i) i.give('page:postcard'); } catch (e) { console.warn('n: the postcard', e); }
    s.set('world.postcard', true, 'n:postcard');
    s.waltLine(N.CARD_LINE[s.get('end')] || N.CARD_LINE.J, 'n:postcard');
    s.waltLine(N.CARD_WALT, 'n:postcard');
  }

  // --- the people's first lines after the paper (50 §12.3): said first when they are next talked to ----------------------
  wrapTalk() {
    const D = this.c.talk; if (!D || typeof D.open !== 'function' || D.nWrapped) return;
    const open0 = D.open.bind(D); D.nWrapped = true;
    D.open = (o = {}) => {
      try {
        const key = o.speaker && String(o.speaker.key || ''), m = /^(?:cast|field):([a-z]+)/.exec(key), who = m && m[1];
        const s = this.story, id = who && this.on ? N.afterLine(s, who, { ep: o.room }) : null;
        if (id) {
          const text = T(id), start = o.start;
          if (text && typeof start === 'function') { s.set(`${who}.after`, true, 'n:after'); return open0({ ...o, start: () => ({ say: text, by: o.name, choices: [{ text: '…', go: () => start() }] }) }); }
        }
      } catch (e) { console.warn('n: after line', e); }
      return open0(o);
    };
  }
  tomScene(speaker) {
    const s = this.story, D = this.c.talk, TP = this.c.topics;
    if (!s || !s.has('end.J') || !s.has('world.paper') || s.has('tom.camp') || !D || !TP || !speaker) return false;
    const run = new SceneRun(TP, N.TOM_CAMP, { who: 'tom', args: this.args(), hooks: {} });
    return D.open({ speaker, name: 'Tom', role: '', room: null, start: () => run.node('start'), bye: () => null });
  }

  // --- Maggie after (50 §12.3): at Hog Creek; M stops the consulting with "I hope it was a lot.", J: May, "fishing" -------
  maggieTick() {
    const s = this.story, p = this.c.player; if (!s.has('end') || !p || !this.c.actors) { this.dropMaggie(); return; }
    const L = storeLayout(N.MAGGIE_AT), d = this.c.day;
    const want = !!L && Math.hypot(L.door.x - p.x, L.door.z - p.z) < 120 && d && d.hours >= 8 && d.hours < 18 &&
      (s.has('end.M') ? !s.has('world.consulting.stop') && s.has('world.paper') : monthOf(d.doy) === 5 && !s.has(`maggie.after.j`));
    if (!want) { this.dropMaggie(); return; }
    if (this.mag) return;
    const B = L.axes ? L.axes.b : { x: 0, z: 1 }, at = { x: L.door.x + B.x * 4, z: L.door.z + B.z * 4 };
    this.mag = new FieldPerson(this.c, 'maggie', { x: at.x, z: at.z, heading: 0, name: 'Maggie' });
    this.mag.onTalk = (P) => {
      const D = this.c.talk, TP = this.c.topics; if (!D || !TP) return false;
      const run = new SceneRun(TP, N.MAGGIE_AFTER, { who: 'maggie', args: {}, hooks: { stop: () => s.set('world.consulting.stop', true, 'n:maggie') } });
      return D.open({ speaker: P.speaker, name: 'Maggie', role: '', room: null, start: () => run.node(s.has('end.M') ? 'm' : 'j'), bye: () => null });
    };
  }
  dropMaggie() { if (this.mag) { this.mag.remove(); this.mag = null; } }
  // the last Thursday at Farm (50 §9.1, week 3, journalist): Brekke stays aboard; Tauno's one line; never again after
  thursdayTick() {
    const s = this.story, d = this.c.day, p = this.c.player;
    if (!d || !p || !s.has('end.J') || !s.has('world.resign') || s.has('world.lastThursday')) return;
    const dow = new Date(s.time().abs * 864e5).getUTCDay(); if (dow !== 4 || d.hours < 11.5 || d.hours > 13.5) return;
    const L = storeLayout(31); if (!L || Math.hypot(L.door.x - p.x, L.door.z - p.z) > 70) return;
    s.set('world.lastThursday', true, 'n:thursday');
    const w = T('50:9.1.18'); if (w && this.c.hud) this.c.hud.note(`Tauno: “${w}”`, 7);
  }

  // --- props by ending (50 §12.1; 70 §2.7) -----------------------------------------------------------------------------------
  propsTick() {
    const s = this.story, p = this.c.player; if (!p) return;
    const want = new Map();
    if (s.has('end') && s.has('world.paper')) {
      const days = s.time().abs - s.fact('world.paper').abs, J = s.has('end.J');
      for (const ep of nearStores(p)) {
        const L = storeLayout(ep); if (!L || !L.counter) continue;
        // the paper on the counter for two weeks (J: front page; M: the column), then J's clipping by the register at four
        if (days <= N.LEDGER_DAYS || (J && N.LIKED_WALT.includes(ep))) want.set(`paper:${ep}`, () => this.counterPaper(L, J));
        if (J && ep === 25 && s.has('world.walt.photo')) want.set('photo:25', () => this.wallPhoto(L));
      }
    }
    if (s.has('end.J') && s.has('world.trench.closed') && near(p, KETTLE.at, 600)) want.set('fence', () => this.single('fence', smallGeo('fence'), { x: KETTLE.at.x + 15, z: KETTLE.at.z + 40 }, 0.4));
    if (s.has('end.M') && s.has('world.stakes') && near(p, KETTLE.at, 600)) want.set('stakes', () => this.stakes());
    for (const k of [...this.props.keys()]) if (!want.has(k)) this.dropProp(k);
    for (const [k, make] of want) if (!this.props.has(k)) { const r = make(); if (r) this.props.set(k, r); }
  }
  single(key, geo, at, heading, y = null) {
    const sc = this.c.scene; if (!sc || !geo) return null;
    const m = new THREE.Mesh(geo, propMaterial()); m.name = `n ${key}`;
    m.position.set(at.x, y != null ? y : this.ground(at.x, at.z), at.z); m.rotation.y = heading;
    m.matrixAutoUpdate = false; m.updateMatrix(); m.updateMatrixWorld(true); sc.add(m);
    return { meshes: [m], offs: [] };
  }
  counterPaper(L, J) {
    const k = L.counter, A = L.axes ? L.axes.a : { x: 1, z: 0 }, at = { x: k.x + A.x * 0.4, z: k.z + A.z * 0.4 };
    const r = this.single(`paper:${L.ep}`, smallGeo('paper'), at, (k.heading || 0) + 0.2, (L.floorY || 0) + 0.96);
    if (!r) return null;
    const pt = this.c.pointer, s = this.story;
    if (pt && typeof pt.register === 'function') r.offs.push(pt.register((ray, near) => {
      if (!near || near.flat(at.x, at.z) > 2.4) return null;
      const hit = near.sphere(at.x, (L.floorY || 0) + 0.97, at.z, 0.3); if (!hit) return null;
      return [{ dist: hit.t, miss: hit.miss, target: { kind: 'thing', ref: 'n:paper', label: 'The Northland Ledger', e: { verb: 'Read', run: () => this.readPaper(J) } } }];
    }));
    void s; return r;
  }
  readPaper(J) {
    const s = this.story, i = this.c.inventory, id = J ? 'page:ledger' : 'page:column';
    try { if (i && !i.has(id)) i.give(id); } catch (e) { console.warn('n: the paper', e); }
    if (!s.has('end.paperread')) s.set('end.paperread', true, 'n:paper');
    const h = this.c.hud; if (h) h.note(J ? 'STATIONS 7 TO 12. The clipping goes in your book.' : 'The papers existed. The clipping goes in your book.', 5);
    return true;
  }
  wallPhoto(L) { const k = L.counter, B = L.axes ? L.axes.b : { x: 0, z: 1 }, at = { x: k.x - B.x * 1.2, z: k.z - B.z * 1.2 }; return this.single('photo:25', smallGeo('frame'), at, k.heading || 0, (L.floorY || 0) + 1.6); }
  stakes() {
    const k = kit('surveyLath'), sc = this.c.scene; if (!k || !sc) return null;
    const out = { meshes: [], offs: [] };
    for (let i = 0; i < 6; i++) {
      const r = k.build({ rng: rngFor(`n.stake.${i}`) }); if (!r || !r.geo) continue;
      const at = { x: KETTLE.at.x - 6 + i * 14, z: KETTLE.at.z + 100 - i * 52 };
      const m = new THREE.Mesh(r.geo, propMaterial()); m.position.set(at.x, this.ground(at.x, at.z), at.z); m.matrixAutoUpdate = false; m.updateMatrix(); m.updateMatrixWorld(true); sc.add(m); out.meshes.push(m);
    }
    return out;
  }
  dropProp(k) { const r = this.props.get(k); if (!r) return; for (const m of r.meshes) { if (m.parent) m.parent.remove(m); m.geometry.dispose(); } for (const off of r.offs) { try { off(); } catch { /* gone */ } } this.props.delete(k); }

  staged() {
    const lot = this.lot; if (!lot) return null;
    return { ep: lot.ep, wagon: lot.plan.wagon, maggie: lot.maggie, people: [...lot.people.keys()], handed: lot.handed, done: lot.done, letter: lot.letter || null, callAt: lot.callAt ?? null, wagonAt: lot.wagonAt ?? null };
  }
  makeDebug() {
    return {
      runStub: (on = true) => { const s = this.story; this.stub = on ? {} : null; if (on && !s.has('run.lifted')) s.set('run.lifted', 'any', 'n:stub'); return this.runActive(); },
      stage: (ep) => { const L = trailheadLayout(ep); if (!L) return false; const s = this.story, t = s.time(); this.stageLot(L, N.lotFor(s, ep, { abs: t.abs, hours: Math.max(t.hours, N.FIRST_LIGHT), served: true })); return this.staged(); },
      skip: (h = 1) => { const d = this.c.day; if (d && d.advance) d.advance(h); try { this.story.update(); } catch { /* the clock's */ } this.t = TICK; this.update(0); return this.staged(); },
      wagon: () => { this.wagonIn(); return this.staged(); },
      maggie: () => this.talkMaggie(), dan: () => this.talkDan(), wade: () => this.talkWade(),
      choose: (end, o = {}) => { const ok = this.commit(end === 'M' ? 'M' : 'J', { walt: end === 'JN' ? 'named' : 'kept', read: o.read || null }); if (ok) this.finish(0); return ok; },
      walkAway: () => { this.walkAway(); return this.story.get('run.out'); },
      postcard: () => (this.postcardDue() ? (this.giveCard(), true) : false),
      postcardTalk: () => this.postcardTalk(),
      due: () => this.postcardDue(),
      props: () => [...this.props.keys()],
    };
  }
}

// --- Tasha's sampling (50 §12.2): a task kind at Farm, pinned by the board's n filter; never drawn at random ---------------
function registerSampling() {
  if (KINDS.tashasampling) return;
  const station = { x: KETTLE.at.x + 68, z: KETTLE.at.z - 258 }; // the creek's foot below the pond (kettle.js KETTLE_AT.creek's last)
  registerKind('tashasampling', {
    label: 'Sampling', weight: { local: 0, medium: 0, far: 0 },
    make(Tk, c) {
      if (Number(c.ep) !== N.KETTLE_FARM) return null;
      const title = T('50.notice.tasha.1') || 'Sampling with Tasha\'s crew';
      const text = T('50.notice.tasha.2') || 'Need a careful paddler for creek samples, Kettle drainage. Bring waders. Tasha (Northmark field).';
      return { key: `tasha:${Tk.today ? Tk.today() : 0}`, station, title, text, sign: 'Tasha (Northmark field)', km: Math.hypot(station.x - c.landing.x, station.z - c.landing.z) / 1000 };
    },
    pay() { return N.SAMPLING_PAY; },
    update(Tk, t) {
      const p = Tk.player; if (!p || t.status !== 'open') return;
      if (Math.hypot(p.x - station.x, p.z - station.z) < 60 && Tk.day && Tk.day.hours >= 8 && Tk.day.hours < 18) { t.status = 'done'; Tk.note('Samples bottled and the Secchi read. That\'s the creek for this month.'); Tk.changed(); }
    },
    target() { return { x: station.x, z: station.z, r: 120, label: 'the Kettle creek', tight: true }; },
    progress(t) { return t.status === 'done' ? 'done' : 'the creek below the pond'; },
    inWindow(Tk, doy) { return doy >= 135 && doy <= 290; },
  });
}
// the phone call: Dan picks up (no line in the docs: a build draft, docs/story/95-drafted-lines.md n.phone.dan)
function phoneLine() { return 'It rings twice. “Dan Marolt.” A pause. “Stay there. Twenty minutes.”'; }
function norm(x, z) { const l = Math.hypot(x, z) || 1; return { x: x / l, z: z / l }; }
function near(p, at, r) { return Math.hypot(p.x - at.x, p.z - at.z) < r; }
function monthOf(doy) { return new Date(Date.UTC(2026, 0, doy)).getUTCMonth() + 1; }
function nearStores(p) { const out = []; for (const ep of OUTFITTER_EPS) { const L = storeLayout(ep); if (L && L.door && Math.hypot(L.door.x - p.x, L.door.z - p.z) < NEAR_STORE) out.push(ep); } return out; }
void LOT_R;

export const endings = new Endings();
