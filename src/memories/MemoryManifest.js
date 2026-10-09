import { THEME_IDS } from '../world/themes.js';

const MEDIA_FIELDS = ['image', 'thumbnail', 'video', 'poster', 'captions'];
const EFFECTS = ['fireflies', 'landmark', 'finale', 'none'];

/**
 * Validates a world manifest and returns an immutable, normalized copy.
 * Throws a single Error listing every problem so authors can fix them at once.
 */
export function validateManifest(raw) {
  const errors = [];
  const err = (msg) => errors.push(msg);

  if (!raw || typeof raw !== 'object') throw new Error('Manifest must be an object.');
  if (!Array.isArray(raw.memories) || raw.memories.length === 0) err('"memories" must be a non-empty array.');
  if (raw.defaultTheme && !THEME_IDS.includes(raw.defaultTheme)) {
    err(`"defaultTheme" must be one of: ${THEME_IDS.join(', ')} (got "${raw.defaultTheme}").`);
  }
  const echoes = raw.placement?.echoes ?? 0;
  if (!Number.isInteger(echoes) || echoes < 0) err('"placement.echoes" must be a non-negative integer.');

  const ids = new Set();
  (raw.memories ?? []).forEach((m, i) => {
    const where = `memories[${i}]${m?.id ? ` ("${m.id}")` : ''}`;
    if (!m || typeof m !== 'object') return err(`${where} must be an object.`);
    if (typeof m.id !== 'string' || !/^[a-z0-9][a-z0-9-]*$/.test(m.id)) {
      err(`${where}.id is required and may only contain lowercase letters, digits and dashes.`);
    } else if (ids.has(m.id)) {
      err(`${where}.id "${m.id}" is duplicated — every memory needs a unique id.`);
    } else ids.add(m.id);
    if (typeof m.title !== 'string' || !m.title.trim()) err(`${where}.title is required.`);
    if (!m.image && !m.video) err(`${where} needs at least an "image" or a "video".`);
    for (const f of MEDIA_FIELDS) {
      if (m[f] === undefined) continue;
      if (typeof m[f] !== 'string' || !m[f]) err(`${where}.${f} must be a non-empty string.`);
      else if (m[f].startsWith('/'))
        err(`${where}.${f} must be relative (e.g. "assets/memories/x.webp"), not "${m[f]}", so it works under /puku/ on GitHub Pages.`);
    }
    if (m.position !== undefined) {
      const ok = Array.isArray(m.position) && m.position.length === 2 && m.position.every(Number.isFinite);
      if (!ok) err(`${where}.position must be [x, z] numbers.`);
    }
  });

  (raw.milestones ?? []).forEach((ms, i) => {
    const where = `milestones[${i}]`;
    if (typeof ms.id !== 'string') err(`${where}.id is required.`);
    if (!(ms.at === 'all' || (Number.isInteger(ms.at) && ms.at > 0))) err(`${where}.at must be a positive integer or "all".`);
    if (Number.isInteger(ms.at) && ms.at > (raw.memories?.length ?? 0)) err(`${where}.at (${ms.at}) exceeds the number of memories.`);
    if (ms.effect && !EFFECTS.includes(ms.effect)) err(`${where}.effect must be one of: ${EFFECTS.join(', ')}.`);
  });

  if (errors.length) {
    throw new Error(`World manifest is invalid:\n  • ${errors.join('\n  • ')}`);
  }

  const memories = raw.memories.map((m, index) =>
    Object.freeze({
      id: m.id,
      index,
      chapter: m.chapter ?? '',
      title: m.title.trim(),
      description: m.description ?? '',
      alt: m.alt ?? m.title,
      image: m.image ?? null,
      thumbnail: m.thumbnail ?? m.image ?? null,
      video: m.video ?? null,
      poster: m.poster ?? m.image ?? null,
      captions: m.captions ?? null,
      position: m.position ? Object.freeze([...m.position]) : null,
    }),
  );
  const total = memories.length;
  const milestones = (raw.milestones ?? [])
    .map((ms) => Object.freeze({ ...ms, at: ms.at === 'all' ? total : ms.at, effect: ms.effect ?? 'none' }))
    .sort((a, b) => a.at - b.at);

  return Object.freeze({
    title: raw.title ?? 'Starfall Meadow',
    tagline: raw.tagline ?? '',
    intro: raw.intro ?? '',
    seed: raw.seed ?? 1,
    defaultTheme: raw.defaultTheme ?? THEME_IDS[0],
    placement: Object.freeze({ mode: raw.placement?.mode ?? 'spiral', echoes }),
    memories: Object.freeze(memories),
    milestones: Object.freeze(milestones),
  });
}
