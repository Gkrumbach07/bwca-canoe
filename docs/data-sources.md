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
