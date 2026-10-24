// Outfitters at the entry point landings: a name for each, the store you walk into, its shelves, the counter (a paper
// sheet in two tabs: the counter's services and the board), the trip's old record (where you are, when it started)
// and its persistence. The outfitter is where a season starts and where you come in when you need to: its shelves
// sell the food and the gear, its counter fills the bottle and offers the services and the two ways on: "Resupply ·
// carry on" (the trip goes on) and "Call it a trip" (logged as came in, a bunk night, and you wake at 7:00 rested).
// The permit is the season's paper, stamped at the first counter of the season: its number, home and the day.
// Sandbox's counter does not charge for food. The board is the tasks' own (tasks.js boardSection), the shop and what
// the gear does are shop.js's, the rides up the road stream C's (rides.js, set on outfitter.rides), the keepers'
// words stream C's (outfitters.js, through the shop). The rules of the trip and its saved core live in trip.js, the
// money and the gear in profile.js; this document carries the core alongside the old fields.
//
// Walking in (hubs phase 2, stream B). Where the landing's store is built (props.js storeLayout(ep), stream A), E at
// the dock afloat is "Tie up and go in": the canoe is tied alongside the dock and you stand at the door; Q still opens
// the counter straight from the dock. Over the threshold the view goes to first person (and back as you step out),
// unless the camera keeps itself inside the walls (camera.js roomAware, stream D of 2026-10-24).
// The store is physical (feedback 2026-10-24, stream B): E at the provisions, tackle or gear shelf, the lure wall or the
// map table opens that shelf's two panes (inv-ui.js ShelfScreen: your containers on the left, the shelf on the right,
// a buy dropped into a slot or the first container with room); E at the counter opens the counter, which is for
// services only (the permit, a bunk, the rides, claiming notices), and E at the board the board. The keeper greets
// you, signed with the keeper's name, on the first visit of a day. Closing the counter inside leaves you in the store;
// the trip pushes off (or carries on) when you launch from the dock, or from the counter's own stamps, which take
// you straight out to the canoe. Without a store (its tile not built yet, or no stream A) E opens the counter as
// before. A new season begins tied up at the home store's door (the keeper's forty dollars as you step in), and the
// trip pushes off when you launch from its dock; a page reloaded in a store comes back on its floor (updateArrival).
import { longDate, shortDate, esc, plural } from './hud.js';
import { seasonAt } from './season.js';
import { absDay, dateOfAbs } from './trip.js';
import { ITEMS, FOOD_PRICE } from './profile.js';
import * as props from './props.js';
import { SHELVES, itemOf } from './shop.js';
import { ShelfScreen, model as invModel } from './inv-ui.js';

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

const NEAR = 25;                 // metres from the landing (its dock, once built: distTo) within which E opens the counter
const SAVE_KEY = 'bwca-canoe-trip';
const WAKE_BUNK = 7;             // the hour you wake after a bunk night
const EVAC_FADE = 1.4;           // seconds of fade before the move (the old evacuation, without a trip core)
const SPOT_R = 1.5;              // metres from a store hotspot's floor spot within which E is its
const SPOT_FACE = Math.cos((80 * Math.PI) / 180); // and how squarely you must face it
const DOOR_R = 3;                // metres from the door, outside, within which the door says it is open
const VISIT_FAR = 90;            // metres from the store and its dock (distTo) at which a visit is over (a ride, a teleport, a walk away)
const ARRIVAL_WAIT = 20;         // game seconds an arrival waits for the landing's store to be built before it gives up
const ARRIVAL_FAR = 250;         // metres from the landing (distTo) within which an arrival still goes in (a teleport finds water up to 120 m out)
const TABS = [['counter', 'The counter'], ['board', 'The board']];
const SPOT_WORDS = { counter: 'The counter', board: 'The board', wall: 'The lure wall · lures for the tackle box', maps: 'The map table · Fisher sheets of this country', food: 'The provisions shelf · meals, snacks and the barrels', tackle: 'The tackle shelf · the rod, the leeches and the bucket', gear: 'The gear shelf · packs, paddles, tents and canoes' };
const SHELF_LOOK = { food: 'shelf', tackle: 'shelf', gear: 'shelf', lure: 'pegs', map: 'table' };
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
    this.people = null;              // hubs 3C: npcs.js, the people in the store; a visitor you face takes E from the hotspot (people.claimsE)
    if (trip) trip.outfitter = this;
    this.landings = world.entryPoints.map((ep) => ({ ep: ep.ep, name: outfitterName(ep), place: ep.name, x: ep.x, z: ep.z, lake: ep.lake }));
    this.trip = { active: false, ep: null, days: 0, started: null, startAbs: 0, turnedIn: 0 };
    this.open = false; this.at = null; this.near = null;
    this.tab = 'counter'; this.focus = null; this.receipt = null;
    this.visit = null;               // in or about a store: { ep, landing, L, inside, switched, settled }
    this.arrival = null;             // a season begun, or a page reloaded in a store: in at the store once it is built
    this.leftFrom = null;            // a store walked away from before the season's first push-off
    this.greeted = {};               // ep → the day its keeper last said hello
    this.stubStore = false;          // tests: an invisible store beside the shack when props.js has no storeLayout
    this.stubs = new Map();
    this.draft = null;               // the season's permit before it is stamped: { entry } (the date it will carry)
    this.today = null;               // the date the counter opened on (the stamp can't be earlier)
    this.pendingShow = false;        // open the counter as soon as the canoe is at a landing and nothing else is up
    this.saveTimer = 0; this.evac = null; this.summary = null; this.greeting = ''; this.who = null; this.lineKind = 'welcome'; this.arrivedBy = null; this.staged = null; this.bunking = false;
    this.el = { panel: document.getElementById('outfitter') };
    const shelfEl = document.getElementById('shelf');
    this.shelf = shelfEl ? new ShelfScreen(shelfEl, hud) : null; // a shelf's two panes (inv-ui.js)
    this.shelfAt = null;             // the shelf open: { kind, ep }
    if (this.el.panel) {
      injectCss();
      this.el.panel.addEventListener('click', (e) => { const b = e.target.closest('button[data-act]'); if (b && !b.disabled) this.act(b.dataset.act, b.dataset.id, e); });
      this.el.panel.addEventListener('change', (e) => { const s = e.target.closest('select[data-act]'); if (s) { this.act(s.dataset.act, s.value, e); s.blur(); } });
      window.addEventListener('keydown', (e) => {
        if (e.target && e.target.tagName === 'SELECT') return;
        if (this.shelfOpen && (e.code === 'Escape' || e.code === 'KeyE')) { this.shelf.close(); this.player.input.once.delete('KeyE'); return; }
        if (!this.open) return;
        if (e.code === 'Escape' || e.code === 'KeyE') { this.close(); this.player.input.once.delete('KeyE'); } // the same E must not reopen it
      });
    }
    if (hud && hud.registerPaper) hud.registerPaper('outfitter', () => this.close());
    // the page going away (a reload, a closed tab): the trip's document now, not at the next eight-second save, so a
    // bottle just filled, a meal just eaten or a fish just kept comes back with the spot the shell saves alongside
    const flush = () => { if (this.trip.active || this.visit) this.save(); };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });
  }

  get shop() { return this._shop; }
  set shop(s) { this._shop = s; if (s) s.outfitter = this; }
  // the nearest landing to (x, z), by distTo
  nearest(x, z) {
    let best = null;
    for (const l of this.landings) { const d = this.distTo(l, x, z); if (!best || d < best.d) best = { l, d }; }
    return best;
  }
  // How far (x, z) is from landing l: from its store or the dock it was built with, once its tile has them (a visit
  // belongs to the store's layout: some entry points' own spots lie far out on the lake, Moose Lake's 125 m, and the
  // dock and the store stand at the shore in from it), else from the landing's own spot
  distTo(l, x, z) {
    const L = this.layout(l.ep);
    if (!L) return Math.hypot(l.x - x, l.z - z);
    const ds = L.dockSide || L.dockLand || L.door, c = L.centre || L.door;
    return Math.min(Math.hypot(ds.x - x, ds.z - z), Math.hypot(c.x - x, c.z - z));
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
  tieUp(l, L, quiet = false) {
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
    if (!quiet) this.hud.note(`Tied up at the ${l.name} dock. The door is open.`, 4);
  }
  // A season begun at a landing with a store, or a page reloaded in one (boot): once the store is built (its tile
  // streams in), the canoe is tied up at its dock and you stand at the door, or back where you were on the floor.
  // With no store by ARRIVAL_WAIT, a season's counter opens from the water as it always did.
  updateArrival(dt) {
    const a = this.arrival, p = this.player, l = this.landing(a.ep), L = l ? this.layout(a.ep) : null;
    a.t += dt;
    if (!L) {
      if (a.t < ARRIVAL_WAIT && l) return;
      this.arrival = null;
      if (a.why === 'season' || a.pending) this.pendingShow = true;
      if (a.switched && p.chase && p.chase.mode === 'first') p.chase.setMode('third'); // the store's first person, saved without the store
      return;
    }
    this.arrival = null;
    if (this.distTo(l, p.x, p.z) > ARRIVAL_FAR || !(p.mode === 'paddle' || p.onFoot)) { if (a.why === 'season' || a.pending) this.pendingShow = true; return; }
    this.tieUp(l, L, a.why === 'reload' || a.why === 'ride');
    if (a.why === 'ride') this.hud.note(`The truck leaves you at ${l.name}: the canoe at the dock, the door open.`, 5);
    const v = this.visit;
    if (a.why === 'reload') {
      const d = this.day; this.greeted[a.ep] = `${d.year}-${d.doy}`; // the keeper said hello before the reload
      if (a.inside && L.inside(a.x, a.z)) {
        p.x = a.x; p.z = a.z; p.heading = Number.isFinite(a.heading) ? a.heading : p.heading;
        p.foot = { y: L.floorY, vy: 0, air: false, t: 0, land: 0, near: null };
        p.placeOnGround();
        if (p.chase) { p.chase.viewYaw = p.heading; p.chase.forwardYaw = p.heading; p.chase.snap(); }
      }
      if (v) v.switched = !!a.switched || v.switched;
      this.hud.note(`Back ${a.inside ? 'in the store' : 'at the door'} at ${l.name}.`, 4);
      if (a.pending) this.pendingShow = true;
    }
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
    const far = this.distTo(v.landing, p.x, p.z) > VISIT_FAR;
    if (!p.onFoot || far) { this.endVisit(p.mode === 'paddle' && !p.teleporting && !far); return; }
    const L = this.layout(v.ep) || v.L; v.L = L;
    const inside = !!L.inside(p.x, p.z);
    if (inside !== v.inside) { v.inside = inside; if (inside) this.enterStore(v); else this.leaveStore(v); }
  }
  enterStore(v) {
    const ch = this.player.chase;
    if (ch && ch.mode !== 'first' && !ch.roomAware) { v.switched = true; ch.setMode('first'); }
    const d = this.day, today = `${d.year}-${d.doy}`;
    if (this.greeted[v.ep] !== today) {
      this.greeted[v.ep] = today;
      // a season begun here: the forty dollars, said as you come in; off a truck (rides.js) after a bunk night, good
      // morning; a store new to you, a stranger's welcome; off the truck, the road's word; else hello
      const fresh = !!(this.core && this.core.fresh === v.ep);
      const kind = this.lineKind === 'season' ? 'season' : this.arrivedBy === 'bunk' ? 'morning' : fresh ? 'stranger' : this.arrivedBy === 'ride' ? 'ride' : 'hello';
      if (kind === 'season' || this.arrivedBy) this.lineKind = 'welcome';
      this.arrivedBy = null;
      if (fresh) this.core.fresh = null;
      const who = this.shop ? this.shop.keeperName(v.ep) : null, words = this.say(v.ep, kind);
      this.heard(v.ep, words);
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
    for (const sh of L.shelves || []) s.push({ key: sh.kind, shelf: sh.kind, p: sh });
    if (L.wall) s.push({ key: 'wall', shelf: 'lure', p: L.wall });
    if (L.mapTable) s.push({ key: 'maps', shelf: 'map', p: L.mapTable });
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
    if (s.key === 'counter') { const who = this.shop ? this.shop.keeperName(v.ep) : null; return `The counter${who ? ` · ${esc(who)}` : ''}: the permit, a bunk, the road`; }
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
    p.input.paused = this.open || this.shelfOpen || !!this.evac || veil || this.bunking || (this.hud && this.hud.paper === 'journal');
    if (!p.packs) p.loadFactor = this.loadFactor; // the packs (packs.js) set it from the load once they are there
    const free = !this.open && !this.evac && !veil && !this.bunking && !(this.hud && this.hud.paper);
    if (this.arrival && !p.teleporting && !veil) this.updateArrival(dt);
    if (this.pendingShow && !p.teleporting && free && !this.arrival) { this.pendingShow = false; this.show(this.visit ? this.visit.landing : this.nearest(p.x, p.z).l); }
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
        if (s && !(this.people && this.people.claimsE) && p.input.pressed('KeyE')) {
          if (s.shelf) this.openShelf(s.shelf, this.visit.landing);
          else { this.staged = { tab: s.tab, focus: null }; this.show(this.visit.landing, s.tab, null); }
        }
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
    if (v && !this.open && !this.shelfOpen && !this.bunking && p.onFoot) {
      if (v.inside) { const s = this.spot(); p.prompt = s ? { key: 'E', text: this.spotText(s, v) } : null; }
      else if (v.L && v.L.door && Math.hypot(v.L.door.x - p.x, v.L.door.z - p.z) < DOOR_R && !(p.prompt && /kbd/.test(p.prompt.text || ''))) p.prompt = { key: null, text: `${esc(v.landing.name)} · the door is open` };
    }
  }

  // --- the counter ------------------------------------------------------------------------------------------
  // open at a tab: 'counter' (the permit, the services, money and rides) or 'board'
  show(landing, tab = null, focus = null) {
    const pr = this.profile, core = this.core, st = this.staged; // staged: the tab a hotspot asked for, should a wrapper drop the arguments
    this.staged = null;
    if (!tab && st) { tab = st.tab; focus = st.focus; }
    const stranger = (pr && !pr.knows(landing.ep)) || (core && core.fresh === landing.ep); // a first visit
    if (core) { core.learn(landing.ep); core.fresh = null; } else if (pr) pr.learn(landing.ep);
    if (this.shelfOpen) this.shelf.close();
    this.at = landing; this.open = true; this.tab = TABS.some(([k]) => k === tab) ? tab : 'counter'; this.focus = focus; this.receipt = null;
    const rode = this.arrivedBy === 'ride'; this.arrivedBy = null; // stream C's rides: the keeper's words for one come up the road
    const kind = this.lineKind === 'welcome' ? (stranger ? 'stranger' : rode ? 'ride' : this.trip.active ? 'passing' : 'welcome') : this.lineKind;
    this.greeting = this.say(landing.ep, kind);
    this.heard(landing.ep, this.greeting);
    this.who = this.shop ? this.shop.keeperName(landing.ep) : null;
    this.lineKind = 'welcome';
    this.today = { year: this.day.year, doy: this.day.doy };
    if (this.adventure && pr && !pr.permit && !this.trip.active) this.draft = this.draft || { entry: { ...this.today } };
    if (this.energy && typeof this.energy.fill === 'function') this.energy.fill(2, 0); // the counter's tap: a full bottle, free
    if (this.hud && this.hud.openPaper) this.hud.openPaper('outfitter');
    this.el.panel.classList.add('show');
    this.render();
  }
  // A shelf's two panes (inv-ui.js ShelfScreen): 'food', 'tackle', 'gear', 'lure' (the wall) or 'map' (the table), your
  // containers on the left (at the store, all of them) and the shelf on the right at this outfitter's prices
  get shelfOpen() { return !!(this.shelf && this.shelf.open); }
  openShelf(kind, landing) {
    if (!this.shelf || !this.shop || !landing) return;
    if (this.open) this.hide();
    const ep = landing.ep, sh = SHELVES.find((k) => k.kind === kind) || SHELVES[0], who = this.shop.keeperName(ep), op = this.shop.outfitterProfile(ep);
    if (this.core) this.core.learn(ep); else if (this.profile) this.profile.learn(ep);
    this.at = landing; this.shelfAt = { kind, ep };
    const sig = this.shop.signature(ep), here = sig && sig.shelf === kind;
    const words = kind === 'map' ? 'The sheets are on the table. Take the one you’re paddling, and the next one over.' : here ? `${sig.name}: made here, and you won’t find it anywhere else.` : null;
    this.shelf.show({
      kind, look: SHELF_LOOK[kind] || 'shelf', title: sh.name, shelfName: sh.where, sub: sh.sub,
      kicker: `Entry point ${ep} · ${this.lakeOf(landing)} · ${landing.name}${op && (op.kindWords || op.kind) ? ` · ${op.kindWords || op.kind}` : ''}`,
      say: words, who: words ? who : null,
      hint: this.sandbox ? 'Sandbox: the shelves are free. Drag a thing into one of yours, or double-click it.' : null,
      stock: () => this.shop.shelfStock(kind, ep),
      buy: (id, spot, n) => { const r = this.shop.buyItem(id, ep, spot, n); this.save(); return r; },
      money: () => this.money,
      onClose: () => { this.shelfAt = null; },
    });
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
  act(act, id, ev = null) {
    const f = this.draft;
    if (act === 'close') this.close();
    else if (act === 'tab') { this.tab = id; this.focus = null; this.render(); }
    else if (act === 'shelf') this.openShelf(id, this.at);
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
  choice(act, id, label, on, disabled = false) {
    return `<button type="button" class="opt${on ? ' on' : ''}" data-act="${act}" data-id="${id}" aria-pressed="${on}"${disabled ? ' disabled' : ''}>${label}</button>`;
  }

  // the season's permit, the food and the ways on: the counter tab's left column
  permitSection(a) {
    const pr = this.profile, core = this.core, adv = this.adventure, active = this.trip.active;
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
    // what you carry and the food in it (the inventory, stream A); the food itself is on the provisions shelf
    const inv = invModel(), all = inv && inv.containers ? inv.containers : [], packs = all.filter((c) => /^pack/.test(String(c.item))).length, barrels = all.filter((c) => /^barrel/.test(String(c.item))).length;
    rows.push(`<div class="lab">Packs</div><div>${packs > 1 ? `${packs} Duluth packs` : packs ? 'One Duluth pack' : 'No pack'}${barrels ? ` and ${barrels > 1 ? `${barrels} barrels` : 'a barrel'}` : ''} · <span class="soft">${packs > 1 ? 'two carries' : 'one carry'}</span></div>`);
    const food = inv && typeof inv.foodWords === 'function' ? inv.foodWords() : this.energy ? `${fmtDaysWords(this.energy.food)} of food` : '';
    const inStore = !!(this.visit && this.layout(a.ep)), shelves = inStore ? '' : `<div class="shelfbtns">${SHELVES.map((k) => `<button type="button" class="stamp small outline" data-act="shelf" data-id="${k.kind}">${esc(k.name)}</button>`).join('')}</div>`;
    const pack = `<div class="lab">Food</div><p class="left">${esc(food || 'Nothing to eat')} within reach</p>
        <p class="note">${this.sandbox ? 'Sandbox: the shelves are free and nobody goes hungry.' : 'Meals and snacks are on the provisions shelf: walk over, pick them up and pack them yourself.'}</p>${shelves}`;
    let push;
    if (!active) {
      const iceTxt = ice ? `the lakes are iced in until ${shortDate(thaw.year, thaw.doy)}` : '';
      const hungry = !this.sandbox && this.energy && this.energy.food <= 0 ? 'no food in the packs yet: the provisions shelf' : '';
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
    // a friend of the house (standing 2) hears one of the keeper's insider words a day, and it goes on the map (toldHints)
    if (keeper && typeof keeper.hint === 'function' && rep >= 2) {
      const hs = op.hints || [], n = hs.length ? this.day.doy % hs.length : 0;
      try { hint = keeper.hint(this.world, op, n) || ''; } catch { hint = ''; }
      if (hint) this.heard(a.ep, hint);
    }
    const parts = [];
    if (hint) parts.push(`<div class="word"><div class="lab">${esc(keeper.name || 'The keeper')}, leaning on the counter</div><p>“${esc(hint)}”</p></div>`);
    else if (keeper && keeper.name) parts.push(`<div class="word"><div class="lab">${esc(keeper.name)}${keeper.manner ? ` · ${esc(keeper.manner)}` : ''}</div><p class="soft">${rep >= 2 ? 'Nothing much to tell today.' : 'Friendly enough. Keeps the good spots to the regulars.'}</p></div>`);
    const sheets = shop && !this.layout(a.ep) ? shop.stock(a.ep).filter((s) => s.shelf === 'map' && s.id !== 'mapcase') : [];
    if (sheets.length) parts.push(`<div class="maps"><div class="lab">Map sheets of this country</div>${sheets.map((s) => this.sheetRow(s)).join('')}</div>`);
    else if (shop && this.layout(a.ep)) parts.push('<p class="soft">The map sheets are out on the table by the window, and the food and the gear are on the shelves.</p>');
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
  // a keeper's words that are one of their insider hints (outfitters.js profile.hints) are told: the map rings the water
  heard(ep, words) {
    const pr = this.profile, op = this.shop ? this.shop.outfitterProfile(ep) : null;
    if (!pr || typeof pr.tell !== 'function' || !op || !Array.isArray(op.hints) || !words) return;
    const i = op.hints.findIndex((h) => h && h.text === words);
    if (i >= 0) pr.tell(ep, i);
  }
  // the hints you have been told, with the water each one means: { kind, text, lake, x, z, r, ep } (hud.js rings them)
  toldHints() {
    const pr = this.profile; if (!pr || !this.shop || !Array.isArray(pr.told)) return [];
    const out = [];
    for (const k of pr.told) {
      const [ep, i] = String(k).split(':').map(Number), op = this.shop.outfitterProfile(ep), h = op && Array.isArray(op.hints) ? op.hints[i] : null;
      if (h && Number.isFinite(h.x) && Number.isFinite(h.z)) out.push({ ...h, ep });
    }
    return out;
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
    const known = pr.known.length, all = this.landings.length;
    const rep = Math.floor(pr.outfitter(a.ep).rep), earned = pr.earned;
    return `<section class="wall" aria-labelledby="wall-h">
      <div class="top"><h3 id="wall-h">Your outfit</h3></div>
      <div class="slots">${SLOTS.map(slotRow).join('')}</div>
      <p class="soft">The canoe is ${kg} kg on the portages. What you carry, and what is in it, is in your book: <kbd>J</kbd>, then <kbd>Tab</kbd>.</p>
      <div class="lab">This season</div>
      <p>${earned ? `$${earned} earned on the boards` : 'Nothing earned yet'} · ${known} of ${all} ${plural(all, 'outfitter')} known. You are ${STANDING[Math.max(0, Math.min(5, rep))]} here.</p>
    </section>`;
  }

  render() {
    if (!this.open || !this.el.panel) return;
    const a = this.at, active = this.trip.active;
    const lakeName = this.lakeOf(a), area = areaOf(a.ep), op = this.shop ? this.shop.outfitterProfile(a.ep) : null;
    const purse = this.profile ? `<div class="purse"><span class="sc">In hand</span><b>$${this.money}</b></div>` : '';
    const was = this.el.panel.querySelector('.permit, .desk'), scroll = was ? was.scrollTop : 0;
    const leave = this.inStore ? 'Look around · E' : `${active ? 'Carry on' : 'Push off'} · E`;
    const nav = `<nav class="tabs" aria-label="The counter's tabs">${TABS.map(([k, l]) => `<button type="button" data-act="tab" data-id="${k}" class="${this.tab === k ? 'on' : ''}">${l}</button>`).join('')}`
      + `${this.receipt ? `<span class="receipt pencil${this.receipt.ok ? '' : ' no'}">${esc(this.receipt.text)}</span>` : ''}</nav>`;
    let body;
    if (this.tab === 'board') body = `<div class="counter one">${this.boardSection(a)}</div>`;
    else body = `<div class="counter">${this.permitSection(a)}${this.deskSection(a)}${this.wallSection(a)}</div>`;
    this.el.panel.innerHTML = `<header>
      <div class="lede"><div class="sc kicker">Entry point ${a.ep} · ${esc(lakeName)}${area ? ` · ${area}` : ''}${op && (op.kindWords || op.kind) ? ` · ${esc(op.kindWords || op.kind)}` : ''}</div><h2>${esc(a.name)}</h2><div class="say">“${esc(this.greeting)}”${this.who ? ` <span class="who">— ${esc(this.who)}</span>` : ''}</div></div>
      ${purse}<button type="button" class="stamp outline" data-act="close" aria-label="Leave the counter (E or Esc)">${leave}</button>
    </header>${nav}${body}`;
    const now = this.el.panel.querySelector('.permit, .desk');
    if (scroll && now && now.className === (was && was.className)) now.scrollTop = scroll;
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
    this.summary = null; this.draft = null; this.evac = null; this.bunking = false; this.leftFrom = null; this.greeted = {}; this.arrival = null;
    if (this.visit) this.endVisit(false);
    if (this.energy) { this.energy.reset(); this.energy.food = 0; }
    if (this.tasks && this.tasks.reset) this.tasks.reset();
    if (this.stats) this.stats.reset();
    this.lineKind = 'season';
    // in at the store's door once it is built (updateArrival), the keeper's forty dollars as you step in; a landing
    // with no store opens the counter from the water
    this.arrival = { why: 'season', ep: home, t: 0 };
    this.pendingShow = false;
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
    // in or about a store: where on its floor, so a reload puts you back there (boot, updateArrival)
    const v = this.visit;
    if (v && p.onFoot) data.visit = { ep: v.ep, inside: !!v.inside, x: +p.x.toFixed(2), z: +p.z.toFixed(2), heading: +p.heading.toFixed(3), switched: !!v.switched };
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
    // the page went away in a store: back on its floor once it is built (updateArrival)
    const vis = d && d.visit && this.landing(d.visit.ep) && this.distTo(this.landing(d.visit.ep), this.player.x, this.player.z) < ARRIVAL_FAR ? d.visit : null;
    if (vis) this.arrival = { why: 'reload', ep: vis.ep, x: vis.x, z: vis.z, heading: vis.heading, inside: vis.inside, switched: vis.switched, t: 0, pending: !(d.trip && d.trip.active) };
    if (d && d.trip && d.trip.active) {
      this.trip = { ...this.trip, ...d.trip, days: this.foodRoom };
      const f = this.player.fishing;
      if (f && Array.isArray(d.stringer) && !f.stringer.length) for (const s of d.stringer) if (s && s.species) f.stringer.push({ species: s.species, length: +s.length || 0 });
      this.pendingShow = false;
      if (d.pos && Math.hypot(d.pos.x - this.player.x, d.pos.z - this.player.z) > 40 && this.onTeleport) await this.onTeleport(d.pos.x, d.pos.z);
      const core = this.core, dw = core && core.active ? core.dayWords() : '';
      if (moved === 'v2') this.hud.note('The permit is a season’s paper now: no dates and no exit. Come in when you like; any counter sells food.', 8);
      else if (moved === 'v1') this.hud.note('An older trip, back as Sandbox: the same lakes with no limits.', 7);
      else this.hud.note(`${vis ? 'Back at the outfitter' : this.player.mode === 'paddle' ? 'Back on the water' : 'Back ashore'}${dw ? `, ${dw}` : ''}: ${fmtDaysWords(this.energy.food)} of food, energy ${Math.round(this.energy.value * 100)} %${pr ? `, $${pr.money} in hand` : ''}.`);
      return;
    }
    this.pendingShow = false;
    if (vis || this.arrival) return; // the counter opens in the store once you are back in it; a season begun goes in at the door
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
// "Kevlar tripper, 17 ft" → "Kevlar tripper" for the kit's choices
const shortName = (s) => { const t = String(s).replace(/,\s*\d+\s*ft$/, '').replace(/ (paddle|tent|filter)$/i, '').replace(/^(Purifying|Water) /, ''); return t.charAt(0).toUpperCase() + t.slice(1); };

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
#outfitter .wall kbd { font-size: 10px; padding: 0 4px; }
#outfitter .permit .shelfbtns { display: flex; flex-wrap: wrap; gap: 6px; }
#outfitter .permit .shelfbtns .stamp { font-size: 10.5px; padding: 4px 9px; }
#outfitter .desk p.soft { font-size: 15px; }
`;
let cssIn = false;
function injectCss() {
  if (cssIn || typeof document === 'undefined') return;
  cssIn = true;
  const s = document.createElement('style'); s.id = 'outfitter-shop'; s.textContent = CSS;
  document.head.appendChild(s);
}
