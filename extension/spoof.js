// Runs in the page's MAIN world before any page script: replaces navigator.geolocation
// with one fed by the BWCA Canoe game (via bridge.js) and falls back to the real API when disabled.
(() => {
  if (window.__bwcaGeoSpoof) return;
  window.__bwcaGeoSpoof = true;
  const orig = navigator.geolocation;
  const state = { enabled: null, fix: null }; // enabled === null until the bridge reports in
  const watchers = new Map();
  const pending = [];
  let nextId = 1;
  const toPos = (fix) => {
    const coords = { latitude: fix.lat, longitude: fix.lon, accuracy: fix.accuracy ?? 5, altitude: fix.alt ?? null, altitudeAccuracy: fix.alt != null ? 10 : null, heading: fix.heading ?? null, speed: fix.speed ?? null };
    coords.toJSON = () => ({ ...coords, toJSON: undefined });
    return { coords, timestamp: fix.timestamp || Date.now(), toJSON() { return { coords: coords.toJSON(), timestamp: this.timestamp }; } };
  };
  const whenKnown = (fn) => {
    if (state.enabled !== null) return fn();
    pending.push(fn);
    setTimeout(() => { const i = pending.indexOf(fn); if (i >= 0) { pending.splice(i, 1); fn(); } }, 1500);
  };
  window.addEventListener('message', (e) => {
    if (e.source !== window || !e.data || e.data.source !== 'bwca-geo-bridge' || e.data.type !== 'state') return;
    state.enabled = !!e.data.enabled;
    state.fix = e.data.fix || null;
    for (const fn of pending.splice(0)) fn();
    if (state.enabled && state.fix) for (const w of watchers.values()) if (w.success) w.success(toPos(state.fix));
  });
  const unavailable = () => ({ code: 2, message: 'BWCA Canoe GPS: no fix yet — start paddling in the game', PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 });
  const fake = {
    getCurrentPosition(success, error, options) {
      whenKnown(() => {
        if (!state.enabled) return orig.getCurrentPosition.call(orig, success, error, options);
        if (state.fix) setTimeout(() => success(toPos(state.fix)), 0);
        else if (error) setTimeout(() => error(unavailable()), 0);
      });
    },
    watchPosition(success, error, options) {
      const id = nextId++;
      whenKnown(() => {
        if (state.enabled) { watchers.set(id, { success, error }); if (state.fix) setTimeout(() => success(toPos(state.fix)), 0); }
        else watchers.set(id, { real: orig.watchPosition.call(orig, success, error, options) });
      });
      return id;
    },
    clearWatch(id) { const w = watchers.get(id); if (w && w.real !== undefined) orig.clearWatch.call(orig, w.real); watchers.delete(id); },
  };
  try { Object.defineProperty(Navigator.prototype, 'geolocation', { get: () => fake, configurable: true }); }
  catch { try { Object.defineProperty(navigator, 'geolocation', { value: fake, configurable: true }); } catch {} }
  if (navigator.permissions && navigator.permissions.query) {
    const oq = navigator.permissions.query.bind(navigator.permissions);
    navigator.permissions.query = (desc) => {
      if (desc && desc.name === 'geolocation' && state.enabled) return Promise.resolve({ name: 'geolocation', state: 'granted', onchange: null, addEventListener() {}, removeEventListener() {} });
      return oq(desc);
    };
  }
})();
