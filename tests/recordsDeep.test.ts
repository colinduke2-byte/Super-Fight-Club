import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CHARACTER_LIST } from '../src/characters';
import { CHALLENGES, challengeTier, goalText, recordChallengeResult, type Challenge } from '../src/game/challenges';
import { applyLadderResult, buildLadder } from '../src/game/ladder';
import {
  ARCADE_STAR_SCORE,
  arcadeRecords,
  arcadeScore,
  arcadeStars,
  challengeBests,
  clearedChallenges,
  fighterRecords,
  invalidateRecordsCache,
  lifetimeStats,
  mostUsedStage,
  parseRecords,
  recordArcadeClear,
  recordMatch,
  recordMatchStats,
  resetRecordSection,
} from '../src/game/records';
import { exportSave, importSave, readSave } from '../src/game/save';
import type { MatchResult, PlayerResult } from '../src/game/session';

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

const pl = (index: number, character: string, o: Partial<PlayerResult> = {}): PlayerResult => ({ index, character, type: index === 0 ? 'human' : 'cpu', stocks: 1, kos: 0, falls: 0, damageDealt: 0, eliminated: false, placement: index + 1, team: -1, ...o });
const res = (players: PlayerResult[], o: Partial<MatchResult> = {}): MatchResult => ({ winner: 0, winnerTeam: -1, durationSec: 60, players, ...o });

describe('deeper records', () => {
  beforeEach(() => {
    (globalThis as { localStorage?: Storage }).localStorage = memoryStorage();
    invalidateRecordsCache();
  });
  afterEach(() => {
    delete (globalThis as { localStorage?: Storage }).localStorage;
    invalidateRecordsCache();
  });

  it('scores arcade runs: KOs and speed up, continues down, harder CPUs scale it', () => {
    const base = { kos: 20, seconds: 700, continuesUsed: 0, difficulty: 2 };
    const s = arcadeScore(base);
    expect(s).toBe(10000 + 20 * 500 + 500 * 20 + 5000);
    expect(arcadeScore({ ...base, kos: 25 })).toBeGreaterThan(s);
    expect(arcadeScore({ ...base, seconds: 600 })).toBeGreaterThan(s);
    expect(arcadeScore({ ...base, continuesUsed: 1 })).toBeLessThan(s);
    expect(arcadeScore({ ...base, difficulty: 3 })).toBeGreaterThan(s);
    expect(arcadeScore({ ...base, difficulty: 1 })).toBeLessThan(s);
    expect(arcadeScore({ kos: 0, seconds: 99999, continuesUsed: 9, difficulty: 1 })).toBe(0);
  });

  it('keeps arcade clears per fighter: best time, best score, no-continue clears, hardest level, stars', () => {
    const first = recordArcadeClear('nova', { kos: 10, seconds: 900, continuesUsed: 2, difficulty: 2 });
    expect(first.firstClear).toBe(true);
    expect(first.stars).toBe(1);
    const second = recordArcadeClear('nova', { kos: 30, seconds: 600, continuesUsed: 0, difficulty: 3 });
    expect(second.newBestScore).toBe(true);
    expect(second.newBestTime).toBe(true);
    const a = arcadeRecords().nova;
    expect(a).toMatchObject({ clears: 2, bestSec: 600, noContinue: 1, hardestClear: 3 });
    expect(a.bestScore).toBe(second.score);
    expect(second.score).toBeGreaterThanOrEqual(ARCADE_STAR_SCORE);
    expect(arcadeStars(a)).toBe(3);
    expect(arcadeStars(undefined)).toBe(0);
  });

  it('the ladder records the clear once, when the boss falls', () => {
    const l = buildLadder('gizmo', () => 0.3);
    const win = res([pl(0, 'gizmo', { kos: 2 }), pl(1, 'brick')]);
    applyLadderResult(l, res([pl(0, 'gizmo'), pl(1, 'brick')], { winner: 1 }));
    for (let i = 0; i < l.fights.length; i++) applyLadderResult(l, win);
    expect(l.clear?.score).toBe(arcadeScore({ kos: 2 * l.fights.length, seconds: 60 * l.fights.length, continuesUsed: 1, difficulty: 2 }));
    expect(arcadeRecords().gizmo).toMatchObject({ clears: 1, noContinue: 0 });
  });

  it('lifetime stats: play time, stages, totals, longest combo, ultimate KOs, head to head', () => {
    recordMatchStats(res([pl(0, 'brick', { kos: 3, falls: 1, damageDealt: 210, bestCombo: 7 }), pl(1, 'vex', { placement: 2 })], { durationSec: 95 }), 'classic', { 0: 1 });
    recordMatchStats(res([pl(0, 'brick', { kos: 1, bestCombo: 3, placement: 2 }), pl(1, 'vex', { placement: 1 })], { winner: 1, durationSec: 40 }), 'classic');
    recordMatchStats(res([pl(0, 'nova', { placement: 1 }), pl(1, 'vex'), pl(2, 'agni', { placement: 3 })], { durationSec: 30 }), 'storm');
    // cpu-only (demo) matches are not counted
    recordMatchStats(res([pl(1, 'vex', { type: 'cpu' }), pl(2, 'agni')]), 'ring');
    const s = lifetimeStats();
    expect(s.matches).toBe(3);
    expect(s.playSec).toBe(165);
    expect(s.kos).toBe(4);
    expect(s.falls).toBe(1);
    expect(s.damage).toBe(210);
    expect(s.bestCombo).toBe(7);
    expect(s.bestComboBy).toBe('brick');
    expect(s.ultimateKos).toBe(1);
    expect(s.stages).toEqual({ classic: 2, storm: 1 });
    expect(mostUsedStage()).toBe('classic');
    expect(s.matchups.brick.vex).toEqual({ w: 1, l: 1 });
    expect(s.matchups.nova).toEqual({ vex: { w: 1, l: 0 }, agni: { w: 1, l: 0 } });
  });

  it('team battles: team-mates are not opponents', () => {
    recordMatchStats(res([pl(0, 'rime', { team: 0 }), pl(1, 'havoc', { team: 0, type: 'cpu' }), pl(2, 'agni', { team: 1 }), pl(3, 'brick', { team: 1 })], { winner: -1, winnerTeam: 0 }), 'frostfang');
    expect(lifetimeStats().matchups.rime).toEqual({ agni: { w: 1, l: 0 }, brick: { w: 1, l: 0 } });
  });

  it('challenge medals: bronze for a clear, silver for the goal, gold for both; best tier and time are kept', () => {
    const c: Challenge = { id: 't', title: 'T', brief: '', stage: 'classic', you: null, rules: { stocks: 2 }, foes: [{ character: 'brick', level: 1 }], silver: { kind: 'time', sec: 60 }, gold: { kind: 'flawless' } };
    const run = (durationSec: number, falls: number, winner = 0) => res([pl(0, 'vex', { falls }), pl(1, 'brick')], { winner, durationSec });
    expect(challengeTier(c, run(30, 0, 1))).toBe(0);
    expect(challengeTier(c, run(90, 0))).toBe(1);
    expect(challengeTier(c, run(50, 1))).toBe(2);
    expect(challengeTier(c, run(50, 0))).toBe(3);
    expect(goalText(c.silver)).toBe('UNDER 1:00');
    expect(recordChallengeResult(c, 'vex', run(90, 0)).firstClear).toBe(true);
    expect(clearedChallenges().t).toBe('vex');
    expect(challengeBests().t).toEqual({ tier: 1, sec: 90 });
    const g = recordChallengeResult(c, 'brick', run(55, 0));
    expect(g).toMatchObject({ earned: 3, newTier: true, newBestTime: true, tier: 3 });
    recordChallengeResult(c, 'brick', run(80, 0));
    expect(challengeBests().t).toEqual({ tier: 3, sec: 55 });
    // a failed run changes nothing
    expect(recordChallengeResult(c, 'brick', run(10, 0, 1)).earned).toBe(0);
    expect(challengeBests().t).toEqual({ tier: 3, sec: 55 });
    expect(clearedChallenges().t).toBe('vex');
  });

  it('every challenge has reachable medal goals, and every fighter gets challenges of its own', () => {
    const own: Record<string, number> = {};
    const seen: Record<string, number> = {};
    for (const c of CHALLENGES) {
      if (c.you) own[c.you] = (own[c.you] ?? 0) + 1;
      for (const id of [c.you, c.ally?.character, ...c.foes.map((f) => f.character)]) if (id) seen[id] = (seen[id] ?? 0) + 1;
      const timed = c.rules.mode === 'time';
      // a time match always lasts its full length: its goals cannot be a clear time
      if (timed) expect(c.silver.kind, c.id).not.toBe('time');
      expect(goalText(c.gold).length, c.id).toBeGreaterThan(0);
    }
    for (const f of CHARACTER_LIST) {
      expect(own[f.id] ?? 0, f.id).toBeGreaterThanOrEqual(2);
      expect(seen[f.id] ?? 0, f.id).toBeGreaterThanOrEqual(6);
    }
  });

  it('save export / import round-trips, validates, and rejects other text', () => {
    recordMatch('brick', true, 3, 1);
    recordArcadeClear('vex', { kos: 12, seconds: 800, continuesUsed: 0, difficulty: 2 });
    const text = exportSave(new Date(0));
    const saved = JSON.parse(text);
    expect(saved.game).toBe('super-fight-club');
    expect(saved.exported).toBe('1970-01-01T00:00:00.000Z');
    resetRecordSection('fighters');
    expect(fighterRecords()).toEqual({});
    expect(arcadeRecords().vex.clears).toBe(1);
    const r = importSave(text);
    expect(r.ok).toBe(true);
    expect(fighterRecords().brick).toEqual({ played: 1, wins: 1, kos: 3, falls: 1 });
    expect(readSave('').ok).toBe(false);
    expect(readSave('hello').ok).toBe(false);
    expect(readSave('[1,2]').ok).toBe(false);
    expect(readSave('{"game":"other","save":1,"records":{}}').ok).toBe(false);
    expect(readSave('{"game":"super-fight-club","save":99,"records":{}}').ok).toBe(false);
    expect(readSave('{"foo":1}').ok).toBe(false);
    // a bare records object (what storage holds) also loads; junk values are dropped
    const bare = readSave('{"targets":{"brick":500,"vex":"x"},"arcade":{"nova":{"clears":2,"bestScore":-5,"noContinue":9}}}');
    expect(bare.ok && bare.records.targets).toEqual({ brick: 500 });
    expect(bare.ok && bare.records.arcade.nova).toEqual({ clears: 2, bestSec: 0, bestScore: 0, noContinue: 2, hardestClear: 0 });
  });

  it('parses v3 sections defensively', () => {
    const r = parseRecords(
      JSON.stringify({
        chalBest: { a: { tier: 9, sec: 30 }, b: { tier: 0 }, c: 'x' },
        stats: { matches: 2.5, playSec: -1, bestCombo: 4, bestComboBy: 7, stages: { classic: 3, x: 'y' }, matchups: { brick: { vex: { w: 2, l: 'z' }, nova: { w: 0, l: 0 } }, __proto__: {} } },
      }),
    );
    expect(r.chalBest).toEqual({ a: { tier: 3, sec: 30 } });
    expect(r.stats.matches).toBe(2);
    expect(r.stats.playSec).toBe(0);
    expect(r.stats.bestComboBy).toBe('');
    expect(r.stats.stages).toEqual({ classic: 3 });
    expect(r.stats.matchups).toEqual({ brick: { vex: { w: 2, l: 0 } } });
  });
});
