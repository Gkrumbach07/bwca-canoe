# Theme D: people, places and wildlife

Checked 2026-10-26 against the bake box `bwca` in scripts/config.mjs (S 47.78, W −92.55, N 48.4, E −89.88). Each count below comes from a live query over that box (`returnCountOnly`, a GNIS coordinate filter, Overpass, the GBIF API or the NCEI search API) unless the row says otherwise. "Inside the BWCAW" means inside the USFS EDW wilderness polygon. The OSM side is the game's own cached extract: `data-cache/osm/extract-v2-…-89.86….json`, from the Geofabrik Minnesota extract. Scripts and samples are in `places-tools/` and `places-work/`.

**The finding that matters most:** the OSM data the game uses is already close to the Forest Service's own. The Forest Service data adds official numbers, names and lengths. It doesn't fill gaps in the geometry.

| Inside the BWCAW | OSM (game) | USFS (official) | Agreement |
|---|---|---|---|
| Campsites | 1,948 nodes | 1,947 (`CSITENO` + `LAKE_NAME`, 369 lake/bay names, updated Feb 2026) | Median distance from a USFS site to the nearest OSM site is 17 m. Within 25 m: 61 %. Within 50 m: 79 %. Within 100 m: 89 %. **107 USFS sites have no OSM site within 250 m**, for example Lake Four #11 (356 m), Basswood Back Bay #95/#96 (1.6–2.1 km), Wind Lake #1 and Ashigan #4. 67 OSM sites have no USFS site within 250 m (moved or closed). |
| Portages | 801 chains, 311 km | 664 lake-to-lake trail numbers, 251 km (names like `LAKE ONE-CONFUSION`, class 1–4, `gis_miles`) | **576 of 664 (87 %) are traced by an OSM portage within a 30 m median.** 617 (93 %) are within 60 m, and 14 have no OSM portage within 400 m. The worst: Big Rice–Hook (523 rods), Pine–Canoe (448), West Pike–Pine (334). 125 OSM chains have no USFS portage within 300 m (unofficial carries). |
| Entry points | 55 in scripts/entrypoints.json (put-ins from recreation.gov) | 87 for 2026: 49 paddle, 16 hiking, 11 overnight, 11 motor day-use | USFS points sit where the route **crosses the wilderness line**, not at the landing; the game's put-ins are 1 m to 5.9 km away. Against the USFS landings ("CARRY DOWN" and "BOAT ACCESS" in EDW rec sites), 29 of 55 put-ins are within 100 m. Worth a look: EP 19 Stuart R. (2.1 km), 26 Wood (1.1 km), 32 S. Kawishiwi (1.1 km), 33 Little Gabbro (1.0 km). |

| Dataset | Agency | Links (hub page, REST or download) | BWCA coverage (checked: count or how) | Format, size | License / terms | What it gives the game | Priority | Notes |
|---|---|---|---|---|---|---|---|---|
| **BWCA Wilderness Campsites Public** | USFS Superior NF | AGOL item 3f7105015691473d93d9cd0d65f4417e (FGDB 0954875523324485baee15bcba6a686a); `services1.arcgis.com/gGHDlz6USftL5Pau/arcgis/rest/services/R09_SNF_BWCA_Wilderness_Campsites/FeatureServer/0` | 1,947 total, all in the box; compared above | Points; 1.4 MB GeoJSON (FGDB 0.44 MB) | US federal (public domain), with the USFS no-warranty disclaimer | Real site numbers and bay names ("Basswood Lake – Back Bay #91") for camp.js `siteName`, which today falls back to "Campsite · lake". It also adds the 107 sites OSM lacks. | **now** | The description says it is "the only authoritative source for BWCA Wilderness site numbers". `District`: KAW 786, GUN 519, LAC 343, TOF 299. |
| **NFS Trails (EDW)**, incl. portages | USFS | `apps.fs.usda.gov/arcx/rest/services/EDW/EDW_TrailNFSPublish_01/MapServer/0` (AGOL 7511fa0cb62c471ea1e394510ac962db) | 2,226 segments in the box (1,931 TERRA). 840 hiker-only trail numbers, 664 of them lake-to-lake portages inside the BWCAW (class 2: 396, class 3: 254). | Lines; 11.8 MB GeoJSON for the box | Public domain | Official portage names, numbers and lengths (gis_miles × 320 = rods). Class 1–4 can set how rough a carry is. Hiking trails (Kekekabic, Powwow, Banadad, Border Route) are included. | **now** | `allowed_terra_use='1'` and `trail_type='TERRA'` select portages and foot trails. Join to OSM chains by the 30 m match above. |
| BWCAW Entry Points 2026 | USFS Superior NF | AGOL 5ce623146a7d48be9133b69e159e6fa2; `…/R09_SNF_BWCAW_Entry_Points_2026/FeatureServer/0` | 87 (compared above) | Points, 29 KB; fields entry_number, name, access_type | Public domain | The current EP list and names, plus the EPs the game lacks: 12A Lac La Croix, 23 Mudro, 28 Snowbank-only, the hiking EPs and the motor day-use permits A–M | later | Not landings: keep recreation.gov for put-ins. |
| Recreation Sites (INFRA) | USFS | `…/EDW/EDW_RecInfraRecreationSites_02/MapServer/0` | 348 in the box: 160 camping areas (outside the wilderness), 104 boating sites and carry-downs, 34 trailheads, 17 campgrounds, 3 interpretive (Moss Lake mine pit, CCC Camp Sawbill), Chik Wauk | Points, 0.77 MB | Public domain | Where the car parks and the carry-down starts, for the walk from the outfitter to the water | later | Has public-site text fields (directions, season, fees). |
| Wilderness Motor Lakes | USFS Superior NF | AGOL 489db1774c0e4521bba3ee6d3c991503 | 21 polygons | 1.6 MB | Public domain | Which lakes allow motors (Basswood, Moose, Saganaga, Seagull and so on): where tow boats and motor noise belong in parties.js | later | |
| BWCAW boundary | MN DNR (1978 law) / USFS EDW | MN hub 71f721280e7a42c486d434cb847a599b (`…/us_mn_state_dnr/bdry_boundary_waters_canoe_area/FeatureServer/2`); `…/EDW/EDW_Wilderness_02/MapServer/0` | DNR: 3 polygons. USFS: 1 multipolygon, 1,097,112 acres. Both match (~1.096 M acres). | 0.26–0.28 MB | DNR General Geographic Data License; USFS public domain | The wilderness line for the map, the "you are entering" moment, and in-or-out tests for parties and motors | later | |
| **Geographic Names (GNIS), Minnesota** | USGS via MnGeo | MN hub c9a9b12194c84cafac058ba8a9ca9e02; `…/us_mn_state_mngeo/loc_geographic_names_usgs_gnis/FeatureServer/0` (filter on `prim_lat_dec`/`prim_long_dec`; geometry is a statewide multipoint) | 2,069 names in the box: 1,474 lakes, 228 streams, 145 islands, 86 bays, 33 points, 14 falls, 11 summits, 8 narrows, 22 places. 1,439 of 1,491 lake names also appear in OSM. | 1.5 MB GeoJSON | No restrictions; USGS acknowledgement appreciated | Names the game has no source for: bays (Jock Mock, Pipestone), points, islands, narrows, falls (Curtain, Basswood, Wheelbarrow), summits (Eagle Mtn, Disappointment Mtn), and ghost places (Forest Center, Prairie Portage) | **now** | No mines, towers or locales: USGS dropped those classes. |
| **Geographic Names Ontario** | Ontario MNR / LIO | GeoHub 5889a694950944a5b55f1b4cd3e242ac; `ws.lioservices.lrc.gov.on.ca/arcgis2/rest/services/LIO_OPEN_DATA/LIO_Open09/MapServer/36` | 586 in the box: 335 lakes, 43 islands, 37 bays, **25 named portages** (Height of Land, Prairie, Monument, Watap, Big Knife, Yum Yum, …), 17 falls, 6 rapids | Points with lake polygons; 27 MB as returned (the points alone are small) | Open Government Licence – Ontario | Names for the border route's portages and falls. The `GEONAME_ORIGIN` story (5 have one, e.g. Heinselman Lake) can be flavour text. | **now** | Has a `SENSITIVITY_CLASS` field: keep "Non-Sensitive" only. |
| National Register of Historic Places | NPS | `mapservices.nps.gov/arcgis/rest/services/cultural_resources/nrhp_locations/MapServer/0` (points), `/1` (polygons) | 13 points + 6 polygons: Height of Land (portage), Kawishiwi Lodge (Fernberg Rd), Halfway Ranger Station, Chik Wauk Lodge, Listening Point, Sigurd Olson's writing shack, Burntside and Clearwater lodges, Pioneer and Soudan mines | Points/polygons, tiny | Public domain | Real, public historic places for keepers' talk (talk-rumours.js) and outfitter lore near the Lake One start | later | The public layer leaves out address-restricted (archaeological) listings. |
| OSM historic features (live Overpass) | OpenStreetMap | `overpass-api.de` query on historic / railway=abandoned / man_made | 195 elements: 131 abandoned rail ways (incl. the 1892–1902 Port Arthur, Duluth & Western grade, dated), 9 boundary monuments (1916–17), Paulson Mine shaft, Bull-of-the-Woods logging scow wreck, 28 quarries | In the same pbf the game already reads | ODbL (as now) | Old logging and mining grades as faint trails, survey monuments and wrecks, by adding these tags to osm-extract.mjs | later | 2 `archaeological_site` elements: skip them (see below). |
| Fire lookouts, mines (other sources) | various | Ontario "Tower" GeoHub 3a63577743f742019d9b42b713040895; USGS MRDS `mrdata.usgs.gov`; firelookout.org registers | Ontario: 7 towers, 1 an unused MNR fire tower. MRDS returned 502 all day. firelookout.org refuses scripted requests (406). No MN lookout dataset on either hub. | — | OGL-Ontario / public domain | Lookout sites (Kekekabic and others), only if a source turns up | no (for now) | USGS historical topo maps (1950s quads) show lookouts and resorts, but would need hand digitising. |
| Moose Range in Minnesota | MN DNR | MN hub 7a2fada9352f485292a1f79e7aeda458; `…/env_mn_moose_range/FeatureServer/0` | 1 polygon; covers the whole US side | Tiny | DNR GIS license | Confirms the game's moose belong everywhere on the US side. There is no public grid of moose density or survey plots. | no | Moose harvest zones on the hub are from 2006–09, from before the hunt closed. |
| Deer / Bear Permit Areas + harvest | MN DNR | hub 31ae0cfd54f94892aa07583108f8e4d2, d886e5f068ce4a0a8a6e3f2bd90fefea (deer); 462a01a51e484076922517cb90e29cf3, 771789f5a619484aa6bf56315a738cb2 (bear) | 8 deer areas (117, 118, 119, 126, 130, 131, 176, 177), harvest by area 1993–2014; 4 bear permit areas + harvest | Polygons, small | DNR GIS license | Relative abundance: deer are scarce inside (bucks-only areas 118/119/130), bear are common. A per-zone weight at most. | later | |
| **GBIF occurrences** (mostly eBird) | GBIF / Cornell eBird / iNaturalist | `api.gbif.org/v1/occurrence/search?taxonKey=…&geometry=POLYGON(box)` | Common loon 6,223, bald eagle 4,744, osprey 895, moose 246, beaver 187, black bear 128, white-tailed deer 113, gray wolf 90, river otter 65, Canada lynx 51 (Canada: ~5 %) | CSV/JSON; a few MB per species | Per record: CC0 / CC BY 4.0 (eBird) / CC BY-NC (drop) | Where people actually see loons and eagles, aggregated per lake. That could weight loons.js and fauna.js by real lakes instead of only by habitat. | later | Sightings are biased toward busy routes. Aggregate per lake or 5 km cell; never use exact points for sensitive species. |
| GAP species habitat maps | USGS | ScienceBase: moose 58fa6f9de4b0b7ea545259a4, wolf 58fa69c2e4b0b7ea545258bb (range 59f5ebf4e4b063d5d307e2d5), black bear 58fa5f8be4b0b7ea545256a2, deer 58fa817ae4b0b7ea54525c2f, loon 58fa492ae4b0b7ea54524eca, bald eagle 58fa4517e4b0b7ea54524ca5 | CONUS 30 m (US side only); not cut to the box | ~80 MB zip per species | Public domain | Habitat masks per species, from 2001 land cover | no | The game's habitat rules already do this. |
| MN Breeding Bird Atlas 2009–13 | Audubon MN / NRRI | mnbirdatlas.org (species pages, 5 km block maps); raw data via the Midwest Avian Data Center | Statewide 5 km blocks: loons in 1,528 of 4,941 blocks | Images; raw data under agreement | Data Sharing Agreement (not open) | Breeding-evidence maps for loons and eagles | no | **mnbba.org is now a spam domain**: use mnbirdatlas.org. |
| Common Loon breeding habitat (UMGL JV) | USFWS | ScienceBase 698216d4b66b018d00102ba5 | 1 km raster, JV region and a buffer | 4 MB zip | Public domain | — | no | Too coarse for lakes the game draws. |
| **NOAA 1991–2020 monthly normals** | NOAA NCEI | `ncei.noaa.gov/access/services/data/v1?dataset=normals-monthly-1991-2020&stations=USC00212555` | 7 stations in the box. Ely 25E (USC00212555, 47.97 −91.45, beside Lake One), Gunflint Lake 10NW (USC00213417), Ely (USC00212543), Tower 2S, Cook 8NE, Hovland | JSON, 12 rows per station | Public domain | Monthly highs, lows, rain days and snow (table below) to check weather.js. Gunflint is within 1 °C of Ely 25E. | **now** (tiny) | Gotcha: `TAVG` comes back in °F even with `units=metric`. |
| NOAA ISD hourly | NOAA NCEI | `global-hourly`, Ely Municipal Airport 72745994964, Crane Lake 72747394977, Grand Marais 72745404911 | Checked by the search API (yearly files to 2025) | CSV, ~10 MB per station-year | Public domain | Wind speed and direction by month, cloud cover, thunder hours: a check on WIND_DAY | later | |
| PRISM 1991–2020 normals (800 m) | Oregon State PRISM | prism.oregonstate.edu/normals, data.prism.oregonstate.edu | CONUS only (US side) | BIL/COG rasters, a few MB per variable per month | Free to reproduce and distribute, with citation | Spatial gradient (Lake Superior effect) | later | MN DNR "Climate Normal 1991–2020" (hub 475040854e4940f1a294069156d4d814) is seasonal contours only: no. |
| Provincial park regulated | Ontario Parks / LIO | GeoHub c5191fcd8a944eaf91920b4ed914825a; `…/LIO_Open03/MapServer/4` | 8 in the box: Quetico (Wilderness class), La Verendrye (Waterway), 6 nature reserves | Polygons; Quetico 0.44 MB | OGL-Ontario | Quetico's line, for the map's edge and permits talk | later | |
| OSM Ontario extract | Geofabrik | `download.geofabrik.de/north-america/canada/ontario-latest.osm.pbf` | Quetico in the box (live): **347 portage ways, against 97 in the game's Minnesota extract**; 0 campsites (OSM has none mapped here) | Large pbf; osmium-cut to the box | ODbL | The Quetico portages the game is missing | later | Add `north-america/canada/ontario` to `CFG.extracts`. |
| Ontario Trail Network segment | Ontario / LIO | GeoHub 41b23e3310d44bef82b954044a32d6d5; `…/LIO_Open04/MapServer/19` | 10 in the box: Hunter Island Loop, Falls Chain Loop, Path of the Paddle | Lines | OGL-Ontario | Named Quetico canoe loops as routes or rumours | later | |
| NRVIS Recreation point / Trail segment | Ontario MNR | GeoHub 2d7742df9a5b438c8d1543d84818345d, 60485d644ddf4e24bc6f62924001dc09 | Download by request form only | — | MNR restricted (EIP) licence | Quetico campsites and portages | no | Not open data. |
| Moose plots, WMUs, Cervid zones | Ontario MNR | GeoHub d6305a95cd0f44358a398c65d7b61ec0, ccc36453b8d04588a526406cb24d1229, 0044b3d8a4b74632a2cc797c8907c2fc | 257 plots / 4 WMUs / 2 zones | Polygons | OGL-Ontario | Survey grid only, with no counts | no | |

**Climate normals 1991–2020, Ely 25E (USC00212555)**, against the fit in weather.js `airTemp` (`2.5 − 16.5·cos(2π(doy−25)/365.25)`, evaluated mid-month):

| | Jan | Feb | Mar | Apr | May | Jun | Jul | Aug | Sep | Oct | Nov | Dec |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| High / low °C | −9.4 / −21.5 | −6.3 / −19.9 | 1.1 / −12.9 | 8.2 / −4.4 | 16.7 / 3.4 | 22.2 / 9.8 | 25.1 / 12.6 | 23.9 / 11.4 | 18.7 / 6.8 | 9.9 / 0.1 | 0.7 / −7.4 | −6.6 / −16.4 |
| Mean °C (game) | −15.4 (−13.8) | −13.1 (−12.9) | −5.9 (−8.5) | 1.9 (−0.7) | 10.0 (7.7) | 16.0 (14.9) | 18.9 (18.7) | 17.6 (18.1) | 12.8 (13.2) | 5.0 (5.6) | −3.4 (−3.1) | −11.5 (−10.0) |
| Precip mm / days ≥ 2.5 mm | 25 / 3.3 | 20 / 3.1 | 21 / 2.9 | 50 / 4.8 | 77 / 7.5 | 95 / 8.9 | 104 / 7.0 | 88 / 6.9 | 95 / 6.7 | 70 / 6.8 | 37 / 4.0 | 29 / 4.1 |
| Snowfall cm | 40 | 36 | 20 | 25 | 1 | 0 | 0 | 0 | 0 | 5 | 25 | 44 |

The game's sinusoid is **2.3–2.6 °C too cold from March to May** and 1.5–1.7 °C too warm in December and January. Real spring warms faster than a cosine. A 12-value monthly table would fix it. The mean daily range is 12–14 °C from March to August, against the game's 11 °C clear-day swing (±5.5).

## Top 3 for this theme

1. **USFS BWCAW campsites (1,947, official numbers)**. Add a runtime table, `src/site-numbers.json`: snap each site to the nearest OSM campsite within 100 m (1,741 match) and store its number and lake or bay name. Add the 107 sites OSM lacks as new campsites through `world-fixes.json` (or a re-bake). About 60 KB raw, ~15 KB gzipped.
2. **USFS EDW portages (664 official lake-to-lake portages, 251 km)**. In the bake (osm-extract/world-links), give each OSM portage chain the official name, number, length in rods and class from its 30 m match (576 match). Report the 14 USFS-only and 125 OSM-only portages for a world-fixes review. A ~40 KB names table in the bake output; the source pull is 12 MB.
3. **Place names: GNIS Minnesota (2,069) + Geographic Names Ontario (586)**. Add a runtime label table of bays, points, islands, narrows, falls, rapids, summits and named border portages (with Ontario's name origins), placed in the bake against the lake each falls in. Both are open. About 100 KB raw, ~30 KB gzipped.

The NOAA monthly normals table above is worth a five-minute weather.js change, but it is too small to rank here.

## Sensitive data: do not use or publish

- **MN DNR "Bald Eagle Nest Locations"** (hub 8534e2b5331a418c88a9ad9ae4472de2): 247 nest areas in the box. Eagles are protected under the Bald and Golden Eagle Protection Act, which covers nest disturbance. **No.** Show eagles from habitat or aggregated GBIF data only.
- **Archaeological sites:**
  - OSM `historic=archaeological_site`: 2 in the box.
  - Forest Service heritage and SHPO site files: restricted under ARPA.
  
  **No** to all of them, and no hunting for them in other layers.
- **Pictograph sites:**
  - GNIS "Picture Rock" (Pillar, 48.132 −91.702) and "Pictured Rocks" (Cliff, 48.054 −91.904).
  - Ontario's "Warrior Hill" on Lac La Croix.
  
  These are public names. Still, **no** modelling, marking or making a game objective of the paintings or of sacred places; keep at most the plain place name.
- **Rare species and plant locations:**
  - MN DNR Natural Heritage (NHIS) rare features: licensed, not public.
  - MBS rare natural communities.
  - Any colonial waterbird or heron rookery list.
  
  **No.**
- **Exact sighting points for wolves, lynx and nesting birds in GBIF/iNaturalist.** **No:** use per-lake or 5 km aggregates only. Dens and nests never.
- **Licence or ownership problems:**
  - Ontario NRVIS Recreation point and Trail segment: restricted licence.
  - The community "Quetico Campsites" / "BWCAW Campsites" collections on AGOL (owner alisonnyenhuis): unknown licence.
  - MNBBA raw data: data-sharing agreement.
  
  **No.**

## Built: d1 names (2026-10-26)

The first three of the top 3 above, as runtime tables for the data-v3 release (no rebake). Run in this order:

```
node scripts/names-fetch.mjs        # data-cache/names/{campsites,trails,wilderness,gnis,ontario}.json + fetched.json
node scripts/world-fixes.mjs        # src/world-fixes.json: + the missing sites, + the clear USFS-only portages
node scripts/names.mjs [--report f] # src/names-sites.json, src/names-portages.json, src/names-places.json
node scripts/site-lakes.mjs         # src/site-lakes.json counts the added sites too
```

(`BWCA_CACHE` points at the main checkout's `data-cache`; `--data` at a release.) The fetch is 3.0 MB in all: campsites 549 KB, trails 1.6 MB (the box's 1,450 hiker-only TERRA segments, fields cut to five), wilderness 242 KB, GNIS 456 KB (attributes only), Ontario 143 KB (attributes only, no lake polygons). The shared code is `scripts/names-lib.mjs`; a rebake can call it from bake.mjs.

**Tables** (keyed by place, a site's rounded x:z and a portage's rounded ends, so a rebake of the same OSM data still finds them):

| Table | Size (gzip) | What |
|---|---|---|
| `src/names-sites.json` | 45 KB (19 KB) | 1,941 of the 1,947 USFS sites on a game site: 1,843 within 100 m, 98 more within 250 m on the same water (median 14.7 m) |
| `src/names-portages.json` | 45 KB (18 KB) | 686 drawn portages with their USFS trail number, name, rods (620 take the official rods, where the drawn trail is that trail end to end: rods ratio 0.67–1.5, 60 % covered) and class, or a named portage's name |
| `src/names-places.json` | 15 KB (6 KB) | 372 names: 184 islands, 107 bays, 44 points, 17 summits, 13 narrows, 6 named portages no drawn one carries, 1 ghost town (Forest Center) |
| `src/world-fixes.json` | +19 KB | 107 added campsites, 11 added portages |

**Campsites.** 108 USFS sites have no game site within 250 m; 107 are added (25 nudged up off the water's edge to dry ground 5–25 m from the shore, at most 65 m), and Island River #1 is off the grid. Five more have an OSM site near but on other water or already taken: Hudson Lake #1, Basswood River #15, Sea Gull Lake #5, Caribou Lake (west) #6, Lower Pauness Lake #14. 113 OSM sites inside the wilderness have no USFS site (moved or closed): they keep "Campsite · <lake>".

**Portages.** Of the 664 USFS lake-to-lake portages inside the wilderness, 576 are traced by a drawn portage within a 30 m median. 18 had no drawn portage within 400 m: 11 were added (Muskrat–Fraser, Trinity–Fraser, Uranus–Conchu, Fourtown–Fourtown Pond, Gulf–Romance, Mulligan Pond–Mulligan Lake, Kelly–Peterson, a Kawishiwi River carry, Partridge–Duncan, Cherokee–Ranger, Hug–Duck), and 7 are campsite spurs or loops, not portages (Crab Lake Cut-off, Benezie–Becoosin Loop, the Powwow spurs to Quadga and Pose, the Border Route spurs to the Sock, Clearwater and Partridge sites). 45 more have no drawn portage within a 60 m median but one within 400 m (drawn elsewhere or in part). 80 drawn portages inside the wilderness have no USFS trail within 300 m: unofficial carries, river walks and winter routes (Crane–Little Vermilion 427 rods, Sunday–Crooked 373, Niswi–Neewin 324, Manomin–Basswood 461, the Border Route Trail, Vera Portage Winter…); the list comes out of `names.mjs --report`. Named portages: 17 of Ontario's and GNIS's (Height of Land, Prairie, the Cherry and Vaseux portages, Watap, Wheelbarrow, Bottle, Beatty, the Knife portages…) name the drawn portage they lie on; 18 drawn portages keep their own proper name (Stairway, Four Mile).

**Place names.** Lakes, streams and towns stay with the game's own names. Falls and rapids are d1 rapids' (`src/rapids.json`), handed to the map and the place note through `hud.mapPlaces`. Left out: Picture Rock, Pictured Rocks, Painted Rocks and Warrior Hill (pictographs), and a burial name. 16 bay or narrows names lie more than 300 m from any water the game draws; 4 are a game lake's own name already.
