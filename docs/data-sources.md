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
