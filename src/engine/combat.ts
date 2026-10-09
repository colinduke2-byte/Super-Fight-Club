import { MAX_GROUPS, GRAB_DISTANCE, type Fighter } from './fighter';
import { hitboxFrames, type HitboxDef, type MoveDef } from './moves';
import type { World } from './world';

/** Damage difference below which two simultaneous hits both land (a trade). */
export const TRADE_THRESHOLD = 9;
const HITLAG_BASE = 4;
const HITLAG_PER_DAMAGE = 0.4;
const HITLAG_MAX = 24;
const MAX_CANDIDATES = 16;

interface Candidate {
  atk: Fighter;
  def: Fighter;
  hb: HitboxDef;
  move: MoveDef;
  damage: number;
  alive: boolean;
}

const pool: Candidate[] = Array.from({ length: MAX_CANDIDATES }, () => ({ atk: null as unknown as Fighter, def: null as unknown as Fighter, hb: null as unknown as HitboxDef, move: null as unknown as MoveDef, damage: 0, alive: false }));
let count = 0;

/** Hitbox rect in world space. Writes into `out` = [x, y, w, h] (top-left). */
export function hitboxRect(f: Fighter, hb: HitboxDef, out: number[]): void {
  let ox = hb.x;
  let oy = hb.y;
  if (hb.travel && f.move) {
    // beams / sweeps: the box moves from its first live frame
    const off = Math.max(0, f.moveFrame - hitboxFrames(f.move, hb)[0]);
    ox += hb.travel.vx * off;
    oy += hb.travel.vy * off;
  }
  const cx = f.x + f.facing * ox;
  const cy = f.y + oy;
  out[0] = cx - hb.w / 2;
  out[1] = cy - hb.h / 2;
  out[2] = hb.w;
  out[3] = hb.h;
}

export function hurtRect(f: Fighter, out: number[]): void {
  const h = f.hurtH;
  out[0] = f.x - f.hw;
  out[1] = f.y - h;
  out[2] = f.hw * 2;
  out[3] = h;
}

const rA = [0, 0, 0, 0];
const rB = [0, 0, 0, 0];

function overlap(a: number[], b: number[]): boolean {
  return a[0] < b[0] + b[2] && a[0] + a[2] > b[0] && a[1] < b[1] + b[3] && a[1] + a[3] > b[1];
}

/** Is this hitbox live on the fighter's current move frame? */
export function hitboxActive(f: Fighter, m: MoveDef, hb: HitboxDef): boolean {
  const [a, b] = hitboxFrames(m, hb);
  return f.moveFrame >= a && f.moveFrame <= b;
}

function canHit(atk: Fighter, def: Fighter, hb: HitboxDef): boolean {
  const g = hb.group ?? 0;
  if ((atk.hitMask[def.id] & (1 << g)) !== 0) return false;
  if (def.state === 'ko' || def.id === atk.id) return false;
  if (hb.throw) return def.grabbedBy === atk.id;
  if (def.state === 'grabbed') return false; // grabbed fighters can only be hit by their captor's throw
  if (def.invuln > 0) return false;
  return true;
}

/**
 * Collect every hit that connects this tick, resolve simultaneous-hit trades, then apply them.
 * Deterministic: attackers are processed in id order.
 */
export function resolveCombat(world: World): void {
  count = 0;
  const fs = world.fighters;
  for (const atk of fs) {
    const m = atk.move;
    if (atk.state !== 'attack' || !m || atk.hitlag > 0) continue;
    for (const def of fs) {
      if (def === atk) continue;
      hurtRect(def, rB);
      for (const hb of m.hitboxes) {
        if (!hitboxActive(atk, m, hb) || !canHit(atk, def, hb)) continue;
        hitboxRect(atk, hb, rA);
        if (!overlap(rA, rB)) continue;
        if (count < MAX_CANDIDATES) {
          const c = pool[count++];
          c.atk = atk;
          c.def = def;
          c.hb = hb;
          c.move = m;
          c.damage = hb.damage * atk.damageMult * damageCharge(atk, m);
          c.alive = true;
        }
        break; // first overlapping hitbox in the list has priority
      }
    }
  }

  // trades: A hits B while B hits A on the same tick
  for (let i = 0; i < count; i++) {
    const a = pool[i];
    if (!a.alive || a.hb.grab || a.hb.throw) continue;
    for (let j = i + 1; j < count; j++) {
      const b = pool[j];
      if (!b.alive || b.hb.grab || b.hb.throw) continue;
      if (a.atk !== b.def || a.def !== b.atk) continue;
      const diff = a.damage - b.damage;
      if (diff >= TRADE_THRESHOLD) b.alive = false; // stronger move cleanly beats the weaker one
      else if (-diff >= TRADE_THRESHOLD) a.alive = false;
      else world.emit('trade', a.atk, (a.atk.x + b.atk.x) / 2, a.atk.y - a.atk.h / 2, 0, 0);
    }
  }

  for (let i = 0; i < count; i++) {
    const c = pool[i];
    if (c.alive) applyHit(world, c);
  }
}

function damageCharge(atk: Fighter, m: MoveDef): number {
  return m.charge ? 1 + (m.charge.damageMult - 1) * atk.chargeFrac : 1;
}

function applyHit(world: World, c: Candidate): void {
  const { atk, def, hb, move } = c;
  const g = hb.group ?? 0;
  atk.hitMask[def.id] |= 1 << g;
  if (hb.rehit) atk.rehit[def.id * MAX_GROUPS + g] = hb.rehit;
  atk.moveHit = true;
  const midY = def.y - def.h / 2;

  // --- grabs ---
  if (hb.grab) {
    if (def.state === 'hitstun' || def.state === 'ledge') return;
    if (hb.cinematic && move.cinematic) {
      world.startCinematic(atk, def, move);
      return;
    }
    atk.grabVictim(def);
    def.x = atk.x + atk.facing * GRAB_DISTANCE;
    def.y = atk.y;
    def.facing = (-atk.facing) as 1 | -1;
    world.emit('grab', def, def.x, midY, 0, 0);
    return;
  }

  const away: 1 | -1 = def.x === atk.x ? atk.facing : def.x > atk.x ? 1 : -1;
  const kbMult = move.charge ? 1 + ((move.charge.kbMult ?? 1) - 1) * atk.chargeFrac : 1;

  // --- throws: victim is already held; release and launch ---
  if (hb.throw) {
    const direction: 1 | -1 = hb.dir === 'away' ? away : atk.facing;
    def.releaseGrab();
    def.grabbedBy = -1;
    def.receiveHit({ damage: c.damage, base: hb.base, scaling: hb.scaling, angle: hb.angle, direction, moveWeight: hb.weight, hitlag: 0, attackerId: atk.id, kbMult }, world);
    atk.grabTarget = -1;
    atk.gainMeter(c.damage, world);
    world.emit('throw', def, def.x, midY, 0, c.damage);
    return;
  }

  deliverHit(world, { atk, ownerId: atk.id, def, hb, damage: c.damage, facing: atk.facing, originX: atk.x, kbMult });
}

/** Everything needed to land one hit, whatever produced it (a fighter's hitbox, a projectile, a trap). */
export interface HitDelivery {
  /** The fighter that owns the hit (receives hitlag / meter / hooks). Null if the owner is gone. */
  atk: Fighter | null;
  ownerId: number;
  def: Fighter;
  hb: HitboxDef;
  damage: number;
  facing: 1 | -1;
  /** X of the hit source, used for `dir: 'away'`. */
  originX: number;
  kbMult: number;
  /** Projectiles / traps do not freeze their owner. */
  freezeOwner?: boolean;
}

/** Shield -> armor -> clean-hit resolution shared by every hit source. */
export function deliverHit(world: World, d: HitDelivery): void {
  const { atk, def, hb } = d;
  const midY = def.y - def.h / 2;
  const away: 1 | -1 = def.x === d.originX ? d.facing : def.x > d.originX ? 1 : -1;
  const direction: 1 | -1 = hb.dir === 'away' ? away : d.facing;
  const hl = Math.round(Math.min(HITLAG_MAX, Math.floor(d.damage * HITLAG_PER_DAMAGE + HITLAG_BASE) * (hb.hitlag ?? 1)));
  const owner = d.freezeOwner === false ? null : atk;

  // --- shield ---
  if ((def.state === 'shield' || def.state === 'shieldstun') && !hb.unblockable) {
    def.shieldHit(d.damage, !!hb.breaksShield, hb.shieldDamage ?? 1, away, world);
    def.hitlag = Math.round(hl * 0.8);
    if (owner) {
      owner.hitlag = Math.round(hl * 0.8);
      if (owner.grounded) owner.vx = -away * 1.2;
    }
    world.emit('shieldHit', def, def.x, midY, def.shieldRadius, d.damage);
    return;
  }

  // --- armor ---
  const armor = def.armorThreshold();
  if (armor >= 0 && d.damage <= armor) {
    def.damage += d.damage;
    def.hitlag = Math.round(hl * 0.6);
    if (owner) owner.hitlag = hl;
    def.lastHitBy = d.ownerId;
    def.gainMeterTaken(d.damage);
    world.emit('armorHit', def, def.x, midY, d.damage, d.damage);
    atk?.gainMeter(d.damage, world);
    return;
  }

  // --- clean hit ---
  def.receiveHit(
    { damage: d.damage, base: hb.base, scaling: hb.scaling, angle: hb.angle, direction, moveWeight: hb.weight, hitlag: hl, minHitstun: hb.minHitstun, kbMult: d.kbMult, attackerId: d.ownerId },
    world,
  );
  if (hb.status) def.applyStatus(hb.status, world);
  if (owner) owner.hitlag = hl;
  if (atk) {
    atk.gainMeter(d.damage, world);
    atk.data.behavior?.onHitDealt?.(atk, def, hb, d.damage, world);
  }
}
