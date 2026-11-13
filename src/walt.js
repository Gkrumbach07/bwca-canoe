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
import { STORY_ON } from './story-flag.js';
import { WALT_IDS } from './items.js';
// st-b (stream B, Round 1; campaign-design §6.1, docs/story/10-notebook.md §10, 20 §2.3): under STORY_ON the trigger is
// the first overnight of a trip on which any of Walt's things is carried (on you, in the canoe, set down at camp, or the
// old tent pitched), whatever you sleep in; host only (a co-op guest's story is a mirror and finds nothing). The night
// is the cutscene (nightone.js, loaded only under the flag): camp.wake waits on it at full dark, so it plays before the
// night passes; the notebook then goes into your pockets, bound (items.js), and the book's Walt side opens on it
// (notebook.js). Read opens the book there. With the flag off all of this is skipped and walt.js is as it was.
const CARRY_R = 200; // m: a thing of Walt's set down this near (at camp, the canoe at the landing) is on the trip

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
  constructor() { this.t = {}; this.el = null; this.page = 0; this.cardAt = -1e9; this.cut = null; this.cutNight = null; }
  attach(t = {}) {
    Object.assign(this.t, t);
    const { trip, hud } = this.t;
    if (trip && typeof trip.on === 'function') trip.on('sleep', (e) => this.onSleep(e));
    if (hud && typeof hud.registerPaper === 'function') hud.registerPaper('notebook', () => this.hide());
    if (STORY_ON) this.attachStory(); // st-b
    return this;
  }
  // st-b: the night-one cutscene hung on the camp's night (camp.wake waits on it) and the frame (veil.update drives it)
  attachStory() {
    const { camp, veil } = this.t;
    this.cutReady = Promise.all([import('./nightone.js'), import('./story-data/words.js').then((m) => m.loadText().then(() => m))])
      .then(([N, T]) => { this.NightOne = N.NightOne; this.nbText = T.nbText; return true; })
      .catch((e) => { console.warn('walt: night one', e); return false; });
    if (camp && typeof camp.wake === 'function' && !camp.wake.stB) {
      const wakeC = camp.wake.bind(camp);
      camp.wake = () => {
        const n = camp.night;
        if (!this.nightOneDue(n)) return wakeC();
        return this.playNightOne().then(() => wakeC(), () => wakeC());
      };
      camp.wake.stB = true;
    }
    if (veil && typeof veil.update === 'function' && !veil.update.stB) {
      const updV = veil.update.bind(veil);
      veil.update = (dt) => { updV(dt); if (this.cut) this.cut.update(dt); };
      veil.update.stB = true;
    }
  }
  get guest() { const s = this.t.story; return !!(s && s.mode === 'mirror'); }
  // is any of Walt's things on this trip? (the old tent pitched; else each of them by where it is)
  carried() {
    const inv = this.t.inventory, camp = this.t.camp, c = camp && camp.camp;
    if (c && WALT_IDS.includes(c.item)) return true;
    if (!inv || !Array.isArray(inv.containers)) return false;
    const near = (k) => {
      const r = typeof inv.root === 'function' ? inv.root(k) : k;
      switch (r && r.where) {
        case 'back': case 'chest': case 'hands': case 'pockets': return true;
        case 'canoe': { const sp = typeof inv.canoeSpot === 'function' ? inv.canoeSpot() : null; return !sp || inv.dist(sp) <= CARRY_R; }
        case 'ground': case 'hung': case 'tent': return !r.at || inv.dist(r.at) <= CARRY_R;
        default: return false; // (the stash: kept for you by the outfitters)
      }
    };
    for (const k of inv.containers) {
      if (WALT_IDS.includes(k.item) && near(k)) return true;
      if (k.grid && k.grid.some((e) => !e.box && WALT_IDS.includes(e.id)) && near(k)) return true;
    }
    return false;
  }
  // the night that is night one: a night (not a nap, not a sleep by day, waking before noon), the notebook not found, the
  // host's, the bundle along
  nightOneDue(n) {
    if (!STORY_ON || !n || n.nap || n.day || this.found || this.guest) return false;
    if (Number.isFinite(n.hours) && n.hours < NIGHT_HOURS) return false;
    if (Number.isFinite(n.wakeAt) && n.wakeAt >= 12) return false;
    return this.carried();
  }
  // the cutscene (nightone.js); resolves when it ends (the night then passes)
  playNightOne() {
    return (this.cutReady || Promise.resolve(false)).then((ok) => {
      if (!ok || !this.NightOne) return null;
      const s = this.t.story, meta = s && typeof s.meta === 'function' ? s.meta() : {};
      this.cut = new this.NightOne({ text: this.nbText(), seen: !!meta.nightOneSeen });
      this.cutNight = { at: performance.now() };
      // a paper while it plays, so Esc is the cutscene's (title.js pauses on an Esc only with no paper up)
      const hud = this.t.hud;
      if (hud && typeof hud.registerPaper === 'function' && !this.cutPaper) { hud.registerPaper('nightone', () => {}); this.cutPaper = true; }
      if (hud && typeof hud.openPaper === 'function') hud.openPaper('nightone');
      return this.cut.play().then((r) => {
        if (hud && typeof hud.closePaper === 'function') hud.closePaper('nightone');
        if (s && typeof s.setMeta === 'function') s.setMeta({ nightOneSeen: true });
        this.cutNight.done = r; return r;
      });
    });
  }
  get found() { const s = this.t.story; return !!(s && s.state && s.state.notebook && s.state.notebook.found); }
  get paperOpen() { return !!(this.el && this.el.classList.contains('show')); }

  // --- the first night in the old tent ---------------------------------------------------------------------------------
  // trip.on('sleep'): a night (not a nap, not a sleep by day) with the old canvas tent pitched over you, first time only
  onSleep(e) {
    if (this.found || !e) return false;
    if (this.t.story && this.t.story.mode === 'mirror') return false; // k1a: a co-op guest never finds a notebook (the host's is the one)
    if (STORY_ON) return this.onSleepStory(e); // st-b
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
  // st-b: the morning after night one (the cutscene played, or a night the camp's hook missed: then it plays now): found
  onSleepStory(e) {
    const woke = e.at && Number.isFinite(e.at.hours) ? e.at.hours : 7;
    if (Number.isFinite(e.hours) && e.hours < NIGHT_HOURS) return false;
    if (woke >= 12) return false;
    const played = !!(this.cutNight && this.cutNight.done);
    if (!played && !this.carried()) return false;
    const camp = this.t.camp, c = camp && camp.camp, w = this.t.world, p = this.t.player, at = (c && c.site) || c || p || {};
    const id = w && typeof w.lakeIdAt === 'function' && Number.isFinite(at.x) ? w.lakeIdAt(at.x, at.z) || (p && typeof p.nearWater === 'function' ? p.nearWater(at.x, at.z, 40) : 0) : 0;
    const lake = id && w.lakeName ? w.lakeName(id) || null : null;
    const r = this.find({ key: (c && c.key) ?? e.key ?? null, lake });
    if (!played) this.playNightOne(); // (no camp night to hold: the cutscene over the morning)
    return r;
  }
  // the notebook found: into your pocket, else the tent (its floor's pile), else where it fits, else kept for you; the story
  // told; the card
  find({ key = null, lake = null } = {}) {
    if (this.found) return false;
    if (STORY_ON) return this.findStory({ key, lake }); // st-b
    const inv = this.t.inventory, d = this.t.day, s = this.t.story;
    let put = false;
    if (inv) {
      try {
        // (into your pocket first: read by headlamp, it stays on you; on the tent's floor it went out by the door with the
        // strike, the story's one item left on the ground at the site: the playthrough)
        const pk = inv.pockets;
        put = !!(pk && inv.put(pk, 'waltnotebook'));
        const pile = !put && typeof inv.tentPile === 'function' ? inv.tentPile(true) : null;
        if (!put) put = !!(pile && inv.put(pile, 'waltnotebook'));
        if (!put) put = inv.place('waltnotebook', 1, { crate: true, all: true }).placed > 0;
        if (typeof inv.write === 'function') inv.write();
      } catch (err) { console.warn('walt: the notebook', err); }
    }
    const abs = d ? absDay(d.year, d.doy) : 0;
    if (s && typeof s.found === 'function') s.found({ abs, key, lake });
    this.card();
    return put;
  }
  // st-b: found under STORY_ON: into your pockets (bound: pockets or a hand only; a pocket's thing moved out to make room
  // if it must), the story told; no card (the cutscene was the night)
  findStory({ key = null, lake = null } = {}) {
    const inv = this.t.inventory, d = this.t.day, s = this.t.story;
    let put = false;
    if (inv) {
      try {
        const pk = inv.pockets;
        put = !!(pk && inv.put(pk, 'waltnotebook'));
        if (!put && pk) {
          const e = pk.grid.slice().reverse().find((q) => !q.box && !q.fixed && q.id !== 'bottle');
          if (e) { const moved = inv.place(e.id, e.qty, { data: e.data || null, crate: true, all: true, exclude: [pk.id] }); if (moved.placed > 0) inv.take(pk.id, e.uid, moved.placed); }
          put = !!inv.put(pk, 'waltnotebook');
        }
        if (!put && typeof inv.toHandNew === 'function') { const r = inv.toHandNew('waltnotebook'); put = !!(r && r.ok); }
        if (typeof inv.write === 'function') inv.write();
      } catch (err) { console.warn('walt: the notebook', err); }
    }
    const abs = d ? absDay(d.year, d.doy) : 0;
    if (s && typeof s.found === 'function') s.found({ abs, key, lake });
    this.cardAt = performance.now();
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
    const book = STORY_ON ? this.t.book : null; // st-b: the book's Walt side, at the notebook
    if (book && typeof book.open === 'function') return { enabled: true, why: null, needs: [], next: '', run: () => { book.open('nb'); return { ok: true, words: '' }; } };
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
    // st-b: the morning after night one, once, until the book is opened (20 §4: "The notebook is in your book: {I}.")
    if (STORY_ON) return [{ id: 'notebook', prio: 1, recur: 'once', text: 'The notebook is in your book: {I}.',
      due: () => this.found && !(this.t.book && this.t.book.opened) && !(this.cut && this.cut.active) && !(this.t.veil && this.t.veil.active) }];
    return [{ id: 'notebook', prio: 1, recur: 'once', text: 'The notebook: {I}, right-click it, Read.',
      due: () => this.found && !this.paperOpen && !(this.t.story && this.t.story.state.read.length) && performance.now() - this.cardAt < MOMENT_FOR * 1000 && !(this.t.veil && this.t.veil.active) }];
  }
}

export const walt = new Walt();
