import { hitboxActive, hitboxRect } from './combat';
import type { World } from './world';

/** Radius of a target (world units). */
export const TARGET_R = 7;

/** A breakable target (Target Smash). */
export interface Target {
  x: number;
  y: number;
  alive: boolean;
}

const r = [0, 0, 0, 0];

function overlapsCircle(rx: number, ry: number, rw: number, rh: number, cx: number, cy: number, rad: number): boolean {
  const nx = Math.max(rx, Math.min(cx, rx + rw));
  const ny = Math.max(ry, Math.min(cy, ry + rh));
  return (nx - cx) * (nx - cx) + (ny - cy) * (ny - cy) <= rad * rad;
}

/** Any live hitbox or projectile touching a target breaks it (emits 'target' with the count left). */
export function stepTargets(world: World): void {
  const ts = world.targets;
  if (ts.length === 0) return;
  for (const t of ts) {
    if (!t.alive) continue;
    let by = -1;
    for (const f of world.fighters) {
      const m = f.move;
      if (f.state !== 'attack' || !m) continue;
      for (const hb of m.hitboxes) {
        if (hb.grab || hb.throw || !hitboxActive(f, m, hb)) continue;
        hitboxRect(f, hb, r);
        if (overlapsCircle(r[0], r[1], r[2], r[3], t.x, t.y, TARGET_R)) {
          by = f.id;
          break;
        }
      }
      if (by >= 0) break;
    }
    if (by < 0) {
      for (const p of world.projectiles) {
        if (!p.active || !p.def) continue;
        if (overlapsCircle(p.x - p.def.w / 2, p.y - p.def.h / 2, p.def.w, p.def.h, t.x, t.y, TARGET_R)) {
          by = p.owner;
          break;
        }
      }
    }
    if (by < 0) continue;
    t.alive = false;
    const left = ts.filter((o) => o.alive).length;
    world.emit('target', world.fighters[Math.max(0, by)], t.x, t.y, left, ts.length);
  }
}
