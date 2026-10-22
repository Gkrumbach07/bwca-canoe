// Player settings: persisted in localStorage (save.js, namespace `settings`), applied to the running game
// the moment they change, and edited in the panel the title screen opens. The key shortcuts (R, N, V, 1-3)
// keep working: R and N route through here so the panel shows the truth; V and 1-3 change the live value,
// the setting is the default a trip starts with.
import { save } from './save.js';
import { LOD_SCALE } from './vegetation.js';

export const DEFAULTS = {
  shadows: '2048',      // 'off' | '1024' | '2048' | '4096'
  lod: 1,               // tree LOD and cull distance scale
  reflections: true,    // the canoe's mirror pass on the water
  renderScale: 1,       // 0.5..1 of the device pixel ratio (capped at 2)
  fps: false,           // FPS / triangle counter
  volume: 1,            // 0..1
  mute: false,
  invertLook: false,
  sensitivity: 1,       // mouse look, 0.3..3
  speed: 1,             // default game speed 1 | 2 | 4
  camera: 'third',      // default camera 'third' | 'first'
};

const pct = (v) => `${Math.round(v * 100)} %`;
export const SCHEMA = [
  { group: 'Quality' },
  { key: 'shadows', label: 'Shadows', type: 'select', options: [['off', 'Off'], ['1024', 'Soft (1024)'], ['2048', 'Standard (2048)'], ['4096', 'Sharp (4096)']] },
  { key: 'lod', label: 'Tree detail distance', type: 'range', min: 0.5, max: 2, step: 0.25, format: (v) => `${v}×` },
  { key: 'renderScale', label: 'Render scale', type: 'range', min: 0.5, max: 1, step: 0.05, format: pct },
  { key: 'reflections', label: 'Canoe reflection on the water', type: 'toggle', hint: 'R' },
  { key: 'fps', label: 'Show FPS and triangles', type: 'toggle' },
  { group: 'Sound' },
  { key: 'volume', label: 'Volume', type: 'range', min: 0, max: 1, step: 0.05, format: pct },
  { key: 'mute', label: 'Mute', type: 'toggle', hint: 'N' },
  { group: 'Controls' },
  { key: 'sensitivity', label: 'Mouse sensitivity', type: 'range', min: 0.3, max: 3, step: 0.1, format: (v) => `${v.toFixed(1)}×` },
  { key: 'invertLook', label: 'Invert look', type: 'toggle' },
  { key: 'speed', label: 'Game speed at the start of a trip', type: 'select', parse: Number, options: [[1, '1× · realistic'], [2, '2×'], [4, '4×']], hint: '1 2 3' },
  { key: 'camera', label: 'Camera at the start of a trip', type: 'select', options: [['third', 'Behind the canoe'], ['first', 'From the paddler’s seat']], hint: 'V' },
];

export class Settings {
  constructor() {
    const stored = save.read('settings', {}) || {};
    this.values = { ...DEFAULTS };
    for (const k of Object.keys(DEFAULTS)) if (k in stored && typeof stored[k] === typeof DEFAULTS[k]) this.values[k] = stored[k];
    this.listeners = new Set();
    this.t = null; // the game objects, once attached
  }
  get(k) { return this.values[k]; }
  set(k, v) {
    if (!(k in DEFAULTS) || this.values[k] === v) return;
    this.values[k] = v;
    save.write('settings', this.values);
    this.apply(k);
    for (const fn of this.listeners) fn(k, v);
  }
  toggle(k) { this.set(k, !this.values[k]); }
  reset() { for (const k of Object.keys(DEFAULTS)) this.set(k, DEFAULTS[k]); }
  onChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }

  // Wire the settings to the game and apply every one of them once.
  // targets: { renderer, scene, sun, water, post, audio, chase, player, stats }
  attach(targets) {
    this.t = targets;
    for (const k of Object.keys(DEFAULTS)) this.apply(k, true);
  }

  apply(k, initial = false) {
    const t = this.t; if (!t) return;
    const v = this.values[k];
    switch (k) {
      case 'shadows': {
        const on = v !== 'off', size = on ? parseInt(v, 10) : 0;
        t.renderer.shadowMap.enabled = on;
        t.sun.castShadow = on;
        if (on) t.sun.shadow.mapSize.set(size, size); // the shadow pass resizes its target when this differs
        if (!initial) refreshMaterials(t.scene); // programs with/without shadow sampling
        break;
      }
      case 'lod': LOD_SCALE.value = v; break;
      case 'reflections': t.water.reflectionsOn = v; break;
      case 'renderScale': {
        t.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2) * v);
        t.post.composer.setPixelRatio(t.renderer.getPixelRatio()); // re-sizes the passes too
        break;
      }
      case 'fps': if (t.stats) t.stats.enabled = v; break;
      case 'volume': t.audio.setVolume(v); break;
      case 'mute': t.audio.setEnabled(!v); break;
      case 'invertLook': t.chase.invert = v; break;
      case 'sensitivity': t.chase.sensitivity = v; break;
      case 'speed': if (initial) t.player.timeScale = v; break;
      case 'camera': if (initial && t.chase.mode !== v) t.chase.setMode(v); break;
      default: break;
    }
  }
}

function refreshMaterials(scene) {
  const seen = new Set();
  scene.traverse((o) => {
    const m = o.material; if (!m) return;
    for (const mm of Array.isArray(m) ? m : [m]) if (!seen.has(mm)) { seen.add(mm); mm.needsUpdate = true; }
  });
}

// The settings form: one row per schema entry, built into `form`, reflecting the values and writing them
// back as they change. Native controls, so Tab, the arrows and Space all work.
export class SettingsPanel {
  constructor(settings, form) {
    this.settings = settings; this.form = form; this.controls = new Map();
    form.addEventListener('submit', (e) => e.preventDefault());
    this.build();
    settings.onChange((k) => this.refresh(k));
  }
  build() {
    const f = this.form; f.textContent = '';
    for (const row of SCHEMA) {
      if (row.group) { const h = document.createElement('h3'); h.textContent = row.group; f.appendChild(h); continue; }
      const id = `set-${row.key}`;
      const label = document.createElement('label'); label.className = `set-row set-${row.type}`; label.htmlFor = id;
      const name = document.createElement('span'); name.className = 'set-name'; name.textContent = row.label;
      if (row.hint) { const kbd = document.createElement('kbd'); kbd.textContent = row.hint; kbd.title = 'key shortcut'; name.appendChild(kbd); }
      label.appendChild(name);
      let input, value = null;
      if (row.type === 'select') {
        input = document.createElement('select');
        for (const [val, text] of row.options) { const o = document.createElement('option'); o.value = String(val); o.textContent = text; input.appendChild(o); }
        input.addEventListener('change', () => this.settings.set(row.key, row.parse ? row.parse(input.value) : input.value));
      } else if (row.type === 'range') {
        input = document.createElement('input'); input.type = 'range'; input.min = row.min; input.max = row.max; input.step = row.step;
        value = document.createElement('output'); value.className = 'set-value';
        input.addEventListener('input', () => this.settings.set(row.key, parseFloat(input.value)));
      } else {
        input = document.createElement('input'); input.type = 'checkbox'; input.className = 'set-toggle';
        input.addEventListener('change', () => this.settings.set(row.key, input.checked));
      }
      input.id = id;
      label.appendChild(input);
      if (value) label.appendChild(value);
      f.appendChild(label);
      this.controls.set(row.key, { row, input, value });
      this.refresh(row.key);
    }
    const reset = document.createElement('button'); reset.type = 'button'; reset.className = 'set-reset'; reset.textContent = 'Reset to defaults';
    reset.addEventListener('click', () => this.settings.reset());
    f.appendChild(reset);
  }
  refresh(k) {
    const c = this.controls.get(k); if (!c) return;
    const v = this.settings.get(k);
    if (c.row.type === 'toggle') c.input.checked = !!v;
    else c.input.value = String(v);
    if (c.value) c.value.value = c.row.format ? c.row.format(v) : String(v);
  }
}

// Frames per second, triangles and draw calls over the last half second, when enabled. The renderer's
// counters are reset here (not by the renderer) so every pass of the frame (shadows, reflection, the
// composer) is counted: call begin() before drawing and end() after.
export class FpsCounter {
  constructor(el, renderer) {
    this.el = el; this.renderer = renderer; this._enabled = false;
    this.frames = 0; this.acc = 0;
    renderer.info.autoReset = false;
  }
  get enabled() { return this._enabled; }
  set enabled(v) { this._enabled = !!v; this.el.hidden = !this._enabled; if (!v) { this.frames = 0; this.acc = 0; } }
  begin() { this.renderer.info.reset(); }
  end(dt) {
    if (!this._enabled) return;
    this.frames++; this.acc += dt;
    if (this.acc < 0.5) return;
    const r = this.renderer.info.render;
    this.el.textContent = `${Math.round(this.frames / this.acc)} fps · ${fmtCount(r.triangles)} tris · ${r.calls} calls`;
    this.frames = 0; this.acc = 0;
  }
}
const fmtCount = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(2)} M` : n >= 1e3 ? `${(n / 1e3).toFixed(0)} k` : String(n));
