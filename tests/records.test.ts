import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  RECORDS_VERSION,
  bestLaunch,
  bestTargetTime,
  clearedChallenges,
  fighterRecords,
  invalidateRecordsCache,
  parseRecords,
  recordChallenge,
  recordLaunch,
  recordMatch,
  recordTargetTime,
  resetRecords,
} from '../src/game/records';

const KEY = 'sfc-records-v1';

function memoryStorage(): Storage & { reads: number } {
  const m = new Map<string, string>();
  const s = {
    reads: 0,
    get length() {
      return m.size;
    },
    clear: () => m.clear(),
    getItem: (k: string) => {
      s.reads++;
      return m.get(k) ?? null;
    },
    key: (i: number) => [...m.keys()][i] ?? null,
    removeItem: (k: string) => void m.delete(k),
    setItem: (k: string, v: string) => void m.set(k, String(v)),
  };
  return s;
}

let store: ReturnType<typeof memoryStorage>;

describe('records', () => {
  beforeEach(() => {
    store = memoryStorage();
    (globalThis as { localStorage?: Storage }).localStorage = store;
    invalidateRecordsCache();
  });
  afterEach(() => {
    delete (globalThis as { localStorage?: Storage }).localStorage;
    invalidateRecordsCache();
  });

  it('parses garbage to empty records', () => {
    const empty = { targets: {}, fighters: {}, launch: {}, challenges: {} };
    expect(parseRecords(null)).toEqual(empty);
    expect(parseRecords('nope')).toEqual(empty);
    expect(parseRecords('[]')).toEqual(empty);
    expect(parseRecords('{"targets":5,"fighters":"x"}')).toEqual(empty);
  });

  it('drops non-numeric, non-finite and non-positive bests and sanitises fighter counts', () => {
    const r = parseRecords(
      JSON.stringify({
        targets: { brick: 600, vex: 'fast', nova: -3, rime: 0, agni: null },
        launch: { brick: 120.5, vex: 'Infinity' },
        fighters: { brick: { played: 3.7, wins: 9, kos: 'x', falls: -2 }, vex: 'bad' },
        challenges: { c1: 'brick', c2: 7, c3: '' },
      }),
    );
    expect(r.targets).toEqual({ brick: 600 });
    expect(r.launch).toEqual({ brick: 120.5 });
    expect(r.fighters).toEqual({ brick: { played: 3, wins: 3, kos: 0, falls: 0 } });
    expect(r.challenges).toEqual({ c1: 'brick' });
  });

  it('a corrupt stored value reads as no record', () => {
    store.setItem(KEY, JSON.stringify({ targets: { brick: 'NaN' }, launch: { brick: {} } }));
    expect(bestTargetTime('brick')).toBeNull();
    expect(bestLaunch('brick')).toBeNull();
  });

  it('writes a version field and reads old unversioned saves', () => {
    store.setItem(KEY, JSON.stringify({ targets: { brick: 900 } }));
    expect(bestTargetTime('brick')).toBe(900);
    expect(recordTargetTime('brick', 800)).toBe(true);
    const saved = JSON.parse(store.getItem(KEY)!);
    expect(saved.version).toBe(RECORDS_VERSION);
    expect(saved.targets.brick).toBe(800);
  });

  it('caches the parsed records between calls', () => {
    store.setItem(KEY, JSON.stringify({ targets: { brick: 900 } }));
    bestTargetTime('brick');
    const before = store.reads;
    for (let i = 0; i < 10; i++) bestTargetTime('brick');
    fighterRecords();
    expect(store.reads).toBe(before);
  });

  it('re-reads after another tab writes (storage event invalidates)', () => {
    expect(bestTargetTime('vex')).toBeNull();
    store.setItem(KEY, JSON.stringify({ targets: { vex: 700 } }));
    expect(bestTargetTime('vex')).toBeNull(); // still cached
    invalidateRecordsCache(); // what the storage listener does in a browser
    expect(bestTargetTime('vex')).toBe(700);
  });

  it('records bests, matches and challenges; ignores invalid inputs', () => {
    expect(recordTargetTime('brick', NaN)).toBe(false);
    expect(recordTargetTime('brick', 500)).toBe(true);
    expect(recordTargetTime('brick', 600)).toBe(false);
    expect(recordLaunch('brick', 0)).toBe(false);
    expect(recordLaunch('brick', 50)).toBe(true);
    expect(recordLaunch('brick', 40)).toBe(false);
    recordMatch('brick', true, 2, 1);
    recordMatch('brick', false, NaN, 3);
    expect(fighterRecords().brick).toEqual({ played: 2, wins: 1, kos: 2, falls: 4 });
    expect(recordChallenge('c1', 'brick')).toBe(true);
    expect(recordChallenge('c1', 'vex')).toBe(false);
    expect(clearedChallenges()).toEqual({ c1: 'brick' });
    // getters hand out copies: mutating them does not corrupt the cache
    fighterRecords().brick.played = 99;
    clearedChallenges().c9 = 'x';
    expect(fighterRecords().brick.played).toBe(2);
    expect(clearedChallenges().c9).toBeUndefined();
    resetRecords();
    expect(bestTargetTime('brick')).toBeNull();
    expect(fighterRecords()).toEqual({});
  });

  it('works with storage unavailable (records last for the session)', () => {
    (globalThis as { localStorage?: unknown }).localStorage = {
      getItem() {
        throw new Error('blocked');
      },
      setItem() {
        throw new Error('blocked');
      },
    };
    invalidateRecordsCache();
    expect(bestTargetTime('brick')).toBeNull();
    expect(recordTargetTime('brick', 300)).toBe(true);
    expect(bestTargetTime('brick')).toBe(300);
  });
});
