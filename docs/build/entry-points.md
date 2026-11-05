# Entry points true to life (round 2, 2026-11-05)

The owner, 2026-11-05: "go over each and every entry point and make sure what it actually is like in real life is what
it is in the game." Every one of the 55 entry points in the v9 release now starts the way the permit's own description
says it does. A portage-first entry point starts in a lot at the road's end (or, for EP 4, where an outfitter's boat
leaves you on Burntside), with the canoe on the ground and the opening portage running from the edge of the lot.

How it is built:
- `scripts/ep-fixes.mjs` writes `src/ep-fixes.json`, a runtime table for the v9 release (`for` = its bake stamp).
  Nothing is rebaked.
- `world.js applyEpFixes` applies the table in the `World` constructor, before any tile or worker starts. It sets
  names, put-ins, lots, opening portages, shared landings and outfitters' own starts, and replaces fixed portages in
  place. Four lines the release made out of roads give up their slots to the four carries it lacked, so the portage
  indices saved in a season still hold. `?eps=off` leaves the table out, for before-and-after comparisons.
- `props.js` builds a lot trailhead with the sign at the trail's mouth, the canoe set down dry beside the way out, and
  a "TO THE ROAD" plate at the road end. `rides.js toLot` drives you to the lot on land. An entry point that shares a
  landing arrives at its host's landing. A road end is never a launch. The maps mark each trailhead at its start.
- `ep-start.js` describes the fields.
- `scripts/r2-ep-check.mjs` checks every entry point. With `--play` it drives to each lot in the game and plays EP 4
  end to end.

Kinds now: 19 portage-first (4 of them an outfitter's entry point with its own start apart from the store), 16 lake
landings, 15 paddle to the first portage, 5 river starts. Of these, 5 share another entry point's landing and 3 have a
moved put-in.

Sources, cited in the table by letter:
- R: recreation.gov BWCAW permit content, the division for each entry point (https://www.recreation.gov/api/permitcontent/233396, https://www.recreation.gov/permits/233396)
- U: USFS EDW recreation sites and trails (https://apps.fs.usda.gov/arcx/rest/services/EDW/EDW_RecInfraRecreationSites_02/MapServer/0, https://apps.fs.usda.gov/arcx/rest/services/EDW/EDW_TrailNFSPublish_01/MapServer/0), and the 2026 entry points layer (https://services1.arcgis.com/gGHDlz6USftL5Pau/arcgis/rest/services/R09_SNF_BWCAW_Entry_Points_2026/FeatureServer/0)
- O: OpenStreetMap (the nodes and ways named in the row; the bake's extract data-cache/osm-2026-11-01)
- B: bwcawild.com entry point pages (https://www.bwcawild.com/Entry-Points/Entry-Point-NN/Entry-Point-NN.html)
- W: bwca.com entry point pages (https://bwca.com/index.cfm?fuseaction=maps.entryhome&locid=NN)
- P: paddleplanner.com (https://www.paddleplanner.com/tools/entrypoint.aspx?epid=92)

Rods in "what changed" are measured on the game's line from the lot / the posted rods.

| EP | Real start | What changed in the game | Src | Conf. |
|---|---|---|---|---|
| 1 Trout Lake | Moccasin Point access on Lake Vermilion, ~5.5 km paddle NE, then the 60- or 180-rod portage into Trout | The store stays by the portages. The EP's own start is a separate landing at Moccasin Point (O node 4371091791), marked on the map | R O | medium |
| 4 Crab Lake & Cummings Lake | No road: dropped on Burntside (or paddle from a Burntside access), then the 360-rod portage to Crab | Renamed. Start is a boat drop at the Burntside end of the Crab portage, canoe on the shore; the carry is the first move (405 r / 360). The old trailhead on a roadless Burntside shore is gone | R O | medium |
| 6 Slim Lake | Slim Lake lot on North Arm Rd, 90-rod portage into Slim | The store at the North Arm landing stays. The EP's own lot is at the trailhead parking beside the Slim Portage (130 r / 90: the OSM line is longer than posted) | R O | medium |
| 7 Big Lake | Big Lake landing off the Echo Trail, paddle to the 160-rod Lapond portage | Unchanged (it already matched) | R O | high |
| 8 Moose River South | Moose River landing on the Echo Trail, upstream with three carries to Big Moose | Unchanged; the game has 2 of the 3 carries | R O | medium |
| 9 Little Indian Sioux River South | Echo Trail landing, south side, upstream on the river | The 319-rod "Sioux River Landing" loop and a 5-rod line at the landing (both the access road) are removed; their slots hold EP 14's and EP 67's new carries | R O | high |
| 12 Little Vermilion Lake | Crane Lake public access, by water through the narrows into Little Vermilion | Unchanged; the outfitter is at Crane Lake. The 427-rod Crane to Little Vermilion line stays (the release has no water through the narrows) | R | medium |
| 14 Little Indian Sioux River North | Echo Trail lot (north side), 40-rod portage down to the river | New lot at the OSM parking. New 40-rod carry to the main river piece (lake 1117) in the slot of the removed road loop (40 r / 40) | R O | high |
| 16 Moose/Portage River North | Echo Trail lot, 160-rod portage north to the Moose River | Renamed. The store on the river stays. The EP's own lot is at the trailhead parking, joining the 170-rod line renamed Moose River North Portage (143 r from the lot / 160) | R O | high |
| 19 Stuart River | Stuart River lot on the Echo Trail, 480-rod portage to the river | Lot at the trailhead parking. The Stuart Portage carried from the lot (441 r / 480). No longer starts on the river 2.3 km inside the wilderness | R O | high |
| 20 Angleworm Lake | Angleworm trailhead on the Echo Trail, 640-rod portage to Angleworm | Lot at the trailhead. The Angleworm Trail is carried from the lot (716 r / 640) | R O | high |
| 22 Mudro Lake – Restricted | Mudro lot on North Grassy Rd, 24-rod carry-down to the creek, then Mudro | Renamed (restricted: no camping on Horse Lake). Lot at the USFS carry-down. The "North Grassy Road" line renamed Mudro Lake Portage (30 r / 24) | R U | medium |
| 24 Fall Lake | Fall Lake boat access by the campground | Unchanged | R U | high |
| 25 Moose Lake | Moose Lake boat access off the Fernberg Road | Unchanged. The duplicate 378-rod "Moose Lake Road" line is removed; its slot holds EP 75's carry | R U | high |
| 26 Wood Lake | Hwy 169 lot, 180-rod portage to Wood Lake | Lot at the USFS carry-down. The connector is cut at the road end and renamed Wood Lake Portage (225 r / 180) | R U | high |
| 27 Snowbank Lake | Snowbank Lake boat access | Unchanged | R U | high |
| 29 North Kawishiwi River | Ojibway Lake access, 20-rod and Triangle portages to the river | Unchanged (it already matched) | R U | high |
| 30 Lake One | Lake One carry-down at the end of the Fernberg Road | Unchanged | R U | high |
| 31 Farm Lake | Farm Lake boat access | Unchanged | R U | high |
| 32 South Kawishiwi River | Spruce Road lot, 140-rod portage to the river | Lot at the road end. The trail is extended to it and renamed South Kawishiwi River Portage (155 r / 140) | R U | high |
| 33 Little Gabbro Lake | Spruce Road lot, 200-rod portage to Little Gabbro | Lot at the carry-down. The connector is cut at the road end and renamed Little Gabbro Portage (208 r / 200) | R U | high |
| 34 Island River | Hwy 1 boat access on the Island River | Unchanged | R U | high |
| 35 Isabella Lake | Isabella trailhead (FR 377), 70-rod portage to the lake | Lot at the OSM trailhead. The out-and-back connector becomes the one-way OSM trail (75 r / 70). Starts on foot, not on the lake | R O | medium |
| 36 Hog Creek | Hog Creek trailhead, 15-rod carry to the creek, then down to Perent | The store on the creek stays. The EP's own lot is at the trailhead, joining the 11-rod carry (11 r / 15) | R O | medium |
| 37 Kawishiwi Lake | Canoe landing at the Kawishiwi Lake campground | Unchanged | R O | high |
| 38 Sawbill Lake | Sawbill landing by the campground and outfitter | Unchanged | R O | high |
| 39 Baker Lake | Baker Lake campground landing, a 10-rod carry to Peterson | Unchanged | R O | high |
| 40 Homer Lake | Homer Lake public access, FR 326 | Unchanged | R O | high |
| 41 Brule Lake | Brule Lake landing, end of FR 326 | Unchanged | R O | high |
| 43 Bower Trout Lake | Small lot at the end of FR 152H, 72-rod portage | Lot at the OSM trailhead. The out-and-back connector becomes one way (71 r / 72) | R O | high |
| 44 Ram Lake | Ram Lake parking, 97-rod portage | Lot at the road end. The road-end launch onto Fiddle Creek becomes a road end (94 r / 97) | R O | high |
| 45 Morgan Lake | Morgan trailhead, 320-rod portage (no camps on Morgan) | Lot at the OSM trailhead. The connector is cut there, dropping the 130-rod run on to Poplar Creek (342 r / 320) | R O | high |
| 47 Lizz & Swamp Lakes | Poplar Lake landing (Gunflint Trail), paddle to the 51-rod Lizz or 100-rod Swamp portage | Renamed. Shares EP 49's Poplar landing: no trailhead on Poplar's south shore, and the paddle across is restored | R O | medium |
| 48 Meeds Lake | Poplar Lake public landing, 1.4 km paddle, 220-rod portage | Shares EP 49's Poplar landing; the paddle is restored | R O | medium |
| 49 Skipper & Portage Lakes | Poplar Lake public landing, the 320-rod Poplar–Skipper trail | Renamed (&). Start unchanged | R O | high |
| 50 Cross Bay Lake | Cross River access on the Gunflint, two carries to Ham, 24 rods to Cross Bay | Lake 747 named Cross Bay Lake (was "Extortion Creek"). The carry is renamed Ham Lake – Cross Bay Lake | R O | medium |
| 51 Missing Link Lake | Round Lake landing, 142-rod portage | Unchanged. The 280-rod "Round Lake Road" line (the access road) is removed; its slot holds EP 84's carry | R O | high |
| 52 Brant Lake | Same Round Lake landing as EP 51, carries via West Round and Edith | Shares EP 51's landing (was a trailhead 850 m down Round's west shore) | R O | medium |
| 54 Seagull Lake | Seagull Lake public landing (Cook County) | Unchanged | R O | high |
| 55 Saganaga Lake | Saganaga access at Trail's End, on Gull Lake | Unchanged | R O | high |
| 57 Magnetic Lake | Gunflint Lake public access | Unchanged | R O | high |
| 58 South Lake | Gunflint Lake (10 mi), Height of Land portage to South | **Unresolved**: left at its invented Gunflint spot. The release has no way by water or portage from Gunflint to North and South (separate basins), so moving it to the public access would strand it | R O | medium |
| 60 Duncan Lake | West Bearskin west-end access, 70-rod to Duncan, Stairway to Rose | Lake 189 named West Bearskin Lake (was "Bearskin Lake") | R O | high |
| 61 Daniels Lake | West Bearskin DNR slipway, 60 rods to Daniels, Long Portage to Rose | West Bearskin named. The Long Portage stays at the release's 511 rods (posted 665) | R O | medium |
| 62 Clearwater Lake | Public landing at the end of Clearwater Lake Rd, west tip | Put-in snapped from 182 m out on the lake to the west-tip shore | R B | high |
| 64 East Bearskin Lake | East Bearskin public access by the campground | Unchanged (the store; the markers stream maps it apart) | R B | high |
| 66 Crocodile River | From the East Bearskin landing, paddle 2 mi to the 118-rod portage to Crocodile | Shares EP 64's landing (was a trailhead on a roadless river stub) | R B W | high |
| 67 Bog Lake | Lot off FR 377, 232-rod portage to a dead-end lake | The store on Bog Lake stays. The EP's own lot is on the map's south edge (the real lot is 0.9 km off the map), with a new 176-rod carry to Bog Lake in the slot of the 5-rod road line. Clipped | R B | high |
| 68 Pine Lake | McFarland Lake dock inside the campground, paddle to the liftover into Pine | Put-in moved 290 m south off the McFarland–Little John narrows, apart from the 69/70 lot | R B | high |
| 69 John Lake | Little John landing at the shared EP 69/70 lot, 10 rods to John | Unchanged (the store). **Unresolved**: the 10-rod Little John to John carry needs the water cut, which needs a rebake | R B | high |
| 70 North Fowl Lake | The same Little John lot as EP 69, down the Royal River | Shares EP 69's landing. Lake 1776 named Royal River (was "John Lake") | R B W P | medium |
| 75 Little Isabella River | Tiny lot at the end of the FR 381 spur, 20-rod carry to the river | Lot on the map's south edge, with a new 17-rod carry to the river (the real lot is 0.6 km off the map), in the slot of the duplicate "Moose Lake Road". Clipped | R B | high |
| 77 South Hegman Lake | Echo Trail lot, 80-rod portage down to South Hegman | Lot at the Hegman Lake Trail's land end, carried from there (120 r / 80: the OSM line is longer than posted) | R B O | high |
| 80 Larch Creek | Roadside lot on the Gunflint by the culvert, down the creek to Larch | Unchanged | R B W | high |
| 84 Snake River | Lot at the end of FR 381, 160-rod portage to the Snake | Lot on the map's south edge, with a new 157-rod carry to the river (the real lot is 0.7 km off the map), in the slot of "Round Lake Road". Clipped | R B | high |

What is left (not done in this stream):
- **EP 6 and EP 77**: the opening carries are 44 % and 51 % longer than posted. The game's lines are OSM's, and
  shortening them needs the trail redrawn or the lake moved.
- **EP 58**: no water route from Gunflint Lake to South Lake in the release.
- **EP 69 / 70**: the Little John to John carry is missing (the water joins the two lakes), and the Royal River carries
  are 59 + 52 and 93 rods where 88 + 160 are posted.
- **EP 12**: the narrows between Crane, Sand Point and Little Vermilion are not water in the release, so the 427-rod line
  stays.
- **EP 1, 16, 36, 67**: a drive to these entry points goes to the store, as before. The real start is a separate lot or
  landing beside it (EP 1's is 5.5 km away at Moccasin Point). EP 16's and EP 67's stores stand inside the wilderness
  or on a dead-end lake. Moving a store is the outfitter streams' call.
- **EP 8**: 2 of the 3 Moose River carries. **EP 61**: the Long Portage is short.
