import type { CharacterData } from '../engine/types';

/** Textures are capped at 4096px. Generated sheets pack every animation frame into a near-square grid of cells (no wasted columns). */
const MAX_SHEET = 4096;
export interface SheetLayout {
  names: string[];
  /** First cell of each animation. */
  start: Record<string, number>;
  total: number;
  cols: number;
  rows: number;
}
const layouts = new WeakMap<CharacterData, SheetLayout>();
export function sheetLayout(data: CharacterData): SheetLayout {
  const cached = layouts.get(data);
  if (cached && cached.names.length === Object.keys(data.sprite.animations).length) return cached;
  const names = Object.keys(data.sprite.animations);
  const start: Record<string, number> = {};
  let L: SheetLayout;
  if (data.sprite.sheetUrl) {
    // loaded sheets keep the authored layout: one animation per row, frames left to right
    const cols = Math.max(...names.map((n) => data.sprite.animations[n].frames));
    names.forEach((n, row) => (start[n] = row * cols));
    L = { names, start, total: names.length * cols, cols, rows: names.length };
  } else {
    let total = 0;
    for (const n of names) {
      start[n] = total;
      total += data.sprite.animations[n].frames;
    }
    const cols = Math.max(1, Math.min(Math.floor(MAX_SHEET / data.sprite.frameSize), Math.ceil(Math.sqrt(total))));
    L = { names, start, total, cols, rows: Math.ceil(total / cols) };
  }
  layouts.set(data, L);
  return L;
}
/** Pixel size of a generated sheet (tests guard it against the 4096px texture limit). */
export function sheetDims(data: CharacterData): { width: number; height: number } {
  const L = sheetLayout(data);
  return { width: L.cols * data.sprite.frameSize, height: L.rows * data.sprite.frameSize };
}
/** Sheet frame index for (animation, frame). */
export function animFrameIndex(data: CharacterData, anim: string, frame: number): number {
  const L = sheetLayout(data);
  const def = data.sprite.animations[anim];
  return (L.start[anim] ?? 0) + Math.min(frame, (def?.frames ?? 1) - 1);
}

