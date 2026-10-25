// The onboarding hints and the pace toast (fb4 D, decision 5 of the owner's second round of 2026-10-25).
//
// The owner: "show what keys to press a lot of the time, which we do for a lot of the movement pickup and quick action
// stuff, but things like shift to sprint or 1, 2, 3 to fast forward … we need to have a better indication that we're
// running in this quicker state other than just something small in the right corner … a little tooltip thing that pops
// up when you first use it … like an onboarding thing. Like if you start walking around for a little bit, it'll suggest
// shift to jog. Or if you're canoeing and you've been canoeing for just like 10 seconds, it'll say 1, 2, 3 to change the
// speeds … V is good to have, but we need some tooltip somewhere to show people how to do that … Same thing with
// flashlight. If it's dark, H."
//
// Seven hints, each a small card above the action line (bottom centre, #hint) that fades after 6 s, shown once a
// season, the first time it applies, one at a time with a short gap between, never over a paper, a card, the dial, a
// conversation or the raised camera:
//   jog    on foot, after 6 s of walking              Shift · jog
//   pace   afloat, after 10 s under way               1 · 2 · 3 · the pace
//   lamp   the first dusk, on foot or afloat           H · the headlamp
//   view   the first time on foot                      V · the view
//   shelf  the first time within reach of a shelf      E · look at the shelf
//   book   beside your canoe with things on the ground I · your pack and what's around you
//   grey   the first time the dot greys a verb         right-click a thing in the book to see why
// A hint whose key you have already pressed (Shift, 1 2 3, H, V, I; a shelf opened; a right-click in the book) is
// counted as learnt and never shown. What was shown or learnt is kept in the season (the profile's `onboard`, which a
// new season starts empty), so a reload never shows one again. Settings › HUD › Key hints off turns them off too.
//
// The pace toast (#pace-toast, bottom right above the status marks, 3 s): whenever the pace changes (1 2 3, or the
// Settings' Trip / Real), its name and what the clock does: "Trip pace ×2 · the clock runs ×8 on the water, ×6 on a
// trail, ×24 at camp". The corner marks (hud.js) stay as they are. The camera's own hold on the clock (photo.js 'life')
// is not a change.
//
//   const hints = new Hints({ player, hud, day, profile, pointer, outfitter, inventory, lamp, chase, title, talk, camp,
//     photo, veil, settings, fishing })
//   hints.update(dt, shell)     each frame, after the camera (main.js runs it after the barks)
//   hints.stats(), hints.forget()   for the console and the tests
import { esc } from './hud.js';

const SHOW = 6;        // seconds a hint is up
const GAP = 2.5;       // seconds between two hints
const TOAST = 3;       // seconds the pace toast is up
const WALK = 6;        // seconds walking before Shift is offered
const PADDLE = 10;     // seconds under way before 1 2 3 is offered
const ON_FOOT = 1;     // seconds on foot before V is offered (not the frame you step out)
const DUSK = -2;       // the sun's elevation (degrees) under which the headlamp is offered
const SHELF_REACH = 1.6; // metres from a shelf's box (outfitter.js REACH)
const SHELVES = new Set(['food', 'tackle', 'gear', 'wall']); // the store's hotspots that are shelves (outfitter.js HOT)

// in the order they are offered when more than one applies
export const HINTS = [
  { id: 'grey', keys: ['right-click'], words: 'a thing in the book to see why' },
  { id: 'shelf', keys: ['E'], words: 'look at the shelf' },
  { id: 'book', keys: ['I'], words: 'your pack and what’s around you' },
  { id: 'lamp', keys: ['H'], words: 'the headlamp' },
  { id: 'pace', keys: ['1', '2', '3'], words: 'the pace' },
  { id: 'jog', keys: ['Shift'], words: 'jog' },
  { id: 'view', keys: ['V'], words: 'the view' },
];
// the keys that teach a hint before it is shown
const LEARNS = { ShiftLeft: 'jog', ShiftRight: 'jog', KeyV: 'view', KeyH: 'lamp', KeyI: 'book', Digit1: 'pace', Digit2: 'pace', Digit3: 'pace' };

// metres from (x, z) to a store hotspot's box, on the ground (outfitter.js reachTo)
function reachTo(h, x, z) {
  const c = Math.cos(h.heading || 0), s = Math.sin(h.heading || 0), dx = x - h.x, dz = z - h.z;
  const a = dx * c - dz * s, b = dx * s + dz * c;
  return Math.hypot(Math.max(0, Math.abs(a) - (h.hx || 0)), Math.max(0, Math.abs(b) - (h.hz || 0)));
}
const times = (n) => { const v = Math.round(n * 10) / 10; return `×${Number.isInteger(v) ? v : v.toFixed(1)}`; };

// the toast's words for a pace table (pace.js) at a game speed: [name, what the clock does]
export function paceWords(P, ts = 1) {
  const name = `${P.label} pace${ts > 1 ? ` ×${ts}` : ''}`;
  if (P.water <= 1 && P.trail <= 1 && P.idle <= 1) return [name, ts > 1 ? `the clock runs ${times(ts)}, everywhere` : 'the clock runs 1:1, as in life'];
  return [name, `the clock runs ${times(P.water * ts)} on the water, ${times(P.trail * ts)} on a trail, ${times(P.idle * ts)} at camp`];
}

export class Hints {
  constructor(t) {
    this.t = t;
    this.cur = null;           // the hint up: { h, t }
    this.gapT = GAP;           // a little while after the game starts before the first
    this.walkT = 0; this.paddleT = 0; this.footT = 0;
    this.paceSig = null; this.toastT = 0;
    this.log = [];             // what was shown and learnt, in order (the tests)
    const air = document.getElementById('air') || document.body;
    this.el = document.createElement('div'); this.el.id = 'hint'; this.el.className = 'fade'; this.el.setAttribute('aria-live', 'polite');
    this.toastEl = document.createElement('div'); this.toastEl.id = 'pace-toast'; this.toastEl.className = 'fade'; this.toastEl.setAttribute('aria-live', 'polite');
    air.append(this.el, this.toastEl);
    // a key pressed before its hint: learnt (bubble phase on the window: a conversation's numbers and the title card's
    // keys are taken before they get here)
    window.addEventListener('keydown', (e) => {
      if (e.repeat || this.shell) return;
      const id = LEARNS[e.code]; if (!id) return;
      const f = this.t.fishing;
      if (id === 'pace' && f && f.rodUp) return; // the numbers pick a lure then
      this.learn(id);
    });
    // a right-click in the book (or any paper): the greyed verb's why is found there
    document.addEventListener('contextmenu', (e) => { if (e.target && e.target.closest && e.target.closest('.paper, #journal, #card, #shelf')) this.learn('grey'); }, true);
  }

  // --- what the season remembers (the profile's `onboard`) ------------------------------------------------------------
  get store() {
    const pr = this.t.profile;
    if (!pr || !pr.s || !pr.started) return null;
    if (!pr.s.onboard || typeof pr.s.onboard !== 'object') pr.s.onboard = {};
    return pr.s.onboard;
  }
  seen(id) { const s = this.store; return !s || !!s[id]; }
  mark(id, how) {
    const s = this.store; if (!s || s[id]) return false;
    s[id] = how;
    try { this.t.profile.write(); } catch (e) { console.warn('hints: the profile', e); }
    this.log.push(`${id}:${how}`);
    return true;
  }
  // (fb4 join: the card up goes once you press the key it shows: it has been read)
  learn(id) { if (this.cur && this.cur.h.id === id) { if (this.cur.t > 0.4) this.hide(); return; } this.mark(id, 'used'); }

  // --- whether a hint applies now --------------------------------------------------------------------------------------
  due(id) {
    const t = this.t, p = t.player;
    switch (id) {
      case 'grey': { const g = t.pointer && t.pointer.target; return !!(g && ((g.e && g.e.why) || (g.q && g.q.why))); }
      case 'shelf': {
        const v = t.outfitter && t.outfitter.visit;
        if (!v || !v.inside || !p.onFoot || (t.outfitter && t.outfitter.shelfOpen)) return false;
        const g = t.pointer && t.pointer.target;
        if (g && g.kind === 'shelf') return true;
        return !!(v.L && Array.isArray(v.L.hot) && v.L.hot.some((h) => SHELVES.has(h.key) && reachTo(h, p.x, p.z) <= SHELF_REACH));
      }
      case 'book': return p.mode === 'walk' && this.besideCanoeWithThings();
      case 'lamp': {
        const d = t.day, lamp = t.lamp, inside = t.outfitter && t.outfitter.visit && t.outfitter.visit.inside;
        return !!(d && d.elevation < DUSK && lamp && !lamp.on && !inside && (p.mode === 'walk' || p.mode === 'paddle' || p.mode === 'carry'));
      }
      case 'pace': return this.paddleT >= PADDLE;
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
  // nothing else on the screen that a hint would sit over or under
  clear() {
    const t = this.t, p = t.player, hud = t.hud;
    if (t.title && t.title.state !== 'game') return false;
    if (hud && (hud.paper || hud.big || hud.pin)) return false;
    if (t.talk && t.talk.talking) return false;
    if (t.camp && t.camp.dialOpen) return false;
    if (t.photo && t.photo.raised) return false;
    if (t.veil && t.veil.active) return false;
    if (p.teleporting) return false;
    if (t.settings && t.settings.get && t.settings.get('keyHints') === false) return false;
    return true;
  }

  // --- per frame ---------------------------------------------------------------------------------------------------------
  update(dt, shell = false) {
    this.shell = shell;
    if (shell) { if (this.cur) this.hide(); return; }
    const t = this.t, p = t.player, f = t.fishing;
    // the accumulators: walking, under way, on foot (a new season starts them again)
    const sid = t.profile ? t.profile.seasonId : null;
    if (sid !== this.sid) { this.sid = sid; this.walkT = this.paddleT = this.footT = 0; }
    const moving = Math.abs(p.speed || 0) > 0.3;
    if (p.mode === 'walk' && !p.seat) { this.footT += dt; if (moving) this.walkT += dt; } else this.footT = 0;
    if (p.mode === 'paddle' && moving && !(f && f.rodUp) && !p.landing) this.paddleT += dt;
    this.paceToast(dt);
    // the card up: it holds SHOW seconds, or goes when something else takes the screen
    if (this.cur) {
      this.cur.t += dt;
      if (this.cur.t >= SHOW || !this.clear()) this.hide();
      return;
    }
    if ((this.gapT -= dt) > 0 || !this.clear() || !this.store) return;
    for (const h of HINTS) if (!this.seen(h.id) && this.due(h.id)) { this.show(h); break; }
  }
  show(h) {
    this.cur = { h, t: 0 };
    this.mark(h.id, 'shown');
    this.el.innerHTML = `<span class="keys">${h.keys.map((k) => `<kbd>${esc(k)}</kbd>`).join('')}</span><span class="words">${esc(h.words)}</span>`;
    this.el.dataset.hint = h.id;
    this.el.classList.add('show');
  }
  hide() {
    this.cur = null; this.gapT = GAP;
    this.el.classList.remove('show');
  }

  // --- the pace toast --------------------------------------------------------------------------------------------------
  paceToast(dt) {
    const t = this.t, p = t.player;
    if (this.toastT > 0 && (this.toastT -= dt) <= 0) this.toastEl.classList.remove('show');
    if (p.pace === 'life' || (t.photo && t.photo.raised)) return; // the camera's hold on the clock is not a change
    const sig = `${p.pace}:${p.timeScale}`;
    if (this.paceSig === null) { this.paceSig = sig; return; } // the pace the game came back with
    if (sig === this.paceSig) return;
    this.paceSig = sig;
    const P = p.paceTable; if (!P) return;
    const [name, line] = paceWords(P, p.timeScale || 1);
    this.toastEl.innerHTML = `<div class="sc">${esc(name)}</div><div class="line">${esc(line)}</div>`;
    this.toastEl.classList.add('show');
    this.toastT = TOAST;
    this.lastToast = `${name} · ${line}`;
  }

  // --- the console and the tests ---------------------------------------------------------------------------------------
  stats() {
    const s = this.store;
    return { up: this.cur ? `${this.cur.h.id} ${this.cur.t.toFixed(1)}s` : null, text: this.cur ? this.el.textContent : null, onboard: s ? { ...s } : null, log: this.log.slice(), walkT: +this.walkT.toFixed(1), paddleT: +this.paddleT.toFixed(1), footT: +this.footT.toFixed(1), toast: this.toastT > 0 ? this.lastToast : null, lastToast: this.lastToast || null };
  }
  // the season's hints forgotten (the tests): they will show again
  forget() { const pr = this.t.profile; if (pr && pr.s) { pr.s.onboard = {}; pr.write(); } this.log = []; this.walkT = this.paddleT = this.footT = 0; if (this.cur) this.hide(); }
}
