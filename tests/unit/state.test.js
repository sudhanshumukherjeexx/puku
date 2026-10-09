import { describe, expect, it } from 'vitest';
import { GameState as S, StateMachine } from '../../src/core/GameState.js';

describe('game state machine', () => {
  it('walks the normal journey', () => {
    const sm = new StateMachine();
    const log = [];
    sm.onChange((next, prev) => log.push(`${prev}>${next}`));
    expect(sm.set(S.READY)).toBe(true);
    expect(sm.set(S.PLAYING)).toBe(true);
    expect(sm.simulating).toBe(true);
    expect(sm.set(S.VIEWING_MEMORY)).toBe(true);
    expect(sm.simulating).toBe(false);
    expect(sm.set(S.PLAYING)).toBe(true);
    expect(sm.set(S.PAUSED)).toBe(true);
    expect(sm.set(S.PLAYING)).toBe(true);
    expect(log).toEqual([
      'loading>ready',
      'ready>playing',
      'playing>viewing-memory',
      'viewing-memory>playing',
      'playing>paused',
      'paused>playing',
    ]);
  });

  it('rejects impossible transitions', () => {
    const sm = new StateMachine();
    expect(sm.set(S.PLAYING)).toBe(false); // can't drive while loading
    expect(sm.current).toBe(S.LOADING);
    sm.set(S.READY);
    expect(sm.set(S.VIEWING_MEMORY)).toBe(false);
    sm.set(S.PLAYING);
    sm.set(S.PHOTO);
    expect(sm.set(S.VIEWING_MEMORY)).toBe(false); // photo mode must exit first
  });

  it('only simulates while PLAYING', () => {
    const sm = new StateMachine();
    for (const s of [S.READY, S.PLAYING, S.PAUSED]) {
      sm.set(s);
      expect(sm.simulating).toBe(s === S.PLAYING);
    }
  });

  it('can recover from errors by reloading', () => {
    const sm = new StateMachine();
    sm.set(S.ERROR);
    expect(sm.set(S.LOADING)).toBe(true);
  });
});
