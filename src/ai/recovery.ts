import type { Fighter } from '../engine/fighter';
import type { Ledge } from '../engine/platform';
import type { World } from '../engine/world';
import type { CharacterAi, LevelParams } from './profiles';
import { driftThenReaches, jumpThenReaches, pathReaches, upBPath, drift, type Sim } from './recoveryPlan';

/**
 * True if the fighter is airborne with no stage under it: no solid platform spans its x with a top at or below its feet.
 * (Judged per platform, so a raised block or a side island does not make the air above the main stage count as "off".)
 */
export function offstage(f: Fighter, world: World): boolean {
  if (f.grounded || f.state === 'ledge' || f.state === 'ledgeClimb' || f.state === 'ko') return false;
  let solid = false;
  for (const p of world.platforms) {
    if (p.kind !== 'solid') continue;
    solid = true;
    if (f.x >= p.x - 4 && f.x <= p.right + 4 && f.y <= p.top + 6) return false;
  }
  return solid;
}

/** Is the point (x, y) over a solid platform top (at or above it)? */
export function overStage(x: number, y: number, world: World): boolean {
  for (const p of world.platforms) if (p.kind === 'solid' && x >= p.x + 4 && x <= p.right - 4 && y <= p.top + 6) return true;
  return false;
}

export interface RecoveryEpisode {
  ledge: Ledge | null;
  /** Randomised mistakes for this attempt (0 for a perfect CPU). */
  jumpDelay: number;
  specialDelay: number;
  aimError: number;
  startTick: number;
  specialPressed: boolean;
  /**
   * Where this attempt aims (a mixup, chosen per episode by `LevelParams.recoveryMix`): 'ledge' hangs on the ledge, 'high'
   * lands on the stage a little way in, 'low' sinks below the ledge before jumping (under an edge-guarder's reach).
   */
  aim: 'ledge' | 'high' | 'low';
  /** The horizontal recovery special (sideRecovery) was used this attempt. */
  sideUsed: boolean;
  /** A recall (Vex's Blink Recall) was tried this attempt. */
  recallTried: boolean;
  /** Recovery variety of the CPU (copied from its LevelParams). */
  mix: number;
}

export function newEpisode(world: World, p: LevelParams, rnd: () => number): RecoveryEpisode {
  const sloppy = 1 - p.recovery;
  const r = rnd();
  const mix = p.recoveryMix ?? 0;
  const aim = r < mix * 0.3 ? 'high' : r < mix * 0.55 ? 'low' : 'ledge';
  return {
    ledge: null,
    jumpDelay: Math.round(rnd() * sloppy * 40),
    specialDelay: Math.round(rnd() * sloppy * 36),
    aimError: (rnd() - 0.5) * sloppy * 1.6,
    startTick: world.tick,
    specialPressed: false,
    aim,
    sideUsed: false,
    recallTried: false,
    mix,
  };
}

export interface RecoveryOut {
  sx: number;
  sy: number;
  jump: boolean;
  special: boolean;
  /** Air dodge (Shield) this frame, toward (sx, sy). Optional so older callers' scratch objects still fit. */
  dodge?: boolean;
  /** True while a recovery special is the thing to keep steering. */
  steering: boolean;
}

/**
 * A rival standing at the edge we are heading for (or waiting off it), close enough to hit us as we come back: an
 * edge-guarder. Returns its horizontal distance from the ledge corner (Infinity if none).
 */
export function edgeGuarder(f: Fighter, world: World, l: Ledge): number {
  let best = Infinity;
  for (const o of world.fighters) {
    if (o === f || o.state === 'ko' || world.allied(f.id, o.id)) continue;
    const inward = (l.x - o.x) * l.side; // + when on the stage side of the corner
    if (inward < -60 || inward > 90 || Math.abs(o.y - l.y) > 80) continue;
    best = Math.min(best, Math.abs(inward));
  }
  return best;
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
  out.dodge = false;
  out.steering = false;
  ep.ledge = pickLedge(f, world, ep.ledge);
  const l = ep.ledge;
  if (!l) return;
  const guard = edgeGuarder(f, world, l);
  // a rival waiting at the corner: do not aim to land on top of it, hang on the ledge (or come in low) instead
  if (ep.aim === 'high' && guard < 50) ep.aim = 'ledge';
  // still above the stage's top: land on it (a little way in from the corner) instead of dropping to the hang point
  const above = f.y < l.y - 2;
  const landIn = ep.aim === 'high' ? 34 : 10;
  const hx = above ? l.x - l.side * (f.hw + landIn) : l.x + l.side * (f.hw + 4);
  const hy = above ? l.y : l.y + f.h * 0.9;
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
  // air dodge onto the stage: out of jumps but already above the stage's top and close to the corner, a directional air
  // dodge carries us onto it without spending (and going helpless after) the up special
  const toCorner = (f.x - l.x) * l.side; // px beyond the corner
  if (above && ep.mix > 0 && f.jumpsLeft === 0 && !f.airDodgeUsed && !ep.specialPressed && toCorner > -4 && toCorner < 34 && l.y - f.y < 50 && f.vy > -1) {
    out.dodge = true;
    out.sx = -l.side * 0.75;
    out.sy = 0.66;
    return;
  }
  // a recall to a marker left on the stage (Vex's Blink Recall): warps straight back, invulnerable on arrival
  const rc = ai.recall;
  if (rc && !ep.recallTried && (below > -20 || f.jumpsLeft === 0)) {
    const mk = world.findDeployables(f.id, rc.marker)[0];
    if (mk && overStage(mk.x, mk.y, world)) {
      ep.recallTried = true;
      out.special = true;
      out.sx = 0;
      out.sy = 0;
      return;
    }
  }
  // physics-planned recovery (fixed up specials): fire the up special at the last frame its flown path still reaches the
  // ledge / stage, spend the double jump only when waiting longer would lose it, air dodge in when that is what it takes
  const path = rec.aim === 'fixed' && !(above && Math.abs(toCorner) < 60) ? upBPath(f, world, rec.slot) : null;
  if (path && ep.mix > 0.1) {
    const dirIn = -l.side;
    const out2 = (f.x - l.x) * l.side; // px outside the corner
    // drift in at full speed while level with / above the stage; below it, stay out from under the stage's underside
    if (f.y - f.h < l.y) {
      if (out2 > -4) out.sx = dirIn;
    } else out.sx = out2 < f.hw + 6 ? l.side : out2 > f.hw + 16 ? dirIn : 0;
    const s: Sim = { x: f.x, y: f.y, vx: f.vx, vy: f.vy };
    const now = pathReaches(f, l, path, s.x, s.y, s.vx);
    const s3: Sim = { ...s };
    for (let i = 0; i < 3; i++) drift(f, s3, dirIn);
    const later = pathReaches(f, l, path, s3.x, s3.y, s3.vx);
    if (now && !ep.specialPressed && !later && t >= ep.specialDelay) {
      out.special = true;
      out.steering = true;
      out.sy = -1;
      out.sx = dirIn;
      return;
    }
    if (now) return; // reachable later too: keep drifting in, keep the jump
    if (f.jumpsLeft > 0) {
      const jNow = jumpThenReaches(f, l, path, s, 0);
      if (jNow) {
        if (!jumpThenReaches(f, l, path, s, 3) && t >= ep.jumpDelay) out.jump = true;
        return;
      }
      if (driftThenReaches(f, l, path, s)) return;
      // nothing reaches: fall back to the plain rules below (jump once falling)
    } else if (!f.airDodgeUsed && ep.mix > 0 && f.vy > -1) {
      // a directional air dodge in and up (~40 px) then the up special
      // the dodge carries ~30 px each way, then ~12 frames of falling with no drift before control returns
      const d: Sim = { x: f.x + dirIn * 30, y: f.y - 26, vx: 0, vy: 0 };
      for (let i = 0; i < 12; i++) {
        d.vy = Math.min(f.stats.fallSpeed, d.vy + f.stats.gravity);
        d.y += d.vy;
      }
      if (pathReaches(f, l, path, d.x, d.y, 0) || driftThenReaches(f, l, path, d, 30)) {
        out.dodge = true;
        out.sx = dirIn * 0.7;
        out.sy = -0.7;
        return;
      }
    }
  }
  // horizontal recovery special (Pirate's Dash, Frost Step, Skewer Dash): from far out, at about stage height, it covers
  // the gap the jump and the up special could not
  const side = ai.sideRecovery;
  const far = Math.abs(dx) - rec.out - (f.jumpsLeft > 0 ? 70 : 20);
  if (side && !ep.sideUsed && far > 30 && below < reach * 0.3 && below > -140 && f.vy >= -1.5 && (f.jumpsLeft === 0 || far > 90)) {
    ep.sideUsed = true;
    out.special = true;
    out.sx = Math.sign(dx);
    out.sy = 0;
    out.steering = true;
    return;
  }
  // 1) double jump: once we are no longer rising and level with / below the hang point. With an edge-guarder waiting, a
  // recovery-savvy CPU holds the jump a little (comes in lower, out of the guard's reach) while it still has the height
  const holdLow = (ep.aim === 'low' || guard < 70) && ep.mix > 0 && below < reach * 0.45 && f.vy < 5 && Math.abs(dx) < rec.out + 60;
  if (f.jumpsLeft > 0 && f.vy >= -0.5 && below > -6 && t >= ep.jumpDelay && !(holdLow && below < 24)) {
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
  // never drift in under the stage's underside while below it (an up special from there hits the floor's bottom)
  if (!out.special && f.y - f.h > l.y + 2 && (f.x - l.x) * l.side < f.hw + 4) out.sx = l.side;
  // winged fighters out of flaps hold Jump to glide toward the stage
  if (f.data.glide && f.jumpsLeft === 0 && !out.special && f.vy > f.data.glide.fall && Math.abs(dx) > 8 && f.glideFrames < f.data.glide.max) out.jump = true;
}
