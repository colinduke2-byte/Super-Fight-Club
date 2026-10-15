import { HUMAN_MIN_SPEED } from '../../engine/physics';
import { updateFighterFx } from '../../fx/runner';
import { settings } from '../../settings';
import type { MatchScene } from '../MatchScene';

/** Continuous effects that follow fighters (auras, jet flame, footwork dust, launch trails). Runs once per sim tick. */
export function ambientFx(s: MatchScene): void {
  const st = s.st;
  const world = s.world;
  const effects = s.effects;
  if (world.tick === st.lastFxTick) return;
  st.lastFxTick = world.tick;
  // data-driven per-character auras, trails and charge effects (see src/fx and <id>.fx.json)
  updateFighterFx(world, effects, world.tick, (n) => (st.shake = Math.max(st.shake, n * settings.screenShake)));
  for (const f of s.fighters) {
    // footwork dust: dash bursts, run puffs, and skid clouds when a fast fighter brakes
    if (f.grounded && f.hitlag === 0) {
      const sp = Math.abs(f.vx);
      if (f.state === 'dash' && f.stateFrame % 3 === 0) effects.dust(f.x - f.facing * 6, f.y, 2, -f.facing);
      else if (f.state === 'run' && f.stateFrame % 9 === 4) effects.dust(f.x - f.facing * 4, f.y, 1, -f.facing);
      else if (((f.state === 'idle' || f.state === 'landing') && sp > 2.2 || f.skidding) && world.tick % 2 === 0) effects.dust(f.x, f.y, 2, Math.sign(f.vx));
    }
    // status, for as long as it lasts: a burning fighter sheds rising embers, a soaked one drips
    if (f.state !== 'ko') {
      const sm = f.sizeMul;
      const t = world.tick + f.id * 3;
      const rnd = ((t * 2654435761) >>> 0) / 4294967296; // cheap per-tick scatter (presentation only, not the sim RNG)
      if (f.status.burn > 0 && t % 2 === 0) {
        const ex = f.x + (rnd - 0.5) * f.hw * 2 * sm;
        const ey = f.y - f.h * sm * (0.2 + 0.6 * ((rnd * 7) % 1));
        effects.emit(ex, ey, (rnd - 0.5) * 18, -28 - rnd * 26, 0.55 + rnd * 0.35, rnd < 0.5 ? 0xffb040 : 0xff6a20, 3 + (t % 2), -40, true);
        if (t % 9 === 0) effects.emit(ex, ey - 4, 0, -16, 0.9, 0x5a4a48, 3, -12);
      }
      if (f.status.soak > 0 && t % 7 === 0) {
        const dx = (rnd - 0.5) * f.hw * 1.8 * sm;
        effects.emit(f.x + dx, f.y - f.h * sm * (0.35 + 0.4 * ((rnd * 5) % 1)), 0, 6, 0.5, 0x6ac8ff, 2, 420);
      }
    }
    // launch trail: a fighter flying fast enough to crash into others streams smoke, and hot sparks at the top speeds
    if (f.state === 'hitstun' && f.hitlag === 0 && !f.grounded) {
      const speed = Math.hypot(f.vx, f.vy);
      if (speed >= HUMAN_MIN_SPEED) {
        const cy = f.y - f.h / 2;
        const k = Math.min(1, (speed - HUMAN_MIN_SPEED) / 8);
        effects.emit(f.x - f.vx * 0.6, cy - f.vy * 0.6, -f.vx * 3 + (world.tick % 5) - 2, -f.vy * 3 - 6, 0.45 + k * 0.3, 0xd8d0c8, 3 + k * 3, -20);
        if (speed > 10 && world.tick % 2 === 0) effects.emit(f.x, cy, -f.vx * 8, -f.vy * 8, 0.22, 0xffb060, 2, 0, true);
      }
    }
  }
}
