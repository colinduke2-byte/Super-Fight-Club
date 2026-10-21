import type { InputDevice } from '../input/device';
import type { LadderState } from './ladder';
import type { CpuLevel } from './lobby';
import { ITEM_KINDS } from '../engine/items';
import type { StageForm } from '../engine/types';
import type { Modifier } from './modifiers';

const ITEM_KIND_IDS: readonly string[] = ITEM_KINDS;

export type GameMode = 'versus' | 'arcade' | 'training' | 'targets' | 'launch' | 'challenge';

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
  /** The best before this run (null: none), for the comparison on the results. */
  prevBest?: number | null;
  /** The dummy it was flown on (the standard one). */
  dummy?: string;
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
  /** CPU skill on the 1..9 scale (absent = the level's own: 1 / 5 / 9). */
  cpuSkill?: number;
  /** Lobby: the fighter (and `randomOutfit`: the outfit) was rolled from RANDOM; going back to the lobby shows RANDOM again. */
  random?: boolean;
  randomOutfit?: boolean;
  /** Ladder fights: this slot's team (team fights and co-op; the human side is team 0). See ladder.rulesForSlots. */
  team?: number;
  /** Ladder fights: cast in the arena's steel (the METAL fight). */
  metal?: boolean;
  /** Ladder fights: damage carried over from the last fight (Endless, Gauntlet). */
  startDamage?: number;
}

/** Per-slot handicap: starting damage and extra (or fewer) stocks. */
export interface Handicap {
  damage: number;
  stock: number;
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
  /** Stock matches: a time limit as well (seconds, 0 = none); at the bell most stocks, then least damage, wins. */
  stockTimeSec?: number;
  /** A tie at the bell goes to sudden death (default) or ends as a draw. */
  suddenDeath?: boolean;
  /** Team battle: each slot's team (0 blue, 1 red, 2 green, 3 yellow). Absent = P1+P2 vs P3+P4 with four players. */
  teamOf?: number[];
  /** Team attack: teammates' hits land (friendly fire). */
  teamAttack?: boolean;
  /** Item kinds switched off (ITEM_KINDS ids). */
  itemsOff?: string[];
  /** Per-slot handicap (starting % and stock adjustment). */
  handicap?: Handicap[];
  /** Stage ids RANDOM picks from (absent / empty = every stage). */
  stagePool?: string[];
  /** Slots cast in steel (the arcade's METAL fight: see game/metal.ts). Kept with the rules so a replay rebuilds them. */
  metal?: number[];
  /** Stage form: as designed (absent / 'normal'), BATTLEFIELD or PLAIN (see stages/forms.ts). */
  stageForm?: StageForm;
  /** Damage of every hit x this (0.5..2; absent = 1). */
  damageRatio?: number;
  /** Knockback of every hit x this (0.5..2; absent = 1). */
  launchRate?: number;
  /** A match modifier applied to every fighter (see game/modifiers.ts). */
  modifier?: Modifier;
  /** Best-of series length: 1 (absent), 3 or 5; the win tally is kept in `session.series` across rematches. */
  bestOf?: 1 | 3 | 5;
}

/** A best-of series in progress: wins per slot, carried across rematches (see tallySeries). */
export interface SeriesState {
  bestOf: 3 | 5;
  /** Who is playing (characters by slot, and the rules' series length): a different lineup starts a new series. */
  key: string;
  /** Wins per slot (teams: per slot of the winning team's members as well). */
  wins: number[];
  /** Games played (draws included). */
  games: number;
  /** The slot (or team, in team battles: -2 - team) that took the series, once decided; -1 while it is running. */
  champion: number;
  /** The result last counted (so counting is idempotent). */
  counted: MatchResult | null;
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
  /** KOs scored with an ultimate (counted from the match's events; absent in old results). */
  ultimateKos?: number;
  /** Ledge grabs over the match. */
  ledgeGrabs?: number;
  /** Longest launch this fighter dealt, in metres. */
  biggestLaunch?: number;
}

export interface MatchResult {
  winner: number; // player index or -1 draw
  /** Winning team in team battles, else -1. */
  winnerTeam: number;
  players: PlayerResult[];
  durationSec: number;
}

/** Team colour names, by team index (0 blue, 1 red, 2 green, 3 yellow). */
export const TEAM_NAMES = ['BLUE', 'RED', 'GREEN', 'YELLOW'] as const;
export function teamName(t: number): string {
  return TEAM_NAMES[t] ?? `${t + 1}`;
}

/** What a finished challenge run earned (for the Results screen): the medal, which goals it met, what it improved. */
export interface ChallengeRunResult {
  id: string;
  /** Medal this run earned: 0 failed, 1 bronze, 2 silver, 3 gold. */
  earned: number;
  silverMet: boolean;
  goldMet: boolean;
  firstClear: boolean;
  newTier: boolean;
  newBestTime: boolean;
  /** Best medal held now. */
  tier: number;
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
  /** Co-op runs: the second human's slot (kept across fights; null: playing solo). */
  arcadePartner?: PlayerSlot | null;
  /** Each slot's damage when the last match ended (Endless and Gauntlet carry the player's over). */
  endDamage?: number[];
  /** Arcade ladder progress. */
  ladder: LadderState | null;
  /** The last finished versus match, as inputs (Results offers to watch it). */
  replay: Replay | null;
  /** Set by Results: the next Match scene plays `replay` back instead of a live game. */
  watchReplay: boolean;
  targetRun: TargetRun | null;
  launchRun: LaunchRun | null;
  /** The running challenge's id (Challenges mode). */
  challenge: string | null;
  /** The last finished challenge run's medal and goals (null until one finishes). */
  challengeRun?: ChallengeRunResult | null;
  /** The stage was rolled from RANDOM (a rematch rolls it again). */
  stageRandom?: boolean;
  /** Attract-mode demo match (started by an idle title screen). */
  demo?: boolean;
  /** The last versus lineup picked in the lobby (Quick Match too): character select comes back to it. */
  versusLineup?: PlayerSlot[] | null;
  /** The best-of series being played (versus with `rules.bestOf` 3 or 5), or null. */
  series?: SeriesState | null;
}

export const DEFAULT_RULES: MatchRules = { mode: 'stock', stocks: 3, timeSec: 180, teams: false, items: 0, hazards: true, staminaHp: 150 };

/** Default team per slot for `n` players: 2 -> 1v1, 3 -> P1 vs P2+P3, 4 -> P1+P2 vs P3+P4. */
export function defaultTeams(n: number): number[] {
  return n === 4 ? [0, 0, 1, 1] : n === 3 ? [0, 1, 1] : [0, 1, 0, 1].slice(0, n);
}

/** Each slot's team for these rules and player count, or null when it is not a team battle (fewer than two teams). */
export function teamsFor(rules: MatchRules, n: number): number[] | null {
  if (!rules.teams || n < 2) return null;
  const def = defaultTeams(n);
  const t = Array.from({ length: n }, (_, i) => clampInt(rules.teamOf?.[i] ?? def[i], 0, 3));
  return new Set(t).size >= 2 ? t : null;
}

function clampInt(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, Math.round(Number(v) || 0)));
}

/**
 * The match options beyond the basic rules, as RunnerSetup fields (see MatchRunner): teams per slot, team attack, handicaps,
 * item kinds switched off, sudden death and the stock-match time limit. Everything is derived from the rules, so a replay
 * (which stores its rules) plays back with the same options. Absent fields keep the old behaviour.
 */
export function runnerExtras(rules: MatchRules, n = rules.teamOf?.length ?? 4): {
  teamOf?: number[];
  teamAttack?: boolean;
  startDamage?: number[];
  stockBonus?: number[];
  itemsOff?: number;
  suddenDeath?: boolean;
  stockTimeSec?: number;
} {
  const out: ReturnType<typeof runnerExtras> = {};
  const teams = rules.teams ? teamsFor(rules, Math.max(2, Math.min(4, n))) : null;
  if (teams) out.teamOf = teams;
  if (rules.teamAttack) out.teamAttack = true;
  const hc = rules.handicap ?? [];
  if (hc.some((h) => h && h.damage > 0)) out.startDamage = hc.map((h) => clampInt(h?.damage ?? 0, 0, 300));
  if (rules.mode !== 'time' && hc.some((h) => h && h.stock)) out.stockBonus = hc.map((h) => clampInt(h?.stock ?? 0, -4, 4));
  if (rules.itemsOff?.length) out.itemsOff = itemMask(rules.itemsOff);
  if (rules.suddenDeath === false) out.suddenDeath = false;
  if (rules.mode === 'stock' && (rules.stockTimeSec ?? 0) > 0) out.stockTimeSec = rules.stockTimeSec;
  return out;
}

/** Bit mask (one bit per ITEM_KINDS index) of the switched-off item kinds. */
export function itemMask(off: readonly string[]): number {
  let m = 0;
  for (const k of off) {
    const i = ITEM_KIND_IDS.indexOf(k);
    if (i >= 0) m |= 1 << i;
  }
  return m;
}

export function newSession(): Session {
  return { mode: 'versus', players: [], stage: 'classic', rules: { ...DEFAULT_RULES }, playerCount: 2, lastResult: null, ladder: null, arcadeHuman: null, replay: null, watchReplay: false, targetRun: null, launchRun: null, challenge: null };
}

export const session: Session = newSession();

/** Wins needed to take a best-of-`n` series. */
export function winsNeeded(n: number): number {
  return Math.floor(n / 2) + 1;
}

function seriesKey(s: Session): string {
  return `${s.rules.bestOf}|${s.players.map((p) => p.character).join(',')}|${s.rules.teams ? (s.rules.teamOf ?? []).join('') : ''}`;
}

/**
 * Count the last versus result into the best-of series (idempotent: a result is counted once). A different lineup or
 * series length, or a series already decided, starts a fresh one. Returns the series (null when not playing one). The
 * Results screen calls this to show the tally; the match setup calls it too, so a finished game is always counted before
 * the next one starts.
 */
export function tallySeries(s: Session = session): SeriesState | null {
  const n = s.rules.bestOf;
  if (s.mode !== 'versus' || (n !== 3 && n !== 5)) {
    s.series = null;
    return null;
  }
  const key = seriesKey(s);
  if (!s.series || s.series.key !== key) s.series = { bestOf: n, key, wins: s.players.map(() => 0), games: 0, champion: -1, counted: s.lastResult };
  const ser = s.series;
  const r = s.lastResult;
  if (r && r !== ser.counted && ser.champion === -1) {
    ser.counted = r;
    ser.games++;
    if (r.winnerTeam >= 0) {
      for (const p of r.players) if (p.team === r.winnerTeam && ser.wins[p.index] !== undefined) ser.wins[p.index]++;
    } else if (r.winner >= 0 && ser.wins[r.winner] !== undefined) ser.wins[r.winner]++;
    const need = winsNeeded(n);
    const top = ser.wins.findIndex((w) => w >= need);
    if (top >= 0) ser.champion = r.winnerTeam >= 0 ? -2 - r.winnerTeam : top;
  }
  return ser;
}

/** Before a match starts: count the last result, and begin a new series once the last one was decided. */
export function seriesBeforeMatch(s: Session = session): SeriesState | null {
  const ser = tallySeries(s);
  if (ser && ser.champion !== -1) {
    s.series = { ...ser, wins: ser.wins.map(() => 0), games: 0, champion: -1, counted: s.lastResult };
    return s.series;
  }
  return ser;
}
