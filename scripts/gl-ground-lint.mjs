// Stream E (gl-e): the grounding lint. Every line the people at five outfitters could say (npcs.js lintLines: the
// keeper's hellos, goodbyes, word on the water, advice and past; the locals' remarks, openers, hints and lore; the
// parties' own trip and lore), and the parties' camp greetings and trip words round them, on every day of a season (May 1
// to November 30) at three hours (07:00, 13:00, 19:30), checked against the brief's rules, written here apart from
// grounding.js so the one checks the other:
//   no fish advice on ice · no bugs out of their season · no snow without snow · no picture (or anything but paddles
//   and jackets) on the wall · weather words fit the hour and the weather
// Then outfitters.js's keeper lines as written (stream B's, read only) are scanned the same way and reported: those the
// people would never say (grounding.js filters them) are listed for B, not failed.
//   npx vite --port 5185 --strictPort &   node scripts/gl-ground-lint.mjs [--eps 25,38,1,64,16] [--step 1]
// (the join: five outfitters with hand-written keepers; Saganaga 55 is a trailhead now, Lise is at East Bearskin 64.
// A season begun at a trailhead begins at its host, so the store the lint reads is the one the walker is in.)
import { launch, openGame, seasonAt, log } from './gl-e-lib.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const EPS = String(arg('eps', '25,38,1,64,16')).split(',').map(Number);
const OFF = process.argv.includes('--off'); // (grounding.js switched off: the lint must then find broken lines)
const STEP = Number(arg('step', 1)), YEAR = 2026, FROM = 121, TO = 334, HOURS = [7, 13, 19.5];

// the lint's own rules (page side, given the day's facts): a list of [id, test(text, D) → true when broken]
const RULES = String.raw`[
  ['fish on ice', (t, D) => D.ice >= 0.5 && /\b(walleyes?|northerns?|pike|lakers?|lake trout|smallmouth|crappies?|perch|jig|spoon|leech(es)?|bobber|crankbait|bit(e|ing)|reefs? at dusk|fish (the|off|are|on) )\b/i.test(t) && !OTHER.test(t)],
  ['bugs out of season', (t, D) => D.bugs < 0.05 && /\b(bugs?|mosquito(e?s)?|skeeters?|black ?fl(y|ies)|no-?see-?ums?|swat)\b/i.test(t) && !/\bbugs are (gone|done|over)\b|\bno bugs\b/i.test(t) && !OTHER.test(t)],
  ['no-bugs in bug season', (t, D) => D.bugs > 0.3 && /\bbugs are (gone|done|over)\b|\bno bugs\b/i.test(t)],
  ['snow without snow', (t, D) => D.snow < 0.1 && !D.snowing && /\b(snow(ing|ed|fall|flakes?|s)?|flurr(y|ies))\b/i.test(t) && !OTHER.test(t)],
  ['on the wall', (t) => { const m = /([\w’']+(?:\s[\w’']+){0,3})\s+on the wall/i.exec(t); return !!m && !/\b(paddles?|pfds?|life ?jackets?|jackets?|vests?)\b/i.test(m[1]); }],
  ['picture', (t) => /\b(picture|photo(graph)?|painting|mounted|antlers)\b[^.]{0,30}\b(wall|over the (door|counter|stove))\b/i.test(t)],
  ['morning out of the morning', (t, D) => /^(good )?morning\b/i.test(t) && D.h >= 12],
  ['afternoon out of the afternoon', (t, D) => /^(good )?afternoon\b/i.test(t) && (D.h < 12 || D.h >= 18)],
  ['evening before evening', (t, D) => /^(good )?evening\b/i.test(t) && D.h < 16],
  ['wet when dry', (t, D) => /^wet one\b|\bwet one (out|eh|today)\b|\bit’?s (raining|pouring)\b/i.test(t) && !D.wet && !D.raining],
  ['fine words in the rain', (t, D) => D.raining && /\b(beautiful|lovely|nice|good) (day|morning) for it\b|\bnice day\b|\bsunshine\b/i.test(t)],
]`;

// st-t (campaign-design §5.4): the story's ambient pools (ambient.js over 70-world-texture), checked in Node before the
// browser: no banned word (cellar, cache, far end, flowage, Gull's east bay, the cans, Eino, alive, Wade); Walt lore only
// after the notebook (its condition carries f:nb.found); "green Kevlar" only with the watchers seen (ev.watchers), a
// canary or a page understood (und:, knows: Norm's 2019 fellas); "the Ledger" only after an ending; no reserved speaker (the cast) in a visitor's pool. Each broken one is a
// BROKEN line of its own, and fails the lint like any other.
const storyBad = [];
{
  const { readFileSync } = await import('node:fs');
  const { Ambient, POOLS, BANNED, WALT_LORE, RESERVED } = await import('../src/ambient.js');
  const w = JSON.parse(readFileSync(new URL('../src/story-data/text/world.json', import.meta.url), 'utf8'));
  const A = new Ambient().use(w);
  let n = 0;
  for (const kind of Object.keys(POOLS)) for (const l of A.all(kind)) {
    n++;
    if (BANNED.test(l.text)) storyBad.push({ id: 'story: banned word', src: l.id, text: l.text });
    if (WALT_LORE.test(l.text) && !/f:nb\.found|stage>=S[1-7]|end:/.test(l.cond)) storyBad.push({ id: 'story: Walt lore before the notebook', src: l.id, text: l.text });
    if (/green Kevlar/i.test(l.text) && !/ev\.watchers|canary|tier|t[1-4]\b|und:|knows/.test(l.cond)) storyBad.push({ id: 'story: green Kevlar unseen', src: l.id, text: l.text });
    if (/\bthe Ledger\b/.test(l.text) && !/end:/.test(l.cond)) storyBad.push({ id: 'story: the Ledger before an ending', src: l.id, text: l.text });
    if (kind === 'bark' && RESERVED.test(l.who || '')) storyBad.push({ id: 'story: a reserved speaker among visitors', src: l.id, text: l.text });
  }
  log(`story ambient pools: ${n} lines, ${storyBad.length} broken`);
}
// /st-t

const browser = await launch();
const report = { checked: 0, lines: 0, bad: [], rawB: new Map() };
try {
  const page = await openGame(browser, { quiet: true });
  for (const ep of EPS) {
    await seasonAt(page, { ep, year: YEAR, doy: 180, hours: 9 });
    const r = await page.evaluate(async ({ ep, YEAR, FROM, TO, STEP, HOURS, RULES, OFF }) => {
      if (OFF) { window.__game.grounding.why = () => []; }
      const g = window.__game, N = g.npcs, P = g.parties, C = g.partyCamps, S = await import('/src/season.js'), B = await import('/src/bugs.js'), { mulberry32 } = await import('/src/rng.js');
      const OTHER = /\bwinters?\b|\b(in|since|back in) ’?['’]?\d\d\b|\blast (year|summer|fall|spring)\b|\bcome (july|june|august|spring|summer|fall)\b|\bused to\b|\bwhen I was\b|\bmy (dad|father)\b|\buntil (july|june)\b|\btill (the end of )?(july|june|august)\b|\babout the middle of\b/i;
      const rules = (0, eval)(RULES.replace(/OTHER/g, 'window.__lintOther'));
      window.__lintOther = OTHER;
      const bad = [], raw = [];
      let checked = 0, lines = 0;
      for (let doy = FROM; doy <= TO; doy += STEP) for (const h of HOURS) {
        g.day.setClock(YEAR, doy, h); g.advance(1 / 30, 1);
        // (the ice: the store's own lake's, its ice-out and ice-in from lake-facts.js, as the world shows it there)
        const at = (g.outfitter.visit && g.outfitter.visit.ep) || ep, e = g.world.entryPoints.find((x) => x.ep === at), own = e && e.lake > 0 && g.lakeFacts ? g.lakeFacts.iceOf(e.lake) : null;
        const se = S.seasonAt(doy), W = g.weather, D = { doy, h, ice: own ? S.seasonAt(doy, own).ice : se.ice, snow: se.snow, snowing: W.precipitation === 'snow', bugs: Math.max(B.mosqSeason(doy), B.flySeason(doy)), wet: W.wetness > 0.35, raining: W.precipitation === 'rain' || /rain|storm/.test(W.state) };
        const said = N.lintLines(at);
        // the parties camped within reach of the store tonight: their greetings and their trip
        const T = P.today, r = mulberry32((doy * 977 + h * 13) >>> 0), camps = P.campsAt(T, h).filter((c) => Math.hypot(c.site.x - g.player.x, c.site.z - g.player.z) < 9000).slice(0, 6);
        for (const c of camps) { for (let k = 0; k < 3; k++) { const t = C.helloLine({ party: c.party, v: true }, r); if (t) said.push({ src: 'camp:hello', text: t }); } for (const x of N.partyLines(c.party, null, T)) said.push({ src: 'camp:trip', text: x.text }); }
        checked++;
        for (const x of said) {
          lines++;
          for (const [id, test] of rules) if (test(x.text, D)) bad.push({ doy, h, id, src: x.src, text: x.text });
        }
        if (h === HOURS[0] && doy % 7 === 0) for (const x of N.lintLines(at, { raw: true })) for (const [id, test] of rules) if (test(x.text, D)) raw.push({ doy, id, src: x.src, text: x.text });
      }
      return { checked, lines, bad: bad.slice(0, 40), nBad: bad.length, raw };
    }, { ep, YEAR, FROM, TO, STEP, HOURS, RULES, OFF });
    log(`ep ${ep}: ${r.checked} moments, ${r.lines} lines, ${r.nBad} broken`);
    report.checked += r.checked; report.lines += r.lines;
    for (const b of r.bad) report.bad.push({ ep, ...b });
    for (const x of r.raw) { const k = `${x.id} · ${x.text}`; if (!report.rawB.has(k)) report.rawB.set(k, { ep, ...x }); }
  }
} catch (e) {
  log('ERROR', e && e.stack ? e.stack : e);
  report.bad.push({ id: 'driver', text: String(e) });
} finally {
  await browser.close();
}
report.bad.push(...storyBad); // st-t
for (const b of report.bad.slice(0, 40)) log('BROKEN', JSON.stringify(b));
if (report.rawB.size) { log(`outfitters.js (stream B's, read only): ${report.rawB.size} keeper lines the people never say when they are untrue; for B:`); for (const x of [...report.rawB.values()].slice(0, 30)) log('  B', JSON.stringify(x)); }
const pass = OFF ? report.bad.length > 0 : !report.bad.length && report.lines > 1000; // (--off: passes when the lint catches what grounding would have)
log(`${pass ? 'PASS' : 'FAIL'} grounding lint: ${report.checked} moments at ${EPS.length} outfitters, ${report.lines} lines, ${report.bad.length} broken`);
process.exit(pass ? 0 : 1);
