import Phaser from 'phaser';
import { PIXEL_FONT } from '../art/pixelFont';
import { animFrameIndex, fighterTextureKey, uiTexK } from '../art/proceduralFighter';
import type { CharacterData } from '../engine/types';
import { settings } from '../settings';
import { fastShapes } from './fastShapes';

const LIFE = 0.95;

/** Signature emblems for the ultimates that play out in the open (no cinematic of their own to sell them). */
const EMBLEMS: Record<string, 'reticle' | 'sun' | 'elements' | 'gear' | 'eye'> = {
  havoc: 'reticle',
  agni: 'sun',
  nova: 'elements',
  gizmo: 'gear',
  overseer: 'eye',
  'overseer-versus': 'eye',
};

function lift(c: number, k: number): number {
  const r = (c >> 16) & 255;
  const g = (c >> 8) & 255;
  const b = c & 255;
  return (Math.round(r + (255 - r) * k) << 16) | (Math.round(g + (255 - g) * k) << 8) | Math.round(b + (255 - b) * k);
}

function darken(c: number, k: number): number {
  return (Math.round(((c >> 16) & 255) * k) << 16) | (Math.round(((c >> 8) & 255) * k) << 8) | Math.round((c & 255) * k);
}

/**
 * Ultimate cut-in: the screen dims, a slanted band in the fighter's colour slams open with a white flash, framed by bright rules
 * and scrolling diagonal stripes; the fighter's portrait (with a coloured echo behind it) pushes through it, a glint sweeps the
 * band and the ultimate's name slams in with a drop shadow under an ULTIMATE tag. The band snaps shut to a line on the way out.
 * Screen space, short, and drawn over the action without pausing it.
 */
export class UltCutIn {
  private readonly dim: Phaser.GameObjects.Graphics;
  private readonly g: Phaser.GameObjects.Graphics;
  private readonly lines: Phaser.GameObjects.Graphics;
  private readonly echo: Phaser.GameObjects.Image;
  private readonly sprite: Phaser.GameObjects.Image;
  private readonly top: Phaser.GameObjects.Graphics;
  private readonly shadow: Phaser.GameObjects.BitmapText;
  private readonly name: Phaser.GameObjects.BitmapText;
  private readonly tag: Phaser.GameObjects.BitmapText;
  private t = LIFE;
  private color = 0xffffff;
  private k = 1;
  private dir = 1;
  /** Which signature emblem stamps the band (by fighter id; '' = none). */
  private emblem = '';
  /** The band's four corners, reused for every band drawn. */
  private readonly quad = [new Phaser.Math.Vector2(), new Phaser.Math.Vector2(), new Phaser.Math.Vector2(), new Phaser.Math.Vector2()];

  constructor(scene: Phaser.Scene, layer: Phaser.GameObjects.Layer) {
    this.dim = scene.add.graphics();
    // (the bands are convex quads: fastShapes records them as two triangles instead of an earcut path each frame)
    this.g = fastShapes(scene.add.graphics());
    this.lines = fastShapes(scene.add.graphics().setBlendMode(Phaser.BlendModes.ADD));
    this.echo = scene.add.image(0, 0, '__WHITE').setOrigin(0.5, 1).setVisible(false);
    this.sprite = scene.add.image(0, 0, '__WHITE').setOrigin(0.5, 1).setVisible(false);
    this.top = fastShapes(scene.add.graphics().setBlendMode(Phaser.BlendModes.ADD));
    this.shadow = scene.add.bitmapText(0, 0, PIXEL_FONT, '').setOrigin(0.5).setVisible(false);
    this.name = scene.add.bitmapText(0, 0, PIXEL_FONT, '').setOrigin(0.5).setVisible(false);
    this.tag = scene.add.bitmapText(0, 0, PIXEL_FONT, 'ULTIMATE').setOrigin(0.5).setVisible(false);
    layer.add([this.dim, this.g, this.lines, this.echo, this.sprite, this.top, this.shadow, this.name, this.tag]);
  }

  /** `side`: which way the fighter faces (the band sweeps that way). */
  play(data: CharacterData, moveName: string, side: number, skin = data.id): void {
    this.t = 0;
    this.dir = side >= 0 ? 1 : -1;
    this.color = parseInt(data.sprite.placeholder.accent.slice(1), 16);
    this.emblem = data.id in EMBLEMS ? data.id : '';
    this.k = uiTexK(data);
    const frame = animFrameIndex(data, 'idle', 0);
    this.sprite.setTexture(fighterTextureKey(skin), frame).setFlipX(this.dir < 0).setTint(0xffffff);
    this.echo.setTexture(fighterTextureKey(skin), frame).setFlipX(this.dir < 0);
    const up = moveName.toUpperCase();
    this.name.setText(up);
    this.shadow.setText(up);
  }

  update(dt: number, w: number, h: number, u: number): void {
    this.t += dt;
    const g = this.g;
    const l = this.lines;
    const tp = this.top;
    g.clear();
    l.clear();
    tp.clear();
    this.dim.clear();
    const on = this.t < LIFE;
    for (const o of [this.sprite, this.echo, this.name, this.shadow, this.tag]) o.setVisible(on);
    if (!on) return;
    const p = this.t / LIFE;
    const soft = settings.reduceFlashes ? 0.5 : 1;
    // open: snaps open with a slight overshoot; close: the band pinches shut to a line in the last 15%
    const o = Math.min(1, p / 0.12);
    const open = o < 1 ? 1 - Math.pow(1 - o, 3) * 1 + Math.sin(o * Math.PI) * 0.12 : 1;
    const close = p > 0.85 ? Math.max(0, 1 - (p - 0.85) / 0.15) : 1;
    const fade = p > 0.88 ? Math.max(0, 1 - (p - 0.88) / 0.12) : 1;
    const cy = h * 0.42;
    const bh = h * 0.26 * open * (0.08 + 0.92 * close);
    const slant = h * 0.08;
    const dir = this.dir;
    // the arena dims behind the band
    this.dim.fillStyle(0x05040c, 0.38 * Math.min(1, p / 0.08) * fade).fillRect(0, 0, w, h);
    const q = this.quad;
    const band = (gr: Phaser.GameObjects.Graphics, half: number, col: number, a: number, off = 0): void => {
      if (a <= 0.004 || half <= 0) return;
      gr.fillStyle(col, a);
      q[0].set(0, cy + off - half + slant);
      q[1].set(w, cy + off - half - slant);
      q[2].set(w, cy + off + half - slant);
      q[3].set(0, cy + off + half + slant);
      gr.fillPoints(q, true);
    };
    /** y of the band's slanted centre line at screen x. */
    const yAt = (x: number): number => cy + slant * (1 - (2 * x) / w);
    const deep = darken(this.color, 0.35);
    const hot = lift(this.color, 0.55);
    // backing, body (a gradient faked by three nested bands) and a dark inner window for the portrait to stand in
    band(g, bh / 2 + 6 * u, 0x0a0816, 0.92 * fade);
    band(g, bh / 2, deep, 0.95 * fade);
    band(g, bh / 2 * 0.82, this.color, 0.65 * soft * fade);
    band(g, bh / 2 * 0.5, lift(this.color, 0.2), 0.35 * soft * fade);
    // diagonal stripes scrolling with the sweep (additive)
    const stripeW = 18 * u;
    const step = 46 * u;
    const scroll = ((this.t * 420 * u * dir) % step + step) % step;
    for (let x = -step * 2 + scroll; x < w + step * 2; x += step) {
      const y0 = yAt(x) - bh / 2;
      const y1 = yAt(x) + bh / 2;
      const lean = bh * 0.55;
      l.fillStyle(0xffffff, 0.07 * fade * soft);
      q[0].set(x, y1);
      q[1].set(x + lean, y0);
      q[2].set(x + lean + stripeW, y0);
      q[3].set(x + stripeW, y1);
      l.fillPoints(q, true);
    }
    // bright rules on both edges, and a thin second rule a little outside them
    const rule = (off: number, thick: number, col: number, a: number): void => band(l, thick / 2, col, a * fade * soft, off);
    rule(-bh / 2, 3 * u, 0xffffff, 0.95);
    rule(bh / 2, 3 * u, 0xffffff, 0.95);
    rule(-bh / 2 - 7 * u, 1.5 * u, hot, 0.8);
    rule(bh / 2 + 7 * u, 1.5 * u, hot, 0.8);
    // speed lines streaming against the sweep
    for (let i = 0; i < 18; i++) {
      const yy = cy + (((i * 37) % 100) / 100) * bh - bh / 2;
      const len = w * (0.12 + ((i * 53) % 40) / 100);
      const x = ((((i * 0.137 + this.t * 2.8 * dir) % 1) + 1) % 1) * (w + len) - len;
      l.lineStyle(Math.max(1, u * (i % 4 === 0 ? 2 : 1)), i % 3 === 0 ? hot : 0xffffff, 0.45 * fade * soft);
      l.lineBetween(x, yy - slant * ((x / w) * 2 - 1), x + len, yy - slant * (((x + len) / w) * 2 - 1));
    }
    // the fighter pushes through, a coloured echo trailing behind it
    const slide = dir > 0 ? Phaser.Math.Linear(w * 0.16, w * 0.29, Math.pow(p, 0.7)) : Phaser.Math.Linear(w * 0.84, w * 0.71, Math.pow(p, 0.7));
    const sc = ((h * 0.26 * 1.75) / 64) * (1 + 0.06 * p);
    const feet = yAt(slide) + bh * 0.62;
    this.sprite.setScale(sc * this.k).setPosition(slide, feet).setAlpha(fade);
    // the sprite is cropped by nothing: as the band pinches shut it shrinks with it
    if (close < 1) this.sprite.setScale(sc * this.k * (0.3 + 0.7 * close));
    this.echo
      .setScale(this.sprite.scaleX * 1.08, this.sprite.scaleY * 1.08)
      .setPosition(slide - dir * (10 + 16 * Math.min(1, p / 0.2)) * u, feet + 2 * u)
      .setTintFill(darken(this.color, 0.22))
      .setAlpha(0.85 * fade);
    // the band opens on a white flash
    if (p < 0.1) band(tp, bh / 2 + 6 * u, 0xffffff, 0.85 * (1 - p / 0.1) * soft);
    // a glint sweeps across the band once
    if (p > 0.16 && p < 0.5) {
      const gp = (p - 0.16) / 0.34;
      const gx = dir > 0 ? -w * 0.2 + gp * w * 1.4 : w * 1.2 - gp * w * 1.4;
      const gw = 40 * u;
      const y0 = yAt(gx) - bh / 2;
      const y1 = yAt(gx) + bh / 2;
      tp.fillStyle(0xffffff, 0.35 * soft * fade);
      q[0].set(gx - gw, y1);
      q[1].set(gx - gw + bh * 0.55, y0);
      q[2].set(gx + bh * 0.55, y0);
      q[3].set(gx, y1);
      tp.fillPoints(q, true);
    }
    // the ultimate's signature emblem stamps down at the far end of the band (pops in big, then turns slowly)
    if (this.emblem) {
      const ex = dir > 0 ? w * 0.9 : w * 0.1;
      const pop = 1 + Math.max(0, 1 - p / 0.14) * 0.9;
      this.drawEmblem(l, ex, yAt(ex), bh * 0.36 * pop * (0.3 + 0.7 * close), this.t, fade * soft * Math.min(1, p / 0.05), hot);
    }
    // the name slams in (with a drop shadow), the ULTIMATE tag above it
    const slam = 1 + Math.max(0, 1 - p / 0.12) * 0.8;
    this.name.setScale(1);
    const tw = Math.max(1, this.name.getTextBounds().local.width);
    const fit = Math.min(u * 3.6, (w * 0.5) / tw);
    // the slam-in overshoot stays on screen: a long name near the edge is nudged inwards while it is oversized. The clamp
    // takes in everything drawn right of the text (its drop shadow) and the drift after the slam, so neither the name nor
    // its shadow is ever cut off at the right edge, on the first frames (largest) or the last (furthest drifted)
    const half = (tw * fit * slam) / 2;
    const sh = 2 * u * Math.max(1, fit / u);
    const drift = Math.max(0, (p - 0.12) * 14 * u * dir); // keeps creeping with the sweep after the slam
    const lo = Math.min(w / 2, half + 4 * u);
    const hi = Math.max(w / 2, w - half - sh - 4 * u);
    const nx = Phaser.Math.Clamp((dir > 0 ? w * 0.63 : w * 0.37) + drift, lo, hi);
    const ny = yAt(nx) + bh * 0.08;
    this.name.setScale(fit * slam).setPosition(Math.round(nx), Math.round(ny)).setTint(0xffffff).setAlpha(fade);
    this.shadow.setScale(fit * slam).setPosition(Math.round(nx + sh), Math.round(ny + sh)).setTint(deep).setAlpha(0.95 * fade);
    const tagIn = Math.min(1, Math.max(0, (p - 0.06) / 0.1));
    this.tag
      .setScale(Math.max(1, fit * 0.42))
      .setPosition(Phaser.Math.Clamp(nx - dir * (1 - tagIn) * 40 * u, 0, w), ny - (fit * slam * 10) / 2 - 6 * u)
      .setTint(hot)
      .setAlpha(tagIn * fade);
    if (close < 1) {
      this.name.setScale(fit * slam, fit * slam * close);
      this.shadow.setScale(fit * slam, fit * slam * close);
      this.tag.setAlpha(tagIn * fade * close);
    }
  }

  /**
   * A fighter's ultimate emblem at (x, y), radius r, additive (`t`: seconds since the cut-in opened): Havoc's target
   * reticle with a radar sweep, Agni's sun, Nova's three elements, Gizmo's gear, the Overseer's eye.
   */
  private drawEmblem(gr: Phaser.GameObjects.Graphics, x: number, y: number, r: number, t: number, a: number, hot: number): void {
    if (a <= 0.01 || r <= 1) return;
    const lw = Math.max(1, r * 0.07);
    switch (EMBLEMS[this.emblem]) {
      case 'reticle': {
        gr.lineStyle(lw, 0xffffff, 0.85 * a).strokeCircle(x, y, r);
        gr.lineStyle(lw * 0.6, 0xff4a3a, 0.8 * a).strokeCircle(x, y, r * 0.62);
        for (let i = 0; i < 4; i++) {
          const ang = (i * Math.PI) / 2;
          gr.lineStyle(lw, 0xffffff, 0.9 * a).lineBetween(x + Math.cos(ang) * r * 0.35, y + Math.sin(ang) * r * 0.35, x + Math.cos(ang) * r * 1.2, y + Math.sin(ang) * r * 1.2);
        }
        // the radar sweep: a wedge turning, trailing two fainter ones
        for (let k = 0; k < 3; k++) {
          const ang = t * 5 - k * 0.22;
          gr.fillStyle(0xff6a4a, (0.4 - k * 0.12) * a).fillTriangle(x, y, x + Math.cos(ang) * r, y + Math.sin(ang) * r, x + Math.cos(ang - 0.22) * r, y + Math.sin(ang - 0.22) * r);
        }
        gr.fillStyle(0xff3a2a, (Math.floor(t * 8) % 2 ? 1 : 0.3) * a).fillCircle(x + r * 0.3, y - r * 0.2, lw * 1.4);
        break;
      }
      case 'sun': {
        for (let i = 0; i < 12; i++) {
          const ang = t * 0.9 + (i / 12) * Math.PI * 2;
          const len = r * (i % 2 ? 1.05 : 1.3);
          gr.fillStyle(i % 2 ? 0xffd04a : 0xff8a2a, 0.75 * a).fillTriangle(x + Math.cos(ang - 0.13) * r * 0.55, y + Math.sin(ang - 0.13) * r * 0.55, x + Math.cos(ang + 0.13) * r * 0.55, y + Math.sin(ang + 0.13) * r * 0.55, x + Math.cos(ang) * len, y + Math.sin(ang) * len);
        }
        gr.fillStyle(0xff9a2a, 0.6 * a).fillCircle(x, y, r * 0.58);
        gr.fillStyle(0xfff4c8, 0.85 * a).fillCircle(x, y, r * 0.38);
        break;
      }
      case 'elements': {
        const cols = [0xff7a2a, 0x8fe6ff, 0xffee55];
        gr.lineStyle(lw * 0.7, 0xffffff, 0.6 * a).strokeCircle(x, y, r);
        for (let i = 0; i < 3; i++) {
          const ang = t * 2.2 + (i * Math.PI * 2) / 3 - Math.PI / 2;
          const j = (i + 1) % 3;
          const ang2 = t * 2.2 + (j * Math.PI * 2) / 3 - Math.PI / 2;
          gr.lineStyle(lw * 0.7, cols[i], 0.7 * a).lineBetween(x + Math.cos(ang) * r * 0.8, y + Math.sin(ang) * r * 0.8, x + Math.cos(ang2) * r * 0.8, y + Math.sin(ang2) * r * 0.8);
          gr.fillStyle(cols[i], 0.75 * a).fillCircle(x + Math.cos(ang) * r * 0.8, y + Math.sin(ang) * r * 0.8, r * 0.24);
          gr.fillStyle(0xffffff, 0.9 * a).fillCircle(x + Math.cos(ang) * r * 0.8, y + Math.sin(ang) * r * 0.8, r * 0.1);
        }
        gr.fillStyle(0xffffff, 0.7 * a).fillCircle(x, y, r * 0.16);
        break;
      }
      case 'gear': {
        const q = this.quad;
        for (let i = 0; i < 8; i++) {
          const ang = -t * 1.6 + (i / 8) * Math.PI * 2;
          const c = Math.cos(ang);
          const sn = Math.sin(ang);
          const hw = r * 0.16;
          q[0].set(x + c * r * 0.7 - sn * hw, y + sn * r * 0.7 + c * hw);
          q[1].set(x + c * r * 1.1 - sn * hw, y + sn * r * 1.1 + c * hw);
          q[2].set(x + c * r * 1.1 + sn * hw, y + sn * r * 1.1 - c * hw);
          q[3].set(x + c * r * 0.7 + sn * hw, y + sn * r * 0.7 - c * hw);
          gr.fillStyle(0xbfeaff, 0.7 * a).fillPoints(q, true);
        }
        gr.lineStyle(r * 0.22, 0x7fe8ff, 0.7 * a).strokeCircle(x, y, r * 0.72);
        gr.lineStyle(lw, 0xffffff, 0.85 * a).strokeCircle(x, y, r * 0.32);
        break;
      }
      case 'eye': {
        const open = 0.35 + 0.25 * Math.min(1, t * 3);
        gr.lineStyle(lw, 0xffffff, 0.85 * a);
        gr.beginPath();
        gr.arc(x, y + r * (1 - open) * 1.6, r * 1.15, Math.PI * 1.22, Math.PI * 1.78);
        gr.strokePath();
        gr.beginPath();
        gr.arc(x, y - r * (1 - open) * 1.6, r * 1.15, Math.PI * 0.22, Math.PI * 0.78);
        gr.strokePath();
        gr.fillStyle(hot, 0.6 * a).fillCircle(x, y, r * 0.42);
        gr.fillStyle(0xffffff, 0.9 * a).fillCircle(x + Math.sin(t * 3) * r * 0.08, y, r * 0.18);
        for (let i = 0; i < 8; i++) {
          const ang = (i / 8) * Math.PI * 2 + t * 0.6;
          gr.lineStyle(lw * 0.6, hot, 0.6 * a).lineBetween(x + Math.cos(ang) * r * 1.2, y + Math.sin(ang) * r * 0.9, x + Math.cos(ang) * r * 1.45, y + Math.sin(ang) * r * 1.1);
        }
        break;
      }
    }
  }
}
