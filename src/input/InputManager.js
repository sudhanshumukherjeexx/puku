import { KeyboardController } from './KeyboardController.js';
import { TouchController } from './TouchController.js';

/**
 * Single source of driving input. Combines keyboard and touch into
 * { throttle, steer, brake } and clears everything whenever focus or
 * game state changes, so nothing can get stuck "held".
 */
export class InputManager {
  constructor({ touchRoot, canDrive, onAction }) {
    this.keyboard = new KeyboardController({ canDrive, onAction });
    this.touch = touchRoot ? new TouchController(touchRoot) : null;
    this.drive = { throttle: 0, steer: 0, brake: false };

    this._reset = () => this.reset();
    this._onVisibility = () => document.hidden && this.reset();
    window.addEventListener('blur', this._reset);
    document.addEventListener('visibilitychange', this._onVisibility);
  }

  /** Reads the current input into a reusable object (no allocations). */
  read() {
    const k = this.keyboard;
    const t = this.touch;
    let throttle = (k.isDown('forward') ? 1 : 0) - (k.isDown('backward') ? 1 : 0);
    let steer = (k.isDown('left') ? 1 : 0) - (k.isDown('right') ? 1 : 0);
    const brake = k.isDown('brake');
    if (t) {
      if (t.gas) throttle = Math.max(throttle, 1);
      if (t.brake) throttle = Math.min(throttle, -1); // brake pedal brakes, then reverses
      if (t.steer !== 0) steer = t.steer;
    }
    this.drive.throttle = throttle;
    this.drive.steer = steer;
    this.drive.brake = brake;
    return this.drive;
  }

  reset() {
    this.keyboard.reset();
    this.touch?.reset();
    this.drive.throttle = 0;
    this.drive.steer = 0;
    this.drive.brake = false;
  }

  dispose() {
    this.keyboard.dispose();
    this.touch?.dispose();
    window.removeEventListener('blur', this._reset);
    document.removeEventListener('visibilitychange', this._onVisibility);
  }
}
