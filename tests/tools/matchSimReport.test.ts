import { writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CHARACTERS } from '../../src/characters';
import { competitiveStages, type KoRecord, type MatchResult, playMatch } from './matchSim';

/**
 * CPU measurement runs (skipped unless MATCHSIM is set). Results print as JSON (or go to $MATCHSIM_OUT):
 *
 *   MATCHSIM=sd MATCHSIM_SKILLS=1,5,9 npx vitest run tests/tools/matchSimReport.test.ts
 *       self-destruct rate by cause / failure / fighter from 1v1 round robins (+ MATCHSIM_FFA four-player games) per skill
 *   MATCHSIM=ladder npx vitest run tests/tools/matchSimReport.test.ts
 *       skill N vs skill N-1 for N = 2..9 (MATCHSIM_SEEDS matches per step, rotating fighters and stages)
 *   MATCHSIM=win MATCHSIM_SKILLS=9,5 npx vitest run tests/tools/matchSimReport.test.ts
 *       per-fighter win rates: 1v1 round robin + MATCHSIM_FFA four-player free-for-alls per skill
 *
 * MATCHSIM_LADDER=6,7 limits the ladder to those steps. MATCHSIM_SEEDS (default 1) sets matches per pairing and side; MATCHSIM_SHARD=i/n runs a slice of the 1v1 pairings.
 */
const MODE = process.env.MATCHSIM ?? '';
const SKILLS = (process.env.MATCHSIM_SKILLS ?? '1,5,9').split(',').map(Number);
const SEEDS = Number(process.env.MATCHSIM_SEEDS ?? 1);
const FFA = Number(process.env.MATCHSIM_FFA ?? 0);
const [SHARD, SHARDS] = (process.env.MATCHSIM_SHARD ?? '0/1').split('/').map(Number);
const ids = Object.keys(CHARACTERS).filter((c) => c !== 'overseer');

function roundRobin(skill: number): MatchResult[] {
  const st = competitiveStages(2);
  const out: MatchResult[] = [];
  let p = 0;
  for (let i = 0; i < ids.length; i++)
    for (let j = i + 1; j < ids.length; j++, p++) {
      if (p % SHARDS !== SHARD) continue;
      for (let seed = 0; seed < SEEDS; seed++)
        for (const flip of [false, true]) {
          const pair = flip ? [ids[j], ids[i]] : [ids[i], ids[j]];
          out.push(playMatch(pair, st[(p * 3 + seed) % st.length], 3, seed + skill * 100, { skills: [skill, skill] }));
        }
    }
  return out;
}

function ffa(skill: number, n: number): MatchResult[] {
  const st = competitiveStages(4);
  const out: MatchResult[] = [];
  for (let g = 0; g < n; g++) {
    if (g % SHARDS !== SHARD) continue;
    const pick: string[] = [];
    for (let k = 0; pick.length < 4; k++) {
      const c = ids[(g * 4 + k * 3 + Math.floor(g / ids.length)) % ids.length];
      if (!pick.includes(c)) pick.push(c);
    }
    out.push(playMatch(pick, st[g % st.length], 3, 1000 + g, { skills: [skill, skill, skill, skill] }));
  }
  return out;
}

const count = <T extends string>(xs: (T | undefined)[]): Record<string, number> => {
  const o: Record<string, number> = {};
  for (const x of xs) o[x ?? '?'] = (o[x ?? '?'] ?? 0) + 1;
  return o;
};

function sdSummary(rs: MatchResult[]): object {
  const kos: KoRecord[] = rs.flatMap((r) => r.kos);
  const sds = kos.filter((k) => k.sd);
  const per: Record<string, { falls: number; sd: number; causes: Record<string, number> }> = {};
  for (const k of kos) {
    const x = (per[k.victim] ??= { falls: 0, sd: 0, causes: {} });
    x.falls++;
    if (k.sd) {
      x.sd++;
      x.causes[`${k.cause}/${k.fail}`] = (x.causes[`${k.cause}/${k.fail}`] ?? 0) + 1;
    }
  }
  return {
    matches: rs.length,
    falls: kos.length,
    sd: sds.length,
    sdRate: +(sds.length / Math.max(1, kos.length)).toFixed(3),
    oldRuleSd: kos.filter((k) => k.sd240).length,
    relabelled: { oldSdNowKo: kos.filter((k) => k.sd240 && !k.sd).length, oldKoNowSd: kos.filter((k) => !k.sd240 && k.sd).length },
    byCause: count(sds.map((k) => k.cause)),
    byFail: count(sds.map((k) => k.fail)),
    perFighter: per,
  };
}

function winSummary(rs: MatchResult[]): Record<string, string> {
  const g: Record<string, number> = {};
  const w: Record<string, number> = {};
  for (const r of rs)
    r.chars.forEach((c, i) => {
      g[c] = (g[c] ?? 0) + 1;
      if (r.winner === i) w[c] = (w[c] ?? 0) + 1;
    });
  return Object.fromEntries(ids.map((c) => [c, `${Math.round((100 * (w[c] ?? 0)) / Math.max(1, g[c] ?? 0))}% (${w[c] ?? 0}/${g[c] ?? 0})`]));
}

function emit(o: unknown): void {
  const s = JSON.stringify(o, null, 1);
  if (process.env.MATCHSIM_OUT) writeFileSync(process.env.MATCHSIM_OUT, s);
  else console.log(s);
}

describe.skipIf(!MODE)('match simulation report', () => {
  it(MODE || 'report', () => {
    const t0 = Date.now();
    const out: Record<string, unknown> = {};
    if (MODE === 'sd' || MODE === 'win') {
      for (const s of SKILLS) {
        const duel = roundRobin(s);
        const four = FFA > 0 ? ffa(s, FFA) : [];
        out[`skill${s}`] = MODE === 'sd' ? { duel: sdSummary(duel), ffa: four.length ? sdSummary(four) : null, duelWins: winSummary(duel), ffaWins: four.length ? winSummary(four) : null } : { duel: winSummary(duel), ffa: four.length ? winSummary(four) : null, duelSd: (sdSummary(duel) as { sdRate: number }).sdRate, ffaSd: four.length ? (sdSummary(four) as { sdRate: number }).sdRate : null };
      }
    }
    if (MODE === 'ladder') {
      const st = competitiveStages(2);
      const only = process.env.MATCHSIM_LADDER?.split(',').map(Number);
      for (let n = 2; n <= 9; n++) {
        if (only && !only.includes(n)) continue;
        let hi = 0;
        let lo = 0;
        let draws = 0;
        for (let k = 0; k < SEEDS; k++) {
          if (k % SHARDS !== SHARD) continue;
          const a = ids[(k * 5 + n) % ids.length];
          const b = ids[(k * 3 + n * 2 + 1) % ids.length];
          const flip = k % 2 === 1;
          const chars = flip ? [b, a] : [a, b];
          const skills = flip ? [n - 1, n] : [n, n - 1];
          const r = playMatch(chars, st[k % st.length], 3, 500 + k + n * 37, { skills });
          if (r.winner < 0) draws++;
          else if (skills[r.winner] === n) hi++;
          else lo++;
        }
        out[`${n}v${n - 1}`] = { hi, lo, draws, rate: +(hi / Math.max(1, hi + lo)).toFixed(3) };
      }
    }
    out.seconds = Math.round((Date.now() - t0) / 1000);
    emit(out);
    expect(true).toBe(true);
  }, 14_400_000);
});
