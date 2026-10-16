import type Phaser from 'phaser';
import { releasePalettes, skinKey } from '../art/proceduralFighter';
import { session } from '../game/session';
import { skinsInUse } from './skinsInUse';

export { skinsInUse };

/**
 * Outfit sheets (alternate palettes) are several MB each and stay registered until something frees them; the lobby frees
 * the ones only browsed, but loops that never pass through the lobby kept adding more: the title's attract demo rolls four
 * random outfits per demo (left idle, the title cycled through every outfit in the game: +8 Mpx of textures per demo), and
 * every arcade fight adds its rival's. This frees every outfit nobody in the session still wears (the lineup, the last
 * lobby lineup, the arcade player, the saved replay) and that no live scene is showing.
 */
export function releaseUnusedOutfits(scene: Phaser.Scene): void {
  const keep = new Set<string>();
  const add = (p: { character: string; palette?: number } | null | undefined): void => {
    if (p && (p.palette ?? 0) > 0) keep.add(skinKey(p.character, p.palette));
  };
  session.players.forEach(add);
  session.versusLineup?.forEach(add);
  add(session.arcadeHuman);
  session.replay?.players.forEach(add);
  try {
    // never pull a texture out from under a sprite: anything a scene still shows (one shutting down this frame, an overlay)
    // keeps its outfit (removing it left sprites on frames of a destroyed texture: "reading 'sourceSize'" on the next render)
    for (const skin of skinsInUse(scene.game)) keep.add(skin);
    releasePalettes(scene, keep);
  } catch (err) {
    console.warn('[outfits] release failed (they stay cached):', err);
  }
}
