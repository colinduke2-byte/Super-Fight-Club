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

    if (def.path?.kind === 'zigzag') {
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
    } else if (d.grounded && def.gravity) {
      // keep following a moving platform it rests on
      for (const plat of world.platforms) {
        if (plat.moving && d.x >= plat.x && d.x <= plat.right && Math.abs(d.y - plat.prevY) < 1) {
          d.x += plat.dx;
          d.y = plat.top;
        }
      }
    }
    if (def.turret && d.age >= (def.armFrames ?? 0)) runTurret(world, d);
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
    if (f.id === d.owner || f.state === 'ko') continue;
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
      if (f.id === p.owner || f.state === 'ko' || f.state === 'grabbed') continue;
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
        if (!p.active || p.owner === atk.id || p.hp <= 0) continue;
        const bit = 1 << (p.index & 31);
        const w = p.index >> 5;
        if (atk.hitProjMask[w] & bit) continue;
        projRect(p, rB);
        if (!overlap(rA, rB)) continue;
        atk.hitProjMask[w] |= bit;
        p.hp -= hb.damage * atk.damageMult;
        if (p.hp <= 0) {
          p.deactivate();
          world.emit('projectileHit', atk, p.x, p.y, 0, hb.damage);
        }
      }
      for (const d of world.deployables) {
        if (!d.active || d.owner === atk.id || d.def!.health <= 0) continue;
        const bit = 1 << (d.index & 31);
        if (atk.hitDepMask & bit) continue;
        depRect(d, rB);
        if (!overlap(rA, rB)) continue;
        atk.hitDepMask |= bit;
        let dmg = hb.damage * atk.damageMult;
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

function triggerDeployables(world: World): void {
  for (const d of world.deployables) {
    if (!d.active) continue;
    const def = d.def!;
    const trig = def.trigger;
    if (!trig || d.age < (def.armFrames ?? 0)) continue;
    depRect(d, rA);
    for (const f of world.fighters) {
      if (f.id === d.owner || f.state === 'ko' || f.invuln > 0 || f.state === 'grabbed') continue;
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
