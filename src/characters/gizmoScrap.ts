/**
 * Gizmo's SCRAP economy as pure functions (unit-tested, easy to tune).
 *
 *  - Scrap comes from damage Gizmo deals (any source: wrench, fist, turret shots) and from his turrets that
 *    enemies break (+3 each, via the deployable's `reward`).
 *  - Overclock spends scrap to upgrade nearby turrets for a few seconds: faster fire, bigger damage, or a shield.
 *  - Holding Overclock recalls the turrets for a refund instead.
 */
export const SCRAP_MAX = 40;
export const SCRAP_PER_DAMAGE = 0.3;
export const OVERCLOCK_COST = 5;
export const OVERCLOCK_RANGE = 170;
export const OVERCLOCK_FRAMES = 420; // 7 s
export const RECALL_REFUND = 3;
export const MECH_FRAMES = 480; // 8 s

export type Upgrade = 'fireRate' | 'damage' | 'shield';
export const UPGRADE_EFFECT: Record<Upgrade, { fireRateMul: number; damageMul: number; shield: number }> = {
  fireRate: { fireRateMul: 2, damageMul: 1, shield: 0 },
  damage: { fireRateMul: 1, damageMul: 1.6, shield: 0 },
  shield: { fireRateMul: 1, damageMul: 1, shield: 8 },
};

export function clampScrap(v: number): number {
  return Math.max(0, Math.min(SCRAP_MAX, v));
}

export function scrapFromDamage(damage: number): number {
  return Math.max(0, damage) * SCRAP_PER_DAMAGE;
}

export function canAfford(scrap: number, cost = OVERCLOCK_COST): boolean {
  return scrap >= cost;
}

/** Stick relative to facing: forward = damage, back = shield, otherwise fire rate. */
export function upgradeFromStick(stickX: number, facing: number): Upgrade {
  const rel = stickX * facing;
  if (rel > 0.4) return 'damage';
  if (rel < -0.4) return 'shield';
  return 'fireRate';
}
