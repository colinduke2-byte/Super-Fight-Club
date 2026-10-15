import type { Fighter } from '../engine/fighter';
import type { Ledge } from '../engine/platform';
import type { World } from '../engine/world';
import type { LevelParams } from './profiles';

/** Get-up options from the ledge (see Fighter.ledgeLogic). 'drop' lets go and comes back with a jump (and an aerial). */
export type LedgeOption = 'climb' | 'roll' | 'attack' | 'jump' | 'drop';

/** Frames a fighter may hang before it drops by itself (Fighter's LEDGE_MAX_HANG, with a margin). */
const HANG_LIMIT = 280;

/** The nearest rival to the ledge's get-up spot: its distance inward from the corner (px) and whether it is attacking. */
function guard(self: Fighter, world: World, l: Ledge): { d: number; busy: boolean; air: boolean } {
  let d = Infinity;
  let busy = false;
  let air = false;
  for (const o of world.fighters) {
    if (o === self || o.state === 'ko' || world.allied(self.id, o.id)) continue;
    const inward = (l.x - o.x) * l.side;
    if (inward < -40 || Math.abs(o.y - l.y) > 90) continue;
    const dist = Math.abs(inward);
    if (dist < d) {
      d = dist;
      busy = o.state === 'attack' || o.state === 'shield';
      air = !o.grounded;
    }
  }
  return { d, busy, air };
}

/**
 * Pick a get-up option and how long to wait first. A weak CPU climbs straight up after a fixed-ish wait; a strong one reads
 * the rival: rolls past (or jumps over) one standing on the get-up spot, attacks one right at the edge, drops and comes back
 * with a jump against one waiting further in, and varies the timing so the get-up cannot be trapped on rhythm.
 */
export function chooseLedgeOption(self: Fighter, world: World, l: Ledge, p: LevelParams, rnd: () => number): { opt: LedgeOption; wait: number } {
  const g = guard(self, world, l);
  const mix = p.ledgeMix;
  const wait = p.smart ? 8 + Math.floor(rnd() * (14 + 40 * mix)) : 40 + Math.floor(rnd() * 60);
  if (rnd() >= mix) {
    // the old, readable behaviour: mostly a plain climb, sometimes a ledge jump or a get-up attack
    const r = rnd();
    if (p.smart && g.d < 70 && r > 0.85) return { opt: 'attack', wait };
    if (r < 0.6 || !p.smart) return { opt: 'climb', wait };
    return { opt: 'jump', wait };
  }
  const slow = self.damage >= 100; // slow get-ups have less invincibility: jumping is safer
  // weights: climb, roll, attack, jump, drop
  let w: [number, number, number, number, number];
  if (g.d === Infinity || g.d > 140) w = [5, 1, 0.3, 2, 0.5];
  else if (g.d < 36) w = [0.5, 3, g.busy ? 0.5 : 3, 2.5, 1];
  else if (g.d < 80) w = [1, 2.5, 0.5, 3, 2];
  else w = [2.5, 1.5, 0.3, 2.5, 1.5];
  if (slow) w[3] *= 1.6;
  if (g.air) w[3] *= 0.4; // a rival in the air above the edge covers the jump: go under it instead
  const tot = w[0] + w[1] + w[2] + w[3] + w[4];
  let r = rnd() * tot;
  const opts: LedgeOption[] = ['climb', 'roll', 'attack', 'jump', 'drop'];
  for (let i = 0; i < 5; i++) {
    r -= w[i];
    if (r <= 0) return { opt: opts[i], wait };
  }
  return { opt: 'climb', wait };
}

/** True when hanging on longer would run into the automatic drop (act now whatever the plan). */
export function hangRunningOut(self: Fighter): boolean {
  return self.ledgeFrames > HANG_LIMIT - 20;
}

/**
 * The ledge `tgt` is hanging on / climbing from, if we stand on that ledge's platform (a trap is only possible from there).
 */
export function trapLedge(self: Fighter, tgt: Fighter): Ledge | null {
  const l = tgt.ledge;
  if (!l || (tgt.state !== 'ledge' && tgt.state !== 'ledgeClimb')) return null;
  if (!self.grounded || self.groundPlat !== l.platform) return null;
  return l;
}
