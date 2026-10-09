import { BufferAttribute, BufferGeometry, CatmullRomCurve3, Mesh, MeshLambertMaterial, PlaneGeometry, Vector3 } from 'three';
import { Config } from '../core/Config.js';
import { smoothstep } from '../utils/math.js';

/**
 * Terrain mesh built once from the shared height field. Ground variety comes
 * from per-vertex colour blends (replacing ~90 overlapping patch meshes from
 * the original with a single draw call); a theme switch only rewrites colours.
 */
export class Terrain {
  constructor(field, segments, seedRng) {
    this.field = field;
    const extent = Config.world.terrainExtent;
    const geo = new PlaneGeometry(extent * 2, extent * 2, segments, segments);
    geo.rotateX(-Math.PI / 2);

    const pos = geo.attributes.position;
    const count = pos.count;
    this.patch = new Float32Array(count);
    this.rim = new Float32Array(count);
    this.shade = new Float32Array(count);

    // Low-frequency patch pattern (seeded phases) for soft meadow/clover areas.
    const ph = [seedRng.range(0, 6.28), seedRng.range(0, 6.28), seedRng.range(0, 6.28)];
    const radius = Config.world.radius;
    for (let i = 0; i < count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const h = field.heightAt(x, z);
      pos.setY(i, h);
      const n = Math.sin(x * 0.045 + ph[0]) * Math.cos(z * 0.05 + ph[1]) + 0.5 * Math.sin((x + z) * 0.11 + ph[2]);
      this.patch[i] = smoothstep(0.2, 0.9, n);
      const d = Math.hypot(x, z);
      this.rim[i] = smoothstep(radius * 0.96, radius * 1.12, d);
      this.shade[i] = 0.9 + Math.min(Math.max(h, -1), 4) * 0.035;
    }
    geo.computeVertexNormals();
    geo.setAttribute('color', new BufferAttribute(new Float32Array(count * 3), 3));

    this.material = new MeshLambertMaterial({ vertexColors: true });
    this.mesh = new Mesh(geo, this.material);
    this.mesh.receiveShadow = true;
    this.mesh.name = 'terrain';
    this.mesh.matrixAutoUpdate = false;
  }

  /** Rewrites vertex colours from the live palette (only on theme transitions). */
  applyPalette(p) {
    const col = this.mesh.geometry.attributes.color;
    const arr = col.array;
    const { base, detail, rim } = p.ground;
    for (let i = 0, j = 0; i < this.patch.length; i++, j += 3) {
      const t = this.patch[i];
      const r = this.rim[i];
      const s = this.shade[i];
      let cr = base.r + (detail.r - base.r) * t;
      let cg = base.g + (detail.g - base.g) * t;
      let cb = base.b + (detail.b - base.b) * t;
      cr += (rim.r - cr) * r;
      cg += (rim.g - cg) * r;
      cb += (rim.b - cb) * r;
      arr[j] = cr * s;
      arr[j + 1] = cg * s;
      arr[j + 2] = cb * s;
    }
    col.needsUpdate = true;
  }
}

/**
 * A soft, single-mesh winding path that threads through the memories in story
 * order. Edges fade out via vertex alpha so it blends into any ground colour.
 */
export function createPath(field, waypoints) {
  const pts = [new Vector3(0, 0, -14), ...waypoints.map((w) => new Vector3(w.x, 0, w.z))];
  const curve = new CatmullRomCurve3(pts, false, 'centripetal');
  const length = curve.getLength();
  const samples = Math.max(16, Math.ceil(length / 1.6));
  const halfW = 1.7;
  const fade = 1.3;
  const offsets = [-(halfW + fade), -halfW, halfW, halfW + fade];
  const alphas = [0, 1, 1, 0];

  const positions = new Float32Array((samples + 1) * 4 * 3);
  const colors = new Float32Array((samples + 1) * 4 * 4);
  const indices = [];
  const p = new Vector3();
  const t = new Vector3();
  for (let i = 0; i <= samples; i++) {
    const u = i / samples;
    curve.getPointAt(u, p);
    curve.getTangentAt(u, t);
    const nx = -t.z;
    const nz = t.x;
    const len = Math.hypot(nx, nz) || 1;
    for (let k = 0; k < 4; k++) {
      const x = p.x + (nx / len) * offsets[k];
      const z = p.z + (nz / len) * offsets[k];
      const v = i * 4 + k;
      positions.set([x, field.heightAt(x, z) + 0.06, z], v * 3);
      colors.set([1, 1, 1, alphas[k]], v * 4);
    }
    if (i < samples) {
      const a = i * 4;
      const b = a + 4;
      for (let k = 0; k < 3; k++) indices.push(a + k, b + k, a + k + 1, a + k + 1, b + k, b + k + 1);
    }
  }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new BufferAttribute(positions, 3));
  geo.setAttribute('color', new BufferAttribute(colors, 4));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  const material = new MeshLambertMaterial({
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const mesh = new Mesh(geo, material);
  mesh.receiveShadow = true;
  mesh.renderOrder = 1;
  mesh.matrixAutoUpdate = false;
  mesh.name = 'path';
  return { mesh, material, curve, length, applyPalette: (pal) => material.color.copy(pal.ground.path) };
}
