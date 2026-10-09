#!/usr/bin/env node
/**
 * Validates src/content/world.json and checks that every referenced media
 * file exists in public/. Run after adding or editing memories:
 *   npm run validate:memories
 */
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { validateManifest } from '../src/memories/MemoryManifest.js';

const root = resolve(import.meta.dirname, '..');
const raw = JSON.parse(readFileSync(join(root, 'src', 'content', 'world.json'), 'utf8'));

let manifest;
try {
  manifest = validateManifest(raw);
} catch (e) {
  console.error(`✖ ${e.message}`);
  process.exit(1);
}

const missing = [];
for (const m of manifest.memories) {
  for (const field of ['image', 'thumbnail', 'video', 'poster', 'captions']) {
    const path = m[field];
    if (path && !existsSync(join(root, 'public', path))) missing.push(`${m.id}.${field} → public/${path}`);
  }
}

if (missing.length) {
  console.error(`✖ ${missing.length} media file(s) not found:\n  • ${missing.join('\n  • ')}`);
  process.exit(1);
}
console.log(`✔ ${manifest.memories.length} memories valid, all media present, ${manifest.milestones.length} milestones.`);
