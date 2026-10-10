/**
 * Agni's INNER FLAME as pure functions (no engine imports) so the numbers are easy to test and tune.
 *
 *  - Flame (0..100) fills when Agni lands hits and when he takes them.
 *  - It only drains after a long quiet spell, so it is meant to be built on purpose and then spent.
 *  - Level 1/2/3 (at 25 / 55 / 85 flame) upgrade his specials; every level also adds +3% damage to all his moves.
 *  - Flare Burst (down special) and the Solar Beam ultimate spend all of it.
 */
export const FLAME_MAX = 100;
export const LEVEL_AT = [25, 55, 85] as const;
export const DEALT_RATE = 0.9; // flame per % dealt
export const TAKEN_RATE = 0.7; // flame per % taken
export const DECAY_DELAY = 300; // frames of quiet before draining (5 s)
export const DECAY_RATE = 0.05; // flame per frame once draining (~3 / s)
export const LEVEL_DAMAGE = 0.03; // damage bonus per level

const clamp = (v: number): number => Math.max(0, Math.min(FLAME_MAX, v));

export function flameLevel(flame: number): 0 | 1 | 2 | 3 {
  return flame >= LEVEL_AT[2] ? 3 : flame >= LEVEL_AT[1] ? 2 : flame >= LEVEL_AT[0] ? 1 : 0;
}

export function addFlame(flame: number, amount: number): number {
  return clamp(flame + amount);
}

export function flameFromDealt(damage: number): number {
  return Math.max(0, damage) * DEALT_RATE;
}

export function flameFromTaken(damage: number): number {
  return Math.max(0, damage) * TAKEN_RATE;
}

export function decayFlame(flame: number, quietFrames: number): number {
  return quietFrames > DECAY_DELAY ? clamp(flame - DECAY_RATE) : flame;
}

export function levelDamageMult(level: number): number {
  return 1 + LEVEL_DAMAGE * level;
}
