// The pop-up tracker (round 3 B, 2026-11-05; docs/build/r3-contract.md). The owner: "it would be interesting to play
// around with like a little task list on the left ... maybe that just pops up on occasion to show you like, hey, there's
// a task nearby for you to do, or like a new task was added and then it like pops up. So it like tells you like, hey,
// you can press I and then there and see the next task. Maybe not always on ... This is specifically important in the
// tutorial phases."
//
// A small paper card on the left, drawn from the guide (guide.js) alone:
//   - a new task (the guide's 'add', not one a page load restores): "New task:", its title, its next line
//   - coming near a task's place (the guide's 'near'; the same task again only after TRACKER.nearAgainS)
//   - the main path's step's next line changing past the tutorial (the guide's 'change' on current())
//   - a notice done ("Done", and what next: paid when you come in)
//   - through the tutorial (guide.current().tutorial) the card stays up with the step's next line, so the first thing
//     to do is never lost, a talk escaped or not
// An event card stays TRACKER.showS and fades; past the tutorial nothing stays up. The setting 'tracker' (Settings, HUD:
// "Task pop-ups") turns it off. It waits whenever something else has the screen: the title, the book or a paper open,
// a talk, the map sheet. While it is up, I opens the journal at the task it shows (journal.taskPeek), once for each
// line shown: the next I is the pack as ever.
//
//   tracker.attach({ guide, settings, journal, hud, title, talk })
//   tracker.update(dt)          main.js, each frame in the game (after the guide)
//   tracker.peek() → the guide id the card offers to I (and spends it), or null
//   tracker.state() → { shown, mode: 'event' | 'tutorial' | null, id, head, title, next, text } (the rigs)
import './tracker.css';

export const TRACKER = {
  showS: 6,          // an event card's seconds up (the frame's dt, so a paused game holds it)
  nearAgainS: 120,   // the same task's 'near' is said again only after this many real seconds
  queueMax: 3,       // events waiting behind the one shown (the oldest dropped)
};
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const SIDE_STAR = '<svg viewBox="0 0 20 20" width="100%" height="100%"><path d="M10 1.6 12.4 7.6 18.4 10 12.4 12.4 10 18.4 7.6 12.4 1.6 10 7.6 7.6Z" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"/></svg>';
const ICON = (k) => (k === 'story' || k === 'side' ? `<span class="tr-gi gi-${k}" aria-hidden="true">${k === 'side' ? SIDE_STAR : ''}</span>` : `<span class="tr-box k-${k}" aria-hidden="true"></span>`);
const bare = (s) => String(s || '').replace(/[.!]+$/, '').trim().toLowerCase();

export class Tracker {
  constructor() {
    this.t = {};
    this.el = document.createElement('div');
    this.el.id = 'tracker';
    this.el.setAttribute('role', 'status');
    this.el.setAttribute('aria-live', 'polite');
    document.body.appendChild(this.el);
    this.queue = [];          // events waiting: { head, id }
    this.ev = null;           // the event card up: { head, id, left }
    this.nearAt = new Map();  // id → performance.now() of its last 'near' card
    this.peeked = new Set();  // `${id}|${next}` already opened with I
    this.sig = '';
    this.shown = false;
    this.mode = null;
    this.cur = null;
    this.offs = [];
    // (the game's frame may stop under the title or a pause: the card is still put away the moment it is covered)
    const watch = () => { try { if (this.shown && (this.veiled || !this.enabled)) this.draw(null, true); } catch { /* */ } requestAnimationFrame(watch); };
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(watch);
  }
  attach(t = {}) {
    Object.assign(this.t, t);
    const G = this.t.guide;
    if (G && !this.offs.length) {
      this.offs.push(G.on('add', (e, d) => { if (!d.initial) this.push('New task', e); }));
      this.offs.push(G.on('near', (e) => {
        const cur = G.current();
        if (cur && cur.id === e.id && cur.tutorial) return; // (the tutorial's step is up already)
        const last = this.nearAt.get(e.id);
        if (last != null && performance.now() - last < TRACKER.nearAgainS * 1000) return;
        this.nearAt.set(e.id, performance.now());
        this.push('Close by', e);
      }));
      this.offs.push(G.on('change', (e, d) => {
        const cur = G.current();
        if (!cur || cur.id !== e.id || cur.tutorial || !(d.fields || []).includes('next')) return;
        this.push('Next', e);
      }));
      this.offs.push(G.on('done', (e) => { if (e.kind !== 'story') this.push('Done', e); }));
      this.offs.push(G.on('gone', (e) => {
        this.queue = this.queue.filter((q) => q.id !== e.id);
        if (this.ev && this.ev.id === e.id) this.ev = null; // (a step passed: the next one says itself)
      }));
    }
    const S = this.t.settings;
    if (S && typeof S.onChange === 'function' && !this.heardS) {
      this.heardS = true;
      S.onChange((k, v) => { if (k === 'tracker' && !v) { this.queue = []; this.ev = null; this.draw(null); } });
    }
    return this;
  }
  get enabled() { const S = this.t.settings; return !S || typeof S.get !== 'function' || S.get('tracker') !== false; }
  // a tutorial step that is not the main path's step now is never said (the tutorial card says each step in its turn:
  // the food, leeches and canoe steps come in together mid-talk, and the store has them all in reach)
  later(e) { const G = this.t.guide, cur = G && G.current(); return !!(e && e.kind === 'story' && e.tutorial && !e.done && (!cur || cur.id !== e.id)); }
  push(head, e) {
    if (!this.enabled || !e || this.later(e)) return;
    if (this.ev && this.ev.id === e.id) { if (head === 'Done') this.ev.head = head; this.ev.left = TRACKER.showS; return; }
    this.queue = this.queue.filter((x) => x.id !== e.id);
    this.queue.push({ head, id: e.id });
    if (this.queue.length > TRACKER.queueMax) this.queue.shift();
  }
  // something else has the screen: the card waits (and its seconds do not run)
  get veiled() {
    const { title, journal, hud, talk } = this.t;
    if (title && title.state && title.state !== 'game') return true;
    if (journal && journal.open) return true;
    if (hud && (hud.paper || hud.mode === 'sheet')) return true;
    if (talk && talk.talking) return true;
    return false;
  }
  update(dt = 0) {
    const G = this.t.guide;
    if (!G || !this.enabled) { this.draw(null); return; }
    if (this.veiled) { this.draw(null, true); return; }
    const step = Number.isFinite(dt) && dt > 0 ? Math.min(dt, 0.5) : 0;
    if (this.ev) { this.ev.left -= step; if (this.ev.left <= 0 || !G.get(this.ev.id)) this.ev = null; }
    while (!this.ev && this.queue.length) {
      const q = this.queue.shift(), e = G.get(q.id);
      if (e && !this.later(e)) this.ev = { ...q, left: TRACKER.showS };
    }
    let card = null;
    if (this.ev) card = { mode: 'event', head: this.ev.head, e: G.get(this.ev.id), fade: this.ev.left < 0.6 };
    else {
      const cur = G.current();
      if (cur && cur.tutorial && !cur.done) card = { mode: 'tutorial', head: 'Next', e: cur, fade: false };
    }
    this.draw(card);
  }
  draw(card, hold = false) {
    if (!card) {
      if (this.shown) { this.el.classList.remove('on'); this.shown = false; }
      if (!hold) { this.mode = null; this.cur = null; }
      return;
    }
    const e = card.e, next = e.next || '';
    const sig = `${card.mode}|${card.head}|${e.id}|${e.kind}|${e.title}|${next}|${e.done ? 1 : 0}`;
    if (sig !== this.sig) {
      this.sig = sig;
      // (the title is said only when the next line doesn't already say it: "Talk to Josie" / "Talk to Josie at the counter.")
      const showTitle = card.mode === 'event' && e.title && !bare(next).startsWith(bare(e.title));
      const lead = card.head === 'New task' ? 'New task:' : card.head;
      this.el.className = `k-${e.kind}${card.mode === 'tutorial' ? ' tut' : ''}${this.shown ? ' on' : ''}`;
      this.el.innerHTML = `<div class="tr-head">${ICON(e.kind)}<span>${esc(lead)}</span></div>${showTitle ? `<div class="tr-title">${esc(e.title)}</div>` : ''}${next ? `<div class="tr-next">${esc(next)}</div>` : ''}<div class="tr-key"><kbd>I</kbd> for your journal</div>`;
    }
    if (!this.shown) { void this.el.offsetWidth; this.el.classList.add('on'); } // (fades in from a fresh start)
    this.el.classList.toggle('out', !!card.fade);
    this.shown = true;
    this.mode = card.mode;
    this.cur = { id: e.id, next, head: card.head, title: e.title };
  }
  // the task the card offers to I (once a line), or null
  peek() {
    if (!this.shown || !this.cur) return null;
    const k = `${this.cur.id}|${this.cur.next}`;
    if (this.peeked.has(k)) return null;
    this.peeked.add(k);
    return this.cur.id;
  }
  state() {
    const c = this.cur;
    return { shown: this.shown, mode: this.shown ? this.mode : null, id: c ? c.id : null, head: c ? c.head : null, title: c ? c.title : null, next: c ? c.next : null, text: this.shown ? this.el.textContent.replace(/\s+/g, ' ').trim() : '' };
  }
}

export const tracker = new Tracker();
