// Shared bake configuration: areas, grid layout and tile format.

export const AREAS = {
  // Lake One -> Lake Four chain east of Ely (BWCA entry point 30): a quick test bake, 5 x 3 tiles.
  lakeone: { south: 47.875, west: -91.535, north: 47.945, east: -91.375 },
  // The whole Boundary Waters Canoe Area Wilderness with a few kilometres of margin, Crane Lake to the Pigeon River.
  bwca: { south: 47.78, west: -92.55, north: 48.4, east: -89.88 },
};

export const CFG = {
  cell: 10,                // metres per grid cell
  tile: 256,               // cells per tile edge (2.56 km)
  halo: 6,                 // extra cells baked around every tile so a tile can be built without its neighbours
  far: 8,                  // far-field cells are this many fine cells (80 m)
  farTile: 256,            // far cells per far tile edge (20.48 km)
  overview: 8,             // overview image: one pixel per this many fine cells (80 m)
  zoom: 14,                // terrarium tile zoom (~6.4 m/px at this latitude)
  maxDist: 3000,           // metres, the signed shore distance is clamped to +-this
  elevationFloor: 100,     // metres: DEM values below this are no-data (Lake Superior, 183 m, is the lowest surface near the BWCA)
  band: 1024,              // rows processed at once (4 tile rows)
  ua: 'bwca-canoe-game/0.2 (local bake script)',
  cacheDir: process.env.BWCA_CACHE || 'data-cache',
  outDir: 'public/data',
  tileUrl: (z, x, y) => `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`,
  geofabrik: (name) => `https://download.geofabrik.de/${name}-latest.osm.pbf`,
  extracts: ['north-america/us/minnesota'],
  portage: { maxEndToWater: 70, minLen: 15, maxLen: 2500 },
  startLatLon: [47.9417, -91.4645], // Lake One landing at the end of the Fernberg road
};

export const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Local metres projection with a single origin at the bbox centre: x east, z south (north is -z).
export function makeProjection(bbox) {
  const lat0 = (bbox.south + bbox.north) / 2;
  const lon0 = (bbox.west + bbox.east) / 2;
  const phi = (lat0 * Math.PI) / 180;
  const mPerDegLat = 111132.92 - 559.82 * Math.cos(2 * phi) + 1.175 * Math.cos(4 * phi);
  const mPerDegLon = 111412.84 * Math.cos(phi) - 93.5 * Math.cos(3 * phi);
  return {
    lat0, lon0, mPerDegLat, mPerDegLon,
    toLocal: (lat, lon) => [(lon - lon0) * mPerDegLon, -(lat - lat0) * mPerDegLat],
    toLatLon: (x, z) => [lat0 - z / mPerDegLat, lon0 + x / mPerDegLon],
  };
}

// The grid is padded to whole tiles and centred on the bbox.
export function makeGrid(bbox, proj) {
  const [xw, zn] = proj.toLocal(bbox.north, bbox.west);
  const [xe, zs] = proj.toLocal(bbox.south, bbox.east);
  const ntx = Math.ceil((xe - xw) / CFG.cell / CFG.tile);
  const nty = Math.ceil((zs - zn) / CFG.cell / CFG.tile);
  const width = ntx * CFG.tile, height = nty * CFG.tile;
  const originX = -(width * CFG.cell) / 2, originZ = -(height * CFG.cell) / 2;
  return {
    width, height, ntx, nty, cell: CFG.cell, originX, originZ,
    cx: (i) => originX + (i + 0.5) * CFG.cell,
    cz: (j) => originZ + (j + 0.5) * CFG.cell,
    ci: (x) => Math.floor((x - originX) / CFG.cell),
    cj: (z) => Math.floor((z - originZ) / CFG.cell),
  };
}
