/**
 * Stage structure and platform art, shared by the match (StageView) and the Stage Select preview (stageThumb).
 *
 * Built on demand, not at boot: `ensureStageArt` builds a stage's pieces on the art workers (call it when a stage is
 * focused or picked), and `ensureStageArtNow` builds whatever is still missing on the spot, so a stage is always complete
 * when a match or a preview needs it.
 *
 * Memory: each piece's canvas is released once the GPU has it (WebGL), and is redrawn by the workers after a context loss.
 * What the CPU still needs is taken from the pixels at build time: the emissive pixels the match's glow overlay is made of
 * (a short list, kept), and the pixels themselves for a little while (recentPixels), for the Stage Select preview drawn
 * right after.
 */
import type Phaser from 'phaser';
import type { StageData } from '../engine/types';
import { STAGES } from '../stages';
import { addCanvasTexture, isReleased, onCanvasPressure } from './canvasTexture';
import { buildStageArt } from './sheetPool';
import { artCanvas, isSeated, platformArtPixels, stageMassPixels, type ArtPixels } from './stageMass';

type Task = Parameters<typeof buildStageArt>[0];
type Job = { key: string; task: Task };

function jobs(stage: StageData): Job[] {
  const theme = stage.background.theme;
  // a stage form previewed under its own id (`classic~battlefield`, for its own preview texture) shares the stage's pieces
  const id = stage.id.split('~')[0];
  return stage.platforms.map((p, index) =>
    p.kind === 'solid'
      ? { key: `mass:${id}:${index}:${p.w}x${p.h}`, task: { kind: 'mass', args: [theme, p.w, p.h, index + 1, isSeated(p, stage.platforms)] } }
      : { key: `plat:${id}:${index}:${p.w}x${p.h}:${p.move || p.path ? 'm' : 'p'}`, task: { kind: 'plat', args: [theme, p.w, p.h, !!(p.move || p.path), index + 1] } },
  );
}

/** Texture key of a stage platform's art (index into stage.platforms). */
export function stageArtKey(stage: StageData, index: number): string {
  return jobs(stage)[index].key;
}

const inline = (t: Task): ArtPixels => (t.kind === 'mass' ? stageMassPixels(...t.args) : platformArtPixels(...t.args));

/**
 * Emissive pixels of a piece (lamps, lit windows, runes, crystals: opaque, bright and saturated), as x, y, 0xRRGGBB
 * triples: what StageView's glow overlay is drawn from. Null: nothing glows.
 */
export interface Emissive {
  width: number;
  height: number;
  px: Int32Array;
}
const emissive = new Map<string, Emissive | null>();

export function findEmissive(px: ArtPixels): Emissive | null {
  const { width: W, height: H, data: d } = px;
  const out: number[] = [];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const o = (y * W + x) * 4;
      // (the art's only partly transparent pixels are faint glow, alpha < 120: everything at 200+ is opaque, so these
      // are exactly the values a canvas readback of the texture gives)
      if (d[o + 3] < 200) continue;
      const mx = Math.max(d[o], d[o + 1], d[o + 2]);
      const mn = Math.min(d[o], d[o + 1], d[o + 2]);
      if (mx < 190 || mx - mn < 100) continue;
      out.push(x, y, (d[o] << 16) | (d[o + 1] << 8) | d[o + 2]);
    }
  }
  return out.length ? { width: W, height: H, px: Int32Array.from(out) } : null;
}

/** The glow overlay of a piece (RGBA): its emissive pixels with a two-pixel halo around each in its own colour. */
export function glowPixels(e: Emissive): Uint8ClampedArray<ArrayBuffer> {
  const W = e.width;
  const H = e.height;
  const out = new Uint8ClampedArray(W * H * 4);
  const HALO = [255, 120, 48];
  const P = e.px;
  for (let i = 0; i < P.length; i += 3) {
    const x = P[i];
    const y = P[i + 1];
    const r = (P[i + 2] >> 16) & 255;
    const g = (P[i + 2] >> 8) & 255;
    const b = P[i + 2] & 255;
    for (let dy = -2; dy <= 2; dy++) {
      const yy = y + dy;
      if (yy < 0 || yy >= H) continue;
      for (let dx = -2; dx <= 2; dx++) {
        const xx = x + dx;
        if (xx < 0 || xx >= W) continue;
        const a = HALO[Math.max(Math.abs(dx), Math.abs(dy))];
        const q = (yy * W + xx) * 4;
        if (out[q + 3] >= a) continue;
        out[q] = r;
        out[q + 1] = g;
        out[q + 2] = b;
        out[q + 3] = a;
      }
    }
  }
  return out;
}

/** A piece's emissive pixels (undefined: the piece has not been built yet). */
export function stageArtEmissive(key: string): Emissive | null | undefined {
  return emissive.get(key);
}

/** The last few pieces' pixels, for previews drawn right after a build (bounded; dropped first under memory pressure). */
const recent = new Map<string, ArtPixels>();
const RECENT_BYTES = 24 << 20;
function remember(key: string, px: ArtPixels): void {
  recent.delete(key);
  recent.set(key, px);
  let bytes = 0;
  for (const p of recent.values()) bytes += p.data.length;
  for (const k of recent.keys()) {
    if (bytes <= RECENT_BYTES || recent.size <= 1) break;
    bytes -= recent.get(k)!.data.length;
    recent.delete(k);
  }
}
onCanvasPressure(() => recent.clear());

/** Register a built piece: its texture (canvas released on WebGL, rebuilt by the workers after a context loss), its emissive pixels. */
function register(tm: Phaser.Textures.TextureManager, j: Job, px: ArtPixels): void {
  if (tm.exists(j.key)) return;
  if (!emissive.has(j.key)) emissive.set(j.key, findEmissive(px));
  remember(j.key, px);
  const c = artCanvas(px);
  if (!c) return; // no canvas memory: the piece is missing from view rather than the scene crashing (retried on next ensure)
  addCanvasTexture({ textures: tm } as Phaser.Scene, j.key, c, async () => artCanvas(await buildStageArt(j.task)));
}

const building = new Map<string, Promise<void>>();

function stageOf(stage: StageData | string): StageData | undefined {
  return typeof stage === 'string' ? STAGES[stage] : stage;
}

/**
 * Build a stage's art in the background (art workers) if it is not built yet; resolves once every piece exists. Safe to
 * call any number of times, from anywhere (an unknown stage id resolves at once), and never rejects: a piece that fails on
 * the workers is built inline. Call it when a stage is focused or picked in a menu so the match finds it ready.
 */
export function ensureStageArt(scene: Phaser.Scene, stage: StageData | string): Promise<void> {
  const st = stageOf(stage);
  if (!st) return Promise.resolve();
  const tm = scene.textures; // the game-wide texture manager outlives this scene
  const waits: Promise<void>[] = [];
  for (const j of jobs(st)) {
    if (tm.exists(j.key)) continue;
    let p = building.get(j.key);
    if (!p) {
      p = buildStageArt(j.task)
        .then((px) => register(tm, j, px))
        .catch((err: unknown) => {
          console.warn(`[stageArt] background build of ${j.key} failed, building inline:`, err);
          try {
            register(tm, j, inline(j.task));
          } catch (e) {
            console.error(`[stageArt] ${j.key} could not be built:`, e);
          }
        })
        .finally(() => building.delete(j.key));
      building.set(j.key, p);
    }
    waits.push(p);
  }
  return Promise.all(waits).then(() => undefined);
}

/** True when every piece of a stage's art is built. */
export function stageArtReady(scene: Phaser.Scene, stage: StageData | string): boolean {
  const st = stageOf(stage);
  return !st || jobs(st).every((j) => scene.textures.exists(j.key));
}

/** Make sure every piece of a stage's art exists now (builds any missing piece on the spot, on the main thread). */
export function ensureStageArtNow(scene: Phaser.Scene, stage: StageData): void {
  for (const j of jobs(stage)) {
    if (scene.textures.exists(j.key)) continue;
    try {
      register(scene.textures, j, inline(j.task));
    } catch (err) {
      console.error(`[stageArt] ${j.key} could not be built:`, err);
    }
  }
}

/**
 * A piece's pixels as a drawable canvas, for previews: the texture's own canvas while it still has one (canvas renderer),
 * else a temporary one from recently built pixels, else rebuilt on the spot. `done` must be called with it afterwards
 * (frees a temporary canvas). Null: the piece cannot be drawn.
 */
export function stageArtSource(scene: Phaser.Scene, stage: StageData, index: number): { img: HTMLCanvasElement; done: () => void } | null {
  const j = jobs(stage)[index];
  const tm = scene.textures;
  if (tm.exists(j.key)) {
    const tex = tm.get(j.key);
    const src = tex.getSourceImage() as HTMLCanvasElement;
    if (!isReleased(tex) && src.width > 0) return { img: src, done: () => {} };
  }
  let px = recent.get(j.key);
  if (!px) {
    try {
      px = inline(j.task);
    } catch {
      return null;
    }
    remember(j.key, px);
  }
  const c = artCanvas(px);
  if (!c) return null;
  return {
    img: c,
    done: () => {
      c.width = 0;
      c.height = 0;
    },
  };
}
