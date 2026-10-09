import { refs } from './dom.js';
import { toKmh } from '../vehicle/CarPhysics.js';
import { Config } from '../core/Config.js';

/**
 * Minimal heads-up display. Each value is written only when it changes, and
 * the speedometer updates its own child nodes — the container's markup is
 * never replaced (the original bug wiped the whole widget via textContent).
 */
export class HUD {
  constructor(root, { touch }) {
    this.root = root;
    this.r = refs(root);
    this.touch = touch;
    this._speed = -1;
    this._bar = -1;
    this._promptKey = null;
    this._toastTimer = 0;
    this.setTouchMode(touch);
  }

  show(visible) {
    this.root.hidden = !visible;
  }

  /** Hide/show without unmounting (H key, photo mode). */
  setCollapsed(collapsed) {
    this.root.classList.toggle('is-collapsed', collapsed);
  }

  setTouchMode(touch) {
    this.touch = touch;
    this.r.promptText.innerHTML = touch ? 'Discover memory' : 'Press <kbd>E</kbd> to discover';
    this._renderHints();
  }

  /** km/h is calibrated: 1 world unit ≈ 1 m. */
  setSpeed(speed) {
    const kmh = Math.round(toKmh(speed));
    if (kmh !== this._speed) {
      this._speed = kmh;
      this.r.speed.textContent = String(kmh);
    }
    const bar = Math.round((Math.abs(speed) / Config.car.maxSpeed) * 100);
    if (bar !== this._bar) {
      this._bar = bar;
      this.r.speedBar.style.transform = `scaleX(${bar / 100})`;
    }
  }

  setProgress(found, total) {
    this.r.found.textContent = String(found);
    this.r.total.textContent = String(total);
  }

  /** @param memory nearby memory or null */
  setPrompt(memory, found) {
    const key = memory ? `${memory.id}:${found}` : null;
    if (key === this._promptKey) return;
    this._promptKey = key;
    this.r.prompt.hidden = !memory;
    if (memory) {
      const verb = found ? 'revisit' : 'discover';
      this.r.promptText.innerHTML = this.touch ? `${found ? 'Revisit' : 'Discover'} memory` : `Press <kbd>E</kbd> to ${verb}`;
    }
  }

  setMinimapVisible(v) {
    this.r.minimap.hidden = !v;
    this.root.querySelector('[data-action="map"]').setAttribute('aria-pressed', String(v));
  }

  showHints(v) {
    this.r.hint.hidden = !v;
  }

  _renderHints() {
    const items = this.touch
      ? ['Slide the left pad to steer', 'Hold <b>Go</b> to drive, <b>Brake</b> to slow or reverse', 'Find the floating picture cards ✦']
      : [
          '<kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> or arrow keys to drive',
          '<kbd>E</kbd> near a picture card to discover it',
          '<kbd>J</kbd> journal · <kbd>T</kbd> map · <kbd>Esc</kbd> pause',
        ];
    this.r.hintList.innerHTML = items.map((t) => `<li>${t}</li>`).join('');
  }

  toast(title, message, { duration = 4200, tone = '' } = {}) {
    const node = document.createElement('div');
    node.className = `toast ${tone ? `toast--${tone}` : ''}`;
    const strong = document.createElement('strong');
    strong.textContent = title;
    node.append(strong);
    if (message) {
      const p = document.createElement('span');
      p.textContent = message;
      node.append(p);
    }
    this.r.toasts.append(node);
    while (this.r.toasts.children.length > 3) this.r.toasts.firstElementChild.remove();
    setTimeout(() => {
      node.classList.add('is-leaving');
      setTimeout(() => node.remove(), 400);
    }, duration);
  }
}
