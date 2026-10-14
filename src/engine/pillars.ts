import { hitboxActive, hitboxRect } from './combat';
import type { Deployable } from './entities';
import type { MoveKind } from './moves';
import { Platform } from './platform';
import type { World } from './world';

/** Platform ids for pillars start here, far above any stage's own platform ids. */
const PILLAR_ID_BASE = 1000;

/**
 * Crystal pillars: a deployable with a `pillar` def owns a temporary solid platform. It rises out of the ground (lifting
 * anyone standing where it comes up and hitting rivals it rises into), stands as a wall / platform that blocks fighters
 * and projectiles, then sinks back as its life runs out. When destroyed with `shatter` set it bursts into shard
 * projectiles. Runs right after the stage platforms update, before the fighters move, so riders follow it this tick.
 */
export function stepPillars(world: World): void {
  for (const d of world.deployables) {
    const pd = d.def?.pillar;
    if (d.plat && (!d.active || !pd)) {
      removePillar(world, d);
      continue;
    }
    if (!d.active || !pd) continue;
    const def = d.def!;
    if (!d.plat) {
      d.plat = new Platform(PILLAR_ID_BASE + d.index, { x: d.x - def.w / 2, y: d.y, w: def.w, h: def.h, kind: 'solid' }, true);
      world.platforms.push(d.plat);
      d.riseMask = 0;
    }
    const p = d.plat;
    const sink = pd.sinkFrames ?? 12;
    let k = Math.min(1, (d.age + 1) / Math.max(1, pd.riseFrames));
    if (def.life && d.age > def.life - sink) k = Math.min(k, Math.max(0, (def.life - d.age) / sink));
    const top = d.y - def.h * k;
    p.prevX = p.x;
    p.prevY = p.y;
    p.y = top;
    p.dx = 0;
    p.dy = p.y - p.prevY;
    if (p.dy < 0) lift(world, d, p);
  }
}

/** A rising pillar carries up anyone standing over it, and (once each) hits rivals it rises into. */
function lift(world: World, d: Deployable, p: Platform): void {
  const pd = d.def!.pillar!;
  for (const f of world.fighters) {
    if (f.state === 'ko' || f.grabbedBy >= 0) continue;
    const over = f.x + f.fhw > p.x && f.x - f.fhw < p.right;
    if (!over) continue;
    // feet between the new top and the old top (plus a little): the pillar came up under them
    if (f.y >= p.top - 0.5 && f.y <= p.prevY + 2 && f.vy >= -0.5) {
      f.y = p.top;
      f.prevY = Math.min(f.prevY, f.y + 4);
      f.vy = 0;
      // someone standing is carried up; someone airborne is only set on top, and lands on it through their own collision
      // this tick (marking them grounded here would skip the landing and leave them stuck in the air state on the pillar)
      if (f.grounded) f.groundPlat = p;
    }
    const bit = 1 << f.id;
    if (pd.riseHit && f.id !== d.owner && !world.allied(d.owner, f.id) && f.invuln <= 0 && !(d.riseMask & bit)) {
      // hit anyone whose body the pillar is rising through
      if (f.y - f.h < p.prevY + 2 && f.y >= p.top - 1) {
        d.riseMask |= bit;
        const h = pd.riseHit;
        f.receiveHit({ damage: h.damage, base: h.base, scaling: h.scaling, angle: h.angle, direction: f.x >= d.x ? 1 : -1, hitlag: h.hitlag ?? 6, attackerId: d.owner }, world);
      }
    }
  }
}

/** Take a pillar's platform out of the world: riders fall, and a shattered pillar bursts into shards. */
function removePillar(world: World, d: Deployable): void {
  const p = d.plat!;
  d.plat = null;
  const i = world.platforms.indexOf(p);
  if (i >= 0) world.platforms.splice(i, 1);
  for (const f of world.fighters) {
    // clear the support and let the normal ground check find there is nothing underfoot (the walk-off-an-edge path)
    if (f.groundPlat === p) f.groundPlat = null;
  }
  const pd = d.def?.pillar;
  const owner = world.fighters[d.owner];
  const cx = p.x + p.w / 2;
  const cy = (p.top + d.y) / 2;
  if (d.shatter && pd?.shards && owner && owner.state !== 'ko' && d.aimAngle >= 0) {
    // struck by its owner: the whole pillar is flung the way the blow was going, as a tight, fast spray
    const s = pd.shards;
    for (let k = 0; k < s.count; k++) {
      const a = ((d.aimAngle + (k - (s.count - 1) / 2) * STRIKE_SPREAD) * Math.PI) / 180;
      const sp = s.speed * STRIKE_SPEED * (1 - Math.abs(k - (s.count - 1) / 2) * 0.05);
      world.spawnProjectile(d.owner, s.projectile, cx, cy - 4 + k * 3, Math.cos(a) * sp * d.aimDir, -Math.sin(a) * sp, STRIKE_DAMAGE);
    }
    world.emit('pillarShatter', owner, cx, cy, p.top - d.y, d.owner);
  } else if (d.shatter && pd?.shards && owner && owner.state !== 'ko') {
    const s = pd.shards;
    for (let k = 0; k < s.count; k++) {
      // a fan from straight up to level on each side, weighted toward the sides
      const a = Math.PI * (0.06 + (0.88 * k) / Math.max(1, s.count - 1));
      world.spawnProjectile(d.owner, s.projectile, cx, cy, -Math.cos(a) * s.speed, -Math.sin(a) * s.speed * 0.7);
    }
    world.emit('pillarShatter', owner, cx, cy, p.top - d.y, d.owner);
  } else if (owner) {
    world.emit('pillarCrumble', owner, cx, d.y, p.top - d.y, d.owner);
  }
  d.shatter = false;
  d.aimAngle = -1;
}

/** Struck-pillar shards: fan width between shards (degrees), speed and damage multipliers over a plain shatter. */
const STRIKE_SPREAD = 8;
const STRIKE_SPEED = 1.35;
const STRIKE_DAMAGE = 0.6; // several shards of one spray usually connect
/** Move kinds whose hits can knock the owner's own pillars over (specials raise and stomp them on their own terms). */
const STRIKE_KINDS: ReadonlySet<MoveKind> = new Set<MoveKind>(['jab', 'tilt', 'dashAttack', 'smash', 'aerial']);
const rH = [0, 0, 0, 0];

/**
 * Smash your own pillars: a live melee hitbox of a pillar's owner touching one of its fully risen pillars shatters it, and
 * the shards fly the way the blow was going (along the hitbox's launch angle). Build a wall, then knock it into the rival.
 */
export function strikePillars(world: World): void {
  for (const f of world.fighters) {
    const m = f.move;
    if (f.state !== 'attack' || !m || f.hitlag > 0 || !STRIKE_KINDS.has(m.kind)) continue;
    for (const d of world.deployables) {
      const pd = d.def?.pillar;
      if (!d.active || d.owner !== f.id || !d.plat || !pd || d.age < pd.riseFrames) continue;
      const p = d.plat;
      for (const hb of m.hitboxes) {
        if (hb.grab || hb.throw || hb.damage <= 0 || !hitboxActive(f, m, hb)) continue;
        hitboxRect(f, hb, rH);
        if (rH[0] >= p.right || rH[0] + rH[2] <= p.x || rH[1] >= p.bottom || rH[1] + rH[3] <= p.top) continue;
        d.aimAngle = hb.angle === 361 ? 40 : hb.angle;
        d.aimDir = hb.dir === 'away' ? (d.x >= f.x ? 1 : -1) : f.facing;
        d.shatter = true;
        d.deactivate();
        f.hitlag = Math.max(f.hitlag, 6); // a crunch of hit-stop on the blow
        break;
      }
    }
  }
}

/** Shatter every pillar `ownerId` has within `range` of x (Bedrock Stomp). Returns how many broke. */
export function shatterPillars(world: World, ownerId: number, x: number, range: number): number {
  let n = 0;
  for (const d of world.deployables) {
    if (!d.active || d.owner !== ownerId || !d.def?.pillar || Math.abs(d.x - x) > range) continue;
    d.shatter = true;
    d.deactivate();
    n++;
  }
  return n;
}
