// The mining years' people in the world (story Round 2, stream A2; docs/story/30-mining-years.md §4.1–§4.10, §7
// "Schedules"; owner calls 2–4): Tauno's Farm porch after the turn (cast.js hands his scene here), Len at the dock's end
// or the corner table, Mary at the window table, Brekke at the corner table on Thursdays (his handshake, his launch a
// still prop at the dock), Tasha by the counter for ice; the café at Farm 31 (props.js L.cafe); the clean book's ride to
// the Little Gabbro road end (rides.js rideWith: the cab, the fade, the fee his) and the slab there;
// (the café is drawn here in the store's frame, cafeOf: no change to props.js, so the tile worker's modules are main's); the want (Mary and
// the lid: E's show.js "Give" and "Look at this…", A2's want, the join); pay: is D's handler (beats.js, the join).
// Loaded only under STORY_ON (main.js's a2 block). A co-op guest's story is a mirror: nobody is staged for them.
//
//   miningCast.attach({ story, cast, npcs, talk, topics, outfitter, player, day, world, scene, tiles, rides, actors,
//                       pointer, hud, layer, profile, inventory, pencil, mtasks, kettle })
//   miningCast.update(dt)              the Farm people by their schedules, the café, the Thursday sight, the slab's people
//   miningCast.farmTalk(st) → bool     cast.js: E on Tauno on Farm's porch after the turn (his slot's scene 'a2:farm')
//   miningCast.talk(who) → bool        E on Len, Mary, Brekke or Tasha at Farm
//   miningCast.give(who, item) → bool  the want: Mary and Leo's lid, as the dot's Give does (show.js giveFor; rigs)
//   miningCast.ride() / home()         the drive with Tauno, there and back (the scene's do:ride / do:home)
//   miningCast.staged() · miningCast.debug { stage(who, slotId), slab(), pays() }
import * as THREE from 'three';
import { SceneRun, T } from './topics.js';
import { storeLayout } from './props.js';
import { kit, rngFor, cafeSpots } from './story-props.js';
import { propMaterial } from './prop-kit.js';
import { registerSensor } from './story-cond.js';
import { CAST } from './story-data/cast.js';
import { FARM, SLAB, LEN, MARY, TASHA, BREKKE, KEEPER, farmEntry, slabEntry, lenEntry, maryEntry, tashaEntry, opener, closer, FIRST_SAT, THURSDAY_LINE, WANTS, A2_SENSORS } from './story-data/mining.js';
import { ITEM, has } from './mining-items.js';
import { show } from './show.js';
import { FieldPerson, decorate } from './kettle.js';

for (const [k, v] of Object.entries(A2_SENSORS)) registerSensor(k, v);
const FARM_EP = 31, ROAD_END = 33;
const NEAR = 120, TICK = 0.5, SIGHT = 7, BYE_R = 30;
const PEOPLE = ['len', 'mary', 'brekke', 'tasha'];
const SCENES = { len: LEN, mary: MARY, brekke: BREKKE, tasha: TASHA };
const floorDay = (x) => Math.floor(x);

class MiningCast {
  constructor() { this.c = {}; this.live = new Map(); this.t = 0; this.cafe = null; this.slab = null; this.asked = -1; this.lastOpener = null; this.offs = []; this.debug = this.makeDebug(); }
  attach(c = {}) {
    Object.assign(this.c, c);
    const s = this.c.story;
    if (!s) return this;
    // the sensors the openers read: a big finding since the last porch visit, the last trip in the belt, Tasha in the lot
    this.offs.push(s.sensor('bigNew', () => s.bigCount > ((s.doc && s.doc.dir && s.doc.dir.a2big) || 0)));
    this.offs.push(s.sensor('belt', () => { const n = s.since('trips', 'crews.stood'); return n != null && n <= 1; }));
    this.offs.push(s.sensor('tashaHere', () => !!(this.slab && this.slab.tasha)));
    this.offs.push(s.on('season', () => this.clear()));
    // the Farm keeper's rings (30 §4.1), on the keepers' story topics (topics.js: under "Ask about…")
    if (this.c.topics && typeof this.c.topics.add === 'function') this.offs.push(this.c.topics.add(KEEPER));
    // Mary's want (E's show.js, the join): Leo's lid carried, the dot on her offers Give, and her talk "Look at this…";
    // given, her back table goes on (MARY 'table'). The lid is taken from you by show.js; the favour closes here
    for (const w of WANTS) this.offs.push(show.want({ id: `mining:${w.who}:${w.item}`, who: w.who, item: w.item, give: true, when: w.when, to: w.scene, run: () => { if (this.c.mtasks) this.c.mtasks.lidGiven(); } }));
    this.offs.push(show.talker('mary', (o = {}) => this.talk('mary', o)));
    // pay: is D's (beats.js: owed now, paid at the next trip-end tally with its line, record.js): the join took out A2's
    // stand-in
    return this;
  }
  get story() { return this.c.story || null; }
  get on() { const s = this.story; return !!(s && s.doc && s.mode !== 'mirror'); }
  args(ep = FARM_EP) { const n = this.c.cast; return n && typeof n.args === 'function' ? n.args(ep) : { ep, farm: ep === FARM_EP }; }

  // --- the Farm people by their schedules ---------------------------------------------------------------------------
  update(dt) {
    if (!this.on) { if (this.live.size || this.cafe || this.slab) { this.clear(); this.slab = null; } return; } // (a co-op guest: whoever was staged before the story turned mirror goes)
    this.t += dt;
    if (this.t < TICK) return;
    this.t = 0;
    const p = this.c.player, L = storeLayout(FARM_EP);
    this.slabTick();
    if (!p || !L) { if (this.live.size) this.clear(); return; }
    const d = Math.hypot(L.centre.x - p.x, L.centre.z - p.z);
    if (d > NEAR + 30) { this.clear(); return; }
    if (d > NEAR) return;
    this.buildCafe(L);
    const a = this.args(FARM_EP), s = this.story;
    for (const who of PEOPLE) {
      const R = CAST[who], cur = this.live.get(who);
      const slot = R.where.find((w) => w.at !== 'field' && s.when(w.when, a) && this.minute(who, w));
      if (cur && (!slot || slot.id !== cur.slot.id) && !this.talkingTo(cur)) this.unstage(who);
      if (slot && !this.live.has(who)) this.stage(who, slot, L);
    }
    this.launch(L);
    // the Thursday sight: the two men at the corner table, seen from inside (owner call 4: the Walt-page line)
    const B = this.live.get('brekke'), Ln = this.live.get('len'), o = this.c.outfitter;
    if (B && Ln && B.slot.at === 'a2:corner' && Ln.slot.at === 'a2:corner' && o && o.visit && o.visit.ep === FARM_EP && o.visit.inside && Math.hypot(B.x - p.x, B.z - p.z) < SIGHT && !s.has('brekke.seen')) s.set('brekke.seen', true, 'a2:thursday');
    // the first Farm morning's second half: "Good. Now we're two old fools…" as you sit on the bench beside him
    const st = this.taunoAt(); if (st && s.has('tauno.farm.met') && !s.has('tauno.farm.sat') && p.seat && /^porch:/.test(String(p.seat.id || '')) && Math.hypot(st.x - p.x, st.z - p.z) < 3) {
      s.set('tauno.farm.sat', true, 'a2:sat');
      const w = T(FIRST_SAT.id); if (w) { const t = w.replace(FIRST_SAT.strip, '').trim(); try { st.h.say(t); } catch { /* not drawn */ } }
    }
  }
  // Brekke to the minute (11:45–13:30, owner call 3); everyone else by the hour
  minute(who, w) { if (who !== 'brekke') return true; const d = this.c.day, h = d ? d.hours : 12; return h >= 11.75 && h < 13.5 && !!w; }
  taunoAt() { const C = this.c.cast; if (!C || !C.live) return null; for (const st of C.live.values()) if (st.who === 'tauno' && st.ep === FARM_EP) return st; return null; }
  spotOf(at, who, L) {
    const cafe = L.cafe || null;
    if (at === 'a2:dock' && L.dockDeck) { const h = L.dockHeading || 0, fx = Math.cos(h), fz = -Math.sin(h); return { x: L.dockDeck.x + fx * 1.8, z: L.dockDeck.z + fz * 1.8, y: L.dockDeck.y, heading: h }; }
    if ((at === 'a2:window' || at === 'a2:corner') && cafe) { const T0 = at === 'a2:window' ? cafe.window : cafe.corner, k = who === 'brekke' ? 1 : 0, q = T0.seats[k]; return { x: q.x, z: q.z, y: q.y, heading: q.heading }; }
    if (at === 'a2:store' && L.counter) { const A = L.axes.a; return { x: L.counter.x - A.x * 1.1, z: L.counter.z - A.z * 1.1, y: L.floorY, heading: L.counter.heading }; }
    return null;
  }
  stage(who, slot, L) {
    const n = this.c.npcs, R = CAST[who], spot = this.spotOf(slot.at, who, L);
    if (!n || !spot || typeof n.standAt !== 'function') return null;
    let h = null;
    try { h = n.standAt(spot, { key: `cast:${who}:${FARM_EP}`, name: this.nameOf(who), role: '', look: R.look, ep: FARM_EP, talk: () => (this.talk(who) ? true : null) }); } catch (e) { console.warn('mining: stage', who, e); }
    if (!h) return null;
    const st = { who, slot, h, x: spot.x, z: spot.z, talked: false };
    this.live.set(who, st);
    return st;
  }
  unstage(who) {
    const st = this.live.get(who); if (!st) return;
    this.live.delete(who);
    try { if (st.h && typeof st.h.remove === 'function') st.h.remove(); } catch { /* the store's gone */ }
  }
  clear() { for (const who of [...this.live.keys()]) this.unstage(who); this.dropCafe(); }
  nameOf(who) { const R = CAST[who], s = this.story; if (!R) return who; return !R.known || (s && s.has(R.known)) ? R.first : R.unknown || R.first; }
  talkingTo(st) { const t = this.c.talk; return !!(t && t.convo && t.convo.speaker && st.h && t.convo.speaker.key === (st.h.speaker && st.h.speaker.key)); }
  staged() { return [...this.live.values()].map((st) => ({ who: st.who, slot: st.slot.id, at: st.slot.at, x: +st.x.toFixed(1), z: +st.z.toFixed(1), talked: st.talked })).concat(this.slab && this.slab.tauno ? [{ who: 'tauno', slot: 'slab', at: 'field', x: +this.slab.tauno.x.toFixed(1), z: +this.slab.tauno.z.toFixed(1), tasha: !!this.slab.tasha }] : []); }

  // --- the café -----------------------------------------------------------------------------------------------------
  // Farm 31's café in the store's own frame (props.js's: a across, b toward the front wall and the door; the store's
  // inside is ±2.86 × ±3.86 m): Mary's window table front left, the corner table front right clear of the board, the urn
  // on the counter. Written onto the layout as L.cafe (grounding.js reads it: a café where the store has one)
  cafeOf(L) { return cafeSpots(L); } // (story-props.js: shared with Rose's window table at Moose Lake 25, the join)
  buildCafe(L) {
    if (!L.cafe && L.axes && L.centre) L.cafe = this.cafeOf(L);
    if (!L.cafe || (this.cafe && this.cafe.L === L)) { if (this.cafe) this.lidOnTable(); return; }
    this.dropCafe();
    const sc = this.c.scene; if (!sc) return;
    const meshes = [], put = (name, at, rotY, opts = {}) => {
      const k = kit(name); if (!k) return null; const r = k.build({ rng: rngFor(`a2.${name}.${meshes.length}`), opts }); if (!r.geo) return null;
      const m = new THREE.Mesh(r.geo, propMaterial()); m.name = `a2 cafe ${name}`; m.position.set(at.x, at.y, at.z); m.rotation.y = rotY; m.receiveShadow = true; m.castShadow = true;
      m.matrixAutoUpdate = false; m.updateMatrix(); m.updateMatrixWorld(true); sc.add(m); meshes.push(m); return m;
    };
    const rot = (ax) => Math.atan2(ax.x, ax.z);
    put('cafeTable', L.cafe.window, rot(L.cafe.window.ax));
    put('cafeTable', L.cafe.corner, rot(L.cafe.corner.ax));
    put('urn', L.cafe.urn, rot(L.cafe.window.ax));
    this.cafe = { L, meshes, lid: null };
    this.lidOnTable();
  }
  // Leo's lid on Mary's window table, stamp outward, every visit after she has it (30 §4.4)
  lidOnTable() {
    const C = this.cafe, s = this.story; if (!C || C.lid || !s.has('mary.lid.given')) return;
    const k = kit('boxLid'), r = k && k.build({ rng: rngFor('a2.lid') }); if (!r || !r.geo || !this.c.scene) return;
    const W = C.L.cafe.window, m = new THREE.Mesh(r.geo, propMaterial());
    m.position.set(W.x + W.ax.z * 0.12, W.y + 0.765, W.z - W.ax.x * 0.12); m.rotation.y = Math.atan2(W.ax.x, W.ax.z) + 0.3;
    m.matrixAutoUpdate = false; m.updateMatrix(); m.updateMatrixWorld(true); this.c.scene.add(m); C.lid = m; C.meshes.push(m);
  }
  dropCafe() { const C = this.cafe; if (!C) return; for (const m of C.meshes) { if (m.parent) m.parent.remove(m); m.geometry.dispose(); } this.cafe = null; this.dropLaunch(); }
  // Brekke's launch at Farm's dock on Thursdays while he is in (owner call 4: a still prop until Round 4's motorboat)
  launch(L) {
    const want = this.live.has('brekke') && L.dockBerths && L.dockBerths[1];
    if (!want) { this.dropLaunch(); return; }
    if (this.launchMesh) return;
    const k = kit('launch'), r = k && k.build({ rng: rngFor('a2.launch') }); if (!r || !r.geo || !this.c.scene) return;
    const B = L.dockBerths[1].side, w = this.c.world, y = w && typeof w.levelAt === 'function' ? w.levelAt(B.x, B.z) : L.floorY - 1;
    const m = new THREE.Mesh(r.geo, propMaterial()); m.name = 'a2 launch'; m.position.set(B.x, (Number.isFinite(y) ? y : L.floorY - 1) - 0.12, B.z); m.rotation.y = (L.dockHeading || 0) + Math.PI / 2;
    m.matrixAutoUpdate = false; m.updateMatrix(); m.updateMatrixWorld(true); this.c.scene.add(m); this.launchMesh = m;
  }
  dropLaunch() { const m = this.launchMesh; if (!m) return; if (m.parent) m.parent.remove(m); m.geometry.dispose(); this.launchMesh = null; }

  // --- their scenes -------------------------------------------------------------------------------------------------
  run(def, who, ctx = {}) {
    const n = this.c.npcs;
    return new SceneRun(this.c.topics, def, { who, args: { ...this.args(FARM_EP), ...(ctx.args || {}) }, mark: n && n.mark ? (t) => n.mark(t) : null, ...ctx });
  }
  talk(who, o = {}) {
    if (!this.on) return false;
    const st = this.live.get(who), D = this.c.talk, s = this.story; if (!st || !D) return false;
    const def = SCENES[who]; if (!def) return false;
    const L = storeLayout(FARM_EP);
    let start = null;
    if (who === 'len') start = lenEntry(s);
    else if (who === 'mary') start = maryEntry(s, {});
    else if (who === 'brekke') start = 'hand';
    else if (who === 'tasha') start = tashaEntry(s, { at: 'store', taunoNear: !!this.taunoAt() });
    if (!start) return false;
    st.talked = true; s.meet(who, 'a2');
    if (who === 'mary' && !s.has('mary.seen')) s.set('mary.seen', true, 'a2');
    const tasks = this.c.mtasks;
    if (who === 'len' && tasks) { const r = tasks.handIn('len'); if (r === 'wrong') { const w = T('30:4.2.1.wrong'); if (w) { try { st.h.say(w); } catch { /* not drawn */ } } } }
    const run = this.run(def, who, { hooks: {
      rings: () => this.lenRings(),
      favour: () => { if (tasks) tasks.offerLen(FARM_EP); },
      lid: () => { if (tasks) tasks.offerMary(FARM_EP); },
      pick: () => {},
    }, ...(who === 'mary' ? { show: (r, from) => show.choice('mary', r, from) } : {}) }); // (e: "Look at this…" in Mary's talk: the join)
    // Len's "Where are you headed next?": a real lake picked on the map (the canary, told.len kept; nothing leaks yet)
    const lake = (ch) => (who === 'len' && ch.text === T('30:4.2/len-saari-first-meeting.c6') ? { ...ch, pick: 'lake', go: ((g) => (a) => { if (a && a.name) s.person('len', 'told', '=', String(a.name), 'a2:canary'); return g(); })(ch.go) } : ch);
    const first = () => {
      // the dot's Give (show.js giveFor → show.talker): the want answered, then her back table (its `to`)
      if (who === 'mary' && o.give) return show.answer(o.give, { kind: 'item', id: o.give.item }, () => run.choices(start), () => run.node(o.give.to || 'table'));
      return decorate(run.node(start), lake);
    };
    return D.open({ speaker: st.h.speaker, name: this.nameOf(who), role: '', room: FARM_EP, start: first, bye: () => null });
  }
  wants(who) { const s = this.story; return WANTS.some((w) => w.who === who && s.when(w.when) && has(this.c.inventory, w.item) > 0); }
  // the want, from outside (the rigs): what the dot's Give on Mary does (show.js giveFor, the join)
  give(who, item) {
    if (who !== 'mary' || item !== ITEM.lid || !this.wants('mary')) return false;
    const q = show.giveFor('cast:mary:31');
    return q ? q.run() : false;
  }
  // "Here, give me your map. I'll ring the old pads for you.": the landing, the grade, the west pads, in Len's voice
  lenRings() {
    const P = this.c.pencil; if (!P || typeof P.ring !== 'function') return 0;
    let n = 0;
    for (const place of ['crews.landing', 'grade', 'westpads']) { try { if (P.ring({ place, by: 'Len', lead: null })) n++; } catch (e) { console.warn('mining: Len\'s ring', place, e); } }
    if (n && this.c.hud) this.c.hud.note('Len pencils it on your map.', 4);
    return n;
  }

  // --- Tauno at Farm (cast.js hands his scene here after the turn) ----------------------------------------------------
  farmTalk(st) {
    if (!this.on || !st || st.ep !== FARM_EP) return false;
    const D = this.c.talk, s = this.story; if (!D) return false;
    const today = floorDay(s.nowAbs()), yf = s.fact('door.mining.yield');
    const d = this.c.day, month = d ? new Date(Date.UTC(d.year, 0, d.doy)).getUTCMonth() + 1 : 7;
    const ctx = { asked: this.asked === today, porchVisit: !!(yf && today > yf.abs) && month >= 6 && month <= 10 };
    const start = farmEntry(s, ctx);
    if (start === 'ask') this.asked = today;
    st.talked = true;
    s.rules.apply({ id: 'cast:talk', then: ['f:tauno.talk'] }, {});
    s.meet('tauno', 'a2');
    // the first morning: "You found it." dropped if the turn played on this porch (20 §12: Farm's seat before the turn)
    const seat31 = s.fact('tauno.said.seat31'), turn = s.fact('tauno.turn'), here = !!(seat31 && turn && seat31.tick < turn.tick);
    const n = this.c.npcs, nOpen = s.hash(`opener:${today}:${s.doc && s.doc.season}`) % 3;
    const run = new SceneRun(this.c.topics, FARM, { who: 'tauno', args: { ...this.args(FARM_EP), first: !s.has('tauno.farm.met') }, mark: n && n.mark ? (t) => n.mark(t) : null,
      hooks: {
        opener: () => { const id = opener({ when: (e) => s.when(e, this.args(FARM_EP)), last: this.lastOpener, n: nOpen }); this.lastOpener = id; if (s.doc && s.doc.dir) s.doc.dir.a2big = s.bigCount; return id; },
        ride: () => { st.done = true; setTimeout(() => this.ride(), 50); },
      },
      onEnd: () => { st.done = true; } });
    st.run = run;
    const lines = start === 'first' && here ? { ...FARM, nodes: { ...FARM.nodes, first: { ...FARM.nodes.first, say: [{ id: '30:4.1.1', strip: 'You found it. ' }] } } } : null;
    if (lines) run.def = lines;
    return D.open({ speaker: st.h.speaker, name: this.c.cast.nameOf('tauno'), role: '', room: FARM_EP, start: () => run.node(start), bye: () => T(closer(s, nOpen)) });
  }

  // --- the clean book: the ride and the slab (30 §4.9) ----------------------------------------------------------------
  async ride() {
    const R = this.c.rides, s = this.story; if (!R || typeof R.rideWith !== 'function') return false;
    // the fare as any drive's, back on the next tally as "Gas, Tauno" (he buys the gas); short of it, he pays outright
    let r = R.rideWith(ROAD_END, { from: FARM_EP, who: 'Tauno', pays: false });
    let paid = true;
    if (!r) { r = R.rideWith(ROAD_END, { from: FARM_EP, who: 'Tauno', pays: true }); paid = false; }
    if (!r) return false;
    const out = await r;
    if (!out || !out.ok) return false;
    s.rules.apply({ id: 'a2:gas', then: [`pay:${paid ? out.price : 0}@30:4.9.gas`] }, {});
    this.slab = { since: performance.now(), tauno: null, tasha: null, waited: false };
    // (placed as the lot and its tiles come in, whatever the frame's cadence: a quarter second at a time, 30 s at most)
    let n = 0; const tm = setInterval(() => { try { this.slabTick(); } catch (e) { console.warn('mining: the road end', e); } if (!this.slab || (this.slab.tauno && !this.slab.tasha) || ++n > 480) clearInterval(tm); }, 250); // (and on until Tasha's truck has gone)
    return true;
  }
  // at the road end: Tauno by the slab (or in the pickup while Tasha loads her coolers), Tasha in the lot on a weekday
  slabTick() {
    const S = this.slab; if (!S) return;
    const L = this.c.layer, pl = L && L.place('ep33.crewcamp'), slab = L && L.prop('ep33.slab');
    if (!pl || !Number.isFinite(pl.x) || !slab || !Number.isFinite(slab.prop.x)) return;
    const s = this.story, d = this.c.day;
    if (!S.tauno) {
      const dow = d ? new Date(Date.UTC(d.year, 0, d.doy)).getUTCDay() : 3, month = d ? new Date(Date.UTC(d.year, 0, d.doy)).getUTCMonth() + 1 : 7;
      const tashaDay = dow >= 1 && dow <= 5 && month >= 6 && month <= 10 && s.has('tasha.met') && (s.hash(`tasha33:${d ? d.doy : 0}`) % 2 === 0 || S.forceTasha);
      const lot = pl, q = slab.prop;
      S.tauno = new FieldPerson(this.c, 'tauno', { x: q.x + 1.2, z: q.z + 0.8, heading: q.heading || 0, name: this.c.cast ? this.c.cast.nameOf('tauno') : 'Tauno' });
      S.tauno.onTalk = (f) => this.talkSlab(f);
      if (tashaDay) S.tasha = new FieldPerson(this.c, 'tasha', { x: lot.x + 3, z: lot.z + 2, heading: 0 });
    }
    if (S.tasha && S.waited && !S.tasha.talking && performance.now() - S.waited > 8000) { S.tasha.remove(); S.tasha = null; } // (her truck goes; he gets out)
  }
  talkSlab(f) {
    const S = this.slab, s = this.story, D = this.c.talk; if (!S || !D) return false;
    const start = slabEntry(s, { tashaHere: !!S.tasha });
    if (start === 'wait' && !S.waited) S.waited = performance.now(); // (she loads her coolers while he says it; her truck goes after)
    const run = new SceneRun(this.c.topics, SLAB, { who: 'tauno', args: { ...this.args(ROAD_END) },
      hooks: { home: () => setTimeout(() => this.home(), 50) },
      onEnd: (at) => { f.talking = false; if (at === 'wait') S.waited = performance.now(); } });
    f.talking = true;
    return D.open({ speaker: f.speaker, name: f.name, role: '', room: null, start: () => run.node(start), bye: () => { f.talking = false; if (start === 'wait') S.waited = performance.now(); return null; } });
  }
  async home() {
    const R = this.c.rides, S = this.slab; if (!R) return false;
    const r = R.rideWith(FARM_EP, { from: ROAD_END, who: 'Tauno', pays: true });
    if (!r) return false;
    await r;
    if (S) { if (S.tauno) S.tauno.remove(); if (S.tasha) S.tasha.remove(); }
    this.slab = null;
    // at Farm he gets out, stands by the truck, and says it (30:4.9.14)
    const L = storeLayout(FARM_EP), w = T('30:4.9.14');
    if (L && w) { const f = L.stepsFoot || L.door, t = new FieldPerson(this.c, 'tauno', { x: f.x + L.axes.b.x * 3, z: f.z + L.axes.b.z * 3, heading: 0, name: this.c.cast ? this.c.cast.nameOf('tauno') : 'Tauno' }); setTimeout(() => t.say(w), 600); setTimeout(() => t.remove(), 12000); }
    return true;
  }

  // --- pay: D's handler owes "pay:<dollars>@<text id>" and the trip-end tally pays it (the join: the stand-in went) -----
  // (for the rigs: what D owes and has paid from these rules, and the tally's own pay now)
  payLines() {
    const s = this.story, d = s && s.doc && s.doc.dir, L = (d && Array.isArray(d.pay)) ? d.pay : [];
    return L.map((p) => ({ n: p.amt, line: p.line, text: p.text, paid: !!p.paid, rule: p.rule }));
  }
  payNow() {
    const s = this.story; if (!s || typeof s.tallyLines !== 'function') return [];
    return (s.tallyLines({}) || []).map((l) => `${l.title} · $${l.pay}`);
  }

  makeDebug() {
    const self = this;
    return {
      stage(who, id = null) { const L = storeLayout(FARM_EP), R = CAST[who]; if (!L || !R) return null; const slot = R.where.find((w) => w.id === id) || R.where[0]; self.unstage(who); return self.stage(who, slot, L) ? self.staged() : null; },
      slab(o = {}) { self.slab = { since: performance.now(), tauno: null, tasha: null, waited: false, forceTasha: !!o.tasha }; return true; },
      pays() { const L = self.payLines(); return { handler: 'd', due: L.filter((p) => !p.paid), paid: L.filter((p) => p.paid) }; },
      payNow: () => self.payNow(),
    };
  }
}

export const miningCast = new MiningCast();
export { MiningCast, BYE_R };
