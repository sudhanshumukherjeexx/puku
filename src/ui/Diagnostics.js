/**
 * Development diagnostics overlay + repeatable benchmark. Loaded lazily via
 * dynamic import (its own chunk) only when `?debug` / `?bench` is in the URL
 * or the ` key is pressed in dev — ordinary visitors never download it.
 *
 * `?bench` drives a fixed scripted route for 20 s and reports average FPS,
 * p95 frame time and renderer stats, so before/after comparisons use the same
 * scenario (results are printed to the console and the overlay).
 */
export function createDiagnostics(game) {
  const box = document.createElement('pre');
  box.className = 'diagnostics';
  box.setAttribute('aria-hidden', 'true');
  document.body.append(box);
  let frames = 0;
  let acc = 0;
  let fps = 0;
  const frameTimes = [];

  const onFrame = (dt) => {
    frames++;
    acc += dt;
    frameTimes.push(dt * 1000);
    if (frameTimes.length > 600) frameTimes.shift();
    if (acc < 0.5) return;
    fps = frames / acc;
    frames = 0;
    acc = 0;
    const info = game.renderer.info;
    const sorted = [...frameTimes].sort((a, b) => a - b);
    const p95 = sorted[Math.floor(sorted.length * 0.95)] ?? 0;
    box.textContent = [
      `FPS        ${fps.toFixed(1)}`,
      `frame p95  ${p95.toFixed(1)} ms`,
      `render cpu ${game.loop.frameMs.toFixed(2)} ms`,
      `draw calls ${info.render.calls}`,
      `triangles  ${info.render.triangles.toLocaleString()}`,
      `geometries ${info.memory.geometries}`,
      `textures   ${info.memory.textures}`,
      `programs   ${info.programs?.length ?? '–'}`,
      `objects    ${game.world.scene.children.length}`,
      `preset     ${game.presetName}${game.settings.get('quality') === 'auto' ? ' (auto)' : ''}`,
      `pixelRatio ${game.renderer.getPixelRatio().toFixed(2)}`,
      `state      ${game.state.current}`,
    ].join('\n');
  };

  async function runBenchmark(seconds = 20) {
    const samples = [];
    const start = performance.now();
    game.startScripted((t) => ({ throttle: 1, steer: Math.sin(t * 0.35) * 0.6, brake: false }));
    await new Promise((resolve) => {
      const tick = (now) => {
        samples.push(now);
        if (now - start < seconds * 1000) requestAnimationFrame(tick);
        else resolve();
      };
      requestAnimationFrame(tick);
    });
    game.stopScripted();
    const deltas = samples.slice(1).map((t, i) => t - samples[i]);
    const sorted = [...deltas].sort((a, b) => a - b);
    const result = {
      preset: game.presetName,
      seconds,
      avgFps: +(1000 / (deltas.reduce((a, b) => a + b, 0) / deltas.length)).toFixed(1),
      p95FrameMs: +sorted[Math.floor(sorted.length * 0.95)].toFixed(1),
      drawCalls: game.renderer.info.render.calls,
      triangles: game.renderer.info.render.triangles,
      viewport: `${innerWidth}x${innerHeight}@${game.renderer.getPixelRatio()}`,
      userAgent: navigator.userAgent,
    };
    console.info('[PUKU bench]', JSON.stringify(result));
    window.__PUKU_BENCH__ = result;
    return result;
  }

  return {
    onFrame,
    runBenchmark,
    dispose: () => box.remove(),
  };
}
