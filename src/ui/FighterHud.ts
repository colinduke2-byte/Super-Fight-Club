import Phaser from 'phaser';
import { fighterTextureKey, animFrameIndex, portraitCrop, portraitK } from '../art/proceduralFighter';
import { PIXEL_FONT, up } from '../art/pixelFont';
import type { CharacterData } from '../engine/types';
import { addCanvasTexture, context2dOrBlank } from '../art/canvasTexture';
import type { BossBar } from './BossBar';
import { COLORS, drawPortShape } from './menuKit';
import { settings } from '../settings';

const MAX_PIPS = 5;
/** Stock pips text by count: spaced ("@ @ @") while three fit beside the name, packed ("@@@@@") for bigger stock counts. */
const PIPS = Array.from({ length: MAX_PIPS + 1 }, (_, n) => '@'.repeat(n).split('').join(' '));
const PIPS_PACKED = Array.from({ length: MAX_PIPS + 1 }, (_, n) => '@'.repeat(n));
/** Right edge of the readout (art px from the plate's left): pips, INF / OUT and the timed score line up on it. */
const READOUT_RIGHT = 108;

/**
 * Status badges (7x7 art px, drawn with a dark outline into one 9x9 cell each), in the order burn, slow, freeze, chill,
 * stun, soak. 'a' = main colour, 'b' = highlight.
 */
const STATUS_ICONS: { a: string; b: string; px: string[] }[] = [
  { a: '#ff7a24', b: '#ffe08a', px: ['...a...', '..aa...', '..aba..', '.aabba.', '.abbba.', '.abbba.', '..aaa..'] }, // burn: flame
  { a: '#8aa0ff', b: '#d6deff', px: ['aaaaaaa', '.abbba.', '..aba..', '...a...', '..a.a..', '.a...a.', 'aaaaaaa'] }, // slow: hourglass
  { a: '#7fd8ff', b: '#e8fbff', px: ['aaaaaaa', 'abbaaaa', 'abaaaaa', 'aaaaaaa', 'aaaaaba', 'aaaabba', 'aaaaaaa'] }, // freeze: ice block
  { a: '#bfeaff', b: '#ffffff', px: ['...b...', 'a.aba.a', '.a.b.a.', 'bbbbbbb', '.a.b.a.', 'a.aba.a', '...b...'] }, // chill: snowflake
  { a: '#ffef50', b: '#fffbd0', px: ['...a...', '..aba..', 'aaabaaa', '.abbba.', '..aaa..', '.aa.aa.', 'a.....a'] }, // stun: star
  { a: '#5ab8ff', b: '#e0f6ff', px: ['...a...', '...a...', '..aaa..', '.aaaaa.', '.baaaa.', '.bbaaa.', '..aaa..'] }, // soak: droplet
];

/** Builds the status badge sheet once ('hud-status', frames 0..5). */
function ensureStatusTexture(scene: Phaser.Scene): void {
  if (scene.textures.exists('hud-status')) return;
  const c = document.createElement('canvas');
  c.width = 9 * STATUS_ICONS.length;
  c.height = 9;
  const g = context2dOrBlank(c);
  STATUS_ICONS.forEach((ic, i) => {
    const on = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < 7 && y < 7 && ic.px[y][x] !== '.';
    g.fillStyle = '#0c0b18';
    for (let y = -1; y <= 7; y++) for (let x = -1; x <= 7; x++) if (!on(x, y) && (on(x - 1, y) || on(x + 1, y) || on(x, y - 1) || on(x, y + 1) || on(x - 1, y - 1) || on(x + 1, y + 1) || on(x - 1, y + 1) || on(x + 1, y - 1))) g.fillRect(i * 9 + 1 + x, 1 + y, 1, 1);
    for (let y = 0; y < 7; y++) for (let x = 0; x < 7; x++) {
      const ch = ic.px[y][x];
      if (ch === '.') continue;
      g.fillStyle = ch === 'b' ? ic.b : ic.a;
      g.fillRect(i * 9 + 1 + x, 1 + y, 1, 1);
    }
  });
  const tex = addCanvasTexture(scene, 'hud-status', c);
  for (let i = 0; i < STATUS_ICONS.length; i++) tex.add(i, 0, i * 9, 0, 9, 9);
}
/** One 60 Hz frame, the unit the pop / jolt decay rates were tuned in. */
const FRAME_MS = 1000 / 60;

/** One fighter's plate: portrait, name, damage percent (colour + pop on hit), stock icons. */
export class FighterHud {
  private readonly panel: Phaser.GameObjects.Image;
  private readonly accent: Phaser.GameObjects.Image;
  private readonly portrait: Phaser.GameObjects.Image;
  private readonly name: Phaser.GameObjects.BitmapText;
  private readonly percent: Phaser.GameObjects.BitmapText;
  /** Stamina mode: the small "HP" after the hit-point number (kept out of the big digits so 3-digit HP fits the plate). */
  private readonly hpTag: Phaser.GameObjects.BitmapText;
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
  /** Wall-clock time of the last update, so the pop / jolt decay at the same speed at any refresh rate. */
  private lastNow = -1;
  /** What the percent / pips texts currently show, so they are only rebuilt when it changes. */
  private shownValue = NaN;
  private shownHp = false;
  private shownPips = -1;
  /** Most stocks seen: decides spaced or packed pips for the whole match (so the spacing does not jump as stocks are lost). */
  private maxPips = 0;
  private left = 0;
  private top = 0;
  /** Timed matches: the score shown where the stock pips go (null in stock / stamina matches). */
  timedScore: number | null = null;
  private shownScore: number | null = null;
  /** Timed matches: 1 when the score just changed, decaying (the score swells and flashes). */
  private scorePop = 0;
  private u = 3;
  /** Whole-pixel scale of the small texts (u rounded down). */
  private tu = 3;
  private texK = 1;
  private crop: [number, number, number, number] = [6, 0, 40, 40];
  /** Port shape on the portrait well (PORT SHAPES setting) and the timed-score tab above the plate. */
  private readonly deco: Phaser.GameObjects.Graphics;
  private readonly ptsTag: Phaser.GameObjects.BitmapText;
  private readonly port: number;
  private readonly color: number;

  constructor(
    scene: Phaser.Scene,
    layer: Phaser.GameObjects.Layer,
    data: CharacterData,
    label: string,
    index: number,
    skin = data.id,
  ) {
    const key = fighterTextureKey(skin);
    this.port = index % 4;
    const color = (this.color = COLORS.p[this.port]);
    const frame = animFrameIndex(data, 'idle', 0);
    this.panel = scene.add.image(0, 0, 'hud-panel').setOrigin(0.5, 1);
    this.accent = scene.add.image(0, 0, 'px').setOrigin(0, 0).setTint(color);
    this.portrait = scene.add.image(0, 0, key, frame).setOrigin(0, 0).setCrop(...portraitCrop(data));
    this.crop = portraitCrop(data);
    this.texK = portraitK(data);
    this.name = scene.add.bitmapText(0, 0, PIXEL_FONT, up(label)).setTint(color);
    this.percent = scene.add.bitmapText(0, 0, PIXEL_FONT, '0%').setOrigin(0, 0);
    this.hpTag = scene.add.bitmapText(0, 0, PIXEL_FONT, 'HP').setOrigin(0, 0).setVisible(false);
    this.sub = scene.add.bitmapText(0, 0, PIXEL_FONT, '').setTint(0x9a96d8).setOrigin(1, 0);
    this.hudDef = data.hud;
    this.meter = scene.add.image(0, 0, 'px').setOrigin(0, 0).setTint(0x34d6d0);
    this.seam = scene.add.image(0, 0, 'px').setOrigin(0, 0).setVisible(false);
    this.seamGlow = scene.add.image(0, 0, 'px').setOrigin(0, 0).setVisible(false).setBlendMode(Phaser.BlendModes.ADD);
    this.pips = scene.add.bitmapText(0, 0, PIXEL_FONT, '').setTint(color).setOrigin(1, 0);
    this.deco = scene.add.graphics();
    this.ptsTag = scene.add.bitmapText(0, 0, PIXEL_FONT, 'PTS').setOrigin(1, 1).setTint(0xc8c4ec).setVisible(false);
    layer.add([this.panel, this.accent, this.portrait, this.name, this.percent, this.hpTag, this.sub, this.deco, this.pips, this.ptsTag, this.meter, this.seam, this.seamGlow]);
    for (const _ of data.hud?.marks ?? []) {
      const m = scene.add.image(0, 0, 'px').setOrigin(0, 0).setTint(0xffffff).setAlpha(0.8);
      this.marks.push(m);
      layer.add(m);
    }
    ensureStatusTexture(scene);
    for (let i = 0; i < STATUS_ICONS.length; i++) {
      const ic = scene.add.image(0, 0, 'hud-status', i).setOrigin(0, 0).setVisible(false);
      this.statusIcons.push(ic);
      layer.add(ic);
    }
  }

  /** Boss fights: the boss's readout is a BossBar across the top instead of this plate (which stays hidden). */
  private bossBar: BossBar | null = null;
  useBossBar(bar: BossBar): void {
    this.bossBar = bar;
    for (const o of [this.panel, this.accent, this.portrait, this.name, this.percent, this.hpTag, this.sub, this.pips, this.ptsTag, this.deco, this.meter, this.seam, this.seamGlow, ...this.marks, ...this.statusIcons]) o.setVisible(false);
  }

  /**
   * `u` = device pixels per HUD art pixel (integer, or a half step when the window is too narrow for the plates at full size);
   * (cx, bottom) = plate bottom-centre. The small 1x texts and the status badges keep a whole-pixel scale either way.
   */
  layout(cx: number, bottom: number, u: number): void {
    this.u = u;
    if (this.bossBar) return this.bossBar.layout(u);
    const tu = (this.tu = Math.max(1, Math.floor(u)));
    const ty = (u - tu) * 4; // a smaller text scale stays centred on its row
    const left = cx - 56 * u;
    const top = bottom - 40 * u;
    this.left = left;
    this.top = top;
    this.panel.setPosition(cx, bottom).setScale(u);
    this.accent.setPosition(left + 4 * u, top + 2 * u).setScale((32 * u) / 4, (1 * u) / 4);
    // 40x40 crop of the idle frame shown at 0.8 => fills the 32x32 well; crop origin offsets the image
    const k = 0.8 * u;
    this.portrait.setScale(k * this.texK).setPosition(left + 4 * u - this.crop[0] * k * this.texK, top + 4 * u - this.crop[1] * k * this.texK);
    this.name.setPosition(left + 41 * u, top + 8 * u + ty).setScale(tu);
    this.percent.setPosition(left + 41 * u, top + 16 * u).setScale(u * 2);
    this.percentAt = [left + 41 * u, top + 16 * u];
    this.sub.setPosition(left + READOUT_RIGHT * u, top + 8 * u + ty).setScale(tu);
    this.pips.setScale(tu).setPosition(left + READOUT_RIGHT * u, top + 8 * u + ty);
    this.hpTag.setScale(tu);
    this.meter.setPosition(left + 41 * u, top + 3 * u);
    this.seam.setPosition(left + 40 * u, top + 35 * u);
    this.seamGlow.setPosition(left + 40 * u, top + 34 * u);
    const hm = this.hudDef;
    this.marks.forEach((m, i) => m.setPosition(left + 40 * u + ((68 * u) * (hm!.marks![i] ?? 0)) / hm!.max, top + 33 * u).setScale(u / 4, (4 * u) / 4));
    for (const ic of this.statusIcons) ic.setScale(tu);
    this.ptsTag.setScale(tu);
    this.decoKey = '';
  }

  /** What `deco` was last drawn for (redrawn only when the layout, the setting or the timed tab changes). */
  private decoKey = '';

  /** The port shape in the portrait well's top-left corner, and in timed matches the score tab above the plate's right end. */
  private drawDeco(): void {
    const timed = this.timedScore !== null;
    const key = `${this.left},${this.top},${this.u},${settings.portShapes},${timed}`;
    if (key === this.decoKey) return;
    this.decoKey = key;
    const g = this.deco.clear();
    const u = this.u;
    if (settings.portShapes) drawPortShape(g, this.port, this.left + 8 * u, this.top + 8 * u, 2.5 * u, this.color, 1, u);
    if (timed) {
      // a tab rising from the plate's top edge: the score reads big without crowding the damage digits
      const x = this.left + 62 * u;
      const w = 48 * u;
      const y = this.top - 16 * u;
      g.fillStyle(0x0a0820, 0.92).fillRect(x, y, w, 16 * u);
      g.lineStyle(u, 0x3c3478, 1).strokeRect(x - u / 2, y - u / 2, w + u, 16 * u + u);
      g.fillStyle(this.color, 1).fillRect(x, y, w, u);
    }
  }

  /** @param meterFrac ultimate meter 0..1 (drawn over the plate's conduit; pulses gold when full) */
  private jolt = 0;
  private percentAt: [number, number] = [0, 0];

  /** Stamina mode: hit points per stock (the number shows HP left instead of percent). 0 = percent. */
  hpMax = 0;

  update(damage: number, stocks: number, training: boolean, out: boolean, meterFrac = 0, tick = 0, resource = 0, status?: { burn: number; slow: number; freeze: number; stun: number; soak?: number; chill?: number }): void {
    if (this.bossBar) return this.bossBar.update(damage, stocks, tick, out, this.hpMax);
    const now = performance.now();
    const k = this.lastNow < 0 ? 1 : Math.min(4, (now - this.lastNow) / FRAME_MS); // elapsed 60 Hz frames
    this.lastNow = now;
    if (damage > this.lastDamage) {
      this.pop = 1;
      this.jolt = Math.min(1, (damage - this.lastDamage) / 14); // big hits shake the number
    }
    this.jolt = Math.max(0, this.jolt - 0.06 * k);
    this.lastDamage = damage;
    this.pop = Math.max(0, this.pop - 0.08 * k);
    const d = Math.min(damage / 160, 1);
    // white -> yellow -> orange -> red -> deep red
    const r = 255;
    const g = Math.round(255 - 150 * Math.min(1, d * 1.6) - 60 * Math.max(0, d - 0.6));
    const b = Math.round(255 - 255 * Math.min(1, d * 3));
    if (this.hpMax > 0) {
      // hit points: green while healthy, through yellow, red when nearly out (and flashing at the end)
      const left = Math.max(0, Math.ceil(this.hpMax - damage));
      const f = left / this.hpMax;
      const low = f < 0.2 && !settings.reduceFlashes && ((tick >> 4) & 1) === 0;
      if (left !== this.shownValue || !this.shownHp) {
        this.shownValue = left;
        this.shownHp = true;
        this.percent.setText(String(left));
      }
      const col = low ? 0xffffff : f > 0.5 ? 0x7affa0 : f > 0.25 ? 0xffe14a : 0xff5a4a;
      this.percent.setTint(col);
      this.hpTag.setTint(col);
    } else {
      const shown = Math.floor(damage);
      if (shown !== this.shownValue || this.shownHp) {
        this.shownValue = shown;
        this.shownHp = false;
        this.percent.setText(up(`${shown}%`));
      }
      this.percent.setTint(Phaser.Display.Color.GetColor(r, Math.max(30, g), Math.max(30, b)));
    }
    this.percent.setScale(this.u * 2 * (1 + this.pop * 0.25));
    const j = this.jolt * this.u * 2.5;
    this.percent.setPosition(this.percentAt[0] + (tick & 1 ? j : -j), this.percentAt[1] + ((tick >> 1) & 1 ? j * 0.6 : -j * 0.6));
    // "HP" sits on the digits' baseline, just after them
    this.hpTag.setVisible(this.hpMax > 0);
    if (this.hpMax > 0) this.hpTag.setPosition(this.percent.x + this.percent.width + this.u, this.percentAt[1] + 16 * this.u - 8 * this.tu);
    this.sub.setText(training ? 'INF' : out ? 'OUT' : '');
    this.sub.setVisible(training || out);
    this.drawDeco();
    this.ptsTag.setVisible(this.timedScore !== null);
    if (this.timedScore !== null) {
      // a timed match: the KO score instead of stock pips (stocks mean nothing there), big on its own tab above the plate
      const sc = this.timedScore;
      if (sc !== this.shownScore) {
        this.shownPips = -1;
        if (this.shownScore !== null) this.scorePop = 1;
        this.shownScore = sc;
        this.pips.setText(sc > 0 ? `+${sc}` : String(sc));
      }
      this.scorePop = Math.max(0, this.scorePop - 0.04 * k);
      // swells on a change, then settles; green when ahead, red when behind (the flash stays under 3 Hz)
      const flash = !settings.reduceFlashes && this.scorePop > 0.6 && ((tick >> 4) & 1) === 0;
      const u = this.u;
      const right = this.left + 108 * u;
      const base = this.top - 2 * u;
      this.ptsTag.setPosition(right, base);
      this.pips.setOrigin(1, 1).setScale(this.tu * 2 * (1 + Math.round(this.scorePop * 2) / 4)).setPosition(right - this.ptsTag.displayWidth - 2 * u, base);
      this.pips.setTint(flash ? 0xffffff : sc > 0 ? 0x7affa0 : sc < 0 ? 0xff6a5a : 0xffffff);
    } else {
      const pips = !training && !out ? Math.max(0, Math.min(stocks, MAX_PIPS)) : 0;
      if (pips !== this.shownPips) {
        this.shownPips = pips;
        this.maxPips = Math.max(this.maxPips, pips);
        this.pips.setText((this.maxPips > 3 ? PIPS_PACKED : PIPS)[pips]);
      }
    }
    this.portrait.setAlpha(out ? 0.35 : 1);
    // character resource seam (Heat): fills left to right, glows hot at/after the threshold
    const hd = this.hudDef;
    if (hd) {
      const frac = Math.max(0, Math.min(1, resource / hd.max));
      const hot = resource >= hd.hotAt;
      // the hot seam blinks under 3 Hz (steady with REDUCE FLASHES)
      const flick = hot ? (resource >= hd.max ? 4 : 5) : 0;
      const bright = hot && (settings.reduceFlashes || ((tick >> flick) & 1) === 0);
      const col = hd.colors && hd.colorKey ? hd.colors[Math.max(0, Math.min(hd.colors.length - 1, Math.round(this.colorIndex)))] : hd.color;
      this.seam.setVisible(frac > 0).setScale(((68 * this.u) / 4) * frac, (2 * this.u) / 4).setTint(hd.colors ? col : hot ? (bright ? 0xffe9a0 : col) : 0x8a4a28);
      this.seamGlow.setVisible(hot || !!hd.colors).setScale(((68 * this.u) / 4) * frac, (4 * this.u) / 4).setTint(col).setAlpha(hd.colors ? 0.4 : bright ? 0.7 : 0.35);
    }
    if (status) {
      // active statuses line up along the bottom of the portrait well (a second row above it if there are more than four)
      const blinkOn = settings.reduceFlashes || ((tick >> 4) & 1) === 0;
      const u = this.u;
      let n = 0;
      for (let i = 0; i < this.statusIcons.length; i++) {
        const t = i === 0 ? status.burn : i === 1 ? status.slow : i === 2 ? status.freeze : i === 3 ? (status.chill ? 41 : 0) : i === 4 ? status.stun : (status.soak ?? 0);
        const ic = this.statusIcons[i];
        if (t <= 0) {
          ic.setVisible(false);
          continue;
        }
        ic.setPosition(this.left + (3 + (n % 4) * 8) * u, this.top + (28 - Math.floor(n / 4) * 8) * u).setVisible(t > 40 || blinkOn);
        n++;
      }
    }
    const full = meterFrac >= 1;
    this.meter.setVisible(meterFrac > 0).setScale(((66 * this.u) / 4) * meterFrac, (2 * this.u) / 4).setTint(full ? (settings.reduceFlashes || ((tick >> 4) & 1) === 0 ? 0xffd040 : 0xffffff) : 0x8ff6ee);
  }
}
