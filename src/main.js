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
import { Energy, GULP } from './energy.js';
import { Tasks } from './tasks.js';
import { Outfitter } from './outfitter.js';
import { Settings, FpsCounter } from './settings.js';
import { TripSaver } from './save.js';
import { Title } from './title.js';
import { Journal } from './journal.js';
import { TripStats } from './trip-stats.js';
import { lookboard } from './lookboard.js';
import { Trip } from './trip.js'; // trip core A
import { PACES, SPEEDS, clockOf, speedOfKey, describe as describePace } from './pace.js'; // fb5 C
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
import { withTentNeeds, pitchNeeds } from './tent.js'; // fb4 E
import { chip } from './chip.js'; // fb5 D
import { Hints } from './hints.js'; // fb4 D
import { MOMENTS } from './hints.js'; // content C
import { kit } from './kit.js'; // content C
import { uniques } from './uniques.js'; // content C
import './gear-icons.js'; // content C
import { attachTaskKinds } from './task-kinds.js'; // content A

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
  // fb4 D (decision 4, the keys after the owner's second round of 2026-10-25): the global keys are 1 2 3, the pace, and
  // Sandbox's wind. R (the shore in the water) and N (sound) are gone: both are rows of Settings (Display, Sound).
  window.addEventListener('keydown', (e) => {
    if (e.target && e.target.tagName === 'SELECT') return;
    if (trip.sandbox) { if (e.code === 'Comma') wind.nudgeSpeed(-1); if (e.code === 'Period') wind.nudgeSpeed(1); if (e.code === 'Slash') wind.nudgeDirection(30); if (e.code === 'Semicolon') wind.release(); } // trip core A: the wind keys are Sandbox's
    if (!fishing.rodUp) { const sp = speedOfKey(e.code); if (sp) player.timeScale = sp.factor; } // fb5 C: 1 2 3 Normal, Faster, Fastest (pace.js SPEEDS: 1, 2, 4 on dt); 1-7 pick lures while the rod is up
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
  // the view turns to them, or in third person outside a store cuts over your shoulder); a conversation opens with what
  // that person last said to you (fb4 D: T and its panel are gone). Made before the title, so its Esc and number keys
  // come first.
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
  // content D: items in 3D (content pass 1; the owner, 2026-10-25: "more 3d versions of items so they show up in hand,
  // or on ground better"). Every loose item has a model of its own (item-models.js: one material, a geometry per model
  // and tint), and containers.js draws it in a hand, laid out in a pile at its cell, on the grate, on the stringer and in
  // the bilge while you paddle (invView.afterPose, above). Stream C's uniques lying in the world take modelFor.
  window.__game.itemModels = { modelFor, modelKeyOf, modelGeometry, keys: MODEL_KEYS };
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
  // fb3 A: the canoe and movement (the owner's feedback of 2026-10-25). Nothing moves by itself (packs.js: no auto-stow
  // when the canoe goes down, no auto-load when you push off, only the lashed paddle, rod and stringer ride in it when
  // it goes overhead); a portage landing is a landing like any other (player.js: you step out with the canoe beached, Q
  // on the hull shoulders it); E Get in only where the hull floats, else "Push it off first"; Q on a loaded hull reads
  // "Unload it first" and opens the book with the canoe on the right (journal.openHere('canoe'), stream C's ref); the
  // dot's rim parks when the dot goes off (pointer.js); on foot off a trail, outside a camp and a yard, the walker is
  // time-lapsed like the trail (pace.js foot, 1.8 at Trip); sitting keeps the camera's distance (camera.js); the
  // headlamp works by day (headlamp.js).
  packs.openCanoe = () => (typeof journal.openHere === 'function' ? journal.openHere('canoe') : false);
  // fb5 C: one clock (decision 3 of the owner's third round of 2026-10-25). The game clock runs at one rate everywhere
  // at a pace (pace.js clockOf: Trip 4, Real 1, the camera's hold 1), times the 1/2/3 key's factor (Normal, Faster,
  // Fastest: 1, 2, 4 on dt, bound above through pace.js SPEEDS): on the water, on a trail, on foot, in camp, idle and in a
  // store alike (trip.update sets day.rate; no ×12 idle, no ×3 trail). The canoe's and the walker's time-lapse
  // (player.boost) is only how they are seen to move. The walker's lapsing counts as travelling inside trip.travelling
  // now (fb3 A's wrapper here is folded into it). The user sees no multipliers: describe() gives the toast (hints.js,
  // stream E) and the corner mark (hud.js) their words; Settings and the keys' help say it the same way.
  window.__game.pace = { PACES, SPEEDS, clockOf, describe: describePace };
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
    inventory.entryStatus = (c, e) => (c && c.item === 'grate' && typeof ck5.grateStatus === 'function' ? ck5.grateStatus(c, e) : c && c.item === 'firefuel' && typeof ch5.fuelStatus === 'function' ? ch5.fuelStatus(c, e) : statusA(c, e)); // (the fire's own, lean: a state word and a missing chip, no timers)
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
  // coffee and cocoa, the net, the knife and the fillets, three lures, a waterproof pack, more food, eight uniques),
  // shop.js the shelves (stocked by outfitter kind), gear-icons.js their pictures. kit.js is what they do with you, read
  // by the systems they touch: energy (the bag's night, the jacket, the toque, the bugs, the chair, the lamp after dark),
  // fishing (the cap, the reel, the net at the side, the graphite rod's strike), trip (a capsize with the bag in a dry
  // pack), camp (the filter at the water's edge); the stove, a cup, the knife and the chair are verbs in the book.
  // uniques.js lays the five finds out at real places with forage's glint, E on the dot picks one up; stream B's keepers
  // give the other three (uniques.give, or profile.give).
  kit.attach({ player, inventory, energy, fishing, camp, fires, day, weather, wind, hud, profile, lamp, shop, world, uniques, canoe, scene });
  energy.kit = kit; fishing.kit = kit; trip.kit = kit; shop.kit = kit;
  uniques.attach({ world, scene, player, inventory, profile, hud, camp, day, pointer, audio });
  const shopUpdC = shop.update.bind(shop);
  shop.update = () => { shopUpdC(); kit.update(); uniques.update(); };
  const fillC = camp.fillBottle.bind(camp);
  camp.fillBottle = () => kit.fillBottle(fillC); // the pump, at once; the gravity bag in a few minutes; else a tablet
  camp.filterWait = () => kit.filterWait();
  const verbC = inventory.verb.bind(inventory);
  inventory.verb = (id, ref) => kit.verb(id, ref) || verbC(id, ref); // Cook on it, Brew a cup, Fillet the catch, Sit in it
  const raiseC = profile.raise.bind(profile);
  profile.raise = (ep, d = 1) => raiseC(ep, d > 0 && kit.owns('tradesilver') ? d * 1.5 : d); // the keepers know trade silver
  const taskHintsC = tasks.hints.bind(tasks);
  tasks.hints = () => [...taskHintsC(), ...uniques.mapMarks()]; // Arvid's site, in the map's pencil
  const onUseC = journal.pack.onUse;
  journal.pack.onUse = (e, mode, c) => {
    if (e && e.id === 'guidemap') { if (mode === 'label') return 'Look at the map'; const g = uniques.guideSite(); journal.close(); hud.setMode('sheet'); if (g && hud.view) { hud.view.cx = g.x; hud.view.cz = g.z; } return null; }
    return onUseC ? onUseC(e, mode, c) : null;
  };
  const kitMoments = new Map(kit.moments().map((m) => [m.id, m]));
  for (const m of kitMoments.values()) if (!MOMENTS.some((q) => q.id === m.id)) { const { due, ...rest } = m; void due; MOMENTS.push(rest); }
  const dueC = hints.due.bind(hints);
  hints.due = (id, rec) => (kitMoments.has(id) ? kitMoments.get(id).due(rec) : dueC(id, rec)); // the bugs, a fish at the side, a cold night, the fish remains
  Object.assign(window.__game, { kit, uniques });
  // content A: more kinds of notice for the boards (task-kinds.js, the owner's content pass of 2026-10-25: "more varied
  // tasks"): a blowdown across a portage sawn clear, litter packed out of a campsite, a Secchi reading at a lake's deep
  // spot, the midsummer loon count, a route report, a rental canoe left behind, fish for the shore lunch class. Their
  // things on the trail and the sites are on the dot (pointer), a blowdown is solid to the walker (tiles.dynamic), and
  // the first time each new action matters it is a moment (hints).
  attachTaskKinds({ tasks, pointer, hints, inventory, chores: camp.chores, tiles, camera, loons, wind, weather, hud, player });
  // camp join: and what the modules made after the compile above added to the scene (forage's glint, a sprite, compiled
  // the first time it winked over a ripe patch); programs already made are only looked up
  prewarm(scene); // polish A: with the composer's target bound, as above
  loadingEl.classList.add('done');
  setTimeout(() => { loadingEl.style.display = 'none'; }, 900);
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
    guardWalker(); // fb3 join: a NaN never freezes the game (above)
    canoe.update(dt * ts);
    player.afterRig(); // fb C: a swim from shore leaves the beached hull where it lies (canoe.js's swim pose turns it over)
    chase.allowLock = !shell && !input.paused && !hud.big && !hud.pin; // the mouse is yours while a card, a panel or the map is up
    if (shell) title.update(dt); else chase.update(dt, player, player.mode === 'carry');
    guardView(shell);
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
