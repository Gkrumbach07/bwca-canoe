// The guiding years in the world (story Round 4, stream A3; docs/story/31-guiding-years.md; campaign-design Part 4
// Round 4): at Moose Lake 25 Marlys at the counter (Tue/Wed), Hap on the porch bench and Nate on the rail (summer
// weekends), Nate at the dock's end on weekdays, Sheila at the landing by the squad boat (Thu–Sun, July–October), Rick in
// the store early and late; the bunkhouse (bunk 3 under the window, the lamp on the sill, the stuck screen door, the
// step) and the boathouse with its loft (the ladder, the banker's boxes 1998–2020 with the 2019 register at the bottom of
// the 2020 box, the rafter's initials, the crew snapshot, the bolt can, the red canoe), all drawn here in the store's own
// frame (as A2's café: props.js is untouched); bunk 3's played night (GY-13: the Rest dial stops only at Marlys's hours,
// camp.js RestDial.stopsAt; her lines at each; the ordinary pickup idling in the lot 23:40–04:30; the door at two; the
// choice at six); the squad's night (stream m's squadNight, called at 21:00 on the arranged day at the landing; "Page
// two." when the boat is back); the overdue party (GY-10); the dock walked to its end, the reef fished; Gus's lines; the
// Farm photo (GY-17) and Hog Creek's wall map (GY-18); Tauno's GY-17 topic on Farm's porch.
// Loaded only under STORY_ON (main.js's a3 block). A co-op guest's story is a mirror: nobody is staged for them.
//
//   guidingCast.attach({ story, cast, npcs, talk, topics, outfitter, player, day, world, scene, tiles, actors, pointer,
//                        hud, layer, inventory, pencil, camp, energy, fishing, wind, veil, profile, record })
//   guidingCast.update(dt) · guidingCast.talk(who) → bool · guidingCast.staged()
//   guidingCast.debug { stage(who, slot), takeBunk(), stop(), loft(), box(year), night(), southNight() }
import * as THREE from 'three';
import { SceneRun, T, texts } from './topics.js';
import { storeLayout } from './props.js';
import { kit, rngFor } from './story-props.js';
import { propMaterial } from './prop-kit.js';
import { registerSensor } from './story-cond.js';
import { CAST } from './story-data/cast.js';
import * as G from './story-data/guiding.js';
import { TEXT as DRAFTS } from './story-data/drafts-a3.js';
import { FARM } from './story-data/mining.js';
import { defineGuidingItems, ITEM, count, take } from './guiding-items.js';
import { RestDial } from './camp.js';

for (const [k, v] of Object.entries(G.GY_SENSORS)) registerSensor(k, v);
const EP = G.MOOSE, FARM_EP = 31, HOG_EP = 36;
const NEAR = 140, TICK = 0.5, REACH = 2.8, LOFT_REACH = 4.6;
const PEOPLE = ['marlys', 'hap', 'nate', 'sheila', 'rick'];
const SCENES = { marlys: G.MARLYS, hap: G.HAP, nate: G.NATE, sheila: G.SHEILA, rick: G.RICK };
const DOW = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const hh = (h) => ((h % 24) + 24) % 24;

class GuidingCast {
  constructor() {
    this.c = {}; this.live = new Map(); this.t = 0; this.offs = []; this.built = null; this.nightRun = null; this.lamp = { lit: false };
    this.truck = null; this.party = null; this.ruleN = 0; this.dockT = 0; this.reefT = 0; this.squadDay = -1; this.debug = this.makeDebug();
  }
  attach(c = {}) {
    Object.assign(this.c, c);
    const s = this.c.story; if (!s) return this;
    defineGuidingItems();
    texts.add(DRAFTS);
    // the anchored speeches: the doc's open quotes and the speaker's name go (no word changes: guiding.js speech)
    for (const id of G.RAW) { const e = texts.entry(id); if (e && typeof e.text === 'string' && !e.a3) { e.text = G.speech(e.text); e.a3 = true; } }
    this.offs.push(s.sensor('southnight', () => this.southNight() != null));
    this.offs.push(s.sensor('northwind2', () => this.overdueOn()));
    this.offs.push(s.sensor('lampLit', () => !!this.lamp.lit));
    this.offs.push(s.sensor('truckLooked', () => !!(this.nightRun && this.nightRun.looked)));
    this.offs.push(s.sensor('nightNow', () => !!this.nightRun));
    this.offs.push(s.on('season', () => this.clear()));
    // stream m's squad night is back at the dock: "Page two." (GY-11), Sheila tying up
    this.offs.push(s.on('squad:back', () => this.sheilaSays(T('31:GY-11.back.2'))));
    // the walls (GY-17, GY-18): keeper topics at Farm and Hog Creek; Tauno's GY-17 topic on Farm's porch (mining.js FARM)
    if (this.c.topics && typeof this.c.topics.add === 'function') this.offs.push(this.c.topics.add(G.WALLS.map((w) => ({ ...w }))));
    const hub = FARM.nodes.hub.go, P = G.TAUNO_PHOTO;
    if (!hub.some((g) => g.ask === P.ask)) hub.splice(hub.length - 1, 0, { ask: P.ask, once: 'photo81', when: P.when, say: [{ first: [{ id: P.say, strip: P.strip.text, when: P.strip.when }, P.say] }], then: P.then });
    // the reef: a fish landed within its ring (GY-05e "fished there"; a walleye: "Two walleye.")
    const F = this.c.fishing;
    if (F && typeof F.release === 'function' && !F.a3wrap) {
      const rel = F.release.bind(F); F.a3wrap = true;
      F.release = (keep) => { const L = F.landed; const r = rel(keep); try { this.landed(L); } catch (e) { console.warn('guiding: the reef', e); } return r; };
    }
    if (this.c.pointer && typeof this.c.pointer.register === 'function') this.offs.push(this.c.pointer.register((ray, near) => this.targets(near)));
    return this;
  }
  get story() { return this.c.story || null; }
  get on() { const s = this.story; return !!(s && s.doc && s.mode !== 'mirror'); }
  args(ep = EP) { const n = this.c.cast; return n && typeof n.args === 'function' ? n.args(ep) : { ep, home: false }; }
  nowAbs() { const s = this.story; return s ? s.nowAbs() : 0; }
  date() { const d = this.c.day; const dt = d ? new Date(Date.UTC(d.year, 0, d.doy)) : new Date(Date.UTC(2026, 6, 1)); return { dow: dt.getUTCDay(), month: dt.getUTCMonth() + 1, mday: dt.getUTCDate(), hours: d ? d.hours : 12 }; }

  // --- the weather the arc reads ----------------------------------------------------------------------------------------
  // GY-11: the next S–SSE night within ten days (31: "from mid-August the wind table must offer an S–SSE night at least
  // once a week; once the player has asked, Sheila names the next one"): by the day's own dice, every fifth day or so
  // July–October, every seventh day at least from mid-August; the day it falls on is the night Sheila names (an a3
  // default: the wind table has no per-night bearing forecast; stream m sets the night's wind for the drift)
  southNight(from = Math.floor(this.nowAbs())) {
    const s = this.story; if (!s) return null;
    for (let d = from; d <= from + 10; d++) {
      const dt = new Date(Date.UTC(2026, 0, 1 + d)), m = dt.getUTCMonth() + 1, md = dt.getUTCDate();
      if (m < 7 || m > 10) continue;
      const late = m > 8 || (m === 8 && md >= 15);
      if (s.hash(`gy.south:${d}`) % (late ? 3 : 7) === 0 || (late && d % 7 === 0)) return d;
    }
    return null;
  }
  // GY-10: the party out today (once a season, July–August, a Sheila day after the wind has been north): the day's dice
  overdueOn() {
    const s = this.story, D = this.date(), w = this.c.wind; if (!s || D.month < 7 || D.month > 8) return false;
    if (![0, 4, 5, 6].includes(D.dow) || s.has('sheila.overdue')) return false;
    const north = w && Number.isFinite(w.from) ? (w.from > 300 || w.from < 60) : true;
    return north && s.hash(`gy.overdue:${Math.floor(this.nowAbs())}`) % 4 === 0;
  }

  // --- each half second ---------------------------------------------------------------------------------------------------
  update(dt) {
    if (!this.on) { if (this.live.size || this.built) this.clear(); return; }
    if (this.nightRun) this.nightTick();
    this.t += dt; if (this.t < TICK) return;
    const step = this.t; this.t = 0;
    const p = this.c.player, L = storeLayout(EP);
    this.squadTick(L);
    this.fishTick(step);
    if (!p || !L) { if (this.live.size) this.clear(); return; }
    const d = Math.hypot(L.centre.x - p.x, L.centre.z - p.z);
    if (d > NEAR + 40) { if (!this.nightRun) this.clear(); return; }
    if (d > NEAR) return;
    this.build(L);
    const s = this.story, a = this.args(EP);
    for (const who of PEOPLE) {
      if (this.nightRun && who === 'marlys') continue; // (the night stages her itself)
      const cur = this.live.get(who), slot = CAST[who].where.find((w) => s.when(w.when, a));
      if (cur && (!slot || slot.id !== cur.slot.id) && !this.talkingTo(cur)) this.unstage(who);
      if (slot && !this.live.has(who)) this.stage(who, slot, L);
    }
    this.squadBoat(L);
    this.dockTick(L, step);
    this.gusTick();
    // GY-13 choice 1: Marlys at the landing with Sheila; as you come near, the fade on her talking and Sheila writing
    const M = this.live.get('marlys'), S = this.live.get('sheila');
    if (M && S && M.slot.id === 'statement' && !s.has('sheila.statement') && !this.stating && Math.hypot(S.x - p.x, S.z - p.z) < 14) this.statement();
  }

  // --- the people -------------------------------------------------------------------------------------------------------
  spotOf(at, who, L) {
    const A = L.axes.a, B = L.axes.b, f = L.stepsFoot || L.door;
    if (at === 'a3:counter' && L.counter) return { x: L.counter.x + A.x * 1.4, z: L.counter.z + A.z * 1.4, y: L.floorY, heading: L.counter.heading };
    if (at === 'a3:store' && L.counter) return { x: L.counter.x - A.x * 1.6 + B.x * 1.2, z: L.counter.z - A.z * 1.6 + B.z * 1.2, y: L.floorY, heading: L.counter.heading };
    if (at === 'a3:bench') { const q = (L.seats && (L.seats[1] || L.seats[0])) || null; if (q) return { x: q.x, z: q.z, y: q.y, heading: q.heading, sit: true }; return f ? { x: f.x + A.x * 2.4, z: f.z + A.z * 2.4, heading: Math.atan2(-B.z, B.x) } : null; }
    if (at === 'a3:rail' && f) return { x: f.x - A.x * 1.6 + B.x * 0.4, z: f.z - A.z * 1.6 + B.z * 0.4, heading: Math.atan2(-B.z, B.x) };
    if (at === 'a3:towdock' && L.dockDeck) { const h = L.dockHeading || 0; return { x: L.dockDeck.x + Math.cos(h) * 1.6, z: L.dockDeck.z - Math.sin(h) * 1.6, y: L.dockDeck.y, heading: h }; }
    if (at === 'a3:landing' && L.dockFoot) { const k = who === 'marlys' ? 1.4 : 0; return { x: L.dockFoot.x + A.x * (2.2 + k), z: L.dockFoot.z + A.z * (2.2 + k), heading: L.dockHeading || 0 }; }
    return null;
  }
  stage(who, slot, L, spot = null) {
    const n = this.c.npcs, R = CAST[who]; spot = spot || this.spotOf(slot.at, who, L);
    if (!n || !spot || typeof n.standAt !== 'function') return null;
    let h = null;
    try { h = n.standAt(spot, { key: `cast:${who}:${EP}`, name: this.nameOf(who), role: '', look: R.look, ep: EP, sit: !!spot.sit, talk: () => (this.talk(who) ? true : null) }); } catch (e) { console.warn('guiding: stage', who, e); }
    if (!h) return null;
    const st = { who, slot, h, x: spot.x, z: spot.z, talked: false };
    this.live.set(who, st);
    return st;
  }
  unstage(who) { const st = this.live.get(who); if (!st) return; this.live.delete(who); try { if (st.h && typeof st.h.remove === 'function') st.h.remove(); } catch { /* gone */ } }
  clear() { for (const who of [...this.live.keys()]) this.unstage(who); this.drop(); if (this.c.cast && this.truck) { try { this.c.cast.ownTruck.hide(); } catch { /* gone */ } this.truck = null; } this.dropParty(); }
  nameOf(who) { const R = CAST[who], s = this.story; if (!R) return who; return !R.known || (s && s.has(R.known)) ? R.first : R.unknown || R.first; }
  talkingTo(st) { const t = this.c.talk; return !!(t && t.convo && t.convo.speaker && st.h && t.convo.speaker.key === (st.h.speaker && st.h.speaker.key)); }
  staged() { return [...this.live.values()].map((st) => ({ who: st.who, slot: st.slot.id, at: st.slot.at, x: +st.x.toFixed(1), z: +st.z.toFixed(1), talked: st.talked })); }
  sheilaSays(w) { const S = this.live.get('sheila'); if (!w) return; try { if (S && S.h && S.h.speaker && this.c.talk && this.c.talk.bark) this.c.talk.bark(S.h.speaker, w); else if (this.c.hud) this.c.hud.note(`Sheila: “${w}”`, 6); } catch { /* not drawn */ } }

  // the scenes
  hooks(who) {
    const s = this.story;
    return {
      opener: () => G.MARLYS_OPENERS[s.hash(`gy.open:${Math.floor(this.nowAbs())}`) % G.MARLYS_OPENERS.length],
      night: () => { if (!s.has('marlys.night')) s.set('marlys.night', Math.floor(this.nowAbs()), 'a3:night'); },
      arrange: () => { const d = this.southNight(); if (d != null && !s.has('drift.arranged')) s.set('drift.arranged', d, 'a3:sheila'); },
      overdue: () => this.stageParty(),
      sheilaOpen: () => {
        if (s.has('drift.left') && !s.has('gy.fetched')) { s.set('gy.fetched', true, 'a3'); return '31:GY-11.fetched'; }
        if (s.has('drift.walt') && !s.has('gy.waltway')) { s.set('gy.waltway', true, 'a3'); return '31:GY-11.waltway.2'; }
        if (s.has('sheila.overdue.declined') && !s.has('gy.overdue.told')) { s.set('gy.overdue.told', true, 'a3'); return '31:GY-10.look.3'; }
        return '31:GY-09.1';
      },
      rule: () => { const n = s.keys('rick.rule.').length; if (n < G.RICK_RULES.length) { s.set(`rick.rule.${n}`, true, 'a3'); return G.RICK_RULES[n]; } return G.RICK_RULES[(this.ruleN++) % G.RICK_RULES.length]; },
      printBack: () => { take(this.c.inventory, ITEM.print); },
    };
  }
  vars() {
    const pr = this.c.profile, home = pr && pr.home != null ? Number(pr.home) : null;
    const name = (ep) => { const L = storeLayout(ep); return (L && L.name) || 'the store'; };
    const d = this.story && this.story.has('drift.arranged') ? this.story.get('drift.arranged') : this.southNight();
    return { home: home != null ? name(home) : 'the store', day: d != null ? DOW[new Date(Date.UTC(2026, 0, 1 + d)).getUTCDay()] : '' };
  }
  carrying(id) { return count(this.c.inventory, id) > 0; }
  talk(who, o = {}) {
    if (!this.on) return false;
    const st = this.live.get(who), D = this.c.talk, s = this.story; if (!st || !D) return false;
    let def = SCENES[who], start = null;
    if (who === 'marlys') start = G.marlysEntry(s, { tent: this.carrying('walttent'), wadeToday: !!o.wade });
    else if (who === 'hap') start = G.hapEntry(s, {});
    else if (who === 'nate') start = G.nateEntry(s);
    else if (who === 'rick') start = G.rickEntry(s);
    else if (who === 'sheila') {
      if (s.has('choice.sheila') && s.get('choice.sheila') === 'in' && !s.has('sheila.statement') && this.live.has('marlys')) { def = G.STATEMENT; start = 'told'; }
      else start = G.sheilaEntry(s, { overdueOn: this.overdueOn() });
    }
    if (!def || !start) return false;
    st.talked = true; s.meet(who, 'a3');
    const n = this.c.npcs;
    const run = new SceneRun(this.c.topics, def, { who, args: { ...this.args(EP) }, vars: this.vars(), mark: n && n.mark ? (t) => n.mark(t) : null, hooks: this.hooks(who) });
    return D.open({ speaker: st.h.speaker, name: this.nameOf(who), role: '', room: EP, start: () => run.node(start), bye: () => (who === 'marlys' && !s.has('marlys.said.close') ? (s.set('marlys.said.close', true, 'a3'), T('31:GY-01.close.1')) : null) });
  }
  // GY-13 choice 1: the fade, then Sheila to you (the scene plays either way: walking off leaves it to her next talk)
  statement() {
    this.stating = true;
    const V = this.c.veil, go = () => { this.stating = false; const S = this.live.get('sheila'); if (S) this.talk('sheila'); };
    if (V && typeof V.card === 'function') V.card({ kicker: '', text: '', sub: '', fadeIn: 1.2, hold: 1.5, fadeOut: 1.4 }).then(go, go); else go();
  }

  // --- the buildings (in the store's frame: a across, b toward the front wall and the door) -----------------------------
  frame(L, a, b, turn = 0) {
    const A = L.axes.a, B = L.axes.b, C = L.centre, x = C.x + A.x * a + B.x * b, z = C.z + A.z * a + B.z * b;
    const g = this.c.tiles && typeof this.c.tiles.groundAt === 'function' ? this.c.tiles.groundAt(x, z) : L.floorY;
    // the building's front (−z in its own frame) toward the store's front (+b): its −z axis along B
    const rot = Math.atan2(-B.x, -B.z) + turn;
    return { x, z, y: Number.isFinite(g) ? g : L.floorY, rot };
  }
  put(name, at, opts = {}) {
    const k = kit(name), r = k && k.build({ rng: rngFor(`a3.${name}`), opts }); if (!r || !r.geo || !this.c.scene) return null;
    const m = new THREE.Mesh(r.geo, propMaterial()); m.name = `a3 ${name}`; m.position.set(at.x, at.y, at.z); m.rotation.y = at.rot || 0;
    m.castShadow = true; m.receiveShadow = true; m.matrixAutoUpdate = false; m.updateMatrix(); m.updateMatrixWorld(true); this.c.scene.add(m);
    return { m, spots: r.spots || null };
  }
  // a point of a building's own frame, in the world
  world(B, p) { const c = Math.cos(B.at.rot), s = Math.sin(B.at.rot); return { x: B.at.x + p.x * c + p.z * s, y: B.at.y + (p.y || 0), z: B.at.z - p.x * s + p.z * c }; }
  build(L) {
    if (this.built && this.built.L === L) return;
    this.drop();
    const bunkAt = this.frame(L, -(L.size.hW + 6.5), -1.5), boatAt = L.dockFoot ? (() => { const A = L.axes.a, f = L.dockFoot; const x = f.x + A.x * 9, z = f.z + A.z * 9; const g = this.c.tiles && this.c.tiles.groundAt ? this.c.tiles.groundAt(x, z) : L.floorY; return { x, z, y: Number.isFinite(g) ? g : L.floorY, rot: (L.dockHeading || 0) + Math.PI / 2 }; })() : this.frame(L, L.size.hW + 7, 2);
    const bh = this.put('bunkhouse', bunkAt), bo = this.put('boathouse', boatAt);
    const B = { L, meshes: [], bunk: bh ? { at: bunkAt, spots: bh.spots } : null, boat: bo ? { at: boatAt, spots: bo.spots } : null };
    if (bh) B.meshes.push(bh.m); if (bo) B.meshes.push(bo.m);
    if (B.bunk) {
      const D = this.world(B.bunk, { x: -0.45, y: 0, z: -2 }), door = this.put('bunkDoor', { ...D, rot: bunkAt.rot }); if (door) { B.meshes.push(door.m); B.door = door.m; }
      const lp = this.world(B.bunk, B.bunk.spots.lamp), lamp = this.put('bunkLamp', { ...lp, rot: bunkAt.rot }); if (lamp) { B.meshes.push(lamp.m); B.lampMesh = lamp.m; }
    }
    this.built = B;
    this.lampDraw();
  }
  drop() { const B = this.built; if (!B) return; for (const m of B.meshes) { if (m.parent) m.parent.remove(m); m.geometry.dispose(); } if (this.squad) { if (this.squad.parent) this.squad.parent.remove(this.squad); this.squad.geometry.dispose(); this.squad = null; } this.built = null; }
  // the battery lamp: lit, its glass bright (a basic material: no light, no new shadow program)
  lampDraw() {
    const m = this.built && this.built.lampMesh; if (!m) return;
    if (!this.litMat) this.litMat = new THREE.MeshBasicMaterial({ color: 0xffd98a, vertexColors: true });
    m.material = this.lamp.lit ? this.litMat : propMaterial();
  }
  // the squad boat at the landing while Sheila is there (a still prop until stream m's motorboat actor stands it)
  squadBoat(L) {
    const want = this.live.has('sheila') && L.dockBerths && L.dockBerths[2] && !(window.__game && window.__game.storyMech && window.__game.storyMech.squadBoatDrawn);
    if (!want) { if (this.squad) { if (this.squad.parent) this.squad.parent.remove(this.squad); this.squad.geometry.dispose(); this.squad = null; } return; }
    if (this.squad) return;
    const Bt = L.dockBerths[2].side, w = this.c.world, y = w && typeof w.levelAt === 'function' ? w.levelAt(Bt.x, Bt.z) : L.floorY - 1;
    const r = this.put('launch', { x: Bt.x, y: (Number.isFinite(y) ? y : L.floorY - 1) - 0.12, z: Bt.z, rot: (L.dockHeading || 0) + Math.PI / 2 });
    if (r) this.squad = r.m;
  }

  // --- what the dot points at: the bunkhouse, the boathouse and the loft, the truck at night, Farm's photo, Hog Creek's map
  targets(near) {
    if (!this.on) return null;
    const out = [], s = this.story, p = this.c.player, B = this.built, seated = p && p.seat;
    const one = (pt, r, label, e, q = null, reach = REACH) => { if (near.flat(pt.x, pt.z) > reach) return; const hit = near.sphere(pt.x, pt.y, pt.z, r); if (hit) out.push({ dist: hit.t, miss: hit.miss, target: { kind: 'story', ref: `a3:${label}`, label, e, ...(q ? { q } : {}) } }); };
    const D = (id) => T(id) || id;
    if (B && B.bunk) {
      const S = B.bunk.spots;
      one(this.world(B.bunk, S.bunk3), 0.7, D('a3.dot.bunk3'), { verb: 'Take the bunk', run: () => this.takeBunk() });
      one(this.world(B.bunk, { ...S.lamp, y: S.lamp.y + 0.12 }), 0.25, D('a3.dot.lamp'), { verb: this.lamp.lit ? 'Put it out' : 'Light it', run: () => { this.lamp.lit = !this.lamp.lit; if (!this.lamp.lit && this.nightRun) this.nightRun.putOut = true; s.set(this.lamp.lit ? 'gy.lamp.lit' : 'gy.lamp.out', true, 'a3'); this.lampDraw(); } });
    }
    if (B && B.boat) {
      const S = B.boat.spots, inLoft = seated && seated.id === 'a3:loft';
      if (!inLoft) one(this.world(B.boat, S.ladder), 0.7, D('a3.dot.ladder'), { verb: T('a3.verb.ladder') || 'Climb up', run: () => this.climb() });
      if (inLoft) {
        for (const bx of S.boxes) one(this.world(B.boat, bx), 0.26, String(bx.year), { verb: 'Look in', run: () => this.box(bx.year) }, null, LOFT_REACH);
        one(this.world(B.boat, S.rafter), 0.35, D('a3.dot.rafter'), { verb: 'Look', run: () => this.loftLook('gy.rafter', '31:GY-12.rafter.1') }, null, LOFT_REACH);
        one(this.world(B.boat, S.snap), 0.25, D('a3.dot.crew89'), { verb: 'Look', run: () => this.loftLook('gy.crew89') }, null, LOFT_REACH);
        one(this.world(B.boat, S.bolts), 0.25, D('a3.dot.bolts'), { verb: 'Look', run: () => this.loftLook('gy.bolts') }, null, LOFT_REACH);
        one(this.world(B.boat, S.canoe), 0.6, D('a3.dot.redcanoe'), { verb: 'Look', run: () => {} }, null, LOFT_REACH);
      }
    }
    // the ordinary pickup in the lot (GY-13 23:40–04:30): walked up to, the window comes down an inch
    if (this.truck && this.truck.stand) one({ ...this.truck.stand, y: (this.c.tiles ? this.c.tiles.groundAt(this.truck.stand.x, this.truck.stand.z) : 0) + 1.2 }, 1.4, D('a3.dot.truck'), { verb: 'Walk up', run: () => this.walkUp() }, null, 4);
    // Farm's 1981 photo by the till (GY-17): "Old guide photo"; Hog Creek's wall map behind its counter (GY-18)
    const LF = storeLayout(FARM_EP); if (LF && LF.counter && LF.counter.at) one({ x: LF.counter.at.x, y: LF.counter.at.y + 0.9, z: LF.counter.at.z }, 0.45, D('31:GY-17.dot'), { verb: 'Look', run: () => s.set('gy.photo81', true, 'a3:photo') });
    const LH = storeLayout(HOG_EP); if (LH && LH.wall && LH.wall.at) one({ x: LH.wall.at.x, y: LH.wall.at.y, z: LH.wall.at.z }, 0.7, 'Old wall map', { verb: 'Look', run: () => s.set('gy.hogmap', true, 'a3:map') });
    return out;
  }
  climb() {
    const B = this.built, p = this.c.player; if (!B || !B.boat || !p || typeof p.sitAt !== 'function') return false;
    const S = B.boat.spots, seat = this.world(B.boat, { x: S.ladder.x + 0.3, y: S.loft.y, z: S.ladder.z + 0.9 }), stand = this.world(B.boat, S.loftStand);
    return p.sitAt({ seat, heading: B.boat.at.rot - Math.PI / 2, stand: { x: stand.x, z: stand.z }, kind: 'loft', id: 'a3:loft' });
  }
  loftLook(fact, walt = null) { const s = this.story; if (!s.has(fact)) s.set(fact, true, 'a3:loft'); void walt; }
  // the boxes by year; the 2019 register at the bottom of the 2020 box, under the 2020 one (GY-12)
  box(year) {
    const s = this.story, h = this.c.hud;
    if (year !== 2020 || s.has('gy.register')) { if (h) h.note(`Bunkhouse registers, ${year}.`, 3); return; }
    s.rules.apply({ id: 'a3:register', then: ['give:page.register2019', 'give:page.message', 'give:page.clipping2019', 'f:gy.register'] }, {});
  }

  // --- the night in bunk 3 (GY-13) -----------------------------------------------------------------------------------------
  nightOpen() { const s = this.story; return s.has('marlys.night') && !s.has('door.guiding.climax'); }
  takeBunk() {
    const B = this.built, p = this.c.player, s = this.story; if (!B || !B.bunk || !p) return false;
    const S = B.bunk.spots, seat = this.world(B.bunk, S.bunk3), stand = this.world(B.bunk, { x: S.bunk3.x + 0.2, y: 0, z: S.bunk3.z + 0.7 });
    if (!p.seat && typeof p.sitAt === 'function') p.sitAt({ seat: { ...seat, y: seat.y }, heading: B.bunk.at.rot, stand: { x: stand.x, z: stand.z }, kind: 'bunk', id: 'a3:bunk3' });
    // the played night: on Marlys's day after the ask, from the evening; else a bunk to sit on (a later permit's bunk
    // night is the counter's card: Gus's "Three's free." once the night is done, 31 §9.1)
    if (this.nightOpen() && this.marlysDay() && this.date().hours >= 16.5) { this.startNight(); return true; }
    return true;
  }
  marlysDay() { const D = this.date(); return (D.dow === 2 || D.dow === 3) && D.month >= 5 && D.month <= 10; }
  startNight() {
    if (this.nightRun) { this.dial(); return; }
    const D = this.date(), now = D.hours < 12 ? D.hours + 24 : D.hours;
    this.nightRun = { done: new Set(G.NIGHT_HOURS.filter((h) => h.at < now - 0.01).map((h) => h.node)), looked: false, putOut: false, base: Math.floor(this.nowAbs() - (D.hours < 12 ? 1 : 0)) };
    this.nightRun.done.delete('n1750'); // (she comes down as you take the bunk, whenever after 17:50)
    this.unstage('marlys');
    if (now >= 17.83) this.playHour(G.NIGHT_HOURS[0]); else this.dial();
  }
  nightNow() { const D = this.date(); return D.hours < 12 ? D.hours + 24 : D.hours; }
  // where she is at each hour: bunk 4 across, the step outside the screen, the doorway, bunk 4 with the coffee
  marlysAt(node) {
    const B = this.built; if (!B || !B.bunk) return null;
    const S = B.bunk.spots, rot = B.bunk.at.rot;
    const spot = node === 'n2200' || node === 'n2340' || node === 'n0100' ? S.step : node === 'n0200' ? { x: 0, y: 0, z: -1.7 } : S.bunk4;
    const w = this.world(B.bunk, spot); return { x: w.x, z: w.z, y: w.y, heading: rot + (spot === S.step ? Math.PI : 0), sit: spot !== S.step && node !== 'n0200' };
  }
  playHour(h) {
    const R = this.nightRun, s = this.story; if (!R || R.done.has(h.node)) return;
    R.done.add(h.node); R.at = h.node;
    const L = storeLayout(EP);
    if (L) { this.unstage('marlys'); this.stage('marlys', { id: 'night', at: 'night' }, L, this.marlysAt(h.node)); }
    if (h.node === 'n2340') this.truckIn();
    if (h.node === 'n0200') this.doorBang();
    if (h.node === 'n0600') { this.truckOut(); if (this.lamp.lit) s.set('gy.lamp.allnight', true, 'a3'); }
    const M = this.live.get('marlys'), D = this.c.talk;
    if (!M || !D || !G.NIGHT.nodes[h.node].say) { this.dial(); return; }
    const n = this.c.npcs;
    const run = new SceneRun(this.c.topics, G.NIGHT, { who: 'marlys', args: { ...this.args(EP) }, vars: this.vars(), mark: n && n.mark ? (t) => n.mark(t) : null, hooks: this.hooks('marlys'),
      onEnd: () => { if (s.has('door.guiding.done') || (h.node === 'n0600' && s.has('door.guiding.climax'))) this.endNight(); else setTimeout(() => this.dial(), 400); } });
    D.open({ speaker: M.h.speaker, name: this.nameOf('marlys'), role: '', room: EP, start: () => run.node(h.node), bye: () => { if (!s.has('door.guiding.climax')) setTimeout(() => this.dial(), 400); return null; } });
  }
  // the Rest dial with her hours as its only stops (camp.js RestDial.stopsAt)
  dial() {
    const R = this.nightRun, cp = this.c.camp; if (!R || !cp) return false;
    const next = G.NIGHT_HOURS.find((h) => !R.done.has(h.node) && h.at > this.nightNow() - 0.01);
    if (!next) return false;
    if (!cp.dial) cp.dial = new RestDial();
    const D = cp.dial; if (!D || typeof D.show !== 'function') return false;
    const opts = [{ label: 'First light', small: '', at: 6 }, { label: '7:00', small: 'am', at: 7 }, { label: '10:00', small: 'pm', at: 22 }];
    D.show({ kicker: 'Rest · bunk 3', opts, at: hh(next.at), words: () => '', stopsAt: { now: this.date().hours, hours: G.NIGHT_STOPS }, onPick: (at) => this.restTo(at) });
    return true;
  }
  restTo(at) {
    const cp = this.c.camp, d = this.c.day, V = this.c.veil; if (!d) return;
    const from = d.hours, hours = (((at - from) % 24) + 24) % 24;
    const jump = () => { if (cp && typeof cp.jump === 'function') cp.jump(hours); d.setClock(d.year, d.doy, at); };
    const go = () => { const h = G.NIGHT_HOURS.find((x) => Math.abs(hh(x.at) - at) < 0.02 && !this.nightRun.done.has(x.node)); if (h) this.playHour(h); };
    // a quiet fade: no card, no hour shown (GY-13)
    if (V && typeof V.card === 'function') V.card({ kicker: '', text: '', sub: '', fadeIn: 0.8, hold: 0.4, fadeOut: 0.8, onDark: jump }).then(go, go);
    else { jump(); go(); }
  }
  nightTick() {
    const R = this.nightRun; if (!R) return;
    // the truck leaves for the landing at 04:30 (whatever the player does)
    if (this.truck && this.nightNow() >= G.TRUCK_HOURS.to && this.nightNow() < 30) this.truckOut();
    // her next hour comes while you are up and about: she waits at the bunkhouse until you are back in three
  }
  endNight() {
    const e = this.c.energy; try { if (e && typeof e.sleep === 'function') e.sleep(0.8, 8, { bag: true }); } catch { /* the energy's own */ }
    this.truckOut(); this.nightRun = null; this.unstage('marlys');
  }
  truckIn() {
    const C = this.c.cast; if (!C || typeof C.truckAt !== 'function') return;
    try { const r = C.truckAt(EP); if (r) this.truck = { stand: r.stand }; } catch (e) { console.warn('guiding: the truck', e); }
  }
  truckOut() { if (!this.truck) return; try { this.c.cast.ownTruck.hide(); const RT = this.c.cast.c.ridesTruck; if (RT && RT.gone === String(EP)) RT.gone = null; } catch { /* gone */ } this.truck = null; }
  walkUp() {
    if (!this.truck) return;
    if (this.nightRun) this.nightRun.looked = true;
    this.story.set('gy.truck.looked', true, 'a3');
    const w = T(G.TRUCK_LINE); if (w && this.c.hud) this.c.hud.note(`“${w}”`, 5);
  }
  // 02:00 the door sticks, then gives with a bang (the screen door swung open and back)
  doorBang() {
    const m = this.built && this.built.door; if (!m) return;
    const r0 = m.rotation.y; let t = 0;
    const tick = () => { t += 0.05; m.rotation.y = r0 - Math.sin(Math.min(1, t) * Math.PI) * 1.2; m.updateMatrix(); m.updateMatrixWorld(true); if (t < 1) setTimeout(tick, 30); };
    setTimeout(tick, 600);
  }

  // --- the squad's night (stream m: storyMech.squadNight), the overdue party, the dock, the reef, Gus ---------------------
  squadTick(L) {
    const s = this.story, M = window.__game && window.__game.storyMech, p = this.c.player; if (!s.has('drift.arranged') || s.has('drift.done') || !L || !p) return;
    const day = s.get('drift.arranged'), now = this.nowAbs(), D = this.date();
    if (Math.floor(now) !== day || D.hours < 20.75 || this.squadDay === day) return;
    const f = L.dockFoot || L.door; if (!f || Math.hypot(f.x - p.x, f.z - p.z) > 60) return;
    this.squadDay = day;
    if (M && typeof M.squadNight === 'function') { try { M.squadNight({ ep: EP, at: 21 }); } catch (e) { console.warn('guiding: the squad night', e); } }
    else if (this.c.hud) this.c.hud.note(T('31:GY-11.permit') || '', 5);
  }
  stageParty() {
    const Lp = this.c.layer && this.c.layer.place ? this.c.layer.place('gy.lunch') : null;
    const at = Lp && Number.isFinite(Lp.x) ? Lp : { x: -17850, z: 3550 };
    this.dropParty();
    const A = this.c.actors; if (!A || typeof A.person !== 'function') return;
    // four weekenders on the calm side, tents up, out of coffee (GY-10): two standing, talkable (an a3 default: the lunch
    // point's shore stands in for the island until 31 §13 check 2 picks the island in v9)
    const mk = (k, dx, dz) => { const a = A.person({ key: `a3:weekender:${k}`, look: {}, name: 'Weekender' }); if (a) a.standAt({ x: at.x + dx, z: at.z + dz, heading: 0 }); return a; };
    this.party = { actors: [mk(0, 6, 3), mk(1, 7.5, 4)], at: { x: at.x + 6.5, z: at.z + 3.5 }, k: 0 };
    this.offs.push(this.c.pointer.register((ray, near) => {
      const P = this.party; if (!P || near.flat(P.at.x, P.at.z) > 4) return null;
      const g = this.c.tiles ? this.c.tiles.groundAt(P.at.x, P.at.z) : 0, hit = near.sphere(P.at.x, g + 1.1, P.at.z, 1.2); if (!hit) return null;
      return [{ dist: hit.t, miss: hit.miss, target: { kind: 'person', ref: 'a3:weekenders', label: T('a3.dot.weekenders') || 'Party of four', e: { verb: 'Talk', run: () => this.partyTalk() } } }];
    }));
  }
  partyTalk() {
    const P = this.party, s = this.story; if (!P) return;
    const w = T(P.k % 2 === 0 ? '31:GY-10.4' : '31:GY-10.5'); P.k++;
    if (w && this.c.hud) this.c.hud.note(`“${w}”`, 5);
    if (!s.has('sheila.overdue.found')) s.set('sheila.overdue.found', true, 'a3:party');
  }
  dropParty() { const P = this.party; if (!P) return; for (const a of P.actors) { try { if (a) a.remove(); } catch { /* gone */ } } this.party = null; }
  // the dock walked to its end (GY-05a): a few seconds out at the deck's end
  dockTick(L, step) {
    const s = this.story, p = this.c.player; if (s.has('gy.dock') || !L.dockDeck || !p) return;
    if (Math.hypot(L.dockDeck.x - p.x, L.dockDeck.z - p.z) < 2.5 && p.onFoot !== false) { this.dockT += step; if (this.dockT > 2) s.set('gy.dock', true, 'a3:dock'); } else this.dockT = 0;
  }
  // fishing at the reef (GY-05e): a line in the water a minute within its ring; a fish landed there (walleye: "=walleye")
  reef() { const Lp = this.c.layer && this.c.layer.place ? this.c.layer.place('gy.reef') : null; return Lp && Number.isFinite(Lp.x) ? Lp : { x: -17150, z: 3350 }; }
  fishTick(step) {
    const s = this.story, F = this.c.fishing, p = this.c.player; if (!F || !p || s.has('gy.reef')) return;
    const R = this.reef(); if (Math.hypot(R.x - p.x, R.z - p.z) > 220 || !(F.rodUp || F.cast || F.line)) { this.reefT = 0; return; }
    this.reefT += step; if (this.reefT > 60) s.set('gy.reef', true, 'a3:reef');
  }
  landed(L) {
    const s = this.story, p = this.c.player; if (!L || !p || s.get('gy.reef') === 'walleye') return;
    const R = this.reef(); if (Math.hypot(R.x - p.x, R.z - p.z) > 220) return;
    if (/walleye|WAE/i.test(String(L.species))) { if (!s.has('gy.reef')) s.set('gy.reef', 'walleye', 'a3:reef'); }
    else if (!s.has('gy.reef')) s.set('gy.reef', true, 'a3:reef');
  }
  // Gus (GY-16): one line each, once, by his head, the first time each holds while you are in the store
  gusTick() {
    const s = this.story, N = this.c.npcs, o = this.c.outfitter, v = o && o.visit; if (!N || !v || v.ep !== EP || !v.inside || typeof N.at !== 'function') return;
    if (this.gusAt && performance.now() - this.gusAt < 20000) return;
    const g = G.GUS_LINES.find((x) => !s.has(`gy.gus.${x.id.split('.').pop()}`) && s.when(x.when, this.args(EP))); if (!g) return;
    const k = (N.at(EP) || []).find((q) => q.keeper); if (!k) return;
    const w = T(g.id); if (!w) return;
    try { N.bark(k, 0, w, 3); s.set(`gy.gus.${g.id.split('.').pop()}`, true, 'a3:gus'); this.gusAt = performance.now(); } catch { /* not drawn */ }
  }

  makeDebug() {
    const self = this;
    return {
      stage(who, id = null) { const L = storeLayout(EP), R = CAST[who]; if (!L || !R) return null; self.build(L); const slot = R.where.find((w) => w.id === id) || R.where[R.where.length - 1]; self.unstage(who); return self.stage(who, slot, L) ? self.staged() : null; },
      built: () => (self.built ? { bunk: !!self.built.bunk, boat: !!self.built.boat, at: self.built.bunk ? self.built.bunk.at : null } : null),
      spot(which) { const B = self.built; if (!B) return null; const [k, n] = which.split('.'); const H = k === 'bunk' ? B.bunk : B.boat; return H ? self.world(H, H.spots[n]) : null; },
      takeBunk: () => self.takeBunk(), climb: () => self.climb(), box: (y) => self.box(y), loftLook: (f) => self.loftLook(f),
      night: () => (self.nightRun ? { at: self.nightRun.at, done: [...self.nightRun.done], looked: self.nightRun.looked } : null),
      stop() { const R = self.nightRun; if (!R) return null; const h = G.NIGHT_HOURS.find((x) => !R.done.has(x.node)); if (!h) return null; if (self.c.camp && self.c.camp.dial && self.c.camp.dial.open) self.c.camp.dial.hide(); self.restTo(hh(h.at)); return h.node; },
      southNight: () => self.southNight(), party: () => self.stageParty(), walkUp: () => self.walkUp(),
    };
  }
}

export const guidingCast = new GuidingCast();
export { GuidingCast };
