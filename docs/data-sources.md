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
