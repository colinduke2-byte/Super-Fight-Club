import { describe, expect, it } from 'vitest';
import { Lobby } from '../src/game/lobby';

describe('Lobby', () => {
  it('devices join the first free slot, once each', () => {
    const l = new Lobby(3, 4);
    expect(l.join('kb1')).toBe(0);
    expect(l.join('pad0')).toBe(1);
    expect(l.join('kb1')).toBe(-1);
    expect(l.slotOf('pad0')).toBe(1);
    expect(l.humans()).toBe(2);
  });

  it('confirm joins first, then locks; back unlocks, then leaves', () => {
    const l = new Lobby(2, 4);
    expect(l.confirm('kb1')).toBe(true);
    expect(l.slots[0].locked).toBe(false);
    expect(l.confirm('kb1')).toBe(true);
    expect(l.slots[0].locked).toBe(true);
    expect(l.confirm('kb1')).toBe(false);
    expect(l.back('kb1')).toBe('unlocked');
    expect(l.back('kb1')).toBe('left');
    expect(l.slotOf('kb1')).toBe(-1);
    expect(l.back('kb1')).toBe('none');
  });

  it('cursor wraps around the roster and is frozen while locked', () => {
    const l = new Lobby(2, 4);
    l.join('kb1');
    l.move('kb1', -1);
    expect(l.slots[0].character).toBe(3);
    l.move('kb1', 1);
    l.move('kb1', 1);
    expect(l.slots[0].character).toBe(1);
    l.confirm('kb1');
    l.move('kb1', 1);
    expect(l.slots[0].character).toBe(1);
  });

  it('CPU slots cycle empty -> L1 -> L2 -> L3 -> empty and skip humans', () => {
    const l = new Lobby(3, 4);
    l.join('kb1');
    const seq: string[] = [];
    for (let i = 0; i < 5; i++) {
      l.cycleCpu();
      const s = l.slots[1];
      seq.push(s.kind === 'cpu' ? `cpu${s.cpuLevel}` : s.kind);
    }
    expect(seq).toEqual(['cpu1', 'cpu2', 'cpu3', 'empty', 'cpu1']);
    expect(l.slots[0].kind).toBe('human');
  });

  it('is ready only with at least one human and all humans locked', () => {
    const l = new Lobby(2, 4);
    expect(l.ready).toBe(false);
    l.join('kb1');
    expect(l.ready).toBe(false);
    l.confirm('kb1');
    expect(l.ready).toBe(true);
    l.join('pad0');
    expect(l.ready).toBe(false);
    l.confirm('pad0');
    expect(l.ready).toBe(true);
  });

  it('fills empty slots with CPUs and warns about missing controllers', () => {
    const l = new Lobby(4, 4);
    l.join('kb1');
    expect(l.warning(0)).toMatch(/CONTROLLERS/);
    expect(l.warning(2)).toMatch(/CPU WILL FILL/);
    expect(l.fillWithCpu()).toBe(3);
    expect(l.active.map((s) => s.kind)).toEqual(['human', 'cpu', 'cpu', 'cpu']);
    expect(l.warning(2)).toBeNull();
  });

  it('a human can take over a CPU slot when the lobby is otherwise full', () => {
    const l = new Lobby(2, 4);
    l.join('kb1');
    l.cycleCpu();
    expect(l.slots[1].kind).toBe('cpu');
    expect(l.join('pad0')).toBe(1);
    expect(l.slots[1].kind).toBe('human');
  });

  it('single-player lobbies (arcade / training) have one slot', () => {
    const l = new Lobby(1, 4);
    expect(l.join('kb1')).toBe(0);
    expect(l.join('kb2')).toBe(-1);
    expect(l.warning(0)).toBeNull();
  });
});
