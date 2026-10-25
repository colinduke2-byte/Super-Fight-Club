import { writeFileSync } from 'node:fs';
import { describe, it } from 'vitest';
import { CHARACTERS } from '../../src/characters';
import { killPercent, NEVER, recoveryTable } from './killProbe';
import { competitiveStages, type KoRecord, playMatch } from './matchSim';

/**
 * Recovery measurements (skipped unless RECREPORT is set; JSON to stdout or $RECREPORT_OUT):
 *
 *   RECREPORT=reach   recovery reach per fighter (recoveryTable: px from the ledge, level / 60 px below, with and without jumps)
 *   RECREPORT=launch  the best-recovery KO percent of common side launches (Halcyon's f-smash, back air and forward throw,
 *                     from centre and from the ledge) against every fighter: where a well-played recovery starts failing
 *   RECREPORT=sim     CPU round robins (RECREPORT_SKILLS, default 5,9): per-fighter median death percent, bottom-KO share
 *
 * RECREPORT_ONLY=a,b limits the fighters.
 */
const MODE = process.env.RECREPORT ?? '';
const ONLY = process.env.RECREPORT_ONLY?.split(',');
const ids = Object.keys(CHARACTERS).filter((c) => c !== 'overseer' && (!ONLY || ONLY.includes(c)));

const median = (xs: number[]): number => {
  const s = xs.slice().sort((a, b) => a - b);
  if (!s.length) return NaN;
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

function emit(o: unknown): void {
  const s = JSON.stringify(o, null, 1);
  if (process.env.RECREPORT_OUT) writeFileSync(process.env.RECREPORT_OUT, s);
  else process.stdout.write(`${s}\n`);
}

function simSummary(skill: number): object {
  const st = competitiveStages(2);
  const all = Object.keys(CHARACTERS).filter((c) => c !== 'overseer');
  const kos: KoRecord[] = [];
  let p = 0;
  for (let i = 0; i < all.length; i++)
    for (let j = i + 1; j < all.length; j++, p++)
      for (const flip of [false, true]) {
        const pair = flip ? [all[j], all[i]] : [all[i], all[j]];
        kos.push(...playMatch(pair, st[(p * 3) % st.length], 3, skill * 100, { skills: [skill, skill] }).kos);
      }
  const per: Record<string, object> = {};
  for (const c of ids) {
    const k = kos.filter((x) => x.victim === c);
    per[c] = { deaths: k.length, medianPct: median(k.map((x) => x.pct)), bottom: +(k.filter((x) => x.dir === 'bottom').length / Math.max(1, k.length)).toFixed(2), sd: k.filter((x) => x.sd).length, under60: k.filter((x) => x.pct < 60).length };
  }
  return {
    deaths: kos.length,
    medianPct: median(kos.map((x) => x.pct)),
    bottomShare: +(kos.filter((x) => x.dir === 'bottom').length / kos.length).toFixed(3),
    bottomNotSd: +(kos.filter((x) => x.dir === 'bottom' && !x.sd).length / kos.length).toFixed(3),
    sdShare: +(kos.filter((x) => x.sd).length / kos.length).toFixed(3),
    under80: +(kos.filter((x) => x.pct < 80).length / kos.length).toFixed(3),
    perFighter: per,
  };
}

describe.skipIf(!MODE)('recovery report', () => {
  it(MODE || 'report', () => {
    const out: Record<string, unknown> = {};
    if (MODE === 'reach') out.reach = recoveryTable(ids);
    if (MODE === 'launch') {
      const rows: Record<string, Record<string, number>> = {};
      for (const v of ids) {
        rows[v] = {};
        for (const m of ['fsmash', 'bair', 'fthrow'])
          for (const pos of ['centre', 'ledge'] as const) {
            const r = killPercent('halcyon', m, v, { position: pos });
            rows[v][`${m}-${pos}`] = r.best === NEVER ? -1 : r.best;
            rows[v][`${m}-${pos}-strict`] = r.strict === NEVER ? -1 : r.strict;
          }
      }
      out.launch = rows;
    }
    if (MODE === 'sim') for (const s of (process.env.RECREPORT_SKILLS ?? '5,9').split(',').map(Number)) out[`skill${s}`] = simSummary(s);
    emit(out);
  }, 3_600_000);
});
