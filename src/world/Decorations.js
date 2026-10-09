import {
  BufferAttribute,
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DodecahedronGeometry,
  DoubleSide,
  Float32BufferAttribute,
  InstancedBufferAttribute,
  InstancedMesh,
  MeshLambertMaterial,
  Object3D,
  Points,
  PointsMaterial,
  ShapeGeometry,
  Shape,
  SphereGeometry,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Config } from '../core/Config.js';
import { patchMaterial, softDotTexture } from './materials.js';

const dummy = new Object3D();
const tmpColor = new Color();

/**
 * All repeated scenery as InstancedMesh layers (one draw call per layer).
 * Instances are sorted so that `mesh.count = max * density` keeps an even
 * spread — graphics presets change density instantly, without rebuilding.
 * Every layer remembers each instance's palette slot + brightness so a theme
 * switch only rewrites instance colours.
 */
export class Decorations {
  constructor(scene, field, rng, avoid) {
    this.scene = scene;
    this.field = field;
    this.rng = rng;
    this.avoid = avoid; // [{x, z, r}] — memories, path samples, spawn
    this.layers = [];
    this.glow = { value: 0.1 }; // shared night glow uniform for flowers/crystals/lanterns
    this.crystalGlow = { value: 0.3 };

    this._grass();
    this._flowers();
    this._mushrooms();
    this._crystals();
    this._stones();
    this._butterflies();
    this._motes();
  }

  // ---------- placement helpers ----------

  _spot(minR = 6, maxR = Config.world.radius * 0.97, clearance = 2.5) {
    for (let attempt = 0; attempt < 30; attempt++) {
      const a = this.rng.range(0, Math.PI * 2);
      const r = Math.sqrt(this.rng.range((minR / maxR) ** 2, 1)) * maxR;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      if (this.avoid.every((o) => (o.x - x) ** 2 + (o.z - z) ** 2 > (o.r + clearance) ** 2)) return { x, z };
    }
    return null;
  }

  /**
   * Creates an InstancedMesh layer.
   * @param place (i) => {x, z, y?, scale, rotY, tilt?} | null
   */
  _layer(name, geometry, material, max, place, { paletteKey, shadow = false, brightness = [0.85, 1.12] } = {}) {
    const mesh = new InstancedMesh(geometry, material, max);
    mesh.name = name;
    const slots = new Uint8Array(max);
    const bright = new Float32Array(max);
    let n = 0;
    for (let i = 0; i < max; i++) {
      const p = place(i);
      if (!p) continue;
      const y = p.y ?? this.field.heightAt(p.x, p.z);
      dummy.position.set(p.x, y, p.z);
      dummy.rotation.set(p.tilt ?? 0, p.rotY ?? 0, p.tiltZ ?? 0);
      dummy.scale.setScalar(p.scale ?? 1);
      if (p.scaleY) dummy.scale.y *= p.scaleY;
      dummy.updateMatrix();
      mesh.setMatrixAt(n, dummy.matrix);
      slots[n] = p.slot ?? 0;
      bright[n] = this.rng.range(brightness[0], brightness[1]);
      n++;
    }
    // Shuffle-by-construction: random placement order already gives an even spread for any prefix.
    mesh.instanceColor = new InstancedBufferAttribute(new Float32Array(max * 3), 3);
    mesh.count = n;
    mesh.castShadow = shadow;
    mesh.receiveShadow = false;
    mesh.computeBoundingSphere();
    const layer = { mesh, max: n, slots, bright, paletteKey, wantsShadow: shadow };
    this.layers.push(layer);
    this.scene.add(mesh);
    return layer;
  }

  // ---------- layers ----------

  _grass() {
    const blades = [];
    for (let i = 0; i < 3; i++) {
      const b = new ConeGeometry(0.11, 0.95, 3, 1, true);
      b.translate(0, 0.47, 0);
      b.rotateZ((i - 1) * 0.35);
      b.rotateY((i * Math.PI * 2) / 3);
      blades.push(b);
    }
    const geo = mergeGeometries(blades);
    const mat = patchMaterial(new MeshLambertMaterial({ side: DoubleSide }), { wind: true });
    this._layer(
      'grass',
      geo,
      mat,
      2200,
      () => {
        const s = this._spot(4, Config.world.radius * 0.99, 1.4);
        return s && { ...s, scale: this.rng.range(0.7, 1.5), rotY: this.rng.range(0, 6.28) };
      },
      { paletteKey: 'grass', brightness: [0.75, 1.15] },
    );
  }

  _flowers() {
    // Stems
    const stemGeo = new CylinderGeometry(0.045, 0.06, 1, 5, 1, true);
    stemGeo.translate(0, 0.5, 0);
    // Heads: ring of petals + centre, coloured via vertex colours × instance colour.
    const parts = [];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const petal = new SphereGeometry(0.2, 5, 3);
      petal.scale(1, 0.35, 0.6);
      petal.translate(0.2, 0, 0);
      petal.rotateY(a);
      paint(petal, 1, 1, 1);
      parts.push(petal);
    }
    const center = new SphereGeometry(0.12, 5, 3);
    center.translate(0, 0.05, 0);
    paint(center, 1.25, 1.05, 0.55);
    parts.push(center);
    const headGeo = mergeGeometries(parts);
    headGeo.translate(0, 1, 0);

    const placements = [];
    const max = 520;
    for (let i = 0; i < max; i++) {
      // Flowers cluster in little bunches, especially along the path.
      const s = this._spot(5, Config.world.radius * 0.95, 1.6);
      if (s)
        placements.push({
          ...s,
          scaleY: this.rng.range(0.8, 1.9),
          scale: this.rng.range(0.85, 1.3),
          slot: this.rng.int(0, 3),
          rotY: this.rng.range(0, 6.28),
        });
    }
    const stemMat = patchMaterial(new MeshLambertMaterial(), { wind: true });
    const stems = this._layer('flower-stems', stemGeo, stemMat, placements.length, (i) => placements[i], {
      paletteKey: 'stem',
      brightness: [0.6, 0.8],
    });
    const headMat = patchMaterial(new MeshLambertMaterial({ vertexColors: true }), { wind: true, glow: this.glow });
    const heads = this._layer(
      'flower-heads',
      headGeo,
      headMat,
      placements.length,
      (i) => ({ ...placements[i], scaleY: placements[i].scaleY }),
      {
        paletteKey: 'flowers',
        shadow: true,
      },
    );
    // Heads must keep the same slot as their stem index.
    heads.slots.set(placements.map((p) => p.slot));
    stems.linked = heads;
  }

  _mushrooms() {
    const stemGeo = new CylinderGeometry(0.17, 0.22, 0.7, 7);
    stemGeo.translate(0, 0.35, 0);
    const capGeo = new SphereGeometry(0.6, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2);
    capGeo.scale(1, 0.75, 1);
    capGeo.translate(0, 0.62, 0);
    // Spots: whiten a deterministic subset of cap vertices.
    const cols = new Float32Array(capGeo.attributes.position.count * 3).fill(1);
    for (let i = 0; i < capGeo.attributes.position.count; i++) {
      const y = capGeo.attributes.position.getY(i);
      if (y > 0.8 && (i * 7) % 5 === 0) cols.set([3, 3, 3], i * 3);
    }
    capGeo.setAttribute('color', new BufferAttribute(cols, 3));

    const placements = [];
    for (let i = 0; i < 90; i++) {
      const s = this._spot(10, Config.world.radius * 0.95, 2);
      if (s) placements.push({ ...s, scale: this.rng.range(0.7, 1.6), slot: this.rng.int(0, 2), rotY: this.rng.range(0, 6.28) });
    }
    const stems = this._layer('mushroom-stems', stemGeo, new MeshLambertMaterial(), placements.length, (i) => placements[i], {
      paletteKey: 'cream',
      shadow: true,
      brightness: [0.95, 1.05],
    });
    const caps = this._layer(
      'mushroom-caps',
      capGeo,
      patchMaterial(new MeshLambertMaterial({ vertexColors: true }), { glow: this.glow }),
      placements.length,
      (i) => placements[i],
      {
        paletteKey: 'mushrooms',
        shadow: true,
      },
    );
    caps.slots.set(placements.map((p) => p.slot));
    stems.linked = caps;
  }

  _crystals() {
    const spikes = [];
    const local = this.rng.fork('crystal-shape');
    for (let j = 0; j < 5; j++) {
      const h = local.range(1.1, 2.6);
      const c = new ConeGeometry(local.range(0.22, 0.42), h, 5);
      c.translate(0, h / 2 - 0.15, 0);
      c.rotateX(local.range(-0.35, 0.35));
      c.rotateZ(local.range(-0.35, 0.35));
      const a = (j / 5) * Math.PI * 2;
      c.translate(Math.cos(a) * 0.45 * (j ? 1 : 0), 0, Math.sin(a) * 0.45 * (j ? 1 : 0));
      spikes.push(c);
    }
    const geo = mergeGeometries(spikes);
    geo.computeVertexNormals();
    const mat = patchMaterial(new MeshLambertMaterial({ flatShading: true, transparent: true, opacity: 0.88 }), { glow: this.crystalGlow });
    this._layer(
      'crystals',
      geo,
      mat,
      46,
      () => {
        const s = this._spot(20, Config.world.radius * 0.95, 3);
        return s && { ...s, scale: this.rng.range(0.6, 1.4), rotY: this.rng.range(0, 6.28), slot: this.rng.int(0, 2) };
      },
      { paletteKey: 'crystals', shadow: true },
    );
  }

  _stones() {
    const geo = new DodecahedronGeometry(0.55, 0);
    geo.scale(1, 0.55, 0.85);
    const mat = new MeshLambertMaterial({ flatShading: true });
    this._layer(
      'stones',
      geo,
      mat,
      140,
      () => {
        const s = this._spot(6, Config.world.radius * 0.98, 1.5);
        return s && { ...s, y: undefined, scale: this.rng.range(0.5, 1.8), rotY: this.rng.range(0, 6.28), tilt: this.rng.range(-0.2, 0.2) };
      },
      { paletteKey: 'stone', shadow: true, brightness: [0.8, 1.1] },
    );
  }

  _butterflies() {
    const wing = new Shape();
    wing.moveTo(0, 0);
    wing.quadraticCurveTo(0.4, 0.45, 0.75, 0.05);
    wing.quadraticCurveTo(0.45, -0.35, 0, 0);
    const geo = new ShapeGeometry(wing, 4);
    geo.rotateX(-Math.PI / 2);
    const mat = patchMaterial(new MeshLambertMaterial({ side: DoubleSide }), { glow: this.glow });
    const count = 24;
    this.butterflies = [];
    for (let i = 0; i < count; i++) {
      const s = this._spot(10, Config.world.radius * 0.9, 0) ?? { x: 0, z: 0 };
      this.butterflies.push({
        x: s.x,
        z: s.z,
        cx: s.x,
        cz: s.z,
        y: this.rng.range(1.8, 4),
        speed: this.rng.range(0.25, 0.5),
        radius: this.rng.range(3, 9),
        phase: this.rng.range(0, 6.28),
        flap: this.rng.range(9, 14),
        slot: this.rng.int(0, 3),
      });
    }
    // Two wings per butterfly.
    const layer = this._layer('butterflies', geo, mat, count * 2, (i) => ({ x: 0, z: 0, y: 0, slot: this.butterflies[i >> 1].slot }), {
      paletteKey: 'flowers',
      brightness: [1, 1.15],
    });
    layer.mesh.frustumCulled = false;
    this.butterflyLayer = layer;
  }

  _motes() {
    const n = 450;
    const half = 60;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) pos.set([this.rng.range(-half, half), this.rng.range(0.8, 9), this.rng.range(-half, half)], i * 3);
    const geo = new BufferGeometry();
    geo.setAttribute('position', new Float32BufferAttribute(pos, 3));
    this.moteMaterial = patchMaterial(
      new PointsMaterial({ size: 0.45, map: softDotTexture(), transparent: true, depthWrite: false, opacity: 0.75 }),
      { drift: { half, speed: 0.35, bob: 0.8 } },
    );
    this.motes = new Points(geo, this.moteMaterial);
    this.motes.frustumCulled = false;
    this.motes.name = 'motes';
    this.motes.renderOrder = 2;
    this.motesMax = n;
    this.scene.add(this.motes);
  }

  // ---------- runtime ----------

  setQuality(preset) {
    for (const layer of this.layers) {
      if (layer.mesh.name === 'butterflies') continue;
      layer.mesh.count = Math.max(1, Math.floor(layer.max * preset.density));
      layer.mesh.castShadow = preset.shadows && preset.shadowMapSize >= 2048 ? layer.wantsShadow : false;
    }
    this.motes.geometry.setDrawRange(0, Math.min(this.motesMax, preset.particles));
  }

  applyPalette(p) {
    const cream = tmpCream;
    const stem = tmpStem.copy(p.grass).multiplyScalar(0.8);
    for (const layer of this.layers) {
      const arr = layer.mesh.instanceColor.array;
      for (let i = 0; i < layer.max; i++) {
        let c;
        switch (layer.paletteKey) {
          case 'flowers':
            c = p.flowers[layer.slots[i] % p.flowers.length];
            break;
          case 'mushrooms':
            c = p.mushrooms[layer.slots[i] % p.mushrooms.length];
            break;
          case 'crystals':
            c = p.crystals[layer.slots[i] % p.crystals.length];
            break;
          case 'grass':
            c = p.grass;
            break;
          case 'stone':
            c = p.stone;
            break;
          case 'stem':
            c = stem;
            break;
          default:
            c = cream;
        }
        tmpColor.copy(c).multiplyScalar(layer.bright[i]);
        arr[i * 3] = tmpColor.r;
        arr[i * 3 + 1] = tmpColor.g;
        arr[i * 3 + 2] = tmpColor.b;
      }
      layer.mesh.instanceColor.needsUpdate = true;
    }
    this.moteMaterial.color.copy(p.particles);
  }

  /** Night makes the meadow glow softly; crystals glow more in their own theme. */
  setGlow(night, themeGlow) {
    this.glow.value = 0.04 + night * 0.55 * themeGlow;
    this.crystalGlow.value = 0.25 + themeGlow * 0.3 + night * 0.6;
    this.moteMaterial.opacity = 0.45 + night * 0.45;
  }

  /** Butterflies: only 48 matrices, updated at most once per frame. */
  update(time, animate) {
    if (!animate) return;
    const mesh = this.butterflyLayer.mesh;
    for (let i = 0; i < this.butterflies.length; i++) {
      const b = this.butterflies[i];
      const t = time * b.speed + b.phase;
      const x = b.cx + Math.cos(t) * b.radius;
      const z = b.cz + Math.sin(t * 1.3) * b.radius * 0.7;
      const y = this.field.heightAt(x, z) + b.y + Math.sin(time * 1.7 + b.phase) * 0.4;
      const heading = Math.atan2(-Math.sin(t) * b.radius, Math.cos(t * 1.3) * b.radius * 0.91);
      const flap = Math.sin(time * b.flap + b.phase) * 0.9;
      for (let w = 0; w < 2; w++) {
        dummy.position.set(x, y, z);
        dummy.rotation.set(0, heading, 0);
        dummy.rotateZ(w === 0 ? flap : Math.PI - flap);
        dummy.scale.setScalar(0.9);
        dummy.updateMatrix();
        mesh.setMatrixAt(i * 2 + w, dummy.matrix);
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
  }
}

const tmpCream = new Color(0xfff4e0);
const tmpStem = new Color();

function paint(geo, r, g, b) {
  const n = geo.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) arr.set([r, g, b], i * 3);
  geo.setAttribute('color', new BufferAttribute(arr, 3));
}
