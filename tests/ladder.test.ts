import { describe, expect, it } from 'vitest';
import { CHARACTER_LIST, BOSSES } from '../src/characters';
import { applyLadderResult, buildLadder, currentFight, LADDER_CONTINUES, slotsForFight } from '../src/game/ladder';
import { endingCards, fightCard, introCards, LINE_WIDTH, wrap } from '../src/game/story';
import type { MatchResult, PlayerSlot } from '../src/game/session';

const human: PlayerSlot = { index: 0, type: 'human', device: null, character: 'vex', cpuLevel: 1 };
const result = (winner: number, kos = 2): MatchResult => ({ winner, winnerTeam: -1, durationSec: 75, players: [{ index: 0, character: 'vex', type: 'human', stocks: 1, kos, falls: 1, damageDealt: 100, eliminated: false, placement: 1, team: -1 }] });

describe('arcade ladder', () => {
  for (const c of CHARACTER_LIST) {
    it(`${c.id}: five fights then the boss, escalating`, () => {
      const l = buildLadder(c.id);
      expect(l.fights).toHaveLength(6);
      expect(l.fights[5].kind).toBe('boss');
      expect(l.fights[5].opponents[0].character in BOSSES).toBe(true);
      expect(l.fights[3].opponents[0].character).toBe(c.id); // mirror match
      const levels = l.fights.slice(0, 5).map((f) => Math.max(...f.opponents.map((o) => o.level)));
      for (let i = 1; i < levels.length; i++) expect(levels[i]).toBeGreaterThanOrEqual(levels[i - 1]);
      // the first three opponents are the three other roster fighters, once each
      const firsts = [0, 1, 2].map((i) => l.fights[i].opponents[0].character);
      expect(new Set(firsts).size).toBe(3);
      expect(firsts).not.toContain(c.id);
    });
  }

  it('slots: the human first with handicap stocks, then CPUs / the boss', () => {
    const l = buildLadder('vex');
    l.index = 5;
    const s = slotsForFight(l, human);
    expect(s).toHaveLength(2);
    expect(s[0]).toMatchObject({ index: 0, type: 'human', stocks: 3 });
    expect(s[1]).toMatchObject({ index: 1, type: 'cpu', boss: true, character: 'overseer', stocks: 2 });
    l.index = 4;
    expect(slotsForFight(l, human)).toHaveLength(3);
  });

  it('wins advance; the boss win makes a champion', () => {
    const l = buildLadder('vex');
    for (let i = 0; i < 5; i++) expect(applyLadderResult(l, result(0))).toBe('next');
    expect(currentFight(l).kind).toBe('boss');
    expect(applyLadderResult(l, result(0))).toBe('champion');
    expect(l.kos).toBe(12);
    expect(l.seconds).toBe(450);
  });

  it('losses spend continues, retry the same fight, then game over', () => {
    const l = buildLadder('vex');
    applyLadderResult(l, result(0));
    for (let i = 0; i < LADDER_CONTINUES; i++) expect(applyLadderResult(l, result(1))).toBe('retry');
    expect(l.index).toBe(1);
    expect(l.continuesUsed).toBe(LADDER_CONTINUES);
    expect(applyLadderResult(l, result(1))).toBe('gameover');
    expect(applyLadderResult(l, null)).toBe('gameover');
  });
});

describe('story cards', () => {
  it('wraps to the card width without splitting words', () => {
    const lines = wrap('Below the shattered moon, the Hollow keeps one law: the Super Fight Club never closes.');
    for (const l of lines) expect(l.length).toBeLessThanOrEqual(LINE_WIDTH);
    expect(lines.join(' ')).toContain('Super Fight Club');
  });
  it('every character has an intro, a fight card per fight and an ending', () => {
    for (const c of CHARACTER_LIST) {
      const l = buildLadder(c.id);
      for (const card of [...introCards(c.id), ...endingCards(l)]) {
        expect(card.lines.length).toBeGreaterThan(0);
        expect(card.lines.length, card.title).toBeLessThanOrEqual(4); // fits under the art
        for (const line of card.lines) expect(line.length).toBeLessThanOrEqual(LINE_WIDTH);
      }
      for (const f of l.fights) {
        const card = fightCard(l, f);
        expect(card.lines.length).toBeGreaterThan(0);
        expect(card.lines.length).toBeLessThanOrEqual(4);
        for (const line of card.lines) expect(line.length).toBeLessThanOrEqual(LINE_WIDTH);
      }
      expect(fightCard(l, l.fights[5]).art).toBe('boss');
      expect(endingCards(l).length).toBe(3);
    }
  });
});
