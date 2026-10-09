import {
  BackSide,
  BufferAttribute,
  BufferGeometry,
  Color,
  DirectionalLight,
  Fog,
  HemisphereLight,
  Mesh,
  Points,
  PointsMaterial,
  ShaderMaterial,
  SphereGeometry,
  Vector3,
} from 'three';
import { createRng } from '../utils/random.js';
import { softDotTexture } from './materials.js';

const SKY_RADIUS = 520;

/**
 * Sky dome (2-colour gradient shader, zero CPU per frame), stars, fog and the
 * two lights that light the whole world: one hemisphere + one directional
 * sun/moon. Light count never changes at runtime, so shaders never recompile.
 */
export class Environment {
  constructor(scene, seed) {
    this.scene = scene;
    this.skyTop = new Color();
    this.skyHorizon = new Color();
    this.fogColor = new Color();
    this.sunDir = new Vector3(0.4, 0.8, 0.2).normalize();

    this.skyMaterial = new ShaderMaterial({
      uniforms: {
        uTop: { value: this.skyTop },
        uHorizon: { value: this.skyHorizon },
        uSunDir: { value: this.sunDir },
        uSunGlow: { value: 0.4 },
      },
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uTop;
        uniform vec3 uHorizon;
        uniform vec3 uSunDir;
        uniform float uSunGlow;
        varying vec3 vDir;
        void main() {
          vec3 dir = normalize(vDir);
          float h = clamp(dir.y, 0.0, 1.0);
          vec3 col = mix(uHorizon, uTop, pow(h, 0.55));
          float sun = pow(max(dot(dir, uSunDir), 0.0), 24.0);
          col += uSunGlow * sun * vec3(1.0, 0.92, 0.8);
          gl_FragColor = vec4(col, 1.0);
          #include <colorspace_fragment>
        }`,
      side: BackSide,
      depthWrite: false,
      fog: false,
    });
    this.sky = new Mesh(new SphereGeometry(SKY_RADIUS, 24, 12), this.skyMaterial);
    this.sky.renderOrder = -10;
    this.sky.frustumCulled = false;
    this.sky.name = 'sky';
    scene.add(this.sky);

    // Stars: one draw call, faded in by night factor.
    const rng = createRng(seed).fork('stars');
    const n = 700;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const theta = rng.range(0, Math.PI * 2);
      const y = rng.range(0.08, 1);
      const r = Math.sqrt(1 - y * y);
      pos.set([Math.cos(theta) * r * 480, y * 480, Math.sin(theta) * r * 480], i * 3);
    }
    const starGeo = new BufferGeometry();
    starGeo.setAttribute('position', new BufferAttribute(pos, 3));
    this.starMaterial = new PointsMaterial({
      size: 2.2,
      sizeAttenuation: false,
      map: softDotTexture(),
      transparent: true,
      depthWrite: false,
      fog: false,
      opacity: 0,
    });
    this.stars = new Points(starGeo, this.starMaterial);
    this.stars.frustumCulled = false;
    this.stars.renderOrder = -9;
    scene.add(this.stars);

    this.hemi = new HemisphereLight(0xffffff, 0xffffff, 1.6);
    scene.add(this.hemi);

    this.sun = new DirectionalLight(0xffffff, 2.2);
    this.sun.shadow.camera.left = -48;
    this.sun.shadow.camera.right = 48;
    this.sun.shadow.camera.top = 48;
    this.sun.shadow.camera.bottom = -48;
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 220;
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.04;
    scene.add(this.sun, this.sun.target);

    scene.fog = new Fog(0xffffff, 40, 150);
    this.night = 0;
  }

  setQuality(preset) {
    this.sun.castShadow = preset.shadows;
    if (preset.shadows && this.sun.shadow.mapSize.x !== preset.shadowMapSize) {
      this.sun.shadow.mapSize.set(preset.shadowMapSize, preset.shadowMapSize);
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
    }
    this.scene.fog.far = preset.fogFar;
    this.scene.fog.near = preset.fogFar * 0.28;
  }

  /**
   * @param palette live theme palette
   * @param cycle   DayNightCycle
   * @param focus   world position the shadow camera and sky follow
   */
  update(palette, cycle, focus) {
    const night = Math.max(cycle.night, palette.nightFloor);
    const dusk = cycle.dusk * (1 - palette.nightFloor);
    this.night = night;
    const s = palette.sky;

    this.skyTop.copy(s.dayTop).lerp(s.duskTop, dusk).lerp(s.nightTop, night);
    this.skyHorizon.copy(s.dayHorizon).lerp(s.duskHorizon, dusk).lerp(s.nightHorizon, night);
    this.fogColor.copy(this.skyHorizon);
    this.scene.fog.color.copy(this.fogColor);

    const l = palette.light;
    this.hemi.color.copy(l.hemiSky).lerp(l.night, night * 0.7);
    this.hemi.groundColor.copy(l.hemiGround).lerp(l.night, night * 0.5);
    this.hemi.intensity = 1.7 - night * 0.7;

    // Sun travels across the sky; at night the same light becomes soft moonlight.
    const a = cycle.phase * Math.PI * 2;
    const elev = Math.max(0.25, Math.abs(Math.sin(a)));
    this.sunDir.set(Math.cos(a) * 0.8, elev, 0.35).normalize();
    this.sun.color.copy(l.sun).lerp(l.dusk, dusk).lerp(l.night, night);
    this.sun.intensity = 2.3 * (1 - night) + 0.45 * night;
    this.skyMaterial.uniforms.uSunGlow.value = 0.35 * (1 - night) + dusk * 0.4;

    this.starMaterial.opacity = Math.max(0, night - 0.15) * 1.1;
    this.stars.visible = this.starMaterial.opacity > 0.01;

    this.sky.position.copy(focus);
    this.stars.position.copy(focus);
    // Shadow camera follows the player; snap to texels to avoid shimmering.
    const snap = 96 / Math.max(this.sun.shadow.mapSize.x, 1);
    const fx = Math.round(focus.x / snap) * snap;
    const fz = Math.round(focus.z / snap) * snap;
    this.sun.target.position.set(fx, focus.y, fz);
    this.sun.position.set(fx + this.sunDir.x * 90, focus.y + this.sunDir.y * 90, fz + this.sunDir.z * 90);
  }
}
