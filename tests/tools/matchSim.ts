/**
 * Headless CPU-vs-CPU stock matches with KO bookkeeping, shared by the balance report and anyone else who wants to
 * measure how matches actually play out (who wins, how and when fighters die).
 */
import { CpuController } from '../../src/ai/cpu';
import type { CpuLevel } from '../../src/ai/profiles';
import { CHARACTERS } from '../../src/characters';
import { makeInput } from '../../src/engine/buttons';
import { Fighter } from '../../src/engine/fighter';
import { Match } from '../../src/engine/match';
import { World } from '../../src/engine/world';
import { STAGE_LIST, STAGES } from '../../src/stages';

export type KoDir = 'top' | 'side' | 'bottom';

/** A KO with no hit taken within this many ticks counts as a self-destruct. */
export const SD_WINDOW = 240;

export interface KoRecord {
  victim: string;
  /** Character credited with the KO (last fighter to hit the victim), or null for a self-destruct. */
  killer: string | null;
  /** Fighter index of the killer (or -1). */
  killerIdx: number;
  victimIdx: number;
  dir: KoDir;
  /** Victim's damage percent when it left the blast zone. */
  pct: number;
  sd: boolean;
  /** The killing hit came from the killer's ultimate. */
  ult: boolean;
  /** Id of the move that last hit the victim ('' if unknown). */
  move: string;
  tick: number;
}

export interface MatchResult {
  chars: string[];
  stage: string;
  /** Winning fighter index, -1 for a draw / time out. */
  winner: number;
  ticks: number;
  kos: KoRecord[];
  /** Ultimates started per fighter. */
  ults: number[];
}

/** Stages offered in Stage Select (competitive rotation). */
export const competitiveStages = (players = 2): string[] => STAGE_LIST.filter((s) => s.spawns.length >= players).map((s) => s.id);

export function playMatch(chars: string[], stage: string, level: CpuLevel | CpuLevel[], seed: number, opts: { stocks?: number; maxTicks?: number; items?: number } = {}): MatchResult {
  const st = STAGES[stage];
  const world = new World(st);
  if (opts.items !== undefined) world.config.itemRate = opts.items;
  const fs = chars.map((c, i) => new Fighter(i, CHARACTERS[c]));
  fs.forEach((f) => world.addFighter(f));
  const match = new Match(world, { mode: 'stock', stocks: opts.stocks ?? 3, timeLimitSec: 0, respawnDelay: 70 });
  const sp = st.spawns;
  const place = (f: Fighter, air = false): void => f.spawn(sp[f.id].x, sp[f.id].y - (air ? 130 : 1), sp[f.id].x <= 0 ? 1 : -1);
  fs.forEach((f) => place(f));
  match.onRespawn = (f) => place(f, true);
  const lastHitTick = fs.map(() => -1e9);
  const lastHitUlt = fs.map(() => false);
  const lastHitMove = fs.map(() => '');
  const ults = fs.map(() => 0);
  const kos: KoRecord[] = [];
  let tick = 0;
  const b = world.blast;
  world.listener = (type, f, _x, _y, _m, extra) => {
    if (type === 'hit' || type === 'cinematicHit' || type === 'armorHit') {
      lastHitTick[f.id] = tick;
      const atk = world.fighters[f.lastHitBy];
      const cine = world.cinematic?.victim === f ? world.cinematic.move : null;
      const mv = cine ?? (atk && atk !== f ? atk.move : null);
      lastHitMove[f.id] = mv?.id ?? '';
      lastHitUlt[f.id] = mv?.kind === 'ultimate';
    }
    if (type === 'moveStart' && f.move?.kind === 'ultimate') ults[f.id]++;
    if (type === 'ko') {
      if (!match.over) {
        const sd = tick - lastHitTick[f.id] > SD_WINDOW || extra < 0 || extra === f.id;
        const dir: KoDir = f.koY < b.top ? 'top' : f.koY - f.h > b.bottom ? 'bottom' : 'side';
        kos.push({
          victim: chars[f.id],
          victimIdx: f.id,
          killer: sd ? null : chars[extra],
          killerIdx: sd ? -1 : extra,
          dir,
          pct: Math.round(f.damage),
          sd,
          ult: !sd && lastHitUlt[f.id],
          move: sd ? '' : lastHitMove[f.id],
          tick,
        });
      }
      match.onKo(f, extra);
    }
  };
  const lv = Array.isArray(level) ? level : chars.map(() => level);
  const cpus = chars.map((_, i) => new CpuController(lv[i], seed * 7 + i + 1));
  const ins = fs.map(() => makeInput());
  const lim = opts.maxTicks ?? 14400;
  for (; tick < lim && !match.over; tick++) {
    fs.forEach((f, i) => cpus[i].update(f, world, ins[i]));
    world.step(ins);
    match.step();
  }
  return { chars, stage, winner: match.over ? match.winner : -1, ticks: tick, kos, ults };
}
