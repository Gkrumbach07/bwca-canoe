// Packs and portages (trip core B; the owner's feedback of 2026-10-24, stream A): a portage carries everything you own
// across, the way trippers do. What you own is the inventory's (inventory.js): containers (the Duluth packs, the blue
// barrels, the leech bucket, the tackle box, the stringer) and long items (the rod, the paddles), each in the canoe, on
// your back or chest, in a hand, on the ground, or kept at the outfitters. On a carry you have:
//   - the canoe overhead, with the paddle in use and the stringer lashed under the thwarts;
//   - one pack (or a barrel) on your back, and with Q one more on your chest;
//   - one thing in each hand: the rod, the bucket, the tackle box, a spare paddle.
// Nothing moves by itself (fb3 A, the owner's feedback of 2026-10-25: "a lot of auto loading into the canoe which is
// confusing", "when i drop the canoe and i have stuff on my body, it automatically goes into the canoe which is wrong",
// "what can be in the canoe when i shoulder it, i thought it had to be empty, but the stringer and the fishing pole can
// still be in there?"). The double portage runs the BWCA way, by your own hands:
//   1. a portage landing is a landing like any other (player.js): you step out at the put-in with the canoe beached;
//   2. the canoe is unloaded from the book (its Here pane: Set everything out, or a strap dragged to your back, chest
//      or a hand). Only lashed long things ride in it when it goes overhead: the paddle in use, the rod and the stringer;
//      with anything else in it the hull's Q reads "Unload it first" and opens the book with the canoe on the right;
//   3. Q on the hull shoulders it with what you carry on you; Q beside a thing at the trail head takes it too (onto the
//      chest, or into a free hand), for one heavy trip;
//   4. at the far end the canoe goes down with only its lashed things in it, and what you carry stays on you; you walk
//      back for the rest (E pointed at a thing picks it up), or Q fetches it all: a short fade, the clock moves on by
//      the walks back and the carries over (as many trips as it takes, at life pace: pace.js), the walks' energy is
//      spent, and it all stands by the canoe;
//   5. E pointed at the canoe gets in only where it floats, both ends over water (afloat); nosed in, an end up the bank
//      (beached), or lying on the bank by the water, E is held: "Push it off" walks it out until both ends float, you
//      in the shallows beside it (pushPlan, beginPush). Then E "Get in" puts you in it where it floats, facing as it
//      lies (fb4 A, the owner's second round of 2026-10-25: "it's pretty easy to accidentally get back in the canoe,
//      which basically teleports you a little bit further out into the water facing away ... once you nose in, you
//      have to nose it back out. If it's already in the water, you can just press get in, and then it'll just put you
//      right in the water where it was"). Getting in, what you wear goes into the hull (back, chest, hands: paddling
//      needs you unloaded), with one note; stepping out, nothing comes back out by itself.
// On foot elsewhere (fb2 A, the owner's second feedback of 2026-10-24): E is the pointer's (pointer.js, nearby.js): a
// thing on the ground pointed at is picked up (onto the back, the chest or a hand; a pile's things into what you carry),
// and the canoe pointed at is got into (what you carry goes in with you) or shouldered. There is no Q drop: things are
// set down, loaded and unloaded from the book (stream B's pack side: inventory.carry / setDown / load).
// wc A (the world cards, the owner's third round of 2026-10-24: "canoe can be picked up with items in it"): the canoe
// pointed at reads "E Get in · Q Shoulder it" (hullAction), and with anything riding in it but the lashed things its Q
// reads "Unload it first" (canShoulder; fb3 A: the Q then opens the book at the canoe, this.openCanoe from main.js);
// the book's Here pane (stream B) empties it with setOutAll and fills it with loadAll.
// At a camp (the camp redone, 2026-10-24: "it doesnt do it automatically when you leave, and you CAN leave stuff. you
// need to repack bags in canoe"): nothing is set out when the tent goes up and nothing goes back in the canoe at the
// launch. What is set out at camp is picked up like anything on the ground (never a fixed thing, the grate); set down
// from the book within a site's area it counts as set out at camp. At the canoe with things still on the ground about
// it (the camp's reach where it lies at a camp, else LOAD_REACH of the hull), the canoe's panel in the book (nearby.js)
// loads everything there, held, a thing a phase (hold.js: loadAllOpts), while the canoe has room by count and by
// weight. A reload in the middle of a carry comes back on the trail with the canoe overhead and the carry still on you
// (resumeCarry, main.js).
//
// Each frame (after player.update) it writes player.loadKg (the canoe when it is overhead, plus what you carry, by the
// items' own weights) and player.loadFactor = max(1, loadKg / 40), which player.js's walking pace and energy.js's carry
// drain read, and runs the inventory's frame (inventory.update). Two hooks in player.js call in: footPrompts (the
// prompts on foot, where the things you carry change them) and beforeLaunch.

import { LIFE, SEEN, footHours } from './pace.js';
import { BASE_H, CARRY_H } from './energy.js';
import { inventory as INVENTORY } from './inventory.js';
import { itemDef } from './items.js';
import { hold } from './hold.js'; // camp 1: the held "Load everything here"

export const WEIGHTS = { aluminium: 34, royalex: 29, kevlar: 20, gear: 16, foodPack: 2, foodDay: 0.9 }; // kg (the canoes; the rest is the items' own)
const REACH = 3;            // m from a thing on the ground within which you pick it up or take it too
const HULL_REACH = 3;       // m from the canoe within which its prompts apply (player.js)
const LOAD_REACH = 10;      // m from the canoe within which a thing set down for the trip goes in at the launch
const CANOE_KG = 160;       // kg of gear a tripping canoe takes besides its paddler ("Load everything here" stops there)
const CANOE_ROOM = 8;       // containers a canoe takes (inventory.js CANOE_ROOM)
const LOAD_EACH = { minutes: 1, seconds: 0.45, per100m: 2.5 }; // a thing carried down and loaded: its minutes (more the farther it lies), its real seconds
// the fetch is charged what walking it yourself costs on the clock (pace.js footHours: life's hours times the clock over
// the trail's seen time-lapse, fb5 C): the walk back at a walk on the trail's going,
// the carry over at a walk slowed by the load (player.js LOAD: / (kg / 40) ^ 0.35 past 40 kg, and no slower than a
// canoe carry)
const TRAIL_GOING = 0.9;    // a portage trail's roots, rocks and grades against a walk on the flat
// fb4 A: the canoe floats, for E Get in, when both ends (END m from the middle) lie past FLOATS.sd from the waterline
// (shoreAt, m) over FLOATS.depth of water (m), and its middle past FLOATS.mid: player.js's paddle wants its ends past
// -0.5 and its middle past -1.2, so a hull got into where it floats can always be paddled off. Short of that it is
// beached, and a held E pushes it off: PUSH.brace s of hands on the gunwales (a tap moves nothing), then the slide out
// to where it floats over PUSH.secs plus PUSH.perM a metre, marched out from the waterline PUSH.step at a time up to
// PUSH.reach m; you end beside its middle (PUSH.beside m off the keel), in no deeper than PUSH.wade m of water.
const FLOATS = { sd: -0.7, mid: -1.4, depth: 0.12 };
const END = 2.3;
const PUSH = { brace: 0.35, secs: 0.6, perM: 0.4, step: 0.25, reach: 16, beside: 0.95, wade: 0.8 };
const TAG_TRAIL = 15;       // m from a portage trail within which a thing set down counts as left at that trail (the fetch)
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const lower = (s) => (/^(Duluth|Johnson|Mepps|Rapala|Lazy Ike|[A-Z]-)/.test(s) ? s : s.charAt(0).toLowerCase() + s.slice(1)); // (a name keeps its capital)
const metres = (d) => (d < 1000 ? `${Math.round(d)} m` : `${(d / 1000).toFixed(1)} km`);
// game hours as the prompt says them: "about 35 min", "about 1 h 10"
export function aboutHours(h) {
  const m = Math.max(5, Math.round((h * 60) / 5) * 5);
  return m < 60 ? `about ${m} min` : `about ${Math.floor(m / 60)} h${m % 60 ? ' ' + String(m % 60).padStart(2, '0') : ''}`;
}
// a thing's name in a prompt: "the Duluth pack #3", "the rod"
const SHORT = { pack3: 'pack', pack4: 'big pack', barrel30: 'small barrel', barrel60: 'barrel', bucket: 'leech bucket', tacklebox: 'tackle box', mapcase: 'map case', stringer: 'stringer', rod: 'rod', rodmh: 'rod', ash: 'paddle', bentshaft: 'paddle', carbon: 'paddle', pile: 'things on the ground' };
// (a hand's holder, stream B's 'inhand', is named by the thing in it: "the trail mix", not "the in your hand")
// (a holder's thing, or a pile's one thing: fb4 join, "no room for the A-frame tent", not "the things on the ground")
const short = (u) => { const g = u.obj.grid, e = (u.def.one || (u.id === 'pile' && g && g.length === 1)) && g && g[0], d = e && itemDef(e.id); return d ? lower(d.name) : SHORT[u.id] || lower(u.def.name); };
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
    this.leaveOk = false; this.clock = 0;
    this.push = null;   // fb4 A: the push under way, a held job (beginPush): { from, to, you, youFrom, dur, dist }
    this.tagT = 0;      // fb3 A: the next look for things set down by a trail (tagTrailThings)
    this.openCanoe = null; // fb3 A, main.js: opens the book with the canoe on the right (journal.openHere('canoe'))
    // wc A: the rod held in a hand (stream C's fishing.canFishOnFoot reads inventory.rodInHand): the long item, or null
    const inv = this.inv;
    if (inv && !('rodInHand' in inv)) Object.defineProperty(inv, 'rodInHand', { configurable: true, get() { return this.long.find((l) => l.where === 'hands' && (itemDef(l.id) || {}).long === 'rod') || null; } });
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
  // rides lashed in the canoe when it goes overhead: the paddle in use, the rod and the stringer (fb3 A, decision 3:
  // lashed long things only; a pack, a barrel, the bucket, the tackle box and loose things must come out)
  lashed(u) { return (u.kind === 'long' && (u.obj.inUse || u.def.long === 'rod')) || u.id === 'stringer'; }
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
    // camp join: the tent left standing at a camp you have paddled away from
    const cp = this.inv.camp, tent = cp && cp.camp, td = tent ? Math.hypot(tent.x - p.x, tent.z - p.z) : 0;
    if (tent && td > 60) s += ` · the tent ${tent.stage >= 4 ? 'up' : 'half pitched'} ${metres(td)} back`;
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
    if (this.push && !hold.is('pushOff')) this.push = null; // (the held job moves it: beginPush's onTick)
    if ((this.tagT -= dt) <= 0) { this.tagT = 1; this.tagTrailThings(); }
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

  // fb3 A: nothing moves by itself at either end of a carry. The canoe comes up with only its lashed things in it
  // (canShoulder refuses the rest), and when it goes down what rides on you stays on you (it had gone into the hull: the
  // owner, 2026-10-25, "when i drop the canoe and i have stuff on my body, it automatically goes into the canoe which is
  // wrong"). A push under way ends with the mode.
  onMode(prev, mode) { if (mode !== 'walk') { if (this.push && hold.is('pushOff')) hold.cancel(); this.push = null; } }
  // a thing set down by hand within TAG_TRAIL of a portage trail is left at that trail (its key on `at`), so the fetch
  // from the far end finds it; never what is set out at a camp (nothing is set down by itself any more, so nothing else
  // writes the key)
  tagTrailThings() {
    const p = this.player;
    for (const u of this.units()) {
      const at = u.obj.at;
      if (u.obj.where !== 'ground' || !at || at.trail || at.camp || Math.hypot(at.x - p.x, at.z - p.z) > 60) continue;
      const tr = p.nearestTrail(at.x, at.z, TAG_TRAIL);
      if (tr) { const k = this.trailKey(tr.def); if (k) at.trail = k; }
    }
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
      // (fb5 join: no room in the packs, a free hand takes it, as hands take anything: the struck tent with the left hand
      // free said "No room for all of it")
      if (!r.ok && pile.grid.includes(e) && typeof inv.canHand === 'function' && inv.canHand(e.id) && inv.freeHand() >= 0 && inv.toHand(pile.id, e.uid).ok) { moved++; continue; }
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
  // fb4 join (stream A's leftover: a thing set down while you stood in the shallows went onto the lake bed): ground a
  // thing set down at (x, z) stands on above the water
  dryAt(x, z) {
    const w = this.world;
    if (!w.isReady(x, z)) return false;
    return w.shoreAt(x, z) >= 1 || this.player.groundAt(x, z) > w.levelAt(x, z) + 0.05;
  }
  // the nearest dry spot within r m of (x, z), clear of trunks and rocks if one is (clearAt), free of the things set
  // down; null when there is no dry ground that near (you stand out in the water)
  drySpotNear(x, z, r = 2.5, taken = null) {
    const busy = [...(taken || []), ...this.inv.groundSpots()];
    const free = (px, pz) => !busy.some((s) => Math.hypot(s.x - px, s.z - pz) < 0.62);
    let loose = null;
    for (let d = 0.5; d <= r + 1e-6; d += 0.25) for (let k = 0; k < 24; k++) {
      const a = (k / 24) * Math.PI * 2, px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d;
      if (!free(px, pz) || !this.dryAt(px, pz)) continue;
      if (this.clearAt(px, pz)) return { x: px, z: pz };
      if (!loose) loose = { x: px, z: pz };
    }
    return loose;
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
      // (the content join: a thing set down a few steps off at this end, past your reach under the canoe and short of
      // "back at the trail head", was left behind without a word as E launched: twice, the leech bucket)
      const here = !left.length && L ? ground.filter((u) => u.obj.at.trail && u.obj.at.trail.i === this.world.portages.indexOf(trail && trail.def) && Math.hypot(u.obj.at.x - p.x, u.obj.at.z - p.z) <= LOAD_REACH) : [];
      if (here.length) {
        p.say(note || trailText, ['E', `Set the canoe down · ${names(here)} ${here.length > 1 ? 'are' : 'is'} here`], ['Q', 'Launch and leave it']);
        if (inp.pressed('KeyE')) p.dropHull(true);
        else if (inp.pressed('KeyQ')) { this.leaveOk = true; for (const u of here) u.obj.at.noted = false; p.launch(L); }
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
    // fb2 A (the owner's second feedback of 2026-10-24: "E is like your interact button. But it's really just like your
    // pickup button", and no Q drop): on foot with the canoe lying by, E is the pointer's (pointer.js; nearby.js asks
    // hullAction for the hull's: get in, or shoulder it), a thing on the ground is picked up by pointing at it, and
    // things are set down from the book. What stays on Q is travel: leave the canoe where you stepped out, the fetch
    // from the trail head, shouldering the canoe at the hull.
    // fb3 A: no "Leave it here" after stepping out and no Q on this line at the hull: the dot on the hull has both keys
    // (E Get in, or, beached, a held E Push it off; Q Shoulder it, or "Unload it first")
    const d = c.drop, dd = Math.hypot(d.x - p.x, d.z - p.z);
    c.choice = false;
    const plan = left.length ? this.fetchPlan(left) : null, k = left[0];
    const info = k ? `${cap(names(left))} ${left.length > 1 ? 'are' : 'is'} back at the trail head, ${metres(Math.hypot(k.obj.at.x - p.x, k.obj.at.z - p.z))}` : null;
    if (plan) {
      p.say(note || (dd <= HULL_REACH ? info : trailText || info), ['Q', `Fetch ${left.length > 1 ? 'them' : 'it'} (${aboutHours(plan.hours)})`]);
      if (inp.pressed('KeyQ')) this.fetch(left, plan);
      return true;
    }
    if (dd <= HULL_REACH) {
      // fb5 join (rule 5, quiet by default): no standing line about the hull ("the canoe is beached: point at it and hold
      // E to push it off" read at a portage, where you carry it): the dot on it says its verbs, and the push and unload
      // moments (hints.js) teach them the first time
      p.say(note || info);
      return true;
    }
    p.say(note || trailText || info); // (fb5 join, rule 5: not "The canoe is 12 m away" standing at camp or in the store; the world shows the canoe)
    return true;
  }
  // wc A: what the dot offers at the canoe lying on the ground (or floated at a dock's side): { e, q, label, hint }, or
  // null. fb4 A (the owner's second round of 2026-10-25): afloat, both ends over water (or tied at a dock's side), E
  // "Get in" puts you in it where it floats and as it faces (getIn; greyed, with its checklist, without a paddle);
  // beached, nosed in or on the bank with the water near, E is held: "Push it off" (beginPush) walks it out until it
  // floats, and a tap does nothing; with no water to launch into (up the bank, a frozen lake, a shallow flat) E shoulders
  // it; at a trail head the two swap (E Shoulder it, a held Q Push it off: the content join). Q is otherwise the shoulder: loaded (anything in it but the lashed things) it reads "Unload it first" with the
  // things still in it as its checklist, and pressed it opens the book with the canoe on the right (help). Every greyed
  // verb carries decision 2's why, needs and next.
  hullAction() {
    const p = this.player, c = p.carry, d = c && c.drop;
    if (p.mode !== 'walk' || !d || this.busy) return null;
    if (this.push) return { e: { verb: 'Push it off', held: true, run: () => {} }, q: null, label: 'the canoe' };
    const can = this.canShoulder();
    const shoulder = { verb: 'Shoulder it', held: false, why: can.ok ? null : can.why, needs: can.needs, next: can.next, run: () => { if (this.canShoulder().ok) p.pickUpHull(); }, help: () => this.openBookAtCanoe() };
    const L = this.dropLaunch(d), lake = L ? this.world.lakeName(L.lake) || 'the water' : null;
    if (this.atDock(d)) return { e: this.getInVerb(d, L), q: can.ok ? shoulder : null, label: 'the canoe, at the dock' }; // (fb5 join: no greyed "Q Shoulder it · unload it first" at a dock, where nobody shoulders a loaded canoe)
    const frozen = !!(this.day && this.day.season && this.day.season.ice > 0.5);
    if (!L || !L.deep || frozen) return { e: shoulder, q: null, label: 'the canoe', hint: L && frozen ? `${lake} is frozen over` : L ? 'too shallow to launch here' : null };
    if (this.afloat(d)) return { e: this.getInVerb(d, L), q: shoulder, label: `the canoe, afloat on ${lake}` };
    const plan = this.pushPlan(d), head = this.atTrailHead(d);
    const push = plan ? { verb: 'Push it off', held: true, run: (o) => this.beginPush(d, o) }
      : { verb: 'Push it off', held: true, why: 'Too shallow to float it here', needs: [{ label: 'A hand’s depth of water under both ends', done: false }], next: `Shoulder it (${head ? 'E' : 'Q'}) and carry it along the shore to deeper water`, run: () => {} };
    // content join (the owner's call on the new-player review, 2026-10-25): at a trail head you landed to carry, so E is
    // Shoulder it and the push off is a held Q; everywhere else a held E pushes off and Q shoulders
    if (head) return { e: shoulder, q: push, label: 'the canoe, beached' };
    return { e: push, q: shoulder, label: 'the canoe, beached' };
  }
  // the canoe lying at d at a portage's end (the trail starts within 12 m of it: dropLaunch's test)
  atTrailHead(d) {
    const tr = d && this.player.nearestTrail(d.x, d.z, 15);
    if (!tr) return false;
    const pts = tr.trail.pts, e0 = pts[0], e1 = pts[pts.length - 1];
    return Math.min(Math.hypot(e0[0] - d.x, e0[1] - d.z), Math.hypot(e1[0] - d.x, e1[1] - d.z)) < 12;
  }
  // E Get in, or greyed with its checklist: no paddle with you (in the canoe or in a hand)
  getInVerb(d, L) {
    const pad = this.paddleCheck();
    if (!pad.ok) return { verb: 'Get in', why: 'No paddle with you', needs: [{ label: 'A paddle in the canoe or in a hand', done: false }], next: pad.next, run: () => {} };
    return { verb: 'Get in', run: () => this.getIn(d, L) };
  }
  // a paddle with you, or where the nearest one is: { ok, next }
  paddleCheck() {
    const all = this.units({ all: true }), pads = all.filter((u) => u.kind === 'long' && u.def.long === 'paddle');
    if (!pads.length || pads.some((u) => u.obj.where === 'canoe' || u.obj.where === 'hands')) return { ok: true, next: null };
    const p = this.player, ground = pads.filter((u) => u.obj.where === 'ground' && u.obj.at).map((u) => ({ u, m: Math.hypot(u.obj.at.x - p.x, u.obj.at.z - p.z) })).sort((a, b) => a.m - b.m)[0];
    if (ground) return { ok: false, next: `${cap(the(ground.u))} lies ${metres(ground.m)} from here: point at it and E to pick it up` };
    if (pads.some((u) => u.obj.where === 'stash')) return { ok: false, next: 'Your paddle is kept at the outfitters: fetch it there' };
    return { ok: false, next: 'Put a paddle in the canoe from the book (I)' };
  }
  // into the canoe where it floats, facing as it lies (player.launch in place: no teleport to a launch point)
  getIn(d, L = null) {
    if (!d) return false;
    this.player.launch({ x: d.x, z: d.z, heading: d.heading || 0, lake: L ? L.lake : this.world.lakeIdAt(d.x, d.z), deep: true, inPlace: true });
    return this.player.mode === 'paddle';
  }
  // tied alongside a store's dock (outfitter.js tieUp: the canoe set down at its dockSide): afloat, whatever the
  // waterline says under its inner end
  atDock(d) {
    const o = window.__game && window.__game.outfitter, v = o && o.visit, s = v && v.L && v.L.dockSide;
    return !!(s && Math.hypot(d.x - s.x, d.z - s.z) < 1.2);
  }
  // the book with the canoe on the right (main.js wires journal.openHere('canoe'); else the book at the pack)
  openBookAtCanoe() {
    try { if (typeof this.openCanoe === 'function' && this.openCanoe() !== false) return true; } catch (e) { console.warn('openCanoe', e); }
    const j = window.__game && window.__game.journal;
    if (j && typeof j.show === 'function') { j.show('pack'); return true; }
    return false;
  }
  // does the canoe lying at d (or a hull at x, z, heading) float: both ends past FLOATS.sd from the waterline over
  // FLOATS.depth of water, its middle past FLOATS.mid
  afloat(d) { return this.floatsAt(d.x, d.z, d.heading || 0); }
  floatsAt(x, z, h) {
    const w = this.world, fx = Math.cos(h), fz = -Math.sin(h);
    const wet = (px, pz, sd) => w.isReady(px, pz) && w.shoreAt(px, pz) < sd && w.levelAt(px, pz) - w.heightAt(px, pz) >= FLOATS.depth;
    return wet(x, z, FLOATS.mid) && wet(x + fx * END, z + fz * END, FLOATS.sd) && wet(x - fx * END, z - fz * END, FLOATS.sd);
  }
  // Where a push takes the canoe lying at d: onto the waterline nearest it, turned the nearer way round to lie square to
  // the shore (bow up the bank, or bow to the water: as it lies, if it is already), then marched out until it floats.
  // You end beside its middle, on the side you stand, as deep as you wade (else nearer the bank along its side).
  // { from, to: { x, z, heading }, you: { x, z }, dist, dur }, or null (the water too far, or too shallow to float it)
  pushPlan(d) {
    const key = `${d.x.toFixed(2)}:${d.z.toFixed(2)}:${(d.heading || 0).toFixed(3)}`;
    if (this._plan && this._plan.key === key && Math.abs(this.clock - this._plan.t) < 0.5) return this._plan.v;
    const v = this.planPush(d);
    this._plan = { key, t: this.clock, v };
    return v;
  }
  planPush(d) {
    const w = this.world, p = this.player;
    let sx = d.x, sz = d.z, sd = w.shoreAt(sx, sz);
    for (let i = 0; i < 24 && Math.abs(sd) > 0.12; i++) { const g = w.deeperDir(sx, sz); sx += g.x * sd; sz += g.z * sd; sd = w.shoreAt(sx, sz); } // onto the waterline
    if (!w.isReady(sx, sz) || Math.abs(sd) > 0.5) return null;
    const g0 = w.deeperDir(sx, sz), landward = Math.atan2(g0.z, -g0.x);
    const h0 = d.heading || 0, toward = Math.abs(wrap(landward - h0)) <= Math.PI / 2 ? landward : wrap(landward + Math.PI);
    let x = sx, z = sz, found = false;
    for (let m = 0; m <= PUSH.reach; m += PUSH.step) {
      if (this.floatsAt(x, z, toward)) { found = true; break; }
      const g = w.deeperDir(x, z); x += g.x * PUSH.step; z += g.z * PUSH.step;
    }
    if (!found) return null;
    // a little past the first spot that floats, so it is not on the edge of floating
    { const g = w.deeperDir(x, z); if (this.floatsAt(x + g.x * 0.4, z + g.z * 0.4, toward)) { x += g.x * 0.4; z += g.z * 0.4; } }
    const to = { x, z, heading: toward };
    // you: beside its middle on your side of it (+1 the hull's right as it lay: the turn is under a quarter, so the side
    // holds), no deeper than PUSH.wade; else along its side toward the bank
    const fx = Math.cos(toward), fz = -Math.sin(toward), rx = -fz, rz = fx;
    const side = (p.x - d.x) * Math.sin(h0) + (p.z - d.z) * Math.cos(h0) >= 0 ? 1 : -1;
    const bank = fx * -g0.x + fz * -g0.z >= 0 ? 1 : -1; // which way along the hull the bank lies
    const depth = (px, pz) => w.levelAt(px, pz) - p.groundAt(px, pz);
    let you = null;
    for (let t = 0; t <= 4.2 && !you; t += 0.35) {
      const px = x + fx * bank * t + rx * side * PUSH.beside, pz = z + fz * bank * t + rz * side * PUSH.beside;
      if (w.isReady(px, pz) && (w.shoreAt(px, pz) > 0 || depth(px, pz) <= PUSH.wade)) you = { x: px, z: pz };
    }
    if (!you) you = { x: sx + rx * side * PUSH.beside, z: sz + rz * side * PUSH.beside };
    const dist = Math.hypot(to.x - d.x, to.z - d.z);
    return { from: { x: d.x, z: d.z, heading: h0 }, to, you, dist, dur: PUSH.secs + dist * PUSH.perM };
  }
  // hold E on the beached hull: a held job (hold.js), hands on the gunwales first (a tap moves nothing), then the slide
  // as long as E is down; let go and it stops where it got to (E again carries on from there). Nothing in it moves.
  beginPush(d, opts = {}) {
    if (this.push || !d) return false;
    const plan = this.pushPlan(d);
    if (!plan) return false;
    const p = this.player, key = (opts && opts.key) || 'KeyE';
    this.push = { ...plan, youFrom: { x: p.x, z: p.z, heading: p.heading } };
    hold.begin({
      id: 'pushOff', key, keys: [...new Set([key, 'Mouse0', ...((opts && opts.keys) || [])])], label: 'Pushing it off', clock: false,
      phases: [{ name: 'Hands on the gunwales', doing: 'Hands on the gunwales', seconds: PUSH.brace }, { name: 'Walking it out', doing: 'Walking it out', seconds: plan.dur }],
      onTick: (at) => this.pushTo(Math.max(0, Math.min(1, at - 1))),
      onDone: () => {
        this.pushTo(1); this.push = null; this._plan = null;
        if (this.hud) this.hud.note('It floats. E to get in.', 3);
        if (p.audio) p.audio.paddleDip();
        this.inv.emit('load');
      },
      onStop: () => { this.push = null; this._plan = null; },
    });
    return true;
  }
  // the hull u of the way along its slide (eased) and round to its heading, laid on the ground or the water there
  // (restHull), you walking with it from where you stood to your spot beside it, facing the way it goes
  pushTo(u) {
    const P = this.push, p = this.player, c = p.carry, d = c && c.drop;
    if (!P || !d) return;
    const k = u * u * (3 - 2 * u);
    d.x = P.from.x + (P.to.x - P.from.x) * k; d.z = P.from.z + (P.to.z - P.from.z) * k;
    d.heading = wrap(P.from.heading + wrap(P.to.heading - P.from.heading) * k);
    p.restHull(d.x, d.z, d.heading);
    const Y = P.youFrom, nx = Y.x + (P.you.x - Y.x) * k, nz = Y.z + (P.you.z - Y.z) * k;
    if (this.world.isReady(nx, nz)) { p.x = nx; p.z = nz; }
    if (P.dist > 0.2 && u > 0) p.heading = Math.atan2(-(P.to.z - P.from.z), P.to.x - P.from.x);
  }
  // the things riding in the canoe that are not lashed in it (the paddle in use and the stringer are): what stops the
  // shoulder and what "Set everything out" sets out
  loadedUnits() { return this.units().filter((u) => u.obj.where === 'canoe' && !this.lashed(u)); }
  // { ok, why, needs, next } (decision 2: the things still in it as steps)
  canShoulder() {
    const list = this.loadedUnits();
    if (!list.length) return { ok: true, why: null };
    return { ok: false, why: 'Unload it first', needs: list.map((u) => ({ label: `${cap(the(u))} out of it`, done: false })), next: 'Unload it: Set everything out, or drag each thing onto The ground.' }; // (fb5 join: said as the book opens, so not "Q opens the book")
  }
  // wc A, the book's Canoe tab (stream B): everything in the canoe beside you (but the lashed things) set out on the
  // ground about the hull, at camp when at one. { n, words }
  setOutAll() {
    const p = this.player, c = p.carry, d = c && c.drop, inv = this.inv;
    if (p.mode !== 'walk' || !d) return { n: 0, words: 'Not from here: on foot, beside the canoe.' };
    if (inv.hullDist({ x: d.x, z: d.z, heading: d.heading || 0 }, p.x, p.z) > HULL_REACH + 1) return { n: 0, words: 'The canoe is out of reach.' };
    const list = this.loadedUnits();
    if (!list.length) return { n: 0, words: 'Nothing but the paddle and the stringer in it.' };
    const camp = inv.camp, a = camp && camp.areaAt ? camp.areaAt(d.x, d.z) : null, taken = [];
    const words = `${cap(names(list))} set out beside the canoe.`; // (the content join: named before they go down: a hand's holder set down empties into a pile, and was "the in your hand")
    for (const u of list) {
      const s = this.spotNear(d.x, d.z, d.heading || 0, 1, -1, taken); taken.push(s);
      inv.setDown(u.ref, { x: s.x, z: s.z, y: this.groundUnder(s.x, s.z, d.heading || 0, u), heading: Math.atan2(-(d.z - s.z), d.x - s.x), ...(a ? { camp: a.key || 'camp' } : {}) }, { left: false, quiet: true, force: true });
    }
    inv.emit('ground');
    return { n: list.length, words };
  }
  // wc A, the book's Canoe tab: everything lying about the canoe loaded, held (hold.js: a thing a phase). opts: the
  // hold's keys ({ key: 'BookHold' }). The job, or null with nothing to load.
  loadAll(opts = {}) {
    const p = this.player, c = p.carry, d = c && c.drop;
    if (p.mode !== 'walk' || !d || this.busy) return null;
    const lo = this.loadables(d).filter((u) => !this.autoLoads(u));
    if (!lo.length) return null;
    const key = (opts && opts.key) || 'KeyE';
    return hold.begin({ ...this.loadAllOpts(d, lo), key, keys: [...new Set([key, 'KeyE', 'Mouse0', ...((opts && opts.keys) || [])])] });
  }
  // the things set down for the second trip at the trail head away from the canoe, of the trail you (or it) are on
  leftHere(c = this.player.carry, p = this.player, near = false) {
    const from = (c && c.drop) || p, onTrail = (q) => { const t = p.nearestTrail(q.x, q.z, 30); return t ? this.world.portages.indexOf(t.def) : -1; };
    const here = new Set([onTrail(from), onTrail(p)]);
    return this.units().filter((u) => u.obj.where === 'ground' && u.obj.at && (!u.def.fixed || u.id === 'pile') && u.obj.at.trail && here.has(u.obj.at.trail.i) && (near || Math.hypot(u.obj.at.x - from.x, u.obj.at.z - from.z) > LOAD_REACH));
  }
  lastCarried() { const c = this.carried(); return c.find((u) => u.obj.where === 'hands') || c.find((u) => u.obj.where === 'chest') || c[0]; }
  // fb3 A: nothing is set down for the trip by itself any more, so nothing goes in at the launch (kept for the book's
  // Load everything here, inv-ui.js, which leaves these out)
  autoLoads() { return false; }
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
    // (not a woodpile: firewood set down at a camp stays there for the next party, fb2's Ground area makes them)
    const woodpile = (o) => o.item === 'pile' && o.grid.length > 0 && o.grid.every((e) => !e.box && /^wood:/.test(e.id));
    return this.units().filter((u) => u.obj.where === 'ground' && u.obj.at && (!u.def.fixed || u.id === 'pile') && !woodpile(u.obj) && !(u.obj.at.trail && !this.autoLoads(u)) && within(u.obj.at))
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
      // (fb4 join: and what to do about it: a loose thing goes in a pack in the canoe, so make room in one)
      const loose = skipped.some((s) => s.why === 'full' && s.id === 'pile'), kg = skipped.some((s) => s.why === 'kg');
      const next = !skipped.length ? '' : kg ? ' Take something heavy out, or make two trips.' : loose ? ' A loose thing rides in a pack in the canoe: make room in one, or carry it on you.' : ' The canoe takes eight packs and barrels: carry the rest.';
      if (this.hud) this.hud.note(`${inN ? `${inN === list.length ? 'Everything is' : `${inN} ${inN === 1 ? 'thing' : 'things'}`} in the canoe` : 'Nothing went in'}${skipped.length ? `; no room for ${names(skipped)}${kg ? ` (the canoe has its ${CANOE_KG} kg)` : ''}` : ''}.${next}`, skipped.length ? 6 : 4);
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

  // Before player.js launches (fb3 A: nothing loads by itself, but for this). No paddle in the canoe or in a hand, no
  // launch. fb4 A (the owner, 2026-10-25: "I can get in the boat with things on my body and still paddle just fine. I
  // don't know if we want to automatically add them to the boat when that happens"): what you wear goes into the hull,
  // back, chest and hands (paddling needs you unloaded), with one note; what lies on the ground stays where it lies,
  // and a word says what is left at the trail head you push off from (what you leave stays, the fetch finds it from the
  // far end). Nothing comes back out when you step out again.
  beforeLaunch() {
    const p = this.player, inv = this.inv, all = this.units();
    const pad = this.paddleCheck();
    if (!pad.ok) {
      if (this.hud) this.hud.note(`No paddle with you. ${pad.next}.`, 5);
      return false;
    }
    const left = this.leftHere(p.carry, p, true).filter((u) => !(u.obj.at && u.obj.at.noted) || Math.hypot(u.obj.at.x - p.x, u.obj.at.z - p.z) <= LOAD_REACH); // (fb5 join: near the canoe too: the leech bucket fetched over and set down 4 m off was left without a word; the content join: and again when you come back to it and leave it a second time)
    if (left.length) { for (const u of left) u.obj.at.noted = true; if (this.hud) this.hud.note(`You push off and leave ${names(left)} at the trail head.`, 5); }
    this.leaveOk = false;
    const worn = this.loadWorn(all);
    if (worn.length && this.hud) this.hud.note(this.loadedWords(worn), 4);
    inv.emit('load');
    return true;
  }
  // what you wear into the canoe, the paddle in a hand too (it is the one in use): the things moved
  loadWorn(all = this.units()) {
    const order = { back: 0, chest: 1, hands: 2 }, on = all.filter((u) => u.obj.where in order).sort((a, b) => order[a.obj.where] - order[b.obj.where]);
    for (const u of on) { const o = u.obj; o.where = 'canoe'; o.at = null; o.hand = null; }
    return on.filter((u) => !(u.kind === 'long' && u.def.long === 'paddle'));
  }
  // "Your pack and the barrel go into the canoe."
  loadedWords(list) {
    const n = names(list).replace(/^the /, 'your ');
    return `${cap(n)} ${list.length > 1 ? 'go' : 'goes'} into the canoe.`;
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
    const walk = LIFE.walk * TRAIL_GOING, laden = Math.max(LIFE.carry, walk / Math.pow(Math.max(1, kg / 40), 0.35));
    // game hours: the walks' own time, as walking them yourself takes on the clock (fb5 C: the one clock runs ahead of a
    // walk's time-lapse on a trail, so the hours at life are scaled by the pace's clock over the walk's seen time-lapse)
    const backH = footHours(back / walk / 3600, p.pace, walk, SEEN.walk), overH = footHours((over * trips) / laden / 3600, p.pace, laden, SEEN.walk), hours = backH + overH;
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

const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
