import { CHARACTER_LIST } from '../characters';
import type { CpuLevel } from './lobby';
import type { MatchResult, PlayerSlot } from './session';

export interface LadderOpponent {
  /** Roster id, or `overseer` for the boss. */
  character: string;
  level: CpuLevel;
  stocks: number;
  boss?: boolean;
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
}

export const LADDER_CONTINUES = 3;

/**
 * Five escalating fights then the boss: three duels against other roster fighters, a mirror match, a two-on-one
 * brawl against the two rivals not met yet (so a run meets the whole roster), then the Overseer. The rival order is
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
  // a big enough roster sends a third rival into the brawl, so every run still meets everyone
  const f = others[5];
  const fights: LadderFight[] = [
    { index: 0, title: 'OPENING BOUT', stage: 'classic', kind: 'duel', opponents: [{ character: a, level: 1, stocks: 2 }], playerStocks: 3 },
    { index: 1, title: 'LOW TIDE', stage: 'wreck', kind: 'duel', opponents: [{ character: b, level: 1, stocks: 2 }], playerStocks: 3 },
    { index: 2, title: 'THE CIRCUIT', stage: 'temple', kind: 'duel', opponents: [{ character: c, level: 2, stocks: 3 }], playerStocks: 3 },
    { index: 3, title: 'SHADOW MATCH', stage: 'storm', kind: 'duel', opponents: [{ character: player, level: 2, stocks: 3 }], playerStocks: 3 },
    {
      index: 4,
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
    { index: 5, title: 'THE OVERSEER', stage: 'reactor', kind: 'boss', opponents: [{ character: 'overseer', level: 3, stocks: 2, boss: true }], playerStocks: 3 },
  ];
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
    slots.push({ index: i + 1, type: 'cpu', device: null, character: o.character, cpuLevel: o.level, stocks: o.stocks, boss: o.boss });
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
    return state.index >= state.fights.length ? 'champion' : 'next';
  }
  if (state.continuesLeft <= 0) return 'gameover';
  state.continuesLeft--;
  state.continuesUsed++;
  return 'retry';
}
