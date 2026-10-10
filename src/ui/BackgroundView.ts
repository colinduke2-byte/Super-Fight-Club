import Phaser from 'phaser';

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
}

export const BACKDROPS: Record<string, Backdrop> = {
  skyline: { sky: SKY, planet: true, nebula: 0xffffff, far: 0xffffff, near: 0xffffff, tiles: 0xffffff },
  void: {
    sky: ['#030a14', '#061424', '#0a2236', '#103350', '#1a4d6e', '#2a6e8a', '#4a9aa8'],
    planet: false,
    nebula: 0x70e0ff,
    far: 0x4a9ac0,
    near: 0x2a6a90,
    tiles: 0xb8e8ff,
  },
  reactor: {
    sky: ['#120404', '#240808', '#3a0e0a', '#5a1a0c', '#8a2c0c', '#c0501a', '#f08a30'],
    planet: false,
    nebula: 0xff7a40,
    far: 0xb05030,
    near: 0x70281a,
    tiles: 0xffc8a8,
  },
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
    layer.add([this.nebula, this.starsA, this.starsB, this.planet, this.far, this.near]);
  }

  setTheme(id: string | undefined): void {
    const b = BACKDROPS[id ?? 'skyline'] ?? BACKDROPS.skyline;
    this.sky = b.sky;
    this.planet.setVisible(b.planet);
    this.nebula.setTint(b.nebula);
    this.far.setTint(b.far);
    this.near.setTint(b.near);
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
  }
}
