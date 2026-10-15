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
