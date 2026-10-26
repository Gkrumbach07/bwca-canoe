# Real data for the Boundary Waters

On 2026-10-26 the owner asked for real data in place of noise, starting with the burns: "we should be using real data for burns … what other good sources can we get … for everything".

This page ranks what the agencies publish by what it would change in the game. Four surveys sit behind it, and each checked every source against the game's box with a live query: [fire and forest](data-sources/fire-forest.md), [water](data-sources/water.md), [land](data-sources/land.md), and [places and wildlife](data-sources/places.md).

**How data gets in.** There are two ways:
- **A runtime table** in `src/`: small, no re-bake, like `world-fixes.json`, `site-lakes.json` and `water-grade.bin`.
- **The bake:** a new tile channel, which means a new data release.

Runtime tables come first; bake changes are batched into one re-bake.

## Where the game stands today

| Thing | Today | Real source |
|---|---|---|
| Burns | fbm noise (`fields.js burnAt`), one age everywhere | USFS final fire perimeters, 99 fires 1923–2021; NIFC WFIGS for 2026 |
| Forest type | noise | LANDFIRE LF2024 EVT (30 m) |
| Bogs and meadows | noise | NWI wetlands (120,836 polygons); DNR Potentially Wet Histosols |
| Cliffs | the drawn shore-band step; 3DEP 10 m tops out at 40.6° on Lake One | MN LiDAR 2nd gen, 1–2 m (reaches 72.9°) |
| Rock colour | one palette | MGS bedrock geology: granite, greenstone, Knife Lake slate, diabase… |
| Rapids and falls | graded steps (`water-grade.bin`), unnamed | NHD (98 rapids, 24 falls) + OSM names (Curtain, Rebecca, Basswood…) |
| Fish by lake | by habitat | DNR LakeFinder: 423 lakes with species lists and catch per net |
| Lake depth | 85 lakes with contours | LakeFinder max depth for 754 lakes |
| Water colour | clarity for 272 lakes | UMN LakeBrowser clarity and tea-stain (CDOM) for 1,293 lakes |
| Campsites | OSM (1,948) | USFS official numbers and names (1,947); 107 OSM lacks |
| Portages | OSM | USFS names, numbers, rods, class (664); OSM matches 87 % |
| Place names | lake names | GNIS (2,069) + Ontario (586): bays, points, narrows, falls, named portages |
| Climate | a curve | NOAA 1991–2020 normals by Lake One: spring 2–2.5 °C too cold in the game, midwinter 1.5 °C too warm |
| Quetico | the Minnesota OSM extract only: 97 portages | the Ontario extract adds about 250 portages |

## Ranked

### Now: runtime tables, no re-bake

1. **Real burns.** USFS Final Fire Perimeter (All Years) + NIFC WFIGS (the July 2026 fires) + USFS FACTS prescribed burns.
   - About 120 polygons, simplified, under 0.3 MB.
   - `burnAt` becomes "the year this ground last burned".
   - Regrowth comes by age: fresh black, then sapling thickets with berries, then young forest, then mature.
2. **The 1999 blowdown.** MN DNR fast forest disturbances v4, wind agent, 1999–2000: about 63k acres in the box. It gives downed timber and the regrowth after.
3. **Official campsites.** Numbers and names, plus the 107 missing sites. About 60 KB.
4. **Portage names, numbers and rods** from the USFS, matched to OSM. About 40 KB.
5. **Place names** from GNIS + Ontario. About 100 KB.
6. **Lake facts** from LakeFinder: fish per lake, max depth, ice-out, wild rice acres. About 100–150 KB.
7. **Rapids and falls** from NHD + OSM names. About 15 KB, plus 3,151 above-water rocks as boulders (about 40 KB).
8. **Climate normals and the Kawishiwi gauge:** monthly temperatures, water temperature and flow. Under 1 KB.

### Next: one re-bake (a new data release)

1. **MN LiDAR 1–2 m** for the US side: real cliff steepness, talus, boulder fields and lake levels. About 3–5 GB to read; adds about 30–60 MB to the release.
2. **NWI wetlands:** one wetland class per cell (open bog, conifer bog, shrub, marsh, in-lake emergent, aquatic bed). Pads and reeds go only where the beds really are.
3. **LANDFIRE forest type and height.** Replaces the noise forest type.
4. **Bedrock geology and outcrops:** rock colour and cliff style, and mapped bare rock.
5. **Soils:** rock outcrop, bouldery ground and peat.
6. **The Ontario OSM extract** for Quetico.
7. **UMN clarity and tea-stain:** every lake its own water colour.

### Later

- MTBS burn severity: unburned islands inside a burn.
- Forest health surveys: spruce budworm's grey-red crowns.
- FIA species biomass.
- Native plant communities.
- **Heinselman's stand-origin map:** fire years back to 1610 for every stand in the wilderness. **Don't ship it until its provenance is cleared** with the Superior NF or UMN; the only online copy is a student re-share.

## Not used, ever

The surveys found these and say no. A game shouldn't place or publish them:
- archaeological sites, and MnDOT's MnModel (an archaeological site prediction model)
- the pictographs. Picture Rock, Pictured Rocks and Warrior Hill keep at most a plain place name, with no depiction or objective.
- bald eagle nests, loon nests, waterbird colonies, lynx dens, and exact wolf, lynx or nest sightings
- rare species and plant locations (the DNR's Natural Heritage data)
- tribal wild rice monitoring points and band harvest areas: wild rice only at the scale of a lake
- tree-ring fire-scar sample sites: their fire years only
- details of human-caused fires
- restricted Ontario recreation data, and community layers with unknown licences

## A note on 2026

A lightning storm on 7 July 2026 burned about 78,000 acres in and around the wilderness: Bear Trap 30,804 ac, Thumb 25,015, Wolfpack, Sioux, Camp and Little Knife. The Superior National Forest has closures in force to 1 April 2027. These are in NIFC's live perimeters, not yet in the final archives.

The game's season runs in the current year, so a 2026 season is set the summer these fires burned.

## Fetched

Round D1's source streams write cached products for round D2's re-bake. They all share one layout:
- **Grid:** `AREAS.bwca` through `makeProjection` and `makeGrid`: 19,968 × 6,912 cells of 10 m, in 78 × 27 tiles.
- **Files:** `data-cache/<source>/<tx>_<ty>.<channel>.bin`. Each is the gzip of the tile's core 256 × 256 cells (no halo), row-major, little-endian. Row 0 is the tile's north edge, so `j = ty*256 + row` and `i = tx*256 + col`.
- **Manifest:** `manifest.json` gives the grid, the channels (type, unit, nodata, legend), the tiles written and the citations. A tile that isn't listed reads as every channel's nodata.

### forest-rock (D1-forest-rock, 2026-10-26)

`scripts/sources/forest-rock.mjs` writes `data-cache/forest-rock/`: 2,106 tiles × 5 channels, 45 MB.

Run it from the repo root. From a worktree, set `BWCA_CACHE` to the main checkout's `data-cache`.
- Flags: `--tiles tx0-tx1,ty0-ty1` or `--lakeone`, `--force`, `--keep-raw`, `--stats`, `--shots`.
- **Speed:** about 4 minutes for the whole box from nothing: 2 to fetch, 2 to derive.
- **Re-running:** it skips tiles already written.
- **Downloads:** a whole-box run deletes them afterwards (38 MB). `fetched.json` keeps the record of what was fetched.

| Channel | Type | Meaning | Nodata | Gzip size |
|---|---|---|---|---|
| `forest` | u8 | forest type, the legend below (LANDFIRE LF2024 EVT, 30 m) | 0 | 8.3 MB |
| `height` | u8 | height of the life form, **decimetres** (LANDFIRE EVH). Trees run 1–24 m here, shrubs and herbs 0.3–3 m, so decimetres keep a 2.6 m alder thicket apart from a 0.6 m bog shrub. | 255 | 14.8 MB |
| `cover` | u8 | canopy cover % of that life form (LANDFIRE EVC: trees 10–85 %) | 255 | 20.7 MB |
| `rock` | u8 | bedrock unit, the legend below (MGS D-05, layer 16). 0 outside Minnesota. | 0 | 0.6 MB |
| `bare` | u8 | 1 where MGS D-02 maps a bedrock outcrop | 0 | 0.9 MB |

**Forest types.** The game's species groups plus the non-forest kinds. The manifest also gives each type a starting species mix in placement.js `SPECIES` names, as a prior for `treeWeights`.

| id | key | group | km² in box | LANDFIRE EVT |
|---|---|---|---|---|
| 1 | water | water | 2,348 | 7292 |
| 2 | pineBlackSpruce | jack pine–black spruce | 476 | 9088 |
| 3 | pineSpruceHardwood | jack pine–black spruce | 134 | 9295 |
| 4 | jackRedPine | jack pine–black spruce | 778 | 9112, 7407, 7243, 7242 |
| 5 | redWhitePine | red and white pine | 331 | 7362, 7239, 7238 |
| 6 | pinePlantation | red and white pine | 14 | 9312 |
| 7 | aspenBirch | aspen–birch | 957 | 7301, 9315, urban deciduous and mixed |
| 8 | spruceFir | spruce–fir | 2,279 | 9089, urban evergreen |
| 9 | northernHardwood | northern hardwood | 788 | 7302, 7314 |
| 10 | conifersBog | lowland conifer (black spruce, tamarack) | 779 | 9056 |
| 11 | cedarSwamp | lowland conifer (cedar) | 410 | 7481 |
| 12 | floodplainForest | lowland hardwood | 6 | 9117, 7444, 9314 |
| 13 | openBog | bog | 53 | 9055, 9057 |
| 14 | sedgeFen | bog | 20 | 9114 |
| 15 | shrubSwamp | alder and willow | 30 | 9620, 9617, 7272 |
| 16 | marsh | marsh | 59 | 9118, 9202, 9318 |
| 17 | wetMeadow | marsh | 44 | 9120 |
| 18 | uplandShrub | shrub regrowth | 69 | 9317 and others |
| 19 | openMeadow | meadow (recent burns, clearings) | 345 | 9817 and others |
| 20 | farmland | fields | 3 | pasture and crops |
| 21 | rockCliff | rock | < 0.1 | 9113 (LANDFIRE maps almost none) |
| 22 | developed | roads, towns, pits | 99 | 7295–7299 |
| 23 | forestUnknown | forest, kind not mapped | 3,783 | every tree class on the Ontario side |

**Rock units.** Each unit has a face colour (weathered, lichen-free), an accent and a cliff style. Each style is described in the manifest. For comparison, the game's granite today is `#9c958e` and its cliffs `#7f857a`.

| id | key | MGS map labels | face | accent | cliff | km² |
|---|---|---|---|---|---|---|
| 1 | lacLaCroixGranite | Aql | `#a69a90` | `#cbb3a1` | blocky | 1,084 |
| 2 | saganagaTonalite | Ast | `#a7a6a0` | `#d3d2cb` | blocky | 214 |
| 3 | graniticPluton | Agm Aqm Agr Agt Asd Aqp Ami | `#a2978f` | `#c1aa9b` | blocky | 475 |
| 4 | graniteMigmatite | Aqg Aqt | `#9c968f` | `#c6baae` | banded | 963 |
| 5 | biotiteSchist | Aqs | `#8b8882` | `#6f6c67` | slabby | 537 |
| 6 | amphibolite | Aqa | `#71736c` | `#8e9088` | slabby | 84 |
| 7 | greenstone (Ely, Newton Lake) | Amv Acv Auv Aag Agp | `#7d8573` | `#5e6756` | knobby | 530 |
| 8 | felsicVolcanic | Avs Akv | `#a39e8f` | `#c4bca8` | angular | 352 |
| 9 | knifeLakeSlate | Aks Asc Akc Asg | `#70736e` | `#8f928b` | slabby | 337 |
| 10 | ironFormation | Aif Pai | `#6c5b53` | `#8d4b3b` | banded | 27 |
| 11 | anorthosite | Mau | `#b3afa7` | `#908b9a` | rounded | 1,005 |
| 12 | troctoliteGabbro | Mlt Mlg Mge Mbt Mbg | `#8c8172` | `#4e4b46` | rounded | 647 |
| 13 | granophyre | Mfg Mmf | `#a9887b` | `#c59b86` | blocky | 474 |
| 14 | diabaseSill (Logan) | Mld Mmd Mbd | `#60615d` | `#7b6f63` | columnar | 261 |
| 15 | gabbroSill (Brule–Hovland) | Mmg | `#6f6d67` | `#8b8073` | massive | 413 |
| 16 | roveSlate | Pas | `#5e605e` | `#7e807c` | flaggy | 167 |
| 17 | sandstone (Puckwunge) | Mms Mns | `#b59d81` | `#9c7056` | bedded | 3 |
| 18 | basalt (North Shore) | Mnb Mnl Mvu Mnu | `#6f6661` | `#8d5e4f` | stepped | 883 |
| 19 | rhyolite | Mnr | `#9d8075` | `#c09c8b` | blocky | 153 |

**Mapped bare rock:**
- 102,746 D-02 outcrop polygons, 251 km² of cells.
- 15,544 of them are smaller than a cell. Each keeps the one cell it centres on.
- The survey is uneven: dense in the south and on the Gunflint, sparse in the north-central core, and laid out along field traverses (dotted lines on the quick-look). A 0 means "not mapped", not "no rock".

**Checks:**
- LANDFIRE water against the bake's OSM lakes agrees best at zero shift. Over the whole box the overlap (IoU) is 0.64, with the next shifts at 0.640–0.643, so the cut sits on the bake's grid.
- 88 % of OSM water is LANDFIRE water. LANDFIRE's 30 m pixels miss the narrow channels and the creeks.

**Ontario.** LANDFIRE maps a buffer past the border, but its tree classes there are a crosswalk, not a survey. Quetico came out 67 % aspen–birch and 21 % northern hardwood, with almost no jack pine or black spruce.
- **The rule:** north of the Minnesota line (the MGS D-05 state boundary), every tree class becomes `forestUnknown`.
- **Kept on that side:** water, the open kinds (meadow, shrub, bog, marsh) and height and cover. These come from LANDFIRE's Landsat models and run on across the border with no seam.
- **MGS covers Minnesota only,** so `rock` is 0 and `bare` is 0 there.
- **A real fill for Quetico** could be NRCan's SCANFI: 30 m maps of species, height and canopy closure on Canada's open-data portal. This stream did not fetch it or check its licence. The OGS 1:250k bedrock map (MRD126-REV1) is on ArcGIS as `services2.arcgis.com/zVN3OC2fz0Sgv7ip/.../Bedrock_Geology_Dodge__WFL1`, under the Ministry of Mines' own terms of use. Check those terms before using it.

**For D2:**
- **Water and wetlands:** the bake's lakes stay the authority for water. d1-ground's ground kind stays the authority for wetlands. Where they disagree with `forest`, take the nearest land or wetland class.
- **Height and cover:** these are the life form's, so read them with `forest`. Both are 0 on water, developed and barren cells.
- **Rock:** colour and cliff style come from `rock`. Where `bare` is set, place open ledges, and let d1-lidar's slope and relief place the rest.
- **Date:** LF2024 reflects disturbance to about 2023. The 2026 fires are the burns stream's.
- **Quick-looks:** in the main checkout's `shots/`: `forest-rock-{lakeone,box}-{forest,height,cover,rock,bare}.png`. Lake One is drawn at 1 px per cell, the box at 1 px per 80 m.
- **Sources:**
  - LANDFIRE LF2024: public domain.
  - MGS D-05 and D-02: "please reference MGS".
