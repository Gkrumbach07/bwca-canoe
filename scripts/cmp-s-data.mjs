#!/usr/bin/env node
// Stream S's open-data checks (docs/story/60-side-stories.md §14 checks 1 and 9; campaign stream S, Round 4), against the
// release the game runs (public-data-v9) and src/burns.bin. Node, light.
//   check 1   the Stuart Portage (563 r) by name in v9: its two ends near the doc's road end (EP 19) and river end, its length
//             (the carry's minutes at the game's carry pace: about 47 at 1 m/s of game time)
//   check 9   Insula: the lunch rock within 1 km of C1655 (-6592, 18606); the creek mouth 1–2 km across on a straight line,
//             the line over water; the clearing 150–250 m up from the mouth, inside the 2011 Pagami Creek burn (age ≈ 15
//             in 2026), at least 300 m from any portage and 250 m from any campsite (off every route)
//   node scripts/cmp-s-data.mjs [--data <dir>]
import fs from 'node:fs';
import zlib from 'node:zlib';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const MAIN = (() => { try { return path.resolve(execSync('git rev-parse --git-common-dir', { cwd: ROOT }).toString().trim(), '..'); } catch { return ROOT; } })();
const find = (rel) => [path.resolve(ROOT, rel), path.resolve(MAIN, rel)].find((p) => fs.existsSync(p)) || path.resolve(ROOT, rel);
const DATA = find(arg('--data', 'public-data-v9'));
let fails = 0;
const result = (name, pass, more = {}) => { if (!pass) fails++; console.log(pass ? 'PASS' : 'FAIL', name, JSON.stringify(more)); };

const v9 = JSON.parse(fs.readFileSync(path.join(DATA, 'index.json'), 'utf8'));
const g = v9.grid, T = g.tile, HALO = g.halo, SIDE = T + 2 * HALO, NC = SIDE * SIDE, tiles = new Map();
function tileAt(tx, ty) { const k = ty * g.ntx + tx; if (tiles.has(k)) return tiles.get(k); let t = null; try { const raw = zlib.gunzipSync(fs.readFileSync(path.join(DATA, 'tiles', `${tx}_${ty}.bin`))); const buf = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength); t = { lake: new Uint16Array(buf, NC * 2, NC), sd: new Int16Array(buf, NC * 4, NC) }; } catch { t = null; } tiles.set(k, t); return t; }
function cell(x, z) { const i = Math.floor((x - g.originX) / g.cell), j = Math.floor((z - g.originZ) / g.cell); const t = tileAt((i / T) | 0, (j / T) | 0); if (!t) return null; const c = ((j % T) + HALO) * SIDE + (i % T) + HALO; return { lake: t.lake[c], sd: t.sd[c] / 10 }; }
const places = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/story-places.json'), 'utf8'));
const R = places.resolved.places, P = (id) => R[id] || null, prop = (pl, id) => (R[pl] && R[pl].props[id]) || null;

// --- check 1 ---------------------------------------------------------------------------------------------------------
const st = v9.portages.findIndex((p) => p.name === 'Stuart Portage' && Math.hypot(p.pts[p.pts.length - 1][0] + 57783, p.pts[p.pts.length - 1][1] + 196) < 300);
const sp = v9.portages[st];
let len = 0; if (sp) for (let i = 1; i < sp.pts.length; i++) len += Math.hypot(sp.pts[i][0] - sp.pts[i - 1][0], sp.pts[i][1] - sp.pts[i - 1][1]);
result('check 1: the Stuart Portage, 563 r, road end at EP 19 and river end, ~2.8 km (≈47 game min at the carry pace)', !!sp && sp.rods === 563 && Math.abs(len - 2833) < 200,
  { i: st, rods: sp && sp.rods, m: Math.round(len), mins: Math.round(len / 60), road: sp && sp.pts[sp.pts.length - 1], river: sp && sp.pts[0] });

// --- check 9 ---------------------------------------------------------------------------------------------------------
globalThis.fetch = async (u) => { const b = fs.readFileSync(new URL(u)); return { ok: true, arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) }; };
const B = await import(pathToFileURL(path.join(ROOT, 'src/burns.js')).href);
await B.loadBurns(); B.setBurnDate(2026, 200);
const rock = prop('s8.rock', 's8.sled'), mouth = P('s8.creek'), clr = P('s8.clearing');
const c1655 = { x: -6592, z: 18606 };
const dRock = rock ? Math.hypot(rock.x - c1655.x, rock.z - c1655.z) : null;
const across = rock && mouth ? Math.hypot(mouth.x - rock.x, mouth.z - rock.z) : null;
let wet = 0, n = 0; if (rock && mouth) for (let t = 0.03; t < 0.97; t += 0.01) { n++; const c = cell(rock.x + (mouth.x - rock.x) * t, rock.z + (mouth.z - rock.z) * t); if (c && c.sd < 0 && c.lake === 25) wet++; }
const up = clr && mouth ? Math.hypot(clr.x - mouth.x, clr.z - mouth.z) : null;
const look = clr ? B.burnLook(clr.x, clr.z, {}, 1) : null, rec = look && look.rec;
const nearCarry = clr ? Math.min(...v9.portages.flatMap((p) => p.pts.map(([x, z]) => Math.hypot(x - clr.x, z - clr.z)))) : null;
const nearSite = clr ? Math.min(...v9.campsites.map((c) => Math.hypot(c.x - clr.x, c.z - clr.z))) : null;
result('check 9a: the lunch rock within 1 km of C1655', dRock != null && dRock < 1000, { rock: rock && [rock.x, rock.z], m: Math.round(dRock) });
result('check 9b: the creek mouth 1–2 km straight across, the line over Insula', across > 1000 && across < 2000 && wet / n > 0.9, { m: Math.round(across), water: Math.round((100 * wet) / n) + '%' });
result('check 9c: the clearing 150–250 m up from the mouth, inside the 2011 Pagami Creek burn (≈15-year regrowth), off every route', up >= 150 && up <= 250 && look && look.kind === 1 && look.age >= 13 && look.age <= 17 && nearCarry > 300 && nearSite > 250,
  { up: Math.round(up), burn: rec ? `${B.burnLine ? B.burnLine(rec) : rec.name} age ${look.age}` : look && look.kind, thicket: look && Math.round(look.thicket * 10) / 10, carry: Math.round(nearCarry), site: Math.round(nearSite) });
process.exit(fails ? 1 : 0);
