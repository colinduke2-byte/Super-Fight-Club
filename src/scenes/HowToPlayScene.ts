import Phaser from 'phaser';
import { fighterAnimKey, fighterTextureKey, uiTexK } from '../art/proceduralFighter';
import { PIXEL_FONT, up } from '../art/pixelFont';
import { CHARACTER_LIST } from '../characters';
import type { MenuEvent } from '../input/menuInput';
import { HOW_TO_PLAY } from '../game/howToPlay';
import { COLORS, MenuScene, text, textPx } from '../ui/menuKit';

/** Paged guide to the controls and mechanics, from the goal of a match to advanced tech. */
export class HowToPlayScene extends MenuScene {
  private title!: Phaser.GameObjects.BitmapText;
  private tab!: Phaser.GameObjects.BitmapText;
  private keys: Phaser.GameObjects.BitmapText[] = [];
  private descs: Phaser.GameObjects.BitmapText[] = [];
  private hint!: Phaser.GameObjects.BitmapText;
  private panel!: Phaser.GameObjects.Graphics;
  private sprite!: Phaser.GameObjects.Sprite;
  private page = 0;
  private poseIdx = 0;
  private poseAt = 0;
  private box = { x: 0, y: 0, w: 0, h: 0, demoX: 0, floorY: 0, k: 1 };
  private back = 'ModeSelect';

  constructor() {
    super('HowToPlay');
  }

  init(data: { back?: string; page?: number }): void {
    this.back = data?.back ?? 'ModeSelect';
    this.page = Math.max(0, Math.min(HOW_TO_PLAY.length - 1, data?.page ?? 0));
  }

  protected build(): void {
    this.title = this.add.bitmapText(0, 0, PIXEL_FONT, 'HOW TO PLAY').setOrigin(0.5).setTint(COLORS.title);
    this.ui.add(this.title);
    this.panel = this.add.graphics();
    this.ui.add(this.panel);
    this.tab = text(this, this.ui, '', COLORS.hot).setOrigin(0.5);
    const most = Math.max(...HOW_TO_PLAY.map((p) => p.rows.length));
    for (let i = 0; i < most; i++) {
      this.keys.push(text(this, this.ui, '', COLORS.hot));
      this.descs.push(text(this, this.ui, '', COLORS.text));
    }
    this.sprite = this.add.sprite(0, 0, fighterTextureKey(CHARACTER_LIST[0].id), 0).setOrigin(0.5, 1);
    this.ui.add(this.sprite);
    this.hint = text(this, this.ui, 'LEFT/RIGHT: PAGE   K / ESC: BACK', COLORS.dim).setOrigin(0.5);
    this.showPage();
  }

  private showPage(): void {
    const p = HOW_TO_PLAY[this.page];
    this.tab.setText(up(`<  ${this.page + 1}/${HOW_TO_PLAY.length}  ${p.title}  >`));
    this.keys.forEach((t, i) => t.setText(up(p.rows[i]?.[0] ?? '')).setVisible(i < p.rows.length));
    this.descs.forEach((t, i) => t.setText(up(p.rows[i]?.[1] ?? '')).setVisible(i < p.rows.length));
    this.poseIdx = 0;
    this.poseAt = -1;
    this.relayoutPage();
  }

  protected override layoutUi(w: number, h: number, u: number): void {
    this.title.setScale(Math.min(u * 4, (w * 0.9) / Math.max(1, textPx(this.title)))).setPosition(w / 2, h * 0.1);
    this.hint.setScale(Math.min(u, (w * 0.97) / Math.max(1, textPx(this.hint)))).setPosition(w / 2, h - 10 * u);
    const bw = Math.min(w - 8 * u, 440 * u);
    const bx = (w - bw) / 2;
    const by = h * 0.18;
    const bh = h - 20 * u - by;
    const roomForDemo = w > h * 1.2;
    this.box = { x: bx, y: by, w: bw, h: bh, demoX: bx + bw - 60 * u, floorY: by + bh - 8 * u, k: roomForDemo ? 1 : 0 };
    this.relayoutPage();
  }

  /** Each row: the input on one line, what it does indented below; sized so the longest line fits the text column. */
  private relayoutPage(): void {
    if (!this.keys.length) return;
    const u = this.u;
    const { x, y, w, h } = this.box;
    const p = HOW_TO_PLAY[this.page];
    const demoW = this.box.k ? 120 * u : 0;
    this.tab.setScale(u * 1.5).setPosition(x + w / 2, y + 9 * u);
    const widest = Math.max(...p.rows.map((_, i) => Math.max(textPx(this.keys[i]), textPx(this.descs[i]) + 8)));
    const inner = w - demoW - 16 * u;
    const rows = p.rows.length;
    const top = y + 24 * u;
    const rowH = (y + h - 10 * u - top) / rows;
    // whole-pixel scale when it fits (crisp glyphs), fractional only when it must shrink
    const fit = Math.min(inner / widest, (rowH * 0.92) / 17);
    const s = fit >= u ? u : fit;
    p.rows.forEach((_, i) => {
      const ry = top + i * rowH;
      this.keys[i].setScale(s).setPosition(x + 10 * u, ry);
      this.descs[i].setScale(s).setPosition(x + 10 * u + 8 * s, ry + 9 * s);
    });
    this.sprite.setVisible(!!this.box.k);
    this.drawPanel();
  }

  private drawPanel(): void {
    const g = this.panel;
    const u = this.u;
    const { x, y, w, h } = this.box;
    g.clear();
    g.fillStyle(0x07061a, 0.84).fillRect(x, y, w, h);
    g.lineStyle(u, 0x3c3478, 0.9).strokeRect(x - u / 2, y - u / 2, w + u, h + u);
    g.fillStyle(COLORS.title, 0.85);
    for (const [cx, cy] of [[x - u, y - u], [x + w - u * 2, y - u], [x - u, y + h - u * 2], [x + w - u * 2, y + h - u * 2]]) g.fillRect(cx, cy, u * 3, u * 3);
    g.fillStyle(0x3c3478, 0.8).fillRect(x + 6 * u, y + 17 * u, w - 12 * u, u);
    // page dots
    const n = HOW_TO_PLAY.length;
    for (let i = 0; i < n; i++) {
      g.fillStyle(i === this.page ? COLORS.hot : 0x5a5680, 1).fillRect(x + w / 2 + (i - (n - 1) / 2) * 6 * u - u, y + h - 5 * u, u * 2, u * 2);
    }
    if (this.box.k) {
      const fx = this.box.demoX;
      const fy = this.box.floorY;
      g.fillStyle(0x2a2450, 0.9).fillEllipse(fx, fy, 40 * u, 7 * u);
      g.fillStyle(COLORS.accent, 0.05).fillEllipse(fx, fy - 26 * u, 56 * u, 70 * u);
    }
  }

  protected override tick(time: number): void {
    if (!this.box.k) return;
    const [id, poses] = HOW_TO_PLAY[this.page].demo;
    const c = CHARACTER_LIST.find((ch) => ch.id === id) ?? CHARACTER_LIST[0];
    if (this.poseAt < 0 || time - this.poseAt > 1.3) {
      this.poseAt = time;
      const pose = poses[this.poseIdx++ % poses.length];
      const key = this.anims.exists(fighterAnimKey(c.id, pose)) ? fighterAnimKey(c.id, pose) : fighterAnimKey(c.id, 'idle');
      const loops = pose === 'idle' || pose === 'run' || pose === 'dash' || pose === 'fall' || pose === 'walk' || pose === 'glide';
      this.sprite.setTexture(fighterTextureKey(c.id), 0);
      this.sprite.play(loops ? key : { key, frameRate: 10, repeat: 0 });
    }
    const sc = Math.min(this.u * 1.6, (this.box.h * 0.5) / 64);
    this.sprite.setScale(sc * uiTexK(c)).setPosition(this.box.demoX, this.box.floorY);
  }

  protected onEvent(e: MenuEvent): void {
    if (e.action === 'left' || e.action === 'right' || e.action === 'confirm') {
      const d = e.action === 'left' ? -1 : 1;
      this.page = (this.page + d + HOW_TO_PLAY.length) % HOW_TO_PLAY.length;
      this.showPage();
    } else if (e.action === 'back') this.go(this.back);
  }
}
