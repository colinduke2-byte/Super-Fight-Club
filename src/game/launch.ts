import { CHARACTER_LIST } from '../characters';
import type { Fighter } from '../engine/fighter';
import type { PlayerSlot } from './session';
import { LAUNCH_EDGE, LAUNCH_PX_PER_M } from '../stages/launch';

/** Frames the barrier holds the dummy on the platform. */
export const LAUNCH_TIMER = 10 * 60;
/** After the barrier drops: frames left to send the dummy off before the run is scored where it stands. */
export const LAUNCH_GRACE = 4 * 60;
/** A flight is over once the dummy has been resting on the runway this many frames. */
const REST_FRAMES = 24;
/** Hard cap on a flight (a dummy sliding forever still gets scored). */
const MAX_FLIGHT = 20 * 60;

export type LaunchPhase = 'barrier' | 'open' | 'flying' | 'between' | 'done';

/** Attempts per Launch Contest run: the best one counts. */
export const LAUNCH_ATTEMPTS = 3;
/** Frames between one attempt's end and the next one's barrier (the attempt's distance shows meanwhile). */
export const LAUNCH_BETWEEN = 100;

/** One attempt's result. */
export interface LaunchAttempt {
  /** Metres reached (0: never sent off). */
  distance: number;
  /** Damage on the dummy when it left the platform (or when the attempt ended, if it never did). */
  damage: number;
}

/**
 * Launch Contest rules, driven once per sim tick after `world.step`: during the barrier the dummy is walled in on the
 * main platform (it bounces off the walls); once the barrier drops it can be sent down the runway, and the attempt scores
 * the furthest point it reaches (it never moves back past it, so a bounce or a slide back cannot cost distance).
 * The left wall always stays up, so every launch goes down the runway.
 *
 * A run is LAUNCH_ATTEMPTS attempts: after each one the dummy (and the player, when attached) are put back and the barrier
 * goes up again; the best attempt is the run's distance.
 */
export class LaunchContest {
  phase: LaunchPhase = 'barrier';
  /** Frames since the current attempt started. */
  t = 0;
  /** Best distance this run (over every attempt so far), in metres. */
  distance = 0;
  /** This attempt's distance so far. */
  current = 0;
  /** Finished attempts. */
  readonly attempts: LaunchAttempt[] = [];
  /** Attempt being played (0-based). */
  attempt = 0;
  private rest = 0;
  private flight = 0;
  private between = 0;
  private launchedAt = -1;
  private player: { f: Fighter; x: number; y: number } | null = null;
  private readonly home: { x: number; y: number };

  constructor(
    readonly bag: Fighter,
    private readonly left = -110 + 6,
    private readonly right = LAUNCH_EDGE - 6,
    readonly total = LAUNCH_ATTEMPTS,
  ) {
    this.home = { x: bag.x, y: bag.y };
  }

  /** The player is put back at its start spot between attempts too. */
  attachPlayer(f: Fighter): void {
    this.player = { f, x: f.x, y: f.y };
  }

  /** Frames of barrier left (0 once it is down). */
  get barrierLeft(): number {
    return this.phase === 'barrier' ? Math.max(0, LAUNCH_TIMER - this.t) : 0;
  }

  /** Every attempt is done: the run is over. */
  get over(): boolean {
    return this.phase === 'done';
  }

  /** Index of the best attempt so far (-1: none scored). */
  get bestAttempt(): number {
    let bi = -1;
    this.attempts.forEach((a, i) => {
      if (a.distance > 0 && (bi < 0 || a.distance > this.attempts[bi].distance)) bi = i;
    });
    return bi;
  }

  /** Damage on the dummy when the best attempt launched (0: none). */
  get bestDamage(): number {
    const i = this.bestAttempt;
    return i >= 0 ? this.attempts[i].damage : 0;
  }

  private finishAttempt(): void {
    const b = this.bag;
    this.attempts.push({ distance: Math.round(this.current * 10) / 10, damage: Math.round(this.launchedAt >= 0 ? this.launchedAt : b.damage) });
    this.distance = Math.max(this.distance, this.current);
    if (this.attempts.length >= this.total) {
      this.phase = 'done';
      return;
    }
    this.phase = 'between';
    this.between = 0;
  }

  private nextAttempt(): void {
    this.attempt++;
    this.phase = 'barrier';
    this.t = 0;
    this.current = 0;
    this.rest = this.flight = 0;
    this.launchedAt = -1;
    const b = this.bag;
    b.spawn(this.home.x, this.home.y, -1);
    b.damage = 0;
    b.invuln = 0;
    const p = this.player;
    if (p) {
      p.f.spawn(p.x, p.y, 1);
      p.f.invuln = 0;
    }
  }

  step(): void {
    if (this.phase === 'done') return;
    if (this.phase === 'between') {
      if (++this.between >= LAUNCH_BETWEEN) this.nextAttempt();
      return;
    }
    this.t++;
    const b = this.bag;
    if (b.state === 'ko') {
      // past the blast line: score what it reached, including the last tick's travel out to where it was KO'd
      if (this.phase === 'flying') this.current = Math.max(this.current, Math.max(0, b.koX - LAUNCH_EDGE) / LAUNCH_PX_PER_M);
      this.finishAttempt();
      return;
    }
    // left wall (always) and right wall (barrier only): bounce off with a little energy lost
    if (b.x < this.left) {
      b.x = b.prevX = this.left;
      if (b.vx < 0) b.vx = -b.vx * 0.45;
    }
    if (this.phase === 'barrier') {
      if (b.x > this.right) {
        b.x = b.prevX = this.right;
        if (b.vx > 0) b.vx = -b.vx * 0.45;
      }
      if (this.t >= LAUNCH_TIMER) this.phase = 'open';
      return;
    }
    if (this.phase === 'open') {
      if (b.x > LAUNCH_EDGE) {
        this.phase = 'flying';
        this.launchedAt = b.damage;
      } else if (this.t >= LAUNCH_TIMER + LAUNCH_GRACE && b.hitstun <= 0 && b.grounded) {
        this.finishAttempt(); // never sent off: zero
        return;
      } else return;
    }
    // flying
    this.flight++;
    this.current = Math.max(this.current, Math.max(0, b.x - LAUNCH_EDGE) / LAUNCH_PX_PER_M);
    const resting = b.grounded && Math.abs(b.vx) < 0.2 && b.hitstun <= 0;
    this.rest = resting ? this.rest + 1 : 0;
    if (this.rest >= REST_FRAMES || this.flight >= MAX_FLIGHT) this.finishAttempt();
  }
}

/** The weight the standard dummy is picked for: the roster fighter closest to it stands in every Launch Contest. */
export const STANDARD_DUMMY_WEIGHT = 100;

/**
 * The standard dummy: always the same middleweight (the roster fighter whose weight is closest to STANDARD_DUMMY_WEIGHT,
 * ties by roster order), so every distance in the records was flown by the same body and they compare fairly.
 */
export function standardDummy(): string {
  let best = CHARACTER_LIST[0];
  for (const c of CHARACTER_LIST) if (Math.abs(c.stats.weight - STANDARD_DUMMY_WEIGHT) < Math.abs(best.stats.weight - STANDARD_DUMMY_WEIGHT)) best = c;
  return best.id;
}

/** The player and the dummy: the standard dummy that just stands there (a mirror when the player picked that fighter). */
export function launchSlots(player: PlayerSlot): PlayerSlot[] {
  return [{ ...player, index: 0 }, { index: 1, type: 'cpu', device: null, character: standardDummy(), cpuLevel: 1 }];
}

// ---- leaderboard -------------------------------------------------------------------------------

/** One leaderboard entry: metres, the damage it flew at, who flew it ('P2' in take-turns, else '') and when (ms). */
export interface LaunchEntry {
  m: number;
  dmg: number;
  who: string;
  at: number;
}

/** Entries kept per fighter. */
export const BOARD_SIZE = 5;
const BOARD_KEY = 'sfc.launchBoard.v1';
let board: Record<string, LaunchEntry[]> | null = null;

function loadBoard(): Record<string, LaunchEntry[]> {
  if (board) return board;
  try {
    const raw = localStorage.getItem(BOARD_KEY);
    const v = raw ? (JSON.parse(raw) as unknown) : {};
    board = v && typeof v === 'object' ? (v as Record<string, LaunchEntry[]>) : {};
  } catch {
    board = {};
  }
  return board;
}

/** The top distances flown with `character`, best first. */
export function launchBoard(character: string): LaunchEntry[] {
  const b = loadBoard()[character];
  return Array.isArray(b) ? b.filter((e) => e && typeof e.m === 'number') : [];
}

/** Adds a run to the fighter's top five. Returns its place (0 = top) or -1 when it did not make the board. */
export function recordLaunchBoard(character: string, m: number, dmg: number, who = '', at = Date.now()): number {
  if (!(m > 0)) return -1;
  const list = launchBoard(character);
  const e: LaunchEntry = { m: Math.round(m * 10) / 10, dmg: Math.round(dmg), who, at };
  list.push(e);
  list.sort((a, b) => b.m - a.m || a.at - b.at);
  const place = list.indexOf(e);
  loadBoard()[character] = list.slice(0, BOARD_SIZE);
  try {
    localStorage.setItem(BOARD_KEY, JSON.stringify(board));
  } catch {
    // storage blocked: the board lasts for this session
  }
  return place < BOARD_SIZE ? place : -1;
}

/** Test hook: re-read the board from storage. */
export function resetLaunchBoardCache(): void {
  board = null;
}
