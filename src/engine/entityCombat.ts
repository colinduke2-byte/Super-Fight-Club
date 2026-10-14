import { deliverHit, hitboxActive, hitboxRect, hurtRect } from './combat';
import type { Deployable, Projectile } from './entities';
import type { Fighter } from './fighter';
import type { World } from './world';

const rA = [0, 0, 0, 0];
const rB = [0, 0, 0, 0];

function overlap(a: number[], b: number[]): boolean {
  return a[0] < b[0] + b[2] && a[0] + a[2] > b[0] && a[1] < b[1] + b[3] && a[1] + a[3] > b[1];
}

function projRect(p: Projectile, out: number[]): void {
  const d = p.def!;
  out[0] = p.x - d.w / 2;
  out[1] = p.y - d.h / 2;
  out[2] = d.w;
  out[3] = d.h;
}

function depRect(d: Deployable, out: number[]): void {
  const def = d.def!;
  out[0] = d.x - def.w / 2;
  out[1] = d.y - def.h;
  out[2] = def.w;
  out[3] = def.h;
}

// ---------------------------------------------------------------------------------------------
// Movement / lifetimes
// ---------------------------------------------------------------------------------------------
export function updateEntities(world: World): void {
  updateProjectiles(world);
  updateDeployables(world);
}

function updateProjectiles(world: World): void {
  const b = world.blast;
  for (const p of world.projectiles) {
    if (!p.active) continue;
    const def = p.def!;
    p.prevX = p.x;
    p.prevY = p.y;
    p.age++;
    if (p.age > def.life) {
      p.deactivate();
      continue;
    }
    for (let i = 0; i < p.rehit.length; i++) if (p.rehit[i] > 0) p.rehit[i]--;

    if (def.steer) {
      // a remote missile: while its owner holds the controlling move, the stick turns it (speed stays constant)
      const owner = world.fighters[p.owner];
      if (owner && owner.state === 'attack' && owner.move?.id === def.steer.move && Math.abs(owner.stick.y) > 0.25) {
        const sp = Math.hypot(p.vx, p.vy);
        let a = Math.atan2(p.vy, p.vx);
        a += owner.stick.y * def.steer.turn * (Math.cos(a) >= 0 ? 1 : -1);
        p.vx = Math.cos(a) * sp;
        p.vy = Math.sin(a) * sp;
      }
    }
    if (def.boomerang) {
      const owner = world.fighters[p.owner];
      if (p.age < def.boomerang.out) {
        p.vy *= 0.9;
      } else if (owner) {
        if (p.age === def.boomerang.out) {
          p.rehit.fill(0); // the return trip can hit again
          p.hitOnce.fill(0);
        }
        // home back to the owner's chest
        const dx = owner.x - p.x;
        const dy = owner.y - owner.h / 2 - p.y;
        const d = Math.hypot(dx, dy) || 1;
        if (d < def.boomerang.speed + 6) {
          p.deactivate();
          if (owner.state !== 'hitstun' && owner.state !== 'grabbed' && owner.state !== 'ko') {
            world.emit('fx', owner, p.x, p.y, owner.facing, 0, 'catch');
            owner.data.behavior?.onProjectileReturn?.(owner, p.defId, world);
          }
          continue;
        }
        p.vx = (dx / d) * def.boomerang.speed;
        p.vy = (dy / d) * def.boomerang.speed;
      }
    } else if (def.path?.kind === 'zigzag') {
      // oscillate +-amp px around the launch height
      p.vy = p.baseY + def.path.amp * Math.sin((p.age / def.path.period) * Math.PI * 2) - p.y;
    } else {
      p.vy += def.gravity ?? 0;
      const mf = def.maxFall ?? 99;
      if (p.vy > mf) p.vy = mf;
    }
    if (def.drag) p.vx *= 1 - def.drag;
    p.x += p.vx;
    p.y += p.vy;

    if (p.x < b.left || p.x > b.right || p.y < b.top || p.y > b.bottom) {
      p.deactivate();
      continue;
    }

    // solid platforms stop (or bounce) projectiles; one-way platforms are ignored
    projRect(p, rA);
    for (const plat of world.platforms) {
      if (plat.kind !== 'solid') continue;
      rB[0] = plat.x;
      rB[1] = plat.y;
      rB[2] = plat.w;
      rB[3] = plat.h;
      if (!overlap(rA, rB)) continue;
      const pillar = plat.dynamic ? world.deployables.find((d) => d.plat === plat && d.active) : undefined;
      if (pillar) {
        // a crystal pillar: its owner's shots shatter it into shards, a rival's chip at it (a teammate's are only stopped)
        if (p.owner === pillar.owner) {
          pillar.shatter = true;
          pillar.deactivate();
        } else if (!world.allied(p.owner, pillar.owner)) {
          pillar.hp -= def.hit.damage * p.dmgMult;
          if (pillar.hp <= 0) destroyDeployable(world, pillar, p.owner);
        }
        world.emit('projectileHit', world.fighters[p.owner], p.x, p.y, 0, 0);
        p.deactivate();
        break;
      }
      if (def.bounce && p.vy > 0 && p.prevY + def.h / 2 <= plat.top + 1) {
        p.y = plat.top - def.h / 2;
        p.vy = -p.vy * def.bounce;
        p.vx *= 0.95;
      } else {
        world.emit('projectileHit', world.fighters[p.owner], p.x, p.y, 0, 0);
        p.deactivate();
      }
      break;
    }
  }
}

function updateDeployables(world: World): void {
  for (const d of world.deployables) {
    if (!d.active) continue;
    const def = d.def!;
    const owner = world.fighters[d.owner];
    if (!owner || owner.state === 'ko') {
      d.deactivate(); // a KO'd fighter's traps vanish
      continue;
    }
    d.age++;
    if (def.life && d.age > def.life) {
      d.deactivate();
      continue;
    }
    if (d.modFrames > 0 && --d.modFrames === 0) {
      d.fireRateMul = 1;
      d.damageMul = 1;
      d.shield = 0;
    }
    if (!d.grounded) {
      d.vy = Math.min(8, d.vy + 0.5);
      const prevY = d.y;
      d.y += d.vy;
      for (const plat of world.platforms) {
        if (d.x < plat.x || d.x > plat.right) continue;
        if (prevY <= plat.top + 0.5 && d.y >= plat.top) {
          d.y = plat.top;
          d.vy = 0;
          d.grounded = true;
          break;
        }
      }
      if (d.y > world.blast.bottom) d.deactivate();
    } else if (d.grounded && def.gravity && d.attached < 0) {
      // keep following a moving platform it rests on; with nothing underneath any more (a shattered pillar) it falls again
      let supported = false;
      for (const plat of world.platforms) {
        if (d.x < plat.x || d.x > plat.right) continue;
        if (plat.moving && Math.abs(d.y - plat.prevY) < 1) {
          d.x += plat.dx;
          d.y = plat.top;
          supported = true;
        } else if (Math.abs(d.y - plat.top) < 1) supported = true;
      }
      if (!supported) {
        d.grounded = false;
        d.vy = 0;
      }
    }
    if (d.attached >= 0) {
      // planted on a rival: ride along on their body (and fall off if they are KO'd)
      const host = world.fighters[d.attached];
      if (!host || host.state === 'ko') {
        // the host is gone: the charge drops (and falls off the world) instead of hanging in the air
        d.attached = -1;
        d.grounded = false;
        d.vy = 0;
      }
      else {
        d.x = host.x;
        d.y = host.y - host.h * 0.45;
        d.grounded = true;
      }
    }
    if (def.turret && d.age >= (def.armFrames ?? 0)) runTurret(world, d);
    if (def.pull) pullToward(world, d, def.pull.radius, def.pull.strength);
  }
}

/** A vortex (Riptide's Whirlpool): rivals standing near it are dragged toward its centre, harder the closer they get. */
function pullToward(world: World, d: Deployable, radius: number, strength: number): void {
  for (const f of world.fighters) {
    if (f.id === d.owner || f.state === 'ko' || f.state === 'grabbed' || f.state === 'ledge' || world.allied(d.owner, f.id)) continue;
    const dx = d.x - f.x;
    if (Math.abs(dx) > radius || Math.abs(f.y - d.y) > 40) continue;
    const k = 1 - Math.abs(dx) / radius;
    f.x += Math.sign(dx) * Math.min(Math.abs(dx), strength * (0.4 + 0.6 * k));
  }
}

function runTurret(world: World, d: Deployable): void {
  const t = d.def!.turret!;
  if (d.turretCd > 0) {
    d.turretCd -= d.fireRateMul;
    return;
  }
  let best: Fighter | null = null;
  let bestDist = Infinity;
  for (const f of world.fighters) {
    if (f.id === d.owner || f.state === 'ko' || world.allied(d.owner, f.id)) continue;
    const dx = f.x - d.x;
    const dy = f.y - f.h / 2 - (d.y - d.def!.h / 2);
    if (Math.abs(dx) > t.range || Math.abs(dy) > 48) continue;
    if (Math.abs(dx) < bestDist) {
      best = f;
      bestDist = Math.abs(dx);
    }
  }
  if (!best) return;
  d.facing = best.x >= d.x ? 1 : -1;
  world.spawnProjectile(d.owner, t.projectile, d.x + d.facing * t.muzzleX, d.y + t.muzzleY, d.facing * t.speed, 0, d.damageMul);
  d.turretCd = t.interval;
}

// ---------------------------------------------------------------------------------------------
// Hits
// ---------------------------------------------------------------------------------------------
export function resolveEntityCombat(world: World): void {
  reflectProjectiles(world);
  projectilesHitFighters(world);
  attacksHitEntities(world);
  triggerDeployables(world);
  resolveBlasts(world);
}

/** Blast projectiles that died this tick go off: everyone (but the owner and its team) in the radius is hit once. */
export function resolveBlasts(world: World): void {
  for (const p of world.projectiles) {
    const def = p.def;
    if (p.active || !def?.blast || p.exploded || p.age === 0) continue;
    p.exploded = true;
    const hb = def.blast.hit ?? def.hit;
    const owner = world.fighters[p.owner] ?? null;
    const r = def.blast.radius;
    for (const f of world.fighters) {
      if (f.id === p.owner || f.state === 'ko' || f.state === 'grabbed' || f.invuln > 0 || p.hitOnce[f.id] || world.allied(p.owner, f.id)) continue;
      hurtRect(f, rB);
      const nx = Math.max(rB[0], Math.min(p.x, rB[0] + rB[2]));
      const ny = Math.max(rB[1], Math.min(p.y, rB[1] + rB[3]));
      if (Math.hypot(nx - p.x, ny - p.y) > r) continue;
      deliverHit(world, { atk: owner, ownerId: p.owner, def: f, hb: { ...hb, dir: 'away' }, damage: hb.damage * p.dmgMult, facing: p.dir, originX: p.x, kbMult: 1, freezeOwner: false });
    }
    world.emit('blast', owner ?? world.fighters[0], p.x, p.y, r, p.owner);
  }
}

function reflectProjectiles(world: World): void {
  for (const f of world.fighters) {
    const b = f.barrier;
    if (b.frames <= 0 || f.state === 'ko') continue;
    rB[0] = f.x + f.facing * b.x - b.w / 2;
    rB[1] = f.y + b.y - b.h / 2;
    rB[2] = b.w;
    rB[3] = b.h;
    for (const p of world.projectiles) {
      if (!p.active || p.owner === f.id || p.def!.reflectable === false) continue;
      projRect(p, rA);
      if (!overlap(rA, rB)) continue;
      p.owner = f.id;
      p.vx = -p.vx * 1.1;
      p.vy = -p.vy;
      p.dmgMult *= 1.3;
      p.age = Math.floor(p.age / 2);
      p.reflects++;
      p.rehit.fill(0);
      p.hitOnce.fill(0);
      world.emit('reflect', f, p.x, p.y, 0, 0);
    }
  }
}

function projectilesHitFighters(world: World): void {
  for (const p of world.projectiles) {
    if (!p.active) continue;
    const def = p.def!;
    const owner = world.fighters[p.owner] ?? null;
    projRect(p, rA);
    for (const f of world.fighters) {
      if (f.id === p.owner || f.state === 'ko' || f.state === 'grabbed' || world.allied(p.owner, f.id)) continue;
      if (p.rehit[f.id] > 0 || (!def.pierce && p.hitOnce[f.id])) continue;
      if (f.invuln > 0) continue;
      hurtRect(f, rB);
      if (!overlap(rA, rB)) continue;
      p.hitOnce[f.id] = 1;
      p.rehit[f.id] = def.hit.rehit ?? 9999;
      deliverHit(world, {
        atk: owner,
        ownerId: p.owner,
        def: f,
        hb: def.hit,
        damage: def.hit.damage * p.dmgMult,
        facing: p.dir,
        originX: p.x,
        kbMult: 1,
        freezeOwner: false,
      });
      world.emit('projectileHit', f, p.x, p.y, 1, def.hit.damage);
      if (!def.pierce) {
        p.deactivate();
        break;
      }
    }
  }
}

/** Fighters' live hitboxes damage enemy projectiles (with health) and deployables. */
function attacksHitEntities(world: World): void {
  for (const atk of world.fighters) {
    const m = atk.move;
    if (atk.state !== 'attack' || !m || atk.hitlag > 0) continue;
    for (const hb of m.hitboxes) {
      if (!hitboxActive(atk, m, hb) || hb.grab || hb.throw) continue;
      hitboxRect(atk, hb, rA);
      for (const p of world.projectiles) {
        if (!p.active || p.owner === atk.id || p.hp <= 0 || world.allied(p.owner, atk.id)) continue;
        const bit = 1 << (p.index & 31);
        const w = p.index >> 5;
        if (atk.hitProjMask[w] & bit) continue;
        projRect(p, rB);
        if (!overlap(rA, rB)) continue;
        atk.hitProjMask[w] |= bit;
        p.hp -= hb.damage * atk.outMul;
        if (p.hp <= 0) {
          p.deactivate();
          world.emit('projectileHit', atk, p.x, p.y, 0, hb.damage);
        }
      }
      for (const d of world.deployables) {
        if (!d.active || d.owner === atk.id || d.def!.health <= 0 || world.allied(d.owner, atk.id)) continue;
        const bit = 1 << (d.index & 31);
        if (atk.hitDepMask & bit) continue;
        depRect(d, rB);
        if (!overlap(rA, rB)) continue;
        atk.hitDepMask |= bit;
        let dmg = hb.damage * atk.outMul;
        if (d.shield > 0) {
          const soak = Math.min(d.shield, dmg);
          d.shield -= soak;
          dmg -= soak;
        }
        d.hp -= dmg;
        if (d.hp <= 0) destroyDeployable(world, d, atk.id);
      }
    }
  }
}

export function destroyDeployable(world: World, d: Deployable, byFighter: number): void {
  const def = d.def!;
  const owner = world.fighters[d.owner];
  d.deactivate();
  if (owner && def.reward) owner.res[def.reward.key] = (owner.res[def.reward.key] ?? 0) + def.reward.add;
  world.emit('deployableDestroyed', owner, d.x, d.y - def.h / 2, byFighter, d.owner);
  owner?.data.behavior?.onDeployableDestroyed?.(owner, d.defId, world);
}

/**
 * Set off a trigger deployable on command (remote mines, C4): every rival within `radius` px of it takes its trigger hit,
 * then it is gone. Returns how many fighters it caught.
 */
export function detonateDeployable(world: World, d: Deployable, radius: number): number {
  const def = d.def;
  const trig = def?.trigger;
  if (!d.active || !def || !trig) return 0;
  let n = 0;
  const owner = world.fighters[d.owner] ?? null;
  const cy = d.y - def.h / 2;
  for (const f of world.fighters) {
    if (f.id === d.owner || f.state === 'ko' || f.invuln > 0 || f.state === 'grabbed' || world.allied(d.owner, f.id)) continue;
    hurtRect(f, rB);
    const nx = Math.max(rB[0], Math.min(d.x, rB[0] + rB[2]));
    const ny = Math.max(rB[1], Math.min(cy, rB[1] + rB[3]));
    if (Math.hypot(nx - d.x, ny - cy) > radius) continue;
    deliverHit(world, { atk: owner, ownerId: d.owner, def: f, hb: trig.hit, damage: trig.hit.damage * d.damageMul, facing: d.facing, originX: d.x, kbMult: 1, freezeOwner: false });
    n++;
  }
  world.emit('deployableTrigger', owner ?? world.fighters[0], d.x, cy, radius, trig.hit.damage);
  d.deactivate();
  return n;
}

function triggerDeployables(world: World): void {
  for (const d of world.deployables) {
    if (!d.active) continue;
    const def = d.def!;
    const trig = def.trigger;
    if (!trig || trig.remote || d.age < (def.armFrames ?? 0)) continue;
    depRect(d, rA);
    for (const f of world.fighters) {
      if (f.id === d.owner || f.state === 'ko' || f.invuln > 0 || f.state === 'grabbed' || world.allied(d.owner, f.id)) continue;
      hurtRect(f, rB);
      if (!overlap(rA, rB)) continue;
      const owner = world.fighters[d.owner] ?? null;
      world.emit('deployableTrigger', f, d.x, d.y - def.h / 2, 0, trig.hit.damage);
      deliverHit(world, { atk: owner, ownerId: d.owner, def: f, hb: trig.hit, damage: trig.hit.damage * d.damageMul, facing: d.facing, originX: d.x, kbMult: 1, freezeOwner: false });
      if (!trig.persistent) d.deactivate();
      break;
    }
  }
}
