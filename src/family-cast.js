// The family in the world (campaign Round 6, stream a4; docs/story/33-family.md): Aili's motel beside the Little
// Vermilion store (family-props.js) and Aili behind her counter by her calendar (Mondays in Cook: "Back at 4"), Jon at the
// dock below the back porch at dusk and at the outfitter's dock of a morning, Liisa at the outfitter's counter in her
// season, Gord on Thursdays at the outfitter's dock with his boat tied; Jon's Sand Point chase (stream m's motorboat in
// trail mode: islands, wind, narrows; the line is DLC) and the rented boat at anchor in the lee; the can on the back
// porch (grounds-bound: "Not mine to take.") and the climax with Aili home early (ten real seconds of nothing takes the
// second branch); Danielle at the Sucker end of Prairie Portage and the Carp end's stump and cairn (re-sited off the
// Quetico side: docs/story/dlc-quetico.md). The scenes are story-data/family.js's, played by topics.js SceneRun.
// Loaded only under STORY_ON (main.js's a4 block). A co-op guest's story is a mirror: nobody is staged for them.
//
//   familyCast.attach({ story, cast, npcs, talk, topics, outfitter, player, day, world, scene, tiles, actors, pointer, hud,
//                       layer, profile, inventory, pencil, motorboat, photo, show, veil, texts, trip, wind })
//   familyCast.update(dt)               the motel and the people by their schedules, the can, the chase, the far places
//   familyCast.talk(who, o) → bool      E on Aili, Jon, Liisa, Gord or Danielle
//   familyCast.staged() · familyCast.debug { stage(who), chase(o), porch(), can(), carp(), danielle(), state() }
import * as THREE from 'three';
import { SceneRun, T } from './topics.js';
import { storeLayout } from './props.js';
import { propMaterial } from './prop-kit.js';
import { registerSensor } from './story-cond.js';
import { CAST } from './story-data/cast.js';
import { defineItem } from './items.js';
import { show } from './show.js';
import { FieldPerson } from './kettle.js';
import { fkit, MOTEL } from './family-props.js';
import { rngFor } from './story-props.js';
import { AILI, PORCH, JON, LIISA, GORD, DANIELLE, ailiEntry, jonEntry, liisaEntry, gordEntry, danielleEntry, ailiStep, nextStory, liisaReady, OPENERS, WANTS, A4_SENSORS, DRAFT, PLACES, SCHEDULE } from './story-data/family.js';

for (const [k, v] of Object.entries(A4_SENSORS)) registerSensor(k, v);
const EP = PLACES.ep, NEAR = 160, TICK = 0.5, CAN_R = 32, PORCH_R = 2.6, SILENCE = 10;
const SCENES = { aili: AILI, jon: JON, liisa: LIISA, gord: GORD, danielle: DANIELLE };
const today = (s) => Math.floor(s.nowAbs());

// the build drafts as words: topics.js T (texts) and the casebook's words.js (addWords), once
let drafted = false;
async function addDrafts(texts) {
  if (drafted) return; drafted = true;
  try { if (texts && typeof texts.add === 'function') texts.add({ text: DRAFT }); } catch (e) { console.warn('family: drafts', e); }
  try { const W = await import('./story-data/words.js'); if (typeof W.addWords === 'function') W.addWords(DRAFT); } catch (e) { console.warn('family: words', e); }
}
// the arc's things: the guest book (a book item: W. Helstrom's name in it), the coffee can (it never leaves the lot)
let itemsDone = false;
function defineFamilyItems() {
  if (itemsDone) return; itemsDone = true;
  defineItem({ id: 'guestbook', name: 'Guest book', short: 'Guest book', kind: 'gear', w: 2, h: 2, kg: 0.6, price: 0, sold: false, unique: true, identity: '', story: 'a4' });
  defineItem({ id: 'coffeecan', name: 'Coffee can', short: 'Can', kind: 'gear', w: 1, h: 2, kg: 0.3, price: 0, sold: false, unique: true, identity: '', story: 'a4' });
}

class FamilyCast {
  constructor() { this.c = {}; this.live = new Map(); this.t = 0; this.motel = null; this.offs = []; this.can = null; this.chase = null; this.far = new Map(); this.dani = null; this.debug = this.makeDebug(); this.porchRun = null; }
  attach(c = {}) {
    Object.assign(this.c, c);
    const s = this.c.story;
    if (!s) return this;
    defineFamilyItems();
    addDrafts(this.c.texts);
    const season = () => (s.doc && s.doc.season) || null;
    const ppl = () => (s.doc && s.doc.ppl && s.doc.ppl.aili) || {};
    this.offs.push(s.sensor('ailistep', () => ailiStep(s, season())));
    this.offs.push(s.sensor('ailialive', () => { const p = ppl(); return p.aliveSeason === season() ? (p.alive || 0) : 0; }));
    this.offs.push(s.sensor('ailishut', () => ppl().shut === today(s)));
    this.offs.push(s.sensor('liisanext', (arg) => nextStory(s, (nb) => s.nbHas('read', nb)) === arg));
    this.offs.push(s.sensor('liisaready', () => liisaReady(s)));
    this.offs.push(s.sensor('monday', () => s.when(SCHEDULE.aili.cook)));
    this.offs.push(s.sensor('chased', () => !!this.chase));
    this.offs.push(s.sensor('shook', (arg) => s.get('jon.chase') === arg));
    this.offs.push(s.on('season', () => this.clear()));
    // the gifts she never asked for (show.js): the June print at Mummo's, June's pot (33 §6.4)
    for (const w of WANTS) this.offs.push(show.want({ id: `family:${w.gift}`, who: 'aili', print: w.print, item: w.item, give: w.give !== false && !!w.item, when: w.when, to: w.to, run: () => {} }));
    this.offs.push(show.talker('aili', (o = {}) => this.talk('aili', o)));
    // the rented boat in a picture: Jon's second boat (33 §6.7 "The camera can photograph it. Nothing in the game points at it.")
    const P = this.c.photo;
    if (P && typeof P.onShot === 'function') this.offs.push(P.onShot((ev) => this.shot(ev)));
    return this;
  }
  get story() { return this.c.story || null; }
  get on() { const s = this.story; return !!(s && s.doc && s.mode !== 'mirror'); }
  season() { const s = this.story; return (s && s.doc && s.doc.season) || null; }
  args() { const n = this.c.cast; return n && typeof n.args === 'function' ? n.args(EP) : { ep: EP }; }
  nameOf(who) { const R = CAST[who], s = this.story; if (!R) return who; return !R.known || (s && s.has(R.known)) ? R.first : R.unknown || R.first; }

  // --- the frame ------------------------------------------------------------------------------------------------------
  update(dt) {
    if (!this.on) { if (this.live.size || this.motel) this.clear(); return; }
    this.t += dt;
    if (this.t < TICK) return;
    this.t = 0;
    const p = this.c.player; if (!p) return;
    try { this.canTick(p); } catch (e) { this.warn('can', e); }
    try { this.chaseTick(p); } catch (e) { this.warn('chase', e); }
    try { this.farTick(p); } catch (e) { this.warn('far', e); }
    const L = storeLayout(EP);
    if (!L) { if (this.live.size || this.motel) this.clear(); return; }
    const d = Math.hypot(L.centre.x - p.x, L.centre.z - p.z);
    if (d > NEAR + 40) { if (this.live.size || this.motel) this.clear(); return; }
    if (d > NEAR) return;
    this.buildMotel(L);
    const s = this.story, a = this.args();
    for (const who of ['aili', 'jon', 'liisa', 'gord']) {
      const R = CAST[who], cur = this.live.get(who);
      let slot = R.where.find((w) => s.when(w.when, a));
      if (who === 'aili' && this.porchRun) slot = null; // (she is on the porch)
      if (cur && (!slot || slot.id !== cur.slot.id) && !this.talkingTo(cur)) this.unstage(who);
      if (slot && !this.live.has(who)) this.stage(who, slot, L);
    }
    this.gordBoat(L);
    this.motelState();
    // the porch light seen at night: the porch light topic opens (33 §6.3 "After the player has been here at night once")
    if (s.when('dark') && !s.has('aili.night')) s.set('aili.night', true, 'a4:night');
  }
  warn(what, e) { if (!this.warned) { this.warned = true; console.warn('family:', what, e); } }

  // --- the motel ----------------------------------------------------------------------------------------------------------
  // beside the store on its own lot: tried at either side, 16 and 22 m out, on dry ground; its back to the water
  site(L) {
    if (this.siteOf && this.siteOf.L === L) return this.siteOf.at;
    const w = this.c.world, A = L.axes.a, B = L.axes.b, C0 = L.centre;
    const dock = L.dockDeck || L.dockFoot || C0, back = { x: C0.x - dock.x, z: C0.z - dock.z }, bl = Math.hypot(back.x, back.z) || 1;
    const fz = { x: back.x / bl, z: back.z / bl }, fx = { x: fz.z, z: -fz.x }; // the motel's front (+z) faces away from the water; +x along it (a mesh turned by rotation.y = atan2(-fx.z, fx.x) has exactly these axes)
    const dry = (x, z) => !(w && typeof w.isWater === 'function' && w.isWater(x, z));
    let best = null;
    for (const side of [1, -1]) for (const dist of [16 + L.size.hW, 22 + L.size.hW, 28 + L.size.hW]) {
      const o = { x: C0.x + A.x * side * dist, z: C0.z + A.z * side * dist };
      let ok = true;
      for (const [u, v] of [[-9, -4], [9, -4], [-9, 4], [9, 4], [6.5, -7]]) if (!dry(o.x + fx.x * u + fz.x * v, o.z + fx.z * u + fz.z * v)) { ok = false; break; }
      if (ok) { best = o; break; }
    }
    if (!best) best = { x: C0.x + A.x * (16 + L.size.hW), z: C0.z + A.z * (16 + L.size.hW) };
    void B;
    const at = { ...best, fx, fz, y: this.ground(best.x, best.z), rot: Math.atan2(-fx.z, fx.x) };
    this.siteOf = { L, at };
    return at;
  }
  ground(x, z) { const t = this.c.tiles; try { return t && typeof t.groundAt === 'function' ? t.groundAt(x, z) : 0; } catch { return 0; } }
  // a point in the motel's frame (x along its length, z toward its front)
  W(u, v, at = this.site(storeLayout(EP))) { return { x: at.x + at.fx.x * u + at.fz.x * v, z: at.z + at.fx.z * u + at.fz.z * v, y: at.y }; }
  heading(du, dv, at = this.site(storeLayout(EP))) { const dx = at.fx.x * du + at.fz.x * dv, dz = at.fx.z * du + at.fz.z * dv; return Math.atan2(-dz, dx); }
  buildMotel(L) {
    if (this.motel && this.motel.L === L) return;
    this.dropMotel();
    const sc = this.c.scene; if (!sc) return;
    const at = this.site(L);
    this.motel = { L, at, mesh: null, board: null, key: '' };
    const k = fkit('cleanBoard'), r = k && k.build({ rng: rngFor('a4.board') });
    if (r && r.geo) { const m = new THREE.Mesh(r.geo, propMaterial()), q = this.W(MOTEL.dock.x, MOTEL.dock.z + 3, at); m.position.set(q.x, this.ground(q.x, q.z), q.z); m.rotation.y = at.rot; m.matrixAutoUpdate = false; m.updateMatrix(); m.updateMatrixWorld(true); sc.add(m); this.motel.board = m; }
    // the motel's dot: its sign, read off the front (the pointer's: a target that has no verb)
    const P = this.c.pointer;
    if (P && typeof P.register === 'function' && !this.motel.off) this.motel.off = P.register((ray, near) => this.motelDot(near));
    this.motelState(true);
  }
  // the prop states (33 §10): the porch light, June's pot on the counter, the lilac print on the wall, the can on the shelf
  motelState(force = false) {
    const M = this.motel, s = this.story; if (!M) return;
    const o = { light: !!s.when('dark') && s.get('end') !== 'JN', pot: s.get('aili.pot') === 'kept', print: s.has('aili.print'), can: !s.has('aili.house') && !this.can };
    const key = JSON.stringify(o);
    if (!force && key === M.key) return;
    M.key = key;
    if (M.mesh) { if (M.mesh.parent) M.mesh.parent.remove(M.mesh); M.mesh.geometry.dispose(); M.mesh = null; }
    const k = fkit('motel'), r = k && k.build({ rng: rngFor('a4.motel'), opts: o }); if (!r || !r.geo || !this.c.scene) return;
    const m = new THREE.Mesh(r.geo, propMaterial()); m.name = 'a4 motel';
    m.position.set(M.at.x, M.at.y, M.at.z); m.rotation.y = M.at.rot; m.castShadow = true; m.receiveShadow = true;
    m.matrixAutoUpdate = false; m.updateMatrix(); m.updateMatrixWorld(true); this.c.scene.add(m); M.mesh = m;
  }
  motelDot(near) {
    const M = this.motel, p = this.c.player; if (!M || !p || p.onFoot === false) return null;
    const out = [], q = this.W(MOTEL.room ? 9 - MOTEL.room + 2.1 : 0, MOTEL.D / 2 + 0.3, M.at), hit = near.flat(q.x, q.z) < 9 ? near.sphere(q.x, M.at.y + MOTEL.H + 0.2, q.z, 1.2) : null;
    if (hit) out.push({ dist: hit.t, miss: hit.miss, target: { kind: 'prop', ref: 'story:a4.motel', label: T('a4:dot.motel') || 'MOTEL · BAIT · COFFEE', e: null } });
    // Mondays 9–16, the door sign (33 §3): "Back at 4"
    const s = this.story;
    if (s && s.when(SCHEDULE.aili.cook)) { const d = this.W(9 - MOTEL.room + 2.1, MOTEL.D / 2 + 0.2, M.at), h = near.flat(d.x, d.z) < 4 ? near.sphere(d.x, M.at.y + 1.4, d.z, 0.6) : null; if (h) out.push({ dist: h.t, miss: h.miss, target: { kind: 'prop', ref: 'story:a4.sign', label: T('a4:dot.sign') || 'Back at 4', e: null } }); }
    return out.length ? out : null;
  }
  dropMotel() {
    const M = this.motel; if (!M) return;
    for (const m of [M.mesh, M.board]) if (m) { if (m.parent) m.parent.remove(m); m.geometry.dispose(); }
    if (M.off) { try { M.off(); } catch { /* gone */ } }
    this.motel = null;
  }

  // --- the people ---------------------------------------------------------------------------------------------------------
  spotOf(at, who, L) {
    const M = this.site(L);
    if (at === 'a4:counter') { const q = this.W(MOTEL.aili.x, MOTEL.aili.z, M); return { ...q, y: M.y + 0.1, heading: this.heading(0, 1, M) }; }
    if (at === 'a4:jondock') { const q = this.W(MOTEL.dock.x + 0.6, MOTEL.dock.z + 3, M); return { ...q, y: undefined, heading: this.heading(0, -1, M) }; }
    if (at === 'a4:porch') { const q = this.W(MOTEL.porch.x - 0.6, MOTEL.porch.z + 0.2, M); return { ...q, y: M.y + 0.18, heading: this.heading(0, -1, M) }; }
    if (at === 'a4:counter12' && L.counter) { const A = L.axes.a; return { x: L.counter.x - A.x * 1.1, z: L.counter.z - A.z * 1.1, y: L.floorY, heading: L.counter.heading }; }
    if (at === 'a4:dock12' && L.dockDeck) { const h = L.dockHeading || 0, fx = Math.cos(h), fz = -Math.sin(h); return { x: L.dockDeck.x + fx * 1.2, z: L.dockDeck.z + fz * 1.2, y: L.dockDeck.y, heading: h + Math.PI }; }
    return null;
  }
  stage(who, slot, L) {
    const n = this.c.npcs, R = CAST[who], spot = this.spotOf(slot.at, who, L);
    if (!n || !spot || typeof n.standAt !== 'function') return null;
    let h = null;
    try { h = n.standAt(spot, { key: `cast:${who}:${EP}`, name: this.nameOf(who), role: '', look: R.look, ep: EP, talk: () => (this.talk(who) ? true : null) }); } catch (e) { console.warn('family: stage', who, e); }
    if (!h) return null;
    const st = { who, slot, h, x: spot.x, z: spot.z, talked: false };
    this.live.set(who, st);
    return st;
  }
  unstage(who) { const st = this.live.get(who); if (!st) return; this.live.delete(who); try { if (st.h && typeof st.h.remove === 'function') st.h.remove(); } catch { /* gone */ } }
  clear() { for (const who of [...this.live.keys()]) this.unstage(who); this.dropMotel(); this.dropGordBoat(); }
  talkingTo(st) { const t = this.c.talk; return !!(t && t.convo && t.convo.speaker && st.h && t.convo.speaker.key === (st.h.speaker && st.h.speaker.key)); }
  staged() { return [...this.live.values()].map((st) => ({ who: st.who, slot: st.slot.id, at: st.slot.at, x: +st.x.toFixed(1), z: +st.z.toFixed(1) })).concat(this.dani ? [{ who: 'danielle', slot: 'landing', at: 'a4:prairie', x: +this.dani.x.toFixed(1), z: +this.dani.z.toFixed(1) }] : []); }
  // Gord's boat tied at the outfitter's dock while he is in (33 §6.13): the motorboat actor, still, no driver
  gordBoat(L) {
    const want = this.live.has('gord') && L.dockBerths && L.dockBerths[2], MB = this.c.motorboat;
    if (!want || !MB) { this.dropGordBoat(); return; }
    if (this.gordMb) return;
    const B = L.dockBerths[2].side, mb = MB.spawn({ kind: 'tow', at: { x: B.x, z: B.z }, heading: (L.dockHeading || 0) + Math.PI / 2, driver: false, force: true, key: 'a4:gord' });
    if (mb && !mb.why) { if (typeof mb.anchor === 'function') mb.anchor(); this.gordMb = mb; }
  }
  dropGordBoat() { const mb = this.gordMb; if (mb) { try { mb.remove(); } catch { /* gone */ } } this.gordMb = null; }

  // --- their scenes ---------------------------------------------------------------------------------------------------------
  run(def, who, ctx = {}) { const n = this.c.npcs; return new SceneRun(this.c.topics, def, { who, args: { ...this.args(), ...(ctx.args || {}) }, mark: n && n.mark ? (t) => n.mark(t) : null, ...ctx }); }
  visit() {
    // each day you talk to her counts once (33 §5 "What helps"); a second day's is step 1's other way in
    const s = this.story, p = s.person('aili', 'met', '+', 0, 'a4:visit'); if (!p) return;
    const d = today(s);
    if (p.dayAt !== d) { p.dayAt = d; p.days = (p.days || 0) + 1; s.dirty(); }
    if (p.days >= 2 && !s.has('aili.day2')) s.set('aili.day2', true, 'a4:visit');
  }
  ailiCtx(o = {}) {
    const s = this.story, p = (s.doc && s.doc.ppl && s.doc.ppl.aili) || {}, cast = this.c.cast;
    return { carrying: !!(cast && typeof cast.carrying === 'function' && cast.carrying()), nightOne: s.has('nb.found'), gift: o.gift || null, shut: p.shut === today(s), season: this.season() };
  }
  talk(who, o = {}) {
    if (!this.on) return false;
    const s = this.story, D = this.c.talk; if (!D) return false;
    const st = this.live.get(who); if (!st) return false;
    const def = SCENES[who]; if (!def) return false;
    let start = null, gift = o.give ? (o.give.item ? 'pot' : 'print') : null;
    const cold = s.get('choice.aili') === 'know' && ((s.doc.ppl.aili || {}).coldSeason === this.season());
    if (who === 'aili') { start = ailiEntry(s, this.ailiCtx({ gift })); }
    else if (who === 'jon') start = jonEntry(s, { coldSeason: cold, saturday: s.when('dow:sat'), saunaSaid: s.has('jon.sauna') });
    else if (who === 'liisa') start = liisaEntry(s, { monday: s.when(SCHEDULE.aili.cook), nextSeason: s.has('end') && (s.fact('end') || {}).abs != null && s.nowAbs() - s.fact('end').abs > 120 });
    else if (who === 'gord') start = gordEntry(s);
    if (!start) return false;
    st.talked = true; s.meet(who, 'a4');
    if (who === 'aili') { this.visit(); if (start === 'sit' || start === 'coffee') this.opener = null; }
    if (who === 'jon' && start === 'sauna') s.set('jon.sauna', true, 'a4');
    const run = this.run(def, who, { vars: this.vars(), hooks: this.hooks(who), ...(who === 'aili' ? { show: (r, from) => show.choice('aili', r, from) } : {}) });
    const first = () => {
      if (who === 'aili' && o.give) return show.answer(o.give, { kind: 'item', id: o.give.item }, () => run.choices(start), () => run.node(o.give.to || start));
      return this.pickWrap(run.node(start), who);
    };
    return D.open({ speaker: st.h.speaker, name: this.nameOf(who), role: '', room: EP, start: first, bye: () => null });
  }
  vars() {
    const s = this.story, w = this.c.world, c = this.chaseEnd;
    let site = 'that site';
    if (c && w && Array.isArray(w.campsites)) { let best = null; for (const q of w.campsites) { const d = Math.hypot(q.x - c.x, q.z - c.z); if (d < 2500 && (!best || d < best.d)) best = { d, q }; } if (best && best.q.name) site = best.q.name; }
    return { site, lake: (s && s.doc && s.doc.ppl && s.doc.ppl.jon && s.doc.ppl.jon.told) || 'Sand Point' };
  }
  // Jon's "Where are you headed next?": a real lake picked on the map (the canary, honestly: bible 5.7)
  pickWrap(node, who) {
    if (who !== 'jon' || !node || !Array.isArray(node.choices)) return node;
    const ask = T('33:6.8.c12'), s = this.story;
    node.choices = node.choices.map((ch) => (ch.text === ask ? { ...ch, pick: 'lake', go: ((g) => (a) => { if (a && a.name) s.person('jon', 'told', '=', String(a.name), 'a4:canary'); return g(); })(ch.go) } : ch));
    return node;
  }
  hooks(who) {
    const s = this.story, season = this.season();
    const aili = () => s.person('aili', 'met', '+', 0, 'a4');
    return {
      opener: () => OPENERS[s.hash(`a4open:${today(s)}`) % OPENERS.length],
      // "Did Walt drown?": the first ask this season is answered narrowly; the second, "That's twice." and the day shut;
      // the third drops her a step for three game days (33 §5)
      alive: () => { const p = aili(); if (p.aliveSeason !== season) { p.aliveSeason = season; p.alive = 0; } p.alive = (p.alive || 0) + 1; if (p.alive >= 2) p.shut = today(s); if (p.alive >= 3) p.drop = s.nowAbs() + 3; s.dirty(); if (p.alive >= 2) setTimeout(() => this.closeTalk(), 2500); },
      shut: () => { const p = aili(); p.shut = today(s); s.dirty(); },
      keepPot: () => { const inv = this.c.inventory; try { if (inv && inv.remove('junespot', 1) && typeof inv.write === 'function') inv.write(); } catch { /* not carried */ } this.motelState(true); },
      cold: () => { const p = aili(); p.coldSeason = season; s.dirty(); },
      sit: () => { const h = this.c.hud; if (h) h.note('She pours a second cup, comes round the counter and sits on the stool beside you. Neither of you says anything.', 9); },
      // Liisa takes you out the side door, across the gravel, onto the motel's back porch
      porch: () => { setTimeout(() => this.toPorch(), 50); },
      holdCan: () => { this.holdCan(); },
      canBack: () => { this.dropCan(); this.motelState(true); },
      canTaken: () => { this.dropCan(); this.motelState(true); },
      pick: () => {},
    };
  }
  closeTalk() { const D = this.c.talk; try { if (D && typeof D.close === 'function') D.close(); } catch { /* gone */ } }

  // --- the can (33 §6.9–6.10) -----------------------------------------------------------------------------------------------
  porchSpot() { const L = storeLayout(EP); if (!L) return null; const M = this.site(L), q = this.W(MOTEL.porch.x + 0.4, MOTEL.porch.z - 0.4, M); return { ...q, heading: this.heading(0, 1, M) }; }
  toPorch() {
    const p = this.c.player, q = this.porchSpot(); if (!p || !q) return;
    const go = () => { this.place(q.x, q.z, q.heading); };
    const V = this.c.veil;
    if (V && typeof V.card === 'function') V.card({ fadeIn: 0.5, hold: 0.4, fadeOut: 0.6, onDark: go }); else go();
  }
  place(x, z, heading) {
    const p = this.c.player; if (!p) return;
    try {
      p.landing = null; p.ashore = null; p.swim = null; p.speed = 0; p.yawRate = 0; if (p.mode !== 'walk' && p.onFoot === false) return;
      p.x = x; p.z = z; p.heading = heading;
      if (typeof p.groundAt === 'function') p.foot = { y: p.groundAt(x, z), vy: 0, air: false, t: 0, land: 0, near: null };
      if (typeof p.placeOnGround === 'function') p.placeOnGround();
    } catch (e) { console.warn('family: place', e); }
  }
  holdCan() {
    const inv = this.c.inventory;
    try { if (inv && typeof inv.give === 'function') inv.give('coffeecan'); } catch { /* the hands are full: the can is held all the same */ }
    this.can = { since: this.story.nowAbs(), left: false, warned: 0 };
    this.motelState(true);
  }
  dropCan() {
    const inv = this.c.inventory;
    try { if (inv && typeof inv.remove === 'function') inv.remove('coffeecan', 1); if (inv && typeof inv.write === 'function') inv.write(); } catch { /* gone */ }
    this.can = null;
  }
  canTick(p) {
    const C = this.can; if (!C) return;
    const q = this.porchSpot(); if (!q) return;
    const d = Math.hypot(p.x - q.x, p.z - q.z);
    // it cannot leave the motel's lot: walking toward the road or the dock with it is refused with one short thought
    if (d > CAN_R) {
      const k = (CAN_R - 1.5) / d;
      this.place(q.x + (p.x - q.x) * k, q.z + (p.z - q.z) * k, p.heading);
      if (this.c.hud && performance.now() - (C.warned || 0) > 4000) { C.warned = performance.now(); this.c.hud.note(T('33:6.9.thought') || 'Not mine to take.', 3); }
      C.left = true;
      return;
    }
    if (d > 6) C.left = true;
    // stepping back onto the porch to put it on the shelf (any time that Monday): Aili is home early
    if (C.left && d < PORCH_R && !this.porchRun) this.climax();
  }
  climax() {
    const s = this.story, D = this.c.talk, L = storeLayout(EP); if (!D || !L) return false;
    this.unstage('aili');
    const spot = this.spotOf('a4:porch', 'aili', L), n = this.c.npcs;
    let h = null;
    try { h = n.standAt(spot, { key: `cast:aili:${EP}`, name: this.nameOf('aili'), role: '', look: CAST.aili.look, ep: EP, talk: () => null }); } catch (e) { console.warn('family: porch', e); }
    if (!h) return false;
    const st = { who: 'aili', slot: { id: 'porch', at: 'a4:porch' }, h, x: spot.x, z: spot.z };
    this.porchRun = st;
    let picked = false;
    const run = this.run(PORCH, 'aili', { hooks: this.hooks('aili'), onEnd: () => { this.porchEnd(); } });
    const wrap = (node) => { if (node && Array.isArray(node.choices)) node.choices = node.choices.map((ch) => ({ ...ch, go: (...a) => { picked = true; return ch.go(...a); } })); return node; };
    D.open({ speaker: h.speaker, name: this.nameOf('aili'), role: '', room: EP, start: () => wrap(run.node('can')), bye: () => { if (!picked) { picked = true; this.held(run); } return null; } });
    // ten real seconds of nothing: the player simply holds out the can, and she says "Thank you."
    this.silence = setTimeout(() => { if (picked) return; picked = true; this.closeTalk(); this.held(run); }, SILENCE * 1000);
    void s;
    return true;
  }
  held(run) {
    const D = this.c.talk, st = this.porchRun; if (!st) return;
    run.act(PORCH.nodes.held.then);
    try { if (D && typeof D.bark === 'function') D.bark(st.h.speaker, T('33:6.10.3')); } catch { /* not drawn */ }
    setTimeout(() => this.porchEnd(), 3000);
  }
  porchEnd() { if (this.silence) clearTimeout(this.silence); this.silence = null; const st = this.porchRun; this.porchRun = null; if (st) { try { st.h.remove(); } catch { /* gone */ } } }

  // --- Jon's Sand Point chase (33 §6.7; stream m's motorboat, trail mode) ---------------------------------------------------
  // tier 2 or higher; Jon met; a trip on and you on the water at King Williams Narrows or Sand Point: his grey boat comes out
  // of a bay as you pass and settles in 300–500 m behind. Lost (islands, the lee, a narrows) or peeled off at dusk
  chaseTick(p) {
    const s = this.story, MB = this.c.motorboat;
    if (this.chase) { this.chaseWatch(p); return; }
    if (!MB || s.has('jon.chase') || !s.has('jon.met') || s.tier < 2 || s.has('jon.won')) return;
    const trip = this.c.trip; if (trip && !trip.active) return;
    if (p.onFoot !== false && p.mode !== 'paddle') return;
    const dK = Math.hypot(p.x - PLACES.kwn.x, p.z - PLACES.kwn.z), dS = Math.hypot(p.x - PLACES.sandpoint.x, p.z - PLACES.sandpoint.z);
    if (dK > 900 && dS > PLACES.sandpoint.r) return;
    this.startChase(p);
  }
  startChase(p, o = {}) {
    const MB = this.c.motorboat, s = this.story; if (!MB) return null;
    // out of a bay behind you, about 450 m back along your wake (on water: the first of a few bearings that is)
    const w = this.c.world, h = p.heading || 0, back = { x: -Math.cos(h), z: Math.sin(h) };
    let at = null;
    for (const turn of [0, 0.5, -0.5, 1, -1, 1.6, -1.6]) { const c = Math.cos(turn), sn = Math.sin(turn), d = { x: back.x * c - back.z * sn, z: back.x * sn + back.z * c }, q = { x: p.x + d.x * 450, z: p.z + d.z * 450 }; if (!w || typeof w.isWater !== 'function' || w.isWater(q.x, q.z)) { at = q; break; } }
    if (!at) return null;
    const mb = MB.spawn({ kind: 'guide', at, driver: { look: CAST.jon.look, name: 'Jon' }, force: !!o.force, key: 'a4:jon' });
    if (!mb || mb.why) return null;
    const home = PLACES.crane;
    mb.trail('player', { near: 300, far: 500, lose: 120, home: { x: home.x, z: home.z } });
    this.chase = { mb, t0: s.nowAbs() };
    // lost behind the islands, or in the lee of a blow; stopped at a narrows too thin for the motor (or a line); never
    // shaken, it peels off at dusk toward Crane (no fail)
    const off = [];
    off.push(mb.on('lost', (e) => this.endChase(e && e.why === 'wind' ? 'wind' : 'islands')));
    off.push(mb.on('peel', () => this.endChase('dusk')));
    off.push(mb.on('stopped', (e) => this.endChase(e && e.why === 'line' ? 'line' : 'narrows')));
    this.chase.off = off;
    // the second boat (tier 2+): a rented aluminium boat at anchor in the lee of a mid-lake island, two men, no rods
    if (!this.rented) { const r = MB.spawn({ kind: 'rented', at: { x: PLACES.lee.x, z: PLACES.lee.z }, driver: { name: '' }, force: true, key: 'a4:rented' }); if (r && !r.why) { r.anchor(); this.rented = r; } }
    return this.chase;
  }
  // (the motorboat's own trail decides; a chase whose boat went away some other way ends as followed)
  chaseWatch(p) { const C = this.chase; if (C && C.mb && C.mb.removed) this.endChase('dusk'); void p; }
  endChase(how) {
    const C = this.chase, s = this.story, p = this.c.player; if (!C) return;
    this.chase = null;
    for (const f of C.off || []) { try { f(); } catch { /* gone */ } }
    this.chaseEnd = p ? { x: p.x, z: p.z } : null;
    if (!s.has('jon.chase')) s.set('jon.chase', how || 'followed', 'a4:chase');
    // he peels off toward Crane (lost or not); gone when out of sight
    setTimeout(() => { try { C.mb.remove(); } catch { /* gone */ } }, how === 'dusk' ? 90000 : 30000);
    if (this.rented) { const r = this.rented; this.rented = null; setTimeout(() => { try { r.remove(); } catch { /* gone */ } }, 60000); }
  }
  shot(ev) {
    const r = this.rented, s = this.story; if (!r || !ev || !ev.eye || !ev.dir || s.has('jon.second')) return;
    const dx = r.x - ev.eye.x, dz = r.z - ev.eye.z, d = Math.hypot(dx, dz); if (d > 900 || d < 1) return;
    const cos = (dx * ev.dir.x + dz * ev.dir.z) / (d * Math.hypot(ev.dir.x, ev.dir.z) || 1);
    if (cos > Math.cos(((ev.fov || 50) / 2) * Math.PI / 180) * 0.98) s.set('jon.second', true, 'a4:photo');
  }

  // --- the far places: Danielle at the Sucker end of Prairie Portage; the Carp end's stump and cairn -------------------------
  dryNear(x, z, r = 30) {
    const w = this.c.world; if (!w || typeof w.isWater !== 'function') return { x, z };
    if (!w.isWater(x, z)) return { x, z };
    for (let d = 3; d <= r; d += 3) for (let k = 0; k < 12; k++) { const a = (k / 12) * Math.PI * 2, qx = x + Math.cos(a) * d, qz = z + Math.sin(a) * d; if (!w.isWater(qx, qz)) return { x: qx, z: qz }; }
    return { x, z };
  }
  farTick(p) {
    const s = this.story;
    // Danielle (re-sited: dlc-quetico.md), by her schedule, while you are within 260 m
    const P = PLACES.prairie, dP = Math.hypot(p.x - P.x, p.z - P.z), here = dP < 260 && s.when(CAST.danielle.where[0].when);
    if (here && !this.dani) {
      const q = this.dryNear(P.x, P.z);
      this.dani = new FieldPerson(this.c, 'danielle', { x: q.x + 2, z: q.z + 2, heading: Math.atan2(-(P.z - q.z), P.x - q.x), name: this.nameOf('danielle') });
      this.dani.onTalk = (f) => this.talkField(f, DANIELLE, danielleEntry(s));
    } else if (!here && this.dani && !this.dani.talking) { this.dani.remove(); this.dani = null; }
    // the Carp end: the stump with the clean ring and the cairn, built within 320 m
    const Cp = PLACES.carp, dC = Math.hypot(p.x - Cp.x, p.z - Cp.z);
    if (dC < 320 && !this.far.has('carp')) this.buildCarp();
    else if (dC > 420 && this.far.has('carp')) this.dropFar('carp');
  }
  talkField(f, def, start) {
    const D = this.c.talk, s = this.story; if (!D || !start) return false;
    s.meet(def.who, 'a4');
    const run = this.run(def, def.who, { hooks: this.hooks(def.who), onEnd: () => { f.talking = false; } });
    f.talking = true;
    return D.open({ speaker: f.speaker, name: this.nameOf(def.who), role: '', room: null, start: () => run.node(start), bye: () => { f.talking = false; return null; } });
  }
  buildCarp() {
    const sc = this.c.scene; if (!sc) return;
    const q = this.dryNear(PLACES.carp.x, PLACES.carp.z), meshes = [], dots = [];
    const put = (name, x, z, label, fact) => {
      const k = fkit(name), r = k && k.build({ rng: rngFor(`a4.${name}`) }); if (!r || !r.geo) return;
      const y = this.ground(x, z), m = new THREE.Mesh(r.geo, propMaterial()); m.name = `a4 ${name}`; m.position.set(x, y, z); m.castShadow = true; m.matrixAutoUpdate = false; m.updateMatrix(); m.updateMatrixWorld(true); sc.add(m); meshes.push(m);
      dots.push({ x, z, y: y + (r.dots[0] ? r.dots[0].y : 0.3), r: r.dots[0] ? r.dots[0].r : 0.5, label, fact });
    };
    put('ringStump', q.x, q.z, T('a4:dot.carpstump') || 'Stump', 'carp.stump');
    put('cairn', q.x + 2.2, q.z + 1.1, T('a4:dot.cairn') || 'Cairn', 'carp.stone');
    const P = this.c.pointer, s = this.story;
    const off = P && typeof P.register === 'function' ? P.register((ray, near) => {
      const pl = this.c.player; if (!pl || pl.onFoot === false) return null;
      const out = [];
      for (const d of dots) { if (near.flat(d.x, d.z) > 2.6 + d.r) continue; const h = near.sphere(d.x, d.y, d.z, d.r); if (h) out.push({ dist: h.t, miss: h.miss, target: { kind: 'prop', ref: `story:a4.${d.fact}`, label: d.label, e: { verb: 'Look', run: () => { if (!s.has(d.fact)) s.set(d.fact, true, 'a4:carp'); } } } }); }
      return out.length ? out : null;
    }) : null;
    this.far.set('carp', { meshes, off, dots });
  }
  dropFar(k) { const F = this.far.get(k); if (!F) return; for (const m of F.meshes) { if (m.parent) m.parent.remove(m); m.geometry.dispose(); } if (F.off) { try { F.off(); } catch { /* gone */ } } this.far.delete(k); }

  makeDebug() {
    const self = this;
    return {
      stage(who) { const L = storeLayout(EP), R = CAST[who]; if (!L || !R) return null; self.buildMotel(L); self.unstage(who); return self.stage(who, R.where[0], L) ? self.staged() : null; },
      chase(o = {}) { const p = self.c.player; return p ? !!self.startChase(p, { force: true, ...o }) : false; },
      endChase(how = 'islands') { self.endChase(how); return self.story.get('jon.chase'); },
      porch() { self.toPorch(); return self.porchSpot(); },
      can() { self.holdCan(); return !!self.can; },
      climax() { if (!self.can) self.holdCan(); self.can.left = true; return self.climax(); },
      carp() { return self.far.has('carp') ? self.far.get('carp').dots.map((d) => ({ x: d.x, z: d.z, y: d.y, fact: d.fact })) : null; },
      danielle() { return self.dani ? { x: self.dani.x, z: self.dani.z } : null; },
      talkDanielle() { return self.dani ? self.dani.onTalk(self.dani) : false; },
      // a gift shown to Aili as "Look at this…" would (the rigs: the print's match is the camera's; the pot is carried)
      gift(kind = 'pot') { const w = show.wanted('aili').find((x) => (kind === 'pot' ? x.item : x.print)); return w ? self.talk('aili', { give: w }) : false; },
      wants() { return show.wanted('aili').map((w) => w.id); },
      motel() { const M = self.motel; return M ? { x: M.at.x, z: M.at.z, porch: self.porchSpot(), key: M.key } : null; },
      state() { const s = self.story, p = (s.doc && s.doc.ppl) || {}; return { step: ailiStep(s, self.season()), aili: p.aili || null, chase: self.chase ? { mode: self.chase.mb.mode, x: +self.chase.mb.x.toFixed(0), z: +self.chase.mb.z.toFixed(0) } : null, can: !!self.can, porch: !!self.porchRun, staged: self.staged() }; },
    };
  }
}

export const familyCast = new FamilyCast();
export { FamilyCast };
