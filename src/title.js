// The front door. After loading, the live scene (golden hour, the clock stopped, a camera drifting slowly
// round the canoe) renders behind a card: the name, a line, and Paddle in / New trip / Settings. Esc during
// play brings the same card back as a pause screen. Keyboard first: the arrows move between buttons, Enter
// picks, Esc goes back. While the card is up it owns the keyboard (a capturing listener stops the game's
// key handlers) and the HUD is hidden (body.shell-open, shell.css).
import './shell.css';
import * as THREE from 'three';
import { SettingsPanel } from './settings.js';
import { MONTHS, monthDay } from './astro.js';

const $ = (id) => document.getElementById(id);
const DRIFT_RATE = 0.045;   // rad/s round the canoe
const DRIFT_RADIUS = 23;    // metres, where there is water for it

export class Title {
  // targets: { world, player, chase, camera, day, hud, settings, saver, trip } — trip is the saved trip read at boot (or null)
  constructor(t) {
    Object.assign(this, t);
    this.state = 'game'; // 'title' | 'pause' | 'game'
    this.card = 'menu';
    this.busy = false;
    this.pausedRunning = true;
    this.el = {
      shell: $('shell'), menu: $('title-card'), entries: $('entry-card'), settingsCard: $('settings-card'),
      kicker: $('title-kicker'), sub: $('title-sub'), go: $('btn-continue'), hint: $('continue-hint'), newTrip: $('btn-new'), settings: $('btn-settings'),
      list: $('entry-list'), status: $('entry-status'), entryBack: $('btn-entry-back'), settingsBack: $('btn-settings-back'), form: $('settings-form'),
    };
    this.panel = new SettingsPanel(this.settings, this.el.form);
    this.drift = { angle: Math.random() * Math.PI * 2, t: 0, pos: new THREE.Vector3(), look: new THREE.Vector3(), fresh: true };
    this.buildEntries();
    this.bind();
  }

  // --- the cards ------------------------------------------------------------------------------
  buildEntries() {
    const list = this.el.list, start = this.world.meta.start;
    list.textContent = '';
    const eps = [...this.world.entryPoints].sort((a, b) => a.ep - b.ep);
    for (const ep of eps) {
      const b = document.createElement('button'); b.type = 'button'; b.setAttribute('role', 'listitem');
      const n = document.createElement('b'); n.textContent = `#${ep.ep}`;
      b.append(n, document.createTextNode(ep.name));
      if (Math.hypot(ep.x - start.x, ep.z - start.z) < 600) { const s = document.createElement('small'); s.textContent = 'the default start'; b.appendChild(s); }
      b.addEventListener('click', () => this.newTrip(ep));
      list.appendChild(b);
    }
  }

  bind() {
    const e = this.el;
    e.go.addEventListener('click', () => (this.state === 'pause' ? this.resume() : this.continueTrip()));
    e.newTrip.addEventListener('click', () => this.showCard('entries'));
    e.settings.addEventListener('click', () => this.showCard('settings'));
    e.entryBack.addEventListener('click', () => this.showCard('menu'));
    e.settingsBack.addEventListener('click', () => this.showCard('menu'));
    // capture phase: fires before every other key handler on the window and, while the card is up, ends the event there
    window.addEventListener('keydown', (ev) => {
      if (this.state === 'game') {
        if (ev.code === 'Escape' && !this.hud.big && !this.hud.pin && !this.player.teleporting) { ev.preventDefault(); ev.stopImmediatePropagation(); this.open('pause'); }
        return;
      }
      ev.stopImmediatePropagation();
      if (ev.code === 'Escape') { ev.preventDefault(); this.back(); return; }
      const tag = ev.target && ev.target.tagName;
      if (tag === 'SELECT' || tag === 'INPUT') return; // the arrows belong to the control
      if (ev.code === 'ArrowDown' || ev.code === 'ArrowUp') { ev.preventDefault(); this.moveFocus(ev.code === 'ArrowDown' ? 1 : -1); }
      else if (ev.code === 'Home' || ev.code === 'End') { ev.preventDefault(); this.moveFocus(ev.code === 'Home' ? -Infinity : Infinity); }
      else if (ev.code === 'Space' && tag !== 'BUTTON') ev.preventDefault(); // no page scroll
    }, true);
  }

  showCard(name) {
    this.card = name;
    const { menu, entries, settingsCard } = this.el;
    menu.hidden = name !== 'menu'; entries.hidden = name !== 'entries'; settingsCard.hidden = name !== 'settings';
    if (name === 'entries') { const cur = this.el.list.querySelector('button'); if (cur) cur.focus(); }
    else if (name === 'settings') { const first = this.el.form.querySelector('select, input'); if (first) first.focus(); }
    else this.el.go.focus();
  }

  back() {
    if (this.card !== 'menu') { this.showCard('menu'); return; }
    if (this.state === 'pause') this.resume();
  }

  focusables() {
    const card = this.card === 'menu' ? this.el.menu : this.card === 'entries' ? this.el.entries : this.el.settingsCard;
    return [...card.querySelectorAll('button:not([disabled]), select, input')].filter((n) => n.offsetParent !== null);
  }
  moveFocus(step) {
    const items = this.focusables(); if (!items.length) return;
    let i = items.indexOf(document.activeElement);
    if (!Number.isFinite(step)) i = step < 0 ? 0 : items.length - 1;
    else i = i < 0 ? (step > 0 ? 0 : items.length - 1) : (i + step + items.length) % items.length;
    items[i].focus();
    if (items[i].scrollIntoView) items[i].scrollIntoView({ block: 'nearest' });
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
    const p = this.player, w = this.world;
    const here = () => w.lakeName(w.lakeIdAt(p.x, p.z)) || 'open water';
    e.kicker.textContent = pause ? 'Paused' : 'Boundary Waters Canoe Area Wilderness';
    e.go.textContent = pause ? 'Paddle on' : 'Paddle in';
    if (pause) e.hint.textContent = `${here()} · ${this.day.clock}`;
    else if (trip) e.hint.textContent = `Continue on ${here()} · ${clockOf(trip)}`;
    else { const s = w.meta.start; e.hint.textContent = `Start at ${w.lakeName(w.lakeIdAt(s.x, s.z)) || 'Lake One'}, the default landing`; }
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
    this.el.status.textContent = 'BWCA entry points, by permit number.';
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
function clockOf(trip) {
  const { month, day } = monthDay(trip.year, trip.doy);
  const h = Math.floor(trip.hours), m = Math.floor((trip.hours - h) * 60);
  return `${MONTHS[month]} ${day} · ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
