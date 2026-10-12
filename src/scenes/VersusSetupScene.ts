import Phaser from 'phaser';
import { PIXEL_FONT, up } from '../art/pixelFont';
import type { MenuEvent } from '../input/menuInput';
import { session } from '../game/session';
import { COLORS, MenuList, MenuScene, text, textPx } from '../ui/menuKit';

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

/** Versus rules: number of players, stocks or timed, then on to character select. */
export class VersusSetupScene extends MenuScene {
  private list!: MenuList;
  private title!: Phaser.GameObjects.BitmapText;
  private hint!: Phaser.GameObjects.BitmapText;
  private desc!: Phaser.GameObjects.BitmapText;

  constructor() {
    super('VersusSetup');
  }

  protected build(): void {
    this.title = this.add.bitmapText(0, 0, PIXEL_FONT, 'VERSUS SETUP').setOrigin(0.5).setTint(COLORS.title);
    this.ui.add(this.title);
    const r = session.rules;
    const timed = (): boolean => r.mode === 'time';
    const MODES = ['stock', 'time', 'stamina'] as const;
    const NAMES = { stock: 'STOCKS', time: 'TIMED', stamina: 'STAMINA' };
    const cycle = (d: number) => (): void => {
      r.mode = MODES[(MODES.indexOf(r.mode) + d + MODES.length) % MODES.length];
    };
    this.list = new MenuList(this, this.ui, [
      { label: 'PLAYERS', hint: 'How many fighters. Empty slots are filled with CPUs.', value: () => String(session.playerCount), onLeft: () => (session.playerCount = clamp(session.playerCount - 1, 2, 4)), onRight: () => (session.playerCount = clamp(session.playerCount + 1, 2, 4)) },
      { label: 'RULES', hint: () => ({ stock: 'Lose all your stocks and you are out. Last one standing wins.', time: 'Most KOs when the clock runs out wins. Falling costs a point.', stamina: 'No launching for keeps: run out of HP and you are out.' })[r.mode], value: () => NAMES[r.mode], onLeft: cycle(-1), onRight: cycle(1), onConfirm: cycle(1) },
      {
        label: () => (timed() ? 'TIME LIMIT' : 'STOCKS'),
        hint: () => (timed() ? 'Length of the match.' : 'Lives each fighter starts with.'),
        value: () => (timed() ? `${Math.round(r.timeSec / 60)} MIN` : String(r.stocks)),
        onLeft: () => (timed() ? (r.timeSec = clamp(r.timeSec - 60, 60, 480)) : (r.stocks = clamp(r.stocks - 1, 1, 5))),
        onRight: () => (timed() ? (r.timeSec = clamp(r.timeSec + 60, 60, 480)) : (r.stocks = clamp(r.stocks + 1, 1, 5))),
      },
      {
        label: 'STAMINA HP',
        hint: 'Hit points in a stamina match.',
        value: () => (r.mode === 'stamina' ? String(r.staminaHp) : '-'),
        enabled: () => r.mode === 'stamina',
        onLeft: () => (r.staminaHp = clamp(r.staminaHp - 50, 50, 300)),
        onRight: () => (r.staminaHp = clamp(r.staminaHp + 50, 50, 300)),
      },
      { label: 'TEAMS', hint: 'Four players only: blue team against red, no friendly fire.', value: () => (r.teams && session.playerCount === 4 ? '2 V 2' : 'OFF'), enabled: () => session.playerCount === 4, onLeft: () => (r.teams = !r.teams), onRight: () => (r.teams = !r.teams), onConfirm: () => (r.teams = !r.teams) },
      { label: 'ITEMS', hint: 'Hearts, energy cells, overdrive, aegis cores and shock bombs.', value: () => ['OFF', 'LOW', 'HIGH'][r.items], onLeft: () => (r.items = ((r.items + 2) % 3) as 0 | 1 | 2), onRight: () => (r.items = ((r.items + 1) % 3) as 0 | 1 | 2), onConfirm: () => (r.items = ((r.items + 1) % 3) as 0 | 1 | 2) },
      { label: 'STAGE HAZARDS', hint: 'Geysers, lightning and water spouts. Off is the plain stage.', value: () => (r.hazards ? 'ON' : 'OFF'), onLeft: () => (r.hazards = !r.hazards), onRight: () => (r.hazards = !r.hazards), onConfirm: () => (r.hazards = !r.hazards) },
      { label: 'CHOOSE FIGHTERS', hint: 'On to the lobby.', onConfirm: () => this.next() },
      { label: 'BACK', onConfirm: () => this.go('ModeSelect') },
    ]);
    this.desc = text(this, this.ui, '', COLORS.accent).setOrigin(0.5);
    this.hint = text(this, this.ui, 'LEFT/RIGHT: CHANGE   J / ENTER: SELECT   K / ESC: BACK', COLORS.dim).setOrigin(0.5);
  }

  private next(): void {
    session.mode = 'versus';
    this.go('CharacterSelect');
  }

  protected override layoutUi(w: number, h: number, u: number): void {
    this.title.setScale(u * 4).setPosition(w / 2, h * 0.14);
    this.list.layout(w / 2, h * 0.3, u, 220);
    this.hint.setScale(Math.min(u, (w * 0.97) / Math.max(1, textPx(this.hint)))).setPosition(w / 2, h - 10 * u);
  }

  protected override tick(time: number): void {
    this.list.update(time);
    this.desc.setText(up(this.list.hint));
    this.desc.setScale(Math.min(this.u, (this.scale.width * 0.94) / Math.max(1, textPx(this.desc)))).setPosition(this.scale.width / 2, this.scale.height - 21 * this.u);
  }

  protected onEvent(e: MenuEvent): void {
    if (this.list.handle(e)) return;
    if (e.action === 'back') this.go('ModeSelect');
  }
}
