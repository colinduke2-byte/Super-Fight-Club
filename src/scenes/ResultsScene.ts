import Phaser from 'phaser';
import { PIXEL_FONT } from '../art/pixelFont';
import { CHARACTERS } from '../characters';
import { session } from '../game/session';
import type { MenuEvent } from '../input/menuInput';
import { COLORS, MenuList, MenuScene, text } from '../ui/menuKit';

/** After a match: winner banner, per-player stats, and what to do next. */
export class ResultsScene extends MenuScene {
  private list!: MenuList;
  private title!: Phaser.GameObjects.BitmapText;
  private rows: Phaser.GameObjects.BitmapText[] = [];
  private head!: Phaser.GameObjects.BitmapText;

  constructor() {
    super('Results');
  }

  protected build(): void {
    const r = session.lastResult;
    const winner = r ? r.winner : -1;
    const label = !r ? 'MATCH OVER' : winner < 0 ? 'DRAW' : `P${winner + 1} WINS`;
    this.title = this.add.bitmapText(0, 0, PIXEL_FONT, label).setOrigin(0.5).setTint(winner >= 0 ? COLORS.p[winner % 4] : COLORS.title);
    this.ui.add(this.title);
    this.head = text(this, this.ui, 'PLAYER      FIGHTER    KOS  FALLS  DAMAGE  STOCKS', COLORS.dim);
    if (r) {
      const sorted = [...r.players].sort((a, b) => a.placement - b.placement);
      for (const p of sorted) {
        const name = CHARACTERS[p.character]?.name ?? p.character;
        const who = `${p.placement}. P${p.index + 1}${p.type === 'cpu' ? ' CPU' : ''}`;
        const line = `${who.padEnd(11)} ${name.padEnd(10)} ${String(p.kos).padStart(3)}  ${String(p.falls).padStart(5)}  ${String(Math.round(p.damageDealt)).padStart(6)}  ${String(p.stocks).padStart(6)}`;
        this.rows.push(text(this, this.ui, line, p.index === winner ? COLORS.hot : COLORS.p[p.index % 4]));
      }
    }
    const arcade = session.mode === 'arcade';
    this.list = new MenuList(this, this.ui, [
      { label: 'REMATCH', onConfirm: () => this.go('Match') },
      ...(session.mode === 'versus' ? [{ label: 'STAGE SELECT', onConfirm: () => this.go('StageSelect') }] : []),
      { label: arcade ? 'LADDER MAP' : 'CHARACTER SELECT', onConfirm: () => this.go(arcade ? 'LadderMap' : 'CharacterSelect') },
      { label: 'MAIN MENU', onConfirm: () => this.go('ModeSelect') },
    ]);
  }

  protected override layoutUi(w: number, h: number, u: number): void {
    this.title.setScale(u * 5).setPosition(w / 2, h * 0.14);
    this.head.setScale(u * 1.2).setPosition(w / 2 - 110 * u * 1.2, h * 0.3);
    this.rows.forEach((r, i) => r.setScale(u * 1.2).setPosition(w / 2 - 110 * u * 1.2, h * 0.3 + (14 + i * 12) * u));
    this.list.layout(w / 2, h * 0.62, u, 120);
  }

  protected override tick(time: number): void {
    this.list.update(time);
  }

  protected onEvent(e: MenuEvent): void {
    this.list.handle(e);
  }
}
