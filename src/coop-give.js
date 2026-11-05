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
//   - Giving a thing (the owner, 2026-11-01: "i dont like the give item to person. id rather just have them drop on
//     ground"): no verb of its own. Drop it or set the pack down; the friend sees it and picks it up (coop-share.js).
//   - Never twice, never lost: a gift has an id. The receiver remembers every id it answered this session (applied or
//     refused) and answers a repeat the same way. A sender with no answer in ACK_MS asks (giftq) every ACK_MS; it takes
//     the thing back only when the receiver says it never had it (and so will refuse it if it comes late), or the
//     friend has left the room (or we have).
//   - A guest's things kept by the host: the guest sends { inv, money, ledger } every KEEP_EVERY and as they leave (and
//     on pagehide); the host keeps it in its own season's save (`coop-guests`, by the visitor's id, coop.js visitor.id).
//     A guest coming in asks for theirs (claim) and gets it back (yours), or { fresh } on a first visit: the new
//     player's starting kit, whatever the host owns (the owner's call 2026-11-05: onboarding.js guestKit: the starter
//     things, a Duluth pack, the A-frame tent, the pot, a stove and a canister, three days of food; the plain things for
//     Walt's, which are the host's story) and START_MONEY. A rejoin gets back what they had (the host kept it). Nothing a
//     guest has is sent to the host before that answer, so their own season's things never reach the host.
//
// The wire (coop.on / coop.send, through the relay; `to` a peer's id, `from` added by the relay):
//   claim    guest → host  { vid, name }                       (again every CLAIM_EVERY until the answer)
//   yours    host → guest  { inv, money, ledger } | { fresh: true }
//   keep     guest → host  { vid, name, inv, money, ledger }
//   gift     any → one     { gid, money }
//   giftq    sender → one  { gid }                          (no answer yet: did you get it?)
//   giftack  back          { gid, ok, why? }                 (why 'never': not applied, and now refused if it comes)
//   The host keeps at most KEEP_MAX visitors, and forgets one not seen for KEEP_DAYS real days (Date.now, not the game's
//   clock: a Sandbox host can stop or run its clock as it likes).
//
//   const give = new CoopGive(coop, { pointer, talk })   (main.js, after the coop)
//   give.money(peerId, n) → bool · give.moneyCard(peerId) · give.mine · give.stats() · give.prune(doc)
//   give.refuse / give.mute / give.dropAcks = n   (the tests: refuse every gift / lose gifts on the way / lose the next n acks)
import { save } from './save.js';
import { START_MONEY } from './profile.js';
import { lookOf } from './coop.js';
import { SERIF, INK } from './map-render.js';
import { guestKit, onboarding } from './onboarding.js';

export const GIVE_R = 3;          // m: a friend this near can be given to, both on foot
export const AFLOAT_R = 6;        // m: and when either of you is in a canoe (alongside)
const ACK_MS = 3000;              // no answer to a gift in this long: ask again (giftq), every this long
const KEEP_DAYS = 30;             // real days: a visitor not seen this long is forgotten by the host
const KEEP_MAX = 16;              // visitors the host keeps, the most recently seen
const KEEP_EVERY = 30000;         // ms between a guest's keeps
const CLAIM_EVERY = 3000;         // ms between a guest's claims until the host answers
const NS = 'coop-guests';         // the host's save of its guests' things
const AMOUNTS = [5, 10, 20];
const LEDGER_KEPT = 40;
const newGid = () => `${Date.now().toString(36)}${Math.floor(Math.random() * 1e9).toString(36)}`;
const cash = (n) => Math.max(0, Math.round(Number(n) || 0));

export class CoopGive {
  constructor(coop, { pointer = null, talk = null } = {}) {
    this.coop = coop; this.pointer = pointer; this.talk = talk;
    this.pending = new Map();   // gid → { to, name, money, refund, timer, asks }
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
    // the friends on the map (the owner, 2026-11-01: "i cant see the other players on the map and i should"): the HUD's map
    // (the glance, the corner and the sheet in the book) draws them with you, each frame it is open (hud.js mapMarks)
    const hud = coop.g.hud;
    if (hud) (hud.mapMarks || (hud.mapMarks = [])).push((ctx, v) => this.drawFriends(ctx, v));
    if (pointer) { pointer.register((ray, near) => this.targets(ray, near, false)); if (pointer.registerWater) pointer.registerWater((ray, near) => this.targets(ray, near, true)); }
  }
  get g() { return this.coop.g; }
  get myName() { return this.coop.visitor.name || 'A friend'; }
  get ready() { return this.coop.live && (this.coop.role !== 'guest' || this.mine); }
  host() { return this.coop.peers().find((p) => p.host) || null; }
  nameOf(id) { const r = this.coop.remotes.get(id); return r ? r.name : 'a friend'; }
  note(text, s = 4) { const hud = this.g.hud; if (hud && hud.note) hud.note(text, s); this.log.push(text); if (this.log.length > 20) this.log.shift(); }
  // GIVE_R both on foot, AFLOAT_R when either is in a canoe
  afloat(r) { const p = this.g.player, at = r && r.drawnAt; return !!((p && p.mode === 'paddle') || (at && at.m === 'paddle')); }

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
    if (k && k.inv) this.coop.send({ t: 'yours', to: m.from, inv: k.inv, money: k.money, ledger: k.ledger, ...(k.pos ? { pos: k.pos } : null) }); // (round 3: where they stood and their canoe lay)
    else this.coop.send({ t: 'yours', to: m.from, fresh: true });
  }
  onKeep(m) {
    if (this.coop.role !== 'host' || typeof m.vid !== 'string' || !m.inv || typeof m.inv !== 'object') return;
    const s = this.kept();
    s.by[m.vid] = { name: String(m.name || '').slice(0, 24), inv: m.inv, money: cash(m.money), ledger: Array.isArray(m.ledger) ? m.ledger.slice(-LEDGER_KEPT) : [], at: Date.now(), ...(m.pos && typeof m.pos === 'object' ? { pos: m.pos } : null) };
    this.prune(s);
    save.write(NS, s);
  }
  // a guest: what the host kept (or a first visit's kit), in memory only (kv is frozen while visiting)
  onYours(m) {
    if (this.coop.role !== 'guest' || this.mine) return;
    const inv = this.g.inventory, pr = this.g.profile;
    if (!inv || !pr) return;
    let money = START_MONEY, ledger = [{ n: START_MONEY, why: `to start the visit to ${this.coop.hostName || 'a friend'}` }];
    onboarding.skip(); // (never the home counter's scene on a visit)
    if (m.fresh || !m.inv) guestKit(inv);
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
    if (m.pos && this.coop.boat) this.coop.boat.restoreWhere(m.pos); // (round 3, coop-boat.js: back where they stood, by the canoe they had)
    this.mine = true; this.keepT = performance.now();
    this.sendKeep(); // (a first visit: the host has the kit from now on)
  }
  sendKeep() {
    if (this.coop.role !== 'guest' || !this.mine) return false;
    const h = this.host(), inv = this.g.inventory, pr = this.g.profile;
    if (!h || !inv || !pr) return false;
    return this.coop.send({ t: 'keep', to: h.id, vid: this.coop.visitor.id, name: this.myName, inv: inv.serialize(), money: pr.money, ledger: (pr.ledger || []).slice(-LEDGER_KEPT), ...(this.coop.boat ? { pos: this.coop.boat.where() } : null) });
  }

  // --- giving money ----------------------------------------------------------------------------------------------------
  money(to, n) {
    const pr = this.g.profile, name = this.nameOf(to);
    n = cash(n);
    if (!this.ready || !pr || !n || !pr.canAfford(n)) return false;
    if (!pr.spend(n, `to ${name}`)) return false;
    return this.send(to, { money: n }, () => { pr.earn(n, `back: ${name} didn’t take it`); }, `You gave ${name} $${n}.`, `${name} didn’t take the $${n}. It’s back in your purse.`);
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
    const n = cash(m.money), pr = this.g.profile;
    if (!n || !pr) { this.ack(m, false, 'nothing'); return; }
    const name = this.nameOf(m.from);
    pr.earn(n, `from ${name}`);
    this.ack(m, true);
    this.note(`${name} gave you $${n}.`);
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

  // --- the friends on the map ------------------------------------------------------------------------------------------
  // a dot in their shirt's colour with a heading tick (as yours on foot by a beached canoe), their name beside it in ink
  drawFriends(ctx, { toPx, inView, k }) {
    const out = [];
    if (!this.coop.live) { this.mapDrawn = out; return; }
    for (const r of this.coop.remotes.values()) {
      const at = r.drawnAt; if (!at) continue;
      const onBoat = r.boat && r.boat.ext && at.m === 'paddle', x = onBoat ? r.boat.x : r.person.x, z = onBoat ? r.boat.z : r.person.z;
      if (!Number.isFinite(x) || !inView(x, z)) continue;
      if (!r.mapColour) { let c = 0x2f6fa8; try { c = lookOf(r.lookRaw).shirt; } catch { /* the default */ } r.mapColour = `#${(c >>> 0).toString(16).padStart(6, '0')}`; }
      const [a, b] = toPx(x, z), h = Number.isFinite(at.h) ? at.h : 0;
      ctx.save(); ctx.translate(a, b); ctx.rotate(-h + Math.PI / 2); ctx.scale(k, k);
      ctx.fillStyle = r.mapColour; ctx.strokeStyle = '#3b2a1a'; ctx.lineWidth = 1.6; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(0, -10); ctx.lineTo(0, -4); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, 4.5, 0, 6.2832); ctx.fill(); ctx.stroke();
      ctx.restore();
      ctx.save();
      ctx.font = `600 ${13 * k}px ${SERIF}`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
      ctx.lineWidth = 3.5 * k; ctx.strokeStyle = 'rgba(236, 228, 207, 0.92)'; ctx.strokeText(r.name, a + 9 * k, b);
      ctx.fillStyle = INK.ink; ctx.fillText(r.name, a + 9 * k, b);
      ctx.restore();
      out.push({ id: r.id, name: r.name, x, z, a, b, colour: r.mapColour });
    }
    this.mapDrawn = out; this.mapAt = performance.now();
  }

  stats() {
    const pr = this.g.profile;
    return { mine: this.mine, money: pr ? pr.money : null, pending: this.pending.size, answered: this.answered.size, ready: this.ready, log: this.log.slice(-6) };
  }
}
