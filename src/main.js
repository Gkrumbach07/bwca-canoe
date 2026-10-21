import './fog.js'; // must come first: patches three's fog chunks before any material compiles
import * as THREE from 'three';
import { World } from './world.js';
import { DayCycle, buildStars } from './daycycle.js';
import { makePost } from './post.js';
import { buildAquatic } from './aquatic.js';
import { GroundCover } from './groundcover.js';
import { Loons } from './loons.js';
import { Mist } from './mist.js';
import { Ambient } from './audio.js';
import { buildTerrain } from './terrain.js';
import { WaterSystem, REFLECT_LAYER } from './water.js';
import { buildSky, buildClouds, updateClouds } from './sky.js';
import { buildVegetation } from './vegetation.js';
import { buildPortageTrails, buildCampsites, exclusionsFor } from './props.js';
import { buildCanoeRig } from './canoe.js';
import { Player, Input } from './player.js';
import { ChaseCamera } from './camera.js';
import { Hud } from './hud.js';
import { GeoBridge } from './geo.js';
import { Ripples } from './wake.js';
import { updateVegetationLOD } from './vegetation.js';

const palette = { zenith: 0x4382c7, horizon: 0xc9dceb, ground: 0x9aa58a, sun: 0xffe9c4, water: 0x86b8cf, reflect: 0xc9dde8, fog: 0xbcd2e2, cloudTop: 0xfbf8f1, cloudBase: 0xa6bfd9 };

const loadingEl = document.getElementById('loading'), barEl = document.getElementById('loading-bar'), msgEl = document.getElementById('loading-msg');
const progress = (f, msg) => { barEl.style.width = `${Math.round(f * 100)}%`; if (msg) msgEl.textContent = msg; };
const tick = () => new Promise((r) => setTimeout(r));

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
  scene.add(moon);

  scene.background = new THREE.Color(palette.fog);
  const sky = buildSky(sunDir, palette);
  scene.add(sky);
  const stars = buildStars();
  sky.add(stars);
  const clouds = buildClouds(26, 7000, palette, sunDir);
  scene.add(clouds);

  progress(0.25, 'Growing the forest…'); await tick();
  const forest = await buildVegetation(world, { seed: 3, exclusions: exclusionsFor(world), onProgress: (f) => progress(0.25 + f * 0.35, `Growing the forest… ${Math.round(f * 100)}%`) });
  scene.add(forest);
  scene.add(await buildTerrain(world, forest.userData.shade, (f) => progress(0.6 + f * 0.3, `Shaping the Canadian Shield… ${Math.round(f * 100)}%`)));
  progress(0.9, 'Filling the lakes…'); await tick();
  const water = new WaterSystem(world, sunDir, palette);
  scene.add(water.group);
  progress(0.94, 'Clearing portages and campsites…'); await tick();
  scene.add(buildPortageTrails(world), buildCampsites(world));
  const ripples = new Ripples(water);
  scene.add(ripples.mesh);
  progress(0.95, 'Planting the shallows…'); await tick();
  const aquatic = await buildAquatic(world, water, { onProgress: (f) => progress(0.95 + f * 0.02, `Planting the shallows… ${Math.round(f * 100)}%`) });
  scene.add(aquatic);
  const cover = new GroundCover(world, water, forest.userData.shade, exclusionsFor(world));
  scene.add(cover.mesh);
  const mist = new Mist(water);
  scene.add(mist.group);
  const audio = new Ambient();
  const loons = new Loons(world, water, scene, 6, audio);
  progress(0.97, 'Launching the canoe…'); await tick();

  const canoe = buildCanoeRig();
  canoe.rig.traverse((o) => o.layers.enable(REFLECT_LAYER));
  scene.add(canoe.rig);
  const input = new Input();
  const player = new Player(world, canoe, input);
  player.ripples = ripples; player.water = water;
  const chase = new ChaseCamera(camera, renderer.domElement, world);
  const hud = new Hud(world, (x, z) => player.teleport(x, z));
  const post = makePost(renderer, scene, camera);
  const day = new DayCycle({ scene, sun, hemi, moon, sky, clouds, water, grade: post.grade, stars, mist, ripples });
  player.audio = audio;
  const geo = new GeoBridge();
  window.addEventListener('keydown', (e) => { if (e.code === 'Digit1') player.timeScale = 1; if (e.code === 'Digit2') player.timeScale = 2; if (e.code === 'Digit3') player.timeScale = 4; if (e.code === 'KeyR') water.reflectionsOn = !water.reflectionsOn; if (e.code === 'KeyN') audio.toggle(); });
  window.addEventListener('resize', () => { camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth, window.innerHeight); post.resize(window.innerWidth, window.innerHeight); });

  window.__game = { THREE, scene, camera, renderer, player, world, canoe, forest, chase, hud, geo, water, day, post, loons, aquatic, cover, mist, audio };
  loadingEl.classList.add('done');
  setTimeout(() => { loadingEl.style.display = 'none'; }, 900);
  console.log(`BWCA Canoe ready: ${forest.userData.count} trees and rocks, ${world.portages.length} portages, ${world.campsites.length} campsites`);

  const frame = (dt) => {
    player.update(dt);
    canoe.update(dt * player.timeScale);
    chase.update(dt, player, player.mode === 'carry');
    water.update(dt * player.timeScale, player.x, player.z);
    ripples.update(dt * player.timeScale);
    updateVegetationLOD(forest, camera.position);
    updateClouds(clouds, dt * player.timeScale);
    day.update(dt * player.timeScale);
    sky.position.copy(camera.position);
    sun.target.position.set(player.x, player.altitude, player.z);
    sun.position.copy(sun.target.position).addScaledVector(day.sunDir, 700);
    canoe.setFirstPerson(chase.mode === 'first');
    aquatic.userData.update(camera.position);
    cover.update(dt * player.timeScale, player.x, player.z, hemi);
    mist.update(dt * player.timeScale, player.x, player.z);
    loons.update(dt * player.timeScale, player);
    audio.update(dt, world.shoreAt(player.x, player.z), player.speed, player.mode === 'paddle');
    geo.update(player, world);
    hud.update(player, geo, player.timeScale, day.clock);
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
}

main().catch((e) => { console.error(e); msgEl.textContent = 'Failed to load: ' + e.message; });
