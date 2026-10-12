import Phaser from 'phaser';
import { animFrameIndex, fighterAnimKey, fighterTextureKey, uiTexK } from '../art/proceduralFighter';
import { PIXEL_FONT, up } from '../art/pixelFont';
import { CARD_H, CARD_W, drawStoryArt } from '../art/storyArt';
import { characterById } from '../characters';
import { music } from '../audio/music';
import type { StoryCard } from '../game/story';
import type { MenuEvent } from '../input/menuInput';
import { COLORS, MenuScene, text, textPx } from '../ui/menuKit';

const CPS = 38; // typewriter characters per second

/** Plays a sequence of pixel-art story cards (typewriter captions), then moves on to `next`. */
export class StoryScene extends MenuScene {
  private cards: StoryCard[] = [];
  private next = 'LadderMap';
  private nextData: object | undefined;
  private index = 0;
  private shownAt = 0;
  private title!: Phaser.GameObjects.BitmapText;
  private caption!: Phaser.GameObjects.BitmapText;
  private hint!: Phaser.GameObjects.BitmapText;
  private vs!: Phaser.GameObjects.BitmapText;
  private art!: Phaser.GameObjects.Graphics;
  private frame!: Phaser.GameObjects.Graphics;
  private left: Phaser.GameObjects.Sprite | null = null;
  private right: Phaser.GameObjects.Sprite | null = null;
  private box = { x: 0, y: 0, s: 3 };

  constructor() {
    super('Story');
  }

  init(data: { cards: StoryCard[]; next?: string; nextData?: object }): void {
    this.cards = data.cards;
    this.next = data.next ?? 'LadderMap';
    this.nextData = data.nextData;
    this.index = 0;
  }

  protected build(): void {
    this.art = this.add.graphics();
    this.frame = this.add.graphics();
    this.ui.add([this.art, this.frame]);
    this.title = this.add.bitmapText(0, 0, PIXEL_FONT, '').setOrigin(0.5).setTint(COLORS.title);
    this.vs = this.add.bitmapText(0, 0, PIXEL_FONT, 'VS').setOrigin(0.5).setTint(0xffffff).setVisible(false);
    this.ui.add([this.title, this.vs]);
    this.caption = this.add.bitmapText(0, 0, PIXEL_FONT, '').setOrigin(0.5, 0).setTint(COLORS.text).setCenterAlign();
    this.ui.add(this.caption);
    this.hint = text(this, this.ui, 'J / ENTER: CONTINUE   K / ESC: SKIP ALL', COLORS.dim).setOrigin(0.5);
    this.showCard();
  }

  private spriteFor(id: string | undefined, flip: boolean): Phaser.GameObjects.Sprite | null {
    if (!id) return null;
    const data = characterById(id);
    if (!data) return null;
    const s = this.add.sprite(0, 0, fighterTextureKey(id), animFrameIndex(data, 'idle', 0)).setOrigin(0.5, 1).setFlipX(flip);
    s.setData('k', uiTexK(data));
    s.play(fighterAnimKey(id, 'idle'));
    this.ui.add(s);
    return s;
  }

  private showCard(): void {
    const c = this.cards[this.index];
    this.left?.destroy();
    this.right?.destroy();
    this.left = this.spriteFor(c.left, false);
    this.right = this.spriteFor(c.right, true);
    this.title.setText(up(c.title));
    this.caption.setText('');
    this.vs.setVisible(c.art === 'duel');
    this.shownAt = performance.now();
    music.play(c.art === 'boss' ? 'boss' : 'menu');
    this.relayoutCard();
  }

  private fullText(): string {
    return up(this.cards[this.index].lines.join('\n'));
  }

  private relayoutCard(): void {
    const c = this.cards[this.index];
    const { x, y, s } = this.box;
    const u = this.u;
    const w = this.scale.width;
    this.title.setScale(u * 2.4).setPosition(w / 2, y - 14 * u);
    this.caption.setScale(u * 1.6).setPosition(w / 2, y + CARD_H * s + 8 * u);
    this.vs.setScale(u * 5).setPosition(x + (CARD_W / 2) * s, y + (CARD_H / 2) * s);
    // sprites: art px = s; a 64px frame covers 64*k art pixels
    const base = y + 80 * s;
    if (c.art === 'boss') {
      this.left?.setScale(s * 0.8 * ((this.left?.getData('k') as number | undefined) ?? 0.4)).setPosition(x + 34 * s, base + 4 * s);
      this.right?.setScale(s * 1.3 * ((this.right?.getData('k') as number | undefined) ?? 0.4)).setPosition(x + 96 * s, base + 4 * s).setFlipX(true);
      this.left?.setFlipX(false);
    } else if (c.art === 'duel') {
      this.left?.setScale(s * 1.05 * ((this.left?.getData('k') as number | undefined) ?? 0.4)).setPosition(x + 38 * s, base);
      this.right?.setScale(s * 1.05 * ((this.right?.getData('k') as number | undefined) ?? 0.4)).setPosition(x + 122 * s, base);
    } else {
      this.left?.setScale(s * 1.1 * ((this.left?.getData('k') as number | undefined) ?? 0.4)).setPosition(x + (c.art === 'victory' ? 80 : 58) * s, base - (c.art === 'arena' ? 2 : 0) * s);
    }
  }

  protected override layoutUi(w: number, h: number, u: number): void {
    const s = Math.max(2, Math.floor(Math.min((w * 0.82) / CARD_W, (h * 0.58) / CARD_H)));
    this.box = { x: Math.round((w - CARD_W * s) / 2), y: Math.round(h * 0.14), s };
    this.hint.setScale(Math.min(u, (w * 0.97) / Math.max(1, textPx(this.hint)))).setPosition(w / 2, h - 10 * u);
    if (this.cards.length) this.relayoutCard();
  }

  protected override tick(time: number): void {
    const c = this.cards[this.index];
    if (!c) return;
    const { x, y, s } = this.box;
    drawStoryArt(this.art, c.art, x, y, s, time, 0x4aa3ff, 0xff6a5a);
    const f = this.frame;
    f.clear();
    f.lineStyle(Math.max(2, s), 0xffd46a, 1).strokeRect(x - s, y - s, CARD_W * s + 2 * s, CARD_H * s + 2 * s);
    f.lineStyle(s, 0x1a1030, 1).strokeRect(x - 2 * s, y - 2 * s, CARD_W * s + 4 * s, CARD_H * s + 4 * s);
    const n = Math.floor(((performance.now() - this.shownAt) / 1000) * CPS);
    const full = this.fullText();
    this.caption.setText(full.slice(0, n));
  }

  private advance(): void {
    const full = this.fullText();
    const n = Math.floor(((performance.now() - this.shownAt) / 1000) * CPS);
    if (n < full.length) {
      this.shownAt = performance.now() - (full.length / CPS) * 1000 - 50; // finish the caption
      return;
    }
    this.index++;
    if (this.index >= this.cards.length) this.go(this.next, this.nextData);
    else this.showCard();
  }

  protected onEvent(e: MenuEvent): void {
    if (e.action === 'confirm' || e.action === 'start') this.advance();
    else if (e.action === 'back') this.go(this.next, this.nextData);
  }
}
