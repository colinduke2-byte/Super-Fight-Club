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
      // past the blast line: score what it reached
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

/** The player and the dummy: a rival fighter that just stands there (picked at random, never the player's own). */
export function launchSlots(player: PlayerSlot, rand: () => number = Math.random): PlayerSlot[] {
  const rivals = CHARACTER_LIST.map((c) => c.id).filter((id) => id !== player.character);
  const bag = rivals[Math.floor(rand() * rivals.length)] ?? player.character;
  return [{ ...player, index: 0 }, { index: 1, type: 'cpu', device: null, character: bag, cpuLevel: 1 }];
}
