import type { InputDevice } from '../input/device';
import type { LadderState } from './ladder';
import type { CpuLevel } from './lobby';

export type GameMode = 'versus' | 'arcade' | 'training' | 'targets' | 'launch';

/** The last Target Smash run (for the results screen). */
export interface TargetRun {
  character: string;
  ticks: number;
  cleared: boolean;
  broken: number;
  total: number;
  best: number | null;
  record: boolean;
}

export interface LaunchRun {
  character: string;
  /** Metres reached (0 = never sent off). */
  distance: number;
  /** Damage on the dummy when it was launched. */
  damage: number;
  best: number | null;
  record: boolean;
}

export interface PlayerSlot {
  index: number;
  type: 'human' | 'cpu';
  /** Human players only. Null if it was never assigned or has been unplugged. */
  device: InputDevice | null;
  /** Roster id (CHARACTERS key). */
  character: string;
  cpuLevel: CpuLevel;
  /** Starting stocks for this slot (arcade handicaps / boss life); default = the match rules. */
  stocks?: number;
  /** Driven by the scripted boss brain instead of a CPU. */
  boss?: boolean;
  /** Colour palette (0 = the fighter's own); duplicates in a match are bumped to a free one. */
  palette?: number;
}

export interface MatchRules {
  mode: 'stock' | 'time' | 'stamina';
  /** Stamina mode: hit points each fighter starts a stock with. */
  staminaHp: number;
  stocks: number;
  timeSec: number;
  /** 2v2 team battle (4 players): P1+P2 vs P3+P4, no friendly fire. */
  teams: boolean;
  /** Item drops: 0 off, 1 low, 2 high. */
  items: 0 | 1 | 2;
  /** Stage hazards (lightning, geysers) on or off: off is the "omega" version of every stage. */
  hazards: boolean;
}

export interface PlayerResult {
  index: number;
  character: string;
  type: 'human' | 'cpu';
  stocks: number;
  kos: number;
  falls: number;
  damageDealt: number;
  /** Colour palette the fighter wore. */
  palette?: number;
  /** Most hits in one combo. */
  bestCombo?: number;
  eliminated: boolean;
  placement: number;
  /** Team index (team battles), else -1. */
  team: number;
}

export interface MatchResult {
  winner: number; // player index or -1 draw
  /** Winning team in team battles, else -1. */
  winnerTeam: number;
  players: PlayerResult[];
  durationSec: number;
}

/** What the scenes pass to each other: the lobby choices, the stage, rules, the last result. */
import type { Replay } from './replay';

export interface Session {
  mode: GameMode;
  players: PlayerSlot[];
  stage: string;
  rules: MatchRules;
  playerCount: number;
  lastResult: MatchResult | null;
  /** The human slot of the running arcade ladder (kept across fights). */
  arcadeHuman: PlayerSlot | null;
  /** Arcade ladder progress. */
  ladder: LadderState | null;
  /** The last finished versus match, as inputs (Results offers to watch it). */
  replay: Replay | null;
  /** Set by Results: the next Match scene plays `replay` back instead of a live game. */
  watchReplay: boolean;
  targetRun: TargetRun | null;
  launchRun: LaunchRun | null;
}

export const DEFAULT_RULES: MatchRules = { mode: 'stock', stocks: 3, timeSec: 180, teams: false, items: 0, hazards: true, staminaHp: 150 };

export function newSession(): Session {
  return { mode: 'versus', players: [], stage: 'classic', rules: { ...DEFAULT_RULES }, playerCount: 2, lastResult: null, ladder: null, arcadeHuman: null, replay: null, watchReplay: false, targetRun: null, launchRun: null };
}

export const session: Session = newSession();
