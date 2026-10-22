// Publishes the canoe's real-world position as a simulated GPS fix:
//  - to the companion browser extension (extension/), which spoofs navigator.geolocation in every tab
//  - to same-origin tabs via BroadcastChannel + localStorage
//  - to this page's own navigator.geolocation
export class GeoBridge {
  constructor() {
    this.linked = false; this.enabled = true; this.lastHello = 0; this.last = null; this.lastSent = 0;
    this.watchers = new Map(); this.nextId = 1;
    window.addEventListener('message', (e) => {
      if (e.source !== window || !e.data || e.data.source !== 'bwca-geo-ext') return;
      this.lastHello = performance.now(); this.enabled = e.data.enabled !== false;
    });
    try { this.channel = new BroadcastChannel('bwca-canoe-geo'); } catch { this.channel = null; }
    this.ping(); setInterval(() => this.ping(), 4000);
    this.installLocalOverride();
  }
  ping() { window.postMessage({ source: 'bwca-canoe', type: 'ping' }, '*'); }
  update(player, world) {
    this.linked = performance.now() - this.lastHello < 9000;
    const now = performance.now();
    if (now - this.lastSent < 300) return;
    this.lastSent = now;
    const { lat, lon } = world.toLatLon(player.x, player.z);
    const fix = {
      lat, lon, alt: player.altitude, accuracy: 4,
      heading: (90 - (player.heading * 180) / Math.PI + 360) % 360,
      speed: player.groundSpeed ?? Math.abs(player.speed), timestamp: Date.now(), mode: player.mode,
    };
    this.last = fix;
    window.postMessage({ source: 'bwca-canoe', type: 'geo', fix }, '*');
    this.channel?.postMessage(fix);
    try { localStorage.setItem('bwca-canoe-geo', JSON.stringify(fix)); } catch {}
    for (const w of this.watchers.values()) w(this.position());
  }
  position() {
    const f = this.last;
    return { coords: { latitude: f.lat, longitude: f.lon, accuracy: f.accuracy, altitude: f.alt, altitudeAccuracy: 10, heading: f.heading, speed: f.speed }, timestamp: f.timestamp };
  }
  installLocalOverride() {
    const self = this;
    const fake = {
      getCurrentPosition(ok, err) { if (self.last) setTimeout(() => ok(self.position()), 0); else if (err) setTimeout(() => err({ code: 2, message: 'no fix yet' }), 0); },
      watchPosition(ok) { const id = self.nextId++; self.watchers.set(id, ok); if (self.last) setTimeout(() => ok(self.position()), 0); return id; },
      clearWatch(id) { self.watchers.delete(id); },
    };
    try { Object.defineProperty(navigator, 'geolocation', { value: fake, configurable: true }); } catch {}
  }
}
