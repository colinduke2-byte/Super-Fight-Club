import Phaser from 'phaser';
import { COVE_LAMP, GROUND_LAYERS, INDUSTRY_VENTS, STADIUM_LAMPS, ensureGroundTextures } from '../art/stageTextures';
import { settings } from '../settings';
import { addCanvasTexture, context2d, holdTexture, polygonPixels } from '../art/canvasTexture';

const SKY = ['#070520', '#0c0928', '#150e3a', '#231552', '#3a1f6a', '#5a2b78', '#8a4488'];
export interface Backdrop {
  sky: string[];
  planet: boolean;
  /** Multiplicative tints for the nebula, stars and the two skylines. */
  nebula: number;
  far: number;
  near: number;
  /** Tint for stage tiles (platforms) so each stage feels distinct. */
  tiles: number;
  /** Skyline textures (default: the ruined city). */
  farTex?: string;
  nearTex?: string;
  /** Animated extras drawn in screen space. */
  extras?: Extra[];
  /** Hide the star layers / nebula (daytime skies). */
  stars?: boolean;
  nebulaOn?: boolean;
  /** A band of cloud tops across the bottom of the screen. */
  bankTex?: string;
  /** Multiplicative tint for the bottom cloud/snow bank (night scenes dim it so pale fighters still read against it). */
  bankTint?: number;
  /** The scenery streams past (a moving stage): art px per second at the far layer; nearer layers move faster. */
  scroll?: number;
  /** Ground below the near skyline: textures `${ground}-0..2` (far floor, mid ridge, foreground), each nearer one parallaxing faster. */
  ground?: string;
  /** Light playing on water / lava in the far ground layer (art rows y0..y1 of `${ground}-0`): a moon's reflected path, or scattered glints. */
  glint?: { cols: number[]; y0: number; y1: number; path?: boolean; alpha?: number };
  /** Colours (low, high) and strength of the 'glow' extra's horizon haze. */
  glowCol?: [number, number];
  glowAlpha?: number;
  /** An overcast of cloud undersides hung across the top of the sky (a cloud-bank texture, flipped). */
  overcast?: string;
  /**
   * Push the near skyline back into the haze: `drop` world units lower (so nothing in it sits at play height), drawn at
   * `alpha` so the sky shows through. For skylines of floating islands, which otherwise read as platforms you could stand on.
   */
  nearHaze?: { drop: number; alpha: number; farDrop?: number; farAlpha?: number };
}

export type Extra = 'rain' | 'flash' | 'sun' | 'birds' | 'godrays' | 'shooting' | 'clouds' | 'embers' | 'glow' | 'lightning' | 'beams' | 'grid' | 'motes' | 'aurora' | 'airships' | 'moon' | 'beacon' | 'ceiling' | 'drips' | 'snow' | 'smoke' | 'shafts' | 'fireflies' | 'searchlights' | 'traffic' | 'datastream' | 'wisps' | 'petals' | 'flare' | 'wind' | 'crown' | 'ascend' | 'floodlights' | 'flashbulbs';

/**
 * The boss arena's phase (0 calm, 1 enraged) and how far into the change it is: set every frame by ui/BossCinematic, read
 * by the Apex backdrop's crown, sky and rising light. Reset to 0 when no boss is on screen.
 */
let arenaPhase = 0;
let arenaShift = 0;
export function setArenaPhase(phase: number, sinceChange = 999): void {
  arenaPhase = phase;
  arenaShift = sinceChange;
}

/**
 * Tile offset (texels) for a layer drawn `scale` device px per texel, shifted `shift` device px: the shift is rounded to a
 * whole device pixel, so the layer's pixel grid stays on the screen's while it pans (a fractional offset re-samples the
 * texels at a new phase every frame: uneven pixel widths that shimmer as the camera moves).
 */
function devPx(shift: number, scale: number): number {
  return Math.round(shift) / scale;
}

/** Horizontal parallax of the three ground layers (the near skyline is 0.26, so the far floor stays planted under it). */
const GROUND_PARALLAX = [0.26, 0.34, 0.45];

export const BACKDROPS: Record<string, Backdrop> = {
  skyline: {
    sky: SKY,
    planet: true,
    nebula: 0xffffff,
    far: 0xffffff,
    near: 0xffffff,
    tiles: 0xffffff,
    ground: 'bg-city-ground',
    glint: { cols: [0xffcf6a, 0x7fe8ff, 0xff8a5a, 0xff7ae0], y0: 4, y1: 150, alpha: 0.9 },
    glowCol: [0x5a1a7a, 0xd060c0],
    glowAlpha: 0.16,
    extras: ['glow', 'searchlights', 'aurora', 'clouds', 'shooting', 'traffic', 'airships'],
  },
  void: {
    sky: ['#030a14', '#061424', '#0a2236', '#103350', '#1a4d6e', '#2a6e8a', '#4a9aa8'],
    planet: false,
    nebula: 0x70e0ff,
    far: 0xffffff,
    near: 0xffffff,
    tiles: 0xb8e8ff,
    farTex: 'bg-pylons-far',
    nearTex: 'bg-pylons-near',
    glowCol: [0x0a3a5a, 0x2ab8e0],
    glowAlpha: 0.14,
    extras: ['glow', 'beams', 'grid', 'datastream', 'shooting', 'motes'],
  },
  storm: {
    sky: ['#050912', '#0a1426', '#102038', '#1a3050', '#244260', '#2c5470', '#3a6a88'],
    planet: false,
    nebula: 0x5a86aa,
    far: 0xffffff,
    near: 0xffffff,
    tiles: 0xc8dcf0,
    farTex: 'bg-spires-far',
    nearTex: 'bg-spires-near',
    bankTex: 'bg-stormbank',
    ground: 'bg-storm-sea',
    overcast: 'bg-stormbank',
    stars: false,
    extras: ['flash', 'rain'],
  },
  dawn: {
    sky: ['#2a1a4a', '#4a2a6a', '#8a3a7a', '#d0607a', '#f08a70', '#f8b070', '#ffd890'],
    planet: false,
    nebula: 0xffffff,
    far: 0xffffff,
    tiles: 0xffe8d8,
    farTex: 'bg-islands-far',
    nearTex: 'bg-islands-near',
    // the islands sit below the bridge deck in a desaturated haze, so none of them reads as a ledge at play height
    near: 0xe8c8cc,
    nearHaze: { drop: 70, alpha: 0.62, farDrop: 60, farAlpha: 0.7 },
    bankTex: 'bg-cloudsea',
    stars: false,
    nebulaOn: false,
    extras: ['sun', 'godrays', 'clouds', 'wisps', 'birds', 'petals', 'flare'],
  },
  temple: {
    sky: ['#081a1e', '#0e2a2c', '#163c3a', '#245448', '#3a6e52', '#6a8a5a', '#c8a060'],
    planet: false,
    nebula: 0x9fe0b0,
    far: 0xffffff,
    near: 0xffffff,
    tiles: 0xd8f0d0,
    farTex: 'bg-jungle-far',
    nearTex: 'bg-jungle-near',
    bankTex: 'bg-mist',
    ground: 'bg-jungle-ground',
    stars: true,
    nebulaOn: false,
    extras: ['godrays', 'motes', 'birds', 'fireflies'],
  },
  tide: {
    sky: ['#03060f', '#071226', '#0c1e3a', '#14304e', '#1e4862', '#215a6e', '#0c2a3c'],
    planet: false,
    nebula: 0x6ab0d0,
    far: 0xffffff,
    near: 0xffffff,
    tiles: 0xd0f0f0,
    farTex: 'bg-cove-far',
    nearTex: 'bg-cove-near',
    bankTex: 'bg-surf',
    ground: 'bg-cove-sea',
    glint: { cols: [0xe6f2ff, 0x9ad0ff], y0: 1, y1: 160, path: true },
    nebulaOn: false,
    extras: ['moon', 'beacon', 'shooting', 'motes'],
  },
  cavern: {
    sky: ['#05030a', '#0a0614', '#120a22', '#1c1032', '#2a1646', '#3a1e5a', '#4a2670'],
    planet: false,
    nebula: 0xa868e0,
    far: 0xffffff,
    near: 0xffffff,
    tiles: 0xe8d8ff,
    farTex: 'bg-geode-far',
    nearTex: 'bg-geode-near',
    bankTex: 'bg-cavemist',
    ground: 'bg-geode-ground',
    glint: { cols: [0xd8b8ff, 0x7af0e8, 0xa868e0], y0: 10, y1: 100 },
    glowCol: [0x3a1470, 0x8a4ad0],
    glowAlpha: 0.22,
    stars: false,
    nebulaOn: false,
    extras: ['glow', 'shafts', 'ceiling', 'drips', 'motes'],
  },
  frost: {
    sky: ['#0a1430', '#122248', '#1c3462', '#2e4c7c', '#4a6a96', '#7a92b4', '#c0cce0'],
    planet: false,
    nebula: 0x9fd0ff,
    // the moonlit snow is dimmed a little so pale fighters stand out against it
    far: 0xbcc8dc,
    near: 0xb4c2da,
    tiles: 0xe8f2ff,
    farTex: 'bg-peaks-far',
    nearTex: 'bg-shrine-near',
    bankTex: 'bg-snowbank',
    bankTint: 0xa0b2d0,
    ground: 'bg-frost-ground',
    glint: { cols: [0xf0f8ff, 0xb8d8ff], y0: 12, y1: 64, path: true, alpha: 0.7 },
    nebulaOn: false,
    extras: ['moon', 'aurora', 'snow'],
  },
  airship: {
    sky: ['#1a1030', '#2e1a48', '#4a2a5e', '#7a3e6a', '#b85e6a', '#e8906a', '#ffc88a'],
    planet: false,
    nebula: 0xffffff,
    far: 0xffd8c0,
    near: 0xe0b8c0,
    tiles: 0xffe8d8,
    farTex: 'bg-thunderheads-far',
    nearTex: 'bg-islands-near',
    nearHaze: { drop: 80, alpha: 0.58 },
    bankTex: 'bg-cloudsea',
    stars: false,
    nebulaOn: false,
    scroll: 26,
    extras: ['sun', 'clouds', 'wisps', 'birds', 'flash', 'wind', 'flare'],
  },
  harbour: {
    // a night harbour: the city across the water, the docks' cranes and warehouses, the moon's path on the sea and the
    // lighthouse sweeping the bay
    sky: ['#03050f', '#060c1e', '#0c162e', '#142242', '#1c3052', '#28405e', '#3a5468'],
    planet: false,
    nebula: 0x8ab0d8,
    far: 0x9cb0d0,
    near: 0x8696b8,
    tiles: 0xe0e8f4,
    farTex: 'bg-ruins-far',
    nearTex: 'bg-industry-near',
    nearHaze: { drop: 18, alpha: 0.92 },
    ground: 'bg-cove-sea',
    glint: { cols: [0xffe0a0, 0xe6f2ff, 0x9ad0ff], y0: 1, y1: 160, path: true },
    glowCol: [0x1a2a4a, 0xff9a40],
    glowAlpha: 0.12,
    nebulaOn: false,
    extras: ['moon', 'beacon', 'glow', 'searchlights', 'motes'],
  },
  rail: {
    // the sky-rail at night: the city streaming past below the line, searchlights, air traffic and the wind of the run
    sky: ['#06041a', '#0c0a2a', '#18123e', '#281a52', '#3e2462', '#5e306e', '#9a4a72'],
    planet: true,
    nebula: 0xd8b8ff,
    far: 0xd0c8f0,
    near: 0xb8b0e0,
    tiles: 0xf0e8ff,
    farTex: 'bg-ruins-far',
    nearTex: 'bg-ruins-near',
    nearHaze: { drop: 40, alpha: 0.85 },
    ground: 'bg-city-ground',
    glint: { cols: [0xffcf6a, 0x7fe8ff, 0xff8a5a, 0xff7ae0], y0: 4, y1: 150, alpha: 0.9 },
    glowCol: [0x3a1a6a, 0xff7ac0],
    glowAlpha: 0.16,
    scroll: 70,
    extras: ['glow', 'searchlights', 'traffic', 'shooting', 'wind'],
  },
  apex: {
    // the top of the world: a violet-black sky over a sea of cloud far below, the Overseer's citadel spires, and the vast
    // shadow of its spire crown and eye behind the arena (the 'crown' extra), all of which burn red in phase 2
    sky: ['#04020a', '#0a0616', '#120a24', '#1c1036', '#2c1a4c', '#4a2c6a', '#8a6aa6'],
    planet: false,
    nebula: 0xb685ff,
    far: 0xd8d0ec,
    near: 0xc0b4d8,
    tiles: 0xf0e8ff,
    farTex: 'bg-citadel-far',
    nearTex: 'bg-citadel-near',
    nearHaze: { drop: 60, alpha: 0.85, farDrop: 40, farAlpha: 0.8 },
    bankTex: 'bg-cloudsea',
    bankTint: 0x8a7ab8,
    glowCol: [0x2a1450, 0x9a5cf0],
    glowAlpha: 0.18,
    extras: ['crown', 'glow', 'ascend', 'shooting'],
  },
  stadium: {
    // the Launch Contest: a floodlit stadium at dusk, the city beyond the stands, camera flashes in the crowd
    sky: ['#0a0a24', '#141638', '#22204a', '#3a2a5a', '#5a3a62', '#8a4a5a', '#c86a50'],
    planet: false,
    nebula: 0xffffff,
    far: 0xc8a8b8,
    near: 0xffffff,
    tiles: 0xffffff,
    farTex: 'bg-ruins-far',
    nearTex: 'bg-stands-near',
    nearHaze: { drop: 20, alpha: 1 },
    nebulaOn: false,
    extras: ['floodlights', 'flashbulbs', 'shooting'],
  },
  reactor: {
    sky: ['#120404', '#240808', '#3a0e0a', '#5a1a0c', '#8a2c0c', '#c0501a', '#f08a30'],
    planet: false,
    nebula: 0xff7a40,
    far: 0xffffff,
    near: 0xffffff,
    tiles: 0xffc8a8,
    farTex: 'bg-industry-far',
    nearTex: 'bg-industry-near',
    ground: 'bg-reactor-ground',
    glint: { cols: [0xfff0a0, 0xffb040, 0xff7a1a], y0: 6, y1: 80, alpha: 0.9 },
    extras: ['lightning', 'glow', 'smoke', 'embers'],
  },
};

/** Deterministic hash in [0,1) for animated extras (no Math.random: visuals stay reproducible). */
const hash = (n: number): number => {
  let t = (Math.imul(n | 0, 0x9e3779b1) ^ 0x85ebca6b) >>> 0;
  t = Math.imul(t ^ (t >>> 15), 0x2c1b3c6d) >>> 0;
  return ((t ^ (t >>> 12)) >>> 0) / 4294967296;
};

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

/**
 * Discs and ellipses as textured quads instead of Graphics paths. Phaser's WebGL Graphics turns every fillCircle into a
 * ~100-point path and every fillEllipse into a 32-point one, allocates a Point per vertex and runs earcut on it on EVERY
 * frame it is drawn: the smoke, glows, moon, sun and flare were the costliest thing on screen (and most of the garbage).
 * These textures hold exactly those polygons (a regular 100-gon starting at angle 0 like Phaser's arc, and the 32-gon of
 * its fillEllipse), hard-edged like the Graphics fill, so a tinted, scaled image draws the same shape for one quad.
 */
const DISC_TEX = 'bg-disc-100';
const DISC_SIZE = 1024;
const ELL_TEX = 'bg-ellipse-32';
const ELL_SIZE = 512;

/**
 * The moon and sun discs: the same hard-edged 100-gon as DISC_TEX (its alpha, from polygonPixels), shaded inside. The moon
 * is lit from the upper left with limb darkening and a soft terminator, grey maria and a few craters with lit rims (grey
 * levels, tinted by the caller); the sun is limb-darkened from a white-gold centre to an orange rim, with granulation.
 */
const MOON_TEX = 'bg-moon-256';
const MOON_SIZE = 256;
const SUN_TEX = 'bg-sun-256';
const SUN_SIZE = 256;
function bodyPixels(size: number, kind: 'moon' | 'sun'): Uint8ClampedArray {
  const d = polygonPixels(size, 100);
  const r = size / 2;
  const blob = (x: number, y: number, cx: number, cy: number, rr: number): number => {
    const q = Math.hypot(x - cx, y - cy) / rr;
    return q < 1 ? 1 - q * q : 0;
  };
  const craters: [number, number, number][] = [
    [-0.38, 0.32, 0.13],
    [0.12, 0.52, 0.09],
    [0.42, -0.1, 0.08],
    [-0.1, -0.5, 0.06],
    [0.3, 0.3, 0.05],
    [-0.55, -0.15, 0.05],
  ];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const o = (y * size + x) * 4;
      if (!d[o + 3]) continue;
      const nx = (x + 0.5 - r) / r;
      const ny = (y + 0.5 - r) / r;
      const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
      // coarse noise from the hash, by 8px cells, bilinear
      const cell = (u: number, v: number): number => hash(((u * 73856093) ^ (v * 19349663)) + (kind === 'sun' ? 7 : 3));
      const fx = x / 8;
      const fy = y / 8;
      const ix = Math.floor(fx);
      const iy = Math.floor(fy);
      const tx = fx - ix;
      const ty = fy - iy;
      const nz8 = cell(ix, iy) * (1 - tx) * (1 - ty) + cell(ix + 1, iy) * tx * (1 - ty) + cell(ix, iy + 1) * (1 - tx) * ty + cell(ix + 1, iy + 1) * tx * ty;
      let R0: number;
      let G0: number;
      let B0: number;
      if (kind === 'moon') {
        const lam = Math.max(0, -0.55 * nx - 0.4 * ny + 0.73 * nz);
        let v = 0.18 + 0.82 * Math.pow(lam, 0.6);
        // maria: broad soft darker patches
        const mare = Math.min(1, blob(nx, ny, -0.25, -0.1, 0.42) * 0.9 + blob(nx, ny, 0.2, 0.15, 0.3) * 0.8 + blob(nx, ny, -0.05, 0.4, 0.22) * 0.7);
        v *= 1 - mare * 0.28 - (nz8 - 0.5) * 0.08;
        for (const [cx, cy, cr] of craters) {
          const q = Math.hypot(nx - cx, ny - cy) / cr;
          if (q < 0.8) v *= 0.82; // the floor
          else if (q < 1.05) v *= (nx - cx) + (ny - cy) < 0 ? 0.8 : 1.12; // the rim: shaded toward the light, lit away from it
        }
        const g = Math.max(0, Math.min(255, Math.round(v * 255)));
        R0 = g;
        G0 = g;
        B0 = g;
      } else {
        const limb = 0.45 + 0.55 * Math.pow(nz, 0.5);
        const gran = 1 + (nz8 - 0.5) * 0.08;
        R0 = 255;
        G0 = Math.round(Math.min(255, (150 + 100 * limb) * gran));
        B0 = Math.round(Math.min(255, (60 + 170 * Math.pow(limb, 2)) * gran));
      }
      d[o] = R0;
      d[o + 1] = G0;
      d[o + 2] = B0;
    }
  }
  return d;
}
function bodyCanvas(size: number, kind: 'moon' | 'sun'): HTMLCanvasElement | null {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const g = context2d(c);
  if (!g) return null;
  g.putImageData(new ImageData(bodyPixels(size, kind) as Uint8ClampedArray<ArrayBuffer>, size, size), 0, 0);
  return c;
}

function polygonCanvas(size: number, sides: number): HTMLCanvasElement | null {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const g = context2d(c);
  if (!g) return null;
  // hard edges, like the Graphics fill (a pixel is in or out): rasterised straight into the pixels, no fill-and-readback
  g.putImageData(new ImageData(polygonPixels(size, sides) as Uint8ClampedArray<ArrayBuffer>, size, size), 0, 0);
  return c;
}

/** The sky: `sky` colours top to bottom, ordered-dithered between neighbours, at art-pixel resolution. */
function gradientCanvas(sky: readonly string[], gw: number, gh: number): HTMLCanvasElement | null {
  const c = document.createElement('canvas');
  c.width = gw;
  c.height = gh;
  const g = context2d(c);
  if (!g) return null;
  const img = g.createImageData(gw, gh);
  const rgb = sky.map((s) => [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)]);
  for (let y = 0; y < gh; y++) {
    const t = (y / (gh - 1)) * (sky.length - 1);
    const i0 = Math.min(sky.length - 2, Math.floor(t));
    const f = t - i0;
    for (let x = 0; x < gw; x++) {
      const lv = f > BAYER[(y & 3) * 4 + (x & 3)] / 16 ? i0 + 1 : i0;
      const o = (y * gw + x) * 4;
      img.data[o] = rgb[lv][0];
      img.data[o + 1] = rgb[lv][1];
      img.data[o + 2] = rgb[lv][2];
      img.data[o + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return c;
}

/** Bottom-row averages already read, by texture key (the textures never change, and a rebuilt one has the same pixels). */
const rowAverages = new Map<string, [number, number, number] | null>();

/**
 * The average colour (r, g, b sums over n, not rounded) of a texture's bottom row, or null when fewer than 85% of that
 * row is (nearly) opaque. Read once per texture, one row only.
 */
function bottomRowAverage(scene: Phaser.Scene, key: string): [number, number, number] | null {
  if (rowAverages.has(key)) return rowAverages.get(key)!;
  if (!scene.textures.exists(key)) return null;
  const src = scene.textures.get(key).getSourceImage() as HTMLCanvasElement;
  if (typeof src.getContext !== 'function' || !src.width || !src.height) return null;
  let row: Uint8ClampedArray;
  try {
    const ctx = src.getContext('2d');
    if (!ctx) return null;
    row = ctx.getImageData(0, src.height - 1, src.width, 1).data;
  } catch {
    return null;
  }
  let r = 0;
  let g = 0;
  let bl = 0;
  let n = 0;
  for (let i = 0; i < row.length; i += 4) {
    if (row[i + 3] < 200) continue;
    r += row[i];
    g += row[i + 1];
    bl += row[i + 2];
    n++;
  }
  const avg: [number, number, number] | null = n < src.width * 0.85 ? null : [r / n, g / n, bl / n];
  rowAverages.set(key, avg);
  return avg;
}

function ensurePolygonTextures(scene: Phaser.Scene): void {
  for (const [key, size, sides] of [[DISC_TEX, DISC_SIZE, 100], [ELL_TEX, ELL_SIZE, 32]] as const) {
    if (scene.textures.exists(key)) continue;
    const c = polygonCanvas(size, sides);
    // no canvas memory left: the shapes draw as Phaser's missing texture rather than crash the scene
    if (c) addCanvasTexture(scene, key, c, () => polygonCanvas(size, sides));
  }
}

/** The shaded moon or sun disc, built the first time a backdrop shows one (only a few stages do). */
function ensureBodyTexture(scene: Phaser.Scene, key: string): void {
  if (scene.textures.exists(key)) return;
  const kind = key === SUN_TEX ? 'sun' : 'moon';
  const c = bodyCanvas(256, kind);
  if (c) addCanvasTexture(scene, key, c, () => bodyCanvas(256, kind));
}

/**
 * A pool of disc / ellipse images drawn at one spot in the layer's order (right above `anchor`), refilled each frame in draw
 * order: begin(), circle()/ellipse() for each shape, end() hides what this frame did not use.
 */
class ShapePool {
  private readonly items: Phaser.GameObjects.Image[] = [];
  private used = 0;
  private shown = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly layer: Phaser.GameObjects.Layer,
    private readonly anchor: Phaser.GameObjects.GameObject,
    private readonly blend: number,
  ) {}

  begin(): void {
    this.used = 0;
  }

  private next(tex: string): Phaser.GameObjects.Image {
    let im = this.items[this.used];
    if (!im) {
      im = this.scene.add.image(0, 0, tex).setBlendMode(this.blend);
      // straight after the anchor (or the pool's previous image) in the layer's draw order
      const prev = this.used === 0 ? this.anchor : this.items[this.used - 1];
      this.layer.addAt(im, this.layer.getIndex(prev) + 1);
      this.items.push(im);
    } else if (im.texture.key !== tex) im.setTexture(tex);
    if (im.blendMode !== this.blend) im.setBlendMode(this.blend); // (an image() may have set its own)
    this.used++;
    return im;
  }

  /** Same as Graphics fillStyle(col, a).fillCircle(x, y, r). */
  circle(x: number, y: number, r: number, col: number, a: number): void {
    if (!this.scene.textures.exists(DISC_TEX)) return; // could not be built (no canvas memory): skip the shape
    const k = (r * 2) / DISC_SIZE;
    this.next(DISC_TEX).setPosition(x, y).setScale(k, k).setTint(col).setAlpha(a).setVisible(true);
  }

  /**
   * A square texture `size` px across drawn as a disc of radius `r` (the shaded moon / sun), normally blended whatever the
   * pool's blend, so its shading shows instead of washing out to white over a bright sky.
   */
  image(tex: string, size: number, x: number, y: number, r: number, col: number, a: number): void {
    if (!this.scene.textures.exists(tex)) return;
    const k = (r * 2) / size;
    this.next(tex).setPosition(x, y).setScale(k, k).setTint(col).setAlpha(a).setVisible(true).setBlendMode(Phaser.BlendModes.NORMAL);
  }

  /** Same as Graphics fillStyle(col, a).fillEllipse(x, y, w, h). */
  ellipse(x: number, y: number, w: number, h: number, col: number, a: number): void {
    if (!this.scene.textures.exists(ELL_TEX)) return;
    this.next(ELL_TEX).setPosition(x, y).setScale(w / ELL_SIZE, h / ELL_SIZE).setTint(col).setAlpha(a).setVisible(true);
  }

  end(): void {
    for (let i = this.used; i < this.shown; i++) this.items[i].setVisible(false);
    this.shown = this.used;
  }
}

/** Phaser.Renderer.Events.RESTORE_WEBGL */
const RESTORE_WEBGL = 'restorewebgl';

/**
 * A TileSprite as the WebGL renderer draws it, without the memory the stock one wastes there. Phaser's TileSprite keeps a
 * hidden canvas at its display size that only the canvas renderer draws into, and resizes it on every size change: the
 * backdrop resizes its layers every frame (their height follows the camera zoom), reallocating full-screen canvases each
 * frame. Here the WebGL path keeps the size bookkeeping (frame size, display origin) and leaves that canvas alone. The
 * power-of-two copy of the tile that Phaser uploads as the repeating texture is released once uploaded and redrawn
 * after a WebGL context loss. The draw call is exactly the stock one, so every pixel is unchanged.
 */
/** TileSprite's internal steps (not in Phaser's typings). */
const TS_BASE = Phaser.GameObjects.TileSprite.prototype as unknown as { updateCanvas(this: unknown): void; updateTileTexture(this: unknown): void };

class LeanTileSprite extends Phaser.GameObjects.TileSprite {
  // `declare`d, not initialised: Phaser's constructor already calls the overrides below, and an initialiser would run
  // after it and wipe what they set
  declare private sizedW: number | undefined;
  declare private sizedH: number | undefined;
  declare private restoreHooked: boolean | undefined;

  private get gl(): boolean {
    return !!(this.renderer as Phaser.Renderer.WebGL.WebGLRenderer | null)?.gl;
  }

  updateCanvas(): void {
    if (!this.gl) return TS_BASE.updateCanvas.call(this);
    if (this.width !== this.sizedW || this.height !== this.sizedH) {
      this.sizedW = this.width;
      this.sizedH = this.height;
      this.frame.setSize(this.width, this.height);
      this.updateDisplayOrigin();
    }
    this.dirty = false;
  }

  updateTileTexture(): void {
    TS_BASE.updateTileTexture.call(this);
    if (!this.gl || !this.fillPattern) return;
    // the GPU has its copy: drop the canvas (a lost context is redrawn from the tile's own texture, see onRestore)
    this.fillCanvas.width = 0;
    this.fillCanvas.height = 0;
    if (!this.restoreHooked) {
      this.restoreHooked = true;
      const r = this.renderer as Phaser.Renderer.WebGL.WebGLRenderer;
      r.on(RESTORE_WEBGL, this.onRestore, this);
      this.once(Phaser.GameObjects.Events.DESTROY, () => r.off(RESTORE_WEBGL, this.onRestore, this));
    }
  }

  private onRestore(): void {
    this.dirty = true;
    this.updateTileTexture();
  }
}

function tileSprite(scene: Phaser.Scene, w: number, h: number, key: string): Phaser.GameObjects.TileSprite {
  return scene.add.existing(new LeanTileSprite(scene, 0, 0, w, h, key));
}

/**
 * Same quad as Graphics lineBetween(x0, y0, x1, y1) with line width `w` (Phaser's batchLine for a lone segment), as two filled
 * triangles in the current fill style: no Path / Point objects built per line per frame.
 */
function line(g: Phaser.GameObjects.Graphics, x0: number, y0: number, x1: number, y1: number, w: number): void {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len === 0) return;
  const h = w / 2;
  const l0 = (h * dy) / len;
  const l1 = (h * -dx) / len;
  // TL, BL, BR, TR as batchQuad splits them
  g.fillTriangle(x0 + l0, y0 + l1, x0 - l0, y0 - l1, x1 - l0, y1 - l1);
  g.fillTriangle(x0 + l0, y0 + l1, x1 - l0, y1 - l1, x1 + l0, y1 + l1);
}

/**
 * Screen-space parallax background (own zoom-1 camera): dithered sky gradient, nebula, two star
 * layers (one twinkles), a ringed planet and two ruin skylines. Every layer is positioned from the
 * world camera's centre + zoom each frame. Art pixels are an integer number of device pixels.
 */
export class BackgroundView {
  private grad: Phaser.GameObjects.Image | null = null;
  private readonly nebula: Phaser.GameObjects.TileSprite;
  private readonly starsA: Phaser.GameObjects.TileSprite;
  private readonly starsB: Phaser.GameObjects.TileSprite;
  private readonly planet: Phaser.GameObjects.Image;
  private readonly far: Phaser.GameObjects.TileSprite;
  private readonly near: Phaser.GameObjects.TileSprite;
  /** Solid ground continuing below the near skyline when its art reaches the bottom edge (jungle floor, snow, city). */
  private readonly skirt: Phaser.GameObjects.Rectangle;
  private readonly clouds: Phaser.GameObjects.TileSprite;
  private readonly bank: Phaser.GameObjects.TileSprite;
  private readonly gMid: Phaser.GameObjects.Graphics;
  private bankOn = false;
  private readonly gBack: Phaser.GameObjects.Graphics;
  private readonly gFront: Phaser.GameObjects.Graphics;
  /** Normal-blend drawing between the far and near skylines (smoke from the far stacks). */
  private readonly gFar: Phaser.GameObjects.Graphics;
  /** Additive light over the ground layers (reflections on water, glints on lava). */
  private readonly gGlint: Phaser.GameObjects.Graphics;
  /** Discs / ellipses drawn with (right above) gBack, gFront and gFar, and just under gMid (see ShapePool). */
  private readonly pBack: ShapePool;
  private readonly pFront: ShapePool;
  private readonly pFar: ShapePool;
  private readonly pMid: ShapePool;
  private readonly grounds: Phaser.GameObjects.TileSprite[];
  private readonly overcast: Phaser.GameObjects.TileSprite;
  private groundOn = false;
  private overcastOn = false;
  private glint: Backdrop['glint'];
  private glowCol: [number, number] = [0xff5a10, 0xff8a28];
  private glowAlpha = 0.34;
  /** Screen y of the far ground layer's top and its scale (device px per art px), for effects drawn over it. */
  private groundTop = 0;
  private groundS = 1;
  /** Brightness of the current lightning flash (0..1), which lights the overcast from inside. */
  private flashNow = 0;
  private extras: Extra[] = [];
  private scroll = 0;
  /** Travelling stages: the scroll speed multiplier of the current leg (eased toward `scrollGoal`) and the distance scrolled. */
  private scrollMul = 1;
  private scrollGoal = 1;
  private travel = 0;
  private lastTime = -1;
  /** Set once a leg changes the speed: from then on the travel is integrated (otherwise exactly time x speed, as before). */
  private varies = false;
  private nearDrop = 0;
  private farDrop = 0;
  private sky = SKY;
  private w = 1;
  private h = 1;
  /** Device pixels per background art pixel (integer). */
  ps = 2;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly layer: Phaser.GameObjects.Layer,
  ) {
    this.nebula = tileSprite(scene, 1, 1, 'bg-nebula').setOrigin(0, 0);
    this.starsA = tileSprite(scene, 1, 1, 'bg-stars-a').setOrigin(0, 0);
    this.starsB = tileSprite(scene, 1, 1, 'bg-stars-b').setOrigin(0, 0);
    this.planet = scene.add.image(0, 0, 'bg-planet').setOrigin(0.5, 0.5);
    this.far = tileSprite(scene, 1, 192, 'bg-ruins-far').setOrigin(0, 0);
    this.near = tileSprite(scene, 1, 192, 'bg-ruins-near').setOrigin(0, 0);
    this.grounds = GROUND_LAYERS.map((l) => tileSprite(scene, 1, l.h, 'bg-ruins-near').setOrigin(0, 0).setVisible(false));
    this.overcast = tileSprite(scene, 1, 128, 'bg-cloudsea').setOrigin(0, 0).setFlipY(true).setVisible(false);
    this.gFar = scene.add.graphics();
    this.gGlint = scene.add.graphics().setBlendMode(1 /* ADD */);
    this.skirt = scene.add.rectangle(0, 0, 1, 1, 0x000000).setOrigin(0, 0).setVisible(false);
    this.clouds = tileSprite(scene, 1, 64, 'bg-clouds').setOrigin(0, 0).setVisible(false);
    this.gBack = scene.add.graphics().setBlendMode(1 /* ADD */);
    this.gFront = scene.add.graphics().setBlendMode(1 /* ADD */);
    this.bank = tileSprite(scene, 1, 128, 'bg-cloudsea').setOrigin(0, 0).setVisible(false);
    this.gMid = scene.add.graphics();
    layer.add([this.nebula, this.starsA, this.starsB, this.planet, this.gBack, this.overcast, this.clouds, this.far, this.gFar, this.near, ...this.grounds, this.skirt, this.gGlint, this.gMid, this.bank, this.gFront]);
    ensurePolygonTextures(scene);
    this.pBack = new ShapePool(scene, layer, this.gBack, Phaser.BlendModes.ADD);
    this.pFront = new ShapePool(scene, layer, this.gFront, Phaser.BlendModes.ADD);
    this.pFar = new ShapePool(scene, layer, this.gFar, Phaser.BlendModes.NORMAL);
    // the wisps come first in gMid's drawing in every theme that has them, so they sit just under it
    this.pMid = new ShapePool(scene, layer, this.gGlint, Phaser.BlendModes.NORMAL);
  }

  setTheme(id: string | undefined): void {
    const b = BACKDROPS[id ?? 'skyline'] ?? BACKDROPS.skyline;
    setArenaPhase(0); // a scene showing the Apex starts calm (a boss match sets the phase every frame)
    this.sky = b.sky;
    this.planet.setVisible(b.planet);
    this.nebula.setTint(b.nebula);
    this.far.setTint(b.far);
    this.near.setTint(b.near);
    this.nearDrop = b.nearHaze?.drop ?? 0;
    this.near.setAlpha(b.nearHaze?.alpha ?? 1);
    this.farDrop = b.nearHaze?.farDrop ?? 0;
    this.far.setAlpha(b.nearHaze?.farAlpha ?? 1);
    this.far.setTexture(b.farTex ?? 'bg-ruins-far');
    this.near.setTexture(b.nearTex ?? 'bg-ruins-near');
    if (b.ground) {
      ensureGroundTextures(this.scene, b.ground);
      // the ground planes are only kept while a scene shows them (they are rebuilt when a stage needs them again)
      for (let i = 0; i < GROUND_LAYERS.length; i++) if (this.scene.textures.exists(`${b.ground}-${i}`)) holdTexture(this.scene, `${b.ground}-${i}`);
    }
    this.groundOn = !!b.ground;
    this.grounds.forEach((t, i) => {
      // (a ground plane that could not be built is left out rather than drawn as Phaser's missing-texture box)
      const ok = !!b.ground && this.scene.textures.exists(`${b.ground}-${i}`);
      t.setVisible(this.groundOn && ok);
      if (ok) t.setTexture(`${b.ground}-${i}`);
    });
    this.overcastOn = !!b.overcast;
    this.overcast.setVisible(this.overcastOn);
    if (b.overcast) this.overcast.setTexture(b.overcast);
    this.glint = b.glint;
    this.glowCol = b.glowCol ?? [0xff5a10, 0xff8a28];
    this.glowAlpha = b.glowAlpha ?? 0.34;
    // below everything drawn, the ground continues in the colour of its last row
    const ground = b.ground ? this.bottomColour(`${b.ground}-${this.grounds.length - 1}`, 0xffffff) : this.bottomColour(b.nearTex ?? 'bg-ruins-near', b.near);
    this.skirt.setVisible(ground !== null);
    if (ground !== null) this.skirt.setFillStyle(ground);
    this.extras = b.extras ?? [];
    for (const [extra, key] of [['moon', MOON_TEX], ['sun', SUN_TEX]] as const) {
      if (!this.extras.includes(extra)) continue;
      ensureBodyTexture(this.scene, key);
      // kept while a scene shows it, like the ground planes
      if (this.scene.textures.exists(key)) holdTexture(this.scene, key);
    }
    this.scroll = b.scroll ?? 0;
    this.scrollMul = this.scrollGoal = 1;
    this.lastTime = -1;
    this.varies = false;
    this.clouds.setVisible(this.extras.includes('clouds'));
    this.starsA.setVisible(b.stars !== false);
    this.starsB.setVisible(b.stars !== false);
    this.nebula.setVisible(b.nebulaOn !== false);
    this.bankOn = !!b.bankTex;
    this.bank.setVisible(this.bankOn);
    if (b.bankTex) this.bank.setTexture(b.bankTex);
    this.bank.setTint(b.bankTint ?? 0xffffff);
    if (this.w > 1) this.resize(this.w, this.h);
  }

  /** The average colour of a skyline texture's bottom row (times its tint), or null when that row is mostly sky. */
  private bottomColour(key: string, tint: number): number | null {
    const avg = bottomRowAverage(this.scene, key);
    if (!avg) return null;
    const t = (s: number, v: number): number => Math.round((v * ((tint >> s) & 255)) / 255);
    return (t(16, avg[0]) << 16) | (t(8, avg[1]) << 8) | t(0, avg[2]);
  }

  resize(w: number, h: number): void {
    this.w = w;
    this.h = h;
    this.ps = Math.max(1, Math.round(h / 540));
    const ps = this.ps;
    // dithered gradient at art-pixel resolution, rebuilt on resize. One texture per sky and size, shared by every scene
    // showing it and removed once none does (each scene used to keep its own full-screen copy for the whole session)
    const gw = Math.ceil(w / ps);
    const gh = Math.ceil(h / ps);
    const SKYC = this.sky;
    const key = `bg-grad:${SKYC.join('')}:${gw}x${gh}`;
    this.grad?.destroy();
    this.grad = null;
    if (!this.scene.textures.exists(key)) {
      const c = gradientCanvas(SKYC, gw, gh);
      if (c) addCanvasTexture(this.scene, key, c, () => gradientCanvas(SKYC, gw, gh));
    }
    if (this.scene.textures.exists(key)) {
      holdTexture(this.scene, key);
      this.grad = this.scene.add.image(0, 0, key).setOrigin(0, 0).setScale(ps);
      this.layer.add(this.grad);
      this.layer.sendToBack(this.grad);
    }

    for (const t of [this.nebula, this.starsA, this.starsB]) t.setSize(w, h);
    this.far.setSize(w, 192 * ps);
    this.near.setSize(w, 192 * ps);
  }

  /** Travelling stages: scroll the scenery at `k` x the theme's speed (eased in over a couple of seconds). */
  setScrollMul(k: number): void {
    if (k !== this.scrollGoal) this.varies = true;
    this.scrollGoal = k;
  }

  /** @param zoom world camera zoom (device px per world unit); @param time seconds, for twinkling */
  update(cx: number, cy: number, zoom: number, time: number): void {
    // the scenery's travel is integrated, so a change of speed (a travelling stage's leg) never jumps
    if (!this.varies || this.lastTime < 0 || time < this.lastTime) this.travel = time * this.scroll * this.scrollMul;
    else {
      const dt = Math.min(0.1, time - this.lastTime);
      this.scrollMul += (this.scrollGoal - this.scrollMul) * Math.min(1, dt * 1.2);
      this.travel += dt * this.scroll * this.scrollMul;
    }
    this.lastTime = time;
    const ps = this.ps;
    const W = this.w;
    const H = this.h;

    this.nebula.setTileScale(ps * 2, ps * 2);
    this.nebula.tilePositionX = devPx(cx * 0.03 * zoom, ps * 2);
    this.nebula.tilePositionY = devPx(cy * 0.03 * zoom, ps * 2);

    this.starsA.setTileScale(ps, ps);
    this.starsA.tilePositionX = devPx(cx * 0.05 * zoom, ps);
    this.starsA.tilePositionY = devPx(cy * 0.05 * zoom, ps);
    this.starsB.setTileScale(ps, ps);
    this.starsB.tilePositionX = devPx(cx * 0.1 * zoom, ps);
    this.starsB.tilePositionY = devPx(cy * 0.1 * zoom, ps);
    this.starsB.setAlpha(0.65 + 0.35 * Math.sin(time * 1.7));

    this.planet.setScale(ps * 1.5);
    this.planet.setPosition(W * 0.78 - cx * 0.02 * zoom, H * 0.26 - cy * 0.02 * zoom);

    // skylines: art pixel = 0.5 world units * layer scale; base line follows the camera with parallax
    const layers: [Phaser.GameObjects.TileSprite, number, number, number][] = [
      [this.far, 0.12, 0.5 * 0.55, 20 + this.farDrop],
      [this.near, 0.26, 0.5 * 0.85, 52 + this.nearDrop],
    ];
    for (const [t, f, k, baseY] of layers) {
      const s = zoom * k;
      t.setTileScale(s, s);
      t.setSize(W, 192 * s);
      t.setPosition(0, (baseY - cy * f) * zoom + H / 2 - 192 * s);
      t.tilePositionX = devPx(cx * f * zoom + this.travel * (f / 0.12) * s, s);
    }
    // the ground layers hang rigidly from the near skyline's base and slide past one another, nearer ones faster
    let bottom = this.near.y + this.near.height;
    if (this.groundOn) {
      const s = zoom * 0.5 * 0.85;
      const base = Math.floor(this.near.y + this.near.height) - 1;
      this.groundTop = base;
      this.groundS = s;
      this.grounds.forEach((t, i) => {
        const L = GROUND_LAYERS[i];
        const f = GROUND_PARALLAX[i];
        t.setTileScale(s, s);
        t.setSize(W, Math.ceil(L.h * s) + 1);
        t.setPosition(0, Math.floor(base + L.top * s));
        t.tilePositionX = devPx(cx * f * zoom + this.travel * (f / 0.12) * s, s);
      });
      const last = this.grounds[this.grounds.length - 1];
      bottom = last.y + GROUND_LAYERS[GROUND_LAYERS.length - 1].h * s;
    }
    if (this.skirt.visible) {
      const top = Math.floor(bottom) - 1;
      this.skirt.setPosition(0, top).setSize(W, Math.max(0, H - top));
    }
    if (this.overcastOn) {
      // cloud undersides scudding across the top of the sky, faster than the far scenery
      const k = ps * 2;
      this.overcast.setTileScale(k, k);
      this.overcast.setSize(W, 128 * k);
      this.overcast.setPosition(0, -k * 40 - Math.max(0, cy) * 0.03 * zoom);
      this.overcast.tilePositionX = devPx(cx * 0.06 * zoom + time * 14 * ps, k);
    }

    if (this.bankOn) {
      const k = ps * 2;
      this.bank.setTileScale(k, k);
      this.bank.setSize(W, 128 * k);
      this.bank.setPosition(0, H - 128 * k * 0.55 + Math.max(0, cy * 0.02 * zoom));
      this.bank.tilePositionX = devPx(cx * 0.35 * zoom + (time * 5 + this.travel * 4) * ps, k);
    }

    this.drawExtras(cx, cy, zoom, time);
  }

  private drawExtras(cx: number, cy: number, zoom: number, time: number): void {
    const gb = this.gBack;
    const gf = this.gFront;
    gb.clear();
    gf.clear();
    this.gMid.clear();
    this.gFar.clear();
    this.gGlint.clear();
    this.pBack.begin();
    this.pFront.begin();
    this.pFar.begin();
    this.pMid.begin();
    this.flashNow = 0;
    const gm = this.gMid;
    const W = this.w;
    const H = this.h;
    const ps = this.ps;
    for (const e of this.extras) {
      switch (e) {
        case 'clouds': {
          const k = ps * 1.6;
          this.clouds.setTileScale(k, k);
          this.clouds.setSize(W, 64 * k);
          this.clouds.setPosition(0, H * 0.34 - cy * 0.04 * zoom);
          this.clouds.tilePositionX = devPx(cx * 0.08 * zoom + (time * 7 + this.travel * 2) * ps, k);
          this.clouds.setAlpha(0.85);
          break;
        }
        case 'snow': {
          // big soft flakes drifting down and sideways, two depths, swaying as they fall
          for (let i = 0; i < 90; i++) {
            const depth = hash(i * 5 + 3) > 0.55 ? 1 : 0.5;
            const sp = (0.08 + hash(i * 5 + 1) * 0.07) * (depth + 0.4);
            const ph = (time * sp + hash(i * 5 + 2)) % 1;
            const sway = Math.sin(time * (0.8 + hash(i) * 0.6) + i) * 10 * ps * depth;
            const x = (((hash(i * 5) * (W + 60) + sway - ph * 30 * ps - cx * 0.25 * zoom * depth) % (W + 60)) + (W + 60)) % (W + 60) - 20;
            const y = ph * (H + 20) - 10;
            const s = Math.max(1, Math.round(ps * (depth > 0.9 ? 1.6 : 1)));
            gf.fillStyle(0xffffff, depth > 0.9 ? 0.8 : 0.45).fillRect(x, y, s, s);
          }
          // a few big flakes tumbling past close to the camera
          for (let i = 0; i < 22; i++) {
            const sp = 0.16 + hash(i * 9 + 701) * 0.08;
            const ph = (time * sp + hash(i * 9 + 702)) % 1;
            const sway = Math.sin(time * (1.1 + hash(i * 9 + 703)) + i) * 18 * ps;
            const span = W + 120;
            const x = (((hash(i * 9 + 704) * span + sway - ph * 60 * ps - cx * 0.5 * zoom) % span) + span) % span - 60;
            const y = ph * (H + 40) - 20;
            const s = ps * 2;
            gf.fillStyle(0xe8f4ff, 0.35).fillRect(x - ps, y, s + ps * 2, s);
            gf.fillStyle(0xe8f4ff, 0.35).fillRect(x, y - ps, s, s + ps * 2);
            gf.fillStyle(0xffffff, 0.85).fillRect(x, y, s, s);
          }
          break;
        }
        case 'rain': {
          // slanted streaks falling past the camera, two depths
          for (let i = 0; i < 110; i++) {
            const depth = hash(i * 7 + 5) > 0.6 ? 1 : 0.55;
            const sp = (1.1 + hash(i * 7 + 1) * 0.6) * depth;
            const ph = (time * sp + hash(i * 7 + 2)) % 1;
            const x = (((hash(i * 7) * (W + 80) - ph * 40 * ps - cx * 0.3 * zoom * depth) % (W + 80)) + (W + 80)) % (W + 80) - 20;
            const y = ph * (H + 30) - 15;
            gf.fillStyle(0xa8d0f0, 0.3 * depth);
            line(gf, x, y, x - 3 * ps, y + 10 * ps * depth, Math.max(1, ps * 0.6 * depth));
          }
          break;
        }
        case 'flash': {
          // distant lightning: a jagged bolt with branches, and a pale flash of the whole sky
          const slot = Math.floor(time / 5.5);
          const off = 0.8 + hash(slot * 3 + 7) * 3.6;
          const d = time - slot * 5.5 - off;
          if (d > 0 && d < 0.55 && hash(slot * 3 + 4) > 0.2) {
            const fade = d < 0.08 ? 1 : d < 0.18 ? 0.25 : d < 0.28 ? 0.8 : Math.max(0, 1 - d * 1.9);
            this.flashNow = fade * (settings.reduceFlashes ? 0.2 : 1);
            gb.fillStyle(0xcfe8ff, 0.14 * fade * (settings.reduceFlashes ? 0.2 : 1));
            gb.fillRect(0, 0, W, H);
            const bx = W * (0.15 + hash(slot * 3 + 9) * 0.7) - cx * 0.02 * zoom;
            let x = bx;
            let y = -4;
            gb.fillStyle(0xffffff, 0.9 * fade);
            for (let i = 0; i < 12; i++) {
              const nx = x + (hash(slot * 31 + i) - 0.5) * 38 * ps;
              const ny = y + H * 0.075;
              line(gb, x, y, nx, ny, Math.max(2, ps * 1.5));
              if (i === 4 || i === 8) {
                gb.fillStyle(0xbfe0ff, 0.6 * fade);
                line(gb, nx, ny, nx + (hash(slot * 17 + i) - 0.3) * 60 * ps, ny + H * 0.1, Math.max(1, ps));
                gb.fillStyle(0xffffff, 0.9 * fade);
              }
              x = nx;
              y = ny;
            }
          }
          break;
        }
        case 'ceiling': {
          // the cave roof: a ragged band of rock across the top with stalactites hanging from it, glinting crystal in the cracks
          const top = -H * 0.02 - cy * 0.05 * zoom;
          const step = 6 * ps;
          const shift = cx * 0.08 * zoom;
          // rock lit from below by the crystals: a pale rim along the underside and the lit flank of each spike
          const ROCK = 0x140e20;
          const RIM = 0x2e1f4a;
          for (let x = -step; x < W + step; x += step) {
            const u = Math.floor((x + shift) / step);
            const d = H * (0.05 + 0.03 * hash(u * 3 + 1));
            const x0 = x - (shift % step);
            gm.fillStyle(ROCK, 1).fillRect(x0, top - H, step + 1, d + H);
            gm.fillStyle(RIM, 1).fillRect(x0, top + d - ps, step + 1, ps);
            if (hash(u * 7 + 2) > 0.72) {
              // a stalactite: a narrow downward spike
              const len = H * (0.06 + 0.1 * hash(u * 5 + 3));
              const sx = x0 + step / 2;
              gm.fillStyle(ROCK, 1).fillTriangle(sx - step * 0.9, top + d - 1, sx + step * 0.9, top + d - 1, sx, top + d + len);
              gm.fillStyle(RIM, 1).fillTriangle(sx - step * 0.9, top + d - 1, sx - step * 0.45, top + d - 1, sx, top + d + len);
              if (hash(u * 11 + 4) > 0.5) {
                gf.fillStyle(0xc898f6, 0.35 + 0.2 * Math.sin(time * 1.3 + u));
                gf.fillRect(sx - ps, top + d + len * 0.4, ps * 2, ps * 2);
              }
            }
          }
          break;
        }
        case 'searchlights': {
          // beams swinging up out of the city below, crossing now and then
          for (let i = 0; i < 4; i++) {
            const ox = W * (0.08 + i * 0.29) - cx * 0.1 * zoom;
            const oy = H * 0.98 - cy * 0.1 * zoom;
            const ang = -Math.PI / 2 + Math.sin(time * (0.22 + i * 0.05) + i * 1.7) * 0.55;
            const len = H * 1.25;
            const half = 0.035;
            const tx = ox + Math.cos(ang) * len;
            const ty = oy + Math.sin(ang) * len;
            const lx = ox + Math.cos(ang - half) * len;
            const ly = oy + Math.sin(ang - half) * len;
            const rx = ox + Math.cos(ang + half) * len;
            const ry = oy + Math.sin(ang + half) * len;
            const col = i % 2 ? 0xffd8f0 : 0xd8f0ff;
            gb.fillGradientStyle(col, col, col, col, 0.1, 0, 0, 0);
            gb.fillTriangle(ox, oy, lx, ly, rx, ry);
            gb.fillGradientStyle(0xffffff, 0xffffff, 0xffffff, 0xffffff, 0.06, 0, 0, 0);
            gb.fillTriangle(ox, oy, (lx + tx) / 2, (ly + ty) / 2, (rx + tx) / 2, (ry + ty) / 2);
          }
          break;
        }
        case 'traffic': {
          // lanes of flying traffic threading between the towers: headlights one way, tail lights the other
          const s = zoom * 0.5 * 0.55;
          const base = this.far.y + 192 * s;
          for (let lane = 0; lane < 4; lane++) {
            const y = base - (30 + lane * 16) * s;
            const dir = lane % 2 ? -1 : 1;
            const sp = (40 + lane * 14) * ps;
            const span = W + 80;
            for (let k = 0; k < 9; k++) {
              const x0 = hash(lane * 40 + k) * span + dir * time * sp - cx * (0.16 + lane * 0.02) * zoom;
              const x = ((x0 % span) + span) % span - 40;
              const col = dir > 0 ? 0xfff2c8 : 0xff4a5a;
              this.gFar.fillStyle(col, 0.85).fillRect(Math.round(x), Math.round(y), ps * 2, ps);
              this.gFar.fillStyle(col, 0.25).fillRect(Math.round(x - dir * ps * 6), Math.round(y), ps * 6, ps);
            }
          }
          break;
        }
        case 'datastream': {
          // packets of light climbing the pylons' field of view: short vertical dashes rising and fading
          const s = zoom * 0.5 * 0.55;
          const base = this.far.y + 192 * s;
          for (let i = 0; i < 40; i++) {
            const sp = 0.25 + hash(i * 3 + 400) * 0.35;
            const ph = (time * sp + hash(i * 3 + 401)) % 1;
            const span = W + 40;
            const x = (((hash(i * 3 + 402) * span - cx * 0.14 * zoom) % span) + span) % span - 20;
            const y = base - ph * 150 * s;
            const a = Math.sin(ph * Math.PI) * 0.7;
            this.gFar.fillStyle(0x7ff0ff, a * 0.35).fillRect(Math.round(x), Math.round(y), ps, ps * 8);
            this.gFar.fillStyle(0xe0ffff, a).fillRect(Math.round(x), Math.round(y), ps, ps * 2);
          }
          break;
        }
        case 'wisps': {
          // soft cloud wisps drifting through the middle distance (racing past when the scenery streams)
          const speed = (6 + this.scroll * 5) * ps;
          for (let i = 0; i < 7; i++) {
            const span = W + 600;
            const x0 = hash(i * 5 + 600) * span - time * speed * (0.7 + hash(i * 5 + 601) * 0.6) - cx * (0.3 + hash(i * 5 + 602) * 0.15) * zoom;
            const x = ((x0 % span) + span) % span - 300;
            const y = H * (0.42 + hash(i * 5 + 603) * 0.38) - cy * 0.2 * zoom;
            const w = H * (0.35 + hash(i * 5 + 604) * 0.4);
            const h = w * 0.09;
            this.pMid.ellipse(x, y, w, h, 0xfff0e8, 0.07);
            this.pMid.ellipse(x + w * 0.12, y - h * 0.25, w * 0.6, h * 0.8, 0xfff6f0, 0.08);
            this.pMid.ellipse(x - w * 0.15, y + h * 0.1, w * 0.45, h * 0.6, 0xffffff, 0.06);
          }
          break;
        }
        case 'petals': {
          // blossom petals carried on the breeze, tumbling as they drift
          for (let i = 0; i < 34; i++) {
            const depth = hash(i * 7 + 800) > 0.6 ? 1 : 0.6;
            const sp = (0.05 + hash(i * 7 + 801) * 0.05) * (depth + 0.3);
            const ph = (time * sp + hash(i * 7 + 802)) % 1;
            const span = W + 80;
            const x = (((hash(i * 7 + 803) * span - ph * W * 0.5 + Math.sin(time * 1.3 + i) * 12 * ps - cx * 0.35 * zoom * depth) % span) + span) % span - 40;
            const y = ph * (H + 40) - 20 + Math.sin(time * 2 + i * 1.7) * 6 * ps;
            const flip = Math.sin(time * (3 + hash(i * 7 + 804) * 3) + i);
            const s = Math.max(1, Math.round(ps * (depth > 0.9 ? 1.5 : 1)));
            const col = i % 3 === 0 ? 0xfff4f8 : 0xffb8d0;
            const a = depth > 0.9 ? 0.85 : 0.5;
            if (Math.abs(flip) > 0.4) gf.fillStyle(col, a * 0.7).fillRect(Math.round(x), Math.round(y), s * 2, s);
            else gf.fillStyle(col, a * 0.7).fillRect(Math.round(x), Math.round(y), s, s * 2);
            gf.fillStyle(0xffffff, a * 0.5).fillRect(Math.round(x), Math.round(y), s, s);
          }
          break;
        }
        case 'wind': {
          // speed lines: thin streaks of air rushing past the moving ship
          for (let i = 0; i < 26; i++) {
            const sp = 1.2 + hash(i * 3 + 950) * 1.4;
            const ph = (time * sp * 0.35 + hash(i * 3 + 951)) % 1;
            const len = (40 + hash(i * 3 + 952) * 90) * ps;
            const x = W + len - ph * (W + len * 2);
            const y = H * (0.08 + hash(i * 3 + 953) * 0.84) - cy * 0.3 * zoom;
            const a = Math.sin(ph * Math.PI) * 0.16;
            gf.fillGradientStyle(0xffffff, 0xffffff, 0xffffff, 0xffffff, a, 0, a, 0);
            gf.fillRect(Math.round(x), Math.round(y), len, Math.max(1, Math.round(ps * 0.6)));
          }
          break;
        }
        case 'flare': {
          // the low sun's lens flare: a string of tinted ghosts mirrored through the middle of the view
          const sx = W * 0.7 - cx * 0.015 * zoom;
          const sy = H * 0.36 - cy * 0.01 * zoom;
          const dx = W / 2 - sx;
          const dy = H / 2 - sy;
          const ghosts: [number, number, number, number][] = [
            [0.45, 0.018, 0xffd0a0, 0.08],
            [0.8, 0.035, 0xff9ab0, 0.05],
            [1.15, 0.012, 0xffffff, 0.1],
            [1.5, 0.06, 0xb8a0ff, 0.035],
            [1.85, 0.025, 0xffe0a0, 0.06],
          ];
          for (const [t, r, col, a] of ghosts) {
            const x = sx + dx * t;
            const y = sy + dy * t;
            this.pFront.circle(x, y, H * r, col, a);
            this.pFront.circle(x, y, H * r * 0.6, col, a * 0.6);
          }
          // a horizontal streak through the sun
          gf.fillGradientStyle(0xffe8c8, 0xffe8c8, 0xffe8c8, 0xffe8c8, 0, 0.14, 0, 0.14);
          gf.fillRect(sx - W * 0.3, sy - ps, W * 0.3, ps * 2);
          gf.fillGradientStyle(0xffe8c8, 0xffe8c8, 0xffe8c8, 0xffe8c8, 0.14, 0, 0.14, 0);
          gf.fillRect(sx, sy - ps, W * 0.3, ps * 2);
          break;
        }
        case 'shafts': {
          // pale light falling through cracks in the cave roof, breathing slowly, dust turning in it
          const top = -H * 0.02 - cy * 0.05 * zoom;
          for (let i = 0; i < 4; i++) {
            const ox = W * (0.1 + i * 0.27 + hash(i + 70) * 0.06) - cx * 0.08 * zoom;
            const lean = W * (0.05 + hash(i + 80) * 0.05);
            const len = H * (0.8 + hash(i + 90) * 0.25);
            const w0 = W * (0.008 + 0.008 * hash(i + 95));
            const w1 = w0 * 5;
            const breathe = 0.65 + 0.35 * Math.sin(time * 0.35 + i * 1.9);
            const col = i % 2 ? 0xb890ff : 0x8ae0ff;
            const a0 = 0.13 * breathe;
            const ax = ox - w0;
            const bx = ox + w0;
            const cxL = ox + lean - w1;
            const dxR = ox + lean + w1;
            const by = top + len;
            gb.fillGradientStyle(col, col, col, col, a0, a0, 0, 0);
            gb.fillTriangle(ax, top, bx, top, cxL, by);
            gb.fillGradientStyle(col, col, col, col, a0, 0, 0, 0);
            gb.fillTriangle(bx, top, cxL, by, dxR, by);
            // a brighter core
            gb.fillGradientStyle(0xffffff, 0xffffff, 0xffffff, 0xffffff, a0 * 0.4, a0 * 0.4, 0, 0);
            gb.fillTriangle(ox - w0 * 0.4, top, ox + w0 * 0.4, top, ox + lean * 0.6, top + len * 0.6);
            for (let k = 0; k < 9; k++) {
              const u = (time * (0.012 + hash(i * 20 + k) * 0.02) + hash(i * 20 + k + 5)) % 1;
              const side = hash(i * 20 + k + 9) - 0.5 + Math.sin(time * 0.6 + k) * 0.1;
              const x = ox + lean * u + side * 2 * (w0 + (w1 - w0) * u);
              const y = top + len * u;
              gb.fillStyle(0xf0e4ff, 0.5 * breathe * Math.sin(u * Math.PI));
              gb.fillRect(Math.round(x), Math.round(y), ps, ps);
            }
          }
          break;
        }
        case 'smoke': {
          // steam from the far cooling towers and smoke from the stacks, lit from below by the furnace glow
          const s = zoom * 0.5 * 0.55;
          const tile = 512 * s;
          const tp = this.far.tilePositionX;
          const top = this.far.y;
          INDUSTRY_VENTS.forEach((v, vi) => {
            const first = ((((v.x - tp) * s) % tile) + tile) % tile;
            for (let lx = first - tile; lx < W + 20 * s; lx += tile) {
              if (lx < -120 * s) continue;
              for (let k = 0; k < 8; k++) {
                const ph = (time * (v.steam ? 0.07 : 0.1) + k / 8 + hash(vi * 17 + 3)) % 1;
                const rise = ph * (v.steam ? 64 : 84);
                const drift = ph * ph * 56 + Math.sin(time * 0.7 + k * 1.3 + vi) * 2;
                const r = (v.w * (v.steam ? 0.3 : 0.4) + ph * (v.steam ? 15 : 10)) * s;
                const a = Math.min(1, ph * 7) * (1 - ph) * (v.steam ? 0.34 : 0.42);
                const col = v.steam ? (ph < 0.3 ? 0xc07a5a : 0x7a4a40) : ph < 0.25 ? 0x4a2216 : 0x24120e;
                this.pFar.circle(lx + drift * s, top + (v.y - rise) * s, r, col, a);
              }
            }
          });
          break;
        }
        case 'fireflies': {
          // fireflies over the jungle below, winking on and off as they wander
          const base = this.groundOn ? this.groundTop : H * 0.6;
          const s = this.groundOn ? this.groundS : zoom * 0.425;
          for (let i = 0; i < 34; i++) {
            const blink = Math.max(0, Math.sin(time * (0.9 + hash(i * 3 + 300)) + hash(i * 3 + 301) * 6.28));
            if (blink < 0.05) continue;
            const wx = hash(i * 3 + 302) * (W + 200) + Math.sin(time * 0.3 + i) * 24 * ps - cx * 0.3 * zoom;
            const x = ((wx % (W + 200)) + W + 200) % (W + 200) - 100;
            const y = base + (-30 + hash(i * 3 + 303) * 220) * s + Math.sin(time * 0.5 + i * 2) * 8 * ps;
            const a = blink * blink;
            gf.fillStyle(0xc8ff60, 0.18 * a).fillRect(Math.round(x - ps), Math.round(y - ps), ps * 4, ps * 4);
            gf.fillStyle(0xf0ffa0, 0.85 * a).fillRect(Math.round(x), Math.round(y), ps * 2, ps * 2);
          }
          break;
        }
        case 'drips': {
          // water dripping from the roof, catching the crystal light as it falls
          for (let i = 0; i < 14; i++) {
            const sp = 0.35 + hash(i * 3 + 1) * 0.35;
            const ph = (time * sp + hash(i * 3 + 2)) % 1;
            const x = ((hash(i * 3) * W - cx * 0.15 * zoom) % W + W) % W;
            const y = H * (0.1 + ph * 0.95);
            gf.fillStyle(0xd8c8ff, 0.5 * (1 - ph));
            gf.fillRect(Math.round(x), Math.round(y), ps, ps * 3);
          }
          break;
        }
        case 'moon': {
          // a full moon with soft halo rings: a shaded disc (limb darkening, a soft terminator, maria and craters)
          const mx = W * 0.24 - cx * 0.015 * zoom;
          const my = H * 0.2 - cy * 0.01 * zoom;
          const r = H * 0.06;
          const pb = this.pBack;
          for (let k = 5; k >= 1; k--) pb.circle(mx, my, r * (1 + k * 0.55), 0x9ad0ff, 0.035);
          pb.image(MOON_TEX, MOON_SIZE, mx, my, r, 0xe6f2ff, 0.97);
          break;
        }
        case 'beacon': {
          // the lighthouse lamp in the far layer sweeps its beam round; brightest when it swings toward us
          const s = zoom * 0.5 * 0.55;
          const top = (20 - cy * 0.12) * zoom + H / 2 - 192 * s;
          const tile = 1024 * s; // bg-cove-far is twice the usual width so the lighthouse appears once
          const first = ((((COVE_LAMP.x - (cx * 0.12 * zoom) / s) * s) % tile) + tile) % tile;
          const a = time * 0.9;
          const reach = W * 0.9;
          const sweep = Math.sin(a);
          const toward = Math.max(0, Math.cos(a));
          for (let lx = first - tile; lx < W + tile; lx += tile) {
            if (lx < -reach || lx > W + reach) continue;
            const ly = top + COVE_LAMP.y * s;
            const ex = lx + sweep * reach;
            const spread = H * (0.04 + 0.05 * toward);
            gb.fillStyle(0xfff4c8, 0.07 + 0.05 * (1 - Math.abs(sweep)));
            gb.fillTriangle(lx, ly, ex, ly - spread, ex, ly + spread * 0.6);
            gb.fillStyle(0xffffff, 0.05);
            gb.fillTriangle(lx, ly, ex, ly - spread * 0.35, ex, ly + spread * 0.2);
            this.pBack.circle(lx, ly, (3 + 10 * toward ** 6) * ps, 0xfff4c8, 0.12 + 0.35 * toward ** 6);
          }
          break;
        }
        case 'sun': {
          const sx = W * 0.7 - cx * 0.015 * zoom;
          const sy = H * 0.36 - cy * 0.01 * zoom;
          const pulse = 0.94 + 0.06 * Math.sin(time * 0.9);
          for (let r = 7; r >= 1; r--) this.pBack.circle(sx, sy, r * H * 0.075 * pulse, r > 4 ? 0xffb070 : 0xffd890, 0.05 + (7 - r) * 0.012);
          // the corona: slow, uneven streamers turning round the disc
          for (let i = 0; i < 16; i++) {
            const a = (i / 16) * Math.PI * 2 + time * 0.03;
            const len = H * (0.1 + 0.05 * hash(i * 7 + 3) + 0.02 * Math.sin(time * 0.7 + i * 1.3));
            const half = H * 0.012;
            const nx = -Math.sin(a);
            const ny = Math.cos(a);
            const x0 = sx + Math.cos(a) * H * 0.06;
            const y0 = sy + Math.sin(a) * H * 0.06;
            gb.fillStyle(0xffd890, 0.1);
            gb.fillTriangle(x0 + nx * half, y0 + ny * half, x0 - nx * half, y0 - ny * half, sx + Math.cos(a) * (H * 0.06 + len), sy + Math.sin(a) * (H * 0.06 + len));
          }
          // the disc: limb-darkened, warm at the rim, mottled with granulation
          this.pBack.image(SUN_TEX, SUN_SIZE, sx, sy, H * 0.07, 0xffffff, 0.98);
          break;
        }
        case 'godrays': {
          const sx = W * 0.7 - cx * 0.015 * zoom;
          const sy = H * 0.36 - cy * 0.01 * zoom;
          for (let i = 0; i < 7; i++) {
            const a = Math.PI * (0.62 + i * 0.12) + Math.sin(time * 0.15 + i) * 0.03;
            const len = H * 1.3;
            const half = 0.045 + (i % 3) * 0.015;
            gb.fillStyle(0xffe0b0, 0.05);
            gb.fillTriangle(sx, sy, sx + Math.cos(a - half) * len, sy + Math.sin(a - half) * len, sx + Math.cos(a + half) * len, sy + Math.sin(a + half) * len);
          }
          break;
        }
        case 'birds': {
          // small flocks crossing the sky, wings flapping
          for (let f = 0; f < 2; f++) {
            const dir = f === 0 ? 1 : -1;
            const u = ((time * (0.018 + f * 0.007) + f * 0.5) % 1 + 1) % 1;
            const bx0 = (dir > 0 ? u : 1 - u) * (W + 200) - 100 - cx * 0.04 * zoom;
            const by0 = H * (0.2 + f * 0.13) - cy * 0.03 * zoom;
            for (let i = 0; i < 5; i++) {
              const x = bx0 - dir * i * 14 * ps;
              const y = by0 + Math.abs(i - 2) * 6 * ps + Math.sin(time * 1.3 + i) * 3 * ps;
              const flap = Math.sin(time * 7 + i * 1.3) * 3 * ps;
              gm.fillStyle(0x4a2a4e, 0.85);
              line(gm, x - 5 * ps, y - flap, x, y, Math.max(1, ps * 0.8));
              line(gm, x, y, x + 5 * ps, y - flap, Math.max(1, ps * 0.8));
            }
          }
          break;
        }
        case 'aurora': {
          // slow curtains of magenta and teal light
          for (let band = 0; band < 3; band++) {
            const col = band === 1 ? 0x40e8d0 : 0xd060f0;
            const baseY = H * (0.14 + band * 0.07) - cy * 0.03 * zoom;
            const step = Math.max(8, W / 48);
            for (let x = 0; x < W; x += step) {
              const u = x / W;
              const wave = Math.sin(u * 5 + time * 0.25 + band * 1.7) * H * 0.04 + Math.sin(u * 11 - time * 0.4 + band) * H * 0.015;
              const len = H * (0.12 + 0.06 * Math.sin(u * 7 + time * 0.3 + band * 2));
              const a = 0.05 + 0.03 * Math.sin(u * 9 + time * 0.5 + band);
              gb.fillGradientStyle(col, col, col, col, a, a, 0, 0);
              gb.fillRect(x - cx * 0.02 * zoom, baseY + wave, step + 1, len);
            }
          }
          break;
        }
        case 'airships': {
          // far-off craft crossing with blinking nav lights
          for (let i = 0; i < 3; i++) {
            const sp = 0.012 + hash(i + 40) * 0.01;
            const u = (time * sp * (i % 2 ? -1 : 1) + hash(i + 50)) % 1;
            const x = (((u % 1) + 1) % 1) * (W + 80) - 40 - cx * 0.05 * zoom;
            const y = H * (0.28 + hash(i + 60) * 0.12) - cy * 0.05 * zoom;
            const blink = Math.sin(time * 3 + i * 2) > 0.2;
            gf.fillStyle(0xffffff, blink ? 0.9 : 0.15);
            gf.fillRect(Math.round(x), Math.round(y), ps * 2, ps * 2);
            gf.fillStyle(0xff4a4a, 0.7);
            gf.fillRect(Math.round(x - ps * 6), Math.round(y + ps), ps * 2, ps * 2);
            gf.fillStyle(0x4aff8a, 0.7);
            gf.fillRect(Math.round(x + ps * 6), Math.round(y + ps), ps * 2, ps * 2);
          }
          break;
        }
        case 'shooting': {
          // one streak every ~6 s, each with its own start point and angle
          const slot = Math.floor(time / 6);
          const t = (time - slot * 6) / 0.7;
          if (t < 1 && hash(slot * 3 + 1) > 0.25) {
            const x0 = W * (0.1 + hash(slot * 3) * 0.8);
            const y0 = H * (0.05 + hash(slot * 3 + 2) * 0.3);
            const dx = (hash(slot * 7) > 0.5 ? 1 : -1) * W * 0.28;
            const dy = H * 0.12;
            const hx = x0 + dx * t;
            const hy = y0 + dy * t;
            for (let i = 0; i < 8; i++) {
              const u = Math.max(0, t - i * 0.035);
              gb.fillStyle(0xffffff, (1 - i / 8) * (1 - t * 0.6));
              gb.fillRect(Math.round(x0 + dx * u), Math.round(y0 + dy * u), ps * 2, ps * 2);
            }
            gb.fillStyle(0xcfe8ff, 0.9);
            gb.fillRect(Math.round(hx), Math.round(hy), ps * 3, ps * 3);
          }
          break;
        }
        case 'lightning': {
          // rare flash across the reactor sky
          const slot = Math.floor(time / 8);
          const t = time - slot * 8;
          const off = 1 + hash(slot) * 5;
          const d = t - off;
          if (d > 0 && d < 0.35) {
            const a = (d < 0.07 ? 0.2 : d < 0.15 ? 0.04 : d < 0.22 ? 0.16 : 0.05) * (1 - d);
            gb.fillStyle(0xffb878, a * (settings.reduceFlashes ? 0.2 : 1));
            gb.fillRect(0, 0, W, H);
          }
          break;
        }
        case 'glow': {
          const pulse = 0.75 + 0.25 * Math.sin(time * 1.4);
          const top = H * 0.5;
          const [lo, hi] = this.glowCol;
          const ga = this.glowAlpha * pulse;
          gb.fillGradientStyle(lo, lo, hi, hi, 0, 0, ga, ga);
          gb.fillRect(0, top, W, H - top);
          // molten sun/core low on the horizon, drifting with the camera
          const gx = W * 0.5 - cx * 0.03 * zoom;
          for (let r = 4; r >= 1; r--) this.pBack.circle(gx, H * 0.78, r * H * 0.12, hi, (0.05 * pulse * this.glowAlpha) / 0.34);
          break;
        }
        case 'embers': {
          for (let i = 0; i < 46; i++) {
            const speed = 0.04 + hash(i * 5 + 1) * 0.07;
            const ph = (time * speed + hash(i * 5 + 2)) % 1;
            const sway = Math.sin(time * (0.6 + hash(i * 5 + 3)) + i) * 14 * ps;
            const x = hash(i * 5) * W + sway - cx * 0.2 * zoom;
            const y = H * (1.05 - ph * 1.15);
            const wx = ((x % W) + W) % W;
            const flick = 0.55 + 0.45 * Math.sin(time * 9 + i * 1.7);
            gf.fillStyle(ph > 0.6 ? 0xff8a30 : 0xffd060, (1 - ph) * flick);
            const sz = hash(i * 5 + 4) > 0.8 ? ps * 3 : ps * 2;
            gf.fillRect(Math.round(wx), Math.round(y), sz, sz);
          }
          break;
        }
        case 'beams': {
          for (let i = 0; i < 3; i++) {
            const ox = W * (0.2 + i * 0.3) - cx * 0.04 * zoom;
            const ang = Math.sin(time * 0.35 + i * 2.1) * 0.35;
            const reach = H * 1.1;
            const tx = ox + Math.sin(ang) * reach;
            const half = H * 0.07;
            gb.fillStyle(0x6ae8ff, 0.06);
            gb.fillTriangle(ox, -4, tx - half, reach, tx + half, reach);
            gb.fillStyle(0xbffcff, 0.05);
            gb.fillTriangle(ox, -4, tx - half * 0.4, reach, tx + half * 0.4, reach);
          }
          break;
        }
        case 'grid': {
          const hy = H * 0.8;
          const vx = W * 0.5 - cx * 0.06 * zoom;
          const lw = Math.max(1, ps * 0.5);
          gb.fillStyle(0x4ad8ff, 0.2);
          for (let k = -14; k <= 14; k++) {
            line(gb, vx + k * W * 0.03, hy, vx + k * W * 0.2, H, lw);
          }
          for (let k = 0; k < 8; k++) {
            const f = ((k + ((time * 0.35 + cx * 0.0004) % 1)) / 8) ** 2;
            const y = hy + (H - hy) * f;
            line(gb, 0, y, W, y, lw);
          }
          // a glowing horizon line, and a bright scan pulse sweeping out of it toward us every few seconds
          gb.fillGradientStyle(0x4ad8ff, 0x4ad8ff, 0x4ad8ff, 0x4ad8ff, 0, 0, 0.22, 0.22);
          gb.fillRect(0, hy - H * 0.05, W, H * 0.05);
          gb.fillStyle(0xbffcff, 0.45).fillRect(0, hy - Math.max(1, ps * 0.5), W, Math.max(1, ps));
          const sp = (time % 3.2) / 1.6;
          if (sp < 1) {
            const y = hy + (H - hy) * sp * sp;
            const a = 0.5 * (1 - sp);
            gb.fillGradientStyle(0x6ae8ff, 0x6ae8ff, 0x6ae8ff, 0x6ae8ff, 0, 0, a, a);
            gb.fillRect(0, y - 10 * ps * (0.3 + sp), W, 10 * ps * (0.3 + sp));
            gb.fillStyle(0xe0ffff, a).fillRect(0, y, W, Math.max(1, ps));
          }
          break;
        }
        case 'crown': {
          // the Overseer's sigil over the citadel: the vast shadow of its spire crown fanned up behind the arena, and its eye
          // in the middle, slowly looking about. Phase 2: the sky burns, the blades are rimmed in fire, the eye turns red
          const p2 = arenaPhase > 0;
          // the change: the sigil gutters out and comes back burning (BossCinematic's transition window)
          const k = p2 && arenaShift < 90 ? (arenaShift < 10 ? 1 - arenaShift / 10 : arenaShift < 50 ? ((arenaShift >> 2) & 1) * 0.6 : Math.min(1, (arenaShift - 50) / 40)) : 1;
          const ox = W * 0.5 - cx * 0.05 * zoom;
          const oy = H * 0.58 - cy * 0.03 * zoom;
          const hot = p2 ? 0xff4a2a : 0xb685ff;
          if (p2) {
            gb.fillStyle(0xff2a10, 0.1 * k).fillRect(0, 0, W, H);
            gb.fillStyle(0xff6a2a, 0.08 * k).fillRect(0, H * 0.45, W, H * 0.55);
          }
          const gfar = this.gFar;
          for (let i = 0; i < 7; i++) {
            const u = (i - 3) / 3;
            const a = -Math.PI / 2 + u * (p2 ? 1.25 : 1.1) + Math.sin(time * 0.2 + i) * 0.01;
            const L = H * (0.62 - Math.abs(u) * 0.2) * (p2 ? 1.08 : 1);
            const wd = H * (0.035 - Math.abs(u) * 0.008);
            const dx = Math.cos(a);
            const dy = Math.sin(a);
            const r0 = H * 0.14;
            const bx = ox + dx * r0;
            const by = oy + dy * r0;
            const tx = ox + dx * L;
            const ty = oy + dy * L;
            gfar.fillStyle(0x0c0818, 0.82);
            gfar.fillTriangle(bx - dy * wd, by + dx * wd, bx + dy * wd, by - dx * wd, tx, ty);
            // the lit edge, and a light at the tip
            gb.fillStyle(hot, (p2 ? 0.3 : 0.16) * k);
            line(gb, bx - dy * wd, by + dx * wd, tx, ty, Math.max(1, ps));
            this.pBack.circle(tx, ty, ps * (p2 ? 4 : 3), hot, (p2 ? 0.8 : 0.5) * k);
          }
          // the eye: a dark almond, a ring of light, a pupil that drifts as if watching the fight
          const er = H * 0.11;
          this.pFar.ellipse(ox, oy, er * 3.2, er * 1.5, 0x0c0818, 0.85);
          this.pBack.circle(ox, oy, er * 1.6, hot, 0.06 * k);
          const look = Math.sin(time * 0.37) * er * 0.25;
          const lookY = Math.sin(time * 0.23 + 1) * er * 0.08;
          this.pFar.ellipse(ox + look, oy + lookY, er * 1.15, er * 1.15, hot, 0.36 * k);
          this.pFar.ellipse(ox + look, oy + lookY, er * 0.8, er * 0.8, 0x0c0818, 0.9);
          if (p2) this.pFar.ellipse(ox + look, oy + lookY, er * 0.22, er * 0.75, 0xffc0a0, 0.95 * k);
          else this.pFar.ellipse(ox + look, oy + lookY, er * 0.32, er * 0.32, 0xf0e4ff, 0.9 * k);
          break;
        }
        case 'ascend': {
          // light rising from the clouds far below toward the citadel; embers once the boss is enraged
          const p2 = arenaPhase > 0;
          for (let i = 0; i < 30; i++) {
            const sp = (p2 ? 0.05 : 0.025) + hash(i * 3 + 1) * 0.03;
            const ph = (time * sp + hash(i * 3 + 2)) % 1;
            const x = ((hash(i * 3) * W - cx * 0.1 * zoom + Math.sin(time * 0.4 + i) * 12 * ps) % W + W) % W;
            const y = H * (1.02 - ph * 1.05);
            const sz = ps * (hash(i + 77) > 0.7 ? 3 : 2);
            gf.fillStyle(p2 ? (hash(i + 5) > 0.5 ? 0xff7a3a : 0xffc070) : 0xd2b0ff, 0.5 * Math.sin(ph * Math.PI));
            gf.fillRect(Math.round(x), Math.round(y), sz, sz * (p2 ? 1 : 2));
          }
          break;
        }
        case 'floodlights': {
          // light cones from the stadium's lamp masts (in the near layer) down onto the field, swaying a little
          const s = zoom * 0.5 * 0.85;
          const top = (52 + this.nearDrop - cy * 0.26) * zoom + H / 2 - 192 * s;
          const tile = 512 * s;
          const shift = ((((-cx * 0.26 * zoom) / s) * s) % tile + tile) % tile;
          for (let lx0 = shift - tile; lx0 < W + tile; lx0 += tile) {
            for (const L of STADIUM_LAMPS) {
              const lx = lx0 + L.x * s;
              const ly = top + L.y * s;
              if (lx < -W * 0.5 || lx > W * 1.5) continue;
              const toward = lx < W / 2 ? 1 : -1;
              const ex = lx + toward * W * (0.25 + 0.03 * Math.sin(time * 0.3 + L.x));
              gb.fillStyle(0xfff0d0, 0.05);
              gb.fillTriangle(lx - 8 * s, ly, lx + 8 * s, ly, ex + W * 0.12, H);
              gb.fillTriangle(lx - 8 * s, ly, ex - W * 0.12, H, ex + W * 0.12, H);
              this.pBack.circle(lx, ly + 3 * s, 14 * s, 0xfff6dc, 0.25);
            }
          }
          break;
        }
        case 'flashbulbs': {
          // camera flashes winking in the crowd
          const s = zoom * 0.5 * 0.85;
          const top = (52 + this.nearDrop - cy * 0.26) * zoom + H / 2 - 192 * s;
          for (let i = 0; i < 26; i++) {
            const a = Math.sin(time * (1.3 + hash(i * 5 + 1) * 2.2) + hash(i * 5 + 2) * 6.28);
            if (a < 0.93) continue;
            const x = ((hash(i * 5 + 3) * W - cx * 0.26 * zoom) % W + W) % W;
            const y = top + (100 + hash(i * 5 + 4) * 80) * s;
            if (y > H) continue;
            this.pFront.circle(x, y, ps * 2.5, 0xffffff, (a - 0.93) * 10);
          }
          break;
        }
        case 'motes': {
          for (let i = 0; i < 28; i++) {
            const ph = (time * (0.02 + hash(i * 3 + 1) * 0.03) + hash(i * 3 + 2)) % 1;
            const x = ((hash(i * 3) * W - cx * 0.12 * zoom + Math.sin(time * 0.5 + i) * 10 * ps) % W + W) % W;
            const y = H * (1 - ph);
            const sz = ps * (hash(i + 99) > 0.7 ? 3 : 2);
            gf.fillStyle(0x9ff4ff, 0.5 * Math.sin(ph * Math.PI));
            gf.fillRect(Math.round(x), Math.round(y), sz, sz);
          }
          break;
        }
      }
    }
    if (this.overcastOn) {
      // the cloud ceiling lights up from inside when lightning flashes
      const f = this.flashNow;
      const c = (a: number): number => Math.round(a + (255 - a) * f);
      this.overcast.setTint((c(0x9a) << 16) | (c(0xa8) << 8) | c(0xc0));
    }
    this.pBack.end();
    this.pFront.end();
    this.pFar.end();
    this.pMid.end();
    this.drawGlint(cx, zoom, time);
  }

  /** Light on the water or lava of the far ground layer: a moon's broken reflection, or glints winking in and out. */
  private drawGlint(cx: number, zoom: number, time: number): void {
    const gl = this.glint;
    if (!gl || !this.groundOn) return;
    const g = this.gGlint;
    const s = this.groundS;
    const W = this.w;
    const H = this.h;
    const y0 = this.groundTop + gl.y0 * s;
    const y1 = Math.min(H, this.groundTop + gl.y1 * s);
    if (y1 <= y0) return;
    const A = gl.alpha ?? 1;
    if (gl.path) {
      // under the moon: rows of short dashes that widen toward the viewer and shiver a few times a second
      const mx = W * 0.24 - cx * 0.015 * zoom;
      const step = Math.max(2, Math.round(s * 2));
      const slot = Math.floor(time * 5);
      for (let y = Math.round(y0); y < y1; y += step) {
        const u = (y - y0) / Math.max(1, this.groundTop + gl.y1 * s - y0);
        const row = Math.floor((y - this.groundTop) / step);
        const half = H * (0.014 + 0.05 * u);
        for (let k = 0; k < 3; k++) {
          const h = hash(row * 7 + k * 31 + slot * 101);
          const len = half * (0.25 + 0.6 * hash(row * 13 + k + slot * 57));
          const x = mx + (h - 0.5) * 2 * half * (k === 0 ? 0.5 : 1);
          g.fillStyle(gl.cols[k % gl.cols.length], A * (0.4 - 0.25 * u) * (k === 0 ? 1 : 0.55));
          g.fillRect(Math.round(x - len / 2), y, Math.max(1, Math.round(len)), Math.max(1, Math.round(step * 0.5)));
        }
      }
      return;
    }
    // glints fixed to the far ground layer, so they ride along with it as it scrolls
    const tile = 512 * s;
    const tp = this.grounds[0].tilePositionX;
    const sz = Math.max(1, Math.round(s));
    for (let i = 0; i < 80; i++) {
      const a = Math.sin(time * (0.7 + hash(i * 3 + 502) * 1.4) + hash(i * 3 + 503) * 6.28);
      if (a <= 0.25) continue;
      const ax = hash(i * 3 + 500) * 512;
      const ay = gl.y0 + hash(i * 3 + 501) * (gl.y1 - gl.y0);
      const y = Math.round(this.groundTop + ay * s);
      if (y > H) continue;
      const col = gl.cols[i % gl.cols.length];
      const w = sz * (hash(i + 900) > 0.6 ? 3 : 2);
      for (let x = ((((ax - tp) * s) % tile) + tile) % tile; x < W; x += tile) {
        g.fillStyle(col, A * (a - 0.25) * 0.8).fillRect(Math.round(x), y, w, sz);
      }
    }
  }
}
