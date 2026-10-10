import { describe, expect, it } from 'vitest';
import { buildResult } from '../src/game/results';
import type { PlayerSlot } from '../src/game/session';

const slots: PlayerSlot[] = [0, 1, 2].map((i) => ({ index: i, type: i ? 'cpu' : 'human', device: null, character: 'brick', cpuLevel: 1 }));
const sc = (stocks: number, kos: number, falls: number, eliminated: boolean) => ({ stocks, kos, falls, damageDealt: 0, eliminated });

describe('buildResult', () => {
  it('ranks stock matches by elimination order', () => {
    const r = buildResult(slots, [sc(1, 3, 2, false), sc(0, 1, 3, true), sc(0, 0, 3, true)], [50, 20, 40], [-1, 900, 600], { mode: 'stock' }, 0, 1200);
    expect(r.players.map((p) => p.placement)).toEqual([1, 2, 3]);
    expect(r.durationSec).toBe(20);
    expect(r.players[0].damageDealt).toBe(50);
  });
  it('ranks time matches by KOs minus falls', () => {
    const r = buildResult(slots, [sc(3, 2, 1, false), sc(3, 4, 0, false), sc(3, 0, 2, false)], [], [-1, -1, -1], { mode: 'time' }, 1, 600);
    expect(r.players.map((p) => p.placement)).toEqual([2, 1, 3]);
  });
});
