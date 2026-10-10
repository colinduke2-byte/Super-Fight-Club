import Phaser from 'phaser';
import { PIXEL_FONT } from '../art/pixelFont';
import type { MenuEvent } from '../input/menuInput';
import { session } from '../game/session';
import { COLORS, MenuList, MenuScene, text } from '../ui/menuKit';

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

/** Versus rules: number of players, stocks or timed, then on to character select. */
export class VersusSetupScene extends MenuScene {
  private list!: MenuList;
  private title!: Phaser.GameObjects.BitmapText;
  private hint!: Phaser.GameObjects.BitmapText;

  constructor() {
    super('VersusSetup');
  }

  protected build(): void {
    this.title = this.add.bitmapText(0, 0, PIXEL_FONT, 'VERSUS SETUP').setOrigin(0.5).setTint(COLORS.title);
    this.ui.add(this.title);
    const r = session.rules;
    const timed = (): boolean => r.mode === 'time';
    this.list = new MenuList(this, this.ui, [
      { label: 'PLAYERS', value: () => String(session.playerCount), onLeft: () => (session.playerCount = clamp(session.playerCount - 1, 2, 4)), onRight: () => (session.playerCount = clamp(session.playerCount + 1, 2, 4)) },
      { label: 'RULES', value: () => (timed() ? 'TIMED' : 'STOCKS'), onLeft: () => (r.mode = timed() ? 'stock' : 'time'), onRight: () => (r.mode = timed() ? 'stock' : 'time'), onConfirm: () => (r.mode = timed() ? 'stock' : 'time') },
      {
        label: () => (timed() ? 'TIME LIMIT' : 'STOCKS'),
        value: () => (timed() ? `${Math.round(r.timeSec / 60)} MIN` : String(r.stocks)),
        onLeft: () => (timed() ? (r.timeSec = clamp(r.timeSec - 60, 60, 480)) : (r.stocks = clamp(r.stocks - 1, 1, 5))),
        onRight: () => (timed() ? (r.timeSec = clamp(r.timeSec + 60, 60, 480)) : (r.stocks = clamp(r.stocks + 1, 1, 5))),
      },
      { label: 'CHOOSE FIGHTERS', onConfirm: () => this.next() },
      { label: 'BACK', onConfirm: () => this.go('ModeSelect') },
    ]);
    this.hint = text(this, this.ui, 'LEFT/RIGHT: CHANGE   J / ENTER: SELECT   K / ESC: BACK', COLORS.dim).setOrigin(0.5);
  }

  private next(): void {
    session.mode = 'versus';
    this.go('CharacterSelect');
  }

  protected override layoutUi(w: number, h: number, u: number): void {
    this.title.setScale(u * 4).setPosition(w / 2, h * 0.14);
    this.list.layout(w / 2, h * 0.3, u, 190);
    this.hint.setScale(u).setPosition(w / 2, h - 10 * u);
  }

  protected override tick(time: number): void {
    this.list.update(time);
  }

  protected onEvent(e: MenuEvent): void {
    if (this.list.handle(e)) return;
    if (e.action === 'back') this.go('ModeSelect');
  }
}
