/**
 * Brick's HEAT mechanic as pure functions (no engine imports) so the numbers are easy to test and tune.
 *
 *  - Heat fills when Brick TAKES damage and when he lands HEAVY hits (>= HEAVY_HIT damage).
 *  - It decays slowly once nothing has happened for DECAY_DELAY frames ("out of combat").
 *  - At HEAT_ARMOR% or more every smash gains super-armor and +15% damage.
 *  - Vent (down special) spends all Heat: damage and knockback scale with how much was spent.
 */
export const HEAT_MAX = 100;
export const HEAT_ARMOR = 50;
export const HEAT_DAMAGE_BONUS = 1.15;
export const TAKEN_RATE = 0.8; // heat per % taken
export const DEALT_RATE = 0.5; // heat per % dealt by a heavy hit
export const HEAVY_HIT = 9; // minimum damage that counts as "heavy"
export const DECAY_DELAY = 180; // frames of quiet before decay starts (3 s)
export const DECAY_RATE = 0.08; // heat per frame once decaying (~4.8 / s)
export const VENT_MIN = 30;

const clamp = (v: number): number => Math.max(0, Math.min(HEAT_MAX, v));

export function heatFromTaken(damage: number): number {
  return Math.max(0, damage) * TAKEN_RATE;
}

export function heatFromDealt(damage: number): number {
  return damage >= HEAVY_HIT ? damage * DEALT_RATE : 0;
}

export function addHeat(heat: number, amount: number): number {
  return clamp(heat + amount);
}

/** Heat after one frame of decay, given how many frames have passed without combat. */
export function decayHeat(heat: number, quietFrames: number): number {
  return quietFrames > DECAY_DELAY ? clamp(heat - DECAY_RATE) : heat;
}

export function isHot(heat: number): boolean {
  return heat >= HEAT_ARMOR;
}

export function canVent(heat: number): boolean {
  return heat >= VENT_MIN;
}

/** Vent strength for the Heat spent: damage 0.7x..2.0x, knockback 0.7x..1.6x. */
export function ventPower(heat: number): { damageMult: number; kbMult: number } {
  const t = clamp(heat) / HEAT_MAX;
  return { damageMult: 0.7 + 1.3 * t, kbMult: 0.7 + 0.9 * t };
}
