export const TAU = Math.PI * 2;

export const clamp = (v, min, max) => (v < min ? min : v > max ? max : v);

export const lerp = (a, b, t) => a + (b - a) * t;

export const smoothstep = (e0, e1, x) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};

/** Wraps an angle to (-PI, PI]. */
export function wrapAngle(a) {
  a = (a + Math.PI) % TAU;
  if (a < 0) a += TAU;
  return a - Math.PI;
}

/** Interpolates angles along the shortest arc. */
export const lerpAngle = (a, b, t) => a + wrapAngle(b - a) * t;

/**
 * Frame-rate independent exponential smoothing factor.
 * `damp(x, target, rate, dt)` converges at the same speed regardless of dt.
 */
export const dampFactor = (rate, dt) => 1 - Math.exp(-rate * dt);
export const damp = (current, target, rate, dt) => lerp(current, target, dampFactor(rate, dt));

/** Moves `current` toward `target` by at most `maxDelta`. */
export function approach(current, target, maxDelta) {
  if (current < target) return Math.min(current + maxDelta, target);
  return Math.max(current - maxDelta, target);
}

export const distSq2 = (ax, az, bx, bz) => {
  const dx = ax - bx;
  const dz = az - bz;
  return dx * dx + dz * dz;
};
