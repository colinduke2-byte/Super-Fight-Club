import Phaser from 'phaser';
import { announcer } from '../../audio/announcer';
import { formatTicks, recordTargetTime } from '../../game/records';
import { session } from '../../game/session';
import { bestCourseRun, Ghost, InputTape, quantizeStick, recordCourseRun, splitDelta, type CourseRun } from '../../game/targetRuns';
import { activeTurns, advanceTurn, recordTurn, standings, turnLabel } from '../../game/turns';
import { targetCourseById } from '../../stages/targetCourses';
import { FighterView } from '../../ui/FighterView';
import { COLORS } from '../../ui/menuKit';
import { RunSummary, type SummaryLine } from '../../ui/RunSummary';
import { lastSpecialMedal, recordSpecialRun, TIER_NAMES } from '../../game/challenges';
import type { MatchScene } from '../MatchScene';
import type { MatchModeHooks } from './mode';

/** Ghost look: a cool tint, see-through. */
const GHOST_TINT = 0x9fe8ff;
const GHOST_ALPHA = 0.42;

/**
 * Target Smash presentation: targets broken, the running time, the best time and the split against the best run at each
 * target, a translucent ghost replaying that best run, COMPLETE / FAILED, best times, and take-turns standings.
 */
export class TargetsMode implements MatchModeHooks {
  readonly intro: string;
  /** Course being played (its id is the stage id). */
  readonly course: string;
  readonly character: string;
  readonly best: CourseRun | null;
  readonly ghost: Ghost | null;
  /** This run's inputs and the tick each target broke on. */
  readonly tape = new InputTape();
  readonly splits: number[] = [];
  private ghostView: FighterView | null = null;
  private ghostLayer: Phaser.GameObjects.Layer | null = null;
  private lastSplit = '';
  private lastSplitAt = -1;
  private finished = false;
  private record = false;
  /** Medal this run earned for an armed challenge (-1: not a challenge run). */
  private medal = -1;
  private summary: RunSummary | null = null;
  /** Take turns: 'next' (a player follows), 'final' (standings), '' (no summary). */
  private summaryKind: '' | 'next' | 'final' = '';

  constructor(private readonly scene: MatchScene) {
    const s = scene;
    this.course = s.setup.stage.id;
    this.character = s.slots[0].character;
    const turns = activeTurns();
    const c = targetCourseById(this.course);
    const who = turns ? `${turnLabel(turns, turns.index)}: ` : '';
    this.intro = `${who}BREAK THE\nTARGETS!${c ? `\n${c.stage.name.toUpperCase()}` : ''}`;
    this.best = bestCourseRun(this.course, this.character);
    this.ghost = this.best ? new Ghost(s.setup.stage, this.character, s.match.cfg, this.best) : null;
    s.runner.subscribe((type) => {
      if (type !== 'target') return;
      const tick = s.world.tick;
      this.splits.push(tick);
      const i = this.splits.length - 1;
      const b = this.best?.splits[i];
      if (b !== undefined) {
        this.lastSplit = splitDelta(tick, b);
        this.lastSplitAt = tick;
      }
    });
  }

  /** The live input is rounded the way the tape stores it, so the ghost of this run replays it exactly. */
  beforeStep(): void {
    const s = this.scene;
    if (s.match.over) return;
    const i = s.ctl.inputs[0];
    i.stickX = quantizeStick(i.stickX);
    i.stickY = quantizeStick(i.stickY);
    i.held &= 0x7f;
    i.pressed &= 0x7f;
    i.released &= 0x7f;
    this.tape.record(i);
  }

  afterStep(): void {
    const s = this.scene;
    if (!s.match.over) this.ghost?.step();
    else if (!this.finished) this.finish();
    // the summary holds the end of the run until a player continues
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

  /** Once, the tick the run ends: the records (and the take-turns result). */
  private finish(): void {
    this.finished = true;
    const s = this.scene;
    const t = s.runner.targetTicks;
    const cleared = t >= 0;
    const run: CourseRun = { ticks: t, splits: [...this.splits], tape: this.tape.data, tapeTicks: this.tape.ticks, flick: s.runner.smashFlick };
    this.record = cleared && recordCourseRun(this.course, this.character, run);
    // the per-fighter record (Records screen) is the fighter's own course
    if (cleared && targetCourseById(this.course)?.fighter === this.character) recordTargetTime(this.character, t);
    this.medal = recordSpecialRun({ kind: 'targets', stage: this.course, character: this.character, ticks: cleared ? t : -1, broken: this.splits.length });
    const turns = activeTurns();
    if (!turns) return;
    const total = s.world.targets.length;
    recordTurn(cleared ? { score: -t, text: formatTicks(t) } : { score: -1e7 + this.splits.length, text: `${this.splits.length}/${total} TARGETS` });
    const last = turns.index >= turns.players.length - 1;
    const lines: SummaryLine[] = standings(turns)
      .filter((r) => r.result)
      .map((r) => [`${r.place}. ${turnLabel(turns, r.player)}  ${r.result!.text}`, r.place === 1 ? COLORS.good : COLORS.text]);
    if (!last) lines.push(['', COLORS.dim], [`${turnLabel(turns, turns.index + 1)} IS UP NEXT`, COLORS.hot]);
    this.summary ??= new RunSummary({ scene: s, layer: s.uiLayer, inputs: () => s.ctl.inputs });
    this.summary.show(last ? 'FINAL STANDINGS' : 'STANDINGS', lines, last ? 'PRESS ATTACK FOR RESULTS' : 'PASS THE CONTROLLER: ATTACK TO START');
    this.summaryKind = last ? 'final' : 'next';
  }

  clock(clock: Phaser.GameObjects.BitmapText): void {
    const s = this.scene;
    this.drawGhost();
    this.summary?.layout();
    // the summary panel repeats the end banner and sits over it: the banner steps aside while it shows
    if (this.summary?.visible) s.hud.banner.setVisible(false);
    const ts = s.world.targets;
    const left = ts.filter((t) => t.alive).length;
    const done = s.runner.targetTicks;
    const ticks = done >= 0 ? done : s.world.tick;
    let line2 = this.best ? `BEST ${formatTicks(this.best.ticks)}` : 'NO BEST YET';
    if (this.lastSplit && s.world.tick - this.lastSplitAt < 150) line2 += `   SPLIT ${this.lastSplit}`;
    clock
      .setVisible(true)
      .setText(`TARGETS ${ts.length - left}/${ts.length}   ${formatTicks(ticks)}\n${line2}`)
      .setTint(done >= 0 ? 0x7affa0 : this.lastSplit.startsWith('-') && s.world.tick - this.lastSplitAt < 150 ? 0x9fffc0 : 0xffffff);
  }

  /** The ghost, drawn behind the live fighter (built once the match's art is ready). */
  private drawGhost(): void {
    const g = this.ghost;
    const s = this.scene;
    if (!g || !s.views?.length) return;
    if (!this.ghostView) {
      // its own see-through layer, drawn by the world camera just under the world (behind the stage, targets and fighter)
      const layer = s.add.layer().setAlpha(GHOST_ALPHA);
      s.children.moveBelow(layer as unknown as Phaser.GameObjects.GameObject, s.worldLayer as unknown as Phaser.GameObjects.GameObject);
      s.cameras.main.ignore(layer);
      s.uiCam.ignore(layer);
      this.ghostLayer = layer;
      this.ghostView = new FighterView(s, layer, g.fighter, GHOST_TINT, s.skins[0]);
      this.ghostView.platforms = g.runner.world.platforms;
      this.ghostView.spawnSnap = true;
    }
    this.ghostView.update(1, g.runner.world.tick);
    this.ghostLayer?.setVisible(s.views[0] !== undefined);
  }

  overBanner(banner: Phaser.GameObjects.BitmapText): void {
    const t = this.scene.runner.targetTicks;
    const done = t >= 0;
    const vs = done && this.best && !this.record ? `\n${splitDelta(t, this.best.ticks)}` : '';
    const medal = this.medal >= 0 && lastSpecialMedal ? `\n${this.medal > 0 ? `CHALLENGE: ${TIER_NAMES[this.medal]}` : 'CHALLENGE FAILED'}` : '';
    banner.setText(done ? `COMPLETE!\n${formatTicks(t)}${this.record ? '\nNEW BEST!' : vs}${medal}` : `FAILED${medal}`).setVisible(true).setTint(done ? 0x7affa0 : 0xff5a4a);
    announcer.say(done ? 'Complete!' : 'Failure.');
  }

  saveResult(): void {
    const s = this.scene;
    const ts = s.world.targets;
    const t = s.runner.targetTicks;
    const cleared = t >= 0;
    if (!this.finished) this.finish();
    const best = bestCourseRun(this.course, this.character);
    session.targetRun = { character: this.character, ticks: cleared ? t : s.world.tick, cleared, broken: ts.filter((x) => !x.alive).length, total: ts.length, best: best?.ticks ?? null, record: this.record };
  }
}
