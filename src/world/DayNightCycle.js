import { Config } from '../core/Config.js';
import { smoothstep } from '../utils/math.js';

/**
 * A single world clock. `phase` runs 0→1 over one cycle:
 * 0 = morning, 0.25 = noon, 0.45 = sunset, 0.5–0.9 = night, 0.95 = sunrise.
 * Exposes blend weights; Environment applies them. No colours are computed
 * here that aren't used.
 */
export class DayNightCycle {
  constructor({ cycleSeconds = Config.dayNight.cycleSeconds, phase = Config.dayNight.startPhase } = {}) {
    this.cycleSeconds = cycleSeconds;
    this.phase = phase;
    this.paused = false;
  }

  update(dt) {
    if (this.paused) return;
    this.phase = (this.phase + dt / this.cycleSeconds) % 1;
  }

  /** 0 at full day, 1 at full night. */
  get night() {
    return nightAt(this.phase);
  }

  /** Peaks at sunrise/sunset. */
  get dusk() {
    return duskAt(this.phase);
  }

  /** Sun elevation in [-1, 1]. */
  get sunHeight() {
    return Math.sin((this.phase - 0.0) * Math.PI * 2);
  }
}

export function nightAt(phase) {
  // Rise from day to night around sunset (0.42–0.55), fall at sunrise (0.88–0.99).
  return smoothstep(0.42, 0.55, phase) * (1 - smoothstep(0.88, 0.99, phase));
}

export function duskAt(phase) {
  const sunset = 1 - Math.min(1, Math.abs(phase - 0.47) / 0.07);
  const sunrise = 1 - Math.min(1, Math.abs(phase - 0.95) / 0.06);
  return Math.max(0, sunset, sunrise);
}
