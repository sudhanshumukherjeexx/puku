import { PerspectiveCamera, Vector3 } from 'three';
import { Config } from '../core/Config.js';
import { clamp, dampFactor, lerpAngle } from '../utils/math.js';

const desired = new Vector3();
const look = new Vector3();

/**
 * Smooth third-person camera. All smoothing is exponential and dt-based, so it
 * feels the same at 30, 60 or 120 FPS. Keeps a minimum clearance above the
 * height field (no terrain clipping). Optional, very small speed shake uses
 * deterministic sine noise — never random jitter.
 *
 * Photo mode reuses the same camera with an orbit offset.
 */
export class FollowCamera {
  constructor(aspect) {
    const c = Config.camera;
    this.camera = new PerspectiveCamera(c.fov, aspect, c.near, c.far);
    this.yaw = 0;
    this.shake = true;
    this.orbit = null; // { yaw, pitch, distance } in photo mode
    this.lookTarget = new Vector3();
  }

  snap(car, field) {
    this.yaw = car.heading;
    this._desired(car, field, desired);
    this.camera.position.copy(desired);
    this.lookTarget.set(car.x, field.heightAt(car.x, car.z) + Config.camera.lookHeight, car.z);
    this.camera.lookAt(this.lookTarget);
  }

  _desired(car, field, out) {
    const c = Config.camera;
    const groundY = field.heightAt(car.x, car.z);
    if (this.orbit) {
      const { yaw, pitch, distance } = this.orbit;
      const h = Math.cos(pitch) * distance;
      out.set(car.x - Math.sin(car.heading + yaw) * h, groundY + 1 + Math.sin(pitch) * distance, car.z - Math.cos(car.heading + yaw) * h);
    } else {
      out.set(
        car.x - Math.sin(this.yaw) * c.distance,
        groundY + c.height + Math.abs(car.speed) * c.speedHeight,
        car.z - Math.cos(this.yaw) * c.distance,
      );
    }
    const floor = field.heightAt(out.x, out.z) + c.minClearance;
    if (out.y < floor) out.y = floor;
    return out;
  }

  update(car, field, dt, time) {
    const c = Config.camera;
    // Yaw follows heading; while reversing, don't swing around the car.
    if (car.speed > -0.5) this.yaw = lerpAngle(this.yaw, car.heading, dampFactor(c.yawRate, dt));
    this._desired(car, field, desired);

    const follow = this.orbit ? 10 : c.followRate;
    this.camera.position.lerp(desired, dampFactor(follow, dt));
    const floor = field.heightAt(this.camera.position.x, this.camera.position.z) + c.minClearance;
    if (this.camera.position.y < floor) this.camera.position.y = floor;

    look.set(car.x, field.heightAt(car.x, car.z) + c.lookHeight, car.z);
    this.lookTarget.lerp(look, dampFactor(12, dt));

    if (this.shake && !this.orbit) {
      const k = clamp((Math.abs(car.speed) / Config.car.maxSpeed - 0.7) / 0.3, 0, 1) * c.shakeMax;
      if (k > 0) {
        this.camera.position.y += Math.sin(time * 31) * Math.sin(time * 17.3) * k;
        this.camera.position.x += Math.sin(time * 23.7) * k * 0.6;
      }
    }
    this.camera.lookAt(this.lookTarget);
  }

  resize(aspect) {
    this.camera.aspect = aspect;
    // Portrait screens get a wider vertical FOV so the car isn't cramped.
    this.camera.fov = aspect < 0.8 ? Config.camera.fov + 12 : Config.camera.fov;
    this.camera.updateProjectionMatrix();
  }
}
