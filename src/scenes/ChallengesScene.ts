import Phaser from 'phaser';
import { PIXEL_FONT, up } from '../art/pixelFont';
import { animFrameIndex, fighterTextureKey, portraitCrop, portraitK } from '../art/proceduralFighter';
import { characterById } from '../characters';
import { CHALLENGES, TIER_COLORS, TIER_NAMES, armSpecialChallenge, challengeById, clearText, goalText, recordChallengeResult, type Challenge } from '../game/challenges';
import { launchSlots } from '../game/launch';
import { endTurns } from '../game/turns';
import { targetCourseById } from '../stages/targetCourses';
import type { InputDevice } from '../input/device';
import { inputManager } from '../input/inputManager';
import { challengeBests, clearedChallenges, formatSec, type ChallengeBest } from '../game/records';
import type { MatchResult } from '../game/session';
import { session } from '../game/session';
import { STAGES } from '../stages';

/** A challenge's stage: a Stage Select stage, or a Target Smash course. */
function stageOf(id: string) {
  return STAGES[id] ?? targetCourseById(id)?.stage;
}
import type { MenuEvent } from '../input/menuInput';
import { COLORS, MenuList, MenuScene, drawPanel, pointerXY, tapMin, text, textPx, type MenuBackdrop } from '../ui/menuKit';
import { stageThumb } from '../ui/stageThumb';
import { ensureStageArt, stageArtReady } from '../art/stageArt';

/** A challenge's difficulty, 1-5: its foes' levels (a boss counts as 4), plus one for a crowd. */
export function challengeDifficulty(c: Challenge): number {
  if (c.kind === 'targets') return 1 + (targetCourseById(c.stage)?.difficulty ?? 1);
  if (c.kind === 'launch') return 2;
  const lv = c.foes.map((f) => (f.boss ? 4 : f.level));
  const top = Math.max(1, ...lv);
  const crowd = c.foes.length > 2 ? 1 : 0;
  return Math.max(1, Math.min(5, top + crowd + (c.playerStocks === 1 && top >= 2 ? 1 : 0)));
}


const CHARACTER_IDS = CHALLENGES.flatMap((c) => c.foes.map((f) => f.character));

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
  /** Where the list sits (its centre and plate width, units) and the side card beside it (null: no room). */
  private listX = 0;
  private card: { x: number; y: number; w: number; h: number } | null = null;
  private thumb!: Phaser.GameObjects.Image;
  private stageName!: Phaser.GameObjects.BitmapText;
  private foeImgs: Phaser.GameObjects.Image[] = [];
  private foeNames: Phaser.GameObjects.BitmapText[] = [];
  private cardG!: Phaser.GameObjects.Graphics;
  /** The "next unfinished" button under the tally (keys: the alt button) and its box. */
  private nextT!: Phaser.GameObjects.BitmapText;
  private nextBox = { x: 0, y: 0, w: 0, h: 0 };
  private shown = '';

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
    else this.select(Math.max(0, this.nextUnfinished(-1)));
    this.shown = '';
    this.cardG = this.add.graphics();
    this.ui.add(this.cardG);
    this.thumb = this.add.image(0, 0, '__WHITE').setOrigin(0, 0).setVisible(false);
    this.ui.add(this.thumb);
    this.stageName = text(this, this.ui, '', COLORS.accent).setOrigin(0.5, 0);
    this.foeImgs = [];
    this.foeNames = [];
    for (let i = 0; i < 4; i++) {
      const img = this.add.image(0, 0, fighterTextureKey(CHARACTER_IDS[0]), 0).setOrigin(0.5, 0.5).setVisible(false);
      this.ui.add(img);
      this.foeImgs.push(img);
      this.foeNames.push(text(this, this.ui, '', COLORS.text).setOrigin(0.5, 0));
    }
    this.nextT = text(this, this.ui, '', COLORS.hot).setOrigin(0.5);
    this.input.on(Phaser.Input.Events.POINTER_DOWN, (p: Phaser.Input.Pointer) => {
      if (p.rightButtonDown()) return;
      const q = pointerXY(this, p);
      const b = this.nextBox;
      const m = Math.max(this.u * 2, (tapMin(this) - b.h) / 2);
      if (this.nextT.visible && q.x >= b.x && q.x <= b.x + b.w && q.y >= b.y - m && q.y <= b.y + b.h + m) this.jumpNext();
    });
    this.arrows = this.add.graphics();
    this.medalG = this.add.graphics();
    this.ui.add([this.arrows, this.medalG]);
    this.count = text(this, this.ui, '', COLORS.good).setOrigin(0.5);
    this.brief = text(this, this.ui, '', COLORS.accent).setOrigin(0.5);
    this.setup = text(this, this.ui, '', COLORS.dim).setOrigin(0.5);
    this.medals = [1, 2, 3].map(() => text(this, this.ui, '', COLORS.dim).setOrigin(0, 0.5));
    this.hint = text(this, this.ui, '', COLORS.dim).setOrigin(0.5);
    this.bindFooter(this.hint, [['updown', 'MOVE'], ['leftright', 'PAGE'], ['confirm', 'START'], ['alt', 'NEXT UNCLEARED'], ['back', 'BACK']]);
    // over the scroll marks' graphics (which draw its dark plate)
    this.ui.bringToTop(this.nextT);
  }

  /** The first challenge after `from` (wrapping) not yet cleared; -1 when all are. */
  private nextUnfinished(from: number): number {
    const n = CHALLENGES.length;
    for (let k = 1; k <= n; k++) {
      const i = (from + k + n) % n;
      if (!this.cleared[CHALLENGES[i].id]) return i;
    }
    return -1;
  }

  private jumpNext(): void {
    const k = this.nextUnfinished(this.sel);
    if (k >= 0) this.select(k);
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
    const c = challengeById(id);
    endTurns();
    // Target Smash and Launch Contest challenges (a fixed fighter): straight into the run, on the device that chose it
    if (c && (c.kind === 'targets' || c.kind === 'launch') && c.you) {
      armSpecialChallenge(id);
      session.challenge = id;
      session.playerCount = 1;
      session.ladder = null;
      const device = this.lastDevice ?? inputManager.keyboards[0] ?? null;
      const me = { index: 0, type: 'human' as const, device, character: c.you, cpuLevel: 1 as const };
      session.mode = c.kind;
      session.stage = c.stage;
      session.players = c.kind === 'launch' ? launchSlots(me) : [me];
      this.go('Match');
      return;
    }
    armSpecialChallenge(null);
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
    this.nextT.setText('> NEXT UNCLEARED').setScale(Math.max(1, u)).setPosition(w / 2, this.count.y + 4.2 * u + 7 * u);
    this.listTop = this.nextT.y + this.nextT.displayHeight / 2 + 10 * u;
    // a side card (the stage, the foes, the difficulty) beside the list when the window is wide enough
    const cardW = Math.min(200 * u, w * 0.36);
    const room = w - (220 + 24) * u - 16 * u >= 130 * u;
    this.listX = room ? Math.max((220 / 2 + 14) * u, (w - cardW - 12 * u) / 2) : w / 2;
    this.list.layout(this.listX, this.listTop, u, 220, h * 0.66);
    const lx1 = this.listX + (220 / 2 + 6) * u;
    this.card = room ? { x: lx1 + 10 * u, y: this.listTop - 6 * u, w: Math.min(cardW, w - lx1 - 18 * u), h: this.list.bottom - this.listTop + 6 * u } : null;
    this.shown = '';
    this.placeFooter(this.hint);
  }

  /** The side card for challenge `c`: its stage thumbnail and name, the foes' portraits with their level, the difficulty. */
  private drawCard(c: Challenge | undefined): void {
    const g = this.cardG.clear();
    const k = this.card;
    const show = !!k && !!c;
    this.thumb.setVisible(show);
    this.stageName.setVisible(show);
    this.foeImgs.forEach((im) => im.setVisible(false));
    this.foeNames.forEach((t) => t.setVisible(false));
    if (!k || !c) return;
    const u = this.u;
    drawPanel(g, k.x, k.y, k.w, k.h, u, 0.9);
    const stage = stageOf(c.stage);
    const pad = 5 * u;
    let y = k.y + pad;
    const tw = k.w - pad * 2;
    if (stage && !stageArtReady(this, stage)) {
      // built in the background: the card is drawn again once the art is there
      this.thumb.setVisible(false);
      const v = this.visitId;
      void ensureStageArt(this, stage)
        .then(() => {
          if (this.isVisit(v) && CHALLENGES[this.sel]?.id === c.id) this.shown = '';
        })
        .catch(() => undefined);
      y += Math.min(tw * (9 / 16), k.h * 0.4) + 3 * u;
    } else if (stage) {
      this.thumb.setTexture(stageThumb(this, stage));
      const s = Math.min(tw / this.thumb.width, (k.h * 0.4) / this.thumb.height);
      this.thumb.setScale(s).setPosition(k.x + (k.w - this.thumb.width * s) / 2, y);
      g.lineStyle(Math.max(1, u / 2), COLORS.title, 0.9).strokeRect(this.thumb.x, y, this.thumb.width * s, this.thumb.height * s);
      y += this.thumb.height * s + 3 * u;
    }
    this.stageName.setText(up(stage?.name ?? c.stage)).setScale(Math.min(u, tw / Math.max(1, textPx(this.stageName)))).setPosition(k.x + k.w / 2, y);
    y += this.stageName.displayHeight + 6 * u;
    // difficulty: five pips
    const diff = challengeDifficulty(c);
    const pip = 4 * u;
    for (let i = 0; i < 5; i++) {
      const px = k.x + k.w / 2 + (i - 2) * (pip + 2 * u) - pip / 2;
      g.fillStyle(i < diff ? (diff >= 4 ? COLORS.bad : diff >= 3 ? COLORS.warn : COLORS.good) : 0x2a2550, 1).fillRect(px, y, pip, pip);
    }
    y += pip + 6 * u;
    // the foes (an ally first, in green)
    const foes = [...(c.ally ? [{ f: c.ally, ally: true }] : []), ...c.foes.map((f) => ({ f, ally: false }))].slice(0, 4);
    const slot = tw / Math.max(1, foes.length);
    const ph = Math.min(slot * 0.9, k.y + k.h - y - 14 * u, 48 * u);
    foes.forEach(({ f, ally }, i) => {
      const data = characterById(f.character);
      const im = this.foeImgs[i];
      const nm = this.foeNames[i];
      const cx = k.x + pad + slot * (i + 0.5);
      if (data && this.textures.exists(fighterTextureKey(data.id)) && ph > 8 * u) {
        const cr = portraitCrop(data);
        im.setTexture(fighterTextureKey(data.id), animFrameIndex(data, 'idle', 0)).setCrop(...cr).setFlipX(!ally);
        const sc = (ph / 40) * portraitK(data);
        // centre the cropped portrait (not the whole frame)
        const ox = (im.width / 2 - (cr[0] + cr[2] / 2)) * sc * (ally ? 1 : -1);
        im.setScale(sc).setPosition(cx + ox, y + ph / 2 + (im.height / 2 - (cr[1] + cr[3] / 2)) * sc).setVisible(true);
        g.fillStyle(ally ? COLORS.good : COLORS.bad, 0.12).fillRect(cx - slot / 2 + u, y, slot - 2 * u, ph);
      }
      const lvl = f.boss ? 'BOSS' : ['', 'EASY', 'NORMAL', 'HARD'][f.level];
      nm.setText(up(`${ally ? 'ALLY ' : ''}${data?.name ?? f.character}\n${lvl}`)).setCenterAlign().setTint(ally ? COLORS.good : COLORS.text).setVisible(true);
      nm.setScale(Math.max(0.5, Math.min(u * 0.8, (slot - 2 * u) / Math.max(1, textPx(nm))))).setPosition(cx, y + ph + 2 * u);
    });
  }

  /** The next-uncleared button takes taps (the touch pad lets them through). */
  protected override tapTargetAt(x: number, y: number): boolean {
    const b = this.nextBox;
    return this.nextT?.visible && x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;
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
    // the next-uncleared button (hidden once everything is cleared)
    const left = this.nextUnfinished(-1) >= 0;
    this.nextT.setVisible(left);
    const nb = this.nextT;
    this.nextBox = { x: nb.x - nb.displayWidth / 2 - 4 * u, y: nb.y - nb.displayHeight / 2 - 2 * u, w: nb.displayWidth + 8 * u, h: nb.displayHeight + 4 * u };
    a.fillStyle(0x0a0820, 0.75).fillRect(this.nextBox.x, this.nextBox.y, this.nextBox.w, this.nextBox.h);
    if (!left) a.clear();
    // difficulty marks beside each visible row (outside the list plate, on its left)
    // (the list's rows are a finger tall on touch screens, and the list may scroll within its own window)
    const rowH = Math.max(18, tapMin(this) / u) * u;
    const fk = 1.5;
    for (let i = 0; i < this.rows; i++) {
      const ch = CHALLENGES[this.offset + i];
      const slot = i - this.list.scrollTop;
      if (!ch || slot < 0 || slot >= this.list.visibleRows) continue;
      const d = challengeDifficulty(ch);
      const ry = this.listTop + slot * rowH + (7 * fk * u) / 2;
      const x0 = this.listX - (220 / 2 + 6) * u - 3 * u;
      for (let k = 0; k < 5; k++) {
        a.fillStyle(k < d ? (d >= 4 ? COLORS.bad : d >= 3 ? COLORS.warn : COLORS.good) : 0x2a2550, k < d ? 0.95 : 0.7).fillRect(x0 - (5 - k) * 3 * u, ry - u, 2 * u, 2 * u);
      }
    }
    const c = CHALLENGES[this.sel];
    const key = `${c?.id ?? ''}:${this.card?.x ?? -1}`;
    if (key !== this.shown) {
      this.shown = key;
      this.drawCard(c);
    }
    const g = this.medalG.clear();
    if (!c) {
      this.brief.setText('');
      this.setup.setText('');
      for (const m of this.medals) m.setText('');
      return;
    }
    const foes = c.kind === 'targets' ? 'TEN TARGETS' : c.kind === 'launch' ? 'THE STANDARD DUMMY' : c.foes.map((f) => `${(characterById(f.character)?.name ?? f.character).toUpperCase()}${f.boss ? '' : ` (${['', 'EASY', 'NORMAL', 'HARD'][f.level]})`}`).join(', ');
    const who = c.you ? `AS ${(characterById(c.you)?.name ?? c.you).toUpperCase()}` : 'ANY FIGHTER';
    const ally = c.ally ? `   WITH ${(characterById(c.ally.character)?.name ?? '').toUpperCase()}` : '';
    const by = this.cleared[c.id] ? `   CLEARED WITH ${(characterById(this.cleared[c.id])?.name ?? '').toUpperCase()}` : '';
    this.brief.setText(up(c.brief));
    const best = this.bests[c.id];
    const fast = best?.sec ? `   BEST ${formatSec(best.sec)}` : '';
    this.setup.setText(up(`${who}${ally}   VS ${foes}   ON ${(stageOf(c.stage)?.name ?? c.stage).toUpperCase()}${by}${fast}`));
    const tier = best?.tier ?? (this.cleared[c.id] ? 1 : 0);
    const goals = [clearText(c), goalText(c.silver), `${goalText(c.silver)} + ${goalText(c.gold)}`];
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

  /** The device of the last menu press (a practice-mode challenge starts on it). */
  private lastDevice: InputDevice | null = null;

  protected onEvent(e: MenuEvent): void {
    this.lastDevice = e.device ?? this.lastDevice;
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
    if (e.action === 'alt') {
      this.jumpNext();
      return;
    }
    if (this.list.handle(e)) return;
    if (e.action === 'back') this.go('ModeSelect');
  }
}
