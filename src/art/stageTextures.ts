import Phaser from 'phaser';

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

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  return [c, ctx];
}

/** Generates all stage/background/effect textures used by the sandbox. */
export function buildStageTextures(scene: Phaser.Scene): void {
  const add = (key: string, c: HTMLCanvasElement): void => {
    if (scene.textures.exists(key)) scene.textures.remove(key);
    scene.textures.addCanvas(key, c);
  };

  // stone block body, 16x16
  {
    const [c, g] = canvas(16, 16);
    g.fillStyle = '#4b4468';
    g.fillRect(0, 0, 16, 16);
    g.fillStyle = '#3a3454';
    g.fillRect(0, 7, 16, 1);
    g.fillRect(0, 15, 16, 1);
    g.fillRect(7, 0, 1, 8);
    g.fillRect(3, 8, 1, 8);
    g.fillRect(11, 8, 1, 8);
    g.fillStyle = '#5c5580';
    g.fillRect(0, 0, 16, 1);
    g.fillRect(0, 8, 16, 1);
    add('tile-stone', c);
  }
  // glowing trim cap, 16x6
  {
    const [c, g] = canvas(16, 6);
    g.fillStyle = '#7a6fb0';
    g.fillRect(0, 0, 16, 6);
    g.fillStyle = '#a89cf0';
    g.fillRect(0, 0, 16, 2);
    g.fillStyle = '#42e0d0';
    g.fillRect(0, 2, 16, 1);
    g.fillStyle = '#5a5090';
    g.fillRect(0, 5, 16, 1);
    g.fillRect(7, 3, 2, 2);
    add('tile-cap', c);
  }
  // pass-through platform, 16x6
  {
    const [c, g] = canvas(16, 6);
    g.fillStyle = '#2d6f86';
    g.fillRect(0, 0, 16, 6);
    g.fillStyle = '#58d6e8';
    g.fillRect(0, 0, 16, 2);
    g.fillStyle = '#1b4859';
    g.fillRect(0, 4, 16, 2);
    g.fillStyle = '#9af3ff';
    g.fillRect(2, 2, 3, 1);
    add('tile-pass', c);
  }
  // moving platform, 16x6
  {
    const [c, g] = canvas(16, 6);
    g.fillStyle = '#8a4f2c';
    g.fillRect(0, 0, 16, 6);
    g.fillStyle = '#ffb02e';
    g.fillRect(0, 0, 16, 2);
    g.fillStyle = '#4a2a18';
    g.fillRect(0, 4, 16, 2);
    for (let x = 0; x < 16; x += 4) {
      g.fillStyle = x % 8 === 0 ? '#ffd46a' : '#4a2a18';
      g.fillRect(x, 2, 2, 2);
    }
    add('tile-move', c);
  }
  // sky gradient (1x256, stretched)
  {
    const [c, g] = canvas(1, 256);
    const grad = g.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, '#0b0a24');
    grad.addColorStop(0.6, '#2a1650');
    grad.addColorStop(1, '#6a2d6e');
    g.fillStyle = grad;
    g.fillRect(0, 0, 1, 256);
    add('bg-grad', c);
  }
  // stars, 128x128 tile
  {
    const [c, g] = canvas(128, 128);
    const rnd = mulberry32(7);
    for (let i = 0; i < 46; i++) {
      const x = Math.floor(rnd() * 128);
      const y = Math.floor(rnd() * 128);
      const bright = rnd();
      g.fillStyle = bright > 0.85 ? '#ffffff' : bright > 0.5 ? '#b9b0ff' : '#6f68b0';
      g.fillRect(x, y, 1, 1);
      if (bright > 0.93) {
        g.fillRect(x - 1, y, 3, 1);
        g.fillRect(x, y - 1, 1, 3);
      }
    }
    add('bg-stars', c);
  }
  // distant floating ruins silhouette, 256x96 horizontally tileable
  {
    const [c, g] = canvas(256, 96);
    const rnd = mulberry32(21);
    g.fillStyle = '#1c1238';
    let x = 0;
    while (x < 256) {
      const w = 14 + Math.floor(rnd() * 26);
      const h = 14 + Math.floor(rnd() * 56);
      const top = 96 - h;
      g.fillRect(x, top, w, h);
      // broken crenellations / floating chunks
      if (rnd() > 0.4) g.fillRect(x + 2, top - 5, 4, 5);
      if (rnd() > 0.55) g.fillRect(x + w - 6, top - 8, 4, 8);
      if (rnd() > 0.5) g.fillRect(x + Math.floor(w / 2), top - 20, 3, 3);
      g.fillStyle = '#2a1a50';
      g.fillRect(x, top, 1, h);
      g.fillStyle = '#1c1238';
      x += w + 4 + Math.floor(rnd() * 8);
    }
    add('bg-ruins', c);
  }
  // 2x2 white pixel for particles
  {
    const [c, g] = canvas(4, 4);
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, 4, 4);
    add('px', c);
  }
}
