import Phaser from 'phaser';
import { settings } from '../settings';

const SKY = ['#070520', '#0c0928', '#150e3a', '#231552', '#3a1f6a', '#5a2b78', '#8a4488'];
export interface Backdrop {
  sky: string[];
  planet: boolean;
  /** Multiplicative tints for the nebula, stars and the two skylines. */
  nebula: number;
  far: number;
  near: number;
  /** Tint for stage tiles (platforms) so each stage feels distinct. */
  tiles: number;
  /** Skyline textures (default: the ruined city). */
  farTex?: string;
  nearTex?: string;
  /** Animated extras drawn in screen space. */
  extras?: Extra[];
  /** Hide the star layers / nebula (daytime skies). */
  stars?: boolean;
  nebulaOn?: boolean;
  /** A band of cloud tops across the bottom of the screen. */
  bankTex?: string;
}

export type Extra = 'rain' | 'flash' | 'sun' | 'birds' | 'godrays' | 'shooting' | 'clouds' | 'embers' | 'glow' | 'lightning' | 'beams' | 'grid' | 'motes' | 'aurora' | 'airships';

export const BACKDROPS: Record<string, Backdrop> = {
  skyline: { sky: SKY, planet: true, nebula: 0xffffff, far: 0xffffff, near: 0xffffff, tiles: 0xffffff, extras: ['aurora', 'clouds', 'shooting', 'airships'] },
  void: {
    sky: ['#030a14', '#061424', '#0a2236', '#103350', '#1a4d6e', '#2a6e8a', '#4a9aa8'],
    planet: false,
    nebula: 0x70e0ff,
    far: 0xffffff,
    near: 0xffffff,
    tiles: 0xb8e8ff,
    farTex: 'bg-pylons-far',
    nearTex: 'bg-pylons-near',
    extras: ['beams', 'grid', 'shooting', 'motes'],
  },
  storm: {
    sky: ['#050912', '#0a1426', '#102038', '#1a3050', '#244260', '#2c5470', '#3a6a88'],
    planet: false,
    nebula: 0x5a86aa,
    far: 0xffffff,
    near: 0xffffff,
    tiles: 0xc8dcf0,
    farTex: 'bg-spires-far',
    nearTex: 'bg-spires-near',
    bankTex: 'bg-stormbank',
    stars: false,
    extras: ['flash', 'rain'],
  },
  dawn: {
    sky: ['#2a1a4a', '#4a2a6a', '#8a3a7a', '#d0607a', '#f08a70', '#f8b070', '#ffd890'],
    planet: false,
    nebula: 0xffffff,
    far: 0xffffff,
    near: 0xffffff,
    tiles: 0xffe8d8,
    farTex: 'bg-islands-far',
    nearTex: 'bg-islands-near',
    bankTex: 'bg-cloudsea',
    stars: false,
    nebulaOn: false,
    extras: ['sun', 'godrays', 'clouds', 'birds'],
  },
  reactor: {
    sky: ['#120404', '#240808', '#3a0e0a', '#5a1a0c', '#8a2c0c', '#c0501a', '#f08a30'],
    planet: false,
    nebula: 0xff7a40,
    far: 0xffffff,
    near: 0xffffff,
    tiles: 0xffc8a8,
    farTex: 'bg-industry-far',
    nearTex: 'bg-industry-near',
    extras: ['lightning', 'glow', 'embers'],
  },
};

/** Deterministic hash in [0,1) for animated extras (no Math.random: visuals stay reproducible). */
const hash = (n: number): number => {
  let t = (Math.imul(n | 0, 0x9e3779b1) ^ 0x85ebca6b) >>> 0;
  t = Math.imul(t ^ (t >>> 15), 0x2c1b3c6d) >>> 0;
  return ((t ^ (t >>> 12)) >>> 0) / 4294967296;
};

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

/**
 * Screen-space parallax background (own zoom-1 camera): dithered sky gradient, nebula, two star
 * layers (one twinkles), a ringed planet and two ruin skylines. Every layer is positioned from the
 * world camera's centre + zoom each frame. Art pixels are an integer number of device pixels.
 */
export class BackgroundView {
  private grad: Phaser.GameObjects.Image | null = null;
  private readonly nebula: Phaser.GameObjects.TileSprite;
  private readonly starsA: Phaser.GameObjects.TileSprite;
  private readonly starsB: Phaser.GameObjects.TileSprite;
  private readonly planet: Phaser.GameObjects.Image;
  private readonly far: Phaser.GameObjects.TileSprite;
  private readonly near: Phaser.GameObjects.TileSprite;
  private readonly clouds: Phaser.GameObjects.TileSprite;
  private readonly bank: Phaser.GameObjects.TileSprite;
  private readonly gMid: Phaser.GameObjects.Graphics;
  private bankOn = false;
  private readonly gBack: Phaser.GameObjects.Graphics;
  private readonly gFront: Phaser.GameObjects.Graphics;
  private extras: Extra[] = [];
  private sky = SKY;
  private w = 1;
  private h = 1;
  /** Device pixels per background art pixel (integer). */
  ps = 2;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly layer: Phaser.GameObjects.Layer,
  ) {
    this.nebula = scene.add.tileSprite(0, 0, 1, 1, 'bg-nebula').setOrigin(0, 0);
    this.starsA = scene.add.tileSprite(0, 0, 1, 1, 'bg-stars-a').setOrigin(0, 0);
    this.starsB = scene.add.tileSprite(0, 0, 1, 1, 'bg-stars-b').setOrigin(0, 0);
    this.planet = scene.add.image(0, 0, 'bg-planet').setOrigin(0.5, 0.5);
    this.far = scene.add.tileSprite(0, 0, 1, 192, 'bg-ruins-far').setOrigin(0, 0);
    this.near = scene.add.tileSprite(0, 0, 1, 192, 'bg-ruins-near').setOrigin(0, 0);
    this.clouds = scene.add.tileSprite(0, 0, 1, 64, 'bg-clouds').setOrigin(0, 0).setVisible(false);
    this.gBack = scene.add.graphics().setBlendMode(1 /* ADD */);
    this.gFront = scene.add.graphics().setBlendMode(1 /* ADD */);
    this.bank = scene.add.tileSprite(0, 0, 1, 128, 'bg-cloudsea').setOrigin(0, 0).setVisible(false);
    this.gMid = scene.add.graphics();
    layer.add([this.nebula, this.starsA, this.starsB, this.planet, this.gBack, this.clouds, this.far, this.near, this.gMid, this.bank, this.gFront]);
  }

  setTheme(id: string | undefined): void {
    const b = BACKDROPS[id ?? 'skyline'] ?? BACKDROPS.skyline;
    this.sky = b.sky;
    this.planet.setVisible(b.planet);
    this.nebula.setTint(b.nebula);
    this.far.setTint(b.far);
    this.near.setTint(b.near);
    this.far.setTexture(b.farTex ?? 'bg-ruins-far');
    this.near.setTexture(b.nearTex ?? 'bg-ruins-near');
    this.extras = b.extras ?? [];
    this.clouds.setVisible(this.extras.includes('clouds'));
    this.starsA.setVisible(b.stars !== false);
    this.starsB.setVisible(b.stars !== false);
    this.nebula.setVisible(b.nebulaOn !== false);
    this.bankOn = !!b.bankTex;
    this.bank.setVisible(this.bankOn);
    if (b.bankTex) this.bank.setTexture(b.bankTex);
    if (this.w > 1) this.resize(this.w, this.h);
  }

  resize(w: number, h: number): void {
    this.w = w;
    this.h = h;
    this.ps = Math.max(1, Math.round(h / 540));
    const ps = this.ps;
    // dithered gradient at art-pixel resolution, rebuilt on resize
    const gw = Math.ceil(w / ps);
    const gh = Math.ceil(h / ps);
    const c = document.createElement('canvas');
    c.width = gw;
    c.height = gh;
    const g = c.getContext('2d')!;
    const img = g.createImageData(gw, gh);
    const SKYC = this.sky;
    const rgb = SKYC.map((s) => [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)]);
    for (let y = 0; y < gh; y++) {
      const t = (y / (gh - 1)) * (SKYC.length - 1);
      const i0 = Math.min(SKYC.length - 2, Math.floor(t));
      const f = t - i0;
      for (let x = 0; x < gw; x++) {
        const lv = f > BAYER[(y & 3) * 4 + (x & 3)] / 16 ? i0 + 1 : i0;
        const o = (y * gw + x) * 4;
        img.data[o] = rgb[lv][0];
        img.data[o + 1] = rgb[lv][1];
        img.data[o + 2] = rgb[lv][2];
        img.data[o + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    if (this.scene.textures.exists('bg-grad-dyn')) this.scene.textures.remove('bg-grad-dyn');
    this.scene.textures.addCanvas('bg-grad-dyn', c);
    this.grad?.destroy();
    this.grad = this.scene.add.image(0, 0, 'bg-grad-dyn').setOrigin(0, 0).setScale(ps);
    this.layer.add(this.grad);
    this.layer.sendToBack(this.grad);

    for (const t of [this.nebula, this.starsA, this.starsB]) t.setSize(w, h);
    this.far.setSize(w, 192 * ps);
    this.near.setSize(w, 192 * ps);
  }

  /** @param zoom world camera zoom (device px per world unit); @param time seconds, for twinkling */
  update(cx: number, cy: number, zoom: number, time: number): void {
    const ps = this.ps;
    const W = this.w;
    const H = this.h;

    this.nebula.setTileScale(ps * 2, ps * 2);
    this.nebula.tilePositionX = (cx * 0.03 * zoom) / (ps * 2);
    this.nebula.tilePositionY = (cy * 0.03 * zoom) / (ps * 2);

    this.starsA.setTileScale(ps, ps);
    this.starsA.tilePositionX = (cx * 0.05 * zoom) / ps;
    this.starsA.tilePositionY = (cy * 0.05 * zoom) / ps;
    this.starsB.setTileScale(ps, ps);
    this.starsB.tilePositionX = (cx * 0.1 * zoom) / ps;
    this.starsB.tilePositionY = (cy * 0.1 * zoom) / ps;
    this.starsB.setAlpha(0.65 + 0.35 * Math.sin(time * 1.7));

    this.planet.setScale(ps * 1.5);
    this.planet.setPosition(W * 0.78 - cx * 0.02 * zoom, H * 0.26 - cy * 0.02 * zoom);

    // skylines: art pixel = 0.5 world units * layer scale; base line follows the camera with parallax
    const layers: [Phaser.GameObjects.TileSprite, number, number, number][] = [
      [this.far, 0.12, 0.5 * 0.55, 20],
      [this.near, 0.26, 0.5 * 0.85, 52],
    ];
    for (const [t, f, k, baseY] of layers) {
      const s = zoom * k;
      t.setTileScale(s, s);
      t.setSize(W, 192 * s);
      t.setPosition(0, (baseY - cy * f) * zoom + H / 2 - 192 * s);
      t.tilePositionX = (cx * f * zoom) / s;
    }

    if (this.bankOn) {
      const k = ps * 2;
      this.bank.setTileScale(k, k);
      this.bank.setSize(W, 128 * k);
      this.bank.setPosition(0, H - 128 * k * 0.55 + Math.max(0, cy * 0.02 * zoom));
      this.bank.tilePositionX = (cx * 0.35 * zoom + time * 5 * ps) / k;
    }

    this.drawExtras(cx, cy, zoom, time);
  }

  private drawExtras(cx: number, cy: number, zoom: number, time: number): void {
    const gb = this.gBack;
    const gf = this.gFront;
    gb.clear();
    gf.clear();
    this.gMid.clear();
    const gm = this.gMid;
    const W = this.w;
    const H = this.h;
    const ps = this.ps;
    for (const e of this.extras) {
      switch (e) {
        case 'clouds': {
          const k = ps * 1.6;
          this.clouds.setTileScale(k, k);
          this.clouds.setSize(W, 64 * k);
          this.clouds.setPosition(0, H * 0.34 - cy * 0.04 * zoom);
          this.clouds.tilePositionX = (cx * 0.08 * zoom + time * 7 * ps) / k;
          this.clouds.setAlpha(0.85);
          break;
        }
        case 'rain': {
          // slanted streaks falling past the camera, two depths
          for (let i = 0; i < 110; i++) {
            const depth = hash(i * 7 + 5) > 0.6 ? 1 : 0.55;
            const sp = (1.1 + hash(i * 7 + 1) * 0.6) * depth;
            const ph = (time * sp + hash(i * 7 + 2)) % 1;
            const x = (((hash(i * 7) * (W + 80) - ph * 40 * ps - cx * 0.3 * zoom * depth) % (W + 80)) + (W + 80)) % (W + 80) - 20;
            const y = ph * (H + 30) - 15;
            gf.lineStyle(Math.max(1, ps * 0.6 * depth), 0xa8d0f0, 0.3 * depth);
            gf.lineBetween(x, y, x - 3 * ps, y + 10 * ps * depth);
          }
          break;
        }
        case 'flash': {
          // distant lightning: a jagged bolt with branches, and a pale flash of the whole sky
          const slot = Math.floor(time / 5.5);
          const off = 0.8 + hash(slot * 3 + 7) * 3.6;
          const d = time - slot * 5.5 - off;
          if (d > 0 && d < 0.55 && hash(slot * 3 + 4) > 0.2) {
            const fade = d < 0.08 ? 1 : d < 0.18 ? 0.25 : d < 0.28 ? 0.8 : Math.max(0, 1 - d * 1.9);
            gb.fillStyle(0xcfe8ff, 0.14 * fade * (settings.reduceFlashes ? 0.2 : 1));
            gb.fillRect(0, 0, W, H);
            const bx = W * (0.15 + hash(slot * 3 + 9) * 0.7) - cx * 0.02 * zoom;
            let x = bx;
            let y = -4;
            gb.lineStyle(Math.max(2, ps * 1.5), 0xffffff, 0.9 * fade);
            for (let i = 0; i < 12; i++) {
              const nx = x + (hash(slot * 31 + i) - 0.5) * 38 * ps;
              const ny = y + H * 0.075;
              gb.lineBetween(x, y, nx, ny);
              if (i === 4 || i === 8) {
                gb.lineStyle(Math.max(1, ps), 0xbfe0ff, 0.6 * fade);
                gb.lineBetween(nx, ny, nx + (hash(slot * 17 + i) - 0.3) * 60 * ps, ny + H * 0.1);
                gb.lineStyle(Math.max(2, ps * 1.5), 0xffffff, 0.9 * fade);
              }
              x = nx;
              y = ny;
            }
          }
          break;
        }
        case 'sun': {
          const sx = W * 0.7 - cx * 0.015 * zoom;
          const sy = H * 0.36 - cy * 0.01 * zoom;
          const pulse = 0.94 + 0.06 * Math.sin(time * 0.9);
          for (let r = 7; r >= 1; r--) {
            gb.fillStyle(r > 4 ? 0xffb070 : 0xffd890, 0.05 + (7 - r) * 0.012);
            gb.fillCircle(sx, sy, r * H * 0.075 * pulse);
          }
          gb.fillStyle(0xfff2c8, 0.9).fillCircle(sx, sy, H * 0.07);
          gb.fillStyle(0xffffff, 0.8).fillCircle(sx - H * 0.012, sy - H * 0.012, H * 0.05);
          break;
        }
        case 'godrays': {
          const sx = W * 0.7 - cx * 0.015 * zoom;
          const sy = H * 0.36 - cy * 0.01 * zoom;
          for (let i = 0; i < 7; i++) {
            const a = Math.PI * (0.62 + i * 0.12) + Math.sin(time * 0.15 + i) * 0.03;
            const len = H * 1.3;
            const half = 0.045 + (i % 3) * 0.015;
            gb.fillStyle(0xffe0b0, 0.05);
            gb.fillTriangle(sx, sy, sx + Math.cos(a - half) * len, sy + Math.sin(a - half) * len, sx + Math.cos(a + half) * len, sy + Math.sin(a + half) * len);
          }
          break;
        }
        case 'birds': {
          // small flocks crossing the sky, wings flapping
          for (let f = 0; f < 2; f++) {
            const dir = f === 0 ? 1 : -1;
            const u = ((time * (0.018 + f * 0.007) + f * 0.5) % 1 + 1) % 1;
            const bx0 = (dir > 0 ? u : 1 - u) * (W + 200) - 100 - cx * 0.04 * zoom;
            const by0 = H * (0.2 + f * 0.13) - cy * 0.03 * zoom;
            for (let i = 0; i < 5; i++) {
              const x = bx0 - dir * i * 14 * ps;
              const y = by0 + Math.abs(i - 2) * 6 * ps + Math.sin(time * 1.3 + i) * 3 * ps;
              const flap = Math.sin(time * 7 + i * 1.3) * 3 * ps;
              gm.lineStyle(Math.max(1, ps * 0.8), 0x4a2a4e, 0.85);
              gm.lineBetween(x - 5 * ps, y - flap, x, y);
              gm.lineBetween(x, y, x + 5 * ps, y - flap);
            }
          }
          break;
        }
        case 'aurora': {
          // slow curtains of magenta and teal light
          for (let band = 0; band < 3; band++) {
            const col = band === 1 ? 0x40e8d0 : 0xd060f0;
            const baseY = H * (0.14 + band * 0.07) - cy * 0.03 * zoom;
            const step = Math.max(8, W / 48);
            for (let x = 0; x < W; x += step) {
              const u = x / W;
              const wave = Math.sin(u * 5 + time * 0.25 + band * 1.7) * H * 0.04 + Math.sin(u * 11 - time * 0.4 + band) * H * 0.015;
              const len = H * (0.12 + 0.06 * Math.sin(u * 7 + time * 0.3 + band * 2));
              const a = 0.05 + 0.03 * Math.sin(u * 9 + time * 0.5 + band);
              gb.fillGradientStyle(col, col, col, col, a, a, 0, 0);
              gb.fillRect(x - cx * 0.02 * zoom, baseY + wave, step + 1, len);
            }
          }
          break;
        }
        case 'airships': {
          // far-off craft crossing with blinking nav lights
          for (let i = 0; i < 3; i++) {
            const sp = 0.012 + hash(i + 40) * 0.01;
            const u = (time * sp * (i % 2 ? -1 : 1) + hash(i + 50)) % 1;
            const x = (((u % 1) + 1) % 1) * (W + 80) - 40 - cx * 0.05 * zoom;
            const y = H * (0.28 + hash(i + 60) * 0.12) - cy * 0.05 * zoom;
            const blink = Math.sin(time * 3 + i * 2) > 0.2;
            gf.fillStyle(0xffffff, blink ? 0.9 : 0.15);
            gf.fillRect(Math.round(x), Math.round(y), ps * 2, ps * 2);
            gf.fillStyle(0xff4a4a, 0.7);
            gf.fillRect(Math.round(x - ps * 6), Math.round(y + ps), ps * 2, ps * 2);
            gf.fillStyle(0x4aff8a, 0.7);
            gf.fillRect(Math.round(x + ps * 6), Math.round(y + ps), ps * 2, ps * 2);
          }
          break;
        }
        case 'shooting': {
          // one streak every ~6 s, each with its own start point and angle
          const slot = Math.floor(time / 6);
          const t = (time - slot * 6) / 0.7;
          if (t < 1 && hash(slot * 3 + 1) > 0.25) {
            const x0 = W * (0.1 + hash(slot * 3) * 0.8);
            const y0 = H * (0.05 + hash(slot * 3 + 2) * 0.3);
            const dx = (hash(slot * 7) > 0.5 ? 1 : -1) * W * 0.28;
            const dy = H * 0.12;
            const hx = x0 + dx * t;
            const hy = y0 + dy * t;
            for (let i = 0; i < 8; i++) {
              const u = Math.max(0, t - i * 0.035);
              gb.fillStyle(0xffffff, (1 - i / 8) * (1 - t * 0.6));
              gb.fillRect(Math.round(x0 + dx * u), Math.round(y0 + dy * u), ps * 2, ps * 2);
            }
            gb.fillStyle(0xcfe8ff, 0.9);
            gb.fillRect(Math.round(hx), Math.round(hy), ps * 3, ps * 3);
          }
          break;
        }
        case 'lightning': {
          // rare flash across the reactor sky
          const slot = Math.floor(time / 8);
          const t = time - slot * 8;
          const off = 1 + hash(slot) * 5;
          const d = t - off;
          if (d > 0 && d < 0.35) {
            const a = (d < 0.07 ? 0.2 : d < 0.15 ? 0.04 : d < 0.22 ? 0.16 : 0.05) * (1 - d);
            gb.fillStyle(0xffb878, a * (settings.reduceFlashes ? 0.2 : 1));
            gb.fillRect(0, 0, W, H);
          }
          break;
        }
        case 'glow': {
          const pulse = 0.75 + 0.25 * Math.sin(time * 1.4);
          const top = H * 0.5;
          gb.fillGradientStyle(0xff5a10, 0xff5a10, 0xff8a28, 0xff8a28, 0, 0, 0.34 * pulse, 0.34 * pulse);
          gb.fillRect(0, top, W, H - top);
          // molten sun/core low on the horizon, drifting with the camera
          const gx = W * 0.5 - cx * 0.03 * zoom;
          for (let r = 4; r >= 1; r--) {
            gb.fillStyle(0xff7a20, 0.05 * pulse);
            gb.fillCircle(gx, H * 0.78, r * H * 0.12);
          }
          break;
        }
        case 'embers': {
          for (let i = 0; i < 46; i++) {
            const speed = 0.04 + hash(i * 5 + 1) * 0.07;
            const ph = (time * speed + hash(i * 5 + 2)) % 1;
            const sway = Math.sin(time * (0.6 + hash(i * 5 + 3)) + i) * 14 * ps;
            const x = hash(i * 5) * W + sway - cx * 0.2 * zoom;
            const y = H * (1.05 - ph * 1.15);
            const wx = ((x % W) + W) % W;
            const flick = 0.55 + 0.45 * Math.sin(time * 9 + i * 1.7);
            gf.fillStyle(ph > 0.6 ? 0xff8a30 : 0xffd060, (1 - ph) * flick);
            const sz = hash(i * 5 + 4) > 0.8 ? ps * 3 : ps * 2;
            gf.fillRect(Math.round(wx), Math.round(y), sz, sz);
          }
          break;
        }
        case 'beams': {
          for (let i = 0; i < 3; i++) {
            const ox = W * (0.2 + i * 0.3) - cx * 0.04 * zoom;
            const ang = Math.sin(time * 0.35 + i * 2.1) * 0.35;
            const reach = H * 1.1;
            const tx = ox + Math.sin(ang) * reach;
            const half = H * 0.07;
            gb.fillStyle(0x6ae8ff, 0.06);
            gb.fillTriangle(ox, -4, tx - half, reach, tx + half, reach);
            gb.fillStyle(0xbffcff, 0.05);
            gb.fillTriangle(ox, -4, tx - half * 0.4, reach, tx + half * 0.4, reach);
          }
          break;
        }
        case 'grid': {
          const hy = H * 0.8;
          const vx = W * 0.5 - cx * 0.06 * zoom;
          gb.lineStyle(Math.max(1, ps * 0.5), 0x4ad8ff, 0.2);
          for (let k = -14; k <= 14; k++) {
            gb.lineBetween(vx + k * W * 0.03, hy, vx + k * W * 0.2, H);
          }
          for (let k = 0; k < 8; k++) {
            const f = ((k + ((time * 0.35 + cx * 0.0004) % 1)) / 8) ** 2;
            const y = hy + (H - hy) * f;
            gb.lineBetween(0, y, W, y);
          }
          break;
        }
        case 'motes': {
          for (let i = 0; i < 28; i++) {
            const ph = (time * (0.02 + hash(i * 3 + 1) * 0.03) + hash(i * 3 + 2)) % 1;
            const x = ((hash(i * 3) * W - cx * 0.12 * zoom + Math.sin(time * 0.5 + i) * 10 * ps) % W + W) % W;
            const y = H * (1 - ph);
            const sz = ps * (hash(i + 99) > 0.7 ? 3 : 2);
            gf.fillStyle(0x9ff4ff, 0.5 * Math.sin(ph * Math.PI));
            gf.fillRect(Math.round(x), Math.round(y), sz, sz);
          }
          break;
        }
      }
    }
  }
}
