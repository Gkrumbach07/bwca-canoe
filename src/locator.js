// The golden locator (round 3, 2026-11-05; docs/build/r3-contract.md, builder C). The owner: "a little Sims-like golden
// pointy, like, hey, go over here to this person thing would be helpful. And we can use that same locator bit to like go
// to different areas or check off certain things."
//
// A small faceted gold gem, bobbing and turning slowly over the person, place or thing of the main path's step (the
// staffer, the food shelf, the tackle shelf, the canoe at the dock) and over any other open task's target in reach (a
// site's grate, latrine and pad, a notice's spot, the counter for a ticket). It draws what guide.marks() says each frame
// and decides nothing itself: what shows, how far it reaches and how much it fades are the guide's (the show rule:
// within the target's own reach, never more than 120 m, or in and about its store), so it never points across the
// wilderness. A mark goes when its entry goes (a step done drops out of marks()); it shrinks away in a quarter second.
//
// Cheap: one shared geometry (a six-sided bipyramid, the long point down), a few pooled meshes (at most GUIDE.marksMax
// shown at once), and per gem a trio of MeshBasicMaterials (three shades of gold for the facets). They are unlit, so the
// gem reads the same by day, at dusk, at night and inside the store, and their parameters (transparent, double-sided,
// fogged, tone-mapped, no map, no vertex colours) are the ones the tents' pitch ghosts already compile in the prewarm,
// so the locator adds no shader program (renderer.info.programs is the same with it: scripts/r3-locator-test.mjs).
// Not on the mirror's layers (no reflection pass), casts no shadow.
//
//   locator.attach({ scene, camera, guide, world, talk, photo })
//   locator.update(dt, shell)   main.js, each frame after the camera (pointer.update's wrap); the title or pause hides it
//   locator.shown() → [{ id, main, gone, x, y, z, s, opacity }]   (the rigs)
//   locator.enabled = false     hides it (a debug switch: the guide's show rule is the setting)

import * as THREE from 'three';
import { storeLayouts } from './props.js';

export const LOCATOR = {
  gap: 0.3,           // m: the gem's lower point over the target's top (the guide's pos), however big the gem: at the main
                      // size its centre is half a metre up
  gapPerson: 0.06,    // m over a person: the guide's speaker point is already a hand over the head, so the gem rides just
                      // above the hat, Sims-like, and under a store's beams
  ceiling: 2.38,      // m over a store's floor: the gem's top kept under this indoors (camera.js SIGHT.ceiling is 2.55)
  low: 0.62,          // the lower point's depth below the centre, in gem heights (gemGeometry)
  bob: 0.06,          // m: the bob's half height (less than the gap)
  bobHz: 0.45,        // bobs a second
  spin: 0.9,          // rad/s about the vertical
  size: 0.30,         // m tall: the main path's step
  sizeSide: 0.22,     // m tall: any other mark
  grow: [9, 2.4],     // past 9 m from the camera it grows with the distance, up to 2.4 times, so it still reads far off
  appear: 0.3,        // s to fade and swell in
  vanish: 0.25,       // s to shrink away when its entry goes
  closeCam: 1.1,      // m: nearer the camera than this it is hidden (it never fills the view)
  xray: 9,            // m: nearer the camera than this it is drawn over what stands in front of it (your own hat and
                      // shoulders, the staffer's lamp shade): close by, the gem is never lost behind the near things; past it
                      // the world hides it as ever (depthTest only: no new program)
  minPerson: 0.14,    // m tall at least: over a tall person under a store's beams the gem shrinks to fit, no smaller
  water: 0.6,         // m over the water at least, when the target is over water (the canoe tied at the dock)
  shades: [0xffe58a, 0xf2b01e, 0xb57a0a], // light, mid and dark facets: the gold
  // r4 (the tutorial polish): on the screen a gem keeps clear of the HUD's top bar (the energy bar and its clock, the
  // strip over a paper, the compass). Standing at a store's shelf the gem sat up in the beams, at the top of the view,
  // against the bar; a place's or a thing's gem is lowered (never a person's: it would sink into the head) until its top
  // is this many px under the bar's lowest edge, its point at most `sink` m under the target's top
  barGap: 10,         // px under the top bar
  sink: 0.45,         // m: the lowest the point goes under the target's top to keep clear of the bar
  barIds: ['energy', 'strip', 'compass'], // the top bar's pieces (hud.css), read four times a second
  barEvery: 0.25,     // s between two reads of the bar
};

// a six-sided bipyramid: the top point short, the bottom long (a plumbob), 12 faces, each its own three vertices (so
// each is flat), in three groups by shade: the upper faces alternate light and mid, the lower mid and dark, so the
// facets catch and lose the light as it turns. In units of the gem's height (each mesh is scaled).
function gemGeometry() {
  const n = 6, r = 0.36, top = 0.38, bot = -LOCATOR.low;
  const ring = Array.from({ length: n }, (_, i) => { const a = (i / n) * Math.PI * 2; return [Math.cos(a) * r, 0, Math.sin(a) * r]; });
  const faces = [[], [], []];
  for (let i = 0; i < n; i++) {
    const a = ring[i], b = ring[(i + 1) % n];
    faces[i % 2 ? 1 : 0].push([0, top, 0], b, a); // upper
    faces[i % 2 ? 2 : 1].push([0, bot, 0], a, b); // lower
  }
  const pos = [], g = new THREE.BufferGeometry();
  let start = 0;
  for (let s = 0; s < 3; s++) {
    for (const v of faces[s]) pos.push(...v);
    g.addGroup(start, faces[s].length, s);
    start += faces[s].length;
  }
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeBoundingSphere();
  return g;
}

// r4: the lowest edge on the screen (px) of the HUD's top bar as it is up now, 0 when none of it is (only pieces in the
// top third count: the bar moves down under the spot card, never that far)
function topBar() {
  if (typeof document === 'undefined') return 0;
  let low = 0;
  const H = window.innerHeight;
  for (const id of LOCATOR.barIds) {
    const e = document.getElementById(id); if (!e) continue;
    const r = e.getBoundingClientRect(); if (!r.width || !r.height || r.top > H / 3) continue;
    let shown = true;
    for (let q = e; q && q !== document.body && shown; q = q.parentElement) { const cs = getComputedStyle(q); if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) < 0.05) shown = false; }
    if (shown) low = Math.max(low, r.bottom);
  }
  return low;
}
const smooth = (t) => { const x = Math.max(0, Math.min(1, t)); return x * x * (3 - 2 * x); };

export class Locator {
  constructor() {
    this.t = {};
    this.slots = new Map(); // mark id → { mesh, a (appear 0..1), gone, pos, main, fade, spin }
    this.pool = [];         // meshes not in use
    this.time = 0;
    this.enabled = true;
    this.geometry = null;
    this.group = null;
    this.warned = false;
    this.bar = 0; this.barT = 0; // the top bar's lowest edge on the screen, px (0: none up), and the time to read it again
  }
  attach(t = {}) {
    Object.assign(this.t, t);
    if (!this.group && this.t.scene) {
      this.geometry = gemGeometry();
      this.group = new THREE.Group();
      this.group.name = 'r3-locator';
      this.t.scene.add(this.group);
    }
    // (r3 final: what people say is placed clear of the gems, as of the tracker's card: dialogue.js placement)
    if (this.t.talk && !this.t.talk.keepClear) this.t.talk.keepClear = (cam, W, H) => this.screenRects(cam, W, H);
    return this;
  }
  mesh() {
    const old = this.pool.pop();
    if (old) return old;
    const mats = LOCATOR.shades.map((c) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }));
    const m = new THREE.Mesh(this.geometry, mats);
    m.name = 'r3-locator-gem';
    m.castShadow = false; m.receiveShadow = false;
    // drawn after every other see-through thing (the water is 10, the rise rings 12, the steam 17): it writes no depth,
    // so anything see-through drawn after it painted over it (over the lake the canoe's gem was lost under the water)
    m.renderOrder = 30;
    m.visible = false;
    this.group.add(m);
    return m;
  }
  free(slot) { slot.mesh.visible = false; this.pool.push(slot.mesh); }
  // the target's top, kept clear of the water (a canoe tied at the dock: the ground under it is the lake's bed)
  lifted(p) {
    const w = this.t.world;
    let y = p.y;
    let roof = Infinity;
    try {
      if (w && typeof w.shoreAt === 'function' && typeof w.levelAt === 'function' && w.shoreAt(p.x, p.z) < 0) {
        const lv = w.levelAt(p.x, p.z);
        if (Number.isFinite(lv)) y = Math.max(y, lv + LOCATOR.water);
      }
    } catch { /* the water not known here: the guide's y */ }
    try { for (const L of storeLayouts()) if (L && typeof L.inside === 'function' && L.inside(p.x, p.z)) { roof = L.floorY + LOCATOR.ceiling; break; } } catch { /* no stores */ }
    return { x: p.x, y, z: p.z, roof };
  }
  hidden(shell) {
    if (!this.enabled || shell) return true;
    const { talk, photo } = this.t;
    if (talk && talk.talking) return true;  // in a conversation the view is on the speaker: no gem over their head
    if (photo && photo.raised) return true; // the camera up: the picture is the world's own
    return false;
  }
  update(dt = 0, shell = false) {
    if (!this.group) return;
    const G = this.t.guide;
    this.time += dt;
    const off = this.hidden(shell);
    this.group.visible = !off;
    let marks = [];
    if (!off && G) { try { marks = G.marks(); } catch (e) { if (!this.warned) { this.warned = true; console.warn('locator: marks', e); } } }
    const seen = new Set();
    for (const m of marks) {
      seen.add(m.id);
      let s = this.slots.get(m.id);
      if (!s) { s = { mesh: this.mesh(), a: 0, gone: false, spin: Math.random() * Math.PI * 2 }; this.slots.set(m.id, s); this.barT = 0; } // (a new gem reads the bar this frame)
      s.gone = false; s.main = !!m.main; s.fade = m.fade; s.pos = this.lifted(m.pos);
      s.person = !!(m.entry && m.entry.target && m.entry.target.kind === 'person');
      s.a = Math.min(1, s.a + dt / LOCATOR.appear);
    }
    for (const [id, s] of this.slots) {
      if (seen.has(id)) continue;
      if (off) { this.free(s); this.slots.delete(id); continue; } // hidden: nothing lingers to shrink later
      s.gone = true;
      s.a -= dt / LOCATOR.vanish;
      if (s.a <= 0) { this.free(s); this.slots.delete(id); }
    }
    if (off) return;
    const cam = this.t.camera, cp = cam ? cam.position : null;
    if ((this.barT -= dt) <= 0) { this.barT = LOCATOR.barEvery; this.bar = topBar(); }
    if (cam && this.bar > 0) cam.updateMatrixWorld();
    const bob = Math.sin(this.time * Math.PI * 2 * LOCATOR.bobHz) * LOCATOR.bob;
    for (const s of this.slots.values()) {
      const me = s.mesh, p = s.pos;
      const dc = cp ? Math.hypot(p.x - cp.x, p.y + 0.5 - cp.y, p.z - cp.z) : 10;
      const k = smooth(s.a), grow = Math.min(LOCATOR.grow[1], Math.max(1, dc / LOCATOR.grow[0]));
      let h = (s.main ? LOCATOR.size : LOCATOR.sizeSide) * grow * (s.gone ? k : 0.6 + 0.4 * k);
      let under = false, y = p.y + (s.person ? LOCATOR.gapPerson : LOCATOR.gap) + LOCATOR.low * h + bob; // the point clear of the top, the bob included
      // (r3 final: over a tall person indoors the beams left no room for the whole gem and pushed it into the hat (4 cm,
      // a summer help with a hat under the 2.38 m ceiling): there it is smaller and still, its point kept over the head)
      if (s.person && Number.isFinite(p.roof)) {
        const room = p.roof - (p.y + LOCATOR.gapPerson);
        if (room < h + LOCATOR.bob) { h = Math.max(LOCATOR.minPerson, Math.min(h, room)); y = p.y + LOCATOR.gapPerson + LOCATOR.low * h; }
      }
      y = Math.min(y, p.roof - 0.38 * h); // indoors its top under the beams
      if (!s.person && cam && this.bar > 0) y = this.underBar(cam, p, y, h);
      // (round 4 join: a person's gem can't sink into the head, so against the top bar (walking in close by the staffer,
      // the chase easing over his shoulder) it shrinks and stills, its point kept over the head, until its top is clear)
      else if (s.person && cam && this.bar > 0) { const r = this.personUnderBar(cam, p, y, h); y = r.y; h = r.h; under = !!r.under; }
      const op = (s.fade ?? 1) * k;
      s.spin += dt * LOCATOR.spin;
      me.position.set(p.x, y, p.z);
      me.rotation.set(0, s.spin, 0);
      me.scale.setScalar(h);
      const xr = dc < LOCATOR.xray;
      for (const mat of me.material) { mat.opacity = op; mat.depthTest = !xr; }
      me.visible = op > 0.01 && dc > LOCATOR.closeCam && !under;
    }
  }
  // r4: the gem's centre height that keeps its top under the top bar on the screen (y as it is when it is clear already,
  // off the screen sideways or behind the camera); lowered no further than its point `sink` m under the target's top
  underBar(cam, p, y, h, H = window.innerHeight) {
    const v = this._bv || (this._bv = new THREE.Vector3());
    const want = this.bar + LOCATOR.barGap;
    const topPx = (cy) => { v.set(p.x, cy + 0.38 * h, p.z).project(cam); return v.z > 1 || v.z < -1 || v.x < -1.1 || v.x > 1.1 ? null : ((1 - v.y) / 2) * H; };
    const t0 = topPx(y);
    if (t0 == null || t0 >= want) return y;
    const lo = Math.min(y, p.y - LOCATOR.sink + LOCATOR.low * h);
    const tl = topPx(lo);
    if (tl == null || tl < want) return lo; // (right under it, looking up: as low as it goes)
    let a = lo, b = y; // a clear, b not
    for (let k = 0; k < 10; k++) { const m = (a + b) / 2, t = topPx(m); if (t != null && t >= want) a = m; else b = m; }
    return a;
  }
  // round 4 join: a person's gem against the top bar: the size (down to minPerson, the bob off) whose top clears the bar,
  // its point over the head as ever; { y, h } as it is when it is clear already
  personUnderBar(cam, p, y, h, H = window.innerHeight) {
    const v = this._bv || (this._bv = new THREE.Vector3());
    const want = this.bar + LOCATOR.barGap;
    const topPx = (cy, ch) => { v.set(p.x, cy + 0.38 * ch, p.z).project(cam); return v.z > 1 || v.z < -1 || v.x < -1.1 || v.x > 1.1 ? null : ((1 - v.y) / 2) * H; };
    const t0 = topPx(y, h);
    if (t0 == null || t0 >= want) return { y, h };
    const at = (ch) => ({ y: Math.min(p.y + LOCATOR.gapPerson + LOCATOR.low * ch, p.roof - 0.38 * ch), h: ch });
    const lo = at(LOCATOR.minPerson), tl = topPx(lo.y, lo.h);
    // (round 4 fix: as small as it goes and still in the bar (a fast turn at the store door put her head up under it, the
    // gem's top at 68 px with the bar at 149): it is not shown at all that frame; she is right there in front of you)
    if (tl == null || tl < want) return { ...lo, under: true };
    if (h <= LOCATOR.minPerson) return { y, h };
    let a = LOCATOR.minPerson, b = h; // a clear, b not
    for (let k = 0; k < 8; k++) { const m = (a + b) / 2, q = at(m), t = topPx(q.y, q.h); if (t != null && t >= want) a = m; else b = m; }
    return at(a);
  }
  // each gem shown, as a box on the screen in px ({ x, y, w, h }, a little padded), for the barks to keep clear of
  screenRects(cam = this.t.camera, W = window.innerWidth, H = window.innerHeight) {
    const out = [];
    if (!cam || !this.group || !this.group.visible) return out;
    const v = this._sv || (this._sv = new THREE.Vector3());
    for (const s of this.slots.values()) {
      const me = s.mesh; if (!me.visible) continue;
      const h = me.scale.x, px = [];
      for (const dy of [0.38 * h, -LOCATOR.low * h]) {
        v.set(me.position.x, me.position.y + dy, me.position.z).project(cam);
        if (v.z > 1 || v.z < -1) { px.length = 0; break; }
        px.push([((v.x + 1) / 2) * W, ((1 - v.y) / 2) * H]);
      }
      if (px.length < 2) continue;
      const top = Math.min(px[0][1], px[1][1]), bot = Math.max(px[0][1], px[1][1]), cx = (px[0][0] + px[1][0]) / 2, hw = Math.max(6, (bot - top) * 0.4) + 6;
      out.push({ x: cx - hw, y: top - 6, w: hw * 2, h: bot - top + 12, gem: true });
    }
    return out;
  }
  shown() {
    const out = [];
    if (!this.group || !this.group.visible) return out;
    for (const [id, s] of this.slots) {
      const me = s.mesh;
      if (!me.visible) continue;
      out.push({ id, main: !!s.main, gone: s.gone, x: me.position.x, y: me.position.y, z: me.position.z, s: me.scale.x, opacity: me.material[0].opacity, xray: !me.material[0].depthTest });
    }
    return out;
  }
}

export const locator = new Locator();
