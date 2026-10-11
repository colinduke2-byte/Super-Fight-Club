import type { CharacterData } from './types';

/**
 * Gives every move that declares a `pose` its own six-frame animation row (`mv_<id>`), so each attack can look unique without
 * hand-drawn frames. Call once per character after its data is built. Idempotent.
 */
export function applyMovePoses(data: CharacterData): CharacterData {
  for (const m of Object.values(data.moves)) {
    if (!m.pose) continue;
    const name = `mv_${m.id}`;
    m.anim = name;
    data.sprite.animations[name] = { frames: 6, fps: 1, loop: false };
  }
  return data;
}
