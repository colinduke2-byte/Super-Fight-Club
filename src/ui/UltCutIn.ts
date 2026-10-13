import Phaser from 'phaser';
import { PIXEL_FONT } from '../art/pixelFont';
import { animFrameIndex, fighterTextureKey, uiTexK } from '../art/proceduralFighter';
import type { CharacterData } from '../engine/types';
import { settings } from '../settings';

const LIFE = 0.8;

/**
 * Ultimate cut-in: a slanted band in the fighter's colour sweeps across the screen with speed lines, the fighter's portrait sliding
 * through it and the ultimate's name. Screen space, short, and drawn over the action without pausing it.
 */
export class UltCutIn {
  private readonly g: Phaser.GameObjects.Graphics;
  private readonly lines: Phaser.GameObjects.Graphics;
  private readonly sprite: Phaser.GameObjects.Image;
  private readonly name: Phaser.GameObjects.BitmapText;
  private t = LIFE;
  private color = 0xffffff;
  private k = 1;
  private dir = 1;
  /** The band's four corners, reused for every band drawn. */
  private readonly quad = [new Phaser.Math.Vector2(), new Phaser.Math.Vector2(), new Phaser.Math.Vector2(), new Phaser.Math.Vector2()];

  constructor(scene: Phaser.Scene, layer: Phaser.GameObjects.Layer) {
    this.g = scene.add.graphics();
    this.lines = scene.add.graphics().setBlendMode(Phaser.BlendModes.ADD);
    this.sprite = scene.add.image(0, 0, '__WHITE').setOrigin(0.5, 1).setVisible(false);
    this.name = scene.add.bitmapText(0, 0, PIXEL_FONT, '').setOrigin(0.5).setVisible(false);
    layer.add([this.g, this.lines, this.sprite, this.name]);
  }

  /** `side`: which way the fighter faces (the band sweeps that way). */
  play(data: CharacterData, moveName: string, side: number, skin = data.id): void {
    this.t = 0;
    this.dir = side >= 0 ? 1 : -1;
    this.color = parseInt(data.sprite.placeholder.accent.slice(1), 16);
    this.k = uiTexK(data);
    this.sprite.setTexture(fighterTextureKey(skin), animFrameIndex(data, 'idle', 0)).setFlipX(this.dir < 0).setTint(0xffffff);
    this.name.setText(moveName.toUpperCase());
  }

  update(dt: number, w: number, h: number, u: number): void {
    this.t += dt;
    const g = this.g;
    const l = this.lines;
    g.clear();
    l.clear();
    const on = this.t < LIFE;
    this.sprite.setVisible(on);
    this.name.setVisible(on);
    if (!on) return;
    const p = this.t / LIFE;
    const open = Math.min(1, p / 0.15); // band snaps open
    const fade = p > 0.8 ? 1 - (p - 0.8) / 0.2 : 1;
    const soft = settings.reduceFlashes ? 0.6 : 1;
    const cy = h * 0.42;
    const bh = h * 0.24 * open;
    const slant = h * 0.08;
    // band: dark backing, coloured body, bright edges
    const q = this.quad;
    const band = (half: number, col: number, a: number): void => {
      g.fillStyle(col, a * fade);
      q[0].set(0, cy - half + slant);
      q[1].set(w, cy - half - slant);
      q[2].set(w, cy + half - slant);
      q[3].set(0, cy + half + slant);
      g.fillPoints(q, true);
    };
    band(bh / 2 + 4 * u, 0x0a0816, 0.85);
    band(bh / 2, this.color, 0.55 * soft);
    band(bh / 2 - 3 * u, 0x0a0816, 0.55);
    // speed lines streaming against the sweep
    for (let i = 0; i < 14; i++) {
      const yy = cy + ((i * 37) % 100) / 100 * bh - bh / 2;
      const len = w * (0.15 + ((i * 53) % 40) / 100);
      const x = (((i * 0.137 + this.t * 2.6 * this.dir) % 1) + 1) % 1 * (w + len) - len;
      l.lineStyle(Math.max(1, u), i % 3 === 0 ? this.color : 0xffffff, 0.5 * fade * soft);
      l.lineBetween(x, yy - (yy - cy) * 0 - slant * ((x / w) * 2 - 1), x + len, yy - slant * (((x + len) / w) * 2 - 1));
    }
    // the fighter slides through, the name slams in
    const slide = this.dir > 0 ? Phaser.Math.Linear(w * 0.18, w * 0.3, p) : Phaser.Math.Linear(w * 0.82, w * 0.7, p);
    const sc = (bh * 1.5) / 64;
    this.sprite.setScale(sc * this.k).setPosition(slide, cy + bh * 0.62).setAlpha(fade);
    const slam = 1 + Math.max(0, 1 - p / 0.12) * 0.8;
    this.name.setScale(1);
    const fit = Math.min(u * 3.2, (w * 0.5) / Math.max(1, this.name.getTextBounds().local.width));
    this.name.setScale(fit * slam).setPosition(this.dir > 0 ? w * 0.62 : w * 0.38, cy).setTint(0xffffff).setAlpha(fade);
  }
}
