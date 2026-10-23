// Outfitters at the entry point landings: a name for each, the counter (a paper sheet: the season's permit and the
// food, the board, your kit), the trip's old record (where you are, when it started) and its persistence. The
// outfitter is where a season starts and where you come in when you need to: any counter sells food at $6 a day, up
// to what the packs hold, fills the bottle, and offers the two ways on: "Resupply · carry on" (the trip goes on) and
// "Call it a trip" (logged as came in, a bunk night, and you wake at 7:00 rested). The permit is the season's paper,
// stamped at the first counter of the season: its number, home and the day. Sandbox's counter does not charge for
// food. The board (the middle column) is the tasks' own (tasks.js boardSection). The rules of the trip and its saved
// core live in trip.js, the money and the gear in profile.js; this document carries the core alongside the old fields.
import { longDate, shortDate, esc, plural } from './hud.js';
import { seasonAt } from './season.js';
import { absDay, dateOfAbs } from './trip.js';
import { ITEMS, FOOD_PRICE } from './profile.js';

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
  stranger: ['Not seen you here before. Food is six a day, and our board is by the door.', 'Come far? Sit a minute. Food is on the shelf, and the board has a few things on it.'],
  passing: ['Passing through? Take what you need.', 'Stocking up? The food is on the shelf.', 'Still out there, then. Good for you.'],
  morning: ['Morning. Coffee is on, and the lake is flat.', 'Sleep all right? There is breakfast if you want it.', 'Up with the loons. The lake will be glassy for an hour yet.'],
  after: ['Rest up. The lakes are not going anywhere.', 'Sit a while. Dry socks first, then the next one.', 'Eat something. Go back out when you like.'],
  bunk: ['Bunk is made up out back, and there is soup on the stove.', 'Sleep in a real bed tonight. The lake will be there in the morning.', 'There is a bunk out back with your name on it.'],
};
const line = (k) => LINES[k][Math.floor(Math.random() * LINES[k].length)];
// small ink drawings for the kit, by item
const ICON = {
  canoe: '<path d="M2 5 Q 14 14 26 5 L 22 9 Q 14 13 6 9 Z" fill="currentColor"/><path d="M2 5 Q 14 2 26 5" stroke="currentColor" stroke-width="1.4" fill="none"/>',
  paddle: '<path d="M2 7 H 17" stroke="currentColor" stroke-width="1.6"/><ellipse cx="22" cy="7" rx="5" ry="2.6" fill="currentColor"/>',
  pack: '<rect x="8" y="2" width="12" height="11" rx="2" fill="currentColor"/><path d="M10 2 V 0.5 M18 2 V 0.5" stroke="currentColor" stroke-width="1.4"/><path d="M8 6 H 20" stroke="#ebe2cb" stroke-width="1"/>',
  barrel: '<rect x="9" y="1" width="10" height="12" rx="2" fill="currentColor"/><path d="M9 4 H 19 M9 10 H 19" stroke="#ebe2cb" stroke-width="1"/>',
  tent: '<path d="M4 13 L 14 2 L 24 13 Z" fill="currentColor"/><path d="M14 6 L 12 13 H 16 Z" fill="#ebe2cb"/>',
  tablets: '<rect x="6" y="4" width="16" height="7" rx="3.5" fill="currentColor"/><path d="M14 4 V 11" stroke="#ebe2cb" stroke-width="1"/>',
  jig: '<circle cx="7" cy="6" r="4" fill="currentColor"/><path d="M11 6 Q 18 2 26 9" stroke="currentColor" stroke-width="2" fill="none"/>',
  mepps: '<ellipse cx="12" cy="7" rx="9" ry="4" fill="currentColor"/><path d="M21 7h6M24 4v6" stroke="currentColor" stroke-width="1.5"/>',
  daredevle: '<polygon points="2,7 12,1 26,7 12,13" fill="currentColor"/>',
  rapala: '<rect x="3" y="3" width="22" height="8" rx="4" fill="currentColor"/><circle cx="7" cy="7" r="1.2" fill="#ebe2cb"/>',
  silverminnow: '<path d="M2 7 Q 10 1 20 7 Q 10 13 2 7 Z" fill="currentColor"/><path d="M20 7 L 26 3 L 26 11 Z" fill="currentColor"/>',
  lazyike: '<path d="M3 10 Q 10 1 17 7 T 26 5" stroke="currentColor" stroke-width="3" fill="none" stroke-linecap="round"/>',
  leeches: '<path d="M3 9 Q 8 3 13 8 T 24 7" stroke="currentColor" stroke-width="2.4" fill="none" stroke-linecap="round"/>',
  map: '<path d="M3 3 L 10 1 L 18 3 L 25 1 V 12 L 18 14 L 10 12 L 3 14 Z" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M10 1 V 12 M18 3 V 14" stroke="currentColor" stroke-width="1"/>',
};
const iconOf = (id) => ({ aluminium: 'canoe', kevlar: 'canoe', ash: 'paddle', pack: 'pack', pack2: 'pack', barrel: 'barrel', aframe: 'tent', tablets: 'tablets', leeches: 'leeches', 'maps:fisher': 'map' }[id] || (id.startsWith('lure:') ? id.slice(5) : 'jig'));
const gearIcon = (id, faint = false) => `<span style="color:${faint ? '#9a8a70' : '#2a2016'}; display:inline-flex"><svg width="28" height="14" viewBox="0 0 28 14" aria-hidden="true">${ICON[iconOf(id)] || ICON.jig}</svg></span>`;
const STANDING = ['new', 'a familiar face', 'a regular', 'a friend of the house', 'an old hand', 'one of the family'];

const NEAR = 25;                 // metres from the landing within which E opens the counter
const SAVE_KEY = 'bwca-canoe-trip';
const DEFAULT_BUY = 3;           // days of food the stepper offers first
const SANDBOX_DAYS = 4;          // Sandbox: the food pack's days (they only set its weight)
const WAKE_BUNK = 7;             // the hour you wake after a bunk night
const EVAC_FADE = 1.4;           // seconds of fade before the move (the old evacuation, without a trip core)

// the lakes are frozen on a date, and the first open-water day from there
const iced = (e) => seasonAt(e.doy).ice > 0.5;
function thawFrom(e) {
  let n = absDay(e.year, e.doy);
  for (let i = 0; i < 400; i++, n++) { const d = dateOfAbs(n); if (seasonAt(d.doy).ice < 0.02) return d; }
  return e;
}

export class Outfitter {
  // targets: { energy, tasks, hud, day, stats, onTeleport, trip (trip.js), veil (veil.js) }; the profile (profile.js)
  // is set on it after (main.js)
  constructor(world, player, { energy, tasks, hud, day, stats = null, onTeleport, trip = null, veil = null }) {
    this.world = world; this.player = player; this.energy = energy; this.tasks = tasks; this.hud = hud; this.day = day; this.stats = stats;
    this.onTeleport = onTeleport;
    this.core = trip; this.veil = veil;
    this.profile = null;
    this.tasksBoard = true;          // the board column is the tasks' own (tasks.js boardSection)
    if (trip) trip.outfitter = this;
    this.landings = world.entryPoints.map((ep) => ({ ep: ep.ep, name: outfitterName(ep), place: ep.name, x: ep.x, z: ep.z, lake: ep.lake }));
    this.trip = { active: false, ep: null, days: 0, started: null, startAbs: 0, turnedIn: 0 };
    this.open = false; this.at = null; this.near = null; this.buyN = DEFAULT_BUY;
    this.draft = null;               // the season's permit before it is stamped: { entry } (the date it will carry)
    this.today = null;               // the date the counter opened on (the stamp can't be earlier)
    this.pendingShow = false;        // open the counter as soon as the canoe is at a landing and nothing else is up
    this.saveTimer = 0; this.evac = null; this.summary = null; this.greeting = ''; this.lineKind = 'welcome'; this.bunking = false;
    this.el = { panel: document.getElementById('outfitter') };
    if (this.el.panel) {
      this.el.panel.addEventListener('click', (e) => { const b = e.target.closest('button[data-act]'); if (b && !b.disabled) this.act(b.dataset.act, b.dataset.id, e); });
      this.el.panel.addEventListener('change', (e) => { const s = e.target.closest('select[data-act]'); if (s) { this.act(s.dataset.act, s.value, e); s.blur(); } });
      window.addEventListener('keydown', (e) => {
        if (!this.open || (e.target && e.target.tagName === 'SELECT')) return;
        if (e.code === 'Escape' || e.code === 'KeyE') { this.close(); this.player.input.once.delete('KeyE'); } // the same E must not reopen it
      });
    }
    if (hud && hud.registerPaper) hud.registerPaper('outfitter', () => this.close());
  }

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
  get foodRoom() { return this.profile ? this.profile.foodRoom : 7; }
  // whole days of food that still fit in the packs
  get room() { return Math.max(0, Math.floor(this.foodRoom - (this.energy ? this.energy.food : 0) + 1e-6)); }
  get loadFactor() {
    const canoe = this.core ? this.core.state.packs.canoe === 'kevlar' : this.kevlar;
    return (1 + 0.06 * (this.energy ? this.energy.food : 0)) * (canoe ? 0.85 : 1);
  }
  get daysOut() { return this.trip.active ? Math.max(0, (this.day.doy * 24 + this.day.hours - this.trip.startAbs) / 24) : 0; } // never before the put-in
  lakeOf(l) { return this.world.lakeName(l.lake) || l.place; }

  // Before the player moves: who is nearby, E at the dock, and the counter (or a fade, or the journal) holds the paddle still.
  update(dt) {
    const p = this.player, veil = !!(this.veil && this.veil.active) || !!(this.core && this.core.evacuating);
    const n = p.mode === 'paddle' && !p.landing && !p.teleporting ? this.nearest(p.x, p.z) : null;
    this.near = n && n.d < NEAR ? n.l : null;
    p.suppressLanding = !!this.near;
    p.input.paused = this.open || !!this.evac || veil || this.bunking || (this.hud && this.hud.paper === 'journal');
    if (!p.packs) p.loadFactor = this.loadFactor; // the packs (packs.js) set it from the load once they are there
    if (this.pendingShow && !p.teleporting && !this.open && !veil && !this.bunking && !(this.hud && this.hud.paper)) { this.pendingShow = false; this.show(this.nearest(p.x, p.z).l); }
    if (this.near && !this.open && !this.evac && !veil && !this.bunking && !(this.hud && this.hud.paper) && p.input.pressed('KeyE')) this.show(this.near);
    if (this.evac) this.updateEvac(dt);
    if (this.trip.active) { this.saveTimer += dt; if (this.saveTimer > 8) { this.saveTimer = 0; this.save(); } }
  }
  // after the player moved: the dock's prompt, unless something more pressing is being said
  prompt() {
    const p = this.player;
    const rod = !!(p.fishing && p.fishing.rodUp); // the rod outranks the dock
    if (this.near && !this.open && !this.evac && !rod && (!p.prompt || p.prompt.key === 'E')) {
      const known = !this.profile || this.profile.knows(this.near.ep);
      p.prompt = { key: 'E', text: `${this.near.name} · entry point ${this.near.ep}${known ? '' : ' · new to you'}` };
    }
  }

  // --- the counter ------------------------------------------------------------------------------------------
  show(landing) {
    const pr = this.profile, core = this.core;
    const stranger = (pr && !pr.knows(landing.ep)) || (core && core.fresh === landing.ep); // a first visit
    if (core) { core.learn(landing.ep); core.fresh = null; } else if (pr) pr.learn(landing.ep);
    this.at = landing; this.open = true;
    this.greeting = line(this.lineKind === 'welcome' ? (stranger ? 'stranger' : this.trip.active ? 'passing' : 'welcome') : this.lineKind);
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
  // leaving the counter: pushing off between trips, carrying on during one
  close() {
    if (!this.open) return;
    if (!this.trip.active) { this.start(); return; }
    this.carryOn();
  }
  // the most days of food the stepper can buy: what fits, and (in Adventure) what you can pay for
  buyMax() { return this.sandbox ? this.foodRoom : Math.max(0, Math.min(this.room, Math.floor(this.money / FOOD_PRICE))); }
  act(act, id, ev = null) {
    const f = this.draft;
    if (act === 'close') this.close();
    else if (act === 'less' || act === 'more') {
      const k = act === 'less' ? -1 : 1, max = this.buyMax();
      this.buyN = Math.max(this.sandbox ? 0 : Math.min(1, max), Math.min(max, this.buyN + k));
      this.render();
    } else if (act === 'buy') this.buy();
    else if (act === 'date' && f && !this.trip.active) this.shiftDate(Number(id) * (ev && ev.shiftKey ? 30 : 1));
    else if (act === 'thaw' && f && !this.trip.active) this.setEntry(thawFrom(f.entry));
    else if (act === 'canoe') { if (this.profile) this.profile.use('canoe', id); this.render(); }
    else if (act === 'start') this.start();
    else if (act === 'carryon') this.carryOn();
    else if (act === 'callit') this.callIt();
    else if (act === 'task' && this.tasks && typeof this.tasks.act === 'function') { this.tasks.act(id, this.at.ep); this.save(); this.render(); }
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

  // the season's permit and the food: the left column
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
    const kit = pr ? pr.kit : { canoe: 'aluminium', packs: 1 }, kev = kit.canoe === 'kevlar';
    rows.push(this.kevlar
      ? `<div class="lab">Canoe</div><div class="choose">${this.choice('canoe', 'aluminium', 'Aluminium', !kev)}${this.choice('canoe', 'kevlar', 'Kevlar', kev)}<span class="soft">${kev ? '20 kg' : '34 kg'}</span></div>`
      : '<div class="lab">Canoe</div><div>Aluminium, 17 ft · <span class="soft">34 kg</span></div>');
    rows.push(`<div class="lab">Packs</div><div>${kit.packs === 2 ? 'Two Duluth packs' : 'One Duluth pack'} · <span class="soft">${kit.packs === 2 ? 'two carries' : 'one carry'}</span></div>`);
    // the food: what is in the pack, and the stepper of what to buy
    const food = en ? en.food : 0, room = this.room, max = this.buyMax(), n = Math.max(0, Math.min(this.buyN, max));
    this.buyN = n;
    let pack;
    if (this.sandbox) {
      pack = `<div class="lab">Food pack</div>${this.stepper(n, 0, max, plural(n, 'day'))}
        <button type="button" class="stamp outline buy" data-act="buy" ${Math.abs(n - food) < 0.01 ? 'disabled' : ''}>Repack to ${n} ${plural(n, 'day')}</button>
        <p class="note">Sandbox: the food keeps, and the counter does not charge. The days only set the pack’s weight.</p>`;
    } else {
      const inPack = food <= 0 ? 'No food in the pack' : `${fmtDaysWords(food)} of food in the pack`;
      const cost = n * FOOD_PRICE;
      const why = room <= 0 ? 'The pack is full.' : max <= 0 ? `A day of food is $${FOOD_PRICE}: not enough in hand.` : `$${this.money - cost} left after.`;
      pack = `<div class="lab">Food</div><p class="left">${inPack} · <span class="soft">room for ${room} more</span></p>
        ${this.stepper(n, Math.min(1, max), max, plural(n, 'day'))}
        <button type="button" class="stamp buy" data-act="buy" ${n <= 0 ? 'disabled' : ''}>Buy ${n} ${plural(n, 'day')} · $${cost}</button>
        <p class="note">$${FOOD_PRICE} a day: two meals. ${why}</p>`;
    }
    let push;
    if (!active) {
      const iceTxt = ice ? `the lakes are iced in until ${shortDate(thaw.year, thaw.doy)}` : '';
      const hungry = !this.sandbox && food <= 0 ? 'no food in the pack yet' : '';
      push = `<button type="button" class="stamp big push" data-act="start">${ice ? `Push off on ${shortDate(thaw.year, thaw.doy)}` : 'Push off'}</button><div class="pencil">${esc(this.summary || iceTxt || hungry || 'leaving the counter pushes off too')}</div>`;
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
  // the board: the tasks' own section (tasks.js), or a quiet card until there is one
  boardSection(a) {
    const t = this.tasks;
    if (t && typeof t.boardSection === 'function') return t.boardSection(a.ep);
    return '<section class="board" aria-labelledby="board-h"><div class="top"><h3 id="board-h">The board</h3><span class="sum">adverts from this outfitter</span></div><div class="cards"><p class="muted">The board is being written up.</p></div></section>';
  }
  // your kit and the season: the right column
  wallSection(a) {
    const pr = this.profile;
    if (!pr) return '<section class="wall"><div class="top"><h3>Your kit</h3></div><p class="soft">An aluminium canoe and a pack.</p></section>';
    const kit = pr.kit, owned = pr.owned;
    const order = Object.keys(ITEMS).filter((id) => owned.includes(id));
    const li = (id) => {
      const it = ITEMS[id], inUse = it.slot && kit[it.slot] === id, spare = it.slot && !inUse;
      return `<li>${gearIcon(id, spare)}<span>${esc(it.label)}${spare ? ' <span class="soft">· on the rack</span>' : ''}</span></li>`;
    };
    const known = pr.known.length, all = this.landings.length;
    const rep = Math.floor(pr.outfitter(a.ep).rep), earned = pr.earned;
    return `<section class="wall" aria-labelledby="wall-h">
      <div class="top"><h3 id="wall-h">Your kit</h3></div>
      <ul>${order.map(li).join('')}</ul>
      <div class="lab">This season</div>
      <p>${earned ? `$${earned} earned on the boards` : 'Nothing earned yet'} · ${known} of ${all} ${plural(all, 'outfitter')} known. You are ${STANDING[Math.max(0, Math.min(5, rep))]} here.</p>
      <p class="soft">The shelves are food for now; the rest of the wall is for looking at.</p>
    </section>`;
  }

  render() {
    if (!this.open || !this.el.panel) return;
    const a = this.at, active = this.trip.active;
    const lakeName = this.lakeOf(a), area = areaOf(a.ep);
    const purse = this.profile ? `<div class="purse"><span class="sc">In hand</span><b>$${this.money}</b></div>` : '';
    const was = this.el.panel.querySelector('.permit'), scroll = was ? was.scrollTop : 0;
    this.el.panel.innerHTML = `<header>
      <div class="lede"><div class="sc kicker">Entry point ${a.ep} · ${esc(lakeName)}${area ? ` · ${area}` : ''}</div><h2>${esc(a.name)}</h2><div class="say">“${esc(this.greeting)}”</div></div>
      ${purse}<button type="button" class="stamp outline" data-act="close" aria-label="Leave the counter (E or Esc)">${active ? 'Carry on' : 'Push off'} · E</button>
    </header><div class="counter">${this.permitSection(a)}${this.boardSection(a)}${this.wallSection(a)}</div>`;
    if (scroll) this.el.panel.querySelector('.permit').scrollTop = scroll;
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
    const cost = n * FOOD_PRICE;
    if (n > this.room) { this.hud.note('That will not fit in the pack.'); return; }
    if (!this.profile || !this.profile.spend(cost, `${n} ${plural(n, 'day')} of food at ${a.name}`)) { this.hud.note(`Not enough in hand: ${n} ${plural(n, 'day')} is $${cost}.`); this.render(); return; }
    en.food = +(en.food + n).toFixed(2);
    if (this.core) this.core.state.packs.foodDays = en.food;
    this.hud.note(`${n} ${plural(n, 'day')} of food, $${cost}. ${fmtDaysWords(en.food)} in the pack, $${this.money} in hand.`, 6);
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
    this.summary = null; this.draft = null;
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
    const a = this.at, core = this.core, d = this.day, en = this.energy, st = this.stats;
    if (!this.trip.active) return;
    const days = Math.max(1, core ? core.dayN : Math.floor(this.daysOut) + 1), km = st ? st.km : 0, from = this.trip.fromName || 'the landing';
    if (core) core.callIt(a.ep);
    this.trip = { active: false, ep: null, days: this.foodRoom, started: null, startAbs: 0, turnedIn: 0 };
    this.summary = null; this.draft = null;
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
    const card = {
      kicker: `${a.name} · the bunkhouse`,
      text: `“${line('bunk')}”`,
      sub: `The trip is logged as came in: ${days} ${plural(days, 'day')} out from ${from}${km > 0.05 ? `, ${km < 10 ? km.toFixed(1) : Math.round(km)} km paddled` : ''}. You wake at seven, rested.`,
      fadeIn: 1.4, hold: 4, fadeOut: 2.2, onDark: night,
    };
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
    this.summary = null; this.draft = null; this.evac = null; this.bunking = false;
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
    this.summary = null; this.draft = null;
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
