import { describe, expect, it } from 'vitest';
import { Config } from '../../src/core/Config.js';
import { createCarState, stepCar, toKmh } from '../../src/vehicle/CarPhysics.js';
import { createFixedStepper } from '../../src/core/GameLoop.js';

const STEP = Config.loop.fixedStep;
const drive = (s, input, seconds) => {
  for (let t = 0; t < seconds - 1e-9; t += STEP) stepCar(s, input, STEP);
  return s;
};
const GAS = { throttle: 1, steer: 0, brake: false };
const IDLE = { throttle: 0, steer: 0, brake: false };

describe('car physics', () => {
  it('accelerates forward smoothly and respects the speed limit', () => {
    const s = createCarState();
    drive(s, GAS, 0.5);
    const early = s.speed;
    expect(early).toBeGreaterThan(3);
    drive(s, GAS, 4); // ~75 m: well inside the 150 m boundary
    expect(s.speed).toBeLessThanOrEqual(Config.car.maxSpeed);
    expect(s.speed).toBeGreaterThan(Config.car.maxSpeed * 0.85);
    expect(s.speed).toBeGreaterThan(early);
    expect(s.z).toBeGreaterThan(0); // heading 0 drives toward +z
  });

  it('coasts to a stop without input', () => {
    const s = drive(createCarState(), GAS, 2);
    drive(s, IDLE, 15);
    expect(s.speed).toBe(0);
  });

  it('brakes much faster than it coasts', () => {
    const a = drive(createCarState(), GAS, 3);
    const b = { ...a };
    drive(a, { throttle: 0, steer: 0, brake: true }, 0.5);
    drive(b, IDLE, 0.5);
    expect(a.speed).toBeLessThan(b.speed);
  });

  it('pressing back while moving forward brakes first, then reverses (capped)', () => {
    const s = drive(createCarState(), GAS, 2);
    const back = { throttle: -1, steer: 0, brake: false };
    stepCar(s, back, STEP);
    expect(s.speed).toBeGreaterThan(0); // still braking, not instantly reversing
    drive(s, back, 10);
    expect(s.speed).toBeLessThan(0);
    expect(s.speed).toBeGreaterThanOrEqual(-Config.car.maxReverseSpeed);
  });

  it('steers left (heading increases) only while moving', () => {
    const parked = drive(createCarState(), { throttle: 0, steer: 1, brake: false }, 1);
    expect(parked.heading).toBe(0);
    const moving = drive(createCarState(), { throttle: 1, steer: 1, brake: false }, 1.5);
    expect(moving.heading).toBeGreaterThan(0.3);
  });

  it('reverse steering is mirrored like a real car', () => {
    const s = createCarState();
    s.speed = -5;
    drive(s, { throttle: 0, steer: 1, brake: false }, 0.5);
    expect(s.heading).toBeLessThan(0);
  });

  it('keeps the car inside the circular boundary and bounces softly', () => {
    const r = Config.world.radius;
    const s = createCarState(0, r - 0.2, 0);
    s.speed = 20;
    stepCar(s, GAS, STEP);
    expect(Math.hypot(s.x, s.z)).toBeLessThanOrEqual(r + 1e-6);
    expect(s.boundaryHit).toBe(true);
    expect(s.speed).toBeLessThan(0); // bounced back inward
    drive(s, GAS, 3); // holding forward into the rim never escapes it
    expect(Math.hypot(s.x, s.z)).toBeLessThanOrEqual(r + 1e-6);
  });

  it('reports calibrated km/h', () => {
    expect(toKmh(10)).toBeCloseTo(36);
    expect(toKmh(-10)).toBeCloseTo(36);
  });
});

describe('fixed timestep', () => {
  /** Simulates `seconds` of wall time rendered at `fps`, returns final car state. */
  function simulateAt(fps, seconds = 4) {
    const stepper = createFixedStepper();
    const s = createCarState();
    const input = { throttle: 1, steer: 0.6, brake: false };
    const frame = 1 / fps;
    for (let t = 0; t < seconds - 1e-9; t += frame) stepper.advance(frame, (dt) => stepCar(s, input, dt));
    return s;
  }

  it('produces the same motion at 30, 60 and 120 FPS', () => {
    const a = simulateAt(30);
    const b = simulateAt(60);
    const c = simulateAt(120);
    for (const o of [a, c]) {
      expect(o.x).toBeCloseTo(b.x, 1);
      expect(o.z).toBeCloseTo(b.z, 1);
      expect(o.heading).toBeCloseTo(b.heading, 2);
      expect(o.speed).toBeCloseTo(b.speed, 2);
    }
  });

  it('clamps huge frame gaps (tab switch) instead of teleporting', () => {
    const stepper = createFixedStepper();
    let steps = 0;
    const { steps: n } = stepper.advance(30, () => steps++);
    expect(n).toBe(Config.loop.maxStepsPerFrame);
    expect(steps).toBeLessThanOrEqual(Config.loop.maxStepsPerFrame);
  });

  it('returns an interpolation alpha in [0, 1)', () => {
    const stepper = createFixedStepper();
    const { alpha } = stepper.advance(STEP * 1.5, () => {});
    expect(alpha).toBeGreaterThanOrEqual(0);
    expect(alpha).toBeLessThan(1);
    expect(alpha).toBeCloseTo(0.5, 5);
  });
});
