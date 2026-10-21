import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { exportSave, readSave } from '../src/game/save';
import { fighterMatchups, HISTORY_MAX, invalidateRecordsCache, matchHistory, parseRecords, recordHistory, recordMatchStats, resetRecordSection, stageWinRates } from '../src/game/records';
import { MatchTimeline } from '../src/game/results';
import { MemoryVault, setVaultBackend, vaultAddCode, vaultList } from '../src/game/replayVault';
import { replayMeta, ReplayRecorder, toShareCode } from '../src/game/replay';
import { DEFAULT_RULES } from '../src/game/session';

function memoryStorage(): Storage {
  const m = new Map<string, string>();
  return {
    get length() {
      return m.size;
    },
    clear: () => m.clear(),
    getItem: (k: string) => m.get(k) ?? null,
    key: (i: number) => [...m.keys()][i] ?? null,
    removeItem: (k: string) => void m.delete(k),
    setItem: (k: string, v: string) => void m.set(k, String(v)),
  };
}

const entry = (i: number) => ({ date: 1000 + i, mode: 'versus', stage: 'classic', fighters: [{ character: 'brick', type: 'human' as const, placement: 1 }, { character: 'vex', type: 'cpu' as const, placement: 2 }], result: 'P1 WINS', sec: 60 + i });

describe('match history and per-stage / per-fighter stats', () => {
  beforeEach(() => {
    (globalThis as { localStorage?: Storage }).localStorage = memoryStorage();
    invalidateRecordsCache();
  });
  afterEach(() => {
    delete (globalThis as { localStorage?: Storage }).localStorage;
    invalidateRecordsCache();
  });

  it('keeps the last HISTORY_MAX matches, newest first, and survives a reload', () => {
    for (let i = 0; i < HISTORY_MAX + 5; i++) recordHistory(entry(i));
    let h = matchHistory();
    expect(h).toHaveLength(HISTORY_MAX);
    expect(h[0].date).toBe(1000 + HISTORY_MAX + 4);
    invalidateRecordsCache();
    h = matchHistory();
    expect(h).toHaveLength(HISTORY_MAX);
    expect(h[0].result).toBe('P1 WINS');
    resetRecordSection('history');
    expect(matchHistory()).toEqual([]);
  });

  it('drops junk history entries', () => {
    const r = parseRecords(JSON.stringify({ history: [{ mode: 'versus', stage: 'classic', fighters: [] }, { mode: '__proto__', stage: 'x', fighters: [{ character: 'a' }] }, 5, entry(1), { ...entry(2), result: '<script>' }] }));
    expect(r.history).toHaveLength(2);
    expect(r.history[1].result).toBe('');
  });

  it('per-stage win rates and one fighter\'s matchups come from the lifetime stats', () => {
    const res = (winner: number) => ({ winner, winnerTeam: -1, durationSec: 30, players: [{ index: 0, character: 'brick', type: 'human' as const, kos: 1, falls: 0, damageDealt: 50, placement: winner === 0 ? 1 : 2, team: -1 }, { index: 1, character: 'vex', type: 'cpu' as const, kos: 0, falls: 1, damageDealt: 20, placement: winner === 1 ? 1 : 2, team: -1 }] });
    recordMatchStats(res(0), 'classic');
    recordMatchStats(res(0), 'classic');
    recordMatchStats(res(1), 'classic');
    recordMatchStats(res(1), 'storm');
    expect(stageWinRates()).toEqual([
      { stage: 'classic', played: 3, wins: 2 },
      { stage: 'storm', played: 1, wins: 0 },
    ]);
    expect(fighterMatchups('brick')).toEqual([{ opponent: 'vex', w: 2, l: 2 }]);
    expect(fighterMatchups('nova')).toEqual([]);
  });

  it('the save export carries vault favourites (and history)', async () => {
    setVaultBackend(new MemoryVault());
    recordHistory(entry(1));
    const rec = new ReplayRecorder('classic', { ...DEFAULT_RULES }, [{ character: 'brick' }, { character: 'vex' }], true);
    rec.record([
      { stickX: 1, stickY: 0, held: 1, pressed: 1, released: 0 },
      { stickX: 0, stickY: 0, held: 0, pressed: 0, released: 0 },
    ]);
    const r = rec.finish();
    const meta = replayMeta(r, { winner: 0, winnerTeam: -1 });
    await vaultAddCode(await toShareCode(r, meta), meta, { starred: true, name: 'keeper' });
    await vaultList();
    const text = exportSave();
    const read = readSave(text);
    expect(read.ok).toBe(true);
    if (read.ok) {
      expect(read.extras?.vault).toHaveLength(1);
      expect(read.extras?.vault?.[0].name).toBe('keeper');
      expect(read.records.history).toHaveLength(1);
      expect(read.summary).toContain('1 favourite replays');
    }
    setVaultBackend(null);
  });
});

describe('match timeline (results graphs)', () => {
  it('samples damage and stocks and logs KOs', () => {
    const tl = new MatchTimeline(2);
    const fs = [
      { id: 0, damage: 0, state: 'idle' },
      { id: 1, damage: 0, state: 'idle' },
    ];
    const sc = [{ stocks: 2 }, { stocks: 2 }];
    tl.start(fs, sc);
    for (let t = 1; t <= 120; t++) {
      fs[1].damage = t < 90 ? t : t - 90;
      if (t === 90) {
        tl.onEvent('ko', fs[1], 0, t);
        sc[1].stocks = 1;
      }
      tl.step(fs, sc, t);
    }
    const d = tl.data();
    expect(d.ticks).toBe(120);
    expect(d.damage[1]).toHaveLength(1 + 120 / d.every);
    expect(Math.max(...d.damage[1])).toBe(75);
    expect(d.stocks[1][d.stocks[1].length - 1]).toBe(1);
    expect(d.kos).toEqual([{ t: 90, victim: 1, by: 0 }]);
  });

  it('halves its sampling on a very long match', () => {
    const tl = new MatchTimeline(1);
    const f = [{ id: 0, damage: 5, state: 'idle' }];
    tl.start(f, [{ stocks: 1 }]);
    for (let t = 1; t <= 60 * 60 * 10; t++) tl.step(f, [{ stocks: 1 }], t);
    expect(tl.every).toBeGreaterThan(15);
    expect(tl.damage[0].length).toBeLessThanOrEqual(1201);
  });
});
