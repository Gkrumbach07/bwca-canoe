import * as THREE from 'three';
import { World } from './world.js';
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

const palette = { zenith: 0x5d93c6, horizon: 0xd3e3ee, ground: 0x9aa58a, sun: 0xffe9c4, water: 0x86b8cf, reflect: 0xc9dde8, fog: 0xbcd2e2 };

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
  renderer.toneMappingExposure = 1.15;
  renderer.domElement.className = 'game';
  document.getElementById('app').appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(palette.fog, 120, 2600); // blue distance haze: far trees fall to silhouette
  const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.3, 9000);

  const sunDir = new THREE.Vector3(-0.62, 0.36, 0.46).normalize(); // late afternoon
  const sun = new THREE.DirectionalLight(0xffdcb0, 1.7);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -150; sun.shadow.camera.right = 150; sun.shadow.camera.top = 150; sun.shadow.camera.bottom = -150;
  sun.shadow.camera.near = 50; sun.shadow.camera.far = 1400;
  sun.shadow.bias = -0.0003; sun.shadow.normalBias = 0.6; sun.shadow.intensity = 0.55;
  scene.add(sun, sun.target);
  scene.add(new THREE.HemisphereLight(0xa9c6e0, 0x6f7a60, 0.8)); // cool fill against the warm sun

  scene.background = new THREE.Color(palette.fog);
  const sky = buildSky(sunDir, palette);
  scene.add(sky);
  const clouds = buildClouds(38, 7000);
  scene.add(clouds);

  // the streamed world: water first (tiles hand it their far meshes), then the tile manager
  const water = new WaterSystem(world, sunDir, palette);
  scene.add(water.group);
  const tiles = new TileManager(world, scene, { terrainMaterial: makeTerrainMaterial(), water, vegetation: makeVegetationKit(3), seed: 3 });
  world.tiles = tiles;
  const start = world.meta.start;
  const setOrigin = (x, z) => { const [tx, ty] = world.tileOf(x, z); const [ox, oz] = world.tileOrigin(tx, ty); water.setOrigin(ox, oz); };
  setOrigin(start.x, start.z);
  progress(0.15, 'Loading the lakes around you…');
  await tiles.prime(start.x, start.z, (f) => progress(0.15 + f * 0.8, `Loading the lakes around you… ${Math.round(f * 100)}%`));
  progress(0.97, 'Launching the canoe…');

  const ripples = new Ripples(water);
  scene.add(ripples.mesh);
  const canoe = buildCanoeRig();
  canoe.rig.traverse((o) => o.layers.enable(REFLECT_LAYER));
  scene.add(canoe.rig);
  const input = new Input();
  const player = new Player(world, canoe, input);
  player.ripples = ripples; player.water = water;
  const chase = new ChaseCamera(camera, renderer.domElement, world);
  const hud = new Hud(world, (x, z) => player.teleport(x, z));
  const geo = new GeoBridge();
  window.addEventListener('keydown', (e) => { if (e.target && e.target.tagName === 'SELECT') return; if (e.code === 'Digit1') player.timeScale = 1; if (e.code === 'Digit2') player.timeScale = 2; if (e.code === 'Digit3') player.timeScale = 4; if (e.code === 'KeyR') water.reflectionsOn = !water.reflectionsOn; });
  window.addEventListener('resize', () => { camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth, window.innerHeight); });

  window.__game = { THREE, scene, camera, renderer, player, world, canoe, tiles, chase, hud, geo, water };
  loadingEl.classList.add('done');
  setTimeout(() => { loadingEl.style.display = 'none'; }, 900);
  console.log(`BWCA Canoe ready: ${world.meta.grid.ntx * world.meta.grid.nty} tiles in the index, ${world.portages.length} portages, ${world.campsites.length} campsites, ${world.entryPoints.length} entry points`);

  const frame = (dt) => {
    player.update(dt);
    canoe.update(dt * player.timeScale);
    chase.update(dt, player, player.mode === 'carry');
    setOrigin(player.x, player.z);
    tiles.update(player.x, player.z, camera.position);
    water.update(dt * player.timeScale, player.x, player.z);
    ripples.update(dt * player.timeScale);
    updateClouds(clouds, dt * player.timeScale, camera.position.x, camera.position.z);
    sky.position.copy(camera.position);
    sun.target.position.set(player.x, player.altitude, player.z);
    sun.position.copy(sun.target.position).addScaledVector(sunDir, 700);
    geo.update(player, world);
    hud.update(player, geo, player.timeScale);
    input.endFrame();
  };
  // debug helper: advance the simulation by n fixed steps and draw once (used for automated testing)
  const draw = () => {
    water.renderReflection(renderer, scene, camera, player.level || world.levelAt(player.x, player.z));
    renderer.render(scene, camera);
  };
  window.__game.step = (dt = 1 / 60, n = 1) => { for (let i = 0; i < n; i++) frame(dt); draw(); };
  let last = performance.now();
  renderer.setAnimationLoop((now) => {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    frame(dt);
    draw();
  });
}

main().catch((e) => { console.error(e); msgEl.textContent = 'Failed to load: ' + e.message; });
