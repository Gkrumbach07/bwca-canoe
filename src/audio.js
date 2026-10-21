// A small synthesized soundscape: wind, water lapping near shore, paddle dips, and loon calls.
// No samples; everything is noise and oscillators. Starts on the first key press (browser policy).
export class Ambient {
  constructor() {
    this.enabled = true; this.ctx = null; this.master = null;
    const start = () => { if (!this.ctx) this.init(); window.removeEventListener('keydown', start); window.removeEventListener('pointerdown', start); };
    window.addEventListener('keydown', start); window.addEventListener('pointerdown', start);
  }
  init() {
    const ctx = this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.master = ctx.createGain(); this.master.gain.value = this.enabled ? 0.4 : 0; this.master.connect(ctx.destination);
    const noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noise.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < d.length; i++) { const w = Math.random() * 2 - 1; b0 = 0.99765 * b0 + w * 0.099; b1 = 0.963 * b1 + w * 0.2965; b2 = 0.57 * b2 + w * 1.0526; d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.12; }
    this.noise = noise;
    // wind: low-passed pink noise, slowly breathing
    this.wind = this.loop(noise, 'lowpass', 380, 0.22);
    const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = 0.11; lg.gain.value = 0.12; lfo.connect(lg); lg.connect(this.wind.gain.gain); lfo.start();
    // lapping: band-passed noise, gated by little random waves
    this.lap = this.loop(noise, 'bandpass', 900, 0);
    this.lapTimer = 0;
    this.lapLevel = 0;
  }
  loop(buffer, type, freq, gain) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource(); src.buffer = buffer; src.loop = true;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = 0.9;
    const g = ctx.createGain(); g.gain.value = gain;
    src.connect(f); f.connect(g); g.connect(this.master); src.start();
    return { src, filter: f, gain: g };
  }
  toggle() { this.enabled = !this.enabled; if (this.master) this.master.gain.setTargetAtTime(this.enabled ? 0.4 : 0, this.ctx.currentTime, 0.1); return this.enabled; }
  update(dt, shoreDist, speed, afloat) {
    if (!this.ctx) return;
    this.lapLevel = afloat ? Math.max(0, 1 - Math.abs(shoreDist) / 35) * 0.5 + Math.min(1, speed / 2.5) * 0.12 : 0.05;
    this.lapTimer -= dt;
    if (this.lapTimer <= 0) {
      this.lapTimer = 0.5 + Math.random() * 1.2;
      const t = this.ctx.currentTime, g = this.lap.gain.gain;
      g.cancelScheduledValues(t); g.setValueAtTime(g.value, t);
      g.linearRampToValueAtTime(this.lapLevel * (0.4 + Math.random() * 0.6), t + 0.12 + Math.random() * 0.2);
      g.linearRampToValueAtTime(0.0, t + 0.6 + Math.random() * 0.6);
    }
  }
  paddleDip() {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const src = ctx.createBufferSource(); src.buffer = this.noise;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1400; f.Q.value = 0.7;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.5, t + 0.03); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
    src.connect(f); f.connect(g); g.connect(this.master); src.start(t); src.stop(t + 0.4);
  }
  loonCall(distance, kind = 'wail') {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime, vol = 0.9 / (1 + distance / 140);
    const osc = ctx.createOscillator(), g = ctx.createGain(), vib = ctx.createOscillator(), vg = ctx.createGain();
    osc.type = 'sine'; vib.frequency.value = 5.5; vg.gain.value = 14; vib.connect(vg); vg.connect(osc.frequency); vib.start(t);
    osc.connect(g); g.connect(this.master);
    if (kind === 'wail') {
      osc.frequency.setValueAtTime(520, t); osc.frequency.linearRampToValueAtTime(880, t + 0.9); osc.frequency.linearRampToValueAtTime(760, t + 2.3);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.35); g.gain.setValueAtTime(vol, t + 1.8); g.gain.exponentialRampToValueAtTime(0.0001, t + 2.6);
      osc.start(t); osc.stop(t + 2.7); vib.stop(t + 2.7);
    } else {
      g.gain.setValueAtTime(0.0001, t);
      for (let i = 0; i < 5; i++) { const s = t + i * 0.16; osc.frequency.setValueAtTime(900 + i * 60, s); osc.frequency.linearRampToValueAtTime(1150 + i * 60, s + 0.1); g.gain.exponentialRampToValueAtTime(vol * 0.8, s + 0.04); g.gain.exponentialRampToValueAtTime(0.0001, s + 0.14); }
      osc.start(t); osc.stop(t + 1.0); vib.stop(t + 1.0);
    }
  }
}
