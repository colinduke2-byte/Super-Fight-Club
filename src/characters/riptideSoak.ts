/**
 * Riptide's SOAK payoff as pure functions so the numbers are easy to test and tune.
 *
 *  - Water moves soak their victims (the shared `soak` status: stacks up to 3 levels of 2 seconds; soaked fighters
 *    already take +4% knockback per level from anyone).
 *  - Riptide's throws and the Shark Lunge bite wring the water out: the soak is spent for bonus damage and launch.
 */
export const THROW_DAMAGE_PER_LEVEL = 0.12;
export const THROW_LAUNCH_PER_LEVEL = 0.06;

/** Damage and launch multipliers for a throw on a victim with `level` soak (0..3). */
export function soakThrowBonus(level: number): { damage: number; launch: number } {
  const l = Math.max(0, Math.min(3, level));
  return { damage: 1 + THROW_DAMAGE_PER_LEVEL * l, launch: 1 + THROW_LAUNCH_PER_LEVEL * l };
}
