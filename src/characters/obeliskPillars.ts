import type { World } from '../engine/world';

/** Rock Bottom: a back throw into one of Obelisk's own pillars smashes the rival into it (and the pillar to bits). */
export const PILLAR_SLAM = { range: 64, damage: 1.35, launch: 1.2 };

/** The pillar (deployable) of `ownerId` standing within `range` behind a fighter at x facing `facing`, if any. */
export function pillarBehind(world: World, ownerId: number, x: number, facing: 1 | -1, range = PILLAR_SLAM.range): import('../engine/entities').Deployable | null {
  for (const d of world.deployables) {
    if (!d.active || d.owner !== ownerId || !d.def?.pillar || !d.plat) continue;
    const behind = (d.x - x) * -facing;
    if (behind > 0 && behind <= range) return d;
  }
  return null;
}
