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
//   opr   the owner's answer (m.to the asker): { rid, ok, entry: { id, qty, data, rot }, why }
//
//   const share = new CoopShare(coop)   (main.js, once coop.g has the camp modules); share.stats() for the tests
import { ContainerView } from './containers.js';
import { itemDef } from './items.js';
import { tentPose } from './props.js';
import { tentOf } from './tent.js';
import { REACH, HULL_REACH } from './inventory.js';
import { attach as uiAttach, refresh as uiRefresh, note as uiNote } from './inv-ui.js';

const PUB_MS = 250;            // at most 4 a second
const OP_TIMEOUT = 3000;       // ms: a request with no answer is undone
const TENT_REACH = 4;          // m: a friend's tent's insides within reach (inventory.js TENT_REACH)
const PUBLIC = new Set(['ground', 'hung', 'tent', 'canoe']);
const AT_KEYS = ['x', 'y', 'z', 'heading', 'fuel', 'grate', 'ring', 'tree', 'limb', 'up', 'camp'];
const NAMES = { pack3: 'pack', pack4: 'pack', packdry: 'dry bag', barrel30: 'barrel', barrel60: 'barrel', bucket: 'bucket', tacklebox: 'tackle box', stringer: 'stringer', mapcase: 'map case', pile: 'things', firefuel: 'fire', grate: 'grate' };
const pfx = (peer) => `p${peer}:`;
const unpfx = (s) => String(s).replace(/^p[^:]*:/, '');
const pickAt = (at) => { if (!at) return null; const o = {}; for (const k of AT_KEYS) if (at[k] !== undefined) o[k] = at[k]; return o; };
const possessive = (name) => `${name}’${/s$/i.test(name) ? '' : 's'}`;

// A friend's things on the ground, hung, in piles and on grates, drawn as ours are (containers.js), from their pub
class FriendView extends ContainerView {
  afterPose() {
    const inv = this.inv, p = this.player, seen = new Set(), used = new Set();
    let ropes = 0;
    for (const c of inv.containers) {
      if (!((c.where === 'ground' || c.where === 'hung') && c.at)) continue;
      if (Math.abs(c.at.x - p.x) > 200 || Math.abs(c.at.z - p.z) > 200) continue;
      if (c.item === 'pile') { if (c.grid.length) { const o = this.looseMesh(c.id, { inObjs: true }); seen.add(c.id); this.drawPile(o, c); } continue; }
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
    if (g.chores) g.chores.friendRing = (key) => !!this.friendBin(key);
    uiAttach({ coopTabs: { tabs: () => this.tabs(), sig: () => this.tabSig() } });
    this.hookNearby();
  }
  get g() { return this.coop.g; }
  hookNearby() {
    const nb = window.__game && window.__game.nearby;
    if (nb && nb.hooks && !nb.hooks.friendFire) nb.hooks.friendFire = (key, site) => this.fireObject(key, site);
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
    const p = g.player, d = p && p.carry && p.carry.drop;
    const cn = d && Number.isFinite(d.x) && p.mode !== 'paddle' && p.mode !== 'carry' ? { x: d.x, z: d.z, heading: d.heading || 0 } : null;
    return { c, l, tent, tarps, fires, cn };
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
        this.sent.tk[k] = JSON.stringify(ch.s.taken[k]);
      }
      for (const [k, v] of Object.entries(m.sw || {})) {
        if (!v || !Number.isFinite(v.day)) continue;
        const cur = ch.s.sawn[k];
        let next = v;
        if (cur && cur.day > v.day) next = cur;
        else if (cur && cur.day === v.day) next = { day: v.day, cuts: Math.max(cur.cuts || 0, v.cuts || 0), ...((cur.poles || v.poles) ? { poles: Math.max(cur.poles || 0, v.poles || 0) } : {}) };
        if (JSON.stringify(next) !== JSON.stringify(cur)) { ch.s.sawn[k] = next; wood = true; }
        this.sent.sw[k] = JSON.stringify(ch.s.sawn[k]);
      }
    }
    if (fo && fo.s) {
      for (const [k, v] of Object.entries(m.pk || {})) {
        if (!Array.isArray(v) || v.length !== 2) continue;
        const cur = fo.s.picked[k];
        if (!cur || v[0] > cur[0] || (v[0] === cur[0] && v[1] > cur[1])) { fo.s.picked[k] = [v[0] | 0, v[1] | 0]; forage = true; }
        this.sent.pk[k] = JSON.stringify(fo.s.picked[k]);
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

  // --- every frame in a room ----------------------------------------------------------------------------------------
  tick(now) {
    if (!this.coop.live) return;
    if (!this.hooked) this.hooked = this.hookNearby();
    this.publish(now);
    for (const f of this.friends.values()) {
      if (f.view) { try { f.view.afterPose(); } catch (e) { if (!this.warned) { this.warned = true; console.warn('coop-share: a friend’s things', e); } } }
      try { this.drawTent(f); } catch (e) { if (!this.warnedT) { this.warnedT = true; console.warn('coop-share: a friend’s tent', e); } }
    }
    for (const [rid, q] of this.pending) if (now - q.t0 > OP_TIMEOUT) this.expire(rid, 'timeout');
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
    return this.reachable().map(({ f, c }) => {
      const r = f.mirror.root(c), nm = NAMES[c.item] || String((itemDef(c.item) || {}).short || (itemDef(c.item) || {}).name || 'pack').toLowerCase();
      const sub = c.where === 'in' ? 'inside another' : r.where === 'canoe' ? 'in their canoe' : r.where === 'tent' ? 'in their tent' : r.where === 'hung' ? 'hung up' : 'on the ground';
      return { key: c.id, kind: 'friend', label: `${possessive(f.name)} ${nm}`, sub, bin: this.binOf(f, c) };
    });
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
      drop: ({ cId, uid, itemId, qty }) => this.requestPut(f, c, { cId, uid, itemId, qty }),
    };
  }

  // --- requests to a thing's owner ----------------------------------------------------------------------------------
  requestTake(f, c, uid, { toCId = null, x = null, y = null, rot = 0, qty = null } = {}) {
    if (String(uid).startsWith('pend:')) return { ok: false, words: 'A moment: it is on its way.' };
    const e = c.grid.find((q) => q.uid === uid);
    if (!e) return { ok: false, words: 'That is gone.' };
    const rid = `${this.coop.id}:${this.rid++}`;
    const sent = this.coop.send({ t: 'op', to: f.id, rid, op: 'take', cId: unpfx(c.id), uid: unpfx(uid), qty: qty || e.qty });
    if (!sent) return { ok: false, words: 'Not now: the connection is down.' };
    this.pending.set(rid, { rid, op: 'take', to: f.id, cId: c.id, uid, t0: performance.now(), toCId, x, y, rot, qty: qty || e.qty, itemId: e.id });
    this.ver++;
    return { ok: true, words: `Asking ${f.name} for the ${(itemDef(e.id) || {}).name || 'thing'}…` };
  }
  requestPut(f, c, { cId, uid, itemId, qty }) {
    const inv = this.g.inventory, d = itemDef(itemId), spec = (itemDef(c.item) || {}).container || {};
    if (!d || d.kind === 'container' || d.kind === 'long') return { ok: false, words: 'That does not go in there.' };
    if (spec.accepts && !spec.accepts.includes(d.kind)) return { ok: false, words: `The ${NAMES[c.item] || 'container'} won’t take that.` };
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
    return { ok: true, words: `Into ${possessive(f.name)} ${NAMES[c.item] || 'pack'}…` };
  }
  // the owner's side: applied to our own inventory at once, answered
  gotOp(m) {
    this.n.opIn++;
    const inv = this.g.inventory, reply = (r) => this.coop.send({ t: 'opr', to: m.from, rid: m.rid, ...r });
    const c = inv && inv.cont(m.cId);
    if (!c || !PUBLIC.has(inv.rootWhere(c))) return reply({ ok: false, why: 'It isn’t there any more.' });
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
      else uiNote(m.why || 'They kept it.', 3);
    } else if (q.op === 'put') {
      if (!m.ok) { this.giveBack(q.item, q.back); uiNote(`${m.why || 'It won’t go in.'} It is back with you.`, 3); }
    }
    uiRefresh();
  }
  // an answer after we gave up: a take is landed all the same (it left its owner); a put we gave back is taken again
  late(m) {
    const q = this.expired && this.expired.get(m.rid);
    if (!q) return;
    this.expired.delete(m.rid);
    if (q.op === 'take' && m.ok && m.entry) uiNote(this.land(m.entry, q), 3);
    if (q.op === 'put' && m.ok && q.returned) { const inv = this.g.inventory; if (inv.cont(q.returned.cId)) inv.take(q.returned.cId, q.returned.uid, q.item.qty); }
    uiRefresh();
  }
  expire(rid, why) {
    const q = this.pending.get(rid);
    if (!q) return;
    this.pending.delete(rid);
    this.n.timeouts++;
    if (q.op === 'put') q.returned = this.giveBack(q.item, q.back);
    if (!this.expired) this.expired = new Map();
    this.expired.set(rid, q);
    uiNote(why === 'gone' ? 'They have gone.' : 'No answer: try again.', 3);
    this.ver++;
    uiRefresh();
  }
  // a thing come to us: where it was dropped, else the first room there, else the best place on us, else a hand, else a
  // pile at our feet. → the words
  land(entry, { toCId = null, x = null, y = null, rot = 0 } = {}) {
    const inv = this.g.inventory, p = this.g.player, id = entry.id, data = entry.data || null, name = (itemDef(id) || {}).name || 'It';
    let left = Math.max(1, entry.qty | 0);
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
  // the fire card at a friend's ring (nearby.js fireObject): their fuel as a bin fed by request, our own grate over it
  fireObject(key, site) {
    if (this.ownBin(key)) return null;
    const fb = this.friendBin(key);
    if (!fb) return null;
    const g = this.g, ch = g.chores, F = g.fires, ck = ch && ch.cook, nb = window.__game && window.__game.nearby;
    const grate = ch.grate(key, site);
    if (!grate) return null;
    const bin = this.binOf(fb.f, fb.c, { accepts: ['firewood'] });
    const units = ch.binUnits({ grid: fb.c.grid.filter((e) => !e.box) });
    const st = F.state(key), need = F.ringNeed(key, units);
    return {
      id: `fire:${key}`, kind: 'fire', title: `${possessive(fb.f.name)} fire`, key, state: st,
      slots: [
        { ...bin, id: 'fuel', label: 'Fuel' },
        { id: 'grate', label: 'Grate', cId: grate.id, accepts: ['fish', 'food', 'tool', 'container'] },
        ...(ck && typeof ck.potsOn === 'function' ? ck.potsOn(key) : []).map((c) => ({ id: `pot:${c.id}`, label: (itemDef(c.item) || {}).short || (itemDef(c.item) || {}).name || 'Pot', cId: c.id, pot: true, accepts: ['meal', 'fish', 'food', 'water'], cooking: ck.cookingOf(c.id) })),
      ],
      actions: [],
      need: nb && typeof nb.askWood === 'function' ? nb.askWood(need) : need,
      burn: F.burn(key, units), coals: F.coals(key),
      cooking: ck ? (typeof ck.potsOn === 'function' ? ck.cookingNow(key, { grateOnly: true }) : ck.cookingNow(key)) : null,
      friend: fb.f.id,
    };
  }

  stats() {
    const r = this.n.rtt.slice().sort((a, b) => a - b);
    return { friends: [...this.friends.values()].map((f) => ({ id: f.id, name: f.name, containers: f.mirror.containers.length, long: f.mirror.long.length, tent: f.tent ? f.tent.stage : null, fires: [...f.fires.keys()] })), pending: this.pending.size, ...this.n, rtt: this.n.rtt.slice(), rttMed: r.length ? r[r.length >> 1] : null };
  }
}
