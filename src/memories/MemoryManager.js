import {
  AdditiveBlending,
  BufferGeometry,
  CanvasTexture,
  Color,
  Float32BufferAttribute,
  ImageLoader,
  InstancedBufferAttribute,
  InstancedMesh,
  MeshBasicMaterial,
  Object3D,
  Points,
  PointsMaterial,
  RingGeometry,
  SRGBColorSpace,
  Sprite,
  SpriteMaterial,
} from 'three';
import { Config } from '../core/Config.js';
import { assetUrl } from '../utils/assets.js';
import { softDotTexture } from '../world/materials.js';

const CANVAS_W = 416;
const CANVAS_H = 330;
const PHOTO_W = 384;
const PHOTO_H = 256;
const GOLD = new Color(0xffd77a);
const dummy = new Object3D();
const tmp = new Color();

/**
 * Memory markers in the world: floating polaroids with a soft halo and a
 * ground ring. Positions come from `placeMemories` (synchronous, seeded);
 * thumbnails stream in afterwards and replace a placeholder card, so load
 * order can never affect the layout.
 *
 * Draw calls: one sprite per marker + 1 halo layer + 1 ring layer.
 */
export class MemoryManager {
  constructor(scene, field, manifest, placements, { loadingManager, isFound }) {
    this.scene = scene;
    this.field = field;
    this.manifest = manifest;
    this.byId = new Map(manifest.memories.map((m) => [m.id, m]));
    this.loader = new ImageLoader(loadingManager);
    this.isFound = isFound;
    this.images = new Map(); // memoryId -> HTMLImageElement | null (failed)
    this.accent = new Color(0xffffff);

    this.markers = placements.map((p, i) => {
      const memory = this.byId.get(p.memoryId);
      const y = field.heightAt(p.x, p.z);
      const canvas = document.createElement('canvas');
      canvas.width = CANVAS_W;
      canvas.height = CANVAS_H;
      const texture = new CanvasTexture(canvas);
      texture.colorSpace = SRGBColorSpace;
      texture.anisotropy = 2;
      const material = new SpriteMaterial({ map: texture, transparent: true, alphaTest: 0.05 });
      const sprite = new Sprite(material);
      const h = Config.memories.spriteHeight * 1.5;
      sprite.scale.set(h * (CANVAS_W / CANVAS_H), h, 1);
      sprite.position.set(p.x, y + 3.4, p.z);
      sprite.name = `memory:${p.key}`;
      sprite.renderOrder = 3;
      scene.add(sprite);
      return { ...p, index: i, memory, groundY: y, sprite, canvas, texture, phase: i * 1.7 };
    });

    // Halos (one Points draw call, per-vertex colours so each can pulse independently)
    const hp = [];
    this.markers.forEach((m) => hp.push(m.x, m.groundY + 3.4, m.z));
    const haloGeo = new BufferGeometry();
    haloGeo.setAttribute('position', new Float32BufferAttribute(hp, 3));
    haloGeo.setAttribute('color', new Float32BufferAttribute(new Float32Array(hp.length), 3));
    this.haloMaterial = new PointsMaterial({
      size: 9,
      map: softDotTexture(),
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      opacity: 0.45,
    });
    this.halos = new Points(haloGeo, this.haloMaterial);
    this.halos.renderOrder = 2;
    scene.add(this.halos);

    // Ground rings (one instanced draw call)
    const ringGeo = new RingGeometry(2.3, 2.55, 40).rotateX(-Math.PI / 2);
    this.rings = new InstancedMesh(
      ringGeo,
      new MeshBasicMaterial({ transparent: true, opacity: 0.5, depthWrite: false }),
      this.markers.length,
    );
    this.rings.instanceColor = new InstancedBufferAttribute(new Float32Array(this.markers.length * 3), 3);
    this.markers.forEach((m, i) => {
      dummy.position.set(m.x, m.groundY + 0.12, m.z);
      dummy.updateMatrix();
      this.rings.setMatrixAt(i, dummy.matrix);
    });
    this.rings.renderOrder = 1;
    scene.add(this.rings);

    this.markers.forEach((m) => this._bake(m));
  }

  /** Proximity items: markers expose stable x/z. */
  get items() {
    return this.markers;
  }

  /** Streams thumbnails in (optional assets — never blocks gameplay). */
  loadThumbnails() {
    const unique = [...new Set(this.markers.map((m) => m.memoryId))];
    return Promise.all(unique.map((id) => this._loadImage(id)));
  }

  _loadImage(id, attempt = 0) {
    const memory = this.byId.get(id);
    if (!memory.thumbnail) return Promise.resolve();
    return new Promise((resolve) => {
      this.loader.load(
        assetUrl(memory.thumbnail),
        (img) => {
          this.images.set(id, img);
          this.markers.filter((m) => m.memoryId === id).forEach((m) => this._bake(m));
          resolve();
        },
        undefined,
        () => {
          if (attempt < 1) {
            setTimeout(() => this._loadImage(id, attempt + 1).then(resolve), 1500);
          } else {
            if (import.meta.env?.DEV) console.warn(`[memories] thumbnail failed: ${memory.thumbnail}`);
            this.images.set(id, null);
            resolve();
          }
        },
      );
    });
  }

  /** Draws the polaroid card: photo (or placeholder) + caption once found. */
  _bake(m) {
    const g = m.canvas.getContext('2d');
    const found = this.isFound(m.memoryId);
    const img = this.images.get(m.memoryId);
    g.clearRect(0, 0, CANVAS_W, CANVAS_H);
    roundRect(g, 4, 4, CANVAS_W - 8, CANVAS_H - 8, 22);
    g.fillStyle = found ? '#fff4d6' : '#fffaf5';
    g.fill();
    g.lineWidth = 6;
    g.strokeStyle = found ? '#f2c45a' : 'rgba(255,255,255,0.9)';
    g.stroke();

    const px = (CANVAS_W - PHOTO_W) / 2;
    const py = 16;
    g.save();
    roundRect(g, px, py, PHOTO_W, PHOTO_H, 14);
    g.clip();
    if (img) {
      g.drawImage(img, px, py, PHOTO_W, PHOTO_H);
    } else {
      const grad = g.createLinearGradient(px, py, px + PHOTO_W, py + PHOTO_H);
      grad.addColorStop(0, '#f6c7d5');
      grad.addColorStop(1, '#c8c4ec');
      g.fillStyle = grad;
      g.fillRect(px, py, PHOTO_W, PHOTO_H);
      g.fillStyle = 'rgba(255,255,255,0.85)';
      g.font = '600 64px system-ui, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('✦', CANVAS_W / 2, py + PHOTO_H / 2);
    }
    g.restore();

    g.fillStyle = found ? '#8a6420' : '#8c88a8';
    g.font = '600 26px system-ui, -apple-system, "Segoe UI", sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const caption = found ? `★ ${m.memory.title}` : '✦ a memory awaits ✦';
    g.fillText(truncate(g, caption, CANVAS_W - 40), CANVAS_W / 2, py + PHOTO_H + 30);
    m.texture.needsUpdate = true;
  }

  refresh(memoryId) {
    this.markers.filter((m) => !memoryId || m.memoryId === memoryId).forEach((m) => this._bake(m));
    this._recolor();
  }

  applyPalette(p) {
    this.accent.copy(p.crystals[0]).lerp(p.flowers[0], 0.4);
    this._recolor();
  }

  _recolor() {
    const rc = this.rings.instanceColor.array;
    this.markers.forEach((m, i) => {
      tmp.copy(this.isFound(m.memoryId) ? GOLD : this.accent);
      rc[i * 3] = tmp.r;
      rc[i * 3 + 1] = tmp.g;
      rc[i * 3 + 2] = tmp.b;
    });
    this.rings.instanceColor.needsUpdate = true;
  }

  /** Gentle float + halo pulse. Undiscovered markers breathe; found ones rest in gold. */
  update(time, animate, night) {
    const colors = this.halos.geometry.attributes.color;
    const positions = this.halos.geometry.attributes.position;
    for (let i = 0; i < this.markers.length; i++) {
      const m = this.markers[i];
      const found = this.isFound(m.memoryId);
      const bob = animate ? Math.sin(time * 1.2 + m.phase) * 0.28 : 0;
      const y = m.groundY + 3.4 + bob;
      m.sprite.position.y = y;
      positions.array[i * 3 + 1] = y;
      const pulse = found ? 0.55 : 0.6 + (animate ? Math.sin(time * 2.2 + m.phase) * 0.35 : 0);
      tmp.copy(found ? GOLD : this.accent).multiplyScalar(pulse * (0.75 + night * 0.5));
      colors.array[i * 3] = tmp.r;
      colors.array[i * 3 + 1] = tmp.g;
      colors.array[i * 3 + 2] = tmp.b;
    }
    colors.needsUpdate = true;
    positions.needsUpdate = true;
  }

  dispose() {
    for (const m of this.markers) {
      m.texture.dispose();
      m.sprite.material.dispose();
      m.sprite.removeFromParent();
    }
    this.halos.geometry.dispose();
    this.haloMaterial.dispose();
    this.rings.geometry.dispose();
    this.rings.material.dispose();
    this.halos.removeFromParent();
    this.rings.removeFromParent();
  }
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

function truncate(g, text, maxW) {
  if (g.measureText(text).width <= maxW) return text;
  let t = text;
  while (t.length > 3 && g.measureText(`${t}…`).width > maxW) t = t.slice(0, -1);
  return `${t}…`;
}
