// Stream g's unit checks (story wave 2: the end games), Node only: the data (secrets, owners, softening, the words, the
// episode records on E's runner), the timing rules (story-data/endgames.js) on a stub story, the places against the world's
// index (the lakes named exist and the anchors are near them), and the drafted lines fresh.
//   node scripts/cmp-g-unit.mjs
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import * as G from '../src/story-data/endgames.js';
import { checkRecord, compileEpisode } from '../src/episodes.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const ok = (name, cond, more = '') => { if (cond) pass++; else fail++; console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${more ? ` ${more}` : ''}`); };

// --- the data ------------------------------------------------------------------------------------------------------------
ok('eight to twelve secrets', G.SECRETS.length >= 8 && G.SECRETS.length <= 12, `${G.SECRETS.length}`);
ok('every secret has a keeper as its owner, one each', G.SECRETS.every((S) => G.OWNERS[S.owner]) && new Set(G.SECRETS.map((S) => S.owner)).size === G.SECRETS.length);
ok('the giant fish, the cave, a waterfall, a cabin, a lost canoe, a rookery among them', ['pike', 'cave', 'falls', 'cabin', 'canoe', 'rookery'].every((id) => G.secretOf(id)));
ok('every secret pays or gives', G.SECRETS.every((S) => S.pay > 0 || S.give || (S.find && (S.find.give || S.find.page))));
ok('fish secrets have a bite rule', G.SECRETS.filter((S) => S.kind === 'fish').every((S) => S.fish && S.fish.cm > 100 && S.fish.hours.length && S.fish.lures.length && S.fish.chance > 0 && S.fish.chance < 1));
ok('find secrets have a prop and a verb', G.SECRETS.filter((S) => S.kind === 'find').every((S) => S.find && S.find.prop && S.find.verb));
ok('photo secrets have a frame', G.SECRETS.filter((S) => S.kind === 'photo').every((S) => S.photo && S.photo.d > 0 && S.photo.deg > 0));
ok('every one of the fourteen outfitters softens by one small task', G.SOFTEN.length === 14 && G.OWNER_EPS.every((ep) => G.softOf(ep)));
ok('donations are small (nothing crazy)', G.SOFTEN.filter((x) => x.kind === 'donate').every((x) => x.amt > 0 && x.amt <= 100));
ok('the softening is varied (donations, jobs, a fish)', new Set(G.SOFTEN.map((x) => x.kind)).size === 3);
const used = G.textIdsUsed(), missing = [...used].filter((id) => !G.LINES[id]);
ok('every line the data names is written', !missing.length, missing.slice(0, 6).join(' '));
const BAN = /\b(manitou|wendigo|windigo|spirit|sacred|pictograph|offering|nanabozho|thunderbird|memegwesi)\b/i;
ok('no being or sacred place in the lines (§10.2)', !Object.values(G.LINES).some((t) => BAN.test(t)));
ok('no line is long (keepers speak short)', Object.values(G.LINES).every((t) => t.length <= 150), Object.entries(G.LINES).filter(([, t]) => t.length > 150).map(([k]) => k).join(' '));
ok('the episode records pass the runner\'s check', G.G_EPISODES.every((E) => !checkRecord(E).length), G.G_EPISODES.flatMap(checkRecord).join('; '));
ok('each record compiles to its end rule', G.G_EPISODES.every((E) => compileEpisode(E).some((r) => r.id === `ep.${E.id}.end.told`)));
ok('each record\'s page, end and first are written', G.G_EPISODES.every((E) => [...E.page.map((p) => p.text), E.first, ...E.ends.map((e) => e.line)].every((id) => G.LINES[id])));

// --- the timing on a stub story ------------------------------------------------------------------------------------------
function stub(end, abs0 = 20000) {
  const F = new Map(); let now = abs0, month = 7;
  return {
    F, has: (k) => F.has(k), get: (k) => (F.has(k) ? F.get(k).v : undefined), fact: (k) => (F.has(k) ? { v: F.get(k).v, abs: F.get(k).abs } : null),
    set: (k, v = true) => { if (!F.has(k)) F.set(k, { v, abs: now }); }, time: () => ({ abs: now, hours: 10 }), date: () => ({ month, hours: 10 }),
    go: (d) => { now = abs0 + d; }, month: (m) => { month = m; },
    init() { this.set('end', end); this.set(end === 'M' ? 'end.M' : 'end.J'); return this; },
  };
}
const j = stub('JN').init();
ok('J: nothing the day of the ending', !G.secretReady(j));
j.go(G.FIRST_AFTER - 1); ok('J: nothing before the paper', !G.secretReady(j));
j.go(G.FIRST_AFTER); ok('J: a secret ready from the paper\'s day', G.secretReady(j));
ok('J: told only by its own owner', G.secretFor(j, 31) && G.secretFor(j, 31).id === 'pike' && !G.secretFor(j, 30));
ok('J: an owner without one points elsewhere', !!G.secretWaiting(j, 1));
j.set('secret.pike.given', 1);
ok('J: one at a time, a month apart', !G.secretReady(j) && !G.secretFor(j, 51));
j.go(G.FIRST_AFTER + G.SECRET_GAP - 1); ok('J: not before the month is up (and the first still open)', !G.secretReady(j));
j.go(G.FIRST_AFTER + G.STALE); ok('J: an open secret STALE days old lets the next one come (never stuck)', G.secretReady(j));
j.set('secret.pike.found'); j.set('secret.pike.done'); j.go(G.FIRST_AFTER + G.STALE + 1);
ok('J: the berries only in July and August', (j.month(9), !G.secretFor(j, 6)) && (j.month(8), !!G.secretFor(j, 6)));
ok('J: no softening after the journalist ending', !G.softReady(j, 25));
const m = stub('M').init();
ok('M: no secrets after the money ending', (m.go(100), !G.secretReady(m)));
m.go(G.SOFT_FIRST - 1); ok('M: no owner asks the first week', !G.softReady(m, 25));
m.go(G.SOFT_FIRST); ok('M: then any owner may ask', G.softReady(m, 25) && G.softReady(m, 31));
m.set('owner.25.asked', 'job');
ok('M: the asked owner still may be asked again (a missed job), the others wait SOFT_GAP', G.softReady(m, 25) && !G.softReady(m, 31));
m.go(G.SOFT_FIRST + G.SOFT_GAP); ok('M: the next owner after the gap', G.softReady(m, 31));
m.set('owner.25.softened'); ok('M: a softened owner asks nothing', !G.softReady(m, 25));

// --- the places against the world's index (the lakes are real; the anchors near them) -------------------------------------
const idxF = [path.join(ROOT, 'public/data/index.json'), '/Users/gkrumbac/Documents/bwca-canoe/public/data/index.json'].find((f) => existsSync(f));
if (idxF) {
  const idx = JSON.parse(readFileSync(idxF, 'utf8')), lakes = idx.lakes.filter(Boolean);
  for (const S of G.SECRETS) {
    const L = lakes.filter((l) => (l.displayName || l.name) === S.lake).sort((a, b) => Math.hypot(a.cx - S.at.x, a.cz - S.at.z) - Math.hypot(b.cx - S.at.x, b.cz - S.at.z))[0];
    const d = L ? Math.hypot(L.cx - S.at.x, L.cz - S.at.z) : Infinity;
    ok(`place: ${S.id} on ${S.lake}`, L && d < 6000, L ? `${Math.round(d)} m from its middle` : 'no such lake');
  }
  const [x0, z0, x1, z1] = idx.bbox && idx.bbox.length === 4 ? idx.bbox : [-Infinity, -Infinity, Infinity, Infinity];
  ok('every anchor inside the baked world', G.SECRETS.every((S) => S.at.x > x0 && S.at.x < x1 && S.at.z > z0 && S.at.z < z1) || !Number.isFinite(x0));
} else console.log('SKIP the places (no public/data/index.json here)');

// --- the drafted lines are fresh -----------------------------------------------------------------------------------------
let fresh = false; try { execFileSync(process.execPath, [path.join(ROOT, 'scripts/cmp-g-lines.mjs'), '--check'], { stdio: 'pipe' }); fresh = true; } catch { fresh = false; }
ok('drafts-g.json and 95-drafted-lines.md match LINES', fresh);

console.log(`cmp-g-unit: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
