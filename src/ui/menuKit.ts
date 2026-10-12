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
  /** One-line explanation, for scenes that show the selected row's hint. */
  hint?: string;
}

/** A vertical list of rows with a highlighted cursor; label on the left, value on the right. */
/** Unscaled pixel width of a bitmap text (independent of its current scale). */
export function textPx(t: Phaser.GameObjects.BitmapText): number {
  return t.getTextBounds().local.width;
}

export class MenuList {
  index = 0;
  private readonly labels: Phaser.GameObjects.BitmapText[] = [];
  private readonly values: Phaser.GameObjects.BitmapText[] = [];
  private cx = 0;
  private top = 0;
  private u = 3;
  private width = 160;
  private rowH = 18;
  private fontK = 1.5;
  private visible = true;
  /** Backing plate and cursor bar, drawn under the rows. */
  private readonly panel: Phaser.GameObjects.Graphics;
  /** Draw the backing plate (on by default; scenes with their own frame turn it off). */
  plate = true;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly layer: Phaser.GameObjects.Layer,
    public items: MenuItem[],
  ) {
    this.panel = scene.add.graphics();
    layer.add(this.panel);
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
  layout(cx: number, top: number, u: number, width = this.width, bottom?: number): void {
    this.cx = cx;
    this.top = top;
    this.u = u;
    this.width = width;
    // long menus shrink their rows (and text) to fit above `bottom`
    const n = Math.max(1, this.items.length);
    this.rowH = bottom === undefined ? 18 : Math.min(18, (bottom - top) / (n * u));
    this.fontK = Math.min(1.5, (this.rowH * 0.78) / 7);
    this.items.forEach((_, i) => {
      const y = top + i * this.rowH * u;
      this.labels[i].setScale(u * this.fontK).setPosition(cx - (width / 2) * u, y);
      this.values[i].setScale(u * this.fontK).setOrigin(1, 0).setPosition(cx + (width / 2) * u, y);
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
    this.visible = v;
    this.panel.setVisible(v);
    for (const t of [...this.labels, ...this.values]) t.setVisible(v);
  }

  /** The selected row's hint ('' if it has none). */
  get hint(): string {
    return this.items[this.index]?.hint ?? '';
  }

  /** Translucent plate behind the rows plus a bar under the cursor, so the menu reads over any backdrop. */
  private drawPanel(k: number, time: number): void {
    const g = this.panel;
    g.clear();
    if (!this.plate || !this.visible || !this.items.length) return;
    const u = this.u;
    const rh = this.rowH * u;
    const textH = 7 * k * u;
    const pad = 6 * u;
    const x = this.cx - (this.width / 2) * u - pad;
    const w = this.width * u + pad * 2;
    const y = this.top - (rh - textH) / 2 - u * 2;
    const h = this.items.length * rh + u * 3;
    g.fillStyle(0x07061a, 0.62).fillRect(x, y, w, h);
    g.lineStyle(u, 0x3c3478, 0.9).strokeRect(x - u / 2, y - u / 2, w + u, h + u);
    // corner ticks
    g.fillStyle(COLORS.title, 0.85);
    for (const [cx, cy] of [[x - u, y - u], [x + w - u * 2, y - u], [x - u, y + h - u * 2], [x + w - u * 2, y + h - u * 2]]) g.fillRect(cx, cy, u * 3, u * 3);
    // cursor bar
    const sy = this.top + this.index * rh - (rh - textH) / 2;
    const a = 0.16 + 0.06 * Math.sin(time * 6);
    g.fillStyle(COLORS.hot, a).fillRect(x + u, sy, w - u * 2, rh);
    g.fillStyle(COLORS.hot, 0.9).fillRect(x + u, sy, u * 2, rh);
  }

  update(time: number): void {
    let worst = 1;
    this.items.forEach((it, i) => {
      const sel = i === this.index;
      const on = this.enabled(i);
      const label = typeof it.label === 'function' ? it.label() : it.label;
      const pulse = sel && ((time * 4) | 0) % 2 === 0;
      this.labels[i].setText(up(`${sel ? '> ' : '  '}${label}`));
      this.labels[i].setTint(!on ? 0x5a5680 : sel ? (pulse ? COLORS.hot : COLORS.title) : COLORS.text);
      const v = it.value ? up(`${sel && it.onLeft ? '< ' : ''}${it.value()}${sel && it.onRight ? ' >' : ''}`) : '';
      this.values[i].setText(v).setTint(!on ? 0x5a5680 : sel ? COLORS.hot : COLORS.accent);
      worst = Math.max(worst, textPx(this.labels[i]) + (it.value ? textPx(this.values[i]) + 12 : 0));
    });
    // one text size for the whole menu: shrunk only when the widest row (label + value) would overflow the menu width
    const k = Math.min(this.fontK, (this.width * this.u) / (worst * this.u));
    for (let i = 0; i < this.items.length; i++) {
      this.labels[i].setScale(this.u * k);
      this.values[i].setScale(this.u * k);
    }
    this.drawPanel(k, time);
  }

  destroy(): void {
    this.panel.destroy();
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
