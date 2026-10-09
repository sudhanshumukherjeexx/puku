import { onAction, refs } from './dom.js';
import { clamp } from '../utils/math.js';

/**
 * Photo mode: HUD hidden, car paused, camera orbits within comfortable limits.
 * Capture renders one frame and saves the canvas locally — no renderer
 * changes (no preserveDrawingBuffer cost during normal play), no uploads.
 */
export class PhotoMode {
  constructor(root, canvas, { onExit, onCapture }) {
    this.root = root;
    this.canvas = canvas;
    this.r = refs(root);
    this.orbit = { yaw: 0.6, pitch: 0.35, distance: 12 };
    this.active = false;
    this.onExit = onExit;
    this.onCapture = onCapture;
    this._drag = null;

    onAction(root, { 'photo-exit': () => onExit(), 'photo-capture': () => onCapture() });
    this._pd = (e) => {
      if (!this.active) return;
      this._drag = { id: e.pointerId, x: e.clientX, y: e.clientY };
      canvas.setPointerCapture(e.pointerId);
    };
    this._pm = (e) => {
      if (!this._drag || e.pointerId !== this._drag.id) return;
      this.nudge((e.clientX - this._drag.x) * -0.008, (e.clientY - this._drag.y) * 0.006, 0);
      this._drag.x = e.clientX;
      this._drag.y = e.clientY;
    };
    this._pu = () => (this._drag = null);
    this._wheel = (e) => {
      if (!this.active) return;
      e.preventDefault();
      this.nudge(0, 0, Math.sign(e.deltaY) * 1.2);
    };
    this._key = (e) => {
      if (!this.active) return;
      const map = {
        ArrowLeft: [0.08, 0, 0],
        ArrowRight: [-0.08, 0, 0],
        ArrowUp: [0, 0.05, 0],
        ArrowDown: [0, -0.05, 0],
        Equal: [0, 0, -1],
        NumpadAdd: [0, 0, -1],
        Minus: [0, 0, 1],
        NumpadSubtract: [0, 0, 1],
      };
      const d = map[e.code];
      if (d) {
        e.preventDefault();
        this.nudge(...d);
      }
      if (e.code === 'Space' || e.code === 'Enter') {
        if (e.target instanceof HTMLButtonElement) return;
        e.preventDefault();
        onCapture();
      }
    };
    canvas.addEventListener('pointerdown', this._pd);
    canvas.addEventListener('pointermove', this._pm);
    canvas.addEventListener('pointerup', this._pu);
    canvas.addEventListener('pointercancel', this._pu);
    canvas.addEventListener('wheel', this._wheel, { passive: false });
    window.addEventListener('keydown', this._key);
  }

  nudge(dyaw, dpitch, ddist) {
    const o = this.orbit;
    o.yaw += dyaw;
    o.pitch = clamp(o.pitch + dpitch, 0.05, 1.2);
    o.distance = clamp(o.distance + ddist, 5, 28);
  }

  enter(touch) {
    this.active = true;
    this.orbit.yaw = 0.6;
    this.orbit.pitch = 0.35;
    this.orbit.distance = 12;
    this.r.hint.textContent = touch
      ? 'Drag to orbit the car'
      : 'Drag or use arrow keys to orbit · scroll or +/− to zoom · Space to capture';
    this.root.hidden = false;
    this.canvas.classList.add('is-photo');
    this.root.querySelector('[data-action="photo-capture"]').focus({ preventScroll: true });
  }

  exit() {
    this.active = false;
    this._drag = null;
    this.root.hidden = true;
    this.canvas.classList.remove('is-photo');
  }
}

/** Saves the current canvas as a PNG. Must be called right after a render. */
export function saveCanvas(canvas, name) {
  return new Promise((resolve) => {
    try {
      canvas.toBlob((blob) => {
        if (!blob) return resolve(false);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = name;
        document.body.append(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
        resolve(true);
      }, 'image/png');
    } catch {
      resolve(false);
    }
  });
}
