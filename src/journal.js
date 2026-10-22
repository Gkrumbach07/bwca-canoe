// The journal (J; L still opens it for a while): a two-page paper spread. The left page is the trip: the food
// cells, the energy bar, the distances, portages, lakes and nights, the tasks on the go, a pencil note. The
// right page has tabs: Catches (the log, with personal bests), Tasks (on the go, done, on offer, the tally),
// Lakes (where you have been), Gear (what came off the outfitter's wall). Data comes from the fishing code
// (log, bests), the tasks, the energy, the outfitter's trip record and the trip tally (trip-stats.js).
import { clock12, longDate, shortDate, weekdayOf, esc, fmtKm, fmtDays, plural, word, lakeWords } from './hud.js';
import { UNLOCKS } from './tasks.js';

const ROWS = 8;        // catches per page
const PENCIL = [
  'walleye at dusk on the drop-off, jig and twister',
  'loons on the point again this evening',
  'rain smell in the air — tent fly first, then supper',
  'the portage landing is rough; take the packs over first',
  'pike in the weedy bay by the inlet, spoons',
  'lay over tomorrow if the wind holds',
];
const GEAR_ICON = {
  mepps: '<svg width="28" height="14" viewBox="0 0 28 14" aria-hidden="true"><ellipse cx="12" cy="7" rx="9" ry="4" fill="currentColor"/><path d="M21 7h6M24 4v6" stroke="currentColor" stroke-width="1.5"/></svg>',
  daredevle: '<svg width="28" height="14" viewBox="0 0 28 14" aria-hidden="true"><polygon points="2,7 12,1 26,7 12,13" fill="currentColor"/></svg>',
  rapala: '<svg width="28" height="14" viewBox="0 0 28 14" aria-hidden="true"><rect x="3" y="3" width="22" height="8" rx="4" fill="currentColor"/><circle cx="7" cy="7" r="1.2" fill="#ebe2cb"/></svg>',
  kevlar: '<svg width="28" height="14" viewBox="0 0 28 14" aria-hidden="true"><path d="M2 5 Q 14 14 26 5 L 22 9 Q 14 13 6 9 Z" fill="currentColor"/><path d="M2 5 Q 14 2 26 5" stroke="currentColor" stroke-width="1.4" fill="none"/></svg>',
  jig: '<svg width="28" height="14" viewBox="0 0 28 14" aria-hidden="true"><circle cx="7" cy="6" r="4" fill="currentColor"/><path d="M11 6 Q 18 2 26 9" stroke="currentColor" stroke-width="2" fill="none"/></svg>',
  silverminnow: '<svg width="28" height="14" viewBox="0 0 28 14" aria-hidden="true"><path d="M2 7 Q 10 1 20 7 Q 10 13 2 7 Z" fill="currentColor"/><path d="M20 7 L 26 3 L 26 11 Z" fill="currentColor"/></svg>',
  lazyike: '<svg width="28" height="14" viewBox="0 0 28 14" aria-hidden="true"><path d="M3 10 Q 10 1 17 7 T 26 5" stroke="currentColor" stroke-width="3" fill="none" stroke-linecap="round"/></svg>',
  fisher: '<svg width="28" height="14" viewBox="0 0 28 14" aria-hidden="true"><path d="M2 10 Q 14 -2 26 10" stroke="currentColor" stroke-width="2" fill="none"/><circle cx="26" cy="10" r="2" fill="currentColor"/></svg>',
};
const gearIcon = (key, faint = false) => `<span style="color:${faint ? '#9a8a70' : '#2a2016'}; display:inline-flex">${GEAR_ICON[key] || GEAR_ICON.jig}</span>`;

export class Journal {
  // t: { hud, world, player, day, fishing, tasks, energy, outfitter, stats, wind }
  constructor(t) {
    Object.assign(this, t);
    this.el = document.getElementById('journal');
    this.open = false; this.tab = 'catches'; this.page = 0; this.sig = ''; this.t = 0;
    this.hud.registerPaper('journal', () => this.close());
    this.el.addEventListener('click', (e) => {
      const tab = e.target.closest('[data-tab]'); if (tab) { this.tab = tab.dataset.tab; this.page = 0; this.render(true); return; }
      const pg = e.target.closest('[data-page]'); if (pg) { this.page = Math.max(0, this.page + Number(pg.dataset.page)); this.render(true); return; }
      const close = e.target.closest('[data-close]'); if (close) this.close();
    });
    window.addEventListener('keydown', (e) => {
      const tag = e.target && e.target.tagName;
      if (tag === 'SELECT' || tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.code === 'KeyJ' || e.code === 'KeyL') { if (e.repeat || this.hud.paper === 'outfitter') return; this.toggle(); }
      else if (!this.open) return;
      else if (e.code === 'Escape') this.close();
      else if (e.code === 'ArrowRight' || e.code === 'ArrowLeft') { this.page = Math.max(0, this.page + (e.code === 'ArrowRight' ? 1 : -1)); this.render(true); }
    });
  }
  toggle() { if (this.open) this.close(); else this.show(); }
  show() {
    if (this.open) return;
    this.open = true;
    this.hud.openPaper('journal');
    this.el.classList.add('show');
    this.render(true);
  }
  close() {
    if (!this.open) return;
    this.open = false;
    this.el.classList.remove('show');
    this.hud.closePaper('journal');
  }
  // while it is up, the page follows the game (a meal, a fish, the clock) at a gentle rate
  update(dt) { if (!this.open) return; if ((this.t += dt) > 0.5) { this.t = 0; this.render(false); } }

  // --- the words ------------------------------------------------------------------------------------------
  get trip() { return this.outfitter ? this.outfitter.trip : null; }
  get dayN() { const t = this.trip; return t && t.active ? Math.floor(this.outfitter.daysOut) + 1 : 0; }
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
    const w = this.wind, d = this.day, en = this.energy, h = d.hours, set = d.sunriseSunset.set;
    if (en && en.food < 1 && en.food > 0) return 'last of the food — head for an outfitter';
    if (en && en.food <= 0 && this.trip && this.trip.active) return 'pack is empty. any outfitter will fill it';
    if (en && en.value < 0.3) return 'tired. find a site early and eat something';
    if (w && w.fresh && h < 16) return 'wind should drop by evening — stay in the lee till then';
    if (w && w.speed < 2 && h < 10) return 'glassy this morning — make the miles before the wind gets up';
    if (set != null && h > set - 1 && h < set + 1) return 'sun is going. find a site, get the tent up';
    return PENCIL[(d.doy + Math.floor(h / 3)) % PENCIL.length];
  }
  signature() {
    const f = this.fishing, en = this.energy, st = this.stats, ts = this.tasks;
    return [this.tab, this.page, f ? f.logVersion : 0, en ? Math.round(en.value * 100) : 0, en ? en.food : 0, st ? Math.round(st.km * 10) : 0, st ? st.portages : 0, st ? st.lakes.length : 0, st ? st.nights.length : 0,
      ts ? ts.active.map((t) => `${t.id}${t.status}`).join() : '', ts ? ts.unlocks.length : 0, Math.floor(this.day.hours * 4), this.dayN].join('|');
  }

  render(force) {
    const sig = this.signature();
    if (!force && sig === this.sig) return;
    this.sig = sig;
    const scrolls = [...this.el.querySelectorAll('.scroll, .section')].map((n) => n.scrollTop);
    this.el.innerHTML = this.leftPage() + this.rightPage();
    [...this.el.querySelectorAll('.scroll, .section')].forEach((n, i) => { if (scrolls[i]) n.scrollTop = scrolls[i]; });
  }

  // --- the trip page ------------------------------------------------------------------------------------
  leftPage() {
    const trip = this.trip, en = this.energy, st = this.stats, ts = this.tasks, o = this.outfitter, w = this.world;
    const active = !!(trip && trip.active), dayN = this.dayN;
    const from = active ? trip.fromName || 'the landing' : null;
    const outfitterName = active && o ? (o.landings.find((l) => l.ep === trip.ep) || {}).name : '';
    let pushed = '';
    if (active) pushed = trip.startDoy != null ? `pushed off ${longDate(trip.startYear, trip.startDoy)}, ${clock12(trip.startHours)}` : `pushed off ${esc(trip.started || '')}`;
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
    const foodTxt = active ? `${fmtDays(left)} ${plural(left, 'day')} of ${total} · ${meal}` : 'no trip under way';
    const ev = en ? Math.round(en.value * 100) : 100;
    const energyTxt = en && en.warning ? 'no food and little left in you' : ev > 60 ? 'resting brings it back, faster at a campsite' : ev > 30 ? 'getting low · a meal or a rest at a campsite' : 'worn out · eat, or sit a while';
    const drops = st ? st.drops : 0;
    const dropTxt = drops === 0 ? '' : drops === 1 ? ' · the canoe dropped once' : drops === 2 ? ' · the canoe dropped twice' : ` · the canoe dropped ${drops} times`;
    const nights = st ? st.nights : [];
    const nightTxt = nights.length ? `${nights.length} · ${esc(nights[nights.length - 1].where)}` : 'none yet';
    const daysOn = st ? st.daysOnWater : 0;
    const active_tasks = ts ? ts.active : [];
    const todo = active_tasks.length ? active_tasks.map((t) => `<div class="todo ${t.status === 'done' ? 'done' : ''}"><i aria-hidden="true"></i><span>${esc(t.clue)}${t.status === 'done' ? ' <span class="soft">Done; turn it in at any outfitter.</span>' : ''}</span></div>`).join('')
      : '<div class="empty">Nothing on the go. The board is up at any outfitter.</div>';
    return `<section class="page left" aria-labelledby="trip-h">
      <div class="sc kicker">${active ? `The trip · day ${dayN}` : 'The trip'}</div>
      <div class="lede"><h2 id="trip-h">${active ? `Out from ${esc(from)}` : 'Between trips'}</h2><div class="sub">${active ? `${esc(outfitterName || '')}${outfitterName ? ' · ' : ''}${pushed}` : 'The outfitter at any landing will set you up with a food pack.'}</div></div>
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
    const tabs = [['catches', 'Catches'], ['tasks', 'Tasks'], ['lakes', 'Lakes'], ['gear', 'Gear']];
    const nav = `<nav class="tabs" aria-label="Journal pages">${tabs.map(([k, l]) => `<button type="button" data-tab="${k}" class="${this.tab === k ? 'on' : ''}">${l}</button>`).join('')}</nav>`;
    const body = this.tab === 'tasks' ? this.tasksTab() : this.tab === 'lakes' ? this.lakesTab() : this.tab === 'gear' ? this.gearTab() : this.catchesTab();
    const pageNo = (this.dayN || 0) * 2 + 1;
    return `<section class="page right" aria-labelledby="right-h"><div class="ribbon" aria-hidden="true"></div>${nav}<div class="tabpage">${body.html}</div>
      <div class="foot"><span>${body.foot || ''}</span><span class="keys"><kbd>J</kbd> or <kbd>Esc</kbd> closes · ${pageNo}</span></div></section>`;
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
    const open = ts.active.filter((t) => t.status !== 'done'), done = ts.active.filter((t) => t.status === 'done');
    const tally = ts.tally, total = tally.item + tally.survey + tally.fish;
    const kind = { item: 'Lost and found', survey: 'Survey', fish: 'Fishing' };
    const card = (t) => `<div class="todo ${t.status === 'done' ? 'done' : ''}"><i aria-hidden="true"></i><span><span class="lab">${kind[t.kind]} · posted at ${esc(t.fromName || '')}</span><br>${esc(t.clue)}${t.status === 'done' ? ' <span class="soft">Done; turn it in at any outfitter.</span>' : ''}</span></div>`;
    const offer = ts.board.length ? `<div class="lab">On offer at ${esc(ts.board[0].fromName || 'the outfitter')}</div>${ts.board.map((t) => `<div class="todo"><i aria-hidden="true" style="border-style:dashed"></i><span>${esc(t.clue)}</span></div>`).join('')}` : '';
    const html = `<div class="lede"><h2 id="right-h">${open.length ? `${word(open.length)[0].toUpperCase()}${word(open.length).slice(1)} on the go` : 'Nothing on the go'}${done.length ? `, ${word(done.length)} to turn in` : ''}</h2>
      <div class="sub">${total ? `${total} ${plural(total, 'task')} turned in this season: ${tally.item} found, ${tally.survey} surveyed, ${tally.fish ? tally.fish : 'none'} fished${tally.fish ? '' : ' yet'}.` : 'Nothing turned in yet. Finished tasks go back to any outfitter for a line of gear.'}</div></div>
      <div class="scroll" style="display:flex;flex-direction:column;gap:10px">${ts.active.map(card).join('') || '<div class="empty">Take something on at the outfitter’s board.</div>'}${offer}</div>`;
    return { html, foot: 'E at an outfitter’s dock opens the board' };
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
  gearTab() {
    const ts = this.tasks, have = ts ? ts.unlocks : [], left = UNLOCKS.filter((u) => !have.some((h) => h.key === u.key));
    const canoe = ts && ts.has('kevlar') ? 'A Kevlar canoe, 17 ft: lighter on the portages.' : 'An aluminium canoe, 17 ft. The Kevlar one is still on the wall.';
    const html = `<div class="lede"><h2 id="right-h">${have.length ? `${have.length} ${plural(have.length, 'thing')} off the wall` : 'Nothing off the wall yet'}</h2><div class="sub">${canoe}</div></div>
      <div class="scroll" style="display:flex;flex-direction:column;gap:14px">
        ${have.length ? `<div class="lab">Taken off the wall</div><ul class="plain">${have.map((u) => `<li>${gearIcon(u.key)}${esc(u.label)}</li>`).join('')}</ul>` : ''}
        <div class="lab">Still on the wall</div><div class="wall">${left.map((u) => gearIcon(u.key, true)).join('')}</div>
        <p class="empty">${left.length ? `${left.map((u) => u.label.replace(/ \(.*\)$/, '')).map((s, i) => (i === 0 ? s[0].toUpperCase() + s.slice(1) : s)).join(', ')} ${left.length === 1 ? 'comes' : 'come'} down for tasks turned in.` : 'The wall is bare: you have the lot.'}</p>
      </div>`;
    return { html, foot: 'five lures in the box: 1–5 with the rod up' };
  }
}
