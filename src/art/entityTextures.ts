import Phaser from 'phaser';
import { addCanvasTexture, context2dOrBlank } from './canvasTexture';

/**
 * Projectile / deployable textures, drawn in light greys so the data's `look.color` tints them.
 * Drawn at 2x density (1 art pixel = 0.5 world units) like the rest of the world art.
 */
type Ctx = CanvasRenderingContext2D;

function mk(w: number, h: number): [HTMLCanvasElement, Ctx] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = context2dOrBlank(c);
  g.imageSmoothingEnabled = false;
  return [c, g];
}
const px = (g: Ctx, c: string, x: number, y: number, w = 1, h = 1): void => {
  g.fillStyle = c;
  g.fillRect(Math.round(x), Math.round(y), w, h);
};

export function buildEntityTextures(scene: Phaser.Scene): void {
  const add = (key: string, c: HTMLCanvasElement): void => {
    if (scene.textures.exists(key)) scene.textures.remove(key);
    addCanvasTexture(scene, key, c);
  };

  buildItemArt(add);
  buildProjectileArt(add);

  // orb 16x16: bright core, mid body, dithered rim
  {
    const [c, g] = mk(16, 16);
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        const d = Math.hypot(x - 7.5, y - 7.5);
        if (d > 7.5) continue;
        const dith = (x + y) % 2 === 0;
        px(g, d < 2.5 ? '#ffffff' : d < 4.5 ? '#e8e8f0' : d < 6.3 ? '#a8a8c0' : dith ? '#6a6a88' : '#8a8aa8', x, y);
      }
    }
    add('proj-orb', c);
  }
  // bolt 24x8: pointed head, fading tail
  {
    const [c, g] = mk(24, 8);
    for (let x = 0; x < 24; x++) {
      const t = x / 23;
      const half = Math.max(0, Math.round(3.4 * Math.sin(Math.min(1, t * 1.2) * Math.PI * 0.5) * (t > 0.8 ? (1 - t) * 5 : 1)));
      for (let y = 4 - half; y < 4 + half; y++) px(g, t > 0.6 ? '#ffffff' : t > 0.3 ? '#cfcfe0' : '#8a8aa8', x, y);
    }
    add('proj-bolt', c);
  }
  // crystal shard 20x10: a faceted spike pointing forward (light top facet, darker underside, a white edge)
  {
    const [c, g] = mk(20, 10);
    for (let x = 0; x < 20; x++) {
      const half = x < 14 ? 4 - Math.abs(x - 7) * 0.12 : (19 - x) * 0.8; // a long prism ending in a point
      for (let y = 0; y < 10; y++) {
        const dy = y - 4.5;
        if (Math.abs(dy) > half + 0.3) continue;
        const shade = dy < -0.5 ? '#ffffff' : dy < 1 ? '#d8d8e8' : '#9a9ab8';
        px(g, x > 16 ? '#ffffff' : shade, x, y);
      }
    }
    px(g, '#ffffff', 2, 3, 12, 1);
    add('proj-shard', c);
  }
  // ground shockwave 36x22: a crest of force rolling forward (tall, bright front; a low trailing tail) with rubble kicked up
  {
    const [c, g] = mk(36, 22);
    for (let x = 0; x < 36; x++) {
      const t = x / 35;
      const top = Math.round(21 - (t < 0.82 ? 4 + 15 * t * t : 16 * (1 - t) / 0.18 * 1.1)); // rises toward the front, drops at the lip
      for (let y = Math.max(1, top); y < 22; y++) {
        const depth = (y - top) / Math.max(1, 21 - top);
        px(g, depth < 0.18 ? '#ffffff' : depth < 0.5 ? '#e0e0ec' : (x + y) % 3 === 0 ? '#7a7a98' : '#a8a8c0', x, y);
      }
    }
    // rubble chips flying off the crest
    for (const [x, y] of [[26, 3], [30, 1], [21, 6], [33, 5], [17, 9]] as const) px(g, '#c8c8d8', x, y, 2, 2);
    add('proj-wave', c);
  }
  // bullet 10x6
  {
    const [c, g] = mk(10, 6);
    px(g, '#8a8aa8', 0, 1, 10, 4);
    px(g, '#d8d8e8', 1, 1, 8, 2);
    px(g, '#ffffff', 5, 1, 4, 1);
    px(g, '#ffffff', 9, 2, 1, 2);
    add('proj-bullet', c);
  }
  // fist 16x14
  {
    const [c, g] = mk(16, 14);
    px(g, '#5a5a78', 0, 1, 15, 12);
    px(g, '#a8a8c8', 1, 1, 14, 10);
    px(g, '#e0e0f0', 1, 1, 14, 2);
    for (let k = 0; k < 3; k++) px(g, '#5a5a78', 4 + k * 4, 4, 1, 6);
    add('proj-fist', c);
  }
  // beam 64x32: soft glowing bolt, bright head on the right fading into a tail on the left (tinted + additive in the view)
  {
    const [c, g] = mk(64, 32);
    for (let x = 0; x < 64; x++) {
      const along = Math.pow(x / 63, 0.7); // 0 at the tail .. 1 at the head
      for (let y = 0; y < 32; y++) {
        const d = Math.abs(y - 15.5) / 15.5; // 0 centre .. 1 edge
        const band = d < 0.22 ? 1 : d < 0.55 ? 0.62 : d < 0.85 ? 0.28 : 0.08;
        const a = Math.min(1, band * along * 1.15);
        if (a < 0.03) continue;
        const v = d < 0.22 ? 255 : d < 0.55 ? 230 : 200;
        g.fillStyle = `rgba(${v},${v},${v},${a.toFixed(2)})`;
        g.fillRect(x, y, 1, 1);
      }
    }
    add('proj-beam', c);
  }
  // mine 20x12
  {
    const [c, g] = mk(20, 12);
    for (let y = 0; y < 12; y++) {
      for (let x = 0; x < 20; x++) {
        const dx = (x - 9.5) / 9.5;
        const dy = (y - 11) / 10;
        if (dx * dx + dy * dy <= 1 && y <= 11) px(g, y < 4 ? '#e0e0f0' : y < 8 ? '#a8a8c8' : '#6a6a88', x, y);
      }
    }
    px(g, '#3a3a52', 2, 10, 16, 2);
    for (const x of [3, 9, 15]) px(g, '#e0e0f0', x, 0, 2, 2);
    add('dep-mine', c);
  }
  // soft radial halo 32x32 behind item pickups (tinted per kind, drawn additively)
  {
    const [c, g] = mk(32, 32);
    for (let y = 0; y < 32; y++) {
      for (let x = 0; x < 32; x++) {
        const d = Math.hypot(x - 15.5, y - 15.5) / 15.5;
        if (d >= 1) continue;
        g.fillStyle = `rgba(255,255,255,${((1 - d) ** 2 * 0.9).toFixed(3)})`;
        g.fillRect(x, y, 1, 1);
      }
    }
    add('item-glow', c);
  }
  // mine blinking light 4x4
  {
    const [c, g] = mk(4, 4);
    px(g, '#ffffff', 0, 0, 4, 4);
    add('dep-light', c);
  }
  // turret 28x26: base + dome + barrel to the right
  {
    const [c, g] = mk(28, 26);
    px(g, '#4a4a64', 3, 20, 20, 6);
    px(g, '#8a8aa8', 3, 20, 20, 2);
    px(g, '#6a6a88', 6, 12, 14, 9);
    px(g, '#c8c8e0', 6, 12, 14, 3);
    px(g, '#8a8aa8', 20, 14, 8, 4); // barrel
    px(g, '#e0e0f0', 20, 14, 8, 1);
    px(g, '#ffffff', 11, 16, 4, 3); // eye
    px(g, '#3a3a52', 4, 24, 18, 2);
    add('dep-turret', c);
  }
  // rune 32x12 sigil
  {
    const [c, g] = mk(32, 12);
    for (let a = 0; a < Math.PI * 2; a += 0.02) {
      px(g, '#ffffff', 16 + Math.cos(a) * 14.5, 6 + Math.sin(a) * 4.5);
      px(g, '#b8b8d0', 16 + Math.cos(a) * 11.5, 6 + Math.sin(a) * 3.2);
    }
    px(g, '#ffffff', 15, 2, 2, 8);
    px(g, '#ffffff', 11, 5, 10, 2);
    add('dep-rune', c);
  }
  // marker 16x16: diamond with inner glow
  {
    const [c, g] = mk(16, 16);
    for (let y = 0; y < 16; y++) {
      const w = y < 8 ? y : 15 - y;
      px(g, w > 4 ? '#ffffff' : w > 2 ? '#d8d8f0' : '#8a8aa8', 7.5 - w, y, w * 2 + 1, 1);
    }
    px(g, '#ffffff', 7, 7, 2, 2);
    add('dep-marker', c);
  }
  // whirlpool 40x14: a flattened spiral of foam rings (tinted by the deployable colour)
  {
    const [c, g] = mk(40, 14);
    for (let a = 0; a < Math.PI * 6; a += 0.03) {
      const r = 3 + (a / (Math.PI * 6)) * 16.5;
      const shade = a > Math.PI * 4 ? '#ffffff' : a > Math.PI * 2 ? '#c8d8f0' : '#8a9ac0';
      px(g, shade, 20 + Math.cos(a) * r, 7 + Math.sin(a) * r * 0.32);
    }
    px(g, '#ffffff', 18, 6, 4, 2);
    add('dep-whirlpool', c);
  }
  buildFxTextures(add);

  // ice patch 96x10 (drawn at 0.5 scale: 48x5 world units): a glossy sheet of ice with highlights and a frosted rim
  {
    const [c, g] = mk(96, 10);
    for (let x = 0; x < 96; x++) {
      const edge = Math.min(x, 95 - x);
      const top = edge < 6 ? 6 - edge : edge < 10 ? 1 : 0; // tapered ends
      for (let y = 3 + Math.min(3, top); y < 10; y++) px(g, y === 3 + Math.min(3, top) ? '#ffffff' : y < 6 ? '#dcecf6' : (x + y) % 4 === 0 ? '#a8bcd0' : '#c4d6e6', x, y);
    }
    for (const x of [14, 30, 52, 70, 84]) px(g, '#ffffff', x, 5, 6, 1); // glossy streaks
    for (const x of [8, 40, 62, 90]) px(g, '#ffffff', x, 2, 1, 2); // frost crystals on the rim
    add('dep-icepatch', c);
  }
}

/**
 * Impact / particle textures for the effects layer, all white (tinted per use, drawn additively):
 * - fx-glow   64x64  smooth radial bloom (the soft light under every flash)
 * - fx-star   64x64  eight-point hit star: four long razor spikes, four short diagonals, a hot core
 * - fx-impact 64x64  jagged comic-book burst (heavy hits): uneven spikes round a hollow, hotter rim
 * - fx-ring   64x64  shockwave ring: a crisp bright leading edge with a soft glow trailing inside (fx-ring-l: 192x192 for big ones)
 * - fx-streak 16x4   a spark streak (bright head on the right, tapering tail), stretched along a particle's velocity
 * - fx-smoke  32x32  a soft lumpy puff (normal blend, tinted dark) for KO / blast smoke
 */
function buildFxTextures(add: (key: string, c: HTMLCanvasElement) => void): void {
  const rgba = (g: Ctx, x: number, y: number, a: number): void => {
    if (a <= 0.004) return;
    g.fillStyle = `rgba(255,255,255,${Math.min(1, a).toFixed(3)})`;
    g.fillRect(x, y, 1, 1);
  };
  {
    const [c, g] = mk(64, 64);
    for (let y = 0; y < 64; y++) {
      for (let x = 0; x < 64; x++) {
        const d = Math.hypot(x - 31.5, y - 31.5) / 31.5;
        if (d >= 1) continue;
        rgba(g, x, y, Math.pow(1 - d, 2.2) * 0.95 + (d < 0.12 ? 0.05 : 0));
      }
    }
    add('fx-glow', c);
  }
  {
    const [c, g] = mk(64, 64);
    for (let y = 0; y < 64; y++) {
      for (let x = 0; x < 64; x++) {
        const dx = x - 31.5;
        const dy = y - 31.5;
        const r = Math.hypot(dx, dy);
        const ang = Math.atan2(dy, dx);
        // spike profile: long on the axes, short on the diagonals; a spike is thin far out and fat near the core
        const ax = Math.abs(Math.cos(ang * 2)); // 1 on the axes and diagonals, 0 between
        const onAxis = Math.abs(Math.cos(ang)) > 0.92 || Math.abs(Math.sin(ang)) > 0.92;
        const len = onAxis ? 31 : 17;
        const w = Math.pow(ax, onAxis ? 26 : 34); // narrowness of each spike
        const reach = len * w;
        let a = r < reach ? 1 - (r / Math.max(1, reach)) * 0.55 : 0;
        if (r < 5) a = 1;
        else if (r < 9) a = Math.max(a, 1 - (r - 5) / 4);
        rgba(g, x, y, a);
      }
    }
    add('fx-star', c);
  }
  {
    const [c, g] = mk(64, 64);
    // fixed jagged silhouette: 14 spikes of irregular length (deterministic, so every heavy hit is the same crisp shape)
    const N = 14;
    const spike = Array.from({ length: N }, (_, i) => 0.62 + 0.38 * (((i * 7) % 5) / 4) * (i % 2 ? 0.7 : 1));
    for (let y = 0; y < 64; y++) {
      for (let x = 0; x < 64; x++) {
        const dx = x - 31.5;
        const dy = y - 31.5;
        const r = Math.hypot(dx, dy) / 31.5;
        let ang = Math.atan2(dy, dx) / (Math.PI * 2);
        if (ang < 0) ang += 1;
        const f = ang * N;
        const i0 = Math.floor(f) % N;
        const t = f - Math.floor(f);
        // a zigzag edge: spike tips at the integer angles, valleys between them
        const e = t < 0.5 ? 0.4 + (spike[i0] - 0.4) * (1 - 2 * t) : 0.4 + (spike[(i0 + 1) % N] - 0.4) * (2 * t - 1);
        if (r > e) continue;
        // hollow centre fades in toward the rim: the burst reads as a shape, not a blob
        const rim = r / e;
        const a = rim < 0.55 ? 0 : rim < 0.85 ? (rim - 0.55) / 0.3 : 1;
        rgba(g, x, y, a);
      }
    }
    add('fx-impact', c);
  }
  // shockwave rings: 64 px for small ones and a 192 px one for big ones (same proportions: edge radius = size * 0.461), so a
  // large ring keeps a smooth curve and a thin edge instead of scaling up a staircase
  for (const [key, S, edge, glow] of [['fx-ring', 64, 1.5, 6], ['fx-ring-l', 192, 2.2, 14]] as const) {
    const [c, g] = mk(S, S);
    const R = S * 0.461;
    const mid = (S - 1) / 2;
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const d = Math.hypot(x - mid, y - mid) - R;
        // a bright edge, a faint glow falling off inward and a hair outward
        const a = d > 1.5 ? 0 : d > 0 ? 1 - d / 1.5 : d > -edge ? 1 : Math.max(0, 0.32 * (1 + (d + edge) / glow));
        rgba(g, x, y, a);
      }
    }
    add(key, c);
  }
  {
    const [c, g] = mk(16, 4);
    for (let x = 0; x < 16; x++) {
      const t = x / 15; // 0 tail .. 1 head
      for (let y = 0; y < 4; y++) {
        const core = y === 1 || y === 2;
        const a = core ? 0.15 + 0.85 * t * t : t > 0.6 ? (t - 0.6) * 1.2 : 0;
        rgba(g, x, y, a);
      }
    }
    add('fx-streak', c);
  }
  {
    const [c, g] = mk(32, 32);
    const lumps = [[15, 16, 10], [10, 13, 7], [21, 12, 7], [20, 20, 8], [11, 21, 6]] as const;
    for (let y = 0; y < 32; y++) {
      for (let x = 0; x < 32; x++) {
        let a = 0;
        for (const [lx, ly, lr] of lumps) {
          const d = Math.hypot(x - lx, y - ly) / lr;
          if (d < 1) a = Math.max(a, (1 - d * d) * 0.9);
        }
        rgba(g, x, y, a);
      }
    }
    add('fx-smoke', c);
  }
}

/**
 * A crystal pillar `w` x `h` world units (drawn at 2 px per unit): an amethyst column with lit facets, a bright flat top
 * you can stand on, glints and a glowing inner vein, rising out of a jagged granite collar.
 */
export function pillarCanvas(w: number, h: number, crystal = '#9a5ad6'): HTMLCanvasElement {
  const W = Math.round(w * 2);
  const H = Math.round(h * 2);
  const [c, g] = mk(W, H);
  // the crystal ramp is built from one colour, so a palette swap recolours its pillars
  const n = parseInt(crystal.slice(1), 16);
  const rgb: [number, number, number] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  const hexOf = (k: number, white: number): string => '#' + rgb.map((v) => Math.round(Math.min(255, v * k + (255 - v * k) * white)).toString(16).padStart(2, '0')).join('');
  const AM = [hexOf(0.22, 0), hexOf(0.4, 0), hexOf(0.68, 0), hexOf(1, 0), hexOf(1, 0.42), hexOf(1, 0.82)];
  const GR = ['#2a2522', '#3e3833', '#585049', '#746a60'];
  for (let y = 0; y < H; y++) {
    const collar = H - 10;
    for (let x = 0; x < W; x++) {
      const u = x / (W - 1);
      // granite collar at the base, its top edge jagged
      const jag = H - 12 - ((x * 7) % 5) - ((x * 13) % 3);
      if (y >= jag && y >= collar - 6) {
        const k = y === jag ? 3 : u < 0.25 ? 2 : u > 0.8 ? 0 : 1;
        px(g, GR[k], x, y);
        continue;
      }
      let k = u < 0.16 ? 4 : u < 0.58 ? 3 : u < 0.84 ? 2 : 1;
      if (x === 0 || x === W - 1) k = 0;
      if (y === 0) k = 5;
      else if (y < 3) k = Math.max(k, 4);
      else if (y === 3) k = 1; // a crisp shadow under the lit top edge
      if ((x * 3 + y * 2) % 41 === 0 && y > 4) k = 5; // glints
      if (y > 4 && (u === 0.58 || Math.abs(u - 0.58) < 1 / W)) k = 1; // facet seam
      px(g, AM[k], x, y);
    }
  }
  // a glowing vein wandering up the middle
  let vx = Math.round(W * 0.42);
  for (let y = H - 14; y > 5; y--) {
    px(g, AM[5], vx, y);
    if ((y * 7) % 9 === 0) vx += (y * 5) % 2 === 0 ? 1 : -1;
    vx = Math.max(3, Math.min(W - 4, vx));
  }
  return c;
}

// ================================================================================================
// Shaded sprite art: projectiles, deployables and items drawn at fighter pixel density, lit from the upper left.
// Every shape is evaluated per pixel (so curves stay crisp) and gets a 1 px ink outline like the fighters.
// ================================================================================================

/** Art pixels per world unit for projectile / deployable art (fighters draw at ~3.45). Display scale = 1 / ART_D. */
export const ART_D = 3.5;
/** Item textures are 40 px (the crate 64 px) and display at this scale. */
export const ITEM_SCALE = 0.32;
export const CRATE_SCALE = 0.3;

type RGB = readonly [number, number, number];
type Pt = readonly [number, number];
const rgb = (h: string): RGB => {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const R = (...h: string[]): RGB[] => h.map(rgb);
const INK = rgb('#120e1c');

const LIGHT = ((): [number, number, number] => {
  const l = Math.hypot(-0.45, -0.72, 0.53);
  return [-0.45 / l, -0.72 / l, 0.53 / l];
})();
const HALF_V = ((): [number, number, number] => {
  const x = LIGHT[0];
  const y = LIGHT[1];
  const z = LIGHT[2] + 1;
  const l = Math.hypot(x, y, z);
  return [x / l, y / l, z / l];
})();
/** Brightness 0..1+ of a surface normal: ambient + diffuse + a tight specular. */
function lum(nx: number, ny: number, nz: number): number {
  const l = Math.hypot(nx, ny, nz) || 1;
  nx /= l;
  ny /= l;
  nz /= l;
  const d = Math.max(0, nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2]);
  const h = Math.max(0, nx * HALF_V[0] + ny * HALF_V[1] + nz * HALF_V[2]);
  return 0.14 + 0.72 * d + 0.45 * Math.pow(h, 28);
}
const tone = (r: readonly RGB[], b: number): RGB => r[Math.max(0, Math.min(r.length - 1, Math.floor(b * r.length)))];
/** Deterministic value noise in 0..1 (presentation only). */
function noise(x: number, y: number, s = 0): number {
  const h = Math.sin(x * 127.1 + y * 311.7 + s * 74.7) * 43758.5453;
  return h - Math.floor(h);
}
function inPoly(pts: readonly Pt[], u: number, v: number): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i];
    const [xj, yj] = pts[j];
    if (yi > v !== yj > v && u < ((xj - xi) * (v - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// shared ramps (dark -> light)
const STEEL = R('#262a36', '#4a5266', '#7a849c', '#b4bed2', '#eef2fa');
const DSTEEL = R('#14161e', '#262a36', '#3e4456', '#5e6680', '#9aa2bc');
const GIZ = R('#4a1e08', '#8e4210', '#d0721e', '#f4a446', '#ffdca0');
const OLIVE = R('#1e2410', '#38421e', '#56632e', '#7a8a44', '#b4c27a');
const SHELL = R('#1e2018', '#3a3e30', '#5a604a', '#848a6a', '#c0c6a0');
const TAN = R('#4a3a22', '#7a6440', '#a89060', '#d4bc8a', '#f4e6c0');
const RED = R('#3a0a10', '#7a1420', '#c02a30', '#ec5a50', '#ffb0a0');
const WHITE = R('#5a5e6e', '#9298aa', '#c8ccd8', '#eceef4', '#ffffff');
const CYAN = R('#08303e', '#0e6a86', '#1aa8d0', '#5ae0ff', '#d0faff');
const ICE = R('#1e4a72', '#3a7ab0', '#6ab8e6', '#b4e6ff', '#ffffff');
const WATER = R('#0a2a5a', '#145a9a', '#2a8ad0', '#5ac0f0', '#c8f0ff');
const VIOLET = R('#2a0e4a', '#4e1e86', '#8040c8', '#b47aff', '#ecd8ff');
const GOLD = R('#4a2c0c', '#8a5a1a', '#c8902e', '#efc35a', '#fff0b0');
const WOOD = R('#2e1a0c', '#5a3618', '#8a5a2a', '#b8823e', '#e0b070');

class Painter {
  readonly r: Float32Array;
  readonly g: Float32Array;
  readonly b: Float32Array;
  readonly a: Float32Array;
  /** Emissive pixels: never outlined. */
  readonly glow: Uint8Array;
  constructor(
    readonly w: number,
    readonly h: number,
  ) {
    const n = w * h;
    this.r = new Float32Array(n);
    this.g = new Float32Array(n);
    this.b = new Float32Array(n);
    this.a = new Float32Array(n);
    this.glow = new Uint8Array(n);
  }
  put(x: number, y: number, c: RGB, a = 1, glow = false): void {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h || a <= 0.004) return;
    a = Math.min(1, a);
    const i = y * this.w + x;
    const ea = this.a[i];
    const na = a + ea * (1 - a);
    const k = ea * (1 - a);
    this.r[i] = (c[0] * a + this.r[i] * k) / na;
    this.g[i] = (c[1] * a + this.g[i] * k) / na;
    this.b[i] = (c[2] * a + this.b[i] * k) / na;
    this.a[i] = na;
    if (glow) {
      if (ea < 0.5) this.glow[i] = 1;
    } else if (a >= 0.5) this.glow[i] = 0;
  }
  each(x0: number, y0: number, x1: number, y1: number, fn: (x: number, y: number, u: number, v: number) => void): void {
    const xa = Math.max(0, Math.floor(x0));
    const ya = Math.max(0, Math.floor(y0));
    const xb = Math.min(this.w - 1, Math.ceil(x1));
    const yb = Math.min(this.h - 1, Math.ceil(y1));
    for (let y = ya; y <= yb; y++) for (let x = xa; x <= xb; x++) fn(x, y, x + 0.5, y + 0.5);
  }
  /** A lit ellipsoid (sphere-like bulge). */
  ball(cx: number, cy: number, rx: number, ry: number, ramp: readonly RGB[], glow = false, alpha = 1): void {
    this.each(cx - rx, cy - ry, cx + rx, cy + ry, (x, y, u, v) => {
      const dx = (u - cx) / rx;
      const dy = (v - cy) / ry;
      const d2 = dx * dx + dy * dy;
      if (d2 > 1) return;
      this.put(x, y, tone(ramp, lum(dx, dy, Math.sqrt(1 - d2))), alpha, glow);
    });
  }
  /** A body of revolution along x from x0 to x1 around cy, radius rad(t) for t 0..1. */
  tube(x0: number, x1: number, cy: number, rad: (t: number) => number, ramp: readonly RGB[], glow = false): void {
    let mr = 0;
    for (let k = 0; k <= 20; k++) mr = Math.max(mr, rad(k / 20));
    const len = x1 - x0;
    this.each(x0, cy - mr, x1, cy + mr, (x, y, u, v) => {
      const t = (u - x0) / len;
      if (t < 0 || t > 1) return;
      const r = rad(t);
      const dy = (v - cy) / Math.max(0.01, r);
      if (r <= 0 || Math.abs(dy) > 1) return;
      const slope = (rad(Math.min(1, t + 0.02)) - rad(Math.max(0, t - 0.02))) / (0.04 * len);
      const nz = Math.sqrt(1 - dy * dy);
      this.put(x, y, tone(ramp, lum(-slope * nz, dy, nz)), 1, glow);
    });
  }
  /** A vertical cylinder from y0 to y1 around cx. */
  tubeY(y0: number, y1: number, cx: number, r: number, ramp: readonly RGB[], glow = false): void {
    this.each(cx - r, y0, cx + r, y1, (x, y, u, v) => {
      if (v < y0 || v > y1) return;
      const dx = (u - cx) / r;
      if (Math.abs(dx) > 1) return;
      this.put(x, y, tone(ramp, lum(dx, -0.12, Math.sqrt(1 - dx * dx))), 1, glow);
    });
  }
  /** A bevelled box with rounded corners: flat face, lit bevels. */
  box(x0: number, y0: number, x1: number, y1: number, bevel: number, ramp: readonly RGB[], corner = bevel): void {
    const mx = (x0 + x1) / 2;
    const my = (y0 + y1) / 2;
    this.each(x0, y0, x1, y1, (x, y, u, v) => {
      if (u < x0 || u > x1 || v < y0 || v > y1) return;
      const ex = Math.min(u - x0, x1 - u);
      const ey = Math.min(v - y0, y1 - v);
      if (ex < corner && ey < corner && Math.hypot(corner - ex, corner - ey) > corner) return;
      const nx = ex < bevel ? Math.sign(u - mx) * (1 - ex / bevel) : 0;
      const ny = ey < bevel ? Math.sign(v - my) * (1 - ey / bevel) : 0;
      this.put(x, y, tone(ramp, lum(nx, ny, 1)));
    });
  }
  /** A filled polygon: a flat colour, a ramp lit by a facet normal, or a per-pixel shader. */
  poly(pts: readonly Pt[], fill: RGB | ((u: number, v: number) => RGB | null), alpha = 1, glow = false): void {
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const [x, y] of pts) {
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x);
      y1 = Math.max(y1, y);
    }
    this.each(x0, y0, x1, y1, (x, y, u, v) => {
      if (!inPoly(pts, u, v)) return;
      const c = typeof fill === 'function' ? fill(u, v) : fill;
      if (c) this.put(x, y, c, alpha, glow);
    });
  }
  facet(pts: readonly Pt[], ramp: readonly RGB[], nx: number, ny: number, nz = 1): void {
    this.poly(pts, tone(ramp, lum(nx, ny, nz)));
  }
  line(x0: number, y0: number, x1: number, y1: number, wd: number, c: RGB, alpha = 1, glow = false): void {
    const r = wd / 2;
    const dx = x1 - x0;
    const dy = y1 - y0;
    const l2 = dx * dx + dy * dy || 1;
    this.each(Math.min(x0, x1) - r, Math.min(y0, y1) - r, Math.max(x0, x1) + r, Math.max(y0, y1) + r, (x, y, u, v) => {
      const t = Math.max(0, Math.min(1, ((u - x0) * dx + (v - y0) * dy) / l2));
      if (Math.hypot(u - x0 - dx * t, v - y0 - dy * t) <= r) this.put(x, y, c, alpha, glow);
    });
  }
  path(pts: readonly Pt[], wd: number, c: RGB, alpha = 1, glow = false): void {
    for (let i = 1; i < pts.length; i++) this.line(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1], wd, c, alpha, glow);
  }
  /** Soft emissive bloom (no outline). */
  halo(cx: number, cy: number, rx: number, c: RGB, amax: number, ry = rx): void {
    this.each(cx - rx, cy - ry, cx + rx, cy + ry, (x, y, u, v) => {
      const d = Math.hypot((u - cx) / rx, (v - cy) / ry);
      if (d < 1) this.put(x, y, c, (1 - d) * (1 - d) * amax, true);
    });
  }
  /** Four-point twinkle. */
  twinkle(cx: number, cy: number, s: number, c: RGB): void {
    for (let k = -s; k <= s; k++) {
      const a = 1 - Math.abs(k) / (s + 1);
      this.put(cx + k, cy, c, a, true);
      this.put(cx, cy + k, c, a, true);
    }
  }
  canvas(ink: RGB | null = INK): HTMLCanvasElement {
    const { w, h } = this;
    const [c, g] = mk(w, h);
    const img = g.createImageData(w, h);
    const d = img.data;
    const solid = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < w && y < h && this.a[y * w + x] >= 0.6 && !this.glow[y * w + x];
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        let r = this.r[i];
        let gg = this.g[i];
        let b = this.b[i];
        let a = this.a[i];
        if (ink && a < 0.35 && (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1))) {
          [r, gg, b] = ink;
          a = 1;
        }
        d[i * 4] = r;
        d[i * 4 + 1] = gg;
        d[i * 4 + 2] = b;
        d[i * 4 + 3] = Math.round(a * 255);
      }
    }
    g.putImageData(img, 0, 0);
    return c;
  }
}

/** Emissive colour by heat 0..1 (fire). */
function fireHeat(h: number): RGB {
  return h > 0.78 ? rgb('#fffbe0') : h > 0.58 ? rgb('#ffe066') : h > 0.4 ? rgb('#ffa02a') : h > 0.22 ? rgb('#f05a14') : rgb('#a0200c');
}
/** Exhaust flame from x0 (tip) to x1 (nozzle) around cy, max half-height hh. */
function exhaust(P: Painter, x0: number, x1: number, cy: number, hh: number, seed = 0): void {
  P.halo((x0 + x1) / 2, cy, (x1 - x0) * 0.75, rgb('#ff9a3a'), 0.4, hh * 1.6);
  P.each(x0, cy - hh, x1, cy + hh, (x, y, u, v) => {
    const t = (u - x0) / (x1 - x0); // 0 tip .. 1 nozzle
    const half = hh * Math.pow(t, 0.7) * (0.85 + 0.3 * noise(Math.floor(u / 2), seed));
    const dy = Math.abs(v - cy);
    if (dy > half) return;
    const heat = (1 - dy / Math.max(0.5, half)) * (0.35 + 0.75 * t);
    P.put(x, y, fireHeat(heat), Math.min(1, 0.35 + t), true);
  });
}

// ---- projectiles ------------------------------------------------------------------------------

function artJavelin(): HTMLCanvasElement {
  const P = new Painter(108, 24);
  const cy = 12;
  P.halo(92, cy, 16, rgb('#fff2a0'), 0.35, 10);
  // a sky-blue pennant streaming off the butt
  P.poly([[1, cy - 4], [11, cy - 2], [11, cy + 1], [3, cy + 2], [6, cy - 1]], rgb('#6ad0ff'));
  P.poly([[2, cy + 1], [11, cy], [11, cy + 2], [4, cy + 6]], rgb('#3a8ad8'));
  P.tube(8, 80, cy, () => 2.2, GOLD);
  for (let x = 30; x < 46; x += 3) P.tube(x, x + 1.4, cy, () => 2.5, TAN);
  P.tube(7, 11, cy, () => 3, GOLD);
  P.tube(75, 81, cy, (t) => 3.4 - t * 0.6, GOLD);
  const HEAD = R('#6a4a10', '#b8862a', '#e8c050', '#fbe490', '#ffffff');
  P.each(80, 0, 107, 24, (x, y, u, v) => {
    const t = (u - 80) / 26;
    if (t < 0 || t > 1) return;
    const hw = t < 0.3 ? 2.5 + (t / 0.3) * 3.5 : 6 * Math.pow(1 - (t - 0.3) / 0.7, 0.9);
    const dy = v - cy;
    if (Math.abs(dy) > hw) return;
    const k = dy < -0.6 ? (dy < -hw * 0.55 ? 3 : 4) : dy < 0.6 ? 4 : dy > hw * 0.55 ? 1 : 2;
    P.put(x, y, HEAD[k]);
  });
  P.twinkle(100, cy - 4, 3, rgb('#ffffff'));
  return P.canvas();
}

function artKunai(): HTMLCanvasElement {
  const P = new Painter(48, 16);
  const cy = 8;
  // ring pommel
  P.each(0, cy - 4, 10, cy + 4, (x, y, u, v) => {
    const dx = u - 5;
    const dy = v - cy;
    const d = Math.hypot(dx, dy);
    if (d > 3.7 || d < 1.7) return;
    P.put(x, y, tone(STEEL, lum(dx / d, dy / d, 0.6)));
  });
  P.tube(8, 22, cy, () => 2, R('#0e1c30', '#1c3456', '#2e5486', '#4a7ab0', '#8ab4e0'));
  P.each(9, cy - 2, 21, cy + 2, (x, y) => {
    if ((x + y) % 4 === 0) P.put(x, y, rgb('#0a1424'));
  });
  P.each(20, 0, 47, 16, (x, y, u, v) => {
    const t = (u - 21) / 26;
    if (t < 0 || t > 1) return;
    const hw = t < 0.28 ? 1.8 + (t / 0.28) * 3.4 : 5.2 * (1 - (t - 0.28) / 0.72);
    const dy = v - cy;
    if (Math.abs(dy) > hw) return;
    let c = dy < -0.5 ? STEEL[3] : dy < 0.5 ? STEEL[4] : STEEL[1];
    if (Math.abs(dy) > hw - 0.9) c = dy < 0 ? rgb('#dff6ff') : rgb('#8ad0f0'); // frosted edge
    P.put(x, y, c);
  });
  P.twinkle(36, 2, 2, rgb('#e6fbff'));
  return P.canvas(rgb('#0a1424'));
}

interface MissileLook {
  body: readonly RGB[];
  band: readonly RGB[];
  nose: readonly RGB[];
  fin: readonly RGB[];
}
function artMissile(w: number, h: number, o: MissileLook): HTMLCanvasElement {
  const P = new Painter(w, h);
  const cy = h / 2;
  const r = h * 0.2;
  exhaust(P, 0, 12, cy, r * 0.9);
  // swept tail fins (top lit, bottom in shade)
  P.facet([[10, cy - r + 1], [24, cy - r + 1], [16, cy - r * 2.1], [10, cy - r * 2.1]], o.fin, -0.3, -0.8);
  P.facet([[10, cy + r - 1], [24, cy + r - 1], [16, cy + r * 2.1], [10, cy + r * 2.1]], o.fin, -0.3, 0.8);
  P.tube(9, 13, cy, (t) => r * (0.7 + t * 0.15), DSTEEL);
  P.tube(13, w - 11, cy, () => r, o.body);
  P.tube(w - 18, w - 15, cy, () => r * 1.04, o.band);
  P.tube(w - 11.5, w - 0.5, cy, (t) => r * Math.pow(1 - t, 0.55), o.nose);
  P.each(13, cy - r, 24, cy - r + 1, (x, y) => P.put(x, y, o.fin[1])); // fin root seam
  P.line(14, cy + 0.3, 21, cy + 0.3, 1.2, o.fin[0]); // the edge-on middle fin
  P.line(28, cy - r + 1, 28, cy + r - 1, 1, o.body[1]); // panel seam
  return P.canvas();
}

function artRocket(): HTMLCanvasElement {
  const w = 68;
  const h = 28;
  const P = new Painter(w, h);
  const cy = 14;
  exhaust(P, 0, 13, cy, 5.5, 3);
  // tail fins with a ring, then a thin boom to the warhead
  P.facet([[12, cy - 2], [22, cy - 2], [17, cy - 9], [11, cy - 9]], DSTEEL, -0.3, -0.8);
  P.facet([[12, cy + 2], [22, cy + 2], [17, cy + 9], [11, cy + 9]], DSTEEL, -0.3, 0.8);
  P.tube(12, 16, cy, () => 3.2, DSTEEL);
  P.tube(14, 38, cy, () => 2.6, DSTEEL);
  P.tube(17, 19, cy, () => 3.4, STEEL);
  P.tube(36, w - 1, cy, (t) => (t < 0.5 ? 3 + 5.5 * Math.sin((t / 0.5) * Math.PI * 0.5) : 8.5 * Math.sqrt(Math.max(0, 1 - Math.pow((t - 0.5) / 0.5, 1.8)))), OLIVE);
  P.tube(44, 47, cy, () => 7, R('#4a3a08', '#8a7014', '#c8a826', '#ecd05a', '#fff2a8'));
  P.tube(w - 5, w - 1, cy, (t) => 2.4 * (1 - t), DSTEEL);
  return P.canvas();
}

function artGrenade(): HTMLCanvasElement {
  const P = new Painter(28, 30);
  const cx = 14;
  const cy = 18;
  P.each(cx - 9, cy - 11, cx + 9, cy + 11, (x, y, u, v) => {
    const dx = (u - cx) / 9;
    const dy = (v - cy) / 10.5;
    const d2 = dx * dx + dy * dy;
    if (d2 > 1) return;
    let b = lum(dx, dy, Math.sqrt(1 - d2));
    // pineapple segments
    const gx = ((u - cx) / 4.2 + 0.5) % 1;
    const gy = ((v - cy) / 4.4 + 10.5) % 1;
    if (Math.abs(gx) < 0.18 || Math.abs(gx) > 0.85 || gy < 0.16) b -= 0.22;
    P.put(x, y, tone(OLIVE, b));
  });
  P.tubeY(4, 9, 14, 3.2, STEEL);
  P.line(16, 6, 23, 15, 2, STEEL[2]); // spoon
  P.line(16, 5.5, 22, 13, 1, STEEL[4]);
  P.each(5, 1, 12, 8, (x, y, u, v) => {
    const d = Math.hypot(u - 8.5, v - 4.5);
    if (d < 3 && d > 1.6) P.put(x, y, STEEL[3]);
  });
  return P.canvas();
}

function artShell(w: number, h: number, body: readonly RGB[], band: RGB, box: boolean): HTMLCanvasElement {
  const P = new Painter(w, h);
  const cy = h / 2;
  const fat = h * 0.29;
  const x0 = w * 0.24;
  // tail fins
  if (box) {
    P.box(2, cy - fat - 2, x0 + 2, cy - fat + 1, 1, DSTEEL, 0.5);
    P.box(2, cy + fat - 1, x0 + 2, cy + fat + 2, 1, DSTEEL, 0.5);
    P.facet([[3, cy - fat], [x0, cy - 2], [x0, cy + 2], [3, cy + fat]], DSTEEL, -0.2, 0, 1);
  } else {
    P.facet([[3, cy - 1], [x0 + 2, cy - 1], [x0, cy - fat - 2], [4, cy - fat - 2]], DSTEEL, -0.3, -0.8);
    P.facet([[3, cy + 1], [x0 + 2, cy + 1], [x0, cy + fat + 2], [4, cy + fat + 2]], DSTEEL, -0.3, 0.8);
  }
  P.tube(1, x0 + 3, cy, () => 2.2, DSTEEL);
  P.tube(x0, w - 1, cy, (t) => (t < 0.35 ? fat * (0.4 + 0.6 * Math.sin((t / 0.35) * Math.PI * 0.5)) : fat * Math.sqrt(Math.max(0, 1 - Math.pow((t - 0.35) / 0.65, 1.7)))), body);
  const bx = x0 + (w - x0) * 0.5;
  P.each(bx, cy - fat, bx + 2, cy + fat, (x, y, u, v) => {
    if (Math.abs(v - cy) < fat * 0.98 && u < bx + 2) P.put(x, y, tone([band, band, band], 0.5));
  });
  P.ball(x0 + (w - x0) * 0.42, cy - fat * 0.45, (w - x0) * 0.14, fat * 0.18, [body[4], body[4]], false, 0.55);
  return P.canvas();
}

/** Fireball with a flickering flame tongue streaming back from the core (two frames). `accent` rings it (Nova's arcane fire). */
function artFireball(frame: number, accent: RGB | null): HTMLCanvasElement {
  const P = new Painter(100, 48);
  const cx = 76;
  const cy = 24;
  const rr = 17;
  P.halo(cx, cy, 26, rgb('#ff7a2a'), 0.45, 22);
  P.each(0, 0, cx, 47, (x, y, u, v) => {
    const tt = (cx - u) / cx; // 0 at the core .. 1 at the tip
    let hw = rr * Math.pow(1 - tt, 0.8) * (0.8 + 0.28 * Math.sin(tt * 11 - frame * 2.6));
    hw *= 0.84 + 0.3 * noise(Math.floor(u / 6), Math.floor(v / 5), frame + 1);
    const yc = cy + Math.sin(tt * 7 + frame * 1.9) * 4.5 * tt;
    const dy = Math.abs(v - yc);
    if (dy > hw) return;
    const heat = (1 - dy / hw) * (1 - tt * 0.8) + 0.08 * (noise(Math.floor(u / 2), Math.floor(v / 2), frame) - 0.5);
    P.put(x, y, fireHeat(heat + 0.06), Math.min(1, 0.45 + heat * 1.8) * (1 - tt * 0.45), true);
  });
  P.each(cx - rr - 3, cy - rr - 3, cx + rr + 3, cy + rr + 3, (x, y, u, v) => {
    const ang = Math.atan2(v - cy, u - cx);
    const edge = rr * (0.92 + 0.14 * noise(Math.floor((ang + 4) * 4), frame, 7));
    const d = Math.hypot(u - cx, v - cy);
    if (d > edge) return;
    const dh = Math.hypot(u - cx + 4, v - cy + 4) / rr; // hot spot up-front
    P.put(x, y, dh < 0.38 ? rgb('#ffffff') : dh < 0.66 ? rgb('#fff0a0') : dh < 0.92 ? rgb('#ffb030') : d / edge > 0.88 ? rgb('#d8400e') : rgb('#f06018'), 1, true);
  });
  for (let k = 0; k < 7; k++) {
    const ex = 20 + noise(k, frame, 3) * 56;
    const ey = 6 + noise(k, frame, 5) * 36;
    P.put(Math.floor(ex), Math.floor(ey), rgb(k % 2 ? '#ffe066' : '#ff8a2a'), 0.9, true);
  }
  if (accent) {
    P.each(cx - rr - 5, cy - rr - 5, cx + rr + 5, cy + rr + 5, (x, y, u, v) => {
      const d = Math.hypot((u - cx) / (rr + 3), (v - cy) / (rr * 0.42 + 2));
      if (Math.abs(d - 1) < 0.09) P.put(x, y, accent, 0.95, true);
    });
    P.twinkle(cx - 10, cy - rr - 2, 3, rgb('#ffffff'));
    P.twinkle(cx + 12, cy + rr - 1, 2, accent);
  }
  return P.canvas(null);
}

function artLightning(frame: number): HTMLCanvasElement {
  const P = new Painter(52, 30);
  const cy = 15;
  const pts: Pt[] = [[2, cy]];
  for (let k = 1; k <= 5; k++) pts.push([2 + k * 7, cy + (noise(k, frame, 11) - 0.5) * 12]);
  pts.push([42, cy]);
  P.halo(30, cy, 26, rgb('#ffe040'), 0.4, 14);
  P.path(pts, 8, rgb('#ffcc22'), 0.35, true);
  P.path(pts, 4.2, rgb('#ffee55'), 1, true);
  P.path(pts, 1.8, rgb('#ffffff'), 1, true);
  // forks
  const f = pts[2 + (frame % 2)];
  P.path([f, [f[0] + 4, f[1] - 6], [f[0] + 7, f[1] - 8]], 1.4, rgb('#fff6a0'), 1, true);
  const f2 = pts[4 - (frame % 2)];
  P.path([f2, [f2[0] + 3, f2[1] + 6]], 1.4, rgb('#fff6a0'), 1, true);
  P.poly([[40, cy - 7], [51, cy], [40, cy + 7], [43, cy]], rgb('#ffee55'), 1, true);
  P.poly([[42, cy - 3], [49, cy], [42, cy + 3]], rgb('#ffffff'), 1, true);
  return P.canvas(null);
}

function artIce(): HTMLCanvasElement {
  const P = new Painter(56, 32);
  const cy = 16;
  P.halo(36, cy, 26, rgb('#8fe6ff'), 0.3, 14);
  P.poly([[8, 12], [19, 3], [24, 5], [15, 14]], (u, v) => (v < 8 + (u - 8) * -0.2 + 3 ? ICE[4] : ICE[3]));
  P.poly([[8, 20], [19, 29], [24, 27], [15, 18]], (u, v) => (v > 24 + (u - 8) * 0.1 ? ICE[1] : ICE[2]));
  P.poly([[3, cy], [12, 9], [38, 8], [55, cy], [38, 24], [12, 23]], (u, v) => {
    const dy = v - cy;
    const tip = u > 38;
    if (dy < -3.5) return tip ? ICE[4] : ICE[3];
    if (dy < -0.5) return tip ? ICE[4] : ICE[3];
    if (dy < 0.6) return ICE[4];
    if (dy < 3.5) return ICE[2];
    return ICE[1];
  });
  P.line(12, 11.5, 40, 11, 1, ICE[4]);
  P.line(18, 19, 34, 19, 1, ICE[2]);
  P.twinkle(44, 12, 3, rgb('#ffffff'));
  P.twinkle(22, 13, 2, rgb('#ffffff'));
  return P.canvas(rgb('#0a1a30'));
}

function artArcane(): HTMLCanvasElement {
  const P = new Painter(44, 32);
  const cx = 28;
  const cy = 16;
  P.halo(cx, cy, 18, rgb('#c080ff'), 0.45);
  P.each(cx - 13, cy - 10, cx + 13, cy + 10, (x, y, u, v) => {
    const dx = u - cx;
    const dy = v - cy;
    const inStar = Math.abs(dx) / 13 + Math.abs(dy) / 2.6 <= 1 || Math.abs(dx) / 2.6 + Math.abs(dy) / 10 <= 1;
    if (!inStar) return;
    const c = Math.hypot(dx, dy) < 2.5 ? rgb('#ffffff') : dx <= 0 && dy <= 0 ? VIOLET[4] : dx > 0 && dy > 0 ? VIOLET[2] : VIOLET[3];
    P.put(x, y, c, 1, true);
  });
  P.each(cx - 14, cy - 6, cx + 14, cy + 6, (x, y, u, v) => {
    const d = Math.hypot((u - cx) / 12, (v - cy) / 4.2);
    if (Math.abs(d - 1) < 0.11) P.put(x, y, rgb('#ecd8ff'), 0.9, true);
  });
  P.twinkle(12, 12, 2, rgb('#ecd8ff'));
  P.twinkle(5, 19, 1, rgb('#b47aff'));
  P.twinkle(15, 23, 1, rgb('#ffffff'));
  return P.canvas(null);
}

function artTidal(frame: number): HTMLCanvasElement {
  const P = new Painter(60, 48);
  const cx = 32;
  const cy = 29;
  P.halo(cx, cy, 26, rgb('#3ab8ff'), 0.3);
  P.ball(cx, cy, 15, 14, WATER);
  // the cresting curl over the top, breaking forward
  P.poly(
    [[16, 22], [24, 11], [36, 5], [48, 8], [56, 16], [53, 23], [49, 17], [43, 14], [35, 15], [26, 20]],
    (u, v) => (v < 12 + (u - 36) * (u - 36) * 0.01 ? WATER[4] : v < 16 ? WATER[3] : WATER[2]),
  );
  P.ball(47, 18, 3.4, 2.8, [WATER[0], WATER[1]]);
  P.each(cx - 12, cy - 9, cx + 6, cy + 10, (x, y, u, v) => {
    const d = Math.hypot((u - cx + 2) / 9, (v - cy - 1) / 8);
    if (Math.abs(d - 1) < 0.08 && u < cx + 2 && v > cy - 4) P.put(x, y, WATER[4], 0.85);
  });
  const foam = rgb('#f2fcff');
  const crest: Pt[] = [[22, 13], [27, 9], [33, 6], [39, 5], [45, 7], [50, 9], [54, 13], [56, 18]];
  crest.forEach(([x, y], k) => P.ball(x, y, 1.8 + noise(k, frame, 2) * 1.6, 1.6 + noise(k, frame, 9) * 1.2, [foam, foam]));
  for (let k = 0; k < 6; k++) P.ball(4 + noise(k, frame, 4) * 14, 20 + noise(k, frame, 6) * 22, 1.2, 1.2, [WATER[3], foam]);
  P.ball(58, 22 + frame * 3, 1.2, 1.2, [foam, foam]);
  return P.canvas(rgb('#06183a'));
}

function artPlasma(core: string, mid: string, outer: string): HTMLCanvasElement {
  const P = new Painter(28, 14);
  P.halo(17, 7, 12, rgb(outer), 0.45, 7);
  P.each(0, 3, 12, 11, (x, y, u, v) => {
    const t = u / 12;
    if (Math.abs(v - 7) < 1.2 + t * 1.6) P.put(x, y, rgb(mid), t * 0.7, true);
  });
  P.ball(17, 7, 9, 3.6, [rgb(mid), rgb(mid)], true);
  P.ball(19, 7, 5, 1.8, [rgb(core), rgb(core)], true);
  return P.canvas(null);
}

function artFist(hot: boolean): HTMLCanvasElement {
  const P = new Painter(60, 52);
  const cy = 26;
  const hand = hot ? R('#3a0a04', '#8a2008', '#e05a10', '#ffa030', '#fff0b0') : STEEL;
  const cuff = hot ? R('#4a1006', '#a0300a', '#e8641a', '#ffa040', '#ffe0a0') : GIZ;
  if (hot) P.halo(36, cy, 30, rgb('#ff7a2a'), 0.5, 26);
  exhaust(P, 0, 11, cy, 7, hot ? 5 : 2);
  P.tube(9, 27, cy, (t) => 9 + t * 2, cuff);
  P.tube(23, 27, cy, () => 11.5, DSTEEL);
  P.ball(17, cy - 4, 2.2, 2.2, CYAN, true);
  // the clenched hand: a rounded block, knuckles facing forward
  P.each(25, 12, 54, 42, (x, y, u, v) => {
    const dx = (u - 39.5) / 14.5;
    const dy = (v - 27) / 14.5;
    const d4 = dx ** 4 + dy ** 4;
    if (d4 > 1) return;
    P.put(x, y, tone(hand, lum(dx ** 3, dy ** 3, Math.sqrt(Math.max(0, 1 - d4)) + 0.25)));
  });
  for (let k = 0; k < 4; k++) {
    const ky = 16.5 + k * 6.6;
    P.ball(49, ky, 4.6, 3.3, hand);
    P.line(42, ky + 3.2, 52, ky + 3.2, 0.9, hand[0]);
  }
  P.ball(38, 14.5, 8, 3.6, hand); // thumb across the top
  P.line(33, 17, 44, 17, 0.9, hand[1]);
  return P.canvas();
}

function artCrescent(): HTMLCanvasElement {
  const P = new Painter(56, 72);
  P.halo(34, 36, 26, rgb('#ff4a6a'), 0.4, 36);
  P.each(0, 0, 55, 71, (x, y, u, v) => {
    const d1 = Math.hypot(u - 22, (v - 36) * 0.95);
    const d2 = Math.hypot(u - 10, (v - 36) * 0.9);
    if (d1 > 31 || d2 < 29) return;
    const e = 31 - d1;
    P.put(x, y, e < 2 ? rgb('#ffe0e6') : e < 5 ? rgb('#ff8a9a') : e < 9 ? rgb('#e0344a') : rgb('#8a1428'), 1, true);
  });
  return P.canvas(null);
}

function artVoidOrb(): HTMLCanvasElement {
  const P = new Painter(52, 52);
  const c = 26;
  const ring = (front: boolean): void =>
    P.each(c - 22, c - 8, c + 22, c + 8, (x, y, u, v) => {
      const d = Math.hypot((u - c) / 20, (v - c - (u - c) * 0.18) / 6);
      if (Math.abs(d - 1) < 0.1 && v - (u - c) * 0.18 > c === front) P.put(x, y, rgb(front ? '#ffb0be' : '#c03048'), 1, true);
    });
  P.halo(c, c, 26, rgb('#ff2a4a'), 0.5);
  ring(false);
  P.ball(c, c, 13, 13, R('#08020a', '#1a0610', '#3a0a1a', '#6a1428', '#c03048'));
  P.each(c - 13, c - 13, c + 13, c + 13, (x, y, u, v) => {
    const d = Math.hypot(u - c, v - c) / 13;
    if (d > 0.78 && d <= 1) P.put(x, y, rgb('#ff4a6a'), (d - 0.78) * 3.2, true);
  });
  ring(true);
  P.twinkle(21, 21, 2, rgb('#ffffff'));
  return P.canvas(null);
}

function artRayLaser(): HTMLCanvasElement {
  const P = new Painter(52, 12);
  P.each(0, 0, 51, 11, (x, y, u, v) => {
    const t = u / 52;
    const head = u > 46 ? Math.sqrt(Math.max(0, 1 - ((u - 46) / 5.5) ** 2)) : 1;
    const dy = Math.abs(v - 6) / head;
    const a = Math.min(1, t * 2.4);
    if (dy < 1.1) P.put(x, y, rgb('#ffffff'), a, true);
    else if (dy < 2.4) P.put(x, y, rgb('#ff6a9a'), a, true);
    else if (dy < 4.6) P.put(x, y, rgb('#ff2a6a'), a * 0.45, true);
  });
  return P.canvas(null);
}

// ---- deployables ------------------------------------------------------------------------------

function artTurret(): HTMLCanvasElement {
  const P = new Painter(64, 60);
  P.line(32, 46, 12, 57, 3.2, DSTEEL[2]);
  P.line(32, 46, 52, 57, 3.2, DSTEEL[2]);
  P.line(32, 46, 13, 56, 1, DSTEEL[3]);
  P.box(7, 55, 18, 60, 1.2, DSTEEL);
  P.box(46, 55, 57, 60, 1.2, DSTEEL);
  P.box(27, 40, 37, 52, 1.6, STEEL);
  P.tube(44, 62, 34, () => 2.7, STEEL);
  P.tube(58, 63.5, 34, () => 3.7, DSTEEL);
  // the armoured body: a rounded orange shell in Gizmo's plating
  P.each(14, 18, 47, 47, (x, y, u, v) => {
    const dx = (u - 30.5) / 16;
    const dy = (v - 32) / 13.5;
    const d4 = dx ** 4 + dy ** 4;
    if (d4 > 1) return;
    let b = lum(dx ** 3, dy ** 3, Math.sqrt(Math.max(0, 1 - d4)) + 0.3);
    if (v > 40.5 && v < 42) b -= 0.3; // panel seam
    P.put(x, y, tone(GIZ, b));
  });
  P.box(22, 17, 36, 22, 1.4, GIZ);
  for (const vy of [30, 33, 36]) P.line(18, vy, 24, vy, 1, GIZ[0]);
  for (const [rx, ry] of [[18, 25], [18, 39], [42, 41]] as const) P.put(rx, ry, STEEL[4]);
  P.ball(38.5, 31, 6.6, 6.6, [rgb('#0c1018'), rgb('#1a2230')]);
  P.halo(38.5, 31, 9, rgb('#3ad8ff'), 0.35);
  P.ball(38.5, 31, 4.4, 4.4, CYAN, true);
  P.put(37, 29, rgb('#ffffff'), 1, true);
  P.line(25, 19, 22, 8, 1.4, DSTEEL[3]);
  P.ball(22, 7, 2.6, 2.6, CYAN, true);
  return P.canvas();
}

function artDrone(): HTMLCanvasElement {
  const P = new Painter(56, 50);
  const HULL = R('#1a0a10', '#34141e', '#56202e', '#7e3444', '#b8606e');
  const cx = 28;
  const cy = 22;
  for (const px0 of [7, 49]) {
    P.line(px0, 33, px0, 45, 3, rgb('#ff3a5a'), 0.5, true);
    P.line(px0, 33, px0, 40, 1.4, rgb('#ffd0d8'), 0.9, true);
  }
  P.poly([[cx - 4, 7], [cx, 0], [cx + 4, 7]], tone(HULL, 0.8));
  P.poly([[13, 15], [4, 10], [12, 22]], tone(HULL, 0.6));
  P.poly([[43, 15], [52, 10], [44, 22]], tone(HULL, 0.35));
  const hex = (r: number): Pt[] => Array.from({ length: 6 }, (_, k) => [cx + Math.cos((k * Math.PI) / 3) * r, cy + Math.sin((k * Math.PI) / 3) * r * 0.9] as Pt);
  const H = hex(17);
  for (let k = 0; k < 6; k++) {
    const mid = ((k + 0.5) * Math.PI) / 3;
    P.facet([[cx, cy], H[k], H[(k + 1) % 6]], HULL, Math.cos(mid) * 0.7, Math.sin(mid) * 0.7, 0.8);
  }
  P.poly(hex(11), tone(HULL, 0.42));
  P.ball(7, 28, 4.5, 6, HULL);
  P.ball(49, 28, 4.5, 6, HULL);
  P.ball(cx + 1, cy, 6.4, 6.4, [rgb('#12000a'), rgb('#200810')]);
  P.halo(cx + 1, cy, 10, rgb('#ff2a40'), 0.4);
  P.ball(cx + 1, cy, 4.6, 4.6, R('#5a0010', '#a01020', '#ff2a40', '#ff8a9a', '#ffffff'), true);
  P.line(cx + 1, cy - 3.5, cx + 1, cy + 3.5, 1.4, rgb('#2a0008'), 1);
  P.halo(cx, 42, 6, rgb('#ff3a5a'), 0.5, 4);
  return P.canvas();
}

function artC4(): HTMLCanvasElement {
  const P = new Painter(40, 24);
  const TAPE = R('#0c0c10', '#18181e', '#26262e', '#3a3a46', '#5a5a6a');
  P.box(3, 9, 21, 23, 2, TAN, 1.5);
  P.box(19, 9, 37, 23, 2, TAN, 1.5);
  P.box(8, 8, 12, 24, 1, TAPE, 0.5);
  P.box(28, 8, 32, 24, 1, TAPE, 0.5);
  P.box(13, 3, 27, 10, 1.5, DSTEEL, 1);
  P.box(15, 4.5, 21, 7, 0.5, [rgb('#2aa84a'), rgb('#4aff7a')]);
  P.line(14, 9, 9, 13, 1.2, rgb('#e03a3a'));
  P.line(26, 9, 31, 13, 1.2, rgb('#3a7aff'));
  P.ball(24.5, 5.8, 1.4, 1.4, [rgb('#ff3030'), rgb('#ffb0a0')], true);
  return P.canvas();
}

function artMine(): HTMLCanvasElement {
  const P = new Painter(48, 30);
  const DOME = R('#120a18', '#24142e', '#3a2246', '#5a3a6a', '#8a6a9a');
  for (const deg of [-162, -124, -56, -18]) {
    const a = (deg * Math.PI) / 180;
    const bx = 24 + Math.cos(a) * 16;
    const by = 26 + Math.sin(a) * 14;
    const tx = 24 + Math.cos(a) * 24.5;
    const ty = 26 + Math.sin(a) * 21;
    const nx = -Math.sin(a) * 2.2;
    const ny = Math.cos(a) * 2.2;
    P.facet([[bx + nx, by + ny], [tx, ty], [bx - nx, by - ny]], STEEL, Math.cos(a), Math.sin(a), 0.8);
  }
  P.each(4, 10, 44, 27, (x, y, u, v) => {
    const dx = (u - 24) / 18;
    const dy = (v - 26) / 16;
    const d2 = dx * dx + dy * dy;
    if (d2 > 1 || v > 26) return;
    const ring = Math.abs(Math.sqrt(d2) - 0.7) < 0.06;
    P.put(x, y, ring ? rgb('#ff5aa0') : tone(DOME, lum(dx, dy, Math.sqrt(1 - d2))), 1, ring);
  });
  P.box(3, 25, 45, 29.5, 1.2, DSTEEL, 1.5);
  P.halo(24, 11, 6, rgb('#ff5aa0'), 0.5);
  P.ball(24, 11.5, 2.6, 2.2, [rgb('#ff5aa0'), rgb('#ffd0e8')], true);
  return P.canvas();
}

// ---- items ------------------------------------------------------------------------------------

function artMedkit(): HTMLCanvasElement {
  const P = new Painter(40, 40);
  P.path([[13, 14], [13, 8], [27, 8], [27, 14]], 2.6, DSTEEL[3]);
  P.path([[13, 13], [13, 7.6], [26.6, 7.6]], 1, DSTEEL[4]);
  P.box(4, 12, 36, 35, 3, WHITE, 3.5);
  P.line(5, 27.5, 35, 27.5, 1, WHITE[1]); // lid seam
  P.box(17, 15, 23, 33, 1.6, RED, 1);
  P.box(11, 21, 29, 27, 1.6, RED, 1);
  P.box(17.6, 21.6, 22.4, 26.4, 0.1, [RED[3], RED[3]]);
  P.box(3, 18, 5.5, 23, 0.8, DSTEEL, 0.5);
  P.box(34.5, 18, 37, 23, 0.8, DSTEEL, 0.5);
  return P.canvas();
}

function artBattery(): HTMLCanvasElement {
  const P = new Painter(40, 40);
  const Y = R('#4a3206', '#8a640e', '#d0a020', '#ffd04a', '#fff4b0');
  P.halo(20, 22, 16, rgb('#ffd04a'), 0.25);
  P.tubeY(3, 9, 20, 3.6, STEEL);
  P.tubeY(8, 37, 20, 9.5, Y);
  P.tubeY(14, 31, 20, 9.7, R('#101018', '#1c1c28', '#2c2c40', '#40405a', '#6a6a8a'));
  P.tubeY(34, 38, 20, 9.8, DSTEEL);
  P.poly([[23, 15], [14, 24], [19, 24], [16.5, 31], [26, 21], [21, 21], [24, 15]], rgb('#ffe84a'), 1, true);
  P.poly([[22, 17], [17, 23], [20, 23]], rgb('#ffffff'), 1, true);
  for (let k = 0; k < 3; k++) P.box(12.5, 26.5 - k * 3.5, 14.2, 28.6 - k * 3.5, 0.2, [rgb('#4aff7a'), rgb('#4aff7a')]);
  return P.canvas();
}

function artCanister(): HTMLCanvasElement {
  const P = new Painter(40, 40);
  P.halo(20, 22, 17, rgb('#ff5a3a'), 0.25);
  P.tubeY(3, 9, 20, 2.4, STEEL);
  P.line(13.5, 4, 26.5, 4, 1.8, DSTEEL[2]);
  P.tubeY(9, 37, 20, 10.5, RED);
  P.ball(20, 9.5, 10.5, 3.2, STEEL);
  P.tubeY(12, 14.5, 20, 10.9, DSTEEL);
  P.tubeY(32, 35, 20, 10.9, DSTEEL);
  const ch = rgb('#ffe6a0');
  P.path([[14, 26], [20, 20], [26, 26]], 2.6, ch, 1, true);
  P.path([[14, 31], [20, 25], [26, 31]], 2.6, ch, 1, true);
  return P.canvas();
}

function artBomb(): HTMLCanvasElement {
  const P = new Painter(40, 40);
  const SHELL_D = R('#0c0c16', '#1c1c2c', '#30304a', '#4e4e72', '#8a8ab4');
  P.ball(20, 24, 13.5, 13.5, SHELL_D);
  P.each(6, 22, 34, 26, (x, y, u, v) => {
    const dx = (u - 20) / 13.5;
    const yy = 24 + (1 - Math.sqrt(Math.max(0, 1 - dx * dx))) * -1.5;
    if (Math.abs(v - yy) < 1.1 && Math.abs(dx) < 0.97) P.put(x, y, rgb(Math.abs(dx) < 0.6 ? '#a0f4ff' : '#3ad0e8'), 1, true);
  });
  P.halo(20, 24, 7, rgb('#3ad0e8'), 0.6);
  P.ball(20, 24, 3, 3, [rgb('#a0f4ff'), rgb('#ffffff')], true);
  P.tubeY(7, 12, 20, 3.6, STEEL);
  P.path([[21, 7], [23, 4.5], [26, 3], [29, 3.5]], 1.6, rgb('#8a6a3a'));
  P.halo(30, 3.5, 4.5, rgb('#ffd04a'), 0.9);
  P.twinkle(30, 3, 2, rgb('#ffffff'));
  return P.canvas();
}

function artPrism(): HTMLCanvasElement {
  const P = new Painter(40, 40);
  P.halo(20, 20, 19, rgb('#fff4ff'), 0.35);
  const T: Pt = [20, 2];
  const L: Pt = [5, 19];
  const Rt: Pt = [35, 19];
  const B: Pt = [20, 38];
  const C: Pt = [17, 18];
  const hsl = (h: number, l: number): RGB => {
    const s = 0.75;
    const k = (n: number): number => (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = (n: number): number => Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))));
    return [f(0), f(8), f(4)];
  };
  const face = (pts: Pt[], light: number): void => P.poly(pts, (u, v) => hsl(((u + v * 1.4) * 9) % 360, light));
  face([T, L, C], 0.9);
  face([T, C, Rt], 0.72);
  face([L, B, C], 0.6);
  face([C, B, Rt], 0.45);
  P.path([T, C, B], 1, rgb('#ffffff'));
  P.line(L[0], L[1], C[0], C[1], 1, rgb('#ffffff'), 0.8);
  P.twinkle(13, 10, 3, rgb('#ffffff'));
  P.twinkle(28, 30, 2, rgb('#ffffff'));
  return P.canvas(rgb('#1a1030'));
}

/** The Beam Sword lying on the floor: hilt low-left, its blade up-right. */
function artSwordItem(): HTMLCanvasElement {
  const P = new Painter(40, 40);
  P.line(18, 22, 36, 4, 9, rgb('#5ae8ff'), 0.3, true);
  P.line(17, 23, 36, 4, 4.6, rgb('#5ae8ff'), 1, true);
  P.line(17, 23, 35.5, 4.5, 1.8, rgb('#ffffff'), 1, true);
  P.line(6, 34, 15, 25, 4.4, DSTEEL[2]);
  for (let k = 0; k < 3; k++) P.line(8 + k * 2.4, 31.4 - k * 2.4, 9.4 + k * 2.4, 30 - k * 2.4, 4.6, DSTEEL[4]);
  P.line(11, 21, 19, 29, 3, STEEL[3]);
  P.ball(5, 35, 2.6, 2.6, STEEL);
  return P.canvas();
}

/** The Beam Sword held out: grip at the left, blade to the right (rotated by the view while swinging). */
function artSwordBlade(): HTMLCanvasElement {
  const P = new Painter(150, 24);
  const cy = 12;
  P.halo(94, cy, 58, rgb('#5ae8ff'), 0.45, 9);
  P.each(38, 0, 149, 23, (x, y, u, v) => {
    const tip = u > 140 ? Math.sqrt(Math.max(0, 1 - ((u - 140) / 8.5) ** 2)) : 1;
    const dy = Math.abs(v - cy) / tip;
    if (dy < 1.6) P.put(x, y, rgb('#ffffff'), 1, true);
    else if (dy < 3.8) P.put(x, y, rgb('#7af0ff'), 1, true);
    else if (dy < 5) P.put(x, y, rgb('#2ab8e8'), 0.7, true);
  });
  P.tube(4, 28, cy, () => 3.2, DSTEEL);
  for (let x = 8; x < 26; x += 3.5) P.tube(x, x + 1.4, cy, () => 3.5, STEEL);
  P.ball(4, cy, 3.6, 4, STEEL);
  P.box(27, 3, 32, 21, 1.6, STEEL, 1.5);
  P.tube(32, 39, cy, (t) => 3.8 - t * 0.6, STEEL);
  return P.canvas();
}

function artRayGun(): HTMLCanvasElement {
  const P = new Painter(40, 40);
  const TEAL = R('#0a2a2e', '#145058', '#2a8a8e', '#5ac8c0', '#c8fff0');
  const cy = 16;
  P.facet([[9, 11], [18, 11], [12, 3], [7, 4]], RED, -0.3, -0.8);
  P.poly([[11, 19], [18, 19], [16, 33], [9.5, 33]], (u) => (u < 12 ? RED[3] : RED[2]));
  P.line(19, 20, 20, 25, 1.2, DSTEEL[2]);
  P.tube(5, 26, cy, (t) => 4.2 + Math.sin(t * Math.PI) * 2.6, TEAL);
  P.tube(24, 27, cy, () => 7, STEEL);
  P.tube(28, 30, cy, () => 6, STEEL);
  P.tube(31, 33, cy, () => 5, STEEL);
  P.tube(33, 37, cy, () => 1.8, STEEL);
  P.halo(37.5, cy, 4.5, rgb('#ff4a7a'), 0.8);
  P.ball(37.5, cy, 2, 2, [rgb('#ff4a7a'), rgb('#ffffff')], true);
  P.ball(15, cy - 2.5, 3.5, 1.3, [TEAL[4], TEAL[4]], false, 0.8);
  return P.canvas();
}

function artCrate(volatile: boolean): HTMLCanvasElement {
  const P = new Painter(64, 58);
  const W = volatile ? R('#2a0808', '#5a1210', '#8e2218', '#c03a24', '#ee7050') : WOOD;
  // planks
  for (let k = 0; k < 6; k++) {
    const y0 = 8 + k * 8;
    P.each(4, y0, 60, y0 + 8, (x, y, u, v) => {
      if (u < 4 || u > 60 || v < y0 || v > y0 + 8) return;
      const yy = v - y0;
      let c = yy < 1 ? W[3] : yy > 7 ? W[0] : W[2];
      if (yy >= 1 && yy <= 7 && noise(Math.floor(u / 3), y, k) > 0.82) c = W[1];
      P.put(x, y, c);
    });
  }
  P.box(4, 6, 60, 10, 1, W); // top lip
  P.box(4, 8, 11, 56, 1.5, W, 0.5);
  P.box(53, 8, 60, 56, 1.5, W, 0.5);
  if (volatile) {
    P.each(11, 25, 53, 39, (x, y) => P.put(x, y, (x + y) % 10 < 5 ? rgb('#ffd23a') : rgb('#1a1410')));
    P.line(11, 25, 53, 25, 1, rgb('#0c0a08'));
    P.line(11, 39, 53, 39, 1, rgb('#0c0a08'));
    P.poly([[32, 20], [44, 32], [32, 44], [20, 32]], rgb('#0c0a08'));
    P.poly([[32, 22.5], [41.5, 32], [32, 41.5], [22.5, 32]], (u, v) => (u + v < 64 ? rgb('#fff0a0') : rgb('#ffd23a')));
    P.box(30.6, 25, 33.4, 34, 0.3, [rgb('#0c0a08'), rgb('#0c0a08')]);
    P.box(30.6, 36, 33.4, 38.8, 0.3, [rgb('#0c0a08'), rgb('#0c0a08')]);
  } else {
    P.line(11, 52, 53, 12, 6, W[3]);
    P.line(11, 54, 53, 14, 1, W[1]);
    P.line(11, 49.5, 52, 10.5, 1, W[4]);
  }
  for (const [bx, by] of [[3, 5], [52, 5], [3, 48], [52, 48]] as const) {
    P.box(bx, by, bx + 9, by + 9, 1.4, STEEL, 1);
    P.put(bx + 4, by + 4, STEEL[0]);
  }
  return P.canvas();
}

function artCore(): HTMLCanvasElement {
  const P = new Painter(40, 40);
  const MAG = R('#2a0630', '#5a0e5e', '#9a1e8a', '#e04ac0', '#ffb0f0');
  P.halo(20, 21, 19, rgb('#ffc84a'), 0.45);
  P.facet([[7, 26], [12, 20], [14, 35], [8, 35]], MAG, -0.8, -0.2);
  P.facet([[27, 21], [34, 15], [33, 31], [27, 33]], MAG, 0.7, -0.1);
  P.poly([[20, 2], [30, 13], [27, 36], [13, 37], [9, 15]], (u, v) => {
    const ridge = 20 - (v - 2) * 0.06;
    if (u < ridge) return v < 18 ? MAG[4] : MAG[3];
    return v < 14 ? MAG[3] : MAG[2];
  });
  P.path([[19, 6], [16, 18], [21, 30], [19, 35]], 1.4, rgb('#ffd84a'), 1, true);
  P.path([[16, 18], [11, 22]], 1, rgb('#ffd84a'), 1, true);
  P.halo(19, 21, 7, rgb('#fff0a0'), 0.8, 9);
  P.ball(19, 21, 2.6, 4, [rgb('#fff6c0'), rgb('#ffffff')], true);
  P.twinkle(13, 9, 3, rgb('#ffffff'));
  P.twinkle(30, 30, 2, rgb('#fff0a0'));
  return P.canvas(rgb('#1a0620'));
}

/** Item textures (40 px; the crate 64 px) and the held Beam Sword blade. */
function buildItemArt(add: (key: string, c: HTMLCanvasElement) => void): void {
  add('item-heal', artMedkit());
  add('item-cell', artBattery());
  add('item-boost', artCanister());
  add('item-bomb', artBomb());
  add('item-aegis', artPrism());
  add('item-sword', artSwordItem());
  add('item-sword-blade', artSwordBlade());
  add('item-raygun', artRayGun());
  add('item-crate', artCrate(false));
  add('item-crate-x', artCrate(true));
  add('item-core', artCore());
}

/** How a projectile's art is drawn: texture (frame 1 appends `-1`), the look.size it was designed for, how it turns. */
export interface ProjArt {
  key: string;
  frames: number;
  size: number;
  orient: 'vel' | 'spin' | 'flip';
}
/** Projectile art by `character:projectileId` (moves data stays untouched; unknown ids keep the generic tinted shapes). */
export const PROJ_ART: Record<string, ProjArt> = {
  'halcyon:javelin_0': { key: 'pa-javelin', frames: 1, size: 1.5, orient: 'vel' },
  'halcyon:javelin_1': { key: 'pa-javelin', frames: 1, size: 1.5, orient: 'vel' },
  'halcyon:javelin_2': { key: 'pa-javelin', frames: 1, size: 1.5, orient: 'vel' },
  'rime:kunai': { key: 'pa-kunai', frames: 1, size: 0.8, orient: 'vel' },
  'gizmo:missile': { key: 'pa-missile-giz', frames: 1, size: 1.2, orient: 'vel' },
  'gizmo:turret_shot': { key: 'pa-shot-giz', frames: 1, size: 1, orient: 'vel' },
  'gizmo:fist': { key: 'pa-fist', frames: 1, size: 1.2, orient: 'flip' },
  'gizmo:fist_hot': { key: 'pa-fist-hot', frames: 1, size: 1.2, orient: 'flip' },
  'havoc:missile': { key: 'pa-missile-hav', frames: 1, size: 1.1, orient: 'vel' },
  'havoc:rocket': { key: 'pa-rocket', frames: 1, size: 1.4, orient: 'vel' },
  'havoc:grenade': { key: 'pa-grenade', frames: 1, size: 0.6, orient: 'spin' },
  'havoc:mortar': { key: 'pa-mortar', frames: 1, size: 0.8, orient: 'vel' },
  'havoc:strike': { key: 'pa-strike', frames: 1, size: 1.2, orient: 'vel' },
  'agni:fireball_0': { key: 'pa-fireball', frames: 2, size: 1.2, orient: 'vel' },
  'agni:fireball_1': { key: 'pa-fireball', frames: 2, size: 1.2, orient: 'vel' },
  'agni:fireball_2': { key: 'pa-fireball', frames: 2, size: 1.2, orient: 'vel' },
  'agni:fireball_3': { key: 'pa-fireball', frames: 2, size: 1.2, orient: 'vel' },
  'nova:bolt_fire': { key: 'pa-novafire', frames: 2, size: 1.3, orient: 'vel' },
  'nova:bolt_ice': { key: 'pa-ice', frames: 1, size: 1.1, orient: 'vel' },
  'nova:bolt_lightning': { key: 'pa-lightning', frames: 2, size: 1.2, orient: 'vel' },
  'nova:dair_spell': { key: 'pa-arcane', frames: 1, size: 1.1, orient: 'vel' },
  'riptide:tidal': { key: 'pa-tidal', frames: 2, size: 1.3, orient: 'flip' },
  'overseer:drone_shot': { key: 'pa-shot-drone', frames: 1, size: 1, orient: 'vel' },
  'overseer:orb': { key: 'pa-voidorb', frames: 1, size: 1.3, orient: 'spin' },
  'overseer:quake': { key: 'pa-crescent', frames: 1, size: 1.3, orient: 'flip' },
  'item:raygun': { key: 'pa-raylaser', frames: 1, size: 1, orient: 'vel' },
};
/** Deployable art by `character:deployableId`; (lx, ly) = the status light, in art px from the bottom centre. */
export interface DepArt {
  key: string;
  lx: number;
  ly: number;
}
export const DEP_ART: Record<string, DepArt> = {
  'gizmo:turret': { key: 'da-turret', lx: -10, ly: -53 },
  'overseer:drone': { key: 'da-drone', lx: 1, ly: -28 },
  'havoc:c4': { key: 'da-c4', lx: 4.5, ly: -18 },
  'vex:mine': { key: 'da-mine', lx: 0, ly: -18.5 },
};

function buildProjectileArt(add: (key: string, c: HTMLCanvasElement) => void): void {
  add('pa-javelin', artJavelin());
  add('pa-kunai', artKunai());
  add('pa-missile-giz', artMissile(56, 26, { body: GIZ, band: CYAN, nose: STEEL, fin: GIZ }));
  add('pa-missile-hav', artMissile(56, 24, { body: WHITE, band: RED, nose: DSTEEL, fin: OLIVE }));
  add('pa-rocket', artRocket());
  add('pa-grenade', artGrenade());
  add('pa-mortar', artShell(48, 24, SHELL, rgb('#e0c040'), false));
  add('pa-strike', artShell(56, 28, OLIVE, rgb('#ff9a4a'), true));
  for (const f of [0, 1]) {
    const sfx = f ? '-1' : '';
    add('pa-fireball' + sfx, artFireball(f, null));
    add('pa-novafire' + sfx, artFireball(f, rgb('#d890ff')));
    add('pa-lightning' + sfx, artLightning(f));
    add('pa-tidal' + sfx, artTidal(f));
  }
  add('pa-ice', artIce());
  add('pa-arcane', artArcane());
  add('pa-shot-giz', artPlasma('#ffffff', '#ffd46a', '#ff9a3a'));
  add('pa-shot-drone', artPlasma('#ffffff', '#ff7a8a', '#ff2a4a'));
  add('pa-fist', artFist(false));
  add('pa-fist-hot', artFist(true));
  add('pa-crescent', artCrescent());
  add('pa-voidorb', artVoidOrb());
  add('pa-raylaser', artRayLaser());
  add('da-turret', artTurret());
  add('da-drone', artDrone());
  add('da-c4', artC4());
  add('da-mine', artMine());
}
