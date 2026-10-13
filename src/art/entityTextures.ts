import Phaser from 'phaser';
import { addCanvasTexture } from './canvasTexture';

/**
 * Projectile / deployable textures, drawn in light greys so the data's `look.color` tints them.
 * Drawn at 2x density (1 art pixel = 0.5 world units) like the rest of the world art.
 */
type Ctx = CanvasRenderingContext2D;

function mk(w: number, h: number): [HTMLCanvasElement, Ctx] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
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

  // item capsules 16x16: heal (green cross), energy cell (yellow bolt), overdrive (red chevrons)
  for (const [key, body, glyph] of [['item-heal', '#5fe08a', 'cross'], ['item-cell', '#ffd04a', 'bolt'], ['item-boost', '#ff6a5a', 'chev']] as const) {
    const [c, g] = mk(16, 16);
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        const d = Math.hypot(x - 7.5, y - 7.5);
        if (d > 7.5) continue;
        px(g, d > 6.3 ? '#1a1030' : d > 5 ? '#ffffff' : body, x, y);
      }
    }
    const ink = '#10201a';
    if (glyph === 'cross') { px(g, ink, 7, 4, 2, 8); px(g, ink, 4, 7, 8, 2); }
    else if (glyph === 'bolt') { px(g, ink, 8, 3, 2, 4); px(g, ink, 6, 6, 4, 2); px(g, ink, 6, 8, 2, 5); }
    else { px(g, ink, 5, 5, 2, 2); px(g, ink, 7, 7, 2, 2); px(g, ink, 9, 9, 2, 2); px(g, ink, 9, 5, 2, 2); px(g, ink, 7, 3, 2, 2); }
    add(key, c);
  }

  // Aegis Core 16x16: a prismatic capsule (rainbow bands under a white rim) with a shield glyph
  {
    const [c, g] = mk(16, 16);
    const bands = ['#ff6a8a', '#ffb04a', '#ffe85a', '#6aff9a', '#4ad8ff', '#a07aff'];
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        const d = Math.hypot(x - 7.5, y - 7.5);
        if (d > 7.5) continue;
        px(g, d > 6.3 ? '#1a1030' : d > 5 ? '#ffffff' : bands[Math.min(5, Math.floor((x + y) / 5))], x, y);
      }
    }
    const ink = '#1a1030';
    px(g, ink, 5, 4, 6, 1);
    px(g, ink, 5, 5, 1, 4);
    px(g, ink, 10, 5, 1, 4);
    px(g, ink, 6, 9, 1, 2);
    px(g, ink, 9, 9, 1, 2);
    px(g, ink, 7, 11, 2, 1);
    px(g, '#ffffff', 7, 6, 2, 3);
    add('item-aegis', c);
  }

  // shock bomb 16x16: dark shell, glowing cyan band and core, a lit fuse spark on top
  {
    const [c, g] = mk(16, 16);
    for (let y = 2; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        const d = Math.hypot(x - 7.5, y - 9);
        if (d > 6.6) continue;
        const lit = x + y < 14;
        px(g, d > 5.6 ? '#0c0a18' : lit && d > 3.5 ? '#4a4870' : '#2a2840', x, y);
      }
    }
    px(g, '#3ad0e8', 2, 9, 12, 1);
    px(g, '#a0f4ff', 4, 9, 8, 1);
    px(g, '#e6ffff', 6, 8, 3, 3);
    px(g, '#8a8aa8', 7, 1, 2, 3); // fuse cap
    px(g, '#ffe08a', 8, 0, 2, 1);
    px(g, '#ffffff', 9, 0, 1, 1);
    add('item-bomb', c);
  }

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
