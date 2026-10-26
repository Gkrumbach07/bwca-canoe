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
