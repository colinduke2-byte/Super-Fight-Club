import { hurtRect } from './combat';
import type { World } from './world';
import type { HazardDef } from './types';

export type HazardPhase = 'idle' | 'warn' | 'active';

/** Where the hazard is in its cycle at `tick`. Pure. */
export function hazardPhase(h: HazardDef, tick: number): HazardPhase {
  const p = (tick + (h.offset ?? 0)) % h.period;
  if (p >= h.period - h.active) return 'active';
  if (p >= h.period - h.active - h.warn) return 'warn';
  return 'idle';
}

/** Index of the current cycle (used so a fighter is hit once per eruption). */
export function hazardCycle(h: HazardDef, tick: number): number {
  return Math.floor((tick + (h.offset ?? 0)) / h.period);
}

const r = [0, 0, 0, 0];

/** Damage-only hazards: erupting columns and lightning strikes hurt and launch whoever stands in them, once per eruption. Never an instant KO. */
export function stepHazards(world: World): void {
  const hs = world.stage.hazards;
  if (!hs) return;
  const t = world.tick;
  for (let i = 0; i < hs.length; i++) {
    const h = hs[i];
    const phase = hazardPhase(h, t);
    const p = (t + (h.offset ?? 0)) % h.period;
    if (p === h.period - h.active - h.warn) world.emit('hazardWarn', world.fighters[0], h.x, h.kind === 'bolt' ? h.y + h.h : h.y, i, 0);
    if (phase !== 'active') continue;
    if (p === h.period - h.active) world.emit('hazardFire', world.fighters[0], h.x, h.kind === 'bolt' ? h.y + h.h : h.y, i, 0);
    const cycle = hazardCycle(h, t);
    for (const f of world.fighters) {
      if (f.state === 'ko' || f.invuln > 0 || f.state === 'grabbed') continue;
      if (world.hazardHit[i][f.id] === cycle) continue;
      hurtRect(f, r);
      const hit = h.kind === 'bolt' ? r[1] < h.y + h.h && r[1] + r[3] > h.y : r[1] < h.y && r[1] + r[3] > h.y - h.h;
      if (hit && r[0] < h.x + h.w / 2 && r[0] + r[2] > h.x - h.w / 2) {
        world.hazardHit[i][f.id] = cycle;
        f.receiveHit({ damage: h.damage, base: h.base, scaling: h.scaling, angle: h.angle, direction: f.x >= h.x ? 1 : -1, hitlag: 8 }, world);
      }
    }
  }
}
