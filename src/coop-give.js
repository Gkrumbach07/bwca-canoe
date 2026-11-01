// Co-op phase 2, stream B (docs/plans/coop.md, "Phase 2 as designed"): a purse each, giving, and a guest's things kept
// by the host. The owner, after playing phase 1: "each has their own inventory" and "money is not shared, but we need a
// way to give money".
//
//   - A purse each: every browser's own profile.money. A guest's purse and inventory while visiting are the visit's,
//     not their own season's: the host keeps them (below) and hands them back as the guest comes in; the guest's own
//     season stays in their store untouched (kv is frozen while visiting) and comes back when they leave (a reload).
//   - Give money: the dot on a friend on foot within GIVE_R is "E Give money"; a small conversation panel (dialogue.js,
//     the game's own) offers $5, $10, $20 and All, greyed past what you have. Spent here (profile.spend, 'to Ada'),
//     earned there (profile.earn, 'from Gage') with a note. No answer in ACK_MS, or a refusal: the money comes back.
//   - Give an item: an entry's right-click in the book has "Give to Ada" for each friend within GIVE_R (the
//     inventory.moreVerbs hook, read by inv-ui.js verbMenu). It is taken here and lands there: a free hand, else the
//     best fit in reach (inventory.place), else a pile at their feet. Refused or unanswered: it comes back the same way.
//     v1 gives loose items only (an entry in a grid, any quantity): a container with its contents, or a long thing (the
//     rod, a paddle), is not given yet.
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
//   gift     any → one     { gid, money } | { gid, entry: { id, qty, data?, …, def? } }
//   giftack  back          { gid, ok, why? }
//
//   const give = new CoopGive(coop, { pointer, talk })   (main.js, after the coop)
//   give.money(peerId, n) → bool · give.item(peerId, { cId, uid }) → bool · give.mine · give.stats()
//   give.refuse / give.mute   (the tests: refuse every gift / let gifts go unanswered)
import { save } from './save.js';
import { itemDef, defineItem } from './items.js';
import { START_MONEY } from './profile.js';

export const GIVE_R = 3;          // m: a friend this near can be given to
const ACK_MS = 3000;              // no answer to a gift in this long: it comes back
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
    this.got = new Set();       // gift ids taken here (a resend is not taken twice)
    this.mine = false;          // a guest: the visit's things are loaded (the host has answered)
    this.claimT = 0; this.keepT = 0;
    this.refuse = false; this.mute = false; // (the tests)
    this.log = [];
    coop.on('claim', (m) => this.onClaim(m));
    coop.on('yours', (m) => this.onYours(m));
    coop.on('keep', (m) => this.onKeep(m));
    coop.on('gift', (m) => this.onGift(m));
    coop.on('giftack', (m) => this.onAck(m));
    coop.onPeers((what) => { if (what === 'gone') this.dropPending(); });
    coop.tick((now) => this.tick(now));
    // a guest asks for their things once they are in (after enterAsGuest: a new season there would overwrite them)
    const enter = coop.enterAsGuest.bind(coop);
    coop.enterAsGuest = async (w) => { const r = await enter(w); this.mine = false; this.claimT = 0; return r; };
    // and leaves them with the host on the way out
    const leave = coop.leave.bind(coop);
    coop.leave = () => { if (coop.role === 'guest') this.sendKeep(); return leave(); };
    if (typeof window !== 'undefined') window.addEventListener('pagehide', () => { if (coop.role === 'guest' && coop.live) this.sendKeep(); });
    if (pointer) pointer.register((ray, near) => this.targets(ray, near));
    const inv = coop.g.inventory;
    if (inv) inv.moreVerbs = (ref) => this.verbs(ref);
  }
  get g() { return this.coop.g; }
  get myName() { return this.coop.visitor.name || 'A friend'; }
  get ready() { return this.coop.live && (this.coop.role !== 'guest' || this.mine); }
  host() { return this.coop.peers().find((p) => p.host) || null; }
  nameOf(id) { const r = this.coop.remotes.get(id); return r ? r.name : 'a friend'; }
  note(text, s = 4) { const hud = this.g.hud; if (hud && hud.note) hud.note(text, s); this.log.push(text); if (this.log.length > 20) this.log.shift(); }
  // friends near enough to give to (on foot or afloat alike: the book's verb; the dot asks for them on foot)
  near() { return this.coop.peers().filter((p) => p.near(GIVE_R)); }

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
  onClaim(m) {
    if (this.coop.role !== 'host' || typeof m.vid !== 'string') return;
    const k = this.kept().by[m.vid];
    if (k && k.inv) this.coop.send({ t: 'yours', to: m.from, inv: k.inv, money: k.money, ledger: k.ledger });
    else this.coop.send({ t: 'yours', to: m.from, fresh: true });
  }
  onKeep(m) {
    if (this.coop.role !== 'host' || typeof m.vid !== 'string' || !m.inv || typeof m.inv !== 'object') return;
    const s = this.kept();
    s.by[m.vid] = { name: String(m.name || '').slice(0, 24), inv: m.inv, money: cash(m.money), ledger: Array.isArray(m.ledger) ? m.ledger.slice(-LEDGER_KEPT) : [], at: Date.now() };
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
    if (!e || e.box || e.fixed) return false;
    const taken = inv.take(cId, uid);
    if (!taken) return false;
    const entry = {};
    for (const [k, v] of Object.entries(taken)) if (!ENTRY_SKIP.has(k) && v !== undefined) entry[k] = v && typeof v === 'object' ? JSON.parse(JSON.stringify(v)) : v;
    const d = itemDef(entry.id);
    if (/^sig:/.test(entry.id) && d) entry.def = d; // (a signature item's definition rides with it, as in the save)
    const what = `${entry.qty > 1 ? `${entry.qty} × ` : ''}${d ? d.name : entry.id}`;
    return this.send(to, { entry }, () => { this.land(entry, { back: cId }); }, `You gave ${name} ${what}.`, `${name} didn’t take ${what}. It’s back with you.`);
  }
  send(to, body, refund, okWords, backWords) {
    const gid = newGid(), name = this.nameOf(to);
    const sent = this.coop.send({ t: 'gift', to, gid, ...body });
    if (!sent) { refund(); this.note(`Couldn’t reach ${name}.`); return false; }
    const p = { to, name, ...body, refund, okWords, backWords, timer: null };
    p.timer = setTimeout(() => this.settle(gid, false), ACK_MS);
    this.pending.set(gid, p);
    return true;
  }
  settle(gid, ok) {
    const p = this.pending.get(gid); if (!p) return;
    this.pending.delete(gid); clearTimeout(p.timer);
    if (ok) this.note(p.okWords, 3);
    else { p.refund(); this.note(p.backWords, 4); }
  }
  onAck(m) { if (m.gid) this.settle(m.gid, !!m.ok); }
  dropPending() { for (const gid of [...this.pending.keys()]) this.settle(gid, false); }
  onGift(m) {
    if (this.mute || !m.gid) return;
    const ack = (ok, why = null) => this.coop.send({ t: 'giftack', to: m.from, gid: m.gid, ok, ...(why ? { why } : {}) });
    if (this.got.has(m.gid)) { ack(true); return; }
    if (this.refuse || !this.ready) { ack(false, this.refuse ? 'refused' : 'not ready'); return; }
    const name = this.nameOf(m.from), pr = this.g.profile;
    if (Number.isFinite(m.money)) {
      const n = cash(m.money);
      if (!n || !pr) { ack(false, 'nothing'); return; }
      pr.earn(n, `from ${name}`);
      this.got.add(m.gid); ack(true);
      this.note(`${name} gave you $${n}.`);
      return;
    }
    const e = m.entry;
    if (!e || typeof e.id !== 'string') { ack(false, 'nothing'); return; }
    if (e.def && /^sig:/.test(e.id) && !itemDef(e.id)) { try { defineItem(e.def); } catch { /* unknown */ } }
    const d = itemDef(e.id);
    if (!d || d.kind === 'container' || d.kind === 'long') { ack(false, 'unknown'); return; }
    const where = this.land(e);
    if (!where) { ack(false, 'no room'); return; }
    this.got.add(m.gid); ack(true);
    this.note(`${name} gave you ${e.qty > 1 ? `${e.qty} × ` : ''}${d.name}${where === 'hand' ? ': in your hand' : where === 'ground' ? ': at your feet' : ''}.`);
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
  verbs(ref) {
    if (!ref || !ref.cId || !ref.uid || !this.coop.live) return [];
    const friends = this.near();
    if (!friends.length) return [];
    const inv = this.g.inventory, c = inv.cont(ref.cId), e = c && c.grid.find((q) => q.uid === ref.uid);
    if (!e || e.box || e.fixed) return [];
    const ok = this.ready, reach = typeof inv.isReachable === 'function' ? inv.isReachable(ref.cId) : true;
    return friends.map((f) => ({ label: `Give to ${f.name}`, disabled: !ok || !reach, title: !ok ? 'not yet' : !reach ? 'out of reach' : '', run: () => this.item(f.id, ref) }));
  }

  // --- the dot: E Give money on a friend on foot within reach ----------------------------------------------------------
  targets(ray, near) {
    if (!this.coop.live || !this.coop.remotes.size) return null;
    const p = this.g.player, out = [];
    if (!p || !p.onFoot) return null;
    for (const r of this.coop.remotes.values()) {
      const at = r.drawnAt, P = r.person;
      if (!at || at.m === 'paddle' || !P) continue;
      if (near.flat(P.x, P.z) > GIVE_R) continue;
      const gy = Number.isFinite(P.y) ? P.y : near.y, hit = near.segment(P.x, gy + 0.35, P.z, P.x, gy + 1.58, P.z, 0.42);
      if (!hit) continue;
      const pr = this.g.profile, broke = !pr || pr.money <= 0;
      out.push({ dist: hit.t, miss: hit.miss * 0.9, target: {
        kind: 'person', ref: `coop:${r.id}`, label: r.name,
        e: { verb: 'Give money', why: !this.ready ? 'Not yet' : broke ? 'Your purse is empty' : null, run: () => this.moneyCard(r.id) },
        box: { x: P.x, y: gy + 0.9, z: P.z, hx: 0.3, hy: 0.9, hz: 0.3, heading: P.heading || 0 },
      } });
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
    this.cardOpen = true;
    return talk.open({
      speaker: { key: `coop:${to}`, name, pos: (v) => r.person.headAt(v) },
      name, role: `you have $${have}`,
      start: () => ({ say: have > 0 ? 'How much?' : 'Your purse is empty.', plain: true, by: `Give ${name} money`, choices }), // (plain: the game's line, not the friend's: no speech marks, not remembered as said)
      bye: () => null,
    });
  }

  stats() {
    const pr = this.g.profile;
    return { mine: this.mine, money: pr ? pr.money : null, pending: this.pending.size, ready: this.ready, log: this.log.slice(-6) };
  }
}
