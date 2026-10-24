// The things near you that the book works (the owner's second feedback of 2026-10-24: "What I'd much rather have is I'd
// open my inventory up when I'm near the fire and I drag food onto the fire. or drag logs onto the fire", "your
// inventory is like your interaction space", and "just don't make E interact be the only way to interact with it").
// The camp's work is done from the book's pack side (inv-ui.js, stream B, renders these as panels beside your
// containers), never on E: the fire's fuel and grate, cooking and eating, the tent's pitch and strike and the night, the
// barrel's hang, the latrine, loading the canoe, filling the bottle, the saw. Held work keeps hold.js's ring: a held
// button in the book puts the pseudo key 'BookHold' in input.down while the mouse is down on it (E held counts too).
//
//   import { nearby } from './nearby.js';
//   nearby.attach({ camp, packs, journal, hud, pointer, canoe, player, inventory })   (main.js, fb2 A)
//   nearby.objects() -> [{ id, kind, title, sub?, slots?, actions, meter?, cooking?, focus? }]
//     kind     'fire' | 'tent' | 'latrine' | 'hangTree' | 'barrelHung' | 'canoe' | 'water' | 'downLog'
//     slots    the fire's: [{ id: 'fuel' | 'grate' | 'ash', label, accepts: [kinds], cId?, items?, words? }]: the fuel and
//              the grate are fixed inventory containers at the ring (chores.js firefuel, items.js grate: a drop is
//              inventory.move); the ash is words only
//     actions  [{ id, label, enabled, why?, hint?, held?, job? (hold.js's id while it runs), closeBook?, run(opts) }]
//              opts: { key } the held key ('BookHold'); closeBook: close the book first (it walks you, or a card opens)
//     meter    the fire's: { value 0..1, label, words }; cooking: { value 0..1, words } while the pot is on
//     focus    the one E opened the book at (pointed at the fire ring, the tent, the latrine, a tree, a hung barrel)
//   nearby.itemActions(ref) -> [{ id, label, enabled, why?, closeBook?, held?, run }]   ref: { cId, uid, itemId } |
//              { container: cId } | { long: uid }: a tent's Pitch, a barrel's Hang, wood onto the fire, a meal onto the grate
//   nearby.groundPieces() -> [{ uid: 'piece:<key>', id, at }]: the loose wood within reach (the book's Ground area)
//   nearby.takePiece(uid, toCId, x?, y?, rot?) -> { ok, words }
//   nearby.onChange(fn) -> off: the set, or something in it, changed (read objects() again)
//   nearby.targets(ray, near)  the pointer's provider (pointer.js): what lies on the ground (E Pick up), the canoe (E Get
//              in, or shoulder it), and the camp's things whose work is the book's (E Open: the book at its panel)
//   nearby.update(dt)  main.js, after the camp: the change signal, the stations no one is near tidied away
import * as THREE from 'three';
import { hold } from './hold.js';
import { itemDef } from './items.js';
import { inventory as INVENTORY } from './inventory.js';
import { campKey, AREA_R } from './camp.js';
import { BARRELS } from './hang.js';
import { tentOf } from './tent.js';
import { eatName } from './cook.js';

const FIRE_PANEL = 4;        // m from the ring within which its panel is in the book
const LATRINE_PANEL = 6;     // m from the box within which its Use walks you to it
const SAW_PANEL = 1.6;       // m from a down log's stem (the saw's)
const HULL_REACH = 3;        // m from the canoe's keel line (inventory.js HULL_REACH)
const PIECE_REACH = 3;       // m: the loose wood the Ground area lists (inventory.js REACH)
const POINT = { fire: 3.0, tent: 4.2, latrine: 2.8, hung: 3.4, log: 1.8 }; // m within which E opens the book at them
const BURN_FULL = 6;         // game hours of wood the fire's meter calls full
const FOOD = new Set(['meal', 'fish']);
const lower = (s) => String(s).charAt(0).toLowerCase() + String(s).slice(1);
const thingName = (d) => (!d ? 'thing' : /^(Duluth|Johnson)/.test(d.name) ? d.name : d.id === 'pile' ? 'things on the ground' : lower(d.short && d.kind !== 'container' ? d.name : d.name));
const hoursWords = (h) => (h < 0.75 ? 'half an hour' : h < 1.25 ? 'an hour' : `${Math.round(h * 2) / 2} h`.replace('.5 h', '½ h'));
const _m = new THREE.Matrix4(), _one = new THREE.Vector3(1, 1, 1), _v = new THREE.Vector3();
// a container's size on the ground, for the dot: [height of its middle, radius]
const BODY = { pack3: [0.32, 0.42], pack4: [0.34, 0.46], barrel30: [0.24, 0.3], barrel60: [0.32, 0.38], bucket: [0.14, 0.24], tacklebox: [0.1, 0.24], mapcase: [0.1, 0.24], pile: [0.12, 0.42], woodarms: [0.12, 0.4] };

class Nearby {
  constructor() {
    this.handlers = new Set();
    this.focus = null;
    this.list = null; this.t = 0; this.sig = ''; this.tidyT = 0;
    this.attached = false;
    this.targets = (ray, near) => this.pointTargets(ray, near);
  }
  attach({ camp, packs, journal = null, hud = null, pointer = null, canoe = null, player = null, inventory = INVENTORY }) {
    Object.assign(this, { camp, packs, journal, hud, pointer, canoe, player: player || camp.player, inv: inventory });
    this.attached = true;
    if (pointer) {
      pointer.isArmed = () => !!(camp.pitching || camp.hang.armed);
      pointer.onCancel = () => camp.cancelPitch('You leave the tent where it was.') || camp.hang.disarm();
      // no dot while a card is up at camp: the wake-time card, the night's card, a fade
      pointer.quiet = () => !!((camp.chores && camp.chores.card && camp.chores.card.open) || camp.night || (camp.veil && camp.veil.active) || (camp.card && camp.card.active));
    }
    camp.pointer = pointer;
    return this;
  }
  get chores() { return this.camp.chores; }
  get cook() { return this.camp.chores.cook; }
  get fires() { return this.camp.fires; }
  onChange(fn) { this.handlers.add(fn); return () => this.handlers.delete(fn); }
  emit() { for (const f of this.handlers) { try { f(this); } catch (e) { console.warn('nearby onChange', e); } } }
  // the hold's keys from the book: its own pseudo key, and E and a click on the scene besides
  keys(o) { const k = (o && o.key) || 'KeyE'; return { key: k, keys: ['KeyE', 'Mouse0', k] }; }
  inv0() { const i = this.inv; return i && i.attached ? i : null; }
  site(r) { const p = this.player, c = this.camp, s = c.nearestSite(p.x, p.z, r, true); if (!s) return null; const h = c.registry.holder(campKey(s)); return !h || h === 'player' ? s : null; }

  // --- the panels ------------------------------------------------------------------------------------------------
  objects() {
    if (!this.attached) return [];
    const now = performance.now();
    if (this.list && now - this.t < 120) return this.list;
    this.t = now;
    this.list = this.build();
    return this.list;
  }
  build() {
    const p = this.player, out = [];
    if (!p || p.mode !== 'walk' || p.teleporting || !this.inv0()) return out;
    const add = (o) => { if (o) out.push(o); };
    add(this.fireObject());
    add(this.camp.tentPanel());
    for (const o of this.camp.hang.panels((o2) => this.keys(o2))) out.push(o);
    add(this.canoeObject());
    add(this.latrineObject());
    add(this.waterObject());
    add(this.logObject());
    for (const o of out) if (o.id === this.focus) o.focus = true;
    return out;
  }
  fireObject() {
    const site = this.site(FIRE_PANEL);
    if (!site || !site.layout) return null;
    const key = campKey(site), ch = this.chores, ck = this.cook, F = this.fires;
    const bin = ch.fuelBin(key, site), grate = ch.grate(key, site);
    if (!bin || !grate) return null;
    const info = ch.fireInfo(key), st = info.state, og = ck.onGrate(key), P = ck.pot && ck.pot.key === key ? ck.pot : null;
    const lightWhy = ch.lightProblem(key), cookWhy = ck.cookProblem(site, key);
    const sub = st === 'burning' ? `burning · about ${hoursWords(info.hours)} of wood` : st === 'coals' ? 'the coals still smoking' : info.units.length ? `laid, not lit · ${ch.woodWords(info.units)}` : 'cold';
    const actions = [
      { id: 'light', label: st === 'coals' ? 'Light it again' : 'Light', held: true, job: 'fire-light', enabled: !lightWhy, why: lightWhy, run: (o) => ch.light(site, key, this.keys(o)) },
      { id: 'cook', label: ck.cookLabel(key), enabled: !cookWhy, why: cookWhy, run: () => ck.cookNow(site, key) },
    ];
    if (og.food) actions.push({ id: 'eat', label: `Eat the ${eatName(itemDef(og.food.id))}`, closeBook: true, enabled: !ck.busy, why: ck.busy ? 'a moment' : null, hint: 'on the bench by the fire', run: () => ck.eatAt(site, key) });
    actions.push({ id: 'douse', label: 'Douse', held: true, job: 'fire-out', enabled: st === 'burning' || st === 'coals', why: 'there is no fire to put out', run: (o) => ch.douse(site, key, this.keys(o)) });
    const ash = st === 'burning' ? 'embers under the flames' : st === 'coals' ? 'hot coals under the ash' : F.get(key) && !F.get(key).laid ? 'warm ash' : 'cold ash';
    return {
      id: `fire:${key}`, kind: 'fire', title: 'The fire ring', sub, key,
      slots: [
        { id: 'fuel', label: 'Fuel', cId: bin.id, accepts: ['firewood'], words: info.units.length ? ch.woodWords(info.units) : 'dead branches and short logs' },
        { id: 'grate', label: 'The grate', cId: grate.id, accepts: ['meal', 'fish', 'food', 'tool'], words: og.food ? 'ready' : P ? (P.cold ? 'the fire is too low under it' : 'cooking') : 'a meal or a fish, the pot' },
        { id: 'ash', label: 'The ash', accepts: [], items: [], words: ash },
      ],
      actions,
      meter: { value: Math.min(1, info.hours / BURN_FULL), label: 'Burn', words: st === 'burning' ? `about ${hoursWords(info.hours)} of wood` : info.fuel ? `${hoursWords(info.fuel)} of wood laid` : 'no wood' },
      cooking: P && !P.done ? { value: Math.min(1, P.t / P.dur), words: P.cold ? 'the fire is too low under it' : `ready in ${Math.max(1, Math.ceil(P.dur - P.t))} s` } : null,
      state: st,
    };
  }
  latrineObject() {
    const site = this.site(AREA_R), p = this.player;
    const L = site && site.layout && site.layout.latrine;
    if (!L || Math.hypot(L.x - p.x, L.z - p.z) > LATRINE_PANEL) return null;
    const busy = !!(hold.active || this.cook.busy), used = this.chores.usedLatrine();
    return { id: `latrine:${campKey(site)}`, kind: 'latrine', title: 'The latrine', sub: `the box back in the trees${used ? ' · used today' : ''}`, actions: [
      { id: 'use', label: 'Use', closeBook: true, enabled: !busy, why: busy ? 'a moment' : null, hint: 'ten quiet minutes', run: () => this.chores.latrine(site) },
    ] };
  }
  canoeObject() {
    const p = this.player, c = p.carry, d = c && c.drop, inv = this.inv0();
    if (!d || !inv || this.packs.busy) return null;
    const s = inv.canoeSpot();
    if (!s || inv.hullDist(s, p.x, p.z) > HULL_REACH) return null;
    const lo = this.packs.loadables(d).filter((u) => !this.packs.autoLoads(u));
    if (!lo.length) return null;
    const kg = Math.round(lo.reduce((k, u) => k + this.packs.weightOf(u), 0));
    return { id: 'canoe', kind: 'canoe', title: 'The canoe', sub: `${lo.length === 1 ? 'one thing' : `${lo.length} things`} set out about it · ${kg} kg`, actions: [
      { id: 'load', label: 'Load everything here', held: true, job: 'load', enabled: true, run: (o) => hold.begin({ ...this.packs.loadAllOpts(d, lo), ...this.keys(o) }) },
    ] };
  }
  waterObject() {
    const b = this.camp.bottleHere();
    if (!b) return null;
    const busy = !!(this.camp.busy || hold.active);
    return { id: 'water', kind: 'water', title: 'The water’s edge', sub: b.words, actions: [
      { id: 'fill', label: 'Fill the bottle', enabled: !busy, why: busy ? 'a moment' : null, run: () => this.camp.fillBottle(b.wait) },
    ] };
  }
  logObject() {
    const s = this.chores.sawTarget(SAW_PANEL);
    if (!s) return null;
    return { id: `downLog:${s.k}`, kind: 'downLog', title: 'A down spruce', sub: s.left ? `${s.left === 3 ? 'three' : s.left === 2 ? 'two' : 'one'} short ${s.left === 1 ? 'log' : 'logs'} in it, with the folding saw` : 'sawn into lengths already', actions: [
      { id: 'saw', label: 'Saw it into lengths', held: true, job: 'saw', enabled: s.left > 0, why: 'sawn already: it grows no more till another day', run: (o) => this.chores.beginSaw(s.log, s.k, s.cuts, this.keys(o)) },
    ] };
  }

  // --- a thing's own actions (the book's right-click) -------------------------------------------------------------
  itemActions(ref) {
    const inv = this.inv0(), out = [];
    if (!inv || !ref) return out;
    if (ref.container) {
      const c = inv.cont(ref.container);
      if (c && BARRELS[c.item] && c.where !== 'hung') {
        const why = this.camp.hang.hangRefused(c.id);
        out.push({ id: 'hang', label: 'Hang it from a tree', closeBook: true, enabled: !why, why, run: () => this.camp.hang.arm(c.id) });
      }
      return out;
    }
    if (ref.long) return out;
    let c = ref.cId != null ? inv.cont(ref.cId) : null, e = c ? c.grid.find((q) => q.uid === ref.uid) : null;
    if (!e) { const hit = inv.findUid(ref.uid); if (hit) { c = hit.c; e = hit.e; } }
    if (!e || e.box) return out;
    const d = itemDef(e.id);
    if (!d) return out;
    if (d.slot === 'tent') {
      const why = this.camp.pitchRefused(this.camp.tentByUid(e.uid));
      out.push({ id: 'pitch', label: 'Pitch', closeBook: true, enabled: !why, why, run: () => this.camp.beginPitch(e.uid) });
    }
    // by a fire ring: wood onto the fire, a meal or a fish onto the grate
    const site = this.site(FIRE_PANEL);
    if (site && site.layout) {
      const key = campKey(site), ch = this.chores, bin = ch.fuelBin(key, site), grate = ch.grate(key, site);
      if (d.kind === 'firewood' && bin && c !== bin) out.push(this.moveAction('fuel', 'Put it on the fire', c, e, bin, 'the ring is full'));
      if (FOOD.has(d.kind) && d.eat && d.eat.cook && grate && c !== grate) out.push(this.moveAction('grate', 'Put it on the grate', c, e, grate, 'the grate is full'));
    }
    return out;
  }
  moveAction(id, label, from, e, to, full) {
    const inv = this.inv, spot = inv.firstFit(to, e.id);
    return { id, label, enabled: !!spot, why: spot ? null : full, run: () => { const s = inv.firstFit(to, e.id); return !!(s && inv.move(from.id, e.uid, to.id, s.x, s.y, s.rot, 1)); } };
  }

  // --- the loose wood, for the book's Ground area -------------------------------------------------------------------
  groundPieces() {
    const p = this.player, ch = this.chores, out = [];
    if (!p || p.mode !== 'walk') return out;
    for (const pc of ch.near) if (ch.available(pc) && Math.hypot(pc.x - p.x, pc.z - p.z) <= PIECE_REACH) out.push({ uid: `piece:${pc.key}`, id: pc.kind === 'log' ? 'wood:log' : 'wood:branch', at: { x: pc.x, z: pc.z } });
    return out;
  }
  pieceOf(uid) { const k = String(uid).replace(/^piece:/, ''); return this.chores.near.find((pc) => pc.key === k) || null; }
  takePiece(uid, toCId = null, x = null, y = null, rot = 0) {
    const inv = this.inv0(), pc = this.pieceOf(uid), ch = this.chores;
    if (!inv || !pc || !ch.available(pc)) return { ok: false, words: 'That is gone.' };
    const id = pc.kind === 'log' ? 'wood:log' : 'wood:branch';
    if (toCId == null) { ch.pickUp(pc); return { ok: true, words: '' }; }
    const to = inv.cont(toCId);
    if (!to) return { ok: false, words: '' };
    const spot = x != null && inv.fits(to, id, x, y, rot) ? { x, y, rot } : inv.firstFit(to, id);
    if (!spot || !inv.put(to, id, { x: spot.x, y: spot.y, rot: spot.rot, quiet: true })) return { ok: false, words: 'No room there.' };
    ch.claimPiece(pc); ch.persist(); inv.emit('items');
    return { ok: true, words: '' };
  }

  // --- the dot (pointer.js provider) -----------------------------------------------------------------------------
  // the book open at a panel (E Open)
  openAt(id) {
    this.focus = id; this.list = null;
    const j = this.journal;
    if (j) { if (j.open && j.side === 'pack') j.setSide('pack'); else j.show('pack'); }
    this.emit();
  }
  pointTargets(ray, near) {
    const p = this.player, inv = this.inv0(), out = [];
    if (!inv || p.mode !== 'walk' || hold.active || this.cook.busy) return out;
    const push = (hit, target) => { if (hit) out.push({ dist: hit.t, miss: hit.miss, target }); };
    const view = typeof window !== 'undefined' && window.__game ? window.__game.invView : null;
    const ch = this.chores, packs = this.packs;
    // the things set down on the ground in reach: pick them up
    for (const u of packs.units()) {
      const o = u.obj, at = o.at;
      if (o.where !== 'ground' || !at || (u.def.fixed && u.id !== 'pile') || near.flat(at.x, at.z) > near.reach) continue;
      const y = Number.isFinite(at.y) ? at.y : p.groundAt(at.x, at.z);
      if (u.kind === 'long') {
        const fx = Math.cos(at.heading || 0), fz = -Math.sin(at.heading || 0);
        const hit = near.segment(at.x - fx * 0.95, y + 0.04, at.z - fz * 0.95, at.x + fx * 0.95, y + 0.04, at.z + fz * 0.95, 0.2);
        push(hit, { kind: 'item', ref: u.ref, label: `the ${thingName(u.def)}`, verb: 'Pick up', enabled: inv.freeHand() >= 0, why: 'both hands are full', mesh: view && view.objs && view.objs.get(u.ref), act: () => packs.pickUp(u) });
        continue;
      }
      const wood = ch.woodOnly(o), [h, r] = wood ? [0.18, 0.5] : BODY[u.id] || [0.2, 0.36];
      const hit = near.sphere(at.x, y + h, at.z, r);
      if (!hit) continue;
      if (wood) {
        const e = o.grid.find((q) => q.id === 'wood:log') || o.grid[0], n = ch.pieceCount(o), pm = ch.pileMesh(o.id);
        const room = !!(ch.armFor(e.id, false) || inv.freeHand() >= 0);
        push(hit, { kind: 'item', ref: o.id, label: `a ${e.id === 'wood:log' ? 'log' : 'branch'} from the woodpile (${n})`, verb: 'Pick up', enabled: room, why: 'your hands are full', box: { x: at.x, y: y + 0.18, z: at.z, hx: 0.42, hy: 0.2, hz: 0.42, heading: (at.heading || 0) }, mesh: pm ? pm.layers[0] : null, act: () => this.fromPile(o, e) });
        continue;
      }
      const room = u.id === 'pile' || !!packs.slotFor(u);
      push(hit, { kind: 'container', ref: o.id, label: u.id === 'pile' ? 'the things on the ground' : `the ${thingName(u.def)}`, verb: 'Pick up', enabled: room, why: 'your back and hands are full', mesh: view && view.objs && view.objs.get(o.id), act: () => packs.pickUp(u) });
    }
    // the loose wood
    for (const pc of ch.near) {
      if (!ch.available(pc) || near.flat(pc.x, pc.z) > near.reach) continue;
      const fx = Math.cos(pc.yaw), fz = -Math.sin(pc.yaw), L = pc.len / 2, r = pc.kind === 'log' ? 0.17 : 0.14;
      const hit = near.segment(pc.x - fx * L, pc.y + 0.05, pc.z - fz * L, pc.x + fx * L, pc.y + 0.05, pc.z + fz * L, r);
      if (!hit) continue;
      _m.compose(pc.pos, pc.q, _one);
      push({ t: hit.t, miss: hit.miss * 0.85 }, { kind: 'item', ref: `piece:${pc.key}`, label: pc.kind === 'log' ? 'Short log' : 'Dead branch', verb: 'Pick up', enabled: ch.canTakePiece(pc), why: 'your hands are full, and nothing you carry has room', shell: { geometry: ch.pieceGeos[pc.g], matrix: _m.clone() }, act: () => ch.pickUp(pc) });
    }
    // the canoe lying by (or floated at a dock's side): get in, or shoulder it
    const c = p.carry, d = c && c.drop, s = d && inv.canoeSpot();
    if (d && s && inv.hullDist(s, p.x, p.z) <= HULL_REACH) {
      const hull = this.canoe && this.canoe.hull, hy = hull ? (hull.getWorldPosition(_v), _v.y) : p.groundAt(d.x, d.z);
      const hit = near.box({ x: d.x, y: hy + 0.22, z: d.z, hx: 2.45, hy: 0.3, hz: 0.46, heading: d.heading || 0 });
      const a = packs.hullAction();
      if (hit && a) push(hit, { kind: 'canoe', ref: 'canoe', label: a.label, verb: a.verb, hint: a.hint || null, mesh: this.hullMesh(), box: { x: d.x, y: hy + 0.22, z: d.z, hx: 2.45, hy: 0.3, hz: 0.46, heading: d.heading || 0 }, act: a.run });
    }
    // the camp's things whose work is the book's: E opens it at their panel
    const site = this.site(AREA_R);
    if (site && site.layout) {
      const L = site.layout, key = campKey(site), f = L.fire;
      if (near.flat(f.x, f.z) <= POINT.fire) {
        // what is on the grate, to take off it: the cooked thing first, a raw one, the pot
        const og = this.cook.onGrate(key), gs = this.cook.grateSpot(site), P = this.cook.pot && this.cook.pot.key === key && !this.cook.pot.done;
        const top = og.food || (!P && og.g && og.g.grid.find((q) => !q.box && q.id !== 'pot')) || (!P && og.pot) || null;
        const gh = top ? near.sphere(gs.x, gs.y + 0.07, gs.z, 0.2) : null;
        if (gh) {
          const dd = itemDef(top.id), name = top.id === 'pot' ? 'the cook pot' : dd && dd.cooked ? `the ${eatName(dd)}` : `the ${lower(dd ? dd.name : 'thing')}`;
          push({ t: gh.t, miss: gh.miss * 0.7 }, { kind: 'item', ref: `grate:${top.uid}`, label: `${name}, off the grate`, verb: 'Pick up', box: { x: gs.x, y: gs.y + 0.06, z: gs.z, hx: 0.11, hy: 0.07, hz: 0.11, heading: 0 }, act: () => this.offGrate(key, top) });
        }
        push(near.sphere(f.x, f.y + 0.22, f.z, 0.85), { kind: 'fire', ref: `fire:${key}`, label: 'The fire ring', verb: 'Open', hint: this.fireHint(key), box: { x: f.x, y: f.y + 0.16, z: f.z, hx: 0.62, hy: 0.18, hz: 0.62, heading: f.a || 0 }, act: () => this.openAt(`fire:${key}`) });
      }
      const la = L.latrine;
      if (la && near.flat(la.x, la.z) <= POINT.latrine) {
        const gy = p.groundAt(la.x, la.z);
        push(near.box({ x: la.x, y: gy + 0.24, z: la.z, hx: 0.34, hy: 0.26, hz: 0.34, heading: 0 }), { kind: 'latrine', ref: `latrine:${key}`, label: 'The latrine', verb: 'Open', box: { x: la.x, y: gy + 0.24, z: la.z, hx: 0.34, hy: 0.26, hz: 0.34, heading: 0 }, act: () => this.openAt(`latrine:${key}`) });
      }
    }
    // your tent
    const t = this.camp.camp;
    if (t && t.stage > 0 && near.flat(t.x, t.z) <= POINT.tent) {
      const size = tentOf(t.item).size, hd = Math.atan2(-t.fdx, -t.fdz), y = (t.y || p.groundAt(t.x, t.z)) + size.h * 0.45;
      const b = { x: t.x, y, z: t.z, hx: size.a + 0.05, hy: size.h * 0.5, hz: size.b + 0.05, heading: hd };
      push(near.box(b), { kind: 'tent', ref: 'tent', label: 'Your tent', verb: 'Open', hint: tentOf(t.item).words[t.stage], mesh: t.stages && t.stages.fly && t.stage >= 4 ? t.stages.fly : null, box: b, act: () => this.openAt('tent') });
    }
    // a hung barrel overhead, or the tree you could hang one from
    const hg = this.camp.hang;
    const hung = hg.hungNear(p.x, p.z);
    if (hung && near.flat(hung.at.x, hung.at.z) <= POINT.hung) {
      // the barrel, or the trunk its rope is tied off on (3 m up, the barrel alone is out of the third-person ray's
      // reach from within POINT.hung: the camera looking up sinks behind you and its ray rises only so far)
      const tt = hung.at.tree, ty = tt ? p.groundAt(tt.x, tt.z) : 0;
      const hits = [near.sphere(hung.at.x, hung.at.y, hung.at.z, 0.45), tt ? near.segment(tt.x, ty + 0.3, tt.z, tt.x, ty + 2.4, tt.z, (tt.r || 0.25) + 0.2) : null].filter(Boolean);
      push(hits.sort((a, b) => a.miss - b.miss)[0] || null, { kind: 'barrelHung', ref: `barrelHung:${hung.id}`, label: 'The barrel, hung', verb: 'Open', mesh: view && view.objs && view.objs.get(hung.id), act: () => this.openAt(`barrelHung:${hung.id}`) });
    }
    const bar = hg.barrelToHang(), tr = bar && !hung ? hg.treeFor(bar) : null;
    if (tr) {
      const gy = p.groundAt(tr.t.x, tr.t.z);
      push(near.segment(tr.t.x, gy + 0.3, tr.t.z, tr.t.x, gy + 3.2, tr.t.z, 0.45), { kind: 'tree', ref: `hangTree:${tr.t.x.toFixed(1)}:${tr.t.z.toFixed(1)}`, label: `The ${tr.t.name}`, verb: 'Open', hint: 'hang the barrel', act: () => this.openAt(`hangTree:${tr.t.x.toFixed(1)}:${tr.t.z.toFixed(1)}`) });
    }
    // a down log, with the saw
    const sw = ch.sawTarget(POINT.log);
    if (sw) {
      const o = sw.log, ga = p.groundAt(o.ax, o.az), gb = p.groundAt(o.bx, o.bz), r = (o.rad || 0.2) + 0.08;
      push(near.segment(o.ax, ga + r, o.az, o.bx, gb + r, o.bz, r + 0.06), { kind: 'item', ref: `downLog:${sw.k}`, label: 'A down spruce', verb: 'Open', hint: sw.left ? 'saw it into lengths' : 'sawn already', act: () => this.openAt(`downLog:${sw.k}`) });
    }
    return out;
  }
  // the hull's own mesh (the biggest in canoe.hull), for the dot's rim
  hullMesh() {
    if (this._hull !== undefined) return this._hull;
    let best = null, n = 0;
    const h = this.canoe && this.canoe.hull;
    if (h) h.traverse((o) => { const c = o.isMesh && !o.isSkinnedMesh && o.geometry.getAttribute('normal') ? o.geometry.getAttribute('position').count : 0; if (c > n) { n = c; best = o; } });
    return (this._hull = best);
  }
  fireHint(key) {
    const st = this.fires.state(key);
    return st === 'burning' ? 'burning' : st === 'coals' ? 'the coals are hot' : this.chores.fireInfo(key).units.length ? 'laid' : null;
  }
  // E at the woodpile: a piece off it, into an armload (a free hand) or what you carry
  fromPile(pile, e) {
    const inv = this.inv, ch = this.chores, arm = ch.armFor(e.id, true);
    let ok = !!(arm && inv.put(arm, e.id, { quiet: true }));
    if (!ok) ok = inv.place(e.id, 1, { exclude: [pile.id], quiet: true }).ok;
    if (!ok) { this.camp.note('Your hands are full.', 2.5); return; }
    inv.take(pile.id, e.uid, 1);
    ch.cook.gesture = { t: 0, dur: 0.45, say: 'Taking wood off the pile…' };
    inv.emit('items'); ch.persist();
  }
  // E at the grate: the cooked thing (or a raw one, or the pot) off it, into what you carry
  offGrate(key, e) {
    const inv = this.inv, ck = this.cook;
    if (e.id === 'pot') { ck.putAway(key, true); return; }
    const g = ck.grate(key), r = inv.place(e.id, 1, { data: e.data || null, quiet: true });
    if (!r.ok) { this.camp.note('No room for it in anything you carry.', 3); return; }
    inv.take(g.id, e.uid, 1);
    const d = itemDef(e.id);
    this.camp.note(`${d && d.cooked ? `The ${eatName(d)}` : d ? d.name : 'It'}, off the grate and into the ${lower(((itemDef((inv.cont(r.cId) || {}).item) || {}).name) || 'pack')}.`, 3);
    inv.emit('items');
  }

  // --- the frame -------------------------------------------------------------------------------------------------
  update(dt) {
    if (!this.attached) return;
    if ((this.sigT = (this.sigT || 0) - dt) <= 0) {
      this.sigT = 0.25;
      this.list = null;
      const list = this.objects();
      const sig = list.map((o) => `${o.id}:${o.sub || ''}:${o.actions.map((a) => `${a.id}${a.enabled ? 1 : 0}${a.label}`).join(',')}:${o.meter ? Math.round(o.meter.value * 40) : ''}:${o.cooking ? Math.round(o.cooking.value * 20) : ''}`).join('|');
      if (sig !== this.sig) { this.sig = sig; this.emit(); }
      // the panel E opened the book at stays the focus while the book is open
      if (this.focus && !(this.journal && this.journal.open)) this.focus = null;
    }
    // the stations by rings no one is near, with nothing in them, are tidied away (made again with the panel)
    if ((this.tidyT -= dt) <= 0) {
      this.tidyT = 3;
      const inv = this.inv0(), p = this.player;
      if (inv && p) for (let i = inv.containers.length - 1; i >= 0; i--) {
        const c = inv.containers[i];
        if ((c.item === 'firefuel' || c.item === 'grate') && !c.grid.length && c.at && Math.hypot(c.at.x - p.x, c.at.z - p.z) > 60) { const F = this.fires, k = c.at.fuel; if (c.item === 'firefuel' && k && F.get(k) && !F.get(k).laid && F.state(k) !== 'none') continue; inv.containers.splice(i, 1); inv.emit('containers'); }
      }
    }
  }
}

export const nearby = new Nearby();
export { Nearby };
