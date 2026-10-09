/**
 * Defensive localStorage wrapper. Storage can be unavailable (private mode,
 * blocked cookies, quota) — every call degrades to "not persisted".
 * Only small preference/progress JSON is ever stored, never media.
 */
const PREFIX = 'puku:';

function store() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function readJSON(key, fallback = null) {
  try {
    const raw = store()?.getItem(PREFIX + key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

export function writeJSON(key, value) {
  try {
    store()?.setItem(PREFIX + key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function remove(key) {
  try {
    store()?.removeItem(PREFIX + key);
  } catch {
    /* ignore */
  }
}

export function clearAll() {
  const s = store();
  if (!s) return;
  try {
    Object.keys(s)
      .filter((k) => k.startsWith(PREFIX))
      .forEach((k) => s.removeItem(k));
  } catch {
    /* ignore */
  }
}
