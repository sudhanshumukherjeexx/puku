import {
  AdditiveBlending,
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Float32BufferAttribute,
  Group,
  IcosahedronGeometry,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  Object3D,
  Points,
  PointsMaterial,
  SphereGeometry,
} from 'three';
import { Config } from '../core/Config.js';
import { createRng } from '../utils/random.js';
import { patchMaterial, softDotTexture } from './materials.js';

const dummy = new Object3D();
const WHITE = new Color(0xffffff);

/**
 * Path lanterns, the boundary veil, and the three milestone effects
 * (fireflies, wishing tree, starfall). Milestone pieces are built up front
 * but hidden, so revealing them never causes a hitch.
 */
export class Effects {
  constructor(scene, field, path, seed) {
    this.scene = scene;
    this.field = field;
    const rng = createRng(seed).fork('effects');
    this.lanternGlow = { value: 0.1 };

    // --- Lanterns along the path (2 instanced draw calls + 1 points glow) ---
    const spacing = 17;
    const count = Math.max(2, Math.floor(path.length / spacing));
    const postGeo = new CylinderGeometry(0.06, 0.08, 1.6, 5);
    postGeo.translate(0, 0.8, 0);
    const bulbGeo = new SphereGeometry(0.22, 8, 6);
    bulbGeo.translate(0, 1.75, 0);
    this.posts = new InstancedMesh(postGeo, new MeshLambertMaterial({ color: 0x8a6f5a }), count);
    this.bulbMaterial = patchMaterial(new MeshLambertMaterial({ color: 0xfff1c9 }), { glow: this.lanternGlow });
    this.bulbs = new InstancedMesh(bulbGeo, this.bulbMaterial, count);
    const glowPos = [];
    for (let i = 0; i < count; i++) {
      const u = (i + 0.5) / count;
      const p = path.curve.getPointAt(u);
      const t = path.curve.getTangentAt(u);
      const side = i % 2 ? 1 : -1;
      const x = p.x - t.z * side * 2.8;
      const z = p.z + t.x * side * 2.8;
      const y = field.heightAt(x, z);
      dummy.position.set(x, y, z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      this.posts.setMatrixAt(i, dummy.matrix);
      this.bulbs.setMatrixAt(i, dummy.matrix);
      glowPos.push(x, y + 1.75, z);
    }
    this.posts.castShadow = true;
    const glowGeo = new BufferGeometry();
    glowGeo.setAttribute('position', new Float32BufferAttribute(glowPos, 3));
    this.lanternHalo = new PointsMaterial({
      size: 2.4,
      map: softDotTexture(),
      color: 0xffe2a8,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      opacity: 0,
    });
    this.lanternGlowPoints = new Points(glowGeo, this.lanternHalo);
    scene.add(this.posts, this.bulbs, this.lanternGlowPoints);

    // --- Boundary veil: the original glowing barrier, now a low shimmering band at the rim ---
    const domeGeo = new CylinderGeometry(Config.world.radius, Config.world.radius, 7, 72, 3, true);
    this.domeMaterial = new MeshBasicMaterial({ wireframe: true, transparent: true, opacity: 0.22, depthWrite: false });
    this.dome = new Mesh(domeGeo, this.domeMaterial);
    this.dome.position.y = 2.5;
    this.dome.matrixAutoUpdate = false;
    this.dome.updateMatrix();
    scene.add(this.dome);

    // --- Milestone: fireflies (wrapped points near the player) ---
    const ffCount = 160;
    const ffPos = new Float32Array(ffCount * 3);
    for (let i = 0; i < ffCount; i++) ffPos.set([rng.range(-35, 35), rng.range(0.6, 4), rng.range(-35, 35)], i * 3);
    const ffGeo = new BufferGeometry();
    ffGeo.setAttribute('position', new Float32BufferAttribute(ffPos, 3));
    this.fireflyMaterial = patchMaterial(
      new PointsMaterial({
        size: 0.55,
        map: softDotTexture(),
        color: 0xfff2a1,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        opacity: 0.9,
      }),
      { drift: { half: 35, speed: 0.2, bob: 1.2 } },
    );
    this.fireflies = new Points(ffGeo, this.fireflyMaterial);
    this.fireflies.frustumCulled = false;
    this.fireflies.visible = false;
    scene.add(this.fireflies);

    // --- Milestone: wishing tree at the heart of the meadow ---
    this.tree = new Group();
    this.tree.name = 'wishing-tree';
    const trunk = new Mesh(new ConeGeometry(0.9, 9, 7), new MeshLambertMaterial({ color: 0x9b7a68, flatShading: true }));
    trunk.position.y = 4.5;
    trunk.castShadow = true;
    this.tree.add(trunk);
    this.foliageMaterial = patchMaterial(new MeshLambertMaterial({ color: 0xffb7d5, flatShading: true }), { glow: this.lanternGlow });
    const blobs = [
      [0, 9.5, 0, 4.2],
      [2.8, 8, 1, 2.8],
      [-2.6, 8.3, -0.8, 3],
      [0.6, 11.8, -0.6, 2.6],
    ];
    for (const [x, y, z, r] of blobs) {
      const blob = new Mesh(new IcosahedronGeometry(r, 0), this.foliageMaterial);
      blob.position.set(x, y, z);
      blob.castShadow = true;
      this.tree.add(blob);
    }
    const blossomPos = [];
    for (let i = 0; i < 70; i++) {
      const a = rng.range(0, Math.PI * 2);
      const r = rng.range(1.5, 5);
      blossomPos.push(Math.cos(a) * r, rng.range(6.5, 13), Math.sin(a) * r);
    }
    const blossomGeo = new BufferGeometry();
    blossomGeo.setAttribute('position', new Float32BufferAttribute(blossomPos, 3));
    this.blossoms = new Points(
      blossomGeo,
      new PointsMaterial({
        size: 0.9,
        map: softDotTexture(),
        color: 0xfff0b3,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
      }),
    );
    this.tree.add(this.blossoms);
    // A soft beam so the tree can be found from anywhere.
    this.beam = new Mesh(
      new CylinderGeometry(1.2, 2.2, 90, 12, 1, true),
      new MeshBasicMaterial({
        color: 0xfff0d0,
        transparent: true,
        opacity: 0.12,
        depthWrite: false,
        blending: AdditiveBlending,
        fog: false,
      }),
    );
    this.beam.position.y = 45;
    this.tree.add(this.beam);
    this.tree.position.set(0, field.heightAt(0, 0), 0);
    this.tree.scale.setScalar(0.001);
    this.tree.visible = false;
    this.treeGrowth = 0;
    this.treeTarget = 0;
    scene.add(this.tree);

    // --- Milestone: starfall (instanced streaks) ---
    this.starfallCount = 14;
    const streakGeo = new CylinderGeometry(0.0, 0.35, 16, 4, 1, true);
    streakGeo.rotateX(Math.PI / 2);
    this.streaks = new InstancedMesh(
      streakGeo,
      new MeshBasicMaterial({
        color: 0xfff6dc,
        transparent: true,
        opacity: 0.85,
        blending: AdditiveBlending,
        depthWrite: false,
        fog: false,
      }),
      this.starfallCount,
    );
    this.streaks.frustumCulled = false;
    this.streaks.visible = false;
    this.streakData = Array.from({ length: this.starfallCount }, () => ({
      a: rng.range(0, Math.PI * 2),
      r: rng.range(60, 220),
      speed: rng.range(0.12, 0.3),
      offset: rng.range(0, 1),
    }));
    scene.add(this.streaks);
  }

  applyPalette(p) {
    this.domeMaterial.color.copy(p.flowers[0]);
    this.foliageMaterial.color.copy(p.flowers[0]).lerp(WHITE, 0.25);
  }

  setNight(night) {
    this.lanternGlow.value = 0.08 + night * 0.9;
    this.lanternHalo.opacity = night * 0.85;
    this.lanternGlowPoints.visible = night > 0.02;
    this.fireflyMaterial.opacity = 0.35 + night * 0.65;
  }

  setMilestone(effect, { instant = false } = {}) {
    if (effect === 'fireflies') this.fireflies.visible = true;
    if (effect === 'landmark') {
      this.tree.visible = true;
      this.treeTarget = 1;
      if (instant) this.treeGrowth = 1;
    }
    if (effect === 'finale') this.streaks.visible = true;
  }

  resetMilestones() {
    this.fireflies.visible = false;
    this.tree.visible = false;
    this.treeGrowth = this.treeTarget = 0;
    this.tree.scale.setScalar(0.001);
    this.streaks.visible = false;
  }

  update(dt, time, focus, animate) {
    if (this.tree.visible && this.treeGrowth < this.treeTarget) {
      this.treeGrowth = Math.min(1, this.treeGrowth + dt / 3.5);
      const k = 1 - (1 - this.treeGrowth) ** 3;
      this.tree.scale.setScalar(Math.max(0.001, k));
    }
    if (this.tree.visible && animate) this.blossoms.rotation.y = time * 0.05;

    if (this.streaks.visible) {
      for (let i = 0; i < this.starfallCount; i++) {
        const s = this.streakData[i];
        const u = (time * s.speed + s.offset) % 1;
        const a = s.a + u * 0.6;
        dummy.position.set(focus.x + Math.cos(a) * s.r, 140 - u * 110, focus.z + Math.sin(a) * s.r);
        dummy.lookAt(focus.x + Math.cos(a + 0.2) * s.r, 0, focus.z + Math.sin(a + 0.2) * s.r);
        dummy.scale.setScalar(u < 0.85 ? 1 : (1 - u) / 0.15);
        dummy.updateMatrix();
        this.streaks.setMatrixAt(i, dummy.matrix);
      }
      this.streaks.instanceMatrix.needsUpdate = true;
    }
  }
}
