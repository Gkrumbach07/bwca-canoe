// What you point at (the owner's second feedback of 2026-10-24: "I wonder if it'll also be easier if we had a little
// crosshair or a little circle in the middle of the screen for where you're pointing. So that you can actually point at
// the food on the fire and pick it up instead of just be around the fire and pick it up"; and the third, the world
// cards: "some keys are used to pick up the canoe (Q and E). I feel like at most an item can have two quick actions.
// primary is E and secondary is Q"). On foot, a small quiet dot sits in the middle of the view (in third person the ray
// runs along the camera, through the dot). What it points at within reach gets a soft rim (a back-face shell on the
// thing, one translucent material) and a small label under the dot with its one or two keys, always both: "E Pick up ·
// Q Open it · the Duluth pack", "E Get in · Q Shoulder it · the canoe", "E Lower · the barrel, hung". Nothing ever has
// a third key; a held action says "hold"; an action that can't be done now is dimmed and says why in its verb's place
// (the canoe's Q reads "Unload it first"). E does the first, Q the second, and nothing else: the camp's jobs are on the
// things themselves (nearby.js) and a card opens only where there is something to move or a choice to make (the
// fire's card, stream B's; the book's Here tab for a container or a pile on the ground). Pointed at nothing, E and Q
// do nothing of the dot's. There is no Q drop: things are put down from the book.
//
//   import { pointer } from './pointer.js';
//   pointer.attach({ camera, player, scene, renderer, hud, chase, outfitter, fishing, photo, dialogue })
//   pointer.register((ray, near) => [{ dist, miss?, target }]) -> off
//     ray   a THREE.Ray from the camera through the dot, the middle of the view (unit direction)
//     near  { x, y, z (the walker's feet), reach (m), flat(x, z) (m from the walker, level),
//             sphere(x, y, z, r), segment(ax, ay, az, bx, by, bz, r), box({ x, y, z, hx, hy, hz, heading }) }
//           each test -> { t (m along the ray), miss (0 dead on .. 1 at the edge) } or null
//     target { kind: 'item' | 'container' | 'pile' | 'person' | 'shelf' | 'board' | 'maptable' | 'counter' | 'canoe' |
//              'fire' | 'tent' | 'seat' | 'tree' | 'barrelHung' | 'water' | 'downLog' | …, ref, label,
//              e: { verb, run(opts), held?, why?, help? },  E: the primary (opts: { key: 'KeyE' }, for a held job)
//              q?: { verb, run(opts), held?, why?, help? }, Q: the secondary (opts: { key: 'KeyQ' })
//              (why: the verb can't be done now, dimmed with the reason in its place; the key then says why, and runs
//              help() if there is one: the canoe's "Unload it first" opens the book at the canoe, fb3 A. fb4 A, the
//              round's decision 2: a greyed verb also carries needs, [{ label, have?, need?, unit?, done?, timer? }],
//              the checklist the book and the cards draw, and next, the one thing to do now, which the key's note adds)
//              hint?, mesh? (a Mesh whose geometry takes the rim), shell? ({ geometry, matrix }: the rim on that),
//              box? (as near.box: with no mesh or shell, a soft pool of light on the ground under it instead) }
//            (an older provider's { verb, act, enabled, why } is read as e: { verb, run: act, why })
//   pointer.target          the thing pointed at now, or null
//   pointer.before()        main.js, before anyone reads E or Q: they act on the target (and are taken)
//   pointer.update(dt, shell) main.js, after the camera: the ray, the target, the dot, the rim
//   pointer.groundHit       where the ray meets the ground near the walker ({ x, y, z, t }), or null (the tent's ghost)
//   pointer.passStore       inside an outfitter's store with nothing pointed at, E is left to the store's own code
//                           (stream C turns it off once the store's hotspots are registered here)
//   pointer.isArmed         () => bool: a job waits for E or a click (nearby.js: the tent's ghost, the barrel's hang),
//                           so E and the mouse are left to it
//   pointer.seated          () => bool: sat down (stream C's player.seated): the label reads "E Stand up" and E is left
//                           to the walker (player.js stands him up); pointer.stand(): the fallback's stand-up
// The pick: of the candidates the ray passes, the one it passes nearest its middle (miss), the nearer on a tie. Within
// reach of the walker is each provider's to judge (near.flat, near.reach).
import * as THREE from 'three';
import * as ITEMS from './items.js'; // fb5 E: stream B's chipOf (the first missing thing), when it is there

export const REACH = 2.6;          // m from the walker within which a thing on the ground is pointed at and picked up
const RIM = 0.028;                 // m the rim stands off the thing's surface
const RIM_COL = 0xfff0cf, POOL_COL = 0xffe9bf; // the rim's and the pool's colour in full daylight
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
#crosshair .ch-lab .act { display: inline-flex; align-items: center; gap: 6px; }
#crosshair .ch-lab .act + .act { margin-left: 2px; }
#crosshair .ch-lab .act .hold { font-size: 11.5px; font-style: italic; color: rgba(243, 236, 221, .66); letter-spacing: .02em; }
#crosshair .ch-lab .act.off { color: rgba(243, 236, 221, .6); font-style: italic; }
#crosshair .ch-lab .act.off kbd { border-color: rgba(243, 236, 221, .4); color: rgba(243, 236, 221, .6); }
#crosshair .ch-lab .what { color: rgba(243, 236, 221, .78); }
#crosshair .ch-lab .chip { font-size: 13px; padding: 1px 8px 2px; border-radius: 9px; background: rgba(14, 27, 34, .5); color: rgba(243, 236, 221, .9); font-style: normal; } /* fb5 E: the one missing thing */
#crosshair.off .ch-lab { color: rgba(243, 236, 221, .7); font-style: italic; }
#air.nohints #crosshair .ch-lab kbd { display: none; }
`;
// an older provider's target ({ verb, act, enabled, why }) read as the two-key shape: e: { verb, run, why }
function normalize(t) {
  if (!t || t.e || typeof t.act !== 'function' && !t.verb) return t;
  const why = t.enabled === false ? (t.why || 'not now') : null;
  t.e = { verb: t.verb || 'Use', run: t.act || (() => {}), why, held: !!t.held };
  return t;
}
// one key's part of the label: the key and the verb, dimmed when it can't be done now (fb5 E: the one chip after the
// target says what is missing; the why is said when the key is pressed); a held one says so before its key, "hold E
// Push it off" (fb4 A: read as it is done, the word first)
function actHtml(key, a) {
  if (!a) return '';
  const off = !!a.why;
  return `<span class="act${off ? ' off' : ''}${a.held && !off ? ' held' : ''}">${a.held && !off ? '<span class="hold">hold</span>' : ''}<kbd>${key}</kbd><span>${esc(a.verb || a.why)}</span></span>`;
}
// fb5 E (the round's rule 3: "show only what's missing, as one short line or a chip"): the first missing thing of a
// greyed verb, as a chip: "🪵 ×2", "pole ×2", "water 0.3 L", "both hands are full". Stream B's items.chipOf when it is
// there (the book's menu and the cards read the same), else the same reading here: the first need not done (its own
// `chip` verbatim; a quantity's shortfall, a timer's time left, a step's words up to the first ':' or ','), else the
// why trimmed the same way.
const CHIP_MAX = 34;
const trimWords = (s) => { const t = String(s || '').split(/[:,;(]/)[0].trim().replace(/[.\s]+$/, ''); return /^(F|E|Q|I|M|H|V|Duluth|Johnson)\b/.test(t) ? t : t.charAt(0).toLowerCase() + t.slice(1); };
const countUnit = (u) => !u || /^(pieces?|poles?|logs?|branch(es)?|tablets?|leeches?|servings?)$/.test(u);
export function chipOf(needs, why = '') {
  if (typeof ITEMS.chipOf === 'function') { try { const c = ITEMS.chipOf(needs, why); if (typeof c === 'string') return c; } catch (e) { /* the reading below */ } }
  const list = Array.isArray(needs) ? needs : [];
  const n = list.find((q) => q && q.done !== true && !(Number.isFinite(q.have) && Number.isFinite(q.need) && q.have >= q.need - 1e-9));
  if (n) {
    if (typeof n.chip === 'string') return n.chip;
    const label = trimWords(n.label);
    if (Number.isFinite(n.timer) && n.timer > 0) return `${label} ${typeof ITEMS.timerWords === 'function' ? ITEMS.timerWords(n.timer) : `${Math.ceil(n.timer / 60)} min`}`;
    if (Number.isFinite(n.have) && Number.isFinite(n.need)) {
      const left = Math.round((n.need - n.have) * 10) / 10;
      return countUnit(n.unit) ? `${label} ×${left}` : `${label} ${left} ${n.unit}`;
    }
    if (label) return label;
  }
  return why ? trimWords(why) : '';
}
// a provider's old `hint` on the label, kept only when it is a few words of state ("used today", "2 in reach"), never an
// explanation (a clause after ':' or ',', a list after '·') or a rate (the owner: no percentages on the screen)
function briefHint(h) {
  const t = String(h || '').split(' · ')[0].trim();
  return t && t.length <= 26 && !/[:,%]/.test(t) ? t : '';
}
// a prompt line without its E (player.js say: "info &nbsp;·&nbsp; <kbd>E</kbd>Do this &nbsp; <kbd>Q</kbd>Do that"), or
// without its Q (stripKey: the dot's label has the key, so the line at the bottom loses it)
export function stripKey(text, key = 'E') {
  let s = String(text || '').replace(new RegExp(`<kbd>${key}</kbd>.*?(?=\\s*&nbsp;\\s*<kbd>|$)`, 'g'), '');
  s = s.replace(/(\s*&nbsp;\s*)+(?=\s*&nbsp;·&nbsp;)/g, '').replace(/&nbsp;·&nbsp;(\s*&nbsp;\s*)+/g, '&nbsp;·&nbsp; ');
  s = s.replace(/^(\s|&nbsp;|·)+/, '').replace(/(\s|&nbsp;|·)+$/, '');
  return s;
}
export const stripE = (text) => stripKey(text, 'E');
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
    this.seated = null; this.stand = null; // wc A: sat down (stream C's player.seated; nearby.js's fallback)
    this.on = false;
    this.attached = false;
    this.near = this.makeNear();
    // Esc stops an armed job (the tent's ghost, the barrel's hang) before the pause card hears it: a capture listener on
    // the window made when this module loads, so it comes before title.js's (made in main(), capture too)
    if (typeof window !== 'undefined') window.addEventListener('keydown', (e) => {
      if (e.code !== 'Escape' || !this.attached || !this.armed()) return;
      if (this.onCancel && this.onCancel('esc')) { e.preventDefault(); e.stopImmediatePropagation(); }
    }, true);
  }

  attach({ camera, player, scene, renderer = null, hud = null, chase = null, outfitter = null, fishing = null, photo = null, dialogue = null, day = null }) {
    Object.assign(this, { camera, player, scene, renderer, hud, chase, outfitter, fishing, photo, dialogue, day });
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
        cv.addEventListener('mousedown', (e) => { if (e.button === 0) { this.input.down.add('Mouse0'); this.input.once.add('Mouse0'); } else if (e.button === 2 && this.armed() && this.onCancel) this.onCancel('right'); }); // (a right-click stops an armed job, captured or not)
        cv.addEventListener('contextmenu', (e) => e.preventDefault()); // (no browser menu over the scene)
      }
      window.addEventListener('mouseup', (e) => { if (e.button === 0) this.input.down.delete('Mouse0'); });
      window.addEventListener('blur', () => this.input.down.delete('Mouse0'));
    }
    // the rim: one translucent material, its back faces pushed out along the normals, so only a soft edge shows round
    // the thing; always in the scene and drawn every frame (parked far under the world, never culled), so its program
    // is made behind the title card for the pass that really draws it (main.js's compile pass is the canvas's; the
    // scene is drawn into the post chain's target, a program apart)
    const mat = this.rimMat = new THREE.MeshBasicMaterial({ color: RIM_COL, transparent: true, opacity: 0.55, side: THREE.BackSide, depthWrite: false });
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
    // the pool of light under a thing known only by its box: one flat square, a radial fade (a small canvas as the
    // alpha), its own translucent material; parked under the world too
    const cv = document.createElement('canvas'); cv.width = cv.height = 64;
    const cx = cv.getContext('2d'), gr = cx.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, '#fff'); gr.addColorStop(0.55, '#b0b0b0'); gr.addColorStop(1, '#000');
    cx.fillStyle = gr; cx.fillRect(0, 0, 64, 64);
    const tex = new THREE.CanvasTexture(cv);
    this.glowMat = new THREE.MeshBasicMaterial({ color: POOL_COL, transparent: true, opacity: 0.42, alphaMap: tex, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    const pg = new THREE.PlaneGeometry(1, 1); pg.rotateX(-Math.PI / 2);
    this.glow = new THREE.Mesh(pg, this.glowMat);
    this.glow.name = 'pointer-pool'; this.glow.matrixAutoUpdate = false; this.glow.renderOrder = 4; this.glow.castShadow = false; this.glow.receiveShadow = false;
    this.park();
    scene.add(this.rim, this.glow);
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
    if (this.quiet && this.quiet()) return false; // nearby.js: a card up at camp (the wake-time card, the night, a fade)
    if (f && (f.rodUp || f.landed)) return false;
    return true;
  }
  inStore() { const o = this.outfitter; return !!(o && o.visit); }

  // before player.update and everyone else's E and Q: E does the target's first, Q its second (both taken). Pointed at
  // nothing, E does nothing (in a store, until stream C's hotspots are here, it is left to the store); Q is left to
  // travel (packs.js: leave the canoe where you stepped out, the fetch). Sat down, E is the walker's: it stands him up.
  before() {
    const inp = this.input;
    if (!this.usable()) return;
    // sat down: E stands you up (the fallback holds the input paused while you sit, so this comes before that)
    if (this.seated && this.seated()) { if (inp.once.has('KeyE') && this.stand) { inp.once.delete('KeyE'); this.stand(); } return; }
    if (inp.paused) return;
    if (this.armed()) return; // the ghost's E and click are its own (nearby.js)
    const e = inp.once.has('KeyE'), q = inp.once.has('KeyQ');
    if (!e && !q) return;
    const holdActive = typeof window !== 'undefined' && window.__game && window.__game.hold && window.__game.hold.active;
    if (holdActive) return;
    const t = this.target;
    if (t) {
      const a = e ? t.e : t.q, key = e ? 'KeyE' : 'KeyQ';
      if (!a) { if (e) inp.once.delete('KeyE'); return; }
      inp.once.delete(key);
      if (a.why) {
        // (fb4 A, decision 2: the reason; fb5 E: its next step is taught once, the first time the key is pressed on it,
        // as a moment (hints.js next), and after that the why alone)
        const why = String(a.why).replace(/^./, (c) => c.toUpperCase()); // (fb4 join: the label's lower-case why starts a sentence here)
        // (a verb whose key opens a paper, the canoe's "Unload it first" opening the book at the canoe, keeps its line
        // over the paper it opens)
        const taught = a.next && typeof this.teach === 'function' ? this.teach(`${t.kind}:${a.verb || a.why}`, a.next, { card: typeof a.help === 'function' }) : false;
        if (!taught && this.hud) this.hud.note(`${why.replace(/[.:]\s*$/, '')}.`, 3);
        if (typeof a.help === 'function') { try { a.help({ key, from: 'dot' }); } catch (err) { console.warn('pointer help', err); } }
        return;
      }
      try { a.run({ key, keys: [key, 'Mouse0'], from: 'dot' }); } catch (err) { console.warn('pointer act', err); }
      return;
    }
    if (!e) return;
    if (this.passStore && this.inStore()) return;
    inp.once.delete('KeyE');
  }

  // after the camera has moved: the ray through the dot, the candidates, the pick, the dot and the rim
  update(dt, shell = false) {
    const ok = this.usable(shell), p = this.player;
    this.on = ok;
    // fb3 A (the owner, 2026-10-25: "when i get in and paddle away, or pick up and walk away with the boat, the ghost
    // outline stays"): off the dot, the rim and the pool go too. The rim had kept the hull's geometry at the hull's
    // last matrix while you paddled or carried it away, a ghost of the canoe where it had lain.
    if (!ok) { this.setTarget(null); this.groundHit = null; this.show(false); this.park(); return; }
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
    if (this.seated && this.seated()) {
      // sat down: the one thing to do is get up (E, the walker's own; or the fallback's)
      this.setTarget(this.sitTarget || (this.sitTarget = { kind: 'seat', ref: 'seated', label: '', e: { verb: 'Stand up', run: () => { if (this.stand) this.stand(); } } }));
      this.groundHit = null; this.show(true); this.drawRim();
      return;
    }
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
    this.setTarget(best ? normalize(best.target) : null);
    this.groundHit = this.findGround();
    this.show(true);
    this.drawRim();
    // on foot the E is the dot's: a line at the bottom offering E for something you do not point at would lie, so it
    // keeps its words and loses the key (the store keeps its own until stream C has moved it here); and while the dot
    // offers a Q of its own, the line's Q goes too (the canoe's shoulder is on the label)
    const pr = p.prompt;
    if (pr && !pr.hold && !this.armed() && !(this.passStore && this.inStore())) {
      let q = pr.key === 'E' ? { ...pr, key: null } : pr;
      if (/<kbd>E<\/kbd>/.test(q.text || '')) q = { ...q, text: stripE(q.text) };
      if (this.target && this.target.q) { if (q.key === 'Q') q = { ...q, key: null }; if (/<kbd>Q<\/kbd>/.test(q.text || '')) q = { ...q, text: stripKey(q.text, 'Q') }; }
      if (q.canoeHint && this.target && this.target.kind === 'canoe') q = { ...q, text: '' }; // "point at the canoe" (packs.js): the dot is on it, the label has its keys
      // (fb5 join, rule 5: a line that says just what the dot's label says, "Pick up the paddle" under "E Pick up · the paddle", goes)
      if (q.text && this.target && this.target.e && this.target.e.verb && this.target.label && sameWords(q.text, `${this.target.e.verb} ${this.target.label}`)) q = { ...q, text: '' };
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
    const t = on ? this.target : null, e = t && t.e, q = t && t.q;
    el.classList.toggle('on', !!t);
    el.classList.toggle('off', !!(t && e && e.why && !(q && !q.why)));
    const chip = t ? this.chipFor(t) : '';
    const part = (a) => (a ? `${a.verb}|${a.why || ''}|${a.held ? 1 : 0}` : '');
    const sig = t ? `${part(e)}|${part(q)}|${t.label}|${chip}` : '';
    if (sig === this.sig) return;
    this.sig = sig;
    if (!t) { this.lab.innerHTML = ''; return; }
    // both keys, always, then the thing, then at most one chip of what is missing: "E Pick up · Q Open it · the Duluth
    // pack", "E Pick up · a dead branch · your hands are full", "E Fire ring · 🪵 ×2 more"
    this.lab.innerHTML = `${actHtml('E', e)}${actHtml('Q', q)}${t.label ? `<span class="what">· ${esc(t.label)}</span>` : ''}${chip ? `<span class="chip">${esc(chip)}</span>` : ''}`;
  }
  // fb5 E: the one chip on the label: the target's own (stream A's fire ring: "Gather wood", "🪵 ×2 more"), else what the
  // greyed verb is missing (E's before Q's), else a few words of state from an older provider's hint; '' for nothing
  chipFor(t) {
    if (typeof t.chip === 'string') return t.chip.length <= CHIP_MAX ? t.chip : trimWords(t.chip);
    const a = t.e && t.e.why ? t.e : t.q && t.q.why ? t.q : null;
    if (a) {
      // a count or a time from the needs ("pole ×2", "treating 28 min"); else the why when it is a short phrase
      // ("unload it first", "the bottle is full"); else the need's own words
      const n = (Array.isArray(a.needs) ? a.needs : []).find((q) => q && q.done !== true);
      const counted = n && (typeof n.chip === 'string' || (Number.isFinite(n.timer) && n.timer > 0) || (Number.isFinite(n.need) && countUnit(n.unit) && n.need > 1));
      const why = trimWords(a.why);
      let c = !counted && why.length <= 22 ? why : chipOf(a.needs, a.why);
      if (c.length > CHIP_MAX) c = why;
      return c.length > CHIP_MAX ? '' : c;
    }
    return briefHint(t.hint);
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
    const off = !!(t.e && t.e.why && !(t.q && !t.q.why));
    // a thing known only by its box (a shelf, a person, the latrine): a soft pool of light on the ground under it
    if (!geo && t.box) { this.parkRim(); this.pool(t.box, off); return; }
    this.parkPool();
    if (!geo || !geo.getAttribute('normal')) { this.parkRim(); return; }
    r.geometry = geo;
    r.matrixWorldNeedsUpdate = true; r.updateMatrixWorld(true);
    r.frustumCulled = false;
    const k = this.light();
    this.rimMat.color.setHex(RIM_COL).multiplyScalar(k);
    this.rimMat.opacity = (off ? 0.28 : 0.55) * (0.55 + 0.45 * k);
  }
  // the pool under a box target: its footprint and a little more, on its bottom (the floor, the ground at its feet)
  pool(b, off) {
    const g = this.glow;
    if (!g) return;
    const y = b.y - b.hy + 0.025;
    g.matrix.makeRotationY(b.heading || 0).multiply(_m.makeScale(b.hx * 2 + 0.7, 1, b.hz * 2 + 0.7)).setPosition(b.x, y, b.z);
    g.matrixWorldNeedsUpdate = true; g.updateMatrixWorld(true);
    g.frustumCulled = false;
    const k = this.light();
    this.glowMat.color.setHex(POOL_COL).multiplyScalar(k);
    this.glowMat.opacity = (off ? 0.22 : 0.42) * (0.55 + 0.45 * k);
  }
  // how lit the scene is (the rim and the pool are unlit: at night they dim with it, never a neon edge in the dark)
  light() { const d = this.day; if (!d || !Number.isFinite(d.elevation)) return 1; return Math.max(0.14, Math.min(1, (d.elevation + 5) / 11)); }
  parkRim() { const r = this.rim; if (!r) return; r.geometry = this.parkGeo; r.matrix.makeTranslation(0, -1e4, 0); r.matrixWorldNeedsUpdate = true; r.updateMatrixWorld(true); r.frustumCulled = false; }
  parkPool() { const g = this.glow; if (!g) return; g.matrix.makeTranslation(0, -1e4, 0); g.matrixWorldNeedsUpdate = true; g.updateMatrixWorld(true); g.frustumCulled = false; }
  park() { this.parkRim(); this.parkPool(); }
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
      out.push({ dist: hit.t, miss: hit.miss * 0.9, target: { kind: 'person', ref: v.key, label: name, e: { verb: 'Talk', run: () => people.talkTo(v) }, hint: v.who && !v.keeper ? v.who : null, box: { x: f.x, y: (top + bot) / 2, z: f.z, hx: 0.3, hy: (top - bot) / 2, hz: 0.3, heading: f.heading || 0 } } });
    }
    return out;
  };
}
// The berries and mushrooms (forage.js): a ripe patch pointed at within its reach is "E Pick" (a lookalike "E Look")
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
      // (fb4 A, decision 2: stream C's pickCheck when it is there: { enabled, why, needs, next })
      let pc = null;
      if (!look && typeof forage.pickCheck === 'function') { try { pc = forage.pickCheck(q); } catch (e) { pc = null; } }
      const why = look ? null : pc ? (pc.enabled === true ? null : pc.why || (pc.enabled === false ? 'picked for today' : null)) : left > 0 ? null : 'picked for today';
      out.push({ dist: hit.t, miss: hit.miss, target: { kind: 'item', ref: q.key, label: s.name || s.short, e: { verb: look ? 'Look' : (s.pick && s.pick.verb) || 'Pick', why, needs: pc && pc.needs ? pc.needs : null, next: pc && pc.next ? pc.next : null, run: () => forage.start(q) }, mesh: q.mesh } });
    }
    return out;
  };
}
const sameWords = (a, b) => String(a).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().toLowerCase() === String(b).replace(/\s+/g, ' ').trim().toLowerCase();
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
      out.push({ dist: hit.t, miss: hit.miss, target: { kind: 'item', ref: `task:${t.id}`, label: `the ${t.label}`, e: { verb: 'Pick up', run: () => KINDS[t.kind].use(tasks, t) }, mesh: m.isMesh ? m : null } });
    }
    return out;
  };
}
void _w; void _m;
