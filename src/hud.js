import * as THREE from 'three';
import { clamp } from './rng.js';
import { MONTHS, monthDay } from './astro.js';
import { FRESH } from './wind.js';
import { sheets, sheetAt, sheetById, SHEETS } from './sheets.js'; // hubs 2D, fb2 D: the map sheets, owned, and what the map may show
import { explored, INK_WATER, INK_RIM, ROUTE_STEP } from './explored.js'; // round A-B: the map filling in (the lakes paddled inked, your way in pencil)
import { lifeKmh } from './pace.js';
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
// asked for. What the map shows follows the sheets (sheets.js view; the owner's second feedback of 2026-10-24): at an
// outfitter (inside its store, at its counter or its map table, maptable.js) the whole Boundary Waters, with the
// printed sheets dotted over it, yours ruled in ink; in the wild only the sheets you own, with everything on them
// and cut to their neatlines, and blank paper elsewhere (no lakes, no names: with no sheets, only you and the north
// arrow); Sandbox everything. The journal (journal.js) and the outfitter's counter
// (outfitter.js) are paper too; one paper object is up at a time, on a scrim, and the HUD keeps the register of which.

const GLANCE_SPAN = 5000;    // metres across the glance and the corner sheet
// round A join (the owner, 2026-10-26: "map full screen mode should start more zoomed in"): the sheet opens on you, on
// your lake and the waters round it: about twice the lake's reach (from its area), 3 to 5 km across; the wheel still
// goes out to the whole map
const OPEN_SPAN = 4000, OPEN_MIN = 3000, OPEN_MAX = 5000;
const SHEET_FADE = 720;      // ms: the sheet keeps its place while it fades (.paper's opacity .7s), then lets it go
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
const NEAT = 'rgba(74, 59, 38, 0.55)', FOLD = 'rgba(74, 59, 38, 0.4)'; // an owned sheet's neatline, and where two of yours meet
// fb2 D: the printed sheets over the whole map (at an outfitter): yours ruled in ink, the rest dotted, red where this
// table sells it
const OWN_LINE = 'rgba(42, 52, 30, 0.85)', DOT_LINE = 'rgba(74, 59, 38, 0.72)', SOLD_DOT = 'rgba(180, 50, 31, 0.9)';
const SERIF = 'Alegreya, Georgia, "Times New Roman", serif';
// round A-B: your way in pencil, and a portage you have crossed gone over solid (explored.js has the lakes' ink)
const PENCIL_INK = 'rgba(54, 46, 38, 0.86)', PENCIL_SOFT = 'rgba(54, 46, 38, 0.26)';
const CROSSED = '#9a2819', CROSSED_UNDER = 'rgba(176, 52, 36, 0.62)';
const PENCIL = 'Caveat, "Bradley Hand", "Segoe Print", cursive'; // the pencil hand (index.html --pencil-font)
// what a keeper's ring on the map is for, in the pencil hand (outfitters.js hint kinds)
const HINT_LABEL = { laketrout: 'lakers, deep', walleye: 'walleye at dusk', pike: 'pike in the weeds', smallmouth: 'smallmouth, rocky points', crappie: 'crappie at dusk', perch: 'perch', moose: 'moose at dawn', carry: 'a long carry' };
// The keeper's red pencil (drawMap, the notices' places): a ring drawn by hand round (a, b) at radius r, wobbling a
// little, going round not quite all the way, and a second lighter pass a hair off it, the way a pencil goes round
// twice. seed keeps one ring's wobble the same from frame to frame.
function pencilRing(ctx, a, b, r, k, seed) {
  const s = (seed * 0.6180339887) % 1, a0 = s * 6.2832, N = 72, sweep = 6.2832 * (0.9 + s * 0.08);
  const pass = (ox, oy, sq, alpha, lw, from, to) => {
    ctx.beginPath();
    for (let i = 0; i <= N; i++) {
      const u = from + ((to - from) * i) / N, t = a0 + u * sweep;
      const wob = 1 + 0.03 * Math.sin(t * 3 + s * 9) + 0.02 * Math.sin(t * 5.7 - s * 4) + 0.012 * Math.sin(t * 11 + s);
      const x = a + ox + Math.cos(t) * r * wob * (1 + 0.03 * sq), y = b + oy + Math.sin(t) * r * wob * (1 - 0.03 * sq);
      if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
    }
    ctx.strokeStyle = `rgba(184, 44, 32, ${alpha})`; ctx.lineWidth = lw; ctx.stroke();
  };
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  pass(0, 0, 1, 0.82, 2.2 * k, 0, 1);
  pass(1.4 * k, -1.1 * k, -1, 0.34, 1.3 * k, 0.06, 0.86);
}
const PRESS = 260;           // ms: M let go sooner than this was a press, not a hold (nothing shows until it is one or the other: fb3 C)
const FINE_PER_FRAME = 2;    // fine tile images painted fresh in one map frame (the rest wait a frame, the far image under them)
const PREPAINT_RANGE = 6000; // m: tiles painted ahead for the map while it is away, this far from you at most
const HOLD_OFF = 300;        // ms: held keys hide this long after release
const TITLE_HOLD = 4, NOTE_HOLD = 5, CATCH_HOLD = 8; // seconds
const WAVE_MATTERS = 0.3;    // m: waves above this make the compass speak
const WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const COMPASS_LONG = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
// fb2 F: the energy bar's needs in its order (energy.js NEED_KEYS), its width (hud.css #energy) and the needs' icons,
// 16 px, drawn in currentColor: a snowflake, zz, a fork and knife, a drop
const NEEDS = ['warmth', 'rest', 'food', 'water'];
const ENERGY_W = 360;
const flake = () => {
  let d = '';
  for (let i = 0; i < 6; i++) {
    const a = (i * Math.PI) / 3, cx = Math.sin(a), cy = -Math.cos(a), at = (r) => `${(8 + cx * r).toFixed(2)} ${(8 + cy * r).toFixed(2)}`;
    const tick = (sg) => { const b = a + sg * 0.75; return `${(8 + cx * 4.3 + Math.sin(b) * 2.3).toFixed(2)} ${(8 + cy * 4.3 - Math.cos(b) * 2.3).toFixed(2)}`; };
    d += `M8 8L${at(6.6)}M${tick(1)}L${at(4.3)}L${tick(-1)}`;
  }
  return d;
};
export const NEED_ICON = { // (exported for fb5 B: the item tooltips draw the same icons)
  warmth: `<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="${flake()}" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  rest: '<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M1.5 7.5h6l-6 6.5h6M9.5 2h5l-5 5h5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="square"/></svg>',
  food: '<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 1.5v4.2M5.25 1.5v4.2M7.5 1.5v4.2M3 5.7c0 1.9 4.5 1.9 4.5 0M5.25 7v7.5M12 14.5V1.5c2.2 1.3 2.6 5.6 0 7.4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  water: '<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.2C8 1.2 3 7 3 10a5 5 0 0 0 10 0C13 7 8 1.2 8 1.2Z" fill="currentColor"/><path d="M5.6 10.2a2.5 2.5 0 0 0 1.9 2.4" fill="none" stroke="rgba(255,255,255,.55)" stroke-width="1.2" stroke-linecap="round"/></svg>',
};

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
// a lake in a few words: "the big water: 3,900 acres, sounded to 23 m"; a river is a river (polish B: the bake cuts a
// river into short polygons, so its cells are no measure of it, and "a small lake: 170 acres" was wrong twice over)
export function lakeWords(l) {
  if (!l) return '';
  if (l.river) return `${l.creek && !/river/i.test(l.name || '') ? 'a creek' : 'a river'}${l.maxDepth ? `, sounded to ${Math.round(l.maxDepth)} m` : ''}`;
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
// letter-spaced capitals for the map's lettering (hair spaces between the letters)
const spaced = (s) => String(s).split('').join(String.fromCharCode(8202));


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
    // polish B: the wind glyph on the compass rim comes in from the edge (the head inward, the wave at its base), so
    // turned to the side the wind comes from it points the way the wind goes (updateCompass)
    if (this.el.windArrow) {
      const g = this.el.windArrow, head = g.querySelector('polygon'), shaft = g.querySelector('rect'), wave = g.querySelector('path');
      if (head) head.setAttribute('points', '48,22 42,13 54,13');
      if (shaft) shaft.setAttribute('y', '2');
      if (wave) wave.setAttribute('d', 'M30 13q4 -3 8 0t8 0t8 0t8 0');
    }
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
    // round A join (load time): the overview (3.6 MB, the largest download at the start, a third of it) is wanted only
    // when the map is zoomed out past the far field; it waits until the game has been up a few seconds (update), or
    // until the map first opens
    this.overviewAt = 0;
    this.bindMap();
    this.bindKeys();
    this.marksBuild();
    this.energyBuild(); // fb2 F: the energy bar
    this.stripBuild(); // fb3 C (14): the bar and the clock over the paper
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
        // fb3 C (21, "opening the map is sorta glitchy"): nothing shows until the key has said whether it is a press or a
        // hold. The glance used to slide up at the key's down and the sheet replace it at the key's up a tenth of a second
        // later: a corner panel flashing up and jumping to the middle at twice the size. Now a press (let go inside
        // PRESS) opens the sheet straight from nothing, and the glance comes up only once the key has been held PRESS.
        this.mKey.timer = setTimeout(() => { if (this.mKey.held && this.mode !== 'sheet') this.setMode('glance'); }, PRESS);
      } else if (e.code === 'Escape') {
        if (this.pin) this.clearPin(); else if (this.mode === 'sheet') this.setMode(this.settings && this.settings.cornerSheet ? 'corner' : 'hidden');
      } else if (e.code === 'Enter' && this.pin) this.confirm();
    });
    window.addEventListener('keyup', (e) => {
      if (e.code === 'Tab') {
        this.tab.held = false;
        if (this.settings && this.settings.readoutMode === 'hold') { clearTimeout(this.tab.timer); this.tab.timer = setTimeout(() => { if (!this.tab.held) this.showReadout(false); }, HOLD_OFF); }
      } else if (e.code === 'KeyM' && this.mKey.held) {
        this.mKey.held = false; clearTimeout(this.mKey.timer);
        const press = performance.now() - this.mKey.downAt < PRESS;
        if (press && this.mode !== 'sheet') this.setMode('sheet');
        else if (this.mode === 'glance') { this.mKey.timer = setTimeout(() => { if (this.mode === 'glance' && !this.mKey.held) this.setMode(this.settings && this.settings.cornerSheet ? 'corner' : 'hidden'); }, HOLD_OFF); }
      }
    });
    window.addEventListener('blur', () => { this.tab.held = false; this.mKey.held = false; clearTimeout(this.mKey.timer); if (this.settings && this.settings.readoutMode === 'hold') this.showReadout(false); if (this.mode === 'glance') this.setMode(this.settings && this.settings.cornerSheet ? 'corner' : 'hidden'); });
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
      if (!drag && this.table && this.mode === 'sheet') { const [px, py] = rectPx(e), [x, z] = this.worldAt(px, py); this.table.hoverAt(x, z); return; } // fb2 D: the sheet under the pointer
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
      if (this.table) { this.table.pick(x, z); return; } // fb2 D: at the map table a click picks a sheet
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
    // round A join (the owner, 2026-10-26: "map on close snaps to top left before fading"): the sheet's place and size
    // are its class, so taking the class off with the show snapped it to the paper's corner for the whole fade. Closed
    // to nothing, it keeps its class (and its last drawing: nothing draws while hidden) until the fade is over.
    clearTimeout(this.sheetFade);
    const fading = mode === 'hidden' && was === 'sheet';
    m.classList.toggle('glance', mode === 'glance'); m.classList.toggle('sheet', mode === 'sheet' || fading); m.classList.toggle('corner', mode === 'corner');
    m.classList.toggle('show', mode !== 'hidden');
    if (fading) this.sheetFade = setTimeout(() => { if (this.mode === 'hidden') m.classList.remove('sheet'); }, SHEET_FADE);
    if (mode !== 'hidden') this.loadOverview();
    if (mode === 'sheet') {
      this.openPaper('map');
      this.view.span = this.openSpan();
      if (this.player) { this.view.cx = this.player.x; this.view.cz = this.player.z; }
    } else {
      if (was === 'sheet') this.closePaper('map');
      this.view.span = GLANCE_SPAN;
      this.clearPin();
      if (was === 'sheet' && this.table) { const t = this.table; this.table = null; t.closed(); } // fb2 D: the map table goes with the sheet
    }
    // fb3 C (21): the band's words settle the body's height before the canvas is measured (the sheet's long title, left
    // in the glance's narrow band, wrapped to two lines for a frame and the glance drew stretched); and no second sizing
    // on the next animation frame, which ran after that frame's draw and wiped it when the size had changed
    if (this.player && this.ctx && mode !== 'hidden') this.updateMapChrome(); // (a fading sheet keeps its own words)
    this.sizeCanvas();
  }
  // the span the sheet opens at: your lake and the waters round it (OPEN_SPAN on land or off the lakes' list)
  openSpan() {
    const p = this.player, w = this.world;
    const id = p && w && w.lakeIdAt ? w.lakeIdAt(p.x, p.z) : 0, L = id > 0 && w.lakes ? w.lakes[id - 1] : null;
    const reach = L && L.cells ? Math.sqrt(L.cells) * (w.cell || 10) * 2.2 : OPEN_SPAN;
    return clamp(reach, OPEN_MIN, OPEN_MAX);
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
    if (c.width !== W || c.height !== H || !this.grain) {
      c.width = W; c.height = H;
      // the paper's grain, kept per size (the glance, the sheet and the corner each have theirs): made once, not at every
      // opening (fb3 C: thirty thousand specks a time was part of the map's hitch)
      const key = `${W}x${H}`;
      if (!this.grains) this.grains = new Map();
      let g = this.grains.get(key);
      if (!g) { g = this.makeGrain(); this.grains.set(key, g); if (this.grains.size > 4) this.grains.delete(this.grains.keys().next().value); }
      this.grain = g;
      this.drawn = false; // a fresh backing store is blank until the next draw (update draws in the same frame)
    }
  }
  // fb3 C (21): the fine tile images painted ahead while the map is away, one tile at a time nearest you, in the browser's
  // idle time where it gives any (requestIdleCallback; a slow timer elsewhere), so the first opening draws from the cache
  // instead of painting six tiles in one frame (a 60 ms hitch the first time M was pressed)
  prepaint(deadline = null) {
    this.idleQueued = false;
    const w = this.world, p = this.player;
    if (!w.tiles || !p || this.mode !== 'hidden') return;
    if (deadline && typeof deadline.timeRemaining === 'function' && deadline.timeRemaining() < 9 && !deadline.didTimeout) return;
    const live = w.tiles.readyTiles(), alive = new Set(live.map((e) => e.key));
    for (const key of this.fineImages.keys()) if (!alive.has(key)) this.fineImages.delete(key);
    let best = null, bd = PREPAINT_RANGE;
    for (const e of live) {
      if (this.fineImages.has(e.key)) continue;
      const [ox, oz] = w.tileOrigin(e.tx, e.ty), d = Math.hypot(ox + w.tileMetres / 2 - p.x, oz + w.tileMetres / 2 - p.z);
      if (d < bd) { bd = d; best = e; }
    }
    if (best) { this.fineImage(best); return; }
    // round A-B: then a fine tile's ink gone stale since a lake was paddled (one a call), and the sheet's ink under you
    this.inkBudget = 1;
    for (const [key, img] of this.fineImages) {
      if (img.inkV === explored.lakeV) continue;
      const [tx, ty] = key.split(',').map(Number);
      this.tileInk(img, key, tx, ty, true);
      if (!this.inkBudget) return;
    }
    const sh = sheetAt(p.x, p.z);
    if (sh && explored.inkSheets().has(sh.id)) explored.sheetInk(sh);
  }
  queuePrepaint() {
    if (this.idleQueued) return;
    this.idleQueued = true;
    if (typeof window.requestIdleCallback === 'function') window.requestIdleCallback((d) => this.prepaint(d), { timeout: 1500 });
    else setTimeout(() => this.prepaint(null), 300);
  }

  // --- the pin and its pencil note ----------------------------------------------------------------
  propose(x, z, recentre) {
    if (!this.world.inBounds(x, z, 50)) return;
    this.pin = { x, z };
    if (this.mode !== 'sheet') this.setMode('sheet');
    if (recentre) { this.view.cx = x; this.view.cz = z; }
    const w = this.world, p = this.player, ctx = this.ctx, sh = this.sheetsOn;
    const name = !sh || sh.view() !== 'owned' || sh.showsDetail(x, z) ? w.lakeName(w.lakeIdAt(x, z)) : null; // fb2 D: blank paper names nothing
    const walk = this.pinLocked; // Adventure: the pin measures the way, it does not move you
    let text = 'Paddle in here?';
    if (p) {
      const km = Math.hypot(x - p.x, z - p.z) / 1000, dir = compassLong(bearingOf(Math.atan2(-(z - p.z), x - p.x)));
      const wind = ctx && ctx.wind;
      let hops = '';
      const tasks = ctx && ctx.tasks;
      if (tasks && typeof tasks.reach === 'function') {
        const from = p.lakeId, to = w.lakeIdAt(x, z);
        if (from > 0 && to > 0) {
          const r = tasks.reach(from).get(tasks.basinOf(to));
          // the portages are counted only where your map shows them (sheets.js): across country it doesn't, the way is
          // yours to find
          const known = !r || r.hops === 0 || this.wayOnMap(tasks, from, to);
          hops = !r ? ' A long way round.' : r.hops === 0 ? ' No portages.' : known ? ` ${word(r.hops)[0].toUpperCase()}${word(r.hops).slice(1)} ${plural(r.hops, 'portage')}.` : ' The way there runs off your map.';
        }
      }
      // the hours on the game's own clock, which follows the way at life pace (pace.js): the canoe's cruise at life (5.8 km
      // an hour with an aluminium hull and an ash paddle, times the gear's cruise: shop.js), less with a fresh wind
      const hours = km / (lifeKmh(p.gear) * (wind && wind.fresh ? 0.8 : 1));
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
  // whether every portage on the fewest-portage way from one lake to another is on your map (both its ends shown):
  // the counter of portages in the pin's note is said only then. No sheets attached (or Sandbox): always.
  wayOnMap(tasks, fromLake, toLake) {
    const sh = this.sheetsOn; if (!sh || sh.view() !== 'owned' || typeof tasks.graph !== 'function') return true;
    const a = tasks.basinOf(fromLake), b = tasks.basinOf(toLake), adj = tasks.graph(), prev = new Map([[a, null]]), q = [a];
    for (let h = 0; h < q.length && !prev.has(b); h++) for (const e of adj.get(q[h]) || []) if (!prev.has(e.to)) { prev.set(e.to, { from: q[h], e }); q.push(e.to); }
    if (!prev.has(b)) return false;
    for (let k = b; prev.get(k); k = prev.get(k).from) {
      const def = this.world.portages[prev.get(k).e.portage];
      if (!def || !def.launch.every((l) => sh.showsDetail(l.x, l.z))) return false;
    }
    return true;
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
    if (!ov || this.overviewAt < 0) return;
    this.overviewAt = -1; // (once)
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
  paintDepthContours(layer, s, side, halo, pxPerCell, tx, ty) {
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
      const ctx = layer();
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
    // the soundings on a layer of their own (made only for a tile that has some): the map shows them only where you
    // know the water (sheets.js)
    const layer = () => { if (!c.depth) { c.depth = document.createElement('canvas'); c.depth.width = c.depth.height = FINE_PX; } return c.depth.getContext('2d'); };
    c.depth = null;
    c.labels = s.lvl ? this.paintDepthContours(layer, s, w.side, w.halo, pxPerCell, tx, ty) : [];
    // round A-B: the lakes in it you have paddled, inked (explored.js), made with the image and kept with it
    const ink = explored.world ? explored.inkTile(s, tx, ty) : null;
    c.ink = ink ? ink.canvas : null; c.lakeIds = ink ? ink.ids : null; c.inkV = ink ? explored.lakeV : -1;
    return c;
  }
  // round A-B: a fine tile's ink, remade when a lake in it was newly paddled since it was made (explored.touches): from
  // the streamed tile's cells, a few a frame (inkBudget); a tile fetched for the map alone has let its cells go, so it
  // is fetched and painted again. The ink as it was is drawn meanwhile.
  tileInk(img, key, tx, ty, streamed) {
    if (img.inkV === explored.lakeV || !explored.world) return img.ink || null;
    if (!explored.touches(img.lakeIds, img.inkV)) { img.inkV = explored.lakeV; return img.ink || null; }
    if (this.inkBudget > 0) {
      this.inkBudget--;
      const s = streamed ? this.world.slots[ty * this.world.ntx + tx] : null;
      if (s) { const r = explored.inkTile(s, tx, ty); img.ink = r.canvas; img.lakeIds = r.ids; img.inkV = explored.lakeV; }
      else if (!streamed) this.mapTiles.delete(key);
    }
    return img.ink || null;
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
    // (fb4 join: the same words said twice at once, by a verb and the book that ran it, are one line held longer)
    const same = [...box.children].find((c) => c.textContent === text && !c._gone);
    if (same) { clearTimeout(same._timer); same._timer = setTimeout(() => this.dropLine(same), seconds * 1000); return; }
    while (box.children.length >= 2) { const c = box.firstElementChild; clearTimeout(c._timer); c.remove(); } // the oldest goes at once: two at most
    const el = document.createElement('div'); el.className = 'line fade'; el.textContent = text;
    box.appendChild(el);
    requestAnimationFrame(() => el.classList.add('show'));
    const t = setTimeout(() => this.dropLine(el), seconds * 1000);
    el._timer = t;
  }
  dropLine(el) {
    if (!el || !el.parentNode) return;
    clearTimeout(el._timer); el._gone = true;
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
  // ctx: { player, geo, day, wind, fishing, energy, tasks, outfitter, stats, fps, shell, trip }
  update(ctx) {
    this.ctx = ctx;
    const { player, settings } = { player: ctx.player, settings: this.settings };
    this.player = player;
    if (this.overviewAt >= 0) { const now = performance.now(); if (!this.overviewAt) this.overviewAt = now + 5000; else if (now > this.overviewAt) this.loadOverview(); } // round A join
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
    this.updateEnergy(ctx); // fb2 F
    this.updateStrip(ctx); // fb3 C (14): the bar and the clock over the paper
    if (this.tab.shown) this.renderReadout();
    if (this.mode !== 'hidden' && !ctx.shell) {
      if (this.mode !== 'sheet') { this.view.cx = player.x; this.view.cz = player.z; this.view.span = GLANCE_SPAN; }
      // fb3 C (21): the bands first (their words set the body's height), then the canvas measured against its box every
      // frame (one rect read; the backing store is reset only when the box changed), then the draw: never a frame drawn
      // at the wrong size, never a frame wiped after its draw
      this.updateMapChrome();
      this.sizeCanvas();
      if (this.grain) { this.drawMap(player); this.drawn = true; }
    } else if (this.mode === 'hidden' && !ctx.shell) this.queuePrepaint();
  }

  set(key, el, value, prop = 'textContent') { if (this.cache[key] !== value) { this.cache[key] = value; el[prop] = value; } }

  // the compass: the needle is the canoe's heading, the gold arrow on the rim sits on the side the wind comes from and
  // points the way it goes, in across the dial, so it agrees with "from the south" (polish B: it sat downwind, pointing
  // out); it speaks (label, waves, full strength) when the wind matters, and is faint or away otherwise
  updateCompass(ctx) {
    const { player, wind, day } = ctx, e = this.el, s = this.settings;
    if (!wind) return;
    const ice = !!(day && day.season && day.season.ice > 0.5); // a frozen lake has no waves (polish B)
    const H = ice ? 0 : player.waveHeightHere || 0;
    const matters = player.mode === 'paddle' && (wind.fresh || H > WAVE_MATTERS); // (fb5 join: the wind speaks on the water; "Fresh breeze · 8 m/s · waves 0.1 m" in a store doorway or at camp said nothing to do)
    const mode = s ? s.compassMode : 'always';
    const show = mode === 'always' || (mode === 'wind' && matters);
    e.compass.classList.toggle('show', show);
    e.compass.classList.toggle('loud', matters);
    if (!show) return;
    const hdg = bearingOf(player.heading);
    this.set('needle', e.needle, `rotate(${hdg.toFixed(1)}deg)`, 'style');
    e.needle.style.transform = `rotate(${hdg.toFixed(1)}deg)`;
    e.windArrow.style.transform = `rotate(${(wind.from % 360).toFixed(1)}deg)`;
    e.compass.querySelector('svg').setAttribute('aria-label', `Compass: heading ${compassLong(hdg)}; ${wind.label.toLowerCase()} from the ${wind.compassLong}`);
    if (matters) {
      this.set('clabel', e.compassLabel, `${wind.label} · ${wind.speed.toFixed(0)} m/s`, 'innerHTML');
      e.compassLabel.innerHTML = `${esc(wind.label)} · ${wind.speed.toFixed(0)} m/s<br>from the ${wind.compassLong}`;
      const f = player.forward, wd = wind.dir, cosRel = f.x * wd.x + f.z * wd.z;
      const aspect = player.mode !== 'paddle' ? '' : Math.abs(cosRel) < 0.5 ? ' · beam on' : cosRel < 0 ? ' · on the bow' : ' · astern';
      this.set('cwaves', e.compassWaves, `${ice ? 'frozen over' : `waves ${H.toFixed(1)} m${aspect}`}${wind.override != null ? ' · set by hand' : ''}`);
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
        const hungW = energy && energy.hungFood ? energy.hungFood().words : '';
        const food = energy && !(core && core.sandbox) && !(outfitter && outfitter.visit) ? (energy.foodWords ? `${energy.foodWords()} with you${hungW ? ` · ${hungW}` : ''}` : energy.food > 0 ? `${foodWords(energy.food)} of food` : 'the food pack is empty') : ''; // fb A: the meals and snacks in reach (camp join: and the barrel hung; polish B: not at a store, where the shelf is a step away)
        const sub = [here, stats && stats.km > 0.05 ? `${fmtKm(stats.km)} km paddled so far` : '', food].filter(Boolean).join(' · ');
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


  // the status marks, bottom right at half strength (one speed, 2026-10-26: the game speed's mark is gone with 1 2 3): the
  // clock stopped, the trip's when it matters (the food down to a day,
  // the gear wet), the GPS link, mute, tiles loading. (A need run low is no longer a word here: fb2 F, its chunk and icon
  // on the energy bar say it.)
  marksBuild() {
    const m = this.el.marks; if (!m) return;
    m.innerHTML = `<span id="mark-clock" class="sc">clock stopped</span>`
      + '<span id="mark-food" class="sc"></span><span id="mark-wet" class="sc">gear wet</span>'
      + `<svg id="mark-gps" width="14" height="14" viewBox="0 0 14 14" role="img" aria-label="GPS link to the extension is live"><circle cx="7" cy="7" r="3" fill="currentColor"/><circle cx="7" cy="7" r="6" fill="none" stroke="currentColor" stroke-width="1"/></svg>`
      + `<svg id="mark-mute" width="16" height="14" viewBox="0 0 16 14" role="img" aria-label="Sound is off"><polygon points="1,5 4,5 8,2 8,12 4,9 1,9" fill="currentColor"/><path d="M10 4l5 6M15 4l-5 6" stroke="currentColor" stroke-width="1.4"/></svg>`
      + `<svg id="mark-tiles" width="14" height="14" viewBox="0 0 14 14" role="img" aria-label="Tiles loading"><circle cx="7" cy="7" r="5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-dasharray="8 24"><animateTransform attributeName="transform" type="rotate" from="0 7 7" to="360 7 7" dur="1.6s" repeatCount="indefinite"/></circle></svg>`;
    this.mk = { clock: $('mark-clock'), food: $('mark-food'), wet: $('mark-wet'), gps: $('mark-gps'), mute: $('mark-mute'), tiles: $('mark-tiles') };
  }
  updateMarks(ctx) {
    const { geo, day, trip, energy } = ctx, mk = this.mk, w = this.world; if (!mk) return;
    mk.clock.classList.toggle('on', !!(day && !day.running && !ctx.shell));
    const adv = !!(trip && trip.adventure && trip.active && !ctx.shell);
    const hung = adv && energy && energy.hungFood ? energy.hungFood() : null; // camp join: the barrel hung at camp is food you have
    const food = adv && energy && energy.food + (hung ? hung.days : 0) <= 1 ? (energy.food <= 0 ? (energy.foodWords && energy.foodWords() !== 'no food' ? energy.foodWords() : hung && hung.words ? hung.words : 'no food') : energy.foodWords ? energy.foodWords() : `${foodWords(energy.food)} of food`) : ''; // fb A
    const shown = food === 'no food' && energy && typeof energy.foodNearby === 'function' && energy.foodNearby() ? '' : food; // (the content join: not "no food" 6 m from the canoe with meals in it)
    this.set('mfood', mk.food, shown); mk.food.classList.toggle('on', !!shown);
    mk.wet.classList.toggle('on', adv && !!trip.state.wet);
    mk.gps.classList.toggle('on', !!(geo && geo.linked && geo.enabled));
    mk.mute.classList.toggle('on', !!(this.settings && this.settings.get('mute')));
    let loading = 0;
    if (w.tiles) { const t = w.tiles; loading = t.queue.length + t.pending.length + t.workers.filter((k) => k.key).length; }
    this.loading = loading;
    mk.tiles.classList.toggle('on', loading > 0);
  }

  // --- the energy bar (fb2 F) -----------------------------------------------------------------------------------
  // Wild n Chill's bar, as the owner asked (2026-10-24, second round): one long thin bar, top left in the Air. Green is
  // the energy you have; the dim track after it, up to the ceiling, is what rest can still bring back; and each need's
  // chunk eats into it from the right end, in the bar's order cold (pale blue), sleep (orange), hunger (yellow), thirst
  // (blue): energy.chunks(). A chunk is dashed and marching while it grows faster than its everyday rate (energy.js),
  // and its icon (snowflake, zz, fork and knife, drop) sits under it while it grows or is a tenth of the bar or more.
  // Shown only when it matters, as the marks are: on a trip, while a chunk grows, a need is low, the bar is under half,
  // the ceiling under 0.6 or a chunk other than sleep 0.15 or more, and for a few seconds after it changes (a meal, a
  // capsize); in Quiet only when it is urgent (a chunk growing, a need low, the bar under a quarter). Hidden at once while
  // the readout is up (Tab, or always at Full density): its Energy row draws the same bar.
  energyBuild() {
    const air = this.el.air; if (!air) return;
    const el = document.createElement('div');
    el.id = 'energy'; el.className = 'fade'; el.setAttribute('role', 'img'); el.setAttribute('aria-label', 'Energy');
    el.innerHTML = `<div class="track"><i class="fill"></i><i class="room"></i>${NEEDS.map((k) => `<i class="chunk ${k}"></i>`).join('')}</div>`
      + `<div class="icons">${NEEDS.map((k) => `<span class="icon ${k}">${NEED_ICON[k]}</span>`).join('')}</div>`;
    air.appendChild(el);
    const q = (sel) => el.querySelector(sel);
    this.eb = { el, fill: q('.fill'), room: q('.room'), chunk: {}, icon: {}, ref: null, until: 0, sig: '', top: '' };
    for (const k of NEEDS) { this.eb.chunk[k] = q(`.chunk.${k}`); this.eb.icon[k] = q(`.icon.${k}`); }
  }
  // the bar's numbers for a frame: the green, the room up to the ceiling, each chunk's start from the right end, and a
  // signature that changes only when the drawing would (rounded: the DOM is spared). The Air's bar and the strip over
  // the paper draw the same state.
  barState(energy) {
    const v = clamp(energy.value, 0, 1), cap = clamp(energy.ceiling, 0, 1), ch = energy.chunks ? energy.chunks() : [];
    const pct = (x) => `${(Math.round(x * 1000) / 10).toFixed(1)}%`;
    let sig = `${pct(v)}|${pct(cap)}`, x = 1;
    const at = {};
    for (let i = ch.length - 1; i >= 0; i--) { x -= ch[i].size; at[ch[i].key] = x; }
    for (const c of ch) sig += `|${c.key}${pct(c.size)}${c.growing ? '*' : ''}`;
    return { v, cap, ch, at, sig, pct };
  }
  barApply(eb, { v, cap, ch, at, pct }) {
    eb.fill.style.width = pct(Math.min(v, cap + 0.001));
    eb.room.style.left = pct(Math.min(v, cap)); eb.room.style.width = pct(Math.max(0, cap - v));
    for (const c of ch) { const el = eb.chunk[c.key]; if (!el) continue; el.style.left = pct(at[c.key]); el.style.width = pct(c.size); el.classList.toggle('grow', c.growing); }
  }
  updateEnergy(ctx) {
    const eb = this.eb; if (!eb) return;
    const { energy, trip, shell } = ctx, s = this.settings;
    // fb3 C (15): the readout has no Energy row any more (it is the moment only), so the bar stays up under it
    const on = !!(energy && trip && trip.active && !shell);
    let show = false;
    if (on) {
      const bar = this.barState(energy), { v, cap, ch, at, sig, pct } = bar;
      if (sig !== eb.sig) {
        eb.sig = sig;
        this.barApply(eb, bar);
        // the icons under their chunks, nudged apart where chunks are narrow (16 px each, within the bar)
        const W = ENERGY_W, marks = [];
        for (const c of ch) {
          const shown = c.size > 0.004 && (c.growing || c.size >= 0.1);
          eb.icon[c.key].classList.toggle('on', shown);
          if (shown) marks.push({ k: c.key, x: (at[c.key] + c.size / 2) * W });
        }
        for (let i = 1; i < marks.length; i++) marks[i].x = Math.max(marks[i].x, marks[i - 1].x + 18);
        for (let i = marks.length - 1; i >= 0; i--) marks[i].x = Math.min(marks[i].x, i === marks.length - 1 ? W - 8 : marks[i + 1].x - 18);
        for (const m of marks) eb.icon[m.k].style.left = `${Math.max(8, m.x).toFixed(1)}px`;
        const held = energy.heldBy || '';
        eb.el.setAttribute('aria-label', `Energy ${Math.round(v * 100)} %${held ? `, ${held}` : ''}`);
      }
      // whether it matters now
      const growing = ch.some((c) => c.growing), low = !!energy.low;
      const urgent = growing || low || v < 0.25;
      const ref = eb.ref, now = performance.now();
      const moved = !ref || Math.abs(v - ref.v) >= 0.1 || ch.some((c) => Math.abs(c.size - (ref.c[c.key] || 0)) >= 0.05);
      if (moved) { if (ref) eb.until = now + 6000; eb.ref = { v, c: Object.fromEntries(ch.map((c) => [c.key, c.size])) }; }
      const big = ch.some((c) => c.key !== 'rest' && c.size >= 0.15); // a fifth or so of a need gone (the day's tiredness shows by the ceiling)
      const density = s ? s.get('density') : 'standard';
      show = urgent || (density !== 'quiet' && (v < 0.5 || cap < 0.6 || big || now < eb.until));
      // under the spot card while the rod is up (both keep the top left), measured only when its words change
      const spot = this.el.spot, words = spot && spot.classList.contains('show') ? `${this.cache.spotWhere}|${this.cache.spotWho}` : '';
      if (words !== eb.spotWords) { eb.spotWords = words; const top = words ? `${48 + spot.offsetHeight + 22}px` : ''; if (top !== eb.top) { eb.top = top; eb.el.style.top = top; } }
    } else eb.ref = null;
    eb.el.classList.toggle('show', show);
    this.el.air.classList.toggle('ebar', show); // the readout keeps under the bar (hud.css)
  }

  // --- the strip over the paper (fb3 C, decision 14) ---------------------------------------------------------------
  // The owner (2026-10-25): "the health bar and time should be visible pretty much all the time. even in modals bc thats
  // when im eating and want to know if i need to keep eating". A small strip at the top of the screen, over the scrim
  // and every paper (the book, the fire card, a shelf, the counter, the map) and the Rest dial (stripAlso, main.js): the
  // energy bar as the Air's, its number, the clock and the day. The Air itself stays hidden under paper.
  stripBuild() {
    const el = document.createElement('div');
    el.id = 'strip'; el.setAttribute('role', 'status'); el.setAttribute('aria-label', 'Energy, the time and the day');
    el.innerHTML = `<div class="track"><i class="fill"></i><i class="room"></i>${NEEDS.map((k) => `<i class="chunk ${k}"></i>`).join('')}</div><span class="pct"></span><span class="dot">·</span><span class="clock"></span><span class="dot">·</span><span class="sc day"></span>`;
    document.body.appendChild(el);
    const q = (sel) => el.querySelector(sel);
    this.strip = { el, fill: q('.fill'), room: q('.room'), chunk: {}, pct: q('.pct'), clock: q('.clock'), day: q('.day'), sig: '', shown: false };
    for (const k of NEEDS) this.strip.chunk[k] = q(`.chunk.${k}`);
    this.stripAlso = null; // () => true while something of paper the register does not know is up (the Rest dial)
  }
  updateStrip(ctx) {
    const s = this.strip; if (!s) return;
    const { energy, day, shell } = ctx;
    const show = !shell && (!!this.paper || !!(this.stripAlso && this.stripAlso()));
    if (show !== s.shown) { s.shown = show; s.el.classList.toggle('show', show); }
    if (!show) return;
    if (energy) {
      const bar = this.barState(energy);
      // (the number is what the fill shows: the value held to the ceiling while it is pulled down to it; the fb3 join
      // read "72 %" over a fill at 58 % as a supper went in)
      if (bar.sig !== s.sig) { s.sig = bar.sig; this.barApply(s, bar); s.pct.textContent = `${Math.round(Math.min(bar.v, bar.cap) * 100)} %`; }
    }
    const dayW = this.dayWords(ctx);
    this.set('stripClock', s.clock, day ? clock12(day.hours) : '');
    this.set('stripDay', s.day, `${dayW ? `${dayW} · ` : ''}${day ? `${weekdayOf(day.year, day.doy).slice(0, 3)}, ${shortDate(day.year, day.doy)}` : ''}`);
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
    // fb3 C: the bobber rig with no leech in reach (fishing.ui.needsLeeches, stream B: the bucket in a hand, within 3 m or
    // in the canoe) is dimmed on the strip and says so
    const needs = !!u.needsLeeches, count = Number.isFinite(u.leeches) ? u.leeches : null; // and the leeches in reach, falling a leech a bite
    if (u.lures && (f.lure !== u.lure || f.needs !== needs || f.leeches !== count)) { e.lures.innerHTML = u.lures.map((l, i) => { const rig = l.bobber || l.id === 'leech', off = needs && rig; return `<span class="${i === u.lure ? 'on' : ''}${off ? ' off' : ''}"><b>${i + 1}</b>${esc(l.name)}${off ? '<i>needs leeches</i>' : rig && count != null ? `<i class="n">${count} left</i>` : ''}</span>`; }).join(''); f.lure = u.lure; f.needs = needs; f.leeches = count; }
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
    // the journal lines clear the card by its real height: a long lake or lure wraps its meta line, and the cooler's
    // note ("A 24 cm yellow perch into the cooler for …") came up behind it
    const lift = showCatch && e.catch.offsetHeight ? `${e.catch.offsetHeight + 68}px` : '';
    if (e.lines && e.lines.style.bottom !== lift) e.lines.style.bottom = lift;
  }

  // --- the readout: every number that left the screen, while Tab is held ---------------------------------------
  renderReadout(force = false) {
    const ctx = this.ctx; if (!ctx) return;
    const now = performance.now();
    if (!force && now - (this.readoutAt || 0) < 250) return;
    this.readoutAt = now;
    const { player, geo, day, wind, weather, fps } = ctx, w = this.world, s = this.settings;
    const id = player.lakeId;
    const name = player.placeName || w.lakeName(id) || 'Open water';
    const dayW = this.dayWords(ctx);
    const rows = [];
    const row = (lab, html, cls = '') => rows.push(`<div class="sc">${lab}</div><div class="${cls}">${html}</div>`);
    // fb3 C (15, the owner: "the info menu seems to be a lot of not needed info … it should be in the moment things"):
    // the moment only. The place, the time and the day are the head; then the sun, the wind, the sky and the way. The
    // season, the energy, the pack and the tasks live in the journal, the bar and the marks.
    if (day) {
      const { rise, set } = day.sunriseSunset, h = day.hours;
      const parts = [];
      if (rise == null && set == null) parts.push('no sun today');
      else {
        parts.push(rise != null ? `sunrise ${clock12(rise)}` : 'no sunrise', set != null ? `sunset ${clock12(set)}` : 'no sunset');
        if (set != null && h < set && (rise == null || h >= rise)) parts.push(`${fmtDuration(set - h)} of light left`);
        else if (set != null && h >= set) parts.push(`dark by ${clock12(Math.min(23.99, set + 0.8))}`);
        else if (rise != null && h < rise) parts.push(`${fmtDuration(rise - h)} till sunrise`);
      }
      row('Sun', esc(parts.join(' · ')));
    }
    if (wind) row('Wind', `${esc(wind.label)} · ${wind.speed.toFixed(0)} m/s from the ${wind.compassLong} · ${day && day.season && day.season.ice > 0.5 ? 'the lake is frozen over' : `waves ${(player.waveHeightHere || 0).toFixed(1)} m`}${wind.override != null ? ' · set by hand' : ''}`);
    if (weather && weather.look) {
      const t = weather.look.temp, label = weather.label || '', rain = weather.look.rain || 0;
      const wet = rain > 0.02 ? (weather.look.snow > 0.5 ? '' : rain > 0.5 ? ', raining hard' : ', raining') : '';
      row('Sky', esc(`${Number.isFinite(t) ? `${Math.round(t)} °C · ` : ''}${label.toLowerCase()}${/rain|snow|storm/i.test(label) ? '' : wet}`));
    }
    const hdg = bearingOf(player.heading);
    row('Way', `${((player.paceSpeed ?? player.groundSpeed ?? Math.abs(player.speed)) * 3.6).toFixed(1)} km/h · heading ${hdg.toFixed(0)}°, ${compassLong(hdg)}`);
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
    const html = `<div class="head"><div class="name">${esc(name)}</div><div class="sc date">${day ? `${clock12(day.hours)} · ` : ''}${dayW ? `${dayW} · ` : ''}${day ? longDate(day.year, day.doy) : ''}</div></div><div class="grid">${rows.join('')}</div><div class="foot">${foot}</div>`;
    this.set('readout', this.el.readout, html, 'innerHTML');
  }

  // --- the map's chrome: the header band, the layer toggles, the footer scale -----------------------------------
  // what the sheets add to it, made once: whether the sheet is yours (after the title), and the legend for the sheets
  mapChromeEl() {
    if (this.chromeEl) return this.chromeEl;
    const e = this.el, ownDot = document.createElement('span'), own = document.createElement('span'), leg = document.createElement('span'), legBuy = document.createElement('span');
    ownDot.className = 'dot'; ownDot.textContent = '·'; own.className = 'own';
    e.mapTitle.after(ownDot, own);
    leg.className = 'leg';
    leg.innerHTML = `<i style="width: 16px; height: 11px; border: 1.6px solid ${OWN_LINE}"></i>a sheet of yours`;
    legBuy.className = 'leg';
    legBuy.innerHTML = `<i style="width: 16px; height: 11px; border: 2px dotted ${DOT_LINE}"></i>a sheet to buy`;
    const you = e.map.querySelector('.band.foot .leg .you');
    if (you) you.parentNode.before(leg, legBuy); else if (e.mapHint) e.mapHint.before(leg, legBuy);
    this.chromeEl = { own, ownDot, leg, legBuy };
    return this.chromeEl;
  }
  // the legend's "a keeper's word", once one has been told (drawMap)
  hintLegend(on) {
    if (this.hintLeg) { if (this.hintLegOn !== on) { this.hintLegOn = on; this.hintLeg.style.display = on ? '' : 'none'; } return; }
    if (!on) return;
    this.hintLegOn = true;
    const leg = document.createElement('span');
    leg.className = 'leg';
    leg.innerHTML = '<i style="width: 16px; height: 15px; border-radius: 50%; border: 1.6px solid rgba(74, 64, 54, .62); background: rgba(74, 64, 54, .07)"></i>a keeper’s word';
    const you = this.el.map && this.el.map.querySelector('.band.foot .leg .you');
    if (you) you.parentNode.before(leg); else if (this.el.mapHint) this.el.mapHint.before(leg);
    this.hintLeg = leg;
  }
  updateMapChrome() {
    const e = this.el, w = this.world, v = this.view, sheet = this.mode === 'sheet';
    const sh = this.sheetsOn, look = sh ? sh.view() : 'open', table = this.table;
    const lakeHere = () => (sheet ? w.lakeIdAt(v.cx, v.cz) || (look === 'owned' ? 0 : this.player ? this.player.lakeId : 0) : (this.player ? this.player.lakeId : 0));
    if (!sh) { const code = sheetCode(w, v.cx, v.cz), name = w.lakeName(lakeHere()) || 'open country'; this.set('mtitle', e.mapTitle, sheet ? `Fisher map ${code} · ${name}` : `${code} · ${name}`); }
    else {
      // the sheet under the middle of the view (in the glance, the one you are on), and whether it is yours; in the
      // wild a lake is named only on a sheet of yours
      const s = table ? sheetById(table.named) : sheetAt(v.cx, v.cz), mine = !!(s && sh.owned(s.id)), none = !sh.ownedSheets().length;
      const name = look !== 'owned' || mine ? w.lakeName(lakeHere()) || 'open country' : null;
      let title;
      if (table) title = s ? `The map table · ${s.title}` : 'The map table · the Boundary Waters';
      else if (look === 'owned' && none) title = sheet ? 'No sheets yet · blank paper' : 'No sheets yet';
      else if (look === 'owned' && !mine) title = sheet ? 'Off your sheets · blank paper' : 'Off your sheets';
      else title = s ? (sheet ? `Fisher map ${s.title}` : `${s.id} · ${name}`) : sheet ? `Off the sheets · ${name}` : name;
      this.set('mtitle', e.mapTitle, title);
      const own = s && (look === 'whole' || (look === 'owned' && mine)) ? (mine ? (sheet ? 'yours' : 'your sheet') : 'not yours') : '';
      const el = this.mapChromeEl();
      this.set('mown', el.own, own);
      el.own.style.display = own ? '' : 'none'; el.ownDot.style.display = own ? '' : 'none';
      el.own.style.color = mine ? 'var(--ink)' : 'var(--ink-faint)';
      el.leg.style.display = look === 'whole' || (look === 'owned' && !none) ? '' : 'none';
      el.legBuy.style.display = look === 'whole' || table ? '' : 'none';
      // the glance and the corner are always 5 km across: there the band says whose sheet it is instead
      const span = !(own && !sheet);
      e.mapSpan.style.display = span ? '' : 'none';
      if (e.mapSpan.previousElementSibling) e.mapSpan.previousElementSibling.style.display = span ? '' : 'none';
    }
    const none = !!(sh && !sh.ownedSheets().length);
    // blank paper keys nothing: the portage, campsite, dock and task keys come back with a sheet
    const bare = look === 'owned' && none;
    if (this.bareLegs !== bare) {
      this.bareLegs = bare;
      for (const i of e.map.querySelectorAll('.band.foot .leg > i.portage, .band.foot .leg > i.camp, .band.foot .leg > i.dock')) i.parentNode.style.display = bare ? 'none' : ''; // (the notices' red pencil stays: it is drawn on blank paper too)
      for (const b of e.mapLayers.querySelectorAll('.layer')) b.style.display = bare ? 'none' : ''; // and no layer toggles over blank paper (polish B)
    }
    // (fb5 join, rule 3: the line says what is missing, else only the keys: not "your sheets, with everything on them ·
    // the rest is blank until you buy its sheet" every time M is pressed)
    const detail = table ? 'click a sheet to see what is on it'
      : look === 'whole' ? 'the sheets dotted over it, yours ruled in ink'
        : look === 'owned' ? (none ? 'blank paper: the map tables at the outfitters sell the sheets' : '')
          : '';
    if (e.mapHint) this.set('mhint', e.mapHint, [table ? 'drag to pan · wheel to zoom' : `drag to pan · wheel to zoom · click a spot ${this.pinLocked ? 'for the way there' : 'to paddle in'}`, detail].filter(Boolean).join(' · '));
    this.set('mspan', e.mapSpan, `${v.span >= 10000 ? Math.round(v.span / 1000) : (v.span / 1000).toFixed(v.span < 5000 ? 1 : 0)} km across`);
    if (this.mode === 'sheet' && this.scaleInfo) {
      const { bar, cssPx } = this.scaleInfo, txt = `${bar >= 1000 ? `${bar / 1000} km` : `${bar} m`}`;
      if (this.scaleShown !== txt + cssPx) { this.scaleShown = txt + cssPx; e.mapScalebar.style.width = `${cssPx.toFixed(0)}px`; e.mapScale.textContent = txt; }
      const far = v.span / this.canvas.width >= 7;
      const d = e.mapLayers.querySelector('[data-layer=depths]'); if (d) d.classList.toggle('far', far);
    }
  }

  // --- the sheet itself ------------------------------------------------------------------------------------------
  // the map sheets (sheets.js), once main.js has attached them to the season; null draws every detail, as before
  get sheetsOn() { return sheets.profile ? sheets : null; }
  // The edges of the sheets you own, in the wild: a thin ink neatline, a fainter fold where two of yours meet, and
  // the sheet's number and lakes in small letter-spaced capitals in its margin.
  drawNeatlines(ctx, sh, owned, toPx, k) {
    if (!owned.length) return;
    const W = this.canvas.width, H = this.canvas.height;
    ctx.save();
    ctx.lineCap = 'butt';
    for (const s of owned) {
      const [a, b] = toPx(s.x0, s.z0), [c, e] = toPx(s.x1, s.z1);
      const across = (x, z) => { const n = sheetAt(x, z); return !!(n && sh.owned(n.id)); };
      // north, east, south, west; a shared edge is drawn once, from the sheet west or north of it
      const edges = [
        [a, b, c, b, across(s.cx, s.z0 - 1), false], [c, b, c, e, across(s.x1 + 1, s.cz), true],
        [a, e, c, e, across(s.cx, s.z1 + 1), true], [a, b, a, e, across(s.x0 - 1, s.cz), false],
      ];
      for (const [p0, q0, p1, q1, shared, mine] of edges) {
        if (shared && !mine) continue;
        ctx.beginPath(); ctx.moveTo(p0, q0); ctx.lineTo(p1, q1);
        if (shared) { ctx.setLineDash([4 * k, 6 * k]); ctx.strokeStyle = FOLD; ctx.lineWidth = 1.1 * k; }
        else { ctx.setLineDash([]); ctx.strokeStyle = NEAT; ctx.lineWidth = 1.3 * k; }
        ctx.stroke();
      }
      ctx.setLineDash([]);
      // the label, like a sheet's margin title: just outside the north edge where that is on the map (inside it when
      // the edge is near the top), else just outside the south edge; on a sheet wide enough to carry it
      const top = b >= 0 && b <= H - 30 * k, bottom = !top && e >= 30 * k && e <= H;
      if (c - a < 260 * k || (!top && !bottom)) continue;
      const text = spaced(`${s.id} · ${s.name}`);
      const out = top ? b >= 22 * k : e <= H - 22 * k, y = top ? (out ? b - 6 * k : b + 6 * k) : (out ? e + 6 * k : e - 6 * k);
      ctx.font = `600 ${10.5 * k}px ${SERIF}`; ctx.textAlign = 'left'; ctx.textBaseline = top === out ? 'bottom' : 'top';
      const tw = ctx.measureText(text).width, lx = clamp(a + 10 * k, 10 * k, Math.min(W, c) - tw - 10 * k);
      if (lx < a + 4 * k || lx + tw > c - 4 * k) continue;
      ctx.lineWidth = 3.5 * k; ctx.lineJoin = 'round'; ctx.strokeStyle = 'rgba(233, 225, 204, 0.9)'; ctx.strokeText(text, lx, y);
      ctx.fillStyle = 'rgba(74, 59, 38, 0.78)'; ctx.fillText(text, lx, y);
    }
    ctx.textBaseline = 'alphabetic';
    ctx.restore();
  }
  // The printed sheets over the whole map, at an outfitter and at its map table: each sheet's edge dotted, ruled in
  // ink where it is yours, and in its corner its number, its lakes and whether it is yours (at the table, its price
  // here, or where it is sold). The map table's pick and the sheet under the pointer are washed red.
  drawSheetGrid(ctx, sh, toPx, inView, k) {
    const t = this.table, sel = t ? t.selected : null, hov = t ? t.hover : null;
    const here = t ? t.stockIds : sh ? sh.hereIds() : null;
    ctx.save();
    for (const s of SHEETS) {
      if (!inView(s.x0, s.z0, s.x1, s.z1)) continue;
      const [a, b] = toPx(s.x0, s.z0), [c, e] = toPx(s.x1, s.z1), w = c - a, h = e - b;
      const mine = !!(sh && sh.owned(s.id)), sold = !!(here && here.has(s.id)), pick = s.id === sel, lit = pick || s.id === hov;
      if (lit) { ctx.fillStyle = pick ? 'rgba(192, 57, 43, 0.11)' : 'rgba(192, 57, 43, 0.06)'; ctx.fillRect(a, b, w, h); }
      // neighbours' edges sit side by side a hair apart, not on top of each other
      const inset = 2 * k;
      ctx.beginPath(); ctx.rect(a + inset, b + inset, w - 2 * inset, h - 2 * inset);
      if (mine) { ctx.setLineDash([]); ctx.lineCap = 'butt'; ctx.strokeStyle = OWN_LINE; ctx.lineWidth = (pick ? 2.6 : 1.9) * k; }
      else { ctx.setLineDash([0.01, (sold ? 5.5 : 6.5) * k]); ctx.lineCap = 'round'; ctx.strokeStyle = sold || pick ? SOLD_DOT : DOT_LINE; ctx.lineWidth = (sold || pick ? 3 : 2.3) * k; }
      ctx.stroke();
      ctx.setLineDash([]);
      // the corner label in the part of the sheet in view: the number, the lakes where it is wide enough, and yours /
      // its price / where it is sold
      const vw = Math.min(c, this.canvas.width) - Math.max(a, 0), vh = Math.min(e, this.canvas.height) - Math.max(b, 0);
      if (w < 44 * k || vw < 60 * k || vh < 64 * k) continue;
      const lx = Math.max(a, 0) + 9 * k, ly = Math.max(b, 0) + 9 * k;
      const status = mine ? 'yours' : t ? (sold ? t.priceWords(s.id) : t.soldWords(s.id)) : sold ? 'sold here' : '';
      ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.lineJoin = 'round';
      const halo = (txt, x, y) => { ctx.lineWidth = 3.5 * k; ctx.strokeStyle = 'rgba(233, 225, 204, 0.92)'; ctx.strokeText(txt, x, y); ctx.fillText(txt, x, y); };
      const big = vw > 150 * k, room = Math.min(c, this.canvas.width) - lx - 9 * k;
      ctx.font = `700 ${(big ? 15 : 12) * k}px ${SERIF}`; ctx.fillStyle = mine ? 'rgba(42, 32, 22, 0.92)' : sold || pick ? 'rgba(160, 45, 30, 0.95)' : 'rgba(74, 59, 38, 0.8)';
      halo(s.id, lx, ly);
      let y = ly + (big ? 18 : 15) * k;
      if (big) {
        ctx.font = `600 ${9.5 * k}px ${SERIF}`; ctx.fillStyle = 'rgba(74, 59, 38, 0.82)';
        let name = spaced(s.name.toUpperCase());
        while (name.length > 4 && ctx.measureText(name).width > room) name = `${name.slice(0, -3)}…`;
        halo(name, lx, y); y += 13 * k;
      }
      if (status && vw > 70 * k) {
        ctx.font = `600 ${(big ? 15 : 13) * k}px ${PENCIL}`;
        ctx.fillStyle = mine ? 'rgba(42, 52, 30, 0.92)' : sold ? 'rgba(160, 45, 30, 0.95)' : 'rgba(74, 64, 54, 0.75)';
        halo(mine ? `✓ ${status}` : status, lx, y);
      }
    }
    ctx.textBaseline = 'alphabetic';
    ctx.restore();
  }

  // round A-B: your way in pencil (explored.js: a point every 50 m, in runs): the pieces in view only, a stride through
  // them when the map is far out (a point about every pixel and a half), the run you are on drawn on to where you are;
  // a graphite line and a fainter second pass a hair off it
  drawRoute(ctx, x0, z0, mPerPx, inView, k, player) {
    const runs = explored.runs; if (!runs.length) return;
    const min = 1.5 * k, stride = Math.max(1, Math.floor((min * mPerPx) / ROUTE_STEP)), path = new Path2D();
    let n = 0;
    for (let r = 0; r < runs.length; r++) {
      const run = runs[r], p = run.pts, tail = r === runs.length - 1 && explored.open;
      if (run.n < 2 && !tail) continue;
      let lx = NaN, ly = 0;
      for (const c of run.chunks) {
        if (!inView(c.x0, c.z0, c.x1, c.z1)) { lx = NaN; continue; }
        for (let i = c.i0; i <= c.i1; i = i < c.i1 && i + stride > c.i1 ? c.i1 : i + stride) {
          const a = (p[i * 2] - x0) / mPerPx, b = (p[i * 2 + 1] - z0) / mPerPx;
          if (lx !== lx) { path.moveTo(a, b); lx = a; ly = b; continue; }
          if (i !== c.i1 && Math.abs(a - lx) + Math.abs(b - ly) < min) continue;
          path.lineTo(a, b); lx = a; ly = b; n++;
        }
      }
      if (tail && player && lx === lx) { path.lineTo((player.x - x0) / mPerPx, (player.z - z0) / mPerPx); n++; }
    }
    if (!n) return;
    ctx.save();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.setLineDash([]);
    const lw = Math.max(1.6 * k, 1.3 * Math.min(window.devicePixelRatio || 1, 2)); // (never under a pixel and a third: the glance is small)
    ctx.strokeStyle = PENCIL_INK; ctx.lineWidth = lw; ctx.stroke(path);
    ctx.translate(0.9 * k, -0.7 * k); ctx.strokeStyle = PENCIL_SOFT; ctx.lineWidth = lw * 0.7; ctx.stroke(path);
    ctx.restore();
  }
  // round A-B: the legend's "your way" and "paddled", once there is something of yours on the map
  inkLegend(onWay, onLake) {
    if (!this.inkLeg) {
      if (!onWay && !onLake) return;
      const way = document.createElement('span'), lake = document.createElement('span');
      way.className = 'leg'; way.innerHTML = `<i style="width: 20px; height: 0; border-top: 1.6px solid ${PENCIL_INK}; transform: rotate(-8deg)"></i>your way`;
      lake.className = 'leg'; lake.innerHTML = `<i style="width: 15px; height: 11px; border-radius: 45% 55% 50% 50%; background: rgb(${INK_WATER.join(',')}); border: 1.5px solid rgb(${INK_RIM.join(',')})"></i>paddled`;
      const you = this.el.map && this.el.map.querySelector('.band.foot .leg .you');
      if (you) you.parentNode.before(way, lake); else if (this.el.mapHint) this.el.mapHint.before(way, lake);
      this.inkLeg = { way, lake }; this.inkLegOn = null;
    }
    const key = `${onWay}${onLake}`;
    if (this.inkLegOn === key) return;
    this.inkLegOn = key;
    this.inkLeg.way.style.display = onWay ? '' : 'none'; this.inkLeg.lake.style.display = onLake ? '' : 'none';
  }

  drawMap(player) {
    const w = this.world, ctx = this.mapCtx, W = this.canvas.width, H = this.canvas.height;
    if (!W || !H) return;
    const v = this.view, spanX = v.span, mPerPx = spanX / W, spanZ = mPerPx * H;
    const x0 = v.cx - spanX / 2, z0 = v.cz - spanZ / 2;
    const k = W / 1040; // stroke and type scale: the sheet is designed at 1040 px across
    const sheet = this.mode === 'sheet', lay = this.layers;
    const toPx = (x, z) => [(x - x0) / mPerPx, (z - z0) / mPerPx];
    const inView = (ax, az, bx, bz) => !(bx < x0 || ax > x0 + spanX || bz < z0 || az > z0 + spanZ);
    // What the map may show (sheets.js view): Sandbox everything; at an outfitter the whole wilderness, the sheets dotted
    // over it; in the wild only the sheets you own, everything on them cut to their neatlines, and blank paper round
    // them (with none in view, only you and the north arrow).
    const sh = this.sheetsOn, look = sh ? sh.view() : 'open';
    const clipped = look === 'owned', owned = clipped ? sh.ownedSheets().filter((s) => inView(s.x0, s.z0, s.x1, s.z1)) : [];
    const blank = clipped && !owned.length;
    const onMine = (ax, az, bx, bz) => !clipped || owned.some((s) => !(bx < s.x0 || ax > s.x1 || bz < s.z0 || az > s.z1));
    // the paint is cut to your sheets (in the wild), and always to the baked country (past its edge the far tiles' halos
    // would show as stripes)
    const clip = () => {
      ctx.save();
      ctx.beginPath();
      const rect = (ax, az, bx, bz) => { ax = Math.max(ax, w.minX); az = Math.max(az, w.minZ); bx = Math.min(bx, w.maxX); bz = Math.min(bz, w.maxZ); if (bx > ax && bz > az) { const [a, b] = toPx(ax, az); ctx.rect(a, b, (bx - ax) / mPerPx, (bz - az) / mPerPx); } };
      if (clipped) for (const s of owned) rect(s.x0, s.z0, s.x1, s.z1);
      else rect(w.minX, w.minZ, w.maxX, w.maxZ);
      ctx.clip();
    };
    ctx.fillStyle = PAPER;
    ctx.fillRect(0, 0, W, H);
    ctx.imageSmoothingEnabled = true;
    this.inkBudget = 2; let sheetBudget = 1; // round A-B: inks remade in this frame
    const depthLabels = []; // [level, x, z] from the fine tiles in view, lettered once the view is close
    const soundings = [];   // [image, x, y, size]: the fine tiles' depth contours, drawn with the rest of the detail
    if (!blank) {
      clip();
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
          if (!inView(ox, oz, ox + farMetres, oz + farMetres) || !onMine(ox, oz, ox + farMetres, oz + farMetres)) continue;
          const img = this.farImage(e);
          if (!img) continue;
          const [a, b] = toPx(ox, oz);
          ctx.drawImage(img, a, b, farMetres / mPerPx + 0.5, farMetres / mPerPx + 0.5);
        }
        for (const key of this.farImages.keys()) if (!aliveFar.has(key)) this.farImages.delete(key);
        // round A-B: the lakes you have paddled, inked: a layer per sheet at the far field's 80 m (explored.js), cut to
        // its sheet; under the fine tiles, which carry their own at 10 m
        if (explored.lakes.count) {
          const inked = explored.inkSheets();
          for (const s of SHEETS) {
            if (!inked.has(s.id) || !inView(s.x0, s.z0, s.x1, s.z1) || !onMine(s.x0, s.z0, s.x1, s.z1)) continue;
            const made = explored.builds, L = explored.sheetInk(s, sheetBudget > 0);
            if (explored.builds !== made) sheetBudget--; // one made a frame at most
            if (!L) continue;
            const [a, b] = toPx(s.x0, s.z0), [la, lb] = toPx(L.x, L.z);
            ctx.save(); ctx.beginPath(); ctx.rect(a, b, (s.x1 - s.x0) / mPerPx, (s.z1 - s.z0) / mPerPx); ctx.clip();
            ctx.drawImage(L.canvas, la, lb, L.w / mPerPx, L.h / mPerPx);
            ctx.restore();
          }
        }
        // every tile in view at full detail once the view is close enough for contours to read: streamed
        // tiles from their own cells, the rest fetched for the map alone (in the wild, only on your sheets)
        const live = new Map(w.tiles.readyTiles().map((e) => [e.key, e]));
        for (const key of this.fineImages.keys()) if (!live.has(key)) this.fineImages.delete(key);
        if (mPerPx < FINE_M_PER_PX) {
          this.tick++;
          const [tx0, ty0] = w.tileOf(x0, z0), [tx1, ty1] = w.tileOf(x0 + spanX, z0 + spanZ);
          // nearest the centre first, so the middle of the view sharpens before the edges
          const order = [];
          for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) order.push([tx, ty, Math.hypot(tx + 0.5 - (v.cx - w.originX) / w.tileMetres, ty + 0.5 - (v.cz - w.originZ) / w.tileMetres)]);
          order.sort((p, q) => p[2] - q[2]);
          let painted = 0, fresh = 0;
          for (const [tx, ty] of order) {
            const [ox, oz] = w.tileOrigin(tx, ty);
            if (!onMine(ox, oz, ox + w.tileMetres, oz + w.tileMetres)) continue;
            const key = `${tx},${ty}`, e = live.get(key);
            let img;
            // a streamed tile's image is painted on first sight, a few a frame at most (fb3 C: the rest wait a frame or
            // two with the far image under them, instead of all of them in the frame the map opens); prepaint has most
            // of them done before M is pressed
            if (e) { if (this.fineImages.has(key)) img = this.fineImage(e); else if (fresh < FINE_PER_FRAME) { img = this.fineImage(e); fresh++; } }
            else if (painted < 2 || this.mapTiles.get(key)?.img) { const had = this.mapTiles.get(key)?.img; img = this.mapTile(tx, ty); if (img && !had) painted++; }
            if (!img) continue;
            const [a, b] = toPx(ox, oz);
            ctx.drawImage(img, a, b, w.tileMetres / mPerPx + 0.5, w.tileMetres / mPerPx + 0.5);
            const ink = this.tileInk(img, key, tx, ty, !!e); // round A-B: its lakes you have paddled, inked
            if (ink) ctx.drawImage(ink, 1, 1, ink.width - 2, ink.height - 2, a, b, w.tileMetres / mPerPx + 0.5, w.tileMetres / mPerPx + 0.5);
            if (img.depth && lay.depths) soundings.push([img.depth, a, b, w.tileMetres / mPerPx + 0.5]);
            if (mPerPx < 7 && img.labels && lay.depths) depthLabels.push(...img.labels);
          }
          this.pruneMapTiles();
        }
      }
      ctx.restore();
    }
    ctx.drawImage(this.grain, 0, 0);
    // the detail a paddler has the sheet for: the soundings, the portages with their rods, the campsites, the task
    // areas and the keepers' rings, the lake names and the docks (in the wild, on your sheets only)
    const told = !blank && lay.tasks && this.ctx && this.ctx.outfitter && typeof this.ctx.outfitter.toldHints === 'function' ? this.ctx.outfitter.toldHints() : [];
    if (!blank) {
      clip();
      for (const [img, a, b, size] of soundings) ctx.drawImage(img, a, b, size, size);
      // depth figures on the sounded lakes, in metres, haloed in the water colour
      if (depthLabels.length) {
        ctx.font = `600 ${11 * k}px ${SERIF}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.lineWidth = 3 * k; ctx.strokeStyle = `rgb(${WATER.join(',')})`; ctx.fillStyle = '#2d4f66'; ctx.lineJoin = 'round';
        const halo = `rgb(${WATER.join(',')})`, inkHalo = `rgb(${INK_WATER.join(',')})`; // round A-B: on an inked lake, haloed in its ink
        for (const [lvl, x, z] of depthLabels) { if (!inView(x, z, x, z)) continue; const [a, b] = toPx(x, z); ctx.strokeStyle = explored.hasLake(w.lakeIdAt(x, z)) ? inkHalo : halo; ctx.strokeText(String(lvl), a, b); ctx.fillText(String(lvl), a, b); }
        ctx.textBaseline = 'alphabetic';
      }
      // round A-B: your way, in pencil (under the portages, the sites and the names)
      this.drawRoute(ctx, x0, z0, mPerPx, inView, k, player);
      // portages: red dashed, with the rod count beside the middle of the trail when there is room; one you have crossed
      // gone over solid (round A-B)
      const close = mPerPx < 16, mid = mPerPx < 60;
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.font = `italic 600 ${13 * k}px ${SERIF}`;
      if (lay.portages) for (let pi = 0; pi < w.portages.length; pi++) {
        const p = w.portages[pi], [bx0, bz0, bx1, bz1] = p.bbox;
        if (!inView(bx0, bz0, bx1, bz1)) continue;
        ctx.beginPath();
        p.pts.forEach(([x, z], n) => { const [a, b] = toPx(x, z); if (n) ctx.lineTo(a, b); else ctx.moveTo(a, b); });
        if (explored.crossed(pi)) {
          ctx.setLineDash([]); ctx.strokeStyle = CROSSED_UNDER; ctx.lineWidth = (close ? 3.6 : 2.6) * k; ctx.stroke();
          ctx.setLineDash(close ? [9 * k, 3 * k] : [5 * k, 2 * k]); ctx.strokeStyle = CROSSED; ctx.lineWidth = (close ? 3 : 2.1) * k; ctx.stroke(); ctx.setLineDash([]);
        } else { ctx.setLineDash(close ? [7 * k, 4 * k] : [4 * k, 3 * k]); ctx.strokeStyle = '#c0392b'; ctx.lineWidth = (close ? 2.4 : 1.6) * k; ctx.stroke(); ctx.setLineDash([]); }
        if (close) {
          const m = p.pts[Math.floor(p.pts.length / 2)], [mx, my] = toPx(m[0], m[1]);
          ctx.fillStyle = '#b4321f'; ctx.textAlign = 'left';
          ctx.fillText(`${p.rods} rods`, mx + 7 * k, my - 6 * k);
        }
      }
      // campsites: red dots with a pale centre
      if (mid && lay.campsites) {
        const r = (close ? 4.2 : 2.6) * k;
        for (let ci = 0; ci < w.campsites.length; ci++) {
          const c = w.campsites[ci];
          if (!inView(c.x, c.z, c.x, c.z)) continue;
          const [a, b] = toPx(c.x, c.z);
          ctx.beginPath(); ctx.arc(a, b, r, 0, 6.28); ctx.fillStyle = '#c0392b'; ctx.fill();
          if (close) { ctx.beginPath(); ctx.arc(a, b, r * 0.38, 0, 6.28); ctx.fillStyle = '#f4e9d6'; ctx.fill(); }
          // round A-B: a night slept there, ticked in pencil beside it
          if (explored.stayed(ci)) {
            const t = (close ? 1 : 0.75) * k;
            ctx.beginPath(); ctx.moveTo(a + r + 1.5 * t, b - 4.5 * t); ctx.lineTo(a + r + 4.5 * t, b - 0.8 * t); ctx.lineTo(a + r + 11 * t, b - 11 * t);
            ctx.strokeStyle = PENCIL_INK; ctx.lineWidth = 2 * t; ctx.stroke();
          }
        }
      }
      // the keepers' words (outfitter.js toldHints): a ring pencilled round the water they meant, as a keeper marks your
      // map across the counter, and what for in the same hand
      // (tuning, the content join's leftover: two rumours on one lake wrote their words over each other; a label that
      // would lie on one already written goes a line lower, up to LABEL_TRIES lines)
      const placed = [], LABEL_TRIES = 4;
      const place = (text, x, y, align, lh) => {
        const w = ctx.measureText(text).width, x0 = align === 'center' ? x - w / 2 : x, box = (yy) => ({ x0, x1: x0 + w, y0: yy - lh * 0.8, y1: yy + lh * 0.2 });
        let yy = y;
        for (let n = 0; n < LABEL_TRIES && placed.some((q) => { const b = box(yy); return b.x0 < q.x1 && q.x0 < b.x1 && b.y0 < q.y1 && q.y0 < b.y1; }); n++) yy += lh;
        placed.push(box(yy));
        return yy;
      };
      for (const h of told) {
        if (!inView(h.x - h.r, h.z - h.r, h.x + h.r, h.z + h.r)) continue;
        const [a, b] = toPx(h.x, h.z), r = Math.max(h.r / mPerPx, 9 * k);
        ctx.beginPath(); ctx.ellipse(a, b, r * 1.04, r * 0.97, 0.3, 0, 6.28);
        ctx.fillStyle = 'rgba(74, 64, 54, 0.07)'; ctx.fill();
        ctx.lineCap = 'round';
        ctx.strokeStyle = 'rgba(74, 64, 54, 0.62)'; ctx.lineWidth = 1.7 * k; ctx.stroke();
        // a second, lighter pass a hair off the first, the way a pencil goes round twice
        ctx.beginPath(); ctx.ellipse(a + 1.5 * k, b - 1 * k, r * 1.01, r * 1.0, 0.9, 0.4, 5.9);
        ctx.strokeStyle = 'rgba(74, 64, 54, 0.3)'; ctx.lineWidth = 1.1 * k; ctx.stroke();
        if (mid || r > 30 * k) {
          // what for, just inside the top of the ring (kept on the sheet when the top runs off it)
          ctx.font = `600 ${17 * k}px ${PENCIL}`; ctx.fillStyle = 'rgba(74, 64, 54, 0.9)'; ctx.textAlign = 'center';
          const ty = clamp(r > 26 * k ? b - r + 21 * k : b - r - 6 * k, 24 * k, H - 12 * k), tx = clamp(a, 70 * k, W - 70 * k);
          const text = h.label || HINT_LABEL[h.kind] || 'a keeper’s word';
          ctx.fillText(text, tx, place(text, tx, ty, 'center', 19 * k)); // content join: a rumour's own words (npcs.js) first
        }
      }
      // lake names, letter-spaced serif capitals, for lakes wide enough on screen to carry one
      if (lay.lakes) {
        ctx.font = `italic 600 ${(close ? 17 : 14) * k}px ${SERIF}`; ctx.fillStyle = '#2d4f66'; ctx.textAlign = 'center';
        const minCells = Math.max(600, (5 * mPerPx) ** 2);
        for (const l of w.lakes) {
          if (!l || !l.name || l.cells < minCells || !inView(l.cx, l.cz, l.cx, l.cz)) continue;
          const [a, b] = toPx(l.cx, l.cz);
          ctx.fillText(spaced(l.name.toUpperCase()), a, b + 6 * k);
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
      ctx.restore();
    }
    // The notices' places (tasks.js hints, the world cards of 2026-10-24): the keeper's red pencil, a wobbly ring not
    // quite closed, as if annotated by hand across the counter, with its word in the same hand. Tight round a campsite
    // or landing you know (named in the notice, or on a map you can see) and named ("the island site"); else round the
    // bay, arm or stretch the notice describes, never the whole lake. Drawn over blank paper too, outside the sheets'
    // clip: the pencil goes where the keeper pointed, sheet or no sheet.
    const hints = lay.tasks && this.ctx && this.ctx.tasks && typeof this.ctx.tasks.hints === 'function' ? this.ctx.tasks.hints() : [];
    for (const h of hints) {
      if (!inView(h.x - h.r, h.z - h.r, h.x + h.r, h.z + h.r)) continue;
      const [a, b] = toPx(h.x, h.z), r = Math.max(h.r / mPerPx, 7 * k);
      pencilRing(ctx, a, b, r, k, Math.abs(Math.round(h.x * 7 + h.z * 13)));
      if (h.label && (mPerPx < 60 || h.tight)) {
        ctx.font = `600 ${16 * k}px ${PENCIL}`; ctx.fillStyle = 'rgba(176, 40, 30, 0.9)';
        if (r > 44 * k) { ctx.textAlign = 'center'; ctx.fillText(h.label, clamp(a, 70 * k, W - 70 * k), clamp(b - r + 20 * k, 24 * k, H - 12 * k)); }
        else { ctx.textAlign = 'left'; ctx.fillText(h.label, clamp(a + r * 0.78, 8 * k, W - 120 * k), clamp(b - r * 0.82 - 4 * k, 24 * k, H - 12 * k)); }
      }
    }
    this.hintLegend(told.length > 0);
    // round A-B: off your sheets, your pencil line is the only thing on the paper (the ink keeps to the sheets)
    if (clipped && explored.runs.length) {
      ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W, H);
      for (const s of owned) { const [a, b] = toPx(s.x0, s.z0); ctx.rect(a, b, (s.x1 - s.x0) / mPerPx, (s.z1 - s.z0) / mPerPx); }
      ctx.clip('evenodd');
      this.drawRoute(ctx, x0, z0, mPerPx, inView, k, player);
      ctx.restore();
    }
    this.inkLegend(explored.runs.some((r) => r.n > 1), !blank && explored.lakes.count > 0);
    if (clipped) this.drawNeatlines(ctx, sh, owned, toPx, k);
    if (look === 'whole' || this.table) this.drawSheetGrid(ctx, sh, toPx, inView, k);
    // blank paper on the open sheet: a pencil word for where the rest of the map is
    if (blank && sheet) {
      const none = !sh.ownedSheets().length;
      ctx.font = `600 ${24 * k}px ${PENCIL}`; ctx.fillStyle = 'rgba(74, 64, 54, 0.62)'; ctx.textAlign = 'center';
      ctx.fillText(none ? 'No sheets yet. The map tables at the outfitters sell them.' : 'None of your sheets covers this.', W / 2, H * 0.74);
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
    // the north arrow (left of the map table's list when it is up)
    const cover = this.table ? this.table.cover * (W / (this.canvas.getBoundingClientRect().width || W)) : 0;
    ctx.save(); ctx.translate(W - 44 * k - cover, 44 * k); ctx.scale(k, k);
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
    else if (!blank) {
      ctx.fillStyle = '#4a3b26'; ctx.fillRect(24 * k, H - 28 * k, bpx, 3 * k); ctx.fillRect(24 * k, H - 34 * k, 2 * k, 9 * k); ctx.fillRect(24 * k + bpx - 2 * k, H - 34 * k, 2 * k, 9 * k);
      ctx.font = `600 ${12 * k}px ${SERIF}`; ctx.textAlign = 'left'; ctx.fillText(bar >= 1000 ? `${bar / 1000} km` : `${bar} m`, 24 * k + bpx + 8 * k, H - 26 * k);
    }
  }
}
