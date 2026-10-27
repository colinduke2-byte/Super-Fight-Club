import Phaser from 'phaser';
import { PIXEL_FONT, up } from '../art/pixelFont';
import { music } from '../audio/music';
import { sfx } from '../audio/sfx';
import { inputManager } from '../input/inputManager';
import type { InputDevice } from '../input/device';
import { menuInput, type MenuAction, type MenuEvent } from '../input/menuInput';
import { footerHint, lastInput, promptSerial, splitFooter, wrapText, type MenuVerb } from '../input/prompts';

export { splitFooter, wrapText };
import type { MenuPad } from '../input/touch';
import { settings } from '../settings';
import { layoutUnit, TAP_MIN_CSS, viewport } from '../display';
import { BackgroundView } from './BackgroundView';
import { MenuBackdropFx, familyFor, ownsLook, type MenuFamily } from './menuBackdrops';

/**
 * Render (canvas) pixels per UI art pixel for a canvas `h` tall (and `w` wide: the current window's width when omitted).
 * Follows the shorter of the window's width and height in CSS pixels, never drops below a readable size on touch
 * screens, and scales with the TEXT SIZE setting in real steps (see display.layoutUnit). Whole pixels from 4 up, half
 * pixels below.
 */
export function hudUnit(h: number, w?: number): number {
  const v = viewport;
  const perCss = v.cssH > 0 ? h / v.cssH : 1;
  const ww = w ?? (v.cssW > 0 ? v.cssW * perCss : (h * 16) / 9);
  return layoutUnit(h, ww, perCss, v.coarse, settings.uiScale || 1);
}

/** Render pixels per CSS pixel of the canvas right now (1 before the display is set up). */
export function renderPerCss(scene?: Phaser.Scene): number {
  if (scene && viewport.cssW > 0) return scene.scale.width / viewport.cssW;
  return viewport.scale || 1;
}

/** Smallest comfortable tap target in render pixels: ~44 CSS px on a touch screen, 0 with a mouse. */
export function tapMin(scene?: Phaser.Scene): number {
  return viewport.coarse ? TAP_MIN_CSS * renderPerCss(scene) : 0;
}

/**
 * Shrink a text (keeping its origin) so it is no wider than `maxW` render px, never above `maxScale`. Returns the scale.
 */
export function fitText(t: Phaser.GameObjects.BitmapText, maxW: number, maxScale: number): number {
  const k = Math.min(maxScale, maxW / Math.max(1, textPx(t)));
  t.setScale(k);
  return k;
}

/** Cut `str` (ending it with '..') until the text is no wider than `maxPx` unscaled pixels; returns the text shown. */
export function truncateText(t: Phaser.GameObjects.BitmapText, str: string, maxPx: number): string {
  t.setText(str);
  if (textPx(t) <= maxPx || str.length <= 2) return str;
  let lo = 1;
  let hi = str.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    t.setText(`${str.slice(0, mid).trimEnd()}..`);
    if (textPx(t) <= maxPx) lo = mid;
    else hi = mid - 1;
  }
  const out = `${str.slice(0, lo).trimEnd()}..`;
  t.setText(out);
  return out;
}

/** Player / port colours: the classic set, and an Okabe-Ito set (sky blue, orange, bluish green, reddish purple) that stays distinct for colour-blind players. */
export const PLAYER_PALETTES = {
  classic: [0x4aa3ff, 0xff6a5a, 0x5fe08a, 0xffd04a],
  colorblind: [0x56b4e9, 0xe69f00, 0x1fbf8f, 0xd884b6],
} as const;

/** The live port colours (the PLAYER COLOURS setting): the one source every tag, plate, bubble and menu chip reads. */
export function playerColors(): readonly number[] {
  return settings.playerPalette === 'colorblind' ? PLAYER_PALETTES.colorblind : PLAYER_PALETTES.classic;
}

export const COLORS = {
  title: 0xffd46a,
  text: 0xe8e4ff,
  dim: 0x8f8ab8,
  /** Footer / controls hints: brighter than `dim` so they read over any backdrop. */
  hint: 0xc8c4ec,
  hot: 0xffe14a,
  good: 0x7affa0,
  bad: 0xff6a5a,
  warn: 0xffb02e,
  accent: 0x7fe8ff,
  /** Port colours P1..P4 (follows the PLAYER COLOURS setting). */
  get p(): number[] {
    return playerColors() as number[];
  },
};

/** Port shape names, P1..P4, for the PORT SHAPES setting. */
export const PORT_SHAPES = ['circle', 'square', 'triangle', 'diamond'] as const;

/** The port (0..3) a port colour belongs to in either palette (-1: not a port colour). */
export function portOfColor(c: number): number {
  const i = (PLAYER_PALETTES.classic as readonly number[]).indexOf(c);
  return i >= 0 ? i : (PLAYER_PALETTES.colorblind as readonly number[]).indexOf(c);
}

/**
 * The port's shape (circle / square / triangle / diamond for P1..P4) centred on (x, y) with radius r, in `color` with a
 * dark outline `o` px wide, so ports read apart without relying on colour.
 */
export function drawPortShape(g: Phaser.GameObjects.Graphics, port: number, x: number, y: number, r: number, color: number, alpha = 1, o = Math.max(1, r * 0.3)): void {
  const shape = ((port % 4) + 4) % 4;
  const draw = (rr: number, col: number): void => {
    g.fillStyle(col, alpha);
    if (shape === 0) g.fillCircle(x, y, rr);
    else if (shape === 1) g.fillRect(x - rr * 0.86, y - rr * 0.86, rr * 1.72, rr * 1.72);
    else if (shape === 2) g.fillTriangle(x, y - rr * 1.05, x + rr * 1.05, y + rr * 0.8, x - rr * 1.05, y + rr * 0.8);
    else g.fillPoints([new Phaser.Math.Vector2(x, y - rr * 1.1), new Phaser.Math.Vector2(x + rr * 1.1, y), new Phaser.Math.Vector2(x, y + rr * 1.1), new Phaser.Math.Vector2(x - rr * 1.1, y)], true);
  };
  draw(r + o, 0x0a0818);
  draw(r, color);
}

/** Blink helper: on / off at `hz` full cycles per second, never faster than 3 Hz (and steady with REDUCE FLASHES). */
export function blink(time: number, hz = 2): boolean {
  if (settings.reduceFlashes) return true;
  return ((time * Math.min(3, hz) * 2) | 0) % 2 === 0;
}

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
  /** A pixel icon in the row's gutter (see drawIcon). */
  icon?: IconName;
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

/**
 * The menus' pixel icons: 8x8 one-colour glyphs drawn straight into a Graphics (runs of pixels as single rects, no texture),
 * each with a dark drop shadow so it reads over any plate.
 */
const ICON_ART = {
  play: ['.#......', '.##.....', '.###....', '.####...', '.####...', '.###....', '.##.....', '.#......'],
  battle: ['#......#', '.#....#.', '..#..#..', '...##...', '..####..', '.##..##.', '###..###', '.#....#.'],
  more: ['###..###', '###..###', '###..###', '........', '........', '###..###', '###..###', '###..###'],
  gear: ['...##...', '.#.##.#.', '..####..', '###..###', '###..###', '..####..', '.#.##.#.', '...##...'],
  solo: ['...##...', '..####..', '...##...', '.######.', '#..##..#', '...##...', '..#..#..', '.##..##.'],
  extras: ['...##...', '...##...', '########', '.######.', '..####..', '..####..', '.##..##.', '.#....#.'],
  back: ['...#....', '..##....', '.#######', '########', '.#######', '..##....', '...#....', '........'],
  quick: ['....###.', '...###..', '..###...', '.######.', '...###..', '..###...', '.##.....', '#.......'],
  teams: ['.#....#.', '###..###', '.#....#.', '###..###', '#.#..#.#', '.#....#.', '#.#..#.#', '........'],
  turns: ['..####..', '.#....#.', '#.....##', '#....###', '###....#', '##.....#', '.#....#.', '..####..'],
  arcade: ['...##...', '...##...', '....#...', '....#...', '.######.', '#......#', '#.#..#.#', '.######.'],
  boss: ['.######.', '########', '#..##..#', '#..##..#', '########', '.##..##.', '.######.', '.#.##.#.'],
  endless: ['........', '.##..##.', '#..##..#', '#..##..#', '#..##..#', '.##..##.', '........', '........'],
  gauntlet: ['#......#', '########', '#......#', '########', '#......#', '########', '#......#', '#......#'],
  flag: ['#.......', '######..', '#######.', '######..', '#.......', '#.......', '#.......', '#.......'],
  daily: ['.#....#.', '########', '#......#', '########', '#.#.#.##', '########', '#.#.#..#', '########'],
  target: ['..####..', '.#....#.', '#..##..#', '#.#..#.#', '#.#..#.#', '#..##..#', '.#....#.', '..####..'],
  launch: ['....####', '.....###', '....####', '...###.#', '..###...', '.###....', '###.....', '.#......'],
  training: ['..###...', '..###...', '...#....', '.#####..', '...#....', '...#....', '..###...', '.#####..'],
  book: ['........', '###..###', '#..##..#', '#..##..#', '#..##..#', '#..##..#', '########', '........'],
  film: ['########', '#.#..#.#', '########', '#..#...#', '#..##..#', '#..#...#', '########', '#.#..#.#'],
  trophy: ['########', '########', '.######.', '..####..', '...##...', '...##...', '..####..', '.######.'],
  card: ['########', '#......#', '#.##...#', '#.##.###', '#......#', '#.##.###', '#.##...#', '########'],
  help: ['..####..', '.##..##.', '.....##.', '....##..', '...##...', '...##...', '........', '...##...'],
  note: ['...#####', '...#...#', '...#...#', '...#...#', '...#...#', '.###.###', '####.###', '.##...#.'],
  heart: ['.##..##.', '########', '########', '########', '.######.', '..####..', '...##...', '........'],
  pad: ['........', '.######.', '#.####.#', '###.##.#', '#.####.#', '########', '##....##', '........'],
  close: ['##....##', '###..###', '.######.', '..####..', '..####..', '.######.', '###..###', '##....##'],
} as const;

export type IconName = keyof typeof ICON_ART;

/** Runs of lit pixels per icon row ([x0, length] pairs), worked out once. */
const ICON_RUNS = new Map<IconName, number[][]>();
function iconRuns(name: IconName): number[][] {
  let r = ICON_RUNS.get(name);
  if (r) return r;
  r = ICON_ART[name].map((row) => {
    const out: number[] = [];
    for (let x = 0; x < row.length; x++) {
      if (row[x] !== '#') continue;
      let n = 1;
      while (row[x + n] === '#') n++;
      out.push(x, n);
      x += n - 1;
    }
    return out;
  });
  ICON_RUNS.set(name, r);
  return r;
}

/** Draw icon `name` centred on (cx, cy), `px` render pixels per icon pixel (whole pixels, so it stays crisp). */
export function drawIcon(g: Phaser.GameObjects.Graphics, name: IconName, cx: number, cy: number, px: number, color: number, alpha = 1): void {
  const p = Math.max(1, Math.round(px));
  const x0 = Math.round(cx - p * 4);
  const y0 = Math.round(cy - p * 4);
  const runs = iconRuns(name);
  const sh = Math.max(1, Math.round(p / 2));
  for (const [col, a] of [[0x0a0818, alpha * 0.85], [color, alpha]] as const) {
    const o = col === color ? 0 : sh;
    g.fillStyle(col, a);
    for (let y = 0; y < runs.length; y++) {
      const row = runs[y];
      for (let i = 0; i < row.length; i += 2) g.fillRect(x0 + row[i] * p + o, y0 + y * p + o, row[i + 1] * p, p);
    }
  }
}

/** A button / tile's look: selected (gold edge and glow), held down (pressed in), an accent stripe colour. */
export interface ButtonState {
  sel?: boolean;
  press?: boolean;
  accent?: number;
  /** 0..1 pulse of the selected edge (pass 1 for steady). */
  glow?: number;
}

/**
 * The one button style for every tile, chip and corner button: the panel plate, a gold edge with a soft outer glow when
 * selected, an accent stripe along the bottom and, while held, the plate pressed in one unit.
 */
export function drawButton(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, u: number, st: ButtonState = {}): void {
  const dy = st.press ? u : 0;
  const yy = y + dy;
  if (st.sel) {
    const a = 0.22 + 0.18 * (st.glow ?? 1);
    g.fillStyle(COLORS.hot, a * 0.5).fillRect(x - 3 * u, yy - 3 * u, w + 6 * u, h + 6 * u);
    g.fillStyle(COLORS.hot, a).fillRect(x - 2 * u, yy - 2 * u, w + 4 * u, h + 4 * u);
  }
  g.fillStyle(st.press ? 0x05040e : PANEL.fill, st.sel ? 0.97 : 0.9).fillRect(x, yy, w, h);
  if (!st.press) g.fillStyle(0xffffff, st.sel ? 0.08 : 0.04).fillRect(x, yy, w, u);
  if (st.sel) g.fillStyle(COLORS.hot, 0.07).fillRect(x, yy, w, h);
  g.lineStyle(u, st.sel ? COLORS.hot : PANEL.border, 1).strokeRect(x - u / 2, yy - u / 2, w + u, h + u);
  if (st.accent !== undefined) g.fillStyle(st.accent, st.sel ? 1 : 0.75).fillRect(x, yy + h - 2 * u, w, 2 * u);
  g.fillStyle(st.sel ? COLORS.hot : PANEL.tick, 0.95);
  for (const [cx, cy] of [[x - u, yy - u], [x + w - u * 2, yy - u], [x - u, yy + h - u * 2], [x + w - u * 2, yy + h - u * 2]]) g.fillRect(cx, cy, u * 3, u * 3);
}

/**
 * The device a mouse click / finger tap acts for: the touch controller for a finger (so a tap in character select
 * joins as the touch player), else the device used last (a pad player who clicks joins as their pad, a keyboard player as
 * their side of the keyboard).
 */
export function pointerDevice(p?: Phaser.Input.Pointer): InputDevice {
  const t = inputManager.touch;
  if (p?.wasTouch || t.recentTouch()) return t;
  if (lastInput.kind === 'gamepad') {
    const pad = inputManager.padList.find((d) => d.padId === lastInput.padId && d.connected) ?? inputManager.padList.find((d) => d.connected);
    if (pad) return pad;
  }
  return inputManager.keyboards[lastInput.scheme === 'kb2' ? 1 : 0];
}

/**
 * A pointer's position in canvas (render) pixels, the space all UI is laid out in. The canvas backing store is sized in
 * render pixels and shown at CSS size (display.ts, Scale.NONE), and Phaser's pointer reports CSS pixels there; this
 * converts whatever scale Phaser applied to the true one.
 */
export function pointerXY(scene: Phaser.Scene, p: Phaser.Input.Pointer): { x: number; y: number } {
  const c = scene.game.canvas;
  const r = c.getBoundingClientRect();
  const ds = scene.scale.displayScale;
  const kx = r.width > 0 ? c.width / r.width / (ds.x || 1) : 1;
  const ky = r.height > 0 ? c.height / r.height / (ds.y || 1) : 1;
  return { x: p.x * kx, y: p.y * ky };
}

/** Footer text generated from the live bindings for the last device used: `footer([['confirm', 'SELECT'], ['back', 'BACK']])`. */
export function footer(entries: readonly (readonly [MenuVerb, string])[], device?: InputDevice | null): string {
  return footerHint(entries, device);
}

/**
 * A vertical list of rows with a highlighted cursor; label on the left, value on the right.
 * Mouse / touch: hovering a row moves the cursor to it, a click / tap confirms it (or steps a value left / right when
 * the value itself is clicked). Pointer presses are queued as menu events, so scenes handle them like key presses.
 */

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
  /** Rows react to the mouse / touch (scenes turn it off while they wait for something else, e.g. a key to bind). */
  interactive = true;
  /** Text scale factor of the last update (the plate and the hit boxes follow it). */
  private lastK = 1.5;
  /** When the last confirm landed (the cursor bar flashes for a moment: press feedback). */
  private flashAt = -9;
  /** Icon gutter width in art pixels (0 when no row has an icon). */
  private get gutter(): number {
    return this.items.some((it) => it.icon) ? 16 : 0;
  }
  /**
   * Scrolling: the first row shown and how many fit. A list longer than the space it is given (down to `bottom`, or the
   * footer) keeps its row size and scrolls with the cursor (and a finger drag) instead of shrinking its text.
   */
  private first = 0;
  private shown = 1;
  /** A finger on the list: where it went down, the scroll it started from, and whether it has turned into a drag. */
  private press: { id: number; y: number; first: number; row: number; drag: boolean; x: number } | null = null;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly layer: Phaser.GameObjects.Layer,
    public items: MenuItem[],
  ) {
    this.panel = scene.add.graphics();
    layer.add(this.panel);
    this.rebuild();
    scene.input.on(Phaser.Input.Events.POINTER_MOVE, this.onPointerMove, this);
    scene.input.on(Phaser.Input.Events.POINTER_DOWN, this.onPointerDown, this);
    scene.input.on(Phaser.Input.Events.POINTER_UP, this.onPointerUp, this);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, this.detachPointer, this);
    if (scene instanceof MenuScene) scene.lists.push(this);
  }

  private detachPointer(): void {
    this.scene.input?.off(Phaser.Input.Events.POINTER_MOVE, this.onPointerMove, this);
    this.scene.input?.off(Phaser.Input.Events.POINTER_DOWN, this.onPointerDown, this);
    this.scene.input?.off(Phaser.Input.Events.POINTER_UP, this.onPointerUp, this);
  }

  /** Rows shown at once (all of them unless the list scrolls). */
  get visibleRows(): number {
    return this.shown;
  }

  /** First row shown (0 unless the list scrolls). */
  get scrollTop(): number {
    return this.first;
  }

  /** Row under a screen point (-1: none). Rows span the whole plate width. */
  rowAt(px: number, py: number): number {
    if (!this.visible || !this.interactive || !this.items.length) return -1;
    const u = this.u;
    const rh = this.rowH * u;
    const pad = 6 * u;
    const x = this.cx - (this.width / 2) * u - pad;
    if (px < x || px > x + this.width * u + pad * 2) return -1;
    const y0 = this.top - (rh - 7 * this.lastK * u) / 2;
    const slot = Math.floor((py - y0) / rh);
    if (slot < 0 || slot >= this.shown) return -1;
    const i = this.first + slot;
    return i < this.items.length ? i : -1;
  }

  private onPointerMove(p: Phaser.Input.Pointer): void {
    const q = pointerXY(this.scene, p);
    const pr = this.press;
    if (pr && p.id === pr.id) {
      // a finger dragged along a long list scrolls it (the press then no longer counts as a tap)
      const rh = this.rowH * this.u;
      if (!pr.drag && Math.abs(q.y - pr.y) > Math.max(rh * 0.4, 10 * renderPerCss(this.scene))) pr.drag = this.items.length > this.shown;
      if (pr.drag) {
        this.first = Math.max(0, Math.min(this.items.length - this.shown, pr.first - Math.round((q.y - pr.y) / rh)));
        // the cursor stays on a row that is on screen
        if (this.index < this.first) this.index = this.first;
        else if (this.index >= this.first + this.shown) this.index = this.first + this.shown - 1;
        this.barPos = this.index;
      }
      return;
    }
    if (p.wasTouch) return; // a finger only hovers while pressed
    const i = this.rowAt(q.x, q.y);
    if (i < 0 || i === this.index || !this.enabled(i)) return;
    this.index = i;
    sfx.play('menuMove', 0.45, 0);
  }

  private onPointerDown(p: Phaser.Input.Pointer): void {
    if (p.rightButtonDown()) return;
    const q = pointerXY(this.scene, p);
    const i = this.rowAt(q.x, q.y);
    if (i < 0) return;
    if (p.wasTouch) {
      // a finger acts when it lifts, so a drag can scroll instead
      this.press = { id: p.id, y: q.y, x: q.x, first: this.first, row: i, drag: false };
      if (this.enabled(i) && i !== this.index) {
        this.index = i;
        sfx.play('menuMove', 0.45, 0);
      }
      return;
    }
    this.act(i, q.x, pointerDevice(p));
  }

  private onPointerUp(p: Phaser.Input.Pointer): void {
    const pr = this.press;
    if (!pr || p.id !== pr.id) return;
    this.press = null;
    if (pr.drag) return;
    const q = pointerXY(this.scene, p);
    const i = this.rowAt(q.x, q.y);
    if (i === pr.row) this.act(i, pr.x, pointerDevice(p));
  }

  /** A click / tap on row i at screen x: confirm it, or step its value left / right when the value is hit. */
  private act(i: number, x: number, device: InputDevice): void {
    if (!this.enabled(i)) return;
    this.index = i;
    const it = this.items[i];
    let action: MenuAction | null = it.onConfirm ? 'confirm' : null;
    if (it.onLeft || it.onRight) {
      // on the value (or a row that only steps): its left half steps left, its right half right
      const v = this.values[i];
      const vl = v.x - v.displayWidth;
      if (x >= vl - 6 * this.u || !action) action = it.onLeft && (x < vl + v.displayWidth / 2 || !it.onRight) ? 'left' : 'right';
    }
    if (action) menuInput.inject(action, device, this);
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
    this.first = 0;
    this.press = null;
    this.layout(this.cx, this.top, this.u, this.width, this.bottomArg);
  }

  /** The `bottom` the scene last laid the list out with (undefined: the screen's footer line). */
  private bottomArg: number | undefined;

  /**
   * `width` in art pixels: the row is centred on cx (and never wider than the screen). Rows end above `bottom` (default:
   * above the footer line at the bottom of the screen); a list with more rows than fit scrolls. On a touch screen rows
   * are at least a finger tall (~44 CSS px).
   */
  layout(cx: number, top: number, u: number, width = this.width, bottom?: number): void {
    this.cx = cx;
    this.top = top;
    this.u = u;
    this.bottomArg = bottom;
    const sw = this.scene.scale.width || cx * 2;
    const sh = this.scene.scale.height || top + 400 * u;
    // the plate's padding (6 units a side) and a small margin stay on screen
    this.width = Math.max(40, Math.min(width, (sw - 16 * u) / u));
    this.rowH = Math.max(18, tapMin(this.scene) / u);
    this.fontK = 1.5;
    const n = Math.max(1, this.items.length);
    const lim = bottom ?? sh - 24 * u;
    this.shown = Math.max(1, Math.min(n, Math.floor((lim - top + (this.rowH - 7 * this.fontK) * u * 0.5) / (this.rowH * u))));
    this.first = Math.max(0, Math.min(this.first, n - this.shown));
    this.placeRows(this.fontK);
  }

  /** Puts the shown rows in place (the rest hidden). */
  private placeRows(k: number): void {
    const u = this.u;
    const cx = this.cx;
    const width = this.width;
    for (let i = 0; i < this.items.length; i++) {
      const slot = i - this.first;
      const on = this.visible && slot >= 0 && slot < this.shown;
      const y = this.top + slot * this.rowH * u;
      this.labels[i].setScale(u * k).setPosition(cx - (width / 2) * u + this.gutter * u, y).setVisible(on);
      this.values[i].setScale(u * k).setOrigin(1, 0).setPosition(cx + (width / 2) * u, y).setVisible(on);
    }
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
    if (e.target !== undefined && e.target !== this) return false; // a click on another widget
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
        if (this.enabled(this.index) && item.onConfirm) {
          this.flashAt = this.lastTime;
          item.onConfirm();
        }
        return !!item.onConfirm;
      default:
        return false;
    }
  }

  setVisible(v: boolean): void {
    this.visible = v;
    this.panel.setVisible(v);
    if (!v) for (const t of [...this.labels, ...this.values]) t.setVisible(false);
    else this.placeRows(this.lastK);
  }

  /** The selected row's hint ('' if it has none). */
  get hint(): string {
    const h = this.items[this.index]?.hint ?? '';
    return typeof h === 'function' ? h() : h;
  }

  /** Bottom edge of the plate in screen pixels, for placing what follows the list. */
  get bottom(): number {
    const rh = this.rowH * this.u;
    return this.top - (rh - 7 * this.fontK * this.u) / 2 - this.u * 2 + this.shown * rh + this.u * 3;
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
    const h = this.shown * rh + u * 3;
    drawPanel(g, x, y, w, h, u);
    // cursor bar (glides between rows; hidden while it is scrolled out of view)
    const slot = (this.barPos < 0 ? this.index : this.barPos) - this.first;
    if (slot > -1 && slot < this.shown) {
      const sy = this.top + slot * rh - (rh - textH) / 2;
      const a = settings.reduceMotion ? 0.18 : 0.16 + 0.06 * Math.sin(time * 6);
      g.fillStyle(COLORS.hot, a).fillRect(x + u, sy, w - u * 2, rh);
      g.fillStyle(COLORS.hot, 0.9).fillRect(x + u, sy, u * 2, rh);
      // press feedback: the bar flashes white for a moment as a row is confirmed
      const fl = Math.max(0, 1 - (time - this.flashAt) / 0.18);
      if (fl > 0) g.fillStyle(0xffffff, (settings.reduceFlashes ? 0.12 : 0.3) * fl).fillRect(x + u, sy, w - u * 2, rh);
    }
    // the rows' icons in the gutter (lit on the selected row)
    if (this.gutter) {
      const px = Math.max(1, Math.round(u * Math.min(1.25, k * 0.85)));
      for (let s = 0; s < this.shown; s++) {
        const i = this.first + s;
        const ic = this.items[i]?.icon;
        if (!ic) continue;
        const sel = i === this.index;
        drawIcon(g, ic, this.cx - (this.width / 2) * u + 5 * u, this.top + s * rh + textH / 2, px, !this.enabled(i) ? 0x5a5680 : sel ? COLORS.hot : COLORS.accent);
      }
    }
    // a scrolling list: a thin track and thumb down the right edge, and arrows where more rows wait
    const n = this.items.length;
    if (n > this.shown) {
      const tx = x + w - u * 3;
      const ty = y + u * 4;
      const th = h - u * 8;
      g.fillStyle(PANEL.border, 0.9).fillRect(tx, ty, u, th);
      const thumbH = Math.max(u * 4, (th * this.shown) / n);
      const thumbY = ty + ((th - thumbH) * this.first) / Math.max(1, n - this.shown);
      g.fillStyle(COLORS.title, 0.95).fillRect(tx - u * 0.5, thumbY, u * 2, thumbH);
      const ax = x + w / 2;
      const s = u * 3;
      if (this.first > 0) g.fillStyle(COLORS.title, 0.95).fillTriangle(ax - s, y - u * 2, ax + s, y - u * 2, ax, y - u * 2 - s);
      if (this.first + this.shown < n) g.fillStyle(COLORS.title, 0.95).fillTriangle(ax - s, y + h + u * 2, ax + s, y + h + u * 2, ax, y + h + u * 2 + s);
    }
  }

  update(time: number): void {
    const dt = this.lastTime < 0 ? 1 : Math.max(0, Math.min(0.1, time - this.lastTime));
    this.lastTime = time;
    const n = this.items.length;
    // keep the cursor's row on screen (a drag moves the window itself, see onPointerMove)
    if (!this.press?.drag) {
      if (this.index < this.first) this.first = this.index;
      else if (this.index >= this.first + this.shown) this.first = this.index - this.shown + 1;
      this.first = Math.max(0, Math.min(this.first, n - this.shown));
    }
    // the cursor bar eases to the selected row; a wrap-around (or the first frame) jumps straight there
    if (this.barPos < 0 || Math.abs(this.index - this.barPos) > 2.5 || settings.reduceMotion) this.barPos = this.index;
    else this.barPos += (this.index - this.barPos) * Math.min(1, dt * 22);
    let worst = 1;
    const labels: string[] = [];
    const vals: string[] = [];
    this.items.forEach((it, i) => {
      const sel = i === this.index;
      const on = this.enabled(i);
      const label = typeof it.label === 'function' ? it.label() : it.label;
      const pulse = sel && !settings.reduceMotion && blink(time, 2);
      labels[i] = up(this.gutter ? label : `${sel ? '> ' : '  '}${label}`);
      this.labels[i].setText(labels[i]);
      this.labels[i].setTint(!on ? 0x5a5680 : sel ? (pulse ? COLORS.hot : COLORS.title) : COLORS.text);
      vals[i] = it.value ? up(`${sel && it.onLeft ? '< ' : ''}${it.value()}${sel && it.onRight ? ' >' : ''}`) : '';
      this.values[i].setText(vals[i]).setTint(!on ? 0x5a5680 : sel ? COLORS.hot : COLORS.accent);
      const raw = it.value ? it.value() : undefined;
      if (this.lastVals[i] !== undefined && raw !== this.lastVals[i]) this.popAt[i] = time;
      this.lastVals[i] = raw;
      worst = Math.max(worst, textPx(this.labels[i]) + (it.value ? textPx(this.values[i]) + 12 : 0));
    });
    // one text size for the whole menu: shrunk when the widest row (label + value) would overflow the menu width, but never
    // below the font's own size (k = 1); rows still too long are cut short with '..' instead
    const k = (this.lastK = Math.max(Math.min(1, this.fontK), Math.min(this.fontK, (this.width - this.gutter) / worst)));
    const room = (this.width - this.gutter) / k;
    for (let i = 0; i < n; i++) {
      const lw = textPx(this.labels[i]);
      const vw = vals[i] ? textPx(this.values[i]) + 12 : 0;
      if (lw + vw > room) {
        // the label gives way first (it keeps at least ~45% of the row), then the value
        truncateText(this.labels[i], labels[i], Math.max(room * 0.45, room - vw));
        if (vals[i]) truncateText(this.values[i], vals[i], Math.max(8, room - textPx(this.labels[i]) - 12));
      }
    }
    this.placeRows(k);
    for (let i = 0; i < n; i++) {
      // a changed value pops (briefly larger, centred on its row) so a left / right press visibly lands
      const pop = settings.reduceMotion ? 1 : 1 + 0.3 * Math.max(0, 1 - (time - (this.popAt[i] ?? -9)) / 0.2);
      const y = this.top + (i - this.first) * this.rowH * this.u;
      this.values[i].setScale(this.u * k * pop).setY(y - (7 * this.u * k * (pop - 1)) / 2);
    }
    this.drawPlate(k, time);
  }

  destroy(): void {
    this.detachPointer();
    this.panel.destroy();
    for (const t of [...this.labels, ...this.values]) t.destroy();
  }
}

/** Per-screen dressing of the menu backdrop (see menuBackdrops.ts for the family each screen belongs to). */
export interface MenuBackdrop {
  /** The backdrop family (title, lobby, arcade, vault, settings, stage); omitted: the screen's entry in MENU_FAMILIES. */
  family?: MenuFamily;
  /** Centre of the ringed planet as fractions of the screen, plus a size multiplier; null hides it. Omitted: the default spot. */
  planet?: { x: number; y: number; k?: number } | null;
  /** Colour multiplied over the backdrop: a gentle cast per screen (0xffffff = none). Families with skies of their own ignore it. */
  tint?: number;
  /** A dark arena: the sky dimmed, a lit floor and spotlights sweeping down onto it (the same as family 'lobby'). */
  arena?: boolean;
}

/** Looks a screen gets unless it says otherwise (screens owned elsewhere still get their own dressing). */
const DEFAULT_LOOKS: Record<string, MenuBackdrop> = {
  CharacterSelect: { arena: true },
};

/**
 * On-screen touch controls per screen when the screen does not choose (`touchPad`): character select taps its cards
 * directly but needs OK / BACK / START to lock in and start; the title takes a tap anywhere.
 */
const DEFAULT_TOUCH_PADS: Record<string, MenuPad> = {
  CharacterSelect: 'buttons',
  Title: 'none',
};

/** A corner button (BACK, the settings gear): its graphics, label, box, hover and press state. */
interface Chip {
  g: Phaser.GameObjects.Graphics;
  t: Phaser.GameObjects.BitmapText | null;
  icon: IconName;
  x: number;
  y: number;
  w: number;
  h: number;
  hover: boolean;
  down: boolean;
}

/** Scene transitions: the fade out and in (ms), and the short slide the new screen's UI makes into place. */
export const TRANSITION = { out: 100, in: 150, slide: 0.16 };

/** Last cursor row per scene (scenes with `rememberCursor`), kept for the session. */
const CURSORS = new Map<string, number>();

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
  /** Show the clickable "< BACK" chip in the top-left corner (it sends the same 'back' event as Escape / B). */
  protected backChip = true;
  /** A click / tap that lands on no row or chip confirms (screens with nothing else to click: story cards, credits...). */
  protected tapConfirms = false;
  private chip: Chip | null = null;
  /** Show the settings gear in the top-right corner (it opens Settings and comes back here). */
  protected gearChip = false;
  private gear: Chip | null = null;
  /** Scene time the enter slide started (the UI eases up into place; none with REDUCE MOTION). */
  private enterAt = -1;
  private wheelAt = 0;
  /** Reopening the screen puts the cursor back on the row it was on (first list only). */
  protected rememberCursor = false;
  /** Dark band behind the footer so the controls hint reads over any backdrop. */
  private footPlate: Phaser.GameObjects.Graphics | null = null;
  /** Footer texts rebuilt from the live bindings whenever the last-used device changes. */
  private boundFooters: { t: Phaser.GameObjects.BitmapText; entries: readonly (readonly [MenuVerb, string])[]; extra?: () => string }[] = [];
  private footSerial = -1;
  /** The backdrop family's own dressing (arena, blueprint...: see menuBackdrops). */
  private menuFx!: MenuBackdropFx;
  /**
   * The touch controls shown on this screen for a touch player: 'none' where everything is tapped directly, 'buttons'
   * (OK / BACK / START), 'full' (with a d-pad). 'auto': none on screens with menu lists or tap-anywhere, else full.
   */
  protected touchPad: MenuPad | 'auto' = 'auto';
  /**
   * Is there something this screen handles taps on at (x, y) render px, beyond menu rows and the BACK chip (cards,
   * tiles...)? A touch pad button drawn over such a spot lets the tap through to the screen.
   */
  protected tapTargetAt(_x: number, _y: number): boolean {
    return false;
  }

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

  /** Bumped on every create and shutdown: async work started during one visit checks `isVisit` before touching the scene. */
  private visit = 0;
  /** The current visit's id (see isVisit). */
  protected get visitId(): number {
    return this.visit;
  }
  /**
   * True while the visit `id` (a `visitId` read before an await) is still running: false once the scene was left, even if it
   * has been entered again since (a late callback must not act on the new visit, e.g. start a match from a later stage select).
   */
  protected isVisit(id: number): boolean {
    return id === this.visit && this.sys.isActive();
  }

  create(): void {
    this.visit++;
    this.events.once('shutdown', () => this.visit++);
    inputManager.init();
    sfx.arm();
    // each menu's own loop (the results jingle plays over its loop and hands back to it)
    music.play(({ CharacterSelect: 'select', Results: 'results', Credits: 'credits' } as Record<string, string>)[this.scene.key] ?? 'menu');
    this.bgLayer = this.add.layer();
    this.ui = this.add.layer();
    this.lists.length = 0;
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
    // the family is known before the screen builds (a screen showing a stage's world sets that theme itself in build)
    let asked: MenuBackdrop = {};
    try {
      asked = { ...(DEFAULT_LOOKS[this.scene.key] ?? {}), ...this.backdrop(w, h) };
    } catch {
      /* a screen whose look depends on what it builds: its family comes from the table */
    }
    this.menuFx = new MenuBackdropFx(this, this.bgLayer, this.bg, familyFor(this.scene.key, asked.family ?? (asked.arena ? 'lobby' : undefined)));
    this.footPlate = this.add.graphics();
    this.ui.add(this.footPlate);
    this.boundFooters = [];
    this.footSerial = promptSerial();
    this.build();
    if (this.rememberCursor && this.lists[0]) {
      const key = this.scene.key;
      const list = this.lists[0];
      list.index = Math.min(CURSORS.get(key) ?? list.index, Math.max(0, list.items.length - 1));
      this.events.once('shutdown', () => CURSORS.set(key, list.index));
    }
    this.buildPointer();
    this.claimTouch();
    this.scale.on('resize', this.onResize, this);
    this.events.once('shutdown', () => this.scale.off('resize', this.onResize, this));
    this.relayout(w, h);
    menuInput.reset();
    this.time0 = performance.now();
    this.leaving = false;
    this.inputHeld = false;
    // an overlay that paused this screen hands input back when it resumes it
    const onResume = (): void => {
      this.inputHeld = false;
      this.claimTouch();
    };
    this.events.on('resume', onResume);
    this.events.once('shutdown', () => this.events.off('resume', onResume));
    for (const cam of [main, this.uiCam]) cam.fadeIn(TRANSITION.in, 7, 6, 15);
    // the UI rises a few units into place as the screen fades in (a cut with REDUCE MOTION)
    this.enterAt = settings.reduceMotion ? -1 : 0;
    this.uiCam.setScroll(0, 0);
  }

  /** The enter slide: the UI camera eases from a few units low to rest. */
  private slideIn(time: number): void {
    if (this.enterAt < 0) return;
    const k = Math.min(1, (time - this.enterAt) / TRANSITION.slide);
    const e = 1 - Math.pow(1 - k, 3);
    this.uiCam.setScroll(0, -(1 - e) * 6 * this.u);
    if (k >= 1) this.enterAt = -1;
  }

  /**
   * Set when this screen has just queued a scene change of its own that takes effect next frame (opening an overlay over
   * itself, closing itself as an overlay): the rest of this frame's menu events are dropped. A second event in the same
   * frame used to run both (e.g. Settings over a paused match opening CONTROLS and closing itself at once, which left the
   * Controls overlay "returning" to a stopped Settings scene). Cleared when the scene is resumed or started again.
   */
  protected inputHeld = false;

  override update(_t: number, _d: number): void {
    const time = (performance.now() - this.time0) / 1000;
    if (!this.menuFx.covers) this.bg.update(time * 6, Math.sin(time * 0.2) * 10, 3, time);
    this.placePlanet(time);
    this.slideIn(time);
    this.menuFx.update(time);
    // the controls hints follow the device in use (a pad's buttons once a pad is touched, the keys after a key press)
    if (this.boundFooters.length && promptSerial() !== this.footSerial) {
      this.footSerial = promptSerial();
      this.refreshFooters();
      this.relayout(this.scale.width, this.scale.height);
    }
    for (const e of menuInput.poll()) {
      if (this.leaving || this.inputHeld) continue;
      // tiny UI blips; scenes that consume the event (rebinding etc.) still get it
      if (e.action === 'confirm') sfx.play('menuOk', 0.7, 0);
      else if (e.action === 'back') sfx.play('menuBack', 0.7, 0);
      else if (e.action === 'up' || e.action === 'down' || e.action === 'left' || e.action === 'right') sfx.play('menuMove', 0.6, 0);
      this.onEvent(e);
    }
    this.tick(time, 1 / 60);
    this.fitOverflow();
  }

  /**
   * Safety net for narrow (portrait) windows: any UI text wider than the screen, or running off its side, is shrunk to
   * fit (texts tagged `setData('noFit', true)` are left alone). Runs after the scene's own layout each frame, so a screen
   * that sizes its texts itself only gets corrected where they would be cut off.
   */
  private fitOverflow(): void {
    const w = this.scale.width;
    const margin = 4 * this.u;
    for (const o of this.ui.list) {
      if (!(o instanceof Phaser.GameObjects.BitmapText) || !o.visible || !o.text || o.getData('noFit')) continue;
      if (o.x < 0 || o.x > w) continue;
      const dw = o.displayWidth;
      const left = o.x - o.originX * dw;
      if (left >= margin * 0.5 && left + dw <= w - margin * 0.5) continue;
      // room on each side of the anchor, for this origin
      const room = Math.min(o.originX > 0 ? (o.x - margin) / o.originX : Infinity, o.originX < 1 ? (w - margin - o.x) / (1 - o.originX) : Infinity);
      if (!(room > w * 0.25) || room >= dw) continue;
      o.setScale(o.scaleX * (room / dw), o.scaleY * (room / dw));
    }
  }

  /** Tell the touch controller what this screen wants on screen, and what on it can be tapped directly. */
  private claimTouch(): void {
    const t = inputManager.touch;
    const pad = this.touchPad === 'auto' ? (DEFAULT_TOUCH_PADS[this.scene.key] ?? (this.lists.length || this.tapConfirms ? 'none' : 'full')) : this.touchPad;
    t.setMenuPad(pad);
    const through = (cx: number, cy: number): boolean => {
      if (!this.sys.isActive()) return false;
      const k = renderPerCss(this);
      const x = cx * k;
      const y = cy * k;
      return this.lists.some((l) => l.rowAt(x, y) >= 0) || this.inChipAt(x, y) || this.inChip(this.gear, x, y) || this.tapTargetAt(x, y);
    };
    t.passThrough = through;
    this.events.once('shutdown', () => {
      if (t.passThrough === through) t.passThrough = null;
    });
  }

  /** The BACK chip's hit box (a little larger than the chip: fingers are fat) contains render point (x, y). */
  private inChipAt(x: number, y: number): boolean {
    return this.inChip(this.chip, x, y);
  }

  private inChip(c: Chip | null, x: number, y: number): boolean {
    if (!c) return false;
    const s = this.u * 3;
    return x >= c.x - s && x <= c.x + c.w + s && y >= c.y - s && y <= c.y + c.h + s;
  }

  /** Mouse / touch: the BACK chip, right-click = back, the wheel moves up / down, and (opt-in) tap-anywhere = confirm. */
  private buildPointer(): void {
    this.chip = null;
    this.gear = null;
    const mk = (icon: IconName, label: string | null): Chip => {
      const g = this.add.graphics();
      this.ui.add(g);
      const t = label ? text(this, this.ui, label, COLORS.hint).setOrigin(0, 0.5) : null;
      return { g, t, icon, x: 0, y: 0, w: 0, h: 0, hover: false, down: false };
    };
    if (this.backChip) this.chip = mk('back', 'BACK');
    if (this.gearChip) this.gear = mk('gear', null);
    const hit = (c: Chip | null, pp: Phaser.Input.Pointer): boolean => {
      const p = pointerXY(this, pp);
      return this.inChip(c, p.x, p.y);
    };
    this.input.on(Phaser.Input.Events.POINTER_MOVE, (p: Phaser.Input.Pointer) => {
      for (const c of [this.chip, this.gear]) {
        if (c && hit(c, p) !== c.hover) {
          c.hover = !c.hover;
          if (!c.hover) c.down = false;
          this.drawChip(c);
        }
      }
    });
    this.input.on(Phaser.Input.Events.POINTER_UP, () => {
      for (const c of [this.chip, this.gear]) {
        if (c?.down) {
          c.down = false;
          this.drawChip(c);
        }
      }
    });
    this.input.on(Phaser.Input.Events.POINTER_DOWN, (p: Phaser.Input.Pointer) => {
      if (this.leaving) return;
      const dev = pointerDevice(p);
      if (hit(this.gear, p)) {
        this.gear!.down = true;
        this.drawChip(this.gear!);
        sfx.play('menuOk', 0.7, 0);
        this.openSettings();
        return;
      }
      if (p.rightButtonDown() || hit(this.chip, p)) {
        if (this.chip && !p.rightButtonDown()) {
          this.chip.down = true;
          this.drawChip(this.chip);
        }
        menuInput.inject('back', dev);
        return;
      }
      if (!this.tapConfirms) return;
      // rows handle their own clicks
      const q = pointerXY(this, p);
      if (!this.lists.some((l) => l.rowAt(q.x, q.y) >= 0)) menuInput.inject('confirm', dev);
    });
    this.input.on(Phaser.Input.Events.POINTER_WHEEL, (_p: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number) => {
      const now = performance.now();
      if (this.leaving || Math.abs(dy) < 1 || now - this.wheelAt < 90) return;
      this.wheelAt = now;
      menuInput.inject(dy > 0 ? 'down' : 'up', inputManager.keyboards[0]);
    });
  }

  /**
   * A footer text generated from the live bindings (see prompts.footerHint), kept current when the device changes;
   * `extra` appends scene text (e.g. a controller count).
   */
  protected bindFooter(t: Phaser.GameObjects.BitmapText, entries: readonly (readonly [MenuVerb, string])[], extra?: () => string): Phaser.GameObjects.BitmapText {
    this.boundFooters.push({ t, entries, extra });
    this.refreshFooters();
    return t;
  }

  private refreshFooters(): void {
    for (const f of this.boundFooters) {
      const x = f.extra?.() ?? '';
      f.t.setText(up(`${footer(f.entries)}${x ? `   ${x}` : ''}`));
    }
  }

  /** MenuLists the scene created (they register themselves), so a tap on a row is not also a tap on the screen. */
  readonly lists: MenuList[] = [];

  /** The gear: Settings over this screen's flow (it comes back here). Screens can send it elsewhere. */
  protected openSettings(): void {
    this.go('Settings', { back: this.scene.key });
  }

  /** A corner button in the shared button style: icon (and label), lit on hover, pressed in while held. */
  private drawChip(c: Chip): void {
    const u = this.u;
    const px = Math.max(1, Math.round(u));
    const dy = c.down ? u : 0;
    const iconW = 8 * px;
    const tw = c.t ? textPx(c.t) * u : 0;
    const inner = iconW + (c.t ? 4 * u + tw : 0);
    const x0 = c.x + (c.w - inner) / 2;
    const col = c.hover || c.down ? COLORS.hot : COLORS.hint;
    c.t?.setScale(u).setPosition(x0 + iconW + 4 * u, c.y + c.h / 2 + dy).setTint(col);
    const g = c.g.clear();
    drawButton(g, c.x, c.y, c.w, c.h, u, { sel: c.hover, press: c.down });
    drawIcon(g, c.icon, x0 + iconW / 2, c.y + c.h / 2 + dy, px, col);
  }

  /** BACK in the top-left corner and the gear in the top-right, the same size and spot on every screen. */
  private placeChip(): void {
    const u = this.u;
    const tap = tapMin(this);
    const h = Math.max(7 * u + 6 * u, tap);
    const c = this.chip;
    if (c) {
      c.t?.setScale(u);
      c.x = 5 * u;
      c.y = 5 * u;
      // a finger-sized chip on touch screens
      c.w = Math.max((c.t ? textPx(c.t) * u + 4 * u : 0) + 8 * u + 8 * u, tap * 1.4);
      c.h = h;
      this.drawChip(c);
    }
    const gr = this.gear;
    if (gr) {
      gr.w = Math.max(h, tap);
      gr.h = h;
      gr.x = this.scale.width - 5 * u - gr.w;
      gr.y = 5 * u;
      this.drawChip(gr);
    }
  }

  /** The gear's box (null without one), so a screen can put it in its own keyboard / pad navigation. */
  protected get gearBox(): { x: number; y: number; w: number; h: number } | null {
    const g = this.gear;
    return g ? { x: g.x, y: g.y, w: g.w, h: g.h } : null;
  }

  /** Light the gear as the keyboard / pad selection (or not). */
  protected setGearLit(on: boolean): void {
    const g = this.gear;
    if (!g || g.hover === on) return;
    g.hover = on;
    this.drawChip(g);
  }

  /** The corner buttons' bottom edge (screens start their content below it). */
  protected get chipBottom(): number {
    return 5 * this.u + Math.max(13 * this.u, tapMin(this));
  }

  private onResize(size: Phaser.Structs.Size): void {
    this.cameras.main.setSize(size.width, size.height);
    this.uiCam.setSize(size.width, size.height);
    this.relayout(size.width, size.height);
  }

  private relayout(w: number, h: number): void {
    this.u = hudUnit(h, w);
    // (a family that covers the backdrop with its own sky never builds the backdrop's full-screen gradient)
    if (!this.menuFx.covers) this.bg.resize(w, h);
    this.look = { ...(DEFAULT_LOOKS[this.scene.key] ?? {}), ...this.backdrop(w, h) };
    // a family with a sky of its own keeps it: no planet spot or colour cast meant for the city skyline
    if (ownsLook(this.menuFx.family)) this.look = { planet: null };
    this.menuFx.resize(w, h, this.u);
    this.drawShade(w, h);
    this.layoutUi(w, h, this.u);
    this.placeChip();
  }

  /**
   * The controls hint pinned to the bottom edge, and optionally a description line above it with a clear gap
   * (each shrunk only if it would overflow the width). Returns the y of the stack's top edge.
   */
  protected placeFooter(hint: Phaser.GameObjects.BitmapText, desc?: Phaser.GameObjects.BitmapText, descK = 1): number {
    const w = this.scale.width;
    const h = this.scale.height;
    const u = this.u;
    // a footer too long for the width at a readable size breaks onto two lines (at an entry boundary) instead
    const minK = u * 0.8;
    if (!hint.text.includes('\n') && (w * 0.97) / Math.max(1, textPx(hint)) < minK) {
      const two = splitFooter(hint.text);
      if (two) hint.setText(two).setCenterAlign();
    }
    hint.setOrigin(0.5).setScale(Math.min(u, (w * 0.97) / Math.max(1, textPx(hint))));
    hint.setPosition(w / 2, h - 6 * u - hint.displayHeight / 2);
    // brighter than the old dim footers, on a soft dark band, so they read over any backdrop
    if (hint.tintTopLeft === COLORS.dim) hint.setTint(COLORS.hint);
    let top = hint.y - hint.displayHeight / 2;
    const g = this.footPlate?.clear();
    if (g && hint.visible && hint.text) {
      const y0 = top - 3 * u;
      // near-solid: the backdrops' neon signs and lit windows used to show through as stray bars between the hint's words
      g.fillStyle(0x05040e, 0.84).fillRect(0, y0, w, h - y0);
      g.fillStyle(0x05040e, 0.4).fillRect(0, y0 - 2 * u, w, 2 * u);
      g.fillStyle(0x05040e, 0.18).fillRect(0, y0 - 4 * u, w, 2 * u);
      // one footer style everywhere: a thin rule along the band's top edge
      g.fillStyle(PANEL.border, 0.8).fillRect(0, y0, w, Math.max(1, u * 0.5));
    }
    if (desc) {
      // a description too long for one readable line wraps (up to three lines) rather than shrinking
      const raw = desc.getData('raw') as { flat: string; wrapped: string } | undefined;
      const flat = raw !== undefined && desc.text === raw.wrapped ? raw.flat : desc.text.replace(/\n/g, ' ');
      desc.setText(flat);
      const k1 = (w * 0.94) / Math.max(1, textPx(desc));
      if (k1 < u * descK * 0.8 && flat.length > 12) {
        const lines = Math.min(3, Math.ceil((textPx(desc) * u * descK) / (w * 0.94)));
        const wrapped = wrapText(flat, Math.max(12, Math.ceil(flat.length / lines + 4)));
        desc.setText(wrapped).setCenterAlign();
        desc.setData('raw', { flat, wrapped });
      }
      // wrapped lines read at the normal text size (a large single-line description stays large)
      const dk = desc.text.includes('\n') ? Math.min(descK, 1) : descK;
      desc.setOrigin(0.5).setScale(Math.min(u * dk, (w * 0.94) / Math.max(1, textPx(desc))));
      desc.setPosition(w / 2, top - 6 * u - desc.displayHeight / 2);
      top = desc.y - desc.displayHeight / 2;
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
    for (const cam of cams) cam.fadeOut(TRANSITION.out, 7, 6, 15);
    this.uiCam.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => this.scene.start(key, data));
  }
}
