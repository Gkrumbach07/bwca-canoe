// Co-op and the story (docs/build/campaign-design.md §11, read through Part 3 calls 1 and 7; Part 4 Round 3, stream C).
// Whose story is it? The host's. Loaded only under STORY_ON (main.js's c: block imports it), so with the flag off not one
// line of this runs and co-op is main's.
//
// - One story, the host's. A guest's own story never moves while visiting: their save is frozen (coop.js kv.freeze) and
//   their engine is a mirror (story.setMode('mirror'), K1a: no rules, timers, pushes, night one or feed). What a guest's
//   game reads of the story is the host's document, mirrored in here, read-only: the facts (so the stones and props read
//   as the host's, story-layer.js's dot names by its `when`s), the notebook's marks, the Walt page, the pencil and the
//   leads. So the guest's book has the Walt side, the host's notebook and Walt page to read (Part 3 call 7: "a guest can
//   see it, read it, look at the Walt page"), and the notebook is never in the guest's inventory: a guest's bound
//   things are taken out of the visit's inventory (the save is frozen, so their own season keeps them).
// - The story's people stand where the host's do: every story person the host's game stands at a store
//   (npcs.extraAt with a `cast:` key: Tauno, Josie, the Farm people, Rose …) is sent with the mirror and stood at the
//   same spot on the guest's screen. Talking to one there gets only their ordinary word (no story topic: topics.js is
//   off on a mirror), and no scene, push or fact.
// - Story topics and pushes are the host's only: topics.js answers nothing on a mirror, and story-feed.js drops
//   walkout, store:enter and sleep on a guest (§11 "pushes wait for the host").
// - A guest's deeds count (guest credit). What a guest's game would have told the story (a carry and a pair of carries,
//   a picture that fits a place, a place's enter/stand trigger, a minigame's result) is sent to the host, who takes it
//   as its own when that guest is in the same party: within CREDIT_R of the host, and for a carry on the host's trip
//   (re-stamped with the host's trip number). The fact goes to the host's save; the guest sees it through the mirror.
// - The pit with company (Part 3 call 1): while a friend is in the room (`peers` > 0) the pit (a story prop of kit
//   'pit') has no verb, and the first time a player with an L6 key points at it with company, the Walt page gains N42's
//   line, once. The host does the cellar night alone.
// - No company on the run: while the run is on (`run.active`, stream R), the host's clock carries `shut: 'run'`, so the
//   room (server/room) refuses a guest's join or Rejoin with 'run' ("Out on the water tonight."); a guest whose client
//   sees it in the welcome's snapshot leaves before entering, and a guest the host hears join anyway is sent away.
// - The shared night waits for night one: when the host's night-one cutscene plays on a shared night, each guest sees
//   one card, "{host} is reading by headlamp.", and their night (camp.wake) waits until the host's cutscene ends.
//
// The wire (coop.on / coop.send; `to` is the relay's routing, so no payload field is named `to`):
//   story    host → all (or one, a joiner): { rev, d: { season, facts, src, nb, walt, pencil, leads, eps, ppl, end,
//            meeting }, cast: [{ key, ep, name, role, look, spot }], host } on a change (≤ 2 Hz) and whole to a joiner
//   storyq   guest → host: {} (nothing heard yet: send it again)
//   storyev  guest → host: { k: 'ev', evt, data } | { k: 'trig', place, on, i } | { k: 'shot', eye, dir }, with x, z
//   storyn   host → all: { op: 'read' | 'done', name } (night one on a shared night)
//   storyx   host → one: { why: 'run' } (the run is on: leave)
//
//   const cs = new CoopStory(coop, { story, layer, npcs, walt, camp, hud, inventory, minigames, ambient, book })
//   cs.useFeed(feed) (when the feed has started) · cs.runOn() · cs.stats() (rigs) · cs.debug
import { itemDef } from './items.js';
import { blankDoc } from './story.js';

export const CREDIT_R = 200;     // m: a guest this near the host is in the same party (§11)
const PUB_MS = 500;              // the mirror at most twice a second
const ASK_MS = 3000;             // a guest with no mirror yet asks this often
const READ_MAX_MS = 4 * 60 * 1000; // a guest's night waits at most this long on the host's cutscene
const DOC_KEYS = ['season', 'facts', 'src', 'nb', 'walt', 'pencil', 'leads', 'eps', 'ppl', 'end', 'meeting'];
const CREDIT_EVTS = new Set(['carry', 'carrypair', 'photo', 'readHere']); // (and mg:*) a guest's feed events the host takes
const CAST_KEY = /^cast:/;
export const PIT_KITS = new Set(['pit']);
// the build's drafted words (docs/story/95-drafted-lines.md, stream c): the writers replace them there
export const WORDS = {
  reading: '{host} is reading by headlamp.',   // c.coop.reading (design §6.1)
  shut: 'Out on the water tonight.',          // c.coop.shut (design §8.3 "No company")
  nod: '…',                                    // a story person's look up at a stranger (as cast.js's Josie with no word)
};
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

const CSS = `
#coop-reading { position: fixed; inset: 0; z-index: 61; display: none; align-items: center; justify-content: center; pointer-events: none;
  font: italic 26px/1.4 Alegreya, Georgia, serif; color: #e9dfc3; text-shadow: 0 2px 12px #000; opacity: 0; transition: opacity 1.2s; }
#coop-reading.on { display: flex; }
#coop-reading.lit { opacity: 1; }
`;

export class CoopStory {
  constructor(coop, t = {}) {
    this.coop = coop; this.t = t; this.g = coop.g;
    this.feed = null;
    this.lastPub = 0; this.lastSig = ''; this.rev = 0; this.forceTo = new Set(); this.forceAll = false;
    this.heard = 0; this.askT = 0; this.hostRev = -1;
    this.cast = new Map();          // host: key → { key, ep, name, role, look, spot } (story people stood)
    this.mirCast = new Map();       // guest: key → { rec, h }
    this.reading = null;            // guest: { at, name, done: Promise, resolve }
    this.n = { pubs: 0, applies: 0, credits: 0, creditsIn: 0, creditsTaken: 0, refused: 0, stripped: 0, n42: 0, pitHid: 0, readCards: 0, sentAway: 0 };
    this.log = [];
    this.debug = this.makeDebug();
    const { story } = t;
    if (!story) return;
    // the sensors the rules and the pit read: friends in the room (0 single player, as story.js's own answer)
    story.sensor('peers', () => (this.coop.live ? this.coop.peers().length : 0));
    story.sensor('coop', () => !!this.coop.live);
    coop.on('story', (m) => { if (this.guest) this.apply(m); });
    coop.on('storyq', (m) => { if (this.host && m.from != null) this.forceTo.add(m.from); });
    coop.on('storyev', (m) => { if (this.host) this.creditIn(m); });
    coop.on('storyn', (m) => { if (this.guest) this.nightOne(m); });
    coop.on('storyx', (m) => { if (this.guest) this.sentAway(m); });
    coop.onPeers((what, peer) => this.peers(what, peer));
    coop.tick((now) => this.tick(now));
    coop.clockExtra = () => (this.host && this.runOn() ? { shut: 'run' } : null);
    this.hookPeople();
    this.hookLayer();
    this.hookNight();
    this.hookGuestDeeds();
    this.hookInventory();
  }
  get host() { return this.coop.live && this.coop.role === 'host'; }
  get guest() { return this.coop.role === 'guest'; }
  get story() { return this.t.story || null; }
  get myName() { return (this.coop.visitor && this.coop.visitor.name) || 'Your friend'; }
  useFeed(feed) { this.feed = feed || null; if (feed && typeof feed.tap === 'function' && !this.tapped) { this.tapped = true; feed.tap((evt, data, how) => this.tapped1(evt, data, how)); } return this; }
  note(t) { this.log.push([Math.round(performance.now()), t]); if (this.log.length > 40) this.log.shift(); }

  // --- the run (stream R writes run.active) ---------------------------------------------------------------------------------
  runOn() {
    const s = this.story; if (!s || !s.doc || s.mode === 'mirror' || s.has('end')) return false;
    let v = false;
    try { v = !!s.readSensor('run.active'); } catch { v = false; }
    return v || s.has('run.active');
  }

  // --- the host: the mirror out ---------------------------------------------------------------------------------------------
  snapshot() {
    const s = this.story, d = s && s.doc; if (!d) return null;
    const out = {};
    for (const k of DOC_KEYS) if (d[k] !== undefined) out[k] = d[k];
    return out;
  }
  publish(now, to = null) {
    const d = this.snapshot(); if (!d) return false;
    const cast = [...this.cast.values()];
    const sig = JSON.stringify([d, cast]);
    if (to == null && sig === this.lastSig && !this.forceAll) return false;
    if (sig !== this.lastSig) { this.rev++; this.lastSig = sig; }
    this.forceAll = false;
    const m = { t: 'story', rev: this.rev, d, cast, host: this.myName };
    if (to != null) m.to = to; // (the relay's routing: to that one joiner)
    this.lastPub = now; this.n.pubs++;
    return this.coop.send(m);
  }
  peers(what, peer) {
    if (what === 'gone') { this.clearMirCast(); this.endReading(); return; }
    if (!this.host || !peer) { if (this.guest && (what === 'welcome' || (what === 'join' && peer && peer.host))) this.askT = 0; return; }
    if (what === 'join') {
      if (this.runOn()) { this.coop.send({ t: 'storyx', to: peer.id, why: 'run' }); this.n.sentAway++; this.note(`sent away ${peer.name}: the run`); return; }
      this.forceTo.add(peer.id);
    }
  }
  tick(now) {
    if (this.host) {
      for (const id of this.forceTo) this.publish(now, id);
      this.forceTo.clear();
      if (this.coop.remotes.size && now - this.lastPub >= PUB_MS) this.publish(now);
      this.pitWatch();
    } else if (this.guest && this.coop.live && this.heard === 0 && now - this.askT > ASK_MS) {
      this.askT = now;
      const h = this.coop.peers().find((p) => p.host);
      if (h) this.coop.send({ t: 'storyq', to: h.id });
    }
    if (this.reading && performance.now() - this.reading.at > READ_MAX_MS) this.endReading();
  }

  // --- the guest: the mirror in ----------------------------------------------------------------------------------------------
  apply(m) {
    const s = this.story; if (!s || !m || !m.d || typeof m.d !== 'object') return false;
    if (s.mode !== 'mirror' && typeof s.setMode === 'function') s.setMode('mirror'); // (enterAsGuest already did; a late module)
    if (s.mode !== 'mirror') return false;
    if (Number.isFinite(m.rev) && m.rev < this.hostRev && this.heard) return false; // (an old one, overtaken)
    this.hostRev = Number.isFinite(m.rev) ? m.rev : this.hostRev;
    const old = s.doc || blankDoc('mirror'), d = blankDoc('mirror');
    for (const k of DOC_KEYS) if (m.d[k] !== undefined) d[k] = m.d[k];
    d.season = m.d.season ?? 'mirror';
    d.mirror = true; d.hostMirror = true; d.data = s.data; d.rev = m.rev || 0;
    d.nb = { ...blankDoc().nb, ...(d.nb || {}) };
    // the guest's own place in the book (the spread open, opened) stays theirs: never written back, never snapped to the host's
    if (old.nb) { if (Number.isInteger(old.nb.spread)) d.nb.spread = old.nb.spread; if (old.nb.opened) d.nb.opened = old.nb.opened; }
    const before = old.facts || {}, waltBefore = new Set((old.walt || []).map((w) => w[0]));
    s.setDoc(d);
    this.heard++; this.n.applies++;
    for (const [k, r] of Object.entries(d.facts || {})) if (!before[k]) s.emit('fact', { key: k, v: r[0] });
    for (const [id] of d.walt || []) if (!waltBefore.has(id)) s.emit('walt:line', { id });
    s.emit('mirror', { rev: d.rev });
    this.mirrorCast(Array.isArray(m.cast) ? m.cast : []);
    return true;
  }

  // --- the story's people: stood where the host's are ----------------------------------------------------------------------------
  hookPeople() {
    const n = this.t.npcs; if (!n || typeof n.extraAt !== 'function' || n.extraAt.coopStory) return;
    const extraAt = n.extraAt.bind(n);
    n.extraAt = (ep, rec = {}) => {
      const h = extraAt(ep, rec);
      if (!h || this.guest || !rec || !CAST_KEY.test(String(rec.key || ''))) return h;
      const key = String(rec.key);
      this.cast.set(key, { key, ep: Number(ep), name: rec.name || '', role: rec.role || '', look: plain(rec.look), spot: plain(rec.spot) });
      const rm = h.remove.bind(h);
      h.remove = () => { if (this.cast.get(key)) this.cast.delete(key); return rm(); };
      return h;
    };
    n.extraAt.coopStory = true;
    this.extraAt = extraAt;
  }
  mirrorCast(list) {
    const want = new Map(list.filter((r) => r && r.key && Number.isFinite(r.ep)).map((r) => [r.key, r]));
    for (const [k, v] of [...this.mirCast]) {
      const w = want.get(k);
      if (!w || JSON.stringify(w) !== v.sig) { try { v.h.remove(); } catch { /* the store's gone */ } this.mirCast.delete(k); }
    }
    for (const [k, r] of want) {
      if (this.mirCast.has(k) || !this.extraAt) continue;
      const who = k.split(':')[1] || '';
      let h = null;
      try { h = this.extraAt(r.ep, { key: `mirror:${k}`, name: r.name, role: r.role, look: r.look, spot: r.spot, lines: this.ordinary(who, r.ep) }); } catch (e) { console.warn('coop story: a person', e); }
      if (h) this.mirCast.set(k, { h, sig: JSON.stringify(r) });
    }
  }
  clearMirCast() { for (const v of this.mirCast.values()) { try { v.h.remove(); } catch { /* gone */ } } this.mirCast.clear(); }
  // a story person's ordinary word to a stranger: Josie's own lines by stage (70 §4.4), else a look up
  ordinary(who, ep) {
    const amb = this.t.ambient;
    if (who === 'josie' && amb && typeof amb.pick === 'function') { try { const l = amb.pick('josie', { ep }); if (l && l.text) return [l.text]; } catch { /* none */ } }
    return [WORDS.nod];
  }

  // --- the layer: the pit with company, guest credit -----------------------------------------------------------------------------
  // the pit (stream F: `cellar.pit`, kit 'pit', in place `cellar`); its lid, note and cans (`cellar.*`) are the cellar too
  pitProp(id) { const L = this.t.layer, q = L && typeof L.prop === 'function' ? L.prop(id) : null; return !!(q && q.prop && PIT_KITS.has(q.prop.kit)); }
  cellarProp(id) { const L = this.t.layer, q = L && typeof L.prop === 'function' ? L.prop(id) : null; return !!(q && q.prop && (PIT_KITS.has(q.prop.kit) || (q.place && q.place.id === 'cellar') || /^cellar\./.test(String(q.prop.id)))); }
  company() { return this.coop.live && this.coop.peers().length > 0; }
  hookLayer() {
    const L = this.t.layer; if (!L || L.coopStory) return;
    L.coopStory = this;
    if (typeof L.verbs === 'function') {
      const verbs = L.verbs.bind(L);
      L.verbs = (id) => { const v = verbs(id); if (v.length && this.company() && this.cellarProp(id)) { this.n.pitHid++; return []; } return v; };
    }
    if (typeof L.dotName === 'function') {
      const dot = L.dotName.bind(L);
      L.dotName = (id) => { const r = dot(id); if (this.company() && this.pitProp(id)) this.pitSeen(); return r; };
    }
    // a guest's place triggers and pictures go to the host (story-layer.js c: block calls layer.credit)
    L.credit = (k, data) => this.creditOut(k, data);
  }
  // N42 (§7.2): the first time a player with an L6 key points at the pit with company, once, in the player's hand
  pitSeen() {
    const s = this.story;
    if (!this.host || !s || s.mode === 'mirror' || !s.when('any(key.L6*)')) return false;
    if (s.walt().includes('c.walt.n42')) return false;
    if (s.waltLine('c.walt.n42', 'coop:pit')) { this.n.n42++; this.note('N42 on the Walt page'); return true; }
    return false;
  }
  pitWatch() { /* (the dot asks dotName each frame it rests on a prop: pitSeen runs there) */ }

  // --- guest credit ------------------------------------------------------------------------------------------------------------
  hookGuestDeeds() {
    const mg = this.t.minigames;
    if (mg && typeof mg.say === 'function' && !mg.say.coopStory) {
      const say = mg.say.bind(mg);
      mg.say = (kind, result, data = {}) => { if (this.guest && this.story && this.story.mode === 'mirror') { this.creditOut('ev', { evt: `mg:${kind}`, data: { kind, result, ...plain(data) } }); return false; } return say(kind, result, data); };
      mg.say.coopStory = true;
    }
  }
  tapped1(evt, data, how) {
    if (how !== 'mirror' || !this.guest || !(CREDIT_EVTS.has(evt) || /^mg:/.test(evt))) return;
    this.creditOut('ev', { evt, data: plain(data) });
  }
  creditOut(k, data = {}) {
    if (!this.guest || !this.coop.live) return false;
    const h = this.coop.peers().find((p) => p.host); if (!h) return false;
    const p = this.g.player;
    this.n.credits++;
    return this.coop.send({ t: 'storyev', to: h.id, k, ...data, x: p ? +p.x.toFixed(1) : null, z: p ? +p.z.toFixed(1) : null });
  }
  // the host: a friend's deed, taken as ours when they are in the party (near us; a carry on our trip)
  creditIn(m) {
    this.n.creditsIn++;
    const s = this.story, p = this.g.player;
    if (!s || !s.doc || s.mode === 'mirror' || !p) return false;
    const peer = this.coop.peers().find((q) => q.id === m.from);
    const x = Number.isFinite(m.x) ? m.x : peer && peer.x, z = Number.isFinite(m.z) ? m.z : peer && peer.z;
    if (!Number.isFinite(x) || Math.hypot(x - p.x, z - p.z) > CREDIT_R) { this.n.refused++; this.note(`credit refused (far): ${m.k} ${m.evt || ''}`); return false; }
    const L = this.t.layer;
    if (m.k === 'trig') { const ok = !!(L && typeof L.creditTrigger === 'function' && L.creditTrigger(m.place, m.on, m.i)); if (ok) this.n.creditsTaken++; return ok; }
    if (m.k === 'shot') { if (L && typeof L.shot === 'function' && m.eye && m.dir) { L.shot({ eye: m.eye, dir: m.dir, credit: m.from }); this.n.creditsTaken++; return true; } return false; }
    if (m.k !== 'ev' || typeof m.evt !== 'string') return false;
    const evt = m.evt, data = m.data && typeof m.data === 'object' ? { ...m.data } : {};
    if (!(CREDIT_EVTS.has(evt) || /^mg:[a-z0-9-]+$/i.test(evt))) return false;
    const trip = this.g.trip;
    if (evt === 'carry' || evt === 'carrypair') {
      if (!trip || !trip.active) { this.n.refused++; this.note(`credit refused (no trip): ${evt}`); return false; }
      data.trip = ((trip.book && trip.book.trips) ? trip.book.trips.length : 0) + 1; // (the host's trip number)
    }
    data.by = 'guest';
    const f = this.feed;
    const ok = f && typeof f.emit === 'function' ? f.emit(evt, data) !== false : s.ingest(evt, data);
    if (/^mg:/.test(evt) && data.kind && data.result && s.rules && typeof s.rules.apply === 'function') s.rules.apply({ id: `mg:${data.kind}:${data.result}`, then: [`f:mg.${data.kind}.${data.result}`] }, {});
    this.n.creditsTaken++;
    this.note(`credit: ${evt}`);
    return ok;
  }

  // --- story items stay with the host ---------------------------------------------------------------------------------------------
  hookInventory() {
    const inv = this.t.inventory; if (!inv || typeof inv.on !== 'function') return;
    try { inv.on('containers', () => { if (this.guest) this.strip(); }); } catch { /* no events */ }
  }
  // a guest's bound things (the notebook, the cans, the note, the postcard) out of the visit's inventory (memory only: kv is
  // frozen, so their own season keeps them)
  strip() {
    const inv = this.t.inventory; if (!inv || !Array.isArray(inv.containers) || this.stripping) return 0;
    this.stripping = true;
    let n = 0;
    try {
      for (const k of inv.containers) for (const e of (k.grid || []).slice()) {
        const d = !e.box && itemDef(e.id);
        if (d && d.bound && typeof inv.take === 'function') { inv.take(k.id, e.uid, e.qty || 1); n++; }
      }
    } catch (e) { console.warn('coop story: strip', e); }
    this.stripping = false;
    if (n) this.n.stripped += n;
    return n;
  }

  // --- night one on a shared night ------------------------------------------------------------------------------------------------
  hookNight() {
    const walt = this.t.walt, camp = this.t.camp;
    if (walt && typeof walt.playNightOne === 'function' && !walt.playNightOne.coopStory) {
      const play = walt.playNightOne.bind(walt);
      walt.playNightOne = () => {
        const shared = this.host && this.coop.remotes.size > 0;
        if (shared) this.coop.send({ t: 'storyn', op: 'read', name: this.myName });
        const r = play();
        const done = () => { if (shared) this.coop.send({ t: 'storyn', op: 'done', name: this.myName }); };
        return Promise.resolve(r).then((v) => { done(); return v; }, (e) => { done(); throw e; });
      };
      walt.playNightOne.coopStory = true;
    }
    if (camp && typeof camp.wake === 'function' && !camp.wake.coopStory) {
      const wake = camp.wake.bind(camp);
      camp.wake = () => (this.guest && this.reading ? this.reading.done.then(() => wake()) : wake());
      camp.wake.coopStory = true;
    }
  }
  nightOne(m) {
    if (m.op === 'read') {
      if (this.reading) return;
      let resolve; const done = new Promise((r) => { resolve = r; });
      this.reading = { at: performance.now(), name: m.name || this.coop.hostName || 'Your friend', done, resolve };
      this.n.readCards++;
      this.card(WORDS.reading.replace('{host}', this.reading.name));
    } else if (m.op === 'done') this.endReading();
  }
  endReading() { const r = this.reading; if (!r) return; this.reading = null; this.card(null); r.resolve(); }
  card(text) {
    if (typeof document === 'undefined') return;
    if (!document.getElementById('coop-reading-css')) { const st = document.createElement('style'); st.id = 'coop-reading-css'; st.textContent = CSS; document.head.appendChild(st); }
    let el = document.getElementById('coop-reading');
    if (!el) { el = document.createElement('div'); el.id = 'coop-reading'; document.body.appendChild(el); }
    if (!text) { el.classList.remove('lit'); setTimeout(() => { if (!this.reading) el.classList.remove('on'); }, 1200); return; }
    el.innerHTML = esc(text);
    el.classList.add('on');
    requestAnimationFrame(() => el.classList.add('lit'));
  }

  // --- sent away: the run is on ---------------------------------------------------------------------------------------------------
  sentAway(m) {
    this.note(`sent away: ${m.why}`);
    if (typeof this.coop.lost === 'function') this.coop.lost(m.why || 'run');
  }

  stats() {
    const s = this.story;
    return { role: this.coop.role, live: this.coop.live, mode: s && s.mode, heard: this.heard, rev: this.host ? this.rev : this.hostRev,
      facts: s && s.doc ? Object.keys(s.doc.facts || {}).length : 0, walt: s ? s.walt() : [], hostMirror: !!(s && s.doc && s.doc.hostMirror),
      cast: [...this.cast.keys()], mirCast: [...this.mirCast.keys()], reading: !!this.reading, runOn: this.runOn(), n: { ...this.n }, log: this.log.slice(-12) };
  }
  makeDebug() {
    const self = this;
    return {
      publish() { self.forceAll = true; return self.publish(performance.now()); },
      apply(m) { return self.apply(m); },
      credit(k, data) { return self.creditOut(k, data); },
      strip() { return self.strip(); },
      reading(op = 'read', name = 'Host') { return self.nightOne({ op, name }); },
    };
  }
}

// a value for the wire: plain JSON (no functions, no cycles)
function plain(v) { try { return v == null ? v : JSON.parse(JSON.stringify(v)); } catch { return null; } }
