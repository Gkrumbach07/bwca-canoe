import * as THREE from 'three';
import { clamp } from './rng.js';
import { MONTHS, monthDay } from './astro.js';
import { FRESH } from './wind.js';
import { sheets, sheetAt, sheetById, SHEETS } from './sheets.js'; // hubs 2D, fb2 D: the map sheets, owned, and what the map may show
import { explored, INK_WATER, INK_RIM } from './explored.js'; // round A-B: the map filling in (the lakes paddled inked)
import { lifeKmh } from './pace.js';
import { miles, fmtDepth, fmtFtIn, fmtIn, fmtLbOz, fmtF, fmtMphMs, fmtMphKmh, fmtDist, scaleBar } from './units.js'; // imperial on screen; the game itself stays metric
import { names } from './names.js'; // d1 names: the bays, points, islands, narrows, summits and named portages on the map
import { KIND, FOREST, REGIME, WCLASS, HGM, nwiCode, wetRegime, wetBeaver, wetHgm, wclass1 } from './land.js'; // 2026-10-31: the land under you, in the developer rows
import { GROUND } from './terrain-build.js';
import { paintGround, paintBurns, burnsInView, burnWords, paintBoundary, loadBoundary, BOUNDARY, paintDock, tileGeo, tileCache, INK, lakeAt, lodOf, SMALL_LAKE, paintCreeks } from './map-render.js'; // the map as vectors (the wetlands round: paintCreeks)
import './hud.css';
const KIND_NAMES = Object.keys(KIND); // ground kind value -> its key (land.js KIND runs 0..13 in order)

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
const MIN_SPAN = 700, MAX_SPAN = 240000; // (the vector sheet stays sharp in close: 2 km was the raster's limit)
const BASE_MARGIN = 256;     // canvas px: the base drawing reaches this far past the view on each side (drawMap)
// the scale bar's round distances (m, words): feet under a quarter mile, then miles
const SCALE_STEPS = [[152.4, '500 ft'], [304.8, '1,000 ft'], [402.34, '¼ mi'], [804.67, '½ mi'], [1609.34, '1 mi'], [3218.69, '2 mi'], [8046.72, '5 mi'], [16093.4, '10 mi'], [32186.9, '20 mi'], [80467.2, '50 mi']];
const WATER = [184, 208, 216], RIM = [84, 118, 136];
const TINT_LOW = [234, 226, 202], TINT_HIGH = [206, 204, 168]; // the overview's relief, as map-render.js tints the tiles
const PAPER = '#ece4cf';
const NEAT = 'rgba(74, 59, 38, 0.55)', FOLD = 'rgba(74, 59, 38, 0.4)'; // an owned sheet's neatline, and where two of yours meet
// fb2 D: the printed sheets over the whole map (at an outfitter): yours ruled in ink, the rest dotted, red where this
// table sells it
const OWN_LINE = 'rgba(42, 52, 30, 0.85)', DOT_LINE = 'rgba(74, 59, 38, 0.72)', SOLD_DOT = 'rgba(180, 50, 31, 0.9)';
const SERIF = 'Alegreya, Georgia, "Times New Roman", serif';
// round A-B: the pencil (a night's tick by a site), and a portage you have crossed gone over solid (explored.js has the
// lakes' ink). (The pencilled "your way" line is gone: the owner, 2026-10-31, "I don't like the 'your way' lines that are
// drawn. Just completely remove that." explored.js still keeps the route for the trip's record.)
const PENCIL_INK = 'rgba(54, 46, 38, 0.86)';
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
// Where a notice done is paid (a dock): a "$" in the keeper's red pencil, ringed by hand, with how many wait there when
// it is more than one. (The owner, 2026-10-31, of the numbered red discs: they "look out of place": the open notices
// are their pencil ring alone now, and this the same hand rather than a badge.)
function pencilSeal(ctx, a, b, n, k, seed) {
  ctx.save();
  pencilRing(ctx, a, b, 10.5 * k, k * 0.85, seed);
  ctx.font = `700 ${22 * k}px ${PENCIL}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(176, 40, 30, 0.92)'; ctx.fillText('$', a, b + 1.5 * k);
  if (n > 1) { ctx.font = `700 ${16 * k}px ${PENCIL}`; ctx.textAlign = 'left'; ctx.fillText(`×${n}`, a + 12.5 * k, b - 7 * k); }
  ctx.restore();
}
// (the owner, 2026-10-31: "I don't like how the hover is immediate. It should have a little delay, so it's not just
// constantly popping up a hover every time I move my mouse over it"): the tip waits for the pointer to rest this long
// within a few pixels; moving off that spot puts it away (hoverMove)
const HOVER_REST = 420, HOVER_STILL = 5; // ms, css px
const PRESS = 260;           // ms: M let go sooner than this was a press, not a hold (nothing shows until it is one or the other: fb3 C)
const PREPAINT_RANGE = 6000; // m: tiles traced ahead for the map while it is away, this far from you at most
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
// 2026-10-31: the cold's trend beside its icon (energy.warmthTrend): an arrow, up warming, down chilling, and what does
// it: a flame (the fire), a roof (indoors), a sun (mild air, dry clothes), the wind, a moon (the night), rain, waves (in
// the water, wading), a drop (wet through); 12 px, currentColor
const TREND_GLYPH = {
  fire: '<path d="M6 1.2c.4 2-1.8 3-1.8 5.3a1.8 1.8 0 0 0 3.6 0c0-.9-.5-1.5-.5-1.5 1.6.8 2.5 2.4 2.5 3.8a3.8 3.8 0 0 1-7.6 0C2.2 5.6 5.4 4.2 6 1.2Z" fill="currentColor"/>',
  indoors: '<path d="M1.5 6.2 6 2l4.5 4.2M3 5.2v5.3h6V5.2" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>',
  sun: '<circle cx="6" cy="6" r="2.3" fill="currentColor"/><path d="M6 .8v1.5M6 9.7v1.5M.8 6h1.5M9.7 6h1.5M2.3 2.3l1 1M8.7 8.7l1 1M2.3 9.7l1-1M8.7 3.3l1-1" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>',
  wind: '<path d="M1 4h6.2a1.6 1.6 0 1 0-1.6-1.6M1 7h8.6a1.6 1.6 0 1 1-1.6 1.6M1 10h4.5" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>',
  night: '<path d="M8.6 1.6a4.6 4.6 0 1 0 1.8 6.6A3.8 3.8 0 0 1 8.6 1.6Z" fill="currentColor"/>',
  rain: '<path d="M3 2.5 2 5.5M6.5 2.5l-1 3M10 2.5l-1 3M4.5 7 3.5 10M8 7l-1 3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>',
  swim: '<path d="M.8 4.5c1.3-1.2 2.4-1.2 3.5 0s2.3 1.2 3.5 0 2.3-1.2 3.4 0M.8 8.5c1.3-1.2 2.4-1.2 3.5 0s2.3 1.2 3.5 0 2.3-1.2 3.4 0" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>',
  wet: '<path d="M6 1.2S2.6 5 2.6 7.3a3.4 3.4 0 0 0 6.8 0C9.4 5 6 1.2 6 1.2Z" fill="currentColor"/>',
};
TREND_GLYPH.wade = TREND_GLYPH.swim; TREND_GLYPH.dry = TREND_GLYPH.sun;
const trendIcon = (tr) => `<svg class="arrow" width="8" height="12" viewBox="0 0 8 12" aria-hidden="true"><path d="${tr.dir > 0 ? 'M4 1.5 7 6H5v4.5H3V6H1Z' : 'M4 10.5 1 6h2V1.5h2V6h2Z'}" fill="currentColor"/></svg>${TREND_GLYPH[tr.why] ? `<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">${TREND_GLYPH[tr.why]}</svg>` : ''}`;

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
export const fmtKm = (km) => miles(km); // (kept its name: it gives miles now, from km; the callers say "mi")
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
  if (l.river) return `${l.creek && !/river/i.test(l.name || '') ? 'a creek' : 'a river'}${l.maxDepth ? `, sounded to ${fmtDepth(l.maxDepth)}` : ''}`;
  const acres = (l.cells * 100) / 4046.86;
  const size = acres > 2000 ? 'the big water' : acres > 400 ? 'a good-sized lake' : acres > 60 ? 'a small lake' : 'a pond';
  const a = acres >= 100 ? Math.round(acres / 10) * 10 : Math.max(1, Math.round(acres));
  return `${size}: ${a.toLocaleString('en-US')} ${plural(a, 'acre')}${l.maxDepth ? `, sounded to ${fmtDepth(l.maxDepth)}` : ''}`;
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
    this.layers = { lakes: true, portages: true, campsites: true, tasks: true, depths: true, notes: true, burns: true, boundary: true };
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
    this.base = null;            // the sheet drawn a margin past the view (drawMap)
    this.hits = [];              // what the pointer can point at on it (drawLayers)
    this.hover = null; this.focus = null;
    this.host = null;            // 'book' while the sheet lies in the book's map tab (map-book.js)
    this.bookHost = null;        // the book, which M opens at its map tab (map-book.js sets it)
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
    // The canvas re-measured whenever its laid-out box changes, not only at setMode and a window resize: the map table
    // adds its class, and with it the spread's layout, after setMode('sheet') has measured the floating sheet
    // (maptable.js show), and the book's page can settle after mountIn. Redrawn at once, so the fresh (blank) backing
    // store never reaches the screen (fb3 C (21): a sizing after the frame's draw wiped it).
    if (typeof ResizeObserver === 'function') {
      new ResizeObserver(() => {
        const c = this.canvas, w = c.width, h = c.height;
        this.sizeCanvas();
        if ((c.width !== w || c.height !== h) && this.player && this.grain && this.mode !== 'hidden') { this.drawMap(this.player); this.drawn = true; this.placeConfirm(); }
      }).observe(this.canvas);
    }
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
        // the map is a tab of the book (the owner, 2026-10-31: "pack, journal, map. You could still open map with just M"):
        // M on the map tab closes the book, on another tab turns to the map
        if (this.host === 'book' && this.bookHost) { this.bookHost.closeMap(); return; }
        if (this.mode === 'sheet') { this.setMode(this.settings && this.settings.cornerSheet ? 'corner' : 'hidden'); return; }
        if (this.paper === 'journal' && this.bookHost) { this.bookHost.showMap(); return; }
        this.mKey.downAt = performance.now(); this.mKey.held = true; clearTimeout(this.mKey.timer);
        if (this.paper) { const c = this.papers.get(this.paper); if (c) c(); } // one paper object at a time
        // fb3 C (21, "opening the map is sorta glitchy"): nothing shows until the key has said whether it is a press or a
        // hold. The glance used to slide up at the key's down and the sheet replace it at the key's up a tenth of a second
        // later: a corner panel flashing up and jumping to the middle at twice the size. Now a press (let go inside
        // PRESS) opens the sheet straight from nothing, and the glance comes up only once the key has been held PRESS.
        this.mKey.timer = setTimeout(() => { if (this.mKey.held && this.mode !== 'sheet') this.setMode('glance'); }, PRESS);
      } else if (e.code === 'Escape') {
        if (this.pin) { this.clearPin(); e.mapPin = true; } // (the book leaves its Esc to the pin: journal.js)
        else if (this.mode === 'sheet' && this.host !== 'book') this.setMode(this.settings && this.settings.cornerSheet ? 'corner' : 'hidden');
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
      this.hoverOff(); // (a press is not a rest)
    });
    c.addEventListener('pointermove', (e) => {
      if (!drag && this.table && this.mode === 'sheet') { const [px, py] = rectPx(e), [x, z] = this.worldAt(px, py); this.table.hoverAt(x, z); return; } // fb2 D: the sheet under the pointer
      if (!drag && this.mode === 'sheet') { const [px, py] = rectPx(e); this.hoverMove(px, py, e); return; } // what is under the pointer, once it rests (map-book.js says what)
      if (!drag || this.mode !== 'sheet') return;
      this.hoverOff();
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
      // a notice's tag or ring, a seal on a dock, a pencilled word: the book's map side takes it (map-book.js)
      const hit = this.hitAt(px, py);
      if (hit && typeof this.onMarkClick === 'function' && this.onMarkClick(hit)) return;
      this.propose(x, z, false);
    };
    c.addEventListener('pointerleave', () => { this.hoverOff(); c.style.cursor = ''; });
    // a lake's page straight from the sheet (map-book.js)
    c.addEventListener('dblclick', (e) => {
      if (this.mode !== 'sheet' || this.table || typeof this.onLakePage !== 'function') return;
      const [px, py] = rectPx(e), [x, z] = this.worldAt(px, py), id = lakeAt(this.world, x, z);
      if (id > 0 && this.lakeShown(x, z)) { this.clearPin(); this.onLakePage(id); }
    });
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
      this.view.span = span; this.zoomT = performance.now();
      this.hoverOff();
      this.setCentre(wx - (px - c.width / 2) * mPerPx, wz - (py - c.height / 2) * mPerPx);
    }, { passive: false });
    if (this.el.mapLayers) this.el.mapLayers.addEventListener('click', (e) => {
      const b = e.target.closest('.layer'); if (!b) return;
      const k = b.dataset.layer; this.layers[k] = !this.layers[k]; b.classList.toggle('off', !this.layers[k]);
    });
    if (this.el.mapClose) this.el.mapClose.addEventListener('click', () => this.setMode(this.settings && this.settings.cornerSheet ? 'corner' : 'hidden'));
    if (this.el.pinGo) this.el.pinGo.addEventListener('click', () => this.confirm());
    if (this.el.pinCancel) this.el.pinCancel.addEventListener('click', () => this.clearPin());
    // the pin's third stamp: the lake's page in the book (map-book.js onLakePage), when the pin is on a lake you can see
    if (this.el.pinGo && this.el.pinGo.parentNode) {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'stamp outline'; b.id = 'pin-lake'; b.textContent = 'The lake’s page'; b.hidden = true;
      this.el.pinGo.parentNode.insertBefore(b, this.el.pinCancel);
      b.addEventListener('click', () => { const id = this.pin && this.pin.lake; this.clearPin(); if (id && typeof this.onLakePage === 'function') this.onLakePage(id); });
      this.el.pinLake = b;
      // the tip under the pointer (hoverAt)
      const tip = document.createElement('div'); tip.id = 'map-tip'; tip.setAttribute('role', 'status');
      (this.el.mapBody || this.el.map).appendChild(tip);
      this.el.tip = tip;
    }
    const scrim = $('scrim');
    if (scrim) scrim.addEventListener('click', () => { if (this.paper === 'map') this.setMode(this.settings && this.settings.cornerSheet ? 'corner' : 'hidden'); else if (this.paper && this.paper !== 'outfitter') { const c = this.papers.get(this.paper); if (c) c(); } });
    this.registerPaper('map', () => { if (this.mode === 'sheet') this.setMode(this.settings && this.settings.cornerSheet ? 'corner' : 'hidden'); });
  }

  worldAt(px, py) {
    const v = this.view, mPerPx = v.span / this.canvas.width;
    return [v.cx + (px - this.canvas.width / 2) * mPerPx, v.cz + (py - this.canvas.height / 2) * mPerPx];
  }

  // what is under canvas pixel (px, py) on the sheet: a notice's tag, a seal, a ring, a pencilled word, a dock, a campsite
  // or a portage (drawLayers keeps them in this.hits), nearest first by kind; null for open paper or water
  hitAt(px, py) {
    const [x, z] = this.worldAt(px, py), mPerPx = this.view.span / this.canvas.width, k = this.canvas.width / 1040, w = this.world;
    let best = null, bd = Infinity;
    const take = (h, d, pri) => { const s = d + pri; if (s < bd) { bd = s; best = h; } };
    for (const h of this.hits) {
      if (h.tag) { const d = Math.hypot(h.tag[0] - x, h.tag[1] - z) / mPerPx; if (d < 13 * k) take(h, d, 0); }
      const d = Math.hypot(h.x - x, h.z - z) / mPerPx;
      // a notice's pencil ring is its own mark: on the line it is taken first, anywhere inside it after the rest
      if (h.kind === 'task') { const off = Math.abs(d - Math.max(h.r / mPerPx, 7 * k)); if (off < 8 * k) take(h, off, 0); }
      if (h.kind === 'claim' && d < 18 * k) take(h, d, 1);
      else if (h.kind === 'dock' && d < 10 * k) take(h, d, 4);
      else if (h.kind === 'site' && d < 8 * k) take(h, d, 3);
      else if (h.kind === 'dam' && d < 7 * k) take(h, d, 4.5); // the wetlands round
      else if ((h.kind === 'task' || h.kind === 'note') && d < Math.max(h.r / mPerPx, 9 * k)) take(h, 40 + d / 8, h.kind === 'task' ? 0 : 6);
      else if (h.kind === 'portage') {
        const p = w.portages[h.i]; if (!p) continue;
        let m = Infinity;
        for (let i = 1; i < p.pts.length; i++) {
          const [ax, az] = p.pts[i - 1], [bx, bz] = p.pts[i], dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz;
          const t = L2 ? clamp(((x - ax) * dx + (z - az) * dz) / L2, 0, 1) : 0;
          m = Math.min(m, Math.hypot(x - ax - dx * t, z - az - dz * t));
        }
        if (m / mPerPx < 7 * k) take(h, m / mPerPx, 5);
      }
    }
    return best;
  }
  // whether the map shows what is at (x, z): Sandbox, an outfitter's whole map, or a sheet of yours
  lakeShown(x, z) { const sh = this.sheetsOn; return !sh || sh.view() !== 'owned' || sh.showsDetail(x, z); }
  // The pointer moving over the sheet: the hand for what a click takes (a notice, a seal) at once, since that is cheap and
  // pops nothing up; the tip only once the pointer has rested HOVER_REST ms within HOVER_STILL px. A tip that is up stays
  // put while the pointer keeps to that spot (no tip chasing the cursor) and goes as soon as it leaves it.
  hoverMove(px, py, e) {
    const hit = this.hitAt(px, py), click = !!(hit && (hit.kind === 'task' || hit.kind === 'claim') && typeof this.onMarkClick === 'function');
    this.canvas.style.cursor = click ? 'pointer' : '';
    const w = this.hoverWait, far = (q) => !q || Math.hypot(e.clientX - q.cx, e.clientY - q.cy) > HOVER_STILL;
    if (this.hoverShown && !far(this.hoverShown)) return;
    if (this.hoverShown) this.hoverOff();
    else if (w && !far(w)) return; // (still resting: the wait goes on from where it began)
    clearTimeout(this.hoverTimer);
    const q = { px, py, cx: e.clientX, cy: e.clientY };
    this.hoverWait = q;
    this.hoverTimer = setTimeout(() => {
      this.hoverWait = null;
      if (this.mode !== 'sheet' || this.table) return;
      this.hoverAt(q.px, q.py, { clientX: q.cx, clientY: q.cy });
      this.hoverShown = this.hover ? q : null;
    }, HOVER_REST);
  }
  // the tip put away and any wait for one dropped (a drag, the wheel, a press, the pointer gone)
  hoverOff() {
    clearTimeout(this.hoverTimer); this.hoverWait = null; this.hoverShown = null;
    if (this.hover || (this.el.tip && this.el.tip.classList.contains('show'))) this.hoverAt(-1, -1, null);
  }
  // the tip under the pointer: map-book.js onHover says what it is ({ html, ring } or null); px < 0 hides it
  hoverAt(px, py, e) {
    const tip = this.el.tip;
    if (px < 0 || this.pin || typeof this.onHover !== 'function') { this.hover = null; if (tip) tip.classList.remove('show'); return; }
    const [x, z] = this.worldAt(px, py), hit = this.hitAt(px, py);
    let r = null;
    try { r = this.onHover({ x, z, hit, shown: this.lakeShown(x, z) }); } catch (err) { console.warn('map: hover', err); }
    this.hover = r;
    if (!tip) return;
    if (!r || !r.html) { tip.classList.remove('show'); return; }
    if (tip._html !== r.html) { tip.innerHTML = r.html; tip._html = r.html; }
    const box = (this.el.mapBody || this.canvas).getBoundingClientRect(), cr = this.canvas.getBoundingClientRect();
    const lx = e.clientX - box.left, ly = e.clientY - box.top, tw = tip.offsetWidth || 260, th = tip.offsetHeight || 60;
    tip.style.left = `${clamp(lx + 16, 6, cr.width - tw - 6)}px`;
    tip.style.top = `${ly + 18 + th > cr.height ? ly - th - 12 : ly + 18}px`;
    tip.classList.add('show');
  }

  setCentre(cx, cz) {
    const w = this.world, m = this.view.span * 0.45, mz = m * (this.canvas.height / this.canvas.width);
    // (zoomed out past the whole country the bounds cross, and clamp left it in a corner of the sheet: centred on it then)
    const fit = (c, lo, hi) => (lo <= hi ? clamp(c, lo, hi) : (lo + hi) / 2);
    this.view.cx = fit(cx, w.minX + m, w.maxX - m);
    this.view.cz = fit(cz, w.minZ + mz, w.maxZ - mz);
    this.placeConfirm();
  }

  // hidden | glance (held M) | sheet (pressed M, on the scrim) | corner (a small sheet that stays up)
  setMode(mode) {
    // the sheet opens in the book's map tab when the book has one (M, "Look at the map", the old setBig); the map table
    // keeps the sheet on its own in the store (maptable.js)
    if (mode === 'sheet' && this.bookHost && !this.table && this.host !== 'book' && this.bookHost.showMap()) return;
    if (mode === this.mode) return;
    const was = this.mode;
    this.mode = mode;
    const m = this.el.map;
    // round A join (the owner, 2026-10-26: "map on close snaps to top left before fading"): the sheet's place and size
    // are its class, so taking the class off with the show snapped it to the paper's corner for the whole fade. Closed
    // to nothing, it keeps its class (and its last drawing: nothing draws while hidden) until the fade is over.
    clearTimeout(this.sheetFade);
    // (the owner, 2026-11-01: "when i hold M and release the map flashes to the top left still": the glance and the
    // corner keep their place while they fade out too, not only the sheet)
    const fading = mode === 'hidden' && (was === 'sheet' || was === 'glance' || was === 'corner') ? was : null;
    m.classList.toggle('glance', mode === 'glance' || fading === 'glance'); m.classList.toggle('sheet', mode === 'sheet' || fading === 'sheet'); m.classList.toggle('corner', mode === 'corner' || fading === 'corner');
    m.classList.toggle('show', mode !== 'hidden');
    if (fading) this.sheetFade = setTimeout(() => { if (this.mode === 'hidden') m.classList.remove(fading); }, SHEET_FADE);
    if (mode !== 'hidden') this.loadOverview();
    if (mode === 'sheet') {
      if (this.host !== 'book') this.openPaper('map');
      this.view.span = this.openSpan();
      if (this.player) { this.view.cx = this.player.x; this.view.cz = this.player.z; }
    } else {
      if (was === 'sheet' && this.host !== 'book') this.closePaper('map');
      this.view.span = GLANCE_SPAN;
      this.clearPin();
      this.hoverOff();
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
  // The sheet laid in the book's map tab (map-book.js): the map's paper moves into the page and is the sheet there, under
  // the book's own paper register; unmount puts it back for the glance, the corner and the map table.
  mountIn(el) {
    const m = this.el.map;
    if (this.mode === 'sheet' && this.host !== 'book') this.setMode('hidden');
    clearTimeout(this.sheetFade); m.classList.remove('sheet', 'glance', 'corner');
    if (this.mode !== 'hidden') this.setMode('hidden');
    this.host = 'book';
    el.appendChild(m); m.classList.add('in-book');
    this.setMode('sheet');
  }
  unmount() {
    if (this.host !== 'book') return;
    const m = this.el.map;
    // gone at once, without the paper's fade: the book fades itself, and the sheet taken out of the page with its classes
    // off would otherwise fade out over the screen's top-left corner (the owner, 2026-11-01: "the map flashes to the top
    // left still")
    m.style.transition = 'none';
    this.setMode('hidden');
    clearTimeout(this.sheetFade); m.classList.remove('sheet', 'show', 'in-book', 'glance', 'corner');
    this.host = null;
    const j = $('journal'); if (j && j.parentNode) j.parentNode.insertBefore(m, j);
    void m.offsetWidth; // (the hidden state applied before the transition comes back)
    m.style.transition = '';
    this.hoverOff();
  }
  // the view put on a place (the book's search, a notice in its list): centred there at a span that shows it
  lookAt(x, z, span = null, r = 0) {
    if (span) this.view.span = clamp(span, MIN_SPAN, MAX_SPAN);
    this.setCentre(x, z);
    this.focus = { x, z, r, t: performance.now() };
    this.hoverOff();
  }

  // The backing store follows the displayed size (sharp on retina when the map fills the screen). Its laid-out size, not
  // getBoundingClientRect's: that is the box after transforms (the book's leaflet lies a third of a degree askew, the
  // paper slides in from 24 px below), and a backing store measured mid-transform kept the wrong size.
  sizeCanvas() {
    const c = this.canvas;
    if (this.mode === 'hidden') return;
    const r = { width: c.clientWidth, height: c.clientHeight };
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
    let best = null, bd = PREPAINT_RANGE;
    for (const e of w.tiles.readyTiles()) {
      const t = tileCache.fine.get(`${e.tx},${e.ty}`);
      if (t && t.geo && t.geo.inkV === explored.lakeV) continue;
      const [ox, oz] = w.tileOrigin(e.tx, e.ty), d = Math.hypot(ox + w.tileMetres / 2 - p.x, oz + w.tileMetres / 2 - p.z);
      if (d < bd) { bd = d; best = e; }
    }
    if (best) tileGeo(w, best.tx, best.ty, false, { build: 1 }, explored.world ? explored.lakes : null, explored.lakeV);
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
    this.hoverOff();
    if (this.mode !== 'sheet') this.setMode('sheet');
    if (recentre) { this.view.cx = x; this.view.cz = z; }
    const w = this.world, p = this.player, ctx = this.ctx, sh = this.sheetsOn;
    const name = !sh || sh.view() !== 'owned' || sh.showsDetail(x, z) ? w.lakeName(lakeAt(w, x, z)) : null; // fb2 D: blank paper names nothing
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
      text = `${walk ? '' : 'Paddle in here? '}${name ? `${name}, ` : ''}about ${fmtKm(km)} mi ${dir}, ${fmtDuration(hours)}${walk ? ' by the clock' : ''}${wind && wind.speed > 3 ? ' with this wind' : ''}.${hops}`;
      if (walk) text = text[0].toUpperCase() + text.slice(1);
    } else if (name) text = `${walk ? '' : 'Paddle in here? '}${name}.`;
    if (this.el.pinGo) this.el.pinGo.hidden = walk;
    const lid = lakeAt(w, x, z), L = lid > 0 ? w.lakes[lid - 1] : null;
    this.pin.lake = L && L.name && name && typeof this.onLakePage === 'function' ? lid : 0;
    if (this.el.pinLake) this.el.pinLake.hidden = !this.pin.lake;
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
    const q = clamp(t, 0, 1) ** 0.8;
    for (let k = 0; k < 3; k++) out[k] = TINT_LOW[k] + (TINT_HIGH[k] - TINT_LOW[k]) * q;
    return out;
  }

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
      // (the overview is what a far-out sheet shows while its far tiles come in: its ponds and small lakes lose their rims
      // as the far tiles' do at that zoom, map-render.js rimLeft, so the one does not flicker into the other. A water of
      // fewer pixels than SMALL_LAKE is marked 2.)
      const px2 = (ov.cellsPerPx * this.world.cell) ** 2, smallPx = SMALL_LAKE / px2, stack = [], comp = [];
      for (let k0 = 0; k0 < W * H; k0++) {
        if (water[k0] !== 1) continue;
        comp.length = 0; stack.push(k0); water[k0] = 3;
        while (stack.length) {
          const k = stack.pop(), i = k % W; comp.push(k);
          if (i > 0 && water[k - 1] === 1) { water[k - 1] = 3; stack.push(k - 1); }
          if (i < W - 1 && water[k + 1] === 1) { water[k + 1] = 3; stack.push(k + 1); }
          if (k >= W && water[k - W] === 1) { water[k - W] = 3; stack.push(k - W); }
          if (k + W < W * H && water[k + W] === 1) { water[k + W] = 3; stack.push(k + W); }
        }
        const big = comp.length > smallPx;
        for (const q of comp) water[q] = big ? 4 : 2;
      }
      const col = [0, 0, 0];
      for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
        const k = j * W + i, o = k * 4;
        let out;
        if (water[k]) {
          const land = (i > 0 && !water[k - 1]) || (i < W - 1 && !water[k + 1]) || (j > 0 && !water[k - W]) || (j < H - 1 && !water[k + W]);
          out = land && water[k] === 4 ? RIM : WATER;
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
    e.windArrow.style.transform = `rotate(${((wind.from + (wind.puffVeer || 0) + 360) % 360).toFixed(1)}deg)`; // (a gust swings it a little: wind.js PUFF)
    e.compass.querySelector('svg').setAttribute('aria-label', `Compass: heading ${compassLong(hdg)}; ${wind.label.toLowerCase()} from the ${wind.compassLong}`);
    if (matters) {
      this.set('clabel', e.compassLabel, `${wind.label} · ${fmtMphMs(wind.speed)}`, 'innerHTML');
      e.compassLabel.innerHTML = `${esc(wind.label)} · ${fmtMphMs(wind.speed)}<br>from the ${wind.compassLong}`;
      const f = player.forward, wd = wind.dir, cosRel = f.x * wd.x + f.z * wd.z;
      const aspect = player.mode !== 'paddle' ? '' : Math.abs(cosRel) < 0.5 ? ' · beam on' : cosRel < 0 ? ' · on the bow' : ' · astern';
      this.set('cwaves', e.compassWaves, `${ice ? 'frozen over' : `waves ${fmtFtIn(H)}${aspect}`}${wind.puff > 0.15 ? ' · gusting' : ''}${wind.override != null ? ' · set by hand' : ''}`);
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
        // (the owner, 2026-10-31: the lake's name, not "two portages from the landing · 12 km paddled": the trip's count
        // is chatter here)
        this.showPlace(kicker, name, lakeWords(l));
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
        const sub = here; // (2026-10-31: no km so far or food count on the day card: chatter)
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
    // (the owner, 2026-10-31: no "2 meals to cook and 2 snacks" down here; only nothing to eat at all is worth a mark)
    const food = adv && energy && energy.food + (hung ? hung.days : 0) <= 0 && !(energy.foodWords && energy.foodWords() !== 'no food') && !(hung && hung.words) ? 'no food' : '';
    const shown = food && energy && typeof energy.foodNearby === 'function' && energy.foodNearby() ? '' : food; // (the content join: not "no food" 6 m from the canoe with meals in it)
    this.set('mfood', mk.food, shown); mk.food.classList.toggle('on', !!shown);
    mk.wet.classList.toggle('on', adv && !!trip.state.wet);
    mk.gps.classList.toggle('on', !!(geo && geo.linked && geo.enabled));
    mk.mute.classList.toggle('on', !!(this.settings && this.settings.get('mute')));
    let loading = 0;
    if (w.tiles) { const t = w.tiles; loading = t.queue.length + t.pending.length + t.workers.filter((k) => k.key).length; }
    this.loading = loading;
    mk.tiles.classList.toggle('on', loading > 0);
  }

  // --- the energy bar (fb2 F; the stamina bar, 2026-10-31) --------------------------------------------------------
  // Wild n Chill's bar, as the owner asked (2026-10-24, second round): one long thin bar, top left in the Air. Each need's
  // chunk eats into it from the right end, in the bar's order cold (pale blue), sleep (orange), hunger (yellow), thirst
  // (blue): energy.chunks(); what is left is the ceiling. The green under the ceiling is stamina (the owner, 2026-10-31:
  // "it's basically like your stamina bar"): a jog, paddling hard or a hard swim spends it and it comes back in a few
  // seconds; the dim track after it is what is coming back. A chunk is dashed and marching while it grows faster than its
  // everyday rate; a chunk that shrinks at once (a meal, a drink) leaves a bright ghost of what it was, fading. The icons
  // sit under their chunks while they grow or are a tenth of the bar or more, the cold's with its trend beside it (a
  // flame by the fire, the wind, the night, the water; energy.warmthTrend). Hovering the bar or an icon, with the mouse
  // free (the book open, a paper, or the third-person paddle), says what each part is. Always up on a trip, with the
  // clock and the date beside it (the owner: "I find myself having to tab to see that information all the time").
  energyBuild() {
    const air = this.el.air; if (!air) return;
    const el = document.createElement('div');
    el.id = 'energy'; el.className = 'fade'; el.setAttribute('role', 'img'); el.setAttribute('aria-label', 'Energy');
    el.innerHTML = `<div class="ebar"><div class="track"><i class="fill"></i><i class="room"></i>${NEEDS.map((k) => `<i class="chunk ${k}"></i>`).join('')}</div>`
      + `<div class="icons">${NEEDS.map((k) => `<span class="icon ${k}">${NEED_ICON[k]}</span>`).join('')}<span class="trend"></span></div><div class="hit"></div></div>`
      + '<div class="when"><span class="clock"></span><span class="dot">·</span><span class="sc day"></span></div>';
    air.appendChild(el);
    const q = (sel) => el.querySelector(sel);
    this.eb = { el, track: q('.track'), fill: q('.fill'), room: q('.room'), chunk: {}, icon: {}, trend: q('.trend'), clock: q('.when .clock'), day: q('.when .day'), ref: null, until: 0, sig: '', top: '', prev: null, trendSig: '' };
    for (const k of NEEDS) { this.eb.chunk[k] = q(`.chunk.${k}`); this.eb.icon[k] = q(`.icon.${k}`); }
    this.tipBind(this.eb, q('.hit'), true);
  }
  // the bar's numbers for a frame: the green (stamina), the room up to the ceiling, each chunk's start from the right
  // end, and a signature that changes only when the drawing would (rounded: the DOM is spared). The Air's bar and the
  // strip over the paper draw the same state.
  barState(energy) {
    const cap = clamp(energy.ceiling, 0, 1), v = Math.min(clamp(energy.value, 0, 1), cap), ch = energy.chunks ? energy.chunks() : [];
    const pct = (x) => `${(Math.round(x * 1000) / 10).toFixed(1)}%`;
    let sig = `${pct(v)}|${pct(cap)}|${energy.winded ? 'w' : ''}`, x = 1;
    const at = {};
    for (let i = ch.length - 1; i >= 0; i--) { x -= ch[i].size; at[ch[i].key] = x; }
    for (const c of ch) sig += `|${c.key}${pct(c.size)}${c.growing ? '*' : ''}`;
    return { v, cap, ch, at, sig, pct, winded: !!energy.winded };
  }
  barApply(eb, { v, cap, ch, at, pct, winded }) {
    eb.fill.style.width = pct(v);
    eb.room.style.left = pct(v); eb.room.style.width = pct(Math.max(0, cap - v));
    if (eb.track) eb.track.classList.toggle('winded', winded);
    const prev = eb.prev;
    for (const c of ch) {
      const el = eb.chunk[c.key]; if (!el) continue;
      el.style.left = pct(at[c.key]); el.style.width = pct(c.size); el.classList.toggle('grow', c.growing);
      // a meal or a drink: the chunk shrinks at once, and a ghost of what it was flashes and fades (the owner, 2026-10-31)
      const was = prev && prev[c.key];
      if (was && was.size - c.size >= 0.012 && eb.track) this.barGhost(eb, c.key, was, pct);
    }
    eb.prev = Object.fromEntries(ch.map((c) => [c.key, { size: c.size, left: at[c.key] }]));
    eb.last = { v, cap, ch, at };
  }
  barGhost(eb, key, was, pct) {
    const g = document.createElement('i');
    g.className = `ghost ${key}`; g.style.left = pct(was.left); g.style.width = pct(was.size);
    eb.track.appendChild(g);
    setTimeout(() => g.remove(), 1300);
    const icon = eb.icon && eb.icon[key];
    if (icon) { icon.classList.remove('met'); void icon.offsetWidth; icon.classList.add('met'); setTimeout(() => icon.classList.remove('met'), 1300); }
  }
  updateEnergy(ctx) {
    const eb = this.eb; if (!eb) return;
    const { energy, trip, shell, day } = ctx;
    // co-op round 4 (the owner, 2026-11-02: "I can't see the status bar on the top unless I pause"): the bar is up in
    // play whenever the paused strip would show it, at a store and between trips too (its needs full off a trip), not
    // only on a trip under way: the strip and the bar never disagree about whether there is a bar
    const on = !!(energy && trip && !shell);
    eb.el.classList.toggle('nobar', !on);
    if (on) {
      const bar = this.barState(energy), { v, ch, at, sig } = bar;
      const tr = energy.warmthTrend ? energy.warmthTrend() : { dir: 0, why: '' }, tsig = tr.dir ? `${tr.dir}${tr.why}` : '';
      if (sig !== eb.sig || tsig !== eb.trendSig) {
        eb.sig = sig;
        this.barApply(eb, bar);
        // the icons under their chunks, nudged apart where chunks are narrow (16 px each, the cold's wider with its
        // trend beside it), within the bar
        if (tsig !== eb.trendSig) { eb.trendSig = tsig; eb.trend.innerHTML = tr.dir ? trendIcon(tr) : ''; eb.trend.className = `trend${tr.dir ? ` on ${tr.dir > 0 ? 'up' : 'down'} ${tr.why}` : ''}`; }
        const W = ENERGY_W, marks = [];
        for (const c of ch) {
          const shown = (c.size > 0.004 && (c.growing || c.size >= 0.1)) || (c.key === 'warmth' && !!tr.dir);
          eb.icon[c.key].classList.toggle('on', shown);
          if (shown) marks.push({ k: c.key, x: (at[c.key] + c.size / 2) * W, w: c.key === 'warmth' && tr.dir ? 34 : 18 });
        }
        for (let i = 1; i < marks.length; i++) marks[i].x = Math.max(marks[i].x, marks[i - 1].x + marks[i - 1].w);
        for (let i = marks.length - 1; i >= 0; i--) marks[i].x = Math.min(marks[i].x, i === marks.length - 1 ? W - marks[i].w + 10 : marks[i + 1].x - marks[i].w);
        for (const m of marks) {
          const x = Math.max(8, m.x);
          eb.icon[m.k].style.left = `${x.toFixed(1)}px`;
          if (m.k === 'warmth') eb.trend.style.left = `${(x + 9).toFixed(1)}px`;
        }
        const held = energy.heldBy || '';
        eb.el.setAttribute('aria-label', `Stamina ${Math.round(v * 100)} %${held ? `, ${held}` : ''}${tr.words ? `, ${tr.words.toLowerCase()}` : ''}`);
      }
      // under the spot card while the rod is up (both keep the top left), measured only when its words change
      const spot = this.el.spot, words = spot && spot.classList.contains('show') ? `${this.cache.spotWhere}|${this.cache.spotWho}` : '';
      if (words !== eb.spotWords) { eb.spotWords = words; const top = words ? `${48 + spot.offsetHeight + 22}px` : ''; if (top !== eb.top) { eb.top = top; eb.el.style.top = top; } }
      if (eb.tipKey) this.tipShow(eb, eb.tipKey); // the tip under the mouse follows the bar
    } else { eb.ref = null; eb.prev = null; }
    // the clock and the date beside it, always (not on the title card)
    const dayW = day ? this.dayWords(ctx) : '';
    this.set('ebClock', eb.clock, day ? clock12(day.hours) : '');
    this.set('ebDay', eb.day, `${dayW ? `${dayW} · ` : ''}${day ? `${weekdayOf(day.year, day.doy).slice(0, 3)}, ${shortDate(day.year, day.doy)}` : ''}`);
    const show = !shell && !!day;
    eb.el.classList.toggle('show', show);
    this.el.air.classList.toggle('ebar', show && on); // the readout keeps under the bar (hud.css)
  }

  // --- the bar's tip (2026-10-31: "I want to be able to hover over the effects to see what they are") -------------------
  // One paper note for both bars, under the mouse: which part of the bar is under it (the green, the room, a chunk) or
  // which icon, and what it means now.
  tipBind(bar, hit, icons) {
    if (!hit) return;
    if (!this.etip) { const t = document.createElement('div'); t.id = 'etip'; t.setAttribute('role', 'tooltip'); document.body.appendChild(t); this.etip = t; }
    const pick = (ev) => {
      const tr = bar.track.getBoundingClientRect(), last = bar.last; if (!last || !tr.width) return null;
      // an icon under the mouse (the Air's bar), else the part of the track over it
      if (icons && bar.icon && ev.clientY > tr.bottom + 2) {
        let best = null, bd = 14;
        for (const k of NEEDS) { const el = bar.icon[k]; if (!el.classList.contains('on')) continue; const r = el.getBoundingClientRect(), d = Math.abs(ev.clientX - (r.left + r.width / 2)); if (d < bd) { bd = d; best = k; } }
        if (bar.trend && bar.trend.classList.contains('on')) { const r = bar.trend.getBoundingClientRect(); if (ev.clientX >= r.left - 2 && ev.clientX <= r.right + 2) best = 'warmth'; }
        if (best) return best;
      }
      const f = clamp((ev.clientX - tr.left) / tr.width, 0, 1);
      if (f < last.v) return 'stamina';
      if (f < last.cap) return 'room';
      for (const c of last.ch) if (c.size > 0 && f >= last.at[c.key] && f <= last.at[c.key] + c.size + 0.002) return c.key;
      return last.cap > 0.995 ? 'stamina' : null;
    };
    hit.addEventListener('pointermove', (ev) => { const k = pick(ev); this.tipAt = { x: ev.clientX, y: ev.clientY }; bar.tipKey = k; if (k) this.tipShow(bar, k); else this.tipHide(bar); });
    hit.addEventListener('pointerleave', () => this.tipHide(bar));
  }
  tipHide(bar) { if (bar) bar.tipKey = null; if (this.etip) this.etip.classList.remove('show'); }
  tipShow(bar, key) {
    const t = this.etip, ctx = this.ctx, energy = ctx && ctx.energy; if (!t || !energy) return;
    const html = this.tipHtml(energy, key);
    if (html !== this.tipSig) { this.tipSig = html; t.innerHTML = html; }
    const at = this.tipAt || { x: 0, y: 0 }, w = t.offsetWidth || 260;
    t.style.left = `${Math.round(clamp(at.x - 30, 8, window.innerWidth - w - 8))}px`; t.style.top = `${Math.round(at.y + 22)}px`;
    t.classList.add('show');
  }
  tipHtml(energy, key) {
    const n = energy.needs || {}, pc = (x) => `${Math.round(clamp(x, 0, 1) * 100)} %`;
    const line = (name, val, say, extra = '') => `<div class="nm">${name}${val ? ` <span class="v">${val}</span>` : ''}</div>${extra}<div class="id">${say}</div>`;
    const ch = (energy.chunks ? energy.chunks() : []).find((c) => c.key === key);
    const out = Number.isFinite(n[key]) && n[key] <= 0.005;
    const grow = ch && ch.growing ? '<div class="st">growing</div>' : '';
    switch (key) {
      case 'stamina': case 'room': {
        const cap = energy.ceiling, v = Math.min(energy.value, cap);
        const say = energy.winded ? 'Winded: catch your breath. Shift does nothing until it comes back some.'
          : key === 'room' ? 'Catching your breath: the stamina comes back up to here in a few seconds.'
          : 'Jogging, paddling hard and swimming hard spend it; ease off and it comes back in a few seconds. Its reach is what your needs leave you: fed, watered, warm and rested, you go further.';
        return line('Stamina', `${pc(v)} of ${pc(cap)}`, say);
      }
      case 'warmth': {
        const tr = energy.warmthTrend ? energy.warmthTrend() : null;
        const trend = tr && tr.dir ? `<div class="st ${tr.dir > 0 ? 'up' : 'down'}">${trendIcon(tr)}${esc(tr.words)}</div>` : '';
        return line('Cold', `${pc(n.warmth)} warm`, out ? 'Frozen through: it is eating into you. A fire now, dry clothes, the bag.' : 'The wind, the night, the rain and the water chill you, wet through faster. A fire, a store, dry clothes and a night in the bag warm you.', trend + grow);
      }
      case 'rest': return line('Tiredness', `${pc(n.rest)} rested`, out ? 'Done in: only a night’s sleep brings you back.' : 'Falls the longer you are awake and the harder the day. Only sleep brings it back: the tent, or the Rest dial for a nap.', grow);
      case 'food': {
        const upset = energy.upsetNow ? '<div class="st down">an upset stomach: the untreated water</div>' : '';
        return line('Hunger', `${pc(n.food)} fed`, out ? 'Starving: it is eating into you. Eat now (I).' : 'Eat from the pack (I): a snack anywhere you are still, a meal cooked on the grate at a fire.', upset + grow);
      }
      case 'water': {
        const b = typeof energy.bottleWords === 'function' ? `<div class="st">${esc(energy.bottleWords())}</div>` : '';
        return line('Thirst', `${pc(n.water)}`, out ? 'Parched: it is eating into you. Drink now (I).' : 'Drink from the bottle in the book (I); fill it at the water’s edge (E), a tablet in.', b + grow);
      }
      default: return '';
    }
  }

  // --- the strip over the paper (fb3 C, decision 14) ---------------------------------------------------------------
  // The owner (2026-10-25): "the health bar and time should be visible pretty much all the time. even in modals bc thats
  // when im eating and want to know if i need to keep eating". A small strip at the top of the screen, over the scrim
  // and every paper (the book, the fire card, a shelf, the counter, the map) and the Rest dial (stripAlso, main.js): the
  // energy bar as the Air's, its number, the clock and the day. The Air itself stays hidden under paper. (2026-10-31:
  // hover it for the tips, with the cold's trend beside the number.)
  stripBuild() {
    const el = document.createElement('div');
    el.id = 'strip'; el.setAttribute('role', 'status'); el.setAttribute('aria-label', 'Energy, the time and the day');
    el.innerHTML = `<div class="sbar"><div class="track"><i class="fill"></i><i class="room"></i>${NEEDS.map((k) => `<i class="chunk ${k}"></i>`).join('')}</div><div class="hit"></div></div><span class="pct"></span><span class="trend"></span><span class="dot">·</span><span class="clock"></span><span class="dot">·</span><span class="sc day"></span>`;
    document.body.appendChild(el);
    const q = (sel) => el.querySelector(sel);
    this.strip = { el, track: q('.track'), fill: q('.fill'), room: q('.room'), chunk: {}, pct: q('.pct'), trend: q('.trend'), clock: q('.clock'), day: q('.day'), sig: '', shown: false, prev: null, trendSig: '' };
    for (const k of NEEDS) this.strip.chunk[k] = q(`.chunk.${k}`);
    this.stripAlso = null; // () => true while something of paper the register does not know is up (the Rest dial)
    this.tipBind(this.strip, q('.hit'), false);
  }
  updateStrip(ctx) {
    const s = this.strip; if (!s) return;
    const { energy, day, shell } = ctx;
    const show = !shell && (!!this.paper || !!(this.stripAlso && this.stripAlso()));
    if (show !== s.shown) { s.shown = show; s.el.classList.toggle('show', show); if (!show) { s.prev = null; this.tipHide(s); } }
    if (!show) return;
    if (energy) {
      const bar = this.barState(energy);
      if (bar.sig !== s.sig) { s.sig = bar.sig; this.barApply(s, bar); s.pct.textContent = `${Math.round(bar.cap * 100)} %`; } // (the number: the energy the needs leave you)
      const tr = energy.warmthTrend ? energy.warmthTrend() : { dir: 0 }, tsig = tr.dir ? `${tr.dir}${tr.why}` : '';
      if (tsig !== s.trendSig) { s.trendSig = tsig; s.trend.innerHTML = tr.dir ? `${NEED_ICON.warmth}${trendIcon(tr)}` : ''; s.trend.className = `trend${tr.dir ? ` on ${tr.dir > 0 ? 'up' : 'down'} ${tr.why}` : ''}`; s.trend.title = tr.words || ''; }
      if (s.tipKey) this.tipShow(s, s.tipKey);
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
        this.set('rdist', e.reticleDist, aim.dist > 0 ? `about ${fmtDist(aim.dist)}` : '');
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
      const html = `<span>Tension</span><span class="dot">·</span><span>${Math.round(ft.line * 3.28084)} ft of line out</span>${ft.run ? '<span class="dot">·</span><span class="run">it is running</span>' : ft.slack > 0.8 ? '<span class="dot">·</span><span class="run">slack</span>' : ''}`;
      this.set('tlabel', e.tensionLabel, html, 'innerHTML');
    }
    // the catch card: on a landing, for the hold-up or 8 s, whichever is longer
    const L = u.landed;
    const now = performance.now();
    if (L && f.catchKey !== L.key) {
      f.catchKey = L.key; f.catchUntil = now + CATCH_HOLD * 1000;
      e.catchFish.innerHTML = fishSilhouette(L.species);
      e.catchName.textContent = L.name;
      e.catchSize.textContent = `${fmtIn(L.length)} · ${fmtLbOz(L.weight)}`;
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
        // (the owner, 2026-10-31: no "hours of light left": the sunrise and sunset say it)
      }
      row('Sun', esc(parts.join(' · ')));
    }
    if (wind) row('Wind', `${esc(wind.label)} · ${fmtMphMs(wind.speed)} from the ${wind.compassLong} · ${day && day.season && day.season.ice > 0.5 ? 'the lake is frozen over' : `waves ${fmtFtIn(player.waveHeightHere || 0)}`}${wind.override != null ? ' · set by hand' : ''}`);
    if (weather && weather.look) {
      const t = weather.look.temp, label = weather.label || '', rain = weather.look.rain || 0;
      const wet = rain > 0.02 ? (weather.look.snow > 0.5 ? '' : rain > 0.5 ? ', raining hard' : ', raining') : '';
      row('Sky', esc(`${Number.isFinite(t) ? `${fmtF(t)} · ` : ''}${label.toLowerCase()}${/rain|snow|storm/i.test(label) ? '' : wet}`));
    }
    const hdg = bearingOf(player.heading);
    row('Way', `${fmtMphKmh((player.paceSpeed ?? player.groundSpeed ?? Math.abs(player.speed)) * 3.6)} · heading ${hdg.toFixed(0)}°, ${compassLong(hdg)}`);
    const dev = s && s.get('devRows'), showFps = s && s.get('fps');
    if (dev) { const land = this.landWords(player); if (land) row('Land', `${esc(land)} <span class="dev">(Developer rows)</span>`, 'soft'); } // (the owner, 2026-10-31: what biome, wetland or bog we are in)
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

  // the land under you, for the developer rows: the survey's ground kind (NWI wetlands, d1-ground: land.js KIND), the
  // forest type over it (LANDFIRE, land.js FOREST) and the ground class the game drew there (terrain-build.js GROUND);
  // '' until the fine tile is in
  landWords(player) {
    const w = this.world; if (!w || !player) return '';
    const words = (k) => String(k || '').replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
    const i = w.cellI(player.x), j = w.cellJ(player.z);
    const kind = typeof w.chCell === 'function' ? w.chCell('ground', i, j) : 0, ft = typeof w.chCell === 'function' ? w.chCell('forest', i, j) : 0;
    const cls = typeof w.coverCell === 'function' ? GROUND[(w.coverCell(i, j) >> 16) & 255] : null;
    const parts = [];
    if (kind > 0 && KIND_NAMES[kind]) parts.push(`${words(KIND_NAMES[kind])}${kind >= KIND.openBog && kind <= KIND.aquaticBed ? ' (wetland)' : ''}`);
    // the wetlands round: the whole NWI code, as "NWI PSS1/EM1Cb · alder thicket · seasonally flooded · beaver · lotic"
    const wb = typeof w.chCell === 'function' ? w.chCell('wet', i, j) : 0, wc = typeof w.chCell === 'function' ? w.chCell('wcls', i, j) : 0;
    if (wb || wc) {
      const r = REGIME[wetRegime(wb)], c1 = WCLASS[wclass1(wc)], nwi = [`NWI ${nwiCode(wb, wc)}`];
      if (c1) nwi.push(c1.name);
      if (r) nwi.push(r.name);
      if (wetBeaver(wb)) nwi.push('beaver');
      if (wetHgm(wb)) nwi.push(HGM[wetHgm(wb)]);
      parts.push(nwi.join(' · '));
    }
    if (ft > 0 && FOREST[ft]) parts.push(`${words(FOREST[ft].key)} cover`);
    if (cls) parts.push(`ground: ${words(cls)}`);
    return parts.join(' · ');
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
    this.set('mspan', e.mapSpan, `${miles(v.span / 1000)} mi across`);
    if (this.mode === 'sheet' && this.scaleInfo) {
      const { label, cssPx } = this.scaleInfo, txt = label;
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
    const W = this.dw || this.canvas.width, H = this.dh || this.canvas.height;
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
    const W = this.dw || this.canvas.width, H = this.dh || this.canvas.height;
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
      const vw = Math.min(c, W) - Math.max(a, 0), vh = Math.min(e, H) - Math.max(b, 0);
      if (w < 44 * k || vw < 60 * k || vh < 64 * k) continue;
      const lx = Math.max(a, 0) + 9 * k, ly = Math.max(b, 0) + 9 * k;
      const status = mine ? 'yours' : t ? (sold ? t.priceWords(s.id) : t.soldWords(s.id)) : sold ? 'sold here' : '';
      ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.lineJoin = 'round';
      const halo = (txt, x, y) => { ctx.lineWidth = 3.5 * k; ctx.strokeStyle = 'rgba(233, 225, 204, 0.92)'; ctx.strokeText(txt, x, y); ctx.fillText(txt, x, y); };
      const big = vw > 150 * k, room = Math.min(c, W) - lx - 9 * k;
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

  // round A-B: the legend's "paddled", once there is a lake of yours inked on the map
  inkLegend(onLake) {
    if (!this.inkLeg) {
      if (!onLake) return;
      const lake = document.createElement('span');
      lake.className = 'leg'; lake.innerHTML = `<i style="width: 15px; height: 11px; border-radius: 45% 55% 50% 50%; background: rgb(${INK_WATER.join(',')}); border: 1.5px solid rgb(${INK_RIM.join(',')})"></i>paddled`;
      const you = this.el.map && this.el.map.querySelector('.band.foot .leg .you');
      if (you) you.parentNode.before(lake); else if (this.el.mapHint) this.el.mapHint.before(lake);
      this.inkLeg = { lake }; this.inkLegOn = null;
    }
    if (this.inkLegOn === onLake) return;
    this.inkLegOn = onLake;
    this.inkLeg.lake.style.display = onLake ? '' : 'none';
  }

  // d1 names: the bays, points, islands, narrows, summits, the named portages no drawn trail carries and the ghost town
  // (names.js places, from GNIS and Geographic Names Ontario), and d1 rapids' falls and rapids (this.mapPlaces, set in its
  // main.js block: [{ kind: 'falls'|'rapids', name, x, z, a?, b? }]), in the sheet's lettering: the water's names in blue
  // italic, the land's in brown, a summit with its little peak, white water a blue tick across the river. Each kind from
  // its own zoom (STYLE max: metres a pixel); the first lettered keeps its place and a later one that would lie on it is
  // left out (narrows and falls first, the points and islands last), and none on a lake's own name.
  drawPlaceNames(ctx, { toPx, inView, onMine, k, mPerPx, lettered }) {
    const water = `rgba(${WATER.join(',')}, 0.9)`, paper = 'rgba(233, 225, 204, 0.9)';
    const STYLE = {
      narrows: { size: 12, italic: true, fill: '#2d4f66', halo: water, max: 30 },
      falls: { size: 12, italic: true, fill: '#235e86', halo: water, max: 40 },
      rapids: { size: 11, italic: true, fill: '#235e86', halo: water, max: 16 },
      bay: { size: 12.5, italic: true, fill: '#2d4f66', halo: water, max: 45 },
      portage: { size: 11.5, italic: true, fill: '#b4321f', halo: paper, max: 30 },
      summit: { size: 11, italic: true, fill: 'rgba(74, 59, 38, 0.85)', halo: paper, max: 45, peak: true },
      place: { size: 10, fill: 'rgba(74, 59, 38, 0.8)', halo: paper, max: 45, caps: true },
      island: { size: 10.5, fill: 'rgba(74, 59, 38, 0.88)', halo: paper, max: 14 },
      point: { size: 10.5, fill: 'rgba(74, 59, 38, 0.88)', halo: paper, max: 12 },
    };
    const ORDER = ['narrows', 'falls', 'bay', 'portage', 'summit', 'place', 'rapids', 'island', 'point'];
    let ww = [];
    if (typeof this.mapPlaces === 'function') { try { ww = this.mapPlaces() || []; } catch { ww = []; } }
    // white water first: the tick across the river, named or not
    ctx.lineCap = 'round';
    for (const q of ww) {
      if (!q || !Number.isFinite(q.x) || !inView(q.x, q.z, q.x, q.z) || !onMine(q.x, q.z, q.x, q.z) || mPerPx > STYLE[q.kind === 'falls' ? 'falls' : 'rapids'].max * 1.5) continue;
      ctx.strokeStyle = '#2b6d96'; ctx.lineWidth = (q.kind === 'falls' ? 2.4 : 1.6) * k;
      const [a0, b0] = q.a ? toPx(q.a[0], q.a[1]) : toPx(q.x - 12, q.z), [a1, b1] = q.b ? toPx(q.b[0], q.b[1]) : toPx(q.x + 12, q.z);
      const dx = a1 - a0, dy = b1 - b0, L = Math.hypot(dx, dy) || 1, ext = Math.max(0, 7 * k - L) / 2, ux = dx / L, uy = dy / L;
      for (const o of q.kind === 'falls' ? [-1.6 * k, 1.6 * k] : [0]) { ctx.beginPath(); ctx.moveTo(a0 - ux * ext - uy * o, b0 - uy * ext + ux * o); ctx.lineTo(a1 + ux * ext - uy * o, b1 + uy * ext + ux * o); ctx.stroke(); }
    }
    const items = [...names.places, ...ww.filter((q) => q && q.name && Number.isFinite(q.x)).map((q) => ({ kind: q.kind === 'falls' ? 'falls' : 'rapids', name: q.name, x: q.x, z: q.z }))];
    const fits = (bx) => !lettered.some((q) => bx.x0 < q.x1 && q.x0 < bx.x1 && bx.y0 < q.y1 && q.y0 < bx.y1);
    ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
    for (const kind of ORDER) {
      const S = STYLE[kind], lh = S.size * k;
      if (mPerPx > S.max) continue;
      ctx.font = `${S.italic ? 'italic ' : ''}600 ${lh}px ${SERIF}`;
      for (const q of items) {
        if (q.kind !== kind || !inView(q.x, q.z, q.x, q.z) || !onMine(q.x, q.z, q.x, q.z)) continue;
        const [a, b] = toPx(q.x, q.z), txt = S.caps ? spaced(q.name.toUpperCase()) : q.name, tw = ctx.measureText(txt).width;
        // white water and summits are lettered beside their mark; the rest centred on the place
        const side = kind === 'falls' || kind === 'rapids' || S.peak, tx = side ? a + 7 * k : a - tw / 2, ty = b;
        const bx = { x0: tx - 2 * k, x1: tx + tw + 2 * k, y0: ty - lh * 0.6, y1: ty + lh * 0.6 };
        if (!fits(bx)) continue;
        lettered.push(bx);
        if (S.peak) { ctx.beginPath(); ctx.moveTo(a - 3.5 * k, b + 3 * k); ctx.lineTo(a, b - 3.5 * k); ctx.lineTo(a + 3.5 * k, b + 3 * k); ctx.closePath(); ctx.fillStyle = S.fill; ctx.fill(); }
        ctx.textAlign = 'left'; ctx.lineWidth = 3 * k; ctx.strokeStyle = S.halo; ctx.strokeText(txt, tx, ty);
        ctx.fillStyle = S.fill; ctx.fillText(txt, tx, ty);
      }
    }
    ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'center';
  }

  // The sheet, in two parts (the owner, 2026-10-31: crisp at every zoom, and quick): the paper and everything printed
  // or pencilled on it drawn into a base canvas a margin bigger than the view (drawLayers, from map-render.js's
  // vectors), remade only when the view leaves the margin, the zoom or what is on it changes, or tiles were still coming
  // in; each frame that base is laid down where the view now is and the things that move go over it (drawOverlays).
  drawMap(player) {
    const W = this.canvas.width, H = this.canvas.height;
    if (!W || !H) return;
    const ctx = this.mapCtx, v = this.view, mPerPx = v.span / W, now = performance.now();
    const M = BASE_MARGIN, sh = this.sheetsOn, lay = this.layers, c = this.ctx || {};
    const ts = c.tasks, told = this.marks();
    const key = [W, H, v.span.toFixed(2), sh ? `${sh.view()}${sh.version}${sh.ownedSheets().length}` : 'open', Object.values(lay).join(''), explored.version, explored.lakeV,
      ts && ts.active ? ts.active.map((t) => `${t.id}${t.status}`).join() : '', told.sig, this.table ? `${this.table.selected}${this.table.hover}` : '', this.mode, BOUNDARY.ready, this.focus ? this.focus.t : ''].join('|');
    let b = this.base;
    if (!b || b.W !== W + 2 * M || b.H !== H + 2 * M) {
      const cv = document.createElement('canvas'); cv.width = W + 2 * M; cv.height = H + 2 * M;
      b = this.base = { canvas: cv, ctx: cv.getContext('2d'), W: cv.width, H: cv.height, key: null, cx: 0, cz: 0, t: 0, pending: false };
    }
    // while the wheel is turning, the last base scaled (remade once the zoom rests)
    const rest = key.replace(/^(\d+\|\d+\|)[^|]*/, '$1');
    if (b.key && b.rest === rest && b.mPerPx !== mPerPx && now - (this.zoomT || 0) < 160) {
      const s = b.mPerPx / mPerPx, vx0 = v.cx - (W / 2) * mPerPx, vz0 = v.cz - (H / 2) * mPerPx;
      ctx.fillStyle = PAPER; ctx.fillRect(0, 0, W, H);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(b.canvas, (b.x0 - vx0) / mPerPx, (b.z0 - vz0) / mPerPx, b.W * s, b.H * s);
      ctx.drawImage(this.grain, 0, 0);
      this.drawOverlays(ctx, W, H, { x0: vx0, z0: vz0, mPerPx }, W / 1040, player);
      return;
    }
    const offX = (v.cx - b.cx) / mPerPx, offY = (v.cz - b.cz) / mPerPx;
    const stale = b.key !== key || Math.abs(offX) > M * 0.9 || Math.abs(offY) > M * 0.9 || (b.pending && now - b.t > 140) || now - b.t > 2500;
    if (stale) {
      b.cx = v.cx; b.cz = v.cz; b.key = key; b.t = now; b.rest = rest; b.mPerPx = mPerPx;
      const x0 = v.cx - (b.W / 2) * mPerPx, z0 = v.cz - (b.H / 2) * mPerPx;
      b.pending = !this.drawLayers(b.ctx, b.W, b.H, { x0, z0, mPerPx }, W / 1040, player);
      b.x0 = x0; b.z0 = z0;
    }
    const dx = -M - (v.cx - b.cx) / mPerPx, dy = -M - (v.cz - b.cz) / mPerPx;
    ctx.fillStyle = PAPER; ctx.fillRect(0, 0, W, H);
    ctx.drawImage(b.canvas, dx, dy);
    ctx.drawImage(this.grain, 0, 0);
    this.drawOverlays(ctx, W, H, { x0: v.cx - (W / 2) * mPerPx, z0: v.cz - (H / 2) * mPerPx, mPerPx }, W / 1040, player);
  }

  // The marks the map carries for you, from the book's map side when it is attached (map-book.js markSource): the
  // notices on the go and where each sends you ({ open }), the ones done and where they are paid ({ claim }), and the
  // words pencilled on the map at your asking ({ notes }); sig changes when any of them does.
  marks() {
    const now = performance.now();
    if (this._marks && now - this._marksT < 400) return this._marks;
    let m = null;
    try { m = typeof this.markSource === 'function' ? this.markSource() : null; } catch (e) { console.warn('map: marks', e); }
    if (!m) {
      const c = this.ctx || {}, hs = c.tasks && typeof c.tasks.hints === 'function' ? c.tasks.hints() : [];
      const told = c.outfitter && typeof c.outfitter.toldHints === 'function' ? c.outfitter.toldHints() : [];
      m = { open: hs.map((h, i) => ({ ...h, n: i + 1, title: h.label })), claim: [], notes: told.map((h) => ({ ...h, label: h.label || HINT_LABEL[h.kind] || 'a word' })) };
    }
    m.sig = `${m.open.length}:${m.claim.length}:${m.notes.length}:${m.open.map((q) => q.x | 0).join()}`;
    this._marks = m; this._marksT = now;
    return m;
  }

  // everything printed or pencilled on the sheet, into ctx (W x H, the view v: { x0, z0, mPerPx }); k the line and type
  // scale. Returns whether every tile in view was in. Fills this.hits with what the pointer can point at.
  drawLayers(ctx, W, H, v, k, player) {
    const w = this.world, { x0, z0, mPerPx } = v, spanX = W * mPerPx, spanZ = H * mPerPx;
    const sheet = this.mode === 'sheet', lay = this.layers;
    this.dw = W; this.dh = H;
    const toPx = (x, z) => [(x - x0) / mPerPx, (z - z0) / mPerPx];
    const inView = (ax, az, bx, bz) => !(bx < x0 || ax > x0 + spanX || bz < z0 || az > z0 + spanZ);
    const hits = []; this.hits = hits;
    // What the map may show (sheets.js view): Sandbox everything; at an outfitter the whole wilderness, the sheets dotted
    // over it; in the wild only the sheets you own, everything on them cut to their neatlines, and blank paper round
    // them (with none in view, only you and the north arrow).
    const sh = this.sheetsOn, look = sh ? sh.view() : 'open';
    const clipped = look === 'owned', owned = clipped ? sh.ownedSheets().filter((s) => inView(s.x0, s.z0, s.x1, s.z1)) : [];
    const blank = clipped && !owned.length;
    const onMine = (ax, az, bx, bz) => !clipped || owned.some((s) => !(bx < s.x0 || ax > s.x1 || bz < s.z0 || az > s.z1));
    this.blank = blank;
    // the paint is cut to your sheets (in the wild), and always to the baked country
    const clip = () => {
      ctx.save();
      ctx.beginPath();
      const rect = (ax, az, bx, bz) => { ax = Math.max(ax, w.minX); az = Math.max(az, w.minZ); bx = Math.min(bx, w.maxX); bz = Math.min(bz, w.maxZ); if (bx > ax && bz > az) { const [a, b] = toPx(ax, az); ctx.rect(a, b, (bx - ax) / mPerPx, (bz - az) / mPerPx); } };
      if (clipped) for (const s of owned) rect(s.x0, s.z0, s.x1, s.z1);
      else rect(w.minX, w.minZ, w.maxX, w.maxZ);
      ctx.clip();
    };
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = PAPER;
    ctx.fillRect(0, 0, W, H);
    let ready = true;
    const depthLabels = []; // [feet, x, z] from the fine tiles in view, lettered once the view is close
    if (!blank) {
      clip();
      // the whole wilderness underneath, where the vector tiles are not in yet
      if (this.overview) {
        const [a, b] = toPx(w.minX, w.minZ);
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(this.overview, a, b, w.sizeX / mPerPx, w.sizeZ / mPerPx);
      }
      if (w.tiles) ready = paintGround(ctx, w, v, W, H, { k, budget: { build: 2 }, depths: lay.depths, ink: explored.world ? explored.lakes : null, inkV: explored.lakeV, detail: clipped ? onMine : null, labels: depthLabels });
      paintCreeks(ctx, w, v, W, H, { k, onMine: clipped ? onMine : null, hits }); // the wetlands round: the brooks, the beaver dams
      // the burns by the season's date, and the wilderness's own edge
      if (lay.burns) paintBurns(ctx, v, burnsInView(v, W, H), k);
      if (lay.boundary) { if (BOUNDARY.path) paintBoundary(ctx, v, k); else loadBoundary(); }
      ctx.restore();
    }
    const told = this.marks();
    if (!blank) {
      clip();
      // depth figures on the sounded lakes, in feet as the outfitters' maps letter them, haloed in the water colour
      if (depthLabels.length && mPerPx < 6) {
        ctx.font = `600 ${11 * k}px ${SERIF}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
        ctx.lineWidth = 3 * k; ctx.fillStyle = '#2d4f66';
        for (const [ft, x, z] of depthLabels) { if (!inView(x, z, x, z)) continue; const [a, b] = toPx(x, z); ctx.strokeStyle = explored.hasLake(w.lakeIdAt(x, z)) ? INK.inked : INK.water; ctx.strokeText(String(ft), a, b); ctx.fillText(String(ft), a, b); }
        ctx.textBaseline = 'alphabetic';
      }
      // portages: red dashed, with the rod count beside the middle of the trail when there is room; one you have crossed
      // gone over solid (round A-B)
      // (the overview, map-render.js lodOf: these gates were in canvas pixels, so a retina sheet kept its campsite dots and
      // portages out to twice the span; on the sheet they are in design pixels too, dp, the same span at any DPR, and the
      // campsites go a little sooner, where every lake was ringed in red dots. The glance and the corner keep their own.)
      const dp = sheet ? mPerPx / k : 0, close = mPerPx < 16, mid = mPerPx < 60 && dp < 72;
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.font = `italic 600 ${13 * k}px ${SERIF}`;
      if (lay.portages && mPerPx < 40 && dp < 48) for (let pi = 0; pi < w.portages.length; pi++) { // (further out the red dashes were all you saw)
        const p = w.portages[pi], [bx0, bz0, bx1, bz1] = p.bbox;
        if (!inView(bx0, bz0, bx1, bz1) || !onMine(bx0, bz0, bx1, bz1)) continue;
        ctx.beginPath();
        p.pts.forEach(([x, z], n) => { const [a, b] = toPx(x, z); if (n) ctx.lineTo(a, b); else ctx.moveTo(a, b); });
        if (explored.crossed(pi)) {
          ctx.setLineDash([]); ctx.strokeStyle = CROSSED_UNDER; ctx.lineWidth = (close ? 3.6 : 2.6) * k; ctx.stroke();
          ctx.setLineDash(close ? [9 * k, 3 * k] : [5 * k, 2 * k]); ctx.strokeStyle = CROSSED; ctx.lineWidth = (close ? 3 : 2.1) * k; ctx.stroke(); ctx.setLineDash([]);
        } else { ctx.setLineDash(close ? [7 * k, 4 * k] : [4 * k, 3 * k]); ctx.strokeStyle = '#c0392b'; ctx.lineWidth = (close ? 2.4 : 1.6) * k; ctx.stroke(); ctx.setLineDash([]); }
        const m = p.pts[Math.floor(p.pts.length / 2)], [mx, my] = toPx(m[0], m[1]);
        if (mid) hits.push({ kind: 'portage', i: pi, x: m[0], z: m[1], px: 12 });
        if (close) {
          ctx.fillStyle = '#b4321f'; ctx.textAlign = 'left';
          ctx.fillText(`${p.rods} rods`, mx + 7 * k, my - 6 * k);
          // d1 names: a portage with a name of its own (Height of Land, Prairie) says it under its rods, up close
          if (p.proper && mPerPx < 9) { ctx.font = `italic 600 ${11 * k}px ${SERIF}`; ctx.fillText(p.name, mx + 7 * k, my + 8 * k); ctx.font = `italic 600 ${13 * k}px ${SERIF}`; }
        } else if (p.proper && mid && mPerPx < 30) { // (further out, the name alone: the border route's carries)
          ctx.font = `italic 600 ${11 * k}px ${SERIF}`; ctx.fillStyle = '#b4321f'; ctx.textAlign = 'left';
          ctx.fillText(p.name, mx + 6 * k, my - 5 * k); ctx.font = `italic 600 ${13 * k}px ${SERIF}`;
        }
      }
      // campsites: red dots with a pale centre
      if (mid && lay.campsites && dp < 46) {
        const r = (close ? 4.2 : 2.6) * k;
        for (let ci = 0; ci < w.campsites.length; ci++) {
          const c = w.campsites[ci];
          if (!inView(c.x, c.z, c.x, c.z) || !onMine(c.x, c.z, c.x, c.z)) continue;
          const [a, b] = toPx(c.x, c.z);
          ctx.beginPath(); ctx.arc(a, b, r, 0, 6.28); ctx.fillStyle = '#c0392b'; ctx.fill();
          if (close) { ctx.beginPath(); ctx.arc(a, b, r * 0.38, 0, 6.28); ctx.fillStyle = '#f4e9d6'; ctx.fill(); }
          hits.push({ kind: 'site', i: ci, x: c.x, z: c.z, px: 8 });
          // d1 names: the Forest Service's number, small, to the left of the dot (the pencil tick goes right)
          if (close && c.usfs != null && mPerPx < 10) { ctx.font = `600 ${9.5 * k}px ${SERIF}`; ctx.textAlign = 'right'; ctx.fillStyle = 'rgba(160, 45, 30, 0.9)'; ctx.fillText(String(c.usfs), a - r - 2 * k, b + 3.5 * k); }
          // round A-B: a night slept there, ticked in pencil beside it
          if (explored.stayed(ci)) {
            const t = (close ? 1 : 0.75) * k;
            ctx.beginPath(); ctx.moveTo(a + r + 1.5 * t, b - 4.5 * t); ctx.lineTo(a + r + 4.5 * t, b - 0.8 * t); ctx.lineTo(a + r + 11 * t, b - 11 * t);
            ctx.strokeStyle = PENCIL_INK; ctx.lineWidth = 2 * t; ctx.stroke();
          }
        }
      }
      // lake names, letter-spaced serif capitals, for lakes wide enough on screen to carry one
      const lettered = []; // d1 names: the boxes lettered so far, so the place names keep off them
      if (lay.lakes) {
        ctx.font = `italic 600 ${(close ? 17 : 14) * k}px ${SERIF}`; ctx.fillStyle = '#2d4f66'; ctx.textAlign = 'center';
        ctx.lineJoin = 'round'; ctx.lineWidth = 3 * k;
        const minCells = Math.max(600, (5 * mPerPx) ** 2), lh = (close ? 17 : 14) * k;
        for (const l of w.lakes) {
          if (!l || !l.name || l.cells < minCells || !inView(l.cx, l.cz, l.cx, l.cz) || !onMine(l.cx, l.cz, l.cx, l.cz)) continue;
          const [a, b] = toPx(l.cx, l.cz), txt = spaced(l.name.toUpperCase());
          ctx.strokeStyle = explored.hasLake(l.id) ? INK.inked : INK.water;
          ctx.strokeText(txt, a, b + 6 * k); ctx.fillText(txt, a, b + 6 * k);
          const tw = ctx.measureText(txt).width; lettered.push({ x0: a - tw / 2, x1: a + tw / 2, y0: b + 6 * k - lh * 0.8, y1: b + 6 * k + lh * 0.25 });
        }
        if (mid) this.drawPlaceNames(ctx, { toPx, inView, onMine, k, mPerPx, lettered });
      }
      // burn names, in the burn's own brown, once the view is close enough to letter them
      if (lay.burns && mPerPx < 45) {
        ctx.font = `italic 600 ${11.5 * k}px ${SERIF}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineWidth = 3 * k; ctx.strokeStyle = 'rgba(236, 228, 207, 0.9)';
        for (const r of burnsInView(v, W, H)) {
          if (r.kind === 2 || r.acres < 200) continue;
          const bw = (r.box[2] - r.box[0]) / mPerPx, bh = (r.box[3] - r.box[1]) / mPerPx;
          if (bw < 90 * k || bh < 30 * k) continue;
          const [a, b] = toPx((r.box[0] + r.box[2]) / 2, (r.box[1] + r.box[3]) / 2), txt = burnWords(r);
          const box = { x0: a - 60 * k, x1: a + 60 * k, y0: b - 8 * k, y1: b + 8 * k };
          if (lettered.some((q) => box.x0 < q.x1 && q.x0 < box.x1 && box.y0 < q.y1 && q.y0 < box.y1)) continue;
          lettered.push(box);
          ctx.fillStyle = r.kind === 3 ? '#4e5a34' : '#7a3a1c'; ctx.strokeText(txt, a, b); ctx.fillText(txt, a, b);
        }
        ctx.textBaseline = 'alphabetic';
      }
      // entry points: the outfitters' docks, a pier with a shack at its root (smaller on the overview, where seventy of
      // them full size were most of what you saw: lodOf)
      ctx.font = `600 ${11 * k}px ${SERIF}`;
      const dockK = k * (1 - 0.35 * lodOf(mPerPx, k).gen);
      for (const ep of w.entryPoints) {
        if (!inView(ep.x, ep.z, ep.x, ep.z)) continue;
        const [a, b] = toPx(ep.x, ep.z);
        paintDock(ctx, a, b, dockK);
        hits.push({ kind: 'dock', ep: ep.ep, x: ep.x, z: ep.z, px: 10 });
        if (mid) { ctx.fillStyle = '#4a3b26'; ctx.textAlign = 'center'; ctx.fillText(`EP ${ep.ep}`, a, b + 19 * k); }
      }
      ctx.restore();
    }
    // The words pencilled on your map at your asking (map-book.js marks: a keeper's or a visitor's word, each with who
    // said it): a soft grey ring round the water they meant, what for in the pencil hand and, under it, who said so.
    // (the owner, 2026-10-31: "I'm discovering them without even knowing where they came from")
    const placed = [], LABEL_TRIES = 4;
    const place = (text, x, y, align, lh) => {
      const tw = ctx.measureText(text).width, bx0 = align === 'center' ? x - tw / 2 : x, box = (yy) => ({ x0: bx0, x1: bx0 + tw, y0: yy - lh * 0.8, y1: yy + lh * 0.2 });
      let yy = y;
      for (let n = 0; n < LABEL_TRIES && placed.some((q) => { const bb = box(yy); return bb.x0 < q.x1 && q.x0 < bb.x1 && bb.y0 < q.y1 && q.y0 < bb.y1; }); n++) yy += lh;
      placed.push(box(yy));
      return yy;
    };
    const mid = mPerPx < 60;
    if (!blank && lay.notes) for (const h of told.notes) {
      if (!inView(h.x - h.r, h.z - h.r, h.x + h.r, h.z + h.r)) continue;
      const [a, b] = toPx(h.x, h.z), r = Math.max(h.r / mPerPx, 9 * k);
      ctx.beginPath(); ctx.ellipse(a, b, r * 1.04, r * 0.97, 0.3, 0, 6.28);
      ctx.fillStyle = 'rgba(74, 64, 54, 0.07)'; ctx.fill();
      ctx.lineCap = 'round';
      ctx.strokeStyle = 'rgba(74, 64, 54, 0.62)'; ctx.lineWidth = 1.7 * k; ctx.stroke();
      ctx.beginPath(); ctx.ellipse(a + 1.5 * k, b - 1 * k, r * 1.01, r * 1.0, 0.9, 0.4, 5.9);
      ctx.strokeStyle = 'rgba(74, 64, 54, 0.3)'; ctx.lineWidth = 1.1 * k; ctx.stroke();
      hits.push({ kind: 'note', note: h, x: h.x, z: h.z, r: h.r, px: 10 });
      if (mid || r > 30 * k) {
        ctx.font = `600 ${17 * k}px ${PENCIL}`; ctx.fillStyle = 'rgba(74, 64, 54, 0.9)'; ctx.textAlign = 'center';
        const ty = clamp(r > 26 * k ? b - r + 21 * k : b - r - 6 * k, 24 * k, H - 12 * k), tx = clamp(a, 70 * k, W - 70 * k);
        const text = h.label || HINT_LABEL[h.kind] || 'a keeper’s word', y = place(text, tx, ty, 'center', 19 * k);
        ctx.fillText(text, tx, y);
        if (h.who && mPerPx < 30) { ctx.font = `600 ${13 * k}px ${PENCIL}`; ctx.fillStyle = 'rgba(74, 64, 54, 0.7)'; ctx.fillText(`— ${h.who}`, tx, y + 14 * k); placed.push({ x0: tx - 50 * k, x1: tx + 50 * k, y0: y + 4 * k, y1: y + 18 * k }); }
      }
    }
    // The notices (the owner, 2026-10-31: "we need to be able to see which tasks we need to go claim and which ones are
    // open"). Open: the keeper's red pencil round where it sends you, a wobbly ring not quite closed (no numbered disc:
    // the owner, of those, "look out of place"), and what for in the pencil hand. Done: a "$" pencilled and ringed on the
    // dock of the outfitter that pays it, with how many wait there. Drawn over blank paper too: the pencil goes where the
    // keeper pointed.
    if (lay.tasks) {
      for (const h of told.open) {
        if (!Number.isFinite(h.x) || !inView(h.x - h.r, h.z - h.r, h.x + h.r, h.z + h.r)) continue;
        const [a, b] = toPx(h.x, h.z), r = Math.max(h.r / mPerPx, 7 * k);
        pencilRing(ctx, a, b, r, k, Math.abs(Math.round(h.x * 7 + h.z * 13)));
        hits.push({ kind: 'task', task: h, x: h.x, z: h.z, r: h.r, px: 12 }); // (the ring is what the pointer takes: hitAt)
        if (h.label && (mPerPx < 60 || h.tight)) {
          ctx.font = `600 ${16 * k}px ${PENCIL}`; ctx.fillStyle = 'rgba(176, 40, 30, 0.9)';
          if (r > 44 * k) { ctx.textAlign = 'center'; ctx.fillText(h.label, clamp(a, 70 * k, W - 70 * k), clamp(b - r + 20 * k, 24 * k, H - 12 * k)); }
          else { ctx.textAlign = 'left'; ctx.fillText(h.label, clamp(a + r * 0.78, 8 * k, W - 120 * k), clamp(b - r * 0.82 - 4 * k, 24 * k, H - 12 * k)); }
        }
      }
      for (const q of told.claim) {
        if (!inView(q.x, q.z, q.x, q.z)) continue;
        const [a, b] = toPx(q.x, q.z);
        pencilSeal(ctx, a + 11 * k, b - 15 * k, q.items.length, k, Math.abs(Math.round(q.x * 3 + q.z * 11)));
        hits.push({ kind: 'claim', claim: q, x: q.x, z: q.z, px: 16, tag: [q.x + 11 * k * mPerPx, q.z - 15 * k * mPerPx] });
      }
    }
    this.hintLegend(told.notes.length > 0);
    this.inkLegend(!blank && explored.lakes.count > 0);
    if (clipped) this.drawNeatlines(ctx, sh, owned, toPx, k);
    if (look === 'whole' || this.table) this.drawSheetGrid(ctx, sh, toPx, inView, k);
    return ready;
  }

  // what moves over the base: the paper's grain is laid by drawMap; here the words on blank paper, the canoe where it
  // was left, you, the pin and its pencil line, a found place's ring, the north arrow and (on the glance) the scale
  drawOverlays(ctx, W, H, v, k, player) {
    const { x0, z0, mPerPx } = v, sheet = this.mode === 'sheet', sh = this.sheetsOn, blank = this.blank;
    const toPx = (x, z) => [(x - x0) / mPerPx, (z - z0) / mPerPx];
    const inView = (x, z) => x >= x0 && x <= x0 + W * mPerPx && z >= z0 && z <= z0 + H * mPerPx;
    // blank paper on the open sheet: a pencil word for where the rest of the map is
    if (blank && sheet && sh) {
      const none = !sh.ownedSheets().length;
      ctx.font = `600 ${24 * k}px ${PENCIL}`; ctx.fillStyle = 'rgba(74, 64, 54, 0.62)'; ctx.textAlign = 'center';
      ctx.fillText(none ? 'No sheets yet. The map tables at the outfitters sell them.' : 'None of your sheets covers this.', W / 2, H * 0.74);
    }
    // a place found in the book's search (map-book.js): a ring that draws itself round it for a few seconds
    const f = this.focus;
    if (f && sheet) {
      const age = (performance.now() - f.t) / 1000;
      if (age > 6) this.focus = null;
      else if (inView(f.x, f.z)) {
        const [a, b] = toPx(f.x, f.z), r = Math.max((f.r || 0) / mPerPx, 16 * k), grow = Math.min(1, age / 0.6);
        ctx.save(); ctx.globalAlpha = age > 4.5 ? Math.max(0, 1 - (age - 4.5) / 1.5) : 1;
        ctx.beginPath(); ctx.arc(a, b, r * 1.15, -Math.PI / 2, -Math.PI / 2 + 6.2832 * grow);
        ctx.strokeStyle = 'rgba(42, 32, 22, 0.85)'; ctx.lineWidth = 2.4 * k; ctx.lineCap = 'round'; ctx.stroke();
        ctx.restore();
      }
    }
    // the thing under the pointer, lit (map-book.js hover)
    const hv = this.hover;
    if (hv && hv.ring && sheet) {
      const [a, b] = toPx(hv.ring.x, hv.ring.z), r = Math.max((hv.ring.r || 0) / mPerPx, (hv.ring.px || 9) * k);
      ctx.beginPath(); ctx.arc(a, b, r + 3 * k, 0, 6.2832); ctx.strokeStyle = 'rgba(176, 40, 30, 0.55)'; ctx.lineWidth = 2 * k; ctx.setLineDash([3 * k, 3 * k]); ctx.stroke(); ctx.setLineDash([]);
    }
    // the canoe where it was left (beached or set down), so you can find your way back to it
    const hull = player.hullDown;
    if (hull && inView(hull.x, hull.z)) {
      const [a, b] = toPx(hull.x, hull.z);
      ctx.save(); ctx.translate(a, b); ctx.rotate(-hull.heading + Math.PI / 2); ctx.scale(k, k);
      ctx.fillStyle = '#e8562f'; ctx.strokeStyle = '#3b2a1a'; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(0, -10); ctx.quadraticCurveTo(4.5, 0, 0, 10); ctx.quadraticCurveTo(-4.5, 0, 0, -10); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.restore();
    }
    // others drawn by other modules (co-op: the friends, coop-give.js mapMarks), under you
    if (this.mapMarks) for (const fn of this.mapMarks) { try { fn(ctx, { toPx, inView, k, mPerPx, sheet }); } catch (e) { if (!fn.warned) { fn.warned = true; console.warn('hud.mapMarks', e); } } }
    // you: the canoe when it is with you, a walker's dot with a heading tick when it is not
    if (inView(player.x, player.z)) {
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
      if (inView(player.x, player.z)) {
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
    // the scale: a round distance close to 150 px, drawn on the glance, carried by the footer band on the sheet (in
    // miles, feet under a quarter mile)
    const want = (sheet ? 96 * (W / this.canvas.getBoundingClientRect().width || 1) : 150 * k) * mPerPx;
    const { m: bar, label } = scaleBar(want); // a round imperial distance (feet, then miles)
    const bpx = bar / mPerPx;
    if (sheet) this.scaleInfo = { bar, label, cssPx: bpx / (W / (this.canvas.getBoundingClientRect().width || W)) };
    else if (!blank) {
      ctx.fillStyle = '#4a3b26'; ctx.fillRect(24 * k, H - 28 * k, bpx, 3 * k); ctx.fillRect(24 * k, H - 34 * k, 2 * k, 9 * k); ctx.fillRect(24 * k + bpx - 2 * k, H - 34 * k, 2 * k, 9 * k);
      ctx.font = `600 ${12 * k}px ${SERIF}`; ctx.textAlign = 'left'; ctx.fillText(label, 24 * k + bpx + 8 * k, H - 26 * k);
    }
  }
}
