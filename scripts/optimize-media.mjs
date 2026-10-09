#!/usr/bin/env node
/**
 * Generates web-optimized memory media from the untouched originals.
 *
 *   media/originals/imageN.png  ->  public/assets/memories/memory-NN.webp        (viewer / poster, 1280px)
 *                                   public/assets/memories/memory-NN-thumb.webp  (world sprite + journal, 384px)
 *   media/originals/videoN.mp4  ->  public/assets/memories/memory-NN.mp4         (≤720p H.264, faststart)
 *
 * Originals are never modified. Requires `ffmpeg` on PATH. Run with:
 *   npm run media            (skips outputs that already exist)
 *   npm run media -- --force (regenerates everything)
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const srcDir = join(root, 'media', 'originals');
const outDir = join(root, 'public', 'assets', 'memories');
const force = process.argv.includes('--force');

mkdirSync(outDir, { recursive: true });

function ffmpeg(args) {
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: 'inherit' });
}

function job(output, args) {
  if (!force && existsSync(output)) return;
  ffmpeg(args);
  const kb = (statSync(output).size / 1024).toFixed(0);
  console.log(`  ${output.slice(root.length + 1)}  ${kb} KB`);
}

const indices = readdirSync(srcDir)
  .map((f) => /^image(\d+)\.png$/.exec(f)?.[1])
  .filter(Boolean)
  .map(Number)
  .sort((a, b) => a - b);

for (const n of indices) {
  const id = String(n).padStart(2, '0');
  const image = join(srcDir, `image${n}.png`);
  const video = join(srcDir, `video${n}.mp4`);

  job(join(outDir, `memory-${id}.webp`), [
    '-i',
    image,
    '-vf',
    'scale=1280:-2',
    '-c:v',
    'libwebp',
    '-quality',
    '80',
    join(outDir, `memory-${id}.webp`),
  ]);
  job(join(outDir, `memory-${id}-thumb.webp`), [
    '-i',
    image,
    '-vf',
    'scale=384:-2',
    '-c:v',
    'libwebp',
    '-quality',
    '78',
    join(outDir, `memory-${id}-thumb.webp`),
  ]);

  if (existsSync(video)) {
    job(join(outDir, `memory-${id}.mp4`), [
      '-i',
      video,
      '-vf',
      "scale='min(1280,iw)':-2",
      '-c:v',
      'libx264',
      '-preset',
      'slow',
      '-crf',
      '27',
      '-profile:v',
      'high',
      '-pix_fmt',
      'yuv420p',
      '-c:a',
      'aac',
      '-b:a',
      '96k',
      '-ac',
      '2',
      '-movflags',
      '+faststart',
      join(outDir, `memory-${id}.mp4`),
    ]);
  }
}
console.log('Media optimization complete.');
