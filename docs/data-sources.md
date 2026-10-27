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
| Burns | **real since 2026-10-26** (below): 109 wildfires, 246 prescribed burns and the 1999 blowdown, by age at the season's date | USFS final fire perimeters, 99 fires 1923–2021; NIFC WFIGS for 2020 on and 2026; FACTS; DNR wind |
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

1. **Real burns** (built 2026-10-26: "Burns: how they work now", below). USFS Final Fire Perimeter (All Years) + NIFC WFIGS (the July 2026 fires) + USFS FACTS prescribed burns.
   - About 120 polygons, simplified, under 0.3 MB.
   - `burnAt` becomes "the year this ground last burned".
   - Regrowth comes by age: fresh black, then sapling thickets with berries, then young forest, then mature.
2. **The 1999 blowdown** (built with the burns). MN DNR fast forest disturbances v4, wind agent, 1999–2000: about 63k acres in the box. It gives downed timber and the regrowth after.
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

## Burns: how they work now (built 2026-10-26)

The fbm noise that `fields.js burnAt` was is gone. Every burn in the game is a real one, at its real age.

**The table.** `scripts/burns.mjs` queries the four services in the game's box and writes `src/burns.bin` (164 KB, gzipped
as a whole; the cached answers live in `data-cache/burns/`, `--refresh` asks again):
- USFS EDW Final Fire Perimeter (All Years): 99 wildfires, 1923–2021.
- NIFC WFIGS Interagency Perimeters: the fires from 2020 on that EDW lacks, each its latest perimeter with its
  discovery date. The six July 2026 fires (Bear Trap, Thumb, Wolfpack, Sioux, Camp, Little Knife) are here.
- USFS FACTS fire treatments: broadcast burns and underburns only, as kind "prescribed". No pile burns. A unit
  keeps a name only when it is a place ("Acorn Lake", "Swamp River").
- MN DNR fast forest disturbances v4, wind 1999–2001: one event, the blowdown of 4 July 1999.

Each event keeps its kind, name, year and start day, never a cause or an origin. Perimeters are simplified to 20 m
(the blowdown, traced from 30 m Landsat pixels, to 30 m) and stored as varint steps in whole metres. The table has
356 events and 65,906 points.

The table keeps whole perimeters. The game clips them to land where it reads them, by its own shore distance: water
is never burned. A hole for every lake inside Pagami Creek would double the table. An event with no land on the
80 m far grid is dropped (two FACTS units).

**The lookup** (`src/burns.js`):
- The index is built when the table loads (about 90 ms, in each tile worker and on the main thread). It is a grid of
  200 m cells listing the events that reach each cell, whether the cell's centre is inside, and the perimeter edges
  within 42 m.
- A point is inside an event when the centre is, flipped at each edge the line from the centre crosses. Its edge
  weight is a soft band (±14 m) pushed about ±26 m by a noise, so the edge runs ragged.
- A query costs about 0.12 µs.
- The answer is the newest event whose start has come by the season's date, and the one before it. A fire counts
  once its year is before the season's, or in the same year once the date is past its start day. So the July 2026
  fires are there from their real starts in a 2026 season and absent in June.
- `burnLook(x, z)` blends what the two events left at their ages (the `LOOK` curves): char, open ground, snags
  (black, then grey with a charred foot), deadfall, the regrowth thicket and its height, young trees and theirs,
  the understory left, bracken and shrubs coming in, grass and fireweed, berries.
- A fire through a burn under 40 years old leaves fewer snags and less down wood ("burned 2006, again 2011").

**The date.**
- main.js sets it before the first tile is asked for: the saved trip's date, else today's.
- The frame keeps it to the clock, except behind the title card, whose clock is the real one until a season is
  picked.
- tiles.js sends it with every build, and the worker sets it after its last await.
- A tile shows the burns begun by the day it was built. Tiles already loaded keep what they were built with.

**What each age looks like** (wildfire; the curves are in `burns.js LOOK`):
- **Under 1 year:** black ground with pale ash (the terrain's char, the floor's w on land), black snags where the
  forest stood, a few charred logs, almost no grass or understory. The audio's leaves fall quiet.
- **1–3 years:** the char breaks into patches, and fireweed comes in (taller tufts, magenta in July and August). Also
  grass, bracken, raspberry and other shrubs, and aspen suckers (the `regrowth` species). The snags are still standing.
- **3–12 years:** a thicket of aspen and jack pine clumps 1–3 m tall, grey snags with a charred foot, and berries
  four times as likely (`forage.js`).
- **12–30 years:** young jack pine, aspen and birch, 4–10 m and as dense as the forest at that distance from water.
  The snags come down into deadfall and the thicket thins out.
- **30–70 years:** young mixed forest (spruce and fir coming in), a few old snags.
- **70 years and more:** ordinary forest.
- **The blowdown:** old trunks down to the east-southeast with root plates to the west-northwest, a few trees left
  standing or snapped. Fir, birch and aspen come up through them, and the trunks grey and thin out over decades.
- **A prescribed burn (an underburn):** scorched ground for a year or two and a charred foot on the trunks. The
  understory opens, and the fir and spruce under the pines are killed while the pines stand. Then grass and
  blueberries come in.

**The words.**
- The first time each season you come into a named burn (on foot, or on the water within 300 m of its shore), a
  note says its name once: "The Pagami Creek burn, 2011.", "The blowdown of July 1999.", "The Camp fire, 2026."
  (`burn-notes.js`; remembered in the season's `burns`).
- On foot in an open burn, the place name is the burn's ("The Ham Lake burn").
- Keepers can tell of a burn near their landing that still shows (`talk-rumours.js` `burn`).

**Cost** (M4 Pro, 1440 × 900, 28 July 17:30, best synced frame, interleaved with c57e1f3):

| Spot | Before | After |
|---|---|---|
| John Ek 2021 (5 years, the thicket), on foot | 9.54 ms, 731 calls, 7.28 M triangles | 8.03 ms, 702, 6.40 M |
| John Ek, from the water | 11.77 ms, 928, 8.04 M | 9.88 ms, 921, 7.56 M |
| The Camp fire (three weeks old), on foot | 7.03 ms, 656, 3.91 M | 5.88 ms, 585, 3.30 M |
| The Camp fire, from the water | 11.54 ms, 873, 7.70 M | 8.97 ms, 772, 4.38 M |
| Pagami Creek 2011 (15 years), on foot | 8.46 ms, 801, 6.35 M | 8.58 ms, 820, 6.68 M |
| Lake One (no fire), from the water | 10.64 ms, 796, 6.84 M | 9.53 ms, 784, 7.06 M |

Two browsers shared the machine, so expect ±10 % on the times.
- **Fresh burns and thickets cost less than the forest they replace:** snags have 52 triangles, a regrowth clump
  about 90, and a tree 150–330.
- **The young-forest years cost the most.** They were trimmed to the forest's own density, jack pine first.
- **Shader programs:** 79 at every place after the title's prewarm, as before. Noon at Lake One is 80 in both builds.
- **The start (tiles round Lake One primed):** best of four runs 5.3 s, against 4.9 s. The table is 164 KB, and
  each worker and the main thread take about 90–150 ms to read and index it.
- **Placement:** a tile in an old burn takes up to twice as long to place (Pagami Creek: about 0.7–1.2 s, against
  0.35–0.5 s). An unburned tile places exactly as before: on the lodge's tile, 115,096 instances and every cover
  byte in the unburned cells are identical to c57e1f3's.

**Left for the owner:**
- **Closures.** The Superior NF closed the 2026 fire areas to 1 April 2027 (Forest Order 09-09-00-26-11). The game
  lets you paddle and camp in them.
- **Severity inside the perimeters.** A perimeter burns uniformly; real fires leave unburned islands and lightly
  burned patches (MTBS dNBR rasters, "Later" above).
- **The pre-1942 unnamed fires** (Superior NF FireHistory) and **Heinselman's stand origins**: waiting on provenance.
- **The WFIGS 2026 perimeters are daily ones.** Run `node scripts/burns.mjs --refresh` once the final perimeters are
  published.
- **A tile already built keeps its date.** Crossing a fire's start day mid-season, tiles built before it stay unburned
  until they are built again.

## A note on 2026

A lightning storm on 7 July 2026 burned about 78,000 acres in and around the wilderness: Bear Trap 30,804 ac, Thumb 25,015, Wolfpack, Sioux, Camp and Little Knife. The Superior National Forest has closures in force to 1 April 2027. These are in NIFC's live perimeters, not yet in the final archives.

The game's season runs in the current year, so a 2026 season is set the summer these fires burned.

## Fetched

Round D1's source streams write grid-aligned products to `data-cache/<source>/` for round D2's bake. They all share one layout:
- **Grid:** the bake's `bwca` grid (`scripts/config.mjs`: 19,968 × 6,912 cells of 10 m, 78 × 27 tiles of 256, origin −99,840, −34,560).
- **Files:** `data-cache/<source>/<tx>_<ty>.<channel>.bin`. Each is the gzip of the tile's core 256 × 256 cells (no halo), row-major, with row 0 at the tile's north edge (cell j = ty·256 + row, i = tx·256 + col), little-endian.
- **Manifest:** `manifest.json` gives the grid, the channels (type, unit, nodata, legend), the tiles written and the citation. A tile that isn't listed has no data.

### D1-lidar: MnTOPO 2 m LiDAR on the 10 m grid

`node scripts/sources/lidar.mjs` reads the six 2 m COG chunks by window through a GDAL VRT and keeps only the derived cells.
- **Run:** one 4 × 4-tile window at a time, about 10.5 km and 110 MB of Float32, deleted as soon as it is derived.
- **Needs:** GDAL (`brew install gdal`) and the bake's OSM cut, for the border.
- **Resumable:** a re-run skips tiles already in the manifest. `--force` redoes them.
- **Testing:** `--tiles 29-34:19-22` or `--area lakeone` limits it to a few tiles.
- **After a run:** `--report` and `--shots` make the comparison and the pictures.

The whole US side took 6 minutes: 114 windows, 9.7 GB of 2 m pixels read and thrown away. Free disk never dropped below 155 GB, so the 15 GB stop never fired.

**What it wrote:** 1,436 tiles, 220 MB (`height` 80 MB, `slope` 45, `relief` 47, `rough` 45, `level` 1.3, `mask` 1.4), plus `manifest.json` (230 KB) and `report.json`.

| Channel | Type | Meaning | Nodata |
|---|---|---|---|
| `height` | Int16, dm (NAVD88) | mean of the 2 m pixels whose centres fall in the cell (on water, the flat surface) | −32768 |
| `slope` | Uint8, degrees | steepest 2 m pixel in the cell (Horn 3 × 3 on the 2 m grid) | 255 |
| `relief` | Uint8, dm | highest minus lowest 2 m pixel in the cell; 254 = 25.4 m or more | 255 |
| `rough` | Uint8, cm | RMS residual of the cell's pixels from their least-squares plane: boulders, talus and ledges (a cliff step reads rough too); 254 = 2.54 m or more | 255 |
| `level` | Int16, dm | the hydro-flattened water surface: the mean of the cell's flat pixels (4 neighbours within 1 mm), wherever it holds two or more | −32768 |
| `mask` | Uint8, bits | 1 LiDAR (over half the cell covered; the other channels valid) · 2 water (half or more of its pixels hydro-flat) · 4 edge (some pixels missing) · 8 shore (some flat water, under half) · 16 US side of the border | 0 |

**Coverage.**
- The flight covers the whole US side: 84.0 M cells, 12.7 M of them water (Lake Superior included).
- It also runs up to about 3 km into Ontario in blocky steps: 5.1 M cells, 65 tiles with Ontario only. Bit 16 marks the US side, from OSM's Minnesota–Ontario boundary.
- **Use the LiDAR only where bits 1 and 16 are both set.** Ontario stays on today's terrain.
- There are two voids south of the wilderness, near Ely (around −91.75, 47.80–47.86) and near Tower (around −92.4, 47.81). Nothing there is in the wilderness.
- The flight ends a few hundred metres out into Lake Superior.

**Lake One against today's heights** (`data-cache/lidar/report.json`):
- **Heights barely move at 10 m.** On land more than 30 m from the shore, the LiDAR mean minus the game's height is −0.08 m on average (RMS 0.35 m, 5–95 % −0.4 to +0.2 m). Against the raw 3DEP the bake samples, it is −0.05 m (RMS 0.22 m). Here, 3DEP at 10 m is itself lidar-derived. Within 30 m of the shore the RMS is 0.78 m: the bake's bank shaping raises the banks a little.
- **Lake levels sit 0–0.9 m higher than the game's** (median +0.3 m; one creek is 0.2 m lower):
  - Lake One 447.1 m against 446.4 m
  - Lakes Two, Three and Four 452.6 m against 452.3 m
  - Clearwater 458.8 m against 458.6 m

  The bake takes a low percentile of the DEM's water cells. The LiDAR surface is the water on the flight days (April–May 2021).
- **Part of "Lake Four" is a separate water body.** 1,760 of its cells, around 47.901, −91.387, lie flat at 454.2 m, 1.6 m above the rest at 452.6 m. Today they share one level. The level channel separates them.
- **Water:** 160,066 cells are water in both. 12,233 are OSM-only: creeks rasterised as channels (streams under about 30 m wide aren't flattened) and small ponds. 5,504 are LiDAR-only (`lakeone-water-vs-osm.png`).
- **Slopes:** the steepest 10 m cell in the game is 44.7°. The LiDAR averaged to 10 m tops out at 44.3°, and its steepest 2 m pixel at 72°.
  - Cells holding a 2 m pixel over 45°: 0.88 %, against 0 % today.
  - Over 55°: 0.17 %.
- **Roughness on land:** median 9 cm, 95th percentile 34 cm. 7 % of cells are over 30 cm. On 35–50° slopes the median is 43 cm.

**The cliffs it finds.** A cliff here is a connected group of cells whose steepest 2 m pixel is 50° or more, with 3 m of relief.
- **Over Lake One:** 1,197 groups, 3,731 cells. The biggest:
  - 264 m long at 68°, inland at 47.920, −91.433, with a 27 m face. Beside it, 32 m from Bridge Lake, a 163 m group has the area's tallest face (31 m).
  - 314 m at 68°, 28 m from Plukesley Lake (47.919, −91.519)
  - 192 m at 65°, 10 m from Lake One (47.932, −91.483)
  - 122 m at 69°, 63 m from Lake Four (47.911, −91.384)

  `lakeone-cliffs.png` shows them in red over the hillshade.
- **On the whole US side:** 68,732 groups.
  - Land cells holding a 2 m pixel over 35°: 2.6 %; over 45°: 0.80 %; over 55°: 0.21 %; over 65°: 0.04 %.
  - The tallest faces, 70–98 m at 67–85°, are in the east:
    - the Border Route palisades: Clearwater Lake (East), Watap, Rose and Mountain lakes
    - the Fowl Lakes country: South Fowl, John, McFarland, Royal, Drag and Canuck lakes
    - the hills above the Pigeon River near 47.88, −89.92
    - in the west, the bluffs on Kekekabic Lake (48.07, −91.17)
  - "Face" is the height range of the group and its ring of cells, an upper bound for a long group on a hillside.

**For round D2:**
- Read `height` only where `mask & 17 == 17`. Blend to today's heights over the last 50–100 m inside the mask edge. The flight's edge is blocky and the border runs through lakes, but the two sources agree to about 0.3 m, so a short ramp is enough.
- Take each lake's level as the median of `level` over the lake's own cells, not per cell, so a border lake doesn't step at the edge of the flight. Expect lakes to rise about 0.3 m, so check the shore shaping.
- Cliffs, talus and boulder fields can come from data rather than from the drawn-shore step in `site.js`:
  - A face is `slope` ≥ 50 with `relief` ≥ 30 (3 m).
  - Talus or ledges are 30–50° with `rough` ≥ 30.
  - A boulder field is `slope` < 30 with `rough` ≥ 25.

  These are suggestions to tune against the shots.
- Shipping all three detail bytes adds about 140 MB gzipped across the tiles. The game may want one combined "rock" byte: a cliff, talus or boulder class plus the face height.
- Horizontal NAD83(2011) is treated as the game's WGS84 (about 1 m apart here). Heights are NAVD88, the same as 3DEP.

**Quick looks:** `shots/d1-lidar/` in the main checkout (gitignored), one PNG per channel:
- `lakeone-*.png` at 10 m, including `lakeone-diff-vs-today.png`, `lakeone-today-slope.png`, `lakeone-water-vs-osm.png` and `lakeone-cliffs.png`
- `box-*.png` at 80 m (block max for slope and relief, mean for rough)

- **Grid:** `AREAS.bwca` through `makeProjection`/`makeGrid`: 19,968 × 6,912 cells, 78 × 27 tiles, origin −99840, −34560.
- **Files:** `<tx>_<ty>.<channel>.bin` holds gzip of the tile's core 256 × 256 cells, with no halo. Rows run from the north edge, cell i = tx·256 + col, little-endian.
- **Manifest:** `manifest.json` gives the grid, channels (type, legend, nodata), the tiles written and the citations.
- **Missing tiles:** a tile with nothing to say isn't written. Fill it with each channel's nodata.

### Ground kind (D1-ground): `scripts/sources/ground.mjs`

**What it makes.** Four byte channels per 10 m cell, in `data-cache/ground/`. 1,386 of the 2,106 tiles have data; the rest are wholly Ontario.

| Channel | Meaning | Nodata |
|---|---|---|
| `kind` | What the ground is (legend below) | 0 = no survey |
| `rock` | Rock outcrop % of the SSURGO map unit (0–35 in this box) | 255 |
| `stone` | Surface stone and boulder cover: byte = 254·√(cover fraction), so cover % = 100·(byte/254)² | 255 |
| `peat` | Histosol (peat and muck) % of the SSURGO map unit | 255 |

**Sources.** All cached compactly in `data-cache/ground/raw/`, fetched per block of 4 × 4 tiles, and resumable:
- **NWI for Minnesota, 2009–14 (MN DNR):** 127,816 polygons with Cowardin code and plant community, generalised to ~2 m on the server. Open water of 100 acres or more is left out, since those are the bake's own lakes.
- **SSURGO by Soil Data Access (NRCS):** 76,086 map-unit pieces clipped per block, and a 455-map-unit table of components (rock outcrop, Histosols, stone phases, surface fragment cover).
- **OSM:** 544 `natural=beach/sand/bare_rock/rock/scree` areas from the bake's cached Minnesota extract.

**Sizes.** The raw cache is 37 MB. The products are 15 MB of gzip (kind 4.6 MB, rock 4.0, stone 4.6, peat 2.2), 63 MB on disk across 5,544 files.

**Run it** from the repo root, so `data-cache/` is the main checkout's:
- `node scripts/sources/ground.mjs` fetches (~7 min) and rasterises (~3 min). It stops if disk falls under 15 GB free.
- `--tiles lakeone` (or `--tiles tx0-tx1,ty0-ty1`) does a test area.
- `--no-fetch` re-derives from the cache after changing a rule.
- `--png` draws the quick-looks.
- `--check` compares `peat` with the DNR's own layer.

**The kinds**, with area in the box:

| Value | Kind | Colour | From | km² |
|---|---|---|---|---|
| 0 | none | `#d9d9d9` | no survey (Ontario): keep the game's own fields | — |
| 1 | upland | `#ebe5d3` | surveyed dry land | 5,621 |
| 2 | open bog | `#c9ae4f` | NWI "Open Bog" (scrub-shrub, Circular 39 type 8) | 196 |
| 3 | conifer bog | `#35603d` | NWI "Coniferous Bog" (forested, type 8): black spruce, tamarack | 709 |
| 4 | shrub swamp | `#8ea05a` | NWI "Shrub Wetland": alder, willow | 228 |
| 5 | marsh | `#5fa596` | NWI "Shallow Marsh" (PEM1) | 142 |
| 6 | wet meadow | `#c6d474` | NWI "Seasonally Flooded/Saturated Emergent": sedge and beaver meadows | 64 |
| 7 | hardwood swamp | `#7b5b3b` | NWI "Hardwood Wetland": black ash | 141 |
| 8 | in-lake emergent | `#e0453a` | NWI L2EM, R2EM and PEM2 "Deep Marsh": wild rice, bulrush, reeds | 33 |
| 9 | aquatic bed | `#e38bd0` | NWI L2AB, R2AB, PAB: lilies, pondweed | 18 |
| 10 | rock outcrop | `#7c7c86` | OSM bare_rock/rock areas, NWI rocky shore | 0.2 |
| 11 | boulder field | `#9d6ad0` | OSM scree, or a map unit at least half rubbly with no NWI wetland | 97 |
| 12 | sand | `#f0cd5e` | OSM beach/sand, NWI sand shore (US2) | 0.1 |
| 13 | open water | `#8db6dc` | NWI open water under 100 acres, SSURGO "Water" | 1,261 |

Wet meadow and open water go beyond the brief's list. Wet meadow is the game's own "meadow" (fields.js `meadowAt`: fens and beaver meadows), and NWI maps it apart from marsh.

**Precedence.** The first rule that applies decides a cell:
1. NWI aquatic bed, then in-lake emergent.
2. OSM mapped sand, rock or scree. They're small and precisely placed, so they win over the NWI polygon they sit in.
3. NWI palustrine wetlands (2–7).
4. NWI rocky shore, sand shore or open water.
5. SSURGO: "Water" gives open water, at least half rubbly gives boulder field, anything else is upland.
6. Nothing surveyed: none.

A cell takes a polygon when its centre is inside it, by even-odd across the polygon's rings, as bake.mjs rasterises lakes.

**What round D2 needs to know:**
- **Rock outcrop as a kind is nearly empty, and that's the data.** No SSURGO map unit here is more than 35 % rock (the Quetico–Rock outcrop complexes on the steep shores are 30–35 %), and a map unit doesn't say where inside it the rock lies. Place bare rock from the `rock` share together with D1-lidar's slope and roughness, and D1-forest-rock's MGS D-02 mapped outcrops. Suggested: where D1-forest-rock's `bare` channel is on (251 km² of MGS D-02 outcrop, Minnesota only; 0 there means "not mapped", not "no rock"), the cell becomes kind 10, below the NWI kinds 2–9. D1-forest-rock's manifest points at the same rule.
- **Sand is real only where mapped:** about 40 OSM beaches (0.1 km²). No agency maps BWCA beaches. Inferring more (gentle hydro-flat LiDAR shore, D-01 outwash sand) is D2's call.
- **Boulder fields (97 km²)** are mostly rubbly wet lowland (Aquepts and Giese, rubbly) that NWI leaves unmapped. Elsewhere, `stone` gives the boulder density everywhere: bouldery 0.06 %, very bouldery 2 %, extremely 5 %, rubbly 25 % of the surface per component.
- **Peat is a map-unit share, everywhere SSURGO maps.** Masked to the NWI kinds (2–9, 13), it is the DNR's "Potentially Wet Histosols".
  - 204 km² of soil that is at least half peat lies off NWI:
    - 153 km² is within 30 m of an NWI polygon: the two surveys' boundaries.
    - 22.5 km² is frequently flooded creek bottom (Bowstring muck).
    - About 29 km² is Rifle, Greenwood or Dora peat that NWI didn't map.
  - The kind stays NWI's there. D2 may promote the last group to conifer bog.
- **The check against the DNR layer** (`--check`): 52 % of cells are equal over Lake One, 35 % in a block near Knife Lake.
  - The DNR built its layer from gNATSGO; SSURGO here was re-saved on 2026-09-07.
  - Where they differ, it is mostly DNR 100/90 against our 50/45 in Lake County map units that now list a mineral component beside the peat (Bowstring and Fluvaquents; Giese, rubbly–Tacoosh–Rifle), plus slivers at boundaries.
- **Lakes:** lake cells carry SSURGO "Water", so they read as open water. The bake's lake mask stays the authority on water. The beds (8, 9) lie in the water; place pads and reeds there instead of by `calmAt`.
- **Ontario has no NWI or SSURGO.** Kind 0 means keep today's noise fields in Quetico.
- **Helpers:** `ground.mjs` exports `readPack`, `rasterize`, `nwiKind`, `mapunitFacts` and `blockEnvelope` for D2, if it wants to re-derive from the raw cache.

**Quick-looks:** `shots/ground-{lakeone,bwca}-{kind,rock,stone,peat}.png` and `shots/ground-legend.png`. Lake One is at 10 m per pixel, the whole box at 80 m, with the live bake's lakes in blue.

**Gotchas:**
- **NWI paging:** the NWI FeatureServer returns fewer than `resultRecordCount` (953 of 1000) with `exceededTransferLimit` set. Page by the count it returns.
- **SDA SQL:** it rejects `DECLARE`, so inline the geometry. `STIntersection` with the block can return a GEOMETRYCOLLECTION; keep only its polygons.
- **SSURGO stone cover:** cosurffrags `sfragcov_r` exists for nearly every phased component. The phase-class midpoints are only the fallback.

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
- **Bare rock and the ground kind:** `bare` is the main mapped bare rock. d1-ground's ground kind has almost none of its own (0.2 km², from OSM), and no SSURGO map unit in the box is over 35 % rock outcrop. The rule:
  - Set ground kind 10 (rock outcrop) where `bare` is on.
  - Don't override the NWI wetland kinds 2–9.
  - Place the rest from the SSURGO rock share (`data-cache/ground/<t>.rock.bin`) with d1-lidar's slope and roughness.
- **Date:** LF2024 reflects disturbance to about 2023. The 2026 fires are the burns stream's.
- **Quick-looks:** in the main checkout's `shots/`: `forest-rock-{lakeone,box}-{forest,height,cover,rock,bare}.png`. Lake One is drawn at 1 px per cell, the box at 1 px per 80 m.
- **Sources:**
  - LANDFIRE LF2024: public domain.
  - MGS D-05 and D-02: "please reference MGS".

Round D1's source streams write cached products to `data-cache/<source>/` in the main checkout. Each has a `manifest.json` (channels, legend, type, citation) and quick looks in `shots/` and `data-cache/<source>/quicklook/`. Round D2 reads them into the bake.

### Quetico OSM and lake colour (D1-quetico-lakes)

Two scripts, each runnable alone and idempotent, with `--tiles x0-x1,y0-y1` for a test run:

| Script | Writes | Size |
|---|---|---|
| `scripts/sources/quetico-osm.mjs` | `data-cache/quetico-osm/` | 112 MB (the 1 GB province file is deleted after the cut) |
| `scripts/sources/lake-colour.mjs` | `data-cache/lake-colour/` | 26 MB: the table 3.8 MB, the tiles 4.4 MB, and the cached LakeBrowser pull and pixel answers |

**The Ontario side's OSM.** Geofabrik `north-america/canada/ontario` (2026-10-25 data, 1.03 GB) is cut with osmium to the bake's grid box plus 0.02° (9.4 MB). The bake's own extractor (`osm-extract.mjs loadOsm`) then runs over the Ontario cut and the bake's Minnesota cut together. The result has exactly the form the bake reads today:

- `extract-v2-<key>.json` (62 MB) is a drop-in for `data-cache/osm/extract-v2-<key>.json`. Minnesota wins on any object both cuts hold, so nothing on the US side changes. Campsites and POIs held by both cuts are de-duplicated.
- `extract-v2-ontario-<key>.json` is the Ontario cut alone, for reference.
- `islands-<key>.json`, `border-<key>.json` (the US–Canada line, 417 km in the box) and `report-<key>.json` (the counts below).

What the merge adds inside the grid (the Minnesota extract already reached a few kilometres into Ontario):

| | Minnesota extract | Merged | Added |
|---|---|---|---|
| Water polygons | 7,957 | 10,158 | 1,880 in the grid, all in Canada, 575 km² (263 named: Northern Light 66 km², Kawnipi 43, Agnes 30, Whitefish 30, Poohbah, Saganagons, Weikwabinonaw, Brent, Sandstone, Burt, Kahshahpiwi, McIntyre…) |
| Waterway lines | 15,596 | 17,386 | 1,790 (1,052 km) |
| Portage chains | 1,027 (410 km); 107 of them in Canada | 1,290 (483 km); 370 in Canada | 263 (74 km), all in Canada. 14 are named: Death March, Memory Lane, Eat 'em Up, Dead Man's, Silver Falls, Singing Brook, Old Marine Rail… |
| Campsites | 2,161 | 2,166 | 5, none in Quetico: Arrow Lake Park, Amberlite resort and 3 unnamed. OSM has no Quetico campsites. |
| Portage-end landings (POIs) | 2,236 | 2,767 | 531, of which 524 are `waterway=access_point` + `canoe=yes` + `backcountry=yes` |

Checks:
- No Minnesota polygon changes geometry in the merge.
- None of the 1,601 `place=island` polygons in the box (1,099 in Canada) is drowned: each is an inner ring of its lake.
- None of the 10,870 island holes in all the water polygons is covered by another polygon.
- No new Ontario polygon overlaps a Minnesota-extract one.

**Provenance note.** About 335 of the Quetico portage ways cite `https://www.ontarioparks.ca/pdf/maps/quetico/portage-maintenance-june-3-2022.pdf` as their OSM `source`, and 21 of those say "Location is approximate" with `fixme=resurvey`. They are OSM data under the ODbL like the rest, but they are traced from an Ontario Parks map, not from imagery.

**A dry-run bake** of the merged extract (`bake.mjs --all` into a scratch folder, against a Minnesota-only bake of the same code) took 3.6 min against 2.1:

| | Minnesota-only bake | Merged bake |
|---|---|---|
| Water polygons | 7,586 | 9,485 |
| Creeks | 13,605 | 15,041 |
| Water cells | 18.7 M | 24.4 M |
| Tiles with water | 1,600 | 2,068 |
| Portages | 1,021 (107 in Canada, 43 km) | 1,284 (370 in Canada, 115 km) |
| Campsites | 2,134 | 2,139 |
| Entry points and start | 55 | 55, unchanged |

On the US side:
- All 21,191 polygons and creeks of the Minnesota bake are still there.
- Only 16 of the 1,319 tiles centred in the US change in any field once lake ids are mapped (174 level cells).
- The only level changes are 18 creek profiles refitted where new water joins them, mostly by 0.1–0.8 m. The largest are a 2-cell creek by Lac La Croix (+2.5 m) and the Arrow River in Ontario (−2.45 m).

**Lake ids all change**, because the bake numbers polygons biggest first; Lake One goes from 78 to 103. The tables made from the release have to be remade after the rebake:
- `src/site-lakes.json` and `src/world-fixes.json` hold lake ids.
- `src/water-grade.bin` holds per-tile levels tied to the bake time.
- The colour table below joins by osm id, so it carries over.

**For round D2, to take Ontario:**
- Either copy `data-cache/quetico-osm/extract-v2-<key>.json` over `data-cache/osm/extract-v2-<key>.json`,
- or add `north-america/canada/ontario` to `CFG.extracts` and fix four things in `osm-extract.mjs`:
  - The cache key ignores the extract list.
  - `download()` fetches the 1 GB province file even when the cut exists.
  - Nodes held by both cuts are reported twice.
  - Read Ontario first, so Minnesota wins.

**Lake colour.** `lake-colour.mjs` gives every water polygon of the merged extract (in the bake's own order and rasterization) a summer Secchi depth (m), a late-summer CDOM (a440, m⁻¹: the tea-brown of bog water) and a chlorophyll-a (µg/L). The source is the UMN LakeBrowser (Landsat and Sentinel-2; Olmanson, UMN Remote Sensing and Geospatial Analysis Lab).

Each value says where it came from, in this order of preference:

| Source | Polygons | Share of polygon water | What it is |
|---|---|---|---|
| `lake` | 1,294 | 60 % | LakeBrowser basin values: 1,348 basins in the box, Secchi the 2018–2024 summer mean, CDOM and chlorophyll the median of the Jul 20–Sep 20 windows 2017–2026, cell-weighted over the basins a polygon overlaps |
| `dnr` | 27 | 0.2 % | The DNR in-situ Secchi the bake uses today, where LakeBrowser has no basin |
| `pixel` | 1,257 (774 of them new Ontario polygons) | 37 % | The median of LakeBrowser's late-summer pixels at 1–3 points at least 45 m from shore, for unmeasured polygons of 4 ha or more |
| `near` | 6,907 polygons and all creeks | 3 % | Measured polygons within 15 km, on logs, with the size trend they show (each doubling of area: Secchi ×1.04, CDOM ×0.95). Rivers ×0.8 Secchi and ×1.25 CDOM, as the bake does today. |

LakeBrowser's pixel rasters reach across the border; its lake polygons stop at it. 80 Minnesota lakes sampled both ways put the two on one scale: log correlation 0.98 for both Secchi and CDOM, with factors 0.978 and 0.959 applied to the pixels. There is no visible jump at the border.

Against what ships today:
- The release measures 301 polygons. This measures 1,802 of the same polygons, plus 776 new Ontario ones.
- On 291 lakes, LakeBrowser's Secchi is 0.89× the DNR's in-situ mean.
- Weighted by area the new Secchi matches the release (×1.0). For the median lake of 4 ha or more, it falls from 3.3 m to 2.2 m. Today's guesses come from the DNR's measured lakes, which are mostly big and clear, so **small lakes get browner and murkier**.
- Lake Superior's pixels read about 8 m.

Samples (Secchi m / CDOM):

| Lake | Secchi m / CDOM | Source |
|---|---|---|
| Lake One | 2.36 / 2.98 | lake |
| Snowbank | 4.67 / 1.26 | lake |
| Basswood | 2.53 / 2.51 | lake; its bays run 1.35–5.3 CDOM |
| Burntside | 3.96 / 1.50 | lake |
| Agnes | 4.11 / 1.47 | pixel |
| Kahshahpiwi | 4.24 / 1.53 | pixel |
| Kawnipi | 2.78 / 2.22 | pixel |

The quartiles of CDOM over all polygons are 2.75 / 3.41 / 4.04.

Products:
- `lake-colour-<key>.json`: the table, keyed by `osm` (the stable join), with `id` (what a bake of the merged extract numbers it), `rel` and `relSecchi` (the release today), `src`, `dow`, `dnrSecchi`.
- `<tx>_<ty>.secchi.bin` and `.cdom.bin` for the 2,068 tiles with water:
  - Layout: one byte per cell, the 256 × 256 core with no halo, as the other D1 sources.
  - Encoding: Secchi = byte/10 m, CDOM = byte/20 m⁻¹, 0 = not water.
  - Inside a LakeBrowser basin a cell takes that basin's own value, so bays differ. Seams between basins, and where a lake runs on past its Minnesota basins at the border, are blended over about 400 m inside the polygon.
  - The cells are the bake's water cells for the merged extract; a bake of another extract needs a rerun (everything fetched is cached).

**Licence.** LakeBrowser's services state no licence. Cite the lab, and ask Leif Olmanson (olman002@umn.edu) before the values ship in a public release.

Quick looks (`shots/d1-quetico/`, copied to each source's `quicklook/`): `osm-box.png`, `osm-quetico.png`, `osm-lakeone.png`, `colour-secchi-box.png`, `colour-cdom-box.png`, `colour-secchi-lakeone.png`, `colour-cdom-lakeone.png`.

## Baked: tile format v4 (round D2)

Round D2's bake reads the four products above onto the bake's grid (`scripts/v4-products.mjs`) and writes a v4 release. Rebake it with `BWCA_CACHE=<main checkout>/data-cache npm run rebake:v4` (`scripts/rebake-v4.mjs`).
- **The run:** about 2.5 minutes: the bake, the rapids, the lake facts and the checks. It builds `public-data-v4.next` beside the target and swaps it in by rename.
- **Safety:** the bake refuses to write a `public/data` folder (the live release came from there). A test area (`--area lakeone`) bakes to `public-data-v4-lakeone`.

### The format

`index.json` is version 4.
- `fields` names the tile's fields in order. `channels` holds `{ name, at, type, nodata }`, where plane *q* starts at byte *at* × side². `grid.format` is 4 and `grid.fields` repeats the list, so the tile worker sees them.
- **A fine tile** is the v3 tile followed by nine Uint8 planes. Each plane covers the same (256 + 2·6)² cells as the v3 fields, halo included.
- **The level field is 0 on land.** v3 copied the height there. Every reader asks for the level only on water cells. Dropping the copy saved 120 MB.
- **Far tiles** keep the v3 four.
- **A v3 tile** is just the four fields: `tileChannels` gives null and `chCell` gives 0, so the game falls back to today's ground.

| Plane | at | Holds |
|---|---|---|
| `ground` | 8 | d1-ground's kind 0–13. MGS `bare` outcrop becomes 10 where the kind is 0, 1 or 11: 233 km². On the bake's water: 8, 9 or 13. On its land, 13 marks a pond OSM lacks (88 km²). |
| `forest` | 9 | Forest type 0–23. A land cell LANDFIRE calls water takes its nearest land cell's type, canopy and cover, within 100 m (1.5 M cells). The bake's water is 1. |
| `canopy` | 10 | Height of the life form, dm (0 = none) |
| `cover` | 11 | Its cover, % in 5 % steps (0 = none) |
| `rock` | 12 | Bedrock unit 1–19 (0 outside Minnesota) |
| `cliff` | 13 | `(class << 6) \| strength` from the LiDAR. **0** no LiDAR here. **1** LiDAR, nothing. **Class 1** boulder field: under 30° with roughness ≥ 25 cm; strength = roughness / 4 cm. **Class 2** talus or ledge: 30–50° with roughness ≥ 30 cm; strength the same. **Class 3** face: ≥ 50° with relief ≥ 3 m; strength = the cell's relief in metres (25 means 25.4 m or more). Whole box: 2.24 M boulder cells, 1.74 M talus, 291 k face. |
| `stone` | 14 | Surface stone cover, 254·√fraction (255 = no survey) |
| `secchi` | 15 | Secchi depth, byte / 10 m, on the bake's water only |
| `cdom` | 16 | CDOM, byte / 20 m⁻¹, on the bake's water only |

**Readers.** `grid.js` has `V4_FIELDS`, `tileChannels`, `cliffClass` and `cliffStrength`.
- `TileGrid.ch` holds the planes and `TileGrid.chCell(name, i, j)` reads one cell.
- The World's slots carry `.ch` too; read them with `world.chCell(name, i, j)` and `world.chAt(name, x, z)`.

### What the bake does with the products

- **Heights:** the LiDAR's cell mean where `mask & 17` (LiDAR and the US side), blended into 3DEP over 80 m at the flight's edge and the border. That covers 84 M cells.
- **Lake levels:** each basin with 8 or more LiDAR cells takes the median of the LiDAR's hydro-flattened surface over its own cells (4,035 basins). Lakes of 20 ha or more rose a median 0.30 m; 5–95 % ran −0.10 to +0.90 m. The old 3DEP level stays as `level3dep` on lakes and basins. Rivers fit their profiles over the blended heights, then grade as before.
- **The lake table** adds, per polygon:
  - `secchi`, `cdom`, `chla` and `colourSrc`, joined by osm id to d1-quetico-lakes' table (24,526 polygons, every one under the id it expected). `secchiMeasured` is set where the source is `lake` or `dnr`.
  - `dow`: the DNR numbers.
  - `emergent` and `aqBed`: the lake's own cells with ground kind 8 or 9.
- **Ontario:** `CFG.extracts` lists Ontario first, then Minnesota. `osm-extract.mjs` has d1-quetico-lakes' four fixes:
  - the cache file is named for its extracts;
  - a cut already made skips the province download, and a cut of a bigger box is cut down again;
  - a tagged node is reported once;
  - the later file wins.

  Its output equals the drop-in extract exactly. Lake ids all change: Lake One is 103.
- **Official sites and portages:** the bake appends the 107 USFS sites OSM lacks and the 11 USFS-only portages (`official-adds.mjs`, shared with `world-fixes.mjs`). Each campsite carries `lake`, the nearest water within 400 m; parties.js reads it.
- **The rapids:** `rapids.mjs` runs over the new levels and `rapids-bake.mjs` bakes its drops into the tiles (2,239 runs, 11,992 cells). The index's `rapids` records that. The release's own list of drops goes into `src/rapids.json` as `v4`: 115 drops, Quetico's included. rapids.js `useV4()` swaps it in and drops data-v3's rows. `rapids.mjs` is not a fixed point (a second pass still moves 4,174 cells), so a release is baked once.

### Tables per release

The game reads both releases.

| Table | data-v3 | v4 |
|---|---|---|
| `world-fixes.json` | applied (its `for`) | not needed: the bake does it |
| `site-lakes.json` | parties.js | the index's `campsite.lake` |
| `water-grade.bin` | the worker grades | the bake grades; the worker skips it (`grid.format` ≥ 4) |
| `lake-facts.json` / `lake-facts-v4.json` | the first | the second (world.js picks by version) |
| `rapids.json` | `white`, `rows` | `v4.white`, no rows |
| `names-*.json` | keyed by place | the same keys: 1,941 sites numbered on both |

### Sizes, times, checks (2026-10-26)

**Times and sizes:**
- The bake takes 1.9 min at 8.3 GB peak. The rapids take 2 s, the lake facts 5 s and the check 30 s.
- The release is 364 MB: tiles 338 MB, index 7.9 MB, far 10 MB. data-v3 is 380 MB, with tiles at 359 MB.

**Channel costs (gzip in the tiles):** ground 6.2 MB, forest 10.4, canopy 17.8, cover 16 (24 before the 5 % steps), rock 0.7, cliff 7.3, stone 5.3, secchi 2.7, cdom 2.8.

**Checks (`scripts/v4-check.mjs`):**
- **Water:** no water cell has its bed at or above its surface.
- **Lakes:** none of data-v3's 1,558 named lakes is lost, and none shrank by over 10 %. 1,828 are named now.
- **Entry points:** all 55 lie on the same lake as data-v3's corrected landings, within 50 m. No portage launch is off the water.
- **The LiDAR's edge:** steps across it are no bigger than anywhere else (p95 1.7 m against 2.1).
- **Land below the river beside it:** 28 k shore cells sit below the river next to them (p50 0.5 m), from the grading and the drops. data-v3 as the game plays it (graded and patched at load) has 22.7 k. terrain-build's shore band draws both.

### The release step (needs the owner's OK)

1. Merge the code first. It reads both releases, so the live game keeps running on data-v3.
2. Pack the data with `tar -cf bwca-data-v4.tar -C public-data-v4 .` (about 364 MB) and attach it to a new release, `data-v4`. Then set the Pages variable `DATA_RELEASE` to `data-v4` and rerun the workflow.
3. **Saves don't record the release.** They hold lake ids (explored lakes, tasks' `lakeId`), campsite indices (`t.site`) and portage indices (`t.portage`), and v4 moves all three:
   - Lake One is 103, not 78.
   - Ontario's 5 sites come first.
   - The portage list has Quetico's 263 chains in OSM order.

   Before the switch, saves need either a migration or a reset of those parts. A migration would map lakes by osm id, sites by rounded position and portages by their ends.
4. **Mixed tiles for a few minutes.** Pages serves the data with a 10-minute max-age, so just after the switch a browser can hold data-v3 tiles under the v4 index. Serving the release under its own path would avoid that.
5. **Licences:**
   - Ask Leif Olmanson (UMN) before LakeBrowser's colour ships.
   - Cite MGS for the bedrock.
   - LANDFIRE, NHD, MnTOPO and NWI are public; SSURGO is public domain.
   - OSM, Ontario's included, is ODbL.

## 2 m detail (LiDAR near the player)

The owner compared 10 m, 5 m and 2 m ground in the game (the prototype, [detail.md](detail.md#history-the-prototype))
and chose **2 m near the player**. `scripts/detail-bake.mjs` cuts it for the whole US side. The game streams 2 m
within about 300 m of the player and 5 m out to about 900 m, to hide the step down to the 10 m tiles
([detail.md](detail.md)). The data is hosted on Cloudflare R2 with the rest of v4, under `detail/`
(`https://data.gagekrumbach.com/bwca/v4/detail/`).

### Running it

```bash
npm run bake:detail                          # the whole US side into public-data-v4/detail/
npm run bake:detail -- --area lakeone        # one tile (lakeone, palisade, fowl), or --tiles 31_20,62_14 or 30-34:18-22
npm run bake:detail -- --check               # no cutting: do neighbours' shared samples match?
npm run bake:detail -- --shots shots/detail  # no cutting: hillshade quick-looks, 10 | 5 | 2 m
```

- **Needs:**
  - GDAL (`brew install gdal`).
  - The v4 tiles in `--data` (default `public-data-v4`).
  - The D1-lidar cache in `data-cache/lidar/` (its `mask` channel), with `BWCA_CACHE=<main checkout>/data-cache` from
    a worktree.
- **The DEM.** It reads the state's 2 m DEM by window over HTTP. If the GDAL VRT of the six COGs
  (`data-cache/lidar/raw/dem2m.vrt`) is missing, the script builds it.
- **Resumable.** A tile that is done is skipped unless you pass `--force`. Each finished tile has a state file in
  `data-cache/detail/<output folder>/state/`. The index is written every 50 tiles and at the end.
- **Parallel.**
  - `--jobs 2` runs two warps at once, which is the default.
  - Two runs can share the list. Each claims a tile with a lock file.
  - Scratch rasters (6.7 MB a tile) are deleted as soon as they are read.
  - The run stops if the disk has under 4 GB free.
- **Time.** The whole US side here took 64 minutes: 1,371 tiles at about 5 s each, two at a time, on a shared
  4-core machine. Node's heap stays under 0.3 GB.
- **Output.** `--out` sets it, and the default is `<data>/detail/`. Data is git-ignored, so never commit it.
  `npm run data:sync` uploads `detail/` when the bake has one. The chunks are immutable and `detail/index.json` gets
  the short max-age.

### The lattice

The lattice is the prototype's, which has zero offset from the 10 m grid. Samples sit *r* metres apart, and their rows
and columns run through the 10 m cell centres.
- **A chunk.** Chunk (cx, cy) of tile (tx, ty) covers C cells a side: 64 at 2 m (640 m, 4 × 4 a tile) and 128 at
  5 m (1280 m, 2 × 2 a tile).
- **Its extent.** It runs from the centre of its first cell to the centre of the next chunk's first cell, plus one
  sample of apron on each side. That makes n = 323 samples a side at 2 m and 259 at 5 m.
- **Sample (0, 0)** sits at `(x0, z0)`, which is the centre of cell `tx·256 + cx·C` less *r*. Row 0 is the north row.
- **Neighbours stitch.** Neighbouring chunks share their edge rows and columns. Sample n − 2 of one is sample 1 of
  the next, and they overlap by the apron.

### How it is cut

**The warp.** For each tile, `gdalwarp` cuts the DEM bilinearly onto the tile's 2 m lattice plus one cell all round.
The target is EPSG:6318 at r / mPerDeg degrees a pixel, because the game's projection is a plain lat/lon grid. Then,
for each sample:
- **Water.** Where the v4 tile's shore distance, read bilinearly, is under 0, the sample is set to the tile's own
  water level (the mean of the lake cells round it). The detail's shores then meet the game's water sheet. The lake
  bed stays the 10 m tile's bathymetry.
- **No US LiDAR.** Where the sample is off the flight, or on the Ontario side (mask bit 16 clear), it takes the v4
  tile's height, read bilinearly. Ontario stays on today's terrain.

**The 5 m set** is the box mean of the 2 m lattice over each 5 m sample's footprint, with the same water rule. It
needs no second read of the DEM.

**Which chunks are written.** A chunk is written only if at least one of its cells is US LiDAR on land: mask bits 1
and 16 set, and not lake in the v4 tile. Chunks that are all water, Ontario, or off the flight are left out, and the
game keeps the 10 m ground there.

### The format

**Each chunk** is `detail/<r>m/<tx>_<ty>_<cx>_<cy>.bin`. It is gzip bytes, which the client inflates itself, as it
does for the tiles. Inside is a 56-byte header, then n × n Int16 values, row-major, little-endian:

| Byte | Field |
|---|---|
| 0 | `'BWDC'` |
| 4 | u32 version (1) |
| 8, 12 | i32 tx, ty |
| 16, 18 | u16 cx, cy |
| 20 | u16 n |
| 22 | u16 predictor (2) |
| 24 | f32 r (m) |
| 28 | f32 unit (m): 0.05 at 2 m, 0.1 at 5 m |
| 32 | f32 base (m) |
| 36, 38 | i16 min, max (dm) |
| 40, 48 | f64 x0, z0 (game metres) |

**Heights.** The height of a sample is `base + v · unit`.
- The file stores `v` less a plane prediction: `v[q−1] + v[q−n] − v[q−n−1]`.
- On row 0 the prediction is `v[q−1]`, on column 0 it is `v[q−n]`, and at q = 0 it is 0.
- `decodeChunk` in the script is the reference decoder, about 15 lines.

**`detail/index.json`** is 764 KB, 245 KB gzipped. It holds:
- `levels`: for each resolution, `r`, `size` (m), `perTile`, `n`, `unit`, `dir`, `count` and `bytes`;
- `chunks[r]`: a map from `"<tx>_<ty>_<cx>_<cy>"` to `[bytes, min dm, max dm]`, so the game never asks for a chunk
  that isn't there;
- `grid`, `source` and `check`.

**Why this encoding.** Sizes were measured on the 46 chunks of the Lake One, palisade and Fowl Lakes tiles, at gzip
−6, as the mean per 2 m chunk:

| Encoding | KB / chunk |
|---|---|
| cm, row deltas (the prototype's) | 76.0 |
| cm, plane predictor | 66.8 |
| 2 cm, plane | 54.7 |
| **5 cm, plane (chosen for 2 m)** | **40.0** |
| dm, row deltas | 35.0 |
| dm, plane | 30.7 |
| dm, no prediction | 52.0 |

- **The plane predictor** gzips 41 % smaller than plain decimetres and 12 % smaller than row deltas.
- **5 cm costs 30 % more than dm.** Its rounding error (±2.5 cm) is under the LiDAR's own noise. dm would draw 10 cm
  terraces on gentle 2 m slopes, which are visible in low light. On a typical visit the extra is about 0.1 MB.
- **At 5 m, dm** is used (26.9 KB a chunk against 33.9 at 5 cm). A 10 cm step over 5 m is only a 1° tilt.

### Numbers (the run of 2026-10-27)

Every US tile with LiDAR was baked: 1,371 tiles, of which 1,353 have at least one chunk.

**Sizes:**

| | 2 m | 5 m |
|---|---|---|
| Chunks written (of 21,936 and 5,484 possible) | 20,459 | 5,241 |
| Total | 876 MB | 151 MB |
| Per chunk (median, max) | 45.9 KB, 67 KB | 30.2 KB, 46 KB |

- **Index:** 764 KB, or 245 KB gzipped.
- **All of `detail/`:** 1.03 GB. With the 366 MB of v4, R2 holds about 1.4 GB, which is free up to 10 GB.

**Downloads.** These are upper bounds: a chunk over open water is skipped, so a canoe route costs less.
- **On arrival** (2 m within about 300 m, 5 m to about 900 m):
  - 2 m: a 640 m chunk is wider than the 600 m ring, so at most 2 × 2 chunks are needed at once, and the 3 × 3 round the player with the next row prefetched is 9 chunks, **about 0.4 MB**.
  - 5 m: the 1.8 km ring spans at most 3 × 3 chunks of 1280 m, **about 0.27 MB**.
  - The index: 0.25 MB.
  - With all three, **under 1 MB** on top of the visit's 9 MB.
- **Travelling:**
  - 2 m: a new row of 3 chunks every 640 m, so 4.7 chunks a km, **about 0.2 MB a km**.
  - 5 m: 3 chunks every 1280 m, **about 0.07 MB a km**.
  - Together that is about 0.27 MB a km, against about 0.35 MB a km for today's 10 m tiles (5 tiles every 2.56 km).
  - A whole visit (20 MB today) grows by perhaps 2–4 MB.

**Checks:**
- **10 m agreement.** The 2 m lattice (the raw LiDAR, before the water and fill rules) was averaged back onto each
  10 m cell, with weights [½ 1 1 1 ½] / 4 a side round the cell centre. This covers 70.7 M full-LiDAR US land cells.
  - Against the D1 cell mean (`data-cache/lidar` height): mean +0.1 mm, RMS 9 cm, median 0, |d| p95 19 cm, p99
    34 cm, p99.9 61 cm. The lattice sits on the 10 m grid with no offset, and what's left is LiDAR noise and the
    bilinear resampling.
  - Against the v4 tile's height: mean −4 cm, RMS 0.60 m, p95 0.59 m, p99 2.9 m. The difference is the v4 bake's own:
    it sits within about 30 m of the water (the shore shaping, the river grading, the blend at the LiDAR's edge).
    Inland, v4 is 0.35–0.45 m RMS off the LiDAR mean. Seams to the 10 m mesh should blend, as the prototype did
    over 60 m.
- **Stitch** (`--check`). Over 20,141 east–west neighbour pairs at 2 m (4,991 of them across a tile edge), 4,232 of
  19.5 M shared samples differ, each by one unit (5 cm). Across a tile edge it comes from the two warps' float
  rounding. Inside a tile it comes from the per-chunk base. At 5 m, 2,031 of 4.0 M differ by one unit (10 cm). The
  game should take one side's value for the shared edge.
- **Quick looks** (`--shots`): 1.2 km hillshades, 10 | 5 | 2 m, round Lake One's cliff, the Border Route palisade
  and the cliffs west of North Fowl Lake.

### Caveats

- **The Ontario edge.** On the Ontario side, and off the flight, the samples take the v4 tile's height. Where a chunk
  holds both, the LiDAR meets that height in a step of up to the v4 blend's difference, at the border. The border
  mostly runs through lakes.
- **The cliff modules** (`cliffs.js`) still come from the 10 m cliff channel. Where a 2 m chunk is in and carries
  the face, the game hides them (detail.md, "The cliff modules").
