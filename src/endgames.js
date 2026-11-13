// The end games after the endings in the world (story wave 2, stream g; docs/build/campaign-design.md Part 3 #5–#6).
// The data, the words and the pure rules are story-data/endgames.js; this is the game side. Loaded only under STORY_ON
// (main.js's g block). A co-op guest's story is a mirror: nothing is told, staged or written for them.
//
//   After the journalist ending (end.J, JN too): the secrets. A keeper with one waiting says so as you come in (a bark), and
//   their talk has it at the top in gold ("You wanted a word?"); they tell it, pencil a loose ring, and "I'll go and look."
//   is the yes on E's runner (episodes.yes: the Stories page, the trip card's stamp). The thing itself is in the world:
//     fish    a giant at one spot of a real lake (fishing.startBite wrapped: within its r, its hours, a lure it takes,
//             deep enough, `chance` of a bite there being it); landed (kept or let go) it is found
//     find    a prop at a real shore or summit, resolved from the tiles the first time they are in round its anchor and
//             kept in the story's doc (g.at); E on the dot does its verb: the find's line, its thing into your hands
//     photo   a print with the place in frame (photo.onShot): Johnson Falls itself, or the rookery's prop
//   Then "I found it." at that keeper's counter: their thanks, their money and their one-of-a-kind thing; secret.<id>.done.
//   A keeper with none waiting says who has one ("{name} at {store} was asking after you"), once a day.
//   After the money ending (end.M): each unsoftened keeper's first sight of you is a cold line (once), and when it is their
//   turn (story-data softReady: SOFT_GAP days apart) "Anything I can do for you?" is among their choices: a donation paid
//   there and then, or a job of a board kind taken on as theirs (tasks: npc g:<ep>, no pay), or a laker for the kitchen.
//   Done, owner.<ep>.softened is written (n's shop.storyMul reads it: that owner's prices come back) and they thank you.
//
//   endgames.attach({ story, npcs, topics, texts, tasks, profile, inventory, fishing, photo, pointer, scene, tiles, world,
//                     hud, kit, day, outfitter, player, episodes })
//   endgames.update(dt)   the places, the props within reach, the jobs
//   endgames.debug        { state(), offer(ep), back(ep), soft(ep), pick(node, i|text), resolve(id), place(id), find(id),
//                           giant(id, o), land(id), shoot(id), keeper(ep) }
import * as THREE from 'three';
import { PropBuilder, propMaterial, TILE } from './prop-kit.js';
import { defineItem, definePage, itemDef } from './items.js';
import { KINDS } from './tasks.js';
import * as G from './story-data/endgames.js';

const TICK = 1;            // s between checks
const RESOLVE_R = 1800;    // m from an anchor: its place is worked out from the tiles
const DRAW_R = 700;        // m: a secret's prop is built within this, taken down past DRAW_R + 200
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const C = (hex) => new THREE.Color(hex);
const X = V(1, 0, 0), Y = V(0, 1, 0), Z = V(0, 0, 1);

// --- the one-of-a-kind things ----------------------------------------------------------------------------------------------
const O = (label, value) => ({ label, value });
function defineThings() {
  if (itemDef('tradekettle') && itemDef('tradekettle').unique) return;
  defineItem({ id: 'tradekettle', name: 'Copper trade kettle', short: 'Kettle', kind: 'container', w: 2, h: 2, kg: 0.9, price: 0, unique: true, nest: true, hand: true,
    pot: { litres: 2, scale: 0.95 }, icon: 'pot', container: { cols: 2, rows: 2, accepts: ['meal', 'fish', 'food', 'water'] }, identity: 'Hammered copper, green with age · from a cave on Winchell' });
  defineItem({ id: 'mackinaw', name: 'Red-and-black Mackinaw', short: 'Mackinaw', kind: 'gear', w: 2, h: 2, kg: 1.4, unique: true, identity: 'Heavy wool, 1930s · out of a trapper\'s trunk', model: 'box', tint: 0x8a2a24, onYou: [O('Cold', 'costs ×0.85')] });
  defineItem({ id: 'grandspoon', name: 'Arvid\'s grandfather\'s spoon', short: 'Old spoon', kind: 'tool', kg: 0.03, unique: true, identity: 'Hand-hammered brass, worn thin', model: 'box', tint: 0xb8923a, onYou: [O('Bites', '×1.05')] });
  defineItem({ id: 'builderplate', name: 'Canoe builder\'s plate', short: 'Plate', kind: 'gear', kg: 0.05, unique: true, identity: 'Brass, a maker\'s name and a number · off Gus\'s uncle\'s canoe', model: 'box', tint: 0xc9a24a, onYou: [] });
  defineItem({ id: 'springcup', name: 'Blue tin cup', short: 'Cup', kind: 'gear', kg: 0.08, unique: true, identity: 'Enamel, chipped at the rim · off the nail by the spring on Duncan', model: 'box', tint: 0x3a5a8a, onYou: [] });
  defineItem({ id: 'snack:wildblue', name: 'Wild blueberries', kind: 'snack', kg: 0.3, price: 0, servings: 8, serving: 'a handful', eat: { food: 0.04, lift: 0.04 }, identity: 'Small and dark, off the old burn' });
  defineItem({ id: 'snack:pie', name: 'Joanne\'s blueberry pie', kind: 'snack', kg: 0.9, price: 0, servings: 6, serving: 'a slice', eat: { food: 0.14, lift: 0.12 }, identity: 'Wild blueberries, a lattice top' });
  try { definePage({ id: 'g.survey', title: 'A note from a tobacco tin', ref: 'g.survey', by: 'a survey party, 1938' }); } catch { /* defined */ }
}

// --- the props: one merged mesh each, the props' material; `at` the E point (local), `face` toward the water ----------
function propGeo(kind, rng = Math.random) {
  const b = new PropBuilder();
  const grey = C(0x6d6a64), dark = C(0x1b1a18), bark = C(0x5a4632), wood = C(0x6e5638), green = C(0x3f5a34);
  let at = V(0, 1, 0), r = 1.2;
  if (kind === 'cave') {
    // a rock face with a dark mouth at its foot, a cedar leaning over it
    b.box(V(0, 2.6, -1.2), X, Y, Z, 4.2, 2.6, 1.4, TILE.ROCK, grey);
    b.box(V(-3.2, 1.4, 0.2), X, Y, Z, 1.2, 1.4, 1.0, TILE.ROCK, C(0x75716a));
    b.box(V(3.0, 1.1, 0.1), X, Y, Z, 1.3, 1.1, 0.9, TILE.ROCK, C(0x67635d));
    b.box(V(0, 0.95, 0.12), X, Y, Z, 1.05, 0.95, 0.05, TILE.PLAIN, dark);              // the mouth
    b.cyl(V(2.4, 0, 0.4), V(1.2, 4.5, 1.6), 0.16, 0.08, 7, TILE.BARK, bark);           // the cedar
    for (let k = 0; k < 4; k++) b.cyl(V(1.4 - k * 0.1, 2.6 + k * 0.5, 1.4), V(0.2 - k * 0.2, 2.8 + k * 0.5, 2.4), 0.5, 0.05, 6, TILE.PLAIN, C(0x2f4a2a));
    at = V(0, 1.0, 0.3); r = 1.3;
  } else if (kind === 'cabin') {
    // four log walls, chest high, no roof; the roof's poles fallen in; a tin trunk in the corner
    const H = 1.2;
    for (const [cx, cz, w, d] of [[0, -2, 2.4, 0.15], [0, 2, 2.4, 0.15], [-2.3, 0, 0.15, 2], [2.3, 0, 0.15, 2]]) b.box(V(cx, H / 2, cz), X, Y, Z, w, H / 2, d, TILE.BARK, C(0x6a5440));
    for (let k = 0; k < 5; k++) b.cyl(V(-2 + k, 0.2, -1.8), V(-1.6 + k * 0.9, 1.0 - k * 0.12, 1.9), 0.08, 0.08, 6, TILE.BARK, C(0x5d4a38));
    b.box(V(1.5, 0.28, 1.4), X, Y, Z, 0.45, 0.28, 0.3, TILE.METAL, C(0x5d6366));            // the trunk
    b.box(V(1.5, 0.58, 1.4), X, Y, Z, 0.47, 0.03, 0.32, TILE.METAL, C(0x4a4f52));
    at = V(1.5, 0.5, 1.4); r = 0.8;
  } else if (kind === 'canoe') {
    // a wood-and-canvas canoe upside down on two logs, the canvas gone to green lace, brush round it
    const hull = C(0x4d6b4a), rib = C(0x9a7a52);
    for (let k = -6; k <= 6; k++) { const u = k / 6, half = 0.42 * Math.sqrt(Math.max(0.05, 1 - u * u)), y = 0.62 + 0.12 * u * u; b.box(V(0, y, u * 2.5), X, Y, Z, half, 0.16, 0.2, TILE.CANVAS, k % 2 ? hull : rib); }
    for (const z of [-1.4, 1.4]) b.cyl(V(-0.9, 0.18, z), V(0.9, 0.18, z), 0.15, 0.15, 7, TILE.BARK, bark);
    b.box(V(0, 0.8, 2.45), X, Y, Z, 0.08, 0.02, 0.05, TILE.METAL, C(0xc9a24a));              // the plate on the deck
    for (let k = 0; k < 6; k++) { const a = rng() * Math.PI * 2; b.cyl(V(Math.cos(a) * 1.4, 0, Math.sin(a) * 2.6), V(Math.cos(a) * 1.5, 0.9 + rng() * 0.5, Math.sin(a) * 2.7), 0.35, 0.05, 5, TILE.PLAIN, green); }
    at = V(0, 0.8, 0); r = 1.4;
  } else if (kind === 'rookery') {
    // dead pines, grey, with stick nests in their tops and herons standing on some
    for (let k = 0; k < 6; k++) {
      const x = (k - 2.5) * 5 + (rng() - 0.5) * 2, z = (rng() - 0.5) * 6, h = 14 + rng() * 6;
      b.cyl(V(x, 0, z), V(x, h, z), 0.35, 0.12, 7, TILE.BARK, C(0x8a8580));
      for (let a = 0; a < 3; a++) { const yy = h * (0.55 + a * 0.12), ang = rng() * 6.28; b.cyl(V(x, yy, z), V(x + Math.cos(ang) * 2, yy + 0.6, z + Math.sin(ang) * 2), 0.08, 0.03, 4, TILE.BARK, C(0x7d7873)); }
      b.box(V(x, h - 0.4, z), X, Y, Z, 0.75, 0.22, 0.75, TILE.PLAIN, C(0x4e4234));                 // the nest
      if (k % 2 === 0) { b.box(V(x, h + 0.25, z), X, Y, Z, 0.16, 0.28, 0.42, TILE.PLAIN, C(0x7a8794)); b.cyl(V(x, h + 0.5, z + 0.3), V(x, h + 0.95, z + 0.4), 0.05, 0.04, 5, TILE.PLAIN, C(0x7a8794)); }
    }
    at = V(0, 2, 0); r = 0;
  } else if (kind === 'pine') {
    // a white pine the loggers missed: a trunk as wide as a table, the crown in flat layered sprays
    b.cyl(V(0, -0.5, 0), V(0, 34, 0), 1.05, 0.35, 12, TILE.BARK, C(0x4e3f33));
    for (let k = 0; k < 6; k++) { const y = 18 + k * 2.6, ang = k * 2.1, len = 6.5 - k * 0.7; b.box(V(Math.cos(ang) * len * 0.45, y, Math.sin(ang) * len * 0.45), X, Y, Z, len * 0.5, 0.7, len * 0.4, TILE.PLAIN, C(0x2e4a30)); }
    at = V(0, 1.3, 0); r = 1.6;
  } else if (kind === 'cairn') {
    // a cairn of lichened stones on the bare top
    for (let k = 0; k < 9; k++) { const lay = Math.floor(k / 3), a = (k % 3) * 2.1 + lay; const s = 0.42 - lay * 0.1; b.box(V(Math.cos(a) * (0.45 - lay * 0.15), 0.25 + lay * 0.42, Math.sin(a) * (0.45 - lay * 0.15)), X, Y, Z, s, 0.2, s * 0.85, TILE.ROCK, k % 2 ? grey : C(0x7d7a6e)); }
    b.box(V(0, 1.45, 0), X, Y, Z, 0.26, 0.12, 0.2, TILE.ROCK, C(0x8a877c));
    at = V(0, 1.4, 0); r = 0.7;
  } else if (kind === 'spring') {
    // water out of the rock at the shore, a cedar with a cup on a nail
    b.box(V(0, 0.6, -0.8), X, Y, Z, 1.2, 0.6, 0.6, TILE.ROCK, grey);
    b.box(V(0, 0.08, 0.3), X, Y, Z, 0.35, 0.02, 0.6, TILE.PLAIN, C(0x8fb4c4));                // the run of water
    b.cyl(V(1.1, 0, 0.1), V(1.0, 5, 0.0), 0.14, 0.08, 7, TILE.BARK, bark);
    b.box(V(1.0, 1.35, 0.25), X, Y, Z, 0.05, 0.05, 0.05, TILE.PLAIN, C(0x3a5a8a));             // the cup
    at = V(1.0, 1.35, 0.25); r = 0.45;
  } else if (kind === 'berries') {
    // low blueberry bushes under black snags
    for (let k = 0; k < 14; k++) { const x = (rng() - 0.5) * 6, z = (rng() - 0.5) * 6; b.box(V(x, 0.16, z), X, Y, Z, 0.35, 0.16, 0.35, TILE.PLAIN, green); b.box(V(x + 0.1, 0.34, z), X, Y, Z, 0.12, 0.03, 0.12, TILE.PLAIN, C(0x2c3a6e)); }
    for (let k = 0; k < 3; k++) { const x = (rng() - 0.5) * 8, z = (rng() - 0.5) * 8; b.cyl(V(x, 0, z), V(x, 6 + rng() * 3, z), 0.16, 0.06, 6, TILE.BARK, C(0x1e1c1a)); }
    at = V(0, 0.3, 0); r = 1.8;
  }
  void wood;
  const g = b.build(); g.computeBoundingSphere();
  return { geo: g, at, r };
}

class Endgames {
  constructor() { this.c = {}; this.t = 0; this.props = new Map(); this.offs = []; this.barked = new Map(); this.debug = this.makeDebug(); }
  get story() { return this.c.story || null; }
  get live() { const s = this.story; return !!(s && s.doc && s.mode !== 'mirror') && !this.guest(); }
  guest() { try { return typeof this.c.guest === 'function' ? !!this.c.guest() : false; } catch { return false; } }
  get doc() { const s = this.story; if (!s || !s.doc) return null; if (!s.doc.g || typeof s.doc.g !== 'object') s.doc.g = { at: {}, soft: {}, thank: {} }; const d = s.doc.g; d.at = d.at || {}; d.soft = d.soft || {}; d.thank = d.thank || {}; return d; }
  T(id, vars = null) { let w = G.LINES[id] || null; if (w && vars) w = w.replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? String(vars[k]) : m)); return w; }
  set(k, v = true) { const s = this.story; if (!this.live) return false; return s.set(k, v, 'g'); }
  note(w, sec = 5) { const h = this.c.hud; if (w && h && typeof h.note === 'function') h.note(w, sec); }
  today() { const s = this.story; return s ? s.time().abs : 0; }

  attach(c = {}) {
    Object.assign(this.c, c);
    const s = this.story; if (!s) return this;
    defineThings();
    // the words, by id, for E's runner (the Stories page, the trip card) and anything reading topics' texts
    const tx = this.c.texts;
    if (tx && typeof tx.add === 'function') tx.add({ text: Object.fromEntries(Object.entries(G.LINES).map(([k, v]) => [k, { text: v, who: 'g' }])) });
    // the keeper's choices (npcs.js kChoices: extraChoices first)
    const N = this.c.npcs;
    if (N) { N.extraChoices = N.extraChoices || []; const fn = (v) => this.choiceFor(v); N.extraChoices.unshift(fn); this.offs.push(() => { const i = N.extraChoices.indexOf(fn); if (i >= 0) N.extraChoices.splice(i, 1); }); }
    // coming in: the cold line, the secret's hook, the pointer, a job's thanks
    if (typeof s.on === 'function') this.offs.push(s.on('store:enter', (e) => this.storeEnter(e && e.ep)));
    // the jobs: done → softened
    const Tk = this.c.tasks;
    if (Tk && typeof Tk.on === 'function') { for (const ev of ['done', 'paid']) this.offs.push(Tk.on(ev, (t) => this.jobDone(t))); }
    this.hookFishing(); this.hookPhoto(); this.hookKit();
    return this;
  }
  detach() { for (const o of this.offs) { try { o(); } catch { /* gone */ } } this.offs = []; for (const k of [...this.props.keys()]) this.dropProp(k); }

  // --- the keepers --------------------------------------------------------------------------------------------------------
  owner(ep) { return G.OWNERS[Number(ep)] || null; }
  first(ep) { const o = this.owner(ep); return o ? o.name.split(' ')[0] : 'The keeper'; }
  manner(ep) { const N = this.c.npcs, ch = N && typeof N.charOf === 'function' ? N.charOf(Number(ep)) : null; return (ch && ch.manner) || (this.owner(ep) || {}).manner || 'warm'; }
  storeDist(a, b) { const W = this.c.world, E = W && W.entryPoints ? W.entryPoints : []; const A = E.find((e) => e.ep === Number(a)), B = E.find((e) => e.ep === Number(b)); return A && B ? Math.hypot(A.x - B.x, A.z - B.z) : 1e9; }
  bark(ep, w) {
    if (!w) return;
    const N = this.c.npcs;
    const ok = N && typeof N.keeperSays === 'function' ? N.keeperSays(Number(ep), w, 'return') : false;
    if (!ok) this.note(`${this.first(ep)}: “${w}”`, 6);
  }
  storeEnter(ep) {
    const s = this.story; ep = Number(ep);
    if (!this.live || !this.owner(ep)) return;
    const day = this.today();
    if (this.barked.get(ep) === day) return;
    const say = (w) => { this.barked.set(ep, day); setTimeout(() => this.bark(ep, w), 1600); };
    // a job done since you were last in: their thanks (the prices are back already)
    const d = this.doc;
    if (d && d.thank[ep] && s.has(`owner.${ep}.softened`) && !s.has(`owner.${ep}.thanked`)) { delete d.thank[ep]; this.set(`owner.${ep}.thanked`); s.dirty(); return say(this.T(`g.soft.${ep}.done`)); }
    if (G.money(s) && !s.has(`owner.${ep}.softened`) && !s.has(`owner.${ep}.cold`)) { this.set(`owner.${ep}.cold`); return say(G.byManner('g.cold', this.manner(ep))); }
    if (G.journalist(s)) {
      if (G.secretFor(s, ep)) return say(G.byManner('g.hook', this.manner(ep)));
      if (this.backFor(ep)) return;
      const W = G.secretWaiting(s, ep, (a, b) => this.storeDist(a, b));
      if (W) { const o = this.owner(W.owner); return say(this.T(`g.point.${this.manner(ep)}`, { name: o.name, store: o.store }) || this.T('g.point.warm', { name: o.name, store: o.store })); }
    }
  }
  // a secret found and not yet told, this keeper's (berries: with some on you)
  backFor(ep) {
    const s = this.story;
    return G.secretsOf(ep).find((S) => G.secretState(s, S.id) === 'found' && (S.id !== 'berries' || this.hasItem('snack:wildblue'))) || null;
  }
  hasItem(id) { const i = this.c.inventory; try { return !!(i && i.count(id, { reachable: true }) > 0); } catch { return false; } }
  // the keeper's choice at the top of their talk (npcs extraChoices) → a choice | null
  choiceFor(v) {
    if (!v || !v.keeper || !this.live) return null;
    const s = this.story, ep = Number(v.ep);
    const back = this.backFor(ep);
    if (back) return { text: this.T(`g.${back.id}.back`), kind: 'arc', tag: 'new', go: () => this.tellBack(v, back) };
    const S = G.secretFor(s, ep);
    if (S) return { text: this.T('g.ask.secret'), kind: 'arc', tag: 'new', go: () => this.tellSecret(v, S) };
    if (G.softReady(s, ep) && !this.jobOpen(ep)) return { text: this.T('g.ask.soft'), tag: 'new', go: () => this.askSoft(v) };
    return null;
  }
  kChoices(v) { const N = this.c.npcs; return N && typeof N.kChoices === 'function' ? N.kChoices(v) : [{ text: 'Goodbye.', kind: 'bye', go: () => null }]; }
  // lines said one at a time, the last with `choices` (or the keeper's own choices again)
  chain(v, lines, choices = null) {
    const N = this.c.npcs, L = lines.filter(Boolean);
    const step = (i) => {
      const say = L[i]; if (N && typeof N.mark === 'function') N.mark(say);
      if (i < L.length - 1) return { say, choices: [{ text: '…', go: () => step(i + 1) }] };
      return { say, choices: choices ? choices() : this.kChoices(v) };
    };
    return L.length ? step(0) : { say: '…', filler: true, choices: choices ? choices() : this.kChoices(v) };
  }
  tellSecret(v, S) {
    return this.chain(v, [this.T(`g.${S.id}.tell.1`), this.T(`g.${S.id}.tell.2`)], () => [
      { text: this.T('g.ask.go'), tag: 'new', go: () => { this.give(S, v); return this.chain(v, [this.T(`g.${S.id}.go`)]); } },
      { text: this.T('g.ask.later'), go: () => ({ say: '…', filler: true, choices: this.kChoices(v) }) },
    ]);
  }
  // the yes: secret.<id>.given (the day), E's runner's yes, the owner's loose ring
  give(S, v = null) {
    const s = this.story;
    if (!this.live || G.secretState(s, S.id) !== 'none') return false;
    this.set(`secret.${S.id}.given`, this.today());
    const E = this.c.episodes;
    if (E && typeof E.yes === 'function') { try { if (typeof E.dayTurn === 'function') E.dayTurn(true); E.yes(G.epId(S.id), 'choice'); } catch (e) { console.warn('g: the yes', e); } }
    const tp = this.c.topics;
    if (tp && typeof tp.ring === 'function' && S.ring) { try { const off = this.ringOffset(S); tp.ring({ x: S.at.x + off.x, z: S.at.z + off.z, r: S.ring.r, label: S.ring.label }, { by: v ? this.first(v.ep) : this.first(S.owner), label: S.ring.label }); } catch (e) { console.warn('g: the ring', e); } }
    return true;
  }
  // the ring is loose: its middle a little off the anchor (seeded, the same every time), never on the spot
  ringOffset(S) { const h = this.story.hash(`g.ring.${S.id}`), a = (h % 360) * Math.PI / 180, d = S.ring.r * 0.35; return { x: Math.cos(a) * d, z: Math.sin(a) * d }; }
  tellBack(v, S) {
    return this.chain(v, [this.T(`g.${S.id}.thanks.1`), this.T(`g.${S.id}.thanks.2`)], () => { this.reward(S); return this.kChoices(v); });
  }
  reward(S) {
    const s = this.story;
    if (!this.live || G.secretState(s, S.id) !== 'found') return false;
    const who = this.first(S.owner), P = this.c.profile;
    if (S.id === 'berries') { const i = this.c.inventory; try { if (i && typeof i.remove === 'function') i.remove('snack:wildblue', 1); } catch { /* the inventory's */ } }
    if (S.pay > 0 && P && typeof P.earn === 'function') { P.earn(S.pay, `secret: ${S.title}`); this.note(`${who} hands you $${S.pay}.`, 5); }
    if (S.give) { this.giveItem(S.give); const d = itemDef(S.give.split('*')[0]); if (d) { const nm = /’s|'s/.test(d.name) ? d.name : `the ${d.name.toLowerCase()}`; setTimeout(() => this.note(`${who} gives you ${nm}.`, 5), S.pay > 0 ? 1800 : 0); } }
    this.set(`secret.${S.id}.done`, this.today());
    return true;
  }
  giveItem(spec) {
    const s = this.story, m = /^([\w:.-]+?)(?:\*(\d+))?$/.exec(String(spec)); if (!m) return false;
    const id = m[1], n = Number(m[2]) || 1;
    if (/^page:/.test(id)) { const i = this.c.inventory; try { if (i && !i.has(id)) i.give(id); return true; } catch { return false; } }
    let ok = false;
    try { ok = !!s.action('give', `item.${id}${n > 1 ? `*${n}` : ''}`, { rule: 'g' }); } catch { ok = false; }
    if (!ok) { const i = this.c.inventory; try { for (let k = 0; k < n; k++) { const r = i.toHandNew ? i.toHandNew(id) : null; if (!(r && r.ok) && i.place) i.place(id, 1, {}); } if (i.write) i.write(); ok = true; } catch { ok = false; } }
    return ok;
  }

  // --- the softening ------------------------------------------------------------------------------------------------------
  jobOpen(ep) {
    const d = this.doc, j = d && d.soft[ep], Tk = this.c.tasks;
    if (!j || j.kind === 'donate' || !Tk) return false;
    const t = Tk.ads && Tk.ads.get(j.task);
    return !!(t && (t.status === 'open' || t.status === 'done'));
  }
  askSoft(v) {
    const ep = Number(v.ep), X0 = G.softOf(ep);
    return this.chain(v, [this.T(`g.soft.${ep}.ask`)], () => [
      { text: this.T(X0.kind === 'donate' ? 'g.ask.give' : 'g.ask.yes'), tag: 'new', go: () => this.takeSoft(v, X0) },
      { text: this.T('g.ask.no'), go: () => this.chain(v, [this.T('g.soft.no')]) },
    ]);
  }
  takeSoft(v, X0) {
    const ep = X0.ep, s = this.story, d = this.doc, P = this.c.profile;
    if (X0.kind === 'donate') {
      const money = P ? Number(P.money) || 0 : 0;
      if (!P || money < X0.amt || !(typeof P.spend === 'function' && P.spend(X0.amt, `a donation at ${this.owner(ep).store}`) !== false)) return this.chain(v, [this.T('g.soft.short')]);
      this.set(`owner.${ep}.asked`, 'donate');
      d.soft[ep] = { kind: 'donate', amt: X0.amt, day: this.today() }; s.dirty();
      this.soften(ep, false);
      this.set(`owner.${ep}.thanked`);
      return this.chain(v, [this.T(`g.soft.${ep}.done`)]);
    }
    this.set(`owner.${ep}.asked`, X0.kind === 'fish' ? 'fish' : (X0.kinds || [])[0] || 'job');
    const job = this.makeJob(X0);
    const fin = (t) => {
      if (!t) { // no place a board kind could send you today: the keeper takes a donation instead (never stuck)
        return this.chain(v, [this.T('g.soft.short')]);
      }
      d.soft[ep] = { kind: t.kind, task: t.id, day: this.today() }; s.dirty();
      this.note(`Taken on: “${t.title}” · for ${this.first(ep)}`, 6);
      return this.chain(v, [this.T(`g.soft.${ep}.job`)]);
    };
    if (job && typeof job.then === 'function') { job.then((t) => { if (t) { d.soft[ep] = { kind: t.kind, task: t.id, day: this.today() }; s.dirty(); this.note(`Taken on: “${t.title}” · for ${this.first(ep)}`, 6); } else this.donateFallback(ep); }); return this.chain(v, [this.T(`g.soft.${ep}.job`)]); }
    return fin(job);
  }
  // a board kind that writes nothing near this owner today: the ask becomes a small donation, said by note
  donateFallback(ep) {
    const P = this.c.profile, amt = 30;
    if (P && (Number(P.money) || 0) >= amt && typeof P.spend === 'function' && P.spend(amt, 'a donation') !== false) { this.note(`${this.first(ep)} would rather have $${amt} for the jar. Done.`, 6); this.soften(ep, true); }
  }
  // the job: a board kind written for this owner's board and taken on as theirs (no pay; the prices are the thanks), or
  // a laker for the kitchen → the task, or a promise of it, or null
  makeJob(X0) {
    const Tk = this.c.tasks, ep = X0.ep, o = this.owner(ep); if (!Tk) return null;
    const own = (t) => {
      const today = Tk.today();
      Object.assign(t, { status: 'open', taken: today, due: today + (X0.days || (typeof Tk.daysFor === 'function' ? Math.max(10, Tk.daysFor(t)) : 14)), npc: `g:${ep}`, npcName: o.name, sign: o.name, gOwner: ep, pay: 0 });
      if (t.kind === 'fish') t.cooler = t.cooler || [];
      Tk.ads.set(t.id, t);
      try { const K = KINDS[t.kind]; if (K && K.onTake) K.onTake(Tk, t); } catch { /* the kind's */ }
      Tk.changed(); Tk.boardChanged();
      return t;
    };
    if (X0.kind === 'fish') {
      const L = Tk.landing(ep);
      return own({ id: Tk.nextId++, kind: 'fish', from: ep, fromName: L ? L.name : o.store, band: 'far', posted: Tk.today(), species: X0.species, minCm: 0, need: 1, title: 'A laker for the kitchen', text: this.T(`g.soft.${ep}.ask`), clue: this.T(`g.soft.${ep}.ask`) });
    }
    const kinds = (X0.kinds || []).filter((k) => typeof Tk.inWindow !== 'function' || Tk.inWindow(k, undefined, ep));
    return (async () => {
      for (const k of kinds) {
        for (const band of ['local', 'medium']) {
          let t = null; try { t = await Tk.makeKind(k, ep, band); } catch (e) { console.warn('g: a job', k, e); }
          if (t) return own(t);
        }
      }
      return null;
    })();
  }
  jobDone(t) {
    if (!t || t.gOwner == null || !this.live) return;
    const ep = Number(t.gOwner);
    if (this.story.has(`owner.${ep}.softened`)) return;
    this.soften(ep, true);
  }
  soften(ep, thankLater) {
    const s = this.story, d = this.doc;
    this.set(`owner.${ep}.softened`, this.today());
    if (thankLater && d) { d.thank[ep] = true; s.dirty(); const O2 = this.c.outfitter, v = O2 && O2.visit; if (v && Number(v.ep) === ep && v.inside) { this.barked.delete(ep); this.storeEnter(ep); } }
  }

  // --- the places --------------------------------------------------------------------------------------------------------
  placeOf(S) { const d = this.doc; return (d && d.at[S.id]) || (S.place.mode === 'fixed' ? { x: S.at.x, z: S.at.z, h: 0 } : null); }
  ready(x, z) { const W = this.c.world; try { return !!(W && W.isReady(x, z)); } catch { return false; } }
  // work out the secret's spot round its anchor from the tiles in (→ { x, z, h } | null when they are not in yet)
  resolve(S) {
    const W = this.c.world, P = S.place; if (!W || !P) return null;
    if (P.mode === 'fixed') return { x: S.at.x, z: S.at.z, h: 0 };
    if (!this.ready(S.at.x, S.at.z)) return null;
    const R = P.r || 600, step = P.mode === 'summit' ? 15 : 25;
    let best = null, seen = 0, ok = 0;
    const consider = (x, z, d0) => {
      seen++; if (!this.ready(x, z)) return; ok++;
      const sh = W.shoreAt(x, z);
      if (P.mode === 'water') {
        if (sh > -12) return;
        const depth = W.levelAt(x, z) - W.heightAt(x, z); if (!(depth >= P.depth[0] && depth <= P.depth[1] * 1.5)) return;
        const sc = d0 - (depth >= P.depth[0] && depth <= P.depth[1] ? 200 : 0);
        if (!best || sc < best.sc) best = { x, z, sc, h: 0 };
      } else if (P.mode === 'shore') {
        if (!(sh >= P.inland[0] && sh <= P.inland[1])) return;
        let sc = d0;
        if (P.steep) { const g = Math.abs(W.heightAt(x + 4, z) - W.heightAt(x - 4, z)) + Math.abs(W.heightAt(x, z + 4) - W.heightAt(x, z - 4)); sc -= g * 120; }
        if (!best || sc < best.sc) best = { x, z, sc, h: 0 };
      } else if (P.mode === 'summit') {
        const y = W.heightAt(x, z); if (sh <= 2) return;
        if (!best || y > best.y) best = { x, z, y, sc: -y, h: 0 };
      }
    };
    consider(S.at.x, S.at.z, 0);
    for (let r = step; r <= R; r += step) {
      const n = Math.max(8, Math.round((2 * Math.PI * r) / (step * 1.4)));
      for (let k = 0; k < n; k++) { const a = (k / n) * Math.PI * 2; consider(S.at.x + Math.cos(a) * r, S.at.z + Math.sin(a) * r, r); }
      if (best && P.mode !== 'summit' && r > (best.sc + 400)) break; // (nearest first: far rings can't beat it)
    }
    if (ok < seen * 0.6) return null; // (wait for more of the tiles)
    if (!best) return { x: S.at.x, z: S.at.z, h: 0, fallback: true };
    // facing the water: down the shore distance's slope
    const gx = W.shoreAt(best.x + 4, best.z) - W.shoreAt(best.x - 4, best.z), gz = W.shoreAt(best.x, best.z + 4) - W.shoreAt(best.x, best.z - 4);
    const h = Math.atan2(-gx, -gz);
    return { x: Math.round(best.x * 10) / 10, z: Math.round(best.z * 10) / 10, h: Number.isFinite(h) ? Math.round(h * 100) / 100 : 0 };
  }
  ground(x, z) { const t = this.c.tiles; try { const y = t && typeof t.groundAt === 'function' ? t.groundAt(x, z) : null; if (Number.isFinite(y)) return y; } catch { /* */ } const W = this.c.world; try { return W.heightAt(x, z); } catch { return 0; } }

  update(dt) {
    if (!this.live) return;
    this.t += dt; if (this.t < TICK) return; this.t = 0;
    const s = this.story, p = this.c.player; if (!p) return;
    const d = this.doc;
    const want = new Set();
    for (const S of G.SECRETS) {
      const st = G.secretState(s, S.id);
      if (st !== 'given' && !(st === 'found' && (S.id === 'berries'))) continue;
      const dist = Math.hypot(p.x - S.at.x, p.z - S.at.z);
      if (dist > RESOLVE_R + 400) continue;
      if (!this.placeOf(S) && S.place.mode !== 'fixed') { const r = this.resolve(S); if (r) { d.at[S.id] = r; s.dirty(); } }
      const at = this.placeOf(S); if (!at) continue;
      const pd = Math.hypot(p.x - at.x, p.z - at.z);
      const prop = (S.find && S.find.prop) || (S.photo && S.photo.prop);
      if (prop && pd < DRAW_R) want.add(S.id);
      else if (prop && this.props.has(S.id) && pd < DRAW_R + 200) want.add(S.id);
    }
    for (const k of [...this.props.keys()]) if (!want.has(k)) this.dropProp(k);
    for (const id of want) if (!this.props.has(id)) this.buildProp(G.secretOf(id));
  }
  buildProp(S) {
    const sc = this.c.scene, at = this.placeOf(S); if (!sc || !at) return;
    const kind = (S.find && S.find.prop) || (S.photo && S.photo.prop);
    let seed = this.story.hash(`g.prop.${S.id}`); const rng = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    const P = propGeo(kind, rng), y = this.ground(at.x, at.z);
    const m = new THREE.Mesh(P.geo, propMaterial());
    m.name = `g ${S.id}`; m.position.set(at.x, y - 0.05, at.z); m.rotation.y = at.h || 0; m.castShadow = true; m.receiveShadow = true;
    m.matrixAutoUpdate = false; m.updateMatrix(); m.updateMatrixWorld(true); sc.add(m);
    const rec = { mesh: m, offs: [], at, y, local: P.at };
    // the E point, in the world
    const c = Math.cos(at.h || 0), sn = Math.sin(at.h || 0), ex = at.x + P.at.x * c + P.at.z * sn, ez = at.z - P.at.x * sn + P.at.z * c, ey = y + P.at.y;
    rec.e = { x: ex, y: ey, z: ez };
    const pt = this.c.pointer;
    if (S.find && P.r > 0 && pt && typeof pt.register === 'function') rec.offs.push(pt.register((ray, near) => {
      if (!near || near.flat(ex, ez) > P.r + 2.2) return null;
      if (!this.findOpen(S)) return null;
      const hit = near.sphere(ex, ey, ez, P.r); if (!hit) return null;
      return [{ dist: hit.t, miss: hit.miss, target: { kind: 'thing', ref: `g:${S.id}`, label: PROP_LABEL[kind] || S.title, e: { verb: S.find.verb, run: () => this.find(S) } } }];
    }));
    this.props.set(S.id, rec);
  }
  dropProp(k) { const r = this.props.get(k); if (!r) return; if (r.mesh.parent) r.mesh.parent.remove(r.mesh); r.mesh.geometry.dispose(); for (const o of r.offs) { try { o(); } catch { /* gone */ } } this.props.delete(k); }
  findOpen(S) { const st = G.secretState(this.story, S.id); return st === 'given' || (S.id === 'berries' && st === 'found' && !this.hasItem('snack:wildblue')); }
  // E at the place: its line, its thing, found
  find(S) {
    if (!this.live || !this.findOpen(S)) return false;
    const s = this.story, F = S.find || {};
    if (!G.inMonths(S, s.date().month)) { this.note(S.id === 'berries' ? 'Green yet. Not till July.' : 'Nothing to see this time of year.', 4); return false; }
    this.note(this.T(`g.${S.id}.find`), 7);
    if (F.give) this.giveItem(F.give);
    if (F.page) this.giveItem(`page:${F.page}`);
    if (G.secretState(s, S.id) === 'given') this.set(`secret.${S.id}.found`, this.today());
    return true;
  }

  // --- the giant fish: the bite rule ----------------------------------------------------------------------------------------
  giantFor(o) {
    const s = this.story; if (!this.live) return null;
    const m = s.date().month, h = Number.isFinite(o.hours) ? o.hours : s.date().hours;
    for (const S of G.SECRETS) {
      if (S.kind !== 'fish' || G.secretState(s, S.id) !== 'given' || !G.inMonths(S, m)) continue;
      const at = this.placeOf(S); if (!at) continue;
      const F = S.fish;
      if (Math.hypot(o.x - at.x, o.z - at.z) > F.r) continue;
      if (!F.hours.some(([a, b]) => h >= a && h <= b)) continue;
      if (F.lures && !F.lures.includes(o.lure)) continue;
      if (F.minDepth && !(o.depth >= F.minDepth)) continue;
      if ((o.roll ?? Math.random()) >= F.chance) continue;
      return S;
    }
    return null;
  }
  hookFishing() {
    const f = this.c.fishing; if (!f || f.gHooked) return; f.gHooked = true;
    const sb0 = f.startBite.bind(f);
    f.startBite = (id, len = null) => {
      let S = null;
      try { const l = f.lure, def = f.lureDef; if (l && def && !f.onFoot) S = this.giantFor({ x: l.x, z: l.z, depth: l.depth, lure: def.id }); } catch (e) { console.warn('g: the giant', e); }
      if (!S) return sb0(id, len);
      const r = sb0(S.fish.species, S.fish.cm);
      if (f.bite) f.bite.giant = S.id;
      return r;
    };
    const land0 = f.land.bind(f);
    f.land = () => {
      const r = land0();
      try { const L = f.landed; if (L && L.giant) this.landed(L.giant, L); } catch (e) { console.warn('g: the giant landed', e); }
      return r;
    };
  }
  landed(id, L = null) {
    const s = this.story;
    if (!this.live || G.secretState(s, id) !== 'given') return false;
    this.set(`secret.${id}.found`, L && L.length ? Math.round(L.length) : this.today());
    return true;
  }

  // --- the camera ---------------------------------------------------------------------------------------------------------
  hookPhoto() {
    const ph = this.c.photo; if (!ph || typeof ph.onShot !== 'function') return;
    this.offs.push(ph.onShot(({ rec, eye, dir }) => { if (eye && dir) this.shot(eye, dir, rec); }));
  }
  shot(eye, dir, rec = null) {
    const s = this.story; if (!this.live) return [];
    const hits = [];
    for (const S of G.SECRETS) {
      if (S.kind !== 'photo' || G.secretState(s, S.id) !== 'given' || !G.inMonths(S, s.date().month)) continue;
      const at = this.placeOf(S); if (!at) continue;
      const pr = this.props.get(S.id), tx = pr ? pr.e.x : at.x, tz = pr ? pr.e.z : at.z;
      const dx = tx - eye.x, dz = tz - eye.z, dd = Math.hypot(dx, dz);
      if (dd > S.photo.d || dd < 1) continue;
      const off = Math.abs((Math.atan2(dx, dz) - Math.atan2(dir.x, dir.z)) * 180 / Math.PI) % 360;
      if (Math.min(off, 360 - off) > S.photo.deg) continue;
      this.set(`secret.${S.id}.found`, rec && rec.id != null ? rec.id : this.today());
      hits.push(S.id);
    }
    return hits;
  }

  // --- the one-of-a-kind things at work (kit.js recompute, wrapped: the Mackinaw is warm, the old spoon is lucky) -----------
  hookKit() {
    const k = this.c.kit; if (!k || typeof k.recompute !== 'function' || k.gHooked) return; k.gHooked = true;
    const rc0 = k.recompute.bind(k);
    k.recompute = () => { rc0(); try { if (!this.live || !k.mods) return; if (k.has('mackinaw')) k.mods.chill *= 0.85; if (k.has('grandspoon')) k.mods.bite *= 1.05; } catch { /* the kit's */ } };
  }

  // --- for the rigs -------------------------------------------------------------------------------------------------------
  keeperOf(ep) { const N = this.c.npcs; try { return (N.at(Number(ep)) || []).find((q) => q.keeper) || null; } catch { return null; } }
  state() {
    const s = this.story;
    return { end: s.get('end') || null, secrets: Object.fromEntries(G.SECRET_IDS.map((id) => [id, G.secretState(s, id)])), ready: G.secretReady(s), open: G.openSecrets(s),
      softened: G.OWNER_EPS.filter((ep) => s.has(`owner.${ep}.softened`)), at: { ...(this.doc ? this.doc.at : {}) }, props: [...this.props.keys()], soft: { ...(this.doc ? this.doc.soft : {}) } };
  }
  makeDebug() {
    const pick = (node, which) => {
      if (!node || !node.choices) return null;
      const c = typeof which === 'number' ? node.choices[which] : node.choices.find((q) => q.text === which || (q.text || '').includes(which));
      return c ? c.go() : null;
    };
    return {
      state: () => this.state(),
      keeper: (ep) => this.keeperOf(ep),
      choice: (ep) => { const v = this.keeperOf(ep); const c = v ? this.choiceFor(v) : null; return c ? c.text : null; },
      open: (ep) => { const v = this.keeperOf(ep); const c = v ? this.choiceFor(v) : null; return c ? c.go() : null; },
      pick,
      // through a node's lines to its last (the choices that are not "…")
      through: (node) => { let n = node, k = 0; while (n && n.choices && n.choices.length === 1 && n.choices[0].text === '…' && k++ < 12) n = n.choices[0].go(); return n; },
      resolve: (id) => { const S = G.secretOf(id); const r = S ? this.resolve(S) : null; if (r && this.doc) { this.doc.at[id] = r; this.story.dirty(); } return r; },
      place: (id) => { const S = G.secretOf(id); return S ? this.placeOf(S) : null; },
      prop: (id) => { const r = this.props.get(id); return r ? { e: r.e, y: r.y } : null; },
      find: (id) => { const S = G.secretOf(id); return S ? this.find(S) : false; },
      giant: (id, o = {}) => { const S = G.secretOf(id), at = S && this.placeOf(S); if (!at) return null; const h = (S.fish.hours[0][0] + S.fish.hours[0][1]) / 2; const G2 = this.giantFor({ x: at.x, z: at.z, depth: (S.fish.minDepth || 0) + 5, lure: S.fish.lures[0], hours: h, roll: 0, ...o }); return G2 ? G2.id : null; },
      land: (id) => this.landed(id, { length: G.secretOf(id).fish.cm }),
      shoot: (id) => { const S = G.secretOf(id), at = S && this.placeOf(S); if (!at) return []; const pr = this.props.get(id), tx = pr ? pr.e.x : at.x, tz = pr ? pr.e.z : at.z; return this.shot({ x: tx - 30, y: 0, z: tz }, { x: 1, y: 0, z: 0 }, { id: 'rig' }); },
      tick: () => { this.t = TICK; this.update(0); return [...this.props.keys()]; },
    };
  }
}
const PROP_LABEL = { cave: 'A hole in the rock', cabin: 'An old trunk', canoe: 'An overturned canoe', pine: 'A white pine', cairn: 'A cairn', spring: 'A tin cup on a nail', berries: 'Blueberries' };

export const endgames = new Endgames();
