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
  // beam 48x12
  {
    const [c, g] = mk(48, 12);
    px(g, '#8a8aa8', 0, 1, 48, 10);
    px(g, '#d8d8e8', 0, 3, 48, 6);
    px(g, '#ffffff', 0, 5, 48, 2);
    for (let x = 0; x < 48; x += 6) px(g, '#ffffff', x, 2 + ((x / 6) % 2) * 6, 3, 1);
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
}
