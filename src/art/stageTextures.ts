import Phaser from 'phaser';
import { addCanvasTexture, context2d } from './canvasTexture';

/**
 * All world / background art is generated here at "art pixel" density: 1 art pixel = 0.5 world
 * units, the same density as the 64px character sprites. World textures are drawn at 2x world size
 * and displayed at scale 0.5.
 */

export { mulberry32 } from './rng';
import { mulberry32 } from './rng';

type Ctx = CanvasRenderingContext2D;

function canvas(w: number, h: number): [HTMLCanvasElement, Ctx] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  // (willReadFrequently keeps these on the CPU rasteriser, which the art was drawn and checked with)
  const ctx = context2d(c, { willReadFrequently: true });
  if (!ctx) throw new Error(`no canvas memory for a ${w}x${h} texture`);
  ctx.imageSmoothingEnabled = false;
  return [c, ctx];
}

const px = (g: Ctx, color: string, x: number, y: number, w = 1, h = 1): void => {
  g.fillStyle = color;
  g.fillRect(Math.round(x), Math.round(y), w, h);
};

/** Stone ramp, dark -> light. */
const STONE_DEFAULT = ['#221d38', '#2e2848', '#3b3459', '#4b4470', '#605890', '#7b72b0'];
const CYAN_DEFAULT = ['#12414a', '#1c7f8c', '#34d6d0', '#8ff6ee', '#e6ffff'];
const AMBER = ['#4a2a18', '#8a4f2c', '#d9822b', '#ffb02e', '#ffe08a'];

/** Tileable value noise in [0,1]. */
function makeNoise(seed: number, period: number): (x: number, y: number) => number {
  const rnd = mulberry32(seed);
  const grid: number[] = [];
  for (let i = 0; i < period * period; i++) grid.push(rnd());
  const at = (x: number, y: number): number => grid[((y % period) + period) % period * period + (((x % period) + period) % period)];
  return (x, y) => {
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const fx = x - x0;
    const fy = y - y0;
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);
    const a = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * sx;
    const b = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * sx;
    return a + (b - a) * sy;
  };
}

// ---------------------------------------------------------------------------------------------
// Stage pieces
// ---------------------------------------------------------------------------------------------

/** 32x32 tileable masonry: 16x8 blocks in running bond, shaded edges, cracks, glowing rune seams. */
function stoneTile(STONE: string[] = STONE_DEFAULT, CYAN: string[] = CYAN_DEFAULT, seed = 11): HTMLCanvasElement {
  const [c, g] = canvas(32, 32);
  const rnd = mulberry32(seed);
  for (let row = 0; row < 4; row++) {
    const off = row % 2 === 0 ? 0 : 8;
    for (let col = -1; col < 3; col++) {
      const x = col * 16 + off;
      const y = row * 8;
      const shade = 2 + Math.floor(rnd() * 2); // 2..3
      g.save();
      g.beginPath();
      g.rect(0, 0, 32, 32);
      g.clip();
      px(g, STONE[shade], x, y, 16, 8);
      // top/left highlight, bottom/right shadow
      px(g, STONE[shade + 1], x, y, 16, 1);
      px(g, STONE[shade + 1], x, y, 1, 8);
      px(g, STONE[shade - 2], x, y + 7, 16, 1);
      px(g, STONE[shade - 2], x + 15, y, 1, 8);
      // speckle
      for (let i = 0; i < 9; i++) px(g, STONE[Math.max(0, shade - 1 + Math.floor(rnd() * 3))], x + 1 + Math.floor(rnd() * 14), y + 1 + Math.floor(rnd() * 6));
      // crack
      if (rnd() > 0.78) {
        let cx = x + 3 + Math.floor(rnd() * 9);
        for (let k = 0; k < 5; k++) {
          px(g, STONE[0], cx, y + 1 + k);
          cx += rnd() > 0.5 ? 1 : 0;
        }
      }
      // glowing rune seam
      if (rnd() > 0.88) {
        px(g, CYAN[1], x + 4, y + 3, 6, 1);
        px(g, CYAN[2], x + 5, y + 3, 4, 1);
        px(g, CYAN[3], x + 6, y + 3, 2, 1);
      }
      g.restore();
    }
  }
  return c;
}

/** 32x12 tileable trim cap: brushed metal, glowing conduit, panel seams with rivets. */
function capTile(M: string[] = ['#6f679f', '#8f86c8', '#b9b0f0', '#544c82', '#6a6298', '#3d3664', '#a89fe0', '#3a3360', '#2a2548', '#221d3e'], CYAN: string[] = CYAN_DEFAULT): HTMLCanvasElement {
  const [c, g] = canvas(32, 12);
  px(g, M[0], 0, 0, 32, 12);
  px(g, M[1], 0, 0, 32, 2); // top light
  px(g, M[2], 0, 0, 32, 1);
  px(g, CYAN[0], 0, 2, 32, 3); // conduit trough
  px(g, CYAN[1], 0, 3, 32, 1);
  for (let x = 0; x < 32; x += 8) {
    px(g, CYAN[2], x + 1, 3, 5, 1);
    px(g, CYAN[3], x + 2, 3, 3, 1);
  }
  px(g, M[3], 0, 5, 32, 4);
  px(g, M[4], 0, 5, 32, 1);
  for (const x of [0, 16]) {
    px(g, M[5], x, 5, 1, 7); // panel seam
    px(g, M[6], x + 2, 6, 1, 1); // rivets
    px(g, M[6], x + 13, 6, 1, 1);
  }
  px(g, M[7], 0, 9, 32, 1);
  px(g, M[8], 0, 10, 32, 2); // shadow lip
  for (let x = 2; x < 32; x += 6) px(g, M[9], x, 10, 3, 1);
  return c;
}

/** 32x12 one-way grating platform with running lights. */
function passTile(): HTMLCanvasElement {
  const [c, g] = canvas(32, 12);
  px(g, '#245d73', 0, 0, 32, 12);
  px(g, '#6fe3f2', 0, 0, 32, 1);
  px(g, '#3fb6cc', 0, 1, 32, 2);
  px(g, '#1b4859', 0, 3, 32, 1);
  for (let x = 0; x < 32; x += 4) {
    px(g, '#173a49', x, 4, 2, 6); // grating slots
    px(g, '#2f7d92', x + 2, 4, 2, 6);
  }
  for (let x = 2; x < 32; x += 8) {
    px(g, '#fff3b0', x, 2, 2, 1); // running lights
    px(g, '#ffd46a', x, 3, 2, 1);
  }
  px(g, '#10303c', 0, 10, 32, 2);
  px(g, '#58d6e8', 0, 11, 32, 1); // underglow
  return c;
}

/** 32x12 moving platform: hazard stripes + thruster glow. */
function moveTile(): HTMLCanvasElement {
  const [c, g] = canvas(32, 12);
  px(g, '#5a3320', 0, 0, 32, 12);
  px(g, AMBER[4], 0, 0, 32, 1);
  px(g, AMBER[3], 0, 1, 32, 1);
  for (let x = -8; x < 40; x += 8) {
    for (let y = 0; y < 5; y++) {
      px(g, '#1c120c', x + y * 1 + 2, 2 + y, 4, 1);
      px(g, AMBER[2], x + y * 1 - 2, 2 + y, 4, 1);
    }
  }
  px(g, '#2c190f', 0, 7, 32, 3);
  for (let x = 3; x < 32; x += 8) {
    px(g, '#8a4f2c', x, 7, 2, 2);
    px(g, AMBER[4], x, 7, 1, 1);
  }
  px(g, '#1c120c', 0, 10, 32, 2);
  for (let x = 4; x < 32; x += 12) {
    px(g, AMBER[2], x, 11, 4, 1);
    px(g, AMBER[4], x + 1, 11, 2, 1);
  }
  return c;
}


/** 32x12 one-way platform made of storm cloud: pale slab with puffy underside and crackling edge. */
function cloudPass(top: string, mid: string, low: string, spark: string): HTMLCanvasElement {
  const [c, g] = canvas(32, 12);
  const rnd = mulberry32(17);
  px(g, mid, 0, 1, 32, 8);
  px(g, top, 0, 0, 32, 2);
  for (let x = 0; x < 32; x += 2) if (rnd() > 0.4) px(g, top, x, 0, 2, 1);
  px(g, low, 0, 6, 32, 3);
  for (let x = 0; x < 32; x += 4) {
    const r = 2 + Math.floor(rnd() * 3);
    px(g, mid, x, 9, 4, r);
    px(g, low, x, 9 + r - 1, 4, 1);
  }
  for (let x = 3; x < 32; x += 10) px(g, spark, x, 3 + (x % 3), 3, 1);
  return c;
}

/** 32x12 one-way wooden bridge plank: planks, rope rail and little hanging lanterns. */
function woodPass(): HTMLCanvasElement {
  const [c, g] = canvas(32, 12);
  px(g, '#8a5a2c', 0, 0, 32, 9);
  px(g, '#d49a58', 0, 0, 32, 1);
  px(g, '#b87a3c', 0, 1, 32, 2);
  for (let x = 0; x < 32; x += 8) {
    px(g, '#5a3a1c', x, 1, 1, 8);
    px(g, '#a06a34', x + 2, 4, 5, 1);
  }
  px(g, '#e8d6a8', 0, 0, 32, 1);
  px(g, '#3a2410', 0, 9, 32, 1);
  px(g, '#6a4220', 0, 10, 32, 2);
  for (let x = 4; x < 32; x += 16) {
    px(g, '#ffe27a', x, 10, 3, 2);
    px(g, '#fff6c0', x + 1, 10, 1, 1);
  }
  return c;
}

/** Floating-island underside: jagged rock, strata, hanging crystals. 640x200 px (= 320x100 world). */
function stageUnder(STONE: string[] = STONE_DEFAULT, crystals: string[][] = [CYAN_DEFAULT, ['#4a1a5a', '#8a2fa0', '#d65cf0', '#f5a6ff', '#ffe6ff']]): HTMLCanvasElement {
  const W = 640;
  const H = 200;
  const [c, g] = canvas(W, H);
  const rnd = mulberry32(5);
  // silhouette: top edge flat, bottom profile tapering to a keel
  const prof: number[] = [];
  for (let x = 0; x < W; x++) {
    const t = x / (W - 1);
    const taper = Math.pow(Math.abs(t - 0.5) * 2, 1.6); // 0 centre .. 1 edge
    const base = H * 0.88 * (1 - taper * 0.92);
    prof.push(base);
  }
  // add rocky noise (multi-octave, but staircase so it stays pixel-art)
  const n1 = makeNoise(3, 64);
  for (let x = 0; x < W; x++) prof[x] = Math.max(6, prof[x] + (n1(x / 9, 1) - 0.5) * 22 + (n1(x / 3, 7) - 0.5) * 8);
  for (let x = 0; x < W; x++) {
    const bottom = Math.round(prof[x]);
    for (let y = 0; y < bottom; y++) {
      const depth = y / Math.max(1, bottom);
      // strata bands + noise shading
      const band = Math.floor((y + n1(x / 24, y / 10) * 6) / 7) % 3;
      let shade = 3 - Math.floor(depth * 2.4) - (band === 1 ? 1 : 0);
      if (n1(x / 2.2, y / 2.2) > 0.78) shade += 1;
      px(g, STONE[Math.max(0, Math.min(5, shade))], x, y);
    }
    // lit rim on the lower edge
    px(g, STONE[1], x, bottom - 1);
    if (x > 0 && Math.abs(prof[x] - prof[x - 1]) > 1.5) px(g, STONE[5], x, bottom - 2);
  }
  // vertical cracks and moss-glow
  for (let i = 0; i < 26; i++) {
    let x = Math.floor(rnd() * W);
    let y = Math.floor(rnd() * H * 0.4);
    const len = 8 + Math.floor(rnd() * 26);
    for (let k = 0; k < len && y < prof[Math.min(W - 1, Math.max(0, x))] - 3; k++) {
      px(g, STONE[0], x, y);
      y++;
      if (rnd() > 0.6) x += rnd() > 0.5 ? 1 : -1;
    }
  }
  // hanging crystals
  for (let i = 0; i < 22; i++) {
    const x = 40 + Math.floor(rnd() * (W - 80));
    const y = Math.round(prof[x]) - 1;
    const h = 8 + Math.floor(rnd() * 16);
    const hue = rnd() > 0.5 ? crystals[0] : crystals[1];
    for (let k = 0; k < h; k++) {
      const w = Math.max(1, Math.round(3 * (1 - k / h)));
      px(g, hue[2], x - Math.floor(w / 2), y + k, w, 1);
      px(g, hue[1], x - Math.floor(w / 2), y + k, 1, 1);
      if (w > 1) px(g, hue[3], x + Math.floor(w / 2), y + k, 1, 1);
    }
    px(g, hue[4], x, y + h - 1);
  }
  // soft glow under the crystals: sparse dither dots
  return c;
}

// ---------------------------------------------------------------------------------------------
// Backgrounds
// ---------------------------------------------------------------------------------------------

/** Pixel-sphere planet with banding, lighting, a ring and a dither terminator. */
function planet(): HTMLCanvasElement {
  const S = 160;
  const [c, g] = canvas(S, S);
  const n = makeNoise(9, 32);
  const R = 52;
  const cx = S / 2;
  const cy = S / 2 + 6;
  const palette = ['#14102e', '#2a1b52', '#4a2a82', '#7a3fb0', '#b062d8', '#e69bf0'];
  const bayer = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  // back half of the ring
  const ring = (front: boolean): void => {
    for (let a = 0; a < Math.PI * 2; a += 0.004) {
      const isFront = Math.sin(a) > 0;
      if (isFront !== front) continue;
      for (let r = 70; r < 84; r += 1) {
        const x = Math.round(cx + Math.cos(a) * r);
        const y = Math.round(cy + Math.sin(a) * r * 0.22 - 8);
        const edge = r < 72 || r > 81;
        const tone = edge ? '#6a4a9a' : r > 76 ? '#9a78c8' : '#7b5aae';
        px(g, tone, x, y);
      }
    }
  };
  ring(false);
  const lx = -0.55;
  const ly = -0.5;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const dx = (x - cx) / R;
      const dy = (y - cy) / R;
      const d2 = dx * dx + dy * dy;
      if (d2 > 1) continue;
      const dz = Math.sqrt(1 - d2);
      let light = Math.max(0, dx * lx + dy * ly + dz * 0.7);
      // gas-giant bands warped by noise
      const band = Math.sin((dy * 9 + n(x / 14, y / 14) * 3.2) * 1.6) * 0.5 + 0.5;
      light = light * (0.7 + band * 0.45);
      const level = light * 5.2 + (bayer[(y & 3) * 4 + (x & 3)] / 16 - 0.5) * 0.9;
      px(g, palette[Math.max(0, Math.min(5, Math.floor(level)))], x, y);
    }
  }
  ring(true);
  return c;
}

/** Tileable nebula clouds, 4 quantised levels with dither, mostly transparent. */
function nebula(): HTMLCanvasElement {
  const W = 256;
  const H = 128;
  const [c, g] = canvas(W, H);
  const n1 = makeNoise(31, 8);
  const n2 = makeNoise(37, 16);
  const bayer = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  const cols = ['rgba(90,40,150,0.16)', 'rgba(130,50,170,0.22)', 'rgba(190,80,190,0.26)', 'rgba(255,150,210,0.30)'];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const v = n1((x / W) * 8, (y / H) * 8) * 0.65 + n2((x / W) * 16, (y / H) * 16) * 0.35;
      const lv = (v - 0.45) * 4.2 + (bayer[(y & 3) * 4 + (x & 3)] / 16 - 0.5) * 0.7;
      const i = Math.floor(lv);
      if (i >= 0) px(g, cols[Math.min(3, i)], x, y);
    }
  }
  return c;
}

/** Star tile: pin pixels, a few cross-flares, and coloured giants. */
function stars(seed: number, count: number, flares: number): HTMLCanvasElement {
  const [c, g] = canvas(128, 128);
  const rnd = mulberry32(seed);
  for (let i = 0; i < count; i++) {
    const b = rnd();
    px(g, b > 0.9 ? '#ffffff' : b > 0.6 ? '#cfc8ff' : b > 0.3 ? '#8f88d8' : '#5b55a0', Math.floor(rnd() * 128), Math.floor(rnd() * 128));
  }
  for (let i = 0; i < flares; i++) {
    const x = 3 + Math.floor(rnd() * 122);
    const y = 3 + Math.floor(rnd() * 122);
    const tint = rnd() > 0.5 ? '#ffe9a8' : '#a8e9ff';
    px(g, '#ffffff', x, y);
    px(g, tint, x - 1, y);
    px(g, tint, x + 1, y);
    px(g, tint, x, y - 1);
    px(g, tint, x, y + 1);
    px(g, 'rgba(255,255,255,0.35)', x - 2, y);
    px(g, 'rgba(255,255,255,0.35)', x + 2, y);
    px(g, 'rgba(255,255,255,0.35)', x, y - 2);
    px(g, 'rgba(255,255,255,0.35)', x, y + 2);
  }
  return c;
}

/**
 * Horizontally-tileable ruined skyline: towers with stepped crowns, spires, arches, broken walls,
 * floating chunks, lit windows and a faint rim light from the planet side.
 */
function ruins(seed: number, body: string, light: string, dark: string, windows: string[], windowChance: number, W = 512, H = 192): HTMLCanvasElement {
  const [c, g] = canvas(W, H);
  const rnd = mulberry32(seed);
  const fill = (x: number, y: number, w: number, h: number, col = body): void => {
    px(g, col, x, y, w, h);
    px(g, light, x + w - 1, y, 1, h); // rim light on the right edge
    px(g, dark, x, y, 1, h);
  };
  let x = 0;
  while (x < W) {
    const w = 18 + Math.floor(rnd() * 34);
    const h = 30 + Math.floor(rnd() * 100);
    const top = H - h;
    const kind = rnd();
    if (x + w > W) break;
    fill(x, top, w, h);
    // stepped crown
    if (kind < 0.35) {
      fill(x + 3, top - 8, w - 6, 8);
      fill(x + 7, top - 14, Math.max(4, w - 14), 6);
    } else if (kind < 0.6) {
      // spire
      const sw = Math.max(6, w - 10);
      for (let k = 0; k < 26; k++) {
        const ww = Math.max(1, Math.round(sw * (1 - k / 26)));
        px(g, body, x + Math.floor((w - ww) / 2), top - k, ww, 1);
        px(g, light, x + Math.floor((w + ww) / 2) - 1, top - k, 1, 1);
      }
    } else if (kind < 0.8) {
      // crenellations
      for (let k = 0; k < w; k += 6) fill(x + k, top - 5, 4, 5);
    }
    // broken top: bite a notch
    if (rnd() > 0.55) {
      const nx = x + 2 + Math.floor(rnd() * (w - 10));
      g.clearRect(nx, top - 16, 5 + Math.floor(rnd() * 5), 22);
    }
    // arch cut-out at the base
    if (h > 60 && rnd() > 0.5) {
      const aw = 8 + Math.floor(rnd() * 6);
      const ax = x + Math.floor((w - aw) / 2);
      g.clearRect(ax, H - 22, aw, 22);
      for (let k = 0; k < aw / 2; k++) g.clearRect(ax + k, H - 26 + Math.floor(k * 0.6), aw - k * 2, 3);
    }
    // windows
    for (let wy = top + 8; wy < H - 10; wy += 9) {
      for (let wx = x + 4; wx < x + w - 5; wx += 7) {
        if (rnd() < windowChance) {
          const col = windows[Math.floor(rnd() * windows.length)];
          px(g, col, wx, wy, 2, 3);
          px(g, 'rgba(255,255,255,0.55)', wx, wy, 1, 1);
        } else if (rnd() > 0.6) {
          px(g, dark, wx, wy, 2, 3);
        }
      }
    }
    x += w + 2 + Math.floor(rnd() * 6);
  }
  // floating chunks above the skyline
  for (let i = 0; i < 9; i++) {
    const fx = Math.floor(rnd() * (W - 20));
    const fy = 6 + Math.floor(rnd() * 50);
    const fw = 8 + Math.floor(rnd() * 12);
    for (let k = 0; k < 5; k++) {
      const ww = Math.max(2, fw - k * 3);
      px(g, body, fx + Math.floor((fw - ww) / 2), fy + k, ww, 1);
      px(g, light, fx + Math.floor((fw + ww) / 2) - 1, fy + k, 1, 1);
    }
    px(g, windows[0], fx + Math.floor(fw / 2), fy - 1, 1, 1);
  }
  return c;
}


/**
 * Horizontally-tileable industrial skyline for the reactor: hyperbolic cooling towers, banded smokestacks, pipe bridges,
 * gantries, and glowing vents. `glow` is the molten light colour.
 */
/** Where the far refinery skyline's cooling towers (steam) and smokestacks (smoke) vent, in its art pixels; filled when it is drawn. */
export const INDUSTRY_VENTS: { x: number; y: number; w: number; steam: boolean }[] = [];

function industry(seed: number, body: string, light: string, dark: string, glow: string, W = 512, H = 192, vents?: typeof INDUSTRY_VENTS): HTMLCanvasElement {
  const [c, g] = canvas(W, H);
  const rnd = mulberry32(seed);
  const spans: [number, number, number][] = [];
  let x = 4;
  while (x < W - 40) {
    const kind = rnd();
    if (kind < 0.4) {
      // cooling tower: waisted silhouette
      const bw = 46 + Math.floor(rnd() * 22);
      const h = 70 + Math.floor(rnd() * 60);
      if (x + bw > W) break;
      for (let k = 0; k < h; k++) {
        const t = k / h;
        const waist = 0.72 + 0.28 * Math.pow(Math.abs(t - 0.62) * 2.2, 2);
        const ww = Math.round(bw * Math.min(1, waist));
        const xx = x + Math.floor((bw - ww) / 2);
        px(g, body, xx, H - h + k, ww, 1);
        px(g, light, xx + ww - 2, H - h + k, 2, 1);
        px(g, dark, xx, H - h + k, 2, 1);
        if (k % 14 === 7) px(g, dark, xx, H - h + k, ww, 1);
      }
      // steam crown + glowing rim
      px(g, glow, x + Math.floor(bw * 0.2), H - h, Math.floor(bw * 0.6), 2);
      spans.push([x + bw / 2, H - h + 10, bw]);
      vents?.push({ x: x + bw / 2, y: H - h, w: bw * 0.6, steam: true });
      x += bw + 8 + Math.floor(rnd() * 10);
    } else if (kind < 0.75) {
      // smokestack with warning bands
      const sw = 12 + Math.floor(rnd() * 8);
      const h = 90 + Math.floor(rnd() * 80);
      px(g, body, x, H - h, sw, h);
      px(g, light, x + sw - 2, H - h, 2, h);
      px(g, dark, x, H - h, 2, h);
      for (let k = 0; k < 4; k++) px(g, k % 2 ? dark : glow, x, H - h + 4 + k * 5, sw, 3);
      px(g, body, x - 2, H - h - 3, sw + 4, 4);
      px(g, glow, x - 2, H - h - 4, sw + 4, 1);
      spans.push([x + sw / 2, H - h + 30, sw]);
      vents?.push({ x: x + sw / 2, y: H - h - 4, w: sw, steam: false });
      x += sw + 10 + Math.floor(rnd() * 14);
    } else {
      // blocky reactor hall with vent slits
      const bw = 40 + Math.floor(rnd() * 40);
      const h = 36 + Math.floor(rnd() * 34);
      if (x + bw > W) break;
      px(g, body, x, H - h, bw, h);
      px(g, light, x + bw - 2, H - h, 2, h);
      px(g, dark, x, H - h, 2, h);
      px(g, dark, x, H - h, bw, 3);
      for (let vx = x + 6; vx < x + bw - 8; vx += 9) {
        px(g, glow, vx, H - h + 10, 4, 2);
        px(g, 'rgba(255,255,255,0.5)', vx, H - h + 10, 1, 1);
        if (rnd() > 0.4) px(g, glow, vx, H - h + 18, 4, 2);
      }
      spans.push([x + bw / 2, H - h, bw]);
      x += bw + 6 + Math.floor(rnd() * 10);
    }
  }
  // pipe bridges between neighbours
  for (let i = 0; i + 1 < spans.length; i++) {
    const [ax, ay] = spans[i];
    const [bx, by] = spans[i + 1];
    if (bx - ax > 120) continue;
    const y0 = Math.max(ay, by) + 6;
    px(g, dark, ax, y0, bx - ax, 3);
    px(g, light, ax, y0, bx - ax, 1);
    for (let k = ax + 6; k < bx; k += 14) px(g, body, k, y0 - 2, 2, 7);
  }
  return c;
}

/** Sleek arena pylons for the training void: slim spires, glowing caps, floating rings and a gate arch. */
function pylons(seed: number, body: string, light: string, dark: string, glow: string, W = 512, H = 192): HTMLCanvasElement {
  const [c, g] = canvas(W, H);
  const rnd = mulberry32(seed);
  let x = 6;
  while (x < W - 30) {
    const sw = 6 + Math.floor(rnd() * 8);
    const h = 40 + Math.floor(rnd() * 120);
    for (let k = 0; k < h; k++) {
      const ww = Math.max(2, Math.round(sw * (0.55 + 0.45 * (k / h))));
      const xx = x + Math.floor((sw - ww) / 2);
      px(g, body, xx, H - h + k, ww, 1);
      px(g, light, xx + ww - 1, H - h + k, 1, 1);
      px(g, dark, xx, H - h + k, 1, 1);
    }
    px(g, glow, x + Math.floor(sw / 2) - 1, H - h - 3, 3, 3);
    px(g, 'rgba(255,255,255,0.8)', x + Math.floor(sw / 2), H - h - 3, 1, 1);
    // light slits
    for (let k = H - h + 10; k < H - 8; k += 12) px(g, glow, x + Math.floor(sw / 2) - 1, k, 2, 1);
    if (rnd() > 0.55) {
      // floating ring
      const rr = 9 + Math.floor(rnd() * 8);
      const cy = H - h - 14 - Math.floor(rnd() * 10);
      for (let a = 0; a < Math.PI * 2; a += 0.05) {
        px(g, rnd() > 0.85 ? glow : light, x + sw / 2 + Math.cos(a) * rr, cy + Math.sin(a) * rr * 0.35);
      }
    }
    // low connecting arch
    if (rnd() > 0.6 && x + sw + 50 < W) {
      const aw = 40 + Math.floor(rnd() * 30);
      for (let k = 0; k < aw; k++) {
        const t = k / aw;
        const ay = H - h * 0.5 - Math.sin(t * Math.PI) * 14;
        px(g, dark, x + sw + k, ay, 1, 2);
        px(g, light, x + sw + k, ay, 1, 1);
      }
    }
    x += sw + 14 + Math.floor(rnd() * 34);
  }
  return c;
}

/** Soft drifting cloud strip (tileable), dithered, mostly transparent. */
function cloudStrip(): HTMLCanvasElement {
  const W = 256;
  const H = 64;
  const [c, g] = canvas(W, H);
  const n1 = makeNoise(71, 8);
  const n2 = makeNoise(73, 16);
  const bayer = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  const cols = ['rgba(150,110,210,0.14)', 'rgba(190,140,230,0.22)', 'rgba(240,190,240,0.30)'];
  for (let y = 0; y < H; y++) {
    const band = Math.exp(-Math.pow((y - H * 0.55) / (H * 0.28), 2));
    for (let x = 0; x < W; x++) {
      const v = (n1((x / W) * 8, (y / H) * 3) * 0.6 + n2((x / W) * 16, (y / H) * 6) * 0.4) * band;
      const lv = (v - 0.3) * 5 + (bayer[(y & 3) * 4 + (x & 3)] / 16 - 0.5) * 0.8;
      const i = Math.floor(lv);
      if (i >= 0) px(g, cols[Math.min(2, i)], x, y);
    }
  }
  return c;
}


/** Draw `fn` at x, x - W and x + W so shapes crossing the tile edge wrap around (horizontally tileable art). */
function wrapX(W: number, x: number, fn: (x: number) => void): void {
  fn(x);
  if (x < W * 0.25) fn(x + W);
  if (x > W * 0.75) fn(x - W);
}

/** Jagged rock spires with glowing ruins, for the thunderstorm: tileable. */
function spires(seed: number, body: string, light: string, dark: string, glow: string, W = 512, H = 192): HTMLCanvasElement {
  const [c, g] = canvas(W, H);
  const rnd = mulberry32(seed);
  let x = 0;
  while (x < W - 14) {
    const w = 16 + Math.floor(rnd() * 22);
    const h = 60 + Math.floor(rnd() * 120);
    const lean = Math.floor((rnd() - 0.5) * 8);
    const cx = x;
    wrapX(W, cx, (bx) => {
      for (let k = 0; k < h; k++) {
        const t = k / h;
        const ww = Math.max(3, Math.round(w * (0.45 + 0.55 * t) + (k % 7 === 0 ? 2 : 0)));
        const off = Math.round(lean * (1 - t)) + (k % 11 === 0 ? 1 : 0);
        const xx = bx + Math.floor((w - ww) / 2) + off;
        px(g, body, xx, H - h + k, ww, 1);
        px(g, light, xx + ww - 2, H - h + k, 2, 1);
        px(g, dark, xx, H - h + k, 2, 1);
        if (k % 17 === 9) px(g, dark, xx, H - h + k, ww, 1); // strata
      }
      // ruin: a small tower on the tip with a lit window
      if (rnd() > 0.35) {
        const tx = bx + Math.floor(w / 2) - 3 + lean;
        px(g, dark, tx, H - h - 12, 7, 12);
        px(g, light, tx + 5, H - h - 12, 2, 12);
        px(g, glow, tx + 2, H - h - 8, 2, 3);
        px(g, dark, tx - 1, H - h - 14, 9, 3);
      }
      // glowing crack
      if (rnd() > 0.5) for (let k = 0; k < 16; k++) px(g, glow, bx + Math.floor(w / 2) + Math.round(Math.sin(k) * 2), H - h + 20 + k * 2, 1, 1);
    });
    x += w + 6 + Math.floor(rnd() * 22);
  }
  return c;
}

/** Floating islands with grass, trees, tiny towers, stalactite undersides and waterfalls; tileable, sky above. */
function islands(seed: number, rock: string, rockL: string, rockD: string, grass: string, grassL: string, water: string, W = 512, H = 192): HTMLCanvasElement {
  const [c, g] = canvas(W, H);
  const rnd = mulberry32(seed);
  const count = 4;
  for (let n = 0; n < count; n++) {
    // one big island per tile, the rest small and scattered at different heights so the strip doesn't read as a row
    const big = n === Math.floor(seed % count);
    const w = big ? 96 + Math.floor(rnd() * 30) : 26 + Math.floor(rnd() * 46);
    const topY = big ? 54 + Math.floor(rnd() * 26) : 22 + Math.floor(rnd() * 110);
    const cx = Math.floor(((n + 0.3 + rnd() * 0.4) / count) * W);
    wrapX(W, cx, (bx) => {
      const left = bx - Math.floor(w / 2);
      // grass top
      for (let k = 0; k < 8; k++) {
        const ww = w - Math.abs(Math.round(Math.sin(k * 0.9) * 2));
        px(g, k < 2 ? grassL : grass, left + Math.floor((w - ww) / 2), topY + k, ww, 1);
      }
      // rock underside tapering to a point
      const depth = Math.round(w * (0.45 + rnd() * 0.3)) + 8;
      for (let k = 0; k < depth; k++) {
        const t = k / depth;
        const ww = Math.max(2, Math.round(w * (1 - Math.pow(t, 0.8))) - ((k * 7 + n) % 5 === 0 ? 2 : 0));
        const xx = left + Math.floor((w - ww) / 2);
        px(g, rock, xx, topY + 8 + k, ww, 1);
        px(g, rockL, xx + ww - 2, topY + 8 + k, 2, 1);
        px(g, rockD, xx, topY + 8 + k, 2, 1);
      }
      // trees
      for (let t = 0; t < 3 + Math.floor(rnd() * 3); t++) {
        const tx = left + 6 + Math.floor(rnd() * (w - 12));
        const th = 6 + Math.floor(rnd() * 8);
        px(g, rockD, tx, topY - th + 2, 1, th);
        for (let k = 0; k < 6; k++) px(g, k < 2 ? grassL : grass, tx - 3 + Math.floor(k / 3), topY - th - 2 + k, 7 - Math.floor(k / 3) * 2, 1);
      }
      // little tower / ruin
      if (rnd() > 0.4) {
        const tx = left + Math.floor(w * 0.35);
        px(g, rockL, tx, topY - 16, 8, 16);
        px(g, rockD, tx, topY - 16, 2, 16);
        px(g, rock, tx - 2, topY - 19, 12, 4);
        px(g, '#ffe9a8', tx + 3, topY - 10, 2, 3);
      }
      // waterfall off the lip
      if (rnd() > 0.5) {
        const wx = left + w - 5;
        for (let k = 0; k < 70; k++) {
          const a = 1 - k / 70;
          px(g, `rgba(${water},${0.35 + 0.5 * a})`, wx + (k % 9 === 0 ? 1 : 0), topY + 6 + k, 2, 1);
        }
      }
    });
  }
  return c;
}

/** Misty jungle mountains with stepped ziggurats and a glowing shrine fire on top; tileable. */
function ziggurats(seed: number, body: string, light: string, dark: string, glow: string, W = 512, H = 192): HTMLCanvasElement {
  const [c, g] = canvas(W, H);
  const rnd = mulberry32(seed);
  const n1 = makeNoise(seed, 64);
  // rolling hills
  for (let x = 0; x < W; x++) {
    const top = Math.round(H * 0.55 + (n1(x / 40, 0) - 0.5) * 50 + (n1(x / 13, 3) - 0.5) * 12);
    px(g, body, x, top, 1, H - top);
    px(g, light, x, top, 1, 1);
  }
  // stepped pyramids
  for (let i = 0; i < 3; i++) {
    const cx = Math.floor(((i + 0.2 + rnd() * 0.6) / 3) * W);
    const tiers = 4 + Math.floor(rnd() * 3);
    const baseW = 60 + Math.floor(rnd() * 40);
    const baseY = Math.floor(H * 0.62 + rnd() * 10);
    wrapX(W, cx, (bx) => {
      for (let t = 0; t < tiers; t++) {
        const tw = Math.round(baseW * (1 - t / (tiers + 0.6)));
        const ty = baseY - (t + 1) * 9;
        px(g, body, bx - Math.floor(tw / 2), ty, tw, 9);
        px(g, light, bx - Math.floor(tw / 2), ty, tw, 1);
        px(g, dark, bx + Math.floor(tw / 2) - 3, ty, 3, 9);
      }
      // central stair and shrine with its fire
      const topY = baseY - tiers * 9;
      px(g, dark, bx - 3, topY, 6, tiers * 9);
      for (let k = 0; k < tiers * 9; k += 2) px(g, light, bx - 3, topY + k, 6, 1);
      px(g, dark, bx - 6, topY - 10, 12, 10);
      px(g, glow, bx - 2, topY - 7, 4, 5);
      px(g, '#fff4c0', bx - 1, topY - 6, 2, 2);
    });
  }
  return c;
}

/** Jungle canopy: dense round crowns on tall trunks, hanging vines; tileable, the lower half solid foliage. */
function canopy(seed: number, leaf: string, leafL: string, leafD: string, trunk: string, W = 512, H = 192): HTMLCanvasElement {
  const [c, g] = canvas(W, H);
  const rnd = mulberry32(seed);
  const bayer = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  px(g, leafD, 0, H - 50, W, 50);
  for (let i = 0; i < 14; i++) {
    const tx = Math.floor(rnd() * W);
    const th = 60 + Math.floor(rnd() * 70);
    wrapX(W, tx, (bx) => px(g, trunk, bx, H - th, 4, th));
  }
  for (let i = 0; i < 34; i++) {
    const r = 14 + Math.floor(rnd() * 18);
    const cx = Math.floor(rnd() * W);
    const cy = H - 50 - Math.floor(rnd() * 90);
    wrapX(W, cx, (bx) => {
      for (let y = -r; y <= r; y++) {
        for (let x = -r; x <= r; x++) {
          const d = Math.hypot(x, y * 1.1);
          if (d > r) continue;
          const lit = (-x * 0.4 - y * 0.9) / r;
          const v = lit + (bayer[(((cy + y) & 3) * 4 + ((bx + x) & 3))] / 16 - 0.5) * 0.6;
          px(g, v > 0.5 ? leafL : v > -0.2 ? leaf : leafD, bx + x, cy + y);
        }
      }
      // vines hanging from the crown
      for (let v = 0; v < 2; v++) {
        const vx = bx - r + Math.floor(rnd() * r * 2);
        const len = 10 + Math.floor(rnd() * 30);
        for (let k = 0; k < len; k++) px(g, leaf, vx + (k % 6 < 3 ? 0 : 1), cy + r - 4 + k, 1, 1);
      }
    });
  }
  return c;
}

/** Puffy cloud tops (tileable): dithered-shaded round puffs with a light top-left rim, solid underneath. */
function cloudBank(seed: number, base: string, light: string, shade: string, W = 512, H = 128): HTMLCanvasElement {
  const [c, g] = canvas(W, H);
  const rnd = mulberry32(seed);
  const bayer = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  // solid body in the lower part
  px(g, shade, 0, H - 40, W, 40);
  const puffs = 26;
  for (let i = 0; i < puffs; i++) {
    const r = 12 + Math.floor(rnd() * 20);
    const cx = Math.floor(rnd() * W);
    const cy = H - 42 - Math.floor(rnd() * 34);
    wrapX(W, cx, (bx) => {
      for (let y = -r; y <= r; y++) {
        for (let x = -r; x <= r; x++) {
          const d = Math.hypot(x, y * 1.15);
          if (d > r) continue;
          const lit = (-x * 0.5 - y * 0.8) / r; // light from the upper-left
          const v = lit + (bayer[(((cy + y) & 3) * 4 + ((bx + x) & 3))] / 16 - 0.5) * 0.5;
          px(g, v > 0.45 ? light : v > -0.1 ? base : shade, bx + x, cy + y);
        }
      }
    });
  }
  return c;
}

/** Snow-capped mountain peaks: jagged ridgelines, sunlit and shaded faces, snow down the upper slopes; tileable. */
function peaks(seed: number, rock: string, rockL: string, rockD: string, snow: string, snowS: string, W = 512, H = 192): HTMLCanvasElement {
  const [c, g] = canvas(W, H);
  const rnd = mulberry32(seed);
  const n1 = makeNoise(seed, 64);
  // a range, not a row: two or three big massifs and some foothills, summed into one jagged ridgeline per layer
  const ridge = (count: number, minH: number, maxH: number, rough: number, salt: number): number[] => {
    const ms = Array.from({ length: count }, (_, i) => ({ cx: ((i + 0.15 + rnd() * 0.7) / count) * W, h: minH + rnd() * (maxH - minH), half: 70 + rnd() * 90, skew: (rnd() - 0.5) * 0.6 }));
    const out: number[] = [];
    for (let x = 0; x < W; x++) {
      let top = 0;
      for (const m of ms) {
        let dx = x - m.cx;
        if (dx > W / 2) dx -= W;
        if (dx < -W / 2) dx += W; // tileable
        const t = Math.abs(dx) / (m.half * (dx < 0 ? 1 + m.skew : 1 - m.skew));
        if (t < 1) top = Math.max(top, m.h * Math.pow(1 - t, 1.15));
      }
      // jagged crests: a few octaves of periodic noise (period 64 * 8 = 512 = W, so it still tiles)
      top += (n1(x / 8, salt) - 0.5) * rough + (n1(x / 2, salt + 5) - 0.5) * rough * 0.35;
      out.push(Math.round(top));
    }
    return out;
  };
  const draw = (hs: number[], back: boolean): void => {
    for (let x = 0; x < W; x++) {
      const top = H - hs[x];
      const slope = hs[(x + 1) % W] - hs[(x + W - 1) % W]; // > 0: the face rises to the right, so it faces the light (left)
      for (let y = Math.max(0, top); y < H; y++) {
        const depth = y - top;
        const lit = slope > 0;
        let col = back ? snowS : lit ? rockL : rock;
        if (!back && !lit && slope < -3 && (x + y) % 3 === 0) col = rockD; // steep shadowed faces get hatching
        // snow down to a ragged line, deeper in the gullies
        const snowDepth = hs[x] * 0.42 + (n1(x / 3, 11) - 0.5) * 22;
        if (depth < snowDepth && hs[x] > 50) col = back ? snow : lit ? snow : snowS;
        px(g, col, x, y);
      }
    }
  };
  draw(ridge(3, 80, 120, 14, 2), true); // a pale distant range behind
  draw(ridge(3, 110, 178, 22, 7).map((h, x) => Math.max(h, 30 + Math.round(Math.sin((x / W) * Math.PI * 6) * 8))), false);
  return c;
}

/** Shrine woods: snow-laden pines, a red torii gate, a little pagoda with lit windows and stone lanterns; tileable. */
function shrineWoods(seed: number, pine: string, pineL: string, pineD: string, snow: string, lacquer: string, lacquerD: string, glow: string, W = 512, H = 192): HTMLCanvasElement {
  const [c, g] = canvas(W, H);
  const rnd = mulberry32(seed);
  // ground bank
  for (let x = 0; x < W; x++) {
    const top = H - 20 - Math.round(Math.sin(x * 0.03) * 4 + Math.sin(x * 0.11) * 2);
    px(g, snow, x, top, 1, H - top);
    px(g, '#c8d8ec', x, top + 3, 1, 2);
  }
  // pines
  for (let i = 0; i < 26; i++) {
    const cx = Math.floor(rnd() * W);
    const hgt = 40 + Math.floor(rnd() * 70);
    const base = H - 18;
    wrapX(W, cx, (bx) => {
      px(g, pineD, bx - 1, base - 8, 3, 10);
      for (let k = 0; k < hgt; k++) {
        const y = base - 6 - k;
        const tier = (k % 14) / 14;
        const ww = Math.max(1, Math.round((1 - k / hgt) * (hgt * 0.32) * (0.55 + 0.45 * (1 - tier))));
        px(g, pine, bx - ww, y, ww * 2 + 1, 1);
        px(g, pineL, bx - ww, y, Math.max(1, Math.round(ww * 0.6)), 1);
        if (tier < 0.12) px(g, snow, bx - ww, y, ww * 2 + 1, 1); // snow on each tier
      }
    });
  }
  // a torii gate
  {
    const gx = Math.floor(W * 0.3);
    const top = H - 92;
    px(g, lacquerD, gx, top + 8, 5, 74);
    px(g, lacquerD, gx + 44, top + 8, 5, 74);
    px(g, lacquer, gx - 8, top, 66, 6);
    px(g, snow, gx - 8, top - 2, 66, 2);
    px(g, lacquer, gx - 2, top + 14, 54, 4);
    px(g, lacquerD, gx + 22, top + 6, 5, 8);
  }
  // a small pagoda
  {
    const px0 = Math.floor(W * 0.72);
    let y = H - 20;
    for (let tier = 0; tier < 3; tier++) {
      const w = 40 - tier * 9;
      const h = 18 - tier * 2;
      px(g, pineD, px0 - w / 2 + 4, y - h, w - 8, h);
      for (let k = 0; k < 3; k++) px(g, glow, px0 - w / 2 + 8 + k * ((w - 18) / 2), y - h + 5, 2, 4);
      // curved roof with snow
      for (let k = 0; k < 7; k++) px(g, lacquerD, px0 - w / 2 - 6 + k, y - h - 2 - Math.round(k * 0.4), w + 12 - k * 2, 1);
      px(g, snow, px0 - w / 2 - 6, y - h - 3, w + 12, 1);
      y -= h + 6;
    }
    px(g, lacquerD, px0 - 1, y - 12, 2, 12); // finial
  }
  // stone lanterns with a warm glow
  for (const lx of [Math.floor(W * 0.12), Math.floor(W * 0.55), Math.floor(W * 0.9)]) {
    px(g, '#5a6070', lx, H - 34, 4, 16);
    px(g, '#7a8090', lx - 3, H - 40, 10, 6);
    px(g, glow, lx + 1, H - 38, 2, 2);
    px(g, snow, lx - 3, H - 42, 10, 2);
  }
  return c;
}

/**
 * Towering sunset thunderheads: billowing cloud columns lit from the upper right (where the sun sits), purple in their own
 * shadow, with a rose rim where the light grazes them; tileable.
 */
function thunderheads(seed: number, shadow: string, mid: string, lit: string, rim: string, W = 512, H = 192): HTMLCanvasElement {
  const [c, g] = canvas(W, H);
  const rnd = mulberry32(seed);
  const blobs: { x: number; y: number; r: number }[] = [];
  const towers = 3;
  for (let t = 0; t < towers; t++) {
    // a cumulus dome: blobs scattered inside a half-ellipse, bigger at the base, crowned by smaller billows
    const cx = ((t + 0.25 + rnd() * 0.5) / towers) * W;
    const hw = 70 + rnd() * 50;
    const h = 80 + rnd() * 90;
    for (let k = 0; k < 34; k++) {
      const a = rnd() * Math.PI;
      const rr = Math.sqrt(rnd());
      const x = cx + Math.cos(a) * hw * rr;
      const y = H - Math.sin(a) * h * rr;
      const f = (H - y) / h; // 0 base .. 1 crown
      blobs.push({ x, y, r: (30 - f * 16) * (0.8 + rnd() * 0.4) });
    }
  }
  const ramp = [shadow, mid, lit, rim].map((h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]);
  // a metaball density field, so neighbouring billows merge into one soft surface instead of a pile of balls
  const D = new Float32Array(W * H);
  for (const b of blobs) {
    const r2 = b.r * b.r;
    const y0 = Math.max(0, Math.floor(b.y - b.r * 2));
    const y1 = Math.min(H - 1, Math.ceil(b.y + b.r * 2));
    for (let y = y0; y <= y1; y++) {
      for (let dx = -Math.ceil(b.r * 2); dx <= Math.ceil(b.r * 2); dx++) {
        const x = (((Math.round(b.x) + dx) % W) + W) % W; // wrap so the strip tiles
        const dy = y - b.y;
        D[y * W + x] += Math.exp(-(dx * dx + dy * dy) / r2);
      }
    }
  }
  const at = (x: number, y: number): number => D[Math.min(H - 1, Math.max(0, y)) * W + ((x + W) % W)];
  const img = g.createImageData(W, H);
  const T = 0.55;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const d = at(x, y);
      if (d < T) continue;
      // surface normal from the field's gradient (pointing out of the cloud); light from the upper right
      const gx = at(x - 2, y) - at(x + 2, y);
      const gy = at(x, y - 2) - at(x, y + 2);
      const len = Math.hypot(gx, gy) + 1e-6;
      const facing = (gx / len) * 0.6 + (gy / len) * -0.8;
      const edge = Math.min(1, (d - T) / 0.5); // 0 at the silhouette .. 1 deep inside
      const shade = facing * (1 - edge * 0.6) + (y < H * 0.5 ? 0.15 : -0.1);
      let k = shade > 0.45 ? 2 : shade > -0.15 ? 1 : 0;
      if (edge < 0.18 && facing > 0.3) k = 3; // a bright rim where the sun grazes the edge
      if ((x * 7 + y * 3) % 17 === 0 && k < 2) k++; // a sparse dither between bands
      const col = ramp[k];
      const o = (y * W + x) * 4;
      img.data[o] = col[0];
      img.data[o + 1] = col[1];
      img.data[o + 2] = col[2];
      img.data[o + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return c;
}

/** Where the lighthouse lamp sits in the `bg-cove-far` texture (art px), so the backdrop can sweep its beam from it. */
export const COVE_LAMP = { x: 372, y: 192 - 112 - 31 };

/** Sea stacks rising from a moonlit sea: flat grassy tops, strata, an arch, surf at their feet and a lighthouse; tileable. */
function seaStacks(seed: number, body: string, light: string, dark: string, grass: string, sea: string, foam: string, W = 512, H = 192): HTMLCanvasElement {
  const [c, g] = canvas(W, H);
  const rnd = mulberry32(seed);
  const stack = (cx: number, w: number, h: number, lean: number): void => {
    wrapX(W, cx, (bx) => {
      for (let k = 0; k < h; k++) {
        const t = k / h; // 0 top .. 1 waterline
        const ww = Math.max(4, Math.round(w * (0.82 + 0.18 * t) + ((k * 5) % 9 === 0 ? 1 : 0) - (k > h - 10 ? (k - h + 10) * 0.4 : 0)));
        const xx = bx - Math.floor(ww / 2) + Math.round(lean * (1 - t));
        px(g, body, xx, H - h + k, ww, 1);
        px(g, light, xx, H - h + k, 2, 1);
        px(g, dark, xx + ww - 3, H - h + k, 3, 1);
        if (k % 13 === 6) px(g, dark, xx + 2, H - h + k, ww - 4, 1); // strata
      }
      const tx = bx - Math.floor(w * 0.41) + lean;
      px(g, grass, tx, H - h - 2, Math.round(w * 0.82), 3);
      for (let i = 0; i < w * 0.8; i += 3) px(g, grass, tx + i, H - h - 3 - ((i * 7) % 3), 1, 2);
      // surf around the base
      for (let i = -3; i < w + 6; i += 2) px(g, foam, bx - Math.floor(w / 2) - 3 + i, H - 4 - ((i * 3) % 5 === 0 ? 1 : 0), 2, 1);
    });
  };
  // the sea band and a few long swells catching moonlight
  px(g, sea, 0, H - 6, W, 6);
  for (let i = 0; i < 40; i++) px(g, foam, Math.floor(rnd() * W), H - 5 + Math.floor(rnd() * 5), 3 + Math.floor(rnd() * 8), 1);
  // the arch: two legs joined by a bridge with the sky through it
  const ax = 90;
  stack(ax - 22, 22, 96, 2);
  stack(ax + 22, 24, 88, -2);
  stack(ax + 560 + 30, 18, 66, 1); // a smaller second arch far down the coast
  stack(ax + 560 + 62, 20, 60, -1);
  px(g, body, ax + 560 + 26, H - 72, 42, 12);
  px(g, light, ax + 560 + 26, H - 72, 42, 1);
  px(g, grass, ax + 560 + 26, H - 74, 42, 2);
  px(g, body, ax - 30, H - 100, 62, 18);
  px(g, light, ax - 30, H - 100, 62, 2);
  px(g, dark, ax - 30, H - 84, 62, 2);
  px(g, grass, ax - 30, H - 102, 62, 2);
  // free-standing stacks
  for (const [cx, w, h] of [[200, 30, 70], [262, 16, 48], [452, 26, 84], [500, 14, 40], [610, 22, 58], [792, 18, 50], [884, 28, 74], [962, 16, 42]] as const) stack(cx + Math.floor(rnd() * 6), w, h, Math.floor((rnd() - 0.5) * 6));
  // the lighthouse stack and tower: red and white bands, a lamp room, a gallery rail
  const lx = COVE_LAMP.x;
  stack(lx, 34, 112, 0);
  const top = H - 112 - 2;
  for (let k = 0; k < 26; k++) {
    const ww = 10 - Math.floor(k / 9);
    const band = Math.floor(k / 5) % 2 === 0;
    px(g, band ? '#d8d4cc' : '#a03030', lx - Math.floor(ww / 2), top - k, ww, 1);
    px(g, band ? '#8a8680' : '#5a1a1a', lx + Math.ceil(ww / 2) - 2, top - k, 2, 1);
  }
  px(g, '#2a2a2a', lx - 6, top - 27, 12, 2); // gallery
  px(g, '#2a2a2a', lx - 4, top - 33, 8, 1);
  px(g, '#fff4c0', lx - 3, top - 32, 6, 5); // lamp room
  px(g, '#ffffff', lx - 1, top - 31, 2, 3);
  px(g, '#3a1a1a', lx - 4, top - 36, 8, 3); // roof
  px(g, '#3a1a1a', lx - 1, top - 38, 2, 2);
  // a lit cottage window at the tower foot
  px(g, dark, lx + 7, top - 6, 9, 6);
  px(g, '#ffd870', lx + 10, top - 4, 2, 2);
  return c;
}

/** Wrecked ships run aground in the shallows: tilted hulls, broken masts with torn sails, rocks and surf; tileable. */
function wrecks(seed: number, hull: string, hullL: string, hullD: string, sail: string, sea: string, foam: string, glow: string, W = 512, H = 192): HTMLCanvasElement {
  const [c, g] = canvas(W, H);
  const rnd = mulberry32(seed);
  const ships = [[70, 120, 0.22], [300, 150, -0.16], [440, 90, 0.3]] as const;
  for (const [cx, len, tilt] of ships) {
    wrapX(W, cx, (bx) => {
      const deckY = H - 36 - Math.floor(rnd() * 10);
      const depth = Math.round(len * 0.24);
      // hull: a bow-to-stern curve, sunk at one end
      for (let i = 0; i < len; i++) {
        const u = i / (len - 1);
        const x = bx - Math.floor(len / 2) + i;
        const sink = Math.round((u - 0.5) * len * tilt);
        const keel = Math.round(depth * Math.sin(Math.min(1, u * 1.15) * Math.PI) ** 0.6);
        const y0 = deckY + sink - (u < 0.12 ? Math.round((0.12 - u) * 50) : 0); // bow rises
        for (let k = 0; k < keel; k++) px(g, k === 0 ? hullL : k % 6 === 0 ? hullD : hull, x, y0 + k, 1, 1);
        if (i % 11 === 0 && keel > 6) px(g, hullD, x, y0 + 2, 1, keel - 2); // ribs showing through
        if (i % 19 === 7 && keel > 10) px(g, glow, x, y0 + 4, 2, 2); // porthole still lit by sea-glow
      }
      // a ragged breach in the hull
      const hx = bx - Math.floor(len * 0.1);
      for (let k = 0; k < 10; k++) px(g, hullD, hx - 6 + Math.round(Math.sin(k) * 2), deckY + 4 + k, 10 - Math.abs(k - 5), 1);
      // masts: one standing, one snapped, yardarms and torn sails
      for (let m = 0; m < 2; m++) {
        const mx = bx - Math.floor(len * 0.2) + m * Math.floor(len * 0.42);
        const mh = m === 0 ? 70 + Math.floor(rnd() * 30) : 28 + Math.floor(rnd() * 20);
        const lean = tilt * (m === 0 ? 1 : 2.4);
        const my = deckY + Math.round(((mx - bx) / len) * len * tilt);
        for (let k = 0; k < mh; k++) px(g, hullD, mx + Math.round(lean * k), my - k, 2, 1);
        if (m === 0) {
          const ty = my - mh + 8;
          const tx = mx + Math.round(lean * (mh - 8));
          px(g, hullD, tx - 16, ty, 32, 2); // yardarm
          for (let k = 0; k < 22; k++) {
            const ww = Math.max(2, 26 - k - ((k * 7) % 5));
            if ((k * 3) % 7 === 0) continue; // tears
            px(g, sail, tx - 13 + Math.floor(k * 0.3), ty + 2 + k, ww, 1);
          }
          // rigging lines to the deck
          for (let k = 0; k < 30; k++) {
            px(g, hullD, tx - 16 + Math.round(k * -0.4), ty + k, 1, 1);
            px(g, hullD, tx + 15 + Math.round(k * 0.5), ty + k, 1, 1);
          }
        }
      }
    });
  }
  // rocks and the sea with breaking surf
  for (let i = 0; i < 9; i++) {
    const rx = Math.floor(rnd() * W);
    const rw = 10 + Math.floor(rnd() * 26);
    const rh = 6 + Math.floor(rnd() * 12);
    wrapX(W, rx, (bx) => {
      for (let k = 0; k < rh; k++) {
        const ww = Math.round(rw * Math.sqrt(1 - ((rh - k) / rh) ** 2));
        px(g, hullD, bx - Math.floor(ww / 2), H - 20 - rh + k, ww, 1);
        px(g, hullL, bx - Math.floor(ww / 2), H - 20 - rh + k, 1, 1);
      }
    });
  }
  px(g, sea, 0, H - 20, W, 20);
  for (let i = 0; i < 70; i++) px(g, foam, Math.floor(rnd() * W), H - 20 + Math.floor(rnd() * 18), 4 + Math.floor(rnd() * 14), 1);
  for (let x = 0; x < W; x += 2) px(g, foam, x, H - 21 + Math.round(Math.sin((x / W) * Math.PI * 16) * 1.5), 2, 1);
  return c;
}

/** Rolling surf for the bottom of the screen: three ranks of wave crests with foam, solid water below; tileable. */
function surf(seed: number, ranks: [string, string, string][], W = 512, H = 128): HTMLCanvasElement {
  const [c, g] = canvas(W, H);
  const rnd = mulberry32(seed);
  const bayer = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  ranks.forEach(([water, crest, foam], r) => {
    const base = 18 + r * 18;
    const amp = 2 + r * 2;
    const n = 6 - r; // integer wave count so the strip tiles
    const ph = rnd() * Math.PI * 2;
    for (let x = 0; x < W; x++) {
      const a = (x / W) * Math.PI * 2;
      const y = Math.round(base + Math.sin(a * n + ph) * amp + Math.sin(a * n * 3 + ph * 2) * amp * 0.25);
      px(g, water, x, y, 1, H - y);
      px(g, foam, x, y, 1, 1);
      px(g, crest, x, y + 1, 1, 2);
      // dithered foam trailing under the crest
      for (let k = 3; k < 9; k++) if (bayer[((y + k) & 3) * 4 + (x & 3)] / 16 > (k - 2) / 7) px(g, crest, x, y + k);
    }
  });
  return c;
}

/** Cave depths: stalagmites and rock masses rising from the bottom, studded with glowing crystal clusters; tileable. */
function geodeCave(seed: number, rock: string, rockL: string, rockD: string, xtal: string[], W = 512, H = 192, near = false): HTMLCanvasElement {
  const [c, g] = canvas(W, H);
  const rnd = mulberry32(seed);
  const n1 = makeNoise(seed, 32);
  // an uneven floor of rock across the bottom
  for (let x = 0; x < W; x++) {
    const top = Math.round(H * (near ? 0.78 : 0.7) + (n1(x / 24, 0) - 0.5) * 26);
    px(g, rock, x, top, 1, H - top);
    px(g, rockL, x, top, 1, 1);
  }
  // stalagmites: tapering spires, lit on one side
  const count = near ? 7 : 11;
  for (let i = 0; i < count; i++) {
    const cx = Math.floor(((i + 0.2 + rnd() * 0.6) / count) * W);
    const hgt = (near ? 70 : 50) + Math.floor(rnd() * (near ? 90 : 80));
    const wid = (near ? 22 : 14) + Math.floor(rnd() * 16);
    wrapX(W, cx, (bx) => {
      for (let k = 0; k < hgt; k++) {
        const t = k / hgt; // 0 tip .. 1 base
        const ww = Math.max(1, Math.round(wid * Math.pow(t, 0.7)));
        const xx = bx - Math.floor(ww / 2) + Math.round(Math.sin(k * 0.2 + i) * 1.2);
        px(g, rock, xx, H - hgt + k, ww, 1);
        px(g, rockL, xx, H - hgt + k, Math.max(1, Math.floor(ww * 0.25)), 1);
        px(g, rockD, xx + ww - Math.max(1, Math.floor(ww * 0.2)), H - hgt + k, Math.max(1, Math.floor(ww * 0.2)), 1);
        if (k % 9 === 4) px(g, rockD, xx, H - hgt + k, ww, 1); // strata rings
      }
    });
  }
  // crystal clusters: fans of pointed prisms, glowing at the tips
  const clusters = near ? 9 : 14;
  for (let i = 0; i < clusters; i++) {
    const cx = Math.floor(rnd() * W);
    const cy = Math.floor(H * (near ? 0.82 : 0.74) + rnd() * 20);
    const n = 3 + Math.floor(rnd() * 3);
    wrapX(W, cx, (bx) => {
      for (let j = 0; j < n; j++) {
        const ang = -Math.PI / 2 + (j - (n - 1) / 2) * 0.38 + (rnd() - 0.5) * 0.2;
        const len = (near ? 16 : 10) + Math.floor(rnd() * (near ? 26 : 16));
        const wid = near ? 3 : 2;
        for (let k = 0; k < len; k++) {
          const x = bx + Math.cos(ang) * k;
          const y = cy + Math.sin(ang) * k;
          const ww = Math.max(1, Math.round(wid * (1 - (k / len) * 0.7)));
          px(g, k > len - 3 ? xtal[3] : k % 5 === 0 ? xtal[2] : xtal[1], x - Math.floor(ww / 2), y, ww, 1);
          if (ww > 1) px(g, xtal[0], x - Math.floor(ww / 2), y, 1, 1);
        }
      }
    });
  }
  return c;
}

/** Small glow sprite used as additive spark: 4-point star. */
function sparkTex(): HTMLCanvasElement {
  const [c, g] = canvas(17, 17);
  const col = ['#ffffff', '#fff3b0', '#ffd46a'];
  for (let i = 0; i < 8; i++) {
    const t = i < 3 ? 0 : i < 6 ? 1 : 2;
    px(g, col[t], 8 - i, 8);
    px(g, col[t], 8 + i, 8);
    px(g, col[t], 8, 8 - i);
    px(g, col[t], 8, 8 + i);
  }
  px(g, '#ffffff', 7, 7, 3, 3);
  px(g, 'rgba(255,255,255,0.5)', 6, 6);
  px(g, 'rgba(255,255,255,0.5)', 10, 6);
  px(g, 'rgba(255,255,255,0.5)', 6, 10);
  px(g, 'rgba(255,255,255,0.5)', 10, 10);
  return c;
}

/** Hollow pixel ring for shockwaves, 32x32. */
function ringTex(): HTMLCanvasElement {
  const [c, g] = canvas(32, 32);
  for (let a = 0; a < Math.PI * 2; a += 0.01) {
    px(g, '#ffffff', 16 + Math.cos(a) * 14.5, 16 + Math.sin(a) * 14.5);
    px(g, 'rgba(255,255,255,0.5)', 16 + Math.cos(a) * 13.5, 16 + Math.sin(a) * 13.5);
  }
  return c;
}

function bubbleTex(): HTMLCanvasElement {
  const [c, g] = canvas(64, 64);
  const bayer = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  for (let y = 0; y < 64; y++) {
    for (let x = 0; x < 64; x++) {
      const d = Math.hypot(x - 31.5, y - 31.5);
      if (d > 31.5) continue;
      const t = d / 31.5;
      const dith = bayer[(y & 3) * 4 + (x & 3)] / 16;
      if (t > 0.93) px(g, 'rgba(210,248,255,0.95)', x, y);
      else if (t > 0.86) px(g, 'rgba(120,214,255,0.7)', x, y);
      else if (t * 1.1 + dith * 0.3 > 0.6) px(g, 'rgba(120,214,255,0.28)', x, y);
      else if (t * 1.1 + dith * 0.3 > 0.3) px(g, 'rgba(120,214,255,0.12)', x, y);
    }
  }
  // glint
  px(g, 'rgba(255,255,255,0.8)', 18, 14, 6, 2);
  px(g, 'rgba(255,255,255,0.8)', 15, 17, 2, 4);
  return c;
}

// ---------------------------------------------------------------------------------------------
// Ground planes: what lies below the near skyline, in three overlapping layers (far floor, mid ridge, foreground).
// Each nearer layer has a ragged opaque top edge that covers the seam with the one behind it as they parallax apart.
// ---------------------------------------------------------------------------------------------

/** The three ground layers: art-pixel height and where each one's top sits below the near skyline's base. */
export const GROUND_LAYERS = [
  { h: 160, top: 0 },
  { h: 200, top: 64 },
  { h: 240, top: 130 },
] as const;
const GW = 512;

const BAY = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
/** Ordered-dither threshold in [0,1) for an art pixel. */
const bay = (x: number, y: number): number => BAY[((y & 3) << 2) | (x & 3)] / 16;
const clampI = (v: number, n: number): number => Math.max(0, Math.min(n - 1, Math.floor(v)));

/** Direct pixel painter (0xRRGGBB colours, alpha blending); x wraps so everything drawn is horizontally tileable. */
class Pix {
  readonly d: Uint8ClampedArray;
  constructor(
    readonly W: number,
    readonly H: number,
  ) {
    this.d = new Uint8ClampedArray(W * H * 4);
  }
  private at(x: number, y: number): number {
    const yi = Math.round(y);
    if (yi < 0 || yi >= this.H) return -1;
    const xi = ((Math.round(x) % this.W) + this.W) % this.W;
    return (yi * this.W + xi) * 4;
  }
  set(x: number, y: number, col: number, a = 1): void {
    const o = this.at(x, y);
    if (o < 0 || a <= 0) return;
    const d = this.d;
    const r = (col >> 16) & 255;
    const g = (col >> 8) & 255;
    const b = col & 255;
    if (a >= 1) {
      d[o] = r;
      d[o + 1] = g;
      d[o + 2] = b;
      d[o + 3] = 255;
      return;
    }
    const da = d[o + 3] / 255;
    const k = da * (1 - a);
    const oa = a + k;
    d[o] = (r * a + d[o] * k) / oa;
    d[o + 1] = (g * a + d[o + 1] * k) / oa;
    d[o + 2] = (b * a + d[o + 2] * k) / oa;
    d[o + 3] = oa * 255;
  }
  /** Tint an already-painted pixel toward `col` (light falling on it); leaves empty pixels empty. */
  lit(x: number, y: number, col: number, a: number): void {
    const o = this.at(x, y);
    if (o < 0 || this.d[o + 3] === 0) return;
    this.set(x, y, col, a);
  }
  opaque(x: number, y: number): boolean {
    const o = this.at(x, y);
    return o >= 0 && this.d[o + 3] > 0;
  }
  rect(x: number, y: number, w: number, h: number, col: number, a = 1): void {
    const x0 = Math.round(x);
    const y0 = Math.round(y);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x0 + i, y0 + j, col, a);
  }
  /** Fill every column from `top(x)` to the bottom with `fn(x, y, depth below top)`. */
  body(top: (x: number) => number, fn: (x: number, y: number, k: number) => number): void {
    for (let x = 0; x < this.W; x++) {
      const t = Math.round(top(x));
      for (let y = Math.max(0, t); y < this.H; y++) this.set(x, y, fn(x, y, y - t));
    }
  }
  /** A pool of light on the ground: an ellipse (flattened by perspective) of dithered, stepped falloff. */
  halo(cx: number, cy: number, r: number, col: number, a: number, flat = 0.45): void {
    const ry = r * flat;
    for (let y = Math.floor(-ry); y <= ry; y++) {
      for (let x = Math.floor(-r); x <= r; x++) {
        const d = Math.hypot(x / r, y / ry);
        if (d >= 1) continue;
        const q = Math.floor((1 - d) * (1 - d) * 3 + bay(cx + x, cy + y) - 0.25);
        if (q > 0) this.lit(cx + x, cy + y, col, (a * q) / 3);
      }
    }
  }
  /** A fan of pointed crystal prisms from (bx, by): two-tone facets, a bright spine and a white-hot tip. */
  crystals(bx: number, by: number, n: number, len: number, wid: number, xt: number[], rnd: () => number, spread = 0.38): void {
    for (let j = 0; j < n; j++) {
      const ang = -Math.PI / 2 + (j - (n - 1) / 2) * spread + (rnd() - 0.5) * 0.25;
      const L = Math.round(len * (0.55 + rnd() * 0.45) * (j === Math.floor(n / 2) ? 1.25 : 1));
      const ca = Math.cos(ang);
      const sa = Math.sin(ang);
      for (let k = 0; k < L; k++) {
        const ww = Math.max(1, Math.round(wid * (k < L * 0.75 ? 1 : (L - k) / (L * 0.25))));
        for (let i = 0; i < ww; i++) {
          const off = i - (ww - 1) / 2;
          const x = bx + ca * k - sa * off;
          const y = by + sa * k + ca * off;
          const c = k >= L - 2 ? xt[3] : i === 0 && ww > 2 ? xt[0] : off < 0 ? xt[2] : xt[1];
          this.set(x, y, c);
        }
        if (ww > 2 && k % 6 === 3) this.set(bx + ca * k, by + sa * k, xt[3]);
      }
    }
  }
  canvas(): HTMLCanvasElement {
    const [c, g] = canvas(this.W, this.H);
    const img = g.createImageData(this.W, this.H);
    img.data.set(this.d);
    g.putImageData(img, 0, 0);
    return c;
  }
}

/** A tileable ragged skyline for a ground layer: coarse swells plus finer roughness (noise period 8 over W = 512). */
function ridgeOf(seed: number, base: number, amp: number, rough: number): number[] {
  const n = makeNoise(seed, 8);
  const out: number[] = [];
  for (let x = 0; x < GW; x++) out.push(Math.round(base + (n(x / 64, 0.5) - 0.5) * amp + (n(x / 16, 3.5) - 0.5) * rough + (n(x / 4, 6.5) - 0.5) * rough * 0.3));
  return out;
}

const layers = (): [Pix, Pix, Pix] => GROUND_LAYERS.map((l) => new Pix(GW, l.h)) as [Pix, Pix, Pix];

/**
 * The finished layers. Each nearer layer must be opaque everywhere below the bottom of the one behind it (or the sky would
 * show through between them): any pixel still empty there takes the colour of the first painted pixel beneath it.
 */
function sealed(ps: Pix[]): HTMLCanvasElement[] {
  ps.forEach((P, i) => {
    if (i === 0) return;
    const prev = GROUND_LAYERS[i - 1];
    const from = Math.max(0, prev.top + prev.h - GROUND_LAYERS[i].top - 3);
    for (let x = 0; x < P.W; x++) {
      for (let y = P.H - 1, fill = -1; y >= from; y--) {
        const o = (y * P.W + x) * 4;
        if (P.d[o + 3] === 255) fill = o;
        else if (fill >= 0) {
          P.d[o] = P.d[fill];
          P.d[o + 1] = P.d[fill + 1];
          P.d[o + 2] = P.d[fill + 2];
          P.d[o + 3] = 255;
        }
      }
    }
  });
  return ps.map((P) => P.canvas());
}

/** Amethyst Hollow: an underground lake glowing with crystal reflections, crystal-studded ledges and great foreground shards. */
function geodeGround(): HTMLCanvasElement[] {
  const [A, B, C] = layers();
  const rnd = mulberry32(611);
  const n = makeNoise(612, 8);
  const ROCK = [0x05030a, 0x08060e, 0x0d0a15, 0x13101e, 0x1b1529, 0x251c38, 0x34284e, 0x4a3a6a];
  const PURP = [0x2a1650, 0x6a34a0, 0xa868e0, 0xf4e8ff];
  const CYAN = [0x0e3a44, 0x1c8a94, 0x40e0d8, 0xe0fffa];
  const pal = (): number[] => (rnd() > 0.3 ? PURP : CYAN);

  // A: far shore, then a still lake mirroring the crystal light, then a rubble shore
  const lakeTop = (x: number): number => 9 + (n(x / 16, 1.5) - 0.5) * 6;
  const lakeBot = (x: number): number => 92 + (n(x / 64, 2.5) - 0.5) * 44 + (n(x / 8, 4.5) - 0.5) * 8;
  const refl = Array.from({ length: 9 }, () => ({ x: rnd() * GW, w: 4 + rnd() * 10, c: rnd() > 0.35 ? PURP : CYAN }));
  A.body(
    () => 0,
    (x, y) => {
      const t = lakeTop(x);
      const b = lakeBot(x);
      if (y < t) return ROCK[clampI(2 + (n(x / 8, y / 3) - 0.3) * 2 + bay(x, y) * 0.8, ROCK.length)];
      if (y >= b) {
        const k = y - b;
        return ROCK[clampI(4.2 - k / 22 + (n(x / 8, y / 6) - 0.5) * 1.6 + bay(x, y) * 0.9, ROCK.length)];
      }
      return 0x0a0616;
    },
  );
  for (let x = 0; x < GW; x++) {
    const t = Math.round(lakeTop(x));
    const b = Math.round(lakeBot(x));
    A.set(x, t - 1, ROCK[6]); // lit lip of the far shore
    for (let y = t; y < b; y++) {
      const u = (y - t) / Math.max(1, b - t);
      // water darkens toward the viewer, faint sky-glow near the far edge
      A.set(x, y, u < 0.12 ? 0x1c1236 : u < 0.3 && bay(x, y) > u * 2.6 ? 0x150c2a : 0x0c0718);
      // reflected crystal columns, broken into ripples that lengthen with depth
      for (const r of refl) {
        let dx = Math.abs(x - r.x);
        if (dx > GW / 2) dx = GW - dx;
        const w = r.w * (1 + u * 0.8);
        if (dx > w) continue;
        const ripple = (y + Math.floor(n(x / 4, y * 0.5) * 3)) % 3 !== 0;
        if (!ripple) continue;
        const e = 1 - dx / w;
        A.set(x, y, e > 0.75 && u < 0.6 ? r.c[2] : e > 0.35 ? r.c[1] : r.c[0], 0.85 - u * 0.4);
      }
      // stray ripple glints
      if ((n(x / 4, y * 0.9) > 0.74 && y % 2 === 0) || (bay(x * 3, y) > 0.97 && u > 0.2)) A.set(x, y, 0x3a2a5a);
    }
    A.set(x, b, 0x04020a); // wet dark waterline
  }
  for (let i = 0; i < 14; i++) {
    const x = rnd() * GW;
    const y = 112 + rnd() * 44;
    const xt = pal();
    A.halo(x, y, 16, xt[2], 0.35);
    A.crystals(x, y, 2 + Math.floor(rnd() * 3), 6 + rnd() * 6, 2, xt, rnd);
  }
  for (let i = 0; i < 90; i++) {
    const x = Math.floor(rnd() * GW);
    const y = 100 + Math.floor(rnd() * 58);
    if (!A.opaque(x, y - 2)) continue;
    A.rect(x, y, 2, 1, ROCK[5]);
    A.set(x, y + 1, ROCK[1]);
  }

  // B: a ledge of rock with stalagmites and glowing clusters along its crest
  const rb = ridgeOf(620, 34, 34, 12);
  // stalagmite stumps poking above the crest
  for (let i = 0; i < 9; i++) {
    const cx = Math.floor(((i + rnd()) / 9) * GW);
    const h = 14 + Math.floor(rnd() * 22);
    const w = 6 + Math.floor(rnd() * 8);
    const base = rb[cx] + 4;
    for (let k = 0; k < h; k++) {
      const ww = Math.max(1, Math.round(w * Math.pow(k / h, 0.7)));
      for (let i2 = 0; i2 < ww; i2++) B.set(cx - Math.floor(ww / 2) + i2, base - h + k, i2 === 0 ? ROCK[6] : i2 < ww * 0.35 ? ROCK[5] : i2 >= ww - 1 ? ROCK[1] : ROCK[3]);
      if (k % 7 === 3) B.rect(cx - Math.floor(ww / 2), base - h + k, ww, 1, ROCK[2]);
    }
  }
  B.body(
    (x) => rb[x],
    (x, y, k) => {
      if (k === 0) return ROCK[7];
      if (k < 3) return ROCK[6];
      const strata = (y + Math.round((n(x / 16, 9.5) - 0.5) * 10)) % 19 === 0 ? -1.2 : 0;
      return ROCK[clampI(5 - k / 26 + (n(x / 8, y / 7) - 0.5) * 1.4 + bay(x, y) * 0.9 + strata, ROCK.length)];
    },
  );
  for (let i = 0; i < 11; i++) {
    const x = Math.floor(rnd() * GW);
    const y = rb[x] + 3 + rnd() * 6;
    const xt = pal();
    B.halo(x, y + 6, 32, xt[2], 0.42);
    B.crystals(x, y, 3 + Math.floor(rnd() * 3), 16 + rnd() * 16, 4, xt, rnd);
  }
  // glowing toadstools in clumps on the ledge and in its cracks
  for (let i = 0; i < 9; i++) {
    const x0 = Math.floor(rnd() * GW);
    const y0 = rb[x0] + 6 + Math.floor(rnd() * 60);
    B.halo(x0, y0, 14, CYAN[2], 0.3);
    for (let m = 0; m < 3 + Math.floor(rnd() * 3); m++) {
      const x = x0 + Math.floor((rnd() - 0.5) * 12);
      const h = 2 + Math.floor(rnd() * 4);
      const cw = 3 + Math.floor(rnd() * 3);
      B.rect(x, y0 - h, 1, h, 0x9ad0d0);
      B.rect(x - Math.floor(cw / 2), y0 - h - 1, cw, 1, CYAN[1]);
      B.rect(x - Math.floor(cw / 2) + 1, y0 - h - 2, Math.max(1, cw - 2), 1, CYAN[2]);
      B.set(x, y0 - h - 2, CYAN[3]);
    }
  }

  // C: foreground boulders, near-black against the glow, with great shards of amethyst
  const rc = ridgeOf(630, 84, 80, 18);
  C.body(
    (x) => rc[x],
    (x, y, k) => (k === 0 ? ROCK[5] : k < 2 ? ROCK[3] : ROCK[clampI(2.2 - k / 40 + (n(x / 8, y / 9) - 0.5) * 1.2 + bay(x, y) * 0.8, 3)]),
  );
  const peaksC: number[] = [];
  for (let x = 0; x < GW; x += 4) if (rc[x] < rc[(x + GW - 12) % GW] && rc[x] <= rc[(x + 12) % GW]) peaksC.push(x);
  for (let i = 0; i < 6; i++) {
    const x = peaksC.length ? peaksC[Math.floor(rnd() * peaksC.length)] : Math.floor(rnd() * GW);
    const y = rc[x] + 6;
    const xt = i % 3 === 2 ? CYAN : PURP;
    C.halo(x, y + 12, 60, xt[1], 0.5);
    C.crystals(x, y, 3 + Math.floor(rnd() * 2), 44 + rnd() * 40, 9, xt, rnd, 0.3);
  }
  return sealed([A, B, C]);
}

/** Ember Reactor: a river of lava below the refinery, a lit tank-and-pipe deck, and foreground girders and mains. */
function reactorGround(): HTMLCanvasElement[] {
  const [A, B, C] = layers();
  const rnd = mulberry32(711);
  const n = makeNoise(712, 8);
  const G = [0x070302, 0x0d0504, 0x150806, 0x1f0c08, 0x2c120a, 0x3e1a0e, 0x5a2814];
  const L = [0x4a1006, 0x8a2408, 0xd04a0c, 0xff7a1a, 0xffb040, 0xffe890];
  const M = [0x100604, 0x1e0e08, 0x341a10, 0x522a18, 0x8a4626, 0xe0843a];
  const HAZ = [0xffc030, 0x1a0c06];

  // A: dark bank, the lava river (cooling crust, bright seams), and a scorched shore lit by it
  const lt = (x: number): number => 5 + (n(x / 16, 1.5) - 0.5) * 6;
  const lb = (x: number): number => 74 + (n(x / 64, 2.5) - 0.5) * 36 + (n(x / 8, 3.5) - 0.5) * 6;
  A.body(
    () => 0,
    (x, y) => {
      const t = lt(x);
      const b = lb(x);
      if (y < t) return G[clampI(1 + y / 3 + bay(x, y), 4)];
      if (y < b) {
        const u = (y - t) / (b - t);
        // mostly dark cooling crust, broken by glowing cracks; the open channels burn hottest in their middles
        const v = n(x / 32, y / (2.5 + u * 5)) * 0.7 + n(x / 8, y / (1.5 + u * 2.5)) * 0.3;
        if (v < 0.54) return v < 0.44 ? G[2] : v < 0.5 ? G[3] : G[5];
        if (v < 0.565) return L[1];
        return L[clampI(2 + (v - 0.565) * 16 + (bay(x, y) - 0.5) * 0.8 - u * 0.8, L.length)];
      }
      const k = y - b;
      return G[clampI(6 - k / 7 + (n(x / 8, y / 5) - 0.5) * 1.4 + bay(x, y) * 0.9, G.length)];
    },
  );
  for (let x = 0; x < GW; x++) {
    A.set(x, Math.round(lt(x)) - 1, L[1]);
    A.set(x, Math.round(lb(x)), L[3]);
  }
  // lava falls / outflow pipes feeding the river from the far bank
  for (let i = 0; i < 6; i++) {
    const x = Math.floor(rnd() * GW);
    A.rect(x - 3, 0, 7, 3, M[2]);
    A.rect(x - 3, 0, 7, 1, M[4]);
    A.rect(x - 1, 3, 3, Math.round(lt(x)) + 2, L[4]);
    A.set(x, 3, L[5]);
  }
  // slag heaps on the near shore
  for (let i = 0; i < 10; i++) {
    const x = Math.floor(rnd() * GW);
    const y = Math.round(lb(x)) + 18 + Math.floor(rnd() * 40);
    const w = 10 + Math.floor(rnd() * 16);
    for (let k = 0; k < w / 2; k++) {
      const ww = Math.round(w * (k / (w / 2)));
      A.rect(x - Math.floor(ww / 2), y - w / 2 + k, ww, 1, k === 0 ? G[6] : G[3]);
      A.set(x - Math.floor(ww / 2), y - w / 2 + k, G[6]);
    }
  }

  // B: the refinery deck: railings, storage tanks with warning lamps, pipe runs
  const deck = 64;
  for (let i = 0; i < 5; i++) {
    const x = Math.floor(((i + 0.2 + rnd() * 0.6) / 5) * GW);
    const w = 30 + Math.floor(rnd() * 26);
    const h = 26 + Math.floor(rnd() * 22);
    const top = deck - h;
    const dome = Math.round(w * 0.18);
    for (let xx = 0; xx < w; xx++) {
      const u = xx / (w - 1);
      const col = u < 0.08 ? M[5] : u < 0.22 ? M[4] : u < 0.55 ? M[3] : u < 0.88 ? M[2] : M[1];
      const dy = Math.round(dome * (1 - Math.sqrt(1 - Math.pow(u * 2 - 1, 2))));
      B.rect(x + xx, top + dy, 1, h - dy, col);
      B.set(x + xx, top + dy, u < 0.5 ? M[5] : M[4]);
      // hazard band and seams
      for (let k = 0; k < 4; k++) B.set(x + xx, top + Math.round(h * 0.55) + k, (xx + k) % 6 < 3 ? HAZ[0] : HAZ[1]);
      if (xx % 9 === 0) B.rect(x + xx, top + dy + 2, 1, h - dy - 2, M[1]);
    }
    B.rect(x + Math.floor(w / 2) - 1, top - 3, 3, 3, 0xff3a20);
    B.set(x + Math.floor(w / 2), top - 3, 0xffd0a0);
    // ladder
    for (let k = top + 4; k < deck; k += 3) B.rect(x + w - 6, k, 4, 1, M[1]);
  }
  for (let x = 0; x < GW; x++) {
    if (x % 14 === 0) B.rect(x, deck - 12, 2, 12, M[2]);
    if (!B.opaque(x, deck - 12)) B.set(x, deck - 12, M[4]);
    if (!B.opaque(x, deck - 7)) B.set(x, deck - 7, M[2]);
  }
  B.body(
    () => deck,
    (x, y, k) => {
      if (k === 0) return M[5];
      if (k < 3) return M[3];
      // grating: a perspective lattice that opens up toward the viewer
      const gy = Math.floor(3 + k / 14);
      const grid = x % 6 === 0 || k % gy === 0;
      return grid ? M[0] : G[clampI(4 - k / 40 + bay(x, y) * 0.9, 5)];
    },
  );
  const pipe = (P: Pix, y0: number, d: number, hot: number): void => {
    for (let x = 0; x < GW; x++) {
      const heat = Math.max(0, Math.sin((x / GW) * Math.PI * 2 * 3 + hot) - 0.6) * 2.5;
      for (let k = 0; k < d; k++) {
        const u = k / (d - 1);
        let c = u < 0.12 ? M[5] : u < 0.3 ? M[4] : u < 0.6 ? M[3] : u < 0.85 ? M[2] : M[1];
        if (heat > 0.4 && u > 0.25 && u < 0.75) c = heat > 0.9 ? L[3] : L[2];
        P.set(x, y0 + k, c);
      }
      if (x % 48 === 0) P.rect(x - 1, y0 - 1, 4, d + 2, M[4]);
      if (x % 48 === 2) P.rect(x, y0 - 1, 1, d + 2, M[1]);
      if (x % 96 === 30) for (let k = y0 + d; k < P.H; k += 1) P.rect(x, k, 3, 1, k % 4 ? M[1] : M[2]);
    }
  };
  pipe(B, 86, 7, 0);
  pipe(B, 122, 11, 2);
  for (let i = 0; i < 8; i++) {
    const x = Math.floor(rnd() * GW);
    const y = 140 + Math.floor(rnd() * 50);
    B.rect(x, y, 6, 2, L[3]);
    B.set(x, y, L[5]);
    B.halo(x + 3, y + 1, 12, L[2], 0.35);
  }

  // C: foreground: I-beam columns, a great main with valve wheels, and trusses below
  const main = 96;
  for (let i = 0; i < 6; i++) {
    const x = Math.floor(((i + 0.15 + rnd() * 0.7) / 6) * GW);
    const top = 24 + Math.floor(rnd() * 46);
    const w = 10;
    for (let y = top; y < C.H; y++) {
      C.rect(x, y, w, 1, M[1]);
      C.set(x, y, M[4]);
      C.set(x + 1, y, M[3]);
      C.set(x + w - 1, y, M[0]);
      if (y % 12 === 0) C.rect(x + 3, y, 4, 1, M[0]);
    }
    C.rect(x - 2, top, w + 4, 3, M[2]);
    C.rect(x - 2, top, w + 4, 1, M[5]);
    for (let k = 0; k < 8; k++) C.set(x + k + 1, top + 6 + (k % 2), k < 4 ? HAZ[0] : HAZ[1]);
  }
  pipe(C, main, 22, 4);
  for (let i = 0; i < 4; i++) {
    const x = Math.floor(rnd() * GW);
    for (let a = 0; a < Math.PI * 2; a += 0.08) C.set(x + Math.cos(a) * 7, main - 9 + Math.sin(a) * 7, a < Math.PI ? M[2] : M[5]);
    C.rect(x - 7, main - 9, 15, 1, M[3]);
    C.rect(x, main - 16, 1, 15, M[3]);
    C.rect(x - 1, main - 2, 3, 3, M[2]);
  }
  C.body(
    () => main + 22,
    (x, y, k) => {
      const truss = (x + k) % 40 < 2 || (x - k + 400) % 40 < 2 || k % 40 < 2;
      return truss ? M[2] : G[clampI(1.8 - k / 60 + bay(x, y) * 0.7, 3)];
    },
  );
  return sealed([A, B, C]);
}

/** Frostfang: a frozen lake under the shrine woods, a drift ridge with pines and stone lanterns, and deep foreground snow. */
function frostGround(): HTMLCanvasElement[] {
  const [A, B, C] = layers();
  const rnd = mulberry32(811);
  const n = makeNoise(812, 8);
  // moonlit snow at night: blue-grey, well below the brightness of pale fighters (the crests catch the moon)
  const S = [0x2c3a58, 0x3a4c70, 0x4c6088, 0x60769e, 0x7890b4, 0x96acca, 0xc0d0e6];
  const I = [0x16244a, 0x1e3058, 0x283e6a, 0x324c7a, 0x46648e, 0x6684ae, 0xb0cce8];
  const PINE = [0x0a1622, 0x12222f, 0x1c3448, 0x2a4a64];
  const GLOW = 0xffd08a;

  // A: snowy far shore, a frozen lake, a drifted snowfield
  const it = (x: number): number => 10 + (n(x / 16, 1.5) - 0.5) * 8;
  const ib = (x: number): number => 70 + (n(x / 64, 2.5) - 0.5) * 30 + (n(x / 8, 3.5) - 0.5) * 5;
  A.body(
    () => 0,
    (x, y) => {
      const t = it(x);
      const b = ib(x);
      if (y < t) return y < t - 2 ? S[5] : S[3];
      if (y < b) {
        const u = (y - t) / (b - t);
        // polished ice: bands of mirrored sky, wind streaks, darker toward us
        const streak = n(x / 16, y / (1.5 + u * 3));
        return I[clampI(4.6 - u * 2.6 + (streak - 0.5) * 2.2 + bay(x, y) * 0.8, I.length - 1)];
      }
      const k = y - b;
      // drift ridges: a bright crest line with a blue shadow falling away below it
      const ry = (y + Math.round((n(x / 16, 7.5) - 0.5) * 14)) % 26;
      if (k < 2) return S[3];
      if (ry < 1) return S[6];
      return S[clampI(2.2 + Math.min(2.3, (ry - 1) / 4) + (bay(x, y) - 0.5) * 0.8, S.length)];
    },
  );
  // cracks across the ice and snow dusting
  for (let i = 0; i < 18; i++) {
    let x = rnd() * GW;
    let y = it(x) + 3 + rnd() * 40;
    let a = (rnd() - 0.5) * 0.6;
    for (let k = 0; k < 20 + rnd() * 40; k++) {
      if (y >= ib(x) - 1 || y <= it(x) + 1) break;
      A.set(x, y, I[6], 0.8);
      A.set(x, y + 1, I[0], 0.6);
      a += (rnd() - 0.5) * 0.5;
      x += Math.cos(a);
      y += Math.sin(a) * 0.4;
    }
  }
  for (let i = 0; i < 26; i++) {
    const x0 = rnd() * GW;
    const y0 = it(x0) + 4 + rnd() * 50;
    for (let k = 0; k < 30; k++) {
      const x = x0 + (rnd() - 0.5) * 18;
      const y = y0 + (rnd() - 0.5) * 3;
      if (y > it(x) + 1 && y < ib(x) - 1) A.set(x, y, S[4], 0.7);
    }
  }
  // a little torii and lanterns on the far shore of the snowfield
  for (let i = 0; i < 5; i++) {
    const x = Math.floor(rnd() * GW);
    const y = Math.round(ib(x)) + 22 + Math.floor(rnd() * 40);
    A.halo(x, y, 14, GLOW, 0.35);
    A.rect(x - 2, y - 1, 5, 1, PINE[2]);
    A.rect(x - 1, y - 5, 3, 4, PINE[1]);
    A.set(x, y - 4, GLOW);
    A.rect(x - 2, y - 6, 5, 1, S[6]);
  }

  // B: the drift ridge, with snow-laden pines and lit stone lanterns
  const rb = ridgeOf(820, 40, 36, 8);
  const pine = (P: Pix, x: number, base: number, h: number): void => {
    const tiers = Math.max(3, Math.round(h / 9));
    P.rect(x - 1, base - Math.round(h * 0.2), 3, Math.round(h * 0.2) + 2, PINE[0]);
    for (let k = 0; k < h; k++) {
      const tt = k / h; // 0 top
      const tierT = (tt * tiers) % 1;
      const w = Math.max(1, Math.round((h * 0.42) * (0.25 + 0.75 * tt) * (0.55 + 0.45 * tierT)));
      const y = base - Math.round(h * 0.15) - h + k;
      for (let i = -w; i <= w; i++) {
        const snowy = tierT < 0.28 || (i < -w * 0.4 && tierT < 0.5);
        P.set(x + i, y, snowy ? (i < 0 ? S[6] : S[4]) : i < -w * 0.5 ? PINE[3] : i < w * 0.3 ? PINE[2] : PINE[1]);
      }
    }
  };
  for (let i = 0; i < 9; i++) {
    const x = Math.floor(((i + rnd() * 0.8) / 9) * GW);
    pine(B, x, rb[x] + 6, 26 + Math.floor(rnd() * 26));
    if (rnd() > 0.5) pine(B, x + 10, rb[(x + 10) % GW] + 8, 16 + Math.floor(rnd() * 12));
  }
  B.body(
    (x) => rb[x],
    (x, y, k) => {
      if (k < 2) return S[6];
      const ry = (k + Math.round((n(x / 16, 9.5) - 0.5) * 18)) % 34;
      if (ry < 1) return S[6];
      return S[clampI(2 + Math.min(2.4, (ry - 1) / 5) - k / 200 + (bay(x, y) - 0.5) * 0.8, S.length)];
    },
  );
  for (let i = 0; i < 4; i++) {
    const x = Math.floor(rnd() * GW);
    const y = rb[x] + 14 + Math.floor(rnd() * 20);
    B.halo(x, y + 2, 26, GLOW, 0.45);
    // ishidoro: base, post, firebox, wide snowy roof
    B.rect(x - 4, y - 2, 9, 3, PINE[2]);
    B.rect(x - 1, y - 10, 3, 8, PINE[2]);
    B.rect(x - 4, y - 16, 9, 6, PINE[1]);
    B.rect(x - 2, y - 15, 5, 4, GLOW);
    B.set(x, y - 14, 0xfff4d8);
    B.rect(x - 6, y - 18, 13, 2, PINE[2]);
    B.rect(x - 6, y - 19, 13, 1, S[6]);
    B.rect(x - 1, y - 21, 3, 2, S[5]);
  }
  // a trail of footprints winding down the slope
  for (let k = 0; k < 40; k++) {
    const x = 300 + Math.sin(k * 0.25) * 30 + k * 2;
    const y = rb[Math.round(x) % GW] + 10 + k * 4;
    B.rect(x + (k % 2) * 3, y, 2, 1, S[2]);
  }

  // C: the deep foreground bank, a few snow-capped rocks
  const rc = ridgeOf(830, 92, 70, 14);
  C.body(
    (x) => rc[x],
    (x, y, k) => {
      if (k < 2) return S[6];
      if (k < 5) return S[5];
      // broad wind-carved hollows in blue shadow, deepening toward the bottom of the view
      return S[clampI(4.3 - k / 45 + (n(x / 16, y / 16) - 0.5) * 2.2 + (bay(x, y) - 0.5) * 0.8, S.length)];
    },
  );
  for (let i = 0; i < 5; i++) {
    const x = Math.floor(rnd() * GW);
    const y = rc[x] + 10;
    const w = 18 + Math.floor(rnd() * 20);
    for (let k = 0; k < w * 0.6; k++) {
      const ww = Math.round(w * Math.sqrt(k / (w * 0.6)));
      for (let i2 = 0; i2 < ww; i2++) C.set(x - Math.floor(ww / 2) + i2, y - w * 0.6 + k, k < 3 ? S[6] : i2 < ww * 0.3 ? PINE[3] : PINE[1]);
    }
  }
  return sealed([A, B, C]);
}

/** Sunken Temple: a jungle valley with a winding river, a ridge of crowns with a ruined stupa, and dark foreground foliage. */
function jungleGround(): HTMLCanvasElement[] {
  const [A, B, C] = layers();
  const rnd = mulberry32(911);
  const n = makeNoise(912, 8);
  const LF = [0x061208, 0x0a1a0e, 0x0e2414, 0x14301a, 0x1c4022, 0x26502a, 0x346834, 0x4a8640, 0x6aa450];
  const WT = [0x0e2a2c, 0x184440, 0x24605a, 0x4a9a8a, 0xb8f0d8];
  const ST = [0x1e2a26, 0x2e403a, 0x42584e, 0x5e7a66, 0x86a088, 0xc8a060];
  const crown = (P: Pix, cx: number, cy: number, r: number, base: number, shade = 0): void => {
    for (let y = -r; y <= r; y++) {
      for (let x = -r; x <= r; x++) {
        const d = Math.hypot(x, y * 1.15) / r;
        if (d > 1) continue;
        // lit from the upper right (the sun behind the temple), leafy clumps from noise
        const lit = (x * 0.55 - y * 0.85) / r + (n((cx + x) / 4, (cy + y) / 4) - 0.5) * 0.9;
        const v = base + lit * 1.6 - d * 0.8 + (bay(cx + x, cy + y) - 0.5) * 0.7 - shade;
        P.set(cx + x, cy + y, LF[clampI(v, LF.length)]);
      }
    }
  };

  // A: canopy carpet with the river cutting through, mist pooled over the water
  A.body(
    () => 0,
    (x, y) => LF[clampI(2.2 - y / 120 + (n(x / 8, y / 4) - 0.5) * 1.5 + bay(x, y) * 0.8, LF.length)],
  );
  const items: [number, number, number][] = [];
  for (let i = 0; i < 260; i++) {
    const y = 4 + rnd() * 150;
    items.push([rnd() * GW, y, Math.round(3 + (y / 150) * 9 + rnd() * 3)]);
  }
  items.sort((a, b) => a[1] - b[1]);
  const riverC = (x: number): number => 40 + Math.sin((x / GW) * Math.PI * 2 * 2) * 16 + Math.sin((x / GW) * Math.PI * 2 * 5 + 1) * 5;
  const riverW = (x: number): number => 9 + Math.sin((x / GW) * Math.PI * 2 * 3 + 2) * 3;
  for (const [x, y, r] of items) {
    const c = riverC(x);
    if (Math.abs(y - c) < riverW(x) + r * 0.6) continue; // keep the river open
    crown(A, Math.round(x), Math.round(y), r, 3.4 + (y / 150) * 0.8);
  }
  for (let x = 0; x < GW; x++) {
    const c = riverC(x);
    const w = riverW(x);
    for (let y = Math.round(c - w); y <= c + w; y++) {
      const u = (y - (c - w)) / (2 * w);
      const glint = n(x / 4, y * 0.8) > 0.7 && y % 2 === 0;
      A.set(x, y, glint ? WT[4] : u < 0.2 ? WT[3] : WT[clampI(2.4 - u * 2 + bay(x, y) * 0.8, 3)]);
    }
    A.set(x, Math.round(c - w) - 1, LF[1]);
    A.set(x, Math.round(c + w) + 1, LF[0]);
    // mist lying over the water
    for (let y = Math.round(c - w - 6); y < c + w; y++) {
      const m = 1 - Math.abs(y - (c - w * 0.3)) / (w + 6);
      if (m > 0 && bay(x, y) < m * 0.5) A.set(x, y, 0xb8e0c8, 0.22);
    }
  }

  // B: a ridge of big crowns with a ruined stupa and broken columns among them
  const rb = ridgeOf(920, 36, 30, 6);
  B.body(
    (x) => rb[x] + 14,
    (x, y, k) => LF[clampI(3 - k / 60 + (n(x / 8, y / 6) - 0.5) * 1.6 + bay(x, y) * 0.8, LF.length)],
  );
  for (let i = 0; i < 2; i++) {
    const x = Math.floor(GW * (0.2 + i * 0.5) + rnd() * 40);
    const base = rb[x] + 30;
    // a stepped stupa: three tiers and a finial, mossy on top
    for (let t = 0; t < 3; t++) {
      const w = 34 - t * 9;
      const h = 9 - t;
      const y = base - (t + 1) * 9;
      for (let xx = 0; xx < w; xx++) {
        const u = xx / w;
        B.rect(x - w / 2 + xx, y, 1, h, u > 0.7 ? ST[3] : u > 0.25 ? ST[2] : ST[1]);
        B.set(x - w / 2 + xx, y, LF[6]);
        if ((xx + t) % 5 === 0) B.set(x - w / 2 + xx, y + h - 2, ST[0]);
      }
    }
    B.rect(x - 2, base - 38, 4, 11, ST[3]);
    B.rect(x - 1, base - 42, 2, 4, ST[5]);
    B.halo(x, base - 22, 16, ST[5], 0.25, 1);
  }
  for (let i = 0; i < 4; i++) {
    const x = Math.floor(rnd() * GW);
    const h = 12 + Math.floor(rnd() * 16);
    const base = rb[x] + 24;
    B.rect(x, base - h, 6, h, ST[2]);
    B.rect(x + 4, base - h, 2, h, ST[3]);
    B.rect(x, base - h, 6, 1, ST[4]);
    for (let k = 0; k < h; k += 4) B.set(x + 1, base - h + k, ST[0]);
    for (let k = 0; k < 8; k++) B.set(x + (k % 3) * 2, base - h + 1 + k * 2, LF[5]); // vines
  }
  for (let i = 0; i < 40; i++) {
    const x = (i / 40) * GW + rnd() * 10;
    const r = 11 + Math.floor(rnd() * 9);
    crown(B, Math.round(x), rb[Math.round(x) % GW] + r - 2 + Math.floor(rnd() * 8), r, 4.6);
  }
  for (let i = 0; i < 60; i++) {
    const x = rnd() * GW;
    const y = 60 + rnd() * 130;
    crown(B, Math.round(x), Math.round(y), 9 + Math.floor(rnd() * 8), 3.2 - y / 120);
  }

  // C: big dark foreground crowns and fronds that frame the bottom of the view
  const rc = ridgeOf(930, 96, 60, 10);
  C.body(
    (x) => rc[x] + 14,
    (x, y, k) => LF[clampI(1.4 - k / 80 + (n(x / 8, y / 6) - 0.5) * 1.2 + bay(x, y) * 0.8, 4)],
  );
  for (let i = 0; i < 24; i++) {
    const x = (i / 24) * GW + rnd() * 12;
    const r = 18 + Math.floor(rnd() * 14);
    crown(C, Math.round(x), rc[Math.round(x) % GW] + r, r, 2.6, 0.4);
  }
  for (let i = 0; i < 9; i++) {
    // fern fronds arching up out of the dark
    const x0 = rnd() * GW;
    const y0 = rc[Math.floor(x0)] + 30;
    const dir = rnd() > 0.5 ? 1 : -1;
    for (let k = 0; k < 40; k++) {
      const t = k / 40;
      const x = x0 + dir * k * 0.9;
      const y = y0 - Math.sin(t * Math.PI * 0.8) * 26;
      C.set(x, y, LF[5]);
      if (k % 3 === 0) for (let l = 1; l < 7 * (1 - t); l++) C.set(x + dir * l * 0.4, y + l, LF[4]);
    }
  }
  return sealed([A, B, C]);
}

/** A wind-whipped sea below the stage: rows of whitecaps that grow toward the viewer, rock stacks wreathed in foam. */
function seaGround(seed: number, W: number[], foam: number, rough: number, rock: number[]): HTMLCanvasElement[] {
  const [A, B, C] = layers();
  const rnd = mulberry32(seed);
  const n = makeNoise(seed + 1, 8);
  const sea = (P: Pix, top: (x: number) => number, y0: number, lit: number): void => {
    P.body(top, (x, y, k) => {
      const t = (y0 + y) / 400; // depth across all three layers
      // long, thin swells: stretched across, squashed down, opening up toward the viewer
      const Y = y0 + y;
      const v = n(x / (t > 0.35 ? 64 : 32), Y / (0.7 + t * 2.4)) * 0.75 + n(x / 16, Y / (0.5 + t * 1.5)) * 0.25;
      if (k < 1) return foam;
      if (v > 0.78 - rough * 0.03) return bay(x, y) > 0.3 ? foam : W[5];
      if (v > 0.7) return W[5];
      if (v > 0.64) return W[4];
      if (v < 0.32) return W[0];
      return W[clampI(lit - t * 2.2 + (v - 0.48) * 2.5 + bay(x, y) * 0.8, 4)];
    });
  };
  const stack = (P: Pix, x: number, base: number, h: number, w: number): void => {
    for (let k = 0; k < h; k++) {
      const ww = Math.max(2, Math.round(w * (0.5 + 0.5 * Math.pow(k / h, 0.6))));
      for (let i = 0; i < ww; i++) P.set(x - Math.floor(ww / 2) + i, base - h + k, i < 2 ? rock[2] : i > ww - 3 ? rock[0] : rock[1]);
      if (k % 9 === 5) P.rect(x - Math.floor(ww / 2), base - h + k, ww, 1, rock[0]);
    }
    for (let i = -w; i <= w; i++) if (bay(x + i, base) > Math.abs(i) / (w * 1.1)) P.set(x + i, base - 1 + (i % 2), foam);
  };
  // A: open water to the horizon, a few distant stacks
  sea(A, () => 0, 0, 3.4);
  for (let x = 0; x < GW; x++) A.set(x, 0, W[5]);
  for (let i = 0; i < 4; i++) {
    const x = Math.floor(rnd() * GW);
    stack(A, x, 30 + Math.floor(rnd() * 40), 16 + Math.floor(rnd() * 16), 8 + Math.floor(rnd() * 6));
  }
  // B: a long swell with spray on its crest and a big stack
  const swell = (s: number, base: number, amp: number): number[] =>
    Array.from({ length: GW }, (_, x) => Math.round(base + Math.sin((x / GW) * Math.PI * 2 * 3 + s) * amp + Math.sin((x / GW) * Math.PI * 2 * 7 + s * 2) * amp * 0.3 + (n(x / 16, s) - 0.5) * 6));
  const rb = swell(1, 40, 7);
  for (let i = 0; i < 2; i++) {
    const x = Math.floor(GW * (0.3 + i * 0.45) + rnd() * 30);
    stack(B, x, rb[x] + 8, 40 + Math.floor(rnd() * 20), 18 + Math.floor(rnd() * 8));
  }
  sea(B, (x) => rb[x], 64, 3);
  for (let x = 0; x < GW; x++) for (let k = 1; k < 5; k++) if (bay(x, rb[x] - k) < 0.4 / k) B.set(x, rb[x] - k, foam, 0.8);
  // C: the nearest swell, dark and heaving, flecked with foam
  const rc = swell(4, 100, 12);
  sea(C, (x) => rc[x], 150, 2.4);
  for (let x = 0; x < GW; x++) {
    for (let k = 1; k < 7; k++) if (bay(x, rc[x] - k) < 0.5 / k) C.set(x, rc[x] - k, foam, 0.9);
    C.set(x, rc[x] + 1, W[4]);
  }
  return sealed([A, B, C]);
}

/** Neon Skyline: the city sprawling far below: hazy lit blocks and glowing streets, towers with neon signs, and dark rooftops. */
function cityGround(): HTMLCanvasElement[] {
  const [A, B, C] = layers();
  const rnd = mulberry32(1211);
  const n = makeNoise(1212, 8);
  const BODY = [0x0a0618, 0x100a22, 0x171030, 0x20163e, 0x2c1e52, 0x3c2a6a];
  const WIN = [0xffcf6a, 0xff8a5a, 0x7fe8ff, 0xffe8b0];
  const NEON = [0xff4ab0, 0x4af0ff, 0xc070ff, 0xffd040];
  const HAZE = 0x6a3080;
  /** A block of building: shaded body, a lit roof edge and a grid of windows (some dark). */
  const block = (P: Pix, x: number, base: number, w: number, h: number, body: number, lit: number, wp: number, haze: number): void => {
    for (let k = 0; k < h; k++) {
      const y = base - h + k;
      for (let i = 0; i < w; i++) {
        let c = i === 0 ? BODY[clampI(body + 1, BODY.length)] : i >= w - 1 ? BODY[Math.max(0, body - 1)] : BODY[body];
        if (k === 0) c = BODY[clampI(body + 2, BODY.length)];
        P.set(x + i, y, c);
        const win = k > 1 && i > 0 && i < w - 1 && k % wp === 1 && i % 2 === 1;
        if (win && rnd() < lit) P.set(x + i, y, WIN[Math.floor(rnd() * 3.4)]);
      }
    }
    if (haze > 0) for (let k = 0; k < h; k++) for (let i = 0; i < w; i++) P.lit(x + i, base - h + k, HAZE, haze);
  };

  // A: the far sprawl: rows of low blocks in perspective, streets glowing between them, haze over the distance
  A.body(
    () => 0,
    (x, y) => BODY[clampI(0.6 + (n(x / 16, y / 6) - 0.5) + bay(x, y) * 0.6, 3)],
  );
  for (let row = 0, y = 6; y < 170; row++) {
    const gap = 5 + Math.floor(y / 14);
    // a street: a line of amber lamps, with car lights here and there
    for (let x = 0; x < GW; x++) {
      if (x % 3 === 0) A.set(x, y + 1, 0xffb060, 0.8);
      if (rnd() < 0.02) A.set(x, y + 1, rnd() > 0.5 ? 0xffffff : 0xff4a5a);
    }
    A.halo(rnd() * GW, y + 1, 30, 0xffb060, 0.25, 0.3);
    let x = Math.floor(rnd() * 6);
    while (x < GW) {
      const w = 4 + Math.floor(rnd() * (5 + y / 12));
      const h = 4 + Math.floor(rnd() * (6 + y / 8));
      const haze = Math.max(0, 0.45 - y / 220);
      block(A, x, y, w, Math.min(h, y + 2), 2, 0.2, 2, haze);
      x += w + 1 + Math.floor(rnd() * 2);
    }
    y += gap;
  }
  // neon glows pooled in a few plazas
  for (let i = 0; i < 6; i++) A.halo(rnd() * GW, 30 + rnd() * 120, 22, NEON[i % NEON.length], 0.35);

  // B: a district of towers with neon signs, rooftop tanks and blinking masts
  const towers: [number, number, number][] = [];
  for (let x = 0; x < GW; ) {
    const w = 14 + Math.floor(rnd() * 22);
    const top = 6 + Math.floor(rnd() * 48);
    towers.push([x, w, top]);
    x += w + 2 + Math.floor(rnd() * 8);
  }
  B.body(
    () => 70,
    (x, y, k) => BODY[clampI(1.6 - k / 90 + (n(x / 16, y / 8) - 0.5) + bay(x, y) * 0.6, 4)],
  );
  for (const [x, w, top] of towers) {
    block(B, x, 200, w, 200 - top, 3, 0.4, 3, 0);
    // rim light from the sky glow on the left edge, roof clutter
    for (let k = top; k < 200; k++) B.set(x, k, BODY[5]);
    if (rnd() > 0.5) {
      const tx = x + 3 + Math.floor(rnd() * (w - 10));
      B.rect(tx, top - 6, 6, 5, BODY[2]);
      B.rect(tx, top - 6, 6, 1, BODY[4]);
      B.rect(tx + 1, top - 1, 1, 1, BODY[1]);
      B.rect(tx + 4, top - 1, 1, 1, BODY[1]);
    } else {
      const mx = x + Math.floor(w / 2);
      B.rect(mx, top - 12, 1, 12, BODY[3]);
      B.set(mx, top - 13, 0xff3a3a);
      B.halo(mx, top - 13, 5, 0xff3a3a, 0.5, 1);
    }
    if (rnd() > 0.45) {
      // a vertical neon sign hung on the facade
      const col = NEON[Math.floor(rnd() * NEON.length)];
      const sx = x + (rnd() > 0.5 ? 2 : w - 5);
      const sy = top + 6 + Math.floor(rnd() * 20);
      const sh = 14 + Math.floor(rnd() * 16);
      B.halo(sx + 1, sy + sh / 2, sh * 0.9, col, 0.45, 1.2);
      B.rect(sx - 1, sy - 1, 5, sh + 2, BODY[0]);
      for (let k = 0; k < sh; k++) {
        B.set(sx, sy + k, col);
        B.set(sx + 2, sy + k, col);
        if (k % 4 === 1) B.set(sx + 1, sy + k, 0xffffff);
      }
    }
  }
  // street level glow between the towers
  for (let x = 0; x < GW; x++) if (!B.opaque(x, 150)) B.set(x, 150, 0xffb060, 0.6);

  // C: near rooftops: dark parapets with a neon-lit edge, vents, aerials and a billboard
  const rc = ridgeOf(1230, 92, 50, 4).map((v) => Math.round(v / 6) * 6); // stepped rooflines
  C.body(
    (x) => rc[x],
    (x, y, k) => (k === 0 ? 0x5a3a8a : k < 3 ? BODY[3] : BODY[clampI(1.4 - k / 70 + bay(x, y) * 0.5, 3)]),
  );
  for (let x = 1; x < GW; x++) {
    if (rc[x] !== rc[x - 1]) for (let y = Math.min(rc[x], rc[x - 1]); y < Math.max(rc[x], rc[x - 1]); y++) C.set(x, y, 0x3a2a5a);
  }
  for (let i = 0; i < 10; i++) {
    const x = Math.floor(rnd() * GW);
    const y = rc[x];
    if (i % 3 === 0) {
      // rooftop AC unit with a spinning-fan grille
      C.rect(x, y - 8, 12, 8, BODY[2]);
      C.rect(x, y - 8, 12, 1, BODY[4]);
      C.rect(x + 3, y - 6, 6, 4, BODY[0]);
      C.rect(x + 5, y - 6, 2, 4, BODY[3]);
    } else if (i % 3 === 1) {
      C.rect(x, y - 26, 1, 26, BODY[3]);
      C.rect(x - 4, y - 20, 9, 1, BODY[3]);
      C.rect(x - 3, y - 14, 7, 1, BODY[3]);
      C.set(x, y - 27, 0xff3a3a);
    } else {
      // a billboard on struts, glowing
      const col = NEON[Math.floor(rnd() * NEON.length)];
      C.rect(x + 3, y - 10, 1, 10, BODY[3]);
      C.rect(x + 22, y - 10, 1, 10, BODY[3]);
      C.halo(x + 13, y - 18, 30, col, 0.35, 0.7);
      C.rect(x, y - 26, 26, 16, BODY[1]);
      C.rect(x, y - 26, 26, 1, col);
      C.rect(x, y - 11, 26, 1, col);
      C.rect(x, y - 26, 1, 16, col);
      C.rect(x + 25, y - 26, 1, 16, col);
      for (let k = 0; k < 3; k++) C.rect(x + 4, y - 22 + k * 4, 6 + Math.floor(rnd() * 14), 2, k === 1 ? 0xffffff : col);
    }
  }
  return sealed([A, B, C]);
}

const GROUND_BUILDERS: Record<string, () => HTMLCanvasElement[]> = {
  'bg-city-ground': cityGround,
  'bg-geode-ground': geodeGround,
  'bg-reactor-ground': reactorGround,
  'bg-frost-ground': frostGround,
  'bg-jungle-ground': jungleGround,
  'bg-storm-sea': () => seaGround(1011, [0x070e1a, 0x0c1828, 0x122236, 0x1a3048, 0x2c4c6c, 0x4a7096], 0xb8d8f0, 2, [0x08101c, 0x16243a, 0x2c4462]),
  'bg-cove-sea': () => seaGround(1111, [0x041018, 0x061a28, 0x0a2434, 0x0e2e42, 0x245470, 0x4a86a6], 0xb0e0f0, 0, [0x0a1218, 0x1a2a32, 0x34505c]),
};

/**
 * Make sure a ground set's textures (`${key}-0..2`) exist, generating them now if needed. They are built on demand (a
 * stage preview or a match that shows them) and dropped again once no scene holds them (see holdTexture).
 */
export function ensureGroundTextures(scene: Phaser.Scene, key: string): void {
  const build = GROUND_BUILDERS[key];
  if (!build || scene.textures.exists(`${key}-0`)) return;
  let layers: HTMLCanvasElement[];
  try {
    layers = build();
  } catch (err) {
    // no canvas memory: the backdrop shows its sky and skylines without the ground planes
    console.warn(`[stageTextures] could not build ${key}:`, err);
    return;
  }
  layers.forEach((c, i) => {
    if (scene.textures.exists(`${key}-${i}`)) scene.textures.remove(`${key}-${i}`);
    addCanvasTexture(scene, `${key}-${i}`, c);
  });
}

/** Generates all stage / background / effect textures. */
export function buildStageTextures(scene: Phaser.Scene): void {
  const add = (key: string, build: () => HTMLCanvasElement): void => {
    let c: HTMLCanvasElement;
    try {
      c = build();
    } catch (err) {
      // no canvas memory (the browser's cap): this texture is skipped, its users draw without it, nothing throws
      console.warn(`[stageTextures] could not build ${key}:`, err);
      return;
    }
    if (scene.textures.exists(key)) scene.textures.remove(key);
    addCanvasTexture(scene, key, c);
  };
  add('tile-stone', () => stoneTile());
  const SLATE = ['#0e141c', '#18212d', '#243040', '#32425a', '#44587a', '#5a7298'];
  const SLATE_SEAM = ['#103a5a', '#1c6a9c', '#46a8e8', '#9fd8ff', '#e6f6ff'];
  const MARBLE = ['#a89088', '#c4aea4', '#dccbbc', '#ecdecb', '#f7ecdc', '#fff8ee'];
  const MARBLE_SEAM = ['#6a4a1c', '#b08a30', '#e8c050', '#ffe08a', '#fff4c0'];
  add('tile-stone-storm', () => stoneTile(SLATE, SLATE_SEAM, 31));
  add('tile-cap-storm', () => capTile(['#3a4a62', '#566e90', '#8aa6cc', '#2c3a50', '#41546e', '#1c2636', '#9fbfe8', '#18202e', '#10161f', '#0a0f18'], SLATE_SEAM));
  add('tile-pass-storm', () => cloudPass('#e8f2ff', '#b6c9e2', '#7e98bc', '#cfeaff'));
  add('tile-move-storm', () => cloudPass('#cfdcf0', '#8a9fc0', '#56688a', '#ffffff'));
  add('stage-under-storm', () => stageUnder(SLATE, [SLATE_SEAM, ['#103a5a', '#1c6a9c', '#46a8e8', '#9fd8ff', '#e6f6ff']]));
  add('tile-stone-dawn', () => stoneTile(MARBLE, MARBLE_SEAM, 41));
  add('tile-cap-dawn', () => capTile(['#d8c4a4', '#ecdcbc', '#fff4d8', '#bca480', '#d0b890', '#8a7250', '#fff0c0', '#6a5638', '#4a3a24', '#3a2c1a'], MARBLE_SEAM));
  add('tile-pass-dawn', () => woodPass());
  add('tile-move-dawn', () => cloudPass('#fff0e0', '#f4c8b8', '#c48aa0', '#ffffff'));
  add('stage-under-dawn', () => stageUnder(MARBLE.map((c) => c).reverse().map((_, i) => ['#6a4a52', '#8a6a6c', '#a88884', '#c4a6a0', '#dcc4b8', '#f0dcd0'][i]), [['#6a4a1c', '#b08a30', '#e8c050', '#ffe08a', '#fff4c0'], ['#2a6a3a', '#4aa05a', '#7ad07a', '#b0f0a0', '#e8ffe0']]));
  add('tile-cap', () => capTile());
  add('tile-pass', () => passTile());
  add('tile-move', () => moveTile());
  add('stage-under', () => stageUnder());
  add('bg-planet', () => planet());
  add('bg-nebula', () => nebula());
  add('bg-stars-a', () => stars(7, 60, 3));
  add('bg-stars-b', () => stars(19, 34, 5));
  add('bg-ruins-far', () => ruins(21, '#2e1f55', '#4a3585', '#241848', ['#ffcf6a', '#7fe8ff'], 0.18, 512, 192));
  add('bg-ruins-near', () => ruins(44, '#1a1033', '#32215e', '#120a26', ['#ffcf6a', '#ff8a5a', '#7fe8ff'], 0.3, 512, 192));
  INDUSTRY_VENTS.length = 0;
  add('bg-industry-far', () => industry(52, '#4a1c14', '#8a3a1c', '#2a0c0a', '#ff8a30', 512, 192, INDUSTRY_VENTS));
  add('bg-industry-near', () => industry(77, '#2a0e0c', '#5a2414', '#160606', '#ffb040', 512, 192));
  add('bg-pylons-far', () => pylons(31, '#1c4a64', '#4a9ac0', '#0e2a3c', '#7ff0ff', 512, 192));
  add('bg-pylons-near', () => pylons(63, '#0e2c42', '#2a6a90', '#08182a', '#bffcff', 512, 192));
  add('bg-clouds', () => cloudStrip());
  add('bg-spires-far', () => spires(11, '#1e3350', '#3e6a96', '#101c30', '#9fd8ff', 512, 192));
  add('bg-spires-near', () => spires(23, '#0f1c30', '#27456a', '#08101e', '#cfeeff', 512, 192));
  add('bg-islands-far', () => islands(5, '#8a6a7a', '#c89aa0', '#5a4256', '#7a9a5a', '#b8d27a', '255,235,215', 512, 192));
  add('bg-islands-near', () => islands(9, '#a07a78', '#e0aa98', '#6a4a5e', '#8aae60', '#c8e088', '255,240,225', 512, 192));
  add('bg-jungle-far', () => ziggurats(14, '#2a4a46', '#4a7a6a', '#1a302e', '#ffb040', 512, 192));
  add('bg-jungle-near', () => canopy(27, '#1e4a2a', '#3a7a3a', '#10301a', '#2a1e14', 512, 192));
  add('bg-mist', () => cloudBank(12, '#7ab0a0', '#b8e0c8', '#4a8070', 512, 128));
  add('bg-cloudsea', () => cloudBank(3, '#f4c8b8', '#fff0e0', '#c48aa0', 512, 128));
  add('bg-cove-far', () => seaStacks(4, '#1e3442', '#3a5a6a', '#0e1c26', '#2e5a4a', '#0e2a3c', '#6a9ab0', 1024, 192));
  add('bg-cove-near', () => wrecks(17, '#2a2420', '#4a3e34', '#140f0c', '#8a8a7a', '#0a2232', '#5a8aa0', '#4ae0d0', 512, 192));
  add('bg-surf', () => surf(6, [['#0e2a40', '#2a5a78', '#6a9ab8'], ['#0a2236', '#2a6a8a', '#9acce0'], ['#071a2a', '#3a7a9a', '#d0f0ff']], 512, 128));
  add('bg-geode-far', () => geodeCave(31, '#1c1428', '#2e2240', '#120c1a', ['#3a1f66', '#7a44c0', '#b07ae8', '#f0e2ff'], 512, 192));
  add('bg-geode-near', () => geodeCave(57, '#100c16', '#1e1828', '#08060c', ['#2a1650', '#6a34a0', '#a868e0', '#f4e8ff'], 512, 192, true));
  add('bg-cavemist', () => cloudBank(19, '#3a2458', '#5a3c80', '#22143a', 512, 128));
  add('bg-stormbank', () => cloudBank(8, '#2e4560', '#5a7a9c', '#16243a', 512, 128));
  add('bg-peaks-far', () => peaks(13, '#3a4a68', '#5a6e90', '#24304a', '#e8f2ff', '#a8bcd8', 512, 192));
  add('bg-shrine-near', () => shrineWoods(29, '#14283a', '#24405a', '#0a1622', '#e8f2ff', '#b02a30', '#6a1418', '#ffd08a', 512, 192));
  add('bg-snowbank', () => cloudBank(23, '#c8d8ec', '#f4f8ff', '#8aa0c0', 512, 128));
  add('bg-thunderheads-far', () => thunderheads(41, '#4e2e5c', '#7a4670', '#b8687a', '#eaa290', 512, 192));
  add('spark', () => sparkTex());
  add('ring', () => ringTex());
  add('bubble', () => bubbleTex());
  add('px', () => {
    const [p, g] = canvas(4, 4);
    px(g, '#ffffff', 0, 0, 4, 4);
    return p;
  });
}
