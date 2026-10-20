/**
 * Memory / loading work on the art pipeline must not change a pixel:
 * - the backdrop's hard-edged disc and ellipse textures are rasterised directly (no canvas fill + readback): exactly the
 *   pixels a polygon covers at least half of;
 * - a stage piece's glow overlay is made from the emissive pixels found at build time, identical to the old readback of
 *   the whole texture;
 * - scene-held textures are removed once no scene holds them, and kept while one does.
 */
import { createHash } from 'node:crypto';
import { beforeAll, describe, expect, it, vi } from 'vitest';

class ImageDataShim {
  readonly data: Uint8ClampedArray;
  readonly width: number;
  readonly height: number;
  constructor(a: number | Uint8ClampedArray, b: number, c?: number) {
    if (typeof a === 'number') {
      this.width = a;
      this.height = b;
      this.data = new Uint8ClampedArray(a * b * 4);
    } else {
      this.data = a;
      this.width = b;
      this.height = c ?? a.length / 4 / b;
    }
  }
}
const g = globalThis as { ImageData?: unknown };
if (typeof g.ImageData === 'undefined') g.ImageData = ImageDataShim;

let ct: typeof import('../src/art/canvasTexture');
let art: typeof import('../src/art/stageArt');
let mass: typeof import('../src/art/stageMass');
let stages: typeof import('../src/stages');
beforeAll(async () => {
  ct = await import('../src/art/canvasTexture');
  art = await import('../src/art/stageArt');
  mass = await import('../src/art/stageMass');
  stages = await import('../src/stages');
});

/** Exact covered area of every pixel, by brute force (each pixel square clipped against the polygon). */
function coverage(size: number, sides: number): Float64Array {
  type P = [number, number];
  const clip = (poly: P[], axis: 0 | 1, v: number, gt: boolean): P[] => {
    const out: P[] = [];
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i];
      const q = poly[(i + 1) % poly.length];
      const pin = gt ? p[axis] >= v : p[axis] <= v;
      const qin = gt ? q[axis] >= v : q[axis] <= v;
      if (pin) out.push(p);
      if (pin !== qin) {
        const t = (v - p[axis]) / (q[axis] - p[axis]);
        out.push(axis === 0 ? [v, p[1] + t * (q[1] - p[1])] : [p[0] + t * (q[0] - p[0]), v]);
      }
    }
    return out;
  };
  const area = (P: P[]): number => Math.abs(P.reduce((s, p, i) => s + p[0] * P[(i + 1) % P.length][1] - P[(i + 1) % P.length][0] * p[1], 0)) / 2;
  const r = size / 2;
  const poly: P[] = [];
  for (let i = 0; i < sides; i++) {
    const a = (i / sides) * Math.PI * 2;
    poly.push([r + Math.cos(a) * r, r + Math.sin(a) * r]);
  }
  const out = new Float64Array(size * size);
  for (let y = 0; y < size; y++) {
    const band = clip(clip(poly, 1, y, true), 1, y + 1, false);
    for (let x = 0; x < size; x++) {
      const p = clip(clip(band, 0, x, true), 0, x + 1, false);
      out[y * size + x] = p.length < 3 ? 0 : area(p);
    }
  }
  return out;
}

/** The glow overlay as StageView used to build it: a readback of the whole piece, scanned pixel by pixel. */
function oldGlow(d: Uint8ClampedArray, W: number, H: number): Uint8ClampedArray | null {
  const out = new Uint8ClampedArray(W * H * 4);
  let count = 0;
  const HALO = [255, 120, 48];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const o = (y * W + x) * 4;
      if (d[o + 3] < 200) continue;
      const mx = Math.max(d[o], d[o + 1], d[o + 2]);
      const mn = Math.min(d[o], d[o + 1], d[o + 2]);
      if (mx < 190 || mx - mn < 100) continue;
      count++;
      for (let dy = -2; dy <= 2; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= H) continue;
        for (let dx = -2; dx <= 2; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= W) continue;
          const a = HALO[Math.max(Math.abs(dx), Math.abs(dy))];
          const q = (yy * W + xx) * 4;
          if (out[q + 3] >= a) continue;
          out[q] = d[o];
          out[q + 1] = d[o + 1];
          out[q + 2] = d[o + 2];
          out[q + 3] = a;
        }
      }
    }
  }
  return count ? out : null;
}

describe('direct polygon rasterising', () => {
  it('marks exactly the pixels the polygon covers at least half of', () => {
    for (const [size, sides] of [
      [128, 100],
      [96, 32],
      [64, 7],
    ]) {
      const px = ct.polygonPixels(size, sides);
      const cov = coverage(size, sides);
      let wrong = 0;
      for (let i = 0; i < size * size; i++) {
        if (px[i * 4 + 3] !== (cov[i] >= 0.5 ? 255 : 0)) wrong++;
        if (px[i * 4] !== 255 || px[i * 4 + 1] !== 255 || px[i * 4 + 2] !== 255) wrong++;
      }
      expect(wrong, `${size}/${sides}`).toBe(0);
    }
  });

  it('draws the shipped disc and ellipse textures the same every time', () => {
    const disc = ct.polygonPixels(1024, 100);
    const ell = ct.polygonPixels(512, 32);
    const hash = (d: Uint8ClampedArray): string => createHash('sha256').update(d).digest('hex').slice(0, 16);
    expect(hash(ct.polygonPixels(1024, 100))).toBe(hash(disc));
    // a disc: symmetric, solid in the middle, empty in the corners
    expect(disc[(512 * 1024 + 512) * 4 + 3]).toBe(255);
    expect(disc[3]).toBe(0);
    for (let y = 0; y < 1024; y += 37) for (let x = 0; x < 1024; x += 41) expect(disc[(y * 1024 + x) * 4 + 3]).toBe(disc[((1023 - y) * 1024 + x) * 4 + 3]);
    expect(ell[(256 * 512 + 256) * 4 + 3]).toBe(255);
  });
});

describe('stage glow from build-time emissive pixels', () => {
  it('matches the old full-texture readback for every stage piece', () => {
    let lit = 0;
    for (const st of Object.values(stages.STAGES)) {
      st.platforms.forEach((p, index) => {
        const px =
          p.kind === 'solid'
            ? mass.stageMassPixels(st.background.theme, p.w, p.h, index + 1, mass.isSeated(p, st.platforms))
            : mass.platformArtPixels(st.background.theme, p.w, p.h, !!p.move, index + 1);
        // canvases store premultiplied colour: a readback only returns the same values for opaque pixels. The emissive test
        // only looks at alpha >= 200, which in this art is always 255, so both paths see identical values
        let semiOpaque = 0;
        for (let i = 3; i < px.data.length; i += 4) if (px.data[i] >= 200 && px.data[i] < 255) semiOpaque++;
        expect(semiOpaque, `${st.id} piece ${index}: pixels with alpha 200..254`).toBe(0);
        const want = oldGlow(px.data, px.width, px.height);
        const e = art.findEmissive(px);
        expect(!!e, `${st.id} piece ${index} glows`).toBe(!!want);
        if (!e || !want) return;
        lit++;
        expect(Buffer.from(art.glowPixels(e).buffer).equals(Buffer.from(want.buffer)), `${st.id} piece ${index}`).toBe(true);
      });
    }
    expect(lit).toBeGreaterThan(3);
  }, 120_000);
});

describe('scene-held textures', () => {
  function fakeScene(tm: { exists: (k: string) => boolean; remove: (k: string) => void }) {
    const handlers: Record<string, (() => void)[]> = {};
    return {
      textures: tm,
      events: {
        once: (ev: string, fn: () => void) => (handlers[ev] ??= []).push(fn),
        off: (ev: string, fn: () => void) => (handlers[ev] = (handlers[ev] ?? []).filter((f) => f !== fn)),
      },
      shutdown: () => [...(handlers.shutdown ?? [])].forEach((f) => f()),
    };
  }

  it('removes a texture once no scene holds it (after a grace), and keeps it while one does', () => {
    vi.useFakeTimers();
    try {
      const live = new Set(['a', 'b']);
      const tm = { exists: (k: string) => live.has(k), remove: (k: string) => live.delete(k) };
      const s1 = fakeScene(tm);
      const s2 = fakeScene(tm);
      ct.holdTexture(s1 as never, 'a');
      ct.holdTexture(s1 as never, 'a'); // once per visit
      ct.holdTexture(s1 as never, 'b');
      ct.holdTexture(s2 as never, 'b');
      s1.shutdown();
      vi.advanceTimersByTime(5000);
      expect(live.has('a')).toBe(false);
      expect(live.has('b')).toBe(true); // s2 still shows it
      // picked up again within the grace: kept
      const s3 = fakeScene(tm);
      s2.shutdown();
      ct.holdTexture(s3 as never, 'b');
      vi.advanceTimersByTime(5000);
      expect(live.has('b')).toBe(true);
      s3.shutdown();
      vi.advanceTimersByTime(5000);
      expect(live.has('b')).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});
