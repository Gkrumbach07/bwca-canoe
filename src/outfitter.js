// Outfitters at the entry point landings: a name for each, the store you walk into, the counter (a paper sheet in
// four tabs: the counter itself, the board, the shelves and the lure wall), the trip's old record (where you are,
// when it started) and its persistence. The outfitter is where a season starts and where you come in when you need
// to: any counter sells food, up to what the packs hold, fills the bottle, and offers the two ways on: "Resupply ·
// carry on" (the trip goes on) and "Call it a trip" (logged as came in, a bunk night, and you wake at 7:00 rested).
// The permit is the season's paper, stamped at the first counter of the season: its number, home and the day.
// Sandbox's counter does not charge for food. The board is the tasks' own (tasks.js boardSection), the shop and what
// the gear does are shop.js's, the rides up the road stream C's (rides.js, set on outfitter.rides), the keepers'
// words stream C's (outfitters.js, through the shop). The rules of the trip and its saved core live in trip.js, the
// money and the gear in profile.js; this document carries the core alongside the old fields.
//
// Walking in (hubs phase 2, stream B). Where the landing's store is built (props.js storeLayout(ep), stream A), E at
// the dock afloat is "Tie up and go in": the canoe is tied alongside the dock and you stand at the door; Q still opens
// the counter straight from the dock. Over the threshold the view goes to first person (and back as you step out).
// Inside, E at the counter, the board, a shelf or the lure wall opens the counter at that tab; the keeper greets you,
// signed with the keeper's name, on the first visit of a day. Closing the counter inside leaves you in the store;
// the trip pushes off (or carries on) when you launch from the dock, or from the counter's own stamps, which take
// you straight out to the canoe. Without a store (its tile not built yet, or no stream A) E opens the counter as
// before.
import { longDate, shortDate, esc, plural } from './hud.js';
import { seasonAt } from './season.js';
import { absDay, dateOfAbs } from './trip.js';
import { ITEMS, FOOD_PRICE } from './profile.js';
import * as props from './props.js';
import { SHELVES, LURE_ITEM, itemOf } from './shop.js';
import { LURES } from './fishing.js';

// Real outfitters by entry area where they are well known (Ely and the Fernberg Road, the Echo Trail, the
// Sawbill Trail, the Gunflint Trail); invented but plausible names elsewhere.
const NAMES = {
  30: 'Kawishiwi Lodge & Outfitters', 25: "LaTourell's Moose Lake Outfitters", 27: 'Piragis Northwoods Company',
  24: 'Spirit of the Wilderness', 26: 'Voyageur North Outfitters', 29: 'Ely Outfitting Company', 31: 'Canoe Country Outfitters',
  32: "Cliff Wold's Outfitting", 33: "Cliff Wold's Outfitting", 22: 'Piragis Northwoods Company', 20: 'Voyageur North Outfitters',
  77: 'Voyageur North Outfitters', 4: 'Spirit of the Wilderness', 6: 'Spirit of the Wilderness', 7: 'Ely Outfitting Company',
  1: 'Trout Lake Landing Outfitters', 8: 'Spirit of the Wilderness', 9: 'Voyageur North Outfitters', 14: 'Voyageur North Outfitters',
  16: 'Spirit of the Wilderness', 19: 'Ely Outfitting Company', 80: 'Voyageur North Outfitters', 12: "Anderson's Canoe Outfitters",
  34: 'Sawbill Canoe Outfitters', 35: 'Sawbill Canoe Outfitters', 36: 'Sawbill Canoe Outfitters', 37: 'Sawbill Canoe Outfitters',
  38: 'Sawbill Canoe Outfitters', 39: 'Sawbill Canoe Outfitters', 67: 'Sawbill Canoe Outfitters', 75: 'Sawbill Canoe Outfitters',
  84: 'Sawbill Canoe Outfitters', 40: 'Sawtooth Outfitters', 41: 'Sawtooth Outfitters',
  43: 'Golden Eagle Lodge', 44: 'Golden Eagle Lodge', 45: 'Golden Eagle Lodge', 47: 'Rockwood Lodge & Outfitters',
  48: 'Rockwood Lodge & Outfitters', 49: 'Rockwood Lodge & Outfitters', 50: 'Tuscarora Lodge & Canoe Outfitters',
  51: 'Tuscarora Lodge & Canoe Outfitters', 52: 'Tuscarora Lodge & Canoe Outfitters', 54: 'Seagull Outfitters',
  55: 'Voyageur Canoe Outfitters', 57: 'Gunflint Northwoods Outfitters', 58: 'Gunflint Northwoods Outfitters',
  60: 'Hungry Jack Outfitters', 61: 'Hungry Jack Outfitters', 62: 'Clearwater Historic Lodge', 64: 'Bearskin Lodge',
  66: 'Bearskin Lodge', 68: 'Arrowhead Trail Outfitters', 69: 'Arrowhead Trail Outfitters', 70: 'Arrowhead Trail Outfitters',
};
export function outfitterName(ep) { return NAMES[ep.ep] || `${ep.name} Outfitters`; }
// the road each stretch of entry points is reached by, for the counter's kicker
const AREAS = [[1, 20, 'the Echo Trail'], [22, 33, 'the Fernberg Road'], [34, 39, 'the Sawbill Trail'], [40, 70, 'the Gunflint Trail'], [75, 84, 'the Sawbill Trail']];
export function areaOf(ep) { const a = AREAS.find(([lo, hi]) => ep >= lo && ep <= hi); return a ? a[2] : ''; }

const LINES = {
  welcome: ['Morning. Food is on the shelf whenever you are.', 'Weather looks fair. Take what you need.', 'Board is up by the door if you want something to chase.', 'No hurry. The lake keeps.'],
  season: ['Here is forty dollars to start you off. Food is six a day, and the board is by the door.', 'First trip of the season? Forty dollars to start. The board is by the door when you want work.'],
  stranger: ['Not seen you here before. Food is on the shelf, and our board is by the door.', 'Come far? Sit a minute. Food is on the shelf, and the board has a few things on it.'],
  passing: ['Passing through? Take what you need.', 'Stocking up? The food is on the shelf.', 'Still out there, then. Good for you.'],
  morning: ['Morning. Coffee is on, and the lake is flat.', 'Sleep all right? There is breakfast if you want it.', 'Up with the loons. The lake will be glassy for an hour yet.'],
  after: ['Rest up. The lakes are not going anywhere.', 'Sit a while. Dry socks first, then the next one.', 'Eat something. Go back out when you like.'],
  bunk: ['Bunk is made up out back, and there is soup on the stove.', 'Sleep in a real bed tonight. The lake will be there in the morning.', 'There is a bunk out back with your name on it.'],
  hello: ['Come in, come in. Look around all you like.', 'There you are. Shout if you need anything.', 'Door is always open. Take your time.'],
  goodbye: ['Mind the wind on the big water.', 'See you when you are back in.', 'Good paddling.'],
};
const line = (k) => { const l = LINES[k] || LINES.welcome; return l[Math.floor(Math.random() * l.length)]; };
// small ink drawings for the kit, by item
const ICON = {
  canoe: '<path d="M2 5 Q 14 14 26 5 L 22 9 Q 14 13 6 9 Z" fill="currentColor"/><path d="M2 5 Q 14 2 26 5" stroke="currentColor" stroke-width="1.4" fill="none"/>',
  paddle: '<path d="M2 7 H 17" stroke="currentColor" stroke-width="1.6"/><ellipse cx="22" cy="7" rx="5" ry="2.6" fill="currentColor"/>',
  pack: '<rect x="8" y="2" width="12" height="11" rx="2" fill="currentColor"/><path d="M10 2 V 0.5 M18 2 V 0.5" stroke="currentColor" stroke-width="1.4"/><path d="M8 6 H 20" stroke="#ebe2cb" stroke-width="1"/>',
  barrel: '<rect x="9" y="1" width="10" height="12" rx="2" fill="currentColor"/><path d="M9 4 H 19 M9 10 H 19" stroke="#ebe2cb" stroke-width="1"/>',
  tent: '<path d="M4 13 L 14 2 L 24 13 Z" fill="currentColor"/><path d="M14 6 L 12 13 H 16 Z" fill="#ebe2cb"/>',
  dome: '<path d="M4 13 Q 14 -3 24 13 Z" fill="currentColor"/><path d="M14 7 L 12 13 H 16 Z" fill="#ebe2cb"/>',
  tablets: '<rect x="6" y="4" width="16" height="7" rx="3.5" fill="currentColor"/><path d="M14 4 V 11" stroke="#ebe2cb" stroke-width="1"/>',
  filter: '<rect x="10" y="1" width="8" height="10" rx="1.5" fill="currentColor"/><path d="M14 11 V 13 M8 4 H 10" stroke="currentColor" stroke-width="1.6"/>',
  jig: '<circle cx="7" cy="6" r="4" fill="currentColor"/><path d="M11 6 Q 18 2 26 9" stroke="currentColor" stroke-width="2" fill="none"/>',
  mepps: '<ellipse cx="12" cy="7" rx="9" ry="4" fill="currentColor"/><path d="M21 7h6M24 4v6" stroke="currentColor" stroke-width="1.5"/>',
  daredevle: '<polygon points="2,7 12,1 26,7 12,13" fill="currentColor"/>',
  rapala: '<rect x="3" y="3" width="22" height="8" rx="4" fill="currentColor"/><circle cx="7" cy="7" r="1.2" fill="#ebe2cb"/>',
  silverminnow: '<path d="M2 7 Q 10 1 20 7 Q 10 13 2 7 Z" fill="currentColor"/><path d="M20 7 L 26 3 L 26 11 Z" fill="currentColor"/>',
  lazyike: '<path d="M3 10 Q 10 1 17 7 T 26 5" stroke="currentColor" stroke-width="3" fill="none" stroke-linecap="round"/>',
  leeches: '<path d="M3 9 Q 8 3 13 8 T 24 7" stroke="currentColor" stroke-width="2.4" fill="none" stroke-linecap="round"/>',
  map: '<path d="M3 3 L 10 1 L 18 3 L 25 1 V 12 L 18 14 L 10 12 L 3 14 Z" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M10 1 V 12 M18 3 V 14" stroke="currentColor" stroke-width="1"/>',
  rod: '<path d="M2 12 L 26 2" stroke="currentColor" stroke-width="1.6"/><circle cx="7" cy="10" r="2.2" fill="currentColor"/>',
  saw: '<path d="M3 9 H 18 L 25 5" stroke="currentColor" stroke-width="2.2" fill="none"/><path d="M4 10 l2 2 l2 -2 l2 2 l2 -2 l2 2 l2 -2" stroke="currentColor" stroke-width="1" fill="none"/>',
  camera: '<rect x="5" y="3" width="18" height="10" rx="1.5" fill="currentColor"/><circle cx="14" cy="8" r="3" fill="#ebe2cb"/><rect x="8" y="1" width="5" height="2" fill="currentColor"/>',
  pad: '<rect x="3" y="4" width="22" height="6" rx="3" fill="currentColor"/><path d="M8 4 V 10 M13 4 V 10 M18 4 V 10" stroke="#ebe2cb" stroke-width="0.8"/>',
  yoke: '<path d="M3 4 Q 14 12 25 4" stroke="currentColor" stroke-width="2.4" fill="none"/><ellipse cx="9" cy="7.5" rx="3" ry="1.8" fill="currentColor"/><ellipse cx="19" cy="7.5" rx="3" ry="1.8" fill="currentColor"/>',
  supper: '<path d="M6 2 H 22 L 20 13 H 8 Z" fill="currentColor"/><path d="M9 6 H 19" stroke="#ebe2cb" stroke-width="1"/>',
  bunk: '<rect x="3" y="7" width="22" height="4" fill="currentColor"/><rect x="3" y="3" width="6" height="4" rx="1" fill="currentColor"/>',
  food: '<path d="M7 3 H 21 V 13 H 7 Z" fill="currentColor"/><path d="M7 6 H 21" stroke="#ebe2cb" stroke-width="1"/>',
};
const ICON_OF = { aluminium: 'canoe', kevlar: 'canoe', royalex: 'canoe', ash: 'paddle', bentshaft: 'paddle', carbon: 'paddle', pack: 'pack', pack2: 'pack', barrel: 'barrel',
  aframe: 'tent', dome: 'dome', fourseason: 'dome', tablets: 'tablets', pump: 'filter', gravity: 'filter', leeches: 'leeches', 'maps:fisher': 'map', rod: 'rod', saw: 'saw',
  camera: 'camera', pad: 'pad', yokepads: 'yoke', supper: 'supper', bunk: 'bunk', food: 'food' };
const FAMILY_ICON = { paddle: 'paddle', yoke: 'yoke', net: 'rod', blanket: 'pad', jacket: 'pack', sail: 'canoe', cover: 'canoe', pole: 'paddle', spoon: 'daredevle' };
const iconOf = (id) => {
  if (ICON_OF[id]) return ICON_OF[id];
  if (id.startsWith('lure:')) return id.slice(5);
  if (id.startsWith('sheet:')) return 'map';
  const it = itemOf(id); return (it && (FAMILY_ICON[it.family] || (it.slot === 'paddle' ? 'paddle' : null))) || 'jig';
};
export const gearIcon = (id, faint = false) => `<span style="color:${faint ? '#9a8a70' : '#2a2016'}; display:inline-flex"><svg width="28" height="14" viewBox="0 0 28 14" aria-hidden="true">${ICON[iconOf(id)] || ICON.jig}</svg></span>`;
const STANDING = ['new', 'a familiar face', 'a regular', 'a friend of the house', 'an old hand', 'one of the family'];

const NEAR = 25;                 // metres from the landing within which E opens the counter
const SAVE_KEY = 'bwca-canoe-trip';
const DEFAULT_BUY = 3;           // days of food the stepper offers first
const SANDBOX_DAYS = 4;          // Sandbox: the food pack's days (they only set its weight)
const WAKE_BUNK = 7;             // the hour you wake after a bunk night
const EVAC_FADE = 1.4;           // seconds of fade before the move (the old evacuation, without a trip core)
const SPOT_R = 1.5;              // metres from a store hotspot's floor spot within which E is its
const SPOT_FACE = Math.cos((80 * Math.PI) / 180); // and how squarely you must face it
const DOOR_R = 3;                // metres from the door, outside, within which the door says it is open
const VISIT_FAR = 90;            // metres from the landing at which a visit is over (a ride, a teleport, a walk away)
const TABS = [['counter', 'The counter'], ['board', 'The board'], ['shelves', 'The shelves'], ['wall', 'The lure wall']];
const SPOT_WORDS = { counter: 'The counter', board: 'The board', wall: 'The lure wall', food: 'The provisions shelf · food and water', tackle: 'The tackle shelf · the rod and the bait', gear: 'The gear shelf · paddles, packs and tents' };
const SLOTS = [['canoe', 'Canoe'], ['paddle', 'Paddle'], ['tent', 'Tent'], ['filter', 'Water']];

// the lakes are frozen on a date, and the first open-water day from there
const iced = (e) => seasonAt(e.doy).ice > 0.5;
function thawFrom(e) {
  let n = absDay(e.year, e.doy);
  for (let i = 0; i < 400; i++, n++) { const d = dateOfAbs(n); if (seasonAt(d.doy).ice < 0.02) return d; }
  return e;
}

export class Outfitter {
  // targets: { energy, tasks, hud, day, stats, onTeleport, trip (trip.js), veil (veil.js) }; the profile (profile.js),
  // the shop (shop.js) and the rides (stream C's rides.js) are set on it after (main.js)
  constructor(world, player, { energy, tasks, hud, day, stats = null, onTeleport, trip = null, veil = null }) {
    this.world = world; this.player = player; this.energy = energy; this.tasks = tasks; this.hud = hud; this.day = day; this.stats = stats;
    this.onTeleport = onTeleport;
    this.core = trip; this.veil = veil;
    this.profile = null;
    this._shop = null;
    this.rides = null;               // stream C: rides.section(ep) → HTML, rides.act(id)
    this.keeperVoice = true;         // the header speaks in the keeper's own words (stream C's fallback steps aside)
    if (trip) trip.outfitter = this;
    this.landings = world.entryPoints.map((ep) => ({ ep: ep.ep, name: outfitterName(ep), place: ep.name, x: ep.x, z: ep.z, lake: ep.lake }));
    this.trip = { active: false, ep: null, days: 0, started: null, startAbs: 0, turnedIn: 0 };
    this.open = false; this.at = null; this.near = null; this.buyN = DEFAULT_BUY;
    this.tab = 'counter'; this.focus = null; this.receipt = null;
    this.visit = null;               // in or about a store: { ep, landing, L, inside, switched, settled }
    this.leftFrom = null;            // a store walked away from before the season's first push-off
    this.greeted = {};               // ep → the day its keeper last said hello
    this.stubStore = false;          // tests: an invisible store beside the shack when props.js has no storeLayout
    this.stubs = new Map();
    this.draft = null;               // the season's permit before it is stamped: { entry } (the date it will carry)
    this.today = null;               // the date the counter opened on (the stamp can't be earlier)
    this.pendingShow = false;        // open the counter as soon as the canoe is at a landing and nothing else is up
    this.saveTimer = 0; this.evac = null; this.summary = null; this.greeting = ''; this.who = null; this.lineKind = 'welcome'; this.arrivedBy = null; this.staged = null; this.bunking = false;
    this.el = { panel: document.getElementById('outfitter') };
    if (this.el.panel) {
      injectCss();
      this.el.panel.addEventListener('click', (e) => { const b = e.target.closest('button[data-act]'); if (b && !b.disabled) this.act(b.dataset.act, b.dataset.id, e); });
      this.el.panel.addEventListener('change', (e) => { const s = e.target.closest('select[data-act]'); if (s) { this.act(s.dataset.act, s.value, e); s.blur(); } });
      window.addEventListener('keydown', (e) => {
        if (!this.open || (e.target && e.target.tagName === 'SELECT')) return;
        if (e.code === 'Escape' || e.code === 'KeyE') { this.close(); this.player.input.once.delete('KeyE'); } // the same E must not reopen it
      });
    }
    if (hud && hud.registerPaper) hud.registerPaper('outfitter', () => this.close());
    // the page going away (a reload, a closed tab): the trip's document now, not at the next eight-second save, so a
    // bottle just filled, a meal just eaten or a fish just kept comes back with the spot the shell saves alongside
    const flush = () => { if (this.trip.active) this.save(); };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });
  }

  get shop() { return this._shop; }
  set shop(s) { this._shop = s; if (s) s.outfitter = this; }
  nearest(x, z) {
    let best = null;
    for (const l of this.landings) { const d = Math.hypot(l.x - x, l.z - z); if (!best || d < best.d) best = { l, d }; }
    return best;
  }
  landing(ep) { return this.landings.find((l) => l.ep === ep) || null; }
  get adventure() { return !!(this.core && this.core.adventure); }
  get sandbox() { return !!(this.core && this.core.sandbox); }
  get kevlar() { return !!(this.profile ? this.profile.has('kevlar') : this.tasks && this.tasks.has && this.tasks.has('kevlar')); }
  get money() { return this.profile ? this.profile.money : 0; }
  // days of food the packs hold (the gear's word for it, shop.js: a pack 7, a second pack 10 more, a barrel 14)
  get foodRoom() { const g = this.player.gear; return g && g.foodRoom ? g.foodRoom : this.profile ? this.profile.foodRoom : 7; }
  // a day of food here (the outfitter's prices, shop.js)
  get foodPrice() { return this.shop && this.at ? this.shop.price('food', this.at.ep) || FOOD_PRICE : FOOD_PRICE; }
  // whole days of food that still fit in the packs
  get room() { return Math.max(0, Math.floor(this.foodRoom - (this.energy ? this.energy.food : 0) + 1e-6)); }
  get loadFactor() {
    const canoe = this.core ? this.core.state.packs.canoe === 'kevlar' : this.kevlar;
    return (1 + 0.06 * (this.energy ? this.energy.food : 0)) * (canoe ? 0.85 : 1);
  }
  get daysOut() { return this.trip.active ? Math.max(0, (this.day.doy * 24 + this.day.hours - this.trip.startAbs) / 24) : 0; } // never before the put-in
  lakeOf(l) { return this.world.lakeName(l.lake) || l.place; }
  // the keeper's words for a moment (stream C's voice through the shop, else the counter's own lines)
  say(ep, kind) { const k = this.shop ? this.shop.keeperLine(ep, kind) : null; return k || line(kind === 'ride' ? 'welcome' : kind); }

  // --- the store ---------------------------------------------------------------------------------------------
  // the landing's store as built (props.js storeLayout, stream A), or null until its tile has it
  layout(ep) {
    const f = props.storeLayout;
    if (typeof f === 'function') { try { return f(Number(ep)) || null; } catch { return null; } }
    return this.stubStore ? this.stubLayout(Number(ep)) : null;
  }
  // Tests without stream A: an open-air store beside the shack (invisible, nothing to bump into), laid out as A's is.
  stubLayout(ep) {
    if (this.stubs.has(ep)) return this.stubs.get(ep);
    const l = this.landing(ep), w = this.world; if (!l || !w.isReady(l.x, l.z) || !w.isReady(l.x + 30, l.z + 30) || !w.isReady(l.x - 30, l.z - 30)) return null; // built once its tiles are in, as A's is
    let x = l.x, z = l.z, d = w.deeperDir(x, z);
    for (let i = 0; i < 300 && w.shoreAt(x, z) < 1.0; i++) { x -= d.x * 0.5; z -= d.z * 0.5; if (i % 10 === 9) d = w.deeperDir(x, z); }
    for (let i = 0; i < 300 && w.shoreAt(x, z) > 1.2; i++) { x += d.x * 0.5; z += d.z * 0.5; if (i % 10 === 9) d = w.deeperDir(x, z); }
    d = w.deeperDir(x, z);
    const X = { x: d.z, z: -d.x }, Z = { x: d.x, z: d.z }, x0 = x, z0 = z;
    const W = (a, s) => ({ x: x0 + X.x * a + Z.x * s, z: z0 + X.z * a + Z.z * s });
    const g = (p) => this.player.groundAt(p.x, p.z);
    const ca = 8, cs = -11, ha = 2.8, hs = 3.8; // the floor: 5.6 by 7.6 m, its front 7 m back from the landing
    const at = (a, s, y = 1) => { const p = W(a, s); return { ...p, y: g(p) + y }; };
    const spot = (a, s, fa, fs, kind) => ({ ...W(a, s), at: at(fa, fs), ...(kind ? { kind } : {}) });
    const door = { ...W(ca - 0.8, cs + hs + 0.6), heading: Math.atan2(d.z, -d.x) };
    door.y = g(door);
    let ds = W(1.7, 1); // tied off the bank beside the dock (the stub's dock is not walked on)
    for (let i = 0; i < 30 && w.shoreAt(ds.x, ds.z) > -1.3; i++) ds = { x: ds.x + d.x * 0.5, z: ds.z + d.z * 0.5 };
    const L = {
      ep, stub: true, door, floorY: g(W(ca, cs)),
      inside: (px, pz) => { const a = (px - x0) * X.x + (pz - z0) * X.z, s = (px - x0) * Z.x + (pz - z0) * Z.z; return Math.abs(a - ca) < ha && Math.abs(s - cs) < hs; },
      counter: spot(ca, cs - hs + 1.6, ca, cs - hs + 0.9), keeper: { ...W(ca, cs - hs + 0.4), heading: Math.atan2(-d.z, d.x) },
      board: spot(ca - ha + 0.7, cs + hs - 1.2, ca - ha, cs + hs - 1.2),
      shelves: [spot(ca + ha - 0.7, cs + 1.6, ca + ha, cs + 1.6, 'food'), spot(ca + ha - 0.7, cs - 1.2, ca + ha, cs - 1.2, 'tackle'), spot(ca - ha + 0.7, cs - 0.4, ca - ha, cs - 0.4, 'gear')],
      wall: spot(ca + 1.2, cs + hs - 0.7, ca + 1.2, cs + hs),
      lamp: at(ca, cs, 2.3), dockSide: ds, dockLand: W(0, -0.4),
    };
    this.stubs.set(ep, L);
    return L;
  }
  // E at the dock afloat: the canoe tied alongside the dock (a hull set down on the water, as player.js sets one down
  // on the ground), and you on the stoop at the door, facing in
  tieUp(l, L) {
    const p = this.player, w = this.world, ds = L.dockSide || L.dockLand || L.door;
    const dd = w.deeperDir(ds.x, ds.z), hh = Math.atan2(-dd.z, dd.x);
    p.landing = null; p.ashore = null; p.swim = null; p.speed = 0; p.yawRate = 0; p.bob = null; p.balance = 0; p.extraRoll = 0;
    p.mode = 'walk';
    p.carry = { trail: null, drop: { x: ds.x, z: ds.z, heading: hh }, hitCooldown: 0, from: null, choice: false };
    p.restHull(ds.x, ds.z, hh);
    p.x = L.door.x; p.z = L.door.z; p.heading = L.door.heading;
    const y = Number.isFinite(L.door.y) ? L.door.y : p.groundAt(p.x, p.z);
    p.foot = { y, vy: 0, air: false, t: 0, land: 0, near: null };
    p.canoe.state.stroke = 0; p.canoe.state.power = 0;
    p.placeOnGround();
    const ch = p.chase;
    if (ch) { ch.viewYaw = p.heading; ch.forwardYaw = p.heading; ch.viewPitch = 0; ch.snap(); }
    this.visit = { ep: l.ep, landing: l, L, inside: false, switched: false, settled: false, bye: false };
    if (this.core) this.core.learn(l.ep); else if (this.profile) this.profile.learn(l.ep);
    this.hud.note(`Tied up at the ${l.name} dock. The door is open.`, 4);
  }
  // a visit begins at a tie-up or on walking in, and ends afloat again or far off: a launch from it pushes off (or
  // carries on) unless the counter's stamps already did
  updateVisit() {
    const p = this.player;
    let v = this.visit;
    if (!v) {
      if (!p.onFoot || p.teleporting) return;
      const n = this.nearest(p.x, p.z); if (!n || n.d > 60) return;
      const L = this.layout(n.l.ep); if (!L || !L.inside(p.x, p.z)) return;
      v = this.visit = { ep: n.l.ep, landing: n.l, L, inside: false, switched: false, settled: false, bye: false };
    }
    const far = Math.hypot(v.landing.x - p.x, v.landing.z - p.z) > VISIT_FAR;
    if (!p.onFoot || far) { this.endVisit(p.mode === 'paddle' && !p.teleporting && !far); return; }
    const L = this.layout(v.ep) || v.L; v.L = L;
    const inside = !!L.inside(p.x, p.z);
    if (inside !== v.inside) { v.inside = inside; if (inside) this.enterStore(v); else this.leaveStore(v); }
  }
  enterStore(v) {
    const ch = this.player.chase;
    if (ch && ch.mode !== 'first') { v.switched = true; ch.setMode('first'); }
    const d = this.day, today = `${d.year}-${d.doy}`;
    if (this.greeted[v.ep] !== today) {
      this.greeted[v.ep] = today;
      const who = this.shop ? this.shop.keeperName(v.ep) : null, words = this.say(v.ep, 'hello');
      this.hud.note(who ? `${who}, behind the counter: “${words}”` : `From behind the counter: “${words}”`, 7);
    }
  }
  leaveStore(v) {
    const ch = this.player.chase;
    if (v.switched && ch && ch.mode === 'first') ch.setMode('third');
    v.switched = false;
    if (!v.bye) { v.bye = true; const who = this.shop ? this.shop.keeperName(v.ep) : null; this.hud.note(`${who ? `${who}, from the door` : 'From the door'}: “${this.say(v.ep, 'goodbye')}”`, 4); }
  }
  endVisit(launched) {
    const v = this.visit; if (!v) return;
    this.visit = null;
    const ch = this.player.chase;
    if (v.switched && ch && ch.mode === 'first') ch.setMode('third');
    if (v.settled || (this.core && this.core.evacuating)) return;
    if (launched) { this.at = v.landing; if (!this.trip.active) this.start(); else this.carryOn(); }
    else if (!this.player.teleporting && !this.trip.active) this.leftFrom = v.landing;
  }
  // the counter's stamps from inside the store: out the door and into the canoe at the dock
  launchFromDock() {
    const v = this.visit, p = this.player; if (!v || !p.onFoot) return;
    v.settled = true;
    const ds = v.L && (v.L.dockSide || v.L.dockLand); if (!ds) return;
    p.launch({ x: ds.x, z: ds.z });
    if (p.mode === 'paddle' && p.chase) p.chase.snap();
  }
  // the things in the store E opens the counter at: the counter, the board, each shelf and the lure wall
  spots(L) {
    const s = [];
    if (L.counter) s.push({ key: 'counter', tab: 'counter', p: L.counter });
    if (L.board) s.push({ key: 'board', tab: 'board', p: L.board });
    for (const sh of L.shelves || []) s.push({ key: sh.kind, tab: 'shelves', focus: sh.kind, p: sh });
    if (L.wall) s.push({ key: 'wall', tab: 'wall', p: L.wall });
    return s;
  }
  // the nearest one in reach that you face, inside
  spot() {
    const v = this.visit, p = this.player; if (!v || !v.inside || !v.L) return null;
    const f = p.forward; let best = null, bd = SPOT_R;
    for (const s of this.spots(v.L)) {
      const d = Math.hypot(s.p.x - p.x, s.p.z - p.z); if (d > bd) continue;
      const at = s.p.at;
      if (at) { const ax = at.x - p.x, az = at.z - p.z, al = Math.hypot(ax, az); if (al > 0.25 && (ax * f.x + az * f.z) / al < SPOT_FACE) continue; }
      best = s; bd = d;
    }
    return best;
  }
  spotText(s, v) {
    if (s.key === 'counter') { const who = this.shop ? this.shop.keeperName(v.ep) : null; return `The counter${who ? ` · ${esc(who)}` : ''}: the permit, food, maps and the road`; }
    if (s.key === 'board') {
      let ready = 0;
      try { ready = (this.tasks && this.tasks.active ? this.tasks.active : []).filter((t) => t.from === v.ep && t.status === 'done').length; } catch { ready = 0; }
      return `The board${ready ? ` · ${ready} to claim` : ' · notices from this outfitter'}`;
    }
    return SPOT_WORDS[s.key] || 'The shelves';
  }

  // Before the player moves: who is nearby, E or Q at the dock, E at a hotspot in the store; the counter (or a fade,
  // or the journal) holds the paddle still.
  update(dt) {
    const p = this.player, veil = !!(this.veil && this.veil.active) || !!(this.core && this.core.evacuating);
    const n = p.mode === 'paddle' && !p.landing && !p.teleporting ? this.nearest(p.x, p.z) : null;
    this.near = n && n.d < NEAR ? n.l : null;
    p.suppressLanding = !!this.near;
    p.input.paused = this.open || !!this.evac || veil || this.bunking || (this.hud && this.hud.paper === 'journal');
    if (!p.packs) p.loadFactor = this.loadFactor; // the packs (packs.js) set it from the load once they are there
    const free = !this.open && !this.evac && !veil && !this.bunking && !(this.hud && this.hud.paper);
    if (this.pendingShow && !p.teleporting && free) { this.pendingShow = false; this.show(this.visit ? this.visit.landing : this.nearest(p.x, p.z).l); }
    this.updateVisit();
    if (this.leftFrom && p.mode === 'paddle' && !p.teleporting) { const l = this.leftFrom; this.leftFrom = null; if (!this.trip.active && !veil) { this.at = l; this.start(); } }
    if (free && this.open === false) {
      const rod = !!(p.fishing && p.fishing.rodUp);
      if (this.near && !rod) {
        const L = this.layout(this.near.ep);
        if (L && p.input.pressed('KeyE')) this.tieUp(this.near, L);
        else if (p.input.pressed(L ? 'KeyQ' : 'KeyE')) this.show(this.near);
      } else if (this.visit && this.visit.inside) {
        const s = this.spot();
        if (s && p.input.pressed('KeyE')) { this.staged = { tab: s.tab, focus: s.focus || null }; this.show(this.visit.landing, s.tab, s.focus || null); }
      }
    }
    if (this.evac) this.updateEvac(dt);
    if (this.trip.active) { this.saveTimer += dt; if (this.saveTimer > 8) { this.saveTimer = 0; this.save(); } }
  }
  // after the player moved: the dock's prompt, unless something more pressing is being said; the store's hotspots
  prompt() {
    const p = this.player;
    const rod = !!(p.fishing && p.fishing.rodUp); // the rod outranks the dock
    if (this.near && !this.open && !this.evac && !rod && (!p.prompt || p.prompt.key === 'E')) {
      const known = !this.profile || this.profile.knows(this.near.ep), L = this.layout(this.near.ep);
      const name = `${this.near.name} · entry point ${this.near.ep}${known ? '' : ' · new to you'}`;
      p.prompt = L ? { key: null, text: `${esc(name)} &nbsp;·&nbsp; <kbd>E</kbd>Tie up and go in &nbsp; <kbd>Q</kbd>The counter` } : { key: 'E', text: name };
    }
    const v = this.visit;
    if (v && !this.open && !this.bunking && p.onFoot) {
      if (v.inside) { const s = this.spot(); p.prompt = s ? { key: 'E', text: this.spotText(s, v) } : null; }
      else if (v.L && v.L.door && Math.hypot(v.L.door.x - p.x, v.L.door.z - p.z) < DOOR_R && !(p.prompt && /kbd/.test(p.prompt.text || ''))) p.prompt = { key: null, text: `${esc(v.landing.name)} · the door is open` };
    }
  }

  // --- the counter ------------------------------------------------------------------------------------------
  // open at a tab: 'counter' (the permit, food, money, maps and rides), 'board', 'shelves' (focus: the shelf's kind)
  // or 'wall'
  show(landing, tab = null, focus = null) {
    const pr = this.profile, core = this.core, st = this.staged; // staged: the tab a hotspot asked for, should a wrapper drop the arguments
    this.staged = null;
    if (!tab && st) { tab = st.tab; focus = st.focus; }
    const stranger = (pr && !pr.knows(landing.ep)) || (core && core.fresh === landing.ep); // a first visit
    if (core) { core.learn(landing.ep); core.fresh = null; } else if (pr) pr.learn(landing.ep);
    this.at = landing; this.open = true; this.tab = TABS.some(([k]) => k === tab) ? tab : 'counter'; this.focus = tab === 'shelves' ? focus : null; this.receipt = null;
    const rode = this.arrivedBy === 'ride'; this.arrivedBy = null; // stream C's rides: the keeper's words for one come up the road
    const kind = this.lineKind === 'welcome' ? (stranger ? 'stranger' : rode ? 'ride' : this.trip.active ? 'passing' : 'welcome') : this.lineKind;
    this.greeting = this.say(landing.ep, kind);
    this.who = this.shop ? this.shop.keeperName(landing.ep) : null;
    this.lineKind = 'welcome';
    this.today = { year: this.day.year, doy: this.day.doy };
    if (this.adventure && pr && !pr.permit && !this.trip.active) this.draft = this.draft || { entry: { ...this.today } };
    this.buyN = this.sandbox ? Math.max(1, Math.round(this.energy ? this.energy.food : 0)) || SANDBOX_DAYS : Math.min(DEFAULT_BUY, this.buyMax());
    if (this.energy && typeof this.energy.fill === 'function') this.energy.fill(2, 0); // the counter's tap: a full bottle, free
    if (this.hud && this.hud.openPaper) this.hud.openPaper('outfitter');
    this.el.panel.classList.add('show');
    this.render();
  }
  hide() {
    this.open = false;
    this.el.panel.classList.remove('show');
    if (this.hud && this.hud.closePaper) this.hud.closePaper('outfitter');
  }
  // leaving the counter: in the store, back to the store; at the dock, pushing off between trips, carrying on during one
  get inStore() { return !!(this.visit && this.player.onFoot); }
  close() {
    if (!this.open) return;
    if (this.inStore) { this.hide(); return; }
    if (!this.trip.active) { this.start(); return; }
    this.carryOn();
  }
  // the most days of food the stepper can buy: what fits, and (in Adventure) what you can pay for
  buyMax() { return this.sandbox ? this.foodRoom : Math.max(0, Math.min(this.room, Math.floor(this.money / this.foodPrice))); }
  act(act, id, ev = null) {
    const f = this.draft;
    if (act === 'close') this.close();
    else if (act === 'tab') { this.tab = id; this.focus = null; this.render(); }
    else if (act === 'less' || act === 'more') {
      const k = act === 'less' ? -1 : 1, max = this.buyMax();
      this.buyN = Math.max(this.sandbox ? 0 : Math.min(1, max), Math.min(max, this.buyN + k));
      this.render();
    } else if (act === 'buy') this.buy();
    else if (act === 'food1') { this.buyN = 1; this.buy(); }
    else if (act === 'shop' && this.shop) {
      const r = this.shop.buy(id, this.at.ep);
      this.receipt = { text: r.words, ok: r.ok };
      if (r.ok) this.hud.note(r.words, 5);
      this.save(); this.render();
    } else if (act === 'use' && this.shop) { this.shop.equip(id); this.receipt = null; this.render(); }
    else if (act === 'bunk') this.bunk();
    else if (act === 'ride' && this.rides) this.rides.act(id);
    else if (act === 'date' && f && !this.trip.active) this.shiftDate(Number(id) * (ev && ev.shiftKey ? 30 : 1));
    else if (act === 'thaw' && f && !this.trip.active) this.setEntry(thawFrom(f.entry));
    else if (act === 'canoe') { if (this.profile) this.profile.use('canoe', id); this.render(); }
    else if (act === 'start') { this.start(); this.launchFromDock(); }
    else if (act === 'carryon') { this.carryOn(); this.launchFromDock(); }
    else if (act === 'callit') this.callIt();
    else if (act === 'task' && this.tasks && typeof this.tasks.act === 'function') {
      // a claim's words (the thanks and the pay, or where a notice from another board is paid) are the keeper's
      const r = this.tasks.act(id, this.at.ep);
      if (r && r.words && /^claim/.test(String(id))) this.greeting = r.words;
      if (this.buyN < 1 && !this.sandbox) this.buyN = Math.min(DEFAULT_BUY, this.buyMax()); // money just paid: the stepper offers food again
      this.save(); this.render();
    }
  }
  // the season's date, before it is stamped: a day either way (a month with Shift), never before the day the counter
  // opened. The clock goes with it, so the season behind the counter is the one you will paddle in.
  shiftDate(n) {
    const f = this.draft, t0 = this.today ? absDay(this.today.year, this.today.doy) : absDay(this.day.year, this.day.doy);
    const cur = absDay(f.entry.year, f.entry.doy);
    this.setEntry(dateOfAbs(Math.max(t0, Math.min(t0 + 366, cur + n))));
  }
  setEntry(e) {
    const f = this.draft; if (!f) return;
    f.entry = { year: e.year, doy: e.doy };
    if (this.day.year !== e.year || this.day.doy !== e.doy) this.day.setClock(e.year, e.doy, this.day.hours);
    this.render();
  }

  // the permit's number: home and the month and day of the season's stamp (or of today, before it)
  permitNo(home, d) {
    const date = new Date(d.year, 0, d.doy);
    return `No. ${home}-${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
  }
  tally(n) {
    let html = '';
    for (let i = 1; i <= n; i++) { if (i % 5 === 0) html += '<i class="five"></i>'; else { if (i > 1 && i % 5 === 1) html += '<i class="gap"></i>'; html += '<i></i>'; } }
    return html;
  }
  choice(act, id, label, on, disabled = false) {
    return `<button type="button" class="opt${on ? ' on' : ''}" data-act="${act}" data-id="${id}" aria-pressed="${on}"${disabled ? ' disabled' : ''}>${label}</button>`;
  }
  stepper(n, min, max, label) {
    return `<div class="stepper">
          <button type="button" class="step" data-act="less" aria-label="A day less" ${n <= min ? 'disabled' : ''}>−</button>
          <div class="days"><div class="tally" aria-hidden="true">${this.tally(n)}</div><div class="n"><b>${n}</b> ${label}</div></div>
          <button type="button" class="step" data-act="more" aria-label="A day more" ${n >= max ? 'disabled' : ''}>+</button>
        </div>`;
  }

  // the season's permit, the food and the ways on: the counter tab's left column
  permitSection(a) {
    const pr = this.profile, core = this.core, adv = this.adventure, active = this.trip.active, en = this.energy;
    const home = pr && pr.home != null ? this.landing(pr.home) : null;
    const stamped = pr ? pr.permit : core && core.permit;
    const rows = [];
    rows.push(`<div class="lab">Home</div><div>${home ? `${esc(this.lakeOf(home))} · entry point ${home.ep}` : esc(this.lakeOf(a))}</div>`);
    let ice = false, thaw = null;
    if (adv && !stamped) { // the date the season's paper will carry, while it can still move
      const f = this.draft || (this.draft = { entry: { year: this.day.year, doy: this.day.doy } });
      ice = iced(f.entry); thaw = ice ? thawFrom(f.entry) : null;
      const first = this.today && absDay(f.entry.year, f.entry.doy) <= absDay(this.today.year, this.today.doy);
      rows.push(`<div class="lab">Issued</div><div class="when"><span class="date">`
        + `<button type="button" class="step small" data-act="date" data-id="-1" aria-label="A day earlier (Shift: a month)" title="Shift: a month" ${first ? 'disabled' : ''}>‹</button>`
        + `<span>${longDate(f.entry.year, f.entry.doy)}</span>`
        + `<button type="button" class="step small" data-act="date" data-id="1" aria-label="A day later (Shift: a month)" title="Shift: a month">›</button></span>`
        + `${ice ? `<button type="button" class="pencil-btn" data-act="thaw">iced in · put in ${shortDate(thaw.year, thaw.doy)}?</button>` : ''}</div>`);
    } else if (stamped && stamped.entry) rows.push(`<div class="lab">Issued</div><div>${longDate(stamped.entry.year, stamped.entry.doy)} · <span class="soft">good all season</span></div>`);
    const kit = pr ? pr.kit : { packs: 1 };
    rows.push(`<div class="lab">Packs</div><div>${kit.packs === 2 ? 'Two Duluth packs' : 'One Duluth pack'}${pr && pr.has('barrel') ? ' and a barrel' : ''} · <span class="soft">${kit.packs === 2 ? 'two carries' : 'one carry'}</span></div>`);
    // the food: what is in the pack, and the stepper of what to buy
    const food = en ? en.food : 0, room = this.room, max = this.buyMax(), n = Math.max(0, Math.min(this.buyN, max)), price = this.foodPrice;
    this.buyN = n;
    let pack;
    if (this.sandbox) {
      pack = `<div class="lab">Food pack</div>${this.stepper(n, 0, max, plural(n, 'day'))}
        <button type="button" class="stamp outline buy" data-act="buy" ${Math.abs(n - food) < 0.01 ? 'disabled' : ''}>Repack to ${n} ${plural(n, 'day')}</button>
        <p class="note">Sandbox: the food keeps, and the counter does not charge. The days only set the pack’s weight.</p>`;
    } else {
      const inPack = food <= 0 ? 'No food in the pack' : `${fmtDaysWords(food)} of food in the pack`;
      const cost = n * price;
      const why = room <= 0 ? 'The pack is full.' : max <= 0 ? `A day of food is $${price}: not enough in hand.` : `$${this.money - cost} left after.`;
      pack = `<div class="lab">Food</div><p class="left">${inPack} · <span class="soft">room for ${room} more</span></p>
        ${this.stepper(n, Math.min(1, max), max, plural(n, 'day'))}
        <button type="button" class="stamp buy" data-act="buy" ${n <= 0 ? 'disabled' : ''}>Buy ${n} ${plural(n, 'day')} · $${cost}</button>
        <p class="note">$${price} a day: two meals. ${why}</p>`;
    }
    let push;
    if (!active) {
      const iceTxt = ice ? `the lakes are iced in until ${shortDate(thaw.year, thaw.doy)}` : '';
      const hungry = !this.sandbox && food <= 0 ? 'no food in the pack yet' : '';
      const leave = this.inStore ? 'out the door and into the canoe' : 'leaving the counter pushes off too';
      push = `<button type="button" class="stamp big push" data-act="start">${ice ? `Push off on ${shortDate(thaw.year, thaw.doy)}` : 'Push off'}</button><div class="pencil">${esc(this.summary || iceTxt || hungry || leave)}</div>`;
    } else {
      const h = this.day.hours, night = h >= 17 || h < 5 ? 'calling it: a bunk tonight' : 'calling it: a bunk, up at seven';
      push = `<div class="ways"><button type="button" class="stamp big push" data-act="carryon">Resupply · carry on</button><button type="button" class="stamp outline" data-act="callit">Call it a trip</button></div><div class="pencil">${esc(this.summary || night)}</div>`;
    }
    const no = stamped && stamped.no ? stamped.no : this.permitNo(pr && pr.home != null ? pr.home : a.ep, (this.draft && this.draft.entry) || this.day);
    return `<section class="permit" aria-labelledby="permit-h">
      <div class="top"><h3 id="permit-h">Season permit</h3><span class="sc no">${this.sandbox ? 'Sandbox' : `${esc(no)}${stamped ? '' : ' · to stamp'}`}</span></div>
      <div class="grid">${rows.join('')}</div>
      <div class="pack">${pack}</div>
      ${push}
    </section>`;
  }
  // the counter tab's middle: the keeper's word, the map sheets of this country, a bunk tonight, and the rides up
  // the road (stream C's section)
  deskSection(a) {
    const shop = this.shop, pr = this.profile;
    const op = shop ? shop.outfitterProfile(a.ep) : null, keeper = op && op.keeper, rep = pr ? pr.outfitter(a.ep).rep : 0;
    let hint = '';
    if (keeper && typeof keeper.hint === 'function' && rep >= 2) { try { hint = keeper.hint(this.world, op) || ''; } catch { hint = ''; } }
    const parts = [];
    if (hint) parts.push(`<div class="word"><div class="lab">${esc(keeper.name || 'The keeper')}, leaning on the counter</div><p>“${esc(hint)}”</p></div>`);
    else if (keeper && keeper.name) parts.push(`<div class="word"><div class="lab">${esc(keeper.name)}${keeper.manner ? ` · ${esc(keeper.manner)}` : ''}</div><p class="soft">${rep >= 2 ? 'Nothing much to tell today.' : 'Friendly enough. Keeps the good spots to the regulars.'}</p></div>`);
    const sheets = shop ? shop.stock(a.ep).filter((s) => s.kind === 'map') : [];
    if (sheets.length) parts.push(`<div class="maps"><div class="lab">Map sheets of this country</div>${sheets.map((s) => this.sheetRow(s)).join('')}</div>`);
    // a night in the bunkhouse, the trip going on
    const price = this.sandbox ? 0 : shop ? shop.price('bunk', a.ep) : 8, short = !this.sandbox && price > this.money;
    parts.push(`<div class="bunkrow${short ? ' dear' : ''}"><div><b>A bunk tonight</b> · <span class="soft">a real bed, soup and breakfast${this.trip.active ? '; the trip goes on' : ''}</span></div>
      <button type="button" class="stamp small outline" data-act="bunk" ${short ? 'disabled' : ''}>${price ? `$${price}` : 'Free'}</button></div>`);
    const rides = this.rides && typeof this.rides.section === 'function' ? this.rides.section(a.ep) : '';
    return `<section class="desk" aria-labelledby="desk-h">
      <div class="top"><h3 id="desk-h">At the counter</h3></div>
      ${parts.join('')}${rides || ''}
    </section>`;
  }
  sheetRow(s) {
    const btn = s.owned ? '<span class="mark">yours</span>' : `<button type="button" class="stamp small" data-act="shop" data-id="${esc(s.id)}" ${s.afford ? '' : 'disabled'}>${s.price ? `$${s.price}` : 'Take it'}</button>`;
    return `<div class="mapsheet${s.afford || s.owned ? '' : ' dear'}">${gearIcon(s.id, !s.owned)}<span class="nm"><b>${esc(s.name)}</b>${s.here ? ' <span class="soft">· this landing</span>' : ''}</span>${btn}</div>`;
  }
  // the board: the tasks' own section (tasks.js), or a quiet card until there is one
  boardSection(a) {
    const t = this.tasks;
    if (t && typeof t.boardSection === 'function') return t.boardSection(a.ep);
    return '<section class="board" aria-labelledby="board-h"><div class="top"><h3 id="board-h">The board</h3><span class="sum">adverts from this outfitter</span></div><div class="cards"><p class="muted">The board is being written up.</p></div></section>';
  }
  // your kit and the season: the counter tab's right column. The canoe, paddle, tent and water in use, with what else
  // you own of each to swap to; what else you carry; the lures in the box; the season.
  wallSection(a) {
    const pr = this.profile;
    if (!pr) return '<section class="wall"><div class="top"><h3>Your kit</h3></div><p class="soft">An aluminium canoe and a pack.</p></section>';
    const kit = pr.kit, owned = pr.owned;
    const slotRow = ([slot, label]) => {
      const mine = owned.filter((id) => { const it = itemOf(id) || ITEMS[id]; return it && it.slot === slot; });
      const name = (id) => { const it = itemOf(id); return esc(shortName(it ? it.name : ITEMS[id] ? ITEMS[id].label : id)); };
      const body = mine.length > 1 ? `<div class="choose">${mine.map((id) => this.choice('use', id, name(id), kit[slot] === id)).join('')}</div>` : `<div>${kit[slot] ? name(kit[slot]) : '—'}</div>`;
      return `<div class="lab">${label}</div>${body}`;
    };
    const kg = this.player.gear ? this.player.gear.canoeKg : ({ kevlar: 20, royalex: 29 }[kit.canoe] || 34);
    const passive = owned.filter((id) => { const it = itemOf(id); return it && !it.slot && !id.startsWith('lure:') && id !== 'leeches' && id !== 'pack' && it.kind !== 'map'; });
    const box = this.shop ? [...this.shop.box()] : [];
    const lures = box.map((l) => { const def = LURES.find((d) => d.id === l); return def ? `${gearIcon(LURE_ITEM[l] || 'lure:jig')}<span>${esc(BOX_NAME[l] || def.short || def.name)}${l === 'leech' && this.shop ? ` <span class="soft">· ${this.shop.leeches}</span>` : ''}</span>` : ''; }).filter(Boolean);
    const known = pr.known.length, all = this.landings.length;
    const rep = Math.floor(pr.outfitter(a.ep).rep), earned = pr.earned;
    return `<section class="wall" aria-labelledby="wall-h">
      <div class="top"><h3 id="wall-h">Your kit</h3></div>
      <div class="slots">${SLOTS.map(slotRow).join('')}</div>
      <p class="soft">The canoe is ${kg} kg on the portages.</p>
      ${passive.length ? `<ul>${passive.map((id) => { const it = itemOf(id); return `<li>${gearIcon(id)}<span>${esc(it.name)}</span></li>`; }).join('')}</ul>` : ''}
      ${lures.length ? `<div class="lab">In the tackle box</div><div class="box">${lures.map((h) => `<span class="lure">${h}</span>`).join('')}</div>` : ''}
      <div class="lab">This season</div>
      <p>${earned ? `$${earned} earned on the boards` : 'Nothing earned yet'} · ${known} of ${all} ${plural(all, 'outfitter')} known. You are ${STANDING[Math.max(0, Math.min(5, rep))]} here.</p>
    </section>`;
  }
  // one thing on a shelf: what it is, the keeper's words, the price and the weight; yours marked, the dear ones quiet
  card(it) {
    const priceTxt = it.price ? `$${it.price}` : '', buyTxt = it.price ? `Buy · ${priceTxt}` : 'Take it';
    let foot;
    if (it.use === 'food') {
      const room = this.room, short = !this.sandbox && it.price > this.money;
      foot = `<span class="soft">${room > 0 ? `room for ${room} more` : 'the pack is full'}</span><button type="button" class="stamp small" data-act="food1" ${room <= 0 || short || this.sandbox ? 'disabled' : ''}>${this.sandbox ? 'Free here' : `Buy a day · ${priceTxt}`}</button>`;
    } else if (it.use === 'supper') foot = `<span class="soft">${it.count ? `${it.count} in the pack` : 'none in the pack'}</span><button type="button" class="stamp small" data-act="shop" data-id="${esc(it.id)}" ${it.afford ? '' : 'disabled'}>${buyTxt}</button>`;
    else if (it.use === 'bait') foot = `<span class="soft">${it.count ? `${it.count} in the bucket` : 'the bucket is empty'}</span>${it.count >= 12 ? '<span class="mark">a full dozen</span>' : `<button type="button" class="stamp small" data-act="shop" data-id="${esc(it.id)}" ${it.afford ? '' : 'disabled'}>${it.count ? 'Top up' : 'Buy'}${priceTxt ? ` · ${priceTxt}` : ''}</button>`}`;
    else if (it.owned) foot = `<span class="soft">${it.kg ? `${fmtKg(it.kg)}` : ''}</span>${it.slot ? (it.inUse ? '<span class="mark">yours · in use</span>' : `<button type="button" class="stamp small outline" data-act="use" data-id="${esc(it.id)}">Use this one</button>`) : `<span class="mark">${it.kind === 'lure' ? 'in the box' : 'yours'}</span>`}`;
    else foot = `<span class="soft">${it.kg ? fmtKg(it.kg) : ''}</span><button type="button" class="stamp small" data-act="shop" data-id="${esc(it.id)}" ${it.afford ? '' : 'disabled'}>${buyTxt}</button>`;
    const quiet = !it.owned && !it.afford && it.use !== 'food';
    return `<div class="item${it.owned ? ' yours' : ''}${quiet ? ' dear' : ''}${it.signature ? ' sig' : ''}">
      <div class="head">${gearIcon(it.id, quiet)}<b>${esc(it.name)}</b><span class="price">${priceTxt}</span></div>
      ${it.signature ? '<div class="made">made here · sold only at this counter</div>' : ''}
      <p class="words">${esc(it.words || '')}</p>
      <div class="foot">${foot}</div>
    </div>`;
  }
  // the shelves: provisions, tackle and gear side by side, the one you walked up to marked
  shelvesTab(a) {
    const stock = this.shop ? this.shop.stock(a.ep) : [];
    const cols = SHELVES.map((sh) => {
      const items = stock.filter((it) => it.kind === sh.kind).sort((x, y) => (y.signature ? 1 : 0) - (x.signature ? 1 : 0)); // what is made here first
      return `<section class="shelf${this.focus === sh.kind ? ' here' : ''}" aria-label="${esc(sh.name)}">
        <div class="top"><h3>${esc(sh.name)}</h3><span class="sum">${this.focus === sh.kind ? 'you are at this shelf' : esc(sh.sub)}</span></div>
        <div class="items">${items.map((it) => this.card(it)).join('')}</div>
      </section>`;
    }).join('');
    return `<div class="shelves">${cols}</div>`;
  }
  // the lure wall: a pegboard of lures, what is in your box marked
  wallTab(a) {
    const stock = this.shop ? this.shop.stock(a.ep).filter((it) => it.kind === 'lure').sort((x, y) => (y.signature ? 1 : 0) - (x.signature ? 1 : 0)) : [];
    const box = this.shop ? [...this.shop.box()].filter((l) => l !== 'leech') : [];
    return `<section class="pegboard" aria-label="The lure wall">
      <div class="top"><h3>The lure wall</h3><span class="sum">${box.length ? `${box.length} in your box · a snapped line loses the lure` : 'nothing in the box'} · 1–${LURES.length} with the rod up</span></div>
      <div class="pegs">${stock.map((it) => this.card(it)).join('')}</div>
    </section>`;
  }

  render() {
    if (!this.open || !this.el.panel) return;
    const a = this.at, active = this.trip.active;
    const lakeName = this.lakeOf(a), area = areaOf(a.ep), op = this.shop ? this.shop.outfitterProfile(a.ep) : null;
    const purse = this.profile ? `<div class="purse"><span class="sc">In hand</span><b>$${this.money}</b></div>` : '';
    const was = this.el.panel.querySelector('.permit, .items, .pegs'), scroll = was ? was.scrollTop : 0;
    const leave = this.inStore ? 'Look around · E' : `${active ? 'Carry on' : 'Push off'} · E`;
    const nav = `<nav class="tabs" aria-label="The counter's tabs">${TABS.map(([k, l]) => `<button type="button" data-act="tab" data-id="${k}" class="${this.tab === k ? 'on' : ''}">${l}</button>`).join('')}`
      + `${this.receipt ? `<span class="receipt pencil${this.receipt.ok ? '' : ' no'}">${esc(this.receipt.text)}</span>` : ''}</nav>`;
    let body;
    if (this.tab === 'board') body = `<div class="counter one">${this.boardSection(a)}</div>`;
    else if (this.tab === 'shelves') body = this.shelvesTab(a);
    else if (this.tab === 'wall') body = this.wallTab(a);
    else body = `<div class="counter">${this.permitSection(a)}${this.deskSection(a)}${this.wallSection(a)}</div>`;
    this.el.panel.innerHTML = `<header>
      <div class="lede"><div class="sc kicker">Entry point ${a.ep} · ${esc(lakeName)}${area ? ` · ${area}` : ''}${op && (op.kindWords || op.kind) ? ` · ${esc(op.kindWords || op.kind)}` : ''}</div><h2>${esc(a.name)}</h2><div class="say">“${esc(this.greeting)}”${this.who ? ` <span class="who">— ${esc(this.who)}</span>` : ''}</div></div>
      ${purse}<button type="button" class="stamp outline" data-act="close" aria-label="Leave the counter (E or Esc)">${leave}</button>
    </header>${nav}${body}`;
    const now = this.el.panel.querySelector('.permit, .items, .pegs');
    if (scroll && now && now.className === (was && was.className)) now.scrollTop = scroll;
  }

  // --- money and food ----------------------------------------------------------------------------------------
  buy() {
    const en = this.energy, n = this.buyN, a = this.at; if (!en) return;
    if (this.sandbox) { // repack, free: the days set the pack's weight
      en.food = n; this.trip.days = Math.max(this.trip.days || 0, n);
      if (this.core) this.core.state.packs.foodDays = n;
      this.hud.note(`Repacked: ${fmtDaysWords(n)} of food.`); this.save(); this.render();
      return;
    }
    if (n <= 0) return;
    const price = this.foodPrice, cost = n * price;
    if (n > this.room) { this.hud.note('That will not fit in the pack.'); return; }
    if (!this.profile || !this.profile.spend(cost, `${n} ${plural(n, 'day')} of food at ${a.name}`)) { this.hud.note(`Not enough in hand: ${n} ${plural(n, 'day')} is $${cost}.`); this.render(); return; }
    en.food = +(en.food + n).toFixed(2);
    if (this.core) this.core.state.packs.foodDays = en.food;
    const words = `${n} ${plural(n, 'day')} of food, $${cost}. ${fmtDaysWords(en.food)} in the pack, $${this.money} in hand.`;
    this.hud.note(words, 6);
    if (this.tab !== 'counter') this.receipt = { text: words, ok: true };
    this.buyN = Math.min(this.buyN, this.buyMax());
    this.save(); this.render();
  }

  // --- the trip ----------------------------------------------------------------------------------------------
  // push off: the season's paper is stamped at the first counter, and the trip is under way
  start() {
    const a = this.at || this.nearest(this.player.x, this.player.z).l;
    const d = this.day, core = this.core, adv = this.adventure, pr = this.profile;
    if (pr && !pr.permit) {
      let e = this.draft ? this.draft.entry : { year: d.year, doy: d.doy };
      if (adv && iced(e)) e = thawFrom(e); // the lakes are iced on it: the thaw
      if (e.year !== d.year || e.doy !== d.doy) d.setClock(e.year, e.doy, d.hours);
      const home = pr.home != null ? pr.home : a.ep;
      pr.stamp({ no: this.permitNo(home, e), ep: home, entry: { year: d.year, doy: d.doy, hours: +d.hours.toFixed(2) } });
    }
    const food = this.energy ? this.energy.food : 0;
    this.trip = { active: true, ep: a.ep, days: this.foodRoom, started: d.clock, startAbs: d.doy * 24 + d.hours, startYear: d.year, startDoy: d.doy, startHours: d.hours, turnedIn: 0, fromName: this.lakeOf(a) };
    if (this.energy) this.energy.value = 1;
    if (this.stats) this.stats.reset();
    if (core) core.start({ ep: a.ep, foodDays: food, canoe: pr ? pr.kit.canoe : 'aluminium' });
    this.summary = null; this.draft = null; this.leftFrom = null;
    this.hide();
    // the permit, as a title over the water
    const lake = this.lakeOf(a), purse = pr ? ` · $${pr.money} in hand` : '';
    if (core && adv) this.hud.showPlace(`${core.permit && core.permit.no ? `Permit ${core.permit.no}` : 'Season permit'} · ${a.name}`, lake, `${core.packWords(food)}${purse} · come in when you like`, 6);
    else if (core) this.hud.showPlace(`Sandbox · ${a.name}`, lake, `${core.packWords(food)} · no dates`, 6);
    else this.hud.note(`${fmtDaysWords(food)} of food in the pack. Push off when you like.`);
    this.save();
  }
  // "Resupply · carry on" (or leaving the counter during a trip): the trip goes on
  carryOn() {
    const a = this.at, en = this.energy;
    if (this.core) this.core.resupply(a.ep, { food: en ? +en.food.toFixed(2) : 0 });
    this.summary = null;
    this.hide();
    this.hud.note(`Carry on from ${a.name}: ${en && en.food > 0 ? `${fmtDaysWords(en.food)} of food` : 'no food in the pack'}${this.profile ? `, $${this.money} in hand` : ''}.`, 5);
    this.save();
  }
  // "Call it a trip": logged as came in, then a bunk night, and you wake at 7:00 rested to the counter
  callIt() {
    const a = this.at, core = this.core, st = this.stats;
    if (!this.trip.active) return;
    const days = Math.max(1, core ? core.dayN : Math.floor(this.daysOut) + 1), km = st ? st.km : 0, from = this.trip.fromName || 'the landing';
    if (core) core.callIt(a.ep);
    this.trip = { active: false, ep: null, days: this.foodRoom, started: null, startAbs: 0, turnedIn: 0 };
    this.summary = null; this.draft = null;
    this.night(a, `The trip is logged as came in: ${days} ${plural(days, 'day')} out from ${from}${km > 0.05 ? `, ${km < 10 ? km.toFixed(1) : Math.round(km)} km paddled` : ''}. You wake at seven, rested.`);
  }
  // a night in the bunkhouse for its price (free in Sandbox): the trip, if there is one, goes on
  bunk() {
    const a = this.at, shop = this.shop; if (!a) return;
    const price = this.sandbox ? 0 : shop ? shop.price('bunk', a.ep) : 8;
    if (price && (!this.profile || !this.profile.spend(price, `a night in the bunkhouse at ${a.name}`))) { this.receipt = { text: `Not enough in hand: the bunk is $${price}.`, ok: false }; this.render(); return; }
    if (this.trip.active && this.core) this.core.resupply(a.ep, { food: this.energy ? +this.energy.food.toFixed(2) : 0, bunk: true });
    this.night(a, `A night in a real bed${price ? ` for $${price}` : ''}. You wake at seven, rested and fed${this.trip.active ? '; the trip goes on' : ''}.`);
  }
  // the bunk night: a card, the clock to 7:00, rested, fed and watered, then the counter at the morning
  night(a, sub) {
    const d = this.day, en = this.energy;
    this.hide();
    this.bunking = true;
    this.save();
    const night = () => {
      const h = d.hours, hours = (WAKE_BUNK - h + 24) % 24 || 24;
      d.advance(hours);
      if (en) {
        en.sleep(1, Math.max(7, hours)); en.value = 1;
        // the lodge feeds you: the jump crosses no dawn or dusk on the meal clock, and breakfast is had
        if ('lastHours' in en) en.lastHours = d.hours;
        if ('lastMealAbs' in en) { en.lastMealAbs = en.now; en.lastMealKind = 'hot'; }
        try { if (en.needs && typeof en.needs === 'object') { en.needs.food = 1; en.needs.water = 1; } } catch { /* the needs are energy.js's own */ }
        if (typeof en.fill === 'function') en.fill(2, 0);
      }
      this.save();
    };
    const done = () => { this.bunking = false; this.lineKind = 'morning'; this.pendingShow = true; };
    const card = { kicker: `${a.name} · the bunkhouse`, text: `“${this.say(a.ep, 'bunk')}”`, sub, fadeIn: 1.4, hold: 4, fadeOut: 2.2, onDark: night };
    if (this.veil) this.veil.card(card).then(done);
    else { night(); done(); }
  }
  // A new season (the title): whatever trip was under way ends (logged as abandoned), the profile starts over with
  // $40 and the starting kit, home is the entry point picked, and the counter opens at the landing the canoe comes to.
  newSeason(home, mode = 'adventure') {
    const core = this.core;
    if (core) core.abandon();
    if (this.profile) this.profile.begin({ home, mode });
    if (core) core.reset(mode); // after the profile: the packs and the canoe are the new season's
    if (this.open) this.hide();
    this.trip = { active: false, ep: null, days: this.foodRoom, started: null, startAbs: 0, turnedIn: 0 };
    this.summary = null; this.draft = null; this.evac = null; this.bunking = false; this.leftFrom = null; this.greeted = {};
    if (this.visit) this.endVisit(false);
    if (this.energy) { this.energy.reset(); this.energy.food = 0; }
    if (this.tasks && this.tasks.reset) this.tasks.reset();
    if (this.stats) this.stats.reset();
    this.lineKind = 'season';
    this.pendingShow = true;
    this.save();
  }
  // the old title's call: a new season at the landing nearest the canoe
  abandon(mode = null) {
    const home = this.nearest(this.player.x, this.player.z).l.ep;
    this.newSeason(home, mode || (this.core ? this.core.mode : 'adventure'));
  }

  // --- the evacuation (trip.js runs it; these are the counter's side) -------------------------------------------
  // at full dark: the trip is over (the tasks are kept)
  evacuated() {
    this.trip = { active: false, ep: null, days: this.foodRoom, started: null, startAbs: 0, turnedIn: 0 };
    this.summary = null; this.draft = null; this.leftFrom = null;
    if (this.open) this.hide();
    this.save();
  }
  // faded back: the counter at the landing you woke at
  afterEvac(to) { if (to) { this.lineKind = 'after'; this.pendingShow = true; } }
  startEvac() {
    if (this.core) return this.core.evacuate('food');
    // no trip core: the old way, the nearest landing
    if (this.evac) return;
    const to = this.nearest(this.player.x, this.player.z).l;
    this.evac = { t: 0, to, moved: false };
    if (this.veil) this.veil.card({ kicker: `${to.name} · entry point ${to.ep}`, text: `“${line('after')}”`, sub: `Back at the ${this.lakeOf(to)} landing.`, hold: 3 });
  }
  updateEvac(dt) {
    const e = this.evac;
    e.t += dt;
    if (e.t < EVAC_FADE || e.moved) return;
    e.moved = true;
    const finish = () => { this.energy.value = 1; this.energy.warned = false; this.evac = null; this.save(); this.pendingShow = true; };
    Promise.resolve(this.onTeleport ? this.onTeleport(e.to.x, e.to.z) : true).then(finish, finish);
  }

  // --- persistence -------------------------------------------------------------------------------------------
  save() {
    const p = this.player;
    const data = { v: 3, trip: this.trip, pos: { x: p.x, z: p.z, heading: p.heading }, energy: this.energy.serialize(), tasks: this.tasks ? this.tasks.serialize() : null };
    if (this.core) data.core = this.core.serialize();
    const f = p.fishing;
    if (f && Array.isArray(f.stringer)) data.stringer = f.stringer.map((s) => ({ species: s.species, length: s.length })); // the fish kept for supper
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(data)); } catch { /* storage full or private mode */ }
  }
  load() {
    try { const s = localStorage.getItem(SAVE_KEY); return s ? JSON.parse(s) : null; } catch { return null; }
  }
  // On load: resume a trip where it was left, or open the counter at the landing. A document without a trip core
  // is from before it and comes back as Sandbox, and a trip core's v2 permit loses its dates (trip.js). The food
  // in the pack is yours between trips too.
  async boot() {
    const d = this.load(), pr = this.profile;
    if (d && d.tasks && this.tasks) this.tasks.restore(d.tasks);
    if (d && this.core) this.core.restoreFrom(d);
    if (d && d.energy) this.energy.restore(d.energy);
    const moved = pr && pr.migrated;
    if (moved) pr.forgetMigration();
    if (d && d.trip && d.trip.active) {
      this.trip = { ...this.trip, ...d.trip, days: this.foodRoom };
      const f = this.player.fishing;
      if (f && Array.isArray(d.stringer) && !f.stringer.length) for (const s of d.stringer) if (s && s.species) f.stringer.push({ species: s.species, length: +s.length || 0 });
      this.pendingShow = false;
      if (d.pos && Math.hypot(d.pos.x - this.player.x, d.pos.z - this.player.z) > 40 && this.onTeleport) await this.onTeleport(d.pos.x, d.pos.z);
      const core = this.core, dw = core && core.active ? core.dayWords() : '';
      if (moved === 'v2') this.hud.note('The permit is a season’s paper now: no dates and no exit. Come in when you like; any counter sells food.', 8);
      else if (moved === 'v1') this.hud.note('An older trip, back as Sandbox: the same lakes with no limits.', 7);
      else this.hud.note(`${this.player.mode === 'paddle' ? 'Back on the water' : 'Back ashore'}${dw ? `, ${dw}` : ''}: ${fmtDaysWords(this.energy.food)} of food, energy ${Math.round(this.energy.value * 100)} %${pr ? `, $${pr.money} in hand` : ''}.`);
      return;
    }
    this.pendingShow = false;
    const n = this.nearest(this.player.x, this.player.z);
    this.show(n.l);
  }
}

function fmtDaysWords(d) {
  if (d <= 0) return 'no days';
  if (d < 0.5) return 'less than a day';
  const whole = Math.floor(d + 1e-6), half = d - whole >= 0.5 - 1e-6 && d - whole < 0.99;
  const n = half ? `${whole || ''}½` : String(Math.round(d));
  return `${n} day${n === '1' || n === '½' ? '' : 's'}`;
}
const fmtKg = (kg) => (kg < 1 ? `${Math.round(kg * 1000)} g` : `${kg % 1 ? kg.toFixed(1) : kg} kg`);
// "Kevlar tripper, 17 ft" → "Kevlar tripper" for the kit's choices
const shortName = (s) => { const t = String(s).replace(/,\s*\d+\s*ft$/, '').replace(/ (paddle|tent|filter)$/i, '').replace(/^(Purifying|Water) /, ''); return t.charAt(0).toUpperCase() + t.slice(1); };
// the tackle box's names for the rod's lures
const BOX_NAME = { jig: 'Jig', spinner: 'Mepps', spoon: 'Daredevle', crankbait: 'Rapala', leech: 'Leeches', silverminnow: 'Silver Minnow', lazyike: 'Lazy Ike' };

// the tabs, the desk, the shelves and the lure wall (the counter's own look is hud.css's; tasks.js adds the board's)
const CSS = `
#outfitter { gap: 16px; }
#outfitter .tabs { display: flex; align-items: baseline; gap: 26px; font: 700 12px/1.4 var(--sc); letter-spacing: .16em; flex: none; border-bottom: 1px solid var(--edge); margin-top: -4px; }
#outfitter .tabs button { appearance: none; background: none; border: none; padding: 0 0 7px; margin-bottom: -1px; color: var(--ink-soft); font: inherit; letter-spacing: inherit; cursor: pointer; border-bottom: 2px solid transparent; }
#outfitter .tabs button.on { color: var(--ink); border-bottom-color: var(--ink); }
#outfitter .tabs button:hover:not(.on) { color: var(--ink); }
#outfitter .tabs .receipt { margin-left: auto; font-size: 19px; letter-spacing: 0; text-transform: none; max-width: 52%; text-align: right; line-height: 1.1; padding-bottom: 6px; }
#outfitter .tabs .receipt.no { color: var(--map-red); }
#outfitter .counter.one { grid-template-columns: minmax(0, 1fr); }
#outfitter .say .who { font-style: normal; font: 500 19px/1 var(--pencil-font); color: var(--pencil); margin-left: 4px; }
#outfitter .desk { display: flex; flex-direction: column; gap: 14px; min-height: 0; overflow: auto; scrollbar-width: thin; padding-right: 4px; }
#outfitter .desk .top { border-bottom: 1px solid var(--edge); padding-bottom: 8px; flex: none; }
#outfitter .desk .word p { font-size: 16px; line-height: 1.45; font-style: italic; }
#outfitter .desk .word p.soft, #outfitter .desk .soft { color: var(--ink-soft); font-style: italic; }
#outfitter .desk .maps { display: flex; flex-direction: column; gap: 6px; }
#outfitter .desk .mapsheet { display: flex; align-items: center; gap: 10px; font-size: 15px; }
#outfitter .desk .mapsheet .nm { flex: 1 1 auto; min-width: 0; }
#outfitter .desk .mapsheet .stamp, #outfitter .desk .mapsheet .mark { flex: none; }
#outfitter .desk .bunkrow { display: flex; align-items: center; gap: 12px; font-size: 15px; border-top: 1px solid var(--edge); padding-top: 12px; }
#outfitter .desk .top + .bunkrow { border-top: none; padding-top: 0; }
#outfitter .desk .bunkrow > div { flex: 1 1 auto; }
#outfitter .dear { opacity: .55; }
#outfitter .mark { font: 700 10.5px/1.3 var(--sc); letter-spacing: .12em; color: #3f5a2a; text-transform: lowercase; }
#outfitter .wall .slots { display: grid; grid-template-columns: 52px minmax(0, 1fr); gap: 7px 10px; align-items: baseline; font-size: 15px; }
#outfitter .wall .slots .choose { display: flex; flex-wrap: wrap; gap: 4px 12px; }
#outfitter .wall .box { display: flex; flex-wrap: wrap; gap: 6px 14px; font-size: 14px; }
#outfitter .wall .box .lure { display: inline-flex; align-items: center; gap: 4px; }
#outfitter .shelves { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: clamp(14px, 2%, 26px); flex: 1 1 auto; min-height: 0; }
#outfitter .shelf, #outfitter .pegboard { display: flex; flex-direction: column; gap: 10px; min-height: 0; }
#outfitter .shelf .top, #outfitter .pegboard .top { display: flex; align-items: baseline; gap: 12px; border-bottom: 1px solid var(--edge); padding-bottom: 8px; flex: none; }
#outfitter .shelf .top .sum, #outfitter .pegboard .top .sum { font-size: 14px; font-style: italic; color: var(--ink-soft); }
#outfitter .shelf.here .top { border-bottom: 2px solid var(--ink); padding-bottom: 7px; }
#outfitter .shelf.here .top .sum { color: var(--ink); }
#outfitter .items { display: flex; flex-direction: column; gap: 10px; min-height: 0; overflow: auto; scrollbar-width: thin; padding-right: 4px; }
#outfitter .pegboard { flex: 1 1 auto; }
#outfitter .pegs { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 250px), 1fr)); grid-auto-rows: max-content; gap: 14px; align-content: start; min-height: 0; flex: 1 1 auto; overflow: auto; scrollbar-width: thin;
  padding: 14px; border-radius: 3px; border: 1px solid var(--edge-deep); background-color: #b99a6a;
  background-image: radial-gradient(rgba(58, 38, 18, .5) 1.6px, transparent 2.2px); background-size: 18px 18px; background-position: 9px 9px; box-shadow: inset 0 1px 5px rgba(40, 24, 8, .25); }
#outfitter .item { box-sizing: border-box; padding: 10px 14px 10px; background: var(--paper-card); border: 1px solid var(--edge); border-radius: 3px; display: flex; flex-direction: column; gap: 5px; flex: none; }
#outfitter .pegs .item { box-shadow: 0 3px 6px rgba(40, 24, 8, .25); }
#outfitter .item.yours { border-left: 4px solid var(--moss); }
#outfitter .item.sig { background: var(--paper-note); }
#outfitter .item .head { display: flex; align-items: center; gap: 10px; }
#outfitter .item .head b { font: 600 16px/1.2 var(--serif); flex: 1 1 auto; }
#outfitter .item .price { font: 500 23px/0.9 var(--pencil-font); color: var(--pencil); flex: none; }
#outfitter .item .made { font: 700 10px/1.3 var(--sc); letter-spacing: .12em; color: var(--map-red); }
#outfitter .item .words { font-size: 14px; line-height: 1.38; }
#outfitter .item .foot { display: flex; justify-content: space-between; align-items: center; gap: 10px; font-size: 13px; margin-top: 2px; }
#outfitter .item .foot .soft { color: var(--ink-soft); font-style: italic; }
#outfitter .item .foot .stamp { flex: none; font-size: 10.5px; padding: 5px 10px; }
#outfitter .item.dear .stamp:disabled { opacity: .8; }
`;
let cssIn = false;
function injectCss() {
  if (cssIn || typeof document === 'undefined') return;
  cssIn = true;
  const s = document.createElement('style'); s.id = 'outfitter-shop'; s.textContent = CSS;
  document.head.appendChild(s);
}
