// d2 land: the land as the agencies map it (round D2 of the real data, docs/data-sources.md "Fetched"). A v4 tile carries,
// after its four 16-bit fields, one byte per cell (its halo included) of each of these, from the bake (scripts/bake.mjs):
//   ground  what the ground is (d1-ground: NWI wetlands, SSURGO, OSM; MGS D-02 outcrops as rock outcrop): KIND below,
//           0 where nothing was surveyed (Ontario)
//   forest  the forest type (LANDFIRE LF2024 EVT in the game's species groups): FOREST below, 0 or 23 = not mapped
//   canopy  the height of what grows there (LANDFIRE EVH), decimetres
//   cover   its canopy cover (LANDFIRE EVC), %
//   rock    the bedrock unit (MGS D-05): ROCK below, 0 outside Minnesota
//   cliff   the LiDAR's verdict on the ground's form (MnTOPO 2 m): (class << 6) | strength, CLIFF below; 0 = no LiDAR here
//   stone   surface stone and boulder cover (SSURGO): 254·√fraction, 255 = no survey
// On a v3 tile (or anywhere a field says "nothing here") everything that reads these falls back to the noise fields it
// used before (fields.js, site.js), so the release in use draws exactly as it did. Pure data: it runs in the build worker.

import { smoothstep, fbm } from './rng.js';
import { LOCAL_ICE } from './season.js';

export const V4_FIELDS = ['height', 'lake', 'sdist', 'level', 'ground', 'forest', 'canopy', 'cover', 'rock', 'cliff', 'stone', 'secchi', 'cdom'];

// The byte fields of a tile grid (grid.js TileGrid): `grid.ch` = { ground, forest, ... } Uint8Arrays over the grid's side²
// (local index lj * side + li, as grid.local), or null on a v3 tile. The bake's reader sets it; for a grid it has not
// (an older grid.js) attachLand reads them from the tile's buffer itself, by the index's field list.
export function attachLand(grid, buf, fields = V4_FIELDS) {
  if (grid.ch !== undefined) return grid.ch;
  const N = grid.side * grid.side, extra = fields.length - 4;
  if (!buf || extra <= 0 || buf.byteLength < N * (8 + extra)) { grid.ch = null; return null; }
  const ch = {};
  for (let k = 0; k < extra; k++) ch[fields[4 + k]] = new Uint8Array(buf, N * (8 + k), N);
  grid.ch = ch;
  return ch;
}
// (`?land=off` in the page's address draws a v4 release as a v3 one is drawn, the noise's land on the new heights: a
// before and after; tiles.js passes it to the worker, which calls setLand)
let LAND_ON = true;
export function setLand(on) { LAND_ON = !!on; }
export const landOf = (grid) => (LAND_ON && grid && grid.ch) || null;
// the ground kind of a global cell, or at a point (nearest cell): 0 on a v3 tile and where nothing was surveyed
export function groundKindCell(grid, i, j) { const L = landOf(grid); return L && L.ground ? L.ground[grid.local(i, j)] : 0; }
export function groundKindAt(grid, x, z) { return groundKindCell(grid, grid.cellI(x), grid.cellJ(z)); }

// ---- the ground kinds (d1-ground's legend) -----------------------------------------------------------------------
export const KIND = { none: 0, upland: 1, openBog: 2, coniferBog: 3, shrubSwamp: 4, marsh: 5, wetMeadow: 6, hardwoodSwamp: 7, emergent: 8, aquaticBed: 9, rock: 10, boulder: 11, sand: 12, water: 13 };
// What each kind is to the land (index = kind):
//   wet     how wet the ground is (site.js wet: 0 dry upland .. 1 standing water); -1 = the land's own lie decides (upland,
//           the rock, the boulders, the sand), held under `dry` there so no noise makes a bog where the survey found none
//   meadow  how open and grassy (site.js meadow): the marsh and the wet meadow are sedge and grass, the open bog half
//   trees   how much of the forest the kind keeps (the woods' own density, from the forest type and cover, times this)
//   sphag   sphagnum on the floor (the bog's ochre and rust moss: terrain.js groundSphagnum)
export const KIND_LAND = [
  null,                                                    // 0 none: the noise fields
  { wet: -1, dry: 0.5, meadow: 0, trees: 1, sphag: 0 },     // 1 upland
  { wet: 0.95, meadow: 0.5, trees: 0.14, sphag: 1 },        // 2 open bog: sphagnum, leatherleaf, a few stunted spruce
  { wet: 0.82, meadow: 0, trees: 0.8, sphag: 0.6 },         // 3 conifer bog: black spruce and tamarack on peat
  { wet: 0.78, meadow: 0.15, trees: 0.12, sphag: 0 },       // 4 shrub swamp: alder and willow
  { wet: 1, meadow: 1, trees: 0, sphag: 0 },                // 5 marsh: cattail, bulrush, sedge
  { wet: 0.72, meadow: 1, trees: 0.03, sphag: 0 },          // 6 wet meadow: sedge, bluejoint (a beaver meadow)
  { wet: 0.7, meadow: 0, trees: 0.85, sphag: 0 },           // 7 hardwood swamp: black ash
  { wet: 1, meadow: 0.6, trees: 0, sphag: 0 },              // 8 in-lake emergent (in the water: d2 water's)
  { wet: 1, meadow: 0, trees: 0, sphag: 0 },                // 9 aquatic bed (likewise)
  { wet: -1, dry: 0.15, meadow: 0, trees: 1, sphag: 0 },    // 10 rock outcrop: bare rock (site.js bare thins the trees), jack pine in the cracks
  { wet: -1, dry: 0.45, meadow: 0, trees: 0.75, sphag: 0 }, // 11 boulder field
  { wet: -1, dry: 0.2, meadow: 0, trees: 0.08, sphag: 0 },  // 12 sand
  { wet: 0.9, meadow: 0.85, trees: 0.02, sphag: 0.2 },      // 13 open water the bake has as land: a pond, a beaver flowage
];

// ---- underfoot: the wetlands as walked (the owner, 2026-10-31: "When I'm in a swamp, it shouldn't be like I'm walking
// over a nice rocky trail ... I'm walking down the side of a river where I imagine it should be pretty boggy, and I'm
// running across it like I'm portaging") ---------------------------------------------------------------------------
// MIRE: how soft each kind is underfoot, 0 firm .. 1 a quaking open bog or a marsh: the walk slows, the boots sink and
// squelch (player.js), the ground shows standing water (terrain.js), and a portage across it is mud, or puncheon
// (split-log boardwalk) where it is softest (props.js). The swamps with trees stand on roots and hummocks: softer
// than the woods, firmer than the open bog.
export const MIRE = [0, 0, 1, 0.6, 0.55, 0.9, 0.5, 0.45, 1, 1, 0, 0, 0, 0.85];
// where a portage is laid with puncheon rather than walked through the muck (a trail's mire, smoothed, over this)
export const BOARDWALK = 0.78;
// Ontario's forest map stands for the ground kinds where nothing was surveyed (site.js landData's OPEN_KIND)
const OPEN_KIND = { 13: KIND.openBog, 14: KIND.wetMeadow, 15: KIND.shrubSwamp, 16: KIND.marsh, 17: KIND.wetMeadow };
// the mire at a point, from read(name, x, z): a v4 channel's byte there (World.chAt, or gridReader below). With the
// season (wetlands round 2: "the mire walk follows the season"), where the NWI gives a water regime the water standing
// on the date (standingWater, as the pools are drawn) moves a flooded kind between a wet meadow's going (MIRE_DOWN: the
// water gone down to a sedge mat over mud, the marsh in August) and its own (the marsh in May); frozen it is firm.
export const MIRE_DOWN = 0.5;
export function mireAt(read, x, z, season = null) {
  let kd = read('ground', x, z);
  if (!kd) kd = OPEN_KIND[read('forest', x, z)] || 0;
  let m = MIRE[kd] || 0;
  if (!season || !m) return m;
  const wet = read('wet', x, z), lv = wet ? standingWater(wetRegime(wet), wetBeaver(wet), season.doy) : -1;
  if (lv >= 0 && m > MIRE_DOWN) m = MIRE_DOWN + (m - MIRE_DOWN) * lv;
  return m * (1 - 0.85 * mireIce(season).ice);
}
export const gridReader = (grid) => { const L = landOf(grid); return L ? (n, x, z) => (L[n] ? L[n][grid.local(grid.cellI(x), grid.cellJ(z))] : 0) : () => 0; };
// a portage's mire at its point i (pts: its rows), over the rows within reach (a 10 m cell is 6 rows of 1.6 m), so the
// mud and the puncheon start and stop with the wet ground and not with each cell
export function trailMireAt(read, pts, i, reach = 3, season = null) {
  let s = 0, n = 0;
  for (let k = Math.max(0, i - reach); k <= Math.min(pts.length - 1, i + reach); k++) { s += mireAt(read, pts[k][0], pts[k][1], season); n++; }
  return n ? s / n : 0;
}

// ---- the whole NWI code (the wetlands round, 2026-10-31: docs/wetland-data.md) ------------------------------------
// A v5 tile carries two more bytes per cell (scripts/v4-products.mjs), `wet` and `wcls`, 0 where no NWI polygon lies
// (upland, and all of Ontario). On the bake's water they keep the NWI's code too (a creek through a marsh reads EM1).
//   wet   bits 0-2 the water regime (REGIME), bit 3 beaver-made, bits 4-5 the system (SYSTEM), bits 6-7 where it sits (HGM)
//   wcls  (class1 << 4) | class2 (WCLASS), class2 = class1 when the code has one class
export const REGIME = [null, { code: 'A', name: 'temporarily flooded' }, { code: 'C', name: 'seasonally flooded' }, { code: 'F', name: 'semipermanently flooded' },
  { code: 'H', name: 'permanently flooded' }, { code: 'D', name: 'saturated' }, { code: 'K', name: 'artificially flooded' }, { code: '', name: 'other regime' }];
export const RG = { none: 0, temp: 1, seasonal: 2, semi: 3, perm: 4, saturated: 5, artificial: 6, other: 7 };
export const SYSTEM = ['', 'P', 'L', 'R'];
export const HGM = ['', 'terrene', 'lentic', 'lotic'];
export const wetRegime = (b) => b & 7;
export const wetBeaver = (b) => (b >> 3) & 1;
export const wetSystem = (b) => (b >> 4) & 3;
export const wetHgm = (b) => (b >> 6) & 3;
export const wclass1 = (b) => b >> 4;
export const wclass2 = (b) => b & 15;
// The classes and what each grows (placement.js, site.js): the NWI says what kind of plant, LANDFIRE how tall and how
// close where the two agree. Per class:
//   trees   how much of the woods it keeps (the woods' own density times this, as KIND_LAND trees)
//   cap     the tallest a tree stands there, m (a shrub class's runts: under ~18 ft); 0 = the stand's own height
//   species the tree mix (placement.js SPECIES names)
//   alder, shrub, low, fern, hazel   the brush: alder and willow, the shrubs (low: the bog's brush, leatherleaf and
//           Labrador tea, low over 0: 1 the bog's usual knee height, less a lower mat), the ferns' and the hazel's share
//   meadow  open sedge and grass (site.js meadow); sphag  sphagnum on the floor
//   mat     the leatherleaf and Labrador tea mat, knee-high (vegetation.js leatherleaf; wetlands round 2): mats a cell
export const WCLASS = [
  null,
  { code: 'FO1', name: 'hardwood swamp', trees: 0.85, cap: 0, species: { ash: 0.55, cedar: 0.12, birch: 0.1, aspen: 0.08, tamarack: 0.08, blackSpruce: 0.07 }, alder: 0.8, shrub: 0, low: 0, fern: 1.7, hazel: 0.3, meadow: 0, sphag: 0, mat: 0 },
  { code: 'FO2', name: 'tamarack swamp', trees: 0.92, cap: 0, species: { tamarack: 0.8, blackSpruce: 0.2 }, alder: 0.3, shrub: 0.3, low: 1, fern: 0.3, hazel: 0, meadow: 0.08, sphag: 0.5, mat: 1.0 },
  { code: 'FO4', name: 'black spruce bog', trees: 0.85, cap: 0, species: { blackSpruce: 0.86, tamarack: 0.14 }, alder: 0, shrub: 0.3, low: 1, fern: 0.35, hazel: 0, meadow: 0, sphag: 0.6, mat: 1.4 },
  { code: 'FO', name: 'swamp forest', trees: 0.8, cap: 0, species: { blackSpruce: 0.45, tamarack: 0.25, cedar: 0.15, ash: 0.1, birch: 0.05 }, alder: 0.5, shrub: 0.3, low: 0, fern: 0.8, hazel: 0.1, meadow: 0, sphag: 0.2, mat: 0.3 },
  { code: 'SS1', name: 'alder thicket', trees: 0.07, cap: 5.5, species: { tamarack: 0.35, blackSpruce: 0.25, ash: 0.2, aspen: 0.2 }, alder: 2.8, shrub: 1.3, low: 0, fern: 0.5, hazel: 0.2, meadow: 0.12, sphag: 0, mat: 0 },
  { code: 'SS2', name: 'stunted tamarack', trees: 0.38, cap: 4.5, species: { tamarack: 0.88, blackSpruce: 0.12 }, alder: 0.2, shrub: 0.6, low: 1, fern: 0, hazel: 0, meadow: 0.3, sphag: 0.75, mat: 2.6 },
  { code: 'SS3', name: 'leatherleaf bog', trees: 0.03, cap: 3, species: { blackSpruce: 0.6, tamarack: 0.4 }, alder: 0, shrub: 0.5, low: 0.62, fern: 0, hazel: 0, meadow: 0.45, sphag: 1, mat: 6 },
  { code: 'SS4', name: 'stunted black spruce', trees: 0.42, cap: 4.5, species: { blackSpruce: 0.88, tamarack: 0.12 }, alder: 0, shrub: 0.6, low: 1, fern: 0, hazel: 0, meadow: 0.22, sphag: 0.85, mat: 2.8 },
  { code: 'SS', name: 'shrub swamp', trees: 0.12, cap: 5.5, species: { tamarack: 0.4, blackSpruce: 0.35, aspen: 0.25 }, alder: 1.6, shrub: 1.2, low: 0, fern: 0.4, hazel: 0.1, meadow: 0.2, sphag: 0, mat: 0.4 },
  { code: 'EM1', name: 'sedge and cattail', trees: 0, cap: 3, species: null, alder: 0.12, shrub: 0.18, low: 0, fern: 0, hazel: 0, meadow: 1, sphag: 0, mat: 0 },
  { code: 'EM2', name: 'wild rice and pickerelweed', trees: 0, cap: 3, species: null, alder: 0.05, shrub: 0.1, low: 0, fern: 0, hazel: 0, meadow: 1, sphag: 0, mat: 0 },
  { code: 'AB', name: 'lily bed' }, { code: 'UB', name: 'open water' }, { code: 'US', name: 'sand shore' }, { code: 'RS', name: 'rock shore' },
];
// EM2, the nonpersistent emergents (wild rice, pickerelweed, arrowhead), on the rice's calendar (aquatic.js uRiceGrow):
// up through June, standing by July, lodging from mid-September, gone by freeze-up. On land (rare: a mud flat, a drawn-
// down beaver pond) its meadow comes and goes with it (site.js, at the tile's date).
export const emergentGrow = (doy) => smoothstep(148, 172, doy) * (1 - smoothstep(260, 316, doy));
// The code as the NWI writes it, short: "PSS1/EM1Cb" (system, classes, regime, beaver); '' where no polygon lies
export function nwiCode(wet, wcls) {
  if (!wet && !wcls) return '';
  const a = WCLASS[wclass1(wcls)], b = WCLASS[wclass2(wcls)], r = REGIME[wetRegime(wet)];
  let s = SYSTEM[wetSystem(wet)] + (a ? a.code : '');
  if (b && b !== a) s += '/' + (b.code.slice(0, 2) === (a && a.code.slice(0, 2)) ? b.code.slice(2) : b.code);
  return s + (r ? r.code : '') + (wetBeaver(wet) ? 'b' : '');
}
// A cell's plants from its classes (null where its first class grows nothing of its own: the open water, the beds, the
// shores; and on a cell with no code). A two-class code is a patchwork, not an average: the second class takes about
// 30 % of the ground in patches a few cells across (a noise field over the cell's centre, the same in the two tiles that
// share a cell), and shows a little everywhere (alder under the trees, the odd runt in the sedge). `out` is reused.
const MIX_KEYS = ['trees', 'cap', 'alder', 'shrub', 'low', 'fern', 'hazel', 'meadow', 'sphag', 'mat'];
export function wetlandMix(wcls, x, z, out = {}) {
  const A = WCLASS[wclass1(wcls)], B0 = WCLASS[wclass2(wcls)];
  if (!A || A.trees === undefined) return null;
  const B = B0 && B0.trees !== undefined ? B0 : A;
  let w = 0;
  if (B !== A) w = 0.1 + 0.85 * smoothstep(0.59, 0.64, fbm(x * 0.022 + 31, z * 0.022 - 17, 2, 263));
  for (const k of MIX_KEYS) out[k] = A[k] * (1 - w) + B[k] * w;
  // a cap is the shrub class's: under trees (FO over SS) the trees keep their height; in the sedge (SS over EM) the runts' cap
  out.cap = A.cap && (B.cap || !B.trees) ? Math.max(A.cap, B.cap) : A.cap && w < 0.5 ? A.cap : 0;
  const sp = out.species || (out.species = {});
  for (const k in sp) sp[k] = 0;
  const add = (S, f) => { if (S) for (const k in S) sp[k] = (sp[k] || 0) + S[k] * f; };
  const ta = A.trees * (1 - w), tb = B.trees * w, tt = ta + tb;
  if (tt > 0) { add(A.species, ta / tt); add(B.species, tb / tt); } else add(A.species || B.species, 1);
  out.c1 = A; out.c2 = B; out.w = w;
  return out;
}
// The water standing on a wetland by its regime and the date (the owner: "some of it is seasonal too"), 0 dry .. 1 the
// full standing water it always drew; -1 = no regime to go by (upland, a saturated bog, no survey): the ground's own.
//   H, K   always;  F  always, a little lower in a late summer;  C  from ice-out to about early July, drying to wet mud by
//   August, a little water again in the late fall rains;  A  only the May melt;  D (saturated)  never standing: the soaked
//   moss as before. A beaver's marsh holds its water longer and never quite dries.
// Tiles bake the date's level in when they are built (site.js), so it moves as tiles rebuild, not day by day in place.
export function standingWater(regime, beaver, doy) {
  const bv = beaver ? 1 : 0;
  switch (regime) {
    case RG.perm: case RG.artificial: return 1;
    case RG.semi: return 1 - 0.25 * smoothstep(205, 240, doy) * (1 - smoothstep(270, 300, doy)) * (1 - 0.6 * bv);
    case RG.seasonal: {
      const floor = bv ? 0.45 : 0.1;
      const dry = smoothstep(178 + 25 * bv, 222 + 30 * bv, doy), rewet = 0.3 * smoothstep(272, 305, doy);
      return Math.min(1, 1 - (1 - floor) * dry + rewet);
    }
    case RG.temp: return Math.max(bv ? 0.2 : 0, 1 - smoothstep(140 + 15 * bv, 165 + 20 * bv, doy));
    default: return -1;
  }
}
// The pools' ice (wetlands round 2), from the season (season.js seasonAt: the lake's own ice-out and freeze-up, which
// the day cycle follows): ice 0 open .. 1 frozen; slush the dark melt as it goes out (and the first thin ice as it
// comes in); snow how much lies on it, once the winter has set in and until the melt starts. The game draws no snow on
// the ground, so it is only a dusting on the ice, in drifts. terrain.js draws it, player.js walks on it.
const _ice = { ice: 0, slush: 0, snow: 0 };
export function mireIce(season, out = _ice) {
  const ice = season ? season.ice || 0 : 0, d = season ? season.doy : 180;
  out.ice = ice;
  out.slush = ice > 0 && ice < 1 ? Math.sin(Math.PI * ice) * (d < 200 ? 1 : 0.5) : 0;
  out.snow = ice * (d < 200 ? 1 - smoothstep(LOCAL_ICE.out - 18, LOCAL_ICE.out - 6, d) : smoothstep(LOCAL_ICE.in + 3, LOCAL_ICE.in + 16, d));
  return out;
}
// how much water stands on the ground (terrain.js groundMire, 0..1) from its wetness (site.js wet) and the level above
export function mireOf(wet, level) {
  const base = smoothstep(0.62, 0.95, wet);
  return level < 0 ? base : base * (0.18 + 0.82 * level) + 0.6 * level * (1 - base);
}

// ---- the forest types (d1-forest-rock's legend) ------------------------------------------------------------------
// Each tree type's species mix, in placement.js SPECIES names (spruce = white spruce and balsam fir; tallPine = the old
// white pine over the canopy; ash = black ash), from the NatureServe descriptions behind the EVT classes (forest-rock
// manifest forestTypes[].species). A prior on placement.js treeWeights: the habitat still decides within a cell.
// `open`: how much of a forest the type stands for, 1 for the tree types; the open kinds keep a few trees or none.
export const FOREST = {
  1: { key: 'water', open: -1 },
  2: { key: 'pineBlackSpruce', open: 1, species: { jackPine: 0.4, blackSpruce: 0.3, birch: 0.1, aspen: 0.1, spruce: 0.05, redPine: 0.03, whitePine: 0.02 } },
  3: { key: 'pineSpruceHardwood', open: 1, species: { jackPine: 0.25, blackSpruce: 0.2, aspen: 0.2, birch: 0.2, spruce: 0.1, redPine: 0.05 } },
  4: { key: 'jackRedPine', open: 1, species: { jackPine: 0.5, redPine: 0.25, blackSpruce: 0.1, whitePine: 0.05, birch: 0.05, aspen: 0.05 } },
  5: { key: 'redWhitePine', open: 1, species: { whitePine: 0.3, redPine: 0.3, tallPine: 0.05, spruce: 0.1, birch: 0.15, aspen: 0.05, cedar: 0.05 } },
  6: { key: 'pinePlantation', open: 1, species: { redPine: 0.85, jackPine: 0.1, whitePine: 0.05 } },
  7: { key: 'aspenBirch', open: 1, species: { aspen: 0.4, birch: 0.3, spruce: 0.15, blackSpruce: 0.05, whitePine: 0.05, cedar: 0.05 } },
  8: { key: 'spruceFir', open: 1, species: { spruce: 0.5, birch: 0.2, aspen: 0.1, cedar: 0.1, whitePine: 0.05, blackSpruce: 0.05 } },
  9: { key: 'northernHardwood', open: 1, species: { birch: 0.45, aspen: 0.2, spruce: 0.2, whitePine: 0.1, cedar: 0.05 } },
  10: { key: 'conifersBog', open: 1, species: { blackSpruce: 0.65, tamarack: 0.3, cedar: 0.05 } },
  11: { key: 'cedarSwamp', open: 1, species: { cedar: 0.5, tamarack: 0.15, spruce: 0.15, blackSpruce: 0.1, birch: 0.1 } },
  12: { key: 'floodplainForest', open: 1, species: { ash: 0.3, birch: 0.2, aspen: 0.25, spruce: 0.1, cedar: 0.15 } },
  13: { key: 'openBog', open: 0.14, species: { blackSpruce: 0.7, tamarack: 0.3 } },
  14: { key: 'sedgeFen', open: 0.08, species: { tamarack: 0.6, blackSpruce: 0.4 } },
  15: { key: 'shrubSwamp', open: 0.12, species: { tamarack: 0.4, blackSpruce: 0.3, aspen: 0.3 } },
  16: { key: 'marsh', open: 0 },
  17: { key: 'wetMeadow', open: 0.03 },
  18: { key: 'uplandShrub', open: 0.25, species: { aspen: 0.5, birch: 0.25, jackPine: 0.25 } },
  19: { key: 'openMeadow', open: 0.06, species: { aspen: 0.5, jackPine: 0.3, birch: 0.2 } },
  20: { key: 'farmland', open: 0 },
  21: { key: 'rockCliff', open: 0.1 },
  22: { key: 'developed', open: 0.05 },
  23: { key: 'forestUnknown', open: 1 },
};
// the hardwood swamp's own mix, whatever the type over it says (NWI is the authority on the wetlands)
export const SWAMP_SPECIES = {
  2: { blackSpruce: 0.7, tamarack: 0.3 },
  3: { blackSpruce: 0.62, tamarack: 0.33, cedar: 0.05 },
  4: { tamarack: 0.35, blackSpruce: 0.25, aspen: 0.2, birch: 0.2 },
  7: { ash: 0.5, cedar: 0.15, birch: 0.12, tamarack: 0.1, blackSpruce: 0.08, aspen: 0.05 },
};
// The open types and what grows in them instead of trees (placement.js understory): their meadow (sedge and grass, the
// grass of a burn or a clearing) and their brush.
export const OPEN_FOREST = { 13: { meadow: 0.45 }, 14: { meadow: 0.7 }, 15: { meadow: 0.2 }, 16: { meadow: 1 }, 17: { meadow: 1 }, 18: { meadow: 0.35 }, 19: { meadow: 0.9 }, 20: { meadow: 1 }, 22: { meadow: 0.7 } };

// ---- the bedrock (MGS D-05 units, the forest-rock manifest's palette and cliff styles) -----------------------------
// face: the weathered, lichen-free face; style: how it breaks (cliffs.js builds a cliff family for each kind of break,
// placement.js picks the rocks' shapes by it). The game's rock was drawn as the granite of unit 0 (#9c958e), so a unit
// tints the rock by its face over that.
export const ROCK = [
  { key: 'unmapped', face: 0x9c958e, style: 'blocky' },
  { key: 'lacLaCroixGranite', face: 0xa69a90, style: 'blocky' },
  { key: 'saganagaTonalite', face: 0xa7a6a0, style: 'blocky' },
  { key: 'graniticPluton', face: 0xa2978f, style: 'blocky' },
  { key: 'graniteMigmatite', face: 0x9c968f, style: 'banded' },
  { key: 'biotiteSchist', face: 0x8b8882, style: 'slabby' },
  { key: 'amphibolite', face: 0x71736c, style: 'slabby' },
  { key: 'greenstone', face: 0x7d8573, style: 'knobby' },
  { key: 'felsicVolcanic', face: 0xa39e8f, style: 'angular' },
  { key: 'knifeLakeSlate', face: 0x70736e, style: 'slabby' },
  { key: 'ironFormation', face: 0x6c5b53, style: 'banded' },
  { key: 'anorthosite', face: 0xb3afa7, style: 'rounded' },
  { key: 'troctoliteGabbro', face: 0x8c8172, style: 'rounded' },
  { key: 'granophyre', face: 0xa9887b, style: 'blocky' },
  { key: 'diabaseSill', face: 0x60615d, style: 'columnar' },
  { key: 'gabbroSill', face: 0x6f6d67, style: 'massive' },
  { key: 'roveSlate', face: 0x5e605e, style: 'flaggy' },
  { key: 'sandstone', face: 0xb59d81, style: 'bedded' },
  { key: 'basalt', face: 0x6f6661, style: 'stepped' },
  { key: 'rhyolite', face: 0x9d8075, style: 'blocky' },
];
// The cliff families (cliffs.js builds each; vegetation.js CLIFF_FAMILIES lists their variants): 0 columns (the
// diabase palisades, the massive gabbro), 1 blocks (the granites: joint blocks and whalebacks), 2 slabs (the slates and
// schists: steep thin plates along the foliation, the shelving volcanics and the beds), 3 rounded (the anorthosite and
// the troctolite: domes that crumble, few clean faces).
export const STYLE_FAMILY = { columnar: 0, massive: 0, blocky: 1, banded: 1, knobby: 1, angular: 1, slabby: 2, flaggy: 2, stepped: 2, bedded: 2, rounded: 3 };
// The rock shapes a style favours (placement.js rockFeatures): the odds of a slanted group, a stack of flats and an erratic,
// as multipliers on today's (1, 1, 1 = as before).
export const STYLE_ROCKS = {
  blocky: [1, 0.9, 1.1], banded: [0.9, 1.2, 1], knobby: [0.8, 0.7, 1.5], angular: [1.4, 0.7, 0.9], slabby: [1.6, 1.4, 0.4],
  flaggy: [1.1, 2.0, 0.3], stepped: [0.9, 1.8, 0.5], bedded: [0.6, 2.2, 0.4], rounded: [0.35, 0.8, 2.0], columnar: [1.5, 0.6, 0.8], massive: [1.2, 0.6, 1.3],
};
const lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const rgb = (h) => [lin(((h >> 16) & 255) / 255), lin(((h >> 8) & 255) / 255), lin((h & 255) / 255)];
// A unit's tint over the game's granite, in linear light, eased toward 1 (TINT_K) and held to TINT_RANGE, so the darkest
// slates still read as rock in the shade and the anorthosite does not go white in the sun
export const TINT_K = 0.6, TINT_RANGE = [0.5, 1.16];
export const ROCK_TINT = ROCK.map((u) => {
  const a = rgb(u.face), b = rgb(ROCK[0].face), t = a.map((v, i) => (v / b[i]) ** TINT_K);
  // (held to the range as a whole, so a pale unit keeps its own cast: the anorthosite cool, the sandstone warm)
  const hi = Math.max(...t), lo = Math.min(...t), k = hi > TINT_RANGE[1] ? TINT_RANGE[1] / hi : lo < TINT_RANGE[0] ? TINT_RANGE[0] / lo : 1;
  return t.map((v) => v * k);
});

// ---- the LiDAR's form byte -------------------------------------------------------------------------------------
// class 3 a face (a 2 m pixel at 50° or more and 3 m of relief in the cell): strength the cell's relief, m (to 25);
// class 2 talus or a ledge (30–50° and 30 cm rough): strength the roughness / 4 cm; class 1 a boulder field (under 30°
// and 25 cm rough): likewise; byte 1 = the LiDAR saw nothing of the kind; byte 0 = no LiDAR (Ontario, the voids).
export const CLIFF = { none: 0, boulder: 1, talus: 2, face: 3 };
export const cliffClass = (b) => b >> 6;
export const cliffStrength = (b) => b & 63;

// Rock instance tints carry the unit (placement.js emits tint + UNIT_TAG * unit for the rocks; tile-worker.js
// instanceData unpacks it into the unit's colour), so no float more is needed per instance
export const UNIT_TAG = 4;
export function unpackTint(t, out) {
  const u = t >= UNIT_TAG ? Math.min(ROCK.length - 1, Math.floor(t / UNIT_TAG)) : 0;
  const base = t - u * UNIT_TAG, k = ROCK_TINT[u];
  out[0] = base * k[0]; out[1] = base * k[1]; out[2] = base * k[2];
  return out;
}
