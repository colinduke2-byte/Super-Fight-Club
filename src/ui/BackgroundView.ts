import Phaser from 'phaser';

/**
 * Screen-space parallax background (rendered by its own zoom-1 camera). Layers are positioned from
 * the world camera's centre + zoom each frame so they feel like distant geometry.
 */
export class BackgroundView {
  private readonly grad: Phaser.GameObjects.Image;
  private readonly stars: Phaser.GameObjects.TileSprite;
  private readonly stars2: Phaser.GameObjects.TileSprite;
  private readonly ruins: Phaser.GameObjects.TileSprite;
  private w = 1;
  private h = 1;

  constructor(scene: Phaser.Scene, layer: Phaser.GameObjects.Layer) {
    this.grad = scene.add.image(0, 0, 'bg-grad').setOrigin(0, 0);
    this.stars = scene.add.tileSprite(0, 0, 1, 1, 'bg-stars').setOrigin(0, 0);
    this.stars2 = scene.add.tileSprite(0, 0, 1, 1, 'bg-stars').setOrigin(0, 0).setAlpha(0.6);
    this.ruins = scene.add.tileSprite(0, 0, 1, 96, 'bg-ruins').setOrigin(0, 0);
    layer.add([this.grad, this.stars, this.stars2, this.ruins]);
  }

  resize(w: number, h: number): void {
    this.w = w;
    this.h = h;
    this.grad.setDisplaySize(w, h);
    this.stars.setSize(w, h);
    this.stars2.setSize(w, h);
  }

  /** @param zoom device px per world unit */
  update(cx: number, cy: number, zoom: number, pixelScale: number): void {
    const ps = Math.max(1, Math.round(pixelScale));
    this.stars.setTileScale(ps, ps);
    this.stars.tilePositionX = (cx * 0.04 * zoom) / ps;
    this.stars.tilePositionY = (cy * 0.04 * zoom) / ps;
    this.stars2.setTileScale(ps * 2, ps * 2);
    this.stars2.tilePositionX = (cx * 0.09 * zoom) / (ps * 2);
    this.stars2.tilePositionY = (cy * 0.09 * zoom) / (ps * 2);

    const f = 0.22;
    const s = zoom * 1.3;
    this.ruins.setTileScale(s, s);
    const heightPx = 96 * s;
    // world y of the ruin skyline base, shifted by parallax
    const baseScreenY = (48 - cy * f) * zoom + this.h / 2;
    this.ruins.setPosition(0, baseScreenY - heightPx);
    this.ruins.setSize(this.w, heightPx);
    this.ruins.tilePositionX = (cx * f * zoom) / s;
  }
}
