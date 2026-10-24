// Packs and portages (trip core B; the owner's feedback of 2026-10-24, stream A): a portage carries everything you own
// across, the way trippers do. What you own is the inventory's (inventory.js): containers (the Duluth packs, the blue
// barrels, the leech bucket, the tackle box, the stringer) and long items (the rod, the paddles), each in the canoe, on
// your back or chest, in a hand, on the ground, or kept at the outfitters. On a carry you have:
//   - the canoe overhead, with the paddle in use and the stringer lashed under the thwarts;
//   - one pack (or a barrel) on your back, and with Q one more on your chest;
//   - one thing in each hand: the rod, the bucket, the tackle box, a spare paddle.
// Whatever is left over is set down at the trail head for a second trip, and the double portage runs the BWCA way:
//   1. the landing ends at the trail head: you shoulder the canoe with what fits on you, the rest is set down there;
//      Q beside a thing at the trail head takes it too (onto the chest, or into a free hand), for one heavy trip;
//   2. at the far end the canoe goes down (what you carried goes into it) and you walk back for the rest; or Q there
//      launches and leaves the rest at the trail head (it stays there until you come back for it);
//   3. walking back, Q fetches it all: a short fade, the clock moves on by the walks back and the carries over (as
//      many trips as it takes, at life pace: pace.js), the walks' energy is spent, and it all stands by the canoe; or
//      walk it yourself: E picks a thing up;
//   4. with everything together, E loads up and launches (what was set down for the trip goes in; what you set down by
//      hand with Q stays where it is).
// On foot elsewhere: E beside a thing on the ground picks it up (onto the back, the chest or a hand), Q sets down what
// you carry, and E at the canoe loads what you carry into it. Unloading the canoe is from the inventory (stream B's
// J book: inventory.carry / setDown).
// At a camp (the camp redone, 2026-10-24: "it doesnt do it automatically when you leave, and you CAN leave stuff. you
// need to repack bags in canoe"): nothing is set out when the tent goes up and nothing goes back in the canoe at the
// launch. E picks up what is set out at camp like anything on the ground (never a fixed thing, the grate); Q sets down
// what you carry where you stand, and within a site's area it counts as set out at camp. At the canoe with things still
// on the ground about it (the camp's reach where it lies at a camp, else LOAD_REACH of the hull), a held E loads
// everything there, a thing a phase (hold.js), while the canoe has room by count and by weight; Q launches and leaves
// them. A reload in the middle of a carry comes back on the trail with the canoe overhead and the carry still on you
// (resumeCarry, main.js).
//
// Each frame (after player.update) it writes player.loadKg (the canoe when it is overhead, plus what you carry, by the
// items' own weights) and player.loadFactor = max(1, loadKg / 40), which player.js's walking pace and energy.js's carry
// drain read, and runs the inventory's frame (inventory.update). Two hooks in player.js call in: footPrompts (the
// prompts on foot, where the things you carry change them) and beforeLaunch.

import { LIFE } from './pace.js';
import { BASE_H, CARRY_H } from './energy.js';
import { inventory as INVENTORY } from './inventory.js';
import { itemDef } from './items.js';
import { hold } from './hold.js'; // camp 1: the held "Load everything here"

export const WEIGHTS = { aluminium: 34, royalex: 29, kevlar: 20, gear: 16, foodPack: 2, foodDay: 0.9 }; // kg (the canoes; the rest is the items' own)
const REACH = 3;            // m from a thing on the ground within which you pick it up or take it too
const HULL_REACH = 3;       // m from the canoe within which its prompts apply (player.js)
const LOAD_REACH = 10;      // m from the canoe within which a thing set down for the trip goes in at the launch
const LEAVE_AGAIN = 6;      // seconds: E again within this launches and leaves what is back at the trail head
const CANOE_KG = 160;       // kg of gear a tripping canoe takes besides its paddler ("Load everything here" stops there)
const CANOE_ROOM = 8;       // containers a canoe takes (inventory.js CANOE_ROOM)
const LOAD_EACH = { minutes: 1, seconds: 0.45, per100m: 2.5 }; // a thing carried down and loaded: its minutes (more the farther it lies), its real seconds
// the fetch is charged at life pace (pace.js), as walking it yourself is: the walk back at a walk on the trail's going,
// the carry over at a walk slowed by the load (player.js: / (kg / 40) ^ 0.6, and no slower than a canoe carry)
const TRAIL_GOING = 0.9;    // a portage trail's roots, rocks and grades against a walk on the flat
const HAND_ORDER = ['rod', 'rodmh', 'bucket', 'tacklebox', 'mapcase', 'barrel30', 'stringer'];
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const lower = (s) => s.charAt(0).toLowerCase() + s.slice(1);
const metres = (d) => (d < 1000 ? `${Math.round(d)} m` : `${(d / 1000).toFixed(1)} km`);
// game hours as the prompt says them: "about 35 min", "about 1 h 10"
export function aboutHours(h) {
  const m = Math.max(5, Math.round((h * 60) / 5) * 5);
  return m < 60 ? `about ${m} min` : `about ${Math.floor(m / 60)} h${m % 60 ? ' ' + String(m % 60).padStart(2, '0') : ''}`;
}
// a thing's name in a prompt: "the Duluth pack #3", "the rod"
const SHORT = { pack3: 'pack', pack4: 'big pack', barrel30: 'small barrel', barrel60: 'barrel', bucket: 'leech bucket', tacklebox: 'tackle box', mapcase: 'map case', stringer: 'stringer', rod: 'rod', rodmh: 'rod', ash: 'paddle', bentshaft: 'paddle', carbon: 'paddle', pile: 'things on the ground' };
const short = (u) => SHORT[u.id] || lower(u.def.name);
const the = (u) => `the ${short(u)}`;
function names(us) {
  const n = us.map(the);
  return n.length <= 1 ? n[0] || '' : n.length === 2 ? `${n[0]} and ${n[1]}` : `${n.slice(0, -1).join(', ')} and ${n[n.length - 1]}`;
}

export class Packs {
  // world, player, canoe (canoe.js), day (daycycle.js); energy, hud, trip (trip.js), veil (veil.js) and the inventory
  constructor({ world, player, canoe, day, energy = null, hud = null, trip = null, veil = null, inventory = INVENTORY }) {
    this.world = world; this.player = player; this.canoe = canoe; this.day = day; this.energy = energy; this.hud = hud;
    this.trip = trip; this.veil = veil; this.inv = inventory;
    this.prevMode = player.mode;
    this.busy = false;  // a fetch is under way (its fade)
    this.fade = null;   // the fetch's own fade, when there is no veil
    this.el = null;
    this.leaveOk = false; this.warnAt = -1e9; this.clock = 0;
    this.show();
  }

  // the trip, if it is one (main.js's old `trip` was the saved spot, not a Trip)
  get trip() { const t = this._trip; return t && typeof t.log === 'function' ? t : null; }
  set trip(t) { this._trip = t; }
  get setup() { const t = this.trip; return (t && t.state && t.state.packs) || null; }
  get canoeKind() { const s = this.setup, k = s && s.canoe; return k === 'kevlar' || k === 'royalex' ? k : 'aluminium'; }
  get adventure() { const t = this.trip; return !!(t && t.adventure); }
  get canoeKg() { const g = this.player.gear; return g && g.canoeKg > 0 ? g.canoeKg : WEIGHTS[this.canoeKind]; } // hubs 2B: the canoe in use (shop.js player.gear)
  // the packs and barrels you own (the old count of packs: 1, or 2 for a double portage)
  get count() { return Math.max(1, this.units({ all: true }).filter((u) => u.kind === 'container' && (u.def.wear || []).length).length); }
  get foodDays() { return this.energy && Number.isFinite(this.energy.food) ? Math.max(0, this.energy.food) : 0; }

  // The movable things: every container that is not nested, nor the pockets, nor the outfitters' crate, and every long
  // item; with all false, only those out in the world (not kept at the outfitters).
  units({ all = false } = {}) {
    const inv = this.inv, out = [];
    for (const c of inv.containers) {
      const d = itemDef(c.item);
      if (!d || c.where === 'in' || c.item === 'pockets' || c.item === 'crate') continue;
      if (!all && c.where === 'stash') continue;
      out.push({ kind: 'container', ref: c.id, id: c.item, obj: c, def: d });
    }
    for (const l of inv.long) {
      const d = itemDef(l.id); if (!d) continue;
      if (!all && l.where === 'stash') continue;
      out.push({ kind: 'long', ref: l.uid, id: l.id, obj: l, def: d });
    }
    return out;
  }
  carried() { return this.units().filter((u) => u.obj.where === 'back' || u.obj.where === 'chest' || u.obj.where === 'hands'); }
  // rides lashed in the canoe when it goes overhead: the paddle in use, and the stringer
  lashed(u) { return (u.kind === 'long' && u.obj.inUse) || u.id === 'stringer'; }
  weightOf(u) { return u.kind === 'container' ? this.inv.kgOf(u.obj) : u.def.kg || 0; }

  // what you are carrying, kg: the canoe when it is overhead, and what is on your back, chest and in your hands
  get loadKg() { return (this.player.mode === 'carry' ? this.canoeKg : 0) + this.inv.carriedKg(); }
  // things on the ground away from you (not those set out at camp), for the HUD
  get left() {
    const p = this.player;
    return this.units().filter((u) => u.obj.where === 'ground' && u.obj.at && !u.obj.at.camp).map((u) => ({ kind: u.id, name: the(u), x: u.obj.at.x, z: u.obj.at.z, d: Math.hypot(u.obj.at.x - p.x, u.obj.at.z - p.z) })).filter((k) => k.d > REACH);
  }
  // one line for the readout's Pack row
  get summary() {
    const p = this.player, on = this.carried(), left = this.left, kg = Math.round(this.loadKg);
    const worn = on.filter((u) => u.obj.where !== 'hands'), hand = on.filter((u) => u.obj.where === 'hands');
    let s;
    if (p.mode === 'carry') s = `The canoe${on.length ? ', ' + names(on) : ''} · ${kg} kg`;
    else if (on.length) s = `${cap(names(worn.length ? worn : hand))}${worn.length ? ' on you' : ' in hand'}${worn.length && hand.length ? `, ${names(hand)} in hand` : ''} · ${kg} kg`;
    else {
      const all = this.units(), inCanoe = all.filter((u) => u.obj.where === 'canoe');
      s = all.some((u) => u.obj.where === 'ground' && u.obj.at && u.obj.at.camp) ? 'Packs out at camp' : inCanoe.length === all.length ? (inCanoe.length ? 'Everything in the canoe' : 'Nothing with you') : `${inCanoe.length} ${inCanoe.length === 1 ? 'thing' : 'things'} in the canoe`;
    }
    if (left.length) s += ` · ${left[0].name} ${metres(left[0].d)} back${left.length > 1 ? ` (and ${left.length - 1} more)` : ''}`;
    return s;
  }
  // how many carries a portage from the canoe as it is now takes
  tripsFor() {
    const inCanoe = this.units().filter((u) => (u.obj.where === 'canoe' || this.isCarried(u)) && !this.lashed(u));
    const wear = inCanoe.filter((u) => u.kind === 'container' && (u.def.wear || []).length && !u.def.hand).length;
    const hand = inCanoe.filter((u) => u.kind === 'long' || u.def.hand).length;
    // the first carry takes one on the back and two in hand under the canoe; each one after that two worn and two in hand
    const restW = Math.max(0, wear - 1), restH = Math.max(0, hand - 2);
    return restW || restH ? 1 + Math.max(Math.ceil(restW / 2), Math.ceil(restH / 2), 1) : 1;
  }
  isCarried(u) { return u.obj.where === 'back' || u.obj.where === 'chest' || u.obj.where === 'hands'; }

  // every thing set out for the trip back in the canoe (the old restow)
  restow() { for (const u of this.units()) if (u.obj.where !== 'canoe') this.inv.load(u.ref); }
  // Set the packs out at a camp spot: every pack and barrel that is with you (in the canoe or on you) stands on the
  // ground there, side by side, fronts toward `heading`; the bucket, the rod and the paddle stay in the canoe. They stay
  // there until you pick them up (the camp redone: nothing calls this when the tent goes up any more). Returns how many.
  unload({ x, z, heading = 0 } = {}) {
    const ks = this.units().filter((u) => u.kind === 'container' && (u.def.wear || []).length && (u.obj.where === 'canoe' || u.obj.where === 'back' || u.obj.where === 'chest'));
    const rx = Math.sin(heading), rz = Math.cos(heading); // to the right of the heading
    ks.forEach((u, i) => {
      const o = (i - (ks.length - 1) / 2) * 0.66, px = x + rx * o, pz = z + rz * o;
      this.inv.setDown(u.ref, { x: px, z: pz, y: this.groundUnder(px, pz, heading, u), heading, camp: true }, { left: false, quiet: true, force: true });
    });
    if (ks.length) this.inv.emit('ground');
    return ks.length;
  }

  // ---------------------------------------------------------------------------------------------------------------
  update(dt) {
    const p = this.player, mode = p.mode;
    this.clock += dt / (p.timeScale || 1);
    if (mode !== this.prevMode) this.onMode(this.prevMode, mode);
    this.prevMode = mode;
    this.inv.update(dt);
    if (this.fade) this.updateFade(dt / (p.timeScale || 1));
    const kg = this.loadKg;
    p.loadKg = kg; p.loadFactor = Math.max(1, kg / 40);
    // from the water, a portage that takes more than one carry says so
    const pr = p.prompt;
    if (mode === 'paddle' && pr && pr.key === 'E' && /^Portage: /.test(pr.text) && !/ trips? with /.test(pr.text)) {
      const t = this.tripsFor();
      if (t > 1) p.prompt = { ...pr, text: pr.text.replace(/(\(\d+ m\))/, `$1 · ${t === 2 ? 'two' : t} trips with the gear`) };
    }
    if (this.busy) p.prompt = null;
    this.show();
  }

  onMode(prev, mode) {
    if (mode === 'carry') this.onPickUp();
    else if (prev === 'carry' && mode === 'walk') { for (const u of this.carried()) this.inv.load(u.ref); } // the canoe goes down, and what you carried goes in it
  }

  // The canoe comes up onto your shoulders (at the end of a landing, or off the ground): what was in it comes out onto
  // you: the heaviest pack or barrel on the back (on the chest when your back is taken and it is the only one), the rod
  // and the rest a hand at a time; the paddle in use and the stringer stay lashed in the canoe; whatever is left is set
  // down beside you, for the second trip.
  onPickUp() {
    const p = this.player, inv = this.inv;
    const inCanoe = this.units().filter((u) => u.obj.where === 'canoe' && !this.lashed(u));
    if (!inCanoe.length) return;
    const wear = inCanoe.filter((u) => u.kind === 'container' && (u.def.wear || []).length).sort((a, b) => this.weightOf(b) - this.weightOf(a));
    const back = wear.find((u) => (u.def.wear || []).includes('back'));
    if (back && !inv.worn('back')) inv.carry(back.ref, 'back');
    else if (wear.length === 1 && !inv.worn('chest') && (wear[0].def.wear || []).includes('chest')) inv.carry(wear[0].ref, 'chest');
    const handy = inCanoe.filter((u) => u.obj.where === 'canoe' && (u.kind === 'long' || u.def.hand)).sort((a, b) => rank(a) - rank(b));
    for (const u of handy) if (inv.freeHand() >= 0) inv.carry(u.ref, 'hands');
    const rest = inCanoe.filter((u) => u.obj.where === 'canoe');
    const tr = p.nearestTrail(p.x, p.z, 20), trail = tr ? this.trailKey(tr.def) : null;
    const taken = [];
    for (const u of rest) {
      const s = this.spotNear(p.x, p.z, p.heading, 1, 1, taken);
      taken.push(s);
      inv.setDown(u.ref, { x: s.x, z: s.z, y: this.groundUnder(s.x, s.z, p.heading, u), heading: Math.atan2(-(p.z - s.z), p.x - s.x), trail }, { left: false, quiet: true, force: true });
    }
    if (rest.length) inv.emit('ground');
  }
  // what a free slot on you takes: the back, the chest, a hand
  slotFor(u) {
    const inv = this.inv, w = u.def.wear || [];
    if (u.kind === 'container' && w.includes('back') && !inv.worn('back')) return 'back';
    if (u.kind === 'container' && w.includes('chest') && !inv.worn('chest')) return 'chest';
    if ((u.kind === 'long' || u.def.hand) && inv.freeHand() >= 0) return 'hands';
    return null;
  }
  // Q beside a thing with the canoe overhead: it comes too
  takeToo(u) {
    const r = this.inv.carry(u.ref, this.slotFor(u) || 'auto');
    if (this.hud) this.hud.note(r.ok ? `Everything in one trip: ${Math.round(this.loadKg)} kg.` : r.words || 'No room on you for it.');
  }
  // E beside a thing on foot: onto your back, your chest or into a hand; a pile's things into what you carry
  pickUp(u) {
    const inv = this.inv;
    if (u.id === 'pile') return this.pickUpPile(u.obj);
    const r = inv.carry(u.ref, this.slotFor(u) || 'auto');
    if (!r.ok && this.hud) this.hud.note(r.words || 'No room on you for it.');
    return r.ok;
  }
  pickUpPile(pile) {
    const inv = this.inv; let moved = 0, stuck = 0;
    for (const e of [...pile.grid]) {
      const r = inv.place(e.id, e.qty, { data: e.data || null, exclude: [pile.id], quiet: true });
      if (r.placed) { inv.take(pile.id, e.uid, r.placed); moved++; }
      if (!r.ok) stuck++;
    }
    if (this.hud) this.hud.note(stuck ? 'No room for all of it in what you have with you.' : moved ? 'Picked up.' : 'Nothing to pick up.', 3);
    inv.emit('items');
  }

  // a trail as the inventory saves it: its index and its first point (a def object would put the whole trail in the save)
  trailKey(def) { const i = this.world.portages.indexOf(def), p0 = def.pts && def.pts[0]; return i >= 0 ? { i, x: p0 ? Math.round(p0[0]) : 0, z: p0 ? Math.round(p0[1]) : 0, name: def.name || '' } : null; }
  trailDef(key) {
    if (!key) return null;
    const ps = this.world.portages, d = ps[key.i], ok = (q) => q && q.pts && q.pts[0] && Math.abs(q.pts[0][0] - key.x) < 2 && Math.abs(q.pts[0][1] - key.z) < 2;
    if (ok(d)) return d;
    return ps.find(ok) || null;
  }
  // the ground a thing stands on: the mean of its footprint's corners and middle
  groundUnder(x, z, heading, u = null) {
    const p = this.player, fx = Math.cos(heading), fz = -Math.sin(heading), rx = -fz, rz = fx;
    const w = u && u.kind === 'long' ? 0.05 : 0.22, d = 0.1;
    let y = p.groundAt(x, z);
    for (const [a, b] of [[w, d], [w, -d], [-w, d], [-w, -d]]) y += p.groundAt(x + rx * a + fx * b, z + rz * a + fz * b);
    return y / 5;
  }
  // A spot to set a thing down near (x, z): to one side of `heading` (side +1 the right), toward `fwd` (+1 ahead, -1
  // behind) by preference, on dry ground clear of trunks, rocks, logs, anything built and the things already set down
  // (taken: spots in use).
  spotNear(x, z, heading, side = 1, fwd = 1, taken = null) {
    const fx = Math.cos(heading), fz = -Math.sin(heading), rx = -fz, rz = fx;
    const busy = [...(taken || []), ...this.inv.groundSpots()];
    const free = (px, pz) => !busy.some((s) => Math.hypot(s.x - px, s.z - pz) < 0.62);
    const tries = [[1.3, 0.5], [1.3, -0.3], [1.3, 1.4], [1.9, 0.6], [1.0, 2.2], [2.4, -0.4], [1.6, 3.0], [2.8, 1.4], [0.7, 1.9], [2.2, 2.2], [3.0, 0.3], [1.0, -1.2]];
    for (const s of [side, -side]) for (const [a, b] of tries) {
      const px = x + rx * a * s + fx * b * fwd, pz = z + rz * a * s + fz * b * fwd;
      if (free(px, pz) && this.clearAt(px, pz)) return { x: px, z: pz };
    }
    for (const [a, b] of tries) { const px = x + rx * a * side + fx * b * fwd, pz = z + rz * a * side + fz * b * fwd; if (free(px, pz)) return { x: px, z: pz }; }
    return { x: x + rx * 1.3 * side, z: z + rz * 1.3 * side };
  }
  clearAt(x, z) {
    const w = this.world, p = this.player;
    if (!w.isReady(x, z) || w.shoreAt(x, z) < 0.8) return false;
    const g = p.groundAt(x, z);
    const near = w.tiles ? w.tiles.treesNear(x, z, 3) : [];
    for (const t of near) {
      if (t.shape) { for (const [a, b] of [[0, 0], [0.3, 0], [-0.3, 0], [0, 0.3], [0, -0.3]]) if (t.shape.heightAt(x + a, z + b) > g - 0.05) return false; continue; }
      const dx = x - t.x, dz = z - t.z;
      if (t.box) { if (Math.abs(dx * t.ux + dz * t.uz) < t.hx + 0.45 && Math.abs(-dx * t.uz + dz * t.ux) < t.hz + 0.45) return false; continue; }
      if (dx * dx + dz * dz < ((t.r || 0.3) + 0.45) ** 2) return false;
    }
    // not on a slope it would roll off
    return Math.abs(p.groundAt(x + 0.4, z) - p.groundAt(x - 0.4, z)) < 0.45 && Math.abs(p.groundAt(x, z + 0.4) - p.groundAt(x, z - 0.4)) < 0.45;
  }

  // the rig's own two packs stay hidden: the inventory's things are drawn by containers.js. For the poses (canoe.js,
  // stream D) the rig's state says what rides where: state.held { R, L } (the item id in each hand, or null),
  // state.worn { back, chest } (the item id on the back and the chest, or null)
  show() {
    const c = this.canoe, st = c.state, inv = this.inv;
    if (c.setHullPacks) c.setHullPacks([]);
    st.packOnBack = null; st.packOnChest = null;
    if (c.setPackGround) for (let i = 0; i < 2; i++) c.setPackGround(i, null);
    const h = inv.hands, idOf = (t) => (!t ? null : t.container ? (inv.cont(t.container) || {}).item || null : (inv.longOf(t.long) || {}).id || null);
    const held = st.held || (st.held = { R: null, L: null }), worn = st.worn || (st.worn = { back: null, chest: null });
    held.R = idOf(h[0]); held.L = idOf(h[1]);
    const b = inv.worn('back'), ch = inv.worn('chest');
    worn.back = b ? b.item : null; worn.chest = ch ? ch.item : null;
  }

  // ---------------------------------------------------------------------------------------------------------------
  // The prompts on foot (player.js footPrompts calls this first): true when the packs have said what E and Q do here.
  footPrompts(c, trail, note, trailText) {
    const p = this.player, inp = p.input, w = this.world;
    if (this.busy) { p.prompt = null; return true; }
    const o = window.__game && window.__game.outfitter;
    if (o && o.visit && o.visit.inside) return false; // in a store: the stash is the J book's (stream B), the hotspots are the store's
    const lakeOf = (id) => w.lakeName(id) || 'the water';
    const all = this.units(), from = c.drop || p;
    // what lies on the ground, set out at camp too (camp 1); never a fixed thing (the grate at a fire ring, chores.js)
    // but a pile (its things are picked up)
    const ground = all.filter((u) => u.obj.where === 'ground' && u.obj.at && (!u.def.fixed || u.id === 'pile'));
    // set down for the second trip, at the trail head away from the canoe: of the trail you (or the canoe) are on now
    // (camp 1: a thing left at some other trail head, by a teleport say, no longer holds the canoe's E at a camp)
    const onTrail = (q) => { const t = p.nearestTrail(q.x, q.z, 30); return t ? this.world.portages.indexOf(t.def) : -1; };
    const here = new Set([onTrail(from), onTrail(p)]);
    const left = ground.filter((u) => u.obj.at.trail && here.has(u.obj.at.trail.i) && Math.hypot(u.obj.at.x - from.x, u.obj.at.z - from.z) > LOAD_REACH);
    // the nearest thing in reach, one you have room for first (a barrel beside a pack, with a pack on your back already);
    // past a step and a half only one you face, so a pack set down by the fire does not take E from the fire
    let near = null, nd = REACH, full = null;
    const fx = Math.cos(p.heading), fz = -Math.sin(p.heading);
    for (const u of ground) {
      const dx = u.obj.at.x - p.x, dz = u.obj.at.z - p.z, d = Math.hypot(dx, dz);
      if (d >= REACH || (c.drop && d > 1.6 && (dx * fx + dz * fz) / d < 0.5)) continue;
      const room = u.id === 'pile' || !!this.slotFor(u);
      if (room && (!near || d < nd)) { nd = d; near = u; } else if (!room && !full) full = u;
    }
    if (!near && full) near = full;
    if (!c.drop) {
      // the canoe overhead: beside a thing, Q takes it too; at the far end with things still back at the start, E sets
      // the canoe down to walk back for them, Q launches and leaves them there
      const L = this.carryLaunch(c, trail);
      if (near && (this.slotFor(near) || near.id === 'pile')) {
        p.say(note || trailText, ['Q', `Take ${the(near)} too · one heavy trip`], ['E', L ? `Launch onto ${lakeOf(L.lake)}` : 'Set the canoe down']);
        if (inp.pressed('KeyQ')) { if (near.id === 'pile') this.pickUpPile(near.obj); else this.takeToo(near); }
        else if (inp.pressed('KeyE')) { if (L) p.launch(L); else p.dropHull(true); }
        return true;
      }
      if (left.length && L) {
        p.say(note || trailText, ['E', `Set the canoe down · walk back for ${names(left)}`], ['Q', 'Launch and leave it']);
        if (inp.pressed('KeyE')) p.dropHull(true);
        else if (inp.pressed('KeyQ')) { this.leaveOk = true; p.launch(L); }
        return true;
      }
      return false;
    }
    if (c.choice) return false; // just stepped out: shoulder the canoe or leave it there (player.js)
    const d = c.drop, dd = Math.hypot(d.x - p.x, d.z - p.z);
    // a thing on the ground in reach (not one set down by the canoe for the launch): pick it up; at the trail head you
    // came from, Q has it all carried over
    if (near && !(this.autoLoads(near) && Math.hypot(near.obj.at.x - d.x, near.obj.at.z - d.z) <= LOAD_REACH)) {
      const plan = near.obj.at.trail && Math.hypot(near.obj.at.x - d.x, near.obj.at.z - d.z) > LOAD_REACH ? this.fetchPlan(left) : null;
      const can = near.id === 'pile' || !!this.slotFor(near);
      p.say(note || trailText, can ? ['E', `Pick up ${the(near)}`] : null, plan ? ['Q', `Carry it all over (${aboutHours(plan.hours)})`] : !can ? null : this.carried().length ? ['Q', `Set down ${the(this.lastCarried())}`] : null);
      if (!can && !plan) p.say(note || `${cap(the(near))}: your back and hands are full`);
      if (can && inp.pressed('KeyE')) this.pickUp(near);
      else if (plan && inp.pressed('KeyQ')) this.fetch(left, plan);
      else if (!plan && inp.pressed('KeyQ') && this.carried().length) this.setDownHere(this.lastCarried().ref);
      return true;
    }
    if (left.length) {
      const plan = this.fetchPlan(left), k = left[0];
      const info = `${cap(names(left))} ${left.length > 1 ? 'are' : 'is'} back at the trail head, ${metres(Math.hypot(k.obj.at.x - p.x, k.obj.at.z - p.z))}`;
      if (dd <= HULL_REACH) {
        p.say(note || info, plan ? ['Q', `Fetch ${left.length > 1 ? 'them' : 'it'} (${aboutHours(plan.hours)})`] : null, ['E', 'Shoulder the canoe']);
        if (plan && inp.pressed('KeyQ')) this.fetch(left, plan);
        else if (inp.pressed('KeyE')) p.pickUpHull();
        return true;
      }
      if (plan) {
        p.say(note || trailText || info, ['Q', `Fetch ${left.length > 1 ? 'them' : 'it'} (${aboutHours(plan.hours)})`]);
        if (inp.pressed('KeyQ')) this.fetch(left, plan);
        return true;
      }
      return false;
    }
    const carried = this.carried();
    if (dd <= HULL_REACH) {
      // at the canoe with things on you: E loads them in
      if (carried.length) {
        p.say(note, ['E', `Load ${names(carried)} into the canoe`], ['Q', 'Shoulder the canoe']);
        if (inp.pressed('KeyE')) { for (const u of carried) this.inv.load(u.ref); if (this.hud) this.hud.note(`${cap(names(carried))} in the canoe.`, 3); }
        else if (inp.pressed('KeyQ')) p.pickUpHull();
        return true;
      }
      // camp 1: things set out about the canoe (at a camp, or set down by hand near it): a held E loads everything here,
      // Q launches and leaves them (or shoulders the canoe where there is no water to launch onto)
      const lo = this.loadables(d);
      if (lo.some((u) => !this.autoLoads(u))) {
        const L = this.dropLaunch(d), kg = Math.round(lo.reduce((s, u) => s + this.weightOf(u), 0));
        p.say(note, ['E', `Load everything here · hold · ${lo.length > 3 ? `${lo.length} things` : names(lo)}, ${kg} kg`], L && L.deep ? ['Q', 'Launch and leave them'] : ['Q', 'Shoulder the canoe']);
        if (inp.pressed('KeyE')) hold.begin(this.loadAllOpts(d, lo));
        else if (inp.pressed('KeyQ')) { if (L && L.deep) p.launch(L); else p.pickUpHull(); }
        return true;
      }
      // everything together: E loads up (when something set down for the trip is not in the canoe yet) and launches,
      // from the trail's own launch point when the canoe lies at a trail end. With everything in the canoe this is a
      // canoe set down at a trail end (set down to fill the bottle, say): player.js alone would find no water within
      // reach of it up the bank and offer only to shoulder it, and E overhead would set it straight down again.
      const L = this.dropLaunch(d), load = all.some((u) => u.obj.where === 'ground' && this.autoLoads(u) && Math.hypot(u.obj.at.x - d.x, u.obj.at.z - d.z) <= LOAD_REACH);
      if (L && L.deep) {
        p.say(note, ['E', `${load ? 'Load up and launch' : 'Launch'} onto ${lakeOf(L.lake)}`], ['Q', 'Shoulder the canoe']);
        if (inp.pressed('KeyE')) p.launch(L);
        else if (inp.pressed('KeyQ')) p.pickUpHull();
        return true;
      }
      return false;
    }
    // away from the canoe with things on you: Q sets one down (a hand's first, then the chest, then the back)
    if (carried.length) {
      const u = this.lastCarried();
      p.say(note || trailText || `The canoe is ${dd < 1000 ? `${dd.toFixed(0)} m` : `${(dd / 1000).toFixed(1)} km`} away`, ['Q', `Set down ${the(u)}`]);
      // only Q here: the camp's E or a berry patch's may take the line, keeping the Q (camp.js, forage.js)
      if (p.prompt) Object.assign(p.prompt, { soft: true, tail: ` &nbsp; <kbd>Q</kbd>Set down ${the(u)}` });
      if (inp.pressed('KeyQ')) { const r = this.setDownHere(u.ref); if (this.hud && r.words) this.hud.note(r.words, 2.5); }
      return true;
    }
    return false;
  }
  lastCarried() { const c = this.carried(); return c.find((u) => u.obj.where === 'hands') || c.find((u) => u.obj.where === 'chest') || c[0]; }
  // set down for the trip (a trail head, the camp), not by hand: it goes in at the launch
  autoLoads(u) { const a = u.obj.at; return !!(a && !a.left && a.trail); }
  // Q: set it down at your feet; within a site's area (or by your own tent) it is set out at camp (camp.js reachArea)
  setDownHere(ref) {
    const r = this.inv.setDown(ref), camp = this.inv.camp, a = camp && camp.reachArea ? camp.reachArea() : null, t = this.inv.thing(ref);
    if (r.ok && a && t && t.obj.at) t.obj.at.camp = a.key || 'camp';
    return r;
  }

  // --- repacking the canoe (camp 1) ----------------------------------------------------------------------------------
  // What a held E at the canoe lying at d would load: the things on the ground about it (the camp's reach where it lies
  // at a camp, else within LOAD_REACH of it), not fixed, not left at a trail head (the fetch's), nearest the hull first
  loadables(d) {
    const camp = this.inv.camp, a = camp && camp.areaAt ? camp.areaAt(d.x, d.z) : null;
    const within = (at) => (a ? Math.hypot(at.x - a.x, at.z - a.z) <= a.r : false) || Math.hypot(at.x - d.x, at.z - d.z) <= LOAD_REACH;
    return this.units().filter((u) => u.obj.where === 'ground' && u.obj.at && (!u.def.fixed || u.id === 'pile') && !(u.obj.at.trail && !this.autoLoads(u)) && within(u.obj.at))
      .sort((u, v) => Math.hypot(u.obj.at.x - d.x, u.obj.at.z - d.z) - Math.hypot(v.obj.at.x - d.x, v.obj.at.z - d.z));
  }
  // the gear in the canoe now, kg (the containers and the long items lying in it)
  canoeGearKg() {
    let kg = 0;
    for (const u of this.units()) if (u.obj.where === 'canoe') kg += this.weightOf(u);
    return kg;
  }
  // one thing into the canoe: a container or a long item as it is, a pile's things into the canoe's containers; false
  // (with why) when the canoe has no room for it by count or by weight
  loadOne(u) {
    const inv = this.inv;
    if (u.obj.where !== 'ground') return { ok: true };
    const kg = this.weightOf(u);
    if (this.canoeGearKg() + kg > CANOE_KG) return { ok: false, why: 'kg' };
    if (u.id === 'pile') {
      const pool = inv.containers.filter((c) => inv.rootWhere(c) === 'canoe');
      let stuck = 0;
      for (const e of [...u.obj.grid]) { const r = inv.place(e.id, e.qty, { data: e.data || null, pool, quiet: true }); if (r.placed) inv.take(u.obj.id, e.uid, r.placed); if (!r.ok) stuck++; }
      inv.emit('items');
      return stuck ? { ok: false, why: 'full' } : { ok: true };
    }
    // carried down to the hull: inventory.load's move without its reach (the thing may lie across the site)
    if (u.kind === 'container' && inv.containers.filter((c) => c.where === 'canoe').length >= CANOE_ROOM) return { ok: false, why: 'full' };
    const o = u.obj;
    o.where = 'canoe'; o.at = null; o.hand = null;
    inv.emit('load');
    return { ok: true };
  }
  // the held E at the hull: each thing a phase (its minutes a little more the farther it lies), loaded as its phase
  // ends; let go and what is in is in. A word at the end for what would not go.
  loadAllOpts(d, list) {
    const p = this.player, skipped = [];
    const phases = list.map((u) => { const m = Math.hypot(u.obj.at.x - d.x, u.obj.at.z - d.z); return { name: `${cap(short(u))} in`, doing: `Loading ${the(u)}`, minutes: LOAD_EACH.minutes + (m / 100) * LOAD_EACH.per100m, seconds: LOAD_EACH.seconds + Math.min(0.6, m / 40) }; });
    const done = (n) => {
      const inN = n - skipped.length;
      if (this.hud) this.hud.note(`${inN ? `${inN === list.length ? 'Everything is' : `${inN} ${inN === 1 ? 'thing' : 'things'}`} in the canoe` : 'Nothing went in'}${skipped.length ? `; no room for ${names(skipped)}${skipped.some((s) => s.why === 'kg') ? ` (the canoe has its ${CANOE_KG} kg)` : ''}` : ''}.`, 4);
    };
    return {
      id: 'load', label: 'Loading the canoe', phases, at: 0, near: { x: p.x, z: p.z, r: 1.5 },
      onPhase: (i) => { const r = this.loadOne(list[i]); if (!r.ok) skipped.push(Object.assign(list[i], { why: r.why })); },
      onDone: () => done(list.length),
      onStop: (job) => { if (job.done) done(job.done); },
    };
  }

  // Where the canoe overhead would launch from here, as player.js's carrying prompt finds it: a trail end within 5 m,
  // or a shore with a metre of water in reach, once you have walked a few steps from where you shouldered it.
  carryLaunch(c, trail) {
    const p = this.player, w = this.world;
    if (c.from && Math.hypot(c.from.x - p.x, c.from.z - p.z) <= 6) return null;
    let L = null;
    if (trail && trail.dist < 12) {
      const pts = trail.trail.pts, e0 = pts[0], e1 = pts[pts.length - 1];
      const d0 = Math.hypot(e0[0] - p.x, e0[1] - p.z), d1 = Math.hypot(e1[0] - p.x, e1[1] - p.z);
      if (Math.min(d0, d1) < 5) { const l = trail.def.launch[d1 < d0 ? 1 : 0]; L = { x: l.x, z: l.z, lake: l.lake, deep: true }; }
    }
    if (!L && w.shoreAt(p.x, p.z) < 8) L = p.launchFrom(p.x, p.z, 12);
    return L && L.deep ? L : null;
  }

  // Where a canoe lying at d launches from: the trail's launch point when it lies at a trail end (where the far end
  // of a double portage leaves it), else the open water player.js finds from it.
  dropLaunch(d) {
    const p = this.player, tr = p.nearestTrail(d.x, d.z, 15);
    if (tr) {
      const pts = tr.trail.pts, e0 = pts[0], e1 = pts[pts.length - 1];
      const d0 = Math.hypot(e0[0] - d.x, e0[1] - d.z), d1 = Math.hypot(e1[0] - d.x, e1[1] - d.z);
      if (Math.min(d0, d1) < 12) { const l = tr.def.launch[d1 < d0 ? 1 : 0]; return { x: l.x, z: l.z, lake: l.lake, deep: true }; }
    }
    return p.launchFrom(d.x, d.z, 8);
  }

  // A reload in the middle of a carry (main.js, camp 1): back on the trail where the save left you, the canoe on your
  // shoulders and what you carried still on you (the inventory kept it there), rather than afloat with it all in the
  // hull. False when the spot is not on land with its tile in (then the canoe goes back on the water, as before).
  resumeCarry(s) {
    const p = this.player, w = this.world;
    if (!s || s.mode !== 'carry' || !Number.isFinite(s.x) || !Number.isFinite(s.z)) return false;
    if (!w.isReady(s.x, s.z) || !w.inBounds(s.x, s.z, 40) || w.shoreAt(s.x, s.z) <= 0.3) return false;
    p.mode = 'carry'; p.x = s.x; p.z = s.z; p.heading = Number.isFinite(s.heading) ? s.heading : 0;
    p.speed = 0; p.yawRate = 0; p.foot = null; p.act = null; p.boost = 1;
    p.landing = null; p.ashore = null; p.swim = null; p.bob = null;
    p.carry = { trail: null, drop: null, hitCooldown: 1.0, from: { x: s.x, z: s.z }, choice: false };
    this.canoe.pickUpHull(); this.canoe.state.mode = 'carry';
    if (p.placeOnGround) p.placeOnGround();
    this.prevMode = 'carry';
    return true;
  }

  // Before player.js launches: no paddle, no launch; something still back at the trail head stops it once (E again,
  // or Q at the far end, leaves it there); then what you carry and what was set down for the trip by the canoe go into
  // the canoe. What you set down by hand, and whatever is set out at a camp, stays where it is (camp 1).
  beforeLaunch() {
    const p = this.player, c = p.carry, from = c && c.drop ? c.drop : p, inv = this.inv, all = this.units();
    const near = (u, r) => u.obj.at && (Math.hypot(u.obj.at.x - from.x, u.obj.at.z - from.z) <= r || Math.hypot(u.obj.at.x - p.x, u.obj.at.z - p.z) <= r);
    const paddles = all.filter((u) => u.kind === 'long' && u.def.long === 'paddle');
    if (paddles.length && !paddles.some((u) => u.obj.where === 'canoe' || u.obj.where === 'hands' || (u.obj.where === 'ground' && near(u, LOAD_REACH)))) {
      if (this.hud) this.hud.note('No paddle with you: it is still where you left it.', 5);
      return false;
    }
    const onTrail = (q) => { const t = p.nearestTrail(q.x, q.z, 30); return t ? this.world.portages.indexOf(t.def) : -1; };
    const here = new Set([onTrail(from), onTrail(p)]); // camp 1: only the trail you launch from (not one left far off)
    const far = all.filter((u) => u.obj.where === 'ground' && u.obj.at && u.obj.at.trail && here.has(u.obj.at.trail.i) && !u.obj.at.left && !near(u, LOAD_REACH));
    if (far.length && !this.leaveOk) {
      if (this.clock - this.warnAt > LEAVE_AGAIN) {
        this.warnAt = this.clock;
        if (this.hud) this.hud.note(`${cap(names(far))} ${far.length > 1 ? 'are' : 'is'} still back at the trail head. E again to leave ${far.length > 1 ? 'them' : 'it'} there.`, 5);
        return false;
      }
    }
    this.leaveOk = false;
    if (far.length) { for (const u of far) { u.obj.at.left = true; u.obj.at.noted = true; } if (this.hud) this.hud.note(`You push off and leave ${names(far)} at the trail head.`, 5); }
    for (const u of all) {
      const o = u.obj;
      if (this.isCarried(u)) inv.load(u.ref);
      else if (o.where === 'ground' && o.at && !o.at.left && o.at.trail && near(u, LOAD_REACH)) { o.at = null; o.where = 'canoe'; } // camp 1: never what is set out at a camp
      else if (o.where === 'ground' && u.kind === 'long' && u.obj.inUse && near(u, LOAD_REACH)) { o.at = null; o.where = 'canoe'; }
    }
    inv.emit('load');
    return true;
  }

  // ---------------------------------------------------------------------------------------------------------------
  // The fetch: the walk back to what is left at the trail head and the carry over to the canoe, as distances along the
  // trail (and off it), as many trips as it takes (two worn and two in hand each), the time they take at a walk, and
  // the energy the walks cost.
  fetchPlan(left) {
    const p = this.player, c = p.carry;
    if (!c || !c.drop || !left || !left.length) return null;
    const key = left[0].obj.at.trail, def = this.trailDef(key);
    if (!def) return null;
    const these = left.filter((u) => u.obj.at.trail && u.obj.at.trail.i === key.i);
    const tr = p.trailFor(def), k = these[0].obj.at;
    const a = p.nearestOnTrail(tr, k.x, k.z), b = p.nearestOnTrail(tr, c.drop.x, c.drop.z), you = p.nearestOnTrail(tr, p.x, p.z);
    if (b.dist > 25 || you.dist > 30) return null;
    const wear = these.filter((u) => u.kind === 'container' && (u.def.wear || []).length && !u.def.hand).length, hand = these.length - wear;
    const trips = Math.max(1, Math.ceil(wear / 2), Math.ceil(hand / 2));
    const kg = these.reduce((s, u) => s + this.weightOf(u), 0) / trips;
    const back1 = Math.abs(you.along - a.along) + you.dist + a.dist, over = Math.abs(a.along - b.along) + a.dist + b.dist;
    const back = back1 + (trips - 1) * over; // the first walk back from where you stand, then from the canoe each time
    const walk = LIFE.walk * TRAIL_GOING, laden = Math.max(LIFE.carry, walk / Math.pow(Math.max(1, kg / 40), 0.6));
    const backH = back / walk / 3600, overH = (over * trips) / laden / 3600, hours = backH + overH; // game hours: the walks' own time at life
    return { back, over, trips, seconds: hours * 3600, hours, cost: BASE_H * hours + CARRY_H * (kg / 40) * overH, trail: def.name, units: these };
  }

  fetch(left, plan) {
    if (this.busy) return;
    this.busy = true;
    const onDark = () => this.arrive(plan);
    const card = { kicker: plan.trail || 'The portage', text: `Back for ${names(plan.units)}`, sub: cap(aboutHours(plan.hours)) + (plan.trips > 1 ? ` · ${plan.trips} trips` : ''), fadeIn: 0.6, hold: 1.2, fadeOut: 0.9, onDark };
    const veil = this.veil || (this.trip && this.trip.veil) || (window.__game && window.__game.veil) || null; // veil.js (stream A), when there
    if (veil && typeof veil.card === 'function') {
      const done = () => { this.busy = false; };
      Promise.resolve(veil.card(card)).then(done, done);
    } else this.fade = { t: 0, card, dark: false };
  }

  // at full dark: the clock and the energy move on, what was left stands by the canoe, and you beside it
  arrive(plan) {
    const p = this.player, c = p.carry, d = c && c.drop;
    if (!d) return;
    this.advanceClock(plan.hours);
    this.spend(plan.cost);
    const taken = [];
    for (const u of plan.units) {
      if (u.obj.where !== 'ground') continue;
      const s = this.spotNear(d.x, d.z, d.heading, 1, -1, taken); taken.push(s);
      this.inv.setDown(u.ref, { x: s.x, z: s.z, y: this.groundUnder(s.x, s.z, d.heading, u), heading: Math.atan2(-(d.z - s.z), d.x - s.x), trail: u.obj.at && u.obj.at.trail }, { left: false, quiet: true, force: true });
    }
    this.inv.emit('ground');
    const y = this.spotNear(d.x, d.z, d.heading, -1, -1);
    p.x = y.x; p.z = y.z; p.speed = 0; p.foot = null;
    p.heading = Math.atan2(-(d.z - y.z), d.x - y.x);
    const ch = p.chase;
    if (ch) { ch.viewYaw = ch.forwardYaw = p.heading; if (ch.snap) ch.snap(); }
    if (this.trip) this.trip.log('fetch', { kind: plan.units.map((u) => u.id).join(','), trail: plan.trail, hours: plan.hours, trips: plan.trips });
    if (this.hud) this.hud.note(`You walked back for ${names(plan.units)} and carried ${plan.units.length > 1 ? 'them' : 'it'} over: ${aboutHours(plan.hours).replace('about ', '')}.`);
  }

  // the clock forward by h hours, across midnight (day.advance when daycycle.js has it)
  advanceClock(h) {
    const d = this.day;
    if (typeof d.advance === 'function') { d.advance(h); return; }
    const H = d.hours + h, days = Math.floor(H / 24);
    d.setClock(d.year, d.doy + days, H - days * 24);
  }
  spend(x) {
    const e = this.energy;
    if (!e || !(x > 0)) return;
    if (typeof e.spend === 'function') e.spend(x);
    else if (this.adventure) e.value = Math.max(0, e.value - x); // a sandbox trip spends nothing
  }

  // the fetch's own fade, per frame (real seconds), when no veil is there to show it
  updateFade(dt) {
    const f = this.fade, c = f.card, el = this.fadeEl();
    if (f.t === 0) { el.children[0].textContent = c.kicker || ''; el.children[1].textContent = c.text; el.children[2].textContent = c.sub || ''; }
    f.t += dt;
    if (!f.dark && f.t >= c.fadeIn) { f.dark = true; c.onDark(); }
    const t = f.t, a = c.fadeIn, b = a + c.hold, e = b + c.fadeOut;
    el.style.opacity = String(t < a ? t / a : t < b ? 1 : Math.max(0, 1 - (t - b) / c.fadeOut));
    if (t >= e) { this.fade = null; this.busy = false; el.style.opacity = '0'; }
  }
  fadeEl() {
    if (this.el) return this.el;
    const el = document.createElement('div');
    el.id = 'packs-fade';
    el.style.cssText = 'position:fixed;inset:0;background:var(--deep,#16201c);opacity:0;pointer-events:none;z-index:7;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;color:var(--cream,#f3ecdd);font-family:var(--sans,sans-serif);text-align:center;padding:0 8vw';
    el.innerHTML = '<div style="font-size:13px;letter-spacing:.22em;text-transform:uppercase;opacity:.72"></div><p style="margin:0;font:italic 30px/1.45 var(--serif,serif)"></p><p style="margin:0;font-size:16px;opacity:.66"></p>';
    document.body.appendChild(el);
    return (this.el = el);
  }
}

// the order a free hand takes things in, with the canoe coming up: the rod first, then the bucket, the tackle box…
function rank(u) { const i = HAND_ORDER.indexOf(u.id); return i < 0 ? (u.kind === 'long' ? HAND_ORDER.length : 8) : i; }
