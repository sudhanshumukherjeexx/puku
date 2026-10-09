import { Color } from 'three';
import { Config } from '../core/Config.js';
import { THEMES, getTheme } from './themes.js';
import { smoothstep } from '../utils/math.js';

/**
 * Owns one live, blended palette of THREE.Color objects. Switching themes
 * eases every colour from where it is toward the target over a short time;
 * consumers read `palette` (shared references) and are told when it changed.
 * Nothing is rebuilt — materials keep their identity.
 */
export class ThemeManager {
  constructor(initialId) {
    this.theme = getTheme(initialId);
    this.palette = toPalette(this.theme);
    this._from = toPalette(this.theme);
    this._to = toPalette(this.theme);
    this.t = 1;
    this.duration = Config.themeTransitionSeconds;
    this.listeners = new Set();
  }

  get id() {
    return this.theme.id;
  }

  get transitioning() {
    return this.t < 1;
  }

  /** @returns {boolean} whether the theme actually changed */
  setTheme(id, { instant = false } = {}) {
    const next = getTheme(id);
    if (next.id === this.theme.id && !this.transitioning) return false;
    this.theme = next;
    copyPalette(this.palette, this._from);
    this._to = toPalette(next);
    this.t = instant || this.duration === 0 ? 1 : 0;
    if (this.t === 1) copyPalette(this._to, this.palette);
    for (const fn of this.listeners) fn(next);
    return true;
  }

  /** Advances the blend; returns true while the palette is changing. */
  update(dt) {
    if (this.t >= 1) return false;
    this.t = Math.min(1, this.t + dt / this.duration);
    const k = smoothstep(0, 1, this.t);
    blendPalette(this._from, this._to, k, this.palette);
    return true;
  }

  onChange(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
}

const SCALARS = ['glow', 'nightFloor'];

export function toPalette(theme) {
  const p = {};
  for (const group of ['sky', 'ground', 'light', 'car']) {
    p[group] = {};
    for (const [k, v] of Object.entries(theme[group])) p[group][k] = new Color(v);
  }
  for (const list of ['flowers', 'crystals', 'mushrooms']) p[list] = theme[list].map((c) => new Color(c));
  for (const single of ['grass', 'stone', 'particles']) p[single] = new Color(theme[single]);
  for (const s of SCALARS) p[s] = theme[s];
  return p;
}

function eachColor(a, b, fn) {
  for (const key of Object.keys(a)) {
    const va = a[key];
    const vb = b[key];
    if (va?.isColor) fn(va, vb);
    else if (Array.isArray(va)) va.forEach((c, i) => fn(c, vb[i % vb.length]));
    else if (va && typeof va === 'object') eachColor(va, vb, fn);
  }
}

function copyPalette(src, dst) {
  eachColor(dst, src, (d, s) => d.copy(s));
  for (const s of SCALARS) dst[s] = src[s];
}

function blendPalette(from, to, k, out) {
  const keys = Object.keys(out);
  for (const key of keys) {
    const o = out[key];
    if (o?.isColor) o.lerpColors(from[key], to[key], k);
    else if (Array.isArray(o)) o.forEach((c, i) => c.lerpColors(from[key][i], to[key][i % to[key].length], k));
    else if (o && typeof o === 'object') blendPalette(from[key], to[key], k, o);
    else if (SCALARS.includes(key)) out[key] = from[key] + (to[key] - from[key]) * k;
  }
}

export { THEMES };
