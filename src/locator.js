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

export const LOCATOR = {
  gap: 0.3,           // m: the gem's lower point over the target's top (the guide's pos), however big the gem: at the main
                      // size its centre is half a metre up
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
  water: 0.75,        // m over the water at least, when the target is over water (the canoe tied at the dock)
  shades: [0xffe58a, 0xf2b01e, 0xb57a0a], // light, mid and dark facets: the gold
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
  }
  attach(t = {}) {
    Object.assign(this.t, t);
    if (!this.group && this.t.scene) {
      this.geometry = gemGeometry();
      this.group = new THREE.Group();
      this.group.name = 'r3-locator';
      this.t.scene.add(this.group);
    }
    return this;
  }
  mesh() {
    const old = this.pool.pop();
    if (old) return old;
    const mats = LOCATOR.shades.map((c) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }));
    const m = new THREE.Mesh(this.geometry, mats);
    m.name = 'r3-locator-gem';
    m.castShadow = false; m.receiveShadow = false;
    m.renderOrder = 5; // after the other see-through things near it (the ghosts, the pointer's rim)
    m.visible = false;
    this.group.add(m);
    return m;
  }
  free(slot) { slot.mesh.visible = false; this.pool.push(slot.mesh); }
  // the target's top, kept clear of the water (a canoe tied at the dock: the ground under it is the lake's bed)
  lifted(p) {
    const w = this.t.world;
    let y = p.y;
    try {
      if (w && typeof w.shoreAt === 'function' && typeof w.levelAt === 'function' && w.shoreAt(p.x, p.z) < 0) {
        const lv = w.levelAt(p.x, p.z);
        if (Number.isFinite(lv)) y = Math.max(y, lv + LOCATOR.water);
      }
    } catch { /* the water not known here: the guide's y */ }
    return { x: p.x, y, z: p.z };
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
      if (!s) { s = { mesh: this.mesh(), a: 0, gone: false, spin: Math.random() * Math.PI * 2 }; this.slots.set(m.id, s); }
      s.gone = false; s.main = !!m.main; s.fade = m.fade; s.pos = this.lifted(m.pos);
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
    const cp = this.t.camera ? this.t.camera.position : null;
    const bob = Math.sin(this.time * Math.PI * 2 * LOCATOR.bobHz) * LOCATOR.bob;
    for (const s of this.slots.values()) {
      const me = s.mesh, p = s.pos;
      const dc = cp ? Math.hypot(p.x - cp.x, p.y + 0.5 - cp.y, p.z - cp.z) : 10;
      const k = smooth(s.a), grow = Math.min(LOCATOR.grow[1], Math.max(1, dc / LOCATOR.grow[0]));
      const h = (s.main ? LOCATOR.size : LOCATOR.sizeSide) * grow * (s.gone ? k : 0.6 + 0.4 * k);
      const y = p.y + LOCATOR.gap + LOCATOR.low * h + bob; // the point clear of the top, the bob (less than the gap) included
      const op = (s.fade ?? 1) * k;
      s.spin += dt * LOCATOR.spin;
      me.position.set(p.x, y, p.z);
      me.rotation.set(0, s.spin, 0);
      me.scale.setScalar(h);
      for (const mat of me.material) mat.opacity = op;
      me.visible = op > 0.01 && dc > LOCATOR.closeCam;
    }
  }
  shown() {
    const out = [];
    if (!this.group || !this.group.visible) return out;
    for (const [id, s] of this.slots) {
      const me = s.mesh;
      if (!me.visible) continue;
      out.push({ id, main: !!s.main, gone: s.gone, x: me.position.x, y: me.position.y, z: me.position.z, s: me.scale.x, opacity: me.material[0].opacity });
    }
    return out;
  }
}

export const locator = new Locator();
