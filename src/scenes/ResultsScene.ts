import { announcer } from '../audio/announcer';
import { challengeById, challengeCleared, challengeRules } from '../game/challenges';
import Phaser from 'phaser';
import { PIXEL_FONT, up } from '../art/pixelFont';
import { music } from '../audio/music';
import { formatTicks } from '../game/records';
import { characterById } from '../characters';
import { applyLadderResult, type LadderOutcome } from '../game/ladder';
import { endingCards } from '../game/story';
import { session } from '../game/session';
import { STAGES } from '../stages';
import type { MenuEvent } from '../input/menuInput';
import { ensurePalette, fighterAnimKey, fighterTextureKey, uiTexK } from '../art/proceduralFighter';
import { COLORS, MenuList, MenuScene, PANEL, drawPanel, text, textPx, type MenuBackdrop, type MenuItem } from '../ui/menuKit';

/** After a match: winner banner, per-player stats, and what to do next. */
export class ResultsScene extends MenuScene {
  private list!: MenuList;
  private hint!: Phaser.GameObjects.BitmapText;
  private title!: Phaser.GameObjects.BitmapText;
  private rows: Phaser.GameObjects.BitmapText[] = [];
  private head!: Phaser.GameObjects.BitmapText;
  /** Winner showcase: the champion on a lit pedestal with confetti. */
  private champ: Phaser.GameObjects.Sprite | null = null;
  private champLine: Phaser.GameObjects.BitmapText | null = null;
  private champK = 1;
  private champName: Phaser.GameObjects.BitmapText | null = null;
  private stageG!: Phaser.GameObjects.Graphics;
  /** Plate behind the results table. */
  private plate!: Phaser.GameObjects.Graphics;
  private fx!: Phaser.GameObjects.Graphics;
  private champColor = 0xffffff;
  private confetti: { x: number; y: number; vx: number; vy: number; c: number; r: number; vr: number; burst?: boolean }[] = [];
  /** A win worth celebrating (a human did not just lose): the banner slams in with a flash and confetti cannons fire. */
  private celebrate = false;
  private fired = false;
  /** Drawn over everything: the cannons' confetti, sparkles and the entrance flash. */
  private front!: Phaser.GameObjects.Graphics;
  /** Additive copy of the banner for its shine. */
  private titleGlow!: Phaser.GameObjects.BitmapText;
  private titleK = 1;
  private rowX = 0;
  private lastTick = -1;
  /** Gold bar behind the winner's row of the table (index into rows, -1: none). */
  private winRow = -1;
  private rowBand = { x: 0, w: 0, h: 0, ys: [] as number[] };
  private floor = { x: 0, y: 0, s: 1 };

  constructor() {
    super('Results');
  }

  protected build(): void {
    // the results play out in front of the stage you just fought on
    this.bg.setTheme(STAGES[session.stage]?.background.theme);
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
    const chal = session.mode === 'challenge' && r ? challengeById(session.challenge) : undefined;
    const chalClear = !!chal && !!r && challengeCleared(r);
    if (chal) label = chalClear ? 'CHALLENGE CLEAR!' : 'CHALLENGE FAILED';
    this.title = this.add.bitmapText(0, 0, PIXEL_FONT, label).setOrigin(0.5).setTint(r && r.winnerTeam >= 0 ? COLORS.p[r.winnerTeam] : winner >= 0 ? COLORS.p[winner % 4] : COLORS.title);
    this.titleGlow = this.add.bitmapText(0, 0, PIXEL_FONT, label).setOrigin(0.5).setTint(0xffffff).setAlpha(0).setBlendMode(Phaser.BlendModes.ADD);
    this.ui.add([this.title, this.titleGlow]);
    const timed = (chal ? challengeRules(chal) : session.rules).mode === 'time' && !arcade;
    this.head = text(this, this.ui, tr ? `TARGET SMASH  ${(characterById(tr.character)?.name ?? '').toUpperCase()}` : lr ? `LAUNCH CONTEST  ${(characterById(lr.character)?.name ?? '').toUpperCase()}` : `PLAYER    FIGHTER    KOS  FALLS  DAMAGE  COMBO  ${timed ? 'POINTS' : 'STOCKS'}`, COLORS.dim);
    this.stageG = this.add.graphics();
    this.fx = this.add.graphics().setBlendMode(Phaser.BlendModes.ADD);
    this.ui.add([this.stageG, this.fx]);
    this.champ = null;
    this.champLine = null;
    this.champName = null;
    this.confetti = [];
    this.fired = false;
    this.lastTick = -1;
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
      if (wc.persona?.victory) this.champLine = text(this, this.ui, up(`"${wc.persona.victory}"`), COLORS.dim).setOrigin(0.5);
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
        this.rows.push(text(this, this.ui, line, p.index === winner ? COLORS.hot : COLORS.p[p.team >= 0 ? p.team : p.index % 4]));
      }
    }
    const items: MenuItem[] = [];
    if (arcade) {
      const l = session.ladder!;
      if (outcome === 'next') items.push({ label: 'NEXT FIGHT', onConfirm: () => this.go('LadderMap') });
      else if (outcome === 'retry') items.push({ label: `CONTINUE (${l.continuesLeft} LEFT)`, onConfirm: () => this.go('LadderMap') });
      else if (outcome === 'champion') items.push({ label: 'CONTINUE', onConfirm: () => this.go('Story', { cards: endingCards(l), next: 'ModeSelect' }) });
      items.push({ label: outcome === 'gameover' ? 'MAIN MENU' : 'QUIT LADDER', onConfirm: () => this.go('ModeSelect') });
    } else if (chal) {
      items.push({ label: 'RETRY', onConfirm: () => this.go('Match') }, { label: 'CHALLENGES', onConfirm: () => this.go('Challenges') }, { label: 'MAIN MENU', onConfirm: () => this.go('ModeSelect') });
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
    this.hint = text(this, this.ui, 'UP/DOWN: MOVE   J / ENTER: SELECT   K / ESC: EXIT', COLORS.dim).setOrigin(0.5);
    // a human loss in the arcade gets the sad version; everything else celebrates
    const humanLost = (arcade && winner !== 0) || (!!tr && !tr.cleared) || (!!lr && lr.distance <= 0) || (!!chal && !chalClear);
    this.celebrate = !humanLost && (winner >= 0 || (!!tr && tr.cleared) || (!!lr && lr.distance > 0) || chalClear);
    this.winRow = !tr && !lr && winner >= 0 && this.rows.length ? 0 : -1;
    this.front = this.add.graphics();
    this.ui.add(this.front);
    music.jingle(humanLost || winner < 0 ? 'lose' : 'win', wc?.id);
    if (chal) announcer.say(chalClear ? 'Challenge complete!' : 'Try again.', { pitch: 0.55 });
    else if (!tr && !lr) {
      const champName = wc?.name.replace('The ', '');
      announcer.say(
        !r || winner < 0 ? 'No contest.' : arcade ? (outcome === 'gameover' ? 'Game over.' : winner === 0 ? `${champName} wins!` : 'Defeated.') : r.winnerTeam >= 0 ? `Team ${r.winnerTeam === 0 ? 'blue' : 'red'} wins!` : `The winner is ${champName}!`,
        { pitch: 0.55, rate: 0.98 },
      );
    }
  }

  protected override layoutUi(w: number, h: number, u: number): void {
    this.titleK = Math.min(u * 5, (w * 0.92) / Math.max(1, textPx(this.title)));
    this.title.setScale(this.titleK).setPosition(w / 2, h * 0.12);
    this.titleGlow.setScale(this.titleK).setPosition(w / 2, h * 0.12);
    // champion on the left, the table and the menu on the right (everything centred when there is no winner)
    const side = this.champ ? w * 0.4 : w * 0.06;
    const tw = Math.max(1, textPx(this.head));
    const ts = Math.min(u * 1.2, (w - side - 40 * u) / tw);
    const tx = side + (w - side - tw * ts) / 2;
    this.head.setScale(ts).setPosition(tx, h * 0.27);
    // rows on a 14-unit pitch: a clear gap between lines even when the table shrinks to fit
    this.rows.forEach((r, i) => r.setScale(ts).setPosition(tx, h * 0.27 + (17 + i * 14) * (ts / 1.2)));
    this.rowX = tx;
    this.rowBand = { x: tx - 2 * u, w: tw * ts + 4 * u, h: 12 * (ts / 1.2), ys: this.rows.map((r) => r.y - 2.5 * (ts / 1.2)) };
    const pad = 5 * u;
    const top = h * 0.27 - pad;
    const bottom = h * 0.27 + (17 + Math.max(0, this.rows.length - 1) * 14 + 8) * (ts / 1.2) + pad;
    this.plate.clear();
    drawPanel(this.plate, tx - pad, top, tw * ts + pad * 2, bottom - top, u, 0.92);
    this.plate.fillStyle(PANEL.border, 1).fillRect(tx, h * 0.27 + 11.5 * (ts / 1.2), tw * ts, Math.max(1, u / 2));
    this.list.layout(side + (w - side) / 2, h * 0.56, u, 120);
    this.placeFooter(this.hint);
    if (this.champ) {
      // sized so even a wide fighter (wings, staffs) stays on screen beside the table
      const s = Math.max(0.6, Math.min(u * 2.6, (h * 0.44) / 64, (w * 0.2) / 56));
      this.floor = { x: w * 0.23, y: h * 0.76, s };
      this.champ.setScale(s * this.champK).setPosition(this.floor.x, this.floor.y);
      this.champName?.setScale(Math.min(u * 2, (w * 0.36) / Math.max(1, textPx(this.champName)))).setPosition(this.floor.x, this.floor.y + s * 10 + 9 * u);
      if (this.champName && this.champLine) this.champLine.setScale(Math.min(u, (w * 0.38) / Math.max(1, textPx(this.champLine)))).setPosition(this.floor.x, this.champName.y + this.champName.displayHeight / 2 + 6 * u);
      // a plate under the name and quote so they read over any stage's ground
      if (this.champName) {
        const last = this.champLine ?? this.champName;
        const pw = Math.max(this.champName.displayWidth, last.displayWidth) + 12 * u;
        const top = Math.max(this.champName.y - this.champName.displayHeight / 2 - 4 * u, this.floor.y + this.floor.s * 10 + u);
        drawPanel(this.plate, this.floor.x - pw / 2, top, pw, last.y + last.displayHeight / 2 + 4 * u - top, u, 0.8);
      }
    }
  }

  protected override backdrop(): MenuBackdrop {
    // the spotlight and the table own the sky: no planet peeking out from behind the stats
    return { planet: null };
  }

  /** Ease-out 0..1 over `dur` seconds from `t0`. */
  private ease(time: number, t0: number, dur: number): number {
    const k = Math.max(0, Math.min(1, (time - t0) / dur));
    return 1 - Math.pow(1 - k, 3);
  }

  /** The entrance: banner slam and shine, table rows sliding in, then (for a win) the flash and two confetti cannons. */
  private entrance(time: number, dt: number): void {
    const u = this.u;
    const w = this.scale.width;
    const h = this.scale.height;
    const e = this.ease(time, 0.05, 0.28);
    this.title.setScale(this.titleK * (1 + (1 - e) * 1.4)).setAlpha(e);
    // a shine on landing, then a sweep every few seconds (a win also strobes it briefly)
    const land = time > 0.3 && time < 0.7 ? 0.8 * (1 - (time - 0.3) / 0.4) : 0;
    const ph = (time % 3.5) / 3.5;
    const sweep = ph < 0.2 ? 0.45 * Math.sin((ph / 0.2) * Math.PI) : 0;
    this.titleGlow.setScale(this.title.scaleX).setAlpha(Math.max(land, this.celebrate ? sweep : 0));
    // the rows slide in from the right one after another; the winner's row gets a gold band
    this.rows.forEach((r, i) => {
      const k = this.ease(time, 0.3 + i * 0.09, 0.3);
      r.setX(this.rowX + (1 - k) * 40 * u).setAlpha(k);
    });
    this.head.setAlpha(this.ease(time, 0.2, 0.3));
    const fg = this.front.clear();
    if (this.winRow >= 0) {
      const k = this.ease(time, 0.3, 0.3);
      const b = this.rowBand;
      this.stageG.fillStyle(COLORS.hot, (0.16 + 0.06 * Math.sin(time * 5)) * k).fillRect(b.x, b.ys[this.winRow], b.w * k, b.h);
    }
    if (!this.celebrate) return;
    // a white flash as the banner lands
    if (time > 0.3 && time < 0.65) fg.fillStyle(0xffffff, 0.35 * (1 - (time - 0.3) / 0.35)).fillRect(0, 0, w, h);
    if (!this.fired && time > 0.32) {
      this.fired = true;
      const cols = [this.champColor, 0xffe14a, 0xffffff, 0x7affa0, 0xff7ab0, 0x7fe8ff];
      for (let n = 0; n < 220; n++) {
        const left = n % 2 === 0;
        // flung up and inward from each bottom corner
        const ang = (left ? 1 : -1) * (0.12 + Math.random() * 0.5);
        const sp = (480 + Math.random() * 460) * (h / 720);
        this.confetti.push({ x: left ? 0 : w, y: h, vx: Math.sin(ang) * sp, vy: -Math.cos(ang) * sp, c: cols[n % cols.length], r: Math.random() * 6, vr: (Math.random() - 0.5) * 14, burst: true });
      }
    }
    // sparkles twinkling around the champion, and a ring of light bursting out from them as the banner lands
    if (this.champ) {
      const { x, y, s } = this.floor;
      if (time > 0.3 && time < 1.1) {
        const k = (time - 0.3) / 0.8;
        const rr = (10 + k * 70) * s;
        this.fx.lineStyle(Math.max(2, (1 - k) * 6 * s), this.champColor, 0.8 * (1 - k)).strokeEllipse(x, y - 28 * s, rr * 2, rr * 1.6);
        this.fx.lineStyle(Math.max(1, (1 - k) * 3 * s), 0xffffff, 0.6 * (1 - k)).strokeEllipse(x, y - 28 * s, rr * 1.6, rr * 1.28);
      }
      for (let i = 0; i < 7; i++) {
        const ph2 = (time * 0.9 + i * 0.37) % 1;
        const a = Math.sin(ph2 * Math.PI);
        const sx = x + Math.sin(i * 2.4 + Math.floor(time * 0.9 + i * 0.37) * 1.7) * 30 * s;
        const sy = y - 10 * s - ((i * 13 + Math.floor(time * 0.9 + i * 0.37) * 7) % 50) * s;
        const r = (1 + a * 2.5) * (s / 2) + 1;
        fg.fillStyle(0xffffff, a * 0.9).fillRect(sx - r, sy - 0.5, r * 2, 1.5).fillRect(sx - 0.75, sy - r, 1.5, r * 2);
        fg.fillStyle(0xffe14a, a * 0.6).fillRect(sx - 1, sy - 1, 2, 2);
      }
    }
    // the cannons' confetti: flung up from the bottom corners, slowed by the air, then fluttering down
    const step = Math.min(0.05, dt);
    const ps = Math.max(2, u);
    for (const c of this.confetti) {
      if (!c.burst) continue;
      c.vy += 620 * (h / 720) * step;
      c.vx *= 1 - 1.6 * step;
      if (c.vy > 90) c.vy = 90 + (c.vy - 90) * (1 - 4 * step);
      c.x += (c.vx + (c.vy > 0 ? Math.sin(time * 4 + c.r) * 40 : 0)) * step;
      c.y += c.vy * step;
      c.r += c.vr * step;
      const cw = Math.abs(Math.cos(c.r)) * ps * 2 + 1;
      fg.fillStyle(c.c, 1).fillRect(c.x - cw / 2, c.y, cw, ps * 2);
    }
    this.confetti = this.confetti.filter((c) => !c.burst || c.y < h + 10);
  }

  protected override tick(time: number, dt: number): void {
    this.list.update(time);
    // real elapsed time (the base class passes a fixed 1/60), so the confetti flies the same at any frame rate
    const real = this.lastTick < 0 ? 1 / 60 : Math.max(0, Math.min(0.05, time - this.lastTick));
    this.lastTick = time;
    dt = real;
    const g = this.stageG;
    const f = this.fx;
    g.clear();
    f.clear();
    this.entrance(time, dt);
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
    if (this.confetti.filter((c) => !c.burst).length < 90 && Math.random() < 0.6) {
      const cols = [this.champColor, 0xffe14a, 0xffffff, 0x7affa0, 0xff7ab0];
      this.confetti.push({ x: x + (Math.random() - 0.5) * 120 * s, y: -10, vx: (Math.random() - 0.5) * 40, vy: 60 + Math.random() * 80, c: cols[Math.floor(Math.random() * cols.length)], r: Math.random() * 6, vr: (Math.random() - 0.5) * 8 });
    }
    for (const c of this.confetti) {
      if (c.burst) continue;
      c.x += (c.vx + Math.sin(time * 4 + c.r) * 30) * step;
      c.y += c.vy * step;
      c.r += c.vr * step;
      const cw = Math.abs(Math.cos(c.r)) * 2.5 * (s / 2) + 1;
      g.fillStyle(c.c, 1).fillRect(c.x - cw / 2, c.y, cw, 2.5 * (s / 2) + 1);
    }
    this.confetti = this.confetti.filter((c) => c.burst || c.y < this.scale.height + 10);
  }

  protected onEvent(e: MenuEvent): void {
    if (this.list.handle(e)) return;
    // back jumps the cursor to the way out (main menu / quit ladder); confirming it is still a deliberate press
    if (e.action === 'back') this.list.index = this.list.items.length - 1;
  }
}
