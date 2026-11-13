// The company and the press in the world (campaign Round 6, stream p; docs/story/40-company-and-press.md; 30 §4.6, §4.8;
// campaign-design §8.1–§8.2, §12). Loaded only under STORY_ON (main.js's p block); a co-op guest's story is a mirror:
// nothing is staged or written for them.
//
//   Tauno's call on Farm's porch (30 §4.8), the fallback callers (40 §6.2: Marlys, Sheila, Carol, René, the first seen),
//   "The Ledger?" at any counter after "Not yet."; the midpoint (rules-company.js) and its three scenes: the camp search
//   (three stagings), Wade at the next counter, Josie's leech order at home; Maggie at Hog Creek 36 (the first meeting,
//   her lie and its catch, the stakes, the letter beside the notebook, the papers: L1 D; her return openers, the things
//   brought to her, the offer to stop, the meeting point); the leech-order pad at any counter (story.doc.meeting); Dan at
//   counters (tier 1 his card, tier 2 junk and Leo's lid, tier 3 the $1,000 offer, after the adrift "they'd find a
//   number"); Wade at the put-in (tier 3); the stranger at the far landing (tier 2, once); the watchers' postings drawn
//   as sightings (§8.1, green Kevlar, two men, no rods, no verbs) and tier 4's truck in the lot; the canoe adrift (40 §5,
//   m's storyMech.adrift, the paddles stood on the far shore); Maggie's note under the Little Gabbro box (§6.9); Brekke's
//   one conversation at the corner table on Thursdays (30 §4.6: choice.brekke, needling him steps the watchers up a tier);
//   the tiers' talk (40 §7.2) in the keepers' word pool.
//
//   company.attach({ story, talk, topics, npcs, cast, outfitter, player, day, world, scene, tiles, actors, pointer, hud,
//                    inventory, profile, camp, trip, pencil, mining, mech, watchers, wind, texts })
//   company.update(dt) · company.debug { … } (rigs: __game.storyCompany.debug)
import * as THREE from 'three';
import { SceneRun, T } from './topics.js';
import { registerSensor } from './story-cond.js';
import { PropBuilder, propMaterial, TILE } from './prop-kit.js';
import { trailheadAt, trailheadLayout, trailheadLayouts } from './trailhead.js';
import { storeLayout } from './props.js';
import { FieldPerson } from './kettle.js';
import { SPOT_OF } from './cast.js';
import { definePage, defineItem, itemDef } from './items.js';
import * as P from './story-data/company.js';

for (const [k, v] of Object.entries(P.P_SENSORS)) registerSensor(k, v);
const TICK = 0.4;
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const C = (hex) => new THREE.Color(hex);
const monthOf = (abs) => new Date(abs * 864e5).getUTCMonth() + 1;
const dowOf = (abs) => new Date(Math.floor(abs) * 864e5).getUTCDay();
const lower = (w) => String(w || '').split(/\s+/)[0].toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const KIND_ORDER = ['container', 'meal', 'snack', 'food', 'fish', 'bait', 'lure', 'tool', 'gear', 'map', 'page'];
const BELT = /^(Gabbro|Bald Eagle|Little Gabbro)( Lake)?$/i;
// tier talk (40 §7.2) for the keepers' word pool: [tier, id, cond?] (the {lake}/{portage} lines need a party's own day: not here)
const TALK = [[0, '40:7.2.1'], [0, '40:7.2.2'], [0, '40:7.2.3'], [0, '40:7.2.5', 'farm', 'aug'], [0, '40:7.2.6'],
  [1, '40:7.2.7'], [1, '40:7.2.9', 'farm'], [2, '40:7.2.11'], [2, '40:7.2.14'], [2, '40:7.2.15'],
  [3, '40:7.2.17', 'hog'], [3, '40:7.2.18'], [4, '40:7.2.19'], [4, '40:7.2.21']];

// --- small meshes: a pickup (Wade's, the trucks of tier 4), a paddle stood on end ----------------------------------------
function truckGeo(paint = 0x3a3c40) {
  const b = new PropBuilder(), X = V(1, 0, 0), Y = V(0, 1, 0), Z = V(0, 0, 1), body = C(paint), glass = C(0x26302f), tyre = C(0x161616);
  b.box(V(0, 0.72, -0.05), X, Y, Z, 0.95, 0.22, 2.62, TILE.PAINT, body);
  b.box(V(0, 1.1, 1.85), X, Y, Z, 0.93, 0.18, 0.62, TILE.PAINT, body);
  b.box(V(0, 1.38, 0.55), X, Y, Z, 0.93, 0.46, 0.78, TILE.PAINT, body);
  b.box(V(0, 1.5, 0.55), X, Y, Z, 0.935, 0.24, 0.7, TILE.GLASS, glass);
  for (const s of [-1, 1]) b.box(V(0.9 * s, 1.1, -1.45), X, Y, Z, 0.05, 0.2, 1.12, TILE.PAINT, body);
  b.box(V(0, 1.1, -2.6), X, Y, Z, 0.95, 0.2, 0.05, TILE.PAINT, body);
  for (const zw of [1.6, -1.55]) for (const s of [-1, 1]) b.cyl(V(0.8 * s, 0.38, zw), V(1.0 * s, 0.38, zw), 0.38, 0.38, 12, TILE.PLAIN, tyre, { cap0: true, cap1: true, capTile: TILE.PLAIN, capCol: tyre });
  const g = b.build(); g.computeBoundingSphere(); return g;
}
function paddleGeo() {
  const b = new PropBuilder(), X = V(1, 0, 0), Y = V(0, 1, 0), Z = V(0, 0, 1), wood = C(0xb08a58);
  b.box(V(0, 0.55, 0), X, Y, Z, 0.018, 0.55, 0.018, TILE.WOOD, wood);   // the shaft, grip down in the gravel
  b.box(V(0, 1.32, 0), X, Y, Z, 0.1, 0.27, 0.012, TILE.WOOD, wood);     // the blade, up
  const g = b.build(); g.computeBoundingSphere(); return g;
}

class Company {
  constructor() { this.c = {}; this.t = 0; this.offs = []; this.at = new Map(); this.meshes = new Map(); this.sight = new Map(); this.RT = {}; this.visitN = 0; this.lastDan = null; this.said = new Set(); this.debug = this.makeDebug(); }
  get story() { return this.c.story || null; }
  get on() { const s = this.story; return !!(s && s.doc && s.mode !== 'mirror'); }
  attach(c = {}) {
    Object.assign(this.c, c);
    const s = this.story; if (!s) return this;
    s.company = this;
    const TX = this.c.texts; if (TX && typeof TX.add === 'function') TX.add(this.RT); // (runtime words: a choice with a name filled in)
    this.items();
    this.wrapFarm(); this.wrapMining(); this.wrapTalk();
    const N = this.c.npcs;
    if (N && typeof N.addTalkSource === 'function') this.offs.push(N.addTalkSource((v) => this.keeperItems(v)));
    if (N && typeof N.addPool === 'function') this.offs.push(N.addPool('word', (ctx) => this.tierWord(ctx)));
    this.offs.push(s.on('store:enter', (e) => this.storeEnter(e && e.ep)));
    this.offs.push(s.on('trip:start', (e) => this.tripStart(e && e.ep)));
    this.offs.push(s.on('trip:end', () => this.tripEnd()));
    this.offs.push(s.on('carry', (e) => this.carried(e || {})));
    this.offs.push(s.on('lake', (e) => { this.lake = e && (e.name || e.id); }));
    this.offs.push(s.on('sleep', (e) => this.slept(e || {})));
    this.offs.push(s.on('season', () => this.clear()));
    return this;
  }
  items() {
    const page = (id, title, ref, by = null) => { try { definePage({ id, title, ref, by }); } catch { /* defined */ } };
    page('leechslip', 'A leech-order slip', 'item.leechslip', 'Josie');
    page('walt2019', 'A letter to the Ledger (photocopy)', 'paper.walt.2019', 'Maggie');
    page('ostrander', 'Ostrander\'s note, 1977 (photocopy)', 'paper.ostrander.1977', 'Maggie');
    page('ostrander.blue', 'Ostrander\'s note, the blue ink', 'paper.ostrander.1977.blue', 'Maggie');
    page('boreal1976', 'Boreal\'s target list, 1976 (photocopy)', 'paper.boreal.1976', 'Maggie');
    page('kettlemap', 'The Kettle project handout', 'd95.p.handout', 'Maggie');
    page('maggienote', 'A leech-order slip, folded in four', 'note.maggie.meet', 'Maggie');
    try { if (!itemDef('dancard')) defineItem({ id: 'dancard', name: 'Dan\'s card', short: 'Card', kind: 'page', w: 1, h: 1, kg: 0.005, price: 0, unique: true, icon: 'page', model: 'map', identity: 'From Dan', ref: 'd95.p.dancard', by: 'Dan', kept: true, verbs: [{ id: 'read', label: 'Read' }] }); } catch (e) { console.warn('p: Dan\'s card', e); }
    try { if (!itemDef('cigbutt')) defineItem({ id: 'cigbutt', name: T('40:3.4.c1') || 'Cigarette', short: 'Butt', kind: 'gear', w: 1, h: 1, kg: 0.002, price: 0, identity: '', story: 'p' }); } catch (e) { console.warn('p: the butt', e); }
  }
  give(id) { const i = this.c.inventory; try { if (i && !i.has(id)) return i.give(id); } catch (e) { console.warn('p: give', id, e); } return false; }
  has(id) { const i = this.c.inventory; try { return !!(i && i.count(id, { reachable: false }) > 0); } catch { return false; } }
  note(text, sec = 5) { const h = this.c.hud; if (h && text) h.note(text, sec); }
  thought(id) { if (this.said.has(id)) return; this.said.add(id); this.note(T(id), 4); }
  abs() { return this.story.nowAbs(); }
  hours() { const d = this.c.day; return d ? d.hours : 12; }
  daylight() { return !!this.story.readSensor('daylight'); }
  runOn() { return this.story.readSensor('run.active') === true; }
  args(ep = null) {
    const s = this.story, len = s.doc && s.doc.ppl && s.doc.ppl.len, told = len && len.told, pr = this.c.profile;
    return { ep, walts: !!s.readSensor('carrying'), hasLid: this.has('leolid'), hasBlade: this.has('shovelblade'),
      bigNew: s.bigCount > ((s.doc && s.doc.dir && s.doc.dir.pbig) || 0), hogHome: !!(pr && Number(pr.home) === P.HOG),
      lenBE: /bald eagle/i.test(String(told || '')), lenGrade: s.has('len.westpads.rings') || s.has('photo.crib'), lenLake: !!told && !/bald eagle/i.test(String(told)),
      seenTauno: s.has('tauno.farm.met') && s.has('len.met') && s.has('door.mining.open'), firstOrder: !s.has('maggie.order'),
      evening: this.hours() >= P.MAGGIE_HOURS[1] || this.hours() < P.MAGGIE_HOURS[0] };
  }
  // a scene opened on a speaker (a FieldPerson, a cast person, a keeper)
  open(speaker, name, def, start, { hooks = {}, vars = null, room = null, bye = null, onEnd = null, ep = null } = {}) {
    const D = this.c.talk, TP = this.c.topics; if (!D || !TP || !speaker) return false;
    const run = new SceneRun(TP, def, { who: def.who, args: this.args(ep), vars, hooks, onEnd });
    return D.open({ speaker, name, role: '', room, start: () => run.node(start), bye: () => (bye ? T(bye) : null) });
  }
  person(key, who, at, name) {
    this.drop(key);
    if (!this.c.actors || !at) return null;
    const F = new FieldPerson(this.c, who, { x: at.x, z: at.z, heading: at.heading || 0, name });
    this.at.set(key, F); return F;
  }
  drop(key) { const F = this.at.get(key); if (F) { try { F.remove(); } catch { /* gone */ } this.at.delete(key); } }
  mesh(key, geo, at, heading = 0) {
    this.dropMesh(key);
    const sc = this.c.scene; if (!sc || !geo) return null;
    const m = new THREE.Mesh(geo, propMaterial()), y = this.ground(at.x, at.z);
    m.name = `p ${key}`; m.position.set(at.x, y, at.z); m.rotation.y = heading; m.castShadow = true; m.receiveShadow = true;
    m.matrixAutoUpdate = false; m.updateMatrix(); m.updateMatrixWorld(true); sc.add(m); this.meshes.set(key, m); return m;
  }
  dropMesh(key) { const m = this.meshes.get(key); if (m) { if (m.parent) m.parent.remove(m); m.geometry.dispose(); this.meshes.delete(key); } }
  ground(x, z) { const t = this.c.tiles; try { const y = t && typeof t.groundAt === 'function' ? t.groundAt(x, z) : 0; return Number.isFinite(y) ? y : 0; } catch { return 0; } }
  target(key, T0) {
    const pt = this.c.pointer; if (!pt || typeof pt.register !== 'function') return;
    this.untarget(key);
    const off = pt.register((ray, near) => {
      if (!near || near.flat(T0.x, T0.z) > (T0.r || 1.5) + 0.6) return null;
      const hit = near.sphere(T0.x, this.ground(T0.x, T0.z) + (T0.y ?? 0.8), T0.z, 0.7); if (!hit) return null;
      return [{ dist: hit.t, miss: hit.miss, target: { kind: 'thing', ref: `p:${key}`, label: T0.label, e: { verb: T0.verb, run: T0.run } } }];
    });
    this.targets = this.targets || new Map(); this.targets.set(key, off);
  }
  untarget(key) { const off = this.targets && this.targets.get(key); if (off) { try { off(); } catch { /* gone */ } this.targets.delete(key); } }
  clear() { for (const k of [...this.at.keys()]) this.drop(k); for (const k of [...this.meshes.keys()]) this.dropMesh(k); for (const k of [...(this.targets || new Map()).keys()]) this.untarget(k); this.undrawSightings(); this.counter = null; this.putin = null; }

  // --- Tauno's call on the porch (30 §4.8) and the fallback (40 §6.2) --------------------------------------------------------
  wrapFarm() {
    const M = this.c.mining; if (!M || typeof M.farmTalk !== 'function' || M.pWrapped) return;
    const f0 = M.farmTalk.bind(M); M.pWrapped = true;
    M.farmTalk = (st) => {
      const s = this.story;
      if (this.on && st && st.h && s.bigCount >= 2 && !s.has('tauno.call.asked') && !s.has('tauno.call') && !s.has('maggie.called')) {
        st.talked = true; s.meet('tauno', 'p');
        return this.open(st.h.speaker, 'Tauno', P.TAUNO_CALL, 'start', { room: P.FARM, ep: P.FARM, onEnd: () => { st.done = true; } });
      }
      return f0(st);
    };
  }
  // Brekke at the corner table on a Thursday, tier 2 on: his one conversation (30 §4.6), then "Hello again."
  wrapMining() {
    const M = this.c.mining; if (!M || typeof M.talk !== 'function' || M.pTalk) return;
    const t0 = M.talk.bind(M); M.pTalk = true;
    M.talk = (who, o = {}) => {
      const s = this.story, st = M.live && M.live.get(who);
      if (this.on && who === 'brekke' && st && st.h && s.tier >= 2) {
        st.talked = true; s.meet('brekke', 'p');
        const len = s.doc && s.doc.ppl && s.doc.ppl.len;
        return this.open(st.h.speaker, 'Carl', P.BREKKE_TABLE, s.has('brekke.talked') ? 'again' : 'start', { room: P.FARM, ep: P.FARM, vars: { lake: (len && len.told) || '' } });
      }
      return t0(who, o);
    };
  }
  // the fallback caller's line, said first when their talk opens (whoever of the four is seen first after it is due)
  wrapTalk() {
    const D = this.c.talk; if (!D || typeof D.open !== 'function' || D.pWrapped) return;
    const open0 = D.open.bind(D); D.pWrapped = true;
    D.open = (o = {}) => {
      try {
        const s = this.story, key = o.speaker && String(o.speaker.key || ''), m = /^(?:cast|field):([a-z]+)/.exec(key);
        const who = (m && P.CALLERS[m[1]] ? m[1] : null) || (P.CALLERS[lower(o.name)] ? lower(o.name) : null);
        if (this.on && who && s.has('maggie.fallback') && !s.has('maggie.called') && !s.has('tauno.call')) {
          const text = T(P.CALLERS[who]), start = o.start;
          if (text && typeof start === 'function') { s.set('maggie.called', who, 'p:fallback'); return open0({ ...o, start: () => ({ say: text, by: o.name, choices: [{ text: '…', go: () => start() }] }) }); }
        }
      } catch (e) { console.warn('p: the fallback call', e); }
      return open0(o);
    };
  }

  // --- the keepers' story topics: "The Ledger?" and the leech-order pad (40 §6.2, §6.9) --------------------------------------
  keeperItems(v) {
    const s = this.story; if (!this.on || !v || !v.keeper) return [];
    const out = [], TP = this.c.topics, ep = Number(v.ep);
    if (s.when(P.KEEPER_LEDGER.when)) {
      const def = { id: 'p:ledger', who: 'keeper', nodes: { start: { say: [{ id: P.KEEPER_LEDGER.say[0], by: v.name }], then: P.KEEPER_LEDGER.then, end: true } } };
      out.push({ id: 'story:p.ledger', text: T(P.KEEPER_LEDGER.ask), pri: 3.4, tag: 'new', story: true, go: () => new SceneRun(TP, def, { who: 'keeper', args: this.args(ep), onEnd: () => {} }).node('start') });
    }
    if (s.when(P.PAD_TOPIC.when) && !this.runOn()) {
      out.push({ id: 'story:p.pad', text: T(P.PAD_TOPIC.ask), pri: 1.2, tag: null, story: true, go: () => this.padRun(v).node('start') });
    }
    return out;
  }
  padRun(v) {
    const s = this.story, pick = { ep: P.LAKE_ONE, n: 3 };
    const hooks = { one: () => { pick.ep = P.LAKE_ONE; }, gab: () => { pick.ep = P.LITTLE_GABBRO; },
      slip: () => {
        const name = pick.ep === P.LAKE_ONE ? 'Lake One' : 'Little Gabbro', w = T('d95.p.pad.slip', { n: pick.n, place: name });
        return w ? { text: w, by: null } : null;
      } };
    for (let k = 1; k <= 9; k++) hooks[`n${k}`] = () => { pick.n = k; this.order(pick.ep, k); };
    return new SceneRun(this.c.topics, { ...P.PAD, nodes: { ...P.PAD.nodes, done: { ...P.PAD.nodes.done, say: [{ hook: 'slip' }, { id: '40.pad.keeper', by: v.name, when: 'firstOrder' }] } } }, { who: 'pad', args: this.args(Number(v.ep)), hooks });
  }
  order(ep, dozens) { const s = this.story; s.doc.meeting = P.meetingFrom(this.abs(), ep, dozens); s.dirty(); s.emit('meeting', { ...s.doc.meeting }); return s.doc.meeting; }
  tierWord(ctx = {}) {
    const s = this.story; if (!this.on || this.runOn() || s.has('end')) return null;
    const t = s.tier, ep = Number(ctx.ep), m = monthOf(this.abs());
    const ok = TALK.filter(([tt, , c1, c2]) => tt === Math.min(t, 4) && (!c1 || (c1 === 'farm' ? ep === P.FARM : c1 === 'hog' ? ep === P.HOG : true)) && (!c2 || m >= 8));
    if (!ok.length) return null;
    const [, id] = ok[s.hash(`ptalk:${Math.floor(this.abs() / 7)}:${ep}`) % ok.length];
    const text = T(id); return text ? { id, text } : null;
  }

  // --- a counter: Dan, Wade, Josie's slip, the Hog Creek keeper (40 §3.1, §3.2, §3.7, §4.3, §4.4) -----------------------------
  storeEnter(ep) {
    if (!this.on || ep == null) return;
    const s = this.story; this.visitN++;
    const L = storeLayout(ep), at = L && SPOT_OF(L, 'counter'); if (!at) return;
    const home = this.c.cast && typeof this.c.cast.home === 'function' ? this.c.cast.home() : null;
    this.counter = { ep, L, at, home: Number(home) === Number(ep), since: performance.now(), wade: null, dan: null, josie: false };
    // Wade first, at the next counter after the search
    if (s.has('ev.search') && !s.has('wade.counter')) this.stageWade(ep, L, at);
    const due = P.danDue(s, { visitN: this.visitN, lastDan: this.lastDan, hasLid: this.has('leolid'), hasBlade: this.has('shovelblade'), run: this.runOn() });
    if (due && !this.counter.wade) this.stageDan(ep, L, at, due);
    // the Hog Creek keeper: early ("A woman booked a bunk"), and back the next season
    if (Number(ep) === P.HOG && s.has('maggie.note') && !s.has('maggie.met')) setTimeout(() => this.keeperBark(ep, '40.hog.early', () => s.set('maggie.bunk', true, 'p:hog')), 1500);
    if (Number(ep) === P.HOG && s.has('maggie.met') && s.keys('year.turned.').length && !s.has('maggie.back')) setTimeout(() => this.keeperBark(ep, '40.hog.back', () => s.set('maggie.back', true, 'p:hog')), 1500);
  }
  keeperBark(ep, id, after) {
    const N = this.c.npcs; if (!N || typeof N.at !== 'function') return false;
    const k = (N.at(ep) || []).find((q) => q.keeper); const w = T(id); if (!k || !w) return false;
    try { N.bark(k, 0, w, 3); if (after) after(); return true; } catch { return false; }
  }
  side(at, d = 0.9) { return { x: at.x + Math.cos(at.heading || 0) * d, z: at.z - Math.sin(at.heading || 0) * d, heading: at.heading || 0 }; }
  stageDan(ep, L, at, due) {
    const s = this.story, F = this.person('dan', 'dan', this.side(at), 'Dan'); if (!F) return;
    this.lastDan = this.visitN; this.counter.dan = due;
    F.onTalk = () => this.danTalk(due);
    // he talks first (the only one who does): the meeting, the offer, the set-up
    if (due === 'meet' || due === 'offer' || due === 'setup') this.counter.danAuto = true;
    if (due === 'junk' && this.has('leolid') && !s.has('dan.lid')) setTimeout(() => { if (this.at.get('dan')) F.say(T('30:4.3.10')); }, 2500);
  }
  danTalk(due) {
    const F = this.at.get('dan'); if (!F) return false;
    this.counter && (this.counter.danAuto = false);
    const hooks = {
      card: () => this.give('dancard'),
      keeper: () => setTimeout(() => this.keeperBark(this.counter && this.counter.ep, '40:3.1.14'), 4000),
      sellLid: () => { const i = this.c.inventory; try { if (i && i.remove('leolid', 1)) this.pay(P.LID_PRICE, 'Dan, the history wall'); } catch (e) { console.warn('p: the lid', e); } },
      sellBlade: () => { const i = this.c.inventory; try { if (i && i.remove('shovelblade', 1)) this.pay(P.BLADE_PRICE, 'Dan, the history wall'); } catch (e) { console.warn('p: the blade', e); } },
    };
    const start = due === 'meet' ? 'meet' : due === 'offer' ? 'offer' : due === 'setup' ? 'setup' : this.has('leolid') && !this.story.has('dan.lid') ? 'lid' : 'junk';
    return this.open(F.speaker, 'Dan', P.DAN, start, { hooks, room: this.counter && this.counter.ep, ep: this.counter && this.counter.ep, onEnd: () => this.leave('dan', 4000) });
  }
  pay(n, line) { const s = this.story; s.action('pay', `${n} ${line}`, { rule: 'p:dan' }); }
  leave(key, ms) { setTimeout(() => { const D = this.c.talk; if (!(D && D.convo)) this.drop(key); }, ms); }
  stageWade(ep, L, at) {
    const s = this.story, F = this.person('wade', 'wade', at, 'Wade'); if (!F) return;
    this.counter.wade = { F, phase: 'counter', t: 0, door: L.door ? { x: L.door.x, z: L.door.z } : null };
    s.set('wade.counter', true, 'p:counter');
    const lake = s.get('ev.search'); this.RT['p.rt.lakeq'] = { k: 'choice', text: (T('40:4.3.c2') || '').replace('{the lake of the search}', typeof lake === 'string' ? lake : 'the lake') };
    F.onTalk = () => { this.counter.wade.phase = 'talk'; return this.open(F.speaker, s.has('wade.named') ? 'Wade' : (T('d95.p.wade.dot') && s.when('read:NB86') ? T('d95.p.wade.dot').replace(/\.$/, '') : 'Wade'), P.WADE_COUNTER, 'start', { room: ep, ep, hooks: { go: () => {} }, onEnd: () => { this.counter && this.counter.wade && (this.counter.wade.phase = 'out'); } }); };
  }
  counterTick(p) {
    const k = this.counter; if (!k) return;
    const D = this.c.talk, talking = !!(D && D.convo), o = this.c.outfitter, inside = !!(o && o.visit && o.visit.ep === k.ep);
    const W = k.wade;
    if (W && W.F) {
      const F = W.F, near = Math.hypot(p.x - F.x, p.z - F.z);
      if (W.phase === 'counter' && near < 7) { W.phase = 'pass'; W.t = 0; F.say(T('40:4.3.1')); }
      else if (W.phase === 'pass' && !talking) {
        W.t += TICK;
        if (W.t > 2.5 && W.door) {
          const dx = W.door.x - F.x, dz = W.door.z - F.z, d = Math.hypot(dx, dz), st = Math.min(d, 1.2 * TICK);
          if (!W.said && W.t > 3) { W.said = true; F.say(T('40:4.3.2')); }
          if (d > 0.4) F.moveTo(F.x + (dx / d) * st, F.z + (dz / d) * st, Math.atan2(dx, dz)); else W.phase = 'out';
        } else if (W.t > 14) W.phase = 'out';
      }
      if (W.phase === 'out' && !talking) {
        this.drop('wade'); k.wade = { gone: true };
        setTimeout(() => this.keeperBark(k.ep, k.home && this.c.cast && this.c.cast.home() === k.ep && this.isJosieHome() ? '40.wade.josie' : '40:4.3.11'), 1500);
        // Dan's turn if he was due (the counter is his now)
        const due = P.danDue(this.story, { visitN: this.visitN, lastDan: this.lastDan, hasLid: this.has('leolid'), hasBlade: this.has('shovelblade'), run: this.runOn() });
        if (due && inside) this.stageDan(k.ep, k.L, k.at, due);
      }
    }
    // Dan talks first
    const Fd = this.at.get('dan');
    if (k.danAuto && Fd && !talking && Math.hypot(p.x - Fd.x, p.z - Fd.z) < 5 && performance.now() - k.since > 1500) { k.danAuto = false; this.danTalk(k.dan); }
    // Josie's slip at the home counter, after Wade has gone
    const s = this.story;
    if (k.home && s.has('ev.search') && !s.has('maggie.note') && !(W && W.F) && !talking && !k.josie && inside && Math.hypot(p.x - k.at.x, p.z - k.at.z) < 5) { k.josie = true; this.josieSlip(k); }
    if (!inside && !talking && performance.now() - k.since > 3000) { if (this.at.get('dan')) this.drop('dan'); if (k.wade && k.wade.F) { this.drop('wade'); } this.counter = null; }
  }
  isJosieHome() { const C0 = this.c.cast; if (!C0 || !C0.live) return false; for (const st of C0.live.values()) if (st.who === 'josie') return true; return false; }
  josieSlip(k) {
    const C0 = this.c.cast; let sp = null, room = k.ep;
    if (C0 && C0.live) for (const st of C0.live.values()) if (st.who === 'josie' && st.h && st.h.speaker) sp = st.h.speaker;
    if (!sp) { const F = this.person('josie', 'josie', k.at, 'Josie'); sp = F && F.speaker; }
    const s = this.story;
    return this.open(sp, 'Josie', P.JOSIE_LEECH, 'start', { room, ep: k.ep,
      hooks: { slip: () => { this.give('page:leechslip'); s.set('maggie.note', Math.floor(this.abs()), 'p:josie'); this.ring({ ep: P.HOG }, 'Josie'); } },
      onEnd: () => this.leave('josie', 3000) });
  }
  ring(target, by) { const TP = this.c.topics; try { if (TP && typeof TP.ring === 'function') TP.ring(target, { by }); } catch (e) { console.warn('p: ring', e); } }

  // --- Maggie at Hog Creek 36 (40 §6.4–§6.9) ---------------------------------------------------------------------------------
  maggieTick(p) {
    const s = this.story, abs = this.abs(), h = this.hours();
    const want = P.maggieHere(s, { abs, hours: h, month: monthOf(abs) }), L = storeLayout(P.HOG);
    if (!want || !L || Math.hypot(L.door.x - p.x, L.door.z - p.z) > 160) { if (this.at.get('maggie') && !this.talkingTo('maggie')) this.drop('maggie'); return; }
    const where = P.maggieWhere(h), B = L.axes ? L.axes.b : { x: 0, z: 1 };
    const spot = where === 'dock' && L.dock ? { x: L.dock.x, z: L.dock.z } : where === 'dock' ? { x: L.door.x + B.x * 9, z: L.door.z + B.z * 9 } : { x: L.door.x + B.x * 2.2, z: L.door.z + B.z * 2.2 };
    const F0 = this.at.get('maggie');
    if (F0 && F0.where === where) return;
    if (F0 && this.talkingTo('maggie')) return;
    const F = this.person('maggie', 'maggie', { ...spot, heading: Math.atan2(B.x, B.z) }, 'Maggie'); if (!F) return;
    F.where = where;
    F.onTalk = () => this.maggieTalk(F);
  }
  talkingTo(key) { const F = this.at.get(key); return !!(F && F.talking); }
  maggieTalk(F) {
    const s = this.story, first = !s.has('maggie.met');
    if (first) s.meet('maggie', 'p');
    F.talking = true;
    const caller = String(s.get('maggie.called') || (s.has('maggie.fallback') ? '' : 'tauno'));
    const hooks = {
      heard1: () => (P.HEARD[caller] ? { id: P.HEARD[caller], by: 'Maggie' } : { id: '40:6.4.10', by: 'Maggie' }),
      heard2: () => { const w = T('40:6.4.11'); if (!w) return null; return { text: ['marlys', 'sheila', 'carol'].includes(caller) ? w.replace(/^He said/, T('40.maggie.callers.1') || 'She said') : w, by: 'Maggie' }; },
      letter: () => { this.give('page:walt2019'); },
      beside: () => {},
      papers: () => { for (const id of ['page:ostrander', 'page:ostrander.blue', 'page:boreal1976', 'page:kettlemap']) this.give(id); },
      rings: () => { this.ring({ ep: P.LAKE_ONE }, 'Maggie'); this.ring({ ep: P.LITTLE_GABBRO }, 'Maggie'); },
      paperFirst: () => { if (s.has('maggie.paper')) return null; s.set('maggie.paper', true, 'p:maggie'); return { id: '40:6.6.15', by: 'Maggie' }; },
      bigSeen: () => { if (s.doc && s.doc.dir) s.doc.dir.pbig = s.bigCount; },
    };
    return this.open(F.speaker, 'Maggie', P.MAGGIE, first ? 'first' : 'again', { hooks, room: P.HOG, ep: P.HOG,
      bye: s.has('maggie.meeting') ? P.MAGGIE_BYE.meet : P.MAGGIE_BYE.first, onEnd: () => { F.talking = false; } }) || (F.talking = false);
  }

  // --- the trip: Wade at the put-in, tier 4's truck, the car search (40 §3.8, §8.1, §8.2) --------------------------------------
  tripStart(ep) {
    if (!this.on) return;
    const s = this.story, L = ep != null ? trailheadLayout(ep) : null;
    this.trip = { ep, packsAway: 0, campAway: 0 };
    if (!L) return;
    const box = L.box || L.lot, lot = L.lot, d = { x: (L.landing.x - lot.x), z: (L.landing.z - lot.z) }, dl = Math.hypot(d.x, d.z) || 1, q = { x: -d.z / dl, z: d.x / dl };
    if (s.tier >= 3 && s.has('wade.counter') && !s.has('wade.putin') && this.daylight()) {
      const tAt = { x: box.x - (d.x / dl) * 3 + q.x * 2, z: box.z - (d.z / dl) * 3 + q.z * 2 }, face = Math.atan2(-d.x, -d.z);
      this.mesh('putin.truck', truckGeo(0x34363a), tAt, face);
      const F = this.person('wadeputin', 'wade', { x: tAt.x - q.x * 1.3, z: tAt.z - q.z * 1.3, heading: Math.atan2(q.x, q.z) }, 'Wade');
      if (F) { this.putin = { ep, F, name: L.name || `EP ${ep}` }; F.onTalk = () => this.putinTalk(); }
    }
    if (s.tier >= 4 && !this.runOn()) {
      this.mesh('t4.truck', truckGeo(0x5a5e60), { x: lot.x + q.x * (lot.r - 3), z: lot.z + q.z * (lot.r - 3) }, Math.atan2(d.x, d.z));
      const fam = typeof window !== 'undefined' && window.__game && window.__game.storyFamily;
      try { if (fam && fam.familyCast) fam.familyCast.truck = { day: Math.floor(this.abs()), ep }; } catch { /* a4's */ } // (33 §6.11: a4's truck lines)
    }
  }
  putinTalk() {
    const k = this.putin; if (!k || !k.F || k.done) return false;
    k.done = true; const s = this.story;
    return this.open(k.F.speaker, s.has('wade.named') ? 'Wade' : 'A man by a pickup', P.WADE_PUTIN, 'start', { room: null, ep: k.ep,
      hooks: { putin: () => s.set('wade.putin', k.name, 'p:putin'), mug: () => {} }, onEnd: () => { k.F.talking = false; } });
  }
  putinTick(p) {
    const k = this.putin; if (!k || !k.F) return;
    const d = Math.hypot(p.x - k.F.x, p.z - k.F.z), D = this.c.talk;
    if (!k.done && d < 6 && p.onFoot !== false && !(D && D.convo)) this.putinTalk();
    // he starts the engine once the player is out of sight of the landing
    if (d > 250 && !(D && D.convo)) { this.drop('wadeputin'); this.dropMesh('putin.truck'); this.putin = null; }
  }
  tripEnd() {
    const s = this.story; this.dropMesh('t4.truck'); this.dropMesh('putin.truck'); this.drop('wadeputin'); this.putin = null;
    // the third staging (§8.2): the car in the lot, for a player who never leaves a camp
    if (this.on && P.searchDue(s) && s.since('days', 'midpoint') >= P.SEARCH_CAR_DAYS) this.search('car', 'the truck');
    this.trip = null;
  }

  // --- the camp search (40 §4.2; §8.2 three stagings) ---------------------------------------------------------------------
  searchTick(p, dtGame) {
    const s = this.story; if (!P.searchDue(s) || !this.trip || this.runOn()) return;
    const cp = this.c.camp, tent = cp && cp.camp;
    if (tent && tent.stage >= 4 && tent.site && this.daylight()) {
      const d = Math.hypot(p.x - tent.x, p.z - tent.z);
      if (d > P.SEARCH_AWAY) this.trip.campAway += dtGame; else this.trip.campAway = 0;
      if (this.trip.campAway >= P.SEARCH_MINS / 60) { this.search('camp', this.lakeAt(tent.x, tent.z), tent); return; }
    }
    // packs left at a carry's end
    const inv = this.c.inventory, set = inv && (inv.containers || []).find((c) => c.where === 'ground' && c.at && (itemDef(c.item) || {}).wear);
    if (set && this.daylight() && Math.hypot(p.x - set.at.x, p.z - set.at.z) > P.SEARCH_AWAY) {
      this.trip.packsAway += dtGame;
      if (this.trip.packsAway >= P.SEARCH_PACKS_MINS / 60) this.search('packs', this.lakeAt(set.at.x, set.at.z), set.at);
    } else if (this.trip) this.trip.packsAway = 0;
  }
  lakeAt(x, z) { const w = this.c.world; try { const id = w && w.lakeIdAt ? w.lakeIdAt(x, z) : null; return (id != null && w.lakeName ? w.lakeName(id) : null) || this.lake || 'the lake'; } catch { return this.lake || 'the lake'; } }
  search(kind, lake, at = null) {
    const s = this.story; if (!P.searchDue(s)) return false;
    this.tidy(kind);
    s.set('ev.search', String(lake || 'here'), `p:search.${kind}`);
    this.searched = { kind, at: at ? { x: at.x, z: at.z } : null };
    // optional: a green Kevlar going round a far point as the player comes back (no dot names at that range)
    if (at) this.farKevlar(at);
    if (kind === 'car') this.searchedThought = true;
    return true;
  }
  // every grid re-sorted by kind, heavy low, small together (40 §9 builder note 1); nothing taken
  tidy(kind) {
    const inv = this.c.inventory; if (!inv || !inv.containers) return 0;
    const pool = kind === 'camp' && typeof inv.campReach === 'function' ? inv.campReach() : inv.containers.filter((c) => !['back', 'chest', 'hands'].includes(c.where));
    let n = 0;
    for (const c of pool) {
      const orig = c.grid.slice(), loose = orig.filter((e) => !e.box);
      if (loose.length < 2) continue;
      const rank = (e) => { const d = itemDef(e.id) || {}; const i = KIND_ORDER.indexOf(d.kind); return [i < 0 ? 99 : i, -(d.kg || 0), String(e.id)]; };
      loose.sort((a, b) => { const A = rank(a), B0 = rank(b); return A[0] - B0[0] || A[1] - B0[1] || (A[2] < B0[2] ? -1 : A[2] > B0[2] ? 1 : 0); });
      c.grid = orig.filter((e) => e.box);
      let ok = true;
      for (const e of loose) { const f = inv.firstFit(c, e.id); if (!f) { ok = false; break; } e.x = f.x; e.y = f.y; e.rot = f.rot; c.grid.push(e); }
      if (!ok) { c.grid = orig; continue; }
      n++;
    }
    if (n) { inv.dirty = true; try { inv.emit('containers'); } catch { /* */ } }
    return n;
  }
  searchBack(p) {
    const k = this.searched; if (!k || this.said.has('40:4.2.c1')) return;
    if (k.kind === 'car' ? this.searchedThought && this.c.outfitter && this.c.outfitter.visit : k.at && Math.hypot(p.x - k.at.x, p.z - k.at.z) < 18) this.thought('40:4.2.c1');
  }
  farKevlar(at) {
    const A = this.c.actors, w = this.c.world; if (!A || !w || !w.deeperDir) return;
    try {
      const dir = w.deeperDir(at.x, at.z), L = Math.hypot(dir.x, dir.z) || 1, x = at.x + (dir.x / L) * 650, z = at.z + (dir.z / L) * 650;
      const crew = [A.person({ key: 'p:far:0' }), A.person({ key: 'p:far:1' })], b = A.boat({ key: 'p:far', hull: 'green', crew, packs: 0 });
      this.far = { b, crew, x, z, h: Math.atan2(dir.x, dir.z), t: 0 };
    } catch (e) { console.warn('p: the far Kevlar', e); }
  }
  farTick() {
    const f = this.far; if (!f) return;
    f.t += TICK; f.x += Math.sin(f.h) * 1.3 * TICK; f.z += Math.cos(f.h) * 1.3 * TICK;
    try { f.b.drive({ x: f.x, z: f.z, heading: f.h, v: 1.3 }); } catch { /* */ }
    if (f.t > 60) { try { for (const q of f.crew) q.remove(); f.b.remove(); } catch { /* */ } this.far = null; }
  }

  // --- the stranger at the far landing (40 §3.4: tier 2, once, daylight, a leaked or belt lake, never Gull's carries) ------------
  carried(e) {
    const s = this.story, p = this.c.player; if (!this.on || !p || s.has('ev.stranger') || s.tier < 2 || !this.daylight() || this.runOn()) return;
    const name = String(e.name || ''); if (/Gull|Pietro|P25[56]|530/i.test(name)) return;
    const lake = this.lakeAt(p.x, p.z), told = Object.values((s.doc && s.doc.ppl) || {}).map((q) => q && q.told).filter(Boolean);
    if (!BELT.test(String(lake)) && !told.some((t) => String(t) === String(lake))) return;
    const w = this.c.world, dir = w && w.deeperDir ? w.deeperDir(p.x, p.z) : { x: 1, z: 0 }, L = Math.hypot(dir.x, dir.z) || 1, u = { x: dir.x / L, z: dir.z / L };
    const at = { x: p.x + u.x * 9, z: p.z + u.z * 9, heading: Math.atan2(-u.x, -u.z) };
    s.set('ev.stranger', name || 'the portage', 'p:stranger');
    const F = this.person('stranger', 'stranger', at, T('40.stranger.dot') || 'Man with a canoe'); if (!F) return;
    this.stranger = { F, at, u, t: 0 };
    this.target('cig', { x: at.x, z: at.z, r: 1.2, y: 0.1, label: T('40:3.4.c1'), verb: 'Pick up', run: () => { this.give('cigbutt'); this.untarget('cig'); } });
  }
  strangerTick() {
    const k = this.stranger; if (!k) return;
    k.t += TICK;
    if (k.t > 8 && k.F) {
      this.drop('stranger'); k.F = null;
      const A = this.c.actors; try { const crew = [A.person({ key: 'p:str:0' })]; k.b = A.boat({ key: 'p:str', hull: 'green', crew, packs: 0 }); k.crew = crew; k.x = k.at.x + k.u.x * 5; k.z = k.at.z + k.u.z * 5; } catch { /* */ }
    }
    if (k.b) { k.x += k.u.x * 1.6 * TICK; k.z += k.u.z * 1.6 * TICK; try { k.b.drive({ x: k.x, z: k.z, heading: Math.atan2(k.u.x, k.u.z), v: 1.6 }); } catch { /* */ } }
    if (k.t > 200) { try { if (k.b) { for (const q of k.crew) q.remove(); k.b.remove(); } } catch { /* */ } this.untarget('cig'); this.stranger = null; }
  }

  // --- the watchers' postings as sightings (§8.1): a green Kevlar, two men, no rods, sitting still ---------------------------
  sightTick(p) {
    const W = this.c.watchers, A = this.c.actors, s = this.story; if (!W || !A || this.runOn()) { this.undrawSightings(); return; }
    let list = [];
    try { list = W.postings(Math.floor(this.abs())) || []; } catch { list = []; }
    const h = this.hours(), live = new Set();
    for (const r of list) {
      if (r.drawnBy || !(h >= r.from && h < r.to)) continue; // (stream i draws its own canary)
      const d = Math.hypot(r.x - p.x, r.z - p.z); if (d > 1300) continue;
      live.add(r.id);
      let b = this.sight.get(r.id);
      if (!b) { try { const crew = [A.person({ key: `p:w:${r.id}:0` }), A.person({ key: `p:w:${r.id}:1` })]; b = { b: A.boat({ key: `p:w:${r.id}`, hull: 'green', crew, packs: 0 }), crew }; this.sight.set(r.id, b); } catch { continue; } }
      try { b.b.drive({ x: r.x, z: r.z, heading: (s.hash(r.id) % 628) / 100, v: 0 }); } catch { /* */ }
      if (d < 800) { const k = `ev.watchers@${r.lake || 'here'}`; if (!s.has(k)) s.set(k, Math.floor(this.abs()), 'p:sighting'); }
    }
    for (const [id, b] of this.sight) if (!live.has(id)) { try { for (const q of b.crew) q.remove(); b.b.remove(); } catch { /* */ } this.sight.delete(id); }
  }
  undrawSightings() { for (const [, b] of this.sight) { try { for (const q of b.crew) q.remove(); b.b.remove(); } catch { /* */ } } this.sight.clear(); }

  // --- the canoe adrift (40 §5; m's storyMech.adrift) -------------------------------------------------------------------------
  slept(e) {
    const s = this.story; if (!this.on || (e.hours != null && e.hours < 4)) return;
    const cp = this.c.camp, tent = cp && cp.camp, w = this.c.world, wind = this.c.wind;
    let shore = Infinity; try { if (tent && w && typeof w.shoreAt === 'function') shore = Math.abs(w.shoreAt(tent.x, tent.z)); } catch { shore = Infinity; }
    const ok = P.adriftDue(s, { month: monthOf(this.abs()), ice: s.has('iced') || false, wind: wind ? wind.speed : 0, shore, island: !!(tent && tent.site && tent.site.island), run: this.runOn() });
    if (!ok || !tent || !tent.site) return;
    this.adrift(tent);
  }
  adrift(tent = null) {
    const M = this.c.mech, s = this.story, p = this.c.player; if (!M || typeof M.adrift !== 'function') return null;
    const r = M.adrift({ site: tent && tent.key != null ? String(tent.key) : null }); if (!r) return null;
    // every paddle left in camp is gone (Walt's spare lashed in the canoe stays); stood upright where the drift will ground
    const inv = this.c.inventory, took = [];
    if (inv && Array.isArray(inv.long)) for (const l of inv.long.slice()) { const d = itemDef(l.id) || {}; if (d.long === 'paddle' && !['sparepaddle'].includes(l.id) && l.where !== 'hands') { inv.long.splice(inv.long.indexOf(l), 1); took.push(l.id); } }
    if (took.length) { try { inv.refreshUse(); inv.emit('long'); inv.dirty = true; } catch { /* */ } }
    const end = r.end || (p ? { x: p.x, z: p.z } : null);
    if (end) {
      took.forEach((id, i) => {
        const at = { x: end.x + i * 0.5, z: end.z + 0.3 }, key = `paddle${i}`;
        this.mesh(key, paddleGeo(), at, 0.3 * i);
        this.target(key, { x: at.x, z: at.z, r: 1.4, y: 1.0, label: itemDef(id) ? itemDef(id).name : 'Paddle', verb: 'Take', run: () => { try { inv.give(id); } catch { /* */ } this.dropMesh(key); this.untarget(key); } });
      });
    }
    this.adrifted = { end, took, t: 0 };
    if (s.emit) s.emit('adrift', { end, took });
    return r;
  }

  // --- Maggie's note under the Little Gabbro box (40 §6.9) ------------------------------------------------------------------
  gabbroTick(p) {
    const s = this.story, M = s.doc && s.doc.meeting; if (!M || Number(M.ep) !== P.LITTLE_GABBRO || s.has('maggie.lgnote') || !this.runOn()) return;
    const th = trailheadAt(p.x, p.z), h = this.hours(); if (!th || th.where !== 'lot' || th.L.ep !== P.LITTLE_GABBRO || h < 5 || h > 21 || this.abs() < M.firstDawn) return;
    s.set('maggie.lgnote', true, 'p:gabbro');
    s.doc.meeting = { ep: P.FARM, firstDawn: Math.floor(this.abs()) + 1, from: P.LITTLE_GABBRO, set: Math.floor(this.abs()) }; s.dirty();
    const L = th.L, lot = L.lot;
    [0, 1, 2].forEach((i) => this.mesh(`lg.truck${i}`, truckGeo(i ? 0x4a4e52 : 0x34363a), { x: lot.x + (i - 1) * 3.4, z: lot.z + 3 }, 0));
    this.give('page:maggienote');
    this.note(`${T('note.maggie.meet') ? T('note.maggie.meet').replace(/\n+/g, ' ') : ''}`, 8);
  }

  // --- the frame -----------------------------------------------------------------------------------------------------------
  update(dt) {
    if (!this.on) return;
    this.t += dt; if (this.t < TICK) return;
    const step = this.t; this.t = 0;
    const p = this.c.player; if (!p) return;
    const nowAbs = this.abs(), dtGame = this.lastAbs != null ? Math.max(0, Math.min(0.5, (nowAbs - this.lastAbs) * 24)) : 0; this.lastAbs = nowAbs; void step;
    try {
      this.counterTick(p); this.maggieTick(p); this.putinTick(p); this.searchTick(p, dtGame); this.searchBack(p);
      this.farTick(); this.strangerTick(); this.sightTick(p); this.gabbroTick(p);
    } catch (e) { if (!this.warned) { this.warned = true; console.warn('p: the company', e); } }
  }

  makeDebug() {
    const self = this;
    return {
      state() { const s = self.story; return { tier: s.tier, big: s.bigCount, midpoint: s.has('midpoint'), search: s.get('ev.search'), meeting: s.doc && s.doc.meeting, maggie: !!self.at.get('maggie'), dan: !!self.at.get('dan'), wade: !!self.at.get('wade'), counter: self.counter ? self.counter.ep : null, sightings: [...self.sight.keys()], adrift: self.adrifted || null }; },
      search(kind = 'camp') { const p = self.c.player; return self.search(kind, self.lakeAt(p.x, p.z), { x: p.x, z: p.z }); },
      enter(ep) { self.storeEnter(ep); return self.counter ? { ep: self.counter.ep, dan: self.counter.dan || null, wade: !!(self.counter.wade && self.counter.wade.F) } : null; },
      dan() { return self.danTalk(self.counter && self.counter.dan || 'junk'); },
      wade() { const W = self.counter && self.counter.wade; return W && W.F && W.F.onTalk ? W.F.onTalk(W.F) : false; },
      josie() { const k = self.counter; return k ? self.josieSlip(k) : false; },
      maggie() { const F = self.at.get('maggie'); return F ? self.maggieTalk(F) : false; },
      maggieAt() { const F = self.at.get('maggie'); return F ? { x: F.x, z: F.z, where: F.where } : null; },
      order(ep, n) { return self.order(ep, n); },
      putin(ep) { self.tripStart(ep); return !!self.putin; },
      putinTalk() { return self.putinTalk(); },
      adrift() { return self.adrift(self.c.camp && self.c.camp.camp); },
      stranger(name = 'test carry') { self.carried({ name }); return !!self.stranger; },
      sightings() { return [...self.sight.keys()]; },
      store(ep) { const L = storeLayout(ep); return !!(L && L.keeper); },
      lots() { return trailheadLayouts().map((L) => L.ep); },
      lot(ep) { return trailheadLayout(ep); },
      brekke() { const M = self.c.mining; return M && M.talk ? M.talk('brekke') : false; },
      tauno() { const M = self.c.mining, C0 = self.c.cast, st = C0 && C0.live && [...C0.live.values()].find((q) => q.who === 'tauno'); return st && M ? M.farmTalk(st) : false; },
    };
  }
}

export const company = new Company();
