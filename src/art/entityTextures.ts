import Phaser from 'phaser';

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
    scene.textures.addCanvas(key, c);
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
}
