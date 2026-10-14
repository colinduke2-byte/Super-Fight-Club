import Phaser from 'phaser';
import { COVE_LAMP, GROUND_LAYERS, INDUSTRY_VENTS, ensureGroundTextures } from '../art/stageTextures';
import { settings } from '../settings';
import { addCanvasTexture } from '../art/canvasTexture';

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
  /** Multiplicative tint for the bottom cloud/snow bank (night scenes dim it so pale fighters still read against it). */
  bankTint?: number;
  /** The scenery streams past (a moving stage): art px per second at the far layer; nearer layers move faster. */
  scroll?: number;
  /** Ground below the near skyline: textures `${ground}-0..2` (far floor, mid ridge, foreground), each nearer one parallaxing faster. */
  ground?: string;
  /** Light playing on water / lava in the far ground layer (art rows y0..y1 of `${ground}-0`): a moon's reflected path, or scattered glints. */
  glint?: { cols: number[]; y0: number; y1: number; path?: boolean; alpha?: number };
  /** Colours (low, high) and strength of the 'glow' extra's horizon haze. */
  glowCol?: [number, number];
  glowAlpha?: number;
  /** An overcast of cloud undersides hung across the top of the sky (a cloud-bank texture, flipped). */
  overcast?: string;
}

export type Extra = 'rain' | 'flash' | 'sun' | 'birds' | 'godrays' | 'shooting' | 'clouds' | 'embers' | 'glow' | 'lightning' | 'beams' | 'grid' | 'motes' | 'aurora' | 'airships' | 'moon' | 'beacon' | 'ceiling' | 'drips' | 'snow' | 'smoke' | 'shafts' | 'fireflies' | 'searchlights' | 'traffic' | 'datastream' | 'wisps' | 'petals' | 'flare' | 'wind';

/** Horizontal parallax of the three ground layers (the near skyline is 0.26, so the far floor stays planted under it). */
const GROUND_PARALLAX = [0.26, 0.34, 0.45];

export const BACKDROPS: Record<string, Backdrop> = {
  skyline: {
    sky: SKY,
    planet: true,
    nebula: 0xffffff,
    far: 0xffffff,
    near: 0xffffff,
    tiles: 0xffffff,
    ground: 'bg-city-ground',
    glint: { cols: [0xffcf6a, 0x7fe8ff, 0xff8a5a, 0xff7ae0], y0: 4, y1: 150, alpha: 0.9 },
    glowCol: [0x5a1a7a, 0xd060c0],
    glowAlpha: 0.16,
    extras: ['glow', 'searchlights', 'aurora', 'clouds', 'shooting', 'traffic', 'airships'],
  },
  void: {
    sky: ['#030a14', '#061424', '#0a2236', '#103350', '#1a4d6e', '#2a6e8a', '#4a9aa8'],
    planet: false,
    nebula: 0x70e0ff,
    far: 0xffffff,
    near: 0xffffff,
    tiles: 0xb8e8ff,
    farTex: 'bg-pylons-far',
    nearTex: 'bg-pylons-near',
    glowCol: [0x0a3a5a, 0x2ab8e0],
    glowAlpha: 0.14,
    extras: ['glow', 'beams', 'grid', 'datastream', 'shooting', 'motes'],
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
    ground: 'bg-storm-sea',
    overcast: 'bg-stormbank',
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
    extras: ['sun', 'godrays', 'clouds', 'wisps', 'birds', 'petals', 'flare'],
  },
  temple: {
    sky: ['#081a1e', '#0e2a2c', '#163c3a', '#245448', '#3a6e52', '#6a8a5a', '#c8a060'],
    planet: false,
    nebula: 0x9fe0b0,
    far: 0xffffff,
    near: 0xffffff,
    tiles: 0xd8f0d0,
    farTex: 'bg-jungle-far',
    nearTex: 'bg-jungle-near',
    bankTex: 'bg-mist',
    ground: 'bg-jungle-ground',
    stars: true,
    nebulaOn: false,
    extras: ['godrays', 'motes', 'birds', 'fireflies'],
  },
  tide: {
    sky: ['#03060f', '#071226', '#0c1e3a', '#14304e', '#1e4862', '#215a6e', '#0c2a3c'],
    planet: false,
    nebula: 0x6ab0d0,
    far: 0xffffff,
    near: 0xffffff,
    tiles: 0xd0f0f0,
    farTex: 'bg-cove-far',
    nearTex: 'bg-cove-near',
    bankTex: 'bg-surf',
    ground: 'bg-cove-sea',
    glint: { cols: [0xe6f2ff, 0x9ad0ff], y0: 1, y1: 160, path: true },
    nebulaOn: false,
    extras: ['moon', 'beacon', 'shooting', 'motes'],
  },
  cavern: {
    sky: ['#05030a', '#0a0614', '#120a22', '#1c1032', '#2a1646', '#3a1e5a', '#4a2670'],
    planet: false,
    nebula: 0xa868e0,
    far: 0xffffff,
    near: 0xffffff,
    tiles: 0xe8d8ff,
    farTex: 'bg-geode-far',
    nearTex: 'bg-geode-near',
    bankTex: 'bg-cavemist',
    ground: 'bg-geode-ground',
    glint: { cols: [0xd8b8ff, 0x7af0e8, 0xa868e0], y0: 10, y1: 100 },
    glowCol: [0x3a1470, 0x8a4ad0],
    glowAlpha: 0.22,
    stars: false,
    nebulaOn: false,
    extras: ['glow', 'shafts', 'ceiling', 'drips', 'motes'],
  },
  frost: {
    sky: ['#0a1430', '#122248', '#1c3462', '#2e4c7c', '#4a6a96', '#7a92b4', '#c0cce0'],
    planet: false,
    nebula: 0x9fd0ff,
    // the moonlit snow is dimmed a little so pale fighters stand out against it
    far: 0xbcc8dc,
    near: 0xb4c2da,
    tiles: 0xe8f2ff,
    farTex: 'bg-peaks-far',
    nearTex: 'bg-shrine-near',
    bankTex: 'bg-snowbank',
    bankTint: 0xa0b2d0,
    ground: 'bg-frost-ground',
    glint: { cols: [0xf0f8ff, 0xb8d8ff], y0: 12, y1: 64, path: true, alpha: 0.7 },
    nebulaOn: false,
    extras: ['moon', 'aurora', 'snow'],
  },
  airship: {
    sky: ['#1a1030', '#2e1a48', '#4a2a5e', '#7a3e6a', '#b85e6a', '#e8906a', '#ffc88a'],
    planet: false,
    nebula: 0xffffff,
    far: 0xffd8c0,
    near: 0xffffff,
    tiles: 0xffe8d8,
    farTex: 'bg-thunderheads-far',
    nearTex: 'bg-islands-near',
    bankTex: 'bg-cloudsea',
    stars: false,
    nebulaOn: false,
    scroll: 26,
    extras: ['sun', 'clouds', 'wisps', 'birds', 'flash', 'wind', 'flare'],
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
    ground: 'bg-reactor-ground',
    glint: { cols: [0xfff0a0, 0xffb040, 0xff7a1a], y0: 6, y1: 80, alpha: 0.9 },
    extras: ['lightning', 'glow', 'smoke', 'embers'],
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
  /** Solid ground continuing below the near skyline when its art reaches the bottom edge (jungle floor, snow, city). */
  private readonly skirt: Phaser.GameObjects.Rectangle;
  private readonly clouds: Phaser.GameObjects.TileSprite;
  private readonly bank: Phaser.GameObjects.TileSprite;
  private readonly gMid: Phaser.GameObjects.Graphics;
  private bankOn = false;
  private readonly gBack: Phaser.GameObjects.Graphics;
  private readonly gFront: Phaser.GameObjects.Graphics;
  /** Normal-blend drawing between the far and near skylines (smoke from the far stacks). */
  private readonly gFar: Phaser.GameObjects.Graphics;
  /** Additive light over the ground layers (reflections on water, glints on lava). */
  private readonly gGlint: Phaser.GameObjects.Graphics;
  private readonly grounds: Phaser.GameObjects.TileSprite[];
  private readonly overcast: Phaser.GameObjects.TileSprite;
  private groundOn = false;
  private overcastOn = false;
  private glint: Backdrop['glint'];
  private glowCol: [number, number] = [0xff5a10, 0xff8a28];
  private glowAlpha = 0.34;
  /** Screen y of the far ground layer's top and its scale (device px per art px), for effects drawn over it. */
  private groundTop = 0;
  private groundS = 1;
  /** Brightness of the current lightning flash (0..1), which lights the overcast from inside. */
  private flashNow = 0;
  private extras: Extra[] = [];
  private scroll = 0;
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
    this.grounds = GROUND_LAYERS.map((l) => scene.add.tileSprite(0, 0, 1, l.h, 'bg-ruins-near').setOrigin(0, 0).setVisible(false));
    this.overcast = scene.add.tileSprite(0, 0, 1, 128, 'bg-cloudsea').setOrigin(0, 0).setFlipY(true).setVisible(false);
    this.gFar = scene.add.graphics();
    this.gGlint = scene.add.graphics().setBlendMode(1 /* ADD */);
    this.skirt = scene.add.rectangle(0, 0, 1, 1, 0x000000).setOrigin(0, 0).setVisible(false);
    this.clouds = scene.add.tileSprite(0, 0, 1, 64, 'bg-clouds').setOrigin(0, 0).setVisible(false);
    this.gBack = scene.add.graphics().setBlendMode(1 /* ADD */);
    this.gFront = scene.add.graphics().setBlendMode(1 /* ADD */);
    this.bank = scene.add.tileSprite(0, 0, 1, 128, 'bg-cloudsea').setOrigin(0, 0).setVisible(false);
    this.gMid = scene.add.graphics();
    layer.add([this.nebula, this.starsA, this.starsB, this.planet, this.gBack, this.overcast, this.clouds, this.far, this.gFar, this.near, ...this.grounds, this.skirt, this.gGlint, this.gMid, this.bank, this.gFront]);
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
    if (b.ground) ensureGroundTextures(this.scene, b.ground);
    this.groundOn = !!b.ground;
    this.grounds.forEach((t, i) => {
      t.setVisible(this.groundOn);
      if (b.ground) t.setTexture(`${b.ground}-${i}`);
    });
    this.overcastOn = !!b.overcast;
    this.overcast.setVisible(this.overcastOn);
    if (b.overcast) this.overcast.setTexture(b.overcast);
    this.glint = b.glint;
    this.glowCol = b.glowCol ?? [0xff5a10, 0xff8a28];
    this.glowAlpha = b.glowAlpha ?? 0.34;
    // below everything drawn, the ground continues in the colour of its last row
    const ground = b.ground ? this.bottomColour(`${b.ground}-${this.grounds.length - 1}`, 0xffffff) : this.bottomColour(b.nearTex ?? 'bg-ruins-near', b.near);
    this.skirt.setVisible(ground !== null);
    if (ground !== null) this.skirt.setFillStyle(ground);
    this.extras = b.extras ?? [];
    this.scroll = b.scroll ?? 0;
    this.clouds.setVisible(this.extras.includes('clouds'));
    this.starsA.setVisible(b.stars !== false);
    this.starsB.setVisible(b.stars !== false);
    this.nebula.setVisible(b.nebulaOn !== false);
    this.bankOn = !!b.bankTex;
    this.bank.setVisible(this.bankOn);
    if (b.bankTex) this.bank.setTexture(b.bankTex);
    this.bank.setTint(b.bankTint ?? 0xffffff);
    if (this.w > 1) this.resize(this.w, this.h);
  }

  /** The average colour of a skyline texture's bottom row (times its tint), or null when that row is mostly sky. */
  private bottomColour(key: string, tint: number): number | null {
    const src = this.scene.textures.get(key).getSourceImage() as HTMLCanvasElement;
    const ctx = typeof src.getContext === 'function' ? src.getContext('2d') : null;
    if (!ctx) return null;
    const row = ctx.getImageData(0, src.height - 1, src.width, 1).data;
    let r = 0;
    let g = 0;
    let bl = 0;
    let n = 0;
    for (let i = 0; i < row.length; i += 4) {
      if (row[i + 3] < 200) continue;
      r += row[i];
      g += row[i + 1];
      bl += row[i + 2];
      n++;
    }
    if (n < src.width * 0.85) return null;
    const t = (s: number, v: number): number => Math.round(((v / n) * ((tint >> s) & 255)) / 255);
    return (t(16, r) << 16) | (t(8, g) << 8) | t(0, bl);
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
    // one gradient texture per scene: a scene running over another (Controls over a paused match) must not replace the one it draws
    const key = `bg-grad-dyn:${this.scene.sys.settings.key}`;
    this.grad?.destroy();
    this.grad = null;
    if (this.scene.textures.exists(key)) this.scene.textures.remove(key);
    addCanvasTexture(this.scene, key, c);
    this.grad = this.scene.add.image(0, 0, key).setOrigin(0, 0).setScale(ps);
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
      t.tilePositionX = (cx * f * zoom) / s + time * this.scroll * (f / 0.12);
    }
    // the ground layers hang rigidly from the near skyline's base and slide past one another, nearer ones faster
    let bottom = this.near.y + this.near.height;
    if (this.groundOn) {
      const s = zoom * 0.5 * 0.85;
      const base = Math.floor(this.near.y + this.near.height) - 1;
      this.groundTop = base;
      this.groundS = s;
      this.grounds.forEach((t, i) => {
        const L = GROUND_LAYERS[i];
        const f = GROUND_PARALLAX[i];
        t.setTileScale(s, s);
        t.setSize(W, Math.ceil(L.h * s) + 1);
        t.setPosition(0, Math.floor(base + L.top * s));
        t.tilePositionX = (cx * f * zoom) / s + time * this.scroll * (f / 0.12);
      });
      const last = this.grounds[this.grounds.length - 1];
      bottom = last.y + GROUND_LAYERS[GROUND_LAYERS.length - 1].h * s;
    }
    if (this.skirt.visible) {
      const top = Math.floor(bottom) - 1;
      this.skirt.setPosition(0, top).setSize(W, Math.max(0, H - top));
    }
    if (this.overcastOn) {
      // cloud undersides scudding across the top of the sky, faster than the far scenery
      const k = ps * 2;
      this.overcast.setTileScale(k, k);
      this.overcast.setSize(W, 128 * k);
      this.overcast.setPosition(0, -k * 40 - Math.max(0, cy) * 0.03 * zoom);
      this.overcast.tilePositionX = (cx * 0.06 * zoom + time * 14 * ps) / k;
    }

    if (this.bankOn) {
      const k = ps * 2;
      this.bank.setTileScale(k, k);
      this.bank.setSize(W, 128 * k);
      this.bank.setPosition(0, H - 128 * k * 0.55 + Math.max(0, cy * 0.02 * zoom));
      this.bank.tilePositionX = (cx * 0.35 * zoom + time * (5 + this.scroll * 4) * ps) / k;
    }

    this.drawExtras(cx, cy, zoom, time);
  }

  private drawExtras(cx: number, cy: number, zoom: number, time: number): void {
    const gb = this.gBack;
    const gf = this.gFront;
    gb.clear();
    gf.clear();
    this.gMid.clear();
    this.gFar.clear();
    this.gGlint.clear();
    this.flashNow = 0;
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
          this.clouds.tilePositionX = (cx * 0.08 * zoom + time * (7 + this.scroll * 2) * ps) / k;
          this.clouds.setAlpha(0.85);
          break;
        }
        case 'snow': {
          // big soft flakes drifting down and sideways, two depths, swaying as they fall
          for (let i = 0; i < 90; i++) {
            const depth = hash(i * 5 + 3) > 0.55 ? 1 : 0.5;
            const sp = (0.08 + hash(i * 5 + 1) * 0.07) * (depth + 0.4);
            const ph = (time * sp + hash(i * 5 + 2)) % 1;
            const sway = Math.sin(time * (0.8 + hash(i) * 0.6) + i) * 10 * ps * depth;
            const x = (((hash(i * 5) * (W + 60) + sway - ph * 30 * ps - cx * 0.25 * zoom * depth) % (W + 60)) + (W + 60)) % (W + 60) - 20;
            const y = ph * (H + 20) - 10;
            const s = Math.max(1, Math.round(ps * (depth > 0.9 ? 1.6 : 1)));
            gf.fillStyle(0xffffff, depth > 0.9 ? 0.8 : 0.45).fillRect(x, y, s, s);
          }
          // a few big flakes tumbling past close to the camera
          for (let i = 0; i < 22; i++) {
            const sp = 0.16 + hash(i * 9 + 701) * 0.08;
            const ph = (time * sp + hash(i * 9 + 702)) % 1;
            const sway = Math.sin(time * (1.1 + hash(i * 9 + 703)) + i) * 18 * ps;
            const span = W + 120;
            const x = (((hash(i * 9 + 704) * span + sway - ph * 60 * ps - cx * 0.5 * zoom) % span) + span) % span - 60;
            const y = ph * (H + 40) - 20;
            const s = ps * 2;
            gf.fillStyle(0xe8f4ff, 0.35).fillRect(x - ps, y, s + ps * 2, s);
            gf.fillStyle(0xe8f4ff, 0.35).fillRect(x, y - ps, s, s + ps * 2);
            gf.fillStyle(0xffffff, 0.85).fillRect(x, y, s, s);
          }
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
            this.flashNow = fade * (settings.reduceFlashes ? 0.2 : 1);
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
        case 'ceiling': {
          // the cave roof: a ragged band of rock across the top with stalactites hanging from it, glinting crystal in the cracks
          const top = -H * 0.02 - cy * 0.05 * zoom;
          const step = 6 * ps;
          const shift = cx * 0.08 * zoom;
          // rock lit from below by the crystals: a pale rim along the underside and the lit flank of each spike
          const ROCK = 0x140e20;
          const RIM = 0x2e1f4a;
          for (let x = -step; x < W + step; x += step) {
            const u = Math.floor((x + shift) / step);
            const d = H * (0.05 + 0.03 * hash(u * 3 + 1));
            const x0 = x - (shift % step);
            gm.fillStyle(ROCK, 1).fillRect(x0, top - H, step + 1, d + H);
            gm.fillStyle(RIM, 1).fillRect(x0, top + d - ps, step + 1, ps);
            if (hash(u * 7 + 2) > 0.72) {
              // a stalactite: a narrow downward spike
              const len = H * (0.06 + 0.1 * hash(u * 5 + 3));
              const sx = x0 + step / 2;
              gm.fillStyle(ROCK, 1).fillTriangle(sx - step * 0.9, top + d - 1, sx + step * 0.9, top + d - 1, sx, top + d + len);
              gm.fillStyle(RIM, 1).fillTriangle(sx - step * 0.9, top + d - 1, sx - step * 0.45, top + d - 1, sx, top + d + len);
              if (hash(u * 11 + 4) > 0.5) {
                gf.fillStyle(0xc898f6, 0.35 + 0.2 * Math.sin(time * 1.3 + u));
                gf.fillRect(sx - ps, top + d + len * 0.4, ps * 2, ps * 2);
              }
            }
          }
          break;
        }
        case 'searchlights': {
          // beams swinging up out of the city below, crossing now and then
          for (let i = 0; i < 4; i++) {
            const ox = W * (0.08 + i * 0.29) - cx * 0.1 * zoom;
            const oy = H * 0.98 - cy * 0.1 * zoom;
            const ang = -Math.PI / 2 + Math.sin(time * (0.22 + i * 0.05) + i * 1.7) * 0.55;
            const len = H * 1.25;
            const half = 0.035;
            const tx = ox + Math.cos(ang) * len;
            const ty = oy + Math.sin(ang) * len;
            const lx = ox + Math.cos(ang - half) * len;
            const ly = oy + Math.sin(ang - half) * len;
            const rx = ox + Math.cos(ang + half) * len;
            const ry = oy + Math.sin(ang + half) * len;
            const col = i % 2 ? 0xffd8f0 : 0xd8f0ff;
            gb.fillGradientStyle(col, col, col, col, 0.1, 0, 0, 0);
            gb.fillTriangle(ox, oy, lx, ly, rx, ry);
            gb.fillGradientStyle(0xffffff, 0xffffff, 0xffffff, 0xffffff, 0.06, 0, 0, 0);
            gb.fillTriangle(ox, oy, (lx + tx) / 2, (ly + ty) / 2, (rx + tx) / 2, (ry + ty) / 2);
          }
          break;
        }
        case 'traffic': {
          // lanes of flying traffic threading between the towers: headlights one way, tail lights the other
          const s = zoom * 0.5 * 0.55;
          const base = this.far.y + 192 * s;
          for (let lane = 0; lane < 4; lane++) {
            const y = base - (30 + lane * 16) * s;
            const dir = lane % 2 ? -1 : 1;
            const sp = (40 + lane * 14) * ps;
            const span = W + 80;
            for (let k = 0; k < 9; k++) {
              const x0 = hash(lane * 40 + k) * span + dir * time * sp - cx * (0.16 + lane * 0.02) * zoom;
              const x = ((x0 % span) + span) % span - 40;
              const col = dir > 0 ? 0xfff2c8 : 0xff4a5a;
              this.gFar.fillStyle(col, 0.85).fillRect(Math.round(x), Math.round(y), ps * 2, ps);
              this.gFar.fillStyle(col, 0.25).fillRect(Math.round(x - dir * ps * 6), Math.round(y), ps * 6, ps);
            }
          }
          break;
        }
        case 'datastream': {
          // packets of light climbing the pylons' field of view: short vertical dashes rising and fading
          const s = zoom * 0.5 * 0.55;
          const base = this.far.y + 192 * s;
          for (let i = 0; i < 40; i++) {
            const sp = 0.25 + hash(i * 3 + 400) * 0.35;
            const ph = (time * sp + hash(i * 3 + 401)) % 1;
            const span = W + 40;
            const x = (((hash(i * 3 + 402) * span - cx * 0.14 * zoom) % span) + span) % span - 20;
            const y = base - ph * 150 * s;
            const a = Math.sin(ph * Math.PI) * 0.7;
            this.gFar.fillStyle(0x7ff0ff, a * 0.35).fillRect(Math.round(x), Math.round(y), ps, ps * 8);
            this.gFar.fillStyle(0xe0ffff, a).fillRect(Math.round(x), Math.round(y), ps, ps * 2);
          }
          break;
        }
        case 'wisps': {
          // soft cloud wisps drifting through the middle distance (racing past when the scenery streams)
          const speed = (6 + this.scroll * 5) * ps;
          for (let i = 0; i < 7; i++) {
            const span = W + 600;
            const x0 = hash(i * 5 + 600) * span - time * speed * (0.7 + hash(i * 5 + 601) * 0.6) - cx * (0.3 + hash(i * 5 + 602) * 0.15) * zoom;
            const x = ((x0 % span) + span) % span - 300;
            const y = H * (0.42 + hash(i * 5 + 603) * 0.38) - cy * 0.2 * zoom;
            const w = H * (0.35 + hash(i * 5 + 604) * 0.4);
            const h = w * 0.09;
            gm.fillStyle(0xfff0e8, 0.07).fillEllipse(x, y, w, h);
            gm.fillStyle(0xfff6f0, 0.08).fillEllipse(x + w * 0.12, y - h * 0.25, w * 0.6, h * 0.8);
            gm.fillStyle(0xffffff, 0.06).fillEllipse(x - w * 0.15, y + h * 0.1, w * 0.45, h * 0.6);
          }
          break;
        }
        case 'petals': {
          // blossom petals carried on the breeze, tumbling as they drift
          for (let i = 0; i < 34; i++) {
            const depth = hash(i * 7 + 800) > 0.6 ? 1 : 0.6;
            const sp = (0.05 + hash(i * 7 + 801) * 0.05) * (depth + 0.3);
            const ph = (time * sp + hash(i * 7 + 802)) % 1;
            const span = W + 80;
            const x = (((hash(i * 7 + 803) * span - ph * W * 0.5 + Math.sin(time * 1.3 + i) * 12 * ps - cx * 0.35 * zoom * depth) % span) + span) % span - 40;
            const y = ph * (H + 40) - 20 + Math.sin(time * 2 + i * 1.7) * 6 * ps;
            const flip = Math.sin(time * (3 + hash(i * 7 + 804) * 3) + i);
            const s = Math.max(1, Math.round(ps * (depth > 0.9 ? 1.5 : 1)));
            const col = i % 3 === 0 ? 0xfff4f8 : 0xffb8d0;
            const a = depth > 0.9 ? 0.85 : 0.5;
            if (Math.abs(flip) > 0.4) gf.fillStyle(col, a * 0.7).fillRect(Math.round(x), Math.round(y), s * 2, s);
            else gf.fillStyle(col, a * 0.7).fillRect(Math.round(x), Math.round(y), s, s * 2);
            gf.fillStyle(0xffffff, a * 0.5).fillRect(Math.round(x), Math.round(y), s, s);
          }
          break;
        }
        case 'wind': {
          // speed lines: thin streaks of air rushing past the moving ship
          for (let i = 0; i < 26; i++) {
            const sp = 1.2 + hash(i * 3 + 950) * 1.4;
            const ph = (time * sp * 0.35 + hash(i * 3 + 951)) % 1;
            const len = (40 + hash(i * 3 + 952) * 90) * ps;
            const x = W + len - ph * (W + len * 2);
            const y = H * (0.08 + hash(i * 3 + 953) * 0.84) - cy * 0.3 * zoom;
            const a = Math.sin(ph * Math.PI) * 0.16;
            gf.fillGradientStyle(0xffffff, 0xffffff, 0xffffff, 0xffffff, a, 0, a, 0);
            gf.fillRect(Math.round(x), Math.round(y), len, Math.max(1, Math.round(ps * 0.6)));
          }
          break;
        }
        case 'flare': {
          // the low sun's lens flare: a string of tinted ghosts mirrored through the middle of the view
          const sx = W * 0.7 - cx * 0.015 * zoom;
          const sy = H * 0.36 - cy * 0.01 * zoom;
          const dx = W / 2 - sx;
          const dy = H / 2 - sy;
          const ghosts: [number, number, number, number][] = [
            [0.45, 0.018, 0xffd0a0, 0.08],
            [0.8, 0.035, 0xff9ab0, 0.05],
            [1.15, 0.012, 0xffffff, 0.1],
            [1.5, 0.06, 0xb8a0ff, 0.035],
            [1.85, 0.025, 0xffe0a0, 0.06],
          ];
          for (const [t, r, col, a] of ghosts) {
            const x = sx + dx * t;
            const y = sy + dy * t;
            gf.fillStyle(col, a).fillCircle(x, y, H * r);
            gf.fillStyle(col, a * 0.6).fillCircle(x, y, H * r * 0.6);
          }
          // a horizontal streak through the sun
          gf.fillGradientStyle(0xffe8c8, 0xffe8c8, 0xffe8c8, 0xffe8c8, 0, 0.14, 0, 0.14);
          gf.fillRect(sx - W * 0.3, sy - ps, W * 0.3, ps * 2);
          gf.fillGradientStyle(0xffe8c8, 0xffe8c8, 0xffe8c8, 0xffe8c8, 0.14, 0, 0.14, 0);
          gf.fillRect(sx, sy - ps, W * 0.3, ps * 2);
          break;
        }
        case 'shafts': {
          // pale light falling through cracks in the cave roof, breathing slowly, dust turning in it
          const top = -H * 0.02 - cy * 0.05 * zoom;
          for (let i = 0; i < 4; i++) {
            const ox = W * (0.1 + i * 0.27 + hash(i + 70) * 0.06) - cx * 0.08 * zoom;
            const lean = W * (0.05 + hash(i + 80) * 0.05);
            const len = H * (0.8 + hash(i + 90) * 0.25);
            const w0 = W * (0.008 + 0.008 * hash(i + 95));
            const w1 = w0 * 5;
            const breathe = 0.65 + 0.35 * Math.sin(time * 0.35 + i * 1.9);
            const col = i % 2 ? 0xb890ff : 0x8ae0ff;
            const a0 = 0.13 * breathe;
            const ax = ox - w0;
            const bx = ox + w0;
            const cxL = ox + lean - w1;
            const dxR = ox + lean + w1;
            const by = top + len;
            gb.fillGradientStyle(col, col, col, col, a0, a0, 0, 0);
            gb.fillTriangle(ax, top, bx, top, cxL, by);
            gb.fillGradientStyle(col, col, col, col, a0, 0, 0, 0);
            gb.fillTriangle(bx, top, cxL, by, dxR, by);
            // a brighter core
            gb.fillGradientStyle(0xffffff, 0xffffff, 0xffffff, 0xffffff, a0 * 0.4, a0 * 0.4, 0, 0);
            gb.fillTriangle(ox - w0 * 0.4, top, ox + w0 * 0.4, top, ox + lean * 0.6, top + len * 0.6);
            for (let k = 0; k < 9; k++) {
              const u = (time * (0.012 + hash(i * 20 + k) * 0.02) + hash(i * 20 + k + 5)) % 1;
              const side = hash(i * 20 + k + 9) - 0.5 + Math.sin(time * 0.6 + k) * 0.1;
              const x = ox + lean * u + side * 2 * (w0 + (w1 - w0) * u);
              const y = top + len * u;
              gb.fillStyle(0xf0e4ff, 0.5 * breathe * Math.sin(u * Math.PI));
              gb.fillRect(Math.round(x), Math.round(y), ps, ps);
            }
          }
          break;
        }
        case 'smoke': {
          // steam from the far cooling towers and smoke from the stacks, lit from below by the furnace glow
          const s = zoom * 0.5 * 0.55;
          const tile = 512 * s;
          const tp = this.far.tilePositionX;
          const top = this.far.y;
          INDUSTRY_VENTS.forEach((v, vi) => {
            const first = ((((v.x - tp) * s) % tile) + tile) % tile;
            for (let lx = first - tile; lx < W + 20 * s; lx += tile) {
              if (lx < -120 * s) continue;
              for (let k = 0; k < 8; k++) {
                const ph = (time * (v.steam ? 0.07 : 0.1) + k / 8 + hash(vi * 17 + 3)) % 1;
                const rise = ph * (v.steam ? 64 : 84);
                const drift = ph * ph * 56 + Math.sin(time * 0.7 + k * 1.3 + vi) * 2;
                const r = (v.w * (v.steam ? 0.3 : 0.4) + ph * (v.steam ? 15 : 10)) * s;
                const a = Math.min(1, ph * 7) * (1 - ph) * (v.steam ? 0.34 : 0.42);
                const col = v.steam ? (ph < 0.3 ? 0xc07a5a : 0x7a4a40) : ph < 0.25 ? 0x4a2216 : 0x24120e;
                this.gFar.fillStyle(col, a).fillCircle(lx + drift * s, top + (v.y - rise) * s, r);
              }
            }
          });
          break;
        }
        case 'fireflies': {
          // fireflies over the jungle below, winking on and off as they wander
          const base = this.groundOn ? this.groundTop : H * 0.6;
          const s = this.groundOn ? this.groundS : zoom * 0.425;
          for (let i = 0; i < 34; i++) {
            const blink = Math.max(0, Math.sin(time * (0.9 + hash(i * 3 + 300)) + hash(i * 3 + 301) * 6.28));
            if (blink < 0.05) continue;
            const wx = hash(i * 3 + 302) * (W + 200) + Math.sin(time * 0.3 + i) * 24 * ps - cx * 0.3 * zoom;
            const x = ((wx % (W + 200)) + W + 200) % (W + 200) - 100;
            const y = base + (-30 + hash(i * 3 + 303) * 220) * s + Math.sin(time * 0.5 + i * 2) * 8 * ps;
            const a = blink * blink;
            gf.fillStyle(0xc8ff60, 0.18 * a).fillRect(Math.round(x - ps), Math.round(y - ps), ps * 4, ps * 4);
            gf.fillStyle(0xf0ffa0, 0.85 * a).fillRect(Math.round(x), Math.round(y), ps * 2, ps * 2);
          }
          break;
        }
        case 'drips': {
          // water dripping from the roof, catching the crystal light as it falls
          for (let i = 0; i < 14; i++) {
            const sp = 0.35 + hash(i * 3 + 1) * 0.35;
            const ph = (time * sp + hash(i * 3 + 2)) % 1;
            const x = ((hash(i * 3) * W - cx * 0.15 * zoom) % W + W) % W;
            const y = H * (0.1 + ph * 0.95);
            gf.fillStyle(0xd8c8ff, 0.5 * (1 - ph));
            gf.fillRect(Math.round(x), Math.round(y), ps, ps * 3);
          }
          break;
        }
        case 'moon': {
          // a full moon with soft halo rings and a few maria
          const mx = W * 0.24 - cx * 0.015 * zoom;
          const my = H * 0.2 - cy * 0.01 * zoom;
          const r = H * 0.06;
          for (let k = 5; k >= 1; k--) {
            gb.fillStyle(0x9ad0ff, 0.035);
            gb.fillCircle(mx, my, r * (1 + k * 0.55));
          }
          gb.fillStyle(0xe6f2ff, 0.95).fillCircle(mx, my, r);
          gb.fillStyle(0x8aa0c0, 0.35).fillCircle(mx - r * 0.3, my - r * 0.15, r * 0.28).fillCircle(mx + r * 0.25, my + r * 0.3, r * 0.2).fillCircle(mx + r * 0.35, my - r * 0.35, r * 0.12);
          break;
        }
        case 'beacon': {
          // the lighthouse lamp in the far layer sweeps its beam round; brightest when it swings toward us
          const s = zoom * 0.5 * 0.55;
          const top = (20 - cy * 0.12) * zoom + H / 2 - 192 * s;
          const tile = 1024 * s; // bg-cove-far is twice the usual width so the lighthouse appears once
          const first = ((((COVE_LAMP.x - (cx * 0.12 * zoom) / s) * s) % tile) + tile) % tile;
          const a = time * 0.9;
          const reach = W * 0.9;
          const sweep = Math.sin(a);
          const toward = Math.max(0, Math.cos(a));
          for (let lx = first - tile; lx < W + tile; lx += tile) {
            if (lx < -reach || lx > W + reach) continue;
            const ly = top + COVE_LAMP.y * s;
            const ex = lx + sweep * reach;
            const spread = H * (0.04 + 0.05 * toward);
            gb.fillStyle(0xfff4c8, 0.07 + 0.05 * (1 - Math.abs(sweep)));
            gb.fillTriangle(lx, ly, ex, ly - spread, ex, ly + spread * 0.6);
            gb.fillStyle(0xffffff, 0.05);
            gb.fillTriangle(lx, ly, ex, ly - spread * 0.35, ex, ly + spread * 0.2);
            gb.fillStyle(0xfff4c8, 0.12 + 0.35 * toward ** 6).fillCircle(lx, ly, (3 + 10 * toward ** 6) * ps);
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
          const [lo, hi] = this.glowCol;
          const ga = this.glowAlpha * pulse;
          gb.fillGradientStyle(lo, lo, hi, hi, 0, 0, ga, ga);
          gb.fillRect(0, top, W, H - top);
          // molten sun/core low on the horizon, drifting with the camera
          const gx = W * 0.5 - cx * 0.03 * zoom;
          for (let r = 4; r >= 1; r--) {
            gb.fillStyle(hi, (0.05 * pulse * this.glowAlpha) / 0.34);
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
          // a glowing horizon line, and a bright scan pulse sweeping out of it toward us every few seconds
          gb.fillGradientStyle(0x4ad8ff, 0x4ad8ff, 0x4ad8ff, 0x4ad8ff, 0, 0, 0.22, 0.22);
          gb.fillRect(0, hy - H * 0.05, W, H * 0.05);
          gb.fillStyle(0xbffcff, 0.45).fillRect(0, hy - Math.max(1, ps * 0.5), W, Math.max(1, ps));
          const sp = (time % 3.2) / 1.6;
          if (sp < 1) {
            const y = hy + (H - hy) * sp * sp;
            const a = 0.5 * (1 - sp);
            gb.fillGradientStyle(0x6ae8ff, 0x6ae8ff, 0x6ae8ff, 0x6ae8ff, 0, 0, a, a);
            gb.fillRect(0, y - 10 * ps * (0.3 + sp), W, 10 * ps * (0.3 + sp));
            gb.fillStyle(0xe0ffff, a).fillRect(0, y, W, Math.max(1, ps));
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
    if (this.overcastOn) {
      // the cloud ceiling lights up from inside when lightning flashes
      const f = this.flashNow;
      const c = (a: number): number => Math.round(a + (255 - a) * f);
      this.overcast.setTint((c(0x9a) << 16) | (c(0xa8) << 8) | c(0xc0));
    }
    this.drawGlint(cx, zoom, time);
  }

  /** Light on the water or lava of the far ground layer: a moon's broken reflection, or glints winking in and out. */
  private drawGlint(cx: number, zoom: number, time: number): void {
    const gl = this.glint;
    if (!gl || !this.groundOn) return;
    const g = this.gGlint;
    const s = this.groundS;
    const W = this.w;
    const H = this.h;
    const y0 = this.groundTop + gl.y0 * s;
    const y1 = Math.min(H, this.groundTop + gl.y1 * s);
    if (y1 <= y0) return;
    const A = gl.alpha ?? 1;
    if (gl.path) {
      // under the moon: rows of short dashes that widen toward the viewer and shiver a few times a second
      const mx = W * 0.24 - cx * 0.015 * zoom;
      const step = Math.max(2, Math.round(s * 2));
      const slot = Math.floor(time * 5);
      for (let y = Math.round(y0); y < y1; y += step) {
        const u = (y - y0) / Math.max(1, this.groundTop + gl.y1 * s - y0);
        const row = Math.floor((y - this.groundTop) / step);
        const half = H * (0.014 + 0.05 * u);
        for (let k = 0; k < 3; k++) {
          const h = hash(row * 7 + k * 31 + slot * 101);
          const len = half * (0.25 + 0.6 * hash(row * 13 + k + slot * 57));
          const x = mx + (h - 0.5) * 2 * half * (k === 0 ? 0.5 : 1);
          g.fillStyle(gl.cols[k % gl.cols.length], A * (0.4 - 0.25 * u) * (k === 0 ? 1 : 0.55));
          g.fillRect(Math.round(x - len / 2), y, Math.max(1, Math.round(len)), Math.max(1, Math.round(step * 0.5)));
        }
      }
      return;
    }
    // glints fixed to the far ground layer, so they ride along with it as it scrolls
    const tile = 512 * s;
    const tp = this.grounds[0].tilePositionX;
    const sz = Math.max(1, Math.round(s));
    for (let i = 0; i < 80; i++) {
      const a = Math.sin(time * (0.7 + hash(i * 3 + 502) * 1.4) + hash(i * 3 + 503) * 6.28);
      if (a <= 0.25) continue;
      const ax = hash(i * 3 + 500) * 512;
      const ay = gl.y0 + hash(i * 3 + 501) * (gl.y1 - gl.y0);
      const y = Math.round(this.groundTop + ay * s);
      if (y > H) continue;
      const col = gl.cols[i % gl.cols.length];
      const w = sz * (hash(i + 900) > 0.6 ? 3 : 2);
      for (let x = ((((ax - tp) * s) % tile) + tile) % tile; x < W; x += tile) {
        g.fillStyle(col, A * (a - 0.25) * 0.8).fillRect(Math.round(x), y, w, sz);
      }
    }
  }
}
