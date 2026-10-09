import type { CharacterBehavior } from '../../src/engine/behavior';
import { makeProtoBase, protoJson } from '../../src/characters/proto';
import type { CharacterData } from '../../src/engine/types';

export { protoJson };

/** Counters filled by the behavior hooks so tests can assert they ran. */
export const hookLog = { ticks: 0, moveFrames: 0, hitDealt: 0, hitTaken: 0, deployDestroyed: 0, custom: 0 };

const behavior: CharacterBehavior = {
  onTick: () => void hookLog.ticks++,
  onMoveFrame: () => void hookLog.moveFrames++,
  onHitDealt: (f) => {
    hookLog.hitDealt++;
    f.res.heat = Math.min(100, (f.res.heat ?? 0) + 5);
  },
  onHitTaken: () => void hookLog.hitTaken++,
  onDeployableDestroyed: () => void hookLog.deployDestroyed++,
  onMoveEvent: () => void hookLog.custom++,
};

export function makeProto(withBehavior = false): CharacterData {
  return { ...makeProtoBase(), ...(withBehavior ? { behavior } : {}) };
}
