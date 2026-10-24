// The front door. After loading, the live scene (golden hour, the clock stopped, a camera drifting slowly
// round the canoe) renders behind the card, set in Air on a flat deep band: the name, a line, and a plain-text
// menu (Continue / New season / Settings / Controls) with the entry points as a second column beside New season, and
// above them the way to travel (Adventure, a season of open trips; or Sandbox, no limits). A new season is the mode,
// then home: the entry point picked, where you start with $40 and the starting kit (profile.js).
// Esc during play brings the same card back as a pause screen. Keyboard first: the arrows move between items
// (← → between the two columns), Enter picks, Esc goes back. While the card is up it owns the keyboard (a
// capturing listener stops the game's key handlers) and the HUD is hidden (body.shell-open, shell.css).
import './shell.css';
import * as THREE from 'three';
import { SettingsPanel } from './settings.js';
import { clock12, shortDate } from './hud.js';
import { save } from './save.js';

const $ = (id) => document.getElementById(id);
const DRIFT_RATE = 0.045;   // rad/s round the canoe
const DRIFT_RADIUS = 23;    // metres, where there is water for it
const MODES = {
  adventure: 'Open trips: buy food, take notices.',
  sandbox: 'The same lakes, with no limits.',
};

// the controls reference (the Controls item), by what you are doing
const KEYMAP = [
  ['On the water', [
    [['W', 'S'], 'paddle forward, back'], [['A', 'D'], 'turn the hull while held, as sweep strokes'],
    [['Shift'], 'hustle'], [['Space'], 'brace in a sea (you cannot paddle while bracing)'],
    [['E'], 'go ashore · portage at a landing · at an outfitter’s dock, come alongside and step up onto the deck · pick up a find · right the canoe after a capsize'], [['Q'], 'the other choice at a shore: go ashore at a landing, leave the beached canoe'],
    [['I'], 'the book at the pack: right-click food to eat it (a snack as it is; a meal or a fish is cooked on a fire’s grate first)'], [['H'], 'the headlamp (afloat or on foot)'],
  ]],
  ['On foot: the dot', [
    [['W', 'A', 'S', 'D'], 'walk where you look: W toward it, S back, A and D strafe'], [['Shift'], 'jog'],
    [['Space'], 'walking into it: vault a log or a low rock, climb a rock or a ledge up to about 2 m; otherwise a hop · with the canoe overhead you only stagger'],
    [['E'], 'what the dot in the middle of the view points at, within reach (its rim and its word show under the dot): pick it up (wood, a pack, a barrel, a thing on the ground), talk, open (a shelf, the board, the map table, the counter, or the book at a camp’s fire ring, tent or latrine), get in the canoe. Pointed at nothing, E does nothing · with the canoe overhead: launch, or set it down'],
    [['Q'], 'only travel: leave the canoe where you stepped out · shoulder a canoe lying by · at a trail head, fetch what is left · with the canoe overhead, take one more thing too, set it down, or launch and leave what is left. Nothing is dropped on Q: things go down from the book’s Ground area'],
    [['W'], 'past your depth: swim (Shift harder) · Space climbs out onto a rock, a dock or the bank · E at the canoe climbs in'],
  ]],
  ['At an outfitter', [
    [['E'], 'from the water at the dock: alongside, and up onto the deck; walk up the steps and in · inside, point at the counter (a bunk, a ride up the road, the season permit, claims), the cork board, a shelf (from either side), the lure wall or the map table: yours on the left, theirs on the right'],
    [['Q'], 'at the counter: a word with the keeper'],
    [['M'], 'in a store or at its map table: the whole Boundary Waters with the sheets dotted over it, “$8 here” at this table and “✓ yours” in ink. A sheet bought is yours for the season, never carried'],
    [[], 'a trip begins as you push off from an outfitter’s dock and ends by itself when you come in on foot at any outfitter’s landing: the logbook says “came in”'],
  ]],
  ['People', [
    [['E'], 'talk to someone the dot is on (again: their task) · choose with 1–9 or a click, Esc to leave'], [['T'], 'what was said: the last six lines'],
  ]],
  ['At camp: the book is the workbench', [
    [['I'], 'near a camp’s things the pack side shows them as panels beside your own: the fire ring (Fuel, the grate, the ash; Light, Cook, Douse), your tent (Strike, Sleep), the latrine (Use), a hung barrel (Lower), the water’s edge (Fill the bottle), the canoe (Load everything here). E at a fire ring, tent or latrine opens the book at its panel'],
    [['drag'], 'wood into the fire’s Fuel (a branch burns short, a log long, a branch catches on hot coals) · a pot, a meal or a fish onto the grate · a pack or a barrel by its strap to your back, chest, a hand, the canoe or the ground · anything onto the Ground area to set it down at your feet (wood alone makes a woodpile)'],
    [['hold'], 'a held button (Light, Douse, Strike, Lower, Carry on pitching, the saw) works while the mouse is held on it, its ring filling; let go and it stops where it got to'],
    [['right-click'], 'a thing in the book: Pitch (a tent), Hang it from a tree (a blue barrel, standing under a big pine or a birch), Eat it, and the rest'],
    [['click', 'E'], 'held, with a tent’s ghost or a barrel’s rope out: place it where the dot is and work through the phases (the ghost green where it can stand) · Esc or a right-click puts it away'],
    [['←', '→'], 'the wake-time card at Sleep: when to wake (first light, 7:00, 9:00); E turns in, Esc not yet · nothing at camp is struck, put out or packed for you: what you leave stays'],
  ]],
  ['The camera', [
    [['C'], 'raise it (the $25 35 mm, or the disposable a photo notice lends) · C or Esc lowers it'], [['wheel'], 'zoom from a normal lens to a long one (Q and E held too)'],
    [['Space', 'click'], 'take the picture: a subject near the middle, near enough and in sight counts'], [['mouse'], 'aim (the arrows and WASD too, Shift for a fine hand)'],
  ]],
  ['Fishing', [
    [['F'], 'take up the rod · put it down'], [['Space', 'click'], 'hold to load a cast where the cursor points, let go to cast · set the hook · hold to reel'],
    [['1', '2', '…'], 'change the lure: the ones you have with you, in the strip’s order'], [['E', 'K'], 'let the fish go · keep it on the stringer'],
  ]],
  ['Looking', [
    [['Tab'], 'hold for the readout: where, water, way, wind, light, energy (what holds it down), pack, tasks · in the book: the other side'],
    [['M'], 'hold to glance at the map, press for the sheet (drag, wheel, click a spot to paddle in): in the wild only the sheets you own, blank paper elsewhere (with none, you and a compass); at an outfitter the whole map'],
    [['J'], 'the book: the journal (the trip, catches, tasks, lakes, trips, photos), and the pack with Tab (L opens it too)'],
    [['I'], 'the book at the pack: what you carry, what is in reach and what is near, to move, eat or use (drag, R turns, right-click, held buttons)'], [['V'], 'from the paddler’s seat · behind the canoe'],
    [['mouse'], 'look: in first person and on foot the first key or click takes the mouse and it turns you at once (on foot the dot sits in the middle of the view); behind the canoe, drag to orbit, wheel to zoom'], [['Esc'], 'frees the mouse when it is taken, puts away a tent’s ghost or a barrel’s rope, otherwise this menu'],
    [[], 'the energy bar, top left when it matters: green is the energy you have; the chunks at its end are what each need takes off how high it can go: cold (a snowflake, dotted pale blue), sleep (zz, orange), hunger (a fork and knife, yellow), thirst (a drop, blue), dashed while growing'],
  ]],
  ['The clock and the weather', [
    [['1', '2', '3'], 'game speed 1× 2× 4×, on top of the pace (Settings › Controls; when the rod is down)'], [['[', ']'], 'time of day back, forward an hour (Sandbox)'], [['-', '='], 'the date back, forward a day, Shift a month (Sandbox)'],
    [['P'], 'stop the clock (Sandbox)'], [[',', '.'], 'less, more wind (Sandbox)'], [['/'], 'veer the wind (Sandbox)'], [[';'], 'let the weather be (Sandbox)'], [['R'], 'the shore in the water'], [['N'], 'sound'],
  ]],
];

export class Title {
  // targets: { world, player, chase, camera, day, hud, settings, saver, saved, trip, outfitter } — saved is the spot saved
  // at the last stop (save.js TripSaver, or null), trip the trip's rules (trip.js)
  constructor(t) {
    Object.assign(this, t);
    this.modePick = save.read('tripMode') === 'sandbox' ? 'sandbox' : 'adventure'; // the way a new trip travels
    this.state = 'game'; // 'title' | 'pause' | 'game'
    this.card = 'menu';
    this.busy = false;
    this.pausedRunning = true;
    this.el = {
      shell: $('shell'), menu: $('title-card'), settingsCard: $('settings-card'), controlsCard: $('controls-card'),
      kicker: $('title-kicker'), go: $('btn-continue'), hint: $('continue-hint'), newTrip: $('btn-new'), settings: $('btn-settings'), controls: $('btn-controls'),
      entries: $('entry-card'), list: $('entry-list'), status: $('entry-status'), modePick: $('mode-pick'), modeNote: $('mode-note'),
      settingsKicker: $('settings-kicker'), controlsKicker: $('controls-kicker'), nav: $('settings-nav'), form: $('settings-form'), keymap: $('keymap'),
    };
    this.panel = new SettingsPanel(this.settings, this.el.form, this.el.nav);
    this.drift = { angle: Math.random() * Math.PI * 2, t: 0, pos: new THREE.Vector3(), look: new THREE.Vector3(), fresh: true };
    this.confirmEp = null;  // a new season over one under way asks twice
    this.el.newTrip.textContent = 'New season';
    this.buildEntries();
    this.buildKeymap();
    this.bind();
  }

  // --- the cards ------------------------------------------------------------------------------
  buildEntries() {
    const list = this.el.list, start = this.world.meta.start;
    list.textContent = '';
    const eps = [...this.world.entryPoints].sort((a, b) => a.ep - b.ep);
    for (const ep of eps) {
      const li = document.createElement('li');
      const b = document.createElement('button'); b.type = 'button';
      const n = document.createElement('b'); n.textContent = String(ep.ep);
      b.append(n, document.createTextNode(ep.name));
      if (Math.hypot(ep.x - start.x, ep.z - start.z) < 600) { b.classList.add('current'); const s = document.createElement('small'); s.textContent = ' · the default start'; b.appendChild(s); }
      b.addEventListener('click', () => this.newSeason(ep));
      li.appendChild(b);
      list.appendChild(li);
    }
    this.el.entries.hidden = false;
    // the way to travel: Adventure or Sandbox, for the season New season begins
    const pick = this.el.modePick;
    if (pick) {
      for (const b of pick.querySelectorAll('button[data-mode]')) b.addEventListener('click', () => this.setPick(b.dataset.mode));
      this.setPick(this.modePick);
    }
  }
  modeButtons() { return this.el.modePick ? [...this.el.modePick.querySelectorAll('button[data-mode]')] : []; }
  setPick(mode) {
    this.modePick = mode === 'sandbox' ? 'sandbox' : 'adventure';
    this.confirmEp = null; if (this.el.status && /new season/i.test(this.el.status.textContent)) this.el.status.textContent = '';
    save.write('tripMode', this.modePick);
    for (const b of this.modeButtons()) { const on = b.dataset.mode === this.modePick; b.classList.toggle('on', on); b.setAttribute('aria-checked', String(on)); }
    if (this.el.modeNote) this.el.modeNote.textContent = MODES[this.modePick];
  }
  buildKeymap() {
    const k = this.el.keymap; if (!k) return;
    k.innerHTML = KEYMAP.map(([title, rows]) => `<h3>${title}</h3>${rows.map(([keys, what]) => `<div class="k"><span class="keys">${keys.map((x) => `<kbd>${x}</kbd>`).join('')}</span><span>${what}</span></div>`).join('')}`).join('');
  }

  bind() {
    const e = this.el;
    e.go.addEventListener('click', () => (this.state === 'pause' ? this.resume() : this.continueTrip()));
    e.newTrip.addEventListener('click', () => this.focusEntries());
    e.settings.addEventListener('click', () => this.showCard('settings'));
    e.controls.addEventListener('click', () => this.showCard('controls'));
    // capture phase: fires before every other key handler on the window and, while the card is up, ends the event there
    window.addEventListener('keydown', (ev) => {
      if (this.state === 'game') {
        if (ev.code === 'Escape' && !this.hud.paperOpen && !this.hud.big && !this.hud.pin && !this.player.teleporting) { ev.preventDefault(); ev.stopImmediatePropagation(); this.open('pause'); }
        return;
      }
      ev.stopImmediatePropagation();
      if (ev.code === 'Escape') { ev.preventDefault(); this.back(); return; }
      const tag = ev.target && ev.target.tagName;
      if (ev.code === 'Tab') return; // the browser's own focus order, within the card
      if (tag === 'SELECT' || tag === 'INPUT') { if (ev.code === 'ArrowDown' || ev.code === 'ArrowUp') { ev.preventDefault(); this.moveFocus(ev.code === 'ArrowDown' ? 1 : -1); } return; } // ← → belong to the control
      if (ev.code === 'ArrowDown' || ev.code === 'ArrowUp') { ev.preventDefault(); this.moveFocus(ev.code === 'ArrowDown' ? 1 : -1); }
      else if (ev.code === 'ArrowRight' || ev.code === 'ArrowLeft') {
        if (this.card !== 'menu') return;
        ev.preventDefault();
        const modes = this.modeButtons(), i = modes.indexOf(document.activeElement);
        if (i >= 0 && (ev.code === 'ArrowRight' ? i < modes.length - 1 : i > 0)) { const b = modes[i + (ev.code === 'ArrowRight' ? 1 : -1)]; this.setPick(b.dataset.mode); b.focus(); } // along the pick
        else this.switchColumn(ev.code === 'ArrowRight' ? 1 : -1);
      }
      else if (ev.code === 'Home' || ev.code === 'End') { ev.preventDefault(); this.moveFocus(ev.code === 'Home' ? -Infinity : Infinity); }
      else if (ev.code === 'Space' && tag !== 'BUTTON') ev.preventDefault(); // no page scroll
    }, true);
  }

  showCard(name) {
    this.card = name;
    const { menu, settingsCard, controlsCard, shell } = this.el;
    menu.hidden = name !== 'menu'; settingsCard.hidden = name !== 'settings'; controlsCard.hidden = name !== 'controls';
    shell.classList.toggle('wide', name === 'settings');
    shell.classList.toggle('full', name === 'controls');
    if (name === 'settings') { this.panel.show(this.panel.section); const first = this.el.nav.querySelector('button'); if (first) first.focus(); }
    else if (name === 'controls') { const k = this.el.keymap; if (k) k.scrollTop = 0; }
    else this.el.go.focus();
  }
  focusEntries() {
    const home = this.el.list.querySelector('small.home');
    const cur = (home && home.parentElement) || this.el.list.querySelector('button.current') || this.el.list.querySelector('button');
    if (cur) { cur.focus(); cur.scrollIntoView({ block: 'nearest' }); }
  }

  back() {
    if (this.card !== 'menu') { this.showCard('menu'); return; }
    if (this.state === 'pause') this.resume();
  }

  // the two columns of the menu card: the menu items, and the entry points
  columns() {
    const items = [...this.el.menu.querySelectorAll('.menu .item:not([disabled])')];
    const pick = this.modeButtons().filter((b) => b.classList.contains('on'));
    const list = [...pick, ...this.el.list.querySelectorAll('button:not([disabled])')];
    return [items, list];
  }
  focusables() {
    if (this.card === 'menu') {
      const [items, list] = this.columns();
      const inList = list.includes(document.activeElement) || this.modeButtons().includes(document.activeElement);
      return inList ? list : items;
    }
    const card = this.card === 'settings' ? this.el.settingsCard : this.el.controlsCard;
    return [...card.querySelectorAll('button:not([disabled]), select, input:not([type=radio]), input[type=radio]:checked')].filter((n) => n.offsetParent !== null);
  }
  moveFocus(step) {
    const items = this.focusables(); if (!items.length) return;
    let i = items.indexOf(document.activeElement);
    if (!Number.isFinite(step)) i = step < 0 ? 0 : items.length - 1;
    else i = i < 0 ? (step > 0 ? 0 : items.length - 1) : (i + step + items.length) % items.length;
    items[i].focus();
    if (items[i].scrollIntoView) items[i].scrollIntoView({ block: 'nearest' });
  }
  switchColumn(dir) {
    const [items, list] = this.columns();
    if (dir > 0 && items.includes(document.activeElement)) this.focusEntries();
    else if (dir < 0 && (list.includes(document.activeElement) || this.modeButtons().includes(document.activeElement))) this.el.newTrip.focus();
  }

  // --- open / close -----------------------------------------------------------------------------
  open(mode) {
    if (this.state !== 'game') return;
    this.state = mode;
    const day = this.day;
    if (mode === 'title') { day.hours = this.goldenHour(); day.running = false; }
    else { this.saver.write(); this.pausedRunning = day.running; day.running = false; } // saved before the clock stops
    this.saver.enabled = false;
    document.body.classList.add('shell-open');
    this.el.shell.hidden = false; this.el.shell.classList.remove('closing');
    this.drift.t = 0; this.drift.fresh = true;
    this.camera.fov = 50; this.camera.updateProjectionMatrix();
    this.refreshMenu();
    this.showCard('menu');
  }

  close() {
    if (this.state === 'game') return;
    this.state = 'game';
    document.body.classList.remove('shell-open');
    const shell = this.el.shell;
    shell.classList.add('closing');
    setTimeout(() => { if (this.state === 'game') shell.hidden = true; }, 360);
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    this.chase.setMode(this.chase.mode); // its fov back, and it snaps into place instead of gliding in
    this.saver.enabled = true; this.saver.t = 0;
  }

  // the clock the title shows: a little before sunset on the current date
  goldenHour() {
    const set = this.day.sunriseSunset.set;
    return set != null ? Math.max(0, set - 0.65) : 18.5;
  }

  get profile() { return this.outfitter ? this.outfitter.profile : null; }
  refreshMenu() {
    const e = this.el, pause = this.state === 'pause', trip = this.saved, core = this.trip, pr = this.profile;
    const p = this.player, w = this.world, o = this.outfitter;
    const here = () => p.placeName || w.lakeName(w.lakeIdAt(p.x, p.z) || (p.nearWater ? p.nearWater(p.x, p.z, 12) : 0)) || (p.mode === 'paddle' ? 'open water' : 'ashore'); // on foot: the water beside you
    // "Adventure · day 2 · $22", or the old words without a trip core
    const money = pr && pr.started ? ` · $${pr.money}` : '';
    const tripDays = (core ? (core.active ? ` · ${core.menuWords(pause ? null : trip)}` : pr && pr.started ? ' · between trips' : '') : o && o.trip && o.trip.active ? ` · day ${Math.floor(o.daysOut) + 1}` : '') + money;
    this.confirmEp = null; e.status.textContent = '';
    const kicker = pause ? `Paused · ${here()} · ${clock12(this.day.hours)}` : 'Boundary Waters Canoe Area Wilderness';
    e.kicker.textContent = kicker;
    e.settingsKicker.textContent = pause ? kicker : 'Boundary Waters';
    e.controlsKicker.textContent = pause ? kicker : 'Boundary Waters';
    const season = !!(pr && pr.started);
    e.go.textContent = pause ? 'Paddle on' : season ? 'Continue' : 'Paddle in';
    if (pause) e.hint.textContent = `${here()} · ${clock12(this.day.hours)}${tripDays}`;
    else if (trip && season) e.hint.textContent = `Continue on ${here()} · ${shortDate(trip.year, trip.doy)} · ${clock12(trip.hours)}${tripDays}`;
    else if (season) e.hint.textContent = `Continue the season${tripDays}`;
    else { const s = w.meta.start; e.hint.textContent = `Begin a season at ${w.lakeName(w.lakeIdAt(s.x, s.z)) || 'Lake One'}, the default landing`; }
    e.newTrip.classList.toggle('current', !pause && !trip && !season);
    // home, marked in the list of entry points
    for (const b of e.list.querySelectorAll('button')) {
      const n = Number(b.querySelector('b') && b.querySelector('b').textContent), isHome = season && pr.home === n;
      let tag = b.querySelector('small.home');
      if (isHome && !tag) { tag = document.createElement('small'); tag.className = 'home'; tag.textContent = ' · home'; b.appendChild(tag); }
      else if (!isHome && tag) tag.remove();
      for (const s of b.querySelectorAll('small:not(.home)')) s.hidden = season; // 'the default start' says nothing once home is set
    }
  }

  // --- the three ways out --------------------------------------------------------------------
  continueTrip() {
    const t = this.saved, day = this.day, pr = this.profile, o = this.outfitter;
    // no season yet: one begins at the landing nearest the canoe (the default start), in the mode picked
    if (pr && !pr.started && o && o.newSeason) o.newSeason(o.nearest(this.player.x, this.player.z).l.ep, this.modePick);
    else if (this.trip && !this.trip.active && !(o && o.load())) this.trip.setMode(this.modePick); // a first trip travels the way picked
    if (t) {
      day.setClock(t.year, t.doy, t.hours); day.running = t.running !== false;
      if (t.camera && t.camera !== this.chase.mode) this.chase.setMode(t.camera);
      if (t.timeScale) this.player.timeScale = t.timeScale;
    } else {
      const now = new Date();
      day.setClock(now.getFullYear(), dayOfYear(now), now.getHours() + now.getMinutes() / 60); day.running = true;
    }
    this.close();
    this.saver.write();
  }

  resume() { this.day.running = this.pausedRunning; this.close(); }

  // New season → the mode → home: the entry point picked. Over a season under way it asks twice (the first pick says
  // what is forgotten, the same pick again begins).
  async newSeason(ep, { confirm = true } = {}) {
    if (this.busy) return;
    const pr = this.profile;
    if (confirm && pr && pr.started && this.confirmEp !== ep.ep) {
      this.confirmEp = ep.ep;
      const n = pr.known.length;
      this.el.status.textContent = `A new season at ${ep.name} forgets the $${pr.money}, the gear and ${n} ${n === 1 ? 'outfitter' : 'outfitters'} known. Pick it again to begin.`;
      return;
    }
    this.confirmEp = null;
    this.busy = true;
    const buttons = [...this.el.list.querySelectorAll('button')];
    for (const b of buttons) b.disabled = true;
    this.el.status.textContent = `Paddling in at ${ep.name}…`;
    // whatever trip was under way ends here (a stale active save would otherwise call the canoe back on boot), and the
    // season travels the way picked, from home; the counter opens at its landing
    if (this.outfitter && this.outfitter.newSeason) this.outfitter.newSeason(ep.ep, this.modePick);
    else if (this.outfitter && this.outfitter.abandon) this.outfitter.abandon(this.modePick);
    else if (this.trip) this.trip.setMode(this.modePick);
    this.saver.clear(); this.saved = null;
    const ok = await this.player.teleport(ep.x, ep.z);
    for (const b of buttons) b.disabled = false;
    this.busy = false;
    if (!ok) { this.el.status.textContent = `No open water near the ${ep.name} landing; try another.`; return; }
    this.el.status.textContent = '';
    const now = new Date();
    this.day.setClock(now.getFullYear(), dayOfYear(now), now.getHours() + now.getMinutes() / 60); this.day.running = true;
    this.player.timeScale = this.settings.get('speed');
    if (this.chase.mode !== this.settings.get('camera')) this.chase.setMode(this.settings.get('camera'));
    this.close();
    this.saver.write();
  }
  newTrip(ep) { return this.newSeason(ep, { confirm: false }); } // the trip core's name for it (its tests call it)

  // --- the drifting camera (called in place of the chase camera while the card is up) ----------
  update(dt) {
    if (this.state === 'game') return;
    const d = this.drift, p = this.player, w = this.world, cam = this.camera;
    d.t += dt; d.angle += dt * DRIFT_RATE;
    const level = w.levelAt(p.x, p.z);
    // the biggest radius along this bearing that is still over water, so the shore trees stay out of the way
    let r = DRIFT_RADIUS + 4 * Math.sin(d.t * 0.07), px = 0, pz = 0;
    for (; r > 7; r -= 2) { px = p.x + Math.cos(d.angle) * r; pz = p.z + Math.sin(d.angle) * r; if (w.shoreAt(px, pz) < -3) break; }
    let py = level + 3.6 + 1.1 * Math.sin(d.t * 0.11);
    const ground = Math.max(w.heightAt(px, pz), level) + 1.8;
    if (py < ground) py = ground;
    const look = this.drift.look.set(p.x + p.forward.x * 2.5, level + 0.5, p.z + p.forward.z * 2.5);
    if (d.fresh) { d.pos.set(px, py, pz); d.fresh = false; }
    else d.pos.lerp(_v.set(px, py, pz), 1 - Math.exp(-dt * 1.6));
    cam.position.copy(d.pos);
    cam.lookAt(look);
  }
}
const _v = new THREE.Vector3();

export function dayOfYear(date) { return Math.floor((date - new Date(date.getFullYear(), 0, 0)) / 86400000); }
