// p2 A: the diff of two rig recordings (rig-record.mjs or game-record.js): the largest difference over every frame,
// by segment and by part, and the first frame past the tolerance.
//   node scripts/poses/compare.mjs <a.json> <b.json> [tol = 1e-6]   (exit 1 past the tolerance)
import fs from 'node:fs';
const [A, B] = [process.argv[2], process.argv[3]].map((f) => JSON.parse(fs.readFileSync(f, 'utf8')));
const tol = +(process.argv[4] || 1e-6);
const BONES = ['root', 'spine', 'chest', 'neck', 'head', 'clavL', 'armL', 'elbowL', 'foreL', 'twistL', 'handL', 'clavR', 'armR', 'elbowR', 'foreR', 'twistR', 'handR', 'thighL', 'kneeL', 'shinL', 'footL', 'toeL', 'thighR', 'kneeR', 'shinR', 'footR', 'toeR'];
const part = (k) => { if (k < 27 * 7) return `bone ${BONES[Math.floor(k / 7)]}`; const r = k - 27 * 7; const T = [['paddler', 7], ['hull', 7], ['paddle', 8], ['pack0', 8], ['pack1', 8], ['hat', 7], ['grip/blade/cadence', 7], ['eye/neck/foam', 5]]; let o = 0; for (const [n, len] of T) { if (r < o + len) return n; o += len; } return 'extra ' + r; };
if (A.n !== B.n) console.log(`frame counts differ: ${A.n} vs ${B.n}`);
const n = Math.min(A.n, B.n);
let worst = 0, first = null, worstAt = null;
const bySeg = new Map(), byPart = new Map();
let structural = 0;
// the quaternions' first slots (each bone's, then the paddler, the hull, the paddle, the packs, the hat): q and -q are
// the same rotation, so b's is turned to a's side before the difference is taken
const QS = [...Array.from({ length: 27 }, (_, k) => k * 7), 192, 199, 206, 214, 222, 230];
const signed = (a, b) => { const o = b.slice(); for (const s of QS) { if (a[s] * b[s] + a[s + 1] * b[s + 1] + a[s + 2] * b[s + 2] + a[s + 3] * b[s + 3] < 0) for (let k = 0; k < 4; k++) o[s + k] = -b[s + k]; } return o; };
for (let i = 0; i < n; i++) {
  const a = A.frames[i], b = { ...B.frames[i], f: signed(A.frames[i].f, B.frames[i].f) };
  if (a.l !== b.l) { console.log(`label differs at ${i}: ${a.l} / ${b.l}`); break; }
  if (a.s !== b.s) { structural++; if (structural < 4) console.log(`parents differ at ${i} (${a.l}): ${a.s} / ${b.s}`); }
  let fw = 0;
  for (let k = 0; k < a.f.length; k++) {
    const d = Math.abs(a.f[k] - b.f[k]);
    const dd = Number.isNaN(d) ? (Number.isNaN(a.f[k]) && Number.isNaN(b.f[k]) ? 0 : Infinity) : d;
    if (dd > fw) fw = dd;
    const p = part(k);
    if (dd > (byPart.get(p) || 0)) byPart.set(p, dd);
    if (dd > worst) { worst = dd; worstAt = { i, l: a.l, part: p, a: a.f[k], b: b.f[k] }; }
    if (dd > tol && !first) first = { i, l: a.l, part: p, a: a.f[k], b: b.f[k] };
  }
  if (fw > (bySeg.get(a.l) || 0)) bySeg.set(a.l, fw);
  if (!bySeg.has(a.l)) bySeg.set(a.l, 0);
}
console.log(`${n} frames compared; the largest difference ${worst.toExponential(2)}${worstAt ? ` at frame ${worstAt.i} (${worstAt.l}, ${worstAt.part}: ${worstAt.a} vs ${worstAt.b})` : ''}`);
console.log(first ? `FIRST past ${tol}: frame ${first.i} (${first.l}, ${first.part}: ${first.a} vs ${first.b})` : `every frame within ${tol}`);
console.log(`parent changes differing: ${structural}`);
console.log('by segment:'); for (const [k, v] of bySeg) console.log(`  ${v.toExponential(2).padStart(9)}  ${k}`);
console.log('by part:'); for (const [k, v] of [...byPart].sort((x, y) => y[1] - x[1]).slice(0, 12)) console.log(`  ${v.toExponential(2).padStart(9)}  ${k}`);
process.exit(first || structural ? 1 : 0);
