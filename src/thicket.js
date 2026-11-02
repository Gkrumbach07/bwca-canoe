import * as THREE from 'three';
import { hash2, fbm, smoothstep } from './rng.js';
import { KIND, WCLASS, FOREST, CLIFF, cliffClass, wclass1, wclass2, emergentGrow } from './land.js';
import { burnLook } from './burns.js';
import { GUEST } from './placement.js';
import { mirePoolAt } from './mire-relief.js';

// The near ring (the density round, 2026-11-01). The owner: "the biggest thing i notice is how much more open our game
// is compared to real life ... I don't want to walk through that vs that looks walkable. right now everything seems
// walkable bc it is so open." A black spruce bog stands 1,500–2,500 stems a hectare, an alder swamp a head-high wall,
// a marsh a field of cattail taller than you; the tiles draw a few dozen trees a hectare there, which is all a whole
// tile can afford. So round the camera, and only there, the wetlands are filled in: the bog's poles, live, dead-topped
// and dead, and its young spruce; the alder's wall; the leatherleaf and Labrador tea as one lumpy surface; the
// tamarack's open stands; the black ash on its mounds and the logs under it; the marsh's cattail, bulrush and sedge.
// Within a wetland you should not see past 15 or 20 m; the trails, the campsites and the yards stay clear (the tiles'
// exclusions), so they read as the way.
//
// How: the ground is cut into CHUNK m squares (two of the world's 10 m cells). A chunk's plants are worked out once,
// the first time it comes within reach, from the cells' NWI classes (land.js WCLASS, the second class in patches as
// wetlandMix makes them) or, where there is no code, the ground kind; every plant is seeded from its cell, so a chunk
// grows the same plants whenever it comes back. Each layer reaches its own distance (LAYERS reach) and thins out over
// the last quarter of it, by a number of each plant's own, so the edge of the ring has no line. The plants are drawn
// with the tiles' own geometry and materials (the vegetation kit's variants, the lake plants' reed clumps on land:
// aquatic.js kind 4), so they take the season, the wind and the light as the tiles' do; one instanced mesh per variant,
// a second for the near ones, which alone cast shadows. The meshes are filled again only when the camera crosses a
// chunk (or a chunk comes in, or the detail ground moves under one): a few thousand matrices, every few seconds.
// Nothing here is a trunk: the walker pushes through it (the brush slows the walk: brushAt, player.js).

export const CHUNK = 20;
const SHADOW_R = 30;          // only the plants within this of the camera's chunk cast shadows
const BUDGET = 3;
const FAR = 2;                // the variants a layer draws past SHADOW_R (LAYERS far: its own)             // ms a frame may spend working out chunks (a teleport fills the ring over a few frames)
// The layers: the geometry they draw (kit species index and the variants, or the land reeds), how far they reach (m),
// the most a hectare holds anywhere (their candidates per cell), their pad off a trail or a site (m), the shore distance
// they keep (m), how deep they sink, and how they scale. `pick(h)` chooses a variant from a number in [0, 1).
export const LAYERS = {
  pole: { sp: 1, variants: [18, 19, 20, 21, 22, 23], far: 3, scale: GUEST[25][2], reach: 100, pad: 1.1, shore: 0.9, sink: 0.35, pick: (h) => (h < 0.13 ? 5 : h < 0.25 ? 1 : h < 0.36 ? 4 : h < 0.6 ? 0 : h < 0.82 ? 3 : 2) },
  alder: { sp: 11, variants: [0, 1, 2, 3, 4, 5], reach: 85, pad: 0.5, shore: 0.2, sink: 0.12 },
  shrub: { sp: 7, variants: [0, 1, 2, 3], shadow: false, reach: 50, pad: 0.4, shore: 0.25, sink: 0.3 },
  mat: { sp: 24, variants: [0, 1, 2, 3], shadow: false, reach: 55, pad: 0.3, shore: 0.4, sink: 0.08 },
  tamarack: { sp: 17, variants: [0, 1, 3, 4], reach: 100, pad: 1.2, shore: 0.9, sink: 0.35 },
  ash: { sp: 3, variants: [18, 19, 20, 21], reach: 95, pad: 1.2, shore: 0.9, sink: 0.35, scale: GUEST[23][2] }, // (the birch's bins hold the ash's variants after the aspen's, the spruce's the poles' after the black spruce's)
  log: { sp: 14, variants: [0, 1], shadow: false, reach: 60, pad: 1.6, shore: 0.6, sink: 0.04, log: true },
  reed: { reeds: [2, 0, 3], far: 3, reach: 70, pad: 0.4, shore: -0.2, sink: 0.05 }, // cattail, bulrush, sedge
  // stage 2, the upland: (the join: the understory's reach shortened, 60-80 m to 50-62: under a canopy nothing past
  // 40 m shows, and it was the ring's biggest draw) young balsam fir (the sapling, up to 6 m), beaked hazel, mountain maple and the like (the shrub,
  // stood taller), jack pine poles, the aspen suckers and young jack pine of a burn's regrowth, the old forest's snags
  fir: { sp: 12, variants: [0, 1, 2, 3], reach: 62, pad: 0.6, shore: 0.8, sink: 0.1 },
  hazel: { sp: 10, variants: [0, 1, 2, 3], reach: 55, pad: 0.4, shore: 1.5, sink: 0.08 },
  jack: { sp: 9, variants: [0, 1, 3, 4], reach: 85, pad: 1.4, shore: 0.9, sink: 0.35, trunk: 0.16 },
  regrow: { sp: 22, variants: [0, 1, 2, 3], reach: 62, pad: 0.4, shore: 0.8, sink: 0.1 },
  snag: { sp: 5, variants: [0, 1, 3], reach: 100, pad: 1.2, shore: 0.9, sink: 0.35 },
  // stage 2, the canopy from the data (canopyOf): the trees of the stand's own species, as many as its cover and its
  // crowns' size make, less what the tiles stand there already; their trunks are held off like the tiles' (trunksNear)
  cWhitePine: { sp: 0, variants: [0, 1], reach: 65, pad: 1.4, shore: 0.9, sink: 0.35, trunk: 0.3 },
  cSpruce: { sp: 1, variants: [0, 3], reach: 65, pad: 1.4, shore: 0.9, sink: 0.35, trunk: 0.22 },
  cBSpruce: { sp: 1, variants: [12, 13], scale: GUEST[19][2], reach: 65, pad: 1.4, shore: 0.9, sink: 0.35, trunk: 0.15 },
  cRedPine: { sp: 2, variants: [0, 1], reach: 65, pad: 1.4, shore: 0.9, sink: 0.35, trunk: 0.26 },
  cBirch: { sp: 3, variants: [0, 1], reach: 65, pad: 1.4, shore: 0.9, sink: 0.35, trunk: 0.17 },
  cAspen: { sp: 3, variants: [12, 13], scale: GUEST[18][2], reach: 65, pad: 1.4, shore: 0.9, sink: 0.35, trunk: 0.16 },
  cCedar: { sp: 4, variants: [0, 1], reach: 65, pad: 1.4, shore: 0.9, sink: 0.35, trunk: 0.25 },
  // stage 3, the shore seen from the canoe: dogwood and willow at the waterline, young fir and cedar's like a pace up,
  // alder on the wet banks; reaching further than the rest, as far as a canoe sees a bank clearly
  shoreShrub: { sp: 7, variants: [0, 1], shadow: false, reach: 170, pad: 0.4, shore: 0.2, sink: 0.25, band: [0.2, 5] },
  shoreFir: { sp: 12, variants: [0, 1], reach: 170, pad: 0.6, shore: 0.8, sink: 0.1, band: [0.8, 11] },
  shoreAlder: { sp: 11, variants: [0, 1], reach: 170, pad: 0.5, shore: 0.2, sink: 0.12, band: [0.2, 6] },
};
// What grows in each class, a hectare at full density: [layer, per hectare, scale from, to] (and for the reeds the
// shares of cattail, bulrush and sedge). From the real counts (scratchpad bogs-brief): black spruce 1,500–2,500 stems,
// speckled alder 3,000–8,000, cattail over half the ground; the game stays under them (the ring draws them all
// near you), the tiles' own trees and brush on top of these.
const R = (cat, rush, sedge) => [cat, rush, sedge];
export const GROWS = {
  FO4: [['pole', 760, 0.35, 1.25], ['mat', 2200, 0.85, 1.35], ['log', 45, 0.45, 0.7], ['shrub', 60, 0.6, 0.9]],
  FO2: [['tamarack', 280, 0.35, 0.8], ['pole', 160, 0.35, 1.0], ['alder', 200, 0.65, 1.1], ['mat', 1300, 0.85, 1.3], ['log', 30, 0.45, 0.7]],
  FO: [['pole', 380, 0.4, 1.15], ['alder', 420, 0.85, 1.35], ['tamarack', 80, 0.5, 1.0], ['mat', 400, 0.8, 1.2], ['log', 50, 0.5, 0.8]],
  FO1: [['ash', 170, 0.7, 1.05], ['alder', 380, 0.85, 1.35], ['log', 70, 0.55, 0.9], ['shrub', 120, 0.7, 1.1]],
  SS1: [['alder', 1250, 0.7, 1.25], ['shrub', 160, 0.8, 1.2], ['pole', 25, 0.3, 0.8], ['reed', 250, 0.9, 1.2, R(0.1, 0.1, 0.8)]],
  SS: [['alder', 850, 0.7, 1.2], ['shrub', 300, 0.8, 1.2], ['mat', 400, 0.8, 1.2], ['pole', 40, 0.3, 0.8]],
  SS2: [['tamarack', 300, 0.22, 0.42], ['mat', 2600, 0.8, 1.3], ['pole', 50, 0.25, 0.5]],
  SS3: [['mat', 3300, 0.8, 1.3], ['pole', 80, 0.2, 0.5], ['tamarack', 30, 0.2, 0.4]],
  SS4: [['pole', 520, 0.25, 0.6], ['mat', 2600, 0.8, 1.3], ['tamarack', 30, 0.25, 0.45]],
  EM1: [['reed', 5600, 1.1, 1.6, R(0.62, 0.18, 0.2)], ['alder', 25, 0.9, 1.3], ['pole', 6, 0.5, 1.0]],
  EM2: [['reed', 2600, 0.9, 1.3, R(0.05, 0.6, 0.35)], ['pole', 3, 0.5, 1.0]],
  meadow: [['reed', 900, 0.8, 1.1, R(0.05, 0.1, 0.85)], ['alder', 70, 0.8, 1.2], ['pole', 18, 0.6, 1.1]], // a beaver meadow: sedge, drowned snags
  // Stage 2, the upland by its forest type (land.js FOREST; the owner: "does this same density pass need to be applied to
  // our forested areas too"). Real stands: jack pine–black spruce 1,100–2,500 stems a hectare, aspen-birch 1,000–1,500,
  // old red and white pine fewer and bigger. The tiles keep the canopy (its trunks collide); the ring fills the eye
  // level: the old pines fairly open, the aspen-birch and the spruce-fir thick with hazel, mountain maple and young fir,
  // the jack pine a stand of poles. (regrow's mix: the share of aspen suckers against young jack pine)
  spruceFir: [['fir', 1000, 0.8, 2.2], ['hazel', 420, 0.8, 1.2], ['shrub', 240, 1.3, 1.9], ['snag', 14, 0.7, 1.1], ['log', 60, 0.6, 0.95]],
  aspenBirch: [['hazel', 1000, 0.85, 1.3], ['regrow', 340, 1.2, 2.2, [1]], ['fir', 300, 0.6, 1.6], ['shrub', 200, 1.3, 1.9], ['log', 50, 0.6, 0.95]],
  northernHardwood: [['hazel', 700, 0.85, 1.3], ['shrub', 380, 1.3, 2.0], ['fir', 350, 0.6, 1.7], ['log', 50, 0.6, 0.95]],
  // (the old pines read open: big straight trunks over a needle floor and ferns, a little hazel and young fir, low)
  redWhitePine: [['hazel', 110, 0.6, 0.95], ['fir', 80, 0.5, 1.3], ['shrub', 20, 0.8, 1.2], ['log', 25, 0.7, 1.0]],
  jackRedPine: [['jack', 450, 0.7, 1.3], ['fir', 120, 0.6, 1.4], ['hazel', 200, 0.8, 1.2], ['regrow', 150, 1.0, 1.8, [0.2]], ['snag', 10, 0.6, 1.0]],
  pineBlackSpruce: [['jack', 300, 0.7, 1.3], ['pole', 350, 0.6, 1.2], ['hazel', 150, 0.8, 1.2], ['fir', 100, 0.6, 1.4]],
  pineSpruceHardwood: [['fir', 400, 0.6, 1.8], ['hazel', 450, 0.8, 1.25], ['jack', 150, 0.7, 1.2], ['regrow', 150, 1.1, 2.0, [0.6]], ['shrub', 150, 1.3, 1.9], ['log', 40, 0.6, 0.95]],
  pinePlantation: [['hazel', 120, 0.8, 1.1], ['fir', 60, 0.6, 1.2]],
  conifersBog: [['pole', 450, 0.35, 1.15], ['mat', 1000, 0.85, 1.3]],
  cedarSwamp: [['fir', 300, 0.6, 1.7], ['alder', 350, 0.8, 1.2], ['log', 80, 0.6, 0.95], ['snag', 10, 0.6, 1.0]],
  floodplainForest: [['alder', 400, 0.8, 1.3], ['hazel', 300, 0.8, 1.2], ['fir', 200, 0.6, 1.5], ['log', 60, 0.6, 0.95]],
  forestUnknown: [['fir', 450, 0.6, 1.7], ['hazel', 500, 0.8, 1.25], ['shrub', 150, 1.2, 1.8], ['log', 40, 0.6, 0.95]],
  uplandShrub: [['hazel', 1300, 0.85, 1.3], ['regrow', 300, 1.0, 2.0, [0.7]], ['shrub', 300, 1.2, 1.8]],
  openMeadow: [['shrub', 60, 1.0, 1.5], ['hazel', 60, 0.8, 1.1]],
  // bare rock, a ledge, talus, a boulder field (bareAt): a few wind-bent jack and white pine and birch in its cracks,
  // juniper and blueberry low; the granite shows between (a BWCA rock point, not a wall)
  rock: [['jack', 60, 0.45, 1.0], ['cWhitePine', 9, 0.45, 0.95], ['cRedPine', 5, 0.5, 0.9], ['cBirch', 10, 0.4, 0.8], ['shrub', 45, 0.4, 0.75]],
  // a burn (burns.js): the regrowth as thick as the burn's thicket and as tall as its age, the old forest's snags standing
  burn: [['regrow', 2600, 1, 1, [0.45]], ['snag', 120, 1.0, 1.35]],
  // the shore band, on top of whatever the cell grows (stage 3): per hectare of the band itself
  shore: [['shoreShrub', 2600, 1.3, 2.0], ['shoreFir', 1000, 1.3, 2.6], ['shoreAlder', 550, 0.9, 1.4]],
};
// The canopy from the agency data (the owner, stage 2: "the density should come from the data, not a guess"):
// LANDFIRE's cover (EVC, %) over the crown area of the type's trees at its height (EVH): crowns standing at random
// cover 1 - exp(-N a) of the ground, so trees a hectare N = -ln(1 - cover) x 10,000 m2 / a, a the mean crown area over
// the type's species mix (land.js FOREST species), each species' crown radius at 15 m (CROWN: a black spruce's 0.85 m,
// a jack pine's 1.0, a spruce's 1.4, an aspen's or a birch's 2.0-2.2, an old red or white pine's 2.3-3.0) scaled
// with the stand's height. At 55 % cover that is about 1,100 a hectare in jack pine and black spruce, 650 in aspen
// and birch, 340 under the old pines (USFS and UMN: 1,100-2,500; 400-800 overstory; fewer and bigger). Thinner on a ridge, on bare rock, a boulder
// field and stony ground (the bedrock and the soil survey's planes), a little thicker in a hollow. The tiles already
// stand TILE_TREES a hectare there (measured on the live site, 2026-11-01), so the ring adds the rest; a share of it
// is the subcanopy, the same species at half the height.
const CROWN = { whitePine: 3.0, tallPine: 3.5, spruce: 1.4, redPine: 2.3, birch: 2.2, cedar: 1.6, jackPine: 1.0, tamarack: 1.3, aspen: 2.0, blackSpruce: 0.85, ash: 2.2 };
const CANOPY_LAYER = { whitePine: 'cWhitePine', tallPine: 'cWhitePine', spruce: 'cSpruce', redPine: 'cRedPine', birch: 'cBirch', cedar: 'cCedar', jackPine: 'jack', tamarack: 'tamarack', aspen: 'cAspen', blackSpruce: 'cBSpruce', ash: 'ash' };
const NOMINAL_H = { cWhitePine: 16, cSpruce: 12.5, cRedPine: 15, cBirch: 10.5, cCedar: 8, jack: 9, tamarack: 13, cAspen: 13, cBSpruce: 11, ash: 15 };
export const TILE_TREES = 60, SUBCANOPY = 0.3;
// (under the old pines the young growth is a few pines and fir, not birch and aspen at eye level)
const SUB_BY_TYPE = { redWhitePine: 0.08 }, SUB_BROADLEAF = { redWhitePine: 0 };
export function canopyOf(world, tiles, x, z) {
  const F = FOREST[world.chAt('forest', x, z)];
  if (!F || F.open !== 1 || !F.species) return null;
  const cover = world.chAt('cover', x, z), m = world.chAt('canopy', x, z) / 10;
  if (!(cover > 0) || !(m > 0)) return null;
  const hs = Math.min(1.1, Math.max(0.5, (m / 15) ** 0.7));
  let a2 = 0, sum = 0;
  for (const k in F.species) if (CROWN[k]) { a2 += F.species[k] * (CROWN[k] * hs) ** 2; sum += F.species[k]; }
  if (!(a2 > 0)) return null;
  const area = Math.PI * a2 / sum;
  // the ground: a ridge (the cell over the mean of four points 25 m off), bare rock, a boulder field, stony soil
  const h0 = tiles.groundAt(x, z), mean = (tiles.groundAt(x + 25, z) + tiles.groundAt(x - 25, z) + tiles.groundAt(x, z + 25) + tiles.groundAt(x, z - 25)) / 4;
  const tpi = h0 - mean, kd = world.chAt('ground', x, z), cb = world.chAt('cliff', x, z), st = world.chAt('stone', x, z);
  let k = (1 - 0.5 * smoothstep(1.5, 6, tpi)) * (1 + 0.15 * smoothstep(1.5, 5, -tpi));
  if (kd === KIND.rock) k *= 0.35;
  if (cb > 1 && (cliffClass(cb) === CLIFF.boulder || cliffClass(cb) === CLIFF.talus)) k *= 0.6;
  if (st > 0 && st < 255) k *= 1 - 0.5 * smoothstep(0.1, 0.5, st / 254);
  const n = -Math.log(1 - Math.min(0.95, cover / 100)) * 10000 / area * k, add = Math.max(0, n - TILE_TREES);
  const rows = [];
  for (const sp in F.species) {
    const L = CANOPY_LAYER[sp];
    if (!L || !F.species[sp]) continue;
    const share = F.species[sp] / sum, nom = NOMINAL_H[L];
    const s = L === 'jack' ? Math.min(1.8, Math.max(0.6, m / 9)) : Math.min(1.3, Math.max(0.5, m / nom));
    const sub = SUB_BY_TYPE[F.key] ?? SUBCANOPY, broad = L === 'cBirch' || L === 'cAspen' ? SUB_BROADLEAF[F.key] ?? 1 : 1;
    rows.push([L, add * share * (1 - sub), s * 0.8, s * 1.12], [L, add * share * sub * broad, s * 0.4, s * 0.7]);
  }
  return { n, add, cover, m, crown: Math.sqrt(area / Math.PI), k, tpi, rows };
}

// the ground kind's class where the NWI gives no code (Ontario, and the odd cell)
const KIND_CLASS = { [KIND.openBog]: 'SS3', [KIND.coniferBog]: 'FO4', [KIND.shrubSwamp]: 'SS1', [KIND.marsh]: 'EM1', [KIND.wetMeadow]: 'meadow', [KIND.hardwoodSwamp]: 'FO1', [KIND.water]: 'meadow' };
// how much of each layer is in the way of a walker, per plant a hectare at the class's numbers (brushAt)
// (the upland's at half: the woods are walked in all day, the brush there slows the walk, it does not stop it)
const BRUSH = { alder: 1 / 900, reed: 1 / 4500, pole: 1 / 1400, mat: 1 / 6000, shrub: 1 / 4000, tamarack: 1 / 2000, ash: 0, log: 0, fir: 1 / 3600, hazel: 1 / 3000, jack: 1 / 5000, regrow: 1 / 2400, snag: 0 };

// The class of a 10 m cell: its NWI class (the second one on part of it, as land.js wetlandMix lays the patches), else
// its ground kind's, else on the upland its forest type's (stage 2; bare rock its own); null in the water's own classes
function classOf(world, x, z) {
  const c = wetClassOf(world, x, z);
  if (c !== undefined) return c;
  const kd = world.chAt('ground', x, z);
  if (kd === KIND.rock) return 'rock';
  if (kd === KIND.sand || kd === KIND.boulder) return 'openMeadow';
  const F = FOREST[world.chAt('forest', x, z)];
  return F ? (GROWS[F.key] ? F.key : null) : 'forestUnknown';
}
function wetClassOf(world, x, z) {
  const wc = world.chAt('wcls', x, z);
  if (wc) {
    const A = WCLASS[wclass1(wc)], B = WCLASS[wclass2(wc)];
    if (A && A.trees !== undefined) {
      if (B && B !== A && B.trees !== undefined && smoothstep(0.59, 0.64, fbm(x * 0.022 + 31, z * 0.022 - 17, 2, 263)) > 0.5) return B.code;
      return A.code;
    }
    if (A) return null;
  }
  return KIND_CLASS[world.chAt('ground', x, z)];
}
// how thick the brush is at a point, 0 open .. 1 a wall: the walk slows through it (player.js); 0 in the clearings
// (the trails', sites' and yards'), the tread itself the caller's too
let ring = null; // the Thicket, for its clearings (a yard, a site, a landing walk clear)
export function brushAt(world, x, z) {
  if (!world.chAt || (ring && ring.blocked(x, z, 0))) return 0;
  const c = bareAt(world, x, z) ? 'rock' : classOf(world, x, z), G = c && GROWS[c];
  if (!G) return 0;
  let b = 0;
  for (const [layer, n] of G) b += n * (BRUSH[layer] || 0);
  return Math.min(1, b);
}

// Bare ground the ring keeps off (but for GROWS.rock's few): a cliff's face anywhere; at the water (within 25 m) rock
// outcrop, a boulder field, talus and a ledge (the LiDAR's form byte, nearer the water), and a stony shore (the soil survey's stone over a
// third of the ground); inland the same only where the canopy is open (LANDFIRE cover under 25 %): an outcrop under a
// closed canopy is the rocky woods (classOf 'rock', canopyOf thins it), not a hole in them. Asked of every plant's own
// spot, so a neighbour's plants don't spill onto it.
export function bareAt(world, x, z) {
  const cb = world.chAt('cliff', x, z), cc = cb > 1 ? cliffClass(cb) : CLIFF.none;
  if (cc === CLIFF.face) return true;
  const kd = world.chAt('ground', x, z), st = world.chAt('stone', x, z);
  const rocky = kd === KIND.rock || kd === KIND.boulder || cc !== CLIFF.none || (st > 150 && st < 255);
  if (!rocky) return false;
  if (world.chAt('cover', x, z) < 25) return true;
  // (the LiDAR's rough ground at the water is often only a steep wooded bank: a ledge or talus bare to 15 m, a boulder
  // field to the waterline's 8 m; the mapped outcrop and the stony shore to 25 m)
  const sd = world.shoreAt(x, z), mapped = kd === KIND.rock || kd === KIND.boulder || (st > 150 && st < 255);
  return sd < (mapped ? 25 : cc === CLIFF.talus ? 15 : 8);
}
const ON_ROCK = new Set(['jack', 'cWhitePine', 'cRedPine', 'cBirch', 'shrub']);
// the standing plants a pool keeps out of (mirePoolAt): they give way to the sedge and cattail at its rim
const POOL_SHY = new Set(['pole', 'alder', 'shrub', 'mat', 'tamarack', 'ash', 'log', 'fir', 'hazel', 'snag', 'cBSpruce']);
const WET = new Set([...Object.keys(KIND_CLASS).map((k) => KIND_CLASS[k]), 'FO4', 'FO2', 'FO', 'FO1', 'SS1', 'SS', 'SS2', 'SS3', 'SS4', 'EM1', 'EM2', 'meadow']);
const _B = {};
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _e = new THREE.Euler(), _c = new THREE.Color();

export class Thicket {
  // tiles: the TileManager (groundAt, the world); exclusions: the trails', sites' and yards' segments (props.js
  // exclusionsFor: [x1, z1, x2, z2, radius], a negative radius a yard); yards: (x, z, pad) => whether a store's yard
  // holds (x, z) (props.js yardBlocked: a store stands where its landing's search put it, often outside the mown lawn
  // round the entry point, and the ring's poles and canopy grew up through Missing Link's: round world, 2026-11-02)
  constructor(tiles, scene, exclusions, { kit, aquatic, cull = null, yards = null }) {
    this.tiles = tiles; this.world = tiles.world; this.scene = scene;
    this.yards = yards;
    this.cull = cull; this.under = cull ? cull.understory : 1;
    ring = this; // (tiles.js CULL: the Undergrowth setting thins the ring too)
    this.group = new THREE.Group();
    this.group.name = 'thicket';
    this.group.matrixAutoUpdate = false;
    scene.add(this.group);
    this.chunks = new Map();  // key -> { ci, cj, lists: Map(bucket -> Float64Array rows), touched }
    this.want = [];           // chunk keys waiting to be worked out, nearest first
    this.at = null;           // the camera's chunk [ci, cj]
    this.dirty = true;
    this.doy = 180;
    this.enabled = !(typeof location !== 'undefined' && /[?&]thicket=off\b/.test(location.search));
    // the trails, sites and yards, bucketed into 64 m cells
    this.ex = new Map();
    for (const s of exclusions) {
      const r = Math.abs(s[4]) + 2, x0 = Math.floor((Math.min(s[0], s[2]) - r) / 64), x1 = Math.floor((Math.max(s[0], s[2]) + r) / 64);
      const z0 = Math.floor((Math.min(s[1], s[3]) - r) / 64), z1 = Math.floor((Math.max(s[1], s[3]) + r) / 64);
      for (let j = z0; j <= z1; j++) for (let i = x0; i <= x1; i++) { const k = i * 100003 + j; const a = this.ex.get(k); if (a) a.push(s); else this.ex.set(k, [s]); }
    }
    // the buckets: one per layer and variant, each an inner (shadow-casting) and an outer mesh
    this.buckets = [];
    for (const [name, L] of Object.entries(LAYERS)) {
      L.name = name; L.index = {};
      const list = L.reeds || L.variants;
      list.forEach((v, k) => {
        let geo, mat, depth;
        if (L.reeds) { if (!aquatic || !aquatic.land) return; geo = aquatic.land.geos[v]; mat = aquatic.land.mat; depth = aquatic.land.depth; }
        else { const V = kit.variants[L.sp][v]; if (!V) return; geo = V.full; mat = kit.materialFor(L.sp); depth = kit.depthFor(L.sp); }
        // (shadows only from the trunks, the bog's poles and the alder: the rest is lost in the shade they make, and the
        // shadow passes cost more than they show)
        const b = { layer: L, k, geo, mat, depth, n: 0, meshes: [], shadow: L.shadow !== false && (!!L.trunk || name === 'pole' || name === 'alder') };
        L.index[k] = this.buckets.length;
        this.buckets.push(b);
      });
      // (past the near ring a layer draws FAR variants only: at 30 m and more the shapes can't be told apart, and every
      // variant is a draw call in each of the four quarters)
      const nf = L.far || FAR;
      list.forEach((v, k) => { const b = this.buckets[L.index[k]]; if (b) b.far = L.index[k % nf] ?? L.index[k]; });
    }
  }

  // inside a trail's, a site's or a yard's clearing, grown by pad?
  blocked(x, z, pad) {
    if (this.yards && this.yards(x, z, pad)) return true;
    const a = this.ex.get(Math.floor(x / 64) * 100003 + Math.floor(z / 64));
    if (!a) return false;
    for (const s of a) {
      const dx = s[2] - s[0], dz = s[3] - s[1], L2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((x - s[0]) * dx + (z - s[1]) * dz) / L2));
      if (Math.hypot(x - s[0] - dx * t, z - s[1] - dz * t) < Math.abs(s[4]) + pad) return true;
    }
    return false;
  }

  setSeason(season) {
    const d = season.doy | 0;
    // the wild rice's kin die back and come up again with the season: worked out again when the date has moved
    if (Math.abs(d - this.doy) >= 4) { this.doy = d; this.reset(); }
  }
  // every chunk worked out again (the date moved, or a test asks)
  // (and planned again from where the camera stands: without it a camera that stays in its chunk, asleep at camp, keeps
  // an empty ring)
  reset() { this.chunks.clear(); this.want.length = 0; this.at = null; this.dirty = true; }
  // the detail ground moved under rect [x0, z0, x1, z1] (detail.js): the chunks there are seated again
  touched(rect) {
    for (const [key, c] of this.chunks) {
      const x0 = c.ci * CHUNK, z0 = c.cj * CHUNK;
      if (x0 > rect[2] || x0 + CHUNK < rect[0] || z0 > rect[3] || z0 + CHUNK < rect[1]) continue;
      this.chunks.delete(key);
      this.want.unshift(key);
    }
    this.dirty = true;
  }

  // Work out one chunk: every 10 m cell's plants, seeded from the cell
  build(ci, cj) {
    const w = this.world, lists = new Map(), em2 = emergentGrow(this.doy);
    const add = (bi, row) => { let a = lists.get(bi); if (!a) lists.set(bi, (a = [])); a.push(...row); };
    let ready = true;
    for (let sj = 0; sj < 2; sj++) for (let si = 0; si < 2; si++) {
      const cx = ci * CHUNK + si * 10 + 5, cz = cj * CHUNK + sj * 10 + 5;
      if (!w.isReady(cx, cz)) { ready = false; continue; }
      const gi = Math.round(cx / 10), gj = Math.round(cz / 10);
      let cls = classOf(w, cx, cz);
      const sd = w.shoreAt(cx, cz), bare = bareAt(w, cx, cz);
      if (bare) cls = 'rock';
      // a burn (stage 2): its regrowth and its snags in place of the stand's own understory, as far as the burn reached
      const B = cls && !WET.has(cls) && sd > -4 ? burnLook(cx, cz, _B, Math.max(1, sd)) : null;
      const burnt = B && B.kind !== 0 && (B.thicket > 0.05 || B.snags > 0.05);
      if (burnt) cls = 'burn';
      const G = cls ? GROWS[cls] : null, wet = WET.has(cls);
      const shore = !bare && sd > -8 && sd < 16; // the shore band (stage 3; not on a ledge)
      if (!G && !shore) continue;
      // nothing on a cliff's face, thinner up a steep slope
      const cb = w.chAt('cliff', cx, cz);
      if (cb > 1 && cliffClass(cb) === CLIFF.face) continue;
      const steep = 1 - 0.8 * smoothstep(0.45, 1.0, w.slopeAt ? w.slopeAt(cx, cz) : 0);
      // patches: the stand thicker and thinner over a few tens of metres (0.55 .. 1.35)
      const patch = 0.55 + 0.8 * smoothstep(0.3, 0.7, fbm(cx * 0.035 + 7, cz * 0.035 - 3, 2, 911));
      let all = shore ? [...(G || []), ...GROWS.shore] : G;
      // the canopy from the data, on the upland's forest (not in a burn: its trees are the burn's)
      if (G && !burnt && !bare && !WET.has(cls)) { const C = canopyOf(w, this.tiles, cx, cz); if (C) all = [...C.rows, ...all]; }
      const nc = all.length - (shore ? GROWS.shore.length : 0);
      // (a shore of bare rock or sand keeps its band open: the ledges and the beaches)
      const kd = shore ? w.chAt('ground', cx, cz) : 0, shoreK = kd === KIND.rock ? 0.25 : kd === KIND.sand ? 0.2 : 1;
      for (let li = 0; li < all.length; li++) {
        const [name, perHa, s0, s1, mix] = all[li], L = LAYERS[name];
        let e = (perHa / 100) * patch * steep * (name === 'reed' && cls === 'EM2' ? em2 : 1);
        if (li >= nc) e *= shoreK;
        if (burnt) e *= name === 'regrow' ? B.thicket * (1 - 0.6 * smoothstep(0.6, 0.9, w.chAt('cover', cx, cz) / 100)) : name === 'snag' ? B.snags : 1;
        if (name === 'mat' || name === 'reed') e *= 0.75 + 0.25 * patch; // (the low layers more even)
        const n = Math.floor(e) + (hash2(gi * 7 + li, gj, 4001) < e - Math.floor(e) ? 1 : 0);
        for (let q = 0; q < n; q++) {
          const H = (s) => hash2(gi * 977 + q * 13 + li * 101, gj * 613 + q * 7, s);
          // a point anywhere in the cell and up to 3 m over its edge, so the cells' edges blur
          const x = cx + (H(1) - 0.5) * 16, z = cz + (H(2) - 0.5) * 16;
          const sx = w.shoreAt(x, z);
          if (sx < L.shore || (L.band && sx > L.band[1]) || this.blocked(x, z, L.pad)) continue;
          // (off the bare rock, but for the rock's own; the rock's own only on it)
          const onRock = bare || bareAt(w, x, z);
          if (onRock && !(bare && ON_ROCK.has(name))) continue;
          // a pool in the mire's hollows (mire-relief.js): nothing stands in it; a stem at its rim gives way to sedge
          let reedAt = -1;
          if (wet && POOL_SHY.has(name)) {
            const pool = mirePoolAt(w, x, z);
            if (pool > 0.85) continue;
            if (pool > 0.3) { reedAt = H(11) < 0.3 ? 0 : 2; if (LAYERS.reed.index[reedAt] === undefined) continue; }
          }
          // (a burn's regrowth as tall as the burn is old: placement.js's thicket, 2 m at unit scale)
          let scale = (s0 + (s1 - s0) * H(3) ** 1.3) * (L.scale || 1);
          if (burnt && name === 'regrow') scale = Math.max(0.15, B.regrow * (0.55 + 0.7 * H(3)) / 2);
          const yaw = H(4) * Math.PI * 2, tint = 0.86 + H(5) * 0.2, fade = H(6);
          let k;
          if (reedAt >= 0) {
            const RL = LAYERS.reed, sc = 0.8 + 0.4 * H(3);
            add(RL.index[reedAt], [x, this.tiles.groundAt(x, z) - RL.sink * sc, z, yaw, sc, tint, fade, 0, 0]);
            continue;
          }
          if (L.reeds) { const r = H(7), m = mix || [1, 0, 0], t = m[0] + m[1] + m[2]; k = r * t < m[0] ? 0 : r * t < m[0] + m[1] ? 1 : 2; }
          else if (name === 'regrow') k = (H(7) < (mix ? mix[0] : 0.5) ? 0 : 1) + (H(10) < 0.5 ? 0 : 2); // (even variants aspen, odd jack pine)
          else k = L.pick ? L.pick(H(7)) : Math.floor(H(7) * L.variants.length);
          const bi = L.index[k];
          if (bi === undefined) continue;
          // a log lies along the ground; the rest stand, the leaning ones a little off plumb
          let y = this.tiles.groundAt(x, z) - L.sink * (L.log ? 1 : scale);
          // (on bare rock the pines and birch wind-bent, 7-16 degrees off plumb)
          const lean = L.log ? 0 : bare ? (0.12 + 0.16 * H(8)) * (H(12) < 0.5 ? -1 : 1) : (H(8) - 0.5) * (name === 'alder' ? 0.3 : name === 'pole' ? 0.12 : 0.06);
          if (L.log) y += 0.05;
          add(bi, [x, y, z, yaw, scale, tint, fade, lean, H(9) * Math.PI * 2]);
        }
      }
    }
    return ready ? lists : null;
  }

  update(camPos) {
    if (!this.enabled) { this.group.visible = false; return; }
    const ci = Math.floor(camPos.x / CHUNK), cj = Math.floor(camPos.z / CHUNK);
    this.frame = (this.frame || 0) + 1;
    if (this.cull && this.cull.understory !== this.under) { this.under = this.cull.understory; this.dirty = true; }
    if (!this.at || this.at[0] !== ci || this.at[1] !== cj || (this.waiting && !this.want.length && this.frame % 20 === 0)) { this.at = [ci, cj]; this.dirty = true; this.waiting = false; this.plan(); }
    // work out the chunks wanted, nearest first, under the budget
    const t0 = performance.now();
    while (this.want.length && performance.now() - t0 < BUDGET) {
      const key = this.want.shift();
      if (this.chunks.has(key)) continue;
      const [a, b] = key.split(',').map(Number);
      const lists = this.build(a, b);
      if (!lists) { this.waiting = true; continue; } // its tile is not in yet: planned again in a moment
      this.chunks.set(key, { ci: a, cj: b, lists });
      this.dirty = true;
    }
    if (this.dirty && (!this.want.length || performance.now() - t0 < BUDGET)) this.fill();
  }
  // the chunks within the farthest reach, nearest first; the ones beyond it let go
  plan() {
    const [ci, cj] = this.at, reach = Math.max(...Object.values(LAYERS).map((L) => L.reach)), n = Math.ceil(reach / CHUNK) + 1;
    const out = [];
    for (let dj = -n; dj <= n; dj++) for (let di = -n; di <= n; di++) {
      const d = Math.hypot(di, dj) * CHUNK - CHUNK;
      if (d > reach) continue;
      const key = `${ci + di},${cj + dj}`;
      if (!this.chunks.has(key)) out.push([d, key]);
    }
    out.sort((a, b) => a[0] - b[0]);
    this.want = out.map((o) => o[1]);
    for (const [key, c] of this.chunks) if (Math.hypot(c.ci - ci, c.cj - cj) * CHUNK - CHUNK > reach + CHUNK * 2) this.chunks.delete(key);
  }
  // every bucket's meshes filled from the chunks in reach: each plant kept by its distance (its layer's reach, thinning
  // over the last quarter), into the inner mesh within SHADOW_R, else the outer
  fill() {
    this.dirty = false;
    const [ci, cj] = this.at, ox = (ci + 0.5) * CHUNK, oz = (cj + 0.5) * CHUNK;
    this.group.position.set(ox, 0, oz);
    this.group.updateMatrix(); this.group.updateMatrixWorld(true);
    // (five meshes a bucket: the near one, which casts the shadows, and the rest in four quarters round the camera, each
    // culled by its own bounds, so what is behind the camera is not drawn)
    const rows = this.buckets.map(() => [[], [], [], [], []]);
    for (const c of this.chunks.values()) {
      const d = Math.max(0, Math.hypot(c.ci - ci, c.cj - cj) * CHUNK - CHUNK * 0.7);
      const inner = d < SHADOW_R ? 0 : 1 + (c.ci >= ci ? 1 : 0) + (c.cj >= cj ? 2 : 0);
      for (const [bi, a] of c.lists) {
        // (the trunks are never thinned: they collide whether drawn or not; the rest by the Undergrowth setting, which
        // shortens their reach too)
        const L = this.buckets[bi].layer, u = L.trunk ? 1 : this.under, reach = L.reach * (0.55 + 0.45 * u);
        const keep = (1 - smoothstep(reach * 0.72, reach, d)) * u;
        if (keep <= 0) continue;
        const into = rows[inner ? this.buckets[bi].far : bi][inner];
        for (let o = 0; o < a.length; o += 9) if (a[o + 6] < keep) into.push(o, a);
      }
    }
    for (let bi = 0; bi < this.buckets.length; bi++) {
      const B = this.buckets[bi];
      for (let part = 0; part < 5; part++) {
        const list = rows[bi][part], n = list.length / 2;
        let mesh = B.meshes[part];
        if (!mesh || mesh.instanceMatrix.count < n) {
          if (mesh) { this.group.remove(mesh); mesh.dispose(); }
          if (!n) { B.meshes[part] = null; continue; }
          mesh = new THREE.InstancedMesh(B.geo, B.mat, Math.ceil(n * 1.3) + 16);
          mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
          mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(mesh.instanceMatrix.count * 3), 3);
          mesh.customDepthMaterial = B.depth;
          mesh.castShadow = part === 0 && B.shadow;
          mesh.receiveShadow = true;
          mesh.frustumCulled = true;
          mesh.boundingSphere = new THREE.Sphere();
          mesh.matrixAutoUpdate = false;
          mesh.userData.thicket = B.layer.name;
          B.meshes[part] = mesh;
          this.group.add(mesh);
          mesh.updateMatrixWorld(true);
        }
        const M = mesh.instanceMatrix.array, C = mesh.instanceColor.array;
        let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, z0 = Infinity, z1 = -Infinity, sMax = 0;
        for (let i = 0; i < n; i++) {
          const o = list[i * 2], a = list[i * 2 + 1];
          const s = a[o + 4], lean = a[o + 7];
          const lx = a[o] - ox, lz = a[o + 2] - oz;
          if (lx < x0) x0 = lx; if (lx > x1) x1 = lx; if (lz < z0) z0 = lz; if (lz > z1) z1 = lz;
          if (a[o + 1] < y0) y0 = a[o + 1]; if (a[o + 1] > y1) y1 = a[o + 1]; if (s > sMax) sMax = s;
          _p.set(a[o] - ox, a[o + 1], a[o + 2] - oz);
          if (B.layer.log) _e.set(0, a[o + 3], 0.04 * Math.sin(a[o + 8]), 'YXZ');
          else _e.set(lean * Math.cos(a[o + 8]), a[o + 3], lean * Math.sin(a[o + 8]), 'YXZ');
          _q.setFromEuler(_e);
          _s.set(s, s, s);
          _m.compose(_p, _q, _s).toArray(M, i * 16);
          const t = a[o + 5];
          C[i * 3] = t; C[i * 3 + 1] = t; C[i * 3 + 2] = t;
        }
        mesh.count = n;
        mesh.visible = n > 0;
        if (n) {
          if (!B.geo.boundingSphere) B.geo.computeBoundingSphere();
          const g = B.geo.boundingSphere;
          mesh.boundingSphere.center.set((x0 + x1) / 2, (y0 + y1) / 2 + g.center.y * sMax, (z0 + z1) / 2);
          mesh.boundingSphere.radius = Math.hypot(x1 - x0, y1 - y0, z1 - z0) / 2 + (g.radius + Math.abs(g.center.y)) * sMax + 1;
        }
        mesh.instanceMatrix.needsUpdate = true;
        mesh.instanceColor.needsUpdate = true;
      }
    }
  }
  // The canopy's trunks within r of (x, z), as tiles.js treesNear gives the tiles' ({ x, z, r }), the trunk's radius a
  // little over the ground at the tree's scale
  trunksNear(x, z, r, out) {
    for (const c of this.chunks.values()) {
      if (Math.abs((c.ci + 0.5) * CHUNK - x) > CHUNK + r || Math.abs((c.cj + 0.5) * CHUNK - z) > CHUNK + r) continue;
      for (const [bi, a] of c.lists) {
        const L = this.buckets[bi].layer;
        if (!L.trunk) continue;
        for (let o = 0; o < a.length; o += 9) {
          const tr = L.trunk * a[o + 4] / (L.scale || 1), d = Math.hypot(a[o] - x, a[o + 2] - z);
          if (d <= r + tr) out.push({ x: a[o], z: a[o + 2], r: tr });
        }
      }
    }
    return out;
  }
  // how many standing stems (not the low mat, the reeds or the logs) stand within r of (x, z): a camera kept out of them
  near(x, z, r) {
    let n = 0;
    for (const c of this.chunks.values()) {
      if (Math.abs((c.ci + 0.5) * CHUNK - x) > CHUNK + r || Math.abs((c.cj + 0.5) * CHUNK - z) > CHUNK + r) continue;
      for (const [bi, a] of c.lists) {
        const L = this.buckets[bi].layer;
        if (L.name === 'mat' || L.reeds || L.log) continue;
        for (let o = 0; o < a.length; o += 9) if (Math.hypot(a[o] - x, a[o + 2] - z) < r) n++;
      }
    }
    return n;
  }
  // how many plants the ring draws now, by layer (for the tests)
  counts() {
    const out = {};
    for (const B of this.buckets) for (const m of B.meshes) if (m) out[B.layer.name] = (out[B.layer.name] || 0) + m.count;
    return out;
  }
}
