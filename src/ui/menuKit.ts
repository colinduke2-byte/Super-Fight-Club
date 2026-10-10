import Phaser from 'phaser';
import { PIXEL_FONT, up } from '../art/pixelFont';
import { music } from '../audio/music';
import { sfx } from '../audio/sfx';
import { inputManager } from '../input/inputManager';
import { menuInput, type MenuEvent } from '../input/menuInput';
import { BackgroundView } from './BackgroundView';

/** Device pixels per UI art pixel (integer >= 2); scales text and panels with the window. */
export function hudUnit(h: number): number {
  return Math.max(2, Math.round(h / 360));
}

export const COLORS = {
  title: 0xffd46a,
  text: 0xe8e4ff,
  dim: 0x8f8ab8,
  hot: 0xffe14a,
  good: 0x7affa0,
  bad: 0xff6a5a,
  warn: 0xffb02e,
  accent: 0x7fe8ff,
  p: [0x4aa3ff, 0xff6a5a, 0x5fe08a, 0xffd04a],
};

export function text(scene: Phaser.Scene, layer: Phaser.GameObjects.Layer, str: string, tint = COLORS.text): Phaser.GameObjects.BitmapText {
  const t = scene.add.bitmapText(0, 0, PIXEL_FONT, up(str)).setTint(tint);
  layer.add(t);
  return t;
}

export interface MenuItem {
  label: string | (() => string);
  value?: () => string;
  onConfirm?: () => void;
  onLeft?: () => void;
  onRight?: () => void;
  enabled?: () => boolean;
}

/** A vertical list of rows with a highlighted cursor; label on the left, value on the right. */
export class MenuList {
  index = 0;
  private readonly labels: Phaser.GameObjects.BitmapText[] = [];
  private readonly values: Phaser.GameObjects.BitmapText[] = [];
  private cx = 0;
  private top = 0;
  private u = 3;
  private width = 160;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly layer: Phaser.GameObjects.Layer,
    public items: MenuItem[],
  ) {
    this.rebuild();
  }

  rebuild(): void {
    for (const t of [...this.labels, ...this.values]) t.destroy();
    this.labels.length = 0;
    this.values.length = 0;
    for (let i = 0; i < this.items.length; i++) {
      this.labels.push(text(this.scene, this.layer, ''));
      this.values.push(text(this.scene, this.layer, ''));
    }
    this.index = Math.min(this.index, Math.max(0, this.items.length - 1));
    this.layout(this.cx, this.top, this.u, this.width);
  }

  /** `width` in art pixels: the row is centred on cx. */
  layout(cx: number, top: number, u: number, width = this.width): void {
    this.cx = cx;
    this.top = top;
    this.u = u;
    this.width = width;
    this.items.forEach((_, i) => {
      const y = top + i * 18 * u;
      this.labels[i].setScale(u * 1.5).setPosition(cx - (width / 2) * u, y);
      this.values[i].setScale(u * 1.5).setOrigin(1, 0).setPosition(cx + (width / 2) * u, y);
    });
  }

  private enabled(i: number): boolean {
    return this.items[i].enabled ? this.items[i].enabled!() : true;
  }

  move(dir: 1 | -1): void {
    const n = this.items.length;
    for (let k = 0; k < n; k++) {
      this.index = (this.index + dir + n) % n;
      if (this.enabled(this.index)) return;
    }
  }

  /** Returns true if the event was consumed. */
  handle(e: MenuEvent): boolean {
    const item = this.items[this.index];
    switch (e.action) {
      case 'up':
        this.move(-1);
        return true;
      case 'down':
        this.move(1);
        return true;
      case 'left':
        item.onLeft?.();
        return !!item.onLeft;
      case 'right':
        item.onRight?.();
        return !!item.onRight;
      case 'confirm':
        if (this.enabled(this.index)) item.onConfirm?.();
        return !!item.onConfirm;
      default:
        return false;
    }
  }

  setVisible(v: boolean): void {
    for (const t of [...this.labels, ...this.values]) t.setVisible(v);
  }

  update(time: number): void {
    this.items.forEach((it, i) => {
      const sel = i === this.index;
      const on = this.enabled(i);
      const label = typeof it.label === 'function' ? it.label() : it.label;
      const pulse = sel && ((time * 4) | 0) % 2 === 0;
      this.labels[i].setText(up(`${sel ? '> ' : '  '}${label}`));
      this.labels[i].setTint(!on ? 0x5a5680 : sel ? (pulse ? COLORS.hot : COLORS.title) : COLORS.text);
      const v = it.value ? up(`${sel && it.onLeft ? '< ' : ''}${it.value()}${sel && it.onRight ? ' >' : ''}`) : '';
      this.values[i].setText(v).setTint(!on ? 0x5a5680 : sel ? COLORS.hot : COLORS.accent);
    });
  }

  destroy(): void {
    for (const t of [...this.labels, ...this.values]) t.destroy();
  }
}

/**
 * Base class for menu scenes: a parallax backdrop (own zoom-1 camera), a UI layer, integer UI scaling and
 * unified menu input. Subclasses implement `build`, `onEvent` and (optionally) `layoutUi` / `tick`.
 */
export abstract class MenuScene extends Phaser.Scene {
  protected u = 3;
  protected bgLayer!: Phaser.GameObjects.Layer;
  protected ui!: Phaser.GameObjects.Layer;
  protected bg!: BackgroundView;
  protected time0 = 0;
  private uiCam!: Phaser.Cameras.Scene2D.Camera;

  protected abstract build(): void;
  protected abstract onEvent(e: MenuEvent): void;
  protected layoutUi(_w: number, _h: number, _u: number): void {}
  protected tick(_time: number, _dt: number): void {}

  create(): void {
    inputManager.init();
    sfx.arm();
    music.play('menu');
    this.bgLayer = this.add.layer();
    this.ui = this.add.layer();
    const w = this.scale.width;
    const h = this.scale.height;
    const main = this.cameras.main;
    main.setBackgroundColor('#07060f');
    this.uiCam = this.cameras.add(0, 0, w, h);
    main.ignore(this.ui);
    this.uiCam.ignore(this.bgLayer);
    this.bg = new BackgroundView(this, this.bgLayer);
    this.build();
    this.scale.on('resize', this.onResize, this);
    this.events.once('shutdown', () => this.scale.off('resize', this.onResize, this));
    this.relayout(w, h);
    menuInput.reset();
    this.time0 = performance.now();
  }

  override update(_t: number, _d: number): void {
    const time = (performance.now() - this.time0) / 1000;
    this.bg.update(time * 6, Math.sin(time * 0.2) * 10, 3, time);
    for (const e of menuInput.poll()) {
      // tiny UI blips; scenes that consume the event (rebinding etc.) still get it
      if (e.action === 'confirm') sfx.play('menuOk', 0.7, 0);
      else if (e.action === 'back') sfx.play('menuBack', 0.7, 0);
      else if (e.action === 'up' || e.action === 'down' || e.action === 'left' || e.action === 'right') sfx.play('menuMove', 0.6, 0);
      this.onEvent(e);
    }
    this.tick(time, 1 / 60);
  }

  private onResize(size: Phaser.Structs.Size): void {
    this.cameras.main.setSize(size.width, size.height);
    this.uiCam.setSize(size.width, size.height);
    this.relayout(size.width, size.height);
  }

  private relayout(w: number, h: number): void {
    this.u = hudUnit(h);
    this.bg.resize(w, h);
    this.layoutUi(w, h, this.u);
  }

  /** Go to another scene (stops this one). */
  protected go(key: string, data?: object): void {
    this.scene.start(key, data);
  }
}
