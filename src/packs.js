// Packs and portages (trip core, stream B). The trip's packs are Duluth packs (hull.js builds them, canoe.js seats
// them): a gear pack and a food pack, or one pack on a trip that travels light. This keeps where each one is (in
// the hull, on your back or your chest, or standing on the ground at a trail head or by the tent) and what you are
// carrying, and runs the double portage the BWCA way:
//   1. the landing ends at the trail head: the gear pack is set down there and you go over with the canoe and the
//      food pack; Q at the trail head takes everything in one heavy trip instead;
//   2. at the far end the canoe goes down (the food pack in it) and you walk back for the gear pack;
//   3. walking back, Q fetches it: a short fade, the clock moves on by the walk back and the second carry (at the
//      travel rate), the walk's energy is spent, and the pack stands at the far end; or walk it yourself;
//   4. with everything together, E loads up and launches.
// A trip with one pack always single-portages. Afloat (paddling, swimming, after a teleport or an evacuation) every
// pack is in the hull; nothing about the packs is saved, so a reload finds them there too.
//
// Each frame (after player.update) it writes player.loadKg (the canoe when it is overhead, plus what is on your back
// and chest) and player.loadFactor = max(1, loadKg / 40), which player.js's walking pace and energy.js's carry drain
// read. Two hooks in player.js call in: footPrompts (the portage prompts, where the packs change them) and
// beforeLaunch. The trip (trip.js, stream A) gives the pack count and the canoe; without one it is two packs and
// an aluminium canoe, and the clock runs at the full rate.

export const WEIGHTS = { aluminium: 34, kevlar: 20, gear: 16, foodPack: 2, foodDay: 0.9 }; // kg
const REACH = 3;            // m from a pack within which you pick it up or take it too
const HULL_REACH = 3;       // m from the canoe within which its prompts apply (player.js)
const LOAD_REACH = 10;      // m from the canoe within which a pack on the ground goes in at the launch
const WALK_PACE = 2.2;      // m/s: player.js WALK.speed, the walk back and the carry with a pack
const TRAVEL_RATE = 1 / 3;  // the clock's rate in Adventure while walking a portage (daycycle.js day.rate)
const BASE_DRAIN = 0.00018, CARRY_DRAIN = 0.0004; // energy.js, per second of the clock: the base, and the carry's scaled by loadKg / 40
const NAMES = { gear: 'the gear pack', food: 'the food pack', pack: 'the pack' };
const SHORT = { gear: 'gear pack', food: 'food pack', pack: 'pack' };
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const metres = (d) => (d < 1000 ? `${Math.round(d)} m` : `${(d / 1000).toFixed(1)} km`);
// game hours as the prompt says them: "about 35 min", "about 1 h 10"
export function aboutHours(h) {
  const m = Math.max(5, Math.round((h * 60) / 5) * 5);
  return m < 60 ? `about ${m} min` : `about ${Math.floor(m / 60)} h${m % 60 ? ' ' + String(m % 60).padStart(2, '0') : ''}`;
}

export class Packs {
  // world, player, canoe (canoe.js), day (daycycle.js); energy, hud, trip (trip.js) and veil (veil.js) when there
  constructor({ world, player, canoe, day, energy = null, hud = null, trip = null, veil = null }) {
    this.world = world; this.player = player; this.canoe = canoe; this.day = day; this.energy = energy; this.hud = hud;
    this.trip = trip; this.veil = veil;
    this.list = []; this.n = 0;
    this.prevMode = player.mode;
    this.busy = false;  // a fetch is under way (its fade)
    this.fade = null;   // the fetch's own fade, when there is no veil
    this.el = null;
    this.reset();
    this.show();
  }

  // the trip, if it is one (main.js's old `trip` was the saved spot, not a Trip)
  get trip() { const t = this._trip; return t && typeof t.log === 'function' ? t : null; }
  set trip(t) { this._trip = t; }
  get setup() { const t = this.trip; return (t && t.state && t.state.packs) || null; }
  get count() { const s = this.setup; return s && s.count === 1 ? 1 : 2; }
  get canoeKind() { const s = this.setup; return s && s.canoe === 'kevlar' ? 'kevlar' : 'aluminium'; }
  get adventure() { const t = this.trip; return !!(t && t.adventure); }
  get canoeKg() { return WEIGHTS[this.canoeKind]; }
  // days of food in the food pack: what the trip has left (energy.js), else what it set out with
  get foodDays() {
    if (this.energy && Number.isFinite(this.energy.food)) return Math.max(0, this.energy.food);
    const s = this.setup; return s && Number.isFinite(s.foodDays) ? Math.max(0, s.foodDays) : 0;
  }
  weightOf(pk) {
    const food = WEIGHTS.foodDay * this.foodDays;
    return pk.kind === 'gear' ? WEIGHTS.gear : pk.kind === 'food' ? WEIGHTS.foodPack + food : WEIGHTS.gear + food; // one pack: the gear with the food in it
  }
  // what you are carrying, kg: the canoe when it is overhead, and the packs on your back and chest
  get loadKg() {
    let kg = this.player.mode === 'carry' ? this.canoeKg : 0;
    for (const pk of this.list) if (pk.where === 'back' || pk.where === 'chest') kg += this.weightOf(pk);
    return kg;
  }
  // packs on the ground away from you (not the ones set out at camp), for the HUD
  get left() {
    const p = this.player;
    return this.list.filter((k) => k.where === 'ground' && !k.at.camp).map((k) => ({ kind: k.kind, name: NAMES[k.kind], x: k.at.x, z: k.at.z, d: Math.hypot(k.at.x - p.x, k.at.z - p.z) })).filter((k) => k.d > REACH);
  }
  // one line for the readout's Pack row
  get summary() {
    const p = this.player, on = this.list.filter((k) => k.where === 'back' || k.where === 'chest'), left = this.left;
    const names = (ks) => ks.map((k) => SHORT[k.kind]).join(' and ');
    const kg = Math.round(this.loadKg);
    let s;
    if (p.mode === 'carry') s = `The canoe${on.length ? ' and ' + names(on) : ''} · ${kg} kg`;
    else if (on.length) s = `${cap(names(on))} on your back · ${kg} kg`;
    else if (this.list.every((k) => k.where === 'hull')) s = this.n === 1 ? 'One pack in the canoe' : 'Two packs in the canoe';
    else {
      const hull = this.list.filter((k) => k.where === 'hull');
      s = this.list.some((k) => k.where === 'ground' && k.at.camp) ? 'Packs out at camp' : hull.length && left.length ? `${cap(names(hull))} in the canoe` : 'Packs by the canoe';
    }
    if (left.length) s += ` · ${names(left)} ${metres(left[0].d)} back`;
    return s;
  }

  reset() {
    const n = this.count;
    this.n = n;
    this.list = n === 1 ? [{ kind: 'pack', mesh: 0, where: 'hull', at: null }]
      : [{ kind: 'gear', mesh: 0, where: 'hull', at: null }, { kind: 'food', mesh: 1, where: 'hull', at: null }];
  }
  // every pack back in the hull
  restow() { for (const k of this.list) { k.where = 'hull'; k.at = null; } }
  // Set the packs out at a camp spot (camp.js, stream C, when the tent goes up): every pack that is with you (in the
  // hull or on your back) stands on the ground there, side by side, fronts toward `heading`. They go back in the hull
  // when you launch. Returns how many were set out.
  unload({ x, z, heading = 0 } = {}) {
    const ks = this.list.filter((k) => k.where !== 'ground');
    const rx = Math.sin(heading), rz = Math.cos(heading); // to the right of the heading
    ks.forEach((k, i) => { const o = (i - (ks.length - 1) / 2) * 0.62; this.setDown(k, x + rx * o, z + rz * o, heading, true); });
    return ks.length;
  }

  // ---------------------------------------------------------------------------------------------------------------
  update(dt) {
    const p = this.player, mode = p.mode;
    if (this.count !== this.n) { this.reset(); if (mode === 'carry') this.onPickUp(); } // the permit changed the packs
    if (mode !== this.prevMode) this.onMode(this.prevMode, mode);
    this.prevMode = mode;
    if (mode === 'paddle' || mode === 'swim') for (const k of this.list) if (k.where !== 'hull') { k.where = 'hull'; k.at = null; }
    if (this.fade) this.updateFade(dt / (p.timeScale || 1));
    const kg = this.loadKg;
    p.loadKg = kg; p.loadFactor = Math.max(1, kg / 40);
    // from the water, a portage with two packs is two trips
    const pr = p.prompt;
    if (mode === 'paddle' && this.n === 2 && pr && pr.key === 'E' && /^Portage: /.test(pr.text) && !/two trips/.test(pr.text)) p.prompt = { ...pr, text: pr.text.replace(/(\(\d+ m\))/, '$1 · two trips with the packs') };
    if (this.busy) p.prompt = null;
    this.show();
  }

  onMode(prev, mode) {
    if (mode === 'carry') this.onPickUp();
    else if (prev === 'carry' && mode === 'walk') { for (const k of this.list) if (k.where === 'back' || k.where === 'chest') k.where = 'hull'; } // the canoe goes down with the packs in it
  }

  // The canoe comes up onto your shoulders (at the end of a landing, or off the ground): what was in it goes on your
  // back, the food pack first; with both packs in it the gear pack is set down beside you for the second trip; with a
  // pack already on your back, the other goes on your chest.
  onPickUp() {
    const p = this.player;
    const inHull = this.list.filter((k) => k.where === 'hull').sort((a, b) => (a.kind === 'food' ? -1 : 1) - (b.kind === 'food' ? -1 : 1));
    let back = this.list.find((k) => k.where === 'back'), chest = this.list.find((k) => k.where === 'chest');
    const both = inHull.length > 1;
    for (const k of inHull) {
      if (!back) { k.where = 'back'; back = k; }
      else if (!chest && !both) { k.where = 'chest'; chest = k; }
      else { const s = this.spotNear(p.x, p.z, p.heading, 1, 1); this.setDown(k, s.x, s.z, Math.atan2(-(p.z - s.z), p.x - s.x)); }
    }
  }
  // Q beside a pack with the canoe overhead: it comes too, the gear pack on the back, the other on the chest
  takeToo(k) {
    const back = this.list.find((q) => q.where === 'back');
    k.at = null;
    if (!back) k.where = 'back';
    else if (k.kind === 'gear') { back.where = 'chest'; k.where = 'back'; }
    else k.where = 'chest';
    if (this.hud) this.hud.note(`Everything in one trip: ${Math.round(this.loadKg)} kg.`);
  }
  // E beside a pack on foot: onto your back (or your chest, with one already on)
  carryByHand(k) { k.at = null; k.where = this.list.some((q) => q.where === 'back') ? 'chest' : 'back'; }

  setDown(k, x, z, heading, camp = false) {
    const p = this.player, tr = camp ? null : p.nearestTrail(x, z, 20);
    k.where = 'ground';
    k.at = { x, z, y: this.groundUnder(x, z, heading, k), heading, camp, trail: tr ? tr.def : null };
  }
  // the ground a pack stands on: the mean of its footprint's corners and middle
  groundUnder(x, z, heading, k) {
    const p = this.player, fx = Math.cos(heading), fz = -Math.sin(heading), rx = -fz, rz = fx;
    const w = k.kind === 'food' ? 0.2 : 0.24, d = 0.1;
    let y = p.groundAt(x, z);
    for (const [a, b] of [[w, d], [w, -d], [-w, d], [-w, -d]]) y += p.groundAt(x + rx * a + fx * b, z + rz * a + fz * b);
    return y / 5;
  }
  // A spot to set a pack down near (x, z): to one side of `heading` (side +1 the right), toward `fwd` (+1 ahead, -1
  // behind) by preference, on dry ground clear of trunks, rocks, logs and anything built.
  spotNear(x, z, heading, side = 1, fwd = 1) {
    const fx = Math.cos(heading), fz = -Math.sin(heading), rx = -fz, rz = fx;
    const tries = [[1.3, 0.5], [1.3, -0.3], [1.3, 1.4], [1.9, 0.6], [1.0, 2.2], [2.4, -0.4], [1.6, 3.0], [2.8, 1.4]];
    for (const s of [side, -side]) for (const [a, b] of tries) {
      const px = x + rx * a * s + fx * b * fwd, pz = z + rz * a * s + fz * b * fwd;
      if (this.clearAt(px, pz)) return { x: px, z: pz };
    }
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

  // tell the rig where each pack is (canoe.js seatPacks)
  show() {
    const c = this.canoe, st = c.state, at = (w) => { const k = this.list.find((q) => q.where === w); return k ? k.mesh : null; };
    if (c.setHullPacks) c.setHullPacks(this.list.filter((k) => k.where === 'hull').map((k) => k.mesh));
    st.packOnBack = at('back'); st.packOnChest = at('chest');
    if (c.setPackGround) for (let i = 0; i < 2; i++) { const k = this.list.find((q) => q.mesh === i && q.where === 'ground'); c.setPackGround(i, k ? k.at : null); }
  }

  // ---------------------------------------------------------------------------------------------------------------
  // The portage prompts (player.js footPrompts calls this first): true when the packs have said what E and Q do here.
  footPrompts(c, trail, note, trailText) {
    const p = this.player, inp = p.input, w = this.world;
    if (this.busy) { p.prompt = null; return true; }
    const lakeOf = (id) => w.lakeName(id) || 'the water';
    const ground = this.list.filter((k) => k.where === 'ground' && !k.at.camp);
    const from = c.drop || p;
    const left = ground.filter((k) => Math.hypot(k.at.x - from.x, k.at.z - from.z) > LOAD_REACH);
    let near = null, nd = REACH;
    for (const k of ground) { const d = Math.hypot(k.at.x - p.x, k.at.z - p.z); if (d < nd) { nd = d; near = k; } }
    if (!c.drop) {
      // the canoe overhead: beside a pack, Q takes it too; at the far end with a pack still back at the start, no launch
      const L = this.carryLaunch(c, trail);
      if (near) {
        p.say(note || trailText, ['Q', `Take ${NAMES[near.kind]} too · one heavy trip`], ['E', L ? `Launch onto ${lakeOf(L.lake)}` : 'Set the canoe down']);
        if (inp.pressed('KeyQ')) this.takeToo(near);
        else if (inp.pressed('KeyE')) { if (L) p.launch(L); else p.dropHull(true); }
        return true;
      }
      if (left.length && L) {
        p.say(note || trailText, ['E', `Set the canoe down · walk back for ${NAMES[left[0].kind]}`]);
        if (inp.pressed('KeyE')) p.dropHull(true);
        return true;
      }
      return false;
    }
    if (c.choice) return false; // just stepped out: shoulder the canoe or leave it there (player.js)
    const d = c.drop, dd = Math.hypot(d.x - p.x, d.z - p.z);
    // a pack standing apart from the canoe (at the trail head you came from): pick it up, or have it carried over
    if (near && Math.hypot(near.at.x - d.x, near.at.z - d.z) > LOAD_REACH) {
      const plan = this.fetchPlan(near);
      p.say(note || trailText, ['E', `Pick up ${NAMES[near.kind]}`], plan ? ['Q', `Carry it over (${aboutHours(plan.hours)})`] : null);
      if (inp.pressed('KeyE')) this.carryByHand(near);
      else if (plan && inp.pressed('KeyQ')) this.fetch(near, plan);
      return true;
    }
    if (left.length) {
      const k = left[0], plan = this.fetchPlan(k);
      const info = `${cap(NAMES[k.kind])} is back at the trail head, ${metres(Math.hypot(k.at.x - p.x, k.at.z - p.z))}`;
      if (dd <= HULL_REACH) {
        p.say(note || info, plan ? ['Q', `Fetch it (${aboutHours(plan.hours)})`] : null, ['E', 'Shoulder the canoe']);
        if (plan && inp.pressed('KeyQ')) this.fetch(k, plan);
        else if (inp.pressed('KeyE')) p.pickUpHull();
        return true;
      }
      if (plan) {
        p.say(note || trailText || info, ['Q', `Fetch it (${aboutHours(plan.hours)})`]);
        if (inp.pressed('KeyQ')) this.fetch(k, plan);
        return true;
      }
      return false;
    }
    // everything together, but not all of it in the canoe yet: E loads up and launches (from the trail's own launch
    // point when the canoe lies at a trail end)
    if (dd <= HULL_REACH && this.list.some((k) => k.where !== 'hull')) {
      const L = this.dropLaunch(d);
      if (L && L.deep) {
        p.say(note, ['E', `Load up and launch onto ${lakeOf(L.lake)}`], ['Q', 'Shoulder the canoe']);
        if (inp.pressed('KeyE')) p.launch(L);
        else if (inp.pressed('KeyQ')) p.pickUpHull();
        return true;
      }
    }
    return false;
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

  // Before player.js launches: the packs go into the hull, unless one stands back at a trail head (then no launch).
  beforeLaunch() {
    const p = this.player, c = p.carry, from = c && c.drop ? c.drop : p;
    const far = this.list.find((k) => k.where === 'ground' && !k.at.camp && Math.hypot(k.at.x - from.x, k.at.z - from.z) > LOAD_REACH && Math.hypot(k.at.x - p.x, k.at.z - p.z) > LOAD_REACH);
    if (far) { if (this.hud) this.hud.note(`${cap(NAMES[far.kind])} is still back at the trail head.`); return false; }
    this.restow();
    return true;
  }

  // ---------------------------------------------------------------------------------------------------------------
  // The fetch: the walk back to the pack and the carry over to the canoe, as distances along the trail (and off it),
  // the time they take at a walk, the game hours that is at the travel rate, and the energy the walk costs.
  fetchPlan(k) {
    const p = this.player, c = p.carry;
    if (!c || !c.drop || !k.at || !k.at.trail) return null;
    const tr = p.trailFor(k.at.trail);
    const a = p.nearestOnTrail(tr, k.at.x, k.at.z), b = p.nearestOnTrail(tr, c.drop.x, c.drop.z), you = p.nearestOnTrail(tr, p.x, p.z);
    if (b.dist > 25 || you.dist > 30) return null;
    const back = Math.abs(you.along - a.along) + you.dist + a.dist, over = Math.abs(a.along - b.along) + a.dist + b.dist;
    const seconds = (back + over) / WALK_PACE, carrying = over / WALK_PACE;
    const rate = this.adventure ? TRAVEL_RATE : 1;
    return { back, over, seconds, rate, hours: seconds * this.day.hoursPerSecond * rate, cost: (BASE_DRAIN * seconds + CARRY_DRAIN * (this.weightOf(k) / 40) * carrying) * rate, trail: k.at.trail.name };
  }

  fetch(k, plan) {
    if (this.busy) return;
    this.busy = true;
    const onDark = () => this.arrive(k, plan);
    const card = { kicker: plan.trail || 'The portage', text: `Back for ${NAMES[k.kind]}`, sub: cap(aboutHours(plan.hours)), fadeIn: 0.6, hold: 1.2, fadeOut: 0.9, onDark };
    const veil = this.veil || (this.trip && this.trip.veil) || (window.__game && window.__game.veil) || null; // veil.js (stream A), when there
    if (veil && typeof veil.card === 'function') {
      const done = () => { this.busy = false; };
      Promise.resolve(veil.card(card)).then(done, done);
    } else this.fade = { t: 0, card, dark: false };
  }

  // at full dark: the clock and the energy move on, the pack stands by the canoe, and you beside them
  arrive(k, plan) {
    const p = this.player, c = p.carry, d = c && c.drop;
    if (!d || k.where !== 'ground') return;
    this.advanceClock(plan.hours);
    this.spend(plan.cost);
    const s = this.spotNear(d.x, d.z, d.heading, 1, -1);
    const y = this.spotNear(d.x, d.z, d.heading, -1, -1);
    this.setDown(k, s.x, s.z, Math.atan2(-(d.z - s.z), d.x - s.x));
    p.x = y.x; p.z = y.z; p.speed = 0; p.foot = null;
    p.heading = Math.atan2(-(d.z - y.z), d.x - y.x);
    const ch = p.chase;
    if (ch) { ch.viewYaw = ch.forwardYaw = p.heading; if (ch.snap) ch.snap(); }
    if (this.trip) this.trip.log('fetch', { kind: k.kind, trail: plan.trail, hours: plan.hours });
    if (this.hud) this.hud.note(`You walked back for ${NAMES[k.kind]} and carried it over: ${aboutHours(plan.hours).replace('about ', '')}.`);
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
