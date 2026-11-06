// Round 3 replay (claude/r3-replay): the three playtests of claude/r3-join (466ad56), each defect fixed checked here on
// the real path, played in order through one new season (and a second one for the talk left unfinished). Each check is
// named for the defect it covers; docs/build/r3-contract.md section 9 lists them.
//
//   APP=http://localhost:5281 node scripts/r3-replay-test.mjs [--home 31]
import { createRequire } from 'node:module';
import { readdirSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const APP = process.env.APP || 'http://localhost:5281';
const HOME = Number(arg('home', 31));
function findPw() { if (process.env.PW) return process.env.PW; const base = path.join(homedir(), '.npm/_npx'); for (const d of existsSync(base) ? readdirSync(base) : []) { const p = path.join(base, d, 'node_modules/playwright-core'); if (existsSync(p)) return p; } return 'playwright-core'; }
function findChrome() { if (process.env.CHROME) return process.env.CHROME; const base = path.join(homedir(), 'Library/Caches/ms-playwright'); const shells = existsSync(base) ? readdirSync(base).filter((d) => d.startsWith('chromium_headless_shell-')).sort() : []; const order = [...shells.filter((s) => s.endsWith('-1234')), ...shells.reverse()]; for (const s of order) for (const d of readdirSync(path.join(base, s))) { const p = path.join(base, s, d, 'chrome-headless-shell'); if (existsSync(p)) return p; } return undefined; }
const { chromium } = createRequire(import.meta.url)(findPw());
const log = (...a) => console.log(new Date().toISOString().slice(11, 23), ...a);
const results = [];
const result = (name, pass, more = {}) => { results.push({ name, pass: !!pass }); log(pass ? 'PASS' : 'FAIL', name, JSON.stringify(more).slice(0, 1400)); };
const until = (page, fn, a, timeout = 120000) => page.waitForFunction(fn, a, { timeout, polling: 250 });

const HELPERS = () => {
  const g = window.__game, H = window.__rp = { cards: [], notes: [], barks: [], keeper: [] };
  H.step = (frames = 30, dt = 1 / 30) => { for (let left = frames; left > 0; left -= 200) g.step(dt, Math.min(200, left)); };
  H.wait = (ms) => new Promise((r) => setTimeout(r, ms));
  H.settle = async (ms = 30000) => { const t0 = performance.now(); while (g.player.teleporting && performance.now() - t0 < ms) { H.step(10); await H.wait(30); } H.step(20); };
  H.standAt = (x, z, heading = 0) => {
    const p = g.player;
    p.landing = null; p.ashore = null; p.swim = null; p.speed = 0; p.yawRate = 0; p.mode = 'walk';
    if (!p.carry || !p.carry.drop) p.carry = { trail: null, drop: { x: p.x, z: p.z, heading: p.heading }, hitCooldown: 0, from: null, choice: false };
    p.x = x; p.z = z; p.heading = heading;
    p.foot = { y: p.groundAt(x, z), vy: 0, air: false, t: 0, land: 0, near: null };
    p.placeOnGround();
  };
  H.face = (q, d) => { const p = g.player, a = Math.atan2(p.z - q.z, p.x - q.x), x = q.x + Math.cos(a) * d, z = q.z + Math.sin(a) * d; H.standAt(x, z, Math.atan2(-(q.z - z), q.x - x)); };
  H.esc = () => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', key: 'Escape', bubbles: true }));
  H.d = () => g.npcs.dialogue;
  H.open = () => { const o = g.outfitter; if (o.open) o.hide(); o.openHot('counter', o.visit.landing); H.step(4); return H.d().talking; };
  // open the talk (when shut) and answer the first choice until a line matches re (→ the line) or the talk ends (→ null)
  H.talkTo = async (re) => {
    const d = H.d();
    if (!d.convo) H.open();
    for (let i = 0; i < 24 && d.convo; i++) {
      const say = d.convo.node && d.convo.node.say;
      if (say && re.test(say)) return say;
      d.choose(0); H.step(2); await H.wait(30);
      if (g.starter.pending) await g.starter.pending;
    }
    return null;
  };
  H.shut = () => { if (H.d().convo) { H.esc(); H.step(6); } if (g.outfitter.open) g.outfitter.hide(); H.step(4); };
  H.cur = () => { g.guide.sync(); const c = g.guide.current(); return c ? { id: c.id, title: c.title, next: c.next, tutorial: c.tutorial } : null; };
  H.ids = () => { g.guide.sync(); return g.guide.list().map((e) => e.id); };
  H.gem = (id) => g.locator.shown().find((q) => q.id === id && !q.gone) || null;
  H.off = (id) => { const e = g.guide.get(id), r = e && g.guide.reach(e), gm = H.gem(id); return r && gm ? +Math.hypot(gm.x - r.pos.x, gm.z - r.pos.z).toFixed(3) : null; };
  H.kit = () => { const inv = g.profile.inventory, r = { containers: [], items: [], long: inv.long.map((l) => l.id) }; for (const c of inv.containers) { if (!/^(crate|pockets|inhand|hand)/.test(c.item)) r.containers.push(`${c.item}@${c.where}`); for (const e of c.grid) if (!e.box) r.items.push(e.id); } return r; };
  // every card the tracker draws (mode, head, id), in order
  const draw = g.tracker.draw.bind(g.tracker);
  g.tracker.draw = (card, hold) => { if (card && card.e) { const l = H.cards[H.cards.length - 1], k = `${card.mode}|${card.head}|${card.e.id}`; if (!l || l.k !== k) H.cards.push({ k, mode: card.mode, head: card.head, id: card.e.id, next: card.e.next }); } return draw(card, hold); };
  H.seq = () => H.cards.map((c) => `${c.mode}:${c.head}:${c.id}`);
  const note = g.hud.note.bind(g.hud);
  g.hud.note = (t, ...a) => { H.notes.push(String(t)); return note(t, ...a); };
  const bark = g.npcs.dialogue.bark.bind(g.npcs.dialogue);
  g.npcs.dialogue.bark = (sp, text, o) => { H.barks.push({ who: sp && sp.name, text: String(text) }); return bark(sp, text, o); };
  const P = g.outfitter.people;
  if (P && typeof P.keeperSays === 'function') { const ks = P.keeperSays.bind(P); P.keeperSays = (ep, words, kind) => { H.keeper.push({ ep, words, kind }); return ks(ep, words, kind); }; }
  return true;
};

const browser = await chromium.launch({ executablePath: findChrome(), args: ['--use-angle=metal', '--ignore-gpu-blocklist'] });
const errors = [];
const boot = async (page) => {
  page.on('pageerror', (e) => { errors.push(e.message); log('pageerror', e.message); });
  page.on('console', (m) => { if (m.type() === 'error') log('console', m.text().slice(0, 300)); });
  await page.goto(APP, { timeout: 180000 });
  await page.waitForFunction(() => { const g = window.__game; return g && g.title && g.guide && g.tracker && g.locator && g.onboarding && g.journal && g.starter && typeof g.step === 'function' && g.title.state === 'title'; }, null, { timeout: 300000, polling: 500 });
  await page.evaluate(HELPERS);
};
const newSeason = async (page) => {
  await page.evaluate(() => window.__game.title.askNewSeason('adventure'));
  await until(page, () => !document.getElementById('entry-card').hidden && document.querySelectorAll('.startmap .pin').length > 0);
  await page.waitForTimeout(400);
  await page.click(`.startmap .pin[data-ep="${HOME}"]`);
  await page.evaluate(() => { const w = window.__game.title.wizard; w.setDate(191); w.next(); });
  await page.click('#btn-start');
  await until(page, () => { const g = window.__game; return g.title.state === 'game' && !g.player.teleporting && !!g.outfitter.visit; }, null, 180000);
  await page.evaluate(() => { const g = window.__game, H = window.__rp; H.step(30); const o = g.outfitter; if (o.open) o.hide(); g.day.setClock(g.day.year, g.day.doy, 9); const L = o.layout(g.profile.home), at = L.counter || L.centre; H.standAt(at.x + 0.5, at.z + 0.5); H.step(30); });
};

try {
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  await boot(page);
  await newSeason(page);
  log('season', JSON.stringify(await page.evaluate(() => ({ home: window.__game.profile.home, cur: window.__rp.cur() }))));

  // [slot:arrive]
  // [slot:season-line]
  // [slot:pack-tab]
  // swim (playtests 1 and 2, major): before the staff talk, swimming at the empty berth names no canoe and E climbs
  // into nothing (player.js read carry.drop with no onboarding gate)
  const sw = await page.evaluate(async () => {
    const g = window.__game, H = window.__rp, p = g.player, d = p.carry && p.carry.drop;
    if (!d) return { none: true };
    const back = { x: p.x, z: p.z };
    H.standAt(d.x + 1.2, d.z + 0.6); p.enterSwim(); H.step(10);
    const prompt = p.prompt ? p.prompt.text : '', inn = p.swimIn(); H.step(4);
    const mode = p.mode, noCanoe = g.onboarding.noCanoe;
    H.standAt(back.x, back.z); H.step(10);
    return { prompt, inn, mode, noCanoe, step: g.onboarding.state.step };
  });
  result('swim: at the empty berth before the talk, no canoe named and none to climb into', !sw.none && sw.noCanoe && !/canoe/i.test(sw.prompt) && sw.inn === false && sw.mode === 'swim' && sw.step !== 'gear', sw);

  // coop (playtest 2, major 2): before the loan the host's canoe is neither published to friends (the pose's d, the
  // share's cn) nor given in a swap (coop-boat describe)
  const cp = await page.evaluate(async () => {
    const g = window.__game, c = g.coop;
    if (!c) return { none: true };
    let pose = null, cn = 'none', desc = 'none';
    try { pose = c.poseMsg(); } catch (e) { pose = { err: String(e) }; }
    try { const sh = g.coopShare; const pub = sh && typeof sh.pubNow === 'function' ? sh.pubNow() : null; cn = pub ? pub.cn : 'no pub'; } catch (e) { cn = String(e); }
    try { desc = c.boat && typeof c.boat.describe === 'function' ? c.boat.describe(false) : 'no boat'; } catch (e) { desc = String(e); }
    return { noCanoe: g.onboarding.noCanoe, d: pose && pose.d, cn, desc };
  });
  result('coop: no canoe published or given before the loan', !cp.none && cp.noCanoe && cp.d === undefined && (cp.cn === null || cp.cn === 'no pub') && (cp.desc === null || cp.desc === 'no boat'), cp);

  // name (playtests 1 and 2 minor: "Talk to Shelby" turned into "Talk to the summer help" out of the yard): the step
  // keeps the staffer's name when the staffer is not standing (out on the lake, past the yard)
  const nm = await page.evaluate(async () => {
    const g = window.__game, H = window.__rp, ob = g.onboarding, ep = g.profile.home;
    const inside = H.cur();
    ob.dismiss(); g.guide.sync();
    const away = { title: g.guide.get('story:onboard:talk').title, next: g.guide.get('story:onboard:talk').next };
    H.step(10);
    return { inside, away, name: ob.staffName(ep) };
  });
  result('name: the staffer\'s name stays in the step with the staffer out of sight', nm.inside && nm.inside.title === `Talk to ${nm.name}` && nm.away.title === `Talk to ${nm.name}` && nm.away.next.includes(nm.name), nm);

  // bye (playtest 1 minor 8): escaping at the talk's first line, before the offer, the farewell does not name the shelf
  // in the back the player never heard of; the locator stays on the staffer and the tracker says "Talk to <name>"
  const by = await page.evaluate(async () => {
    const g = window.__game, H = window.__rp;
    H.barks.length = 0;
    const at = await H.talkTo(/^Starting the season\?/);
    H.shut(); H.step(30);
    const cur = H.cur();
    return { at: !!at, barks: H.barks.map((b) => b.text), cur, main: (g.locator.shown().find((q) => q.main) || {}).id, tr: g.tracker.state() };
  });
  result('bye: an Esc at the first line says no shelf you never heard of; the gem and the card stay on the staffer',
    by.at && !by.barks.some((t) => /Shelf in the back/.test(t)) && by.barks.some((t) => /counter/.test(t)) && by.cur && by.cur.id === 'story:onboard:talk' && by.main === 'story:onboard:talk' && by.tr.shown && /^Talk to .+ at the counter\.$/.test(by.tr.next), by);

  // gear-esc (playtest 2 major 3, playtests 1 and 3 on the gems): the gear taken and the talk escaped at the canoe line:
  // the staffer stays the step and the only story gem; no food, leeches or canoe step (entry, gem or card) until the
  // keeper's word is done
  const ge = await page.evaluate(async () => {
    const g = window.__game, H = window.__rp;
    const at = await H.talkTo(/one of our canoes at the dock/);
    H.shut(); H.step(60);
    const ids = H.ids(), story = ids.filter((id) => /^story:/.test(id));
    const gems = g.locator.shown().map((q) => q.id);
    return { at: !!at, step: g.onboarding.state.step, story, gems, cur: H.cur(), tr: g.tracker.state(), hull: g.player.canoe.hull.visible };
  });
  result('gear-esc: an Esc after the gear keeps the staffer the only step and gem; nothing points at the shelves or canoe yet',
    ge.at && ge.step === 'gear' && ge.story.length === 1 && ge.story[0] === 'story:onboard:talk' && !ge.gems.some((id) => /onboard:(food|leeches|canoe)/.test(id)) && ge.cur && /^Finish talking to .+ at the counter\.$/.test(ge.cur.next) && ge.tr.shown && ge.tr.id === 'story:onboard:talk' && ge.hull === true, ge);

  // keeper-role (playtests 1, 2 and 3 minor: "Ruth Aho · the summer help"): the keeper's line in the staffer's talk
  // carries the keeper's name and not the staffer's role
  const kr = await page.evaluate(async () => {
    const g = window.__game, H = window.__rp, ep = g.profile.home, keeper = g.outfitter.shop.keeperName(ep);
    const at = await H.talkTo(/first permit|map of these lakes/);
    const panel = H.d().panel, name = (panel.querySelector('.head .name') || {}).textContent || '', role = (panel.querySelector('.head .role') || {}).textContent || '';
    H.shut();
    return { at: !!at, keeper, name, role };
  });
  result('keeper-role: the keeper\'s line is headed with the keeper\'s name, not "the summer help"', kr.at && kr.name === kr.keeper && !/summer help/.test(kr.role), kr);


  // starter (playtest 1, major 1): the keeper's first-night suggestion escaped before any answer is made again, and the
  // job can still be taken (starter.js wrote offered as the line was built, so available() was false from then on)
  const st = await page.evaluate(async () => {
    const g = window.__game, H = window.__rp, home = g.profile.home;
    const first = await H.talkTo(/^First night out\?/);
    H.shut();
    const mid = { talking: H.d().talking, avail: g.starter.available(home), done: g.onboarding.state.done, active: g.tasks.active.filter((t) => t.kind === 'starter').length };
    const again = await H.talkTo(/^First night out\?/);
    const job = await H.talkTo(/look over the grate/);
    H.cards.length = 0;
    const d = H.d(); if (d.convo) { d.choose(0); H.step(2); await H.wait(30); } // I'll do that
    if (g.starter.pending) await g.starter.pending;
    await H.talkTo(/^$/); // (on to the talk's end)
    if (g.outfitter.open) g.outfitter.hide();
    H.step(250);
    return { first: !!first, mid, again: !!again, job: !!job, done: g.onboarding.state.done, avail: g.starter.available(home), active: g.tasks.active.filter((t) => t.kind === 'starter').map((t) => t.id) };
  });
  result('starter: the first-night suggestion escaped is made again, and its job taken', st.first && !st.mid.talking && st.mid.avail && !st.mid.done && st.mid.active === 0 && st.again && st.job && st.done && !st.avail && st.active.length === 1, st);

  // tracker-first (playtest 1 minor 4): as the talk ends, the first card a new player reads is the tutorial's next step
  // (food), and the starter job's "New task" comes after it (cards recorded from the job's yes to 250 frames on)
  const tf = await page.evaluate(() => {
    const H = window.__rp, seq = H.seq();
    const iFood = seq.findIndex((s) => s === 'tutorial:Next:story:onboard:food'), iJob = seq.findIndex((s) => /^event:New task:task:/.test(s));
    return { seq, iFood, iJob };
  });
  result('tracker-first: the talk\'s end says "Next: Buy food" first, then the job\'s "New task"', tf.iFood >= 0 && tf.iJob > tf.iFood && !tf.seq.slice(0, tf.iFood).some((s) => /^event:/.test(s) && !/talk$/.test(s)), tf);

  // marks-one (playtests 1, 2 and 3: three gold gems at once): with food the step, only the food shelf has a story gem
  // (the leeches and the canoe get theirs in their turn), standing between the shelves
  const mk = await page.evaluate(async () => {
    const g = window.__game, H = window.__rp, cur = H.cur();
    const e = cur && g.guide.get(cur.id), r = e && g.guide.reach(e);
    if (r) { H.face(r.pos, 3); H.step(60); }
    const marks = g.guide.marks().map((m) => m.id), gems = g.locator.shown().filter((q) => !q.gone).map((q) => q.id);
    return { cur: cur && cur.id, marks, gems, open: H.ids().filter((id) => /^story:onboard:/.test(id)) };
  });
  result('marks-one: one story gem, over the step\'s place (no gem yet on the leeches or the canoe)',
    mk.cur === 'story:onboard:food' && mk.open.includes('story:onboard:leeches') && mk.marks.filter((id) => /^story:/.test(id)).join() === 'story:onboard:food' && mk.gems.filter((id) => /^story:/.test(id)).join() === 'story:onboard:food', mk);

  // gem-depth (playtest 3 major 2, playtest 1 minor 11: the gem hidden behind your own hat, the lamp shade): close to the
  // camera the gem is drawn over the near things (depthTest off), with no new shader program
  const gd = await page.evaluate(async () => {
    const g = window.__game, H = window.__rp, R = g.renderer || (g.quality && g.quality.renderer) || null;
    const p0 = R && R.info && R.info.programs ? R.info.programs.length : null;
    const e = g.guide.get('story:onboard:food'), r = e && g.guide.reach(e);
    if (r) { H.face(r.pos, 3); H.step(30); }
    const near = H.gem('story:onboard:food');
    const p1 = R && R.info && R.info.programs ? R.info.programs.length : null;
    return { near, p0, p1 };
  });
  result('gem-depth: the near gem is drawn over what stands in front of it (r3-locator-test counts the programs)', gd.near && gd.near.xray === true, gd); // (the program count: r3-locator-test's own check)

  // money (playtest 2 major 4: broke before food, a dead end): with less money than a meal the food step says what is
  // missing, the money, and where paid work is, not "Buy food"
  const mo = await page.evaluate(async () => {
    const g = window.__game, H = window.__rp, pr = g.profile, m0 = Math.floor(pr.money);
    pr.spend(m0 - 1, 'r3 replay test'); H.step(10);
    const broke = H.cur();
    pr.earn(m0 - 1, 'r3 replay test'); H.step(10);
    return { m0, broke, back: H.cur(), money: pr.money };
  });
  result('money: broke before food, the step says the money is short and where paid work is', mo.broke && mo.broke.id === 'story:onboard:food' && /\$1\b/.test(mo.broke.next) && /board/.test(mo.broke.next) && mo.back && /^Buy food at the provisions shelf\.$/.test(mo.back.next) && mo.money === mo.m0, mo);

  // food-two (playtest 1 minor 9: one $3 oatmeal finished "Buy food"): one meal leaves the step open with the second
  // meal as what is missing; a supper and a breakfast close it
  const ft = await page.evaluate(async () => {
    const g = window.__game, H = window.__rp, S = g.outfitter.shop, ep = g.profile.home;
    const a = S.buyItem('meal:breakfast', ep); H.step(10);
    const one = H.cur();
    const b = S.buyItem('meal:supper', ep); H.step(10);
    return { a: a.ok, b: b.ok, one, two: H.cur(), path: { ...g.onboarding.state.path } };
  });
  result('food-two: one meal keeps the step open ("one meal so far"); a second closes it', ft.a && ft.b && ft.one && ft.one.id === 'story:onboard:food' && /^One meal so far/.test(ft.one.next) && ft.two && ft.two.id === 'story:onboard:leeches' && ft.path.food, ft);

  // titles (playtest 3 minor 9: "Buy food" / "Buy food at the provisions shelf." / "The provisions shelf"): a story
  // step's journal page says its words once: a title of its own, the next line, and no place line the next line names
  const tl = await page.evaluate(async () => {
    const g = window.__game, H = window.__rp, cur = H.cur(), J = g.journal;
    J.showTask(cur && cur.id); H.step(4); await H.wait(80);
    const q = (s) => { const n = document.querySelector(`#journal ${s}`); return n ? n.textContent.trim() : null; };
    const r = { cur, title: q('.pp-qtitle'), next: q('.pp-qnext'), where: q('.pp-qwhere') };
    J.close(); H.step(4);
    return r;
  });
  const bare = (s) => String(s || '').toLowerCase().replace(/[.]/g, '');
  result('titles: the step\'s page says each thing once (title not the next line, no place line it already names)',
    tl.cur && tl.cur.id === 'story:onboard:leeches' && tl.title && tl.next && !bare(tl.next).startsWith(bare(tl.title)) && tl.where === null, tl);

  // bark-tracker (playtests 1 minor 11 and 3 minor 4): a bark pinned to the left edge never lies across the tracker card
  const bt = await page.evaluate(async () => {
    const g = window.__game, H = window.__rp, d = H.d(), cam = g.camera, p = g.player;
    H.step(10);
    const tr = document.getElementById('tracker'), on = tr.classList.contains('on'), r = tr.getBoundingClientRect();
    // a voice behind you on the left: pinned to the left edge (dialogue.js layout)
    cam.updateMatrixWorld();
    const at = new g.THREE.Vector3(-4, -0.2, 1.5).applyMatrix4(cam.matrixWorld); // (camera space: left of you and behind)
    const sp = { key: 'rp:voice', name: 'A voice', role: '', pos: (out) => out.copy(at) };
    d.bark(sp, 'Lovely morning for it, isn’t it? The loons were at it all night out past the point.', { pri: 9, secs: 6 });
    H.step(6); await H.wait(60);
    const b = (d.on || []).find((x) => x.sp && x.sp.key === 'rp:voice');
    const w = b && b.where, box = b && b.el ? b.el.firstElementChild.getBoundingClientRect() : null;
    const hit = !!(box && on && box.left < r.right && box.right > r.left && box.top < r.bottom && box.bottom > r.top);
    return { on, tr: r.toJSON(), where: w, box: box && box.toJSON(), hit };
  });
  result('bark-tracker: a bark pinned left keeps clear of the tracker card', bt.on && bt.where && !bt.hit, bt);

  // ticket-words (playtest 3 minor 10): the card's heads read alike ("New task", no colon), and a ticket's line does not
  // say "(I)" over the card's own "I for your journal"; the ticket's gem is over the counter
  const tw = await page.evaluate(async () => {
    const g = window.__game, H = window.__rp, P = g.permits, ep = g.profile.home, o = g.outfitter;
    const L = o.layout(ep), at = L.counter || L.centre;
    H.standAt(at.x + 0.6, at.z + 0.6); H.step(30);
    H.cards.length = 0;
    P.fine('dayuse'); P.issue(); g.guide.sync();
    let st = null;
    for (let k = 0; k < 80; k++) { H.step(3); const s = g.tracker.state(); if (s.shown && /^ticket:/.test(s.id || '')) { st = s; break; } }
    const t = g.guide.list().find((e) => e.kind === 'ticket');
    return { st, next: t && t.next, gem: t ? !!H.gem(t.id) : false, off: t ? H.off(t.id) : null };
  });
  result('ticket-words: "New task" with no colon, no "(I)" in the ticket\'s line, the gem over the counter',
    tw.st && /^New task /.test(tw.st.text) && !/New task:/.test(tw.st.text) && tw.next && !/\(I\)/.test(tw.next) && (tw.st.text.match(/journal/g) || []).length <= 2 && tw.gem && tw.off < 0.6, tw);

  // journal-more (playtest 3 minor 8): at 1280×720 a Tasks list longer than the page fades at its foot ("more") while
  // there is more below, and not once scrolled to the end
  await page.setViewportSize({ width: 1280, height: 720 });
  const jm = await page.evaluate(async () => {
    const g = window.__game, H = window.__rp, J = g.journal;
    for (let i = 0; i < 6; i++) g.guide.add({ id: `side:rp:${i}`, kind: 'side', title: `A side story ${i + 1}`, next: 'Ask at the counter' });
    J.showTask(null); H.step(4); await H.wait(120);
    const n = document.querySelector('#journal .pp-index'), r = { sh: n.scrollHeight, ch: n.clientHeight, more: n.classList.contains('more'), mask: getComputedStyle(n).maskImage || getComputedStyle(n).webkitMaskImage };
    n.scrollTop = n.scrollHeight; n.dispatchEvent(new Event('scroll')); await H.wait(60);
    r.end = n.classList.contains('more');
    J.close(); H.step(4);
    for (let i = 0; i < 6; i++) g.guide.remove(`side:rp:${i}`);
    return r;
  });
  await page.setViewportSize({ width: 1280, height: 800 });
  result('journal-more: a long Tasks list fades at its foot while there is more below', jm.sh > jm.ch + 4 && jm.more && /gradient/.test(jm.mask || '') && !jm.end, jm);

  // fish-next (playtest 3 minor 7): a catch notice not caught yet says what to do ("Catch one, then bring it to the
  // board at …"), not "Not caught yet · it goes to …"
  const fn = await page.evaluate(async () => {
    const g = window.__game, T = g.tasks, home = g.profile.home;
    let t = null;
    try { t = await T.makeKind('fish', home, 'local'); } catch (e) { return { err: String(e) }; }
    if (!t) return { none: true };
    const next = g.guide.taskNext(T, { ...t, status: 'open' });
    return { title: t.title, next };
  });
  result('fish-next: a catch notice\'s next line is an instruction', fn.none || (fn.next && /^Catch (one|them), then bring (it|them) to the board/.test(fn.next) && !/Not caught/.test(fn.next)), fn);

  // tutorial-end (playtest 3 minor 11): leeches bought, then in the canoe at the dock: the tutorial over, the tracker says
  // what is next once (the first night's job: "Paddle to …"), then goes
  const te = await page.evaluate(async () => {
    const g = window.__game, H = window.__rp, S = g.outfitter.shop, ep = g.profile.home, p = g.player;
    const lee = S.buyItem('leeches', ep); H.step(10);
    const canoeStep = H.cur();
    H.cards.length = 0;
    g.packs.getIn(p.carry.drop); for (let i = 0; i < 40 && p.mode !== 'paddle'; i++) { H.step(5); await H.wait(20); }
    H.step(40);
    const mid = g.tracker.state();
    H.step(300);
    return { lee: lee.ok, canoeStep, mode: p.mode, seq: H.seq(), mid, after: g.tracker.state(), cur: H.cur() };
  });
  result('tutorial-end: in the canoe the tutorial ends and the tracker says the job\'s next line once',
    te.lee && te.canoeStep && te.canoeStep.id === 'story:onboard:canoe' && te.mode === 'paddle' && te.seq.some((s) => /^event:Next:task:/.test(s)) && te.mid.shown && /^Paddle to /.test(te.mid.next || '') && !te.after.shown && !(te.cur && /^story:onboard/.test(te.cur.id)), te);

  // latrine (playtests 1 minor 5 and 3 minor 12): at the starter site, the grate checked: the latrine's gem shows at full
  // anywhere on the site, and the tracker says "Next: Look over the latrine" (the "Close by" card never shows a line that
  // changed under it)
  const lt = await page.evaluate(async () => {
    const g = window.__game, H = window.__rp, home = g.profile.home;
    const t = g.tasks.active.find((x) => x.kind === 'starter' && x.from === home);
    if (!t) return { none: true };
    const id = `task:${t.id}`, s = g.starter.route(home).siteRec, A = s.access;
    await g.player.teleport(A && A.landing ? A.landing[0] : s.x, A && A.landing ? A.landing[1] : s.z); await H.settle();
    for (let k = 0; k < 80 && !s.layout; k++) { H.step(10); await H.wait(80); }
    H.step(20); g.guide.sync();
    let e = g.guide.get(id), r = e && g.guide.reach(e);
    if (r) { H.face(r.pos, 3); H.step(60); }
    const grateKey = e && e.target && e.target.key;
    H.cards.length = 0;
    t.checks = { ...(t.checks || {}), grate: true }; g.guide.sync(); H.step(30);
    e = g.guide.get(id); r = e && g.guide.reach(e);
    const parts = g.guide.partsOf(t), lat = parts && parts.latrine;
    return { id, grateKey, key: e && e.target && e.target.key, next: e && e.next, fade: r && r.fade, d: r && Math.round(r.d), latD: lat ? Math.round(Math.hypot(lat.x - g.player.x, lat.z - g.player.z)) : null, gem: H.gem(id), seq: H.seq(), tr: g.tracker.state() };
  });
  if (lt.none) result('latrine (no starter job on this home: skipped)', true, lt);
  else result('latrine: the grate checked, the latrine\'s gem at full on the site and the tracker "Next: Look over the latrine"',
    /grate/.test(lt.grateKey || '') && /latrine/.test(lt.key || '') && /latrine/.test(lt.next || '') && lt.fade === 1 && lt.gem && lt.gem.opacity > 0.9 && lt.seq.includes(`event:Next:${lt.id}`) && lt.tr.shown && /latrine/.test(lt.tr.next || ''), lt);

  // leave-early (playtest 2 major 3): a second season: the gear taken, the talk escaped, then paddled away from the
  // landing: the keeper's part is done for you (the first permit), so no day-use ticket waits
  const page2 = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  await boot(page2);
  await newSeason(page2);
  const le = await page2.evaluate(async () => {
    const g = window.__game, H = window.__rp, p = g.player, ep = g.profile.home;
    await H.talkTo(/one of our canoes at the dock/); H.shut();
    const before = { step: g.onboarding.state.step, done: g.onboarding.state.done };
    g.packs.getIn(p.carry.drop); for (let i = 0; i < 40 && p.mode !== 'paddle'; i++) { H.step(5); await H.wait(20); }
    H.step(30);
    const atDock = { mode: p.mode, done: g.onboarding.state.done };
    const r = g.starter.route(ep), way = r && r.way, q = way ? way[Math.min(way.length - 1, Math.max(1, Math.floor(way.length / 3)))] : null;
    const L = g.outfitter.landing(ep);
    if (q) { p.x = q[0]; p.z = q[1]; } else { p.x = L.x + 120; }
    H.step(30);
    const P = g.permits, today = P && typeof P.held === 'function' ? P.held() : null;
    return { before, atDock, far: Math.round(Math.hypot(p.x - L.x, p.z - L.z)), mode: p.mode, done: g.onboarding.state.done, permit: g.onboarding.state.permit != null, notes: H.notes.slice(-4), cur: H.cur(), today: today && (Array.isArray(today) ? today.length : true) };
  });
  result('leave-early: the talk left after the gear and paddled off: the keeper\'s part is done (the first permit), with a word',
    le.before.step === 'gear' && !le.before.done && le.atDock.mode === 'paddle' && !le.atDock.done && le.far >= 80 && le.done && le.permit && le.notes.some((n) => /first permit/.test(n)) && !(le.cur && le.cur.id === 'story:onboard:talk'), le);


  result('no page errors', errors.length === 0, { errors: errors.slice(0, 5) });
} catch (e) {
  result('the run', false, { error: String(e && e.stack || e).slice(0, 1500) });
} finally {
  await browser.close();
  const pass = results.filter((r) => r.pass).length;
  log(`${pass}/${results.length} passed`);
  process.exit(pass === results.length ? 0 : 1);
}
