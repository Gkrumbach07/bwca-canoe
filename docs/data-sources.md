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
