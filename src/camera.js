import * as THREE from 'three';
import { clamp } from './rng.js';

export class ChaseCamera {
  constructor(camera, dom, world) {
    this.camera = camera; this.world = world;
    this.distance = 10; this.yaw = 0; this.pitch = 0.27; this.userYaw = 0; this.userPitch = 0;
    this.pos = new THREE.Vector3(); this.look = new THREE.Vector3(); this.first = true;
    this.lastInput = 0;
    this.mode = 'third';
    this.head = new THREE.Vector3();
    window.addEventListener('keydown', (e) => { if (e.code === 'KeyV') this.setMode(this.mode === 'third' ? 'first' : 'third'); });
    let dragging = false, lx = 0, ly = 0;
    dom.addEventListener('pointerdown', (e) => { dragging = true; lx = e.clientX; ly = e.clientY; dom.setPointerCapture(e.pointerId); });
    dom.addEventListener('pointerup', () => { dragging = false; });
    dom.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      this.userYaw -= (e.clientX - lx) * 0.006; this.userPitch = clamp(this.userPitch - (e.clientY - ly) * 0.004, -0.25, 0.9);
      lx = e.clientX; ly = e.clientY; this.lastInput = performance.now();
    });
    dom.addEventListener('wheel', (e) => { this.distance = clamp(this.distance * Math.exp(e.deltaY * 0.0012), 4, 40); e.preventDefault(); }, { passive: false });
  }

  setMode(mode) {
    this.mode = mode;
    this.userYaw = 0; this.userPitch = 0;
    this.camera.fov = mode === 'first' ? 72 : 60;
    this.camera.updateProjectionMatrix();
    this.first = true;
  }

  update(dt, player, carrying) {
    if (this.mode === 'first') return this.updateFirst(dt, player, carrying);
    // ease the user's orbit back behind the canoe once they stop dragging and start moving
    if (performance.now() - this.lastInput > 2500 && Math.abs(player.speed) > 0.3) {
      const k = 1 - Math.exp(-dt * 0.8);
      this.userYaw -= this.userYaw * k; this.userPitch -= this.userPitch * k;
    }
    const yaw = player.heading + Math.PI + this.userYaw; // behind the canoe
    const pitch = this.pitch + this.userPitch;
    const dist = this.distance * (carrying ? 0.8 : 1);
    const tx = player.x, tz = player.z;
    const ty = (carrying ? this.world.heightAt(tx, tz) + 1.6 : this.world.levelAt(tx, tz) + 0.6);
    const px = tx + Math.cos(yaw) * Math.cos(pitch) * dist, pz = tz - Math.sin(yaw) * Math.cos(pitch) * dist;
    let py = ty + Math.sin(pitch) * dist;
    const ground = Math.max(this.world.heightAt(px, pz), this.world.levelAt(px, pz)) + 1.2;
    if (py < ground) py = ground;
    const k = this.first ? 1 : 1 - Math.exp(-dt * 5);
    this.pos.lerp(new THREE.Vector3(px, py, pz), k);
    this.look.lerp(new THREE.Vector3(tx + player.forward.x * 2, ty + 0.4, tz + player.forward.z * 2), this.first ? 1 : 1 - Math.exp(-dt * 8));
    this.first = false;
    this.camera.position.copy(this.pos);
    this.camera.lookAt(this.look);
  }

  // from the paddler's eyes; drag looks around, and the view drifts back ahead while moving
  updateFirst(dt, player, carrying) {
    const rig = player.canoe.rig;
    this.head.set(carrying ? 0.08 : -1.56, carrying ? 1.6 : 1.0, 0);
    rig.localToWorld(this.head);
    if (performance.now() - this.lastInput > 2500 && Math.abs(player.speed) > 0.3) {
      const k = 1 - Math.exp(-dt * 0.8);
      this.userYaw -= this.userYaw * k; this.userPitch -= this.userPitch * k;
    }
    const yaw = player.heading + this.userYaw;
    const pitch = clamp(-this.userPitch * 1.2, -0.7, 0.7);
    const k = this.first ? 1 : 1 - Math.exp(-dt * 14);
    this.pos.lerp(this.head, k);
    this.look.set(this.pos.x + Math.cos(yaw) * Math.cos(pitch), this.pos.y + Math.sin(pitch), this.pos.z - Math.sin(yaw) * Math.cos(pitch));
    this.first = false;
    this.camera.position.copy(this.pos);
    this.camera.lookAt(this.look);
  }
}
