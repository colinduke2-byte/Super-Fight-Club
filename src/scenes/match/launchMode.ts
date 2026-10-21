import type Phaser from 'phaser';
import { announcer } from '../../audio/announcer';
import { sfx } from '../../audio/sfx';
import { lastSpecialMedal, recordSpecialRun, TIER_NAMES } from '../../game/challenges';
import { launchBoard, recordLaunchBoard, type LaunchContest, type LaunchPhase } from '../../game/launch';
import { bestLaunch, recordLaunch } from '../../game/records';
import { session, type LaunchRun } from '../../game/session';
import { activeTurns, advanceTurn, recordTurn, standings, turnLabel } from '../../game/turns';
import { COLORS } from '../../ui/menuKit';
import { RunSummary, type SummaryLine } from '../../ui/RunSummary';
import type { MatchScene } from '../MatchScene';
import type { MatchModeHooks } from './mode';

/** The Launch Contest result as the session keeps it, with every attempt and the leaderboard place. */
export interface LaunchRunDetail extends LaunchRun {
  attempts: { distance: number; damage: number }[];
  /** Place on the fighter's top five (0 = top, -1 = off the board). */
  boardPlace: number;
}

const m1 = (v: number): string => `${v.toFixed(1)} M`;

/**
 * Launch Contest presentation: three attempts (ten seconds to pile damage on the dummy, then send it down the runway; the
 * best attempt counts), the attempt readout, a summary of the attempts with the fighter's top five, and take-turns standings.
 */
export class LaunchMode implements MatchModeHooks {
  readonly intro: string;
  private was: LaunchPhase = 'barrier';
  private finished = false;
  private prevBest: number | null;
  private record = false;
  private boardPlace = -1;
  private summary: RunSummary | null = null;
  private summaryKind: '' | 'next' | 'final' = '';

  constructor(
    private readonly scene: MatchScene,
    private readonly lc: LaunchContest,
  ) {
    lc.attachPlayer(scene.fighters[0]);
    const turns = activeTurns();
    this.intro = `${turns ? `${turnLabel(turns, turns.index)}: ` : ''}TEN SECONDS:\nPILE IT ON!\n${lc.total} ATTEMPTS`;
    this.prevBest = bestLaunch(scene.slots[0].character);
  }

  beforeStep(): void {
    this.was = this.lc.phase;
  }

  afterStep(): void {
    const s = this.scene;
    const lc = this.lc;
    const banner = (txt: string, tint: number, ticks = 70): void => {
      s.hud.banner.setText(txt).setVisible(true).setTint(tint);
      s.st.bannerPop = 12;
      s.st.introTicks = ticks;
    };
    if (this.was === 'barrier' && lc.phase === 'open') {
      banner('LAUNCH IT!', 0x7fe8ff);
      sfx.play('boom', 0.8, 0);
      announcer.say('Launch it!', { pitch: 0.7, rate: 1.15 });
    } else if ((this.was === 'flying' || this.was === 'open') && (lc.phase === 'between' || lc.phase === 'done')) {
      const a = lc.attempts[lc.attempts.length - 1];
      const best = lc.bestAttempt === lc.attempts.length - 1 && lc.attempts.length > 1;
      if (lc.phase === 'between') {
        banner(`ATTEMPT ${lc.attempts.length}\n${a.distance > 0 ? m1(a.distance) : 'NO DISTANCE'}${best ? '\nBEST SO FAR!' : ''}`, a.distance > 0 ? 0x7affa0 : 0xff5a4a, 90);
        sfx.play('ding', 0.6, 0);
      }
    } else if (this.was === 'between' && lc.phase === 'barrier') {
      banner(`ATTEMPT ${lc.attempt + 1} OF ${lc.total}`, 0xffe14a, 60);
      s.camera.cam.snap();
    }
    if (lc.over && !this.finished) this.finish();
    const sum = this.summary;
    if (sum?.visible && this.summaryKind) {
      if (!sum.continued()) {
        if (s.st.endTimer >= 0 && s.st.endTimer < 3) s.st.endTimer = 3;
        return;
      }
      sum.hide();
      if (this.summaryKind === 'next') {
        this.summaryKind = '';
        s.st.endTimer = 1 << 20; // the next player's match replaces this one
        if (advanceTurn()) s.scene.restart();
      } else this.summaryKind = '';
    }
  }

  /** Once, when the last attempt ends: records, the leaderboard, the summary panel. */
  private finish(): void {
    this.finished = true;
    const s = this.scene;
    const lc = this.lc;
    const ch = s.slots[0].character;
    const distance = Math.round(lc.distance * 10) / 10;
    const turns = activeTurns();
    this.record = recordLaunch(ch, distance);
    this.boardPlace = recordLaunchBoard(ch, distance, lc.bestDamage, turns ? turnLabel(turns, turns.index) : '');
    const medal = recordSpecialRun({ kind: 'launch', stage: s.setup.stage.id, character: ch, distance });
    const lines: SummaryLine[] = lc.attempts.map((a, i) => [`ATTEMPT ${i + 1}   ${a.distance > 0 ? m1(a.distance) : 'NO DISTANCE'}   ${a.damage}%${i === lc.bestAttempt ? '   BEST' : ''}`, i === lc.bestAttempt ? COLORS.good : COLORS.text]);
    if (medal >= 0 && lastSpecialMedal) lines.push(['', COLORS.dim], [medal > 0 ? `CHALLENGE CLEAR: ${TIER_NAMES[medal]}` : 'CHALLENGE FAILED', medal > 0 ? COLORS.hot : COLORS.warn]);
    if (turns) {
      recordTurn({ score: distance, text: distance > 0 ? m1(distance) : 'NO DISTANCE' });
      const last = turns.index >= turns.players.length - 1;
      lines.push(['', COLORS.dim], ['STANDINGS', COLORS.title]);
      for (const r of standings(turns)) if (r.result) lines.push([`${r.place}. ${turnLabel(turns, r.player)}  ${r.result.text}`, r.place === 1 ? COLORS.good : COLORS.text]);
      if (!last) lines.push([`${turnLabel(turns, turns.index + 1)} IS UP NEXT`, COLORS.hot]);
      this.summaryKind = last ? 'final' : 'next';
    } else {
      const top = launchBoard(ch);
      if (top.length) {
        lines.push(['', COLORS.dim], ['TOP 5', COLORS.title]);
        top.forEach((e, i) => lines.push([`${i + 1}. ${m1(e.m)}  ${e.dmg}%${e.who ? `  ${e.who}` : ''}`, i === this.boardPlace ? COLORS.hot : COLORS.dim]));
      }
      this.summaryKind = 'final';
    }
    this.summary ??= new RunSummary({ scene: s, layer: s.uiLayer, inputs: () => s.ctl.inputs });
    const title = this.summaryKind === 'next' ? `${turnLabel(turns!, turns!.index)}: ${distance > 0 ? m1(distance) : 'NO DISTANCE'}` : `BEST OF ${lc.total}: ${distance > 0 ? m1(distance) : 'NO DISTANCE'}`;
    this.summary.show(title, lines, this.summaryKind === 'next' ? 'PASS THE CONTROLLER: ATTACK TO START' : 'PRESS ATTACK FOR RESULTS');
  }

  clock(clock: Phaser.GameObjects.BitmapText): void {
    const lc = this.lc;
    const s = this.scene;
    this.summary?.layout();
    const bag = s.fighters[1];
    const head = `ATTEMPT ${Math.min(lc.total, lc.attempt + 1)}/${lc.total}`;
    const best = lc.distance > 0 ? `   BEST ${m1(lc.distance)}` : '';
    if (lc.phase === 'barrier') {
      const left = (lc.barrierLeft / 60).toFixed(1);
      clock.setVisible(true).setText(`${head}   ${left}   ${Math.round(bag.damage)}%${best}`).setTint(lc.barrierLeft < 180 ? ((s.world.tick >> 3) & 1 ? 0xff4a5a : 0xffffff) : 0xffffff);
      const sec = Math.ceil(lc.barrierLeft / 60);
      if (sec !== s.st.lastClockSec && sec > 0 && sec <= 3) sfx.play('ding', 0.5, 0);
      s.st.lastClockSec = sec;
    } else if (lc.phase === 'open') {
      clock.setVisible(true).setText(`${head}   LAUNCH IT!   ${Math.round(bag.damage)}%${best}`).setTint(0x7fe8ff);
    } else {
      const cur = lc.phase === 'flying' ? lc.current : (lc.attempts[lc.attempts.length - 1]?.distance ?? 0);
      clock.setVisible(true).setText(`${head}   ${m1(cur)}${best}`).setTint(0x7affa0);
    }
  }

  overBanner(banner: Phaser.GameObjects.BitmapText): void {
    const d = this.lc.distance;
    const rec = d > 0 && (this.prevBest === null || d > this.prevBest);
    banner.setText(d > 0 ? `${d.toFixed(1)} M${rec ? '\nNEW RECORD!' : ''}` : 'NO DISTANCE').setVisible(true).setTint(d > 0 ? 0x7affa0 : 0xff5a4a);
    announcer.say(d > 0 ? `${Math.round(d)} metres!${rec ? ' New record!' : ''}` : 'Too bad.');
  }

  saveResult(): void {
    const s = this.scene;
    if (!this.finished) this.finish();
    const ch = s.slots[0].character;
    const distance = Math.round(this.lc.distance * 10) / 10;
    const run: LaunchRunDetail = {
      character: ch,
      distance,
      damage: this.lc.bestDamage,
      best: bestLaunch(ch),
      record: this.record,
      prevBest: this.prevBest,
      dummy: s.slots[1]?.character,
      attempts: this.lc.attempts.map((a) => ({ ...a })),
      boardPlace: this.boardPlace,
    };
    session.launchRun = run;
  }
}
