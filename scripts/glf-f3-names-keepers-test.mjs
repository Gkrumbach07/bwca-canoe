// Fix stream f3 (names and keepers) after the game-loop playthrough, headless.
//   npx vite --port 5193 --strictPort &   then   APP=http://localhost:5193 node scripts/glf-f3-names-keepers-test.mjs [--only 1,2,3,4,5]
// 1  Names: no keeper, generated person, relative or summer hire carries a name of the story's cast
//    (docs/story/01-bible.md sections 3 and 4); the renamed hand keepers (6 Joanne Kauppi, 16 Leon Kastelic, 40 Merle
//    Ostrom) and the lure (Oskar's cedar minnow); the old names are gone from src/.
// 2  The truck's cards (rides.js: the drive's goodbye, the pickup's line) go through the grounding: a refused line is
//    drawn again, and every card line passes npcs.grounded.
// 3  A save's talk with a moved hand keeper under their old landing (14, 54, 55, 30) moves to the new host once.
// 4  The first free permit on a sold-out day: the desk shows the day as yours (not full, not struck out), the buy row
//    says it is your permit, and booked + held never pass the quota.
// 5  A screenshot of the permit desk with the gift day (shots/glf-f3-desk.png).
import { mkdirSync } from 'node:fs';
import { launch, openGame, seasonAt, step, log, until, APP } from './gl-e-lib.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const ONLY = new Set(String(arg('only', '1,2,3,4,5')).split(',').map(Number));
const results = [];
const check = (name, pass, more = {}) => { results.push({ name, pass: !!pass }); log(pass ? 'PASS' : 'FAIL', name, JSON.stringify(more).slice(0, 1200)); };

// the story's cast (the bible, sections 3-4 and 4.11, and the side stories' people), first names and surnames
const CAST_FIRST = ['Walt', 'Walter', 'Eino', 'Aili', 'June', 'Toivo', 'Helmi', 'Hilma', 'Carl', 'Dale', 'Wade', 'Tasha', 'Frank', 'Len', 'Tauno', 'Mary', 'Leo', 'Hap', 'Marlys', 'Sheila', 'Bob', 'Denny', 'Dennis', 'Carol', 'Gene', 'Jon', 'Liisa', 'Maggie', 'Josie', 'Ollie', 'Tom', 'Danielle', 'Gord', 'Bill', 'Pekka', 'Matt', 'Dan', 'Pete', 'Arne', 'Kari', 'Elaine', 'Rose', 'Nestori', 'Lyle', 'Emil', 'Duane', 'Vern', 'Lloyd', 'Rick', 'Nate', 'Irene', 'Elsie', 'Orrin'];
const CAST_LAST = ['Haapala', 'Niemi', 'Mattila', 'Brekke', 'Sorensen', 'Sorenson', 'Helstrom', 'Marolt', 'Kosir', 'Saari', 'Pelto', 'Johnsrud', 'Lind', 'Novak', 'Tervo', 'Rask', 'Arola', 'Tomczak', 'Hautala', 'Pekkala', 'Becker', 'Carriere', 'Pelletier', 'Ostrander', 'Haldane', 'Vang', 'Sundquist', 'Gornik', 'Gornick', 'Brandvold', 'Rintala', 'Halvorsen', 'Halvorson', 'Ostby', 'Pasanen', 'Gilbertson', 'Moen', 'Perko', 'Zupancic'];
// the bible's rulings keep these existing keepers: Bev Kangas ("no relation"), Arvid Strand ("different Strands"),
// René Belanger (Little Vermilion 12, the family's store, named in the bible as René)
const KEPT = new Set(['Bev Kangas', 'Arvid Strand', 'René Belanger']);
const castHit = (name) => { const w = String(name).split(/\s+/); return CAST_FIRST.includes(w[0]) || w.slice(1).some((s) => CAST_LAST.includes(s)); };
// the old names that must be gone from the game's source
const GONE = /\b(Leif|Eino|Perko|Zupancic|Pekkala|Halvorsen|Dale Ostrom|Walt Pekkala)\b/;
const SRC = ['outfitters.js', 'talk-keepers.js', 'items.js', 'shop.js', 'uniques.js', 'tasks.js', 'npcs.js', 'onboarding.js', 'photo.js', 'parties.js', 'talk-rumours.js', 'rides.js'];

const browser = await launch();
try {
  const page = await openGame(browser);
  log('game loaded at', APP);

  if (ONLY.has(1)) {
    const r = await page.evaluate(async ({ CF, CL, KEPT, SRC, GONE }) => {
      const g = window.__game, N = g.npcs, bad = [], hit = (n) => { const w = String(n).split(/\s+/); return CF.includes(w[0]) || w.slice(1).some((s) => CL.includes(s)); };
      for (const [k, l] of Object.entries(N.nameLists())) for (const n of l) if (CF.includes(n) || CL.includes(n)) bad.push(`${k}: ${n}`);
      const keepers = {};
      for (const e of g.world.entryPoints) { const op = g.outfitterProfile(e.ep); if (!op) continue; keepers[e.ep] = op.keeper.name; if (hit(op.keeper.name) && !KEPT.includes(op.keeper.name)) bad.push(`keeper ${e.ep}: ${op.keeper.name}`); }
      const K = await import('/src/talk-keepers.js');
      for (const [rel, , names] of K.RELS) for (const n of names) if (CF.includes(n)) bad.push(`RELS ${rel}: ${n}`);
      const staff = new Set(); for (const e of g.world.entryPoints) staff.add(g.onboarding.staffName(e.ep));
      for (const n of staff) if (CF.includes(n)) bad.push(`staff: ${n}`);
      const src = {};
      for (const f of SRC) { const t = await (await fetch(`/src/${f}`)).text(), m = t.match(new RegExp(GONE, 'g')); if (m) src[f] = [...new Set(m)]; }
      const item = g.items.itemDef('lure:cedarminnow');
      return { bad, src, minnow: item && item.name, k6: keepers[6], k16: keepers[16], k40: keepers[40], k31: keepers[31], staff: [...staff], nKeepers: Object.keys(keepers).length };
    }, { CF: CAST_FIRST, CL: CAST_LAST, KEPT: [...KEPT], SRC, GONE: GONE.source });
    check('1a no generated name, relative, hire or keeper is the story cast\'s', !r.bad.length, { bad: r.bad, nKeepers: r.nKeepers, staff: r.staff });
    check('1b the hand keepers renamed: 6 Joanne Kauppi, 16 Leon Kastelic, 40 Merle Ostrom', r.k6 === 'Joanne Kauppi' && r.k16 === 'Leon Kastelic' && r.k40 === 'Merle Ostrom', { k6: r.k6, k16: r.k16, k40: r.k40, k31: r.k31 });
    check('1c the lure is Oskar’s cedar minnow, and the old names are gone from src/', /^Oskar/.test(r.minnow || '') && !Object.keys(r.src).length, { minnow: r.minnow, src: r.src });
    void castHit;
  }

  if (ONLY.has(2) || ONLY.has(3) || ONLY.has(4) || ONLY.has(5)) await seasonAt(page, { ep: 25, year: 2026, doy: 192, hours: 9, mode: 'sandbox' });

  if (ONLY.has(2)) {
    const r = await page.evaluate(async () => {
      const g = window.__game, R = g.rides, o = g.outfitter, cards = [];
      const wired = typeof R.grounded === 'function';
      const realVeil = R.veil;
      R.veil = { card: (c) => { cards.push(c.text); return Promise.resolve(); } }; // (no onDark: the truck never leaves)
      o.show(o.landing(25), 'counter');
      const to = R.offer(25).find((x) => x.ep !== 25);
      // refuse the first line the drive's card would say: it must never show again
      const fromP = g.outfitterProfile(25), first = R.keeperWords(fromP, 'goodbye');
      const real = R.grounded; R.grounded = (w) => w !== first && real(w);
      for (let i = 0; i < 24; i++) { await R.take(to.ep); R.busy = false; }
      const drive = cards.splice(0);
      // the pickup's card from the lot at 27, by 25's truck
      const byP = g.outfitterProfile(25), firstRide = R.keeperWords(byP, 'ride');
      R.grounded = (w) => w !== firstRide && real(w);
      for (let i = 0; i < 24; i++) { await R.callPickup(27, 25); R.busy = false; }
      const pick = cards.splice(0);
      R.grounded = real; R.veil = realVeil; if (o.open) o.hide();
      const unq = (s) => s.replace(/^“|”$/g, '');
      return { wired, first, firstRide, drive: drive.map(unq), pick: pick.map(unq), driveRefused: drive.filter((t) => unq(t) === first).length, pickRefused: pick.filter((t) => unq(t) === firstRide).length, ungrounded: [...drive, ...pick].map(unq).filter((t) => !g.npcs.grounded(t)) };
    });
    check('2a rides.grounded is wired to npcs.grounded', r.wired, {});
    check('2b the drive card never says a refused goodbye (24 cards)', r.drive.length === 24 && r.driveRefused === 0, { refused: r.first, seen: [...new Set(r.drive)] });
    check('2c the pickup card never says a refused line (24 cards)', r.pick.length === 24 && r.pickRefused === 0, { refused: r.firstRide, seen: [...new Set(r.pick)] });
    check('2d every card line passes the grounding', !r.ungrounded.length, { ungrounded: r.ungrounded });
  }

  if (ONLY.has(3)) {
    const r = await page.evaluate(() => {
      const g = window.__game, N = g.npcs, s = N.s, today = N.today;
      // an old save: Leon's arc two beats on at 14, Arvid's deal at 54, Lise's secret and a topic at 55, Ruth's talk at 30,
      // and the new host 16 already holding a lesser arc of its own
      Object.assign(s, { moved: 0 });
      s.arcs[14] = { b: 2, at: today - 3 }; s.arcs[16] = { b: 1, at: today - 9 };
      s.deal[54] = 0.9; s.secret[55] = { x: 1, z: 2, lake: 'Test' }; s.topics['55:winter'] = 1; s.visits[30] = [today - 5, today - 4];
      s.talked['keeper:30'] = 4; s.asked['keeper:30#0'] = { area: 1, self: 0, news: 0, place: 0 };
      if (s.mem) { s.mem.greet[30] = today - 4; }
      N.write();
      N.s = N.load(); N.chars.clear();
      const t = N.s;
      const first = { arc16: t.arcs[16], arc14: t.arcs[14], deal51: t.deal[51], deal54: t.deal[54], secret64: t.secret[64], topic64: t.topics['64:winter'], topic55: t.topics['55:winter'], visits31: t.visits[31], talked31: t.talked['keeper:31'], talked30: t.talked['keeper:30'], asked31: !!t.asked['keeper:31#0'], greet31: t.mem ? t.mem.greet[31] : null, moved: t.moved, beat16: (N.arcState(16) || {}).b };
      // once: a later write under 14 is not moved again on the next load
      t.arcs[14] = { b: 1, at: today }; N.write(); N.s = N.load();
      const second = { arc14: N.s.arcs[14], arc16: N.s.arcs[16] };
      return { first, second };
    });
    const f = r.first;
    check('3a the moved keepers\' talk is at the new hosts (arc 14→16 the further one, deal 54→51, secret and topic 55→64, talk 30→31)',
      f.arc16 && f.arc16.b === 2 && !f.arc14 && f.deal51 === 0.9 && f.deal54 == null && f.secret64 && f.topic64 === 1 && f.topic55 == null && f.visits31 && f.visits31.length === 2 && f.talked31 === 4 && f.talked30 == null && f.asked31 && f.beat16 === 2 && f.moved === 1, f);
    check('3b it moves once (moved: 1 is saved)', r.second.arc14 && r.second.arc14.b === 1 && r.second.arc16.b === 2, r.second);
  }

  if (ONLY.has(4) || ONLY.has(5)) {
    const r = await page.evaluate(async () => {
      const g = window.__game, P = g.permits, D = g.permitDesk, o = g.outfitter, today = P.today;
      // the desk is off in a sandbox: this check is the Adventure desk
      const sb = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(P), 'sandbox');
      Object.defineProperty(P, 'sandbox', { configurable: true, get: () => false });
      // a real sold-out day if the schedule has one in the next weeks (else today is made one: every permit booked)
      let natural = null; for (let a = today; a < today + 28 && natural == null; a++) if (P.available(25, a).left <= 0 && !P.available(25, a).closed) natural = a;
      const q = P.available(25, today).quota, booked0 = P.booked.bind(P);
      P.booked = (ep, abs) => (Number(ep) === 25 && abs === today ? q : booked0(ep, abs));
      const before = P.available(25, today);
      P.s.held = P.s.held.filter((p) => p.abs !== today);
      const gift = P.grant({ ep: 25, abs: today, kind: 'overnight', from: 25, why: 'first' });
      const after = P.available(25, today);
      // booked + held ≤ quota for every desk entry point, four weeks out
      const over = [];
      for (const ep of [25, 27, 30, 31, 38, 51, 16, 6, 1, 12]) for (let a = today; a < today + 28; a++) { const v = P.available(ep, a); if (v.booked + v.held > v.quota || v.left < 0) over.push({ ep, a, ...v }); }
      D.sel = null;
      const html = D.section(25), box = document.createElement('div'); box.innerHTML = html;
      const cell = box.querySelector(`.pd-day[data-id="${today}"]`);
      const buy = box.querySelector('.pd-buy');
      o.show(o.landing(25), 'counter');
      if (typeof o.render === 'function') o.render();
      const el = document.querySelector('#outfitter .permitdesk'); if (el) el.scrollIntoView({ block: 'center' });
      return { natural, before, after, gift: gift && gift.id, cell: cell && { text: cell.textContent, cls: cell.className, disabled: cell.disabled, label: cell.getAttribute('aria-label') }, buy: buy && buy.textContent, chosen: D.sel && D.sel.abs === today, over, sandboxWas: !!sb, deskShown: !!el };
    });
    if (ONLY.has(4)) {
      check('4a the gift day reads "yours", chosen, not struck out or disabled', r.cell && /yours/.test(r.cell.text) && /\bmine\b/.test(r.cell.cls) && !/\boff\b/.test(r.cell.cls) && !r.cell.disabled && r.chosen, r.cell);
      check('4b the buy row says it is your permit', /your permit's for this day/.test(r.buy || ''), { buy: r.buy });
      check('4c sold out before the gift (booked = quota); after, booked + held = quota and nothing left', r.before.booked === r.before.quota && r.before.left === 0 && r.after.held === 1 && r.after.booked + r.after.held === r.after.quota && r.after.left === 0 && r.after.mine, { before: r.before, after: r.after, naturalSoldOut: r.natural });
      check('4d booked + held never passes the quota (10 entry points, 28 days)', !r.over.length, { over: r.over.slice(0, 5) });
    }
    if (ONLY.has(5)) {
      mkdirSync('shots', { recursive: true });
      await step(page, 4);
      await page.waitForTimeout(400);
      const el = await page.$('#outfitter .permitdesk');
      if (el) await el.screenshot({ path: 'shots/glf-f3-desk.png' }); else await page.screenshot({ path: 'shots/glf-f3-desk.png' });
      check('5 the permit desk drawn with the gift day (shots/glf-f3-desk.png)', r.deskShown, {});
    }
  }
  void until;
} finally {
  await browser.close();
}
const failed = results.filter((x) => !x.pass);
log(`${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
