// The guiding years' data check (story Round 4, stream A3), Node only: every line id in story-data/guiding.js is a text
// entry (text/*.json) or an a3 draft (drafts-a3.js); every condition compiles with no warnings; every f: fact a scene
// writes is declared (facts.js); every walt: id is a Walt-page line or a walt-lines.js row; the night's hours stop the
// dial at the doc's six; the anchored speeches clean to the doc's words.   node scripts/cmp-a3-unit.mjs
import { readFileSync, readdirSync } from 'node:fs';
import { compile, registerSensor } from '../src/story-cond.js';
import { PENCIL_SENSORS } from '../src/pencil.js';
import { factRow, checkValue } from '../src/story-data/facts.js';
import { waltRow } from '../src/story-data/walt-lines.js';
import * as G from '../src/story-data/guiding.js';
import { TEXT as DRAFTS } from '../src/story-data/drafts-a3.js';
import * as LG from '../src/story-data/leads-guiding.js';
import { RULES_GUIDING } from '../src/story-data/rules-guiding.js';
import ARC from '../src/story-data/episodes/arc-guiding.js';
import { CAST } from '../src/story-data/cast.js';
import '../src/topics.js';

for (const [k, v] of Object.entries(PENCIL_SENSORS)) registerSensor(k, v);
for (const [k, v] of Object.entries(G.GY_SENSORS)) registerSensor(k, v);
const T = {};
for (const f of readdirSync('src/story-data/text')) Object.assign(T, JSON.parse(readFileSync(`src/story-data/text/${f}`, 'utf8')).text);
Object.assign(T, DRAFTS.text);
const errs = [];
const idOk = (id, where) => { if (!T[id]) errs.push(`${where}: no text ${id}`); };
const condOk = (c, where) => { if (!c) return; const r = compile(c); if (!r.ok || r.warnings.length) errs.push(`${where}: ${c}: ${[...(r.errors || []), ...r.warnings].join('; ')}`); };
const actOk = (a, where) => {
  if (a && typeof a === 'object') { condOk(a.when, where); (a.then || []).forEach((x) => actOk(x, where)); return; }
  const m = /^(\w+):(.*)$/.exec(a); if (!m) return errs.push(`${where}: bad action ${a}`);
  if (m[1] === 'f') { const [k, v] = m[2].split('='); const row = factRow(k); if (!row) errs.push(`${where}: undeclared ${k}`); else if (v != null && checkValue(row, v)) errs.push(`${where}: ${k}=${v}: ${checkValue(row, v)}`); }
  if (m[1] === 'walt') { if (!waltRow(m[2]) && !(T[m[2]])) errs.push(`${where}: walt ${m[2]}`); }
  if (m[1] === 'card' || (m[1] === 'pay' && m[2].includes('@'))) idOk(m[2].split('@').pop(), where);
};
const lineOk = (l, where) => {
  if (typeof l === 'string') return idOk(l, where);
  if (l.first) return l.first.forEach((x) => lineOk(x, where));
  condOk(l.when, where); if (l.id) idOk(l.id, where);
  if (l.strip && T[l.id] && !T[l.id].text.includes(l.strip)) errs.push(`${where}: ${l.id} has no "${l.strip}"`);
};
let nodes = 0, choices = 0;
for (const sc of [G.MARLYS, G.HAP, G.NATE, G.SHEILA, G.STATEMENT, G.RICK, G.NIGHT]) {
  for (const [nid, N] of Object.entries(sc.nodes)) {
    nodes++; const w = `${sc.id}.${nid}`;
    (N.say || []).forEach((l) => lineOk(l, w)); (N.then || []).forEach((a) => actOk(a, w));
    if (N.to && !sc.nodes[N.to]) errs.push(`${w}: to ${N.to}`);
    for (const c of N.go || []) {
      choices++; idOk(c.ask, w); condOk(c.when, w); (c.say || []).forEach((l) => lineOk(l, w)); (c.then || []).forEach((a) => actOk(a, w));
      if (c.to && !sc.nodes[c.to]) errs.push(`${w}: choice to ${c.to}`);
    }
  }
}
for (const r of RULES_GUIDING) { condOk(r.when, r.id); r.then.forEach((a) => actOk(a, r.id)); }
for (const who of ['marlys', 'hap', 'nate', 'sheila', 'rick']) { if (!CAST[who]) errs.push(`cast: no ${who}`); else for (const w of CAST[who].where) condOk(w.when, `cast.${who}.${w.id}`); }
for (const s of Object.values(G.SCHEDULE)) for (const c of typeof s === 'string' ? [s] : Object.values(s)) condOk(c, 'schedule');
for (const a of LG.ASKS) { condOk(a.if, a.id); if (a.say) idOk(a.say, a.id); (a.then || []).forEach((x) => actOk(x, a.id)); }
for (const w of [...G.WALLS, G.TAUNO_PHOTO]) { condOk(w.when, w.id || 'tauno'); idOk(w.say, w.id || 'tauno'); (w.then || []).forEach((x) => actOk(x, w.id || 'tauno')); }
for (const g of G.GUS_LINES) { idOk(g.id, 'gus'); condOk(g.when, 'gus'); }
G.MARLYS_OPENERS.forEach((id) => idOk(id, 'openers')); G.RICK_RULES.forEach((id) => idOk(id, 'rules'));
for (const id of G.RAW) { idOk(id, 'raw'); const t = G.speech(T[id] && T[id].text); if (/"|^[A-Z]+:/.test(t)) errs.push(`raw ${id}: ${t.slice(0, 40)}`); }
const stops = G.NIGHT_STOPS.map((h) => `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.round((h % 1) * 60)).padStart(2, '0')}`).join(' ');
if (stops !== '18:05 22:00 23:40 01:00 02:00 06:00') errs.push(`night stops ${stops}`);
if (ARC.climax.door !== 'door.guiding.climax' || ARC.yield !== 'door.guiding.yield') errs.push('arc record');
console.log(`cmp-a3-unit: ${nodes} nodes, ${choices} choices, ${RULES_GUIDING.length} rules, stops ${stops}`);
if (errs.length) { console.log(errs.join('\n')); process.exit(1); }
console.log('cmp-a3-unit: PASS');
