import { hurtRect } from './combat';
import type { Fighter } from './fighter';
import type { World } from './world';

/** A launched fighter flying at least this fast (px/frame) is a projectile: it crashes into whoever it meets. */
export const HUMAN_MIN_SPEED = 5.5;
/** Damage of a body-on-body crash: (speed - offset) x rate, capped. */
const CRASH_OFFSET = 3.5;
const CRASH_RATE = 1.1;
const CRASH_MAX = 13;
/** Launch base per unit of flight speed (the struck fighter is sent along the flier's path). */
const CRASH_BASE_PER_SPEED = 5.2;
/** Share of the crash damage the flier takes too. */
const FLIER_SHARE = 0.4;

const rA = [0, 0, 0, 0];
const rB = [0, 0, 0, 0];

const overlap = (a: number[], b: number[]): boolean => a[0] < b[0] + b[2] && a[0] + a[2] > b[0] && a[1] < b[1] + b[3] && a[1] + a[3] > b[1];

/** Can `f` be crashed into right now? */
function struckable(f: Fighter): boolean {
  return f.state !== 'ko' && f.invuln <= 0 && f.grabbedBy < 0 && f.state !== 'grabbed' && f.hitlag === 0;
}

/**
 * Human projectiles: a fighter in hitstun flying faster than HUMAN_MIN_SPEED who meets another fighter crashes into them.
 * The struck fighter takes damage by the flier's speed and is launched along the flier's path, harder the heavier the flier
 * is relative to them (credited to whoever launched the flier); the flier takes a share of the damage and loses momentum,
 * more of it the heavier the fighter it hit. Once per pair per launch, never the flier's own launcher or teammates of either.
 * Deterministic: fighters are visited in id order.
 */
export function stepCollisions(world: World): void {
  const fs = world.fighters;
  for (const a of fs) {
    if (a.state !== 'hitstun' || a.hitlag > 0) continue;
    const speed = Math.hypot(a.vx, a.vy);
    if (speed < HUMAN_MIN_SPEED) continue;
    hurtRect(a, rA);
    for (const b of fs) {
      if (b === a || !struckable(b)) continue;
      const bit = 1 << b.id;
      if (a.collideMask & bit) continue;
      if (b.id === a.lastHitBy || world.allied(a.id, b.id) || (a.lastHitBy >= 0 && world.allied(a.lastHitBy, b.id))) continue;
      hurtRect(b, rB);
      if (!overlap(rA, rB)) continue;
      crash(world, a, b, speed);
    }
  }
}

function crash(world: World, a: Fighter, b: Fighter, speed: number): void {
  const ma = a.stats.weight * a.sizeMul;
  const mb = b.stats.weight * b.sizeMul;
  const ratio = Math.sqrt(ma / mb); // heavy into light hits harder, light into heavy glances off
  const damage = Math.min(CRASH_MAX, Math.max(2, (speed - CRASH_OFFSET) * CRASH_RATE)) * Math.min(1.3, Math.max(0.75, ratio));
  const dir: 1 | -1 = a.vx > 0.2 ? 1 : a.vx < -0.2 ? -1 : b.x >= a.x ? 1 : -1;
  // send b along a's path (degrees above the horizontal, in b's frame: 0 = away, 90 = up, 270 = down)
  let angle = (Math.atan2(-a.vy, Math.abs(a.vx)) * 180) / Math.PI;
  if (angle < 0) angle += 360;
  const vxBefore = a.vx;
  const vyBefore = a.vy;
  a.collideMask |= 1 << b.id;
  b.receiveHit(
    {
      damage,
      base: speed * CRASH_BASE_PER_SPEED * ratio,
      scaling: 0.45,
      angle,
      direction: dir,
      hitlag: 7,
      attackerId: a.lastHitBy >= 0 ? a.lastHitBy : undefined,
    },
    world,
  );
  b.collideMask |= 1 << a.id; // no ping-pong straight back
  // the flier: a share of the damage, and it loses momentum (more of it into a heavier body)
  a.damage += damage * FLIER_SHARE;
  if (a.lastHitBy >= 0) world.damageDealt[a.lastHitBy] = (world.damageDealt[a.lastHitBy] ?? 0) + damage * FLIER_SHARE;
  const keep = 1 - 0.8 * (mb / (ma + mb));
  a.vx = vxBefore * keep;
  a.vy = vyBefore * keep;
  a.hitlag = Math.max(a.hitlag, 5);
  world.emit('collide', a, (a.x + b.x) / 2, (a.y - a.h / 2 + b.y - b.h / 2) / 2, speed, damage);
}
