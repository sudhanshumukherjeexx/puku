/**
 * Small, fast, seedable PRNG (mulberry32). Every procedural decision in the
 * world goes through one of these so a given seed always produces the same
 * meadow, the same memory layout and the same decorations.
 */
export function createRng(seed) {
  let s = hashSeed(seed) >>> 0;
  const next = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    range: (min, max) => min + (max - min) * next(),
    int: (min, maxInclusive) => min + Math.floor(next() * (maxInclusive - min + 1)),
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    sign: () => (next() < 0.5 ? -1 : 1),
    /** Derive an independent stream so adding draws in one system never shifts another. */
    fork: (label) => createRng(`${seed}:${label}`),
  };
}

/** Accepts numbers or strings; strings are hashed (FNV-1a). */
export function hashSeed(seed) {
  if (typeof seed === 'number' && Number.isFinite(seed)) return seed | 0;
  const str = String(seed);
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h | 0;
}
