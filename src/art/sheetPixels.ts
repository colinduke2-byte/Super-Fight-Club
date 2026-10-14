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

/**
 * A sheet packed tight: each frame's opaque bounding box shelf-packed into a smaller atlas (with a 1px transparent gutter),
 * plus where each cell went and where its box sat inside the full cell, so it can be registered as a Phaser trimmed frame
 * that draws exactly like the padded original. Typically under half the pixels of the grid sheet.
 */
export interface PackedSheet extends SheetPixels {
  /** Per cell: atlas x, y, width, height, then the box's x, y inside the full cell (6 ints per cell). */
  frames: Int32Array;
  cellW: number;
  cellH: number;
}

export function packSheet(px: SheetPixels, cellW: number, cellH: number, cells: number): PackedSheet {
  const cols = Math.floor(px.width / cellW);
  const boxes: { cell: number; x: number; y: number; w: number; h: number }[] = [];
  const src = px.data;
  for (let cell = 0; cell < cells; cell++) {
    const ox = (cell % cols) * cellW;
    const oy = Math.floor(cell / cols) * cellH;
    let x0 = cellW;
    let y0 = cellH;
    let x1 = -1;
    let y1 = -1;
    for (let y = 0; y < cellH; y++) {
      const row = ((oy + y) * px.width + ox) * 4 + 3;
      for (let x = 0; x < cellW; x++) {
        if (src[row + x * 4] === 0) continue;
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        y1 = y;
      }
    }
    boxes.push(x1 < 0 ? { cell, x: 0, y: 0, w: 1, h: 1 } : { cell, x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 });
  }
  // shelf packing, tallest first, into a width near the square root of the total area
  const G = 1;
  const area = boxes.reduce((s, b) => s + (b.w + G * 2) * (b.h + G * 2), 0);
  const W = Math.min(4096, Math.max(...boxes.map((b) => b.w + G * 2), Math.ceil(Math.sqrt(area) * 1.08)));
  const order = [...boxes].sort((a, b) => b.h - a.h || b.w - a.w);
  const at = new Int32Array(cells * 2);
  let x = 0;
  let y = 0;
  let shelf = 0;
  for (const b of order) {
    if (x + b.w + G * 2 > W) {
      x = 0;
      y += shelf;
      shelf = 0;
    }
    at[b.cell * 2] = x + G;
    at[b.cell * 2 + 1] = y + G;
    x += b.w + G * 2;
    shelf = Math.max(shelf, b.h + G * 2);
  }
  const H = y + shelf;
  const out = new Uint8ClampedArray(W * H * 4);
  const frames = new Int32Array(cells * 6);
  for (const b of boxes) {
    const ax = at[b.cell * 2];
    const ay = at[b.cell * 2 + 1];
    const ox = (b.cell % cols) * cellW + b.x;
    const oy = Math.floor(b.cell / cols) * cellH + b.y;
    for (let r = 0; r < b.h; r++) out.set(src.subarray(((oy + r) * px.width + ox) * 4, ((oy + r) * px.width + ox + b.w) * 4), ((ay + r) * W + ax) * 4);
    frames.set([ax, ay, b.w, b.h, b.x, b.y], b.cell * 6);
  }
  return { width: W, height: H, data: out, frames, cellW, cellH };
}

/** Build a hero sheet and pack it (what the workers return). */
export function packedHeroSheet(spec: SheetSpec): PackedSheet {
  const px = heroSheetPixels(spec);
  const fw = spec.sprite.frameWidth ?? spec.sprite.frameSize;
  const L = sheetLayout({ sprite: spec.sprite } as CharacterData);
  return packSheet(px, fw, spec.sprite.frameSize, L.total);
}
