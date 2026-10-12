import Phaser from 'phaser';
import { fighterTextureKey, animFrameIndex, portraitCrop, portraitK } from '../art/proceduralFighter';
import { PIXEL_FONT, up } from '../art/pixelFont';
import type { CharacterData } from '../engine/types';

const MAX_PIPS = 5;
/** Status icon colours in the order burn, slow, freeze, stun. */
const STATUS_COLORS = [0xff8a30, 0x8aa0ff, 0x9fe9ff, 0xffff60];
const PLAYER_COLORS = [0x4aa3ff, 0xff6a5a, 0x5fe08a, 0xffd04a];

/** One fighter's plate: portrait, name, damage percent (colour + pop on hit), stock icons. */
export class FighterHud {
  private readonly panel: Phaser.GameObjects.Image;
  private readonly accent: Phaser.GameObjects.Image;
  private readonly portrait: Phaser.GameObjects.Image;
  private readonly name: Phaser.GameObjects.BitmapText;
  private readonly percent: Phaser.GameObjects.BitmapText;
  private readonly sub: Phaser.GameObjects.BitmapText;
  private readonly meter: Phaser.GameObjects.Image;
  private readonly seam: Phaser.GameObjects.Image;
  private readonly seamGlow: Phaser.GameObjects.Image;
  private readonly hudDef: CharacterData['hud'];
  private readonly pips: Phaser.GameObjects.BitmapText;
  private readonly marks: Phaser.GameObjects.Image[] = [];
  private readonly statusIcons: Phaser.GameObjects.Image[] = [];
  private lastDamage = 0;
  /** Index into hud.colors (set by the scene each frame). */
  colorIndex = 0;
  private pop = 0;
  private u = 3;
  private texK = 1;
  private crop: [number, number, number, number] = [6, 0, 40, 40];

  constructor(
    scene: Phaser.Scene,
    layer: Phaser.GameObjects.Layer,
    data: CharacterData,
    label: string,
    index: number,
  ) {
    const key = fighterTextureKey(data.id);
    const frame = animFrameIndex(data, 'idle', 0);
    this.panel = scene.add.image(0, 0, 'hud-panel').setOrigin(0.5, 1);
    this.accent = scene.add.image(0, 0, 'px').setOrigin(0, 0).setTint(PLAYER_COLORS[index % 4]);
    this.portrait = scene.add.image(0, 0, key, frame).setOrigin(0, 0).setCrop(...portraitCrop(data));
    this.crop = portraitCrop(data);
    this.texK = portraitK(data);
    this.name = scene.add.bitmapText(0, 0, PIXEL_FONT, up(label)).setTint(PLAYER_COLORS[index % 4]);
    this.percent = scene.add.bitmapText(0, 0, PIXEL_FONT, '0%').setOrigin(0, 0);
    this.sub = scene.add.bitmapText(0, 0, PIXEL_FONT, '').setTint(0x9a96d8);
    this.hudDef = data.hud;
    this.meter = scene.add.image(0, 0, 'px').setOrigin(0, 0).setTint(0x34d6d0);
    this.seam = scene.add.image(0, 0, 'px').setOrigin(0, 0).setVisible(false);
    this.seamGlow = scene.add.image(0, 0, 'px').setOrigin(0, 0).setVisible(false).setBlendMode(Phaser.BlendModes.ADD);
    this.pips = scene.add.bitmapText(0, 0, PIXEL_FONT, '').setTint(PLAYER_COLORS[index % 4]);
    layer.add([this.panel, this.accent, this.portrait, this.name, this.percent, this.sub, this.pips, this.meter, this.seam, this.seamGlow]);
    for (const _ of data.hud?.marks ?? []) {
      const m = scene.add.image(0, 0, 'px').setOrigin(0, 0).setTint(0xffffff).setAlpha(0.8);
      this.marks.push(m);
      layer.add(m);
    }
    for (let i = 0; i < STATUS_COLORS.length; i++) {
      const ic = scene.add.image(0, 0, 'px').setOrigin(0, 0).setTint(STATUS_COLORS[i]).setVisible(false);
      this.statusIcons.push(ic);
      layer.add(ic);
    }
  }

  /** `u` = device pixels per HUD art pixel (integer); (cx, bottom) = plate bottom-centre. */
  layout(cx: number, bottom: number, u: number): void {
    this.u = u;
    const left = cx - 56 * u;
    const top = bottom - 40 * u;
    this.panel.setPosition(cx, bottom).setScale(u);
    this.accent.setPosition(left + 4 * u, top + 2 * u).setScale((32 * u) / 4, (1 * u) / 4);
    // 40x40 crop of the idle frame shown at 0.8 => fills the 32x32 well; crop origin offsets the image
    const k = 0.8 * u;
    this.portrait.setScale(k * this.texK).setPosition(left + 4 * u - this.crop[0] * k * this.texK, top + 4 * u - this.crop[1] * k * this.texK);
    this.name.setPosition(left + 41 * u, top + 8 * u).setScale(u);
    this.percent.setPosition(left + 41 * u, top + 16 * u).setScale(u * 2);
    this.sub.setPosition(left + 78 * u, top + 8 * u).setScale(u);
    this.pips.setScale(u).setPosition(left + 78 * u, top + 8 * u);
    this.meter.setPosition(left + 41 * u, top + 3 * u);
    this.seam.setPosition(left + 40 * u, top + 35 * u);
    this.seamGlow.setPosition(left + 40 * u, top + 34 * u);
    const hm = this.hudDef;
    this.marks.forEach((m, i) => m.setPosition(left + 40 * u + ((68 * u) * (hm!.marks![i] ?? 0)) / hm!.max, top + 33 * u).setScale(u / 4, (4 * u) / 4));
    this.statusIcons.forEach((ic, i) => ic.setPosition(left + 78 * u + i * 7 * u, top + 22 * u).setScale((5 * u) / 4, (5 * u) / 4));
  }

  /** @param meterFrac ultimate meter 0..1 (drawn over the plate's conduit; pulses gold when full) */
  update(damage: number, stocks: number, training: boolean, out: boolean, meterFrac = 0, tick = 0, resource = 0, status?: { burn: number; slow: number; freeze: number; stun: number }): void {
    if (damage > this.lastDamage) this.pop = 1;
    this.lastDamage = damage;
    this.pop = Math.max(0, this.pop - 0.08);
    const d = Math.min(damage / 160, 1);
    // white -> yellow -> orange -> red -> deep red
    const r = 255;
    const g = Math.round(255 - 150 * Math.min(1, d * 1.6) - 60 * Math.max(0, d - 0.6));
    const b = Math.round(255 - 255 * Math.min(1, d * 3));
    this.percent.setText(up(`${Math.floor(damage)}%`));
    this.percent.setTint(Phaser.Display.Color.GetColor(r, Math.max(30, g), Math.max(30, b)));
    this.percent.setScale(this.u * 2 * (1 + this.pop * 0.25));
    this.sub.setText(training ? 'INF' : out ? 'OUT' : '');
    this.sub.setVisible(training || out);
    this.pips.setText(!training && !out ? '@'.repeat(Math.min(stocks, MAX_PIPS)).split('').join(' ') : '');
    this.portrait.setAlpha(out ? 0.35 : 1);
    // character resource seam (Heat): fills left to right, glows hot at/after the threshold
    const hd = this.hudDef;
    if (hd) {
      const frac = Math.max(0, Math.min(1, resource / hd.max));
      const hot = resource >= hd.hotAt;
      const flick = hot ? (resource >= hd.max ? 3 : 4) : 0;
      const bright = hot && ((tick >> flick) & 1) === 0;
      const col = hd.colors && hd.colorKey ? hd.colors[Math.max(0, Math.min(hd.colors.length - 1, Math.round(this.colorIndex)))] : hd.color;
      this.seam.setVisible(frac > 0).setScale(((68 * this.u) / 4) * frac, (2 * this.u) / 4).setTint(hd.colors ? col : hot ? (bright ? 0xffe9a0 : col) : 0x8a4a28);
      this.seamGlow.setVisible(hot || !!hd.colors).setScale(((68 * this.u) / 4) * frac, (4 * this.u) / 4).setTint(col).setAlpha(hd.colors ? 0.4 : bright ? 0.7 : 0.35);
    }
    if (status) {
      const t = [status.burn, status.slow, status.freeze, status.stun];
      for (let i = 0; i < this.statusIcons.length; i++) this.statusIcons[i].setVisible(t[i] > 0 && (t[i] > 40 || ((tick >> 2) & 1) === 0));
    }
    const full = meterFrac >= 1;
    this.meter.setVisible(meterFrac > 0).setScale(((66 * this.u) / 4) * meterFrac, (2 * this.u) / 4).setTint(full ? (((tick >> 3) & 1) === 0 ? 0xffd040 : 0xffffff) : 0x8ff6ee);
  }
}
