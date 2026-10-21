import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CHARACTER_LIST } from '../src/characters';
import { buildLadder } from '../src/game/ladder';
import { RIVAL } from '../src/game/routes';
import { MECHANICS, bioOf, fightCard, rivalLine, runHead, tauntLines, victoryLine } from '../src/game/story';
import { session } from '../src/game/session';

/** The pixel font's letters (art/pixelFont.ts). */
const CHARS = " ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789%!?.,:-+/'()=@*[]<>|_#\"";

/** The ten fighters with a story (the playable Overseer form has a one-way rival but no story mechanic card of its own). */
const TEN = () => CHARACTER_LIST.filter((c) => RIVAL[c.id] && c.id !== 'overseer-versus');

const seq = (...v: number[]): (() => number) => {
  let i = 0;
  return () => v[i++ % v.length];
};

describe('fighter lore', () => {
  it('every roster fighter has a bio, 3-4 taunts, 3 victory lines and lines for their rival', () => {
    expect(TEN()).toHaveLength(10);
    for (const c of TEN()) {
      const p = c.persona!;
      expect(p.bio?.length ?? 0, c.id).toBeGreaterThan(40);
      expect(p.taunts?.length ?? 0, c.id).toBeGreaterThanOrEqual(3);
      expect(p.taunts?.length ?? 0, c.id).toBeLessThanOrEqual(4);
      expect(p.victories?.length, c.id).toBe(3);
      expect(p.taunts![0]).toBe(p.taunt);
      expect(p.victories![0]).toBe(p.victory);
      expect(RIVAL[c.id], c.id).toBeTruthy();
      expect(p.rival?.taunt.length ?? 0, c.id).toBeGreaterThan(10);
      expect(p.rival?.victory.length ?? 0, c.id).toBeGreaterThan(10);
      expect(MECHANICS[c.id]?.length ?? 0, c.id).toBeGreaterThan(20);
      expect(bioOf(c.id)).toBe(p.bio);
    }
    expect(bioOf('overseer').length).toBeGreaterThan(40);
  });

  it('every line uses only letters the pixel font can draw (it is shown upper-cased)', () => {
    const ok = new Set(CHARS.split(''));
    for (const c of TEN()) {
      const p = c.persona!;
      for (const line of [p.bio!, ...p.taunts!, ...p.victories!, p.rival!.taunt, p.rival!.victory, MECHANICS[c.id]]) {
        for (const ch of line.toUpperCase()) if (ch !== ' ' && ch !== '\n') expect(ok.has(ch), `${c.id}: '${ch}' in "${line}"`).toBe(true);
      }
    }
  });

  it('taunt bubbles rotate through every line; the rival line only against the rival', () => {
    expect(tauntLines('brick')).toHaveLength(4);
    expect(rivalLine('agni', 'riptide')).toMatch(/Riptide/);
    expect(rivalLine('agni', 'brick')).toBeNull();
    expect(rivalLine('agni', undefined)).toBeNull();
  });

  it('results: the rival-specific victory line when the rival lost, else a random one', () => {
    const brick = CHARACTER_LIST.find((c) => c.id === 'brick')!.persona!;
    expect(victoryLine('brick', ['havoc'])).toBe(brick.rival!.victory);
    expect(victoryLine('brick', ['vex'], seq(0))).toBe(brick.victories![0]);
    expect(victoryLine('brick', ['vex'], seq(0.99))).toBe(brick.victories![2]);
    expect(victoryLine('overseer', ['agni'], seq(0))).toBe('Surplus removed.');
  });

  it("the arcade rival fight's card quotes the rival's line to this fighter", () => {
    const l = buildLadder('agni', seq(0.3, 0.7), 2, { kind: 'arcade' });
    const f = l.fights.find((x) => x.rival)!;
    expect(f.opponents[0].character).toBe('riptide');
    const card = fightCard(l, f);
    expect(card.lines.join(' ')).toContain('Riptide:');
    expect(card.lines.join(' ').replace(/\s+/g, ' ')).toContain(rivalLine('riptide', 'agni')!.split(' ').slice(0, 3).join(' '));
  });
});

describe('countdown heading for runs', () => {
  const prev = { mode: session.mode, ladder: session.ladder };
  beforeEach(() => {
    session.mode = 'arcade';
  });
  afterEach(() => {
    session.mode = prev.mode;
    session.ladder = prev.ladder;
  });

  it('Endless counts rounds, a Boss Battle says so, the ladder keeps FIGHT n', () => {
    session.ladder = buildLadder('agni', seq(0.4), 2, { kind: 'endless' });
    expect(runHead('FIGHT 1\nX')).toMatch(/^ROUND 1\n/);
    session.ladder = buildLadder('agni', seq(0.4), 2, { kind: 'boss' });
    expect(runHead('FIGHT 1\nTHE OVERSEER')).toBe('BOSS BATTLE');
    session.ladder = buildLadder('agni', seq(0.4), 2, { kind: 'arcade' });
    expect(runHead('FIGHT 1\nX')).toBe('FIGHT 1\nX');
    expect(runHead('READY?')).toBe('READY?');
  });
});
