import { CanvasTexture, SRGBColorSpace } from 'three';

/**
 * Tiny shader patches on top of stock materials (no custom shader files):
 *  - glow: emissive = diffuse colour × uGlow (so per-instance colours glow at night)
 *  - wind: sway instanced foliage by height, driven by one shared time uniform
 *  - drift: wrap Points around the player so a small particle pool fills the world
 * All patches share uniform objects, so updating one value updates every material.
 */
export const sharedUniforms = {
  uTime: { value: 0 },
  uWind: { value: 1 },
  uCenter: { value: { x: 0, y: 0, z: 0, isVector3: true } },
};

export function patchMaterial(material, { glow = null, wind = false, drift = null } = {}) {
  const key = `puku:${glow ? 'g' : ''}${wind ? 'w' : ''}${drift ? `d${drift.half}` : ''}`;
  material.customProgramCacheKey = () => key;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = sharedUniforms.uTime;
    if (glow) {
      shader.uniforms.uGlow = glow;
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float uGlow;')
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * uGlow;');
    }
    if (wind) {
      shader.uniforms.uWind = sharedUniforms.uWind;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime;\nuniform float uWind;')
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          #ifdef USE_INSTANCING
            float sway = sin(uTime * 1.4 + instanceMatrix[3][0] * 0.21 + instanceMatrix[3][2] * 0.17);
            transformed.x += sway * position.y * 0.09 * uWind;
            transformed.z += cos(uTime * 1.1 + instanceMatrix[3][0] * 0.13) * position.y * 0.05 * uWind;
          #endif`,
        );
    }
    if (drift) {
      shader.uniforms.uCenter = sharedUniforms.uCenter;
      shader.uniforms.uWind = sharedUniforms.uWind;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime;\nuniform float uWind;\nuniform vec3 uCenter;')
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          float hw = ${drift.half.toFixed(1)};
          vec2 p = transformed.xz + vec2(uTime * ${drift.speed.toFixed(2)}, uTime * ${(drift.speed * 0.6).toFixed(2)}) * uWind;
          transformed.xz = mod(p - uCenter.xz + hw, hw * 2.0) - hw + uCenter.xz;
          transformed.y += uCenter.y + sin(uTime * 0.7 + position.x * 0.31) * ${drift.bob.toFixed(2)} * uWind;`,
        );
    }
  };
  return material;
}

let dotTexture = null;
/** Shared soft round sprite used by every particle/halo layer. */
export function softDotTexture() {
  if (dotTexture) return dotTexture;
  const size = 64;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.55)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  dotTexture = new CanvasTexture(c);
  dotTexture.colorSpace = SRGBColorSpace;
  return dotTexture;
}
