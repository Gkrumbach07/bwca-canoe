// The front door. After loading, the live scene (golden hour, the clock stopped, a camera drifting slowly
// round the canoe) renders behind the card, set in Air on a flat deep band: the name, a line, and a plain-text
// menu (Paddle in / New trip / Settings / Controls) with the entry points as a second column beside New trip.
// Esc during play brings the same card back as a pause screen. Keyboard first: the arrows move between items
// (← → between the two columns), Enter picks, Esc goes back. While the card is up it owns the keyboard (a
// capturing listener stops the game's key handlers) and the HUD is hidden (body.shell-open, shell.css).
import './shell.css';
import * as THREE from 'three';
import { SettingsPanel } from './settings.js';
import { clock12, shortDate } from './hud.js';

const $ = (id) => document.getElementById(id);
const DRIFT_RATE = 0.045;   // rad/s round the canoe
const DRIFT_RADIUS = 23;    // metres, where there is water for it

// the controls reference (the Controls item), by what you are doing
const KEYMAP = [
  ['On the water', [
    [['W', 'S'], 'paddle forward, back'], [['A', 'D'], 'turn the hull while held, as sweep strokes'],
    [['Shift'], 'hustle'], [['Space'], 'brace in a sea (you cannot paddle while bracing)'],
    [['E'], 'go ashore · portage at a landing · the outfitter at a dock · pick up a find'], [['Q'], 'the other choice at a shore: go ashore at a landing, leave the beached canoe'],
    [['G'], 'eat a meal, when the canoe is still'],
  ]],
  ['On foot', [
    [['W', 'A', 'S', 'D'], 'walk where you look: W toward it, S back, A and D strafe'], [['Shift'], 'jog'],
    [['E'], 'launch a canoe at the water’s edge · set a carried one down'], [['Q'], 'shoulder a canoe on the ground · set a carried one down where you could launch'],
  ]],
  ['Fishing', [
    [['F'], 'take up the rod · put it down'], [['Space', 'click'], 'hold to load a cast where the cursor points, let go to cast · set the hook · hold to reel'],
    [['1', '2', '3', '4', '5'], 'jig & twister, Mepps spinner, Daredevle spoon, jointed Rapala, bobber & leech'], [['E', 'K'], 'let the fish go · keep it on the stringer'],
  ]],
  ['Looking', [
    [['Tab'], 'hold for the readout: where, water, way, wind, light, pack, tasks'], [['M'], 'hold to glance at the map, press for the sheet (drag, wheel, click a spot to paddle in)'],
    [['J'], 'the journal: the trip, catches, tasks, lakes, gear (L opens it too)'], [['V'], 'from the paddler’s seat · behind the canoe'],
    [['mouse'], 'look: in first person and on foot the first key or click takes the mouse and it turns you at once; behind the canoe, drag to orbit, wheel to zoom'], [['Esc'], 'frees the mouse when it is taken, otherwise this menu'],
  ]],
  ['The clock and the weather', [
    [['1', '2', '3'], 'game speed 1× 2× 4× (when the rod is down)'], [['[', ']'], 'time of day back, forward an hour'], [['-', '='], 'the date back, forward a day (Shift: a month)'],
    [['P'], 'stop the clock'], [[',', '.'], 'less, more wind'], [['/'], 'veer the wind'], [[';'], 'let the weather be'], [['R'], 'the canoe’s reflection'], [['N'], 'sound'],
  ]],
];

export class Title {
  // targets: { world, player, chase, camera, day, hud, settings, saver, trip, outfitter } — trip is the saved trip read at boot (or null)
  constructor(t) {
    Object.assign(this, t);
    this.state = 'game'; // 'title' | 'pause' | 'game'
    this.card = 'menu';
    this.busy = false;
    this.pausedRunning = true;
    this.el = {
      shell: $('shell'), menu: $('title-card'), settingsCard: $('settings-card'), controlsCard: $('controls-card'),
      kicker: $('title-kicker'), go: $('btn-continue'), hint: $('continue-hint'), newTrip: $('btn-new'), settings: $('btn-settings'), controls: $('btn-controls'),
      entries: $('entry-card'), list: $('entry-list'), status: $('entry-status'),
      settingsKicker: $('settings-kicker'), controlsKicker: $('controls-kicker'), nav: $('settings-nav'), form: $('settings-form'), keymap: $('keymap'),
    };
    this.panel = new SettingsPanel(this.settings, this.el.form, this.el.nav);
    this.drift = { angle: Math.random() * Math.PI * 2, t: 0, pos: new THREE.Vector3(), look: new THREE.Vector3(), fresh: true };
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
      b.addEventListener('click', () => this.newTrip(ep));
      li.appendChild(b);
      list.appendChild(li);
    }
    this.el.entries.hidden = false;
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
      else if (ev.code === 'ArrowRight' || ev.code === 'ArrowLeft') { if (this.card === 'menu') { ev.preventDefault(); this.switchColumn(ev.code === 'ArrowRight' ? 1 : -1); } }
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
    const cur = this.el.list.querySelector('button.current') || this.el.list.querySelector('button');
    if (cur) { cur.focus(); cur.scrollIntoView({ block: 'nearest' }); }
  }

  back() {
    if (this.card !== 'menu') { this.showCard('menu'); return; }
    if (this.state === 'pause') this.resume();
  }

  // the two columns of the menu card: the menu items, and the entry points
  columns() {
    const items = [...this.el.menu.querySelectorAll('.menu .item:not([disabled])')];
    const list = [...this.el.list.querySelectorAll('button:not([disabled])')];
    return [items, list];
  }
  focusables() {
    if (this.card === 'menu') {
      const [items, list] = this.columns();
      const inList = list.includes(document.activeElement);
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
    else if (dir < 0 && list.includes(document.activeElement)) this.el.newTrip.focus();
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

  refreshMenu() {
    const e = this.el, pause = this.state === 'pause', trip = this.trip;
    const p = this.player, w = this.world, o = this.outfitter;
    const here = () => p.placeName || w.lakeName(w.lakeIdAt(p.x, p.z)) || 'open water';
    const tripDays = o && o.trip && o.trip.active ? ` · day ${Math.floor(o.daysOut) + 1} of a ${o.trip.days}-day trip` : '';
    const kicker = pause ? `Paused · ${here()} · ${clock12(this.day.hours)}` : 'Boundary Waters Canoe Area Wilderness';
    e.kicker.textContent = kicker;
    e.settingsKicker.textContent = pause ? kicker : 'Boundary Waters';
    e.controlsKicker.textContent = pause ? kicker : 'Boundary Waters';
    e.go.textContent = pause ? 'Paddle on' : 'Paddle in';
    if (pause) e.hint.textContent = `${here()} · ${clock12(this.day.hours)}${tripDays}`;
    else if (trip) e.hint.textContent = `Continue on ${here()} · ${shortDate(trip.year, trip.doy)} · ${clock12(trip.hours)}${tripDays}`;
    else { const s = w.meta.start; e.hint.textContent = `Start at ${w.lakeName(w.lakeIdAt(s.x, s.z)) || 'Lake One'}, the default landing`; }
    e.newTrip.classList.toggle('current', !pause && !trip);
  }

  // --- the three ways out --------------------------------------------------------------------
  continueTrip() {
    const t = this.trip, day = this.day;
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

  async newTrip(ep) {
    if (this.busy) return;
    this.busy = true;
    const buttons = [...this.el.list.querySelectorAll('button')];
    for (const b of buttons) b.disabled = true;
    this.el.status.textContent = `Paddling in at ${ep.name}…`;
    this.saver.clear(); this.trip = null;
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
