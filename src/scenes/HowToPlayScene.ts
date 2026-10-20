import Phaser from 'phaser';
import { fighterAnimKey, fighterTextureKey, uiTexK } from '../art/proceduralFighter';
import { PIXEL_FONT, up } from '../art/pixelFont';
import { CHARACTER_LIST } from '../characters';
import { menuInput, type MenuEvent } from '../input/menuInput';
import { promptSerial } from '../input/prompts';
import { howToPlayPages, type HowToPage } from '../game/howToPlay';
import { COLORS, MenuScene, drawPanel, pointerDevice, pointerXY, text, textPx, type MenuBackdrop } from '../ui/menuKit';

/**
 * Paged guide to the controls and mechanics, from the goal of a match to advanced tech. The controls page names the keys,
 * buttons or touch controls of the device in use. Pages turn with left / right, the mouse wheel, the arrows in the header
 * and the page dots.
 */
export class HowToPlayScene extends MenuScene {
  private title!: Phaser.GameObjects.BitmapText;
  private tab!: Phaser.GameObjects.BitmapText;
  /** The header's page arrows (click / tap targets at both ends). */
  private arrows: Phaser.GameObjects.BitmapText[] = [];
  private keys: Phaser.GameObjects.BitmapText[] = [];
  private descs: Phaser.GameObjects.BitmapText[] = [];
  private hint!: Phaser.GameObjects.BitmapText;
  private panel!: Phaser.GameObjects.Graphics;
  private sprite!: Phaser.GameObjects.Sprite;
  private page = 0;
  private poseIdx = 0;
  private poseAt = 0;
  private box = { x: 0, y: 0, w: 0, h: 0, demoX: 0, floorY: 0, k: 1, demoW: 0 };
  private back = 'ModeSelect';
  /** The pages for the device in use (rebuilt when it changes). */
  private pages: HowToPage[] = howToPlayPages();
  private serial = -1;
  /** Page dots (hit boxes, screen pixels). */
  private dots: { x: number; y: number; s: number }[] = [];

  /** Touch: pages turn by tapping the header arrows and dots (no on-screen pad over the page). */
  protected override touchPad = 'none' as const;

  constructor() {
    super('HowToPlay');
  }

  init(data: { back?: string; page?: number }): void {
    this.back = data?.back ?? 'ModeSelect';
    this.pages = howToPlayPages();
    this.page = Math.max(0, Math.min(this.pages.length - 1, data?.page ?? 0));
  }

  protected build(): void {
    // a fresh set of texts every visit (the old ones went with the last visit's display list)
    this.keys = [];
    this.descs = [];
    this.serial = promptSerial();
    this.title = this.add.bitmapText(0, 0, PIXEL_FONT, 'HOW TO PLAY').setOrigin(0.5).setTint(COLORS.title);
    this.ui.add(this.title);
    this.panel = this.add.graphics();
    this.ui.add(this.panel);
    this.tab = text(this, this.ui, '', COLORS.hot).setOrigin(0.5);
    this.arrows = ['<', '>'].map((a) => text(this, this.ui, a, COLORS.hot).setOrigin(0.5));
    const most = Math.max(8, ...this.pages.map((p) => p.rows.length));
    for (let i = 0; i < most; i++) {
      this.keys.push(text(this, this.ui, '', COLORS.hot));
      this.descs.push(text(this, this.ui, '', COLORS.text));
    }
    this.sprite = this.add.sprite(0, 0, fighterTextureKey(CHARACTER_LIST[0].id), 0).setOrigin(0.5, 1);
    this.ui.add(this.sprite);
    this.hint = text(this, this.ui, '', COLORS.dim).setOrigin(0.5);
    this.bindFooter(this.hint, [['leftright', 'PAGE'], ['back', 'BACK']]);
    this.input.on(Phaser.Input.Events.POINTER_DOWN, (ptr: Phaser.Input.Pointer) => this.onPointer(ptr));
    this.showPage();
  }

  /** The header band and the page dots take taps (the touch pad lets them through). */
  protected override tapTargetAt(x: number, y: number): boolean {
    const { x: bx, y: by, w, h } = this.box;
    return x >= bx && x <= bx + w && ((y >= by - 4 * this.u && y <= by + 26 * this.u) || (y >= by + h - 12 * this.u && y <= by + h));
  }

  /** Clicks / taps: the header's left and right ends turn the page, a page dot jumps to its page. */
  private onPointer(ptr: Phaser.Input.Pointer): void {
    if (ptr.rightButtonDown()) return;
    const q = pointerXY(this, ptr);
    const { x, y, w } = this.box;
    const u = this.u;
    const dot = this.dots.findIndex((d) => Math.abs(q.x - d.x) <= d.s && Math.abs(q.y - d.y) <= d.s);
    if (dot >= 0) {
      if (dot !== this.page) {
        this.page = dot;
        this.showPage();
      }
      return;
    }
    // the header band (with a finger's margin): its left third pages back, its right third forward
    if (q.y < y - 4 * u || q.y > y + 26 * u || q.x < x || q.x > x + w) return;
    if (q.x < x + w / 3) menuInput.inject('left', pointerDevice(ptr));
    else if (q.x > x + (w * 2) / 3) menuInput.inject('right', pointerDevice(ptr));
  }

  private showPage(): void {
    const p = this.pages[this.page];
    this.tab.setText(up(`${this.page + 1}/${this.pages.length}  ${p.title}`));
    this.keys.forEach((t, i) => t.setText(up(p.rows[i]?.[0] ?? '')).setVisible(i < p.rows.length));
    this.descs.forEach((t, i) => t.setText(up(p.rows[i]?.[1] ?? '')).setVisible(i < p.rows.length));
    this.poseIdx = 0;
    this.poseAt = -1;
    this.relayoutPage();
  }

  protected override layoutUi(w: number, h: number, u: number): void {
    this.title.setScale(Math.min(u * 4, (w * 0.9) / Math.max(1, textPx(this.title)))).setPosition(w / 2, h * 0.1);
    const footTop = this.placeFooter(this.hint);
    // wide windows widen the panel and give the extra room to the demo fighter's alcove
    const wide = Math.max(1, Math.min(1.45, w / h / 1.78));
    const bw = Math.min(w - 12 * u, 520 * u * wide);
    const bx = (w - bw) / 2;
    const by = this.title.y + this.title.displayHeight / 2 + 8 * u;
    const bh = footTop - 6 * u - by;
    const roomForDemo = w > h * 1.2;
    const demoW = roomForDemo ? 90 * u + Math.max(0, bw - 520 * u) * 0.8 : 0;
    this.box = { x: bx, y: by, w: bw, h: bh, demoX: bx + bw - demoW / 2, floorY: by + bh - 14 * u, k: roomForDemo ? 1 : 0, demoW };
    this.relayoutPage();
  }

  /**
   * Each row: the input as a heading (larger, gold, with a bullet), what it does in body text directly under it,
   * left edges aligned. Rows share the panel height evenly with a faint rule between them. Body text uses a
   * whole-pixel scale when it fits (crisp glyphs), fractional only when it must shrink; headings are 1.5x the body.
   */
  private relayoutPage(): void {
    if (!this.keys.length) return;
    const u = this.u;
    const { x, y, w, h } = this.box;
    const p = this.pages[this.page];
    const demoW = this.box.demoW;
    this.tab.setScale(Math.min(u * 1.8, (w - 64 * u) / Math.max(1, textPx(this.tab)))).setPosition(x + w / 2, y + 11 * u);
    this.arrows[0].setScale(u * 1.8).setPosition(x + 14 * u, y + 11 * u);
    this.arrows[1].setScale(u * 1.8).setPosition(x + w - 14 * u, y + 11 * u);
    const tx = x + 16 * u;
    const inner = w - demoW - 26 * u;
    const rows = p.rows.length;
    const top = y + 30 * u;
    const rowH = (y + h - 14 * u - top) / rows;
    const widestDesc = Math.max(1, ...p.rows.map((_, i) => textPx(this.descs[i])));
    const widestKey = Math.max(1, ...p.rows.map((_, i) => textPx(this.keys[i])));
    // a row is a heading (7 * ks) + gap (4 * bs) + body (7 * bs), with ks = 1.5 * bs
    const fit = Math.min(inner / widestDesc, (rowH * 0.86) / 21.5);
    const bs = fit >= u ? u : fit;
    const ks = Math.min(bs * 1.5, inner / widestKey);
    const block = 7 * ks + 4 * bs + 7 * bs;
    this.rowTops = [];
    p.rows.forEach((_, i) => {
      const ry = top + i * rowH + Math.max(0, (rowH - block) / 2);
      this.rowTops.push(top + i * rowH);
      this.keys[i].setScale(ks).setPosition(tx, ry);
      this.descs[i].setScale(bs).setPosition(tx, ry + 7 * ks + 4 * bs);
    });
    this.bullet = { x: x + 7 * u, size: Math.max(3, Math.round(3 * bs)), ks, rowH };
    this.sprite.setVisible(!!this.box.k);
    this.drawPanel();
  }

  private rowTops: number[] = [];
  private bullet = { x: 0, size: 2, ks: 1, rowH: 0 };

  private drawPanel(): void {
    const g = this.panel;
    const u = this.u;
    const { x, y, w, h } = this.box;
    const p = this.pages[this.page];
    g.clear();
    drawPanel(g, x, y, w, h, u, 0.92);
    // header band behind the page title
    g.fillStyle(0x1c1840, 1).fillRect(x + u, y + u, w - 2 * u, 21 * u);
    g.fillStyle(COLORS.title, 0.7).fillRect(x + 6 * u, y + 22 * u, w - 12 * u, u);
    // bullets beside each heading and faint rules between rows (text column only)
    const demoW = this.box.demoW;
    const b = this.bullet;
    this.rowTops.forEach((ry, i) => {
      if (i > 0) g.fillStyle(0x2a2550, 0.9).fillRect(x + 8 * u, ry, w - demoW - 16 * u, Math.max(1, u / 2));
      const key = this.keys[i];
      if (i < p.rows.length) g.fillStyle(COLORS.hot, 1).fillRect(b.x, key.y + (7 * b.ks - b.size) / 2, b.size, b.size);
    });
    // page dots (each one a click / tap target)
    const n = this.pages.length;
    this.dots = [];
    for (let i = 0; i < n; i++) {
      const dx = x + w / 2 + (i - (n - 1) / 2) * 7 * u;
      const on = i === this.page;
      g.fillStyle(on ? COLORS.hot : 0x5a5680, 1).fillRect(dx - (on ? 1.5 : 1) * u, y + h - 7 * u - (on ? 0.5 : 0) * u, u * (on ? 3 : 2), u * (on ? 3 : 2));
      this.dots.push({ x: dx, y: y + h - 6 * u, s: 3.5 * u });
    }
    // the header's arrows: lit plates at both ends so they read as buttons
    g.fillStyle(COLORS.hot, 0.14).fillRect(x + u, y + u, 26 * u, 21 * u).fillRect(x + w - 27 * u, y + u, 26 * u, 21 * u);
    if (this.box.k) {
      const fx = this.box.demoX;
      const fy = this.box.floorY;
      // the demo stands in its own alcove, split from the text by a vertical rule
      g.fillStyle(0x2a2550, 0.9).fillRect(x + w - demoW, y + 28 * u, Math.max(1, u / 2), h - 42 * u);
      g.fillStyle(0x2a2450, 0.9).fillEllipse(fx, fy, 40 * u, 7 * u);
      g.fillStyle(COLORS.accent, 0.05).fillEllipse(fx, fy - 26 * u, 56 * u, 70 * u);
    }
  }

  protected override backdrop(): MenuBackdrop {
    return { planet: null, tint: 0xd4f4ec };
  }

  protected override tick(time: number): void {
    // the controls page follows the device in use
    if (promptSerial() !== this.serial) {
      this.serial = promptSerial();
      const title = this.pages[this.page]?.title;
      this.pages = howToPlayPages();
      const same = this.pages.findIndex((pg) => pg.title === title);
      if (same >= 0) this.page = same;
      this.page = Math.min(this.page, this.pages.length - 1);
      this.showPage();
    }
    if (!this.box.k) return;
    const [id, poses] = this.pages[this.page].demo;
    const c = CHARACTER_LIST.find((ch) => ch.id === id) ?? CHARACTER_LIST[0];
    if (this.poseAt < 0 || time - this.poseAt > 1.3) {
      this.poseAt = time;
      const pose = poses[this.poseIdx++ % poses.length];
      const key = this.anims.exists(fighterAnimKey(c.id, pose)) ? fighterAnimKey(c.id, pose) : fighterAnimKey(c.id, 'idle');
      const loops = pose === 'idle' || pose === 'run' || pose === 'dash' || pose === 'fall' || pose === 'walk' || pose === 'glide';
      this.sprite.setTexture(fighterTextureKey(c.id), 0);
      this.sprite.play(loops ? key : { key, frameRate: 10, repeat: 0 });
    }
    const sc = Math.min(this.u * 1.6 * Math.max(1, this.box.demoW / (90 * this.u)) ** 0.5, (this.box.h * 0.5) / 64);
    this.sprite.setScale(sc * uiTexK(c)).setPosition(this.box.demoX, this.box.floorY);
  }

  protected onEvent(e: MenuEvent): void {
    // left / right, confirm, and the mouse wheel (sent as up / down) turn the page
    if (e.action === 'left' || e.action === 'right' || e.action === 'confirm' || e.action === 'up' || e.action === 'down') {
      const d = e.action === 'left' || e.action === 'up' ? -1 : 1;
      this.page = (this.page + d + this.pages.length) % this.pages.length;
      this.showPage();
    } else if (e.action === 'back') this.go(this.back);
  }
}
