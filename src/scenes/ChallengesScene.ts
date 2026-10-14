import Phaser from 'phaser';
import { PIXEL_FONT, up } from '../art/pixelFont';
import { characterById } from '../characters';
import { CHALLENGES } from '../game/challenges';
import { clearedChallenges } from '../game/records';
import { session } from '../game/session';
import { STAGES } from '../stages';
import type { MenuEvent } from '../input/menuInput';
import { COLORS, MenuList, MenuScene, text, textPx, type MenuBackdrop } from '../ui/menuKit';

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
      // indented like the numbered rows ("14. ") so BACK lines up with the titles above it
      { label: '    BACK', onConfirm: () => this.go('ModeSelect') },
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
    // the tally hangs a fixed gap under the title, the list a fixed gap under the tally (no overlap on short windows)
    this.count.setScale(u * 1.2).setPosition(w / 2, this.title.y + this.title.displayHeight / 2 + 5 * u + 4.2 * u);
    this.list.layout(w / 2, this.count.y + 4.2 * u + 12 * u, u, 190, h * 0.72);
    this.placeFooter(this.hint);
  }

  protected override backdrop(w: number, h: number): MenuBackdrop {
    // off to the left of the list, clear of the title; a warmer, redder sky for the trials
    return { planet: { x: 0.12, y: w / h > 1.5 ? 0.42 : 0.36, k: 0.75 }, tint: 0xffdcd4 };
  }

  protected override tick(time: number): void {
    this.list.update(time);
    const w = this.scale.width;
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
    this.setup.setText(up(`${who}${ally}   VS ${foes}   ON ${(STAGES[c.stage]?.name ?? c.stage).toUpperCase()}${by}`));
    // the brief and its setup line sit centred in the space between the list and the controls hint
    this.brief.setScale(Math.min(this.u * 1.3, (w * 0.94) / Math.max(1, textPx(this.brief))));
    this.setup.setScale(Math.min(this.u, (w * 0.94) / Math.max(1, textPx(this.setup))));
    const gap = 6 * this.u;
    const block = 7 * this.brief.scaleY + gap + 7 * this.setup.scaleY;
    const lo = this.list.bottom;
    const hi = this.hint.y - this.hint.displayHeight / 2;
    const y0 = lo + Math.max(gap, (hi - lo - block) / 2);
    this.brief.setPosition(w / 2, y0 + (7 * this.brief.scaleY) / 2);
    this.setup.setPosition(w / 2, y0 + 7 * this.brief.scaleY + gap + (7 * this.setup.scaleY) / 2);
  }

  protected onEvent(e: MenuEvent): void {
    if (this.list.handle(e)) return;
    if (e.action === 'back') this.go('ModeSelect');
  }
}
