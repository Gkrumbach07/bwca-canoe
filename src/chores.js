import * as THREE from 'three';
import { PropBuilder, propMaterial, TILE } from './prop-kit.js';
import { registerKind } from './tasks.js';
import { GROUND } from './terrain-build.js';
import { dayOfYear } from './astro.js';
import { clock12, word, plural, esc } from './hud.js';
import { mulberry32, hash2 } from './rng.js';
import { save } from './save.js';

// Camp chores (hubs phase 3, stream A). The owner: "it's all just a bunch of little tasks, which at the end of the day,
// you make a fire so you can get more energy, go to sleep so you can get more energy, get water so you can get more
// energy." Each chore is one E, takes its real length on the clock (camp.js CHORES: the walker holds still while the
// clock passes it over a second or so) and gives something back:
// - Firewood. E within WOOD.reach metres of a tree or a log on the ground: an armful of dead and down wood, 25 minutes
//   (10 with the folding saw, player.gear.saw). You have up to WOOD.most armfuls, carried or stacked: walking up to a
//   site's fire ring sets what you carry down there, where it shows as a woodpile (one stack an armful); pushing off
//   from the site takes the stack along in the canoe. Lighting the fire takes an armful, and so does feeding it.
// - The latrine. E at the box back in the trees (props.js c.layout.latrine): ten quiet minutes, rest +0.05, once a day.
// - Blueberries. July 10 to August 20, a patch on the burn or the lichen rock by a site (the tile's ground class,
//   world.coverCell), drawn in season with its berries: E picks a pint in 20 minutes, three pints a site a day (the
//   bushes thin by a third each pint). A pint a berries notice still wants goes into the tin for it; any other you eat
//   as you pick (the food need +0.15).
// - Sleep with a wake time. E at the tent (or ← → there, standing still) opens a small paper card: first light (the
//   default, its time shown), 7:00 or 9:00, chosen with ← →; E again turns in (camp.sleep with the choice).
// And two notices for the boards (tasks.js registerKind): blueberries for the café ($10 a pint, in season) and firewood
// for the sauna ($6 an armful), handed over on foot at the posting outfitter's store and claimed at its counter.
//
// What camp.js asks of it: before(), update(dt), woodHere(key), useWood(key), spotPrompts(site), gatherPrompt(site),
// openWake(site, choice), onLaunch(), card. Everything is saved in the trip's document (trip.state.chores), or under its
// own key with no trip.

export const WOOD = { reach: 10, most: 3, ring: 3.4, stow: 60 };
const AT_LATRINE = 1.9, LATRINE_REST = 0.05;
const AT_BERRIES = 2.8, PINTS_A_DAY = 3, BERRY_FOOD = 0.15;
const PATCH_NEAR = 110;                      // metres from a site at which its patch is drawn
const BERRY_GROUND = new Set(['burn', 'rockLichen']);
export const SEASON = { from: [6, 10], to: [7, 20] }; // [month (0-based), day]: July 10 to August 20, the blueberries
export const PAY = { pint: 10, armful: 6 };
// the wake times on the card: first light (camp.js wakeTime: a quarter hour after sunrise, or later after a late night)
export const WAKES = ['first', 7, 9];

const absDay = (year, doy) => Math.round(Date.UTC(year, 0, doy) / 86400000);
export function berrySeason(year, doy) { return doy >= dayOfYear(year, ...SEASON.from) && doy <= dayOfYear(year, ...SEASON.to); }
const pickR = (rng, list) => list[Math.floor(rng() * list.length)];
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const tone = (hex, rng, dl = 0.06, dh = 0.015) => new THREE.Color(hex).offsetHSL((rng() - 0.5) * dh, 0, (rng() - 0.5) * dl);
const keyOf = (c) => `${Math.round(c.x)}:${Math.round(c.z)}`; // camp.js campKey

let current = null; // the one Chores (the notices' kinds read it)

// --- the looks --------------------------------------------------------------------------------------------------------
// Shade baked by hand for the small things (no bake: they are built often): darker low down and facing down
function shadeBy(geo, f) {
  const P = geo.getAttribute('position'), N = geo.getAttribute('normal'), O = geo.getAttribute('aOcc');
  for (let i = 0; i < O.count; i++) O.setX(i, f(P.getY(i), N.getY(i)));
  O.needsUpdate = true;
  return geo;
}
// The woodpile by a fire ring, in its own frame (x along the first layer, y up from the ground): one stack an armful,
// five split lengths crossed on the one below, birch and pine, some split to show the pale wood. Three geometries.
function woodpileGeometry() {
  const rng = mulberry32(911), out = [];
  const birch = 0xcdc6b6, pine = 0x5e4a39, inner = 0xc6a77c, end = 0xcfb894;
  let y = 0;
  for (let layer = 0; layer < WOOD.most; layer++) {
    const b = new PropBuilder(), along = layer % 2 === 0, n = 5;
    let top = 0;
    for (let i = 0; i < n; i++) {
      const r = 0.05 + rng() * 0.026, off = (i - (n - 1) / 2) * 0.145 + (rng() - 0.5) * 0.025, h = y + r * 0.92, len = 0.6 + rng() * 0.14;
      const sl = (rng() - 0.5) * 0.08, sk = (rng() - 0.5) * 0.09, bark = rng() < 0.45 ? tone(birch, rng, 0.08) : tone(pine, rng, 0.1);
      const p0 = along ? V(-len / 2 + sl, h, off - sk) : V(off - sk, h, -len / 2 + sl), p1 = along ? V(len / 2 + sl, h + (rng() - 0.5) * 0.015, off + sk) : V(off + sk, h + (rng() - 0.5) * 0.015, len / 2 + sl);
      const split = rng() < 0.55, up = V(Math.cos(rng() * 6.28), 0.6 + rng(), Math.sin(rng() * 6.28)).normalize();
      b.cyl(p0, p1, r, r * 0.94, 7, TILE.BARK, bark, { arc: split ? [Math.PI * 0.1, Math.PI * 1.25] : null, flatTile: TILE.SPLIT, flatCol: tone(inner, rng, 0.08), cap0: true, cap1: true, capCol: tone(end, rng, 0.08), phase: rng() * 6, up });
      top = Math.max(top, h + r);
    }
    const g = b.build();
    const y0 = y, y1 = top;
    shadeBy(g, (py, ny) => (0.62 + 0.38 * Math.min(1, Math.max(0, (py - y0) / Math.max(0.05, y1 - y0)))) * (ny < -0.3 ? 0.72 : 1) * (layer === 0 ? 0.9 : 1));
    out.push(g);
    y = top - 0.035;
  }
  return out;
}
// A low faceted mound of leaves: an icosahedron squashed and jittered, flat faces in a few greens (Firewatch's
// "graphic" foliage: big simple shapes coloured by the light)
// (a patch is a few hundred of them and a thousand berries, built as you come near a site: the icosahedron's twelve
// corners and twenty faces are read once, and the vertices written straight in, about 6 ms a patch)
let ICO = null;
function icosahedron() {
  if (ICO) return ICO;
  const g = new THREE.IcosahedronGeometry(1, 0), pos = g.getAttribute('position'), verts = [], idx = [], seen = new Map();
  for (let i = 0; i < pos.count; i++) {
    const k = `${pos.getX(i).toFixed(3)},${pos.getY(i).toFixed(3)},${pos.getZ(i).toFixed(3)}`;
    let j = seen.get(k);
    if (j === undefined) { j = verts.length; seen.set(k, j); verts.push([pos.getX(i), pos.getY(i), pos.getZ(i)]); }
    idx.push(j); // three's winding: each face counter-clockwise seen from outside
  }
  g.dispose();
  return (ICO = { verts, idx });
}
function mound(b, rng, cx, cy, cz, rx, ry, rz, greens) {
  const { verts, idx } = icosahedron();
  const P = verts.map(([x, y, z]) => { const j = 0.82 + rng() * 0.3; return { x: cx + x * rx * j, y: cy + Math.max(-0.35, y) * ry * j, z: cz + z * rz * j }; });
  for (let i = 0; i < idx.length; i += 3) {
    const A = P[idx[i]], B = P[idx[i + 1]], Cc = P[idx[i + 2]], col = tone(pickR(rng, greens), rng, 0.08, 0.02);
    const ux = B.x - A.x, uy = B.y - A.y, uz = B.z - A.z, vx = Cc.x - A.x, vy = Cc.y - A.y, vz = Cc.z - A.z;
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz);
    if (l < 1e-12) continue; // a bottom face flattened to nothing
    nx /= l; ny /= l; nz /= l;
    const n = { x: nx, y: ny, z: nz };
    for (const Q of [A, B, Cc]) b.vert(Q, n, Q.x * 3, Q.z * 3, TILE.PLAIN, col);
  }
}
// a berry: a little octahedron, dusty blue with its bloom (its eight faces' normals worked out once)
const OCT = [];
for (const sx of [1, -1]) for (const sy of [1, -1]) for (const sz of [1, -1]) OCT.push({ sx, sy, sz, flip: sx * sy * sz < 0, n: new THREE.Vector3(sx, sy / 0.9, sz).normalize() });
function berry(b, p, r, col) {
  const h = r * 0.9;
  for (const o of OCT) {
    const X = { x: p.x + o.sx * r, y: p.y, z: p.z }, Y = { x: p.x, y: p.y + o.sy * h, z: p.z }, Z = { x: p.x, y: p.y, z: p.z + o.sz * r };
    for (const Q of o.flip ? [X, Z, Y] : [X, Y, Z]) b.vert(Q, o.n, 0.5, 0.5, TILE.PLAIN, col);
  }
}
// A blueberry patch seated on the ground (gy(x, z): the drawn ground at a point, world metres): low bushes over about
// 2 m and their berries in three geometries, a third of the berries in each (a pint picked hides one). In world
// coordinates less the patch's centre (the mesh is placed at x, gy(x, z), z).
function berryGeometry(x0, z0, gy, seed) {
  const rng = mulberry32(seed), lv = new PropBuilder(), bs = [new PropBuilder(), new PropBuilder(), new PropBuilder()];
  const greens = [0x5e8139, 0x6e9042, 0x527235, 0x7f9b4a, 0x63863f], bronze = 0x7d6a3c, blues = [0x4c5f96, 0x5a6ba2, 0x404e82, 0x5f6a9a], y0 = gy(x0, z0);
  const bushes = 24 + Math.floor(rng() * 6);
  let nb = 0;
  for (let i = 0; i < bushes; i++) {
    const a = rng() * 6.28, d = Math.sqrt(rng()), bx = Math.cos(a) * d * 1.6, bz = Math.sin(a) * d * 1.15;
    const s = (1.0 + rng() * 0.6) * (1.15 - 0.35 * d), tops = [];
    // a low bush: a handful of small leafy clumps, the middle ones higher, now and then one gone bronze
    const clumps = 5 + Math.floor(rng() * 3);
    for (let m = 0; m < clumps; m++) {
      const t = rng() * 6.28, o = m ? (0.06 + rng() * 0.13) * s : 0, mx = bx + Math.cos(t) * o, mz = bz + Math.sin(t) * o;
      const rx = (0.075 + rng() * 0.05) * s, ry = (0.07 + rng() * 0.04) * s, lift = (0.22 - o) * 0.75 * s + rng() * 0.04;
      const my = gy(x0 + mx, z0 + mz) - y0 + ry * 0.45 + Math.max(0, lift);
      mound(lv, rng, mx, my, mz, rx, ry, rx * (0.8 + rng() * 0.35), rng() < 0.03 ? [bronze] : greens);
      tops.push([mx, my, mz, rx, ry]);
    }
    // the berries: small blue clusters sitting proud on the clumps' tops and shoulders, a few berries a cluster drawn a
    // little bigger than life (a real one is a centimetre across: life-size, they vanish two steps off), where they show
    // from the camp
    for (const [mx, my, mz, rx, ry] of tops) {
      const clusters = 1 + Math.floor(rng() * 1.8);
      for (let k = 0; k < clusters; k++) {
        const t = rng() * 6.28, u = 0.15 + rng() * 0.55, ct = Math.cos(t), st = Math.sin(t), col = tone(pickR(rng, blues), rng, 0.08, 0.012);
        const cx = mx + ct * rx * u * 1.12, cz = mz + st * rx * u * 1.12, cy = my + ry * Math.sqrt(Math.max(0, 1 - u * u)) * 1.1;
        const many = 4 + Math.floor(rng() * 4);
        for (let q = 0; q < many; q++) {
          const a2 = (q / many) * 6.28 + rng() * 0.6, d2 = q ? 0.022 + rng() * 0.016 : 0, r = 0.019 + rng() * 0.007;
          berry(bs[nb % 3], V(cx + Math.cos(a2) * d2, cy + r * 0.6 + (q ? -rng() * 0.012 : 0.008), cz + Math.sin(a2) * d2), r, q % 3 === 2 ? col.clone().offsetHSL(0, 0, 0.06) : col);
        }
        nb++;
      }
    }
  }
  const leaves = shadeBy(lv.build(), (py, ny) => (0.58 + 0.42 * Math.min(1, Math.max(0, (py + 0.02) / 0.3))) * (ny < -0.2 ? 0.72 : 1));
  return { leaves, berries: bs.map((b) => shadeBy(b.build(), (py, ny) => (ny < -0.3 ? 0.8 : 1))) };
}

// --- the wake-time card ----------------------------------------------------------------------------------------------
// A small paper slip over the camp (no scrim: the evening stays in view): first light, 7:00, 9:00; ← → chooses, E turns
// in, Esc (or Q, or a step away) lets it be. Its keys are taken in the capture phase, ahead of the game's, the title's
// pause and the map's (the camp is made before them, so this listener runs first).
const CSS = `
#wake-card { left: 50%; margin-left: -230px; bottom: 112px; width: 460px; padding: 15px 20px 13px; display: flex; flex-direction: column; gap: 10px; z-index: 6; }
#wake-card .kick { font-size: 11.5px; letter-spacing: .16em; }
#wake-card h4 { margin: 0; font: 500 24px/1.1 var(--serif); color: var(--ink); }
#wake-card .row { display: flex; gap: 10px; }
#wake-card .opt { flex: 1 1 0; display: flex; flex-direction: column; align-items: center; gap: 1px; padding: 8px 6px 7px; border: 1.5px solid var(--edge); border-radius: 3px; background: transparent; color: var(--ink-soft); cursor: pointer; }
#wake-card .opt b { font: 600 19px/1.15 var(--serif); color: var(--ink); }
#wake-card .opt span { font: 700 11px/1.3 var(--sc); letter-spacing: .1em; }
#wake-card .opt.on { background: var(--ink); border-color: var(--ink); color: var(--paper-card); }
#wake-card .opt.on b { color: var(--paper); }
#wake-card .sub { font: italic 15.5px/1.3 var(--serif); color: var(--ink-soft); min-height: 1.3em; }
#wake-card .keys { display: flex; align-items: center; gap: 7px; font: 700 11px/1.3 var(--sc); letter-spacing: .1em; color: var(--ink-soft); }
#wake-card .keys .stamp { margin-left: auto; }
`;
let cssIn = false;
function injectCss() {
  if (cssIn || typeof document === 'undefined') return;
  cssIn = true;
  const s = document.createElement('style'); s.id = 'chores-css'; s.textContent = CSS;
  document.head.appendChild(s);
}
class WakeCard {
  constructor() {
    injectCss();
    const el = this.el = document.createElement('div');
    el.id = 'wake-card'; el.className = 'paper'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'When to wake');
    el.innerHTML = '<div class="sc kick"></div><h4>Up at</h4><div class="row" role="radiogroup" aria-label="Wake at"></div><p class="sub"></p>'
      + '<div class="keys"><kbd>←</kbd><kbd>→</kbd> the time <kbd>E</kbd> sleep <kbd>Esc</kbd> not yet<button type="button" class="stamp small" data-go="1">Sleep</button></div>';
    document.body.appendChild(el);
    this.kick = el.querySelector('.kick'); this.row = el.querySelector('.row'); this.sub = el.querySelector('.sub');
    this.isOpen = false; this.i = 0; this.opts = []; this.onPick = null; this.onClose = null;
    el.addEventListener('click', (e) => {
      if (e.target.closest('[data-go]')) { this.confirm(); return; }
      const b = e.target.closest('button[data-i]');
      if (b) { this.set(+b.dataset.i); if (e.detail >= 2) this.confirm(); }
    });
    window.addEventListener('keydown', (e) => {
      if (!this.isOpen) return;
      const c = e.code;
      if (c === 'ArrowLeft' || c === 'KeyA') this.set(this.i - 1);
      else if (c === 'ArrowRight' || c === 'KeyD') this.set(this.i + 1);
      else if (c === 'KeyE' || c === 'Enter' || c === 'Space') { if (!e.repeat) this.confirm(); }
      else if (c === 'Escape' || c === 'KeyQ' || c === 'Backspace') this.close();
      else { if (!/^(Shift|Control|Alt|Meta|Tab)/.test(c)) this.close(); return; } // a step away (W), the map: the card goes
      e.preventDefault(); e.stopImmediatePropagation();
    }, true);
  }
  get open() { return this.isOpen; }
  // opts: [{ choice, label, at, hours, words }]; i: the one chosen to begin with
  show({ kicker, opts, i = 0, onPick, onClose = null }) {
    this.opts = opts; this.onPick = onPick; this.onClose = onClose;
    this.kick.textContent = kicker || 'Turn in';
    this.row.innerHTML = opts.map((o, k) => `<button type="button" class="opt" role="radio" data-i="${k}"><b>${esc(o.label)}</b><span>${esc(o.small)}</span></button>`).join('');
    this.isOpen = true;
    this.set(i);
    this.el.classList.add('show');
  }
  set(i) {
    this.i = Math.max(0, Math.min(this.opts.length - 1, i));
    [...this.row.children].forEach((b, k) => { b.classList.toggle('on', k === this.i); b.setAttribute('aria-checked', String(k === this.i)); });
    const o = this.opts[this.i];
    this.sub.textContent = o ? o.words : '';
  }
  get choice() { const o = this.opts[this.i]; return o ? o.choice : 'first'; }
  confirm() { if (!this.isOpen) return; const c = this.choice, f = this.onPick; this.hide(); if (f) f(c); }
  close() { if (!this.isOpen) return; const f = this.onClose; this.hide(); if (f) f(); }
  hide() { this.isOpen = false; this.el.classList.remove('show'); }
}

// --- the chores --------------------------------------------------------------------------------------------------------
export class Chores {
  // camp: the Camp (camp.js); everything else comes through it (the world, the player, the day, the energy, the scene,
  // the tiles, the fires, the outfitter); tasks (tasks.js) is set by main.js
  constructor(camp) {
    this.camp = camp; this.tasks = null;
    this.card = new WakeCard();
    this.patches = new Map();   // site key -> { x, z, seed } | null (no berry ground near it)
    this.patchMesh = null;      // the patch drawn now: { key, group, berries: [mesh × 3] }
    this.pileMesh = null;       // the woodpile: { group, layers: [mesh × 3] }, placed at the pile's site
    this.s = blank();           // what is saved: { arms, pile: { key, n } | null, pints, latrine, picked: { key: [day, n] } }
    this.stateRef = undefined;  // the trip's document the saved part was read from
    this.t = 0; this.sleepOffer = false; this.near = null; this.woodNear = null; this.woodT = 0;
    current = this;
  }
  get world() { return this.camp.world; }
  get player() { return this.camp.player; }
  get energy() { return this.camp.energy; }
  get day() { return this.camp.day; }
  get today() { const d = this.day; return absDay(d.year, d.doy); }
  get inSeason() { const d = this.day; return berrySeason(d.year, d.doy); }
  note(t, s) { this.camp.note(t, s); }

  // --- the wood you have --------------------------------------------------------------------------------------------
  get arms() { return this.s.arms; }
  get pints() { return this.s.pints; }
  get pile() { return this.s.pile; }
  get wood() { return this.s.arms + (this.s.pile ? this.s.pile.n : 0); }
  // the armfuls to hand at site `key`: what you carry and what is stacked by its ring
  woodHere(key) { const p = this.s.pile; return this.s.arms + (p && p.key === key ? p.n : 0); }
  // an armful for the fire at site `key`: off its stack first, else from your arms
  useWood(key) {
    const p = this.s.pile;
    if (p && p.key === key && p.n > 0) { p.n--; if (!p.n) this.s.pile = null; }
    else if (this.s.arms > 0) this.s.arms--;
    else return false;
    this.placePile(); this.persist();
    return true;
  }
  woodWords(key) {
    const p = this.s.pile, stacked = p && p.key === key ? p.n : 0, n = stacked + this.s.arms;
    return stacked ? `an armful off the stack${n > 1 ? `, ${word(n - 1)} left after` : ''}` : `the armful you carry${n > 1 ? `, ${word(n - 1)} left after` : ''}`;
  }

  // --- the frame ------------------------------------------------------------------------------------------------------
  // before player.update (camp.before): ← → at the tent, standing still, opens the card with the time moved on
  before() {
    const c = this.camp, inp = this.player.input;
    if (this.card.open || !this.sleepOffer) return;
    if (c.still < 0.3 || inp.paused) return;
    const r = inp.pressed('ArrowRight'), l = inp.pressed('ArrowLeft');
    if ((r || l) && this.sleepSite !== undefined) this.openWake(this.sleepSite, r ? 1 : 0);
  }
  // after the player has moved (camp.update): the saved part, the wood set down at a ring, the patch and the pile drawn
  update(dt) {
    const c = this.camp, p = this.player;
    if (c.state !== this.stateRef) { this.stateRef = c.state; this.restore(); }
    this.sleepOffer = false;
    this.t -= dt;
    if (this.t > 0) return;
    this.t = 0.25;
    if (p.mode === 'walk' && !p.teleporting) {
      const site = this.near = c.nearestSite(p.x, p.z, 30, true);
      if (site && this.s.arms > 0 && this.atRing(site)) this.note(`You stack the wood by the ring: ${this.stackAt(site)}.`, 4);
    } else this.near = null;
    this.berries();
    if (this.s.pile && (!this.pileMesh || !this.pileMesh.group.visible)) this.placePile();
  }
  // within a step of the ring of a site that is yours or free
  atRing(site) {
    const p = this.player, f = site.layout.fire, h = this.camp.registry.holder(keyOf(site));
    return (!h || h === 'player') && Math.hypot(f.x - p.x, f.z - p.z) < WOOD.ring;
  }
  // what you carry set down by the ring (a stack left at another site comes along: one stack at a time); its words
  stackAt(site) {
    const n = Math.min(WOOD.most, this.wood);
    this.s.pile = { key: keyOf(site), n }; this.s.arms = 0;
    this.placePile(); this.persist();
    return `${word(n)} ${plural(n, 'armful')}${n > 1 ? ' now' : ''}`;
  }

  // --- prompts --------------------------------------------------------------------------------------------------------
  // the latrine box and the blueberries, by their own spots at a site (true when one of them holds E)
  spotPrompts(site) {
    const c = this.camp, p = this.player, L = site.layout;
    if (L.latrine && Math.hypot(L.latrine.x - p.x, L.latrine.z - p.z) < AT_LATRINE) {
      if (this.s.latrine === this.today) return false;
      c.offer('Use the latrine', 'the box back in the trees', () => this.useLatrine());
      return true;
    }
    const patch = this.inSeason ? this.patchFor(site) : null;
    if (patch && Math.hypot(patch.x - p.x, patch.z - p.z) < AT_BERRIES) {
      const left = this.pintsLeft(keyOf(site));
      if (left <= 0) { c.say('Blueberries · picked clean today; more ripen by tomorrow'); return true; }
      const want = this.pintsWanted() > this.s.pints;
      c.offer('Pick blueberries', `a pint, 20 min${want ? ', for the notice' : ''} · ${word(left)} ${plural(left, 'pint')} on the bushes`, () => this.pick(site));
      return true;
    }
    return false;
  }
  // E near a tree or a log: an armful (true when it holds E)
  gatherPrompt() {
    const c = this.camp, p = this.player;
    if (this.wood >= WOOD.most || !this.woodSourceNear(p.x, p.z)) return false;
    const saw = !!(p.gear && p.gear.saw), n = this.wood;
    c.offer('Gather firewood', `an armful of dead and down${saw ? ' with the saw, 10 min' : ', 25 min'}${n ? ` · ${word(n)} to hand` : ''}`, () => this.gather());
    return true;
  }
  // a tree, a stump or a log within reach of (x, z), from the walker's own list (tiles.js treesNear): the trunks, and the
  // props' footprints that have a top to step over; never a rock, a tent, a wall, a fire ring or the latrine box
  woodSourceNear(x, z) {
    const t = this.camp.tiles;
    if ((this.woodT -= 1) > 0 && this.woodNear && Math.hypot(this.woodNear.x - x, this.woodNear.z - z) < 0.8) return this.woodNear.ok;
    this.woodT = 8;
    const site = this.near, L = site && site.layout, skip = L ? [L.fire, L.latrine].filter(Boolean) : [];
    const ok = !!(t && t.treesNear(x, z, WOOD.reach).some((o) => !o.rock && !o.tent && (!o.box || o.top !== undefined) && !skip.some((s) => Math.hypot(s.x - o.x, s.z - o.z) < 1.3)));
    this.woodNear = { x, z, ok };
    return ok;
  }

  // --- the chores themselves ----------------------------------------------------------------------------------------
  gather() {
    const c = this.camp, p = this.player, saw = !!(p.gear && p.gear.saw);
    if (this.wood >= WOOD.most) { this.note('Three armfuls is plenty.'); return; }
    c.chore(saw ? 'saw' : 'gather', () => {
      this.s.arms++;
      const what = saw ? 'A dead spruce sawn into lengths' : 'An armful of dead and down birch and pine', site = this.near;
      if (site && site.layout && this.atRing(site)) this.note(`${what}, stacked by the ring: ${this.stackAt(site)}.`, 5);
      else { this.note(`${what}. ${this.wood >= WOOD.most ? 'That makes three: plenty for the night.' : site ? 'Carry it to the ring.' : `${cap(word(this.wood))} to hand.`}`, 5); this.persist(); }
    });
  }
  useLatrine() {
    this.camp.chore('latrine', () => {
      const e = this.energy;
      this.s.latrine = this.today;
      if (e && e.live && e.needs) {
        // the rest need is the night's rest under a ceiling that falls with the hours awake (energy.js restCeiling: a
        // thirtieth an hour), so the box gives back what an hour and a half less awake would, and the night's share too
        const want = Math.min(1, e.needs.rest + LATRINE_REST);
        if (Number.isFinite(e.awakeSince)) e.awakeSince = Math.min(e.now, e.awakeSince + LATRINE_REST * 30);
        e.needs.rest = want;
      }
      this.note('Ten quiet minutes on the box back in the trees, a red squirrel scolding. A little more rested.', 5);
      this.persist();
    });
  }
  pick(site) {
    const key = keyOf(site);
    this.camp.chore('pick', () => {
      const today = this.today, pk = this.s.picked[key];
      this.s.picked[key] = [today, (pk && pk[0] === today ? pk[1] : 0) + 1];
      const want = this.pintsWanted();
      if (want > this.s.pints) {
        this.s.pints++;
        const t = this.berryNotice();
        this.note(`A pint of blueberries into the tin${t ? ` for “${t.title}”` : ''}: ${word(this.s.pints)} of ${word(want)}.`, 5);
      } else {
        const e = this.energy;
        if (e && e.live && e.needs) e.needs.food = Math.min(1, e.needs.food + BERRY_FOOD);
        this.note('A pint of blueberries, warm from the sun. Most of them go in by the handful.', 5);
      }
      this.berries();
      this.persist();
    });
  }
  pintsLeft(key) { const pk = this.s.picked[key]; return PINTS_A_DAY - (pk && pk[0] === this.today ? pk[1] : 0); }
  // the pints the berries notices taken on still want, from any board
  pintsWanted() { return this.notices('berries').reduce((s, t) => s + Math.max(0, (t.need || 1) - (t.got || 0)), 0); }
  berryNotice() { return this.notices('berries')[0] || null; }
  notices(kind) { const T = this.tasks; return T ? T.active.filter((t) => t.kind === kind && t.status === 'open') : []; }

  // pushing off (camp.leave): the stack at a ring you leave from goes in the canoe with you
  onLaunch() {
    const p = this.s.pile, pl = this.player;
    if (!p) return 0;
    const site = this.camp.registry.site(p.key), f = site && site.layout ? site.layout.fire : site;
    if (!f || Math.hypot(f.x - pl.x, f.z - pl.z) > WOOD.stow) { this.s.pile = null; this.placePile(); this.persist(); return 0; }
    const n = Math.min(WOOD.most, p.n + this.s.arms);
    this.s.arms = n; this.s.pile = null;
    this.placePile(); this.persist();
    return n;
  }

  // --- the wake-time card -------------------------------------------------------------------------------------------
  // the options at this hour (camp.wakeTime for each), the card up with `i` chosen
  openWake(site, i = 0) {
    const c = this.camp;
    const opts = WAKES.map((choice) => {
      const w = c.wakeTime(choice), h = Math.floor(w.hours + 1e-6), m = Math.round((w.hours - h) * 60);
      const long = w.hours >= 7 ? 'a full night' : `a short night: the tent gives ${Math.round(Math.min(1, w.hours / 7) * 100)} % of its rest`;
      const t = clock12(w.at), [hm, ap] = t.split(' ');
      return { choice, at: w.at, hours: w.hours, label: choice === 'first' ? 'First light' : hm, small: choice === 'first' ? t : ap, words: `${h} h${m ? ` ${m} min` : ''} of sleep · ${long}` };
    });
    this.card.show({ kicker: `Turn in · ${site ? c.siteName(site) : 'your tent'}`, opts, i, onPick: (choice) => c.sleep('tent', choice) });
  }
  // camp.tentPrompts: the sleep prompt is up this frame (so ← → there opens the card)
  offered(site) { this.sleepOffer = true; this.sleepSite = site; }

  // --- blueberries ----------------------------------------------------------------------------------------------------
  // where a site's patch is: the nearest open berry ground (the burn, the lichen rock) 5 to 34 m from its ring, dry, not
  // steep, clear of trunks, rocks, the tent pad, the bench and the latrine; null when there is none; undefined until the
  // site's tile has built it
  patchFor(site) {
    const key = keyOf(site);
    if (this.patches.has(key)) return this.patches.get(key);
    const L = site.layout, w = this.world, t = this.camp.tiles;
    if (!L || !t) return undefined;
    const f = L.fire, avoid = [[L.pad, 5], [L.bench, 3], [L.latrine, 4]].filter(([q]) => q), wd = w.deeperDir(f.x, f.z);
    let best = null;
    for (let r = 8; r <= 34 && !best; r += 2.5) {
      const a0 = hash2(Math.round(site.x), Math.round(site.z), 41) * 6.28;
      for (let k = 0; k < 20 && !best; k++) {
        const a = a0 + (k / 20) * 6.28, x = f.x + Math.cos(a) * r, z = f.z + Math.sin(a) * r;
        const cv = w.coverCell(w.cellI(x), w.cellJ(z));
        if (!cv || !BERRY_GROUND.has(GROUND[(cv >> 16) & 255])) continue;
        // at the edge of the camp, not on the way down to the water where the canoes come in
        if (w.shoreAt(x, z) < 3.5 || (r < 16 && Math.cos(a) * wd.x + Math.sin(a) * wd.z > 0.6) || avoid.some(([q, d]) => Math.hypot(q.x - x, q.z - z) < d)) continue;
        let lo = Infinity, hi = -Infinity;
        for (const [u, v] of [[-1.1, 0], [1.1, 0], [0, -0.9], [0, 0.9], [0, 0]]) { const h = t.groundAt(x + u, z + v); lo = Math.min(lo, h); hi = Math.max(hi, h); }
        if (hi - lo > 0.55) continue;
        if (t.treesNear(x, z, 1.5).length) continue;
        best = { x, z, seed: (hash2(Math.round(x), Math.round(z), 43) * 1e9) >>> 0, r };
      }
    }
    this.patches.set(key, best);
    return best;
  }
  // the patch of the nearest site within PATCH_NEAR, drawn in season with what is left on it today
  berries() {
    const p = this.player, c = this.camp;
    let want = null;
    if (this.inSeason && (p.mode === 'walk' || p.mode === 'paddle')) {
      const site = c.nearestSite(p.x, p.z, PATCH_NEAR, true), patch = site ? this.patchFor(site) : null;
      if (patch) want = { key: keyOf(site), patch };
    }
    let m = this.patchMesh;
    if (!want) { if (m) m.group.visible = false; return; }
    if (!m || m.key !== want.key) { this.dropPatch(); m = this.patchMesh = this.buildPatch(want.key, want.patch); }
    m.group.visible = true;
    const left = this.pintsLeft(want.key);
    m.berries.forEach((b, i) => { b.visible = i < left; });
  }
  buildPatch(key, patch) {
    const t = this.camp.tiles, gy = (x, z) => t.groundAt(x, z);
    const { leaves, berries } = berryGeometry(patch.x, patch.z, gy, patch.seed);
    const mat = propMaterial(), group = new THREE.Group();
    group.name = 'blueberry patch';
    const mk = (g) => { const m = new THREE.Mesh(g, mat); m.castShadow = true; m.receiveShadow = true; m.matrixAutoUpdate = false; group.add(m); return m; };
    mk(leaves);
    const bm = berries.map(mk);
    group.position.set(patch.x, gy(patch.x, patch.z), patch.z);
    group.matrixAutoUpdate = false; group.updateMatrix(); group.updateMatrixWorld(true);
    this.camp.scene.add(group);
    return { key, group, berries: bm };
  }
  dropPatch() {
    const m = this.patchMesh;
    if (!m) return;
    this.camp.scene.remove(m.group);
    m.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    this.patchMesh = null;
  }

  // --- the woodpile -------------------------------------------------------------------------------------------------
  // where a site's stack goes: a step and a half from the ring on its back side (away from the water), clear of the
  // bench, the pad and any trunk, on ground that is near level; { x, z, a } (a: the first layer's bearing)
  pileSpot(site) {
    if (site.pileSpot) return site.pileSpot;
    const L = site.layout, f = L.fire, t = this.camp.tiles, back = f.a || 0;
    let best = null;
    for (let k = 0; k < 16; k++) {
      const a = back + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.39, x = f.x + Math.cos(a) * 1.85, z = f.z + Math.sin(a) * 1.85;
      if (this.world.shoreAt(x, z) < 1.2) continue;
      if (Math.hypot(L.bench.x - x, L.bench.z - z) < 1.6 || Math.hypot(L.pad.x - x, L.pad.z - z) < 2.6) continue;
      if (t.treesNear(x, z, 0.7).some((o) => !(o.x === f.x && o.z === f.z))) continue;
      let lo = Infinity, hi = -Infinity;
      for (const [u, v] of [[-0.35, -0.35], [0.35, -0.35], [0.35, 0.35], [-0.35, 0.35]]) { const h = t.groundAt(x + u, z + v); lo = Math.min(lo, h); hi = Math.max(hi, h); }
      const score = hi - lo + Math.ceil(k / 2) * 0.03;
      if (!best || score < best.score) best = { x, z, a: a + Math.PI / 2, score, y: lo };
    }
    if (!best) best = { x: f.x + Math.cos(back) * 1.85, z: f.z + Math.sin(back) * 1.85, a: back + Math.PI / 2, y: t.groundAt(f.x, f.z) };
    site.pileSpot = best;
    return best;
  }
  // the woodpile drawn at the stack's site (one layer an armful), or hidden
  placePile() {
    const p = this.s.pile, site = p ? this.camp.registry.site(p.key) : null;
    if (!p || !site || !site.layout) { if (this.pileMesh) this.pileMesh.group.visible = false; return; }
    if (!this.pileMesh) {
      const mat = propMaterial(), group = new THREE.Group();
      group.name = 'woodpile';
      const layers = woodpileGeometry().map((g) => { const m = new THREE.Mesh(g, mat); m.castShadow = true; m.receiveShadow = true; m.matrixAutoUpdate = false; group.add(m); return m; });
      group.matrixAutoUpdate = false;
      this.camp.scene.add(group);
      this.pileMesh = { group, layers };
    }
    const s = this.pileSpot(site), m = this.pileMesh;
    const t = this.camp.tiles, gy = Math.min(t.groundAt(s.x, s.z), s.y + 0.06) - 0.015;
    m.group.position.set(s.x, gy, s.z); m.group.rotation.set(0, -s.a, 0);
    m.group.updateMatrix(); m.group.updateMatrixWorld(true);
    m.layers.forEach((l, i) => { l.visible = i < p.n; });
    m.group.visible = true;
  }

  // --- saving ---------------------------------------------------------------------------------------------------------
  serialize() { return { v: 1, ...this.s, picked: { ...this.s.picked } }; }
  persist() {
    const c = this.camp, st = c.state;
    // only today's picking is worth keeping
    const today = this.today;
    for (const k of Object.keys(this.s.picked)) if (this.s.picked[k][0] !== today) delete this.s.picked[k];
    if (st) { st.chores = this.serialize(); if (c.outfitter && c.outfitter.save) c.outfitter.save(); }
    else save.write('chores', this.serialize());
  }
  restore() {
    const st = this.camp.state, d = st ? st.chores : save.read('chores');
    this.s = blank();
    if (d && d.v === 1) {
      this.s.arms = Math.max(0, Math.min(WOOD.most, d.arms | 0));
      this.s.pile = d.pile && d.pile.key && d.pile.n > 0 ? { key: d.pile.key, n: Math.min(WOOD.most, d.pile.n | 0) } : null;
      this.s.pints = Math.max(0, d.pints | 0);
      this.s.latrine = d.latrine ?? null;
      this.s.picked = d.picked && typeof d.picked === 'object' ? { ...d.picked } : {};
    }
    this.placePile();
  }
}
const blank = () => ({ arms: 0, pile: null, pints: 0, latrine: null, picked: {} });
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

// --- the notices -------------------------------------------------------------------------------------------------------
// Blueberries for the kitchen ($10 a pint) and an armful for the stove ($6 an armful), each posted at an outfitter and
// handed over on foot at its store (tasks.update while taken on: the store's visit is that outfitter's), then claimed at
// its counter. The berries are posted only in their season.
const BERRY_WORDS = [
  { need: 3, title: 'Blueberries for pies', text: 'Three pints of wild blueberries for the pies. They come on in the burns and on the lichen rock above the campsites.', sign: 'Deb, in the café' },
  { need: 1, title: 'A pint of blueberries', text: 'One pint for the Sunday pancakes. The open rock by the campsites is where they grow.', sign: 'the cook' },
  { need: 2, title: 'Blueberries for jam', text: 'Two pints for a batch of jam. Pick them where the old fire went through.', sign: 'Lorraine, cabin 4' },
];
const WOOD_WORDS = [
  { need: 1, title: 'Wood for the sauna', text: 'The sauna stove is hungry. An armful of dead and down from any campsite, left by the door.', sign: 'the lodge' },
  { need: 2, title: 'Firewood wanted', text: 'Two armfuls for the bunkhouse stove. Dead and down only, please: no live trees.', sign: 'the bunkhouse' },
  { need: 1, title: 'Wood for the smoker', text: 'An armful of dry wood for the smokehouse. Birch burns sweetest.', sign: 'the smokehouse out back' },
];
// at the posting outfitter's store, on foot: what you have goes over, up to what the notice wants
function handOver(T, t, have, take, words) {
  const o = T.outfitter, v = o && o.visit;
  if (!current || !v || v.ep !== t.from || T.player.teleporting) return;
  const want = (t.need || 1) - (t.got || 0), n = Math.min(want, have);
  if (n <= 0) return;
  take(n); t.got = (t.got || 0) + n;
  const done = t.got >= (t.need || 1);
  if (done) t.status = 'done';
  T.note(words(n, done, (t.need || 1) - t.got));
  current.persist(); T.changed(); T.boardChanged();
}
registerKind('berries', {
  label: 'For the kitchen', weight: { local: 0.9, medium: 0.45, far: 0 },
  make(T, c) {
    const d = T.day || (typeof window !== 'undefined' && window.__game ? window.__game.day : null);
    if (!d || !berrySeason(d.year, d.doy) || c.board.some((t) => t && t.kind === 'berries')) return null;
    const W = pickR(c.rng, BERRY_WORDS);
    return { need: W.need, got: 0, title: W.title, text: W.text, sign: W.sign };
  },
  pay(t) { return PAY.pint * (t.need || 1); },
  update(T, t) {
    handOver(T, t, current ? current.s.pints : 0, (n) => { current.s.pints -= n; }, (n, done, more) => `You hand over ${word(n)} ${plural(n, 'pint')} of blueberries. ${done ? 'Claim it at the counter.' : `${cap(word(more))} more wanted.`}`);
  },
  progress(t) { const n = t.need || 1, g = t.got || 0, tin = current ? Math.min(current.s.pints, n - g) : 0; return g ? `${word(g)} of ${word(n)} ${plural(n, 'pint')} handed over${tin ? `, ${word(tin)} in the tin` : ''}` : tin ? `${word(tin)} of ${word(n)} in the tin` : `${word(n)} ${plural(n, 'pint')} to pick, in season`; },
});
registerKind('firewood', {
  label: 'Wood for the stove', weight: { local: 0.8, medium: 0.25, far: 0 },
  make(T, c) {
    if (c.board.some((t) => t && t.kind === 'firewood')) return null;
    const W = pickR(c.rng, WOOD_WORDS);
    return { need: W.need, got: 0, title: W.title, text: W.text, sign: W.sign };
  },
  pay(t) { return PAY.armful * (t.need || 1); },
  update(T, t) {
    handOver(T, t, current ? current.s.arms : 0, (n) => { current.s.arms -= n; }, (n, done, more) => `You stack ${word(n)} ${plural(n, 'armful')} of wood by the door. ${done ? 'Claim it at the counter.' : `${cap(word(more))} more wanted.`}`);
  },
  progress(t) { const n = t.need || 1, g = t.got || 0; return g ? `${word(g)} of ${word(n)} handed over` : `${word(n)} ${plural(n, 'armful')} to bring in`; },
});
