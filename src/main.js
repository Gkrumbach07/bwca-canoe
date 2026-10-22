import './fog.js'; // must come first: patches three's fog chunks before any material compiles
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
import { Energy } from './energy.js';
import { Tasks } from './tasks.js';
import { Outfitter } from './outfitter.js';

const palette = { zenith: 0x4382c7, horizon: 0xc9dceb, ground: 0x9aa58a, sun: 0xffe9c4, water: 0x3f7f9c, reflect: 0xc9dde8, fog: 0xbcd2e2, cloudTop: 0xfbf8f1, cloudBase: 0xa6bfd9 };

const loadingEl = document.getElementById('loading'), barEl = document.getElementById('loading-bar'), msgEl = document.getElementById('loading-msg');
const progress = (f, msg) => { barEl.style.width = `${Math.round(f * 100)}%`; if (msg) msgEl.textContent = msg; };

async function main() {
  const world = await World.load(progress);
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.domElement.className = 'game';
  document.getElementById('app').appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(palette.fog, 260, 3000); // blue distance haze: far trees fall to silhouette
  const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.3, 9000);

  const sunDir = new THREE.Vector3(-0.62, 0.36, 0.46).normalize(); // initial; the day cycle drives it
  const sun = new THREE.DirectionalLight(0xffdcb0, 1.7);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -150; sun.shadow.camera.right = 150; sun.shadow.camera.top = 150; sun.shadow.camera.bottom = -150;
  sun.shadow.camera.near = 50; sun.shadow.camera.far = 1400;
  sun.shadow.bias = -0.0003; sun.shadow.normalBias = 0.6; sun.shadow.intensity = 0.55;
  scene.add(sun, sun.target);
  const hemi = new THREE.HemisphereLight(0xa9c6e0, 0x6f7a60, 0.8); // cool fill against the warm sun
  scene.add(hemi);
  const moon = new THREE.DirectionalLight(0x8aa4cc, 0);
  moon.position.set(300, 600, -500);
  moon.target = sun.target; // aimed at the player like the sun, not at the world origin
  scene.add(moon);

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
  const water = new WaterSystem(world, sunDir, palette);
  scene.add(water.group);
  const tiles = new TileManager(world, scene, { terrainMaterial: makeTerrainMaterial(), water, vegetation: makeVegetationKit(3), aquatic: makeAquaticKit(water, 9), seed: 3 });
  world.tiles = tiles;
  const start = world.meta.start;
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

  const canoe = buildCanoeRig();
  canoe.rig.traverse((o) => o.layers.enable(REFLECT_LAYER));
  scene.add(canoe.rig);
  const input = new Input();
  const player = new Player(world, canoe, input);
  player.ripples = ripples; player.water = water; player.audio = audio;
  const chase = new ChaseCamera(camera, renderer.domElement, world);
  const hud = new Hud(world, async (x, z) => { if (await player.teleport(x, z)) chase.snap(); });
  const post = makePost(renderer, scene, camera);
  const { lat, lon } = world.toLatLon(start.x, start.z);
  const day = new DayCycle({ scene, sun, hemi, moon, sky, clouds, water, grade: post.grade, stars, mist, ripples, hullFoam: canoe.rig.userData.foam.material, moonDisc }, { lat, lon });
  player.season = day.season;
  const geo = new GeoBridge();
  const wind = new Wind(11);
  player.wind = wind;
  // the trip: outfitters at the landings, the food and the energy, the task board
  const teleport = async (x, z) => { const ok = await player.teleport(x, z); if (ok) chase.snap(); return ok; };
  const energy = new Energy(player, day);
  const tasks = new Tasks(world, scene, player, { audio, water });
  const outfitter = new Outfitter(world, player, { energy, tasks, hud, day, onTeleport: teleport });
  energy.onNote = (t) => hud.note(t); tasks.onNote = (t) => hud.note(t, 6);
  energy.onEvac = () => outfitter.startEvac();
  tasks.onChange = () => outfitter.save();
  const nearCamp = (x, z) => { for (const c of world.campsites) if (Math.abs(c.x - x) < 40 && Math.abs(c.z - z) < 40 && Math.hypot(c.x - x, c.z - z) < 40) return true; return false; };
  let campTimer = 0, atCamp = false;
  window.addEventListener('keydown', (e) => {
    if (e.target && e.target.tagName === 'SELECT') return;
    if (e.code === 'KeyF' && !player.input.paused) energy.manualEat();
    if (e.code === 'Comma') wind.nudgeSpeed(-1); if (e.code === 'Period') wind.nudgeSpeed(1); if (e.code === 'Slash') wind.nudgeDirection(30); if (e.code === 'Semicolon') wind.release();
    if (e.code === 'Digit1') player.timeScale = 1; if (e.code === 'Digit2') player.timeScale = 2; if (e.code === 'Digit3') player.timeScale = 4;
    if (e.code === 'KeyR') water.reflectionsOn = !water.reflectionsOn;
    if (e.code === 'KeyN') audio.toggle();
  });
  window.addEventListener('resize', () => { camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth, window.innerHeight); post.resize(window.innerWidth, window.innerHeight); });

  window.__game = { THREE, scene, camera, renderer, player, world, canoe, tiles, chase, hud, geo, water, day, post, loons, cover, mist, audio, wind, energy, tasks, outfitter };
  loadingEl.classList.add('done');
  setTimeout(() => { loadingEl.style.display = 'none'; }, 900);
  console.log(`BWCA Canoe ready: ${world.meta.grid.ntx * world.meta.grid.nty} tiles in the index, ${world.portages.length} portages, ${world.campsites.length} campsites, ${world.entryPoints.length} entry points`);

  const frame = (dt) => {
    const ts = player.timeScale;
    wind.update(dt * ts, day.hours);
    water.setWind(wind.dir.x, wind.dir.z, wind.speed);
    outfitter.update(dt * ts);
    player.update(dt);
    outfitter.prompt();
    tasks.update(dt * ts);
    if ((campTimer += dt) > 0.5) { campTimer = 0; atCamp = nearCamp(player.x, player.z); }
    energy.update(dt * ts, wind, atCamp);
    canoe.update(dt * ts);
    chase.update(dt, player, player.mode === 'carry');
    setOrigin(player.x, player.z);
    tiles.update(player.x, player.z, camera.position);
    water.update(dt * ts, player.x, player.z);
    ripples.update(dt * ts);
    updateClouds(clouds, dt * ts, camera.position.x, camera.position.z);
    day.update(dt * ts);
    sky.position.copy(camera.position);
    sun.target.position.set(player.x, player.altitude, player.z);
    sun.position.copy(sun.target.position).addScaledVector(day.sunDir, 700);
    moon.position.copy(sun.target.position).addScaledVector(day.moonDir, 700);
    player.season = day.season;
    tiles.setSeason(day.season);
    cover.setSeason(day.season);
    canoe.setFirstPerson(chase.mode === 'first');
    cover.update(dt * ts, player.x, player.z, hemi, sun);
    mist.update(dt * ts, player.x, player.z);
    loons.update(dt * ts, player, day.season);
    audio.update(dt, world.shoreAt(player.x, player.z), player.speed, player.mode === 'paddle');
    geo.update(player, world);
    hud.update(player, geo, ts, day.clock, wind, { energy, tasks, outfitter });
    input.endFrame();
  };
  // debug helper: advance the simulation by n fixed steps and draw once (used for automated testing)
  const draw = () => {
    water.renderReflection(renderer, scene, camera, player.level || world.levelAt(player.x, player.z));
    post.render();
  };
  window.__game.step = (dt = 1 / 60, n = 1) => { for (let i = 0; i < n; i++) frame(dt); draw(); };
  let last = performance.now();
  renderer.setAnimationLoop((now) => {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    frame(dt);
    draw();
  });
  outfitter.boot(); // resume the saved trip, or open the outfitter's panel at the landing
}

main().catch((e) => { console.error(e); msgEl.textContent = 'Failed to load: ' + e.message; });
