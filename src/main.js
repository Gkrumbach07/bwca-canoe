import './fog.js'; // must come first: patches three's fog chunks before any material compiles
import { SunLight } from './sunlight.js'; // patches the sun shadow chunk, also before any material compiles
import * as THREE from 'three';
import { World } from './world.js';
import { DayCycle, buildMoon } from './daycycle.js';
import { buildStars } from './stars.js';
import { makePost } from './post.js';
import { makeAquaticKit } from './aquatic.js';
import { GroundCover } from './groundcover.js';
import { detailGrass } from './detail.js'; // the LiDAR detail's grass offset (docs/detail.md)
import { Loons } from './loons.js';
import { Fauna } from './fauna.js';
import { Weather } from './weather.js';
import { occlusionCacheReady } from './occlusion.js';
import { Mist } from './mist.js';
import { Ambient } from './audio.js';
import { makeTerrainMaterial } from './terrain.js';
import { WaterSystem, REFLECT_LAYER } from './water.js';
import { buildSky, buildClouds, updateClouds } from './sky.js';
import { makeVegetationKit } from './vegetation.js';
import { TileManager } from './tiles.js';
import { buildCanoeRig } from './canoe.js';
import { Player, Input, seaMoments } from './player.js'; // cons B: seaMoments
import { setBrookSeason, creekMoments } from './creeks.js'; // the wetlands round: the brooks' water by the date, the low creek's moment
import { Packs } from './packs.js'; // trip core B
import { ChaseCamera } from './camera.js';
import { Hud } from './hud.js';
import { GeoBridge } from './geo.js';
import { Ripples } from './wake.js';
import { Wind } from './wind.js';
import { Fishing } from './fishing.js';
import { Energy, GULP } from './energy.js';
import { Tasks, siteFeature } from './tasks.js';
import { Outfitter } from './outfitter.js';
import { Settings, FpsCounter } from './settings.js';
import { TripSaver } from './save.js';
import { Title } from './title.js';
import { Journal } from './journal.js';
import { TripStats } from './trip-stats.js';
import { lookboard } from './lookboard.js';
import { Trip } from './trip.js'; // trip core A
import * as PACE from './pace.js'; // one speed: the clock and the seen speeds, for the console
import { Veil } from './veil.js'; // trip core A
import { Camp, CampRegistry } from './camp.js'; // trip core C
import { Fires } from './fire.js'; // trip core C
import { Headlamp } from './headlamp.js'; // trip core C
import { Profile } from './profile.js'; // hubs 1A
import { storeLayout, onStore, storeLayouts, setStoreNotices, storeStats } from './props.js'; // hubs 2A
import { outfitterProfile, boardLean } from './outfitters.js'; // hubs 2C
import { Rides } from './rides.js'; // hubs 2C
import { sheets, sheetAt } from './sheets.js'; // hubs 2D (tuning: sheetAt, Arvid's map)
import { explored } from './explored.js'; // round A-B: the map filling in
import { MapTable } from './maptable.js'; // fb2 D
import { Shop } from './shop.js'; // hubs 2B
import { PhotoCamera } from './photo.js'; // hubs 3B
import { People } from './npcs.js'; // hubs 3C
import { Actors } from './actors.js'; // p2 A
import { Coop } from './coop.js'; // co-op phase 1
import { CoopGive } from './coop-give.js'; // co-op phase 2, stream B: purses, giving, a guest's things kept by the host
import { CoopShare } from './coop-share.js'; // co-op phase 2: the shared world things
import { CoopBoat } from './coop-boat.js'; // co-op phase 3 round 3: two canoes, either one
import { CoopTrip } from './coop-trip.js'; // co-op phase 3, stream C: Adventure in co-op
import { CoopNight } from './coop-night.js'; // co-op phase 3, stream A: the night together
import { CoopSky } from './coop-sky.js'; // co-op phase 3, stream B: one sky (the host's wind, the weather's seed)
import { CoopParties } from './coop-parties.js'; // co-op round 2: one set of parties (the host's seed and Traffic, everyone's camps)
import { CoopAnim } from './coop-anim.js'; // co-op phase 3, stream B: a friend's figure does what they are doing
import { inventory } from './inventory.js'; // fb A
import { ITEMS, defineItem, itemDef, NEED } from './items.js'; // fb A (NEED: the fb4 join's room step)
import { ContainerView } from './containers.js'; // fb A
import { modelFor, modelKeyOf, modelGeometry, MODEL_KEYS } from './item-models.js'; // content D
import { invUI } from './inv-ui.js'; // fb B
import { Dialogue } from './dialogue.js'; // fb F
import { Forage } from './forage.js'; // fb G
import { hold } from './hold.js'; // camp 1
import { pointer, peopleTargets, forageTargets, taskTargets } from './pointer.js'; // fb2 A
import { nearby } from './nearby.js'; // fb2 A
import { FORAGE } from './forage.js'; // fb2 A
import { KINDS } from './tasks.js'; // fb2 A
import { cards } from './cards.js'; // wc B
import { VERBS, verbsOf } from './items.js'; // wc D
import { chipOf, missingOf } from './items.js'; // fb5 B
import { isPot } from './items.js'; // crafting (2026-10-31)
import { withTentNeeds, pitchNeeds } from './tent.js'; // fb4 E
import { chip } from './chip.js'; // fb5 D
import { Hints } from './hints.js'; // fb4 D
import { MOMENTS } from './hints.js'; // content C
import { kit } from './kit.js'; // content C
import { uniques } from './uniques.js'; // content C
import './gear-icons.js'; // content C
import { attachTaskKinds } from './task-kinds.js'; // content A
import { attachTaskKinds2 } from './task-kinds-2.js'; // gl-d: the board's new kinds (registered before any save is read)
import { bear } from './bear.js'; // cons A
import { bugs } from './bugs.js'; // cons C
import { LIFE_ENV } from './poses.js'; // r2: the bugs out, for the people's idle
import { record } from './record.js'; // round A-A
import { slots } from './save.js'; // round A-D
import { migrateSeason } from './migrate.js'; // d2 join
import { migratePmas } from './migrate-pma.js'; // r2: the old saves' primitive areas
import { kv } from './store.js';
import { CULL } from './tiles.js'; // round A-C
import { AutoWatch, prewarmPasses } from './quality.js'; // round A-C
import { Parties } from './parties.js'; // round A-F
import { PartyCamps } from './party-camps.js'; // round A-F
import { PartyMoves } from './party-moves.js'; // p2 C
import { partyTargets } from './pointer.js'; // p2 C
import { names } from './names.js'; // d1 names
import { setLocalIce } from './season.js'; // d1 lakes
import { WhiteWater } from './whitewater.js'; // d1 rapids
import { whiteWater } from './rapids.js'; // d1 rapids
import { bonk } from './audio-voices.js'; // d1 rapids
import { loadBurns, setBurnDate, burnStats, burnLook, eventsAt } from './burns.js'; // the real burns
import { BurnNotes } from './burn-notes.js'; // the real burns
import { Permits } from './permits.js'; // gl-a: permits
import { PermitDesk } from './permit-desk.js'; // gl-a: the permit desk
import { story } from './story-hooks.js'; // gl-c: the story's event bus and saved state
import { STORY_ON } from './story-flag.js'; // st-k1b: the story's dev flag (?story=1 in dev)
import { onboarding } from './onboarding.js'; // gl-c: the home counter's first visit, the old gear
import { starter } from './starter.js'; // the start round: each outfitter's first night out, the season's sky and its kind first days
import { walt } from './walt.js'; // gl-c: the notebook in the old tent
import { guide } from './guide.js'; // r3: the registry of what is on the go (the journal's Tasks, the tracker, the locator)
import { tracker } from './tracker.js'; // r3 B: the task pop-ups on the left

const palette = { zenith: 0x4c8fd8, horizon: 0xd6e6f2, ground: 0x9aa58a, sun: 0xffe9c4, fog: 0xc6dbe9, cloudTop: 0xfbf8f1, cloudBase: 0xa6bfd9 };

const loadingEl = document.getElementById('loading'), barEl = document.getElementById('loading-bar'), msgEl = document.getElementById('loading-msg');
const progress = (f, msg) => { barEl.style.width = `${Math.round(f * 100)}%`; if (msg) msgEl.textContent = msg; };

async function main() {
  const world = await World.load(progress);
  // d2 join: a season made on another map release carried to this one's lake, site and trail numbers, before anything
  // reads it (migrate.js)
  await migrateSeason(world.meta, kv); // (the saves' store: store.js)
  const pmaMigrated = migratePmas(kv, { meta: world.meta }); // r2: a season's primitive areas from the old made-up table to the real twelve, once
  // d1 names: the official names on the world's records before the tiles build (the trail signs read them): the sites'
  // USFS numbers, the portages' trails, rods and classes, the place names (names.js; the rest of it below)
  const named = await names.attach(world).catch((e) => { console.warn('d1 names', e); return null; });
  await occlusionCacheReady; // the occlusion bakes cached by the last start (occlusion.js), read while the world loaded
  // no multisampling on the canvas: the scene renders into the post chain's multisampled target (post.js) and the
  // canvas only ever takes the grade's full-screen quad
  const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap; // r186: hardware-compared, five-tap Vogel disc; shadow.radius sets the softness in texels
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.domElement.className = 'game';
  document.getElementById('app').appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(palette.fog, 260, 3000); // switches fog on; the haze itself is fog.js's ramps, set by the day cycle
  const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.3, 9000);

  const sunDir = new THREE.Vector3(-0.62, 0.36, 0.46).normalize(); // initial; the day cycle drives it
  // The key: a sun with two cascaded shadow maps fitted to the view (sunlight.js). The near cascade covers
  // the first ~45 m at a couple of centimetres a texel, at nearly full strength, with the bias kept tight so
  // feet and hulls touch their shadows; the far one reaches 300 m with a coarser texel and a scaled bias.
  const sun = new SunLight(0xffe8c0, 2.2);
  sun.position.copy(sunDir); // the direction the light comes from; the day cycle moves it
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048); // per cascade; the settings panel changes it
  sun.shadow.camera.far = 300;        // how far shadows reach from the camera
  sun.shadow.split = 0.15; sun.shadow.fade = 0.25; sun.shadow.margin = 320; sun.shadow.farBiasScale = 4;
  sun.shadow.bias = -0.00006; sun.shadow.normalBias = 0.05; sun.shadow.radius = 1.5; sun.shadow.intensity = 0.85;
  scene.add(sun);
  const hemi = new THREE.HemisphereLight(0x8db4dc, 0x5f6b58, 0.55); // the fill: cool sky, dim, against the warm key
  scene.add(hemi);
  const moon = new THREE.DirectionalLight(0x8aa4cc, 0);
  moon.position.set(300, 600, -500);
  const moonTarget = new THREE.Object3D(); // aimed at the player, not at the world origin
  moon.target = moonTarget;
  scene.add(moon, moonTarget);

  scene.background = new THREE.Color(palette.fog);
  const sky = buildSky(sunDir, palette);
  scene.add(sky);
  const stars = buildStars();
  sky.add(stars);
  const moonDisc = buildMoon();
  sky.add(moonDisc);
  const clouds = buildClouds(26, 7000, palette, sunDir);
  scene.add(clouds);

  // the streamed world: water first (tiles hand it their far meshes and it owns the surface atlas), then the tiles
  const water = new WaterSystem(world, sunDir, palette, { sky: sky.material.uniforms, sun, hemi, moon }); // the mirrored sky and the light, by reference
  scene.add(water.group);
  const tiles = new TileManager(world, scene, { terrainMaterial: makeTerrainMaterial(), water, vegetation: makeVegetationKit(3), aquatic: makeAquaticKit(water, 9), seed: 3 });
  world.tiles = tiles;
  const saved = TripSaver.read(); // the spot saved at the last stop: the title shows it, and Paddle in continues there
  const start = saved ? { x: saved.x, z: saved.z } : world.meta.start;
  // the real burns (burns.js): a tile shows the burns begun by the season's date, so the date is set before the first tile
  // is asked for: the saved trip's, else today's (a new season starts today, title.js); the frame keeps it to the clock.
  // The main thread's own copy of the table is for the forage and the burn's name (the workers read theirs).
  { const now = new Date(); setBurnDate(saved && Number.isFinite(saved.year) ? saved.year : now.getFullYear(), saved && Number.isFinite(saved.doy) ? saved.doy : Math.floor((now - new Date(now.getFullYear(), 0, 0)) / 86400000)); }
  loadBurns();
  const setOrigin = (x, z) => { const [tx, ty] = world.tileOf(x, z); const [ox, oz] = world.tileOrigin(tx, ty); water.setOrigin(ox, oz); };
  setOrigin(start.x, start.z);
  progress(0.15, 'Loading the lakes around you…');
  await tiles.prime(start.x, start.z, (f) => progress(0.15 + f * 0.8, `Loading the lakes around you… ${Math.round(f * 100)}%`));
  progress(0.97, 'Launching the canoe…');

  const ripples = new Ripples(water);
  scene.add(ripples.mesh);
  const cover = new GroundCover(water);
  scene.add(cover.mesh);
  tiles.detail.grass = detailGrass(cover, tiles, world); // (null with ?detail=10)
  const mist = new Mist(water);
  scene.add(mist.group);
  const audio = new Ambient();
  const loons = new Loons(world, water, scene, 6, audio, ripples);
  const fauna = new Fauna(world, water, scene, { loons }); // beaver, moose, eagles, fish, insects, gulls, raven

  const canoe = buildCanoeRig({ water }); // the hull's water line rides the water's own swell
  canoe.rig.traverse((o) => o.layers.enable(REFLECT_LAYER));
  canoe.rig.userData.foam.layers.disable(REFLECT_LAYER); // the line on the water is not mirrored in it
  scene.add(canoe.rig);
  const input = new Input();
  const player = new Player(world, canoe, input);
  player.ripples = ripples; player.water = water; player.audio = audio;
  // fb D: the figure poses the walker's move (player.js player.move, stream C): a vault, a climb, sitting, wading;
  // without it (an older player.js) the gait is all there is
  canoe.moveOf = () => player.move || null;
  if (saved) { player.x = saved.x; player.z = saved.z; player.heading = saved.heading; }
  const chase = new ChaseCamera(camera, renderer.domElement, world);
  player.chase = chase; // walking is read against the view; the cursor steers the canoe when asked
  // fb2 E: the trees, shrubs and ferns between the third-person camera and the walker are seen through (a dither on the
  // vegetation's own materials, patched here before anything compiles: no new program); the camera pulls in, on a
  // spring, only for the ground, rocks, walls and a big trunk at the lens (camera.js)
  chase.seeThrough(tiles.vegetation);
  // p2 B: the owner's two small bugs (2026-10-26). In first person under the canoe the trail shows: the hull's lid (a
  // depth-only plane at the gunwales that keeps the water out of a floating hull) is off on the carry, as it hid the
  // tread and the water ahead; the look tips down the trail, the bow rides higher and the near hull is seen through
  // (camera.js FP_CARRY; seeHull before the compile below, so its program is made behind the title card). And the creeks
  // and rivers are graded (scripts/water-grade.mjs, applied to each tile in the worker by water-levels.js; levelAt is
  // bilinear in grid.js and water.js): the canoe pitches with the water's own slope as well, so it noses down a rapids.
  chase.seeHull(canoe, scene);
  const p2b = { pitch: 0, lid: canoe.lid || canoe.hull.children.find((c) => c.isMesh && c.material && c.material.colorWrite === false) };
  p2b.afterPlayer = (dt) => {
    if (p2b.lid) p2b.lid.visible = player.mode !== 'carry';
    const afloat = player.mode === 'paddle' && !player.teleporting;
    let want = 0;
    if (afloat) {
      const f = player.forward, L = 2.2;
      want = Math.atan((world.levelAt(player.x + f.x * L, player.z + f.z * L) - world.levelAt(player.x - f.x * L, player.z - f.z * L)) / (2 * L));
      if (!Number.isFinite(want)) want = 0;
    }
    p2b.pitch += (want - p2b.pitch) * (1 - Math.exp(-Math.max(0, dt) * 4));
    if (afloat && Math.abs(p2b.pitch) > 1e-4) { canoe.rig.rotateZ(-p2b.pitch); canoe.rig.updateMatrixWorld(); } // (player.js sets the rig afresh each frame: bow up is -z)
  };
  const settings = new Settings();
  const hud = new Hud(world, { onTeleport: async (x, z) => { if (trip && trip.adventure) return; if (await player.teleport(x, z)) chase.snap(); }, settings, camera }); // trip core A: the map moves you in Sandbox only
  const post = makePost(renderer, scene, camera);
  const { lat, lon } = world.toLatLon(start.x, start.z);
  const day = new DayCycle({ scene, sun, hemi, moon, sky, clouds, water, post, stars, mist, ripples, hullFoam: canoe.rig.userData.foam.material, moonDisc }, { lat, lon });
  const faunaCtx = { player, world, water, day, camera, ripples, audio };
  player.season = day.season;
  const geo = new GeoBridge();
  const wind = new Wind(11);
  player.wind = wind;
  const weather = new Weather({ day, wind, scene, camera, audio, water, player, world }); // forecast, clouds, rain, fog, storms
  const fishing = new Fishing({ world, player, canoe, water, ripples, audio, chase, input, day, wind, scene });
  player.fishing = fishing;
  fishing.rod.traverse((o) => o.layers.enable(REFLECT_LAYER));
  // the trip: outfitters at the landings, the food and the energy, the task board
  const teleport = async (x, z) => { const ok = await player.teleport(x, z); if (ok) chase.snap(); return ok; };
  const energy = new Energy(player, day);
  player.energy = energy; // 2026-10-31: winded, Shift does nothing (player.hustleKey)
  const tasks = new Tasks(world, scene, player, { audio, water });
  const tripStats = new TripStats(world, player, day);
  // trip core A: the veil (fade cards stepped per frame) and the trip (the mode, the permit, the rules), before the outfitter
  const veil = new Veil();
  const trip = new Trip({ world, player, day, energy, hud, veil, tasks, fishing, stats: tripStats });
  const outfitter = new Outfitter(world, player, { energy, tasks, hud, day, stats: tripStats, onTeleport: teleport, trip, veil });
  // hubs 1A: the season (profile.js): money, the gear owned, the outfitters you know, home and the season's permit,
  // read (or built once from the trip core's saves) before anything boots; the trip's packs and canoe follow it
  const profile = new Profile();
  trip.useProfile(profile); outfitter.profile = profile;
  const journal = new Journal({ hud, world, player, day, fishing, tasks, energy, outfitter, stats: tripStats, wind });
  energy.onNote = (t) => hud.note(t); tasks.onNote = (t) => hud.note(t, 6);
  energy.onEvac = (why) => trip.evacuate(why); // trip core A: no food and no energy ends an Adventure in an evacuation
  tasks.onChange = () => outfitter.save();
  // hubs 1C: a board per outfitter (tasks.js): the day turns its notices, kept fish go in a notice's cooler, money is
  // claimed where it was posted. Until stream A's counter renders tasks.boardSection itself, a stub swaps it in.
  tasks.attach({ day, fishing, outfitter }); fishing.tasks = tasks;
  tasks.onBoard = () => { if (outfitter.open) outfitter.render(); };
  // trip core C: camp and night. The campfires (one light, always in the scene), the headlamp (likewise), who holds
  // each campsite, and the camp itself; the trip, the veil and the packs are looked up on the first frame (whichever
  // of them exist: `typeof` keeps this safe in any build, and before they are declared).
  const fires = new Fires({ scene, wind, hemi, sun });
  audio.fires = fires;
  const lamp = new Headlamp({ scene, canoe, chase, camera, player, day });
  const campsites = new CampRegistry(world);
  const camp = new Camp({ world, player, day, energy, hud, scene, tiles, fires, lamp, audio, weather, wind, fishing, outfitter, registry: campsites,
    links: () => ({ trip, veil, packs }) });
  // hubs 1B: the single bar. Any outfitter's counter fills the bottle (free, drinkable at once); a trip put in starts
  // with the needs full; whoever comes out on an evacuation brings food and water; the camp asks stream A's profile,
  // when there is one, how well the tent sleeps and what filter there is.
  energy.atCounter = () => !!outfitter.open;
  if (trip.on) { trip.on('start', () => energy.fresh()); trip.on('evac', () => energy.rescued()); }
  camp.profileOf = () => profile;
  // fb2 F: warmth, the fourth need (energy.js): a lit fire near you warms you (fires.near), and so does the inside of a store
  energy.fires = fires; energy.indoors = () => !!(outfitter.visit && outfitter.visit.inside);
  // hubs 2A: the outfitters' stores (props.js): each store's lamp borrows the campfires' one light while it is the lit
  // thing nearest the eye (fire.js steady), and its cork board shows that outfitter's notices once its board is up
  // (tasks.js), redrawn when they change; window.__game.props for the walk-in and the tests
  const storeBoard = (L) => {
    if (!tasks.boards || !tasks.boards[L.ep]) return;
    const list = tasks.board(L.ep), sig = list.map((t) => (t ? `${t.id}:${t.status}` : '-')).join(',');
    if (sig !== L.boardSig) { L.boardSig = sig; setStoreNotices(L.ep, list); }
  };
  onStore((L, ep) => { fires.steady(`store:${ep}`, L && L.lamp); if (L) storeBoard(L); });
  // once the sun is down the glass goes, so the lit store shows through its windows
  setInterval(() => { const up = day.sunDir.y > 0.035; for (const L of storeLayouts()) { storeBoard(L); L.glass.visible = up; } }, 2000);
  // hubs 2B: the shop (shop.js): what each outfitter sells, at its prices, and what the gear does (player.gear, read in
  // one line each by the paddle, the energy, the packs, the camp and the rod); the counter's tabs sell through it, and
  // the store you walk into (outfitter.js, on stream A's props.storeLayout) opens the counter at the shelf you stand at
  const shop = new Shop({ world, player, profile, energy, fishing, day, hud, camp });
  outfitter.shop = shop;
  const nearCamp = (x, z) => { for (const c of world.campsites) if (Math.abs(c.x - x) < 40 && Math.abs(c.z - z) < 40 && Math.hypot(c.x - x, c.z - z) < 40) return true; return false; };
  let campTimer = 0, atCamp = false;
  // fb4 D (decision 4, the keys after the owner's second round of 2026-10-25): the global keys are Sandbox's wind. R (the
  // shore in the water) and N (sound) are gone: both are rows of Settings (Display, Sound). One speed (2026-10-26): 1 2 3,
  // the game speed, are gone too (the clock is everyone's, pace.js); the numbers only pick lures while the rod is up.
  window.addEventListener('keydown', (e) => {
    if (e.target && e.target.tagName === 'SELECT') return;
    if (trip.sandbox) { if (e.code === 'Comma') wind.nudgeSpeed(-1); if (e.code === 'Period') wind.nudgeSpeed(1); if (e.code === 'Slash') wind.nudgeDirection(30); if (e.code === 'Semicolon') wind.release(); } // trip core A: the wind keys are Sandbox's
  });
  window.addEventListener('resize', () => { camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth, window.innerHeight); post.resize(window.innerWidth, window.innerHeight); });
  // trip core B: the packs and the portages (packs.js): where each pack is, the load you carry, the double portage
  const packs = new Packs({ world, player, canoe, day, energy, hud, trip });
  packs.veil = veil; // the fetch fades through the same card as the evacuation and the night
  player.packs = packs;
  // hubs 2C: every outfitter its own (outfitters.js: the kind, the keeper and their hints, the prices, the signature
  // item, the board's lean, the building's look, all read from the place) and the rides up the road between them
  // (rides.js). The counter renders rides.section where it has a place for it; the phase-1 counter gets it in its wall
  // column, and the keeper's voice in its header, until the shop's counter speaks for itself (outfitter.keeperVoice).
  const rides = new Rides({ world, outfitter, day, veil, hud, energy, tasks, teleport });
  outfitter.rides = rides;
  tasks.leanOf = (ep) => boardLean(ep, world);
  outfitter.keeperVoice = true; // the shop's counter (2B) renders the keeper, the signature and the rides itself, so 2C's stand-ins stay off
  // hubs 3B: the camera and the photo notices (photo.js). C raises it (the $25 35 mm, or the disposable the first photo
  // notice of a season lends), Space takes the picture; a subject counts near the middle of the print, near enough and
  // not hidden by the land (fauna.subjects), and the print is kept for the journal's Photos tab. Made before the title,
  // so its Esc lowers the camera ahead of the pause card.
  const photo = new PhotoCamera({ world, player, chase, camera, renderer, fauna, day, hud, tasks, outfitter, profile, audio, veil, fishing, camp });
  journal.photos = photo;
  // hubs 3C: people in the outfitters (npcs.js): the keeper behind every counter and the season's visitors, three figures
  // at most on the paddler's own model and material (no new program, no new light). E gives a visitor's line (Q at the
  // counter is a word with the keeper), a second E their one task (the fetch and npc kinds, registered there); the store's
  // hotspots leave E to a visitor you face (outfitter.people). Updated after the outfitter's prompt, in the frame below.
  const npcs = new People({ world, scene, player, day, hud, tasks, outfitter, profile, weather, registry: campsites, mat: canoe.rig.getObjectByProperty('isSkinnedMesh', true).material });
  outfitter.people = npcs;
  npcs.camera = camera; // (r2 2 verify: a body changes hands only out of view)
  npcs.quiet = () => photo.raised; // the people say nothing while the camera is up (3B)
  weather.indoors = () => !!(outfitter.visit && outfitter.visit.inside); // hubs 3 join: no rain falling inside a store
  // polish B: the soundscape knows indoors too (audio.js): the wind, the trees, the shore and the birds through the walls,
  // the rain on the roof, plank footfalls on the store's floor (and on a dock's deck, which it reads from the feet)
  audio.indoors = () => !!(outfitter.visit && outfitter.visit.inside);
  // fb F: dialogue (dialogue.js). What people say shows by their heads with their names, one at a time in a room, pinned
  // to the screen's edge when they are off it; E on someone opens a conversation (numbered choices; you hold still and
  // the view turns to them, or in third person outside a store cuts over your shoulder); a conversation opens with what
  // that person last said to you (fb4 D: T and its panel are gone). Made before the title, so its Esc and number keys
  // come first.
  const talk = new Dialogue({ camera, player, chase, hud, day, frame: () => !(outfitter.visit && outfitter.visit.inside) });
  npcs.dialogue = talk;
  // p2 A: the actor layer (actors.js): people out on the water and the trails, posed with the player's own stroke, gait and
  // carry (poses.js). The parties drive it (people phase 2); __game.actors.demo() (test only) has two canoes crossing Lake
  // One and a party of four carrying over the Lake One - Kawishiwi River portage. Bodies come from the people's figure pool
  // when it lends them (npcs.js lend / giveBack: the eight are shared), else from the layer's own; hulls, figures, paddles
  // and packs draw with the rig's material, so no program or light is added. Updated after the camera, below.
  const actorPool = typeof npcs.lend === 'function' ? { take: (look) => { const b = npcs.lend('actors'); if (b) b.wear(look); return b; }, give: (b) => npcs.giveBack(b) } : null;
  const actors = new Actors({ scene, ground: (x, z) => tiles.groundAt(x, z), world, water, ripples, material: canoe.material, lidMaterial: canoe.lid.material, pool: actorPool, reflectLayer: REFLECT_LAYER });
  // r2 (NPC motion): the wind on the parties' canoes (their own physics near you), where your eyes are (a person near
  // looks at you), and the bugs where you are (people swat at them)
  actors.wind = wind;
  actors.eye = (out) => out.set(player.x, (player.foot ? player.foot.y : player.altitude || 0) + 1.62, player.z);
  { const upd = actors.update.bind(actors); actors.update = (dt, ...a) => { try { LIFE_ENV.bugs = (bugs.now && bugs.now.level) || 0; } catch { LIFE_ENV.bugs = 0; } upd(dt, ...a); }; }

  // the shell: settings (applied now and live), the trip saver, the title / pause screen
  const fps = new FpsCounter(renderer);
  settings.attach({ renderer, scene, sun, water, post, audio, chase, player, stats: fps, geo });
  const saver = new TripSaver(player, day, chase);
  const title = new Title({ world, player, chase, camera, day, hud, settings, saver, saved, trip, outfitter });
  title.photo = photo; // (Esc with the camera up lowers it: no pause)
  // the season round: the title's scene on the saved season's date (its own golden hour), not today's (and the tiles built for it)
  if (saved && Number.isFinite(saved.year) && Number.isFinite(saved.doy)) day.setClock(saved.year, saved.doy, saved.hours ?? 12);
  // a trip saved on a trail or in the water comes back afloat at the nearest open water
  // (on foot with the canoe set down somewhere, at a camp say, you come back on foot beside it)
  // camp 1: one saved in the middle of a carry comes back on the trail, the canoe overhead and the carry on you (packs.js)
  if (saved && saved.mode === 'carry' && packs.resumeCarry(saved)) chase.snap();
  else if (saved && saved.mode === 'walk' && player.standAt(saved)) chase.snap();
  else if (saved && (saved.mode !== 'paddle' || world.shoreAt(saved.x, saved.z) > -2)) player.teleport(saved.x, saved.z);
  title.open('title');
  // Compile every material the scene holds now, hidden ones too (the rise rings, the rain, the cloud deck and the
  // anvils, the fish and the lures, the wildlife's parts), behind the title card and off the main thread where the
  // browser can (KHR_parallel_shader_compile), so none compiles in the frame it first shows. The light count never
  // changes (daycycle.js), so these programs serve day and night alike.
  // polish A: compiled with the composer's target bound (post.js draws the scene into it, never onto the canvas). The
  // tone mapping and the output colour space are program parameters that depend on whether a target is bound, so a
  // compile against the canvas made programs the composer's draws never used, and a hidden thing (the rain, the cloud
  // deck, the rise rings) still compiled in the frame it first showed.
  const prewarm = (root) => {
    renderer.setRenderTarget(post.composer.readBuffer);
    const done = renderer.compileAsync(root, camera, scene).catch(() => {});
    renderer.setRenderTarget(null);
    return done;
  };
  prewarm(scene);
  prewarm(tiles.prewarmGroup()); // and every species the tiles may bring

  window.__game = { THREE, scene, camera, renderer, player, world, canoe, tiles, chase, hud, geo, water, day, post, loons, fauna, weather, cover, mist, audio, wind, fishing, energy, tasks, outfitter, settings, title, saver, stats: fps, fps, journal, tripStats, sun, hemi, moon, store: kv };
  window.__game.trip = trip; window.__game.veil = veil; // trip core A
  hud.veil = veil; // (the game-loop play: no action line over a veil's card, the bunk night's)
  window.__game.profile = profile; // hubs 1A
  window.__game.props = { storeLayout, onStore, storeLayouts, setStoreNotices, stats: storeStats }; // hubs 2A
  window.__game.shop = shop; // hubs 2B
  window.__game.photo = photo; // hubs 3B
  window.__game.packs = packs; // trip core B
  Object.assign(window.__game, { camp, campsites, fires, lamp }); // trip core C
  // hubs 3A: camp chores (chores.js, run by the camp): firewood stacked by the ring, the fire fed and burning down, the
  // latrine, blueberries in season, the wake-time card; its berries and firewood notices read the board's notices
  camp.chores.tasks = tasks; window.__game.chores = camp.chores;
  Object.assign(window.__game, { rides, outfitterProfile: (ep) => outfitterProfile(ep, world) }); // hubs 2C
  window.__game.npcs = npcs; // hubs 3C
  window.__game.actors = actors; // p2 A
  // fb A: one physical inventory (items.js, inventory.js): everything you own is an item in a container (the packs,
  // the barrels, the bucket, the tackle box, the pockets, the stringer) or a long item (the rod, the paddle), each
  // somewhere in the world, reachable only by you, the canoe or an outfitter's stash; packs.js runs its frame and the
  // portages on it, and containers.js draws the things right after the pose (canoe.update), so what rides on the body
  // keeps up with it. G is gone: food is eaten from the inventory (energy.js).
  inventory.attach({ player, world, profile, energy, outfitter, fishing, trip, hud, camp, shop });
  const invView = new ContainerView({ inventory, canoe, scene, player, reflectLayer: REFLECT_LAYER });
  const poseCanoe = canoe.update;
  canoe.update = (dt) => { poseCanoe(dt); invView.afterPose(); };
  fishing.hasLure = (id) => inventory.hasLure(id); // the lures (and leeches) in a container in reach now (stream G's list reads it)
  Object.assign(window.__game, { inventory, items: { ITEMS, defineItem, itemDef }, invView });
  // fb B: the inventory's face (inv-ui.js) on stream A's inventory (inv-ui's stand-in until it is in the build): the
  // book's pack side (journal.js; J, Tab between the journal and the pack, I straight to the pack), the store's
  // shelves, lure wall and map table as two panes (outfitter.js), and the icons. From the pack a lure is tied on and a
  // map sheet opens the map.
  invUI.attach({ inventory: () => window.__game.inventory || null, profile, player, energy, hud, shop, outfitter });
  journal.pack.onUse = (e, mode) => {
    const lure = shop.lureOf(e.id);
    if (lure) { if (mode === 'label') return fishing.rodUp ? 'Tie it on' : null; shop.tieOn(lure); hud.note(`Tied on: ${e.id.replace(/^lure:/, '')}.`, 3); return null; }
    if (String(e.id).startsWith('sheet:')) { if (mode === 'label') return 'Look at the map'; journal.close(); hud.setMode('sheet'); }
    return null;
  };
  window.__game.invUI = invUI;
  // content D: items in 3D (content pass 1; the owner, 2026-10-25: "more 3d versions of items so they show up in hand,
  // or on ground better"). Every loose item has a model of its own (item-models.js: one material, a geometry per model
  // and tint), and containers.js draws it in a hand, laid out in a pile at its cell, on the grate, on the stringer and in
  // the bilge while you paddle (invView.afterPose, above). Stream C's uniques lying in the world take modelFor.
  window.__game.itemModels = { modelFor, modelKeyOf, modelGeometry, keys: MODEL_KEYS };
  // fb E: world data. The landings stand at their real put-ins and the trails the first bake dropped are connected (world.js
  // applyFixes from src/world-fixes.json for the data-v3 release; a newer bake has both built in): { landings, portages, baked }
  window.__game.worldFixes = world.fixed;
  if (world.fixed) console.log(`fb E: ${world.fixed.landings} landings at their put-ins, ${world.fixed.portages} portages connected to the ${world.fixed.baked} baked`);
  // d1 lakes: what the agencies publish about each lake (lake-facts.js, src/lake-facts.json): the DNR's fish by lake
  // (fishing.js rateFor), its depth for the lakes with no contour map (the tile worker's bowlTile), wild rice by lake
  // (placement.js), and each lake's own ice-out and ice-in: the lake under you, or the nearest within 300 m, sets the
  // season's (season.js setLocalIce), looked at once a second. The weather's temperatures are NOAA's normals and the
  // water's the Kawishiwi gauge's (weather.js, season.js). window.__game.lakeFacts: the table (factsOf, fishOf, iceOf)
  const d1lakes = { t: 0, id: -1, ice: null };
  d1lakes.update = (dt) => {
    if ((d1lakes.t -= dt) > 0 || !world.facts) return;
    d1lakes.t = 1;
    let id = world.lakeIdAt(player.x, player.z);
    if (!id) {
      const ci = world.cellI(player.x), cj = world.cellJ(player.z);
      for (let r = 1, bd = Infinity; r <= 30 && !id; r++) for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
        if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
        const q = world.lakeCell(ci + di, cj + dj), d = di * di + dj * dj;
        if (q && d < bd) { bd = d; id = q; }
      }
    }
    if (!id || id === d1lakes.id) return;
    d1lakes.id = id;
    d1lakes.ice = world.facts.iceOf(id);
    if (d1lakes.ice) setLocalIce(d1lakes.ice.out, d1lakes.ice.in);
  };
  window.__game.lakeFacts = world.facts; window.__game.d1lakes = d1lakes;
  if (world.facts) console.log(`d1 lakes: ${world.facts.stats.lakes} DNR lakes on ${world.facts.stats.polygons} polygons, ${world.facts.stats.bowls} bowls from the DNR's depth`);
  window.__game.dialogue = talk; // fb F
  // hubs 2D: map sheets (sheets.js). The sheets you own gate the map's campsites, portages and soundings (hud.js; fb2 D
  // below); Sandbox shows everything. The map table sells the sheets from SHEETS and stockFor.
  sheets.attach({ world, profile, trip }); window.__game.sheets = sheets;
  // fb2 D: maps owned, not carried (sheets.js, maptable.js). A sheet bought is the profile's for the season
  // (profile.sheets(), ownSheet); the old sheet items and map cases migrate out of the inventory. M at an outfitter (in
  // its store, at its counter or its map table) shows the whole Boundary Waters with the sheets dotted over it, in the
  // wild only the sheets you own and blank paper elsewhere. The map table sells the landing's sheets over the whole map
  // (stream C's hotspot opens it: outfitter.mapTable.show; an old openShelf('map') comes here too), and the walker holds
  // still while it is up.
  sheets.attach({ outfitter, inventory });
  const mapTable = new MapTable({ hud, profile, shop, outfitter, world });
  outfitter.mapTable = mapTable;
  const openShelfD = outfitter.openShelf.bind(outfitter), updateOutfitterD = outfitter.update.bind(outfitter);
  outfitter.openShelf = (kind, landing) => (kind === 'map' && landing && mapTable.show({ ep: landing.ep, landing }) ? undefined : openShelfD(kind, landing));
  outfitter.update = (dt) => { updateOutfitterD(dt); if (mapTable.open) player.input.paused = true; };
  window.__game.mapTable = mapTable;
  // fb G: nature and fishing. The mist is in the air now (fog.js; mist.js drives it) and drifts with the wind. The rod's
  // lures are the ones you have (fishing.hasLure: stream A's inventory.hasLure, the lures in reach, once it is in; else the
  // shop's tackle box), so the shop's dimming of the lure strip goes: the strip lists only those. Berries and mushrooms in their own
  // ground and season (forage.js), picked with E into a container you can reach, or eaten as you pick.
  mist.wind = wind;
  fishing.hasLure ??= (id) => { const inv = window.__game.inventory; return inv && inv.hasLure ? inv.hasLure(id) : shop.box().has(id); }; // fb A's: in reach now
  if (shop.quietStrip) shop.quietStrip = () => {};
  const forage = new Forage({ world, player, day, tiles, scene, camp, hud, energy, audio, outfitter });
  window.__game.forage = forage;
  // the real burns: the burn's name the first time you are in it each season (burn-notes.js); the console's look at the table
  const burnNotes = new BurnNotes({ world, player, hud, profile });
  window.__game.burns = { stats: burnStats, notes: burnNotes, at: (x = player.x, z = player.z) => { const o = burnLook(x, z, {}, world.shoreAt(x, z)); return { ...o, rec: undefined, before: undefined, name: o.rec ? o.rec.name : null, year: o.rec ? o.rec.year : null }; }, events: (x = player.x, z = player.z) => { const o = [{}, {}], n = eventsAt(x, z, o); return o.slice(0, n).map((e) => ({ name: e.rec.name, kind: e.rec.kind, year: e.rec.year, doy: e.rec.doy, w: +e.w.toFixed(3) })); } };
  // camp 1: the camp redone (camp.js, tent.js, hang.js, hold.js). The tent is pitched where you choose (a ghost, green or
  // red), through its phases with E held (hold.js's ring: the footprint, the poles, the tent, the fly; let go and it
  // stops there), struck the same way; the barrel hung from a real limb; nothing struck, put out or packed when you push
  // off, and what you leave stays there; the canoe repacked by hand (packs.js: E picks up what is set out, a held E at
  // the hull loads everything there). The camp runs hold.update and hold.before; camp stream 2's fire and pot use it too.
  Object.assign(window.__game, { hold, hang: camp.hang });
  // camp 2: the fire, the food and the latrine (chores.js, fire.js, cook.js). Firewood is found lying about and picked up
  // into the arms; the fire is laid, lit, fed and put out by hand; a pot on the grate cooks for a short wait and is eaten
  // sitting on the bench; the latrine is sat on. The figure sits through the walker's move (canoe.js poseSit): the cook's
  // seat comes first, the rig is carried onto the seat before the pose and the spoon, the pot and the armloads are drawn
  // after it; the book's Use cooks a raw meal at a burning fire.
  const camp2 = camp.chores, moveOf2 = canoe.moveOf, pose2 = canoe.update, use2 = journal.pack.onUse;
  canoe.moveOf = () => camp2.move() || (moveOf2 ? moveOf2() : null);
  canoe.update = (dt) => { camp2.beforePose(); pose2(dt); camp2.afterPose(); };
  journal.pack.onUse = (e, mode, c) => camp2.cook.onUse(e, mode, c) ?? (use2 ? use2(e, mode, c) : null);
  window.__game.cook = camp2.cook;
  // fb2 A: the world side of interacting (the owner's second feedback of 2026-10-24). A quiet dot in the middle of the
  // view (pointer.js): E does what it points at within reach (pick up, talk, open, get in) and nothing else, and there
  // is no Q drop. The camp's work is done from the book (nearby.js: the fire's fuel and grate, the tent, the hang, the
  // latrine, the canoe's load, the bottle, the saw: the panels stream B draws); held work keeps hold.js (the book's
  // BookHold, E or a click). Made before the compile below, so the dot's rim has its program behind the title card.
  pointer.attach({ camera, player, scene, renderer, hud, chase, outfitter, fishing, photo, dialogue: talk, day });
  nearby.attach({ camp, packs, journal, hud, pointer, canoe, player });
  pointer.register(nearby.targets);
  pointer.register(peopleTargets(npcs)); pointer.register(forageTargets(forage, FORAGE)); pointer.register(taskTargets(tasks, KINDS));
  Object.assign(window.__game, { pointer, nearby });
  // fb2 B: the book's pack side is where you do things (the owner's second round, 2026-10-24): a container goes where its
  // strap is dragged (the back, the chest, a hand, the canoe, the ground, into another), a container in a hand shows its
  // grid, the Ground area (what lies within reach) replaces Drop, and the things near you (nearby.js: the fire ring's
  // bins, meter and buttons, the pitched tent, the latrine, the hang) are panels whose held buttons run while the mouse
  // holds them; Pitch and Hang are on the right-click menus.
  invUI.attach({ nearby: () => window.__game.nearby || null, hold });
  // wc B: the cards and the book (the owner's third round of 2026-10-24: "the whole inventory system … confusing",
  // "having to scroll to see items is a struggle"). The book is one screen for stuff (inv-ui.js MineSide): the body on
  // the left, a tab per container you carry across the top, one grid at a time, Here for what lies within reach and the
  // canoe beside you (Set everything out, Load everything here), Keeping at an outfitter; a thing dragged off the page
  // goes down at your feet; right-click lists an item's verbs, hover says what it is for; eating is instant. The fire is
  // a card (cards.js: your stuff · the fire), stream A's E at the ring opens it; its Q "Open it" on a container or a
  // pile is journal.openHere. The card ticks with the journal and holds the walker like the book does.
  invUI.attach({ audio, journal, packs: () => packs, cards });
  cards.attach({ hud, nearby: () => window.__game.nearby || null, journal, player, hold, onUse: (e, mode, c) => journal.pack.onUse(e, mode, c) });
  const updJournalB = journal.update.bind(journal), updOutfitterB = outfitter.update.bind(outfitter);
  journal.update = (dt) => { updJournalB(dt); cards.update(dt); };
  outfitter.update = (dt) => { updOutfitterB(dt); if (cards.shown) player.input.paused = true; };
  window.__game.cards = cards;
  // fb2 C: the store, the counter and the dock (outfitter.js, trip.js, props.js). Trips start and end by themselves at
  // the landings, the store's hotspots are the pointer's targets (outfitter.js registers them when pointer.js is in the
  // build), and the counter's free tap is at the counter only, not at the cork board (both are the outfitter's paper).
  energy.atCounter = () => !!outfitter.open && outfitter.tab === 'counter';
  // wc A: the world cards (the owner's third round of 2026-10-24). Whatever the dot points at has at most E and Q, both
  // on its label (pointer.js), and the camp's work is on the things themselves (nearby.js: the hung barrel's E Lower, a
  // tree's E Hang, the fire ring's E Open the fire and Q Light or Douse, the tent's E Rest until… (camp.restDial) and Q
  // Strike, the seats' E Sit, the canoe's E Get in and Q Shoulder it with "Unload it first" when loaded, the water's E
  // Fill the bottle, a down log's E Saw); the book is only for your things. The fire's card is stream B's
  // (window.__game.cards.open('fire', key), read through nearby.objects(), reduced to the fire and the piles), a
  // container or a pile on the ground opens the book's Here tab (journal.openHere), and sitting is stream C's
  // (player.sitAt / stand / seated); each is looked up when it is wanted, with a fallback until it lands. Eating is
  // instant (cook.js). The book's Canoe tab calls packs.setOutAll and packs.loadAll.
  nearby.world({ cards: () => window.__game.cards || null, journal, sitter: () => (typeof player.sitAt === 'function' && typeof player.stand === 'function' ? player : null) });
  // wc C: sitting and shore fishing (the owner, 2026-10-24: "why can't I put the fishing rod in my hand and fish with it
  // outside of canoe", "letting myself sit in the bench would be a nice interaction", and no sitting down to eat).
  // player.sitAt / stand (player.js) sit you on a bench, a log seat or the latrine (props.js c.layout.seats and a store's
  // porch bench; stream A's E Sit calls them), E or any move key stands you up, and canoe.js's sit no longer eats. With
  // the rod in a hand (inventory.rodInHand) F fishes from the shore, a dock or a rock with the canoe's keys and card
  // (fishing.js on foot; the standing figure holds the rod, canoe.js rodArms); a kept fish goes on the stringer when the
  // canoe is in reach, else into a container you carry.
  fishing.inventory = inventory; fishing.indoors = () => !!(outfitter.visit && outfitter.visit.inside);
  // wc D: the world cards (the owner's third round of 2026-10-24): no permit and no stamp at the counter (outfitter.js,
  // trip.js: the season is just the season); a notice's place on the map is the keeper's red pencil (tasks.hints →
  // targetOf, hud.js drawMap pencilRing: tight and named round a known campsite, else the bay or arm the notice
  // describes, never the whole lake); every item says what it is for and lists its right-click verbs (items.js words
  // and verbs, which the book's tooltips and menus read). Nothing to wire: the verbs' table and lookup for the console.
  Object.assign(window.__game.items, { VERBS, verbsOf });
  // fb3 A: the canoe and movement (the owner's feedback of 2026-10-25). Nothing moves by itself (packs.js: no auto-stow
  // when the canoe goes down, no auto-load when you push off, only the lashed paddle, rod and stringer ride in it when
  // it goes overhead); a portage landing is a landing like any other (player.js: you step out with the canoe beached, Q
  // on the hull shoulders it); E Get in only where the hull floats, else "Push it off first"; Q on a loaded hull reads
  // "Unload it first" and opens the book with the canoe on the right (journal.openHere('canoe'), stream C's ref); the
  // dot's rim parks when the dot goes off (pointer.js); on foot off a trail, outside a camp and a yard, the walker is
  // time-lapsed like the trail (pace.js foot, 1.8 at Trip); sitting keeps the camera's distance (camera.js); the
  // headlamp works by day (headlamp.js).
  packs.openCanoe = () => (typeof journal.openHere === 'function' ? journal.openHere('canoe') : false);
  // fb5 C: one clock (decision 3 of the owner's third round of 2026-10-25), and one speed (2026-10-26, multiplayer
  // planned): the game clock runs at one rate everywhere and for everyone (pace.js CLOCK, 8: trip.update sets day.rate),
  // on the water, on a trail, on foot, in camp, idle and in a store alike; no key changes it. The canoe's and the
  // walker's time-lapse (player.boost) is only how they are seen to move, to each activity's speed (pace.js). The
  // walker's lapsing counts as travelling inside trip.travelling. The Rest dial and sleeping are the only time skips.
  window.__game.pace = PACE;
  // fb4 A: the shore and the figure (the owner's second round of 2026-10-25). A hull nosed in or lying on the bank is
  // beached: E is held, "Push it off" (packs.js beginPush: you walk it out until both ends float and stand beside it in
  // the shallows; a tap moves nothing); afloat, E "Get in" puts you in it where it floats and as it faces (player.launch
  // in place), and what you wear goes into the hull with one note; nothing comes back out when you step out. Greyed
  // verbs carry decision 2's why, needs and next (packs.js, nearby.js, pointer.js). The figure keeps its head in any
  // view not at the eye (canoe.js: the pause card, the title, a close-up), however the camera was set.
  canoe.viewer = camera;
  // fb3 B: items and their uses (the owner's 2026-10-25 round). Every item says what it does in numbers (items.js
  // stats, which the book's tooltip draws), with the effect real in code: the sleeping bag is the night's rest
  // (energy.sleep), the tarp keeps the rain off the ring or a pack (chores.js), the clothes change after a soaking
  // (energy.changeClothes), a tablet goes in per fill (energy.fill → inventory.useOne), food is eaten a serving at a time
  // (inventory.eat) and the bottle is an item in the pockets with Drink on it: nothing is drunk for you (energy.drink).
  // A meal cooks only with the pot on the grate, a fish on a stick without it (cook.js); a landed fish goes to your hand,
  // "Put on the stringer" is its verb while the stringer is in reach, and the bobber rig takes a leech from the bucket
  // per bite (fishing.js). The inventory's verbs (inventory.verb) answer the book's right-click for hand, stringer,
  // drink, change and tarp; the tarp's needs the chores.
  inventory.chores = camp.chores;
  shop.useLeech = () => {}; // the leech goes at the bite (fishing.js takeLeech): the shop's per-catch and per-snap takes step aside
  const updShopB = shop.update.bind(shop); // the shop's word when the rig can't be tied on, in the strip's terms when you own the bait
  shop.update = () => { updShopB(); const m = fishing.message; if (m && /^No leeches in reach/.test(m.text) && fishing.ownsBait && fishing.ownsBait()) m.text = 'Needs leeches: the bucket in a hand, within a step, or in the canoe'; };
  window.__game.GULP = GULP;
  // fb3 C: the book, the cards, the HUD and the title (the owner's feedback of 2026-10-25). The readout (Tab) is the
  // moment only (the sun, the wind, the sky, the way) and reads the weather for its Sky row; the strip over the paper
  // (hud.js updateStrip: the energy bar, the clock and the day) stands over the book, every card and the Rest dial
  // (camp.dialOpen, which the paper register does not know); the fire card's left pane lists what is in reach as tabs
  // (cards.js); journal.openHere('canoe') opens the book with the canoe lit on the right (stream A's Q on a loaded hull).
  const hudUpdateC = hud.update.bind(hud);
  hud.update = (c) => hudUpdateC(c && !c.weather ? { ...c, weather } : c);
  hud.stripAlso = () => !!camp.dialOpen;
  // fb4 E: the tarp and the chores' checklists (the owner's second round of 2026-10-25). The tarp is pitched like the tent
  // (tarp.js): on a ridge line between two trees 3–7 m apart, or a tree and two poles, or four poles, the poles found lying
  // about or cut from a down log with the saw (chores.js); right-click Pitch the tarp shows it as a ghost where you stand
  // and E held pitches it, or says what is missing; Q at it takes it down. What lies under its sheet stays dry
  // (tarp.covers). Every chore's blocked action carries its checklist (decision 2: why, needs, next): the tent's steps
  // (tent.js withTentNeeds, pitchNeeds), the hang's (hang.hangNeeds), the down log's Saw and Cut a pole
  // (chores.downLogTarget), the latrine's (chores.latrineNeeds), the evening's wood (chores.nightWood). Stream A's nearby.js
  // reads these itself; the wraps below fill in only what its targets do not carry yet.
  const tarp = camp.chores.tarp;
  window.__game.tarp = tarp;
  pointer.register(tarp.targets); // a pitched rig (E Carry on pitching · Q Take it down, held), a loose pole (E Pick up)
  const armedE = pointer.isArmed, cancelE = pointer.onCancel; // the armed tarp takes E and a click; Esc or a right-click lets it go
  pointer.isArmed = () => !!tarp.armed || !!(armedE && armedE());
  pointer.onCancel = (why) => tarp.disarm('You leave the tarp in its bag.') || (cancelE ? cancelE(why) : false);
  const beginPitchE = camp.beginPitch.bind(camp), armHangE = camp.hang.arm.bind(camp.hang);
  camp.beginPitch = (uid) => { tarp.disarm(); return beginPitchE(uid); };
  camp.hang.arm = (cId) => { tarp.disarm(); return armHangE(cId); };
  // fb5 D: the tarp, pitched anywhere (the owner's third round of 2026-10-25: "let them pitch it no matter what … there
  // should be some icon at the bottom saying its missing x number of poles"). Pitch the tarp is always on, ashore, with
  // no checklist; its ghost follows you (tarp.js), green where it can stand (E or a click, held, pitches it) and red where
  // it can't, the bottom chip (chip.js) saying what is missing: "pole ×2", "a tree or pole ×2", "Too near the water".
  // While it is red the dot is yours (pick up a pole): the pointer is armed only while it is green, and tarp.js's own
  // listeners take Esc and a right-click then. The chip is anyone's: hud.chip(text, icon) / hud.chip(null), and
  // window.__game.chip for an owner of its own (chip.set(key, …) / chip.clear(key)).
  const armedD = pointer.isArmed;
  pointer.isArmed = () => (tarp.armed && !tarp.armed.ok ? !!(armedE && armedE()) : armedD());
  if (typeof hud.chip !== 'function') hud.chip = (text, icon = null) => chip.set('hud', text, icon);
  if (!('chipShown' in hud)) Object.defineProperty(hud, 'chipShown', { get: () => chip.shown });
  window.__game.chip = chip;
  const tentActionsE = camp.tentActions.bind(camp);
  camp.tentActions = () => withTentNeeds(camp, tentActionsE());
  camp.pitchNeeds = (tent) => pitchNeeds(camp, tent);
  const pointTargetsE = nearby.pointTargets.bind(nearby);
  nearby.pointTargets = (ray, near) => camp.chores.decorateTargets(pointTargetsE(ray, near), ray, near);
  const itemActionsE = nearby.itemActions.bind(nearby);
  nearby.itemActions = (ref) => {
    const out = itemActionsE(ref);
    for (const a of out) {
      if (a.needs) continue;
      if (a.id === 'hang' && ref && ref.container) Object.assign(a, camp.hang.hangNeeds(ref.container), { why: a.why });
      else if (a.id === 'pitch' && ref && ref.uid != null) { const n = camp.pitchNeeds(camp.tentByUid(ref.uid)); Object.assign(a, { needs: n.needs, next: n.next }); }
    }
    return out;
  };
  // fb4 C: needs and statuses (the owner's second round of 2026-10-25: "if I can't use something, I want to know exactly
  // why I can't use it … some sort of checklist or timer or quantity out of total", and "things that have statuses like
  // wet clothes … you need to know"). Every greyed verb carries why with its needs and next (items.js check), and
  // inventory.status(ref) gives each item's state (wet, drying, treating, cooking, burning, hot, low, empty, ready) for
  // the book to draw. Wood is wet piece by piece (inventory.syncWet: the rain on an open ring, a pile or an armload; dry
  // by a lit fire in 30 min, 3 h in dry air). The fire's own checks moved into chores.js and fire.js (fb5 A, below).
  window.__game.needs = { timerWords: (s) => inventory.timerWords(s), status: (r) => inventory.status(r), verb: (id, r) => inventory.verb(id, r) }; // for the console and the tests
  // fb5 A: the fire made simple (the owner's third round of 2026-10-25: "fire ring got too complex … it should just light
  // when enough fuel is added automatically. cooking is automatic when you put something over a active fire, no extra
  // button. douse is a extra button", "why cant i burn a pole?", "it should only show whats missing"). The ring lights
  // itself the moment its fuel holds a dry branch and three dry pieces in all, with a match struck, a flare and the catch
  // (chores.js catchFire, fire.js flare); a dry piece on hot coals brings it back; a pole burns like a log. What sits on
  // the grate over a lit fire cooks by itself, the pot drawing its water from the bottle (cook.js autoCook), and is
  // marked Ready on the grate (cook.grateStatus, through inventory.status: "needs the pot", "water 0.3 L", Ready). The
  // card and the dot show only what is missing (chores.fireNeed / fireNeeds: "Gather wood", "a dry branch", "🪵 ×2 more",
  // "Wet wood won’t catch"); lit, only the burn bar. The fire's events for stream E's moments: fires.on('lit' | 'low' |
  // 'coals' | 'out' | 'cooking' | 'ready' | 'wet', fn), or the fires.events queue. A match struck while the card or the book
  // covers the view flares when the paper lifts (fires.veiled).
  {
    const ch5 = camp.chores, ck5 = ch5.cook;
    fires.veiled = () => !!(cards.shown || journal.open);
    const statusA = inventory.entryStatus.bind(inventory);
    inventory.entryStatus = (c, e) => (c && (c.item === 'grate' || isPot(c.item)) && typeof ck5.grateStatus === 'function' ? ck5.grateStatus(c, e) : c && c.item === 'firefuel' && typeof ch5.fuelStatus === 'function' ? ch5.fuelStatus(c, e) : statusA(c, e)); // (the fire's own, lean: a state word and a missing chip, no timers; crafting: what is in a pot too)
    window.__game.fire = { need: (k) => ch5.fireNeed(k), needs: (k) => ch5.fireNeeds(k), on: (n, fn) => fires.on(n, fn), events: fires.events }; // for the console, the tests and stream E
  }
  // fb4 B: the book (the owner's second round of 2026-10-25). I opens and closes it (Pack and Journal are tabs on its
  // edge; J, L, Tab and Ctrl-click are gone, R turns a thing only while it is dragged); its right pane is a tab per thing
  // within reach (the canoe, each container on the ground, Wood, The ground), and a card's left pane is the body and
  // all the tabs; a greyed verb or button draws its checklist and next step (inv-ui.js needsHtml, decision 2) and a
  // thing's state its mark and tooltip line (inventory.status, stream C), their timers counted down with this clock.
  invUI.attach({ day });
  // fb5 B: the items' words (the owner's third round of 2026-10-25: "only whats relevant … The item doesn't say what it
  // can be used for"). Every item is the one schema (items.js: identity, onYou, uses or servings, kg; the tooltip draws
  // name, identity, state, on you, uses, weight and nothing else), a state is a word, a hint and a timer (inventory.js),
  // and a greyed verb shows its why and the first thing missing as a chip (items.js chipOf, inv-ui.js whyHtml), which
  // the fire card and the dot read too. Nothing to wire: the chip's words for the console and the tests.
  Object.assign(window.__game.items, { chipOf, missingOf });
  // fb4 D: the keys, the hints, the pace toast and the bobber (the owner's second round of 2026-10-25). The keys are the
  // round's set (title.js KEYMAP; the bindings above: R and N gone, dialogue.js's T gone, fishing.js's K now E keep and
  // Q let go). Onboarding hints, once a season each, and a toast whenever the pace changes (hints.js), run after the
  // barks each frame. The bobber: fishing.js lists the bobber rig while you own bait anywhere ("needs leeches" when
  // none is in reach) and ties it on, and the shop's check of what is in the tackle box took it off again in the same
  // frame, four times a second: the bobber flashed at the tip and the strip and the prompt flashed with it. The shop's
  // box now counts the rig while the bait is owned, so one writer decides what is tied on (fishing.js), and the leeches'
  // reach is steadied there.
  const boxD = shop.box.bind(shop);
  shop.box = () => { const b = boxD(); if (typeof fishing.ownsBait === 'function' && fishing.ownsBait()) b.add('leech'); return b; };
  // a landed fish's Q (let it go) is the rod's: the trail head's Q fetch (packs.js) waits while a fish is held up
  const packsUpdD = packs.update.bind(packs);
  packs.update = (dt) => { if (!fishing.landed || !input.once.has('KeyQ')) { packsUpdD(dt); return; } input.once.delete('KeyQ'); packsUpdD(dt); input.once.add('KeyQ'); };
  const hints = new Hints({ player, hud, day, profile, pointer, outfitter, inventory, lamp, chase, title, talk, camp, photo, veil, settings, fishing });
  const talkUpdD = talk.update.bind(talk);
  talk.update = (dt, shell) => { talkUpdD(dt, shell); hints.update(dt, shell); };
  window.__game.hints = hints;
  // fb5 E: teaching moments (the owner's third round of 2026-10-25: "how do they even know to get to a campsite? … These
  // like one-time things … you're starting to get hungry … the fire went out, but there's still hot coals … It's learned
  // behavior"). hints.js is the moments system: each situation is taught the first time it matters, in one line with its
  // key, then in a word or not at all, one line on the screen at a time, kept in the season. The camp's evening and
  // headlamp words (camp.notes) and the bar's need words (energy.cue) are moments now; a greyed verb's next step is taught
  // the first time its key is pressed (pointer.teach), its why after; the dot's line is the verb, the target and one
  // missing chip (pointer.js chipFor); the fire's events (stream A's fires.on) and the tarp's red ghost (stream D's
  // tarp.on) are read when they are there; the pace toast speaks stream C's plain names (pace.describe).
  hints.attach({ energy, weather, trip, fires, cards, packs, nearby, world, tarp });
  energy.onCue = (id) => hints.handles(id);
  pointer.teach = (id, text, o) => hints.next(id, text, o);
  // content C: gear, upgrades and unique items (content pass 1, 2026-10-25: "item upgrades, different unique items, varied
  // items"). items.js has the defs (the bags, pads, rods, lamps, the stove and fuel, the jacket and the head net, the chair,
  // coffee and cocoa, the net, the knife and the fillets, three lures, a waterproof pack, more food, the uniques),
  // shop.js the shelves (stocked by outfitter kind), gear-icons.js their pictures. kit.js is what they do with you, read
  // by the systems they touch: energy (the bag's night, the jacket, the toque, the bugs, the chair, the lamp after dark),
  // fishing (the cap, the reel, the net at the side, the graphite rod's strike), trip (a capsize with the bag in a dry
  // pack), camp (the filter at the water's edge); the stove, a cup, the knife and the chair are verbs in the book.
  // uniques.js lays six finds out at real places with forage's glint: four E on the dot picks up, and two pieces of
  // history (an old axe head, a trade-silver brooch: the owner, "finds you leave where they lie and report to the ranger
  // at a counter") that E or a photo notes where they lie, the journal keeps, and a counter's "Report a find" passes to
  // the Forest Service for a reward and the keepers' goodwill; stream B's keepers give three more (uniques.give).
  kit.attach({ player, inventory, energy, fishing, camp, fires, day, weather, wind, hud, profile, lamp, shop, world, uniques, canoe, scene });
  energy.kit = kit; fishing.kit = kit; trip.kit = kit; shop.kit = kit;
  uniques.attach({ world, scene, player, inventory, profile, hud, camp, day, pointer, audio, tasks }); // (content join: tasks.peek names a far site's lake)
  const shopUpdC = shop.update.bind(shop);
  shop.update = () => { shopUpdC(); kit.update(); uniques.update(); };
  const fillC = camp.fillBottle.bind(camp);
  camp.fillBottle = (how) => kit.fillBottle(fillC, how); // crafting (2026-10-31): E lake water as it comes; Q 'filter' the pump at once, the gravity bag in a few minutes
  camp.filterWait = () => kit.filterWait();
  const verbC = inventory.verb.bind(inventory);
  inventory.verb = (id, ref) => kit.verb(id, ref) || verbC(id, ref); // Cook on it, Brew a cup, Fillet the catch, Sit in it
  const raiseC = profile.raise.bind(profile);
  profile.raise = (ep, d = 1) => raiseC(ep, d > 0 ? d * uniques.goodwill() : d); // both finds reported: word gets round the counters
  const claimsC = outfitter.claimsSection.bind(outfitter), actC = outfitter.act.bind(outfitter);
  outfitter.claimsSection = (a) => claimsC(a) + uniques.counterSection(); // "Report a find: an old axe head"
  outfitter.act = (act, id, ev) => {
    if (act !== 'report') return actC(act, id, ev);
    const r = uniques.report(id, outfitter.at && outfitter.at.ep);
    if (r.ok) outfitter.greeting = r.words;
    outfitter.receipt = { text: r.ok ? `Reported to the Forest Service: +$10${r.both ? ' · the counters think well of you' : ''}` : r.words, ok: r.ok };
    outfitter.save(); outfitter.render();
    return r;
  };
  journal.notes = () => uniques.journalNotes(); // a find noted, till it is reported: an entry on the journal's Tasks page
  const captureC = photo.capture.bind(photo);
  photo.capture = () => { const rec = captureC(); try { uniques.fromPhoto(photo); } catch (e) { console.warn('uniques.fromPhoto', e); } return rec; }; // a photo of an old thing notes it
  const taskHintsC = tasks.hints.bind(tasks);
  tasks.hints = () => [...taskHintsC(), ...uniques.mapMarks()]; // Arvid's site, in the map's pencil
  const onUseC = journal.pack.onUse;
  journal.pack.onUse = (e, mode, c) => {
    if (e && e.id === 'guidemap') {
      if (mode === 'label') return 'Look at the map';
      const g = uniques.guideSite();
      // (tuning, the content join's leftover: Arvid's map is an old Fisher sheet, so it is that sheet: it opened on blank paper
      // unless you owned the sheet its site lies on)
      const s = g ? sheetAt(g.x, g.z) : null; if (s && !sheets.owned(s.id)) profile.ownSheet(s.id);
      journal.close(); hud.setMode('sheet'); if (g && hud.view) { hud.view.cx = g.x; hud.view.cz = g.z; } return null;
    }
    return onUseC ? onUseC(e, mode, c) : null;
  };
  const kitMoments = new Map([...kit.moments(), ...uniques.moments()].map((m) => [m.id, m]));
  for (const m of kitMoments.values()) if (!MOMENTS.some((q) => q.id === m.id)) { const { due, ...rest } = m; void due; MOMENTS.push(rest); }
  const dueC = hints.due.bind(hints);
  hints.due = (id, rec) => (kitMoments.has(id) ? kitMoments.get(id).due(rec) : dueC(id, rec)); // the bugs, a fish at the side, a cold night, the fish remains, an old thing
  Object.assign(window.__game, { kit, uniques });
  // content A: more kinds of notice for the boards (task-kinds.js, the owner's content pass of 2026-10-25: "more varied
  // tasks"): a blowdown across a portage sawn clear, litter packed out of a campsite, a Secchi reading at a lake's deep
  // spot, the midsummer loon count, a route report, a rental canoe left behind, fish for the shore lunch class. Their
  // things on the trail and the sites are on the dot (pointer), a blowdown is solid to the walker (tiles.dynamic), and
  // the first time each new action matters it is a moment (hints).
  attachTaskKinds({ tasks, pointer, hints, inventory, chores: camp.chores, tiles, camera, loons, wind, weather, hud, player });
  // content B: conversations (the owner's content pass of 2026-10-25: "npc convos"). The keepers are people: a past, things
  // to talk about that open over the season, an arc of three or four beats with a payoff (a discount at their counter, a
  // site nobody knows pencilled on the map, or one of stream C's one-of-a-kind things), the week's word from their own
  // country (real lakes, sites and portages, pencilled), advice in their words, and a memory of your trips, catches and
  // jobs (npcs.js, talk-*.js). Four more kinds of visitor. Nothing is said twice in a visit.
  npcs.attach({ trip, fishing, loons, inventory, uniques: () => window.__game.uniques || null });
  { const pm = shop.priceMul.bind(shop); shop.priceMul = (ep) => pm(ep) * npcs.dealAt(ep); } // an arc's discount at its own counter
  // cons B: wind-bound days (the owner's consequences pass, 2026-10-25). The wind's daily shape is the forecast's own
  // (weather.js WIND_DAY: a still dawn, a breeze building to the afternoon, some days a blow from dawn to dusk behind a
  // front); the waves build with the fetch and a lee shore lies calm (water.js LEE); in a blow the sea comes aboard,
  // the water in the hull slows it and swamped it goes over, Q held still bails, a landing tips it out (player.js SEA,
  // hullwater.js buildBilge). Two first-time moments: the first whitecaps, the first water aboard.
  player.day = day; // (the sea's game minutes run on the day's clock: none behind the pause card)
  {
    const sea = new Map([...seaMoments(player, day), ...creekMoments(player)].map((m) => [m.id, m])); // (and the wetlands round's low creek)
    for (const m of sea.values()) if (!MOMENTS.some((q) => q.id === m.id)) { const { due, ...rest } = m; void due; MOMENTS.push(rest); }
    const dueB = hints.due.bind(hints);
    hints.due = (id, rec) => (sea.has(id) ? sea.get(id).due(rec) : dueB(id, rec));
  }
  // cons A: a bear at camp (the consequences pass, the owner, 2026-10-25: "a bear at camp if the food isn't hung … so the
  // camp routines matter"). bear.js: at night food not hung (hang.js secured) may bring a bear, a few in a hundred a night (BEAR.chance) times
  // the lake's bear activity, softened the first night ever; heard first, its eyes in the headlamp if you are up (E Make
  // noise on the dot drives it off for less), and in the morning the barrel knocked over in the brush or the pack torn
  // open, a third to a half of what was out gone, never the whole season. The camp asks it at bedtime and at waking; its
  // frame runs after the camp's, its knocked barrel and torn pack are posed after containers.js; two moments.
  bear.attach({ camp, inventory, world, tiles, player, day, scene, audio, hud, lamp, outfitter, profile, invView, chase, camera });
  camp.bear = bear; pointer.register(bear.targets);
  { const campUpdA = camp.update.bind(camp), poseA = canoe.update; camp.update = (dt) => { campUpdA(dt); bear.update(dt); }; canoe.update = (dt) => { poseA(dt); bear.afterPose(); }; }
  for (const m of bear.moments()) if (!MOMENTS.some((q) => q.id === m.id)) { const { due, ...rest } = m; void due; MOMENTS.push(rest); }
  { const dueA = hints.due.bind(hints); hints.due = (id, rec) => bear.due(id, rec, dueA); } // the bear's two, and "Bears: hang…" steps aside the evening after a visit
  window.__game.bear = bear;
  // cons C: bugs at dusk (the consequences pass; the owner, 2026-10-25: "a bear at camp if the food isn't hung, wind-bound
  // days, and bugs at dusk, so the camp routines matter"). bugs.js: blackflies by day in late May and June, mosquitoes at
  // dusk and dawn from June to August (a few in September), by the season, the hour, the air, the wind where you stand and
  // the site (worst in the woods by still water, light on a breezy point). The world shows them first: the whine
  // (audio-beds.js, through audio.bugs), specks round the head and the walker's swat (after the pose); then the small cost
  // (energy.js bugMods) and a worse night in a tent left open or under the stars (energy.sleep, then the morning's line).
  // The counters: the head net or a bug jacket (content C's kit), a smoky fire near, the wind, and the tent closed (tent.js).
  bugs.attach({ player, day, weather, wind, world, energy, camp, fires, kit, canoe, scene, audio, inventory });
  energy.bugs = bugs; audio.bugs = () => bugs.whine;
  { const upd = shop.update; shop.update = () => { upd(); bugs.update(); }; } // after the kit's look at what is with you, before energy
  { const pose = canoe.update; canoe.update = (dt) => { pose(dt); bugs.afterPose(dt); }; } // the swat, over the pose
  { const wake = camp.wake.bind(camp); camp.wake = () => { wake(); const w = bugs.morning(); if (w) camp.morningNote = camp.morningNote ? `${camp.morningNote} ${w}` : w; }; }
  const bugMoments = new Map(bugs.moments().map((m) => [m.id, m]));
  for (const m of bugMoments.values()) if (!MOMENTS.some((q) => q.id === m.id)) { const { due, ...rest } = m; void due; MOMENTS.push(rest); }
  { const due = hints.due.bind(hints); hints.due = (id, rec) => (bugMoments.has(id) ? bugMoments.get(id).due(rec) : due(id, rec)); } // the mosquitoes, the blackflies
  window.__game.bugs = bugs;
  // taste (the owner's call, 2026-10-26): casts land in a wind, carried by it, and only whitecaps where you cast blow
  // them back; a cast blown back says so on the action line every time, and the first time a moment says why
  // (fishing.js CAST_WIND, fishing.moments)
  {
    const cast = new Map(fishing.moments().map((m) => [m.id, m]));
    for (const m of cast.values()) if (!MOMENTS.some((q) => q.id === m.id)) { const { due, ...rest } = m; void due; MOMENTS.push(rest); }
    const dueT = hints.due.bind(hints);
    hints.due = (id, rec) => (cast.has(id) ? cast.get(id).due(rec) : dueT(id, rec));
  }
  // round A-B: the map filling in (the owner, 2026-10-26: "The map filling in"). explored.js keeps, per season, the
  // lakes paddled (a bitset), your way (a point every 50 m), the portages walked end to end and the sites slept at; the
  // map (hud.js drawMap) inks the lakes a deeper blue with a dark shore, pencils the way, goes over the portages solid
  // and ticks the sites, an overlay on the sheets you own, cached per sheet and per tile. Read each frame after the
  // sheets' own look; a night at a site is counted when the camp wakes from it (not a nap).
  explored.attach({ world, profile, trip, camp });
  { const su = sheets.update.bind(sheets); sheets.update = (p) => { su(p); explored.update(p); }; }
  { const wakeB = camp.wake.bind(camp); camp.wake = () => { const n = camp.night, c = camp.camp; wakeB(); if (n && !n.nap) explored.stay(c && c.site ? c.site : { x: n.x, z: n.z }); }; }
  window.__game.explored = explored;
  // round A-A: a sense of progress (the owner, 2026-10-26: "A sense of progress"). record.js: when a trip ends (at an
  // outfitter's landing, or brought in) its card comes up once you are free, a logbook page (the days, the lakes, the
  // portages and their rods, the nights and where, the fish, what you saw, the photos, the notices, the money, and one
  // line of the trip in words), and goes into the season's record: the journal's Record tab (in the Trips tab's place).
  // Nothing on the HUD. The card replaces the "Came in at …" note; a counter waiting to open waits for it; it holds the
  // walker like the book; one moment the first time one is put away.
  {
    record.attach({ trip, stats: tripStats, fishing, fauna, bear, photo, tasks, npcs, profile, world, player, day, camera, hud, title, veil, outfitter, talk, camp, sheets, journal });
    journal.record = record;
    const updJ = journal.update.bind(journal);
    journal.update = (dt) => { updJ(dt); record.update(dt); }; // (each frame in the game, after the trip, in real seconds)
    const updO = outfitter.update.bind(outfitter);
    outfitter.update = (dt) => { record.beforeOutfitter(outfitter); updO(dt); if (record.shown) player.input.paused = true; };
    const comeInA = outfitter.comeIn.bind(outfitter);
    outfitter.comeIn = (l) => { const note = hud.note; hud.note = (t, ...r) => (/^Came in at /.test(String(t)) ? undefined : note.call(hud, t, ...r)); try { return comeInA(l); } finally { hud.note = note; } };
    for (const m of record.moments()) if (!MOMENTS.some((q) => q.id === m.id)) { const { due, ...rest } = m; void due; MOMENTS.push(rest); }
    const recM = new Map(record.moments().map((m) => [m.id, m]));
    const dueAA = hints.due.bind(hints);
    hints.due = (id, rec) => (recM.has(id) ? recM.get(id).due(rec) : dueAA(id, rec)); // "Your trip is in the journal's Record"
    window.__game.record = record;
  }
  // round A-D: saves (save.js slots, seasons.js). Three seasons side by side: the one being played is the ordinary season
  // keys every module reads and writes (the autosave, pagehide and all, writes there), the other two are parked and
  // packed. A switch, a new season into a slot, deleting the one being played and an import over an empty one reload the
  // page, and save.js mounts the slot before anything reads. The title's Continue is the slot last played; Seasons
  // (under New season) lists the three with their lines: Play, New, Copy, Export (a versioned .json) and Import, Delete
  // asked once. What the last page asked of this load (Play: straight in; New: the season begun at its home) runs once
  // the frames do.
  window.__game.slots = slots;
  const bootAsk = slots.takeBoot(); // (run once the game-loop modules below are attached: see the animation loop's start)
  // round A-F: wilderness people, phase 1, the camps (the owner, 2026-10-26: "wilderness people"; the people plan,
  // docs/plans/people.md). parties.js: the other parties out there, a pure function of the entry points' real quotas,
  // the season's fill, the weekday and the Traffic setting, seeded by the season and never saved; each night at a
  // site, first come, never yours, held in the campsite registry within 6.5 km of you (so a site reads Taken and the
  // dusk note's free site stays free tonight). party-camps.js draws the near ones: their canoes, tents, woodpile, the
  // fire by evening and two or three of them from npcs.js's pool within 60 m, a greeting by day. After the camp's frame.
  const parties = new Parties({ world, profile, day });
  parties.attach({ registry: campsites, camp, player, camera, settings, inventory, fires });
  const partyCamps = new PartyCamps({ world, scene, tiles, fires, parties, people: npcs, player, day, camp, weather, wind });
  npcs.extra = () => partyCamps.extras(); npcs.partyWord = (v, fig) => partyCamps.word(v, fig);
  { const campUpdF = camp.update.bind(camp); camp.update = (dt) => { campUpdF(dt); parties.update(dt); partyCamps.update(dt); }; }
  // a party's greeting carries over the water (their speakers' hear: dialogue.js keeps a bark to 22 m of its speaker)
  { const distF = talk.distTo.bind(talk); talk.distTo = (sp) => { const d = distF(sp); return sp && sp.hear ? (d * 22) / sp.hear : d; }; }
  Object.assign(window.__game, { parties, partyCamps });
  { const warm = () => { try { parties.block(parties.today); partyCamps.warm(); } catch (e) { console.warn('parties', e); } }; if (window.requestIdleCallback) requestIdleCallback(warm, { timeout: 3000 }); else setTimeout(warm, 500); } // the week's sweep and the camps' pieces, behind the title
  // p2 C: the parties on the move (people phase 2; the owner, 2026-10-26: "move onto moving parties"). parties.js plans
  // each one's travel day (legPlan: off their site at the leave hour, the water and the carries, lunch, in at the next
  // site at its land hour, the same on every reload); party-moves.js follows the legs within 1.5 km of you and draws
  // them through the actor layer (its ranges and budgets). On the water a word by day within 80 m, a soft steer off you
  // inside 25 m, E on a canoe within 4 m (the dot, from the canoe too) a word about their trip; on a portage the loaded
  // carry has the trail (they wait at the landing while you carry, stop if you stand on the tread, step aside for you
  // loaded) and a moment teaches it once. Run just before the actors' own update (after the camera); party-camps.js
  // hands their camp over as they land and push off.
  const moves = new PartyMoves({ world, parties, actors, tiles, player, day, camera, people: npcs, dialogue: talk, partyCamps });
  partyCamps.moves = moves;
  if (actorPool) actorPool.free = () => npcs.bodies.filter((b) => !b.who && !b.lent).length; // (what the people leave free: the actors' budget)
  { const upd = actors.update.bind(actors); actors.update = (dt, ...a) => { try { moves.update(dt); } catch (e) { if (!moves.warned) { moves.warned = true; console.warn('party-moves', e); } } upd(dt, ...a); }; }
  pointer.register(partyTargets(moves)); pointer.registerWater(partyTargets(moves));
  {
    const pm = new Map(moves.moments().map((m) => [m.id, m]));
    for (const m of pm.values()) if (!MOMENTS.some((q) => q.id === m.id)) { const { due, ...rest } = m; void due; MOMENTS.push(rest); }
    const dueP = hints.due.bind(hints);
    hints.due = (id, rec) => (pm.has(id) ? pm.get(id).due(rec) : dueP(id, rec));
  }
  window.__game.moves = moves;
  // co-op phase 1 (coop.js, docs/plans/coop.md): friends in their own browsers on one lake in Sandbox, drawn with the
  // actor layer, the host's clock everyone's. Their poses are set just before the actors' own update (after the camera),
  // their names placed after it. Invite friends on the pause card, Join a trip on the title (or a ?join=CODE link).
  const coop = new Coop({ player, canoe, actors, day, title, trip, outfitter, profile, packs, hud, camera, world, saver, story }); // (k1a: story, for the guest's mirror mode)
  { const upd = actors.update.bind(actors); actors.update = (dt, ...a) => { try { coop.update(dt); } catch (e) { if (!coop.warned) { coop.warned = true; console.warn('coop', e); } } upd(dt, ...a); try { coop.labels(); } catch { /* the names only */ } }; }
  coop.fromUrl();
  window.__game.coop = coop;
  coop.g.more = (m) => Object.assign(coop.g, m); // phase 2: the camp modules (chores, tarp, forage, fires, energy, …)
  coop.g.more({ inventory, fires, camp, chores: camp.chores, tarp, forage, energy, shop, tiles, scene, registry: campsites, hold });
  window.__game.coopGive = new CoopGive(coop, { pointer, talk }); // (stream B: Give money on the dot, Give to … in the book)
  window.__game.coopShare = new CoopShare(coop); // phase 2 stream A: the shared world things (coop-share.js)
  window.__game.coopBoat = new CoopBoat(coop); // phase 3 round 3: either canoe, either player (coop-boat.js)
  coop.g.more({ rides, tasks, veil, fishing, stats: tripStats });
  window.__game.coopTrip = new CoopTrip(coop); // phase 3 stream C: Adventure in co-op (coop-trip.js): the group's trip, boards, rides
  coop.g.more({ packs });
  window.__game.coopNight = new CoopNight(coop); // phase 3 stream A: the night together, one wake time (coop-night.js)
  window.__game.coopSky = new CoopSky(coop, { wind, weather }); // phase 3 stream B: the host's wind and weather seed (coop-sky.js)
  window.__game.coopParties = new CoopParties(coop, { parties }); // co-op round 2: the same parties at the same sites on every screen
  window.__game.coopAnim = new CoopAnim(coop, { fishing, photo }); // phase 3 stream B: a friend’s jump, seat, crouch and rod; round 2: moves, hands, arms, line (coop-anim.js)
  // water: two rules (the owner, 2026-10-26: "shoudlt it require some water for mthe deharated meals and oatmeal" and "if
  // i fill water up without a tablet, it is instantly clean even tho warnign says its not"). Every dried meal and a cup
  // take their water from the bottle (cook.js COOK, kit.js), short of it the "water 0.3 L" chip and once the moment
  // 'mealwater'. Lake water filled with no tablet, pump or gravity bag is untreated (energy.untreated), the whole bottle
  // with it: its state "Untreated" and a tea-brown mark; drunk, it may turn the stomach for half a day (energy.js UPSET);
  // a tablet afterwards (Treat it), the pump, the gravity bag at camp or a boil in the pot (Boil it) make it safe; once
  // the moment 'untreated' (kit.js moments, registered with content C's above). Thirsty with lake water in the bottle is
  // only thirsty, not "the bottle's empty".
  {
    if (!document.getElementById('water-css')) { const s = document.createElement('style'); s.id = 'water-css'; s.textContent = '.st-untreated { --st: #a5773f; --st-ink: #22140a; }'; document.head.appendChild(s); }
    const dueW = hints.due.bind(hints);
    hints.due = (id, rec) => { const r = dueW(id, rec); return id === 'thirsty' && r && typeof r === 'object' && energy.untreated > 0.02 ? r.lv : r; };
  }
  // d1 names (the real-data round; the owner, 2026-10-26: "i honestly would like to do all of this"): the Forest Service's
  // and the place-name authorities' names (names.js, attached above before the tiles). A numbered site reads "Campsite ·
  // Basswood Lake – Back Bay #91" where you stand, on the action line (camp.siteName), in the dusk note ("a free campsite
  // 1.2 km north-east · Lake One #12"), the journal's nights and the record's sites. A portage's landing says its trail,
  // its rods and its class ("Portage: Lake One – Confusion Lake · 45 rods · a good trail"; no metres); its sign's plate the
  // water it goes to and the rods (props.js). Passing a named bay, point, island, narrows, summit or named portage (and a
  // named falls or rapids from d1 rapids' hud.mapPlaces) shows a small place note, at most one each 25 s, never over a
  // lake's card; the map letters them all (hud.js drawPlaceNames). __game.names: the tables, near(x, z, r), the last note.
  {
    if (!document.getElementById('names-css')) { const s = document.createElement('style'); s.id = 'names-css'; s.textContent = '#place.minor .name { font-size: 46px; } #place.minor { gap: 8px; } @media (max-width: 720px) { #place.minor .name { font-size: 32px; } }'; document.head.appendChild(s); }
    const showP = hud.showPlace.bind(hud);
    hud.showPlace = (kicker, name, sub, seconds, minor = false) => { names.minorShown = !!minor; if (hud.el && hud.el.place) hud.el.place.classList.toggle('minor', !!minor); showP(kicker, name, sub, seconds); };
    const portageAt = () => { let best = null, bd = 40; for (const p of world.portages) for (const l of p.launch || []) { const d = Math.hypot(l.x - player.x, l.z - player.z); if (d < bd) { bd = d; best = p; } } return best; };
    const updP = player.update.bind(player);
    player.update = (dt) => {
      updP(dt);
      const c = player.campsite; if (c && c.usfs != null) player.placeName = names.siteLine(c);
      const pr = player.prompt;
      if (pr && pr.key === 'E' && /^Go ashore · Portage: /.test(pr.text || '')) { const p = portageAt(); if (p) pr.text = `Go ashore · ${names.portageLine(p)}`; }
    };
    const siteWordsH = hints.nearestSiteWords.bind(hints);
    hints.nearestSiteWords = () => {
      const w = siteWordsH(); if (!w) return w;
      let n = null; try { n = camp.registry.nearestFree(player.x, player.z, 6000, (s) => !sheets.showsDetail || sheets.showsDetail(s.x, s.z)); } catch { n = null; }
      const nm = n && names.siteWords(n.site); return nm ? `${w} · ${nm}` : w;
    };
    const whereT = tripStats.whereabouts.bind(tripStats);
    tripStats.whereabouts = () => { const c = player.nearCampsite ? player.nearCampsite(player.x, player.z, 40) : null; return (c && names.siteLine(c)) || whereT(); };
    const campW = record.campWords.bind(record);
    record.campWords = (key, lake) => { const [x, z] = String(key).split(':').map(Number); const s = Number.isFinite(x) ? world.campsites.find((c) => (c.kx ?? Math.round(c.x)) === x && (c.kz ?? Math.round(c.z)) === z) : null; return (s && names.siteLine(s)) || campW(key, lake); };
    const hudUpd = hud.update.bind(hud);
    hud.update = (ctx) => {
      // landing at a numbered site, which one (after the parties' "… is taken", party-camps.js, which reads a bare "Go ashore")
      const pr = player.prompt;
      if (pr && pr.key === 'E' && pr.text === 'Go ashore' && player.mode === 'paddle') { const s = player.nearCampsite(player.x, player.z, 45); const nm = s && names.siteLine(s); if (nm) pr.text = `Go ashore · ${nm}`; }
      hudUpd(ctx);
      try { names.update({ player, hud, world, shell: ctx.shell }); } catch (e) { if (!names.warned) { names.warned = true; console.warn('d1 names', e); } }
    };
    window.__game.names = names;
    if (named) console.log(`d1 names: ${named.sites} sites numbered (${named.added} added), ${named.portages} portages on a USFS trail (${named.rods} with its rods), ${named.places} place names`);
  }
  // d1 rapids: the real white water (the owner, 2026-10-26, real data "for everything"). NHD's rapids and falls, named
  // from OSM, GNIS and Geographic Names Ontario (scripts/rapids.mjs -> src/rapids.json): the tile worker makes each
  // drop's river levels over so the water falls where the falls really is, and stands NHD's rocks above the water as
  // boulders on shoals of their own (rapids.js patchTile, lakeRockBins, clearPlants). Here: the white water drawn over
  // the drops near you, their spray, the hull held off a falls's line and bumped off a rock (whitewater.js), the roar by
  // distance (audio-beds.js, through audio.whiteWater), the spring flood's whiter water (water.js uWhiteGain, from
  // season.flow when the season has it), and the names for the map and the place note (hud.mapPlaces: d1 names draws
  // and says them; unused without it).
  const white = new WhiteWater({ world, water, ripples, scene });
  white.knock = (pos, amt) => { if (audio.ctx && audio.enabled) bonk(audio, pos, amt); };
  // the wetlands round: and the nearest running brooks' trickle (creeks.js heard), looked for twice a second, with the
  // drops' voices left free for the drops
  let brooks = [], brooksT = 0;
  audio.whiteWater = () => {
    const h = white.heard || [];
    if (!world.creeks || h.length >= 3) return h;
    const now = performance.now();
    if (now - brooksT > 500) { brooksT = now; brooks = world.creeks.heard(player.x, player.z, day.season, (x, z) => tiles.groundAt(x, z)); }
    for (const b of brooks) b.d = Math.hypot(b.x - player.x, b.z - player.z);
    return h.length ? [...h, ...brooks].slice(0, 3) : brooks;
  };
  hud.mapPlaces = () => whiteWater();
  {
    const upd = water.update.bind(water);
    water.update = (dt, x, z) => {
      upd(dt, x, z);
      const flow = day.season && Number.isFinite(day.season.flow) ? day.season.flow : 1;
      white.update(dt, camera.position, flow);
      water.uniforms.uWhiteGain.value = white.gain;
    };
    const pu = player.update.bind(player);
    player.update = (dt) => { pu(dt); if (white.afterPlayer(player) && !player.prompt) player.prompt = { key: null, text: `${white.hold.name || 'A falls'} · carry round it` }; };
  }
  window.__game.white = white;
  // camp join: and what the modules made after the compile above added to the scene (forage's glint, a sprite, compiled
  // the first time it winked over a ripe patch); programs already made are only looked up
  const warmed = prewarm(scene); // polish A: with the composer's target bound, as above
  // round A-C: then, behind the title card, the programs three's compile skips: every shadow caster's depth program in
  // both light states the shadow pass can see, the mirror's variants, the god rays and the other anti-aliasing
  // (quality.js prewarmPasses). The count is 79 at the title and stays there; it crept from 64 to 76 over four days.
  warmed.then(() => prewarmPasses({ renderer, scene, camera, post, water, tiles, player, world })).then((r) => { window.__game.prewarmed = r; });
  // round A-C: Auto keeps an eye on the frame rate in play and steps down a preset when the game runs slow
  // (quality.js AutoWatch), fed the same frame times as the FPS readout. At half the undergrowth (Low) the
  // understory casts no shadow: a shrub's shadow is lost in the ground's own shading, and its cascade proxies were 18
  // of the shadow pass's 121 draw calls on the Lake One-Confusion trail.
  const autoWatch = new AutoWatch(settings, () => title.state === 'game' && !input.paused && document.visibilityState === 'visible');
  { const end = fps.end.bind(fps); fps.end = (dt) => { end(dt); autoWatch.frame(dt); }; }
  const undergrowth = () => { CULL.understoryShadow = settings.get('vegDensity') > 0.55; };
  settings.onChange((k) => { if (k === 'vegDensity') undergrowth(); });
  undergrowth();
  window.__game.autoWatch = autoWatch;
  loadingEl.classList.add('done');
  setTimeout(() => { loadingEl.style.display = 'none'; }, 900);
  // gl-a: permits (the game-loop round, stream A; docs/build/game-loop-brief.md). Trips are the unit and permits move
  // time: permits.js keeps what you hold (bwca-canoe:permits, per season), the calendar (each entry point's real quota
  // less the parties booked), the prices, the fines and the skip to a permit's day; permit-desk.js is its section of
  // the counter. A push-off takes the permit for that landing today (trip.js start), else it is day use, and still out
  // after dark is a ranger's fine (permits.update), a ticket in the book when the trip ends: paid from the journal's
  // Tasks page (journal.permits), and till then the desk sells no overnight permit. pma.js: the primitive areas.
  {
    const permits = new Permits({ world, day, profile, trip, outfitter, energy, veil, hud, parties, player });
    permits.attach();
    trip.permits = permits;
    journal.permits = permits; // r2: the tickets on the Tasks page
    const permitDesk = new PermitDesk({ permits, outfitter, world, day, profile });
    // stream B's counter sections (the join: the claims-hook fallback dropped, B's addDesk is there)
    outfitter.addDesk('permits', { order: 10, html: (l) => permitDesk.section(l.ep), act: (a, id, ev) => permitDesk.act(a, id, ev) });
    { const tu = trip.update.bind(trip); trip.update = (dt) => { tu(dt); try { permits.update(dt); } catch (e) { if (!permits.warned) { permits.warned = true; console.warn('permits', e); } } }; }
    // the push-off's title over the water says a day trip is one (outfitter.start shows it just after trip.start)
    {
      const startA = outfitter.start.bind(outfitter);
      outfitter.start = (...a) => {
        const place = hud.showPlace;
        hud.showPlace = (t, lake, sub, ...r) => place.call(hud, t, lake, trip.adventure && trip.state.dayUse ? 'Day use: out by dark' : sub, ...r);
        try { return startA(...a); } finally { hud.showPlace = place; }
      };
    }
    // the moment (hints.js): once a season, near sunset on a day-use trip; and no "make camp" on one
    const dayUseNow = () => { const s = trip.state; return trip.active && trip.adventure && !!s.dayUse && !s.grandfathered && !s.fined; };
    if (!MOMENTS.some((m) => m.id === 'dayuse')) MOMENTS.unshift({ id: 'dayuse', prio: 2, recur: 'once', text: 'Day use: out by dark, or a ranger writes you a ticket. Overnight needs a permit.' });
    const dueA = hints.due.bind(hints);
    hints.due = (id, rec) => {
      if (id === 'dayuse') { const ss = day.sunriseSunset, set = ss && Number.isFinite(ss.set) ? ss.set : 20.5; return dayUseNow() && day.hours >= set - 0.75 && day.hours < permits.duskOf(); }
      if ((id === 'evening' || id === 'dusk') && dayUseNow()) return false;
      return dueA(id, rec);
    };
    // r2: the maps pick out a primitive area: the one chosen at the desk while the counter is open, else the one the
    // trip under way's permit is for (map-render.js paintPmas focus)
    const pmaFocus = () => {
      const f = permitDesk.focusPma(); if (f) return f;
      const s = trip.state, p = trip.active && s ? s.permit : null;
      return p && p.kind === 'pma' && p.pma ? p.pma : null;
    };
    hud.pmaFocusFn = pmaFocus; outfitter.pmaFocusFn = pmaFocus;
    Object.assign(window.__game, { permits, permitDesk, pmaMigrated });
  }
  // gl-b: outfitters, drives, pickups, roads (the game-loop round, stream B). Fourteen outfitters on entry points
  // (outfitters.js OUTFITTERS), the other forty-one trailheads (trailhead.js: a lot, a permit box, the sign); the truck
  // drives from a counter to any entry point by the road graph, and a trailhead's sign calls a pickup (rides.js). A trip
  // pushes off from any landing and comes out in a store, by its door or in a trailhead's lot (outfitter.js updateTrip).
  {
    // (the modules are in already: a namespace each, so a name another stream's branch lacks is undefined, not a build error)
    const [OF, TH, { TEACH }] = await Promise.all([import('./outfitters.js'), import('./trailhead.js'), import('./hints.js')]);
    // a season begins at an outfitter: a home picked at a trailhead (the title's list of every entry point, until the
    // start map) is the outfitter that serves it
    const newSeasonB = title.newSeason.bind(title);
    title.newSeason = (ep, opts) => {
      const n = ep && typeof ep === 'object' ? ep.ep : Number(ep), h = n != null && !OF.isOutfitter(n) ? OF.hostOf(n, world) : null;
      return newSeasonB(h != null ? world.entryPoints.find((e) => e.ep === h) || ep : ep, opts);
    };
    // only an outfitter is one to know (a trailhead's landing is not: trip.js learns what it reaches)
    const learnB = trip.learn.bind(trip);
    trip.learn = (ep) => (OF.isOutfitter(ep) ? learnB(ep) : false);
    // the trip card and the map book name a trailhead by its place, not as an outfitter
    const landingB = tasks.landing.bind(tasks);
    tasks.landing = (ep) => (OF.isOutfitter(ep) ? landingB(ep) : outfitter.entry(ep) || landingB(ep));
    if (typeof record.landing === 'function') { const recLandingB = record.landing.bind(record); record.landing = (ep) => recLandingB(ep) || (ep != null ? outfitter.entry(ep) : null); }
    // the moments: what a trailhead's landing is not, and what its sign is for (taught once each, at the moment)
    const inLot = () => { const p = player, h = p.onFoot && !outfitter.open && !trip.active ? TH.trailheadAt(p.x, p.z) : null; return !!(h && h.where === 'lot'); };
    const atLanding = () => { const p = player, h = p.onFoot && trip.active && outfitter.trip.away ? TH.trailheadAt(p.x, p.z) : null; return !!(h && h.where === 'landing'); };
    const glbM = [
      { id: 'gl-b:pickup', prio: TEACH, recur: 'once', text: 'At the trailhead. {E} on the sign calls a pickup.', due: inLot },
      { id: 'gl-b:landing', prio: TEACH, recur: 'once', text: 'A trailhead. Walk up to the lot to come out here.', due: atLanding },
    ];
    for (const m of glbM) if (!MOMENTS.some((q) => q.id === m.id)) { const { due, ...rest } = m; void due; MOMENTS.push(rest); }
    const glbDue = new Map(glbM.map((m) => [m.id, m.due])), dueB = hints.due.bind(hints);
    hints.due = (id, rec) => (glbDue.has(id) ? glbDue.get(id)() : dueB(id, rec));
    window.__game.outfitters = { OUTFITTER_EPS: OF.OUTFITTER_EPS, OUTFITTERS: OF.OUTFITTERS, isOutfitter: OF.isOutfitter, hostOf: (ep) => OF.hostOf(ep, world), reachOf: (ep) => OF.reachOf(ep, world),
      countryOf: (ep) => OF.countryOf(ep, world), roadKm: (a, b) => OF.roadKm(a, b, world), roadWay: (a, b) => OF.roadWay(a, b, world), premiumOf: OF.premiumOf, specialtyOf: OF.specialtyOf,
      outfitterHomes: () => OF.outfitterHomes(world), placeOf: (ep) => OF.placeOf(ep, world), homeTurf: (ep) => OF.homeTurf(ep, world) };
    window.__game.trailhead = { trailheadLayout: TH.trailheadLayout, trailheadLayouts: TH.trailheadLayouts, trailheadAt: TH.trailheadAt, onTrailhead: TH.onTrailhead };
  }
  // gl-c: a new save and its first day (docs/build/game-loop-brief.md, stream C). The title's first step is a map of the
  // outfitters (startmap.js in wizard.js). A season's first visit to the home counter opens the summer help's talk
  // (onboarding.js): rentals are out, old gear from the back "if you're not going to need it", into the canoe at the dock,
  // then the keeper's first permit (stream A's permits.grant, when there) and the counter. The first night in the old
  // tent finds the notebook (walt.js, story-hooks.js); its Read is a paper of the story's pages. Old seasons are legacy.
  {
    story.attach({ profile, day, trip }); // (k1a: the v2 story stamps facts by the clock and the trip; v1 reads only profile)
    onboarding.attach({ outfitter, profile, inventory, talk, hud, day, story, npcs, sheets, player, permits: () => (window.__game && window.__game.permits) || null });
    walt.attach({ trip, camp, inventory, hud, veil, day, story, world, player });
    const showC = outfitter.show.bind(outfitter);
    onboarding.showCounter = (l) => showC(l, 'counter');
    outfitter.show = (landing, tab = null, focus = null) => {
      const t = tab || (outfitter.staged && outfitter.staged.tab) || 'counter';
      if (landing && t === 'counter' && onboarding.pending(landing.ep) && !talk.talking) { outfitter.staged = null; if (onboarding.start(landing.ep)) return; }
      return showC(landing, tab, focus);
    };
    const updC = outfitter.update.bind(outfitter);
    outfitter.update = (dt) => { updC(dt); onboarding.update(dt); if (walt.paperOpen) player.input.paused = true; };
    const verbC = inventory.verb.bind(inventory);
    inventory.verb = (id, ref) => (id === 'read' ? walt.readVerb(ref) || verbC(id, ref) : verbC(id, ref)); // the notebook's Read
    for (const m of walt.moments()) if (!MOMENTS.some((q) => q.id === m.id)) { const { due, ...rest } = m; void due; MOMENTS.push(rest); }
    const waltM = new Map(walt.moments().map((m) => [m.id, m]));
    const dueC = hints.due.bind(hints);
    hints.due = (id, rec) => (waltM.has(id) ? waltM.get(id).due(rec) : dueC(id, rec)); // "The notebook: I, right-click it, Read."
    Object.assign(window.__game, { story, onboarding, walt });
    // st-k1a: the v2 story (STORY_ON only): the clock and the trip for its stamps, the tick each game quarter-hour
    if (STORY_ON && story.v === 2) {
      Object.assign(story.ctx, { day, trip });
      const updS = outfitter.update.bind(outfitter);
      outfitter.update = (dt) => { updS(dt); story.update(); };
    }
  }
  // st-k1b: the story's seams and feed (docs/build/campaign-design.md Part 4 Round 0, K1b), only under STORY_ON
  // (?story=1 in dev): story-seams.js (and through it story-ui, story-allows, pencil, story-layer) is loaded here, so with
  // the flag off not one of them is fetched, nothing is hung on the story and no listener is added anywhere (the game
  // equals main). The stub interfaces (story.ui.pickLake, story.allows, pencil, layer) do nothing yet; the feed
  // (story-feed.js) is the only place the story listens to the game
  if (STORY_ON) {
    try {
      const { installSeams, startFeed } = await import('./story-seams.js');
      const seams = installSeams(story);
      window.__game.storySeams = { ...seams, on: true, feed: null };
      startFeed({ story, mods: { trip, outfitter, world }, guest: () => !!(window.__game.coop && window.__game.coop.guest) })
        .then((feed) => { window.__game.storySeams.feed = feed; console.log(`story K1b: the feed started (${feed.names().join(', ')})`); })
        .catch((e) => console.warn('story K1b: the feed', e));
    } catch (e) { console.warn('story K1b: the seams', e); }
  }
  // gl-d: the trip-end tally and the board (the game-loop round, stream D; docs/build/game-loop-brief.md). Pay lands on
  // the trip's card as it counts up (record.js ended → tasks.settle), never at the board; no cap on notices held
  // (the owner's call 2026-11-05), each with a deadline that fits it; the new kinds (task-kinds-2.js: creel, campsite, beaver, iceout, colour,
  // lastcheck, pma); the firsts and the milestones. Here: the new kinds wired to the camera and the parties, a party's
  // word heard by a creel survey, a visitor's gift kept when the tally pays their notice, the board's dot label, and
  // two moments.
  {
    attachTaskKinds2({ tasks, photo, parties, partyCamps, moves, npcs, outfitter, trip, pointer });
    record.weather = weather; record.parties = parties;
    // a party's word on their trip is a creel survey's answer: stream E's npcs.onTalk when it is there, else the camps'
    // word (party-camps.js) and the canoes' talk (party-moves.js)
    const lakeAt = (x, z) => world.lakeIdAt(x, z) || tasks.lakeNear(x, z, 6);
    const talked = (party, lakeId) => { if (party && party.id != null) tasks.onEvent({ type: 'talk', kind: 'party', partyId: String(party.id), party, lakeId }); };
    if (typeof npcs.onTalk === 'function') {
      npcs.onTalk((e) => { if (e && e.kind === 'party' && e.partyId != null) talked({ id: e.partyId, ...(e.party || {}) }, e.lakeId || lakeAt(player.x, player.z)); });
    } else {
      const wordF = partyCamps.word.bind(partyCamps);
      partyCamps.word = (v) => { const r = wordF(v); try { const D = [...partyCamps.drawn.values()].find((x) => x.v === v); if (D && r) talked(D.party, D.site ? lakeAt(D.site.x, D.site.z) : lakeAt(player.x, player.z)); } catch (e) { console.warn('gl-d: creel', e); } return r; };
      const talkM = moves.talk.bind(moves);
      moves.talk = (L, i) => { const r = talkM(L, i); try { if (L && r) talked(L.party, lakeAt(player.x, player.z)); } catch (e) { console.warn('gl-d: creel', e); } return r; };
    }
    // a visitor's notice paid at the tally: they still give what they promised (npcs.js paid), once
    tasks.on('paid', (t) => { try { if (t && t.npc && npcs.s && npcs.s.tasks && npcs.s.tasks[t.npc] === t.id && typeof npcs.paid === 'function') npcs.paid({ key: t.npc, first: String(t.npcName || '').split(' ')[0] || 'They' }, t); } catch (e) { console.warn('gl-d: a visitor paid', e); } });
    // the board's dot label counted the notices to claim: now only the fish to hand over there
    if (typeof outfitter.readyHere === 'function') outfitter.readyHere = (ep) => { try { return tasks.deliverable(ep); } catch { return []; } };
    // and the board's own line under its name said it pays there (outfitter.js render, stream B's): it pays when you come in
    { const renderD = outfitter.render.bind(outfitter); outfitter.render = (...a) => { const r = renderD(...a); try { const say = outfitter.tab === 'board' && outfitter.el && outfitter.el.panel ? outfitter.el.panel.querySelector('.lede .say') : null; if (say && /paid here/.test(say.textContent)) say.textContent = 'Notices pinned up by the door. Take on what you can do in time; each pays when you come in.'; } catch { /* the counter's */ } return r; }; }
    // the moments: the first notice done on a trip ("it pays when you come in"), and the first tally (E finishes it)
    let doneAt = -1e9;
    tasks.on('done', () => { if (trip.active) doneAt = performance.now() / 1000; });
    const glD = [{ id: 'paylater', prio: 1, recur: 'once', text: 'Done. Notices pay when you come in.', due: () => trip.active && performance.now() / 1000 - doneAt < 30 }, ...record.tallyMoments()];
    for (const m of glD) if (!MOMENTS.some((q) => q.id === m.id)) { const { due, ...rest } = m; void due; MOMENTS.push(rest); }
    const glDM = new Map(glD.map((m) => [m.id, m]));
    const dueD = hints.due.bind(hints);
    hints.due = (id, rec) => (glDM.has(id) ? glDM.get(id).due(rec) : dueD(id, rec));
    window.__game.milestones = () => record.milestones();
  }
  // gl-e: the people are real (the game-loop round, stream E; docs/build/game-loop-brief.md). A store's visitors are the
  // scheduled parties' own members (npcs.js storeParties: going in from an hour and a half before their put-in until
  // their canoes go in the water, coming out for an hour after they land), the whole crew in the store or at the dock;
  // everyone but the keeper is at something (smart.js: the shelves, the counter, the board, the map table, the stove,
  // the porch, the dock), seeded by the clock and the season; what anyone says is held to what is true now
  // (grounding.js: the ice, the snow, the bugs, the hour, the weather, what the store really has); a party you talk to in
  // a store knows you at their camp or on the water (npcs.js met), and their news is their own trip (parties.js
  // storyOf). npcs.onTalk tells who listens (stream D's creel notices); npcs.extraAt stands someone in a store (stream C).
  {
    npcs.grounding.attach({ day, weather, wind, world });
    parties.attach({ weather });
    // (the join: stream B's trailheads, so parties load and unload round the cars in a trailhead's lot)
    npcs.attachParties({ parties, moves, ground: (x, z) => tiles.groundAt(x, z), trailheadLayout: window.__game.trailhead ? window.__game.trailhead.trailheadLayout : undefined });
    Object.assign(window.__game, { smart: npcs.smart, grounding: npcs.grounding });
    // (the join) the counter's own keeper lines (outfitter.say: the greeting, the goodbye, the bunk card) are B's
    // outfitters.js keepers, picked without the grounding: a line untrue today ("The bugs are free." in May, the reefs
    // on the ice) is drawn again, up to eight times
    { const sayE = outfitter.say.bind(outfitter); outfitter.say = (ep, kind) => { let w = sayE(ep, kind); for (let k = 0; k < 8 && w && !npcs.grounded(w); k++) w = sayE(ep, kind); return w; }; }
    rides.grounded = (w) => npcs.grounded(w); // (and the truck's cards: the drive's goodbye, the pickup's line)
    // a moment, once: the first time a party going in or coming out is in the store with you and you have met none yet
    const storeParty = { id: 'storeparty', prio: 1, recur: 'once', text: 'Going in or just out, they know the water. E to talk.' };
    if (!MOMENTS.some((q) => q.id === storeParty.id)) MOMENTS.push(storeParty);
    const dueE = hints.due.bind(hints);
    hints.due = (id, rec) => (id === storeParty.id ? npcs.partyHere() : dueE(id, rec));
  }
  // The start round (2026-11-05; starter.js). The owner: "sometimes just randomly you can start and it will be raining …
  // In the intro, it should be very easy and take you on a very simple route … each outfitter has a starter route and task
  // that gets you a little bit more money." The weather is the season's own (its seed from the season), kind over the
  // first trip (weather.js GENTLE); each outfitter's first night out is suggested once a season (at home as the first
  // talk ends, elsewhere when you ask the keeper), its way pencilled on your map, a small job with it, the site held.
  {
    starter.attach({ tasks, profile, outfitter, npcs, onboarding, parties, weather, trip, day, world, hud, permits: window.__game.permits }); // (r2 join: the ticket gate)
    onboarding.attach({ starter });
    starter.sync();
    // the keeper's first choice at an outfitter whose first night you have not heard
    npcs.extraChoices = npcs.extraChoices || [];
    npcs.extraChoices.push((v) => {
      if (!v || !starter.available(v.ep) || onboarding.pending(v.ep)) return null;
      const home = Number(v.ep) === starter.home;
      return { text: home ? 'Somewhere easy for a night out?' : 'First time here. Somewhere easy for a night?', tag: 'new', go: () => starter.talk(v.ep, () => ({ say: 'Anything else?', filler: true, choices: npcs.kChoices(v) })) };
    });
    // the site suggested is yours from the hour it was suggested, while it stands (parties.js mine)
    const mineS = parties.mine.bind(parties);
    parties.mine = () => { const out = mineS(); try { for (const h of starter.holds()) { const o = out.find((q) => q.i === h.i); if (o) o.since = Math.min(o.since, h.since); else out.push(h); } } catch (e) { console.warn('starter: holds', e); } return out; };
    const updS = outfitter.update.bind(outfitter);
    outfitter.update = (dt) => { updS(dt); starter.update(dt); };
    // the moments: the first paddle out says where the pencilled way is; new water says the keeper knows an easy night
    const sAsk = { id: 'starter:ask', prio: 1, recur: 'once', text: 'New water. The keeper knows an easy first night: {E} to talk.' };
    if (!MOMENTS.some((q) => q.id === sAsk.id)) MOMENTS.push(sAsk);
    const dueS = hints.due.bind(hints);
    hints.due = (id, rec) => {
      if (id === sAsk.id) { const v = outfitter.visit; return !!(v && v.inside && Number(v.ep) !== starter.home && starter.available(v.ep) && !talk.talking && !outfitter.open); }
      const r = dueS(id, rec);
      if (id === 'start' && r) { let n = []; try { n = starter.notes(); } catch { n = []; } if (n.length) return { lv: 1, text: 'Your first night’s way is pencilled on your map: {M}.' }; }
      return r;
    };
    window.__game.starter = starter;
  }
  // r3 contract (docs/build/r3-contract.md): the guide, one registry of what is on the go (the board's notices, the
  // starter job, the ranger's tickets, the main path's steps), read by the journal's Tasks page, the pop-up tracker on the
  // left and the golden locator. Worked out from its sources after the tasks each frame; nothing of it is saved.
  {
    guide.attach({ tasks, permits: window.__game.permits || null, onboarding, outfitter, player, profile, title });
    const updG = tasks.update.bind(tasks);
    tasks.update = (dt) => { updG(dt); try { guide.update(dt); } catch (e) { if (!guide.warnedU) { guide.warnedU = true; console.warn('guide', e); } } };
    window.__game.guide = guide;
  }
  // ==== r3 A (start + onboarding): its one block goes below this line ====
  // r3 A: the main path from the onboarding's saved state (onboarding.js guideSpecs: the talk, the food, the leeches, the
  // canoe at the dock), in place of the guide's placeholder; a reload brings the same step back
  guide.source('onboarding', () => onboarding.guideSpecs(guide));

  // ==== r3 B (journal + tracker): its one block goes below this line ====
  // r3 B: the journal's Tasks page draws the guide's entries (story steps in their amber ink, side stories in teal, each
  // with its next line), and the pop-up tracker on the left says a task added or near, and the tutorial's step all along;
  // while its card is up, I opens the journal at that task. Settings, HUD: "Task pop-ups" turns it off.
  {
    journal.guide = guide;
    tracker.attach({ guide, settings, journal, hud, title, talk });
    journal.taskPeek = () => tracker.peek();
    const updT = tasks.update.bind(tasks);
    tasks.update = (dt) => { updT(dt); try { tracker.update(dt); } catch (e) { if (!tracker.warnedU) { tracker.warnedU = true; console.warn('tracker', e); } } };
    window.__game.tracker = tracker;
  }

  // ==== r3 C (golden locator): its one block goes below this line ====
  // the golden locator (locator.js): a gem over what guide.marks() names, drawn after the camera has moved (through
  // pointer.update, which runs behind the title card too: the shell hides it). Imported here, not at the top, so the
  // three round-3 blocks merge without touching the import list.
  {
    const { locator } = await import('./locator.js');
    locator.attach({ scene, camera, guide, world, talk, photo });
    const updL = pointer.update.bind(pointer);
    pointer.update = (dt, shell) => { updL(dt, shell); try { locator.update(dt, shell); } catch (e) { if (!locator.warnedU) { locator.warnedU = true; console.warn('locator', e); } } };
    window.__game.locator = locator;
  }

  window.__game.siteFeature = siteFeature; // (scripts/r2-starter-routes.mjs: a site's kind of shore)
  console.log(`BWCA Canoe ready: ${world.meta.grid.ntx * world.meta.grid.nty} tiles in the index, ${world.portages.length} portages, ${world.campsites.length} campsites, ${world.entryPoints.length} entry points`);

  // fb3 join: a NaN never freezes the game. Once (the join's test aimed at an undefined point: the heading was NaN for a few
  // frames) the figure, the hull on its shoulders and the camera went NaN and stayed so, and every frame threw in the audio's
  // listener. Each frame the walker (before the pose) and the hull and the camera (after the chase) are checked; a bad one
  // is put back to its last finite value, the pose and the chase start afresh (canoe.heal, chase.heal), one warning says
  // what went bad (again only after a second of good frames), and the game carries on.
  const NG = { x: player.x, z: player.z, heading: player.heading, cam: camera.position.clone(), quat: camera.quaternion.clone(), warned: false, ok: 0 };
  const fin3 = (v) => Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);
  const nanWarn = (bad) => { NG.ok = 0; if (!NG.warned) { NG.warned = true; console.warn(`fb3 join: non-finite ${bad.join(', ')}; put back to the last finite values`); } };
  const guardWalker = () => {
    const p = player, bad = [];
    if (!Number.isFinite(p.x) || !Number.isFinite(p.z)) bad.push('walker x/z');
    if (!Number.isFinite(p.heading)) bad.push('heading');
    if (!Number.isFinite(p.altitude)) bad.push('altitude');
    if (!bad.length) { NG.x = p.x; NG.z = p.z; NG.heading = p.heading; return; }
    p.x = NG.x; p.z = NG.z; p.heading = NG.heading; p.speed = 0; p.yawRate = 0;
    if (!Number.isFinite(p.boost)) p.boost = 1;
    if (p.foot && !Number.isFinite(p.foot.y)) p.foot = null; // (back on the ground under him)
    canoe.rig.position.set(p.x, p.altitude + (p.onFoot ? 0.1 : 0), p.z); canoe.rig.rotation.set(0, p.heading, 0);
    nanWarn(bad);
  };
  const guardView = (shell) => {
    const e = canoe.hull.matrixWorld.elements, bad = [];
    if (!Number.isFinite(e[12]) || !Number.isFinite(e[13]) || !Number.isFinite(e[14])) {
      bad.push('hull');
      const d = player.carry && player.carry.drop;
      if (d && Number.isFinite(d.x) && Number.isFinite(d.z) && Number.isFinite(d.heading)) player.restHull(d.x, d.z, d.heading); else canoe.heal();
    }
    if (!fin3(camera.position)) {
      bad.push('camera');
      chase.heal(player); if (!shell) chase.update(1e-3, player, player.mode === 'carry');
      if (!fin3(camera.position)) { camera.position.copy(NG.cam); camera.quaternion.copy(NG.quat); }
    }
    if (bad.length) nanWarn(bad);
    else { NG.cam.copy(camera.position); NG.quat.copy(camera.quaternion); if (++NG.ok > 60) NG.warned = false; }
  };

  const frame = (dt) => {
    tiles.ground(player.x, player.z, camera.position); // r2 (NPC motion 2): the ground's changes first, so all stand on this frame's ground (tiles.js ground)
    wind.update(dt, day.hours);
    water.setWind(wind.dir.x, wind.dir.z, wind.speed);
    if (wind.puff > 0) water.uniforms.uRippleAmt.value = Math.min(1.35, water.uniforms.uRippleAmt.value + 0.4 * wind.puff); // a gust darkens the ripples (wind.js PUFF); the waves keep the steady wind
    const shell = title.state !== 'game';
    if (shell) { // the card is up: no input, the canoe rides the water but stays put, the camera drifts
      input.down.clear(); input.once.clear();
      const fx = player.x, fz = player.z, fh = player.heading;
      player.update(dt);
      if (!player.teleporting) { player.x = fx; player.z = fz; player.heading = fh; }
      fishing.update(dt); // its HUD state must exist even behind the card; the cleared input keeps the rod still
    } else {
      if (!booted) { booted = true; outfitter.boot(); } // resume a trip or open the start panel, now that the card is away
      photo.before(dt); // hubs 3B: with the camera up, its keys (the aim, Space) come before anyone else's E and Space
      pointer.before(); // fb2 A: E on what the dot points at (and only that), before anyone else reads it (the store's too)
      outfitter.update(dt);
      talk.before(dt); // fb F: a conversation holds the walker and turns the view to the speaker
      camp.before(); // trip core C: the walker holds still while the tent goes up or the night card is up
      forage.before(); // fb G: E for the berry patch whose prompt showed; the walker holds still while picking
      tasks.before(); // hubs 1C: E at a lost item picks it up, ahead of the shore's "Go ashore"
      player.update(dt);
      packs.update(dt); // trip core B: after the player moves, before anything else reads the prompt or the load
      fishing.update(dt);
      shop.update(); // hubs 2B: the tackle box (a lure not in it is refused), the supper, the leeches, the gravity bag
      outfitter.prompt();
      npcs.update(dt); // hubs 3C: who is drawn and how they stand, the talk prompt and its E / Q, after the store's own prompt
      camp.update(dt); // trip core C: the camp's prompts (on foot at a site, after dark off one), H, the strike on launch
      nearby.update(dt); // fb2 A: the book's panels for what is near (their change signal), the stations tidied
      forage.update(dt); // fb G: the patches near you, drawn in season; their prompt and the picking (after the camp's)
      tasks.update(dt);
      sheets.update(player); // fb2 D: an old save's sheet items and map case migrate out, once the inventory is in
      if ((campTimer += dt) > 0.5) { campTimer = 0; atCamp = nearCamp(player.x, player.z); }
      energy.update(dt, wind, atCamp);
      tripStats.update(dt, outfitter.trip.active);
      trip.update(dt); // trip core A: the clock's rate, the rules, the log
      journal.update(dt);
    }
    veil.update(dt); // trip core A: the fade cards, behind the title card too
    guardWalker(); // fb3 join: a NaN never freezes the game (above)
    canoe.update(dt);
    player.afterRig(); // fb C: a swim from shore leaves the beached hull where it lies (canoe.js's swim pose turns it over)
    p2b.afterPlayer(dt); // p2 B: the lid off on the carry, the hull pitched with the water's slope
    chase.allowLock = !shell && !input.paused && !hud.big && !hud.pin; // the mouse is yours while a card, a panel or the map is up
    if (shell) title.update(dt); else chase.update(dt, player, player.mode === 'carry');
    guardView(shell);
    { const e = camera.matrixWorld.elements; actors.update(dt, camera.position.x, camera.position.z, -e[8], -e[10]); } // p2 A: the people on the water and the trails, after the camera
    talk.update(dt, shell); // fb F: the barks' queue and their places on the screen, after the camera
    pointer.update(dt, shell); // fb2 A: the dot, its label and the rim, after the camera
    setOrigin(player.x, player.z);
    tiles.update(player.x, player.z, camera.position);
    water.update(dt, player.x, player.z);
    ripples.lapse = player.boost || 1; // polish A: the hull's bubbles age at the travel's time-lapse (wake.js)
    ripples.update(dt);
    updateClouds(clouds, dt, camera.position.x, camera.position.z);
    d1lakes.update(dt); // d1 lakes: the lake you are on sets the ice (above)
    day.update(dt);
    // the real burns: the tiles built from now on show the burns begun by today (not behind the title card, whose clock is
    // the real one until a season is picked: the date stays the saved season's set above)
    if (!shell) setBurnDate(day.year, day.doy);
    burnNotes.update(dt, shell);
    sky.position.copy(camera.position);
    sun.position.copy(day.sunDir);
    moonTarget.position.set(player.x, player.altitude, player.z);
    moon.position.copy(moonTarget.position).addScaledVector(day.moonDir, 700);
    player.season = day.season;
    tiles.setSeason(day.season);
    setBrookSeason(day.season); // the wetlands round: the brooks run or lie dry by the date
    wind.updateSway(dt); // trees, understory, grass and reeds sway with the wind the water reads
    cover.setSeason(day.season);
    canoe.setFirstPerson(chase.mode === 'first' && !chase.focus); // the head comes back for the close-up of a catch
    fires.update(dt, day.doy * 24 + day.hours, camera.position); lamp.update(dt); // trip core C: the fires burn on the clock, the lamp rides the head
    cover.update(dt, player.x, player.z, hemi, sun);
    mist.update(dt, player.x, player.z);
    loons.update(dt, player, day.season, faunaCtx);
    fauna.update(dt, faunaCtx);
    audio.tick(dt, { player, world, wind, day, season: day.season, camera, weather }); // the soundscape reads the whole scene
    audio.setPaused(title.state === 'pause'); // the pause card ducks and muffles the mix
    geo.update(player, world);
    hud.update({ player, geo, day, wind, fishing, energy, tasks, outfitter, stats: tripStats, fps, shell, trip }); // trip core A: trip
    saver.update(dt);
    input.endFrame();
  };
  // debug helper: advance the simulation by n fixed steps and draw once (used for automated testing)
  // (The lights stay on layer 0, so the mirror's pass, whose camera sees only its own layers, draws the shore unlit
  // under the haze. That gives three a second light state, and each lit material looks its program up again in both
  // passes every frame; putting the lights on the mirror's layers at zero intensity spares that but runs the full lit
  // shaders in the mirror, which measured 1.2 ms a frame slower at the lodge (October 2026), so it stays as it is.)
  const draw = () => {
    fps.begin();
    // no sun, no shadow map to draw: the shadows have faded out (daycycle.js) and the map is not read
    renderer.shadowMap.autoUpdate = sun.intensity > 0.001;
    water.renderReflection(renderer, scene, camera, player.level || world.levelAt(player.x, player.z));
    post.render();
    photo.afterDraw(); // hubs 3B: a picture taken this frame is cut from the canvas as drawn
  };
  window.__game.step = (dt = 1 / 60, n = 1) => { for (let i = 0; i < n; i++) frame(dt); draw(); };
  window.__game.advance = (dt = 1 / 60, n = 1) => { for (let i = 0; i < n; i++) frame(dt); }; // the simulation only, no drawing
  let last = performance.now();
  // The simulation keeps to the wall clock however slow the frame: a frame longer than STEP runs as several even steps
  // of at most STEP each, up to MAX_LAG in all (a longer one, a hitch or a tab come back from hiding, is not caught up).
  // A single step capped at 50 ms put the whole game in slow motion below 20 fps (Ultra on a 3440 x 1440 screen runs
  // at about 18) while the readout still said 4.8 km/h: the owner felt 2.4 (2026-10-23).
  const STEP = 0.05, MAX_LAG = 0.25;
  const tick = (now) => {
    const real = Math.min(MAX_LAG, (now - last) / 1000); last = now;
    const n = Math.max(1, Math.ceil(real / STEP - 1e-6));
    for (let i = 0; i < n; i++) frame(real / n);
    draw();
    fps.end(real);
  };
  renderer.setAnimationLoop(tick);
  // the last page's ask (a new season into a slot, or Play), now that every module is attached. (The replay: run from
  // where the slot is taken, it came while main awaited the game-loop modules, before onboarding.attach, which then
  // took the season just begun for an old one and marked it legacy: no summer help, no old gear, no first permit.)
  if (bootAsk) setTimeout(() => title.fromBoot(bootAsk), 0);
  // the look board (lookboard.js): a contact sheet of fixed spots and hours; the loop is held while it runs
  window.__game.lookboard = (opts) => lookboard(window.__game, opts, {
    pause: () => renderer.setAnimationLoop(null),
    resume: () => { last = performance.now(); renderer.setAnimationLoop(tick); },
  });
  let booted = false; // the outfitter's start panel waits until the title card is away

}

main().catch((e) => { console.error(e); msgEl.textContent = 'Failed to load: ' + e.message; });
