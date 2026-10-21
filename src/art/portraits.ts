import type Phaser from 'phaser';
import type { CharacterData, PlaceholderLook } from '../engine/types';
import { addCanvasTexture, context2d } from './canvasTexture';
import { hasHeroArt, renderHeroImage } from './hero';
import { skeleton, type HeroPose } from './hero/skeleton';
import { ALT_LOOKS } from './palettes';
import { poseFor, stylePose, type Pose } from './poses';
import { finishHeroImage } from './spriteDetail';

/**
 * Bust portraits: a framed head-and-shoulders render of a fighter, drawn from the same hero art as the sprite sheet (the
 * idle stance, the chest turned a little toward the viewer and the chin up), lit for a portrait: a warm key light on the
 * edges facing it, a rim in the fighter's own colour on the far side, the body falling off into shade toward the bottom,
 * over a plate of the fighter's colours with light streaks and a vignette. One small texture per fighter and outfit
 * (about 100 px square), plus a grey, cracked copy for a fighter who is out, made only when asked for. Both are kept for the
 * session (a few tens of KB each) and redrawn after a WebGL context loss.
 */

/** Texture key of a fighter's bust portrait (`ko`: the greyed, cracked copy). */
export function portraitTexKey(skin: string, ko = false): string {
  return `portrait:${skin}${ko ? ':ko' : ''}`;
}

/** The look of a fighter in an outfit (0 = their own design). */
function lookOf(data: CharacterData, palette: number): PlaceholderLook {
  const base = data.sprite.placeholder;
  const alt = palette > 0 ? ALT_LOOKS[data.id]?.[palette - 1] : undefined;
  return alt ? { ...base, armor: alt.armor, armorDark: alt.armorDark, accent: alt.accent, outfit: alt.outfit ?? 0 } : base;
}

const hex = (c: string): [number, number, number] => {
  const n = parseInt(c.replace('#', '').slice(0, 6), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

/**
 * Per-fighter framing, in frame pixels, where the head box the skeleton gives is not where the art puts the face: an
 * offset and a zoom of the crop (>1 shows more of the body).
 */
const FRAMING: Record<string, { dx?: number; dy?: number; zoom?: number }> = {
  gizmo: { zoom: 0.82, dy: 2 },
  halcyon: { dx: 16, dy: -2 },
  vex: { zoom: 1.12 },
  brick: { zoom: 1.08, dy: -2 },
};

/** The crop of the rendered frame (x, y, side) and the frame's pixels. */
interface Bust {
  img: ImageData;
  x: number;
  y: number;
  side: number;
  /** The head's centre in crop pixels (the plate's light is centred on it). */
  hx: number;
  hy: number;
  facing: number;
}

/** The rendered frame and its bust crop (exported for tests and tools). */
export function renderBust(data: CharacterData, look: PlaceholderLook): Bust | null {
  if (!hasHeroArt(look)) return null;
  const H = data.sprite.frameSize;
  const W = data.sprite.frameWidth ?? H;
  const frames = data.sprite.animations.idle?.frames ?? 1;
  // the idle stance, the chest turned a touch toward us and the chin raised
  const base = stylePose(poseFor('idle', 0, frames) as Pose, look.build.helmet) as unknown as HeroPose;
  // (no anim / frame tags left on it: the renderer would restyle a tagged pose from scratch and drop the turn)
  const { anim: _a, f: _f, n: _n, ...rest } = base as HeroPose & { anim?: string; f?: number; n?: number };
  const pose: HeroPose = { ...rest, twist: (rest.twist ?? 0) + 1.5, head: [(rest.head?.[0] ?? 0) + 0.5, (rest.head?.[1] ?? 0) - 0.5] };
  const img = renderHeroImage(W, H, look, pose, 0);
  finishHeroImage(img, look);
  const k = skeleton(look, pose, W, H, 0);
  const s = k.head.s;
  // the crown: the first opaque row in the head's column band (crests, flames and hats reach above the head box)
  const d = img.data;
  const hx0 = Math.max(0, Math.round(k.head.x - s * 0.6));
  const hx1 = Math.min(W - 1, Math.round(k.head.x + s * 1.6));
  let crown = Math.round(k.head.y);
  for (let y = 0; y < k.head.y; y++) {
    let hit = false;
    for (let x = hx0; x <= hx1 && !hit; x++) hit = d[(y * W + x) * 4 + 3] > 0;
    if (hit) {
      crown = y;
      break;
    }
  }
  // head and shoulders: the head (crown to chin) takes about two thirds of the frame's height, shoulders below it
  const fr = FRAMING[data.id] ?? {};
  const chin = k.head.y + s;
  const side = Math.round(Math.max(s * 2.5, (chin - crown) * 1.55) * (fr.zoom ?? 1));
  const cx = k.head.x + s / 2 - side * 0.04 + (fr.dx ?? 0);
  const x = Math.round(cx - side / 2);
  const y = Math.round(crown - side * 0.1 + (fr.dy ?? 0));
  return { img, x, y, side, hx: k.head.x + s / 2 - x, hy: k.head.y + s * 0.55 - y, facing: 1 };
}

/** Portrait pixels: plate, lit bust, frame. `ko`: grey and cracked. Plain data (no canvas): testable in Node. */
export function portraitPixels(data: CharacterData, palette: number, ko: boolean): ImageData | null {
  const look = lookOf(data, palette);
  const b = renderBust(data, look);
  if (!b) return null;
  const N = b.side;
  const out = new ImageData(N, N);
  const o = out.data;
  const acc = hex(look.accent);
  const arm = hex(look.armorDark || look.armor);
  const W = b.img.width;
  const H = b.img.height;
  const src = b.img.data;
  const A = (x: number, y: number): number => (x < 0 || y < 0 || x >= W || y >= H ? 0 : src[(y * W + x) * 4 + 3]);
  // ---- the plate: a dark field of the fighter's colours, lit behind the head, with two light streaks and a vignette
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const i = (y * N + x) * 4;
      const dx = (x - b.hx) / N;
      const dy = (y - b.hy) / N;
      const glow = Math.max(0, 1 - Math.hypot(dx * 1.1, dy) * 1.9);
      const t = y / N;
      let r = 10 + arm[0] * 0.16 * (1 - t) + acc[0] * 0.42 * glow * glow;
      let gg = 8 + arm[1] * 0.16 * (1 - t) + acc[1] * 0.42 * glow * glow;
      let bb = 26 + arm[2] * 0.16 * (1 - t) + acc[2] * 0.42 * glow * glow;
      // streaks of light falling from the upper right (ordered steps, no smooth blend: it stays pixel art)
      const band = (x + y * 0.55) / N;
      if ((band > 0.92 && band < 1.02) || (band > 1.1 && band < 1.14)) {
        r += 16;
        gg += 14;
        bb += 20;
      }
      // a fine 2px halftone in the lit area
      if (glow > 0.25 && (x + y) % 4 === 0 && x % 2 === 0) {
        r += acc[0] * 0.08;
        gg += acc[1] * 0.08;
        bb += acc[2] * 0.08;
      }
      const vig = Math.min(1, Math.min(x, y, N - 1 - x, N - 1 - y) / (N * 0.12));
      const vk = 0.6 + 0.4 * vig;
      o[i] = r * vk;
      o[i + 1] = gg * vk;
      o[i + 2] = bb * vk;
      o[i + 3] = 255;
    }
  }
  // ---- the bust, lit: key light from the front and above, accent rim from behind, shade falling off toward the chest
  const keyCol = [255, 240, 214];
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const sx = b.x + x;
      const sy = b.y + y;
      if (A(sx, sy) === 0) continue;
      const si = (sy * W + sx) * 4;
      let r = src[si];
      let gg = src[si + 1];
      let bb = src[si + 2];
      // the edge toward the key light (front, above): within two pixels of open air up and to the front
      const lit = !A(sx + 2, sy - 2) || !A(sx + 1, sy - 1) || !A(sx, sy - 2);
      // the edge away from it (behind): the colour rim
      const rim = !A(sx - 2, sy) || !A(sx - 1, sy + 1) || !A(sx - 2, sy - 1);
      if (lit) {
        r += (keyCol[0] - r) * 0.32;
        gg += (keyCol[1] - gg) * 0.32;
        bb += (keyCol[2] - bb) * 0.32;
      } else if (rim) {
        r += (acc[0] - r) * 0.55;
        gg += (acc[1] - gg) * 0.55;
        bb += (acc[2] - bb) * 0.55;
      }
      // the lower body falls into shade, so the face holds the eye
      const fall = Math.max(0, (y / N - 0.62) / 0.38);
      const shade = 1 - fall * 0.55;
      const i = (y * N + x) * 4;
      o[i] = Math.min(255, r * shade);
      o[i + 1] = Math.min(255, gg * shade);
      o[i + 2] = Math.min(255, bb * shade);
    }
  }
  // ---- a 1px bevel: light along the top and left, dark along the bottom and right
  for (let k = 0; k < N; k++) {
    for (const [x, y, add] of [[k, 0, 40], [0, k, 26], [k, N - 1, -40], [N - 1, k, -30]] as const) {
      const i = (y * N + x) * 4;
      o[i] = Math.max(0, Math.min(255, o[i] + add));
      o[i + 1] = Math.max(0, Math.min(255, o[i + 1] + add));
      o[i + 2] = Math.max(0, Math.min(255, o[i + 2] + add));
    }
  }
  if (ko) koPass(o, N);
  return out;
}

function portraitCanvas(data: CharacterData, palette: number, ko: boolean): HTMLCanvasElement | null {
  const px = portraitPixels(data, palette, ko);
  if (!px) return null;
  const c = document.createElement('canvas');
  c.width = px.width;
  c.height = px.height;
  const g = context2d(c);
  if (!g) return null;
  g.putImageData(px, 0, 0);
  return c;
}

/** Out of the fight: drained to a cold grey, darkened, and split by two cracks with lighter chipped edges. */
function koPass(o: Uint8ClampedArray, N: number): void {
  for (let i = 0; i < N * N; i++) {
    const p = i * 4;
    const l = (o[p] * 0.3 + o[p + 1] * 0.59 + o[p + 2] * 0.11) * 0.62;
    o[p] = l * 0.95;
    o[p + 1] = l;
    o[p + 2] = l * 1.12;
  }
  // two cracks: from the top edge and the right edge, zig-zagging in (fixed steps: every portrait cracks alike)
  const cracks: [number, number, [number, number][]][] = [
    [0.58, 0, [[-0.06, 0.12], [0.05, 0.1], [-0.08, 0.14], [0.04, 0.12], [-0.05, 0.1]]],
    [1, 0.42, [[-0.12, 0.05], [-0.1, -0.06], [-0.13, 0.07], [-0.08, 0.02]]],
  ];
  const set = (x: number, y: number, v: number, a = 1): void => {
    if (x < 0 || y < 0 || x >= N || y >= N) return;
    const p = (y * N + x) * 4;
    for (let k = 0; k < 3; k++) o[p + k] = o[p + k] * (1 - a) + v * a;
  };
  for (const [fx, fy, steps] of cracks) {
    let x = fx * (N - 1);
    let y = fy * (N - 1);
    for (const [dx, dy] of steps) {
      const nx = x + dx * N;
      const ny = y + dy * N;
      const len = Math.max(1, Math.ceil(Math.hypot(nx - x, ny - y)));
      for (let s = 0; s <= len; s++) {
        const px = Math.round(x + ((nx - x) * s) / len);
        const py = Math.round(y + ((ny - y) * s) / len);
        set(px, py, 8);
        set(px + 1, py, 8, 0.6);
        set(px - 1, py + 1, 200, 0.45);
      }
      x = nx;
      y = ny;
    }
  }
}

/**
 * The bust portrait texture for a fighter in an outfit, built the first time it is asked for (a few ms: one frame of hero
 * art). Returns its key, or null for a fighter without hero art (callers then fall back to the idle frame crop).
 */
export function portraitKey(scene: Phaser.Scene, data: CharacterData, palette = 0, ko = false): string | null {
  const skin = palette > 0 ? `${data.id}~${palette}` : data.id;
  const key = portraitTexKey(skin, ko);
  if (scene.textures.exists(key)) return key;
  if (!hasHeroArt(lookOf(data, palette))) return null;
  let c: HTMLCanvasElement | null = null;
  try {
    c = portraitCanvas(data, palette, ko);
  } catch (err) {
    console.warn(`[portraits] could not draw ${key}:`, err);
  }
  if (!c) return null;
  addCanvasTexture(scene, key, c, () => portraitCanvas(data, palette, ko));
  return key;
}

/** The palette index of a skin id (`brick~2` -> 2). */
export function paletteOfSkin(skin: string): number {
  const i = skin.indexOf('~');
  return i < 0 ? 0 : Number(skin.slice(i + 1)) || 0;
}
