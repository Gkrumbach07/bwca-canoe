// Co-op phase 2, stream B (docs/plans/coop.md, "Phase 2 as designed"): a purse each, giving, and a guest's things kept
// by the host. The owner, after playing phase 1: "each has their own inventory" and "money is not shared, but we need a
// way to give money".
//
//   - A purse each: every browser's own profile.money. A guest's purse and inventory while visiting are the visit's,
//     not their own season's: the host keeps them (below) and hands them back as the guest comes in; the guest's own
//     season stays in their store untouched (kv is frozen while visiting) and comes back when they leave (a reload).
//   - Give money: the dot on a friend within reach is "E Give money" (GIVE_R both on foot; AFLOAT_R when either of you
//     is in a canoe: from the canoe the dot points at their canoe, pointer.registerWater, as at a party's); a small
//     conversation panel (dialogue.js, the game's own; `afloat` keeps it open in the canoe) offers $5, $10, $20 and All,
//     greyed past what you have. Spent here (profile.spend, 'to Ada'), earned there (profile.earn, 'from Gage').
//   - Give a thing: the book's right-click has "Give to Ada" for each friend within reach (the inventory.moreVerbs hook,
//     read by inv-ui.js verbMenu): on an entry (loose items, any quantity), on a container by its strap or its box in
//     another's grid (sent whole: its grid and every container nested in it), and on a long thing (the rod, a paddle).
//     Not the pockets, the crate, a hand's holder, a pile, a station or anything fixed. A loose item lands in a free
//     hand, else the best fit in reach (inventory.place), else a pile at their feet; a container or a long thing in a
//     free hand, else set down at their feet (in the canoe, afloat), rebuilt with the receiver's own ids.
//   - Never twice, never lost: a gift has an id. The receiver remembers every id it answered this session (applied or
//     refused) and answers a repeat the same way. A sender with no answer in ACK_MS asks (giftq) every ACK_MS; it takes
//     the thing back only when the receiver says it never had it (and so will refuse it if it comes late), or the
//     friend has left the room (or we have).
//   - A guest's things kept by the host: the guest sends { inv, money, ledger } every KEEP_EVERY and as they leave (and
//     on pagehide); the host keeps it in its own season's save (`coop-guests`, by the visitor's id, coop.js visitor.id).
//     A guest coming in asks for theirs (claim) and gets it back (yours), or { fresh } on a first visit: the starter kit
//     in the canoe (inventory.newSeason) and START_MONEY. Nothing a guest has is sent to the host before that answer, so
//     their own season's things never reach the host.
//
// The wire (coop.on / coop.send, through the relay; `to` a peer's id, `from` added by the relay):
//   claim    guest → host  { vid, name }                       (again every CLAIM_EVERY until the answer)
//   yours    host → guest  { inv, money, ledger } | { fresh: true }
//   keep     guest → host  { vid, name, inv, money, ledger }
//   gift     any → one     { gid, money } | { gid, entry: { id, qty, data?, …, def? } } | { gid, tree, defs } (a container:
//                          { item, name, grid: [entries], kids: [{ x, y, rot, tree }] }) | { gid, long: { id }, defs }
//   giftq    sender → one  { gid }                          (no answer yet: did you get it?)
//   giftack  back          { gid, ok, why? }                 (why 'never': not applied, and now refused if it comes)
//   The host keeps at most KEEP_MAX visitors, and forgets one not seen for KEEP_DAYS real days (Date.now, not the game's
//   clock: a Sandbox host can stop or run its clock as it likes).
//
//   const give = new CoopGive(coop, { pointer, talk })   (main.js, after the coop)
//   give.money(peerId, n) → bool · give.item(peerId, { cId, uid }) → bool · give.thing(peerId, { container } | { long })
//   give.mine · give.stats() · give.prune(doc)
//   give.refuse / give.mute / give.dropAcks = n   (the tests: refuse every gift / lose gifts on the way / lose the next n acks)
import { save } from './save.js';
import { itemDef, defineItem } from './items.js';
import { START_MONEY } from './profile.js';

export const GIVE_R = 3;          // m: a friend this near can be given to, both on foot
export const AFLOAT_R = 6;        // m: and when either of you is in a canoe (alongside)
const ACK_MS = 3000;              // no answer to a gift in this long: ask again (giftq), every this long
const KEEP_DAYS = 30;             // real days: a visitor not seen this long is forgotten by the host
const KEEP_MAX = 16;              // visitors the host keeps, the most recently seen
const NO_GIVE = /^(pockets|crate|pile|woodarms|inhand)$/;
const KEEP_EVERY = 30000;         // ms between a guest's keeps
const CLAIM_EVERY = 3000;         // ms between a guest's claims until the host answers
const NS = 'coop-guests';         // the host's save of its guests' things
const AMOUNTS = [5, 10, 20];
const LEDGER_KEPT = 40;
const ENTRY_SKIP = new Set(['uid', 'x', 'y', 'rot', 'box']);
const newGid = () => `${Date.now().toString(36)}${Math.floor(Math.random() * 1e9).toString(36)}`;
const cash = (n) => Math.max(0, Math.round(Number(n) || 0));

export class CoopGive {
  constructor(coop, { pointer = null, talk = null } = {}) {
    this.coop = coop; this.pointer = pointer; this.talk = talk;
    this.pending = new Map();   // gid → { to, name, money?, entry?, timer }
    this.answered = new Map();  // gift id → the ack it got here ({ ok, why }): a repeat or a question gets the same
    this.mine = false;          // a guest: the visit's things are loaded (the host has answered)
    this.claimT = 0; this.keepT = 0;
    this.refuse = false; this.mute = false; this.dropAcks = 0; // (the tests)
    this.log = [];
    coop.on('claim', (m) => this.onClaim(m));
    coop.on('yours', (m) => this.onYours(m));
    coop.on('keep', (m) => this.onKeep(m));
    coop.on('gift', (m) => this.onGift(m));
    coop.on('giftack', (m) => this.onAck(m));
    coop.on('giftq', (m) => this.onAsk(m));
    coop.onPeers((what, peer) => { if (what === 'gone') this.dropPending(); else if (what === 'leave' && peer) this.dropPending(peer.id); });
    coop.tick((now) => this.tick(now));
    // a guest asks for their things once they are in (after enterAsGuest: a new season there would overwrite them)
    const enter = coop.enterAsGuest.bind(coop);
    coop.enterAsGuest = async (w) => { const r = await enter(w); this.mine = false; this.claimT = 0; return r; };
    // and leaves them with the host on the way out
    const leave = coop.leave.bind(coop);
    coop.leave = () => { if (coop.role === 'guest') this.sendKeep(); return leave(); };
    if (typeof window !== 'undefined') window.addEventListener('pagehide', () => { if (coop.role === 'guest' && coop.live) this.sendKeep(); });
    if (pointer) { pointer.register((ray, near) => this.targets(ray, near, false)); if (pointer.registerWater) pointer.registerWater((ray, near) => this.targets(ray, near, true)); }
    const inv = coop.g.inventory;
    if (inv) inv.moreVerbs = (ref) => this.verbs(ref);
  }
  get g() { return this.coop.g; }
  get myName() { return this.coop.visitor.name || 'A friend'; }
  get ready() { return this.coop.live && (this.coop.role !== 'guest' || this.mine); }
  host() { return this.coop.peers().find((p) => p.host) || null; }
  nameOf(id) { const r = this.coop.remotes.get(id); return r ? r.name : 'a friend'; }
  note(text, s = 4) { const hud = this.g.hud; if (hud && hud.note) hud.note(text, s); this.log.push(text); if (this.log.length > 20) this.log.shift(); }
  // friends near enough to give to: GIVE_R both on foot, AFLOAT_R when either is in a canoe
  afloat(r) { const p = this.g.player, at = r && r.drawnAt; return !!((p && p.mode === 'paddle') || (at && at.m === 'paddle')); }
  reachTo(id) { return this.afloat(this.coop.remotes.get(id)) ? AFLOAT_R : GIVE_R; }
  near() { return this.coop.peers().filter((p) => p.near(this.reachTo(p.id))); }

  // --- every frame in a room ---------------------------------------------------------------------------------------
  tick(now) {
    if (this.coop.role !== 'guest') return;
    if (!this.mine) {
      const h = this.host();
      if (h && now - this.claimT > CLAIM_EVERY) { this.claimT = now; this.coop.send({ t: 'claim', to: h.id, vid: this.coop.visitor.id, name: this.myName }); }
      return;
    }
    if (now - this.keepT > KEEP_EVERY) { this.keepT = now; this.sendKeep(); }
  }

  // --- the host keeps a guest's things -------------------------------------------------------------------------------
  kept() { const s = save.read(NS); return s && s.v === 1 && s.by && typeof s.by === 'object' ? s : { v: 1, by: {} }; }
  // forget visitors not seen for KEEP_DAYS real days, and all but the KEEP_MAX most recently seen → how many went
  prune(s, now = Date.now()) {
    const ids = Object.keys(s.by), old = now - KEEP_DAYS * 86400e3;
    for (const id of ids) if (!(Number(s.by[id] && s.by[id].at) >= old)) delete s.by[id];
    const keep = Object.keys(s.by).sort((a, b) => s.by[b].at - s.by[a].at);
    for (const id of keep.slice(KEEP_MAX)) delete s.by[id];
    return ids.length - Object.keys(s.by).length;
  }
  onClaim(m) {
    if (this.coop.role !== 'host' || typeof m.vid !== 'string') return;
    const s = this.kept();
    if (this.prune(s)) save.write(NS, s);
    const k = s.by[m.vid];
    if (k && k.inv) this.coop.send({ t: 'yours', to: m.from, inv: k.inv, money: k.money, ledger: k.ledger });
    else this.coop.send({ t: 'yours', to: m.from, fresh: true });
  }
  onKeep(m) {
    if (this.coop.role !== 'host' || typeof m.vid !== 'string' || !m.inv || typeof m.inv !== 'object') return;
    const s = this.kept();
    s.by[m.vid] = { name: String(m.name || '').slice(0, 24), inv: m.inv, money: cash(m.money), ledger: Array.isArray(m.ledger) ? m.ledger.slice(-LEDGER_KEPT) : [], at: Date.now() };
    this.prune(s);
    save.write(NS, s);
  }
  // a guest: what the host kept (or a first visit's kit), in memory only (kv is frozen while visiting)
  onYours(m) {
    if (this.coop.role !== 'guest' || this.mine) return;
    const inv = this.g.inventory, pr = this.g.profile;
    if (!inv || !pr) return;
    let money = START_MONEY, ledger = [{ n: START_MONEY, why: `to start the visit to ${this.coop.hostName || 'a friend'}` }];
    if (m.fresh || !m.inv) inv.newSeason();
    else {
      inv.restore(m.inv);
      inv.season = pr.seasonId; // (kv is frozen: nothing of the visit is written whatever the id)
      if (typeof inv.refreshUse === 'function') inv.refreshUse();
      inv.emit('containers');
      money = cash(m.money);
      ledger = Array.isArray(m.ledger) ? m.ledger.slice(-LEDGER_KEPT) : [];
    }
    pr.s.money = money; pr.s.ledger = ledger;
    pr.changed('money');
    this.mine = true; this.keepT = performance.now();
    this.sendKeep(); // (a first visit: the host has the kit from now on)
  }
  sendKeep() {
    if (this.coop.role !== 'guest' || !this.mine) return false;
    const h = this.host(), inv = this.g.inventory, pr = this.g.profile;
    if (!h || !inv || !pr) return false;
    return this.coop.send({ t: 'keep', to: h.id, vid: this.coop.visitor.id, name: this.myName, inv: inv.serialize(), money: pr.money, ledger: (pr.ledger || []).slice(-LEDGER_KEPT) });
  }

  // --- giving --------------------------------------------------------------------------------------------------------
  money(to, n) {
    const pr = this.g.profile, name = this.nameOf(to);
    n = cash(n);
    if (!this.ready || !pr || !n || !pr.canAfford(n)) return false;
    if (!pr.spend(n, `to ${name}`)) return false;
    return this.send(to, { money: n }, () => { pr.earn(n, `back: ${name} didn’t take it`); }, `You gave ${name} $${n}.`, `${name} didn’t take the $${n}. It’s back in your purse.`);
  }
  item(to, { cId, uid } = {}) {
    const inv = this.g.inventory, name = this.nameOf(to);
    if (!this.ready || !inv) return false;
    const c = inv.cont(cId), e = c && c.grid.find((q) => q.uid === uid);
    if (e && e.box) return this.thing(to, { container: e.uid });
    if (!e || e.fixed) return false;
    const taken = inv.take(cId, uid);
    if (!taken) return false;
    const entry = {};
    for (const [k, v] of Object.entries(taken)) if (!ENTRY_SKIP.has(k) && v !== undefined) entry[k] = v && typeof v === 'object' ? JSON.parse(JSON.stringify(v)) : v;
    const d = itemDef(entry.id);
    if (/^sig:/.test(entry.id) && d) entry.def = d; // (a signature item's definition rides with it, as in the save)
    const what = `${entry.qty > 1 ? `${entry.qty} × ` : ''}${d ? d.name : entry.id}`;
    return this.send(to, { entry }, () => { this.land(entry, { back: cId }); }, `You gave ${name} ${what}.`, `${name} didn’t take ${what}. It’s back with you.`);
  }
  // a container (with everything in it and nested in it) or a long thing that may be given; ref { container } | { long }
  canGive(ref) {
    const inv = this.g.inventory, t = inv && inv.thing(ref);
    if (!t || !t.def || t.def.fixed || t.def.one || t.def.station) return null;
    if (t.kind === 'container' && (NO_GIVE.test(t.obj.item) || t.obj.where === 'pockets' || t.obj.where === 'hung')) return null;
    return t;
  }
  thing(to, ref) {
    const inv = this.g.inventory, name = this.nameOf(to), t = this.ready ? this.canGive(ref) : null;
    if (!t || !inv.thingReachable(t)) return false;
    const defs = {}, sig = (id) => { if (/^sig:/.test(id) && itemDef(id)) defs[id] = itemDef(id); };
    let body, back;
    if (t.kind === 'long') {
      const l = t.obj; sig(l.id);
      inv.long.splice(inv.long.indexOf(l), 1);
      if (typeof inv.refreshUse === 'function') inv.refreshUse();
      inv.emit('long');
      body = { long: { id: l.id }, defs };
      back = () => {
        if (inv.long.includes(l)) return;
        if (l.where === 'hands' && (inv.hands[l.hand] || inv.freeHand() < 0)) this.placeThing(l);
        inv.long.push(l);
        if (typeof inv.refreshUse === 'function') inv.refreshUse();
        inv.emit('long');
      };
    } else {
      const root = t.obj, all = [], walk = (c) => { all.push(c); for (const e of c.grid) if (e.box) { const k = inv.cont(e.uid); if (k) walk(k); } };
      walk(root);
      const pack = (c) => ({
        item: c.item, name: c.name,
        grid: c.grid.filter((e) => !e.box).map((e) => { sig(e.id); const o = JSON.parse(JSON.stringify(e)); delete o.uid; return o; }),
        kids: c.grid.filter((e) => e.box && inv.cont(e.uid)).map((e) => ({ x: e.x, y: e.y, rot: e.rot || 0, tree: pack(inv.cont(e.uid)) })),
      });
      const tree = pack(root);
      const box = root.where === 'in' ? inv.boxEntry(root.id) : null;
      if (box) box.c.grid.splice(box.c.grid.indexOf(box.e), 1);
      inv.containers = inv.containers.filter((c) => !all.includes(c));
      inv.emit('containers');
      body = { tree, defs };
      back = () => {
        if (inv.containers.includes(root)) return;
        if (box && inv.cont(box.c.id) && inv.fits(box.c.id, root.item, box.e.x, box.e.y, box.e.rot || 0)) box.c.grid.push(box.e);
        else if (root.where === 'in' || (root.where === 'hands' && (inv.hands[root.hand] || inv.freeHand() < 0))) { root.in = null; this.placeThing(root); }
        inv.containers.push(...all);
        inv.emit('containers');
      };
    }
    const what = t.def.name;
    return this.send(to, body, back, `You gave ${name} ${what}.`, `${name} didn’t take ${what}. It’s back with you.`);
  }
  // where a whole thing goes here: a free hand, else at your feet on foot, else the canoe (sets o.where, o.at, o.hand)
  placeThing(o) {
    const inv = this.g.inventory, p = this.g.player, h = inv.freeHand();
    o.hand = null; o.at = null;
    if (p && p.onFoot && h >= 0) { o.where = 'hands'; o.hand = h; return 'hand'; }
    if (p && p.onFoot) {
      const s = inv.downSpot() || { x: p.x, z: p.z };
      o.where = 'ground'; o.at = { x: s.x, z: s.z, y: inv.groundY(s.x, s.z), heading: p.heading || 0, left: true };
      return 'ground';
    }
    o.where = 'canoe';
    return 'canoe';
  }
  // a container sent whole, rebuilt here with this inventory's own ids
  build(t, where, guard = 0) {
    const inv = this.g.inventory;
    if (!t || !itemDef(t.item) || !itemDef(t.item).container || guard > 8) return null;
    const c = inv.mk(t.item, where);
    if (t.name) c.name = String(t.name).slice(0, 60);
    inv.containers.push(c);
    for (const e of Array.isArray(t.grid) ? t.grid : []) if (e && itemDef(e.id)) c.grid.push({ ...e, uid: inv.uid(), qty: Math.max(1, e.qty | 0) });
    for (const k of Array.isArray(t.kids) ? t.kids : []) {
      const ch = this.build(k.tree, 'in', guard + 1);
      if (!ch) continue;
      ch.in = c.id;
      c.grid.push({ uid: ch.id, id: ch.item, x: k.x | 0, y: k.y | 0, rot: k.rot | 0, qty: 1, box: true });
    }
    return c;
  }
  send(to, body, refund, okWords, backWords) {
    const gid = newGid(), name = this.nameOf(to);
    const sent = this.coop.send({ t: 'gift', to, gid, ...body });
    if (!sent) { refund(); this.note(`Couldn’t reach ${name}.`); return false; }
    this.pending.set(gid, { to, name, ...body, refund, okWords, backWords, timer: null, asks: 0 });
    this.wait(gid);
    return true;
  }
  // no answer in ACK_MS: ask (giftq), and again every ACK_MS, until it answers or leaves
  wait(gid) {
    const p = this.pending.get(gid); if (!p) return;
    clearTimeout(p.timer);
    p.timer = setTimeout(() => {
      if (!this.pending.has(gid)) return;
      if (!this.coop.remotes.has(p.to) || !this.coop.live) { this.settle(gid, false); return; }
      p.asks++;
      this.coop.send({ t: 'giftq', to: p.to, gid });
      this.wait(gid);
    }, ACK_MS);
  }
  settle(gid, ok) {
    const p = this.pending.get(gid); if (!p) return;
    this.pending.delete(gid); clearTimeout(p.timer);
    if (ok) this.note(p.okWords, 3);
    else { p.refund(); this.note(p.backWords, 4); }
  }
  onAck(m) { const p = m.gid && this.pending.get(m.gid); if (p && p.to === m.from) this.settle(m.gid, !!m.ok); }
  dropPending(peer = null) { for (const [gid, p] of [...this.pending]) if (peer == null || p.to === peer) this.settle(gid, false); }
  // the answer to a gift, remembered for the session (a repeat or a question gets the same)
  ack(m, ok, why = null) {
    const a = { ok, ...(why ? { why } : {}) };
    this.answered.set(m.gid, a);
    if (this.dropAcks > 0) { this.dropAcks--; return; } // (the tests: this answer is lost on the way)
    this.coop.send({ t: 'giftack', to: m.from, gid: m.gid, ...a });
  }
  // the sender asks after a gift: the answer it had, or "never" (and from now on it is refused if it comes late)
  onAsk(m) {
    if (!m.gid) return;
    const a = this.answered.get(m.gid);
    if (a) this.coop.send({ t: 'giftack', to: m.from, gid: m.gid, ...a });
    else this.ack(m, false, 'never');
  }
  onGift(m) {
    if (this.mute || !m.gid) return;
    const was = this.answered.get(m.gid);
    if (was) { this.coop.send({ t: 'giftack', to: m.from, gid: m.gid, ...was }); return; }
    if (this.refuse || !this.ready) { this.ack(m, false, this.refuse ? 'refused' : 'not ready'); return; }
    const name = this.nameOf(m.from), pr = this.g.profile, inv = this.g.inventory;
    for (const d of Object.values(m.defs || {})) if (d && /^sig:/.test(d.id) && !itemDef(d.id)) { try { defineItem(d); } catch { /* unknown */ } }
    if (Number.isFinite(m.money)) {
      const n = cash(m.money);
      if (!n || !pr) { this.ack(m, false, 'nothing'); return; }
      pr.earn(n, `from ${name}`);
      this.ack(m, true);
      this.note(`${name} gave you $${n}.`);
      return;
    }
    const at = (w) => (w === 'hand' ? ': in your hand' : w === 'ground' ? ': at your feet' : w === 'canoe' ? ': in your canoe' : '');
    if (m.long && typeof m.long.id === 'string') {
      const d = itemDef(m.long.id);
      if (!d || d.kind !== 'long') { this.ack(m, false, 'unknown'); return; }
      const l = inv.addLong(d.id, 'stash', null, { quiet: true }), w = this.placeThing(l);
      inv.refreshUse(); inv.emit('long');
      this.ack(m, true);
      this.note(`${name} gave you ${d.name}${at(w)}.`);
      return;
    }
    if (m.tree && typeof m.tree === 'object') {
      const c = this.build(m.tree, 'stash');
      if (!c) { this.ack(m, false, 'unknown'); return; }
      const w = this.placeThing(c);
      inv.emit('containers');
      this.ack(m, true);
      this.note(`${name} gave you ${c.name}${at(w)}.`);
      return;
    }
    const e = m.entry;
    if (!e || typeof e.id !== 'string') { this.ack(m, false, 'nothing'); return; }
    if (e.def && /^sig:/.test(e.id) && !itemDef(e.id)) { try { defineItem(e.def); } catch { /* unknown */ } }
    const d = itemDef(e.id);
    if (!d || d.kind === 'container' || d.kind === 'long') { this.ack(m, false, 'unknown'); return; }
    const where = this.land(e);
    if (!where) { this.ack(m, false, 'no room'); return; }
    this.ack(m, true);
    this.note(`${name} gave you ${e.qty > 1 ? `${e.qty} × ` : ''}${d.name}${at(where === 'pack' ? '' : where)}.`);
  }
  // an entry into this inventory: a free hand, else the best fit in reach, else a pile at the feet → 'hand' | 'pack' |
  // 'ground' | null. Fields other than its data (the bottle's litres, a use count) are kept on the new entry.
  land(e, { back = null } = {}) {
    const inv = this.g.inventory; if (!inv) return null;
    const qty = Math.max(1, e.qty | 0), data = e.data || null;
    const extra = {};
    for (const [k, v] of Object.entries(e)) if (!['id', 'qty', 'data', 'def', 'fixed'].includes(k)) extra[k] = v;
    const fix = () => { const c = inv.containers.find((k) => k.grid.some((q) => q.uid === inv.lastPut)); const n = c && c.grid.find((q) => q.uid === inv.lastPut); if (n && n.id === e.id) Object.assign(n, extra); };
    if (back && inv.cont(back) && inv.put(back, e.id, { qty, data, quiet: true })) { fix(); inv.emit('items'); return 'pack'; } // (a refund: where it was)
    if (qty <= Math.max(1, (itemDef(e.id) || {}).stack || 1)) {
      const h = inv.toHandNew(e.id, { data, qty });
      if (h && h.ok) { fix(); inv.emit('carry'); return 'hand'; }
    }
    const r = inv.place(e.id, qty, { data, quiet: true });
    if (r && r.ok) { fix(); inv.emit('items'); return 'pack'; }
    // what did not fit (r.placed of it did): a pile at the feet
    const left = qty - ((r && r.placed) || 0), p = this.g.player;
    if (!p) return null;
    const f = p.forward || { x: Math.sin(p.heading || 0), z: Math.cos(p.heading || 0) }, x = p.x + f.x * 0.6, z = p.z + f.z * 0.6;
    const pile = inv.addContainer('pile', 'ground', { x, z, y: typeof p.groundAt === 'function' ? p.groundAt(x, z) : 0, heading: p.heading || 0, left: true }, { quiet: true });
    const ok = !!(pile && inv.put(pile, e.id, { qty: left, data, quiet: true }));
    if (ok) fix();
    inv.emit('ground');
    return ok ? 'ground' : null;
  }

  // --- the book's right-click: Give to <friend> ---------------------------------------------------------------------
  // ref: { cId, uid } an entry (a box entry: the container it is), { container } or { long } a thing by its strap
  verbs(ref) {
    if (!ref || !this.coop.live) return [];
    const friends = this.near();
    if (!friends.length) return [];
    const inv = this.g.inventory;
    let run, reach;
    if (ref.cId && ref.uid) {
      const c = inv.cont(ref.cId), e = c && c.grid.find((q) => q.uid === ref.uid);
      if (!e || e.fixed) return [];
      if (e.box) { if (!this.canGive({ container: e.uid })) return []; run = (f) => this.thing(f.id, { container: e.uid }); } else run = (f) => this.item(f.id, ref);
      reach = typeof inv.isReachable === 'function' ? inv.isReachable(ref.cId) : true;
    } else if (ref.container || ref.long) {
      const t = this.canGive(ref);
      if (!t) return [];
      run = (f) => this.thing(f.id, ref);
      reach = inv.thingReachable(t);
    } else return [];
    const ok = this.ready;
    return friends.map((f) => ({ label: `Give to ${f.name}`, disabled: !ok || !reach, title: !ok ? 'not yet' : !reach ? 'out of reach' : '', run: () => run(f) }));
  }

  // --- the dot: E Give money on a friend within reach (on foot: at them; from the canoe: at their canoe or them) -------
  targets(ray, near, water) {
    if (!this.coop.live || !this.coop.remotes.size) return null;
    const p = this.g.player, out = [];
    if (!p || (water ? p.mode !== 'paddle' : !p.onFoot)) return null;
    const pr = this.g.profile, broke = !pr || pr.money <= 0;
    const e = (r) => ({ verb: 'Give money', why: !this.ready ? 'Not yet' : broke ? 'Your purse is empty' : null, run: () => this.moneyCard(r.id) });
    for (const r of this.coop.remotes.values()) {
      const at = r.drawnAt, P = r.person, B = r.boat;
      if (!at || !P) continue;
      const R = this.afloat(r) ? AFLOAT_R : GIVE_R;
      if (at.m === 'paddle') {
        // their canoe: the hull's box (as a party's canoe, pointer.js partyTargets)
        if (!B || !B.ext || near.flat(B.x, B.z) > R) continue;
        const by = Number.isFinite(B.y) ? B.y : near.y, hit = near.box({ x: B.x, y: by + 0.5, z: B.z, hx: 2.7, hy: 1.0, hz: 1.1, heading: B.heading || 0 });
        if (!hit) continue;
        out.push({ dist: hit.t, miss: hit.miss, target: { kind: 'person', ref: `coop:${r.id}`, label: r.name, e: e(r), box: { x: B.x, y: by + 0.3, z: B.z, hx: 2.7, hy: 0.5, hz: 0.6, heading: B.heading || 0 } } });
        continue;
      }
      if (near.flat(P.x, P.z) > R) continue;
      const gy = Number.isFinite(P.y) ? P.y : near.y, hit = near.segment(P.x, gy + 0.35, P.z, P.x, gy + 1.58, P.z, 0.42);
      if (!hit) continue;
      out.push({ dist: hit.t, miss: hit.miss * 0.9, target: { kind: 'person', ref: `coop:${r.id}`, label: r.name, e: e(r), box: { x: P.x, y: gy + 0.9, z: P.z, hx: 0.3, hy: 0.9, hz: 0.3, heading: P.heading || 0 } } });
    }
    return out;
  }
  // the amounts, in the conversation panel (dialogue.js): $5, $10, $20, All; greyed past what you have
  moneyCard(to) {
    const r = this.coop.remotes.get(to), pr = this.g.profile, talk = this.talk;
    if (!r || !pr) return false;
    const have = pr.money, name = r.name;
    const pick = (n) => () => {
      if (n > pr.money || !n) return { end: true, after: () => this.note(`You have $${pr.money}.`, 3) };
      return { end: true, after: () => this.money(to, n) };
    };
    const choices = AMOUNTS.map((n) => ({ text: `$${n}`, dim: n > have, go: pick(n) }));
    choices.push({ text: have > 0 ? `All of it · $${have}` : 'All of it', dim: have <= 0, go: pick(have) });
    choices.push({ text: 'Never mind.', kind: 'bye', go: () => null });
    if (!talk) return false;
    return talk.open({
      speaker: { key: `coop:${to}`, name, pos: (v) => (r.boat && r.boat.ext && r.drawnAt && r.drawnAt.m === 'paddle' ? v.set(r.boat.x, (r.boat.y || 0) + 0.95, r.boat.z) : r.person.headAt(v)) },
      name, role: `you have $${have}`, afloat: true,
      start: () => ({ say: have > 0 ? 'How much?' : 'Your purse is empty.', plain: true, by: `Give ${name} money`, choices }), // (plain: the game's line, not the friend's: no speech marks, not remembered as said)
      bye: () => null,
    });
  }

  stats() {
    const pr = this.g.profile;
    return { mine: this.mine, money: pr ? pr.money : null, pending: this.pending.size, answered: this.answered.size, ready: this.ready, log: this.log.slice(-6) };
  }
}
