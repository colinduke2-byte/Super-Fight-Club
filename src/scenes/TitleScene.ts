import Phaser from 'phaser';
import { fighterAnimKey, fighterTextureKey } from '../art/proceduralFighter';
import { CHARACTER_LIST } from '../characters';
import { inputManager } from '../input/inputManager';
import type { MenuEvent } from '../input/menuInput';
import { sfx } from '../audio/sfx';
import { COLORS, MenuScene, text } from '../ui/menuKit';
import { PIXEL_FONT } from '../art/pixelFont';

/** Title screen: logo, the roster idling in a row, "press any button". */
export class TitleScene extends MenuScene {
  private logo1!: Phaser.GameObjects.BitmapText;
  private logo2!: Phaser.GameObjects.BitmapText;
  private sub!: Phaser.GameObjects.BitmapText;
  private prompt!: Phaser.GameObjects.BitmapText;
  private footer!: Phaser.GameObjects.BitmapText;
  private sprites: Phaser.GameObjects.Sprite[] = [];

  constructor() {
    super('Title');
  }

  protected build(): void {
    this.sprites = [];
    sfx.arm();
    inputManager.init();
    this.logo1 = this.add.bitmapText(0, 0, PIXEL_FONT, 'SUPER').setOrigin(0.5).setTint(COLORS.title);
    this.logo2 = this.add.bitmapText(0, 0, PIXEL_FONT, 'FIGHT CLUB').setOrigin(0.5).setTint(0xff6a8a);
    this.ui.add([this.logo1, this.logo2]);
    this.sub = text(this, this.ui, 'SCI-FI FANTASY PLATFORM BRAWLER', COLORS.accent).setOrigin(0.5);
    this.prompt = text(this, this.ui, 'PRESS ANY BUTTON', COLORS.text).setOrigin(0.5);
    this.footer = text(this, this.ui, '', COLORS.dim).setOrigin(0.5);
    for (const c of CHARACTER_LIST) {
      const s = this.add.sprite(0, 0, fighterTextureKey(c.id), 0).setOrigin(0.5, 1);
      s.play(fighterAnimKey(c.id, 'idle'));
      this.ui.add(s);
      this.sprites.push(s);
    }
  }

  protected override layoutUi(w: number, h: number, u: number): void {
    this.logo1.setScale(u * 5).setPosition(w / 2, h * 0.16);
    this.logo2.setScale(u * 6).setPosition(w / 2, h * 0.16 + 14 * u * 5);
    this.sub.setScale(u * 1.5).setPosition(w / 2, h * 0.16 + 14 * u * 5 + 20 * u);
    this.prompt.setScale(u * 2).setPosition(w / 2, h * 0.86);
    this.footer.setScale(u).setPosition(w / 2, h - 10 * u);
    const n = this.sprites.length;
    this.sprites.forEach((s, i) => s.setScale(u * 1.8).setPosition((w * (i + 1)) / (n + 1), h * 0.74));
  }

  protected override tick(time: number): void {
    this.prompt.setAlpha(((time * 2) | 0) % 2 === 0 ? 1 : 0.25);
    this.logo1.setTint(((time * 3) | 0) % 2 === 0 ? COLORS.title : 0xffffff);
    const pads = inputManager.padList.length;
    this.footer.setText(`${pads} CONTROLLER${pads === 1 ? '' : 'S'} CONNECTED  |  KEYBOARD: WASD+J  OR  ARROWS+ENTER`);
    this.sprites.forEach((s, i) => s.setY(s.y + Math.sin(time * 2 + i) * 0.05));
  }

  protected onEvent(e: MenuEvent): void {
    if (e.action === 'confirm' || e.action === 'start' || e.action === 'alt') this.go('ModeSelect');
  }
}
