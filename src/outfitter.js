// Outfitters at the entry point landings: a name for each, the counter (a paper sheet: the trip permit with
// the food pack, the task board, the wall of gear), the trip itself (days of food, where you are, when it
// started) and its persistence. The outfitter is where a trip starts and ends and where tasks are taken and
// turned in; between visits it leaves you alone.
import { longDate, esc, word, plural } from './hud.js';
import { UNLOCKS } from './tasks.js';

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
const EVAC_FADE = 1.4;           // seconds of fade before the move
const EVAC_OUT = 2.2;            // seconds of fade after it

export class Outfitter {
  constructor(world, player, { energy, tasks, hud, day, stats = null, onTeleport }) {
    this.world = world; this.player = player; this.energy = energy; this.tasks = tasks; this.hud = hud; this.day = day; this.stats = stats;
    this.onTeleport = onTeleport;
    this.landings = world.entryPoints.map((ep) => ({ ep: ep.ep, name: outfitterName(ep), place: ep.name, x: ep.x, z: ep.z, lake: ep.lake }));
    this.trip = { active: false, ep: null, days: DEFAULT_DAYS, started: null, startAbs: 0, turnedIn: 0 };
    this.open = false; this.at = null; this.near = null; this.pick = DEFAULT_DAYS;
    this.saveTimer = 0; this.evac = null; this.summary = null; this.writing = false; this.greeting = '';
    this.el = {
      panel: document.getElementById('outfitter'), evac: document.getElementById('evac'),
      evacKicker: document.getElementById('evac-kicker'), evacText: document.getElementById('evac-text'), evacSub: document.getElementById('evac-sub'),
    };
    if (this.el.panel) {
      this.el.panel.addEventListener('click', (e) => { const b = e.target.closest('[data-act]'); if (b) this.act(b.dataset.act, b.dataset.id); });
      window.addEventListener('keydown', (e) => { if (this.open && (e.code === 'Escape' || e.code === 'KeyE')) { this.close(); this.player.input.once.delete('KeyE'); } }); // the same E must not reopen it
    }
    if (hud && hud.registerPaper) hud.registerPaper('outfitter', () => this.close());
  }

  nearest(x, z) {
    let best = null;
    for (const l of this.landings) { const d = Math.hypot(l.x - x, l.z - z); if (!best || d < best.d) best = { l, d }; }
    return best;
  }
  get loadFactor() { return (1 + 0.06 * (this.energy ? this.energy.food : 0)) * (this.tasks && this.tasks.has('kevlar') ? 0.85 : 1); }
  get daysOut() { return this.trip.active ? (this.day.doy * 24 + this.day.hours - this.trip.startAbs) / 24 : 0; }

  // Before the player moves: who is nearby, E at the dock, and the counter (or an evac, or the journal) holds the paddle still.
  update(dt) {
    const p = this.player;
    const n = p.mode === 'paddle' && !p.landing && !p.teleporting ? this.nearest(p.x, p.z) : null;
    this.near = n && n.d < NEAR ? n.l : null;
    p.suppressLanding = !!this.near;
    p.input.paused = this.open || !!this.evac || (this.hud && this.hud.paper === 'journal');
    p.loadFactor = this.loadFactor;
    if (this.near && !this.open && !this.evac && !(this.hud && this.hud.paper) && p.input.pressed('KeyE')) this.show(this.near);
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
    this.at = landing; this.open = true; this.greeting = line('welcome');
    this.pick = this.trip.active ? Math.max(MIN_DAYS, Math.min(MAX_DAYS, Math.round(this.energy.food))) || DEFAULT_DAYS : this.trip.days || DEFAULT_DAYS;
    if (this.hud && this.hud.openPaper) this.hud.openPaper('outfitter');
    this.el.panel.classList.add('show');
    this.render();
    if (this.tasks && this.tasks.board.length < 3 && !this.writing) {
      this.writing = true;
      this.tasks.generate(landing).catch((e) => console.warn('task board', e)).finally(() => { this.writing = false; this.render(); });
    }
  }
  close() {
    if (!this.open) return;
    if (!this.trip.active) { this.start(this.pick); return; } // leaving the counter is pushing off
    this.open = false; this.summary = null;
    this.el.panel.classList.remove('show');
    if (this.hud && this.hud.closePaper) this.hud.closePaper('outfitter');
    this.save();
  }
  act(act, id) {
    const t = this.tasks;
    if (act === 'close') this.close();
    else if (act === 'less') { this.pick = Math.max(MIN_DAYS, this.pick - 1); this.render(); }
    else if (act === 'more') { this.pick = Math.min(MAX_DAYS, this.pick + 1); this.render(); }
    else if (act === 'start') this.start(this.pick);
    else if (act === 'resupply') { this.energy.food = this.pick; this.trip.days = this.pick; this.hud.note(`Packed ${this.pick} days of food.`); this.save(); this.render(); }
    else if (act === 'end') this.end();
    else if (act === 'new') this.newTrip();
    else if (act === 'accept') { t.accept(+id); this.save(); this.render(); }
    else if (act === 'drop') { t.drop(+id); this.save(); this.render(); }
    else if (act === 'turnin') this.turnIn();
  }

  // the permit's number: the entry point and the month and day the trip began (or today's)
  permitNo(a) {
    const d = this.trip.active && this.trip.startDoy != null ? { year: this.trip.startYear, doy: this.trip.startDoy } : { year: this.day.year, doy: this.day.doy };
    const date = new Date(d.year, 0, d.doy);
    return `No. ${a.ep}-${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
  }
  tally(n) {
    let html = '';
    for (let i = 1; i <= n; i++) { if (i % 5 === 0) html += '<i class="five"></i>'; else { if (i > 1 && i % 5 === 1) html += '<i class="gap"></i>'; html += '<i></i>'; } }
    return html;
  }

  render() {
    if (!this.open || !this.el.panel) return;
    const a = this.at, trip = this.trip, en = this.energy, t = this.tasks, active = trip.active;
    const lakeName = this.world.lakeName(a.lake) || a.place, area = areaOf(a.ep);
    const kevlar = !!(t && t.has('kevlar'));
    const food = en.food;
    // the permit
    const putIn = active && trip.startDoy != null ? `${esc(trip.fromName || lakeName)}, ${longDate(trip.startYear, trip.startDoy)}` : `${esc(lakeName)}, ${longDate(this.day.year, this.day.doy)}`;
    const packNote = active
      ? `<p class="note">${food <= 0 ? 'The pack is empty.' : `${food % 1 ? `${Math.floor(food)}½` : food} ${plural(food, 'day')} of food left.`} Repack for the days you want; the counter does not charge.</p>`
      : '<p class="note">A meal at dawn and one at dusk for each day, and a little more weight on the portages. Two to seven days.</p>';
    const push = active
      ? `<button type="button" class="stamp outline big push" data-act="resupply">Repack to ${this.pick} ${plural(this.pick, 'day')}</button><div class="pencil">${this.summary ? esc(this.summary) : `out ${fmtDaysWords(this.daysOut)} from ${esc(trip.fromName || 'the landing')}`}</div>`
      : `<button type="button" class="stamp big push" data-act="start">Push off</button><div class="pencil">${this.summary ? esc(this.summary) : 'leaving the counter pushes off too'}</div>`;
    const permit = `<section class="permit" aria-labelledby="permit-h">
      <div class="top"><h3 id="permit-h">Trip permit</h3><span class="sc no">${this.permitNo(a)}</span></div>
      <div class="grid">
        <div class="lab">Put in</div><div>${putIn}</div>
        <div class="lab">Party</div><div>One canoe, one paddler</div>
        <div class="lab">Canoe</div><div>${kevlar ? 'Kevlar, 17 ft · <span class="soft">lighter on the portages</span>' : 'Aluminium, 17 ft · <span class="soft">Kevlar not yet earned</span>'}</div>
      </div>
      <div class="pack">
        <div class="lab">Food pack</div>
        <div class="stepper">
          <button type="button" class="step" data-act="less" aria-label="A day less" ${this.pick <= MIN_DAYS ? 'disabled' : ''}>−</button>
          <div class="days"><div class="tally" aria-hidden="true">${this.tally(this.pick)}</div><div class="n"><b>${this.pick}</b> days</div></div>
          <button type="button" class="step" data-act="more" aria-label="A day more" ${this.pick >= MAX_DAYS ? 'disabled' : ''}>+</button>
        </div>
        ${packNote}
      </div>
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
    const wall = `<section class="wall" aria-labelledby="wall-h">
      <div class="top"><h3 id="wall-h">The wall</h3></div>
      <p>${season}</p>
      ${have.length ? `<div class="lab">Taken off the wall</div><ul>${have.map((u) => `<li>${gearIcon(u.key)}${esc(u.label.replace(/ \(.*\)$/, ''))}</li>`).join('')}</ul>` : ''}
      <div class="lab">Still on the wall</div>
      <div class="hooks" aria-hidden="true">${left.map((u) => gearIcon(u.key, true)).join('')}</div>
      <p class="soft">${left.length ? `${leftWords.map((s, i) => (i === 0 ? s[0].toUpperCase() + s.slice(1) : s)).join(', ')} ${left.length === 1 ? 'comes' : 'come'} down for tasks turned in.` : 'The wall is bare: you have the lot.'}</p>
      <div class="ends">${active ? '<button type="button" class="stamp outline" data-act="end">End the trip here</button>' : ''}<button type="button" class="stamp quiet" data-act="new" title="forget this trip, the log and the gear">New trip · forget the log and the gear</button></div>
    </section>`;
    this.el.panel.innerHTML = `<header>
      <div class="lede"><div class="sc kicker">Entry point ${a.ep} · ${esc(lakeName)}${area ? ` · ${area}` : ''}</div><h2>${esc(a.name)}</h2><div class="say">“${esc(this.greeting)}”</div></div>
      <button type="button" class="stamp outline" data-act="close" aria-label="Leave the counter (E or Esc)">${active ? 'Back to the water' : 'Push off'} · E</button>
    </header><div class="counter">${permit}${board}${wall}</div>`;
  }

  // --- the trip ----------------------------------------------------------------------------------------------
  start(days) {
    const a = this.at || this.nearest(this.player.x, this.player.z).l;
    const d = this.day;
    this.trip = { active: true, ep: a.ep, days, started: d.clock, startAbs: d.doy * 24 + d.hours, startYear: d.year, startDoy: d.doy, startHours: d.hours, turnedIn: 0, fromName: this.world.lakeName(a.lake) || a.place };
    this.energy.food = days; this.energy.value = 1;
    if (this.stats) this.stats.reset();
    this.summary = null;
    this.open = false;
    this.el.panel.classList.remove('show');
    if (this.hud && this.hud.closePaper) this.hud.closePaper('outfitter');
    this.hud.note(`${days} days of food in the pack. Push off when you like.`);
    this.save();
  }
  end() {
    const turned = this.trip.turnedIn, out = fmtDaysWords(this.daysOut);
    this.summary = `Trip ended at ${this.at.name}: ${out} out, ${turned} ${plural(turned, 'task')} turned in.`;
    this.trip = { active: false, ep: null, days: this.trip.days, started: null, startAbs: 0, turnedIn: 0 };
    if (this.tasks) this.tasks.endTrip();
    this.energy.food = 0;
    this.save();
    this.render();
  }
  newTrip() {
    try { localStorage.removeItem(SAVE_KEY); } catch { /* private mode */ }
    this.trip = { active: false, ep: null, days: DEFAULT_DAYS, started: null, startAbs: 0, turnedIn: 0 };
    this.energy.reset(); if (this.tasks) this.tasks.reset();
    if (this.stats) this.stats.reset();
    this.summary = 'a clean slate'; this.pick = DEFAULT_DAYS;
    this.render();
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

  // --- the evac: a fade to deep, a line from the outfitter, and the canoe back at the nearest landing ---------
  startEvac() {
    if (this.evac) return;
    const to = this.nearest(this.player.x, this.player.z).l;
    this.evac = { t: 0, to, moved: false };
    const e = this.el;
    if (e.evac) {
      const days = this.trip.days || DEFAULT_DAYS, lake = this.world.lakeName(to.lake) || to.place;
      e.evacKicker.textContent = `${to.name} · entry point ${to.ep}`;
      e.evacText.textContent = `“${line('evac')}”`;
      e.evacSub.textContent = `Back at the ${lake} landing with ${word(days)} days of food. Nothing else is lost: the log, the gear and the tasks come with you.`;
      e.evac.classList.add('show');
    }
  }
  updateEvac(dt) {
    const e = this.evac;
    e.t += dt;
    if (e.t < EVAC_FADE || e.moved) return;
    e.moved = true;
    const finish = () => {
      if (!this.trip.active) this.start(this.trip.days || DEFAULT_DAYS);
      this.energy.food = this.trip.days || DEFAULT_DAYS; this.energy.value = 1; this.energy.warned = false;
      setTimeout(() => { if (this.el.evac) this.el.evac.classList.remove('show'); }, 1200);
      setTimeout(() => { this.evac = null; this.hud.note(`Fresh pack, ${this.energy.food} days. Take it easy.`); this.save(); }, 1200 + EVAC_OUT * 1000);
    };
    Promise.resolve(this.onTeleport ? this.onTeleport(e.to.x, e.to.z) : true).then(finish, finish);
  }

  // --- persistence -------------------------------------------------------------------------------------------
  save() {
    const p = this.player;
    const data = { v: 1, trip: this.trip, pos: { x: p.x, z: p.z, heading: p.heading }, energy: this.energy.serialize(), tasks: this.tasks ? this.tasks.serialize() : null };
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(data)); } catch { /* storage full or private mode */ }
  }
  load() {
    try { const s = localStorage.getItem(SAVE_KEY); return s ? JSON.parse(s) : null; } catch { return null; }
  }
  // On load: resume a trip where it was left, or open the counter at the landing.
  async boot() {
    const d = this.load();
    if (d && d.tasks && this.tasks) this.tasks.restore(d.tasks);
    if (d && d.trip && d.trip.active) {
      this.trip = { ...this.trip, ...d.trip };
      if (d.energy) this.energy.restore(d.energy);
      if (d.pos && Math.hypot(d.pos.x - this.player.x, d.pos.z - this.player.z) > 40 && this.onTeleport) await this.onTeleport(d.pos.x, d.pos.z);
      this.hud.note(`Back on the water: ${fmtDaysWords(this.energy.food)} of food, energy ${Math.round(this.energy.value * 100)} %.`);
      return;
    }
    const n = this.nearest(this.player.x, this.player.z);
    this.show(n.l);
  }
}

function fmtDaysWords(d) {
  if (d <= 0) return 'no days';
  const whole = Math.floor(d + 1e-6), half = d - whole >= 0.5 - 1e-6 && d - whole < 0.99;
  const n = half ? `${whole}½` : String(Math.round(d));
  return `${n} day${n === '1' ? '' : 's'}`;
}
