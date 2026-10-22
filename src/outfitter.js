// Outfitters at the entry point landings: a name for each, the panel (task board, supplies, the trip), the
// trip itself (days of food, where you are, when it started) and its persistence. The outfitter is where a
// trip starts and ends and where tasks are taken and turned in; between visits it leaves you alone.

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

const LINES = {
  welcome: ['Morning. Pack is on the dock whenever you are.', 'Weather looks fair. Take what you need.', 'Board is up by the door if you want something to chase.', 'No hurry. The lake keeps.'],
  evac: ['Rough one. We came out and got you — dry clothes, hot food, fresh pack. The lake is still there.', 'Heard you ran out. Never mind; it happens to everyone once. Here is a full pack.', 'We took the motor out and fetched you in. Eat something. Go back out when you like.'],
  turnIn: ['Well, look at that. Much obliged.', 'That is the one. Thank you kindly.', 'Knew you would. Take something off the wall.'],
};
const line = (k) => LINES[k][Math.floor(Math.random() * LINES[k].length)];

const NEAR = 25;                 // metres from the landing within which E opens the panel
const SAVE_KEY = 'bwca-canoe-trip';
const DEFAULT_DAYS = 4, MIN_DAYS = 2, MAX_DAYS = 7;
const EVAC_FADE = 1.4;           // seconds of fade before the move

export class Outfitter {
  constructor(world, player, { energy, tasks, hud, day, onTeleport }) {
    this.world = world; this.player = player; this.energy = energy; this.tasks = tasks; this.hud = hud; this.day = day;
    this.onTeleport = onTeleport;
    this.landings = world.entryPoints.map((ep) => ({ ep: ep.ep, name: outfitterName(ep), place: ep.name, x: ep.x, z: ep.z, lake: ep.lake }));
    this.trip = { active: false, ep: null, days: DEFAULT_DAYS, started: null, startAbs: 0, turnedIn: 0 };
    this.open = false; this.at = null; this.near = null; this.pick = DEFAULT_DAYS;
    this.saveTimer = 0; this.evac = null; this.summary = null; this.writing = false; this.greeting = '';
    this.el = {
      panel: document.getElementById('outfitter'), dim: document.getElementById('paneldim'), name: document.getElementById('of-name'),
      sub: document.getElementById('of-sub'), trip: document.getElementById('of-trip'), board: document.getElementById('of-board'),
      log: document.getElementById('of-log'), evac: document.getElementById('evac'), evacText: document.getElementById('evac-text'),
    };
    if (this.el.panel) {
      this.el.panel.addEventListener('click', (e) => { const b = e.target.closest('[data-act]'); if (b) this.act(b.dataset.act, b.dataset.id); });
      window.addEventListener('keydown', (e) => { if (this.open && (e.code === 'Escape' || e.code === 'KeyE')) this.close(); });
    }
    if (this.el.dim) this.el.dim.addEventListener('click', () => this.close());
  }

  nearest(x, z) {
    let best = null;
    for (const l of this.landings) { const d = Math.hypot(l.x - x, l.z - z); if (!best || d < best.d) best = { l, d }; }
    return best;
  }
  get loadFactor() { return (1 + 0.06 * (this.energy ? this.energy.food : 0)) * (this.tasks && this.tasks.has('kevlar') ? 0.85 : 1); }
  get daysOut() { return this.trip.active ? (this.day.doy * 24 + this.day.hours - this.trip.startAbs) / 24 : 0; }

  // Before the player moves: who is nearby, E at the dock, and the panel (or an evac) holds the paddle still.
  update(dt) {
    const p = this.player;
    const n = p.mode === 'paddle' && !p.landing && !p.teleporting ? this.nearest(p.x, p.z) : null;
    this.near = n && n.d < NEAR ? n.l : null;
    p.suppressLanding = !!this.near;
    p.input.paused = this.open || !!this.evac;
    p.loadFactor = this.loadFactor;
    if (this.near && !this.open && !this.evac && p.input.pressed('KeyE')) this.show(this.near);
    if (this.evac) this.updateEvac(dt);
    if (this.trip.active) { this.saveTimer += dt; if (this.saveTimer > 8) { this.saveTimer = 0; this.save(); } }
  }
  // after the player moved: the dock's prompt, unless something more pressing is being said
  prompt() {
    const p = this.player;
    if (this.near && !this.open && !this.evac && (!p.prompt || p.prompt.key === 'E')) p.prompt = { key: 'E', text: `${this.near.name} · entry point ${this.near.ep}` };
  }

  // --- the panel -------------------------------------------------------------------------------------------
  show(landing) {
    this.at = landing; this.open = true; this.greeting = line('welcome');
    this.pick = this.trip.active ? Math.max(MIN_DAYS, Math.min(MAX_DAYS, Math.round(this.energy.food))) || DEFAULT_DAYS : this.trip.days || DEFAULT_DAYS;
    this.el.panel.classList.add('show'); if (this.el.dim) this.el.dim.classList.add('show');
    this.render();
    if (this.tasks && this.tasks.board.length < 3 && !this.writing) {
      this.writing = true;
      this.tasks.generate(landing).catch((e) => console.warn('task board', e)).finally(() => { this.writing = false; this.render(); });
    }
  }
  close() {
    if (!this.open) return;
    if (!this.trip.active) { this.start(this.pick); return; } // leaving the start panel is starting the trip
    this.open = false; this.summary = null;
    this.el.panel.classList.remove('show'); if (this.el.dim) this.el.dim.classList.remove('show');
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

  render() {
    if (!this.open || !this.el.panel) return;
    const e = this.el, a = this.at, trip = this.trip, en = this.energy, t = this.tasks;
    const lakeName = this.world.lakeName(a.lake) || a.place;
    e.name.textContent = a.name;
    e.sub.textContent = `Entry point ${a.ep} · ${lakeName} · ${this.greeting}`;
    const food = en.food, foodTxt = food <= 0 ? 'the food pack is empty' : `${fmtDays(food)} of food left`;
    const days = `<div class="days"><button data-act="less" title="fewer days">−</button><b>${this.pick}</b><span>days of food</span><button data-act="more" title="more days">+</button></div>`;
    if (!trip.active) {
      e.trip.innerHTML = `<h3>The trip</h3>${this.summary ? `<p class="muted">${this.summary}</p>` : ''}<p>Each day of food is a meal at dawn and one at dusk, and a little more weight on the portages.</p>${days}<div class="row"><button class="go" data-act="start">Push off</button></div>`;
    } else {
      e.trip.innerHTML = `<h3>The trip</h3><p>Out ${fmtDays(this.daysOut)} from ${this.trip.fromName || 'the landing'} · energy ${Math.round(en.value * 100)}% · ${foodTxt}.</p>${days}<div class="row"><button data-act="resupply">Repack to ${this.pick} days</button><button class="quiet" data-act="end">End the trip here</button></div>`;
    }
    // the board: accepted tasks first (done ones ready to turn in), then what is on offer
    const card = (task, mode) => {
      const kind = { item: 'Lost and found', survey: 'Survey', fish: 'Fishing' }[task.kind];
      const btn = mode === 'offer' ? `<button data-act="accept" data-id="${task.id}">Take it on</button>`
        : task.status === 'done' ? `<span class="tag">Done — turn it in</span>` : `<button class="quiet" data-act="drop" data-id="${task.id}">Let it go</button>`;
      return `<div class="task ${task.status === 'done' ? 'done' : ''}"><div class="kind">${kind} · posted at ${task.fromName}</div><div class="clue">${task.clue}</div>${btn}</div>`;
    };
    let board = '<h3>Task board</h3>';
    if (t) {
      const done = t.active.filter((x) => x.status === 'done');
      if (done.length) board += `<div class="row" style="margin:0 0 10px"><button class="go" data-act="turnin">Turn in ${done.length === 1 ? 'the finished task' : `${done.length} finished tasks`}</button></div>`;
      for (const task of t.active) board += card(task, 'active');
      if (t.board.length) board += `<div class="kind-head">On offer</div>`;
      for (const task of t.board) board += card(task, 'offer');
      if (this.writing) board += '<p class="muted">Writing up the board…</p>';
      else if (!t.board.length && !t.active.length) board += '<p class="muted">Nothing on the board today.</p>';
    }
    e.board.innerHTML = board;
    const tally = t ? t.tally : { item: 0, survey: 0, fish: 0 };
    const total = tally.item + tally.survey + tally.fish;
    const unl = t && t.unlocks.length ? `<ul>${t.unlocks.map((u) => `<li>${u.label}</li>`).join('')}</ul>` : '<p class="muted">Nothing yet. The wall is full of lures.</p>';
    e.log.innerHTML = `<h3>Your log</h3><p>${total ? `${total} task${total === 1 ? '' : 's'} turned in: ${tally.item} found, ${tally.survey} surveyed, ${tally.fish} fished.` : 'No tasks turned in yet.'}</p><div class="kind-head">Gear unlocked</div>${unl}<div class="row"><button class="quiet" data-act="new" title="forget this trip, the log and the gear">New trip</button></div>`;
  }

  // --- the trip ----------------------------------------------------------------------------------------------
  start(days) {
    const a = this.at || this.nearest(this.player.x, this.player.z).l;
    this.trip = { active: true, ep: a.ep, days, started: this.day.clock, startAbs: this.day.doy * 24 + this.day.hours, turnedIn: 0, fromName: this.world.lakeName(a.lake) || a.place };
    this.energy.food = days; this.energy.value = 1;
    this.summary = null;
    this.open = false;
    this.el.panel.classList.remove('show'); if (this.el.dim) this.el.dim.classList.remove('show');
    this.hud.note(`${days} days of food in the pack. Push off when you like.`);
    this.save();
  }
  end() {
    const turned = this.trip.turnedIn, out = fmtDays(this.daysOut);
    this.summary = `Trip ended at ${this.at.name}: ${out} out, ${turned} task${turned === 1 ? '' : 's'} turned in.`;
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
    this.summary = 'A clean slate.'; this.pick = DEFAULT_DAYS;
    this.render();
  }
  turnIn() {
    const got = this.tasks.turnIn();
    if (!got.length) return;
    this.trip.turnedIn += got.length;
    const unlocked = got.filter((g) => g.unlock).map((g) => g.unlock.label);
    this.hud.note(`${line('turnIn')}${unlocked.length ? ` Unlocked: ${unlocked.join(', ')}.` : ''}`, 7);
    this.save();
    this.render();
  }

  // --- the evac: a fade, a line from the outfitter, and the canoe back at the nearest landing --------------
  startEvac() {
    if (this.evac) return;
    const to = this.nearest(this.player.x, this.player.z).l;
    this.evac = { t: 0, to, moved: false };
    if (this.el.evac) { this.el.evacText.innerHTML = `<b>${to.name}</b><br/>${line('evac')}`; this.el.evac.classList.add('show'); }
  }
  updateEvac(dt) {
    const e = this.evac;
    e.t += dt;
    if (e.t < EVAC_FADE || e.moved) return;
    e.moved = true;
    const finish = () => {
      if (!this.trip.active) this.start(this.trip.days || DEFAULT_DAYS);
      this.energy.food = this.trip.days || DEFAULT_DAYS; this.energy.value = 1; this.energy.warned = false;
      setTimeout(() => { if (this.el.evac) this.el.evac.classList.remove('show'); this.evac = null; this.hud.note(`Fresh pack, ${this.energy.food} days. Take it easy.`); this.save(); }, 2200);
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
  // On load: resume a trip where it was left, or open the start panel at the landing.
  async boot() {
    const d = this.load();
    if (d && d.tasks && this.tasks) this.tasks.restore(d.tasks);
    if (d && d.trip && d.trip.active) {
      this.trip = { ...this.trip, ...d.trip };
      if (d.energy) this.energy.restore(d.energy);
      if (d.pos && Math.hypot(d.pos.x - this.player.x, d.pos.z - this.player.z) > 40 && this.onTeleport) await this.onTeleport(d.pos.x, d.pos.z);
      this.hud.note(`Back on the water: ${fmtDays(this.energy.food)} of food, energy ${Math.round(this.energy.value * 100)}%.`);
      return;
    }
    const n = this.nearest(this.player.x, this.player.z);
    this.show(n.l);
  }
}

function fmtDays(d) {
  if (d <= 0) return 'no days';
  const whole = Math.floor(d + 1e-6), half = d - whole >= 0.5 - 1e-6 && d - whole < 0.99;
  const n = half ? `${whole}½` : String(Math.round(d));
  return `${n} day${n === '1' ? '' : 's'}`;
}
