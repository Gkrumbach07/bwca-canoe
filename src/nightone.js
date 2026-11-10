// Night one: the sleep cutscene (stream B, Round 1; docs/story/10-notebook.md §10.2, 20 §2.3 and §3; campaign-design
// §6.1). walt.js plays it under STORY_ON (a dynamic import: with the flag off this module is never fetched), at full
// dark of the first night of a trip that carries Walt's bundle, before the night passes: the camp's night card holds
// behind it (camp.wake waits on it), so the cutscene is the sleep.
//
// First person, by headlamp: the lamp's circle opens on the brown book in the player's hands, the inside cover, the
// first page, a page turn a line at a time (the seven quiet-years excerpts, cut.3–cut.9), a riffle through the rest too
// fast to read, then the last page in full (NB88), held until a key. The book closes, the lamp clicks off, black, and
// the ordinary night goes on. The legible line is lit in the circle; the rest of its page is the real page, gone soft
// outside the light, so a page is a page and not a caption. The words are nb.json's (cut.<n>, the entries themselves).
//
// The first time it plays any key turns to the next beat sooner (never under 2 s a beat); the last page waits for a key.
// Esc skips it only once it has been seen in some season (story-meta nightOneSeen). Driven by update(dt) from the frame
// (walt.js wraps veil.update), so __game.step drives it like the rest of the game.
//
//   const cut = new NightOne({ text, meta: { seen }, onEnd }) · cut.play() → Promise · cut.update(dt) · cut.active
//   cut.beat (the current beat's id) · cut.next() (a key) · cut.skip() (Esc, when allowed) · cut.log (beats shown)
import { CUT, CUT_MIN_PAGE } from './story-data/notebook.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// each beat's length (s), from the doc's timeline: 0:00 0:05 0:10 0:17 0:24 0:32 0:41 0:48 0:56 1:03 held · close · +3 s
export const BEAT_SECS = { 'cut.1': 5, 'cut.2': 5, 'cut.3': 7, 'cut.4': 7, 'cut.5': 8, 'cut.6': 9, 'cut.7': 7, 'cut.8': 8, 'cut.9': 7, 'cut.10': 3, 'cut.11': Infinity, 'cut.12': 1.6, 'cut.13': 3 };
const LAST_DRIFT = 8; // s held on the last page before the circle drifts to the pencil's hole in "11:40" and back

const CSS = `
#nightone { position: fixed; inset: 0; z-index: 60; background: #000; display: none; overflow: hidden; cursor: none; }
#nightone.on { display: block; }
#nightone .no-page { position: absolute; left: 50%; top: 50%; width: min(620px, 82vw); height: min(760px, 88vh); translate: -50% -50%; rotate: -1.2deg; padding: 54px 58px; box-sizing: border-box;
  background: #e9dfc3; border-radius: 2px; box-shadow: 0 0 0 9px #5a4430, 0 30px 60px rgba(0,0,0,.6);
  font: 400 27px/31px "Reenie Beanie", Caveat, cursive; color: #1f2c55; white-space: pre-wrap; transition: opacity .5s; }
#nightone .no-page.cover { background: #6e5038; box-shadow: 0 30px 60px rgba(0,0,0,.6); }
#nightone .no-page.cover .wh { position: absolute; right: 60px; top: 70px; padding: 14px 18px; background: #e9dfc3; font-size: 30px; }
#nightone .no-page .soft { filter: blur(2.4px); opacity: .55; }
#nightone .no-page .lit { filter: none; opacity: 1; }
#nightone .no-page.last { font-size: 30px; line-height: 38px; color: #2d2a28; rotate: .6deg; }
#nightone .no-page.last .soft { filter: none; opacity: .9; }
#nightone .no-page.riffle { animation: no-riffle .16s steps(2) infinite; }
@keyframes no-riffle { 50% { translate: -50.6% -50%; rotate: -2.4deg; } }
#nightone .no-lamp { position: absolute; inset: 0; pointer-events: none; transition: background .6s;
  background: radial-gradient(circle var(--r, 190px) at var(--x, 50%) var(--y, 40%), rgba(0,0,0,0) 0, rgba(0,0,0,0) 62%, rgba(0,0,0,.78) 86%, rgba(0,0,0,.96) 100%); }
#nightone.dark .no-lamp { background: #000; }
#nightone .no-hands { position: absolute; left: 50%; bottom: -14vh; width: 70vw; height: 30vh; translate: -50% 0; border-radius: 50% 50% 0 0; background: radial-gradient(ellipse at 50% 20%, #3a2a1e, #120c08 70%); opacity: .9; }
`;

export class NightOne {
  constructor({ text = {}, seen = false, onEnd = null } = {}) {
    this.text = text; this.seen = !!seen; this.onEnd = onEnd;
    this.active = false; this.i = -1; this.t = 0; this.log = []; this.el = null; this.resolve = null;
  }
  get beat() { return this.active && CUT[this.i] ? CUT[this.i].id : null; }
  play() {
    if (this.active) return this.done;
    this.build();
    this.active = true; this.i = -1; this.log = [];
    this.el.classList.add('on');
    this.done = new Promise((r) => { this.resolve = r; });
    this.go(0);
    return this.done;
  }
  build() {
    if (this.el) return;
    if (!document.getElementById('nightone-css')) { const st = document.createElement('style'); st.id = 'nightone-css'; st.textContent = CSS; document.head.appendChild(st); }
    const el = this.el = document.createElement('div');
    el.id = 'nightone'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'Night one, by headlamp');
    el.innerHTML = '<div class="no-page"></div><div class="no-hands"></div><div class="no-lamp"></div>';
    document.body.appendChild(el);
    this.onKey = (e) => {
      if (!this.active) return;
      e.preventDefault(); e.stopImmediatePropagation();
      if (e.repeat) return;
      if (e.code === 'Escape') { if (this.seen) this.skip(); return; }
      this.next();
    };
    window.addEventListener('keydown', this.onKey, true);
    el.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); this.next(); });
  }
  // a key: the next beat, if this one has had its 2 s (the first play; once seen, any time)
  next() {
    if (!this.active) return false;
    const b = CUT[this.i];
    if (!b) return false;
    if (this.t < CUT_MIN_PAGE && !this.seen && !b.hold) return false;
    if (b.hold && this.t < CUT_MIN_PAGE) return false;
    this.go(this.i + 1);
    return true;
  }
  skip() { if (!this.active) return false; this.end(true); return true; }
  go(i) {
    this.i = i; this.t = 0;
    const b = CUT[i];
    if (!b) { this.end(false); return; }
    this.log.push(b.id);
    this.draw(b);
  }
  update(dt) {
    if (!this.active) return;
    this.t += Math.min(Math.max(dt || 0, 0), 0.1);
    const b = CUT[this.i];
    if (!b) return;
    if (b.id === 'cut.11') {
      // held: the circle drifts down the page as an eye would, and once, after 8 s, to the hole in "11:40" and back
      const k = Math.min(1, this.t / 6), drift = this.t > LAST_DRIFT && this.t < LAST_DRIFT + 2.2;
      this.lamp(drift ? 44 : 50, drift ? 37 : 30 + k * 36, 210);
    }
    if (this.t >= (BEAT_SECS[b.id] ?? 5)) this.go(this.i + 1);
  }
  lamp(x, y, r) { const l = this.el.querySelector('.no-lamp'); l.style.setProperty('--x', `${x}%`); l.style.setProperty('--y', `${y}%`); l.style.setProperty('--r', `${r}px`); }
  T(id) { const e = this.text[id]; return e && e.text ? e.text : ''; }
  // the page a legible line is on (the real page, soft outside the circle)
  pageOf(line) {
    if (!line) return null;
    const probe = line.slice(0, 24);
    for (const [id, e] of Object.entries(this.text)) if (/^NB\d\d$/.test(id) && e && e.text && e.text.includes(probe)) return id;
    return null;
  }
  draw(b) {
    const el = this.el, page = el.querySelector('.no-page');
    el.classList.toggle('dark', b.page === 'dark' || b.page === 'black' || b.page === 'close');
    page.className = 'no-page';
    page.style.opacity = '1';
    const line = this.T(b.id);
    if (b.page === 'dark' || b.page === 'black') { page.style.opacity = '0'; page.innerHTML = ''; this.lamp(50, 60, 40); return; }
    if (b.page === 'close') { page.style.opacity = '0'; this.lamp(50, 50, 0); return; }
    if (b.page === 'cover') { page.classList.add('cover'); page.innerHTML = `<span class="wh">${esc(line)}</span>`; this.lamp(78, 22, 170); return; }
    if (b.last) {
      page.classList.add('last');
      const all = this.T('NB88');
      page.innerHTML = `<span class="soft">${esc(all)}</span>`;
      this.lamp(50, b.hold ? 30 : 46, b.hold ? 210 : 320);
      return;
    }
    const at = this.pageOf(line), whole = at ? this.T(at) : line;
    const k = whole.indexOf(line.slice(0, 24));
    const lit = k >= 0 ? whole.slice(k, k + line.length) : line;
    const before = k >= 0 ? whole.slice(0, k) : '', after = k >= 0 ? whole.slice(k + line.length) : '';
    page.innerHTML = `<span class="soft">${esc(before)}</span><span class="lit">${esc(lit)}</span><span class="soft">${esc(after)}</span>`;
    if (b.page === 'riffle') page.classList.add('riffle'), setTimeout(() => { if (this.el) this.el.querySelector('.no-page').classList.remove('riffle'); }, 700);
    const rows = before.split('\n').length; // (the circle on the lit line)
    this.lamp(50, Math.min(78, 18 + rows * 4.2), 180);
  }
  end(skipped) {
    if (!this.active) return;
    this.active = false;
    this.el.classList.remove('on', 'dark');
    const r = this.resolve; this.resolve = null;
    if (typeof this.onEnd === 'function') { try { this.onEnd({ skipped, log: this.log.slice() }); } catch (e) { console.warn('nightone: onEnd', e); } }
    if (r) r({ skipped, log: this.log.slice() });
  }
}
