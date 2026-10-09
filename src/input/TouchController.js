import { clamp } from '../utils/math.js';

/**
 * On-screen controls built on pointer events: a steering pad on the left and
 * Go / Brake pedals on the right. `touch-action: none` is applied only to the
 * controls themselves, never globally, so pinch-zoom and scrolling keep
 * working in menus and dialogs.
 */
export class TouchController {
  constructor(root) {
    this.root = root;
    this.steer = 0;
    this.gas = false;
    this.brake = false;
    this.pad = root.querySelector('[data-touch="steer"]');
    this.knob = root.querySelector('[data-touch="knob"]');
    this.gasBtn = root.querySelector('[data-touch="gas"]');
    this.brakeBtn = root.querySelector('[data-touch="brake"]');
    this.padPointer = null;
    this._listeners = [];

    this._on(this.pad, 'pointerdown', (e) => {
      this.padPointer = e.pointerId;
      this.pad.setPointerCapture(e.pointerId);
      this._steerFrom(e);
    });
    this._on(this.pad, 'pointermove', (e) => e.pointerId === this.padPointer && this._steerFrom(e));
    const endPad = (e) => {
      if (e.pointerId !== this.padPointer) return;
      this.padPointer = null;
      this.steer = 0;
      this.knob.style.transform = '';
    };
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach((t) => this._on(this.pad, t, endPad));

    this._pedal(this.gasBtn, (v) => (this.gas = v));
    this._pedal(this.brakeBtn, (v) => (this.brake = v));
  }

  _on(el, type, fn) {
    el.addEventListener(type, fn);
    this._listeners.push(() => el.removeEventListener(type, fn));
  }

  _pedal(btn, set) {
    const down = (e) => {
      e.preventDefault();
      btn.setPointerCapture?.(e.pointerId);
      set(true);
      btn.classList.add('is-pressed');
    };
    const up = () => {
      set(false);
      btn.classList.remove('is-pressed');
    };
    this._on(btn, 'pointerdown', down);
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach((t) => this._on(btn, t, up));
    this._on(btn, 'contextmenu', (e) => e.preventDefault());
  }

  _steerFrom(e) {
    const rect = this.pad.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const radius = rect.width / 2;
    const dx = clamp((e.clientX - cx) / radius, -1, 1);
    // Small dead zone, then a gentle curve for fine control.
    const v = Math.abs(dx) < 0.08 ? 0 : Math.sign(dx) * ((Math.abs(dx) - 0.08) / 0.92) ** 1.3;
    this.steer = -v; // positive steer = left
    this.knob.style.transform = `translateX(${dx * radius * 0.6}px)`;
  }

  reset() {
    this.steer = 0;
    this.gas = false;
    this.brake = false;
    this.padPointer = null;
    this.knob.style.transform = '';
    this.gasBtn.classList.remove('is-pressed');
    this.brakeBtn.classList.remove('is-pressed');
  }

  dispose() {
    this._listeners.forEach((off) => off());
  }
}
