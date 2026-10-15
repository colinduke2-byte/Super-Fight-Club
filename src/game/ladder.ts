import { paletteCount } from '../art/palettes';
import { CHARACTER_LIST } from '../characters';
import type { CpuLevel } from './lobby';
import { recordArcadeClear, type ArcadeClearOutcome } from './records';
import type { MatchResult, PlayerSlot } from './session';

export interface LadderOpponent {
  /** Roster id, or `overseer` for the boss. */
  character: string;
  level: CpuLevel;
  stocks: number;
  boss?: boolean;
  /** Outfit / colour the rival wears this run (rolled per run; the mirror match is bumped off the player's look). */
  palette?: number;
}

export interface LadderFight {
  index: number;
  title: string;
  stage: string;
  kind: 'duel' | 'brawl' | 'boss';
  opponents: LadderOpponent[];
  playerStocks: number;
}

export interface LadderState {
  player: string;
  fights: LadderFight[];
  /** Index of the fight to play next. */
  index: number;
  continuesLeft: number;
  continuesUsed: number;
  /** Totals over won fights, for the ending screen. */
  kos: number;
  seconds: number;
  /** The player has seen the intro card. */
  introduced: boolean;
  /** CPU level the run is played at, for the score and the records (absent = normal, 2). */
  difficulty?: CpuLevel;
  /** Set when the run is cleared: the final score and what it improved in the arcade records (for the ending / results). */
  clear?: ArcadeClearOutcome;
}

/** The run's difficulty (normal unless the run says otherwise). */
export function ladderDifficulty(state: LadderState): CpuLevel {
  return state.difficulty ?? 2;
}

export const LADDER_CONTINUES = 3;

/**
 * Eight escalating fights then the boss: three duels against other roster fighters, a mirror match, three more duels
 * (the cave, the mountain pass, the sky raid), a brawl against the rivals not met yet (so a run meets the whole
 * roster), then the Overseer. The rival order is
 * shuffled per run (`rand` for tests).
 */
export function buildLadder(player: string, rand: () => number = Math.random): LadderState {
  const others = CHARACTER_LIST.map((c) => c.id).filter((id) => id !== player);
  for (let i = others.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [others[i], others[j]] = [others[j], others[i]];
  }
  const [a, b, c] = others;
  // the brawl brings in whoever is left; a small roster reuses the first two
  const d = others[3] ?? a;
  const e = others[4] ?? b;
  // a big enough roster sends a third rival into the brawl and a seventh into the cave, so every run still meets everyone
  const f = others[5];
  const g = others[6] ?? c;
  // the mountain pass and the sky raid bring in the last two rivals of a full roster
  const h = others[7] ?? a;
  const i8 = others[8] ?? b;
  const fights: LadderFight[] = [
    { index: 0, title: 'OPENING BOUT', stage: 'classic', kind: 'duel', opponents: [{ character: a, level: 1, stocks: 2 }], playerStocks: 3 },
    { index: 1, title: 'LOW TIDE', stage: 'wreck', kind: 'duel', opponents: [{ character: b, level: 1, stocks: 2 }], playerStocks: 3 },
    { index: 2, title: 'THE CIRCUIT', stage: 'temple', kind: 'duel', opponents: [{ character: c, level: 2, stocks: 3 }], playerStocks: 3 },
    { index: 3, title: 'SHADOW MATCH', stage: 'storm', kind: 'duel', opponents: [{ character: player, level: 2, stocks: 3 }], playerStocks: 3 },
    { index: 4, title: 'DEEP DARK', stage: 'hollow', kind: 'duel', opponents: [{ character: g, level: 2, stocks: 3 }], playerStocks: 3 },
    { index: 5, title: 'AVALANCHE PASS', stage: 'frostfang', kind: 'duel', opponents: [{ character: h, level: 2, stocks: 3 }], playerStocks: 3 },
    { index: 6, title: 'SKY RAID', stage: 'stormrunner', kind: 'duel', opponents: [{ character: i8, level: 3, stocks: 3 }], playerStocks: 3 },
    {
      index: 7,
      title: f ? 'FOUR-WAY BRAWL' : 'TRIPLE THREAT',
      stage: 'skyhold',
      kind: 'brawl',
      opponents: [
        { character: d, level: 3, stocks: 2 },
        { character: e, level: 2, stocks: 2 },
        ...(f ? [{ character: f, level: 2 as const, stocks: 1 }] : []),
      ],
      playerStocks: 3,
    },
    { index: 8, title: 'THE OVERSEER', stage: 'apex', kind: 'boss', opponents: [{ character: 'overseer', level: 3, stocks: 2, boss: true }], playerStocks: 3 },
  ];
  // every rival wears a random look this run, so the ladder shows off the outfits
  for (const f of fights) for (const o of f.opponents) if (!o.boss) o.palette = Math.floor(rand() * paletteCount(o.character));
  return { player, fights, index: 0, continuesLeft: LADDER_CONTINUES, continuesUsed: 0, kos: 0, seconds: 0, introduced: false };
}

export function currentFight(state: LadderState): LadderFight {
  return state.fights[Math.min(state.index, state.fights.length - 1)];
}

/** Player slot first, then each opponent as a CPU (or the boss) with its handicap stocks. */
export function slotsForFight(state: LadderState, human: PlayerSlot): PlayerSlot[] {
  const f = currentFight(state);
  const slots: PlayerSlot[] = [{ ...human, index: 0, stocks: f.playerStocks }];
  f.opponents.forEach((o, i) => {
    slots.push({ index: i + 1, type: 'cpu', device: null, character: o.character, cpuLevel: o.level, stocks: o.stocks, boss: o.boss, palette: o.palette });
  });
  return slots;
}

export type LadderOutcome = 'next' | 'retry' | 'champion' | 'gameover';

/**
 * Record a finished fight. Win: advance (or `champion` after the boss). Loss: spend a continue and retry the same
 * fight, or `gameover` when none are left. Mutates `state`.
 */
export function applyLadderResult(state: LadderState, result: MatchResult | null): LadderOutcome {
  const won = !!result && result.winner === 0;
  if (won) {
    const mine = result!.players.find((p) => p.index === 0);
    state.kos += mine?.kos ?? 0;
    state.seconds += result!.durationSec;
    state.index++;
    if (state.index < state.fights.length) return 'next';
    // cleared: score the run and keep it in the arcade records (once per run)
    state.clear ??= recordArcadeClear(state.player, { kos: state.kos, seconds: state.seconds, continuesUsed: state.continuesUsed, difficulty: ladderDifficulty(state) });
    return 'champion';
  }
  if (state.continuesLeft <= 0) return 'gameover';
  state.continuesLeft--;
  state.continuesUsed++;
  return 'retry';
}
