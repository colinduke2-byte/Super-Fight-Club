import Phaser from 'phaser';
import { PIXEL_FONT, up } from '../art/pixelFont';
import type { CharacterData } from '../engine/types';

/** Damage at which a boss stock's integrity bar reads empty (the Overseer is very heavy: KOs usually land past this). */
export const BOSS_KO_REF = 170;

/** Bar colours per phase: calm machine cyan, then enraged red. */
const PHASE_COL = [0xb685ff, 0xff4a2a];
const PHASE_HOT = [0xc8f8ff, 0xffb070];
const ROMAN = ['I', 'II', 'III', 'IV', 'V'];

/**
 * The boss health readout: a long bar across the top of the screen in place of the normal % plate. Each stock is one
 * phase segment (notches between them); the live segment drains as the boss takes damage, a pale "chip" trails it, and
 * past `BOSS_KO_REF` it holds a sliver and blinks CRITICAL. A name plate sits over the left end, the phase over the right,
 * and a phase change flashes the bar and pops "PHASE II". Screen space; built and fed by FighterHud (`useBossBar`).
 */
export class BossBar {
  private readonly g: Phaser.GameObjects.Graphics;
  private readonly glow: Phaser.GameObjects.Graphics;
  private readonly name: Phaser.GameObjects.BitmapText;
  private readonly title: Phaser.GameObjects.BitmapText;
  private readonly phaseText: Phaser.GameObjects.BitmapText;
  private readonly pct: Phaser.GameObjects.BitmapText;
  private readonly banner: Phaser.GameObjects.BitmapText;
  private u = 2;
  private x = 0;
  private y = 0;
  private w = 300;
  /** Shown fill (0..1 of the whole bar) and the trailing chip. */
  private fill = 1;
  private chip = 1;
  private lastStocks = -1;
  /** 1 right after a phase change, decaying (flash + banner). */
  private phasePop = 0;
  /** 1 right after a hit, decaying (the bar shakes). */
  private jolt = 0;
  private lastDamage = 0;
  private lastNow = -1;
  private shownPct = -1;
  private visible = true;

  constructor(
    private readonly scene: Phaser.Scene,
    layer: Phaser.GameObjects.Layer,
    data: CharacterData,
    /** Stocks the boss starts with: one phase segment each. */
    private readonly maxStocks: number,
    subtitle = 'ARENA WARDEN',
  ) {
    this.g = scene.add.graphics();
    this.glow = scene.add.graphics().setBlendMode(Phaser.BlendModes.ADD);
    this.name = scene.add.bitmapText(0, 0, PIXEL_FONT, up(data.name)).setOrigin(0, 1).setTint(0xffe9c0);
    this.title = scene.add.bitmapText(0, 0, PIXEL_FONT, up(subtitle)).setOrigin(0, 1).setTint(0x9a96d8);
    this.phaseText = scene.add.bitmapText(0, 0, PIXEL_FONT, '').setOrigin(1, 1);
    this.pct = scene.add.bitmapText(0, 0, PIXEL_FONT, '').setOrigin(1, 0).setTint(0xd8d4f0);
    this.banner = scene.add.bitmapText(0, 0, PIXEL_FONT, '').setOrigin(0.5, 0).setVisible(false).setCenterAlign();
    layer.add([this.g, this.glow, this.name, this.title, this.phaseText, this.pct, this.banner]);
  }

  /**
   * `u` = device pixels per HUD art pixel (as for the fighter plates). Spans most of the width, centred at the top, and every
   * label sits clear of the bar and of each other at any window size:
   *  - above the bar: the boss's name (double size when it fits) on the left, the phase on the right, and the subtitle after
   *    the name when the row is wide enough;
   *  - below it: the percent on the right and, when the top row has no room, the subtitle on the left (or on a row of its
   *    own under that when it would run into the widest percent, "CRITICAL 999%");
   *  - the PHASE banner under all of that, never over the bar.
   */
  layout(u: number): void {
    this.u = u;
    const sw = this.scene.scale.width;
    this.w = Math.round(Math.min(sw - 24 * u, 300 * u));
    this.x = Math.round((sw - this.w) / 2);
    const tu = Math.max(1, Math.floor(u));
    const gap = 6 * u;
    /** Width (device px) of `text` in this BitmapText at `scale`. */
    const widthOf = (t: Phaser.GameObjects.BitmapText, text: string, scale: number): number => {
      const keep = t.text;
      t.setText(text);
      const wd = t.getTextBounds().local.width * scale;
      t.setText(keep);
      return wd;
    };
    const lineH = Math.max(1, this.title.getTextBounds().local.height);
    const nameW1 = widthOf(this.name, this.name.text, tu);
    const titleW = widthOf(this.title, this.title.text, tu);
    const phaseW = widthOf(this.phaseText, 'PHASE III', tu);
    const pctW = widthOf(this.pct, 'CRITICAL 999%', tu);
    // the name at double size if it still leaves room for the phase label
    const ns = nameW1 * 2 + gap + phaseW <= this.w ? tu * 2 : tu;
    const nameW = nameW1 * (ns / tu);
    const titleInline = nameW + gap + titleW + gap + phaseW <= this.w;
    // top row (its bottom 3u above the bar, clear of the frame's 2u border), then the bar
    const top = Math.round(4 * u);
    this.y = Math.round(top + lineH * ns + 3 * u);
    const y = this.y;
    const labels = y - 3 * u;
    this.name.setScale(ns).setOrigin(0, 1).setPosition(this.x, labels);
    this.phaseText.setScale(tu).setOrigin(1, 1).setPosition(this.x + this.w, labels);
    // rows under the bar start below its frame and the notch tips (4u under the 8u bar)
    const below = y + 8 * u + 5 * u;
    const rowH = lineH * tu + 2 * u;
    this.pct.setScale(tu).setOrigin(1, 0).setPosition(this.x + this.w, below);
    let rows = 1;
    if (titleInline) this.title.setScale(tu).setOrigin(0, 1).setPosition(this.x + nameW + gap, labels);
    else if (titleW + gap + pctW <= this.w) this.title.setScale(tu).setOrigin(0, 0).setPosition(this.x, below);
    else {
      this.title.setScale(tu).setOrigin(0, 0).setPosition(this.x, below + rowH);
      rows = 2;
    }
    this.banner.setScale(tu * 3).setPosition(sw / 2, below + rows * rowH + 4 * u);
  }

  setVisible(v: boolean): void {
    this.visible = v;
    for (const o of [this.g, this.glow, this.name, this.title, this.phaseText, this.pct]) o.setVisible(v);
    if (!v) this.banner.setVisible(false);
  }

  destroy(): void {
    for (const o of [this.g, this.glow, this.name, this.title, this.phaseText, this.pct, this.banner]) o.destroy();
  }

  /**
   * Per frame. `damage` = the boss's percent (or damage taken this stock in stamina mode, with `hpMax`), `stocks` = stocks
   * left, `out` = eliminated.
   */
  update(damage: number, stocks: number, tick: number, out = false, hpMax = 0): void {
    const now = performance.now();
    const k = this.lastNow < 0 ? 1 : Math.min(4, (now - this.lastNow) / (1000 / 60));
    this.lastNow = now;
    const n = Math.max(1, this.maxStocks);
    const left = out ? 0 : Math.max(0, Math.min(n, stocks));
    if (this.lastStocks >= 0 && left < this.lastStocks && left > 0) this.phasePop = 1;
    this.lastStocks = left;
    if (damage > this.lastDamage) this.jolt = Math.min(1, (damage - this.lastDamage) / 12);
    this.lastDamage = damage;
    const ref = hpMax > 0 ? hpMax : BOSS_KO_REF;
    const critical = left > 0 && damage >= ref * 0.92;
    const integrity = left > 0 ? Math.max(0.03, 1 - damage / ref) : 0;
    const target = left > 0 ? (left - 1 + integrity) / n : 0;
    // the fill snaps down quickly, the chip follows after a beat; refills (a new stock) sweep up
    this.fill += (target - this.fill) * Math.min(1, (target < this.fill ? 0.5 : 0.08) * k);
    this.chip = target > this.chip ? this.fill : this.chip + (target - this.chip) * Math.min(1, 0.03 * k);
    this.jolt = Math.max(0, this.jolt - 0.07 * k);
    this.phasePop = Math.max(0, this.phasePop - 0.012 * k);
    if (!this.visible) return;

    const phase = Math.min(PHASE_COL.length - 1, n - Math.max(1, left)); // 0 while the first stock lasts
    const col = PHASE_COL[phase];
    const hot = PHASE_HOT[phase];
    const u = this.u;
    const jx = this.jolt > 0 ? ((tick & 1) === 0 ? 1 : -1) * this.jolt * 2 * u : 0;
    const x = this.x + jx;
    const y = this.y;
    const w = this.w;
    const h = 8 * u;
    const g = this.g.clear();
    const a = this.glow.clear();
    // frame: dark backing, gold keyline, end caps
    g.fillStyle(0x07061a, 0.82).fillRect(x - 3 * u, y - 2 * u, w + 6 * u, h + 4 * u);
    g.lineStyle(u, 0xb89a5a, 1).strokeRect(x - 2.5 * u, y - 1.5 * u, w + 5 * u, h + 3 * u);
    g.fillStyle(0xe2be70, 1).fillTriangle(x - 3 * u, y - 2 * u, x - 9 * u, y + h / 2, x - 3 * u, y + h + 2 * u);
    g.fillTriangle(x + w + 3 * u, y - 2 * u, x + w + 9 * u, y + h / 2, x + w + 3 * u, y + h + 2 * u);
    // trough, chip, fill (with a lit top row and a shaded bottom row)
    g.fillStyle(0x1a1430, 1).fillRect(x, y, w, h);
    g.fillStyle(0xfff0d0, 0.85).fillRect(x, y, w * this.chip, h);
    const fw = w * this.fill;
    const blink = critical && ((tick >> 3) & 1) === 0;
    g.fillStyle(blink ? 0xffffff : col, 1).fillRect(x, y, fw, h);
    g.fillStyle(hot, 1).fillRect(x, y, fw, u * 2);
    g.fillStyle(0x000000, 0.28).fillRect(x, y + h - 2 * u, fw, 2 * u);
    // a moving sheen along the fill
    const sh = (tick * 3 * u) % (w + 40 * u);
    if (sh < fw) a.fillStyle(0xffffff, 0.22).fillRect(x + sh, y, Math.min(14 * u, fw - sh), h);
    a.fillStyle(col, 0.18 + 0.1 * Math.sin(tick * 0.12)).fillRect(x, y - u, fw, h + 2 * u);
    // phase notches between the stock segments
    for (let i = 1; i < n; i++) {
      const nx = x + Math.round((w * i) / n);
      g.fillStyle(0x07061a, 1).fillRect(nx - u, y - 3 * u, 2 * u, h + 6 * u);
      g.fillStyle(0xe2be70, 1).fillTriangle(nx - 3 * u, y - 4 * u, nx + 3 * u, y - 4 * u, nx, y);
      g.fillTriangle(nx - 3 * u, y + h + 4 * u, nx + 3 * u, y + h + 4 * u, nx, y + h);
    }
    // a phase change: the whole bar flashes white-hot and a banner pops under it
    if (this.phasePop > 0) {
      const p = this.phasePop;
      a.fillStyle(0xffffff, Math.min(0.8, p * 1.2)).fillRect(x - 3 * u, y - 2 * u, w + 6 * u, h + 4 * u);
      a.fillStyle(col, 0.25 * p).fillRect(x - 3 * u, y + h + 2 * u, w + 6 * u, 30 * u * p);
    }
    const label = `PHASE ${ROMAN[Math.min(ROMAN.length - 1, n - Math.max(1, left))]}`;
    if (this.phaseText.text !== label) this.phaseText.setText(label);
    this.phaseText.setTint(phase > 0 && ((tick >> 4) & 1) === 0 ? 0xffffff : col);
    const shown = left > 0 ? (hpMax > 0 ? Math.max(0, Math.ceil(hpMax - damage)) : Math.floor(damage)) : -1;
    if (shown !== this.shownPct) {
      this.shownPct = shown;
      this.pct.setText(shown < 0 ? '' : critical && hpMax <= 0 ? `CRITICAL ${shown}%` : hpMax > 0 ? `${shown} HP` : `${shown}%`);
    }
    this.pct.setTint(critical ? (blink ? 0xffffff : 0xff5a4a) : 0xd8d4f0);
    const showBanner = this.phasePop > 0.05;
    this.banner.setVisible(showBanner);
    if (showBanner) {
      if (this.banner.text !== label) this.banner.setText(label);
      this.banner.setTint(((tick >> 2) & 1) === 0 ? 0xffffff : col).setAlpha(Math.min(1, this.phasePop * 3));
    }
  }
}
