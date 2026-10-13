import Phaser from 'phaser';
import { isSeated, MASS_HEAD, MASS_OVER, PLAT_HEAD, platformArt, stageMass } from '../art/stageMass';
import type { StageData } from '../engine/types';
import { BACKDROPS } from './BackgroundView';
import { addCanvasTexture } from '../art/canvasTexture';

/** Stage-select preview: the stage's own sky, skylines and platform art, framed on its platforms. Cached per stage. */
export function stageThumb(scene: Phaser.Scene, stage: StageData, W = 480, H = 270): string {
  const key = `thumb:${stage.id}:${W}x${H}`;
  if (scene.textures.exists(key)) return key;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  g.imageSmoothingEnabled = false;
  const theme = stage.background.theme;
  const b = BACKDROPS[theme ?? 'skyline'] ?? BACKDROPS.skyline;
  const src = (k: string): CanvasImageSource | null => (scene.textures.exists(k) ? (scene.textures.get(k).getSourceImage() as CanvasImageSource) : null);

  // sky: the backdrop's gradient stops
  const grad = g.createLinearGradient(0, 0, 0, H);
  b.sky.forEach((s, i) => grad.addColorStop(i / (b.sky.length - 1), s));
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);
  if (b.stars !== false) {
    const st = src('bg-stars-a');
    if (st) for (let x = 0; x < W; x += 256) g.drawImage(st, x, 0);
  }
  if (b.planet) {
    const pl = src('bg-planet');
    if (pl) g.drawImage(pl, W * 0.72, H * 0.08, 64, 64);
  }
  if (theme === 'dawn' || theme === 'tide') {
    const moon = theme === 'tide';
    g.fillStyle = moon ? 'rgba(230,244,255,0.95)' : 'rgba(255,248,230,0.9)';
    g.beginPath();
    g.arc(W * (moon ? 0.24 : 0.7), H * (moon ? 0.2 : 0.32), moon ? 18 : 22, 0, Math.PI * 2);
    g.fill();
  }
  const strip = (k: string, y: number, sc: number, off: number): void => {
    const s = src(k);
    if (!s) return;
    const w = (s as HTMLCanvasElement).width * sc;
    const h = (s as HTMLCanvasElement).height * sc;
    for (let x = -off; x < W; x += w) g.drawImage(s, x, y, w, h);
  };
  strip(b.farTex ?? 'bg-ruins-far', H * 0.3, 0.8, 40);
  strip(b.nearTex ?? 'bg-ruins-near', H * 0.42, 0.95, 110);
  if (b.bankTex) strip(b.bankTex, H * 0.74, 0.8, 0);

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
  stage.platforms.forEach((p, index) => {
    if (p.kind === 'solid') {
      const mk = `mass:${stage.id}:${index}:${p.w}x${p.h}`;
      if (!scene.textures.exists(mk)) addCanvasTexture(scene, mk, stageMass(theme, p.w, p.h, index + 1, isSeated(p, stage.platforms)));
      const m = src(mk) as HTMLCanvasElement;
      g.drawImage(m, ox + (p.x - MASS_OVER / 2) * sc, oy + (p.y - MASS_HEAD / 2) * sc, m.width * 0.5 * sc, m.height * 0.5 * sc);
    } else {
      const pk = `plat:${stage.id}:${index}:${p.w}x${p.h}:${p.move ? 'm' : 'p'}`;
      if (!scene.textures.exists(pk)) addCanvasTexture(scene, pk, platformArt(theme, p.w, p.h, !!p.move, index + 1));
      const t = src(pk) as HTMLCanvasElement;
      g.drawImage(t, ox + p.x * sc, oy + (p.y - PLAT_HEAD / 2) * sc, t.width * 0.5 * sc, t.height * 0.5 * sc);
    }
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
  addCanvasTexture(scene, key, c);
  return key;
}
