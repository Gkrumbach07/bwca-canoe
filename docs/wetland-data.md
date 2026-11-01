# The wetland data: what it holds, what the game uses, what it could do

2026-10-31. **Built** on branch `claude/wetlands` (see "Built" at the end). A survey of the Minnesota NWI (National Wetlands Inventory, 2009–14 update, MN DNR) over the game's map
area, plus the NHD (National Hydrography Dataset) streams, against what the bake kept before this round.

Numbers come from the bake's own cache (`data-cache/ground/raw/nwi`, 118,600 polygons, 451,000 acres, every polygon
the bake fetched) and from server-side counts on the live services (120,836 polygons in the map's bounding box,
including the big lakes the bake leaves out). The area includes Superior National Forest outside the wilderness.

## 1. Every code, and whether the game can show it today

An NWI code like `PSS1/EM1Cb` has five parts. The bake fetches the whole code, then keeps one byte per 10 m cell: one
of 14 ground kinds (`scripts/sources/ground.mjs nwiKind`, `src/land.js KIND`). Every code in the area lands on a kind
(none falls through), but most of each code is thrown away.

| Part of the code | Values in the area | Kept today? |
|---|---|---|
| **System** | P palustrine (marsh, bog, swamp, pond): 104k polygons · L1 deep lake water · L2 lake shallows · R2 slow river · R3 fast river (1 polygon) | Partly. L and R shallows with plants become "in-lake emergent" or "aquatic bed". Open water of any system becomes plain "water". **Lake vs pond vs river is lost.** |
| **Class** | FO forested (FO1 hardwood, FO2 tamarack, FO4 black spruce) · SS shrub (SS1 alder/willow, SS2 tamarack, SS3/SS4 bog shrubs) · EM1/EM2 emergent · AB aquatic bed · UB open water · RS rocky shore · US sand shore | Mostly, through the plant community. A mixed code (`PFO4/SS1`) takes its first class; tamarack and black spruce are the same kind. |
| **Water regime** | H permanently flooded · F semipermanent · C seasonally flooded · A temporarily flooded · D continually saturated · K artificial | **No.** This is the seasonal part, and it is dropped. |
| **Modifier** | q bog (38,645 polygons) · **b beaver (11,254 polygons, 27,940 acres)** · h diked · x excavated · d ditched (a few hundred) | Only "bog", through the plant community. **Beaver is dropped.** |
| **HGM (hydrogeomorphic) code** | where the wetland sits and how water moves through it: lake, river, stream, floodplain, pond, peatland, basin; inflow, outflow, throughflow, isolated | **Never fetched.** It's a separate field (`hgm_code`) the bake doesn't ask for. |

What the 14 kinds hold, with their water regimes:

| Game kind | Acres | Regime mix | Beaver-made |
|---|---|---|---|
| conifer bog | 181,267 | D (always saturated) 100 % | — |
| open water (ponds, flowages) | 64,639 | H 97 %, F 3 % | 8 % |
| shrub swamp | 57,108 | D 73 %, C 26 % | 6 % |
| open bog | 49,118 | D 100 % | — |
| marsh | 35,381 | **C (seasonal) 77 %**, F 23 % | **40 %** |
| hardwood swamp | 35,066 | D 91 %, C 6 % | 1 % |
| wet meadow | 15,863 | D 94 %, A 6 % | 18 % |
| in-lake emergent (wild rice, reeds) | 8,237 | H 100 % | 7 % |
| aquatic bed (lilies) | 4,559 | H 100 % | 30 % |

So yes, the game shows every *kind* of wetland in the area. It can't show **when** the water is there, **who made it**
(beaver), or **which way the water goes**.

## 2. Creeks and rivers: the navigable problem

Today `scripts/osm-extract.mjs` takes every OSM `waterway=river|stream|canal` not tagged `intermittent=yes`, and
`scripts/bake.mjs rasterizeCreeks` cuts it into the ground as paddleable water: **15 m wide for a stream, 22 m for a
river**, whatever is really there.

Sampling the NWI under every OSM line every 10 m (the Minnesota side):

| | Ways | km | Under the line |
|---|---|---|---|
| OSM streams | 12,812 | 4,871 | **open water 506 km** · marsh/meadow/shrub swamp 1,680 km · dry woods or forested bog 1,446 km · Ontario (no NWI) 1,239 km |
| OSM rivers | 4,573 | 1,956 | open water 954 km · marsh 177 km · dry 331 km · Ontario 494 km |

So about **three-quarters of the "creeks" the game paddles are, on the agencies' maps, a stream through a marsh or a
brook in the woods**. Spot checks:

| River | What's under it |
|---|---|
| Range River | 81 % open water |
| Phoebe River | 58 % open water, 34 % lily beds |
| Louse River | 71 % lily beds |
| Moose River | 52 % open water, the rest marsh and bog |
| Isabella, Little Isabella | read as "upland" because the bake's fetch skips open water over 100 acres, so the big river polygons are missing |

Sources that settle it:

- **NWI River system (R2, R3)**: a real river channel, open water, mapped as a polygon. The bake's size filter drops the
  big ones; it should keep every R polygon.
- **NWI `hgm_code`**: `LORVTH` (river, 446 polygons) and `LOFPTH` (river floodplain, 3,812) mark river corridors;
  `LOSTTH` is a wetland a stream runs through. A creek line inside these is a channel; a line through `TEPT*`
  (peatland) or no polygon at all is a brook.
- **NHD flowlines** (the MPCA's NHD service, layer 5, which `scripts/rapids.mjs` already queries for rapids):
  **perennial 46006 (10,510 lines) vs intermittent 46003 (1,851)**, plus 12,086 "artificial paths" through lakes and
  wetlands. The intermittent ones are dry by midsummer.
- **OSM `width=`** where a mapper gave one.

A sensible classification per stretch (about 50 m) of each OSM line:

| Class | When | In the game |
|---|---|---|
| River | inside an NWI R polygon, or mostly open water | paddleable, the width from the polygon |
| Marsh channel | through marsh, wet meadow or shrub swamp, perennial in NHD | paddleable but narrow (3–5 m), slow, reeds both sides, may need pushing through; low by late summer |
| Brook | through woods or forested bog, or intermittent in NHD | **not paddleable**: a stream bed you step over or wade, drawn 1–2 m wide; only the spring melt fills it |

## 3. Seasonal water

The water regime, by month (the game knows the date: `src/season.js`):

| Regime | Standing water |
|---|---|
| H permanently flooded | all season |
| F semipermanent | all season, except a drought's late summer |
| C seasonally flooded | ice-out to about early July, then saturated ground |
| A temporarily flooded | a few weeks of spring melt |
| D continually saturated | never standing; always wet underfoot (the bogs) |

77 % of the marsh is C. So in May the marshes and beaver meadows would be shallow water you can push a canoe through,
and by August they're sedge and mud. Intermittent NHD creeks follow the same calendar, and so do the 38 NHD
intermittent lakes (39001).

## 4. Lake types

The NWI and NHD hold more than "a lake":

- **NWI system**: L1 limnetic (deep water past the shelf), L2 littoral (the shallows: wild rice and lily beds,
  already used), P (ponds under 20 acres).
- **NWI HGM, lakes**:

  | Code | Polygons | What it means | Game use |
  |---|---|---|---|
  | `LELKTH` | 68 | throughflow: on a river chain | "on the Kawishiwi chain" on a lake page |
  | `LELKOU` | 37 | outflow only: a headwater lake | "headwaters" |
  | `LELKVR` | 2,709 | vertical: no mapped surface inflow or outflow | "landlocked" / "seepage lake" |

  Caveat: so few throughflow lakes looks low for the BWCA's chained lakes. Minnesota may assign throughflow only where
  a mapped stream enters and leaves, so check this against the game's own lake-to-lake links before trusting it.
- **Beaver ponds**: the `b` modifier on 3,717 small open-water polygons and 40 % of the marsh. A beaver pond has a dam
  at its outlet. That's the place to put a beaver dam and lodge, and on a creek route, a dam to haul the canoe over: a
  very real Boundary Waters moment.
- **NHD waterbody types**: perennial lake 5,155, lake 3,340, intermittent lake 38, swamp/marsh 2,978, reservoir 6.

## 5. What it would take

All of this needs a rebake, and a new map-data release uploaded to R2 (data.gagekrumbach.com). Each step:

1. **Refetch the NWI** with `hgm_code` and without the size filter for the River system. The fetch is resumable per
   block; the raw cache is 37 MB now.
2. **One more byte per cell**: water regime (3 bits), beaver (1), system L/P/R (2), HGM landscape (2). That's 1 of the
   v4 tile's 13 byte planes again, about +8 % raw before gzip; most of it compresses away.
3. **Fetch the NHD flowlines** (fcode, permanent id, geometry; about 25k lines) and match them to the OSM lines.
4. **Classify each OSM creek stretch** (river / marsh channel / brook) in the bake, and cut only rivers and marsh
   channels as water, at their own widths. Brooks become a stream-bed decal on land.
5. **In the game**:
   - the season's water level on C/A wetlands and intermittent creeks
   - beaver dams at the outlets of beaver ponds, with a short haul-over on a creek route
   - the lake page's type line (chain, headwater, landlocked, pond)
   - the developer HUD's Land row shows the full code

## Built (claude/wetlands)

- **Data:** `scripts/sources/ground.mjs` (the `wet` and `wcls` bytes), `scripts/sources/streams.mjs` (NHD flowlines),
  `scripts/creeks.mjs` (creek classes, brooks, beaver dams, lake flow), `scripts/v4-products.mjs` / `bake.mjs` (two
  more tile planes; `creeks.json`). Baked to `public-data-v5/` (374 MB).
  - Creeks: river 1,836 km, marsh channel 2,056 km, brook 1,174 km, unsurveyed (Ontario, as before) 1,136 km.
  - A brook stretch under 500 m between two paddled ones, or one a portage ends on, is kept paddled.
  - Beaver: 6,433 dams on ponds (3,449 lodges, 2,539 across a paddled creek), 4,419 old dams.
  - Lakes: chain 3,118, headwater 1,330, terminal 409, landlocked 4,343; 7,460 ponds.
- **Game, the wetlands drawn** (`land.js`, `site.js`, `placement.js`, `terrain-build.js`, `aquatic.js`): tree
  species and shrubs from the class, shrub classes held under ~18 ft, two-class codes as 70/30 patches, wild rice dying
  back in fall and cattail standing over the ice, standing water by regime and date (baked into a tile when it's built),
  the developer Land row with the full code.
- **Game, the water** (`creeks.js`, `world.js`, `props.js`, `player.js`, `map-*.js`, `fauna.js`, audio): brooks on the
  land (dry by midsummer when intermittent), seasonal creeks shallow late in summer, beaver dams and lodges with a hold-E
  haul-over, beavers at the real lodges, brooks and dams on the map, the lake page's Water line.
- **Round 2 (claude/wetlands-2, data v6):** marsh channels cut 7.5 m wide so diagonals stay joined (at 6 m the water
  broke); creeks paddled from every portage end (OSM, USFS, and the creeks out of an unnamed pond a portage ends on) to
  open water; duplicate old dams dropped; a seasonal creek's water 1.3 ft lower in August with a mud bank; the haul over
  a dam walked (the paddler out on the dam, dragging the canoe over); brooks cut into the 2 m ground with damp banks; a
  leatherleaf / Labrador tea mat; marsh pools frozen and snow-dusted in winter, slush at ice-out; meadows through the
  seasons; the walk in a marsh firmer as it dries and frozen.
- **Not yet:** land marshes have no standing cattail and sedge plants (only the ground colour and tufts); no snow on the
  ground anywhere in the game; pools freeze on the nearest lake's dates (a real pool a week or two earlier); a tile shows
  the low water and the pools for the date it was built.
- **Release:** data `bwca/v6/` on R2 goes out with this code (`src/rapids.json` and `src/lake-facts-v4.json` belong to it);
  v5 and v4 kept for rollback.

## The season round (2026-11-01, data v8)

- **Portages break the creek beside them** (`scripts/creeks.mjs portageBreaks`; the owner on Indiana Lake: "we are
  cutting a river through it?"). A portage is the evidence the water beside it isn't paddled: a creek stretch within
  110 m of a portage's line, more than 18 m (a fifth of a short portage) from either end, and running along the trail
  rather than across it, becomes a brook (`creeks.json` brooks with `port`), or boulder white water (`rapids`) where
  the NHD, GNIS, Ontario or OSM mark rapids or falls within 90 m. Past the ends the creek is untouched. The canoe
  network's own lines and the LiDAR's water edges are kept off those stretches too (`breaks.mask`). Portage-end
  anchors now reach only away from their portage. Measured with the scratchpad's `fix/bypass.py` (portages whose ends
  are joined by water in the trail's box + 150 m, through creek cells): v7-water 666 of 1,295, v8 see the report.
- **Flowages** (`index.json` lake `regime`: C for a pond mostly under the NWI's C or A regime, F for F; `beaver` when
  mostly beaver-made): full from ice-out into early July, drawn down by August (C 0.95 m, F 0.45 m), some back with the
  October rains (`src/water-build.js waterDrop`, `flowageLow`). Their beds are capped shallow at tile build
  (`flowageBeds`: 0.75 m C, 1.15 m F, with a slow noise) so the drawdown bares mud flats with pools; the creek's line
  through each (`creeks.json` `chans`) keeps a 1.7 m channel. The hull grounds where under 0.1 m of water is left
  (`player.js floats`) and drags in the shallows (`creekDrag`).
- **Lake levels by the date** (`waterDrop`): the bake's levels are the spring LiDAR's (flown 17 April to 17 May 2021),
  so water only drops from them. The regional curve is the MN DNR's lake-level readings (LakeFinder
  `water_levels_export.cgi?format=csv&id=<DOW>`, cached in `data-cache/lakefinder/levels/`) of 17 lakes with 4-75 years
  of records, each year against its own mean: high mid-May, lowest mid-September, a little back in October. Falls:
  chain lakes, rivers and creeks 0.2 m, headwater 0.24, landlocked and ponds 0.2, the border lakes on rock outlets (Sea
  Gull, Saganaga, Gunflint, ...) 0.48; the Namakan chain (Crane, Sand Point) on the IJC 2018 rule curve's shape held to
  0.6 m; Lake Superior not at all. The drop is per cell in the tile's `low` plane (cm), eased where two waters meet (a
  creek follows the lake it runs into).
