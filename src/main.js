import './fog.js'; // must come first: patches three's fog chunks before any material compiles
import { SunLight } from './sunlight.js'; // patches the sun shadow chunk, also before any material compiles
import * as THREE from 'three';
import { World } from './world.js';
import { DayCycle, buildStars, buildMoon } from './daycycle.js';
import { makePost } from './post.js';
import { makeAquaticKit } from './aquatic.js';
import { GroundCover } from './groundcover.js';
import { Loons } from './loons.js';
import { Mist } from './mist.js';
import { Ambient } from './audio.js';
import { makeTerrainMaterial } from './terrain.js';
import { WaterSystem, REFLECT_LAYER } from './water.js';
import { buildSky, buildClouds, updateClouds } from './sky.js';
import { makeVegetationKit } from './vegetation.js';
import { TileManager } from './tiles.js';
import { buildCanoeRig } from './canoe.js';
import { Player, Input } from './player.js';
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

const palette = { zenith: 0x4c8fd8, horizon: 0xd6e6f2, ground: 0x9aa58a, sun: 0xffe9c4, fog: 0xc6dbe9, cloudTop: 0xfbf8f1, cloudBase: 0xa6bfd9 };

const loadingEl = document.getElementById('loading'), barEl = document.getElementById('loading-bar'), msgEl = document.getElementById('loading-msg');
const progress = (f, msg) => { barEl.style.width = `${Math.round(f * 100)}%`; if (msg) msgEl.textContent = msg; };

async function main() {
  const world = await World.load(progress);
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
  const trip = TripSaver.read(); // a saved trip: the title shows that spot, and Paddle in continues it
  const start = trip ? { x: trip.x, z: trip.z } : world.meta.start;
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
  const loons = new Loons(world, water, scene, 6, audio);

  const canoe = buildCanoeRig({ water }); // the hull's water line rides the water's own swell
  canoe.rig.traverse((o) => o.layers.enable(REFLECT_LAYER));
  canoe.rig.userData.foam.layers.disable(REFLECT_LAYER); // the line on the water is not mirrored in it
  scene.add(canoe.rig);
  const input = new Input();
  const player = new Player(world, canoe, input);
  player.ripples = ripples; player.water = water; player.audio = audio;
  if (trip) { player.x = trip.x; player.z = trip.z; player.heading = trip.heading; }
  const chase = new ChaseCamera(camera, renderer.domElement, world);
  player.chase = chase; // walking is read against the view; the cursor steers the canoe when asked
  const settings = new Settings();
  const hud = new Hud(world, { onTeleport: async (x, z) => { if (await player.teleport(x, z)) chase.snap(); }, settings, camera });
  const post = makePost(renderer, scene, camera);
  const { lat, lon } = world.toLatLon(start.x, start.z);
  const day = new DayCycle({ scene, sun, hemi, moon, sky, clouds, water, post, stars, mist, ripples, hullFoam: canoe.rig.userData.foam.material, moonDisc }, { lat, lon });
  player.season = day.season;
  const geo = new GeoBridge();
  const wind = new Wind(11);
  player.wind = wind;
  const fishing = new Fishing({ world, player, canoe, water, ripples, audio, chase, input, day, wind, scene });
  player.fishing = fishing;
  fishing.rod.traverse((o) => o.layers.enable(REFLECT_LAYER));
  // the trip: outfitters at the landings, the food and the energy, the task board
  const teleport = async (x, z) => { const ok = await player.teleport(x, z); if (ok) chase.snap(); return ok; };
  const energy = new Energy(player, day);
  const tasks = new Tasks(world, scene, player, { audio, water });
  const tripStats = new TripStats(world, player, day);
  const outfitter = new Outfitter(world, player, { energy, tasks, hud, day, stats: tripStats, onTeleport: teleport });
  const journal = new Journal({ hud, world, player, day, fishing, tasks, energy, outfitter, stats: tripStats, wind });
  energy.onNote = (t) => hud.note(t); tasks.onNote = (t) => hud.note(t, 6);
  energy.onEvac = () => outfitter.startEvac();
  tasks.onChange = () => outfitter.save();
  const nearCamp = (x, z) => { for (const c of world.campsites) if (Math.abs(c.x - x) < 40 && Math.abs(c.z - z) < 40 && Math.hypot(c.x - x, c.z - z) < 40) return true; return false; };
  let campTimer = 0, atCamp = false;
  window.addEventListener('keydown', (e) => {
    if (e.target && e.target.tagName === 'SELECT') return;
    if (e.code === 'KeyG' && !player.input.paused) energy.manualEat(); // F is the fishing rod
    if (e.code === 'Comma') wind.nudgeSpeed(-1); if (e.code === 'Period') wind.nudgeSpeed(1); if (e.code === 'Slash') wind.nudgeDirection(30); if (e.code === 'Semicolon') wind.release();
    if (!fishing.rodUp) { if (e.code === 'Digit1') player.timeScale = 1; if (e.code === 'Digit2') player.timeScale = 2; if (e.code === 'Digit3') player.timeScale = 4; } // 1-5 pick lures while the rod is up
    if (e.code === 'KeyR') settings.toggle('reflections');
    if (e.code === 'KeyN') settings.toggle('mute');
  });
  window.addEventListener('resize', () => { camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth, window.innerHeight); post.resize(window.innerWidth, window.innerHeight); });

  // the shell: settings (applied now and live), the trip saver, the title / pause screen
  const fps = new FpsCounter(renderer);
  settings.attach({ renderer, scene, sun, water, post, audio, chase, player, stats: fps, geo });
  const saver = new TripSaver(player, day, chase);
  const title = new Title({ world, player, chase, camera, day, hud, settings, saver, trip, outfitter });
  // a trip saved on a trail or in the water comes back afloat at the nearest open water
  if (trip && (trip.mode !== 'paddle' || world.shoreAt(trip.x, trip.z) > -2)) player.teleport(trip.x, trip.z);
  title.open('title');

  window.__game = { THREE, scene, camera, renderer, player, world, canoe, tiles, chase, hud, geo, water, day, post, loons, cover, mist, audio, wind, fishing, energy, tasks, outfitter, settings, title, saver, stats: fps, fps, journal, tripStats, sun, hemi, moon };
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
      outfitter.update(dt * ts);
      player.update(dt);
      fishing.update(dt, ts);
      outfitter.prompt();
      tasks.update(dt * ts);
      if ((campTimer += dt) > 0.5) { campTimer = 0; atCamp = nearCamp(player.x, player.z); }
      energy.update(dt * ts, wind, atCamp);
      tripStats.update(dt * ts, outfitter.trip.active);
      journal.update(dt);
    }
    canoe.update(dt * ts);
    chase.allowLock = !shell && !input.paused && !hud.big && !hud.pin; // the mouse is yours while a card, a panel or the map is up
    if (shell) title.update(dt); else chase.update(dt, player, player.mode === 'carry');
    setOrigin(player.x, player.z);
    tiles.update(player.x, player.z, camera.position);
    water.update(dt * ts, player.x, player.z);
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
    cover.update(dt * ts, player.x, player.z, hemi, sun);
    mist.update(dt * ts, player.x, player.z);
    loons.update(dt * ts, player, day.season);
    audio.tick(dt, { player, world, wind, day, season: day.season, camera }); // the soundscape reads the whole scene
    geo.update(player, world);
    hud.update({ player, geo, ts, day, wind, fishing, energy, tasks, outfitter, stats: tripStats, fps, shell });
    saver.update(dt);
    input.endFrame();
  };
  // debug helper: advance the simulation by n fixed steps and draw once (used for automated testing)
  const draw = () => {
    fps.begin();
    water.renderReflection(renderer, scene, camera, player.level || world.levelAt(player.x, player.z));
    post.render();
  };
  window.__game.step = (dt = 1 / 60, n = 1) => { for (let i = 0; i < n; i++) frame(dt); draw(); };
  window.__game.advance = (dt = 1 / 60, n = 1) => { for (let i = 0; i < n; i++) frame(dt); }; // the simulation only, no drawing
  let last = performance.now();
  const tick = (now) => {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    frame(dt);
    draw();
    fps.end(dt);
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
