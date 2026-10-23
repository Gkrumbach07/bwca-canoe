import * as THREE from 'three';
import { clamp } from './rng.js';

const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

export class ChaseCamera {
  constructor(camera, dom, world) {
    this.camera = camera; this.world = world;
    this.distance = 10; this.yaw = 0; this.pitch = 0.27; this.userYaw = 0; this.userPitch = 0;
    this.pos = new THREE.Vector3(); this.look = new THREE.Vector3(); this.first = true;
    this.lastInput = 0;
    this.mode = 'third';
    this.sensitivity = 1; this.invert = false; // mouse look, set from the settings panel
    this.head = new THREE.Vector3();
    this.dom = dom;
    // The mouse looks the way it does in Minecraft wherever the body faces the look: in first person, and on
    // foot in third person (the camera sits behind the walker, who turns with the mouse). The pointer is
    // captured on the first key or click once the game is running, every movement turns the look at once,
    // and Esc gives the pointer back (Esc again opens the menu). Without the capture (refused, or released)
    // holding the button and dragging looks the same way. From behind the canoe the cursor stays free: a drag
    // orbits unless something (the rod) has locked the orbit, and the cursor is kept in view coordinates for
    // aiming and steering. Captured, there is no cursor and the rod aims down the middle of the view.
    this.orbitLocked = false;
    this.cursor = { x: 0, y: 0, inside: false };
    this.locked = false;
    this.allowLock = false;  // main: the game is running, with no card, panel or big map up
    this.footLook = false;   // third person on foot
    this.viewYaw = 0; this.viewPitch = 0; // the look: bearing and tilt, world space
    this.lookYaw = 0;        // the look's bearing relative to the body (the bow seeks it when asked)
    this.focus = null; // { pos, look } world vectors: a close-up that overrides the chase while it is set
    this.forwardYaw = 0;    // the bearing straight into the view: what W means (player.js)
    this.lastHeading = null; // the player's heading last frame
    this.cursorSteer = false; // the canoe follows the cursor (settings): shown by the pointer
    const lock = () => {
      if (!this.wantsLock || this.locked) return;
      try { const p = dom.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (_) { /* not allowed here; dragging looks instead */ }
    };
    document.addEventListener('pointerlockchange', () => { this.locked = document.pointerLockElement === dom; if (this.locked) this.cursor.inside = false; });
    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyV') this.setMode(this.mode === 'third' ? 'first' : 'third');
      lock(); // any key will do: the first W takes the mouse
    });
    let dragging = false, lx = 0, ly = 0;
    dom.addEventListener('pointerdown', (e) => {
      if (this.mouseLook) { lock(); dragging = true; return; }
      if (this.orbitLocked) return;
      dragging = true; lx = e.clientX; ly = e.clientY;
      try { dom.setPointerCapture(e.pointerId); } catch (_) { /* a synthetic pointer has no capture */ }
    });
    dom.addEventListener('pointerup', () => { dragging = false; });
    dom.addEventListener('pointermove', (e) => {
      const s = this.sensitivity, inv = this.invert ? -1 : 1;
      if (this.mouseLook) {
        if (!this.locked && !dragging) { this.trackCursor(e); return; }
        this.viewYaw = wrap(this.viewYaw - e.movementX * 0.0022 * s);
        this.viewPitch = clamp(this.viewPitch - e.movementY * 0.0022 * s * inv, -1.25, 1.25);
        this.forwardYaw = this.viewYaw; // the body reads it this very frame
        this.lastInput = performance.now();
        return;
      }
      this.trackCursor(e);
      if (!dragging) return;
      this.userYaw -= (e.clientX - lx) * 0.006 * s; this.userPitch = clamp(this.userPitch - (e.clientY - ly) * 0.004 * s * inv, -0.25, 0.9);
      lx = e.clientX; ly = e.clientY; this.lastInput = performance.now();
    });
    dom.addEventListener('pointerleave', () => { this.cursor.inside = false; });
    dom.addEventListener('wheel', (e) => { this.distance = clamp(this.distance * Math.exp(e.deltaY * 0.0012), 4, 40); e.preventDefault(); }, { passive: false });
  }

  get mouseLook() { return this.mode === 'first' || this.footLook; }
  get wantsLock() { return this.allowLock && this.mouseLook; }

  // jump straight to the new spot (after a teleport) instead of gliding across the map
  snap() { this.first = true; this.userYaw = 0; this.userPitch = 0; this.lastHeading = null; }

  get dragging() { return performance.now() - this.lastInput < 200; }

  trackCursor(e) {
    const r = this.dom.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) { this.cursor.x = ((e.clientX - r.left) / r.width) * 2 - 1; this.cursor.y = -((e.clientY - r.top) / r.height) * 2 + 1; this.cursor.inside = true; }
  }

  setCursorSteer(on) { this.cursorSteer = on; this.dom.style.cursor = on ? 'crosshair' : ''; }

  // Where the ray through the cursor meets the horizontal plane at height y: { x, z } in world space, or null
  // when the cursor is off the page, above the horizon or too far out.
  cursorOnPlane(y) {
    if (!this.cursor.inside) return null;
    const p = new THREE.Vector3(this.cursor.x, this.cursor.y, 0.5).unproject(this.camera);
    const o = this.camera.position, d = p.sub(o);
    if (d.y >= -1e-4) return null;
    const t = (y - o.y) / d.y;
    if (!(t >= 0 && t <= 600)) return null; // also catches a NaN projection (a zero-sized view)
    const x = o.x + d.x * t, z = o.z + d.z * t;
    return Number.isFinite(x) && Number.isFinite(z) ? { x, z } : null;
  }

  setMode(mode) {
    this.mode = mode;
    this.userYaw = 0; this.userPitch = 0;
    if (this.lastHeading !== null) this.forwardYaw = this.lastHeading; // straight ahead until the first frame
    this.camera.fov = mode === 'first' ? 72 : 60;
    // from the eyes the hands, the paddle and the rod come within a few centimetres: a near plane close in
    this.camera.near = mode === 'first' ? 0.05 : 0.3;
    this.camera.updateProjectionMatrix();
    this.first = true;
  }

  update(dt, player, carrying) {
    if (this.focus) {
      const k = this.first ? 1 : 1 - Math.exp(-dt * 4);
      this.pos.lerp(this.focus.pos, k); this.look.lerp(this.focus.look, k);
      this.first = false;
      this.camera.position.copy(this.pos);
      this.camera.lookAt(this.look);
      return;
    }
    const onFoot = carrying || player.mode === 'carry' || player.mode === 'walk';
    const footLook = this.mode === 'third' && onFoot;
    if (footLook && !this.footLook) { this.viewYaw = player.heading; this.viewPitch = 0; this.forwardYaw = player.heading; } // stepping out: look where the body faces
    this.footLook = footLook;
    if (this.locked && !this.wantsLock) { try { document.exitPointerLock(); } catch (_) { /* nothing to release */ } }
    this.lastHeading = player.heading;
    if (this.mode === 'first') return this.updateFirst(dt, player);
    let yaw, pitch;
    if (footLook) {
      // the camera sits behind the walker, who faces the look; the mouse's tilt swings the camera up or down
      if (this.first) { this.viewYaw = player.heading; this.viewPitch = 0; }
      this.userYaw = 0; this.userPitch = 0;
      this.forwardYaw = this.viewYaw;
      yaw = player.heading + Math.PI;
      pitch = clamp(this.pitch - this.viewPitch * 0.6, -0.1, 1.1);
    } else {
      // behind the canoe: a drag orbits, and the view eases back behind the hull once the drag is over
      this.userYaw = wrap(this.userYaw);
      if (performance.now() - this.lastInput > 2500 && Math.abs(player.speed) > 0.3) {
        const k = 1 - Math.exp(-dt * 0.8);
        this.userYaw -= this.userYaw * k; this.userPitch -= this.userPitch * k;
      }
      yaw = player.heading + Math.PI + this.userYaw;
      this.forwardYaw = player.heading + this.userYaw;
      pitch = this.pitch + this.userPitch;
    }
    const dist = this.distance * (onFoot ? 0.8 : 1);
    const tx = player.x, tz = player.z;
    const ty = (onFoot ? player.altitude + 1.6 : this.world.levelAt(tx, tz) + 0.6);
    const px = tx + Math.cos(yaw) * Math.cos(pitch) * dist, pz = tz - Math.sin(yaw) * Math.cos(pitch) * dist;
    let py = ty + Math.sin(pitch) * dist;
    // never below the ground or the water, anywhere along the line from the paddler to the camera: on a slope
    // the hill behind you lifts the camera instead of swallowing it
    const tiles = this.world.tiles;
    for (let s = 0.2; s <= 1.001; s += 0.2) {
      const sx = tx + (px - tx) * s, sz = tz + (pz - tz) * s;
      const h = tiles ? tiles.groundAt(sx, sz) : this.world.heightAt(sx, sz); // the drawn ground (tiles.js)
      const ground = Math.max(h, this.world.levelAt(sx, sz)) + 1.5;
      const need = ty + (ground - ty) / s;
      if (py < need) py = need;
    }
    const k = this.first ? 1 : 1 - Math.exp(-dt * (footLook ? 12 : 5));
    this.pos.lerp(new THREE.Vector3(px, py, pz), k);
    this.look.lerp(new THREE.Vector3(tx + player.forward.x * 2, ty + 0.4, tz + player.forward.z * 2), this.first ? 1 : 1 - Math.exp(-dt * (footLook ? 16 : 8)));
    this.first = false;
    this.camera.position.copy(this.pos);
    this.camera.lookAt(this.look);
  }

  // From the paddler's eyes. The look is the mouse's, at once, and fixed in the world: on foot and swimming
  // the body faces it (player.js reads forwardYaw); seated, the hull turns under it, and with steering by
  // the look the bow comes round to where you are looking. Entering the view (or a snap) looks straight ahead.
  // The eye is the rig's (canoe.js eye): just ahead of the face in the direction of the look, carried with
  // the body exactly (no lag behind a moving body), so no angle looks into the body.
  updateFirst(dt, player) {
    if (this.first) { this.viewYaw = player.heading; this.viewPitch = 0; }
    this.viewYaw = wrap(this.viewYaw);
    this.lookYaw = wrap(this.viewYaw - player.heading);
    this.userYaw = this.lookYaw;
    const yaw = this.viewYaw;
    this.forwardYaw = yaw;
    const pitch = this.viewPitch;
    player.canoe.eye(this.head, wrap(yaw - player.heading), pitch, dt);
    this.pos.copy(this.head);
    this.look.set(this.pos.x + Math.cos(yaw) * Math.cos(pitch), this.pos.y + Math.sin(pitch), this.pos.z - Math.sin(yaw) * Math.cos(pitch));
    this.first = false;
    this.camera.position.copy(this.pos);
    this.camera.lookAt(this.look);
  }
}
