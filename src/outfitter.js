// Outfitters at the entry point landings: a name for each, the store you walk into, its shelves, the counter, the board,
// the trip's old record (where you are, when it started) and its persistence. The outfitter is where a season starts
// and where you come in: its shelves sell the food and the gear, its counter fills the bottle and offers the services.
// There is no permit and no stamp (the world cards, 2026-10-24): the counter is the bunk and the rides, and
// the season is just the season. Sandbox's shelves are free. The board is the tasks' own (tasks.js boardSection), the shop
// and what the gear does are shop.js's, the rides up the road rides.js's (set on outfitter.rides), the keepers' words
// outfitters.js's (through the shop). The rules of the trip and its saved core live in trip.js, the money and the gear
// in profile.js; this document carries the core alongside the old fields.
//
// Trips start and end by themselves (fb2 C, the owner 2026-10-24: "trips simply start and end as you leave and reach
// outfitters"; the game-loop round: at every entry point): getting into the canoe at any entry point's landing (or
// paddling off from one) pushes off, and after being away, walking into an outfitter's store or up to its door, or into
// a trailhead's lot (trailhead.js), comes in, logged as "came in at …" (trip.js comeIn). An outfitter's dock or a
// trailhead's landing does not: a portage or a paddle past one must not end a trip. Back where you left without having
// gone anywhere, the push-off is taken back and nothing is logged. The fourteen outfitters are `landings`; every entry
// point is one of `entries` (entry(ep)); a trailhead's sign calls a pickup (showPickup, rides.js).
//
// Walking in. There is no "Tie up and go in": you land at the shore like anywhere else, or, afloat by an outfitter's
// dock, E ties the canoe up alongside it and you step out onto its deck, then walk up the yard, the steps and in
// (props.js builds the steps as stairs the walker takes without Space). Over the threshold the view goes to first
// person (and back as you step out), unless the camera keeps itself inside the walls (camera.js roomAware).
// The store is physical: pointed at with the crosshair (pointer.js, stream A of fb2; the store's hotspots are boxes
// round each whole shelf unit, so either side of one opens it), E opens the provisions, tackle or gear shelf, or the
// lure wall, as two panes (inv-ui.js ShelfScreen: your containers on the left, the shelf on the right); the map table
// opens its own screen (maptable.js, stream D: outfitter.mapTable); the counter opens the counter, which offers only a
// bunk night and the rides up the road, beside a side map of where the truck goes; the cork board opens the board,
// and only the board, which also pays the notices you've done. The keeper greets you, signed with the keeper's name, on the first visit of a day.
// Without a store (its tile not built yet) E by the landing opens the counter from the water. A new season begins at
// the home store's door (the keeper's forty dollars as you step in), and so does a ride's end; a page reloaded in a
// store comes back on its floor (updateArrival).
import { kv } from './store.js'; // the saves' store (IndexedDB, read into memory before the boot)
import { outfitterName, trailheadName, isOutfitter, hostOf, roadOf } from './outfitters.js';
import { trailheadLayout, trailheadAt, trailheadDist } from './trailhead.js';
import { esc, plural, word } from './hud.js';
import { drawCounterMap, markerAt } from './counter-map.js';
import './store.css';
import { FOOD_PRICE } from './profile.js';
import * as props from './props.js';
import { SHELVES, itemOf } from './shop.js';
import { ShelfScreen, model as invModel } from './inv-ui.js';
// fb2 C: the crosshair's pointer (stream A's pointer.js) when the build has it: the store's hotspots are its targets;
// without it, E in the store reads the same boxes along the view (aimAt)
const POINTER = import.meta.glob('./pointer.js', { eager: true })['./pointer.js'] || null;

// The signs' names live in outfitters.js now (the game-loop round: the set of fourteen, the roads and the names in one
// pure module; re-exported here for whatever imported them from here). Display only: saves key on entry point numbers.
export { outfitterName };
// the road an entry point is reached by, for the counter's kicker
export function areaOf(ep) { return roadOf(ep); }

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

const NEAR = 25;                 // metres from the landing (its dock, once built: distTo) within which it is the landing you are by afloat
const SAVE_KEY = 'bwca-canoe-trip';
const WAKE_BUNK = 7;             // the hour you wake after a bunk night
const EVAC_FADE = 1.4;           // seconds of fade before the move (the old evacuation, without a trip core)
const REACH = 1.6;               // metres from the walker to a store hotspot's box (its nearest side) within which E opens it
const DOOR_R = 3;                // metres from the door, outside, within which the door says it is open
const VISIT_FAR = 90;            // metres from the store and its dock (distTo) at which a visit is over (a ride, a teleport, a walk away)
const ARRIVAL_WAIT = 20;         // game seconds an arrival waits for the landing's store to be built before it gives up
const ARRIVAL_FAR = 250;         // metres from the landing (distTo) within which an arrival still goes in (a teleport finds water up to 120 m out)
const COME_IN = 30;              // metres from a landing (distTo) within which, on foot, you are at it (its port)
const LOT_DOOR = 7;              // game-loop round: metres from an outfitter's door (its porch, its steps) within which, on foot, a trip comes in
const SIGN_REACH = 2.4;          // metres from a trailhead's sign within which E calls a pickup
const SET_V = 1;                 // the outfitter set a profile has been moved onto (game-loop round: fourteen outfitters)
const AWAY = 90;                 // metres from the landing a trip left that make it a trip (back sooner, the push-off is taken back)
const DOCK_R = 7;                // metres from the dock's side (afloat) within which E ties up alongside it
const DOCK_TIME = 1.6;           // seconds the canoe takes to come alongside the dock
const MODES = ['counter', 'board']; // the paper's two faces: the counter at the counter, the board at the cork board
// what each of the store's hotspots is to the pointer (the layout's `hot` keys, props.js): its kind and its name
const HOT = {
  food: ['shelf', 'The provisions shelf'], tackle: ['shelf', 'The tackle shelf'], gear: ['shelf', 'The gear shelf'], wall: ['shelf', 'The lure wall'],
  maps: ['maptable', 'The map table'], counter: ['counter', 'The counter'], board: ['board', 'The board'],
};
const SHELF_OF = { food: 'food', tackle: 'tackle', gear: 'gear', wall: 'lure' };
const SHELF_LOOK = { food: 'shelf', tackle: 'shelf', gear: 'shelf', lure: 'pegs', map: 'table' };

// the line for a push-off taken back (trip.js takeBack's report): no trip in the logbook, and what became of the permit
export function takeBackWords(r, l = null) {
  if (!r) return '';
  const here = l && l.name ? ` at ${l.name}` : '';
  const pm = r.permit;
  const paper = pm ? (r.kept ? ' Your permit is still good today.' : ' Its day is gone, and the permit with it.') : '';
  const fine = r.fined ? " The ranger's fine still stands." : '';
  return `Back${here} without going anywhere: a short outing, not a trip, and nothing in the logbook.${paper}${fine}`;
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
    // the game-loop round: the landings are the outfitters' only (fourteen); every entry point is an entry, the others
    // trailheads (a lot, a permit box, the sign: trailhead.js), each with the outfitter that serves it (host)
    this.entries = world.entryPoints.map((ep) => {
      const out = isOutfitter(ep.ep);
      return { ep: ep.ep, name: out ? outfitterName(ep) : trailheadName(ep), place: ep.name, x: ep.x, z: ep.z, lake: ep.lake, outfitter: out, host: hostOf(ep.ep, world) };
    });
    this.landings = this.entries.filter((e) => e.outfitter);
    this.desks = new Map();          // the counter's other desks (addDesk: the permit desk, the onboarding, the tally's)
    this.via = null;                 // the outfitter that last drove you to a put-in or saw you off its own landing (pickups)
    this.lastLot = null;             // the trailhead you came out at (its sign calls a pickup)
    this.trip = { active: false, ep: null, days: 0, started: null, startAbs: 0, turnedIn: 0 };
    this.open = false; this.at = null; this.near = null;
    this.tab = 'counter'; this.focus = null; this.receipt = null; // tab: the paper's face, 'counter' or 'board' (MODES)
    this.port = null;                // fb2 C: the landing you are at (on foot by it, or at its counter): a trip pushes off from it
    this.docking = null;             // fb2 C: the canoe coming alongside a dock (E afloat by it): { l, L, t, x0, z0, h0, h1 }
    this.dockAt = null;              // the landing whose dock you are afloat by, its store built (E ties up)
    this.aimed = null;               // without the pointer: the hotspot the view is on, in the store
    this.mapTable = null;            // stream D's map table screen (maptable.js), set in its main.js block
    // fb2 C: the store's hotspots as the crosshair's targets (stream A's pointer.js); E in the store is then the pointer's
    this.pointer = POINTER && POINTER.pointer ? POINTER.pointer : null;
    if (this.pointer && typeof this.pointer.register === 'function') {
      this.pointer.register((ray, near) => this.targets(ray, near));
      this.pointer.passStore = false;
    } else this.pointer = null;
    this.visit = null;               // in or about a store: { ep, landing, L, inside, switched, settled }
    this.arrival = null;             // a season begun, or a page reloaded in a store: in at the store once it is built
    this.greeted = {};               // ep → the day its keeper last said hello
    this.stubStore = false;          // tests: an invisible store beside the shack when props.js has no storeLayout
    this.stubs = new Map();
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

  // the season (profile.js): set by main.js; a season from before the game-loop round is moved onto the fourteen
  // outfitters the moment it is (migrateProfile)
  get profile() { return this._profile || null; }
  set profile(p) { this._profile = p || null; if (p) { try { migrateProfile(p, this.world); } catch (e) { console.warn('outfitter: profile migration', e); } } }
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
    if (l && l.outfitter === false) { const T = trailheadLayout(l.ep); return T ? trailheadDist(T, x, z) : Math.hypot(l.x - x, l.z - z); }
    const L = this.layout(l.ep);
    if (!L) return Math.hypot(l.x - x, l.z - z);
    const ds = L.dockSide || L.dockLand || L.door, c = L.centre || L.door;
    return Math.min(Math.hypot(ds.x - x, ds.z - z), Math.hypot(c.x - x, c.z - z));
  }
  landing(ep) { return this.landings.find((l) => l.ep === ep) || null; }
  // any entry point, an outfitter's or a trailhead's: { ep, name, place, x, z, lake, outfitter, host }
  entry(ep) { const n = Number(ep); return this.entries.find((e) => e.ep === n) || null; }
  nearestEntry(x, z) {
    let best = null;
    for (const e of this.entries) { const d = this.distTo(e, x, z); if (!best || d < best.d) best = { e, d }; }
    return best;
  }
  // where (x, z) is at an entry point, on foot: { e, out } (out: in an outfitter's store or by its door, or in a
  // trailhead's lot: where a trip under way comes out), or null away from them. By an outfitter's dock or at a
  // trailhead's landing you are at it (its port) but not out: a portage landing or a paddle-through that touches an
  // entry point's shore does not end a trip.
  entryHere(x, z) {
    const n = this.nearest(x, z);
    if (n && n.d < COME_IN) {
      const L = this.layout(n.l.ep);
      if (!L) return { e: n.l, out: true }; // (its store not built: the old way, at the landing)
      return { e: n.l, out: !!L.inside(x, z) || (!!L.door && Math.hypot(L.door.x - x, L.door.z - z) < LOT_DOOR) };
    }
    const th = trailheadAt(x, z), e = th ? this.entry(th.L.ep) : null;
    return e ? { e, out: th.where === 'lot', lot: th.L } : null;
  }
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
  // The canoe tied alongside the dock (a hull set down on the water, as player.js sets one down on the ground), and you
  // at the door facing in (a season begun, a ride's end, a page reloaded: placed by the game, never on a key), or on
  // the dock's deck beside the canoe facing the land (at: 'deck', the end of tying up from the water: dockUp)
  // The dock's berths in the water (props.js dockBerths; a stub's one dockSide), and the first no friend's canoe lies in
  // (coop-share.js sets otherCanoes in a room: [{ x, z }]); alone, always the first, as before
  berths(L) {
    const w = this.world, list = Array.isArray(L.dockBerths) ? L.dockBerths.filter((b) => !w || !w.shoreAt || w.shoreAt(b.side.x, b.side.z) < -0.6) : [];
    if (!list.length || (L.dockSide && Math.hypot(list[0].side.x - L.dockSide.x, list[0].side.z - L.dockSide.z) > 0.01)) list.unshift({ side: L.dockSide || L.dockLand || L.door, deck: L.dockDeck || null });
    return list;
  }
  berthFor(L) {
    const list = this.berths(L), others = typeof this.otherCanoes === 'function' ? this.otherCanoes() : [];
    return list.find((b) => !others.some((c) => Math.hypot(c.x - b.side.x, c.z - b.side.z) < 2.6)) || list[0];
  }
  // where this visit's canoe is tied (packs.js atDock, shop.js canoeAtDock)
  get berthSide() { const v = this.visit; return v ? (v.berth && v.berth.side) || (v.L && v.L.dockSide) || null : null; }
  tieUp(l, L, quiet = false, at = 'door', berth = null) {
    berth = berth || this.berthFor(L);
    const p = this.player, w = this.world, ds = berth.side;
    const dd = w.deeperDir(ds.x, ds.z), hh = Number.isFinite(this.docking && this.docking.h1) ? this.docking.h1 : Math.atan2(-dd.z, dd.x);
    p.landing = null; p.ashore = null; p.swim = null; p.speed = 0; p.yawRate = 0; p.bob = null; p.balance = 0; p.extraRoll = 0;
    p.mode = 'walk';
    p.carry = { trail: null, drop: { x: ds.x, z: ds.z, heading: hh }, hitCooldown: 0, from: null, choice: false };
    p.restHull(ds.x, ds.z, hh);
    const deck = at === 'deck' && berth.deck ? berth.deck : null;
    if (deck) { p.x = deck.x; p.z = deck.z; p.heading = Number.isFinite(L.dockHeading) ? L.dockHeading + Math.PI : L.door.heading; }
    else { p.x = L.door.x; p.z = L.door.z; p.heading = L.door.heading; }
    const y = deck && Number.isFinite(deck.y) ? deck.y : !deck && Number.isFinite(L.door.y) ? L.door.y : p.groundAt(p.x, p.z);
    p.foot = { y, vy: 0, air: false, t: 0, land: 0, near: null };
    p.canoe.state.stroke = 0; p.canoe.state.power = 0;
    p.placeOnGround();
    const ch = p.chase;
    if (ch) { ch.viewYaw = p.heading; ch.forwardYaw = p.heading; ch.viewPitch = 0; ch.snap(); }
    this.visit = { ep: l.ep, landing: l, L, berth, inside: false, switched: false, settled: false, bye: false };
    this.port = l;
    if (this.core) this.core.learn(l.ep); else if (this.profile) this.profile.learn(l.ep);
    if (!quiet) this.hud.note(deck ? `Tied up at the ${l.name} dock. The store is up the yard.` : `Tied up at the ${l.name} dock. The door is open.`, 4);
  }
  // E afloat by a store's dock: the canoe comes alongside it, paddled in over DOCK_TIME (updateDocking), and you step
  // out onto the deck. Like going ashore anywhere, only onto the dock: no door, no teleport.
  dockUp(l, L) {
    const p = this.player, berth = this.berthFor(L), ds = berth.side;
    let h1 = Number.isFinite(L.dockHeading) ? L.dockHeading : p.heading;
    const turn = (a) => Math.abs(Math.atan2(Math.sin(a - p.heading), Math.cos(a - p.heading)));
    if (turn(h1 + Math.PI) < turn(h1)) h1 += Math.PI; // bow out or bow in, whichever is less of a turn
    this.docking = { l, L, berth, t: 0, x0: p.x, z0: p.z, h0: p.heading, h1, d: Math.hypot(ds.x - p.x, ds.z - p.z) };
  }
  updateDocking(dt) {
    const D = this.docking, p = this.player, ds = D.berth.side;
    if (p.mode !== 'paddle' || p.teleporting) { this.docking = null; return; }
    D.t += dt;
    const dur = Math.max(0.6, Math.min(DOCK_TIME, 0.35 + D.d * 0.3)), u = Math.min(1, D.t / dur), k = u * u * (3 - 2 * u);
    p.x = D.x0 + (ds.x - D.x0) * k; p.z = D.z0 + (ds.z - D.z0) * k;
    p.heading = D.h0 + Math.atan2(Math.sin(D.h1 - D.h0), Math.cos(D.h1 - D.h0)) * k;
    p.speed = 0; p.yawRate = 0;
    const st = p.canoe.state; st.power = 0.35 * (1 - k); st.stroke = (st.stroke + dt * 0.8) % 1;
    if (u >= 1) { this.tieUp(D.l, D.L, false, 'deck', D.berth); this.docking = null; }
  }
  // A season begun at a landing with a store, or a page reloaded in one (boot): once the store is built (its tile
  // streams in), the canoe is tied up at its dock and you stand at the door, or back where you were on the floor.
  // With no store by ARRIVAL_WAIT, a season's counter opens from the water as it always did.
  updateArrival(dt) {
    if (this.arrival && !isOutfitter(this.arrival.ep)) return this.updateTrailArrival(dt);
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
    this.tieUp(l, L, a.why === 'reload' || a.why === 'ride' || a.why === 'evac');
    if (a.why === 'ride') this.hud.note(`The truck leaves you at ${l.name}: the canoe at the dock, the door open.`, 5);
    if (a.why === 'evac' && a.pending) this.pendingShow = true;
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
  // The game-loop round: a drive or a pickup's way back (or a moved save) ends at a trailhead: once its tile has built it,
  // the canoe is set down in the water at its landing and you stand in the lot by the sign. Before then (or with none
  // built by ARRIVAL_WAIT) you are left afloat at the landing, where the teleport put you.
  updateTrailArrival(dt) {
    const a = this.arrival, e = this.entry(a.ep), T = trailheadLayout(a.ep), p = this.player;
    a.t += dt;
    if (!T || !e) { if (a.t < ARRIVAL_WAIT && e) return; this.arrival = null; if (e) this.port = e; return; }
    this.arrival = null;
    if (this.distTo(e, p.x, p.z) > ARRIVAL_FAR || !(p.mode === 'paddle' || p.onFoot)) return;
    this.setDown(T, e);
    if (a.why === 'ride') this.hud.note(`The truck leaves you in the lot at ${e.name}: the canoe at the landing.`, 5);
    else if (a.why === 'moved') this.hud.note(a.words || `In the lot at ${e.name}.`, 7);
  }
  // you in a trailhead's lot by the sign, facing the water; the canoe set down afloat at its landing
  setDown(T, e) {
    const p = this.player, w = T.water, door = T.door;
    p.landing = null; p.ashore = null; p.swim = null; p.speed = 0; p.yawRate = 0; p.bob = null; p.balance = 0; p.extraRoll = 0;
    p.mode = 'walk';
    p.carry = { trail: null, drop: { x: w.x, z: w.z, heading: w.heading }, hitCooldown: 0, from: null, choice: false };
    if (typeof p.restHull === 'function') p.restHull(w.x, w.z, w.heading);
    p.x = door.x; p.z = door.z; p.heading = door.heading;
    p.foot = { y: p.groundAt(p.x, p.z), vy: 0, air: false, t: 0, land: 0, near: null };
    if (p.canoe && p.canoe.state) { p.canoe.state.stroke = 0; p.canoe.state.power = 0; }
    p.placeOnGround();
    const ch = p.chase;
    if (ch) { ch.viewYaw = p.heading; ch.forwardYaw = p.heading; ch.viewPitch = 0; ch.snap(); }
    this.port = e;
    if (this.visit) this.endVisit();
  }
  // a visit begins at a tie-up or on foot by a store (its yard, its dock), and ends afloat again or far off
  updateVisit() {
    const p = this.player;
    let v = this.visit;
    if (!v) {
      if (!p.onFoot || p.teleporting) return;
      const n = this.nearest(p.x, p.z); if (!n || n.d > COME_IN) return;
      const L = this.layout(n.l.ep); if (!L) return;
      v = this.visit = { ep: n.l.ep, landing: n.l, L, inside: false, switched: false, settled: false, bye: false };
    }
    const far = this.distTo(v.landing, p.x, p.z) > VISIT_FAR;
    if (!p.onFoot || far) { this.endVisit(); return; }
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
      const who = this.shop ? this.shop.keeperName(v.ep) : null, words = this.say(v.ep, kind); // (said, not pencilled: the counter's "Mark it on my map" does that)
      if (!(this.people && this.people.keeperSays && this.people.keeperSays(v.ep, words, kind))) this.hud.note(who ? `${who}, behind the counter: “${words}”` : `From behind the counter: “${words}”`, 7); // fb F: said by the keeper's head
    }
  }
  leaveStore(v) {
    const ch = this.player.chase;
    if (v.switched && ch && ch.mode === 'first') ch.setMode('third');
    v.switched = false;
    if (!v.bye) { v.bye = true; const who = this.shop ? this.shop.keeperName(v.ep) : null, words = this.say(v.ep, 'goodbye'); if (!(this.people && this.people.keeperSays && this.people.keeperSays(v.ep, words, 'goodbye'))) this.hud.note(`${who ? `${who}, from the door` : 'From the door'}: “${words}”`, 4); } // fb F
  }
  endVisit() {
    const v = this.visit; if (!v) return;
    this.visit = null;
    const ch = this.player.chase;
    if (v.switched && ch && ch.mode === 'first') ch.setMode('third');
  }

  // --- the trip's start and end, by themselves (fb2 C) --------------------------------------------------------
  // The landing you are at (on foot by it, or afloat by it with its counter up) is your port. Into the canoe there, or
  // paddling off from it, the trip pushes off; on foot at any outfitter's landing again, it has come in: logged, if you
  // went anywhere (AWAY from the landing it left, or to another one), else the push-off is taken back.
  updateTrip() {
    const p = this.player, core = this.core, t = this.trip;
    if (p.teleporting || this.arrival || this.evac || this.bunking || this.docking || (core && core.evacuating) || (this.veil && this.veil.active)) return;
    const walking = p.mode === 'walk' || p.mode === 'carry';
    if (walking) {
      // (the game-loop round) out of the trip in an outfitter's store or by its door, or in a trailhead's lot; at its
      // dock or a trailhead's landing it is only your port
      const h = this.entryHere(p.x, p.z);
      if (h) {
        if (t.active && h.out) { if (t.away || h.e.ep !== t.ep) this.comeIn(h.e); else this.takeBack(h.e); }
        this.port = h.e;
      }
    } else if (p.mode === 'paddle' && !t.active && this.port) {
      if (this.portWalked || this.distTo(this.port, p.x, p.z) > NEAR) { this.at = this.port; this.start(); }
    }
    this.portWalked = walking && !!this.port;
    if (t.active && !t.away) {
      const from = this.entry(t.ep);
      if (!from || this.distTo(from, p.x, p.z) > AWAY) { t.away = true; this.save(); }
    }
  }
  // a trip under way has reached an outfitter: logged as came in, there (trip.js comeIn); no paper, no night
  comeIn(l) {
    const core = this.core, st = this.stats, t = this.trip;
    const days = Math.max(1, core && core.active ? core.dayN : Math.floor(this.daysOut) + 1), km = st ? st.km : 0, from = t.fromName || 'the landing';
    if (core) core.comeIn(l.ep);
    this.trip = { active: false, ep: null, days: this.foodRoom, started: null, startAbs: 0, turnedIn: 0 };
    this.at = l; this.summary = null;
    if (l && l.outfitter === false) this.lastLot = l.ep; // a trailhead: its sign calls a pickup
    const kmW = km > 0.05 ? `, ${(km * 0.621371 < 10 ? (km * 0.621371).toFixed(1) : Math.round(km * 0.621371))} mi paddled` : '';
    this.hud.note(`Came in at ${l.name}: ${days} ${plural(days, 'day')} out from ${from}${kmW}. The trip is in your logbook.`, 6);
    this.save();
  }
  // back at the landing the trip left without having gone anywhere: no trip after all, said in one line there and then
  // (the game-loop playthrough: it used to happen silently): a short outing, not a trip; the permit is in your pocket again
  takeBack(l) {
    const r = this.core && typeof this.core.takeBack === 'function' ? this.core.takeBack() : null;
    this.trip = { active: false, ep: null, days: this.foodRoom, started: null, startAbs: 0, turnedIn: 0 };
    this.at = l;
    const line = r ? takeBackWords(r, l) : '';
    if (line) this.hud.note(line, 7);
    this.save();
  }

  // --- the store's hotspots: what the crosshair opens -----------------------------------------------------------
  // The pointer's provider (pointer.js, stream A): inside a store, the hotspot box the view's ray meets first, if the
  // walker is within REACH of it. near.box is the pointer's own test; without it, boxHit.
  targets(ray, near) {
    const h = this.aimAt(ray, near && typeof near.box === 'function' ? near.box : null);
    if (h) return [{ dist: h.t, miss: h.miss || 0, target: h.target }];
    // a trailhead's sign: E calls a pickup
    const p = this.player, sn = !this.visit && p.onFoot && !this.open && !this.shelfOpen ? this.signNear(p.x, p.z) : null;
    if (!sn || !near || typeof near.box !== 'function') return [];
    const S = sn.L.sign, box = { x: S.x, y: S.y, z: S.z, hx: S.hx, hy: S.hy, hz: S.hz, heading: S.heading }, r = near.box(box);
    if (!r || !Number.isFinite(r.t)) return [];
    return [{ dist: r.t, miss: r.miss || 0, target: { kind: 'sign', ref: `pickup:${sn.e.ep}`, label: `The sign · ${sn.e.name}`, e: { verb: 'Call a pickup', run: () => this.showPickup(sn.e) }, box, at: { x: S.x, y: S.y, z: S.z } } }];
  }
  aimAt(ray, test = null) {
    const v = this.visit, p = this.player;
    if (!v || !v.inside || !v.L || !Array.isArray(v.L.hot) || !p.onFoot || this.open || this.shelfOpen || this.bunking || !ray) return null;
    let best = null;
    const o = ray.origin, d = ray.direction, dl = Math.hypot(d.x, d.z) || 1;
    for (const h of v.L.hot) {
      if (reachTo(h, p.x, p.z) > REACH) continue;
      const r = test ? test(h) : boxHit(ray, h);
      if (!r || !Number.isFinite(r.t) || r.t <= 1e-4) continue; // (a ray from inside a box: a third-person camera backed into a shelf)
      // where it meets the box: in front of the walker along the view, not between the camera and his back
      const ex = o.x + d.x * r.t - p.x, ez = o.z + d.z * r.t - p.z;
      if ((ex * d.x + ez * d.z) / dl < -0.25) continue;
      if (!best || r.t < best.t) best = { t: r.t, miss: r.miss || 0, h };
    }
    return best ? { ...best, target: this.targetOf(best.h, v) } : null;
  }
  targetOf(h, v) {
    const [kind, name] = HOT[h.key] || ['shelf', 'The shelves'];
    let label = name, q = null;
    if (h.key === 'counter') {
      const who = this.shop ? this.shop.keeperName(v.ep) : null; if (who) label = `${name} · ${who}`;
      // fb4 join (stream D's find): Q at the counter is a word with the keeper behind it, on the dot's label
      q = this.people && typeof this.people.keeperWord === 'function' ? this.people.keeperWord(v.ep) : null;
    }
    else if (h.key === 'board') { const ready = this.readyHere(v.ep).length; if (ready) label = `${name} · ${ready} to claim`; }
    const box = { x: h.x, y: h.y, z: h.z, hx: h.hx, hy: h.hy, hz: h.hz, heading: h.heading };
    return { kind, ref: h.key, label, verb: 'Open', act: () => this.openHot(h.key, v.landing), ...(q ? { q } : {}), box, at: { x: h.x, y: h.y, z: h.z } };
  }
  // what E on a hotspot opens: a shelf's two panes, the map table's screen, the counter, the board
  openHot(key, landing) {
    if (!landing) return false;
    this.port = landing;
    if (SHELF_OF[key]) { this.openShelf(SHELF_OF[key], landing); return true; }
    if (key === 'maps') {
      if (this.mapTable && typeof this.mapTable.show === 'function') return this.mapTable.show({ ep: landing.ep, landing });
      this.openShelf('map', landing); return true;
    }
    this.show(landing, key === 'board' ? 'board' : 'counter');
    return true;
  }
  // npcs.js's question without the pointer: the hotspot the view is on, as the old floor spot it reads ({ key, p: { x,
  // z, at } }), so the counter keeps E and the keeper behind it is Q (with the pointer: npcs.hotSpot, the dot's target)
  spot() {
    const h = this.pointer ? null : this.aimed;
    return h ? { key: h.h.key, p: { x: this.player.x, z: this.player.z, at: { x: h.h.x, z: h.h.z } } } : null;
  }
  // the notices done that this outfitter pays, and its fish notices whose fish you have with you (handed over at the board)
  readyHere(ep) {
    try {
      const T = this.tasks, done = (T && T.active ? T.active : []).filter((t) => t.from === ep && t.status === 'done');
      return T && typeof T.deliverable === 'function' ? [...done, ...T.deliverable(ep)] : done;
    } catch { return []; }
  }
  // Without the pointer: the hotspot the walker looks at, along the look from his eyes (the bearing and tilt of the
  // view, camera.js viewYaw and viewPitch), whichever way the camera itself stands
  viewRay() {
    const p = this.player, ch = p.chase;
    const yaw = ch ? ch.viewYaw : p.heading, pitch = ch ? ch.viewPitch || 0 : 0, y = (p.foot ? p.foot.y : p.groundAt(p.x, p.z)) + 1.62;
    return { origin: { x: p.x, y, z: p.z }, direction: { x: Math.cos(yaw) * Math.cos(pitch), y: Math.sin(pitch), z: -Math.sin(yaw) * Math.cos(pitch) } };
  }

  // Before the player moves: who is nearby, E afloat by a dock (tie up alongside it), E at a hotspot in the store when
  // there is no pointer; the trip's start and end; the counter (or a fade, or the journal) holds the paddle still.
  update(dt) {
    const p = this.player, veil = !!(this.veil && this.veil.active) || !!(this.core && this.core.evacuating);
    const n = p.mode === 'paddle' && !p.landing && !p.teleporting && !p.ashore ? this.nearest(p.x, p.z) : null;
    this.near = n && n.d < NEAR ? n.l : null;
    const L = this.near ? this.layout(this.near.ep) : null;
    // the dock's side within reach afloat: E ties up there (the shore's "Go ashore" steps aside for it); a landing
    // whose store is not built yet: E opens its counter from the water
    this.dockAt = L && L.dockSide && L.dockDeck && this.berths(L).some((b) => b.deck && Math.hypot(b.side.x - p.x, b.side.z - p.z) < DOCK_R) ? this.near : null;
    p.suppressLanding = !!this.dockAt || (!!this.near && !L) || !!this.docking;
    p.input.paused = this.open || this.shelfOpen || !!this.evac || veil || this.bunking || !!this.docking || (this.hud && this.hud.paper === 'journal');
    if (!p.packs) p.loadFactor = this.loadFactor; // the packs (packs.js) set it from the load once they are there
    const free = !this.open && !this.evac && !veil && !this.bunking && !this.docking && !(this.hud && this.hud.paper);
    if (this.arrival && !p.teleporting && !veil) this.updateArrival(dt);
    if (this.pendingShow && !p.teleporting && free && !this.arrival) { this.pendingShow = false; this.show(this.visit ? this.visit.landing : this.nearest(p.x, p.z).l); }
    this.updateVisit();
    this.updateTrip();
    if (this.docking) this.updateDocking(dt);
    else if (free && this.open === false) {
      const rod = !!(p.fishing && p.fishing.rodUp);
      if (this.near && !rod) {
        if (this.dockAt && p.input.pressed('KeyE')) this.dockUp(this.dockAt, L);
        else if (!L && p.input.pressed('KeyE')) this.show(this.near);
      } else if (!this.pointer && !this.visit && p.onFoot && this.signNear(p.x, p.z)) {
        if (p.input.pressed('KeyE')) { p.input.once.delete('KeyE'); this.showPickup(this.signNear(p.x, p.z).e); }
      } else if (!this.pointer && this.visit && this.visit.inside) {
        // no pointer in the build: the hotspot along the view takes E, unless a visitor you face has it (npcs.js)
        const h = this.aimAt(this.viewRay());
        this.aimed = h;
        if (h && !(this.people && this.people.claimsE) && p.input.pressed('KeyE')) { p.input.once.delete('KeyE'); h.target.act(); }
      }
    }
    if (this.evac) this.updateEvac(dt);
    if (this.trip.active) { this.saveTimer += dt; if (this.saveTimer > 8) { this.saveTimer = 0; this.save(); } }
  }
  // after the player moved: the dock's prompt, unless something more pressing is being said; the store's hotspots
  // (without the pointer, which says its own); the door
  prompt() {
    const p = this.player;
    const rod = !!(p.fishing && p.fishing.rodUp); // the rod outranks the dock
    if (this.docking) p.prompt = { key: null, text: 'Coming alongside the dock…' };
    else if (this.near && !this.open && !this.evac && !rod && (!p.prompt || p.prompt.key === 'E' || this.dockAt)) {
      const known = !this.profile || this.profile.knows(this.near.ep), L = this.layout(this.near.ep);
      const name = `${this.near.name} · entry point ${this.near.ep}${known ? '' : ' · new to you'}`;
      if (this.dockAt) p.prompt = { key: 'E', text: `Tie up at the dock · ${esc(name)}` };
      else if (!L) p.prompt = { key: 'E', text: `${esc(name)} · the counter` };
    }
    if (!this.pointer && !this.visit && !this.open && p.onFoot && this.signNear(p.x, p.z)) p.prompt = { key: 'E', text: 'Call a pickup · the sign' };
    const v = this.visit;
    if (v && !this.open && !this.shelfOpen && !this.bunking && p.onFoot) {
      if (v.inside) { const h = this.pointer ? null : this.aimed; p.prompt = h ? { key: 'E', text: `Open · ${esc(h.target.label)}` } : null; } // with the pointer, its label under the crosshair says it
      else if (v.L && v.L.door && Math.hypot(v.L.door.x - p.x, v.L.door.z - p.z) < DOOR_R && !(p.prompt && /kbd/.test(p.prompt.text || ''))) p.prompt = { key: null, text: `${esc(v.landing.name)} · the door is open` };
    }
  }

  // --- the counter and the board ----------------------------------------------------------------------------
  // the paper at the counter ('counter': a bunk and the rides, beside the side map) or at the board ('board')
  show(landing, tab = null, focus = null) {
    const pr = this.profile, core = this.core, st = this.staged; // staged: the face a hotspot asked for, should a wrapper drop the arguments
    this.staged = null;
    if (!tab && st) { tab = st.tab; focus = st.focus; }
    const stranger = (pr && !pr.knows(landing.ep)) || (core && core.fresh === landing.ep); // a first visit
    if (core) { core.learn(landing.ep); core.fresh = null; } else if (pr) pr.learn(landing.ep);
    if (this.shelfOpen) this.shelf.close();
    this.at = landing; this.port = landing; this.open = true; this.tab = MODES.includes(tab) ? tab : 'counter'; this.focus = focus; this.receipt = null;
    const rode = this.arrivedBy === 'ride'; this.arrivedBy = null; // stream C's rides: the keeper's words for one come up the road
    const kind = this.lineKind === 'welcome' ? (stranger ? 'stranger' : rode ? 'ride' : this.trip.active ? 'passing' : 'welcome') : this.lineKind;
    this.greeting = this.say(landing.ep, kind);
    this.who = this.shop ? this.shop.keeperName(landing.ep) : null;
    this.lineKind = 'welcome';
    if (this.energy && typeof this.energy.fill === 'function') this.energy.fill(2, 0); // the counter's tap: a full bottle, free
    if (this.hud && this.hud.openPaper) this.hud.openPaper('outfitter');
    this.el.panel.classList.add('show');
    this.render();
  }
  // The game-loop round: at a trailhead's sign, a pickup: the outfitters who will come for you, each with its fare and
  // the wait (rides.js pickupSection), on the counter's paper
  showPickup(e) {
    if (!e || !this.rides || typeof this.rides.pickupSection !== 'function') return false;
    if (this.shelfOpen) this.shelf.close();
    this.at = e; this.port = e; this.open = true; this.tab = 'pickup'; this.focus = null; this.receipt = null;
    if (this.hud && this.hud.openPaper) this.hud.openPaper('outfitter');
    this.el.panel.classList.add('show');
    this.render();
    return true;
  }
  // the trailhead whose sign is within reach of (x, z), on foot: { L, e, d } or null
  signNear(x, z) {
    const th = trailheadAt(x, z); if (!th) return null;
    const L = th.L, d = Math.hypot(L.sign.x - x, L.sign.z - z), e = this.entry(L.ep);
    return e && d < SIGN_REACH + Math.max(L.sign.hx, 0) ? { L, e, d } : null;
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
  // leaving the paper: back to the store, or to the water at a landing with no store; the trip is not the counter's
  // business (it pushes off as you paddle away)
  get inStore() { return !!(this.visit && this.player.onFoot); }
  close() {
    if (!this.open) return;
    this.hide();
  }
  act(act, id, ev = null) {
    // the other streams' desks first (addDesk): an act of their own is theirs
    for (const d of [...this.desks.values()]) {
      if (typeof d.act !== 'function') continue;
      let r = false;
      try { r = d.act(act, id, ev); } catch (e) { console.warn('outfitter desk act', d.key, e); }
      if (r) { this.save(); if (this.open) this.render(); return r; }
    }
    if (act === 'close') this.close();
    else if (act === 'pickup' && this.rides && typeof this.rides.callPickup === 'function' && this.at) { this.rides.callPickup(this.at.ep, Number(id)); }
    else if (act === 'shelf') this.openShelf(id, this.at);
    else if (act === 'bunk') this.bunk();
    else if (act === 'tab' && MODES.includes(id)) { this.tab = id; this.render(); } // a landing with no store yet: the board from the counter
    else if (act === 'mark' && this.at && this.deskHint) { this.heard(this.at.ep, this.deskHint); if (this.hud) this.hud.note(`${(this.shop && this.shop.keeperName(this.at.ep)) || 'The keeper'} pencils a ring on your map.`, 4); this.render(); }
    else if (act === 'ride' && this.rides) this.rides.act(id);
    else if (act === 'task' && this.tasks && typeof this.tasks.act === 'function') {
      // a claim's words (the thanks and the pay, or where a notice from another board is paid) are the keeper's
      // a notice taken is torn off its pin and flies to the pile (tasks.js ripStart/ripEnd: only the look, the take is done at once)
      const rip = typeof this.tasks.ripStart === 'function' ? this.tasks.ripStart(this.el.panel, id) : null;
      const r = this.tasks.act(id, this.at.ep);
      if (r && r.words && /^(claim|give)/.test(String(id))) this.greeting = r.words;
      this.save(); this.render();
      if (rip) this.tasks.ripEnd(this.el.panel, rip);
    }
  }
  // (The season permit, its stamp and its date stepper stood here until the world cards of 2026-10-24: "what is the
  // stamp for at the counter, i thought we got rid of that. no permit". Home is the profile's; the season starts on
  // the title.)
  // The side map (the owner, 2026-10-31: "a small custom map that just shows the different outfitters that he could
  // take you to and the price for each"): where the truck goes from here, pencilled on the counter's own sheet
  // (counter-map.js), in the column the notices done had ("I don't know why there's like a little left-hand side that
  // has the notices that I can pick up. I don't like that": the board pays them now, tasks.js boardSection).
  mapSection(a) {
    const n = this.rides && typeof this.rides.offer === 'function' ? this.rides.offer(a.ep).length : 0;
    return `<section class="sidemap" aria-labelledby="sidemap-h">
      <div class="top"><h3 id="sidemap-h">Where the truck goes</h3><span class="sum">${n ? `${n} entry points from ${a.ep}` : `from entry point ${a.ep}`}</span></div>
      <div class="sheet"><canvas aria-label="A sketch map of the outfitters the truck goes to, with each one's entry point number and fare"></canvas><i class="tape l" aria-hidden="true"></i><i class="tape r" aria-hidden="true"></i></div>
      <p class="key"><span class="k here"><i>★</i>you are here</span><span class="k known"><i>${a.ep}</i>outfitter</span><span class="k th"><i>${a.ep}</i>trailhead</span><span class="k fare"><b>$</b>the fare</span></p>
    </section>`;
  }
  // draws the side map into the open counter, and ties its rings to the rides' rows (a hover lights both; a ring
  // clicked brings its row up)
  drawSideMap() {
    const el = this.el.panel, cv = el && el.querySelector('.sidemap canvas'), a = this.at;
    if (!cv || !a || !this.rides || typeof this.rides.offer !== 'function') return;
    const money = this.money, sandbox = this.sandbox;
    const rows = this.rides.offer(a.ep).map((r) => { const l = this.entry(r.ep) || {}; return { ep: r.ep, x: l.x, z: l.z, price: r.price, unknown: r.unknown, outfitter: r.outfitter !== false, short: !sandbox && r.price > money }; });
    const here = { ep: a.ep, x: a.x, z: a.z };
    const draw = () => {
      if (!this.open || this.tab !== 'counter' || !cv.isConnected) return;
      let pma = null; try { pma = typeof this.pmaFocusFn === 'function' ? this.pmaFocusFn() : null; } catch { pma = null; } // r2: the primitive area chosen at the desk
      this.mapMarks = drawCounterMap(cv, { world: this.world, here, rows, hot: this.mapHot, sandbox, onReady: draw, pma });
      for (const li of el.querySelectorAll('.rides li[data-ep]')) li.classList.toggle('hot', Number(li.dataset.ep) === this.mapHot);
    };
    const hover = (ep) => { if (ep !== this.mapHot) { this.mapHot = ep; draw(); } };
    const at = (e) => { const b = cv.getBoundingClientRect(); return markerAt(this.mapMarks, e.clientX - b.left, e.clientY - b.top); };
    cv.addEventListener('mousemove', (e) => { const ep = at(e); cv.style.cursor = ep ? 'pointer' : ''; hover(ep); });
    cv.addEventListener('mouseleave', () => hover(null));
    cv.addEventListener('click', (e) => {
      const ep = at(e), li = ep ? el.querySelector(`.rides li[data-ep="${ep}"]`) : null; if (!li) return;
      li.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      li.classList.remove('flash'); void li.offsetWidth; li.classList.add('flash');
    });
    for (const li of el.querySelectorAll('.rides li[data-ep]')) {
      li.addEventListener('mouseenter', () => hover(Number(li.dataset.ep)));
      li.addEventListener('mouseleave', () => hover(null));
    }
    draw();
    if (typeof document !== 'undefined' && document.fonts && document.fonts.status !== 'loaded') document.fonts.ready.then(draw); // the pencil's font, once it is in
  }
  // the keeper's word (an insider's, to a friend of the house), a bunk tonight, and the rides up the road (rides.js);
  // at a landing whose store is not built yet, its shelves from here
  deskSection(a) {
    const shop = this.shop, pr = this.profile;
    const op = shop ? shop.outfitterProfile(a.ep) : null, keeper = op && op.keeper, rep = pr ? pr.outfitter(a.ep).rep : 0;
    let hint = '';
    // a friend of the house (standing 2) hears one of the keeper's insider words a day, and it goes on the map (toldHints)
    if (keeper && typeof keeper.hint === 'function' && rep >= 2) {
      const hs = op.hints || [], n = hs.length ? this.day.doy % hs.length : 0;
      try { hint = keeper.hint(this.world, op, n) || ''; } catch { hint = ''; }
    }
    const parts = [];
    const desks = this.desksHtml(a);
    // the map is pencilled only when you ask (the owner, 2026-10-31: "be a little more deliberate about it ... you
    // deliberately ask him to give you some information"): the word, and a stamp to have it marked on your map
    if (hint) {
      const marked = this.isHeard(a.ep, hint), ringed = this.hintAt(a.ep, hint);
      parts.push(`<div class="word"><div class="lab">${esc(keeper.name || 'The keeper')}, leaning on the counter</div><p>“${esc(hint)}”</p>${ringed ? (marked ? '<p class="soft">✓ pencilled on your map</p>' : '<button type="button" class="stamp small outline" data-act="mark">Mark it on my map</button>') : ''}</div>`);
      this.deskHint = hint;
    }
    if (desks) parts.push(desks);
    const price = this.sandbox ? 0 : shop ? shop.price('bunk', a.ep) : 8, short = !this.sandbox && price > this.money;
    // (worded for the hour: in the morning, after an evacuation's wake, the bunk is the day slept off: polish B)
    const morning = this.day.hours < 12;
    parts.push(`<div class="bunkrow${short ? ' dear' : ''}"><div><b>${morning ? 'The bunk, and the day off' : 'A bunk tonight'}</b> · <span class="soft">${morning ? 'sleep it off: a real bed, soup, and up at seven tomorrow' : 'a real bed, soup and breakfast, up at seven'}</span></div>
      <button type="button" class="stamp small outline" data-act="bunk" ${short ? 'disabled' : ''}>${price ? `$${price}` : 'Free'}</button></div>`);
    if (!this.layout(a.ep)) parts.push(`<div class="shelfbtns"><p class="soft">The store is being opened up: the shelves and the board are here for now.</p>${SHELVES.map((k) => `<button type="button" class="stamp small outline" data-act="shelf" data-id="${k.kind}">${esc(k.name)}</button>`).join('')}<button type="button" class="stamp small outline" data-act="tab" data-id="board">The board</button></div>`);
    const rides = this.rides && typeof this.rides.section === 'function' ? this.rides.section(a.ep) : '';
    return `<section class="desk" aria-labelledby="desk-h">
      <div class="top"><h3 id="desk-h">At the counter</h3></div>
      ${parts.join('')}${this.claimsSection(a) || ''}${rides || ''}
    </section>`;
  }
  // The counter's other business, on the rate card under the bunk: nothing of its own now (the notices are paid at the
  // board), but main.js adds the uniques' "Report a find" here
  claimsSection() { return ''; }
  // The game-loop round: other streams' desks at the counter (the permit desk, the onboarding, the tally): each a
  // section of HTML for the landing (html(landing) → string) in `order` (lower first, all above the bunk), and its
  // buttons' acts (act(act, id, ev) → truthy when it was its own). Returns a function that takes the desk away.
  addDesk(key, { order = 50, html = null, act = null } = {}) {
    this.desks.set(String(key), { key: String(key), order: Number(order) || 0, html, act });
    if (this.open) this.render();
    return () => { this.desks.delete(String(key)); if (this.open) this.render(); };
  }
  desksHtml(a) {
    return [...this.desks.values()].sort((x, y) => x.order - y.order).map((d) => {
      try { return typeof d.html === 'function' ? d.html(a) || '' : ''; } catch (e) { console.warn('outfitter desk', d.key, e); return ''; }
    }).join('');
  }
  // a keeper's words that are one of their insider hints (outfitters.js profile.hints) are told: the map rings the water
  heard(ep, words) {
    const pr = this.profile, op = this.shop ? this.shop.outfitterProfile(ep) : null;
    if (!pr || typeof pr.tell !== 'function' || !op || !Array.isArray(op.hints) || !words) return;
    const i = op.hints.findIndex((h) => h && h.text === words);
    if (i >= 0) pr.tell(ep, i);
  }
  // whether a keeper's words are one of their hints with water to ring, and whether it is on your map already
  hintAt(ep, words) { const op = this.shop ? this.shop.outfitterProfile(ep) : null, h = op && Array.isArray(op.hints) ? op.hints.find((q) => q && q.text === words) : null; return !!(h && Number.isFinite(h.x)); }
  isHeard(ep, words) {
    const pr = this.profile, op = this.shop ? this.shop.outfitterProfile(ep) : null;
    if (!pr || !Array.isArray(pr.told) || !op || !Array.isArray(op.hints)) return false;
    const i = op.hints.findIndex((h) => h && h.text === words);
    return i >= 0 && pr.told.some((k) => String(k) === `${ep}:${i}`);
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
  // the board: the tasks' own section (tasks.js), or a quiet card until there is one
  boardSection(a) {
    const t = this.tasks;
    if (t && typeof t.boardSection === 'function') return t.boardSection(a.ep);
    return '<section class="board" aria-labelledby="board-h"><div class="top"><h3 id="board-h">The board</h3><span class="sum">adverts from this outfitter</span></div><div class="cards"><p class="muted">The board is being written up.</p></div></section>';
  }
  // The paper: at the counter, the side map on the left (where the truck goes, and the fares), the keeper's desk (a
  // bunk, the rides) on the right, and nothing else (no permit, no stamp, no notices: the owner, 2026-10-31, "really
  // what he's offering is a bunk and a ride"); at the cork board, the board and nothing else (it pays the notices)
  render() {
    if (!this.open || !this.el.panel) return;
    if (this.tab === 'pickup') return this.renderPickup();
    const a = this.at, board = this.tab === 'board';
    const lakeName = this.lakeOf(a), area = areaOf(a.ep), op = this.shop ? this.shop.outfitterProfile(a.ep) : null;
    const purse = this.profile ? `<div class="purse"><span class="sc">In hand</span><b>$${this.money}</b></div>` : '';
    const was = this.el.panel.querySelector('.desk, .col, .cards'), scroll = was ? was.scrollTop : 0, wasCls = was ? was.className : '';
    // the board's two panes keep where they were scrolled to (tasks.js: the cork and the pile)
    const panes = board ? ['.board .notices', '.board .pile'].map((q) => { const n = this.el.panel.querySelector(q); return n ? n.scrollTop : 0; }) : null;
    const leave = this.inStore ? 'Back to the store · E' : 'Back to the water · E';
    const receipt = this.receipt ? `<div class="receipt pencil${this.receipt.ok ? '' : ' no'}">${esc(this.receipt.text)}</div>` : '';
    const kicker = `Entry point ${a.ep} · ${esc(lakeName)}${area ? ` · ${area}` : ''}${op && (op.kindWords || op.kind) ? ` · ${esc(op.kindWords || op.kind)}` : ''}`;
    const lede = board
      ? `<div class="lede"><div class="sc kicker">${esc(a.name)} · ${kicker}</div><h2>The board</h2><div class="say">Notices pinned up by the door. Take one on, and come back to this board when it’s done: it’s paid here.</div></div>`
      : `<div class="lede"><div class="sc kicker">${kicker}</div><h2>${esc(a.name)}</h2><div class="say">“${esc(this.greeting)}”${this.who ? ` <span class="who">— ${esc(this.who)}</span>` : ''}</div></div>`;
    const body = board ? `<div class="counter one">${this.boardSection(a)}</div>`
      : `<div class="counter two">${this.mapSection(a)}${this.deskSection(a)}</div>`;
    const toCounter = board && !this.layout(a.ep) ? '<button type="button" class="stamp outline" data-act="tab" data-id="counter">The counter</button>' : '';
    this.el.panel.classList.toggle('simple', !board);
    // (store.css: the counter is a sheet on the counter top, the board a cork board)
    this.el.panel.classList.toggle('st-counter', !board); this.el.panel.classList.toggle('st-board', board);
    this.el.panel.innerHTML = `<header>${lede}${purse}${toCounter}<button type="button" class="stamp outline" data-act="close" aria-label="Leave (E or Esc)">${leave}</button></header>${receipt}${body}`;
    const now = this.el.panel.querySelector('.desk, .col, .cards');
    if (scroll && now && now.className === wasCls) now.scrollTop = scroll;
    if (panes) ['.board .notices', '.board .pile'].forEach((q, i) => { const n = this.el.panel.querySelector(q); if (n && panes[i]) n.scrollTop = panes[i]; });
    if (!board) this.drawSideMap();
  }

  renderPickup() {
    const a = this.at, lake = this.lakeOf(a), purse = this.profile ? `<div class="purse"><span class="sc">In hand</span><b>$${this.money}</b></div>` : '';
    const receipt = this.receipt ? `<div class="receipt pencil${this.receipt.ok ? '' : ' no'}">${esc(this.receipt.text)}</div>` : '';
    const lede = `<div class="lede"><div class="sc kicker">Entry point ${a.ep} · ${esc(lake)} · ${esc(roadOf(a.ep))}</div><h2>${esc(a.name)}</h2><div class="say">A brown sign, a permit box and a gravel lot. The outfitters’ numbers are on a card in the box.</div></div>`;
    this.el.panel.classList.add('simple', 'st-counter'); this.el.panel.classList.remove('st-board');
    this.el.panel.innerHTML = `<header>${lede}${purse}<button type="button" class="stamp outline" data-act="close" aria-label="Leave (E or Esc)">Back to the lot · E</button></header>${receipt}<div class="counter one"><section class="desk pickup">${this.rides.pickupSection(a.ep)}</section></div>`;
  }

  // --- the trip ----------------------------------------------------------------------------------------------
  // Push off (updateTrip, as you paddle away from a landing): the trip is under way. The season's first trip puts you
  // in rested, as a new season does; later trips leave the energy and the needs as they are: a landing is not a refill.
  start() {
    const a = this.at || this.port || this.nearest(this.player.x, this.player.z).l;
    const d = this.day, core = this.core, adv = this.adventure, pr = this.profile;
    const first = !(core && core.state && core.state.id); // the season's first trip (a new season's core has no id yet)
    const food = this.energy ? this.energy.food : 0;
    this.trip = { active: true, ep: a.ep, days: this.foodRoom, started: d.clock, startAbs: d.doy * 24 + d.hours, startYear: d.year, startDoy: d.doy, startHours: d.hours, turnedIn: 0, fromName: this.lakeOf(a), away: false };
    if (first && this.energy) this.energy.value = 1;
    if (this.stats) this.stats.reset();
    if (core) core.start({ ep: a.ep, foodDays: food, canoe: pr ? pr.kit.canoe : 'aluminium', fresh: first });
    // the outfitter that saw you off: its own landing walked to, else the one whose truck brought you (rides.js sets
    // via), else your home; a pickup back from its reach is on it (rides.js pickups)
    if (isOutfitter(a.ep)) this.via = a.ep;
    else if (this.via == null) this.via = pr ? pr.home : null;
    if (core && core.state) core.state.via = this.via;
    this.summary = null; this.port = null;
    if (this.open) this.hide();
    // the push-off, as a title over the water
    const lake = this.lakeOf(a);
    if (core && adv) this.hud.showPlace(`${first ? 'The season begins' : 'Pushing off'} · ${a.name}`, lake, 'Come out at any entry point', 6); // (2026-10-31: no food or purse count: chatter)
    else if (core) this.hud.showPlace(`Sandbox · ${a.name}`, lake, 'No dates', 6);
    else this.hud.note(`${fmtDaysWords(food)} of food in the pack. Off you go.`);
    this.save();
  }
  // the food you can reach, in the inventory's words ("1 meal and 2 snacks"), else in days
  foodWords() { const inv = invModel(); if (inv && typeof inv.foodWords === 'function') { const w = inv.foodWords(), h = this.energy && this.energy.hungFood ? this.energy.hungFood().words : ''; if (h) return w === 'no food' ? h : `${w} · ${h}`; return w === 'no food' ? (this.energy && typeof this.energy.foodNearby === 'function' && this.energy.foodNearby() ? 'your food close by' : 'no food with you') : w; } return `${fmtDaysWords(this.energy ? this.energy.food : 0)} of food`; }
  // a night in the bunkhouse for its price (free in Sandbox)
  bunk() {
    const a = this.at, shop = this.shop; if (!a) return;
    const price = this.sandbox ? 0 : shop ? shop.price('bunk', a.ep) : 8;
    if (price && (!this.profile || !this.profile.spend(price, `a night in the bunkhouse at ${a.name}`))) { this.receipt = { text: `Not enough in hand: the bunk is $${price}.`, ok: false }; this.render(); return; }
    if (this.core) this.core.log('bunk', { ep: a.ep, price });
    this.night(a, `A night in a real bed${price ? ` for $${price}` : ''}. You wake at seven, rested and fed.`);
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
        en.sleep(1, Math.max(7, hours), { bag: true }); en.value = 1; // (a real bed: the bag in your pack or not)
        // the lodge feeds you: the jump crosses no dawn or dusk on the meal clock, and breakfast is had
        if ('lastHours' in en) en.lastHours = d.hours;
        if ('lastMealAbs' in en) { en.lastMealAbs = en.now; en.lastMealKind = 'hot'; }
        try { if (en.needs && typeof en.needs === 'object') { en.needs.food = 1; en.needs.water = 1; en.needs.warmth = 1; } } catch { /* the needs are energy.js's own */ }
        if (typeof en.fill === 'function') en.fill(2, 0);
      }
      if (this.core && this.core.state) this.core.state.wet = false; // the gear dries by the stove overnight (polish B)
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
    if (home != null && !isOutfitter(home)) home = hostOf(home, this.world) ?? home; // (the game-loop round: a home is an outfitter)
    if (core) core.abandon();
    if (this.profile) this.profile.begin({ home, mode });
    if (core) core.reset(mode); // after the profile: the packs and the canoe are the new season's
    if (this.open) this.hide();
    this.trip = { active: false, ep: null, days: this.foodRoom, started: null, startAbs: 0, turnedIn: 0 };
    this.summary = null; this.evac = null; this.bunking = false; this.greeted = {}; this.arrival = null; this.port = null; this.docking = null;
    if (this.visit) this.endVisit();
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
    const home = this.nearest(this.player.x, this.player.z).l.ep; // (the outfitters only)
    this.newSeason(home, mode || (this.core ? this.core.mode : 'adventure'));
  }

  // --- the evacuation (trip.js runs it; these are the counter's side) -------------------------------------------
  // at full dark: the trip is over (the tasks are kept)
  evacuated() {
    this.trip = { active: false, ep: null, days: this.foodRoom, started: null, startAbs: 0, turnedIn: 0 };
    this.summary = null;
    if (this.open) this.hide();
    this.save();
  }
  // faded back: in at the store's door at the landing you woke at, and its counter (from the water where it has none)
  afterEvac(to) { if (to) { this.lineKind = 'after'; if (this.layout(to.ep)) this.arrival = { why: 'evac', ep: to.ep, t: 0, pending: true }; else this.pendingShow = true; } }
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
    if (this.via != null) data.via = this.via; // (the game-loop round: who saw you off, for the pickups)
    // in or about a store: where on its floor, so a reload puts you back there (boot, updateArrival)
    const v = this.visit;
    if (v && p.onFoot) data.visit = { ep: v.ep, inside: !!v.inside, x: +p.x.toFixed(2), z: +p.z.toFixed(2), heading: +p.heading.toFixed(3), switched: !!v.switched };
    const f = p.fishing;
    if (f && Array.isArray(f.stringer)) data.stringer = f.stringer.map((s) => ({ species: s.species, length: s.length })); // the fish kept for supper
    try { kv.setItem(SAVE_KEY, JSON.stringify(data)); } catch { /* storage full or private mode */ }
  }
  load() {
    try { const s = kv.getItem(SAVE_KEY); return s ? JSON.parse(s) : null; } catch { return null; }
  }
  // On load: resume a trip where it was left, or open the counter at the landing. A document without a trip core
  // is from before it and comes back as Sandbox, and an older core's permit is dropped (trip.js). The food
  // in the pack is yours between trips too.
  async boot() {
    const d = this.load(), pr = this.profile;
    if (d) migrateDoc(d);
    if (d && d.via != null) this.via = Number(d.via);
    if (d && d.tasks && this.tasks) this.tasks.restore(d.tasks);
    if (d && this.core) this.core.restoreFrom(d);
    if (d && d.energy) this.energy.restore(d.energy);
    const moved = pr && pr.migrated;
    if (moved) pr.forgetMigration();
    // the page went away in a store: back on its floor once it is built (updateArrival)
    // (the game-loop round: a visit to a store that is no more: in at the outfitter that serves its landing now)
    if (d && d.visit && !isOutfitter(d.visit.ep) && !(d.trip && d.trip.active)) {
      const h = hostOf(d.visit.ep, this.world), to = h != null ? this.landing(h) : null;
      if (to && this.onTeleport) {
        const was = this.entry(d.visit.ep);
        await this.onTeleport(to.x, to.z);
        this.lineKind = 'welcome';
        this.arrival = { why: 'season', ep: to.ep, t: 0 };
        this.hud.note(`The store at ${was ? was.place : 'that landing'} is shut now. ${to.name} serves it: you’re there.`, 8);
        return;
      }
    }
    const vis = d && d.visit && this.landing(d.visit.ep) && this.distTo(this.landing(d.visit.ep), this.player.x, this.player.z) < ARRIVAL_FAR ? d.visit : null;
    if (vis) this.arrival = { why: 'reload', ep: vis.ep, x: vis.x, z: vis.z, heading: vis.heading, inside: vis.inside, switched: vis.switched, t: 0, pending: false };
    if (d && d.trip && d.trip.active) {
      this.trip = { ...this.trip, ...d.trip, days: this.foodRoom };
      const f = this.player.fishing;
      if (f && Array.isArray(d.stringer) && !f.stringer.length) for (const s of d.stringer) if (s && s.species) f.stringer.push({ species: s.species, length: +s.length || 0 });
      this.pendingShow = false;
      if (d.pos && Math.hypot(d.pos.x - this.player.x, d.pos.z - this.player.z) > 40 && this.onTeleport) await this.onTeleport(d.pos.x, d.pos.z);
      const core = this.core, dw = core && core.active ? core.dayWords() : '';
      if (moved === 'v2') this.hud.note('An older trip, back as an open one: no dates, no exit and no permit. Come in when you like; any counter sells food.', 8);
      else if (moved === 'v1') this.hud.note('An older trip, back as Sandbox: the same lakes with no limits.', 7);
      else this.hud.note(`${vis ? 'Back at the outfitter' : this.player.mode === 'paddle' ? 'Back on the water' : 'Back ashore'}${dw ? `, ${dw}` : ''}.`); // (2026-10-31: no food, energy or purse in the line: the bar and the book show them)
      return;
    }
    this.pendingShow = false;
    if (vis || this.arrival) return; // back on the store's floor once it is built; a season begun goes in at the door
    // between trips anywhere else: the landing nearest is the one the next trip pushes off from (no paper pops up: the
    // counter is in the store, and the trip is not its business)
    const n = this.nearestEntry(this.player.x, this.player.z);
    if (n) this.port = n.e;
  }
}

// --- the game-loop round's migrations ------------------------------------------------------------------------------
// A season from before the fourteen outfitters: home at a store that is no more goes to the outfitter that serves its
// landing (outfitters.js hostOf), the outfitters known go the same way (once each), the standing with a closed store is
// the host's (the better of the two), and the keepers' insider words told at a closed counter are forgotten. Once.
function migrateProfile(pr, world) {
  const s = pr && pr.s; if (!s || (s.outfittersV || 0) >= SET_V) return false;
  const host = (ep) => (ep == null || isOutfitter(ep) ? ep : hostOf(ep, world) ?? ep);
  let moved = 0;
  if (s.home != null && !isOutfitter(s.home)) { s.home = host(s.home); moved++; }
  if (Array.isArray(s.known)) { const k = [...new Set(s.known.map((e) => host(Number(e))).filter((e) => e != null))]; if (k.length !== s.known.length || k.some((e, i) => e !== s.known[i])) moved++; s.known = k; }
  if (s.rep && typeof s.rep === 'object') {
    const rep = {};
    for (const [k, v] of Object.entries(s.rep)) { const h = host(Number(k)); rep[h] = Math.max(rep[h] || 0, Number(v) || 0); }
    s.rep = rep;
  }
  if (Array.isArray(s.told)) s.told = s.told.filter((k) => isOutfitter(Number(String(k).split(':')[0])));
  s.outfittersV = SET_V;
  if (typeof pr.write === 'function') pr.write();
  return moved > 0;
}
// the outfitter's document: the boards of the closed stores come down (the notices on them, not the ones taken: a notice
// under way is still paid, stream D's settle)
function migrateDoc(d) {
  const t = d && d.tasks; if (!t) return;
  if (t.boards && typeof t.boards === 'object') for (const k of Object.keys(t.boards)) if (!isOutfitter(Number(k))) delete t.boards[k];
  if (Array.isArray(t.ads)) t.ads = t.ads.filter((a) => a && (isOutfitter(Number(a.from)) || a.status === 'open' || a.status === 'done' || a.npc));
}

function fmtDaysWords(d) {
  if (d <= 0) return 'no days';
  if (d < 0.5) return 'less than a day';
  const whole = Math.floor(d + 1e-6), half = d - whole >= 0.5 - 1e-6 && d - whole < 0.99;
  const n = half ? `${whole || ''}½` : String(Math.round(d));
  return `${n} day${n === '1' || n === '½' ? '' : 's'}`;
}
// A hotspot box (props.js storeLayout().hot: centre x, y, z, half sizes hx along its heading, hy up, hz across) in its
// own frame: forward = (cos h, -sin h) as player.heading's, across = (sin h, cos h)
function local(h, x, z) { const c = Math.cos(h.heading), s = Math.sin(h.heading), dx = x - h.x, dz = z - h.z; return [dx * c - dz * s, dx * s + dz * c]; }
// metres from (x, z) to the box's nearest side, on the ground
function reachTo(h, x, z) { const [a, b] = local(h, x, z); return Math.hypot(Math.max(0, Math.abs(a) - h.hx), Math.max(0, Math.abs(b) - h.hz)); }
// where a ray ({ origin, direction }, unit) enters the box: { t, miss: 0 } or null (the slabs)
function boxHit(ray, h) {
  const o = ray.origin, d = ray.direction, c = Math.cos(h.heading), s = Math.sin(h.heading);
  const [oa, ob] = local(h, o.x, o.z), da = d.x * c - d.z * s, db = d.x * s + d.z * c, oy = o.y - h.y;
  let t0 = 0, t1 = Infinity;
  for (const [p, q, e] of [[oa, da, h.hx], [oy, d.y, h.hy], [ob, db, h.hz]]) {
    if (Math.abs(q) < 1e-9) { if (Math.abs(p) > e) return null; continue; }
    let u = (-e - p) / q, v = (e - p) / q; if (u > v) [u, v] = [v, u];
    t0 = Math.max(t0, u); t1 = Math.min(t1, v);
    if (t0 > t1) return null;
  }
  return { t: t0, miss: 0 };
}

// the counter's two columns, the side map and the desk (the counter's own look is hud.css's and store.css's; tasks.js adds the board's,
// rides.js the rides')
const CSS = `
#outfitter { gap: 16px; }
#outfitter.simple { width: min(1020px, 94vw); height: auto; max-height: min(698px, 90vh); }
#outfitter > .receipt { flex: none; margin-top: -8px; font-size: 19px; line-height: 1.1; }
#outfitter > .receipt.no { color: var(--map-red); }
#outfitter .counter.one { grid-template-columns: minmax(0, 1fr); }
#outfitter .counter.two { grid-template-columns: minmax(0, 0.95fr) minmax(0, 1.05fr); }
#outfitter .desk .shelfbtns { display: flex; flex-wrap: wrap; gap: 6px; }
#outfitter .desk .shelfbtns p { flex: 1 0 100%; margin: 0; }
#outfitter .desk .shelfbtns .stamp { font-size: 10.5px; padding: 4px 9px; }
#outfitter .say .who { font-style: normal; font: 500 19px/1 var(--pencil-font); color: var(--pencil); margin-left: 4px; }
#outfitter .desk { display: flex; flex-direction: column; gap: 14px; min-height: 0; overflow: auto; scrollbar-width: thin; padding-right: 4px; }
#outfitter .desk .top { border-bottom: 1px solid var(--edge); padding-bottom: 8px; flex: none; }
#outfitter .desk .word p { font-size: 16px; line-height: 1.45; font-style: italic; }
#outfitter .desk .word p.soft, #outfitter .desk .soft { color: var(--ink-soft); font-style: italic; }
#outfitter .desk .bunkrow { display: flex; align-items: center; gap: 12px; font-size: 15px; border-top: 1px solid var(--edge); padding-top: 12px; }
#outfitter .desk .top + .bunkrow { border-top: none; padding-top: 0; }
#outfitter .desk .bunkrow > div { flex: 1 1 auto; }
#outfitter .dear { opacity: .55; }
#outfitter .desk p.soft { font-size: 15px; }
`;
let cssIn = false;
function injectCss() {
  if (cssIn || typeof document === 'undefined') return;
  cssIn = true;
  const s = document.createElement('style'); s.id = 'outfitter-shop'; s.textContent = CSS;
  document.head.appendChild(s);
}
