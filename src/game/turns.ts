import { chosenCourse } from './targetRuns';
import { launchSlots } from './launch';
import { session, type PlayerSlot } from './session';

/**
 * Take turns: 2-4 players share one controller-swap session of Target Smash or Launch Contest. Each plays the same course
 * (Target Smash: the chosen shared course, or player 1's own) in turn, one match per turn, and the standings are compared at
 * the end. The turn order and results live here, outside the match scene (which restarts for each turn).
 */
export type TurnMode = 'targets' | 'launch';

export interface TurnResult {
  /** Higher is better: Target Smash = -ticks for a clear (targets broken * 1e6 otherwise), Launch = metres. */
  score: number;
  /** Shown in the standings ('0:21.33', '7/10 TARGETS', '123.4 M'). */
  text: string;
}

export interface Turns {
  mode: TurnMode;
  /** Each player's lobby slot (device and fighter), in turn order. */
  players: PlayerSlot[];
  /** Whose turn it is. */
  index: number;
  results: (TurnResult | null)[];
  /** Target Smash: the course everyone plays. */
  course: string | null;
}

let turns: Turns | null = null;

/** The running take-turns session for the current mode (null outside one). */
export function activeTurns(): Turns | null {
  return turns && session.mode === turns.mode ? turns : null;
}

/** Player label for the standings and banners (lobby port order: P1..P4). */
export function turnLabel(t: Turns, i: number): string {
  return `P${(t.players[i]?.index ?? i) + 1}`;
}

/** Puts the current player's match on the session (slots and stage). */
function stageTurn(t: Turns): void {
  const p = { ...t.players[t.index], index: 0 };
  session.mode = t.mode;
  if (t.mode === 'launch') {
    session.stage = 'launch';
    session.players = launchSlots(p);
  } else {
    session.stage = t.course ?? 'targets';
    session.players = [p];
  }
}

/**
 * Starts a take-turns session for `slots` (the lobby's humans, 2-4). With a single slot it just sets up a normal run.
 * Called by the lobby in place of building the one-player Target Smash / Launch Contest slots.
 */
export function beginTurns(mode: TurnMode, slots: PlayerSlot[]): void {
  const players = slots.filter((s) => s.type === 'human').slice(0, 4);
  if (players.length < 2) {
    turns = null;
    const p = { ...(players[0] ?? slots[0]), index: 0 };
    session.mode = mode;
    session.stage = mode === 'launch' ? 'launch' : chosenCourse(p.character).id;
    session.players = mode === 'launch' ? launchSlots(p) : [p];
    return;
  }
  turns = { mode, players, index: 0, results: players.map(() => null), course: mode === 'targets' ? chosenCourse(players[0].character).id : null };
  stageTurn(turns);
}

/** Records the current player's result. */
export function recordTurn(r: TurnResult): void {
  if (turns) turns.results[turns.index] = r;
}

/** On to the next player (sets up their match). False when every player has had their turn. */
export function advanceTurn(): boolean {
  const t = turns;
  if (!t || t.index >= t.players.length - 1) return false;
  t.index++;
  stageTurn(t);
  return true;
}

/** Back to the first player with fresh results (a rematch of the whole session). */
export function restartTurns(): void {
  if (!turns) return;
  turns.index = 0;
  turns.results = turns.players.map(() => null);
  stageTurn(turns);
}

/** Leaves take-turns (single runs from now on). */
export function endTurns(): void {
  turns = null;
}

/** Players ranked best first: [player index, result]; players without a result last. */
export function standings(t: Turns): { player: number; result: TurnResult | null; place: number }[] {
  const rows = t.players.map((_, i) => ({ player: i, result: t.results[i], place: 0 }));
  rows.sort((a, b) => (b.result?.score ?? -Infinity) - (a.result?.score ?? -Infinity) || a.player - b.player);
  rows.forEach((r, i) => (r.place = i > 0 && r.result && rows[i - 1].result?.score === r.result.score ? rows[i - 1].place : i + 1));
  return rows;
}

/** Test hook. */
export function setTurnsForTest(t: Turns | null): void {
  turns = t;
}
