import './fog.js'; // must come first: patches three's fog chunks before any material compiles
import { SunLight } from './sunlight.js'; // patches the sun shadow chunk, also before any material compiles
import * as THREE from 'three';
import { World } from './world.js';
import { DayCycle, buildMoon } from './daycycle.js';
import { buildStars } from './stars.js';
import { makePost } from './post.js';
import { makeAquaticKit } from './aquatic.js';
import { GroundCover } from './groundcover.js';
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
import { Player, Input } from './player.js';
import { Packs } from './packs.js'; // trip core B
import { ChaseCamera } from './camera.js';
import { Hud } from './hud.js';
import { GeoBridge } from './geo.js';
import { Ripples } from './wake.js';
import { Wind } from './wind.js';
import { Fishing } from './fishing.js';
import { Energy } from './energy.js';
import { Tasks } from './tasks.js';
import { Outfitter } from './outfitter.js';
import { Settings, FpsCounter } from './settings.js';
import { TripSaver } from './save.js';
import { Title } from './title.js';
import { Journal } from './journal.js';
import { TripStats } from './trip-stats.js';
import { lookboard } from './lookboard.js';
import { Trip } from './trip.js'; // trip core A
import { Veil } from './veil.js'; // trip core A
import { Camp, CampRegistry } from './camp.js'; // trip core C
import { Fires } from './fire.js'; // trip core C
import { Headlamp } from './headlamp.js'; // trip core C
import { Profile } from './profile.js'; // hubs 1A
import { storeLayout, onStore, storeLayouts, setStoreNotices, storeStats } from './props.js'; // hubs 2A
import { outfitterProfile, boardLean } from './outfitters.js'; // hubs 2C
import { Rides } from './rides.js'; // hubs 2C
import { sheets } from './sheets.js'; // hubs 2D
import { MapTable } from './maptable.js'; // fb2 D
import { Shop } from './shop.js'; // hubs 2B
import { PhotoCamera } from './photo.js'; // hubs 3B
import { People } from './npcs.js'; // hubs 3C
import { inventory } from './inventory.js'; // fb A
import { ITEMS, defineItem, itemDef } from './items.js'; // fb A
import { ContainerView } from './containers.js'; // fb A
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

const palette = { zenith: 0x4c8fd8, horizon: 0xd6e6f2, ground: 0x9aa58a, sun: 0xffe9c4, fog: 0xc6dbe9, cloudTop: 0xfbf8f1, cloudBase: 0xa6bfd9 };

const loadingEl = document.getElementById('loading'), barEl = document.getElementById('loading-bar'), msgEl = document.getElementById('loading-msg');
const progress = (f, msg) => { barEl.style.width = `${Math.round(f * 100)}%`; if (msg) msgEl.textContent = msg; };

async function main() {
  const world = await World.load(progress);
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
  const setOrigin = (x, z) => { const [tx, ty] = world.tileOf(x, z); const [ox, oz] = world.tileOrigin(tx, ty); water.setOrigin(ox, oz); };
  setOrigin(start.x, start.z);
  progress(0.15, 'Loading the lakes around you…');
  await tiles.prime(start.x, start.z, (f) => progress(0.15 + f * 0.8, `Loading the lakes around you… ${Math.round(f * 100)}%`));
  progress(0.97, 'Launching the canoe…');

  const ripples = new Ripples(water);
  scene.add(ripples.mesh);
  const cover = new GroundCover(water);
  scene.add(cover.mesh);
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
  window.addEventListener('keydown', (e) => {
    if (e.target && e.target.tagName === 'SELECT') return;
    if (trip.sandbox) { if (e.code === 'Comma') wind.nudgeSpeed(-1); if (e.code === 'Period') wind.nudgeSpeed(1); if (e.code === 'Slash') wind.nudgeDirection(30); if (e.code === 'Semicolon') wind.release(); } // trip core A: the wind keys are Sandbox's
    if (!fishing.rodUp) { if (e.code === 'Digit1') player.timeScale = 1; if (e.code === 'Digit2') player.timeScale = 2; if (e.code === 'Digit3') player.timeScale = 4; } // 1-7 pick lures while the rod is up
    if (e.code === 'KeyR') settings.toggle('reflections');
    if (e.code === 'KeyN') settings.toggle('mute');
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
  npcs.quiet = () => photo.raised; // the people say nothing while the camera is up (3B)
  weather.indoors = () => !!(outfitter.visit && outfitter.visit.inside); // hubs 3 join: no rain falling inside a store
  // polish B: the soundscape knows indoors too (audio.js): the wind, the trees, the shore and the birds through the walls,
  // the rain on the roof, plank footfalls on the store's floor (and on a dock's deck, which it reads from the feet)
  audio.indoors = () => !!(outfitter.visit && outfitter.visit.inside);
  // fb F: dialogue (dialogue.js). What people say shows by their heads with their names, one at a time in a room, pinned
  // to the screen's edge when they are off it; E on someone opens a conversation (numbered choices; you hold still and
  // the view turns to them, or in third person outside a store cuts over your shoulder); T shows the last six lines.
  // Made before the title, so its Esc and number keys come first.
  const talk = new Dialogue({ camera, player, chase, hud, day, frame: () => !(outfitter.visit && outfitter.visit.inside) });
  npcs.dialogue = talk;

  // the shell: settings (applied now and live), the trip saver, the title / pause screen
  const fps = new FpsCounter(renderer);
  settings.attach({ renderer, scene, sun, water, post, audio, chase, player, stats: fps, geo });
  const saver = new TripSaver(player, day, chase);
  const title = new Title({ world, player, chase, camera, day, hud, settings, saver, saved, trip, outfitter });
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

  window.__game = { THREE, scene, camera, renderer, player, world, canoe, tiles, chase, hud, geo, water, day, post, loons, fauna, weather, cover, mist, audio, wind, fishing, energy, tasks, outfitter, settings, title, saver, stats: fps, fps, journal, tripStats, sun, hemi, moon };
  window.__game.trip = trip; window.__game.veil = veil; // trip core A
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
  // fb E: world data. The landings stand at their real put-ins and the trails the first bake dropped are connected (world.js
  // applyFixes from src/world-fixes.json for the data-v3 release; a newer bake has both built in): { landings, portages, baked }
  window.__game.worldFixes = world.fixed;
  if (world.fixed) console.log(`fb E: ${world.fixed.landings} landings at their put-ins, ${world.fixed.portages} portages connected to the ${world.fixed.baked} baked`);
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
  // fb3 C: the book, the cards, the HUD and the title (the owner's feedback of 2026-10-25). The readout (Tab) is the
  // moment only (the sun, the wind, the sky, the way) and reads the weather for its Sky row; the strip over the paper
  // (hud.js updateStrip: the energy bar, the clock and the day) stands over the book, every card and the Rest dial
  // (camp.dialOpen, which the paper register does not know); the fire card's left pane lists what is in reach as tabs
  // (cards.js); journal.openHere('canoe') opens the book with the canoe lit on the right (stream A's Q on a loaded hull).
  const hudUpdateC = hud.update.bind(hud);
  hud.update = (c) => hudUpdateC(c && !c.weather ? { ...c, weather } : c);
  hud.stripAlso = () => !!camp.dialOpen;
  // camp join: and what the modules made after the compile above added to the scene (forage's glint, a sprite, compiled
  // the first time it winked over a ripe patch); programs already made are only looked up
  prewarm(scene); // polish A: with the composer's target bound, as above
  loadingEl.classList.add('done');
  setTimeout(() => { loadingEl.style.display = 'none'; }, 900);
  console.log(`BWCA Canoe ready: ${world.meta.grid.ntx * world.meta.grid.nty} tiles in the index, ${world.portages.length} portages, ${world.campsites.length} campsites, ${world.entryPoints.length} entry points`);

  const frame = (dt) => {
    const ts = player.timeScale;
    wind.update(dt * ts, day.hours);
    water.setWind(wind.dir.x, wind.dir.z, wind.speed);
    const shell = title.state !== 'game';
    if (shell) { // the card is up: no input, the canoe rides the water but stays put, the camera drifts
      input.down.clear(); input.once.clear();
      const fx = player.x, fz = player.z, fh = player.heading;
      player.update(dt);
      if (!player.teleporting) { player.x = fx; player.z = fz; player.heading = fh; }
      fishing.update(dt, ts); // its HUD state must exist even behind the card; the cleared input keeps the rod still
    } else {
      if (!booted) { booted = true; outfitter.boot(); } // resume a trip or open the start panel, now that the card is away
      photo.before(dt); // hubs 3B: with the camera up, its keys (the aim, Space) come before anyone else's E and Space
      pointer.before(); // fb2 A: E on what the dot points at (and only that), before anyone else reads it (the store's too)
      outfitter.update(dt * ts);
      talk.before(dt); // fb F: a conversation holds the walker and turns the view to the speaker
      camp.before(); // trip core C: the walker holds still while the tent goes up or the night card is up
      forage.before(); // fb G: E for the berry patch whose prompt showed; the walker holds still while picking
      tasks.before(); // hubs 1C: E at a lost item picks it up, ahead of the shore's "Go ashore"
      player.update(dt);
      packs.update(dt * ts); // trip core B: after the player moves, before anything else reads the prompt or the load
      fishing.update(dt, ts);
      shop.update(); // hubs 2B: the tackle box (a lure not in it is refused), the supper, the leeches, the gravity bag
      outfitter.prompt();
      npcs.update(dt); // hubs 3C: who is drawn and how they stand, the talk prompt and its E / Q, after the store's own prompt
      camp.update(dt); // trip core C: the camp's prompts (on foot at a site, after dark off one), H, the strike on launch
      nearby.update(dt); // fb2 A: the book's panels for what is near (their change signal), the stations tidied
      forage.update(dt); // fb G: the patches near you, drawn in season; their prompt and the picking (after the camp's)
      tasks.update(dt * ts);
      sheets.update(player); // fb2 D: an old save's sheet items and map case migrate out, once the inventory is in
      if ((campTimer += dt) > 0.5) { campTimer = 0; atCamp = nearCamp(player.x, player.z); }
      energy.update(dt * ts, wind, atCamp);
      tripStats.update(dt * ts, outfitter.trip.active);
      trip.update(dt * ts); // trip core A: the clock's rate, the rules, the log
      journal.update(dt);
    }
    veil.update(dt); // trip core A: the fade cards, behind the title card too
    canoe.update(dt * ts);
    player.afterRig(); // fb C: a swim from shore leaves the beached hull where it lies (canoe.js's swim pose turns it over)
    chase.allowLock = !shell && !input.paused && !hud.big && !hud.pin; // the mouse is yours while a card, a panel or the map is up
    if (shell) title.update(dt); else chase.update(dt, player, player.mode === 'carry');
    talk.update(dt, shell); // fb F: the barks' queue and their places on the screen, after the camera
    pointer.update(dt, shell); // fb2 A: the dot, its label and the rim, after the camera
    setOrigin(player.x, player.z);
    tiles.update(player.x, player.z, camera.position);
    water.update(dt * ts, player.x, player.z);
    ripples.lapse = player.boost || 1; // polish A: the hull's bubbles age at the travel's time-lapse (wake.js)
    ripples.update(dt * ts);
    updateClouds(clouds, dt * ts, camera.position.x, camera.position.z);
    day.update(dt * ts);
    sky.position.copy(camera.position);
    sun.position.copy(day.sunDir);
    moonTarget.position.set(player.x, player.altitude, player.z);
    moon.position.copy(moonTarget.position).addScaledVector(day.moonDir, 700);
    player.season = day.season;
    tiles.setSeason(day.season);
    wind.updateSway(dt * ts); // trees, understory, grass and reeds sway with the wind the water reads
    cover.setSeason(day.season);
    canoe.setFirstPerson(chase.mode === 'first' && !chase.focus); // the head comes back for the close-up of a catch
    fires.update(dt, day.doy * 24 + day.hours, camera.position); lamp.update(dt); // trip core C: the fires burn on the clock, the lamp rides the head
    cover.update(dt * ts, player.x, player.z, hemi, sun);
    mist.update(dt * ts, player.x, player.z);
    loons.update(dt * ts, player, day.season, faunaCtx);
    fauna.update(dt * ts, faunaCtx);
    audio.tick(dt, { player, world, wind, day, season: day.season, camera, weather }); // the soundscape reads the whole scene
    geo.update(player, world);
    hud.update({ player, geo, ts, day, wind, fishing, energy, tasks, outfitter, stats: tripStats, fps, shell, trip }); // trip core A: trip
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
  // the look board (lookboard.js): a contact sheet of fixed spots and hours; the loop is held while it runs
  window.__game.lookboard = (opts) => lookboard(window.__game, opts, {
    pause: () => renderer.setAnimationLoop(null),
    resume: () => { last = performance.now(); renderer.setAnimationLoop(tick); },
  });
  let booted = false; // the outfitter's start panel waits until the title card is away

}

main().catch((e) => { console.error(e); msgEl.textContent = 'Failed to load: ' + e.message; });
