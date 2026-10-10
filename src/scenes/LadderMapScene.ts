import Phaser from 'phaser';
import { PIXEL_FONT } from '../art/pixelFont';
import { CHARACTER_LIST } from '../characters';
import { session } from '../game/session';
import type { MenuEvent } from '../input/menuInput';
import { COLORS, MenuList, MenuScene, text } from '../ui/menuKit';

/** Placeholder ladder map; the full story cards / boss arrive in Phase 11. */
export class LadderMapScene extends MenuScene {
  private list!: MenuList;
  private title!: Phaser.GameObjects.BitmapText;
  private info!: Phaser.GameObjects.BitmapText;

  constructor() {
    super('LadderMap');
  }

  protected build(): void {
    this.title = this.add.bitmapText(0, 0, PIXEL_FONT, 'ARCADE LADDER').setOrigin(0.5).setTint(COLORS.title);
    this.ui.add(this.title);
    this.info = text(this, this.ui, '', COLORS.text).setOrigin(0.5);
    this.list = new MenuList(this, this.ui, [
      { label: 'FIGHT', onConfirm: () => this.fight() },
      { label: 'QUIT', onConfirm: () => this.go('ModeSelect') },
    ]);
  }

  private fight(): void {
    const me = session.players[0];
    const opp = CHARACTER_LIST[Math.floor(Math.random() * CHARACTER_LIST.length)].id;
    session.players = [me, { index: 1, type: 'cpu', device: null, character: opp, cpuLevel: 1 }];
    session.stage = 'sandbox';
    this.go('Match');
  }

  protected override layoutUi(w: number, h: number, u: number): void {
    this.title.setScale(u * 4).setPosition(w / 2, h * 0.12);
    this.info.setScale(u * 1.5).setPosition(w / 2, h * 0.3);
    this.list.layout(w / 2, h * 0.5, u, 90);
  }

  protected override tick(time: number): void {
    this.list.update(time);
    this.info.setText(`FIGHT ${(session.ladder?.stage ?? 0) + 1} OF 6`);
  }

  protected onEvent(e: MenuEvent): void {
    if (this.list.handle(e)) return;
    if (e.action === 'back') this.go('ModeSelect');
  }
}
