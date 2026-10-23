// Player settings: persisted in localStorage (save.js, namespace `settings`), applied to the running game
// the moment they change, and edited in the panel the title screen opens. The key shortcuts (R, N, V, 1-3)
// keep working: R and N route through here so the panel shows the truth; V and 1-3 change the live value,
// the setting is the default a trip starts with. The HUD group says how much the HUD says while you paddle
// (hud.js reads it every frame); Developer gathers what left the HUD: the GPS sim, FPS and triangles, tiles.
import { save } from './save.js';
import { LOD_SCALE } from './vegetation.js';
import { CULL } from './tiles.js';
import { REFLECTION } from './water.js';
import { PRESETS, PRESET_NAMES, PRESET_KEYS, benchmark } from './quality.js';

export const DEFAULTS = {
  // the display: a preset (quality.js) sets the rows after it; changing one of them by hand makes it 'custom'
  quality: 'auto',      // 'auto' | 'low' | 'medium' | 'high' | 'ultra' | 'custom'
  autoPick: '',         // what Auto chose on its benchmark ('' until it has run): not a row of the panel
  shadows: '2048',      // 'off' | '1024' | '2048' | '4096': the sun's shadow map size per cascade (sunlight.js)
  shadowReach: 300,     // metres the far cascade reaches; under 300 the small things past 60 m drop out of it (tiles.js CULL.farSmall)
  lod: 1,               // tree LOD and cull distance scale
  vegDensity: 1,        // the share of the understory and the scree drawn, 0.5..1 (the trees are never thinned)
  reflections: true,    // the mirror pass: the shore, its trees and the canoe in the water (off: the sky alone)
  reflectionScale: 0.25, // the mirror pass's size against the drawing buffer, each way (water.js REFLECTION.scale)
  antialias: '4',       // '4' | '2' (MSAA samples) | 'fxaa' | 'off' (post.js)
  godRays: true,        // the sun's shafts (post.js)
  renderScale: 1,       // 0.5..1 of the device pixel ratio (capped at 2)
  volume: 1,            // 0..1
  mute: false,
  invertLook: false,
  sensitivity: 1,       // mouse look, 0.3..3
  cursorSteer: false,   // the bow seeks the cursor's point on the water while you paddle
  speed: 1,             // default game speed 1 | 2 | 4
  camera: 'third',      // default camera 'third' | 'first'
  // the HUD
  density: 'standard',  // 'quiet' | 'standard' | 'full'
  placeTitles: true,    // the place title on arriving at a lake, and the day card at dawn
  compass: 'always',    // 'wind' (when the wind matters) | 'always' (faint) | 'never'
  readout: 'hold',      // 'hold' Tab | 'toggle' Tab | 'always'
  cornerMap: false,     // a small map that stays up, the old way
  journalLines: true,   // the notes at the bottom left
  keyHints: true,       // the key on the action line
  hudScale: 1,          // 0.8..1.4
  cbMarks: false,       // shape as well as colour on the balance arc and the tension line
  // developer
  fps: false,           // FPS and triangles in the readout
  devRows: false,       // tiles and the GPS sim in the readout
};

const pct = (v) => `${Math.round(v * 100)} %`;
// the sections of the settings card: one row per setting (type select | range | toggle | radio | status)
export const SECTIONS = [
  { id: 'display', label: 'Display', rows: [
    { key: 'quality', label: 'Quality', desc: 'Sets the rows below · Auto picks from a short test', type: 'select',
      options: (s) => [['auto', s && s.values.autoPick ? `Auto · ${PRESET_NAMES[s.values.autoPick] || s.values.autoPick}` : 'Auto'], ['low', 'Low'], ['medium', 'Medium'], ['high', 'High'], ['ultra', 'Ultra'], ['custom', 'Custom']] },
    { key: 'shadows', label: 'Shadows', desc: 'Two cascades: near and far · the size of each', type: 'select', options: [['off', 'Off'], ['1024', 'Soft (1024)'], ['2048', 'Standard (2048)'], ['4096', 'Sharp (4096)']] },
    { key: 'shadowReach', label: 'Shadow distance', type: 'range', min: 100, max: 300, step: 20, format: (v) => `${v} m` },
    { key: 'lod', label: 'Tree detail distance', type: 'range', min: 0.5, max: 2, step: 0.25, format: (v) => `${v}×` },
    { key: 'vegDensity', label: 'Undergrowth', desc: 'The shrubs, saplings, ferns and scree drawn', type: 'range', min: 0.5, max: 1, step: 0.05, format: pct },
    { key: 'renderScale', label: 'Render scale', type: 'range', min: 0.5, max: 1, step: 0.05, format: pct },
    { key: 'antialias', label: 'Anti-aliasing', type: 'select', options: [['4', 'MSAA 4×'], ['2', 'MSAA 2×'], ['fxaa', 'FXAA'], ['off', 'Off']] },
    { key: 'reflections', label: 'Shore and sky in the water', desc: 'R toggles it · the shore, its trees and the canoe mirrored with the sky, a second pass over the scene; off, the water mirrors the sky alone', type: 'toggle' },
    { key: 'reflectionScale', label: 'Reflection detail', type: 'select', parse: Number, options: [[0.15, 'Low'], [0.2, 'Medium'], [0.25, 'Standard'], [0.35, 'High']] },
    { key: 'godRays', label: 'Sun shafts', type: 'toggle' },
  ] },
  { id: 'sound', label: 'Sound', rows: [
    { key: 'volume', label: 'Volume', type: 'range', min: 0, max: 1, step: 0.05, format: pct },
    { key: 'mute', label: 'Mute', desc: 'N toggles it', type: 'toggle' },
  ] },
  { id: 'controls', label: 'Controls', rows: [
    { key: 'sensitivity', label: 'Mouse sensitivity', type: 'range', min: 0.3, max: 3, step: 0.1, format: (v) => `${v.toFixed(1)}×` },
    { key: 'invertLook', label: 'Invert look', type: 'toggle' },
    { key: 'cursorSteer', label: 'Steer the canoe where you point', desc: 'While you hold W the bow turns toward the cursor’s point on the water, or toward the look in first person', type: 'toggle' },
    { key: 'speed', label: 'Game speed at the start of a trip', desc: '1 2 3 change it as you paddle', type: 'select', parse: Number, options: [[1, '1× · realistic'], [2, '2×'], [4, '4×']] },
    { key: 'camera', label: 'Camera at the start of a trip', desc: 'V switches as you paddle', type: 'select', options: [['third', 'Behind the canoe'], ['first', 'From the paddler’s seat']] },
  ] },
  { id: 'hud', label: 'HUD', rows: [
    { key: 'density', label: 'Density', desc: 'How much the HUD says while you paddle', type: 'radio', options: [['quiet', 'Quiet'], ['standard', 'Standard'], ['full', 'Full']] },
    { key: 'placeTitles', label: 'Place titles on arriving at a lake', type: 'toggle' },
    { key: 'compass', label: 'Compass', type: 'select', options: [['wind', 'When the wind matters'], ['always', 'Always, faint'], ['never', 'Never']] },
    { key: 'readout', label: 'The readout', type: 'select', options: [['hold', 'Hold Tab'], ['toggle', 'Tab toggles it'], ['always', 'Always on']] },
    { key: 'cornerMap', label: 'Corner sheet of the map', desc: 'A small map that stays up, the old way', type: 'toggle' },
    { key: 'journalLines', label: 'Journal lines', inline: '· the notes at the bottom left', type: 'toggle' },
    { key: 'keyHints', label: 'Key hints on the action line', type: 'toggle' },
    { key: 'hudScale', label: 'HUD size', desc: 'For a TV across the room', type: 'range', min: 0.8, max: 1.4, step: 0.1, format: (v) => `${v.toFixed(1)}×` },
    { key: 'cbMarks', label: 'Colour-blind marks', desc: 'Adds shape to the balance arc and the tension line, not only colour', type: 'toggle' },
  ] },
  { id: 'developer', label: 'Developer', rows: [
    { key: 'gps', label: 'GPS simulator', desc: 'The canoe’s position as a fix for the companion extension and this tab', type: 'status', read: (t) => (t && t.geo ? (t.geo.linked ? (t.geo.enabled ? 'broadcasting to the extension' : 'extension installed, switched off') : 'extension not detected · this tab only') : '…'), live: (t) => !!(t && t.geo && t.geo.linked && t.geo.enabled) },
    { key: 'fps', label: 'FPS and triangles', desc: 'A World row in the readout (hold Tab)', type: 'toggle' },
    { key: 'devRows', label: 'Tiles and the GPS sim in the readout', type: 'toggle' },
  ] },
];
export const SCHEMA = SECTIONS.flatMap((s) => [{ group: s.label }, ...s.rows.filter((r) => r.key in DEFAULTS)]);

export class Settings {
  constructor() {
    const stored = save.read('settings', {}) || {};
    this.values = { ...DEFAULTS };
    for (const k of Object.keys(DEFAULTS)) if (k in stored && typeof stored[k] === typeof DEFAULTS[k]) this.values[k] = stored[k];
    // settings saved before the presets: display rows already set by hand stay as they are (Custom), not Auto's
    if (!('quality' in stored) && [...PRESET_KEYS].some((k) => k in stored && stored[k] !== DEFAULTS[k])) this.values.quality = 'custom';
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
    // a display row changed by hand: the quality is now the player's own
    if (!this.presetting && PRESET_KEYS.has(k) && this.values.quality !== 'custom') this.set('quality', 'custom');
  }
  toggle(k) { this.set(k, !this.values[k]); }
  reset() {
    for (const k of Object.keys(DEFAULTS)) if (k !== 'quality') this.set(k, DEFAULTS[k]);
    if (this.values.quality === DEFAULTS.quality) this.apply('quality'); else this.set('quality', DEFAULTS.quality);
  }

  // --- the quality presets (quality.js) ----------------------------------------------------------------------
  applyPreset(name) {
    const p = PRESETS[name]; if (!p) return;
    this.presetting = true;
    try { for (const k of Object.keys(p)) this.set(k, p[k]); } finally { this.presetting = false; }
  }
  // Auto's benchmark: the scene behind the title card, a few frames at each preset tried (quality.js benchmark).
  // Runs once a few seconds after the game is up, unless Auto has a pick already; again when Auto is picked.
  runAuto() {
    const t = this.t; if (!t) return null;
    let r;
    try { r = benchmark(this, t); } catch (e) { console.warn('quality: the benchmark failed, High it is', e); r = { pick: 'high', ms: {} }; }
    this.applyPreset(r.pick);
    this.set('autoPick', r.pick);
    for (const fn of this.listeners) fn('quality', this.values.quality); // the panel's Auto label names the pick
    console.log(`quality: Auto picked ${PRESET_NAMES[r.pick]} (ms a frame: ${Object.entries(r.ms).map(([k, v]) => `${k} ${v}`).join(', ')})`);
    this.lastBenchmark = r;
    return r;
  }
  scheduleAuto(delay = 2500) {
    clearTimeout(this.autoTimer);
    this.autoTimer = setTimeout(() => {
      if (this.values.quality !== 'auto') return;
      // a hidden page or a canvas not yet laid out would time nothing worth keeping: try again later
      const c = this.t && this.t.renderer.domElement;
      if (document.visibilityState !== 'visible' || !c || c.width < 320 || c.height < 200) { this.scheduleAuto(2000); return; }
      this.runAuto();
    }, delay);
  }
  onChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }

  // --- what the density means for each part of the HUD (hud.js asks these every frame) --------------------
  get showTitles() { return this.values.placeTitles && this.values.density !== 'quiet'; }
  get showLines() { return this.values.journalLines && this.values.density !== 'quiet'; }
  get compassMode() { const c = this.values.compass; return this.values.density === 'quiet' && c === 'always' ? 'wind' : c; }
  get readoutMode() { return this.values.density === 'full' ? 'always' : this.values.readout; }
  get cornerSheet() { return this.values.density === 'full' || this.values.cornerMap; }

  // Wire the settings to the game and apply every one of them once.
  // targets: { renderer, scene, sun, water, post, audio, chase, player, stats, geo }
  attach(targets) {
    this.t = targets;
    for (const k of Object.keys(DEFAULTS)) if (k !== 'quality') this.apply(k, true);
    this.apply('quality', true);
  }

  apply(k, initial = false) {
    const t = this.t; if (!t) return;
    const v = this.values[k];
    switch (k) {
      case 'quality':
        if (PRESETS[v]) this.applyPreset(v);
        else if (v === 'auto') { if (initial && PRESETS[this.values.autoPick]) this.applyPreset(this.values.autoPick); else this.scheduleAuto(initial ? 2500 : 300); }
        break;
      case 'shadows': {
        const on = v !== 'off', size = on ? parseInt(v, 10) : 0, was = t.renderer.shadowMap.enabled;
        t.renderer.shadowMap.enabled = on;
        t.sun.castShadow = on;
        if (on) t.sun.shadow.mapSize.set(size, size); // per cascade; the shadow pass resizes its atlas when this differs
        if (!initial && on !== was) refreshMaterials(t.scene); // programs with/without shadow sampling (a new size needs none)
        break;
      }
      case 'shadowReach': t.sun.shadow.camera.far = v; CULL.farSmall = v < 300 ? 1.5 : 0; break;
      case 'lod': LOD_SCALE.value = v; break;
      case 'vegDensity': CULL.understory = v; break;
      case 'reflections': t.water.reflectionsOn = v; break;
      case 'reflectionScale': REFLECTION.scale = v; break;
      case 'antialias': if (t.post.setAntialias) t.post.setAntialias(v === 'fxaa' ? 'fxaa' : v === 'off' ? 0 : parseInt(v, 10)); break;
      case 'godRays': t.post.rays.enabled = v; break;
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
      case 'cursorSteer': t.player.cursorSteer = v; t.chase.setCursorSteer(v); break;
      case 'speed': if (initial) t.player.timeScale = v; break;
      case 'camera': if (initial && t.chase.mode !== v) t.chase.setMode(v); break;
      case 'hudScale': document.documentElement.style.setProperty('--hud', String(v)); break;
      default: break;
    }
  }
}

const optionsOf = (row, settings) => (typeof row.options === 'function' ? row.options(settings) : row.options);

function refreshMaterials(scene) {
  const seen = new Set();
  scene.traverse((o) => {
    const m = o.material; if (!m) return;
    for (const mm of Array.isArray(m) ? m : [m]) if (!seen.has(mm)) { seen.add(mm); mm.needsUpdate = true; }
  });
}

// The settings card: a section nav on the left, the rows of one section on the right, each row a label and
// its control (a radio group, a switch, an underlined select or a range), reflecting the values and writing
// them back as they change. Native controls, so Tab, the arrows and Space all work; ← → change a focused
// switch or select too.
export class SettingsPanel {
  constructor(settings, form, nav) {
    this.settings = settings; this.form = form; this.nav = nav; this.controls = new Map();
    this.section = SECTIONS[0].id;
    form.addEventListener('submit', (e) => e.preventDefault());
    form.addEventListener('keydown', (e) => this.onKey(e));
    this.buildNav();
    this.build();
    settings.onChange((k) => this.refresh(k));
    this.timer = null;
  }
  buildNav() {
    const nav = this.nav; if (!nav) return;
    nav.textContent = '';
    for (const s of SECTIONS) {
      const b = document.createElement('button'); b.type = 'button'; b.textContent = s.label; b.dataset.section = s.id;
      b.addEventListener('click', () => this.show(s.id));
      nav.appendChild(b);
    }
    const reset = document.createElement('button'); reset.type = 'button'; reset.className = 'reset'; reset.textContent = 'Reset to defaults';
    reset.addEventListener('click', () => this.settings.reset());
    nav.appendChild(reset);
  }
  show(id) {
    this.section = id;
    if (this.nav) for (const b of this.nav.querySelectorAll('button')) b.classList.toggle('on', b.dataset.section === id);
    this.build();
  }
  // the section's rows
  build() {
    const f = this.form; f.textContent = ''; this.controls.clear();
    const sec = SECTIONS.find((s) => s.id === this.section) || SECTIONS[0];
    for (const row of sec.rows) {
      const id = `set-${row.key}`;
      const div = document.createElement('div'); div.className = `srow srow-${row.type}`;
      const name = document.createElement(row.type === 'status' || row.type === 'radio' ? 'div' : 'label'); name.className = 'name';
      if (name.tagName === 'LABEL') name.htmlFor = id;
      const main = document.createElement('span'); main.textContent = row.label;
      if (row.inline) { const d = document.createElement('span'); d.className = 'desc inline'; d.textContent = row.inline; main.appendChild(d); }
      name.appendChild(main);
      if (row.desc) { const d = document.createElement('span'); d.className = 'desc'; d.textContent = row.desc; name.appendChild(d); }
      div.appendChild(name);
      let input = null, value = null, holder = null;
      if (row.type === 'select') {
        input = document.createElement('select');
        for (const [val, text] of optionsOf(row, this.settings)) { const o = document.createElement('option'); o.value = String(val); o.textContent = text; input.appendChild(o); }
        input.addEventListener('change', () => this.settings.set(row.key, row.parse ? row.parse(input.value) : input.value));
        holder = input;
      } else if (row.type === 'range') {
        holder = document.createElement('span'); holder.className = 'range';
        input = document.createElement('input'); input.type = 'range'; input.min = row.min; input.max = row.max; input.step = row.step;
        value = document.createElement('output'); value.htmlFor = id;
        input.addEventListener('input', () => this.settings.set(row.key, parseFloat(input.value)));
        holder.append(input, value);
      } else if (row.type === 'radio') {
        holder = document.createElement('div'); holder.className = 'radios'; holder.setAttribute('role', 'radiogroup'); holder.setAttribute('aria-label', row.label);
        const inputs = [];
        for (const [val, text] of row.options) {
          const l = document.createElement('label'); const r = document.createElement('input'); r.type = 'radio'; r.name = id; r.value = String(val);
          r.addEventListener('change', () => { if (r.checked) this.settings.set(row.key, row.parse ? row.parse(r.value) : r.value); });
          l.append(r, document.createTextNode(text)); holder.appendChild(l); inputs.push(r);
        }
        input = inputs;
      } else if (row.type === 'status') {
        holder = document.createElement('span'); holder.className = 'status';
        holder.innerHTML = '<i></i><span></span>';
        value = holder;
      } else {
        input = document.createElement('input'); input.type = 'checkbox'; input.className = 'switch';
        input.addEventListener('change', () => this.settings.set(row.key, input.checked));
        holder = input;
      }
      if (input && !Array.isArray(input)) input.id = id;
      div.appendChild(holder);
      f.appendChild(div);
      this.controls.set(row.key, { row, input, value });
      this.refresh(row.key);
    }
    clearInterval(this.timer);
    if (sec.rows.some((r) => r.type === 'status')) this.timer = setInterval(() => this.refreshStatus(), 1000);
  }
  refreshStatus() {
    if (!this.form.isConnected || this.form.offsetParent === null) return;
    for (const c of this.controls.values()) if (c.row.type === 'status') this.refresh(c.row.key);
  }
  refresh(k) {
    const c = this.controls.get(k); if (!c) return;
    const { row } = c;
    if (row.type === 'status') {
      const t = this.settings.t;
      c.value.querySelector('span').textContent = row.read(t);
      c.value.classList.toggle('live', !!(row.live && row.live(t)));
      return;
    }
    const v = this.settings.get(k);
    if (row.type === 'select' && typeof row.options === 'function') optionsOf(row, this.settings).forEach(([, text], i) => { if (c.input.options[i]) c.input.options[i].textContent = text; });
    if (row.type === 'toggle') c.input.checked = !!v;
    else if (row.type === 'radio') { for (const r of c.input) { const on = r.value === String(v); r.checked = on; r.parentElement.classList.toggle('on', on); } }
    else c.input.value = String(v);
    if (c.value) c.value.value = row.format ? row.format(v) : String(v);
  }
  // ← → change a switch or a select that has the focus (ranges and radios do it natively)
  onKey(e) {
    if (e.code !== 'ArrowLeft' && e.code !== 'ArrowRight') return;
    const el = e.target, dir = e.code === 'ArrowRight' ? 1 : -1;
    if (el.tagName === 'SELECT') { e.preventDefault(); const n = el.options.length; el.selectedIndex = (el.selectedIndex + dir + n) % n; el.dispatchEvent(new Event('change')); }
    else if (el.tagName === 'INPUT' && el.type === 'checkbox') { e.preventDefault(); el.checked = dir > 0; el.dispatchEvent(new Event('change')); }
  }
  focusables() { return [...this.form.querySelectorAll('select, input:not([type=radio]), input[type=radio]:checked')]; }
}

// Frames per second, triangles and draw calls over the last half second, when enabled (shown in the
// readout's World row). The renderer's counters are reset here (not by the renderer) so every pass of the
// frame (shadows, reflection, the composer) is counted: call begin() before drawing and end() after.
export class FpsCounter {
  constructor(renderer) {
    this.renderer = renderer; this._enabled = false;
    this.frames = 0; this.acc = 0; this.fps = 0; this.tris = 0; this.calls = 0; this.text = '';
    renderer.info.autoReset = false;
  }
  get enabled() { return this._enabled; }
  set enabled(v) { this._enabled = !!v; if (!v) { this.frames = 0; this.acc = 0; this.text = ''; } }
  begin() { this.renderer.info.reset(); }
  end(dt) {
    if (!this._enabled) return;
    this.frames++; this.acc += dt;
    if (this.acc < 0.5) return;
    const r = this.renderer.info.render;
    this.fps = Math.round(this.frames / this.acc); this.tris = r.triangles; this.calls = r.calls;
    this.text = `${this.fps} fps · ${fmtCount(r.triangles)} tris · ${r.calls} calls`;
    this.frames = 0; this.acc = 0;
  }
}
export const fmtCount = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(2)} M` : n >= 1e3 ? `${(n / 1e3).toFixed(0)} k` : String(n));
