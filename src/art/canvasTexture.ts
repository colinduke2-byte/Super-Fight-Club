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
