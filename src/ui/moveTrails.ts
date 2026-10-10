import type { Fighter } from '../engine/fighter';
import type { World } from '../engine/world';
import type { Effects } from './Effects';

const NOVA_COLORS = [0xff7a2a, 0x8fe6ff, 0xfff06a];

function hex(s: string): number {
  return parseInt(s.slice(1), 16);
}

/** Accent colour of a fighter's attack trails (Nova follows her current element). */
export function trailColor(f: Fighter): number {
  if (f.data.id === 'nova') return NOVA_COLORS[f.res.element ?? 0] ?? 0xffffff;
  return hex(f.data.sprite.placeholder.accent);
}

/**
 * Per-character attack flourishes (welding sparks, rune circles, dust, speed streaks); the swing arcs themselves are drawn by
 * SlashArcs.
 * Runs once per sim tick; purely visual (never feeds back into the simulation).
 */
export function updateMoveTrails(world: World, fx: Effects, tick: number): void {
  for (const f of world.fighters) {
    const m = f.move;
    if (f.state !== 'attack' || !m || f.hitlag > 0) continue;
    const col = trailColor(f);
    const chestY = f.y - f.h * 0.55;
    // --- character flourishes
    switch (f.data.id) {
      case 'gizmo':
        if ((m.kind === 'tilt' || m.kind === 'jab') && f.moveFrame > m.startup && f.moveFrame <= m.startup + m.active && tick % 2 === 0) {
          fx.emit(f.x + f.facing * (24 + Math.random() * 12), chestY + (Math.random() - 0.5) * 10, f.facing * (30 + Math.random() * 40), -20 - Math.random() * 40, 0.3, Math.random() > 0.5 ? 0xffe14a : 0xffffff, 2, 120, true);
        }
        break;
      case 'nova':
        if (m.kind === 'special' || m.kind === 'ultimate') {
          // rotating rune circle under her feet while casting
          const t = tick * 0.22;
          for (let k = 0; k < 3; k++) {
            const a = t + (k * Math.PI * 2) / 3;
            fx.emit(f.x + Math.cos(a) * 18, f.y - 1 + Math.sin(a) * 4, 0, -4, 0.22, col, 2, 0, true);
          }
        }
        break;
      case 'brick':
        if ((m.id === 'neutralB' || m.kind === 'dashAttack') && Math.abs(f.vx) > 2 && tick % 2 === 0) fx.dust(f.x - f.facing * 8, f.y, 2, -f.facing);
        break;
      case 'vex':
        if (Math.abs(f.vx) > 3 && tick % 2 === 0) fx.emit(f.x - f.facing * 6, chestY, -f.facing * 10, 0, 0.2, col, 3, 0, true);
        break;
      default:
        break;
    }
  }
}

/** Always-on flourishes that do not depend on an attack being active (Mech-mode gears and steam, Heat embers). */
export function updateAuraFx(world: World, fx: Effects, tick: number): void {
  for (const f of world.fighters) {
    if (f.state === 'ko') continue;
    if (f.data.id === 'gizmo' && (f.res.mech ?? 0) > 0 && tick % 3 === 0) {
      const a = tick * 0.35;
      const mid = f.y - f.h * f.sizeMul * 0.5;
      // orbiting gear teeth + steam venting from the suit
      fx.emit(f.x + Math.cos(a) * 26, mid + Math.sin(a) * 18, -Math.sin(a) * 30, Math.cos(a) * 30, 0.25, 0xbfe0ff, 3, 0, true);
      if (tick % 9 === 0) fx.emit(f.x - f.facing * 14, mid - 6, -f.facing * 8, -26, 0.5, 0xe8e8f4, 3, 0);
    }
    if (f.data.id === 'brick' && (f.res.heat ?? 0) >= 80 && tick % 4 === 0) {
      fx.emit(f.x + (Math.random() - 0.5) * 14, f.y - f.h * (0.5 + Math.random() * 0.5), (Math.random() - 0.5) * 12, -30, 0.4, 0xff9a40, 2, 0, true); // embers
    }
  }
}

