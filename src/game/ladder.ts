import { paletteCount } from '../art/palettes';
import { CHARACTER_LIST } from '../characters';
import { levelForSkill, type CpuLevel } from './lobby';
import { recordArcadeClear, type ArcadeClearOutcome } from './records';
import type { MatchResult, PlayerSlot } from './session';

export interface LadderOpponent {
  /** Roster id, or `overseer` for the boss. */
  character: string;
  level: CpuLevel;
  /** CPU skill 1..9 for this run's difficulty (absent = the level's own). */
  skill?: number;
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
  /** The rival is a copy of the player's own fighter. */
  mirror?: boolean;
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
  /** Difficulty the run is played at (1 easy .. 4 very hard; absent = normal, 2): CPU skill per fight, the score and the records. */
  difficulty?: ArcadeDifficulty;
  /** Set when the run is cleared: the final score and what it improved in the arcade records (for the ending / results). */
  clear?: ArcadeClearOutcome;
  /** The last result applied and what it led to (applying the same result again, after watching its replay, changes nothing). */
  applied?: { result: MatchResult | null; outcome: LadderOutcome };
}

/** Arcade difficulty: 1 easy, 2 normal, 3 hard, 4 very hard. */
export type ArcadeDifficulty = 1 | 2 | 3 | 4;
export const ARCADE_DIFFICULTIES: readonly ArcadeDifficulty[] = [1, 2, 3, 4];
export const DIFFICULTY_NAMES = ['', 'EASY', 'NORMAL', 'HARD', 'VERY HARD'] as const;

/**
 * CPU skill (1..9) of the lead rival in each of the nine fights, per difficulty: every curve climbs through the run, so
 * the early fights warm up and the brawl is the stiffest test before the boss. (The boss runs its own script.)
 */
export const SKILL_CURVES: Record<ArcadeDifficulty, readonly number[]> = {
  1: [1, 1, 2, 2, 2, 3, 3, 4, 4],
  2: [2, 3, 4, 4, 5, 5, 6, 6, 7],
  3: [4, 5, 6, 6, 7, 7, 8, 8, 9],
  4: [6, 7, 8, 8, 9, 9, 9, 9, 9],
};

/** The Overseer's stocks per difficulty (phase 2 is its last stock). */
const BOSS_STOCKS: Record<ArcadeDifficulty, number> = { 1: 2, 2: 2, 3: 2, 4: 3 };

/** Clamp anything to a valid difficulty (normal when unreadable). */
export function toDifficulty(v: unknown): ArcadeDifficulty {
  const n = Math.round(Number(v));
  return n >= 1 && n <= 4 ? (n as ArcadeDifficulty) : 2;
}

/** The run's difficulty (normal unless the run says otherwise). */
export function ladderDifficulty(state: LadderState): ArcadeDifficulty {
  return toDifficulty(state.difficulty ?? 2);
}

/**
 * CPU skill of a rival: the fight's step on the difficulty curve; in a brawl the second and third rivals play one step
 * below the lead (three at once at full skill is a wall, not a fight).
 */
export function fightSkill(difficulty: ArcadeDifficulty, fightIndex: number, rank = 0): number {
  const curve = SKILL_CURVES[toDifficulty(difficulty)];
  const base = curve[Math.max(0, Math.min(curve.length - 1, fightIndex))];
  return Math.max(1, Math.min(9, base - (rank > 0 ? 1 : 0)));
}

/** The difficulty can still be changed: no fight of the run has been played yet. */
export function canPickDifficulty(state: LadderState): boolean {
  return state.index === 0 && state.continuesUsed === 0 && !state.clear;
}

/** Set the run's difficulty (only before the first fight): every rival's skill and the boss's stocks follow it. */
export function setLadderDifficulty(state: LadderState, d: ArcadeDifficulty): boolean {
  if (!canPickDifficulty(state)) return false;
  state.difficulty = toDifficulty(d);
  applyDifficulty(state);
  return true;
}

function applyDifficulty(state: LadderState): void {
  const d = ladderDifficulty(state);
  for (const f of state.fights) {
    f.opponents.forEach((o, i) => {
      if (o.boss) {
        o.stocks = BOSS_STOCKS[d];
        return;
      }
      o.skill = fightSkill(d, f.index, i);
      o.level = levelForSkill(o.skill);
    });
  }
}

/** localStorage key of the last arcade difficulty picked (the next run starts on it). */
export const DIFFICULTY_KEY = 'sfc.arcadeDifficulty';

/** The difficulty picked last time (normal when none). */
export function lastDifficulty(): ArcadeDifficulty {
  try {
    return toDifficulty(typeof localStorage === 'undefined' ? null : (localStorage.getItem(DIFFICULTY_KEY) ?? 2));
  } catch {
    return 2;
  }
}

export function rememberDifficulty(d: ArcadeDifficulty): void {
  try {
    localStorage.setItem(DIFFICULTY_KEY, String(toDifficulty(d)));
  } catch {
    /* storage blocked: the pick lasts for this run */
  }
}

export const LADDER_CONTINUES = 3;

/**
 * Eight escalating fights then the boss: three duels against other roster fighters, a mirror match, three more duels
 * (the cave, the mountain pass, the sky raid), a brawl against the rivals not met yet (so a run meets the whole
 * roster), then the Overseer. The rival order is
 * shuffled per run (`rand` for tests).
 */
export function buildLadder(player: string, rand: () => number = Math.random, difficulty: ArcadeDifficulty = lastDifficulty()): LadderState {
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
    { index: 3, title: 'SHADOW MATCH', stage: 'storm', kind: 'duel', opponents: [{ character: player, level: 2, stocks: 3 }], playerStocks: 3, mirror: true },
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
  const state: LadderState = { player, fights, index: 0, continuesLeft: LADDER_CONTINUES, continuesUsed: 0, kos: 0, seconds: 0, introduced: false, difficulty: toDifficulty(difficulty) };
  applyDifficulty(state);
  return state;
}

export function currentFight(state: LadderState): LadderFight {
  return state.fights[Math.min(state.index, state.fights.length - 1)];
}

/** Player slot first, then each opponent as a CPU (or the boss) with its handicap stocks. */
export function slotsForFight(state: LadderState, human: PlayerSlot): PlayerSlot[] {
  const f = currentFight(state);
  const slots: PlayerSlot[] = [{ ...human, index: 0, stocks: f.playerStocks }];
  f.opponents.forEach((o, i) => {
    const skill = o.boss ? undefined : (o.skill ?? fightSkill(ladderDifficulty(state), f.index, i));
    slots.push({ index: i + 1, type: 'cpu', device: null, character: o.character, cpuLevel: skill ? levelForSkill(skill) : o.level, cpuSkill: skill, stocks: o.stocks, boss: o.boss, palette: o.palette });
  });
  return slots;
}

export type LadderOutcome = 'next' | 'retry' | 'champion' | 'gameover';

/**
 * Record a finished fight. Win: advance (or `champion` after the boss). Loss: spend a continue and retry the same
 * fight, or `gameover` when none are left. Mutates `state`.
 */
/**
 * The Results screen's entry point: applies a finished fight once. Shown again for the same result (back from watching
 * its replay), it returns what that result already led to and changes nothing.
 */
export function ladderOutcomeFor(state: LadderState, result: MatchResult | null): LadderOutcome {
  if (result && state.applied?.result === result) return state.applied.outcome;
  const outcome = applyLadderResult(state, result);
  state.applied = { result, outcome };
  return outcome;
}

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

/**
 * After GAME OVER: carry on from the same fight. Each such continue counts against the score like any other. `player`
 * switches fighter (the mirror match, if still ahead, mirrors the new one); `easier` drops the difficulty one step (the
 * run then scores and records at the lower one). Returns false when there is nothing to continue.
 */
export function continueLadder(state: LadderState, opts: { player?: string; easier?: boolean } = {}): boolean {
  if (state.index >= state.fights.length || state.clear) return false;
  if (opts.easier) {
    const d = ladderDifficulty(state);
    if (d <= 1) return false;
    state.difficulty = (d - 1) as ArcadeDifficulty;
    applyDifficulty(state);
  }
  if (opts.player && opts.player !== state.player) {
    const old = state.player;
    for (const f of state.fights) if (f.index >= state.index) if (f.mirror) for (const o of f.opponents) if (o.character === old) o.character = opts.player;
    state.player = opts.player;
  }
  state.continuesUsed++;
  state.applied = undefined;
  return true;
}
