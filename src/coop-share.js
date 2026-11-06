// Co-op phase 2, stream A (docs/plans/coop.md, "Phase 2 as designed"): the shared world things. Each thing belongs to
// whoever put it there, and its owner's browser is its authority; everyone sees everyone's things; reaching into a
// friend's thing is a request to its owner. Nothing here runs unless coop.live: single player is untouched.
//
//   pub   each browser's public world, whole, on a change (at most PUB_HZ), and to a newcomer on join:
//         { t: 'pub', c: [containers not on the body: ground, hung, tent, canoe, and what nests in those],
//           l: [long things on the ground, in the tent or the canoe], tent: camp.serialize(), tarps: tarp.serialize(),
//           fires: [fires.record(key) for each ring whose fuel bin is ours], cn: the beached canoe { x, z, heading } }
//         Kept per friend with every id prefixed `p<peer>:` so nothing collides; never in inventory.containers, the
//         saves, the weight or reach. Drawn by a FriendView (a ContainerView of their ground things), a TentStages from
//         camp's pool, tarp.others and fires.restoreRecord.
//   took  what this browser has added to chores.s.taken / chores.s.sawn / forage.s.picked since it last said:
//         { tk: { piece: day }, sw: { log: { day, cuts, poles } }, pk: { patch: [day, n] } }. Merged grow-only.
//   op    a request to a thing's owner (m.to): { rid, op: 'take', cId, uid, qty } | { rid, op: 'put', cId, item: { id, qty, data } }
//         | { rid, op: 'takebox', cId } (the whole container, what nests in it too) | { rid, op: 'douse', key, stage }
//   opr   the owner's answer (m.to the asker): { rid, ok, entry: { id, qty, data, rot }, tree (takebox), why }
//
// Phase 3 round 2, shared ground (the owner: "if it's on the ground in any container at all, it's shared and not just
// theirs ... It's not my canoe or your canoe. It's just two canoes"): the owner stays the authority underneath, but the
// player never reads "mine" or "yours". A friend's things are named as the book names our own ("Duluth pack · in the
// other canoe", "the pack", "Fire ring"); their canoe beached, set down, at a dock or capsized is reached as ours is
// (beside it, or from the outfitter's yard while it is tied at that dock), its hull on the dot ("E Look in it"); their
// pack on the ground is picked up whole (E Pick up: takebox). And no two things in one spot: others() hands camp, tarp
// and hang the friends' footprints (footprints.js), so our tent, tarp or hang is refused where theirs stands; two tents
// pitched at once on one spot leave the lower id's (tentClash).
//
// Phase 3 round 3 (2026-11-02, the owner: "You can't lower a friend's hung barrel. (it's shared, remember)" and "If you
// both pitch a tarp or hang a barrel in the same spot at the same moment, the clash isn't resolved"):
//   op 'lower' { rid, op: 'lower', cId }: a friend's hung barrel let down, as ours (hang.js LOWER, held; the barrel
//         comes down on our screen as we hold), asked of its owner at the end; their browser sets it down at the rope's
//         foot (refused while they are hanging or lowering it themselves) and it is a container on the ground, shared
//         as any other (take, put, E Pick up). Re-hung by whoever picks it up, as their own.
//   tarps and hangs at once: as the tents (tentClash), on what each screen has, the lower id's stands; the other is
//         struck back into its pack (a tarp) or let down at the rope's foot (a barrel), with a note. A tent and a tarp
//         on one spot at once the same.
//
//   const share = new CoopShare(coop)   (main.js, once coop.g has the camp modules); share.stats() for the tests
import { Vector3 } from 'three';
import { ContainerView } from './containers.js';
import { itemDef } from './items.js';
import { onboarding } from './onboarding.js'; // r3 replay: no canoe before the loan
import { tentPose } from './props.js';
import { tentOf } from './tent.js';
import { REACH, HULL_REACH } from './inventory.js';
import { attach as uiAttach, refresh as uiRefresh, note as uiNote } from './inv-ui.js';
import { tentFoot, hullFoot, overlap } from './footprints.js';
import { hold } from './hold.js';
import { LOWER, BARRELS as BARREL_H } from './hang.js';

const PUB_MS = 250;            // at most 4 a second
const OP_TIMEOUT = 3000;       // ms: a request with no answer is undone
const TENT_REACH = 4;          // m: a friend's tent's insides within reach (inventory.js TENT_REACH)
const PUBLIC = new Set(['ground', 'hung', 'tent', 'canoe']);
const AT_KEYS = ['x', 'y', 'z', 'heading', 'fuel', 'grate', 'ring', 'tree', 'limb', 'up', 'camp'];
const NAMES = { pack3: 'pack', pack4: 'pack', packdry: 'dry bag', barrel30: 'barrel', barrel60: 'barrel', bucket: 'bucket', tacklebox: 'tackle box', stringer: 'stringer', mapcase: 'map case', pile: 'things', firefuel: 'fire', grate: 'grate' };
// a tab's name, as the book names our own around us (inv-ui.js AROUND_NAMES): no owner's name on anything in the world
const TAB = { pack3: 'Duluth pack', pack4: 'Duluth pack', packdry: 'Dry bag', barrel30: 'Barrel', barrel60: 'Barrel', bucket: 'Bucket', tacklebox: 'Tackle box', stringer: 'Stringer', mapcase: 'Map case' };
const STAY = new Set(['firefuel', 'grate', 'woodarms', 'crate', 'pile', 'pockets', 'inhand']); // never picked up whole
const BARREL_NAME = { barrel30: 'small blue barrel', barrel60: 'big blue barrel' }; // (hang.js's words)
const nameOf = (item) => NAMES[item] || String((itemDef(item) || {}).short || (itemDef(item) || {}).name || 'pack').toLowerCase();
const before = (a, b) => { const x = Number(a), y = Number(b); return Number.isFinite(x) && Number.isFinite(y) ? x < y : String(a) < String(b); }; // (one order on every screen)
const _hv = new Vector3();
const pfx = (peer) => `p${peer}:`;
const unpfx = (s) => String(s).replace(/^p[^:]*:/, '');
const pickAt = (at) => { if (!at) return null; const o = {}; for (const k of AT_KEYS) if (at[k] !== undefined) o[k] = at[k]; return o; };

const HULL_HALF = 2.3, HULL_R = 0.42, WALKER_R = 0.32; // m: a hull as a capsule along its heading; the walker a circle
const APART = { most: 2.5, brake: 6 };                  // m/s the overlap is taken out at most; 1/s the speed into it lost
// a hull as a segment: heading h has the bow at (cos h, -sin h)
const hullSeg = (x, z, h) => { const fx = Math.cos(h) * HULL_HALF, fz = -Math.sin(h) * HULL_HALF; return { ax: x - fx, az: z - fz, bx: x + fx, bz: z + fz }; };
// the nearest points of two segments and their distance: { d, px, pz (on a), qx, qz (on b) }
function segSeg(a, b) {
  const ux = a.bx - a.ax, uz = a.bz - a.az, vx = b.bx - b.ax, vz = b.bz - b.az, wx = a.ax - b.ax, wz = a.az - b.az;
  const A = ux * ux + uz * uz, Bv = ux * vx + uz * vz, C = vx * vx + vz * vz, D = ux * wx + uz * wz, E = vx * wx + vz * wz;
  const cl = (t) => Math.max(0, Math.min(1, t));
  let s = 0, t = 0;
  const den = A * C - Bv * Bv;
  if (A < 1e-9 && C < 1e-9) { s = 0; t = 0; }
  else if (A < 1e-9) { s = 0; t = cl(E / C); }
  else if (C < 1e-9) { t = 0; s = cl(-D / A); }
  else {
    s = den > 1e-9 ? cl((Bv * E - C * D) / den) : 0;
    t = (Bv * s + E) / C;
    if (t < 0) { t = 0; s = cl(-D / A); } else if (t > 1) { t = 1; s = cl((Bv - D) / A); }
  }
  const px = a.ax + ux * s, pz = a.az + uz * s, qx = b.ax + vx * t, qz = b.az + vz * t;
  return { d: Math.hypot(px - qx, pz - qz), px, pz, qx, qz };
}

// A friend's things on the ground, hung, in piles and on grates, drawn as ours are (containers.js), from their pub
class FriendView extends ContainerView {
  afterPose() {
    const inv = this.inv, p = this.player, seen = new Set(), used = new Set();
    let ropes = 0;
    for (const c of inv.containers) {
      if (!((c.where === 'ground' || c.where === 'hung') && c.at)) continue;
      if (Math.abs(c.at.x - p.x) > 200 || Math.abs(c.at.z - p.z) > 200) continue;
      if (c.item === 'pile') { if (c.grid.length && !(this.woodOnly && this.woodOnly(c))) { const o = this.looseMesh(c.id, { inObjs: true }); seen.add(c.id); this.drawPile(o, c); } continue; }
      if (c.item === 'grate') { if (c.at.grate) { const k = `grate:${c.id}`; const o = this.looseMesh(k); used.add(k); this.drawGrate(o, c, null); } continue; }
      const o = this.objFor(c.id, c.item); if (!o) continue;
      seen.add(c.id);
      if (o.parent !== this.scene) this.scene.add(o);
      o.visible = true;
      this.onGround(o, c.at, c.where === 'hung');
      if (c.where === 'hung') this.ropeFor(ropes++, c.at, o);
    }
    for (const l of inv.long) {
      if (l.where !== 'ground' || !l.at) continue;
      const o = this.objFor(l.uid, l.id); if (!o) continue;
      seen.add(l.uid);
      if (o.parent !== this.scene) this.scene.add(o);
      o.visible = true;
      this.onGround(o, l.at, false);
    }
    for (const c of inv.containers) { // a container nested in a pile stands at its cell
      if (c.where !== 'in') continue;
      const pile = inv.cont(c.in);
      if (!pile || pile.item !== 'pile' || pile.where !== 'ground' || !pile.at) continue;
      const e = pile.grid.find((q) => q.box && q.uid === c.id); if (!e) continue;
      const o = this.objFor(c.id, c.item); if (!o) continue;
      seen.add(c.id);
      if (o.parent !== this.scene) this.scene.add(o);
      o.visible = true;
      const at = this.cellAt(pile, e);
      this.onGround(o, { x: at.x, z: at.z, heading: pile.at.heading || 0 });
    }
    // their canoe's load, in their canoe (the actor's near hull: the same frame as ours), beached or afloat
    const B = this.boatOf ? this.boatOf() : null, pivot = B && !B.hidden && B.near ? B.near.pivot : null;
    if (pivot && pivot.parent) this.loadInto(pivot, inv.containers, inv.long, { seen });
    for (let i = ropes; this.ropes && i < this.ropes.length; i++) this.ropes[i].visible = false;
    for (const [k, o] of this.objs) if (!seen.has(k)) { o.removeFromParent(); if (o.userData.merged) o.geometry.dispose(); this.objs.delete(k); }
    for (const [k, o] of this.loose) if (!used.has(k)) { o.removeFromParent(); if (o.userData.merged) o.geometry.dispose(); this.loose.delete(k); }
  }
  dispose() {
    for (const o of this.objs.values()) { o.removeFromParent(); if (o.userData.merged) o.geometry.dispose(); }
    for (const o of this.loose.values()) { o.removeFromParent(); if (o.userData.merged) o.geometry.dispose(); }
    for (const r of this.ropes || []) r.removeFromParent();
    this.objs.clear(); this.loose.clear(); this.ropes = [];
  }
}

// a friend's things as the inventory's shape, for the FriendView and the reach
class Mirror {
  constructor() { this.attached = true; this.containers = []; this.long = []; this.byId = new Map(); this.fishing = null; }
  set(containers, long) { this.containers = containers; this.long = long; this.byId = new Map(containers.map((c) => [c.id, c])); }
  cont(id) { return this.byId.get(id) || null; }
  longOf(uid) { return this.long.find((l) => l.uid === uid) || null; }
  root(c) { let k = c, guard = 0; while (k && k.where === 'in' && guard++ < 8) k = this.cont(k.in); return k || c; }
}

export class CoopShare {
  constructor(coop) {
    this.coop = coop;
    this.friends = new Map();   // peer id -> { id, name, pub, mirror, view, tent, tarps, fires: Map key -> sig, claims: Set }
    this.lastPub = ''; this.pubT = 0; this.force = false;
    this.sent = { tk: {}, sw: {}, pk: {} };
    this.pending = new Map();   // rid -> { op, to, t0, … }
    this.rid = 1; this.ver = 0;
    this.n = { pubOut: 0, pubIn: 0, tookIn: 0, opIn: 0, oprIn: 0, timeouts: 0, rtt: [] };
    coop.on('pub', (m) => this.gotPub(m));
    coop.on('took', (m) => this.gotTook(m));
    coop.on('op', (m) => this.gotOp(m));
    coop.on('opr', (m) => this.gotOpr(m));
    coop.onPeers((what, peer) => {
      if (what === 'welcome' || what === 'join') { this.force = true; this.sent = { tk: {}, sw: {}, pk: {} }; }
      if (what === 'leave' && peer) this.drop(peer.id);
      if (what === 'gone') for (const id of [...this.friends.keys()]) this.drop(id);
      if (what === 'welcome') { const keep = new Set(coop.peers().map((q) => q.id)); for (const id of [...this.friends.keys()]) if (!keep.has(id)) this.drop(id); }
    });
    coop.tick((now) => this.tick(now));
    // the hooks into the camp modules: each does nothing with no friend about
    const g = coop.g;
    if (g.chores) {
      g.chores.friendRing = (key, kind = 'fuel') => !!this.friendThing(key, kind);
      g.chores.friendDoused = (key, stage) => this.douseFriend(key, stage);
      g.chores.friendPiles = () => this.groundOf((c) => c.item === 'pile'); // (their woodpiles drawn as ours: chores.drawPiles)
    }
    if (g.camp) g.camp.others = () => this.others(); // (tent, tarp and hang: a friend's footprints, refused like our own)
    uiAttach({ coopTabs: { tabs: () => this.tabs(), sig: () => this.tabSig() } });
    this.hookNearby();
  }
  get g() { return this.coop.g; }
  hookNearby() {
    const nb = window.__game && window.__game.nearby;
    if (nb && nb.hooks && !nb.hooks.friendFire) nb.hooks.friendFire = (key, site) => this.fireObject(key, site);
    if (nb && nb.hooks && !nb.hooks.friendFeed) nb.hooks.friendFeed = (key, c, e, has) => this.feedActions(key, c, e, has);
    const pt = window.__game && window.__game.pointer;
    if (pt && typeof pt.register === 'function' && !this.offPointer) this.offPointer = pt.register((ray, near) => this.pointTargets(ray, near));
    return !!nb;
  }

  // --- what we publish --------------------------------------------------------------------------------------------
  pubNow() {
    const g = this.g, inv = g.inventory;
    if (!inv || !inv.attached) return null;
    const pub = (c) => PUBLIC.has(inv.rootWhere(c));
    const c = inv.containers.filter(pub).map((k) => ({ id: k.id, item: k.item, name: k.name, where: k.where, at: pickAt(k.at), in: k.in || null, grid: k.grid.map((e) => ({ uid: e.uid, id: e.id, x: e.x, y: e.y, rot: e.rot ? 1 : 0, qty: e.qty, ...(e.box ? { box: true } : {}), ...(e.fixed ? { fixed: true } : {}), ...(e.data ? { data: e.data } : {}) })) }));
    const l = inv.long.filter((k) => PUBLIC.has(k.where) && !k.inUse).map((k) => ({ uid: k.uid, id: k.id, where: k.where, at: pickAt(k.at) }));
    let tent = null; try { tent = g.camp && g.camp.serialize ? g.camp.serialize() : null; } catch { tent = null; }
    if (tent) tent = { key: tent.key, stage: tent.stage, item: tent.item, x: tent.x, z: tent.z, fdx: tent.fdx, fdz: tent.fdz };
    const tarps = g.tarp && g.tarp.serialize ? g.tarp.serialize() : [];
    const fires = [];
    if (g.fires) for (const b of inv.containers) if (b.item === 'firefuel' && b.at && b.at.fuel) { const r = g.fires.record(b.at.fuel); if (r) fires.push(r); }
    // our canoe when it is not under us or on our shoulders: beached, set down, tied at a dock, floating capsized beside us
    const p = g.player, d = !onboarding.noCanoe && p && p.carry && p.carry.drop, cap = p && p.mode === 'swim' && p.swim && p.swim.hull; // (r3 replay: no canoe before the loan)
    const cn = cap && Number.isFinite(cap.cx) ? { x: cap.cx, z: cap.cz, heading: cap.heading || 0 }
      : d && Number.isFinite(d.x) && p.mode !== 'paddle' && p.mode !== 'carry' ? { x: d.x, z: d.z, heading: d.heading || 0 } : null;
    // what cooks on our grates and in our pots there (cook.js jobs), for a friend's fire card
    let cook = null;
    const ck = g.chores && g.chores.cook;
    if (ck && typeof ck.cookingOf === 'function') for (const k of c) if (k.item === 'grate' || (itemDef(k.item) || {}).pot) { const q = ck.cookingOf(k.id); if (q) (cook = cook || {})[k.id] = { v: Math.round(q.value * 20) / 20, l: q.label, r: !!q.running, i: q.item }; }
    return { c, l, tent, tarps, fires, cn, cook };
  }
  publish(now) {
    if (!this.force && now - this.pubT < PUB_MS) return;
    this.pubT = now;
    const body = this.pubNow();
    if (!body) return;
    const s = JSON.stringify(body);
    if (s !== this.lastPub || this.force) {
      if (this.coop.send({ t: 'pub', ...body })) { this.lastPub = s; this.force = false; this.n.pubOut++; }
    }
    this.sendTook();
  }
  pubSoon() { this.force = true; this.publish(performance.now()); }
  // what we have added to the world's takings since we last said (a newcomer is sent all of it: this.sent reset)
  sendTook() {
    const g = this.g, ch = g.chores, fo = g.forage, out = { tk: {}, sw: {}, pk: {} };
    let any = false;
    const diff = (src, k) => { if (!src) return; for (const [key, v] of Object.entries(src)) { const s = JSON.stringify(v); if (this.sent[k][key] !== s) { out[k][key] = v; this.sent[k][key] = s; any = true; } } };
    if (ch && ch.s) { diff(ch.s.taken, 'tk'); diff(ch.s.sawn, 'sw'); }
    if (fo && fo.s) diff(fo.s.picked, 'pk');
    if (any) this.coop.send({ t: 'took', ...out });
  }

  // --- what friends publish ---------------------------------------------------------------------------------------
  friend(id) {
    let f = this.friends.get(id);
    if (!f) {
      const g = this.g, mirror = new Mirror();
      const view = g.canoe && g.scene ? new FriendView({ inventory: mirror, canoe: g.canoe, scene: g.scene, player: g.player }) : null;
      f = { id, pub: null, mirror, view, tent: null, tarps: [], fires: new Map(), claims: new Set() };
      if (view) view.boatOf = () => { const r = this.coop.remotes.get(id); return r ? r.boat : null; };
      if (view && g.chores) view.woodOnly = (c) => g.chores.woodOnly(c);
      this.friends.set(id, f);
    }
    const r = this.coop.remotes.get(id);
    f.name = r ? r.name : f.name || 'Your friend';
    return f;
  }
  gotPub(m) {
    if (!m.from || m.from === this.coop.id) return;
    this.n.pubIn++;
    const f = this.friend(m.from), P = pfx(m.from);
    f.pub = m;
    const containers = (m.c || []).filter((c) => c && itemDef(c.item)).map((c) => ({ ...c, id: P + c.id, in: c.in ? P + c.in : null, grid: (c.grid || []).filter((e) => e && itemDef(e.id)).map((e) => ({ ...e, uid: P + e.uid })) }));
    const long = (m.l || []).filter((l) => l && itemDef(l.id)).map((l) => ({ ...l, uid: P + l.uid }));
    f.mirror.set(containers, long);
    this.applyTarps(f);
    this.applyFires(f);
    f.tentWant = m.tent || null;
    this.ver++;
    uiRefresh();
  }
  gotTook(m) {
    if (!m.from || m.from === this.coop.id) return;
    this.n.tookIn++;
    const g = this.g, ch = g.chores, fo = g.forage;
    let wood = false, forage = false;
    if (ch && ch.s) {
      for (const [k, v] of Object.entries(m.tk || {})) {
        if (!Number.isFinite(v)) continue;
        const cur = ch.s.taken[k];
        if (cur == null || v > cur) { ch.s.taken[k] = v; wood = true; }
        this.sent.tk[k] = JSON.stringify(v); // (what they have: if ours merged past it, ours goes back to them)
      }
      for (const [k, v] of Object.entries(m.sw || {})) {
        if (!v || !Number.isFinite(v.day)) continue;
        const cur = ch.s.sawn[k];
        let next = v;
        if (cur && cur.day > v.day) next = cur;
        else if (cur && cur.day === v.day) next = { day: v.day, cuts: Math.max(cur.cuts || 0, v.cuts || 0), ...((cur.poles || v.poles) ? { poles: Math.max(cur.poles || 0, v.poles || 0) } : {}) };
        if (JSON.stringify(next) !== JSON.stringify(cur)) { ch.s.sawn[k] = next; wood = true; }
        this.sent.sw[k] = JSON.stringify(v);
      }
    }
    if (fo && fo.s) {
      for (const [k, v] of Object.entries(m.pk || {})) {
        if (!Array.isArray(v) || v.length !== 2) continue;
        const cur = fo.s.picked[k];
        if (!cur || v[0] > cur[0] || (v[0] === cur[0] && v[1] > cur[1])) { fo.s.picked[k] = [v[0] | 0, v[1] | 0]; forage = true; }
        this.sent.pk[k] = JSON.stringify(v);
      }
    }
    if (wood) { ch.dirty = true; uiRefresh(); }
    if (forage && Array.isArray(fo.drawn)) for (const q of fo.drawn) q.left = -1;
  }

  // --- drawing ------------------------------------------------------------------------------------------------------
  applyTarps(f) {
    const T = this.g.tarp;
    if (!T || !Array.isArray(T.others)) return;
    const P = pfx(f.id);
    T.others = T.others.filter((r) => !String(r.id).startsWith(P));
    for (const q of f.pub.tarps || []) { const r = T.rigOf({ ...q, id: P + q.id }); if (r) T.others.push(r); }
  }
  ownBin(key) { const inv = this.g.inventory; return !!(inv && inv.containers.some((c) => c.item === 'firefuel' && c.at && c.at.fuel === key)); }
  applyFires(f) {
    const F = this.g.fires;
    if (!F) return;
    const now = new Map();
    for (const r of f.pub.fires || []) {
      if (!r || !r.key || this.ownBin(r.key)) continue;
      const sig = `${r.lit}|${r.until}|${r.laid}`;
      now.set(r.key, sig);
      if (f.fires.get(r.key) === sig) continue;
      const was = F.get(r.key), wasLaid = !was || was.laid || !(was.until > F.now);
      const fire = F.restoreRecord(r);
      if (fire && wasLaid && !(r.laid > 0) && r.until > F.now && F.now - r.lit < 0.05) fire.struck = F.t; // (it has just caught: the flare)
    }
    for (const key of f.fires.keys()) if (!now.has(key) && !this.ownBin(key) && !this.otherHas(key, f.id)) F.douse(key);
    f.fires = now;
  }
  otherHas(key, not) { for (const f of this.friends.values()) if (f.id !== not && f.fires.has(key)) return true; return false; }
  // a friend's tent: from camp's pool, posed on our drawn ground once it is in; a box for the walker once its poles are up
  drawTent(f) {
    const g = this.g, camp = g.camp, tiles = g.tiles, want = f.tentWant;
    const sig = want ? `${want.item}|${want.stage}|${want.x},${want.z},${want.fdx},${want.fdz}` : '';
    if (sig === (f.tent ? f.tent.sig : '')) return;
    if (want && f.tent && f.tent.item === want.item && f.tent.x === want.x && f.tent.z === want.z && f.tent.fdx === want.fdx && f.tent.fdz === want.fdz) {
      // the same tent at another stage
      f.tent.stage = want.stage; f.tent.sig = sig;
      f.tent.stages.set(want.stage); f.tent.stages.group.visible = want.stage > 0;
      this.tentBox(f.tent);
      this.claim(f, want.key);
      return;
    }
    this.dropTent(f);
    if (!want || !camp || !tiles) return;
    if (!(g.world && g.world.isReady && g.world.isReady(want.x, want.z)) || !(tiles.locate && tiles.locate(want.x, want.z))) return; // (its ground not in yet: next frame)
    const item = want.item || 'aframe', stages = camp.stagesFor(item);
    const pose = tentPose((x, z) => tiles.groundAt(x, z), want.x, want.z, want.fdx, want.fdz, tentOf(item).size);
    stages.place(pose.matrix); stages.set(want.stage); stages.group.visible = want.stage > 0;
    f.tent = { ...want, item, sig, stages, obstacle: pose.obstacle };
    this.tentBox(f.tent);
    this.claim(f, want.key);
  }
  tentBox(t) {
    const dyn = this.g.tiles && this.g.tiles.dynamic;
    if (!dyn || !t.obstacle) return;
    const i = dyn.indexOf(t.obstacle), want = t.stage >= 2;
    if (want && i < 0) dyn.push(t.obstacle); else if (!want && i >= 0) dyn.splice(i, 1);
  }
  dropTent(f) {
    const t = f.tent;
    if (!t) return;
    t.stage = 0; this.tentBox(t);
    t.stages.hide();
    const camp = this.g.camp; if (camp && camp.pool) camp.pool.push(t.stages);
    f.tent = null;
    this.unclaim(f);
  }
  // one group, one site: a friend's tent holds its site for the group ('player' in our registry), so a party never
  // lands there and we can pitch beside them
  claim(f, key) {
    const reg = this.g.registry || (this.g.camp && this.g.camp.registry);
    if (!reg || !key) return;
    if (reg.holder(key) == null && reg.claim(key, 'player')) f.claims.add(key);
  }
  unclaim(f) {
    const reg = this.g.registry || (this.g.camp && this.g.camp.registry), own = this.g.camp && this.g.camp.camp;
    for (const key of f.claims) {
      const still = [...this.friends.values()].some((o) => o !== f && o.tent && o.tent.key === key);
      if (reg && !still && !(own && own.key === key)) reg.release(key, 'player');
    }
    f.claims.clear();
  }
  drop(id) {
    const f = this.friends.get(id);
    if (!f) return;
    if (f.view) f.view.dispose();
    this.dropTent(f);
    const T = this.g.tarp; if (T && Array.isArray(T.others)) T.others = T.others.filter((r) => !String(r.id).startsWith(pfx(id)));
    const F = this.g.fires;
    for (const key of f.fires.keys()) if (F && !this.ownBin(key) && !this.otherHas(key, id)) F.douse(key);
    this.friends.delete(id);
    for (const [rid, q] of this.pending) if (q.to === id) this.expire(rid, 'gone');
    this.ver++;
    uiRefresh();
  }

  // --- no two things in one spot ------------------------------------------------------------------------------------
  // friends' footprints, for our tent (camp.pitchProblem), our tarp (tarp.rigProblem) and our hang (hang.treeFor):
  // { tents: [box], tarps: [box], canoes: [box], hung: [{ x, z, tree }] } (footprints.js boxes); kept a moment
  others() {
    const now = performance.now();
    if (this.othersAt && this.othersAt.ver === this.ver && now - this.othersAt.t < 200) return this.othersAt.v;
    const v = { tents: [], tarps: [], canoes: [], hung: [] }, T = this.g.tarp;
    if (this.coop.live) {
      for (const f of this.friends.values()) {
        const t = f.tentWant;
        if (t && t.stage >= 1 && Number.isFinite(t.x)) v.tents.push(tentFoot(t));
        const cn = f.pub && f.pub.cn;
        if (cn) v.canoes.push(hullFoot(cn));
        for (const c of f.mirror.containers) if (c.where === 'hung' && c.at) v.hung.push({ id: c.id, x: c.at.x, z: c.at.z, tree: c.at.tree || null, limb: Number.isFinite(c.at.limb) ? c.at.limb : null, peer: f.id });
      }
      if (T && typeof T.footOf === 'function') for (const r of T.others || []) if (r.stage >= 1) v.tarps.push(T.footOf(r));
    }
    this.othersAt = { ver: this.ver, t: now, v };
    return v;
  }
  // two tents pitched at once on two screens, each before the other's pub came: the lower id keeps the spot, the other
  // strikes theirs back into the pack (each screen decides alike, on what it has)
  tentClash() {
    const camp = this.g.camp, mine = camp && camp.camp;
    if (!mine || !(mine.stage >= 1)) return;
    const me = tentFoot(mine);
    const T = this.g.tarp;
    for (const f of this.friends.values()) {
      if (before(this.coop.id, f.id)) continue;
      const t = f.tentWant, P = pfx(f.id);
      // (round 3: their tarp's sheet on that spot at once counts too)
      const onTent = t && t.stage >= 1 && overlap(me, tentFoot(t), 0);
      const onTarp = !onTent && T && typeof T.footOf === 'function' && (T.others || []).some((r) => String(r.id).startsWith(P) && r.stage >= 1 && overlap(me, T.footOf(r), 0));
      if (!onTent && !onTarp) continue;
      if (hold.is('tent')) hold.cancel();
      if (typeof camp.cancelPitch === 'function') camp.cancelPitch();
      if (camp.camp) camp.packTent({ quiet: true });
      uiNote(onTarp ? 'A tarp went up over that spot first: your tent is struck and back in the pack.' : 'Another tent went up on that spot first: yours is struck and back in the pack.', 5);
      this.pubSoon();
      return;
    }
  }
  // --- round 3: tarps and hangs at once ------------------------------------------------------------------------------
  // our tarp on a friend's tarp or tent, each pitched before the other's pub came: the lower id's stands, ours (the higher
  // id) is taken down into the pack it came out of, poles and all (tarp.js packRig), a pitch under way stopped
  tarpClash() {
    const T = this.g.tarp;
    if (!T || !Array.isArray(T.rigs) || !T.rigs.length || typeof T.footOf !== 'function') return;
    for (const rig of [...T.rigs]) {
      if (!(rig.stage >= 1)) continue;
      const me = T.footOf(rig);
      for (const f of this.friends.values()) {
        if (before(this.coop.id, f.id)) continue;
        const P = pfx(f.id), t = f.tentWant;
        const onTarp = (T.others || []).some((r) => String(r.id).startsWith(P) && r.stage >= 1 && overlap(me, T.footOf(r), 0));
        const onTent = !onTarp && t && t.stage >= 1 && overlap(me, tentFoot(t), 0);
        if (!onTarp && !onTent) continue;
        if (hold.is('tarp') || hold.is('tarp-down')) hold.cancel();
        if (T.rigs.includes(rig)) T.packRig(rig, { quiet: true });
        uiNote(onTent ? 'A tent went up on that spot first: your tarp is taken down and back in the pack.' : 'Another tarp went up there first: yours is taken down and back in the pack.', 5);
        this.n.clashes = (this.n.clashes || 0) + 1;
        this.pubSoon();
        break;
      }
    }
  }
  // our barrel hung (or tied on, or the rope over) on the limb a friend's barrel went onto at the same moment: the lower
  // id's stays, ours comes down at the rope's foot (hang.js yieldLimb)
  hangClash() {
    const hg = this.g.camp && this.g.camp.hang;
    if (!hg || typeof hg.ownLimbs !== 'function') return;
    const mine = hg.ownLimbs();
    if (!mine.length) return;
    for (const f of this.friends.values()) {
      if (before(this.coop.id, f.id)) continue;
      for (const c of f.mirror.containers) {
        const t = c.where === 'hung' && c.at && c.at.tree;
        if (!t || !mine.some((q) => Math.hypot(q.tree.x - t.x, q.tree.z - t.z) < 0.6)) continue;
        const what = hg.yieldLimb(t);
        if (what) {
          if (!(performance.now() - (this.hangNoted || -1e9) < 4000)) uiNote(what === 'rope' ? 'Another barrel went onto that limb first: your rope is off it.' : 'Another barrel went onto that limb first: yours is down at the rope’s foot.', 5);
          this.hangNoted = performance.now();
          this.n.clashes = (this.n.clashes || 0) + 1; (this.n.clashLog = this.n.clashLog || []).push(`hang:${what}`);
          this.pubSoon();
        }
        return;
      }
    }
  }

  // --- every frame in a room ----------------------------------------------------------------------------------------
  tick(now) {
    if (!this.coop.live) return;
    if (!this.hooked) this.hooked = this.hookNearby();
    this.publish(now);
    this.lowerShown(); // (round 3: a friend's barrel we are letting down, where our hold has it)
    for (const f of this.friends.values()) {
      // their load is drawn as it is (FriendView), not the actor's stock packs
      const r = this.coop.remotes.get(f.id); if (r && r.boat && f.pub) r.boat.packs = 0;
      if (f.view) { try { f.view.afterPose(); } catch (e) { if (!this.warned) { this.warned = true; console.warn('coop-share: a friend’s things', e); } } }
      try { this.drawTent(f); } catch (e) { if (!this.warnedT) { this.warnedT = true; console.warn('coop-share: a friend’s tent', e); } }
    }
    for (const [rid, q] of this.pending) if (now - q.t0 > OP_TIMEOUT) this.expire(rid, 'timeout');
    try { this.tentClash(); } catch (e) { if (!this.warnedC) { this.warnedC = true; console.warn('coop-share: two tents', e); } }
    try { this.tarpClash(); this.hangClash(); } catch (e) { if (!this.warnedC2) { this.warnedC2 = true; console.warn('coop-share: two tarps or hangs', e); } }

    try { this.keepApart(now); } catch (e) { if (!this.warnedK) { this.warnedK = true; console.warn('coop-share: keeping apart', e); } }
    // our own registry's claim for a friend's site goes when our own tent there is struck: keep it for them
    for (const f of this.friends.values()) if (f.tent && f.tent.key && !f.claims.has(f.tent.key)) this.claim(f, f.tent.key);
  }

  // --- reach: a friend's container as a tab in the book -------------------------------------------------------------
  near(f, c) {
    const p = this.g.player;
    if (!p || !p.onFoot) return false;
    const r = f.mirror.root(c);
    if (!r) return false;
    switch (r.where) {
      case 'ground': case 'hung': return !!r.at && Math.hypot(r.at.x - p.x, r.at.z - p.z) <= REACH;
      case 'canoe': {
        const s = f.pub && f.pub.cn; if (!s) return false;
        const inv = this.g.inventory, o = this.g.outfitter;
        if (inv && inv.atStash && o && o.visit && Math.hypot(s.x - p.x, s.z - p.z) < 60) return true; // (tied at the dock of the outfitter we are at)
        const fx = Math.cos(s.heading), fz = -Math.sin(s.heading), dx = p.x - s.x, dz = p.z - s.z, t = Math.max(-2.4, Math.min(2.4, dx * fx + dz * fz));
        return Math.hypot(dx - fx * t, dz - fz * t) <= HULL_REACH;
      }
      case 'tent': return !!(f.tent && f.tent.stage >= 3 && Math.hypot(f.tent.x - p.x, f.tent.z - p.z) <= TENT_REACH);
      default: return false;
    }
  }
  reachable() {
    const out = [];
    if (!this.coop.live) return out;
    for (const f of this.friends.values()) for (const c of f.mirror.containers) {
      if (c.item === 'firefuel' || c.item === 'grate' || c.item === 'woodarms') continue;
      if (this.near(f, c)) out.push({ f, c });
    }
    return out;
  }
  tabs() {
    // named as the book names our own around us; "the other" only where ours is about too, to tell the two apart
    const g = this.g, inv = g.inventory, mineCanoe = !!(inv && inv.canoeSpot && inv.canoeSpot()), mineTent = !!(g.camp && g.camp.camp && g.camp.camp.stage >= 3);
    const out = this.reachable().filter(({ c }) => !this.taking(c.id)).map(({ f, c }) => {
      const r = f.mirror.root(c), host = c.where === 'in' ? f.mirror.cont(c.in) : null;
      const label = TAB[c.item] || nameOf(c.item).replace(/^./, (k) => k.toUpperCase());
      const sub = host ? `in the ${nameOf(host.item)}` : r.where === 'canoe' ? (mineCanoe ? 'in the other canoe' : 'in the canoe') : r.where === 'tent' ? (mineTent ? 'in the other tent' : 'in the tent') : r.where === 'hung' ? 'hung up' : 'on the ground';
      const whole = !STAY.has(c.item) && !(itemDef(c.item) || {}).one && r.where !== 'hung';
      const pickUp = whole ? { why: this.slotFor(c) ? null : 'your back, your chest and your hands are full', run: () => this.requestTakeBox(f, c) } : null;
      return { key: c.id, kind: 'friend', label, sub, bin: this.binOf(f, c), pickUp };
    });
    // two of a kind told apart as the book does ("Barrel", "Barrel 2")
    const seen = new Map();
    for (const t of out) { const k = `${t.label}|${t.sub}`, n = (seen.get(k) || 0) + 1; seen.set(k, n); if (n > 1) t.label = `${t.label} ${n}`; }
    return out;
  }
  tabSig() {
    if (!this.coop.live || !this.friends.size) return '';
    return `${this.ver}:${this.reachable().map(({ c }) => c.id).join(',')}:${[...this.pending.keys()].join(',')}`;
  }
  // a friend's container as a bin (inv-ui.js binContainer): its things at their cells, what we are taking out hidden,
  // what we are putting in shown; take and drop are requests to its owner
  binOf(f, c, { accepts = null } = {}) {
    const spec = (itemDef(c.item) || {}).container || { cols: 4, rows: 3 };
    const out = new Set([...this.pending.values()].filter((q) => q.op === 'take' && q.cId === c.id).map((q) => q.uid));
    const items = c.grid.filter((e) => !e.box && !out.has(e.uid)).map((e) => ({ uid: e.uid, id: e.id, qty: e.qty, x: e.x, y: e.y, rot: e.rot, ...(e.data ? { data: e.data } : {}) }));
    for (const q of this.pending.values()) if (q.op === 'put' && q.cId === c.id) items.push({ uid: `pend:${q.rid}`, id: q.item.id, qty: q.item.qty, ...(q.item.data ? { data: q.item.data } : {}) });
    return {
      id: c.id, items, cols: spec.cols, rows: spec.rows, accepts: accepts || spec.accepts || null,
      take: ({ uid, toCId, x, y, rot, qty }) => this.requestTake(f, c, uid, { toCId, x, y, rot, qty }),
      toHand: (e, hand, qty) => this.requestTake(f, c, e.uid, { hand, qty: qty || e.qty }),
      drop: ({ cId, uid, itemId, qty }) => this.requestPut(f, c, { cId, uid, itemId, qty }),
    };
  }

  // --- requests to a thing's owner ----------------------------------------------------------------------------------
  requestTake(f, c, uid, { toCId = null, x = null, y = null, rot = 0, qty = null, hand = null } = {}) {
    if (String(uid).startsWith('pend:')) return { ok: false, words: 'A moment: it is on its way.' };
    const e = c.grid.find((q) => q.uid === uid);
    if (!e) return { ok: false, words: 'That is gone.' };
    const rid = `${this.coop.id}:${this.rid++}`;
    const sent = this.coop.send({ t: 'op', to: f.id, rid, op: 'take', cId: unpfx(c.id), uid: unpfx(uid), qty: qty || e.qty });
    if (!sent) return { ok: false, words: 'Not now: the connection is down.' };
    this.pending.set(rid, { rid, op: 'take', to: f.id, cId: c.id, uid, t0: performance.now(), toCId, x, y, rot, hand, qty: qty || e.qty, itemId: e.id });
    this.ver++;
    return { ok: true, words: `The ${String((itemDef(e.id) || {}).name || 'thing').toLowerCase()}…` };
  }
  requestPut(f, c, { cId, uid, itemId, qty }) {
    const inv = this.g.inventory, d = itemDef(itemId), spec = (itemDef(c.item) || {}).container || {};
    if (!d || d.kind === 'container' || d.kind === 'long') return { ok: false, words: 'That does not go in there.' };
    if (spec.accepts && !spec.accepts.includes(d.kind)) return { ok: false, words: `The ${NAMES[c.item] || 'container'} won’t take that.` };
    if (String(cId).startsWith('bin:')) return { ok: false, words: 'Take it out first, then put it in.' }; // (from one of their bins to another)
    const from = inv.cont(cId), was = from && from.grid.find((q) => q.uid === uid);
    if (!was) return { ok: false, words: 'That is gone.' };
    const back = { cId, x: was.x, y: was.y, rot: was.rot };
    const got = inv.take(cId, uid, qty);
    if (!got) return { ok: false, words: 'That won’t come out.' };
    const item = { id: got.id, qty: got.qty, ...(got.data ? { data: got.data } : {}) };
    const rid = `${this.coop.id}:${this.rid++}`;
    if (!this.coop.send({ t: 'op', to: f.id, rid, op: 'put', cId: unpfx(c.id), item })) { this.giveBack(item, back); return { ok: false, words: 'Not now: the connection is down.' }; }
    this.pending.set(rid, { rid, op: 'put', to: f.id, cId: c.id, item, back, t0: performance.now() });
    this.ver++;
    return { ok: true, words: `Into the ${nameOf(c.item)}…` };
  }
  // --- a whole container off the ground, out of a friend's canoe or tent: 'takebox' ---------------------------------------
  // "If it's on the ground in any container at all, it's shared": a pack, a barrel, the bucket picked up as our own are.
  // The owner takes it (and what nests in it) out of their inventory and answers with the lot; we make it ours, on our
  // back, chest or in a hand. While asked it is hidden here; no answer and it is simply back (nothing of ours moved), and
  // a late yes lands all the same (it left its owner).
  taking(cId) { for (const q of this.pending.values()) if (q.op === 'takebox' && q.cId === cId) return true; return false; }
  // where on us a friend's container c would go: 'back' | 'chest' | 'hands', or null
  slotFor(c) {
    const inv = this.g.inventory, d = itemDef(c.item) || {}, w = d.wear || [];
    if (!inv) return null;
    if (w.includes('back') && !inv.worn('back')) return 'back';
    if (w.includes('chest') && !inv.worn('chest')) return 'chest';
    return inv.freeHand() >= 0 ? 'hands' : null;
  }
  requestTakeBox(f, c) {
    if (STAY.has(c.item) || (itemDef(c.item) || {}).one) return { ok: false, words: 'That stays where it is.' };
    const r = f.mirror.root(c);
    if (r.where === 'hung') return { ok: false, words: 'Lower it first.' };
    if (!this.near(f, c)) return { ok: false, words: 'A step closer.' };
    if (this.taking(c.id)) return { ok: false, words: 'A moment: it is on its way.' };
    const slot = this.slotFor(c);
    if (!slot) return { ok: false, words: 'Your back, your chest and your hands are full.' };
    const rid = `${this.coop.id}:${this.rid++}`;
    if (!this.coop.send({ t: 'op', to: f.id, rid, op: 'takebox', cId: unpfx(c.id) })) return { ok: false, words: 'Not now: the connection is down.' };
    this.pending.set(rid, { rid, op: 'takebox', to: f.id, cId: c.id, slot, item: c.item, t0: performance.now() });
    this.ver++;
    uiRefresh();
    return { ok: true, words: `The ${nameOf(c.item)}…` };
  }
  // the owner's side: c and what nests in it, as a tree, out of our inventory. → the tree, or null
  giveBox(c) {
    const inv = this.g.inventory;
    const tree = (k, depth = 0) => ({ item: k.item, grid: k.grid.map((e) => {
      if (e.box) { const kid = inv.cont(e.uid); return kid && depth < 6 ? { x: e.x, y: e.y, rot: e.rot ? 1 : 0, kid: tree(kid, depth + 1) } : null; }
      return { id: e.id, qty: e.qty, x: e.x, y: e.y, rot: e.rot ? 1 : 0, ...(e.data ? { data: e.data } : {}) };
    }).filter(Boolean) });
    const out = tree(c), gone = new Set();
    const mark = (k) => { gone.add(k.id); for (const e of k.grid) if (e.box) { const kid = inv.cont(e.uid); if (kid && !gone.has(kid.id)) mark(kid); } };
    mark(c);
    if (c.where === 'in') inv.unnest(c);
    inv.containers = inv.containers.filter((k) => !gone.has(k.id));
    inv.emit('containers');
    return out;
  }
  // ours now: the tree made into our containers, on us at `slot` (else at our feet). → the words
  landBox(tree, slot) {
    const inv = this.g.inventory, p = this.g.player, d = itemDef(tree.item) || {}, w = d.wear || [];
    let where = slot;
    if (where === 'back' || where === 'chest') { if (!w.includes(where) || inv.worn(where)) where = null; }
    if (where === 'hands' && inv.freeHand() < 0) where = null;
    if (!where) where = w.includes('back') && !inv.worn('back') ? 'back' : w.includes('chest') && !inv.worn('chest') ? 'chest' : inv.freeHand() >= 0 ? 'hands' : 'ground';
    const make = (t, host) => {
      const k = inv.addContainer(t.item, host ? 'in' : where, null, { quiet: true });
      if (!k) return null;
      if (host) { k.in = host.id; k.hand = null; }
      for (const e of t.grid || []) {
        if (e.kid) { const kid = make(e.kid, k); if (kid) k.grid.push({ uid: kid.id, id: kid.item, x: e.x, y: e.y, rot: e.rot ? 1 : 0, qty: 1, box: true }); continue; }
        if (!itemDef(e.id)) continue;
        k.grid.push({ uid: inv.uid(), id: e.id, qty: Math.max(1, e.qty | 0), x: e.x, y: e.y, rot: e.rot ? 1 : 0, ...(e.data ? { data: e.data } : {}) });
      }
      return k;
    };
    const k = make(tree, null);
    if (!k) return 'It would not come.';
    if (where === 'ground') { const hd = p.heading || 0, x = p.x + Math.sin(hd) * 0.8, z = p.z + Math.cos(hd) * 0.8; k.at = { x, z, y: inv.groundY(x, z), heading: hd, left: true }; }
    inv.emit('containers'); inv.emit('items');
    const nm = d.name || 'It';
    return where === 'hands' ? `${nm} in hand.` : where === 'ground' ? `${nm}: no room on you, so it is at your feet.` : `${nm} on your ${where}.`;
  }
  // the owner's side: applied to our own inventory at once, answered
  gotOp(m) {
    this.n.opIn++;
    const inv = this.g.inventory, reply = (r) => this.coop.send({ t: 'opr', to: m.from, rid: m.rid, ...r });
    if (m.op === 'douse') {
      const ch = this.g.chores, ok = !!(ch && typeof ch.douseFrom === 'function' && ch.douseFrom(m.key, m.stage));
      if (ok) this.pubSoon();
      return reply(ok ? { ok: true } : { ok: false, why: 'The fire is out already.' });
    }
    const c = inv && inv.cont(m.cId);
    if (!c || !PUBLIC.has(inv.rootWhere(c))) return reply({ ok: false, why: 'It isn’t there any more.' });
    if (m.op === 'lower') return reply(this.lowerFrom(c));
    if (m.op === 'takebox') {
      if (STAY.has(c.item) || (itemDef(c.item) || {}).one || inv.rootWhere(c) === 'hung') return reply({ ok: false, why: 'That stays where it is.' });
      const pm = this.g.player && this.g.player.mode;
      if (inv.rootWhere(c) === 'canoe' && (pm === 'paddle' || pm === 'carry')) return reply({ ok: false, why: 'That canoe is on the move.' });
      const tree = this.giveBox(c);
      this.pubSoon();
      return reply({ ok: true, tree });
    }
    if (m.op === 'take') {
      const e = c.grid.find((q) => q.uid === m.uid);
      if (!e) return reply({ ok: false, why: 'That is gone.' });
      if (e.box || e.fixed) return reply({ ok: false, why: 'That won’t come out.' });
      const got = inv.take(c.id, e.uid, m.qty);
      if (!got) return reply({ ok: false, why: 'That won’t come out.' });
      this.pubSoon(); // (our pub first, so the asker's book never shows it back for a moment)
      return reply({ ok: true, entry: { id: got.id, qty: got.qty, rot: got.rot ? 1 : 0, ...(got.data ? { data: got.data } : {}) } });
    }
    if (m.op === 'put') {
      const it = m.item || {}, d = itemDef(it.id);
      if (!d) return reply({ ok: false, why: 'That is not a thing we know.' });
      if (!inv.put(c, it.id, { qty: Math.max(1, it.qty | 0), data: it.data || null })) return reply({ ok: false, why: `No room in the ${NAMES[c.item] || 'pack'}.` });
      this.pubSoon();
      return reply({ ok: true });
    }
    return reply({ ok: false, why: 'Not that.' });
  }
  // --- round 3: a friend's hung barrel let down: 'lower' -----------------------------------------------------------------
  // the owner's side: set down at the rope's foot, as hang.js lowerOpts does at its end; not while we hang or lower it
  lowerFrom(c) {
    const inv = this.g.inventory, hg = this.g.camp && this.g.camp.hang, job = hold.active;
    if (c.where === 'ground') return { ok: true }; // (down already: by us, a moment ago)
    if (c.where !== 'hung' || !c.at) return { ok: false, why: 'It isn’t hung there any more.' };
    if (job && job.ref === c.id && job.id === 'lower') return { ok: false, why: 'It is coming down already.' };
    if ((job && job.ref === c.id) || c.at.up === false || (hg && hg.pending && hg.pending.ref === c.id)) return { ok: false, why: 'It is being hung just now.' };
    inv.setDown(c.id, { x: c.at.x, z: c.at.z, heading: c.at.heading || 0, ...(c.at.camp ? { camp: c.at.camp } : {}) }, { left: false, force: true });
    this.pubSoon();
    return { ok: true };
  }
  // the asker's side: the hold as hang.js's own (LOWER), the barrel coming down here as it is held; at its end the ask
  lowerOpts(f, c) {
    const p = this.g.player, a = c.at, H = BARREL_H[c.item] || 0.6, high = a.y;
    const low = (this.g.tiles && this.g.tiles.groundAt ? this.g.tiles.groundAt(a.x, a.z) : p.groundAt(a.x, a.z)) + H / 2 + 0.02;
    const ease = (k) => { const t = Math.min(1, Math.max(0, k)); return t * t * (3 - 2 * t); };
    return {
      id: 'lower', ref: c.id, label: 'Lowering the barrel', phases: LOWER, at: 0, clock: false, near: { x: p.x, z: p.z, r: 1.5 },
      onTick: (k) => { if (k > 1) this.lowering = { cId: c.id, y: high + (low - high) * ease(k - 1), high }; },
      onPhase: (i) => { if (i >= 1) this.requestLower(f, c, low, high); },
      onStop: () => { if (this.lowering && this.lowering.cId === c.id && !this.lowering.asked) this.lowering = null; },
    };
  }
  requestLower(f, c, low, high) {
    const rid = `${this.coop.id}:${this.rid++}`;
    if (!this.coop.send({ t: 'op', to: f.id, rid, op: 'lower', cId: unpfx(c.id) })) { this.lowering = null; uiNote('Not now: the connection is down.', 3); return; }
    this.pending.set(rid, { rid, op: 'lower', to: f.id, cId: c.id, item: c.item, t0: performance.now() });
    this.lowering = { cId: c.id, y: low, high, asked: rid };
    this.ver++;
  }
  // each frame: the barrel we let down drawn where the hold (or the answer on its way) has it, until their pub has it down
  lowerShown() {
    const L = this.lowering;
    if (!L) return;
    const f = this.ownerOf(L.cId), c = f && f.mirror.cont(L.cId);
    if (!c || c.where !== 'hung' || !c.at) { this.lowering = null; return; }
    c.at.y = L.y;
  }
  // the dot on a friend's hung barrel (or the trunk its rope is tied off on): E Lower · hold, as on our own
  hungTargets(near, out) {
    const p = this.g.player, hg = this.g.camp && this.g.camp.hang;
    for (const f of this.friends.values()) for (const c of f.mirror.containers) {
      if (c.where !== 'hung' || !c.at || c.at.up === false) continue;
      const t = c.at.tree, d = Math.min(near.flat(c.at.x, c.at.z), t ? near.flat(t.x, t.z) : Infinity);
      if (d > 3.4) continue; // (hang.js AT_HUNG)
      const ty = t ? p.groundAt(t.x, t.z) : 0;
      const hits = [near.sphere(c.at.x, c.at.y, c.at.z, 0.45), t && near.segment ? near.segment(t.x, ty + 0.3, t.z, t.x, ty + 2.4, t.z, (t.r || 0.25) + 0.2) : null].filter(Boolean);
      const hit = hits.sort((a, b) => a.miss - b.miss)[0];
      if (!hit) continue;
      const busy = (this.lowering && this.lowering.cId === c.id) || !!hold.active;
      out.push({ dist: hit.t, miss: hit.miss, target: { kind: 'barrelHung', ref: `barrelHung:${c.id}`, label: `the ${BARREL_NAME[c.item] || 'barrel'}, hung from the ${t && t.name ? t.name : 'tree'}`,
        e: { verb: 'Lower', held: true, why: busy ? 'a moment' : null, needs: LOWER.map((ph) => ({ label: ph.name, done: false })), next: 'Hold E: it comes down at the rope’s foot.',
          run: (o) => { if (busy) return false; const k = hg && typeof hg.keys === 'function' ? hg.keys(o) : { key: 'KeyE', keys: ['KeyE', 'Mouse0'] }; hold.begin({ ...this.lowerOpts(f, c), ...k }); return true; } },
        mesh: f.view && f.view.objs.get(c.id) } });
    }
  }
  gotOpr(m) {
    this.n.oprIn++;
    const q = this.pending.get(m.rid);
    if (!q) { this.late(m); return; }
    this.pending.delete(m.rid);
    this.n.rtt.push(Math.round(performance.now() - q.t0));
    if (this.n.rtt.length > 50) this.n.rtt.shift();
    this.ver++;
    if (q.op === 'take') {
      if (m.ok && m.entry) { const w = this.land(m.entry, q); uiNote(w, 3); }
      else uiNote(m.why || 'It won’t come out.', 3);
    } else if (q.op === 'takebox') {
      uiNote(m.ok && m.tree ? this.landBox(m.tree, q.slot) : m.why || 'It won’t come.', 3);
    } else if (q.op === 'put') {
      if (!m.ok) { this.giveBack(q.item, q.back); uiNote(`${m.why || 'It won’t go in.'} It is back with you.`, 3); }
    } else if (q.op === 'lower') {
      if (m.ok) uiNote(`The ${BARREL_NAME[q.item] || 'barrel'} is down.`, 3);
      else { if (this.lowering && this.lowering.cId === q.cId) this.restoreLowered(); uiNote(m.why || 'It won’t come down.', 3); }
    }
    uiRefresh();
  }
  // an answer after we gave up: a take is landed all the same (it left its owner); a put we gave back is taken again
  late(m) {
    const q = this.expired && this.expired.get(m.rid);
    if (!q) return;
    this.expired.delete(m.rid);
    if (q.op === 'take' && m.ok && m.entry) uiNote(this.land(m.entry, q), 3);
    if (q.op === 'takebox' && m.ok && m.tree) uiNote(this.landBox(m.tree, q.slot), 3);
    if (q.op === 'put' && m.ok && q.returned) { const inv = this.g.inventory; if (inv.cont(q.returned.cId)) inv.take(q.returned.cId, q.returned.uid, q.item.qty); }
    uiRefresh();
  }
  expire(rid, why) {
    const q = this.pending.get(rid);
    if (!q) return;
    this.pending.delete(rid);
    this.n.timeouts++;
    if (q.op === 'put') q.returned = this.giveBack(q.item, q.back);
    if (q.op === 'lower' && this.lowering && this.lowering.cId === q.cId) this.restoreLowered();
    if (!this.expired) this.expired = new Map();
    this.expired.set(rid, q);
    uiNote(why === 'gone' ? 'They have gone.' : 'No answer: try again.', 3);
    this.ver++;
    uiRefresh();
  }
  // a lower refused or unanswered: the barrel back up where it hung
  restoreLowered() {
    const L = this.lowering, f = L && this.ownerOf(L.cId), c = f && f.mirror.cont(L.cId);
    if (c && c.where === 'hung' && c.at && Number.isFinite(L.high)) c.at.y = L.high;
    this.lowering = null;
  }
  // a thing come to us: where it was dropped, else the first room there, else the best place on us, else a hand, else a
  // pile at our feet. → the words
  land(entry, { toCId = null, x = null, y = null, rot = 0, hand = null } = {}) {
    const inv = this.g.inventory, p = this.g.player, id = entry.id, data = entry.data || null, name = (itemDef(id) || {}).name || 'It';
    let left = Math.max(1, entry.qty | 0);
    if (hand != null) { const h = inv.toHandNew(id, { data, qty: left, hand }); if (h && h.ok) return `${name}: in your ${hand === 1 ? 'left' : 'right'} hand.`; } // (dropped on a free hand)
    const to = toCId && inv.cont(toCId);
    if (to && x != null && inv.put(to, id, { x, y, rot, qty: left, data })) return `${name}: yours now.`;
    if (to && inv.put(to, id, { qty: left, data })) return `${name}: yours now.`;
    const r = inv.place(id, left, { data });
    left -= r.placed || 0;
    if (left <= 0) return `${name}: yours now.`;
    const h = inv.toHandNew(id, { data, qty: left });
    if (h && h.ok) return `${name}: in your hand.`;
    const hd = p ? p.heading : 0, sx = p.x + Math.sin(hd) * 0.8, sz = p.z + Math.cos(hd) * 0.8;
    const k = inv.addContainer('pile', 'ground', { x: sx, z: sz, y: inv.groundY(sx, sz), heading: hd, left: true }, { quiet: true });
    if (k) inv.put(k, id, { qty: left, data });
    return `${name}: no room on you, so it is at your feet.`;
  }
  // a put refused or unanswered: back where it came from, else anywhere on us. → { cId, uid } where it went
  giveBack(item, back) {
    const inv = this.g.inventory, from = back && inv.cont(back.cId);
    if (from && inv.put(from, item.id, { x: back.x, y: back.y, rot: back.rot, qty: item.qty, data: item.data || null })) return { cId: from.id, uid: inv.lastPut };
    if (from && inv.put(from, item.id, { qty: item.qty, data: item.data || null })) return { cId: from.id, uid: inv.lastPut };
    const r = inv.place(item.id, item.qty, { data: item.data || null });
    if (r.ok) return { cId: r.cId, uid: r.uid };
    this.land({ ...item, qty: item.qty - (r.placed || 0) }, {});
    return null;
  }

  // --- one fire per ring --------------------------------------------------------------------------------------------
  // a friend's fuel bin at the ring `key` (when we have none of our own there): { f, c } or null
  friendBin(key) {
    if (!this.coop.live || !this.friends.size) return null;
    for (const f of this.friends.values()) for (const c of f.mirror.containers) if (c.item === 'firefuel' && c.at && c.at.fuel === key) return { f, c };
    return null;
  }
  // a friend's thing at ring `key`: 'grate' their grate, else their fuel bin. { f, c } or null
  friendThing(key, kind = 'fuel') {
    if (kind !== 'grate') return this.friendBin(key);
    if (!this.coop.live || !this.friends.size) return null;
    for (const f of this.friends.values()) for (const c of f.mirror.containers) if (c.item === 'grate' && c.at && c.at.grate === key) return { f, c };
    return null;
  }
  // a pot (or the grate) of a friend's cooking, from their pub: cook.cookingOf's shape
  cookingOf(f, c) {
    const q = f.pub && f.pub.cook ? f.pub.cook[unpfx(c.id)] : null;
    return q ? { value: q.v, label: q.l || 'Cooking', timer: 0, running: !!q.r, words: '', item: q.i } : null;
  }
  // the fire card at a friend's ring (nearby.js fireObject): their fuel as a bin fed by request; their grate and the
  // pots on it the same (their browser cooks over their fire), else our own grate; Douse (held) puts it out on both
  fireObject(key, site) {
    if (this.ownBin(key)) return null;
    const fb = this.friendBin(key);
    if (!fb) return null;
    const g = this.g, ch = g.chores, F = g.fires, ck = ch && ch.cook, nb = window.__game && window.__game.nearby;
    const fg = this.friendThing(key, 'grate');
    const grate = fg ? null : ch.grate(key, site);
    if (!fg && !grate) return null;
    const bin = this.binOf(fb.f, fb.c, { accepts: ['firewood'] });
    const units = ch.binUnits({ grid: fb.c.grid.filter((e) => !e.box) });
    const st = F.state(key), need = F.ringNeed(key, units), lit = st === 'burning' || st === 'coals';
    const potLabel = (c) => (itemDef(c.item) || {}).short || (itemDef(c.item) || {}).name || 'Pot';
    let slots, cooking;
    if (fg) {
      const pots = fg.f.mirror.containers.filter((c) => c.where === 'in' && c.in === fg.c.id && (itemDef(c.item) || {}).pot);
      slots = [
        { ...this.binOf(fg.f, fg.c, { accepts: ['fish', 'food', 'tool'] }), id: 'grate', label: 'Grate' },
        ...pots.map((c) => ({ ...this.binOf(fg.f, c, { accepts: ['meal', 'fish', 'food', 'water'] }), id: `pot:${c.id}`, label: potLabel(c), pot: true, cooking: this.cookingOf(fg.f, c) })),
      ];
      cooking = this.cookingOf(fg.f, fg.c);
    } else {
      slots = [
        { id: 'grate', label: 'Grate', cId: grate.id, accepts: ['fish', 'food', 'tool', 'container'] },
        ...(ck && typeof ck.potsOn === 'function' ? ck.potsOn(key) : []).map((c) => ({ id: `pot:${c.id}`, label: potLabel(c), cId: c.id, pot: true, accepts: ['meal', 'fish', 'food', 'water'], cooking: ck.cookingOf(c.id) })),
      ];
      cooking = ck ? (typeof ck.potsOn === 'function' ? ck.cookingNow(key, { grateOnly: true }) : ck.cookingNow(key)) : null;
    }
    return {
      id: `fire:${key}`, kind: 'fire', title: 'Fire ring', key, state: st,
      slots: [{ ...bin, id: 'fuel', label: 'Fuel' }, ...slots],
      actions: lit && site ? [{ id: 'douse', label: 'Douse', held: true, job: 'fire-out', enabled: true, why: null, run: (o) => ch.douse(site, key, nb && nb.keys ? nb.keys(o) : {}) }] : [],
      need: nb && typeof nb.askWood === 'function' ? nb.askWood(need) : need,
      burn: F.burn(key, units), coals: F.coals(key),
      cooking, friend: fb.f.id,
    };
  }
  // an item's right-click at a friend's ring (nearby.js itemActions): wood onto their fire, a fish onto their grate
  feedActions(key, c, e, has = {}) {
    const d = itemDef(e.id), out = [];
    if (!d || !c) return out;
    const one = (fx, id, label) => {
      if (!fx) return;
      const spec = (itemDef(fx.c.item) || {}).container || {};
      const room = spec.cols ? fx.c.grid.length < spec.cols * spec.rows : true;
      out.push({ id, label, enabled: room, why: room ? null : `${id === 'fuel' ? 'the ring' : 'the grate'} is full`, run: () => !!this.requestPut(fx.f, fx.c, { cId: c.id, uid: e.uid, itemId: e.id, qty: 1 }).ok });
    };
    if (d.kind === 'firewood' && !has.bin && !this.ownBin(key)) one(this.friendBin(key), 'fuel', 'Put it on the fire');
    if (d.kind === 'fish' && d.eat && d.eat.cook && !has.grate) one(this.friendThing(key, 'grate'), 'grate', 'Put it on the grate');
    return out;
  }
  // our held douse at a friend's ring got that far: their browser puts its fire out the same way
  douseFriend(key, stage) {
    if (this.ownBin(key)) return;
    const fb = this.friendBin(key);
    if (!fb) return;
    const rid = `${this.coop.id}:${this.rid++}`;
    if (this.coop.send({ t: 'op', to: fb.f.id, rid, op: 'douse', key, stage })) this.pending.set(rid, { rid, op: 'douse', to: fb.f.id, t0: performance.now(), key, stage });
  }

  // --- friends' things on the ground: a list, and the dot on them ------------------------------------------------------
  groundOf(test) {
    const out = [];
    if (!this.coop.live) return out;
    for (const f of this.friends.values()) for (const c of f.mirror.containers) if (c.where === 'ground' && c.at && test(c)) out.push(c);
    return out;
  }
  ownerOf(cId) { for (const f of this.friends.values()) if (f.mirror.cont(cId)) return f; return null; }
  // pointer.js provider: a friend's pile or woodpile (E Take one · Q Open it, the book at its tab), a friend's pack on the
  // ground (E Pick up · Q Open it), a friend's canoe lying there (E Look in it: the book at what is in it): each a
  // request to its owner, as in the book, and named as our own are
  pointTargets(ray, near) {
    const out = [], g = this.g, p = g.player;
    if (!this.coop.live || !this.friends.size || !p || p.mode !== 'walk') return out;
    const nb = window.__game && window.__game.nearby, ch = g.chores;
    const open = (c) => { if (nb && typeof nb.openHere === 'function') nb.openHere(c.id); };
    for (const f of this.friends.values()) for (const c of f.mirror.containers) {
      if (c.where !== 'ground' || !c.at || c.item === 'firefuel' || c.item === 'grate' || this.taking(c.id)) continue;
      if (near.flat(c.at.x, c.at.z) > near.reach) continue;
      const y = Number.isFinite(c.at.y) ? c.at.y : p.groundAt(c.at.x, c.at.z);
      const wood = !!(ch && ch.woodOnly(c)), pile = c.item === 'pile';
      const hit = near.sphere(c.at.x, y + (wood ? 0.18 : 0.2), c.at.z, wood ? 0.5 : pile ? 0.42 : 0.36);
      if (!hit) continue;
      if (pile) {
        const top = (wood ? c.grid.find((q) => q.id === 'wood:log') : null) || c.grid.find((q) => !q.box) || null, n = wood ? ch.pieceCount(c) : c.grid.length;
        if (!c.grid.length) continue;
        const label = wood ? `the woodpile (${n})` : n === 1 && top ? `the ${String((itemDef(top.id) || {}).name || 'thing').toLowerCase()}, on the ground` : `the things on the ground (${n})`;
        const pm = wood && ch.pileMesh ? ch.pileMesh(c.id) : null;
        out.push({ dist: hit.t, miss: hit.miss, target: { kind: 'pile', ref: c.id, label, e: { verb: 'Take one', why: top ? null : 'nothing there', run: () => { const r = this.requestTake(f, c, top.uid, { qty: 1 }); if (r && r.words) uiNote(r.words, 2.5); return !!(r && r.ok); } }, q: { verb: 'Open it', run: () => open(c) }, mesh: pm ? pm.layers[0] : f.view && f.view.objs.get(c.id) } });
        continue;
      }
      const room = this.slotFor(c);
      out.push({ dist: hit.t, miss: hit.miss, target: { kind: 'container', ref: c.id, label: `the ${nameOf(c.item)}`, e: { verb: 'Pick up', why: room ? null : 'your back and hands are full', run: () => { const r = this.requestTakeBox(f, c); if (r && r.words) uiNote(r.words, 2.5); return !!(r && r.ok); } }, q: { verb: 'Open it', run: () => open(c) }, mesh: f.view && f.view.objs.get(c.id) } });
    }
    this.hungTargets(near, out);
    // a friend's canoe lying by (beached, set down, at a dock): its load in the book, as our own canoe's "Unload it first"
    // --- round 3 (coop-boat.js): with the boat module the dot on a friend's canoe is our own canoe's verbs, there ---
    if (this.coop.boat) return out;
    // --- end round 3 ---
    for (const f of this.friends.values()) {
      const s = f.pub && f.pub.cn;
      if (!s || near.flat(s.x, s.z) > near.reach + 2.4) continue;
      const R = this.coop.remotes.get(f.id), B = R && R.boat, y = B && !B.hidden && B.root ? (B.root.getWorldPosition(_hv), _hv.y) : p.groundAt(s.x, s.z);
      const box = { x: s.x, y: y + 0.35, z: s.z, hx: 2.45, hy: 0.5, hz: 0.46, heading: s.heading || 0 };
      const hit = near.box(box);
      if (!hit) continue;
      const load = f.mirror.containers.filter((c) => c.where === 'canoe' && !STAY.has(c.item) && !this.taking(c.id));
      const first = load.find((c) => this.near(f, c));
      out.push({ dist: hit.t, miss: hit.miss, target: { kind: 'canoe', ref: `canoe:${f.id}`, label: load.length ? `the canoe (${load.length})` : 'the canoe, empty', e: { verb: 'Look in it', why: !load.length ? 'nothing in it' : first ? null : 'a step closer', run: () => { if (first) open(first); return !!first; } }, box } });
    }
    return out;
  }

  // --- canoes kept apart -------------------------------------------------------------------------------------------
  // The owner: "canoes overlap when docking". A friend's canoe (paddled, or set down where they left it) is solid to ours
  // and to our walker as a soft push apart, never a wall: each screen moves only its own, out of the overlap a little each
  // frame (the friend's screen does the same with theirs), the speed into it taken off; never pushed onto land afloat
  // or into the water on foot.
  keepApart(now) {
    const g = this.g, p = g.player, w = g.world;
    if (!p || p.teleporting || !w || typeof w.shoreAt !== 'function') return;
    const dt = this.apartT ? Math.min(0.1, Math.max(0, (now - this.apartT) / 1000)) : 0;
    this.apartT = now;
    if (!(dt > 0)) return;
    const afloat = p.mode === 'paddle' && !p.landing && !p.ashore, foot = p.mode === 'walk' || p.mode === 'carry';
    if (!afloat && !foot) return;
    const mine = afloat ? hullSeg(p.x, p.z, p.heading) : { ax: p.x, az: p.z, bx: p.x, bz: p.z };
    const r0 = afloat ? HULL_R : WALKER_R;
    this.n.pushes = this.n.pushes || 0;
    for (const f of this.friends.values()) {
      const R = this.coop.remotes.get(f.id), B = R && R.boat;
      if (!B || B.hidden || !Number.isFinite(B.x)) continue;
      if (Math.abs(B.x - p.x) > 8 || Math.abs(B.z - p.z) > 8) continue;
      const theirs = hullSeg(B.x, B.z, B.heading);
      const q = segSeg(mine, theirs), need = r0 + HULL_R;
      if (q.d >= need) continue;
      let nx = q.px - q.qx, nz = q.pz - q.qz, n = Math.hypot(nx, nz);
      // Hulls lying side by side (or one on the other) part sideways, each to its own side: the side the centres already
      // lean to, or, centre on centre, by the players' ids, so the two screens never push both canoes the same way
      const par = afloat && Math.abs(Math.sin(p.heading - B.heading)) < 0.5;
      if (par || n < 0.05) {
        // one axis on both screens: the side of the lower id's heading (as each screen sees it)
        const low = Number(this.coop.id) < Number(f.id), h = low ? p.heading : B.heading;
        const sx = Math.cos(h), sz = -Math.sin(h), lean = (p.x - B.x) * sx + (p.z - B.z) * sz;
        const sign = Math.abs(lean) > 0.05 ? Math.sign(lean) : (low ? 1 : -1);
        nx = sx * sign; nz = sz * sign; n = 1;
      }
      nx /= n; nz /= n;
      const step = Math.min(need - q.d, APART.most * dt) * (afloat ? 1 : 0.8);
      const x = p.x + nx * step, z = p.z + nz * step, sd = w.shoreAt(x, z);
      if (afloat ? sd > -0.6 : sd < -0.3) continue; // (not onto land afloat, nor into the lake on foot)
      p.x = x; p.z = z; this.n.pushes++;
      if (afloat && Number.isFinite(p.speed)) { const into = -(Math.cos(p.heading) * nx - Math.sin(p.heading) * nz); if (into > 0) p.speed *= Math.max(0, 1 - APART.brake * dt * into); }
    }
  }

  stats() {
    const r = this.n.rtt.slice().sort((a, b) => a - b);
    return { friends: [...this.friends.values()].map((f) => ({ id: f.id, name: f.name, containers: f.mirror.containers.length, long: f.mirror.long.length, tent: f.tent ? f.tent.stage : null, fires: [...f.fires.keys()] })), pending: this.pending.size, ...this.n, rtt: this.n.rtt.slice(), rttMed: r.length ? r[r.length >> 1] : null };
  }
}
