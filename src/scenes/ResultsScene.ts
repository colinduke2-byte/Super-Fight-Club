import { PRIORITY, announcer } from '../audio/announcer';
import { TIER_COLORS, TIER_NAMES, challengeById, challengeCleared, challengeRules, goalText } from '../game/challenges';
import Phaser from 'phaser';
import { PIXEL_FONT, up } from '../art/pixelFont';
import { music } from '../audio/music';
import { formatSec, formatTicks } from '../game/records';
import { CHARACTER_LIST, characterById } from '../characters';
import { DIFFICULTY_NAMES, ENDLESS_CARRY, RUN_NAMES, continueLadder, currentFight, humanSideWon, isCoop, ladderOutcomeFor, ladderDifficulty, restartRun, runKind, type LadderOutcome, type LadderState } from '../game/ladder';
import { rerollRandomPicks } from '../game/quick';
import { bodyHalf, getLastTimeline, podiumShrink, podiumSpots } from '../game/results';
import { ResultsGraph } from '../ui/ResultsGraph';
import { creditsLine, endingCards, gameOverCard } from '../game/story';
import { activeTurns, restartTurns, standings, turnLabel } from '../game/turns';
import { session, teamName } from '../game/session';
import type { CharacterData } from '../engine/types';
import { OVERSEER_PHASE2_SKIN, requestOverseerPhase2 } from '../ui/BossCinematic';
import { STAGES } from '../stages';
import type { MenuEvent } from '../input/menuInput';
import { ensurePalette, fighterAnimKey, fighterTextureKey, uiTexK } from '../art/proceduralFighter';
import { playResultPose } from '../ui/FighterView';
import { COLORS, MenuList, MenuScene, PANEL, drawPanel, drawPortShape, text, textPx, type MenuBackdrop, type MenuItem } from '../ui/menuKit';
import { settings } from '../settings';
import type { MatchResult, PlayerResult } from '../game/session';

/** One award line on the results screen. */
export interface Award {
  title: string;
  index: number;
  detail: string;
}

/**
 * Awards from the match's results: one per category, given only to an outright leader (a tie gives nothing).
 * Optional stats (ledge grabs, the biggest launch, KOs by ultimate) are used when the result carries them.
 */
export function matchAwards(r: MatchResult, nameOf: (p: PlayerResult) => string): Award[] {
  const ps = r.players;
  if (ps.length < 2) return [];
  const out: Award[] = [];
  const top = (title: string, v: (p: PlayerResult) => number | undefined, min: number, detail: (n: number) => string, lowest = false): void => {
    const vals = ps.map((p) => ({ p, n: v(p) })).filter((x): x is { p: PlayerResult; n: number } => typeof x.n === 'number' && Number.isFinite(x.n));
    if (vals.length < 2) return;
    vals.sort((a, b) => (lowest ? a.n - b.n : b.n - a.n));
    if (vals[0].n === vals[1].n || (!lowest && vals[0].n < min)) return;
    out.push({ title, index: vals[0].p.index, detail: `${nameOf(vals[0].p)}  ${detail(vals[0].n)}` });
  };
  top('ULTIMATE KO', (p) => p.ultimateKos, 1, (n) => `${n} KO${n === 1 ? '' : 'S'} BY ULTIMATE`);
  top('BIGGEST LAUNCH', (p) => p.biggestLaunch, 1, (n) => `${Math.round(n)} M`);
  top('LEDGE LORD', (p) => p.ledgeGrabs, 3, (n) => `${n} LEDGE GRABS`);
  top('KO KING', (p) => p.kos, 2, (n) => `${n} KOS`);
  top('HEAVY HITTER', (p) => Math.round(p.damageDealt), 60, (n) => `${n}% DEALT`);
  top('COMBO ARTIST', (p) => p.bestCombo ?? 0, 4, (n) => `${n}-HIT COMBO`);
  top('UNTOUCHABLE', (p) => p.falls, 0, (n) => (n === 0 ? 'NEVER FELL' : `ONLY ${n} FALL${n === 1 ? '' : 'S'}`), true);
  top('FREQUENT FLYER', (p) => p.falls, 3, (n) => `${n} FALLS`);
  return out.slice(0, 3);
}

/** A five-pointed star: gold when lit, a dim outline otherwise. */
function drawStar(g: Phaser.GameObjects.Graphics, x: number, y: number, r: number, on: boolean): void {
  const pts: Phaser.Math.Vector2[] = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 === 0 ? r : r * 0.45;
    pts.push(new Phaser.Math.Vector2(x + Math.cos(a) * rr, y + Math.sin(a) * rr));
  }
  if (on) g.fillStyle(0xffd84a, 1).fillPoints(pts, true);
  else g.lineStyle(Math.max(1, r * 0.2), 0x5a5680, 1).strokePoints(pts, true);
}

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
  /** Runners-up on the lower steps of the podium (2nd, 3rd, 4th). */
  private runners: { sprite: Phaser.GameObjects.Sprite; k: number; place: number; color: number; port: number; tag: Phaser.GameObjects.BitmapText; x: number; y: number; half: number; dx?: number; hw?: number }[] = [];
  /** The champion's half-width in podium units (s = 1): big fighters push the lower steps outward. */
  private champHalf = 13;
  /** Sheet the champion's victory pose plays from (the boss swaps to its phase-2 sheet). */
  private champSkin = '';
  /** Per panel line: stars to draw after it (-1: none), and how many of them are lit. */
  private awardStars: number[] = [];
  private awardTexts: Phaser.GameObjects.BitmapText[] = [];
  private awardHead: Phaser.GameObjects.BitmapText | null = null;
  private awardPorts: number[] = [];

  /** Damage and stocks over the match (versus, arcade and challenge), swapped in for the table by the GRAPHS row. */
  private graph: ResultsGraph | null = null;
  private graphOn = false;
  /** The winner's row band, hidden while the graphs show. */
  private tableWinRow = -1;

  constructor() {
    super('Results');
  }

  protected build(): void {
    // the results play out in front of the stage you just fought on
    this.bg.setTheme(STAGES[session.stage]?.background.theme);
    this.rows = [];
    this.graph = null;
    this.graphOn = false;
    this.plate = this.add.graphics();
    this.ui.add(this.plate);
    const r = session.lastResult;
    const arcade = session.mode === 'arcade' && !!session.ladder;
    const winner = r ? r.winner : -1;
    // same names as the in-match tags: P1, CPU (numbered by port when there are several)
    const cpus = r ? r.players.filter((p) => p.type === 'cpu').length : 0;
    const nameOf = (p: { type: string; index: number }): string => (p.type === 'cpu' ? (cpus > 1 ? `CPU${p.index + 1}` : 'CPU') : `P${p.index + 1}`);
    const wp0 = r && winner >= 0 ? r.players.find((p) => p.index === winner) : undefined;
    let label = !r ? 'MATCH OVER' : winner < 0 ? 'DRAW' : r.winnerTeam >= 0 ? `TEAM ${teamName(r.winnerTeam)} WINS` : `${wp0 ? nameOf(wp0) : `P${winner + 1}`} WINS`;
    // arcade: record the fight and decide what comes next
    let outcome: LadderOutcome | null = null;
    const run = arcade ? runKind(session.ladder!) : null;
    const sideWon = humanSideWon(r);
    if (arcade) {
      const l = session.ladder!;
      outcome = ladderOutcomeFor(l, r, session.endDamage);
      const cleared = run === 'boss' ? 'OVERSEER DOWN!' : run === 'gauntlet' ? 'GAUNTLET CLEARED!' : 'LADDER CLEARED!';
      label = outcome === 'gameover' ? (run === 'endless' ? 'RUN OVER' : 'GAME OVER') : outcome === 'champion' ? cleared : sideWon ? 'VICTORY' : 'DEFEATED';
      if (outcome === 'gameover' && l.best?.newBest) label = 'NEW RECORD!';
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
    // the podium: runners-up (2nd to 4th) on the lower steps behind the winner (versus-style results only)
    this.runners = [];
    if (r && wp && wc && !tr && !lr) {
      const rest = [...r.players].filter((p) => p !== wp).sort((a, b) => a.placement - b.placement).slice(0, 3);
      rest.forEach((p, i) => {
        const c = characterById(p.character);
        if (!c) return;
        const skin = ensurePalette(this, c, p.palette ?? 0);
        const sprite = this.add.sprite(0, 0, fighterTextureKey(skin), 0).setOrigin(0.5, 1).setTint(0xb4acd4);
        this.losePose(sprite, c, skin);
        this.ui.add(sprite);
        if (this.endedEnraged(p)) this.enragedSkin(sprite, c, false);
        const port = p.team >= 0 ? p.team : p.index % 4;
        const color = COLORS.p[port];
        const tag = text(this, this.ui, `${p.placement}`, color).setOrigin(0.5);
        const shrink = podiumShrink(c);
        this.runners.push({ sprite, k: uiTexK(c) * shrink, place: i, color, port, tag, x: 0, y: 0, half: bodyHalf(c) * shrink });
      });
    }
    if (wp && wc) {
      this.champColor = parseInt(wc.sprite.placeholder.accent.slice(1), 16);
      this.champK = uiTexK(wc);
      const skin = ensurePalette(this, wc, wp.palette ?? 0);
      this.champ = this.add.sprite(0, 0, fighterTextureKey(skin), 0).setOrigin(0.5, 1);
      // victory: the fighter's own victory action, then its held end pose (loops); replayed every few seconds
      const idle = fighterAnimKey(skin, 'idle');
      this.champSkin = skin;
      const strike = (): void => {
        if (this.champ) playResultPose(this.champ, wc, this.champSkin, true);
      };
      this.champ.play(idle);
      this.time.delayedCall(500, strike);
      this.time.addEvent({ delay: 6000, loop: true, callback: strike });
      this.ui.add(this.champ);
      this.champK *= podiumShrink(wc);
      this.champHalf = bodyHalf(wc) * podiumShrink(wc);
      if (this.endedEnraged(wp)) this.enragedSkin(this.champ, wc, true);
      this.champName = text(this, this.ui, wc.name.replace('The ', '').toUpperCase(), this.champColor).setOrigin(0.5);
      if (wc.persona?.victory) this.champLine = text(this, this.ui, up(`"${wc.persona.victory}"`), COLORS.dim).setOrigin(0.5);
    }
    if (lr) {
      const m = (v: number | null): string => (v !== null && v > 0 ? `${v.toFixed(1)} M` : '--');
      // the comparison with the best before this run (every run flies the same standard dummy, so they compare fairly)
      const prev = lr.prevBest ?? null;
      const diff = prev !== null && prev > 0 && lr.distance > 0 ? lr.distance - prev : null;
      const dummy = lr.dummy ? characterById(lr.dummy) : undefined;
      const detail = lr as typeof lr & { attempts?: { distance: number; damage: number }[]; boardPlace?: number };
      const lines: [string, number][] = [
        [`DISTANCE  ${m(lr.distance)}`, lr.record ? COLORS.good : lr.distance > 0 ? COLORS.text : COLORS.warn],
        [`BEST      ${m(lr.best)}`, COLORS.hot],
        [`VS BEST   ${diff === null ? (lr.record ? 'FIRST RECORD' : '--') : `${diff >= 0 ? '+' : '-'}${Math.abs(diff).toFixed(1)} M`}`, diff !== null && diff > 0 ? COLORS.good : COLORS.dim],
        [`DAMAGE    ${lr.damage}%`, COLORS.text],
        ...(dummy ? [[`DUMMY     ${dummy.name.replace('The ', '').toUpperCase()} (${dummy.stats.weight} WEIGHT)`, COLORS.dim] as [string, number]] : []),
        // every attempt of the run, and where the best one landed on the fighter's top five
        ...(detail?.attempts && detail.attempts.length > 1 ? [[`ATTEMPTS  ${detail.attempts.map((a) => (a.distance > 0 ? a.distance.toFixed(1) : '--')).join('  /  ')}`, COLORS.dim] as [string, number]] : []),
        ...(detail && typeof detail.boardPlace === 'number' ? [[detail.boardPlace >= 0 ? `TOP FIVE  #${detail.boardPlace + 1}` : 'TOP FIVE  NOT THIS TIME', detail.boardPlace >= 0 ? COLORS.good : COLORS.dim] as [string, number]] : []),
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
    this.awardTexts = [];
    this.awardPorts = [];
    this.awardStars = [];
    this.awardHead = null;
    const note = (line: string, color: number, stars = -1): void => {
      this.awardTexts.push(text(this, this.ui, up(line), color));
      this.awardPorts.push(-1);
      this.awardStars.push(stars);
    };
    const clear = arcade && outcome === 'champion' ? session.ladder!.clear : undefined;
    const chalRun = chal && session.challengeRun?.id === chal.id ? session.challengeRun : null;
    const turns = activeTurns();
    const runCard = arcade && run !== 'arcade' ? this.runCard(session.ladder!, outcome!) : null;
    if (runCard) {
      // Endless, Gauntlet and Boss Battle: where the run stands, and what it improved
      this.awardHead = text(this, this.ui, runCard.head, runCard.good ? COLORS.good : COLORS.title);
      for (const [line, col] of runCard.lines) note(line, col);
    } else if (clear) {
      // the clear card: the run's score, its stars and what it improved
      const l = session.ladder!;
      this.awardHead = text(this, this.ui, clear.firstClear ? 'ARCADE CLEAR  FIRST CLEAR!' : 'ARCADE CLEAR', COLORS.title);
      note(`SCORE      ${clear.score.toLocaleString('en-US')}${clear.newBestScore ? '   NEW BEST!' : ''}`, clear.newBestScore || clear.firstClear ? COLORS.good : COLORS.text);
      note(`STARS     ${'       '}${clear.stars > clear.prevStars ? '  NEW STAR!' : ''}`, clear.stars > clear.prevStars ? COLORS.good : COLORS.text, clear.stars);
      note(`${DIFFICULTY_NAMES[ladderDifficulty(l)]}   KOS ${l.kos}   TIME ${formatSec(l.seconds)}${clear.newBestTime ? ' (BEST)' : ''}   CONTINUES ${l.continuesUsed}`, COLORS.hint);
    } else if (chalRun) {
      // the medal this run earned, each goal met or missed, and what it improved
      const run = chalRun;
      const c = chal!;
      this.awardHead = text(this, this.ui, `MEDAL  ${run.earned ? TIER_NAMES[run.earned] : 'NONE'}`, TIER_COLORS[run.earned]);
      note(`BRONZE  CLEAR             ${run.earned ? 'MET' : 'MISSED'}`, run.earned ? TIER_COLORS[1] : COLORS.dim);
      note(`SILVER  ${goalText(c.silver).padEnd(18)}${run.silverMet ? 'MET' : 'MISSED'}`, run.silverMet ? TIER_COLORS[2] : COLORS.dim);
      note(`GOLD    ${goalText(c.gold).padEnd(18)}${run.goldMet && run.silverMet ? 'MET' : run.goldMet ? 'MET (NEEDS SILVER)' : 'MISSED'}`, run.goldMet && run.silverMet ? TIER_COLORS[3] : COLORS.dim);
      const news = [run.firstClear ? 'FIRST CLEAR!' : '', run.newTier && !run.firstClear ? `NEW BEST MEDAL: ${TIER_NAMES[run.tier]}` : '', run.newBestTime ? `NEW BEST TIME ${formatSec(run.durationSec)}` : ''].filter(Boolean);
      if (news.length) note(news.join('   '), COLORS.good);
    } else if (turns && (tr || lr)) {
      // take turns: everyone's result so far, best first
      this.awardHead = text(this, this.ui, 'STANDINGS', COLORS.title);
      for (const row of standings(turns)) note(`${row.result ? `${row.place}.` : '-'}  ${turnLabel(turns, row.player)}  ${(characterById(turns.players[row.player]?.character ?? '')?.name ?? '').replace('The ', '').toUpperCase().padEnd(10)} ${row.result?.text ?? 'WAITING'}`, row.result && row.place === 1 ? COLORS.good : COLORS.text);
    } else if (r && !tr && !lr && !arcade && !chal) {
      const awards = matchAwards(r, nameOf);
      if (awards.length) {
        this.awardHead = text(this, this.ui, 'AWARDS', COLORS.title);
        for (const a of awards) {
          const p = r.players.find((q) => q.index === a.index)!;
          const port = p.team >= 0 ? p.team : p.index % 4;
          this.awardTexts.push(text(this, this.ui, `${a.title.padEnd(15)}${a.detail}`, COLORS.p[port]));
          this.awardPorts.push(port);
        }
      }
    }
    const items: MenuItem[] = [];
    const tl = r && !tr && !lr && (session.mode === 'versus' || session.mode === 'arcade' || session.mode === 'challenge') ? getLastTimeline() : null;
    if (tl && r) {
      const graph = new ResultsGraph(this, this.ui, tl, r.players.map((p, i) => ({ label: nameOf(p), color: COLORS.p[i % 4] })));
      graph.setVisible(false);
      this.graph = graph;
    }
    // the stat table or the graphs (ALT also swaps them)
    const graphRow: MenuItem | null = this.graph ? { label: 'GRAPHS', value: () => (this.graphOn ? 'ON' : 'OFF'), onConfirm: () => this.toggleGraph(), onLeft: () => this.toggleGraph(), onRight: () => this.toggleGraph() } : null;
    const watch: MenuItem | null = session.replay && (session.replay.mode ?? 'versus') === session.mode && !tr && !lr ? { label: 'WATCH REPLAY', onConfirm: () => { session.watchReplay = true; this.go('Match'); } } : null;
    if (arcade && run !== 'arcade') {
      // Endless, Gauntlet and Boss Battle: no continues; a lost (or finished) run starts over
      const l = session.ladder!;
      if (outcome === 'next') items.push({ label: run === 'endless' ? 'NEXT ROUND' : 'NEXT FIGHT', onConfirm: () => this.go('LadderMap') });
      else {
        items.push({
          label: outcome === 'champion' ? 'PLAY AGAIN' : 'RETRY',
          onConfirm: () => {
            session.ladder = restartRun(l);
            this.go('LadderMap');
          },
        });
      }
      if (watch) items.push(watch);
      const quit = outcome === 'gameover' ? (): void => this.go('Story', { cards: [gameOverCard(l)], next: 'ModeSelect' }) : (): void => this.go('ModeSelect');
      items.push({ label: outcome === 'next' ? `QUIT ${RUN_NAMES[run!]}` : 'MAIN MENU', onConfirm: quit });
    } else if (arcade) {
      const l = session.ladder!;
      if (outcome === 'next') items.push({ label: 'NEXT FIGHT', onConfirm: () => this.go('LadderMap') });
      else if (outcome === 'retry') items.push({ label: `CONTINUE (${l.continuesLeft} LEFT)`, onConfirm: () => this.go('LadderMap') });
      // the ending, then the staff roll (which takes the champion for its finale)
      else if (outcome === 'champion') items.push({ label: 'CONTINUE', onConfirm: () => this.go('Story', { cards: endingCards(l), next: 'Credits', nextData: { ending: true, fighter: l.player, next: 'ModeSelect', lines: creditsLine(l) } }) });
      if (outcome === 'gameover') {
        // out of continues: carry on as another fighter, or on an easier setting, from the same fight (each costs score)
        const roster = CHARACTER_LIST.map((c) => c.id);
        let pickIdx = Math.max(0, roster.indexOf(l.player));
        const step = (d: number): void => {
          pickIdx = (pickIdx + d + roster.length) % roster.length;
        };
        step(1);
        items.push({
          label: 'CONTINUE AS',
          value: () => (characterById(roster[pickIdx])?.name ?? roster[pickIdx]).replace('The ', '').toUpperCase(),
          onLeft: () => step(-1),
          onRight: () => step(1),
          onConfirm: () => {
            const id = roster[pickIdx];
            if (!continueLadder(l, { player: id })) return;
            if (session.arcadeHuman) session.arcadeHuman = { ...session.arcadeHuman, character: id, palette: 0, random: false, randomOutfit: false };
            this.go('LadderMap');
          },
          hint: 'ANOTHER FIGHTER TAKES OVER FROM THIS FIGHT',
        });
        if (ladderDifficulty(l) > 1) {
          items.push({
            label: `RETRY ON ${DIFFICULTY_NAMES[ladderDifficulty(l) - 1]}`,
            onConfirm: () => {
              if (continueLadder(l, { easier: true })) this.go('LadderMap');
            },
          });
        }
        if (watch) items.push(watch);
        items.push({ label: 'QUIT', onConfirm: () => this.go('Story', { cards: [gameOverCard(l)], next: 'ModeSelect' }) });
      } else {
        if (watch) items.push(watch);
        items.push({ label: 'QUIT LADDER', onConfirm: () => this.go('ModeSelect') });
      }
    } else if (chal) {
      items.push({ label: 'RETRY', onConfirm: () => this.go('Match') });
      if (watch) items.push(watch);
      items.push({ label: 'CHALLENGES', onConfirm: () => this.go('Challenges') }, { label: 'MAIN MENU', onConfirm: () => this.go('ModeSelect') });
    } else if (tr || lr) {
      items.push({
        label: turns ? 'PLAY AGAIN' : 'RETRY',
        onConfirm: () => {
          if (turns) restartTurns(); // everyone takes their turn again, from player 1
          this.go('Match');
        },
      }, { label: 'CHARACTER SELECT', onConfirm: () => this.go('CharacterSelect') }, { label: 'MAIN MENU', onConfirm: () => this.go('ModeSelect') });
    } else {
      items.push({
        label: 'REMATCH',
        onConfirm: () => {
          if (session.mode === 'versus') rerollRandomPicks(session.players); // RANDOM picks (fighter, outfit, stage) roll again
          this.go('Match');
        },
      });
      if (watch) items.push(watch);
      if (session.mode === 'versus') items.push({ label: 'STAGE SELECT', onConfirm: () => this.go('StageSelect') });
      items.push({ label: 'CHARACTER SELECT', onConfirm: () => this.go('CharacterSelect') }, { label: 'MAIN MENU', onConfirm: () => this.go('ModeSelect') });
    }
    if (graphRow) items.splice(Math.max(0, items.length - 1), 0, graphRow);
    this.list = new MenuList(this, this.ui, items);
    this.hint = text(this, this.ui, '', COLORS.dim).setOrigin(0.5);
    this.bindFooter(this.hint, [['updown', 'MOVE'], ['confirm', 'SELECT'], ['back', 'EXIT']]);
    // a human loss in the arcade gets the sad version; everything else celebrates
    const humanLost = (arcade && !sideWon) || (!!tr && !tr.cleared) || (!!lr && lr.distance <= 0) || (!!chal && !chalClear);
    this.celebrate = !humanLost && (winner >= 0 || (!!tr && tr.cleared) || (!!lr && lr.distance > 0) || chalClear);
    this.winRow = !tr && !lr && winner >= 0 && this.rows.length ? 0 : -1;
    this.front = this.add.graphics();
    this.ui.add(this.front);
    // the boss falling (the arcade's last fight, a Boss Battle) gets its own fanfare
    if (arcade && outcome === 'champion' && (run === 'arcade' || run === 'boss')) music.sting('bossClear', 'results');
    else music.jingle(humanLost || (winner < 0 && !sideWon) ? 'lose' : 'win', wc?.id);
    if (chal) announcer.say(chalClear ? 'Challenge complete!' : 'Try again.', { pitch: 0.55 });
    else if (!tr && !lr) {
      const champName = wc?.name.replace('The ', '');
      announcer.say(
        !r || (winner < 0 && r.winnerTeam < 0) ? 'No contest.' : arcade ? (outcome === 'gameover' ? 'Game over.' : outcome === 'champion' ? (run === 'boss' ? 'The Overseer is down!' : run === 'gauntlet' ? 'Gauntlet cleared!' : 'Ladder cleared!') : sideWon ? `${champName} wins!` : 'Defeated.') : r.winnerTeam >= 0 ? `Team ${teamName(r.winnerTeam).toLowerCase()} wins!` : `The winner is ${champName}!`,
        { pitch: 0.55, rate: 0.98, priority: PRIORITY.result },
      );
    }
  }

  /** Endless, Gauntlet and Boss Battle: the run's card under the results (where it stands, what it improved). */
  private runCard(l: LadderState, outcome: LadderOutcome): { head: string; good: boolean; lines: [string, number][] } {
    const d = `${DIFFICULTY_NAMES[ladderDifficulty(l)]}${isCoop(l) ? '  CO-OP' : ''}`;
    const best = l.best;
    const bestLine = (fmt: (v: number) => string, what: string): [string, number] => (best?.newBest ? [`NEW BEST ${what}!${best.prev !== null ? `  (WAS ${fmt(best.prev)})` : ''}`, COLORS.good] : [`BEST ${what}  ${best?.prev !== null && best?.prev !== undefined ? fmt(best.prev) : '--'}`, COLORS.hot]);
    switch (runKind(l)) {
      case 'endless': {
        if (outcome === 'next') {
          const next = currentFight(l);
          return { head: `ROUND ${l.index} CLEARED`, good: true, lines: [[`WINS ${l.index}   KOS ${l.kos}   ${d}`, COLORS.text], [`NEXT ROUND: YOU START AT ${next.playerDamage ?? 0}% (${Math.round(ENDLESS_CARRY * 100)}% CARRIED OVER)`, COLORS.hint]] };
        }
        return { head: 'ENDLESS RESULTS', good: !!best?.newBest, lines: [[`WINS ${l.index}   KOS ${l.kos}   TIME ${formatSec(l.seconds)}   ${d}`, COLORS.text], bestLine((v) => `${v} WINS`, 'RUN')] };
      }
      case 'gauntlet': {
        const n = l.fights.length;
        if (outcome === 'next') {
          const next = currentFight(l);
          return { head: `${l.index} OF ${n} DOWN`, good: true, lines: [[`STOCKS LEFT ${l.stocksLeft ?? next.playerStocks}   NEXT FIGHT AT ${next.playerDamage ?? 0}%`, COLORS.text], [`TIME ${formatSec(l.seconds)}   ${d}`, COLORS.hint]] };
        }
        if (outcome === 'champion') return { head: 'GAUNTLET CLEARED', good: true, lines: [[`ALL ${n} BEATEN   TIME ${formatSec(l.seconds)}   ${d}`, COLORS.text], bestLine(formatSec, 'TIME')] };
        return { head: 'GAUNTLET OVER', good: false, lines: [[`${l.index} OF ${n} BEATEN   TIME ${formatSec(l.seconds)}   ${d}`, COLORS.text]] };
      }
      default: {
        if (outcome === 'champion') return { head: 'BOSS BATTLE CLEAR', good: true, lines: [[`TIME ${formatSec(l.seconds)}   ${d}`, COLORS.text], bestLine(formatSec, 'TIME')] };
        return { head: 'THE OVERSEER STANDS', good: false, lines: [[`${d}   RETRY, OR PICK AN EASIER SETTING`, COLORS.text]] };
      }
    }
  }

  /** GRAPHS: the damage / stock graphs in place of the stat table, and back. */
  private toggleGraph(): void {
    const g = this.graph;
    if (!g) return;
    const on = !this.graphOn;
    this.graphOn = on;
    g.setVisible(on);
    this.head.setVisible(!on);
    for (const r of this.rows) r.setVisible(!on);
    if (on) this.tableWinRow = this.winRow;
    this.winRow = on ? -1 : this.tableWinRow;
    this.layoutUi(this.scale.width, this.scale.height, this.u);
  }

  /** A fighter that did not win: its lose row when the sheet has one, else a still, neutral stance (the first idle frame). */
  private losePose(sprite: Phaser.GameObjects.Sprite, c: CharacterData, skin: string): void {
    if (c.sprite.animations.lose) playResultPose(sprite, c, skin, false);
    else {
      sprite.anims.stop();
      sprite.setFrame(this.anims.get(fighterAnimKey(skin, 'idle'))?.frames[0]?.frame.name ?? 0);
    }
  }

  /** The boss finished the match in its second phase (its last stock or out): it is shown in its enraged look. */
  private endedEnraged(p: PlayerResult): boolean {
    return p.character === 'overseer' && (p.eliminated || p.stocks <= 1);
  }

  /** Swap a boss sprite to the phase-2 sheet once it is built (off the main thread; freed when this screen closes). */
  private enragedSkin(sprite: Phaser.GameObjects.Sprite, c: CharacterData, won: boolean): void {
    const visit = this.visitId;
    const apply = (): void => {
      if (!this.isVisit(visit) || !sprite.active) return;
      sprite.setTexture(fighterTextureKey(OVERSEER_PHASE2_SKIN));
      if (won) {
        this.champSkin = OVERSEER_PHASE2_SKIN;
        playResultPose(sprite, c, OVERSEER_PHASE2_SKIN, true);
      }
      else this.losePose(sprite, c, OVERSEER_PHASE2_SKIN);
    };
    requestOverseerPhase2(this).then(apply, (err: unknown) => console.warn('[results] phase-2 sheet failed', err));
  }

  protected override layoutUi(w: number, h: number, u: number): void {
    this.titleK = Math.min(u * 5, (w * 0.92) / Math.max(1, textPx(this.title)));
    this.title.setScale(this.titleK).setPosition(w / 2, h * 0.12);
    this.titleGlow.setScale(this.titleK).setPosition(w / 2, h * 0.12);
    // champion on the left, the table and the menu on the right (everything centred when there is no winner); a portrait
    // phone stacks them instead: the table and the menu full width, the podium along the bottom
    const portrait = h > w * 1.1;
    const side = this.champ && !portrait ? w * 0.4 : w * 0.06;
    const tw = Math.max(1, textPx(this.head));
    const ts = Math.min(u * 1.2, (w - side - 40 * u) / tw);
    const tx = side + (w - side - tw * ts) / 2;
    this.head.setScale(ts).setPosition(tx, h * 0.27);
    // rows on a 14-unit pitch: a clear gap between lines even when the table shrinks to fit
    this.rows.forEach((r, i) => r.setScale(ts).setPosition(tx, h * 0.27 + (17 + i * 14) * (ts / 1.2)));
    this.rowX = tx;
    this.rowBand = { x: tx - 2 * u, w: tw * ts + 4 * u, h: 12 * (ts / 1.2), ys: this.rows.map((r) => r.y - 2.5 * (ts / 1.2)) };
    this.graph?.layout(tx, h * 0.27 - 4 * u, tw * ts, Math.max(60 * u, (17 + Math.max(4, this.rows.length) * 14) * (ts / 1.2) + 8 * u), u);
    const pad = 5 * u;
    const top = h * 0.27 - pad;
    const bottom = h * 0.27 + (17 + Math.max(0, this.rows.length - 1) * 14 + 8) * (ts / 1.2) + pad;
    this.plate.clear();
    drawPanel(this.plate, tx - pad, top, tw * ts + pad * 2, bottom - top, u, 0.92);
    this.plate.fillStyle(PANEL.border, 1).fillRect(tx, h * 0.27 + 11.5 * (ts / 1.2), tw * ts, Math.max(1, u / 2));
    const footTop = this.placeFooter(this.hint);
    // awards under the table, then the menu
    let listTop = portrait ? bottom + 18 * u : h * 0.56;
    if (this.awardHead) {
      const ak = Math.min(u, ts);
      let ay = bottom + 9 * u;
      const ax = tx;
      this.awardHead.setScale(ak).setPosition(ax, ay);
      ay += 7 * ak + 4 * u;
      const aw = Math.max(textPx(this.awardHead), ...this.awardTexts.map((t) => textPx(t))) * ak + 10 * u;
      const ah = 7 * ak + 4 * u + this.awardTexts.length * (7 * ak + 4 * u);
      drawPanel(this.plate, ax - 4 * u, bottom + 6 * u, Math.min(aw + 6 * u, tw * ts + pad * 2), ah + 4 * u, u, 0.85);
      this.awardTexts.forEach((t, i) => {
        t.setScale(Math.min(ak, (tw * ts - 8 * u) / Math.max(1, textPx(t)))).setPosition(ax + 8 * u, ay);
        const port = this.awardPorts[i];
        if (port >= 0) drawPortShape(this.plate, port, ax + 3 * u, ay + (7 * t.scaleY) / 2, 1.5 * u, COLORS.p[port], 1, Math.max(1, u / 2));
        // the clear card's stars, in the gap left for them after "STARS"
        const lit = this.awardStars[i] ?? -1;
        if (lit >= 0) {
          const cw = t.displayWidth / Math.max(1, t.text.length);
          const r = 3.2 * t.scaleY;
          for (let k = 0; k < 3; k++) drawStar(this.plate, t.x + cw * (11 + k * 2.4), ay + (7 * t.scaleY) / 2, r, k < lit);
        }
        ay += 7 * ak + 4 * u;
      });
      listTop = Math.max(listTop, ay + 14 * u);
    }
    // the podium's ground line: the winner's name (and quote) below it must end above the footer
    let podiumTop = footTop;
    if (this.champ) {
      // sized so even a wide fighter (wings, staffs, the boss) stays on screen beside the table
      const nr = this.runners.length;
      // 2nd on the left step, 3rd on the right, 4th one step further right and lower; big fighters push the steps outward
      const spots = podiumSpots(this.champHalf, this.runners.map((rn, i) => rn.half * (i === 2 ? 0.62 : 0.72)));
      // the podium's extent in units of s, either side of the winner (the winner's own step is 34 each way)
      const left = Math.max(34, this.champHalf, ...spots.map((p) => -(p.dx - p.hw)));
      const right = Math.max(34, this.champHalf, ...spots.map((p) => p.dx + p.hw));
      const span = left + right + (nr === 0 ? 0 : 6);
      const room = portrait ? w - 6 * u : side - 6 * u; // everything left of the table (portrait: the full width)
      const s = Math.max(0.5, Math.min(u * 2.6, (h * (portrait ? 0.2 : 0.44)) / 64, (room * 0.96) / span, nr === 0 && !portrait ? (w * 0.2) / 56 : Infinity));
      // centred in the room left of the table (never past either edge)
      const fx = Math.max(3 * u + left * s, Math.min(room - right * s, room / 2 + ((left - right) / 2) * s));
      // what hangs below the ground line: the steps, the name and (on taller windows) the quote, all above the footer
      const nameK = this.champName ? Math.min(u * 2, (w * (portrait ? 0.8 : 0.36)) / Math.max(1, textPx(this.champName))) : 0;
      const quote = !!this.champLine && (h >= 500 || !this.runners.length);
      const quoteK = this.champLine ? Math.min(u, (w * (portrait ? 0.9 : 0.38)) / Math.max(1, textPx(this.champLine))) : 0;
      const below = s * (nr ? 16 : 10) + 9 * u + 3.5 * nameK + 4 * u + (quote ? 6 * u + 7 * quoteK : 0);
      const fy = Math.min(h * 0.74, footTop - 3 * u - below);
      this.floor = { x: nr === 0 && !portrait ? w * 0.22 : fx, y: fy, s };
      podiumTop = fy - 70 * s;
      this.champ.setScale(s * this.champK).setPosition(this.floor.x, this.floor.y);
      this.runners.forEach((rn, i) => {
        const { dx, dy, hw } = spots[i];
        rn.dx = dx;
        rn.hw = hw;
        rn.x = this.floor.x + dx * s;
        rn.y = this.floor.y + dy * s;
        rn.sprite.setScale(s * (i === 2 ? 0.62 : 0.72) * rn.k).setPosition(rn.x, rn.y);
        // the place number sits on the front of its own step, sized to fit inside it (never down into the winner's name)
        const front = (16 - dy) * s;
        const tk = Math.max(1, Math.min(Math.round(s * 1.1), Math.floor((front * 0.7) / 7)));
        rn.tag.setScale(tk).setPosition(rn.x + 2 * s, rn.y + front * 0.55);
      });
      this.champName?.setScale(nameK).setPosition(this.floor.x, this.floor.y + s * (this.runners.length ? 16 : 10) + 9 * u);
      // short windows (phones held sideways) drop the victory quote: there is no room under the podium
      this.champLine?.setVisible(quote);
      if (this.champName && this.champLine && this.champLine.visible) this.champLine.setScale(quoteK).setPosition(this.floor.x, this.champName.y + this.champName.displayHeight / 2 + 6 * u);
      // a plate under the name and quote so they read over any stage's ground (kept on screen beside the table)
      if (this.champName) {
        const last = this.champLine?.visible ? this.champLine : this.champName;
        const pw = Math.max(this.champName.displayWidth, last.displayWidth) + 12 * u;
        const nx = Math.max(pw / 2 + 4 * u, Math.min(this.floor.x, (portrait ? w : side) - pw / 2 - 4 * u));
        this.champName.setX(nx);
        this.champLine?.setX(nx);
        const top = Math.max(this.champName.y - this.champName.displayHeight / 2 - 4 * u, this.floor.y + this.floor.s * (this.runners.length ? 16 : 10) + u);
        drawPanel(this.plate, nx - pw / 2, top, pw, last.y + last.displayHeight / 2 + 4 * u - top, u, 0.8);
      }
    }
    // the menu always ends above the footer (and, stacked, above the podium): when room is short it starts higher and scrolls
    const listBottom = (portrait ? Math.min(footTop, podiumTop) : footTop) - 6 * u;
    listTop = Math.min(listTop, listBottom - 40 * u);
    const lcx = portrait ? w / 2 : side + (w - side) / 2;
    const want = this.list.items.some((i) => i.value) ? 180 : 140;
    this.list.layout(lcx, listTop, u, Math.min(want, (2 * Math.min(lcx, w - lcx) - 8 * u) / u), listBottom);
  }

  protected override backdrop(): MenuBackdrop {
    // the spotlight and the table own the sky: no planet peeking out from behind the stats
    return { planet: null };
  }

  /** Ease-out 0..1 over `dur` seconds from `t0`. */
  private ease(time: number, t0: number, dur: number): number {
    if (settings.reduceMotion) return 1;
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
    if (!settings.reduceFlashes && time > 0.3 && time < 0.65) fg.fillStyle(0xffffff, 0.35 * (1 - (time - 0.3) / 0.35)).fillRect(0, 0, w, h);
    if (!this.fired && time > 0.32 && !settings.reduceMotion) {
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
    const pulse = settings.reduceMotion ? 0.5 : 0.5 + 0.5 * Math.sin(time * 3);
    // the lower steps: a dark block per runner-up with a stripe in their colour and their place on the front
    for (const rn of this.runners) {
      const hw = (rn.hw ?? (rn.place === 2 ? 15 : 18)) * s;
      const ph = y + 16 * s - rn.y;
      g.fillStyle(0x141028, 1).fillRect(rn.x - hw, rn.y, hw * 2, ph);
      g.fillStyle(0x2e2650, 1).fillRect(rn.x - hw, rn.y, hw * 2, 1.5 * s);
      g.fillStyle(rn.color, 0.8).fillRect(rn.x - hw, rn.y + 3 * s, hw * 2, 0.8 * s);
      if (settings.portShapes) drawPortShape(g, rn.port, rn.x - hw + 4 * s, rn.y + ph * 0.6, 1.6 * s, rn.color, 1, Math.max(1, s * 0.4));
    }
    // spotlight cone and a glowing pedestal in the champion's colour
    f.fillStyle(this.champColor, 0.1 + 0.04 * pulse);
    f.fillTriangle(x - 6 * s, 0, x + 6 * s, 0, x + 34 * s, y);
    f.fillTriangle(x - 6 * s, 0, x - 34 * s, y, x + 34 * s, y);
    f.fillStyle(this.champColor, 0.35 + 0.15 * pulse).fillEllipse(x, y, 70 * s, 12 * s);
    g.fillStyle(0x1a1430, 1).fillRect(x - 24 * s, y, 48 * s, 16 * s);
    g.fillStyle(0x1a1430, 1).fillRect(x - 34 * s, y, 68 * s, 10 * s);
    g.fillStyle(0x3a3060, 1).fillRect(x - 34 * s, y, 68 * s, 2 * s);
    g.fillStyle(this.champColor, 1).fillRect(x - 34 * s, y + 5 * s, 68 * s, 1 * s);
    this.champ.setY(y + (settings.reduceMotion ? 0 : Math.sin(time * 2) * 0.8));
    // confetti: a steady drizzle over the champion
    const step = Math.min(0.05, dt);
    if (!settings.reduceMotion && this.confetti.filter((c) => !c.burst).length < 90 && Math.random() < 0.6) {
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
    if (e.action === 'alt' && this.graph) {
      this.toggleGraph();
      return;
    }
    // back jumps the cursor to the way out (main menu / quit ladder); confirming it is still a deliberate press
    if (e.action === 'back') this.list.index = this.list.items.length - 1;
  }
}
