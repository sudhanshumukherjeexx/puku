import { Config, PRESET_ORDER } from './Config.js';

/**
 * Picks a conservative starting preset from capability signals (not just the
 * user agent) and, in "auto" mode, steps down once if measured frame rate
 * stays low. It never steps back up on its own, so quality can't oscillate.
 */
export function detectPreset(gl, env = globalThis) {
  const nav = env.navigator ?? {};
  const cores = nav.hardwareConcurrency ?? 4;
  const memory = nav.deviceMemory ?? 4; // Chromium only; others assume a modest device
  const coarse = Boolean(env.matchMedia?.('(pointer: coarse)').matches);
  const minScreen = Math.min(env.screen?.width ?? 1280, env.screen?.height ?? 800);
  let rendererName = '';
  try {
    const ext = gl?.getExtension('WEBGL_debug_renderer_info');
    rendererName = String(gl?.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER) ?? '');
  } catch {
    /* not available */
  }
  const maxTex = gl?.getParameter?.(gl.MAX_TEXTURE_SIZE) ?? 4096;
  return choosePreset({ cores, memory, coarse, minScreen, rendererName, maxTex });
}

/** Pure decision function (unit-tested). */
export function choosePreset({ cores, memory, coarse, minScreen, rendererName = '', maxTex = 8192 }) {
  if (/swiftshader|llvmpipe|software|basic render/i.test(rendererName)) return 'low';
  if (maxTex < 4096) return 'low';
  if (coarse) {
    // Phones start low; large, capable tablets get medium.
    return minScreen >= 700 && cores >= 8 && memory >= 6 ? 'medium' : 'low';
  }
  if (cores <= 4 || memory <= 4) return 'medium';
  if (/intel/i.test(rendererName) && !/arc/i.test(rendererName)) return 'medium';
  return 'high';
}

export class PerformanceManager {
  constructor({ initial, onDowngrade }) {
    this.detected = initial;
    this.onDowngrade = onDowngrade;
    this.reset();
  }

  reset() {
    this.elapsed = 0;
    this.frames = 0;
    this.windowTime = 0;
    this.slowWindows = 0;
    this.lastFps = 0;
  }

  /** Feed real frame deltas while the player is actually driving. */
  sample(dt, currentPreset, autoEnabled) {
    const cfg = Config.performance;
    this.elapsed += dt;
    if (this.elapsed < cfg.warmupSeconds) return;
    this.frames++;
    this.windowTime += dt;
    if (this.windowTime < cfg.sampleSeconds) return;

    this.lastFps = this.frames / this.windowTime;
    this.frames = 0;
    this.windowTime = 0;
    if (!autoEnabled) return;
    this.slowWindows = this.lastFps < cfg.downgradeBelowFps ? this.slowWindows + 1 : 0;
    if (this.slowWindows >= cfg.consecutiveSlowSamples) {
      const idx = PRESET_ORDER.indexOf(currentPreset);
      if (idx > 0) this.onDowngrade(PRESET_ORDER[idx - 1], this.lastFps);
      this.slowWindows = 0;
      this.elapsed = 0; // re-warm after a change
    }
  }
}
