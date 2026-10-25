// The world cards (the owner's third round of 2026-10-24: "the whole inventory system … confusing", "a card opens
// only where there is something to move or a choice to make"). The book is the one screen for stuff: yours, and what
// lies within reach in its right pane, Here (inv-ui.js MineSide; journal.openHere lights a container or a pile there).
// A card is for a job: the fire. It is the two-pane screen the shelf uses, your stuff on the left (the body and your
// tabs, as in the book) and the thing on the right: the fire's fuel (wood only), the grate (the pot, a meal or a fish,
// what is cooked), the ash, a burn meter and a cooking meter, Light / Cook / Eat / Douse (held where held). Drag between
// them. Esc or E closes it. The fire's state is nearby.objects()'s (stream A), read through inv-ui's fireObject.
//
//   import { cards } from './cards.js';
//   cards.attach({ hud, nearby, journal, player, hold, onUse })   (main.js, the wc B block)
//   cards.open(kind, ref) → bool    kind 'fire' (ref: the ring's key, 'fire:<key>' or the object); 'container' and
//                                   'pile' go to the book's right pane (journal.openHere(ref)): the book shows stuff
//   cards.close()
//   cards.update(dt)                each frame (main.js runs it with the journal's update): the ring on a held button,
//                                   the meters, and the card put away when the fire is out of reach
//   cards.shown (bool), cards.kind, cards.ref
import { MineSide, firePanel, livenPanel, panelSig, fireObject, SCREENS, tickHold, stopHold, closeMenu, hideTip, refresh, destroyGridsIn, attach as invAttach } from './inv-ui.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));

class Cards {
  constructor() {
    this.el = null; this.shown = false; this.kind = null; this.ref = null; this.obj = null;
    this.mine = null; this.sig = ''; this.psig = ''; this.t = 0; this.mt = 0; this.fresh = true;
    this.hud = null; this.nearby = null; this.journal = null; this.player = null; this.onUse = null;
    // the screen inv-ui.js works with (SCREENS: open, el, render, closeBook, mine, held; the verbs' fireObj)
    const me = this;
    this.screen = { held: null, wasHolding: false, get el() { return me.el; }, get open() { return me.shown; }, get mine() { return me.mine; },
      render: (f) => me.render(f), closeBook: () => me.close(), fireObj: () => me.fireObj(), onUse: (e, m, c) => (me.onUse ? me.onUse(e, m, c) : null) };
    // E or Esc puts the card away, ahead of the dot's E and the pause card (a capture listener made now, at load, so
    // it comes before title.js's)
    if (typeof window !== 'undefined') window.addEventListener('keydown', (e) => {
      if (!this.shown || e.repeat) return;
      if (e.code === 'KeyE' || e.code === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); this.close(); }
    }, true);
  }
  attach({ hud = null, nearby = null, journal = null, player = null, hold = null, onUse = null } = {}) {
    Object.assign(this, { hud, journal, player, onUse });
    if (nearby) { this.nearby = nearby; invAttach({ nearby }); }
    if (hold) invAttach({ hold });
    invAttach({ cards: this });
    return this;
  }
  ensure() {
    if (this.el) return;
    const el = this.el = document.createElement('div');
    el.id = 'card'; el.className = 'paper'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'A card: your stuff and the thing');
    (document.getElementById('shelf') || document.body).insertAdjacentElement('afterend', el);
    el.addEventListener('click', (ev) => { const b = ev.target.closest('button[data-act]'); if (b && b.dataset.act === 'close') this.close(); });
    // fb3 C (13, the owner: "when I'm by the fire I can't see the items like portage pack"): the left pane lists what is
    // in reach as Here does, as tabs beside yours: the containers and piles on the ground about you, the wood lying
    // about, the canoe's load when it is beside you
    this.mine = new MineSide({ owner: this.screen, onUse: this.screen.onUse, closeBook: () => this.close(), ground: true });
    SCREENS.add(this.screen);
    if (this.hud && this.hud.registerPaper) this.hud.registerPaper('card', () => this.close());
  }
  // the fire as nearby.objects() has it now, or null when it is out of reach
  fireObj() { return this.shown && this.kind === 'fire' ? fireObject(this.ref) : null; }
  open(kind, ref) {
    if (kind === 'container' || kind === 'pile') {
      const j = this.journal, id = ref && typeof ref === 'object' ? ref.cId || ref.id || ref.container || null : ref;
      if (j && typeof j.openHere === 'function') { j.openHere(id); return true; }
      return false;
    }
    if (kind !== 'fire') return false;
    const o = fireObject(ref);
    if (!o) return false;
    this.ensure();
    if (this.journal && this.journal.open && typeof this.journal.close === 'function') this.journal.close();
    this.kind = 'fire'; this.ref = o.key || o.id; this.obj = o;
    this.shown = true; this.fresh = true; this.sig = ''; this.psig = '';
    if (this.hud && this.hud.openPaper) this.hud.openPaper('card');
    this.el.classList.add('show');
    this.render(true);
    return true;
  }
  close() {
    if (!this.shown) return;
    stopHold(this.screen);
    this.shown = false; this.kind = null; this.ref = null; this.obj = null;
    this.el.classList.remove('show');
    closeMenu(); hideTip();
    destroyGridsIn(this.el);
    if (this.hud && this.hud.closePaper) this.hud.closePaper('card');
    refresh();
  }
  render(force) {
    if (!this.shown) return;
    const o = this.fireObj();
    if (!o) { this.close(); return; }
    this.obj = o;
    if (this.fresh) {
      this.fresh = false;
      this.el.className = 'paper show look-card';
      this.el.innerHTML = `<header>
        <div class="lede"><div class="sc kicker">${esc(this.where())}</div><h2>${esc(o.title || 'The fire ring')}</h2><div class="say cd-sub"></div></div>
        <div class="pk-note pencil" aria-live="polite"></div>
        <button type="button" class="stamp outline" data-act="close" aria-label="Step back from the fire (E or Esc)">Step back · E</button>
      </header>
      <div class="cd-body">
        <section class="cd-mine pk-mat" aria-label="Yours"></section>
        <section class="cd-thing" aria-label="${esc(o.title || 'The fire')}"></section>
      </div>
      <footer class="sh-foot"><span>yours and what is in reach on the left, a tab each · drag wood into the fuel, a meal or a fish onto the grate · held buttons: hold the mouse · what is cooked comes off the grate into your grid</span><span><kbd>E</kbd> or <kbd>Esc</kbd> closes</span></footer>`;
      this.el.querySelector('.cd-mine').appendChild(this.mine.el);
    }
    const sub = this.el.querySelector('.cd-sub'); if (sub.textContent !== (o.sub || '')) sub.textContent = o.sub || '';
    const ps = panelSig(o);
    if (force || ps !== this.psig) {
      this.psig = ps;
      const box = this.el.querySelector('.cd-thing');
      destroyGridsIn(box);
      box.textContent = '';
      box.appendChild(firePanel(o, this.screen));
    } else { const el = this.el.querySelector('.cd-thing .nb'); if (el) livenPanel(el, o); }
    this.mine.render(force);
    tickHold(this.screen, true);
  }
  where() {
    const n = typeof this.nearby === 'function' ? this.nearby() : this.nearby, c = n && n.camp;
    try { const s = c && c.nearestSite ? c.nearestSite(this.player.x, this.player.z, 6, true) : null; const nm = s && c.siteName ? c.siteName(s) : null; return nm ? `At camp · ${nm}` : 'At camp'; } catch { return 'At camp'; }
  }
  update(dt) {
    if (!this.shown) return;
    tickHold(this.screen);
    if ((this.mt += dt) > 0.2) { this.mt = 0; const o = this.fireObj(); if (!o) { this.close(); return; } const el = this.el.querySelector('.cd-thing .nb'); if (el) livenPanel(el, o); }
    if ((this.t += dt) > 0.4) { this.t = 0; this.render(false); }
  }
}

export const cards = new Cards();
export { Cards };
