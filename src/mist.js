import * as THREE from 'three';
import { fogState } from './fog.js';

// The dawn's mist on the water (fb G, 2026-10-24). It had been two flat translucent sheets that followed the canoe: from
// the canoe they read as a layer hovering over the lake with a hard line through the far shore, and from above their
// near fade drew a hard curve on the water (the owner's 73 and 74). Now it is part of the air itself (fog.js, the
// mist): a density that is thickest on the water and thins with height (MIST.height metres to fall to a third) and with
// distance from the eye (MIST.reach), integrated along every view ray in closed form and broken into drifting banks by a
// noise in world metres. Every material that fogs takes it, so it has no edge anywhere: the far shore's foot goes soft
// and the treetops stand out of it, the water under a high camera lies under a patchy veil, and it closes in around the
// canoe without ever cutting across the view.
//
// The day cycle (daycycle.js) drives it as before through setAmount and setColor and the one "layer" it keeps for its
// fog-weather lift: the layer's uLift raised by the weather is read here as the mist growing taller as it lifts, never
// as a sheet rising off the water.
export const MIST = {
  density: 0.05,   // per metre at the water at full amount (at the canoe's eye, a metre up, about half of it)
  height: 1.8,     // metres: the scale height (thins to a third this far up)
  level: 0.07,     // the share of it a level ray takes (a ray down onto the water takes all of it)
  reach: 520,      // metres: the mist past this far adds little (the far shore stays a shape)
  near: 18,        // metres: it thins toward the eye over about this far (the canoe and the water by it stay clear)
  banks: 0.022,    // 1 / metres: the banks' size (about 45 m across)
  patchy: 0.9,     // 0 even .. 1 in banks with clear lanes between
  drift: 0.35,     // metres a second the banks drift (with the wind when there is one)
  glow: 0.55,      // the mist toward a low sun, brighter by this much of its colour
  lift: 0.4,       // metres of scale height per metre the weather lifts the layer
};
const BASE_LIFT = 0.5;

export class Mist {
  constructor(water) {
    this.water = water;
    this.group = new THREE.Group(); // nothing is drawn here: the mist is in the air (fog.js); kept for main.js's scene.add
    this.group.name = 'mist';
    this.wind = null;               // main.js (fb G): the wind the banks drift with
    // the day cycle's handles: the amount, the colour and the fog weather's lift, as one layer
    this.layers = [{ uniforms: { uLift: { value: BASE_LIFT }, uAmount: { value: 0 }, uColor: { value: new THREE.Color(0xdfe7ec) } } }];
    this.amount = 0; this.level = null; this.levelT = 0;
    this.knobs = MIST; // for live tuning (window.__game.mist.knobs)
    this.drift = new THREE.Vector2(0, 0);
  }
  setAmount(a) { this.amount = a; for (const m of this.layers) m.uniforms.uAmount.value = a; }
  setColor(c) { for (const m of this.layers) m.uniforms.uColor.value.copy(c); }
  // per frame, after the day cycle: the water's level under the canoe, the drift, and the air's mist uniforms
  update(dt, x, z) {
    const M = fogState.mist, N = fogState.mistNoise, L = this.layers[0].uniforms, a = Math.max(0, Math.min(1.5, this.amount));
    if ((this.levelT -= dt) <= 0 || this.level === null) {
      this.levelT = 0.5;
      const w = this.water && this.water.world, lv = w ? w.levelAt(x, z, 12) : NaN;
      if (Number.isFinite(lv)) this.level = lv;
    }
    // the banks drift downwind (a slow westerly with no wind object) and turn over slowly as they go
    const wd = this.wind && this.wind.dir, ws = this.wind ? Math.min(1.6, 0.25 + (this.wind.speed || 0) * 0.08) : 1;
    const dx = wd ? wd.x : 0.8, dz = wd ? wd.z : 0.6;
    this.drift.x -= dx * MIST.drift * ws * dt; this.drift.y -= dz * MIST.drift * ws * dt;
    if (a < 0.002 || this.level === null) { M[3] = 0; return; }
    const lift = Math.max(0, L.uLift.value - BASE_LIFT);
    M[0] = MIST.density * Math.pow(a, 1.2);
    M[1] = this.level - 0.15;
    M[2] = MIST.height + lift * MIST.lift;
    M[3] = MIST.reach * (1 + 0.6 * lift / 5);
    N[0] = this.drift.x; N[1] = this.drift.y; N[2] = MIST.banks; N[3] = MIST.patchy * (1 - 0.5 * Math.min(1, lift / 5));
    const c = L.uColor.value;
    fogState.mistColor[0] = c.r; fogState.mistColor[1] = c.g; fogState.mistColor[2] = c.b; fogState.mistColor[3] = MIST.level;
    fogState.mistSun[0] = c.r * MIST.glow; fogState.mistSun[1] = c.g * MIST.glow * 0.85; fogState.mistSun[2] = c.b * MIST.glow * 0.62; fogState.mistSun[3] = MIST.near;
  }
}
