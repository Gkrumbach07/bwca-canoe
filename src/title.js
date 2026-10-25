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

// the controls reference (the Controls item), by what you are doing. fb4 D (decision 4, the owner's second round of
// 2026-10-25: "We need to go through all the keys again … It should just be one key, I, to get into the inventory"):
// the whole set is W A S D and the mouse, Shift, Space, E and Q on the dot, F, I, M, Tab held, V, H, C, 1 2 3 and Esc;
// in the book a right-click and, while dragging, R. J, L, T, K, R, N, Ctrl-click and Tab in the book are gone. A few
// keys mean something only where they are shown (the numbers for a lure with the rod up and for a choice while you
// talk, A D or ← → on the Rest dial). Sandbox's own keys are listed only in a Sandbox season.
const KEYMAP = [
  ['Moving', [
    [['W', 'A', 'S', 'D'], 'afloat: W and S paddle forward and back, A and D turn the hull while held, as sweep strokes · on foot: walk where you look, W toward it, S back, A and D strafe · past your depth: swim'],
    [['mouse'], 'look: the first key or click takes the mouse and it turns you at once (on foot the dot sits in the middle of the view); behind the canoe, drag to orbit, wheel to zoom'],
    [['Shift'], 'jog on foot · hustle afloat · a hard stroke swimming'],
    [['Space'], 'afloat: brace in a sea (you cannot paddle while bracing) · on foot, walking into it: vault a log or a low rock, climb a rock or a ledge up to about 2 m, otherwise a hop; with the canoe overhead you only stagger · swimming: climb out onto a rock, a dock or the bank'],
    [['E'], 'afloat: go ashore at any bank and at a portage landing alike · at an outfitter’s dock, tie up and step up onto the deck · right the canoe after a capsize'],
  ]],
  ['E and Q: the dot', [
    [[], 'whatever the dot in the middle of the view points at has at most two actions, both on its label: E and Q. A held one says “hold E” or “hold Q”; a greyed one says why. Pointed at nothing, E and Q do nothing'],
    [['E'], 'pick up (wood, a pack, a barrel, a bucket, a bagged tent, a find) · take one from a pile · open the fire (its card) · rest until… at your tent (A D or ← → pick the hour, E rests) · sit (E or a move key stands you up) · get in the canoe where it floats, as it lies (what you wear goes into the hull: back, chest and hands) · held at a beached canoe (nosed in, or on the bank): push it off, walking it out until it floats · fill the bottle at the water’s edge · talk to someone, the keeper behind the counter too (they open with what they last said to you; the numbers or a click choose, Esc leaves) · open a shelf, the board, the map table, the counter · held: hang the barrel at a limb, lower it, saw a down log, carry on pitching'],
    [['Q'], 'open it (a container or a pile on the ground: the book, with it on the right) · light or douse the fire, held · pitch a bagged tent (the ghost, then E held) · strike your tent, held · shoulder the canoe (with anything but the paddle, the rod and the stringer aboard, “Unload it first” opens the book at the canoe) · at a trail head, fetch what is left · with the canoe overhead: set it down, or launch and leave what is left'],
  ]],
  ['The book', [
    [['I'], 'the book, and I or Esc closes it. Pack and Journal are tabs inside it (click them). The pack: left is you (the back, the chest, each hand, the pockets with the bottle, and a tab per container you carry), right is what is around you, a tab each (the canoe beside you, a pack or a box on the ground, the wood, the ground itself). With a card open (the fire, a shelf, the counter) the card is on the right and the left has your tabs and the ground’s'],
    [['drag'], 'between any two tabs, either way · a pack or a barrel by its strap to your back, your chest, a hand or the canoe · anything off the page goes down at your feet · R turns a thing while you drag it (a drop that fits only turned turns by itself) · Shift-drag splits a stack'],
    [['right-click'], 'a thing’s verbs and nothing else: Eat, Drink, Pitch, Hang, Put in hand, Put on the stringer, Change into dry clothes, Tie it on, Look at the map. A greyed verb says why, with what it needs and what to do next'],
    [['hover'], 'what a thing is and what it does, in numbers, its weight and its state (wet, treating, cooking …) with the next step'],
  ]],
  ['Fishing and the camera', [
    [['F'], 'the rod up or down: from the canoe, or on foot with the rod in a hand, facing water within a cast'],
    [['Space', 'click'], 'with the rod up: hold to load a cast where the cursor points, let go to cast · set the hook on a bite · hold to reel in a fight; W retrieves a lure (Shift faster)'],
    [['1', '2', '…'], 'with the rod up: the lure, from the strip of the ones with you; the bobber rig takes a leech from the bucket in reach per bite, and says “needs leeches” when there is none'],
    [['E', 'Q'], 'a landed fish: keep it, in your hand (into a pack in reach with both hands full, or a notice’s cooler) · let it go'],
    [['C'], 'the camera: raise it (the $25 35 mm, or the disposable a photo notice lends) · the mouse aims, the wheel zooms, Space or a click takes the picture · C or Esc lowers it'],
  ]],
  ['Looking and the clock', [
    [['M'], 'hold to glance at the map, press for the sheet (drag, wheel, click a spot): in the wild only the sheets you own, at an outfitter the whole map · M or Esc puts it away'],
    [['Tab'], 'held: the readout, the moment only (the place, the time, the sun, the wind and the waves, the sky, your speed and heading)'],
    [['V'], 'the view: from the paddler’s eyes · from behind'],
    [['H'], 'the headlamp, day or night, afloat or on foot'],
    [['1', '2', '3'], 'the game speed: Normal, Faster ▶▶, Fastest ▶▶▶, on top of Trip or Real (Settings › Controls); the corner shows the mark while it is faster (with the rod up the numbers pick the lure)'],
    [['Esc'], 'frees the mouse when it is taken · closes the book, a card or the dial · puts away a tent’s ghost · otherwise this menu'],
    [[], 'the energy bar, the clock and the day stay in a strip at the top over the book and every card. The bar: green is the energy you have, and the chunks at its end what each need takes off how high it can go: cold (a snowflake), sleep (zz), hunger (a fork and knife), thirst (a drop), dashed while growing'],
  ]],
];
// Sandbox's own keys (the clock and the wind), shown only in a Sandbox season
const SANDBOX_KEYS = ['Sandbox only', [
  [['[', ']'], 'the time of day back, forward an hour'], [['-', '='], 'the date back, forward a day (Shift a month)'], [['P'], 'stop the clock'],
  [[',', '.'], 'less, more wind'], [['/'], 'veer the wind'], [[';'], 'let the weather be'],
]];

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
      kicker: $('title-kicker'), go: $('btn-continue'), goLi: $('li-continue'), hint: $('continue-hint'), newTrip: $('btn-new'), newHint: $('new-hint'), settings: $('btn-settings'), controls: $('btn-controls'),
      entries: $('entry-card'), list: $('entry-list'), status: $('entry-status'), modePick: $('mode-pick'), modeNote: $('mode-note'),
      confirm: $('confirm-card'), confirmSub: $('confirm-sub'), confirmGo: $('btn-confirm'), confirmKeep: $('btn-keep'),
      settingsKicker: $('settings-kicker'), controlsKicker: $('controls-kicker'), nav: $('settings-nav'), form: $('settings-form'), keymap: $('keymap'),
    };
    this.panel = new SettingsPanel(this.settings, this.el.form, this.el.nav);
    this.drift = { angle: Math.random() * Math.PI * 2, t: 0, pos: new THREE.Vector3(), look: new THREE.Vector3(), fresh: true };
    // fb3 C (17): what stands beside the menu: nothing, the confirm card (a new season over one under way asks once),
    // or the entry points (the way to travel and home, shown only after New season is chosen)
    this.right = null;
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
      b.addEventListener('click', () => this.newSeason(ep, { confirm: false })); // the list shows only once the confirm is given
      li.appendChild(b);
      list.appendChild(li);
    }
    this.el.entries.hidden = true;
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
    save.write('tripMode', this.modePick);
    for (const b of this.modeButtons()) { const on = b.dataset.mode === this.modePick; b.classList.toggle('on', on); b.setAttribute('aria-checked', String(on)); }
    if (this.el.modeNote) this.el.modeNote.textContent = MODES[this.modePick];
  }
  buildKeymap() {
    const k = this.el.keymap; if (!k) return;
    const groups = this.trip && this.trip.sandbox ? [...KEYMAP, SANDBOX_KEYS] : KEYMAP;
    k.innerHTML = groups.map(([title, rows]) => `<h3>${title}</h3>${rows.map(([keys, what]) => `<div class="k"><span class="keys">${keys.map((x) => `<kbd>${x}</kbd>`).join('')}</span><span>${what}</span></div>`).join('')}`).join('');
  }

  bind() {
    const e = this.el;
    e.go.addEventListener('click', () => (this.state === 'pause' ? this.resume() : this.continueTrip()));
    e.newTrip.addEventListener('click', () => this.askNewSeason());
    e.settings.addEventListener('click', () => this.showCard('settings'));
    e.controls.addEventListener('click', () => this.showCard('controls'));
    if (e.confirmGo) e.confirmGo.addEventListener('click', () => this.confirmed());
    if (e.confirmKeep) e.confirmKeep.addEventListener('click', () => { this.showRight(null); (this.el.go.offsetParent ? this.el.go : this.el.newTrip).focus(); });
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
    else if (name === 'controls') { this.buildKeymap(); const k = this.el.keymap; if (k) k.scrollTop = 0; } // fb4 D: Sandbox's keys only in Sandbox
    else { this.showRight(null); (this.el.go.offsetParent ? this.el.go : this.el.newTrip).focus(); }
  }
  // what stands beside the menu (fb3 C, 17): null, 'confirm' or 'entries'; New season's marker stays gold while one is up
  showRight(which) {
    this.right = which;
    const e = this.el;
    if (e.confirm) e.confirm.hidden = which !== 'confirm';
    e.entries.hidden = which !== 'entries';
    e.newTrip.classList.toggle('open', !!which);
    if (which === 'entries') { this.el.status.textContent = ''; this.focusEntries(); }
    else if (which === 'confirm' && e.confirmGo) { e.confirmGo.focus(); }
  }
  // New season: over a season under way it asks once (the confirm card); then the way to travel and the entry points
  askNewSeason() {
    if (this.busy) return;
    const pr = this.profile;
    if (pr && pr.started && this.right !== 'entries') { this.confirmWords(); this.showRight('confirm'); return; }
    this.showRight('entries');
  }
  // the confirm given: the entry points (or, asked from outside with the pick already made, that season begins)
  confirmed() {
    const p = this.pendingEp; this.pendingEp = null;
    if (p) this.newSeason(p, { confirm: false }); else this.showRight('entries');
  }
  confirmWords() {
    const pr = this.profile, core = this.trip, e = this.el;
    if (!e.confirmSub || !pr) return;
    const n = pr.known.length, home = pr.home != null && core && core.placeOf ? core.placeOf(pr.home) : '';
    // fb4 D (the fork's nit on the 2026-10-25 round): the season under way in its own particulars, not "the gear": the
    // canoe, the packs and the barrel
    const bits = [core ? (core.adventure ? 'Adventure' : 'Sandbox') : '', home ? `home ${home}` : '', core && core.active ? core.dayWords() : 'between trips', `$${pr.money}`, this.gearWords(pr), `${n} ${n === 1 ? 'outfitter' : 'outfitters'} known`].filter(Boolean);
    e.confirmSub.textContent = `The season under way: ${bits.join(' · ')}.`;
  }
  // "the aluminium canoe, two packs and a barrel"
  gearWords(pr) {
    let canoe = '';
    try { const k = pr.kit && pr.kit.canoe; canoe = k === 'kevlar' ? 'the Kevlar canoe' : k ? 'the aluminium canoe' : ''; } catch { canoe = ''; }
    const has = (id) => { try { return pr.has(id); } catch { return false; } };
    const rest = [has('pack2') ? 'two packs' : has('pack') ? 'a pack' : '', has('barrel') ? 'a barrel' : ''].filter(Boolean);
    const all = [canoe, ...rest].filter(Boolean);
    return all.length > 1 ? `${all.slice(0, -1).join(', ')} and ${all[all.length - 1]}` : all[0] || '';
  }
  focusEntries() {
    if (this.right !== 'entries') { this.showRight('entries'); return; }
    const home = this.el.list.querySelector('small.home');
    const cur = (home && home.parentElement) || this.el.list.querySelector('button.current') || this.el.list.querySelector('button');
    if (cur) { cur.focus(); cur.scrollIntoView({ block: 'nearest' }); }
  }

  back() {
    if (this.card !== 'menu') { this.showCard('menu'); return; }
    if (this.right) { this.showRight(null); this.el.newTrip.focus(); return; } // the confirm or the entry points away: the menu
    if (this.state === 'pause') this.resume();
  }

  // the two columns of the menu card: the menu items, and what stands beside them (the confirm's two, or the way to
  // travel and the entry points)
  columns() {
    const items = [...this.el.menu.querySelectorAll('.menu > ul .item:not([disabled])')].filter((b) => b.offsetParent !== null);
    let list = [];
    if (this.right === 'confirm' && this.el.confirm) list = [...this.el.confirm.querySelectorAll('button:not([disabled])')];
    else if (this.right === 'entries') { const pick = this.modeButtons().filter((b) => b.classList.contains('on')); list = [...pick, ...this.el.list.querySelectorAll('button:not([disabled])')]; }
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
    if (dir > 0 && items.includes(document.activeElement)) { if (this.right === 'confirm' && list[0]) list[0].focus(); else if (this.right === 'entries') this.focusEntries(); }
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
    const mode = core ? (core.active ? ` · ${core.menuWords(pause ? null : trip)}` : pr && pr.started ? ` · ${core.adventure ? 'Adventure' : 'Sandbox'} · between trips` : '') : o && o.trip && o.trip.active ? ` · day ${Math.floor(o.daysOut) + 1}` : '';
    const tripDays = mode + money;
    e.status.textContent = '';
    const kicker = pause ? `Paused · ${here()} · ${clock12(this.day.hours)}` : 'Boundary Waters Canoe Area Wilderness';
    e.kicker.textContent = kicker;
    e.settingsKicker.textContent = pause ? kicker : 'Boundary Waters';
    e.controlsKicker.textContent = pause ? kicker : 'Boundary Waters';
    const season = !!(pr && pr.started);
    // fb3 C (17): Continue first, with the save's line under it (where, when, the way, the day, the money); without a
    // season there is nothing to continue, so the item is away and New season is the first choice
    e.go.textContent = pause ? 'Paddle on' : 'Continue';
    if (e.goLi) e.goLi.hidden = !pause && !season;
    if (pause) e.hint.textContent = `${here()} · ${clock12(this.day.hours)}${tripDays}`;
    else if (trip && season) e.hint.textContent = `${here()} · ${shortDate(trip.year, trip.doy)}, ${clock12(trip.hours)}${tripDays}`;
    else if (season) e.hint.textContent = `The season${tripDays}`;
    else e.hint.textContent = '';
    if (e.newHint) e.newHint.textContent = season ? (pause ? '' : 'forgets the season under way') : `a fresh start: pick where, with $40 and the kit`;
    e.newTrip.classList.toggle('current', !pause && !season);
    this.showRight(null);
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

  // New season → (the confirm, once, over a season under way) → the mode → home: the entry point picked. The entry
  // points show only past the confirm, so a pick from the list needs none (confirm: false); a call from outside with a
  // season under way is asked first, the pick kept for the confirm.
  async newSeason(ep, { confirm = true } = {}) {
    if (this.busy) return;
    const pr = this.profile;
    if (confirm && pr && pr.started && this.right !== 'entries') {
      this.pendingEp = ep;
      if (this.state === 'game') this.open('title');
      this.confirmWords();
      this.showRight('confirm');
      return;
    }
    this.pendingEp = null;
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
