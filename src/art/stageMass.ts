/**
 * Solid stage platforms drawn as one designed structure instead of tiled bricks: a walkable cap that overhangs the ledges, a
 * cornice, a facade of masonry or plating with pillars and themed recessed panels (lit windows, vents, runes, alcoves), and an
 * underside that tapers to a keel. Lit from the top-left like the fighters, fading into the backdrop's haze with depth.
 *
 * Drawn at art density (2 px per world unit). The canvas is `w*2 + 2*OVER` wide; the walking surface is row `HEAD`.
 */
import { mulberry32 } from './stageTextures';

type RGB = [number, number, number];
type Ramp = RGB[];

export const MASS_OVER = 4; // art px the cap overhangs each ledge
export const MASS_HEAD = 8; // art px of headroom above the walking surface (grass tufts, lamps)

/** True when solid platform `p` rests on top of another solid one (a tier): it is drawn without a keel. */
export function isSeated(p: { x: number; y: number; w: number; h: number }, all: ReadonlyArray<{ x: number; y: number; w: number; h: number; kind: string }>): boolean {
  const bottom = p.y + p.h;
  return all.some((q) => q !== p && q.kind === 'solid' && bottom >= q.y && bottom <= q.y + q.h && p.x >= q.x && p.x + p.w <= q.x + q.w);
}

interface MassTheme {
  stone: string[]; // 6 shades, dark -> light
  accent: string[]; // 5 shades, dark -> bright (emissive)
  alt?: string[]; // second accent
  body: 'ashlar' | 'plate' | 'hull';
  cap: 'metal' | 'tech' | 'hazard' | 'slate' | 'grass' | 'deck' | 'crystal' | 'snow';
  panel: 'window' | 'holo' | 'vent' | 'rune' | 'alcove' | 'glyph' | 'porthole' | 'geode';
  under: 'crystal' | 'tech' | 'machine' | 'shard' | 'roots' | 'reef';
  fog: string;
}

const THEMES: Record<string, MassTheme> = {
  skyline: {
    stone: ['#1c1730', '#2a2446', '#3a3260', '#4c4478', '#655c98', '#8a80c0'],
    accent: ['#12414a', '#1c7f8c', '#34d6d0', '#8ff6ee', '#e6ffff'],
    alt: ['#4a1a5a', '#8a2fa0', '#d65cf0', '#f5a6ff', '#ffe6ff'],
    body: 'ashlar',
    cap: 'metal',
    panel: 'window',
    under: 'crystal',
    fog: '#2a1846',
  },
  void: {
    stone: ['#08131f', '#0e2032', '#16304a', '#204464', '#2e5e86', '#4a84ac'],
    accent: ['#0e3a48', '#1a7088', '#3ad0e8', '#a0f4ff', '#eaffff'],
    body: 'plate',
    cap: 'tech',
    panel: 'holo',
    under: 'tech',
    fog: '#0c2a40',
  },
  reactor: {
    stone: ['#140e0e', '#221818', '#32241f', '#44332b', '#5c473c', '#7c6454'],
    accent: ['#4a2a18', '#8a4f2c', '#d9822b', '#ffb02e', '#ffe08a'],
    alt: ['#5a1010', '#a02818', '#ff5a2a', '#ff9a5a', '#ffe0b0'],
    body: 'plate',
    cap: 'hazard',
    panel: 'vent',
    under: 'machine',
    fog: '#3a1208',
  },
  storm: {
    stone: ['#0c1219', '#151e29', '#202c3b', '#2e3d52', '#405472', '#5a7096'],
    accent: ['#103a5a', '#1c6a9c', '#46a8e8', '#9fd8ff', '#e6f6ff'],
    body: 'ashlar',
    cap: 'slate',
    panel: 'rune',
    under: 'shard',
    fog: '#141e30',
  },
  temple: {
    stone: ['#1a2420', '#26342c', '#34463a', '#46604c', '#5e7c62', '#82a080'],
    accent: ['#5a3a10', '#a06a1c', '#e8a83a', '#ffd870', '#fff4c0'],
    alt: ['#1a4a22', '#2e7034', '#4a9e48', '#7ad06a', '#c8f4a0'],
    body: 'ashlar',
    cap: 'grass',
    panel: 'glyph',
    under: 'roots',
    fog: '#163c3a',
  },
  tide: {
    // a wrecked ship's hull: grey driftwood, bioluminescent sea life, coral
    stone: ['#161414', '#26201e', '#382e2a', '#4e4038', '#685648', '#8a7660'],
    accent: ['#0a3a40', '#127078', '#2ad0c8', '#8af8e8', '#e0fff8'],
    alt: ['#5a1a2a', '#a03048', '#e8607a', '#ffa0b0', '#ffe0e8'],
    body: 'hull',
    cap: 'deck',
    panel: 'porthole',
    under: 'reef',
    fog: '#0c2a3a',
  },
  cavern: {
    // cave rock: cool dark granite, amethyst seams and clusters, a teal mineral glint
    stone: ['#16121a', '#221c26', '#302834', '#423846', '#58505c', '#746a78'],
    accent: ['#3a1f66', '#6a34a0', '#a868e0', '#d8b0ff', '#f4e8ff'],
    alt: ['#0e3a40', '#1c6a70', '#3ac8c0', '#9ff4e8', '#e8fffc'],
    body: 'ashlar',
    cap: 'crystal',
    panel: 'geode',
    under: 'crystal',
    fog: '#120a22',
  },
  frost: {
    // a mountain shrine: blue-grey granite under fresh snow, red-lacquered timber, ice-blue lantern light
    stone: ['#1a2230', '#283446', '#38485e', '#4c6078', '#667c96', '#8aa0ba'],
    accent: ['#1c4a6a', '#2e7aa8', '#6ab8e8', '#bfe6ff', '#f0faff'],
    alt: ['#4a1014', '#8a1e24', '#c8323a', '#e8686a', '#ffc0b8'],
    body: 'ashlar',
    cap: 'snow',
    panel: 'alcove',
    under: 'shard',
    fog: '#1c3462',
  },
  airship: {
    // a sky galleon's hull in the sunset: varnished timber, brass trim, lamplit portholes
    stone: ['#1e1410', '#2e2018', '#443024', '#5e4432', '#7c5c42', '#a07a58'],
    accent: ['#5a3a10', '#9a6a1c', '#e0a83a', '#ffd870', '#fff4c8'],
    alt: ['#4a1a2a', '#8a3048', '#d0607a', '#ffa0b0', '#ffe0e8'],
    body: 'hull',
    cap: 'deck',
    panel: 'porthole',
    under: 'machine',
    fog: '#4a2a5e',
  },
  dawn: {
    stone: ['#8a6a66', '#a88a82', '#c6aa9c', '#dcc6b2', '#eedcc8', '#fff4e4'],
    accent: ['#6a4a1c', '#b08a30', '#e8c050', '#ffe08a', '#fff4c0'],
    alt: ['#2a5a32', '#3e8a48', '#64b45e', '#9ad87a', '#d4f4b0'],
    body: 'ashlar',
    cap: 'grass',
    panel: 'alcove',
    under: 'roots',
    fog: '#b07890',
  },
};

const hex = (h: string): RGB => {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const clampI = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

/** Smooth tileable-free value noise (non-periodic hash). */
function noise(seed: number): (x: number, y: number) => number {
  const h = (x: number, y: number): number => {
    let n = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(seed, 2147483647);
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
  };
  return (x, y) => {
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const fx = x - x0;
    const fy = y - y0;
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);
    const a = h(x0, y0) + (h(x0 + 1, y0) - h(x0, y0)) * sx;
    const b = h(x0, y0 + 1) + (h(x0 + 1, y0 + 1) - h(x0, y0 + 1)) * sx;
    return a + (b - a) * sy;
  };
}

class Buf {
  readonly c: Float32Array;
  readonly a: Uint8Array;
  readonly glow: Float32Array;
  /** 1 where the pixel is part of a recessed / emissive feature (fog and lighting skip it). */
  readonly em: Uint8Array;
  constructor(
    readonly w: number,
    readonly h: number,
  ) {
    this.c = new Float32Array(w * h * 3);
    this.a = new Uint8Array(w * h);
    this.glow = new Float32Array(w * h * 3);
    this.em = new Uint8Array(w * h);
  }
  set(x: number, y: number, col: RGB, emissive = false): void {
    x = Math.round(x);
    y = Math.round(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = y * this.w + x;
    this.c[i * 3] = col[0];
    this.c[i * 3 + 1] = col[1];
    this.c[i * 3 + 2] = col[2];
    this.a[i] = 255;
    this.em[i] = emissive ? 1 : 0;
    if (emissive) {
      this.glow[i * 3] = col[0];
      this.glow[i * 3 + 1] = col[1];
      this.glow[i * 3 + 2] = col[2];
    } else {
      this.glow[i * 3] = this.glow[i * 3 + 1] = this.glow[i * 3 + 2] = 0;
    }
  }
  rect(x: number, y: number, w: number, h: number, col: RGB, emissive = false): void {
    for (let yy = Math.round(y); yy < Math.round(y + h); yy++) for (let xx = Math.round(x); xx < Math.round(x + w); xx++) this.set(xx, yy, col, emissive);
  }
  filled(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.w && y < this.h && this.a[y * this.w + x] > 0;
  }
  get(x: number, y: number): RGB {
    const i = (y * this.w + x) * 3;
    return [this.c[i], this.c[i + 1], this.c[i + 2]];
  }
  /** Multiply an existing pixel (shadows / highlights) without changing coverage. */
  tint(x: number, y: number, k: number, toward?: RGB, t = 0): void {
    x = Math.round(x);
    y = Math.round(y);
    if (!this.filled(x, y)) return;
    const i = (y * this.w + x) * 3;
    let c: RGB = [this.c[i] * k, this.c[i + 1] * k, this.c[i + 2] * k];
    if (toward) c = mix(c, toward, t);
    this.c[i] = c[0];
    this.c[i + 1] = c[1];
    this.c[i + 2] = c[2];
  }
}

/** Generates the art for one solid platform `w` x `h` world units. */
export function stageMass(themeId: string | undefined, w: number, h: number, seed: number, seated = false): HTMLCanvasElement {
  const T = THEMES[themeId ?? 'skyline'] ?? THEMES.skyline;
  const S: Ramp = T.stone.map(hex);
  const A: Ramp = T.accent.map(hex);
  const A2: Ramp = (T.alt ?? T.accent).map(hex);
  const fog = hex(T.fog);
  const rnd = mulberry32(seed * 7919 + 13);
  const n1 = noise(seed + 1);
  const n2 = noise(seed + 2);

  const BW = Math.round(w * 2); // body width
  const BH = Math.round(h * 2); // body height (collision box)
  const UNDER = seated ? 0 : Math.round(Math.min(220, Math.max(70, BW * 0.36))); // a tier resting on another block has no keel
  const W = BW + MASS_OVER * 2;
  const H = MASS_HEAD + BH + UNDER;
  const b = new Buf(W, H);
  const X0 = MASS_OVER; // body left
  const Y0 = MASS_HEAD; // walking surface
  const CAP = 12;
  const CORN = 10;

  // ---- 1. facade fill: masonry or plating -------------------------------------------------------------------------
  const bodyTop = Y0 + CAP;
  const bodyBot = Y0 + BH;
  const block = (x0: number, y0: number, bw: number, bh: number, s: number): void => {
    const plate = T.body === 'plate';
    for (let y = y0; y < y0 + bh; y++) {
      for (let x = x0; x < x0 + bw; x++) {
        if (x < X0 || x >= X0 + BW || y < bodyTop || y >= bodyBot) continue;
        const lx = x - x0;
        const ly = y - y0;
        let k = s;
        const nn = n1(x / 3.1, y / 3.1);
        if (nn > 0.74) k += 1;
        else if (nn < 0.22) k -= 1;
        if (plate && (x * 7 + y * 3) % 11 === 0) k -= 1; // brushed metal grain
        let col = S[clampI(k, 0, 5)];
        if (lx === 0 || ly === 0) col = S[clampI(s + 1, 0, 5)];
        if (ly === 0 && lx > 0 && lx < bw - 1) col = S[clampI(s + 2, 0, 5)];
        if (lx === bw - 1 || ly === bh - 1) col = S[clampI(s - 2, 0, 5)];
        if (lx === bw - 1 && ly === bh - 1) col = S[0];
        b.set(x, y, col);
      }
    }
    if (T.body === 'hull') {
      // wood grain streaks and a treenail at each plank end
      for (let k = 0; k < bw / 14; k++) {
        const gx = x0 + Math.floor(rnd() * bw);
        const gy = y0 + 2 + Math.floor(rnd() * Math.max(1, bh - 4));
        for (let j = 0; j < 4 + Math.floor(rnd() * 8); j++) if (gx + j >= X0 && gx + j < X0 + BW && gy >= bodyTop && gy < bodyBot) b.set(gx + j, gy, S[clampI(s - 1, 0, 5)]);
      }
      for (const nx of [x0 + 2, x0 + bw - 4]) if (nx >= X0 && nx < X0 + BW && y0 + 3 < bodyBot) b.set(nx, y0 + 3, S[0]);
      return;
    }
    if (plate) {
      // rivets in the corners, a panel seam across big plates
      for (const [rx, ry] of [[3, 3], [bw - 4, 3], [3, bh - 4], [bw - 4, bh - 4]]) {
        b.set(x0 + rx, y0 + ry, S[5]);
        b.set(x0 + rx + 1, y0 + ry + 1, S[0]);
      }
      if (bw > 40 && rnd() > 0.5) for (let y = y0 + 2; y < y0 + bh - 2; y++) b.set(x0 + Math.floor(bw / 2), y, S[clampI(s - 1, 0, 5)]);
    } else if (rnd() > 0.7) {
      // crack
      let cx = x0 + 4 + Math.floor(rnd() * (bw - 8));
      for (let k = 1; k < bh - 1; k++) {
        b.set(cx, y0 + k, S[0]);
        if (rnd() > 0.55) cx += rnd() > 0.5 ? 1 : -1;
      }
    }
  };
  for (let y = bodyTop + CORN, row = 0; y < bodyBot; row++) {
    const hull = T.body === 'hull';
    const bh = T.body === 'plate' ? 22 + Math.floor(rnd() * 8) : hull ? 7 + Math.floor(rnd() * 2) : 14 + Math.floor(rnd() * 7);
    let x = X0 - (row % 2 === 0 ? 0 : 10 + Math.floor(rnd() * (hull ? 40 : 14)));
    while (x < X0 + BW) {
      const bw = T.body === 'plate' ? 36 + Math.floor(rnd() * 36) : hull ? 50 + Math.floor(rnd() * 70) : 18 + Math.floor(rnd() * 30);
      block(x, y, bw, bh, 2 + (rnd() > 0.6 ? 1 : 0));
      x += bw;
    }
    y += bh;
  }

  // ---- 2. pillars and the recessed panels between them -----------------------------------------------------------
  const PW = BW > 260 ? 18 : 14;
  const inner = Math.max(0, Math.round(BW / 170) - 1);
  const pillars: number[] = [X0, X0 + BW - PW];
  for (let i = 1; i <= inner; i++) pillars.push(Math.round(X0 + (BW - PW) * (i / (inner + 1))));
  pillars.sort((p, q) => p - q);
  const panelTop = bodyTop + CORN + 8;
  const panelBot = Math.min(bodyBot - 10, panelTop + Math.max(36, Math.round(BH * 0.55)));
  for (let i = 0; i + 1 < pillars.length; i++) {
    const px0 = pillars[i] + PW + 6;
    const px1 = pillars[i + 1] - 6;
    if (px1 - px0 < 20) continue;
    panel(b, T, S, A, A2, px0, panelTop, px1 - px0, panelBot - panelTop, rnd, n2);
  }
  for (const x of pillars) pillar(b, S, A, T, x, bodyTop, PW, bodyBot - bodyTop, panelBot);

  // ---- 3. cornice under the cap: protruding band with dentils and a cast shadow ---------------------------------
  for (let x = X0; x < X0 + BW; x++) {
    b.set(x, bodyTop, S[5]);
    b.set(x, bodyTop + 1, S[4]);
    for (let y = bodyTop + 2; y < bodyTop + 6; y++) b.set(x, y, S[3]);
    b.set(x, bodyTop + 6, S[1]);
    const d = (x - X0) % 8;
    for (let y = bodyTop + 7; y < bodyTop + CORN; y++) b.set(x, y, d < 5 ? S[d === 0 ? 4 : 3] : S[0]);
    if (d === 4) for (let y = bodyTop + 7; y < bodyTop + CORN; y++) b.set(x, y, S[1]);
    // shadow cast onto the facade below
    for (let k = 0; k < 4; k++) b.tint(x, bodyTop + CORN + k, 0.55 + k * 0.11);
  }
  if (T.panel === 'window' || T.panel === 'holo' || T.panel === 'rune') {
    // glowing inlay along the cornice
    for (let x = X0 + 4; x < X0 + BW - 4; x++) b.set(x, bodyTop + 3, (x >> 3) % 2 === 0 ? A[2] : A[1], (x >> 3) % 2 === 0);
  }

  // ---- 4. the walking surface -------------------------------------------------------------------------------------
  cap(b, T, S, A, A2, Y0, CAP, W, rnd);

  // ---- 5. underside keel -------------------------------------------------------------------------------------------
  if (!seated) underside(b, T, S, A, A2, X0, bodyBot, BW, UNDER, rnd, n1);

  // ---- 6. silhouette edges: rim light left, dark outline right / bottom -------------------------------------------
  for (let y = Y0 + CAP; y < H; y++) {
    let first = -1;
    let last = -1;
    for (let x = 0; x < W; x++) if (b.filled(x, y)) { if (first < 0) first = x; last = x; }
    if (first < 0) continue;
    b.tint(first, y, 1.25, [255, 240, 220], 0.15);
    b.tint(first + 1, y, 1.1);
    b.tint(last, y, 0.45);
    b.tint(last - 1, y, 0.75);
  }

  // ---- 7. depth haze, then glow from emissive pixels --------------------------------------------------------------
  for (let y = 0; y < H; y++) {
    const d = (y - Y0 - CAP) / (BH + UNDER * 0.6);
    const t = Math.max(0, Math.min(0.72, (d - 0.18) * 0.95));
    if (t <= 0) continue;
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (!b.a[i] || b.em[i]) continue;
      b.tint(x, y, 1, fog, t);
    }
  }
  bloom(b, 4, 0.55);

  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  const img = g.createImageData(W, H);
  for (let i = 0; i < W * H; i++) {
    const glowA = b.a[i] ? 0 : Math.min(1, (b.glow[i * 3] + b.glow[i * 3 + 1] + b.glow[i * 3 + 2]) / 300);
    if (!b.a[i] && glowA < 0.04) continue;
    img.data[i * 4] = clampI(Math.round(b.c[i * 3]), 0, 255);
    img.data[i * 4 + 1] = clampI(Math.round(b.c[i * 3 + 1]), 0, 255);
    img.data[i * 4 + 2] = clampI(Math.round(b.c[i * 3 + 2]), 0, 255);
    img.data[i * 4 + 3] = b.a[i] ? 255 : Math.round(glowA * 120);
  }
  g.putImageData(img, 0, 0);
  return c;
}

/** Spreads light from emissive pixels onto their neighbours (and as a faint halo past the silhouette). */
function bloom(b: Buf, r: number, k: number): void {
  const { w, h } = b;
  const src = new Float32Array(w * h * 3);
  for (let i = 0; i < w * h; i++) if (b.em[i]) for (let c = 0; c < 3; c++) src[i * 3 + c] = b.glow[i * 3 + c];
  const tmp = new Float32Array(w * h * 3);
  const n = r * 2 + 1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s0 = 0;
      let s1 = 0;
      let s2 = 0;
      for (let d = -r; d <= r; d++) {
        const xx = x + d;
        if (xx < 0 || xx >= w) continue;
        const j = (y * w + xx) * 3;
        s0 += src[j];
        s1 += src[j + 1];
        s2 += src[j + 2];
      }
      const i = (y * w + x) * 3;
      tmp[i] = s0 / n;
      tmp[i + 1] = s1 / n;
      tmp[i + 2] = s2 / n;
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s0 = 0;
      let s1 = 0;
      let s2 = 0;
      for (let d = -r; d <= r; d++) {
        const yy = y + d;
        if (yy < 0 || yy >= h) continue;
        const j = (yy * w + x) * 3;
        s0 += tmp[j];
        s1 += tmp[j + 1];
        s2 += tmp[j + 2];
      }
      const i = y * w + x;
      const g0 = (s0 / n) * k;
      const g1 = (s1 / n) * k;
      const g2 = (s2 / n) * k;
      if (b.a[i]) {
        if (b.em[i]) continue;
        b.c[i * 3] = Math.min(255, b.c[i * 3] + g0 * 0.8);
        b.c[i * 3 + 1] = Math.min(255, b.c[i * 3 + 1] + g1 * 0.8);
        b.c[i * 3 + 2] = Math.min(255, b.c[i * 3 + 2] + g2 * 0.8);
      } else {
        b.glow[i * 3] = g0;
        b.glow[i * 3 + 1] = g1;
        b.glow[i * 3 + 2] = g2;
        b.c[i * 3] = Math.min(255, g0 * 2.2);
        b.c[i * 3 + 1] = Math.min(255, g1 * 2.2);
        b.c[i * 3 + 2] = Math.min(255, g2 * 2.2);
      }
    }
  }
}

function pillar(b: Buf, S: Ramp, A: Ramp, T: MassTheme, x0: number, y0: number, pw: number, ph: number, panelBot: number): void {
  if (T.body === 'hull') {
    // a heavy hull rib: dark timber with iron straps and a hanging glow-lantern
    const rw = Math.max(8, pw - 6);
    const rx = x0 + Math.floor((pw - rw) / 2);
    for (let y = y0; y < y0 + ph; y++) {
      for (let lx = 0; lx < rw; lx++) {
        const t = lx / (rw - 1);
        b.set(rx + lx, y, S[t < 0.2 ? 3 : t < 0.75 ? 2 : 1]);
      }
      if ((y - y0) % 26 === 12) for (let lx = -1; lx <= rw; lx++) { b.set(rx + lx, y, hex('#5a6266')); b.set(rx + lx, y + 1, hex('#2a2e30')); }
    }
    const cy = Math.round((y0 + 16 + panelBot) / 2);
    const cx = rx + Math.floor(rw / 2) - 2;
    for (let y = cy - 8; y < cy - 3; y++) b.set(cx + 2, y, S[0]);
    b.rect(cx, cy - 3, 5, 7, S[0]);
    b.rect(cx + 1, cy - 2, 3, 5, A[3], true);
    b.set(cx + 2, cy - 1, A[4], true);
    return;
  }
  // fluted column, lit from the left
  for (let y = y0; y < y0 + ph; y++) {
    for (let lx = 0; lx < pw; lx++) {
      const t = lx / (pw - 1);
      let k = t < 0.15 ? 5 : t < 0.35 ? 4 : t < 0.7 ? 3 : t < 0.88 ? 2 : 1;
      if (lx > 2 && lx < pw - 3 && lx % 4 === 1) k -= 1; // flutes
      b.set(x0 + lx, y, S[clampI(k, 0, 5)]);
    }
  }
  // capital and base blocks, wider than the shaft
  const block = (y: number, hh: number): void => {
    for (let yy = y; yy < y + hh; yy++) {
      for (let lx = -3; lx < pw + 3; lx++) {
        const k = yy === y ? 5 : yy === y + hh - 1 ? 1 : lx < 0 ? 4 : lx >= pw ? 2 : 3;
        b.set(x0 + lx, yy, S[k]);
      }
    }
  };
  block(y0 + 10, 6);
  block(panelBot, 6);
  if (T.panel !== 'alcove' && T.panel !== 'glyph') {
    // a lamp / indicator on the shaft
    const cy = Math.round((y0 + 16 + panelBot) / 2);
    const cx = x0 + Math.floor(pw / 2) - 1;
    b.rect(cx - 1, cy - 3, 4, 7, S[0]);
    b.rect(cx, cy - 2, 2, 5, A[3], true);
    b.set(cx, cy - 2, A[4], true);
  } else {
    // gold band on marble
    for (let lx = 0; lx < pw; lx++) {
      b.set(x0 + lx, y0 + 22, A[3]);
      b.set(x0 + lx, y0 + 23, A[1]);
    }
  }
}

function panel(b: Buf, T: MassTheme, S: Ramp, A: Ramp, A2: Ramp, x0: number, y0: number, pw: number, ph: number, rnd: () => number, n: (x: number, y: number) => number): void {
  if (T.panel === 'porthole') {
    portholes(b, S, A, A2, x0, y0, pw, ph, rnd, T.cap === 'deck' && T.body === 'hull' && T.under === 'machine');
    return;
  }
  if (T.panel === 'geode') {
    geodes(b, S, A, A2, x0, y0, pw, ph, rnd);
    return;
  }
  // recessed: dark interior, shadow along the top/left inner edge, light along the bottom/right
  for (let y = y0; y < y0 + ph; y++) {
    for (let x = x0; x < x0 + pw; x++) {
      const lx = x - x0;
      const ly = y - y0;
      let k = 1 + (n(x / 6, y / 6) > 0.8 ? 1 : 0);
      if (ly < 3 || lx < 2) k = 0;
      if (ly === ph - 1 || lx === pw - 1) k = 4;
      b.set(x, y, S[k]);
    }
  }
  const ix = x0 + 4;
  const iy = y0 + 5;
  const iw = pw - 8;
  const ih = ph - 9;
  if (T.panel === 'window') {
    // rows of tall arched windows, most lit
    const ww = 6;
    const gap = 5;
    const count = Math.max(1, Math.floor((iw + gap) / (ww + gap)));
    const off = ix + Math.floor((iw - (count * (ww + gap) - gap)) / 2);
    const wh = Math.min(20, ih - 6);
    const rows = Math.max(1, Math.floor((ih - 4) / (wh + 9)));
    for (let row = 0; row < rows; row++) {
      const ry = iy + 2 + row * (wh + 9);
      for (let i = 0; i < count; i++) {
        const wx = off + i * (ww + gap);
        const lit = rnd() > 0.25;
        const C = rnd() > 0.82 ? A2 : A;
        for (let y = 0; y < wh; y++) {
          for (let x = 0; x < ww; x++) {
            if (y < 2 && (x === 0 || x === ww - 1)) continue; // arch
            const t = y / wh;
            const col = lit ? (t < 0.3 ? C[3] : t < 0.7 ? C[2] : C[1]) : S[0];
            b.set(wx + x, ry + y, col, lit);
          }
        }
        if (lit) for (let x = 1; x < ww - 1; x++) b.set(wx + x, ry + Math.floor(wh / 2), S[1]); // mullion
        for (let x = -1; x <= ww; x++) b.set(wx + x, ry + wh, S[4]); // sill
      }
    }
    // conduit along the panel floor
    for (let x = ix; x < ix + iw; x++) b.set(x, y0 + ph - 4, (x >> 2) % 3 === 0 ? A[3] : A[1], (x >> 2) % 3 === 0);
  } else if (T.panel === 'holo') {
    // horizontal light bars and a vertical scan grid
    for (let y = iy; y < iy + ih; y++) {
      for (let x = ix; x < ix + iw; x++) {
        if ((y - iy) % 7 === 0 && (x + y) % 3 !== 0) b.set(x, y, A[1]);
        if ((x - ix) % 12 === 0) b.set(x, y, A[0]);
      }
    }
    const bars = Math.max(1, Math.floor(ih / 14));
    for (let i = 0; i < bars; i++) {
      const y = iy + 4 + i * 14;
      const len = Math.round(iw * (0.35 + rnd() * 0.5));
      for (let x = 0; x < len; x++) b.set(ix + 2 + x, y, x < 3 ? A[4] : A[2], true);
    }
    // emblem: a ring in the middle of wide panels
    if (iw > 60) {
      const cx = ix + iw / 2;
      const cy = iy + ih / 2;
      const r = Math.min(iw, ih) * 0.3;
      for (let a = 0; a < 360; a += 2) {
        const rad = (a * Math.PI) / 180;
        b.set(cx + Math.cos(rad) * r, cy + Math.sin(rad) * r, A[3], true);
        if (a % 30 === 0) b.set(cx + Math.cos(rad) * (r - 3), cy + Math.sin(rad) * (r - 3), A[2], true);
      }
      b.rect(cx - 2, cy - 2, 4, 4, A[4], true);
    }
  } else if (T.panel === 'vent') {
    // furnace grille: dark slats with heat glowing behind, brightest in the middle
    for (let y = iy; y < iy + ih; y++) {
      const ly = y - iy;
      for (let x = ix; x < ix + iw; x++) {
        const mid = 1 - Math.abs((x - ix) / iw - 0.5) * 2;
        if (ly % 5 < 2) {
          b.set(x, y, ly % 5 === 0 ? S[3] : S[1]);
        } else {
          const heat = mid * (0.6 + 0.4 * Math.sin(ly * 0.3));
          b.set(x, y, heat > 0.7 ? A[3] : heat > 0.4 ? A[2] : heat > 0.15 ? A[1] : A[0], heat > 0.15);
        }
      }
    }
    // hazard placard
    if (iw > 50) {
      const px0 = ix + Math.floor(iw / 2) - 10;
      b.rect(px0, iy - 4, 20, 6, S[0]);
      for (let x = 0; x < 18; x++) for (let y = 0; y < 4; y++) b.set(px0 + 1 + x, iy - 3 + y, ((x + y) >> 1) % 2 === 0 ? A[3] : S[0]);
    }
    // pipes across the panel
    const py = iy + ih + 1;
    for (let x = x0 - 2; x < x0 + pw + 2; x++) {
      b.set(x, py, S[5]);
      b.set(x, py + 1, S[4]);
      b.set(x, py + 2, S[2]);
      b.set(x, py + 3, S[0]);
      if ((x - x0) % 26 === 0) for (let y = py - 1; y < py + 5; y++) b.set(x, y, S[3]);
    }
  } else if (T.panel === 'rune') {
    // one large sigil per panel, a few small carved glyphs around it
    const cx = ix + iw / 2;
    const cy = iy + ih / 2;
    const r = Math.max(8, Math.min(iw, ih) * 0.32);
    for (let a = 0; a < 360; a += 1.5) {
      const rad = (a * Math.PI) / 180;
      b.set(cx + Math.cos(rad) * r, cy + Math.sin(rad) * r, A[2], true);
      if (a % 45 === 0) for (let k = 0; k < 4; k++) b.set(cx + Math.cos(rad) * (r + 1 + k), cy + Math.sin(rad) * (r + 1 + k), A[3], true);
    }
    // a lightning-bolt glyph in the middle
    const bolt: [number, number][] = [[2, -8], [-3, 0], [2, 0], [-2, 8]];
    for (let i = 0; i + 1 < bolt.length; i++) {
      const [ax, ay] = bolt[i];
      const [bx, by] = bolt[i + 1];
      const steps = Math.max(Math.abs(bx - ax), Math.abs(by - ay)) * 2;
      for (let k = 0; k <= steps; k++) {
        const x = cx + ax + ((bx - ax) * k) / steps;
        const y = cy + ay + ((by - ay) * k) / steps;
        b.set(x, y, A[4], true);
        b.set(x + 1, y, A[3], true);
      }
    }
    const glyphs = Math.floor(iw / 30);
    for (let gI = 0; gI < glyphs; gI++) {
      const gx = ix + 4 + Math.floor(rnd() * (iw - 14));
      const gy = iy + 3 + Math.floor(rnd() * (ih - 12));
      if (Math.hypot(gx + 4 - cx, gy + 4 - cy) < r + 10) continue;
      for (let k = 0; k < 7; k++) {
        b.set(gx + 3, gy + k, A[1], true);
        if (k === 1 || k === 5) for (let j = 0; j < 7; j++) b.set(gx + j, gy + k, A[1], true);
      }
    }
    // a lightning crack running down the panel
    let x = ix + Math.floor(rnd() * iw);
    for (let y = iy; y < iy + ih; y++) {
      b.set(x, y, A[3], true);
      if (rnd() > 0.6) x = clampI(x + (rnd() > 0.5 ? 1 : -1), ix, ix + iw - 1);
    }
  } else if (T.panel === 'glyph') {
    // carved temple relief: a step-fret border and a sun disc whose rays glow gold, moss creeping over it
    for (let x = ix; x < ix + iw; x++) {
      const f = (x - ix) % 8;
      const yy = f < 4 ? 0 : 3;
      b.set(x, iy + yy, A[1]);
      b.set(x, iy + ih - 1 - yy, A[1]);
      if (f === 0 || f === 4) for (let k = 0; k < 4; k++) {
        b.set(x, iy + k, A[1]);
        b.set(x, iy + ih - 1 - k, A[1]);
      }
    }
    const cx = ix + iw / 2;
    const cy = iy + ih / 2;
    const r = Math.max(6, Math.min(iw, ih) * 0.26);
    for (let a = 0; a < 16; a++) {
      const rad = (a / 16) * Math.PI * 2;
      const r1 = r + 2;
      const r2 = r + (a % 2 === 0 ? 9 : 5);
      for (let t = r1; t < r2; t += 0.5) b.set(cx + Math.cos(rad) * t, cy + Math.sin(rad) * t, a % 2 === 0 ? A[3] : A[2], a % 2 === 0);
    }
    for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) {
      const d = Math.hypot(x, y);
      if (d > r) continue;
      b.set(cx + x, cy + y, d > r - 1.5 ? A[3] : d < r * 0.4 ? A[4] : A[1], d > r - 1.5 || d < r * 0.4);
    }
    // a face in the disc: two eyes and a mouth line
    b.rect(cx - r * 0.45, cy - r * 0.2, 2, 2, S[0]);
    b.rect(cx + r * 0.3, cy - r * 0.2, 2, 2, S[0]);
    b.rect(cx - r * 0.35, cy + r * 0.35, r * 0.7, 1, S[0]);
    for (let m = 0; m < iw / 6; m++) {
      const mx = x0 + Math.floor(rnd() * pw);
      const my = y0 + Math.floor(rnd() * 6);
      for (let k = 0; k < 3 + Math.floor(rnd() * 6); k++) b.set(mx + (k % 2), my + k, A2[k % 3 === 0 ? 3 : 2]);
    }
  } else {
    // alcove: arched niche with a gold rim, a hanging lantern, and vines
    const ax = ix + 2;
    const aw = iw - 4;
    const ah = ih;
    const r = aw / 2;
    for (let y = 0; y < ah; y++) {
      for (let x = 0; x < aw; x++) {
        const dx = x + 0.5 - r;
        const archY = r - Math.sqrt(Math.max(0, r * r - dx * dx));
        if (y < archY * 0.6) continue;
        const edge = y < archY * 0.6 + 2 || x < 2 || x >= aw - 2;
        const t = y / ah;
        b.set(ax + x, iy + y, edge ? A[2] : mix(S[0], hex('#3a2030'), 0.5 + t * 0.3));
      }
    }
    if (aw > 30) {
      const lx = ax + Math.floor(r) - 2;
      const ly = iy + Math.floor(ah * 0.35);
      for (let y = iy + Math.floor(r * 0.3); y < ly; y++) b.set(lx + 2, y, A[0]);
      b.rect(lx, ly, 5, 7, A[1]);
      b.rect(lx + 1, ly + 1, 3, 5, A[3], true);
      b.set(lx + 2, ly + 2, A[4], true);
    }
    if (T.cap === 'snow') {
      // a shrine: a straw rope along the top with zigzag paper streamers, and icicles hanging from the arch rims
      for (let x = x0; x < x0 + pw; x++) {
        const y = y0 - 12 + Math.round(Math.sin(((x - x0) / pw) * Math.PI) * 4);
        b.set(x, y, hex((x >> 1) % 2 ? '#c8a860' : '#8a7038'));
        b.set(x, y + 1, hex('#6a5228'));
      }
      for (let s = 0; s < Math.max(2, Math.floor(pw / 22)); s++) {
        const sx = x0 + Math.round(((s + 0.5) / Math.max(2, Math.floor(pw / 22))) * pw);
        const top = y0 - 10 + Math.round(Math.sin(((sx - x0) / pw) * Math.PI) * 4);
        for (let k = 0; k < 10; k++) {
          const off = Math.floor(k / 3) % 2 ? 2 : 0;
          b.rect(sx + off, top + k, 3, 1, hex(k % 3 === 2 ? '#c8d4e4' : '#f4f8ff'));
        }
      }
      for (let v = 0; v < Math.max(3, Math.floor(pw / 10)); v++) {
        const x = x0 + Math.floor(rnd() * pw);
        const len = 3 + Math.floor(rnd() * 8);
        for (let y = 0; y < len; y++) b.set(x, iy + y, y < len - 2 ? A[3] : A[4], y >= len - 2);
      }
      return;
    }
    // vines spilling down over the facade
    for (let v = 0; v < Math.max(2, Math.floor(pw / 18)); v++) {
      let x = x0 + Math.floor(rnd() * pw);
      const len = 10 + Math.floor(rnd() * (ph + 10));
      for (let y = y0 - 14; y < y0 - 14 + len; y++) {
        b.set(x, y, A2[(y + x) % 3 === 0 ? 3 : 2]);
        if (rnd() > 0.7) b.set(x + (rnd() > 0.5 ? 1 : -1), y, A2[1]);
        if (rnd() > 0.85) x += rnd() > 0.5 ? 1 : -1;
      }
    }
  }
}

/** Geodes cracked open in the rock face: a rough rim, a lining of crystal teeth shading in to a glowing hollow, veins between. */
function geodes(b: Buf, S: Ramp, A: Ramp, A2: Ramp, x0: number, y0: number, pw: number, ph: number, rnd: () => number): void {
  const count = Math.max(1, Math.floor(pw / 46));
  for (let i = 0; i < count; i++) {
    const rx = Math.max(7, Math.min(16, pw / count / 2 - 5 + Math.floor(rnd() * 3)));
    const ry = Math.max(6, Math.min(ph * 0.34, rx * 0.8));
    const cx = x0 + Math.round(((i + 0.5) / count) * pw) + Math.floor((rnd() - 0.5) * 6);
    const cy = y0 + Math.round(ph * (0.35 + rnd() * 0.25));
    const C = rnd() > 0.8 ? A2 : A;
    for (let yy = -ry - 2; yy <= ry + 2; yy++) {
      for (let xx = -rx - 2; xx <= rx + 2; xx++) {
        const d = Math.hypot(xx / (rx + 2), yy / (ry + 2));
        if (d > 1) continue;
        const e = Math.hypot(xx / rx, yy / ry);
        if (e > 1) {
          b.set(cx + xx, cy + yy, S[(xx + yy) < 0 ? 4 : 1]); // rough rim, lit top-left
        } else if (e > 0.62) {
          // crystal teeth pointing in: alternating facets
          const ang = Math.atan2(yy, xx);
          const tooth = (Math.floor((ang + Math.PI) * 4) % 2) === 0;
          b.set(cx + xx, cy + yy, tooth ? C[2] : C[1], tooth && e < 0.75);
        } else {
          b.set(cx + xx, cy + yy, e < 0.3 ? C[4] : C[3], true); // the glowing hollow
        }
      }
    }
  }
  // glowing veins wandering across the rock between them
  for (let v = 0; v < Math.max(1, Math.floor(pw / 60)); v++) {
    let x = x0 + Math.floor(rnd() * pw);
    for (let y = y0 + 2; y < y0 + ph - 2; y++) {
      b.set(x, y, A[2], (y & 3) === 0);
      if (rnd() > 0.6) x = clampI(x + (rnd() > 0.5 ? 1 : -1), x0, x0 + pw - 1);
    }
  }
}

/** Brass-rimmed portholes glowing with sea light (one has a fish swimming past), kelp draped down the planks, barnacles. */
function portholes(b: Buf, S: Ramp, A: Ramp, A2: Ramp, x0: number, y0: number, pw: number, ph: number, rnd: () => number, sky = false): void {
  const BRASS: Ramp = ['#3a2a10', '#7a5a20', '#c09a40', '#f0d080', '#fff4c0'].map(hex);
  const KELP: Ramp = ['#0e2a1a', '#1a4a2a', '#2e7040', '#4aa058', '#8ad07a'].map(hex);
  const r = Math.max(6, Math.min(11, Math.floor(ph * 0.22)));
  const count = Math.max(1, Math.floor(pw / (r * 2 + 18)));
  const cy = y0 + Math.floor(ph * 0.42);
  const fishIn = Math.floor(rnd() * count);
  for (let i = 0; i < count; i++) {
    const cx = x0 + Math.round(((i + 0.5) / count) * pw);
    const broken = !sky && rnd() > 0.75;
    for (let yy = -r - 2; yy <= r + 2; yy++) for (let xx = -r - 2; xx <= r + 2; xx++) {
      const d = Math.hypot(xx, yy);
      if (d > r + 2) continue;
      if (d > r - 0.5) {
        // brass ring lit from the top-left
        const lit = (-xx - yy) / (r * 1.4);
        b.set(cx + xx, cy + yy, BRASS[d > r + 1.2 ? 1 : lit > 0.3 ? 4 : lit > -0.3 ? 3 : 2]);
      } else if (broken && (xx + yy * 0.6 > r * 0.2 || d < r * 0.35)) {
        b.set(cx + xx, cy + yy, S[0]); // shattered glass: dark hold behind
      } else {
        const t = (yy + r) / (2 * r);
        b.set(cx + xx, cy + yy, t < 0.3 ? A[3] : t < 0.7 ? A[2] : A[1], true);
      }
    }
    // glint and bolts
    b.set(cx - Math.round(r * 0.45), cy - Math.round(r * 0.45), A[4], true);
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      b.set(cx + Math.cos(a) * (r + 1), cy + Math.sin(a) * (r + 1), BRASS[0]);
    }
    if (!sky && i === fishIn && !broken && r >= 7) {
      // a little fish silhouette
      const fx = cx - 2;
      const fy = cy + 1;
      b.rect(fx - 3, fy - 1, 6, 3, A[0], true);
      b.rect(fx - 2, fy - 2, 4, 1, A[0], true);
      b.set(fx + 3, fy - 2, A[0], true);
      b.set(fx + 3, fy + 2, A[0], true);
      b.set(fx + 4, fy - 2, A[0], true);
      b.set(fx + 4, fy + 2, A[0], true);
      b.set(fx - 2, fy - 1, A[4], true);
    }
  }
  if (sky) {
    // a sky ship: rigging ropes swag between the portholes, and rows of rivets along the hull bands
    const ROPE: Ramp = ['#2a1c10', '#5a4024', '#8a6a40', '#c09a68', '#e8d0a0'].map(hex);
    const sy = y0 + 3;
    const sag = Math.max(5, Math.floor(ph * 0.14));
    for (let x = x0 + 2; x < x0 + pw - 2; x++) {
      const t = ((x - x0) % 40) / 40;
      const y = sy + Math.round(Math.sin(t * Math.PI) * sag);
      b.set(x, y, ROPE[(x >> 1) % 2 ? 3 : 2]);
      b.set(x, y + 1, ROPE[1]);
    }
    for (let x = x0 + 4; x < x0 + pw - 2; x += 6) {
      b.set(x, y0 + ph - 5, BRASS[3]);
      b.set(x, y0 + ph - 4, BRASS[1]);
    }
    return;
  }
  // kelp draped from the gunwale, swaying down the planks
  for (let v = 0; v < Math.max(2, Math.floor(pw / 22)); v++) {
    let x = x0 + Math.floor(rnd() * pw);
    const len = 8 + Math.floor(rnd() * (ph * 0.8));
    for (let y = y0 - 12; y < y0 - 12 + len; y++) {
      const k = (y - y0 + 12) / len;
      b.set(x, y, KELP[k < 0.3 ? 3 : k < 0.7 ? 2 : 1]);
      b.set(x + 1, y, KELP[1]);
      if ((y + x) % 7 === 0) b.set(x + 2, y, KELP[2]); // leaf
      if (rnd() > 0.8) x += rnd() > 0.5 ? 1 : -1;
    }
  }
  // barnacle clusters and the odd coral bloom on the lower planks
  for (let i = 0; i < pw / 9; i++) {
    const bx = x0 + Math.floor(rnd() * pw);
    const by = y0 + Math.floor(ph * 0.6 + rnd() * ph * 0.45);
    if (rnd() > 0.82) {
      b.set(bx, by, A2[3]);
      b.set(bx - 1, by + 1, A2[2]);
      b.set(bx + 1, by + 1, A2[2]);
      b.set(bx, by + 1, A2[1]);
    } else {
      b.set(bx, by, S[5]);
      b.set(bx + 1, by, S[4]);
      b.set(bx, by + 1, S[3]);
      b.set(bx + 1, by + 1, S[1]);
    }
  }
}

function cap(b: Buf, T: MassTheme, S: Ramp, A: Ramp, A2: Ramp, y0: number, ch: number, W: number, rnd: () => number): void {
  const M = S;
  for (let x = 0; x < W; x++) {
    const edge = x < 2 || x >= W - 2;
    for (let ly = 0; ly < ch; ly++) {
      const y = y0 + ly;
      let col: RGB;
      let em = false;
      switch (T.cap) {
        case 'hazard': {
          if (ly === 0) col = M[5];
          else if (ly < 3) col = M[4];
          else if (ly < 8) {
            col = ((x + ly) >> 2) % 2 === 0 ? A[3] : M[0];
          } else if (ly < 10) col = M[2];
          else col = M[0];
          break;
        }
        case 'slate': {
          if (ly === 0) col = M[5];
          else if (ly < 4) col = M[4];
          else if (ly === 5) {
            col = (x >> 3) % 3 === 0 ? A[3] : A[1];
            em = (x >> 3) % 3 === 0;
          } else if (ly < 10) col = M[3];
          else col = M[1];
          break;
        }
        case 'grass': {
          if (ly < 3) col = A2[ly === 0 ? 3 : 2];
          else if (ly < 5) col = (x * 13) % 7 < 3 ? A2[1] : M[4];
          else if (ly < 9) col = M[4];
          else if (ly === 9) col = A[2];
          else col = M[2];
          break;
        }
        case 'crystal': {
          // rough rock top with a glowing amethyst seam just under the surface
          if (ly === 0) col = M[5];
          else if (ly < 3) col = (x * 7 + ly) % 11 < 2 ? M[3] : M[4];
          else if (ly < 8) col = (x * 13 + ly * 5) % 17 === 0 ? M[1] : M[3];
          else if (ly === 8) {
            col = (x >> 2) % 3 === 0 ? A[3] : A[1];
            em = (x >> 2) % 3 === 0;
          } else col = M[1];
          break;
        }
        case 'snow': {
          // a thick, soft snow cover over a red-lacquered beam, then granite
          if (ly < 4) col = ly === 0 ? hex('#ffffff') : (x * 11 + ly) % 19 === 0 ? hex('#cfe2f4') : hex('#eef6ff');
          else if (ly < 6) col = hex('#b8cce4');
          else if (ly < 9) col = A2[ly === 6 ? 3 : 2];
          else if (ly === 9) col = A2[0];
          else col = M[2];
          em = ly === 0 && (x * 7) % 23 === 0; // glints in the snow
          break;
        }
        case 'deck': {
          // deck planks with tarred seams, then a brass-capped gunwale
          const seam = (x + (ly < 6 ? 0 : 23)) % 46 === 0;
          if (ly === 0) col = M[5];
          else if (ly === 1) col = M[4];
          else if (ly < 8) col = seam ? M[0] : (x * 13 + ly) % 17 === 0 ? M[2] : ly === 4 ? M[2] : M[3];
          else if (ly === 8) col = hex('#c09a40');
          else if (ly === 9) col = hex('#7a5a20');
          else col = M[1];
          break;
        }
        case 'tech': {
          if (ly === 0) col = A[3];
          else if (ly < 3) col = M[4];
          else if (ly < 6) {
            col = (x >> 3) % 2 === 0 ? A[2] : A[1];
            em = true;
          } else if (ly < 10) col = M[3];
          else col = M[0];
          break;
        }
        default: {
          // metal rail with a glowing conduit
          if (ly === 0) col = M[5];
          else if (ly < 2) col = M[4];
          else if (ly < 5) {
            col = ly === 3 ? ((x & 7) < 5 ? A[3] : A[1]) : A[0];
            em = ly === 3 && (x & 7) < 5;
          } else if (ly < 9) col = (x & 15) === 0 ? M[1] : (x & 15) === 2 && ly === 6 ? M[5] : M[3];
          else if (ly === 9) col = M[1];
          else col = M[0];
        }
      }
      if (edge && ly > 0) col = mix(col, M[0], 0.4);
      b.set(x, y, col, em);
    }
  }
  if (T.cap === 'grass') {
    // tufts and flowers above the surface (decor only, no collision)
    for (let x = 2; x < W - 2; x++) {
      if (rnd() > 0.45) continue;
      const hgt = 1 + Math.floor(rnd() * 4);
      for (let k = 1; k <= hgt; k++) b.set(x, y0 - k, A2[k === hgt ? 3 : 2]);
      if (rnd() > 0.93) {
        b.set(x, y0 - hgt - 1, rnd() > 0.5 ? hex('#ff9ab8') : hex('#fff4a0'));
      }
    }
    // grass hanging over the lip at the ledges
    for (const x0 of [0, W - 3]) for (let k = 0; k < 6; k++) b.set(x0 + 1, y0 + ch + k, A2[k < 3 ? 2 : 1]);
  }
  if (T.cap === 'snow') {
    // soft drifts heaped on the surface and icicles hanging off the lip
    for (let x = 2; x < W - 2; x++) {
      if (rnd() > 0.12) continue;
      const len = 4 + Math.floor(rnd() * 10);
      for (let k = 0; k < len; k++) {
        const hgt = Math.round(Math.sin((k / len) * Math.PI) * 2);
        for (let j = 1; j <= hgt; j++) b.set(x + k, y0 - j, j === hgt ? hex('#ffffff') : hex('#e4f0fc'));
      }
      x += len;
    }
    for (let x = 3; x < W - 3; x += 5 + Math.floor(rnd() * 6)) {
      const len = 2 + Math.floor(rnd() * 6);
      for (let k = 0; k < len; k++) b.set(x, y0 + ch + k, k === len - 1 ? hex('#ffffff') : hex('#bfe6ff'), k === len - 1);
    }
  }
  if (T.cap === 'crystal') {
    // crystal clusters poking up through the floor (decor, no collision), a few glowing
    for (let x = 4; x < W - 4; x++) {
      if (rnd() > 0.07) continue;
      const n = 1 + Math.floor(rnd() * 3);
      for (let j = 0; j < n; j++) {
        const hgt = 2 + Math.floor(rnd() * 5);
        const xx = x + j * 2 - n;
        const lit = rnd() > 0.6;
        for (let k = 1; k <= hgt; k++) b.set(xx + (k > hgt * 0.6 && j !== 1 ? (j > 1 ? 1 : -1) : 0), y0 - k, k === hgt ? A[4] : A[k > hgt / 2 ? 3 : 2], lit);
      }
      x += 6;
    }
  }
  if (T.cap === 'deck') {
    // coils of rope, a starfish, puddles catching the light, kelp hanging over the ledges
    const KELP: Ramp = ['#0e2a1a', '#1a4a2a', '#2e7040', '#4aa058', '#8ad07a'].map(hex);
    for (let i = 0; i < W / 70; i++) {
      const x = 10 + Math.floor(rnd() * (W - 24));
      const kind = rnd();
      if (kind < 0.4) {
        for (let k = 0; k < 9; k++) b.set(x + k, y0 - 1, k % 2 === 0 ? hex('#c8a870') : hex('#8a6a40'));
        for (let k = 1; k < 8; k++) b.set(x + k, y0 - 2, k % 2 === 0 ? hex('#e0c890') : hex('#8a6a40'));
        for (let k = 3; k < 6; k++) b.set(x + k, y0 - 3, hex('#c8a870'));
      } else if (kind < 0.65) {
        b.set(x, y0 - 1, A2[2]);
        b.set(x + 1, y0 - 1, A2[3]);
        b.set(x + 2, y0 - 1, A2[2]);
        b.set(x + 1, y0 - 2, A2[3]);
        b.set(x - 1, y0 - 1, A2[1]);
        b.set(x + 3, y0 - 1, A2[1]);
      } else {
        for (let k = 0; k < 6; k++) b.set(x + k, y0 + 1, A[3], true);
      }
    }
    for (const x0 of [0, W - 3]) for (let k = 0; k < 10; k++) b.set(x0 + 1 + (k > 5 ? 1 : 0), y0 + ch + k, KELP[k < 4 ? 3 : 2]);
  }
  if (T.cap === 'slate') {
    // puddle glints
    for (let i = 0; i < W / 30; i++) {
      const x = 4 + Math.floor(rnd() * (W - 12));
      for (let k = 0; k < 5; k++) b.set(x + k, y0 + 1, A[4]);
    }
  }
}

function underside(b: Buf, T: MassTheme, S: Ramp, A: Ramp, A2: Ramp, x0: number, y0: number, bw: number, uh: number, rnd: () => number, n: (x: number, y: number) => number): void {
  const prof: number[] = [];
  const stepped = T.under === 'tech' || T.under === 'machine';
  for (let x = 0; x < bw; x++) {
    const t = x / (bw - 1);
    const e = Math.abs(t - 0.5) * 2;
    let d: number;
    if (stepped) {
      const step = Math.floor(e * 5) / 5; // tiered keel
      d = uh * (1 - Math.pow(step, 1.3)) * 0.92;
    } else {
      d = uh * (1 - Math.pow(e, 1.5)) * 0.95;
      d += (n(x / 9, 3) - 0.5) * 26 + (n(x / 3, 9) - 0.5) * 8;
    }
    prof.push(Math.max(4, Math.round(d)));
  }
  for (let x = 0; x < bw; x++) {
    const bot = prof[x];
    for (let y = 0; y < bot; y++) {
      const depth = y / bot;
      let k: number;
      if (stepped) {
        const tier = Math.floor(Math.abs(x / (bw - 1) - 0.5) * 10);
        k = 3 - Math.floor(depth * 2.2) - (tier % 2);
        if ((y % 18) === 0) k = 4;
        if ((y % 18) === 1) k = 0;
      } else {
        const band = Math.floor((y + n(x / 22, y / 9) * 7) / 8) % 3;
        k = 3 - Math.floor(depth * 2.5) - (band === 1 ? 1 : 0);
        if (n(x / 2.3, y / 2.3) > 0.76) k += 1;
      }
      b.set(x0 + x, y0 + y, S[clampI(k, 0, 5)]);
    }
    b.set(x0 + x, y0 + bot - 1, S[stepped ? 4 : 1]);
  }
  // shadow right under the facade
  for (let x = 0; x < bw; x++) for (let k = 0; k < 6; k++) b.tint(x0 + x, y0 + k, 0.5 + k * 0.08);

  const tip = (x: number): number => y0 + prof[clampI(Math.round(x), 0, bw - 1)] - 1;
  if (T.under === 'crystal' || T.under === 'shard') {
    const count = Math.round(bw / 26);
    for (let i = 0; i < count; i++) {
      const x = 16 + Math.floor(rnd() * (bw - 32));
      const y = tip(x);
      const hh = 8 + Math.floor(rnd() * (T.under === 'shard' ? 22 : 16));
      const C = rnd() > 0.5 ? A : A2;
      for (let k = 0; k < hh; k++) {
        const ww = Math.max(1, Math.round(4 * (1 - k / hh)));
        for (let j = 0; j < ww; j++) b.set(x0 + x - Math.floor(ww / 2) + j, y + k, j === 0 ? C[1] : j === ww - 1 ? C[3] : C[2], true);
      }
      b.set(x0 + x, y + hh - 1, C[4], true);
    }
    // glowing veins in the rock
    for (let i = 0; i < bw / 60; i++) {
      let x = 10 + Math.floor(rnd() * (bw - 20));
      let y = y0 + 6 + Math.floor(rnd() * 20);
      for (let k = 0; k < 30 && y < tip(x) - 2; k++) {
        b.set(x0 + x, y, A[2], true);
        y++;
        if (rnd() > 0.5) x = clampI(x + (rnd() > 0.5 ? 1 : -1), 0, bw - 1);
      }
    }
  } else if (T.under === 'reef') {
    // the keel is crusted with sea life: coral fans and tubes, glowing anemones, barnacles, kelp trailing below
    const KELP: Ramp = ['#0e2a1a', '#1a4a2a', '#2e7040', '#4aa058', '#8ad07a'].map(hex);
    for (let i = 0; i < bw / 9; i++) {
      let x = 4 + Math.floor(rnd() * (bw - 8));
      let y = tip(x) - 2;
      const len = 10 + Math.floor(rnd() * 38);
      for (let k = 0; k < len; k++) {
        b.set(x0 + x, y, KELP[k < len * 0.3 ? 1 : k < len * 0.75 ? 2 : 3]);
        if (k % 6 === 3) b.set(x0 + x + 1, y, KELP[3]);
        y++;
        if (rnd() > 0.6) x += Math.sin(k * 0.6 + i) > 0 ? 1 : -1;
      }
    }
    for (let i = 0; i < bw / 30; i++) {
      // coral: a branching cluster growing off the hull
      const x = 10 + Math.floor(rnd() * (bw - 20));
      const y = tip(x) - 3;
      const C = rnd() > 0.35 ? A2 : A;
      for (let br = -2; br <= 2; br++) {
        let cx = x;
        for (let k = 0; k < 6 + Math.abs(br) * 2; k++) {
          b.set(x0 + cx, y + k, C[k < 3 ? 1 : k < 6 ? 2 : 3], C === A);
          if (k % 2 === 1) cx += br > 0 ? 1 : br < 0 ? -1 : 0;
        }
        b.set(x0 + cx, y + 6 + Math.abs(br) * 2, C[4], true);
      }
    }
    for (let i = 0; i < bw / 7; i++) {
      // barnacles and limpets on the planks
      const x = Math.floor(rnd() * bw);
      const y = y0 + 8 + Math.floor(rnd() * Math.max(1, prof[x] - 12));
      b.set(x0 + x, y, S[5]);
      b.set(x0 + x + 1, y, S[4]);
      b.set(x0 + x, y + 1, S[2]);
      if (rnd() > 0.85) b.set(x0 + x + 1, y + 1, A[3], true);
    }
    // a breach in the hull: dark hold with sea-light inside
    if (bw > 120) {
      const hx = Math.floor(bw * (0.3 + rnd() * 0.4));
      const hy = y0 + 12;
      for (let yy = 0; yy < 14; yy++) for (let xx = -12; xx <= 12; xx++) {
        const edge = Math.abs(xx) + (yy - 7) * (yy - 7) * 0.25 + Math.sin(xx * 1.7 + yy) * 1.5;
        if (edge > 11 || hy + yy >= tip(hx + xx) - 2) continue;
        b.set(x0 + hx + xx, hy + yy, edge > 9 ? S[4] : yy > 9 ? A[1] : S[0], yy > 9 && edge <= 9);
      }
    }
  } else if (T.under === 'roots') {
    for (let i = 0; i < bw / 7; i++) {
      let x = 6 + Math.floor(rnd() * (bw - 12));
      let y = tip(x) - 2;
      const len = 6 + Math.floor(rnd() * 30);
      for (let k = 0; k < len; k++) {
        b.set(x0 + x, y, k < len * 0.5 ? S[1] : A2[rnd() > 0.5 ? 2 : 1]);
        y++;
        if (rnd() > 0.65) x += rnd() > 0.5 ? 1 : -1;
      }
    }
    // gold ore glints
    for (let i = 0; i < bw / 14; i++) {
      const x = Math.floor(rnd() * bw);
      const y = y0 + 8 + Math.floor(rnd() * Math.max(1, prof[x] - 12));
      b.set(x0 + x, y, A[3], true);
      b.set(x0 + x + 1, y, A[2]);
    }
  } else if (T.under === 'machine') {
    // thrusters at the tier steps, glowing down
    const nozzles = Math.max(2, Math.round(bw / 90));
    for (let i = 0; i < nozzles; i++) {
      const x = Math.round(bw * ((i + 0.5) / nozzles));
      const y = tip(x);
      b.rect(x0 + x - 6, y, 12, 5, S[3]);
      b.rect(x0 + x - 5, y + 5, 10, 3, S[1]);
      for (let k = 0; k < 10; k++) {
        const ww = Math.max(1, 8 - k);
        for (let j = 0; j < ww; j++) b.set(x0 + x - Math.floor(ww / 2) + j, y + 8 + k, k < 2 ? A[4] : k < 5 ? A[3] : A[2], true);
      }
    }
    for (let i = 0; i < 3; i++) {
      const y = y0 + 12 + i * 16;
      for (let x = 0; x < bw; x++) {
        if (y >= tip(x) - 2) continue;
        b.set(x0 + x, y, S[4]);
        b.set(x0 + x, y + 1, S[2]);
        if (x % 40 === 8) b.set(x0 + x, y + 1, A[3], true);
      }
    }
  } else {
    // tech: light seams along each tier and a glowing core at the keel
    for (let x = 0; x < bw; x++) {
      const y = tip(x);
      b.set(x0 + x, y - 2, A[2], true);
    }
    const cx = Math.round(bw / 2);
    const cy = tip(cx) - 10;
    for (let yy = -7; yy <= 7; yy++) for (let xx = -7; xx <= 7; xx++) {
      const d = Math.hypot(xx, yy);
      if (d <= 6) b.set(x0 + cx + xx, cy + yy, d < 2.5 ? A[4] : d < 4.5 ? A[3] : A[1], d < 4.5);
    }
  }
}

/** Art px drawn above a pass-through platform's surface (rails, tufts) and below its slab (supports, emitters). */
export const PLAT_HEAD = 6;
export const PLAT_TAIL = 16;

/**
 * A pass-through (or moving) platform as one piece: a slab with a lit top edge in the stage's style and an underside that says
 * how it floats: hover emitters, thrusters, cloud puffs, or ropes and lanterns. `w`, `h` in world units.
 */
export function platformArt(themeId: string | undefined, w: number, h: number, moving: boolean, seed: number): HTMLCanvasElement {
  const T = THEMES[themeId ?? 'skyline'] ?? THEMES.skyline;
  const S: Ramp = T.stone.map(hex);
  const A: Ramp = T.accent.map(hex);
  const rnd = mulberry32(seed * 131 + 7);
  const PW = Math.round(w * 2);
  const PH = Math.max(8, Math.round(h * 2));
  const W = PW;
  const H = PLAT_HEAD + PH + PLAT_TAIL;
  const b = new Buf(W, H);
  const y0 = PLAT_HEAD;
  const amber: Ramp = ['#4a2a18', '#8a4f2c', '#d9822b', '#ffb02e', '#ffe08a'].map(hex);
  const G = moving && T.cap !== 'grass' && T.cap !== 'slate' ? amber : A;
  // grass themes: wooden bridges; moving ones are clouds at dawn and carved stone altars in the temple
  const stoneAltar = T.panel === 'glyph' && moving;
  const deck = T.cap === 'deck';
  if (T.cap === 'crystal') return rockShelf(b, S, A, W, PH, y0, moving, seed);
  const snowy = T.cap === 'snow';
  const woody = (T.cap === 'grass' && !stoneAltar) || deck || snowy;

  if (T.cap === 'slate' || (woody && moving && !deck)) {
    // cloud slab: a flat top you can stand on, billowing underneath
    const top = T.cap === 'slate' ? hex('#e8f2ff') : hex('#fff0e0');
    const mid = T.cap === 'slate' ? hex('#b6c9e2') : hex('#f4c8b8');
    const low = T.cap === 'slate' ? hex('#6e88ae') : hex('#c48aa0');
    const n = noise(seed + 9);
    for (let x = 0; x < W; x++) {
      const edge = Math.min(x, W - 1 - x);
      const round = edge < 6 ? Math.round(Math.sqrt(36 - (6 - edge) * (6 - edge)) - 6) : 0; // rounded ends
      const bottom = y0 + PH + Math.round(n(x / 7, 1) * 9) + round;
      for (let y = y0 - round * 0 - (edge < 6 ? 0 : 0); y < bottom; y++) {
        const t = (y - y0) / Math.max(1, bottom - y0);
        let c = t < 0.15 ? top : t < 0.6 ? mid : low;
        if (n(x / 3, y / 3) > 0.72 && t > 0.2) c = mix(c, top, 0.35);
        if (edge < 6 && y < y0 + (6 - edge) / 2) continue;
        b.set(x, y, c);
      }
    }
    for (let x = 4; x < W - 4; x += 9) b.set(x + Math.floor(rnd() * 4), y0 + 2, T.cap === 'slate' ? A[3] : hex('#ffffff'), T.cap === 'slate');
    return finish(b, W, H);
  }

  // slab
  for (let x = 0; x < W; x++) {
    for (let ly = 0; ly < PH; ly++) {
      const y = y0 + ly;
      let c: RGB;
      if (woody) {
        // wooden planks with a pale top edge
        const plank = Math.floor(x / 14);
        const lacquer = T.alt ? T.alt.map(hex) : A;
        const base = snowy ? mix(lacquer[1], lacquer[2], (plank * 37) % 5 / 5) : deck ? mix(S[3], S[4], (plank * 37) % 5 / 5) : mix(hex('#8a5a2c'), hex('#a06a34'), (plank * 37) % 5 / 5);
        c = ly === 0 ? (snowy ? hex('#ffffff') : deck ? S[5] : hex('#e8d6a8')) : ly === 1 ? (snowy ? hex('#e4f0fc') : deck ? hex('#c09a40') : hex('#d49a58')) : ly === PH - 1 ? (snowy ? lacquer[0] : deck ? S[0] : hex('#3a2410')) : base;
        if (x % 14 === 0 && ly > 0) c = hex('#5a3a1c');
        if (ly === 4 && (x + plank * 3) % 9 === 0) c = hex('#5a3a1c');
      } else {
        c = ly === 0 ? S[5] : ly === 1 ? S[4] : ly === PH - 1 ? S[0] : S[2];
        if (ly === 3) c = (x >> 2) % 3 === 0 ? G[3] : G[1];
        if (T.cap === 'hazard' && ly >= 4 && ly < PH - 2) c = ((x + ly) >> 2) % 2 === 0 ? (moving ? G[2] : S[3]) : S[0];
        if (ly >= 4 && ly < PH - 1 && x % 20 === 0) c = S[1];
      }
      const em = !woody && ly === 3 && (x >> 2) % 3 === 0;
      const end = x < 2 || x >= W - 2;
      b.set(x, y, end && ly > 0 ? mix(c, S[0], 0.45) : c, em);
    }
  }
  const bot = y0 + PH;
  if (deck && moving) {
    // a floating raft: lashed to two barrels bobbing underneath, kelp trailing
    for (const x of [Math.round(W * 0.22), Math.round(W * 0.78)]) {
      for (let yy = 0; yy < 12; yy++) for (let xx = -7; xx <= 7; xx++) {
        const bulge = 7 - Math.round(Math.abs(yy - 5.5) * 0.35);
        if (Math.abs(xx) > bulge) continue;
        let c = xx < -3 ? S[4] : xx < 3 ? S[3] : S[1];
        if (yy === 2 || yy === 9) c = hex('#5a6266');
        b.set(x + xx, bot + yy, c);
      }
    }
    for (let x = 6; x < W - 6; x += 17) for (let k = 0; k < 6 + (x % 5); k++) b.set(x + (k % 4 < 2 ? 0 : 1), bot + k, hex('#2e7040'));
    return finish(b, W, H);
  }
  if (woody) {
    // rope rail posts above, lanterns and rope loops below
    for (const x of [3, W - 4]) for (let k = 1; k <= 5; k++) b.set(x, y0 - k, hex('#6a4220'));
    for (let x = 3; x < W - 3; x++) b.set(x, y0 - 5 + Math.round(Math.sin(((x - 3) / (W - 6)) * Math.PI) * 2), hex('#c8a070'));
    for (let x = 10; x < W - 6; x += 26) {
      for (let k = 0; k < 4; k++) b.set(x + 1, bot + k, hex('#6a4a2a'));
      b.rect(x, bot + 4, 3, 4, A[3], true);
      b.set(x + 1, bot + 5, A[4], true);
    }
    for (let x = 2; x < W - 2; x++) b.set(x, bot + 1 + Math.round(Math.sin(x * 0.25) * 1.5 + 1.5), hex('#8a6a4a'));
  } else {
    // hover emitters (or thrusters on moving platforms) at both ends, with a glow falling away
    const ex = [Math.round(W * 0.18), Math.round(W * 0.82)];
    if (W > 120) ex.splice(1, 0, Math.round(W / 2));
    for (const x of ex) {
      b.rect(x - 5, bot, 10, 3, S[3]);
      b.rect(x - 4, bot + 3, 8, 2, S[1]);
      for (let k = 0; k < (moving ? 9 : 6); k++) {
        const ww = Math.max(1, (moving ? 6 : 6) - k);
        for (let j = 0; j < ww; j++) b.set(x - Math.floor(ww / 2) + j, bot + 5 + k, k < 2 ? G[4] : k < 4 ? G[3] : G[2], true);
      }
    }
    // a truss under the slab between the emitters
    for (let x = ex[0]; x < ex[ex.length - 1]; x++) {
      b.set(x, bot, S[1]);
      if ((x - ex[0]) % 12 < 6) b.set(x, bot + 1 + ((x - ex[0]) % 12 < 3 ? 0 : 1), S[2]);
    }
  }
  return finish(b, W, H);
}

/** A rock shelf jutting out of the cave wall: a flat lit top, a jagged tapering underside and crystals hanging off it. */
function rockShelf(b: Buf, S: Ramp, A: Ramp, W: number, PH: number, y0: number, moving: boolean, seed: number): HTMLCanvasElement {
  const n = noise(seed + 5);
  const rnd = mulberry32(seed * 31 + 3);
  for (let x = 0; x < W; x++) {
    const edge = Math.min(x, W - 1 - x) / W;
    const depth = PH + Math.round(Math.max(0, 0.5 - Math.abs(x / W - 0.5)) * 18 + n(x / 5, 2) * 5);
    for (let ly = 0; ly < depth; ly++) {
      const t = ly / depth;
      let c = ly === 0 ? S[5] : ly < 2 ? S[4] : t < 0.6 ? S[3] : S[2];
      if (n(x / 2.5, ly / 2.5) > 0.74) c = S[1];
      if (edge < 0.04 && ly > 1) c = S[1];
      b.set(x, y0 + ly, c);
    }
    b.set(x, y0 + depth - 1, S[0]);
  }
  // crystals hanging off the underside, glowing at their tips
  for (let i = 0; i < Math.max(2, Math.floor(W / 22)); i++) {
    const x = 4 + Math.floor(rnd() * (W - 8));
    const len = 4 + Math.floor(rnd() * (moving ? 6 : 9));
    const by = y0 + PH + 2;
    for (let k = 0; k < len; k++) {
      const ww = Math.max(1, 3 - Math.floor((k / len) * 3));
      for (let j = 0; j < ww; j++) b.set(x + j - Math.floor(ww / 2), by + k, k > len - 3 ? A[4] : A[2], k > len - 3);
    }
  }
  return finish(b, W, b.h);
}

function finish(b: Buf, W: number, H: number): HTMLCanvasElement {
  bloom(b, 3, 0.6);
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  const img = g.createImageData(W, H);
  for (let i = 0; i < W * H; i++) {
    const glowA = b.a[i] ? 0 : Math.min(1, (b.glow[i * 3] + b.glow[i * 3 + 1] + b.glow[i * 3 + 2]) / 300);
    if (!b.a[i] && glowA < 0.04) continue;
    img.data[i * 4] = clampI(Math.round(b.c[i * 3]), 0, 255);
    img.data[i * 4 + 1] = clampI(Math.round(b.c[i * 3 + 1]), 0, 255);
    img.data[i * 4 + 2] = clampI(Math.round(b.c[i * 3 + 2]), 0, 255);
    img.data[i * 4 + 3] = b.a[i] ? 255 : Math.round(glowA * 120);
  }
  g.putImageData(img, 0, 0);
  return c;
}
