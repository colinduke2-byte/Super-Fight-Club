/**
 * Movement squash / stretch / lean for FighterView: a damped spring on the body's height, driven by the fighter's movement
 * state and kicked by movement events (take-off, double jump, touch-down, ledge catch, wall jump, turnaround, dodges), and
 * an eased lean into dashes, sprints, skids and air drift. Visual only: the hurtbox never reads it.
 *
 * Tuned by weight: light fighters snap and bounce (a quick, springy settle with a little overshoot, more stretch in the air),
 * heavy ones sink (deeper, slower squashes that settle without wobble, less stretch). REDUCE MOTION keeps 40% of everything.
 */
import { INITIAL_DASH_FRAMES } from '../engine/fighter';

/** The fighter fields the spring reads (a Fighter satisfies it). */
export interface MotionSource {
  state: string;
  grounded: boolean;
  vx: number;
  vy: number;
  facing: number;
  fastFalling: boolean;
  sprinting: boolean;
  dashTimer: number;
  sprintTurn: number;
  sprintSkid: number;
  jumpsLeft: number;
  wall: number;
  hitlag: number;
  data: { stats: { weight: number } };
}

/** Spring and gain constants for one weight. */
export interface BodyFeel {
  /** 0 (lightest) .. 1 (heaviest). */
  mass: number;
  /** Spring stiffness per sim tick squared, and damping per tick. */
  k: number;
  c: number;
  /** Depth of squashes (jump squat, touch-down, lag) and height of stretches (take-off, rising, fast fall). */
  squash: number;
  stretch: number;
  /** How fast the lean eases toward its target (fraction per tick). */
  leanRate: number;
}

/** Lightest and heaviest roster weights the feel is spread over. */
const W_LIGHT = 88;
const W_HEAVY = 120;

export function bodyFeel(weight: number): BodyFeel {
  const mass = Math.max(0, Math.min(1, (weight - W_LIGHT) / (W_HEAVY - W_LIGHT)));
  const k = 0.3 - 0.13 * mass;
  const zeta = 0.42 + 0.33 * mass;
  return { mass, k, c: 2 * zeta * Math.sqrt(k), squash: 0.85 + 0.4 * mass, stretch: 1.15 - 0.45 * mass, leanRate: 0.34 - 0.12 * mass };
}

/** Height offset limits: -0.26 is a deep squat, +0.2 a long stretch. */
const D_MIN = -0.26;
const D_MAX = 0.2;
/** Share of the motion kept with REDUCE MOTION. */
const REDUCED = 0.4;

export class BodyMotion {
  /** Height offset (+ taller and thinner, - squatter and wider) and its rate of change per tick. */
  private d = 0;
  private v = 0;
  private lean = 0;
  private lastState = '';
  private lastGrounded = true;
  private lastFacing = 1;
  private lastJumps = -1;
  private lastWall = 0;
  /** Fall speed over the last airborne ticks (the touch-down kick scales with it). */
  private airVy = 0;
  /** Outputs: scale multipliers and a rotation (radians, around the feet). */
  sx = 1;
  sy = 1;
  rot = 0;

  constructor(readonly feel: BodyFeel) {}

  /** Back to rest (respawn, a reset camera cut). */
  reset(): void {
    this.d = this.v = this.lean = 0;
    this.sx = this.sy = 1;
    this.rot = 0;
    this.lastState = '';
  }

  /** Advance by `dt` sim ticks (0 while paused). */
  step(f: MotionSource, dt: number, reduce: boolean): void {
    const F = this.feel;
    if (this.lastState !== '' && dt > 0) this.events(f);
    this.lastState = f.state;
    this.lastGrounded = f.grounded;
    this.lastFacing = f.facing;
    this.lastJumps = f.jumpsLeft;
    this.lastWall = f.wall;
    if (!f.grounded && f.vy > 0) this.airVy = f.vy;
    else if (f.grounded) this.airVy = 0;
    // hit-stop freezes the body mid-squash like everything else
    if (dt > 0 && f.hitlag === 0) {
      const target = this.target(f);
      const n = Math.ceil(dt);
      const h = dt / n;
      for (let i = 0; i < n; i++) {
        const a = -F.k * (this.d - target) - F.c * this.v;
        this.v += a * h;
        this.d += this.v * h;
      }
      if (this.d < D_MIN) (this.d = D_MIN), (this.v = Math.max(0, this.v));
      else if (this.d > D_MAX) (this.d = D_MAX), (this.v = Math.min(0, this.v));
      const lt = this.leanTarget(f);
      // a lean snaps in quicker than it lets go (into a burst at once, out of it gently)
      const rate = Math.abs(lt) > Math.abs(this.lean) ? F.leanRate * 1.6 : F.leanRate;
      this.lean += (lt - this.lean) * (1 - Math.pow(1 - Math.min(0.95, rate), dt));
    }
    const amp = reduce ? REDUCED : 1;
    const D = this.d * amp;
    this.sy = 1 + D;
    // roughly area-preserving: a squat body widens, a stretched one thins
    this.sx = 1 - D * 0.85;
    this.rot = this.lean * amp;
  }

  /** One-off kicks when the movement state changes. */
  private events(f: MotionSource): void {
    const F = this.feel;
    const was = this.lastState;
    const st = f.state;
    // touch-down: squashed by the fall, harder the faster it came down (a ledge step-off barely dips)
    if (f.grounded && !this.lastGrounded && st !== 'ko') {
      const impact = Math.min(14, this.airVy);
      const dip = -(0.035 + impact * 0.011) * F.squash;
      if (this.d > dip) this.d = Math.max(D_MIN, dip);
      this.v = Math.min(this.v, 0);
      return;
    }
    if (st === 'jumpsquat' && was !== 'jumpsquat') {
      // jump squat: only a few ticks long, so the gather drops straight in instead of easing down
      this.d = Math.min(this.d, -0.09 * F.squash);
      this.v = Math.min(this.v, -0.03 * F.squash);
      return;
    }
    if (st === 'air' && was === 'jumpsquat') {
      // take-off: the squat springs open into a stretch
      this.v += 0.06 * F.stretch;
      return;
    }
    if (st === 'air' && was === 'air' && f.jumpsLeft < this.lastJumps) {
      // double jump: a quick gather, then the push
      this.d = Math.min(this.d, -0.05 * F.squash);
      this.v = 0.07 * F.stretch;
      return;
    }
    if (st === 'air' && !f.grounded && this.lastWall !== 0 && f.facing !== this.lastFacing && f.vy < 0) {
      // wall jump: pressed into the wall, then flung off it
      this.d = Math.min(this.d, -0.07 * F.squash);
      this.v = 0.08 * F.stretch;
      return;
    }
    if (st === 'ledge' && was !== 'ledge') {
      // ledge catch: the arms take the body's weight with a jolt and a stretch
      this.d = Math.max(this.d, 0.07 * F.stretch);
      this.v = 0;
      return;
    }
    if (st === 'airdodge' && was !== 'airdodge') {
      this.d = Math.max(this.d, 0.05 * F.stretch);
      return;
    }
    if ((st === 'spotdodge' || st === 'roll') && was !== st) {
      this.d = Math.min(this.d, -0.05 * F.squash);
      return;
    }
    if (st === 'ledgeClimb' && was !== 'ledgeClimb') {
      this.v += 0.03 * F.stretch;
      return;
    }
    if (f.grounded && f.facing !== this.lastFacing && (st === 'idle' || st === 'run' || st === 'dash')) {
      // turnaround: the feet plant and the body dips through the turn
      this.d = Math.min(this.d, -0.045 * F.squash);
    }
  }

  /** Where the height spring settles for the current state. */
  private target(f: MotionSource): number {
    const F = this.feel;
    switch (f.state) {
      case 'jumpsquat':
        return -0.13 * F.squash;
      case 'landing':
        return -0.07 * F.squash;
      case 'air':
      case 'tether':
        if (f.fastFalling) return 0.1 * F.stretch;
        // rising stretches with speed; a fall leans out a little as it gathers pace
        if (f.vy < 0) return Math.min(0.08, -f.vy * 0.011) * F.stretch;
        return Math.min(0.035, f.vy * 0.005) * F.stretch;
      case 'run':
        if (f.sprinting && f.dashTimer > 0 && f.grounded) {
          // sprint start: a stretch along the run that settles over the first frames of the burst
          const k = Math.max(0, (f.dashTimer - (INITIAL_DASH_FRAMES - 6)) / 6);
          return -0.11 * k;
        }
        if (f.sprintTurn > 0) return -0.07 * F.squash;
        return 0;
      case 'dash':
        return -0.04 * F.squash;
      case 'idle':
        // braking out of a run: sunk a little over the planted feet
        return f.grounded && Math.abs(f.vx) > 1.6 ? -0.04 * F.squash : 0;
      default:
        return 0;
    }
  }

  /** Lean (radians, + toward facing right) for the current state. */
  private leanTarget(f: MotionSource): number {
    const F = this.feel;
    const heavy = 1 - 0.35 * F.mass;
    const dir = Math.sign(f.vx || f.facing);
    switch (f.state) {
      case 'run':
        if (!f.grounded) return 0;
        if (f.sprinting && f.dashTimer > 0 && f.sprintTurn === 0) return f.facing * 0.13 * Math.min(1, f.dashTimer / 4);
        if (f.sprintTurn > 0 || f.sprintSkid > 0) return -dir * 0.07;
        return 0;
      case 'dash':
        // the initial dash: pitched into the burst
        return f.facing * 0.09 * heavy;
      case 'idle':
        // a skid to a stop: rocked back against the slide
        return f.grounded && Math.abs(f.vx) > 1.6 ? -dir * 0.05 : 0;
      case 'landing':
        // touching down with speed: the body carries on over the feet
        return Math.abs(f.vx) > 1.5 ? dir * 0.05 * heavy : 0;
      case 'air':
        // drifting: a slight lean into the air movement
        return Math.max(-0.05, Math.min(0.05, f.vx * 0.013)) * heavy;
      default:
        return 0;
    }
  }
}
