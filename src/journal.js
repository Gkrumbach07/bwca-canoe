// The book (I; fb4 B, decision 4: the one key, I or Esc closes it, Pack and Journal are tabs on its top edge; J, L,
// Tab, Shift-Tab and the arrow keys are gone): one leather-bound book with two sides. It opens at the pack. The journal
// side is a two-page paper spread. Its left page is the trip: the food cells, the energy
// bar, the distances, portages, lakes and nights, the tasks on the go, a pencil note. Its right page has tabs:
// Catches (the log, with personal bests), Tasks (the notices taken on, where each is paid, the season's earnings),
// Lakes (where you have been), Trips (the logbook: every trip and how it ended), Photos (the prints the camera keeps,
// photo.js). The gear, the food and what you carry are the pack side's (inv-ui.js PackSide): the Tarkov grids of your
// containers on a canvas mat (feedback 2026-10-24: "the journal is only for catches, tasks, lakes, trips, photos").
// Data comes from the fishing code (log, bests), the tasks, the energy, the outfitter's trip record, the trip's permit
// and logbook (trip.js, reached through the outfitter), the trip tally (trip-stats.js) and the camera (photo.js).
// The pack side is one screen (wc B, the world cards): the body on the left, a tab per container across the top, and
// since fb4 B what is around you as tabs on the right (the canoe, each container on the ground, Wood, The ground, the
// outfitters' keeping); a click turns a tab; openHere(ref) is stream A's Q.
import { clock12, longDate, shortDate, weekdayOf, esc, fmtKm, fmtDays, plural, word, lakeWords } from './hud.js';
import { PackSide } from './inv-ui.js';
import { KINDS } from './tasks.js'; // fb3 C: a notice's kind, for its progress and its label

const ROWS = 8;        // catches per page
const PENCIL = [
  'walleye at dusk on the drop-off, jig and twister',
  'loons on the point again this evening',
  'rain smell in the air — tent fly first, then supper',
  'the portage landing is rough; take the packs over first',
  'pike in the weedy bay by the inlet, spoons',
  'lay over tomorrow if the wind holds',
];
const SIDES = ['pack', 'journal'];
// what lifts the energy bar's ceiling, by the need whose chunk is biggest (energy.chunks)
const LIFTS = { rest: 'a night’s sleep lifts it', food: 'a meal lifts it', water: 'a drink lifts it', warmth: 'a fire, or the tent and the bag, lift it' };

export class Journal {
  // t: { hud, world, player, day, fishing, tasks, energy, outfitter, stats, wind, onUse }
  constructor(t) {
    Object.assign(this, t);
    this.el = document.getElementById('journal');
    this.open = false; this.tab = 'catches'; this.page = 0; this.sig = ''; this.t = 0; this.side = 'journal';
    // the book: a tab for each side on its top edge, the journal's spread and the pack's mat
    this.el.classList.add('book');
    this.el.setAttribute('aria-label', 'The book: the journal and the pack');
    this.el.innerHTML = `<div class="book-tabs" role="tablist"><button type="button" class="book-tab p" data-side="pack" role="tab">Pack</button><button type="button" class="book-tab j" data-side="journal" role="tab">Journal</button></div>
      <div class="book-key"><kbd>I</kbd> or <kbd>Esc</kbd> closes</div><div class="side j"></div><div class="side p"></div>`;
    this.jEl = this.el.querySelector('.side.j'); this.pEl = this.el.querySelector('.side.p');
    this.pack = new PackSide(this.pEl, { onUse: t.onUse || null, closeBook: () => this.close() }); // fb2 B: a nearby thing's action that wants the world (Pitch, Eat at the fire) closes the book first
    this.hud.registerPaper('journal', () => this.close());
    this.el.addEventListener('click', (e) => {
      const side = e.target.closest('[data-side]'); if (side) { this.setSide(side.dataset.side); return; }
      const tab = e.target.closest('[data-tab]'); if (tab) { this.tab = tab.dataset.tab; this.page = 0; this.render(true); return; }
      const pg = e.target.closest('[data-page]'); if (pg) { this.page = Math.max(0, this.page + Number(pg.dataset.page)); this.render(true); return; }
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
  pencilNote() {
    const w = this.wind, d = this.day, en = this.energy, h = d.hours, set = d.sunriseSunset.set, c = this.core;
    const adv = !!(c && c.adventure && c.active), sand = !!(c && c.sandbox);
    // (the inventory's snacks count as food too; at an outfitter the shelf is a step away)
    const out = this.trip && this.trip.active && !(this.outfitter && this.outfitter.visit), inv = en && en.inv;
    const none = inv && typeof inv.snacks === 'function' ? inv.meals() + inv.snacks() <= 0 : en && en.food <= 0;
    if (!sand && en && out && en.food < 1 && !none) { if (en.food > 0) return adv ? 'last of the food. make for a landing' : 'last of the food — head for an outfitter'; }
    // (polish B: nothing to eat is worth a line once hunger is coming, not on the first stroke of a season)
    if (!sand && en && out && none && en.needs.food < 0.6) return adv ? 'nothing to eat with you, and getting hungry. make for a landing' : 'nothing to eat with you. any outfitter will fill the pack';
    if (adv && en && en.awake > 18) return 'up since yesterday. sleep before anything else';
    if (adv && c.state.wet) return 'everything is damp. a fire tonight to dry the gear';
    if (en && en.value < 0.3) return 'tired. find a site early and eat something';
    if (w && w.fresh && h < 16) return 'wind should drop by evening — stay in the lee till then';
    if (w && w.speed < 2 && h < 10) return 'glassy this morning — make the miles before the wind gets up';
    if (set != null && h > set - 1 && h < set + 1) return 'sun is going. find a site, get the tent up';
    return PENCIL[(d.doy + Math.floor(h / 3)) % PENCIL.length];
  }
  signature() {
    const f = this.fishing, en = this.energy, st = this.stats, ts = this.tasks;
    const c = this.core;
    return [this.tab, this.page, f ? f.logVersion : 0, en ? Math.round(en.value * 100) : 0, en ? en.food : 0, st ? Math.round(st.km * 10) : 0, st ? st.portages : 0, st ? st.lakes.length : 0, st ? st.nights.length : 0,
      ts ? ts.active.map((t) => `${t.id}${t.status}`).join() : '', ts ? ts.unlocks.length : 0, Math.floor(this.day.hours * 4), this.dayN,
      c ? `${c.mode}${c.active}${c.book.trips.length}${c.state.wet}` : '', this.photos ? this.photos.version : 0].join('|');
  }

  render(force) {
    const sig = this.signature();
    if (!force && sig === this.sig) return;
    this.sig = sig;
    const scrolls = [...this.jEl.querySelectorAll('.scroll, .section')].map((n) => n.scrollTop);
    this.jEl.innerHTML = this.leftPage() + this.rightPage();
    [...this.jEl.querySelectorAll('.scroll, .section')].forEach((n, i) => { if (scrolls[i]) n.scrollTop = scrolls[i]; });
  }

  // --- the trip page ------------------------------------------------------------------------------------
  leftPage() {
    const trip = this.trip, en = this.energy, st = this.stats, ts = this.tasks, o = this.outfitter, w = this.world;
    const active = !!(trip && trip.active), dayN = this.dayN, c = this.core, adv = !!(c && c.adventure && c.active), sand = !!(c && c.sandbox);
    const from = active ? trip.fromName || 'the landing' : null;
    const outfitterName = active && o ? (o.landings.find((l) => l.ep === trip.ep) || {}).name : '';
    let pushed = '';
    if (active) pushed = trip.startDoy != null ? `pushed off ${sand ? '' : `${longDate(trip.startYear, trip.startDoy)}, `}${clock12(trip.startHours)}` : `pushed off ${esc(trip.started || '')}`;
    // food: a cell a day, the half days as half cells, what is eaten left empty
    const total = active ? Math.max(trip.days || 0, Math.ceil(en.food)) : 0, left = en ? en.food : 0;
    let cells = '';
    for (let i = 0; i < total; i++) {
      const have = left - i;
      if (have >= 1) cells += '<i></i>';
      else if (have >= 0.5) cells += '<i class="half"></i><i class="half empty"></i>';
      else cells += '<i class="empty"></i>';
    }
    const d = this.day, afterRise = d.sunriseSunset.rise == null || d.hours >= d.sunriseSunset.rise, beforeSet = d.sunriseSunset.set == null || d.hours < d.sunriseSunset.set;
    const meal = left <= 0 ? 'the pack is empty' : afterRise && beforeSet ? 'supper at sunset' : 'breakfast at dawn';
    // with the inventory (fb A), its own words: the meals and snacks within reach, eaten from the pack (no meal comes on the clock)
    const words = en && en.inv && typeof en.foodWords === 'function' ? en.foodWords() : null;
    const foodTxt = !active ? 'no trip under way' : sand ? `the pack keeps · ${meal}` : words ? `${words === 'no food' ? 'nothing to eat' : words} within reach · eaten from the pack` : `${fmtDays(left)} ${left <= 1 ? 'day' : 'days'} of ${total} · ${meal}`;
    const ev = en ? Math.round(en.value * 100) : 100;
    const cap = en ? Math.round(en.ceiling * 100) : 100;
    // at its ceiling the bar goes no higher until the need that holds it down is met (fb2 F: the ceiling is the bar less
    // each need's chunk, sleep, hunger, thirst and cold): the biggest chunk says what lifts it
    const top = en && typeof en.chunks === 'function' ? en.chunks().reduce((a, c) => (!a || c.size > a.size ? c : a), null) : null;
    const lifts = top && top.size > 0.01 ? ` · ${LIFTS[top.key] || 'a night’s sleep lifts it'}` : '';
    const energyTxt = en && en.warning ? 'no food and little left in you' : adv && cap < 100 && ev >= cap - 2 ? `${(en && en.heldBy) || 'it goes no higher now'}${lifts}` : ev > 60 ? 'resting brings it back, faster at a campsite' : ev > 30 ? 'getting low · a meal or a rest at a campsite' : 'worn out · eat, or sit a while';
    const drops = st ? st.drops : 0;
    const dropTxt = drops === 0 ? '' : drops === 1 ? ' · the canoe dropped once' : drops === 2 ? ' · the canoe dropped twice' : ` · the canoe dropped ${drops} times`;
    const nights = st ? st.nights : [];
    const nightTxt = nights.length ? `${nights.length} · ${esc(nights[nights.length - 1].where)}` : 'none yet';
    const daysOn = st ? st.daysOnWater : 0;
    const active_tasks = ts ? ts.active : [];
    // fb3 C (16): each notice with its state in the box and a word on it (taskState)
    const todo = active_tasks.length ? active_tasks.map((t) => { const st = this.taskState(t); return `<div class="todo ${st.cls}"><i aria-hidden="true"></i><span>${esc(t.clue)} <span class="soft"><span class="sc">${esc(st.word)}</span> · ${esc(st.words)}</span></span></div>`; }).join('')
      : '<div class="empty">Nothing on the go. Every outfitter pins notices by the door, paid at its own counter.</div>';
    return `<section class="page left" aria-labelledby="trip-h">
      <div class="sc kicker">${active ? `The trip · ${c ? `${c.adventure ? 'Adventure' : 'Sandbox'} · ${esc(c.dayWords())}` : `day ${dayN}`}` : `The trip${c ? ` · ${c.adventure ? 'Adventure' : 'Sandbox'}` : ''}`}</div>
      <div class="lede"><h2 id="trip-h">${active ? `Out from ${esc(from)}` : 'Between trips'}</h2><div class="sub">${active ? `${esc(outfitterName || '')}${outfitterName ? ' · ' : ''}${pushed}` : adv || (c && c.adventure) ? 'Food on the provisions shelf; push off when you like.' : 'The outfitter at any landing will set you up with a food pack.'}</div></div>
      <div class="grid">
        <div class="lab">Food</div><div class="with"><span class="cells" aria-hidden="true">${cells}</span><span>${foodTxt}</span></div>
        <div class="lab">Energy</div><div class="with"><span class="ebar"><i style="width:${ev}%"></i></span><span>${ev} % · ${energyTxt}</span></div>
        <div class="lab">Paddled</div><div>${st ? `${fmtKm(st.km)} km · ${daysOn} ${plural(daysOn, 'day')} on the water` : '—'}</div>
        <div class="lab">Portages</div><div>${st ? `${st.portages} walked${st.rods ? ` · ${st.rods} rods` : ''}${dropTxt}` : '—'}</div>
        <div class="lab">Lakes</div><div>${st ? esc(this.lakeList(st.lakes)) : '—'}</div>
        <div class="lab">Nights</div><div>${nightTxt}</div>
      </div>
      <div class="section"><div class="lab">On the go</div>${todo}</div>
      <div class="foot"><div class="pencil">${esc(this.pencilNote())}</div><div>${active ? dayN * 2 : 1}</div></div>
    </section>`;
  }

  // --- the right page -------------------------------------------------------------------------------------
  rightPage() {
    const tabs = [['catches', 'Catches'], ['tasks', 'Tasks'], ['lakes', 'Lakes'], ...(this.core ? [['trips', 'Trips']] : []), ...(this.photos ? [['photos', 'Photos']] : [])]; // hubs 3B: the prints; the gear is the pack side's
    const nav = `<nav class="tabs" aria-label="Journal pages">${tabs.map(([k, l]) => `<button type="button" data-tab="${k}" class="${this.tab === k ? 'on' : ''}">${l}</button>`).join('')}</nav>`;
    if (!tabs.some(([k]) => k === this.tab)) this.tab = 'catches';
    const body = this.tab === 'tasks' ? this.tasksTab() : this.tab === 'lakes' ? this.lakesTab() : this.tab === 'trips' && this.core ? this.tripsTab() : this.tab === 'photos' && this.photos ? this.photosTab() : this.catchesTab();
    const pageNo = (this.dayN || 0) * 2 + 1;
    return `<section class="page right" aria-labelledby="right-h"><div class="ribbon" aria-hidden="true"></div>${nav}<div class="tabpage">${body.html}</div>
      <div class="foot"><span>${body.foot || ''}</span><span class="keys"><kbd>I</kbd> or <kbd>Esc</kbd> closes · ${pageNo}</span></div></section>`;
  }
  catchesTab() {
    const f = this.fishing, log = f ? f.log : [], bests = f ? Object.values(f.bests || {}) : [];
    const kept = log.filter((c) => c.kept).length;
    const bestTxt = bests.length ? `Personal bests: ${bests.sort((a, b) => b.length - a.length).map((b) => `${esc(String(b.name || '').toLowerCase())} ${b.length} cm`).join(' · ')}` : 'No personal bests yet. F takes up the rod in the canoe; hold Space to cast.';
    const all = log.slice().reverse(), pages = Math.max(1, Math.ceil(all.length / ROWS));
    this.page = Math.min(this.page, pages - 1);
    const rows = all.slice(this.page * ROWS, this.page * ROWS + ROWS).map((c) => `<tr><td>${this.catchTime(c)}</td><td class="${c.best ? 'best' : ''}">${esc(c.name)}${c.best ? ' ★' : ''}</td><td>${c.length} cm</td><td>${c.weight} kg</td><td>${esc(String(c.lake).replace(/^Lake /, ''))}</td><td>${esc(c.lureShort || c.lure || '')}</td><td class="soft">${c.kept ? 'kept' : 'released'}</td></tr>`).join('');
    const table = log.length ? `<div class="scroll"><table><thead><tr><th>Time</th><th>Fish</th><th>Length</th><th>Weight</th><th>Lake</th><th>Lure</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>` : '<div class="empty">Nothing in the log yet.</div>';
    const more = all.length - (this.page + 1) * ROWS;
    const foot = `★ personal best${more > 0 ? ` · <button type="button" class="pbtn" data-page="1">${more} more on the next page</button>` : ''}${this.page > 0 ? ` · <button type="button" class="pbtn" data-page="-1">back a page</button>` : ''}`;
    return { html: `<div class="lede"><h2 id="right-h">${log.length ? `${log.length} ${plural(log.length, 'fish', 'fish')}, ${kept} kept` : 'No fish yet'}</h2><div class="sub">${bestTxt}</div></div>${table}`, foot };
  }
  tasksTab() {
    const ts = this.tasks;
    if (!ts) return { html: '<div class="lede"><h2 id="right-h">Tasks</h2></div><div class="empty">No board on this trip.</div>', foot: '' };
    const all = ts.active, open = all.filter((t) => t.status !== 'done'), done = all.filter((t) => t.status === 'done');
    const at = (ep) => { const l = ts.landing ? ts.landing(ep) : null; return l ? l.name : 'the outfitter'; };
    const kinds = { item: 'Lost and found', survey: 'Portage crew', fish: 'Fish wanted' };
    // the notices taken on, the finished ones first, each with its state plain (fb3 C, 16: taskState) and where it is paid
    // (a visitor's task, npcs.js, is theirs: asked in person at that store, paid by them or its counter)
    const card = (t) => {
      const who = t.npc ? String(t.npcName || 'a visitor') : '', st = this.taskState(t);
      const lab = t.npc ? `Asked by ${esc(who)}` : kinds[t.kind] || esc((KINDS[t.kind] && KINDS[t.kind].label) || t.kind);
      return `<div class="todo ${st.cls}"><i aria-hidden="true"></i><span><span class="lab">${lab} · ${esc(at(t.from))}</span><span class="pay">$${t.pay || 0}</span><br><b>${esc(t.title || '')}</b> ${esc(t.text || t.clue || '')}<br><span class="soft state"><span class="sc">${esc(st.word)}</span> · ${esc(st.words)}</span></span></div>`;
    };
    const list = [...done, ...open].map(card).join('');
    const paid = (ts.claimed || []).slice(-5).reverse();
    const claimed = paid.length ? `<div class="lab">Claimed lately</div>${paid.map((c) => `<div class="todo claimed"><i aria-hidden="true"></i><span><b>${esc(c.title)}</b> · <span class="soft">${esc(at(c.from))}</span><span class="pay">$${c.pay}</span><br><span class="soft state"><span class="sc">Claimed</span> · $${c.pay} paid at ${esc(at(c.from))}</span></span></div>`).join('')}` : '';
    const n = (ts.claimed || []).length, earned = ts.earned || 0;
    const head = open.length || done.length ? `${open.length ? `${word(open.length)[0].toUpperCase()}${word(open.length).slice(1)} on the go` : 'Nothing on the go'}${done.length ? `, ${word(done.length)} to claim` : ''}` : 'Nothing on the go';
    const sub = earned ? `$${earned} from the boards this season, ${n} ${plural(n, 'notice')} claimed. Each is paid only at the counter that posted it.` : 'Every outfitter pins four notices by the door. Each is paid only at the counter that posted it.';
    const html = `<div class="lede"><h2 id="right-h">${head}</h2><div class="sub">${sub}</div></div>
      <div class="scroll notice-list">${list || '<div class="empty">Take something on at an outfitter’s board.</div>'}${claimed}</div>`;
    return { html, foot: 'the cork board hangs by the door inside every store' };
  }
  lakesTab() {
    const st = this.stats, w = this.world, lakes = st ? st.lakes : [];
    const rows = lakes.slice().reverse().map((e) => {
      const l = w.lakes[e.id - 1], d = this.day;
      const ago = d.doy - e.doy;
      const when = this.trip && this.trip.active && this.trip.startDoy != null ? `day ${Math.max(1, e.doy - this.trip.startDoy + 1)}` : ago === 0 ? 'today' : ago === 1 ? 'yesterday' : shortDate(d.year, e.doy);
      return `<tr><td>${esc(e.name)}</td><td>${when}</td><td class="soft">${l ? esc(lakeWords(l)) : ''}</td><td>${l && l.secchi ? `${l.secchi.toFixed(1)} m` : '—'}</td></tr>`;
    }).join('');
    const html = `<div class="lede"><h2 id="right-h">${lakes.length ? `${lakes.length} ${plural(lakes.length, 'lake')}` : 'No lakes yet'}</h2><div class="sub">In the order you first paddled them.</div></div>
      ${lakes.length ? `<div class="scroll"><table><thead><tr><th>Lake</th><th>First paddled</th><th>What it is</th><th>Clarity</th></tr></thead><tbody>${rows}</tbody></table></div>` : '<div class="empty">Push off and they will be written here.</div>'}`;
    return { html, foot: 'clarity: Secchi depth, from the DNR where it has one' };
  }
  // the logbook: every trip, newest first, and how it ended; what has been seen across them, and the outfitters known
  tripsTab() {
    const c = this.core, book = c.book, trips = book.trips.slice().reverse(), seen = book.seen, o = this.outfitter, pr = c.profile || (o && o.profile) || null;
    const place = (ep) => { const l = o && ep != null ? o.landings.find((x) => x.ep === ep) : null; return l ? l.place : '—'; };
    // how it ended: came in (an open trip called at a counter), brought in (an evacuation), or the trip core's words
    const how = (t) => {
      if (t.k === 'completed' && t.why === 'came in') return `came in${t.to != null ? ` at ${esc(place(t.to))}` : ''}`;
      if (t.k === 'evacuated') return `brought in${t.why ? `: ${esc(t.why)}` : ''}`;
      if (t.k === 'abandoned') return 'left off';
      const note = t.why && t.why !== 'sandbox' && t.why !== 'as planned' ? `: ${esc(t.why)}` : t.why === 'as planned' ? ', as planned' : '';
      return `${t.k === 'late' ? 'completed late' : 'completed'}${note}`;
    };
    const pages = Math.max(1, Math.ceil(trips.length / ROWS));
    this.page = Math.min(this.page, pages - 1);
    const rows = trips.slice(this.page * ROWS, this.page * ROWS + ROWS).map((t) => {
      const e = t.entry || {}, when = e.year ? shortDate(e.year, e.doy) : '';
      const rs = t.resupplies ? ` · ${t.resupplies} ${plural(t.resupplies, 'resupply', 'resupplies')}` : '';
      return `<tr><td>${when}</td><td>${esc(place(t.from))}</td><td>${t.days || '—'}</td><td>${fmtKm(t.km || 0)} km${rs}</td><td class="${t.k === 'evacuated' ? 'best' : ''}">${how(t)}</td><td class="soft">${t.mode === 'sandbox' ? 'sandbox' : ''}</td></tr>`;
    }).join('');
    const all = o ? o.landings.length : 0, known = pr ? pr.known.length : 0;
    const counts = `${seen.lakes.length} ${plural(seen.lakes.length, 'lake')}, ${seen.camps.length} ${plural(seen.camps.length, 'campsite')} and ${seen.portages.length} ${plural(seen.portages.length, 'portage')} seen${pr ? `; ${known} of ${all} outfitters known` : `, ${seen.eps.length} ${plural(seen.eps.length, 'landing')}`}.`;
    const inN = book.trips.filter((t) => t.k === 'completed' || t.k === 'late').length;
    const html = `<div class="lede"><h2 id="right-h">${book.trips.length ? `${book.trips.length} ${plural(book.trips.length, 'trip')}, ${inN ? word(inN) : 'none'} came in` : 'No trips logged yet'}</h2><div class="sub">${counts}</div></div>
      ${trips.length ? `<div class="scroll"><table><thead><tr><th>Pushed off</th><th>From</th><th>Days</th><th>Paddled</th><th>How it ended</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>` : '<div class="empty">A trip is logged by itself when you come in at an outfitter’s landing, or when someone brings you in.</div>'}`;
    const more = trips.length - (this.page + 1) * ROWS;
    const foot = `${more > 0 ? `<button type="button" class="pbtn" data-page="1">${more} more on the next page</button>` : ''}${this.page > 0 ? `${more > 0 ? ' · ' : ''}<button type="button" class="pbtn" data-page="-1">back a page</button>` : ''}` || 'what you have seen stays seen';
    return { html, foot };
  }
  // hubs 3B: the prints (photo.js), newest first, four to a page: the picture, its caption in pencil, and the notice it
  // went to (paid, once the notice has been claimed)
  photosTab() {
    const ph = this.photos, list = ph.prints(), per = 4, pages = Math.max(1, Math.ceil(list.length / per));
    this.page = Math.min(this.page, pages - 1);
    const paid = new Set(((this.tasks && this.tasks.claimed) || []).map((c) => c.id)), tilt = [-1.2, 0.9, 0.6, -0.8];
    const cards = list.slice(this.page * per, this.page * per + per).map((p, i) => `<figure class="print" style="--tilt:${tilt[i % 4]}deg">
      ${p.url ? `<img src="${p.url}" width="240" height="135" alt="${esc(p.caption)}">` : '<div class="blank">developing…</div>'}
      <figcaption>${esc(p.caption)}${p.notice ? `<span class="for">for “${esc(p.notice.title)}”${paid.has(p.notice.id) ? ' · paid' : ''}</span>` : ''}</figcaption></figure>`).join('');
    const film = ph.film, n = list.length;
    const sub = film === '35mm' ? 'The 35 mm: C raises it, the wheel zooms, Space takes the picture. The last 24 are kept; the oldest goes first.'
      : film === 'disposable' ? `The disposable has ${word(ph.shotsLeft)} ${plural(ph.shotsLeft, 'picture')} left. C raises it, Space takes the picture.`
        : ph.noCamera;
    const html = `<div class="lede"><h2 id="right-h">${n ? `${n} ${plural(n, 'print')}` : 'No pictures yet'}</h2><div class="sub">${sub}</div></div>
      ${n ? `<div class="prints">${cards}</div>` : '<div class="empty">A picture you take comes back as a print, here.</div>'}`;
    const more = n - (this.page + 1) * per;
    const foot = `${more > 0 ? `<button type="button" class="pbtn" data-page="1">${more} more on the next page</button>` : ''}${this.page > 0 ? `${more > 0 ? ' · ' : ''}<button type="button" class="pbtn" data-page="-1">back a page</button>` : ''}` || 'the newest first';
    return { html, foot };
  }
}
