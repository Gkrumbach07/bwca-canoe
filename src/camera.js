import * as THREE from 'three';
import { clamp } from './rng.js';

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
    // First person looks where the mouse is: the cursor's offset from the middle of the view turns the head
    // (right of centre looks right, up looks up), no click or capture needed, so the button is free for the
    // rod. Third person orbits by dragging unless something (the rod) has locked the orbit. The cursor is
    // kept in view coordinates for aiming.
    this.orbitLocked = false;
    this.cursor = { x: 0, y: 0, inside: false };
    this.lookYaw = 0; this.lookPitch = 0; // first person, eased toward where the cursor is
    this.focus = null; // { pos, look } world vectors: a close-up that overrides the chase while it is set
    this.forwardYaw = 0;    // the bearing straight into the view, for camera-relative walking (player.js)
    this.lastHeading = null; // the player's heading last frame: on foot the view holds its bearing while the body turns
    this.cursorSteer = false; // the canoe follows the cursor (settings): shown by the pointer
    window.addEventListener('keydown', (e) => { if (e.code === 'KeyV') this.setMode(this.mode === 'third' ? 'first' : 'third'); });
    let dragging = false, lx = 0, ly = 0;
    dom.addEventListener('pointerdown', (e) => {
      if (this.mode === 'first' || this.orbitLocked) return;
      dragging = true; lx = e.clientX; ly = e.clientY;
      try { dom.setPointerCapture(e.pointerId); } catch (_) { /* a synthetic pointer has no capture */ }
    });
    dom.addEventListener('pointerup', () => { dragging = false; });
    dom.addEventListener('pointermove', (e) => {
      const r = dom.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) { this.cursor.x = ((e.clientX - r.left) / r.width) * 2 - 1; this.cursor.y = -((e.clientY - r.top) / r.height) * 2 + 1; this.cursor.inside = true; }
      if (!dragging) return;
      const s = this.sensitivity, inv = this.invert ? -1 : 1;
      this.userYaw -= (e.clientX - lx) * 0.006 * s; this.userPitch = clamp(this.userPitch - (e.clientY - ly) * 0.004 * s * inv, -0.25, 0.9);
      lx = e.clientX; ly = e.clientY; this.lastInput = performance.now();
    });
    dom.addEventListener('pointerleave', () => { this.cursor.inside = false; });
    dom.addEventListener('wheel', (e) => { this.distance = clamp(this.distance * Math.exp(e.deltaY * 0.0012), 4, 40); e.preventDefault(); }, { passive: false });
  }

  // jump straight to the new spot (after a teleport) instead of gliding across the map
  snap() { this.first = true; this.userYaw = 0; this.userPitch = 0; this.lastHeading = null; }

  get dragging() { return performance.now() - this.lastInput < 200; }

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
    this.camera.fov = mode === 'first' ? 72 : 60;
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
    if (this.mode === 'first') return this.updateFirst(dt, player, onFoot);
    // The orbit is the player's. On foot the view keeps its bearing while the walker turns under it (the keys
    // are read against the view, so a view that swung with every turn would change where W goes), drifting
    // round behind only slowly while they walk on; afloat it eases back behind the hull once the drag is over.
    if (this.first || this.lastHeading === null) this.lastHeading = player.heading;
    let dh = player.heading - this.lastHeading; dh = Math.atan2(Math.sin(dh), Math.cos(dh)); this.lastHeading = player.heading;
    if (onFoot) this.userYaw -= dh;
    this.userYaw = Math.atan2(Math.sin(this.userYaw), Math.cos(this.userYaw));
    if (performance.now() - this.lastInput > 2500 && Math.abs(player.speed) > 0.3) {
      const k = 1 - Math.exp(-dt * (onFoot ? 0.25 : 0.8));
      this.userYaw -= this.userYaw * k; this.userPitch -= this.userPitch * k;
    }
    const yaw = player.heading + Math.PI + this.userYaw; // behind the canoe
    this.forwardYaw = player.heading + this.userYaw;
    const pitch = this.pitch + this.userPitch;
    const dist = this.distance * (onFoot ? 0.8 : 1);
    const tx = player.x, tz = player.z;
    const ty = (onFoot ? player.altitude + 1.6 : this.world.levelAt(tx, tz) + 0.6);
    const px = tx + Math.cos(yaw) * Math.cos(pitch) * dist, pz = tz - Math.sin(yaw) * Math.cos(pitch) * dist;
    let py = ty + Math.sin(pitch) * dist;
    // never below the ground or the water, anywhere along the line from the paddler to the camera: on a slope
    // the hill behind you lifts the camera instead of swallowing it
    for (let s = 0.2; s <= 1.001; s += 0.2) {
      const sx = tx + (px - tx) * s, sz = tz + (pz - tz) * s;
      const ground = Math.max(this.world.heightAt(sx, sz), this.world.levelAt(sx, sz)) + 1.5;
      const need = ty + (ground - ty) / s;
      if (py < need) py = need;
    }
    const k = this.first ? 1 : 1 - Math.exp(-dt * 5);
    this.pos.lerp(new THREE.Vector3(px, py, pz), k);
    this.look.lerp(new THREE.Vector3(tx + player.forward.x * 2, ty + 0.4, tz + player.forward.z * 2), this.first ? 1 : 1 - Math.exp(-dt * 8));
    this.first = false;
    this.camera.position.copy(this.pos);
    this.camera.lookAt(this.look);
  }

  // From the paddler's eyes. The head turns toward the cursor: a small dead zone in the middle keeps the view
  // steady ahead, the edges of the view look about 95 degrees round and 35 degrees up or down.
  updateFirst(dt, player, onFoot) {
    const rig = player.canoe.rig;
    if (player.mode === 'swim') this.head.set(player.x, this.world.levelAt(player.x, player.z) + 0.32, player.z);
    else { this.head.set(onFoot ? 0.08 : -1.56, onFoot ? 1.6 : 1.0, 0); rig.localToWorld(this.head); } // standing, the rig origin is at the feet
    if (this.cursor.inside) {
      const dz = 0.06, shape = (v) => { const a = Math.abs(v); return a <= dz ? 0 : Math.sign(v) * Math.min(1, Math.pow((a - dz) / (1 - dz), 1.25)); };
      const ke = this.first ? 1 : 1 - Math.exp(-dt * 9);
      this.lookYaw += (-shape(this.cursor.x) * 1.65 - this.lookYaw) * ke;
      this.lookPitch += (shape(this.cursor.y) * 0.6 - this.lookPitch) * ke;
    }
    this.userYaw = this.lookYaw;
    const yaw = player.heading + this.lookYaw;
    this.forwardYaw = yaw;
    const pitch = clamp(this.lookPitch, -0.7, 0.7);
    const k = this.first ? 1 : 1 - Math.exp(-dt * 14);
    this.pos.lerp(this.head, k);
    this.look.set(this.pos.x + Math.cos(yaw) * Math.cos(pitch), this.pos.y + Math.sin(pitch), this.pos.z - Math.sin(yaw) * Math.cos(pitch));
    this.first = false;
    this.camera.position.copy(this.pos);
    this.camera.lookAt(this.look);
  }
}
