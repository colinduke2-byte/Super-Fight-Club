import type Phaser from 'phaser';
import type { StoryArt } from '../game/story';

/** Story card canvas size in art pixels. Every rectangle below is in these units, scaled by an integer. */
export const CARD_W = 160;
export const CARD_H = 90;

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Pen {
  g: Phaser.GameObjects.Graphics;
  s: number;
  ox: number;
  oy: number;
}

const rect = (p: Pen, x: number, y: number, w: number, h: number, color: number, a = 1): void => {
  p.g.fillStyle(color, a).fillRect(p.ox + Math.round(x) * p.s, p.oy + Math.round(y) * p.s, Math.max(1, Math.round(w)) * p.s, Math.max(1, Math.round(h)) * p.s);
};

/** Vertical colour bands with a dithered seam between them (cheap pixel-art gradient). */
function bands(p: Pen, colors: number[]): void {
  const bh = CARD_H / colors.length;
  colors.forEach((c, i) => {
    rect(p, 0, i * bh, CARD_W, bh + 1, c);
    if (i > 0) for (let x = 0; x < CARD_W; x += 2) rect(p, x + (i % 2), i * bh - 1, 1, 1, c);
  });
}

function skyline(p: Pen, seed: number, base: number, color: number, lit: number, time: number, density = 1): void {
  const r = rng(seed);
  let x = 0;
  while (x < CARD_W) {
    const w = 6 + Math.floor(r() * 10);
    const h = 8 + Math.floor(r() * 26);
    rect(p, x, base - h, w, CARD_H - (base - h), color);
    if (r() < 0.5) rect(p, x + w / 2 - 1, base - h - 3, 2, 3, color); // antenna
    for (let wy = base - h + 3; wy < base - 2; wy += 4) {
      for (let wx = x + 1; wx < x + w - 1; wx += 3) {
        if (r() < 0.35 * density) rect(p, wx, wy, 1, 2, lit, 0.5 + 0.5 * Math.sin(time * 2 + wx * 3 + wy));
      }
    }
    x += w + 1;
  }
}

function circle(p: Pen, cx: number, cy: number, rad: number, color: number, rim?: number): void {
  for (let y = -rad; y <= rad; y++) {
    const half = Math.floor(Math.sqrt(rad * rad - y * y));
    rect(p, cx - half, cy + y, half * 2 + 1, 1, color);
    if (rim !== undefined) {
      rect(p, cx - half, cy + y, 1, 1, rim);
      rect(p, cx + half, cy + y, 1, 1, rim);
    }
  }
}

function stars(p: Pen, seed: number, n: number, time: number): void {
  const r = rng(seed);
  for (let i = 0; i < n; i++) {
    const x = r() * CARD_W;
    const y = r() * CARD_H * 0.6;
    const tw = 0.4 + 0.6 * Math.abs(Math.sin(time * 1.5 + i));
    rect(p, x, y, 1, 1, 0xffffff, tw);
  }
}

/** Draw a story card's backdrop into `g` (call every frame; `time` in seconds drives the animation). */
export function drawStoryArt(g: Phaser.GameObjects.Graphics, art: StoryArt, ox: number, oy: number, s: number, time: number, tintA = 0x4aa3ff, tintB = 0xff6a5a): void {
  const p: Pen = { g, s, ox, oy };
  g.clear();
  switch (art) {
    case 'arena': {
      bands(p, [0x070520, 0x0c0928, 0x150e3a, 0x231552, 0x3a1f6a, 0x5a2b78]);
      stars(p, 11, 60, time);
      circle(p, 118, 26, 17, 0xd8c8f0, 0xf4eaff);
      for (const [cx, cy, r] of [[112, 22, 3], [124, 30, 2], [116, 33, 2]] as const) circle(p, cx, cy, r, 0xb4a0d4);
      // shattered edge: a dark wedge cuts the moon
      for (let i = 0; i < 14; i++) rect(p, 126 + i, 12 + i, 8, 1, 0x150e3a);
      skyline(p, 5, 70, 0x120a2a, 0x7fe8ff, time, 0.8);
      skyline(p, 9, 82, 0x0a0618, 0xffd46a, time, 1);
      // the arena: a lit ring in the middle ground with sweeping spotlights
      rect(p, 52, 60, 56, 3, 0x2a2048);
      rect(p, 56, 57, 48, 3, 0x3a2a66);
      for (let i = 0; i < 12; i++) rect(p, 54 + i * 4, 62, 2, 1, i % 2 === 0 ? 0xffd46a : 0xff6a8a);
      for (const k of [-1, 1]) {
        const sway = Math.sin(time * 0.9 + k) * 14;
        for (let y = 0; y < 50; y++) {
          const w = 1 + y * 0.12;
          rect(p, 80 + k * 20 + sway * (1 - y / 50) * k - w / 2 + (y / 50) * k * 18, 56 - y, w, 1, 0xffffff, 0.07);
        }
      }
      rect(p, 0, 83, CARD_W, 7, 0x05030c);
      break;
    }
    case 'duel': {
      // two halves split by a diagonal slash, tinted for each side
      for (let y = 0; y < CARD_H; y++) {
        const split = 80 + (y - 45) * 0.45;
        const shade = 0.55 + 0.25 * Math.sin(y * 0.2 + time);
        rect(p, 0, y, split, 1, tintA, 0.38 * shade);
        rect(p, split, y, CARD_W - split, 1, tintB, 0.38 * shade);
        rect(p, split - 2, y, 4, 1, 0xffffff, 0.9);
      }
      rect(p, 0, 0, CARD_W, CARD_H, 0x070520, 0.0);
      // speed lines
      const r = rng(21);
      for (let i = 0; i < 28; i++) {
        const y = r() * CARD_H;
        const len = 10 + r() * 30;
        const x = ((r() * CARD_W + time * (30 + 40 * r()) * (i % 2 ? 1 : -1)) % (CARD_W + 40) + CARD_W + 40) % (CARD_W + 40) - 20;
        rect(p, x, y, len, 1, 0xffffff, 0.14);
      }
      rect(p, 0, 80, CARD_W, 10, 0x05030c, 0.65);
      for (let x = 0; x < CARD_W; x += 8) rect(p, x, 80, 4, 1, 0xffd46a, 0.7);
      break;
    }
    case 'boss': {
      // the Overseer's chamber in its calm first phase: cold cyan light, the rotating halo of segments that frames its
      // helm (the boss sprite stands at x 96), a single horizontal eye-slit watching from the dark, motes drifting up
      bands(p, [0x03060e, 0x060c1c, 0x0a1428, 0x0e1c36, 0x0a1428, 0x04080f]);
      const pulse = 0.5 + 0.5 * Math.sin(time * 2.2);
      // a cold glow behind the helm, in rings that brighten toward the centre
      const glow = [0x0b1a30, 0x0e2440, 0x113050, 0x153c62];
      glow.forEach((c, i) => circle(p, 96, 40, 40 - i * 8, c));
      circle(p, 96, 40, 8, pulse > 0.5 ? 0x1c5078 : 0x184668);
      // the halo: twelve segments turning slowly, a few lit
      const segs = 12;
      for (let i = 0; i < segs; i++) {
        const a = (i / segs) * Math.PI * 2 + time * 0.35;
        const lit = (i + Math.floor(time * 1.5)) % 4 === 0;
        for (let k = 0; k < 4; k++) {
          const r = 27 + k * 0.6;
          const aa = a + k * 0.05;
          rect(p, 96 + Math.cos(aa) * r, 40 + Math.sin(aa) * r * 0.55, 2, 1, lit ? 0xbff6ff : 0x2a8fb0, lit ? 0.9 : 0.75);
        }
      }
      // the eye-slit high in the dark: a thin cyan line that brightens and narrows with the pulse
      const ew = 18 + Math.round(4 * pulse);
      rect(p, 34 - ew / 2, 16, ew, 1, 0x4ae4ff, 0.55 + 0.4 * pulse);
      rect(p, 34 - ew / 4, 16, ew / 2, 1, 0xe8fbff, 0.5 + 0.5 * pulse);
      rect(p, 34 - ew / 2 - 3, 15, ew + 6, 3, 0x4ae4ff, 0.08 + 0.06 * pulse);
      const r = rng(33);
      for (let i = 0; i < 28; i++) {
        const x = r() * CARD_W;
        const y = CARD_H - ((r() * CARD_H + time * (8 + r() * 18)) % CARD_H);
        rect(p, x, y, 1, 1 + (i % 3 === 0 ? 1 : 0), i % 5 === 0 ? 0xffd46a : 0x7fe8ff, 0.55);
      }
      // the reactor city below, its lights gone cold
      skyline(p, 8, 84, 0x02040a, 0x4ae4ff, time, 0.5);
      // gold trim along the chamber floor
      rect(p, 0, 84, CARD_W, 6, 0x03050c);
      for (let x = 0; x < CARD_W; x += 10) rect(p, x, 84, 5, 1, 0xe2be70, 0.55);
      break;
    }
    case 'victory': {
      bands(p, [0x2a1a5a, 0x5a2a7a, 0xa04a7a, 0xe0705a, 0xffa04a, 0xffd46a]);
      circle(p, 80, 66, 20, 0xfff0b0, 0xffffff);
      for (let i = 0; i < 6; i++) rect(p, 80 - 30 + i * 2, 60 + i * 4, 60 - i * 4, 1, 0xffffff, 0.08);
      skyline(p, 3, 78, 0x2a1238, 0xffe9a8, time, 0.9);
      skyline(p, 12, 86, 0x120820, 0xffd46a, time, 0.6);
      const r = rng(77);
      const cols = [0xffd46a, 0xff6a8a, 0x7fe8ff, 0x7affa0];
      for (let i = 0; i < 40; i++) {
        const x = (r() * CARD_W + Math.sin(time + i) * 3 + CARD_W) % CARD_W;
        const y = (r() * CARD_H + time * (8 + r() * 14)) % CARD_H;
        rect(p, x, y, 1, 2, cols[i % 4]);
      }
      break;
    }
  }
}
