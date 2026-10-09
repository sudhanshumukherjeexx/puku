/**
 * Resolves a manifest/media path against Vite's configured base so the same
 * paths work at a domain root, under /puku/ on GitHub Pages and in previews.
 * Manifest paths are always relative (e.g. "assets/memories/memory-01.webp").
 */
const BASE = import.meta.env?.BASE_URL ?? './';

export function assetUrl(path) {
  if (!path) return '';
  if (/^(https?:|data:|blob:)/.test(path)) return path;
  return BASE + path.replace(/^\.?\//, '');
}
