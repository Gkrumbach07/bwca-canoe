// Co-op phase 3, round 3 (docs/plans/coop.md, "Phase 3 round 3: two canoes, either one"): either player can take either
// canoe. The owner: "You can't get into, paddle or carry a friend's canoe yet (canoes are shared items)", and before it:
// "There's nothing like mine and yours, except if it's on my body ... It's not my canoe or your canoe. It's just two
// canoes."
//
// The model. Each browser drives exactly one canoe, as the game always has (player.js: the hull under you, overhead,
// set down at carry.drop, or capsized at swim.hull; canoe.js draws it; its load is the inventory's where 'canoe'). A
// friend's canoe lying there (beached, set down, tied at a dock, floating capsized) has the same verbs on the dot as our
// own: E Get in, a held E Push it off, Q Shoulder it ("Unload it first" while loaded), and, swimming, Right it / Climb
// in. Doing one is a swap, asked of that canoe's browser, like coop-share's takebox: our own canoe, where it lies, with
// its load and its long things, goes to them, theirs comes to us at exactly its spot with its load, and the verb goes on
// as on our own. So every screen still has two canoes, each driven by one browser, and nothing says whose. A canoe a
// friend is paddling or carrying is on their body: it is not offered, and an asking that crosses a push-off is refused.
//
// The wire (coop.on / coop.send; `to` routes, the relay sets `from`):
//   boat   asker → owner  { rid, verb, at: { x, z } (the hull as the asker saw it), mine: hull }
//   boatr  owner → asker  { rid, ok, cn: hull (theirs, given up) | why }
//   hull   { k: 'drop' (set down, beached, tied, afloat at a berth) | 'over' (capsized), x, z, heading,
//            load: [container trees (coop-share's takebox shape)], long: [{ id }] (paddles, rods riding in it) }
// The owner refuses while its player is in it or under it (paddle, carry), mid push-off, fetching or teleporting, or
// when its canoe is no longer where the asker saw it. The asker shows the verb pending ("a moment") until the answer;
// no answer in TIMEOUT and nothing moved here (a late yes still lands: the hull left its owner). For a moment after a
// swap the friend's last pose still has their old hull where ours now lies: it is not drawn there (holds).
//
// Saves: each browser's save keeps the canoe it now drives (the host's own season save; a guest's `keep` at the host,
// coop-give.js, now with where the guest stands and their canoe lies: `pos`, restored after a reload's Rejoin).
//
//   const boat = new CoopBoat(coop)   (main.js, after CoopShare); coop.boat; boat.stats(); boat.take(peerId, verb)
import { itemDef } from './items.js';
import { onboarding } from './onboarding.js'; // r3 replay: no canoe before the loan
import { HULL_REACH } from './inventory.js';
import { refresh as uiRefresh, note as uiNote } from './inv-ui.js';
import { hold } from './hold.js';

const TIMEOUT = 3000;          // ms: an asking with no answer is dropped (nothing of ours moved)
const HOLD_MS = 3000;          // ms: after a swap, a friend's hull drawn within HOLD_R of ours is not drawn
const HOLD_R = 1.5;
const SWIM_R = { over: 2.4, drop: 3.4 }; // m: as player.js's own swim prompts
const r2 = (v) => Math.round(v * 100) / 100, r3 = (v) => Math.round(v * 1000) / 1000;
const cap = (s) => String(s || '').replace(/^./, (c) => c.toUpperCase());

// a container and what nests in it, as a tree (coop-share giveBox's shape), without taking it out
function treeOf(inv, k, depth = 0) {
  return { item: k.item, grid: k.grid.map((e) => {
    if (e.box) { const kid = inv.cont(e.uid); return kid && depth < 6 ? { x: e.x, y: e.y, rot: e.rot ? 1 : 0, kid: treeOf(inv, kid, depth + 1) } : null; }
    return { id: e.id, qty: e.qty, x: e.x, y: e.y, rot: e.rot ? 1 : 0, ...(e.data ? { data: e.data } : {}), ...(e.fixed ? { fixed: true } : {}) };
  }).filter(Boolean) };
}

export class CoopBoat {
  constructor(coop) {
    this.coop = coop; coop.boat = this;
    this.pending = null; this.expired = new Map(); this.rid = 1;
    this.holds = new Map();   // peer id → { x, z, until }: their drawn hull on our canoe's spot, after a swap
    this.last = new Map();    // peer id → their hull as last seen (an asking can go on what we saw)
    this.n = { asked: 0, granted: 0, refused: 0, gave: 0, said: 0, timeouts: 0, late: 0, restored: 0 };
    this.log = [];
    coop.on('boat', (m) => this.gotAsk(m));
    coop.on('boatr', (m) => this.gotAnswer(m));
    coop.onPeers((what, peer) => {
      if (what === 'gone' || (what === 'leave' && peer && this.pending && this.pending.to === peer.id)) this.expire('gone');
      if (what === 'leave' && peer) { this.holds.delete(peer.id); this.last.delete(peer.id); }
    });
    coop.tick((now) => this.tick(now));
    coop.drawFns.add((r, s) => this.drawn(r, s));
    this.hookSwim();
    this.hookPointer();
  }
  get g() { return this.coop.g; }
  get share() { return (typeof window !== 'undefined' && window.__game && window.__game.coopShare) || null; }
  say(text, s = 3) { uiNote(text, s); this.log.push(text); if (this.log.length > 20) this.log.shift(); }
  hookPointer() {
    const pt = typeof window !== 'undefined' && window.__game && window.__game.pointer;
    if (pt && typeof pt.register === 'function' && !this.offPointer) this.offPointer = pt.register((ray, near) => this.targets(ray, near));
    return !!this.offPointer;
  }
  // swimming (no dot in the water): the prompt and E beside a friend's hull, after player.js's own (which E goes to first)
  hookSwim() {
    const p = this.g.player;
    if (!p || p.coopBoatSwim) return;
    p.coopBoatSwim = true;
    const own = p.updateSwim.bind(p);
    p.updateSwim = (dt) => { own(dt); try { this.swimFrame(); } catch (e) { if (!this.warnedS) { this.warnedS = true; console.warn('coop-boat swim', e); } } };
  }

  // --- the two canoes ----------------------------------------------------------------------------------------------------
  // a friend's canoe lying there (not under them nor on their shoulders): { x, z, heading, over }, or null
  hullOf(f) {
    const cn = f && f.pub && f.pub.cn;
    if (!cn || !Number.isFinite(cn.x)) return null;
    const r = this.coop.remotes.get(f.id), s = r && r.seen;
    if (s && (s.m === 'paddle' || s.m === 'carry')) return null;
    if (this.held(f.id, cn.x, cn.z)) return null;
    const out = { x: cn.x, z: cn.z, heading: cn.heading || 0, over: !!(s && s.m === 'swim' && s.ov && Array.isArray(s.d) && Math.hypot(s.d[0] - cn.x, s.d[1] - cn.z) < 3) };
    this.last.set(f.id, out);
    return out;
  }
  held(id, x, z) { const h = this.holds.get(id); return !!(h && performance.now() < h.until && Math.hypot(x - h.x, z - h.z) < HOLD_R); }
  holdOn(id, at) { if (at && Number.isFinite(at.x)) this.holds.set(id, { x: at.x, z: at.z, until: performance.now() + HOLD_MS }); }
  // our own canoe as a hull record (take: its load and long things out of our inventory too); null when it is under us,
  // on our shoulders, or nowhere. → { rec, ids }
  describe(take = false) {
    const g = this.g, p = g.player, inv = g.inventory;
    if (!p || !inv) return null;
    const over = p.mode === 'swim' && p.swim && p.swim.hull, d = !onboarding.noCanoe && p.carry && p.carry.drop; // (r3 replay: none before the loan)
    let rec;
    if (over && Number.isFinite(over.cx)) rec = { k: 'over', x: r2(over.cx), z: r2(over.cz), heading: r3(over.heading || 0) };
    else if (d && Number.isFinite(d.x) && (p.mode === 'walk' || p.mode === 'swim')) rec = { k: 'drop', x: r2(d.x), z: r2(d.z), heading: r3(d.heading || 0) };
    else return null;
    const roots = inv.containers.filter((c) => c.where === 'canoe'), longs = inv.long.filter((l) => l.where === 'canoe');
    rec.load = roots.map((c) => treeOf(inv, c));
    rec.long = longs.map((l) => ({ id: l.id }));
    const ids = { c: roots.map((c) => c.id), l: longs.map((l) => l.uid) };
    if (take) this.strip(ids);
    return { rec, ids };
  }
  // the load of our canoe (as described) out of our inventory: the containers, what nests in them, the long things
  strip(ids) {
    const inv = this.g.inventory, gone = new Set();
    const mark = (k) => { gone.add(k.id); for (const e of k.grid) if (e.box) { const kid = inv.cont(e.uid); if (kid && !gone.has(kid.id)) mark(kid); } };
    for (const id of ids.c) { const k = inv.cont(id); if (k && k.where === 'canoe') mark(k); }
    inv.containers = inv.containers.filter((k) => !gone.has(k.id));
    const lg = new Set(ids.l);
    inv.long = inv.long.filter((l) => !(lg.has(l.uid) && l.where === 'canoe'));
  }
  // a hull record made our canoe: its load into our inventory where 'canoe', the hull where it lies (set down, or capsized
  // beside us while we swim)
  adopt(rec) {
    const g = this.g, p = g.player, inv = g.inventory, c = g.canoe, st = c.state;
    const make = (t, host) => {
      const k = inv.addContainer(t.item, host ? 'in' : 'canoe', null, { quiet: true });
      if (!k) return null;
      if (host) { k.in = host.id; k.hand = null; }
      for (const e of t.grid || []) {
        if (e.kid) { const kid = make(e.kid, k); if (kid) k.grid.push({ uid: kid.id, id: kid.item, x: e.x, y: e.y, rot: e.rot ? 1 : 0, qty: 1, box: true }); continue; }
        if (!itemDef(e.id)) continue;
        k.grid.push({ uid: inv.uid(), id: e.id, qty: Math.max(1, e.qty | 0), x: e.x, y: e.y, rot: e.rot ? 1 : 0, ...(e.data ? { data: e.data } : {}), ...(e.fixed ? { fixed: true } : {}) });
      }
      return k;
    };
    for (const t of rec.load || []) if (t && itemDef(t.item)) make(t, null);
    for (const l of rec.long || []) if (l && itemDef(l.id)) inv.addLong(l.id, 'canoe', null, { quiet: true });
    if (typeof inv.refreshUse === 'function') inv.refreshUse();
    const h = Number.isFinite(rec.heading) ? rec.heading : 0;
    if (rec.k === 'over') {
      // capsized beside us: we were swimming from the shore (our own canoe left there went to them)
      p.carry = null; p.swim = { hull: { cx: rec.x, cz: rec.z, heading: h }, t: p.swim ? p.swim.t : 0 }; p.restAt = null;
      c.pickUpHull(); st.swimHull = true; st.swimHeading = p.heading;
    } else {
      const drop = { x: rec.x, z: rec.z, heading: h };
      if (p.carry) { p.carry.drop = drop; p.carry.choice = false; } else p.carry = { trail: null, drop, hitCooldown: 0, from: null, choice: false };
      if (p.mode === 'swim' && p.swim) { p.swim.hull = null; st.swimHull = false; }
      p.restHull(drop.x, drop.z, drop.heading);
    }
    if (g.packs) g.packs._plan = null;
    inv.emit('containers'); inv.emit('long'); inv.emit('load');
  }
  // after a swap: our pub before anything else (the friend's book never shows the load in two canoes), a guest's keep
  after() {
    const s = this.share;
    if (s) s.pubSoon();
    const give = window.__game && window.__game.coopGive;
    if (give && this.coop.role === 'guest' && typeof give.sendKeep === 'function') give.sendKeep();
    uiRefresh();
  }

  // --- asking ------------------------------------------------------------------------------------------------------------
  // why we cannot swap now, or null
  cannot() {
    const g = this.g, p = g.player, pk = g.packs;
    if (!this.coop.live) return 'Not now: the connection is down.';
    if (this.pending) return 'A moment.';
    if (!p || p.teleporting || (pk && (pk.busy || pk.push)) || hold.active) return 'A moment.';
    const d = p.carry && p.carry.drop;
    if (!(d && (p.mode === 'walk' || (p.mode === 'swim' && p.swim && !p.swim.hull)))) return 'Not from here.';
    return null;
  }
  // ask a friend's browser for their canoe (the verb then goes on as on our own). peer: their id; verb: the dot's word
  take(peer, verb, o = {}) {
    const share = this.share, f = share && share.friends.get(peer);
    const why = this.cannot();
    if (why || !f) { this.say(why || 'It isn’t there any more.'); return false; }
    const s = this.hullOf(f) || this.last.get(peer);
    if (!s) { this.say('It isn’t there any more.'); return false; }
    const mine = this.describe(false);
    if (!mine) { this.say('Not from here.'); return false; }
    const rid = `${this.coop.id}:b${this.rid++}`;
    if (!this.coop.send({ t: 'boat', to: peer, rid, verb, at: { x: r2(s.x), z: r2(s.z) }, mine: mine.rec })) { this.say('Not now: the connection is down.'); return false; }
    this.pending = { rid, to: peer, verb, o: { key: o.key || 'KeyE', keys: o.keys || [o.key || 'KeyE', 'Mouse0'] }, gave: mine.ids, t0: performance.now(), at: s };
    this.n.asked++;
    return true;
  }
  // the owner's side: refused, or ours given up and theirs made ours
  gotAsk(m) {
    const reply = (r) => this.coop.send({ t: 'boatr', to: m.from, rid: m.rid, ...r });
    const why = this.refusal(m);
    if (why) { this.n.refused++; return reply({ ok: false, why }); }
    const mine = this.describe(true);
    if (!mine) return reply({ ok: false, why: 'It isn’t there any more.' });
    this.adopt(m.mine);
    this.holdOn(m.from, m.mine);
    this.n.gave++;
    this.after();
    reply({ ok: true, cn: mine.rec });
  }
  refusal(m) {
    const g = this.g, p = g.player, pk = g.packs, h = m.mine;
    if (!h || h.k !== 'drop' || !Number.isFinite(h.x) || !Number.isFinite(h.z)) return 'Not that.';
    if (!p) return 'Not now.';
    if (p.mode === 'paddle') return 'Someone is in that canoe.';
    if (p.mode === 'carry') return 'That canoe is on someone’s shoulders.';
    if (p.teleporting || (pk && (pk.busy || pk.push)) || hold.is('pushOff')) return 'That canoe is on the move.';
    if (this.pending) return 'A moment: try again.';
    const over = p.mode === 'swim' && p.swim && p.swim.hull, d = p.carry && p.carry.drop;
    const at = over ? { x: over.cx, z: over.cz } : d;
    if (!at || !Number.isFinite(at.x)) return 'It isn’t there any more.';
    if (m.at && Math.hypot(at.x - m.at.x, at.z - m.at.z) > 4) return 'It isn’t there any more.';
    return null;
  }
  gotAnswer(m) {
    const q = this.pending;
    if (!q || q.rid !== m.rid) { this.late(m); return; }
    this.pending = null;
    if (!m.ok || !m.cn) { this.n.refused++; this.say(m.why || 'Not now.'); uiRefresh(); return; }
    this.land(q, m.cn);
    this.go(q);
  }
  // theirs made ours: our canoe's load out (the hull itself went with their adopt), theirs in, the hull where it lay
  land(q, cn) {
    this.strip(q.gave);
    this.adopt(cn);
    this.holdOn(q.to, cn);
    this.n.granted++;
    this.after();
  }
  // the verb goes on, as on our own canoe (packs.js hullAction; swimming, player.js's own)
  go(q) {
    const g = this.g, p = g.player, pk = g.packs;
    if (p.mode === 'swim') {
      const ok = p.swim && p.swim.hull ? p.rightHull() : p.swimIn();
      if (!ok) this.say('The canoe lies too far up the bank — wade ashore and launch it');
      return;
    }
    const a = pk && pk.hullAction ? pk.hullAction() : null;
    const v = a ? [a.e, a.q].find((x) => x && x.verb === q.verb) : null;
    if (!v) return;
    if (v.why) { this.say(`${cap(v.why).replace(/[.:]\s*$/, '')}.`); if (typeof v.help === 'function') { try { v.help({ key: q.o.key, from: 'boat' }); } catch (e) { console.warn('coop-boat help', e); } } return; }
    try { v.run({ key: q.o.key, keys: q.o.keys, from: 'boat' }); } catch (e) { console.warn('coop-boat verb', e); }
  }
  // no answer: nothing of ours moved. A yes after that lands all the same (the hull left its owner), while we can take it
  expire(why) {
    const q = this.pending;
    if (!q) return;
    this.pending = null;
    this.n.timeouts++;
    this.expired.set(q.rid, q);
    this.say(why === 'gone' ? 'They have gone.' : 'No answer: try again.');
    uiRefresh();
  }
  late(m) {
    const q = this.expired.get(m.rid);
    if (!q) return;
    this.expired.delete(m.rid);
    if (!m.ok || !m.cn) return;
    this.n.late++;
    if (!this.describe(false)) { console.warn('coop-boat: a late yes with our canoe under us'); return; } // (rare: we left in ours meanwhile)
    this.land(q, m.cn);
  }

  // --- every frame ---------------------------------------------------------------------------------------------------------
  tick(now) {
    if (!this.offPointer) this.hookPointer();
    if (this.pending && now - this.pending.t0 > TIMEOUT) this.expire('timeout');
    for (const [id, h] of this.holds) if (now > h.until) this.holds.delete(id);
  }
  // coop.js drawFns, after a friend is placed: their hull still drawn on our canoe's spot (their pose from before the swap)
  drawn(r, s) {
    const h = this.holds.get(r.id), B = r.boat;
    if (!h || !B || B.hidden || s.m === 'paddle' || s.m === 'carry') return;
    if (performance.now() < h.until && Math.hypot(B.x - h.x, B.z - h.z) < HOLD_R) B.hide();
  }

  // --- the dot on a friend's canoe: our own canoe's verbs (packs.js hullAction), each asking for it first --------------------
  // what rides in it that stops the shoulder (all but the lashed: the stringer; with the dilly bobs, paddles and rods)
  loaded(f) {
    const pk = this.g.packs, dilly = !!(pk && pk.dilly);
    const roots = f.mirror.containers.filter((c) => c.where === 'canoe' && c.item !== 'stringer');
    const longs = f.mirror.long.filter((l) => l.where === 'canoe' && !(dilly && /^(paddle|rod)$/.test(String((itemDef(l.id) || {}).long))));
    return { roots, longs, n: roots.length + longs.length };
  }
  verbs(f, s) {
    const g = this.g, pk = g.packs, inv = g.inventory, d = { x: s.x, z: s.z, heading: s.heading };
    const q = this.pending;
    if (q && q.to === f.id) return { e: { verb: q.verb, why: 'a moment', run: () => {} }, q: null, label: 'the canoe' };
    const ask = (verb, held = false) => ({ verb, held, run: (o) => this.take(f.id, verb, o || {}) });
    const L = pk.dropLaunch(d), lake = L ? g.world.lakeName(L.lake) || 'the water' : null;
    const ld = this.loaded(f), nb = window.__game && window.__game.nearby;
    let shoulder = ask('Shoulder it');
    if (ld.n) {
      const first = ld.roots.find((c) => this.share.near(f, c)) || ld.roots[0];
      const names = [...ld.roots.map((c) => (itemDef(c.item) || {}).name || 'a pack'), ...ld.longs.map((l) => (itemDef(l.id) || {}).name || 'a long thing')];
      shoulder = { verb: 'Shoulder it', why: 'Unload it first', needs: names.map((n) => ({ label: `The ${String(n).toLowerCase()} out of it`, done: false })), next: 'Unload it: drag each thing out of it onto The ground or onto you, in the book.', help: () => { if (first && nb && typeof nb.openHere === 'function') nb.openHere(first.id); }, run: () => {} };
    } else {
      const h = inv.hands, gear = g.player.gear;
      if (h[0] && h[1] && !(gear && gear.yokeFree)) shoulder = { verb: 'Shoulder it', why: 'A hand for the gunwale', needs: [{ label: 'One hand free to steady the canoe', done: false }], next: `Put down or away one of ${inv.handsWords() || 'what you hold'}.`, run: () => {} };
    }
    const frozen = !!(g.day && g.day.season && g.day.season.ice > 0.5);
    if (!L || !L.deep || frozen) return { e: shoulder, q: null, label: 'the canoe', hint: L && frozen ? `${lake} is frozen over` : L ? 'too shallow to launch here' : null };
    if (pk.afloat(d)) return { e: ask('Get in'), q: shoulder, label: `the canoe, afloat on ${lake}` };
    const plan = pk.pushPlan(d), head = pk.atTrailHead(d);
    const push = plan ? ask('Push it off', true)
      : { verb: 'Push it off', held: true, why: 'Too shallow to float it here', needs: [{ label: 'A hand’s depth of water under both ends', done: false }], next: `Shoulder it (${head ? 'E' : 'Q'}) and carry it along the shore to deeper water`, run: () => {} };
    const label = typeof pk.beachedWords === 'function' ? pk.beachedWords(d) : 'the canoe, beached';
    if (head) return { e: shoulder, q: push, label };
    return { e: push, q: shoulder, label };
  }
  // pointer.js provider: a friend's canoe lying within reach, as our own is offered (nearby.js), on foot
  targets(ray, near) {
    const out = [], g = this.g, p = g.player, share = this.share, inv = g.inventory;
    if (!this.coop.live || !share || !share.friends.size || !p || p.mode !== 'walk' || !g.packs || !inv) return out;
    for (const f of share.friends.values()) {
      const s = this.hullOf(f);
      if (!s || s.over || near.flat(s.x, s.z) > near.reach + 2.4) continue;
      if (inv.hullDist(s, p.x, p.z) > HULL_REACH) continue;
      const R = this.coop.remotes.get(f.id), B = R && R.boat;
      let y = p.groundAt(s.x, s.z);
      if (B && !B.hidden && B.root) { B.root.updateMatrixWorld(); y = B.root.matrixWorld.elements[13]; }
      const box = { x: s.x, y: y + 0.35, z: s.z, hx: 2.45, hy: 0.5, hz: 0.46, heading: s.heading };
      const hit = near.box(box);
      if (!hit) continue;
      const a = this.verbs(f, s);
      out.push({ dist: hit.t, miss: hit.miss, target: { kind: 'canoe', ref: `canoe:${f.id}`, label: a.label, e: a.e, q: a.q || null, hint: a.hint || null, box } });
    }
    return out;
  }
  // in the water from the shore (our own canoe not within reach): a friend's hull, capsized or lying by the water
  swimFrame() {
    const g = this.g, p = g.player, share = this.share;
    if (!this.coop.live || !share || p.mode !== 'swim' || !p.swim || p.swim.hull) return;
    const own = p.carry && p.carry.drop;
    if (own && Math.hypot(own.x - p.x, own.z - p.z) < SWIM_R.drop) return; // (our own first: player.js has it)
    let best = null;
    for (const f of share.friends.values()) {
      const s = this.hullOf(f);
      if (!s) continue;
      const dd = Math.hypot(s.x - p.x, s.z - p.z);
      if (dd < (s.over ? SWIM_R.over : SWIM_R.drop) && (!best || dd < best.dd)) best = { f, s, dd };
    }
    if (!best) return;
    if (this.pending) { p.prompt = { key: null, text: 'A moment…' }; return; }
    const floats = !best.s.over && g.packs && g.packs.afloat(best.s);
    const verb = best.s.over ? 'Right the canoe and climb in' : floats ? 'Climb into the canoe' : 'Push the canoe off and climb in';
    p.prompt = { key: 'E', text: verb };
    if (p.input.pressed('KeyE')) this.take(best.f.id, verb);
  }

  // --- a guest's place, kept by the host with its things (coop-give.js keep) -------------------------------------------
  // where we stand and where our canoe lies: { m, x, z, h, d: { x, z, heading } | null }
  where() {
    const p = this.g.player;
    if (!p || !Number.isFinite(p.x) || p.teleporting) return null; // (mid-teleport p.x is still where we came from: a join's first keep would store our own season's spot)
    const d = p.carry && p.carry.drop, over = p.mode === 'swim' && p.swim && p.swim.hull;
    return { m: p.mode, x: r2(p.x), z: r2(p.z), h: r3(p.heading || 0), d: d && Number.isFinite(d.x) ? { x: r2(d.x), z: r2(d.z), heading: r3(d.heading || 0) } : null, ...(over ? { ov: 1 } : null) };
  }
  // back there after a reload: on foot by the canoe where it lies (player.standAt), else afloat in it nearby
  async restoreWhere(at) {
    const g = this.g, p = g.player, w = g.world;
    if (!at || !Number.isFinite(at.x) || !Number.isFinite(at.z) || !p) return false;
    const x0 = p.x, z0 = p.z;
    try {
      if (w.tiles) await w.tiles.ensure(at.x, at.z, 60);
      // the tiles there can take a while: if we were placed or walked off meanwhile, that wins (no jump back across the map)
      if (p.teleporting || Math.hypot(p.x - x0, p.z - z0) > 2) return false;
      let d = at.d && Number.isFinite(at.d.x) ? at.d : null;
      if (!d && at.m === 'carry') d = { x: at.x + Math.cos(at.h || 0) * 1.4, z: at.z - Math.sin(at.h || 0) * 1.4, heading: at.h || 0 };
      if (d && at.m !== 'paddle' && !at.ov && p.standAt({ x: at.x, z: at.z, heading: at.h || 0, drop: d })) {
        if (p.chase && p.chase.snap) p.chase.snap();
        this.n.restored++;
        return true;
      }
      const ok = await p.teleport(at.x, at.z);
      if (ok) this.n.restored++;
      return ok;
    } catch (e) { console.warn('coop-boat restore', e); return false; }
  }

  stats() {
    return { pending: this.pending ? { to: this.pending.to, verb: this.pending.verb } : null, holds: this.holds.size, log: this.log.slice(-6), ...this.n };
  }
}
