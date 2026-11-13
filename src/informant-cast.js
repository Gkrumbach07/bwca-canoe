// The informant in the world (campaign stream i, Round 5's second half; docs/story/32-the-boys.md §5.10–§5.17, §6, §9;
// campaign-design §5.2, §8.1, §12; Part 4 Round 5): Denny's cabin ten minutes down the Sawbill Trail and Denny on its porch of
// an evening (June–October, 17–23); the canary (32 §5.11: "Where are you headed next?" with a lake picked on the map, the
// two rings Denny draws on it, the green Kevlar posted at the ringed site the next days and paddling off as you come in
// sight, or the word of it at your counter; a lake told only to Frank or Bob coming back empty); the counter lines (Denny's
// visit and calls, the turned Denny's message, the quiet one's, the note, Frank's folder); the reveal and its three choices,
// at the cabin or on Walt's rock on the 14th (stream b5's boysCast.onRock, or Denny staged here when b5 isn't loaded);
// Frank cold after an accusation. The Isabella camp itself is the layer's (story-places.json i.isabella). Loaded only under
// STORY_ON (main.js's `// i:` block). A co-op guest's story is a mirror: nothing is staged for them.
//
//   informantCast.attach({ story, talk, topics, npcs, cast, player, day, world, scene, tiles, actors, pointer, hud, veil,
//                          inventory, pencil, profile })
//   informantCast.update(dt) · informantCast.talk(who, opts) → bool (who: 'denny' | 'frank' | 'bob') · informantCast.cabinAt()
//   informantCast.debug { cabin(), canary(who, lake), told(), posting(), counter(ep), state() }
import * as THREE from 'three';
import { SceneRun, T, texts } from './topics.js';
import { storeLayout } from './props.js';
import { kit, rngFor } from './story-props.js';
import { propMaterial } from './prop-kit.js';
import { registerSensor } from './story-cond.js';
import { defineItem, definePage, itemDef } from './items.js';
import { FieldPerson, decorate } from './kettle.js';
import { addPosting, watchers } from './watchers.js';
import * as I from './story-data/informant.js';

for (const k of Object.keys(I.I_SENSORS)) registerSensor(k, 'flag');
export const ITEM = { receipt: 'receipt19', note: 'page:dennynote', note2: 'page:dennynote2', folder: 'kosirfolder', card: 'dennycard' };
const TICK = 0.5, CABIN_NEAR = 320, TALK_DAYS = [2, 4];
const RECEIPT = 'Ely · 08/06/19 · UNL 14.2 gal · $38.91 · ACCT HELSTROM SITE SERVICES'; // (32 §5.10: the receipt's own printing)
const CARD = 'DENNIS RASK · RASK AGENCY · INSURANCE · DULUTH. The office number crossed out in ballpoint; under it, by hand: 218-555-0163'; // (b5's, if b5 isn't loaded)

let defined = false;
function defineItems() {
  if (defined) return; defined = true;
  try { if (!itemDef(ITEM.receipt)) defineItem({ id: ITEM.receipt, name: 'Fuel receipt, Aug 2019', short: 'Receipt', kind: 'gear', w: 1, h: 1, kg: 0.002, price: 0, sold: false, unique: true, unsellable: true, kept: true, identity: RECEIPT, story: 'i' }); } catch (e) { console.warn('informant: the receipt', e); }
  try { if (!itemDef(ITEM.folder)) defineItem({ id: ITEM.folder, name: 'The folder (copies)', short: 'Folder', kind: 'gear', w: 1, h: 2, kg: 0.05, price: 0, sold: false, unique: true, unsellable: true, kept: true, identity: T('d95.i.folder') || 'Six photocopies, slightly crooked.', story: 'i' }); } catch (e) { console.warn('informant: the folder', e); }
  try { if (!itemDef(ITEM.card)) defineItem({ id: ITEM.card, name: 'Denny\'s card', short: 'Card', kind: 'gear', w: 1, h: 1, kg: 0.002, price: 0, sold: false, unique: true, unsellable: true, identity: CARD, story: 'b5' }); } catch (e) { console.warn('informant: the card', e); }
  try { if (!itemDef(ITEM.note)) definePage({ id: 'dennynote', title: 'A folded sheet of motel notepaper', ref: '32:5.17.note', by: 'Denny' }); } catch { /* defined */ }
  try { if (!itemDef(ITEM.note2)) definePage({ id: 'dennynote2', title: 'A folded sheet of motel notepaper', ref: 'd95.i.note.never', by: 'Denny' }); } catch { /* defined */ }
}
// 32 §5.15's confession, one beat a paragraph: its quoted words (the stage directions go: they are the doc's, not his)
export function confBeats(text) {
  return String(text || '').split(/\n\s*\n/).map((p) => [...p.matchAll(/"([^"]+)"/g)].map((m) => m[1].trim()).join(' ').replace(/\s+/g, ' ').trim()).filter(Boolean);
}

class InformantCast {
  constructor() { this.c = {}; this.t = 0; this.offs = []; this.cabin = null; this.denny = null; this.rockDenny = null; this.watch = new Map(); this.vars = { lake: '' }; this.pending = null; this.visitF = null; this.debug = this.makeDebug(); }
  attach(c = {}) {
    Object.assign(this.c, c);
    const s = this.c.story; if (!s) return this;
    defineItems();
    // the scenes' own conditions, read live
    const S = (name, fn) => this.offs.push(s.sensor(name, fn));
    S('tell2Due', () => s.when('f:marlys.loft | f:marlys.night | f:gy.register | tier>=3 | met:denny>=3'));
    S('tell3Due', () => s.when('tier>=4 | count(case.denny.*)>=2'));
    S('canaryOn', () => !s.has('choice.denny'));
    S('frankCold', () => !!(s.doc && s.doc.ppl && s.doc.ppl.frank && s.doc.ppl.frank.cold));
    S('atRock', () => !!this.atRockNow);
    S('atCabin', () => !this.atRockNow);
    S('weekSince', () => true);
    this.offs.push(s.on('store:enter', (e) => this.storeEnter(e && e.ep)));
    this.offs.push(s.on('season', () => this.clear()));
    // the canary's watchers as a posting row (watchers.js `// i:`): the site Denny ringed on a lake told only to him, the
    // told day + 1 to + 5, 8:00–19:00, until any reveal choice; drawn here (they paddle off as you come in sight)
    try { if (!watchers.c.story) watchers.attach({ story: s, world: this.c.world, actors: this.c.actors, scene: this.c.scene }); } catch { /* the run attaches it too */ } // (postings() read in the day world before any run)
    addPosting({ id: 'i-canary', when: 'true', drawnBy: 'i', hours: I.CANARY.hours, place: (st, abs) => this.canaryPostings(st, abs) });
    // stream b5's rock on the 14th: its Denny held there while the reveal is ready (b5 calls onRock at 20:15)
    this.hookRock();
    return this;
  }
  get story() { return this.c.story || null; }
  get on() { const s = this.story; return !!(s && s.doc && s.mode !== 'mirror'); }
  today() { const s = this.story; return s ? Math.floor(s.nowAbs()) : 0; }
  boys() { const g = typeof window !== 'undefined' ? window.__game : null; return (g && g.storyBoys && g.storyBoys.boysCast) || null; }

  // --- the canary (32 §5.11) ------------------------------------------------------------------------------------------------
  lakeOf(id) { const w = this.c.world; const L = w && w.lakes ? w.lakes[id - 1] : null; return L || null; }
  // Denny's two rings on a told lake: the campsite on the point (the lake's site nearest its middle) and a walleye hole off it
  rings(lakeId) {
    const s = this.story, k = `canary.ring.${lakeId}`;
    if (s.has(k)) { const v = s.get(k); return { site: { x: v[0], z: v[1] }, hole: { x: v[2], z: v[3] } }; }
    const w = this.c.world, L = this.lakeOf(lakeId); if (!L) return null;
    const ids = new Set([lakeId]); if (L.name) for (const q of w.lakes) if (q && q.name === L.name && Math.hypot(q.cx - L.cx, q.cz - L.cz) < 25000) ids.add(q.id);
    let best = null, bd = Infinity;
    for (const c of w.campsites || []) { if (!ids.has(c.lake)) continue; const d = Math.hypot(c.x - L.cx, c.z - L.cz); if (d < bd) { bd = d; best = c; } }
    const site = best ? { x: best.x, z: best.z } : { x: L.cx, z: L.cz };
    const dx = L.cx - site.x, dz = L.cz - site.z, d = Math.hypot(dx, dz) || 1, m = Math.min(I.CANARY.hole, d * 0.6);
    const hole = { x: site.x + (dx / d) * m, z: site.z + (dz / d) * m };
    s.set(k, [Math.round(site.x), Math.round(site.z), Math.round(hole.x), Math.round(hole.z)], 'i:canary');
    return { site, hole };
  }
  // a lake told: who heard it, and on which day (ppl.<who>.told = its name, as a2 and a4 keep it)
  tell(who, a) {
    const s = this.story; if (!s || !a || !a.lake) return false;
    const id = a.lake, name = a.name || (this.lakeOf(id) && this.lakeOf(id).name) || 'that lake';
    this.vars.lake = name;
    s.person(who, 'told', '=', name, 'i:canary');
    s.set(`canary.${who}.${id}`, this.today(), 'i:canary');
    // told to two people: the page says so, and it isn't a hard piece (32 §5.11)
    const others = ['denny', 'frank', 'bob'].filter((w) => w !== who && s.has(`canary.${w}.${id}`));
    const ppl = s.doc && s.doc.ppl ? s.doc.ppl : {};
    for (const w of ['len', 'jon', 'maggie']) if (ppl[w] && ppl[w].told === name) others.push(w);
    if (others.length && (who === 'denny' || others.includes('denny')) && !s.has('canary.shared')) s.set('canary.shared', name, 'i:canary');
    if (who === 'denny') {
      const R = this.rings(id), P = this.c.pencil;
      if (R && P && typeof P.ring === 'function') {
        try { P.ring({ x: R.site.x, z: R.site.z, r: 60, label: 'the site on the point', by: 'Denny', lake: id }); P.ring({ x: R.hole.x, z: R.hole.z, r: 80, label: 'a walleye hole', by: 'Denny', lake: id }); } catch (e) { console.warn('informant: the rings', e); }
      }
    }
    return true;
  }
  sharedLake(st, id) { return ['frank', 'bob'].some((w) => st.has(`canary.${w}.${id}`)) || st.get('canary.shared') === ((this.lakeOf(id) || {}).name); }
  // the posting row's spots (pure in the facts and the day)
  canaryPostings(st, abs) {
    if (!st || st.has('choice.denny') || st.has('case.denny.canary')) return [];
    const out = [], d = Math.floor(abs);
    for (const [k, v] of st.keys('canary.denny.')) {
      const id = Number(k.slice('canary.denny.'.length)); if (!Number.isFinite(id) || !Number.isFinite(v)) continue;
      const dd = d - v; if (dd < I.CANARY.from || dd > I.CANARY.to || this.sharedLake(st, id)) continue;
      const R = st.get(`canary.ring.${id}`); if (!R) continue;
      out.push({ x: R[0], z: R[1], lake: id, from: I.CANARY.hours[0], to: I.CANARY.hours[1] });
    }
    return out;
  }
  // each tick: the watchers drawn at the site (pulled up, two men, no rods); in sight of you they get in and paddle off
  canaryTick() {
    const s = this.story, p = this.c.player, A = this.c.actors; if (!p) return;
    const abs = s.nowAbs(), h = (abs - Math.floor(abs)) * 24, posts = this.canaryPostings(s, abs).filter((q) => h >= q.from && h < q.to);
    const live = new Set();
    for (const q of posts) {
      const key = `i:canary:${q.lake}`; live.add(key);
      const dist = Math.hypot(q.x - p.x, q.z - p.z);
      let W = this.watch.get(key);
      if (dist > 1400 && !(W && W.leaving)) { if (W) this.unwatch(key); continue; }
      if (!W && A) {
        try { const crew = [A.person({ key: `${key}:0` }), A.person({ key: `${key}:1` })]; const b = A.boat({ key, hull: 'green', crew, packs: 0 }); W = { b, crew, x: q.x, z: q.z, heading: 0, leaving: false, lake: q.lake }; this.watch.set(key, W); }
        catch (e) { if (!this.warnedB) { this.warnedB = true; console.warn('informant: the watchers', e); } }
      }
      if (!W) continue;
      if (!W.leaving && dist < I.CANARY.sight) this.seen(q.lake, W);
      if (W.leaving) { const ax = W.x - p.x, az = W.z - p.z, d = Math.hypot(ax, az) || 1; W.x += (ax / d) * 1.4 * TICK * 4; W.z += (az / d) * 1.4 * TICK * 4; W.heading = Math.atan2(-az, ax); }
      try { W.b.drive({ x: W.x, z: W.z, heading: W.heading, v: W.leaving ? 1.2 : 0, snap: !W.drawn }); W.drawn = true; } catch { /* the actor's */ }
      if (W.leaving && Math.hypot(W.x - p.x, W.z - p.z) > 1500) this.unwatch(key);
    }
    for (const k of [...this.watch.keys()]) if (!live.has(k) && !this.watch.get(k).leaving) this.unwatch(k);
  }
  unwatch(key) { const W = this.watch.get(key); if (!W) return; this.watch.delete(key); try { for (const c of W.crew || []) c.remove(); W.b.remove(); } catch { /* gone */ } }
  // the canary seen (32 §5.11 Seen): exactly the site Denny ringed; the hard piece, the lake named on the page
  seen(lakeId, W) {
    const s = this.story; W.leaving = true;
    try { if (!s.has(`ev.watchers@${lakeId}`)) s.set(`ev.watchers@${lakeId}`, this.today(), 'i:canary'); } catch { /* */ }
    s.set(`canary.seen.${lakeId}`, this.today(), 'i:canary');
    this.hard(lakeId, 'seen');
  }
  hard(lakeId, how) {
    const s = this.story; if (s.has('case.denny.canary') || this.sharedLake(s, lakeId)) return false;
    const L = this.lakeOf(lakeId), name = (L && L.name) || s.get(`canary.ring.${lakeId}`) && 'that lake';
    s.set('canary.hard', String(name || 'that lake'), 'i:canary');
    s.set('canary.how', how, 'i:canary');
    s.set('case.denny.canary', 'hard', 'i:canary');
    return true;
  }
  // a lake told only to Frank or Bob, five days on, with nothing come of it (32 §5.11): "I told Frank {lake}. Nobody came."
  clearTick() {
    const s = this.story, d = this.today();
    for (const who of ['frank', 'bob']) {
      if (s.has(`canary.clear.${who}`)) continue;
      for (const [k, v] of s.keys(`canary.${who}.`)) {
        const id = Number(k.slice(`canary.${who}.`.length)); if (!Number.isFinite(id) || d - v < I.CANARY.clear) continue;
        if (s.has(`canary.denny.${id}`)) continue;
        const L = this.lakeOf(id); s.set(`canary.clear.${who}`, (L && L.name) || 'that lake', 'i:canary'); break;
      }
    }
    // Frank cold for ten days after an accusation, or until "I was wrong about you." (32 §5.14)
    const ppl = s.doc && s.doc.ppl && s.doc.ppl.frank;
    if (ppl && ppl.cold && s.has('frank.accused') && d - s.get('frank.accused') >= 10) s.person('frank', 'cold', '=', false, 'i:cold');
  }

  // --- the counter (32 §5.6 the calls and the visit, §5.11 heard, §5.16 the after, §5.17 the note, §5.13 the folder) -------
  home() { const C = this.c.cast; return C && typeof C.home === 'function' ? C.home() : (this.c.profile && this.c.profile.home != null ? Number(this.c.profile.home) : null); }
  counterSay(id, vars = null, delay = 1400) {
    const w = T(id, vars || this.vars); if (!w) return false;
    const go = () => {
      const C = this.c.cast; let st = null;
      if (C && C.live) for (const q of C.live.values()) if (q.who === 'josie') st = q;
      try { if (st && st.h && typeof st.h.say === 'function') st.h.say(w); else if (this.c.hud) this.c.hud.note(`Josie: “${w}”`, 8); } catch { /* not drawn */ }
    };
    if (delay > 0 && typeof setTimeout === 'function') setTimeout(go, delay); else go();
    this.lastCounter = { id, text: w };
    return true;
  }
  storeEnter(ep) {
    if (!this.on || ep == null) return;
    const s = this.story, d = this.today(), home = this.home(), atHome = home != null && Number(ep) === home;
    // the note (32 §5.17): at the player's next counter visit, any counter
    if (s.has('denny.note.due') && !s.has('denny.note') && !s.has('denny.revealed')) {
      const told = s.keys('canary.denny.').length > 0, id = told ? ITEM.note : ITEM.note2;
      this.give(id); s.set('denny.note', true, 'i:note');
      this.counterSay(told ? '32:5.17.note' : 'd95.i.note.never');
      return;
    }
    // Frank's folder: the next Friday at Farm, or the Sawbill store in August's first week (32 §5.13)
    if (s.has('frank.folder.asked') && !s.has('frank.folder') && d > s.get('frank.folder.asked')) {
      const dt = this.date(), fri = dt.dow === 5;
      if ((Number(ep) === I.FARM && fri) || (Number(ep) === I.SAWBILL && dt.month === 8 && dt.mday <= 7)) {
        this.give(ITEM.folder); s.set('frank.folder', true, 'i:folder');
        if (this.c.hud) this.c.hud.note('A manila envelope behind the counter: KOSIR — HOLD.', 7);
        return;
      }
    }
    if (!atHome) return;
    const ch = s.get('choice.denny');
    // after the choice: the turned Denny's message, once, a few days later; the quiet one's, after a week
    if (ch === 'turn' && !s.has('denny.josie.lousy') && s.since('days', 'choice.denny') >= 2) { s.set('denny.josie.lousy', true, 'i'); this.counterSay('32:5.16.1.josie'); return; }
    if (ch === 'left' && !s.has('denny.josie.quiet') && s.since('days', 'choice.denny') >= 7) { s.set('denny.josie.quiet', true, 'i'); this.counterSay('32:5.16.3.josie'); return; }
    if (ch) return;
    // the canary heard (32 §5.11): a lake told only to Denny, the told day + 1–3, not seen: Josie says what a party said
    for (const [k, v] of s.keys('canary.denny.')) {
      const id = Number(k.slice('canary.denny.'.length)), dd = d - v;
      if (!Number.isFinite(id) || dd < I.CANARY.heard[0] || dd > I.CANARY.heard[1] || s.has(`canary.seen.${id}`) || s.has(`canary.heard.${id}`)) continue;
      const L = this.lakeOf(id); this.vars.lake = (L && L.name) || this.vars.lake;
      s.set(`canary.heard.${id}`, d, 'i:canary');
      this.hard(id, 'heard');
      this.counterSay('32:5.11.heard.josie', { lake: this.vars.lake });
      return;
    }
    // the calls (32 §5.6): once or twice a season after a lake told
    const toldAt = Math.max(-1, ...s.keys('canary.denny.').map(([, v]) => v));
    if (toldAt >= 0) {
      const n = s.has('denny.calls.2') ? 2 : s.has('denny.calls.1') ? 1 : 0;
      if (n < 2 && d - toldAt >= 3 + n * 9) { s.set(`denny.calls.${n + 1}`, d, 'i:calls'); this.counterSay('32:5.6.calls'); }
    }
  }
  give(id) {
    const s = this.story;
    try { if (typeof s.action === 'function' && s.action('give', `item.${id}`, { rule: 'i' })) return true; } catch { /* below */ }
    const inv = this.c.inventory; try { const r = inv && (inv.toHandNew ? inv.toHandNew(id) : inv.place(id, 1, {})); if (inv && inv.write) inv.write(); return !!(r && r.ok); } catch (e) { console.warn('informant: give', id, e); return false; }
  }
  date() { const d = this.c.day; const dt = d ? new Date(Date.UTC(d.year, 0, d.doy)) : new Date(Date.UTC(2026, 6, 1)); return { dow: dt.getUTCDay(), month: dt.getUTCMonth() + 1, mday: dt.getUTCDate(), hours: d ? d.hours : 12 }; }

  // --- Denny's cabin (32 §5.6, §5.15) ---------------------------------------------------------------------------------------
  // ten minutes down the Sawbill Trail: behind the store (its front faces the road), on dry ground; once found, kept
  cabinAt() {
    if (this.cabinSpot) return this.cabinSpot;
    const L = storeLayout(I.SAWBILL), w = this.c.world; if (!L) return null;
    const A = L.axes.a, B = L.axes.b, Cn = L.centre;
    const dry = (x, z) => !(w && typeof w.lakeIdAt === 'function' && w.lakeIdAt(x, z) > 0);
    for (const [k, turn] of [[1, 0], [1, 0.4], [1, -0.4], [0.8, 0.9], [0.8, -0.9], [-1, 0]]) {
      const bx = B.x * Math.cos(turn) - A.x * Math.sin(turn), bz = B.z * Math.cos(turn) - A.z * Math.sin(turn);
      const x = Cn.x + bx * I.PLACES.cabin.back * k + A.x * I.PLACES.cabin.across, z = Cn.z + bz * I.PLACES.cabin.back * k + A.z * I.PLACES.cabin.across;
      let ok = true; for (const [dx, dz] of [[0, 0], [8, 0], [-8, 0], [0, 8], [0, -8]]) if (!dry(x + dx, z + dz)) ok = false;
      if (ok) { this.cabinSpot = { x, z, rot: Math.atan2(-(-bx), -(-bz)) }; return this.cabinSpot; }
    }
    return null;
  }
  ground(x, z) { const t = this.c.tiles; try { const y = t && typeof t.groundAt === 'function' ? t.groundAt(x, z) : 0; return Number.isFinite(y) ? y : 0; } catch { return 0; } }
  local(p) { const C = this.cabin; const c = Math.cos(C.at.rot), s = Math.sin(C.at.rot); return { x: C.at.x + p.x * c + p.z * s, z: C.at.z - p.x * s + p.z * c }; }
  cabinTick() {
    const p = this.c.player, at = this.cabinAt(); if (!p || !at) { if (this.cabin && p && Math.hypot(this.cabin.at.x - p.x, this.cabin.at.z - p.z) > CABIN_NEAR + 80) this.dropCabin(); return; }
    const d = Math.hypot(at.x - p.x, at.z - p.z);
    if (d > CABIN_NEAR + 80) { this.dropCabin(); return; }
    if (d > CABIN_NEAR) return;
    if (!this.cabin) this.buildCabin(at);
    const s = this.story, home = s.when(I.SCHEDULE.cabin) && !this.rockNight();
    if (home && !this.denny && this.cabin) {
      const P = this.local(this.cabin.spots.porch);
      this.denny = new FieldPerson(this.c, 'denny', { x: P.x, z: P.z, heading: at.rot + Math.PI, name: 'Denny' });
      this.denny.onTalk = () => this.talk('denny');
    } else if (!home && this.denny && !this.denny.talking) { this.denny.remove(); this.denny = null; }
  }
  buildCabin(at) {
    const k = kit('dennyCabin'), r = k && k.build({ rng: rngFor('i.cabin') }); if (!r || !this.c.scene) return;
    const y = this.ground(at.x, at.z);
    const m = new THREE.Mesh(r.geo, propMaterial()); m.name = 'i denny cabin'; m.position.set(at.x, y, at.z); m.rotation.y = at.rot;
    m.castShadow = true; m.receiveShadow = true; m.matrixAutoUpdate = false; m.updateMatrix(); m.updateMatrixWorld(true); this.c.scene.add(m);
    this.cabin = { at: { ...at, y }, m, spots: r.spots };
  }
  dropCabin() { if (this.denny && !this.denny.talking) { this.denny.remove(); this.denny = null; } const C = this.cabin; if (!C || (this.denny && this.denny.talking)) return; if (C.m.parent) C.m.parent.remove(C.m); C.m.geometry.dispose(); this.cabin = null; }
  rockNight() { const s = this.story; return !!(s && s.when(I.SCHEDULE.rock)); }

  // --- the rock on the 14th (32 §5.9.8, §5.15) -------------------------------------------------------------------------------
  revealReady() { const s = this.story; return !!(s && s.has('denny.reveal.open') && !s.has('denny.revealed')); }
  hookRock() {
    const B = this.boys(); if (!B || B.iHooked) return;
    B.iHooked = true;
    const prev = B.onRock;
    B.onRock = (o = {}) => { try { if (prev) prev(o); } catch { /* b5's */ } if (this.revealReady() && o.denny) { B.rockHeld = true; o.denny.onTalk = () => this.talkReveal(o.denny, true); } };
  }
  rockTick() {
    const B = this.boys();
    if (B) { this.hookRock(); if (B.rockHeld && !this.revealReady() && !(this.c.talk && this.c.talk.convo)) B.rockHeld = false; return; } // (let b5 bring him back once it's over)
    // (stream b5 not loaded: Denny on the sitting rock here, on the 14th from dusk to 23:00, while the reveal is ready)
    const p = this.c.player, R = I.PLACES.rock, want = this.rockNight() && this.revealReady() && p && Math.hypot(R.x - p.x, R.z - p.z) < 600;
    if (want && !this.rockDenny) { this.rockDenny = new FieldPerson(this.c, 'denny', { x: R.x, z: R.z, heading: 0, name: 'Denny' }); this.rockDenny.onTalk = (f) => this.talkReveal(f, true); }
    else if (!want && this.rockDenny && !this.rockDenny.talking) { this.rockDenny.remove(); this.rockDenny = null; }
  }

  // --- Denny's visit to the home outfitter (32 §5.6 "The visit"): once, 2–4 days after a lake told, before any reveal ------
  visitTick() {
    const s = this.story, home = this.home(), p = this.c.player; if (home == null || !p || s.has('denny.visit') || s.has('denny.revealed')) { this.dropVisit(); return; }
    const d = this.today(), due = s.keys('canary.denny.').some(([, v]) => d - v >= TALK_DAYS[0] && d - v <= TALK_DAYS[1]);
    const L = storeLayout(home); if (!due || !L || !s.when('hour:9-17') || Math.hypot(L.centre.x - p.x, L.centre.z - p.z) > 90) { if (!(this.visitF && this.visitF.talking)) this.dropVisit(); return; }
    if (!this.visitF) {
      const f = L.stepsFoot || L.door || L.centre, A = L.axes.a;
      this.visitF = new FieldPerson(this.c, 'denny', { x: f.x + A.x * 2.2, z: f.z + A.z * 2.2, heading: 0, name: 'Denny' });
      this.visitF.onTalk = () => this.talk('denny', { visit: true, field: this.visitF });
    }
  }
  dropVisit() { if (this.visitF && !this.visitF.talking) { this.visitF.remove(); this.visitF = null; } }

  // --- talk ------------------------------------------------------------------------------------------------------------------
  hooks(who) {
    const s = this.story;
    const beats = () => (this.beatsCache || (this.beatsCache = confBeats(T('32:5.15.conf'))));
    const H = {
      canary: () => { if (this.pending) { this.tell(who, this.pending); this.pending = null; } },
      frankCanary: () => (s.hash(`i.frank:${this.vars.lake}`) % 2 ? '32:5.11.frank.2' : '32:5.11.frank.1'),
      accuse: () => { s.set('frank.accused', this.today(), 'i:accuse'); s.person('frank', 'cold', '=', true, 'i:accuse'); },
      folderAsk: () => { if (!s.has('frank.folder.asked')) s.set('frank.folder.asked', this.today(), 'i:folder'); },
      relay: () => {
        const n = s.keys('denny.relay.').length; if (n >= I.RELAY.length) return null;
        const last = n ? s.get(`denny.relay.${n}`) : s.get('choice.denny') && Math.floor(s.fact('choice.denny').abs);
        if (n && this.today() - last < 7) return null;
        s.set(`denny.relay.${n + 1}`, this.today(), 'i:relay'); return I.RELAY[n];
      },
      card: () => { if (this.c.hud) this.c.hud.note(`Denny's card: ${T('32:5.15.gives.1') ? 'a name and a number on the back' : ''}`.trim(), 4); },
      yard: () => { if (!this.atRockNow && this.c.veil && typeof this.c.veil.card === 'function') { try { this.c.veil.card({ kicker: '', text: 'The next morning. The store yard.', sub: '', fadeIn: 0.8, hold: 1.4, fadeOut: 0.9 }); } catch { /* the veil's */ } } },
      toldEnd: () => { const B = this.boys(); if (B) B.rockHeld = false; },
    };
    for (let k = 0; k < I.CONF_BEATS; k++) H[`conf${k}`] = () => { const b = beats()[k]; return b ? { text: b } : null; };
    return H;
  }
  // a scene run and its dialogue: the canary's choice asks for a lake on the map first (dialogue.js pick: 'lake')
  open(def, start, field, who, args = {}) {
    const D = this.c.talk, s = this.story; if (!D || !field || !start) return false;
    const n = this.c.npcs;
    const run = new SceneRun(this.c.topics, def, { who, args: { ...args }, vars: this.vars, mark: n && n.mark ? (t) => n.mark(t) : null, hooks: this.hooks(who),
      onEnd: () => { field.talking = false; } });
    const canaryText = T(I.CANARY_ASK);
    const pick = (ch) => (ch && ch.text === canaryText ? { ...ch, pick: 'lake', go: ((g) => (a) => { const J = this.c.journal || (typeof window !== 'undefined' && window.__game && window.__game.journal); try { if (J && J.open) J.close(); } catch { /* the book's */ } if (!a || !a.lake) return null; this.pending = a; const L = this.lakeOf(a.lake); this.vars.lake = a.name || (L && L.name) || ''; return g(); })(ch.go) } : ch);
    field.talking = true;
    void s;
    return D.open({ speaker: field.speaker, name: field.name, role: '', room: null, start: () => decorate(run.node(start), pick), bye: () => { field.talking = false; return null; } });
  }
  talkReveal(field, atRock = false) {
    const s = this.story; if (!this.on || !field) return false;
    this.atRockNow = atRock;
    s.meet('denny', 'i:reveal');
    const start = I.revealEntry(s, { atRock });
    if (!start) return this.open(I.DENNY_CABIN, I.dennyIEntry(s, {}), field, 'denny', { atRock });
    return this.open(I.REVEAL, start, field, 'denny', { atRock });
  }
  talk(who, o = {}) {
    if (!this.on) return false;
    const s = this.story;
    if (who === 'denny') {
      const f = o.field || this.denny || this.rockDenny || this.visitF; if (!f) return false;
      this.atRockNow = f === this.rockDenny;
      if (!o.visit && this.revealReady() && (this.atRockNow || s.when(I.SCHEDULE.cabin))) return this.talkReveal(f, this.atRockNow);
      s.meet('denny', 'i');
      const tell3Due = s.when('tier>=4 | count(case.denny.*)>=2');
      return this.open(I.DENNY_CABIN, I.dennyIEntry(s, { visit: !!o.visit, tell3Due }), f, 'denny');
    }
    // Frank and Bob (stream b5's scenes carry these topics at the join; standing in here, beside you, for this stream's rig)
    const p = this.c.player; if (!p) return false;
    if (this.side) { this.side.remove(); this.side = null; }
    this.side = new FieldPerson(this.c, who, { x: p.x + 1.6, z: p.z + 0.4, heading: 0, name: who === 'frank' ? 'Frank' : 'Bob' });
    s.meet(who, 'i');
    return who === 'frank' ? this.open(I.FRANK_FARM, I.frankIEntry(s), this.side, 'frank') : this.open(I.BOB_STORE, 'hello', this.side, 'bob');
  }

  // --- each half second -------------------------------------------------------------------------------------------------------
  update(dt) {
    if (!this.on) { if (this.cabin || this.denny || this.watch.size) this.clear(); return; }
    this.t += dt; if (this.t < TICK) return; this.t = 0;
    try { this.cabinTick(); } catch (e) { if (!this.w1) { this.w1 = true; console.warn('informant: the cabin', e); } }
    try { this.canaryTick(); } catch (e) { if (!this.w2) { this.w2 = true; console.warn('informant: the canary', e); } }
    try { this.rockTick(); } catch (e) { if (!this.w3) { this.w3 = true; console.warn('informant: the rock', e); } }
    try { this.visitTick(); } catch (e) { if (!this.w4) { this.w4 = true; console.warn('informant: the visit', e); } }
    const d = this.today(); if (d !== this.lastDay) { this.lastDay = d; try { this.clearTick(); } catch (e) { console.warn('informant: the day', e); } }
  }
  clear() {
    for (const k of [...this.watch.keys()]) this.unwatch(k);
    for (const f of ['denny', 'rockDenny', 'visitF', 'side']) if (this[f]) { try { this[f].remove(); } catch { /* gone */ } this[f] = null; }
    this.dropCabin(); this.cabinSpot = null;
  }

  makeDebug() {
    return {
      cabin: () => this.cabinAt(),
      canary: (who, lake, name = null) => this.tell(who, { lake, name }),
      posting: () => (this.story ? this.canaryPostings(this.story, this.story.nowAbs()) : []),
      wp: () => { try { return this.story ? watchers.postings(this.story.nowAbs()).filter((q) => /^i-/.test(q.id)) : []; } catch (e) { return String(e); } },
      staged: () => ({ cabin: !!this.cabin, denny: !!this.denny, rock: !!this.rockDenny, visit: !!this.visitF }),
      watch: () => [...this.watch.entries()].map(([k, W]) => ({ k, x: Math.round(W.x), z: Math.round(W.z), leaving: W.leaving })),
      counter: (ep) => { this.storeEnter(ep); return this.lastCounter || null; },
      tick: () => { this.t = TICK; this.lastDay = null; this.update(0); },
      state: () => { const s = this.story; return s ? Object.fromEntries(Object.entries(s.facts()).filter(([k]) => /^(canary|case\.denny|denny|choice\.denny|isabella|frank)\b/.test(k))) : {}; },
      beats: () => confBeats(T('32:5.15.conf')),
      texts,
    };
  }
}
export const informantCast = new InformantCast();
