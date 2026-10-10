import type { Fighter } from '../engine/fighter';
import type { World } from '../engine/world';

/** How far a fighter has been knocked off the stage's top surface (positive = below). Cheap "is in trouble" signal. */
function vulnerable(f: Fighter): number {
  if (f.state === 'hitstun' || f.state === 'shieldbreak' || f.state === 'stunned' || f.state === 'frozen') return 1;
  return 0;
}

/**
 * Free-for-all target choice. A score per opponent: closer is better, damaged opponents are tastier (kill range),
 * whoever just hit us is a grudge target, opponents already in trouble are opportunities. A per-CPU `bias` (seeded
 * jitter) stops several CPUs ganging up on the same player, and `prev` gives hysteresis so the choice does not flip
 * every frame. Returns the fighter id, or -1 when nobody is alive.
 */
export function chooseTarget(self: Fighter, world: World, prev: number, bias: readonly number[]): number {
  let best = -1;
  let bestScore = -Infinity;
  const alive: number[] = [];
  for (const f of world.fighters) if (f !== self && f.state !== 'ko') alive.push(f.id);
  if (alive.length === 0) return -1;
  if (alive.length === 1) return alive[0];
  for (const id of alive) {
    const f = world.fighters[id];
    const d = Math.hypot(f.x - self.x, f.y - self.y);
    let s = -d * 0.55;
    s += Math.min(f.damage, 160) * 0.5; // kill range
    if (self.lastHitBy === id) s += 140; // grudge
    s += vulnerable(f) * 25;
    // someone already fighting this opponent? leave them to it (soft anti pile-on): count others close to them
    let crowd = 0;
    for (const o of world.fighters) {
      if (o === self || o === f || o.state === 'ko') continue;
      if (Math.hypot(o.x - f.x, o.y - f.y) < 70 && (o.state === 'attack' || o.state === 'run')) crowd++;
    }
    s -= crowd * 35;
    s += bias[id % bias.length] ?? 0;
    if (id === prev) s += 40;
    if (s > bestScore) {
      bestScore = s;
      best = id;
    }
  }
  return best;
}
