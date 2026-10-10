/**
 * Knockback model.
 *
 *   knockback = (base + damage% * scaling) * move_weight / target_weight
 *
 * `damage%` is the target's percent AFTER the hit's damage has been applied.
 * The launch angle comes from the move (degrees, 0 = straight ahead, 90 = up) and is
 * mirrored by the attacker's facing. Hitstun scales linearly with knockback.
 */

/** Reference weight for moves; a move with weight 100 vs a target of weight 100 is neutral. */
export const DEFAULT_MOVE_WEIGHT = 100;

/** Launch speed (px / sim frame) per point of knockback. */
export const KB_TO_SPEED = 0.05;
export const MAX_LAUNCH_SPEED = 24;
/** Hitstun frames per point of knockback. */
export const HITSTUN_PER_KB = 0.4;
/** Horizontal drag (px/frame^2) applied while in hitstun. */
export const LAUNCH_DRAG = 0.085;

export interface KnockbackParams {
  base: number;
  scaling: number;
  damagePercent: number;
  moveWeight?: number;
  targetWeight: number;
}

export function computeKnockback(p: KnockbackParams): number {
  const moveWeight = p.moveWeight ?? DEFAULT_MOVE_WEIGHT;
  const tw = p.targetWeight > 0 ? p.targetWeight : 1;
  return Math.max(0, ((p.base + p.damagePercent * p.scaling) * moveWeight) / tw);
}

export function hitstunFrames(knockback: number): number {
  return Math.max(0, Math.floor(knockback * HITSTUN_PER_KB));
}

export interface LaunchVector {
  vx: number;
  vy: number;
}

/**
 * Convert knockback + move angle into a launch velocity.
 * @param angleDeg   move launch angle, 0 = horizontal away, 90 = straight up
 * @param direction  +1 if the victim should be sent right, -1 left
 * Writes into `out` (allocation-free).
 */
export function launchVelocity(knockback: number, angleDeg: number, direction: 1 | -1, out: LaunchVector): LaunchVector {
  const speed = Math.min(MAX_LAUNCH_SPEED, knockback * KB_TO_SPEED);
  const rad = (angleDeg * Math.PI) / 180;
  out.vx = Math.cos(rad) * speed * direction;
  out.vy = -Math.sin(rad) * speed; // up is negative
  return out;
}
