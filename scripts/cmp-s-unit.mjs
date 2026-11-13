#!/usr/bin/env node
// Stream S's unit checks (Node, no browser): the timedCarry minigame against the trail's minutes, S1 and S8's records on
// the runner, every text id their data names resolves, the scenes' conditions parse.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const imp = (p) => import(pathToFileURL(path.join(ROOT, p)).href);
let n = 0, bad = 0;
const ok = (name, pass, more = {}) => { n++; if (!pass) bad++; console.log(pass ? 'PASS' : 'FAIL', name, JSON.stringify(more).slice(0, 400)); };

const { timedCarry, TIMED_CARRY } = await imp('src/minigames/timed-carry.js');
// a straight 2833 m trail; the player walks it at v m/s of game time, with optional set-downs (min)
function run({ v = 1.0, rests = [], pack = true, back = false } = {}) {
  const L = 2833, pts = [[0, 0], [0, L]];
  const S = { x: 0, z: -5, hours: 19, carrying: true, pack };
  const out = []; const h = timedCarry({ start: { x: 0, z: 0 }, end: { x: 0, z: L }, pts, record: 49, probe: () => S }, { done: (r, d) => out.push({ r, ...d }) });
  const dt = 1 / 60 / 6; // h (10 s of game time)
  let res = null, restLeft = 0, ri = 0;
  for (let k = 0; k < 4000 && !res; k++) {
    S.hours += dt;
    if (restLeft > 0) { restLeft -= dt * 60; S.carrying = restLeft <= 0; }
    else if (ri < rests.length && S.z > (ri + 1) * L / (rests.length + 1)) { restLeft = rests[ri++]; S.carrying = false; }
    else if (back && S.z > 1200) { S.carrying = false; S.z -= v * 3600 * dt * 3; }
    else S.z = Math.min(L, S.z + v * 3600 * dt);
    if (S.z >= L - 5 && S.carrying) S.carrying = false;
    res = h.update(dt);
  }
  return { res, out };
}
const a = run({ v: 1.0 });
ok('timedCarry: a light single load at the carry pace (1 m/s) beats 49 by a minute or two', a.res && a.res.result === 'beat' && a.res.mins >= 46 && a.res.mins <= 48.5, a.res);
const b = run({ v: 1.0, rests: [6] });
ok('timedCarry: one set-down of six minutes loses it', b.res && b.res.result === 'missed', b.res);
const c = run({ v: 1.0, rests: [40] });
ok('timedCarry: the canoe left down past the idle limit gives up', c.res && c.res.result === 'gaveup', c.res);
const d = run({ v: 1.0, pack: false });
ok('timedCarry: without a pack on, the clock never starts', d.res === null, d.res);
ok('timedCarry: the result goes out through the api (mg:timedCarry)', a.out.length === 1 && a.out[0].r === 'beat', a.out);
ok('timedCarry: the record is the squad\'s 49 minutes', TIMED_CARRY.record === 49);

const { EPISODES } = await imp('src/story-data/episodes/index.js');
const E = await imp('src/episodes.js');
const S1 = EPISODES.find((e) => e.id === 'S1'), S8 = EPISODES.find((e) => e.id === 'S8');
ok('records: S1 and S8 on the runner, no slots, an explicit yes', S1 && S8 && !E.checkRecord(S1).length && !E.checkRecord(S8).length, { S1: S1 && E.checkRecord(S1), S8: S8 && E.checkRecord(S8) });
const rules = E.compileEpisodes([S1, S8]);
ok('records: S8\'s yes is the sled looked at or N16 read at the rock, never Tom or a rumour', rules.filter((r) => r.then.includes('f:ep.S8.yes')).map((r) => r.when).sort().join('|') === 'f:ep.S8.sled|here:NB37', rules.filter((r) => r.then.includes('f:ep.S8.yes')).map((r) => r.when));
ok('records: S1 has no compiled yes (his offer accepted: the choice door, episodes.yes)', !rules.some((r) => r.then.includes('f:ep.S1.yes')));
const L5 = (await imp('src/story-data/locks.js')).LOCKS.find((l) => l.id === 'L5');
ok('lock 5 key B reads f:ep.S8.done (the reading), with another key beside it', L5 && L5.keys.some((k) => /f:ep\.S8\.done/.test(k.when) && /tauno\.blazes/.test(k.when)));
ok('S8\'s reading is a rule with no yes (taught & looked), and survives the window', (S8.rules || []).some((r) => r.then.includes('f:ep.S8.done') && !/ep\.S8\.yes/.test(r.when)));

// the words
const texts = {}; for (const f of ['side', 'drafted', 'world']) Object.assign(texts, JSON.parse(fs.readFileSync(path.join(ROOT, `src/story-data/text/${f}.json`), 'utf8')).text);
const D = await imp('src/story-data/sides-s.js');
const ids = new Set();
const walk = (x) => { if (Array.isArray(x)) x.forEach(walk); else if (x && typeof x === 'object') { for (const [k, v] of Object.entries(x)) { if (['when', 'then', 'once', 'fig', 'who', 'id', 'by', 'to', 'hub', 'label', 'pri', 'ring', 'kind'].includes(k)) continue; if (k === 'ask' || k === 'bye' || k === 'say' || k === 'at') walk(v); else walk(v); } } else if (typeof x === 'string' && /^(S\d|70\.|d95\.|side\.)/.test(x)) ids.add(x); };
for (const k of ['OLLIE_A', 'OLLIE_B', 'TOM', 'OSTBYS', 'HAP_S8', 'KEEPER_S']) walk(D[k]);
for (const c of D.OLLIE_C) ids.add(c.id); for (const v of Object.values(D.CARRY_SAYS)) ids.add(v); for (const b of D.TOM_BARKS) ids.add(b.id); ids.add(D.EVENING);
for (const r of [S1, S8]) { for (const p of r.page) ids.add(p.text); for (const e of r.ends) ids.add(e.line); for (const p of r.photo || []) ids.add(p.words); }
for (const s of ['S1.first', 'S8.first', 'S1.log', 'S8.conv.w1', 'S8.the-place.c1']) ids.add(s);
const missing = [...ids].filter((id) => !texts[id]);
ok('words: every id S1 and S8 name resolves (60, 70, 95)', missing.length === 0, { n: ids.size, missing });
const { compile } = await imp('src/story-cond.js').catch(() => ({}));
if (compile) {
  const conds = []; const cw = (x) => { if (Array.isArray(x)) x.forEach(cw); else if (x && typeof x === 'object') for (const [k, v] of Object.entries(x)) { if (k === 'when' && typeof v === 'string') conds.push(v); else cw(v); } };
  for (const k of ['OLLIE_A', 'OLLIE_B', 'TOM', 'OSTBYS', 'HAP_S8', 'KEEPER_S', 'OLLIE_C', 'TOM_BARKS']) cw(D[k]); cw(S1); cw(S8);
  const errs = []; for (const c of conds) { try { const r = compile(c); if (r && r.errs && r.errs.length) errs.push(c + ': ' + r.errs.join(',')); } catch (e) { errs.push(c + ': ' + e.message); } }
  ok('conditions: every when in S1/S8 data parses', errs.length === 0, { n: conds.length, errs });
}
console.log(`cmp-s-unit: ${n - bad}/${n}`);
process.exit(bad ? 1 : 0);
