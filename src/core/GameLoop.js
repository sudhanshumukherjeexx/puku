import { Config } from './Config.js';

/**
 * Pure fixed-timestep accumulator. Feed it real frame deltas; it calls
 * `step(dt)` a whole number of times with a constant dt and returns the
 * interpolation alpha for rendering. No DOM, fully unit-testable.
 */
export function createFixedStepper({
  fixedStep = Config.loop.fixedStep,
  maxFrameTime = Config.loop.maxFrameTime,
  maxSteps = Config.loop.maxStepsPerFrame,
} = {}) {
  let accumulator = 0;
  return {
    advance(frameDelta, step) {
      accumulator += Math.min(Math.max(frameDelta, 0), maxFrameTime);
      let steps = 0;
      while (accumulator >= fixedStep && steps < maxSteps) {
        step(fixedStep);
        accumulator -= fixedStep;
        steps++;
      }
      // Drop backlog we refused to simulate rather than carrying it forever.
      if (steps === maxSteps && accumulator > fixedStep) accumulator = accumulator % fixedStep;
      return { steps, alpha: accumulator / fixedStep };
    },
    reset() {
      accumulator = 0;
    },
  };
}

/**
 * requestAnimationFrame driver. Rendering runs every animation frame; the
 * simulation runs on the fixed stepper. Stops completely while the page is
 * hidden and resumes without a large catch-up step.
 */
export class GameLoop {
  constructor({ fixedUpdate, update, render }) {
    this.fixedUpdate = fixedUpdate;
    this.update = update;
    this.render = render;
    this.stepper = createFixedStepper();
    this.simulate = true;
    this.renderEnabled = true;
    this.running = false;
    this.rafId = 0;
    this.last = 0;
    this.frameMs = 0;
    this._tick = this._tick.bind(this);
    this._onVisibility = () => (document.hidden ? this.stop() : this.start());
    document.addEventListener('visibilitychange', this._onVisibility);
  }

  start() {
    if (this.running || document.hidden) return;
    this.running = true;
    this.last = performance.now();
    this.stepper.reset();
    this.rafId = requestAnimationFrame(this._tick);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.rafId);
  }

  /** Renders a single frame on demand (e.g. after a theme change while paused). */
  requestFrame() {
    if (!this.running || this.renderEnabled) return;
    this._pendingFrame = true;
  }

  _tick(now) {
    if (!this.running) return;
    this.rafId = requestAnimationFrame(this._tick);
    const delta = Math.min((now - this.last) / 1000, Config.loop.maxFrameTime);
    this.last = now;

    let alpha = 1;
    if (this.simulate) {
      alpha = this.stepper.advance(delta, this.fixedUpdate).alpha;
    } else {
      this.stepper.reset();
    }
    this.update(delta, alpha);

    if (this.renderEnabled || this._pendingFrame) {
      const t0 = performance.now();
      this.render(delta);
      this.frameMs = performance.now() - t0;
      this._pendingFrame = false;
    }
  }

  dispose() {
    this.stop();
    document.removeEventListener('visibilitychange', this._onVisibility);
  }
}
