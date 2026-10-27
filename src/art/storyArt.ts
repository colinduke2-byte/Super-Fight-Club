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
    // (the last building is cut at the card's right edge: it used to poke out past the frame)
    const w = Math.min(6 + Math.floor(r() * 10), CARD_W - x);
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

/** `n` colours blended evenly through `keys` (a smoother sky for `bands`: more, thinner steps). */
function ramp(keys: readonly number[], n: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const t = (i / Math.max(1, n - 1)) * (keys.length - 1);
    const k = Math.min(keys.length - 2, Math.floor(t));
    const f = t - k;
    const a = keys[k];
    const b = keys[k + 1];
    const ch = (sh: number): number => Math.round(((a >> sh) & 255) * (1 - f) + ((b >> sh) & 255) * f) << sh;
    out.push(ch(16) | ch(8) | ch(0));
  }
  return out;
}

/**
 * Draw a story card's backdrop into `g` (call every frame; `time` in seconds drives the animation). `overStage`: the duel
 * card is laid over the fight's stage picture (drawn under `g`), so its split halves are washes instead of a solid ground.
 */
export function drawStoryArt(g: Phaser.GameObjects.Graphics, art: StoryArt, ox: number, oy: number, s: number, time: number, tintA = 0x4aa3ff, tintB = 0xff6a5a, overStage = false): void {
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
      // the rooftop the fighter stands on (top at row 78, where the sprites' feet land), its edge catching the arena light
      rect(p, 0, 78, CARD_W, 12, 0x07040f);
      rect(p, 0, 78, CARD_W, 1, 0x3a2a66);
      for (let x = 3; x < CARD_W; x += 9) rect(p, x, 81, 4, 1, 0x150e2a);
      break;
    }
    case 'duel': {
      // a solid night ground first (the card is a picture of its own: nothing behind it may show through), unless the
      // fight's stage is drawn under it
      if (!overStage) bands(p, [0x070520, 0x0c0928, 0x120c32, 0x0c0928, 0x070520]);
      // two halves split by a diagonal slash, tinted for each side
      const wash = overStage ? 0.3 : 0.42;
      for (let y = 0; y < CARD_H; y++) {
        const split = 80 + (y - 45) * 0.45;
        const shade = 0.55 + 0.25 * Math.sin(y * 0.2 + time);
        rect(p, 0, y, split, 1, tintA, wash * shade);
        rect(p, split, y, CARD_W - split, 1, tintB, wash * shade);
        rect(p, split - 3, y, 1, 1, 0xffffff, 0.35);
        rect(p, split - 2, y, 4, 1, 0xffffff, 0.9);
        rect(p, split + 2, y, 1, 1, 0xffffff, 0.35);
      }
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
      // the Overseer's chamber in its calm first phase: cold violet light, the crown of blade spires fanned like a throne's
      // back behind its helm (the boss sprite stands at x 96), one great round eye watching from the dark, motes drifting up
      bands(p, [0x05030e, 0x0a0619, 0x110a26, 0x170e33, 0x110a26, 0x06040f]);
      const pulse = 0.5 + 0.5 * Math.sin(time * 2.2);
      // a violet glow behind the helm, in rings that brighten toward the centre
      const glow = [0x140c2a, 0x1c1038, 0x251548, 0x2f1b5a];
      glow.forEach((c, i) => circle(p, 96, 40, 40 - i * 8, c));
      circle(p, 96, 40, 8, pulse > 0.5 ? 0x4a2c86 : 0x3e2474);
      // the spire crown: seven tall blades fanned behind the shoulders, the tallest in the middle; a light runs up them in turn
      const spires = 7;
      for (let i = 0; i < spires; i++) {
        const t = i / (spires - 1) - 0.5; // -0.5 .. 0.5
        const ang = -Math.PI / 2 + t * 2.3; // fanned around straight up
        const len = 30 - Math.abs(t) * 22;
        const lit = (i + Math.floor(time * 1.5)) % spires === 0;
        for (let k = 0; k < len; k++) {
          const r = 10 + k;
          const w = Math.max(1, Math.round(3 * (1 - k / len)));
          const x = 96 + Math.cos(ang) * r;
          const y = 44 + Math.sin(ang) * r;
          rect(p, x - w / 2, y, w, 1, k > len - 3 ? 0xf2ecff : 0xddd5c6, 0.55 + 0.1 * Math.abs(t));
          if (lit && k % 2 === 0) rect(p, x, y, 1, 1, 0xb685ff, 0.9);
        }
      }
      // the eye high in the dark: a round violet iris around a white-hot pupil, the ring brightening with the pulse
      const ex = 34;
      const ey = 17;
      circle(p, ex, ey, 7, 0x1a1030);
      circle(p, ex, ey, 5, pulse > 0.5 ? 0xb685ff : 0x8e5ee0, 0xd8c4ff);
      circle(p, ex, ey, 2, 0xffffff);
      for (let a = 0; a < 16; a++) {
        const aa = (a / 16) * Math.PI * 2 + time * 0.4;
        rect(p, ex + Math.cos(aa) * 9, ey + Math.sin(aa) * 9, 1, 1, 0xb685ff, 0.15 + 0.25 * pulse);
      }
      const r = rng(33);
      for (let i = 0; i < 28; i++) {
        const x = r() * CARD_W;
        const y = CARD_H - ((r() * CARD_H + time * (8 + r() * 18)) % CARD_H);
        rect(p, x, y, 1, 1 + (i % 3 === 0 ? 1 : 0), i % 5 === 0 ? 0xffd46a : 0xc8a8ff, 0.55);
      }
      // the reactor city below, its lights gone cold
      skyline(p, 8, 84, 0x03020a, 0xb685ff, time, 0.5);
      // gold trim along the chamber floor
      rect(p, 0, 84, CARD_W, 6, 0x05030c);
      for (let x = 0; x < CARD_W; x += 10) rect(p, x, 84, 5, 1, 0xe2be70, 0.55);
      break;
    }
    case 'victory': {
      // sunrise over the city: a fine-stepped sky, the sun's rays turning slowly behind the skyline
      bands(p, ramp([0x2a1a5a, 0x5a2a7a, 0xa04a7a, 0xe0705a, 0xffa04a, 0xffd46a], 15));
      for (let i = 0; i < 10; i++) {
        const an = Math.PI + (i / 9) * Math.PI + Math.sin(time * 0.3) * 0.06;
        for (let r = 24; r < 70; r += 2) rect(p, 80 + Math.cos(an) * r, 66 + Math.sin(an) * r, 1, 1, 0xfff0b0, 0.22 * (1 - r / 70));
      }
      circle(p, 80, 66, 22, 0xffe08a);
      circle(p, 80, 66, 20, 0xfff0b0, 0xffffff);
      for (let i = 0; i < 6; i++) rect(p, 80 - 30 + i * 2, 60 + i * 4, 60 - i * 4, 1, 0xffffff, 0.08);
      skyline(p, 3, 78, 0x2a1238, 0xffe9a8, time, 0.9);
      skyline(p, 12, 86, 0x120820, 0xffd46a, time, 0.6);
      // the champion's rooftop: a ledge with a rim of sunlight and a rail, so the winner stands on something
      // (its top at row 78: the fighters' frames end a couple of rows under their feet)
      rect(p, 40, 78, 80, 12, 0x1c0c26);
      rect(p, 40, 78, 80, 1, 0xffc070);
      rect(p, 40, 79, 80, 1, 0x5a2a4a);
      for (let x = 44; x < 118; x += 6) rect(p, x, 82, 3, 2, 0x2c1438);
      rect(p, 36, 80, 4, 10, 0x140818);
      rect(p, 120, 80, 4, 10, 0x140818);
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

/** The vignette's rings: inset (art px) and darkness. */
const VIGNETTE = [[0, 0.5], [1, 0.25]] as const;

/**
 * Life over a composed card (a still stage picture): `ending` (the champion's moment: golden motes rising and a soft
 * light from above), `fallen` (the Overseer's arena going dark: the picture dims from the top, ash and violet sparks
 * drifting down), `calm` (two old rivals at peace: a few slow fireflies), `defeat` (game over: a cold wash and rain, over a
 * drawn card, no vignette). Always a dark keyline vignette so the picture
 * sits inside the frame like the drawn cards do. Call every frame after the picture; `time` in seconds.
 */
export function drawStoryOverlay(g: Phaser.GameObjects.Graphics, kind: 'ending' | 'fallen' | 'calm' | 'defeat', ox: number, oy: number, s: number, time: number, still = false): void {
  const p: Pen = { g, s, ox, oy };
  g.clear();
  const t = still ? 0 : time;
  if (kind === 'defeat') {
    // game over: the night turns cold and wet: a blue-black wash and slanting rain
    rect(p, 0, 0, CARD_W, CARD_H, 0x05061a, 0.45);
    const r = rng(13);
    for (let i = 0; i < 46; i++) {
      const x0 = r() * (CARD_W + 30);
      const y = (r() * (CARD_H + 10) + t * (70 + r() * 30)) % (CARD_H + 10) - 6;
      const x = x0 - (y + 6) * 0.3;
      if (x < 0 || x >= CARD_W - 1) continue;
      rect(p, x, y, 1, 1, 0x8aa0d8, 0.45);
      rect(p, x - 1, y + 2, 1, 2, 0x8aa0d8, 0.3);
    }
    return;
  }
  if (kind === 'fallen') {
    // the lights dying: a dark wash heavier toward the top, stepped in pixel rows
    for (let y = 0; y < 60; y += 2) rect(p, 0, y, CARD_W, 2, 0x05030c, 0.55 * (1 - y / 60));
    const r = rng(91);
    for (let i = 0; i < 26; i++) {
      const x = (r() * CARD_W + Math.sin(t * 0.7 + i) * 4 + CARD_W) % CARD_W;
      const y = (r() * CARD_H + t * (5 + r() * 9)) % CARD_H;
      rect(p, x, y, 1, 1, i % 4 === 0 ? 0xb685ff : 0x8a8498, i % 4 === 0 ? 0.8 : 0.55);
    }
  } else if (kind === 'ending') {
    for (let y = 0; y < 24; y += 2) rect(p, 0, y, CARD_W, 2, 0xfff0c0, 0.1 * (1 - y / 24));
    const r = rng(57);
    for (let i = 0; i < 30; i++) {
      const x = (r() * CARD_W + Math.sin(t + i) * 3 + CARD_W) % CARD_W;
      const y = CARD_H - ((r() * CARD_H + t * (6 + r() * 10)) % CARD_H);
      rect(p, x, y, 1, 1 + (i % 3 === 0 ? 1 : 0), i % 3 === 0 ? 0xffffff : 0xffd46a, 0.4 + 0.4 * Math.abs(Math.sin(t * 2 + i)));
    }
  } else {
    const r = rng(23);
    for (let i = 0; i < 9; i++) {
      const x = r() * CARD_W + Math.sin(t * 0.5 + i * 2) * 6;
      const y = 20 + r() * 50 + Math.cos(t * 0.4 + i) * 4;
      rect(p, x, y, 1, 1, 0xfff4b0, 0.3 + 0.5 * Math.abs(Math.sin(t * 1.3 + i * 1.7)));
    }
  }
  // vignette: two stepped dark rings just inside the frame
  for (const [d, a] of VIGNETTE) {
    rect(p, d, d, CARD_W - 2 * d, 1, 0x05030c, a);
    rect(p, d, CARD_H - 1 - d, CARD_W - 2 * d, 1, 0x05030c, a);
    rect(p, d, d + 1, 1, CARD_H - 2 - 2 * d, 0x05030c, a);
    rect(p, CARD_W - 1 - d, d + 1, 1, CARD_H - 2 - 2 * d, 0x05030c, a);
  }
}
