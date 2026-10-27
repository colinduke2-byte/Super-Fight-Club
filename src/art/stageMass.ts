/**
 * Solid stage platforms drawn as one designed structure instead of tiled bricks: a walkable cap that overhangs the ledges, a
 * cornice, a facade of masonry or plating with pillars and themed recessed panels (lit windows, vents, runes, alcoves), and an
 * underside that tapers to a keel. Lit from the top-left like the fighters, fading into the backdrop's haze with depth.
 *
 * Drawn at art density (2 px per world unit). The canvas is `w*2 + 2*OVER` wide; the walking surface is row `HEAD`.
 */
import { mulberry32 } from './rng';
import { context2d } from './canvasTexture';

type RGB = [number, number, number];
type Ramp = RGB[];

export const MASS_OVER = 4; // art px the cap overhangs each ledge
export const MASS_HEAD = 8; // art px of headroom above the walking surface (grass tufts, lamps)

/**
 * True when solid platform `p` rests on top of another solid one (a tier), or butts end to end against another at the
 * same height (one long structure split into pieces, like the Launch runway): it is drawn without a keel.
 */
export function isSeated(p: { x: number; y: number; w: number; h: number }, all: ReadonlyArray<{ x: number; y: number; w: number; h: number; kind: string }>): boolean {
  const bottom = p.y + p.h;
  const same = (q: { x: number; y: number; w: number; h: number }): boolean => q.x === p.x && q.y === p.y && q.w === p.w && q.h === p.h; // the sim's Platform is a copy of its def
  const abuts = (q: { x: number; y: number; w: number }): boolean => q.y === p.y && (q.x + q.w === p.x || p.x + p.w === q.x);
  return all.some((q) => q !== p && !same(q) && q.kind === 'solid' && abuts(q)) || all.some((q) => q !== p && !same(q) && q.kind === 'solid' && bottom >= q.y && bottom <= q.y + q.h && p.x >= q.x && p.x + p.w <= q.x + q.w);
}

interface MassTheme {
  stone: string[]; // 6 shades, dark -> light
  accent: string[]; // 5 shades, dark -> bright (emissive)
  alt?: string[]; // second accent
  body: 'ashlar' | 'plate' | 'hull' | 'rock';
  cap: 'metal' | 'tech' | 'hazard' | 'slate' | 'grass' | 'deck' | 'crystal' | 'snow' | 'dais' | 'track';
  panel: 'window' | 'holo' | 'vent' | 'rune' | 'alcove' | 'glyph' | 'porthole' | 'geode';
  under: 'crystal' | 'tech' | 'machine' | 'shard' | 'roots' | 'reef' | 'galleon' | 'ice' | 'spire';
  /**
   * The facade's own architecture, replacing the shared pillars-and-bays template: 'deco' an art-deco tower crown (piers,
   * window strips, a sunburst), 'ring' a training ring's apron (corner posts, glowing ropes, quilted padding, a hex crest),
   * 'tower' a storm-beaten tower (buttresses, lancet windows, copper lightning conductors, a rose window), 'throne' the
   * Overseer's dais (obsidian blade-pillars, carved eye reliefs, one great eye), 'boards' a stadium runway wall (sponsor
   * boards and distance posts).
   */
  facade?: 'deco' | 'ring' | 'tower' | 'throne' | 'boards';
  /**
   * The structure's outline below the cornice (art only: the collision box is unchanged). 'hull' tapers like a ship, bow left;
   * 'steps' is a stepped temple; 'outcrop' a jagged rock mass; 'shelf' an undercut ice shelf; 'housing' a machined reactor
   * casing with stepped chamfers; 'chamfer' a bevelled tech block; 'setback' an art-deco setback; 'ruin' broken corners;
   * 'bridge' a straight bridge deck whose arches are open to the sky.
   */
  shape: 'hull' | 'steps' | 'outcrop' | 'shelf' | 'housing' | 'chamfer' | 'setback' | 'ruin' | 'bridge';
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
    shape: 'setback',
    facade: 'deco',
    fog: '#2a1846',
  },
  void: {
    stone: ['#08131f', '#0e2032', '#16304a', '#204464', '#2e5e86', '#4a84ac'],
    accent: ['#0e3a48', '#1a7088', '#3ad0e8', '#a0f4ff', '#eaffff'],
    body: 'plate',
    cap: 'tech',
    panel: 'holo',
    under: 'tech',
    shape: 'chamfer',
    facade: 'ring',
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
    shape: 'housing',
    fog: '#3a1208',
  },
  storm: {
    stone: ['#0c1219', '#151e29', '#202c3b', '#2e3d52', '#405472', '#5a7096'],
    accent: ['#103a5a', '#1c6a9c', '#46a8e8', '#9fd8ff', '#e6f6ff'],
    body: 'ashlar',
    cap: 'slate',
    panel: 'rune',
    under: 'shard',
    shape: 'ruin',
    facade: 'tower',
    fog: '#141e30',
  },
  apex: {
    // the Overseer's dais: ivory marble, obsidian, violet light
    stone: ['#241c30', '#4a4058', '#7a7088', '#aea6b6', '#d6d0d6', '#f4f0ea'],
    accent: ['#2a1450', '#5a2c9a', '#9a5cf0', '#d2b0ff', '#f6eaff'],
    alt: ['#140e1e', '#2a2236', '#3e344e', '#544866', '#6e6084', '#9a8cb8'],
    body: 'ashlar',
    cap: 'dais',
    panel: 'rune',
    under: 'spire',
    shape: 'steps',
    facade: 'throne',
    fog: '#1c1030',
  },
  stadium: {
    // the Launch Contest runway: poured concrete, a red track on top, sponsor boards in amber and cyan
    stone: ['#16171c', '#24262e', '#363842', '#4c4e5a', '#686a78', '#9294a0'],
    accent: ['#4a2a10', '#9a5a18', '#ffa030', '#ffd27a', '#fff2d0'],
    alt: ['#0c3040', '#147090', '#3ac8f0', '#a0eaff', '#e8fcff'],
    body: 'plate',
    cap: 'track',
    panel: 'vent',
    under: 'tech',
    shape: 'chamfer',
    facade: 'boards',
    fog: '#20203a',
  },
  temple: {
    stone: ['#1a2420', '#26342c', '#34463a', '#46604c', '#5e7c62', '#82a080'],
    accent: ['#5a3a10', '#a06a1c', '#e8a83a', '#ffd870', '#fff4c0'],
    alt: ['#1a4a22', '#2e7034', '#4a9e48', '#7ad06a', '#c8f4a0'],
    body: 'ashlar',
    cap: 'grass',
    panel: 'glyph',
    under: 'roots',
    shape: 'steps',
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
    shape: 'hull',
    fog: '#0c2a3a',
  },
  cavern: {
    // cave rock: cool dark granite, amethyst seams and clusters, a teal mineral glint
    stone: ['#16121a', '#221c26', '#302834', '#423846', '#58505c', '#746a78'],
    accent: ['#3a1f66', '#6a34a0', '#a868e0', '#d8b0ff', '#f4e8ff'],
    alt: ['#0e3a40', '#1c6a70', '#3ac8c0', '#9ff4e8', '#e8fffc'],
    body: 'rock',
    cap: 'crystal',
    panel: 'geode',
    under: 'crystal',
    shape: 'outcrop',
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
    under: 'ice',
    shape: 'shelf',
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
    under: 'galleon',
    shape: 'hull',
    fog: '#4a2a5e',
  },
  harbour: {
    // a timber pier on barnacled pilings: tarred planks, weathered grey wood, sodium lamps, a teal sea-glow below
    stone: ['#121418', '#1e2228', '#2e333a', '#424850', '#5c626a', '#80868c'],
    accent: ['#4a2a08', '#8a5414', '#e09030', '#ffc860', '#fff0c0'],
    alt: ['#0a3a40', '#127078', '#2ad0c8', '#8af8e8', '#e0fff8'],
    body: 'hull',
    cap: 'deck',
    panel: 'window',
    under: 'reef',
    shape: 'bridge',
    fog: '#0c1a2e',
  },
  rail: {
    // a sky-rail carriage roof: dark lacquered steel, lit carriage windows in cyan, magenta running lights, bogies below
    stone: ['#0e0c1c', '#1a1830', '#28264a', '#3a3864', '#544f84', '#7a74aa'],
    accent: ['#0e3a48', '#1a7088', '#3ad0e8', '#a0f4ff', '#eaffff'],
    alt: ['#4a0e40', '#8a1e70', '#e04ab0', '#ff9ad8', '#ffe6f6'],
    body: 'plate',
    cap: 'tech',
    panel: 'window',
    under: 'machine',
    shape: 'chamfer',
    fog: '#1c1440',
  },
  dawn: {
    stone: ['#8a6a66', '#a88a82', '#c6aa9c', '#dcc6b2', '#eedcc8', '#fff4e4'],
    accent: ['#6a4a1c', '#b08a30', '#e8c050', '#ffe08a', '#fff4c0'],
    alt: ['#2a5a32', '#3e8a48', '#64b45e', '#9ad87a', '#d4f4b0'],
    body: 'ashlar',
    cap: 'grass',
    panel: 'alcove',
    under: 'roots',
    shape: 'bridge',
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
  /** Remove a pixel (cut away from the silhouette, or open to the sky). */
  clear(x: number, y: number): void {
    x = Math.round(x);
    y = Math.round(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = y * this.w + x;
    this.a[i] = 0;
    this.em[i] = 0;
    this.c[i * 3] = this.c[i * 3 + 1] = this.c[i * 3 + 2] = 0;
    this.glow[i * 3] = this.glow[i * 3 + 1] = this.glow[i * 3 + 2] = 0;
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
export function stageMassPixels(themeId: string | undefined, w: number, h: number, seed: number, seated = false): ArtPixels {
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
  const TAIL = seated ? 0 : 44; // room below the keel for what hangs from it (crystals, a lantern, a pendant)
  const H = MASS_HEAD + BH + UNDER + TAIL;
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
  if (T.body === 'rock') rockFace(b, S, X0, bodyTop, BW, bodyBot - bodyTop, n1, n2, rnd);
  else for (let y = bodyTop + CORN, row = 0; y < bodyBot; row++) {
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
  let baysN = Math.max(1, Math.round(BW / 170));
  if (baysN >= 2 && baysN % 2 === 0) baysN += BW / baysN > 180 ? 1 : -1; // an odd count, so there is a middle bay
  const inner = baysN - 1;
  // bays are not all equal: the middle one is wider, the end ones a little narrower, so the facade has a centre
  const bays = inner + 1;
  const weights = Array.from({ length: bays }, (_, i) => {
    const mid = (bays - 1) / 2;
    if (bays >= 3 && Math.abs(i - mid) < 0.6) return bays % 2 ? 1.7 : 1.25;
    return i === 0 || i === bays - 1 ? 0.85 : 1;
  });
  const wsum = weights.reduce((a, b2) => a + b2, 0);
  const pillars: number[] = [X0];
  let acc = 0;
  for (let i = 0; i < bays - 1; i++) {
    acc += weights[i];
    pillars.push(Math.round(X0 + (BW - PW) * (acc / wsum)));
  }
  pillars.push(X0 + BW - PW);
  const centreBay = bays >= 3 && bays % 2 ? (bays - 1) / 2 : -1;
  const panelTop = bodyTop + CORN + 8;
  const panelBot = Math.min(bodyBot - 10, panelTop + Math.max(36, Math.round(BH * 0.55)));
  if (T.body === 'hull') {
    // a ship's side is one continuous run of planking: no bays or pillars, one even row of portholes along the whole length
    portholes(b, S, A, A2, X0 + 16, panelTop, BW - 32, panelBot - panelTop, rnd, T.under === 'galleon', 40);
    hullPaint(b, T, S, A, A2, X0, BW, panelBot, bodyBot, n2);
  } else if (T.body === 'rock') {
    // a cave outcrop: geodes cracked open at random in the rock, no masonry or columns
    geodeScatter(b, S, A, A2, X0 + 10, panelTop - 4, BW - 20, Math.max(24, bodyBot - panelTop - 6), rnd);
  } else if (T.facade) {
    facade(b, T, S, A, A2, X0, BW, bodyTop + CORN, panelTop, panelBot, bodyBot, rnd, n2, seed);
  } else {
    for (let i = 0; i + 1 < pillars.length; i++) {
      const px0 = pillars[i] + PW + 6;
      const px1 = pillars[i + 1] - 6;
      if (px1 - px0 < 20) continue;
      panel(b, T, S, A, A2, px0, panelTop, px1 - px0, panelBot - panelTop, rnd, n2, i === centreBay || bays === 1, i);
      if (i === centreBay) centrepiece(b, T, S, A, A2, px0, panelTop, px1 - px0, panelBot - panelTop);
    }
    for (const x of pillars) pillar(b, S, A, T, x, bodyTop, PW, bodyBot - bodyTop, panelBot);
  }
  if (T.under === 'ice') iceShelf(b, X0, BW, panelBot + 6, bodyBot, n1, n2, rnd);

  // ---- 3. cornice under the cap: protruding band with dentils and a cast shadow (a rough rock lip on an outcrop) -----
  if (T.body === 'rock') {
    for (let x = X0; x < X0 + BW; x++) {
      for (let y = bodyTop; y < bodyTop + CORN; y++) {
        const k = y - bodyTop < 2 ? 4 : n2(x / 3, y / 3) > 0.7 ? 3 : 2;
        b.set(x, y, S[k]);
      }
      for (let k = 0; k < 4; k++) b.tint(x, bodyTop + CORN + k, 0.6 + k * 0.1);
    }
  } else for (let x = X0; x < X0 + BW; x++) {
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
  // the facade sits right under the fighters' feet: its lights are kept low so the fighters stay the brightest thing at play
  // height, and the stage's light show moves to the underside, below the playfield
  dimEmissive(b, bodyTop, bodyBot, FACADE_LIGHT);

  // ---- 4. the walking surface -------------------------------------------------------------------------------------
  cap(b, T, S, A, A2, Y0, CAP, W, rnd);
  // Harbour Pier: the pier's end is the walk-off's blast line, so the last stretch of deck is painted as a dock edge
  if (themeId === 'harbour' && !seated) dockEnd(b, A, X0 + BW, Y0);

  // ---- 5. underside keel -------------------------------------------------------------------------------------------
  if (!seated) underside(b, T, S, A, A2, X0, bodyBot, BW, UNDER, rnd, n1);

  // ---- 5b. the stage's own silhouette: carve the outline below the cornice (the walkable top and ledges stay square) ---
  if (!seated) carve(b, T, S, X0, BW, bodyTop + CORN + 6, bodyBot, bodyBot + UNDER, n1);

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
  return toPixels(b, W, H);
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

/** The wide middle bay gets one themed landmark over its panel, so a long facade has a focal point. */
function centrepiece(b: Buf, T: MassTheme, S: Ramp, A: Ramp, A2: Ramp, x0: number, y0: number, pw: number, ph: number): void {
  const cx = Math.round(x0 + pw / 2);
  const cy = Math.round(y0 + ph / 2);
  const disc = (r: number, fill: (d: number, dx: number, dy: number) => RGB | null, em = false): void => {
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const d = Math.hypot(dx, dy);
      if (d > r + 0.3) continue;
      const col = fill(d, dx, dy);
      if (col) b.set(cx + dx, cy + dy, col, em);
    }
  };
  const r = Math.max(8, Math.min(Math.floor(ph / 2) - 3, 20));
  switch (T.panel) {
    case 'window': {
      // a big neon clock face over the windows
      disc(r, (d) => (d > r - 2 ? S[4] : d > r - 3 ? A[1] : S[0]));
      for (let h = 0; h < 12; h++) {
        const a = (h / 12) * Math.PI * 2;
        b.set(cx + Math.round(Math.cos(a) * (r - 5)), cy + Math.round(Math.sin(a) * (r - 5)), h % 3 ? A[2] : A2[3], true);
      }
      for (let k = 0; k < r - 6; k++) b.set(cx + Math.round(k * 0.5), cy - Math.round(k * 0.85), A[3], true);
      for (let k = 0; k < r - 9; k++) b.set(cx + k, cy + Math.round(k * 0.25), A2[3], true);
      b.set(cx, cy, A[4], true);
      break;
    }
    case 'vent': {
      // a blast door with hazard chevrons and a warning lamp
      const w = Math.min(pw - 16, 46);
      const h = ph - 8;
      const lx = cx - Math.floor(w / 2);
      const ty = y0 + 4;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const edge = x < 2 || y < 2 || x >= w - 2 || y >= h - 2;
        const stripe = (y > h - 9 || y < 7) && ((x + y) >> 2) % 2 === 0;
        b.set(lx + x, ty + y, edge ? S[4] : stripe ? A[3] : x === (w >> 1) ? S[0] : S[2 + ((y >> 3) % 2)]);
      }
      disc(4, (d) => (d < 2 ? A2[4] : A2[2]), true);
      break;
    }
    case 'rune':
    case 'glyph': {
      // a larger seal ringed with light
      disc(r, (d) => (d > r - 1.5 ? A[3] : d > r - 3 ? A[1] : null), true);
      disc(Math.round(r * 0.45), (d) => (d < 2 ? A[4] : A[2]), true);
      break;
    }
    case 'alcove': {
      if (T.cap === 'snow') {
        // the mountain shrine's middle arch holds a frozen waterfall: pale ice columns spilling from the arch and heaping
        // into a frozen pool at its foot, a few glints catching the lantern light
        const ICEF: Ramp = ['#2e5e86', '#4e88b4', '#86bce0', '#bfe2f8', '#eefaff'].map(hex);
        const fw = Math.max(10, Math.round(pw * 0.42));
        const fx = cx - Math.floor(fw / 2);
        const fTop = y0 + Math.round(ph * 0.12);
        const fBot = y0 + ph - 2;
        for (let x = 0; x < fw; x++) {
          const u = x / (fw - 1);
          const col = Math.floor(x / 3); // columns of ice
          const start = fTop + ((col * 5) % 7);
          const flare = Math.round(Math.max(0, Math.abs(u - 0.5) * 2 - 0.55) * 14); // the foot spreads out
          for (let y = start; y < fBot; y++) {
            if (fBot - y < flare && (u < 0.2 || u > 0.8)) continue;
            const v = (y - start) / Math.max(1, fBot - start);
            let k = col % 2 === 0 ? 3 : 2;
            if (u < 0.15) k += 1; // lit from the left
            if (u > 0.85) k -= 1;
            if (x % 3 === 2) k -= 1; // the groove between columns
            if (v > 0.82) k = Math.max(k, 3); // the frozen pool
            b.set(fx + x, y, ICEF[clampI(k, 0, 4)]);
          }
        }
        // the frozen pool widens under the fall
        for (let x = -Math.round(fw * 0.7); x <= Math.round(fw * 0.7); x++) {
          const hgt = Math.round(4 * Math.sqrt(Math.max(0, 1 - (x / (fw * 0.7)) ** 2)));
          for (let k = 0; k < hgt; k++) b.set(cx + x, fBot - k, ICEF[k === hgt - 1 ? 4 : 2]);
        }
        for (let g = 0; g < 4; g++) b.set(fx + 2 + Math.round((g / 3) * (fw - 5)), fTop + 6 + ((g * 11) % Math.max(1, fBot - fTop - 10)), ICEF[4], true);
        break;
      }
      // the sunlit bridge's middle arch: a gilded keystone medallion where the bell used to hang (metal catching the sun)
      const BR: Ramp = ['#5a3a18', '#8e5e28', '#c89048', '#f4d08a', '#fff4d0'].map(hex);
      const ky = y0 + 3;
      const kr = 7;
      for (let dy = -kr - 2; dy <= kr + 2; dy++) for (let dx = -kr - 2; dx <= kr + 2; dx++) {
        const d = Math.hypot(dx, dy);
        if (d > kr + 2.3) continue;
        const lit = (-dx - dy) / (kr * 1.4);
        const k = d > kr + 0.8 ? 0 : d > kr - 1 ? (lit > 0.2 ? 4 : lit > -0.3 ? 3 : 1) : d < 2 ? 4 : (Math.round(Math.atan2(dy, dx) / (Math.PI / 6)) & 1) === 0 ? 3 : 2;
        b.set(cx + dx, ky + dy, BR[k]);
      }
      break;
    }
    case 'porthole': {
      // one great round window in the middle bay: a brass rim, sea glow (or sunset) inside, a cross of glazing bars
      const R2 = Math.max(9, Math.min(Math.floor(ph / 2) - 1, 24));
      const G = T.under === 'reef' ? A : A2; // sea glow on the wreck, the sunset through the airship's window
      disc(R2, (d, dx, dy) => {
        if (d > R2 - 2.2) return dy < 0 ? A[3] : A[1];
        if (d > R2 - 3.2) return S[0];
        if (dx === 0 || dy === 0) return S[1];
        const t = (dy + R2) / (2 * R2);
        return t < 0.35 ? G[3] : t < 0.7 ? G[2] : G[1];
      }, false);
      disc(R2 - 4, (d, dx, dy) => (dx === 0 || dy === 0 ? null : d < R2 - 7 && dx < 0 && dy < 0 && dx + dy < -R2 * 0.6 ? G[4] : null), true);
      break;
    }
    case 'geode':
    case 'holo':
    default: {
      disc(Math.round(r * 0.7), (d) => (d < r * 0.25 ? A[4] : d < r * 0.5 ? A[3] : A[1]), true);
    }
  }
}

/**
 * A facade with its own architecture (see `MassTheme.facade`), drawn over the masonry or plating fill between the cornice
 * (`top`) and the bottom of the body. Lit from the top-left like everything else; its lights are dimmed with the rest of the
 * facade afterwards.
 */
function facade(b: Buf, T: MassTheme, S: Ramp, A: Ramp, A2: Ramp, X0: number, BW: number, top: number, panelTop: number, panelBot: number, bodyBot: number, rnd: () => number, n: (x: number, y: number) => number, seed: number): void {
  const X1 = X0 + BW;
  const cx = Math.round(X0 + BW / 2);
  const ph = panelBot - panelTop;
  const shaft = (x0: number, w: number, y0: number, y1: number, R: Ramp = S): void => {
    for (let y = y0; y < y1; y++) for (let lx = 0; lx < w; lx++) {
      const t = lx / Math.max(1, w - 1);
      b.set(x0 + lx, y, R[t < 0.2 ? 4 : t < 0.6 ? 3 : t < 0.85 ? 2 : 1]);
    }
  };
  const disc = (x: number, y: number, r: number, fill: (d: number, dx: number, dy: number) => [RGB, boolean] | null): void => {
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const d = Math.hypot(dx, dy);
      if (d > r + 0.3) continue;
      const f = fill(d, dx, dy);
      if (f) b.set(x + dx, y + dy, f[0], f[1]);
    }
  };
  switch (T.facade) {
    case 'deco': {
      // an art-deco tower crown: tall piers with stepped caps, narrow strips of lit windows between them, chevron
      // spandrels, and a sunburst fan over the middle instead of a clock
      const pitch = 22;
      const fanR = Math.max(16, Math.min(Math.round(ph * 0.95), 40));
      for (let x = X0 + 6; x < X1 - 8; x += pitch) {
        const nearFan = Math.abs(x + 3 - cx) < fanR + 4;
        shaft(x, 6, nearFan ? panelTop + fanR - 6 : panelTop - 4, bodyBot - 2);
        if (!nearFan) for (let k = 0; k < 3; k++) for (let lx = -k; lx < 6 + k; lx++) b.set(x + lx, panelTop - 4 + k * 2, S[k === 0 ? 5 : 4 - k]);
        // a window strip in the bay to the right
        const wx = x + 9;
        if (wx + 8 > X1 - 6) continue;
        for (let y = panelTop + 2; y < panelBot - 2; y += 7) {
          if (Math.abs(wx + 4 - cx) < fanR && y < panelTop + fanR) continue;
          const lit = rnd();
          const col = lit > 0.82 ? A2[2] : lit > 0.5 ? A[2] : S[0];
          b.rect(wx, y, 3, 4, col, lit > 0.5);
          b.rect(wx + 5, y, 3, 4, rnd() > 0.55 ? A[1] : S[0], false);
          for (let lx = 0; lx < 8; lx++) b.set(wx + lx, y + 5, S[1]);
        }
      }
      // chevron spandrel band under the windows
      for (let x = X0 + 2; x < X1 - 2; x++) for (let k = 0; k < 6; k++) {
        const v = (x + k) % 12 < 6 ? (x - k) % 12 < 6 : false;
        b.set(x, panelBot + k, v ? S[4] : k === 5 ? S[0] : S[2]);
      }
      // the sunburst: alternating rays in a half fan, a lit rim and a small lit keystone
      for (let dy = -fanR; dy <= 0; dy++) for (let dx = -fanR; dx <= fanR; dx++) {
        const d = Math.hypot(dx, dy);
        if (d > fanR) continue;
        const a = Math.atan2(-dy, dx);
        const ray = Math.floor((a / Math.PI) * 14) % 2 === 0;
        const y = panelTop + fanR + dy;
        if (d > fanR - 2) b.set(cx + dx, y, d > fanR - 1 ? S[5] : A2[2], d <= fanR - 1);
        else if (d < 6) b.set(cx + dx, y, A[3], true);
        else b.set(cx + dx, y, ray ? S[4] : S[2]);
      }
      break;
    }
    case 'ring': {
      // a training ring's apron: quilted padding with seams, turnbuckle posts at both ends, three glowing ropes, a hex crest
      for (let y = top; y < bodyBot; y++) for (let x = X0; x < X1; x++) {
        const row = (y - top) % 8;
        const seam = (x - X0) % 40 === 0;
        b.set(x, y, seam ? S[0] : row === 0 ? S[3] : row === 7 ? S[0] : row < 3 ? S[2] : S[1]);
      }
      const postW = 12;
      for (const px of [X0, X1 - postW]) {
        shaft(px, postW, top - 2, bodyBot);
        for (let k = 0; k < 3; k++) b.rect(px + 2, panelTop + 2 + k * 9, postW - 4, 5, A[k === 1 ? 3 : 2], true);
      }
      for (let k = 0; k < 3; k++) {
        const ry = panelTop + 4 + k * 9;
        for (let x = X0 + postW; x < X1 - postW; x++) {
          const u = (x - X0 - postW) / Math.max(1, BW - postW * 2);
          const y = ry + Math.round(Math.sin(u * Math.PI) * 2);
          b.set(x, y, A[3], true);
          b.set(x, y + 1, A[2], true);
          b.set(x, y + 2, S[0]);
        }
      }
      // the crest: a hexagon with a crosshair
      const hr = Math.max(10, Math.min(Math.round(ph * 0.42), 20));
      const hy = panelTop + Math.round(ph * 0.62);
      for (let dy = -hr; dy <= hr; dy++) for (let dx = -hr; dx <= hr; dx++) {
        const q = Math.max(Math.abs(dy) * 1.15, (Math.abs(dx) * 0.87 + Math.abs(dy) * 0.5) * 1.15);
        if (q > hr) continue;
        const edge = q > hr - 2;
        const cross = (dx === 0 || dy === 0) && q < hr - 4 && q > 3;
        b.set(cx + dx, hy + dy, edge ? A[2] : cross ? A[1] : q < 3 ? A[3] : S[3], edge || q < 3);
      }
      // the LED strip along the foot of the apron
      for (let x = X0 + postW + 2; x < X1 - postW - 2; x += 4) b.rect(x, bodyBot - 6, 2, 2, (x >> 2) % 5 === 0 ? A[3] : A[1], (x >> 2) % 5 === 0);
      break;
    }
    case 'tower': {
      // a storm-beaten tower: stepped buttresses, pairs of lancet windows with a faint glow, copper lightning conductors
      // running down the buttresses, and a rose window over the middle
      const pitch = 76;
      const COPPER: Ramp = ['#2a3a30', '#3e6a5a', '#b8703a', '#e8a060', '#fff0c8'].map(hex);
      const roseR = Math.max(10, Math.min(Math.round(ph * 0.45), 22));
      for (let bx = X0 + 4; bx < X1 - 10; bx += pitch) {
        // the buttress widens as it goes down
        for (let y = panelTop - 6; y < bodyBot; y++) {
          const t = (y - panelTop + 6) / Math.max(1, bodyBot - panelTop + 6);
          const w = Math.round(8 + t * 8);
          for (let lx = 0; lx < w; lx++) b.set(bx + lx, y, S[lx < 2 ? 5 : lx < w - 3 ? 4 : 1]);
          if (y % 12 === 0) for (let lx = 0; lx < w; lx++) b.set(bx + lx, y, S[1]);
        }
        // the conductor: a copper strip with patina, a spark at its tip
        for (let y = panelTop - 10; y < bodyBot - 2; y++) b.set(bx + 4, y, COPPER[(y >> 2) % 3 === 0 ? 1 : 2]);
        b.set(bx + 4, panelTop - 11, A[4], true);
        // two lancet windows in the bay
        for (const off of [26, 44]) {
          const wx = bx + off;
          if (wx + 8 > X1 - 6 || Math.abs(wx + 4 - cx) < roseR + 6) continue;
          const wy = panelTop + 2;
          const wh = Math.max(14, ph - 6);
          for (let y = 0; y < wh; y++) for (let lx = 0; lx < 8; lx++) {
            const arch = y < 6 ? Math.abs(lx - 3.5) > y * 0.75 : false;
            if (arch) continue;
            const glow = y > wh * 0.55 && lx > 1 && lx < 6 && n(wx + lx, seed) > 0.35;
            b.set(wx + lx, wy + y, lx === 0 ? S[4] : lx === 7 ? S[1] : glow ? A[1] : S[0], false);
          }
          b.set(wx + 4, wy + wh - 4, A[2], true);
        }
      }
      // the rose window: tracery spokes over dim glass
      const ry = panelTop + Math.round(ph * 0.5);
      disc(cx, ry, roseR, (d, dx, dy) => {
        if (d > roseR - 2) return [d > roseR - 1 ? S[1] : S[4], false];
        const a = Math.atan2(dy, dx);
        const spoke = Math.abs(Math.sin(a * 4)) < 0.16 && d > 4;
        if (spoke || Math.abs(d - roseR * 0.55) < 0.8) return [S[3], false];
        if (d < 3) return [A[3], true];
        return [(dx + dy) & 4 ? A[1] : A[0], d < roseR * 0.55];
      });
      break;
    }
    case 'throne': {
      // the Overseer's dais: obsidian blade-pillars rising into points, carved eye reliefs in the ivory between them, and one
      // great eye over the middle with the spire crown fanned above it
      const OB: Ramp = A2;
      const pitch = 92;
      const eyeR = Math.max(10, Math.min(Math.round(ph * 0.5), 24));
      for (let x = X0 + 10; x < X1 - 16; x += pitch) {
        if (Math.abs(x + 6 - cx) < eyeR * 2.6) continue;
        // a blade-pillar: a tall obsidian shaft whose top is a point, a violet seam down its face
        for (let y = top; y < bodyBot; y++) {
          const t = y - top;
          const w = t < 10 ? Math.max(1, Math.round((t / 10) * 12)) : 12;
          const lx0 = 6 - Math.floor(w / 2);
          for (let lx = 0; lx < w; lx++) b.set(x + lx0 + lx, y, OB[lx === 0 ? 4 : lx < w / 2 ? 3 : 1]);
          if (t > 12 && t % 10 < 6) b.set(x + 6, y, A[2], true);
        }
        // the eye relief in the next bay
        const ex = x + 52;
        const ey = panelTop + Math.round(ph * 0.45);
        if (ex + 10 > X1 - 8 || Math.abs(ex - cx) < eyeR * 2.4) continue;
        for (let dx = -10; dx <= 10; dx++) {
          const hgt = Math.round(5 * Math.sqrt(1 - (dx / 10.5) ** 2));
          for (let dy = -hgt; dy <= hgt; dy++) b.set(ex + dx, ey + dy, Math.abs(dy) === hgt ? S[dy < 0 ? 1 : 5] : S[2]);
        }
        b.rect(ex - 2, ey - 2, 4, 4, A[1], false);
        b.set(ex, ey - 1, A[3], true);
      }
      // the great eye: an almond of obsidian, a violet iris in rings, a white-hot pupil; seven carved rays above it
      const ey = panelTop + Math.round(ph * 0.55);
      for (let i = 0; i < 7; i++) {
        const a = Math.PI + ((i + 0.5) / 7) * Math.PI;
        for (let r = eyeR + 3; r < eyeR + 3 + Math.round(ph * 0.5); r++) {
          const w = Math.max(0, Math.round(2.5 - (r - eyeR) * 0.08));
          for (let k = -w; k <= w; k++) b.set(cx + Math.round(Math.cos(a) * r - Math.sin(a) * k * 0.6), ey + Math.round(Math.sin(a) * r * 0.8), k === -w ? OB[4] : OB[2]);
        }
      }
      for (let dx = -Math.round(eyeR * 1.9); dx <= Math.round(eyeR * 1.9); dx++) {
        const u = dx / (eyeR * 1.95);
        const hgt = Math.round(eyeR * 0.75 * (1 - u * u));
        for (let dy = -hgt; dy <= hgt; dy++) {
          const d = Math.hypot(dx, dy);
          let col: RGB = Math.abs(dy) >= hgt - 1 ? OB[4] : OB[1];
          let em = false;
          if (d < eyeR * 0.62) {
            col = d < eyeR * 0.18 ? A[4] : d < eyeR * 0.3 ? A[3] : Math.round(d) % 3 === 0 ? A[1] : A[2];
            em = d < eyeR * 0.3 || Math.round(d) % 3 !== 0;
          }
          b.set(cx + dx, ey + dy, col, em);
        }
      }
      break;
    }
    case 'boards': {
      // a stadium wall: sponsor boards (bars of amber and cyan light on dark panels) and striped distance posts
      const pitch = 120;
      for (let x = X0 + 4; x < X1 - 20; x += pitch) {
        // the post
        for (let y = top; y < bodyBot - 2; y++) for (let lx = 0; lx < 6; lx++) b.set(x + lx, y, ((y - top) >> 3) % 2 === 0 ? hex('#e8e8ec') : hex('#c83a2c'));
        // the board
        const bx = x + 14;
        const bw = Math.min(pitch - 24, X1 - bx - 6);
        const by = panelTop;
        const bh = Math.max(14, Math.min(ph, 26));
        if (bw < 30) continue;
        const C = (Math.floor((x - X0) / pitch) + seed) % 2 === 0 ? A : A2;
        for (let y = 0; y < bh; y++) for (let lx = 0; lx < bw; lx++) {
          const edge = y === 0 || lx === 0 || y === bh - 1 || lx === bw - 1;
          b.set(bx + lx, by + y, edge ? S[4] : S[0]);
        }
        // a 'logo' of bars and a block, different per board
        const r = mulberry32(seed * 31 + x);
        let lx = 6;
        while (lx < bw - 10) {
          const w = 3 + Math.floor(r() * 10);
          const h = 4 + Math.floor(r() * (bh - 10));
          b.rect(bx + lx, by + Math.round((bh - h) / 2), Math.min(w, bw - 6 - lx), h, C[r() > 0.5 ? 2 : 3], true);
          lx += w + 3;
        }
      }
      break;
    }
    default:
      break;
  }
}

/** How bright the facade's own lights stay (1 = as drawn): they sit right under the fighters, so they are kept low. */
const FACADE_LIGHT = 0.6;

/** Glacier ice: deep blue to the pale lit face. */
const ICE: Ramp = ['#14283e', '#1e3e5e', '#2e5e86', '#4e88b4', '#86bce0', '#d4f0ff'].map(hex);

/** Scales the emissive pixels in rows y0..y1 (colour and the light they spread), leaving everything else alone. */
function dimEmissive(b: Buf, y0: number, y1: number, k: number): void {
  for (let y = Math.max(0, y0); y < Math.min(b.h, y1); y++) {
    for (let x = 0; x < b.w; x++) {
      const i = y * b.w + x;
      if (!b.em[i]) continue;
      for (let c = 0; c < 3; c++) {
        b.c[i * 3 + c] *= k;
        b.glow[i * 3 + c] *= k;
      }
    }
  }
}

/**
 * Cuts the structure's own outline out of the art below the cornice (see `MassTheme.shape`). The cap, cornice and the top of
 * the facade stay square, so the ledges read exactly where they are; only the art changes, never the collision box. Surfaces
 * the cut exposes (step treads, chamfers, the curve of a hull) catch the top-left key light.
 */
function carve(b: Buf, T: MassTheme, S: Ramp, X0: number, BW: number, top: number, bodyBot: number, keelBot: number, n: (x: number, y: number) => number): void {
  const W = b.w;
  const H = b.h;
  const cut = new Uint8Array(W * H);
  const span = Math.max(1, keelBot - top);
  const bodyH = Math.max(1, bodyBot - top);
  const maxIn = Math.floor(BW * 0.42);
  for (let y = top; y < H; y++) {
    const g = Math.min(1, (y - top) / span); // 0 under the cornice .. 1 at the bottom of the keel
    const f = Math.min(1, (y - top) / bodyH); // through the facade
    const u = y < bodyBot ? 0 : Math.min(1, (y - bodyBot) / Math.max(1, keelBot - bodyBot)); // through the underside
    let l = 0;
    let r = 0;
    switch (T.shape) {
      case 'hull':
        // the sides tumble home toward the keel: a raked bow on the left, a fuller stern on the right
        l = BW * 0.11 * Math.pow(g, 1.5);
        r = BW * 0.05 * Math.pow(g, 1.9);
        break;
      case 'steps': {
        // a stepped temple: three terraces down the facade, then the foundation steps on in under it
        const s = clampI(Math.round(BW * 0.03), 8, 20);
        const tier = y < bodyBot ? (f < 0.4 ? 0 : f < 0.72 ? 1 : 2) : 3 + Math.floor(u * 4);
        l = r = tier * s;
        break;
      }
      case 'outcrop': {
        // a jagged mass of rock narrowing unevenly, chunks broken out of its flanks
        const j = (n(y / 5, 11) - 0.5) * 14 * g;
        l = BW * 0.08 * Math.pow(g, 1.3) + j + (n(y / 14, 4) > 0.6 ? 7 * g : 0);
        r = BW * 0.06 * Math.pow(g, 1.2) - j * 0.7 + (n(y / 11, 8) > 0.62 ? 6 * g : 0);
        break;
      }
      case 'shelf': {
        // straight down through the shrine, then the ice undercuts back in a jagged diagonal of icicle teeth
        const d = Math.max(0, g - 0.26);
        l = d * BW * 0.17 + (((y >> 2) * 7) % 5) * d * 5;
        r = d * BW * 0.14 + (((y >> 2) * 3) % 5) * d * 5;
        break;
      }
      case 'housing': {
        // a machined casing: the lower half bevels in 45-degree steps
        const c = Math.max(0, y - (bodyBot - Math.round(bodyH * 0.45)));
        l = r = Math.floor((c * 0.8) / 6) * 6;
        break;
      }
      case 'chamfer':
        l = r = Math.max(0, y - (top + bodyH * 0.55));
        break;
      case 'setback':
        l = r = (f > 0.62 ? 8 : 0) + (y >= bodyBot ? 10 : 0);
        break;
      case 'ruin': {
        // weathered corners: blocks missing from both lower flanks
        const row = Math.floor(y / 10);
        const k = Math.min(1, Math.max(0, (g - 0.3) * 3));
        l = Math.floor(n(row, 21) * 3) * 9 * k;
        r = Math.floor(n(row, 37) * 3) * 9 * k;
        break;
      }
      default:
        break; // 'bridge': a straight deck, its arches opened instead
    }
    l = clampI(Math.round(l), 0, maxIn);
    r = clampI(Math.round(r), 0, maxIn);
    if (l === 0 && r === 0) continue;
    for (let x = 0; x < X0 + l; x++) if (b.filled(x, y)) { b.clear(x, y); cut[y * W + x] = 1; }
    for (let x = X0 + BW - r; x < W; x++) if (b.filled(x, y)) { b.clear(x, y); cut[y * W + x] = 1; }
  }
  for (let y = top + 1; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (!b.a[i] || b.em[i] || !cut[i - W]) continue;
      const left = x < X0 + BW / 2;
      b.tint(x, y, left ? 1.3 : 1.1, S[5], left ? 0.35 : 0.12);
      if (y + 1 < H && b.a[i + W] && !b.em[i + W]) b.tint(x, y + 1, left ? 1.12 : 1.04);
    }
  }
}

/** Cave rock: warped strata with lit seams and speckle, a few fissures. */
function rockFace(b: Buf, S: Ramp, x0: number, y0: number, w: number, h: number, n1: (x: number, y: number) => number, n2: (x: number, y: number) => number, rnd: () => number): void {
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) {
      const warp = n1(x / 38, y / 30) * 16 + n2(x / 90, 3) * 10;
      const fb = (y + warp) / 11;
      const band = Math.floor(fb);
      const inBand = fb - band;
      let k = 2 + ((band * 7) % 5 === 0 ? 1 : 0) - ((band * 3) % 4 === 0 ? 1 : 0);
      const nn = n2(x / 3.4, y / 3.4);
      if (nn > 0.76) k += 1;
      else if (nn < 0.22) k -= 1;
      if (inBand < 0.1) k = 1;
      else if (inBand < 0.2) k += 1;
      b.set(x, y, S[clampI(k, 0, 5)]);
    }
  }
  for (let i = 0; i < w / 50; i++) {
    let x = x0 + Math.floor(rnd() * w);
    let y = y0 + Math.floor(rnd() * h * 0.5);
    const len = 10 + Math.floor(rnd() * h * 0.6);
    for (let k = 0; k < len && y < y0 + h; k++) {
      b.set(x, y, S[0]);
      b.set(x + 1, y, S[3]);
      y++;
      if (rnd() > 0.55) x += rnd() > 0.5 ? 1 : -1;
    }
  }
}

/** A ship's side under its portholes: a heavy wale, then the airship's oxblood-painted bottom or the wreck's weed-fouled planks. */
function hullPaint(b: Buf, T: MassTheme, S: Ramp, A: Ramp, A2: Ramp, X0: number, BW: number, panelBot: number, bodyBot: number, n: (x: number, y: number) => number): void {
  const sky = T.under === 'galleon';
  const wy = panelBot + 2;
  if (wy + 4 >= bodyBot) return;
  for (let x = X0; x < X0 + BW; x++) {
    b.set(x, wy, sky ? A[3] : S[4]);
    b.set(x, wy + 1, sky ? (x % 24 === 6 ? A[4] : A[2]) : S[3]);
    b.set(x, wy + 2, sky ? A[1] : S[2]);
    b.set(x, wy + 3, S[0]);
  }
  const WEED = hex('#1a4a2a');
  for (let y = wy + 4; y < bodyBot; y++) {
    const t = (y - wy - 4) / Math.max(1, bodyBot - wy - 4);
    for (let x = X0; x < X0 + BW; x++) {
      if (!b.filled(x, y) || b.em[y * b.w + x]) continue;
      if (sky) b.tint(x, y, 1, A2[0], 0.42);
      else if (n(x / 9, y / 5) > 0.5 - t * 0.35) b.tint(x, y, 1, WEED, 0.22 + t * 0.25);
    }
  }
}

/** One geode cracked open: a rough rim, a lining of crystal teeth shading in to a glowing hollow. */
function geode(b: Buf, S: Ramp, C: Ramp, cx: number, cy: number, rx: number, ry: number): void {
  for (let yy = -ry - 2; yy <= ry + 2; yy++) {
    for (let xx = -rx - 2; xx <= rx + 2; xx++) {
      const d = Math.hypot(xx / (rx + 2), yy / (ry + 2));
      if (d > 1) continue;
      const e = Math.hypot(xx / rx, yy / ry);
      if (e > 1) {
        b.set(cx + xx, cy + yy, S[xx + yy < 0 ? 4 : 1]); // rough rim, lit top-left
      } else if (e > 0.62) {
        const ang = Math.atan2(yy, xx);
        const tooth = Math.floor((ang + Math.PI) * 4) % 2 === 0;
        b.set(cx + xx, cy + yy, tooth ? C[2] : C[1], tooth && e < 0.75);
      } else {
        b.set(cx + xx, cy + yy, e < 0.3 ? C[4] : C[3], true);
      }
    }
  }
}

/** Geodes of different sizes broken open at random through a rock face (never a row), glowing veins between them. */
function geodeScatter(b: Buf, S: Ramp, A: Ramp, A2: Ramp, x0: number, y0: number, pw: number, ph: number, rnd: () => number): void {
  const want = Math.max(1, Math.round(pw / 85));
  const placed: [number, number, number][] = [];
  for (let tries = 0; tries < want * 8 && placed.length < want; tries++) {
    const rx = 6 + Math.floor(rnd() * 12);
    const ry = Math.max(5, Math.round(rx * (0.55 + rnd() * 0.3)));
    if (pw < 2 * rx + 12 || ph < 2 * ry + 8) continue;
    const cx = x0 + rx + 4 + Math.floor(rnd() * (pw - 2 * rx - 8));
    const cy = y0 + ry + 3 + Math.floor(rnd() * (ph - 2 * ry - 6));
    if (placed.some(([px, py, pr]) => Math.hypot(px - cx, (py - cy) * 1.6) < pr + rx + 16)) continue;
    placed.push([cx, cy, rx]);
    geode(b, S, rnd() > 0.75 ? A2 : A, cx, cy, rx, ry);
  }
  for (let v = 0; v < Math.max(1, Math.floor(pw / 90)); v++) {
    let x = x0 + Math.floor(rnd() * pw);
    for (let y = y0 + 2; y < y0 + ph - 2; y++) {
      b.set(x, y, A[1], (y & 7) === 0);
      if (rnd() > 0.6) x = clampI(x + (rnd() > 0.5 ? 1 : -1), x0, x0 + pw - 1);
    }
  }
}

/** The lower facade of the mountain shrine is glacier: blue ice with vertical striations and a few lit fracture lines. */
function iceShelf(b: Buf, X0: number, BW: number, top: number, bot: number, n1: (x: number, y: number) => number, n2: (x: number, y: number) => number, rnd: () => number): void {
  for (let x = X0; x < X0 + BW; x++) {
    const start = top + Math.round(n1(x / 9, 31) * 8);
    for (let y = start; y < bot; y++) {
      if (!b.filled(x, y)) continue;
      const d = (y - start) / Math.max(1, bot - start);
      const streak = n2(x / 2.2, y / 26);
      let k = 3 - Math.floor(d * 2.2) + (streak > 0.68 ? 1 : streak < 0.25 ? -1 : 0);
      if (y - start < 2) k = 5;
      b.set(x, y, ICE[clampI(k, 0, 5)]);
    }
  }
  for (let i = 0; i < BW / 70; i++) {
    let x = X0 + 6 + Math.floor(rnd() * (BW - 12));
    let y = top + 10 + Math.floor(rnd() * Math.max(1, bot - top - 20));
    const len = 6 + Math.floor(rnd() * 14);
    const dx = rnd() > 0.5 ? 1 : -1;
    for (let k = 0; k < len && y < bot - 1; k++) {
      b.set(x, y, ICE[5]);
      b.set(x + 1, y, ICE[2]);
      y++;
      if (k % 2) x += dx;
    }
  }
}

/** A reactor bay of instruments: three pressure gauges on a dark panel, their needles at different readings. */
function gauges(b: Buf, S: Ramp, A: Ramp, A2: Ramp, ix: number, iy: number, iw: number, ih: number): void {
  const n = Math.max(1, Math.min(3, Math.floor(iw / 26)));
  const r = Math.max(5, Math.min(10, Math.floor(ih * 0.28), Math.floor(iw / n / 2) - 4));
  const FACE = hex('#cfc4a8');
  for (let i = 0; i < n; i++) {
    const cx = ix + Math.round(((i + 0.5) / n) * iw);
    const cy = iy + Math.round(ih * 0.42);
    for (let dy = -r - 2; dy <= r + 2; dy++) for (let dx = -r - 2; dx <= r + 2; dx++) {
      const d = Math.hypot(dx, dy);
      if (d > r + 2.2) continue;
      const lit = (-dx - dy) / (r * 1.4);
      b.set(cx + dx, cy + dy, d > r + 0.5 ? S[lit > 0 ? 5 : 2] : d > r - 0.8 ? S[0] : dy > r * 0.45 ? A2[1] : FACE);
    }
    for (let t = 0; t < 7; t++) {
      const a = Math.PI * (0.8 + (t / 6) * 1.4);
      b.set(cx + Math.round(Math.cos(a) * (r - 2)), cy + Math.round(Math.sin(a) * (r - 2)), S[1]);
    }
    const na = Math.PI * (0.95 + ((i * 0.37 + 0.2) % 1) * 1.1);
    for (let k = 0; k < r - 2; k++) b.set(cx + Math.round(Math.cos(na) * k), cy + Math.round(Math.sin(na) * k), A2[2]);
    b.set(cx, cy, S[0]);
    // the pipe each gauge reads, running down to the manifold
    for (let y = cy + r + 2; y < iy + ih; y++) {
      b.set(cx - 1, y, S[4]);
      b.set(cx, y, S[3]);
      b.set(cx + 1, y, S[1]);
    }
  }
  // a small amber status lamp
  b.rect(ix + iw - 7, iy + 2, 3, 3, A[3], true);
}

/** A run of pipe across the foot of a bay, flanged every 26 px. */
function pipes(b: Buf, S: Ramp, x0: number, pw: number, py: number): void {
  for (let x = x0 - 2; x < x0 + pw + 2; x++) {
    b.set(x, py, S[5]);
    b.set(x, py + 1, S[4]);
    b.set(x, py + 2, S[2]);
    b.set(x, py + 3, S[0]);
    if ((x - x0) % 26 === 0) for (let y = py - 1; y < py + 5; y++) b.set(x, y, S[3]);
  }
}

/** A stepped pyramid carved in relief (base centred on `cx`, standing on `base`), a dark doorway, a gold altar on top. */
function stepRelief(b: Buf, S: Ramp, A: Ramp, cx: number, base: number, w: number, h: number): void {
  const tiers = 4;
  const th = Math.max(3, Math.floor(h / (tiers + 1)));
  for (let t = 0; t < tiers; t++) {
    const tw = Math.round(w * (1 - t / (tiers + 0.6)));
    const x0 = Math.round(cx - tw / 2);
    const y0 = base - (t + 1) * th;
    for (let y = 0; y < th; y++) for (let x = 0; x < tw; x++) b.set(x0 + x, y0 + y, S[y === 0 ? 5 : x === 0 ? 4 : x === tw - 1 ? 1 : 3]);
  }
  const shrine = Math.max(4, Math.round(w * 0.16));
  const sy = base - tiers * th - th;
  b.rect(cx - shrine / 2, sy, shrine, th, S[2]);
  b.rect(cx - shrine / 2, sy, shrine, 1, A[2]); // gilded lintel, not lit
  b.rect(cx - 2, sy + 1, 4, th - 1, S[0]);
  // a stair up the middle, and the doorway at its foot
  for (let y = base - tiers * th; y < base; y += 2) b.rect(cx - 3, y, 6, 1, S[4]);
  b.rect(cx - 3, base - th + 1, 6, th - 1, S[0]);
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

/** One recessed bay of the facade. `focal` is the middle (or only) bay, which carries the stage's emblem; `idx` the bay's index. */
function panel(b: Buf, T: MassTheme, S: Ramp, A: Ramp, A2: Ramp, x0: number, y0: number, pw: number, ph: number, rnd: () => number, n: (x: number, y: number) => number, focal = true, idx = 0): void {
  if (T.panel === 'porthole') {
    portholes(b, S, A, A2, x0, y0, pw, ph, rnd, T.under === 'galleon');
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
  } else if (T.panel === 'vent' && !focal && idx % 2 === 1) {
    gauges(b, S, A, A2, ix, iy, iw, ih);
    pipes(b, S, x0, pw, iy + ih + 1);
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
    pipes(b, S, x0, pw, iy + ih + 1);
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
    if (!focal) {
      // the side bays are carved, not lit: a stepped pyramid in relief with a dark doorway and a gold altar on top
      stepRelief(b, S, A, cx, iy + ih - 4, Math.min(iw - 16, Math.round(ih * 1.5)), ih - 12);
    } else for (let a = 0; a < 16; a++) {
      const rad = (a / 16) * Math.PI * 2;
      const r1 = r + 2;
      const r2 = r + (a % 2 === 0 ? 9 : 5);
      for (let t = r1; t < r2; t += 0.5) b.set(cx + Math.cos(rad) * t, cy + Math.sin(rad) * t, a % 2 === 0 ? A[3] : A[2], a % 2 === 0);
    }
    if (focal) {
      for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) {
        const d = Math.hypot(x, y);
        if (d > r) continue;
        b.set(cx + x, cy + y, d > r - 1.5 ? A[3] : d < r * 0.4 ? A[4] : A[1], d > r - 1.5 || d < r * 0.4);
      }
      // a face in the disc: two eyes and a mouth line
      b.rect(cx - r * 0.45, cy - r * 0.2, 2, 2, S[0]);
      b.rect(cx + r * 0.3, cy - r * 0.2, 2, 2, S[0]);
      b.rect(cx - r * 0.35, cy + r * 0.35, r * 0.7, 1, S[0]);
    }
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
        if (!edge && T.cap === 'grass') b.clear(ax + x, iy + y); // the sunlit bridge's arches are open to the sky
        else b.set(ax + x, iy + y, edge ? A[2] : mix(S[0], hex('#3a2030'), 0.5 + t * 0.3));
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
function portholes(b: Buf, S: Ramp, A: Ramp, A2: Ramp, x0: number, y0: number, pw: number, ph: number, rnd: () => number, sky = false, spread = 18): void {
  const BRASS: Ramp = ['#3a2a10', '#7a5a20', '#c09a40', '#f0d080', '#fff4c0'].map(hex);
  const KELP: Ramp = ['#0e2a1a', '#1a4a2a', '#2e7040', '#4aa058', '#8ad07a'].map(hex);
  const r = Math.max(6, Math.min(11, Math.floor(ph * 0.22)));
  const count = Math.max(1, Math.floor(pw / (r * 2 + spread)));
  const cy = y0 + Math.floor(ph * 0.42);
  const fishIn = Math.floor(rnd() * count);
  const R0 = r;
  for (let i = 0; i < count; i++) {
    // not a row of identical lamps: sizes, spacing and light vary, most are dim or dark, so they never outshine the fighters
    const r = Math.max(5, R0 - (i % 3 === 1 ? 2 : 0) - (rnd() > 0.7 ? 1 : 0));
    const cx = x0 + Math.round(((i + 0.5 + (rnd() - 0.5) * 0.3) / count) * pw);
    const broken = !sky && rnd() > 0.75;
    const light = broken ? 0 : rnd(); // < 0.35 dark, < 0.8 dim, else lit
    const dark = light < 0.35;
    const dim = light < 0.8;
    for (let yy = -r - 2; yy <= r + 2; yy++) for (let xx = -r - 2; xx <= r + 2; xx++) {
      const d = Math.hypot(xx, yy);
      if (d > r + 2) continue;
      if (d > r - 0.5) {
        // brass ring lit from the top-left
        const lit = (-xx - yy) / (r * 1.4);
        const k = d > r + 1.2 ? 1 : lit > 0.3 ? 4 : lit > -0.3 ? 3 : 2;
        b.set(cx + xx, cy + yy, BRASS[dim ? Math.max(0, k - (dark ? 2 : 1)) : k]); // tarnished on the darker ports
      } else if (broken && (xx + yy * 0.6 > r * 0.2 || d < r * 0.35)) {
        b.set(cx + xx, cy + yy, S[0]); // shattered glass: dark hold behind
      } else if (dark) {
        // an unlit port: dark glass with the sky's reflection across the top
        const t = (yy + r) / (2 * r);
        b.set(cx + xx, cy + yy, t < 0.25 && xx < 0 ? S[2] : S[0]);
      } else {
        const t = (yy + r) / (2 * r);
        const k = dim ? (t < 0.4 ? 2 : 1) : t < 0.3 ? 3 : t < 0.7 ? 2 : 1;
        b.set(cx + xx, cy + yy, A[k], !dim || t < 0.4);
      }
    }
    // glint and bolts
    b.set(cx - Math.round(r * 0.45), cy - Math.round(r * 0.45), dark ? S[3] : A[dim ? 3 : 4], !dark);
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      b.set(cx + Math.cos(a) * (r + 1), cy + Math.sin(a) * (r + 1), BRASS[0]);
    }
    if (!sky && i === fishIn && !broken && !dark && r >= 7) {
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
        case 'dais': {
          // polished ivory with a violet inlay line and an obsidian lip
          if (ly === 0) col = M[5];
          else if (ly < 3) col = M[4];
          else if (ly === 4) {
            col = (x >> 2) % 4 === 0 ? A[3] : A[1];
            em = (x >> 2) % 4 === 0;
          } else if (ly < 8) col = M[3];
          else if (ly < 10) col = A2[2];
          else col = A2[0];
          break;
        }
        case 'track': {
          // a red running track with a white lane line, over a grey kerb
          const red = (x * 13 + ly * 7) % 11 === 0 ? hex('#8a2a22') : hex('#b23a2c');
          if (ly === 0) col = hex('#d8604a');
          else if (ly === 3) col = (x % 48) < 30 ? hex('#f4f0e8') : red;
          else if (ly < 6) col = red;
          else if (ly === 6) col = hex('#6a1c18');
          else if (ly < 9) col = (x >> 4) % 2 === 0 ? hex('#e8e8ec') : hex('#2a2a30');
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

/**
 * Harbour Pier's dock edge, at the pier's right end (`x1`): the deck's last stretch painted in yellow and black hazard
 * chevrons with a white edge line, and a squat mooring bollard carrying an amber marker lamp. It runs up to the walk-off's
 * blast line (the pier ends exactly there), so the deadly end of the pier reads at a glance.
 */
function dockEnd(b: Buf, A: Ramp, x1: number, y0: number): void {
  const STRIPE = 96;
  const yel: Ramp = ['#5a4008', '#a07810', '#e0b020', '#ffd84a', '#fff0a0'].map(hex);
  const blk = hex('#16130e');
  for (let x = x1 - STRIPE; x < x1; x++) {
    const fade = x - (x1 - STRIPE); // the chevrons start with a white edge line, then run to the end
    for (let ly = 0; ly < 8; ly++) {
      let col: RGB;
      if (fade < 2) col = ly === 0 ? hex('#ffffff') : hex('#d8d4c8');
      else if (fade < 5) col = blk;
      else col = ((x + ly) >> 3) % 2 === 0 ? (ly === 0 ? yel[4] : ly < 3 ? yel[3] : yel[2]) : ly === 0 ? hex('#3a3428') : blk;
      if (ly >= 6 && col !== blk) col = mix(col, blk, 0.35); // the planks' lower edge in shadow
      b.set(x, y0 + ly, col);
    }
  }
  // a mooring bollard just inside the end, its cap an amber marker lamp
  const bx = x1 - 22;
  for (let k = 1; k <= 6; k++) {
    const half = k === 6 ? 2 : k > 4 ? 3 : 4;
    for (let d = -half; d < half; d++) b.set(bx + d, y0 - k, d === -half ? hex('#5a626a') : d >= half - 1 ? hex('#121418') : k === 1 ? hex('#22262c') : hex('#30363e'));
  }
  b.set(bx - 1, y0 - 7, A[3], true);
  b.set(bx, y0 - 7, A[4], true);
  b.set(bx - 1, y0 - 8, A[4], true);
  b.set(bx, y0 - 8, A[3], true);
}

function underside(b: Buf, T: MassTheme, S: Ramp, A: Ramp, A2: Ramp, x0: number, y0: number, bw: number, uh: number, rnd: () => number, n: (x: number, y: number) => number): void {
  const prof: number[] = [];
  const R = T.under === 'ice' ? ICE : T.under === 'spire' ? A2 : S; // the shrine stands on a glacier; the dais on obsidian
  const stepped = T.under === 'tech' || T.under === 'machine';
  const hull = T.under === 'reef' || T.under === 'galleon'; // a ship's planked hull, not rock
  for (let x = 0; x < bw; x++) {
    const t = x / (bw - 1);
    const e = Math.abs(t - 0.5) * 2;
    let d: number;
    if (hull) {
      // a smooth bowl: full depth amidships, sweeping up hard at bow and stern
      d = uh * 0.78 * Math.sqrt(Math.max(0, 1 - Math.pow(e, 3.2)));
      if (T.under === 'reef') d += (n(x / 7, 5) - 0.5) * 6; // a wreck sags and splinters
    } else if (T.under === 'spire') {
      // an inverted spire: the dais rests on one long obsidian point
      d = uh * 1.12 * Math.pow(1 - e, 1.7) + (n(x / 5, 3) - 0.5) * 3;
    } else if (stepped) {
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
      if (hull) {
        // strakes follow the hull's curve: each plank row is a fixed fraction of the local depth
        const strakes = 7;
        const f = depth * strakes;
        const row = Math.floor(f);
        const inRow = f - row;
        const butt = (x + row * 37 + Math.floor(n(row, 1) * 90)) % 74 === 0; // staggered plank ends
        k = (row % 2 === 0 ? 3 : 2) - (depth > 0.7 ? 1 : 0);
        if (inRow < 0.12 || butt) k = 0; // caulked seam
        else if (inRow < 0.24) k += 1; // the plank's upper edge catches the light
        if (n(x / 2.6, y / 1.4) > 0.8) k -= 1; // grain
      } else if (stepped) {
        const tier = Math.floor(Math.abs(x / (bw - 1) - 0.5) * 10);
        k = 3 - Math.floor(depth * 2.2) - (tier % 2);
        if ((y % 18) === 0) k = 4;
        if ((y % 18) === 1) k = 0;
      } else {
        const band = Math.floor((y + n(x / 22, y / 9) * 7) / 8) % 3;
        k = 3 - Math.floor(depth * 2.5) - (band === 1 ? 1 : 0);
        if (n(x / 2.3, y / 2.3) > 0.76) k += 1;
      }
      b.set(x0 + x, y0 + y, R[clampI(k, 0, 5)]);
    }
    b.set(x0 + x, y0 + bot - 1, R[stepped ? 4 : 1]);
    if (hull) for (let k = 2; k <= 4; k++) if (bot - k > 6) b.set(x0 + x, y0 + bot - k, S[k === 2 ? 0 : 1]); // the keel timber
  }
  // shadow right under the facade
  for (let x = 0; x < bw; x++) for (let k = 0; k < 6; k++) b.tint(x0 + x, y0 + k, 0.5 + k * 0.08);

  const tip = (x: number): number => y0 + prof[clampI(Math.round(x), 0, bw - 1)] - 1;
  if (T.under === 'crystal' || T.under === 'shard' || T.under === 'ice') {
    const count = Math.round(bw / 26);
    for (let i = 0; i < count; i++) {
      const x = 16 + Math.floor(rnd() * (bw - 32));
      const y = tip(x);
      const hh = 8 + Math.floor(rnd() * (T.under === 'crystal' ? 16 : 22));
      const C = T.under === 'ice' || rnd() > 0.5 ? A : A2;
      for (let k = 0; k < hh; k++) {
        const ww = Math.max(1, Math.round(4 * (1 - k / hh)));
        for (let j = 0; j < ww; j++) b.set(x0 + x - Math.floor(ww / 2) + j, y + k, j === 0 ? C[1] : j === ww - 1 ? C[3] : C[2], true);
      }
      b.set(x0 + x, y + hh - 1, C[4], true);
    }
    // glowing veins in the rock
    for (let i = 0; i < (T.under === 'ice' ? 0 : bw / 60); i++) {
      let x = 10 + Math.floor(rnd() * (bw - 20));
      let y = y0 + 6 + Math.floor(rnd() * 20);
      for (let k = 0; k < 30 && y < tip(x) - 2; k++) {
        b.set(x0 + x, y, A[2], true);
        y++;
        if (rnd() > 0.5) x = clampI(x + (rnd() > 0.5 ? 1 : -1), 0, bw - 1);
      }
    }
  } else if (T.under === 'spire') {
    // violet light runs down the spire's facets to its point
    for (const f of [-0.5, -0.2, 0.15, 0.45]) {
      for (let y = 6; y < uh * 1.1; y++) {
        const x = Math.round(bw / 2 + f * (bw / 2) * Math.pow(1 - y / (uh * 1.12), 1.1));
        if (x < 1 || x >= bw - 1 || y0 + y >= tip(x) - 2) break;
        if (y % 9 < 6) b.set(x0 + x, y0 + y, y % 9 < 2 ? A[3] : A[2], true);
      }
    }
  } else if (T.under === 'galleon') {
    // brass rub-strake, a row of lamplit scuttles, propellers on struts and a rudder at the stern
    const band = (x: number): number => y0 + Math.round(prof[x] * 0.32);
    for (let x = 2; x < bw - 2; x++) {
      const y = band(x);
      if (y >= tip(x) - 3) continue;
      b.set(x0 + x, y - 1, A[3]);
      b.set(x0 + x, y, A[2]);
      b.set(x0 + x, y + 1, A[1]);
      if (x % 24 === 12) b.set(x0 + x, y, A[4], true); // rivet heads
    }
    for (let x = 40; x < bw - 40; x += 46) {
      const y = band(x) + 10;
      if (y + 6 >= tip(x)) continue;
      for (let yy = -3; yy <= 3; yy++) for (let xx = -3; xx <= 3; xx++) {
        const d = Math.hypot(xx, yy);
        if (d <= 3.4) b.set(x0 + x + xx, y + yy, d > 2.4 ? A[1] : yy < 0 ? A[4] : A[3], d <= 2.4);
      }
    }
    const prop = (px: number): void => {
      const top = tip(px) - 4;
      b.rect(x0 + px - 3, top, 6, 20, S[1]); // strut
      b.rect(x0 + px - 2, top, 2, 20, S[3]);
      for (let yy = 0; yy < 14; yy++) for (let xx = -14; xx <= 14; xx++) {
        // engine nacelle: a brass-banded cylinder, rounded at the nose
        if (xx < -10 && (xx + 10) * (xx + 10) + (yy - 7) * (yy - 7) > 20) continue;
        const sh = yy < 3 ? A[3] : yy < 6 ? A[2] : yy < 11 ? A[1] : S[0];
        b.set(x0 + px + xx, top + 18 + yy, xx % 9 === 0 ? S[1] : sh);
      }
      b.rect(x0 + px + 15, top + 21, 4, 8, S[0]);
      b.rect(x0 + px + 16, top + 23, 2, 4, A[4], true); // exhaust glow
      for (let yy = -16; yy <= 16; yy++) for (let xx = -4; xx <= 4; xx++) {
        // the spinning blades at the nose: a pale motion-blur disc seen edge-on
        if (xx * xx / 16 + yy * yy / 256 > 1) continue;
        b.set(x0 + px - 17 + xx, top + 25 + yy, Math.abs(yy) > 11 ? S[4] : S[5]);
      }
      b.rect(x0 + px - 19, top + 23, 4, 4, A[2]);
    };
    prop(Math.round(bw * 0.3));
    prop(Math.round(bw * 0.7));
    // rudder at the stern (right end)
    const rx = bw - 64;
    const ry = tip(rx) - 22;
    for (let yy = 0; yy < 40; yy++) for (let xx = 0; xx < 20 - Math.floor(yy / 3); xx++) b.set(x0 + rx + xx, ry + yy, xx === 0 ? S[4] : yy === 39 ? S[0] : (xx + yy) % 9 === 0 ? S[1] : S[2]);
    b.rect(x0 + rx, ry + 12, 16, 2, A[2]);
    b.rect(x0 + rx, ry + 24, 11, 2, A[2]);
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
    // coolant pipes snaking down each tier face, and vent grilles leaking furnace light
    for (let i = 0; i < bw / 34; i++) {
      const x = 8 + Math.floor(rnd() * (bw - 16));
      const y1 = tip(x) - 4;
      for (let y = y0 + 6; y < y1; y++) {
        b.set(x0 + x, y, S[4]);
        b.set(x0 + x + 1, y, S[3]);
        b.set(x0 + x + 2, y, S[1]);
        if ((y - y0) % 14 === 0) b.rect(x0 + x - 1, y, 5, 2, S[5]); // flange
      }
    }
    for (let i = 0; i < bw / 50; i++) {
      const x = 12 + Math.floor(rnd() * (bw - 40));
      const y = y0 + 20 + Math.floor(rnd() * 30);
      if (y + 8 >= tip(x + 20) - 2 || y + 8 >= tip(x) - 2) continue;
      b.rect(x0 + x - 1, y - 1, 22, 10, S[0]);
      for (let k = 0; k < 4; k++) b.rect(x0 + x, y + k * 2, 20, 1, k % 2 ? A[1] : A[2], true);
    }
  } else {
    // tech: light seams along each tier, circuit traces climbing the faces and a glowing core at the keel
    for (let x = 0; x < bw; x++) {
      const y = tip(x);
      b.set(x0 + x, y - 2, A[2], true);
    }
    for (let i = 0; i < bw / 22; i++) {
      let x = 6 + Math.floor(rnd() * (bw - 12));
      let y = tip(x) - 5;
      const top = y0 + 8;
      for (let k = 0; k < 80 && y > top; k++) {
        b.set(x0 + x, y, A[1], true);
        if (rnd() > 0.82) {
          const dx = rnd() > 0.5 ? 1 : -1;
          for (let j = 0; j < 6; j++) b.set(x0 + (x += dx), y, A[1], true);
        }
        y--;
      }
      b.set(x0 + x, y, A[3], true); // node
    }
    const cx = Math.round(bw / 2);
    const cy = tip(cx) - 10;
    for (let yy = -7; yy <= 7; yy++) for (let xx = -7; xx <= 7; xx++) {
      const d = Math.hypot(xx, yy);
      if (d <= 6) b.set(x0 + cx + xx, cy + yy, d < 2.5 ? A[4] : d < 4.5 ? A[3] : A[1], d < 4.5);
    }
  }
  // ---- the stage's focal light hangs under the playfield, where it frames the fighters instead of competing with them
  const mid = Math.round(bw / 2);
  if (bw < 120) return;
  if (T.under === 'machine') reactorCore(b, S, A, A2, x0 + mid, y0 + Math.round(prof[mid] * 0.5), Math.max(8, Math.min(18, Math.round(prof[mid] * 0.3))));
  else if (T.cap === 'crystal') crystalCluster(b, A, A2, x0 + mid, tip(mid) - 6, 1, rnd);
  else if (T.under === 'shard') crystalCluster(b, A, A, x0 + mid, tip(mid) - 4, 0.7, rnd);
  else if (T.under === 'spire') {
    // a lamp of violet light at the very point
    for (let yy = -6; yy <= 6; yy++) for (let xx = -6; xx <= 6; xx++) {
      const d = Math.hypot(xx, yy * 1.4);
      if (d <= 5) b.set(x0 + mid + xx, tip(mid) + 4 + yy, d < 2 ? A[4] : d < 3.5 ? A[3] : A[2], true);
    }
  }
  else if (T.under === 'ice') shrineLantern(b, S, A2, x0 + mid, tip(mid) - 2);
  else if (T.under === 'roots' && T.panel === 'glyph') sunPendant(b, S, A, x0 + mid, tip(mid) - 2);
}

/** The reactor's core seen through a round port in the keel: a heavy bolted collar, a hot ring and a white-hot heart. */
function reactorCore(b: Buf, S: Ramp, A: Ramp, A2: Ramp, cx: number, cy: number, r: number): void {
  for (let dy = -r - 5; dy <= r + 5; dy++) for (let dx = -r - 5; dx <= r + 5; dx++) {
    const d = Math.hypot(dx, dy);
    if (d > r + 5.3) continue;
    if (d > r + 1) {
      // the collar, lit from the top-left, with hazard notches and bolts
      const lit = (-dx - dy) / ((r + 5) * 1.4);
      const ang = Math.atan2(dy, dx);
      const notch = d > r + 3.2 && (Math.floor((ang + Math.PI) * 3) & 1) === 0;
      b.set(cx + dx, cy + dy, notch ? A[3] : S[lit > 0.3 ? 5 : lit > -0.2 ? 3 : 1]);
    } else if (d > r - 2) b.set(cx + dx, cy + dy, S[0]);
    else {
      const t = d / (r - 2);
      const swirl = Math.sin(Math.atan2(dy, dx) * 3 + d * 0.6) > 0.3;
      b.set(cx + dx, cy + dy, t < 0.3 ? A[4] : t < 0.6 ? (swirl ? A[4] : A[3]) : swirl ? A2[3] : A2[2], true);
    }
  }
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2 + 0.2;
    b.set(cx + Math.round(Math.cos(a) * (r + 3)), cy + Math.round(Math.sin(a) * (r + 3)), S[0]);
  }
}

/** A cluster of big crystals hanging from the keel, glowing brightest at their tips. */
function crystalCluster(b: Buf, A: Ramp, A2: Ramp, x: number, y: number, scale: number, rnd: () => number): void {
  const n = 5;
  for (let i = 0; i < n; i++) {
    const off = i - (n - 1) / 2;
    const len = Math.round((22 + (2 - Math.abs(off)) * 9 + rnd() * 8) * scale);
    const hw = Math.max(2, Math.round((3 + (2 - Math.abs(off)) * 0.8) * scale));
    const lean = off * 0.22;
    const C = i === 1 ? A2 : A;
    const x0 = x + Math.round(off * hw * 1.6);
    for (let k = 0; k < len; k++) {
      const t = k / len;
      const half = Math.max(0, Math.round(hw * (t < 0.75 ? 1 : (1 - t) / 0.25)));
      const cxk = x0 + Math.round(k * lean);
      for (let j = -half; j <= half; j++) {
        const face = j < 0 ? 3 : j === 0 ? 4 : 1; // lit facet left, ridge, shaded facet right
        b.set(cxk + j, y + k, C[t > 0.7 ? Math.min(4, face + 1) : face], t > 0.35 || j === 0);
      }
    }
  }
}

/** A red paper lantern hung on a rope from the shrine's ice keel, warm light inside, a tassel below. */
function shrineLantern(b: Buf, S: Ramp, A2: Ramp, x: number, y: number): void {
  const WARM: Ramp = ['#6a3a10', '#c07a28', '#ffb84a', '#ffe0a0', '#fff6dc'].map(hex);
  for (let k = 0; k < 8; k++) b.set(x, y + k, S[0]);
  const top = y + 8;
  const h = 16;
  b.rect(x - 4, top, 9, 2, S[0]);
  for (let k = 0; k < h; k++) {
    const t = k / (h - 1);
    const half = Math.round(4 + Math.sin(t * Math.PI) * 3);
    for (let j = -half; j <= half; j++) {
      const u = (j + half) / (2 * half);
      const rib = k % 4 === 0;
      const inner = Math.abs(j) < half - 1 && !rib;
      b.set(x + j, top + 2 + k, inner ? (u < 0.45 ? WARM[3] : WARM[2]) : rib ? A2[1] : A2[u < 0.3 ? 3 : 2], inner);
    }
  }
  b.rect(x - 4, top + 2 + h, 9, 2, S[0]);
  for (let k = 0; k < 6; k++) b.set(x + (k % 2), top + 4 + h + k, A2[2]);
  b.set(x - 1, top + 6, WARM[4], true);
  b.set(x, top + 7, WARM[4], true);
}

/** A gold sun disc on a chain under the temple: the shrine's emblem, moved below the fighters' feet. */
function sunPendant(b: Buf, S: Ramp, A: Ramp, x: number, y: number): void {
  for (let k = 0; k < 8; k++) b.set(x, y + k, (k & 1) === 0 ? A[1] : S[0]);
  const cy = y + 19;
  const r = 7;
  for (let a = 0; a < 12; a++) {
    const rad = (a / 12) * Math.PI * 2;
    const r2 = r + (a % 2 === 0 ? 7 : 4);
    for (let t = r + 1; t < r2; t += 0.5) b.set(x + Math.cos(rad) * t, cy + Math.sin(rad) * t, a % 2 === 0 ? A[3] : A[2], a % 2 === 0);
  }
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    const d = Math.hypot(dx, dy);
    if (d > r + 0.3) continue;
    b.set(x + dx, cy + dy, d > r - 1.5 ? A[3] : d < r * 0.45 ? A[4] : A[2], true);
  }
}

/** Art px drawn above a pass-through platform's surface (rails, tufts) and below its slab (supports, emitters). */
export const PLAT_HEAD = 6;
export const PLAT_TAIL = 16;

/**
 * A pass-through (or moving) platform as one piece: a slab with a lit top edge in the stage's style and an underside that says
 * how it floats: hover emitters, thrusters, cloud puffs, or ropes and lanterns. `w`, `h` in world units.
 */
export function platformArtPixels(themeId: string | undefined, w: number, h: number, moving: boolean, seed: number): ArtPixels {
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
  // static ledges dressed per stage: mossy stone in the temple, marble at dawn, driftwood on the wreck
  const dress = moving || snowy ? null : T.panel === 'glyph' ? 'moss' : T.panel === 'alcove' && T.cap === 'grass' ? 'marble' : T.under === 'reef' ? 'drift' : null;
  if (dress === 'moss' || dress === 'marble') return ledge(b, T, S, A, W, PH, y0, dress, seed);

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
  if (dress === 'drift') {
    // driftwood: kelp trailing from the planks, barnacles, one lamp
    const KELP: Ramp = ['#0e2a1a', '#1a4a2a', '#2e7040', '#4aa058', '#8ad07a'].map(hex);
    for (let x = 3; x < W - 3; x += 5 + Math.floor(rnd() * 6)) {
      const len = 4 + Math.floor(rnd() * 12);
      let xx = x;
      for (let k = 0; k < len; k++) {
        b.set(xx, bot + k, KELP[k < len * 0.4 ? 1 : k < len * 0.8 ? 2 : 3]);
        if (rnd() > 0.7) xx += rnd() > 0.5 ? 1 : -1;
      }
    }
    for (let i = 0; i < W / 10; i++) {
      const x = 2 + Math.floor(rnd() * (W - 4));
      b.set(x, y0 + PH - 2, S[5]);
      b.set(x + 1, y0 + PH - 2, S[4]);
    }
    const lx = Math.round(W / 2);
    for (let k = 0; k < 4; k++) b.set(lx + 1, bot + k, hex('#6a4a2a'));
    b.rect(lx, bot + 4, 3, 4, A[3], true);
    b.set(lx + 1, bot + 5, A[4], true);
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

/**
 * A stone ledge: 'moss' (temple) is a carved slab furred with moss along its top, vines and roots hanging below;
 * 'marble' (dawn) is pale dressed stone with a gold inlay band and a gilded finial under each end.
 */
function ledge(b: Buf, T: MassTheme, S: Ramp, A: Ramp, W: number, PH: number, y0: number, dress: 'moss' | 'marble', seed: number): ArtPixels {
  const n = noise(seed + 17);
  const rnd = mulberry32(seed * 53 + 11);
  const G2: Ramp = (T.alt ?? T.accent).map(hex);
  const H = b.h;
  for (let x = 0; x < W; x++) {
    const end = Math.min(x, W - 1 - x);
    for (let ly = 0; ly < PH; ly++) {
      if (end < 2 && ly > PH - 3) continue; // chamfered corners underneath
      let k = ly === 0 ? 5 : ly === 1 ? 4 : ly >= PH - 1 ? 1 : 3;
      if (dress === 'moss' && n(x / 3, ly / 2) > 0.7 && ly > 1) k -= 1;
      if (dress === 'marble' && (x + ly * 2) % 23 === 0 && ly > 1) k = 2; // veining
      if (ly > 1 && ly < PH - 1 && x % (dress === 'moss' ? 22 : 30) === 0) k = 1; // block joints
      let c = S[clampI(k, 0, 5)];
      if (dress === 'marble' && ly === 3) c = (x >> 2) % 4 === 0 ? A[3] : A[2]; // gold inlay
      if (end < 1) c = mix(c, S[0], 0.4);
      b.set(x, y0 + ly, c, dress === 'marble' && ly === 3 && (x >> 2) % 4 === 0);
    }
  }
  const bot = y0 + PH;
  if (dress === 'moss') {
    // a furred moss cap spilling over the front edge, then vines and roots hanging below
    for (let x = 0; x < W; x++) {
      const tuft = n(x / 2.5, 7) > 0.55 ? 1 : 0;
      b.set(x, y0 - tuft, G2[3]);
      b.set(x, y0 + 1, G2[2]);
      if (n(x / 4, 3) > 0.5) b.set(x, y0 + 2, G2[1]);
    }
    for (let x = 4; x < W - 4; x += 4 + Math.floor(rnd() * 7)) {
      const len = 3 + Math.floor(rnd() * 14);
      let xx = x;
      for (let k = 0; k < len && bot + k < H; k++) {
        b.set(xx, bot + k, k < len * 0.5 ? G2[1] : G2[2]);
        if (k === len - 1 && rnd() > 0.6) b.set(xx, bot + k, A[3], true); // a little glowing flower
        if (rnd() > 0.75) xx += rnd() > 0.5 ? 1 : -1;
      }
    }
  } else {
    // gilded finials hanging under both ends, a soft glow at their tips
    for (const x of [6, W - 7]) {
      for (let k = 0; k < 9 && bot + k < H; k++) {
        const ww = k < 2 ? 2 : k < 6 ? 1 : 0;
        for (let j = -ww; j <= ww; j++) b.set(x + j, bot + k, k < 3 ? A[3] : A[2]);
      }
      if (bot + 9 < H) b.set(x, bot + 9, A[4], true);
    }
  }
  return finish(b, W, H);
}

/** A rock shelf jutting out of the cave wall: a flat lit top, a jagged tapering underside and crystals hanging off it. */
function rockShelf(b: Buf, S: Ramp, A: Ramp, W: number, PH: number, y0: number, moving: boolean, seed: number): ArtPixels {
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

function finish(b: Buf, W: number, H: number): ArtPixels {
  bloom(b, 3, 0.6);
  return toPixels(b, W, H);
}

/** Raw RGBA of generated stage art (built on the main thread or in a sheet worker). */
export interface ArtPixels {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

function toPixels(b: Buf, W: number, H: number): ArtPixels {
  const data = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    const glowA = b.a[i] ? 0 : Math.min(1, (b.glow[i * 3] + b.glow[i * 3 + 1] + b.glow[i * 3 + 2]) / 300);
    if (!b.a[i] && glowA < 0.04) continue;
    data[i * 4] = clampI(Math.round(b.c[i * 3]), 0, 255);
    data[i * 4 + 1] = clampI(Math.round(b.c[i * 3 + 1]), 0, 255);
    data[i * 4 + 2] = clampI(Math.round(b.c[i * 3 + 2]), 0, 255);
    data[i * 4 + 3] = b.a[i] ? 255 : Math.round(glowA * 120);
  }
  return { width: W, height: H, data };
}

/** Pixels to a canvas (texture source); null when no canvas can be drawn (canvas memory exhausted). */
export function artCanvas(px: ArtPixels): HTMLCanvasElement | null {
  const c = document.createElement('canvas');
  c.width = px.width;
  c.height = px.height;
  const g = context2d(c);
  if (!g) return null;
  g.putImageData(new ImageData(px.data as Uint8ClampedArray<ArrayBuffer>, px.width, px.height), 0, 0);
  return c;
}

export function stageMass(themeId: string | undefined, w: number, h: number, seed: number, seated = false): HTMLCanvasElement | null {
  return artCanvas(stageMassPixels(themeId, w, h, seed, seated));
}

