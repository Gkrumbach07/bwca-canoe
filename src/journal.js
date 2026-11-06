// The book (I; fb4 B, decision 4: the one key, I or Esc closes it, Pack and Journal are tabs on its top edge; J, L,
// Tab, Shift-Tab and the arrow keys are gone): one leather-bound book with sides (SIDES), each a tab on its top edge. It
// opens at the pack. The gear, the food and what you carry are the pack side's (inv-ui.js PackSide): the Tarkov grids of
// your containers on a canvas mat. The pack side is one screen (wc B, the world cards): the body on the left, a tab per
// container across the top, and since fb4 B what is around you as tabs on the right (the canoe, each container on the
// ground, Wood, The ground, the outfitters' keeping); a click turns a tab; openHere(ref) is stream A's Q.
//
// The journal side is an open book (book.css: the cover, the block of pages under the open two, the seam; paper.css:
// worn paper, the hand) with index tabs down its right edge. The owner's second round (2026-10-31: "think of the journal
// as ... once you pencil it in, you're not really unpenciling it in"): nothing on a page says what is not there yet, and
// nothing tells you which key does what; a page with nothing on it is a blank page with its heading.
//   Tasks   the notices you took, folded into the book: their titles in a pencilled checklist on the right (a box, half
//           a box, a tick; crossed out when paid), and the one picked unfolded on the left as the paper it was
//           (flyers.js: a café's guest check, a LOST poster, a Forest Service form, a visitor's scrap of notebook).
//           A ranger's ticket (r2, permits.js tickets) heads the list, drawn as the ticket it is (no deadline, no pay):
//           Pay $20 on it when the money is in hand (a right-click on its line pays it too), else what is missing; paid,
//           it is stamped and gone
//           r3 B (2026-11-05): the guide's entries (guide.js) too. The story's steps head the list in a deeper amber ink
//           with a small gold gem in the margin, side stories in teal with an open star; every open line has the
//           guide's one plain "what next" under it (.nx); a story step picked is a page written in the journal
//           (what to do now, and where). showTask(id) opens here at one entry (the tracker's I: taskPeek)
//   Fish    your own fishing log on the right, a line a fish (date, time, water, weather, fish, size, lure; a star by
//           your biggest of each), and tucked into the left page the outfitter's fold-out pamphlet: open it for the
//           fish of these lakes, pick one for its panel
//   Trips   the logbook (record.js, else trip.js's book), a pencilled line a trip on the right; its page on the left
//   Photos  the prints (photo.js) taped in small on the right; the one picked big on the left with what it is of
// Data comes from the fishing code (log, bests), the tasks, the outfitter's trip, the trip core's logbook, the season's
// record (journal.record) and the camera (journal.photos). showRecord(id) opens the book at a trip's page.
import { clock12, longDate, shortDate, esc, plural, word, fishSilhouette } from './hud.js';
import { PackSide } from './inv-ui.js';
import { KINDS } from './tasks.js'; // fb3 C: a notice's kind, for its progress and its label
import { itemDef } from './items.js';
import { fishPicture } from './fish-portrait.js';
import { flyerHtml, ticketHtml, ticketWhy } from './flyers.js';
import { dateWords } from './permits.js';
import './paper.css';
import './flyers.css';
import './fishbook.css';
import './book.css';

import { MapBook } from './map-book.js'; // the map as the book's third tab

const SIDES = ['pack', 'journal', 'map']; // (the owner, 2026-10-31: "pack, journal, map": map-book.js)

export class Journal {
  // t: { hud, world, player, day, fishing, tasks, energy, outfitter, stats, wind, onUse }
  constructor(t) {
    Object.assign(this, t);
    this.el = document.getElementById('journal');
    this.open = false; this.tab = 'tasks'; this.page = 0; this.sig = ''; this.t = 0; this.side = 'journal';
    this.record = null; // round A-A: the season's record (record.js)
    this.taskSel = null; this.tripSel = null; this.printSel = null; // what is picked on each tab
    this.pam = null; // the fish pamphlet: null folded in the page, 'open', or a species' panel
    this.shownFlyer = null; this.logEnd = true; // (the flyer unfolds once when picked; the log opens at its last line)
    this.permits = null; this.stamped = null; // r2: the tickets (permits.js), and one just paid ({ f, t }: its stamp, then gone)
    if (this.guide === undefined) this.guide = null; // r3 B: the guide (guide.js): what is on the go, for the Tasks page
    this.taskPeek = null; // r3 B: the tracker's card (tracker.js): the task it shows now, for I (or null)
    // the book: a tab for each side on its top edge, the journal's spread and the pack's mat
    this.el.classList.add('book');
    this.el.setAttribute('aria-label', 'The book: the pack, the journal and the map');
    this.el.innerHTML = `<div class="book-tabs" role="tablist"><button type="button" class="book-tab p" data-side="pack" role="tab">Pack</button><button type="button" class="book-tab j" data-side="journal" role="tab">Journal</button><button type="button" class="book-tab m" data-side="map" role="tab">Map</button></div>
      <div class="side j"></div><div class="side p"></div><div class="side m"></div>`;
    this.jEl = this.el.querySelector('.side.j'); this.pEl = this.el.querySelector('.side.p');
    this.jEl.classList.add('pp-spread'); // the journal's paper (paper.css)
    this.el.querySelector('.side.m').classList.add('pp'); // (the map's index takes the same hand: paper.css .pp-head)
    this.pack = new PackSide(this.pEl, { onUse: t.onUse || null, closeBook: () => this.close() }); // fb2 B: a nearby thing's action that wants the world (Pitch, Eat at the fire) closes the book first
    this.map = new MapBook(this.el.querySelector('.side.m'), { hud: this.hud, journal: this, world: this.world, tasks: this.tasks, outfitter: this.outfitter });
    this.hud.registerPaper('journal', () => this.close());
    this.el.addEventListener('click', (e) => {
      const side = e.target.closest('[data-side]'); if (side) { this.setSide(side.dataset.side); side.blur(); return; } // (no focus ring left on it for the next key)
      const tab = e.target.closest('[data-tab]'); if (tab) { this.tab = tab.dataset.tab; this.page = 0; this.logEnd = true; this.render(true); return; }
      // the pamphlet: opened, a fish's panel, back to the list, folded away again by a click on the page round it
      const pm = e.target.closest('[data-pam]');
      if (pm) { const v = pm.dataset.pam; this.pam = v === 'fold' ? null : v; this.render(true); return; }
      if (this.tab === 'fish' && this.pam && e.target.closest('.pp-page.left') && !e.target.closest('.pam')) { this.pam = null; this.render(true); return; }
      // a pick on the right page: its page on the left, scrolled to the top
      const pay = e.target.closest('[data-pay-ticket]'); if (pay) { this.payTicket(pay.dataset.payTicket); return; }
      const pick = e.target.closest('[data-task], [data-trip], [data-print]');
      if (pick) {
        if (pick.dataset.task) this.taskSel = pick.dataset.task; else if (pick.dataset.trip) this.tripSel = pick.dataset.trip; else this.printSel = Number(pick.dataset.print);
        this.render(true); const sc = this.jEl.querySelector('.pp-page.left .pp-scroll'); if (sc) sc.scrollTop = 0; return;
      }
      const close = e.target.closest('[data-close]'); if (close) this.close();
    });
    // r2: a ticket's line, right-clicked, pays it (as its Pay button does)
    this.el.addEventListener('contextmenu', (e) => {
      const row = e.target.closest('[data-task^="ticket:"]'); if (!row) return;
      e.preventDefault();
      this.taskSel = row.dataset.task;
      this.payTicket(row.dataset.task.slice(7));
    });
    // fb4 B (decision 4; the owner, 2026-10-25: "It should just be one key, I, to get into the inventory. You can switch
    // over to your journal"): I opens the book at the pack and closes it from either side; Esc closes it; the tabs on its
    // top edge turn it. The counter, the shelves and a card keep the keys while they are up.
    window.addEventListener('keydown', (e) => {
      const tag = e.target && e.target.tagName;
      if (tag === 'SELECT' || tag === 'INPUT' || tag === 'TEXTAREA') return;
      const busy = this.hud.paper === 'outfitter' || this.hud.paper === 'shelf' || this.hud.paper === 'card';
      if (e.code === 'KeyI') {
        if (e.repeat || busy) return;
        if (this.open) { this.close(); return; }
        // r3 B: while the tracker's card is up with something new on it, I opens the journal at that task (once a
        // line: the next I is the pack again, as ever)
        const peek = typeof this.taskPeek === 'function' ? this.taskPeek() : null;
        if (peek) this.showTask(peek); else this.show('pack');
      }
      else if (this.open && e.code === 'Escape' && !e.mapPin) {
        if (this.side === 'map' && this.map.lake) this.map.closeLake();
        else if (this.side === 'journal' && this.tab === 'fish' && this.pam) { this.pam = null; this.render(true); } // (the pamphlet folds first)
        else this.close();
      } // (the map's pin takes its own Esc: hud.js)
    });
    // Tab does nothing while the book is open (the readout's Tab, hud.js, waits until it is shut): the tabs are clicked
    window.addEventListener('keydown', (e) => {
      if (!this.open || e.code !== 'Tab') return;
      e.preventDefault(); e.stopImmediatePropagation();
    }, true);
    this.setSide('pack');
  }
  // the book open at the pack side, with that container's (or pile's) grid in the right pane scrolled to and lit: stream A's
  // Q "Open it" on a container on the ground and Q "Open the pile" (ref: the container's id)
  openHere(ref) {
    this.show('pack');
    this.pack.openHere(ref);
    return true;
  }
  toggle() { if (this.open) this.close(); else this.show('pack'); }
  // round A-A: the book open at the journal's Trips, at a trip's page when given its id
  showRecord(id = null) {
    if (!this.record) return false;
    this.tab = 'trips'; this.page = 0; if (id) this.tripSel = id;
    if (this.open && this.side === 'journal') { this.render(true); return true; }
    this.show('journal');
    if (this.side !== 'journal') this.setSide('journal');
    return true;
  }
  // opened at a side (I: the pack), else at the side it was last turned to
  show(side = null) {
    if (side) this.setSide(side);
    if (this.open) return;
    this.open = true;
    this.hud.openPaper('journal');
    this.el.classList.add('show');
    if (this.side === 'pack') this.pack.show(); else if (this.side === 'map') this.map.show(); else this.render(true);
  }
  // M (hud.js): the book open at the map
  showMap() { if (this.open && this.side === 'map') return true; this.show('map'); return true; }
  close() {
    if (!this.open) return;
    this.open = false;
    this.pack.hide();
    this.map.hide();
    this.el.classList.remove('show');
    this.hud.closePaper('journal');
  }
  setSide(side) {
    if (!SIDES.includes(side)) return;
    this.side = side;
    for (const b of this.el.querySelectorAll('.book-tab')) { const on = b.dataset.side === side; b.classList.toggle('on', on); b.setAttribute('aria-selected', String(on)); }
    this.jEl.classList.toggle('on', side === 'journal'); this.pEl.classList.toggle('on', side === 'pack');
    this.el.querySelector('.side.m').classList.toggle('on', side === 'map');
    if (!this.open) return;
    if (side !== 'map') this.map.hide();
    if (side === 'pack') this.pack.show(); else if (side === 'map') { this.pack.hide(); this.map.show(); } else { this.pack.hide(); this.render(true); }
  }
  // while it is up, the page follows the game (a meal, a fish, the clock) at a gentle rate
  update(dt) {
    if (!this.open) return;
    if (this.side === 'pack') { this.pack.update(dt); return; }
    if (this.side === 'map') { this.map.update(dt); return; }
    if ((this.t += dt) > 0.5) { this.t = 0; this.render(false); }
  }

  // --- the words ------------------------------------------------------------------------------------------
  // fb3 C (16): a notice's state, plain. Taken: an empty box. In progress: a half box and the progress line ("1 of 2 in
  // the cooler"). Done: a tick and where to claim it. Returns { cls, words }.
  taskState(t) {
    const ts = this.tasks, k = KINDS[t.kind] || null;
    const at = (ep) => { const l = ts && ts.landing ? ts.landing(ep) : null; return l ? l.name : 'the outfitter'; };
    void at;
    // gl-d: pay lands at the trip's end (tasks.js settle), wherever you come in
    if (t.status === 'done') return { cls: 'done', words: 'paid when you come in' };
    // how far along: the kind's own fraction, else what is in the cooler or handed over against what is wanted
    let f = 0;
    if (k && typeof k.fraction === 'function') { const v = k.fraction(t); if (Number.isFinite(v)) f = v; }
    else { const n = t.need || 1; if (Array.isArray(t.cooler) && t.cooler.length) f = t.cooler.length / n; else if (Number.isFinite(t.got) && t.got > 0) f = t.got / n; }
    if (f > 0) return { cls: 'half', words: k && typeof k.progress === 'function' ? k.progress(t) : (ts && ts.progressOf ? ts.progressOf(t) : '') };
    return { cls: 'taken', words: '' };
  }
  get trip() { return this.outfitter ? this.outfitter.trip : null; }
  get core() { return this.outfitter ? this.outfitter.core : null; } // the trip's rules and permit (trip.js)
  get dayN() { const c = this.core; if (c) return c.active ? c.dayN : 0; const t = this.trip; return t && t.active ? Math.floor(this.outfitter.daysOut) + 1 : 0; }
  // the home outfitter's name (the pamphlet came from their counter)
  homeName() {
    const o = this.outfitter, ts = this.tasks, ep = o && o.profile ? o.profile.home : null;
    const L = ep != null && ts && ts.landing ? ts.landing(ep) : null;
    return L ? L.name : 'your outfitter';
  }
  signature() {
    const f = this.fishing, ts = this.tasks, c = this.core, R = this.record;
    return [this.tab, this.page, this.taskSel, this.pam, this.tripSel, this.printSel, f ? f.logVersion : 0,
      ts ? ts.active.map((t) => `${t.id}${t.status}${t.got || 0}${(t.cooler || []).length}`).join() : '', ts ? (ts.claimed || []).length : 0, this.dayN,
      c ? `${c.mode}${c.active}${c.book.trips.length}` : '', this.photos ? this.photos.version : 0, R ? R.version : '',
      typeof this.notes === 'function' ? (this.notes() || []).length : 0, this.ticketSig(), this.tab === 'tasks' ? this.guideSig() : ''].join('|');
  }

  render(force) {
    const sig = this.signature();
    if (!force && sig === this.sig) return;
    this.sig = sig;
    const scrolls = [...this.jEl.querySelectorAll('.pp-scroll, .pp-index')].map((n) => n.scrollTop);
    const tabs = this.tabs();
    if (!tabs.some(([k]) => k === this.tab)) this.tab = 'tasks';
    const body = this.tab === 'fish' ? this.fishTab() : this.tab === 'trips' ? this.tripsTab() : this.tab === 'photos' ? this.photosTab() : this.tasksTab();
    const nav = `<nav class="pp-tabs" aria-label="Journal pages">${tabs.map(([k, l, col]) => `<button type="button" class="pp-tab${this.tab === k ? ' on' : ''}" data-tab="${k}" style="--tab:${col}" aria-pressed="${this.tab === k}">${l}</button>`).join('')}</nav>`;
    const pageNo = (this.dayN || 0) * 2 + 1;
    this.jEl.innerHTML = `<section class="pp-page left${body.leftCls ? ` ${body.leftCls}` : ''}" aria-label="${esc(body.leftLabel || 'The page')}">${body.left}<div class="pp-foot left"><span>${pageNo - 1 || ''}</span></div></section>
      <section class="pp-page right${body.rightCls ? ` ${body.rightCls}` : ''}" aria-labelledby="right-h">${nav}${body.right}
        <div class="pp-foot"><span></span><span>${pageNo}</span></div></section>`;
    [...this.jEl.querySelectorAll('.pp-scroll, .pp-index')].forEach((n, i) => { if (scrolls[i]) n.scrollTop = scrolls[i]; });
    // the log opens at its last line, as a book is written
    if (this.tab === 'fish' && this.logEnd) { const lg = this.jEl.querySelector('.fl-log .pp-index'); if (lg) lg.scrollTop = lg.scrollHeight; this.logEnd = false; }
  }
  // the index tabs down the right page's edge: [key, label, colour]
  tabs() {
    return [['tasks', 'Tasks', '#5f7046'], ['fish', 'Fish', '#3f6273'], ...(this.record || this.core ? [['trips', 'Trips', '#8a5a34']] : []), ...(this.photos ? [['photos', 'Photos', '#74495a']] : [])];
  }

  // --- r2: the ranger's tickets (permits.js) ----------------------------------------------------------------------------
  tickets() { const P = this.permits; try { return P && typeof P.tickets === 'function' ? P.tickets() : []; } catch { return []; } }
  get purse() { const P = this.permits; return P ? Math.floor(P.money || 0) : 0; }
  get stampOn() { const s = this.stamped; return s && performance.now() - s.t < STAMP_MS ? s : null; }
  ticketSig() { const k = this.tickets(), s = this.stampOn; return `${k.map((f) => f.id).join(',')}:${k.length ? this.purse : ''}:${s ? s.f.id : ''}`; }
  // Pay: the money taken (permits.payTicket), the stamp comes down on it, and a moment later it is gone from the list
  payTicket(id) {
    const P = this.permits; if (!P) return false;
    const f = P.ticket(id); if (!f || f.paid) return false;
    const r = P.payTicket(id);
    if (r.ok) { this.stamped = { f: { ...f }, t: performance.now() }; this.taskSel = `ticket:${id}`; }
    else if (this.hud && typeof this.hud.note === 'function') this.hud.note(r.words, 4);
    this.render(true);
    if (r.ok) setTimeout(() => { if (this.open && this.side === 'journal') this.render(true); }, STAMP_MS + 60);
    return r.ok;
  }
  ticketPaper(f) { return { key: `ticket:${f.id}`, t: { id: `ticket:${f.id}`, ticket: f, title: 'A ranger’s ticket', kind: 'ticket' } }; }

  // --- Tasks: the notices folded into the book ------------------------------------------------------------------------
  // The owner (2026-10-31): "you might have a little entry thing where you have all your tasks right there and you press
  // on one, it unfolds the flyer and you can see it on the left ... You don't need to have all the information of the
  // task there, just sort of the title". The right page is the checklist in pencil (a box in the margin: empty, half a
  // box, a tick; a claimed one crossed out with its pay); the left page the picked notice unfolded (flyers.js), with a
  // pencilled word under it when there is something to do about it.
  // r3 B (the owner, 2026-11-05: "tasks that you pick up from the task board, or tasks that are related to the campaign
  // ... they both should show up in our journal. And they should look a little bit different ... an icon next to it
  // signifying like this is a main campaign task versus a side task"): the guide (guide.js) is what is on the go. Its
  // story steps head the list in a deeper amber ink with a small gold gem in the margin (the locator's gem), side stories
  // follow in a teal ink with an open four-point star, then the tickets, the notices and the starter job as they were.
  // Every open line carries the guide's one plain "what next" under it (.nx).
  guideList() { const G = this.guide; try { return G && typeof G.list === 'function' ? G.list() : []; } catch { return []; } }
  guideSig() { return this.guideList().map((e) => `${e.id}:${e.next}:${e.done ? 1 : 0}`).join(','); }
  // the paper's key for a guide entry: a notice's own id, a ticket's 'ticket:<id>', anything else its guide id
  static paperKey(id) { const s = String(id); return s.startsWith('task:') ? s.slice(5) : s; }
  // the book open at the journal's Tasks, at one entry (the tracker's I)
  showTask(id = null) {
    this.tab = 'tasks'; this.page = 0;
    if (id != null) this.focusTask = Journal.paperKey(id);
    if (this.open && this.side === 'journal') { this.render(true); return true; }
    this.show('journal');
    if (this.side !== 'journal') this.setSide('journal');
    return true;
  }
  tasksTab() {
    const ts = this.tasks, at = (ep) => { const l = ts && ts.landing ? ts.landing(ep) : null; return l ? l.name : 'the outfitter'; };
    const all = ts ? ts.active : [];
    let notes = [];
    try { notes = typeof this.notes === 'function' ? this.notes() || [] : []; } catch { notes = []; }
    // the guide's entries: by id (a notice's and a ticket's next line), and those that are the guide's own (story, side,
    // a hand-held entry with no notice or ticket behind it)
    const gl = this.guideList(), gBy = new Map(gl.map((e) => [e.id, e]));
    const own = gl.filter((e) => !e.id.startsWith('task:') && !e.id.startsWith('ticket:'));
    const quests = own.filter((e) => e.kind === 'story' || e.kind === 'side'), others = own.filter((e) => e.kind !== 'story' && e.kind !== 'side');
    const qPaper = (e) => ({ key: e.id, t: { id: e.id, guide: e, title: e.title, kind: e.kind } });
    // the papers in the book: the story and side steps, the notices taken (on the go, then done), a find noted
    // r2: the open tickets first among the jobs (and the one just paid, while its stamp comes down)
    const stamp = this.stampOn, open = this.tickets();
    const tickets = [...(stamp && !open.some((f) => f.id === stamp.f.id) ? [stamp.f] : []), ...open];
    const papers = [
      ...quests.filter((e) => !e.done).map(qPaper),
      ...tickets.map((f) => this.ticketPaper(f)),
      ...all.filter((t) => t.status !== 'done').map((t) => ({ key: String(t.id), t })),
      ...others.filter((e) => !e.done).map(qPaper),
      ...notes.map((n, i) => ({ key: `note:${i}`, t: { id: `note${i}`, note: true, title: n.title, text: n.words, kind: 'note' } })),
      ...all.filter((t) => t.status === 'done').map((t) => ({ key: String(t.id), t })),
      ...own.filter((e) => e.done).map(qPaper),
    ];
    if (this.focusTask != null) { this.taskSel = String(this.focusTask); this.focusTask = null; } // a notice picked on the map, or the tracker's I
    if (!papers.some((p) => p.key === this.taskSel)) this.taskSel = papers.length ? papers[0].key : null;
    // gl-d: the days left on each one held (its kind's deadline, tasks.js KIND_DAYS), pencilled after its title
    const dueW = (t) => {
      if (t.note || t.guide || t.status !== 'open' || !ts || typeof ts.daysLeft !== 'function') return '';
      const n = ts.daysLeft(t); if (n == null) return '';
      return n <= 0 ? 'last day' : n === 1 ? 'one day left' : `${word(n)} days left`;
    };
    const purse = this.purse;
    // the guide's next line for a paper (none once it is done: its status says so)
    const nextOf = (key, t) => {
      if (t.note) return '';
      const e = t.guide || gBy.get(t.ticket ? key : `task:${t.id}`);
      if (!e || e.done || t.status === 'done') return '';
      return t.ticket ? String(e.next || '').replace(/ in your journal \(I\)/, '') : e.next || '';
    };
    const nx = (w) => (w ? `<span class="nx">${esc(w)}</span>` : '');
    const line = ({ key, t }) => {
      const on = key === this.taskSel ? ' on' : '';
      if (t.ticket) {
        const f = t.ticket, n = f.n || 0, paid = !!(stamp && stamp.f.id === f.id), short = !paid && purse < n;
        return `<button type="button" class="pp-todo ticket k-ticket${paid ? ' paidnow' : ''}${on}" data-task="${esc(key)}" data-kind="ticket"><span class="pp-tk" aria-hidden="true"></span>
        <span class="t">${paid ? `<s>${esc(t.title)}</s>` : esc(t.title)}</span><span class="pay">$${n}</span>
        <span class="st">${paid ? 'paid' : `${esc(ticketWhy(f).toLowerCase())}${short ? ` · <b class="due last">you have $${purse}</b>` : ''}`}</span>${paid ? '' : nx(nextOf(key, t))}</button>`;
      }
      if (t.guide) {
        const e = t.guide, k = e.kind;
        const icon = k === 'story' || k === 'side' ? gemIcon(k) : `<span class="pp-box${e.done ? ' done' : ''}" aria-hidden="true"></span>`;
        const label = k === 'story' ? 'Story' : k === 'side' ? 'Side story' : '';
        return `<button type="button" class="pp-todo k-${k}${e.done ? ' done' : ''}${on}" data-task="${esc(key)}" data-kind="${k}"${label ? ` aria-label="${esc(`${label}: ${e.title}`)}"` : ''}>${icon}
        <span class="t">${esc(e.title || 'A task')}</span>${e.done ? '<span class="st">done</span>' : nx(nextOf(key, t))}</button>`;
      }
      const st = t.note ? { cls: 'taken', words: '' } : this.taskState(t), due = dueW(t);
      const box = st.cls === 'done' ? 'pp-box done' : st.cls === 'half' ? 'pp-box half' : 'pp-box';
      const k = t.note ? 'note' : t.kind === 'starter' ? 'starter' : 'board';
      return `<button type="button" class="pp-todo ${st.cls} k-${k}${on}" data-task="${esc(key)}" data-kind="${k}"><span class="${box}" aria-hidden="true"></span>
        <span class="t">${esc(t.title || t.clue || 'A notice')}</span>${t.pay ? `<span class="pay">$${t.pay}</span>` : ''}
        ${st.words || due ? `<span class="st">${due ? `<b class="due${due === 'last day' ? ' last' : ''}">${esc(due)}</b>${st.words ? ' · ' : ''}` : ''}${st.cls === 'done' ? 'done — ' : ''}${esc(st.words)}</span>` : ''}${nx(nextOf(key, t))}</button>`;
    };
    // the notices that went past their day: crossed out, with the line from whoever posted them (the last few)
    const missed = ts && Array.isArray(ts.missed) ? ts.missed.slice(-4) : [];
    const gone = missed.map((m) => `<div class="pp-todo missed"><span class="pp-box gone" aria-hidden="true"></span><span class="t"><s>${esc(m.title)}</s></span><span class="st">${esc(m.line)}</span></div>`).join('');
    const paid = ts ? (ts.claimed || []).slice(-8) : [], earned = ts ? ts.earned || 0 : 0, n = ts ? (ts.claimed || []).length : 0;
    const claimed = paid.map((c) => `<div class="pp-todo claimed"><span class="pp-box done" aria-hidden="true"></span><span class="t">${esc(c.title)}</span><span class="pay">$${c.pay}</span></div>`).join('');
    // (the story's open steps head the page, above what is done and paid)
    const top = papers.filter((p) => p.t.guide && !p.t.guide.done && (p.t.kind === 'story' || p.t.kind === 'side'));
    const rest = papers.filter((p) => !top.includes(p));
    const right = `<h2 class="pp-head" id="right-h">Tasks</h2>
      <div class="pp-index pp-ruled pp-lines">${top.map(line).join('')}${claimed}${gone}${rest.map(line).join('')}
        ${n ? `<div class="pp-todo sum"><span class="t">$${earned} from the boards, ${word(n)} ${plural(n, 'notice')} paid</span></div>` : ''}</div>`;
    const p = papers.find((q) => q.key === this.taskSel);
    let left = '';
    if (p && p.t.guide) {
      // a story or side step: no paper of its own, a page written in the journal (the step, what to do now, where)
      const e = p.t.guide, k = e.kind, fresh = this.shownFlyer !== p.key;
      this.shownFlyer = p.key;
      const label = k === 'story' ? 'The season’s story' : k === 'side' ? 'A side story' : k === 'starter' ? 'The first job' : 'A task';
      const where = e.target && e.target.label && !e.done ? `<p class="pp-qwhere"><i aria-hidden="true">${GLYPH.where}</i> ${esc(up(e.target.label))}</p>` : '';
      left = `<div class="pp-scroll pp-quest k-${k}${fresh ? ' fresh' : ''}">
        <p class="pp-qkind">${k === 'story' || k === 'side' ? gemIcon(k) : ''}${label}</p>
        <h3 class="pp-qtitle">${esc(e.title || 'A task')}</h3>
        ${e.done ? '<p class="pp-hand pp-qnext">Done.</p>' : e.next ? `<p class="pp-hand pp-qnext">${esc(e.next)}</p>` : ''}${where}</div>`;
      return { left, right, leftLabel: label, rightCls: 'tasks' };
    }
    if (p && p.t.ticket) {
      const f = p.t.ticket, n = f.n || 0, paid = !!(stamp && stamp.f.id === f.id), fresh = this.shownFlyer !== p.key;
      this.shownFlyer = p.key;
      const slip = ticketHtml(f, { date: dateWords(f.abs), paid, fresh: paid }).replace('class="fl ', `class="fl${fresh && !paid ? ' unfold' : ''} `);
      const act = paid ? '' : purse >= n
        ? `<p class="pp-tkpay"><button type="button" class="stamp" data-pay-ticket="${esc(f.id)}">Pay $${n}</button></p>`
        : `<p class="pp-hand pp-margin pp-tkshort">$${n} — you have $${purse}.</p>`;
      left = `<div class="pp-scroll pp-flyer">${slip}${act}</div>`;
      return { left, right, leftLabel: 'A ranger’s ticket', rightCls: 'tasks' };
    }
    if (p) {
      const t = p.t, st = t.note ? null : this.taskState(t), fresh = this.shownFlyer !== p.key;
      this.shownFlyer = p.key;
      const flyer = flyerHtml(t, { where: t.note ? '' : at(t.from), ep: t.from }).replace('class="fl ', `class="fl${fresh ? ' unfold' : ''} `);
      const nw = nextOf(p.key, t);
      const say = st && st.words ? `${st.cls === 'done' ? 'Done! ' : ''}${up(st.words).replace(/\.+$/, '')}.` : nw;
      left = `<div class="pp-scroll pp-flyer">${flyer}${say ? `<p class="pp-hand pp-margin">${esc(say)}</p>` : ''}</div>`;
    }
    return { left, right, leftLabel: 'A notice', rightCls: 'tasks' };
  }

  // --- Fish: your log, and the outfitter's pamphlet tucked in --------------------------------------------------------
  // The owner (2026-10-31): "your old traditional fishing log where you log the date, the time, the location slash water
  // body ... The weather, the species, the size, and the lure used. Put it all on one or two lines ... Put those stars
  // next to your PB. Very handwritten. The other one is the DNR provided or outfitter provided fishing pamphlet ... long
  // and skinny fold out things ... jammed in that page ... You open that up and it's got the fish that you can catch, and
  // you press on one and then it opens another page ... a lot more simplistic and informational".
  fishTab() {
    const f = this.fishing, SP = (f && f.species) || {}, log = f ? f.log : [];
    // the biggest of each kind: the log's longest (the first of a tie), unless a best from before the log's 200 beats it
    const top = {};
    log.forEach((c, i) => { const b = top[c.species]; if (!b || c.length > b.len) top[c.species] = { len: c.length, i }; });
    for (const [id, b] of Object.entries((f && f.bests) || {})) if (b && top[id] && b.length > top[id].len) delete top[id];
    const rows = log.map((c, i) => {
      const pb = top[c.species] && top[c.species].i === i;
      return `<div class="lg-row" role="row"><span>${c.year && c.doy ? esc(slashDate(c.year, c.doy)) : ''}</span><span>${Number.isFinite(c.hours) ? esc(shortClock(c.hours)) : esc(c.time || '')}</span>
        <span>${esc(shortLake(c.lake))}</span><span>${esc(c.sky || '')}</span><span>${pb ? '<b class="pb" title="your biggest">★</b>' : ''}${esc(fishWord(c.species, c.name))}</span>
        <span>${esc(sizeWords(c.length, c.weight))}</span><span>${esc(c.lureShort || c.lure || '')}</span></div>`;
    }).join('');
    const right = `<h2 class="pp-head" id="right-h">Fish log</h2>
      <div class="fl-log"><div class="lg-row lg-headrow" role="row" aria-hidden="true"><span>Date</span><span>Time</span><span>Water</span><span>Weather</span><span>Fish</span><span>Size</span><span>Lure</span></div>
        <div class="pp-index" role="table" aria-label="Your fishing log">${rows}</div></div>`;
    return { left: this.pamphlet(SP), right, leftLabel: 'The fishing pamphlet', rightCls: 'fish' };
  }
  // the fold-out: its cover tucked into the page; open, three panels (a word, then the fish); a fish, its own panels
  pamphlet(SP) {
    const ids = Object.keys(SP).filter((id) => PAM[id]), from = esc(this.homeName());
    if (!ids.length) return '';
    const sil = (id) => `<svg viewBox="0 0 110 56" aria-hidden="true">${fishSilhouette(id).replace(/#2a2016/g, 'currentColor').replace(/#ebe2cb/g, '#f4f0e2')}</svg>`;
    if (!this.pam) {
      return `<button type="button" class="pam pam-cover" data-pam="open" aria-label="The fishing pamphlet: open it">
        <span class="pam-kicker">A pocket guide</span><b>Fishing the Boundary Waters</b>${sil('walleye')}
        <span class="pam-list">${ids.map((id) => esc(PAM[id].name)).join(' · ')}</span><span class="pam-from">Compliments of ${from}</span></button>`;
    }
    const sizeOf = (sp) => `${Math.round(sp.length[0] / 2.54)}–${Math.round(sp.length[1] / 2.54)} in`;
    if (this.pam !== 'open' && SP[this.pam] && PAM[this.pam]) {
      const id = this.pam, sp = SP[id], P = PAM[id], url = fishPicture(id, {});
      return `<div class="pam pam-open pam-fish" role="dialog" aria-label="${esc(P.name)}">
        <section class="pam-panel"><span class="pam-kicker">${esc(sp.about && sp.about.latin ? sp.about.latin : '')}</span><h3>${esc(P.name)}</h3>
          <div class="pam-pic">${url ? `<img src="${url}" alt="">` : sil(id)}</div><p class="pam-look">${esc(P.look)}</p>
          <p class="pam-size"><b>Usual size</b> ${esc(sizeOf(sp))}</p></section>
        <section class="pam-panel"><dl><dt>Where</dt><dd>${esc(P.where)}</dd><dt>When</dt><dd>${esc(P.when)}</dd><dt>Try</dt><dd>${esc(P.try)}</dd></dl>
          ${P.note ? `<p class="pam-note">${esc(P.note)}</p>` : ''}<button type="button" class="pam-back" data-pam="open">‹ All the fish</button></section></div>`;
    }
    const row = (id) => { const url = fishPicture(id, {}); return `<button type="button" class="pam-row" data-pam="${id}">${url ? `<img src="${url}" alt="">` : sil(id)}<span><b>${esc(PAM[id].name)}</b><i>${esc(PAM[id].short)}</i></span></button>`; };
    const half = Math.ceil(ids.length / 2);
    return `<div class="pam pam-open" role="dialog" aria-label="The fishing pamphlet">
      <section class="pam-panel pam-intro"><span class="pam-kicker">A pocket guide</span><h3>Fishing the Boundary Waters</h3>
        <p>Six fish swim most of these lakes. Here is how to tell them apart, where they hang, and what they take.</p>
        <p class="pam-rules"><b>Before you go</b>Carry your license. Keep what you will eat tonight and let the rest go. No live minnows from outside; leeches are fine.</p>
        <span class="pam-from">Compliments of ${from}</span></section>
      <section class="pam-panel"><h4>What’s biting</h4>${ids.slice(0, half).map(row).join('')}</section>
      <section class="pam-panel"><h4>&nbsp;</h4>${ids.slice(half).map(row).join('')}<button type="button" class="pam-back fold" data-pam="fold">Fold it up</button></section></div>`;
  }
  // the two lures it takes best (fishing.js SPECIES[*].lures, with the shop's additions), by name
  bestLures(sp) {
    const L = Object.entries(sp.lures || {}).sort((a, b) => b[1] - a[1]).slice(0, 2);
    const nameOf = (id) => { const d = itemDef(`lure:${id}`); if (d && d.name) return d.name; const l = (this.fishing && this.fishing.lures || []).find((x) => x.id === id); return l ? l.name : id; };
    return L.map(([id]) => nameOf(id)).join(', ') || 'anything';
  }

  // --- Trips: the logbook, a trip a line; its page on the left ---------------------------------------------------------
  // The owner (2026-10-31): "I'd like to see the past trips I've done and the stats on each one ... the penciled in trips
  // on the right, and then when you press on one, it shows it on the left with the details". The season's record
  // (record.js) when it is attached, else the trip core's logbook (trip.js book).
  tripsTab() {
    const R = this.record && this.record.s ? this.record : null;
    if (R) {
      const v = R.view(), trips = v.trips; // newest first
      if (!trips.some((t) => t.id === this.tripSel)) this.tripSel = trips.length ? trips[0].id : null;
      const miles = trips.reduce((a, t) => a + (t.km || 0), 0) * MI;
      const list = trips.map((t) => `<button type="button" class="pp-entry${t.id === this.tripSel ? ' on' : ''}" data-trip="${esc(t.id)}"><span class="d">${t.entry && t.entry.year ? esc(shortDate(t.entry.year, t.entry.doy)) : ''}</span><span class="w">${esc(R.lineOf(t) || t.line || 'A trip')}</span><span class="n">${t.days || 1} ${plural(t.days || 1, 'day')}</span></button>`).join('');
      const tally = [v.nights ? `${word(v.nights)} ${plural(v.nights, 'night')} out` : '', miles >= 0.1 ? `${fmtMi(miles)} mi paddled` : ''].filter(Boolean).join(' · ');
      // gl-d: the milestones (record.js milestones, milestones.js), pencilled under the trips: the titles earned, then
      // how far along each other one is
      const ms = v.milestones || [], earned = ms.filter((m) => m.done), going = ms.filter((m) => !m.done && m.n > 0);
      const miles2 = ms.length ? `<div class="pp-miles"><h3 class="pp-sub">Milestones</h3>${earned.map((m) => `<div class="pp-mile done"><b>${esc(m.title)}</b><span>${esc(m.words)}</span></div>`).join('')}
        ${going.map((m) => `<div class="pp-mile"><span>${esc(up(m.words))}</span><i style="--f:${Math.round((100 * m.n) / (m.of || 1))}%" aria-hidden="true"></i><span class="n">${m.n.toLocaleString('en-US')} of ${m.of.toLocaleString('en-US')}</span></div>`).join('')}</div>` : '';
      const right = `<div class="pp-headrow"><h2 class="pp-head" id="right-h">Trips</h2>${tally ? `<span class="pp-hand small">${tally}</span>` : ''}</div>
        <div class="pp-index pp-ruled pp-lines">${list}${miles2}</div>`;
      const c = this.tripSel ? R.tripById(this.tripSel) : null;
      return { left: c ? this.tripPage(c, R) : '', right, leftLabel: 'A trip' };
    }
    return this.bookTrips();
  }
  tripPage(c, R) {
    const portages = (c.portages || []).reduce((a, p) => a + (p.n || 1), 0) || (c.counts && c.counts.portages) || 0;
    const rods = (c.portages || []).reduce((a, p) => a + (p.rods || 0) * (p.n || 1), 0);
    const nights = (c.nights && c.nights.length) || (c.counts && c.counts.nights) || 0;
    const fish = c.fish && c.fish.n ? c.fish.n : 0;
    const stat = (n, l) => `<div class="pp-stat"><b>${n}</b><span>${l}</span></div>`;
    const how = c.k === 'evacuated' ? 'brought in' : c.k === 'late' ? 'came in late' : c.k === 'abandoned' ? 'left off' : 'came in';
    return `<div class="pp-banner">Trip ${c.n}${c.mode === 'sandbox' ? ' · sandbox' : ''}</div>
      <div class="pp-stats">${stat(c.days || 1, plural(c.days || 1, 'day'))}${stat(fmtMi((c.km || 0) * MI), 'miles')}${stat(portages, plural(portages, 'portage'))}${rods ? stat(rods, 'rods') : ''}${stat(nights, plural(nights, 'night'))}${stat(fish, 'fish')}${c.photos ? stat(c.photos, plural(c.photos, 'photo')) : ''}</div>
      <div class="pp-scroll pp-trip">${R.pageHtml(c, { book: true })}<div class="pp-hand pp-tip">${esc(up(how))}${c.why && c.why !== 'as planned' && c.why !== 'sandbox' && c.why !== 'came in' ? `: ${esc(c.why)}` : ''}</div></div>`;
  }
  // the trip core's logbook (no record attached): a line a trip, its page the few things the book keeps
  bookTrips() {
    const c = this.core, o = this.outfitter;
    const trips = c ? c.book.trips.map((t, i) => ({ ...t, n: i + 1, key: `b${i}` })).reverse() : [];
    if (!trips.some((t) => t.key === this.tripSel)) this.tripSel = trips.length ? trips[0].key : null;
    const place = (ep) => { const l = o && ep != null ? o.landings.find((x) => x.ep === ep) : null; return l ? l.place : null; };
    const how = (t) => (t.k === 'evacuated' ? `brought in${t.why ? `: ${t.why}` : ''}` : t.k === 'abandoned' ? 'left off' : t.k === 'late' ? 'completed late' : t.why === 'came in' ? 'came in' : 'completed');
    const list = trips.map((t) => { const e = t.entry || {}; return `<button type="button" class="pp-entry${t.key === this.tripSel ? ' on' : ''}" data-trip="${t.key}"><span class="d">${e.year ? esc(shortDate(e.year, e.doy)) : ''}</span><span class="w">Out from ${esc(place(t.from) || 'a landing')}</span><span class="n">${t.days || 1} ${plural(t.days || 1, 'day')}</span></button>`; }).join('');
    const right = `<h2 class="pp-head" id="right-h">Trips</h2><div class="pp-index pp-ruled pp-lines">${list}</div>`;
    const t = trips.find((x) => x.key === this.tripSel);
    const stat = (n, l) => `<div class="pp-stat"><b>${n}</b><span>${l}</span></div>`;
    const left = t ? `<div class="pp-banner">Trip ${t.n}</div><div class="pp-stats">${stat(t.days || 1, plural(t.days || 1, 'day'))}${stat(fmtMi((t.km || 0) * MI), 'miles')}${t.resupplies ? stat(t.resupplies, 'resupplies') : ''}</div>
      <div class="pp-facts"><div class="pp-fact"><i aria-hidden="true">${GLYPH.where}</i><span>From ${esc(place(t.from) || 'a landing')}${t.to != null && place(t.to) ? `, in at ${esc(place(t.to))}` : ''}</span></div></div><div class="pp-hand pp-tip">${esc(how(t))}</div>` : '';
    return { left, right, leftLabel: 'A trip' };
  }

  // --- Photos: the prints taped in; the one picked, big, on the left ----------------------------------------------------
  photosTab() {
    const ph = this.photos, list = ph.prints(), n = list.length;
    if (!list.some((p) => p.id === this.printSel)) this.printSel = n ? list[0].id : null;
    const paid = new Set(((this.tasks && this.tasks.claimed) || []).map((c) => c.id));
    const thumbs = list.map((p, i) => `<button type="button" class="pp-print${p.id === this.printSel ? ' on' : ''}" data-print="${p.id}" style="--tilt:${TILT[i % TILT.length]}deg" title="${esc(p.caption)}">
      ${p.url ? `<img src="${p.url}" width="240" height="135" alt="">` : '<div class="blank"></div>'}<figcaption>${esc(shortCaption(p.caption))}</figcaption></button>`).join('');
    const right = `<h2 class="pp-head" id="right-h">Photos</h2><div class="pp-index">${n ? `<div class="pp-prints">${thumbs}</div>` : ''}</div>`;
    const p = list.find((x) => x.id === this.printSel);
    let left = '';
    if (p) {
      const rows = [];
      rows.push(['when', esc(`${p.year && p.doy ? longDate(p.year, p.doy) : ''}${Number.isFinite(p.hours) && p.year ? `, ${clock12(p.hours)}` : ''}`)]);
      if (p.where) rows.push(['where', esc(p.where)]);
      rows.push(['film', p.film === 'disposable' ? 'On the disposable' : 'On the 35 mm']);
      if (p.notice) rows.push(['note', `For “${esc(p.notice.title)}”${paid.has(p.notice.id) ? ' · paid' : ' · take it to the counter'}`]);
      left = `<figure class="pp-print big" style="--tilt:-1deg">${p.url ? `<img src="${p.url}" alt="${esc(p.caption)}">` : '<div class="blank"></div>'}<figcaption>${esc(p.caption)}</figcaption></figure>
        <div class="pp-facts">${rows.map(([g, v]) => `<div class="pp-fact"><i aria-hidden="true">${GLYPH[g] || ''}</i><span>${v}</span></div>`).join('')}</div>`;
    }
    return { left, right, leftLabel: 'A print' };
  }
}

// --- the pamphlet's words: short, plain, what you would print on a fold-out at the counter ------------------------------
const PAM = {
  walleye: { name: 'Walleye', short: 'Rocky points, at dusk', look: 'Gold and olive, big glassy eyes, a white tip on the bottom of the tail.', where: 'Rocky points, reefs and drop-offs.', when: 'Dawn, dusk and after dark.', try: 'A jig on the bottom, or a leech under a bobber.', note: 'The one everyone is after. Good eating.' },
  smallmouth: { name: 'Smallmouth bass', short: 'Rocks and boulders, warm days', look: 'Bronze with dark bars down the side and a red eye.', where: 'Rocky shorelines and boulders.', when: 'Warm afternoons, all summer.', try: 'A crankbait or a spinner along the rocks.', note: 'Jumps when hooked.' },
  pike: { name: 'Northern pike', short: 'Weedy bays, any time', look: 'Long and green with rows of pale spots. A duckbill full of teeth.', where: 'Weedy bays and the edges of the weeds.', when: 'All day; best when the light is low.', try: 'A spoon or a spinner past the weed edge.', note: 'Mind the teeth when you unhook one.' },
  laketrout: { name: 'Lake trout', short: 'Deep, cold, clear lakes', look: 'Grey-green with pale spots and a deeply forked tail.', where: 'Only the deep, cold, clear lakes, far down and far from shore.', when: 'Early in the day. Shallow just after ice-out.', try: 'A spoon let down deep and worked slowly back.', note: 'Not in every lake. Ask at the counter which.' },
  crappie: { name: 'Black crappie', short: 'Weeds and wood, after dark', look: 'Silver with black speckles, a tall thin body.', where: 'Weedy bays, brush and sunken wood.', when: 'Dusk and after dark.', try: 'A small jig or a leech, slow and still.' },
  perch: { name: 'Yellow perch', short: 'Weedy shallows, midday', look: 'Yellow with dark bars and orange lower fins.', where: 'Weedy shallows and sandy flats.', when: 'The middle of the day.', try: 'A leech under a bobber, or a small jig.' },
};

// --- helpers -------------------------------------------------------------------------------------------------------
const MI = 0.621371; // miles a km
const up = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const STAMP_MS = 1500; // r2: a paid ticket's stamp on the page, then it is gone
const fmtMi = (m) => (m < 10 ? m.toFixed(1) : String(Math.round(m)));
// the log's own short hand: "10/31", "6:40p", "18½" 2¼ lb", "walleye", "laker"
const slashDate = (y, doy) => { const d = new Date(y, 0, doy); return `${d.getMonth() + 1}/${d.getDate()}`; };
const shortClock = (h) => { const hh = Math.floor(h) % 24, mm = Math.floor((h - Math.floor(h)) * 60); return `${hh % 12 || 12}:${String(mm).padStart(2, '0')}${hh < 12 ? 'a' : 'p'}`; };
const FISH_WORD = { walleye: 'walleye', smallmouth: 'smallmouth', pike: 'pike', laketrout: 'laker', crappie: 'crappie', perch: 'perch' };
const fishWord = (id, name) => FISH_WORD[id] || String(name || id || '').toLowerCase();
function sizeWords(cm, kg) {
  const inch = Math.round((cm / 2.54) * 2) / 2, w = Math.floor(inch), lb = (kg || 0) * 2.20462;
  const len = `${w}${inch - w ? '½' : ''}″`;
  if (!kg) return len;
  const q = Math.round(lb * 4) / 4, qw = Math.floor(q), fr = { 0.25: '¼', 0.5: '½', 0.75: '¾' }[q - qw] || '';
  return lb < 0.25 ? len : `${len} ${qw || ''}${fr || (qw ? '' : '¼')} lb`;
}
const shortLake = (name) => String(name || '').replace(/ Lake$/, ''); // "Moose", "Lake One"
const shortCaption = (c) => String(c || '').split(', ').slice(0, 2).join(', ');
const TILT = [-1.4, 1.1, 0.5, -0.7, 1.6, -0.3];
// small pencil glyphs for the facts
const svg = (d, extra = '') => `<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"${extra}>${d}</svg>`;
// r3 B: the story's cut gem (paper.css draws it) and the side story's open star (an outline, drawn here)
const SIDE_STAR = '<svg viewBox="0 0 20 20" width="100%" height="100%"><path d="M10 1.6 12.4 7.6 18.4 10 12.4 12.4 10 18.4 7.6 12.4 1.6 10 7.6 7.6Z" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"/></svg>';
const gemIcon = (k) => `<span class="pp-gi gi-${k}" aria-hidden="true">${k === 'side' ? SIDE_STAR : ''}</span>`;
const GLYPH = {
  where: svg('<path d="M8 15s5-4.6 5-8.2A5 5 0 0 0 3 6.8C3 10.4 8 15 8 15z"/><circle cx="8" cy="6.8" r="1.8"/>'),
  when: svg('<circle cx="8" cy="8" r="6"/><path d="M8 4.5V8l2.4 1.6"/>'),
  film: svg('<rect x="2" y="4" width="12" height="9" rx="1.5"/><circle cx="8" cy="8.5" r="2.4"/><path d="M5.5 4l1-2h3l1 2"/>'),
  note: svg('<path d="M3 2h7l3 3v9H3z"/><path d="M5.5 7h5M5.5 9.5h5M5.5 12h3"/>'),
};
