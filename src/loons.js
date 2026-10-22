import * as THREE from 'three';
import { GeoBuilder, vary } from './geobuilder.js';
import { mulberry32 } from './rng.js';
import { makeFloatingMaterial } from './floating.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

function loonGeometry(rng) {
  const g = new GeoBuilder();
  const dark = new THREE.Color(0x1a1c21), white = new THREE.Color(0xeeeee6);
  g.blob(0, 0.12, 0, 0.32, dark, rng, 0.2, 1.6, 0.55, 0.75);                 // body
  g.blob(0.04, 0.02, 0, 0.27, white, rng, 0.15, 1.45, 0.45, 0.6);             // white belly and flanks
  for (let i = 0; i < 8; i++) g.blob(-0.25 + (i % 4) * 0.14, 0.3, (i < 4 ? -0.1 : 0.1), 0.035, white, rng, 0.2); // checkered back
  g.tube(g.ring(0.38, 0.22, 0, 0.09, 5, rng), g.ring(0.55, 0.5, 0, 0.07, 5, rng), dark, V(0.45, 0.35, 0)); // neck
  g.blob(0.6, 0.56, 0, 0.11, dark, rng, 0.15, 1.3, 0.9, 0.9);                 // head
  g.fan(V(0.95, 0.53, 0), g.ring(0.7, 0.55, 0, 0.045, 5, rng), vary(0x555a60, rng), V(0.7, 0.55, 0)); // bill
  g.blob(0.64, 0.6, 0.085, 0.02, new THREE.Color(0xc0202a), rng, 0.1);        // eyes
  g.blob(0.64, 0.6, -0.085, 0.02, new THREE.Color(0xc0202a), rng, 0.1);
  return g.build();
}

// Common loons: drift, dive, surface somewhere else, keep their distance, and call now and then.
export class Loons {
  constructor(world, water, scene, count = 6, audio = null) {
    this.world = world; this.audio = audio;
    this.rng = mulberry32(21);
    const geo = loonGeometry(this.rng);
    const mat = makeFloatingMaterial(water);
    this.loons = [];
    for (let i = 0; i < count; i++) {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = true;
      scene.add(mesh);
      this.loons.push({ mesh, x: 0, z: 0, heading: this.rng() * 6.28, state: 'swim', t: 0, dive: 0, speed: 0.45, call: 20 + this.rng() * 40, alive: false });
    }
  }

  // a water spot 150-450 m from the player, well away from shore
  findSpot(px, pz) {
    const w = this.world;
    for (let tries = 0; tries < 60; tries++) {
      const a = this.rng() * 6.28, d = 150 + this.rng() * 300;
      const x = px + Math.cos(a) * d, z = pz + Math.sin(a) * d;
      if (w.inBounds(x, z, 60) && w.shoreAt(x, z) < -25) return { x, z };
    }
    return null;
  }

  update(dt, player, season = null) {
    const w = this.world;
    if (season && season.loons < 0.5) { for (const l of this.loons) l.mesh.visible = false; return; }
    for (const l of this.loons) {
      const dPlayer = Math.hypot(l.x - player.x, l.z - player.z);
      if (!l.alive || dPlayer > 650) {
        const s = this.findSpot(player.x, player.z);
        if (!s) continue;
        l.x = s.x; l.z = s.z; l.alive = true; l.state = 'swim'; l.dive = 0; l.t = 0;
      }
      l.t -= dt;
      if (l.state === 'swim') {
        l.heading += (this.rng() - 0.5) * 0.8 * dt;
        if (dPlayer < 45 && player.mode === 'paddle') { l.state = this.rng() < 0.55 ? 'diving' : 'flee'; l.t = l.state === 'flee' ? 8 : 0.9; if (l.state === 'flee') l.heading = Math.atan2(-(l.z - player.z), l.x - player.x); }
        else if (l.t <= 0 && this.rng() < 0.004) { l.state = 'diving'; l.t = 0.9; }
      } else if (l.state === 'flee') {
        if (l.t <= 0) l.state = 'swim';
      } else if (l.state === 'diving') {
        l.dive = Math.min(1, l.dive + dt / 0.9);
        if (l.dive >= 1) { l.state = 'under'; l.t = 8 + this.rng() * 12; }
      } else if (l.state === 'under') {
        if (l.t <= 0) {
          for (let k = 0; k < 20; k++) { const a = this.rng() * 6.28, d = 15 + this.rng() * 35; const x = l.x + Math.cos(a) * d, z = l.z + Math.sin(a) * d; if (w.shoreAt(x, z) < -12) { l.x = x; l.z = z; break; } }
          l.state = 'surfacing'; l.heading = this.rng() * 6.28;
        }
      } else if (l.state === 'surfacing') {
        l.dive = Math.max(0, l.dive - dt / 0.9);
        if (l.dive <= 0) { l.state = 'swim'; l.t = 6; }
      }
      if (l.state === 'swim' || l.state === 'flee') {
        const sp = l.state === 'flee' ? 1.1 : 0.4;
        const nx = l.x + Math.cos(l.heading) * sp * dt, nz = l.z - Math.sin(l.heading) * sp * dt;
        if (w.shoreAt(nx, nz) < -8 && w.inBounds(nx, nz, 60)) { l.x = nx; l.z = nz; } else l.heading += Math.PI * 0.6;
      }
      l.call -= dt;
      if (l.call <= 0 && l.state === 'swim') { l.call = 30 + this.rng() * 60; if (this.audio) this.audio.loonCall(dPlayer, this.rng() < 0.6 ? 'wail' : 'tremolo'); }
      const level = w.levelAt(l.x, l.z);
      l.mesh.position.set(l.x, level - l.dive * 1.1, l.z);
      l.mesh.rotation.set(0, l.heading, l.dive * 0.6);
      l.mesh.visible = l.dive < 0.98;
    }
  }
}
