import { hurtRect } from './combat';
import type { World } from './world';
import type { HazardDef } from './types';
import { Platform } from './platform';

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

/** Frames of the active window a stalactite spends falling (the rest is its shatter on the floor). */
export const STALACTITE_FALL = 0.6;

/** How far (0..1) a stalactite has fallen at phase position `p` of its cycle; 0 before it drops. Pure. */
export function stalactiteFall(h: HazardDef, p: number): number {
  const start = h.period - h.active;
  if (p < start) return 0;
  const k = Math.min(1, (p - start + 1) / Math.max(1, h.active * STALACTITE_FALL));
  return k * k; // accelerating
}

/** Where an avalanche's wave front is (centre x) at phase position `p`; null when it is not rolling. Pure. */
export function avalancheX(h: HazardDef, p: number): number | null {
  const start = h.period - h.active;
  if (p < start) return null;
  return h.x + (h.travel ?? 0) * ((p - start) / Math.max(1, h.active - 1));
}

/** Ticks since a stalactite last landed (Infinity before its first landing). */
function sinceLanding(h: HazardDef, tick: number): number {
  const landP = h.period - h.active + Math.ceil(h.active * STALACTITE_FALL) - 1;
  const p = (tick + (h.offset ?? 0)) % h.period;
  const since = (p - landP + h.period) % h.period;
  return tick + (h.offset ?? 0) - since < landP ? Infinity : since;
}

/** Damage-only hazards: erupting columns and lightning strikes hurt and launch whoever stands in them, once per eruption. Never an instant KO. */
export function stepHazards(world: World): void {
  const hs = world.stage.hazards;
  if (!hs) return;
  const t = world.tick;
  for (let i = 0; i < hs.length; i++) {
    const h = hs[i];
    const phase = hazardPhase(h, t);
    const p = (t + (h.offset ?? 0)) % h.period;
    const down = h.kind === 'bolt' || h.kind === 'stalactite';
    if (h.stump) stepStump(world, i, h, t);
    if (p === h.period - h.active - h.warn) world.emit('hazardWarn', world.fighters[0], h.x, down ? h.y + h.h : h.y, i, 0);
    if (phase !== 'active') continue;
    if (h.kind === 'stalactite') {
      // the shatter on the floor is the 'fire' cue; only the falling spike hurts
      if (stalactiteFall(h, p) >= 1) {
        if (stalactiteFall(h, p - 1) < 1) world.emit('hazardFire', world.fighters[0], h.x, h.y + h.h, i, 0);
        continue;
      }
    } else if (p === h.period - h.active) world.emit('hazardFire', world.fighters[0], h.x, down ? h.y + h.h : h.y, i, 0);
    const cycle = hazardCycle(h, t);
    for (const f of world.fighters) {
      if (f.state === 'ko' || f.invuln > 0 || f.state === 'grabbed') continue;
      if (world.hazardHit[i][f.id] === cycle) continue;
      hurtRect(f, r);
      let hit: boolean;
      if (h.kind === 'avalanche') {
        // the rolling wall: anyone it overtakes on the floor is swept along; jump it to stay clear
        const cx = avalancheX(h, p)!;
        hit = r[1] < h.y && r[1] + r[3] > h.y - h.h && r[0] < cx + h.w / 2 && r[0] + r[2] > cx - h.w / 2;
        if (hit) {
          world.hazardHit[i][f.id] = cycle;
          f.receiveHit({ damage: h.damage, base: h.base, scaling: h.scaling, angle: h.angle, direction: (h.travel ?? 1) >= 0 ? 1 : -1, hitlag: 8 }, world);
        }
        continue;
      } else if (h.kind === 'stalactite') {
        // the spike: its tip has fallen this far; it hurts along its last 30 units
        const tip = h.y + h.h * stalactiteFall(h, p);
        hit = r[1] < tip && r[1] + r[3] > tip - 30;
      } else hit = h.kind === 'bolt' ? r[1] < h.y + h.h && r[1] + r[3] > h.y : r[1] < h.y && r[1] + r[3] > h.y - h.h;
      if (hit && r[0] < h.x + h.w / 2 && r[0] + r[2] > h.x - h.w / 2) {
        world.hazardHit[i][f.id] = cycle;
        f.receiveHit({ damage: h.damage, base: h.base, scaling: h.scaling, angle: h.angle, direction: f.x >= h.x ? 1 : -1, hitlag: 8 }, world);
        if (h.soak) f.applyStatus({ type: 'soak', frames: h.soak }, world);
      }
    }
  }
}

/** A landed stalactite leaves a crystal stump: a small solid block on the floor that stands for `stump.frames`. */
function stepStump(world: World, i: number, h: HazardDef, tick: number): void {
  const st = h.stump!;
  const alive = sinceLanding(h, tick) < st.frames;
  let plat = world.hazardPlats[i];
  if (alive && !plat) {
    plat = new Platform(900 + i, { x: h.x - st.w / 2, y: h.y + h.h - st.h, w: st.w, h: st.h, kind: 'solid' }, true);
    world.hazardPlats[i] = plat;
    world.platforms.push(plat);
    // anyone standing where it lands is popped up on top of it
    for (const f of world.fighters) {
      if (f.state === 'ko' || !(f.x + f.fhw > plat.x && f.x - f.fhw < plat.right) || f.y < plat.top - 0.5 || f.y > plat.bottom + 1) continue;
      f.y = plat.top;
      f.prevY = Math.min(f.prevY, f.y);
      f.vy = 0;
      if (f.grounded) f.groundPlat = plat; // an airborne fighter lands on it through their own collision (see stepPillars' lift)
    }
  } else if (!alive && plat) {
    world.hazardPlats[i] = null;
    const k = world.platforms.indexOf(plat);
    if (k >= 0) world.platforms.splice(k, 1);
    for (const f of world.fighters) if (f.groundPlat === plat) f.groundPlat = null;
    world.emit('pillarCrumble', world.fighters[0], h.x, h.y + h.h, -st.h, -1);
  }
}
