// The veil: a fade to deep with a card on it (a kicker in small caps, a line in the serif, a dim line under), held
// while something happens behind it (an evacuation's move, a night slept, a walk back for the gear pack), then faded
// back. Its opacity is driven per frame by update(dt), not by CSS transitions, so `__game.step` drives it like the rest
// of the game. One card at a time; cards asked for while one is up wait their turn.
//
//   veil.card({ kicker, text, sub, fadeIn = 1.4, hold = 2.5, fadeOut = 2.2, onDark }) → Promise (resolved once faded back)
//
// onDark is called once at full dark and may return a promise; the card holds until it has resolved and `hold`
// seconds have passed. `veil.active` is true while any card is up or waiting.

const ease = (t) => t * t * (3 - 2 * t);

export class Veil {
  constructor() {
    const $ = (id) => document.getElementById(id);
    this.el = $('veil'); this.kicker = $('veil-kicker'); this.text = $('veil-text'); this.sub = $('veil-sub');
    this.queue = []; this.cur = null; this.opacity = 0;
  }
  get active() { return !!this.cur || this.queue.length > 0; }
  get dark() { return !!this.cur && this.cur.phase === 'dark'; }

  card(opts = {}) {
    return new Promise((resolve) => {
      this.queue.push({ kicker: '', text: '', sub: '', fadeIn: 1.4, hold: 2.5, fadeOut: 2.2, onDark: null, ...opts, resolve, phase: 'in', t: 0, pending: false });
      if (!this.cur) this.next();
    });
  }
  next() {
    const c = this.cur = this.queue.shift() || null;
    if (!c) return;
    if (this.kicker) this.kicker.textContent = c.kicker || '';
    if (this.text) this.text.textContent = c.text || '';
    if (this.sub) this.sub.textContent = c.sub || '';
    if (this.el) this.el.classList.toggle('bare', !c.kicker && !c.text && !c.sub);
  }

  update(dt) {
    const c = this.cur;
    if (!c) { if (this.opacity) this.apply(0); return; }
    c.t += Math.min(Math.max(dt, 0), 0.1);
    if (c.phase === 'in') {
      this.apply(ease(Math.min(1, c.t / Math.max(0.01, c.fadeIn))));
      if (c.t >= c.fadeIn) {
        c.phase = 'dark'; c.t = 0; c.pending = true;
        Promise.resolve().then(() => (c.onDark ? c.onDark() : null)).catch((e) => console.warn('veil', e)).finally(() => { c.pending = false; });
      }
    } else if (c.phase === 'dark') {
      this.apply(1);
      if (!c.pending && c.t >= c.hold) { c.phase = 'out'; c.t = 0; }
    } else {
      this.apply(1 - ease(Math.min(1, c.t / Math.max(0.01, c.fadeOut))));
      if (c.t >= c.fadeOut) { this.apply(0); this.cur = null; c.resolve(); this.next(); }
    }
  }
  apply(o) {
    this.opacity = o;
    if (!this.el) return;
    this.el.style.opacity = o.toFixed(3);
    this.el.classList.toggle('show', o > 0.001);
  }
}
