#!/usr/bin/env node
/**
 * Repeatable performance scenario. Serves nothing itself — start the
 * production preview first (`npm run build && npm run preview`), then:
 *
 *   npm run bench                 # all presets, hardware GPU if available
 *   npm run bench -- --software   # force SwiftShader (CPU rendering ≈ a weak device)
 *   npm run bench -- --seconds=30 --url=http://localhost:4173/
 *
 * Each run loads the app with a fixed seed, begins the journey and drives a
 * scripted route (`?bench`), then prints avg FPS, p95 frame time, draw calls
 * and triangles. Numbers depend on the machine — record the device with them.
 */
import { chromium } from '@playwright/test';

const arg = (name, fallback) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1] ?? fallback;
const software = process.argv.includes('--software');
const seconds = Number(arg('seconds', 15));
const url = arg('url', 'http://localhost:4173/');
const presets = arg('presets', 'low,medium,high').split(',');

const args = software ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : ['--enable-gpu', '--ignore-gpu-blocklist'];
const browser = await chromium.launch({ args });
const results = [];

for (const preset of presets) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.addInitScript((q) => localStorage.setItem('puku:settings', JSON.stringify({ quality: q })), preset);
  await page.goto(`${url}?seed=2025&bench=${seconds}`);
  await page.waitForFunction(() => window.__PUKU_BENCH__, null, { timeout: (seconds + 60) * 1000 });
  const r = await page.evaluate(() => window.__PUKU_BENCH__);
  const gpu = await page.evaluate(() => {
    const gl = document.createElement('canvas').getContext('webgl2');
    const ext = gl?.getExtension('WEBGL_debug_renderer_info');
    return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unknown';
  });
  results.push({
    preset,
    avgFps: r.avgFps,
    p95FrameMs: r.p95FrameMs,
    drawCalls: r.drawCalls,
    triangles: r.triangles,
    viewport: r.viewport,
    gpu,
  });
  await page.close();
}
await browser.close();
console.table(results);
console.log(JSON.stringify(results, null, 2));
