import { Config } from '../core/Config.js';
import { createRng } from '../utils/random.js';
import { smoothstep } from '../utils/math.js';

/**
 * Deterministic, coherent height field shared by the terrain mesh and gameplay
 * (car height, decoration placement, camera clearance). Hill parameters are
 * generated once from the seed, never per vertex.
 */
export function createHeightField(seed, { radius = Config.world.radius, spawnClear = Config.world.spawnClearRadius } = {}) {
  const rng = createRng(seed).fork('terrain');

  const waves = Array.from({ length: 4 }, (_, i) => ({
    fx: rng.range(0.012, 0.03) * (i + 1) * 0.6,
    fz: rng.range(0.012, 0.03) * (i + 1) * 0.6,
    px: rng.range(0, Math.PI * 2),
    pz: rng.range(0, Math.PI * 2),
    amp: 0.9 / (i + 1),
  }));

  const hills = Array.from({ length: 9 }, () => {
    const a = rng.range(0, Math.PI * 2);
    const r = rng.range(35, radius * 0.85);
    return {
      x: Math.cos(a) * r,
      z: Math.sin(a) * r,
      r2: rng.range(14, 28) ** 2,
      h: rng.range(1.2, 3.2),
    };
  });

  const rimStart = radius * 0.97;

  function heightAt(x, z) {
    let h = 0;
    for (let i = 0; i < waves.length; i++) {
      const w = waves[i];
      h += Math.sin(x * w.fx + w.px) * Math.cos(z * w.fz + w.pz) * w.amp;
    }
    for (let i = 0; i < hills.length; i++) {
      const hl = hills[i];
      const dx = x - hl.x;
      const dz = z - hl.z;
      h += hl.h * Math.exp(-(dx * dx + dz * dz) / hl.r2);
    }
    const d = Math.sqrt(x * x + z * z);
    // Flatten the spawn meadow so the journey starts calmly.
    h *= smoothstep(spawnClear * 0.5, spawnClear * 1.6, d);
    // Mountain rim beyond the drivable boundary.
    if (d > rimStart) {
      const t = d - rimStart;
      h += t * 0.34 + Math.sin(Math.atan2(z, x) * 9) * Math.min(t * 0.1, 2.5);
    }
    return h;
  }

  /** Writes the normalized surface normal into `out` ({x,y,z}). */
  function normalAt(x, z, out, e = 0.75) {
    const hl = heightAt(x - e, z);
    const hr = heightAt(x + e, z);
    const hd = heightAt(x, z - e);
    const hu = heightAt(x, z + e);
    const nx = hl - hr;
    const ny = 2 * e;
    const nz = hd - hu;
    const len = Math.hypot(nx, ny, nz);
    out.x = nx / len;
    out.y = ny / len;
    out.z = nz / len;
    return out;
  }

  return { heightAt, normalAt, hills };
}
