/**
 * A tiny generative soundscape built with Web Audio — no audio files to
 * download or license. Soft pad chords, a breeze that follows the car's speed,
 * and chimes for discoveries. The AudioContext is only created after a user
 * gesture and is suspended whenever the page is hidden or the game is paused.
 */
const CHORDS = [
  [261.63, 329.63, 392.0, 493.88], // Cmaj7
  [220.0, 261.63, 329.63, 392.0], // Am7
  [174.61, 220.0, 261.63, 329.63], // Fmaj7
  [196.0, 246.94, 293.66, 392.0], // G
];
const CHORD_SECONDS = 9;

export class AudioManager {
  constructor(settings) {
    this.settings = settings;
    this.ctx = null;
    this.available = typeof window !== 'undefined' && Boolean(window.AudioContext || window.webkitAudioContext);
    this.ducked = false;
    this._chordTimer = 0;
    this._chord = 0;
    this._onVisibility = () => (document.hidden ? this.suspend() : this.resume());
  }

  /** Must be called from a user gesture (e.g. "Begin Journey"). */
  start() {
    if (!this.available || this.ctx) return this.resume();
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      this.ctx = new Ctx();
    } catch {
      this.available = false;
      return;
    }
    const ctx = this.ctx;
    this.master = ctx.createGain();
    this.music = ctx.createGain();
    this.sfx = ctx.createGain();
    this.music.connect(this.master);
    this.sfx.connect(this.master);
    this.master.connect(ctx.destination);

    // Pad: 4 voices through a soft low-pass.
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1100;
    lp.connect(this.music);
    this.voices = CHORDS[0].map((f, i) => {
      const osc = ctx.createOscillator();
      osc.type = i % 2 ? 'triangle' : 'sine';
      osc.frequency.value = f / 2;
      osc.detune.value = (i - 1.5) * 4;
      const g = ctx.createGain();
      g.gain.value = 0.035;
      osc.connect(g).connect(lp);
      osc.start();
      return osc;
    });

    // Breeze: looping filtered noise; louder with speed.
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const noise = ctx.createBufferSource();
    noise.buffer = buf;
    noise.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 500;
    bp.Q.value = 0.6;
    this.wind = ctx.createGain();
    this.wind.gain.value = 0.02;
    noise.connect(bp).connect(this.wind).connect(this.music);
    noise.start();
    this.windFilter = bp;

    this.applyVolumes();
    document.addEventListener('visibilitychange', this._onVisibility);
  }

  applyVolumes() {
    if (!this.ctx) return;
    const s = this.settings;
    const t = this.ctx.currentTime;
    const master = s.get('muted') ? 0 : s.get('masterVolume');
    this.master.gain.setTargetAtTime(master, t, 0.1);
    this.music.gain.setTargetAtTime(s.get('musicVolume') * (this.ducked ? 0.15 : 1), t, 0.3);
    this.sfx.gain.setTargetAtTime(s.get('sfxVolume'), t, 0.1);
  }

  /** Lower music while a memory video plays. */
  duck(on) {
    this.ducked = on;
    this.applyVolumes();
  }

  suspend() {
    if (this.ctx?.state === 'running') this.ctx.suspend().catch(() => {});
  }

  resume() {
    if (this.ctx?.state === 'suspended' && !document.hidden) this.ctx.resume().catch(() => {});
  }

  /** Called at a low rate with the car speed fraction [0..1]. */
  update(dt, speedK) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const t = this.ctx.currentTime;
    this.wind.gain.setTargetAtTime(0.015 + speedK * 0.07, t, 0.4);
    this.windFilter.frequency.setTargetAtTime(380 + speedK * 700, t, 0.4);
    this._chordTimer += dt;
    if (this._chordTimer >= CHORD_SECONDS) {
      this._chordTimer = 0;
      this._chord = (this._chord + 1) % CHORDS.length;
      CHORDS[this._chord].forEach((f, i) => this.voices[i].frequency.setTargetAtTime(f / 2, t, 1.5));
    }
  }

  /** Soft bell arpeggio. */
  chime(kind = 'discover') {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const notes = kind === 'milestone' ? [523.25, 659.25, 783.99, 1046.5, 1318.5] : kind === 'ui' ? [880] : [659.25, 783.99, 1046.5];
    const t0 = this.ctx.currentTime;
    notes.forEach((f, i) => {
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = f;
      const start = t0 + i * (kind === 'ui' ? 0 : 0.11);
      const peak = kind === 'ui' ? 0.05 : 0.12;
      g.gain.setValueAtTime(0, start);
      g.gain.linearRampToValueAtTime(peak, start + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, start + (kind === 'ui' ? 0.15 : 1.4));
      osc.connect(g).connect(this.sfx);
      osc.start(start);
      osc.stop(start + 1.5);
    });
  }

  dispose() {
    document.removeEventListener('visibilitychange', this._onVisibility);
    this.ctx?.close().catch(() => {});
    this.ctx = null;
  }
}
