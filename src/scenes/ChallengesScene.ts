import Phaser from 'phaser';
import { PIXEL_FONT, up } from '../art/pixelFont';
import { characterById } from '../characters';
import { CHALLENGES, TIER_COLORS, TIER_NAMES, challengeById, goalText, recordChallengeResult } from '../game/challenges';
import { challengeBests, clearedChallenges, formatSec, type ChallengeBest } from '../game/records';
import type { MatchResult } from '../game/session';
import { session } from '../game/session';
import { footerHint } from '../input/prompts';
import { STAGES } from '../stages';
import type { MenuEvent } from '../input/menuInput';
import { COLORS, MenuList, MenuScene, text, textPx, type MenuBackdrop } from '../ui/menuKit';


/** Rows of the challenge list shown at once (the list scrolls). */
const VISIBLE = 10;

/**
 * The challenge started from this screen and the result that was current then: a newer result on return is that
 * challenge's match (a fallback for keeping medals when the match flow has not recorded the run itself; recording
 * twice is harmless, bests only ever improve).
 */
let started: { id: string; before: MatchResult | null } | null = null;
const counted = new WeakSet<MatchResult>();

/** Hand-made scenarios with bronze / silver / gold medals; the best medal and fastest clear of each are kept. */
export class ChallengesScene extends MenuScene {
  private list!: MenuList;
  private title!: Phaser.GameObjects.BitmapText;
  private brief!: Phaser.GameObjects.BitmapText;
  private setup!: Phaser.GameObjects.BitmapText;
  private count!: Phaser.GameObjects.BitmapText;
  private hint!: Phaser.GameObjects.BitmapText;
  private medals: Phaser.GameObjects.BitmapText[] = [];
  private medalG!: Phaser.GameObjects.Graphics;
  private arrows!: Phaser.GameObjects.Graphics;
  private cleared: Record<string, string> = {};
  private bests: Record<string, ChallengeBest> = {};
  /** First challenge shown in the list window. */
  private offset = 0;
  private listTop = 0;

  constructor() {
    super('Challenges');
  }

  /** Index of the selected challenge (-1: BACK). */
  private get sel(): number {
    return this.list.index < this.rows ? this.offset + this.list.index : -1;
  }

  private get rows(): number {
    return Math.min(VISIBLE, CHALLENGES.length);
  }

  protected build(): void {
    this.catchUp();
    this.cleared = clearedChallenges();
    this.bests = challengeBests();
    this.title = this.add.bitmapText(0, 0, PIXEL_FONT, 'CHALLENGES').setOrigin(0.5).setTint(COLORS.title);
    this.ui.add(this.title);
    const slots = Array.from({ length: this.rows }, (_, i) => ({
      label: () => {
        const k = this.offset + i;
        return `${String(k + 1).padStart(2, ' ')}. ${CHALLENGES[k]?.title ?? ''}`;
      },
      value: () => this.rowValue(CHALLENGES[this.offset + i]?.id),
      onConfirm: () => this.start(CHALLENGES[this.offset + i].id),
    }));
    // indented like the numbered rows ("14. ") so BACK lines up with the titles above it
    this.list = new MenuList(this, this.ui, [...slots, { label: '    BACK', onConfirm: () => this.go('ModeSelect') }]);
    if (session.challenge) this.select(Math.max(0, CHALLENGES.findIndex((c) => c.id === session.challenge)));
    this.arrows = this.add.graphics();
    this.medalG = this.add.graphics();
    this.ui.add([this.arrows, this.medalG]);
    this.count = text(this, this.ui, '', COLORS.good).setOrigin(0.5);
    this.brief = text(this, this.ui, '', COLORS.accent).setOrigin(0.5);
    this.setup = text(this, this.ui, '', COLORS.dim).setOrigin(0.5);
    this.medals = [1, 2, 3].map(() => text(this, this.ui, '', COLORS.dim).setOrigin(0, 0.5));
    this.hint = text(this, this.ui, footerHint([['updown', 'MOVE'], ['leftright', 'PAGE'], ['confirm', 'START'], ['back', 'BACK']]), COLORS.dim).setOrigin(0.5);
  }

  /** Keep the medal of a challenge match that finished since this screen started it (see `started`). */
  private catchUp(): void {
    const r = session.lastResult;
    if (session.mode !== 'challenge' || !started || !r || r === started.before || counted.has(r) || started.id !== session.challenge) return;
    const c = challengeById(started.id);
    const me = r.players.find((p) => p.index === 0);
    if (!c || !me) return;
    counted.add(r);
    recordChallengeResult(c, me.character, r);
  }

  private rowValue(id: string | undefined): string {
    if (!id) return '';
    const b = this.bests[id];
    if (b) return `${TIER_NAMES[b.tier]}${b.sec ? ` ${formatSec(b.sec)}` : ''}`;
    return this.cleared[id] ? 'CLEAR' : '-';
  }

  /** Put the cursor on challenge `k`, scrolling the window so it shows. */
  private select(k: number): void {
    const n = CHALLENGES.length;
    k = Math.max(0, Math.min(n - 1, k));
    if (k < this.offset) this.offset = k;
    else if (k >= this.offset + this.rows) this.offset = k - this.rows + 1;
    this.offset = Math.max(0, Math.min(n - this.rows, this.offset));
    this.list.index = k - this.offset;
  }

  private start(id: string): void {
    session.mode = 'challenge';
    session.challenge = id;
    session.playerCount = 1;
    session.ladder = null;
    started = { id, before: session.lastResult };
    this.go('CharacterSelect');
  }

  protected override layoutUi(w: number, h: number, u: number): void {
    this.title.setScale(Math.min(u * 4, (w * 0.9) / Math.max(1, textPx(this.title)))).setPosition(w / 2, h * 0.08);
    // the tally hangs a fixed gap under the title, the list a fixed gap under the tally (no overlap on short windows)
    this.count.setScale(Math.min(u * 1.2, (w * 0.94) / Math.max(1, textPx(this.count)))).setPosition(w / 2, this.title.y + this.title.displayHeight / 2 + 5 * u + 4.2 * u);
    this.listTop = this.count.y + 4.2 * u + 12 * u;
    this.list.layout(w / 2, this.listTop, u, 220, h * 0.66);
    this.placeFooter(this.hint);
  }

  protected override backdrop(w: number, h: number): MenuBackdrop {
    // off to the left of the list, clear of the title; a warmer, redder sky for the trials
    return { planet: { x: 0.12, y: w / h > 1.5 ? 0.42 : 0.36, k: 0.75 }, tint: 0xffdcd4 };
  }

  /** Small medal disc. */
  private medal(g: Phaser.GameObjects.Graphics, x: number, y: number, r: number, tier: number, on: boolean): void {
    const c = on ? TIER_COLORS[tier] : TIER_COLORS[0];
    g.fillStyle(0x0a0820, 0.9).fillCircle(x, y, r + this.u);
    g.fillStyle(c, on ? 1 : 0.5).fillCircle(x, y, r);
    if (on) g.fillStyle(0xffffff, 0.45).fillCircle(x - r * 0.3, y - r * 0.3, r * 0.3);
  }

  protected override tick(time: number): void {
    this.list.update(time);
    const u = this.u;
    const w = this.scale.width;
    const done = CHALLENGES.filter((c) => this.cleared[c.id]).length;
    const tally = [0, 0, 0, 0];
    for (const c of CHALLENGES) tally[this.bests[c.id]?.tier ?? (this.cleared[c.id] ? 1 : 0)]++;
    this.count.setText(up(`${done} / ${CHALLENGES.length} CLEARED    GOLD ${tally[3]}  SILVER ${tally[2]}  BRONZE ${tally[1]}`)).setTint(tally[3] === CHALLENGES.length ? COLORS.hot : COLORS.good);
    this.count.setScale(Math.min(u * 1.2, (w * 0.94) / Math.max(1, textPx(this.count))));
    // scroll marks above and below the list window
    const a = this.arrows.clear();
    const lt = this.listTop - 6 * u;
    const lb = this.list.bottom + 3 * u;
    a.fillStyle(COLORS.title, 0.9);
    if (this.offset > 0) a.fillTriangle(w / 2 - 4 * u, lt, w / 2 + 4 * u, lt, w / 2, lt - 4 * u);
    if (this.offset + this.rows < CHALLENGES.length) a.fillTriangle(w / 2 - 4 * u, lb, w / 2 + 4 * u, lb, w / 2, lb + 4 * u);
    const c = CHALLENGES[this.sel];
    const g = this.medalG.clear();
    if (!c) {
      this.brief.setText('');
      this.setup.setText('');
      for (const m of this.medals) m.setText('');
      return;
    }
    const foes = c.foes.map((f) => `${(characterById(f.character)?.name ?? f.character).toUpperCase()}${f.boss ? '' : ` (${['', 'EASY', 'NORMAL', 'HARD'][f.level]})`}`).join(', ');
    const who = c.you ? `AS ${(characterById(c.you)?.name ?? c.you).toUpperCase()}` : 'ANY FIGHTER';
    const ally = c.ally ? `   WITH ${(characterById(c.ally.character)?.name ?? '').toUpperCase()}` : '';
    const by = this.cleared[c.id] ? `   CLEARED WITH ${(characterById(this.cleared[c.id])?.name ?? '').toUpperCase()}` : '';
    this.brief.setText(up(c.brief));
    const best = this.bests[c.id];
    const fast = best?.sec ? `   BEST ${formatSec(best.sec)}` : '';
    this.setup.setText(up(`${who}${ally}   VS ${foes}   ON ${(STAGES[c.stage]?.name ?? c.stage).toUpperCase()}${by}${fast}`));
    const tier = best?.tier ?? (this.cleared[c.id] ? 1 : 0);
    const goals = ['CLEAR', goalText(c.silver), `${goalText(c.silver)} + ${goalText(c.gold)}`];
    this.medals.forEach((m, i) => m.setText(up(`${TIER_NAMES[i + 1]}: ${goals[i]}`)).setTint(tier > i ? TIER_COLORS[i + 1] : COLORS.dim));
    // the brief, its setup line and the medal row sit centred in the space between the list and the controls hint
    this.brief.setScale(Math.min(u * 1.3, (w * 0.94) / Math.max(1, textPx(this.brief))));
    this.setup.setScale(Math.min(u, (w * 0.94) / Math.max(1, textPx(this.setup))));
    const disc = 4 * u;
    const gapM = 10 * u;
    const mk = Math.min(u, (w * 0.94 - 3 * (disc * 2 + 3 * u) - 2 * gapM) / Math.max(1, this.medals.reduce((n, m) => n + textPx(m), 0)));
    for (const m of this.medals) m.setScale(mk);
    const gap = 5 * u;
    const block = 7 * this.brief.scaleY + gap + 7 * this.setup.scaleY + gap + Math.max(7 * mk, disc * 2);
    const lo = this.list.bottom + 8 * u;
    const hi = this.hint.y - this.hint.displayHeight / 2;
    const y0 = lo + Math.max(0, (hi - lo - block) / 2);
    this.brief.setPosition(w / 2, y0 + (7 * this.brief.scaleY) / 2);
    this.setup.setPosition(w / 2, y0 + 7 * this.brief.scaleY + gap + (7 * this.setup.scaleY) / 2);
    const my = this.setup.y + (7 * this.setup.scaleY) / 2 + gap + Math.max(7 * mk, disc * 2) / 2;
    const total = this.medals.reduce((n, m) => n + m.displayWidth + disc * 2 + 3 * u, 0) + gapM * 2;
    let x = w / 2 - total / 2;
    this.medals.forEach((m, i) => {
      this.medal(g, x + disc, my, disc, i + 1, tier > i);
      m.setPosition(x + disc * 2 + 3 * u, my);
      x += disc * 2 + 3 * u + m.displayWidth + gapM;
    });
  }

  protected onEvent(e: MenuEvent): void {
    const n = CHALLENGES.length;
    const back = this.list.index === this.rows;
    // keys and the wheel scroll the window; a click on a row's value still goes to the list
    if (e.action === 'up' || e.action === 'down' || ((e.action === 'left' || e.action === 'right') && e.target === undefined)) {
      const k = this.sel;
      if (e.action === 'left' || e.action === 'right') {
        if (back) return;
        this.select(k + (e.action === 'left' ? -this.rows : this.rows));
        return;
      }
      if (e.action === 'up') {
        if (back) this.select(n - 1);
        else if (k === 0) this.list.index = this.rows;
        else this.select(k - 1);
        return;
      }
      if (back) this.select(0);
      else if (k === n - 1) this.list.index = this.rows;
      else this.select(k + 1);
      return;
    }
    if (this.list.handle(e)) return;
    if (e.action === 'back') this.go('ModeSelect');
  }
}
