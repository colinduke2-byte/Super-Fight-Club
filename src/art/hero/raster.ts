/**
 * Tiny software rasteriser for the full-resolution fighter art. Shapes are painted into an id buffer (painter's algorithm,
 * no anti-aliasing, so everything stays crisp pixel art); `shade()` then lights every pixel by its distance to the edge of
 * its own part, which gives each armour plate a rim light on the top-left, a cast shade on the bottom-right and a visible
 * seam wherever two parts meet.
 */

export type RGB = [number, number, number];
export type V2 = [number, number];

export interface PartDef {
  color: RGB;
  /** Self-lit (glowing) pixels: never shaded, they bloom into their surroundings. */
  emissive?: boolean;
  /** No edge lighting (stripes, rivets, glyphs and other thin details). */
  flat?: boolean;
  /** Softer lighting for cloth / skin / fur (rim only, no hard seams). */
  soft?: boolean;
}

const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const mul = (c: RGB, k: number): RGB => [Math.min(255, c[0] * k), Math.min(255, c[1] * k), Math.min(255, c[2] * k)];

export class Raster {
  readonly id: Uint16Array;
  readonly parts: PartDef[] = [{ color: [0, 0, 0] }];
  /** Optional per-pixel colour override (gradients), 0xRRGGBB + 1, or 0 for none. */
  readonly over: Uint32Array;

  constructor(
    readonly w: number,
    readonly h: number = w,
  ) {
    this.id = new Uint16Array(w * h);
    this.over = new Uint32Array(w * h);
  }

  part(color: RGB, o: Omit<PartDef, 'color'> = {}): number {
    this.parts.push({ color, ...o });
    return this.parts.length - 1;
  }

  set(p: number, x: number, y: number): void {
    x = Math.round(x);
    y = Math.round(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    this.id[y * this.w + x] = p;
    this.over[y * this.w + x] = 0;
  }

  /** Paint with an explicit colour that still belongs to part `p` for lighting purposes. */
  setColor(p: number, c: RGB, x: number, y: number): void {
    x = Math.round(x);
    y = Math.round(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    this.id[y * this.w + x] = p;
    this.over[y * this.w + x] = ((c[0] & 255) << 16) | ((c[1] & 255) << 8) | (c[2] & 255) | 0x1000000;
  }

  rect(p: number, x: number, y: number, w: number, h: number): void {
    const x0 = Math.round(x);
    const y0 = Math.round(y);
    const x1 = Math.round(x + w);
    const y1 = Math.round(y + h);
    for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) this.set(p, xx, yy);
  }

  ellipse(p: number, cx: number, cy: number, rx: number, ry: number): void {
    const y0 = Math.floor(cy - ry);
    const y1 = Math.ceil(cy + ry);
    const x0 = Math.floor(cx - rx);
    const x1 = Math.ceil(cx + rx);
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const dx = (x + 0.5 - cx) / rx;
        const dy = (y + 0.5 - cy) / ry;
        if (dx * dx + dy * dy <= 1) this.set(p, x, y);
      }
    }
  }

  /** Scanline polygon fill (even-odd). */
  poly(p: number, pts: V2[]): void {
    let minY = Infinity;
    let maxY = -Infinity;
    for (const q of pts) {
      minY = Math.min(minY, q[1]);
      maxY = Math.max(maxY, q[1]);
    }
    const n = pts.length;
    for (let y = Math.floor(minY); y <= Math.ceil(maxY); y++) {
      const yc = y + 0.5;
      const xs: number[] = [];
      for (let i = 0; i < n; i++) {
        const a = pts[i];
        const b = pts[(i + 1) % n];
        if ((a[1] <= yc && b[1] > yc) || (b[1] <= yc && a[1] > yc)) xs.push(a[0] + ((yc - a[1]) / (b[1] - a[1])) * (b[0] - a[0]));
      }
      xs.sort((u, v) => u - v);
      for (let i = 0; i + 1 < xs.length; i += 2) {
        for (let x = Math.round(xs[i]); x < Math.round(xs[i + 1]); x++) this.set(p, x, y);
      }
    }
  }

  /** Tapered capsule from (x0,y0) to (x1,y1) with widths w0 -> w1 (round caps). */
  seg(p: number, x0: number, y0: number, x1: number, y1: number, w0: number, w1 = w0): void {
    const minX = Math.floor(Math.min(x0, x1) - Math.max(w0, w1));
    const maxX = Math.ceil(Math.max(x0, x1) + Math.max(w0, w1));
    const minY = Math.floor(Math.min(y0, y1) - Math.max(w0, w1));
    const maxY = Math.ceil(Math.max(y0, y1) + Math.max(w0, w1));
    const dx = x1 - x0;
    const dy = y1 - y0;
    const l2 = dx * dx + dy * dy || 1;
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        let t = ((x + 0.5 - x0) * dx + (y + 0.5 - y0) * dy) / l2;
        t = Math.max(0, Math.min(1, t));
        const px = x0 + dx * t;
        const py = y0 + dy * t;
        const r = (w0 + (w1 - w0) * t) / 2;
        const ex = x + 0.5 - px;
        const ey = y + 0.5 - py;
        if (ex * ex + ey * ey <= r * r) this.set(p, x, y);
      }
    }
  }

  /** Overwrite only pixels that currently belong to `onto` (inlays: glyphs on a plate, stripes on a cape). */
  inlay(onto: number, p: number, fn: (set: (x: number, y: number) => void) => void): void {
    fn((x, y) => {
      x = Math.round(x);
      y = Math.round(y);
      if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
      if (this.id[y * this.w + x] === onto) this.id[y * this.w + x] = p;
    });
  }

  /** A copy rotated 90 degrees counter-clockwise (head to the left), moved so its lowest pixel sits on row `baseY` and its middle on column `midX`. */
  lyingDown(baseY: number, midX: number): Raster {
    const W = this.w;
    const H = this.h;
    const out = new Raster(W, H);
    out.parts.length = 0;
    for (const p of this.parts) out.parts.push(p);
    let minX = W;
    let maxX = 0;
    let maxY = 0;
    // (x, y) -> (y, W - 1 - x) lands in a W x H canvas only when it fits; the figure is far smaller than the frame
    const nxOf = (y: number): number => y;
    const nyOf = (x: number): number => W - 1 - x;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (!this.id[y * W + x]) continue;
        minX = Math.min(minX, nxOf(y));
        maxX = Math.max(maxX, nxOf(y));
        maxY = Math.max(maxY, nyOf(x));
      }
    }
    const dx = Math.round(midX - (minX + maxX) / 2);
    const dy = baseY - maxY;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        if (!this.id[i]) continue;
        const nx = nxOf(y) + dx;
        const ny = nyOf(x) + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        out.id[ny * W + nx] = this.id[i];
        out.over[ny * W + nx] = this.over[i];
      }
    }
    return out;
  }

  /** Light every part pixel by its edge distance (see the file comment) and write RGBA into `out` (alpha 255 where painted). */
  shade(out: Uint8ClampedArray): void {
    const W = this.w;
    const H = this.h;
    const id = this.id;
    const same = (x: number, y: number, p: number): boolean => x >= 0 && y >= 0 && x < W && y < H && id[y * W + x] === p;
    const warm: RGB = [255, 242, 214];
    const cool: RGB = [28, 18, 72];
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        const pid = id[i];
        if (pid === 0) continue;
        const part = this.parts[pid];
        const ov = this.over[i];
        let c: RGB = ov ? [(ov >> 16) & 255, (ov >> 8) & 255, ov & 255] : part.color;
        if (!part.emissive && !part.flat) {
          let ul = 0;
          while (ul < 4 && same(x - (ul + 1), y, pid) && same(x, y - (ul + 1), pid)) ul++;
          let dr = 0;
          while (dr < 4 && same(x + dr + 1, y, pid) && same(x, y + dr + 1, pid)) dr++;
          // pure vertical / horizontal distances catch edges that the diagonal test above would miss
          const up = same(x, y - 1, pid);
          const lf = same(x - 1, y, pid);
          const dn = same(x, y + 1, pid);
          const rt = same(x + 1, y, pid);
          const vol = 1.06 - (y / H) * 0.14; // faint top-to-bottom volume
          c = mul(c, vol);
          if (!up || !lf) c = mix(mul(c, part.soft ? 1.12 : 1.3), warm, 0.1);
          else if (ul <= 1 && ((x + y) & 1) === 0) c = mul(c, 1.1);
          if (!dn || !rt) c = mix(mul(c, part.soft ? 0.8 : 0.66), cool, 0.2);
          else if (dr <= 1) c = mix(mul(c, 0.86), cool, 0.08);
          else if (dr <= 2 && ((x + y) & 1) === 0) c = mul(c, 0.92);
        }
        out[i * 4] = c[0];
        out[i * 4 + 1] = c[1];
        out[i * 4 + 2] = c[2];
        out[i * 4 + 3] = 255;
      }
    }
  }
}

export const col = (hex: string): RGB => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
export { mix, mul };

/** Two-bone IK: the middle joint of a limb from `a` to `b` with segment lengths l1, l2; `bend` picks the side (+1/-1). */
export function ik(a: V2, b: V2, l1: number, l2: number, bend: 1 | -1): V2 {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  let d = Math.hypot(dx, dy) || 0.001;
  const maxD = (l1 + l2) * 0.999;
  if (d > maxD) d = maxD;
  const ux = dx / (Math.hypot(dx, dy) || 1);
  const uy = dy / (Math.hypot(dx, dy) || 1);
  const along = (d * d + l1 * l1 - l2 * l2) / (2 * d);
  const h = Math.sqrt(Math.max(0, l1 * l1 - along * along));
  return [a[0] + ux * along - uy * h * bend, a[1] + uy * along + ux * h * bend];
}
