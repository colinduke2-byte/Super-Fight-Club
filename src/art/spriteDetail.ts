import type { PlaceholderLook } from '../engine/types';

type Ctx = CanvasRenderingContext2D;
type V2 = [number, number];

/** Where the main body parts landed on the 64px authoring grid, so the full-resolution pass can decorate them. */
export interface Anchors {
  cx: number;
  base: number;
  torso: { x: number; y: number; w: number; h: number };
  head: { x: number; y: number; s: number };
  hand: V2;
  backHand: V2;
  foot: V2;
  backFoot: V2;
}

const rgb = (hex: string): [number, number, number] => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const hex = (c: [number, number, number]): string => `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;
const mix = (a: [number, number, number], b: [number, number, number], t: number): [number, number, number] => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const bright = (c: [number, number, number], k: number): [number, number, number] => [Math.min(255, c[0] * k), Math.min(255, c[1] * k), Math.min(255, c[2] * k)];
const hash = (x: number, y: number): number => {
  let t = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263)) >>> 0;
  t = Math.imul(t ^ (t >>> 13), 1274126177) >>> 0;
  return ((t ^ (t >>> 16)) >>> 0) / 4294967296;
};

/**
 * Full-resolution finishing for upscaled sprite frames: character-specific detail drawn at sub-pixel scale, then edge-based
 * lighting (rim light top-left, bounce shade bottom-right, cool shadows / warm highlights), material texture, glow around
 * emissive parts and a selective outline tinted by the colour it borders.
 */
export function detailPass(ctx: Ctx, w: number, h: number, ss: number, look: PlaceholderLook, a: Anchors | null, phase: number, lighting = true): void {
  if (a && lighting) decorate(ctx, ss, look, a, phase);

  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const src = new Uint8ClampedArray(d);
  const op = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < w && y < h && src[(y * w + x) * 4 + 3] > 0;
  const accent = rgb(look.accent);
  const glow = bright(accent, 1.55);
  const cool: [number, number, number] = [26, 16, 70];
  const warm: [number, number, number] = [255, 240, 210];
  const outline = rgb(look.outline);
  const emissive = new Uint8Array(w * h);

  // depth to the nearest transparent pixel in each direction (capped)
  const CAP = 5;
  const dist = (x: number, y: number, dx: number, dy: number): number => {
    let n = 0;
    while (n < CAP && op(x + dx * (n + 1), y + dy * (n + 1))) n++;
    return n;
  };

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (src[i + 3] === 0) continue;
      let c: [number, number, number] = [src[i], src[i + 1], src[i + 2]];
      const lum = (c[0] + c[1] + c[2]) / 3;
      const near = (u: [number, number, number]): boolean => Math.abs(c[0] - u[0]) + Math.abs(c[1] - u[1]) + Math.abs(c[2] - u[2]) < 40;
      const isEmissive = near(accent) || near(glow);
      if (isEmissive) {
        emissive[y * w + x] = 1;
        continue;
      }
      if (!lighting) continue;
      const up = dist(x, y, 0, -1);
      const left = dist(x, y, -1, 0);
      const down = dist(x, y, 0, 1);
      const right = dist(x, y, 1, 0);
      // soft volume: a little lighter toward the top of the sprite, darker toward the feet
      c = bright(c, 1.08 - (y / h) * 0.2);
      // light from the top-left
      const lit = Math.min(up, left);
      const dark = Math.min(down, right);
      if (lit === 0) c = mix(bright(c, 1.22), warm, 0.1);
      else if (lit === 1) c = mix(bright(c, 1.1), warm, 0.05);
      if (dark === 0) c = mix(bright(c, 0.76), cool, 0.2);
      else if (dark === 1) c = mix(bright(c, 0.9), cool, 0.08);
      // material grain: tiny speckle plus a few horizontal scratches
      const n = hash(x >> 1, y >> 1);
      if (lum > 40) {
        if (n > 0.975) c = bright(c, 1.07);
        else if (n < 0.02) c = bright(c, 0.93);
      }
      d[i] = c[0];
      d[i + 1] = c[1];
      d[i + 2] = c[2];
    }
  }

  // inner bloom on armour next to emissive pixels
  const R = 3;
  const bloom = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!emissive[y * w + x]) continue;
      for (let dy = -R; dy <= R; dy++) {
        for (let dx = -R; dx <= R; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
          const f = 1 - Math.hypot(dx, dy) / (R + 0.5);
          if (f > 0) bloom[yy * w + xx] = Math.min(1, bloom[yy * w + xx] + f * 0.22);
        }
      }
    }
  }

  // selective outline + outer glow
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (src[i + 3] > 0) {
        const b = bloom[y * w + x];
        if (b > 0.02 && !emissive[y * w + x]) {
          d[i] = Math.min(255, d[i] + accent[0] * b * 0.5);
          d[i + 1] = Math.min(255, d[i + 1] + accent[1] * b * 0.5);
          d[i + 2] = Math.min(255, d[i + 2] + accent[2] * b * 0.5);
        }
        continue;
      }
      let sr = 0;
      let sg = 0;
      let sb = 0;
      let cnt = 0;
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
        if (op(x + dx, y + dy)) {
          const j = ((y + dy) * w + (x + dx)) * 4;
          sr += src[j];
          sg += src[j + 1];
          sb += src[j + 2];
          cnt++;
        }
      }
      if (cnt > 0) {
        const nb: [number, number, number] = [sr / cnt, sg / cnt, sb / cnt];
        const c = mix(bright(nb, 0.28), outline, 0.55);
        d[i] = c[0];
        d[i + 1] = c[1];
        d[i + 2] = c[2];
        d[i + 3] = 255;
      } else {
        const b = bloom[y * w + x];
        if (b > 0.05) {
          d[i] = accent[0];
          d[i + 1] = accent[1];
          d[i + 2] = accent[2];
          d[i + 3] = Math.min(110, b * 220);
        }
      }
    }
  }
  ctx.putImageData(img, 0, 0);
}

// ---------------------------------------------------------------------------------------------
// Character-specific full-resolution decoration (drawn before the lighting pass, so it gets lit and outlined too)
// ---------------------------------------------------------------------------------------------

function decorate(ctx: Ctx, ss: number, look: PlaceholderLook, a: Anchors, phase: number): void {
  const accent = rgb(look.accent);
  const glow = bright(accent, 1.6);
  const armor = rgb(look.armor);
  const deep = bright(rgb(look.armorDark), 0.62);
  const light = bright(armor, 1.3);
  const steel: [number, number, number] = [169, 180, 204];
  const steelDark: [number, number, number] = [106, 117, 146];
  /** Fill in 64-grid units (sub-pixel allowed: coordinates are scaled to the real frame). */
  const F = (c: [number, number, number], x: number, y: number, w = 1, h = 1, alpha = 1): void => {
    ctx.globalAlpha = alpha;
    ctx.fillStyle = hex(c);
    ctx.fillRect(Math.round(x * ss), Math.round(y * ss), Math.max(1, Math.round(w * ss)), Math.max(1, Math.round(h * ss)));
    ctx.globalAlpha = 1;
  };
  const t = a.torso;
  const h = a.head;
  switch (look.build.helmet) {
    case 'visor': {
      // Brick: hazard-striped belt, riveted shoulder plate, chest vents, scanning visor
      const by = t.y + t.h - 5;
      for (let k = 0; k < t.w; k += 2) F(k % 4 === 0 ? accent : deep, t.x + k, by + 4, 2, 1);
      for (const rx of [t.x + 1, t.x + t.w - 3]) {
        F(steel, rx, t.y + 1, 1, 1);
        F(steelDark, rx + 1, t.y + 2, 0.5, 0.5);
      }
      for (let k = 0; k < 3; k++) {
        F(deep, t.x + 3, t.y + 8 + k * 1.5, 3, 0.5);
        F(deep, t.x + t.w - 7, t.y + 8 + k * 1.5, 3, 0.5);
      }
      // piston gauge on the back plate
      F(steelDark, t.x - 1, t.y + 3, 2, 7);
      F(accent, t.x - 1, t.y + 4 + (phase % 3), 2, 1);
      // visor scan line
      const sx = h.x + 7 + ((phase * 2) % Math.max(2, h.s - 8));
      F(glow, sx, h.y + 7, 1, 2);
      // scuffs
      F(deep, t.x + 6, t.y + 2, 2, 0.5);
      F(deep, t.x + t.w - 9, t.y + t.h - 9, 1.5, 0.5);
      break;
    }
    case 'hood': {
      // Vex: chest strap with buckle, mask line, sharper eye, knee wraps
      for (let k = 0; k < t.h - 2; k++) F(deep, t.x + 2 + k * 0.9, t.y + 1 + k, 2, 1);
      F(steel, t.x + t.w / 2 - 1, t.y + t.h / 2, 2, 2);
      F(steelDark, t.x + t.w / 2, t.y + t.h / 2 + 1, 1, 1);
      F(deep, h.x + h.s / 2 - 1, h.y + h.s * 0.65, h.s / 2 + 2, h.s * 0.25); // mask over the lower face
      F(glow, h.x + h.s / 2 + 1, h.y + 5, 4, 1); // eye slit
      F(accent, h.x + h.s / 2 - 2, h.y + 5.5, 3, 0.5, 0.7); // eye trail
      F(light, h.x - 1, h.y, h.s + 2, 0.5, 0.6); // hood rim light
      for (const [fx, fy] of [a.foot, a.backFoot]) {
        F(deep, fx - 5, fy - 9, 9, 0.8);
        F(accent, fx - 5, fy - 8, 9, 0.5, 0.7);
      }
      // blade-edge glint
      F([255, 255, 255], a.hand[0] + 2, a.hand[1] - 1, 1, 1, (phase & 1) === 0 ? 0.9 : 0.3);
      break;
    }
    case 'pointed': {
      // Nova: hat band + star, runic cloak hem, belt gem, glowing eyes
      F(accent, h.x + 3, h.y - 1, h.s - 6, 1);
      F(glow, h.x + h.s / 2 - 1, h.y - 5, 2, 2);
      F(glow, h.x + h.s / 2 - 0.5, h.y - 6.5, 1, 5, 0.5);
      for (let k = 0; k < 6; k++) {
        const gx = t.x - 4 + k * 4;
        F(accent, gx, a.base - 4 - (k & 1) * 2, 1, 1, 0.8);
        F(glow, gx + 1, a.base - 5 - (k & 1) * 2, 0.5, 0.5, 0.8);
      }
      F(deep, t.x, t.y + t.h - 3, t.w, 1.5);
      F(glow, t.x + t.w / 2 - 1, t.y + t.h - 3, 2, 2);
      F(glow, h.x + h.s / 2 + 2, h.y + h.s * 0.45, 2, 1);
      // beard / collar trim
      F(light, t.x + 2, t.y, t.w - 4, 1, 0.8);
      break;
    }
    case 'dome': {
      // Gizmo: a spinning cog on the back, panel lines, lens ring and bolts
      const gx = t.x - 7;
      const gy = t.y + 5;
      const ang = phase * 0.5;
      F(steelDark, gx - 3, gy - 3, 6, 6);
      F(steel, gx - 2, gy - 2, 4, 4);
      F(deep, gx - 1, gy - 1, 2, 2);
      for (let k = 0; k < 4; k++) {
        const aa = ang + (k * Math.PI) / 2;
        F(steel, gx + Math.cos(aa) * 3.6 - 0.5, gy + Math.sin(aa) * 3.6 - 0.5, 1.2, 1.2);
      }
      for (let k = 0; k < 3; k++) F(deep, t.x + 2 + k * 4, t.y + t.h - 1, 2, 0.5);
      F(accent, t.x + t.w - 6, t.y + 1, 1, 1);
      F(glow, h.x + h.s / 2 + 4, h.y + h.s / 2 + 1, 1, 1);
      F(steel, h.x + h.s / 2 - 4, h.y + h.s / 2 + 3, 1, 1);
      break;
    }
    case 'band': {
      // Agni: flame tattoo lines, ember wraps on the forearms, drifting sparks
      for (let k = 0; k < 5; k++) {
        const fx = t.x + 6 + Math.sin(k * 1.4 + phase * 0.4) * 1.2;
        F(accent, fx, t.y + 2 + k * 1.6, 1, 1, 0.9);
      }
      F(accent, t.x + 3, t.y + 3, 1, 5, 0.8);
      F(glow, t.x + 3, t.y + 4, 0.5, 2, 0.8);
      for (const [hx, hy] of [a.hand, a.backHand]) {
        F(deep, hx - 5, hy - 7, 8, 2);
        F(accent, hx - 4, hy - 6.5, 6, 0.8);
      }
      F(glow, h.x + h.s - 3, h.y + 6, 2, 1);
      // spark drift
      const sp = (phase * 2.7) % 8;
      F(glow, t.x + 2 + sp, t.y - 4 - sp * 0.5, 1, 1, 0.9 - sp / 9);
      F(accent, t.x + 9 - sp * 0.6, t.y - 2 - sp * 0.7, 1, 1, 0.9 - sp / 9);
      break;
    }
  }
}

/**
 * Fast finishing for hero-art frames (already lit by `Raster.shade`): bloom around self-lit pixels, a coloured glow just outside them and a
 * selective outline tinted by the colour it borders. Allocation-free inner loops, because every frame of every fighter goes through here at boot.
 */
export function finishHero(ctx: Ctx, w: number, h: number, look: PlaceholderLook): void {
  const img = ctx.getImageData(0, 0, w, h);
  finishHeroImage(img, look);
  ctx.putImageData(img, 0, 0);
}

let scratchA = new Uint8Array(0);
let scratchE = new Uint8Array(0);
let scratchBloom = new Float32Array(0);

/** Brightest tint (luma) a fighter's outer outline takes from the colour it borders. */
const OUTLINE_TINT_MAX = 17;

/** `finishHero` on pixels already in memory (no getImageData / putImageData). */
export function finishHeroImage(img: ImageData, look: PlaceholderLook): void {
  const w = img.width;
  const h = img.height;
  const d = img.data;
  const n = w * h;
  // scratch masks reused across frames (every frame of every fighter comes through here at boot)
  if (scratchA.length < n) {
    scratchA = new Uint8Array(n);
    scratchE = new Uint8Array(n);
    scratchBloom = new Float32Array(n);
  }
  const A = scratchA; // opaque mask
  const E = scratchE; // emissive mask
  A.fill(0, 0, n);
  E.fill(0, 0, n);
  const accent = rgb(look.accent);
  const glow = bright(accent, 1.55);
  const outline = rgb(look.outline);
  const near = (r: number, g: number, b: number, u: [number, number, number]): boolean => Math.abs(r - u[0]) + Math.abs(g - u[1]) + Math.abs(b - u[2]) < 40;
  for (let i = 0; i < n; i++) {
    if (d[i * 4 + 3] === 0) continue;
    A[i] = 1;
    const r = d[i * 4];
    const g = d[i * 4 + 1];
    const b = d[i * 4 + 2];
    if (near(r, g, b, accent) || near(r, g, b, glow)) E[i] = 1;
  }
  // bloom kernel
  const R = 3;
  const K: number[] = [];
  for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) K.push(Math.max(0, 1 - Math.hypot(dx, dy) / (R + 0.5)) * 0.22);
  const bloom = scratchBloom;
  bloom.fill(0, 0, n);
  for (let y = R; y < h - R; y++) {
    for (let x = R; x < w - R; x++) {
      if (!E[y * w + x]) continue;
      let k = 0;
      for (let dy = -R; dy <= R; dy++) {
        const row = (y + dy) * w + x;
        for (let dx = -R; dx <= R; dx++) bloom[row + dx] += K[k++];
      }
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = y * w + x;
      const i = p * 4;
      if (A[p]) {
        const b = bloom[p];
        if (b > 0.02 && !E[p]) {
          const m = Math.min(1, b) * 0.5;
          d[i] = Math.min(255, d[i] + accent[0] * m);
          d[i + 1] = Math.min(255, d[i + 1] + accent[1] * m);
          d[i + 2] = Math.min(255, d[i + 2] + accent[2] * m);
        }
        continue;
      }
      let sr = 0;
      let sg = 0;
      let sb = 0;
      let cnt = 0;
      if (x > 0 && A[p - 1]) { sr += d[i - 4]; sg += d[i - 3]; sb += d[i - 2]; cnt++; }
      if (x < w - 1 && A[p + 1]) { sr += d[i + 4]; sg += d[i + 5]; sb += d[i + 6]; cnt++; }
      if (y > 0 && A[p - w]) { sr += d[i - w * 4]; sg += d[i - w * 4 + 1]; sb += d[i - w * 4 + 2]; cnt++; }
      if (y < h - 1 && A[p + w]) { sr += d[i + w * 4]; sg += d[i + w * 4 + 1]; sb += d[i + w * 4 + 2]; cnt++; }
      if (cnt > 0) {
        // outline = the neighbouring colour darkened, mixed with the character's outline colour; the neighbour's tint is
        // capped so the line keeps one weight across the roster (next to white feathers, chrome or snow it would turn a
        // light grey and the silhouette would dissolve into a bright background)
        let tr = (sr / cnt) * 0.126;
        let tg = (sg / cnt) * 0.126;
        let tb = (sb / cnt) * 0.126;
        const tl = tr * 0.3 + tg * 0.59 + tb * 0.11;
        if (tl > OUTLINE_TINT_MAX) {
          const k = OUTLINE_TINT_MAX / tl;
          tr *= k;
          tg *= k;
          tb *= k;
        }
        d[i] = tr + outline[0] * 0.55;
        d[i + 1] = tg + outline[1] * 0.55;
        d[i + 2] = tb + outline[2] * 0.55;
        d[i + 3] = 255;
      } else if (bloom[p] > 0.05) {
        d[i] = accent[0];
        d[i + 1] = accent[1];
        d[i + 2] = accent[2];
        d[i + 3] = Math.min(110, bloom[p] * 220);
      }
    }
  }
}
