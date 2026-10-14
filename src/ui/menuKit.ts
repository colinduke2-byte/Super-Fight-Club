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
  hint?: string | (() => string);
}

/** Unscaled pixel width of a bitmap text (independent of its current scale). */
export function textPx(t: Phaser.GameObjects.BitmapText): number {
  return t.getTextBounds().local.width;
}

/** Fill colour, border colour and corner-tick colour shared by every menu panel. */
export const PANEL = { fill: 0x0a0820, alpha: 0.9, border: 0x3c3478, tick: COLORS.title, stripe: 0x1c1840 };

/**
 * The one panel style used across the menus: a near-solid plate, a 1-unit border and gold corner ticks.
 * Drawn into `g` (not cleared), so callers can layer stripes or dividers on top.
 */
export function drawPanel(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, u: number, alpha = PANEL.alpha): void {
  g.fillStyle(PANEL.fill, alpha).fillRect(x, y, w, h);
  // a lighter inner edge at the top reads as a bevel and lifts the plate off the backdrop
  g.fillStyle(0xffffff, 0.04).fillRect(x, y, w, u);
  g.lineStyle(u, PANEL.border, 1).strokeRect(x - u / 2, y - u / 2, w + u, h + u);
  g.fillStyle(PANEL.tick, 0.9);
  for (const [cx, cy] of [[x - u, y - u], [x + w - u * 2, y - u], [x - u, y + h - u * 2], [x + w - u * 2, y + h - u * 2]]) g.fillRect(cx, cy, u * 3, u * 3);
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
  private rowH = 18;
  private fontK = 1.5;
  private visible = true;
  /** Backing plate and cursor bar, drawn under the rows. */
  private readonly panel: Phaser.GameObjects.Graphics;
  /** Draw the backing plate (on by default; scenes with their own frame turn it off). */
  plate = true;
  /** Cursor bar position in rows: glides toward `index` instead of jumping. */
  private barPos = -1;
  private lastTime = -1;
  /** Each row's last value text and when it last changed (for the pop on a changed setting). */
  private lastVals: (string | undefined)[] = [];
  private popAt: number[] = [];

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
    this.lastVals = [];
    this.popAt = [];
    this.barPos = -1;
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
    const h = this.items[this.index]?.hint ?? '';
    return typeof h === 'function' ? h() : h;
  }

  /** Bottom edge of the plate in screen pixels, for placing what follows the list. */
  get bottom(): number {
    const rh = this.rowH * this.u;
    return this.top - (rh - 7 * this.fontK * this.u) / 2 - this.u * 2 + this.items.length * rh + this.u * 3;
  }

  /** Solid plate behind the rows plus a bar under the cursor, so the menu reads over any backdrop. */
  private drawPlate(k: number, time: number): void {
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
    drawPanel(g, x, y, w, h, u);
    // cursor bar (glides between rows)
    const sy = this.top + (this.barPos < 0 ? this.index : this.barPos) * rh - (rh - textH) / 2;
    const a = 0.16 + 0.06 * Math.sin(time * 6);
    g.fillStyle(COLORS.hot, a).fillRect(x + u, sy, w - u * 2, rh);
    g.fillStyle(COLORS.hot, 0.9).fillRect(x + u, sy, u * 2, rh);
  }

  update(time: number): void {
    const dt = this.lastTime < 0 ? 1 : Math.max(0, Math.min(0.1, time - this.lastTime));
    this.lastTime = time;
    // the cursor bar eases to the selected row; a wrap-around (or the first frame) jumps straight there
    if (this.barPos < 0 || Math.abs(this.index - this.barPos) > 2.5) this.barPos = this.index;
    else this.barPos += (this.index - this.barPos) * Math.min(1, dt * 22);
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
      const raw = it.value ? it.value() : undefined;
      if (this.lastVals[i] !== undefined && raw !== this.lastVals[i]) this.popAt[i] = time;
      this.lastVals[i] = raw;
      worst = Math.max(worst, textPx(this.labels[i]) + (it.value ? textPx(this.values[i]) + 12 : 0));
    });
    // one text size for the whole menu: shrunk only when the widest row (label + value) would overflow the menu width
    const k = Math.min(this.fontK, (this.width * this.u) / (worst * this.u));
    for (let i = 0; i < this.items.length; i++) {
      this.labels[i].setScale(this.u * k);
      // a changed value pops (briefly larger, centred on its row) so a left / right press visibly lands
      const pop = 1 + 0.3 * Math.max(0, 1 - (time - (this.popAt[i] ?? -9)) / 0.2);
      const y = this.top + i * this.rowH * this.u;
      this.values[i].setScale(this.u * k * pop).setY(y - (7 * this.u * k * (pop - 1)) / 2);
    }
    this.drawPlate(k, time);
  }

  destroy(): void {
    this.panel.destroy();
    for (const t of [...this.labels, ...this.values]) t.destroy();
  }
}

/** Per-screen dressing of the shared menu backdrop, so each screen has its own look without new art. */
export interface MenuBackdrop {
  /** Centre of the ringed planet as fractions of the screen, plus a size multiplier; null hides it. Omitted: the default spot. */
  planet?: { x: number; y: number; k?: number } | null;
  /** Colour multiplied over the backdrop: a gentle cast per screen (0xffffff = none). */
  tint?: number;
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
  /** Set once a scene change has started (the fade-out is running): input is ignored and further changes dropped. */
  private leaving = false;

  protected abstract build(): void;
  protected abstract onEvent(e: MenuEvent): void;
  protected layoutUi(_w: number, _h: number, _u: number): void {}
  /** How this screen dresses the shared backdrop (planet spot, colour cast); asked again on every resize. */
  protected backdrop(_w: number, _h: number): MenuBackdrop {
    return {};
  }
  private look: MenuBackdrop = {};
  private planet: Phaser.GameObjects.Image | null = null;
  /** Colour cast (multiply) over the backdrop, under the UI. */
  private shade!: Phaser.GameObjects.Graphics;
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
    // the planet is a plain image in the backdrop layer: found by texture so screens can move it clear of their content
    this.planet = (this.bgLayer.list.find((o) => o instanceof Phaser.GameObjects.Image && o.texture.key === 'bg-planet') as Phaser.GameObjects.Image | undefined) ?? null;
    this.shade = this.add.graphics();
    this.bgLayer.add(this.shade);
    this.build();
    this.scale.on('resize', this.onResize, this);
    this.events.once('shutdown', () => this.scale.off('resize', this.onResize, this));
    this.relayout(w, h);
    menuInput.reset();
    this.time0 = performance.now();
    this.leaving = false;
    for (const cam of [main, this.uiCam]) cam.fadeIn(160, 7, 6, 15);
  }

  override update(_t: number, _d: number): void {
    const time = (performance.now() - this.time0) / 1000;
    this.bg.update(time * 6, Math.sin(time * 0.2) * 10, 3, time);
    this.placePlanet(time);
    for (const e of menuInput.poll()) {
      if (this.leaving) continue;
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
    this.look = this.backdrop(w, h);
    this.drawShade(w, h);
    this.layoutUi(w, h, this.u);
  }

  /**
   * The controls hint pinned to the bottom edge, and optionally a description line above it with a clear gap
   * (each shrunk only if it would overflow the width). Returns the y of the stack's top edge.
   */
  protected placeFooter(hint: Phaser.GameObjects.BitmapText, desc?: Phaser.GameObjects.BitmapText, descK = 1): number {
    const w = this.scale.width;
    const h = this.scale.height;
    const u = this.u;
    hint.setOrigin(0.5).setScale(Math.min(u, (w * 0.97) / Math.max(1, textPx(hint)))).setPosition(w / 2, h - 10 * u);
    let top = hint.y - hint.displayHeight / 2;
    if (desc) {
      desc.setOrigin(0.5).setScale(Math.min(u * descK, (w * 0.94) / Math.max(1, textPx(desc))));
      desc.setPosition(w / 2, top - 6 * u - (7 * desc.scaleY) / 2);
      top = desc.y - (7 * desc.scaleY) / 2;
    }
    return top;
  }

  private placePlanet(time: number): void {
    const p = this.planet;
    const spot = this.look.planet;
    if (!p || spot === undefined) return;
    if (spot === null) {
      p.setVisible(false);
      return;
    }
    // the same slow drift the backdrop gives it, around this screen's spot
    p.setScale(this.bg.ps * 1.5 * (spot.k ?? 1));
    p.setPosition(this.scale.width * spot.x - time * 0.36, this.scale.height * spot.y - Math.sin(time * 0.2) * 0.6);
  }

  private drawShade(w: number, h: number): void {
    const g = this.shade.clear();
    const tint = this.look.tint;
    if (tint !== undefined && tint !== 0xffffff) {
      g.setBlendMode(Phaser.BlendModes.MULTIPLY);
      g.fillStyle(tint, 1).fillRect(0, 0, w, h);
    } else g.setBlendMode(Phaser.BlendModes.NORMAL);
  }

  /** Go to another scene (stops this one). */
  protected go(key: string, data?: object): void {
    if (this.leaving) return;
    this.leaving = true;
    const cams = [this.cameras.main, this.uiCam];
    for (const cam of cams) cam.fadeOut(110, 7, 6, 15);
    this.uiCam.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => this.scene.start(key, data));
  }
}
