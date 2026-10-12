/**
 * Halcyon's GALE as pure functions so the numbers are easy to test and tune.
 *
 *  - Gale (0..100) builds while Halcyon is airborne and when she lands hits; it bleeds away on the ground.
 *  - Level 1 / 2 (at 33 / 66) add a little speed and upgrade the Javelin: level 1 pierces, level 2 fires a three-spear volley (costs 40).
 */
export const GALE_MAX = 100;
export const LEVEL_AT = [33, 66] as const;
export const AIR_RATE = 0.1; // gale per airborne frame (about 6 per second)
export const GROUND_RATE = 0.07; // gale lost per grounded frame
export const DEALT_RATE = 0.8; // gale per % dealt
export const SPEED_PER_LEVEL = 0.03;

export function galeTick(gale: number, airborne: boolean): number {
  return Math.max(0, Math.min(GALE_MAX, gale + (airborne ? AIR_RATE : -GROUND_RATE)));
}

export function galeSpeed(level: number): number {
  return 1 + SPEED_PER_LEVEL * level;
}
