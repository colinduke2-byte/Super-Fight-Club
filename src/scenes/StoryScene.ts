import Phaser from 'phaser';
import { animFrameIndex, ensureFightersReady, ensurePalette, fighterAnimKey, fighterTextureKey, uiTexK } from '../art/proceduralFighter';
import { paletteCount } from '../art/palettes';
import { session } from '../game/session';
import { PIXEL_FONT, up } from '../art/pixelFont';
import { CARD_H, CARD_W, drawStoryArt } from '../art/storyArt';
import { characterById } from '../characters';
import { music } from '../audio/music';
import { announcer } from '../audio/announcer';
import type { StoryCard } from '../game/story';
import type { MenuEvent } from '../input/menuInput';
import { COLORS, MenuScene, drawPanel, playerColors, text, textPx, type MenuBackdrop } from '../ui/menuKit';
import { playResultPose } from '../ui/FighterView';
import { stageThumb } from '../ui/stageThumb';
import { STAGES } from '../stages';

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
  /** The brawl card's back-up rivals, drawn behind the main one. */
  private extras: Phaser.GameObjects.Sprite[] = [];
  /** The second fighter on the player's side (an ally, the co-op partner). */
  private mate: Phaser.GameObjects.Sprite | null = null;
  /** Composed cards: the stage's picture filling the card. */
  private stageImg!: Phaser.GameObjects.Image;
  private box = { x: 0, y: 0, s: 3 };
  /** Plate behind the caption. */
  private plateBox = { x: 0, y: 0, w: 0, h: 0 };

  /** A click or tap anywhere turns the card (the BACK chip still skips them all). */
  protected override tapConfirms = true;

  constructor() {
    super('Story');
  }

  init(data: { cards: StoryCard[]; next?: string; nextData?: object }): void {
    this.cards = data?.cards ?? [];
    this.next = data?.next ?? 'LadderMap';
    this.nextData = data?.nextData;
    this.index = 0;
  }

  protected build(): void {
    this.art = this.add.graphics();
    this.stageImg = this.add.image(0, 0, '__DEFAULT').setOrigin(0, 0).setVisible(false);
    this.frame = this.add.graphics();
    this.ui.add([this.art, this.stageImg, this.frame]);
    this.left = null;
    this.right = null;
    this.mate = null;
    this.extras = [];
    this.title = this.add.bitmapText(0, 0, PIXEL_FONT, '').setOrigin(0.5).setTint(COLORS.title);
    this.vs = this.add.bitmapText(0, 0, PIXEL_FONT, 'VS').setOrigin(0.5).setTint(0xffffff).setVisible(false);
    this.ui.add([this.title, this.vs]);
    this.caption = this.add.bitmapText(0, 0, PIXEL_FONT, '').setOrigin(0.5, 0).setTint(COLORS.text).setCenterAlign().setLineSpacing(4);
    this.ui.add(this.caption);
    this.hint = text(this, this.ui, '', COLORS.hint).setOrigin(0.5);
    this.bindFooter(this.hint, [['confirm', 'CONTINUE'], ['back', 'SKIP ALL']]);
    this.showCard();
  }

  private spriteFor(id: string | undefined, flip: boolean, palette = 0): Phaser.GameObjects.Sprite | null {
    if (!id) return null;
    const data = characterById(id);
    if (!data) return null;
    // a fighter whose sheet is still building in the background (the boss): never fall back to a main-thread stand-in
    // sheet (that would register the old look); show it as soon as its real sheet lands
    if (!data.sprite.sheetUrl && !this.textures.exists(fighterTextureKey(data.id))) {
      const card = this.index;
      const visit = this.visitId;
      void ensureFightersReady(this, [data]).then(() => {
        if (!this.isVisit(visit) || this.index !== card) return;
        const s = this.spriteFor(id, flip, palette);
        if (!s) return;
        if (flip) {
          this.right?.destroy();
          this.right = s;
        } else {
          this.left?.destroy();
          this.left = s;
        }
        this.relayoutCard();
      });
      return null;
    }
    const skin = palette > 0 ? ensurePalette(this, data, palette) : id;
    const s = this.add.sprite(0, 0, fighterTextureKey(skin), animFrameIndex(data, 'idle', 0)).setOrigin(0.5, 1).setFlipX(flip);
    s.setData('k', uiTexK(data));
    s.play(fighterAnimKey(skin, 'idle'));
    this.ui.add(s);
    return s;
  }

  private showCard(): void {
    const c = this.cards[this.index];
    if (!c) return;
    this.left?.destroy();
    this.right?.destroy();
    this.mate?.destroy();
    this.mate = null;
    this.extras.forEach((e) => e.destroy());
    this.extras = [];
    // a composed card: the stage's own picture behind the fighters (a slightly darkened backdrop so they read over it)
    const stage = c.stage ? STAGES[c.stage] : undefined;
    if (stage) this.stageImg.setTexture(stageThumb(this, stage, 480, 270)).setTint(0xb8b4d0).setVisible(true);
    else this.stageImg.setVisible(false);
    // the player in their chosen look, the rival in the one it rolled (a mirror match never shows two identical fighters)
    const lp = session.arcadeHuman?.palette ?? 0;
    let rp = c.rightPalette ?? 0;
    if (c.right && c.right === c.left && rp === lp) rp = (rp + 1) % paletteCount(c.right);
    // the partner first, a step behind the player
    if (c.leftMate && c.leftMate !== c.left) {
      const m = this.spriteFor(c.leftMate, false, session.arcadePartner?.palette ?? 0);
      if (m) this.mate = m.setTint(0xc8c2e0);
    }
    this.left = this.spriteFor(c.left, false, lp);
    if (this.left && c.pose) this.posed(this.left, c.left!, lp, c.pose);
    if (this.mate && c.pose && c.leftMate) this.posed(this.mate, c.leftMate, session.arcadePartner?.palette ?? 0, c.pose);
    // back-up rivals first so the main one draws over them
    for (const r of (c.rivals ?? []).slice(1).reverse()) {
      if (!characterById(r.character) || !this.textures.exists(fighterTextureKey(r.character))) continue;
      const e = this.spriteFor(r.character, true, r.palette ?? 0);
      if (e) this.extras.push(e.setTint(0x9a94b8));
    }
    this.right = this.spriteFor(c.right, true, rp);
    if (this.right && this.extras.length) this.ui.bringToTop(this.right);
    this.title.setText(up(c.title));
    this.caption.setText('');
    this.vs.setVisible(c.art === 'duel' && !c.calm);
    this.shownAt = performance.now();
    music.play(c.art === 'boss' ? 'boss' : 'story');
    if (c.art === 'boss') announcer.bossWarning();
    this.relayoutCard();
  }

  /** The ending's victory pose, or the game-over card's slump. */
  private posed(sprite: Phaser.GameObjects.Sprite, id: string, palette: number, pose: 'victory' | 'lose'): void {
    const data = characterById(id);
    if (!data) return;
    playResultPose(sprite, data, palette > 0 ? ensurePalette(this, data, palette) : id, pose === 'victory');
    if (pose === 'lose') sprite.setTint(0x8a84a8);
  }

  private fullText(): string {
    return up(this.cards[this.index]?.lines.join('\n') ?? '');
  }

  private relayoutCard(): void {
    const c = this.cards[this.index];
    if (!c) return;
    const { x, y, s } = this.box;
    const u = this.u;
    const w = this.scale.width;
    // the title sits clear above the card's double frame, the caption on its own plate below it
    this.title.setScale(Math.min(u * 2.4, (w * 0.94) / Math.max(1, textPx(this.title))));
    this.title.setPosition(w / 2, y - 2 * s - 6 * u - (7 * this.title.scaleY) / 2);
    const capY = y + CARD_H * s + 2 * s + 10 * u;
    // the plate is sized to the whole caption up front so it does not grow while the text types out
    this.caption.setText(this.fullText());
    const capK = Math.min(u * 1.6, (w * 0.9) / Math.max(1, textPx(this.caption)));
    this.caption.setScale(capK).setPosition(w / 2, capY);
    const capW = Math.max(CARD_W * s * 0.6, textPx(this.caption) * capK + 16 * u);
    const capH = this.caption.getTextBounds().local.height * capK + 10 * u;
    this.plateBox = { x: w / 2 - capW / 2, y: capY - 5 * u, w: capW, h: capH };
    this.caption.setText('');
    this.vs.setScale(u * 5).setPosition(x + (CARD_W / 2) * s, y + (CARD_H / 2) * s);
    // sprites: art px = s; a 64px frame covers 64*k art pixels
    const base = y + 80 * s;
    if (this.stageImg.visible) this.stageImg.setPosition(x, y).setDisplaySize(CARD_W * s, CARD_H * s);
    const kOf = (sp: Phaser.GameObjects.Sprite | null): number => (sp?.getData('k') as number | undefined) ?? 0.4;
    // the partner stands a step behind and beside the player
    if (this.mate) {
      const mx = c.art === 'boss' ? 16 : c.art === 'duel' ? 20 : c.right ? 30 : 56;
      this.mate.setScale(s * 0.9 * kOf(this.mate)).setPosition(x + mx * s, base - 3 * s).setFlipX(false);
      if (this.left) this.ui.moveBelow(this.mate, this.left);
    }
    if (c.art === 'boss') {
      this.left?.setScale(s * 0.8 * ((this.left?.getData('k') as number | undefined) ?? 0.4)).setPosition(x + 34 * s, base + 4 * s);
      // the boss towers over the player, but stays inside the card (its halo included)
      const rk = s * 1.3 * ((this.right?.getData('k') as number | undefined) ?? 0.4);
      this.right?.setScale(Math.min(rk, ((base + 4 * s - y - 3 * s) / Math.max(1, this.right.height)) * 1.08)).setPosition(x + 96 * s, base + 4 * s).setFlipX(true);
      this.left?.setFlipX(false);
    } else if (c.art === 'duel') {
      this.left?.setScale(s * 1.05 * ((this.left?.getData('k') as number | undefined) ?? 0.4)).setPosition(x + 38 * s, base);
      this.right?.setScale(s * 1.05 * ((this.right?.getData('k') as number | undefined) ?? 0.4)).setPosition(x + 122 * s, base);
      // back-up rivals step out behind the main one, a little smaller
      this.extras.forEach((e, i) => {
        const k = (e.getData('k') as number | undefined) ?? 0.4;
        e.setScale(s * 0.85 * k).setPosition(x + (122 + (i % 2 ? -1 : 1) * (18 + 6 * i)) * s, base - 3 * s);
      });
    } else if (c.right) {
      // a composed card with two fighters at peace: side by side, facing each other
      this.left?.setScale(s * 1.05 * kOf(this.left)).setPosition(x + 58 * s, base);
      this.right?.setScale(s * 1.05 * kOf(this.right)).setPosition(x + 102 * s, base);
    } else {
      this.left?.setScale(s * 1.1 * ((this.left?.getData('k') as number | undefined) ?? 0.4)).setPosition(x + (c.art === 'victory' ? (this.mate ? 92 : 80) : 58) * s, base - (c.art === 'arena' ? 2 : 0) * s);
    }
  }

  protected override layoutUi(w: number, h: number, u: number): void {
    const s = Math.max(2, Math.floor(Math.min((w * 0.82) / CARD_W, (h * 0.58) / CARD_H)));
    this.box = { x: Math.round((w - CARD_W * s) / 2), y: Math.round(h * 0.14), s };
    this.hint.setScale(Math.min(u, (w * 0.97) / Math.max(1, textPx(this.hint)))).setPosition(w / 2, h - 10 * u);
    if (this.cards.length) this.relayoutCard();
  }

  protected override backdrop(): MenuBackdrop {
    // the card is the picture: no planet peeking out behind its frame
    return { planet: null };
  }

  protected override tick(time: number): void {
    const c = this.cards[this.index];
    if (!c) return;
    const { x, y, s } = this.box;
    const pc = playerColors();
    if (this.stageImg.visible) this.art.clear();
    else drawStoryArt(this.art, c.art, x, y, s, time, pc[0], pc[1]);
    const f = this.frame;
    f.clear();
    const pb = this.plateBox;
    if (pb.w > 0) drawPanel(f, pb.x, pb.y, pb.w, pb.h, this.u, 0.9);
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
    // the last card stays the current one while the screen fades out (a resize during the fade lays it out again)
    if (this.index + 1 >= this.cards.length) {
      this.go(this.next, this.nextData);
      return;
    }
    this.index++;
    this.showCard();
  }

  protected onEvent(e: MenuEvent): void {
    if (e.action === 'confirm' || e.action === 'start') this.advance();
    else if (e.action === 'back') this.go(this.next, this.nextData);
  }
}
