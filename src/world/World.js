import { Scene } from 'three';
import { Config } from '../core/Config.js';
import { createRng } from '../utils/random.js';
import { Car } from '../vehicle/Car.js';
import { MemoryManager } from '../memories/MemoryManager.js';
import { createHeightField } from './heightField.js';
import { Terrain, createPath } from './Terrain.js';
import { Environment } from './Environment.js';
import { Decorations } from './Decorations.js';
import { Effects } from './Effects.js';
import { sharedUniforms } from './materials.js';

const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));

/**
 * Builds and owns the scene graph. Construction is split into steps that
 * yield to the browser so the loading screen can report real progress.
 * The world is built once; themes, day/night and quality only mutate it.
 */
export class World {
  constructor({ manifest, placements, preset, loadingManager, isFound }) {
    this.manifest = manifest;
    this.placements = placements;
    this.preset = preset;
    this.loadingManager = loadingManager;
    this.isFound = isFound;
    this.scene = new Scene();
    this.field = createHeightField(manifest.seed);
  }

  /** @param onProgress (done, total, label) */
  async build(onProgress) {
    const seed = this.manifest.seed;
    const rng = createRng(seed);
    const story = this.placements.filter((p) => !p.echo);
    const steps = [
      [
        'Shaping the hills',
        () => {
          this.terrain = new Terrain(this.field, this.preset.terrainSegments, rng.fork('ground'));
          this.scene.add(this.terrain.mesh);
          this.path = createPath(this.field, story);
          this.scene.add(this.path.mesh);
        },
      ],
      [
        'Painting the sky',
        () => {
          this.environment = new Environment(this.scene, seed);
        },
      ],
      [
        'Planting the meadow',
        () => {
          const avoid = [
            { x: 0, z: 0, r: 7 },
            { x: 0, z: -14, r: 5 },
          ];
          this.placements.forEach((p) => avoid.push({ x: p.x, z: p.z, r: 4.5 }));
          const pathPts = this.path.curve.getSpacedPoints(Math.ceil(this.path.length / 3));
          pathPts.forEach((p) => avoid.push({ x: p.x, z: p.z, r: 2.2 }));
          this.decorations = new Decorations(this.scene, this.field, rng.fork('decor'), avoid);
          this.effects = new Effects(this.scene, this.field, this.path, seed);
        },
      ],
      [
        'Hanging the memories',
        () => {
          this.memories = new MemoryManager(this.scene, this.field, this.manifest, this.placements, {
            loadingManager: this.loadingManager,
            isFound: this.isFound,
          });
        },
      ],
      [
        'Polishing the car',
        () => {
          this.car = new Car();
          this.scene.add(this.car.root);
        },
      ],
    ];
    for (let i = 0; i < steps.length; i++) {
      onProgress?.(i, steps.length, steps[i][0]);
      await nextFrame();
      steps[i][1]();
    }
    onProgress?.(steps.length, steps.length, 'Ready');
    this.setQuality(this.preset);
  }

  setQuality(preset) {
    this.preset = preset;
    this.environment.setQuality(preset);
    this.decorations.setQuality(preset);
    this.car.setQuality(preset);
  }

  /** Recolours everything from the live palette. Called only when it changed. */
  applyPalette(p) {
    this.terrain.applyPalette(p);
    this.path.applyPalette(p);
    this.decorations.applyPalette(p);
    this.effects.applyPalette(p);
    this.memories.applyPalette(p);
    this.car.applyPalette(p);
  }

  /**
   * Per-frame visual update (not simulation).
   * @param focus  THREE.Vector3 the player position
   */
  update(dt, time, palette, cycle, focus, animate) {
    sharedUniforms.uTime.value = time;
    sharedUniforms.uWind.value = animate ? 1 : 0;
    sharedUniforms.uCenter.value.x = focus.x;
    sharedUniforms.uCenter.value.y = focus.y;
    sharedUniforms.uCenter.value.z = focus.z;

    this.environment.update(palette, cycle, focus);
    const night = this.environment.night;
    this.decorations.setGlow(night, palette.glow);
    this.decorations.update(time, animate);
    this.effects.setNight(night);
    this.effects.update(dt, time, focus, animate);
    this.car.setNight(this.preset.headlight ? night : 0);
    this.memories.update(time, animate, night);
  }

  get worldRadius() {
    return Config.world.radius;
  }
}
