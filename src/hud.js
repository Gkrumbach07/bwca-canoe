import * as THREE from 'three';
import { clamp } from './rng.js';
import { MONTHS, monthDay } from './astro.js';
import { FRESH } from './wind.js';
import './hud.css';

// The HUD, in two materials (hud.css). Air: the compass top right, the readout top left while Tab is held,
// the place title and the journal lines bottom left, one action line bottom centre with the balance arc,
// the tension line and the lure strip above it, the status marks bottom right at half strength; while
// fishing, the spot card, the reticle on the water and the catch card. Quiet by default: nothing is drawn
// until it has something to say, and the density setting says how much (settings.js). Paper: the map, a
// Fisher-style topographic sheet (cream paper, hypsometric tints, 10 m contours, pale-blue lakes with a dark
// rim, red dashed portages with rod counts, red campsite dots, serif lake names): a glance that slides up
// from the bottom right while M is held, the full sheet when M is pressed (drag to pan, wheel to zoom, click
// to drop a pin; a pencil note asks before the canoe is moved), or a small corner sheet that stays up when
// asked for. The journal (journal.js) and the outfitter's counter (outfitter.js) are paper too; one paper
// object is up at a time, on a scrim, and the HUD keeps the register of which.

const GLANCE_SPAN = 5000;    // metres across the glance and the corner sheet
const BIG_SPAN = 25600;      // metres across the sheet when it opens
const MIN_SPAN = 2000, MAX_SPAN = 240000;
const FINE_PX = 512;         // image pixels per fine tile edge (5 m per pixel)
const FAR_PX = 256;          // image pixels per far tile edge (80 m per pixel)
const FINE_M_PER_PX = 20;    // draw tiles at full detail once the view is this close
const MAP_TILES_MAX = 96;    // map-only tile images kept (about 1 MB each)
const MAP_FETCHES = 4;       // map-only tile downloads in flight
const WATER = [184, 208, 216], RIM = [84, 118, 136];
const TINT_LOW = [224, 216, 182], TINT_HIGH = [160, 166, 112];
const BANDS = 14;
const PAPER = '#e9e1cc';
const SERIF = 'Alegreya, Georgia, "Times New Roman", serif';
const PRESS = 300;           // ms: M let go sooner than this was a press, not a hold
const HOLD_OFF = 300;        // ms: held keys hide this long after release
const TITLE_HOLD = 4, NOTE_HOLD = 5, CATCH_HOLD = 8; // seconds
const WAVE_MATTERS = 0.3;    // m: waves above this make the compass speak
const WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const COMPASS_LONG = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];

// --- time and words ----------------------------------------------------------------------------------------
export function clock12(hours) {
  if (hours == null || !Number.isFinite(hours)) return '';
  const h = Math.floor(hours) % 24, m = Math.floor((hours - Math.floor(hours)) * 60);
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
}
export function weekdayOf(year, doy) { const { month, day } = monthDay(year, doy); return DAYS[new Date(year, month, day).getDay()]; }
export function longDate(year, doy) { const { month, day } = monthDay(year, doy); return `${weekdayOf(year, doy)}, ${MONTHS_LONG[month]} ${day}`; }
export function shortDate(year, doy) { const { month, day } = monthDay(year, doy); return `${MONTHS[month]} ${day}`; }
export const esc = (s) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
export const fmtKm = (km) => (km < 10 ? km.toFixed(1) : String(Math.round(km)));
export const fmtDays = (d) => { if (d <= 0) return 'no'; const w = Math.floor(d + 1e-6), half = d - w >= 0.5 - 1e-6 && d - w < 0.99; return half ? `${w || ''}½` : String(Math.round(d)); };
// "3½ days", "1 day", "½ day"
export const foodWords = (d) => `${fmtDays(d)} ${d <= 1 ? 'day' : 'days'}`;
export const plural = (n, one, many = `${one}s`) => (n === 1 ? one : many);
export const bearingOf = (heading) => ((90 - (heading * 180) / Math.PI) % 360 + 360) % 360;
export const compassLong = (deg) => COMPASS_LONG[Math.round(deg / 45) % 8];
export const word = (n) => (n < WORDS.length ? WORDS[n] : String(n));
// "an hour and forty", "two hours and a bit", "about 25 minutes"
export function fmtDuration(hours) {
  const m = Math.round(hours * 60);
  if (m < 55) return `about ${Math.max(5, Math.round(m / 5) * 5)} minutes`;
  const h = Math.floor(m / 60), rest = m - h * 60, hw = h === 1 ? 'an hour' : `${word(h)} hours`;
  if (rest < 8) return hw;
  if (rest < 23) return `${hw} and a bit`;
  if (rest < 38) return `${hw} and a half`;
  if (rest < 53) return `${hw} and forty`;
  return h === 0 ? 'nearly an hour' : h === 1 ? 'nearly two hours' : `nearly ${word(h + 1)} hours`;
}
// a lake in a few words: "the big water: 3,900 acres, sounded to 23 m"
export function lakeWords(l) {
  if (!l) return '';
  const acres = (l.cells * 100) / 4046.86;
  const size = acres > 2000 ? 'the big water' : acres > 400 ? 'a good-sized lake' : acres > 60 ? 'a small lake' : 'a pond';
  const a = acres >= 100 ? Math.round(acres / 10) * 10 : Math.max(1, Math.round(acres));
  return `${size}: ${a.toLocaleString('en-US')} ${plural(a, 'acre')}${l.maxDepth ? `, sounded to ${Math.round(l.maxDepth)} m` : ''}`;
}
// the Fisher-style sheet code for a point: letters east across the wilderness, numbers south
export function sheetCode(world, x, z) {
  const col = clamp(Math.floor((x - world.minX) / 20000), 0, 25), row = clamp(Math.floor((z - world.minZ) / 15000), 0, 98);
  return `${String.fromCharCode(65 + col)}-${row + 1}`;
}
// an ink fish for the catch card, by species
export function fishSilhouette(species) {
  const body = {
    pike: '8,28 30,14 80,12 100,22 108,28 100,34 80,44 30,42', smallmouth: '12,28 34,8 72,6 96,18 108,28 96,38 72,50 34,48',
    laketrout: '10,28 32,12 78,10 100,22 108,28 100,34 78,46 32,44', crappie: '16,28 36,6 72,6 98,20 108,28 98,36 72,50 36,50',
    perch: '14,28 36,10 74,8 98,20 108,28 98,36 74,48 36,46', walleye: '10,28 36,10 74,8 98,20 108,28 98,36 74,48 36,46',
  }[species] || '10,28 36,10 74,8 98,20 108,28 98,36 74,48 36,46';
  return `<polygon points="${body}" fill="#2a2016"/><polygon points="10,28 2,16 6,28 2,40" fill="#2a2016"/><polygon points="46,10 56,0 70,8" fill="#2a2016"/><polygon points="62,46 70,56 80,46" fill="#2a2016"/><circle cx="90" cy="24" r="3" fill="#ebe2cb"/>`;
}

// marching squares: the segments through a cell for a corner bitmask (1 top-left, 2 top-right, 4 bottom-right, 8 bottom-left)
function msSegments(b, top, right, bottom, left) {
  switch (b) {
    case 1: case 14: return [left, top];
    case 2: case 13: return [top, right];
    case 3: case 12: return [left, right];
    case 4: case 11: return [right, bottom];
    case 5: return [left, top, right, bottom];
    case 6: case 9: return [top, bottom];
    case 7: case 8: return [left, bottom];
    case 10: return [top, right, bottom, left];
    default: return [];
  }
}

const $ = (id) => document.getElementById(id);

export class Hud {
  // opts: { onTeleport(x, z), settings, camera }
  constructor(world, opts = {}) {
    this.world = world;
    if (typeof opts === 'function') opts = { onTeleport: opts };
    this.onTeleport = opts.onTeleport || null;
    this.settings = opts.settings || null;
    this.camera = opts.camera || null;
    this.el = {
      air: $('air'), compass: $('compass'), needle: $('compass-needle'), windArrow: $('compass-wind'), compassLabel: $('compass-label'), compassWaves: $('compass-waves'),
      readout: $('readout'), spot: $('spot'), spotWhere: $('spot-where'), spotWho: $('spot-who'),
      reticle: $('reticle'), reticleRing: $('reticle-ring'), reticleDist: $('reticle-dist'),
      place: $('place'), placeKicker: $('place-kicker'), placeName: $('place-name'), placeSub: $('place-sub'),
      lines: $('lines'), stringer: $('stringer'),
      catch: $('catch'), catchFish: $('catch-fish'), catchName: $('catch-name'), catchSize: $('catch-size'), catchMeta: $('catch-meta'),
      balance: $('balance'), balanceDot: $('balance-dot'), balanceLabel: $('balance-label'),
      tension: $('tension'), tensionFill: $('tension-fill'), tensionEnd: $('tension-end'), tensionLabel: $('tension-label'),
      lures: $('lures'), prompt: $('prompt'), marks: $('marks'),
      map: $('map'), mapBody: $('map-body'), mapTitle: $('map-title'), mapSpan: $('map-span'), mapLayers: $('map-layers'), mapClose: $('map-close'),
      mapScalebar: $('map-scalebar'), mapScale: $('map-scale'), pin: $('pin'), pinText: $('pin-text'), pinGo: $('pin-go'), pinCancel: $('pin-cancel'), mapHint: $('map-hint'),
    };
    this.ctx = null;                 // the latest frame's inputs (update)
    this.cache = {};                 // last strings written, to spare the DOM
    this.fishUi = { lure: -1, catchKey: null, catchUntil: 0 };
    // the paper register: which object is up, and how to put the others away
    this.paper = null; this.papers = new Map();
    // held keys
    this.tab = { held: false, shown: false, timer: null };
    this.mKey = { downAt: 0, held: false, timer: null };
    // titles and lines
    this.lastLakeId = null; this.titleTimer = null; this.pendingTitle = null; this.lastDawnDoy = null; this.lastHours = null;
    this.lineTimers = new Set();
    // the map
    this.canvas = $('minimap');
    this.mapCtx = this.canvas.getContext('2d');
    this.mode = 'hidden';            // hidden | glance | sheet | corner
    this.view = { cx: 0, cz: 0, span: GLANCE_SPAN };
    this.layers = { lakes: true, portages: true, campsites: true, tasks: true, depths: true };
    this.pin = null;
    this.player = null;
    this.fineImages = new Map();
    this.farImages = new Map();
    this.mapTiles = new Map();   // tiles fetched for the map alone, beyond the streamed neighbourhood
    this.fetching = 0;
    this.tick = 0;
    this.overview = null;
    this.scaleShown = '';
    this._v = new THREE.Vector3();
    this.loadOverview();
    this.bindMap();
    this.bindKeys();
    this.marksBuild();
    window.addEventListener('resize', () => { this.sizeCanvas(); this.placeConfirm(); });
  }
  // for the title screen: is anything of paper up (its Esc belongs to the paper, not the menu)
  get big() { return this.mode === 'sheet'; }
  get paperOpen() { return !!this.paper; }

  // --- the paper register -----------------------------------------------------------------------------------
  registerPaper(name, close) { this.papers.set(name, close); }
  openPaper(name) {
    if (this.paper && this.paper !== name) { const c = this.papers.get(this.paper); if (c) c(); }
    this.paper = name;
    document.body.classList.add('paper-open');
  }
  closePaper(name) {
    if (this.paper !== name) return;
    this.paper = null;
    document.body.classList.remove('paper-open');
  }

  // --- keys: Tab for the readout, M for the map, Esc / Enter for the pin -------------------------------------
  bindKeys() {
    window.addEventListener('keydown', (e) => {
      const tag = e.target && e.target.tagName;
      if (tag === 'SELECT' || tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (document.body.classList.contains('shell-open')) return; // the title card owns the keys
      if (e.code === 'Tab') {
        e.preventDefault();
        if (e.repeat || !this.settings) return;
        const mode = this.settings.readoutMode;
        if (mode === 'toggle') this.showReadout(!this.tab.shown);
        else if (mode === 'hold') { this.tab.held = true; clearTimeout(this.tab.timer); this.showReadout(true, true); }
      } else if (e.code === 'KeyM') {
        if (e.repeat || this.paper === 'outfitter') return;
        if (this.mode === 'sheet') { this.setMode(this.settings && this.settings.cornerSheet ? 'corner' : 'hidden'); return; }
        this.mKey.downAt = performance.now(); this.mKey.held = true; clearTimeout(this.mKey.timer);
        if (this.paper) { const c = this.papers.get(this.paper); if (c) c(); } // one paper object at a time
        this.setMode('glance');
      } else if (e.code === 'Escape') {
        if (this.pin) this.clearPin(); else if (this.mode === 'sheet') this.setMode(this.settings && this.settings.cornerSheet ? 'corner' : 'hidden');
      } else if (e.code === 'Enter' && this.pin) this.confirm();
    });
    window.addEventListener('keyup', (e) => {
      if (e.code === 'Tab') {
        this.tab.held = false;
        if (this.settings && this.settings.readoutMode === 'hold') { clearTimeout(this.tab.timer); this.tab.timer = setTimeout(() => { if (!this.tab.held) this.showReadout(false); }, HOLD_OFF); }
      } else if (e.code === 'KeyM' && this.mKey.held) {
        this.mKey.held = false;
        const press = performance.now() - this.mKey.downAt < PRESS;
        if (press && this.mode === 'glance') this.setMode('sheet');
        else if (this.mode === 'glance') { this.mKey.timer = setTimeout(() => { if (this.mode === 'glance' && !this.mKey.held) this.setMode(this.settings && this.settings.cornerSheet ? 'corner' : 'hidden'); }, HOLD_OFF); }
      }
    });
    window.addEventListener('blur', () => { this.tab.held = false; this.mKey.held = false; if (this.settings && this.settings.readoutMode === 'hold') this.showReadout(false); if (this.mode === 'glance') this.setMode(this.settings && this.settings.cornerSheet ? 'corner' : 'hidden'); });
  }
  showReadout(on, now = false) {
    this.tab.shown = on;
    const el = this.el.readout;
    el.classList.toggle('now', now);
    el.classList.toggle('show', on);
    this.el.air.classList.toggle('readout', on);
    if (on) this.renderReadout(true);
  }

  // --- map interaction ------------------------------------------------------------------------------
  bindMap() {
    const c = this.canvas;
    let drag = null;
    const rectPx = (e) => { const r = c.getBoundingClientRect(); return [((e.clientX - r.left) / r.width) * c.width, ((e.clientY - r.top) / r.height) * c.height, r]; };
    c.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      const [px, py] = rectPx(e);
      drag = { px, py, cx: this.view.cx, cz: this.view.cz, moved: false, id: e.pointerId };
      try { c.setPointerCapture(e.pointerId); } catch { /* synthetic pointers have no capture */ }
      if (this.mode === 'sheet') c.classList.add('grabbing');
    });
    c.addEventListener('pointermove', (e) => {
      if (!drag || this.mode !== 'sheet') return;
      const [px, py] = rectPx(e);
      const dx = px - drag.px, dy = py - drag.py;
      if (Math.hypot(dx, dy) > 4) drag.moved = true;
      if (!drag.moved) return;
      const mPerPx = this.view.span / c.width;
      this.setCentre(drag.cx - dx * mPerPx, drag.cz - dy * mPerPx);
    });
    const up = (e) => {
      if (!drag) return;
      const d = drag; drag = null;
      c.classList.remove('grabbing');
      if (d.moved) return;
      if (this.mode !== 'sheet') { this.setMode('sheet'); return; }
      const [px, py] = rectPx(e);
      const [x, z] = this.worldAt(px, py);
      this.propose(x, z, false);
    };
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', () => { drag = null; c.classList.remove('grabbing'); });
    c.addEventListener('wheel', (e) => {
      e.preventDefault();
      if (this.mode !== 'sheet') return;
      const [px, py] = rectPx(e);
      const [wx, wz] = this.worldAt(px, py);
      const span = clamp(this.view.span * Math.exp(e.deltaY * 0.0015), MIN_SPAN, MAX_SPAN);
      // keep the point under the cursor where it is
      const mPerPx = span / c.width;
      this.view.span = span;
      this.setCentre(wx - (px - c.width / 2) * mPerPx, wz - (py - c.height / 2) * mPerPx);
    }, { passive: false });
    if (this.el.mapLayers) this.el.mapLayers.addEventListener('click', (e) => {
      const b = e.target.closest('.layer'); if (!b) return;
      const k = b.dataset.layer; this.layers[k] = !this.layers[k]; b.classList.toggle('off', !this.layers[k]);
    });
    if (this.el.mapClose) this.el.mapClose.addEventListener('click', () => this.setMode(this.settings && this.settings.cornerSheet ? 'corner' : 'hidden'));
    if (this.el.pinGo) this.el.pinGo.addEventListener('click', () => this.confirm());
    if (this.el.pinCancel) this.el.pinCancel.addEventListener('click', () => this.clearPin());
    const scrim = $('scrim');
    if (scrim) scrim.addEventListener('click', () => { if (this.paper === 'map') this.setMode(this.settings && this.settings.cornerSheet ? 'corner' : 'hidden'); else if (this.paper && this.paper !== 'outfitter') { const c = this.papers.get(this.paper); if (c) c(); } });
    this.registerPaper('map', () => { if (this.mode === 'sheet') this.setMode(this.settings && this.settings.cornerSheet ? 'corner' : 'hidden'); });
  }

  worldAt(px, py) {
    const v = this.view, mPerPx = v.span / this.canvas.width;
    return [v.cx + (px - this.canvas.width / 2) * mPerPx, v.cz + (py - this.canvas.height / 2) * mPerPx];
  }

  setCentre(cx, cz) {
    const w = this.world, m = this.view.span * 0.45;
    this.view.cx = clamp(cx, w.minX + m, w.maxX - m);
    this.view.cz = clamp(cz, w.minZ + m * (this.canvas.height / this.canvas.width), w.maxZ - m * (this.canvas.height / this.canvas.width));
    this.placeConfirm();
  }

  // hidden | glance (held M) | sheet (pressed M, on the scrim) | corner (a small sheet that stays up)
  setMode(mode) {
    if (mode === this.mode) return;
    const was = this.mode;
    this.mode = mode;
    const m = this.el.map;
    m.classList.toggle('glance', mode === 'glance'); m.classList.toggle('sheet', mode === 'sheet'); m.classList.toggle('corner', mode === 'corner');
    m.classList.toggle('show', mode !== 'hidden');
    if (mode === 'sheet') {
      this.openPaper('map');
      this.view.span = BIG_SPAN;
      if (this.player) { this.view.cx = this.player.x; this.view.cz = this.player.z; }
    } else {
      if (was === 'sheet') this.closePaper('map');
      this.view.span = GLANCE_SPAN;
      this.clearPin();
    }
    this.sizeCanvas();
    requestAnimationFrame(() => this.sizeCanvas()); // once the sheet has its laid-out size
  }
  // the old API: the big map on / off
  setBig(big) { this.setMode(big ? 'sheet' : (this.settings && this.settings.cornerSheet ? 'corner' : 'hidden')); }

  // The backing store follows the displayed size (sharp on retina when the map fills the screen).
  sizeCanvas() {
    const c = this.canvas;
    if (this.mode === 'hidden') return;
    const r = c.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = Math.round(r.width * dpr), H = Math.round(r.height * dpr);
    if (c.width !== W || c.height !== H || !this.grain) { c.width = W; c.height = H; this.grain = this.makeGrain(); }
  }

  // --- the pin and its pencil note ----------------------------------------------------------------
  propose(x, z, recentre) {
    if (!this.world.inBounds(x, z, 50)) return;
    this.pin = { x, z };
    if (this.mode !== 'sheet') this.setMode('sheet');
    if (recentre) { this.view.cx = x; this.view.cz = z; }
    const w = this.world, p = this.player, ctx = this.ctx;
    const name = w.lakeName(w.lakeIdAt(x, z));
    const walk = this.pinLocked; // Adventure: the pin measures the way, it does not move you
    let text = 'Paddle in here?';
    if (p) {
      const km = Math.hypot(x - p.x, z - p.z) / 1000, dir = compassLong(bearingOf(Math.atan2(-(z - p.z), x - p.x)));
      const wind = ctx && ctx.wind, kmh = wind && wind.fresh ? 3.6 : 4.5;
      let hops = '';
      const tasks = ctx && ctx.tasks;
      if (tasks && typeof tasks.reach === 'function') {
        const from = p.lakeId, to = w.lakeIdAt(x, z);
        if (from > 0 && to > 0) {
          const r = tasks.reach(from).get(tasks.basinOf(to));
          hops = r ? (r.hops === 0 ? ' No portages.' : ` ${word(r.hops)[0].toUpperCase()}${word(r.hops).slice(1)} ${plural(r.hops, 'portage')}.`) : ' A long way round.';
        }
      }
      // in Adventure the clock runs at a third while you travel, so the way takes three times the hours on the clock
      const hours = (km / kmh) * (walk ? 3 : 1);
      text = `${walk ? '' : 'Paddle in here? '}${name ? `${name}, ` : ''}about ${fmtKm(km)} km ${dir}, ${fmtDuration(hours)}${walk ? ' by the clock' : ''}${wind && wind.speed > 3 ? ' with this wind' : ''}.${hops}`;
      if (walk) text = text[0].toUpperCase() + text.slice(1);
    } else if (name) text = `${walk ? '' : 'Paddle in here? '}${name}.`;
    if (this.el.pinGo) this.el.pinGo.hidden = walk;
    if (this.el.pinCancel) this.el.pinCancel.textContent = walk ? 'Close' : 'Not now';
    const keys = this.el.pin && this.el.pin.querySelector('.keys'); if (keys) keys.textContent = walk ? 'Esc' : 'Enter · Esc';
    if (this.el.pinText) this.el.pinText.textContent = text;
    if (this.el.pin) this.el.pin.classList.add('show');
    this.placeConfirm();
  }
  placeConfirm() {
    const box = this.el.pin;
    if (!box || !this.pin || this.mode !== 'sheet') return;
    const r = this.canvas.getBoundingClientRect(), mPerPx = this.view.span / this.canvas.width, k = r.width / this.canvas.width;
    const sx = r.width / 2 + ((this.pin.x - this.view.cx) / mPerPx) * k;
    const sy = r.height / 2 + ((this.pin.z - this.view.cz) / mPerPx) * k;
    box.style.left = `${clamp(sx, 160, r.width - 160)}px`;
    box.style.top = `${clamp(sy - 40, 130, r.height - 12)}px`;
  }
  clearPin() {
    this.pin = null;
    if (this.el.pin) this.el.pin.classList.remove('show');
  }
  // Adventure: the map's pin only measures the way (main.js gates the move as well)
  get pinLocked() { const t = this.ctx && this.ctx.trip; return !!(t && t.adventure); }
  confirm() {
    if (!this.pin || this.pinLocked) return;
    const { x, z } = this.pin;
    this.clearPin();
    this.setMode(this.settings && this.settings.cornerSheet ? 'corner' : 'hidden');
    if (this.onTeleport) this.onTeleport(x, z);
  }

  // --- paper rendering ----------------------------------------------------------------------------------
  makeGrain() {
    const W = this.canvas.width, H = this.canvas.height;
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const ctx = c.getContext('2d');
    ctx.fillStyle = 'rgba(90, 70, 40, 0.07)';
    const n = Math.round((W * H) / 78);
    for (let i = 0; i < n; i++) ctx.fillRect(Math.random() * W, Math.random() * H, 1.2, 1.2);
    return c;
  }

  tint(t, out) {
    const q = Math.floor(clamp(t, 0, 0.999) * BANDS) / (BANDS - 1);
    for (let k = 0; k < 3; k++) out[k] = TINT_LOW[k] + (TINT_HIGH[k] - TINT_LOW[k]) * q;
    return out;
  }
  tintH(h, out) { const [hmin, hmax] = this.world.meta.heightRange; return this.tint((h - hmin) / (hmax - hmin + 0.01), out); }

  // The bake's overview (water by depth, land hill-shaded) repainted as paper: it is the bottom layer when
  // the map is zoomed out past the loaded far field.
  loadOverview() {
    const ov = this.world.meta.overview;
    if (!ov) return;
    const img = new Image();
    img.crossOrigin = 'anonymous'; // the data may live on another origin (VITE_DATA_URL); the pixels are read back below
    img.onload = () => {
      const c = document.createElement('canvas'); c.width = ov.width; c.height = ov.height;
      const ctx = c.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const d = ctx.getImageData(0, 0, c.width, c.height), p = d.data, W = c.width, H = c.height;
      const water = new Uint8Array(W * H);
      for (let k = 0; k < W * H; k++) water[k] = p[k * 4 + 2] > p[k * 4] ? 1 : 0;
      const col = [0, 0, 0];
      for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
        const k = j * W + i, o = k * 4;
        let out;
        if (water[k]) {
          const land = (i > 0 && !water[k - 1]) || (i < W - 1 && !water[k + 1]) || (j > 0 && !water[k - W]) || (j < H - 1 && !water[k + W]);
          out = land ? RIM : WATER;
        } else {
          const r = p[o], g = p[o + 1];
          const t = (112 * r - 78 * g) / Math.max(1, 70 * g - 60 * r); // undo the bake's tint ramp (the hillshade cancels)
          out = this.tint(t, col);
        }
        p[o] = out[0]; p[o + 1] = out[1]; p[o + 2] = out[2]; p[o + 3] = 255;
      }
      ctx.putImageData(d, 0, 0);
      this.overview = c;
    };
    img.src = this.world.base + ov.file;
  }

  // Paper rendering of one slot's cells (fine tile or far tile): water with a dark rim, tinted land.
  paintCells(ctx, s, side, halo, px, cellsPerPx) {
    const data = ctx.createImageData(px, px), c = [0, 0, 0];
    const isWater = (li, lj) => s.lake[clamp(lj, 0, side - 1) * side + clamp(li, 0, side - 1)] > 0;
    for (let py = 0; py < px; py++) {
      const lj = halo + Math.floor((py + 0.5) * cellsPerPx);
      for (let qx = 0; qx < px; qx++) {
        const li = halo + Math.floor((qx + 0.5) * cellsPerPx), k = lj * side + li, o = (py * px + qx) * 4;
        let col;
        if (s.lake[k]) col = (!isWater(li - 1, lj) || !isWater(li + 1, lj) || !isWater(li, lj - 1) || !isWater(li, lj + 1)) ? RIM : WATER;
        else col = this.tintH(s.h[k] * 0.1, c);
        data.data[o] = col[0]; data.data[o + 1] = col[1]; data.data[o + 2] = col[2]; data.data[o + 3] = 255;
      }
    }
    ctx.putImageData(data, 0, 0);
  }

  // Contours every 10 m (marching squares on a 2-cell grid), heavier every 50 m, land only.
  paintContours(ctx, s, side, halo, hmin, hmax, pxPerCell) {
    const step = 2, gw = Math.floor((FINE_PX / pxPerCell) / step);
    const hAt = (gi, gj) => s.h[(halo + gj * step) * side + halo + gi * step] * 0.1;
    const wAt = (gi, gj) => s.lake[(halo + gj * step) * side + halo + gi * step] > 0;
    const px = (gi) => (gi * step + 0.5) * pxPerCell;
    const first = Math.ceil(hmin / 10) * 10;
    for (let lvl = first; lvl <= hmax; lvl += 10) {
      ctx.beginPath();
      for (let gj = 0; gj < gw - 1; gj++) for (let gi = 0; gi < gw - 1; gi++) {
        if (wAt(gi, gj) || wAt(gi + 1, gj + 1) || wAt(gi + 1, gj) || wAt(gi, gj + 1)) continue;
        const h00 = hAt(gi, gj), h10 = hAt(gi + 1, gj), h11 = hAt(gi + 1, gj + 1), h01 = hAt(gi, gj + 1);
        const b = (h00 >= lvl ? 1 : 0) | (h10 >= lvl ? 2 : 0) | (h11 >= lvl ? 4 : 0) | (h01 >= lvl ? 8 : 0);
        if (b === 0 || b === 15) continue;
        const x0 = px(gi), y0 = px(gj), x1 = px(gi + 1), y1 = px(gj + 1);
        const lerp = (a, c) => (lvl - a) / (c - a || 1e-6);
        const top = [x0 + (x1 - x0) * lerp(h00, h10), y0], right = [x1, y0 + (y1 - y0) * lerp(h10, h11)];
        const bottom = [x0 + (x1 - x0) * lerp(h01, h11), y1], left = [x0, y0 + (y1 - y0) * lerp(h00, h01)];
        const segs = msSegments(b, top, right, bottom, left);
        for (let q = 0; q < segs.length; q += 2) { ctx.moveTo(segs[q][0], segs[q][1]); ctx.lineTo(segs[q + 1][0], segs[q + 1][1]); }
      }
      const index = lvl % 50 === 0;
      ctx.strokeStyle = index ? 'rgba(128, 104, 62, 0.8)' : 'rgba(140, 118, 76, 0.45)';
      ctx.lineWidth = index ? 2.0 : 1.1;
      ctx.stroke();
    }
  }

  // Depth contours on the lakes the DNR has sounded (the lake table carries a maxDepth for them; lakes with a
  // synthetic bed get none): every 2 m to 10 m, every 5 m to 30 m, every 10 m beyond, heavier every 10 m, on
  // the full 10 m grid. Returns label spots [level, x, z] in world metres for drawMap to letter up close.
  paintDepthContours(ctx, s, side, halo, pxPerCell, tx, ty) {
    const w = this.world, n = Math.round(FINE_PX / pxPerCell), N = n + 1, lakes = w.lakes;
    const mapped = new Map();
    const isMapped = (id) => { let m = mapped.get(id); if (m === undefined) { const l = id > 0 ? lakes[id - 1] : null; m = !!(l && l.maxDepth); mapped.set(id, m); } return m; };
    const depth = new Float32Array(N * N);
    let maxD = 0;
    for (let gj = 0; gj < N; gj++) for (let gi = 0; gi < N; gi++) {
      const k = (halo + gj) * side + halo + gi, id = s.lake[k];
      if (!id || !isMapped(id)) continue;
      const d = (s.lvl[k] - s.h[k]) * 0.1;
      if (d > 0) { depth[gj * N + gi] = d; if (d > maxD) maxD = d; }
    }
    if (maxD < 2) return [];
    const levels = [];
    for (let d = 2; d <= maxD; d += d < 10 ? 2 : d < 30 ? 5 : 10) levels.push(d);
    const px = (g) => (g + 0.5) * pxPerCell;
    const [ox, oz] = w.tileOrigin(tx, ty), mPerPx = w.tileMetres / FINE_PX;
    const labels = [];
    for (const lvl of levels) {
      const segs = [];
      for (let gj = 0; gj < N - 1; gj++) for (let gi = 0; gi < N - 1; gi++) {
        const h00 = depth[gj * N + gi], h10 = depth[gj * N + gi + 1], h11 = depth[(gj + 1) * N + gi + 1], h01 = depth[(gj + 1) * N + gi];
        const b = (h00 >= lvl ? 1 : 0) | (h10 >= lvl ? 2 : 0) | (h11 >= lvl ? 4 : 0) | (h01 >= lvl ? 8 : 0);
        if (b === 0 || b === 15) continue;
        const x0 = px(gi), y0 = px(gj), x1 = px(gi + 1), y1 = px(gj + 1);
        const t = (a, c) => (lvl - a) / (c - a || 1e-6);
        const top = [x0 + (x1 - x0) * t(h00, h10), y0], right = [x1, y0 + (y1 - y0) * t(h10, h11)];
        const bottom = [x0 + (x1 - x0) * t(h01, h11), y1], left = [x0, y0 + (y1 - y0) * t(h00, h01)];
        segs.push(...msSegments(b, top, right, bottom, left));
      }
      if (!segs.length) continue;
      ctx.beginPath();
      for (let q = 0; q < segs.length; q += 2) { ctx.moveTo(segs[q][0], segs[q][1]); ctx.lineTo(segs[q + 1][0], segs[q + 1][1]); }
      const index = lvl % 10 === 0;
      ctx.strokeStyle = index ? 'rgba(52, 92, 122, 0.9)' : 'rgba(70, 112, 142, 0.7)';
      ctx.lineWidth = index ? 1.7 : 1.0;
      ctx.stroke();
      if (segs.length >= 40) { const m = segs[Math.floor(segs.length / 8) * 2]; labels.push([lvl, ox + m[0] * mPerPx, oz + m[1] * mPerPx]); }
    }
    return labels;
  }

  // one image per loaded fine tile, from the tile's own cells, with contours
  fineImage(e) {
    let img = this.fineImages.get(e.key);
    if (img) return img;
    const w = this.world, s = w.slots[e.ty * w.ntx + e.tx];
    if (!s) return null;
    const c = this.paintSlot(s, e.tx, e.ty);
    this.fineImages.set(e.key, c);
    this.mapTiles.delete(e.key); // the streamed copy supersedes a map-only one
    return c;
  }

  // A tile the 3D world has not streamed, fetched for the map alone: the same bytes, decoded here and
  // painted once. Downloads are limited and images are let go least recently drawn first.
  mapTile(tx, ty) {
    const key = `${tx},${ty}`;
    let t = this.mapTiles.get(key);
    if (t) { t.used = this.tick; if (t.slot && !t.img) { t.img = this.paintSlot(t.slot, tx, ty); t.slot = null; } return t.img; }
    if (this.fetching >= MAP_FETCHES) return null;
    t = { used: this.tick, img: null, slot: null };
    this.mapTiles.set(key, t);
    this.fetching++;
    fetch(this.world.tileUrl(tx, ty))
      .then((r) => { if (!r.ok) throw new Error(r.status); return new Response(r.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer(); })
      .then((buf) => { const n = this.world.side * this.world.side; t.slot = { h: new Int16Array(buf, 0, n), lake: new Uint16Array(buf, n * 2, n), sd: new Int16Array(buf, n * 4, n), lvl: new Int16Array(buf, n * 6, n) }; })
      .catch(() => this.mapTiles.delete(key))
      .finally(() => { this.fetching--; });
    return null;
  }
  paintSlot(s, tx, ty) {
    const w = this.world;
    const c = document.createElement('canvas'); c.width = FINE_PX; c.height = FINE_PX;
    const ctx = c.getContext('2d');
    const pxPerCell = FINE_PX / w.tile;
    this.paintCells(ctx, s, w.side, w.halo, FINE_PX, 1 / pxPerCell);
    const f = w.tileFlags[ty * w.ntx + tx];
    let hmin = f ? f[1] * 0.1 : Infinity, hmax = f ? f[2] * 0.1 : -Infinity;
    if (!Number.isFinite(hmin) || !Number.isFinite(hmax)) { for (let k = 0; k < s.h.length; k++) { const h = s.h[k] * 0.1; if (h < hmin) hmin = h; if (h > hmax) hmax = h; } }
    this.paintContours(ctx, s, w.side, w.halo, hmin, hmax, pxPerCell);
    c.labels = s.lvl ? this.paintDepthContours(ctx, s, w.side, w.halo, pxPerCell, tx, ty) : [];
    return c;
  }
  pruneMapTiles() {
    if (this.mapTiles.size <= MAP_TILES_MAX) return;
    const old = [...this.mapTiles.entries()].filter(([, t]) => t.img || t.slot).sort((a, b) => a[1].used - b[1].used);
    for (let i = 0; i < old.length && this.mapTiles.size > MAP_TILES_MAX; i++) this.mapTiles.delete(old[i][0]);
  }

  // one image per loaded far tile (80 m cells), tints and water only
  farImage(e) {
    let img = this.farImages.get(e.key);
    if (img) return img;
    const w = this.world, s = w.farSlots[e.fy * w.far.ntx + e.fx];
    if (!s) return null;
    const c = document.createElement('canvas'); c.width = FAR_PX; c.height = FAR_PX;
    this.paintCells(c.getContext('2d'), s, w.farSide, w.far.halo, FAR_PX, w.far.tile / FAR_PX);
    this.farImages.set(e.key, c);
    return c;
  }

  // --- the journal lines, the place title, the catch card -----------------------------------------------------
  // a line that shows for a few seconds (a meal, a find, a word from the outfitter); two at most, the oldest goes
  note(text, seconds = NOTE_HOLD) {
    const box = this.el.lines;
    if (!box || !text) return;
    if (this.settings && !this.settings.showLines) return;
    while (box.children.length >= 2) { const c = box.firstElementChild; clearTimeout(c._timer); c.remove(); } // the oldest goes at once: two at most
    const el = document.createElement('div'); el.className = 'line fade'; el.textContent = text;
    box.appendChild(el);
    requestAnimationFrame(() => el.classList.add('show'));
    const t = setTimeout(() => this.dropLine(el), seconds * 1000);
    el._timer = t;
  }
  dropLine(el) {
    if (!el || !el.parentNode) return;
    clearTimeout(el._timer);
    el.classList.remove('show');
    setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, 700);
  }
  // the place title: a kicker, the name large, a line under it
  showPlace(kicker, name, sub, seconds = TITLE_HOLD) {
    if (this.settings && !this.settings.showTitles) return;
    if (this.paper) { this.pendingTitle = { kicker, name, sub, seconds }; return; }
    this.pendingTitle = null;
    const e = this.el;
    e.placeKicker.textContent = kicker || ''; e.placeName.textContent = name || ''; e.placeSub.textContent = sub || '';
    e.place.classList.add('show');
    clearTimeout(this.titleTimer);
    this.titleTimer = setTimeout(() => e.place.classList.remove('show'), seconds * 1000);
  }

  // --- per frame ------------------------------------------------------------------------------------------
  // ctx: { player, geo, ts, day, wind, fishing, energy, tasks, outfitter, stats, fps, shell, trip }
  update(ctx) {
    this.ctx = ctx;
    const { player, settings } = { player: ctx.player, settings: this.settings };
    this.player = player;
    const air = this.el.air;
    if (settings) {
      air.classList.toggle('nohints', !settings.get('keyHints'));
      air.classList.toggle('cb', !!settings.get('cbMarks'));
      // the readout always on, or the corner sheet, as the density asks
      if (settings.readoutMode === 'always') { if (!this.tab.shown) this.showReadout(true); }
      else if (this.tab.shown && !this.tab.held && settings.readoutMode === 'hold') this.showReadout(false);
      if (this.mode === 'hidden' && settings.cornerSheet) this.setMode('corner');
      else if (this.mode === 'corner' && !settings.cornerSheet) this.setMode('hidden');
      if (settings.readoutMode !== 'always' && this.tab.shown && !this.tab.held && settings.readoutMode !== 'toggle') this.showReadout(false);
    }
    if (!this.paper && this.pendingTitle) { const t = this.pendingTitle; this.showPlace(t.kicker, t.name, t.sub, t.seconds); }
    air.classList.toggle('lines', this.el.lines.children.length > 0); // the place title keeps above live lines
    this.updateCompass(ctx);
    this.updateTitles(ctx);
    this.updatePrompt(ctx);
    this.updateBalance(ctx);
    this.updateFishing(ctx);
    this.updateMarks(ctx);
    if (this.tab.shown) this.renderReadout();
    if (this.mode !== 'hidden' && !ctx.shell) {
      if (this.mode !== 'sheet') { this.view.cx = player.x; this.view.cz = player.z; this.view.span = GLANCE_SPAN; }
      if (!this.grain) this.sizeCanvas();
      if (this.grain) { this.drawMap(player); this.updateMapChrome(); }
    }
  }

  set(key, el, value, prop = 'textContent') { if (this.cache[key] !== value) { this.cache[key] = value; el[prop] = value; } }

  // the compass: the needle is the canoe's heading, the gold arrow on the rim is where the wind is going;
  // it speaks (label, waves, full strength) when the wind matters, and is faint or away otherwise
  updateCompass(ctx) {
    const { player, wind } = ctx, e = this.el, s = this.settings;
    if (!wind) return;
    const H = player.waveHeightHere || 0;
    const matters = wind.fresh || H > WAVE_MATTERS;
    const mode = s ? s.compassMode : 'always';
    const show = mode === 'always' || (mode === 'wind' && matters);
    e.compass.classList.toggle('show', show);
    e.compass.classList.toggle('loud', matters);
    if (!show) return;
    const hdg = bearingOf(player.heading);
    this.set('needle', e.needle, `rotate(${hdg.toFixed(1)}deg)`, 'style');
    e.needle.style.transform = `rotate(${hdg.toFixed(1)}deg)`;
    e.windArrow.style.transform = `rotate(${((wind.from + 180) % 360).toFixed(1)}deg)`;
    e.compass.querySelector('svg').setAttribute('aria-label', `Compass: heading ${compassLong(hdg)}; ${wind.label.toLowerCase()} from the ${wind.compassLong}`);
    if (matters) {
      this.set('clabel', e.compassLabel, `${wind.label} · ${wind.speed.toFixed(0)} m/s`, 'innerHTML');
      e.compassLabel.innerHTML = `${esc(wind.label)} · ${wind.speed.toFixed(0)} m/s<br>from the ${wind.compassLong}`;
      const f = player.forward, wd = wind.dir, cosRel = f.x * wd.x + f.z * wd.z;
      const aspect = player.mode !== 'paddle' ? '' : Math.abs(cosRel) < 0.5 ? ' · beam on' : cosRel < 0 ? ' · on the bow' : ' · astern';
      this.set('cwaves', e.compassWaves, `waves ${H.toFixed(1)} m${aspect}${wind.override != null ? ' · set by hand' : ''}`);
    }
  }

  // the trip's day in words: "Day 3 of 5" (Adventure), "Day 3" (Sandbox, or before the trip core), '' between trips
  dayWords(ctx) {
    const { trip, outfitter } = ctx;
    if (trip) return trip.active ? trip.dayWords(true) : '';
    const t = outfitter && outfitter.trip;
    return t && t.active ? `Day ${Math.floor(outfitter.daysOut) + 1}` : '';
  }
  // arriving on a named lake, and the day card at dawn
  updateTitles(ctx) {
    const { player, day, wind, stats, outfitter, energy, trip: core } = ctx, w = this.world;
    if (ctx.shell) return; // the title card is up: nothing has happened yet
    const id = player.mode === 'paddle' && !player.teleporting ? player.lakeId : 0;
    if (id > 0 && id !== this.lastLakeId) {
      const name = w.lakeName(id);
      if (name) {
        const l = w.lakes[id - 1], trip = outfitter && outfitter.trip;
        const dayW = this.dayWords(ctx);
        const kicker = `${dayW ? `${dayW} · ` : ''}${clock12(day.hours)}${wind ? ` · ${wind.label.toLowerCase()} from the ${wind.compassLong}` : ''}`;
        const parts = [];
        if (trip && trip.active && stats) parts.push(stats.portages ? `${word(stats.portages)[0].toUpperCase()}${word(stats.portages).slice(1)} ${plural(stats.portages, 'portage')} from ${trip.fromName || 'the landing'}` : `Out from ${trip.fromName || 'the landing'}`);
        if (stats && stats.km > 0.05) parts.push(`${fmtKm(stats.km)} km paddled`);
        parts.push(lakeWords(l));
        this.showPlace(kicker, name, parts.join(' · '));
      }
      this.lastLakeId = id;
    } else if (id > 0) this.lastLakeId = id;
    // dawn: the clock crossed sunrise (not by a jump: a night slept shows its own card)
    if (day) {
      const rise = day.sunriseSunset.rise, h = day.hours, prev = this.lastHours, jumped = (day.jumps || 0) !== (this.lastJumps || 0);
      this.lastJumps = day.jumps || 0;
      if (!jumped && rise != null && prev != null && prev < rise && h >= rise && h - prev < 1 && this.lastDawnDoy !== day.doy) {
        this.lastDawnDoy = day.doy;
        const dayW = this.dayWords(ctx);
        const here = player.placeName || w.lakeName(player.lakeId) || 'Open country';
        const food = energy && !(core && core.sandbox) ? (energy.food > 0 ? `${foodWords(energy.food)} of food` : 'the food pack is empty') : '';
        const out = core && core.active && core.dueIn != null ? `out by ${core.outBy('day')}` : '';
        const sub = [here, stats && stats.km > 0.05 ? `${fmtKm(stats.km)} km paddled so far` : '', food, out].filter(Boolean).join(' · ');
        this.showPlace(`${longDate(day.year, day.doy)} · sunrise ${clock12(rise)}${wind ? ` · ${wind.label.toLowerCase()} from the ${wind.compassLong}` : ''}`, dayW || 'A new day', sub);
      }
      this.lastHours = h;
    }
  }

  // one action line: what the player (or the rod) is saying, the key outlined, the rest of the line dimmer
  updatePrompt(ctx) {
    const { player, fishing } = ctx, e = this.el;
    const fu = fishing ? fishing.ui : null;
    const p = player.prompt || (fu && fu.message ? { key: null, text: fu.message } : null);
    this.el.air.classList.toggle('prompt', !!p); // the action line owns the bottom row: the journal lines lift
    if (!p) { e.prompt.classList.remove('show'); return; }
    const key = p.key ? `<kbd>${esc(p.key)}</kbd>` : '';
    let text = String(p.text || ''), main = text, hint = p.hint || '';
    if (!hint) {
      const m = text.match(/\s*(?:&nbsp;)?\s·\s(?:&nbsp;)?\s*/) || text.match(/&nbsp;·&nbsp;/);
      if (m && m.index > 0) { main = text.slice(0, m.index); hint = text.slice(m.index + m[0].length); }
    }
    const feel = /^feels like/i.test(hint);
    const alt = /<kbd>/i.test(hint);
    const html = `${key}<span class="main">${main}</span>${hint ? `<span class="hint${feel ? ' feel' : ''}${alt ? ' alt' : ''}">${alt ? '' : '· '}${hint}</span>` : ''}`;
    this.set('prompt', e.prompt, html, 'innerHTML');
    e.prompt.classList.add('show');
  }

  // the balance arc above the action line while the hull is being worked by a sea
  updateBalance(ctx) {
    const { player, wind } = ctx, e = this.el, b = player.balance || 0;
    const show = player.mode === 'paddle' && b > 0.01;
    e.balance.classList.toggle('show', show);
    this.el.air.classList.toggle('balance', show);
    if (!show) return;
    const f = player.forward, wd = wind ? wind.dir : { x: 0, z: 1 };
    const side = Math.sign(f.x * wd.z - f.z * wd.x) || 1; // which gunwale the sea is pushing down
    const th = side * clamp(b, 0, 1) * (Math.PI / 2);
    e.balanceDot.setAttribute('cx', (140 + 110 * Math.sin(th)).toFixed(1));
    e.balanceDot.setAttribute('cy', (120 - 110 * Math.cos(th)).toFixed(1));
    e.balance.classList.toggle('hot', b > 0.6);
    e.balance.querySelector('svg').setAttribute('aria-label', `Balance: ${b > 0.6 ? 'heeling hard' : b > 0.3 ? 'heeling' : 'steady'}`);
  }


  // the status marks, bottom right at half strength: the time scale, the clock stopped, the trip's when it matters (the
  // food down to a day, out by tomorrow, the gear wet), the GPS link, mute, tiles loading
  marksBuild() {
    const m = this.el.marks; if (!m) return;
    m.innerHTML = `<span id="mark-speed"></span><span id="mark-clock" class="sc">clock stopped</span>`
      + '<span id="mark-food" class="sc"></span><span id="mark-out" class="sc"></span><span id="mark-wet" class="sc">gear wet</span>'
      + `<svg id="mark-gps" width="14" height="14" viewBox="0 0 14 14" role="img" aria-label="GPS link to the extension is live"><circle cx="7" cy="7" r="3" fill="currentColor"/><circle cx="7" cy="7" r="6" fill="none" stroke="currentColor" stroke-width="1"/></svg>`
      + `<svg id="mark-mute" width="16" height="14" viewBox="0 0 16 14" role="img" aria-label="Sound is off"><polygon points="1,5 4,5 8,2 8,12 4,9 1,9" fill="currentColor"/><path d="M10 4l5 6M15 4l-5 6" stroke="currentColor" stroke-width="1.4"/></svg>`
      + `<svg id="mark-tiles" width="14" height="14" viewBox="0 0 14 14" role="img" aria-label="Tiles loading"><circle cx="7" cy="7" r="5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-dasharray="8 24"><animateTransform attributeName="transform" type="rotate" from="0 7 7" to="360 7 7" dur="1.6s" repeatCount="indefinite"/></circle></svg>`;
    this.mk = { speed: $('mark-speed'), clock: $('mark-clock'), food: $('mark-food'), out: $('mark-out'), wet: $('mark-wet'), gps: $('mark-gps'), mute: $('mark-mute'), tiles: $('mark-tiles') };
  }
  updateMarks(ctx) {
    const { ts, geo, day, trip, energy } = ctx, mk = this.mk, w = this.world; if (!mk) return;
    const sp = ts > 1 ? `×${ts}` : '';
    this.set('mspeed', mk.speed, sp); mk.speed.classList.toggle('on', !!sp);
    mk.clock.classList.toggle('on', !!(day && !day.running && !ctx.shell));
    const adv = !!(trip && trip.adventure && trip.active && !ctx.shell);
    const food = adv && energy && energy.food <= 1 ? (energy.food <= 0 ? 'no food' : `${foodWords(energy.food)} of food`) : '';
    this.set('mfood', mk.food, food); mk.food.classList.toggle('on', !!food);
    const due = adv ? trip.dueIn : null;
    const out = due == null || due > 1 ? '' : due === 1 ? 'out tomorrow' : due === 0 ? 'out today' : 'overdue';
    this.set('mout', mk.out, out); mk.out.classList.toggle('on', !!out);
    mk.wet.classList.toggle('on', adv && !!trip.state.wet);
    mk.gps.classList.toggle('on', !!(geo && geo.linked && geo.enabled));
    mk.mute.classList.toggle('on', !!(this.settings && this.settings.get('mute')));
    let loading = 0;
    if (w.tiles) { const t = w.tiles; loading = t.queue.length + t.pending.length + t.workers.filter((k) => k.key).length; }
    this.loading = loading;
    mk.tiles.classList.toggle('on', loading > 0);
  }

  // --- fishing: the spot card, the reticle, the lure strip, the tension line, the catch card -----------------
  updateFishing(ctx) {
    const { fishing } = ctx, e = this.el, f = this.fishUi, air = this.el.air;
    const u = fishing ? fishing.ui : null;
    if (!u) return;
    const rod = !!u.rodUp;
    air.classList.toggle('rod', rod);
    // the spot card, top left
    const showSpot = rod && !!(u.spot && (u.spot.where || u.spot.who));
    e.spot.classList.toggle('show', showSpot);
    if (showSpot) { this.set('spotWhere', e.spotWhere, u.spot.where || ''); this.set('spotWho', e.spotWho, u.spot.who || ''); }
    this.set('stringer', e.stringer, u.stringer ? `${u.stringer} on the stringer` : '');
    e.stringer.classList.toggle('show', rod && u.stringer > 0 && !f.catchShown);
    // the lure strip while the cast is ready or loading
    const strip = rod && (u.state === 'ready' || u.state === 'charging');
    e.lures.classList.toggle('show', strip);
    if (u.lures && f.lure !== u.lure) { e.lures.innerHTML = u.lures.map((l, i) => `<span class="${i === u.lure ? 'on' : ''}"><b>${i + 1}</b>${esc(l.name)}</span>`).join(''); f.lure = u.lure; }
    // the reticle on the water, the cast ring filling round it while the cast loads
    const aim = strip && u.aim && this.camera ? u.aim : null;
    let onScreen = false;
    if (aim) {
      const v = this._v.set(aim.x, aim.y, aim.z).project(this.camera);
      onScreen = v.z < 1 && Math.abs(v.x) < 1.05 && Math.abs(v.y) < 1.05;
      if (onScreen) {
        const z = (this.settings && this.settings.get('hudScale')) || 1;
        const sx = ((v.x + 1) / 2) * window.innerWidth / z, sy = ((1 - v.y) / 2) * window.innerHeight / z;
        e.reticle.style.transform = `translate(${sx.toFixed(1)}px, ${sy.toFixed(1)}px)`;
        const C = 2 * Math.PI * 44, fill = u.power != null ? clamp(u.power, 0, 1) : 0;
        e.reticleRing.setAttribute('stroke-dasharray', `${(C * fill).toFixed(1)} ${C.toFixed(1)}`);
        this.set('rdist', e.reticleDist, aim.dist > 0 ? `about ${Math.round(aim.dist)} m` : '');
        e.reticle.style.opacity = aim.inReach ? '1' : '.55';
      }
    }
    e.reticle.classList.toggle('show', !!aim && onScreen);
    // the tension line
    const ft = u.fight;
    e.tension.classList.toggle('show', !!ft);
    if (ft) {
      const pct = `${(clamp(ft.tension, 0, 1) * 100).toFixed(1)}%`;
      e.tensionFill.style.width = pct; e.tensionEnd.style.width = pct;
      e.tension.classList.toggle('hot', ft.danger > 0.3); e.tension.classList.toggle('slack', ft.danger <= 0.3 && ft.slack > 0.8);
      const html = `<span>Tension</span><span class="dot">·</span><span>${ft.line.toFixed(0)} m of line out</span>${ft.run ? '<span class="dot">·</span><span class="run">it is running</span>' : ft.slack > 0.8 ? '<span class="dot">·</span><span class="run">slack</span>' : ''}`;
      this.set('tlabel', e.tensionLabel, html, 'innerHTML');
    }
    // the catch card: on a landing, for the hold-up or 8 s, whichever is longer
    const L = u.landed;
    const now = performance.now();
    if (L && f.catchKey !== L.key) {
      f.catchKey = L.key; f.catchUntil = now + CATCH_HOLD * 1000;
      e.catchFish.innerHTML = fishSilhouette(L.species);
      e.catchName.textContent = L.name;
      e.catchSize.textContent = `${L.length} cm · ${L.weight} kg / ${(L.weight * 2.2046).toFixed(1)} lb`;
      e.catchMeta.textContent = `${L.lake} · ${String(L.lure).toLowerCase()} · ${L.time}`;
      e.catch.classList.toggle('pb', !!L.best);
    }
    const showCatch = !!L || (f.catchKey != null && now < f.catchUntil);
    if (!showCatch) f.catchKey = null;
    f.catchShown = showCatch;
    e.catch.classList.toggle('show', showCatch);
    air.classList.toggle('catch', showCatch);
  }

  // --- the readout: every number that left the screen, while Tab is held ---------------------------------------
  renderReadout(force = false) {
    const ctx = this.ctx; if (!ctx) return;
    const now = performance.now();
    if (!force && now - (this.readoutAt || 0) < 250) return;
    this.readoutAt = now;
    const { player, geo, ts, day, wind, energy, tasks, stats, fps, trip: core } = ctx, w = this.world, s = this.settings;
    const id = player.lakeId, lake = id > 0 ? w.lakes[id - 1] : null;
    const name = player.placeName || w.lakeName(id) || 'Open water';
    const dayW = this.dayWords(ctx);
    const { lat, lon } = w.toLatLon(player.x, player.z);
    const rows = [];
    const row = (lab, html, cls = '') => rows.push(`<div class="sc">${lab}</div><div class="${cls}">${html}</div>`);
    row('Where', `${lat.toFixed(5)}, ${lon < 0 ? '−' : ''}${Math.abs(lon).toFixed(5)} · ${player.altitude.toFixed(0)} m above the sea`);
    const deep = player.onFoot ? 0 : Math.max(0, player.level - w.heightAt(player.x, player.z));
    if (deep > 0.05 || lake) {
      const parts = [];
      if (deep > 0.05) parts.push(`${deep.toFixed(1)} m deep here${lake && lake.maxDepth ? `, ${Math.round(lake.maxDepth)} m at most` : ''}`);
      if (lake && lake.secchi) parts.push(`clarity ${lake.secchi.toFixed(1)} m${lake.secchiMeasured ? ', sounded by the DNR' : ', by the look of it'}`);
      if (parts.length) row('Water', parts.join(' · '));
    }
    const hdg = bearingOf(player.heading), today = stats ? stats.today : null;
    row('Way', `${((player.groundSpeed ?? Math.abs(player.speed)) * 3.6).toFixed(1)} km/h · heading ${hdg.toFixed(0)}°, ${compassLong(hdg)}${today ? ` · ${fmtKm(today.km)} km and ${today.portages} ${plural(today.portages, 'portage')} today` : ''}`);
    if (wind) row('Wind', `${esc(wind.label)} · ${wind.speed.toFixed(0)} m/s from the ${wind.compassLong} · waves ${(player.waveHeightHere || 0).toFixed(1)} m${wind.override != null ? ' · set by hand' : ''}`);
    if (day) {
      const { rise, set } = day.sunriseSunset, h = day.hours;
      const light = set != null && h < set && (rise == null || h >= rise) ? `Sunset ${clock12(set)} · dark by ${clock12(Math.min(23.99, set + 0.8))}` : rise != null ? `Sunrise ${clock12(h < (rise || 0) ? rise : rise)}${h >= (set || 24) ? ' tomorrow' : ''}` : 'No sun today';
      const rate = day.rate != null && day.rate < 0.99 ? `at a third while you travel${ts > 1 ? `, ×${ts}` : ''}` : `at ×${ts}`;
      row('Light', `${light} · clock ${day.running ? rate : 'stopped'}`);
    }
    // the trip: the season's paper (its number, home, the day of the trip) and the money, then the energy, then the pack
    if (core && (core.active || (core.profile && core.profile.started))) { // hubs 1A
      const p = core.permit, pr = core.profile, home = pr && pr.home != null ? core.placeOf(pr.home) : '';
      const bits = [core.sandbox ? 'Sandbox' : p && p.no ? p.no : 'not yet stamped', home ? `home ${home}` : '', core.active ? core.dayWords() : 'between trips', pr ? `$${pr.money} in hand` : ''];
      row('Permit', esc(bits.filter(Boolean).join(' · ')));
    }
    if (energy) {
      const v = energy.value, cap = energy.ceiling, awake = energy.awake, adv = !!(core && core.adventure && core.active);
      const up = adv ? ` · up ${awake < 1 ? 'less than an hour' : `${Math.round(awake)} h`}` : '';
      const rest = cap > 0.995 || v > 0.97 ? '' : v < cap - 0.01 ? ` · rest brings it to ${Math.round(cap * 100)} %` : ' · only sleep brings it higher';
      row('Energy', `<span class="bar"><i style="width:${Math.round(v * 100)}%"></i></span>${Math.round(v * 100)} %${up}${rest}`);
      const food = energy.food, sand = !!(core && core.sandbox);
      const meal = !sand && food <= 0 ? '' : day && day.sunriseSunset.set != null && day.hours < day.sunriseSunset.set && day.hours >= (day.sunriseSunset.rise || 0) ? 'supper at sunset' : 'breakfast at dawn';
      const pk = core ? core.state.packs : null;
      const packs = player.packs && player.packs.summary ? esc(player.packs.summary) : pk ? `${pk.count === 1 ? 'one pack' : 'two packs'}, ${pk.canoe === 'kevlar' ? 'Kevlar' : 'aluminium'} canoe` : '';
      const foodW = sand ? 'food that keeps' : food > 0 ? `${foodWords(food)} of food` : 'the food pack is empty';
      row('Pack', [packs, foodW, meal, core && core.state.wet ? 'the gear is wet' : ''].filter(Boolean).join(' · '));
    }
    if (tasks) {
      const open = tasks.active.length, done = tasks.active.filter((t) => t.status === 'done').length;
      row('Tasks', open ? `${open - done} on the go${done ? ` · ${done} done, to turn in at any outfitter` : ''}` : 'nothing on the go · the board is at any outfitter');
    }
    const dev = s && s.get('devRows'), showFps = s && s.get('fps');
    if (dev && geo) row('GPS sim', `${geo.linked ? (geo.enabled ? 'broadcasting to the extension' : 'extension installed, switched off') : 'extension not detected · this tab only'} · hdg ${hdg.toFixed(0)}°`, 'soft');
    if (dev || showFps) {
      const parts = [];
      if (dev && w.tiles) parts.push(`${w.tiles.readyTiles().length} tiles in${this.loading ? `, ${this.loading} loading` : ''}`);
      if (showFps && fps) parts.push(fps.text || '…');
      if (parts.length) row('World', `${parts.join(' · ')} <span class="dev">(Developer rows)</span>`, 'soft');
    }
    const mode = s ? s.readoutMode : 'hold';
    const foot = mode === 'always' ? 'Always on · Settings › HUD' : mode === 'toggle' ? '<kbd>Tab</kbd> hides it · Full density keeps it up' : '<kbd>Tab</kbd> held · let go to hide · Full density keeps it up';
    const html = `<div class="head"><div class="name">${esc(name)}</div><div class="sc date">${dayW ? `${dayW} · ` : ''}${day ? `${longDate(day.year, day.doy)} · ${clock12(day.hours)}` : ''}</div></div><div class="grid">${rows.join('')}</div><div class="foot">${foot}</div>`;
    this.set('readout', this.el.readout, html, 'innerHTML');
  }

  // --- the map's chrome: the header band, the layer toggles, the footer scale -----------------------------------
  updateMapChrome() {
    const e = this.el, w = this.world, v = this.view;
    const id = this.mode === 'sheet' ? w.lakeIdAt(v.cx, v.cz) || (this.player ? this.player.lakeId : 0) : (this.player ? this.player.lakeId : 0);
    const name = w.lakeName(id) || 'open country';
    const code = sheetCode(w, v.cx, v.cz);
    this.set('mtitle', e.mapTitle, this.mode === 'sheet' ? `Fisher map ${code} · ${name}` : `${code} · ${name}`);
    if (e.mapHint) this.set('mhint', e.mapHint, `drag to pan · wheel to zoom · click a spot ${this.pinLocked ? 'for the way there' : 'to paddle in'} · depths in metres where the DNR has sounded`);
    this.set('mspan', e.mapSpan, `${v.span >= 10000 ? Math.round(v.span / 1000) : (v.span / 1000).toFixed(v.span < 5000 ? 1 : 0)} km across`);
    if (this.mode === 'sheet' && this.scaleInfo) {
      const { bar, cssPx } = this.scaleInfo, txt = `${bar >= 1000 ? `${bar / 1000} km` : `${bar} m`}`;
      if (this.scaleShown !== txt + cssPx) { this.scaleShown = txt + cssPx; e.mapScalebar.style.width = `${cssPx.toFixed(0)}px`; e.mapScale.textContent = txt; }
      const far = v.span / this.canvas.width >= 7;
      const d = e.mapLayers.querySelector('[data-layer=depths]'); if (d) d.classList.toggle('far', far);
    }
  }

  // --- the sheet itself ------------------------------------------------------------------------------------------
  drawMap(player) {
    const w = this.world, ctx = this.mapCtx, W = this.canvas.width, H = this.canvas.height;
    if (!W || !H) return;
    const v = this.view, spanX = v.span, mPerPx = spanX / W, spanZ = mPerPx * H;
    const x0 = v.cx - spanX / 2, z0 = v.cz - spanZ / 2;
    const k = W / 1040; // stroke and type scale: the sheet is designed at 1040 px across
    const sheet = this.mode === 'sheet', lay = this.layers;
    const toPx = (x, z) => [(x - x0) / mPerPx, (z - z0) / mPerPx];
    const inView = (ax, az, bx, bz) => !(bx < x0 || ax > x0 + spanX || bz < z0 || az > z0 + spanZ);
    ctx.fillStyle = PAPER;
    ctx.fillRect(0, 0, W, H);
    ctx.imageSmoothingEnabled = true;
    const depthLabels = []; // [level, x, z] from the fine tiles in view, lettered once the view is close
    // the whole wilderness underneath
    if (this.overview) {
      const mpp = w.meta.overview.cellsPerPx * w.cell;
      const [a, b] = toPx(w.minX, w.minZ);
      ctx.drawImage(this.overview, a, b, (w.sizeX / mpp) * (mpp / mPerPx), (w.sizeZ / mpp) * (mpp / mPerPx));
    }
    if (w.tiles) {
      // the far field
      const farMetres = w.far.tile * w.cell * w.far.factor;
      const aliveFar = new Set();
      for (const e of w.tiles.readyFarTiles()) {
        aliveFar.add(e.key);
        const ox = w.originX + e.fx * farMetres, oz = w.originZ + e.fy * farMetres;
        if (!inView(ox, oz, ox + farMetres, oz + farMetres)) continue;
        const img = this.farImage(e);
        if (!img) continue;
        const [a, b] = toPx(ox, oz);
        ctx.drawImage(img, a, b, farMetres / mPerPx + 0.5, farMetres / mPerPx + 0.5);
      }
      for (const key of this.farImages.keys()) if (!aliveFar.has(key)) this.farImages.delete(key);
      // every tile in view at full detail once the view is close enough for contours to read: streamed
      // tiles from their own cells, the rest fetched for the map alone
      const live = new Map(w.tiles.readyTiles().map((e) => [e.key, e]));
      for (const key of this.fineImages.keys()) if (!live.has(key)) this.fineImages.delete(key);
      if (mPerPx < FINE_M_PER_PX) {
        this.tick++;
        const [tx0, ty0] = w.tileOf(x0, z0), [tx1, ty1] = w.tileOf(x0 + spanX, z0 + spanZ);
        // nearest the centre first, so the middle of the view sharpens before the edges
        const order = [];
        for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) order.push([tx, ty, Math.hypot(tx + 0.5 - (v.cx - w.originX) / w.tileMetres, ty + 0.5 - (v.cz - w.originZ) / w.tileMetres)]);
        order.sort((p, q) => p[2] - q[2]);
        let painted = 0;
        for (const [tx, ty] of order) {
          const key = `${tx},${ty}`, e = live.get(key);
          let img;
          if (e) img = this.fineImage(e);
          else if (painted < 2 || this.mapTiles.get(key)?.img) { const had = this.mapTiles.get(key)?.img; img = this.mapTile(tx, ty); if (img && !had) painted++; }
          if (!img) continue;
          const [ox, oz] = w.tileOrigin(tx, ty);
          const [a, b] = toPx(ox, oz);
          ctx.drawImage(img, a, b, w.tileMetres / mPerPx + 0.5, w.tileMetres / mPerPx + 0.5);
          if (mPerPx < 7 && img.labels && lay.depths) depthLabels.push(...img.labels);
        }
        this.pruneMapTiles();
      }
    }
    ctx.drawImage(this.grain, 0, 0);
    // depth figures on the sounded lakes, in metres, haloed in the water colour
    if (depthLabels.length) {
      ctx.font = `600 ${11 * k}px ${SERIF}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.lineWidth = 3 * k; ctx.strokeStyle = `rgb(${WATER.join(',')})`; ctx.fillStyle = '#2d4f66'; ctx.lineJoin = 'round';
      for (const [lvl, x, z] of depthLabels) { if (!inView(x, z, x, z)) continue; const [a, b] = toPx(x, z); ctx.strokeText(String(lvl), a, b); ctx.fillText(String(lvl), a, b); }
      ctx.textBaseline = 'alphabetic';
    }
    // portages: red dashed, with the rod count beside the middle of the trail when there is room
    const close = mPerPx < 16, mid = mPerPx < 60;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.font = `italic 600 ${13 * k}px ${SERIF}`;
    if (lay.portages) for (const p of w.portages) {
      const [bx0, bz0, bx1, bz1] = p.bbox;
      if (!inView(bx0, bz0, bx1, bz1)) continue;
      ctx.beginPath();
      p.pts.forEach(([x, z], n) => { const [a, b] = toPx(x, z); if (n) ctx.lineTo(a, b); else ctx.moveTo(a, b); });
      ctx.setLineDash(close ? [7 * k, 4 * k] : [4 * k, 3 * k]); ctx.strokeStyle = '#c0392b'; ctx.lineWidth = (close ? 2.4 : 1.6) * k; ctx.stroke(); ctx.setLineDash([]);
      if (close) {
        const m = p.pts[Math.floor(p.pts.length / 2)], [mx, my] = toPx(m[0], m[1]);
        ctx.fillStyle = '#b4321f'; ctx.textAlign = 'left';
        ctx.fillText(`${p.rods} rods`, mx + 7 * k, my - 6 * k);
      }
    }
    // campsites: red dots with a pale centre
    if (mid && lay.campsites) {
      const r = (close ? 4.2 : 2.6) * k;
      for (const c of w.campsites) {
        if (!inView(c.x, c.z, c.x, c.z)) continue;
        const [a, b] = toPx(c.x, c.z);
        ctx.beginPath(); ctx.arc(a, b, r, 0, 6.28); ctx.fillStyle = '#c0392b'; ctx.fill();
        if (close) { ctx.beginPath(); ctx.arc(a, b, r * 0.38, 0, 6.28); ctx.fillStyle = '#f4e9d6'; ctx.fill(); }
      }
    }
    // task areas: a soft circle around the lake, never the spot
    const hints = lay.tasks && this.ctx && this.ctx.tasks ? this.ctx.tasks.hints() : [];
    for (const h of hints) {
      if (!inView(h.x - h.r, h.z - h.r, h.x + h.r, h.z + h.r)) continue;
      const [a, b] = toPx(h.x, h.z), r = h.r / mPerPx;
      ctx.beginPath(); ctx.arc(a, b, r, 0, 6.28);
      ctx.fillStyle = 'rgba(192, 57, 43, 0.13)'; ctx.fill();
      ctx.setLineDash([6 * k, 5 * k]); ctx.strokeStyle = 'rgba(160, 45, 35, 0.6)'; ctx.lineWidth = 1.6 * k; ctx.stroke(); ctx.setLineDash([]);
    }
    // lake names, letter-spaced serif capitals, for lakes wide enough on screen to carry one
    if (lay.lakes) {
      ctx.font = `italic 600 ${(close ? 17 : 14) * k}px ${SERIF}`; ctx.fillStyle = '#2d4f66'; ctx.textAlign = 'center';
      const minCells = Math.max(600, (5 * mPerPx) ** 2);
      for (const l of w.lakes) {
        if (!l || !l.name || l.cells < minCells || !inView(l.cx, l.cz, l.cx, l.cz)) continue;
        const [a, b] = toPx(l.cx, l.cz);
        ctx.fillText(l.name.toUpperCase().split('').join(String.fromCharCode(8202)), a, b + 6 * k);
      }
    }
    // entry points: the outfitters' docks, a pier with a shack at its root
    ctx.font = `600 ${11 * k}px ${SERIF}`;
    for (const ep of w.entryPoints) {
      if (!inView(ep.x, ep.z, ep.x, ep.z)) continue;
      const [a, b] = toPx(ep.x, ep.z);
      ctx.save(); ctx.translate(a, b); ctx.scale(k, k);
      ctx.fillStyle = '#5e4630';
      ctx.fillRect(-1.6, -9, 3.2, 12);
      for (const y of [-7, -3, 1]) ctx.fillRect(-3.2, y, 6.4, 1.4);
      ctx.fillStyle = '#b4321f';
      ctx.fillRect(-4.5, 3, 9, 5);
      ctx.beginPath(); ctx.moveTo(-5.5, 3); ctx.lineTo(0, -1.5); ctx.lineTo(5.5, 3); ctx.closePath(); ctx.fill();
      ctx.restore();
      if (mid) { ctx.fillStyle = '#4a3b26'; ctx.textAlign = 'center'; ctx.fillText(`EP ${ep.ep}`, a, b + 19 * k); }
    }
    // the canoe where it was left (beached or set down), so you can find your way back to it
    const hull = player.hullDown;
    if (hull && inView(hull.x, hull.z, hull.x, hull.z)) {
      const [a, b] = toPx(hull.x, hull.z);
      ctx.save(); ctx.translate(a, b); ctx.rotate(-hull.heading + Math.PI / 2); ctx.scale(k, k);
      ctx.fillStyle = '#e8562f'; ctx.strokeStyle = '#3b2a1a'; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(0, -10); ctx.quadraticCurveTo(4.5, 0, 0, 10); ctx.quadraticCurveTo(-4.5, 0, 0, -10); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.restore();
    }
    // you: the canoe when it is with you, a walker's dot with a heading tick when it is not
    if (inView(player.x, player.z, player.x, player.z)) {
      const [a, b] = toPx(player.x, player.z);
      ctx.save(); ctx.translate(a, b); ctx.rotate(-player.heading + Math.PI / 2); ctx.scale(k, k);
      ctx.fillStyle = '#e8562f'; ctx.strokeStyle = '#3b2a1a'; ctx.lineWidth = 1.6;
      if (hull) {
        ctx.beginPath(); ctx.moveTo(0, -10); ctx.lineTo(0, -4); ctx.stroke();
        ctx.beginPath(); ctx.arc(0, 0, 4.5, 0, 6.28); ctx.fill(); ctx.stroke();
      } else {
        ctx.beginPath(); ctx.moveTo(0, -11); ctx.lineTo(7, 8); ctx.lineTo(0, 4); ctx.lineTo(-7, 8); ctx.closePath(); ctx.fill(); ctx.stroke();
      }
      ctx.restore();
    }
    // the pin waiting for a confirmation, and the pencil line from the canoe to it
    if (this.pin && sheet) {
      const [a, b] = toPx(this.pin.x, this.pin.z);
      if (inView(player.x, player.z, player.x, player.z)) {
        const [pa, pb] = toPx(player.x, player.z);
        ctx.save(); ctx.strokeStyle = '#4a4036'; ctx.lineWidth = 1.4 * k; ctx.setLineDash([2 * k, 5 * k]); ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(pa, pb); ctx.quadraticCurveTo((pa + a) / 2, Math.min(pb, b) - Math.abs(a - pa) * 0.25, a, b); ctx.stroke(); ctx.restore();
      }
      ctx.save(); ctx.translate(a, b); ctx.scale(k, k);
      ctx.fillStyle = 'rgba(40, 25, 10, 0.25)'; ctx.beginPath(); ctx.ellipse(2, 3, 7, 3.5, 0, 0, 6.28); ctx.fill();
      ctx.fillStyle = '#c0392b'; ctx.strokeStyle = '#f4e9d6'; ctx.lineWidth = 1.8;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.bezierCurveTo(-11, -14, -11, -30, 0, -30); ctx.bezierCurveTo(11, -30, 11, -14, 0, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#f4e9d6'; ctx.beginPath(); ctx.arc(0, -20, 4, 0, 6.28); ctx.fill();
      ctx.restore();
    }
    // the north arrow
    ctx.save(); ctx.translate(W - 44 * k, 44 * k); ctx.scale(k, k);
    ctx.strokeStyle = '#4a3b26'; ctx.fillStyle = '#4a3b26'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(0, 22); ctx.lineTo(0, -22); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, -24); ctx.lineTo(-6, -10); ctx.lineTo(6, -10); ctx.closePath(); ctx.fill();
    ctx.font = `600 12px ${SERIF}`; ctx.textAlign = 'center'; ctx.fillText('N', 0, -30);
    ctx.restore();
    // the scale: a round distance close to 150 px, drawn on the glance, carried by the footer band on the sheet
    const want = (sheet ? 96 * (W / this.canvas.getBoundingClientRect().width || 1) : 150 * k) * mPerPx;
    const bar = [100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000, 100000].reduce((best, d) => (Math.abs(d - want) < Math.abs(best - want) ? d : best), 500);
    const bpx = bar / mPerPx;
    if (sheet) this.scaleInfo = { bar, cssPx: bpx / (W / (this.canvas.getBoundingClientRect().width || W)) };
    else {
      ctx.fillStyle = '#4a3b26'; ctx.fillRect(24 * k, H - 28 * k, bpx, 3 * k); ctx.fillRect(24 * k, H - 34 * k, 2 * k, 9 * k); ctx.fillRect(24 * k + bpx - 2 * k, H - 34 * k, 2 * k, 9 * k);
      ctx.font = `600 ${12 * k}px ${SERIF}`; ctx.textAlign = 'left'; ctx.fillText(bar >= 1000 ? `${bar / 1000} km` : `${bar} m`, 24 * k + bpx + 8 * k, H - 26 * k);
    }
  }
}
