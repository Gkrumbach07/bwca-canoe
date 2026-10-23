// Outfitters at the entry point landings: a name for each, the counter (a paper sheet: the trip permit, the task
// board, the wall of gear), the trip's old record (days of food, where you are, when it started) and its persistence.
// The outfitter is where a trip starts and ends and where tasks are taken and turned in; between visits it leaves you
// alone. The permit is written here: in Adventure the put-in date, the nights (which set "out by" and the food: a day
// for each night and a spare), the exit (back here, or another entry point where the outfitter meets you with the
// car), one pack or two and the canoe; in Sandbox the packs, the canoe and the food pack's days, and no dates. The
// rules of the trip and its saved core live in trip.js; this document carries the core alongside the old fields.
import { longDate, shortDate, esc, word, plural } from './hud.js';
import { UNLOCKS } from './tasks.js';
import { seasonAt } from './season.js';
import { absDay, dateOfAbs } from './trip.js';

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
// the road each stretch of entry points is reached by, for the permit's kicker
const AREAS = [[1, 20, 'the Echo Trail'], [22, 33, 'the Fernberg Road'], [34, 39, 'the Sawbill Trail'], [40, 70, 'the Gunflint Trail'], [75, 84, 'the Sawbill Trail']];
export function areaOf(ep) { const a = AREAS.find(([lo, hi]) => ep >= lo && ep <= hi); return a ? a[2] : ''; }

const LINES = {
  welcome: ['Morning. Pack is on the dock whenever you are.', 'Weather looks fair. Take what you need.', 'Board is up by the door if you want something to chase.', 'No hurry. The lake keeps.'],
  evac: ['Rough one. We came out and got you — dry clothes, hot food, fresh pack. The lake is still there.', 'Heard you ran out. Never mind; it happens to everyone once. Here is a full pack.', 'We took the motor out and fetched you in. Eat something. Go back out when you like.'],
  after: ['Rest up. There is a fresh permit on the counter when you want one.', 'Sit a while. The lakes are not going anywhere.', 'Dry socks first. Then we can talk about the next one.'],
  turnIn: ['Well, look at that. Much obliged.', 'That is the one. Thank you kindly.', 'Knew you would. Take something off the wall.'],
};
const line = (k) => LINES[k][Math.floor(Math.random() * LINES[k].length)];
const GEAR_ICON = {
  mepps: '<svg width="28" height="14" viewBox="0 0 28 14" aria-hidden="true"><ellipse cx="12" cy="7" rx="9" ry="4" fill="currentColor"/><path d="M21 7h6M24 4v6" stroke="currentColor" stroke-width="1.5"/></svg>',
  daredevle: '<svg width="28" height="14" viewBox="0 0 28 14" aria-hidden="true"><polygon points="2,7 12,1 26,7 12,13" fill="currentColor"/></svg>',
  rapala: '<svg width="28" height="14" viewBox="0 0 28 14" aria-hidden="true"><rect x="3" y="3" width="22" height="8" rx="4" fill="currentColor"/><circle cx="7" cy="7" r="1.2" fill="#ebe2cb"/></svg>',
  kevlar: '<svg width="28" height="14" viewBox="0 0 28 14" aria-hidden="true"><path d="M2 5 Q 14 14 26 5 L 22 9 Q 14 13 6 9 Z" fill="currentColor"/><path d="M2 5 Q 14 2 26 5" stroke="currentColor" stroke-width="1.4" fill="none"/></svg>',
  jig: '<svg width="28" height="14" viewBox="0 0 28 14" aria-hidden="true"><circle cx="7" cy="6" r="4" fill="currentColor"/><path d="M11 6 Q 18 2 26 9" stroke="currentColor" stroke-width="2" fill="none"/></svg>',
  silverminnow: '<svg width="28" height="14" viewBox="0 0 28 14" aria-hidden="true"><path d="M2 7 Q 10 1 20 7 Q 10 13 2 7 Z" fill="currentColor"/><path d="M20 7 L 26 3 L 26 11 Z" fill="currentColor"/></svg>',
  lazyike: '<svg width="28" height="14" viewBox="0 0 28 14" aria-hidden="true"><path d="M3 10 Q 10 1 17 7 T 26 5" stroke="currentColor" stroke-width="3" fill="none" stroke-linecap="round"/></svg>',
  fisher: '<svg width="28" height="14" viewBox="0 0 28 14" aria-hidden="true"><path d="M2 10 Q 14 -2 26 10" stroke="currentColor" stroke-width="2" fill="none"/><circle cx="26" cy="10" r="2" fill="currentColor"/></svg>',
};
const gearIcon = (key, faint = false) => `<span style="color:${faint ? '#9a8a70' : '#2a2016'}; display:inline-flex">${GEAR_ICON[key] || GEAR_ICON.jig}</span>`;


const NEAR = 25;                 // metres from the landing within which E opens the counter
const SAVE_KEY = 'bwca-canoe-trip';
const DEFAULT_DAYS = 4, MIN_DAYS = 2, MAX_DAYS = 7;
const DEFAULT_NIGHTS = 3, MIN_NIGHTS = 2, MAX_NIGHTS = 7;
const EXITS = 6;                 // the other entry points offered as an exit, nearest first
const EVAC_FADE = 1.4;           // seconds of fade before the move (the old evacuation, without a trip core)

// the lakes are frozen on a date, and the first open-water day from there
const iced = (e) => seasonAt(e.doy).ice > 0.5;
function thawFrom(e) {
  let n = absDay(e.year, e.doy);
  for (let i = 0; i < 400; i++, n++) { const d = dateOfAbs(n); if (seasonAt(d.doy).ice < 0.02) return d; }
  return e;
}

export class Outfitter {
  // targets: { energy, tasks, hud, day, stats, onTeleport, trip (trip.js), veil (veil.js) }
  constructor(world, player, { energy, tasks, hud, day, stats = null, onTeleport, trip = null, veil = null }) {
    this.world = world; this.player = player; this.energy = energy; this.tasks = tasks; this.hud = hud; this.day = day; this.stats = stats;
    this.onTeleport = onTeleport;
    this.core = trip; this.veil = veil;
    if (trip) trip.outfitter = this;
    this.landings = world.entryPoints.map((ep) => ({ ep: ep.ep, name: outfitterName(ep), place: ep.name, x: ep.x, z: ep.z, lake: ep.lake }));
    this.trip = { active: false, ep: null, days: DEFAULT_DAYS, started: null, startAbs: 0, turnedIn: 0 };
    this.open = false; this.at = null; this.near = null; this.pick = DEFAULT_DAYS;
    this.draft = null;               // the permit being written: { entry, nights, exitEp, packs, canoe, foodDays }
    this.today = null;               // the date the counter opened on (the put-in can't be earlier)
    this.pendingShow = false;        // open the counter as soon as the canoe is at a landing and nothing else is up
    this.saveTimer = 0; this.evac = null; this.summary = null; this.writing = false; this.greeting = ''; this.lineKind = 'welcome';
    this.el = { panel: document.getElementById('outfitter') };
    if (this.el.panel) {
      this.el.panel.addEventListener('click', (e) => { const b = e.target.closest('button[data-act]'); if (b && !b.disabled) this.act(b.dataset.act, b.dataset.id, e); });
      this.el.panel.addEventListener('change', (e) => { const s = e.target.closest('select[data-act]'); if (s) { this.act(s.dataset.act, s.value, e); s.blur(); } });
      window.addEventListener('keydown', (e) => {
        if (!this.open || (e.target && e.target.tagName === 'SELECT')) return; // E in the exit list picks a place, not the door
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
  get adventure() { return !!(this.core && this.core.adventure); }
  get kevlar() { return !!(this.tasks && this.tasks.has('kevlar')); }
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
    p.input.paused = this.open || !!this.evac || veil || (this.hud && this.hud.paper === 'journal');
    if (!p.packs) p.loadFactor = this.loadFactor; // the packs (packs.js) set it from the load once they are there
    if (this.pendingShow && !p.teleporting && !this.open && !veil && !(this.hud && this.hud.paper)) { this.pendingShow = false; this.show(this.nearest(p.x, p.z).l); }
    if (this.near && !this.open && !this.evac && !veil && !(this.hud && this.hud.paper) && p.input.pressed('KeyE')) this.show(this.near);
    if (this.evac) this.updateEvac(dt);
    if (this.trip.active) { this.saveTimer += dt; if (this.saveTimer > 8) { this.saveTimer = 0; this.save(); } }
  }
  // after the player moved: the dock's prompt, unless something more pressing is being said
  prompt() {
    const p = this.player;
    const rod = !!(p.fishing && p.fishing.rodUp); // the rod outranks the dock
    if (this.near && !this.open && !this.evac && !rod && (!p.prompt || p.prompt.key === 'E')) p.prompt = { key: 'E', text: `${this.near.name} · entry point ${this.near.ep}` };
  }

  // --- the counter ------------------------------------------------------------------------------------------
  show(landing) {
    this.at = landing; this.open = true; this.greeting = line(this.lineKind); this.lineKind = 'welcome';
    this.pick = this.trip.active ? Math.max(MIN_DAYS, Math.min(MAX_DAYS, Math.round(this.energy.food))) || DEFAULT_DAYS : this.trip.days || DEFAULT_DAYS;
    if (!this.trip.active) { this.today = { year: this.day.year, doy: this.day.doy }; this.draft = this.newDraft(landing); }
    if (this.hud && this.hud.openPaper) this.hud.openPaper('outfitter');
    this.el.panel.classList.add('show');
    this.render();
    if (this.tasks && this.tasks.board.length < 3 && !this.writing) {
      this.writing = true;
      this.tasks.generate(landing).catch((e) => console.warn('task board', e)).finally(() => { this.writing = false; this.render(); });
    }
  }
  hide() {
    this.open = false;
    this.el.panel.classList.remove('show');
    if (this.hud && this.hud.closePaper) this.hud.closePaper('outfitter');
  }
  close() {
    if (!this.open) return;
    if (!this.trip.active) { this.start(); return; } // leaving the counter is pushing off
    this.summary = null;
    this.hide();
    this.save();
  }
  // a fresh permit: today at this landing, out and back here, the packs and canoe of the last trip
  newDraft(a) {
    const d = this.day, prev = this.core ? this.core.state.packs : null;
    return {
      entry: { year: d.year, doy: d.doy }, nights: this.lastNights || DEFAULT_NIGHTS, exitEp: a.ep,
      packs: prev ? prev.count : 2, canoe: this.kevlar && prev && prev.canoe === 'kevlar' ? 'kevlar' : 'aluminium',
      foodDays: this.trip.days || DEFAULT_DAYS,
    };
  }
  act(act, id, ev = null) {
    const t = this.tasks, f = this.draft, active = this.trip.active, adv = this.adventure;
    if (act === 'close') this.close();
    else if (act === 'less' || act === 'more') {
      const k = act === 'less' ? -1 : 1;
      if (active) this.pick = Math.max(MIN_DAYS, Math.min(MAX_DAYS, this.pick + k));
      else if (f && adv) f.nights = Math.max(MIN_NIGHTS, Math.min(MAX_NIGHTS, f.nights + k));
      else if (f) f.foodDays = Math.max(MIN_DAYS, Math.min(MAX_DAYS, f.foodDays + k));
      this.render();
    } else if (act === 'date' && f && !active) this.shiftDate(Number(id) * (ev && ev.shiftKey ? 30 : 1));
    else if (act === 'thaw' && f && !active) this.setEntry(thawFrom(f.entry));
    else if (act === 'exit' && f) { f.exitEp = Number(id); this.render(); }
    else if (act === 'packs' && f) { f.packs = Number(id) === 1 ? 1 : 2; this.render(); }
    else if (act === 'canoe' && f) { f.canoe = id === 'kevlar' && this.kevlar ? 'kevlar' : 'aluminium'; this.render(); }
    else if (act === 'start') this.start();
    else if (act === 'resupply') {
      this.energy.food = this.pick; this.trip.days = this.pick;
      if (this.core) this.core.state.packs.foodDays = this.pick;
      this.hud.note(`Packed ${this.pick} days of food.`); this.save(); this.render();
    } else if (act === 'end') this.end();
    else if (act === 'new') this.newTrip();
    else if (act === 'accept') { t.accept(+id); this.save(); this.render(); }
    else if (act === 'drop') { t.drop(+id); this.save(); this.render(); }
    else if (act === 'turnin') this.turnIn();
  }
  // the put-in date: a day either way (a month with Shift), never before the day the counter opened. The clock goes
  // with it, so the season behind the counter is the one you will paddle in.
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

  // the permit's number: the entry point and the month and day the trip began (or will)
  permitNo(a) {
    let d = null;
    if (this.trip.active && this.core && this.core.permit && this.core.permit.entry) d = this.core.permit.entry;
    else if (this.trip.active && this.trip.startDoy != null) d = { year: this.trip.startYear, doy: this.trip.startDoy };
    else if (this.draft) d = this.draft.entry;
    else d = { year: this.day.year, doy: this.day.doy };
    const date = new Date(d.year, 0, d.doy);
    return `No. ${a.ep}-${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
  }
  tally(n) {
    let html = '';
    for (let i = 1; i <= n; i++) { if (i % 5 === 0) html += '<i class="five"></i>'; else { if (i > 1 && i % 5 === 1) html += '<i class="gap"></i>'; html += '<i></i>'; } }
    return html;
  }
  // the exits: back here, or the nearest other entry points, with the distance as the crow flies
  exits(a) {
    const others = this.landings.filter((l) => l.ep !== a.ep).map((l) => ({ l, d: Math.hypot(l.x - a.x, l.z - a.z) })).sort((p, q) => p.d - q.d).slice(0, EXITS);
    return [{ ep: a.ep, label: `Back here, ${a.place}` }, ...others.map(({ l, d }) => ({ ep: l.ep, label: `${l.place} · EP ${l.ep} · ${(d / 1000).toFixed(d < 10000 ? 1 : 0)} km` }))];
  }
  choice(act, id, label, on, disabled = false) {
    return `<button type="button" class="opt${on ? ' on' : ''}" data-act="${act}" data-id="${id}" aria-pressed="${on}"${disabled ? ' disabled' : ''}>${label}</button>`;
  }
  stepper(n, min, max, unit, label) {
    return `<div class="stepper">
          <button type="button" class="step" data-act="less" aria-label="A ${unit} less" ${n <= min ? 'disabled' : ''}>−</button>
          <div class="days"><div class="tally" aria-hidden="true">${this.tally(n)}</div><div class="n"><b>${n}</b> ${label}</div></div>
          <button type="button" class="step" data-act="more" aria-label="A ${unit} more" ${n >= max ? 'disabled' : ''}>+</button>
        </div>`;
  }

  // the permit before a trip: written at the counter
  permitBlank(a, lakeName) {
    const f = this.draft || (this.draft = this.newDraft(a)), adv = this.adventure, kevlar = this.kevlar;
    const rows = [];
    let ice = false, thaw = null;
    if (adv) {
      ice = iced(f.entry); thaw = ice ? thawFrom(f.entry) : null;
      const first = this.today && absDay(f.entry.year, f.entry.doy) <= absDay(this.today.year, this.today.doy);
      rows.push(`<div class="lab">Put in</div><div class="when"><span>${esc(lakeName)}</span><span class="date">`
        + `<button type="button" class="step small" data-act="date" data-id="-1" aria-label="A day earlier (Shift: a month)" title="Shift: a month" ${first ? 'disabled' : ''}>‹</button>`
        + `<span>${longDate(f.entry.year, f.entry.doy)}</span>`
        + `<button type="button" class="step small" data-act="date" data-id="1" aria-label="A day later (Shift: a month)" title="Shift: a month">›</button></span>`
        + `${ice ? `<button type="button" class="pencil-btn" data-act="thaw">iced in · put in ${shortDate(thaw.year, thaw.doy)}?</button>` : ''}</div>`);
    } else rows.push(`<div class="lab">Put in</div><div>${esc(lakeName)} · <span class="soft">no dates</span></div>`);
    rows.push('<div class="lab">Party</div><div>One canoe, one paddler</div>');
    if (adv) {
      const opts = this.exits(a).map((x) => `<option value="${x.ep}"${x.ep === f.exitEp ? ' selected' : ''}>${esc(x.label)}</option>`).join('');
      rows.push(`<div class="lab">Exit</div><div><select class="ink" data-act="exit" aria-label="Where you come out">${opts}</select></div>`);
    }
    rows.push(`<div class="lab">Packs</div><div class="choose">${this.choice('packs', 1, 'One', f.packs === 1)}${this.choice('packs', 2, 'Two', f.packs === 2)}<span class="soft">${f.packs === 1 ? 'travel light, one carry' : 'food and gear, two carries'}</span></div>`);
    rows.push(`<div class="lab">Canoe</div><div class="choose">${this.choice('canoe', 'aluminium', 'Aluminium', f.canoe !== 'kevlar')}${this.choice('canoe', 'kevlar', 'Kevlar', f.canoe === 'kevlar', !kevlar)}<span class="soft">${kevlar ? (f.canoe === 'kevlar' ? '20 kg on the portages' : '34 kg on the portages') : 'Kevlar not yet earned'}</span></div>`);
    let pack;
    if (adv) {
      const e = ice ? thaw : f.entry, by = dateOfAbs(absDay(e.year, e.doy) + f.nights);
      const exit = f.exitEp !== a.ep ? this.landings.find((l) => l.ep === f.exitEp) : null;
      pack = `<div class="lab">Nights</div>${this.stepper(f.nights, MIN_NIGHTS, MAX_NIGHTS, 'night', plural(f.nights, 'night'))}
        <p class="note">Out by ${longDate(by.year, by.doy)}${exit ? `, at ${esc(exit.place)}: the outfitter meets you there with the car` : ''}. Food for ${f.nights + 1} days: two meals a day, and a spare day.${!ice && iced(by) ? ' <span class="soft">The lakes freeze over before then.</span>' : ''}</p>`;
    } else {
      pack = `<div class="lab">Food pack</div>${this.stepper(f.foodDays, MIN_DAYS, MAX_DAYS, 'day', 'days')}
        <p class="note">Sandbox: the food keeps, and the clock and the map are yours. The days only set the pack’s weight.</p>`;
    }
    const push = `<button type="button" class="stamp big push" data-act="start">${ice ? `Push off on ${shortDate(thaw.year, thaw.doy)}` : 'Push off'}</button><div class="pencil">${this.summary ? esc(this.summary) : ice ? 'the lakes are iced in until then' : 'leaving the counter pushes off too'}</div>`;
    return { rows, pack, push };
  }
  // the permit of the trip under way: read back, and the way out
  permitHeld(a, lakeName) {
    const trip = this.trip, core = this.core, en = this.energy, food = en.food, rows = [];
    const p = core && core.active ? core.permit : null, adv = this.adventure;
    const putIn = p && p.entry ? `${esc(this.lakeOf(this.landings.find((l) => l.ep === p.ep) || a))}${adv ? `, ${longDate(p.entry.year, p.entry.doy)}` : ''}` : trip.startDoy != null ? `${esc(trip.fromName || lakeName)}${adv ? `, ${longDate(trip.startYear, trip.startDoy)}` : ''}` : esc(lakeName);
    rows.push(`<div class="lab">Put in</div><div>${putIn}</div>`);
    if (adv && p && p.exitBy) rows.push(`<div class="lab">Out by</div><div>${longDate(p.exitBy.year, p.exitBy.doy)} · <span class="soft">${esc(core.exitWords())}</span></div>`);
    const pk = core ? core.state.packs : null;
    if (pk) rows.push(`<div class="lab">Packs</div><div>${pk.count === 1 ? 'One pack' : 'Two packs'} · ${pk.canoe === 'kevlar' ? 'Kevlar' : 'aluminium'} canoe</div>`);
    else rows.push(`<div class="lab">Canoe</div><div>${this.kevlar ? 'Kevlar, 17 ft' : 'Aluminium, 17 ft'}</div>`);
    const left = food <= 0 ? 'The pack is empty.' : `${food % 1 ? `${Math.floor(food) || ''}½` : food} ${plural(food <= 1 ? 1 : 2, 'day')} of food left.`;
    let pack, push;
    if (adv) {
      const due = core.dueIn, endsHere = p && p.exitEp != null && p.exitEp !== a.ep ? ` The car is waiting at ${esc((this.landings.find((l) => l.ep === p.exitEp) || {}).place || 'the exit')}.` : '';
      pack = `<div class="lab">Food</div><p class="left">${left}</p><p class="note">${esc(core.dayWords(true))}. A dock is a way out, not a restock: end the trip at any of them.${endsHere}</p>`;
      const when = due == null ? '' : due > 0 ? `${word(due)} ${plural(due, 'day')} to spare` : due === 0 ? 'out by today: on time' : `${word(-due)} ${plural(-due, 'day')} past the permit`;
      push = `<button type="button" class="stamp outline big push" data-act="end">End the trip here</button><div class="pencil">${this.summary ? esc(this.summary) : when}</div>`;
    } else {
      pack = `<div class="lab">Food pack</div>${this.stepper(this.pick, MIN_DAYS, MAX_DAYS, 'day', 'days')}<p class="note">${left} Repack for the days you want; the counter does not charge.</p>`;
      push = `<button type="button" class="stamp outline big push" data-act="resupply">Repack to ${this.pick} ${plural(this.pick, 'day')}</button><div class="pencil">${this.summary ? esc(this.summary) : `out ${fmtDaysWords(this.daysOut)} from ${esc(trip.fromName || 'the landing')}`}</div>`;
    }
    return { rows, pack, push };
  }

  render() {
    if (!this.open || !this.el.panel) return;
    const a = this.at, trip = this.trip, t = this.tasks, active = trip.active, adv = this.adventure;
    const lakeName = this.lakeOf(a), area = areaOf(a.ep);
    const { rows, pack, push } = active ? this.permitHeld(a, lakeName) : this.permitBlank(a, lakeName);
    const permit = `<section class="permit" aria-labelledby="permit-h">
      <div class="top"><h3 id="permit-h">Trip permit</h3><span class="sc no">${this.core && this.core.sandbox ? 'Sandbox' : this.permitNo(a)}</span></div>
      <div class="grid">${rows.join('')}</div>
      <div class="pack">${pack}</div>
      ${push}
    </section>`;
    // the board: accepted tasks first (done ones ready to turn in), then what is on offer
    const card = (task, mode) => {
      const kind = { item: 'Lost and found', survey: 'Survey', fish: 'Fishing' }[task.kind];
      const state = mode === 'offer' ? '' : task.status === 'done' ? '<span class="done">Done — turn it in</span>' : '<span>On the go</span>';
      const btn = mode === 'offer' ? `<button type="button" class="stamp" data-act="accept" data-id="${task.id}">Take it on</button>`
        : task.status === 'done' ? '' : `<button type="button" class="stamp outline" data-act="drop" data-id="${task.id}">Let it go</button>`;
      return `<article class="card ${task.status === 'done' ? 'done' : ''}"><div class="kind"><span>${kind} · posted at ${esc(task.fromName)}</span>${state}</div><div class="clue">${esc(task.clue)}</div>${btn}</article>`;
    };
    let cards = '', sum = '', turn = '';
    if (t) {
      const done = t.active.filter((x) => x.status === 'done'), going = t.active.length - done.length;
      const bits = [];
      if (going) bits.push(`${word(going)} on the go`);
      if (done.length) bits.push(`${word(done.length)} finished`);
      bits.push(`${t.board.length ? word(t.board.length) : 'nothing'} on offer`);
      sum = bits.join(', ');
      if (done.length) turn = `<button type="button" class="stamp" data-act="turnin">Turn in ${done.length === 1 ? 'the finished task' : `${word(done.length)} finished tasks`}</button>`;
      for (const task of t.active) cards += card(task, 'active');
      if (t.board.length) cards += '<div class="onoffer">On offer</div>';
      for (const task of t.board) cards += card(task, 'offer');
      if (this.writing) cards += '<p class="muted">Writing up the board…</p>';
      else if (!t.board.length && !t.active.length) cards += '<p class="muted">Nothing on the board today.</p>';
    }
    const board = `<section class="board" aria-labelledby="board-h"><div class="top"><h3 id="board-h">The board</h3><span class="sum">${sum}</span>${turn}</div><div class="cards">${cards}</div></section>`;
    // the wall
    const tally = t ? t.tally : { item: 0, survey: 0, fish: 0 };
    const total = tally.item + tally.survey + tally.fish;
    const have = t ? t.unlocks : [], left = UNLOCKS.filter((u) => !have.some((h) => h.key === u.key));
    const leftWords = left.map((u) => u.label.replace(/ \(.*\)$/, ''));
    const season = total ? `${total} ${plural(total, 'task')} turned in this season: ${tally.item} found, ${tally.survey} surveyed, ${tally.fish ? `${tally.fish} fished` : 'none fished yet'}.` : 'Nothing turned in yet. The wall is full of lures.';
    const endHere = active && !adv ? '<button type="button" class="stamp outline" data-act="end">End the trip here</button>' : ''; // in Adventure it is the permit's own button
    const wall = `<section class="wall" aria-labelledby="wall-h">
      <div class="top"><h3 id="wall-h">The wall</h3></div>
      <p>${season}</p>
      ${have.length ? `<div class="lab">Taken off the wall</div><ul>${have.map((u) => `<li>${gearIcon(u.key)}${esc(u.label.replace(/ \(.*\)$/, ''))}</li>`).join('')}</ul>` : ''}
      <div class="lab">Still on the wall</div>
      <div class="hooks" aria-hidden="true">${left.map((u) => gearIcon(u.key, true)).join('')}</div>
      <p class="soft">${left.length ? `${leftWords.map((s, i) => (i === 0 ? s[0].toUpperCase() + s.slice(1) : s)).join(', ')} ${left.length === 1 ? 'comes' : 'come'} down for tasks turned in.` : 'The wall is bare: you have the lot.'}</p>
      <div class="ends">${endHere}<button type="button" class="stamp quiet" data-act="new" title="forget this trip, the log and the gear">New trip · forget the log and the gear</button></div>
    </section>`;
    const was = this.el.panel.querySelector('.permit'), scroll = was ? was.scrollTop : 0;
    this.el.panel.innerHTML = `<header>
      <div class="lede"><div class="sc kicker">Entry point ${a.ep} · ${esc(lakeName)}${area ? ` · ${area}` : ''}</div><h2>${esc(a.name)}</h2><div class="say">“${esc(this.greeting)}”</div></div>
      <button type="button" class="stamp outline" data-act="close" aria-label="Leave the counter (E or Esc)">${active ? 'Back to the water' : 'Push off'} · E</button>
    </header><div class="counter">${permit}${board}${wall}</div>`;
    if (scroll) this.el.panel.querySelector('.permit').scrollTop = scroll;
  }

  // --- the trip ----------------------------------------------------------------------------------------------
  start() {
    const a = this.at || this.nearest(this.player.x, this.player.z).l;
    const d = this.day, core = this.core, adv = this.adventure;
    const f = this.draft || this.newDraft(a);
    if (adv) { // the put-in date (moved to the thaw if the lakes are iced on it)
      const e = iced(f.entry) ? thawFrom(f.entry) : f.entry;
      if (e.year !== d.year || e.doy !== d.doy) d.setClock(e.year, e.doy, d.hours);
    }
    const days = adv ? f.nights + 1 : f.foodDays;
    this.lastNights = f.nights;
    this.trip = { active: true, ep: a.ep, days, started: d.clock, startAbs: d.doy * 24 + d.hours, startYear: d.year, startDoy: d.doy, startHours: d.hours, turnedIn: 0, fromName: this.lakeOf(a) };
    this.energy.food = days; this.energy.value = 1;
    if (this.stats) this.stats.reset();
    const no = this.permitNo(a);
    if (core) core.start({ no, ep: a.ep, entry: { year: d.year, doy: d.doy, hours: d.hours }, nights: adv ? f.nights : null, exitEp: adv ? f.exitEp : null, packs: f.packs, canoe: f.canoe === 'kevlar' && this.kevlar ? 'kevlar' : 'aluminium', foodDays: days });
    this.summary = null; this.draft = null;
    this.hide();
    // the permit, as a title over the water
    const lake = this.lakeOf(a);
    if (core && adv) {
      const exit = f.exitEp !== a.ep ? this.landings.find((l) => l.ep === f.exitEp) : null;
      this.hud.showPlace(`Permit ${no} · ${a.name}`, lake, `out by ${core.outBy('day')} · ${core.packWords(days)}${exit ? ` · the car at ${exit.place}` : ''}`, 6);
    } else if (core) this.hud.showPlace(`Sandbox · ${a.name}`, lake, `${core.packWords(days)} · no dates`, 6);
    else this.hud.note(`${days} days of food in the pack. Push off when you like.`);
    this.save();
  }
  end() {
    const turned = this.trip.turnedIn, out = fmtDaysWords(this.daysOut);
    const o = this.core ? this.core.finish(this.at.ep) : null;
    const how = o && o.why && o.why !== 'sandbox' ? `, ${o.why}` : '';
    this.summary = `Trip ended at ${this.at.name}${how}: ${out} out, ${turned} ${plural(turned, 'task')} turned in.`;
    this.trip = { active: false, ep: null, days: this.trip.days, started: null, startAbs: 0, turnedIn: 0 };
    if (this.tasks) this.tasks.endTrip();
    this.energy.food = 0;
    this.today = { year: this.day.year, doy: this.day.doy }; this.draft = this.newDraft(this.at);
    this.save();
    this.render();
  }
  newTrip() {
    try { localStorage.removeItem(SAVE_KEY); } catch { /* private mode */ }
    if (this.core) { this.core.abandon(); this.core.reset(this.core.mode); }
    this.trip = { active: false, ep: null, days: DEFAULT_DAYS, started: null, startAbs: 0, turnedIn: 0 };
    this.energy.reset(); if (this.tasks) this.tasks.reset();
    if (this.stats) this.stats.reset();
    this.summary = 'a clean slate'; this.pick = DEFAULT_DAYS;
    this.today = { year: this.day.year, doy: this.day.doy }; this.draft = this.newDraft(this.at);
    this.render();
  }
  // The title's New trip: whatever trip was under way ends (logged as abandoned), the mode is the one picked, and
  // the counter opens at the landing the canoe comes to.
  abandon(mode = null) {
    if (this.core) { this.core.abandon(); this.core.reset(mode || this.core.mode); }
    if (this.open) this.hide();
    this.trip = { active: false, ep: null, days: this.trip.days || DEFAULT_DAYS, started: null, startAbs: 0, turnedIn: 0 };
    this.summary = null; this.draft = null; this.evac = null;
    if (this.energy) this.energy.food = 0;
    this.pendingShow = true;
    this.save();
  }
  turnIn() {
    const got = this.tasks.turnIn();
    if (!got.length) return;
    this.trip.turnedIn += got.length;
    const unlocked = got.filter((g) => g.unlock).map((g) => g.unlock.label);
    this.hud.note(`${line('turnIn')}${unlocked.length ? ` Off the wall: ${unlocked.join(', ')}.` : ''}`, 7);
    this.save();
    this.render();
  }

  // --- the evacuation (trip.js runs it; these are the counter's side) -------------------------------------------
  // at full dark: the trip is over
  evacuated() {
    this.trip = { active: false, ep: null, days: this.trip.days, started: null, startAbs: 0, turnedIn: 0 };
    this.summary = null; this.draft = null;
    if (this.open) this.hide();
    this.save();
  }
  // faded back: the counter at the landing you woke at
  afterEvac(to) { if (to) { this.lineKind = 'after'; this.pendingShow = true; } }
  startEvac() {
    if (this.core) return this.core.evacuate('food');
    // no trip core: the old way, a fresh pack at the nearest landing
    if (this.evac) return;
    const to = this.nearest(this.player.x, this.player.z).l;
    this.evac = { t: 0, to, moved: false };
    if (this.veil) this.veil.card({ kicker: `${to.name} · entry point ${to.ep}`, text: `“${line('evac')}”`, sub: `Back at the ${this.lakeOf(to)} landing with a fresh pack.`, hold: 3 });
  }
  updateEvac(dt) {
    const e = this.evac;
    e.t += dt;
    if (e.t < EVAC_FADE || e.moved) return;
    e.moved = true;
    const finish = () => {
      if (!this.trip.active) this.start();
      this.energy.food = this.trip.days || DEFAULT_DAYS; this.energy.value = 1; this.energy.warned = false;
      this.evac = null; this.hud.note(`Fresh pack, ${this.energy.food} days. Take it easy.`); this.save();
    };
    Promise.resolve(this.onTeleport ? this.onTeleport(e.to.x, e.to.z) : true).then(finish, finish);
  }

  // --- persistence -------------------------------------------------------------------------------------------
  save() {
    const p = this.player;
    const data = { v: 2, trip: this.trip, pos: { x: p.x, z: p.z, heading: p.heading }, energy: this.energy.serialize(), tasks: this.tasks ? this.tasks.serialize() : null };
    if (this.core) data.core = this.core.serialize();
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(data)); } catch { /* storage full or private mode */ }
  }
  load() {
    try { const s = localStorage.getItem(SAVE_KEY); return s ? JSON.parse(s) : null; } catch { return null; }
  }
  // On load: resume a trip where it was left, or open the counter at the landing. A document without a trip core
  // is from before it and comes back as Sandbox (trip.js).
  async boot() {
    const d = this.load();
    if (d && d.tasks && this.tasks) this.tasks.restore(d.tasks);
    if (d && this.core) this.core.restoreFrom(d);
    if (d && d.trip && d.trip.active) {
      this.trip = { ...this.trip, ...d.trip };
      if (d.energy) this.energy.restore(d.energy);
      this.pendingShow = false;
      if (d.pos && Math.hypot(d.pos.x - this.player.x, d.pos.z - this.player.z) > 40 && this.onTeleport) await this.onTeleport(d.pos.x, d.pos.z);
      const core = this.core, dw = core && core.active ? core.dayWords() : '';
      this.hud.note(`${this.player.mode === 'paddle' ? 'Back on the water' : 'Back ashore'}${dw ? `, ${dw}` : ''}: ${fmtDaysWords(this.energy.food)} of food, energy ${Math.round(this.energy.value * 100)} %.`);
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
