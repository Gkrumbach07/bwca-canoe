// What you point at (the owner's second feedback of 2026-10-24: "I wonder if it'll also be easier if we had a little
// crosshair or a little circle in the middle of the screen for where you're pointing. So that you can actually point at
// the food on the fire and pick it up instead of just be around the fire and pick it up", and "E is like your interact
// button. But it's really just like your pickup button"). On foot, a small quiet dot sits in the middle of the view (in
// third person the ray runs along the camera, through the dot). What it points at within reach gets a soft rim (a
// back-face shell on the thing, one translucent material) and a small label under the dot: "E Pick up · Dead branch",
// "E Talk · Ruth", "E Open · The fire ring". E does that, and only that: it picks up a thing on the ground (into the
// hands or the first container with room), talks to a person, opens a store's shelf, board or map table (or the book at
// a camp's fire ring, tent or latrine: the jobs there are the book's, nearby.js), or gets into the canoe. Pointed at
// nothing, E does nothing. There is no Q drop: things are put down from the book (its Ground area).
//
//   import { pointer } from './pointer.js';
//   pointer.attach({ camera, player, scene, renderer, hud, chase, outfitter, fishing, photo, dialogue })
//   pointer.register((ray, near) => [{ dist, miss?, target }]) -> off
//     ray   a THREE.Ray from the camera through the dot, the middle of the view (unit direction)
//     near  { x, y, z (the walker's feet), reach (m), flat(x, z) (m from the walker, level),
//             sphere(x, y, z, r), segment(ax, ay, az, bx, by, bz, r), box({ x, y, z, hx, hy, hz, heading }) }
//           each test -> { t (m along the ray), miss (0 dead on .. 1 at the edge) } or null
//     target { kind: 'item' | 'container' | 'person' | 'shelf' | 'board' | 'maptable' | 'canoe' | 'fire' | 'tent' |
//              'latrine' | 'tree' | …, ref, label, verb: 'Pick up' | 'Talk' | 'Open' | 'Get in' | …, act(),
//              enabled? (false: the label shows `why` and E does nothing), why?, hint?,
//              mesh? (an Object3D whose geometry takes the rim), shell? ({ geometry, matrix }), box? (as near.box) }
//   pointer.target          the thing pointed at now, or null
//   pointer.before()        main.js, before anyone reads E: E acts on the target (and is taken)
//   pointer.update(dt, shell) main.js, after the camera: the ray, the target, the dot, the rim
//   pointer.groundHit       where the ray meets the ground near the walker ({ x, y, z, t }), or null (the tent's ghost)
//   pointer.passStore       inside an outfitter's store with nothing pointed at, E is left to the store's own code
//                           (stream C turns it off once the store's hotspots are registered here)
//   pointer.isArmed         () => bool: a job waits for E or a click (nearby.js: the tent's ghost, the barrel's hang),
//                           so E and the mouse are left to it
// The pick: of the candidates the ray passes, the one it passes nearest its middle (miss), the nearer on a tie. Within
// reach of the walker is each provider's to judge (near.flat, near.reach).
import * as THREE from 'three';

export const REACH = 2.6;          // m from the walker within which a thing on the ground is pointed at and picked up
const RIM = 0.028;                 // m the rim stands off the thing's surface
const FAR = 9;                     // m along the ray past the walker that the ground is looked for (the ghost)
const CSS = `
#crosshair { left: 50%; top: 50%; width: 0; height: 0; pointer-events: none; display: none; }
#crosshair.show { display: block; }
#crosshair i { position: absolute; left: -2.5px; top: -2.5px; width: 5px; height: 5px; border-radius: 50%; background: rgba(243, 236, 221, .62); box-shadow: 0 0 2px rgba(0, 0, 0, .55); transition: all .12s ease-out; }
#crosshair.on i { left: -7px; top: -7px; width: 14px; height: 14px; background: transparent; border: 1.5px solid rgba(243, 236, 221, .9); box-sizing: border-box; box-shadow: 0 0 2px rgba(0, 0, 0, .45), inset 0 0 2px rgba(0, 0, 0, .35); }
#crosshair.off i { border-color: rgba(243, 236, 221, .45); }
#crosshair .ch-lab { position: absolute; left: 0; top: 18px; translate: -50% 0; white-space: nowrap; font-size: 15px; line-height: 1.3; font-family: var(--sans); font-weight: 500; color: var(--cream); letter-spacing: 0; text-shadow: 0 1px 2px rgba(0, 0, 0, .6); opacity: 0; transition: opacity .15s; display: flex; align-items: center; gap: 8px; }
#crosshair.on .ch-lab { opacity: 1; }
#crosshair .ch-lab kbd { font-size: 12px; padding: 1px 6px; min-width: 20px; }
#crosshair .ch-lab .what { color: rgba(243, 236, 221, .78); }
#crosshair.off .ch-lab { color: rgba(243, 236, 221, .7); font-style: italic; }
#air.nohints #crosshair .ch-lab kbd { display: none; }
`;
// a prompt line without its E (player.js say: "info &nbsp;·&nbsp; <kbd>E</kbd>Do this &nbsp; <kbd>Q</kbd>Do that")
export function stripE(text) {
  let s = String(text || '').replace(/<kbd>E<\/kbd>.*?(?=\s*&nbsp;\s*<kbd>|$)/g, '');
  s = s.replace(/(\s*&nbsp;\s*)+(?=\s*&nbsp;·&nbsp;)/g, '').replace(/&nbsp;·&nbsp;(\s*&nbsp;\s*)+/g, '&nbsp;·&nbsp; ');
  s = s.replace(/^(\s|&nbsp;|·)+/, '').replace(/(\s|&nbsp;|·)+$/, '');
  return s;
}
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _o = new THREE.Vector3(), _d = new THREE.Vector3(), _m = new THREE.Matrix4();

class Pointer {
  constructor() {
    this.providers = new Set();
    this.target = null; this.last = null;
    this.ray = new THREE.Ray();
    this.groundHit = null;
    this.passStore = true;
    this.isArmed = null;
    this.on = false;
    this.attached = false;
    this.boxGeos = new Map();
    this.near = this.makeNear();
  }

  attach({ camera, player, scene, renderer = null, hud = null, chase = null, outfitter = null, fishing = null, photo = null, dialogue = null }) {
    Object.assign(this, { camera, player, scene, renderer, hud, chase, outfitter, fishing, photo, dialogue });
    this.input = player.input;
    this.attached = true;
    if (typeof document !== 'undefined') {
      if (!document.getElementById('pointer-css')) { const s = document.createElement('style'); s.id = 'pointer-css'; s.textContent = CSS; document.head.appendChild(s); }
      const air = document.getElementById('air') || document.body;
      const el = this.el = document.createElement('div');
      el.id = 'crosshair'; el.setAttribute('aria-hidden', 'true');
      el.innerHTML = '<i></i><div class="ch-lab"></div>';
      air.appendChild(el);
      this.lab = el.querySelector('.ch-lab');
      // a click on the scene is a key too (Mouse0), for a job armed to start on it (the tent's ghost) and a held job
      const cv = renderer && renderer.domElement;
      if (cv) {
        cv.addEventListener('mousedown', (e) => { if (e.button === 0) { this.input.down.add('Mouse0'); this.input.once.add('Mouse0'); } });
        cv.addEventListener('contextmenu', (e) => { if (this.onCancel && this.onCancel('right')) e.preventDefault(); });
      }
      window.addEventListener('mouseup', (e) => { if (e.button === 0) this.input.down.delete('Mouse0'); });
      window.addEventListener('blur', () => this.input.down.delete('Mouse0'));
      // Esc stops an armed job before the pause card hears it (capture phase, ahead of title.js)
      window.addEventListener('keydown', (e) => {
        if (e.code !== 'Escape' || !this.armed()) return;
        if (this.onCancel && this.onCancel('esc')) { e.preventDefault(); e.stopImmediatePropagation(); }
      }, true);
    }
    // the rim: one translucent material, its back faces pushed out along the normals, so only a soft edge shows round
    // the thing; always in the scene (parked under the world) so its program is made behind the title card
    const mat = this.rimMat = new THREE.MeshBasicMaterial({ color: 0xfff0cf, transparent: true, opacity: 0.55, side: THREE.BackSide, depthWrite: false });
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uRim = { value: RIM };
      sh.vertexShader = sh.vertexShader.replace('void main() {', 'uniform float uRim;\nvoid main() {').replace('#include <begin_vertex>', '#include <begin_vertex>\n\ttransformed += normalize( normal ) * uRim;');
    };
    mat.customProgramCacheKey = () => 'pointer-rim';
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0.01, 0, 0, 0, 0.01, 0], 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0], 3));
    this.parkGeo = g;
    this.rim = new THREE.Mesh(g, mat);
    this.rim.name = 'pointer-rim'; this.rim.matrixAutoUpdate = false; this.rim.renderOrder = 4; this.rim.castShadow = false; this.rim.receiveShadow = false;
    this.park();
    scene.add(this.rim);
    return this;
  }
  register(fn) { this.providers.add(fn); return () => this.providers.delete(fn); }
  armed() { return !!(this.isArmed && this.isArmed()); }

  // --- the tests a provider uses ---------------------------------------------------------------------------------
  makeNear() {
    const self = this;
    return {
      x: 0, y: 0, z: 0, reach: REACH,
      flat: (x, z) => Math.hypot(x - self.near.x, z - self.near.z),
      sphere: (x, y, z, r) => {
        const R = self.ray, o = R.origin, d = R.direction;
        const vx = x - o.x, vy = y - o.y, vz = z - o.z, t = vx * d.x + vy * d.y + vz * d.z;
        if (t < 0) return null;
        const cx = o.x + d.x * t - x, cy = o.y + d.y * t - y, cz = o.z + d.z * t - z, m = Math.sqrt(cx * cx + cy * cy + cz * cz);
        if (m > r) return null;
        return { t: t - Math.sqrt(Math.max(0, r * r - m * m)), miss: m / r };
      },
      // the ray against a rod from a to b of radius r (a branch on the ground, a paddle, a down log)
      segment: (ax, ay, az, bx, by, bz, r) => {
        const R = self.ray, o = R.origin, d = R.direction;
        const ux = bx - ax, uy = by - ay, uz = bz - az, c = ux * ux + uy * uy + uz * uz;
        if (c < 1e-8) return self.near.sphere(ax, ay, az, r);
        const wx = o.x - ax, wy = o.y - ay, wz = o.z - az;
        const b = d.x * ux + d.y * uy + d.z * uz, dw = d.x * wx + d.y * wy + d.z * wz, e = ux * wx + uy * wy + uz * wz, den = c - b * b;
        const cl = (k) => Math.max(0, Math.min(1, k));
        let s = den > 1e-9 ? cl((e - b * dw) / den) : 0, t = Math.max(0, b * s - dw); // s along the rod (0..1), t along the ray
        s = cl((e + b * t) / c); t = Math.max(0, b * s - dw);
        const px = ax + ux * s, py = ay + uy * s, pz = az + uz * s;
        const cx = o.x + d.x * t - px, cy = o.y + d.y * t - py, cz = o.z + d.z * t - pz, m = Math.sqrt(cx * cx + cy * cy + cz * cz);
        if (m > r || t <= 0) return null;
        return { t: Math.max(0, t - Math.sqrt(Math.max(0, r * r - m * m))), miss: m / r };
      },
      // the ray against a box turned to `heading` (as player.heading: its x half-size along (cos h, -sin h)), y its middle
      box: ({ x, y, z, hx, hy, hz, heading = 0 }) => {
        const R = self.ray, o = R.origin, d = R.direction, c = Math.cos(heading), s = Math.sin(heading);
        const lx = (o.x - x) * c - (o.z - z) * s, ly = o.y - y, lz = (o.x - x) * s + (o.z - z) * c;
        const dx = d.x * c - d.z * s, dy = d.y, dz = d.x * s + d.z * c;
        let t0 = 0, t1 = Infinity;
        for (const [p, q, h] of [[lx, dx, hx], [ly, dy, hy], [lz, dz, hz]]) {
          if (Math.abs(q) < 1e-9) { if (Math.abs(p) > h) return null; continue; }
          let a = (-h - p) / q, b = (h - p) / q;
          if (a > b) { const k = a; a = b; b = k; }
          if (a > t0) t0 = a; if (b < t1) t1 = b;
          if (t0 > t1) return null;
        }
        // how near its middle the ray passes, in shares of its size (a box hit edge-on loses to a thing hit square)
        const tm = Math.max(0, -(lx * dx + ly * dy + lz * dz)), mx = (lx + dx * tm) / hx, my = (ly + dy * tm) / hy, mz = (lz + dz * tm) / hz;
        return { t: t0, miss: Math.min(1, Math.sqrt(mx * mx + my * my + mz * mz) / Math.sqrt(3)) };
      },
    };
  }

  // --- the frame ------------------------------------------------------------------------------------------------
  // On foot, in the game, nothing on the paper, no conversation, no camera to the eye, no rod up
  usable(shell = false) {
    const p = this.player, h = this.hud, f = this.fishing;
    if (!this.attached || shell || !p || p.mode !== 'walk' || p.teleporting) return false;
    if (h && (h.paper || h.big)) return false;
    if (this.dialogue && this.dialogue.talking) return false;
    if (this.photo && this.photo.raised) return false;
    if (f && (f.rodUp || f.landed)) return false;
    return true;
  }
  inStore() { const o = this.outfitter; return !!(o && o.visit); }

  // before player.update and everyone else's E: E on the target. Pointed at nothing, E does nothing (in a store, until
  // stream C's hotspots are here, it is left to the store).
  before() {
    const inp = this.input;
    if (!this.usable() || inp.paused) return;
    if (this.armed()) return; // the ghost's E and click are its own (nearby.js)
    if (!inp.once.has('KeyE')) return;
    const holdActive = typeof window !== 'undefined' && window.__game && window.__game.hold && window.__game.hold.active;
    if (holdActive) return;
    const t = this.target;
    if (t) {
      inp.once.delete('KeyE');
      if (t.enabled === false) { if (t.why && this.hud) this.hud.note(t.why, 3); return; }
      try { t.act(); } catch (e) { console.warn('pointer act', e); }
      return;
    }
    if (this.passStore && this.inStore()) return;
    inp.once.delete('KeyE');
  }

  // after the camera has moved: the ray through the dot, the candidates, the pick, the dot and the rim
  update(dt, shell = false) {
    const ok = this.usable(shell), p = this.player;
    this.on = ok;
    if (!ok) { this.setTarget(null); this.groundHit = null; this.show(false); return; }
    const cam = this.camera;
    cam.updateMatrixWorld();
    cam.getWorldPosition(_o); cam.getWorldDirection(_d);
    // the ray through the dot, the middle of the view: in first person from the eye, in third person along the camera
    // (camera.js, stream E: looking down slides its look point in to the ground at the walker's feet, so the middle of
    // the view comes down to within a metre and a half of him)
    this.third = !!(this.chase && this.chase.mode !== 'first');
    this.ray.origin.copy(_o); this.ray.direction.copy(_d).normalize();
    const n = this.near;
    n.x = p.x; n.z = p.z; n.y = p.altitude; n.reach = REACH;
    let best = null;
    if (!this.armed()) {
      for (const fn of this.providers) {
        let list;
        try { list = fn(this.ray, n); } catch (e) { if (!this.warned) { this.warned = true; console.warn('pointer provider', e); } continue; }
        if (!list) continue;
        for (const c of list) {
          if (!c || !c.target || !Number.isFinite(c.dist)) continue;
          const miss = Number.isFinite(c.miss) ? c.miss : 0.5;
          if (!best || miss < best.miss - 0.04 || (Math.abs(miss - best.miss) <= 0.04 && c.dist < best.dist)) best = { ...c, miss };
        }
      }
    }
    this.setTarget(best ? best.target : null);
    this.groundHit = this.findGround();
    this.show(true);
    this.drawRim();
    // on foot the E is the dot's: a line at the bottom offering E for something you do not point at would lie, so it
    // keeps its words and loses the key (the store keeps its own until stream C has moved it here)
    const pr = p.prompt;
    if (pr && !pr.hold && !this.armed() && !(this.passStore && this.inStore())) {
      let q = pr.key === 'E' ? { ...pr, key: null } : pr;
      if (/<kbd>E<\/kbd>/.test(q.text || '')) q = { ...q, text: stripE(q.text) };
      if (q !== pr) p.prompt = q.text ? q : null;
    }
  }
  setTarget(t) {
    const was = this.target;
    this.target = t;
    if (t !== was) this.sig = null;
  }
  // where the ray meets the ground ahead of the walker, within FAR of him (the tent's ghost aims at it)
  findGround() {
    const p = this.player, R = this.ray, o = R.origin, d = R.direction;
    if (!p || typeof p.groundAt !== 'function') return null;
    // from where the ray passes the walker on out
    const t0 = Math.max(0, (p.x - o.x) * d.x + (p.altitude + 1.2 - o.y) * d.y + (p.z - o.z) * d.z) * 0.6;
    let prev = null;
    for (let t = t0; t < t0 + FAR + 6; t += 0.25) {
      const x = o.x + d.x * t, y = o.y + d.y * t, z = o.z + d.z * t, g = p.groundAt(x, z);
      if (!Number.isFinite(g)) return null;
      if (y <= g) {
        // a step back for the crossing
        let a = prev ? prev.t : t - 0.25, b = t;
        for (let k = 0; k < 6; k++) { const m = (a + b) / 2, gy = p.groundAt(o.x + d.x * m, o.z + d.z * m); if (o.y + d.y * m <= gy) b = m; else a = m; }
        const x1 = o.x + d.x * b, z1 = o.z + d.z * b;
        return { x: x1, y: p.groundAt(x1, z1), z: z1, t: b };
      }
      prev = { t };
    }
    return null;
  }

  // the dot and its label
  show(on) {
    const el = this.el;
    if (!el) return;
    el.classList.toggle('show', on);
    const t = on ? this.target : null;
    el.classList.toggle('on', !!t);
    el.classList.toggle('off', !!(t && t.enabled === false));
    const sig = t ? `${t.verb}|${t.label}|${t.enabled}|${t.why || ''}|${t.hint || ''}` : '';
    if (sig === this.sig) return;
    this.sig = sig;
    if (!t) { this.lab.innerHTML = ''; return; }
    this.lab.innerHTML = t.enabled === false
      ? `<span>${esc(t.label)}</span>${t.why ? `<span class="what">· ${esc(t.why)}</span>` : ''}`
      : `<kbd>E</kbd><span>${esc(t.verb)}</span>${t.label ? `<span class="what">· ${esc(t.label)}</span>` : ''}${t.hint ? `<span class="what">· ${esc(t.hint)}</span>` : ''}`;
  }
  // the rim on the thing pointed at: its own mesh's geometry where it has one, else the shape it gave, else a box
  drawRim() {
    const t = this.target, r = this.rim;
    if (!r) return;
    if (!t) { this.park(); return; }
    let geo = null;
    if (t.mesh && t.mesh.geometry && t.mesh.visible !== false && !t.mesh.isSkinnedMesh && !t.mesh.isInstancedMesh) {
      t.mesh.updateWorldMatrix(true, false);
      geo = t.mesh.geometry; r.matrix.copy(t.mesh.matrixWorld);
    } else if (t.shell && t.shell.geometry) { geo = t.shell.geometry; r.matrix.copy(t.shell.matrix); }
    else if (t.box) {
      const b = t.box, k = `${b.hx.toFixed(2)},${b.hy.toFixed(2)},${b.hz.toFixed(2)}`;
      geo = this.boxGeos.get(k);
      if (!geo) { geo = new THREE.BoxGeometry(b.hx * 2, b.hy * 2, b.hz * 2); this.boxGeos.set(k, geo); if (this.boxGeos.size > 40) { const [k0, g0] = this.boxGeos.entries().next().value; g0.dispose(); this.boxGeos.delete(k0); } }
      r.matrix.makeRotationY(b.heading || 0).setPosition(b.x, b.y, b.z);
    }
    if (!geo || !geo.getAttribute('normal')) { this.park(); return; }
    r.geometry = geo;
    r.matrixWorldNeedsUpdate = true; r.updateMatrixWorld(true);
    r.frustumCulled = false;
    this.rimMat.opacity = t.enabled === false ? 0.28 : 0.55;
  }
  park() {
    const r = this.rim;
    if (!r) return;
    r.geometry = this.parkGeo;
    r.matrix.makeTranslation(0, -1e4, 0); r.matrixWorldNeedsUpdate = true; r.updateMatrixWorld(true);
    r.frustumCulled = true;
  }
}

export const pointer = new Pointer();
export { Pointer };

// --- what other modules offer the dot (wired by main.js, fb2 A) ---------------------------------------------------
// The people in the stores (npcs.js): the one pointed at, within talking reach, is "E Talk"; the keeper behind the
// counter too (the counter itself is the store's, stream C).
export function peopleTargets(people) {
  return (ray, near) => {
    if (!people || !people.bodies) return null;
    const out = [], p = people.player;
    for (const b of people.bodies) {
      if (!b.who) continue;
      const v = b.who.person, f = v.figs && v.figs[b.who.fig];
      if (!f) continue;
      const reach = v.keeper ? 2.9 : 2.3;
      if (near.flat(f.x, f.z) > reach) continue;
      const gy = p && p.groundAt ? p.groundAt(f.x, f.z) : near.y, sit = f.spec && f.spec.pose === 'sit';
      const top = gy + (sit ? 1.25 : 1.72), bot = gy + 0.35;
      const hit = near.segment(f.x, bot, f.z, f.x, top, f.z, 0.42);
      if (!hit) continue;
      const name = v.keeper ? v.name : (people.s && people.s.talked && people.s.talked[v.key] ? v.first : v.name);
      out.push({ dist: hit.t, miss: hit.miss * 0.9, target: { kind: 'person', ref: v.key, label: name, verb: 'Talk', hint: v.who && !v.keeper ? v.who : null, box: { x: f.x, y: (top + bot) / 2, z: f.z, hx: 0.3, hy: (top - bot) / 2, hz: 0.3, heading: f.heading || 0 }, act: () => people.talkTo(v) } });
    }
    return out;
  };
}
// The berries and mushrooms (forage.js): a ripe patch pointed at within its reach is "E Pick"
export function forageTargets(forage, FORAGE) {
  return (ray, near) => {
    if (!forage || !forage.drawn || forage.busy) return null;
    const out = [];
    for (const q of forage.drawn) {
      const s = FORAGE[q.id];
      if (!s || !q.mesh || !q.mesh.visible || s.kind === 'decor') continue;
      if (near.flat(q.x, q.z) > Math.max(1.6, s.reach + 0.6)) continue;
      const tall = s.tall ? 1.1 : 0.25, hit = near.sphere(q.x, q.y + tall, q.z, s.tall ? 0.9 : 0.75);
      if (!hit) continue;
      const left = s.pick ? forage.leftOn(q) : 1, look = s.kind === 'lookalike';
      out.push({ dist: hit.t, miss: hit.miss, target: { kind: 'item', ref: q.key, label: s.name || s.short, verb: look ? 'Look' : (s.pick && s.pick.verb) || 'Pick', enabled: look || left > 0, why: left > 0 ? null : 'picked for today', mesh: q.mesh, act: () => forage.start(q) } });
    }
    return out;
  };
}
// A lost thing a notice sent you for (tasks.js 'item'): "E Pick up"
export function taskTargets(tasks, KINDS) {
  return (ray, near) => {
    if (!tasks || !tasks.active) return null;
    const out = [];
    for (const t of tasks.active) {
      if (t.status !== 'open' || !t.spot || !KINDS[t.kind] || !KINDS[t.kind].use) continue;
      const m = tasks.props && tasks.props.get(t.id);
      if (!m || near.flat(t.spot.x, t.spot.z) > REACH) continue;
      m.getWorldPosition(_v);
      const hit = near.sphere(_v.x, _v.y + 0.08, _v.z, 0.45);
      if (!hit) continue;
      out.push({ dist: hit.t, miss: hit.miss, target: { kind: 'item', ref: `task:${t.id}`, label: `the ${t.label}`, verb: 'Pick up', mesh: m.isMesh ? m : null, act: () => KINDS[t.kind].use(tasks, t) } });
    }
    return out;
  };
}
void _w; void _m;
