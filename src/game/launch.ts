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

export type LaunchPhase = 'barrier' | 'open' | 'flying' | 'done';

/**
 * Launch Contest rules, driven once per sim tick after `world.step`: during the barrier the dummy is walled in on the
 * main platform (it bounces off the walls); once the barrier drops it can be sent down the runway, and the run scores
 * the furthest point it reaches (it never moves back past it, so a bounce or a slide back cannot cost distance).
 * The left wall always stays up, so every launch goes down the runway.
 */
export class LaunchContest {
  phase: LaunchPhase = 'barrier';
  /** Frames since the contest started. */
  t = 0;
  /** Best distance this run, in metres. */
  distance = 0;
  private rest = 0;
  private flight = 0;

  constructor(
    readonly bag: Fighter,
    private readonly left = -110 + 6,
    private readonly right = LAUNCH_EDGE - 6,
  ) {}

  /** Frames of barrier left (0 once it is down). */
  get barrierLeft(): number {
    return Math.max(0, LAUNCH_TIMER - this.t);
  }

  get over(): boolean {
    return this.phase === 'done';
  }

  step(): void {
    if (this.phase === 'done') return;
    this.t++;
    const b = this.bag;
    if (b.state === 'ko') {
      // past the blast line: score what it reached, including the last tick's travel out to where it was KO'd
      if (this.phase === 'flying') this.distance = Math.max(this.distance, Math.max(0, b.koX - LAUNCH_EDGE) / LAUNCH_PX_PER_M);
      this.phase = 'done';
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
      if (b.x > LAUNCH_EDGE) this.phase = 'flying';
      else if (this.t >= LAUNCH_TIMER + LAUNCH_GRACE && b.hitstun <= 0 && b.grounded) {
        this.phase = 'done'; // never sent off: zero
        return;
      } else return;
    }
    // flying
    this.flight++;
    this.distance = Math.max(this.distance, Math.max(0, b.x - LAUNCH_EDGE) / LAUNCH_PX_PER_M);
    const resting = b.grounded && Math.abs(b.vx) < 0.2 && b.hitstun <= 0;
    this.rest = resting ? this.rest + 1 : 0;
    if (this.rest >= REST_FRAMES || this.flight >= MAX_FLIGHT) this.phase = 'done';
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
