import { describe, expect, it } from 'vitest';
import { CHARACTERS } from '../src/characters';
import { competitiveStages, playMatch } from './tools/matchSim';

/**
 * The difficulty ladder is graded: every CPU skill beats the one just below it more often than not. Headless matches with
 * rotating fighters (both sides of each pairing get the stronger CPU in turn) and stages, fixed seeds, so the result is
 * deterministic for a given build.
 */
const MATCHES = 100;

describe('CPU skill ladder', () => {
  it('skill N beats skill N-1 in more than 55% of matches, for N = 2..9', () => {
    // the original ten-fighter set (the playable Overseer would change the rotation)
    const ids = Object.keys(CHARACTERS).filter((c) => c !== 'overseer' && c !== 'overseer-versus');
    const stages = competitiveStages(2);
    const rates: string[] = [];
    const fails: string[] = [];
    for (let n = 2; n <= 9; n++) {
      let hi = 0;
      let lo = 0;
      for (let k = 0; k < MATCHES; k++) {
        const a = ids[(k * 5 + n) % ids.length];
        const b = ids[(k * 3 + n * 2 + 1) % ids.length];
        const flip = k % 2 === 1;
        const chars = flip ? [b, a] : [a, b];
        const skills = flip ? [n - 1, n] : [n, n - 1];
        const r = playMatch(chars, stages[k % stages.length], 3, 500 + k + n * 37, { skills, stocks: 1 });
        if (r.winner < 0) continue;
        if (skills[r.winner] === n) hi++;
        else lo++;
      }
      const rate = hi / Math.max(1, hi + lo);
      rates.push(`${n}v${n - 1}: ${hi}-${lo}`);
      if (rate <= 0.55) fails.push(`${n}v${n - 1} ${hi}-${lo}`);
    }
    if (process.env.LADDER_LOG) console.log(rates.join(', '));
    expect(fails, rates.join(', ')).toEqual([]);
  }, 600_000);
});
