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
