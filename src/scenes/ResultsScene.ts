import { announcer } from '../audio/announcer';
import Phaser from 'phaser';
import { PIXEL_FONT } from '../art/pixelFont';
import { music } from '../audio/music';
import { formatTicks } from '../game/records';
import { characterById } from '../characters';
import { applyLadderResult, type LadderOutcome } from '../game/ladder';
import { endingCards } from '../game/story';
import { session } from '../game/session';
import type { MenuEvent } from '../input/menuInput';
import { ensurePalette, fighterAnimKey, fighterTextureKey, uiTexK } from '../art/proceduralFighter';
import { COLORS, MenuList, MenuScene, text, textPx, type MenuItem } from '../ui/menuKit';

/** After a match: winner banner, per-player stats, and what to do next. */
export class ResultsScene extends MenuScene {
  private list!: MenuList;
  private title!: Phaser.GameObjects.BitmapText;
  private rows: Phaser.GameObjects.BitmapText[] = [];
  private head!: Phaser.GameObjects.BitmapText;
  /** Winner showcase: the champion on a lit pedestal with confetti. */
  private champ: Phaser.GameObjects.Sprite | null = null;
  private champK = 1;
  private champName: Phaser.GameObjects.BitmapText | null = null;
  private stageG!: Phaser.GameObjects.Graphics;
  /** Plate behind the results table. */
  private plate!: Phaser.GameObjects.Graphics;
  private fx!: Phaser.GameObjects.Graphics;
  private champColor = 0xffffff;
  private confetti: { x: number; y: number; vx: number; vy: number; c: number; r: number; vr: number }[] = [];
  private floor = { x: 0, y: 0, s: 1 };

  constructor() {
    super('Results');
  }

  protected build(): void {
    this.rows = [];
    this.plate = this.add.graphics();
    this.ui.add(this.plate);
    const r = session.lastResult;
    const arcade = session.mode === 'arcade' && !!session.ladder;
    const winner = r ? r.winner : -1;
    // same names as the in-match tags: P1, CPU (numbered by port when there are several)
    const cpus = r ? r.players.filter((p) => p.type === 'cpu').length : 0;
    const nameOf = (p: { type: string; index: number }): string => (p.type === 'cpu' ? (cpus > 1 ? `CPU${p.index + 1}` : 'CPU') : `P${p.index + 1}`);
    const wp0 = r && winner >= 0 ? r.players.find((p) => p.index === winner) : undefined;
    let label = !r ? 'MATCH OVER' : winner < 0 ? 'DRAW' : r.winnerTeam >= 0 ? `TEAM ${r.winnerTeam === 0 ? 'BLUE' : 'RED'} WINS` : `${wp0 ? nameOf(wp0) : `P${winner + 1}`} WINS`;
    // arcade: record the fight and decide what comes next
    let outcome: LadderOutcome | null = null;
    if (arcade) {
      outcome = applyLadderResult(session.ladder!, r);
      label = outcome === 'gameover' ? 'GAME OVER' : winner === 0 ? 'VICTORY' : 'DEFEATED';
    }
    // Target Smash: time, best and targets instead of the versus table
    const tr = session.mode === 'targets' ? session.targetRun : null;
    if (tr) label = tr.cleared ? (tr.record ? 'NEW RECORD!' : 'COMPLETE!') : 'FAILED';
    // Launch Contest: distance, best and the damage it flew at
    const lr = session.mode === 'launch' ? session.launchRun : null;
    if (lr) label = lr.record ? 'NEW RECORD!' : lr.distance > 0 ? 'LAUNCHED!' : 'NO DISTANCE';
    this.title = this.add.bitmapText(0, 0, PIXEL_FONT, label).setOrigin(0.5).setTint(winner >= 0 ? COLORS.p[winner % 4] : COLORS.title);
    this.ui.add(this.title);
    const timed = session.rules.mode === 'time' && !arcade;
    this.head = text(this, this.ui, tr ? `TARGET SMASH  ${(characterById(tr.character)?.name ?? '').toUpperCase()}` : lr ? `LAUNCH CONTEST  ${(characterById(lr.character)?.name ?? '').toUpperCase()}` : `PLAYER    FIGHTER    KOS  FALLS  DAMAGE  COMBO  ${timed ? 'POINTS' : 'STOCKS'}`, COLORS.dim);
    this.stageG = this.add.graphics();
    this.fx = this.add.graphics().setBlendMode(Phaser.BlendModes.ADD);
    this.ui.add([this.stageG, this.fx]);
    this.champ = null;
    this.champName = null;
    this.confetti = [];
    const wp = r && winner >= 0 ? r.players.find((p) => p.index === winner) : undefined;
    const wc = wp ? characterById(wp.character) : undefined;
    if (wp && wc) {
      this.champColor = parseInt(wc.sprite.placeholder.accent.slice(1), 16);
      this.champK = uiTexK(wc);
      const skin = ensurePalette(this, wc, wp.palette ?? 0);
      this.champ = this.add.sprite(0, 0, fighterTextureKey(skin), 0).setOrigin(0.5, 1);
      // victory: strike the taunt pose (each fighter's own), then settle into the idle; repeated every few seconds
      const idle = fighterAnimKey(skin, 'idle');
      const tauntAnim = wc.moves.taunt?.anim;
      const pose = tauntAnim ? fighterAnimKey(skin, tauntAnim) : '';
      const strike = (): void => {
        if (!this.champ || !pose || !this.anims.exists(pose)) return;
        this.champ.play({ key: pose, frameRate: 7, repeat: 0 });
        this.champ.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => this.time.delayedCall(900, () => this.champ?.play(idle)));
      };
      this.champ.play(idle);
      this.time.delayedCall(500, strike);
      this.time.addEvent({ delay: 4200, loop: true, callback: strike });
      this.ui.add(this.champ);
      this.champName = text(this, this.ui, wc.name.replace('The ', '').toUpperCase(), this.champColor).setOrigin(0.5);
    }
    if (lr) {
      const m = (v: number | null): string => (v !== null && v > 0 ? `${v.toFixed(1)} M` : '--');
      const lines: [string, number][] = [
        [`DISTANCE  ${m(lr.distance)}`, lr.record ? COLORS.good : lr.distance > 0 ? COLORS.text : COLORS.warn],
        [`BEST      ${m(lr.best)}`, COLORS.hot],
        [`DAMAGE    ${lr.damage}%`, COLORS.text],
      ];
      for (const [line, col] of lines) this.rows.push(text(this, this.ui, line, col));
    } else if (tr) {
      const lines: [string, number][] = [
        [`TIME      ${tr.cleared ? formatTicks(tr.ticks) : '--:--.--'}`, tr.record ? COLORS.good : COLORS.text],
        [`BEST      ${tr.best !== null ? formatTicks(tr.best) : '--:--.--'}`, COLORS.hot],
        [`TARGETS   ${tr.broken} / ${tr.total}`, tr.cleared ? COLORS.good : COLORS.warn],
      ];
      for (const [line, col] of lines) this.rows.push(text(this, this.ui, line, col));
    } else if (r) {
      const sorted = [...r.players].sort((a, b) => a.placement - b.placement);
      for (const p of sorted) {
        const name = (characterById(p.character)?.name ?? p.character).replace('The ', '');
        const who = `${p.placement}. ${nameOf(p)}`;
        const line = `${who.padEnd(9)} ${name.slice(0, 10).padEnd(10)} ${String(p.kos).padStart(3)}  ${String(p.falls).padStart(5)}  ${String(Math.round(p.damageDealt)).padStart(6)}  ${String(p.bestCombo ?? 0).padStart(5)}  ${String(timed ? p.kos - p.falls : p.stocks).padStart(6)}`;
        this.rows.push(text(this, this.ui, line, p.index === winner ? COLORS.hot : COLORS.p[p.index % 4]));
      }
    }
    const items: MenuItem[] = [];
    if (arcade) {
      const l = session.ladder!;
      if (outcome === 'next') items.push({ label: 'NEXT FIGHT', onConfirm: () => this.go('LadderMap') });
      else if (outcome === 'retry') items.push({ label: `CONTINUE (${l.continuesLeft} LEFT)`, onConfirm: () => this.go('LadderMap') });
      else if (outcome === 'champion') items.push({ label: 'CONTINUE', onConfirm: () => this.go('Story', { cards: endingCards(l), next: 'ModeSelect' }) });
      items.push({ label: outcome === 'gameover' ? 'MAIN MENU' : 'QUIT LADDER', onConfirm: () => this.go('ModeSelect') });
    } else if (tr || lr) {
      items.push({ label: 'RETRY', onConfirm: () => this.go('Match') }, { label: 'CHARACTER SELECT', onConfirm: () => this.go('CharacterSelect') }, { label: 'MAIN MENU', onConfirm: () => this.go('ModeSelect') });
    } else {
      items.push({ label: 'REMATCH', onConfirm: () => this.go('Match') });
      if (session.mode === 'versus' && session.replay) {
        items.push({ label: 'WATCH REPLAY', onConfirm: () => { session.watchReplay = true; this.go('Match'); } });
      }
      if (session.mode === 'versus') items.push({ label: 'STAGE SELECT', onConfirm: () => this.go('StageSelect') });
      items.push({ label: 'CHARACTER SELECT', onConfirm: () => this.go('CharacterSelect') }, { label: 'MAIN MENU', onConfirm: () => this.go('ModeSelect') });
    }
    this.list = new MenuList(this, this.ui, items);
    // a human loss in the arcade gets the sad version; everything else celebrates
    const humanLost = (arcade && winner !== 0) || (!!tr && !tr.cleared) || (!!lr && lr.distance <= 0);
    music.jingle(humanLost || winner < 0 ? 'lose' : 'win');
    if (!tr && !lr) {
      const champName = wc?.name.replace('The ', '');
      announcer.say(
        !r || winner < 0 ? 'No contest.' : arcade ? (outcome === 'gameover' ? 'Game over.' : winner === 0 ? `${champName} wins!` : 'Defeated.') : r.winnerTeam >= 0 ? `Team ${r.winnerTeam === 0 ? 'blue' : 'red'} wins!` : `The winner is ${champName}!`,
        { pitch: 0.55, rate: 0.98 },
      );
    }
  }

  protected override layoutUi(w: number, h: number, u: number): void {
    this.title.setScale(u * 5).setPosition(w / 2, h * 0.12);
    // champion on the left, the table and the menu on the right (everything centred when there is no winner)
    const side = this.champ ? w * 0.4 : w * 0.06;
    const tw = Math.max(1, textPx(this.head));
    const ts = Math.min(u * 1.2, (w - side - 28 * u) / tw);
    const tx = side + (w - side - tw * ts) / 2;
    this.head.setScale(ts).setPosition(tx, h * 0.27);
    this.rows.forEach((r, i) => r.setScale(ts).setPosition(tx, h * 0.27 + (14 + i * 12) * (ts / 1.2)));
    const pad = 5 * u;
    const top = h * 0.27 - pad;
    const bottom = h * 0.27 + (14 + Math.max(0, this.rows.length - 1) * 12 + 8) * (ts / 1.2) + pad;
    this.plate.clear();
    this.plate.fillStyle(0x07061a, 0.66).fillRect(tx - pad, top, tw * ts + pad * 2, bottom - top);
    this.plate.lineStyle(u, 0x3c3478, 0.9).strokeRect(tx - pad, top, tw * ts + pad * 2, bottom - top);
    this.plate.fillStyle(0x3c3478, 0.9).fillRect(tx, h * 0.27 + 10 * (ts / 1.2), tw * ts, Math.max(1, u / 2));
    this.list.layout(side + (w - side) / 2, h * 0.56, u, 120);
    if (this.champ) {
      const s = Math.max(0.6, Math.min(u * 3.2, (h * 0.5) / 64));
      this.floor = { x: w * 0.2, y: h * 0.78, s };
      this.champ.setScale(s * this.champK).setPosition(this.floor.x, this.floor.y);
      this.champName?.setScale(u * 2).setPosition(this.floor.x, this.floor.y + s * 10 + 9 * u);
    }
  }

  protected override tick(time: number, dt: number): void {
    this.list.update(time);
    const g = this.stageG;
    const f = this.fx;
    g.clear();
    f.clear();
    if (!this.champ) return;
    const { x, y, s } = this.floor;
    const pulse = 0.5 + 0.5 * Math.sin(time * 3);
    // spotlight cone and a glowing pedestal in the champion's colour
    f.fillStyle(this.champColor, 0.1 + 0.04 * pulse);
    f.fillTriangle(x - 6 * s, 0, x + 6 * s, 0, x + 34 * s, y);
    f.fillTriangle(x - 6 * s, 0, x - 34 * s, y, x + 34 * s, y);
    f.fillStyle(this.champColor, 0.35 + 0.15 * pulse).fillEllipse(x, y, 70 * s, 12 * s);
    g.fillStyle(0x1a1430, 1).fillRect(x - 34 * s, y, 68 * s, 10 * s);
    g.fillStyle(0x3a3060, 1).fillRect(x - 34 * s, y, 68 * s, 2 * s);
    g.fillStyle(this.champColor, 1).fillRect(x - 34 * s, y + 5 * s, 68 * s, 1 * s);
    this.champ.setY(y + Math.sin(time * 2) * 0.8);
    // confetti: a steady drizzle over the champion
    const step = Math.min(0.05, dt);
    if (this.confetti.length < 90 && Math.random() < 0.6) {
      const cols = [this.champColor, 0xffe14a, 0xffffff, 0x7affa0, 0xff7ab0];
      this.confetti.push({ x: x + (Math.random() - 0.5) * 120 * s, y: -10, vx: (Math.random() - 0.5) * 40, vy: 60 + Math.random() * 80, c: cols[Math.floor(Math.random() * cols.length)], r: Math.random() * 6, vr: (Math.random() - 0.5) * 8 });
    }
    for (const c of this.confetti) {
      c.x += (c.vx + Math.sin(time * 4 + c.r) * 30) * step;
      c.y += c.vy * step;
      c.r += c.vr * step;
      const cw = Math.abs(Math.cos(c.r)) * 2.5 * (s / 2) + 1;
      g.fillStyle(c.c, 1).fillRect(c.x - cw / 2, c.y, cw, 2.5 * (s / 2) + 1);
    }
    this.confetti = this.confetti.filter((c) => c.y < this.scale.height + 10);
  }

  protected onEvent(e: MenuEvent): void {
    this.list.handle(e);
  }
}
