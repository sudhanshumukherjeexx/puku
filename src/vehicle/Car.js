import {
  AdditiveBlending,
  BackSide,
  BoxGeometry,
  BufferGeometry,
  Color,
  CylinderGeometry,
  Float32BufferAttribute,
  Group,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  Points,
  PointsMaterial,
  Quaternion,
  SphereGeometry,
  SpotLight,
  TorusGeometry,
  Vector3,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { softDotTexture } from '../world/materials.js';
import { clamp, dampFactor } from '../utils/math.js';

const WHEEL_RADIUS = 0.5;
const tmpN = new Vector3();
const tmpF = new Vector3();
const tmpR = new Vector3();
const basis = new Matrix4();
const tiltQ = new Quaternion();
const tiltAxis = new Vector3();

/**
 * The original fantasy car (rounded body, cabin, glass, glowing headlights,
 * star-spoke rims, glow shell and sparkle trail), rebuilt with merged
 * geometry: ~12 draw calls instead of ~70 and no per-part point lights.
 * Glow now comes from emissive materials; one optional headlight spot.
 */
export class Car {
  constructor() {
    this.root = new Group();
    this.root.name = 'car';
    this.body = new Group(); // tilts for lean/pitch inside the terrain-aligned root
    this.root.add(this.body);

    this.bodyMaterial = new MeshStandardMaterial({ metalness: 0.45, roughness: 0.28, emissiveIntensity: 0.12 });
    const shell = mergeGeometries(
      [
        new RoundedBoxGeometry(2.03, 0.55, 4.14, 2, 0.2).translate(0, 0.6, 0),
        new RoundedBoxGeometry(1.43, 0.64, 1.75, 2, 0.24).translate(0, 1.2, -0.2),
        new BoxGeometry(1.9, 0.12, 1.1).translate(0, 0.86, 1.55),
        new BoxGeometry(1.8, 0.1, 0.7).translate(0, 0.86, -1.75),
      ].map(nonIndexed),
    );
    const bodyMesh = new Mesh(shell, this.bodyMaterial);
    bodyMesh.castShadow = true;
    this.body.add(bodyMesh);

    const glass = mergeGeometries([
      new PlaneGeometry(1.32, 0.62).rotateX(-Math.PI / 5).translate(0, 1.22, 0.7),
      new PlaneGeometry(1.32, 0.56).rotateX(Math.PI + Math.PI / 5).translate(0, 1.22, -1.1),
      new PlaneGeometry(1.5, 0.48).rotateY(Math.PI / 2).translate(0.73, 1.24, -0.2),
      new PlaneGeometry(1.5, 0.48).rotateY(-Math.PI / 2).translate(-0.73, 1.24, -0.2),
    ]);
    this.body.add(new Mesh(glass, new MeshLambertMaterial({ color: 0xaad8ff, emissive: 0x2a4a6a, transparent: true, opacity: 0.8 })));

    this.headlightMaterial = new MeshBasicMaterial({ color: 0xffffff });
    const heads = mergeGeometries([-0.7, 0.7].map((x) => new SphereGeometry(0.22, 10, 8).translate(x, 0.62, 2.05)));
    this.body.add(new Mesh(heads, this.headlightMaterial));

    this.tailMaterial = new MeshBasicMaterial({ color: 0xff7eb6 });
    const tails = mergeGeometries([-0.7, 0.7].map((x) => new SphereGeometry(0.16, 8, 6).translate(x, 0.62, -2.05)));
    this.body.add(new Mesh(tails, this.tailMaterial));

    // Wheels: tyre + merged star-spoke rim per wheel.
    this.rimMaterial = new MeshStandardMaterial({ metalness: 0.7, roughness: 0.2, emissiveIntensity: 0.35 });
    const tyreGeo = new CylinderGeometry(WHEEL_RADIUS, WHEEL_RADIUS, 0.4, 16).rotateZ(Math.PI / 2);
    const rimParts = [new TorusGeometry(0.3, 0.05, 6, 16).rotateY(Math.PI / 2)];
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      rimParts.push(new BoxGeometry(0.08, 0.6, 0.08).rotateX(a));
    }
    rimParts.push(new SphereGeometry(0.15, 8, 6).translate(0.21, 0, 0));
    const rimGeo = mergeGeometries(rimParts.map(nonIndexed));
    const tyreMat = new MeshLambertMaterial({ color: 0x2a2730 });
    this.wheels = [];
    for (const x of [-1.05, 1.05]) {
      for (const z of [-1.45, 1.45]) {
        const steerPivot = new Group();
        steerPivot.position.set(x, WHEEL_RADIUS, z);
        const spin = new Group();
        spin.add(new Mesh(tyreGeo, tyreMat));
        const rim = new Mesh(rimGeo, this.rimMaterial);
        rim.scale.x = x > 0 ? 1 : -1;
        spin.add(rim);
        steerPivot.add(spin);
        this.root.add(steerPivot);
        this.wheels.push({ pivot: steerPivot, spin, front: z > 0 });
      }
    }
    this.wheels[0].pivot.children[0].children[0].castShadow = true;

    // Glow shell + sparkle trail (kept from the original look).
    this.glowMaterial = new MeshBasicMaterial({
      transparent: true,
      opacity: 0.05,
      side: BackSide,
      depthWrite: false,
      blending: AdditiveBlending,
    });
    const glow = new Mesh(new SphereGeometry(3, 16, 10), this.glowMaterial);
    glow.scale.set(0.9, 0.55, 1.2);
    glow.position.y = 0.8;
    this.body.add(glow);

    const n = 40;
    const tp = [];
    for (let i = 0; i < n; i++) tp.push((Math.random() - 0.5) * 1.8, Math.random() * 0.6 + 0.2, -2.3 - Math.random() * 3);
    const trailGeo = new BufferGeometry();
    trailGeo.setAttribute('position', new Float32BufferAttribute(tp, 3));
    this.trailMaterial = new PointsMaterial({
      size: 0.24,
      map: softDotTexture(),
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: AdditiveBlending,
    });
    this.trail = new Points(trailGeo, this.trailMaterial);
    this.root.add(this.trail);

    // One headlight spot (only meaningful at night; intensity driven by night factor).
    this.headlight = new SpotLight(0xffffff, 0, 34, Math.PI / 5, 0.6, 1.2);
    this.headlight.position.set(0, 0.9, 2);
    this.headlight.target.position.set(0, 0, 14);
    this.root.add(this.headlight, this.headlight.target);

    this.lean = 0;
    this.pitch = 0;
    this.wheelSpin = 0;
  }

  setQuality(preset) {
    // Toggling a light changes the shader light count; only done on preset change.
    this.headlight.visible = preset.headlight;
  }

  applyPalette(p) {
    this.bodyMaterial.color.copy(p.car.body);
    this.bodyMaterial.emissive.copy(p.car.body);
    this.rimMaterial.color.copy(p.car.accent);
    this.rimMaterial.emissive.copy(p.car.accent);
    this.headlightMaterial.color.copy(p.car.accent).lerp(WHITE, 0.6);
    this.tailMaterial.color.copy(p.car.tail);
    this.glowMaterial.color.copy(p.car.body);
    this.trailMaterial.color.copy(p.particles);
    this.headlight.color.copy(p.car.accent).lerp(WHITE, 0.5);
  }

  setNight(night) {
    this.headlight.intensity = night * 60;
    this.glowMaterial.opacity = 0.03 + night * 0.07;
  }

  /**
   * Places the car from interpolated physics state, aligned to the terrain.
   * Cosmetic lean/pitch are smoothed with frame-rate independent damping.
   */
  sync(state, field, dt, { throttle = 0, maxSpeed = 26, animate = true } = {}) {
    const y = field.heightAt(state.x, state.z);
    this.root.position.set(state.x, y, state.z);

    field.normalAt(state.x, state.z, tmpN);
    tmpF.set(Math.sin(state.heading), 0, Math.cos(state.heading));
    tmpF.addScaledVector(tmpN, -tmpF.dot(tmpN)).normalize();
    tmpR.crossVectors(tmpN, tmpF).normalize();
    basis.makeBasis(tmpR, tmpN, tmpF);
    this.root.quaternion.setFromRotationMatrix(basis);

    const speedK = clamp(Math.abs(state.speed) / maxSpeed, 0, 1);
    const k = dampFactor(8, dt);
    const targetLean = animate ? -state.steer * 0.08 * speedK : 0;
    const targetPitch = animate ? -throttle * 0.035 : 0;
    this.lean += (targetLean - this.lean) * k;
    this.pitch += (targetPitch - this.pitch) * k;
    tiltAxis.set(0, 0, 1);
    this.body.quaternion.setFromAxisAngle(tiltAxis, this.lean);
    tiltAxis.set(1, 0, 0);
    tiltQ.setFromAxisAngle(tiltAxis, this.pitch);
    this.body.quaternion.multiply(tiltQ);

    this.wheelSpin += (state.speed * dt) / WHEEL_RADIUS;
    for (const w of this.wheels) {
      w.spin.rotation.x = this.wheelSpin;
      w.pivot.rotation.y = w.front ? state.steer * 0.42 : 0;
    }
    this.trailMaterial.opacity = speedK * 0.5;
  }
}

const WHITE = new Color(0xffffff);

/** mergeGeometries needs all-indexed or all-non-indexed inputs. */
const nonIndexed = (g) => (g.index ? g.toNonIndexed() : g);
