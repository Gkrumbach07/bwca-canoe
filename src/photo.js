import * as THREE from 'three';
import { registerKind, KINDS, siteFeature, lakeNearGrid } from './tasks.js';
import { esc, word } from './hud.js';
import { monthDay } from './astro.js';
import { save } from './save.js';

// The camera and the photo notices (hubs phase 3, stream B). The owner: "need nature photos, need a picture of a bird
// for magazine", "take a really cool picture of a moose".
//
// C raises the camera when you own one (the $25 35 mm on the shelves, shop.js 'camera') or have the disposable the
// first photo notice of a season lends you (three pictures). The view goes to the eye through a normal lens, under a
// thin Air frame that marks the print's 16:9; the mouse aims (or the arrows and WASD, Shift for a fine hand), the wheel
// (or Q and E held) zooms out to a long lens (LENS: 50 to 300 mm on 35 mm film, the print cut across the frame's width),
// Space or a click takes the picture, C or Esc lowers it. While it is up the paddle and the feet rest and the pace is
// life's (pace.js 'life': no time-lapse, not even the floor of twice life both paces keep, and the clock 1:1), at 1×.
//
// A subject counts when it is near the middle of the print (within ZONE of the half field of view as the lens is set
// at the moment, an ellipse on the 16:9: zoomed in, the middle narrows with it), close enough (REACH: a moose 120 m, a beaver or a loon 60 m, a gull or a raven 30 m) and not hidden by the
// land (world.heightAt sampled along the line of sight). The animals come from fauna.subjects(); places (an island
// campsite, the far end of a long portage, a sunset over a named lake) count by where you stand and which way you face.
//
// Each picture is kept as a small print (PRINT, a JPEG cut from the frame as drawn), 24 at most, the oldest going first:
// the image in IndexedDB (localStorage when that is refused), the list in the `photos` save. The journal's Photos tab
// shows them with a caption ("A bull moose, Hudson Lake, July 14, dawn"). A picture that fits a photo notice on the go
// marks that notice done (the best paying first, one notice a picture), and the notice is claimed at the outfitter that
// posted it, as every notice is (tasks.js).
//
//   const photo = new PhotoCamera({ world, player, chase, camera, renderer, fauna, day, hud, tasks, outfitter, profile, audio, veil, fishing, camp });
//   photo.before(dt)    // in the frame, first: the keys while it is up (main.js)
//   photo.afterDraw()   // after the frame is drawn: a picture taken this frame is cut from the canvas
//   photo.raise() / lower() / shoot(); photo.raised; photo.prints(); photo.survey() (what the frame holds now)

const ZONE = 0.6;                 // of the half field of view, from the middle: where a subject counts
// the lens: its focal length in mm on 35 mm film (36 mm across), the print cut across the frame's width; a normal lens
// to begin with, zoomed with the wheel (or Q / E held) to a long one, where a moose at 40 m stands most of the print high
const LENS = { film: 36, normal: 50, long: 300, wheel: 0.0015, keys: 1.4 }; // wheel: per pixel of scroll; keys: per second
const ASPECT = 16 / 9;            // the print
const PRINT = { w: 240, h: 135 }; // px
const KEEP = 24;                  // prints kept
const DISPOSABLE = 3;             // pictures on the lent disposable
const REACH = { moose: 120, beaver: 60, loon: 60, eagle: 60, gull: 30, raven: 30 }; // metres within which each counts
const BIRDS = new Set(['loon', 'eagle', 'gull', 'raven']);
const VALUE = { moose: 6, beaver: 4, eagle: 3, loon: 2, gull: 1, raven: 1 }; // which subject a print is of, when several count
const AIM = { yaw: 0.55, pitch: 0.38, fine: 0.3 }; // rad/s with the keys; Shift: × fine
const WIND = { film: 0.7, disposable: 1.1 };        // seconds before the next picture (the lever, the thumbwheel)
// keys the paddle and the feet do not get while the camera is up (the aim reads them itself)
const STILL = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight', 'Space', 'KeyQ', 'KeyE']);
const PAY = { bird: 10, loon: 12, eagle: 12, beaver: 15, moose: 35, place: 12 };
const PLACE_KM = 1.5, PAY_MAX = 60;    // a place is paid for the way out as a lost item is (tasks.js KM_PAY)
const HOPS = { local: [0, 1], medium: [1, 2], far: [2, 4] };
const RANGE = 14000;                   // metres from the landing a place notice may send you
// the months of each subject (day of the year), as fauna.js and loons.js keep them
const SEASON = { bird: [100, 304], loon: [122, 300], eagle: [95, 325], beaver: [110, 315], moose: [140, 300] };

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const dateOf = (year, doy) => { const { month, day } = monthDay(year, doy); return `${MONTHS[month]} ${day}`; }; // "July 14"
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const pickR = (rng, list) => (list.length ? list[Math.floor(rng() * list.length)] : null);
const hopsText = (h) => (h == null ? '' : h === 0 ? ', right off this landing' : h === 1 ? ', one portage in' : `, ${word(h)} portages in`);
const kmFrom = (L, x, z) => +(Math.hypot(x - L.x, z - L.z) / 1000).toFixed(1);
const labelOf = (s) => (s.kind === 'moose' ? (s.calf ? 'a moose calf' : s.bull ? 'a bull moose' : 'a cow moose')
  : { beaver: 'a beaver', loon: 'a loon', eagle: 'a bald eagle', gull: 'a herring gull', raven: 'a raven' }[s.kind] || 'something');

// --- the notices ----------------------------------------------------------------------------------------------------
// [what it says, who signed it]
const WANTS = {
  bird: { titles: ['Nature photos wanted', 'A bird for the magazine'], texts: [
    ['Need nature photos for the magazine: a picture of a bird, any bird, close and sharp. Bring me the print.', 'the magazine, by letter'],
    ['The Echo’s nature page wants a bird from up here. Any kind, so long as it fills the frame.', 'the Ely Echo'],
    ['A bird for the board by the door. Loon, gull or eagle: close enough to tell which.', 'the counter']] },
  loon: { titles: ['A loon for the cover'], texts: [
    ['A loon on the water for the summer cover. Close and sharp. They fish the open water off the points.', 'the Boundary Waters Journal'],
    ['A loon for the postcard rack, close enough to see the necklace.', 'the front desk']] },
  eagle: { titles: ['An eagle for the calendar'], texts: [
    ['A bald eagle for the county calendar, on a snag or over the water, big in the frame.', 'the county calendar'],
    ['The visitor centre wants an eagle on its wall. They sit the tall pines out on the points.', 'the ranger station']] },
  beaver: { titles: ['A beaver, on film'], texts: [
    ['A beaver swimming, for the kids’ nature table. They come out by their lodges in the quiet bays at dawn and dusk.', 'Mrs. Halvorsen, the school'],
    ['A picture of a beaver for the visitor centre’s board. A still bay at dusk, and sit quiet.', 'the ranger station']] },
  moose: { titles: ['A really good moose', 'Moose, close'], texts: [
    ['Take a really good picture of a moose for the fall issue: close, in good light, not hiding in the trees. They stand in the sheltered bays at dawn and dusk. Pays well.', 'the magazine, by letter'],
    ['A moose for over the fireplace. A good one, close, standing in the water if you can.', 'Arnie, behind the counter']] },
};
const WANT_WORDS = { bird: 'a bird', loon: 'a loon', eagle: 'a bald eagle', beaver: 'a beaver', moose: 'a moose' };
const inSeason = (want, doy) => { const s = SEASON[want]; return !s || (doy >= s[0] && doy <= s[1]); };
function animalNotice(want, c) {
  const W = WANTS[want], [text, sign] = pickR(c.rng, W.texts);
  return { want, key: want, title: pickR(c.rng, W.titles), text, sign };
}
// a place: an island campsite seen from the water, the view off the far landing of a long portage, or a sunset over
// a named lake, a band's portages in
async function placeNotice(T, c) {
  const w = T.world, L = c.landing, [h0, h1] = HOPS[c.band];
  const hopsOf = (lakeId) => { const r = c.reach.get(T.basinOf(lakeId)); return r ? r.hops : null; };
  const inBand = (h) => h != null && h >= h0 && h <= h1;
  const tries = c.rng() < 0.4 ? ['island', 'trail', 'sunset'] : c.rng() < 0.5 ? ['trail', 'sunset', 'island'] : ['sunset', 'island', 'trail'];
  for (const type of tries) {
    if (type === 'island') {
      const cands = [];
      w.campsites.forEach((s, i) => {
        const d = Math.hypot(s.x - L.x, s.z - L.z);
        if (d > RANGE || T.used('photo', `island:${i}`)) return;
        const h = hopsOf(T.lakeNear(s.x, s.z));
        if (inBand(h)) cands.push({ s, i, d, h });
      });
      const pool = (c.band === 'far' ? cands.sort((a, b) => b.h - a.h || a.d - b.d) : cands.sort((a, b) => a.d - b.d)).slice(0, 18);
      for (let k = 0; k < 6 && pool.length; k++) {
        const cand = pool.splice(Math.floor(c.rng() * pool.length), 1)[0];
        const tg = await T.peek(cand.s.x, cand.s.z);
        if (!tg || siteFeature(tg, cand.s.x, cand.s.z) !== 'island') continue;
        const lakeId = lakeNearGrid(tg, cand.s.x, cand.s.z, 8), name = T.lakeName(lakeId);
        if (!name) continue;
        return { want: 'place', key: `island:${cand.i}`, target: { type: 'island', x: cand.s.x, z: cand.s.z, lake: lakeId, name }, hops: cand.h, km: kmFrom(L, cand.s.x, cand.s.z),
          title: 'The island site', text: `A picture of the island campsite on ${name}${hopsText(cand.h)}, taken from the water: the rock, the pines, the landing. For the cover of the new map sheet.`,
          sign: c.rng() < 0.5 ? 'the Fisher map people' : 'the map counter', hint: T.hintFor(lakeId, cand.s) };
      }
    } else if (type === 'trail') {
      let cands = [];
      w.portages.forEach((p, i) => {
        if (p.rods < 60 || T.used('photo', `trail:${i}`)) return;
        if (Math.hypot(p.pts[0][0] - L.x, p.pts[0][1] - L.z) > RANGE) return;
        const ha = hopsOf(p.launch[0].lake), hb = hopsOf(p.launch[1].lake);
        if (ha == null && hb == null) return;
        const near = (ha ?? 99) <= (hb ?? 99) ? 0 : 1, h = Math.min(ha ?? 99, hb ?? 99);
        if (!inBand(h)) return;
        const toName = T.lakeName(p.launch[1 - near].lake), fromName = T.lakeName(p.launch[near].lake);
        if (!toName || toName === fromName) return;
        cands.push({ p, i, near, h, toName, fromName, d: Math.hypot(p.pts[0][0] - L.x, p.pts[0][1] - L.z) });
      });
      if (!cands.length) continue;
      if (c.band === 'far' && cands.some((x) => x.p.rods >= 120)) cands = cands.filter((x) => x.p.rods >= 120);
      const cand = pickR(c.rng, cands.sort((a, b) => (c.band === 'far' ? b.p.rods - a.p.rods : a.d - b.d)).slice(0, 8));
      const far = cand.p.launch[1 - cand.near];
      return { want: 'place', key: `trail:${cand.i}`, target: { type: 'trail', x: far.x, z: far.z, lake: far.lake, name: cand.toName, rods: cand.p.rods }, hops: cand.h, km: kmFrom(L, far.x, far.z),
        title: 'The view from the far end', text: `Carry the ${cand.p.rods}-rod portage ${cand.fromName ? `from ${cand.fromName} ` : ''}to ${cand.toName}${hopsText(cand.h)}, and from its far landing take a picture out over ${cand.toName}. For the trail guide’s cover.`,
        sign: 'the trail guide', hint: T.hintFor(far.lake, far) };
    } else {
      const cands = [];
      for (const l of w.lakes) {
        if (!l || !l.name || l.cells < 1500 || T.used('photo', `sunset:${l.id}`)) continue;
        const d = Math.hypot(l.cx - L.x, l.cz - L.z);
        if (d > RANGE) continue;
        const h = hopsOf(l.id);
        if (inBand(h)) cands.push({ l, d, h });
      }
      if (!cands.length) continue;
      const cand = pickR(c.rng, cands.sort((a, b) => a.d - b.d).slice(0, 8)), name = cand.l.name;
      return { want: 'place', key: `sunset:${cand.l.id}`, target: { type: 'sunset', lake: cand.l.id, name }, hops: cand.h, km: kmFrom(L, cand.l.cx, cand.l.cz),
        title: `Sunset on ${name}`, text: `A sunset over ${name}${hopsText(cand.h)}, with the sun in the picture, for next year’s calendar. Face it from the water as it goes down.`,
        sign: 'the lodge calendar', hint: T.hintFor(cand.l.id) };
    }
  }
  return null;
}

let active = null; // the camera (one per page): the kind's update lends the disposable through it
registerKind('photo', {
  label: 'Photo wanted', weight: { local: 0.6, medium: 0.75, far: 0.65 }, // about one notice in five, before each outfitter's lean
  async make(T, c) {
    const doy = T.day ? T.day.doy : 190;
    const held = new Set(c.board.map((t) => t && t.kind === 'photo' && t.want).filter(Boolean)); // not two alike on a board
    const lists = { local: ['bird', 'loon', 'beaver', 'place'], medium: ['beaver', 'eagle', 'place', 'moose', 'loon'], far: ['moose', 'place', 'eagle'] };
    const order = lists[c.band] || lists.local;
    // the band's own order, shuffled a little: the first pick is the likeliest
    for (let i = order.length - 1; i > 0; i--) if (c.rng() < 0.45) { const j = Math.floor(c.rng() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
    for (const want of order) {
      if (held.has(want)) continue;
      if (want === 'place') { const f = await placeNotice(T, c); if (f) return f; continue; }
      if (inSeason(want, doy)) return animalNotice(want, c);
    }
    return null;
  },
  pay(t) { return t.want === 'place' ? Math.min(PAY_MAX, PAY.place + Math.round(PLACE_KM * (t.km || 0))) : PAY[t.want] || PAY.bird; },
  // taken on: the first photo notice of a season taken without a camera lends the disposable
  update(T, t) { if (t.lendSeen) return; t.lendSeen = true; if (active) active.lendFor(t); },
  progress(t) { return t.want === 'place' ? 'no picture yet' : `no picture of ${WANT_WORDS[t.want] || 'it'} yet`; },
  // a picture (photo.js survey) fits this notice: what it wants counted in it
  matches(t, look) {
    if (t.status !== 'open') return false;
    if (t.want === 'place') return look.places.includes(t.id);
    if (t.want === 'bird') return look.counts.some((s) => BIRDS.has(s.kind));
    return look.counts.some((s) => s.kind === t.want);
  },
});

// --- the prints: the images in IndexedDB, else localStorage ----------------------------------------------------------
const DB = 'bwca-canoe-photos', STORE = 'prints', LS = 'photo-prints';
class Prints {
  constructor() { this.db = null; this.failed = false; }
  open() {
    if (this.db || this.failed) return Promise.resolve(this.db);
    return new Promise((res) => {
      try {
        const r = indexedDB.open(DB, 1);
        r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains(STORE)) r.result.createObjectStore(STORE); };
        r.onsuccess = () => { this.db = r.result; res(this.db); };
        r.onerror = () => { this.failed = true; res(null); };
      } catch { this.failed = true; res(null); }
    });
  }
  async op(mode, fn) {
    const db = await this.open();
    if (!db) return undefined;
    return new Promise((res) => {
      try {
        const tx = db.transaction(STORE, mode), st = tx.objectStore(STORE), q = fn(st);
        tx.oncomplete = () => res(q && 'result' in q ? q.result : true);
        tx.onerror = tx.onabort = () => res(undefined);
      } catch { res(undefined); }
    });
  }
  async put(id, data) {
    if ((await this.op('readwrite', (s) => s.put(data, id))) !== undefined) return true;
    const m = save.read(LS, {}) || {}; m[id] = data; return save.write(LS, m);
  }
  async get(id) {
    const v = await this.op('readonly', (s) => s.get(id));
    if (v) return v;
    const m = save.read(LS, null); return m ? m[id] || null : null;
  }
  async del(id) {
    await this.op('readwrite', (s) => s.delete(id));
    const m = save.read(LS, null); if (m && m[id]) { delete m[id]; save.write(LS, m); }
  }
}
function blobOf(dataUrl) {
  const [head, b64] = String(dataUrl).split(','), mime = (/data:([^;]+)/.exec(head) || [])[1] || 'image/jpeg';
  const bin = atob(b64 || ''), u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return new Blob([u8], { type: mime });
}

// --- the camera ---------------------------------------------------------------------------------------------------
const _inv = new THREE.Matrix4(), _eye = new THREE.Vector3(), _q = new THREE.Vector3(), _dir = new THREE.Vector3();

export class PhotoCamera {
  constructor({ world, player, chase, camera, renderer, fauna = null, day = null, hud = null, tasks = null, outfitter = null, profile = null, audio = null, veil = null, fishing = null, camp = null }) {
    Object.assign(this, { world, player, chase, camera, renderer, fauna, day, hud, tasks, outfitter, profile, audio, veil, fishing, camp });
    this.raised = false; this.prev = null; this.baseFov = 72; this.focal = LENS.normal;
    this.pending = false; this.wind = 0; this.clicked = false; this.hadLock = false; this.lowerIn = 0;
    this.look = { counts: [], far: [], edge: [], places: [] }; this.lookT = 0; this.sayKey = '';
    this.version = 0;       // bumps when a print comes or goes (the journal re-renders)
    this.urls = new Map();  // print id -> an object URL for its image
    this.store = new Prints();
    const s = save.read('photos', null);
    this.state = { v: 1, nextId: 1, disposable: 0, lentEver: false, hinted: false, list: [], ...(s && s.v === 1 ? s : {}) };
    if (!Array.isArray(this.state.list)) this.state.list = [];
    active = this;
    injectCss();
    this.buildFrame();
    this.loadImages();
    // a new season takes back the disposable (the next photo notice lends one again); a camera bought says its key
    if (profile && typeof profile.onChange === 'function') profile.onChange((what) => {
      if (what === 'season') { this.state.disposable = 0; this.state.lentEver = false; this.state.hinted = false; this.write(); }
      else if (what === 'gear' && this.owned && !this.state.hinted) this.hint();
    });
    // the paddle and the feet rest while the camera is up: the keys they read are held back from them
    const inp = player.input, held = inp.held.bind(inp);
    inp.held = (...codes) => (this.raised ? held(...codes.filter((c) => !STILL.has(c))) : held(...codes));
    // C raises and lowers; Esc lowers (ahead of the pause card, whose listener is registered after this one)
    window.addEventListener('keydown', (e) => {
      const tag = e.target && e.target.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      if (e.code === 'Escape' && this.raised) { e.preventDefault(); e.stopImmediatePropagation(); this.lower(); return; }
      if (e.code !== 'KeyC' || e.repeat) return;
      if (this.raised) { this.lower(); return; }
      const why = this.cannot();
      if (why === null) this.raise(); else if (why) this.note(why, 5);
    }, true);
    // pointer lock let go (Esc, while it held the mouse) lowers it too; a click with the mouse held takes the picture
    document.addEventListener('pointerlockchange', () => {
      const locked = document.pointerLockElement === renderer.domElement;
      if (!this.raised) return;
      if (locked) this.hadLock = true; else if (this.hadLock) this.lower();
    });
    renderer.domElement.addEventListener('pointerdown', (e) => { if (this.raised && e.button === 0 && chase.locked) this.clicked = true; });
    // the wheel turns the zoom ring while it is up (ahead of the chase camera's own wheel, which sets its distance)
    window.addEventListener('wheel', (e) => {
      if (!this.raised) return;
      e.preventDefault(); e.stopImmediatePropagation();
      const px = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * 400 : e.deltaY;
      this.zoom(Math.exp(-px * LENS.wheel));
    }, { capture: true, passive: false });
    window.addEventListener('resize', () => { if (this.raised) this.placeFrame(); });
    // the page going away lowers it first, so the trip's spot is saved with the view it had (save.js reads chase.mode)
    window.addEventListener('pagehide', () => this.lower());
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') this.lower(); });
  }

  // --- what you have -------------------------------------------------------------------------------------------
  get owned() { const pr = this.profile; return !!((pr && typeof pr.has === 'function' && pr.has('camera')) || (this.player.gear && this.player.gear.camera)); }
  get film() { return this.owned ? '35mm' : this.state.disposable > 0 ? 'disposable' : null; }
  get shotsLeft() { return this.owned ? Infinity : this.state.disposable; }
  note(t, s = 5) { if (t && this.hud) this.hud.note(t, s); }
  write() { save.write('photos', this.state); }
  hint() { this.state.hinted = true; this.write(); this.note('C raises the camera, the wheel zooms, Space takes the picture, and C or Esc lowers it.', 7); }
  get noCamera() {
    return this.state.lentEver ? 'The disposable is used up. A 35 mm camera is $25 on the shelves at any outfitter.'
      : 'No camera. A 35 mm is $25 on the shelves at any outfitter, and a photo notice comes with a disposable on loan.';
  }
  // the keeper lends the disposable for the first photo notice of the season taken on without a camera
  lendFor(t) {
    if (this.owned || this.state.lentEver) return;
    this.state.lentEver = true; this.state.disposable = DISPOSABLE; this.state.hinted = true; this.write();
    const o = this.outfitter, shop = o && o.shop, who = shop && typeof shop.keeperName === 'function' ? shop.keeperName(t.from) : null;
    const words = 'No camera? Take this disposable. Three pictures on it: bring me back the one I asked for, and buy yourself a real one when you can.';
    if (o && o.open && o.at && o.at.ep === t.from) { o.greeting = words; o.render(); }
    this.note(`${who || 'The keeper'} lends you a disposable camera: three pictures. C raises it, the wheel zooms, Space takes the picture.`, 8);
  }

  // --- up and down ---------------------------------------------------------------------------------------------
  // why the camera cannot come up now: null when it can; '' when the moment is not the camera's (say nothing)
  cannot() {
    const p = this.player, h = this.hud, c = this.chase;
    if (document.body.classList.contains('shell-open') || (h && (h.paperOpen || h.big || h.pin))) return '';
    if (p.input.paused || p.teleporting || p.landing || p.ashore || c.focus || (this.veil && this.veil.active) || (this.camp && this.camp.busy)) return '';
    if (p.mode === 'swim') return '';
    if (!this.film) return this.noCamera;
    if (this.fishing && this.fishing.rodUp) return 'Lay the rod down first (F).';
    if (p.mode === 'carry') return 'Set the canoe down first.';
    return null;
  }
  raise() {
    if (this.raised) return false;
    const c = this.chase, cam = this.camera, p = this.player;
    cam.getWorldDirection(_dir);
    const first = c.mode === 'first';
    this.prev = { mode: c.mode, sens: c.sensitivity, pace: p.pace, pmode: p.mode };
    if (!first) c.setMode('first');
    this.baseFov = cam.fov;
    if (!first) { const yaw = Math.atan2(-_dir.z, _dir.x); c.viewYaw = yaw; c.forwardYaw = yaw; c.viewPitch = 0; c.first = false; } // up to the eye where the view was
    this.lens();
    p.pace = 'life'; p.boost = 1; // life (pace.js 'life'): no time-lapse; the clock 1:1
    this.raised = true; this.hadLock = c.locked; this.wind = 0.25; this.pending = false; this.lookT = 0; this.sayKey = '';
    document.body.classList.add('photo-up');
    this.placeFrame(); this.paintFrame();
    this.el.classList.add('show');
    return true;
  }
  lower() {
    if (!this.raised) return false;
    const c = this.chase, cam = this.camera, p = this.player, pr = this.prev || {};
    this.raised = false; this.pending = false; this.lowerIn = 0;
    if (pr.mode && pr.mode !== 'first') c.setMode(pr.mode);
    else { cam.fov = this.baseFov; cam.updateProjectionMatrix(); }
    c.sensitivity = pr.sens || c.sensitivity;
    if (pr.pace) p.pace = pr.pace;
    document.body.classList.remove('photo-up');
    this.el.classList.remove('show');
    return true;
  }
  shoot() { if (!this.raised || this.wind > 0 || this.pending) return false; this.pending = true; return true; }
  // the zoom ring: the focal length times k, between the normal lens and the long one
  zoom(k) { this.focal = Math.max(LENS.normal, Math.min(LENS.long, this.focal * k)); this.sayKey = ''; return this.focal; }
  // the field of view (vertical, degrees, the eye's camera) that gives the lens its print: the print's half width over
  // the focal length is the tangent of its half angle across, and the print is the canvas's width, or its height × 16:9
  fovFor(focal = this.focal) {
    const tanH = LENS.film / 2 / focal, A = this.camera.aspect || ASPECT;
    return THREE.MathUtils.radToDeg(2 * Math.atan(tanH / Math.min(A, ASPECT)));
  }
  // the look goes as far round for a mouse's move or a key's hold as the view is wide (the eye's own at 72°)
  lens() { const c = this.chase, k = this.camera.fov / this.baseFov; c.sensitivity = ((this.prev && this.prev.sens) || 1) * k; return k; }

  // --- the frame -----------------------------------------------------------------------------------------------
  // in the frame, first (before anything reads E or Space): what takes the camera down, the keys it keeps, the aim,
  // the shutter, and the line saying what the frame holds
  before(dt) {
    this.tickPrint(dt);
    if (!this.raised) return;
    const p = this.player, inp = p.input, c = this.chase, h = this.hud;
    if (this.lowerIn > 0 && (this.lowerIn -= dt) <= 0) { this.lower(); return; }
    if (document.body.classList.contains('shell-open') || (h && (h.paperOpen || h.big || h.pin)) || inp.paused || p.teleporting || c.mode !== 'first' || c.focus
      || (this.veil && this.veil.active) || (this.camp && this.camp.busy) || (this.fishing && this.fishing.rodUp) || p.mode !== this.prev.pmode) { this.lower(); return; }
    // the camera's hands are full (and the arrows aim it: at the tent ← → would open the wake-time card, chores.js)
    for (const k of ['KeyE', 'KeyQ', 'KeyF', 'KeyK', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']) inp.once.delete(k);
    if (p.pace !== 'life') { this.prev.pace = p.pace; p.pace = 'life'; } // a setting changed meanwhile is kept for the lowering
    // the zoom ring held (Q out, E in), and the lens comes round to it over a quarter second
    const d = inp.down, zk = (d.has('KeyE') ? 1 : 0) - (d.has('KeyQ') ? 1 : 0);
    if (zk) this.zoom(Math.exp(zk * LENS.keys * dt));
    const want = this.fovFor(), cam = this.camera;
    if (Math.abs(cam.fov - want) > 0.01) { cam.fov += (want - cam.fov) * (1 - Math.exp(-dt * 14)); if (Math.abs(cam.fov - want) < 0.02) cam.fov = want; cam.updateProjectionMatrix(); }
    const wide = this.lens(); // the mouse, and the keys below, turn the view in step with how wide it is
    // the aim with the keys: A D or ← → turn, W S or ↑ ↓ tilt, Shift for a fine hand
    const k = (d.has('ShiftLeft') || d.has('ShiftRight') ? AIM.fine : 1) * wide * 2;
    const yawIn = (d.has('KeyA') || d.has('ArrowLeft') ? 1 : 0) - (d.has('KeyD') || d.has('ArrowRight') ? 1 : 0);
    const pitchIn = (d.has('KeyW') || d.has('ArrowUp') ? 1 : 0) - (d.has('KeyS') || d.has('ArrowDown') ? 1 : 0);
    if (yawIn || pitchIn) {
      c.viewYaw += yawIn * AIM.yaw * k * dt; c.forwardYaw = c.viewYaw;
      c.viewPitch = Math.max(-1.2, Math.min(1.2, c.viewPitch + pitchIn * AIM.pitch * k * dt));
    }
    if (this.wind > 0) this.wind -= dt;
    const press = inp.pressed('Space') || this.clicked;
    this.clicked = false;
    if (press && this.shotsLeft > 0) this.shoot();
    if ((this.lookT -= dt) <= 0) { this.lookT = 0.15; this.look = this.survey(); this.paintFrame(); }
  }
  // after the frame is drawn: the picture is the frame as drawn (the canvas is read in the same task as the draw)
  afterDraw() {
    if (this.raised && document.body.classList.contains('shell-open')) this.lower();
    if (!this.pending) return;
    this.pending = false;
    try { this.capture(); } catch (e) { console.warn('the camera', e); }
  }

  // the print's 16:9 from the middle of the view: tangents of its half angles, and its share of the canvas
  geom() {
    const cam = this.camera, tanV = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)), A = cam.aspect || 1;
    return A >= ASPECT ? { tanV, tanH: tanV * ASPECT, cw: ASPECT / A, ch: 1 } : { tanH: tanV * A, tanV: (tanV * A) / ASPECT, cw: 1, ch: A / ASPECT };
  }
  // whether the land hides p from the eye: world.heightAt along the line of sight, clear of the first and last metre
  clear(eye, p) {
    const w = this.world, dx = p.x - eye.x, dy = p.y - eye.y, dz = p.z - eye.z, L = Math.hypot(dx, dy, dz);
    const n = Math.min(90, Math.max(8, Math.ceil(L / 2)));
    for (let i = 1; i < n; i++) {
      const t = i / n, s = t * L;
      if (s < 1.2 || L - s < 1.5) continue;
      if (w.heightAt(eye.x + dx * t, eye.z + dz * t) > eye.y + dy * t + 0.1) return false;
    }
    return true;
  }
  // a point in the print: { u, v } across its half width and height (|u|, |v| <= 1 inside), or null behind the eye
  inPrint(x, y, z, g) {
    const q = _q.set(x, y, z).applyMatrix4(_inv);
    if (q.z > -0.3) return null;
    return { u: q.x / -q.z / g.tanH, v: q.y / -q.z / g.tanV };
  }
  // What the frame holds now: the subjects that count (near the middle, near enough, in sight), those too far, those
  // off to the side, and the place notices on the go that this view would do.
  survey() {
    const cam = this.camera, out = { counts: [], far: [], edge: [], places: [] };
    cam.updateMatrixWorld();
    _inv.copy(cam.matrixWorld).invert();
    const eye = _eye.setFromMatrixPosition(cam.matrixWorld), g = this.geom(), f = this.fauna;
    const list = f && typeof f.subjects === 'function' ? f.subjects() : [];
    for (const s of list) {
      const r = REACH[s.kind];
      if (!r) continue;
      const d = Math.hypot(s.x - eye.x, s.y - eye.y, s.z - eye.z);
      if (d > r * 3) continue;
      const at = this.inPrint(s.x, s.y, s.z, g);
      if (!at || Math.abs(at.u) > 1 || Math.abs(at.v) > 1) continue;
      if (!this.clear(eye, s)) continue; // behind a ridge, a point, an island
      const e = { kind: s.kind, bull: !!s.bull, calf: !!s.calf, x: s.x, y: s.y, z: s.z, d, u: at.u, v: at.v, label: labelOf(s) };
      const mid = at.u * at.u + at.v * at.v <= ZONE * ZONE;
      if (mid && d <= r) out.counts.push(e); else if (mid) out.far.push(e); else if (d <= r) out.edge.push(e);
    }
    const rank = (s) => (VALUE[s.kind] || 0) + (s.bull ? 0.5 : 0) - (s.calf ? 0.5 : 0); // a bull before a cow before a calf
    out.counts.sort((a, b) => rank(b) - rank(a) || a.d - b.d);
    out.far.sort((a, b) => a.d - b.d); out.edge.sort((a, b) => a.d - b.d);
    for (const t of this.onTheGo()) if (t.want === 'place' && t.target && this.placeFits(t.target, eye, g)) out.places.push(t.id);
    return out;
  }
  onTheGo() { const ts = this.tasks; return ts ? ts.active.filter((t) => t.kind === 'photo' && t.status === 'open') : []; }
  // a place counts by where you stand and which way you face
  placeFits(T, eye, g) {
    const w = this.world, cam = this.camera;
    if (T.type === 'island') {
      const d = Math.hypot(T.x - eye.x, T.z - eye.z);
      if (d > 450 || d < 20) return false;
      const y = w.heightAt(T.x, T.z) + 2, at = this.inPrint(T.x, y, T.z, g);
      return !!at && at.u * at.u + at.v * at.v <= ZONE * ZONE && this.clear(eye, { x: T.x, y, z: T.z });
    }
    if (T.type === 'trail') {
      if (Math.hypot(T.x - eye.x, T.z - eye.z) > 35) return false;
      cam.getWorldDirection(_dir);
      if (_dir.y < -0.45 || _dir.y > 0.35) return false;
      const n = Math.hypot(_dir.x, _dir.z) || 1;
      let wet = 0;
      for (const m of [15, 30, 50]) if (w.shoreAt(eye.x + (_dir.x / n) * m, eye.z + (_dir.z / n) * m) < -2) wet++; // out over the water, a small lake too
      return wet >= 2;
    }
    if (T.type === 'sunset') {
      const d = this.day;
      if (!d || d.hours < 12 || d.elevation < -1.5 || d.elevation > 9) return false;
      const here = w.lakeIdAt(eye.x, eye.z) || (this.tasks ? this.tasks.lakeNear(eye.x, eye.z, 15) : 0);
      if (here !== T.lake) return false;
      const q = _q.copy(d.sunDir).transformDirection(_inv);
      if (q.z > -0.05) return false;
      const u = q.x / -q.z / g.tanH, v = q.y / -q.z / g.tanV;
      return Math.abs(u) <= ZONE && v >= -1.15 && v <= 1;
    }
    return false;
  }
  // the notice a look would go to: the best paying on the go that it fits
  noticeFor(look) {
    const k = KINDS.photo;
    return this.onTheGo().filter((t) => k.matches(t, look)).sort((a, b) => (b.pay || 0) - (a.pay || 0) || a.id - b.id)[0] || null;
  }

  // --- the picture ---------------------------------------------------------------------------------------------
  capture() {
    const look = this.survey(), t = this.noticeFor(look), d = this.day;
    const best = look.counts[0] || null, place = t && t.want === 'place' ? t.target : null;
    const img = this.grab();
    const rec = { id: this.state.nextId++, at: Date.now(), year: d ? d.year : 0, doy: d ? d.doy : 0, hours: d ? +d.hours.toFixed(3) : 0, film: this.film,
      kind: best ? best.kind : place ? 'place' : null, subjects: [...new Set(look.counts.map((s) => s.kind))], caption: this.caption(best, place), notice: null };
    if (t) {
      t.status = 'done'; t.photo = rec.id; t.print = rec.caption;
      rec.notice = { id: t.id, title: t.title, from: t.from };
      const L = this.tasks.landing(t.from);
      this.tasks.note(`That is the picture for “${t.title}”. ${L ? L.name : 'The outfitter'} pays for it at their counter, entry point ${t.from}.`);
      this.tasks.changed(); this.tasks.boardChanged();
    }
    // the print: kept (24 at most, the oldest goes), shown for a moment, written away
    this.state.list.unshift(rec);
    for (const old of this.state.list.splice(KEEP)) { this.store.del(old.id); const u = this.urls.get(old.id); if (u) { URL.revokeObjectURL(u); this.urls.delete(old.id); } }
    if (img) { try { this.urls.set(rec.id, URL.createObjectURL(blobOf(img))); } catch { this.urls.set(rec.id, img); } this.store.put(rec.id, img); }
    this.version++;
    this.showPrint(rec);
    this.flash();
    this.shutter();
    this.wind = this.film === 'disposable' ? WIND.disposable : WIND.film;
    if (!this.owned) {
      this.state.disposable = Math.max(0, this.state.disposable - 1);
      if (this.state.disposable === 0) { this.note('That was the last picture on the disposable.', 5); this.lowerIn = 1.2; }
    }
    this.write();
    this.last = { rec, look };
    return rec;
  }
  // the frame as drawn, cut to the print's 16:9 from the middle and brought down in two steps (a smooth print), with a
  // touch of the print's own look: the corners a little dark
  grab() {
    const src = this.renderer.domElement, W = src.width, H = src.height;
    if (!(W > 0 && H > 0)) return null;
    let cw = W, ch = Math.round(W / ASPECT);
    if (ch > H) { ch = H; cw = Math.round(H * ASPECT); }
    const mid = this.mid || (this.mid = document.createElement('canvas'));
    mid.width = PRINT.w * 3; mid.height = PRINT.h * 3;
    const m = mid.getContext('2d');
    m.imageSmoothingEnabled = true; m.imageSmoothingQuality = 'high';
    m.drawImage(src, (W - cw) / 2, (H - ch) / 2, cw, ch, 0, 0, mid.width, mid.height);
    const out = document.createElement('canvas'); out.width = PRINT.w; out.height = PRINT.h;
    const o = out.getContext('2d');
    o.imageSmoothingEnabled = true; o.imageSmoothingQuality = 'high';
    o.drawImage(mid, 0, 0, PRINT.w, PRINT.h);
    const vg = o.createRadialGradient(PRINT.w / 2, PRINT.h / 2, PRINT.h * 0.45, PRINT.w / 2, PRINT.h / 2, PRINT.w * 0.62);
    vg.addColorStop(0, 'rgba(20, 14, 8, 0)'); vg.addColorStop(1, `rgba(20, 14, 8, ${this.film === 'disposable' ? 0.3 : 0.18})`);
    o.fillStyle = vg; o.fillRect(0, 0, PRINT.w, PRINT.h);
    return out.toDataURL('image/jpeg', 0.84);
  }
  // "A bull moose, Hudson Lake, July 14, dawn"
  caption(best, place) {
    const d = this.day, p = this.player, w = this.world;
    const lakeId = w.lakeIdAt(p.x, p.z) || (this.tasks ? this.tasks.lakeNear(p.x, p.z, 15) : 0);
    const lake = lakeId ? w.lakeName(lakeId) || 'an unnamed lake' : 'in the woods';
    const date = d ? dateOf(d.year, d.doy) : '', when = this.partOfDay();
    if (place && place.type === 'sunset') return `Sunset, ${place.name || lake}, ${date}`;
    if (place && place.type === 'island') return `The island site, ${place.name || lake}, ${date}, ${when}`;
    if (place && place.type === 'trail') return `${place.name || cap(lake)} from the end of the ${place.rods}-rod portage, ${date}, ${when}`;
    return `${best ? `${cap(best.label)}, ${lake}` : cap(lake)}, ${date}, ${when}`;
  }
  partOfDay() {
    const d = this.day;
    if (!d) return '';
    const h = d.hours, { rise, set } = d.sunriseSunset;
    if (rise == null || set == null) return h < 12 ? 'morning' : 'evening';
    if (h < rise - 0.75) return h < 3 ? 'night' : 'before dawn';
    if (h < rise + 1.25) return 'dawn';
    if (h < 11) return 'morning';
    if (h < 14) return 'midday';
    if (h < set - 2) return 'afternoon';
    if (h < set - 0.4) return 'evening';   // from about two hours before sunset (a 7:30 pm print in July is an evening one)
    if (h < set + 0.8) return 'dusk';      // to the end of civil dusk, about three quarters of an hour after the sun goes
    return 'night';
  }
  // the shutter (and the film wound on): two clicks through a narrow band, then the lever's swish or the thumbwheel
  shutter() {
    const au = this.audio;
    if (!au || !au.ctx || !au.enabled || typeof au.voice !== 'function') return;
    const v = au.voice({ local: true, gain: 0.45, pri: 2 });
    if (!v) return;
    const t = v.t, disp = this.film === 'disposable';
    const click = (at, f, g0) => {
      const bp = v.filter('bandpass', f, 2.4), g = v.gain(0);
      v.noise('white', bp); bp.connect(g); g.connect(v.input);
      g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(g0, at + 0.002); g.gain.exponentialRampToValueAtTime(0.0005, at + 0.04);
    };
    click(t, disp ? 2600 : 3400, 0.9); click(t + (disp ? 0.045 : 0.075), disp ? 1800 : 2300, 0.65);
    const sw = v.filter('bandpass', disp ? 1500 : 1100, disp ? 3 : 0.9), g2 = v.gain(0);
    v.noise(disp ? 'white' : 'pink', sw); sw.connect(g2); g2.connect(v.input);
    const s0 = t + 0.22;
    if (disp) for (let i = 0; i < 7; i++) { const a = s0 + i * 0.055; g2.gain.setValueAtTime(0, a); g2.gain.linearRampToValueAtTime(0.35, a + 0.003); g2.gain.exponentialRampToValueAtTime(0.0005, a + 0.03); }
    else { g2.gain.setValueAtTime(0, s0); g2.gain.linearRampToValueAtTime(0.16, s0 + 0.08); g2.gain.linearRampToValueAtTime(0, s0 + 0.32); }
    v.until(t + 0.8);
  }

  // --- the DOM: the frame (Air) and the print that comes out (Paper) ---------------------------------------------
  buildFrame() {
    const el = this.el = document.createElement('div');
    el.id = 'photo'; el.setAttribute('aria-hidden', 'true');
    el.innerHTML = '<div class="crop"><i class="c tl"></i><i class="c tr"></i><i class="c bl"></i><i class="c br"></i><i class="mid"></i>'
      + '<div class="say"></div><div class="meta sc"></div><div class="keys"><kbd>Space</kbd> take it &nbsp;·&nbsp; <kbd>wheel</kbd> zoom &nbsp;·&nbsp; <kbd>C</kbd> lower</div></div><div class="flash"></div>';
    document.body.appendChild(el);
    this.crop = el.querySelector('.crop'); this.sayEl = el.querySelector('.say'); this.metaEl = el.querySelector('.meta'); this.flashEl = el.querySelector('.flash');
    const pr = this.printEl = document.createElement('div');
    pr.id = 'photo-print'; pr.setAttribute('aria-live', 'polite');
    document.body.appendChild(pr);
    this.printT = 0;
  }
  placeFrame() {
    const W = window.innerWidth, H = window.innerHeight;
    let w = W, h = W / ASPECT;
    if (h > H) { h = H; w = H * ASPECT; }
    Object.assign(this.crop.style, { left: `${(W - w) / 2}px`, top: `${(H - h) / 2}px`, width: `${w}px`, height: `${h}px` });
  }
  paintFrame() {
    const L = this.look, t = this.noticeFor(L);
    let say = '', cls = '';
    const forT = t ? `<span class="for">for “${esc(t.title)}”</span>` : '';
    const best = L.counts[0];
    if (best) say = `${esc(best.label)} · ${Math.round(best.d)} m${forT}`;
    else if (t && t.want === 'place') say = `${esc(placeWords(t.target))}${forT}`;
    else if (L.far[0]) { say = `${esc(L.far[0].label)}, a long way off · ${Math.round(L.far[0].d)} m`; cls = 'dim'; }
    else if (L.edge[0]) { say = `${esc(L.edge[0].label)}, off to the side`; cls = 'dim'; }
    const lens = `${Math.round(this.focal / 5) * 5} mm lens`;
    const meta = this.film === 'disposable' ? `Disposable · ${word(this.state.disposable)} left · ${lens}` : `35 mm · ${lens} · ${this.state.list.length} ${this.state.list.length === 1 ? 'print' : 'prints'}`;
    const key = `${say}|${cls}|${meta}`;
    if (key === this.sayKey) return;
    this.sayKey = key;
    this.sayEl.innerHTML = say; this.sayEl.className = `say ${cls}`;
    this.metaEl.textContent = meta;
  }
  flash() { const f = this.flashEl; f.classList.remove('go'); void f.offsetWidth; f.classList.add('go'); }
  showPrint(rec) {
    const url = this.urls.get(rec.id);
    this.printEl.innerHTML = `${url ? `<img src="${url}" width="${PRINT.w}" height="${PRINT.h}" alt="">` : ''}<div class="cap">${esc(rec.caption)}</div>${rec.notice ? `<div class="for">for “${esc(rec.notice.title)}”</div>` : ''}`;
    this.printEl.classList.remove('show'); void this.printEl.offsetWidth;
    this.printEl.classList.add('show');
    this.printT = 4;
  }
  tickPrint(dt) { if (this.printT > 0 && (this.printT -= dt) <= 0) this.printEl.classList.remove('show'); }

  // --- the prints, for the journal ----------------------------------------------------------------------------
  // newest first: { id, url, caption, film, notice: { id, title, from } | null, year, doy }
  prints() { return this.state.list.map((r) => ({ ...r, url: this.urls.get(r.id) || null })); }
  async loadImages() {
    for (const r of this.state.list) {
      if (this.urls.has(r.id)) continue;
      const data = await this.store.get(r.id);
      if (!data) continue;
      try { this.urls.set(r.id, URL.createObjectURL(blobOf(data))); } catch { this.urls.set(r.id, data); }
      this.version++;
    }
  }
}

// a place in a few words, for the frame
function placeWords(T) {
  if (!T) return '';
  if (T.type === 'island') return `the island site, ${T.name}`;
  if (T.type === 'trail') return `${T.name}, from the far landing`;
  if (T.type === 'sunset') return `the sun going down over ${T.name}`;
  return 'the place';
}

// --- the look (Air for the frame: cream lines and type on the scene; Paper for the prints) --------------------------
const CSS = `
#photo { position: fixed; inset: 0; pointer-events: none; z-index: 3; opacity: 0; visibility: hidden; transition: opacity .24s ease-out, visibility 0s linear .24s;
  color: var(--cream); font: 17px/1.35 var(--sans); text-shadow: var(--air-shadow); }
#photo.show { opacity: 1; visibility: visible; transition: opacity .24s ease-out; }
#photo .crop { position: absolute; box-shadow: 0 0 0 200vmax rgba(14, 27, 34, .36); }
#photo .c { position: absolute; width: 28px; height: 28px; border: 0 solid rgba(243, 236, 221, .88); }
#photo .tl { left: 22px; top: 22px; border-left-width: 1.5px; border-top-width: 1.5px; }
#photo .tr { right: 22px; top: 22px; border-right-width: 1.5px; border-top-width: 1.5px; }
#photo .bl { left: 22px; bottom: 22px; border-left-width: 1.5px; border-bottom-width: 1.5px; }
#photo .br { right: 22px; bottom: 22px; border-right-width: 1.5px; border-bottom-width: 1.5px; }
#photo .mid { position: absolute; left: 50%; top: 50%; width: 15px; height: 15px; translate: -50% -50%; opacity: .7;
  background: linear-gradient(rgba(243, 236, 221, .9), rgba(243, 236, 221, .9)) center / 1px 100% no-repeat, linear-gradient(rgba(243, 236, 221, .9), rgba(243, 236, 221, .9)) center / 100% 1px no-repeat; }
#photo .say { position: absolute; left: 0; right: 0; top: 30px; text-align: center; font: italic 20px/1.3 var(--serif); color: rgba(243, 236, 221, .95); transition: opacity .2s;
  text-shadow: 0 1px 2px rgba(0, 0, 0, .55), 0 0 14px rgba(14, 27, 34, .5); }
#photo .say.dim { color: rgba(243, 236, 221, .62); }
#photo .say .for { display: block; margin-top: 3px; font: 700 12px/1.4 var(--sc); font-style: normal; letter-spacing: .14em; color: var(--gold); }
#photo .meta { position: absolute; left: 34px; bottom: 30px; color: var(--cream-72); }
#photo .keys { position: absolute; right: 34px; bottom: 28px; font-size: 16px; color: var(--cream-72); }
#photo kbd { display: inline-block; min-width: 24px; box-sizing: border-box; padding: 1px 7px; border: 1.5px solid rgba(243, 236, 221, .8); border-radius: 4px; font: 700 12px/1.3 var(--sans); text-align: center; text-shadow: none; }
#photo .flash { position: absolute; inset: 0; background: #fff6e4; opacity: 0; }
#photo .flash.go { animation: photo-flash .34s ease-out; }
@keyframes photo-flash { 0% { opacity: .5; } 100% { opacity: 0; } }
body.photo-up #air > div:not(#lines) { visibility: hidden; transition: none; } /* at once: a row mid-fade (the balance arc as the sea eases) kept its .7 s visibility delay and showed through the frame */
body.photo-up #lines { bottom: 118px; }
body.photo-up #photo-print { bottom: 118px; }
body.shell-open #photo, body.shell-open #photo-print, body.paper-open #photo-print { display: none; }
#photo-print { position: fixed; right: 46px; bottom: 70px; z-index: 4; pointer-events: none; box-sizing: border-box; width: 258px; padding: 9px 9px 10px; background: #f6f1e4;
  border: 1px solid var(--edge); box-shadow: 0 12px 30px rgba(0, 0, 0, .42); color: var(--ink); opacity: 0; transform: rotate(1.8deg) translateY(18px);
  transition: opacity .7s ease-out, transform .5s ease-out; }
#photo-print.show { opacity: 1; transform: rotate(1.8deg) translateY(0); transition: opacity .24s ease-out, transform .45s ease-out; }
#photo-print img { display: block; width: 240px; height: 135px; background: #2a2016; }
#photo-print .cap { margin-top: 7px; font: 500 18px/1.1 var(--pencil-font); color: var(--pencil); }
#photo-print .for { margin-top: 3px; font: 700 10px/1.35 var(--sc); letter-spacing: .12em; color: var(--ink-soft); }
#journal .prints { display: grid; grid-template-columns: 1fr 1fr; gap: 20px 24px; align-content: start; padding: 6px 6px 0; }
#journal .print { margin: 0; padding: 7px 7px 9px; background: #f6f1e4; border: 1px solid var(--edge); box-shadow: 0 3px 8px rgba(40, 24, 8, .26); transform: rotate(var(--tilt, 0deg)); }
#journal .print img { display: block; width: 100%; height: auto; aspect-ratio: 16 / 9; background: #d8ccae; }
#journal .print .blank { display: grid; place-items: center; width: 100%; aspect-ratio: 16 / 9; background: #d8ccae; font: italic 14px/1.2 var(--serif); color: var(--ink-soft); }
#journal .print figcaption { margin-top: 6px; font: 500 17px/1.1 var(--pencil-font); color: var(--pencil); }
#journal .print .for { display: block; margin-top: 3px; font: 700 10px/1.35 var(--sc); letter-spacing: .12em; color: var(--ink-soft); }
`;
let cssIn = false;
function injectCss() {
  if (cssIn || typeof document === 'undefined') return;
  cssIn = true;
  const s = document.createElement('style'); s.id = 'photo-css'; s.textContent = CSS;
  document.head.appendChild(s);
}
