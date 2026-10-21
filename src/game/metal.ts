import { characterById } from '../characters';
import type { CharacterData } from '../engine/types';

/**
 * The arcade's METAL fight: a rival cast in the arena's steel. Built from the fighter's own data (same id, so the same
 * sprite sheets and moves), it is much heavier, falls faster, jumps lower and stands a little larger (a bigger hurtbox).
 * The view tints it steel through the `transform` seam (shown while the fighter is larger than normal).
 *
 * Everything is derived from the match rules (`MatchRules.metal`), so a replay rebuilds the same fighter.
 */
export const METAL_WEIGHT = 1.6;
export const METAL_SIZE = 1.12;
export const METAL_TINT = 0xc4cce0;

const cache = new Map<string, CharacterData>();

/** Fighters whose own `transform` look (Gizmo's mech suit) would clash with the steel coat: never cast in metal. */
export function canBeMetal(id: string): boolean {
  const d = characterById(id);
  return !!d && !d.transform;
}

/** The metal version of a fighter (cached; null for an unknown id). */
export function metalVariant(id: string): CharacterData | null {
  const hit = cache.get(id);
  if (hit) return hit;
  const base = characterById(id);
  if (!base) return null;
  const s = base.stats;
  const onTick = base.behavior?.onTick;
  const data: CharacterData = {
    ...base,
    stats: { ...s, weight: Math.round(s.weight * METAL_WEIGHT), gravity: s.gravity * 1.12, fallSpeed: s.fallSpeed * 1.15, fastFallSpeed: s.fastFallSpeed * 1.1, jumpHeight: s.jumpHeight * 0.88, doubleJumpHeight: s.doubleJumpHeight * 0.85 },
    transform: base.transform ?? { resource: 'metal', scale: METAL_SIZE, tint: METAL_TINT },
    behavior: {
      ...base.behavior,
      onTick(f, world) {
        onTick?.(f, world);
        if (f.sizeMul < METAL_SIZE) f.sizeMul = METAL_SIZE;
      },
    },
  };
  cache.set(id, data);
  return data;
}
