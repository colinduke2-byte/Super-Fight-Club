import Phaser from 'phaser';
import { addCanvasTexture, context2d } from '../art/canvasTexture';
import { settings } from '../settings';
import type { BackgroundView } from './BackgroundView';
import { fastShapes } from './fastShapes';

/**
 * Menu backdrops by family. Every menu used to show the same ruined-city skyline; each family of screens now has a sky of
 * its own, built from what is already in memory (the backdrop themes' skylines are boot textures) plus a little dressing
 * drawn here:
 *  - title:    the city skyline under the ringed planet (Title, Main Menu): the game's signature view;
 *  - lobby:    a dark arena: the city dimmed behind a crowd, spotlights sweeping a lit floor (Character Select, Versus Setup);
 *  - arcade:   a sunrise over floating islands, a journey's sky (Arcade ladder, Story, Challenges, Credits);
 *  - vault:    the cyan data grid of the pylons (Records, and the replay / history screens);
 *  - settings: a calm blueprint workshop: a deep blue gradient, a drafting grid and slow dials (Settings, Controls, How to Play);
 *  - stage:    left to the screen, which shows a stage's own world (Stage Select, the VS splash, Results).
 * The only new textures are two tiny strips (the crowd, 128x24, and the grid cell, 16x16), kept for the session.
 */
export type MenuFamily = 'title' | 'lobby' | 'arcade' | 'vault' | 'settings' | 'stage';

/** Each screen's family (screens not listed get `title`; a screen may also name one through MenuBackdrop.family). */
export const MENU_FAMILIES: Record<string, MenuFamily> = {
  Title: 'title',
  ModeSelect: 'title',
  CharacterSelect: 'lobby',
  VersusSetup: 'lobby',
  StageSelect: 'stage',
  VersusSplash: 'stage',
  Results: 'stage',
  LadderMap: 'arcade',
  Story: 'arcade',
  Challenges: 'arcade',
  Credits: 'arcade',
  Records: 'vault',
  Settings: 'settings',
  Controls: 'settings',
  HowToPlay: 'settings',
};

/** The BackgroundView theme behind each family (undefined: the screen sets its own). */
const THEMES: Record<MenuFamily, string | undefined> = {
  title: 'skyline',
  lobby: 'skyline',
  arcade: 'dawn',
  vault: 'void',
  settings: undefined,
  stage: undefined,
};

export function familyFor(key: string, asked?: MenuFamily): MenuFamily {
  return asked ?? MENU_FAMILIES[key] ?? 'title';
}

/** Does the family dress the backdrop in its own way (the screen's planet spot and colour cast are then left out)? */
export function ownsLook(family: MenuFamily): boolean {
  return family !== 'title' && family !== 'stage';
}

const CROWD_TEX = 'menu-crowd';
const CROWD_W = 128;
const CROWD_H = 24;

/** A row of heads and shoulders in silhouette, with a few lit screens and glow sticks held up. */
function crowdCanvas(): HTMLCanvasElement | null {
  const c = document.createElement('canvas');
  c.width = CROWD_W;
  c.height = CROWD_H;
  const g = context2d(c);
  if (!g) return null;
  let seed = 7;
  const rnd = (): number => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  const row = (y0: number, col: string, step: number, off: number): void => {
    g.fillStyle = col;
    for (let x = -off; x < CROWD_W + step; x += step) {
      const hx = x + Math.floor(rnd() * 3);
      const hy = y0 - Math.floor(rnd() * 3);
      const hw = 4 + Math.floor(rnd() * 2);
      // head, then shoulders down to the bottom edge
      g.fillRect(hx + 1, hy, hw - 2, 1);
      g.fillRect(hx, hy + 1, hw, hw - 1);
      g.fillRect(hx - 2, hy + hw, hw + 4, CROWD_H - hy - hw);
      g.fillRect(hx - 1, hy + hw - 1, hw + 2, 1);
    }
  };
  // two ranks: the back one a shade lighter (in the haze), the front one near black
  row(6, '#1a1636', 7, 3);
  row(11, '#0b0918', 8, 0);
  // raised arms with glow sticks, and phone screens
  const lights = ['#7fe8ff', '#ffd46a', '#ff6a8a', '#9a8aff'];
  for (let i = 0; i < 9; i++) {
    const x = 4 + Math.floor(rnd() * (CROWD_W - 8));
    const y = 3 + Math.floor(rnd() * 5);
    g.fillStyle = '#0b0918';
    g.fillRect(x, y + 2, 1, 6);
    g.fillStyle = lights[i % lights.length];
    g.fillRect(x, y, 1, 3);
  }
  for (let i = 0; i < 6; i++) {
    g.fillStyle = '#cfe8ff';
    g.fillRect(4 + Math.floor(rnd() * (CROWD_W - 8)), 9 + Math.floor(rnd() * 4), 2, 1);
  }
  return c;
}

/** The family's dressing: owns its objects in the backdrop layer (they go with the scene). */
export class MenuBackdropFx {
  private readonly g: Phaser.GameObjects.Graphics;
  /** Settings: the sky gradient, redrawn on resize only. */
  private readonly sky: Phaser.GameObjects.Graphics | null = null;
  private readonly crowd: Phaser.GameObjects.Image[] = [];
  private w = 1;
  private h = 1;
  private u = 3;
  private ps = 1;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly layer: Phaser.GameObjects.Layer,
    bg: BackgroundView,
    readonly family: MenuFamily,
  ) {
    const theme = THEMES[family];
    if (theme) bg.setTheme(theme);
    if (family === 'settings') {
      // the blueprint covers the whole screen: what the backdrop drew is hidden (and the scene stops updating it)
      for (const o of layer.list) (o as unknown as Phaser.GameObjects.Components.Visible).setVisible?.(false);
      this.sky = scene.add.graphics();
      layer.add(this.sky);
    }
    this.g = fastShapes(scene.add.graphics());
    layer.add(this.g);
    if (family === 'lobby' && !scene.textures.exists(CROWD_TEX)) {
      const c = crowdCanvas();
      if (c) addCanvasTexture(scene, CROWD_TEX, c, crowdCanvas);
    }
  }

  /** The backdrop itself is hidden under this family's own sky (no need to update it). */
  get covers(): boolean {
    return this.family === 'settings';
  }

  resize(w: number, h: number, u: number): void {
    this.w = w;
    this.h = h;
    this.u = u;
    this.ps = Math.max(1, Math.round(h / 540));
    if (this.sky) this.drawBlueprintSky();
    if (this.family === 'lobby' && this.scene.textures.exists(CROWD_TEX)) {
      // the crowd strip across the arena floor's back edge, tiled with whole images (no full-screen tile canvas)
      // (sized by the short side: a tall phone screen must not get giant heads)
      const k = Math.max(1, Math.round(Math.min(w, h) / 320));
      const n = Math.ceil(w / (CROWD_W * k)) + 1;
      while (this.crowd.length < n) {
        const im = this.scene.add.image(0, 0, CROWD_TEX).setOrigin(0, 1);
        this.layer.add(im);
        this.crowd.push(im);
      }
      // (drawn after the arena's dimming, standing on the floor's back edge)
      this.crowd.forEach((im, i) => im.setVisible(i < n).setScale(k).setPosition(i * CROWD_W * k, h * 0.8).setTint(0x8a84b8));
    }
  }

  update(time: number): void {
    const g = this.g.clear();
    const calm = settings.reduceMotion;
    if (this.family === 'lobby') this.drawArena(g, time, calm);
    else if (this.family === 'settings') this.drawBlueprint(g, time, calm);
  }

  /** Spotlights sweeping down onto a lit arena floor, over the dimmed city and the crowd. */
  private drawArena(g: Phaser.GameObjects.Graphics, time: number, calm: boolean): void {
    const { w, h, u } = this;
    // the sky sinks into the dark; the floor is a lit stage with rim lights
    g.fillStyle(0x05040c, 0.55).fillRect(0, 0, w, h);
    const fy = h * 0.8;
    g.fillStyle(0x0d0a1e, 0.92).fillRect(0, fy, w, h - fy);
    g.fillStyle(0x6a5ad0, 0.35).fillRect(0, fy, w, u);
    for (let x = ((time * 20 * (calm ? 0 : 1)) % (24 * u)) - 24 * u; x < w; x += 24 * u) g.fillStyle(0xffd46a, 0.25).fillRect(x, fy + 3 * u, 8 * u, u);
    const beams = 4;
    for (let i = 0; i < beams; i++) {
      const sx = w * ((i + 0.5) / beams);
      const sway = calm ? 0 : Math.sin(time * 0.6 + i * 1.7) * w * 0.08;
      const tx = sx + sway;
      const col = [0x7fe8ff, 0xffd46a, 0xff6a8a, 0x9a8aff][i % 4];
      g.fillStyle(col, 0.06).fillTriangle(sx - 3 * u, 0, sx + 3 * u, 0, tx + w * 0.09, fy);
      g.fillStyle(col, 0.06).fillTriangle(sx - 3 * u, 0, tx - w * 0.09, fy, tx + w * 0.09, fy);
      g.fillStyle(col, 0.16).fillEllipse(tx, fy + 2 * u, w * 0.2, 9 * u);
    }
  }

  /** Deep blue, lighter toward the bottom: bands of art pixels (pixel-exact steps, no full-screen gradient texture). */
  private drawBlueprintSky(): void {
    const g = this.sky!.clear();
    const { w, h } = this;
    const step = this.ps * 2;
    const top = [0x06, 0x0e, 0x22];
    const mid = [0x0c, 0x22, 0x44];
    const bot = [0x14, 0x34, 0x58];
    for (let y = 0; y < h; y += step) {
      const t = y / h;
      const [a, b, k] = t < 0.6 ? [top, mid, t / 0.6] : [mid, bot, (t - 0.6) / 0.4];
      const c = (Math.round(a[0] + (b[0] - a[0]) * k) << 16) | (Math.round(a[1] + (b[1] - a[1]) * k) << 8) | Math.round(a[2] + (b[2] - a[2]) * k);
      g.fillStyle(c, 1).fillRect(0, y, w, step);
    }
  }

  /** A drafting grid (fine and coarse lines), two slow dials in the corners and a scan line drifting down. */
  private drawBlueprint(g: Phaser.GameObjects.Graphics, time: number, calm: boolean): void {
    const { w, h, u } = this;
    const cell = 12 * u;
    const line = Math.max(1, Math.round(u / 3));
    const drift = calm ? 0 : (time * 3 * u) % (cell * 4);
    for (let x = (drift % cell) - cell; x < w; x += cell) {
      const major = Math.round((x - drift) / cell) % 4 === 0;
      g.fillStyle(0x6ab8ff, major ? 0.12 : 0.05).fillRect(Math.round(x), 0, line, h);
    }
    for (let y = (drift % cell) - cell; y < h; y += cell) {
      const major = Math.round((y - drift) / cell) % 4 === 0;
      g.fillStyle(0x6ab8ff, major ? 0.12 : 0.05).fillRect(0, Math.round(y), w, line);
    }
    // two dials: concentric rings with a sweeping hand, low in the left corner and high in the right
    const dial = (cx: number, cy: number, r: number, speed: number, col: number): void => {
      g.lineStyle(line, col, 0.16).strokeCircle(cx, cy, r);
      g.lineStyle(line, col, 0.1).strokeCircle(cx, cy, r * 0.72);
      g.lineStyle(line * 2, col, 0.12).strokeCircle(cx, cy, r * 0.32);
      for (let i = 0; i < 24; i++) {
        const a = (i / 24) * Math.PI * 2;
        const l = i % 6 === 0 ? 0.86 : 0.93;
        g.lineStyle(line, col, i % 6 === 0 ? 0.22 : 0.12).lineBetween(cx + Math.cos(a) * r * l, cy + Math.sin(a) * r * l, cx + Math.cos(a) * r, cy + Math.sin(a) * r);
      }
      const a = calm ? -0.6 : time * speed;
      g.lineStyle(line * 2, col, 0.22).lineBetween(cx, cy, cx + Math.cos(a) * r * 0.7, cy + Math.sin(a) * r * 0.7);
    };
    const r = Math.min(w, h) * 0.32;
    dial(w * 0.06, h * 0.86, r, 0.25, 0x7fe8ff);
    dial(w * 0.95, h * 0.16, r * 0.7, -0.4, 0xffd46a);
    // a soft scan line moving down the sheet
    if (!calm) {
      const sy = ((time * 40 * u) % (h + 60 * u)) - 30 * u;
      g.fillStyle(0x7fe8ff, 0.035).fillRect(0, sy - 12 * u, w, 24 * u);
      g.fillStyle(0x7fe8ff, 0.06).fillRect(0, sy, w, line);
    }
    // a vignette at the edges keeps the eye on the panel
    g.fillStyle(0x020612, 0.35).fillRect(0, 0, w, 10 * u);
    g.fillStyle(0x020612, 0.25).fillRect(0, h - 14 * u, w, 14 * u);
  }
}

/**
 * The main menu's showcase fighters stand on lit plinths: a hexagonal pad with a rim in the fighter's colour, a column of
 * light rising behind them, and a few motes drifting up through it (in place of the flat pale discs). `s` = the showcase's
 * scale (art px), `fade` 0..1. Draw into an ADD-blended Graphics (fastShapes recommended).
 */
export function drawShowcaseLight(g: Phaser.GameObjects.Graphics, x: number, floorY: number, s: number, col: number, fade: number, time: number): void {
  if (fade <= 0) return;
  const calm = settings.reduceMotion;
  // the light column, narrow and soft-edged (three nested strips fading upward)
  const colH = 92 * s;
  for (let i = 0; i < 3; i++) {
    const half = (10 + i * 7) * s;
    const a = (0.07 - i * 0.018) * fade;
    g.fillStyle(col, a).fillRect(x - half, floorY - colH, half * 2, colH);
    g.fillStyle(col, a * 0.6).fillRect(x - half, floorY - colH * 1.25, half * 2, colH * 0.25);
  }
  // the pad: a flattened hexagon in two tones with a bright rim, and a crisp rim line on the floor
  const pw = 30 * s;
  const ph = 6 * s;
  const hex = (k: number): Phaser.Math.Vector2[] => [
    new Phaser.Math.Vector2(x - pw * k, floorY),
    new Phaser.Math.Vector2(x - pw * k * 0.6, floorY - ph * k),
    new Phaser.Math.Vector2(x + pw * k * 0.6, floorY - ph * k),
    new Phaser.Math.Vector2(x + pw * k, floorY),
    new Phaser.Math.Vector2(x + pw * k * 0.6, floorY + ph * k),
    new Phaser.Math.Vector2(x - pw * k * 0.6, floorY + ph * k),
  ];
  g.fillStyle(col, 0.16 * fade).fillPoints(hex(1.25), true);
  g.fillStyle(col, 0.22 * fade).fillPoints(hex(1), true);
  g.lineStyle(Math.max(1, s * 0.6), col, 0.7 * fade).strokePoints(hex(1), true);
  // motes rising through the column
  for (let i = 0; i < 6; i++) {
    const ph2 = calm ? (i / 6) : ((time * 0.35 + i / 6) % 1);
    const mx = x + Math.sin(i * 2.4 + (calm ? 0 : time)) * 12 * s;
    const my = floorY - ph2 * colH;
    const a = Math.sin(ph2 * Math.PI) * 0.5 * fade;
    g.fillStyle(0xffffff, a).fillRect(Math.round(mx), Math.round(my), Math.max(1, s), Math.max(1, s));
  }
}
