// The things near you, on the dot (the owner's third round of 2026-10-24, the world cards: "some keys are used to pick up
// the canoe (Q and E). I feel like at most an item can have two quick actions. primary is E and secondary is Q"; asked
// what E on a hung barrel does, "you get a screen where you can choose to Lower it?": no, E just lowers it). Whatever
// the dot points at has at most E and Q, both on its label (pointer.js), and a card opens only where there is something
// to move or a choice to make:
//
//   pointed at                            E                          Q
//   a hung barrel                         Lower (hold)               —
//   a tree with a good limb, barrel on you  Hang (hold)              —
//   a barrel, pack, bucket, box on the ground  Pick up               Open it (the book, lit in Here)
//   a branch or a log                     Pick up                    —
//   a pile                                Take one                   Open the pile (the book, lit in Here)
//   the fire ring                         Open the fire (its card)   Light (hold) when laid · Douse (hold) when burning
//   a pitched tent                        Rest until… (the dial)     Strike (hold)      (half pitched: E carries on)
//   a bagged tent on the ground           Pick up                    Pitch (the ghost, then hold)
//   a bagged tarp on the ground           Pick up                    Pitch the tarp (stream E's tarp.verb, fb4)
//   the latrine, the bench, a log seat    Sit                        —
//   the canoe afloat (or at a dock)       Get in (where it floats)   Shoulder it · "Unload it first" when loaded
//   the canoe beached (nosed in, on the bank)  Push it off (hold)    Shoulder it · "Unload it first" when loaded
//   the water's edge, on foot             Fill the bottle            —
//   a down log                            Saw (hold)                 Cut a pole (hold; stream E's downLogTarget, fb4)
//   a berry bush, mushrooms               Pick                       —        (pointer.js forageTargets)
//   a person                              Talk                       —        (pointer.js peopleTargets)
//   a shelf, the board, the map table, the counter   Open            —        (outfitter.js)
//
// What is left for the book (stream B's inv-ui.js) to read of the camp: nearby.objects(), the fire and the piles only
// (the fire's card reads the fire object; the tent, the latrine and the hang are not panels any more).
//
//   import { nearby } from './nearby.js';
//   nearby.attach({ camp, packs, journal, hud, pointer, canoe, player, inventory })   (main.js, fb2 A)
//   nearby.world({ cards, journal, sitter })   (main.js, wc A: the other streams', feature-detected at each call)
//     cards()   → stream B's { open(kind, ref), close() } or null (E at the ring: cards.open('fire', key))
//     journal   the book: openHere(ref) (B's right pane, Here) when it has it, else show('pack')
//     sitter()  → stream C's player with sitAt(spot) → bool, stand(), seated, or null: then cook.js's seat sits you
//   nearby.objects() -> [{ id, kind, title, sub?, slots?, actions, meter?, cooking? }]
//     kind     'fire' | 'pile'
//     the fire's slots [{ id: 'fuel' | 'grate' | 'ash', label, accepts: [kinds], cId?, items?, words? }]: the fuel and the
//              grate are fixed inventory containers at the ring (chores.js firefuel, items.js grate: a drop is
//              inventory.move); the ash is words only
//     actions  [{ id, label, enabled, why?, hint?, held?, job? (hold.js's id while it runs), run(opts) }]
//              opts: { key } the held key ('BookHold' from a card's button, 'KeyQ' from the dot)
//     meter    the fire's: { value 0..1, label, words }; cooking: { value 0..1, words } while the pot is on
//   nearby.itemActions(ref) -> [{ id, label, enabled, why?, closeBook?, run }]   ref: { cId, uid, itemId } |
//              { container: cId } | { long: uid }: a tent's Pitch, a barrel's Hang, wood onto the fire, a meal onto the grate
//   nearby.groundPieces() -> [{ uid: 'piece:<key>', id, at }]: the loose wood within reach (the book's Here pane)
//   nearby.takePiece(uid, toCId, x?, y?, rot?) -> { ok, words }
//   nearby.onChange(fn) -> off: the set, or something in it, changed (read objects() again)
//   nearby.targets(ray, near)  the pointer's provider (pointer.js): the table above
//   nearby.update(dt)  main.js, after the camp: the change signal, the stations no one is near tidied away
import * as THREE from 'three';
import { hold } from './hold.js';
import { itemDef } from './items.js';
import { inventory as INVENTORY } from './inventory.js';
import { campKey, AREA_R } from './camp.js';
import { BARRELS } from './hang.js';
import { tentOf } from './tent.js';
import { eatName } from './cook.js';

const FIRE_PANEL = 4;        // m from the ring within which its object is in objects() (the card)
const HULL_REACH = 3;        // m from the canoe's keel line (inventory.js HULL_REACH)
const PIECE_REACH = 3;       // m: the loose wood the book's Here pane lists (inventory.js REACH)
const POINT = { fire: 3.0, tent: 4.2, seat: 2.8, hung: 3.4, log: 1.8, water: 2.6 }; // m within which the dot takes them
const BURN_FULL = 6;         // game hours of wood the fire's meter calls full
const FOOD = new Set(['meal', 'fish']);
const MOVE_KEYS = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'];
const lower = (s) => (/^(Duluth|Johnson|Mepps|Rapala|Lazy Ike|[A-Z]-)/.test(String(s)) ? String(s) : String(s).charAt(0).toLowerCase() + String(s).slice(1)); // ("A-frame", "the Duluth #3" keep their capitals)
const thingName = (d) => (!d ? 'thing' : /^(Duluth|Johnson)/.test(d.name) ? d.name : d.id === 'pile' ? 'things on the ground' : lower(d.short && d.kind !== 'container' ? d.name : d.name));
const hoursWords = (h) => (h < 0.75 ? 'half an hour' : h < 1.25 ? 'an hour' : `${Math.round(h * 2) / 2} h`.replace('.5 h', '½ h'));
const _m = new THREE.Matrix4(), _one = new THREE.Vector3(1, 1, 1), _v = new THREE.Vector3();
// fb4 A, the round's decision 2 (the owner, 2026-10-25: "if I can't use something, I want to know exactly why I can't use
// it ... there needs to be a very clear action on what needs to be done next"): every verb here that can grey carries
// why (the one line the dot shows), needs (the checklist the book and the cards draw: [{ label, have?, need?, unit?,
// done?, timer? }]) and next (the one thing to do now). The other streams' checks are looked up when they are there
// (stream C: chores.lightCheck / douseCheck / fireState, cook.cookCheck / cookingNow, energy.fillCheck, forage.pickCheck;
// stream E: camp.pitchNeeds, hang.hangNeeds, chores.downLogTarget / latrineNeeds, tarp.verb), each { enabled?, why,
// needs, next }; without them a verb keeps its own why and gains a checklist of its own where it has one.
function check(obj, name, ...args) {
  const f = obj && obj[name];
  if (typeof f !== 'function') return null;
  try { const c = f.apply(obj, args); return c && typeof c === 'object' ? c : null; } catch (e) { console.warn(`nearby ${name}`, e); return null; }
}
const whyOf = (c) => (c.enabled === true ? null : c.enabled === false ? c.why || 'not now' : c.why || null);
// a verb with a check's why, needs and next laid on it; busy: a reason of the moment that outranks the check's ("a moment")
function checked(v, c, busy = null) {
  if (!c) return busy ? { ...v, why: busy } : v;
  return { ...v, why: busy || whyOf(c), needs: c.needs || v.needs, next: c.next || v.next };
}
// (fb5 E: each with the chip the dot shows, pointer.js chipOf: a few words of what is missing)
const HANDS_FULL = { needs: [{ label: 'A free hand', done: false, chip: 'hands full' }], next: 'Open the book (I) and set down what you hold, or put it in the canoe' };
const ALL_FULL = { needs: [{ label: 'Your back, your chest or a hand free', done: false, chip: 'nowhere to carry it' }], next: 'Open the book (I) and set something down, or put it in the canoe' };
// fb4 join: a loose thing's Pick up greys when nothing you carry has room and your hands are full (it said only after E)
const ROOM_FULL = { needs: [{ label: 'Room in a pack on you, or a free hand', done: false, chip: 'no room on you' }], next: 'Open the book (I): make room in your pack, or set down what you hold' };
function roomOnYou(inv, itemId) {
  if (!itemId) return true;
  if (inv.freeHand() >= 0 && (typeof inv.canHand !== 'function' || inv.canHand(itemId))) return true;
  const on = (c) => { const w = inv.rootWhere(c); return w === 'back' || w === 'chest' || w === 'hands' || w === 'pockets'; };
  return inv.containers.some((c) => on(c) && !(itemDef(c.item) || {}).one && inv.firstFit(c, itemId));
}
// a container's size on the ground, for the dot: [height of its middle, radius]
const BODY = { pack3: [0.32, 0.42], pack4: [0.34, 0.46], barrel30: [0.24, 0.3], barrel60: [0.32, 0.38], bucket: [0.14, 0.24], tacklebox: [0.1, 0.24], mapcase: [0.1, 0.24], pile: [0.12, 0.42], woodarms: [0.12, 0.4] };

class Nearby {
  constructor() {
    this.handlers = new Set();
    this.list = null; this.t = 0; this.sig = ''; this.tidyT = 0;
    this.attached = false;
    this.hooks = { cards: null, journal: null, sitter: null };
    this.targets = (ray, near) => this.pointTargets(ray, near);
  }
  attach({ camp, packs, journal = null, hud = null, pointer = null, canoe = null, player = null, inventory = INVENTORY }) {
    Object.assign(this, { camp, packs, journal, hud, pointer, canoe, player: player || camp.player, inv: inventory });
    this.attached = true;
    if (pointer) {
      pointer.isArmed = () => !!(camp.pitching || camp.hang.armed);
      pointer.onCancel = () => camp.cancelPitch('You leave the tent where it was.') || camp.hang.disarm();
      // no dot while a card is up at camp: the Rest dial, the night's card, a fade
      pointer.quiet = () => !!(camp.dialOpen || camp.night || (camp.veil && camp.veil.active) || (camp.card && camp.card.active) || this.cardUp());
      // sat down: the label reads "E Stand up"; E is the walker's (stream C), or the fallback's
      pointer.seated = () => this.isSeated();
      pointer.stand = () => this.standUp();
    }
    camp.pointer = pointer;
    return this;
  }
  // wc A: the other streams' hooks (main.js), each looked up when it is wanted
  world(o = {}) { Object.assign(this.hooks, o); return this; }
  get chores() { return this.camp.chores; }
  get cook() { return this.camp.chores.cook; }
  get fires() { return this.camp.fires; }
  onChange(fn) { this.handlers.add(fn); return () => this.handlers.delete(fn); }
  emit() { for (const f of this.handlers) { try { f(this); } catch (e) { console.warn('nearby onChange', e); } } }
  // the hold's keys: the dot's (KeyE or KeyQ, and a click), or a card's (BookHold, with E and a click besides)
  keys(o) { const k = (o && o.key) || 'KeyE'; return { key: k, keys: [...new Set([k, 'Mouse0', ...((o && o.keys) || []), ...(k === 'BookHold' ? ['KeyE'] : [])])] }; }
  inv0() { const i = this.inv; return i && i.attached ? i : null; }
  site(r) { const p = this.player, c = this.camp, s = c.nearestSite(p.x, p.z, r, true); if (!s) return null; const h = c.registry.holder(campKey(s)); return !h || h === 'player' ? s : null; }
  note(t, s = 3) { if (this.hud) this.hud.note(t, s); }

  // --- the cards and the book (stream B's, feature-detected) -----------------------------------------------------------
  cards() { const c = this.hooks.cards; const v = typeof c === 'function' ? c() : c; return v && typeof v.open === 'function' ? v : null; }
  book() { return this.hooks.journal || this.journal; }
  // E at the ring: the fire's card; without it (B not in the build yet), the book at the pack
  openFire(key) {
    const c = this.cards();
    if (c) { try { if (c.open('fire', key) !== false) return true; } catch (e) { console.warn('cards.open fire', e); } } // (false: the ring is not in objects(): the book instead)
    return this.openBook();
  }
  // a card up (stream B's cards.shown): no dot under it
  cardUp() { const c = this.cards(); return !!(c && c.shown); }
  // Q at a container or a pile on the ground: the book with it lit in Here; without it, the book at the pack
  openHere(ref) {
    const j = this.book();
    if (j && typeof j.openHere === 'function') { try { j.openHere(ref); return true; } catch (e) { console.warn('journal.openHere', e); } }
    return this.openBook();
  }
  openBook() { const j = this.book(); if (!j) return false; if (j.open && j.side === 'pack') return true; j.show('pack'); return true; }

  // --- the objects (the fire's card and the piles) ------------------------------------------------------------------
  objects() {
    if (!this.attached) return [];
    const now = performance.now();
    if (this.list && now - this.t < 120) return this.list;
    this.t = now;
    this.list = this.build();
    return this.list;
  }
  build() {
    const p = this.player, out = [], inv = this.inv0();
    if (!p || p.mode !== 'walk' || p.teleporting || !inv) return out;
    const f = this.fireObject();
    if (f) out.push(f);
    for (const c of inv.containers) if (c.item === 'pile' && c.where === 'ground' && c.at && c.grid.length && inv.inReach(c)) out.push(this.pileObject(c));
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
    // (fb4 A: each action with its check's why, needs and next where stream C has them: the card draws the checklist)
    const act = (a, c) => { if (!c) return a; const why = whyOf(c); return { ...a, enabled: !why, why, needs: c.needs || null, next: c.next || null }; };
    const actions = [
      act({ id: 'light', label: st === 'coals' ? 'Light it again' : 'Light', held: true, job: 'fire-light', enabled: !lightWhy, why: lightWhy, run: (o) => ch.light(site, key, this.keys(o)) }, check(ch, 'lightCheck', key)),
      act({ id: 'cook', label: ck.cookLabel(key), enabled: !cookWhy, why: cookWhy, run: () => ck.cookNow(site, key) }, check(ck, 'cookCheck', site, key)),
    ];
    if (og.food) actions.push({ id: 'eat', label: `Eat the ${eatName(itemDef(og.food.id))}`, enabled: true, hint: 'there and then', run: () => ck.eatAt(site, key) });
    const lit = st === 'burning' || st === 'coals';
    actions.push(act({ id: 'douse', label: 'Douse', held: true, job: 'fire-out', enabled: lit, why: lit ? null : 'there is no fire to put out', needs: lit ? null : [{ label: 'A fire burning, or hot coals', done: false }], next: lit ? null : 'Light it first', run: (o) => ch.douse(site, key, this.keys(o)) }, check(ch, 'douseCheck', key)));
    const ash = st === 'burning' ? 'embers under the flames' : st === 'coals' ? 'hot coals under the ash' : F.get(key) && !F.get(key).laid ? 'warm ash' : 'cold ash';
    const pot = ck.potHere(key);
    return {
      id: `fire:${key}`, kind: 'fire', title: 'The fire ring', sub, key,
      slots: [
        { id: 'fuel', label: 'Fuel', cId: bin.id, accepts: ['firewood'], words: info.units.length ? ch.woodWords(info.units) : 'dead branches and short logs' },
        { id: 'grate', label: 'The grate', cId: grate.id, accepts: ['meal', 'fish', 'food', 'tool'], words: og.food ? 'ready' : P ? (P.cold ? 'the fire is too low under it' : 'cooking') : pot ? 'a meal or a fish, the pot' : 'no pot' },
        { id: 'ash', label: 'The ash', accepts: [], items: [], words: ash },
      ],
      actions,
      meter: { value: Math.min(1, info.hours / BURN_FULL), label: 'Burn', words: st === 'burning' ? `about ${hoursWords(info.hours)} of wood` : info.fuel ? `${hoursWords(info.fuel)} of wood laid` : 'no wood' },
      cooking: typeof ck.cookingNow === 'function' ? check(ck, 'cookingNow', key) : P && !P.done ? { value: Math.min(1, P.t / P.dur), words: P.cold ? 'the fire is too low under it' : `ready in ${Math.max(1, Math.ceil(P.dur - P.t))} s` } : null,
      state: st, noPot: !pot,
      ...(check(ch, 'fireState', key) || {}), // (fb4 A: stream C's fuel { light, hour }, wet, timers and status, for the card)
    };
  }
  pileObject(c) {
    const n = c.grid.reduce((s, e) => s + e.qty, 0), wood = this.chores.woodOnly(c);
    return { id: `pile:${c.id}`, kind: 'pile', title: wood ? 'A woodpile' : 'Things on the ground', sub: `${n} ${n === 1 ? 'thing' : 'things'}`, cId: c.id, slots: [{ id: 'items', label: wood ? 'Wood' : 'On the ground', cId: c.id, accepts: null }], actions: [] };
  }

  // --- a thing's own actions (the book's right-click) -------------------------------------------------------------
  itemActions(ref) {
    const inv = this.inv0(), out = [];
    if (!inv || !ref) return out;
    if (ref.container) {
      const c = inv.cont(ref.container);
      if (c && BARRELS[c.item] && c.where !== 'hung') {
        const why = this.camp.hang.hangRefused(c.id), hc = check(this.camp.hang, 'hangNeeds', c.id);
        out.push({ id: 'hang', label: 'Hang it from a tree', closeBook: true, enabled: !why, why, ...(hc ? { needs: hc.needs || null, next: hc.next || null } : {}), run: () => this.camp.hang.arm(c.id) });
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
      const tent = this.camp.tentByUid(e.uid), why = this.camp.pitchRefused(tent), pc = check(this.camp, 'pitchNeeds', tent);
      out.push({ id: 'pitch', label: 'Pitch', closeBook: true, enabled: !why, why, ...(pc ? { needs: pc.needs || null, next: pc.next || null } : {}), run: () => this.camp.beginPitch(e.uid) });
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
    return { id, label, enabled: !!spot, why: spot ? null : full, ...(spot ? {} : { needs: [{ label: `Room ${id === 'fuel' ? 'in the ring' : 'on the grate'}`, done: false }], next: id === 'fuel' ? 'Let it burn down a while, or take a piece off' : 'Take what is on it off first (E on it)' }), run: () => { const s = inv.firstFit(to, e.id); return !!(s && inv.move(from.id, e.uid, to.id, s.x, s.y, s.rot, 1)); } };
  }

  // --- the loose wood, for the book's Here pane ------------------------------------------------------------------------
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

  // --- sitting (stream C's player.sitAt, else cook.js's seat) ---------------------------------------------------------
  sitter() { const s = this.hooks.sitter; return typeof s === 'function' ? s() : s || null; }
  sitAt(spot) {
    const S = this.sitter();
    if (S) { const r = S.sitAt(spot); if (r === false) this.note('Not from here: stand by it.', 3); return r !== false; }
    if (this.cook.busy || hold.active) return false;
    this.cook.sitAt(spot);
    return true;
  }
  isSeated() { const S = this.sitter(); return S ? !!S.seated : this.cook.seated; }
  standUp() { const S = this.sitter(); if (S) S.stand(); else this.cook.standUp(); }
  // the seats at the site you stand at: stream C's layout.seats (two spots on the bench, the latrine's lid), else the
  // bench and the latrine as cook.js finds them; a store's porch bench too. [{ spot, box, label, latrine? }]
  seats(site) {
    const p = this.player, t = this.camp.tiles, out = [];
    const sit = (q, ax, az, kind) => {
      const h = Number.isFinite(q.heading) ? q.heading : 0, y = Number.isFinite(q.y) ? q.y : t.groundAt(q.x, q.z) + 0.45;
      const spot = { kind, seat: { x: q.x, y, z: q.z }, stand: { x: q.x + Math.cos(h) * 0.66, z: q.z - Math.sin(h) * 0.66 }, heading: h, round: null, id: q.id || null };
      const along = Number.isFinite(ax) ? Math.atan2(-az, ax) : h + Math.PI / 2;
      return { spot, box: { x: q.x, y: y - 0.12, z: q.z, hx: kind === 'latrine' ? 0.34 : 0.45, hy: kind === 'latrine' ? 0.26 : 0.2, hz: kind === 'latrine' ? 0.34 : 0.24, heading: along }, label: kind === 'latrine' ? 'the latrine' : kind === 'log' ? 'a log seat' : 'the bench', latrine: kind === 'latrine' };
    };
    const L = site && site.layout;
    if (L) {
      const tagged = Array.isArray(L.seats) && L.seats.length > 0;
      if (tagged) for (const q of L.seats) out.push(sit(q, q.ax, q.az, q.kind || 'bench'));
      else if (L.bench) { const b = this.cook.benchSpot(site); out.push({ spot: b, box: { x: L.bench.x, y: b.seat.y - 0.12, z: L.bench.z, hx: 0.78, hy: 0.2, hz: 0.24, heading: Math.atan2(-L.bench.az, L.bench.ax) }, label: 'the bench', latrine: false }); }
      // the latrine (props.js c.layout.latrine): its ten minutes and its rest bonus are chores.js's
      if (L.latrine && !(tagged && L.seats.some((q) => q.kind === 'latrine'))) { const b = this.cook.latrineSpot(site), gy = t.groundAt(L.latrine.x, L.latrine.z); out.push({ spot: b, box: { x: L.latrine.x, y: gy + 0.24, z: L.latrine.z, hx: 0.34, hy: 0.26, hz: 0.34, heading: 0 }, label: 'the latrine', latrine: true }); }
    }
    // a store's porch bench (props.js storeLayout().seats, stream C)
    const o = this.camp.outfitter, SL = o && o.visit && o.visit.L;
    if (SL && Array.isArray(SL.seats)) for (const q of SL.seats) if (Math.hypot(q.x - p.x, q.z - p.z) <= POINT.seat + 1) out.push(sit(q, q.ax, q.az, q.kind || 'bench'));
    return out;
  }

  // --- the dot (pointer.js provider): the table ---------------------------------------------------------------------
  pointTargets(ray, near) {
    const p = this.player, inv = this.inv0(), out = [];
    if (!inv || p.mode !== 'walk' || hold.active || this.cook.busy || this.isSeated()) return out;
    const push = (hit, target) => { if (hit) out.push({ dist: hit.t, miss: hit.miss, target }); };
    const view = typeof window !== 'undefined' && window.__game ? window.__game.invView : null;
    const ch = this.chores, packs = this.packs, camp = this.camp;
    // the things set down on the ground in reach: a container (E Pick up · Q Open it), a long thing (E Pick up), a pile
    // (E Take one · Q Open the pile), a woodpile the same, a bagged tent (E Pick up · Q Pitch)
    for (const u of packs.units()) {
      const o = u.obj, at = o.at;
      if (o.where !== 'ground' || !at || (u.def.fixed && u.id !== 'pile') || near.flat(at.x, at.z) > near.reach) continue;
      const y = Number.isFinite(at.y) ? at.y : p.groundAt(at.x, at.z);
      if (u.kind === 'long') {
        const fx = Math.cos(at.heading || 0), fz = -Math.sin(at.heading || 0);
        const hit = near.segment(at.x - fx * 0.95, y + 0.04, at.z - fz * 0.95, at.x + fx * 0.95, y + 0.04, at.z + fz * 0.95, 0.2);
        push(hit, { kind: 'item', ref: u.ref, label: `the ${thingName(u.def)}`, e: { verb: 'Pick up', ...(inv.freeHand() >= 0 ? { why: null } : { why: 'both hands are full', ...HANDS_FULL }), run: () => packs.pickUp(u) }, mesh: view && view.objs && view.objs.get(u.ref) });
        continue;
      }
      const wood = ch.woodOnly(o), [h, r] = wood ? [0.18, 0.5] : BODY[u.id] || [0.2, 0.36];
      const hit = near.sphere(at.x, y + h, at.z, r);
      if (!hit) continue;
      if (wood) {
        const e = o.grid.find((q) => q.id === 'wood:log') || o.grid[0], n = ch.pieceCount(o), pm = ch.pileMesh(o.id);
        const room = !!(ch.armFor(e.id, false) || inv.freeHand() >= 0);
        push(hit, { kind: 'pile', ref: o.id, label: `the woodpile (${n})`, e: { verb: 'Take one', ...(room ? { why: null } : { why: 'your hands are full', ...HANDS_FULL }), run: () => this.fromPile(o, e) }, q: { verb: 'Open the pile', run: () => this.openHere(o.id) }, box: { x: at.x, y: y + 0.18, z: at.z, hx: 0.42, hy: 0.2, hz: 0.42, heading: (at.heading || 0) }, mesh: pm ? pm.layers[0] : null });
        continue;
      }
      if (u.id === 'pile') {
        const tent = this.baggedTent(o);
        if (tent) {
          const tt = camp.tentByUid(tent.uid), why = camp.pitchRefused(tt), pc = check(camp, 'pitchNeeds', tt);
          push(hit, { kind: 'item', ref: o.id, label: `the ${lower(tent.def.name)}, bagged`, e: { verb: 'Pick up', ...(roomOnYou(inv, tent.def.id) ? { why: null } : { why: 'no room on you', ...ROOM_FULL }), run: () => packs.pickUp(u) }, q: { verb: 'Pitch', why, ...(pc ? { needs: pc.needs || null, next: pc.next || null } : {}), run: () => camp.beginPitch(tent.uid) }, mesh: view && view.objs && view.objs.get(o.id) });
          continue;
        }
        // fb4 A: the bagged tarp on the ground (a pile holding only it): E Pick up · Q Pitch the tarp (stream E's
        // tarp.verb(pile, entry) → { enabled, why, needs, next, label, run }: it arms the rig's ghost)
        const tarp = window.__game && window.__game.tarp, te = o.grid.length === 1 && !o.grid[0].box && tarp && typeof tarp.verb === 'function' ? o.grid[0] : null;
        const tv = te ? check(tarp, 'verb', o, te) : null;
        if (tv) {
          push(hit, { kind: 'item', ref: o.id, label: `the ${lower((itemDef(te.id) || {}).name || 'tarp')}, bagged`, e: { verb: 'Pick up', ...(roomOnYou(inv, te.id) ? { why: null } : { why: 'no room on you', ...ROOM_FULL }), run: () => this.takeOne(o) }, q: { verb: tv.label || 'Pitch the tarp', why: whyOf(tv), needs: tv.needs || null, next: tv.next || null, run: (o2) => tv.run(o2) }, mesh: view && view.objs && view.objs.get(o.id) });
          continue;
        }
        const top = o.grid.find((q) => !q.box) || o.grid[0], n = o.grid.length, dd = top ? itemDef(top.id) : null;
        push(hit, { kind: 'pile', ref: o.id, label: n === 1 && dd ? `the ${lower(dd.name)}, on the ground` : `the things on the ground (${n})`, e: { verb: 'Take one', ...(!top ? { why: 'nothing there' } : top.box || roomOnYou(inv, top.id) ? { why: null } : { why: 'no room on you', ...ROOM_FULL }), run: () => this.takeOne(o) }, q: { verb: 'Open the pile', run: () => this.openHere(o.id) }, mesh: view && view.objs && view.objs.get(o.id) });
        continue;
      }
      const room = !!packs.slotFor(u);
      push(hit, { kind: 'container', ref: o.id, label: `the ${thingName(u.def)}`, e: { verb: 'Pick up', ...(room ? { why: null } : { why: 'your back and hands are full', ...ALL_FULL }), run: () => packs.pickUp(u) }, q: { verb: 'Open it', run: () => this.openHere(o.id) }, mesh: view && view.objs && view.objs.get(o.id) });
    }
    // the loose wood: E Pick up
    for (const pc of ch.near) {
      if (!ch.available(pc) || near.flat(pc.x, pc.z) > near.reach) continue;
      const fx = Math.cos(pc.yaw), fz = -Math.sin(pc.yaw), L = pc.len / 2, r = pc.kind === 'log' ? 0.17 : 0.14;
      const hit = near.segment(pc.x - fx * L, pc.y + 0.05, pc.z - fz * L, pc.x + fx * L, pc.y + 0.05, pc.z + fz * L, r);
      if (!hit) continue;
      _m.compose(pc.pos, pc.q, _one);
      push({ t: hit.t, miss: hit.miss * 0.85 }, { kind: 'item', ref: `piece:${pc.key}`, label: pc.kind === 'log' ? 'a short log' : 'a dead branch', e: { verb: 'Pick up', ...(ch.canTakePiece(pc) ? { why: null } : { why: 'your hands are full, and nothing you carry has room', needs: [{ label: 'A free hand, or room in what you carry', done: false, chip: 'hands full' }], next: 'Put the armload on the fire or a woodpile, or set something down from the book (I)' }), run: () => ch.pickUp(pc) }, shell: { geometry: ch.pieceGeos[pc.g], matrix: _m.clone() } });
    }
    // the canoe lying by (or floated at a dock's side): E Get in where it floats, or hold E Push it off where it is
    // beached · Q Shoulder it ("Unload it first" when loaded): packs.js hullAction, with each greyed verb's checklist
    const c = p.carry, d = c && c.drop, s = d && inv.canoeSpot();
    if (d && s && inv.hullDist(s, p.x, p.z) <= HULL_REACH) {
      const hull = this.canoe && this.canoe.hull, hy = hull ? (hull.getWorldPosition(_v), _v.y) : p.groundAt(d.x, d.z);
      // (the box stands a little taller than the hull, so from the dock's deck the dot finds the canoe floating below
      // without looking straight down at it: polish B)
      const box = { x: d.x, y: hy + 0.35, z: d.z, hx: 2.45, hy: 0.5, hz: 0.46, heading: d.heading || 0 };
      const hit = near.box(box), a = packs.hullAction();
      if (hit && a) push(hit, { kind: 'canoe', ref: 'canoe', label: a.label, e: a.e, q: a.q || null, hint: a.hint || null, mesh: this.hullMesh(), box });
    }
    // the camp's things: the fire ring (E Open the fire · Q Light or Douse), the grate's top (E Pick up), the seats
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
          push({ t: gh.t, miss: gh.miss * 0.7 }, { kind: 'item', ref: `grate:${top.uid}`, label: `${name}, off the grate`, e: { verb: 'Pick up', run: () => this.offGrate(key, top) }, box: { x: gs.x, y: gs.y + 0.06, z: gs.z, hx: 0.11, hy: 0.07, hz: 0.11, heading: 0 } });
        }
        push(near.sphere(f.x, f.y + 0.22, f.z, 0.85), { kind: 'fire', ref: `fire:${key}`, label: 'the fire ring', hint: this.fireHint(key), e: { verb: 'Open the fire', run: () => this.openFire(key) }, q: this.fireQ(site, key), box: { x: f.x, y: f.y + 0.16, z: f.z, hx: 0.62, hy: 0.18, hz: 0.62, heading: f.a || 0 } });
      }
    }
    // the seats: the bench, a log seat, the latrine (E Sit)
    for (const st of this.seats(site)) {
      const b = st.box;
      if (near.flat(b.x, b.z) > POINT.seat) continue;
      const run = st.latrine ? () => ch.latrine(site, this.seatHooks()) : () => this.sitAt(st.spot);
      const lc = st.latrine ? check(ch, 'latrineNeeds', site) : null; // (stream E: { hint, needs, next })
      push(near.box(b), { kind: 'seat', ref: `seat:${st.spot.id || `${b.x.toFixed(1)}:${b.z.toFixed(1)}`}`, label: st.label, hint: lc && lc.hint ? lc.hint : null, e: { verb: 'Sit', why: hold.active || this.cook.busy ? 'a moment' : null, ...(lc ? { needs: lc.needs || null, next: lc.next || null } : {}), run }, box: b });
    }
    // your tent: half pitched E Carry on pitching · Q Strike; up E Rest until… · Q Strike
    const t = camp.camp, ta = t && t.stage > 0 ? camp.tentActions() : null;
    if (ta && near.flat(t.x, t.z) <= POINT.tent) {
      const size = tentOf(t.item).size, hd = Math.atan2(-t.fdx, -t.fdz), y = (t.y || p.groundAt(t.x, t.z)) + size.h * 0.45;
      const b = { x: t.x, y, z: t.z, hx: size.a + 0.05, hy: size.h * 0.5, hz: size.b + 0.05, heading: hd };
      push(near.box(b), { kind: 'tent', ref: 'tent', label: ta.label, hint: ta.hint, e: ta.e, q: ta.q, mesh: t.stages && t.stages.fly && t.stage >= 4 ? t.stages.fly : null, box: b });
    }
    // a hung barrel overhead (E Lower · hold): the barrel, or the trunk its rope is tied off on (3 m up, the barrel alone
    // is out of the third-person ray's reach from within POINT.hung)
    const hg = camp.hang, hung = hg.hungTarget();
    if (hung && near.flat(hung.c.at.x, hung.c.at.z) <= POINT.hung) {
      const tt = hung.tree, at = hung.c.at, ty = tt ? p.groundAt(tt.x, tt.z) : 0;
      const hits = [near.sphere(at.x, at.y, at.z, 0.45), tt ? near.segment(tt.x, ty + 0.3, tt.z, tt.x, ty + 2.4, tt.z, (tt.r || 0.25) + 0.2) : null].filter(Boolean);
      push(hits.sort((a, b) => a.miss - b.miss)[0] || null, { kind: 'barrelHung', ref: `barrelHung:${hung.c.id}`, label: lower(hung.label), e: { verb: hung.verb, held: true, why: hung.why || null, needs: hung.needs || null, next: hung.next || null, run: hung.run }, mesh: view && view.objs && view.objs.get(hung.c.id) });
    }
    // a tree with a good limb, a barrel on you (E Hang · hold), or one with a hang let go part way
    const tr = !hung ? hg.treeTarget() : null;
    if (tr) {
      const gy = p.groundAt(tr.t.x, tr.t.z);
      push(near.segment(tr.t.x, gy + 0.3, tr.t.z, tr.t.x, gy + 3.2, tr.t.z, 0.45), { kind: 'tree', ref: `hangTree:${tr.t.x.toFixed(1)}:${tr.t.z.toFixed(1)}`, label: lower(tr.label), e: { verb: tr.verb, held: true, why: tr.why || null, needs: tr.needs || null, next: tr.next || null, run: tr.run } });
    }
    // a down log: stream E's downLogTarget when it is there (E Saw · Q Cut a pole, both held, greyed with their
    // checklists without the saw), else the old one with the saw in reach (E Saw · hold)
    const dl = check(ch, 'downLogTarget', POINT.log);
    if (dl && dl.log) {
      const o = dl.log, ga = p.groundAt(o.ax, o.az), gb = p.groundAt(o.bx, o.bz), r = (o.rad || 0.2) + 0.08;
      push(near.segment(o.ax, ga + r, o.az, o.bx, gb + r, o.bz, r + 0.06), { kind: 'downLog', ref: `downLog:${dl.k}`, label: dl.label || 'a down spruce', hint: dl.hint || null, e: dl.e || null, q: dl.q || null });
    }
    const sw = !dl ? ch.sawTarget(POINT.log) : null;
    if (sw) {
      const o = sw.log, ga = p.groundAt(o.ax, o.az), gb = p.groundAt(o.bx, o.bz), r = (o.rad || 0.2) + 0.08;
      push(near.segment(o.ax, ga + r, o.az, o.bx, gb + r, o.bz, r + 0.06), { kind: 'downLog', ref: `downLog:${sw.k}`, label: 'a down spruce', hint: sw.left ? `${sw.left === 3 ? 'three' : sw.left === 2 ? 'two' : 'one'} short ${sw.left === 1 ? 'log' : 'logs'} in it` : null, e: { verb: 'Saw', held: true, ...(sw.left > 0 ? { why: null } : { why: 'sawn already: it grows no more till another day', needs: [{ label: 'A down log not sawn today', done: false }], next: 'Another down log, or this one tomorrow' }), run: (o2) => ch.beginSaw(sw.log, sw.k, sw.cuts, this.keys(o2)) } });
    }
    // the water's edge, on foot (E Fill the bottle)
    const w = this.waterEdge();
    if (w) push(near.box(w.box), { kind: 'water', ref: 'water', label: 'the water’s edge', chip: w.chip || '', e: { verb: 'Fill the bottle', why: w.why, needs: w.needs || null, next: w.next || null, run: () => camp.fillBottle(w.wait) }, box: w.box });
    return out;
  }
  // the fire ring's Q: Light (held) while it is laid and not lit, Douse (held) while it burns or the coals are hot;
  // cold and empty, nothing
  fireQ(site, key) {
    const ch = this.chores, info = ch.fireInfo(key), st = info.state, busy = hold.active || this.cook.busy ? 'a moment' : null;
    if (st === 'burning' || st === 'coals') return checked({ verb: 'Douse', held: true, why: null, run: (o) => ch.douse(site, key, this.keys(o)) }, check(ch, 'douseCheck', key), busy);
    if (!info.units.length) return null;
    const why = ch.lightProblem(key);
    return checked({ verb: 'Light', held: true, why, run: (o) => ch.light(site, key, this.keys(o)) }, check(ch, 'lightCheck', key), busy);
  }
  // the water within reach ahead of you (world.shoreAt < 0), as a flat box on it: { box, why, wait, hint } or null
  waterEdge() {
    const p = this.player, w = this.camp.world, e = this.camp.energy, f = p.forward;
    let pt = null;
    for (let d = 0.4; d <= POINT.water && !pt; d += 0.3) { const x = p.x + f.x * d, z = p.z + f.z * d; if (w.isReady(x, z) && w.shoreAt(x, z) < 0) pt = { x: x + f.x * 0.5, z: z + f.z * 0.5 }; }
    if (!pt) return null;
    // fb4 A: stream C's fillCheck when it is there: { enabled, why, needs, next, wait } (wait: hours to drinkable)
    const fc = e && typeof e.fillCheck === 'function' ? check(e, 'fillCheck', typeof this.camp.filterWait === 'function' ? this.camp.filterWait() : undefined) : null;
    if (fc && (this.camp.bottleHere() || (e && e.live))) {
      const y0 = w.levelAt(pt.x, pt.z), b0 = this.camp.bottleHere();
      // (fb5 E: the dot's chip is the one missing thing: a greyed fill's (pointer.js reads its needs), else no tablet to hand)
      const noTab = !whyOf(fc) && (fc.needs || []).some((n) => /tablet/i.test(n.label || '') && !n.done);
      return { box: { x: pt.x, y: y0 + 0.02, z: pt.z, hx: 0.8, hy: 0.06, hz: 0.8, heading: p.heading }, why: whyOf(fc), needs: fc.needs || null, next: fc.next || null, wait: Number.isFinite(fc.wait) ? fc.wait : b0 ? b0.wait : 0, hint: b0 ? b0.words : null, chip: noTab ? 'no tablet to hand' : '' };
    }
    const b = this.camp.bottleHere();
    let why = null;
    if (!b) {
      if (!e || !e.fill || !e.live) return null; // no trip under way: nothing to fill
      why = e.bottle > 2 - 0.05 ? 'the bottle is full' : null;
      if (!why) return null;
    }
    const y = w.levelAt(pt.x, pt.z);
    return { box: { x: pt.x, y: y + 0.02, z: pt.z, hx: 0.8, hy: 0.06, hz: 0.8, heading: p.heading }, why, wait: b ? b.wait : 0, hint: b ? b.words : null };
  }
  seatHooks() { const S = this.sitter(); return S ? { sit: (spot) => S.sitAt(spot), stand: () => S.stand(), seated: () => !!S.seated } : null; }
  // a pile that is a bagged tent and nothing else: its entry and def, or null
  baggedTent(pile) {
    if (pile.item !== 'pile' || pile.grid.length !== 1) return null;
    const e = pile.grid[0], d = e && !e.box ? itemDef(e.id) : null;
    return d && d.slot === 'tent' ? { uid: e.uid, def: d } : null;
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
    let ok = !!(arm && inv.put(arm, e.id, { quiet: true, data: e.data || null })); // (fb4: a piece's data goes with it, its wetness)
    if (!ok) ok = inv.place(e.id, 1, { exclude: [pile.id], quiet: true, data: e.data || null }).ok;
    if (!ok) { this.camp.note('Your hands are full.', 2.5); return; }
    inv.take(pile.id, e.uid, 1);
    ch.cook.gesture = { t: 0, dur: 0.45, say: 'Taking wood off the pile…' };
    inv.emit('items'); ch.persist();
  }
  // the fb3 join: hands take anything (stream B, decision 11), so with nothing carried that has room a thing taken off a
  // pile or the grate goes into a free hand (a sleeping bag left on the ground had read "No room for it" with both
  // hands empty)
  toFreeHand(cId, e) {
    const inv = this.inv;
    if (typeof inv.canHand !== 'function' || !inv.canHand(e.id) || inv.freeHand() < 0) return false;
    const h = inv.toHand(cId, e.uid, null, 1);
    if (!h.ok) return false;
    this.camp.note(h.words, 2.5); inv.emit('items');
    return true;
  }
  // E at a pile of things: the top one into what you carry (a container in it onto you)
  takeOne(pile) {
    const inv = this.inv, e = pile.grid.find((q) => !q.box) || pile.grid[0];
    if (!e) return;
    if (e.box) { const r = inv.carry(e.uid, 'auto'); if (!r.ok) this.camp.note(r.words || 'No room on you for it.', 3); return; }
    const d = itemDef(e.id), r = inv.place(e.id, 1, { data: e.data || null, exclude: [pile.id], quiet: true });
    if (!r.ok) { if (!this.toFreeHand(pile.id, e)) this.camp.note('No room for it in anything you carry, and your hands are full.', 3); return; }
    inv.take(pile.id, e.uid, 1);
    const to = inv.cont(r.cId), td = to ? itemDef(to.item) : null;
    this.camp.note(`${d ? d.name : 'It'}, into ${to && to.item === 'pockets' ? 'your pockets' : `the ${lower((td && (td.short || td.name)) || 'pack')}`}.`, 2.5);
    inv.emit('items');
  }
  // E at the grate: the cooked thing (or a raw one, or the pot) off it, into what you carry
  offGrate(key, e) {
    const inv = this.inv, ck = this.cook;
    if (e.id === 'pot') { ck.putAway(key, true); return; }
    const g = ck.grate(key), r = inv.place(e.id, 1, { data: e.data || null, quiet: true });
    if (!r.ok) { if (!this.toFreeHand(g.id, e)) this.camp.note('No room for it in anything you carry, and your hands are full.', 3); return; }
    inv.take(g.id, e.uid, 1);
    const d = itemDef(e.id);
    this.camp.note(`${d && d.cooked ? `The ${eatName(d)}` : d ? d.name : 'It'}, off the grate and into the ${lower(((itemDef((inv.cont(r.cId) || {}).item) || {}).name) || 'pack')}.`, 3);
    inv.emit('items');
  }

  // --- the frame -------------------------------------------------------------------------------------------------
  update(dt) {
    if (!this.attached) return;
    const p = this.player;
    // sat down on the fallback's seat: a move key stands you up; up from the latrine early: its minutes stop
    if (!this.sitter() && this.cook.seated && !hold.active && p.input && p.input.down && MOVE_KEYS.some((k) => p.input.down.has(k))) this.cook.standUp();
    if (this.chores) this.chores.latrineUp(() => this.isSeated());
    if ((this.sigT = (this.sigT || 0) - dt) <= 0) {
      this.sigT = 0.25;
      this.list = null;
      const list = this.objects();
      const sig = list.map((o) => `${o.id}:${o.sub || ''}:${o.actions.map((a) => `${a.id}${a.enabled ? 1 : 0}${a.label}`).join(',')}:${o.meter ? Math.round(o.meter.value * 40) : ''}:${o.cooking ? Math.round(o.cooking.value * 20) : ''}`).join('|');
      if (sig !== this.sig) { this.sig = sig; this.emit(); }
    }
    // the stations by rings no one is near, with nothing in them, are tidied away (made again with the card)
    if ((this.tidyT -= dt) <= 0) {
      this.tidyT = 3;
      const inv = this.inv0();
      if (inv && p) for (let i = inv.containers.length - 1; i >= 0; i--) {
        const c = inv.containers[i];
        if ((c.item === 'firefuel' || c.item === 'grate') && !c.grid.length && c.at && Math.hypot(c.at.x - p.x, c.at.z - p.z) > 60) { const F = this.fires, k = c.at.fuel; if (c.item === 'firefuel' && k && F.get(k) && !F.get(k).laid && F.state(k) !== 'none') continue; inv.containers.splice(i, 1); inv.emit('containers'); }
      }
    }
  }
}

export const nearby = new Nearby();
export { Nearby };
