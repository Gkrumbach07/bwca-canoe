import * as THREE from 'three';
import { PropBuilder, propMaterial, TILE } from './prop-kit.js';
import { registerKind } from './tasks.js';
import { dayOfYear } from './astro.js';
import { clock12, word, plural, esc } from './hud.js';
import { mulberry32, hash2 } from './rng.js';
import { save } from './save.js';
import { GROUND } from './terrain-build.js';
import { itemDef } from './items.js';
import { inventory as INVENTORY } from './inventory.js';
import { FIRE } from './fire.js';
import { hold } from './hold.js';
import { Cook, hiss, woodKnock } from './cook.js';

// Camp chores (hubs phase 3, stream A; redone by camp 2, the owner's feedback of 2026-10-24: "picking up firewood
// should be actually walking around camp and finding loose branches and logs, putting them in your inventory", "need
// cooking and eating is not super intersting ... you make a fire so you can cook so you can eat", "the toilet actually
// you should actually sit", and "also you should be able to snuff out fire ... it doesnt do it automatically when you
// leave"). Nothing at camp happens by itself now; each thing that takes time is held (hold.js's ring):
// - Firewood is things you find. Dead branches (items.js wood:branch, 1×2) and short logs (wood:log, 1×3) lie about
//   every site (SITE_WOOD, more under the trees and by the down logs) and here and there in the woods (WOODS: more in the
//   dark spruce and the burns), placed by the ground (the same every time) and coming back REGROW days after they were
//   picked up. E at one picks it up: into an armload in a free hand (items.js woodarms, a hand's container; drawn here),
//   else into what you carry. With the folding saw in reach (player.gear.saw and the item), hold E at a down log: three
//   cuts, a short log dropped by it at each. At a ring, E with an armload stacks it on the woodpile (WOOD.pile pieces, one
//   per site, drawn by its count); the fire takes wood from the pile, the arms or anything in the camp's reach.
// - The fire (fire.js). Hold E at the ring to lay it (kindling first: at least a branch, two pieces in all) and light it.
//   At a burning fire a tap of E feeds it a piece (logs burn long), or cooks (cook.js), or eats what is in the pot; held,
//   E puts it out: water, stirred in, water again, the steam boiling up and the hiss, the coals cold. Left, it burns down
//   and smoulders until morning (fire.js FIRE.smoulder), and a branch on the hot coals brings it back.
// - Cooking and eating: cook.js (the pot on the grate, the wait, the cooked things, the bench).
// - The latrine. Hold E at the box back in the trees (props.js c.layout.latrine): you walk to it and sit (cook.js sitAt,
//   canoe.js's sit), ten quiet minutes; rest +0.05 once a day.
// - Blueberries are forage.js's (fb G); a pint a berries notice still wants goes into the tin here (s.pints).
// - Sleep with a wake time: E at the tent (or ← → there) opens the paper card (first light, 7:00, 9:00).
// And two notices for the boards (tasks.js registerKind): blueberries for the café ($10 a pint, in season) and firewood
// for the sauna ($6 an armful of three pieces), handed over on foot at the posting outfitter's store.
//
// The prompts are claimed here, in update() (camp.update calls it before its own prompts, which stand back from a keyed
// prompt), and their E is taken in before() (camp.before, ahead of player.update), so a pack set out near the ring does
// not take the fire's E. What camp.js asks of it: before(), update(dt), openWake(site, choice), offered(site), card,
// ashore() (for the leaving note); main.js (camp 2) asks move(), beforePose(), afterPose() and cook.onUse. Everything is
// saved in the trip's document (trip.state.chores), or under its own key with no trip.

export const WOOD = { reach: 1.45, regrow: 2, pile: 12, ringR: 2.4, near: 58, drop: 95, cell: 24 };
// (to: inside the camp's area, camp.js AREA_R 25 m, so walking about for wood never takes you out of the camp's reach)
const SITE_WOOD = { branches: 12, logs: 5, tries: 90, from: 4.5, to: 23 };
const WOODS = { forestDark: 1, forest: 0.75, forestLight: 0.6, burn: 1.3, meadow: 0.12, rock: 0.15, rockLichen: 0.15, rockDark: 0.2 };
const AT_LATRINE = 1.9, LATRINE_REST = 0.05, AT_PILE = 1.35, SAW_REACH = 0.95;
const TAP = 0.25;            // real seconds: E let go sooner than this at a burning fire is a tap (feed, cook, eat)
export const SEASON = { from: [6, 10], to: [7, 20] }; // [month (0-based), day]: July 10 to August 20, the blueberries
export const PAY = { pint: 10, armful: 6 };
const ARMFUL = 3;            // pieces of wood a notice's "armful" is
// the wake times on the card: first light (camp.js wakeTime: a quarter hour after sunrise, or later after a late night)
export const WAKES = ['first', 7, 9];
const LIGHT = [
  { name: 'Laid', doing: 'Laying birch bark, the kindling and the wood in the ring', minutes: 8, seconds: 1.5 },
  { name: 'Lit', doing: 'A match to the bark, blowing it into flame', minutes: 6, seconds: 1.4 },
];
const DOUSE = [
  { name: 'Drowned', doing: 'Pouring a pot of lake water on it', minutes: 3, seconds: 1.1 },
  { name: 'Stirred', doing: 'Stirring the ash in with a stick', minutes: 3, seconds: 1.0 },
  { name: 'Cold', doing: 'More water, and the back of a hand to the ash', minutes: 3, seconds: 0.9 },
];
const SAW = [1, 2, 3].map((i) => ({ name: `${['First', 'Second', 'Third'][i - 1]} length`, doing: 'Sawing through the dead spruce', minutes: 5, seconds: 1.25 }));
const LATRINE = [{ name: 'Done', doing: 'A quiet few minutes back in the trees', minutes: 10, seconds: 3.4 }];

const absDay = (year, doy) => Math.round(Date.UTC(year, 0, doy) / 86400000);
export function berrySeason(year, doy) { return doy >= dayOfYear(year, ...SEASON.from) && doy <= dayOfYear(year, ...SEASON.to); }
const pickR = (rng, list) => list[Math.floor(rng() * list.length)];
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const tone = (hex, rng, dl = 0.06, dh = 0.015) => new THREE.Color(hex).offsetHSL((rng() - 0.5) * dh, 0, (rng() - 0.5) * dl);
const keyOf = (c) => `${Math.round(c.x)}:${Math.round(c.z)}`; // camp.js campKey
const strHash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
const isWood = (id) => { const d = itemDef(id); return !!(d && d.kind === 'firewood'); };
const burnOf = (id) => { const d = itemDef(id); return d && Number.isFinite(d.burn) ? d.burn : FIRE.branch; };
const LENGTH = { branch: [1.05, 1.3, 1.5], log: [0.46, 0.52, 0.5] }; // m: each variant's length

let current = null; // the one Chores (the notices' kinds read it)

// --- the looks --------------------------------------------------------------------------------------------------------
// Shade baked by hand for the small things (no bake: they are built often): darker low down and facing down
function shadeBy(geo, f) {
  const P = geo.getAttribute('position'), N = geo.getAttribute('normal'), O = geo.getAttribute('aOcc');
  for (let i = 0; i < O.count; i++) O.setX(i, f(P.getY(i), N.getY(i)));
  O.needsUpdate = true;
  return geo;
}
// The woodpile by a fire ring, in its own frame (x along the first layer, y up from the ground): three layers of five
// split lengths crossed on the one below, birch and pine, some split to show the pale wood. Three geometries.
function woodpileGeometry() {
  const rng = mulberry32(911), out = [];
  const birch = 0xcdc6b6, pine = 0x5e4a39, inner = 0xc6a77c, end = 0xcfb894;
  let y = 0;
  for (let layer = 0; layer < 3; layer++) {
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
// A loose piece lying on the ground, in its own frame (along x, the bottom on y = 0): a dead branch (crooked, tapering,
// a stub of a twig or two, grey bark or birch) or a short log (a sawn length, the pale ends showing). Variant v (0..2).
function pieceGeometry(kind, v) {
  const rng = mulberry32(4401 + v * 97 + (kind === 'log' ? 7 : 0)), b = new PropBuilder();
  const len = LENGTH[kind][v];
  if (kind === 'branch') {
    const r = 0.022 + v * 0.006, birch = v === 1, bark = birch ? tone(0xd2cbbd, rng, 0.06) : tone(0x6b5d50, rng, 0.08), pts = [];
    for (let i = 0; i <= 5; i++) { const t = i / 5; pts.push(V(-len / 2 + len * t, r * (1 - 0.35 * t) + Math.sin(t * 5 + v) * 0.012, Math.sin(t * 3.3 + v * 2) * 0.035)); }
    b.tube(pts, (t) => r * (1 - 0.55 * t), 6, TILE.BARK, bark, { cap0: true, cap1: true });
    for (let k = 0; k < 2; k++) {
      const t = 0.3 + 0.35 * k + rng() * 0.08, base = pts[Math.round(t * 5)], side = k ? 1 : -1, l = 0.16 + rng() * 0.12;
      b.tube([base.clone(), base.clone().add(V(l * 0.6, 0.012 + rng() * 0.02, side * l * 0.8))], (q) => r * 0.42 * (1 - 0.6 * q), 4, TILE.BARK, bark, { cap1: true });
    }
    if (birch) for (let k = 0; k < 3; k++) { const t = 0.15 + k * 0.3, p0 = pts[Math.round(t * 5)]; b.cyl(V(p0.x - 0.015, p0.y, p0.z), V(p0.x + 0.015, p0.y, p0.z), r * 1.04, r * 1.04, 6, TILE.BARK, tone(0x34302b, rng, 0.05)); }
  } else {
    const r = 0.055 + v * 0.012, birch = v === 2, bark = birch ? tone(0xd8d1c3, rng, 0.05) : tone(v === 0 ? 0x5d4c3c : 0x705f4c, rng, 0.08), end = tone(0xcdb48a, rng, 0.06);
    b.cyl(V(-len / 2, r, 0), V(len / 2, r * 0.97, 0.01), r, r * 0.94, 9, TILE.BARK, bark, { cap0: true, cap1: true, capCol: end, phase: rng() * 6 });
    if (birch) for (let k = 0; k < 3; k++) { const x = -len / 2 + len * (0.2 + k * 0.28); b.cyl(V(x - 0.012, r, 0), V(x + 0.012, r, 0), r * 1.03, r * 1.03, 9, TILE.BARK, tone(0x3a342d, rng, 0.05)); }
  }
  return shadeBy(b.build(), (py, ny) => (ny < -0.35 ? 0.55 : 0.78 + 0.22 * Math.min(1, py / 0.12)));
}
// many pieces in one geometry: each variant's buffers moved by its piece's matrix (positions and normals), the rest copied
function mergePieces(list, geos) {
  let n = 0;
  for (const it of list) n += geos[it.g].getAttribute('position').count;
  const P = new Float32Array(n * 3), N = new Float32Array(n * 3), Cl = new Float32Array(n * 3), U = new Float32Array(n * 2), Tl = new Float32Array(n), O = new Float32Array(n);
  const m = new THREE.Matrix4(), nm = new THREE.Matrix3(), v = new THREE.Vector3();
  let o = 0;
  for (const it of list) {
    const g = geos[it.g], gp = g.getAttribute('position'), gn = g.getAttribute('normal'), c = g.getAttribute('color').array, uv = g.getAttribute('aPropUv').array, tl = g.getAttribute('aPropTile').array, oc = g.getAttribute('aOcc').array;
    m.compose(it.pos, it.q, it.s || _one); nm.getNormalMatrix(m);
    for (let i = 0; i < gp.count; i++) {
      v.fromBufferAttribute(gp, i).applyMatrix4(m); P[(o + i) * 3] = v.x; P[(o + i) * 3 + 1] = v.y; P[(o + i) * 3 + 2] = v.z;
      v.fromBufferAttribute(gn, i).applyMatrix3(nm).normalize(); N[(o + i) * 3] = v.x; N[(o + i) * 3 + 1] = v.y; N[(o + i) * 3 + 2] = v.z;
    }
    Cl.set(c, o * 3); U.set(uv, o * 2); Tl.set(tl, o); O.set(oc, o);
    o += gp.count;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(P, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(N, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(Cl, 3)); geo.setAttribute('aPropUv', new THREE.BufferAttribute(U, 2));
  geo.setAttribute('aPropTile', new THREE.BufferAttribute(Tl, 1)); geo.setAttribute('aOcc', new THREE.BufferAttribute(O, 1));
  geo.computeBoundingSphere();
  return geo;
}
const _one = new THREE.Vector3(1, 1, 1);
// an icon for the book: a dead branch or a short log on paper (inv-ui.js draws an item's own draw(ctx, size))
function drawPiece(kind) {
  return (c, s) => {
    c.save(); c.translate(s / 2, s / 2); c.rotate(-0.5);
    const L = s * (kind === 'log' ? 0.62 : 0.86), R = s * (kind === 'log' ? 0.13 : 0.05);
    c.fillStyle = kind === 'log' ? '#6a5643' : '#7a6c5e'; c.strokeStyle = '#2f2820'; c.lineWidth = Math.max(1, s / 40);
    c.beginPath(); c.moveTo(-L / 2, -R); c.lineTo(L / 2, -R * 0.9); c.lineTo(L / 2, R * 0.9); c.lineTo(-L / 2, R); c.closePath(); c.fill(); c.stroke();
    if (kind === 'log') { c.fillStyle = '#d2b88c'; c.beginPath(); c.ellipse(L / 2, 0, R * 0.42, R * 0.92, 0, 0, Math.PI * 2); c.fill(); c.stroke(); c.strokeStyle = '#a88a5c'; c.beginPath(); c.ellipse(L / 2, 0, R * 0.2, R * 0.45, 0, 0, Math.PI * 2); c.stroke(); }
    else { c.beginPath(); c.moveTo(-L * 0.1, -R); c.lineTo(L * 0.08, -R * 4.2); c.moveTo(L * 0.22, R); c.lineTo(L * 0.36, R * 3.6); c.stroke(); }
    c.restore();
  };
}
function drawHot(fish) {
  return (c, s) => {
    c.save(); c.translate(s / 2, s * 0.58);
    c.strokeStyle = '#2f2820'; c.lineWidth = Math.max(1, s / 36);
    if (fish) {
      c.fillStyle = '#4a4744'; c.beginPath(); c.ellipse(0, 0, s * 0.38, s * 0.14, 0, 0, Math.PI * 2); c.fill(); c.stroke();
      c.fillStyle = '#c88a3c'; c.beginPath(); c.ellipse(0, -s * 0.02, s * 0.27, s * 0.07, 0, 0, Math.PI * 2); c.fill();
    } else {
      c.fillStyle = '#3d3a37'; c.fillRect(-s * 0.26, -s * 0.14, s * 0.52, s * 0.3); c.strokeRect(-s * 0.26, -s * 0.14, s * 0.52, s * 0.3);
      c.fillStyle = '#c9a565'; c.beginPath(); c.ellipse(0, -s * 0.14, s * 0.26, s * 0.06, 0, 0, Math.PI * 2); c.fill(); c.stroke();
    }
    c.strokeStyle = 'rgba(80,80,80,.55)'; c.lineWidth = Math.max(1, s / 30);
    for (const x of [-0.12, 0.02, 0.15]) { c.beginPath(); c.moveTo(s * x, -s * 0.22); c.bezierCurveTo(s * (x + 0.07), -s * 0.3, s * (x - 0.07), -s * 0.38, s * x, -s * 0.48); c.stroke(); }
    c.restore();
  };
}
// the icons on the items (items.js defines them; a def's draw is merged in)
for (const [id, fn] of [['wood:branch', drawPiece('branch')], ['wood:log', drawPiece('log')], ['hot:supper', drawHot(false)], ['hot:breakfast', drawHot(false)], ['hot:freeze', drawHot(false)]]) { const d = itemDef(id); if (d) d.draw = fn; }
for (const id of Object.keys(itemDef('fried:fish') ? { 'fried:walleye': 1, 'fried:pike': 1, 'fried:smallmouth': 1, 'fried:laketrout': 1, 'fried:perch': 1, 'fried:crappie': 1, 'fried:fish': 1 } : {})) { const d = itemDef(id); if (d) d.draw = drawHot(true); }

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
    this.inv = INVENTORY;
    this.card = new WakeCard();
    this.s = blank();           // what is saved (serialize)
    this.stateRef = undefined;  // the trip's document the saved part was read from
    this.t = 0; this.sleepOffer = false;
    this.lit = new Set();       // the fires you lit or laid (keys): saved with their state
    this.armed = null;          // what E does, from the prompt shown last frame: () => void
    this.qArmed = null;         // and Q, at the ring with wood in your arms (the woodpile)
    this.steamT = 0; this.steamAt = null;
    this.cells = new Map();     // the woods' wood: cell key -> [pieces] | null (none); unset: not read yet
    this.sites = new Map();     // site key -> [pieces] (its wood, made once its layout is in)
    this.near = [];             // the pieces drawn now
    this.dirty = true; this.cellT = 0; this.lastCell = '';
    this.mat = propMaterial();
    this.pieceGeos = []; this.pieceIdx = {};
    for (const kind of ['branch', 'log']) for (let v = 0; v < 3; v++) { this.pieceIdx[`${kind}${v}`] = this.pieceGeos.length; this.pieceGeos.push(pieceGeometry(kind, v)); }
    this.field = new THREE.Mesh(new THREE.BufferGeometry(), this.mat);
    this.field.name = 'firewood'; this.field.castShadow = true; this.field.receiveShadow = true; this.field.matrixAutoUpdate = false; this.field.frustumCulled = false; this.field.visible = false;
    camp.scene.add(this.field);
    this.pileMesh = null;       // the woodpile drawn nearest you: { group, layers: [mesh × 3] }
    this.bundles = new Map();   // armload container id -> { mesh, sig }
    this.cook = new Cook(this);
    this.hold = hold; // the held-progress ring (hold.js), for the tests
    current = this;
  }
  get world() { return this.camp.world; }
  get player() { return this.camp.player; }
  get energy() { return this.camp.energy; }
  get fires() { return this.camp.fires; }
  get day() { return this.camp.day; }
  get today() { const d = this.day; return absDay(d.year, d.doy); }
  get now() { return this.camp.now; }
  get pints() { return this.s.pints; }
  note(t, s) { this.camp.note(t, s); }
  keyOf(site) { return keyOf(site); }
  holdActive() { return !!hold.active; }
  sound(fn, at, ...a) { const au = this.camp.audio; if (!au || !au.ctx || !au.enabled) return; try { fn(au, at, ...a); } catch { /* a nicety */ } }

  // --- what is in reach --------------------------------------------------------------------------------------------
  // the containers in the camp's reach: stream 1's inventory.campReach (anything within the site's area at your own
  // camp), else the food pool (what you carry and what is set out at camp)
  campPool() {
    const inv = this.inv;
    if (!inv || !inv.attached) return [];
    try { return (typeof inv.campReach === 'function' ? inv.campReach() : inv.foodPool()) || []; } catch { return inv.reachable(); }
  }
  // the grate's container at site `key` (items.js 'grate': on the ground at the ring, at.grate = key); made with `site`
  grate(key, site = null) {
    const inv = this.inv;
    if (!inv || !inv.attached) return null;
    let g = inv.containers.find((c) => c.item === 'grate' && c.at && c.at.grate === key);
    if (!g && site && site.layout) {
      const f = site.layout.fire;
      g = inv.addContainer('grate', 'ground', { x: f.x, z: f.z, y: f.y + 0.32, heading: 0, camp: true, grate: key }, { quiet: true });
    }
    return g || null;
  }
  dropEmptyGrate(key) {
    const inv = this.inv, i = inv.containers.findIndex((c) => c.item === 'grate' && c.at && c.at.grate === key && !c.grid.length);
    if (i >= 0) { inv.containers.splice(i, 1); inv.emit('containers'); }
  }
  // the armloads in your hands
  armloads() { const inv = this.inv; return inv && inv.attached ? inv.containers.filter((c) => c.item === 'woodarms' && c.where === 'hands') : []; }
  // an armload with room for item `id`: one you hold, or a new one in a free hand (null when both hands are full)
  armFor(id, make = true) {
    const inv = this.inv;
    for (const c of this.armloads()) if (inv.firstFit(c, id)) return c;
    if (!make || inv.freeHand() < 0) return null;
    return inv.addContainer('woodarms', 'hands', null, { quiet: true, hand: inv.freeHand() });
  }
  // the wood to hand at site `key`, a piece at a time: the woodpile's, then what is in the camp's reach (the arms first)
  woodUnits(key) {
    const out = [], pile = this.s.piles[key];
    if (pile) for (const [id, n] of Object.entries(pile)) for (let i = 0; i < n; i++) out.push({ id, pile: key });
    const pool = this.campPool().slice().sort((a, b) => (b.item === 'woodarms') - (a.item === 'woodarms'));
    for (const c of pool) for (const e of c.grid) if (!e.box && isWood(e.id)) for (let i = 0; i < e.qty; i++) out.push({ id: e.id, c, e });
    return out;
  }
  takeUnit(u) {
    if (u.pile) { const p = this.s.piles[u.pile]; if (!p || !p[u.id]) return 0; p[u.id]--; if (!p[u.id]) delete p[u.id]; if (!Object.keys(p).length) delete this.s.piles[u.pile]; return burnOf(u.id); }
    return this.inv.take(u.c.id, u.e.uid, 1) ? burnOf(u.id) : 0;
  }
  // the wood for laying a fire: kindling first (a branch or two, at least one), then a log; an old armful on its own.
  // { units, words } or null with why ('none' | 'kindling')
  layChoice(units) {
    const arm = units.find((u) => u.id === 'firewood');
    if (arm) return { units: [arm], words: 'an armful of wood' };
    const br = units.filter((u) => u.id === 'wood:branch'), lg = units.filter((u) => u.id === 'wood:log');
    if (!br.length) return lg.length ? { why: 'kindling' } : { why: 'none' };
    if (br.length + lg.length < 2) return { why: 'more', n: 1 };
    const nb = Math.min(lg.length ? 2 : 3, br.length), take = [...br.slice(0, nb), ...lg.slice(0, 1)], nl = take.length - nb;
    return { units: take, words: `${word(nb)} ${plural(nb, 'branch', 'branches')}${nl ? ' and a log' : ''}` };
  }
  // the piece to feed a fire with: on coals a branch (it catches); burning low a log if there is one; else a log, else a
  // branch, so long as there is room in the ring
  feedChoice(units, state, left) {
    if (!units.length) return null;
    const br = units.find((u) => u.id === 'wood:branch' || u.id === 'firewood'), lg = units.find((u) => u.id === 'wood:log');
    const u = state === 'coals' ? br || lg : lg || br;
    if (!u || left + burnOf(u.id) * 0.5 > FIRE.most) return null;
    return u;
  }
  woodCount(units) { const b = units.filter((u) => u.id !== 'wood:log').length, l = units.length - b; return { b, l, n: units.length }; }
  woodWords(units) { const { b, l } = this.woodCount(units); return [b ? `${word(b)} ${plural(b, 'branch', 'branches')}` : '', l ? `${word(l)} ${plural(l, 'log')}` : ''].filter(Boolean).join(' and ') || 'no wood'; }

  // --- the frame ------------------------------------------------------------------------------------------------------
  // before player.update (camp.before): E for the prompt shown last frame (taken here, so nothing after sees it); the
  // walker held while sitting or setting the pot on; ← → at the tent opens the wake card
  before() {
    const c = this.camp, inp = this.player.input;
    this.cook.before();
    const a = this.armed, q = this.qArmed;
    this.armed = null; this.qArmed = null;
    if (a && !inp.paused && !hold.active && inp.once.has('KeyE') && this.player.mode === 'walk') { inp.once.delete('KeyE'); a(); return; }
    // the armload's Q at the ring or the woodpile stacks it there (packs.js would set it down on the ground)
    if (q && !inp.paused && !hold.active && inp.once.has('KeyQ') && this.player.mode === 'walk') { inp.once.delete('KeyQ'); q(); return; }
    if (this.card.open || !this.sleepOffer) return;
    if (c.still < 0.3 || inp.paused) return;
    const r = inp.pressed('ArrowRight'), l = inp.pressed('ArrowLeft');
    if ((r || l) && this.sleepSite !== undefined) this.openWake(this.sleepSite, r ? 1 : 0);
  }
  // after the player has moved (camp.update, before its prompts): the saved part, the wood about, the fires' steam, the
  // pot, the prompts
  update(dt) {
    const c = this.camp, p = this.player;
    if (c.state !== this.stateRef) { this.stateRef = c.state; this.restore(); }
    if (!this.tripHooked && c.trip && c.trip.on) { this.tripHooked = true; for (const k of ['exit', 'evac']) c.trip.on(k, () => this.tripEnded()); }
    this.sleepOffer = false;
    this.cook.update(dt);
    this.dropEmptyArms();
    // the steam of a fire put out boils up a while after
    if (this.steamT > 0 && this.steamAt) { this.steamT -= dt; this.fires.steamAt('douse', this.steamAt, Math.min(1, this.steamT / 1.4)); }
    // the wood about: the cells round you read as you go, the drawn set rebuilt when it changes
    const on = (p.mode === 'walk' || p.mode === 'paddle' || p.mode === 'carry') && !p.teleporting;
    if (on && ((this.cellT -= dt) <= 0)) { this.cellT = 0.5; this.restoreDrops(); this.refreshWood(p.x, p.z); }
    if (this.redrawIn > 0 && (this.redrawIn -= dt) <= 0) this.dirty = true;
    if (this.dirty) this.drawWood();
    this.placePile();
    this.prompts();
  }
  // a prompt of our own may be put up here: on foot, nothing of ours busy, E not someone else's (a pack's pick-up gives
  // way when what we offer is nearer, or we are at the ring)
  free(dist = 0, atRing = false) {
    const c = this.camp, p = this.player, o = c.outfitter;
    if (p.mode !== 'walk' || p.teleporting || hold.active || this.cook.busy || c.busy || c.night || this.card.open) return false;
    if (o && o.visit && o.visit.inside) return false;
    const pr = p.prompt;
    if (!pr || pr.soft) return true;
    if (!pr.key && !/<kbd>/.test(pr.text || '')) return true;
    if (/<kbd>E<\/kbd>Pick up /.test(pr.text || '')) { const k = this.nearestThing(); return atRing ? k > 1.1 : k > dist + 0.2; }
    return false;
  }
  // metres to the nearest thing on the ground a pack's E would pick up (packs.js)
  nearestThing() {
    const inv = this.inv, p = this.player; let d = Infinity;
    if (!inv || !inv.attached) return d;
    for (const c of inv.containers) if (c.where === 'ground' && c.at && !(itemDef(c.item) || {}).fixed) d = Math.min(d, Math.hypot(c.at.x - p.x, c.at.z - p.z));
    for (const l of inv.long) if (l.where === 'ground' && l.at) d = Math.min(d, Math.hypot(l.at.x - p.x, l.at.z - p.z));
    return d;
  }
  // E with a line (its run taken next frame in before()), keeping a carried thing's Q (packs.js soft prompt)
  offer(text, run, hint = '') {
    const p = this.player, was = p.prompt, tail = was && was.soft && was.tail ? was.tail : '';
    p.prompt = { key: 'E', text: `${text}${hint ? ` · ${hint}` : ''}${tail}`, ...(tail ? { tail } : {}), own: 'chores' };
    this.armed = run;
  }
  say(text) { const p = this.player; if (!p.prompt || p.prompt.soft) p.prompt = { key: null, text, own: 'chores' }; }

  prompts() {
    const p = this.player, c = this.camp;
    if (!this.free(Infinity, true)) return;
    const site = c.nearestSite(p.x, p.z, 26, true), L = site && site.layout, key = site ? keyOf(site) : null;
    const holder = site ? c.registry.holder(key) : null, ours = !holder || holder === 'player';
    // the ring (with wood in your arms, its Q stacks the wood on the woodpile)
    if (L && ours) {
      const dr = Math.hypot(L.fire.x - p.x, L.fire.z - p.z);
      if (dr < WOOD.ringR && this.free(dr, true) && this.firePrompts(site, key)) { this.pileQ(site, key); return; }
    }
    // a piece of wood at your feet
    const piece = this.nearestPiece(p.x, p.z, WOOD.reach);
    if (piece && this.free(piece.d)) { this.piecePrompt(piece); return; }
    if (L && ours) {
      // the woodpile, the latrine
      const ps = this.pileSpot(site), dp = Math.hypot(ps.x - p.x, ps.z - p.z);
      if (dp < AT_PILE && this.free(dp) && this.pilePrompts(site, key)) return;
      if (L.latrine) { const dl = Math.hypot(L.latrine.x - p.x, L.latrine.z - p.z); if (dl < AT_LATRINE && this.free(dl)) { this.latrinePrompt(site); return; } }
    }
    // a down log, with the saw
    this.sawPrompt();
  }

  // --- the fire ------------------------------------------------------------------------------------------------------
  // the ring at a site that is yours or free: lay and light it (held), feed it, cook, eat (a tap), put it out (held)
  firePrompts(site, key) {
    const F = this.fires, st = F.state(key), units = this.woodUnits(key), cook = this.cook;
    if (!F) return false;
    if (st === 'none' || st === 'laid') {
      const t = cook.tapAction(site, key); // a meal left in the pot from before
      if (t && t.run && /^Eat/.test(t.label)) { this.offer(t.label, t.run, t.hint); return true; }
      if (st === 'laid') { this.offer('Light the fire · hold', () => this.beginLight(site, key, null), `the wood is laid${units.length ? ` · ${this.woodWords(units)} more to hand` : ''}`); return true; }
      const lay = this.layChoice(units);
      if (lay.units) { this.offer('Light the fire · hold', () => this.beginLight(site, key, lay), lay.words); return true; }
      this.say(lay.why === 'kindling' ? 'The fire ring · logs will not light on their own: a dead branch or two for kindling first' : lay.why === 'more' ? 'The fire ring · one branch is not a fire: another piece of wood first' : 'The fire ring · no wood to hand: dead branches and logs lie about the site');
      return true;
    }
    const left = F.left(key), feed = this.feedChoice(units, st, left);
    const feedAct = feed ? { label: st === 'coals' ? `Build it up again · a ${feed.id === 'wood:log' ? 'log' : 'branch'} on the coals` : `Add a ${feed.id === 'wood:log' ? 'log' : 'branch'}`, hint: st === 'coals' ? 'they are still hot' : `${left < FIRE.low ? 'it is burning down' : `about ${hoursWords(left)} of wood in it`}${units.length > 1 ? ` · ${this.woodWords(units.filter((u) => u !== feed))} more` : ''}`, run: () => this.feed(site, key, feed) } : null;
    // a tap: eat what is in the pot; feed a fire burning low; cook (only on a fire that burns); feed it; put the pot away
    const t = cook.tapAction(site, key, st === 'burning'), say = t && t.say ? t.say : '';
    let tap = null;
    if (t && t.run && /^Eat/.test(t.label)) tap = t;
    else if (feedAct && (left < FIRE.low * 0.8 || say)) tap = feedAct;
    else if (t && t.run) tap = t;
    else tap = feedAct;
    const out = st === 'coals' ? 'the coals are still smoking' : 'water on it, stirred in';
    if (tap) this.offer(tap.label, () => this.beginDouse(site, key, tap), `${say && tap === feedAct ? `${say.replace(/^.* · /, '')} · ` : tap.hint ? `${tap.hint} · ` : ''}<kbd>hold E</kbd>put it out`);
    else if (say) this.offer(say.replace(' · ', ' · <kbd>hold E</kbd>put it out · '), () => this.beginDouse(site, key, null));
    else this.offer('Put the fire out · hold', () => this.beginDouse(site, key, null), out);
    return true;
  }
  ringAt(site) { const f = site.layout.fire; return { x: f.x, y: f.y, z: f.z, a: f.a || 0 }; }
  // hold E: lay the fire (the wood out of your arms, the pile, the packs), then light it
  beginLight(site, key, lay) {
    const F = this.fires, p = this.player, at = this.ringAt(site), start = F.state(key) === 'laid' ? 1 : 0;
    hold.begin({
      id: 'fire-light', label: 'The fire', phases: LIGHT, at: start, crouch: true, near: { x: p.x, z: p.z, r: 2.5 },
      onPhase: (i) => {
        if (i === 0) {
          const units = lay ? lay.units : this.layChoice(this.woodUnits(key)).units;
          if (!units) { hold.cancel(); return; }
          let h = 0; for (const u of units) h += this.takeUnit(u);
          F.lay(key, at, h); this.lit.add(key);
          this.sound(woodKnock, { x: at.x, y: at.y + 0.2, z: at.z }, true);
          this.inv.emit('items'); this.persist();
        } else {
          F.kindle(key, at, this.now - 0.045, 0); this.lit.add(key); // (blown on through the phase: it has caught)
          this.note(`The bark catches and the kindling with it. The fire is going: about ${hoursWords(F.left(key))} of wood in it.`, 5);
          this.persist();
        }
      },
      onStop: (job) => { if (job.done === 1 && F.state(key) === 'laid') this.note('The fire is laid. Hold E to light it.', 3.5); },
    });
  }
  // a tap: a piece on the fire (or on the hot coals, which bring it back)
  feed(site, key, u) {
    const F = this.fires, st = F.state(key), h = this.takeUnit(u), at = this.ringAt(site);
    if (!h) return;
    F.feed(key, this.now, h); this.lit.add(key);
    this.cook.gesture = { t: 0, dur: 0.55, say: st === 'coals' ? 'Blowing the coals back to life…' : 'Laying it on…' };
    this.sound(woodKnock, { x: at.x, y: at.y + 0.25, z: at.z }, u.id === 'wood:log');
    this.inv.emit('items'); this.persist();
    if (st === 'coals') this.note('A branch on the hot coals, a breath or two, and it catches again.', 4);
  }
  // E at a burning fire: a tap does `tap` (feed, cook, eat); held, it is put out, a phase at a time (the steam and
  // the hiss, the flames gone after the first, cold after the last); let go, it stays as far as it got
  beginDouse(site, key, tap) {
    const F = this.fires, p = this.player, f = F.get(key), at = this.ringAt(site);
    if (!f) return;
    const start = Math.min(2, Math.floor((f.out || 0) * 3 + 1e-6)), pos = { x: at.x, y: at.y + 0.3, z: at.z };
    let fx = false;
    hold.begin({
      id: 'fire-out', label: 'Putting the fire out', phases: DOUSE, at: start, crouch: true, near: { x: p.x, z: p.z, r: 2.5 },
      onTick: (a, job) => {
        if (job.t < TAP) return;
        if (!fx) { fx = true; this.sound(hiss, pos, 1); }
        F.douseK(key, a / DOUSE.length);
        this.steamAt = { x: at.x, y: at.y + 0.05, z: at.z }; this.steamT = Math.max(this.steamT, 1.4);
      },
      onPhase: (i) => {
        if (i === 0) { const g = F.get(key); if (g && g.until > this.now) g.until = this.now; this.sound(hiss, pos, 1.2); } // drowned: no wood burning
        if (i === 1) this.sound(hiss, pos, 0.7);
      },
      onDone: () => {
        F.douse(key); this.lit.delete(key); this.steamT = 2.6;
        this.note('The fire is out: drowned, stirred and drowned again, the ash cold to the back of a hand.', 5);
        this.persist();
      },
      onStop: (job) => {
        if (job.t < TAP && job.at < start + 0.3) { F.douseK(key, start / DOUSE.length); if (tap && tap.run) tap.run(); return; }
        F.douseK(key, job.done / DOUSE.length);
        if (job.done > 0 && job.done < DOUSE.length) this.note(job.done === 1 ? 'The flames are out, but the coals are still hot under the ash. Hold E to finish it.' : 'Nearly out: the ash is still warm. Hold E to finish it.', 4);
        this.persist();
      },
    });
  }

  // --- the latrine ---------------------------------------------------------------------------------------------------
  latrinePrompt(site) {
    const used = this.s.latrine === this.today;
    this.offer('Use the latrine · hold', () => this.beginLatrine(site), used ? 'the box back in the trees' : 'the box back in the trees, a quiet few minutes');
  }
  beginLatrine(site) {
    const spot = this.cook.latrineSpot(site), p = this.player;
    this.cook.sitAt(spot);
    this.cook.seat.quiet = true;
    hold.begin({
      id: 'latrine', label: 'The latrine', phases: LATRINE, near: { x: p.x, z: p.z, r: 3.5 },
      onDone: () => {
        const e = this.energy, first = this.s.latrine !== this.today;
        this.s.latrine = this.today;
        if (first && e && e.live && e.needs) {
          // the rest need is the night's rest under a ceiling that falls with the hours awake (energy.js restCeiling: a
          // thirtieth an hour), so the box gives back what an hour and a half less awake would, and the night's share too
          const want = Math.min(1, e.needs.rest + LATRINE_REST);
          if (Number.isFinite(e.awakeSince)) e.awakeSince = Math.min(e.now, e.awakeSince + LATRINE_REST * 30);
          e.needs.rest = want;
        }
        this.note(first ? 'Ten quiet minutes on the box back in the trees, a red squirrel scolding. A little more rested.' : 'Ten quiet minutes on the box back in the trees.', 5);
        this.cook.standUp();
        this.persist();
      },
      onStop: () => this.cook.standUp(),
    });
  }

  // --- the wood about ----------------------------------------------------------------------------------------------
  // A piece at (x, z) of `kind` with variant from rng, lying on the ground: clear of trunks, rocks, logs and anything
  // built, off the water, the ring, the pad, the bench, the latrine and the woodpile, on ground it lies flat on (its ends'
  // ground no more than a third of its length apart). The piece, or null.
  // (loose: where it falls, the checks but the ground's let go: a length dropped by your feet)
  pieceAt(key, kind, x, z, rng, site = null, loose = false) {
    const w = this.world, t = this.camp.tiles;
    if (!w.isReady(x, z) || !(w.shoreAt(x, z) > (loose ? 0.3 : 2))) return null;
    const v = Math.floor(rng() * 3), len = LENGTH[kind][v], yaw = rng() * Math.PI * 2, cx = Math.cos(yaw), sz = -Math.sin(yaw);
    const x0 = x - cx * len / 2, z0 = z - sz * len / 2, x1 = x + cx * len / 2, z1 = z + sz * len / 2;
    const g0 = t.groundAt(x0, z0), g1 = t.groundAt(x1, z1), g = t.groundAt(x, z);
    if (![g0, g1, g].every(Number.isFinite)) return null;
    if (loose) { const y = (g0 + g1) / 2 - 0.012, q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, Math.atan2(g1 - g0, len), 'YXZ')); return { key, kind, v, x, y, z, len, yaw, pos: new THREE.Vector3(x, y, z), q, g: this.pieceIdx[`${kind}${v}`] }; }
    if (Math.abs(g1 - g0) > len * 0.34 || Math.abs((g0 + g1) / 2 - g) > 0.08) return null;
    const L = site && site.layout;
    if (L) for (const [q, r] of [[L.fire, 3.2], [L.pad, 3.4], [L.bench, 2.2], [L.latrine, 2.2]]) if (q && Math.hypot(q.x - x, q.z - z) < r) return null;
    if (site && Math.hypot(this.pileSpot(site).x - x, this.pileSpot(site).z - z) < 1.6) return null;
    for (const o of t.treesNear(x, z, len / 2 + 0.3)) {
      if (o.shape) { for (const [px, pz] of [[x, z], [x0, z0], [x1, z1]]) if (o.shape.heightAt(px, pz) > Math.min(g0, g1) + 0.02) return null; continue; }
      if (o.box) { const dx = x - o.x, dz = z - o.z; if (Math.abs(dx * o.ux + dz * o.uz) < o.hx + 0.35 && Math.abs(-dx * o.uz + dz * o.ux) < o.hz + 0.35) return null; continue; }
      // a trunk: off the piece's line by its radius and a little
      const ux = cx, uz = sz, px = o.x - x0, pz = o.z - z0, along = Math.max(0, Math.min(len, px * ux + pz * uz));
      if (Math.hypot(o.x - (x0 + ux * along), o.z - (z0 + uz * along)) < (o.r || 0.3) + 0.12) return null;
    }
    const y = (g0 + g1) / 2 - 0.012, pitch = Math.atan2(g1 - g0, len);
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, pitch, 'YXZ'));
    return { key, kind, v, x, y, z, len, yaw, pos: new THREE.Vector3(x, y, z), q, g: this.pieceIdx[`${kind}${v}`] };
  }
  // a site's wood: SITE_WOOD.branches dead branches and SITE_WOOD.logs short logs about it, most under the trees and by
  // the down logs (the same every time: the site's key seeds it)
  siteWood(site) {
    const key = keyOf(site);
    let list = this.sites.get(key);
    if (list) return list;
    const L = site.layout; if (!L) return null;
    const f = L.fire, t = this.camp.tiles, rng = mulberry32(strHash(key) ^ 0x5eed);
    const near = t.treesNear(f.x, f.z, SITE_WOOD.to);
    const trunks = near.filter((o) => !o.shape && !o.box && (o.r || 0) > 0.07 && Math.hypot(o.x - f.x, o.z - f.z) > SITE_WOOD.from);
    const logs = near.filter((o) => o.log);
    list = [];
    let nb = 0, nl = 0;
    for (let i = 0; i < SITE_WOOD.tries && (nb < SITE_WOOD.branches || nl < SITE_WOOD.logs); i++) {
      const kind = nb >= SITE_WOOD.branches ? 'log' : nl >= SITE_WOOD.logs ? 'branch' : rng() < 0.32 ? 'log' : 'branch', r = rng();
      let x, z;
      if (logs.length && r < 0.25) {
        const g = logs[Math.floor(rng() * logs.length)], u = 0.15 + rng() * 0.7, lx = g.ax + (g.bx - g.ax) * u, lz = g.az + (g.bz - g.az) * u;
        const dl = Math.hypot(g.bx - g.ax, g.bz - g.az) || 1, nx = -(g.bz - g.az) / dl, nz = (g.bx - g.ax) / dl, side = rng() < 0.5 ? -1 : 1, off = (g.rad || 0.2) + 0.45 + rng() * 0.7;
        x = lx + nx * side * off; z = lz + nz * side * off;
      } else if (trunks.length && r < 0.86) {
        const g = trunks[Math.floor(rng() * trunks.length)], a = rng() * Math.PI * 2, d = (g.r || 0.2) + 0.6 + rng() * 1.9;
        x = g.x + Math.cos(a) * d; z = g.z + Math.sin(a) * d;
      } else { const a = rng() * Math.PI * 2, d = SITE_WOOD.from + 2 + rng() * (SITE_WOOD.to - SITE_WOOD.from - 4); x = f.x + Math.cos(a) * d; z = f.z + Math.sin(a) * d; }
      const dd = Math.hypot(x - f.x, z - f.z);
      if (dd < SITE_WOOD.from || dd > SITE_WOOD.to) continue;
      const p = this.pieceAt(`s:${key}:${i}`, kind, x, z, rng, site);
      if (!p) continue;
      list.push(p); if (kind === 'log') nl++; else nb++;
    }
    this.sites.set(key, list);
    return list;
  }
  // a cell of the woods away from any site: nothing in the open, a branch or two under the trees, more in the dark spruce
  // and the old burns (undefined while its ground is not in)
  cellWood(ci, cj) {
    const w = this.world, C = WOOD.cell, cx = (ci + 0.5) * C, cz = (cj + 0.5) * C;
    const cv = w.coverCell(w.cellI(cx), w.cellJ(cz));
    if (!cv || !w.isReady(cx, cz)) return undefined;
    if (this.camp.nearestSite(cx, cz, SITE_WOOD.to + 14, false)) return null; // a site's own wood covers it
    const cls = GROUND[(cv >> 16) & 255], wgt = WOODS[cls] || 0, h = (k) => hash2(ci * 7 + k, cj * 13 - k, 911 + k);
    const n = Math.floor(wgt * 1.6 + h(1) * 1.2 - 0.25);
    if (n <= 0) return null;
    const trunks = this.camp.tiles.treesNear(cx, cz, C * 0.6).filter((o) => !o.shape && !o.box && (o.r || 0) > 0.07);
    const rng = mulberry32(Math.floor(h(2) * 4294967295)), out = [];
    for (let k = 0; k < n * 3 && out.length < n; k++) {
      const kind = rng() < 0.25 ? 'log' : 'branch';
      let x, z;
      if (trunks.length && rng() < 0.85) { const g = trunks[Math.floor(rng() * trunks.length)], a = rng() * Math.PI * 2, d = (g.r || 0.2) + 0.6 + rng() * 1.8; x = g.x + Math.cos(a) * d; z = g.z + Math.sin(a) * d; }
      else { x = cx + (rng() - 0.5) * C * 0.9; z = cz + (rng() - 0.5) * C * 0.9; }
      const p = this.pieceAt(`w:${ci}:${cj}:${k}`, kind, x, z, rng);
      if (p) out.push(p);
    }
    return out.length ? out : null;
  }
  // the pieces round (x, z): the sites' and the woods' (cells read a few a time), and what the saw dropped
  refreshWood(x, z) {
    const C = WOOD.cell, ci0 = Math.floor(x / C), cj0 = Math.floor(z / C), R = Math.ceil(WOOD.near / C);
    let read = 0;
    for (let dj = -R; dj <= R && read < 6; dj++) for (let di = -R; di <= R && read < 6; di++) {
      const ci = ci0 + di, cj = cj0 + dj, k = `${ci},${cj}`;
      if (this.cells.get(k) !== undefined) continue;
      if (Math.hypot((ci + 0.5) * C - x, (cj + 0.5) * C - z) > WOOD.near + C) continue;
      const r = this.cellWood(ci, cj);
      read++;
      if (r !== undefined) { this.cells.set(k, r); if (r) this.dirty = true; }
    }
    for (const [k, v] of this.cells) { const [ci, cj] = k.split(',').map(Number); if (Math.hypot((ci + 0.5) * C - x, (cj + 0.5) * C - z) > WOOD.drop) { this.cells.delete(k); if (v) this.dirty = true; } }
    for (const c of this.world.campsites) {
      if (Math.abs(c.x - x) > 120 || Math.abs(c.z - z) > 120 || !c.layout) continue;
      if (!this.sites.has(keyOf(c))) { this.siteWood(c); this.dirty = true; }
    }
    const sig = `${ci0},${cj0}|${this.today}`;
    if (sig !== this.lastCell) { this.lastCell = sig; this.dirty = true; }
  }
  available(pc) { const t = this.s.taken[pc.key]; return t == null || this.today - t >= WOOD.regrow; }
  // every piece about, available or not
  *allPieces() {
    for (const list of this.sites.values()) yield* list;
    for (const list of this.cells.values()) if (list) yield* list;
    for (const d of this.dropped) yield d;
  }
  nearestPiece(x, z, r) {
    let best = null, bd = r;
    for (const pc of this.near) {
      const d = Math.hypot(pc.x - x, pc.z - z) - Math.min(0.35, pc.len * 0.3);
      if (d < bd) { bd = d; best = pc; }
    }
    return best ? { ...best, d: Math.max(0, bd), ref: best } : null;
  }
  // the pieces near you, in one geometry (rebuilt when what is there changes)
  drawWood() {
    this.dirty = false;
    const p = this.player, tent = this.camp.camp, list = [];
    for (const pc of this.allPieces()) {
      if (Math.abs(pc.x - p.x) > WOOD.near || Math.abs(pc.z - p.z) > WOOD.near) continue;
      if (!this.available(pc)) continue;
      if (tent && Math.hypot(tent.x - pc.x, tent.z - pc.z) < 2.3) continue; // under your tent
      list.push(pc);
    }
    this.near = list;
    const old = this.field.geometry;
    this.field.geometry = list.length ? mergePieces(list, this.pieceGeos) : new THREE.BufferGeometry();
    old.dispose();
    this.field.visible = list.length > 0;
  }
  get dropped() { return this._dropped || (this._dropped = []); }
  // E at a piece: into an armload (a free hand), else into what you carry
  piecePrompt(pc) {
    const id = pc.kind === 'log' ? 'wood:log' : 'wood:branch', name = pc.kind === 'log' ? 'short log' : 'dead branch', inv = this.inv;
    if (!inv || !inv.attached) return;
    const arm = this.armFor(id, false), n = this.armloads().reduce((s, c) => s + c.grid.reduce((k, e) => k + e.qty, 0), 0);
    const where = arm ? `into your arms · ${word(n)} there` : inv.freeHand() >= 0 ? 'into your arms' : 'into your pack';
    this.offer(`Pick up the ${name}`, () => this.pickUp(pc.ref), where);
  }
  pickUp(pc) {
    const inv = this.inv, id = pc.kind === 'log' ? 'wood:log' : 'wood:branch', name = pc.kind === 'log' ? 'short log' : 'dead branch';
    const arm = this.armFor(id, true);
    let ok = !!(arm && inv.put(arm, id, { quiet: true })), where = 'your arms';
    if (!ok) {
      const pool = inv.reachable().filter((c) => c.item !== 'grate' && c.item !== 'pockets' && c.item !== 'crate');
      const r = inv.place(id, 1, { pool, quiet: true });
      ok = r.ok;
      const c = r.cId && inv.cont(r.cId);
      if (c) where = `the ${lowerName(c)}`;
    }
    if (!ok) { this.note('Your hands are full, and nothing you carry has room for it.', 3.5); return; }
    if (pc.key.startsWith('d:')) { const i = this.dropped.indexOf(pc); if (i >= 0) this.dropped.splice(i, 1); } else this.s.taken[pc.key] = this.today;
    this.redrawIn = 0.28; // it leaves the ground as the hand gets to it
    this.cook.gesture = { t: 0, dur: 0.5, say: `Picking up the ${name}…` };
    this.sound(woodKnock, { x: pc.x, y: pc.y + 0.1, z: pc.z }, pc.kind === 'log');
    const n = this.armloads().reduce((s, c) => s + c.grid.reduce((k, e) => k + e.qty, 0), 0);
    this.note(where === 'your arms' ? `A ${name}, into the crook of your arm: ${word(n)} ${plural(n, 'piece')} of wood.` : `A ${name}, into ${where}.`, 2.5);
    inv.emit('items');
    this.persist();
  }
  // an armload with nothing in it is no thing at all
  dropEmptyArms() {
    const inv = this.inv;
    if (!inv || !inv.attached) return;
    for (let i = inv.containers.length - 1; i >= 0; i--) { const c = inv.containers[i]; if (c.item === 'woodarms' && !c.grid.length && c.where !== 'stash') { inv.containers.splice(i, 1); inv.emit('containers'); } }
  }

  // --- the saw -----------------------------------------------------------------------------------------------------------
  hasSaw() {
    const p = this.player, inv = this.inv;
    if (!(p.gear && p.gear.saw) && !(inv && inv.attached)) return false;
    if (!inv || !inv.attached) return !!(p.gear && p.gear.saw);
    return this.campPool().some((c) => c.grid.some((e) => e.id === 'saw')) || inv.count('saw') > 0;
  }
  sawPrompt() {
    const p = this.player;
    if (!this.free(SAW_REACH) || !this.hasSaw()) return;
    const log = this.camp.tiles.treesNear(p.x, p.z, 2.4).filter((o) => o.log).map((o) => ({ o, d: capsule(p.x, p.z, o) - (o.rad || 0.2) })).sort((a, b) => a.d - b.d)[0];
    if (!log || log.d > SAW_REACH) return;
    const k = `${Math.round(log.o.x)}:${Math.round(log.o.z)}`, s = this.s.sawn[k], cuts = s && this.today - s.day < WOOD.regrow ? s.cuts : 0;
    if (cuts >= SAW.length) { this.say('A down spruce · sawn into lengths already'); return; }
    this.offer('Saw the down log into lengths · hold', () => this.beginSaw(log.o, k, cuts), `${word(SAW.length - cuts)} short ${plural(SAW.length - cuts, 'log')} with the folding saw`);
  }
  beginSaw(log, k, cuts) {
    const p = this.player;
    hold.begin({
      id: 'saw', label: 'The folding saw', phases: SAW, at: cuts, crouch: true, near: { x: p.x, z: p.z, r: 2.5 },
      onPhase: (i) => {
        this.s.sawn[k] = { day: this.today, cuts: i + 1 };
        // the length drops beside the log, on your side of it
        const u = 0.25 + 0.25 * i, lx = log.ax + (log.bx - log.ax) * u, lz = log.az + (log.bz - log.az) * u;
        const dl = Math.hypot(log.bx - log.ax, log.bz - log.az) || 1; let nx = -(log.bz - log.az) / dl, nz = (log.bx - log.ax) / dl;
        if ((p.x - lx) * nx + (p.z - lz) * nz < 0) { nx = -nx; nz = -nz; }
        const rng = mulberry32(strHash(k) + i * 31 + this.today);
        let pc = null;
        for (let t = 0; t < 6 && !pc; t++) pc = this.pieceAt(`d:${k}:${this.today}:${i}`, 'log', lx + nx * ((log.rad || 0.2) + 0.4 + t * 0.2), lz + nz * ((log.rad || 0.2) + 0.4 + t * 0.2), rng);
        if (!pc) pc = this.pieceAt(`d:${k}:${this.today}:${i}`, 'log', p.x + (lx - p.x) * 0.35 + (i - 1) * 0.3 * -nz, p.z + (lz - p.z) * 0.35 + (i - 1) * 0.3 * nx, rng, null, true); // by your feet
        if (pc) { this.dropped.push(pc); this.dirty = true; this.sound(woodKnock, { x: pc.x, y: pc.y + 0.1, z: pc.z }, true); }
        this.persist();
      },
      onDone: () => this.note('Three short lengths of dry spruce lie by the log.', 4),
    });
  }

  // --- the woodpile -----------------------------------------------------------------------------------------------------
  pileCount(key) { const p = this.s.piles[key]; return p ? Object.values(p).reduce((s, n) => s + n, 0) : 0; }
  pilePrompts(site, key) {
    const inv = this.inv, carried = this.armloads().reduce((s, c) => s + c.grid.filter((e) => isWood(e.id)).reduce((k, e) => k + e.qty, 0), 0), n = this.pileCount(key);
    if (carried && n < WOOD.pile) { this.offer('Stack your wood on the woodpile', () => this.stack(site, key), `${word(carried)} ${plural(carried, 'piece')} · ${n ? `${word(n)} there` : 'by the ring'}`); return true; }
    if (n && inv && inv.attached) {
      const p = this.s.piles[key], id = p['wood:log'] ? 'wood:log' : Object.keys(p)[0];
      if (!this.armFor(id, false) && inv.freeHand() < 0) { this.say(`The woodpile · ${word(n)} ${plural(n, 'piece')} · your hands are full`); return true; }
      this.offer(`Take a ${id === 'wood:log' ? 'log' : 'branch'} from the woodpile`, () => this.unstack(key, id), `${word(n)} stacked`);
      return true;
    }
    return false;
  }
  // at the ring, with wood in your arms and room on the pile: the carried thing's Q (packs.js "Set down the armload")
  // stacks it on the woodpile instead, since E there is the fire's
  pileQ(site, key) {
    const p = this.player, pr = p.prompt, n = this.pileCount(key);
    if (!pr || !pr.tail || n >= WOOD.pile || !/armload/.test(pr.tail)) return;
    if (!this.armloads().some((c) => c.grid.some((e) => isWood(e.id)))) return;
    const tail = ` &nbsp; <kbd>Q</kbd>Stack it on the woodpile${n ? ` · ${word(n)} there` : ''}`;
    p.prompt = { ...pr, text: pr.text.replace(pr.tail, tail), tail };
    this.qArmed = () => this.stack(site, key);
  }
  stack(site, key) {
    const inv = this.inv, pile = this.s.piles[key] || (this.s.piles[key] = {});
    let moved = 0;
    for (const c of this.armloads()) for (const e of [...c.grid]) {
      if (!isWood(e.id)) continue;
      const room = WOOD.pile - this.pileCount(key), n = Math.min(room, e.qty);
      if (n <= 0) break;
      inv.take(c.id, e.uid, n); pile[e.id] = (pile[e.id] || 0) + n; moved += n;
    }
    if (!Object.keys(pile).length) delete this.s.piles[key];
    if (!moved) return;
    const ps = this.pileSpot(site);
    this.cook.gesture = { t: 0, dur: 0.6, say: 'Stacking the wood…' };
    this.sound(woodKnock, { x: ps.x, y: ps.y + 0.1, z: ps.z }, true);
    this.note(`You stack the wood by the ring: ${word(this.pileCount(key))} ${plural(this.pileCount(key), 'piece')} on the pile.`, 3.5);
    inv.emit('items'); this.persist();
  }
  unstack(key, id) {
    const inv = this.inv, arm = this.armFor(id, true);
    if (!arm || !inv.put(arm, id, { quiet: true })) { this.note('Your hands are full.', 2.5); return; }
    this.takeUnit({ id, pile: key });
    this.cook.gesture = { t: 0, dur: 0.45, say: 'Taking wood off the pile…' };
    inv.emit('items'); this.persist();
  }
  // where a site's stack goes: a step and a half from the ring on its back side (away from the water), clear of the
  // bench, the pad and any trunk, on ground that is near level; { x, z, a, y } (a: the first layer's bearing)
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
  // the woodpile nearest you drawn (a layer for every few pieces), or hidden
  placePile() {
    const p = this.player;
    let site = null, n = 0, bd = 150;
    for (const key of Object.keys(this.s.piles)) {
      const s = this.camp.registry.site(key);
      if (!s || !s.layout) continue;
      const d = Math.hypot(s.layout.fire.x - p.x, s.layout.fire.z - p.z);
      if (d < bd) { bd = d; site = s; n = this.pileCount(key); }
    }
    if (!site || !n) { if (this.pileMesh) this.pileMesh.group.visible = false; return; }
    if (!this.pileMesh) {
      const group = new THREE.Group();
      group.name = 'woodpile';
      const layers = woodpileGeometry().map((g) => { const m = new THREE.Mesh(g, this.mat); m.castShadow = true; m.receiveShadow = true; m.matrixAutoUpdate = false; group.add(m); return m; });
      group.matrixAutoUpdate = false;
      this.camp.scene.add(group);
      this.pileMesh = { group, layers };
    }
    const s = this.pileSpot(site), m = this.pileMesh, key = keyOf(site), layers = Math.min(3, Math.ceil(n / 4));
    if (m.key !== key || m.n !== layers) {
      m.key = key; m.n = layers;
      const t = this.camp.tiles, gy = Math.min(t.groundAt(s.x, s.z), s.y + 0.06) - 0.015;
      m.group.position.set(s.x, gy, s.z); m.group.rotation.set(0, -s.a, 0);
      m.group.updateMatrix(); m.group.updateMatrixWorld(true);
      m.layers.forEach((l, i) => { l.visible = i < layers; });
    }
    m.group.visible = true;
  }

  // --- the figure (main.js camp 2) --------------------------------------------------------------------------------------
  move() { return this.cook.move(); }
  beforePose() { this.cook.beforePose(); }
  // after the pose: the armloads in the hands (and set down on the ground), the spoon and the pot
  afterPose() {
    this.cook.afterPose();
    const inv = this.inv, p = this.player, cn = p.canoe, seen = new Set(), S = this.cook.seat, sat = !!(S && S.phase !== 'walk');
    if (inv && inv.attached && cn && cn.figure) {
      for (const c of inv.containers) {
        if (c.item !== 'woodarms' || !c.grid.length || !(c.where === 'hands' || (c.where === 'ground' && c.at))) continue;
        seen.add(c.id);
        const b = this.bundleFor(c), m = b.mesh;
        if (c.where === 'hands') {
          if (p.mode === 'carry') { m.visible = false; continue; }
          if (sat) { // set down beside the bench, or the box, while you sit
            const fx = Math.cos(S.heading), fz = -Math.sin(S.heading), side = c.hand === 1 ? -1 : 1, x = S.seat.x - fz * side * 0.75, z = S.seat.z + fx * side * 0.75;
            m.position.set(x, p.groundAt(x, z) + 0.06, z); m.rotation.set(0, S.heading + 0.3, 0); m.visible = true;
            continue;
          }
          // carried at the hip under the arm, along the way you face, the far end a little down
          const hand = cn.figure.bones[c.hand === 1 ? 'handL' : 'handR'], v = _v1;
          hand.getWorldPosition(v);
          const fx = Math.cos(p.heading), fz = -Math.sin(p.heading), side = c.hand === 1 ? -1 : 1;
          m.position.set(v.x + fx * 0.08 - fz * side * 0.06, v.y + 0.07, v.z + fz * 0.08 + fx * side * 0.06);
          m.rotation.set(0, p.heading + side * 0.12, -0.16);
        } else { m.position.set(c.at.x, (Number.isFinite(c.at.y) ? c.at.y : p.groundAt(c.at.x, c.at.z)) - 0.01, c.at.z); m.rotation.set(0, c.at.heading || 0, 0); }
        m.visible = true;
      }
    }
    for (const [k, b] of this.bundles) if (!seen.has(k)) { b.mesh.visible = false; if (!inv.cont(k)) { this.camp.scene.remove(b.mesh); b.mesh.geometry.dispose(); this.bundles.delete(k); } }
  }
  // an armload's look: its pieces side by side along the arm, the logs under the branches (rebuilt when it changes)
  bundleFor(c) {
    let b = this.bundles.get(c.id);
    const ids = c.grid.flatMap((e) => Array(e.qty).fill(e.id)).sort(), sig = ids.join(',');
    if (b && b.sig === sig) return b;
    const list = [];
    let logs = 0, brs = 0;
    for (const id of ids) {
      const log = id === 'wood:log', i = log ? logs++ : brs++, v = (i + (log ? 1 : 2)) % 3;
      const z = log ? (i - 0.5) * 0.13 : (i - 1) * 0.06, y = log ? 0 : 0.11 + (i % 2) * 0.03;
      list.push({ g: this.pieceIdx[`${log ? 'log' : 'branch'}${v}`], pos: new THREE.Vector3(log ? 0 : 0.05, y - 0.08, z), q: new THREE.Quaternion().setFromEuler(new THREE.Euler(0, (i % 2 ? 0.08 : -0.06), 0)), s: log ? _one : new THREE.Vector3(0.6, 1, 1) });
    }
    const geo = mergePieces(list, this.pieceGeos);
    if (!b) { const mesh = new THREE.Mesh(geo, this.mat); mesh.castShadow = true; mesh.name = 'armload'; this.camp.scene.add(mesh); b = { mesh, sig }; this.bundles.set(c.id, b); }
    else { b.mesh.geometry.dispose(); b.mesh.geometry = geo; b.sig = sig; }
    return b;
  }

  // --- leaving, and a trip's end ----------------------------------------------------------------------------------------
  // what is still burning ashore near you, for the leaving note (camp.js): phrases
  ashore() {
    const F = this.fires, p = this.player, out = [];
    let burning = false, coals = false;
    for (const key of this.lit) {
      const f = F.get(key); if (!f || Math.hypot(f.at.x - p.x, f.at.z - p.z) > 400) continue;
      const st = F.state(key);
      if (st === 'burning') burning = true; else if (st === 'coals') coals = true;
    }
    if (burning) out.push('the fire is still burning'); else if (coals) out.push('the coals are still smouldering');
    return [...out, ...this.cook.ashore()];
  }
  // a trip ended (at a counter, or an evacuation): the fires you lit go out and the pot comes home with the rest
  tripEnded() {
    const F = this.fires, inv = this.inv;
    for (const key of this.lit) if (F.get(key)) F.douse(key);
    this.lit.clear();
    this.cook.pot = null;
    if (inv && inv.attached) {
      for (let i = inv.containers.length - 1; i >= 0; i--) {
        const c = inv.containers[i];
        if (c.item !== 'grate') continue;
        for (const e of c.grid) if (e.id === 'pot' && inv.crate) inv.put(inv.crate, 'pot', { quiet: true });
        inv.containers.splice(i, 1);
      }
      inv.emit('containers');
    }
    this.persist();
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
  // the old hooks (camp.js before camp 2): the prompts are this module's own now
  spotPrompts() { return false; }
  gatherPrompt() { return false; }

  // --- the notices ----------------------------------------------------------------------------------------------------
  // the pints the berries notices taken on still want, from any board
  pintsWanted() { return this.notices('berries').reduce((s, t) => s + Math.max(0, (t.need || 1) - (t.got || 0)), 0); }
  berryNotice() { return this.notices('berries')[0] || null; }
  notices(kind) { const T = this.tasks; return T ? T.active.filter((t) => t.kind === kind && t.status === 'open') : []; }
  // the wood you carry, a piece at a time (the armloads and what is on you), for a notice's armfuls
  carriedWood() {
    const inv = this.inv, out = [];
    if (!inv || !inv.attached) return out;
    for (const c of inv.containers) if (['hands', 'back', 'chest', 'pockets'].includes(inv.rootWhere(c))) for (const e of c.grid) if (!e.box && isWood(e.id)) for (let i = 0; i < e.qty; i++) out.push({ id: e.id, c, e });
    return out;
  }

  // --- saving ---------------------------------------------------------------------------------------------------------
  serialize() {
    const F = this.fires, fires = [];
    for (const key of this.lit) { const r = F && F.record(key); if (r) fires.push(r); }
    const today = this.today;
    for (const k of Object.keys(this.s.taken)) if (today - this.s.taken[k] >= WOOD.regrow) delete this.s.taken[k];
    for (const k of Object.keys(this.s.sawn)) if (today - this.s.sawn[k].day >= WOOD.regrow) delete this.s.sawn[k];
    return {
      v: 2, piles: this.s.piles, pints: this.s.pints, latrine: this.s.latrine, taken: this.s.taken, sawn: this.s.sawn,
      dropped: this.dropped.map((d) => ({ key: d.key, kind: d.kind, v: d.v, yaw: +d.yaw.toFixed(3), x: +d.x.toFixed(2), z: +d.z.toFixed(2) })),
      fires, cook: this.cook.serialize(),
    };
  }
  persist() {
    const c = this.camp, st = c.state;
    if (st) { st.chores = this.serialize(); if (c.outfitter && c.outfitter.save) c.outfitter.save(); }
    else save.write('chores', this.serialize());
  }
  restore() {
    const st = this.camp.state, d = st ? st.chores : save.read('chores'), F = this.fires;
    for (const key of this.lit) if (F && F.get(key)) F.douse(key); // another trip's fires
    this.lit.clear();
    this.s = blank(); this._dropped = []; this.dirty = true;
    if (d && d.v === 1) { // hubs 3A's armfuls: a stack by a ring becomes two branches and a log an armful
      this.s.pints = Math.max(0, d.pints | 0); this.s.latrine = d.latrine ?? null;
      if (d.pile && d.pile.key && d.pile.n > 0) this.s.piles[d.pile.key] = { 'wood:branch': 2 * Math.min(3, d.pile.n | 0), 'wood:log': Math.min(3, d.pile.n | 0) };
    } else if (d && d.v === 2) {
      this.s.pints = Math.max(0, d.pints | 0); this.s.latrine = d.latrine ?? null;
      if (d.piles && typeof d.piles === 'object') for (const [k, p] of Object.entries(d.piles)) { const q = {}; for (const [id, n] of Object.entries(p || {})) if (isWood(id) && n > 0) q[id] = Math.min(WOOD.pile, n | 0); if (Object.keys(q).length) this.s.piles[k] = q; }
      if (d.taken && typeof d.taken === 'object') this.s.taken = { ...d.taken };
      if (d.sawn && typeof d.sawn === 'object') this.s.sawn = { ...d.sawn };
      this.pendingDrops = Array.isArray(d.dropped) ? d.dropped.slice(0, 40) : [];
      for (const r of Array.isArray(d.fires) ? d.fires : []) { if (!F || !r || !r.key) continue; if (!r.laid && this.now >= r.until + FIRE.smoulder) continue; if (F.restoreRecord(r)) this.lit.add(r.key); }
      this.cook.restore(d.cook || null);
    }
    this.placePile();
  }
  // the saw's lengths come back once their ground is in
  restoreDrops() {
    const q = this.pendingDrops;
    if (!q || !q.length) return;
    this.pendingDrops = [];
    for (const d of q) {
      if (!this.world.isReady(d.x, d.z)) { this.pendingDrops.push(d); continue; }
      const kind = d.kind === 'log' ? 'log' : 'branch', yaw = Number.isFinite(d.yaw) ? d.yaw : null;
      const pc = this.pieceAt(d.key, kind, d.x, d.z, yaw == null ? mulberry32(strHash(d.key)) : seqRng([Number.isFinite(d.v) ? (d.v + 0.5) / 3 : 0.5, yaw / (Math.PI * 2)]), null, true);
      if (pc) { this.dropped.push(pc); this.dirty = true; }
    }
  }
}
const blank = () => ({ piles: {}, pints: 0, latrine: null, taken: {}, sawn: {} });
// a "random" that gives these numbers in turn (a saved piece's variant and bearing, for pieceAt)
const seqRng = (xs) => { let i = 0; return () => xs[Math.min(xs.length - 1, i++)]; };
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const _v1 = new THREE.Vector3();
const lowerName = (c) => { const d = itemDef(c.item), n = (d && (d.short || d.name)) || 'pack'; return n.charAt(0).toLowerCase() + n.slice(1); };
// "an hour", "about 2 h", "half an hour"
function hoursWords(h) { if (h < 0.75) return 'half an hour'; if (h < 1.25) return 'an hour'; return `${Math.round(h * 2) / 2} h`.replace('.5 h', '½ h'); }
// the distance from (x, z) to a down log's stem (tiles.js: the capsule from (ax, az) to (bx, bz))
function capsule(x, z, o) {
  const dx = o.bx - o.ax, dz = o.bz - o.az, L2 = dx * dx + dz * dz || 1, u = Math.max(0, Math.min(1, ((x - o.ax) * dx + (z - o.az) * dz) / L2));
  return Math.hypot(x - (o.ax + dx * u), z - (o.az + dz * u));
}

// --- the notices -------------------------------------------------------------------------------------------------------
// Blueberries for the kitchen ($10 a pint) and an armful for the stove ($6 an armful of three pieces), each posted at an
// outfitter and handed over on foot at its store (tasks.update while taken on: the store's visit is that outfitter's),
// then claimed at its counter. The berries are posted only in their season.
const BERRY_WORDS = [
  { need: 3, title: 'Blueberries for pies', text: 'Three pints of wild blueberries for the pies. They come on in the burns and on the lichen rock above the campsites.', sign: 'Deb, in the café' },
  { need: 1, title: 'A pint of blueberries', text: 'One pint for the Sunday pancakes. The open rock by the campsites is where they grow.', sign: 'the cook' },
  { need: 2, title: 'Blueberries for jam', text: 'Two pints for a batch of jam. Pick them where the old fire went through.', sign: 'Lorraine, cabin 4' },
];
const WOOD_WORDS = [
  { need: 1, title: 'Wood for the sauna', text: 'The sauna stove is hungry. An armful of dead and down from any campsite, three good pieces, left by the door.', sign: 'the lodge' },
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
    const wood = current ? current.carriedWood() : [];
    handOver(T, t, Math.floor(wood.length / ARMFUL), (n) => { for (const u of wood.slice(0, n * ARMFUL)) current.inv.take(u.c.id, u.e.uid, 1); current.inv.emit('items'); }, (n, done, more) => `You stack ${word(n)} ${plural(n, 'armful')} of wood by the door. ${done ? 'Claim it at the counter.' : `${cap(word(more))} more wanted.`}`);
  },
  progress(t) { const n = t.need || 1, g = t.got || 0; return g ? `${word(g)} of ${word(n)} handed over` : `${word(n)} ${plural(n, 'armful')} to bring in (three pieces an armful)`; },
});
