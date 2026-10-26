import { writeFileSync } from 'node:fs';
import { describe, it } from 'vitest';
import { CHARACTERS } from '../../src/characters';
import { STAGE_LIST } from '../../src/stages';
import { playMatch, type MatchResult } from './matchSim';

/**
 * Per-stage CPU measurement (skipped unless STAGEAUDIT is set): match length, KO percents and directions, self-destructs,
 * spawn-side fairness and time-outs for 1v1s (and four-player games on stages with four spawns).
 *   STAGEAUDIT=1 STAGEAUDIT_N=24 STAGEAUDIT_SKILL=7 npx vitest run tests/tools/stageAudit.test.ts
 */
const ON = !!process.env.STAGEAUDIT;
const N = Number(process.env.STAGEAUDIT_N ?? 24);
const SKILL = Number(process.env.STAGEAUDIT_SKILL ?? 7);
const ids = Object.keys(CHARACTERS).filter((c) => c !== 'overseer');

function summarise(rs: MatchResult[]) {
  const kos = rs.flatMap((r) => r.kos);
  const real = kos.filter((k) => !k.sd);
  const dirs: Record<string, number> = {};
  for (const k of real) dirs[k.dir] = (dirs[k.dir] ?? 0) + 1;
  const med = (xs: number[]) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] : 0);
  const secs = rs.map((r) => r.ticks / 60);
  return {
    games: rs.length,
    medianSec: Math.round(med(secs)),
    maxSec: Math.round(Math.max(...secs)),
    timeouts: rs.filter((r) => r.winner < 0).length,
    medianKoPct: Math.round(med(real.map((k) => k.pct))),
    earlyKos: real.filter((k) => k.pct < 80).length,
    sdRate: +(kos.filter((k) => k.sd).length / Math.max(1, kos.length)).toFixed(2),
    secPerKo: +(secs.reduce((a, b) => a + b, 0) / Math.max(1, kos.length)).toFixed(1),
    dmgPerMin: Math.round(rs.reduce((a, r) => a + r.dealt.reduce((x, y) => x + y, 0), 0) / Math.max(1, secs.reduce((a, b) => a + b, 0) / 60)),
    dirs,
    p1WinRate: +(rs.filter((r) => r.winner === 0).length / Math.max(1, rs.filter((r) => r.winner >= 0).length)).toFixed(2),
  };
}

describe.skipIf(!ON)('stage audit', () => {
  it('measures every stage', () => {
    const out: Record<string, unknown> = {};
    for (const st of STAGE_LIST) {
      const one: MatchResult[] = [];
      for (let g = 0; g < N; g++) {
        const a = ids[g % ids.length];
        const b = ids[(g * 7 + 3) % ids.length] === a ? ids[(g + 1) % ids.length] : ids[(g * 7 + 3) % ids.length];
        one.push(playMatch([a, b], st.id, 3, 500 + g, { skills: [SKILL, SKILL], maxTicks: 60 * 60 * 6 }));
      }
      const four: MatchResult[] = [];
      if (st.spawns.length >= 4)
        for (let g = 0; g < Math.max(2, N / 4); g++) {
          const pick = [0, 1, 2, 3].map((k) => ids[(g * 4 + k * 3) % ids.length]);
          if (new Set(pick).size < 4) pick[3] = ids.find((c) => !pick.includes(c))!;
          four.push(playMatch(pick, st.id, 3, 900 + g, { skills: [SKILL, SKILL, SKILL, SKILL], maxTicks: 60 * 60 * 8 }));
        }
      out[st.id] = { name: st.name, oneVone: summarise(one), ffa: four.length ? summarise(four) : null };
      console.log(st.id, JSON.stringify(out[st.id]));
    }
    if (process.env.STAGEAUDIT_OUT) writeFileSync(process.env.STAGEAUDIT_OUT, JSON.stringify(out, null, 1));
  }, 3_600_000);
});
