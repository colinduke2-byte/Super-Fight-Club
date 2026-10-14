/**
 * A fighter's whole generated sprite sheet as raw RGBA, from plain data only (no Phaser, no DOM): the same pixels the main
 * thread draws, so it can run in a worker (sheetPool.ts) or inline as a fallback.
 */
import type { PoseSpec } from '../engine/moves';
import type { CharacterData, SpriteDef } from '../engine/types';
import { renderHeroImage } from './hero';
import { poseFor, setMovePoses } from './poses';
import { sheetLayout } from './sheetLayout';
import { finishHeroImage } from './spriteDetail';

/** Everything a sheet depends on (structured-clone safe). */
export interface SheetSpec {
  sprite: SpriteDef;
  poses: { anim: string; pose: PoseSpec }[];
}

export interface SheetPixels {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

export function sheetSpec(data: CharacterData): SheetSpec {
  return { sprite: data.sprite, poses: Object.values(data.moves).flatMap((m) => (m.pose ? [{ anim: m.anim, pose: m.pose }] : [])) };
}

export function heroSheetPixels(spec: SheetSpec): SheetPixels {
  const { sprite } = spec;
  const size = sprite.frameSize;
  const fw = sprite.frameWidth ?? size;
  const L = sheetLayout({ sprite } as CharacterData);
  const W = L.cols * fw;
  const H = L.rows * size;
  const out = new Uint8ClampedArray(W * H * 4);
  setMovePoses(spec.poses);
  for (const name of L.names) {
    const def = sprite.animations[name];
    for (let f = 0; f < def.frames; f++) {
      const cell = L.start[name] + f;
      const img = renderHeroImage(fw, size, sprite.placeholder, poseFor(name, f, def.frames), f);
      finishHeroImage(img, sprite.placeholder);
      const dx = (cell % L.cols) * fw;
      const dy = Math.floor(cell / L.cols) * size;
      const row = fw * 4;
      for (let y = 0; y < size; y++) out.set(img.data.subarray(y * row, (y + 1) * row), ((dy + y) * W + dx) * 4);
    }
  }
  return { width: W, height: H, data: out };
}
