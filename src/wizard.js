// The new season as steps (the owner, 2026-11-01: "make the new season flow more of a wizard than all on one page"),
// where the entry points stood beside the menu (title.js): where you start (gl-c: a map of the outfitters, startmap.js,
// not a list), when (a strip of the open-water months, any month in Sandbox), then the season in a few lines and Start. One step at a time, Back and Next under it; ↑ ↓ move
// between the step's choices, Enter picks, Esc goes a step back. On the strip ← → move a day, Shift a week, Page Up and
// Page Down a month, and a click or a drag picks the day under the pointer.
//
// The strip's hints are the game's own dates, read from where they live, so they stay in step with what you will meet:
// the lake's ice (season.js LOCAL_ICE), snow (season.js snowAt, the snow round's, when it is there), blackflies and
// mosquitoes (bugs.js), blueberries (forage.js) and the fall colour (season.js).
//
//   new Wizard(title, el) · open(mode, { home }) · step · ep · start { year, doy } · back() → bool · focusables()
//   key(ev) → bool (a key on the strip) · focusFirst()
import * as SEASON from './season.js';
import { flySeason, mosqSeason } from './bugs.js';
import { FORAGE } from './forage.js';
import { MONTHS, monthDay, dayOfYear, daysInYear } from './astro.js';
import { longDate, shortDate } from './hud.js';
import { START_MONEY } from './profile.js';
import { StartMap, countryWords } from './startmap.js'; // gl-c: the start map

const STEPS = ['home', 'date', 'sum'];
const NAMES = { home: 'where you start', date: 'when', sum: 'ready' };
const START_HOUR = 9;                 // a season begins at nine in the morning, at the store's door
const OPEN = [4, 9];                  // the months a season can start in: May to October (Sandbox: any)
const WAY = { adventure: 'Adventure: open trips, buy food, take notices', sandbox: 'Sandbox: the same lakes, with no limits' };
// items.js STARTER_KIT, in words (gl-c: no pack or tent of your own; the rentals are out, and the store sees to it)
// r3 (the owner, 2026-11-05): a new season starts empty-handed; the staff at the counter lend the rest (onboarding.js)
const KIT_WORDS = 'your sleeping bag, pad and clothes, a tarp and water tablets';
const fahrenheit = (c) => Math.round(c * 9 / 5 + 32);
const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };

// the next good date: today when it is in the open-water months and the ice is two weeks gone, else two weeks after
// this lake's ice-out, this year or the next
export function nextGoodDate(now = new Date()) {
  let year = now.getFullYear();
  const today = dayOfYear(year, now.getMonth(), now.getDate());
  const good = Math.max(dayOfYear(year, OPEN[0], 1), SEASON.LOCAL_ICE.out + 14);
  const last = dayOfYear(year, OPEN[1], 15);
  if (today > last) return { year: year + 1, doy: Math.max(dayOfYear(year + 1, OPEN[0], 1), SEASON.LOCAL_ICE.out + 14) };
  return { year, doy: Math.max(today, good) };
}

export class Wizard {
  constructor(title, root) {
    this.t = title; this.root = root;
    this.mode = 'adventure'; this.step = 0; this.ep = null; this.start = nextGoodDate();
    this.kicker = root.querySelector('.kicker');
    this.status = root.querySelector('#entry-status');
    this.pages = {};
    for (const s of STEPS) this.pages[s] = root.querySelector(`[data-step="${s}"]`);
    this.buildDate();
    // gl-c: where you start, as a map of the outfitters (startmap.js); a pin picked is home, and on to the date
    const holder = this.pages.home.querySelector('#start-map') || this.pages.home.appendChild(Object.assign(document.createElement('div'), { id: 'start-map' }));
    this.map = new StartMap(holder, { world: title.world, onPick: (h) => this.choose(this.epOf(h.ep)) });
    this.sum = this.pages.sum.querySelector('.wsum');
    this.go = this.pages.sum.querySelector('#btn-start');
    this.navBack = root.querySelector('[data-w="back"]');
    this.navNext = root.querySelector('[data-w="next"]');
    this.navBack.addEventListener('click', () => { if (!this.back()) this.t.back(); });
    this.navNext.addEventListener('click', () => this.next());
    this.go.addEventListener('click', () => this.t.startSeason(this.ep, { ...this.start }));
  }

  // --- the steps ----------------------------------------------------------------------------------------------
  open(mode = 'adventure', { home = null } = {}) {
    const was = this.mode;
    this.mode = mode === 'sandbox' ? 'sandbox' : 'adventure';
    if (home) this.ep = this.homeFor(home);
    if (was !== this.mode || !this.inRange(this.start.doy)) { const g = nextGoodDate(); this.start = { year: g.year, doy: this.clamp(g.doy) }; }
    this.drawStrip();
    this.show(0);
  }
  show(i) {
    this.step = Math.max(0, Math.min(STEPS.length - 1, i));
    const s = STEPS[this.step];
    for (const k of STEPS) this.pages[k].hidden = k !== s;
    const into = this.t.newIn ? ` in slot ${this.t.newIn}` : '';
    this.kicker.textContent = `${this.mode === 'sandbox' ? 'Sandbox' : 'New season'}${into} · ${this.step + 1} of ${STEPS.length} · ${NAMES[s]}`;
    this.navNext.hidden = s === 'sum';
    this.navNext.disabled = s === 'home' && !this.ep;
    this.status.textContent = '';
    this.root.classList.toggle('wmap', s === 'home');
    if (this.t.el && this.t.el.shell) this.t.el.shell.classList.toggle('wizmap', s === 'home'); // (the band widens under the map)
    if (s === 'home') this.map.open(this.ep ? this.ep.ep : null);
    this.markHome();
    if (s === 'date') this.setDate(this.start.doy);
    if (s === 'sum') this.writeSummary();
    this.focusFirst();
  }
  next() { if (this.step === 0 && !this.ep) return; this.show(this.step + 1); }
  back() { if (this.step === 0) return false; this.show(this.step - 1); return true; }
  // an entry point picked: it is home, and on to the date
  choose(ep) { if (!ep) return; this.ep = ep; this.show(1); }
  // the world's entry point record for an outfitter's ep (title.newSeason teleports to it)
  epOf(ep) { return this.t.world.entryPoints.find((e) => e.ep === Number(ep)) || null; }
  // a home asked for (the season's own, or the default start): itself when an outfitter stands there, else the nearest
  // outfitter's (gl-c: with stream B's fewer outfitters, an entry point may be a trailhead)
  homeFor(ep) {
    if (!ep) return null;
    if (this.map.home(ep.ep)) return ep;
    const h = this.map.nearestHome(ep.x, ep.z);
    return h ? this.epOf(h.ep) || ep : ep;
  }
  markHome() { this.map.mark(this.ep ? this.ep.ep : null); }
  focusFirst() {
    const s = STEPS[this.step];
    if (s === 'home') this.map.focus(this.ep ? this.ep.ep : null);
    else if (s === 'date') this.cal.focus();
    else this.go.focus();
  }
  // the right column's items, top to bottom (title.js columns)
  focusables() {
    const s = STEPS[this.step], page = this.pages[s];
    const inner = s === 'date' ? [this.cal] : s === 'home' ? [this.map.active].filter(Boolean) : [...page.querySelectorAll('button:not([disabled])')];
    return [...inner, ...[this.navBack, this.navNext].filter((b) => !b.hidden && !b.disabled)].filter((b) => b.offsetParent !== null);
  }
  busy(on) { for (const b of this.root.querySelectorAll('button')) b.disabled = on; if (!on) this.navNext.disabled = STEPS[this.step] === 'home' && !this.ep; }

  // --- the date: a strip of the months ------------------------------------------------------------------------
  buildDate() {
    const page = this.pages.date;
    this.when = page.querySelector('.when');
    this.brings = page.querySelector('.brings');
    const cal = this.cal = page.querySelector('.cal');
    this.bands = cal.querySelector('.bands');
    this.months = cal.querySelector('.months');
    this.mark = cal.querySelector('.mark');
    this.today = cal.querySelector('.today');
    const pick = (ev) => {
      const r = this.months.getBoundingClientRect();
      const f = Math.max(0, Math.min(0.9999, (ev.clientX - r.left) / r.width));
      this.setDate(this.first + Math.floor(f * (this.last - this.first + 1)));
    };
    cal.addEventListener('pointerdown', (ev) => { cal.focus(); cal.setPointerCapture(ev.pointerId); this.dragging = true; pick(ev); });
    cal.addEventListener('pointermove', (ev) => { if (this.dragging) pick(ev); });
    const up = () => { this.dragging = false; };
    cal.addEventListener('pointerup', up); cal.addEventListener('pointercancel', up);
    cal.addEventListener('dblclick', () => this.next());
  }
  get first() { return this.mode === 'sandbox' ? 1 : dayOfYear(this.start.year, OPEN[0], 1); }
  get last() { return this.mode === 'sandbox' ? daysInYear(this.start.year) : dayOfYear(this.start.year, OPEN[1] + 1, 1) - 1; }
  inRange(doy) { return doy >= this.first && doy <= this.last; }
  clamp(doy) { return Math.max(this.first, Math.min(this.last, doy)); }
  pct(doy) { return `${((doy - this.first) / (this.last - this.first + 1)) * 100}%`; }
  // the months as cells and the hints as bands over them, for the year the season is in
  drawStrip() {
    const y = this.start.year, span = this.last - this.first + 1;
    this.months.replaceChildren();
    for (let m = 0; m < 12; m++) {
      const a = dayOfYear(y, m, 1), b = dayOfYear(y, m + 1, 1) - 1;
      if (b < this.first || a > this.last) continue;
      const c = el('div', 'mo', MONTHS[m]);
      c.style.width = `${((Math.min(b, this.last) - Math.max(a, this.first) + 1) / span) * 100}%`;
      this.months.appendChild(c);
    }
    this.bands.replaceChildren();
    for (const h of this.hints()) {
      const row = el('div', `hb ${h.kind}`);
      for (const [a, b] of h.runs) {
        const lo = Math.max(a, this.first), hi = Math.min(b, this.last);
        if (hi < lo) continue;
        const bar = el('i');
        bar.style.left = this.pct(lo); bar.style.width = `${((hi - lo + 1) / span) * 100}%`;
        row.appendChild(bar);
      }
      if (!row.children.length) continue;
      const first = row.children[0];
      const lab = el('span', 'lab', h.label); lab.style.left = first.style.left;
      // a band that starts late in the strip has its word to its left
      if (parseFloat(first.style.left) > 72) { lab.style.left = ''; lab.style.right = `${100 - parseFloat(first.style.left)}%`; lab.classList.add('before'); }
      row.appendChild(lab);
      for (const at of h.marks || []) { if (!this.inRange(at)) continue; const t = el('b'); t.style.left = this.pct(at); row.appendChild(t); }
      this.bands.appendChild(row);
    }
    const now = new Date();
    const td = now.getFullYear() === y ? dayOfYear(y, now.getMonth(), now.getDate()) : -1;
    this.today.hidden = !this.inRange(td);
    if (!this.today.hidden) this.today.style.left = this.pct(td);
  }
  // what the year brings, as runs of days [from, to] each: the game's own dates
  hints() {
    const y = this.start.year, n = daysInYear(y);
    const runs = (f) => { const out = []; let a = 0; for (let d = 1; d <= n + 1; d++) { const on = d <= n && f(d); if (on && !a) a = d; if (!on && a) { out.push([a, d - 1]); a = 0; } } return out; };
    const ice = SEASON.LOCAL_ICE;
    const out = [{ kind: 'ice', label: 'ice on the lakes', runs: runs((d) => SEASON.seasonAt(d).ice > 0.5), marks: [ice.out] }];
    const snowAt = typeof SEASON.snowAt === 'function' ? SEASON.snowAt : null;
    if (snowAt) out.push({ kind: 'snow', label: 'snow', runs: runs((d) => { const s = snowAt(d); return !!s && s.cover > 0.05; }) });
    out.push({ kind: 'bugs', label: 'blackflies', runs: runs((d) => flySeason(d) > 0.5) });
    out.push({ kind: 'bugs', label: 'mosquitoes', runs: runs((d) => mosqSeason(d) > 0.5) });
    const bb = FORAGE.blueberries;
    if (bb) out.push({ kind: 'berry', label: 'blueberries', runs: [[dayOfYear(y, bb.from[0], bb.from[1]), dayOfYear(y, bb.to[0], bb.to[1])]] });
    out.push({ kind: 'fall', label: 'fall colour', runs: runs((d) => SEASON.seasonAt(d).fall > 0.5) });
    return out;
  }
  setDate(doy) {
    const d = this.clamp(Math.round(doy));
    this.start = { year: this.start.year, doy: d };
    this.mark.style.left = this.pct(d + 0.5);
    this.when.textContent = `${longDate(this.start.year, d)}, ${this.start.year}`;
    const words = this.bringsWords(d);
    this.brings.textContent = words;
    this.cal.setAttribute('aria-valuetext', `${longDate(this.start.year, d)}: ${words}`);
  }
  // the date in a line: "Water 61 °F · blackflies, mosquitoes · loons on the lakes"
  bringsWords(doy) {
    const s = SEASON.seasonAt(doy), io = SEASON.LOCAL_ICE.out, ii = SEASON.LOCAL_ICE.in;
    const bits = [];
    if (s.ice > 0.5) bits.push(doy < 182 ? `ice on the lakes, out about ${shortDate(this.start.year, io)}` : 'ice on the lakes');
    else if (s.ice > 0.05) bits.push(doy < 182 ? 'the ice going out' : 'the ice coming in');
    else bits.push(`water ${fahrenheit(s.waterTemp)} °F`);
    const snow = typeof SEASON.snowAt === 'function' ? SEASON.snowAt(doy) : null;
    if (snow && snow.cover > 0.5) bits.push('snow on the ground');
    else if (snow && snow.cover > 0.05) bits.push(doy < 182 ? 'the last snow patches' : 'the first snow');
    const bugs = [flySeason(doy) > 0.5 ? 'blackflies' : '', mosqSeason(doy) > 0.5 ? 'mosquitoes' : ''].filter(Boolean);
    if (bugs.length) bits.push(bugs.join(' and '));
    const bb = FORAGE.blueberries, y = this.start.year;
    if (bb && doy >= dayOfYear(y, bb.from[0], bb.from[1]) && doy <= dayOfYear(y, bb.to[0], bb.to[1])) bits.push('blueberries ripe');
    if (s.fall > 0.5) bits.push('the leaves turning');
    else if (s.bare > 0.5 && s.ice < 0.5 && doy > 182) bits.push('the leaves down');
    else if (s.spring > 0.5) bits.push('fresh leaves');
    if (s.ice < 0.5 && doy > 182 && ii - doy < 30) bits.push(`freeze-up about ${shortDate(y, ii)}`);
    const w = bits.join(' · ');
    return w.charAt(0).toUpperCase() + w.slice(1);
  }
  // a key on the strip (or on the start map: its pins); true when it was the strip's
  key(ev) {
    if (STEPS[this.step] === 'home') return this.map.key(ev);
    const day = { ArrowLeft: -1, ArrowRight: 1 }[ev.code];
    if (day) { ev.preventDefault(); this.setDate(this.start.doy + day * (ev.shiftKey ? 7 : 1)); return true; }
    if (ev.code === 'PageUp' || ev.code === 'PageDown') {
      ev.preventDefault();
      const { month, day: dd } = monthDay(this.start.year, this.start.doy), m = Math.max(0, Math.min(11, month + (ev.code === 'PageDown' ? 1 : -1)));
      this.setDate(dayOfYear(this.start.year, m, Math.min(dd, 28)));
      return true;
    }
    if (ev.code === 'Home' || ev.code === 'End') { ev.preventDefault(); this.setDate(ev.code === 'Home' ? this.first : this.last); return true; }
    if (ev.code === 'Enter' || ev.code === 'NumpadEnter') { ev.preventDefault(); this.next(); return true; }
    return false;
  }

  // "Loon Narrows Outfitters, Moose Lake, entry point 25"
  homeWords(ep) { const h = this.map.home(ep.ep); return h ? `${h.name}, ${h.place}, entry point ${ep.ep}` : `${ep.name}, entry point ${ep.ep}`; }

  // --- the season in a few lines --------------------------------------------------------------------------------
  writeSummary() {
    const ep = this.ep, d = this.start;
    const rows = [
      ['Home', ep ? this.homeWords(ep) : ''],
      ['Starting', `${longDate(d.year, d.doy)}, ${d.year}, at ${START_HOUR} am, at the store’s door`],
      ['', this.bringsWords(d.doy)],
      ['The way', WAY[this.mode]],
      ['To start', `$${START_MONEY} and your own things: ${KIT_WORDS}`],
    ];
    if (this.t.newIn) rows.push(['', 'The season under way is kept in its slot.']);
    const h = ep ? this.map.home(ep.ep) : null;
    if (h) rows.splice(1, 0, ['', countryWords(h.country)]);
    this.sum.replaceChildren(...rows.map(([k, v]) => { const r = el('div', k ? 'r' : 'r more'); r.append(el('span', 'k', k), el('span', 'v', v)); return r; }));
    this.go.textContent = this.mode === 'sandbox' ? 'Start the Sandbox' : 'Start the season';
  }
}
export { START_HOUR };
