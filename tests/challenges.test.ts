import { describe, expect, it } from 'vitest';
import { characterById } from '../src/characters';
import { armSpecialChallenge, CHALLENGES, ChallengeTracker, challengeById, challengeCleared, challengeRules, challengeSlots, challengeTier, clearText, goalMet, recordSpecialRun, resetChallengeStats, specialTier, type Challenge } from '../src/game/challenges';
import { dailyBest, dailyById, dailyChallenge, dailySeed, dailyStreak, dayKey, recordDaily, todaysChallenge } from '../src/game/daily';
import { activeTurns, advanceTurn, beginTurns, endTurns, recordTurn, standings } from '../src/game/turns';
import { session } from '../src/game/session';
import { CHARACTERS } from '../src/characters';
import { Fighter } from '../src/engine/fighter';
import { World } from '../src/engine/world';
import { targetCourseById } from '../src/stages/targetCourses';
import { memStorage } from './tools/memStorage';
import type { MatchResult, PlayerSlot } from '../src/game/session';
import { STAGES } from '../src/stages';

const human: PlayerSlot = { index: 0, type: 'human', device: null, character: 'vex', cpuLevel: 1 };

describe('Challenges', () => {
  it('ten challenges, unique ids, real fighters and stages, 2-4 fighters each', () => {
    expect(CHALLENGES).toHaveLength(46);
    expect(new Set(CHALLENGES.map((c) => c.id)).size).toBe(46);
    for (const c of CHALLENGES) {
      expect(STAGES[c.stage] ?? targetCourseById(c.stage)?.stage, c.id).toBeDefined();
      if (c.kind === 'targets' || c.kind === 'launch') {
        expect(c.you, c.id).toBeTruthy(); // a practice-mode challenge starts straight into the run: its fighter is fixed
        continue;
      }
      if (c.you) expect(characterById(c.you), c.id).toBeDefined();
      for (const f of [...c.foes, ...(c.ally ? [c.ally] : [])]) expect(characterById(f.character), `${c.id}:${f.character}`).toBeDefined();
      const slots = challengeSlots(c, human);
      expect(slots.length).toBeGreaterThanOrEqual(2);
      expect(slots.length).toBeLessThanOrEqual(4);
      expect(slots[0].type).toBe('human');
      if (challengeRules(c).teams) expect(slots).toHaveLength(4);
    }
  });

  it('a fixed fighter overrides the pick; the ally sits next to the player', () => {
    const shark = CHALLENGES.find((c) => c.id === 'shark-week')!;
    expect(challengeSlots(shark, human)[0].character).toBe('riptide');
    const tag = CHALLENGES.find((c) => c.ally)!;
    const s = challengeSlots(tag, human);
    expect(s[1].character).toBe(tag.ally!.character);
    expect(s.map((x) => x.index)).toEqual([0, 1, 2, 3]);
  });

  it('cleared = the player wins, or their team does', () => {
    const r = (winner: number, winnerTeam = -1, team = -1): MatchResult => ({ winner, winnerTeam, durationSec: 60, players: [{ index: 0, character: 'vex', type: 'human', stocks: 1, kos: 1, falls: 0, damageDealt: 50, eliminated: false, placement: 1, team }] });
    expect(challengeCleared(r(0))).toBe(true);
    expect(challengeCleared(r(1))).toBe(false);
    expect(challengeCleared(r(1, 0, 0))).toBe(true);
    expect(challengeCleared(r(2, 1, 0))).toBe(false);
  });

});

const result = (o: { winner?: number; durationSec?: number; falls?: number; kos?: number; allyOut?: boolean; allyFalls?: number }): MatchResult => ({
  winner: o.winner ?? 0,
  winnerTeam: -1,
  durationSec: o.durationSec ?? 60,
  players: [
    { index: 0, character: 'vex', type: 'human', stocks: 1, kos: o.kos ?? 1, falls: o.falls ?? 0, damageDealt: 50, eliminated: (o.falls ?? 0) > 0, placement: 1, team: -1 },
    { index: 1, character: 'nova', type: 'cpu', stocks: 1, kos: 0, falls: o.allyFalls ?? 0, damageDealt: 0, eliminated: !!o.allyOut, placement: 2, team: -1 },
  ],
});
const byId = (id: string): Challenge => CHALLENGES.find((c) => c.id === id)!;

describe('Challenges beyond winning the match', () => {
  it('at least ten new kinds: score attack, launch distance, survival, no specials, hazard KOs, protecting an ally, item-only rules, The Apex', () => {
    const kinds = (pred: (c: Challenge) => boolean) => CHALLENGES.filter(pred).length;
    expect(kinds((c) => c.kind === 'targets')).toBeGreaterThanOrEqual(1);
    expect(kinds((c) => c.kind === 'launch')).toBeGreaterThanOrEqual(1);
    expect(kinds((c) => c.clear?.kind === 'survive' && c.foes.some((f) => f.character === 'overseer'))).toBeGreaterThanOrEqual(1);
    expect(kinds((c) => c.clear?.kind === 'noSpecials')).toBeGreaterThanOrEqual(1);
    expect(kinds((c) => c.clear?.kind === 'hazardKos')).toBeGreaterThanOrEqual(1);
    expect(kinds((c) => c.clear?.kind === 'protect' && !!c.ally)).toBeGreaterThanOrEqual(1);
    expect(kinds((c) => (c.rules.itemsOff?.length ?? 0) >= 8)).toBeGreaterThanOrEqual(1);
    expect(kinds((c) => c.stage === 'apex')).toBeGreaterThanOrEqual(2);
    expect(kinds((c) => !!c.kind || !!c.clear || (c.rules.itemsOff?.length ?? 0) > 0)).toBeGreaterThanOrEqual(10);
    for (const c of CHALLENGES) expect(clearText(c), c.id).toBeTruthy();
  });

  it('survive: lasting the time clears even when the boss wins at the bell; the full time without falling is silver', () => {
    const c = byId('hold-the-summit');
    expect(challengeCleared(result({ winner: 1, durationSec: 60, falls: 0 }), c)).toBe(true);
    expect(challengeCleared(result({ winner: 1, durationSec: 50, falls: 1 }), c)).toBe(true);
    expect(challengeCleared(result({ winner: 1, durationSec: 30, falls: 1 }), c)).toBe(false);
    expect(goalMet(c.silver, result({ winner: 1, durationSec: 60, falls: 0 }), c)).toBe(true);
    expect(goalMet(c.silver, result({ winner: 1, durationSec: 50, falls: 1 }), c)).toBe(false);
  });

  it('protect: the win only counts with the ally still in', () => {
    const c = byId('bodyguard');
    expect(challengeCleared(result({}), c)).toBe(true);
    expect(challengeCleared(result({ allyOut: true }), c)).toBe(false);
    expect(goalMet(c.silver, result({ allyFalls: 1 }), c)).toBe(false);
  });

  it('the tracker counts specials and hazard KOs from the match events', () => {
    resetChallengeStats();
    const c = byId('fundamentals');
    const world = new World(STAGES.storm);
    const p = new Fighter(0, CHARACTERS.vex);
    const foe = new Fighter(1, CHARACTERS.brick);
    world.addFighter(p);
    world.addFighter(foe);
    const tr = new ChallengeTracker(c);
    expect(challengeCleared(result({}), c)).toBe(true); // no specials yet
    p.move = CHARACTERS.vex.moves.neutralB;
    tr.onEvent('moveStart', p, world);
    expect(challengeCleared(result({}), c)).toBe(false);
    // a hazard hit (the storm's hit table changes this tick), then the KO
    const h = byId('lightning-rod');
    const tr2 = new ChallengeTracker(h);
    tr2.beforeStep(world);
    world.hazardHit[0][1] = 7;
    tr2.onEvent('hit', foe, world);
    tr2.onEvent('ko', foe, world);
    expect(challengeCleared(result({}), h)).toBe(true);
    expect(goalMet(h.silver, result({}), h)).toBe(false);
    // a KO by an ordinary hit does not count
    tr2.beforeStep(world);
    tr2.onEvent('hit', foe, world);
    tr2.onEvent('ko', foe, world);
    expect(goalMet(h.silver, result({}), h)).toBe(false);
  });

  it('Target Smash and Launch Contest challenges are judged on the run, and only for the armed challenge', () => {
    memStorage();
    const b = byId('bullseye');
    expect(specialTier(b, { kind: 'targets', stage: b.stage, character: 'agni', ticks: -1 })).toBe(0);
    expect(specialTier(b, { kind: 'targets', stage: b.stage, character: 'agni', ticks: 50 * 60 })).toBe(1);
    expect(specialTier(b, { kind: 'targets', stage: b.stage, character: 'agni', ticks: 40 * 60 })).toBe(2);
    expect(specialTier(b, { kind: 'targets', stage: b.stage, character: 'agni', ticks: 20 * 60 })).toBe(3);
    const h = byId('home-run');
    expect(specialTier(h, { kind: 'launch', stage: 'launch', character: 'brick', distance: 30 })).toBe(0);
    expect(specialTier(h, { kind: 'launch', stage: 'launch', character: 'brick', distance: 450 })).toBe(3);
    armSpecialChallenge(null);
    expect(recordSpecialRun({ kind: 'targets', stage: b.stage, character: 'agni', ticks: 20 * 60 })).toBe(-1);
    armSpecialChallenge('bullseye');
    expect(recordSpecialRun({ kind: 'targets', stage: 'targets', character: 'agni', ticks: 20 * 60 })).toBe(-1); // another course
    expect(recordSpecialRun({ kind: 'targets', stage: b.stage, character: 'agni', ticks: 20 * 60 })).toBe(3);
    armSpecialChallenge(null);
  });
});

describe('Daily challenge', () => {
  it('the day picks the challenge: the same date always gives the same one, and the days vary', () => {
    const a = dailyChallenge('20261020');
    expect(dailyChallenge('20261020')).toEqual(a);
    expect(dailySeed('20261020')).toBe(dailySeed('20261020'));
    expect(dailySeed('20261020')).not.toBe(dailySeed('20261021'));
    expect(a.id).toBe('daily-20261020');
    expect(dailyById('daily-20261020')).toEqual(a);
    expect(challengeById('daily-20261020')).toEqual(a);
    expect(dailyById('nope')).toBeUndefined();
    const week = Array.from({ length: 14 }, (_, i) => dailyChallenge(`202611${String(i + 1).padStart(2, '0')}`));
    expect(new Set(week.map((c) => `${c.you}/${c.stage}/${c.brief}`)).size).toBeGreaterThan(7);
    for (const c of week) {
      expect(CHARACTERS[c.you!], c.id).toBeDefined();
      expect(STAGES[c.stage], c.id).toBeDefined();
      expect(c.foes.length).toBeGreaterThanOrEqual(1);
      expect(c.foes.every((f) => f.character !== c.you)).toBe(true);
      expect(challengeTier(c, { ...result({ durationSec: 9999, falls: 1, kos: 0 }) })).toBeGreaterThanOrEqual(c.clear ? 0 : 1);
    }
    expect(dayKey(new Date(2026, 9, 20, 23, 59))).toBe('20261020');
    expect(todaysChallenge(new Date(2026, 9, 20)).id).toBe('daily-20261020');
  });

  it('keeps the best of each day locally, and the streak of days cleared', () => {
    memStorage();
    expect(dailyBest('20261020')).toBeNull();
    expect(recordDaily('20261020', 0, 50)).toBe(false);
    expect(recordDaily('20261020', 1, 80)).toBe(true);
    expect(recordDaily('20261020', 2, 90)).toBe(true);
    expect(recordDaily('20261020', 1, 95)).toBe(false);
    expect(dailyBest('20261020')).toEqual({ tier: 2, sec: 80 });
    recordDaily('20261019', 1, 100);
    expect(dailyStreak(new Date(2026, 9, 20))).toBe(2);
    expect(dailyStreak(new Date(2026, 9, 21))).toBe(2); // today not played yet: the streak still stands
    expect(dailyStreak(new Date(2026, 9, 23))).toBe(0);
  });
});

describe('Take turns', () => {
  const p = (index: number, character: string): PlayerSlot => ({ index, type: 'human', device: null, character, cpuLevel: 1 });

  it('two to four players take the same course in turn, then the standings compare them', () => {
    beginTurns('targets', [p(0, 'vex'), p(1, 'brick'), p(2, 'nova')]);
    session.mode = 'targets';
    const t = activeTurns()!;
    expect(t.players).toHaveLength(3);
    expect(session.players).toHaveLength(1);
    expect(session.players[0].character).toBe('vex');
    expect(session.stage).toBe('targets-vex'); // player 1's own course, for everyone
    recordTurn({ score: -1500, text: '0:25.00' });
    expect(advanceTurn()).toBe(true);
    expect(session.players[0].character).toBe('brick');
    expect(session.players[0].index).toBe(0);
    expect(session.stage).toBe('targets-vex');
    recordTurn({ score: -1200, text: '0:20.00' });
    expect(advanceTurn()).toBe(true);
    recordTurn({ score: -1e7 + 6, text: '6/10 TARGETS' });
    expect(advanceTurn()).toBe(false);
    expect(standings(t).map((r) => [r.player, r.place])).toEqual([
      [1, 1],
      [0, 2],
      [2, 3],
    ]);
    endTurns();
    expect(activeTurns()).toBeNull();
  });

  it('launch turns give each player the standard dummy; one player is a plain run', () => {
    beginTurns('launch', [p(0, 'rime'), p(1, 'havoc')]);
    expect(session.players.map((s) => s.type)).toEqual(['human', 'cpu']);
    expect(session.players[0].character).toBe('rime');
    advanceTurn();
    expect(session.players[0].character).toBe('havoc');
    beginTurns('launch', [p(0, 'rime')]);
    expect(activeTurns()).toBeNull();
    expect(session.stage).toBe('launch');
  });
});
