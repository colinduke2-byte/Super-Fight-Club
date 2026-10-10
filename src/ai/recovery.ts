import type { Fighter } from '../engine/fighter';
import type { Ledge } from '../engine/platform';
import type { World } from '../engine/world';
import type { CharacterAi, LevelParams } from './profiles';

/** True if the fighter is airborne with no stage under it (or beside it): it has to get back. */
export function offstage(f: Fighter, world: World): boolean {
  if (f.grounded || f.state === 'ledge' || f.state === 'ledgeClimb' || f.state === 'ko') return false;
  let top = Infinity;
  let left = Infinity;
  let right = -Infinity;
  for (const p of world.platforms) {
    if (p.kind !== 'solid') continue;
    top = Math.min(top, p.top);
    left = Math.min(left, p.x);
    right = Math.max(right, p.right);
  }
  if (top === Infinity) return false;
  if (f.y > top + 6) return true; // below the stage surface
  return f.x < left - 4 || f.x > right + 4; // above the stage level but out past the edge
}

export interface RecoveryEpisode {
  ledge: Ledge | null;
  /** Randomised mistakes for this attempt (0 for a perfect CPU). */
  jumpDelay: number;
  specialDelay: number;
  aimError: number;
  startTick: number;
  specialPressed: boolean;
}

export function newEpisode(world: World, p: LevelParams, rnd: () => number): RecoveryEpisode {
  const sloppy = 1 - p.recovery;
  return {
    ledge: null,
    jumpDelay: Math.round(rnd() * sloppy * 40),
    specialDelay: Math.round(rnd() * sloppy * 36),
    aimError: (rnd() - 0.5) * sloppy * 1.6,
    startTick: world.tick,
    specialPressed: false,
  };
}

export interface RecoveryOut {
  sx: number;
  sy: number;
  jump: boolean;
  special: boolean;
  /** True while a recovery special is the thing to keep steering. */
  steering: boolean;
}

/** The best free ledge to aim for: nearest to the fighter, preferring ones it can reach by climbing up. */
export function pickLedge(f: Fighter, world: World, keep: Ledge | null): Ledge | null {
  if (keep && (keep.occupant === -1 || keep.occupant === f.id)) {
    // keep the current choice unless it became far worse
    return keep;
  }
  let best: Ledge | null = null;
  let bestD = Infinity;
  for (const l of world.ledges) {
    if (l.occupant !== -1 && l.occupant !== f.id) continue;
    const hx = l.x + l.side * (f.hw + 4);
    const hy = l.y + f.h * 0.9;
    const d = Math.abs(hx - f.x) + Math.abs(hy - f.y) * 1.6;
    if (d < bestD) {
      bestD = d;
      best = l;
    }
  }
  return best;
}

/**
 * One frame of recovery input: drift to the ledge, double-jump when level with / below it, then use the recovery
 * special, aiming at the hang point. Mistakes (late jump, early/late special, aim error) scale with the CPU level.
 */
export function recoveryStep(f: Fighter, world: World, ai: CharacterAi, ep: RecoveryEpisode, out: RecoveryOut): void {
  out.sx = 0;
  out.sy = 0;
  out.jump = false;
  out.special = false;
  out.steering = false;
  ep.ledge = pickLedge(f, world, ep.ledge);
  const l = ep.ledge;
  if (!l) return;
  const hx = l.x + l.side * (f.hw + 4);
  const hy = l.y + f.h * 0.9;
  const dx = hx - f.x;
  const dy = hy - f.y; // > 0: the hang point is below us, < 0: above us
  out.sx = Math.abs(dx) < 5 ? 0 : Math.sign(dx);
  // after reaching the horizontal position keep drifting inward so the ledge-grab's "facing the stage" test passes
  if (Math.abs(dx) < 5) out.sx = -l.side * 0.4;

  const rec = ai.recovery;
  const t = world.tick - ep.startTick;
  const canAct = f.state === 'air' && !f.helpless;

  if (f.state === 'attack') {
    // mid recovery special: steer toward the ledge
    out.steering = true;
    if (rec.aim === 'stick8' || rec.aim === 'tether') {
      const len = Math.hypot(dx, dy) || 1;
      let ax = dx / len;
      let ay = dy / len;
      const c = Math.cos(ep.aimError);
      const s = Math.sin(ep.aimError);
      [ax, ay] = [ax * c - ay * s, ax * s + ay * c];
      // up8 snaps to 8 directions: keep the vertical component only when the ledge is clearly above
      out.sx = Math.abs(ax) < 0.25 ? 0 : Math.sign(ax);
      out.sy = ay < -0.3 ? -1 : ay > 0.5 ? 1 : 0;
      if (rec.aim === 'tether') {
        out.sx = ax;
        out.sy = ay;
      }
    } else {
      out.sx = Math.abs(dx) < 4 ? 0 : Math.sign(dx);
      out.sy = -1;
    }
    return;
  }
  if (!canAct) return;

  const below = f.y - hy; // > 0 means we are lower than the hang point
  const reach = rec.up;
  // wall jump (characters that have it): kick off the side of the stage on the way up
  if (f.data.wallJump && f.wall !== 0 && f.wallJumps < 2 && below > 0) {
    out.jump = true;
    return;
  }
  // 1) double jump: once we are no longer rising and level with / below the hang point
  if (f.jumpsLeft > 0 && f.vy >= -0.5 && below > -6 && t >= ep.jumpDelay) {
    // do not burn the jump if the special alone would clearly make it... still jump: it is almost free
    out.jump = true;
    return;
  }
  // 2) recovery special
  const horizontalOk = Math.abs(dx) <= rec.out + 20;
  const lastChance = below > reach * 0.55;
  const jumpsGone = f.jumpsLeft === 0;
  if (!ep.specialPressed && (jumpsGone || lastChance) && below > -10 && (horizontalOk || lastChance) && t >= ep.specialDelay && f.vy >= -1) {
    out.special = true;
    out.steering = true;
    out.sy = -1; // Up must be held on the press frame to select the up special; aim is refined while it runs
    out.sx = Math.abs(dx) < 4 ? 0 : Math.sign(dx);
  }
}
