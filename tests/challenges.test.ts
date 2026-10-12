import { describe, expect, it } from 'vitest';
import { characterById } from '../src/characters';
import { CHALLENGES, challengeCleared, challengeRules, challengeSlots } from '../src/game/challenges';
import type { MatchResult, PlayerSlot } from '../src/game/session';
import { STAGES } from '../src/stages';

const human: PlayerSlot = { index: 0, type: 'human', device: null, character: 'vex', cpuLevel: 1 };

describe('Challenges', () => {
  it('ten challenges, unique ids, real fighters and stages, 2-4 fighters each', () => {
    expect(CHALLENGES).toHaveLength(10);
    expect(new Set(CHALLENGES.map((c) => c.id)).size).toBe(10);
    for (const c of CHALLENGES) {
      expect(STAGES[c.stage], c.id).toBeDefined();
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
