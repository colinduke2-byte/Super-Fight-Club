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
  pruneUnusedRows(data);
  return data;
}

/** Animation rows the fighter state machine can ask for outside of attacks (see `Fighter.anim`). */
const STATE_ANIMS = new Set(['idle', 'run', 'walk', 'dash', 'skid', 'crouch', 'jump', 'fall', 'glide', 'ledge', 'hurt', 'hurtL', 'hurtU', 'hurtD', 'held', 'down', 'ko', 'shield', 'roll', 'dodge', 'grab']);

/** Drops generated rows no move or state uses (the shared attack templates every move replaced with its own pose), which keeps sheets small. */
function pruneUnusedRows(data: CharacterData): void {
  if (data.sprite.sheetUrl) return; // authored sheets keep their layout
  const used = new Set<string>(STATE_ANIMS);
  for (const m of Object.values(data.moves)) used.add(m.anim);
  for (const name of Object.keys(data.sprite.animations)) if (!used.has(name)) delete data.sprite.animations[name];
}
