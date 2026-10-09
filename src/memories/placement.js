import { Config } from '../core/Config.js';
import { createRng } from '../utils/random.js';

/**
 * Computes every memory location synchronously, before any texture loads, so
 * the layout depends only on the seed and manifest — never on network timing.
 *
 * Default "spiral" mode lays the story out in order along a gentle outward
 * spiral from the spawn point, so following the path roughly follows the
 * story, without ever forcing a route. Manifest `position` values win.
 * Optional echoes are extra markers that point at an existing memory id.
 *
 * Returns [{ key, memoryId, x, z, echo }].
 */
export function placeMemories(memories, { seed, echoes = 0, radius = Config.world.radius, mode = 'spiral' } = {}) {
  const cfg = Config.memories;
  const rng = createRng(seed).fork('placement');
  const maxR = radius * 0.86;
  const placed = [];

  const fits = (x, z, minSpacing) => {
    if (x * x + z * z < Config.world.spawnClearRadius ** 2) return false;
    if (x * x + z * z > maxR * maxR) return false;
    const min2 = minSpacing * minSpacing;
    return placed.every((p) => (p.x - x) ** 2 + (p.z - z) ** 2 >= min2);
  };

  const randomSpot = (minSpacing) => {
    for (let attempt = 0; attempt < 400; attempt++) {
      const a = rng.range(0, Math.PI * 2);
      const r = Math.sqrt(rng.next()) * (maxR - cfg.spiralStart) + cfg.spiralStart;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      if (fits(x, z, minSpacing)) return { x, z };
    }
    return null;
  };

  /** Tries the preferred spot, then random spots, relaxing spacing until something fits. */
  const reserve = (preferred) => {
    for (let spacing = cfg.minSpacing; spacing >= 4; spacing *= 0.75) {
      if (preferred && fits(preferred.x, preferred.z, spacing)) return preferred;
      const spot = randomSpot(spacing);
      if (spot) return spot;
    }
    return preferred ?? { x: cfg.spiralStart, z: 0 };
  };

  // Manifest-fixed positions are reserved first so auto placement avoids them.
  for (const m of memories) {
    if (m.position) placed.push({ key: m.id, memoryId: m.id, x: m.position[0], z: m.position[1], echo: false });
  }

  let angle = rng.range(0, Math.PI * 2);
  let r = cfg.spiralStart;
  const auto = memories.filter((m) => !m.position);
  const turns = auto.length > 1 ? (maxR - cfg.spiralStart) / (auto.length - 1) : 0;

  for (const m of auto) {
    let preferred = null;
    if (mode === 'spiral') {
      const jitter = rng.range(-3, 3);
      preferred = { x: Math.cos(angle) * (r + jitter), z: Math.sin(angle) * (r + jitter) };
      angle += cfg.spiralStep / Math.max(r, 1);
      r += turns;
    }
    const spot = reserve(preferred);
    placed.push({ key: m.id, memoryId: m.id, x: spot.x, z: spot.z, echo: false });
  }

  for (let i = 0; i < echoes; i++) {
    const m = memories[i % memories.length];
    const spot = reserve(null);
    placed.push({ key: `${m.id}#echo-${i + 1}`, memoryId: m.id, x: spot.x, z: spot.z, echo: true });
  }

  // Keep manifest order for stable output.
  const order = new Map(memories.map((m, i) => [m.id, i]));
  return placed.sort((a, b) => order.get(a.memoryId) - order.get(b.memoryId) || Number(a.echo) - Number(b.echo));
}
