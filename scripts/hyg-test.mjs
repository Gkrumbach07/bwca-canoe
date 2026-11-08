// Story Round 0, stream H (hygiene, docs/story/90-game-needs.md section 12), headless. No STORY_ON: these ship to main.
//   npx vite --port 5405 --strictPort &   then   APP=http://localhost:5405 node scripts/hyg-test.mjs
// 1  The summer help is Josie at every home (onboarding.staffName), her name reserved (no one else is given it), drawn
//    as a woman (npcs FEMALE), and the onboarding's staffer stands as Josie at a home on a new season.
// 2  No random pool holds Walt, June, Toivo or Dale (first names, RELS, OLD_NAMES, the keepers' FIRST) or Niemi, Saari,
//    Pekkala, Hautala, Mattila or Novak (any surname, a generated keeper's); none holds Josie or Oskar.
// 3  The hand keepers: Ruth's brother Oskar (talk and the cedar minnow), 6 Joanne Kauppi, 16 Leon Kastelic, 40 Merle
//    Ostrom; Leif, Eino, Perko, Zupancic and Dale Ostrom gone from src/.
// 4  Gus (Moose Lake 25): "Ran the tow boat on Sag thirty years. American Point and back." and "My wife ran our old
//    store. Now I run this one. Badly."; the old lines gone; his Prairie topic stays; both lines pass the grounding.
import { launch, openGame, seasonAt, log, APP } from './gl-e-lib.mjs';

const results = [];
const check = (name, pass, more = {}) => { results.push({ name, pass: !!pass }); log(pass ? 'PASS' : 'FAIL', name, JSON.stringify(more).slice(0, 1200)); };

const NO_FIRST = ['Walt', 'June', 'Toivo', 'Dale', 'Josie', 'Oskar'];
const NO_LAST = ['Niemi', 'Saari', 'Pekkala', 'Hautala', 'Mattila', 'Novak'];
const GONE = /\b(Leif|Eino|Perko|Zupancic|Dale Ostrom)\b/;
const SRC = ['outfitters.js', 'talk-keepers.js', 'items.js', 'shop.js', 'uniques.js', 'tasks.js', 'npcs.js', 'onboarding.js', 'parties.js', 'talk-rumours.js', 'rides.js', 'guide.js'];
const GUS_NEW = ['Ran the tow boat on Sag thirty years. American Point and back.', 'My wife ran our old store. Now I run this one. Badly.'];
const GUS_OLD = ['Ran the tow boat thirty years. Moose, Newfound, Sucker, up to Prairie Portage and back.', 'My wife ran the store. Now I do. Badly.'];

const browser = await launch();
try {
  const page = await openGame(browser);
  log('game loaded at', APP);

  const r = await page.evaluate(async ({ NF, NL, SRC, GONE, GUS_NEW, GUS_OLD }) => {
    const g = window.__game, N = g.npcs, ob = g.onboarding;
    const O = await import('/src/onboarding.js'), K = await import('/src/talk-keepers.js');
    // 1
    const eps = g.world.entryPoints.map((e) => e.ep), staff = new Set(eps.map((ep) => ob.staffName(ep)));
    const reserved = N.names.reserved.has('Josie');
    // 2
    const bad = [];
    for (const [k, l] of Object.entries(N.nameLists())) for (const n of l) if (NF.includes(n) || NL.includes(n)) bad.push(`${k}: ${n}`);
    for (const [rel, , names] of K.RELS) for (const n of names) if (NF.includes(n)) bad.push(`RELS ${rel}: ${n}`);
    const keepers = {};
    for (const ep of eps) {
      const op = g.outfitterProfile(ep); if (!op) continue; keepers[ep] = op.keeper.name;
      const w = String(op.keeper.name).split(/\s+/);
      if (NF.includes(w[0]) || w.slice(1).some((s) => NL.includes(s))) bad.push(`keeper ${ep}: ${op.keeper.name}`);
    }
    // the generated keepers' pools as the source has them (outfitters.js FIRST, LAST: not exported)
    const srcO = await (await fetch('/src/outfitters.js')).text();
    const list = (name) => { const m = new RegExp(`const ${name} = \\[([^\\]]*)\\]`).exec(srcO); return m ? m[1].match(/'[^']+'/g).map((s) => s.slice(1, -1)) : null; };
    const FIRST = list('FIRST'), LAST = list('LAST');
    for (const n of FIRST || []) if (NF.includes(n)) bad.push(`FIRST: ${n}`);
    for (const n of LAST || []) if (NL.includes(n)) bad.push(`LAST: ${n}`);
    // 3
    const src = {};
    for (const f of SRC) { const t = await (await fetch(`/src/${f}`)).text(), m = t.match(new RegExp(GONE, 'g')); if (m) src[f] = [...new Set(m)]; }
    const ruth = JSON.stringify(K.HAND[30] || {}), minnow = g.items.itemDef('lure:cedarminnow');
    // 4
    const gus = K.HAND[25] || {}, past = gus.past || [];
    const prairie = (gus.topics || []).some((t) => t.id === 'prairie');
    const G = g.grounding || (N && N.grounding) || null;
    const grounded = GUS_NEW.map((t) => (typeof N.grounded === 'function' ? N.grounded(t) : G && typeof G.ok === 'function' ? G.ok(t, {}) : null));
    return {
      staff: [...staff], staffList: O.STAFF, reserved,
      bad, pools: { first: FIRST && FIRST.length, last: LAST && LAST.length },
      k6: keepers[6], k16: keepers[16], k40: keepers[40], src, ruthOskar: /Oskar/.test(ruth), ruthEino: /Eino|Leif/.test(ruth), minnow: minnow && minnow.name,
      past, gusNew: GUS_NEW.every((t) => past.includes(t)), gusOld: GUS_OLD.some((t) => past.includes(t)), prairie, grounded,
    };
  }, { NF: NO_FIRST, NL: NO_LAST, SRC, GONE: GONE.source, GUS_NEW, GUS_OLD });

  check('1a the summer help is Josie at every home', r.staff.length === 1 && r.staff[0] === 'Josie' && r.staffList.length === 1, { staff: r.staff, STAFF: r.staffList });
  check('1b Josie is reserved (no generated person takes her name)', r.reserved, { reserved: r.reserved });
  check('2 no random pool or generated keeper holds a reserved story name', !r.bad.length && r.pools.first > 40 && r.pools.last > 40, { bad: r.bad, pools: r.pools });
  check('3a Ruth\'s brother is Oskar, and the lure is Oskar\'s cedar minnow', r.ruthOskar && !r.ruthEino && /^Oskar/.test(r.minnow || ''), { minnow: r.minnow });
  check('3b the hand keepers renamed: 6 Joanne Kauppi, 16 Leon Kastelic, 40 Merle Ostrom', r.k6 === 'Joanne Kauppi' && r.k16 === 'Leon Kastelic' && r.k40 === 'Merle Ostrom', { k6: r.k6, k16: r.k16, k40: r.k40 });
  check('3c the old names are gone from src/', !Object.keys(r.src).length, r.src);
  check('4a Gus\'s past: the Sag tow and "our old store"; the old lines gone; the Prairie topic kept', r.gusNew && !r.gusOld && r.prairie, { past: r.past });
  check('4b both new lines pass the grounding', r.grounded.every((x) => x !== false), { grounded: r.grounded });

  // 1c the staffer on a new season at a home (Moose Lake 25): the figure the onboarding stands is Josie
  await seasonAt(page, { ep: 25, year: 2026, doy: 192, hours: 10, mode: 'sandbox' });
  const s = await page.evaluate(() => {
    const g = window.__game, ob = g.onboarding, h = ob.stand(25), sp = ob.speaker(25);
    const L = g.props.storeLayout(25), P = L ? g.npcs.extraPeople(25, L, [{ key: 'staffer:25', name: 'Josie', spot: 'counterEnd' }])[0] : null, fig = P && P.figs[0];
    const out = { stood: !!h, name: sp && sp.name, staffName: ob.staffName(25), fig: !!fig, female: !!(fig && fig.look && fig.look.beard === fig.look.skin && fig.look.wear.scale < 0.98) };
    ob.dismiss();
    return out;
  });
  check('1c the staffer the onboarding stands at a home speaks as Josie', s.staffName === 'Josie' && (!s.stood || s.name === 'Josie'), s);
  check('1d Josie is drawn as a woman (no beard, a woman\'s height)', s.female, s);
} finally {
  await browser.close();
}
const failed = results.filter((x) => !x.pass);
log(`${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
