import { describe, expect, it } from 'vitest';
import rawManifest from '../../src/content/world.json';
import { validateManifest } from '../../src/memories/MemoryManifest.js';
import { placeMemories } from '../../src/memories/placement.js';
import { Progress } from '../../src/memories/Progress.js';
import { ProximitySystem } from '../../src/memories/ProximitySystem.js';
import { Config } from '../../src/core/Config.js';

const manifest = validateManifest(rawManifest);
const minDistance = (pts) => {
  let min = Infinity;
  for (let i = 0; i < pts.length; i++)
    for (let j = i + 1; j < pts.length; j++) min = Math.min(min, Math.hypot(pts[i].x - pts[j].x, pts[i].z - pts[j].z));
  return min;
};

describe('memory manifest', () => {
  it('validates the shipped world: 18 memories with unique ids and paired media', () => {
    expect(manifest.memories).toHaveLength(18);
    expect(new Set(manifest.memories.map((m) => m.id)).size).toBe(18);
    for (const m of manifest.memories) {
      expect(m.image).toMatch(/^assets\/memories\/memory-\d{2}\.webp$/);
      expect(m.video).toMatch(/^assets\/memories\/memory-\d{2}\.mp4$/);
      expect(m.thumbnail).toMatch(/-thumb\.webp$/);
    }
  });

  it('is immutable — runtime progress cannot be written into it', () => {
    expect(Object.isFrozen(manifest.memories[0])).toBe(true);
    expect(() => {
      'use strict';
      manifest.memories[0].discovered = true;
    }).toThrow();
  });

  it('reports every problem at once with clear messages', () => {
    const bad = {
      defaultTheme: 'disco',
      memories: [
        { id: 'a', title: 'A', image: '/abs/path.webp' },
        { id: 'a', title: '', video: 'x.mp4' },
        { id: 'Bad Id', title: 'C' },
      ],
      milestones: [{ id: 'm', at: 99 }],
    };
    let message = '';
    try {
      validateManifest(bad);
    } catch (e) {
      message = e.message;
    }
    expect(message).toMatch(/defaultTheme/);
    expect(message).toMatch(/must be relative/);
    expect(message).toMatch(/duplicated/);
    expect(message).toMatch(/title is required/);
    expect(message).toMatch(/lowercase letters/);
    expect(message).toMatch(/at least an "image" or a "video"/);
    expect(message).toMatch(/exceeds the number of memories/);
  });

  it('resolves the "all" milestone to the memory count', () => {
    expect(manifest.milestones.at(-1).at).toBe(manifest.memories.length);
  });
});

describe('memory placement', () => {
  it('is deterministic for a seed and independent of load order', () => {
    const a = placeMemories(manifest.memories, { seed: 2025 });
    const b = placeMemories(manifest.memories, { seed: 2025 });
    expect(b).toEqual(a);
    const c = placeMemories(manifest.memories, { seed: 7 });
    expect(c).not.toEqual(a);
  });

  it('places every memory exactly once, spaced apart and inside the world', () => {
    for (const seed of [1, 2, 3, 2025, 'abc']) {
      const placed = placeMemories(manifest.memories, { seed });
      expect(placed).toHaveLength(manifest.memories.length);
      expect(new Set(placed.map((p) => p.memoryId)).size).toBe(manifest.memories.length);
      expect(minDistance(placed)).toBeGreaterThanOrEqual(Config.memories.minSpacing - 1e-6);
      for (const p of placed) {
        const r = Math.hypot(p.x, p.z);
        expect(r).toBeGreaterThan(Config.world.spawnClearRadius);
        expect(r).toBeLessThan(Config.world.radius);
      }
    }
  });

  it('honours fixed manifest positions and adds explicit echoes', () => {
    const memories = manifest.memories.map((m, i) => (i === 0 ? { ...m, position: [40, 40] } : m));
    const placed = placeMemories(memories, { seed: 1, echoes: 4 });
    expect(placed.find((p) => p.key === memories[0].id)).toMatchObject({ x: 40, z: 40 });
    const echoes = placed.filter((p) => p.echo);
    expect(echoes).toHaveLength(4);
    expect(new Set(placed.map((p) => p.key)).size).toBe(placed.length);
    expect(echoes.every((e) => manifest.memories.some((m) => m.id === e.memoryId))).toBe(true);
  });
});

describe('progress', () => {
  it('counts unique memories only — echoes and repeats never inflate it', () => {
    const p = new Progress(manifest);
    expect(p.discover('memory-01').isNew).toBe(true);
    expect(p.discover('memory-01').isNew).toBe(false);
    expect(p.discover('not-a-memory').isNew).toBe(false);
    expect(p.count).toBe(1);
    expect(p.total).toBe(18);
  });

  it('fires each milestone once, in order', () => {
    const p = new Progress(manifest);
    const reached = [];
    manifest.memories.forEach((m) => reached.push(...p.discover(m.id).milestones.map((ms) => ms.id)));
    expect(reached).toEqual(['fireflies', 'wishing-tree', 'starfall']);
    p.reset();
    expect(p.count).toBe(0);
    expect(p.reachedMilestones.size).toBe(0);
  });

  it('lists discovered memories in story order', () => {
    const p = new Progress(manifest);
    p.discover('memory-05');
    p.discover('memory-02');
    expect(p.discoveredList().map((m) => m.id)).toEqual(['memory-02', 'memory-05']);
  });
});

describe('proximity', () => {
  it('finds the nearest item within range using squared distances', () => {
    const prox = new ProximitySystem(7);
    prox.setItems([
      { key: 'a', x: 0, z: 10 },
      { key: 'b', x: 0, z: 5 },
      { key: 'c', x: 50, z: 50 },
    ]);
    expect(prox.nearest(0, 0)?.key).toBe('b');
    expect(prox.nearest(0, 9)?.key).toBe('a');
    expect(prox.nearest(30, 30)).toBeNull();
    expect(prox.nearest(0, 0, (it) => it.key !== 'b')).toBeNull(); // a is 10 away, out of range
  });
});
