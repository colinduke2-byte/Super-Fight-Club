import Phaser from 'phaser';
import { MASS_HEAD, MASS_OVER, PLAT_HEAD } from '../art/stageMass';
import { ensureStageArtNow, stageArtSource } from '../art/stageArt';
import type { StageData } from '../engine/types';
import { BACKDROPS, type Backdrop } from './BackgroundView';
import { addCanvasTexture, context2d, holdTexture } from '../art/canvasTexture';
import { GROUND_LAYERS, ensureGroundTextures } from '../art/stageTextures';

/** The match backdrop's ground-layer parallax (BackgroundView's GROUND_PARALLAX). */
const GROUND_PARALLAX = [0.26, 0.34, 0.45];
/** The thumbnail is laid out as a 1280x720 screen (the layer maths match BackgroundView there), then scaled down. */
const VW = 1280;
const VH = 720;

/** Tinted layer copies made while drawing one thumbnail (freed when it is done). */
type TintCache = Map<string, HTMLCanvasElement>;
/** A copy of a layer texture multiplied by `tint` (alpha kept), as Phaser's tint does in the match. */
function tinted(cache: TintCache, key: string, img: CanvasImageSource, tint: number): CanvasImageSource {
  if (tint === 0xffffff) return img;
  const id = `${key}:${tint}`;
  const hit = cache.get(id);
  if (hit) return hit;
  const sw = (img as HTMLCanvasElement).width;
  const sh = (img as HTMLCanvasElement).height;
  const c = document.createElement('canvas');
  c.width = sw;
  c.height = sh;
  const g = context2d(c);
  if (!g) return img;
  g.drawImage(img, 0, 0);
  g.globalCompositeOperation = 'multiply';
  g.fillStyle = `#${tint.toString(16).padStart(6, '0')}`;
  g.fillRect(0, 0, sw, sh);
  g.globalCompositeOperation = 'destination-in';
  g.drawImage(img, 0, 0);
  cache.set(id, c);
  return c;
}

/** Bottom-row colours already read (by texture key and tint): the layer textures never change. */
const skirtCache = new Map<string, string | null>();

/** Average colour of a texture's bottom row, or null when that row is not (nearly) opaque all the way across. */
function bottomColour(img: CanvasImageSource): string | null {
  const c = img as HTMLCanvasElement;
  if (typeof c.getContext !== 'function' || !c.width || !c.height) return null;
  let row: Uint8ClampedArray;
  try {
    const ctx = c.getContext('2d');
    if (!ctx) return null;
    row = ctx.getImageData(0, c.height - 1, c.width, 1).data;
  } catch {
    return null;
  }
  let r = 0;
  let gg = 0;
  let bb = 0;
  let n = 0;
  for (let i = 0; i < row.length; i += 4) {
    if (row[i + 3] < 200) continue;
    r += row[i];
    gg += row[i + 1];
    bb += row[i + 2];
    n++;
  }
  if (n < c.width * 0.85) return null;
  return `rgb(${Math.round(r / n)},${Math.round(gg / n)},${Math.round(bb / n)})`;
}

function cachedBottomColour(id: string, img: () => CanvasImageSource | null): string | null {
  if (skirtCache.has(id)) return skirtCache.get(id)!;
  const im = img();
  if (!im) return null;
  const v = bottomColour(im);
  skirtCache.set(id, v);
  return v;
}

/**
 * The stage's backdrop as the match draws it for a camera at world (cx, cy) with `sc` thumbnail px per world unit:
 * sky, stars, planet, overcast, both skylines, the three parallax ground layers, the solid ground under them and the
 * cloud bank. Drawn on a virtual 1280x720 screen so BackgroundView's layer maths carry over unchanged.
 */
function drawBackdrop(
  scene: Phaser.Scene,
  g: CanvasRenderingContext2D,
  b: Backdrop,
  theme: string | undefined,
  W: number,
  H: number,
  sc: number,
  cx: number,
  cy: number,
  src: (k: string) => CanvasImageSource | null,
  tints: TintCache,
): void {
  const f = W / VW;
  const zoom = sc / f;
  g.save();
  g.setTransform(f, 0, 0, H / VH, 0, 0);
  const grad = g.createLinearGradient(0, 0, 0, VH);
  b.sky.forEach((s, i) => grad.addColorStop(i / (b.sky.length - 1), s));
  g.fillStyle = grad;
  g.fillRect(0, 0, VW, VH);
  const tile = (key: string, img: CanvasImageSource | null, y: number, s: number, off: number, tint = 0xffffff, rows?: number): number => {
    if (!img) return 0;
    const im = tinted(tints, key, img, tint);
    const sw = (img as HTMLCanvasElement).width;
    const sh = rows ?? (img as HTMLCanvasElement).height;
    const w = sw * s;
    const start = -(((off * s) % w) + w) % w;
    for (let x = start; x < VW; x += w) g.drawImage(im, 0, 0, sw, sh, x, y, w, sh * s);
    return sh * s;
  };
  if (b.stars !== false) {
    const st = src('bg-stars-a');
    if (st) for (let y = 0; y < VH; y += (st as HTMLCanvasElement).height) tile('bg-stars-a', st, y, 1, cx * 0.05 * zoom);
  }
  if (b.planet) {
    const pl = src('bg-planet') as HTMLCanvasElement | null;
    if (pl) {
      const pw = pl.width * 1.5;
      const ph = pl.height * 1.5;
      g.drawImage(pl, VW * 0.78 - cx * 0.02 * zoom - pw / 2, VH * 0.26 - cy * 0.02 * zoom - ph / 2, pw, ph);
    }
  }
  if (theme === 'dawn' || theme === 'tide') {
    const moon = theme === 'tide';
    g.fillStyle = moon ? 'rgba(230,244,255,0.95)' : 'rgba(255,248,230,0.9)';
    g.beginPath();
    g.arc(VW * (moon ? 0.24 : 0.7), VH * (moon ? 0.2 : 0.32), moon ? 48 : 58, 0, Math.PI * 2);
    g.fill();
  }
  if (b.overcast) tile(b.overcast, src(b.overcast), -2 * 40 - Math.max(0, cy) * 0.03 * zoom, 2, (cx * 0.06 * zoom) / 2);
  const farTex = b.farTex ?? 'bg-ruins-far';
  const nearTex = b.nearTex ?? 'bg-ruins-near';
  const fs = zoom * 0.5 * 0.55;
  tile(farTex, src(farTex), (20 - cy * 0.12) * zoom + VH / 2 - 192 * fs, fs, (cx * 0.12 * zoom) / fs, b.far);
  const ns = zoom * 0.5 * 0.85;
  const nearY = (52 - cy * 0.26) * zoom + VH / 2 - 192 * ns;
  tile(nearTex, src(nearTex), nearY, ns, (cx * 0.26 * zoom) / ns, b.near);
  let bottom = nearY + 192 * ns;
  let skirt = src(nearTex) ? cachedBottomColour(`${nearTex}:${b.near}`, () => tinted(tints, nearTex, src(nearTex)!, b.near)) : null;
  if (b.ground) {
    ensureGroundTextures(scene, b.ground);
    const base = Math.floor(bottom) - 1;
    GROUND_LAYERS.forEach((L, i) => {
      const key = `${b.ground}-${i}`;
      tile(key, src(key), Math.floor(base + L.top * ns), ns, (cx * GROUND_PARALLAX[i] * zoom) / ns);
      bottom = base + L.top * ns + L.h * ns;
    });
    const lastKey = `${b.ground}-${GROUND_LAYERS.length - 1}`;
    skirt = cachedBottomColour(lastKey, () => src(lastKey));
  }
  if (skirt && bottom < VH) {
    g.fillStyle = skirt;
    g.fillRect(0, Math.floor(bottom) - 1, VW, VH - Math.floor(bottom) + 1);
  }
  if (b.bankTex) tile(b.bankTex, src(b.bankTex), VH - 128 * 2 * 0.55 + Math.max(0, cy * 0.02 * zoom), 2, (cx * 0.35 * zoom) / 2, b.bankTint ?? 0xffffff);
  g.restore();
}

/** Stage-select preview: the stage's own sky, skylines and platform art, framed on its platforms. Cached per stage while a scene shows it. */
export function stageThumb(scene: Phaser.Scene, stage: StageData, W = 480, H = 270): string {
  const key = `thumb:${stage.id}:${W}x${H}`;
  // the match draws this stage's ground planes too: keep them (and the preview) while this screen is up
  holdGround(scene, stage);
  if (!scene.textures.exists(key)) {
    ensureStageArtNow(scene, stage);
    const tm = scene.textures;
    const c = drawThumb({ textures: tm } as Phaser.Scene, stage, W, H);
    // released once uploaded (WebGL), redrawn the same way after a context loss
    if (c) addCanvasTexture(scene, key, c, () => drawThumb({ textures: tm } as Phaser.Scene, stage, W, H));
  }
  if (scene.textures.exists(key)) holdTexture(scene, key);
  return scene.textures.exists(key) ? key : '__MISSING';
}

/** Hold a stage's ground-plane textures (building them if needed) for as long as `scene` runs. */
export function holdGround(scene: Phaser.Scene, stage: StageData): void {
  const b = BACKDROPS[stage.background.theme ?? 'skyline'] ?? BACKDROPS.skyline;
  if (!b.ground) return;
  ensureGroundTextures(scene, b.ground);
  for (let i = 0; i < GROUND_LAYERS.length; i++) if (scene.textures.exists(`${b.ground}-${i}`)) holdTexture(scene, `${b.ground}-${i}`);
}

function drawThumb(scene: Phaser.Scene, stage: StageData, W: number, H: number): HTMLCanvasElement | null {
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = context2d(c);
  if (!g) return null;
  const tints: TintCache = new Map();
  try {
    paintThumb(scene, g, stage, W, H, tints);
  } finally {
    for (const t of tints.values()) {
      t.width = 0;
      t.height = 0;
    }
  }
  return c;
}

function paintThumb(scene: Phaser.Scene, g: CanvasRenderingContext2D, stage: StageData, W: number, H: number, tints: TintCache): void {
  g.imageSmoothingEnabled = false;
  const theme = stage.background.theme;
  const b = BACKDROPS[theme ?? 'skyline'] ?? BACKDROPS.skyline;
  const src = (k: string): CanvasImageSource | null => (scene.textures.exists(k) ? (scene.textures.get(k).getSourceImage() as CanvasImageSource) : null);

  // frame the platforms (not the blast zones) so the stage reads big
  let x0 = Infinity;
  let x1 = -Infinity;
  let y0 = Infinity;
  for (const p of stage.platforms) {
    x0 = Math.min(x0, p.x);
    x1 = Math.max(x1, p.x + p.w);
    y0 = Math.min(y0, p.y);
  }
  const span = (x1 - x0) * 1.12;
  const sc = Math.min(W / span, (H * 0.54) / (-y0 + 16));
  const ox = W / 2 - ((x0 + x1) / 2) * sc;
  const oy = H * 0.62;
  drawBackdrop(scene, g, b, theme, W, H, sc, (x0 + x1) / 2, (H / 2 - oy) / sc, src, tints);
  stage.platforms.forEach((p, index) => {
    // the piece's pixels (its texture gave its canvas back once uploaded)
    const art = stageArtSource(scene, stage, index);
    if (!art) return;
    const m = art.img;
    if (p.kind === 'solid') g.drawImage(m, ox + (p.x - MASS_OVER / 2) * sc, oy + (p.y - MASS_HEAD / 2) * sc, m.width * 0.5 * sc, m.height * 0.5 * sc);
    else g.drawImage(m, ox + p.x * sc, oy + (p.y - PLAT_HEAD / 2) * sc, m.width * 0.5 * sc, m.height * 0.5 * sc);
    art.done();
  });
  for (const h of stage.hazards ?? []) {
    const cx = ox + h.x * sc;
    if (h.kind === 'stalactite') {
      // a crystal spike hanging over the spot it falls on
      const ty = oy + h.y * sc;
      g.fillStyle = 'rgba(200,152,246,0.95)';
      g.beginPath();
      g.moveTo(cx - 5, Math.max(4, ty));
      g.lineTo(cx + 5, Math.max(4, ty));
      g.lineTo(cx, Math.max(4, ty) + 18);
      g.fill();
      continue;
    }
    if (h.kind === 'bolt') {
      g.strokeStyle = 'rgba(220,244,255,0.95)';
      g.lineWidth = 2;
      g.beginPath();
      let y = 0;
      g.moveTo(cx, y);
      for (let i = 1; i <= 7; i++) {
        y = oy + (h.y + h.h) * sc * (i / 7);
        g.lineTo(cx + (i % 2 ? 5 : -5), y);
      }
      g.stroke();
    } else {
      const top = oy + (h.y - h.h) * sc;
      const gg = g.createLinearGradient(0, top, 0, oy + h.y * sc);
      const water = h.style === 'water';
      gg.addColorStop(0, water ? 'rgba(220,250,255,0.2)' : 'rgba(255,200,90,0)');
      gg.addColorStop(0.4, water ? 'rgba(60,170,220,0.75)' : 'rgba(255,140,40,0.7)');
      gg.addColorStop(1, water ? 'rgba(230,250,255,0.95)' : 'rgba(255,240,180,0.95)');
      g.fillStyle = gg;
      g.fillRect(cx - (h.w / 2) * sc, top, h.w * sc, h.h * sc);
    }
  }
  // vignette
  const v = g.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, W * 0.65);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, 'rgba(0,0,0,0.45)');
  g.fillStyle = v;
  g.fillRect(0, 0, W, H);
}
