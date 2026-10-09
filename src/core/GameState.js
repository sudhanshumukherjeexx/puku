export const GameState = Object.freeze({
  LOADING: 'loading',
  READY: 'ready',
  PLAYING: 'playing',
  PAUSED: 'paused',
  VIEWING_MEMORY: 'viewing-memory',
  PHOTO: 'photo',
  ERROR: 'error',
});

const S = GameState;

/** Allowed transitions. Anything else is rejected, so conflicting flags can't arise. */
const TRANSITIONS = Object.freeze({
  [S.LOADING]: [S.READY, S.ERROR],
  [S.READY]: [S.PLAYING, S.PAUSED, S.ERROR],
  [S.PLAYING]: [S.PAUSED, S.VIEWING_MEMORY, S.PHOTO, S.READY, S.ERROR],
  [S.PAUSED]: [S.PLAYING, S.READY, S.VIEWING_MEMORY, S.ERROR],
  [S.VIEWING_MEMORY]: [S.PLAYING, S.PAUSED, S.ERROR],
  [S.PHOTO]: [S.PLAYING, S.ERROR],
  [S.ERROR]: [S.LOADING],
});

export class StateMachine {
  constructor(initial = S.LOADING) {
    this.current = initial;
    this.previous = null;
    this.listeners = new Set();
  }

  can(next) {
    return TRANSITIONS[this.current]?.includes(next) ?? false;
  }

  /** Returns true if the transition happened. */
  set(next, detail) {
    if (next === this.current) return false;
    if (!this.can(next)) {
      if (import.meta.env?.DEV) console.warn(`[state] rejected ${this.current} → ${next}`);
      return false;
    }
    this.previous = this.current;
    this.current = next;
    for (const fn of this.listeners) fn(next, this.previous, detail);
    return true;
  }

  is(...states) {
    return states.includes(this.current);
  }

  /** True only while the car should simulate and accept driving input. */
  get simulating() {
    return this.current === S.PLAYING;
  }

  onChange(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
}
