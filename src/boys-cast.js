// The boys in the world (campaign stream b5, Round 5; docs/story/32-the-boys.md §5.1–§5.9, §11): Carol at the Sawbill 38
// counter and the slides after close; Bob on Tuesdays and Saturdays and Denny any afternoon at the two tables by the
// counter; Frank at Farm 31's urn before seven (and the step at seven, as Tauno comes); the three in the store yard 1–7
// August; their camp at Little Sag C1210 9–14 August (the hail, the round, the fire, Walt's pan, the laker bet with the
// two canoes out and the 1998 story told over the hole, the cup on the rock on the 14th); Bob under a canoe on the 473
// on the 9th; the 15th at the counter. Gene's slide held up against the view off Gull's creek mouth (the `silhouette`
// minigame: lock 3 key B). Denny's rings, his card, the free permit on the boys' own; Frank in the lot on a late drive
// through Ely (the drive card's road line). Loaded only under STORY_ON (main.js's b5 block). A co-op guest's story is a
// mirror: nobody is staged for them.
//
//   boysCast.attach({ story, cast, npcs, talk, topics, texts, outfitter, player, day, world, scene, tiles, rides, actors,
//                     pointer, hud, layer, profile, inventory, pencil, permits, fishing, photo, fires, parties, wind,
//                     minigames, show, camera })
//   boysCast.update(dt)        the people by their schedules, the camp, the bet, the slide held up
//   boysCast.talk(who, o)      E on Carol, Bob, Denny, Frank (or the yard's three, or the camp's)
//   boysCast.staged() · boysCast.debug { … }   (scripts/cmp-b5-test.mjs)
import * as THREE from 'three';
import { SceneRun, T } from './topics.js';
import { storeLayout } from './props.js';
import { kit, rngFor, cafeSpots } from './story-props.js';
import { propMaterial } from './prop-kit.js';
import { registerSensor } from './story-cond.js';
import { CAST } from './story-data/cast.js';
import { itemDef } from './items.js';
import { FieldPerson } from './kettle.js';
import { silhouette } from './minigames/silhouette.js';
import { ITEM, has, takeItem } from './boys-items.js';
import {
  B5_SENSORS, SAWBILL, FARM, TRIP, BET, SLIDE, LABELS, ROUND, CAROL, CAROL_CLOSE, BOB, DENNY, FRANK, FRANK_CLOSE, STEP, YARD, YARD_CLOSE,
  CAMP, CAMP_BYE, HAIL, SHARE, PAN_EAT, CUP_ROCK, CUP_BACK, CARRY_BARK, FRANK_FISH, WON, STORY98, SLIDES,
  carolEntry, bobEntry, dennyEntry, yardEntry, campEntry, campStart,
} from './story-data/boys.js';

for (const [k, v] of Object.entries(B5_SENSORS)) registerSensor(k, v);
const NEAR = 130, TICK = 0.5, CAMP_R = 420, HAIL_R = 140;
const STORE_PEOPLE = ['carol', 'bob', 'denny', 'frank'];
const DEG = 180 / Math.PI;
const RINGS = ['isabella.site', 'isabella.carry', 'isabella.landing', 'isabella.pool', 'bog67'];
const absOf = (y, m, d) => Math.round(Date.UTC(y, m - 1, d) / 86400000);

class BoysCast {
  constructor() { this.c = {}; this.live = new Map(); this.yard = null; this.camp = null; this.t = 0; this.offs = []; this.cafe = null; this.bet = null; this.carry = null; this.mg = null; this.overlay = null; this.slideEl = null; this.said = new Set(); this.debug = this.makeDebug(); }
  attach(c = {}) {
    Object.assign(this.c, c);
    const s = this.c.story;
    if (!s) return this;
    this.offs.push(s.on('season', () => this.clear()));
    // the minigame (minigames.js registry: E's), and the bet's catch (the player's lakers while it's on)
    if (this.c.minigames && typeof this.c.minigames.register === 'function') this.offs.push(this.c.minigames.register('silhouette', silhouette));
    const F = this.c.fishing;
    if (F && typeof F.record === 'function' && !F.b5wrapped) {
      const rec = F.record.bind(F); F.b5wrapped = true;
      F.record = (fish, kept) => { const e = rec(fish, kept); try { this.caught(fish); } catch (err) { console.warn('boys: the bet', err); } return e; };
    }
    // Walt's pan: the next meal ready at a fire near their camp, the pan in your pack (32 §5.9.4)
    if (this.c.fires && typeof this.c.fires.on === 'function') this.offs.push(this.c.fires.on('ready', () => this.panCooked()));
    // Frank in the company's lot, from a late drive through Ely (32 §5.7: t2, Frank met, 21:00–5:00, once): the card's line
    const R = this.c.rides;
    if (R && !R.b5wrapped) {
      R.b5wrapped = true; const road0 = R.roadLine;
      R.roadLine = (o) => { const w = this.lotLine(o); if (w) return w; return typeof road0 === 'function' ? road0(o) : null; };
    }
    // the fixed parties live while the story is (parties.js FIXED_PARTIES: the boys' week; s's and 7c's entries too)
    const P = this.c.parties;
    if (P) { const prev = P.fixedLive; P.fixedLive = () => this.on || (typeof prev === 'function' ? !!prev() : !!prev); }
    // at C1210 the camp's own figures stand aside for the three of them (party-camps.js shows: people off for the boys)
    const PC = this.c.partyCamps;
    if (PC && typeof PC.shows === 'function' && !PC.b5wrapped) { PC.b5wrapped = true; const sh = PC.shows.bind(PC); PC.shows = (stay) => { const r = sh(stay); return stay && stay.party && stay.party.fixed === 'boys' && this.on && r ? { ...r, people: false } : r; }; }
    // Carol's "Look at this…" (show.js: the arc's want, the print of Gene's paddle)
    if (this.c.show && typeof this.c.show.talker === 'function') this.offs.push(this.c.show.talker('carol', (o = {}) => this.talk('carol', o)));
    return this;
  }
  get story() { return this.c.story || null; }
  get on() { const s = this.story; return !!(s && s.doc && s.mode !== 'mirror'); }
  date() { const d = this.c.day; if (!d) return { m: 7, d: 1, dow: 3, h: 12, year: 2026 }; const D = new Date(Date.UTC(d.year, 0, d.doy)); return { m: D.getUTCMonth() + 1, d: D.getUTCDate(), dow: D.getUTCDay(), h: d.hours, year: d.year }; }
  aug(n) { const t = this.date(); return t.m === 8 && t.d === n; }
  args(ep = SAWBILL, extra = {}) {
    const n = this.c.cast, base = n && typeof n.args === 'function' ? n.args(ep) : { ep };
    const st = (who) => this.live.has(who) && this.live.get(who).ep === ep;
    const s = this.story, today = s ? Math.floor(s.nowAbs()) : 0, sd = s && s.fact('carol.slides.done');
    const t = this.date();
    return { ...base, carolNear: st('carol') && t.h >= 14 && t.h < 15, bobNear: st('bob'), dennyNear: st('denny'), frankNear: st('frank'),
      withFood: !!this.food(), slidesToday: !!(sd && Math.floor(sd.abs || 0) === today), lastNight: this.aug(14), evening: t.h >= 18, betDay: this.betDay(), ...extra };
  }
  say(sp, list) { // a chain of barks, each by its speaker ([{ id, by }]) → the dialogue's bark queue
    const D = this.c.talk; if (!D || typeof D.bark !== 'function') return false;
    const ws = list.map((l) => ({ text: T(l.id), sp: this.speakerOf(l.by) || sp })).filter((x) => x.text && x.sp);
    if (!ws.length) return false;
    let next = null; for (let i = ws.length - 1; i > 0; i--) next = { sp: ws[i].sp, text: ws[i].text, next };
    try { D.bark(ws[0].sp, ws[0].text, { pri: 3, next }); } catch { return false; }
    return true;
  }
  speakerOf(by) {
    const who = String(by || '').toLowerCase();
    const f = (this.camp && this.camp.people && this.camp.people[who]) || (this.yard && this.yard.people && this.yard.people[who]);
    if (f) return f.speaker;
    const st = this.live.get(who); return st && st.h ? st.h.speaker : null;
  }
  note(id, secs = 4) { const w = T(id); if (w && this.c.hud && typeof this.c.hud.note === 'function') this.c.hud.note(w, secs); return !!w; }

  // --- the update ---------------------------------------------------------------------------------------------------------
  update(dt) {
    if (!this.on) { if (this.live.size || this.yard || this.camp) this.clear(); return; }
    this.slideTick(dt); // (every frame: the slide held up against the view)
    this.t += dt;
    if (this.t < TICK) return;
    const step = this.t; this.t = 0;
    const p = this.c.player; if (!p) return;
    this.storeTick(SAWBILL, p);
    this.storeTick(FARM, p);
    this.yardTick(p);
    this.campTick(p, step);
    this.carryTick(p);
  }
  storeTick(ep, p) {
    const L = storeLayout(ep);
    const mine = [...this.live.values()].filter((st) => st.ep === ep);
    if (!L) { for (const st of mine) this.unstage(st.who); return; }
    const d = Math.hypot(L.centre.x - p.x, L.centre.z - p.z);
    if (d > NEAR + 30) { for (const st of mine) this.unstage(st.who); if (ep === SAWBILL) this.dropCafe(); return; }
    if (d > NEAR) return;
    if (ep === SAWBILL) this.buildCafe(L);
    const s = this.story, a = this.args(ep);
    for (const who of STORE_PEOPLE) {
      const R = CAST[who], cur = this.live.get(who);
      if (cur && cur.ep !== ep) continue;
      const slot = R.where.find((w) => this.epOf(w.at) === ep && w.at !== 'b5:yard' && s.when(w.when, a) && this.minute(who, w));
      if (cur && (!slot || slot.id !== cur.slot.id) && !this.talkingTo(cur)) { this.leaving(cur, L); this.unstage(who); }
      if (slot && !this.live.has(who)) this.stage(who, slot, L);
    }
  }
  epOf(at) { return at === 'b5:urn' ? FARM : /^b5:(counter|window|corner|yard)$/.test(at) ? SAWBILL : null; }
  // Frank to the minute (6:10–7:00, 32 §5.7); everyone else by the hour
  minute(who, w) { if (who !== 'frank' || w.id !== 'farm') return true; const h = this.c.day ? this.c.day.hours : 6.5; return h >= 6 + 10 / 60 && h < 7; }
  spotOf(at, who, L) {
    const A = L.axes.a, B = L.axes.b, C0 = L.centre, y = L.floorY;
    const W = (a, b) => ({ x: C0.x + A.x * a + B.x * b, z: C0.z + A.z * a + B.z * b, y });
    const cafe = cafeSpots(L);
    if (at === 'b5:counter') { const q = W(-1.15, -2.6); return { ...q, heading: Math.atan2(-B.z, B.x) }; }
    if (at === 'b5:window' || at === 'b5:corner') { const tab = at === 'b5:window' ? cafe.window : cafe.corner, k = who === 'frank' ? 1 : 0, q = tab.seats[k]; return { x: q.x, z: q.z, y: q.y, heading: q.heading }; }
    if (at === 'b5:urn') { const u = cafe.urn; return { x: u.x - A.x * 0.7 + B.x * 0.6, z: u.z - A.z * 0.7 + B.z * 0.6, y, heading: Math.atan2(B.z, -B.x) }; }
    return null;
  }
  stage(who, slot, L) {
    const n = this.c.npcs, R = CAST[who], spot = this.spotOf(slot.at, who, L);
    if (!n || !spot || typeof n.standAt !== 'function') return null;
    let h = null;
    try { h = n.standAt(spot, { key: `cast:${who}:${L.ep}`, name: this.nameOf(who), role: '', look: R.look, ep: L.ep, talk: () => (this.talk(who) ? true : null) }); } catch (e) { console.warn('boys: stage', who, e); }
    if (!h) return null;
    const st = { who, slot, h, ep: L.ep, x: spot.x, z: spot.z, talked: false };
    this.live.set(who, st);
    return st;
  }
  unstage(who) { const st = this.live.get(who); if (!st) return; this.live.delete(who); try { if (st.h && typeof st.h.remove === 'function') st.h.remove(); } catch { /* the store's gone */ } }
  // Frank goes at seven as Tauno comes for the porch: "Frank." "Tauno." on the step (32 §5.7)
  leaving(st, L) {
    if (st.who !== 'frank' || st.ep !== FARM || this.said.has(`step:${this.c.day ? this.c.day.doy : 0}`)) return;
    const p = this.c.player, C = this.c.cast; if (!p || Math.hypot(L.centre.x - p.x, L.centre.z - p.z) > 40) return;
    let tauno = null; if (C && C.live) for (const q of C.live.values()) if (q.who === 'tauno' && q.ep === FARM) tauno = q;
    if (!tauno || !tauno.h) return;
    this.said.add(`step:${this.c.day ? this.c.day.doy : 0}`);
    const D = this.c.talk; const a = T(STEP[0].id), b = T(STEP[1].id);
    if (D && a && b) { try { D.bark(tauno.h.speaker, a, { pri: 3, next: { sp: st.h.speaker, text: b } }); } catch { /* not drawn */ } }
  }
  clear() { for (const who of [...this.live.keys()]) this.unstage(who); this.dropYard(); this.dropCamp(); this.dropCafe(); this.dropCarry(); this.endBet(true); this.slideOff(); }
  nameOf(who) { const R = CAST[who], s = this.story; if (!R) return who; return !R.known || (s && s.has(R.known)) ? R.first : R.unknown || R.first; }
  talkingTo(st) { const t = this.c.talk; return !!(t && t.convo && t.convo.speaker && st.h && t.convo.speaker.key === (st.h.speaker && st.h.speaker.key)); }
  staged() {
    const out = [...this.live.values()].map((st) => ({ who: st.who, slot: st.slot.id, at: st.slot.at, ep: st.ep, x: +st.x.toFixed(1), z: +st.z.toFixed(1) }));
    if (this.yard) out.push(...Object.keys(this.yard.people).map((who) => ({ who, slot: 'yard', at: 'b5:yard', ep: SAWBILL })));
    if (this.camp) out.push(...Object.entries(this.camp.people).map(([who, f]) => ({ who, slot: this.bet && this.bet.boat && who !== 'denny' ? 'boat' : 'camp', at: 'field', x: +f.x.toFixed(1), z: +f.z.toFixed(1) })));
    if (this.carry) out.push({ who: 'bob', slot: 'carry', at: 'field' });
    return out;
  }

  // --- the two tables by the counter (32 §5.3 "chairs up on the two tables by the counter") ---------------------------------
  buildCafe(L) {
    if (this.cafe && this.cafe.L === L) return;
    this.dropCafe();
    const sc = this.c.scene; if (!sc || !L.axes) return;
    const spots = cafeSpots(L), meshes = [];
    const put = (name, at, rotY) => { const k = kit(name); if (!k) return; const r = k.build({ rng: rngFor(`b5.${name}.${meshes.length}`) }); if (!r.geo) return; const m = new THREE.Mesh(r.geo, propMaterial()); m.name = `b5 ${name}`; m.position.set(at.x, at.y, at.z); m.rotation.y = rotY; m.matrixAutoUpdate = false; m.updateMatrix(); m.updateMatrixWorld(true); sc.add(m); meshes.push(m); };
    put('cafeTable', spots.window, Math.atan2(spots.window.ax.x, spots.window.ax.z));
    put('cafeTable', spots.corner, Math.atan2(spots.corner.ax.x, spots.corner.ax.z));
    put('urn', spots.urn, Math.atan2(spots.window.ax.x, spots.window.ax.z));
    this.cafe = { L, meshes };
  }
  dropCafe() { const C = this.cafe; if (!C) return; for (const m of C.meshes) { if (m.parent) m.parent.remove(m); m.geometry.dispose(); } this.cafe = null; }

  // --- the yard, 1–7 August: the canoes on the rack, the packs, the three of them (32 §5.5.1) -----------------------------
  yardTick(p) {
    const t = this.date(), L = storeLayout(SAWBILL), s = this.story;
    const want = L && t.m === 8 && t.d >= 1 && t.d <= 7 && t.h >= 9 && t.h < 18 && Math.hypot(L.centre.x - p.x, L.centre.z - p.z) < NEAR;
    if (!want) { if (this.yard && !this.talkingToField(this.yard)) this.dropYard(); return; }
    if (this.yard) return;
    const A = L.axes.a, B = L.axes.b, f0 = L.stepsFoot || L.door, out = (a, b) => ({ x: f0.x + A.x * a + B.x * b, z: f0.z + A.z * a + B.z * b });
    const people = {}, face = Math.atan2(-B.z, B.x);
    [['bob', -1.6, 6], ['frank', 0.2, 7.2], ['denny', 1.8, 6.2]].forEach(([who, a, b]) => { const q = out(a, b); const f = new FieldPerson(this.c, who, { ...q, heading: face, name: this.nameOf(who) }); f.onTalk = () => this.talkYard(); people[who] = f; });
    this.yard = { people };
    void s;
  }
  dropYard() { const Y = this.yard; if (!Y) return; for (const f of Object.values(Y.people)) f.remove(); this.yard = null; }
  talkingToField(G) { const t = this.c.talk; if (!t || !t.convo || !t.convo.speaker) return false; return Object.values(G.people).some((f) => f.speaker && f.speaker.key === t.convo.speaker.key); }

  // --- the camp at C1210, 9–14 August (32 §5.9.1–§5.9.8) ----------------------------------------------------------------------
  campOn() { const t = this.date(); return t.m === 8 && t.d >= TRIP.camp.days[0] && t.d <= TRIP.camp.days[1] && !(t.d === TRIP.camp.days[0] && t.h < TRIP.camp.land); }
  site() { const pl = this.c.layer && this.c.layer.place ? this.c.layer.place('boys.c1210') : null; return { x: TRIP.camp.site[0], z: TRIP.camp.site[1], landing: pl && Number.isFinite(pl.x) ? { x: pl.x, z: pl.z } : { x: TRIP.camp.landing[0], z: TRIP.camp.landing[1] } }; }
  campTick(p, step) {
    const S = this.site(), d = Math.hypot(S.x - p.x, S.z - p.z), s = this.story, t = this.date();
    if (!this.campOn() || d > CAMP_R + 60) { if (this.camp && !this.talkingToField(this.camp)) this.dropCamp(); this.endBet(true); return; }
    if (d > CAMP_R && !this.camp) return;
    if (!this.camp) {
      const people = {}, spots = { bob: [2.2, 0.5], frank: [-1.6, 1.4], denny: [0.6, -2.2] };
      for (const [who, [dx, dz]] of Object.entries(spots)) { const f = new FieldPerson(this.c, who, { x: S.x + dx, z: S.z + dz, heading: Math.atan2(-dx, -dz), name: this.nameOf(who) }); f.onTalk = () => this.talkCamp(); f.home = { x: S.x + dx, z: S.z + dz }; people[who] = f; }
      this.camp = { people, hailed: -1, cupT: 0 };
    }
    const C = this.camp, today = Math.floor(s.nowAbs());
    // the hail as you paddle within range (Bob: "Come on in, we're decent." Frank: "Mostly."), once a day
    if (d < HAIL_R && C.hailed !== today && !this.bet) { C.hailed = today; this.say(C.people.bob.speaker, [HAIL[0], HAIL[1]]); }
    // the evening's send-off ("There's a good site across the bay. Hang your food."): after 21:00 near the camp, once a day
    if (t.h >= 21 && d < 40 && C.bye !== today) { C.bye = today; this.say(C.people.bob.speaker, [{ id: CAMP_BYE, by: 'Bob' }]); }
    // the bet moves to the 13th if the wind on the 12th is over 15 (32 §5.9.5)
    if (this.aug(BET.day) && t.h >= 16.5 && !s.has('boys.bet') && !s.has('boys.bet.moved')) { const w = this.c.wind; if (w && Number.isFinite(w.speed) && w.speed > BET.wind) s.set('boys.bet.moved', true, 'b5:wind'); }
    this.betTick(p, step);
    this.cupTick(p, d);
  }
  dropCamp() { const C = this.camp; if (!C) return; for (const f of Object.values(C.people)) f.remove(); this.camp = null; }
  betDay() { const s = this.story; const day = s && s.has('boys.bet.moved') ? BET.alt : BET.day; return this.aug(day); }

  // --- the laker bet (32 §5.9.5–§5.9.6): Bob and Frank out over the hole, Denny at camp with the ballgame ---------------------
  hole() {
    if (this.holeAt) return this.holeAt;
    const w = this.c.world, S = this.site(); let best = null;
    if (w && typeof w.heightAt === 'function') for (let gx = -BET.hole.r; gx <= BET.hole.r; gx += 40) for (let gz = -BET.hole.r; gz <= BET.hole.r; gz += 40) {
      const x = S.x + gx, z = S.z + gz, r = Math.hypot(gx, gz); if (r < 120 || r > BET.hole.r) continue;
      let dep = 0; try { dep = w.levelAt(x, z) - w.heightAt(x, z); } catch { dep = 0; }
      if (Number.isFinite(dep) && dep > BET.hole.deep && (!best || dep > best.dep)) best = { x, z, dep };
    }
    this.holeAt = best || { x: S.x + 300, z: S.z - 200, dep: 0 };
    return this.holeAt;
  }
  startBet() {
    if (this.bet || !this.camp) return false;
    const s = this.story, H = this.hole(), A = this.c.actors, now = s.nowAbs();
    const seed = s.hash(`bet:${this.date().year}`), inch = BET.inch[0] + (seed % 1000) / 1000 * (BET.inch[1] - BET.inch[0]);
    this.bet = { from: now, until: now + BET.hours / 24, frankAt: now + BET.hours / 48, frank: inch * 2.54, best: 0, frankSaid: false, boat: null, told: false };
    this.note('d95.b5.spoon', 4);
    // Bob and Frank into their canoe (the old aluminium with the scorched thwart), trolling round the hole
    const P = this.camp.people;
    if (A && typeof A.boat === 'function') {
      try {
        const crew = [P.bob.a, P.frank.a].filter(Boolean);
        const b = A.boat({ key: 'b5:boys', hull: 'aluminium', crew, packs: 0 });
        const ring = []; for (let k = 0; k <= 16; k++) { const a = (k / 16) * Math.PI * 2; ring.push([H.x + Math.cos(a) * 45, H.z + Math.sin(a) * 45]); }
        b.placeAt({ x: ring[0][0], z: ring[0][1], heading: 0 });
        const go = () => { if (this.bet && this.bet.boat === b) b.paddleAlong(ring, 0.45, { onEnd: go }); };
        this.bet.boat = b; go();
      } catch (e) { console.warn('boys: the canoe', e); }
    }
    for (const who of ['bob', 'frank']) { const f = P[who]; f.onTalk = null; f.x = H.x; f.z = H.z; }
    return true;
  }
  betTick(p) {
    const s = this.story, B = this.bet;
    if (!B) return;
    const now = s.nowAbs(), boat = B.boat;
    if (boat && this.camp) for (const who of ['bob', 'frank']) { const f = this.camp.people[who]; if (f) { f.x = boat.x; f.z = boat.z; } }
    const bx = boat ? boat.x : this.hole().x, bz = boat ? boat.z : this.hole().z;
    // Frank lands his around the halfway mark
    if (!B.frankSaid && now >= B.frankAt) { B.frankSaid = true; if (Math.hypot(bx - p.x, bz - p.z) < 400) this.say(this.camp.people.frank.speaker, [FRANK_FISH]); }
    // the 1998 story: the first time the two canoes drift side by side over the hole (within ~20 m)
    if (!B.told && !s.has('boys.story1998') && Math.hypot(bx - p.x, bz - p.z) < BET.near) { B.told = true; this.tell98(); }
    if (now >= B.until) this.endBet(false);
  }
  caught(fish) {
    const B = this.bet; if (!B || !fish || fish.species !== BET.species) return;
    B.best = Math.max(B.best, Number(fish.length) || 0);
  }
  endBet(quiet) {
    const B = this.bet; if (!B) return;
    this.bet = null;
    const s = this.story;
    if (B.boat) { try { B.boat.remove(); } catch { /* gone */ } }
    if (!quiet && s) {
      s.set(B.best > B.frank ? 'boys.bet.won' : 'boys.bet.frank', true, 'b5:bet');
      if (this.camp) this.say(this.camp.people.bob.speaker, [{ id: 'd95.b5.bet.end', by: 'Bob' }]);
    }
    takeItem(this.c.inventory, ITEM.spoon, 1);
    // back to the fire (a fresh FieldPerson each: the crew's figures were the boat's)
    if (this.camp) for (const who of ['bob', 'frank']) { const f = this.camp.people[who]; if (!f) continue; const hm = f.home || { x: f.x, z: f.z }; f.remove(); const g = new FieldPerson(this.c, who, { x: hm.x, z: hm.z, heading: 0, name: this.nameOf(who) }); g.home = hm; g.onTalk = () => this.talkCamp(); this.camp.people[who] = g; }
  }
  tell98() {
    const D = this.c.talk, f = this.camp && this.camp.people.bob; if (!D || !f) return false;
    const run = new SceneRun(this.c.topics, STORY98, { who: 'boys', args: this.args(null) });
    return D.open({ speaker: f.speaker, name: 'Bob and Frank', role: '', room: null, start: () => run.node('story98'), bye: () => null });
  }
  // --- the cup on the rock, 14 August at dusk; Denny on the rock beside it (32 §5.9.8) --------------------------------------
  cupTick(p, d) {
    const C = this.camp, t = this.date(); if (!C || !this.aug(14) || t.h < 20.25 || d > 80) return;
    const den = C.people.denny, rock = this.c.layer && this.c.layer.prop ? this.c.layer.prop('boys.rock') : null;
    if (!C.cup && t.h < 21.5) {
      C.cup = 'out';
      const r = rock && Number.isFinite(rock.prop.x) ? rock.prop : { x: this.site().landing.x, z: this.site().landing.z };
      if (den) den.moveTo(r.x + 0.6, r.z + 0.3, 0);
      this.say(C.people.bob.speaker, CUP_ROCK);
    } else if (C.cup === 'out' && t.h >= 20.5) {
      C.cup = 'back';
      if (den && den.home) den.moveTo(den.home.x, den.home.z, 0);
      if (den) this.say(den.speaker, [CUP_BACK]);
    }
  }
  // --- 9 August, the 473: Bob under a canoe at the Zenith end (32 §5.9.1) ----------------------------------------------------
  carryTick(p) {
    const t = this.date(), on = t.m === 8 && t.d === TRIP.carry.day && t.h >= TRIP.carry.hours[0] && t.h < TRIP.carry.hours[1];
    const [x, z] = TRIP.carry.at, d = Math.hypot(x - p.x, z - p.z);
    if (!on || d > 120) { this.dropCarry(); return; }
    if (!this.carry) { const f = new FieldPerson(this.c, 'bob', { x: x + 2, z: z + 3, heading: 0, name: this.nameOf('bob') }); this.carry = { f, said: false }; }
    if (!this.carry.said && d < 22) { this.carry.said = true; this.say(this.carry.f.speaker, [CARRY_BARK]); }
  }
  dropCarry() { if (this.carry) { this.carry.f.remove(); this.carry = null; } }

  // --- talk -----------------------------------------------------------------------------------------------------------------
  run(def, who, ctx = {}) { const n = this.c.npcs; return new SceneRun(this.c.topics, def, { who: def.who || who, mark: n && n.mark ? (t) => n.mark(t) : null, ...ctx }); }
  hooks() {
    return {
      rings: () => this.rings(),
      round: () => this.round(),
      permit: () => this.permit(),
      share: () => this.share(),
      bet: () => { setTimeout(() => this.startBet(), 60); },
    };
  }
  talk(who, o = {}) {
    if (!this.on) return false;
    const st = this.live.get(who), D = this.c.talk, s = this.story; if (!st || !D) return false;
    st.talked = true;
    if (st.slot.scene === 'b5:slides') return this.slides(st);
    const args = this.args(st.ep);
    let def = null, start = null, bye = null;
    if (who === 'carol') { def = CAROL; start = carolEntry(s); bye = CAROL_CLOSE; if (start === 'again') s.set('carol.favour.again', true, 'b5'); }
    else if (who === 'frank' && st.slot.scene === 'b5:frank') { def = FRANK; start = 'hello'; bye = FRANK_CLOSE; }
    else if (who === 'denny') { def = DENNY; start = dennyEntry(s, { met: this.metOf('denny') }); }
    else { def = BOB; start = bobEntry(s, { frankHere: this.live.has('frank'), dennyHere: this.live.has('denny') }); }
    s.meet(who === 'frank' && st.slot.scene !== 'b5:frank' ? 'bob' : who, 'b5');
    // the 15th at the counter: the bet's winner pays the round (32 §5.9.6)
    if (this.aug(15) && s.has('boys.bet') && !s.has('boys.out15') && (who === 'bob' || who === 'frank')) return this.out15(st);
    const run = this.run(def, who, { args, hooks: this.hooks(), ...(who === 'carol' ? { show: (r, from) => (this.c.show ? this.c.show.choice('carol', r, from) : null) } : {}) });
    const first = () => {
      if (who === 'carol' && o.give && this.c.show) return this.c.show.answer(o.give, { kind: 'print', id: o.give.print }, () => run.choices('hub'));
      return run.node(start);
    };
    return D.open({ speaker: st.h.speaker, name: this.nameOf(who), role: '', room: st.ep, start: first, bye: () => (bye ? T(bye) : null) });
  }
  metOf(who) { const s = this.story; try { return s.when(`met:${who}>=2`) ? 2 : s.when(`met:${who}>=1`) ? 1 : 0; } catch { return 0; } }
  out15(st) {
    const s = this.story, D = this.c.talk, P = this.c.profile;
    s.set('boys.out15', true, 'b5:15th');
    if (s.has('boys.bet.won')) {
      if (P && typeof P.spend === 'function' && P.canAfford(ROUND.price)) P.spend(ROUND.price, 'The round');
      return D.open({ speaker: st.h.speaker, name: this.nameOf(st.who), role: '', room: st.ep, start: () => ({ say: T(WON.player.id), by: 'Bob', choices: [{ text: '…', go: () => null }] }), bye: () => null });
    }
    const [a, b] = WON.frank;
    return D.open({ speaker: st.h.speaker, name: this.nameOf('frank'), role: '', room: st.ep, start: () => ({ say: T(a.id), by: 'Frank', choices: [{ text: '…', go: () => ({ say: T(b.id), by: 'Carol', choices: [{ text: '…', go: () => null }] }) }] }), bye: () => null });
  }
  talkYard() {
    const D = this.c.talk, s = this.story, Y = this.yard; if (!D || !Y || !this.on) return false;
    const run = this.run(YARD, 'boys', { args: this.args(SAWBILL), hooks: this.hooks() });
    const start = yardEntry(s);
    run.def = { ...YARD, nodes: { ...YARD.nodes, open: { ...YARD.nodes.open, to: s.has('boys.round') ? 'hub' : 'rule' } } };
    for (const w of ['bob', 'frank', 'denny']) s.meet(w, 'b5:yard');
    return D.open({ speaker: Y.people.bob.speaker, name: 'Bob, Frank and Denny', role: '', room: null, start: () => run.node(start), bye: () => T(YARD_CLOSE) });
  }
  talkCamp() {
    const D = this.c.talk, s = this.story, C = this.camp; if (!D || !C || !this.on) return false;
    if (this.bet) return false;
    const t = this.date();
    const ctx = { bet: this.betDay() && t.h >= 16.5 && t.h < 19.5 && !s.has('boys.bet'),
      pan: t.m === 8 && t.d >= 10 && t.d <= 13 && t.h >= 16 && !!this.food() };
    const start = campEntry(s, ctx), next = campStart(s, ctx);
    const run = this.run(CAMP, 'boys', { args: this.args(null, { withFood: !!this.food() }), hooks: this.hooks() });
    run.def = { ...CAMP, nodes: { ...CAMP.nodes, open: { ...CAMP.nodes.open, to: next }, again: { ...CAMP.nodes.again, to: next } } };
    for (const w of ['bob', 'frank', 'denny']) s.meet(w, 'b5:camp');
    return D.open({ speaker: C.people.bob.speaker, name: 'Bob, Frank and Denny', role: '', room: null, start: () => run.node(start), bye: () => (t.h >= 20 ? T(CAMP_BYE) : null) });
  }

  // --- the hooks ------------------------------------------------------------------------------------------------------------
  // Denny's five rings on the Isabella (32 §5.6): "He rings it before the player can say yes."
  rings() {
    const P = this.c.pencil; if (!P || typeof P.ring !== 'function') return 0;
    let n = 0;
    for (const place of RINGS) { try { if (P.ring({ place, by: 'Denny', lead: null })) n++; } catch (e) { console.warn('boys: Denny\'s ring', place, e); } }
    if (n && this.c.hud) this.c.hud.note('Denny pencils it on your map. And this one. And that one.', 4);
    return n;
  }
  // Walt's rule at Carol's counter: coffee and bars for the table, a small sum (32 §5.5.1)
  round() {
    const s = this.story, P = this.c.profile;
    if (P && typeof P.spend === 'function' && P.canAfford(ROUND.price)) P.spend(ROUND.price, 'Walt\'s rule: the round');
    else s.set('boys.round.denny', true, 'b5:round'); // (short of it, Denny's: "I'll get it!" and the round still counts)
    s.set('boys.round', true, 'b5:round');
    return true;
  }
  // Denny's gift: the boys' own permit, Sawbill EP 38 on 8 August, free (32 §5.9.1)
  permit() {
    const P = this.c.permits, t = this.date(); if (!P || typeof P.make !== 'function') return false;
    const abs = absOf(t.year, 8, 8);
    if (abs < (P.today || 0)) return false;
    if ((P.held ? P.held() : []).some((q) => q.ep === SAWBILL && q.abs === abs && q.why === 'boys')) return true;
    const q = P.make({ ep: SAWBILL, abs, price: 0, why: 'boys' });
    try { if (typeof P.emit === 'function') P.emit('bought', { ...q, free: true }); } catch { /* the desk's */ }
    return true;
  }
  // the round at camp: something shared from your pack (32 §5.9.2: bars, chocolate, sausage, a fish or fruit)
  food() {
    const inv = this.c.inventory; if (!inv || typeof inv.reachable !== 'function') return null;
    let best = null;
    for (const c of inv.reachable()) for (const e of c.grid || []) {
      if (e.box) continue; const d = itemDef(e.id); if (!d) continue;
      const fish = /^fish:/.test(e.id) || d.kind === 'fish', ok = fish || ['food', 'snack', 'meal'].includes(d.kind);
      if (!ok) continue;
      const rank = fish ? 0 : /choc/i.test(e.id + d.name) ? 1 : 2;
      if (!best || rank < best.rank) best = { c, e, rank, fish, choc: rank === 1 };
    }
    return best;
  }
  share() {
    const s = this.story, f = this.food(), inv = this.c.inventory; if (!f) return false;
    try { inv.take(f.c.id, f.e.uid, 1); if (typeof inv.write === 'function') inv.write(); inv.emit('items'); } catch (e) { console.warn('boys: the round', e); }
    s.set('boys.round', true, 'b5:share');
    if (this.camp) this.say(this.camp.people.bob.speaker, [f.fish ? SHARE.fish : f.choc ? SHARE.chocolate : SHARE.other]);
    return true;
  }
  panCooked() {
    const s = this.story, C = this.camp, p = this.c.player;
    if (!this.on || !C || !p || !s.has('boys.pan.offered') || s.has('boys.pan') || has(this.c.inventory, ITEM.pan) < 1) return;
    if (Math.hypot(this.site().x - p.x, this.site().z - p.z) > 120) return;
    s.set('boys.pan', true, 'b5:pan');
    this.say(C.people.frank.speaker, PAN_EAT);
  }
  lotLine({ way = [] } = {}) {
    const s = this.story, h = this.c.day ? this.c.day.hours : 12;
    if (!this.on || s.has('frank.lot') || !s.has('frank.met') || !(h >= 21 || h < 5)) return null;
    if (!s.when('t2')) return null;
    if (!(way || []).some((x) => /Ely/.test(String(x)))) return null;
    s.set('frank.lot', true, 'b5:drive');
    return T('32:5.7.lot');
  }

  // --- the slides, after close (32 §5.3) --------------------------------------------------------------------------------------
  slides(st) {
    const D = this.c.talk, s = this.story; if (!D) return false;
    this.note('d95.b5.slides.wall', 4);
    const end = (L) => {
      s.set('carol.slides.done', true, 'b5:slides');
      s.set(`carol.slides.seen.${L.id}`, true, 'b5:slides');
      return { say: T(SLIDES.close), by: 'Carol', choices: [{ text: '…', go: () => { this.wallOff(); return null; } }] };
    };
    const play = (L) => {
      const n = L.empty ? 0 : (L.slides || 8);
      const lines = L.say.map((id) => T(id)).filter(Boolean);
      const step = (i) => {
        // the slides one at a time (E to advance); Carol's lines over the last (or, in the September carousel, from the ninth)
        const at = Math.max(1, L.walt ? Math.min(n, L.walt) : n);
        if (i < at - 1) { this.wall(L, i + 1, n); return { say: '…', filler: true, choices: [{ text: '…', go: () => step(i + 1) }] }; }
        this.wall(L, Math.max(1, at), n);
        const k = i - (at - 1);
        if (k < lines.length - (L.id === '98' ? 1 : 0)) return { say: lines[k], by: 'Carol', choices: [{ text: '…', go: () => step(i + 1) }] };
        if (L.id === '98' && !s.has('boys.slide')) {
          return { say: lines[lines.length - 1], by: 'Carol', choices: [{ text: 'Take the slide.', go: () => { this.takeSlide(); return end(L); } }, { text: '…', go: () => end(L) }] };
        }
        return end(L);
      };
      return step(0);
    };
    const pick = () => ({ say: '…', filler: true, choices: LABELS.map((L) => ({ text: L.label + (s.has(`carol.slides.seen.${L.id}`) ? ' ·' : ''), go: () => play(L) })).concat([{ text: '…', kind: 'bye', go: () => { this.wallOff(); return null; } }]) });
    return D.open({ speaker: st.h.speaker, name: this.nameOf('carol'), role: '', room: st.ep, start: pick, bye: () => { this.wallOff(); return null; } });
  }
  takeSlide() {
    const s = this.story; if (s.has('boys.slide')) return false;
    s.rules.apply({ id: 'b5:slide', then: ['f:boys.slide', `give:item.${ITEM.slide}`] }, {});
    return true;
  }
  // the slide on the wall above the pie case: a projected frame (DOM, under the flag only), the ninth of SEPT 98 the
  // creek mouth under the notch, drawn from the land's own skyline from where Gene stood
  wall(L, i, n) {
    if (typeof document === 'undefined') return;
    let el = this.slideEl;
    if (!el) { el = document.createElement('div'); el.className = 'b5-slide'; el.style.cssText = 'position:fixed;left:50%;top:10%;transform:translateX(-50%);width:min(56vw,640px);aspect-ratio:3/2;background:#111;border:6px solid #e8e0cc;box-shadow:0 0 60px rgba(255,240,200,.35);z-index:40;pointer-events:none;opacity:.94'; document.body.appendChild(el); this.slideEl = el; }
    el.dataset.label = L.id; el.dataset.n = String(i);
    el.innerHTML = this.slideSvg(L, i, n);
  }
  wallOff() { if (this.slideEl) { this.slideEl.remove(); this.slideEl = null; } }
  slideSvg(L, i, n) {
    if (!n) return '<svg viewBox="0 0 300 200" width="100%" height="100%"><rect width="300" height="200" fill="#f4f0e2"/></svg>'; // (an empty carousel: white light)
    const h = (k) => { let a = 0; for (const ch of `${L.id}:${k}`) a = Math.imul(a ^ ch.charCodeAt(0), 2654435761) >>> 0; return a / 4294967296; };
    const sky = ['#9fb8c8', '#b9c6c9', '#c7b79a', '#8ea6b6'][Math.floor(h(1) * 4)], land = '#4c5a3a', water = '#5e7480';
    let ridge = '';
    if (L.walt && i === L.walt) { const pr = this.profile(); ridge = pr ? pr.map((e, k) => `${(k / (pr.length - 1)) * 300},${Math.max(10, 100 - e * 9)}`).join(' ') : ''; }
    if (!ridge) { const pts = []; for (let k = 0; k <= 12; k++) pts.push(`${k * 25},${80 + Math.sin(k * 0.9 + h(i) * 6) * 12 + h(k + i) * 10}`); ridge = pts.join(' '); }
    return `<svg viewBox="0 0 300 200" width="100%" height="100%" style="filter:sepia(.35) saturate(.8)"><rect width="300" height="200" fill="${sky}"/><polygon points="0,200 ${ridge} 300,200" fill="${land}"/><rect y="120" width="300" height="80" fill="${water}" opacity=".85"/></svg>`;
  }

  // --- Gene's slide held up against the view (the silhouette minigame; lock 3 key B) ------------------------------------------
  eyeY(x, z) { const w = this.c.world; let g = 0, l = -1e9; try { g = w.heightAt(x, z); } catch { g = 0; } try { l = w.levelAt(x, z); } catch { l = -1e9; } return Math.max(g, Number.isFinite(l) ? l : -1e9) + 1.2; }
  horizon(eye, bearing) {
    const w = this.c.world; if (!w || typeof w.heightAt !== 'function') return null;
    const y0 = this.eyeY(eye.x, eye.z), out = [], half = (SLIDE.fov / 2) / DEG;
    for (let k = 0; k < SLIDE.cols; k++) {
      const a = bearing - half + (k / (SLIDE.cols - 1)) * 2 * half, sx = Math.sin(a), sz = Math.cos(a);
      let best = -90;
      for (let d = 25; d < 3200; d *= 1.07) { let hgt = 0; try { hgt = w.heightAt(eye.x + sx * d, eye.z + sz * d); } catch { continue; } const e = Math.atan2(hgt - y0, d) * DEG; if (e > best) best = e; }
      out.push(best);
    }
    return out;
  }
  face() { return Math.atan2(SLIDE.toward.x - SLIDE.eye.x, SLIDE.toward.z - SLIDE.eye.z); }
  profile() { if (!this.slideProfile) this.slideProfile = this.horizon(SLIDE.eye, this.face()); return this.slideProfile; }
  view() {
    const ph = this.c.photo, cam = ph && ph.camera, p = this.c.player;
    if (!ph || !ph.raised || !cam) return { x: p ? p.x : 0, z: p ? p.z : 0, bearing: 0, raised: false };
    const dir = new THREE.Vector3(); cam.getWorldDirection(dir);
    return { x: cam.position.x, z: cam.position.z, bearing: Math.atan2(dir.x, dir.z), pitch: Math.asin(Math.max(-1, Math.min(1, dir.y))) * DEG, raised: true };
  }
  slideTick(dt) {
    const s = this.story, p = this.c.player;
    if (!p || !s.has('boys.slide') || s.has('gene.slide.matched') || has(this.c.inventory, ITEM.slide) < 1) { this.slideOff(); return; }
    const near = Math.hypot(SLIDE.eye.x - p.x, SLIDE.eye.z - p.z) < SLIDE.near;
    if (!near) { this.slideOff(); return; }
    if (!this.mg) {
      const M = this.c.minigames, target = { x: SLIDE.eye.x, z: SLIDE.eye.z, face: this.face(), d: SLIDE.d, deg: SLIDE.deg, hold: SLIDE.hold };
      const opts = { target, profile: this.profile(), horizon: (e, b) => this.horizon(e, b), view: () => (this.viewFn ? this.viewFn() : this.view()) };
      this.mg = M && typeof M.start === 'function' ? M.start('silhouette', opts) : null;
      if (!this.mg) return;
    }
    const v = this.viewFn ? this.viewFn() : this.view();
    const r = this.mg.update(dt);
    this.drawRidge(v);
    if (v.raised && !s.has('boys.slide.held')) { s.set('boys.slide.held', true, 'b5:slide'); this.note('d95.b5.slide.hint', 4); }
    if (r && r.done) { this.mg = null; this.slideOff(); }
  }
  slideOff() { if (this.mg) { try { this.mg.cancel(); } catch { /* */ } this.mg = null; } if (this.overlay) { this.overlay.remove(); this.overlay = null; } }
  // the slide's ridge drawn over the camera's frame, where it would lie from here (it meets the real one when you're there)
  drawRidge(v) {
    if (typeof document === 'undefined') return;
    if (!v.raised) { if (this.overlay) { this.overlay.remove(); this.overlay = null; } return; }
    const pr = this.profile(); if (!pr) return;
    let el = this.overlay;
    if (!el) { el = document.createElement('div'); el.className = 'b5-ridge'; el.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:30'; document.body.appendChild(el); this.overlay = el; }
    const cam = this.c.photo && this.c.photo.camera, W = window.innerWidth, H = window.innerHeight;
    const vf = ((cam && cam.fov) || 60) / DEG, hf = 2 * Math.atan(Math.tan(vf / 2) * (W / H)), half = (SLIDE.fov / 2) / DEG, pitch = (v.pitch || 0) / DEG;
    const pts = pr.map((e, k) => { const a = -half + (k / (pr.length - 1)) * 2 * half; const x = W / 2 + Math.tan(a) / Math.tan(hf / 2) * (W / 2); const y = H / 2 - Math.tan(e / DEG - pitch) / Math.tan(vf / 2) * (H / 2); return `${x.toFixed(0)},${y.toFixed(0)}`; }).join(' ');
    const ok = this.mg && this.mg.state && this.mg.state.score > 0.7;
    el.innerHTML = `<svg width="${W}" height="${H}"><polyline points="${pts}" fill="none" stroke="${ok ? '#f3e6b0' : '#e8e0cc'}" stroke-opacity="${ok ? 0.9 : 0.55}" stroke-width="2" stroke-dasharray="${ok ? '' : '6 5'}"/></svg>`;
  }

  makeDebug() {
    const self = this;
    return {
      stage(who, id = null) { const R = CAST[who]; const slot = R && (R.where.find((w) => w.id === id) || R.where[0]); const L = slot && storeLayout(self.epOf(slot.at)); if (!L) return null; self.unstage(who); return self.stage(who, slot, L) ? self.staged() : null; },
      talk: (who) => self.talk(who),
      yard: () => self.talkYard(),
      camp: () => self.talkCamp(),
      bet: () => self.startBet(),
      endBet: () => self.endBet(false),
      bet98: () => self.tell98(),
      state: () => ({ bet: self.bet ? { ...self.bet, boat: !!self.bet.boat } : null, camp: !!self.camp, yard: !!self.yard, mg: self.mg ? { ...self.mg.state } : null, hole: self.holeAt || null }),
      // drive the silhouette with a given view (x, z, bearing in rad; raised): the rig's stand-in for the camera
      view(v) { self.viewFn = v ? () => ({ raised: true, pitch: 0, ...v }) : null; return true; },
      slideTarget: () => ({ ...SLIDE.eye, face: self.face(), profile: self.profile() }),
    };
  }
}

export const boysCast = new BoysCast();
export { BoysCast };
