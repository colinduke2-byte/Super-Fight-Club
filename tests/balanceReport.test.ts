import { writeFileSync } from 'node:fs';
import { describe, it } from 'vitest';
import { CHARACTER_AI, type CpuLevel } from '../src/ai/profiles';
import { CHARACTERS } from '../src/characters';
import { competitiveStages, type KoRecord, type MatchResult, playMatch } from './tools/matchSim';

/**
 * CPU-vs-CPU balance report. Skipped unless BALANCE=1:
 *
 *   BALANCE=1 npx vitest run tests/balanceReport.test.ts                  prints the report (and writes $BALANCE_OUT if set)
 *   BALANCE=1 BALANCE_WRITE=1 npx vitest run tests/balanceReport.test.ts  also regenerates docs/balance-report.md
 *
 * Knobs: BALANCE_SEEDS (1v1 matches per pairing per side, default 4; the stage rotates through every competitive stage),
 * BALANCE_FFA (4-player free-for-alls, default 60; 0 = skip), BALANCE_LEVELS (CPU levels, default 3; e.g. "3,2"),
 * BALANCE_ONLY=nova,vex (only those fighters' pairings), BALANCE_JSON=path (raw per-match results), BALANCE_PATCH (below).
 *
 * Runtime: about 1 minute per CPU level at the defaults (4 cores).
 *
 * It measures the roster as the CPU plays it (so it under-rates styles the AI plays badly); use it to spot outliers and
 * to watch how matches end (KO percent, top/side/bottom split, self-destructs), not as proof of human balance.
 */

/** Dev tuning: BALANCE_PATCH='{"vex.stats.weight":90,"brick.moves.usmash.armor.threshold":8}' sets values at runtime; a key ending in * multiplies; '#' walks an array, '*' every value of an object (e.g. nova.moves.*.hitboxes.#.damage*). */
function applyPatch(): void {
  const raw = process.env.BALANCE_PATCH;
  if (!raw) return;
  for (const [key, val] of Object.entries(JSON.parse(raw) as Record<string, number | string>)) {
    const mul = key.endsWith('*');
    const path = (mul ? key.slice(0, -1) : key).split('.');
    const expand = (obj: any, rest: string[]): void => {
      const [head, ...tail] = rest;
      if (head === '#') {
        for (const item of Array.isArray(obj) ? obj : []) expand(item, tail);
        return;
      }
      if (head === '*') {
        for (const item of Object.values(obj ?? {})) expand(item, tail);
        return;
      }
      if (tail.length === 0) obj[head] = mul ? obj[head] * (val as number) : val;
      else expand(obj[head], tail);
    };
    if (path[0] === 'ai') expand(CHARACTER_AI, path.slice(1));
    else expand(CHARACTERS, path);
  }
}

const SEEDS = Number(process.env.BALANCE_SEEDS ?? 4);
const FFA = Number(process.env.BALANCE_FFA ?? 60);
const LEVELS = (process.env.BALANCE_LEVELS ?? '3').split(',').map(Number) as CpuLevel[];

interface Tally {
  games: number;
  wins: number;
  /** KOs this fighter scored. */
  scored: KoRecord[];
  /** Times this fighter died (KO'd or self-destructed). */
  died: KoRecord[];
  ults: number;
}

const median = (xs: number[]): string => {
  if (!xs.length) return '-';
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
  return `${Math.round(m)}%`;
};
const pct = (n: number, d: number): string => (d ? `${Math.round((100 * n) / d)}%` : '-');
const split = (ks: KoRecord[]): string => {
  const n = ks.length;
  const c = (d: string): number => ks.filter((k) => k.dir === d).length;
  return n ? `${pct(c('top'), n)} / ${pct(c('side'), n)} / ${pct(c('bottom'), n)}` : '-';
};

function tally(ids: string[], results: MatchResult[]): Record<string, Tally> {
  const t: Record<string, Tally> = Object.fromEntries(ids.map((c) => [c, { games: 0, wins: 0, scored: [], died: [], ults: 0 }]));
  for (const r of results) {
    r.chars.forEach((c, i) => {
      t[c].games++;
      if (r.winner === i) t[c].wins++;
      t[c].ults += r.ults[i];
    });
    for (const k of r.kos) {
      t[k.victim].died.push(k);
      if (k.killer) t[k.killer].scored.push(k);
    }
  }
  return t;
}

function section(title: string, ids: string[], results: MatchResult[], winNote: string): string {
  const t = tally(ids, results);
  const all = results.flatMap((r) => r.kos);
  const real = all.filter((k) => !k.sd);
  const secs = results.map((r) => r.ticks / 60);
  let md = `### ${title}\n\n${results.length} matches, mean length ${Math.round(secs.reduce((a, b) => a + b, 0) / (secs.length || 1))} s, ${results.filter((r) => r.winner < 0).length} draws / time-outs.\n\n`;
  md += `**All KOs** (excluding self-destructs): ${real.length}, median KO percent **${median(real.map((k) => k.pct))}**, top / side / bottom **${split(real)}**, by ultimate ${pct(real.filter((k) => k.ult).length, real.length)}. Self-destructs: ${pct(all.length - real.length, all.length)} of all falls.\n\n`;
  md += `| fighter | win rate${winNote} | KOs scored / match | median KO % (scored) | KO dir top / side / bottom (scored) | ult KO share | died at (median) | SD rate (of own falls) | ults used / match |\n|---|---:|---:|---:|---|---:|---:|---:|---:|\n`;
  for (const c of ids) {
    const x = t[c];
    if (!x.games) continue;
    const sds = x.died.filter((k) => k.sd).length;
    md += `| ${c} | ${pct(x.wins, x.games)} | ${(x.scored.length / x.games).toFixed(2)} | ${median(x.scored.map((k) => k.pct))} | ${split(x.scored)} | ${pct(x.scored.filter((k) => k.ult).length, x.scored.length)} | ${median(x.died.filter((k) => !k.sd).map((k) => k.pct))} | ${pct(sds, x.died.length)} | ${(x.ults / x.games).toFixed(2)} |\n`;
  }
  return md + '\n';
}

describe.skipIf(!process.env.BALANCE)('balance report', () => {
  it('1v1 round robin + 4-player FFA over every competitive stage', () => {
    applyPatch();
    const ids = Object.keys(CHARACTERS).filter((c) => c !== 'overseer');
    const stages1 = competitiveStages(2);
    const stages4 = competitiveStages(4);
    const focus = process.env.BALANCE_ONLY?.split(',');
    const json: Record<string, MatchResult[]> = {};
    let md = `# CPU-vs-CPU balance report\n\nGenerated by \`BALANCE=1 BALANCE_WRITE=1 BALANCE_SEEDS=${SEEDS} BALANCE_FFA=${FFA} npx vitest run tests/balanceReport.test.ts\` (3 stocks, no items).\n`;
    md += `1v1: every pairing plays ${SEEDS} seed(s) x both sides, the stage rotating through all ${stages1.length} competitive stages (${stages1.join(', ')}). FFA: ${FFA} four-player matches with rotating line-ups on ${stages4.join(', ')}.\n`;
    md += `The CPU plays some characters better than others, so read this as a smoke test for outliers, not as human balance.\n\n`;
    md += `Columns: **KO dir** is the blast zone of the KOs the fighter scored (bottom = a launched victim fell short of the stage); **ult KO share** is the share of its KOs whose last hit was its ultimate; **died at** is the median percent at which the fighter itself was KO'd (self-destructs excluded); **SD rate** counts its falls with no hit taken in the last 4 s.\n\n`;
    for (const level of LEVELS) {
      md += `## CPU level ${level}\n\n`;
      // ---- 1v1 ----
      const duels: MatchResult[] = [];
      const pairs: string[] = [];
      let p = 0;
      for (let i = 0; i < ids.length; i++) {
        for (let j = i + 1; j < ids.length; j++, p++) {
          if (focus && !focus.includes(ids[i]) && !focus.includes(ids[j])) continue;
          let wa = 0;
          let wb = 0;
          for (let seed = 0; seed < SEEDS; seed++) {
            const stage = stages1[(p * 3 + seed) % stages1.length];
            for (const flip of [false, true]) {
              const pair = flip ? [ids[j], ids[i]] : [ids[i], ids[j]];
              const r = playMatch(pair, stage, level, seed);
              duels.push(r);
              if (r.winner < 0) continue;
              if (pair[r.winner] === ids[i]) wa++;
              else wb++;
            }
          }
          pairs.push(`| ${ids[i]} vs ${ids[j]} | ${wa} - ${wb} |`);
        }
      }
      md += section('1v1', ids, duels, ' (50% = even)');
      // ---- FFA ----
      const ffas: MatchResult[] = [];
      for (let g = 0; g < FFA; g++) {
        // rotate line-ups so every fighter appears equally often against varied company
        const pick: string[] = [];
        for (let k = 0; pick.length < 4; k++) {
          const c = ids[(g * 4 + k * 3 + Math.floor(g / ids.length)) % ids.length];
          if (!pick.includes(c)) pick.push(c);
        }
        ffas.push(playMatch(pick, stages4[g % stages4.length], level, 1000 + g));
      }
      if (FFA > 0) md += section('4-player free-for-all', ids, ffas, ' (25% = even)');
      md += `<details><summary>1v1 pairings (wins - wins)</summary>\n\n| pairing | wins |\n|---|---|\n${pairs.join('\n')}\n\n</details>\n\n`;
      json[`l${level}-1v1`] = duels;
      json[`l${level}-ffa`] = ffas;
    }
    if (process.env.BALANCE_OUT) writeFileSync(process.env.BALANCE_OUT, md);
    if (process.env.BALANCE_WRITE) writeFileSync('docs/balance-report.md', md);
    if (process.env.BALANCE_JSON) writeFileSync(process.env.BALANCE_JSON, JSON.stringify(json));
    if (!process.env.BALANCE_OUT && !process.env.BALANCE_WRITE) console.log(md);
  }, 7_200_000);
});
