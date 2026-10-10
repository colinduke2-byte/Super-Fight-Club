import type { InputDevice } from '../input/device';
import type { LadderState } from './ladder';
import type { CpuLevel } from './lobby';

export type GameMode = 'versus' | 'arcade' | 'training';

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
}

export interface MatchRules {
  mode: 'stock' | 'time';
  stocks: number;
  timeSec: number;
}

export interface PlayerResult {
  index: number;
  character: string;
  type: 'human' | 'cpu';
  stocks: number;
  kos: number;
  falls: number;
  damageDealt: number;
  eliminated: boolean;
  placement: number;
}

export interface MatchResult {
  winner: number; // player index or -1 draw
  players: PlayerResult[];
  durationSec: number;
}

/** What the scenes pass to each other: the lobby choices, the stage, rules, the last result. */
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
}

export const DEFAULT_RULES: MatchRules = { mode: 'stock', stocks: 3, timeSec: 180 };

export function newSession(): Session {
  return { mode: 'versus', players: [], stage: 'classic', rules: { ...DEFAULT_RULES }, playerCount: 2, lastResult: null, ladder: null, arcadeHuman: null };
}

export const session: Session = newSession();
