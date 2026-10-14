import Phaser from 'phaser';
import { PIXEL_FONT, up } from '../art/pixelFont';
import type { MenuEvent } from '../input/menuInput';
import { session } from '../game/session';
import { COLORS, MenuList, MenuScene, drawPanel, text, textPx, type MenuBackdrop } from '../ui/menuKit';

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

/** Versus rules: number of players, stocks or timed, then on to character select. */
export class VersusSetupScene extends MenuScene {
  private list!: MenuList;
  private title!: Phaser.GameObjects.BitmapText;
  private hint!: Phaser.GameObjects.BitmapText;
  private desc!: Phaser.GameObjects.BitmapText;
  /** The lineup the rules describe: a chip per slot (lit when it plays) with each fighter's lives, time or HP. */
  private chipG!: Phaser.GameObjects.Graphics;
  private chipLabels: Phaser.GameObjects.BitmapText[] = [];
  private chipInfo: Phaser.GameObjects.BitmapText[] = [];
  /** Per chip: how lit it is (eases toward on / off) and when it last changed (for a pop). */
  private chipOn = [0, 0, 0, 0];
  private chipPop = [-9, -9, -9, -9];
  private chipKey = ['', '', '', ''];
  private chipBox = { x: 0, y: 0, w: 0, h: 0, gap: 0 };

  constructor() {
    super('VersusSetup');
  }

  protected build(): void {
    this.title = this.add.bitmapText(0, 0, PIXEL_FONT, 'VERSUS SETUP').setOrigin(0.5).setTint(COLORS.title);
    this.ui.add(this.title);
    const r = session.rules;
    // single-player modes leave playerCount at 1: versus always needs at least two
    session.playerCount = clamp(session.playerCount, 2, 4);
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
    this.lastT = -1;
    this.chipG = this.add.graphics();
    this.ui.add(this.chipG);
    this.chipOn = [0, 0, 0, 0];
    this.chipPop = [-9, -9, -9, -9];
    this.chipKey = ['', '', '', ''];
    this.chipLabels = [0, 1, 2, 3].map((i) => text(this, this.ui, `P${i + 1}`, COLORS.p[i]).setOrigin(0.5));
    this.chipInfo = [0, 1, 2, 3].map(() => text(this, this.ui, '', COLORS.text).setOrigin(0.5));
    this.desc = text(this, this.ui, '', COLORS.accent).setOrigin(0.5);
    this.hint = text(this, this.ui, 'LEFT/RIGHT: CHANGE   J / ENTER: SELECT   K / ESC: BACK', COLORS.dim).setOrigin(0.5);
  }

  private next(): void {
    session.mode = 'versus';
    this.go('CharacterSelect');
  }

  protected override layoutUi(w: number, h: number, u: number): void {
    this.title.setScale(u * 4).setPosition(w / 2, Math.max(h * 0.1, 8 * u + 14 * u));
    // the lineup chips under the title, then the rules list down to the footer
    const cw = Math.min(60 * u, (w * 0.9 - 18 * u) / 4);
    const gap = 6 * u;
    const ch = 34 * u;
    const total = cw * 4 + gap * 3;
    this.chipBox = { x: w / 2 - total / 2, y: this.title.y + this.title.displayHeight / 2 + 9 * u, w: cw, h: ch, gap };
    this.chipLabels.forEach((t, i) => t.setScale(u * 2).setPosition(this.chipBox.x + i * (cw + gap) + cw / 2, this.chipBox.y + 10 * u));
    this.chipInfo.forEach((t, i) => t.setPosition(this.chipBox.x + i * (cw + gap) + cw / 2, this.chipBox.y + 27 * u));
    const footTop = this.placeFooter(this.hint, this.desc);
    this.list.layout(w / 2, this.chipBox.y + ch + 14 * u, u, 220, footTop - 10 * u);
  }

  /** The chips: lit for each slot that plays (team colours in 2 v 2), with what each fighter starts with. */
  private drawChips(time: number): void {
    const g = this.chipG.clear();
    const u = this.u;
    const r = session.rules;
    const teams = r.teams && session.playerCount === 4;
    const { x, y, w: cw, h: ch, gap } = this.chipBox;
    const dt = this.lastT < 0 ? 0 : Math.min(0.1, time - this.lastT);
    this.lastT = time;
    for (let i = 0; i < 4; i++) {
      const on = i < session.playerCount;
      this.chipOn[i] += ((on ? 1 : 0) - this.chipOn[i]) * Math.min(1, dt * 12);
      const a = this.chipOn[i];
      const col = teams ? COLORS.p[i < 2 ? 0 : 1] : COLORS.p[i];
      const info = !on ? 'OFF' : r.mode === 'time' ? `${Math.round(r.timeSec / 60)} MIN` : r.mode === 'stamina' ? `${r.staminaHp} HP` : '@'.repeat(r.stocks);
      const key = `${on}|${info}|${teams}`;
      if (this.chipKey[i] && key !== this.chipKey[i]) this.chipPop[i] = time;
      this.chipKey[i] = key;
      const pop = 1 + 0.12 * Math.max(0, 1 - (time - this.chipPop[i]) / 0.18);
      const cx = x + i * (cw + gap) + cw / 2;
      const w = cw * pop;
      const h = ch * pop;
      const x0 = cx - w / 2;
      const y0 = y + ch / 2 - h / 2;
      drawPanel(g, x0, y0, w, h, u, 0.55 + 0.35 * a);
      g.fillStyle(col, 0.08 + 0.22 * a).fillRect(x0 + u, y0 + u, w - 2 * u, 18 * u * pop);
      g.fillStyle(col, 0.25 + 0.75 * a).fillRect(x0 + u, y0 + 19 * u * pop, w - 2 * u, u);
      this.chipLabels[i].setTint(col).setAlpha(0.35 + 0.65 * a).setScale(u * 2 * pop);
      const t = this.chipInfo[i];
      t.setText(info).setTint(!on ? 0x5a5680 : r.mode === 'stock' ? COLORS.hot : COLORS.accent).setAlpha(0.5 + 0.5 * a);
      t.setScale(Math.min(u * 1.5 * pop, ((cw - 12 * u) * pop) / Math.max(1, textPx(t))));
    }
  }

  private lastT = -1;

  protected override backdrop(): MenuBackdrop {
    return { planet: { x: 0.14, y: 0.32, k: 0.8 }, tint: 0xffe0e8 };
  }

  protected override tick(time: number): void {
    this.list.update(time);
    this.drawChips(time);
    this.desc.setText(up(this.list.hint));
    this.placeFooter(this.hint, this.desc);
  }

  protected onEvent(e: MenuEvent): void {
    if (this.list.handle(e)) return;
    if (e.action === 'back') this.go('ModeSelect');
  }
}
