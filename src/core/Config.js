/**
 * Central tunables. Units: 1 world unit ≈ 1 metre (the car is 4.5 units long),
 * time in seconds. Immutable — runtime state lives elsewhere.
 */
const deepFreeze = (o) => {
  Object.values(o).forEach((v) => typeof v === 'object' && v !== null && deepFreeze(v));
  return Object.freeze(o);
};

export const Config = deepFreeze({
  loop: {
    fixedStep: 1 / 60,
    maxFrameTime: 0.25, // clamp after tab switches / long GC pauses
    maxStepsPerFrame: 5, // avoid spiral of death on slow devices
  },

  world: {
    radius: 150, // drivable circle
    terrainExtent: 230, // half-size of the terrain plane (mountain rim beyond radius)
    spawnClearRadius: 18,
  },

  car: {
    maxSpeed: 26, // ≈ 94 km/h — relaxed, not racing
    maxReverseSpeed: 9,
    acceleration: 11,
    reverseAcceleration: 7,
    brakeDeceleration: 26,
    coastDeceleration: 4.5,
    rollingDrag: 0.12, // proportional drag, keeps top-end smooth
    turnRate: 1.55, // rad/s at full lock and moderate speed
    turnFullSpeed: 7, // speed at which steering reaches full authority
    highSpeedTurnDamping: 0.35,
    steerResponse: 7, // how quickly steering input reaches its target
    boundaryBounce: 0.3,
  },

  camera: {
    distance: 11,
    height: 5.2,
    speedHeight: 0.06,
    lookHeight: 1.2,
    followRate: 4.5,
    yawRate: 3.2,
    minClearance: 1.6,
    fov: 62,
    near: 0.5,
    far: 650,
    shakeMax: 0.05,
  },

  memories: {
    interactionDistance: 7,
    proximityHz: 10,
    spriteHeight: 2.6,
    spriteWidth: 5.4,
    minSpacing: 20,
    spiralStart: 26,
    spiralStep: 30, // arc length between consecutive story memories
  },

  dayNight: {
    cycleSeconds: 360,
    startPhase: 0.08,
  },

  themeTransitionSeconds: 1.2,
  minimapHz: 8,
  hudHz: 15,

  /** Graphics presets. Decoration counts are upper bounds (InstancedMesh.count). */
  presets: {
    low: {
      pixelRatio: 1,
      shadows: false,
      shadowMapSize: 0,
      density: 0.45,
      particles: 120,
      headlight: false,
      terrainSegments: 96,
      fogFar: 120,
      antialias: false,
    },
    medium: {
      pixelRatio: 1.5,
      shadows: true,
      shadowMapSize: 1024,
      density: 0.75,
      particles: 260,
      headlight: true,
      terrainSegments: 128,
      fogFar: 150,
      antialias: false,
    },
    high: {
      pixelRatio: 2,
      shadows: true,
      shadowMapSize: 2048,
      density: 1,
      particles: 450,
      headlight: true,
      terrainSegments: 160,
      fogFar: 180,
      antialias: true,
    },
  },

  performance: {
    sampleSeconds: 4,
    warmupSeconds: 3,
    downgradeBelowFps: 38,
    consecutiveSlowSamples: 2,
  },
});

export const PRESET_ORDER = ['low', 'medium', 'high'];

/** Throws with a readable message if a preset is malformed. Used at startup and in tests. */
export function validateConfig(cfg = Config) {
  const errors = [];
  for (const name of PRESET_ORDER) {
    const p = cfg.presets[name];
    if (!p) {
      errors.push(`missing preset "${name}"`);
      continue;
    }
    if (!(p.pixelRatio > 0 && p.pixelRatio <= 2)) errors.push(`${name}.pixelRatio must be in (0, 2]`);
    if (!(p.density > 0 && p.density <= 1)) errors.push(`${name}.density must be in (0, 1]`);
    if (p.shadows && !(p.shadowMapSize >= 256)) errors.push(`${name}.shadowMapSize too small`);
  }
  if (!(cfg.loop.fixedStep > 0 && cfg.loop.fixedStep <= 1 / 20)) errors.push('loop.fixedStep out of range');
  if (cfg.car.maxReverseSpeed > cfg.car.maxSpeed) errors.push('car.maxReverseSpeed exceeds maxSpeed');
  if (cfg.world.terrainExtent <= cfg.world.radius) errors.push('world.terrainExtent must exceed radius');
  if (errors.length) throw new Error(`Invalid config: ${errors.join('; ')}`);
  return true;
}
