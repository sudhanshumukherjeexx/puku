import { readJSON, writeJSON, remove } from '../utils/storage.js';

const KEY = 'progress';

/**
 * Runtime discovery state, kept separate from the immutable manifest.
 * Counts unique memory ids, so echoes never inflate progress.
 */
export class Progress {
  constructor(manifest, { persist = false } = {}) {
    this.manifest = manifest;
    this.validIds = new Set(manifest.memories.map((m) => m.id));
    this.found = new Set();
    this.reachedMilestones = new Set();
    this.listeners = new Set();
    this.persist = persist;
    if (persist) this._load();
  }

  get total() {
    return this.validIds.size;
  }

  get count() {
    return this.found.size;
  }

  has(id) {
    return this.found.has(id);
  }

  /** Marks a memory found. Returns { isNew, milestones } where milestones are newly reached. */
  discover(id) {
    if (!this.validIds.has(id) || this.found.has(id)) return { isNew: false, milestones: [] };
    this.found.add(id);
    const milestones = this.manifest.milestones.filter((ms) => this.count >= ms.at && !this.reachedMilestones.has(ms.id));
    milestones.forEach((ms) => this.reachedMilestones.add(ms.id));
    this._save();
    this._emit({ id, milestones });
    return { isNew: true, milestones };
  }

  /** Discovered memories in manifest (story) order. */
  discoveredList() {
    return this.manifest.memories.filter((m) => this.found.has(m.id));
  }

  setPersist(enabled) {
    this.persist = enabled;
    if (enabled) this._save();
    else remove(KEY);
  }

  reset() {
    this.found.clear();
    this.reachedMilestones.clear();
    remove(KEY);
    this._emit({ reset: true });
  }

  onChange(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  _emit(detail) {
    for (const fn of this.listeners) fn(detail);
  }

  _save() {
    if (this.persist) writeJSON(KEY, { found: [...this.found], milestones: [...this.reachedMilestones] });
  }

  _load() {
    const data = readJSON(KEY);
    if (!data) return;
    (data.found ?? []).filter((id) => this.validIds.has(id)).forEach((id) => this.found.add(id));
    const known = new Set(this.manifest.milestones.map((m) => m.id));
    (data.milestones ?? []).filter((id) => known.has(id)).forEach((id) => this.reachedMilestones.add(id));
  }
}
