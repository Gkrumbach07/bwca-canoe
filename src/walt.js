// The notebook in the old tent (the game-loop round, stream C: docs/build/game-loop-brief.md; the canon in
// docs/story/00-owner-decisions.md "How the player gets the notebook"). The first night you sleep in the old canvas tent
// from the back room (items.js walttent), whatever the route, a card after the night: reading by headlamp, a small
// notebook found in the tent. The notebook goes onto the tent's floor (or into a pack, or is kept for you), and the
// story hears of it (story-hooks.js 'notebook:found'). Once a season: a second night, a nap, or a night in another tent
// does nothing. This round the words are placeholders (story.pages()); the campaign fills them later (story.setPages).
//
// The notebook's verb is Read (items.js waltnotebook): a paper of story.pages(), one page at a time, ← → or a click to
// turn, Esc or E to put it away. A moment teaches it once, the morning it is found.
//
//   walt.attach({ trip, camp, inventory, hud, veil, day, story, world, player })
//   walt.onSleep(e) (trip.on('sleep')) · walt.find({ key, lake }) → bool · walt.found · walt.open(page?) · walt.close()
//   walt.readVerb(ref) → the verb's check (main.js routes inventory.verb('read') here) · walt.paperOpen · walt.moments()
import { addIcons } from './inv-ui.js';
import { absDay } from './trip.js';

const NIGHT_HOURS = 4;     // a sleep this long or more, waking before noon, is a night (a nap is logged as 'nap' anyway)
const CARD_HOLD = 7;       // seconds the reading card holds at dark
const MOMENT_FOR = 120;    // real seconds after the card that the reading moment may still come up

// the notebook's icon in the book's grids: a small cloth-bound book, a pencil in its spine
function drawNotebook(c) {
  const INK = '#2a2016';
  c.beginPath(); c.roundRect(14, 8, 62, 84, 4); c.fillStyle = '#5a4632'; c.fill(); c.lineWidth = 2.2; c.strokeStyle = INK; c.lineJoin = 'round'; c.stroke();
  c.beginPath(); c.roundRect(20, 12, 54, 76, 2); c.fillStyle = '#e7dcc0'; c.fill(); c.lineWidth = 1.2; c.stroke();
  c.lineWidth = 1; c.strokeStyle = '#9a8a70';
  for (let y = 26; y < 84; y += 9) { c.beginPath(); c.moveTo(26, y); c.lineTo(68, y + (y % 2 ? 1 : -1)); c.stroke(); }
  c.beginPath(); c.roundRect(14, 8, 9, 84, 2); c.fillStyle = '#463525'; c.fill(); c.lineWidth = 1.6; c.strokeStyle = INK; c.stroke();
  c.beginPath(); c.moveTo(78, 6); c.lineTo(84, 6); c.lineTo(84, 70); c.lineTo(81, 78); c.lineTo(78, 70); c.closePath(); c.fillStyle = '#c9a24a'; c.fill(); c.lineWidth = 1.4; c.stroke();
}
try { addIcons({ waltnotebook: [92, 100, drawNotebook] }); } catch { /* the book's icons are inv-ui.js's */ }

const CSS = `
#notebook { position: fixed; left: 50%; top: 50%; transform: translate(-50%, -50%); z-index: 7; width: min(560px, calc(100vw - 48px)); max-height: calc(100vh - 120px); box-sizing: border-box; padding: 34px 40px 22px; background: #ece4cf; color: #2a2016; border-radius: 3px; box-shadow: 0 18px 50px rgba(0, 0, 0, .45), inset 0 0 0 1px rgba(90, 70, 50, .25); font: 17px/1.6 Alegreya, Georgia, serif; display: none; }
#notebook.show { display: block; }
#notebook .nk { font: 700 11px/1.4 "Alegreya Sans SC", sans-serif; letter-spacing: .16em; color: #6a5a45; }
#notebook h2 { margin: 6px 0 12px; font: 500 26px/1.2 Alegreya, Georgia, serif; }
#notebook .np { margin: 0; font: 22px/1.45 Caveat, "Bradley Hand", cursive; color: #3a3026; white-space: pre-line; min-height: 8em; }
#notebook .nf { display: flex; justify-content: space-between; align-items: center; margin-top: 18px; font: 700 12px/1.4 "Alegreya Sans SC", sans-serif; letter-spacing: .14em; color: #6a5a45; }
#notebook button { appearance: none; background: none; border: none; padding: 0; margin: 0; font: inherit; letter-spacing: inherit; color: #2a2016; cursor: pointer; }
#notebook button:disabled { color: #b0a48a; cursor: default; }
#notebook button:hover:not(:disabled), #notebook button:focus-visible { color: #b4321f; outline: none; }
`;

export class Walt {
  constructor() { this.t = {}; this.el = null; this.page = 0; this.cardAt = -1e9; }
  attach(t = {}) {
    Object.assign(this.t, t);
    const { trip, hud } = this.t;
    if (trip && typeof trip.on === 'function') trip.on('sleep', (e) => this.onSleep(e));
    if (hud && typeof hud.registerPaper === 'function') hud.registerPaper('notebook', () => this.hide());
    return this;
  }
  get found() { const s = this.t.story; return !!(s && s.state && s.state.notebook && s.state.notebook.found); }
  get paperOpen() { return !!(this.el && this.el.classList.contains('show')); }

  // --- the first night in the old tent ---------------------------------------------------------------------------------
  // trip.on('sleep'): a night (not a nap, not a sleep by day) with the old canvas tent pitched over you, first time only
  onSleep(e) {
    if (this.found || !e) return false;
    const camp = this.t.camp, c = camp && camp.camp;
    if (!c || c.item !== 'walttent' || !(c.stage >= 3)) return false;
    const woke = e.at && Number.isFinite(e.at.hours) ? e.at.hours : 7;
    if (Number.isFinite(e.hours) && e.hours < NIGHT_HOURS) return false;
    if (woke >= 12) return false; // (a sleep by day wakes in the afternoon)
    const w = this.t.world, p = this.t.player, at = c.site || c;
    const id = w && typeof w.lakeIdAt === 'function' ? w.lakeIdAt(at.x, at.z) || (p && typeof p.nearWater === 'function' ? p.nearWater(at.x, at.z, 40) : 0) : 0;
    const lake = id && w.lakeName ? w.lakeName(id) || null : null; // (the site's lake: the water beside it)
    return this.find({ key: c.key ?? e.key ?? null, lake });
  }
  // the notebook found: into the tent (its floor's pile), else where it fits, else kept for you; the story told; the card
  find({ key = null, lake = null } = {}) {
    if (this.found) return false;
    const inv = this.t.inventory, d = this.t.day, s = this.t.story;
    let put = false;
    if (inv) {
      try {
        const pile = typeof inv.tentPile === 'function' ? inv.tentPile(true) : null;
        put = !!(pile && inv.put(pile, 'waltnotebook'));
        if (!put) put = inv.place('waltnotebook', 1, { crate: true, all: true }).placed > 0;
        if (typeof inv.write === 'function') inv.write();
      } catch (err) { console.warn('walt: the notebook', err); }
    }
    const abs = d ? absDay(d.year, d.doy) : 0;
    if (s && typeof s.found === 'function') s.found({ abs, key, lake });
    this.card();
    return put;
  }
  // last night, by headlamp: the notebook's first page, a card over the morning
  card() {
    const v = this.t.veil, s = this.t.story, pages = s && typeof s.pages === 'function' ? s.pages() : [];
    const first = pages[0] || { text: '' };
    this.cardAt = performance.now();
    const opts = { kicker: 'Last night, by headlamp', text: first.text, sub: 'A small notebook, wedged in a seam of the old tent’s floor.', fadeIn: 1.2, hold: CARD_HOLD, fadeOut: 2 };
    if (v && typeof v.card === 'function') return v.card(opts).then(() => { this.cardAt = performance.now(); });
    const hud = this.t.hud; if (hud && hud.note) hud.note(`${opts.sub} ${opts.text}`, 8);
    return Promise.resolve();
  }

  // --- reading -----------------------------------------------------------------------------------------------------------
  // the book's Read on the notebook (inventory.verb 'read', routed here by main.js)
  readVerb(ref) {
    const inv = this.t.inventory, hit = ref && inv && typeof inv.refOf === 'function' ? inv.refOf(ref) : null;
    if (hit && hit.e && hit.e.id !== 'waltnotebook') return null;
    return { enabled: true, why: null, needs: [], next: '', run: () => { this.open(); return { ok: true, words: '' }; } };
  }
  build() {
    if (this.el) return this.el;
    const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    const el = this.el = document.createElement('div');
    el.id = 'notebook'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'A small notebook');
    el.innerHTML = '<div class="nk"></div><h2></h2><p class="np"></p><div class="nf"><button type="button" data-n="prev">← Back</button><span class="nc"></span><button type="button" data-n="next">On →</button></div><div class="nf"><span></span><button type="button" data-n="close">Put it away · Esc</button></div>';
    el.addEventListener('click', (e) => { const b = e.target.closest('button[data-n]'); if (!b || b.disabled) return; if (b.dataset.n === 'close') this.close(); else this.turn(b.dataset.n === 'next' ? 1 : -1); });
    el.addEventListener('pointerdown', (e) => e.stopPropagation());
    window.addEventListener('keydown', (e) => {
      if (!this.paperOpen) return;
      if (e.code === 'Escape' || e.code === 'KeyE') { e.preventDefault(); e.stopImmediatePropagation(); this.close(); const p = this.t.player; if (p && p.input && p.input.once) p.input.once.delete('KeyE'); }
      else if (e.code === 'ArrowRight' || e.code === 'ArrowLeft') { e.preventDefault(); e.stopImmediatePropagation(); this.turn(e.code === 'ArrowRight' ? 1 : -1); }
    }, true);
    document.body.appendChild(el);
    return el;
  }
  open(page = null) {
    const el = this.build(), hud = this.t.hud;
    if (hud && typeof hud.openPaper === 'function') hud.openPaper('notebook');
    if (page != null) this.page = page;
    el.classList.add('show');
    this.render();
  }
  turn(d) { const n = this.pages().length; this.page = Math.max(0, Math.min(n - 1, this.page + d)); this.render(); }
  pages() { const s = this.t.story; return s && typeof s.pages === 'function' ? s.pages() : []; }
  render() {
    const el = this.el; if (!el) return;
    const pages = this.pages(), n = pages.length, i = Math.max(0, Math.min(n - 1, this.page)), pg = pages[i] || { title: '', text: '' };
    this.page = i;
    const s = this.t.story; if (s && typeof s.read === 'function' && n) s.read(i);
    el.querySelector('.nk').textContent = 'A small notebook · pencil';
    el.querySelector('h2').textContent = pg.title || '';
    el.querySelector('.np').textContent = pg.text || '';
    el.querySelector('.nc').textContent = n ? `${i + 1} of ${n}` : '';
    el.querySelector('[data-n="prev"]').disabled = i <= 0;
    el.querySelector('[data-n="next"]').disabled = i >= n - 1;
  }
  hide() { if (this.el) this.el.classList.remove('show'); }
  close() { this.hide(); const hud = this.t.hud; if (hud && typeof hud.closePaper === 'function') hud.closePaper('notebook'); }

  // the moment hints.js gets (main.js pushes it and wraps hints.due): the notebook found and not read, once
  moments() {
    return [{ id: 'notebook', prio: 1, recur: 'once', text: 'The notebook: {I}, right-click it, Read.',
      due: () => this.found && !this.paperOpen && !(this.t.story && this.t.story.state.read.length) && performance.now() - this.cardAt < MOMENT_FOR * 1000 && !(this.t.veil && this.t.veil.active) }];
  }
}

export const walt = new Walt();
