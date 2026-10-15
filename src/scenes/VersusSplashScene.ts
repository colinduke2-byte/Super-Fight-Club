import Phaser from 'phaser';
import { PIXEL_FONT, up } from '../art/pixelFont';
import { ensurePalette, fighterAnimKey, fighterTextureKey, uiTexK } from '../art/proceduralFighter';
import { characterById } from '../characters';
import { session } from '../game/session';
import type { MenuEvent } from '../input/menuInput';
import { settings } from '../settings';
import { STAGES } from '../stages';
import { COLORS, MenuScene, drawPortShape, text, textPx, type MenuBackdrop } from '../ui/menuKit';
import { stageThumb } from '../ui/stageThumb';

/** How long the splash holds before the fight starts (seconds). */
const HOLD = 2;

interface Side {
  sprite: Phaser.GameObjects.Sprite;
  name: Phaser.GameObjects.BitmapText;
  k: number;
  color: number;
  port: number;
  /** -1 left (the player), +1 right (the rivals); `rank` 0 is the main fighter on that side. */
  dir: -1 | 1;
  rank: number;
}

/**
 * The two-second VS splash before an arcade fight: the stage behind, the player on the left and the rival(s) on the
 * right sliding in under a diagonal split, their names, a big VS and the stage name. Any button skips it.
 */
export class VersusSplashScene extends MenuScene {
  private next = 'Match';
  private nextData: object | undefined;
  private sides: Side[] = [];
  private bgImg: Phaser.GameObjects.Image | null = null;
  private g!: Phaser.GameObjects.Graphics;
  private vs!: Phaser.GameObjects.BitmapText;
  private stageName!: Phaser.GameObjects.BitmapText;
  private fightNo!: Phaser.GameObjects.BitmapText;
  private done = false;
  protected override backChip = false;
  protected override tapConfirms = true;

  constructor() {
    super('VersusSplash');
  }

  init(data: { next?: string; nextData?: object; title?: string }): void {
    this.next = data?.next ?? 'Match';
    this.nextData = data?.nextData;
    this.fightTitle = data?.title ?? '';
    this.done = false;
  }

  private fightTitle = '';

  protected build(): void {
    const stage = STAGES[session.stage];
    this.bg.setTheme(stage?.background.theme);
    this.bgImg = stage ? this.add.image(0, 0, stageThumb(this, stage)).setOrigin(0.5).setTint(0x8a84a8) : null;
    if (this.bgImg) this.ui.add(this.bgImg);
    this.g = this.add.graphics();
    this.ui.add(this.g);
    this.sides = [];
    const players = session.players;
    const human = players.find((p) => p.type === 'human') ?? players[0];
    const rivals = players.filter((p) => p !== human);
    const add = (slot: (typeof players)[number] | undefined, dir: -1 | 1, rank: number): void => {
      const c = slot ? characterById(slot.character) : undefined;
      if (!slot || !c) return;
      // only an already built outfit (the ladder map requested it); otherwise the fighter's own look
      const skin = (slot.palette ?? 0) > 0 ? ensurePalette(this, c, slot.palette ?? 0) : c.id;
      if (!this.textures.exists(fighterTextureKey(skin))) return;
      const sprite = this.add.sprite(0, 0, fighterTextureKey(skin), 0).setOrigin(0.5, 1).setFlipX(dir === 1);
      sprite.play(fighterAnimKey(skin, 'idle'));
      if (rank > 0) sprite.setTint(0xb8b0d8);
      const port = slot.index % 4;
      const color = slot.boss ? 0x4ae4ff : COLORS.p[port];
      const name = text(this, this.ui, c.name.replace('The ', '').toUpperCase(), color).setOrigin(dir === -1 ? 0 : 1, 0.5);
      this.sides.push({ sprite, name, k: uiTexK(c), color, port, dir, rank });
    };
    // the rivals' back-up fighters first, so the main ones draw over them
    rivals.slice(1).forEach((r, i) => add(r, 1, i + 1));
    add(rivals[0], 1, 0);
    add(human, -1, 0);
    for (const s of this.sides) this.ui.add([s.sprite, s.name]);
    this.vs = this.add.bitmapText(0, 0, PIXEL_FONT, 'VS').setOrigin(0.5).setTint(COLORS.hot);
    this.stageName = text(this, this.ui, up(stage?.name ?? ''), COLORS.text).setOrigin(0.5);
    this.fightNo = text(this, this.ui, up(this.fightTitle), COLORS.title).setOrigin(0.5);
    this.ui.add(this.vs);
  }

  protected override backdrop(): MenuBackdrop {
    return { planet: null };
  }

  protected override layoutUi(w: number, h: number, u: number): void {
    if (this.bgImg) {
      const k = Math.max(w / this.bgImg.width, h / this.bgImg.height);
      this.bgImg.setScale(k).setPosition(w / 2, h / 2);
    }
    this.stageName.setScale(Math.min(u * 1.5, (w * 0.9) / Math.max(1, textPx(this.stageName)))).setPosition(w / 2, h - 14 * u);
    this.fightNo.setScale(Math.min(u * 1.5, (w * 0.9) / Math.max(1, textPx(this.fightNo)))).setPosition(w / 2, 12 * u);
  }

  private ease(t: number, t0: number, dur: number): number {
    if (settings.reduceMotion) return 1;
    const k = Math.max(0, Math.min(1, (t - t0) / dur));
    return 1 - Math.pow(1 - k, 3);
  }

  protected override tick(time: number): void {
    const w = this.scale.width;
    const h = this.scale.height;
    const u = this.u;
    const g = this.g.clear();
    // the split: each side's colour washes its half under a bright diagonal seam
    const e = this.ease(time, 0, 0.3);
    const left = this.sides.find((s) => s.dir === -1);
    const right = this.sides.find((s) => s.dir === 1 && s.rank === 0);
    const tilt = h * 0.18;
    const mid = w / 2;
    g.fillStyle(0x05040e, 0.45).fillRect(0, 0, w, h);
    g.fillStyle(left?.color ?? COLORS.p[0], 0.28 * e).fillPoints([new Phaser.Math.Vector2(0, 0), new Phaser.Math.Vector2(mid + tilt, 0), new Phaser.Math.Vector2(mid - tilt, h), new Phaser.Math.Vector2(0, h)], true);
    g.fillStyle(right?.color ?? COLORS.p[1], 0.28 * e).fillPoints([new Phaser.Math.Vector2(mid + tilt, 0), new Phaser.Math.Vector2(w, 0), new Phaser.Math.Vector2(w, h), new Phaser.Math.Vector2(mid - tilt, h)], true);
    g.lineStyle(Math.max(2, u * 1.5), 0xffffff, 0.9 * e).lineBetween(mid + tilt, 0, mid - tilt, h);
    // banners behind the names
    const floor = h * 0.8;
    const s = Math.max(0.6, Math.min(u * 3, (h * 0.55) / 64, (w * 0.3) / 56));
    for (const sd of this.sides) {
      const k = this.ease(time, sd.dir === -1 ? 0.05 : 0.12, 0.35);
      const back = sd.rank > 0;
      const baseX = sd.dir === -1 ? w * 0.25 : w * (back ? 0.86 - (sd.rank - 1) * 0.1 : 0.72);
      const x = baseX + sd.dir * (1 - k) * w * 0.4;
      const y = back ? floor - 14 * s : floor;
      sd.sprite.setScale(s * (back ? 0.72 : 1) * sd.k).setPosition(x, y);
      sd.name.setVisible(!back);
      if (back) continue;
      const nk = Math.min(u * 2.5, (w * 0.4) / Math.max(1, textPx(sd.name)));
      sd.name.setScale(nk);
      const ny = floor + 8 * u + (7 * nk) / 2;
      const nx = sd.dir === -1 ? 10 * u + (1 - k) * -w * 0.4 : w - 10 * u + (1 - k) * w * 0.4;
      sd.name.setPosition(nx + (settings.portShapes ? sd.dir * -8 * u : 0), ny);
      const bw = sd.name.displayWidth + 22 * u;
      const bx = sd.dir === -1 ? nx - 10 * u : nx + 10 * u - bw;
      g.fillStyle(0x0a0820, 0.85).fillRect(bx, ny - (7 * nk) / 2 - 4 * u, bw, 7 * nk + 8 * u);
      g.fillStyle(sd.color, 1).fillRect(bx, ny + (7 * nk) / 2 + 3 * u, bw, u);
      if (settings.portShapes) drawPortShape(g, sd.port, sd.dir === -1 ? nx + 4 * u : nx - 4 * u, ny, 2.5 * u, sd.color, 1, u);
      // floor glow under the fighter
      g.fillStyle(sd.color, 0.25).fillEllipse(x, y, 60 * s, 10 * s);
    }
    // VS slams in at the centre
    const ve = this.ease(time, 0.25, 0.25);
    this.vs.setScale(u * 8 * (1 + (1 - ve) * 1.5)).setAlpha(ve).setPosition(mid, h * 0.45);
    this.fightNo.setAlpha(this.ease(time, 0.2, 0.3));
    this.stageName.setAlpha(this.ease(time, 0.35, 0.3));
    g.fillStyle(0x0a0820, 0.8 * this.stageName.alpha).fillRect(w / 2 - this.stageName.displayWidth / 2 - 8 * u, this.stageName.y - this.stageName.displayHeight / 2 - 4 * u, this.stageName.displayWidth + 16 * u, this.stageName.displayHeight + 8 * u);
    if (time >= HOLD) this.finish();
  }

  private finish(): void {
    if (this.done) return;
    this.done = true;
    this.go(this.next, this.nextData);
  }

  protected onEvent(e: MenuEvent): void {
    if (e.action === 'confirm' || e.action === 'start' || e.action === 'back') this.finish();
  }
}
