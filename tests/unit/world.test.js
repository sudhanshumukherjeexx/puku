import { describe, expect, it } from 'vitest';
import { createHeightField } from '../../src/world/heightField.js';
import { createRng } from '../../src/utils/random.js';
import { ThemeManager } from '../../src/world/ThemeManager.js';
import { THEMES, THEME_IDS, getTheme, nextThemeId } from '../../src/world/themes.js';
import { DayNightCycle, nightAt } from '../../src/world/DayNightCycle.js';
import { Config, validateConfig } from '../../src/core/Config.js';
import { choosePreset } from '../../src/core/PerformanceManager.js';

describe('seeded random', () => {
  it('is deterministic per seed and differs across seeds', () => {
    const a = createRng(42);
    const b = createRng(42);
    const c = createRng(43);
    const seqA = Array.from({ length: 5 }, a.next);
    expect(Array.from({ length: 5 }, b.next)).toEqual(seqA);
    expect(Array.from({ length: 5 }, c.next)).not.toEqual(seqA);
  });

  it('forks independent streams', () => {
    const r = createRng('x');
    const f1 = r.fork('terrain').next();
    r.next();
    expect(createRng('x').fork('terrain').next()).toBe(f1);
  });
});

describe('terrain height field', () => {
  it('is deterministic for a seed', () => {
    const a = createHeightField(7);
    const b = createHeightField(7);
    for (const [x, z] of [
      [0, 0],
      [12.5, -40],
      [90, 33],
      [-120, 77],
    ])
      expect(a.heightAt(x, z)).toBe(b.heightAt(x, z));
  });

  it('is coherent (no per-vertex randomness) and gently rolling inside the boundary', () => {
    const f = createHeightField(7);
    let maxSlope = 0;
    for (let x = -100; x <= 100; x += 5) {
      for (let z = -100; z <= 100; z += 5) {
        const d = Math.abs(f.heightAt(x + 0.5, z) - f.heightAt(x, z)) / 0.5;
        maxSlope = Math.max(maxSlope, d);
      }
    }
    expect(maxSlope).toBeLessThan(0.6); // < ~31°, comfortably drivable
  });

  it('keeps the spawn meadow flat and raises a rim beyond the boundary', () => {
    const f = createHeightField(7);
    expect(Math.abs(f.heightAt(0, 0))).toBeLessThan(0.05);
    expect(f.heightAt(Config.world.radius + 40, 0)).toBeGreaterThan(8);
  });

  it('produces unit normals that point up', () => {
    const f = createHeightField(3);
    const n = f.normalAt(30, 30, { x: 0, y: 0, z: 0 });
    expect(Math.hypot(n.x, n.y, n.z)).toBeCloseTo(1, 6);
    expect(n.y).toBeGreaterThan(0.8);
  });
});

describe('themes', () => {
  it('defines the four original themes with every palette group', () => {
    expect(THEMES.map((t) => t.name)).toEqual(['Enchanted Dream', 'Sunset Oasis', 'Crystal Forest', 'Cosmic Night']);
    for (const t of THEMES) {
      for (const k of ['sky', 'ground', 'light', 'car', 'flowers', 'crystals', 'mushrooms', 'grass', 'css']) expect(t[k]).toBeDefined();
    }
  });

  it('cycles theme ids and falls back to the first theme', () => {
    expect(nextThemeId(THEME_IDS.at(-1))).toBe(THEME_IDS[0]);
    expect(getTheme('nope').id).toBe(THEME_IDS[0]);
  });

  it('blends the live palette to the target without replacing color objects', () => {
    const tm = new ThemeManager('enchanted-dream');
    const groundRef = tm.palette.ground.base;
    expect(tm.setTheme('sunset-oasis')).toBe(true);
    expect(tm.transitioning).toBe(true);
    tm.update(Config.themeTransitionSeconds / 2);
    const mid = groundRef.getHex();
    expect(mid).not.toBe(getTheme('enchanted-dream').ground.base);
    expect(mid).not.toBe(getTheme('sunset-oasis').ground.base);
    tm.update(Config.themeTransitionSeconds);
    expect(tm.transitioning).toBe(false);
    expect(tm.palette.ground.base).toBe(groundRef); // same object → materials keep references
    expect(groundRef.getHex()).toBe(getTheme('sunset-oasis').ground.base);
    expect(tm.palette.nightFloor).toBe(getTheme('sunset-oasis').nightFloor);
  });

  it('notifies listeners and supports instant switching', () => {
    const tm = new ThemeManager('enchanted-dream');
    const seen = [];
    tm.onChange((t) => seen.push(t.id));
    tm.setTheme('cosmic-night', { instant: true });
    expect(seen).toEqual(['cosmic-night']);
    expect(tm.transitioning).toBe(false);
    expect(tm.palette.sky.dayTop.getHex()).toBe(getTheme('cosmic-night').sky.dayTop);
  });
});

describe('day / night cycle', () => {
  it('is day at noon and night at midnight, advancing with dt', () => {
    expect(nightAt(0.25)).toBe(0);
    expect(nightAt(0.7)).toBe(1);
    const c = new DayNightCycle({ cycleSeconds: 100, phase: 0 });
    c.update(25);
    expect(c.phase).toBeCloseTo(0.25);
    c.paused = true;
    c.update(50);
    expect(c.phase).toBeCloseTo(0.25);
  });
});

describe('configuration', () => {
  it('ships a valid configuration', () => {
    expect(validateConfig()).toBe(true);
  });

  it('rejects malformed presets with a readable message', () => {
    const bad = structuredClone(Config);
    bad.presets.low.pixelRatio = 5;
    delete bad.presets.high;
    expect(() => validateConfig(bad)).toThrow(/low\.pixelRatio.*missing preset "high"/);
  });

  it('chooses conservative presets from capability signals', () => {
    expect(choosePreset({ cores: 8, memory: 8, coarse: true, minScreen: 390 })).toBe('low');
    expect(choosePreset({ cores: 8, memory: 8, coarse: true, minScreen: 820 })).toBe('medium');
    expect(choosePreset({ cores: 4, memory: 8, coarse: false, minScreen: 900 })).toBe('medium');
    expect(choosePreset({ cores: 16, memory: 16, coarse: false, minScreen: 1080, rendererName: 'NVIDIA GeForce RTX' })).toBe('high');
    expect(choosePreset({ cores: 16, memory: 16, coarse: false, minScreen: 1080, rendererName: 'Google SwiftShader' })).toBe('low');
  });
});
