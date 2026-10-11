import type { CharacterBehavior } from '../../src/engine/behavior';
import { makeProtoBase, protoJson } from '../../src/characters/proto';
import type { CharacterData } from '../../src/engine/types';

export { protoJson };

/** Counters filled by the behavior hooks so tests can assert they ran. */
export const hookLog = { ticks: 0, moveFrames: 0, hitDealt: 0, hitTaken: 0, deployDestroyed: 0, custom: 0, kill: 0, land: 0, ledge: 0, tech: 0, parry: 0, shieldHit: 0, grab: 0, throw: 0, spawn: 0 };

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
  onKill: () => void hookLog.kill++,
  onLand: () => void hookLog.land++,
  onLedgeGrab: () => void hookLog.ledge++,
  onTech: () => void hookLog.tech++,
  onParry: () => void hookLog.parry++,
  onShieldHit: () => void hookLog.shieldHit++,
  onGrab: () => void hookLog.grab++,
  onThrow: () => void hookLog.throw++,
  onSpawn: () => void hookLog.spawn++,
};

export function makeProto(withBehavior = false): CharacterData {
  return { ...makeProtoBase(), ...(withBehavior ? { behavior } : {}) };
}
