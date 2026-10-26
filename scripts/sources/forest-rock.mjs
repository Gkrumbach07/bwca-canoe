#!/usr/bin/env node
// Source stream D1-forest-rock: the forest and the rock under it, fetched from the agencies and cut to the bake's
// 10 m grid, one gzip array per tile per channel under data-cache/forest-rock/, plus manifest.json. Round D2's
// bake reads these; nothing here touches the game.
//
//   forest  uint8  forest type: the game's species groups and the non-forest kinds (FOREST below), from LANDFIRE EVT
//   height  uint8  canopy height in decimetres (trees 1-24 m in the box, shrubs and herbs 0.3-3 m), from LANDFIRE EVH
//   cover   uint8  canopy cover %, of the life form the forest type names, from LANDFIRE EVC
//   rock    uint8  bedrock unit (ROCK below: palette and cliff style), from MGS bedrock geology D-05; 0 outside Minnesota
//   bare    uint8  1 where MGS's bedrock outcrop database D-02 maps bare rock, else 0
//
// Sources (public; see manifest.citation):
//   LANDFIRE LF2024 EVT/EVH/EVC, 30 m, NAD83 Conus Albers (EPSG:5070), read from the LFPS ImageServer in 1024 px blocks
//   on LANDFIRE's own pixel lattice (exportImage, nearest neighbour, so every value is one of the source's pixels).
//   LANDFIRE maps the Ontario side too (a buffer past CONUS), but its tree classes there are a crosswalk, so north of the
//   Minnesota line (MGS D-05 state boundary) every tree class becomes forestUnknown; height, cover and the open kinds stay.
//   MGS D-05 Bedrock Geology (2025), layer 16 (the whole Precambrian surface), polygons. Minnesota only.
//   MGS D-02 Bedrock Outcrop database, polygons (about 102k in the box). Minnesota only, unevenly surveyed.
//
// Layout (shared with the other D1 source streams): grid = AREAS.bwca through makeProjection/makeGrid; file
// <tx>_<ty>.<channel>.bin = gzip of the tile's core 256 x 256 cells (no halo), row-major, row 0 the tile's north
// edge (j = ty*256 + row, i = tx*256 + col). A tile with no data in any channel is not written; manifest.tiles
// lists those that exist, and a missing tile reads as every channel's nodata.
//
// Usage (from the repo root; BWCA_CACHE points at the main checkout's data-cache when run from a worktree):
//   node scripts/sources/forest-rock.mjs [--tiles tx0-tx1,ty0-ty1 | --lakeone] [--force] [--keep-raw]
//          [--stats] [--shots] [--min-free GB]
//   --tiles    only these tiles (inclusive ranges; "30,12" is one tile)
//   --lakeone  only the tiles over AREAS.lakeone
//   --force    rewrite tiles that already exist (and re-fetch nothing: the downloads are reused while they exist)
//   --keep-raw keep the downloads (data-cache/forest-rock/raw) after a whole-box run; they are deleted otherwise
//   --stats    print the LANDFIRE classes in the selection and the class each maps to, then stop
//   --shots    only make the quick-look PNGs from the tiles on disk (BWCA_SHOTS, default shots/)

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { PNG } from 'pngjs';
import { CFG, AREAS, log, sleep, makeProjection, makeGrid } from '../config.mjs';

const OUT = path.join(CFG.cacheDir, 'forest-rock');
const RAW = path.join(OUT, 'raw');
const SHOTS = process.env.BWCA_SHOTS || 'shots';
const T = CFG.tile;
const CHANNELS = ['forest', 'height', 'cover', 'rock', 'bare'];

// ---------- the legends -------------------------------------------------------------------------------------
// Forest type. `group` is the game's species group (placement.js picks species inside it by habitat as today);
// `evt` the LANDFIRE LF2024 EVT values that map here (anything else falls back by life form, see evtClass).
// `color` is the quick-look colour only.
const FOREST = [
  { id: 0, key: 'nodata', group: null, color: '#000000', evt: [-9999], note: 'outside LANDFIRE' },
  { id: 1, key: 'water', group: 'water', color: '#2c5d8f', evt: [7292], note: 'LANDFIRE open water (30 m; the bake\'s OSM lakes stay the authority)' },
  { id: 2, key: 'pineBlackSpruce', group: 'jackPineBlackSpruce', color: '#7d8c35', evt: [9088], note: 'Sub-boreal dry-mesic pine-black spruce: jack pine and black spruce on thin dry rock and old burns' },
  { id: 3, key: 'pineSpruceHardwood', group: 'jackPineBlackSpruce', color: '#a3ad55', evt: [9295], note: 'the same with aspen and birch through it' },
  { id: 4, key: 'jackRedPine', group: 'jackPineBlackSpruce', color: '#c9b443', evt: [9112, 7407, 7243, 7242], note: 'Laurentian jack pine-red pine forest and pine barrens: jack pine, red pine through it' },
  { id: 5, key: 'redWhitePine', group: 'redWhitePine', color: '#b5531c', evt: [7362, 7239, 7238], note: 'Northern pine (and pine-oak) forest: old red and white pine' },
  { id: 6, key: 'pinePlantation', group: 'redWhitePine', color: '#e08d4b', evt: [9312], note: 'planted pine (red pine rows outside the wilderness)' },
  { id: 7, key: 'aspenBirch', group: 'aspenBirch', color: '#aedc72', evt: [7301, 9315, 7905, 7907, 7925, 7927], note: 'Sub-boreal aspen-birch, with spruce and fir coming up under it' },
  { id: 8, key: 'spruceFir', group: 'spruceFir', color: '#1d5c39', evt: [9089, 7906, 7926], note: 'Sub-boreal mesic balsam fir-spruce (white spruce, fir, with birch and aspen)' },
  { id: 9, key: 'northernHardwood', group: 'northernHardwood', color: '#58b542', evt: [7302, 7314], note: 'Northern hardwoods: sugar maple, yellow birch, basswood (the North Shore highlands)' },
  { id: 10, key: 'conifersBog', group: 'lowlandConifer', color: '#6e5c37', evt: [9056], note: 'Conifer acidic swamp and treed poor fen: black spruce and tamarack on peat' },
  { id: 11, key: 'cedarSwamp', group: 'lowlandConifer', color: '#2c8077', evt: [7481], note: 'Alkaline conifer-hardwood swamp: cedar, tamarack, black ash, fir' },
  { id: 12, key: 'floodplainForest', group: 'lowlandHardwood', color: '#53a8a0', evt: [9117, 7444, 9314], note: 'floodplain forest and woodland along the rivers (ash, elm, balsam poplar)' },
  { id: 13, key: 'openBog', group: 'bog', color: '#c7a578', evt: [9055, 9057], note: 'open bog and acidic basin fen: sphagnum and leatherleaf, stunted spruce' },
  { id: 14, key: 'sedgeFen', group: 'bog', color: '#e0cd94', evt: [9114], note: 'alkaline (rich) fen: sedge and low shrub mats, sparse tamarack' },
  { id: 15, key: 'shrubSwamp', group: 'shrubSwamp', color: '#8e6bb3', evt: [9620, 9617, 7272], note: 'alder and willow thickets, floodplain shrubs' },
  { id: 16, key: 'marsh', group: 'marsh', color: '#62c3a4', evt: [9118, 9202, 9318], note: 'freshwater marsh: cattail, bulrush, wild rice edges' },
  { id: 17, key: 'wetMeadow', group: 'marsh', color: '#bfe274', evt: [9120], note: 'wet meadow: bluejoint and sedge (often a beaver meadow)' },
  { id: 18, key: 'uplandShrub', group: 'shrub', color: '#e59bc2', evt: [9317, 7928, 7909, 7972], note: 'ruderal shrubland: hazel, raspberry, young aspen after a burn, blowdown or cut' },
  { id: 19, key: 'openMeadow', group: 'meadow', color: '#f3e45c', evt: [9817, 7908, 7929], note: 'ruderal meadow: grass and fireweed in recent burns, clearings, road edges' },
  { id: 20, key: 'farmland', group: 'farmland', color: '#f6c07a', evt: [7977, 7976, 7975, 7755, 7973, 7974], note: 'pasture, hay and crops (south and west edges of the box only)' },
  { id: 21, key: 'rockCliff', group: 'rock', color: '#ffffff', evt: [9113], note: 'acidic cliff and talus (LANDFIRE maps almost none here: 35 px; use the bare bit and the LiDAR)' },
  { id: 22, key: 'developed', group: 'developed', color: '#e0303a', evt: [7296, 7297, 7298, 7299, 7295], note: 'roads, towns, pits' },
  { id: 23, key: 'forestUnknown', group: 'forest', color: '#7fa37a', evt: [], note: 'forest of a kind not mapped: every tree class (2-12) on the Ontario side, where LANDFIRE\'s buffer calls Quetico 67 % aspen-birch and 21 % northern hardwood (a crosswalk, not a survey). Habitat picks the species there, as today.' },
];
const ONTARIO_TREES = new Set([2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
const FOREST_UNKNOWN = 23;
const FOREST_NODATA = 0;
// A starting species mix per forest type, in placement.js SPECIES names (whitePine, spruce = white spruce and balsam
// fir, redPine, birch, cedar, tallPine = the old white pine over the canopy, jackPine, tamarack, aspen, blackSpruce;
// alder and hazel for the shrub kinds), read from the NatureServe system descriptions LANDFIRE's EVT classes follow
// and the FIA biomass the survey sampled at Lake One. A prior for treeWeights: the cell's habitat still decides.
// The game has no maple, yellow birch, basswood or ash yet: northern hardwoods and floodplains borrow birch and aspen.
const SPECIES_MIX = {
  pineBlackSpruce: { jackPine: 0.4, blackSpruce: 0.3, birch: 0.1, aspen: 0.1, spruce: 0.05, redPine: 0.03, whitePine: 0.02 },
  pineSpruceHardwood: { jackPine: 0.25, blackSpruce: 0.2, aspen: 0.2, birch: 0.2, spruce: 0.1, redPine: 0.05 },
  jackRedPine: { jackPine: 0.5, redPine: 0.25, blackSpruce: 0.1, whitePine: 0.05, birch: 0.05, aspen: 0.05 },
  redWhitePine: { whitePine: 0.3, redPine: 0.3, tallPine: 0.05, spruce: 0.1, birch: 0.15, aspen: 0.05, cedar: 0.05 },
  pinePlantation: { redPine: 0.85, jackPine: 0.1, whitePine: 0.05 },
  aspenBirch: { aspen: 0.4, birch: 0.3, spruce: 0.15, blackSpruce: 0.05, whitePine: 0.05, cedar: 0.05 },
  spruceFir: { spruce: 0.5, birch: 0.2, aspen: 0.1, cedar: 0.1, whitePine: 0.05, blackSpruce: 0.05 },
  northernHardwood: { birch: 0.45, aspen: 0.2, spruce: 0.2, whitePine: 0.1, cedar: 0.05 },
  conifersBog: { blackSpruce: 0.65, tamarack: 0.3, cedar: 0.05 },
  cedarSwamp: { cedar: 0.5, tamarack: 0.15, spruce: 0.15, blackSpruce: 0.1, birch: 0.1 },
  floodplainForest: { birch: 0.3, aspen: 0.3, spruce: 0.2, cedar: 0.2 },
  openBog: { blackSpruce: 0.7, tamarack: 0.3 },
  sedgeFen: { tamarack: 0.6, blackSpruce: 0.4 },
  shrubSwamp: { alder: 0.9, tamarack: 0.05, blackSpruce: 0.05 },
  uplandShrub: { hazel: 0.6, aspen: 0.2, birch: 0.1, jackPine: 0.1 },
};

// Bedrock units: MGS D-05 MAPLABEL codes (and a few unit names) grouped into the rock the game can tell apart.
// `face` is the weathered, lichen-free face colour (sRGB; the game's granite today is #9c958e and its cliffs #7f857a),
// `accent` the streaks, veins or fresh breaks. `cliff` is the style a cliff or outcrop takes:
//   blocky    rectangular joint blocks, rounded whalebacks between the joints (granite, tonalite, granophyre)
//   banded    whalebacks streaked light and dark along the foliation (migmatite, iron formation)
//   slabby    steep thin plates and ribs along the foliation or bedding, shelving on the dip side (schist, slate)
//   knobby    massive rough knobs, few clean joints, pillows (greenstone)
//   angular   sharp angular blocks and breccia knobs (the felsic volcanics)
//   rounded   smooth rounded domes that crumble to grus, few cliffs (anorthosite, troctolite)
//   columnar  vertical columns over a talus apron, palisades (the Logan diabase sills of the Gunflint)
//   massive   big dark blocks, the odd crude column (gabbro sills)
//   flaggy    thin horizontal shelves and crumbly slopes under a harder cap (Rove slate)
//   stepped   ledges stepping down flow by flow (North Shore basalts)
//   bedded    flat beds and cross-bedding (sandstone)
const ROCK = [
  { id: 0, key: 'unmapped', name: 'not mapped (outside Minnesota)', labels: [], face: '#9c958e', accent: '#d8d0c4', cliff: 'blocky', color: '#000000' },
  { id: 1, key: 'lacLaCroixGranite', name: 'Lac La Croix Granite and the Quetico granites', labels: ['Aql'], face: '#a69a90', accent: '#cbb3a1', cliff: 'blocky', color: '#e8a0a0' },
  { id: 2, key: 'saganagaTonalite', name: 'Saganaga Tonalite', labels: ['Ast'], face: '#a7a6a0', accent: '#d3d2cb', cliff: 'blocky', color: '#f0f0f0' },
  { id: 3, key: 'graniticPluton', name: 'Archean granitic plutons (Giants Range, Kekekabic, Lost Lake, Wakemup Bay, Daisy Bay)', labels: ['Agm', 'Aqm', 'Agr', 'Agt', 'Asd', 'Aqp', 'Ami'], face: '#a2978f', accent: '#c1aa9b', cliff: 'blocky', color: '#d46a6a' },
  { id: 4, key: 'graniteMigmatite', name: 'granite-rich migmatite (Basswood, Crooked, Lac La Croix migmatite)', labels: ['Aqg', 'Aqt'], face: '#9c968f', accent: '#c6baae', cliff: 'banded', color: '#e6c3a0' },
  { id: 5, key: 'biotiteSchist', name: 'Quetico biotite schist and schist-rich migmatite', labels: ['Aqs'], face: '#8b8882', accent: '#6f6c67', cliff: 'slabby', color: '#9a8fb8' },
  { id: 6, key: 'amphibolite', name: 'amphibolite and amphibole schist', labels: ['Aqa'], face: '#71736c', accent: '#8e9088', cliff: 'slabby', color: '#5a5a8a' },
  { id: 7, key: 'greenstone', name: 'Ely Greenstone and Newton Lake mafic-ultramafic volcanics', labels: ['Amv', 'Acv', 'Auv', 'Aag', 'Agp'], face: '#7d8573', accent: '#5e6756', cliff: 'knobby', color: '#3f8f4f' },
  { id: 8, key: 'felsicVolcanic', name: 'Knife Lake and Lake Vermilion felsic volcanics', labels: ['Avs', 'Akv'], face: '#a39e8f', accent: '#c4bca8', cliff: 'angular', color: '#c8c870' },
  { id: 9, key: 'knifeLakeSlate', name: 'Knife Lake Group and Lake Vermilion slate, greywacke and conglomerate', labels: ['Aks', 'Asc', 'Akc', 'Asg'], face: '#70736e', accent: '#8f928b', cliff: 'slabby', color: '#4f6f8f' },
  { id: 10, key: 'ironFormation', name: 'Soudan and Gunflint iron formation', labels: ['Aif', 'Pai'], face: '#6c5b53', accent: '#8d4b3b', cliff: 'banded', color: '#a03020' },
  { id: 11, key: 'anorthosite', name: 'Duluth Complex anorthositic series', labels: ['Mau'], face: '#b3afa7', accent: '#908b9a', cliff: 'rounded', color: '#d8d0f0' },
  { id: 12, key: 'troctoliteGabbro', name: 'Duluth Complex troctolite and gabbro (South Kawishiwi, Bald Eagle, Lake One, Poplar Lake intrusions)', labels: ['Mlt', 'Mlg', 'Mge', 'Mbt', 'Mbg'], face: '#8c8172', accent: '#4e4b46', cliff: 'rounded', color: '#8a6a50' },
  { id: 13, key: 'granophyre', name: 'granophyre and the Duluth Complex felsic series (Eagle Mountain, Misquah Hills, Beth Lake)', labels: ['Mfg', 'Mmf'], face: '#a9887b', accent: '#c59b86', cliff: 'blocky', color: '#f08060' },
  { id: 14, key: 'diabaseSill', name: 'Logan sills and other diabase (Pigeon River, Brule Lake, Monker Lake)', labels: ['Mld', 'Mmd', 'Mbd'], face: '#60615d', accent: '#7b6f63', cliff: 'columnar', color: '#202020' },
  { id: 15, key: 'gabbroSill', name: 'Brule-Hovland gabbro and other gabbroic intrusions', labels: ['Mmg'], face: '#6f6d67', accent: '#8b8073', cliff: 'massive', color: '#505050' },
  { id: 16, key: 'roveSlate', name: 'Rove Formation slate and greywacke', labels: ['Pas'], face: '#5e605e', accent: '#7e807c', cliff: 'flaggy', color: '#304050' },
  { id: 17, key: 'sandstone', name: 'Puckwunge and interflow sandstone', labels: ['Mms', 'Mns'], face: '#b59d81', accent: '#9c7056', cliff: 'bedded', color: '#f0e0a0' },
  { id: 18, key: 'basalt', name: 'North Shore Volcanic Group basalts (Hovland, Grand Portage, Marr Island, Croftville)', labels: ['Mnb', 'Mnl', 'Mvu', 'Mnu'], face: '#6f6661', accent: '#8d5e4f', cliff: 'stepped', color: '#704030' },
  { id: 19, key: 'rhyolite', name: 'North Shore rhyolite (Kimball Creek, Devil Track)', labels: ['Mnr'], face: '#9d8075', accent: '#c09c8b', cliff: 'blocky', color: '#e070a0' },
];
const ROCK_BY_LABEL = new Map(ROCK.flatMap((u) => u.labels.map((l) => [l, u.id])));
// a unit the labels miss falls back by the map's generalized lithology
function rockUnit(a, misses) {
  const lab = (a.MAPLABEL || '').trim();
  if (ROCK_BY_LABEL.has(lab)) return ROCK_BY_LABEL.get(lab);
  const g = (a.GENERALIZED_LITH || '').toLowerCase(), key = `${lab}|${a.UNIT_NAME}|${a.GENERALIZED_LITH}`;
  misses.set(key, (misses.get(key) || 0) + 1);
  if (g.includes('iron')) return 10;
  if (g.includes('sedimentary')) return a.ERA === 'Mesoproterozoic' ? 17 : 9;
  if (g.includes('volcanic')) return a.ERA === 'Mesoproterozoic' ? 18 : 7;
  if (g.includes('metamorphic')) return 5;
  if (g.includes('intrusive')) return a.ERA === 'Mesoproterozoic' ? 15 : 3;
  return 0;
}

// ---------- CLI ---------------------------------------------------------------------------------------------

function parseArgs(argv) {
  const o = { force: false, keepRaw: false, stats: false, shots: false, minFree: 15, tiles: null, lakeone: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--tiles') o.tiles = argv[++i];
    else if (a === '--lakeone') o.lakeone = true;
    else if (a === '--force') o.force = true;
    else if (a === '--keep-raw') o.keepRaw = true;
    else if (a === '--stats') o.stats = true;
    else if (a === '--shots') o.shots = true;
    else if (a === '--min-free') o.minFree = +argv[++i];
    else if (a === '--help') { console.log(fs.readFileSync(new URL(import.meta.url), 'utf8').split('\n').filter((l) => l.startsWith('//')).join('\n')); process.exit(0); }
    else throw new Error('unknown argument ' + a);
  }
  return o;
}

function freeGB(dir) { const s = fs.statfsSync(dir); return (s.bavail * s.bsize) / 1e9; }
function checkDisk(minFree) {
  const gb = freeGB(fs.existsSync(OUT) ? OUT : '.');
  if (gb < minFree) { console.error(`stopping: ${gb.toFixed(1)} GB free, under ${minFree} GB`); process.exit(2); }
  return gb;
}

// ---------- the grid and the tile selection -----------------------------------------------------------------

const BBOX = AREAS.bwca;
const proj = makeProjection(BBOX);
const grid = makeGrid(BBOX, proj);

function tilesOver(area) {
  const [xw, zn] = proj.toLocal(area.north, area.west), [xe, zs] = proj.toLocal(area.south, area.east);
  return { tx0: Math.floor(grid.ci(xw) / T), tx1: Math.floor(grid.ci(xe) / T), ty0: Math.floor(grid.cj(zn) / T), ty1: Math.floor(grid.cj(zs) / T) };
}
function window(r) {
  const tx0 = Math.max(0, r.tx0), ty0 = Math.max(0, r.ty0), tx1 = Math.min(grid.ntx - 1, r.tx1), ty1 = Math.min(grid.nty - 1, r.ty1);
  return { tx0, tx1, ty0, ty1, i0: tx0 * T, j0: ty0 * T, w: (tx1 - tx0 + 1) * T, h: (ty1 - ty0 + 1) * T };
}
function selectTiles(opt) {
  if (opt.lakeone) return window(tilesOver(AREAS.lakeone));
  if (opt.tiles) {
    const [xs, ys] = opt.tiles.split(',');
    const r = (s) => { const [a, b] = s.split('-').map(Number); return [a, b ?? a]; };
    const [tx0, tx1] = r(xs), [ty0, ty1] = r(ys);
    return window({ tx0, tx1, ty0, ty1 });
  }
  return window({ tx0: 0, tx1: grid.ntx - 1, ty0: 0, ty1: grid.nty - 1 });
}
// the selection's outline in lat/lon (traced, the projection bends the edges), padded
function windowLatLon(sel, pad = 0.01) {
  let s = Infinity, n = -Infinity, w = Infinity, e = -Infinity;
  const x0 = grid.originX + sel.i0 * grid.cell, z0 = grid.originZ + sel.j0 * grid.cell, wm = sel.w * grid.cell, hm = sel.h * grid.cell;
  for (let k = 0; k <= 32; k++) for (const [x, z] of [[x0 + (wm * k) / 32, z0], [x0 + (wm * k) / 32, z0 + hm], [x0, z0 + (hm * k) / 32], [x0 + wm, z0 + (hm * k) / 32]]) {
    const [lat, lon] = proj.toLatLon(x, z);
    s = Math.min(s, lat); n = Math.max(n, lat); w = Math.min(w, lon); e = Math.max(e, lon);
  }
  return { south: s - pad, north: n + pad, west: w - pad, east: e + pad };
}

// ---------- HTTP ----------------------------------------------------------------------------------------------

async function fetchRetry(url, { tries = 5, timeout = 180000, as = 'buffer' } = {}) {
  let err;
  for (let k = 0; k < tries; k++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(timeout), headers: { 'User-Agent': CFG.ua } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const buf = Buffer.from(await r.arrayBuffer());
      if (as === 'json') {
        const d = JSON.parse(buf.toString('utf8'));
        if (d.error) throw new Error('service error ' + JSON.stringify(d.error).slice(0, 300));
        return d;
      }
      return buf;
    } catch (e) {
      err = e;
      const wait = 2000 * 2 ** k;
      log(`  retry ${k + 1}/${tries} in ${wait / 1000}s: ${e.message}`);
      await sleep(wait);
    }
  }
  throw err;
}

// ---------- NAD83 / Conus Albers (EPSG:5070), checked against gdaltransform to the millimetre ----------------

const ALB = (() => {
  const a = 6378137, f = 1 / 298.257222101, e2 = 2 * f - f * f, e = Math.sqrt(e2), d2r = Math.PI / 180;
  const p1 = 29.5 * d2r, p2 = 45.5 * d2r, p0 = 23 * d2r, l0 = -96 * d2r;
  const m = (p) => Math.cos(p) / Math.sqrt(1 - e2 * Math.sin(p) ** 2);
  const q = (p) => { const s = Math.sin(p); return (1 - e2) * (s / (1 - e2 * s * s) - (1 / (2 * e)) * Math.log((1 - e * s) / (1 + e * s))); };
  const m1 = m(p1), m2 = m(p2), q1 = q(p1), q2 = q(p2);
  const n = (m1 * m1 - m2 * m2) / (q2 - q1), C = m1 * m1 + n * q1, rho0 = (a * Math.sqrt(C - n * q(p0))) / n;
  return (lat, lon) => { const rho = (a * Math.sqrt(C - n * q(lat * d2r))) / n, th = n * (lon * d2r - l0); return [rho * Math.sin(th), rho0 - rho * Math.cos(th)]; };
})();

// ---------- a minimal GeoTIFF reader (the ImageServer's output: one 16-bit band, strips or tiles, none/deflate) --

function readTiff(buf) {
  const le = buf.toString('latin1', 0, 2) === 'II';
  const u16 = (o) => (le ? buf.readUInt16LE(o) : buf.readUInt16BE(o)), u32 = (o) => (le ? buf.readUInt32LE(o) : buf.readUInt32BE(o));
  if (u16(2) !== 42) throw new Error('not a classic TIFF: ' + buf.toString('utf8', 0, 200));
  const ifd = u32(4), n = u16(ifd), tags = {};
  const size = { 1: 1, 2: 1, 3: 2, 4: 4, 6: 1, 7: 1, 8: 2, 9: 4, 11: 4, 12: 8, 16: 8 };
  for (let k = 0; k < n; k++) {
    const e = ifd + 2 + k * 12, tag = u16(e), type = u16(e + 2), count = u32(e + 4);
    const bytes = (size[type] || 1) * count, at = bytes <= 4 ? e + 8 : u32(e + 8);
    const vals = [];
    if (type === 3 || type === 4) for (let c = 0; c < Math.min(count, 1 << 20); c++) vals.push(type === 3 ? u16(at + 2 * c) : u32(at + 4 * c));
    tags[tag] = vals;
  }
  const W = tags[256][0], H = tags[257][0], bps = tags[258]?.[0] || 1, comp = tags[259]?.[0] || 1, fmt = tags[339]?.[0] || 1;
  if (bps !== 16) throw new Error('expected 16-bit samples, got ' + bps);
  const out = new Int16Array(W * H);
  const decode = (o, len) => {
    const raw = buf.subarray(o, o + len);
    if (comp === 1) return raw;
    if (comp === 8 || comp === 32946) return zlib.inflateSync(raw);
    throw new Error('unsupported TIFF compression ' + comp);
  };
  const get = (b, k) => (fmt === 2 ? (le ? b.readInt16LE(2 * k) : b.readInt16BE(2 * k)) : (le ? b.readUInt16LE(2 * k) : b.readUInt16BE(2 * k)));
  if (tags[324]) { // tiled
    const tw = tags[322][0], th = tags[323][0], offs = tags[324], lens = tags[325], across = Math.ceil(W / tw);
    offs.forEach((o, t) => {
      const b = decode(o, lens[t]), x0 = (t % across) * tw, y0 = Math.floor(t / across) * th;
      for (let y = 0; y < th && y0 + y < H; y++) for (let x = 0; x < tw && x0 + x < W; x++) out[(y0 + y) * W + x0 + x] = get(b, y * tw + x);
    });
  } else {
    const rps = tags[278]?.[0] || H, offs = tags[273], lens = tags[279];
    offs.forEach((o, s) => {
      const b = decode(o, lens[s]), y0 = s * rps, rows = Math.min(rps, H - y0);
      for (let k = 0; k < rows * W; k++) out[y0 * W + k] = get(b, k);
    });
  }
  return { W, H, data: out };
}

// ---------- LANDFIRE -----------------------------------------------------------------------------------------

const LF = {
  base: (p) => `https://lfps.usgs.gov/arcgis/rest/services/Landfire_LF2024/LF2024_${p}_CONUS/ImageServer/exportImage`,
  csv: (p) => `https://landfire.gov/sites/default/files/CSV/2024/LF2024_${p}.csv`,
  x0: -2362425, y1: 3267405, px: 30, block: 1024, // the service's extent: pixel edges sit on this lattice
};

// the LANDFIRE block lattice covering a window of the 10 m grid (its outline traced through the projection)
function landfireBlocks(sel) {
  let xmin = Infinity, xmax = -Infinity, ymin = Infinity, ymax = -Infinity;
  const x0 = grid.originX + sel.i0 * grid.cell, z0 = grid.originZ + sel.j0 * grid.cell, wm = sel.w * grid.cell, hm = sel.h * grid.cell;
  for (let s = 0; s <= 64; s++) {
    for (const [x, z] of [[x0 + (wm * s) / 64, z0], [x0 + (wm * s) / 64, z0 + hm], [x0, z0 + (hm * s) / 64], [x0 + wm, z0 + (hm * s) / 64]]) {
      const [lat, lon] = proj.toLatLon(x, z), [X, Y] = ALB(lat, lon);
      xmin = Math.min(xmin, X); xmax = Math.max(xmax, X); ymin = Math.min(ymin, Y); ymax = Math.max(ymax, Y);
    }
  }
  const B = LF.block * LF.px, pad = 2 * LF.px;
  return {
    bc0: Math.floor((xmin - pad - LF.x0) / B), bc1: Math.floor((xmax + pad - LF.x0) / B),
    br0: Math.floor((LF.y1 - ymax - pad) / B), br1: Math.floor((LF.y1 - ymin + pad) / B),
  };
}

async function fetchLandfireBlock(prod, bc, br, fetched) {
  const dir = path.join(RAW, 'landfire');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${prod}_${bc}_${br}.i16.gz`);
  if (fs.existsSync(file)) {
    fetched.landfire[`${prod}_${bc}_${br}`] ||= fs.statSync(file).mtime.toISOString();
    return new Int16Array(new Uint8Array(zlib.gunzipSync(fs.readFileSync(file))).buffer);
  }
  const B = LF.block, xmin = LF.x0 + bc * B * LF.px, ymax = LF.y1 - br * B * LF.px;
  const q = new URLSearchParams({
    bbox: [xmin, ymax - B * LF.px, xmin + B * LF.px, ymax].join(','), bboxSR: '5070', imageSR: '5070', size: `${B},${B}`,
    format: 'tiff', pixelType: 'S16', noData: '-9999', interpolation: 'RSP_NearestNeighbor', f: 'image',
  });
  const t = Date.now();
  const tif = readTiff(await fetchRetry(`${LF.base(prod)}?${q}`));
  if (tif.W !== B || tif.H !== B) throw new Error(`LANDFIRE ${prod} block ${bc},${br}: got ${tif.W} x ${tif.H}`);
  fs.writeFileSync(file, zlib.gzipSync(Buffer.from(tif.data.buffer), { level: 6 }));
  log(`  LANDFIRE ${prod} block ${bc},${br} (${((Date.now() - t) / 1000).toFixed(1)} s)`);
  fetched.landfire[`${prod}_${bc}_${br}`] = new Date().toISOString();
  await sleep(400);
  return tif.data;
}

// The blocks of one product, each turned through `lut` (value -> byte) as it loads; a 2-D array [br][bc].
// `seen` (a Set) collects the raw values met.
async function loadLandfire(prod, blocks, lut, fetched, seen) {
  const rows = [];
  for (let br = blocks.br0; br <= blocks.br1; br++) {
    const row = [];
    for (let bc = blocks.bc0; bc <= blocks.bc1; bc++) {
      const a = await fetchLandfireBlock(prod, bc, br, fetched);
      if (seen) for (let k = 0; k < a.length; k++) seen.add(a[k]);
      if (!lut) { row.push(a); continue; }
      const b = new Uint8Array(a.length);
      for (let k = 0; k < a.length; k++) { const v = a[k]; b[k] = v >= 0 && v < lut.length ? lut[v] : lut.nodata; }
      row.push(b);
    }
    rows.push(row);
  }
  return rows;
}

async function loadEvtTable() {
  const file = path.join(RAW, 'LF2024_EVT.csv');
  if (!fs.existsSync(file)) { fs.mkdirSync(RAW, { recursive: true }); fs.writeFileSync(file, await fetchRetry(LF.csv('EVT'))); }
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean);
  const head = splitCsv(lines[0]), ix = (k) => head.indexOf(k), t = new Map();
  for (const l of lines.slice(1)) {
    const c = splitCsv(l);
    t.set(+c[ix('VALUE')], { name: c[ix('EVT_NAME')], lf: c[ix('EVT_LF')], phys: c[ix('EVT_PHYS')], gp: c[ix('EVT_GP_N')] });
  }
  return t;
}
function splitCsv(line) {
  const out = []; let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) { if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch; }
    else if (ch === '"') q = true; else if (ch === ',') { out.push(cur); cur = ''; } else cur += ch;
  }
  out.push(cur);
  return out;
}

// EVT value -> forest class: the listed values first, then by life form and physiognomy
function evtClass(v, table, fallbacks) {
  for (const c of FOREST) if (c.evt.includes(v)) return c.id;
  const r = table.get(v);
  if (!r) return FOREST_NODATA;
  const lf = r.lf, ph = (r.phys || '').toLowerCase();
  let id;
  if (lf === 'Water') id = 1;
  else if (lf === 'Developed') id = 22;
  else if (lf === 'Agriculture') id = 20;
  else if (lf === 'Sparse' || lf === 'Barren' || lf === 'Snow-Ice') id = 21;
  else if (lf === 'Shrub') id = ph.includes('wet') || ph.includes('riparian') ? 15 : 18;
  else if (lf === 'Herb') id = ph.includes('wet') || ph.includes('riparian') ? 17 : 19;
  else if (lf === 'Tree') id = ph.includes('riparian') ? 12 : ph === 'conifer' ? 8 : 7;
  else id = FOREST_NODATA;
  fallbacks.set(v, { id, name: r.name });
  return id;
}
function forestLut(table, fallbacks) {
  const lut = new Uint8Array(10000);
  for (let v = 0; v < lut.length; v++) lut[v] = table.has(v) ? evtClass(v, table, fallbacks) : FOREST_NODATA;
  lut.nodata = FOREST_NODATA;
  return lut;
}
// EVH -> decimetres: 101-199 tree height (m) = v - 100; 201-299 shrub = (v - 200) / 10 m; 301-399 herb likewise;
// the non-vegetated codes (water, developed, barren, sparse 100) are 0; fill 255
function heightLut() {
  const lut = new Uint8Array(400);
  for (let v = 0; v < 400; v++) lut[v] = v > 100 && v < 200 ? Math.min(254, (v - 100) * 10) : v > 200 && v < 300 ? v - 200 : v > 300 ? v - 300 : 0;
  lut.nodata = 255;
  return lut;
}
// EVC -> %: 110-199 tree cover = v - 100; 210-299 shrub; 310-399 herb; non-vegetated 0; fill 255
function coverLut() {
  const lut = new Uint8Array(400);
  for (let v = 0; v < 400; v++) lut[v] = v >= 110 && v < 200 ? v - 100 : v >= 210 && v < 300 ? v - 200 : v >= 310 ? v - 300 : 0;
  lut.nodata = 255;
  return lut;
}

// ---------- ArcGIS feature services ---------------------------------------------------------------------------

const MGS = {
  d05: 'https://services.arcgis.com/8df8p0NlLFEShl0r/arcgis/rest/services/D_05_Bedrock_Geology_2025/FeatureServer/16/query',
  state: 'https://services.arcgis.com/8df8p0NlLFEShl0r/arcgis/rest/services/D_05_Bedrock_Geology_2025/FeatureServer/19/query',
  d02: 'https://services.arcgis.com/8df8p0NlLFEShl0r/arcgis/rest/services/Minnesota_Bedrock_Outcrop/FeatureServer/0/query',
};

// Every feature of a layer in a lat/lon box, by object-id pages, cached page by page (resumable).
async function fetchFeatures(name, url, box, { fields, page = 2000, offset = 0.00001 }, fetched) {
  const dir = path.join(RAW, name);
  fs.mkdirSync(dir, { recursive: true });
  const env = { geometry: [box.west, box.south, box.east, box.north].join(','), geometryType: 'esriGeometryEnvelope', inSR: '4326', spatialRel: 'esriSpatialRelIntersects' };
  const idsFile = path.join(dir, 'ids.json');
  let ids;
  if (fs.existsSync(idsFile)) ids = JSON.parse(fs.readFileSync(idsFile, 'utf8'));
  else {
    const d = await fetchRetry(`${url}?${new URLSearchParams({ where: '1=1', ...env, returnIdsOnly: 'true', f: 'json' })}`, { as: 'json' });
    ids = d.objectIds.sort((a, b) => a - b);
    fs.writeFileSync(idsFile, JSON.stringify(ids));
  }
  const oidField = name === 'd05' ? 'OBJECTID' : 'objectid';
  const feats = [];
  const pages = Math.ceil(ids.length / page);
  for (let p = 0; p < pages; p++) {
    const file = path.join(dir, `page-${p}.json.gz`);
    let d;
    if (fs.existsSync(file)) d = JSON.parse(zlib.gunzipSync(fs.readFileSync(file)).toString('utf8'));
    else {
      const a = ids[p * page], b = ids[Math.min(ids.length, (p + 1) * page) - 1];
      const q = new URLSearchParams({ where: `${oidField}>=${a} AND ${oidField}<=${b}`, ...env, outFields: fields, outSR: '4326', geometryPrecision: '6', maxAllowableOffset: String(offset), returnGeometry: 'true', f: 'json' });
      d = await fetchRetry(`${url}?${q}`, { as: 'json' });
      if (d.exceededTransferLimit) throw new Error(`${name} page ${p} exceeded the transfer limit; lower the page size`);
      d = { features: d.features.map((f) => ({ a: f.attributes, r: f.geometry?.rings || [] })) };
      fs.writeFileSync(file, zlib.gzipSync(JSON.stringify(d)));
      fetched[name] = { pages, done: p + 1, count: ids.length, at: new Date().toISOString() };
      log(`  ${name} page ${p + 1}/${pages}: ${d.features.length} features`);
      await sleep(500);
    }
    feats.push(...d.features);
  }
  return feats;
}

// ---------- rasterization on the 10 m grid ----------------------------------------------------------------------

// Polygon rings (lat/lon) to window cell coordinates (u east, v south, in cells from the window's corner).
function toCells(rings, sel) {
  return rings.map((rg) => rg.map(([lon, lat]) => {
    const [x, z] = proj.toLocal(lat, lon);
    return [(x - grid.originX) / grid.cell - sel.i0, (z - grid.originZ) / grid.cell - sel.j0];
  }));
}
// Scanline fill, even-odd across all rings: every cell whose centre is inside gets `val`. Returns the cells set.
function fillPolygon(rings, out, W, H, val) {
  let vmin = Infinity, vmax = -Infinity;
  for (const rg of rings) for (const p of rg) { if (p[1] < vmin) vmin = p[1]; if (p[1] > vmax) vmax = p[1]; }
  const j0 = Math.max(0, Math.ceil(vmin - 0.5)), j1 = Math.min(H - 1, Math.floor(vmax - 0.5));
  if (j1 < j0) return 0;
  const rows = Array.from({ length: j1 - j0 + 1 }, () => []);
  for (const rg of rings) {
    for (let k = 0, n = rg.length; k < n; k++) {
      const [x1, y1] = rg[k], [x2, y2] = rg[(k + 1) % n];
      if (y1 === y2) continue;
      const lo = Math.min(y1, y2), hi = Math.max(y1, y2);
      // rows whose centre c = j + 0.5 satisfies lo <= c < hi
      const a = Math.max(j0, Math.ceil(lo - 0.5)), b = Math.min(j1, Math.ceil(hi - 0.5) - 1);
      for (let j = a; j <= b; j++) { const c = j + 0.5; rows[j - j0].push(x1 + ((c - y1) * (x2 - x1)) / (y2 - y1)); }
    }
  }
  let filled = 0;
  for (let r = 0; r < rows.length; r++) {
    const xs = rows[r];
    if (xs.length < 2) continue;
    xs.sort((a, b) => a - b);
    const base = (j0 + r) * W;
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const ia = Math.max(0, Math.ceil(xs[k] - 0.5)), ib = Math.min(W - 1, Math.floor(xs[k + 1] - 0.5));
      for (let i = ia; i <= ib; i++) out[base + i] = val;
      if (ib >= ia) filled += ib - ia + 1;
    }
  }
  return filled;
}
const ringArea = (rg) => { let s = 0; for (let k = 0, n = rg.length; k < n; k++) { const [x1, y1] = rg[k], [x2, y2] = rg[(k + 1) % n]; s += x1 * y2 - x2 * y1; } return s / 2; };

// ---------- the build -------------------------------------------------------------------------------------------

const tileFile = (tx, ty, ch) => path.join(OUT, `${tx}_${ty}.${ch}.bin`);

async function build(opt, sel) {
  const manifestFile = path.join(OUT, 'manifest.json');
  const old = fs.existsSync(manifestFile) ? JSON.parse(fs.readFileSync(manifestFile, 'utf8')) : null;
  const fetchedFile = path.join(OUT, 'fetched.json');
  const fetched = fs.existsSync(fetchedFile) ? JSON.parse(fs.readFileSync(fetchedFile, 'utf8')) : { landfire: {} };
  fetched.landfire ||= {};
  const saveFetched = () => fs.writeFileSync(fetchedFile, JSON.stringify(fetched, null, 1));

  const todo = [];
  for (let ty = sel.ty0; ty <= sel.ty1; ty++) for (let tx = sel.tx0; tx <= sel.tx1; tx++) {
    if (!opt.force && CHANNELS.every((ch) => fs.existsSync(tileFile(tx, ty, ch)))) continue;
    todo.push([tx, ty]);
  }
  log(`${todo.length} tiles to build`);
  if (!todo.length) return;

  // --- LANDFIRE, as bytes through the legends
  const table = await loadEvtTable();
  const fallbacks = new Map();
  const blocks = landfireBlocks(sel);
  log('LANDFIRE blocks', blocks);
  const seen = new Set();
  const lfForest = await loadLandfire('EVT', blocks, forestLut(table, fallbacks), fetched, seen);
  const lfHeight = await loadLandfire('EVH', blocks, heightLut(), fetched);
  const lfCover = await loadLandfire('EVC', blocks, coverLut(), fetched);
  fetched.landfireLattice = { service: LF.base('<EVT|EVH|EVC>'), epsg: 5070, x0: LF.x0, y1: LF.y1, pixel: LF.px, block: LF.block, keys: '<product>_<block column>_<block row>' };
  saveFetched();
  for (const v of fallbacks.keys()) if (!seen.has(v)) fallbacks.delete(v); // report only the classes met
  if (fallbacks.size) log('EVT classes mapped by life-form fallback:', [...fallbacks].map(([v, f]) => `${v} ${f.name} -> ${FOREST[f.id].key}`).join('; '));

  // --- the rock: MGS D-05 units and D-02 outcrops, fetched for the whole grid (one cache) and rasterized over the window
  const box = windowLatLon(window({ tx0: 0, tx1: grid.ntx - 1, ty0: 0, ty1: grid.nty - 1 }));
  const d05 = await fetchFeatures('d05', MGS.d05, box, { fields: 'OBJECTID,MAPLABEL,UNIT_NAME,GENERALIZED_LITH,ERA', page: 100, offset: 0.00002 }, fetched);
  saveFetched();
  const d02 = await fetchFeatures('d02', MGS.d02, box, { fields: 'objectid,rk_name1,mapunit', page: 2000, offset: 0.00001 }, fetched);
  saveFetched();
  const state = await fetchFeatures('mnstate', MGS.state, box, { fields: 'objectid', page: 10, offset: 0.00002 }, fetched);
  saveFetched();
  const W = sel.w, H = sel.h;
  const rock = new Uint8Array(W * H), bare = new Uint8Array(W * H), inMN = new Uint8Array(W * H);
  for (const f of state) fillPolygon(toCells(f.r, sel), inMN, W, H, 1);
  const misses = new Map();
  const units = d05.map((f) => ({ unit: rockUnit(f.a, misses), rings: toCells(f.r, sel) }));
  for (const u of units) u.area = Math.abs(u.rings.reduce((s, rg) => s + ringArea(rg), 0));
  units.sort((a, b) => b.area - a.area); // big first, so an inclusion drawn as its own polygon wins
  for (const u of units) fillPolygon(u.rings, rock, W, H, u.unit);
  if (misses.size) log('D-05 units mapped by lithology fallback:', [...misses].map(([k, n]) => `${k} (${n})`).join('; '));
  let tiny = 0, outcropCells = 0;
  for (const f of d02) {
    const rings = toCells(f.r, sel);
    const n = fillPolygon(rings, bare, W, H, 1);
    outcropCells += n;
    if (n === 0 && rings.length && rings[0].length) { // smaller than a cell: mark the cell its outline centres on
      let su = 0, sv = 0;
      for (const [u, v] of rings[0]) { su += u; sv += v; }
      const i = Math.floor(su / rings[0].length), j = Math.floor(sv / rings[0].length);
      if (i >= 0 && j >= 0 && i < W && j < H) { bare[j * W + i] = 1; tiny++; }
    }
  }
  log(`D-05: ${d05.length} polygons; D-02: ${d02.length} outcrops, ${tiny} smaller than a cell kept as one cell`);

  // --- per tile: sample LANDFIRE at each cell centre, cut the rock, write
  const nbc = blocks.bc1 - blocks.bc0 + 1, nbr = blocks.br1 - blocks.br0 + 1, B = LF.block;
  const counts = { forest: new Float64Array(256), rock: new Float64Array(256), bare: 0, cells: 0 };
  const bufs = Object.fromEntries(CHANNELS.map((c) => [c, new Uint8Array(T * T)]));
  let written = 0, skipped = 0;
  const t0 = Date.now();
  for (const [tx, ty] of todo) {
    checkDiskEvery(opt, written);
    const { forest: fo, height: he, cover: co, rock: ro, bare: ba } = bufs;
    let any = false;
    for (let r = 0; r < T; r++) {
      const j = ty * T + r, z = grid.cz(j), wj = j - sel.j0;
      for (let c = 0; c < T; c++) {
        const i = tx * T + c, m = r * T + c, wk = wj * W + (i - sel.i0);
        const [lat, lon] = proj.toLatLon(grid.cx(i), z), [X, Y] = ALB(lat, lon);
        const col = Math.floor((X - LF.x0) / LF.px), row = Math.floor((LF.y1 - Y) / LF.px);
        const bc = Math.floor(col / B) - blocks.bc0, br = Math.floor(row / B) - blocks.br0;
        if (bc < 0 || br < 0 || bc >= nbc || br >= nbr) { fo[m] = FOREST_NODATA; he[m] = 255; co[m] = 255; }
        else {
          const k = (row % B) * B + (col % B);
          fo[m] = lfForest[br][bc][k]; he[m] = lfHeight[br][bc][k]; co[m] = lfCover[br][bc][k];
          if (!inMN[wk] && ONTARIO_TREES.has(fo[m])) fo[m] = FOREST_UNKNOWN;
        }
        ro[m] = rock[wk]; ba[m] = bare[wk];
        if (fo[m] !== FOREST_NODATA || ro[m] || ba[m]) any = true;
        counts.forest[fo[m]]++; counts.rock[ro[m]]++; counts.bare += ba[m]; counts.cells++;
      }
    }
    if (!any) { skipped++; for (const ch of CHANNELS) fs.rmSync(tileFile(tx, ty, ch), { force: true }); continue; }
    for (const ch of CHANNELS) fs.writeFileSync(tileFile(tx, ty, ch), zlib.gzipSync(Buffer.from(bufs[ch].buffer), { level: 9 }));
    if (++written % 100 === 0) log(`  ${written}/${todo.length} tiles (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
  }
  log(`${written} tiles written, ${skipped} empty`);
  writeManifest(old, sel, counts, table, fallbacks, misses, { d05: d05.length, d02: d02.length, tiny, outcropCells });
  saveFetched();
}
let lastDiskCheck = 0;
function checkDiskEvery(opt, n) { if (n - lastDiskCheck >= 200) { lastDiskCheck = n; checkDisk(opt.minFree); } }

function writeManifest(old, sel, counts, table, fallbacks, misses, stats) {
  const tiles = [];
  for (let ty = 0; ty < grid.nty; ty++) for (let tx = 0; tx < grid.ntx; tx++) if (fs.existsSync(tileFile(tx, ty, 'forest'))) tiles.push([tx, ty]);
  let bytes = 0;
  for (const f of fs.readdirSync(OUT)) if (f.endsWith('.bin')) bytes += fs.statSync(path.join(OUT, f)).size;
  const km2 = (n) => +((n * grid.cell * grid.cell) / 1e6).toFixed(1);
  const evtNames = (c) => c.evt.filter((v) => v > 0).map((v) => `${v} ${table.get(v)?.name || '?'}`);
  const thisRun = {
    window: { tx: [sel.tx0, sel.tx1], ty: [sel.ty0, sel.ty1] }, at: new Date().toISOString(),
    cells: counts.cells, d05Polygons: stats.d05, d02Outcrops: stats.d02, d02SmallerThanACell: stats.tiny,
    forestKm2: Object.fromEntries(FOREST.map((c) => [c.key, km2(counts.forest[c.id])]).filter(([, v]) => v > 0)),
    rockKm2: Object.fromEntries(ROCK.map((u) => [u.key, km2(counts.rock[u.id])]).filter(([, v]) => v > 0)),
    bareKm2: km2(counts.bare),
    evtFallbacks: [...fallbacks].map(([v, f]) => `${v} ${f.name} -> ${FOREST[f.id].key}`),
    d05LithologyFallbacks: [...misses].map(([k, n]) => `${k} (${n}) `),
  };
  const manifest = {
    source: 'forest-rock',
    version: 1,
    script: 'scripts/sources/forest-rock.mjs',
    grid: { area: 'bwca', bbox: BBOX, proj: { lat0: proj.lat0, lon0: proj.lon0, mPerDegLat: proj.mPerDegLat, mPerDegLon: proj.mPerDegLon }, width: grid.width, height: grid.height, cell: grid.cell, originX: grid.originX, originZ: grid.originZ, tile: T, ntx: grid.ntx, nty: grid.nty },
    layout: 'data-cache/forest-rock/<tx>_<ty>.<channel>.bin: gzip of the tile\'s core 256 x 256 cells (no halo), row-major, row 0 = the tile\'s north edge (j = ty*256 + row, i = tx*256 + col). A tile not in `tiles` reads as every channel\'s nodata.',
    compression: 'gzip',
    channels: {
      forest: { type: 'uint8', nodata: 0, meaning: 'forest type (legend: forestTypes). LANDFIRE EVT at 30 m, nearest pixel to each 10 m cell centre, so it comes in 30 m squares.', legend: 'forestTypes' },
      height: { type: 'uint8', unit: 'dm', nodata: 255, meaning: 'height of the life form the forest type names, in decimetres (value / 10 = metres). LANDFIRE EVH: trees in whole metres (1-24 m in this box), shrubs and herbs in 0.1 m (0.3-3 m). 0 for water, developed and barren.' },
      cover: { type: 'uint8', unit: '%', nodata: 255, meaning: 'canopy cover % of that life form (trees 10-85 %, shrubs 10-61 %, herbs 10-76 % in this box). LANDFIRE EVC. 0 for water, developed and barren.' },
      rock: { type: 'uint8', nodata: 0, meaning: 'bedrock unit (legend: rockUnits): palette and cliff style. MGS D-05 polygons rasterized at the cell centre. 0 outside Minnesota (MGS maps Minnesota only, so rock > 0 is also the US side of the border). Covers lake beds too.', legend: 'rockUnits' },
      bare: { type: 'uint8', nodata: 0, meaning: '1 where MGS D-02 maps a bedrock outcrop (cell centre inside the polygon; an outcrop smaller than a cell marks the one cell it centres on). 0 means not mapped, not "no rock": the survey is dense along the south and the Gunflint and sparse in the north-central core. Minnesota only.' },
    },
    forestTypes: FOREST.map((c) => ({ id: c.id, key: c.key, group: c.group, quickLook: c.color, note: c.note, evt: evtNames(c), species: SPECIES_MIX[c.key] })),
    speciesNote: 'forestTypes[].species: a starting mix in placement.js SPECIES names (spruce = white spruce and balsam fir; tallPine = the old white pine over the canopy), from the NatureServe descriptions behind the EVT classes. A prior for treeWeights; the habitat still decides within a cell. The game has no maple, yellow birch, basswood or ash: those classes borrow birch and aspen.',
    forestGroups: {
      jackPineBlackSpruce: 'jack pine and black spruce (red pine through the jack pine-red pine class)',
      redWhitePine: 'red and white pine, old and planted',
      aspenBirch: 'quaking aspen and paper birch',
      spruceFir: 'white spruce and balsam fir (with birch)',
      northernHardwood: 'sugar maple, yellow birch, basswood',
      lowlandConifer: 'black spruce and tamarack on peat; cedar swamp',
      lowlandHardwood: 'black ash and floodplain hardwoods',
      bog: 'open bog and fen (non-forest)', shrubSwamp: 'alder and willow (non-forest)', marsh: 'marsh and wet meadow (non-forest)',
      shrub: 'upland shrub regrowth (non-forest)', meadow: 'open meadow (non-forest)', farmland: 'fields', rock: 'cliff and talus', developed: 'roads and towns', water: 'open water',
      forest: 'forest of a kind not mapped (the Ontario side): habitat picks the species',
    },
    rockUnits: ROCK.map((u) => ({ id: u.id, key: u.key, name: u.name, mgsMapLabels: u.labels, face: u.face, accent: u.accent, cliff: u.cliff, quickLook: u.color })),
    cliffStyles: {
      blocky: 'rectangular joint blocks, rounded whalebacks between the joints',
      banded: 'whalebacks streaked light and dark along the foliation',
      slabby: 'steep thin plates and ribs along the foliation or bedding, shelving on the dip side',
      knobby: 'massive rough knobs, few clean joints, pillows',
      angular: 'sharp angular blocks and breccia knobs',
      rounded: 'smooth rounded domes that crumble to grus, few cliffs',
      columnar: 'vertical columns over a talus apron (palisades)',
      massive: 'big dark blocks, the odd crude column',
      flaggy: 'thin horizontal shelves and crumbly slopes under a harder cap',
      stepped: 'ledges stepping down flow by flow',
      bedded: 'flat beds and cross-bedding',
    },
    notes: [
      'LANDFIRE LF2024 reflects disturbance to about 2023: no 2026 fires (real burns are their own stream). Recent burns show as openMeadow, uplandShrub and young aspenBirch/pineBlackSpruce.',
      'Ontario: LANDFIRE maps a buffer past the border, but its tree classes there are a crosswalk (Quetico came out 67 % aspen-birch, 21 % northern hardwood, almost no jack pine or black spruce), so every tree class north of the Minnesota line (MGS D-05 state boundary) is written as forestUnknown (23). Water, the open kinds (meadow, shrub, bog, marsh) and height and cover are kept there: they come from the Landsat models and run on across the border without a seam. rock > 0 also marks the Minnesota side.',
      'Water: LANDFIRE open water is 30 m and dated; the bake\'s OSM lakes stay the authority. Cells the bake calls land but LANDFIRE calls water (and the reverse) should take the nearest land (or water) class.',
      'Wetlands: d1-ground\'s ground kind (NWI, DNR wet histosols, SSURGO) is the authority for bogs, marsh and shrub swamp; the forest classes 10-17 here agree with it broadly and carry LANDFIRE\'s canopy height and cover.',
      'Rock: D-05 is a 1:100k-ish synthesis: boundaries are good to a few hundred metres, fine for colour regions and cliff style, not for a contact on a particular cliff.',
    ],
    citation: {
      landfire: 'LANDFIRE 2024 (LF2024) Existing Vegetation Type, Existing Vegetation Height and Existing Vegetation Cover, CONUS, 30 m. U.S. Department of the Interior Geological Survey and U.S. Department of Agriculture. landfire.gov; read from lfps.usgs.gov/arcgis/rest/services/Landfire_LF2024. Public domain.',
      d05: 'Minnesota Geological Survey, D-05 Bedrock Geology of Minnesota (2025 synthesis), layer 16 (Precambrian). services.arcgis.com/8df8p0NlLFEShl0r/arcgis/rest/services/D_05_Bedrock_Geology_2025. "Please reference MGS."',
      d02: 'Minnesota Geological Survey, D-02 Bedrock Outcrop Database. services.arcgis.com/8df8p0NlLFEShl0r/arcgis/rest/services/Minnesota_Bedrock_Outcrop. "No restrictions; please reference MGS."',
    },
    tiles,
    bytes,
    runs: [...(old?.runs || []).slice(-4), thisRun],
  };
  fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 1));
  log(`manifest: ${tiles.length} tiles, ${(bytes / 1e6).toFixed(1)} MB of channels`);
}

// ---------- quick-look PNGs ----------------------------------------------------------------------------------

const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
function readTile(tx, ty, ch) {
  const f = tileFile(tx, ty, ch);
  return fs.existsSync(f) ? new Uint8Array(zlib.gunzipSync(fs.readFileSync(f))) : null;
}
// Draw `win` (tiles) at one pixel per `step` cells (the cell at each pixel's corner: categories stay crisp).
function quickLook(win, step, name) {
  const W = win.w / step, H = win.h / step;
  const imgs = Object.fromEntries(CHANNELS.map((c) => [c, new PNG({ width: W, height: H })]));
  const fc = FOREST.map((c) => hex(c.color)), rc = ROCK.map((u) => hex(u.color));
  const water = [44, 93, 143];
  const ramp = (t, lo, hi) => [0, 1, 2].map((k) => Math.round(lo[k] + (hi[k] - lo[k]) * Math.max(0, Math.min(1, t))));
  const put = (img, p, rgb) => { img.data[p] = rgb[0]; img.data[p + 1] = rgb[1]; img.data[p + 2] = rgb[2]; img.data[p + 3] = 255; };
  for (let ty = win.ty0; ty <= win.ty1; ty++) for (let tx = win.tx0; tx <= win.tx1; tx++) {
    const t = Object.fromEntries(CHANNELS.map((c) => [c, readTile(tx, ty, c)]));
    for (let r = 0; r < T; r += step) for (let c = 0; c < T; c += step) {
      const px = ((tx - win.tx0) * T + c) / step, py = ((ty - win.ty0) * T + r) / step, p = (py * W + px) * 4, m = r * T + c;
      const fo = t.forest ? t.forest[m] : 0, wet = fo === 1;
      put(imgs.forest, p, fc[fo] || [255, 0, 255]);
      const he = t.height ? t.height[m] : 255, co = t.cover ? t.cover[m] : 255;
      put(imgs.height, p, wet ? water : he === 255 ? [0, 0, 0] : ramp(he / 240, [245, 240, 215], [10, 60, 20]));
      put(imgs.cover, p, wet ? water : co === 255 ? [0, 0, 0] : ramp(co / 90, [250, 245, 220], [20, 90, 30]));
      const ro = t.rock ? t.rock[m] : 0;
      put(imgs.rock, p, wet ? ramp(0.5, rc[ro] || [0, 0, 0], [20, 40, 80]) : rc[ro] || [255, 0, 255]);
      const ba = t.bare ? t.bare[m] : 0;
      put(imgs.bare, p, ba ? [255, 255, 255] : wet ? [30, 55, 85] : ro ? [70, 78, 62] : [25, 25, 25]);
    }
  }
  fs.mkdirSync(SHOTS, { recursive: true });
  const files = [];
  for (const ch of CHANNELS) { const f = path.join(SHOTS, `forest-rock-${name}-${ch}.png`); fs.writeFileSync(f, PNG.sync.write(imgs[ch])); files.push(f); }
  log(`quick-looks ${name}: ${W} x ${H} px, ${files.join(', ')}`);
}
function shots() {
  // Lake One: every cell (the lakeone tiles); the box: one pixel per 8 cells (80 m)
  quickLook(window(tilesOver(AREAS.lakeone)), 1, 'lakeone');
  quickLook(window({ tx0: 0, tx1: grid.ntx - 1, ty0: 0, ty1: grid.nty - 1 }), 8, 'box');
}

// ---------- main ----------------------------------------------------------------------------------------------

async function main() {
  const opt = parseArgs(process.argv.slice(2));
  fs.mkdirSync(OUT, { recursive: true });
  log(`${checkDisk(opt.minFree).toFixed(1)} GB free; writing to ${OUT}`);
  if (opt.shots) { shots(); return; }
  const sel = selectTiles(opt);
  log(`tiles x ${sel.tx0}-${sel.tx1}, y ${sel.ty0}-${sel.ty1} of ${grid.ntx} x ${grid.nty}`);
  if (opt.stats) {
    const table = await loadEvtTable(), fallbacks = new Map();
    const blocks = landfireBlocks(sel), hist = new Map();
    for (const row of await loadLandfire('EVT', blocks, null, { landfire: {} })) for (const a of row) for (let k = 0; k < a.length; k++) hist.set(a[k], (hist.get(a[k]) || 0) + 1);
    for (const [v, n] of [...hist].sort((a, b) => b[1] - a[1])) {
      const r = table.get(v) || {}, id = evtClass(v, table, fallbacks);
      console.log(String(v).padStart(6), `${((n * 900) / 1e6).toFixed(1)} km2`.padStart(12), '->', FOREST[id].key.padEnd(18), fallbacks.has(v) ? '(fallback)' : '          ', '|', r.lf, '|', r.name);
    }
    return;
  }
  await build(opt, sel);
  const whole = sel.tx0 === 0 && sel.ty0 === 0 && sel.tx1 === grid.ntx - 1 && sel.ty1 === grid.nty - 1;
  if (whole) {
    shots();
    if (!opt.keepRaw) { fs.rmSync(RAW, { recursive: true, force: true }); log('raw downloads deleted (fetched.json keeps the record)'); }
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
