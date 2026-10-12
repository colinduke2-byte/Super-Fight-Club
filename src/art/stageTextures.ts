import Phaser from 'phaser';

/**
 * All world / background art is generated here at "art pixel" density: 1 art pixel = 0.5 world
 * units, the same density as the 64px character sprites. World textures are drawn at 2x world size
 * and displayed at scale 0.5.
 */

/** Tiny seeded PRNG so generated art is identical every run. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Ctx = CanvasRenderingContext2D;

function canvas(w: number, h: number): [HTMLCanvasElement, Ctx] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
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
function industry(seed: number, body: string, light: string, dark: string, glow: string, W = 512, H = 192): HTMLCanvasElement {
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
  const count = 5;
  for (let n = 0; n < count; n++) {
    const w = 46 + Math.floor(rnd() * 56);
    const topY = 40 + Math.floor(rnd() * 70);
    const cx = Math.floor(((n + 0.3 + rnd() * 0.4) / count) * W);
    wrapX(W, cx, (bx) => {
      const left = bx - Math.floor(w / 2);
      // grass top
      for (let k = 0; k < 8; k++) {
        const ww = w - Math.abs(Math.round(Math.sin(k * 0.9) * 2));
        px(g, k < 2 ? grassL : grass, left + Math.floor((w - ww) / 2), topY + k, ww, 1);
      }
      // rock underside tapering to a point
      const depth = 34 + Math.floor(rnd() * 26);
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

/** Generates all stage / background / effect textures. */
export function buildStageTextures(scene: Phaser.Scene): void {
  const add = (key: string, c: HTMLCanvasElement): void => {
    if (scene.textures.exists(key)) scene.textures.remove(key);
    scene.textures.addCanvas(key, c);
  };
  add('tile-stone', stoneTile());
  const SLATE = ['#0e141c', '#18212d', '#243040', '#32425a', '#44587a', '#5a7298'];
  const SLATE_SEAM = ['#103a5a', '#1c6a9c', '#46a8e8', '#9fd8ff', '#e6f6ff'];
  const MARBLE = ['#a89088', '#c4aea4', '#dccbbc', '#ecdecb', '#f7ecdc', '#fff8ee'];
  const MARBLE_SEAM = ['#6a4a1c', '#b08a30', '#e8c050', '#ffe08a', '#fff4c0'];
  add('tile-stone-storm', stoneTile(SLATE, SLATE_SEAM, 31));
  add('tile-cap-storm', capTile(['#3a4a62', '#566e90', '#8aa6cc', '#2c3a50', '#41546e', '#1c2636', '#9fbfe8', '#18202e', '#10161f', '#0a0f18'], SLATE_SEAM));
  add('tile-pass-storm', cloudPass('#e8f2ff', '#b6c9e2', '#7e98bc', '#cfeaff'));
  add('tile-move-storm', cloudPass('#cfdcf0', '#8a9fc0', '#56688a', '#ffffff'));
  add('stage-under-storm', stageUnder(SLATE, [SLATE_SEAM, ['#103a5a', '#1c6a9c', '#46a8e8', '#9fd8ff', '#e6f6ff']]));
  add('tile-stone-dawn', stoneTile(MARBLE, MARBLE_SEAM, 41));
  add('tile-cap-dawn', capTile(['#d8c4a4', '#ecdcbc', '#fff4d8', '#bca480', '#d0b890', '#8a7250', '#fff0c0', '#6a5638', '#4a3a24', '#3a2c1a'], MARBLE_SEAM));
  add('tile-pass-dawn', woodPass());
  add('tile-move-dawn', cloudPass('#fff0e0', '#f4c8b8', '#c48aa0', '#ffffff'));
  add('stage-under-dawn', stageUnder(MARBLE.map((c) => c).reverse().map((_, i) => ['#6a4a52', '#8a6a6c', '#a88884', '#c4a6a0', '#dcc4b8', '#f0dcd0'][i]), [['#6a4a1c', '#b08a30', '#e8c050', '#ffe08a', '#fff4c0'], ['#2a6a3a', '#4aa05a', '#7ad07a', '#b0f0a0', '#e8ffe0']]));
  add('tile-cap', capTile());
  add('tile-pass', passTile());
  add('tile-move', moveTile());
  add('stage-under', stageUnder());
  add('bg-planet', planet());
  add('bg-nebula', nebula());
  add('bg-stars-a', stars(7, 60, 3));
  add('bg-stars-b', stars(19, 34, 5));
  add('bg-ruins-far', ruins(21, '#2e1f55', '#4a3585', '#241848', ['#ffcf6a', '#7fe8ff'], 0.18, 512, 192));
  add('bg-ruins-near', ruins(44, '#1a1033', '#32215e', '#120a26', ['#ffcf6a', '#ff8a5a', '#7fe8ff'], 0.3, 512, 192));
  add('bg-industry-far', industry(52, '#4a1c14', '#8a3a1c', '#2a0c0a', '#ff8a30', 512, 192));
  add('bg-industry-near', industry(77, '#2a0e0c', '#5a2414', '#160606', '#ffb040', 512, 192));
  add('bg-pylons-far', pylons(31, '#1c4a64', '#4a9ac0', '#0e2a3c', '#7ff0ff', 512, 192));
  add('bg-pylons-near', pylons(63, '#0e2c42', '#2a6a90', '#08182a', '#bffcff', 512, 192));
  add('bg-clouds', cloudStrip());
  add('bg-spires-far', spires(11, '#1e3350', '#3e6a96', '#101c30', '#9fd8ff', 512, 192));
  add('bg-spires-near', spires(23, '#0f1c30', '#27456a', '#08101e', '#cfeeff', 512, 192));
  add('bg-islands-far', islands(5, '#8a6a7a', '#c89aa0', '#5a4256', '#7a9a5a', '#b8d27a', '255,235,215', 512, 192));
  add('bg-islands-near', islands(9, '#a07a78', '#e0aa98', '#6a4a5e', '#8aae60', '#c8e088', '255,240,225', 512, 192));
  add('bg-cloudsea', cloudBank(3, '#f4c8b8', '#fff0e0', '#c48aa0', 512, 128));
  add('bg-stormbank', cloudBank(8, '#2e4560', '#5a7a9c', '#16243a', 512, 128));
  add('spark', sparkTex());
  add('ring', ringTex());
  add('bubble', bubbleTex());
  const [p, g] = canvas(4, 4);
  px(g, '#ffffff', 0, 0, 4, 4);
  add('px', p);
}
