# Performance notes

All numbers below were **measured**, not estimated, on 2026-10-09 with the scripts in this repo. They describe one machine. Re-run them on your own hardware before drawing conclusions.

## Test machine and method

- Windows 11 laptop, **Intel Iris Xe** integrated GPU (Direct3D 11 via ANGLE), Chromium 156 (Playwright)
- Viewport 1280×720, device pixel ratio 1
- **Scenario:** fixed seed 2025; begin the journey; drive full throttle with a slow sinusoidal steer for 12 s (`?bench`). The original app was measured holding `W` for 12 s.
- **Software rendering** (`--use-angle=swiftshader`) runs WebGL on the CPU. It is used here as a pessimistic stand-in for a weak device, so treat the absolute numbers as a stress test, not a phone prediction.

Reproduce:

```bash
npm run build && npm run preview      # terminal 1
npm run bench                         # terminal 2 — hardware GPU, all presets
npm run bench -- --software           # CPU rendering stress test
```

## Results

### Hardware GPU (Intel Iris Xe)

| Build               | Avg FPS | p95 frame | Draw calls | Triangles | Lights |
| ------------------- | ------- | --------- | ---------- | --------- | ------ |
| Original (`momomo`) | 59.5    | 16.7 ms   | 240        | 57,856    | 35     |
| PUKU — Low          | 59.2    | 16.8 ms   | 31         | 81,066    | 2      |
| PUKU — Medium       | 59.5    | 16.8 ms   | 34         | 131,488   | 3      |
| PUKU — High         | 59.6    | 16.7 ms   | 39         | 269,704   | 3      |

Both builds reach the 60 Hz display cap on this GPU, so FPS doesn't separate them here. The draw-call and light counts show where the cost moved.

### Software rendering (CPU stress test)

| Build               | Avg FPS | p95 frame | Draw calls |
| ------------------- | ------- | --------- | ---------- |
| Original (`momomo`) | 0.9     | 1500 ms   | 939 *      |
| PUKU — Low          | 12.0    | 167 ms    | 31         |
| PUKU — Medium       | 8.2     | 267 ms    | 35         |
| PUKU — High         | 7.2     | 317 ms    | 40         |

\* The original's draw-call count varies frame to frame (240–939 observed). It renders shadow passes for 35 lights and up to 30 picture sprites.

Under CPU rendering, PUKU's Low preset ran about 13× faster than the original in the same harness. The absolute number is still low because SwiftShader is far slower than any real mobile GPU.

### Startup

|                                        | Original                                                       | PUKU                                                                             |
| -------------------------------------- | -------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Code dependencies                      | Three.js from a CDN + inline script                            | 180 KB gzip JS (Three.js 146 KB + app 34 KB), self-hosted, content-hashed        |
| Media before play                      | 18 full-size PNGs requested at once (~3 MB each, ~50 MB total) | none required; 18 thumbnails (~260 KB total) stream in behind the welcome screen |
| Video                                  | loaded when opened (iframe)                                    | loaded when opened, released on close; ≤ 720p, 0.3–2.3 MB each                   |
| Time to welcome screen (local preview) | —                                                              | ~1.3 s                                                                           |

## What changed, and why it helps

- **Instancing:** grass, flowers, mushrooms, crystals, stones, butterflies and lantern posts are `InstancedMesh` layers, one draw call each. The original created a separate mesh and material for every flower, petal and spot.
- **Lights:** 35 dynamic lights (crystal, rim, brake, lantern and random point lights) became 1 hemisphere light + 1 sun/moon + an optional headlight. Night glow comes from an emissive shader patch, and the light count never changes at runtime, so shaders never recompile mid-drive.
- **No per-frame scene traversal:** the original walked the whole scene graph every frame to toggle lights. Now materials hold shared uniforms, and colours are only rewritten during a theme transition.
- **Terrain:** one seeded height field shared by the mesh, the car and the camera. Ground variety moved into vertex colours (1 draw call) instead of ~90 overlapping transparent patch meshes, and `logarithmicDepthBuffer` was removed.
- **Car:** merged geometry (≈12 draw calls instead of ≈70), no `MeshPhysicalMaterial` transmission (which costs an extra render pass), and no point lights inside the wheels.
- **Idle GPU:** rendering stops while any dialog covers the world and while the tab is hidden. The last frame stays on screen, which helps video playback on weak devices.
- **Hot paths:** no allocations in the fixed-step physics or the render loop. Proximity uses squared distances at 10 Hz, the HUD updates at 15 Hz only when values change, and the mini-map redraws at 8 Hz only when something moved.
- **Media:** the originals are preserved in `media/originals/` (LFS) and the site serves WebP/H.264 derivatives. The total deployable media went from about 170 MB to about 20 MB.
