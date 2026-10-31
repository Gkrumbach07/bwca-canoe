// Teaching moments (fb5 E, the owner's third round of 2026-10-25), grown from fb4 D's onboarding hints.
//
// The owner: "complete new user to this entire way of life, hasn't done this in real life, say they get to a campsite, or
// how do they even know to get to a campsite? … the day is about to come to a close … maybe a tooltip saying, hey, you
// should start to look for a campsite. Press M on the map to locate one. These like one-time things, or every once in a
// while when it's starting to get dark, or you're starting to get hungry … All these like first-time things, you need to
// teach the user how to deal with each situation … the fire went out, but there's still hot coals. Does the user know
// that they can go get a stick and put it on the fire? I don't think all this information needs to be written down
// somewhere all the time. It's learned behavior."
//
// The rules (the round's brief): a thing is taught the first time it matters, in one short line with its key; after that
// it is learned and the line shrinks to a word or goes away; if the need persists or worsens for a while, the full line
// comes back once. At most one line on the screen at a time.
//
// A moment (MOMENTS below): { id, prio, recur, text, short?, card?, stuck?, learn?, keyed? }
//   prio    DANGER (the bar nearly spent) > BODY (hungry, thirsty, cold, wet, tired) > TEACH (everything else); of the
//           moments due at once the highest goes up, the table's order breaking a tie
//   recur   'once'  shown once a season; with `stuck` (real seconds) the full line once more if it still applies that
//                   long after it was shown
//           'daily' once a game day: the full line the first day, the short one after
//           'while' an episode while it applies (the trigger's own hysteresis): the full line the first time ever, the
//                   short one at the start of each later episode; within one, the short line again only when it has
//                   worsened (the trigger's level down by WORSE, at least COOL game hours on), and the full line once
//                   more if it has lasted STUCK_H game hours
//   text    the first-time line, ≤ 80 characters, its keys in braces: "Find a campsite before dark: {M} shows them."
//   short   the learned line (null: nothing once learned)
//   card    the card it may show over ('fire': the fire's card); every other moment waits while a paper is up
//   learn   the key (a concept: 'map', 'lamp' …) whose use counts as learned: a keyed moment (keyed: true) is then never
//           shown; any other moment shows its short line from the first time
// The triggers are this class's due(id, rec): false, or true, or a level (lower is worse, for 'while'), or { lv, text,
// short } where the words depend on the moment (the evening's nearest campsite, the thirst with the bottle treating).
// Events (the fire's 'lit', 'low', 'coals', 'ready', 'wet': stream A's fires.on) are held PEND seconds for their moment.
//
// The season remembers (the profile's `onboard`, which a new season starts empty): per moment { n (times shown), day
// (the game day last shown), ep (an episode under way), lv, at (game hours), again, used }. An old save's 'shown' or
// 'used' strings read as shown once. A reload repeats nothing: an episode under way stays one.
//
// The hint card (#hint, bottom centre above the action line, hud.css) holds a moment for SHOW seconds, a short gap
// between two (a longer one between two teaching lines). Settings › HUD › Key hints off silences the teaching lines;
// the body's and the danger's still show.
//
// A greyed verb's next step (decision 6, the owner: "the formulas should not always be there"): the first time E or Q is
// pressed on it (pointer.js), or a card or the book asks (hints.next(id, text)), its `next` shows here as a teaching line;
// after that only its why.
//
// (One speed, 2026-10-26: the pace toast and the 1 2 3 moment are gone with the keys; the clock is everyone's, pace.js.)
//
//   const hints = new Hints({ player, hud, day, profile, pointer, outfitter, inventory, lamp, chase, title, talk, camp,
//     photo, veil, settings, fishing })
//   hints.attach({ energy, weather, trip, fires, cards, packs, nearby, world })   (main.js fb5 E; each read when wanted)
//   hints.update(dt, shell)     each frame, after the camera (main.js runs it after the barks)
//   hints.next(id, text, { card }) → bool: a greyed verb's next step, the first time only
//   hints.handles(id) → bool: the moments say this one (energy.js's cues)
//   hints.stats(), hints.forget(), hints.fire(id)   for the console and the tests
import { esc, compassLong } from './hud.js';
import { sheets } from './sheets.js';
import { campKey } from './camp.js';
import { itemDef } from './items.js';

const SHOW = 7;        // seconds a moment is up
const DODGE_EVERY = 0.15; // seconds between looks at the notes the card keeps clear of (dodge)
const GAP = 3;         // seconds between two
const TEACH_GAP = 16;  // seconds from one teaching line to the next (its SHOW, then quiet)
const PEND = 25;       // seconds an event waits for its moment
const EVAL = 0.25;     // seconds between two looks at the triggers
const WALK = 6;        // seconds walking before Shift is offered
const ON_FOOT = 1;     // seconds on foot before V is offered (not the frame you step out)
const UNDER_WAY = 3;   // seconds under way on a new trip before the first word of it
const STILL_AFLOAT = 6; // seconds sitting still afloat before F is offered
const GREY_LOOK = 2.5; // seconds the dot rests on a greyed verb before the right-click is offered
const DARK = -3;       // the sun's elevation (degrees) under which it is dark (camp.js dark)
const SHELF_REACH = 1.6; // metres from a shelf's box (outfitter.js REACH)
const SHELVES = new Set(['food', 'tackle', 'gear', 'wall']); // the store's hotspots that are shelves (outfitter.js HOT)
const RING = 3.5;      // metres from a ring within which its moments apply
const SITE = 25;       // metres from a site's ring that are the site (camp.js AREA_R)
const LOW = 0.3, CLEAR = 0.42; // a need under LOW starts an episode, over CLEAR ends it (energy.js LOW)
const WORSE = 0.12;    // a level this much lower within an episode is worse
const COOL = 1.5;      // game hours before a worse line
const STUCK_H = 3;     // game hours an episode lasts before its full line comes back once
export const DANGER = 3, BODY = 2, TEACH = 1;

// in the order they are offered at the same priority
export const MOMENTS = [
  // the danger
  { id: 'spent', prio: DANGER, recur: 'while', text: 'Spent. Eat, drink or rest now, or someone comes out for you.', short: 'Spent. Eat, drink or rest now.' },
  { id: 'nearly', prio: DANGER, recur: 'while', text: 'Nearly spent. Rest, eat or drink soon, or make for a campsite.', short: 'Nearly spent.' },
  { id: 'donein', prio: DANGER, recur: 'while', text: 'Done in. Only a night’s sleep brings you back now.', short: 'Done in: sleep.' },
  { id: 'nofood', prio: DANGER, recur: 'daily', text: 'No food, and not much left in you. Make for an outfitter.', short: 'No food: make for an outfitter.' },
  // the body
  { id: 'bottle', prio: BODY, recur: 'while', text: 'The bottle’s empty. Fill it at the water: face the shore, {E}.', short: 'Bottle empty: {E} at the water’s edge.' },
  { id: 'thirsty', prio: BODY, recur: 'while', text: 'Thirsty. Drink from your bottle {I}.', short: 'Thirsty. {I}' },
  { id: 'hungry', prio: BODY, recur: 'while', text: 'Hungry. Eat from your pack {I}.', short: 'Hungry. {I}' },
  { id: 'cold', prio: BODY, recur: 'while', text: 'Cold. A fire, dry clothes or the sleeping bag.', short: 'Cold.' },
  { id: 'wet', prio: BODY, recur: 'while', text: 'Soaked. Change clothes {I} or stand by a fire.', short: 'Soaked. {I}' },
  { id: 'tired', prio: BODY, recur: 'while', text: 'Tired. Rest in the tent.', short: 'Tired.' },
  { id: 'treating', prio: BODY, recur: 'once', text: 'A tablet in: safe to drink in 30 min.' },
  // the day's end
  { id: 'start', prio: TEACH, recur: 'once', text: 'Paddle out, find a campsite for the night. {M} shows them.' },
  // (fb5 join: a new player left the store with no sheet, and M showed blank paper)
  { id: 'maps', prio: TEACH, recur: 'once', text: 'The map table sells the map of these lakes: {M} then shows the campsites.' },
  { id: 'evening', prio: TEACH, recur: 'daily', learn: 'map', text: 'Find a campsite before dark: {M} shows them.', short: 'Campsite before dark: {M}' },
  { id: 'dusk', prio: TEACH, recur: 'daily', text: 'Dark soon. Make camp.', short: 'Dark soon. Make camp.' },
  // the camp
  { id: 'site', prio: TEACH, recur: 'once', text: 'A campsite. Before dark: a fire, the tent, your food hung up.' },
  { id: 'bears', prio: TEACH, recur: 'daily', learn: 'hang', keyed: true, text: 'Bears: hang your food from a high limb before you sleep.', short: 'Hang the food before you sleep.' },
  { id: 'ringwood', prio: TEACH, recur: 'once', stuck: 45, text: 'Drop wood in the ring: {E} on it, then drag the wood in.' },
  { id: 'ringempty', prio: TEACH, recur: 'once', stuck: 50, text: 'Gather dead wood: branches and logs lie around the site.' },
  { id: 'lit', prio: TEACH, recur: 'once', card: 'fire', text: 'It caught. A pot on the grate, the food and its water in the pot: it cooks.' }, // (crafting, 2026-10-31: recipes.js)
  { id: 'cooked', prio: TEACH, recur: 'once', card: 'fire', text: 'Cooked: it is in the pot. Eat it from there, or take it out.' },
  { id: 'low', prio: TEACH, recur: 'once', card: 'fire', text: 'Burning low: add wood.' },
  { id: 'coals', prio: TEACH, recur: 'once', card: 'fire', stuck: 60, text: 'The coals are still hot: a dry branch brings it back.' },
  { id: 'wetwood', prio: TEACH, recur: 'once', card: 'fire', text: 'Wet wood won’t catch. Find dry pieces; wet ones dry by a fire.' },
  { id: 'tarpred', prio: TEACH, recur: 'once', text: 'Red: it can’t stand here. Between two trees it needs no poles.' },
  // the way
  { id: 'portage', prio: TEACH, recur: 'once', text: 'A portage. Land beside the sign, then {E} on the canoe to carry it over.' }, // (content join: E shoulders it at a trail head, the owner's call)
  { id: 'push', prio: TEACH, recur: 'once', learn: 'push', keyed: true, text: 'Beached. Hold {E} to push it off.' },
  { id: 'unload', prio: TEACH, recur: 'once', text: 'Unload the canoe to carry it: {E} on it, then Set everything out.' },
  // the rod
  { id: 'bait', prio: TEACH, recur: 'once', text: 'Bait: leeches from the bucket, within reach.' },
  { id: 'fish', prio: TEACH, recur: 'once', learn: 'fish', keyed: true, text: '{F} to fish.' },
  // the weather and the night
  { id: 'rain', prio: TEACH, recur: 'once', text: 'Rain. Gear left out gets wet; a tarp keeps it dry.' },
  { id: 'lamp', prio: TEACH, recur: 'daily', learn: 'lamp', keyed: true, text: 'Dark. {H} for your headlamp.', short: '{H} headlamp' },
  // the keys (fb4 D's hints)
  { id: 'grey', prio: TEACH, recur: 'once', learn: 'grey', keyed: true, text: '{right-click} a thing in the book to see why' },
  { id: 'shelf', prio: TEACH, recur: 'once', learn: 'shelf', keyed: true, text: '{E} look at the shelf' },
  { id: 'book', prio: TEACH, recur: 'once', learn: 'book', keyed: true, text: '{I} your pack and what’s around you' },
  { id: 'jog', prio: TEACH, recur: 'once', learn: 'jog', keyed: true, text: '{Shift} jog' },
  { id: 'view', prio: TEACH, recur: 'once', learn: 'view', keyed: true, text: '{V} change the view' },
];
const BY_ID = new Map(MOMENTS.map((m) => [m.id, m]));
// energy.js's cues (needNotes and the bar's words) that the moments say now
const CUES = new Set(['water', 'food', 'warmth', 'rest', 'dry', 'spent', 'nearly', 'donein', 'nofood', 'tablet']);
// the keys that teach a concept (before or after its moment)
const LEARNS = { ShiftLeft: 'jog', ShiftRight: 'jog', KeyV: 'view', KeyH: 'lamp', KeyI: 'book', KeyM: 'map', KeyF: 'fish' };
const FIRE_EVENTS = ['lit', 'low', 'coals', 'out', 'ready', 'wet'];
// a greyed verb's next step that a moment already teaches: not said again when the book opens (the content join: the
// unload moment, then "Unload it: Set everything out…" a second later)
const SAID_BY = { 'next:canoe:shoulder-it': 'unload' };

// metres from (x, z) to a store hotspot's box, on the ground (outfitter.js reachTo)
function reachTo(h, x, z) {
  const c = Math.cos(h.heading || 0), s = Math.sin(h.heading || 0), dx = x - h.x, dz = z - h.z;
  const a = dx * c - dz * s, b = dx * s + dz * c;
  return Math.hypot(Math.max(0, Math.abs(a) - (h.hx || 0)), Math.max(0, Math.abs(b) - (h.hz || 0)));
}
// a moment's words as the card's HTML: escaped, its {keys} as keys
export function momentHtml(text) {
  return esc(text).replace(/\{([^}]+)\}/g, (m, k) => `<kbd>${k}</kbd>`);
}
const plain = (text) => String(text || '').replace(/\{([^}]+)\}/g, '$1');

export class Hints {
  constructor(t) {
    this.t = t;
    this.cur = null;           // the moment up: { m, t, text, how }
    this.gapT = GAP;           // a little while after the game starts before the first
    this.lastPrio = 0;
    this.walkT = 0; this.paddleT = 0; this.footT = 0; this.wayT = 0; this.stillT = 0;
    this.evalT = 0; this.held = new Map(); // id → real seconds its trigger has held true since it was last shown
    this.pend = new Map();     // event moments waiting: id → { t (real s), data }
    this.clockT = 0;           // real seconds, for the events' ages
    this.dx = 0; this.dy = 0; this.dodgeT = 0; // the card moved clear of the notes (dodge), Air px
    this.log = [];             // what was shown and learnt, in order (the tests)
    const air = document.getElementById('air') || document.body;
    this.el = document.createElement('div'); this.el.id = 'hint'; this.el.className = 'fade'; this.el.setAttribute('aria-live', 'polite');
    air.append(this.el);
    // a key pressed before its moment: learnt (bubble phase on the window: a conversation's numbers and the title card's
    // keys are taken before they get here)
    window.addEventListener('keydown', (e) => {
      if (e.repeat || this.shell) return;
      const id = LEARNS[e.code]; if (!id) return;
      this.learn(id);
    });
    // a right-click in the book (or any paper): the greyed verb's why is found there
    document.addEventListener('contextmenu', (e) => { if (e.target && e.target.closest && e.target.closest('.paper, #journal, #card, #shelf')) this.learn('grey'); }, true);
  }
  // the other streams' things (main.js fb5 E), each read when it is wanted
  attach(o = {}) {
    Object.assign(this.t, o);
    const F = this.t.fires;
    if (F && typeof F.on === 'function' && !this.firesOn) {
      this.firesOn = true;
      for (const k of FIRE_EVENTS) { try { F.on(k, (ev) => this.fireEvent(k, ev)); } catch (e) { console.warn('hints: fires.on', k, e); } }
    }
    // stream D's tarp: the first time its ghost goes red, what it needs (its own first-time line when it is short)
    const T = this.ref('tarp');
    if (T && typeof T.on === 'function' && !this.tarpOn) {
      this.tarpOn = true;
      try { T.on('red', (info) => this.pend.set('tarpred', { t: this.clockT, data: info || {} })); } catch (e) { console.warn('hints: tarp.on', e); }
      try { T.on('disarmed', () => this.pend.delete('tarpred')); T.on('pitched', () => this.pend.delete('tarpred')); } catch { /* older tarp */ }
    }
    return this;
  }
  get g() { return (typeof window !== 'undefined' && window.__game) || {}; }
  ref(name) { return this.t[name] || this.g[name] || null; }

  // --- what the season remembers (the profile's `onboard`) ------------------------------------------------------------
  get store() {
    const pr = this.t.profile;
    if (!pr || !pr.s || !pr.started) return null;
    if (!pr.s.onboard || typeof pr.s.onboard !== 'object') pr.s.onboard = {};
    return pr.s.onboard;
  }
  rec(id) {
    const s = this.store; if (!s) return null;
    let r = s[id];
    if (typeof r === 'string') r = s[id] = { n: r === 'shown' ? 1 : 0, used: r === 'used' }; // fb4 D's
    if (!r || typeof r !== 'object') r = s[id] = { n: 0 };
    return r;
  }
  save() { try { this.t.profile.write(); } catch (e) { console.warn('hints: the profile', e); } }
  used(concept) { const s = this.store; const r = s && s[concept]; return !!(r && (r === 'used' || r.used)); }
  // a concept learnt (its key pressed, a push-off done, a barrel hung): its card up goes once it has been read
  learn(id) {
    if (this.cur && (this.cur.m.id === id || this.cur.m.learn === id)) { if (this.cur.t > 0.4) this.hide(); }
    const r = this.rec(id); if (!r || r.used) return;
    r.used = true; this.save();
    this.log.push({ id, how: 'used', at: this.clock() });
  }
  // the moments say these (energy.js asks before a word of its own)
  handles(id) { return CUES.has(id) && !!this.store && this.live; }

  // --- the fire's events (stream A: fires.on) -----------------------------------------------------------------------
  fireEvent(kind, ev) {
    const d = ev && typeof ev === 'object' ? ev : { key: ev };
    // (a word waiting about the fire as it was goes when it changes: no "It caught" over the coals)
    if (kind === 'coals' || kind === 'out') { this.pend.delete('lit'); this.pend.delete('low'); }
    if (kind === 'lit') { this.pend.delete('coals'); this.pend.delete('low'); }
    if (kind === 'lit') { if (d.quiet) return; if (!d.relit) this.pend.set('lit', { t: this.clockT, data: d }); return; }
    if (kind === 'ready') { this.pend.set('cooked', { t: this.clockT, data: d }); return; }
    if (kind === 'wet') { this.pend.set('wetwood', { t: this.clockT, data: d }); return; }
    if (kind === 'low' || kind === 'coals') this.pend.set(kind, { t: this.clockT, data: d });
  }
  pending(id) {
    const p = this.pend.get(id);
    if (!p) return null;
    if (this.clockT - p.t > PEND) { this.pend.delete(id); return null; }
    return p;
  }
  // without stream A's events: the ring you are at, watched (laid or cold → burning is lit; burning → coals; under 20
  // minutes of wood is low)
  watchFire(site) {
    const F = this.t.fires;
    if (!F || this.firesOn || !site || typeof F.state !== 'function') { this.ringSig = null; return; }
    const key = campKey(site), st = F.state(key), left = typeof F.left === 'function' ? F.left(key) : 1;
    const was = this.ringSig && this.ringSig.key === key ? this.ringSig : null;
    if (was) {
      if (st === 'burning' && was.st !== 'burning' && was.st !== 'coals') this.fireEvent('lit', { key });
      if (st === 'coals' && was.st === 'burning') this.fireEvent('coals', { key });
      if (st === 'burning' && left < 1 / 3 && was.left >= 1 / 3) this.fireEvent('low', { key, left });
    }
    this.ringSig = { key, st, left };
  }

  // --- the world as the triggers read it ----------------------------------------------------------------------------
  get live() { const e = this.t.energy; return !!(e && e.live); }
  get onTrip() { const tr = this.t.trip; return !!(tr && tr.active && tr.adventure); }
  get inside() { const o = this.t.outfitter; return !!(o && o.visit && o.visit.inside); }
  get atOutfitter() { const o = this.t.outfitter; return !!(o && o.visit); }
  get dark() { const d = this.t.day; return !!(d && d.elevation < DARK); }
  get stamp() { const d = this.t.day; return d ? d.year * 1000 + d.doy : 0; }
  get nowH() { const d = this.t.day; return d ? d.doy * 24 + d.hours : 0; }
  clock() { const d = this.t.day; if (!d) return ''; const h = Math.floor(d.hours), m = Math.floor((d.hours - h) * 60); return `d${d.doy} ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`; }
  // the campsite you stand at on foot (free or yours), with its ring and how far it is
  siteHere() {
    const p = this.t.player, c = this.t.camp;
    if (!p || p.mode !== 'walk' || !c || typeof c.nearestSite !== 'function') return null;
    const s = c.nearestSite(p.x, p.z, SITE, true);
    if (!s || !s.layout || !s.layout.fire) return null;
    const h = c.registry && c.registry.holder ? c.registry.holder(campKey(s)) : null;
    if (h && h !== 'player') return null;
    const f = s.layout.fire;
    return { site: s, key: campKey(s), ringD: Math.hypot(f.x - p.x, f.z - p.z) };
  }
  // wood in a hand (an armload, or a piece held)
  woodInHand() {
    const inv = this.t.inventory;
    if (!inv || !inv.attached) return false;
    try { return inv.containers.some((c) => inv.rootWhere(c) === 'hands' && c.grid.some((e) => !e.box && /^wood:/.test(e.id))); } catch { return false; }
  }
  // what the ring still needs (stream A's chores.fireNeed: { kind: 'empty' | 'branch' | 'wood' | 'wet' | 'coals' }),
  // else read from the ring's state
  ringNeed(key) {
    const ch = this.t.camp && this.t.camp.chores, F = this.t.fires;
    if (ch && typeof ch.fireNeed === 'function') { try { return ch.fireNeed(key) || null; } catch { /* below */ } }
    const st = F && typeof F.state === 'function' ? F.state(key) : 'none';
    if (st === 'burning') return null;
    if (st === 'coals') return { kind: 'coals' };
    let n = 0; try { n = ch && ch.fireInfo ? ch.fireInfo(key).units.length : 0; } catch { n = 0; }
    return n ? { kind: 'wood' } : { kind: 'empty' };
  }
  // the map shows this place's campsites: a sheet of yours covers it (or Sandbox)
  mapHere() {
    const p = this.t.player;
    try { return !sheets.gated || sheets.showsDetail(p.x, p.z); } catch { return true; }
  }
  // a blue barrel of yours anywhere (on you, at camp, in the canoe, kept at an outfitter): what a hang takes
  hasBarrel() {
    const inv = this.t.inventory;
    if (!inv || !inv.attached) return true;
    try { return inv.containers.some((c) => /^barrel/.test(c.item || '')); } catch { return true; }
  }
  // food with you or set out at camp, and none of it hung
  foodOut() {
    const e = this.t.energy, inv = this.t.inventory;
    if (!e || !inv || !inv.attached) return false;
    try {
      // (the content join: the food left out, not hung: stood under the limb the hung barrel was in reach, hungAtCamp
      // left it out, and at dusk the bears moment asked to hang what hung there)
      if (typeof inv.campReach === 'function' && typeof inv.root === 'function') return inv.campReach().some((c) => inv.root(c).where !== 'hung' && c.grid.some((q) => !q.box && ['meal', 'snack', 'food'].includes((itemDef(q.id) || {}).kind)));
      if (typeof inv.hungAtCamp === 'function' && inv.hungAtCamp().length) return false; return e.food > 0 || inv.snacks() > 0;
    } catch { return false; }
  }
  // the nearest free campsite on your map, in words ("1.2 km north-east"), or ''
  nearestSiteWords() {
    const p = this.t.player, c = this.t.camp;
    const reg = c && c.registry;
    if (!p || !reg || typeof reg.nearestFree !== 'function') return '';
    let n = null;
    try { n = reg.nearestFree(p.x, p.z, 6000, (s) => !sheets.showsDetail || sheets.showsDetail(s.x, s.z)); } catch { n = null; }
    if (!n) return '';
    const dx = n.site.x - p.x, dz = n.site.z - p.z, deg = ((Math.atan2(dx, -dz) * 180) / Math.PI + 360) % 360;
    const far = n.d < 1000 ? `${Math.max(50, Math.round(n.d / 50) * 50)} m` : `${(n.d / 1000).toFixed(1)} km`;
    return `${far} ${compassLong(deg)}`;
  }

  // --- whether a moment applies now: false, true, a level (lower is worse) or { lv, text, short } ---------------------
  due(id, rec) {
    const t = this.t, p = t.player, d = t.day, e = t.energy, inv = t.inventory, f = t.fishing;
    const ep = !!(rec && rec.ep);
    const need = (k) => { if (!this.live || !e) return false; const v = e.needs[k]; return v < (ep ? CLEAR : LOW) ? v : false; };
    switch (id) {
      // the danger
      case 'spent': return this.live && e.spentAt != null ? e.ceiling : false; // (2026-10-31: the ceiling is your energy; the green is stamina)
      case 'nearly': {
        const v = this.live && e.spentAt == null && e.ceiling > 0 && e.ceiling < (ep ? 0.23 : 0.08) ? e.ceiling : false;
        // (fb5 join: at a campsite, not "or make for a campsite")
        return v !== false && this.here && this.here.ringD <= SITE ? { lv: v, text: 'Nearly spent. Rest, eat or drink now.', short: 'Nearly spent.' } : v;
      }
      case 'donein': return this.live && e.needs.rest <= (ep ? 0.1 : 0.005) ? e.needs.rest : false;
      case 'nofood': return this.live && e.warning;
      // the body
      case 'bottle': return this.live && !this.atOutfitter && e.treating <= 0.001 && e.bottle <= (ep ? 0.3 : 0.02) ? 1 : false;
      case 'thirsty': {
        const v = need('water'); if (v === false || this.atOutfitter) return false;
        if (e.drinkable > 0.02) return v;
        if (e.treating > 0.001) { const w = typeof e.treatingWords === 'function' ? e.treatingWords() : 'drinkable soon'; return { lv: v, text: `Thirsty. The tablet’s working: ${w}.`, short: `Thirsty: ${w}.` }; }
        return { lv: v, text: 'Thirsty, and the bottle’s empty: fill it at the water, {E}.', short: 'Thirsty: {E} at the water’s edge.' };
      }
      case 'hungry': {
        const v = need('food'); if (v === false) return false;
        let snacks = 0; try { snacks = inv && inv.attached ? inv.snacks() : 0; } catch { snacks = 0; }
        // (fb5 join: food hung in the barrel at camp is food: say where it is, not "no food… an outfitter sells it")
        const hung = snacks <= 0 && e.food <= 0.01 && typeof e.hungFood === 'function' ? e.hungFood() : null;
        if (hung && hung.days > 0) return { lv: v, text: 'Hungry. Your food hangs in the barrel: hold {E} on it to let it down.', short: 'Hungry. The barrel.' };
        if (snacks > 0 || e.food <= 0.01) return snacks > 0 ? v : { lv: v, text: 'Hungry, and no food with you. An outfitter sells it.', short: 'Hungry, and no food.' };
        return { lv: v, text: 'Hungry. Cook a meal on the grate at a fire, or eat {I}.', short: 'Hungry. {I}' };
      }
      case 'cold': return this.inside ? false : need('warmth');
      case 'wet': {
        if (!this.live || this.inside) return false;
        const F = t.fires, near = F && F.near, by = near && near.heat > 0.05 && Math.hypot(near.x - p.x, near.z - p.z) < 6;
        // (fb5 join: once taught, soaked again in a summer rain is no news; it comes back when it costs warmth)
        if (rec && rec.n > 0 && e.needs.warmth > 0.8) return false;
        return !by && e.soaked > (ep ? 0.3 : 0.5) ? 1 - e.soaked : false;
      }
      case 'tired': return need('rest');
      case 'treating': return this.live && e.treating > 0.001;
      // the day's end: on a trip under way, out of a store's yard, no tent of yours up and not at a site
      case 'start': {
        if (!(this.onTrip && p.mode === 'paddle' && this.wayT >= UNDER_WAY)) return false;
        return this.mapHere() ? true : { lv: 1, text: 'Find a campsite for the night. A map sheet from the store shows them.' };
      }
      case 'maps': {
        const v = t.outfitter && t.outfitter.visit;
        // once a shelf has been used (the shopping done, about to go out), not on the way in among the shelf and V lines
        const sh = this.rec('shelf');
        return !!(v && v.inside && p.onFoot && sh && sh.used && !(t.outfitter && (t.outfitter.shelfOpen || t.outfitter.open)) && sheets.gated && !sheets.ownedSheets().length);
      }
      case 'evening': case 'dusk': {
        const set = d && d.sunriseSunset ? d.sunriseSunset.set : null;
        if (set == null || !this.onTrip || this.atOutfitter || (t.camp && (t.camp.camp || t.camp.atSite)) || p.teleporting) return false;
        if (id === 'evening') {
          if (!(d.hours >= set - 2 && d.hours < set - 0.75)) return false;
          const where = this.nearestSiteWords();
          if (!this.mapHere()) return { lv: 1, text: 'Find a campsite before dark: a clearing with a fire ring, on the shore.', short: 'No campsite on your map near here: look for one before dark.' }; // (fb5 join: M shows nothing here)
          return { lv: 1, short: where ? `Before dark: a free campsite ${where} {M}` : 'No campsite on your map near here: look for one before dark.' };
        }
        return d.hours >= set - 0.75 && d.hours < set + 0.5;
      }
      // the camp
      case 'site': {
        if (!(this.onTrip && !!this.here && this.here.ringD <= SITE)) return false;
        // (fb5 join: with no barrel there is nothing to hang, so the line does not ask for it)
        if (!this.hasBarrel()) return { lv: 1, text: this.dark ? 'A campsite. A fire and the tent before you sleep.' : 'A campsite. Before dark: a fire and the tent.' };
        return this.dark ? { lv: 1, text: 'A campsite. A fire, the tent, your food hung up before you sleep.' } : true;
      }
      case 'bears': {
        const set = d && d.sunriseSunset ? d.sunriseSunset.set : 20;
        if (!this.onTrip || p.mode !== 'walk' || !(t.camp && t.camp.camp) || !(this.dark || d.hours >= set)) return false;
        if (!this.foodOut()) return false;
        // (fb5 join: only a blue barrel hangs; with none, "hang your food" asked for what can't be done)
        return this.hasBarrel() ? true : { lv: 1, text: 'Bears raid food left out at night. A blue barrel hangs from a limb.', short: 'Food left out tonight.' };
      }
      case 'ringwood': { const h = this.here; if (!h || h.ringD > RING) return false; const n = this.ringNeed(h.key); return !!n && n.kind !== 'coals' && this.woodInHand(); }
      case 'ringempty': { const h = this.here; if (!h || h.ringD > RING || this.woodInHand()) return false; const n = this.ringNeed(h.key); return !!n && n.kind === 'empty'; }
      case 'lit': case 'wetwood': return !!this.pending(id);
      case 'cooked': case 'low': return !!this.pending(id) && !!this.here; // (at the site: not a word about a fire left behind)
      case 'tarpred': {
        const q = this.pending(id); if (!q) return false;
        const nx = q.data && typeof q.data.next === 'string' ? q.data.next.trim().replace(/\.$/, '') : '';
        return nx && nx.length <= 80 ? { lv: 1, text: `${nx}.` } : true;
      }
      case 'coals': {
        const h = this.here, F = t.fires;
        if (h && h.ringD <= 6 && F && typeof F.state === 'function' && F.state(h.key) === 'coals') return true;
        return !!this.pending('coals') && !!h;
      }
      // the way
      case 'portage': return p.mode === 'paddle' && !p.landing && !!(p.prompt && /Portage: /.test(p.prompt.text || ''));
      case 'push': {
        const g = t.pointer && t.pointer.target;
        if (!(g && g.kind === 'canoe' && g.e && g.e.verb === 'Push it off' && !g.e.why)) return false;
        // (fb5 join: not at a portage's end, where you came to carry it: the unload moment speaks there)
        const tr = typeof p.nearestTrail === 'function' ? p.nearestTrail(p.x, p.z, 60) : null;
        return !tr;
      }
      case 'unload': {
        const g = t.pointer && t.pointer.target, sh = g && g.kind === 'canoe' ? [g.e, g.q].find((a) => a && a.verb === 'Shoulder it') : null;
        if (!(sh && sh.why && /unload/i.test(sh.why))) return false; // (content join: on E at a trail head)
        const tr = typeof p.nearestTrail === 'function' ? p.nearestTrail(p.x, p.z, 60) : null;
        return !!tr;
      }
      // the rod
      case 'bait': return !!(f && f.rodUp && f.lureDef && f.lureDef.bobber && f.needsLeeches);
      case 'fish': {
        if (!f || f.rodUp) return false;
        if (p.mode === 'walk') { try { return typeof f.canFishOnFoot === 'function' && f.canFishOnFoot(); } catch { return false; } }
        return p.mode === 'paddle' && this.onTrip && this.stillT >= STILL_AFLOAT && !!(f.rod && f.rod.visible);
      }
      // the weather and the night
      case 'rain': { const w = t.weather || this.g.weather; return this.onTrip && !this.inside && !!(w && w.rain >= 0.25); }
      case 'lamp': {
        const lamp = t.lamp;
        return this.dark && !!lamp && !lamp.on && !this.inside && (p.mode === 'walk' || p.mode === 'paddle' || p.mode === 'carry');
      }
      // the keys
      // (a greyed verb looked at a while: its chip says what is missing, the book says why)
      case 'grey': return this.greyT >= GREY_LOOK;
      case 'shelf': {
        const v = t.outfitter && t.outfitter.visit;
        if (!v || !v.inside || !p.onFoot || (t.outfitter && t.outfitter.shelfOpen)) return false;
        const g = t.pointer && t.pointer.target;
        if (g && g.kind === 'shelf') return true;
        return !!(v.L && Array.isArray(v.L.hot) && v.L.hot.some((h) => SHELVES.has(h.key) && reachTo(h, p.x, p.z) <= SHELF_REACH));
      }
      case 'book': return p.mode === 'walk' && this.besideCanoeWithThings();
      case 'jog': return this.walkT >= WALK;
      case 'view': return this.footT >= ON_FOOT;
      default: return false;
    }
  }
  // on foot beside your canoe (in reach of it, not overhead) with something of yours lying on the ground within reach
  besideCanoeWithThings() {
    const inv = this.t.inventory;
    if (!inv || !inv.attached || typeof inv.nearCanoe !== 'function' || !inv.nearCanoe()) return false;
    try {
      const k = inv.ctx();
      if (inv.containers.some((c) => { if (c.item === 'inhand') return false; const r = inv.root(c); return r === c && r.where === 'ground' && inv.inReach(c, k); })) return true;
      return inv.long.some((l) => l.where === 'ground' && inv.longReachable(l, k));
    } catch { return false; }
  }
  // the card up, by kind: 'fire' (stream B's cards), the paper's name, or null
  paperNow() {
    const hud = this.t.hud, cards = this.ref('cards');
    if (!hud || !hud.paper) return null;
    if (cards && cards.shown) return cards.kind || 'card';
    return hud.paper;
  }
  // nothing else on the screen that a moment would sit over or under; a moment may sit over the card it is about
  clear(m = null, card = null) {
    const t = this.t, p = t.player, hud = t.hud;
    if (t.title && t.title.state !== 'game') return false;
    const paper = this.paperNow();
    if (paper && !(card || (m && m.card && m.card === paper))) return false;
    if (hud && (hud.big || hud.pin)) return false;
    if (t.talk && t.talk.talking) return false;
    if (t.camp && t.camp.dialOpen) return false;
    if (t.photo && t.photo.raised) return false;
    if (t.veil && t.veil.active) return false;
    if (p.teleporting) return false;
    if (m && m.prio < BODY && t.settings && t.settings.get && t.settings.get('keyHints') === false) return false;
    return true;
  }

  // --- per frame ---------------------------------------------------------------------------------------------------------
  update(dt, shell = false) {
    this.shell = shell;
    if (shell) { if (this.cur) this.hide(); return; }
    const t = this.t, p = t.player, f = t.fishing;
    this.clockT += dt;
    // the accumulators: walking, under way, on foot, still afloat (a new season starts them again)
    const sid = t.profile ? t.profile.seasonId : null;
    if (sid !== this.sid) { this.sid = sid; this.walkT = this.paddleT = this.footT = this.wayT = this.stillT = 0; this.held.clear(); this.pend.clear(); }
    const moving = Math.abs(p.speed || 0) > 0.3;
    if (p.mode === 'walk' && !p.seat) { this.footT += dt; if (moving) this.walkT += dt; } else this.footT = 0;
    if (p.mode === 'paddle' && moving && !(f && f.rodUp) && !p.landing) this.paddleT += dt;
    if (this.onTrip && p.mode === 'paddle' && moving && !p.landing) this.wayT += dt;
    this.stillT = p.mode === 'paddle' && !moving && !p.landing && !p.teleporting ? this.stillT + dt : 0;
    // the world looked at four times a second: the site you are at, the ring (without stream A's events), what was learnt
    // by doing
    let step = 0;
    if ((this.evalT -= dt) <= 0) {
      step = EVAL - this.evalT; this.evalT = EVAL;
      this.here = this.siteHere();
      this.watchFire(this.here && this.here.site);
      this.learnFromWorld();
      const g = t.pointer && t.pointer.target; // (the dot resting on a thing it can do nothing with, for the right-click)
      this.greyT = g && g.e && g.e.why && !(g.q && !g.q.why) ? (this.greyT || 0) + step : 0;
    }
    // the card up: it holds SHOW seconds, or goes when something else takes the screen
    if (this.cur) {
      this.cur.t += dt;
      const ok = this.clear(this.cur.m, this.cur.card);
      this.place(!!(ok && this.paperNow()));
      if ((this.dodgeT -= dt) <= 0) this.dodge();
      if (this.cur.t >= SHOW || !ok) this.hide();
      return;
    }
    if (this.gapT > 0) this.gapT -= dt;
    if (!step || this.gapT > 0 || !this.store) return;
    const pick = this.pick(step);
    if (pick) this.show(pick.m, pick.text, pick.how, pick.rec, pick.lv);
  }
  // concepts learnt by doing (no key): a push-off under way, a barrel hung at camp
  learnFromWorld() {
    const hold = this.g.hold, inv = this.t.inventory;
    if (hold && typeof hold.is === 'function' && hold.is('pushOff') && !this.used('push')) this.learn('push');
    if (!this.used('hang') && inv && inv.attached && typeof inv.hungAtCamp === 'function') { try { if (inv.hungAtCamp().length) this.learn('hang'); } catch { /* not yet */ } }
    const o = this.t.outfitter; if (o && o.shelfOpen && !this.used('shelf')) this.learn('shelf'); // (fb5 join: a shelf opened, the shelf learnt; the map table's moment waits for it)
  }
  // of the moments due now, the one to show: { m, text, how, rec, lv } or null. Every trigger is looked at (each keeps
  // its own episode and its time held) and the highest priority wins.
  pick(step) {
    let best = null;
    const today = this.stamp, now = this.nowH;
    for (const m of MOMENTS) {
      const rec = this.rec(m.id); if (!rec) return null;
      if (m.keyed && this.used(m.learn || m.id)) continue;
      if (m.recur === 'once' && rec.n > 0 && (!m.stuck || rec.again)) continue;
      let r = false;
      try { r = this.due(m.id, rec); } catch (e) { if (!this.warned) { this.warned = true; console.warn('hints: trigger', m.id, e); } r = false; }
      const on = r !== false && r !== null && r !== undefined;
      // an episode over ('while'): the next one starts afresh (and short)
      if (!on) { this.held.delete(m.id); if (m.recur === 'while' && rec.ep) { rec.ep = false; rec.again = false; this.save(); } continue; }
      const heldT = (this.held.get(m.id) || 0) + step; this.held.set(m.id, heldT);
      if (!this.clear(m)) continue;
      const lv = typeof r === 'number' ? r : r && typeof r === 'object' && Number.isFinite(r.lv) ? r.lv : 1;
      const learnt = !!(m.learn && !m.keyed && this.used(m.learn));
      const full = (r && r.text) || m.text, short = (r && r.short) || m.short || null;
      let how = null;
      if (m.recur === 'once') {
        if (rec.n === 0) how = 'full';
        else if (m.stuck && !rec.again && heldT >= m.stuck) how = 'again';
      } else if (m.recur === 'daily') {
        if (rec.day !== today) how = rec.n === 0 && !learnt ? 'full' : short ? 'short' : rec.n === 0 ? 'full' : null;
        if (!how && rec.day !== today) { rec.day = today; this.save(); } // (nothing to say once learnt: the day is had)
      } else if (m.recur === 'while') {
        if (!rec.ep) how = rec.n === 0 ? 'full' : short ? 'short' : null;
        else if (lv <= (rec.lv ?? 1) - WORSE && now - (rec.at ?? -1e9) >= COOL) how = short ? 'short' : 'full';
        else if (!rec.again && now - (rec.at ?? now) >= STUCK_H) how = 'again';
        if (!how && !rec.ep) { rec.ep = true; rec.lv = lv; rec.at = now; this.save(); }
      }
      if (!how) continue;
      const text = how === 'short' ? short : full;
      if (!text) continue;
      // a teaching line waits out the longer gap after another teaching line
      if (m.prio === TEACH && this.lastPrio === TEACH && this.sinceShown < TEACH_GAP) continue;
      if (!best || m.prio > best.m.prio) best = { m, text, how, rec, lv };
    }
    return best;
  }
  get sinceShown() { return this.clockT - (this.shownAt ?? -1e9); }
  show(m, text, how = 'full', rec = null, lv = 1, card = null) {
    rec = rec || this.rec(m.id);
    if (rec) {
      rec.n = (rec.n || 0) + 1;
      rec.day = this.stamp; rec.at = this.nowH; rec.lv = lv;
      if (m.recur === 'while') rec.ep = true;
      if (how === 'again') rec.again = true;
      this.save();
    }
    this.pend.delete(m.id);
    this.held.set(m.id, 0);
    this.cur = { m, t: 0, text, how, card };
    this.shownAt = this.clockT; this.lastPrio = m.prio;
    this.el.innerHTML = `<span class="words">${momentHtml(text)}</span>`;
    this.el.dataset.hint = m.id;
    this.el.classList.toggle('danger', m.prio === DANGER);
    this.el.classList.toggle('body', m.prio === BODY);
    this.place(!!this.paperNow());
    this.el.classList.add('show');
    this.dodge();
    this.log.push({ id: m.id, how, at: this.clock(), text: plain(text) });
  }
  hide() {
    this.cur = null; this.gapT = GAP;
    this.el.classList.remove('show');
  }
  // the cons join (the bear's morning: "Thirsty. Drink from your bottle" over the bear's note): the card keeps clear of
  // the notes at the bottom left (#lines, two at most, up to 720 px wide) and the place title above them. It sits in
  // its own place, centred above the action line, unless one of them reaches under it; then it moves right, past
  // their right edge, on the same line; if the screen is too narrow for that, up above them (and right of the title
  // if it is in the way there, or above it too). Looked at when it
  // shows and every DODGE_EVERY s while it is up (a note can come in under it). Screen px, the Air's zoom undone.
  dodge() {
    this.dodgeT = DODGE_EVERY;
    const el = this.el, set = (x, y) => {
      if (x === this.dx && y === this.dy) return;
      this.dx = x; this.dy = y;
      el.style.setProperty('--hx', `${x}px`); el.style.setProperty('--hy', `${y}px`);
    };
    if (!this.cur || el.classList.contains('incard') || typeof document === 'undefined') { set(0, 0); return; }
    const air = document.getElementById('air'); if (!air) return;
    const z = parseFloat(getComputedStyle(air).zoom) || 1, W = window.innerWidth, H = window.innerHeight;
    const r = el.getBoundingClientRect(); if (!r.width) return;
    const bottom = parseFloat(getComputedStyle(el).bottom); if (!Number.isFinite(bottom)) return;
    // where it sits of itself: centred, its bottom edge `bottom` up (the translation it has now left out)
    const home = { l: W / 2 - r.width / 2, r: W / 2 + r.width / 2, b: H - bottom * z, t: H - bottom * z - r.height };
    const box = (id, on) => { const e = document.getElementById(id); if (!e || !on(e)) return null; const b = e.getBoundingClientRect(); return b.width && b.height ? b : null; };
    const near = [box('lines', (e) => [...e.children].some((c) => !c._gone)), box('place', (e) => e.classList.contains('show'))].filter(Boolean);
    const G = 18 * z, hits = (a, o) => o.left < a.r + G && o.right > a.l - G && o.top < a.b + G && o.bottom > a.t - G;
    // at its own height first, then above the notes, then above the title too: at each, where it is, or moved right
    // past what it would cover if the screen is wide enough
    let c = { ...home };
    for (let k = 0; k < 4; k++) {
      const hit = near.filter((o) => hits(c, o));
      if (!hit.length) break;
      const dx = Math.max(...hit.map((o) => o.right + G - c.l)), m = { ...c, l: c.l + dx, r: c.r + dx };
      if (m.r <= W - 40 * z && !near.some((o) => hits(m, o))) { c = m; break; }
      const dy = c.b - (Math.min(...hit.map((o) => o.top)) - G);
      c = { ...c, t: c.t - dy, b: c.b - dy };
    }
    set(Math.round((c.l - home.l) / z), Math.round((home.b - c.b) / z));
  }
  // over a card it is about (or the paper a greyed verb's key opened), the line is lifted out of the Air, which sits
  // under every paper, to the top of the screen under the strip (hud.css body > #hint.incard); back in the Air after
  place(incard) {
    const el = this.el, air = document.getElementById('air') || document.body;
    el.classList.toggle('incard', incard);
    const want = incard ? document.body : air;
    if (el.parentNode !== want) want.appendChild(el);
  }
  // a greyed verb's next step, the first time it is asked for (pointer.js on E or Q, a card, the book): shown now as a
  // teaching line, over the card or the book that asked; true when shown (the caller then says only its why, or nothing)
  next(id, text, { card = false } = {}) {
    if (!id || !text || !this.store) return false;
    const key = `next:${String(id).toLowerCase().replace(/\s+/g, '-')}`;
    const rec = this.rec(key);
    if (!rec || rec.n > 0) return false;
    const by = SAID_BY[key] && this.rec(SAID_BY[key]); if (by && by.n > 0) return false; // (content join: a moment said it already)
    if (this.cur && this.cur.m.prio > TEACH) return false;
    if (!this.clear({ prio: TEACH }, card ? 'paper' : null)) return false;
    const words = String(text).replace(/\s*\.\s*$/, '');
    this.show({ id: key, prio: TEACH, recur: 'once' }, `${words[0].toUpperCase()}${words.slice(1)}.`, 'full', rec, 1, card ? 'paper' : null);
    return true;
  }
  // a moment shown now, whatever its trigger says (the console and the tests)
  fire(id) { const m = BY_ID.get(id) || MOMENTS.find((q) => q.id === id); if (!m) return false; this.show(m, m.text, 'full'); return true; } // (the streams push their own into MOMENTS after the map)

  // --- the console and the tests ---------------------------------------------------------------------------------------
  stats() {
    const s = this.store;
    return { up: this.cur ? `${this.cur.m.id} ${this.cur.how} ${this.cur.t.toFixed(1)}s` : null, text: this.cur ? this.el.textContent : null, onboard: s ? JSON.parse(JSON.stringify(s)) : null, log: this.log.slice(), walkT: +this.walkT.toFixed(1), paddleT: +this.paddleT.toFixed(1), footT: +this.footT.toFixed(1) };
  }
  // the season's moments forgotten (the tests): they will show again
  forget() { const pr = this.t.profile; if (pr && pr.s) { pr.s.onboard = {}; pr.write(); } this.log = []; this.walkT = this.paddleT = this.footT = this.wayT = this.stillT = 0; this.held.clear(); this.pend.clear(); if (this.cur) this.hide(); }
}
