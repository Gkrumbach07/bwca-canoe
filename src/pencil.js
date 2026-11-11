// The story's pencil on the map (docs/build/campaign-design.md §4, §4.1; bible 5.3.4; 90 §2 "The player's pencil").
// Stream P, Round 1 (it replaces K1b's stub; the shape the stub promised is kept). Loaded only under STORY_ON (through
// story-seams.js); with the flag off no module imports it and the map draws exactly what main draws.
//
// Everything lives in the story document's `pencil` (story.pencil(): saved with the season, §3.7); with no story
// attached (Node, a rig) it is kept in memory. A co-op guest (story.mode 'mirror') pencils nothing.
//
//   pencil.attach({ story, world, lakeAt(world, x, z), storeOf(ep) → {x,z}, layer, player })   (main.js, st-p)
//   pencil.ring({ id?, place?, x?, z?, r = 220, label, by, lead, talk }) → the ring | null
//       a keeper's ring (by: who said it) or the player's own (by: null). place: a leads-act1.js PLACES key (where it
//       goes, its radius and label). Second voice (§4): a ring within 200 m of one already there adds its speaker to
//       that ring ("Ruth; Hap") instead of drawing a new one. talk: a conversation's key: at most two rings a talk.
//   pencil.marks({ sheet? }) → [{ kind: 'ring', id, x, z, r, label, by: [...], who, lead, followed, closed }
//                              | { kind: 'name', nick, label, x, z, lake, inked } | { kind: 'tick', nb, x, z }
//                              | { kind: 'bearing', x, z, deg } | { kind: 'walked', pts, inked }]
//       what the map draws, in the keepers' own pencil (no new colour); never fed into outfitter.toldHints (bear.js)
//   pencil.follow(id) · close(id) · followLead(lead) · closeLead(lead)    a small dot (been there) · ticked and faint
//   pencil.ringFor(lead | place) → the ring or null (the Walt page's subject word turns to it only if there is one)
//   pencil.has(place) · ringOn(lakeKey)                                    (the sensors ringed: and ringon:)
//   nicknames (bible 5.3.4): pencil.nicknames() → [{ nick, label, nb, matched, inked, pencils }] (seen ones only)
//       unmatched() (the Walt page's chips) · seeNick(nick) (the cutscene showed it) · pencilAt(nick, x, z) → name | null
//       (no feedback: a lake under the point or nothing) · rubAt(x, z, rm) (right-click: the one deletion; ink stays)
//       pick(nick) / picking (the chip picked: the map's click pencils it) · cancel()
//   pencil.tick(nb, x, z) (he was here) · bearing({ x, z, deg, ep }) · walk({ portage, pts }) · inkWalked(portage)
//   pencil.on('ring' | 'name' | 'ink' | 'mark' | 'mode' | '*', fn) → off      fn(e) (fn(kind, e) for '*')
//   pencil.check() the inks and the matches against the story, now (it runs on every story event by itself)
//   pencil.reset() (rigs) · pencil.debug
import { INK, LAKES, PLACES } from './story-data/leads-act1.js';

export const SECOND_VOICE = 200;   // m: a ring this near one already drawn adds a voice instead (§4)
export const PER_TALK = 2;         // rings one conversation pencils at most (§4)
// the sensors this module answers (story-lint registers them too: check 5)
export const PENCIL_SENSORS = { ringon: 'arg', ringed: 'arg', nickseen: 'arg', onlake: 'arg' };

const blank = () => ({ rings: [], names: [], bearings: [], walked: [], ticks: [], seen: [] });
const KEYS = Object.keys(blank());
const normName = (s) => String(s || '').toLowerCase().replace(/\blake\b/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

class Pencil {
  constructor() {
    this.stub = false;
    this.mem = blank();
    this.story = null; this.world = null; this.lakeAtFn = null; this.storeOf = null; this.layer = null; this.player = null;
    this.handlers = new Map();
    this.talks = new Map();      // talk key → rings drawn in it (memory: a conversation does not outlive the page)
    this.picking = null;         // the nickname picked on the Walt page: the map's next click pencils it
    this.keyCache = new Map();   // world lake id → LAKES key | null
    this.busy = false; this.again = false;
    this.offs = [];
    this.debug = { inkRows: INK, places: PLACES, lakes: LAKES, keyOf: (id) => this.lakeKeyOf(id), lakeOfKey: (k) => this.lakeOfKey(k), xz: (p) => this.placeXZ(p), waterOf: (k) => this.waterOf(k) };
  }

  // --- wiring ---------------------------------------------------------------------------------------------------------
  attach({ story = null, world = null, lakeAt = null, storeOf = null, layer = null, player = null } = {}) {
    for (const off of this.offs) { try { off(); } catch { /* gone */ } }
    this.offs = [];
    Object.assign(this, { story, world, lakeAtFn: lakeAt, storeOf, layer, player });
    this.keyCache.clear();
    const s = story;
    if (s && typeof s.sensor === 'function') {
      this.offs.push(s.sensor('ringon', (arg) => this.ringOn(arg)));
      this.offs.push(s.sensor('ringed', (arg) => this.has(arg)));
      this.offs.push(s.sensor('nickseen', (arg) => this.nickSeen(arg)));
      this.offs.push(s.sensor('onlake', (arg) => this.onLake(arg)));
    }
    if (s && typeof s.handle === 'function') this.offs.push(s.handle('ring', (arg, meta) => this.ringAction(arg, meta)));
    if (s && typeof s.on === 'function') this.offs.push(s.on('*', (evt) => { if (evt !== 'ink' && evt !== 'pencil') this.check(); }));
    return this;
  }
  get doc() {
    const s = this.story, d = s && typeof s.pencil === 'function' ? s.pencil() : null;
    if (!d) return this.mem;
    for (const k of KEYS) if (!Array.isArray(d[k])) d[k] = [];
    return d;
  }
  writable() { const s = this.story; return !(s && (s.mode === 'mirror' || !s.doc)); }
  dirty() { const s = this.story; if (s && typeof s.dirty === 'function') s.dirty(); }
  now() { const s = this.story; try { return s && typeof s.time === 'function' ? s.time().abs : 0; } catch { return 0; } }
  tell(kind, e) {
    for (const fn of this.handlers.get(kind) || []) { try { fn(e); } catch (err) { console.warn('pencil.on', kind, err); } }
    for (const fn of this.handlers.get('*') || []) { try { fn(kind, e); } catch (err) { console.warn('pencil.on *', err); } }
  }
  on(kind, fn) {
    if (!this.handlers.has(kind)) this.handlers.set(kind, new Set());
    this.handlers.get(kind).add(fn);
    return () => this.handlers.get(kind).delete(fn);
  }

  // --- lakes and places -------------------------------------------------------------------------------------------------
  lakeId(x, z) {
    const w = this.world;
    if (!w || !Number.isFinite(x) || !Number.isFinite(z)) return 0;
    try { return (this.lakeAtFn ? this.lakeAtFn(w, x, z) : (typeof w.lakeAt === 'function' ? w.lakeAt(x, z) : 0)) || 0; } catch { return 0; }
  }
  lakeRec(id) { const w = this.world; return w && id > 0 && Array.isArray(w.lakes) ? w.lakes[id - 1] || null : null; }
  // the LAKES key a world lake is (by its name, within reach of the key's point), or null
  lakeKeyOf(id) {
    if (!(id > 0)) return null;
    if (this.keyCache.has(id)) return this.keyCache.get(id);
    const L = this.lakeRec(id); let out = null;
    if (L && L.name) {
      const n = normName(L.name);
      for (const [k, q] of Object.entries(LAKES)) {
        if (normName(q.name) !== n) continue;
        const cx = Number.isFinite(L.cx) ? L.cx : q.x, cz = Number.isFinite(L.cz) ? L.cz : q.z;
        if (Math.hypot(cx - q.x, cz - q.z) < 25000) { out = k; break; }
      }
    }
    this.keyCache.set(id, out);
    return out;
  }
  // a LAKES key → a world lake id (the one under its point, else the nearest of that name)
  lakeOfKey(key) {
    const q = LAKES[key]; if (!q) return 0;
    const at = this.lakeId(q.x, q.z);
    if (at > 0 && this.lakeKeyOf(at) === key) return at;
    const w = this.world; if (!w || !Array.isArray(w.lakes)) return 0;
    let best = 0, bd = Infinity; const n = normName(q.name);
    for (const L of w.lakes) { if (!L || normName(L.name) !== n) continue; const d = Math.hypot(L.cx - q.x, L.cz - q.z); if (d < bd && d < 25000) { bd = d; best = L.id; } }
    return best;
  }
  // a point on that LAKES key's water (its middle may be an island): rigs and the auto ink
  waterOf(key) {
    const id = this.lakeOfKey(key), L = this.lakeRec(id); if (!L) return null;
    for (let rad = 0; rad < 3000; rad += 40) for (let a = 0; a < 6.283; a += rad ? 40 / rad : 7) {
      const x = L.cx + Math.cos(a) * rad, z = L.cz + Math.sin(a) * rad;
      if (this.lakeId(x, z) === id) return { x: Math.round(x), z: Math.round(z), lake: id };
    }
    return null;
  }
  // a PLACES key → { x, z, r, label } or null
  placeXZ(key) {
    const p = PLACES[key]; if (!p) return null;
    const out = { r: p.r || 220, label: p.label || '' }, w = this.world;
    if (p.ep != null) {
      const e = w && Array.isArray(w.entryPoints) ? w.entryPoints.find((q) => q.ep === p.ep) : null;
      if (e && Number.isFinite(e.x)) return { ...out, x: e.x, z: e.z };
    }
    if (p.store != null) {
      let s = null; try { s = this.storeOf ? this.storeOf(p.store) : null; } catch { s = null; }
      if (s && Number.isFinite(s.x)) return { ...out, x: s.x, z: s.z };
      const e = w && Array.isArray(w.entryPoints) ? w.entryPoints.find((q) => q.ep === p.store) : null;
      if (e && Number.isFinite(e.x)) return { ...out, x: e.x, z: e.z };
    }
    if (p.lake) {
      const id = this.lakeOfKey(p.lake), L = this.lakeRec(id), q = LAKES[p.lake];
      if (L && Number.isFinite(L.cx)) return { ...out, x: L.cx, z: L.cz };
      if (q) return { ...out, x: q.x, z: q.z };
    }
    if (p.layer && this.layer && typeof this.layer.place === 'function') {
      let pl = null; try { pl = this.layer.place(p.layer); } catch { pl = null; }
      if (pl && Number.isFinite(pl.x)) return { ...out, x: pl.x, z: pl.z };
    }
    if (Number.isFinite(p.x)) return { ...out, x: p.x, z: p.z };
    return null;
  }
  // the LAKES keys a ring touches (its middle and two circles of points inside it)
  lakesUnder(x, z, r) {
    const keys = new Set(), at = (px, pz) => { const k = this.lakeKeyOf(this.lakeId(px, pz)); if (k) keys.add(k); };
    at(x, z);
    for (const f of [0.45, 0.85]) for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; at(x + Math.cos(a) * r * f, z + Math.sin(a) * r * f); }
    return [...keys];
  }

  // --- rings ----------------------------------------------------------------------------------------------------------
  ring({ id = null, place = null, x, z, r, label, by = null, lead = null, talk = null, lake = null } = {}) {
    if (!this.writable()) return null;
    if (place) {
      const p = this.placeXZ(place);
      if (!p) { console.warn(`pencil.ring: no place ${place}`); return null; }
      if (!Number.isFinite(x)) { x = p.x; z = p.z; }
      if (r == null) r = p.r;
      if (label == null) label = p.label;
    }
    if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
    r = Number.isFinite(r) ? r : 220;
    const who = by ? (Array.isArray(by) ? by : [by]).filter(Boolean).map(String) : [];
    const d = this.doc;
    const near = d.rings.find((g) => Math.hypot(g.x - x, g.z - z) < SECOND_VOICE);
    if (near) {
      const added = who.filter((w) => !near.by.includes(w));
      near.by.push(...added);
      if (lead && !near.lead) near.lead = lead;
      if (place && !near.places.includes(place)) near.places.push(place);
      if (lake && !near.lakes.includes(lake)) near.lakes.push(lake);
      this.dirty();
      const ring = this.out(near); this.tell('ring', { ring, added: added.length > 0, voice: true });
      this.check();
      return ring;
    }
    if (talk != null) { const n = this.talks.get(talk) || 0; if (n >= PER_TALK) return null; this.talks.set(talk, n + 1); }
    const lakes = this.lakesUnder(x, z, r); if (lake && !lakes.includes(lake)) lakes.push(lake);
    const g = { id: id || (place ? `r.${place}` : `r.${d.rings.length + 1}.${Math.round(x)}`), x: Math.round(x), z: Math.round(z), r: Math.round(r), label: label || '', by: who, lead, places: place ? [place] : [], lakes, d: this.now(), f: false, c: false };
    while (d.rings.some((q) => q.id === g.id)) g.id += "'";
    d.rings.push(g);
    this.dirty();
    const ring = this.out(g); this.tell('ring', { ring, added: true });
    this.check();
    return ring;
  }
  // a rule's `ring:<place>[@<who>]` (story.handle): the keeper or the person the rule names
  ringAction(arg, meta = {}) {
    const [place, who] = String(arg).split('@');
    return !!this.ring({ place, by: who || (meta.args && meta.args.by) || null, lead: (meta.args && meta.args.lead) || null });
  }
  out(g) { return { kind: 'ring', id: g.id, x: g.x, z: g.z, r: g.r, label: g.label, by: g.by.slice(), who: g.by.join('; '), lead: g.lead, places: g.places.slice(), lakes: g.lakes.slice(), followed: !!g.f, closed: !!g.c, d: g.d }; }
  rings() { return this.doc.rings.map((g) => this.out(g)); }
  has(place) { return this.doc.rings.some((g) => g.places.includes(place)); }
  ringOn(lakeKey) { return this.doc.rings.some((g) => g.lakes.includes(lakeKey)); }
  ringFor(key) { const g = this.doc.rings.find((q) => q.lead === key || q.places.includes(key) || q.id === key); return g ? this.out(g) : null; }
  mark(id, field) {
    if (!this.writable()) return false;
    const g = this.doc.rings.find((q) => q.id === id); if (!g || g[field]) return !!g;
    g[field] = true; this.dirty(); this.tell('mark', { ring: this.out(g), field: field === 'f' ? 'followed' : 'closed' });
    return true;
  }
  follow(id) { return this.mark(id, 'f'); }
  close(id) { return this.mark(id, 'c'); }
  followLead(lead) { let n = 0; for (const g of this.doc.rings) if (g.lead === lead && this.mark(g.id, 'f')) n++; return n; }
  closeLead(lead) { let n = 0; for (const g of this.doc.rings) if (g.lead === lead && this.mark(g.id, 'c')) n++; return n; }

  // --- nicknames ------------------------------------------------------------------------------------------------------
  row(nick) { return INK.find((q) => q.nick === nick) || null; }
  nickSeen(nick) {
    const row = this.row(nick); if (!row) return false;
    if (this.doc.seen.includes(nick)) return true;
    const s = this.story;
    return !!(s && typeof s.nbHas === 'function' && (row.seen || [row.nb]).some((nb) => s.nbHas('read', nb)));
  }
  seeNick(nick) {
    if (!this.row(nick) || !this.writable() || this.doc.seen.includes(nick)) return false;
    this.doc.seen.push(nick); this.dirty(); this.check();
    return true;
  }
  inked(nick) { const s = this.story; return s ? s.has(`ink.${nick}`) : this.mem.names.some((n) => n.nick === nick && n.inked); }
  matched(nick) { const row = this.row(nick), s = this.story; return !!(row && s && typeof s.nbHas === 'function' && s.nbHas('und', row.nb)); }
  nicknames() {
    return INK.filter((r) => this.nickSeen(r.nick)).map((r) => ({ nick: r.nick, label: r.label, nb: r.nb, matched: this.matched(r.nick), inked: this.inked(r.nick), pencils: this.doc.names.filter((n) => n.nick === r.nick).map((n) => n.lake) }));
  }
  // the Walt page's chips: seen, not inked (a matched one may still want its pencil: the ring confirms it at once)
  unmatched() { return this.nicknames().filter((n) => !n.inked); }
  pick(nick) {
    if (!this.row(nick) || this.inked(nick)) return false;
    this.picking = nick; this.tell('mode', { picking: nick });
    return true;
  }
  cancel() { if (!this.picking) return false; this.picking = null; this.tell('mode', { picking: null }); return true; }
  // the player's pencil on the lake under (x, z): nothing if no lake is there. No feedback either way (bible 5.3.4)
  pencilAt(nick, x, z) {
    if (!this.writable() || !this.row(nick)) return null;
    const lake = this.lakeId(x, z); if (!(lake > 0)) return null;
    const d = this.doc, L = this.lakeRec(lake);
    let n = d.names.find((q) => q.nick === nick && q.lake === lake);
    if (n) { if (!n.inked) { n.x = Math.round(x); n.z = Math.round(z); } }
    else { n = { nick, lake, key: this.lakeKeyOf(lake), name: L ? L.name || '' : '', x: Math.round(x), z: Math.round(z), inked: false, d: this.now() }; d.names.push(n); }
    this.dirty();
    this.tell('name', { name: { ...n } });
    this.check();
    return { ...n };
  }
  // right-click: rub out the nearest pencilled (not inked) name within rm metres
  rubAt(x, z, rm = 400) {
    if (!this.writable()) return false;
    const d = this.doc; let bi = -1, bd = rm;
    d.names.forEach((n, i) => { if (n.inked) return; const q = Math.hypot(n.x - x, n.z - z); if (q < bd) { bd = q; bi = i; } });
    if (bi < 0) return false;
    const [n] = d.names.splice(bi, 1);
    this.dirty(); this.tell('name', { name: { ...n }, rubbed: true });
    return true;
  }
  // the player is on that LAKES key's water now
  onLake(key) {
    const p = this.player; if (!p || !Number.isFinite(p.x)) return false;
    return this.lakeKeyOf(this.lakeId(p.x, p.z)) === key;
  }

  // --- the inks and the matches (bible 5.3.4: never without a world confirmation) ---------------------------------------
  check() {
    const s = this.story;
    if (!s || !s.doc || s.mode === 'mirror' || typeof s.when !== 'function') return 0;
    if (this.busy) { this.again = true; return 0; }
    this.busy = true; let n = 0;
    try {
      for (let pass = 0; pass < 4; pass++) {
        this.again = false;
        for (const row of INK) {
          if (row.match && s.when(row.match.when)) for (const a of row.match.then) {
            const i = a.indexOf(':'), k = a.slice(0, i), v = a.slice(i + 1);
            if (k === 'und') s.understand(v, `pencil:${row.nick}`); else if (k === 'walt') s.waltLine(v, `pencil:${row.nick}`); else if (k === 'f') s.set(v, true, `pencil:${row.nick}`);
          }
          if (this.inked(row.nick)) continue;
          const mine = this.doc.names.find((q) => q.nick === row.nick && !q.inked && q.key === row.lake);
          if (!mine && !row.auto) continue;
          if (!s.when(row.when)) continue;
          this.ink(row, mine); n++;
        }
        if (!this.again) break;
      }
    } finally { this.busy = false; }
    return n;
  }
  ink(row, name) {
    const s = this.story;
    let n = name;
    if (!n) { // (auto: the far end inks without the player's pencil, at the lake's own middle)
      const id = this.lakeOfKey(row.lake), L = this.lakeRec(id), q = LAKES[row.lake] || {};
      const wp = this.waterOf(row.lake) || { x: L ? L.cx : q.x, z: L ? L.cz : q.z };
      n = { nick: row.nick, lake: id, key: row.lake, name: L ? L.name || '' : '', x: Math.round(wp.x), z: Math.round(wp.z), inked: false, d: this.now() };
      this.doc.names.push(n);
    }
    n.inked = true;
    this.dirty();
    if (s) {
      s.set(`ink.${row.nick}`, row.lake, 'pencil');
      if (row.nb) s.understand(row.nb, `ink:${row.nick}`);
      if (row.walt) s.waltLine(row.walt, `ink:${row.nick}`);
      s.emit('ink', { nick: row.nick, lake: row.lake });
    }
    this.tell('ink', { name: { ...n } });
  }

  // --- the rest of the pencil: ticks, bearings, the walked carry ----------------------------------------------------------
  tick(nb, x, z) {
    if (!this.writable() || !Number.isFinite(x)) return false;
    const d = this.doc; if (d.ticks.some((t) => t.nb === nb && Math.hypot(t.x - x, t.z - z) < 50)) return false;
    d.ticks.push({ nb, x: Math.round(x), z: Math.round(z) }); this.dirty(); this.tell('mark', { tick: nb });
    return true;
  }
  bearing({ x, z, deg, ep = null } = {}) {
    if (!this.writable() || !Number.isFinite(x) || !Number.isFinite(deg)) return false;
    this.doc.bearings.push({ from: [Math.round(x), Math.round(z)], deg: +deg.toFixed(1), d: this.now(), ep }); this.dirty(); this.tell('mark', { bearing: deg });
    return true;
  }
  walk({ portage, pts = [] } = {}) {
    if (!this.writable() || !portage) return false;
    const d = this.doc, w = d.walked.find((q) => q.portage === portage);
    const p = pts.map(([a, b]) => [Math.round(a), Math.round(b)]);
    if (w) w.pts = p; else d.walked.push({ portage, pts: p, inked: false });
    this.dirty(); this.tell('mark', { walked: portage });
    return true;
  }
  inkWalked(portage) { const w = this.doc.walked.find((q) => q.portage === portage); if (!w || w.inked || !this.writable()) return false; w.inked = true; this.dirty(); return true; }

  // --- what the map draws -------------------------------------------------------------------------------------------------
  marks() {
    const d = this.doc, out = [];
    for (const g of d.rings) out.push(this.out(g));
    const rows = new Map(INK.map((r) => [r.nick, r]));
    for (const n of d.names) out.push({ kind: 'name', nick: n.nick, label: (rows.get(n.nick) || {}).label || n.nick, x: n.x, z: n.z, lake: n.lake, inked: !!n.inked });
    for (const t of d.ticks) out.push({ kind: 'tick', nb: t.nb, x: t.x, z: t.z });
    for (const b of d.bearings) out.push({ kind: 'bearing', x: b.from[0], z: b.from[1], deg: b.deg });
    for (const w of d.walked) out.push({ kind: 'walked', portage: w.portage, pts: w.pts, inked: !!w.inked });
    return out;
  }
  reset() { this.mem = blank(); this.talks.clear(); this.picking = null; const s = this.story; if (s && typeof s.pencil === 'function' && s.pencil()) { const d = s.pencil(); for (const k of KEYS) d[k] = []; this.dirty(); } }
}

export const pencil = new Pencil();
export { Pencil };
