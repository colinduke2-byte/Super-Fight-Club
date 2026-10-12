import Phaser from 'phaser';
import { PIXEL_FONT, up } from '../art/pixelFont';
import { characterById } from '../characters';
import { CHALLENGES } from '../game/challenges';
import { clearedChallenges } from '../game/records';
import { session } from '../game/session';
import type { MenuEvent } from '../input/menuInput';
import { COLORS, MenuList, MenuScene, text, textPx } from '../ui/menuKit';

/** Ten hand-made scenarios; clearing one (winning the match) ticks it off for good. */
export class ChallengesScene extends MenuScene {
  private list!: MenuList;
  private title!: Phaser.GameObjects.BitmapText;
  private brief!: Phaser.GameObjects.BitmapText;
  private setup!: Phaser.GameObjects.BitmapText;
  private count!: Phaser.GameObjects.BitmapText;
  private hint!: Phaser.GameObjects.BitmapText;
  private cleared: Record<string, string> = {};

  constructor() {
    super('Challenges');
  }

  protected build(): void {
    this.cleared = clearedChallenges();
    this.title = this.add.bitmapText(0, 0, PIXEL_FONT, 'CHALLENGES').setOrigin(0.5).setTint(COLORS.title);
    this.ui.add(this.title);
    this.list = new MenuList(this, this.ui, [
      ...CHALLENGES.map((c, i) => ({
        label: `${String(i + 1).padStart(2, ' ')}. ${c.title}`,
        value: () => (this.cleared[c.id] ? 'CLEAR' : '-'),
        onConfirm: () => this.start(c.id),
      })),
      { label: 'BACK', onConfirm: () => this.go('ModeSelect') },
    ]);
    if (session.challenge) this.list.index = Math.max(0, CHALLENGES.findIndex((c) => c.id === session.challenge));
    this.count = text(this, this.ui, '', COLORS.good).setOrigin(0.5);
    this.brief = text(this, this.ui, '', COLORS.accent).setOrigin(0.5);
    this.setup = text(this, this.ui, '', COLORS.dim).setOrigin(0.5);
    this.hint = text(this, this.ui, 'UP/DOWN: MOVE   J / ENTER: START   K / ESC: BACK', COLORS.dim).setOrigin(0.5);
  }

  private start(id: string): void {
    session.mode = 'challenge';
    session.challenge = id;
    session.playerCount = 1;
    session.ladder = null;
    this.go('CharacterSelect');
  }

  protected override layoutUi(w: number, h: number, u: number): void {
    this.title.setScale(Math.min(u * 4, (w * 0.9) / Math.max(1, textPx(this.title)))).setPosition(w / 2, h * 0.09);
    this.count.setScale(u * 1.2).setPosition(w / 2, h * 0.17);
    this.list.layout(w / 2, h * 0.22, u, 190, h * 0.72);
    this.hint.setScale(Math.min(u, (w * 0.97) / Math.max(1, textPx(this.hint)))).setPosition(w / 2, h - 10 * u);
  }

  protected override tick(time: number): void {
    this.list.update(time);
    const w = this.scale.width;
    const h = this.scale.height;
    const done = CHALLENGES.filter((c) => this.cleared[c.id]).length;
    this.count.setText(up(`${done} / ${CHALLENGES.length} CLEARED`)).setTint(done === CHALLENGES.length ? COLORS.hot : COLORS.good);
    const c = CHALLENGES[this.list.index];
    if (!c) {
      this.brief.setText('');
      this.setup.setText('');
      return;
    }
    const foes = c.foes.map((f) => `${(characterById(f.character)?.name ?? f.character).toUpperCase()}${f.boss ? '' : ` (${['', 'EASY', 'NORMAL', 'HARD'][f.level]})`}`).join(', ');
    const who = c.you ? `AS ${(characterById(c.you)?.name ?? c.you).toUpperCase()}` : 'ANY FIGHTER';
    const ally = c.ally ? `   WITH ${(characterById(c.ally.character)?.name ?? '').toUpperCase()}` : '';
    const by = this.cleared[c.id] ? `   CLEARED WITH ${(characterById(this.cleared[c.id])?.name ?? '').toUpperCase()}` : '';
    this.brief.setText(up(c.brief));
    this.setup.setText(up(`${who}${ally}   VS ${foes}${by}`));
    this.brief.setScale(Math.min(this.u * 1.3, (w * 0.94) / Math.max(1, textPx(this.brief)))).setPosition(w / 2, h * 0.8);
    this.setup.setScale(Math.min(this.u, (w * 0.94) / Math.max(1, textPx(this.setup)))).setPosition(w / 2, h * 0.86);
  }

  protected onEvent(e: MenuEvent): void {
    if (this.list.handle(e)) return;
    if (e.action === 'back') this.go('ModeSelect');
  }
}
