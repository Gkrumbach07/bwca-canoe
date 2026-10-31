// The book (I; fb4 B, decision 4: the one key, I or Esc closes it, Pack and Journal are tabs on its top edge; J, L,
// Tab, Shift-Tab and the arrow keys are gone): one leather-bound book with sides (SIDES), each a tab on its top edge. It
// opens at the pack. The gear, the food and what you carry are the pack side's (inv-ui.js PackSide): the Tarkov grids of
// your containers on a canvas mat. The pack side is one screen (wc B, the world cards): the body on the left, a tab per
// container across the top, and since fb4 B what is around you as tabs on the right (the canoe, each container on the
// ground, Wood, The ground, the outfitters' keeping); a click turns a tab; openHere(ref) is stream A's Q.
//
// The journal side (the owner, 2026-10-31: "I find the journal to be, for the most part, useless ... the whole left side,
// I never use ... it actually looks like a journal instead of just like a modal") is a paper spread (paper.css, the
// shared pp- classes) with index tabs down its right edge, and each tab has the whole spread: a list to pick from on the
// right page and the thing picked on the left, after Cast and Chill's fish book.
//   Tasks   a ruled page written in pencil: the notices on the go on the left (a box in the margin: empty, half, ticked),
//           the done and the claimed on the right, crossed out, and the season's earnings
//   Fish    the species (fishing.js SPECIES and their `about`): a tile each on the right grouped by water, a silhouette
//           for one not yet caught; on the left its picture (fish-portrait.js), size badges, where, when, on what, and
//           your biggest, with the rod and the lure and the lake
//   Trips   the logbook (record.js, else trip.js's book), a pencilled line a trip on the right; its page on the left
//   Photos  the prints (photo.js) taped in small on the right; the one picked big on the left with what it is of
// The old trip page (food, energy, distances) and the Lakes tab are gone: the strip and the map say those now.
// Data comes from the fishing code (log, bests), the tasks, the outfitter's trip, the trip core's logbook, the season's
// record (journal.record) and the camera (journal.photos). showRecord(id) opens the book at a trip's page.
import { clock12, longDate, shortDate, weekdayOf, esc, plural, word } from './hud.js';
import { PackSide } from './inv-ui.js';
import { KINDS } from './tasks.js'; // fb3 C: a notice's kind, for its progress and its label
import { WATERS } from './fishing.js';
import { itemDef } from './items.js';
import { fishPicture } from './fish-portrait.js';
import './paper.css';

const SIDES = ['pack', 'journal'];

export class Journal {
  // t: { hud, world, player, day, fishing, tasks, energy, outfitter, stats, wind, onUse }
  constructor(t) {
    Object.assign(this, t);
    this.el = document.getElementById('journal');
    this.open = false; this.tab = 'tasks'; this.page = 0; this.sig = ''; this.t = 0; this.side = 'journal';
    this.record = null; // round A-A: the season's record (record.js)
    this.fishSel = null; this.fishSort = 'water'; this.tripSel = null; this.printSel = null; // what is picked on each tab
    // the book: a tab for each side on its top edge, the journal's spread and the pack's mat
    this.el.classList.add('book');
    this.el.setAttribute('aria-label', 'The book: the journal and the pack');
    this.el.innerHTML = `<div class="book-tabs" role="tablist"><button type="button" class="book-tab p" data-side="pack" role="tab">Pack</button><button type="button" class="book-tab j" data-side="journal" role="tab">Journal</button></div>
      <div class="book-key"><kbd>I</kbd> or <kbd>Esc</kbd> closes</div><div class="side j"></div><div class="side p"></div>`;
    this.jEl = this.el.querySelector('.side.j'); this.pEl = this.el.querySelector('.side.p');
    this.jEl.classList.add('pp-spread'); // the journal's paper (paper.css)
    this.pack = new PackSide(this.pEl, { onUse: t.onUse || null, closeBook: () => this.close() }); // fb2 B: a nearby thing's action that wants the world (Pitch, Eat at the fire) closes the book first
    this.hud.registerPaper('journal', () => this.close());
    this.el.addEventListener('click', (e) => {
      const side = e.target.closest('[data-side]'); if (side) { this.setSide(side.dataset.side); side.blur(); return; } // (no focus ring left on it for the next key)
      const tab = e.target.closest('[data-tab]'); if (tab) { this.tab = tab.dataset.tab; this.page = 0; this.render(true); return; }
      // a pick on the right page: its page on the left, scrolled to the top
      const pick = e.target.closest('[data-fish], [data-trip], [data-print]');
      if (pick) {
        if (pick.dataset.fish) this.fishSel = pick.dataset.fish; else if (pick.dataset.trip) this.tripSel = pick.dataset.trip; else this.printSel = Number(pick.dataset.print);
        this.render(true); const sc = this.jEl.querySelector('.pp-page.left .pp-scroll'); if (sc) sc.scrollTop = 0; return;
      }
      const sort = e.target.closest('[data-sort]'); if (sort) { this.fishSort = sort.dataset.sort; this.render(true); return; }
      const close = e.target.closest('[data-close]'); if (close) this.close();
    });
    // fb4 B (decision 4; the owner, 2026-10-25: "It should just be one key, I, to get into the inventory. You can switch
    // over to your journal"): I opens the book at the pack and closes it from either side; Esc closes it; the tabs on its
    // top edge turn it. The counter, the shelves and a card keep the keys while they are up.
    window.addEventListener('keydown', (e) => {
      const tag = e.target && e.target.tagName;
      if (tag === 'SELECT' || tag === 'INPUT' || tag === 'TEXTAREA') return;
      const busy = this.hud.paper === 'outfitter' || this.hud.paper === 'shelf' || this.hud.paper === 'card';
      if (e.code === 'KeyI') { if (e.repeat || busy) return; if (this.open) this.close(); else this.show('pack'); }
      else if (this.open && e.code === 'Escape') this.close();
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
    if (this.side === 'pack') this.pack.show(); else this.render(true);
  }
  close() {
    if (!this.open) return;
    this.open = false;
    this.pack.hide();
    this.el.classList.remove('show');
    this.hud.closePaper('journal');
  }
  setSide(side) {
    if (!SIDES.includes(side)) return;
    this.side = side;
    for (const b of this.el.querySelectorAll('.book-tab')) { const on = b.dataset.side === side; b.classList.toggle('on', on); b.setAttribute('aria-selected', String(on)); }
    this.jEl.classList.toggle('on', side === 'journal'); this.pEl.classList.toggle('on', side === 'pack');
    if (!this.open) return;
    if (side === 'pack') this.pack.show(); else { this.pack.hide(); this.render(true); }
  }
  // while it is up, the page follows the game (a meal, a fish, the clock) at a gentle rate
  update(dt) {
    if (!this.open) return;
    if (this.side === 'pack') { this.pack.update(dt); return; }
    if ((this.t += dt) > 0.5) { this.t = 0; this.render(false); }
  }

  // --- the words ------------------------------------------------------------------------------------------
  // fb3 C (16, the owner: "task completion or partial completion could be better. like the checkbox is confusing when
  // it's just dark"): a notice's state, plain. Taken: an empty box and where to do it. In progress: a half box and the
  // progress line ("1 of 2 in the cooler", "two of three pints handed over"). Done: a tick and where to claim it.
  // (Claimed: a grey tick with the pay, from the claimed list.) Returns { cls, word, words }.
  taskState(t) {
    const ts = this.tasks, k = KINDS[t.kind] || null, w = this.world;
    const at = (ep) => { const l = ts && ts.landing ? ts.landing(ep) : null; return l ? l.name : 'the outfitter'; };
    if (t.status === 'done') {
      const who = t.npc ? String(t.npcName || 'a visitor').split(' ')[0] : '';
      return { cls: 'done', word: 'Done', words: who ? `${who} pays it, or the counter at ${at(t.from)}, entry point ${t.from}` : `claim it at ${at(t.from)}, entry point ${t.from}` };
    }
    // how far along: the kind's own fraction, else what is in the cooler or handed over against what is wanted
    let f = 0;
    if (k && typeof k.fraction === 'function') { const v = k.fraction(t); if (Number.isFinite(v)) f = v; }
    else { const n = t.need || 1; if (Array.isArray(t.cooler) && t.cooler.length) f = t.cooler.length / n; else if (Number.isFinite(t.got) && t.got > 0) f = t.got / n; }
    const progress = k && typeof k.progress === 'function' ? k.progress(t) : (ts && ts.progressOf ? ts.progressOf(t) : 'on the go');
    if (f > 0) return { cls: 'half', word: 'In progress', words: progress };
    // taken: where to do it (the keeper's pencil on the map: the site or the water, and the lake)
    let where = '';
    try {
      const tg = ts && typeof ts.targetOf === 'function' ? ts.targetOf(t) : null, label = tg && tg.label ? String(tg.label) : '';
      const lake = w && typeof w.lakeName === 'function' ? w.lakeName(t.lakeId || t.lakeHint || 0) || '' : '';
      where = label && lake && !label.includes(lake) ? `${label}, ${lake}` : lake ? `on ${lake}` : label || (t.toPlace ? `at ${t.toPlace}` : '');
    } catch { where = ''; }
    return { cls: 'taken', word: 'Taken', words: where ? `${where} · ${progress}` : progress };
  }
  get trip() { return this.outfitter ? this.outfitter.trip : null; }
  get core() { return this.outfitter ? this.outfitter.core : null; } // the trip's rules and permit (trip.js)
  get dayN() { const c = this.core; if (c) return c.active ? c.dayN : 0; const t = this.trip; return t && t.active ? Math.floor(this.outfitter.daysOut) + 1 : 0; }
  lakeList(lakes) {
    if (!lakes.length) return 'none yet';
    lakes = lakes.filter((l, i) => lakes.findIndex((q) => q.name === l.name) === i); // (round A join: a name once: "Lake One, One")
    return lakes.map((l, i) => (i === 0 ? l.name : l.name.replace(/^Lake /, '').replace(/ Lake$/, ''))).join(', ');
  }
  catchTime(c) {
    if (c.hours == null) return esc(c.time || '');
    const d = this.day, sameDay = c.doy === d.doy && c.year === d.year;
    const ago = (d.year - (c.year || d.year)) * 365 + (d.doy - (c.doy || d.doy));
    if (sameDay) return clock12(c.hours);
    if (ago < 7) return `${weekdayOf(c.year, c.doy).slice(0, 3)} ${clock12(c.hours)}`;
    return shortDate(c.year, c.doy);
  }
  signature() {
    const f = this.fishing, ts = this.tasks, c = this.core, R = this.record;
    return [this.tab, this.page, this.fishSel, this.fishSort, this.tripSel, this.printSel, f ? f.logVersion : 0,
      ts ? ts.active.map((t) => `${t.id}${t.status}${t.got || 0}${(t.cooler || []).length}`).join() : '', ts ? (ts.claimed || []).length : 0, Math.floor(this.day.hours * 4), this.dayN,
      c ? `${c.mode}${c.active}${c.book.trips.length}` : '', this.photos ? this.photos.version : 0, R ? R.version : '',
      typeof this.notes === 'function' ? (this.notes() || []).length : 0].join('|');
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
    this.jEl.innerHTML = `<section class="pp-page left${body.leftCls ? ` ${body.leftCls}` : ''}" aria-label="${esc(body.leftLabel || 'The page')}">${body.left}</section>
      <section class="pp-page right${body.rightCls ? ` ${body.rightCls}` : ''}" aria-labelledby="right-h">${nav}${body.right}
        <div class="pp-foot"><span>${body.foot || ''}</span><span><kbd>I</kbd> or <kbd>Esc</kbd> closes · ${pageNo}</span></div></section>`;
    [...this.jEl.querySelectorAll('.pp-scroll, .pp-index')].forEach((n, i) => { if (scrolls[i]) n.scrollTop = scrolls[i]; });
  }
  // the index tabs down the right page's edge: [key, label, colour]
  tabs() {
    return [['tasks', 'Tasks', '#5f7046'], ['fish', 'Fish', '#3f6273'], ...(this.record || this.core ? [['trips', 'Trips', '#8a5a34']] : []), ...(this.photos ? [['photos', 'Photos', '#74495a']] : [])];
  }

  // --- Tasks: a ruled page, written in by hand -----------------------------------------------------------------------
  // The owner (2026-10-31): "make this feel a little bit more like a notebook ... a ruled page and it's sort of just
  // like putting in entries like you're writing them in ... the original task, maybe like a little description
  // underneath it ... and then like a cross out when it's done". The left page holds the notices on the go, each in pencil
  // with its box in the margin (empty, half, ticked); the right page what is done: to claim, then claimed lately, crossed
  // out, and the season's earnings.
  tasksTab() {
    const ts = this.tasks;
    if (!ts) return { left: '<h2>Tasks</h2><div class="pp-empty">No board on this trip.</div>', right: '<h2 id="right-h">Done</h2>', foot: '' };
    const at = (ep) => { const l = ts.landing ? ts.landing(ep) : null; return l ? l.name : 'the outfitter'; };
    const kinds = { item: 'Lost and found', survey: 'Portage crew', fish: 'Fish wanted' };
    const entry = (t) => {
      const st = this.taskState(t), who = t.npc ? `Asked by ${esc(String(t.npcName || 'a visitor'))}` : esc(kinds[t.kind] || (KINDS[t.kind] && KINDS[t.kind].label) || t.kind || 'Notice');
      const box = st.cls === 'done' ? 'pp-box done' : st.cls === 'half' ? 'pp-box half' : 'pp-box';
      return `<div class="pp-task ${st.cls}"><span class="${box}" aria-hidden="true"></span>
        <span class="who">${who} · ${esc(at(t.from))}</span>
        <div class="t"><span class="pp-hand pen">${esc(t.title || t.clue || 'A notice')}</span><span class="pay">$${t.pay || 0}</span></div>
        ${t.text || t.clue ? `<div class="pp-hand small">${esc(t.text || t.clue)}</div>` : ''}
        <div class="pp-hand small st">${st.cls === 'done' ? 'done! ' : '— '}${esc(st.words)}</div></div>`;
    };
    const all = ts.active, open = all.filter((t) => t.status !== 'done'), done = all.filter((t) => t.status === 'done');
    // a find noted for the ranger (main.js journal.notes: uniques.js), an entry of its own till it is reported
    let notes = [];
    try { notes = typeof this.notes === 'function' ? this.notes() || [] : []; } catch { notes = []; }
    const noteHtml = notes.map((n) => `<div class="pp-task"><span class="pp-box" aria-hidden="true"></span><span class="who">For the ranger</span>
        <div class="t"><span class="pp-hand pen">${esc(n.title)}</span></div><div class="pp-hand small st">— ${esc(n.words)}</div></div>`).join('');
    const nOpen = open.length + notes.length;
    const left = `<div class="pp-pagehead"><span class="sc">On the go</span><h2>${nOpen ? `${up(word(nOpen))} on the go` : 'Nothing on the go'}</h2></div>
      <div class="pp-scroll pp-ruled pp-lines">${nOpen ? open.map(entry).join('') + noteHtml : '<div class="pp-task"><div class="pp-hand">Nothing taken on yet.</div><div class="pp-hand small">Every outfitter pins notices on the cork board by the door; each is paid only at the counter that posted it.</div></div>'}</div>`;
    const paid = (ts.claimed || []).slice(-8).reverse(), n = (ts.claimed || []).length, earned = ts.earned || 0;
    const claimed = paid.map((c) => `<div class="pp-task claimed"><span class="pp-box done" aria-hidden="true"></span><span class="who">Paid at ${esc(at(c.from))}</span>
      <div class="t"><span class="pp-hand pen">${esc(c.title)}</span><span class="pay">$${c.pay}</span></div></div>`).join('');
    const right = `<div class="pp-pagehead"><span class="sc">Done</span><h2 id="right-h">${done.length ? `${up(word(done.length))} to claim` : earned ? `$${earned} this season` : 'Nothing done yet'}</h2></div>
      <div class="pp-scroll pp-ruled pp-lines">${done.map(entry).join('')}${claimed}${!done.length && !paid.length ? '<div class="pp-task"><div class="pp-hand small">Finished notices are crossed off here, and paid at the counter that posted them.</div></div>' : ''}
      ${n ? `<div class="pp-task"><div class="pp-hand pen">$${earned} from the boards, ${word(n)} ${plural(n, 'notice')} claimed</div></div>` : ''}</div>`;
    return { left, right, leftLabel: 'Notices on the go', foot: 'the cork board hangs by the door in every store' };
  }

  // --- Fish: the species, after Cast and Chill's book ---------------------------------------------------------------
  // The owner (2026-10-31): "you select the type of fish on the right, and then on the left, it shows you a picture as
  // well as some information on how to catch it, typical sizes ... and then your biggest catch and like where and what
  // you used". The right page: how many of the species you have caught, a tile each grouped by its water (fishing.js
  // WATERS; or by how many caught), a silhouette for the ones not yet caught, and the last few catches in pencil. The
  // left page: the picked species (fish-portrait.js), its size badges (those you have caught lit), how rare, where, when
  // and on what, and your biggest.
  fishData() {
    const f = this.fishing, SP = (f && f.species) || {}, ids = Object.keys(SP), log = f ? f.log : [];
    const by = {};
    for (const id of ids) by[id] = { id, sp: SP[id], n: 0, kept: 0, big: null, lakes: new Map(), sizes: new Set() };
    for (const c of log) {
      const q = by[c.species]; if (!q) continue;
      q.n++; if (c.kept) q.kept++;
      if (!q.big || c.length > q.big.length) q.big = c;
      if (c.lake) q.lakes.set(c.lake, (q.lakes.get(c.lake) || 0) + 1);
      q.sizes.add(sizeClass(q.sp, c.length));
    }
    // (the log keeps the last 200; a best from before them still counts)
    for (const [id, b] of Object.entries((f && f.bests) || {})) {
      const q = by[id]; if (!q || !b) continue;
      if (!q.big || b.length > q.big.length) { q.big = { ...b, species: id }; q.sizes.add(sizeClass(q.sp, b.length)); }
      if (!q.n) q.n = 1;
    }
    return { ids, by, log };
  }
  fishTab() {
    const { ids, by, log } = this.fishData();
    if (!ids.length) return { left: '<div class="pp-empty">No rod in this book.</div>', right: '<h2 id="right-h">Fish</h2>', foot: '' };
    const known = ids.filter((id) => by[id].n > 0);
    if (!ids.includes(this.fishSel)) this.fishSel = known[0] || ids[0];
    const pic = (id) => fishPicture(id, { silhouette: !by[id].n });
    const tile = (id) => {
      const q = by[id], k = q.n > 0, url = pic(id);
      return `<button type="button" class="pp-tile${k ? '' : ' unknown'}${this.fishSel === id ? ' on' : ''}" data-fish="${id}" title="${k ? esc(q.sp.name) : 'Not caught yet'}" aria-label="${k ? esc(q.sp.name) : 'A fish not caught yet'}">
        ${url ? `<img src="${url}" alt="">` : ''}<span class="pp-name">${k ? esc(q.sp.name) : '???'}</span>${k ? `<span class="pp-mark">×${q.n}</span>` : ''}</button>`;
    };
    let groups;
    if (this.fishSort === 'caught') {
      const caught = known.slice().sort((a, b) => by[b].n - by[a].n), not = ids.filter((id) => !by[id].n);
      groups = [caught.length ? { name: 'Caught', sub: 'most first', ids: caught } : null, not.length ? { name: '???', sub: 'not yet', ids: not } : null].filter(Boolean);
    } else {
      groups = Object.entries(WATERS).map(([k, W]) => ({ name: W.name, sub: W.sub, ids: ids.filter((id) => ((by[id].sp.about || {}).water || 'reef') === k) })).filter((g) => g.ids.length);
    }
    const lately = log.slice(-6).reverse().map((c) => `<div class="pp-entry" role="listitem"><span class="d">${this.catchTime(c)}</span><span class="w">${esc(c.name)} · ${esc(lenWords(c.length))}${c.lake ? ` · ${esc(shortLake(c.lake))}` : ''}</span><span class="n">${c.kept ? 'kept' : 'let go'}</span></div>`).join('');
    const right = `<div class="pp-indexhead"><span class="pp-count" id="right-h" aria-label="${known.length} of ${ids.length} species caught">${known.length} / ${ids.length}</span>
        <span class="pp-sort">sort by <button type="button" data-sort="water" class="${this.fishSort !== 'caught' ? 'on' : ''}">Water</button><button type="button" data-sort="caught" class="${this.fishSort === 'caught' ? 'on' : ''}">Caught</button></span></div>
      <div class="pp-index">${groups.map((g) => `<div class="pp-group">${esc(g.name)} <span>${esc(g.sub)}</span></div><div class="pp-tiles">${g.ids.map(tile).join('')}</div>`).join('')}
        <div class="pp-group">Lately <span>${log.length ? `${log.length} in the log` : 'nothing yet'}</span></div>
        <div class="pp-list" role="list">${lately || '<div class="pp-hand small">F takes up the rod; hold Space to cast.</div>'}</div></div>`;
    return { left: this.fishPage(by[this.fishSel]), right, leftLabel: 'The fish', foot: 'pick a fish to read its page' };
  }
  fishPage(q) {
    const sp = q.sp, a = sp.about || {}, k = q.n > 0, url = fishPicture(q.id, { silhouette: !k });
    const sizes = SIZES.map((s) => `<span class="pp-badge${q.sizes.has(s) ? ' on' : ''}${s === 'T' ? ' star' : ''}" title="${s === 'T' ? 'trophy' : s}">${s === 'T' ? '' : s}</span>`).join('');
    const [lo, hi] = sp.length, kgOf = (cm) => sp.k * (cm / 100) ** 3;
    const typical = `${Math.round(lo / 2.54)} to ${Math.round(hi / 2.54)} in · ${lbWords(kgOf(lo + (hi - lo) * 0.2))} to ${lbWords(kgOf(hi))}`;
    const lures = this.bestLures(sp);
    const rows = [];
    rows.push(['where', esc(a.where || 'Here and there.')]);
    rows.push(['when', esc(a.when || 'Any time.')]);
    if (k) rows.push(['lure', esc(lures)]);
    rows.push(['size', esc(typical)]);
    if (k) {
      const lakes = [...q.lakes.entries()].sort((x, y) => y[1] - x[1]).map(([n]) => shortLake(n)).slice(0, 4);
      rows.push(['net', `Caught ${word(q.n)}${q.n === 1 ? '' : ' times'}${q.kept ? `, ${q.kept === q.n ? (q.n === 1 ? 'kept' : 'all kept') : `${word(q.kept)} kept`}` : ', let go'}${lakes.length ? ` · ${esc(lakes.join(', '))}` : ''}`]);
    }
    const facts = rows.map(([g, v]) => `<div class="pp-fact"><i aria-hidden="true">${GLYPH[g] || ''}</i><span>${v}</span></div>`).join('');
    const B = q.big;
    const big = k && B ? `<div class="pp-title">Biggest catch</div>
      <div class="pp-facts">
        <div class="pp-fact"><i aria-hidden="true">${GLYPH.size}</i><span>${esc(lenWords(B.length))} | ${esc(lbWords(B.weight))} <span class="pp-badge on">${sizeClass(sp, B.length) === 'T' ? '★' : sizeClass(sp, B.length)}</span></span></div>
        ${B.lure || B.rod ? `<div class="pp-fact"><i aria-hidden="true">${GLYPH.rod}</i><span>${esc([B.rod, B.lure].filter(Boolean).join(' | '))}</span></div>` : ''}
        <div class="pp-fact"><i aria-hidden="true">${GLYPH.where}</i><span>${esc(B.lake || 'Unnamed water')}${B.year && B.doy ? `<span class="pp-soft"> · ${esc(shortDate(B.year, B.doy))}</span>` : ''}</span></div>
      </div>` : '';
    return `<div class="pp-banner">${k ? esc(sp.name) : '???'}</div>
      <div class="pp-frame pp-fishpic">${url ? `<img src="${url}" alt="${k ? esc(sp.name) : 'A fish not caught yet'}">` : '<div class="pp-soft">…</div>'}<div class="pp-badges" aria-label="sizes caught">${sizes}</div><span class="pp-stamp${a.rarity === 'Rare' ? ' rare' : ''}">${esc(a.rarity || 'Common')}</span></div>
      ${k && a.latin ? `<div class="pp-latin pp-soft">${esc(a.latin)}</div>` : ''}
      <div class="pp-scroll"><div class="pp-facts">${facts}</div>
      ${k ? (a.how ? `<div class="pp-hand pp-tip">${esc(a.how)}</div>` : '') : '<div class="pp-hand pp-tip">Not caught yet. Find its water and see.</div>'}
      ${big}</div>`;
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
      const right = `<div class="pp-indexhead"><span class="pp-count" id="right-h">${trips.length} ${plural(trips.length, 'trip')}</span><span class="pp-hand small">${v.nights ? `${word(v.nights)} ${plural(v.nights, 'night')} out · ` : ''}${miles >= 0.1 ? `${fmtMi(miles)} mi paddled` : 'nothing paddled yet'}</span></div>
        <div class="pp-index pp-ruled pp-lines">${list || '<div class="pp-hand small pp-pad">A trip is written in here by itself when you come in at an outfitter’s landing.</div>'}</div>`;
      const c = this.tripSel ? R.tripById(this.tripSel) : null;
      return { left: c ? this.tripPage(c, R) : '<h2>No trips yet</h2><div class="pp-empty">Push off from a landing; when you come in, the trip is written up here.</div>', right, leftLabel: 'A trip', foot: 'what you have seen stays seen' };
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
    const right = `<div class="pp-indexhead"><span class="pp-count" id="right-h">${trips.length} ${plural(trips.length, 'trip')}</span></div>
      <div class="pp-index pp-ruled pp-lines">${list || '<div class="pp-hand small pp-pad">A trip is logged by itself when you come in at an outfitter’s landing.</div>'}</div>`;
    const t = trips.find((x) => x.key === this.tripSel);
    const stat = (n, l) => `<div class="pp-stat"><b>${n}</b><span>${l}</span></div>`;
    const left = t ? `<div class="pp-banner">Trip ${t.n}</div><div class="pp-stats">${stat(t.days || 1, plural(t.days || 1, 'day'))}${stat(fmtMi((t.km || 0) * MI), 'miles')}${t.resupplies ? stat(t.resupplies, 'resupplies') : ''}</div>
      <div class="pp-facts"><div class="pp-fact"><i aria-hidden="true">${GLYPH.where}</i><span>From ${esc(place(t.from) || 'a landing')}${t.to != null && place(t.to) ? `, in at ${esc(place(t.to))}` : ''}</span></div></div><div class="pp-hand pp-tip">${esc(how(t))}</div>`
      : '<h2>No trips yet</h2><div class="pp-empty">A trip is logged by itself when you come in at an outfitter’s landing, or when someone brings you in.</div>';
    return { left, right, leftLabel: 'A trip', foot: 'what you have seen stays seen' };
  }

  // --- Photos: the prints taped in; the one picked, big, on the left ----------------------------------------------------
  photosTab() {
    const ph = this.photos, list = ph.prints(), n = list.length;
    if (!list.some((p) => p.id === this.printSel)) this.printSel = n ? list[0].id : null;
    const paid = new Set(((this.tasks && this.tasks.claimed) || []).map((c) => c.id));
    const film = ph.film;
    const sub = film === '35mm' ? 'The 35 mm: C raises it, the wheel zooms, Space takes the picture. The last 24 are kept.'
      : film === 'disposable' ? `The disposable has ${word(ph.shotsLeft)} ${plural(ph.shotsLeft, 'picture')} left. C raises it, Space takes the picture.` : ph.noCamera;
    const thumbs = list.map((p, i) => `<button type="button" class="pp-print${p.id === this.printSel ? ' on' : ''}" data-print="${p.id}" style="--tilt:${TILT[i % TILT.length]}deg" title="${esc(p.caption)}">
      ${p.url ? `<img src="${p.url}" width="240" height="135" alt="">` : '<div class="blank">developing…</div>'}<figcaption>${esc(shortCaption(p.caption))}</figcaption></button>`).join('');
    const right = `<div class="pp-indexhead"><span class="pp-count" id="right-h">${n} ${plural(n, 'print')}</span></div>
      <div class="pp-index"><div class="pp-sub">${esc(sub)}</div>${n ? `<div class="pp-prints">${thumbs}</div>` : '<div class="pp-empty">A picture you take comes back as a print and is taped in here.</div>'}</div>`;
    const p = list.find((x) => x.id === this.printSel);
    let left = '<h2>No pictures yet</h2><div class="pp-empty">Raise the camera with C. A moose in the shallows, a loon close by, the sun going down over the water.</div>';
    if (p) {
      const rows = [];
      rows.push(['when', esc(`${p.year && p.doy ? longDate(p.year, p.doy) : ''}${Number.isFinite(p.hours) && p.year ? `, ${clock12(p.hours)}` : ''}`)]);
      if (p.where) rows.push(['where', esc(p.where)]);
      rows.push(['film', p.film === 'disposable' ? 'On the disposable' : 'On the 35 mm']);
      if (p.notice) rows.push(['note', `For “${esc(p.notice.title)}”${paid.has(p.notice.id) ? ' · paid' : ' · take it to the counter'}`]);
      left = `<figure class="pp-print big" style="--tilt:-1deg">${p.url ? `<img src="${p.url}" alt="${esc(p.caption)}">` : '<div class="blank">developing…</div>'}<figcaption>${esc(p.caption)}</figcaption></figure>
        <div class="pp-facts">${rows.map(([g, v]) => `<div class="pp-fact"><i aria-hidden="true">${GLYPH[g] || ''}</i><span>${v}</span></div>`).join('')}</div>`;
    }
    return { left, right, leftLabel: 'A print', foot: 'the newest first' };
  }
}

// --- helpers -------------------------------------------------------------------------------------------------------
const MI = 0.621371; // miles a km
const up = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const fmtMi = (m) => (m < 10 ? m.toFixed(1) : String(Math.round(m)));
// a length in inches (from cm): "18 in", "2 ft 6 in" from two feet
function lenWords(cm) {
  const inch = Math.round(cm / 2.54);
  return inch >= 24 ? `${Math.floor(inch / 12)} ft${inch % 12 ? ` ${inch % 12} in` : ''}` : `${inch} in`;
}
// a weight in pounds and ounces (from kg): "7 lb 15 oz", "12 oz"
function lbWords(kg) {
  const oz = Math.round(kg * 35.274);
  if (oz < 16) return `${Math.max(1, oz)} oz`;
  const lb = Math.floor(oz / 16), r = oz % 16;
  return lb >= 10 || !r ? `${Math.round(oz / 16)} lb` : `${lb} lb ${r} oz`;
}
const shortLake = (name) => String(name || '').replace(/ Lake$/, ''); // "Moose", "Lake One"
const shortCaption = (c) => String(c || '').split(', ').slice(0, 2).join(', ');
// a fish's size class by where its length falls in the species' range (fishing.js SPECIES length): S M L XL, T a trophy
const SIZES = ['S', 'M', 'L', 'XL', 'T'];
function sizeClass(sp, cm) {
  const [lo, hi] = sp.length || [0, 100], t = (cm - lo) / Math.max(1, hi - lo);
  return t >= 0.93 ? 'T' : t >= 0.72 ? 'XL' : t >= 0.45 ? 'L' : t >= 0.2 ? 'M' : 'S';
}
const TILT = [-1.4, 1.1, 0.5, -0.7, 1.6, -0.3];
// small pencil glyphs for the facts
const svg = (d, extra = '') => `<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"${extra}>${d}</svg>`;
const GLYPH = {
  where: svg('<path d="M8 15s5-4.6 5-8.2A5 5 0 0 0 3 6.8C3 10.4 8 15 8 15z"/><circle cx="8" cy="6.8" r="1.8"/>'),
  when: svg('<circle cx="8" cy="8" r="6"/><path d="M8 4.5V8l2.4 1.6"/>'),
  lure: svg('<path d="M9 2v7a3 3 0 1 1-6 0"/><path d="M3 9l-1.5-1.5"/><circle cx="9" cy="2" r="0.9"/>'),
  size: svg('<rect x="1.5" y="5" width="13" height="6" rx="1"/><path d="M4 5v2.5M6.5 5v3.5M9 5v2.5M11.5 5v3.5"/>'),
  net: svg('<path d="M2 3h12l-2 7H4z"/><path d="M4 10l1 4M12 10l-1 4M6 3l1 7M10 3L9 10M2.6 6h10.8"/>'),
  rod: svg('<path d="M2 14L14 2"/><path d="M14 2v7"/><circle cx="4.5" cy="11.5" r="1.6"/>'),
  film: svg('<rect x="2" y="4" width="12" height="9" rx="1.5"/><circle cx="8" cy="8.5" r="2.4"/><path d="M5.5 4l1-2h3l1 2"/>'),
  note: svg('<path d="M3 2h7l3 3v9H3z"/><path d="M5.5 7h5M5.5 9.5h5M5.5 12h3"/>'),
};
