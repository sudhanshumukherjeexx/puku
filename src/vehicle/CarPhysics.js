import { Config } from '../core/Config.js';
import { approach, clamp, wrapAngle } from '../utils/math.js';

/**
 * Pure, frame-rate independent car simulation. Called only from the fixed
 * timestep, it never touches Three.js objects or the DOM.
 *
 * Heading convention (kept from the original game): forward = (sin h, 0, cos h),
 * steering left increases heading.
 */
export function createCarState(x = 0, z = 0, heading = 0) {
  return { x, z, heading, speed: 0, steer: 0, boundaryHit: false };
}

export function copyCarState(src, dst) {
  dst.x = src.x;
  dst.z = src.z;
  dst.heading = src.heading;
  dst.speed = src.speed;
  dst.steer = src.steer;
  dst.boundaryHit = src.boundaryHit;
  return dst;
}

/**
 * @param {object} s       mutable car state
 * @param {{throttle:number, steer:number, brake:boolean}} input
 *        throttle in [-1, 1] (negative = brake/reverse), steer in [-1, 1] (positive = left)
 * @param {number} dt      fixed step in seconds
 */
export function stepCar(s, input, dt, p = Config.car, worldRadius = Config.world.radius) {
  const throttle = clamp(input.throttle || 0, -1, 1);

  if (input.brake) {
    s.speed = approach(s.speed, 0, p.brakeDeceleration * dt);
  } else if (throttle > 0) {
    // Pressing forward while rolling backwards brakes first.
    const rate = s.speed < 0 ? p.brakeDeceleration : p.acceleration;
    s.speed += rate * throttle * dt;
  } else if (throttle < 0) {
    const rate = s.speed > 0.25 ? p.brakeDeceleration : p.reverseAcceleration;
    s.speed += rate * throttle * dt;
  } else {
    s.speed = approach(s.speed, 0, p.coastDeceleration * dt);
  }

  // Gentle proportional drag smooths the approach to top speed.
  s.speed -= s.speed * p.rollingDrag * dt;
  s.speed = clamp(s.speed, -p.maxReverseSpeed, p.maxSpeed);
  if (Math.abs(s.speed) < 1e-4) s.speed = 0;

  // Smooth steering toward the requested input (keyboard is digital, touch is analog).
  s.steer = approach(s.steer, clamp(input.steer || 0, -1, 1), p.steerResponse * dt);

  const absSpeed = Math.abs(s.speed);
  const authority = clamp(absSpeed / p.turnFullSpeed, 0, 1);
  const highSpeedDamping = 1 - p.highSpeedTurnDamping * (absSpeed / p.maxSpeed);
  const direction = s.speed >= 0 ? 1 : -1;
  s.heading = wrapAngle(s.heading + s.steer * p.turnRate * authority * highSpeedDamping * direction * dt);

  s.x += Math.sin(s.heading) * s.speed * dt;
  s.z += Math.cos(s.heading) * s.speed * dt;

  // Circular boundary: clamp to the rim and bounce back softly.
  const r2 = s.x * s.x + s.z * s.z;
  s.boundaryHit = false;
  if (r2 > worldRadius * worldRadius) {
    const k = worldRadius / Math.sqrt(r2);
    s.x *= k;
    s.z *= k;
    // Only reverse velocity that points outward.
    const outward = (Math.sin(s.heading) * s.x + Math.cos(s.heading) * s.z) * Math.sign(s.speed);
    if (outward > 0) s.speed *= -p.boundaryBounce;
    s.boundaryHit = true;
  }
  return s;
}

/** Metres/second → km/h (1 world unit ≈ 1 metre). */
export const toKmh = (speed) => Math.abs(speed) * 3.6;
