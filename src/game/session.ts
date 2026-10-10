import type { InputDevice } from '../input/device';
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
  /** Arcade ladder progress (Phase 11). */
  ladder: { stage: number; won: number } | null;
}

export const DEFAULT_RULES: MatchRules = { mode: 'stock', stocks: 3, timeSec: 180 };

export function newSession(): Session {
  return { mode: 'versus', players: [], stage: 'sandbox', rules: { ...DEFAULT_RULES }, playerCount: 2, lastResult: null, ladder: null };
}

export const session: Session = newSession();
