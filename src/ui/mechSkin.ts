import Phaser from 'phaser';
import { ALT_LOOKS } from '../art/palettes';
import { fighterTextureKey, registerPixels } from '../art/proceduralFighter';
import { gizmoMechLook } from '../art/hero/gizmo';
import { sheetSpec } from '../art/sheetPixels';
import { buildSheetPixels } from '../art/sheetPool';
import type { CharacterData } from '../engine/types';

/**
 * Mega Mech Mode's own sprite sheet: the same animation rows as the fighter's sheet (so every frame index lines up), drawn
 * by the hero drawer's mech variant (Gizmo in a cockpit). Built once per outfit in the sheet workers, in the background,
 * the first time a mech-capable fighter is on screen; until it is ready the view falls back to a steady tint.
 */
const building = new Set<string>();

/** Mech sheet id for a fighter skin ('gizmo', 'gizmo~2'...). */
const mechId = (skin: string): string => `${skin}#mech`;

function mechData(data: CharacterData, skin: string): CharacterData {
  const pal = Number(skin.split('~')[1] ?? 0);
  const alt = pal > 0 ? ALT_LOOKS[data.id]?.[pal - 1] : undefined;
  const base = data.sprite.placeholder;
  const look = alt ? { ...base, armor: alt.armor, armorDark: alt.armorDark, accent: alt.accent, outfit: alt.outfit ?? 0 } : base;
  return { ...data, id: mechId(skin), sprite: { ...data.sprite, sheetUrl: undefined, placeholder: gizmoMechLook(look) } };
}

/** Only hero-art fighters drawn by the dome (Gizmo) drawer have a mech variant. */
function hasMechArt(data: CharacterData): boolean {
  const p = data.sprite.placeholder;
  return p.art === 'hi' && p.build.helmet === 'dome' && !data.sprite.sheetUrl;
}

/**
 * Put `sprite` (and any of `extra` that are showing, e.g. the motion smear) on the mech sheet while `on`, back on the
 * fighter's own sheet otherwise. Returns true when the mech sheet is what is being shown. Starts the background build.
 */
export function applyMechSkin(scene: Phaser.Scene, data: CharacterData, skin: string, on: boolean, sprite: Phaser.GameObjects.Sprite, extra: readonly Phaser.GameObjects.Sprite[]): boolean {
  if (!hasMechArt(data)) return false;
  const id = mechId(skin);
  const key = fighterTextureKey(id);
  const ready = scene.textures.exists(key);
  if (!ready && !building.has(id)) {
    building.add(id);
    const md = mechData(data, skin);
    buildSheetPixels(sheetSpec(md))
      .then((px) => {
        if (scene.sys.isActive() || scene.sys.isPaused()) registerPixels(scene, md, px);
      })
      .catch((err: unknown) => console.warn(`[mech] sheet build for ${id} failed:`, err))
      .finally(() => building.delete(id));
  }
  const want = on && ready ? key : fighterTextureKey(skin);
  for (const s of [sprite, ...extra]) {
    if (s !== sprite && !s.visible) continue;
    if (s.texture.key !== want) s.setTexture(want, s.frame.name);
  }
  return on && ready;
}
