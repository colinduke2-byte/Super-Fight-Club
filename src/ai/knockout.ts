import type { Fighter } from '../engine/fighter';
import { DI_MAX_ANGLE, HITSTUN_FALL_GRAVITY, HITSTUN_RISE_GRAVITY, SOAK_KB_PER_LEVEL } from '../engine/fighter';
import { computeKnockback, hitstunFrames, KB_TO_SPEED, LAUNCH_DRAG, MAX_LAUNCH_SPEED } from '../engine/knockback';
import type { World } from '../engine/world';
import type { AiMove } from './moveInfo';

/**
 * Launch prediction for the CPU's decisions: would this hit kill, and which way should we DI to live? Everything is
 * computed from the engine's own knockback formula and launch physics, so it keeps working when launch tuning changes.
 */

/** How a flight ends, with the closest approach to a blast zone (px; negative = past it). */
export interface Flight {
  ko: boolean;
  /** Smallest distance to any blast zone along the flight (px). */
  margin: number;
}

const tmp: Flight = { ko: false, margin: 0 };

/**
 * Fly a launched body from (x, y) with velocity (vx, vy) and `stun` frames of hitstun (launch drag, hitstun gravity, then
 * ordinary falling) until it lands on a platform top, passes a blast zone or `frames` run out.
 */
export function fly(f: Fighter, world: World, x: number, y: number, vx: number, vy: number, stun: number, out: Flight = tmp, frames = 150): Flight {
  const s = f.stats;
  const b = world.blast;
  let margin = Infinity;
  let post = 0;
  out.ko = false;
  for (let t = 1; t <= frames; t++) {
    if (stun > 0) {
      stun--;
      vy = Math.min(s.fastFallSpeed, vy + s.gravity * (vy < 0 ? HITSTUN_RISE_GRAVITY : HITSTUN_FALL_GRAVITY));
      vx = vx > LAUNCH_DRAG ? vx - LAUNCH_DRAG : vx < -LAUNCH_DRAG ? vx + LAUNCH_DRAG : 0;
    } else {
      // out of hitstun the fighter can act, but its momentum still carries it a little way (count ~20 more frames)
      if (++post > 20) break;
      vy = Math.min(s.fallSpeed, vy + s.gravity);
      vx = vx > s.airFriction ? vx - s.airFriction : vx < -s.airFriction ? vx + s.airFriction : 0;
    }
    const py = y;
    x += vx;
    y += vy;
    const m = Math.min(x - b.left, b.right - x, y - b.top, b.bottom - (y - f.h));
    if (m < margin) margin = m;
    if (m < 0) {
      out.ko = true;
      out.margin = m;
      return out;
    }
    if (vy > 0) {
      for (const p of world.platforms) {
        if (x < p.x || x > p.right || p.kind !== 'solid') continue;
        if (py <= p.top && y >= p.top) {
          out.margin = margin;
          return out;
        }
      }
    }
  }
  out.margin = margin;
  return out;
}

const launchOut = { vx: 0, vy: 0, stun: 0 };

/** Launch velocity and hitstun the target would get from hit `kb` dealt by `atk` facing `dir` (mirrors Fighter.receiveHit). */
export function launchOf(atk: Fighter, tgt: Fighter, kb: NonNullable<AiMove['kb']>, dir: 1 | -1, extraDamage = 0): typeof launchOut {
  const dmg = tgt.damage + kb.damage * atk.outMul + extraDamage;
  const k =
    computeKnockback({ base: kb.base, scaling: kb.scaling, damagePercent: dmg, moveWeight: kb.weight, targetWeight: tgt.stats.weight }) *
    atk.kbMult *
    atk.rage *
    (1 + SOAK_KB_PER_LEVEL * tgt.soakLevel);
  let angle = kb.angle;
  if (angle === 361) angle = tgt.grounded && k < 32 ? 0 : 44;
  const sp = Math.min(MAX_LAUNCH_SPEED, k * KB_TO_SPEED);
  const rad = (angle * Math.PI) / 180;
  launchOut.vx = Math.cos(rad) * sp * dir;
  launchOut.vy = -Math.sin(rad) * sp;
  launchOut.stun = hitstunFrames(k);
  return launchOut;
}

/**
 * Chance-like score 0..1 that the hit kills: the launch is flown with no DI and with the target's best DI either way
 * (a sharp opponent bends it); 1 = kills through any DI, 0.5 = kills only if they DI badly, 0 = survives.
 */
export function killScore(atk: Fighter, tgt: Fighter, world: World, m: AiMove, dir: 1 | -1, atX = tgt.x, atY = tgt.y): number {
  if (!m.kb || m.kb.base + m.kb.scaling * 100 <= 0) return 0;
  const l = launchOf(atk, tgt, m.kb, dir);
  const { vx, vy, stun } = l;
  if (!fly(tgt, world, atX, atY, vx, vy, stun).ko) return 0;
  // DI either way (whichever the opponent picks): rotate by the full DI angle
  let lives = 0;
  for (const s of [-1, 1]) {
    const a = s * DI_MAX_ANGLE;
    const c = Math.cos(a);
    const sn = Math.sin(a);
    if (!fly(tgt, world, atX, atY, vx * c - vy * sn, vx * sn + vy * c, stun).ko) lives++;
  }
  return lives === 0 ? 1 : lives === 1 ? 0.6 : 0.35;
}

const diOut = { x: 0, y: 0 };

/**
 * Survival DI for a fighter that was just launched (its launch velocity is already set): the stick that bends the flight
 * furthest from the blast zones, or null if the launch is not dangerous (then the caller does combo DI).
 */
export function survivalDi(f: Fighter, world: World): { x: number; y: number } | null {
  const sp = Math.hypot(f.vx, f.vy);
  if (sp < 4) return null;
  const stun = f.hitstun;
  const none = fly(f, world, f.x, f.y, f.vx, f.vy, stun);
  const noneKo = none.ko;
  const noneMargin = none.margin;
  if (!noneKo && noneMargin > 120) return null;
  // the stick perpendicular to the launch, either side: the engine bends the flight by cross * DI_MAX_ANGLE
  let best = -Infinity;
  let bx = 0;
  let by = 0;
  for (const s of [-1, 1]) {
    const px = (-f.vy / sp) * s;
    const py = (f.vx / sp) * s;
    const cross = (f.vx * py - f.vy * px) / sp;
    const a = cross * DI_MAX_ANGLE;
    const c = Math.cos(a);
    const sn = Math.sin(a);
    const r = fly(f, world, f.x, f.y, f.vx * c - f.vy * sn, f.vx * sn + f.vy * c, stun);
    const score = r.ko ? r.margin - 1000 : r.margin;
    if (score > best) {
      best = score;
      bx = px;
      by = py;
    }
  }
  diOut.x = bx;
  diOut.y = by;
  return diOut;
}
