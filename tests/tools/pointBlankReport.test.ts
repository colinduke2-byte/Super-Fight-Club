import { describe, expect, it } from 'vitest';
import { competitiveStages } from './matchSim';
import { AIR_MOVES, FIGHTERS, GROUND_MOVES, mutual, OFFSETS, overlapMatch, pointBlank, type WhyMiss } from './pointBlank';

/**
 * Point-blank whiff table and CPU overlap time (skipped unless POINTBLANK is set):
 *
 *   POINTBLANK=1 npx vitest run tests/tools/pointBlankReport.test.ts        whiff table + mutual-attack outcomes
 *   POINTBLANK=overlap npx vitest run tests/tools/pointBlankReport.test.ts  overlap time in skill-9 CPU 1v1s
 */
const MODE = process.env.POINTBLANK ?? '';

describe.skipIf(!MODE)('point-blank report', () => {
  it('prints', () => {
    const out: Record<string, unknown> = {};
    if (MODE === '1') {
      const table: Record<string, Record<WhyMiss, number>> = {};
      const perChar: Record<string, number> = {};
      for (const mv of [...GROUND_MOVES, ...AIR_MOVES]) {
        const row: Record<WhyMiss, number> = { hit: 0, 'front-gap': 0, behind: 0, vertical: 0, blocked: 0 };
        for (const a of FIGHTERS)
          for (const b of FIGHTERS)
            for (const dx of OFFSETS)
              for (const f of [1, -1] as const) {
                const r = pointBlank(a, b, mv, dx, f);
                row[r]++;
                if (r !== 'hit') perChar[`${a}.${mv}`] = (perChar[`${a}.${mv}`] ?? 0) + 1;
              }
        table[mv] = row;
      }
      out.whiffs = table;
      out.worst = Object.entries(perChar).sort((x, y) => y[1] - x[1]).slice(0, 40);
      const mm = ['jab1', 'ftilt', 'dtilt', 'utilt', 'fsmash', 'dsmash', 'usmash'];
      const mres = { none: 0, one: 0, trade: 0, clank: 0 };
      for (const a of FIGHTERS)
        for (const b of FIGHTERS)
          for (const ma of mm)
            for (const mb of mm)
              for (const dx of OFFSETS)
                for (const [fa, fb] of [[1, -1], [-1, 1], [1, 1]] as const) mres[mutual(a, b, ma, mb, dx, fa, fb)]++;
      out.mutual = mres;
    }
    if (MODE === 'overlap') {
      const st = competitiveStages(2);
      let ticks = 0;
      let ov = 0;
      let dry = 0;
      const eps: number[] = [];
      let p = 0;
      for (let i = 0; i < FIGHTERS.length; i++)
        for (let j = i + 1; j < FIGHTERS.length; j++, p++) {
          const r = overlapMatch([FIGHTERS[i], FIGHTERS[j]], st[p % st.length], 9, p, 5400);
          ticks += r.ticks;
          ov += r.overlapTicks;
          dry += r.dryAttackTicks;
          eps.push(...r.episodes);
        }
      eps.sort((x, y) => x - y);
      const q = (f: number): number => eps[Math.min(eps.length - 1, Math.floor(eps.length * f))] ?? 0;
      out.overlap = { matches: p, ticks, overlapPct: +((100 * ov) / ticks).toFixed(2), dryAttackPct: +((100 * dry) / ticks).toFixed(2), episodes: eps.length, perMin: +((eps.length * 3600) / ticks).toFixed(2), p50: q(0.5), p90: q(0.9), p99: q(0.99), max: eps[eps.length - 1] ?? 0, over30: eps.filter((e) => e > 30).length };
    }
    process.stdout.write(`${JSON.stringify(out)}\n`);
    expect(true).toBe(true);
  });
});
