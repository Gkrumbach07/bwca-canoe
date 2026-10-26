// The parties' camps, drawn at their sites (round A-F: the people plan's phase 1; parties.js keeps who is where).
// The owner, 2026-10-26: "wilderness people". The world shows state first: you read a party by its tents, canoes,
// smoke and figures, never by a marker, and nothing of it goes on the map.
//
// A camp is drawn while its party holds the site in the registry (parties.js claims it only while nobody watches, so
// a camp never pops in or out in front of you) and it lies within CAMPS.drawR, the nearest CAMPS.most of them: their
// canoes overturned at the landing with a paddle by each, one tent per two of them (a dome or an old A-frame, pitched
// where a tent can stand: camp.pitchProblem's rules), a dry bag or two, a woodpile by the ring; all of it one mesh of
// the props' material (no new program, one draw call and its shadow), built once as the camp comes into range. Their
// fire (fire.js partyFire, the same one light) is lit an hour or so after they land, burns down by 22:30 and leaves
// its coals smoking into the morning; the nearest CAMPS.fires camps have one. People stand at the fire, sit on the
// bench, unload at the landing in the late afternoon and pack up in the morning, two or three of them at most and none
// at night, drawn from npcs.js's pool within CAMPS.figR (people.extra), and held off the walker as any person is.
//
// By day (not 22:00–6:00) a party you pass within CAMPS.greetR greets you once a day: a hand lifted, and now and then a
// word by the head (dialogue.js, their own room 'party:<id>'), less often the further from a store. E on one of them
// is a word about their trip (their talk is a later phase). Paddling by within CAMPS.takenR, the action line says the
// site is taken, as on foot.
//
//   const partyCamps = new PartyCamps({ world, scene, tiles, fires, parties, people, player, day, camp, weather })
//   partyCamps.update(dt)     after parties.update (main.js round A-F: on camp.update)
//   partyCamps.extras()       people.extra: the figures to draw, [{ person, fig, f, d }]
//   partyCamps.word(person)   people.partyWord: E on one of them
//   partyCamps.drawn          Map key -> the drawn camp; partyCamps.stats()
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PropBuilder, propMaterial, TILE, buildHull, bakeSelf } from './prop-kit.js';
import { buildTentMesh, buildAFrameMesh, buildItemProp, tentPose, TENT_SIZE, AFRAME_SIZE, TENT_COLOURS } from './props.js';
import { mulberry32 } from './rng.js';
import { PRI } from './dialogue.js';

export const CAMPS = {
  drawR: 900,      // m: camps drawn within this of you
  keepR: 1000,     // and let go beyond this
  most: 4,         // camps drawn at once, nearest first
  fires: 2,        // of them with a fire
  figR: 60,        // m: their people drawn within this (the greeter a little further while greeting)
  greetR: 80,      // m: passing within this by day, they greet you
  hear: 95,        // m: how far a greeting carries (dialogue.js's reach for their speakers)
  quiet: [22, 6],  // quiet hours: no greeting, no wave
  wave: 0.7,       // the chance of a hand lifted
  word: [0.55, 0.22], // the chance of a word with it, by a store and far from one
  store: [3000, 15000], // m from the nearest landing over which that falls
  waveFor: 3.2,    // seconds the hand is up
  greetFor: 6,     // seconds the greeter stays drawn past figR (the hand, the word by the head)
  takenR: 55,      // m from a party's site, paddling, within which the action line says it is taken
  tick: 0.25,      // seconds between the passes that build and let go (one camp built a pass at most)
  bank: 3.4,       // m from the water's edge the overturned canoes lie (their middles)
};
const HULLS = [0xa9aca8, 0xa9aca8, 0xa9aca8, 0xc5a46e, 0xc5a46e, 0x5b7a5a, 0x9c4b3b, 0x4d6a82]; // aluminium, Kevlar tan, green, red, blue
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const C = (hex) => new THREE.Color(hex);
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const pick = (rng, a) => a[Math.floor(rng() * a.length)];
const headingTo = (dx, dz) => Math.atan2(-dz, dx); // npcs.js: a figure's heading facing (dx, dz)

// --- the pieces, in their own frames, built once each ---------------------------------------------------------------
const base = new Map();
let hullOcc = null;
function hullGeometry(hex) {
  const k = `hull:${hex}`;
  if (base.has(k)) return base.get(k);
  const b = new PropBuilder(), shell = C(hex);
  buildHull(b, shell, shell.clone().offsetHSL(0, -0.05, 0.06), C(0x5e4530), C(0xb39b74));
  const g = b.build();
  if (!hullOcc) { const w = new PropBuilder(), W = C(0xffffff); buildHull(w, W, W, W, W); const wg = w.build(); bakeSelf(wg, { rays: 10, reach: 0.6, floor: 0.35 }); hullOcc = wg.getAttribute('aOcc').array.slice(); wg.dispose(); }
  g.getAttribute('aOcc').array.set(hullOcc);
  base.set(k, g);
  return g;
}
function tentGeometry(kind, hex) {
  const k = `tent:${kind}:${hex}`;
  if (!base.has(k)) base.set(k, (kind === 'aframe' ? buildAFrameMesh(hex) : buildTentMesh(hex)).geometry);
  return base.get(k);
}
function itemGeometry(kind, seed) {
  const k = `item:${kind}:${seed}`;
  if (!base.has(k)) base.set(k, buildItemProp(kind, seed).geometry);
  return base.get(k);
}
// split firewood stacked by the ring: three rows of short rounds and halves, x along them
function woodpileGeometry() {
  if (base.has('woodpile')) return base.get('woodpile');
  const b = new PropBuilder(), rng = mulberry32(4711), ends = C(0xc9b28e);
  for (let row = 0; row < 3; row++) {
    const n = 4 - row;
    for (let k = 0; k < n; k++) {
      const r = 0.05 + rng() * 0.018, L = 0.5 + rng() * 0.12, z = (k - (n - 1) / 2) * 0.125 + (rng() - 0.5) * 0.02, y = r + row * 0.098, dx = (rng() - 0.5) * 0.06;
      const bark = C(0x5b4a3b).offsetHSL(0, 0, (rng() - 0.5) * 0.06);
      const split = rng() < 0.4;
      b.cyl(V(-L / 2 + dx, y, z), V(L / 2 + dx, y + (rng() - 0.5) * 0.02, z), r, r * 0.95, 7, TILE.BARK, bark, split ? { arc: [Math.PI, Math.PI * 2], flatTile: TILE.SPLIT, flatCol: C(0xb39e80), cap0: true, cap1: true, capCol: ends } : { cap0: true, cap1: true, capCol: ends });
    }
  }
  const g = b.build();
  bakeSelf(g, { rays: 8, reach: 0.3, ground: 0, floor: 0.4 });
  base.set('woodpile', g);
  return g;
}

// --- what they say ---------------------------------------------------------------------------------------------------
// greetings by the hour; a few that name their trip (entry, nights) are made in greet()
const HELLO = {
  morning: ['Morning!', 'Morning. Sleep all right?', 'Beautiful morning for it.', 'Morning! Coffee’s on, if you’re stopping.'],
  day: ['Hi there!', 'Afternoon!', 'Nice day for it.', 'Hey! Have a good one.', 'Hello!'],
  evening: ['Evening!', 'Evening. Good paddle?', 'Nice night coming.', 'Evening! The loons were going all last night.', 'Hey there. Pretty evening.'],
  wet: ['Wet one, eh?', 'Hope you’ve got a good tarp.', 'Don’t let it get to you!'],
  wind: ['Windy out there!', 'Careful on the big water.', 'Stay in the lee!'],
};
const WORD = {
  pair: ['We came in at {ep} {ago}.', 'Two of us, {left}.', 'We’re on our way {way}.'],
  friends: ['Five years running, this trip. Came in at {ep}.', 'We’re here {left}, then on {way}.', 'The fish aren’t biting for us. Maybe you’ll have better luck.'],
  family: ['Our first trip with the kids. So far so good!', 'Came in at {ep} {ago}. The kids want to stay forever.', 'We’re here {left}.'],
  group: ['We’re a big group, sorry if we’re loud!', '{N} of us, {canoes} canoes. It’s a circus at the portages.', 'Came in at {ep} {ago}, out {left2}.'],
  solo: ['Just me and the loons out here.', 'Came in at {ep} {ago}. Heading on {way}.', '{Left}, then out.'],
};
const NUM = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

export class PartyCamps {
  constructor({ world, scene, tiles, fires, parties, people, player, day, camp = null, weather = null, wind = null }) {
    Object.assign(this, { world, scene, tiles, fires, parties, people, player, day, camp, weather, wind });
    this.drawn = new Map();   // site key -> the drawn camp
    this.greeted = new Map(); // party id -> abs day greeted
    this.said = new Map();    // party id -> the lines said (a day)
    this.t = 0; this.built = 0; this.buildMs = 0;
    this.off = false;         // true: nothing drawn (a switch for the console and the cost test)
  }
  // the pieces' occlusion bakes and a few of them, made behind the title (main.js) so the first camp built costs little
  warm() { hullGeometry(HULLS[0]); hullGeometry(HULLS[3]); tentGeometry('dome', TENT_COLOURS[1]); tentGeometry('aframe', TENT_COLOURS[0]); woodpileGeometry(); itemGeometry('paddle', 3); itemGeometry('drybag', 1); itemGeometry('drybag', 2); }
  get now() { const d = this.day; return d.doy * 24 + d.hours; } // fire.js's clock
  get quiet() { const h = this.day.hours; return h >= CAMPS.quiet[0] || h < CAMPS.quiet[1]; }

  // --- the pass: which camps to draw ------------------------------------------------------------------------------
  sync() {
    const p = this.player, live = this.parties.live, want = [];
    for (const [key, c] of live) {
      if (!c.site || !c.site.layout) continue; // (its tile's props not built yet)
      const d = Math.hypot(c.site.x - p.x, c.site.z - p.z);
      if (d < CAMPS.keepR) want.push({ key, c, d });
    }
    want.sort((a, b) => a.d - b.d);
    const keep = new Set(want.slice(0, CAMPS.most).filter((w) => w.d < CAMPS.drawR || (this.drawn.has(w.key) && this.drawn.get(w.key).party === w.c.party)).map((w) => w.key));
    for (const [key, D] of [...this.drawn]) {
      const c = live.get(key);
      if (!keep.has(key) || !c || c.party !== D.party) this.letGo(key);
    }
    for (const w of want) {
      if (!keep.has(w.key) || this.drawn.has(w.key)) continue;
      const t0 = performance.now();
      this.build(w.key, w.c);
      this.buildMs = performance.now() - t0; this.built++;
      break; // one a pass
    }
    // the fires: the nearest few drawn camps
    const order = [...this.drawn.values()].sort((a, b) => a.d - b.d);
    order.forEach((D, i) => this.fire(D, i < CAMPS.fires));
  }
  letGo(key) {
    const D = this.drawn.get(key); if (!D) return;
    if (D.mesh) { this.scene.remove(D.mesh); D.mesh.geometry.dispose(); }
    const dyn = this.tiles.dynamic || [];
    for (const o of D.obstacles) { const i = dyn.indexOf(o); if (i >= 0) dyn.splice(i, 1); }
    if (this.fires.get(D.fireKey)) this.fires.douse(D.fireKey);
    D.v.live = false; D.v.figs = [];
    this.drawn.delete(key);
  }

  // --- building a camp ------------------------------------------------------------------------------------------
  build(key, c) {
    const site = c.site, L = site.layout, F = L.fire, w = this.world, T = this.tiles, party = c.party;
    const rng = mulberry32(((c.stay.seed >>> 0) ^ 0x5eed1) >>> 0), G = (x, z) => T.groundAt(x, z);
    const ox = F.x, oz = F.z, pieces = [], obstacles = [], spots = { fire: [], seats: [], shore: [], tents: [] };
    const toWater = w.deeperDir(F.x, F.z);
    const near = (x, z, list, r) => list.some((q) => Math.hypot(q.x - x, q.z - z) < r);
    // the canoes, overturned on the bank, side by side, bows to the water, a paddle by each
    const canoes = [];
    let t = 0;
    while (t < 40 && w.shoreAt(F.x + toWater.x * t, F.z + toWater.z * t) > CAMPS.bank) t += 0.5;
    const bx = F.x + toWater.x * t, bz = F.z + toWater.z * t, along = { x: -toWater.z, z: toWater.x };
    const offs = []; for (let k = 0; k < 9; k++) offs.push((k % 2 ? 1 : -1) * Math.ceil(k / 2) * 1.25);
    for (const off of offs) {
      if (canoes.length >= party.canoes) break;
      let x = bx + along.x * (off + (rng() - 0.5) * 0.2), z = bz + along.z * (off + (rng() - 0.5) * 0.2);
      let d2 = w.deeperDir(x, z);
      for (let s = 0; s < 10; s++) { const sd = w.shoreAt(x, z), e = sd - CAMPS.bank; if (Math.abs(e) < 0.35) break; const st = clamp(e, -1.5, 1.5); x += d2.x * st; z += d2.z * st; d2 = w.deeperDir(x, z); }
      const ex = d2.x * 2.3, ez = d2.z * 2.3, gb = G(x + ex, z + ez), gs = G(x - ex, z - ez);
      if (!(w.shoreAt(x + ex, z + ez) > 0.3) || Math.abs(gb - gs) / 4.6 > 0.5 || Math.hypot(x - F.x, z - F.z) < 2.2 || near(x, z, canoes, 1.05)) continue;
      if (L.bench && Math.hypot(x - L.bench.x, z - L.bench.z) < 1.8) continue;
      canoes.push({ x, z, dx: d2.x, dz: d2.z, gb, gs });
    }
    for (const cn of canoes) {
      const yaw = headingTo(cn.dx, cn.dz), pitch = Math.atan2(cn.gb - cn.gs, 4.6), y = (cn.gb + cn.gs) / 2 + 0.4;
      const m = new THREE.Matrix4().makeTranslation(cn.x - ox, y, cn.z - oz).multiply(new THREE.Matrix4().makeRotationY(yaw)).multiply(new THREE.Matrix4().makeRotationZ(pitch)).multiply(new THREE.Matrix4().makeRotationX(Math.PI));
      pieces.push({ geo: hullGeometry(pick(rng, HULLS)), m });
      obstacles.push({ x: cn.x, z: cn.z, ux: cn.dx, uz: cn.dz, hx: 2.5, hz: 0.45, box: true });
      // a paddle on the ground beside it
      const sx = -cn.dz * 0.72, sz = cn.dx * 0.72, px = cn.x + sx, pz = cn.z + sz;
      if (w.shoreAt(px, pz) > 0.8) pieces.push({ geo: itemGeometry('paddle', 3 + Math.floor(rng() * 4)), m: new THREE.Matrix4().makeTranslation(px - ox, G(px, pz) + 0.005, pz - oz).multiply(new THREE.Matrix4().makeRotationY(yaw + (rng() - 0.5) * 0.3)).multiply(new THREE.Matrix4().makeRotationZ(pitch)) });
    }
    // (by the canoes: one a step behind each stern, looking down to the water; a lone canoe has one at its side too)
    for (const cn of canoes.slice(0, 2)) spots.shore.push({ x: cn.x - cn.dx * 3.1, z: cn.z - cn.dz * 3.1, heading: headingTo(cn.dx, cn.dz) });
    if (canoes.length === 1) { const cn = canoes[0]; spots.shore.push({ x: cn.x - cn.dz * 1.1 - cn.dx * 0.8, z: cn.z + cn.dx * 1.1 - cn.dz * 0.8, heading: headingTo(-cn.dz, cn.dx) }); }
    // the tents: the site's pad first, then where a tent can stand round the ring, door to the fire
    const tents = [], cp = this.camp;
    const fits = (x, z, fdx, fdz, size) => {
      if (near(x, z, tents, 3.4) || near(x, z, canoes, 3.0)) return false;
      if (!cp || typeof cp.pitchProblem !== 'function') return w.shoreAt(x, z) > 3;
      try { return cp.pitchProblem(x, z, fdx, fdz, site, size) == null; } catch { return false; }
    };
    const want = Math.max(1, party.tents), a0 = rng() * Math.PI * 2;
    const tryAt = (x, z, kind) => {
      let fdx = F.x - x, fdz = F.z - z; const l = Math.hypot(fdx, fdz) || 1; fdx /= l; fdz /= l;
      const size = kind === 'aframe' ? AFRAME_SIZE : TENT_SIZE;
      if (!fits(x, z, fdx, fdz, size)) return false;
      tents.push({ x, z, fdx, fdz, kind, size }); return true;
    };
    const kindOf = () => (rng() < (party.kind === 'solo' ? 0.45 : 0.28) ? 'aframe' : 'dome');
    if (L.pad) { const k = kindOf(); if (!tryAt(L.pad.x, L.pad.z, k)) tryAt(L.pad.x, L.pad.z, k === 'dome' ? 'aframe' : 'dome'); }
    for (const r of [6, 8, 10, 12, 14]) {
      for (let k = 0; k < 14 && tents.length < want; k++) { const a = a0 + (k / 14) * Math.PI * 2; tryAt(F.x + Math.cos(a) * r, F.z + Math.sin(a) * r, kindOf()); }
      if (tents.length >= want) break;
    }
    for (const tn of tents) {
      const pose = tentPose(G, tn.x, tn.z, tn.fdx, tn.fdz, tn.size), m = pose.matrix.clone();
      m.elements[12] -= ox; m.elements[14] -= oz;
      pieces.push({ geo: tentGeometry(tn.kind, pick(rng, TENT_COLOURS)), m });
      obstacles.push(pose.obstacle);
      spots.tents.push({ x: tn.x + tn.fdx * (tn.size.ahead ? tn.size.ahead : tn.size.b + 1.0), z: tn.z + tn.fdz * (tn.size.ahead ? tn.size.ahead : tn.size.b + 1.0), heading: headingTo(tn.fdx, tn.fdz) });
    }
    // a dry bag or two by the first tent
    if (tents.length) {
      const tn = tents[0], sx = -tn.fdz, sz = tn.fdx;
      for (let k = 0; k < (party.size > 2 ? 2 : 1); k++) {
        const s = (k ? -1 : 1) * (tn.size.a + 0.45), x = tn.x + sx * s + tn.fdx * 0.3, z = tn.z + sz * s + tn.fdz * 0.3;
        if (w.shoreAt(x, z) > 2) pieces.push({ geo: itemGeometry('drybag', 1 + k), m: new THREE.Matrix4().makeTranslation(x - ox, G(x, z) - 0.01, z - oz).multiply(new THREE.Matrix4().makeRotationY(rng() * 6.28)) });
      }
    }
    // the woodpile by the ring, away from the water and the bench
    for (let k = 0; k < 12; k++) {
      const a = Math.atan2(-toWater.z, -toWater.x) + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.5, x = F.x + Math.cos(a) * 2.4, z = F.z + Math.sin(a) * 2.4;
      if (w.shoreAt(x, z) < 2.5 || (L.bench && Math.hypot(x - L.bench.x, z - L.bench.z) < 1.6) || near(x, z, tents, 2.2)) continue;
      pieces.push({ geo: woodpileGeometry(), m: new THREE.Matrix4().makeTranslation(x - ox, G(x, z) - 0.02, z - oz).multiply(new THREE.Matrix4().makeRotationY(-a + Math.PI / 2)) });
      break;
    }
    // where people stand: by the fire (the water side, and across), the bench's two seats
    for (const da of [0, 2.1]) {
      const a = Math.atan2(toWater.z, toWater.x) + da, x = F.x + Math.cos(a) * 1.45, z = F.z + Math.sin(a) * 1.45;
      spots.fire.push({ x, z, heading: headingTo(F.x - x, F.z - z) });
    }
    for (const s of L.seats || []) spots.seats.push({ x: s.x, z: s.z, heading: s.heading, seat: Math.max(0.3, s.y - G(s.x, s.z)) });
    // one mesh
    const parts = pieces.map((q) => q.geo.clone().applyMatrix4(q.m));
    const mesh = parts.length ? new THREE.Mesh(mergeGeometries(parts), propMaterial()) : null;
    for (const g of parts) g.dispose();
    if (mesh) {
      mesh.name = `party camp ${party.id}`; mesh.castShadow = true; mesh.receiveShadow = true;
      mesh.position.set(ox, 0, oz); mesh.matrixAutoUpdate = false; mesh.updateMatrix();
      this.scene.add(mesh);
    }
    const dyn = this.tiles.dynamic || (this.tiles.dynamic = []);
    for (const o of obstacles) dyn.push(o);
    const v = this.people.partyPerson(party);
    v.live = true; v.hear = CAMPS.hear; v.figs = [];
    const D = { key, c, party, stay: c.stay, site, v, mesh, obstacles, spots, fireKey: `party:${party.id}`, d: Math.hypot(site.x - this.player.x, site.z - this.player.z), canoes: canoes.length, tents: tents.length,
      figs: v.members.map((m) => ({ x: 0, z: 0, y: 0, heading: 0, look: m.look, spec: { pose: 'stand', lean: 0.02, wave: 0 } })), wave: null, fireR: mulberry32(((c.stay.seed >>> 0) ^ 0xf17e) >>> 0)() };
    this.drawn.set(key, D);
    this.place(D);
    return D;
  }

  // --- the hours of a camp ------------------------------------------------------------------------------------------
  // what they are doing at abs day T, hour h: 'landing' | 'evening' | 'night' | 'morning' | 'packing' | 'day'
  phase(s, T, h) {
    if (T === s.start) return h < s.land + 0.75 ? 'landing' : h < 22 ? 'evening' : 'night';
    if (T === s.end) return h < 6.5 ? 'night' : h < s.leave - 0.6 ? 'morning' : 'packing';
    return h < 6.5 ? 'night' : h < 9.5 ? 'morning' : h < 16.5 ? 'day' : h < 22 ? 'evening' : 'night';
  }
  // the members at their spots for the phase (by member index; the rest are in the tent or out on the water)
  place(D) {
    const T = this.parties.today, h = this.day.hours, ph = this.phase(D.stay, T, h), S = D.spots, n = Math.min(3, D.v.members.length);
    const wet = this.weather && /rain|storm/.test(this.weather.state || '');
    let at = [];
    if (ph === 'landing' || ph === 'packing') at = [S.shore[0], S.shore[1] || S.tents[0], S.tents[0]];
    else if (ph === 'evening') at = wet ? [S.fire[0]] : [S.fire[0], S.seats[0], S.seats[1] || S.fire[1]];
    else if (ph === 'morning') at = [S.fire[0], S.tents[0] || S.seats[0]];
    else if (ph === 'day') at = wet ? [] : [S.seats[0] || S.fire[0]];
    const v = D.v, G = (x, z) => this.tiles.groundAt(x, z);
    v.figs = [];
    for (let k = 0; k < n; k++) {
      const s = at[k];
      if (!s) continue;
      const f = D.figs[k];
      if (f.at !== s) { f.at = s; f.heading = s.heading; } // (a new spot: faced at once; the greeting's turn eases back, update)
      f.x = s.x; f.z = s.z; f.y = G(s.x, s.z); f.home = s.heading;
      f.spec = s.seat ? { pose: 'sit', seat: s.seat } : { pose: 'stand', lean: 0.02, wave: f.spec.wave || 0 };
      v.figs[k] = f;
    }
    D.phase = ph;
  }
  // their fire: lit an hour or so after they land, out by 22:30; the coals as any fire's into the morning
  fire(D, on) {
    const F = this.fires, key = D.fireKey;
    if (!on) { if (F.get(key)) F.douse(key); return; }
    const s = D.stay, T = this.parties.today, doy = this.day.doy;
    // the latest evening of the stay whose fire is lit by now
    for (let e = Math.min(T, s.end - 1); e >= s.start; e--) {
      const litH = e === s.start ? Math.max(17.3, s.land + 0.8 + D.fireR * 0.6) : 17.4 + D.fireR, outH = 21.8 + D.fireR * 0.5;
      const lit = (doy - (T - e)) * 24 + litH, until = (doy - (T - e)) * 24 + outH;
      if (this.now < lit) continue;
      const f = F.get(key);
      if (!f || f.lit !== lit) F.partyFire(key, D.site.layout.fire, lit, until, this.now);
      return;
    }
    if (F.get(key)) F.douse(key);
  }

  // --- the frame ------------------------------------------------------------------------------------------------
  update(dt) {
    const p = this.player;
    if (this.off) { for (const key of [...this.drawn.keys()]) this.letGo(key); return; } // (the console's and the cost test's switch)
    if ((this.t += dt) >= CAMPS.tick) { this.t = 0; this.sync(); for (const D of this.drawn.values()) { D.d = Math.hypot(D.site.x - p.x, D.site.z - p.z); this.place(D); } }
    const T = this.parties.today;
    for (const D of this.drawn.values()) {
      // the greeter, drawn while they greet (a little past figR); the hand lifted, eased up and down
      if (D.wave) {
        D.wave.t += dt;
        const k = D.wave.t / CAMPS.waveFor, f = D.figs[D.wave.k], w = !D.wave.up || k >= 1 ? 0 : k < 0.2 ? k / 0.2 : k > 0.8 ? (1 - k) / 0.2 : 1;
        if (f && f.spec.pose === 'stand') f.spec.wave = clamp(w, 0, 1);
        if (D.wave.t >= CAMPS.greetFor) D.wave = null;
      }
      // the greeter turns to you while they greet, and back to what they were doing after
      for (let k = 0; k < D.figs.length; k++) {
        const f = D.figs[k]; if (!f.at || f.home == null) continue;
        const want = D.wave && D.wave.k === k && f.spec.pose === 'stand' ? headingTo(p.x - f.x, p.z - f.z) : f.home;
        const e = Math.atan2(Math.sin(want - f.heading), Math.cos(want - f.heading));
        if (Math.abs(e) > 1e-3) f.heading += e * Math.min(1, dt * 4);
      }
      // passing within greetR by day: a greeting, once a day
      if (D.d < CAMPS.greetR + 30 && !this.quiet && this.greeted.get(D.party.id) !== T) {
        const greeter = this.greeter(D);
        if (greeter != null && Math.hypot(D.figs[greeter].x - p.x, D.figs[greeter].z - p.z) < CAMPS.greetR) this.greet(D, greeter, T);
      }
    }
    this.takenLine();
  }
  // the one who greets: a standing member nearest you, else anyone drawn
  greeter(D) {
    const p = this.player, figs = D.v.figs;
    let best = null, bd = Infinity;
    for (let k = 0; k < figs.length; k++) { const f = figs[k]; if (!f) continue; const d = Math.hypot(f.x - p.x, f.z - p.z) + (f.spec.pose === 'stand' ? 0 : 25); if (d < bd) { bd = d; best = k; } }
    return best;
  }
  greet(D, k, T) {
    this.greeted.set(D.party.id, T);
    if (this.greeted.size > 300) this.greeted.clear();
    const rng = mulberry32(((D.stay.seed >>> 0) ^ (T * 2654435761)) >>> 0), f = D.figs[k];
    const up = f.spec.pose === 'stand' && rng() < CAMPS.wave;
    const far = this.storeDistance(D.site), pW = CAMPS.word[0] + (CAMPS.word[1] - CAMPS.word[0]) * clamp((far - CAMPS.store[0]) / (CAMPS.store[1] - CAMPS.store[0]), 0, 1);
    const line = rng() < pW ? this.helloLine(D, rng) : null;
    if (up || line) D.wave = { k, t: 0, up, line };
    if (line) this.say(D, k, line, PRI.greet);
  }
  helloLine(D, rng) {
    const h = this.day.hours, st = this.weather ? this.weather.state || '' : '', windy = this.wind && this.wind.speed > 7;
    const pool = /rain|storm/.test(st) ? HELLO.wet : windy && rng() < 0.6 ? HELLO.wind : h < 11 ? HELLO.morning : h < 17 ? HELLO.day : HELLO.evening;
    const said = this.said.get(D.party.id) || new Set(), fresh = pool.filter((s) => !said.has(s));
    return fresh.length ? pick(rng, fresh) : null;
  }
  say(D, k, text, pri) {
    let said = this.said.get(D.party.id);
    if (!said) { said = new Set(); this.said.set(D.party.id, said); if (this.said.size > 300) { this.said.clear(); this.said.set(D.party.id, said); } }
    said.add(text);
    return this.people.bark(D.v, k, text, pri);
  }
  // E on one of them: a word about their trip, in their words, filled from the plan (their put-in, the nights left)
  word(v) {
    const D = [...this.drawn.values()].find((x) => x.v === v); if (!D) return null;
    const k = this.greeter(D) ?? 0, party = D.party, T = this.parties.today, rng = mulberry32(((D.stay.seed >>> 0) ^ 0xa11ce ^ (T * 977)) >>> 0);
    const ep = this.world.entryPoints.find((e) => e.ep === party.ep), ago = T - party.day, left = party.exit - T;
    const fill = (s) => s.replace('{ep}', ep ? ep.name : 'the landing').replace('{ago}', ago <= 0 ? 'this morning' : ago === 1 ? 'yesterday' : `${NUM[ago] || ago} days ago`)
      .replace('{left}', left <= 1 ? 'one more night' : `${NUM[left] || left} more nights`).replace('{Left}', cap(left <= 1 ? 'one more night' : `${NUM[left] || left} more nights`))
      .replace('{left2}', left <= 1 ? 'tomorrow' : `in ${NUM[left] || left} days`).replace('{way}', D.stay.end === party.exit ? 'home' : 'further in').replace('{N}', cap(NUM[party.size] || String(party.size))).replace('{canoes}', NUM[party.canoes] || String(party.canoes));
    const said = this.said.get(party.id) || new Set(), pool = (WORD[party.kind] || WORD.pair).map(fill).filter((s) => !said.has(s));
    const line = pool.length ? pick(rng, pool) : pick(rng, ['Have a good trip!', 'Take care out there.', 'Enjoy it.']);
    this.say(D, k, line, PRI.reply);
    return line;
  }
  // metres from a site to the nearest landing (a store's)
  storeDistance(site) {
    let best = Infinity;
    for (const e of this.world.entryPoints) { const d = Math.hypot(e.x - site.x, e.z - site.z); if (d < best) best = d; }
    return best;
  }
  // paddling past a party's site: the action line says it is taken (the world shows it first: the tents)
  takenLine() {
    const p = this.player;
    if (p.mode !== 'paddle' || p.teleporting) return;
    let best = null, bd = CAMPS.takenR;
    for (const c of this.parties.live.values()) { const d = Math.hypot(c.site.x - p.x, c.site.z - p.z); if (d < bd) { bd = d; best = c; } }
    if (!best) return;
    const name = this.camp && this.camp.siteName ? this.camp.siteName(best.site) : 'The campsite';
    const pr = p.prompt;
    if (pr && pr.key === 'E' && /^Go ashore$/.test(pr.text || '')) p.prompt = { key: 'E', text: `Go ashore · ${name} is taken` };
    else if (!pr) p.prompt = { key: null, text: `${name} · Taken: another party is camped here` };
  }

  // --- for npcs.js -------------------------------------------------------------------------------------------------
  extras() {
    const p = this.player, out = [];
    for (const D of this.drawn.values()) {
      if (D.d > CAMPS.greetR + 40) continue;
      const figs = D.v.figs;
      for (let k = 0; k < figs.length; k++) {
        const f = figs[k]; if (!f) continue;
        const d = Math.hypot(f.x - p.x, f.z - p.z);
        if (d < CAMPS.figR || (D.wave && D.wave.k === k && d < CAMPS.greetR + 8)) out.push({ person: D.v, fig: k, f, d });
      }
    }
    return out;
  }
  stats() {
    return { drawn: this.drawn.size, built: this.built, lastBuildMs: +this.buildMs.toFixed(2), camps: [...this.drawn.values()].map((D) => ({ key: D.key, party: D.party.id, kind: D.party.kind, size: D.party.size, d: Math.round(D.d), phase: D.phase, canoes: D.canoes, tents: D.tents, figs: D.v.figs.filter(Boolean).length, fire: this.fires.state(D.fireKey) })) };
  }
}

