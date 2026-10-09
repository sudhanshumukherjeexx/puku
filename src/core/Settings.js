import { readJSON, writeJSON } from '../utils/storage.js';

/** Non-sensitive preferences. Persisted locally; never contains media or personal content. */
export const DEFAULT_SETTINGS = Object.freeze({
  quality: 'auto', // auto | low | medium | high
  theme: null, // null = manifest default
  muted: false,
  masterVolume: 0.7,
  musicVolume: 0.6,
  sfxVolume: 0.8,
  cameraShake: true,
  reducedMotion: null, // null = follow the OS preference
  showHints: true,
  showMinimap: true,
  saveProgress: false,
  onboarded: false,
});

export class Settings {
  constructor() {
    const saved = readJSON('settings', {});
    this.values = { ...DEFAULT_SETTINGS };
    for (const k of Object.keys(DEFAULT_SETTINGS)) {
      if (saved && k in saved && typeof saved[k] === typeof DEFAULT_SETTINGS[k]) this.values[k] = saved[k];
      else if (saved && k in saved && DEFAULT_SETTINGS[k] === null) this.values[k] = saved[k];
    }
    this.listeners = new Set();
    this._mq = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)');
    this._mq?.addEventListener?.('change', () => this._emit('reducedMotion'));
  }

  get(key) {
    return this.values[key];
  }

  set(key, value) {
    if (this.values[key] === value) return;
    this.values[key] = value;
    writeJSON('settings', this.values);
    this._emit(key);
  }

  /** Effective reduced-motion: explicit user choice, otherwise the OS setting. */
  get reducedMotion() {
    const v = this.values.reducedMotion;
    return v === null ? Boolean(this._mq?.matches) : v;
  }

  reset() {
    this.values = { ...DEFAULT_SETTINGS };
    writeJSON('settings', this.values);
    Object.keys(DEFAULT_SETTINGS).forEach((k) => this._emit(k));
  }

  onChange(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  _emit(key) {
    for (const fn of this.listeners) fn(key, this.values[key]);
  }
}
