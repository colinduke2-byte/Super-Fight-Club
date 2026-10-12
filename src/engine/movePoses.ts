import type { CharacterData } from './types';

/**
 * Gives every move that declares a `pose` its own six-frame animation row (`mv_<id>`), so each attack can look unique without
 * hand-drawn frames. Call once per character after its data is built. Idempotent.
 */
export function applyMovePoses(data: CharacterData): CharacterData {
  const byPose = new Map<string, string>(); // identical pose specs (e.g. charge levels of one special) share one animation row
  for (const m of Object.values(data.moves)) {
    if (!m.pose) continue;
    const sig = JSON.stringify(m.pose);
    const name = byPose.get(sig) ?? `mv_${m.id}`;
    byPose.set(sig, name);
    m.anim = name;
    data.sprite.animations[name] = { frames: 6, fps: 1, loop: false };
  }
  return data;
}
