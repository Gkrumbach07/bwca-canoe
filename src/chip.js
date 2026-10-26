// The bottom chip (fb5 D, the owner's third round of 2026-10-25: "if you get to a spot where you cant pitch unless you
// have poles and you dont have poles, there should be some icon at the bottom saying its missing x number of poles").
// A small pill at the bottom centre of the screen, under the action line, that says what is missing at a glance: an
// icon and a count ("pole ×3"), or a short phrase ("Too near the water"). Never a paragraph; nothing when nothing is
// missing (rule 3). It is Air: hidden with the paper (the book, a card, the map), like the rest of the HUD.
//
//   chip.set(key, what, icon?)   show `key`'s chip. what: a string, or a list of parts [{ icon?, text? }]; icon: an
//                                item id (drawn with the book's own art, inv-ui.js iconUrl), a draw function
//                                (ctx, size) for a square, an emoji or a short glyph, or null
//   chip.clear(key)              take that owner's chip off (another owner's stays)
//   chip.nudge(key?)             a short shake: the chip is what stops you (E pressed where the tarp can't stand)
//   chip.shown                   a chip is on screen (also #air.chip, and the element #chip with .show)
//   chip.current                 { key, text } of the one on screen, or null (text as read, the icons by name)
//   hud.chip(text, icon) / hud.chip(null)   the same for the owner 'hud' (main.js's fb5 D block)
//
// One chip shows at a time: the last one set that is still on. It sits at bottom 18 px (30 px tall), under the action
// line (#prompt, bottom 56 px) and well under the hint card (#hint, bottom 100 px).
import * as INV from './inv-ui.js';

const CSS = `
#chip { left: 50%; translate: -50% 0; bottom: 18px; display: flex; align-items: center; gap: 7px; height: 30px; box-sizing: border-box;
  padding: 0 13px 1px 10px; border-radius: 15px; white-space: nowrap; font: 600 15px/1 var(--sans); letter-spacing: .01em;
  color: rgba(243, 236, 221, .96); background: rgba(14, 27, 34, .62); border: 1.5px solid rgba(217, 102, 63, .8);
  box-shadow: 0 0 18px 4px rgba(14, 27, 34, .22); text-shadow: 0 1px 2px rgba(0, 0, 0, .5); font-variant-numeric: tabular-nums; }
#chip .part { display: inline-flex; align-items: center; gap: 6px; }
#chip .part + .part { margin-left: 1px; }
#chip img { display: block; height: 18px; width: auto; filter: drop-shadow(0 1px 1px rgba(0, 0, 0, .45)); }
#chip img.sq { height: 22px; margin: 0 -1px; }
#chip .glyph { font-size: 16px; line-height: 1; }
#chip.nudge { animation: chip-nudge .42s ease-out; }
@keyframes chip-nudge { 0% { transform: translateX(0); } 18% { transform: translateX(-6px); } 38% { transform: translateX(5px); } 58% { transform: translateX(-3px); } 78% { transform: translateX(2px); } 100% { transform: translateX(0); } }
`;

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const isItem = (s) => typeof s === 'string' && /^[a-z][\w:-]*$/i.test(s) && s.length > 2;
const SQ = new Map(); // a draw function's picture, by the function and size

function iconHtml(icon) {
  if (!icon) return '';
  if (typeof icon === 'function') {
    const px = 40, k = icon; let u = SQ.get(k);
    if (!u && typeof document !== 'undefined') { const c = document.createElement('canvas'); c.width = c.height = px; try { k(c.getContext('2d'), px); u = c.toDataURL(); } catch { u = ''; } SQ.set(k, u); }
    return u ? `<img class="sq" alt="" src="${u}">` : '';
  }
  if (isItem(icon) && typeof INV.iconUrl === 'function') {
    // the book's picture at its own shape (a pole is long and thin), 18 px tall: drawn 2× for a sharp edge
    let u = '';
    try { u = INV.iconUrl(icon, 104, 36); } catch { u = ''; }
    if (u) return `<img alt="${esc(icon)}" src="${u}">`;
  }
  return `<span class="glyph">${esc(icon)}</span>`;
}
const partsOf = (what, icon) => (Array.isArray(what) ? what : [{ icon, text: what }]).filter((p) => p && (p.text || p.icon));
const textOf = (parts) => parts.map((p) => [isItem(p.icon) ? '' : typeof p.icon === 'string' ? p.icon : '', p.text || ''].filter(Boolean).join(' ')).join(' ').trim();

class Chip {
  constructor() {
    this.list = [];   // [{ key, parts, sig }] in the order set: the last shows
    this.el = null;
    this.sig = '';
  }
  get shown() { return this.list.length > 0; }
  get current() { const c = this.list[this.list.length - 1]; return c ? { key: c.key, text: textOf(c.parts) } : null; }
  mount() {
    if (this.el || typeof document === 'undefined') return this.el;
    if (!document.getElementById('chip-css')) { const s = document.createElement('style'); s.id = 'chip-css'; s.textContent = CSS; document.head.appendChild(s); }
    const air = document.getElementById('air') || document.body;
    const el = this.el = document.createElement('div');
    el.id = 'chip'; el.className = 'fade'; el.setAttribute('role', 'status');
    el.addEventListener('animationend', () => el.classList.remove('nudge'));
    air.appendChild(el);
    return el;
  }
  set(key, what, icon = null) {
    if (what == null || what === '' || (Array.isArray(what) && !what.length)) return this.clear(key);
    const parts = partsOf(what, icon), sig = JSON.stringify(parts.map((p) => [typeof p.icon === 'function' ? 'fn' : p.icon || '', p.text || '']));
    const i = this.list.findIndex((c) => c.key === key);
    if (i >= 0 && this.list[i].sig === sig) return this;
    if (i >= 0) this.list.splice(i, 1);
    this.list.push({ key, parts, sig });
    this.draw();
    return this;
  }
  clear(key) {
    const i = this.list.findIndex((c) => c.key === key);
    if (i < 0) return this;
    this.list.splice(i, 1);
    this.draw();
    return this;
  }
  nudge(key = null) {
    const c = this.list[this.list.length - 1];
    if (!c || (key && c.key !== key) || !this.el) return false;
    this.el.classList.remove('nudge'); void this.el.offsetWidth; this.el.classList.add('nudge');
    return true;
  }
  draw() {
    const el = this.mount();
    if (!el) return;
    const c = this.list[this.list.length - 1];
    const air = document.getElementById('air');
    if (air) air.classList.toggle('chip', !!c);
    if (!c) { el.classList.remove('show'); this.sig = ''; return; }
    if (c.sig !== this.sig) {
      el.innerHTML = c.parts.map((p) => `<span class="part">${iconHtml(p.icon)}${p.text ? `<span>${esc(p.text)}</span>` : ''}</span>`).join('');
      el.setAttribute('aria-label', textOf(c.parts));
      this.sig = c.sig;
    }
    el.classList.add('show');
  }
}

export const chip = new Chip();
