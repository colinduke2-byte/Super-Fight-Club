import type Phaser from 'phaser';

/** Phaser.Renderer.Events.RESTORE_WEBGL (a string here, so this module stays importable without Phaser at runtime). */
const RESTORE_WEBGL = 'restorewebgl';

/** Regenerates a released texture's pixels (exactly as first drawn) after a WebGL context loss; null gives up. */
export type CanvasRebuild = () => HTMLCanvasElement | null | Promise<HTMLCanvasElement | null>;

/** Released textures and how to redraw each, for a WebGL context restore (keyed by the texture object itself). */
const rebuilders = new WeakMap<Phaser.Textures.Texture, CanvasRebuild>();
/** Texture managers whose renderer already has the restore hook. */
const hooked = new WeakSet<Phaser.Textures.TextureManager>();

/**
 * Register a generated canvas as a texture. `textures.addCanvas` builds a Phaser CanvasTexture, whose constructor reads every
 * pixel back with getImageData (a big, slow copy for the fighter sheets, and pure waste: nothing edits these textures after
 * they are drawn). A plain image texture with the canvas as its source skips the readback.
 *
 * With `rebuild` (WebGL only), the canvas is released once the GPU has its copy: its backing store is freed and only the
 * GPU texture remains, so a big sheet is held once instead of twice. Phaser re-uploads textures from their source canvas
 * when a lost WebGL context comes back; a released texture is redrawn with `rebuild` instead (same pixels, same upload
 * path), so it is only blank for the moment the redraw takes. Only pass it for textures nothing reads back on the CPU
 * (getSourceImage / getPixel).
 */
export function addCanvasTexture(scene: Phaser.Scene, key: string, canvas: HTMLCanvasElement, rebuild?: CanvasRebuild): Phaser.Textures.Texture {
  const tex = scene.textures.addImage(key, canvas as unknown as HTMLImageElement)!;
  if (rebuild) releaseCanvasSource(scene.textures, tex, rebuild);
  return tex;
}

/** The WebGL renderer of a texture manager's game, or null (canvas renderer, headless). */
function webgl(tm: Phaser.Textures.TextureManager): Phaser.Renderer.WebGL.WebGLRenderer | null {
  const r = tm.game?.renderer as Phaser.Renderer.WebGL.WebGLRenderer | undefined;
  return r && r.gl ? r : null;
}

function releaseCanvasSource(tm: Phaser.Textures.TextureManager, tex: Phaser.Textures.Texture, rebuild: CanvasRebuild): void {
  const renderer = webgl(tm);
  const src = tex.source[0];
  const wrapper = src?.glTexture;
  // the canvas renderer draws from the canvas itself: it has to stay
  if (!renderer || !wrapper || !(src.image instanceof HTMLCanvasElement)) return;
  hookRestore(tm, renderer);
  rebuilders.set(tex, rebuild);
  // texImage2D has already copied the pixels (or, with the context lost right now, never will: the restore redraws them)
  wrapper.pixels = null; // a restore then allocates the texture blank at its size, and the rebuild fills it
  freeCanvas(src.image);
}

/** Drop a canvas's backing store (the element itself is tiny). */
function freeCanvas(c: HTMLCanvasElement): void {
  c.width = 0;
  c.height = 0;
}

const textureList = (tm: Phaser.Textures.TextureManager): Record<string, Phaser.Textures.Texture> => tm.list as Record<string, Phaser.Textures.Texture>;

function hookRestore(tm: Phaser.Textures.TextureManager, renderer: Phaser.Renderer.WebGL.WebGLRenderer): void {
  if (hooked.has(tm)) return;
  hooked.add(tm);
  renderer.on(RESTORE_WEBGL, () => {
    for (const tex of Object.values(textureList(tm))) {
      const rebuild = rebuilders.get(tex);
      if (rebuild) void restoreTexture(tm, renderer, tex, rebuild);
    }
  });
}

/** After a context restore: redraw a released texture and upload it into its (re-created, blank) GL texture. */
async function restoreTexture(tm: Phaser.Textures.TextureManager, renderer: Phaser.Renderer.WebGL.WebGLRenderer, tex: Phaser.Textures.Texture, rebuild: CanvasRebuild): Promise<void> {
  let canvas: HTMLCanvasElement | null = null;
  try {
    canvas = await rebuild();
  } catch (err) {
    console.warn(`[textures] could not redraw ${tex.key} after a context loss:`, err);
  }
  if (!canvas) return;
  const w = tex.source[0]?.glTexture;
  // removed or replaced meanwhile, or lost again (the next restore redraws it)
  if (textureList(tm)[tex.key] !== tex || !w || renderer.contextLost || renderer.gl.isContextLost()) return freeCanvas(canvas);
  w.update(canvas, canvas.width, canvas.height, w.flipY, w.wrapS, w.wrapT, w.minFilter, w.magFilter, w.format);
  w.pixels = null;
  freeCanvas(canvas);
}

/** Debug / tests: whether a texture's CPU-side canvas has been released. */
export function isReleased(tex: Phaser.Textures.Texture): boolean {
  return rebuilders.has(tex);
}

// ---------------------------------------------------------------------------------------------
// Running out of canvas memory, scene-scoped textures, GPU limits
// ---------------------------------------------------------------------------------------------

/** Ways to give canvas / texture memory back when a canvas cannot get a context (see context2d). */
const pressureHooks = new Set<() => void>();

/** Register something that can drop cached canvases or unused textures when canvas memory runs out. */
export function onCanvasPressure(fn: () => void): void {
  pressureHooks.add(fn);
}

/**
 * `canvas.getContext('2d')` that never throws. Browsers cap the total canvas memory a page may hold (iOS Safari most
 * strictly) and return null past it: then everything that can be dropped and rebuilt later is freed and it tries once
 * more. Null means the canvas really cannot be drawn: the caller skips that piece of art instead of crashing.
 */
export function context2d(c: HTMLCanvasElement, opts?: CanvasRenderingContext2DSettings): CanvasRenderingContext2D | null {
  const get = (): CanvasRenderingContext2D | null => {
    try {
      return c.getContext('2d', opts) as CanvasRenderingContext2D | null;
    } catch {
      return null;
    }
  };
  const first = get();
  if (first) return first;
  for (const fn of pressureHooks) {
    try {
      fn();
    } catch {
      /* best effort */
    }
  }
  const again = get();
  if (!again) console.warn(`[textures] no 2D context for a ${c.width}x${c.height} canvas (canvas memory exhausted?): skipped`);
  return again;
}

/** A 2D context that accepts every call and draws nothing (getters read as no-op functions). */
const NOOP_CTX: CanvasRenderingContext2D = new Proxy({} as CanvasRenderingContext2D, {
  get: (_t, k) => (k === 'canvas' ? undefined : () => NOOP_CTX),
  set: () => true,
});

/**
 * context2d for small decorative textures drawn with many calls: when no context can be had, a context that draws nothing,
 * so the texture comes out blank (transparent) instead of the build throwing.
 */
export function context2dOrBlank(c: HTMLCanvasElement, opts?: CanvasRenderingContext2DSettings): CanvasRenderingContext2D {
  return context2d(c, opts) ?? NOOP_CTX;
}

/** Scenes' held texture keys (for the current visit) and how many live holds each key has. */
const held = new WeakMap<Phaser.Scene, Set<string>>();
const holds = new Map<string, number>();
/** Texture managers that own held keys (to remove them once unreferenced). */
const holdTm = new Map<string, Phaser.Textures.TextureManager>();
/** How long an unreferenced held texture stays, so a scene change (one scene shuts down, the next opens) can reuse it. */
const HOLD_GRACE_MS = 1500;

function releaseUnheld(key: string): void {
  if ((holds.get(key) ?? 0) > 0) return;
  holds.delete(key);
  const tm = holdTm.get(key);
  holdTm.delete(key);
  if (tm?.exists(key)) tm.remove(key);
}

/**
 * Mark texture `key` as used by `scene` until that scene shuts down. A texture every holder has let go of is removed
 * (after a short grace, so the next scene can pick it up again): for big, per-screen textures (the menu sky, stage
 * previews, a stage's glow and ground planes) that would otherwise pile up for the whole session. Only for textures that
 * can be rebuilt on demand by whoever needs them next.
 */
export function holdTexture(scene: Phaser.Scene, key: string): void {
  let mine = held.get(scene);
  if (!mine) {
    mine = new Set();
    held.set(scene, mine);
  }
  if (mine.has(key)) return;
  if (!mine.size) {
    const set = mine;
    const drop = (): void => {
      scene.events?.off('shutdown', drop);
      scene.events?.off('destroy', drop);
      const keys = [...set];
      set.clear();
      for (const k of keys) {
        holds.set(k, Math.max(0, (holds.get(k) ?? 1) - 1));
        if (!holds.get(k)) setTimeout(() => releaseUnheld(k), HOLD_GRACE_MS);
      }
    };
    scene.events?.once('shutdown', drop);
    scene.events?.once('destroy', drop);
  }
  mine.add(key);
  holds.set(key, (holds.get(key) ?? 0) + 1);
  holdTm.set(key, scene.textures);
}

onCanvasPressure(() => {
  // under memory pressure the grace period is skipped
  for (const k of [...holdTm.keys()]) if (!holds.get(k)) releaseUnheld(k);
});

/** The GPU's largest texture side (Infinity for the canvas renderer, or when it cannot be read). */
export function maxTextureSize(tm: Phaser.Textures.TextureManager): number {
  // testing hook: ?maxtex=<px> pretends the GPU's limit is lower (to exercise the split-sheet path on any machine)
  const forced = typeof location !== 'undefined' ? Number(new URLSearchParams(location.search).get('maxtex')) : 0;
  if (forced > 0) return forced;
  const r = webgl(tm);
  if (!r) return Infinity;
  try {
    const v = r.getMaxTextureSize?.() ?? (r.gl.getParameter(r.gl.MAX_TEXTURE_SIZE) as number);
    return v > 0 ? v : Infinity;
  } catch {
    return Infinity;
  }
}

// ---------------------------------------------------------------------------------------------
// Hard-edged polygons, rasterised directly
// ---------------------------------------------------------------------------------------------

type Pt = [number, number];

/** Sutherland-Hodgman: keep the part of a convex polygon on one side of the line axis = v. */
function clipAxis(poly: Pt[], axis: 0 | 1, v: number, keepGreater: boolean): Pt[] {
  const out: Pt[] = [];
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % n];
    const pin = keepGreater ? p[axis] >= v : p[axis] <= v;
    const qin = keepGreater ? q[axis] >= v : q[axis] <= v;
    if (pin) out.push(p);
    if (pin !== qin) {
      const t = (v - p[axis]) / (q[axis] - p[axis]);
      out.push(axis === 0 ? [v, p[1] + t * (q[1] - p[1])] : [p[0] + t * (q[0] - p[0]), v]);
    }
  }
  return out;
}

function polyArea(P: Pt[]): number {
  let s = 0;
  for (let i = 0; i < P.length; i++) {
    const p = P[i];
    const q = P[(i + 1) % P.length];
    s += p[0] * q[1] - q[0] * p[1];
  }
  return Math.abs(s) / 2;
}

/**
 * RGBA pixels of a white regular `sides`-gon inscribed in a `size` square (first vertex at angle 0, like Phaser's arc),
 * hard-edged: a pixel is opaque when the polygon covers at least half of it (exact area), else transparent. Computed
 * directly, with no canvas fill and readback (a 1024px readback alone cost seconds on some GPUs).
 */
export function polygonPixels(size: number, sides: number): Uint8ClampedArray {
  const r = size / 2;
  const poly: Pt[] = [];
  for (let i = 0; i < sides; i++) {
    const a = (i / sides) * Math.PI * 2;
    poly.push([r + Math.cos(a) * r, r + Math.sin(a) * r]);
  }
  const d = new Uint8ClampedArray(size * size * 4);
  // every pixel is white; only the alpha differs
  for (let i = 0; i < d.length; i += 4) d[i] = d[i + 1] = d[i + 2] = 255;
  for (let y = 0; y < size; y++) {
    const band = clipAxis(clipAxis(poly, 1, y, true), 1, y + 1, false);
    if (band.length < 3) continue;
    let mn = Infinity;
    let mx = -Infinity;
    // the polygon's extent along the band's top and bottom edges (convex: the fully covered span lies between them)
    let lt = Infinity;
    let rt = -Infinity;
    let lb = Infinity;
    let rb = -Infinity;
    for (const [px, py] of band) {
      if (px < mn) mn = px;
      if (px > mx) mx = px;
      if (py === y) {
        lt = Math.min(lt, px);
        rt = Math.max(rt, px);
      }
      if (py === y + 1) {
        lb = Math.min(lb, px);
        rb = Math.max(rb, px);
      }
    }
    const full0 = lt <= rt && lb <= rb ? Math.ceil(Math.max(lt, lb)) : Infinity;
    const full1 = lt <= rt && lb <= rb ? Math.floor(Math.min(rt, rb)) : -Infinity;
    const x0 = Math.max(0, Math.floor(mn));
    const x1 = Math.min(size, Math.ceil(mx));
    const row = y * size * 4;
    for (let x = x0; x < x1; x++) {
      let on: boolean;
      if (x >= full0 && x + 1 <= full1) on = true;
      else {
        const P = clipAxis(clipAxis(band, 0, x, true), 0, x + 1, false);
        on = P.length >= 3 && polyArea(P) >= 0.5;
      }
      if (on) d[row + x * 4 + 3] = 255;
    }
  }
  return d;
}
