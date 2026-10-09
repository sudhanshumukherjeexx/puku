import { Config } from '../core/Config.js';

/**
 * Lightweight 2D canvas map (no second renderer). The static layer — boundary
 * and path — is drawn once to an offscreen canvas; each update just blits it
 * and draws a handful of markers. Updated at Config.minimapHz, and skipped
 * entirely when nothing moved.
 */
export class Minimap {
  constructor(canvas, { pathPoints, markers, isFound, landmarkVisible }) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.markers = markers;
    this.isFound = isFound;
    this.landmarkVisible = landmarkVisible;
    this.dpr = Math.min(globalThis.devicePixelRatio || 1, 2);
    this.size = canvas.width;
    canvas.width = canvas.height = this.size * this.dpr;
    canvas.style.width = canvas.style.height = `${this.size}px`;
    this.scale = (this.size / 2 - 8) / Config.world.radius;
    this.accent = '#b78ad9';
    this.pathPoints = pathPoints;
    this._timer = 0;
    this._lastKey = '';
    this._buildStatic();
  }

  setAccent(css) {
    this.accent = css;
    this._buildStatic();
    this._lastKey = '';
  }

  _buildStatic() {
    const s = this.size * this.dpr;
    const off = (this.static ??= document.createElement('canvas'));
    off.width = off.height = s;
    const g = off.getContext('2d');
    g.setTransform(this.dpr, 0, 0, this.dpr, (this.size / 2) * this.dpr, (this.size / 2) * this.dpr);
    g.clearRect(-this.size, -this.size, this.size * 2, this.size * 2);
    const R = Config.world.radius * this.scale;
    g.beginPath();
    g.arc(0, 0, R, 0, Math.PI * 2);
    g.fillStyle = 'rgba(255,255,255,0.55)';
    g.fill();
    g.lineWidth = 2;
    g.strokeStyle = this.accent;
    g.globalAlpha = 0.6;
    g.stroke();
    g.globalAlpha = 1;
    // Story path
    g.beginPath();
    this.pathPoints.forEach((p, i) => {
      const x = -p.x * this.scale; // world +x is the driver's left
      const y = -p.z * this.scale;
      if (i) g.lineTo(x, y);
      else g.moveTo(x, y);
    });
    g.strokeStyle = 'rgba(160,130,110,0.35)';
    g.lineWidth = 2.5;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.stroke();
  }

  /** Throttled; returns quickly when hidden or nothing changed. */
  update(dt, car, nearKey, force = false) {
    this._timer += dt;
    if (!force && this._timer < 1 / Config.minimapHz) return;
    this._timer = 0;
    if (this.canvas.offsetParent === null) return; // hidden
    const key = `${car.x.toFixed(1)},${car.z.toFixed(1)},${car.heading.toFixed(2)},${nearKey},${this.landmarkVisible()}`;
    if (!force && key === this._lastKey) return;
    this._lastKey = key;
    this._draw(car, nearKey);
  }

  _draw(car, nearKey) {
    const g = this.ctx;
    const s = this.size;
    const sc = this.scale;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, s * this.dpr, s * this.dpr);
    g.drawImage(this.static, 0, 0);
    g.setTransform(this.dpr, 0, 0, this.dpr, (s / 2) * this.dpr, (s / 2) * this.dpr);

    if (this.landmarkVisible()) {
      g.fillStyle = '#ffd77a';
      g.beginPath();
      g.arc(0, 0, 4, 0, Math.PI * 2);
      g.fill();
    }

    for (const m of this.markers) {
      const x = -m.x * sc;
      const y = -m.z * sc;
      const found = this.isFound(m.memoryId);
      g.beginPath();
      g.arc(x, y, m.key === nearKey ? 5 : 3.6, 0, Math.PI * 2);
      g.fillStyle = found ? '#f2c45a' : 'rgba(255,255,255,0.95)';
      g.fill();
      g.lineWidth = 1.6;
      g.strokeStyle = found ? '#b88a2a' : this.accent;
      g.stroke();
    }

    // Player arrow: world forward (sin h, cos h) maps to (-sin h, -cos h) on the canvas.
    const px = -car.x * sc;
    const py = -car.z * sc;
    g.save();
    g.translate(px, py);
    g.rotate(-car.heading);
    g.beginPath();
    g.moveTo(0, -7);
    g.lineTo(5, 5);
    g.lineTo(0, 2.5);
    g.lineTo(-5, 5);
    g.closePath();
    g.fillStyle = '#333448';
    g.fill();
    g.strokeStyle = '#fff';
    g.lineWidth = 1.5;
    g.stroke();
    g.restore();
  }
}
