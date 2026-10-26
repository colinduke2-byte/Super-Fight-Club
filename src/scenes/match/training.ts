import Phaser from 'phaser';
import { PIXEL_FONT, up } from '../../art/pixelFont';
import { CpuController } from '../../ai/cpu';
import { sfx } from '../../audio/sfx';
import { CHARACTER_LIST, CHARACTERS } from '../../characters';
import { Button, type FighterInput } from '../../engine/buttons';
import type { Fighter } from '../../engine/fighter';
import {
  applyDummyReactions,
  ComboTracker,
  cycle,
  DI_OPTIONS,
  DUMMY_BEHAVIOURS,
  InputRecording,
  isActionable,
  ITEM_NAMES,
  spawnItem,
  RECORD_MAX,
  restoreFighter,
  saveFighter,
  SPEEDS,
  TECH_OPTIONS,
  trainingOptions,
  TrainingRunner,
  type DiOption,
  type SavedFighter,
  type TrainingOptions,
} from '../../engine/training';
import type { World, WorldEventType } from '../../engine/world';
import { applyHeld, clearInput, type Controller } from '../../game/controllers';
import type { CpuLevel } from '../../game/lobby';
import { session } from '../../game/session';
import { clearedTrials, markTrialCleared, trialsFor, TrialChecker, type Trial } from '../../game/trials';
import { ChallengeTracker } from '../../game/challenges';
import { ITEM_KINDS, type ItemKind } from '../../engine/items';
import { applyTrialSetup, defaultDummy, TrialRun } from '../../game/trialDemo';
import { TRIAL_PLANS } from '../../game/trialPlans';
import { ensurePalette } from '../../art/proceduralFighter';
import { FighterView } from '../../ui/FighterView';
import { deviceKind, LESSONS, markTutorialDone, takePendingTutorial, tutorialReturnScene, TutorialRunner } from '../../game/tutorial';
import type { KeyboardSchemeId } from '../../input/actions';
import type { InputDevice } from '../../input/device';
import { inputManager } from '../../input/inputManager';
import { lastInput } from '../../input/lastDevice';
import { menuInput } from '../../input/menuInput';
import { keyLabel, menuPrompt, moveLabel, padButtonLabel, padStyleForId, promptFor, promptSerial } from '../../input/prompts';
import { saveSettings, settings } from '../../settings';
import { STAGE_LIST, STAGES } from '../../stages';
import { sandboxStage } from '../../stages/sandbox';
import { LaunchPreview } from '../../ui/LaunchPreview';
import { COLORS, drawPanel, hudUnit, type MenuItem } from '../../ui/menuKit';
import { canvasDpr } from './hudLayout';
import { TrainingMenu, wrap, type TrainingMenuPage } from '../../ui/TrainingMenu';
import type { MatchScene } from '../MatchScene';

/** Keyboard key that opens the training menu, and the gamepad button (standard mapping 8: View / Select / - / Share). */
export const MENU_KEY = 'Tab';
export const MENU_PAD_BUTTON = 8;

/** The device whose controls the help names: the training player's own (null: the last device used). */
let helpDevice: InputDevice | null = null;

/** How much training help shows: one line (the default), every key, or none. Kept for the session; H / the menu cycle it. */
export type HelpMode = 'short' | 'full' | 'off';
let helpMode: HelpMode = 'short';
export function trainingHelpMode(): HelpMode {
  return helpMode;
}

/** Pad face-button style of a device (a merged keyboard + pad device: the pad used last). */
function padIdOf(d: InputDevice | null): string {
  return (d && d.kind === 'gamepad' ? (d as { padId?: string }).padId : undefined) ?? lastInput.padId;
}

function schemeOf(d: InputDevice | null): KeyboardSchemeId {
  return (d && d.kind === 'keyboard' ? (d as { scheme?: KeyboardSchemeId }).scheme : undefined) ?? lastInput.scheme;
}

/** The training-menu control for the player's device ('TAB', 'VIEW', 'MENU' chip on touch). */
export function menuKeyLabel(d: InputDevice | null = helpDevice): string {
  const kind = deviceKind(d);
  if (kind === 'gamepad') return padButtonLabel(MENU_PAD_BUTTON, padStyleForId(padIdOf(d)));
  if (kind === 'touch') return 'TAP MENU';
  return keyLabel(MENU_KEY);
}

/** Text of the corner chip that opens the menu with a click / tap. */
function chipLabel(): string {
  return deviceKind(helpDevice) === 'touch' ? 'MENU' : `${menuKeyLabel()}: MENU`;
}

let urlTutorialUsed = false;
/** Dev shortcut: `?char=<id>&tutorial` boots straight into the tutorial (once per page load). */
function urlTutorial(): boolean {
  if (urlTutorialUsed || typeof location === 'undefined') return false;
  urlTutorialUsed = true;
  return new URLSearchParams(location.search).has('tutorial');
}

/** Set while the tutorial runs (the help block shrinks to the lesson basics). */
let tutorialOn = false;

/** The fight controls of a device in one line ('MOVE WASD  JUMP I ...', 'MOVE STICK  JUMP Y ...'; touch: its labelled buttons). */
export function controlsLine(d: InputDevice | null = helpDevice): string {
  const kind = deviceKind(d);
  if (kind === 'touch') return 'STICK: MOVE   TAP THE LABELLED BUTTONS TO JUMP, ATTACK, SPECIAL, SHIELD AND GRAB';
  const p = (a: Parameters<typeof promptFor>[0]): string => promptFor(a, d);
  const move = kind === 'keyboard' ? moveLabel(schemeOf(d)) : 'STICK';
  // W / Up jumps on a keyboard by default (settings.upJumpKeyboard): name it beside the jump key, as the lessons do
  const jump = kind === 'keyboard' && settings.upJumpKeyboard ? `${p('up')} / ${p('jump')}` : p('jump');
  return `MOVE ${move}  JUMP ${jump}  ATTACK ${p('attack')}  SPECIAL ${p('special')}  SHIELD ${p('shield')}  GRAB ${p('grab')}  SMASH ${p('smash')}`;
}

/**
 * The training help block for the player's device: by default one line (how to open the training menu); in full, the
 * controls, the menu and (on a keyboard) the hotkeys. Pads and touch get no key shortcuts they cannot press.
 */
export function trainingHelp(): string[] {
  const d = helpDevice;
  const kb = deviceKind(d) === 'keyboard';
  const menu = menuKeyLabel(d);
  const opens = deviceKind(d) === 'touch' ? 'TAP MENU (TOP RIGHT):' : `${menu}:`;
  if (tutorialOn) return [controlsLine(d), `${opens} TUTORIAL MENU${kb ? '   H: HIDE' : ''}`];
  if (helpMode === 'off') return [];
  if (helpMode === 'short') return [`${opens} TRAINING MENU${kb ? '   H: ALL KEYS' : ''}`];
  return [
    controlsLine(d),
    `${opens} TRAINING MENU (DUMMY, DI, SPEED, TRIALS...)`,
    ...(kb
      ? ['SHORTCUTS: 1 HITBOXES  2 HIT DUMMY  3 HIT SELF  4 +25%  5 CLEAR %  6 DUMMY MODE  0 RESET', '[ ] SELECT MOVE  ENTER RUN IT  M SLOW-MO  N STEP MODE  B STEP  F FULLSCREEN  H: HIDE']
      : []),
    'HITS DRAW THE NO-DI LAUNCH PATH: ORANGE = CRASH SPEED, X = KO',
  ];
}

/** Help outside Training (hidden unless asked for): how to pause, for the last device used. */
export function matchHelp(): string[] {
  return [`${menuPrompt('start')}: PAUSE${lastInput.kind === 'keyboard' ? '   CTRL+F: FULLSCREEN   CTRL+H: HIDE' : ''}`];
}

/** Kept for callers of the old constant: the training help as it reads right now. */
export const HELP_TRAINING = trainingHelp();
export const HELP_MATCH = matchHelp();

export function helpLines(training: boolean): string[] {
  return training ? trainingHelp() : matchHelp();
}

/** Re-wraps help lines to at most `max` characters, breaking between their double-spaced entries where it can. */
export function wrapHelp(lines: string[], max: number): string {
  const out: string[] = [];
  for (const l of lines) {
    if (l.length <= max) {
      out.push(l);
      continue;
    }
    // entries too long on their own break between words
    const parts = l.split(/ {2,}/).flatMap((e) => {
      if (e.length <= max) return [e];
      const words: string[] = [];
      for (const word of e.split(' ')) {
        const last = words.length - 1;
        if (last >= 0 && words[last].length + 1 + word.length <= max) words[last] += ` ${word}`;
        else words.push(word);
      }
      return words;
    });
    let cur = '';
    for (const part of parts) {
      if (cur && cur.length + 2 + part.length > max) {
        out.push(cur);
        cur = part;
      } else cur = cur ? `${cur}  ${part}` : part;
    }
    if (cur) out.push(cur);
  }
  return out.join('\n');
}

const INPUT_NAMES: [string, number][] = [['JUMP', Button.Jump], ['ATK', Button.Attack], ['SPC', Button.Special], ['SHD', Button.Shield], ['GRB', Button.Grab], ['SMS', Button.Smash], ['ULT', Button.Ultimate]];

/** Training dummy driven by the menu's behaviour option (stand / crouch / shield / jump; CPU and playback are separate). */
class StanceDummy implements Controller {
  private prev = 0;
  constructor(private readonly opts: TrainingOptions) {}
  update(_self: Fighter, world: World, out: FighterInput): void {
    clearInput(out);
    let held = 0;
    switch (this.opts.behaviour) {
      case 'crouch':
        out.stickY = 1;
        break;
      case 'shield':
        held = Button.Shield;
        break;
      case 'jump':
        if (world.tick % 80 < 6) held = Button.Jump;
        break;
      default:
        break;
    }
    applyHeld(out, held, this.prev);
    this.prev = held;
  }
}

/** Tracks a short sticky "is held" edge for a gamepad button, read straight from the Gamepad API. */
function padButtonDown(button: number): boolean {
  try {
    for (const p of navigator.getGamepads?.() ?? []) if (p?.buttons[button]?.pressed) return true;
  } catch {
    // no gamepad API (or blocked): nothing pressed
  }
  return false;
}

/**
 * Training mode and the dev hotkeys: the training menu (dummy behaviour, DI / tech, % lock, speed, readouts, save /
 * restore, fighter and stage pickers, combo trials), the first-run tutorial, move scenarios, hit buttons, slow-mo /
 * frame stepping, the launch preview and the readout under the help text. The hotkeys that work in every match (debug,
 * help, tap-jump, perf, fullscreen) are here too; keep them in sync with RESERVED keys in src/input/actions.ts.
 */
export class TrainingTools {
  /** Move scenarios (training only). */
  readonly runner: TrainingRunner | null;
  readonly launchPreview: LaunchPreview | null;
  readonly opts = trainingOptions;
  /** Combo counter / frame advantage (training only). */
  readonly combo: ComboTracker | null;
  /** The first-run tutorial (null outside it). */
  readonly tutorial: TutorialRunner | null;
  menu: TrainingMenu | null = null;
  trial: TrialChecker | null = null;
  private readonly recording = new InputRecording();
  private recordingNow = false;
  private saved: [SavedFighter, SavedFighter] | null = null;
  private readonly stance: StanceDummy;
  private cpu: CpuController | null = null;
  private reactMemo = { randDi: 'none' as DiOption, randTech: 'none' as (typeof TECH_OPTIONS)[number], wasHit: false };
  private rngState = 12345;
  private padWasDown = true;
  private promptSerial = -1;
  /** After the menu closes: buttons still held from it do not reach the fighter until released. */
  private swallow = 0;
  private scenarioUsed = false;
  private pickChar = '';
  private pickDummy = '';
  private pickStage = '';
  private lessonText: Phaser.GameObjects.BitmapText | null = null;
  private lessonPlate: Phaser.GameObjects.Graphics | null = null;
  private lessonSerial = -1;
  private finishTimer = -1;
  private trialDoneShown = false;
  /** Item the SPAWN ITEM row drops, and the fighter the SECOND DUMMY row adds ('' = none). */
  private pickItem: ItemKind = 'bomb';
  private pickDummy2 = '';
  /** The second dummy (2-dummy practice): its stance controller and reaction memo. */
  private readonly stance2: StanceDummy;
  private cpu2: CpuController | null = null;
  private reactMemo2 = { randDi: 'none' as DiOption, randTech: 'none' as (typeof TECH_OPTIONS)[number], wasHit: false };
  /** A trial demo playing (a ghost run of the trial's proved plan), its views and how long its last frame holds. */
  private demo: { run: TrialRun; views: FighterView[]; layer: Phaser.GameObjects.Layer; hold: number } | null = null;
  private demoPick = 0;

  /** Challenge matches: counts specials and hazard KOs for the challenge's clear rule and goals. */
  readonly chalTracker: ChallengeTracker | null;

  constructor(private readonly s: MatchScene) {
    this.chalTracker = s.setup.chal && !s.replay ? new ChallengeTracker(s.setup.chal) : null;
    this.runner = s.isTraining ? new TrainingRunner(s.world, s.fighters[0], s.fighters[1]) : null;
    this.launchPreview = s.isTraining ? new LaunchPreview(s, s.worldLayer) : null;
    this.combo = s.isTraining ? new ComboTracker(s.fighters[0], s.fighters[1]) : null;
    const tut = s.isTraining && (takePendingTutorial() || urlTutorial());
    tutorialOn = tut;
    // the help names the training player's own controls (not whichever device was touched last)
    helpDevice = s.isTraining ? (s.slots.find((p) => p.type === 'human')?.device ?? null) : null;
    this.tutorial = tut ? new TutorialRunner(s.world, s.fighters[0], s.fighters[1]) : null;
    this.stance = new StanceDummy(this.opts);
    this.stance2 = new StanceDummy(this.opts);
    this.pickDummy2 = s.isTraining && s.slots[2] ? s.slots[2].character : '';
    if (!s.isTraining) return;
    s.events.once('shutdown', () => this.endDemo(false));
    // the menu gets its own top layer (seen only by the UI camera) so it draws over the HUD plates and help text
    const menuLayer = s.add.layer();
    s.cameras.main.ignore(menuLayer);
    s.worldCam.ignore(menuLayer);
    this.menu = new TrainingMenu(s, menuLayer);
    this.menu.onChip = () => this.openMenu();
    this.menu.setChip(chipLabel());
    if (this.tutorial) {
      this.lessonPlate = s.add.graphics();
      this.lessonText = s.add.bitmapText(0, 0, PIXEL_FONT, '').setOrigin(0.5, 0).setCenterAlign();
      s.uiLayer.add([this.lessonPlate, this.lessonText]);
      this.tutorial.goto(0);
    } else {
      this.applyBehaviour(false);
    }
    // the menu and lesson card follow the window (the scene's own layout does not know about them)
    const onResize = (): void => this.layout();
    s.scale.on('resize', onResize);
    s.events.once('shutdown', () => {
      s.scale.off('resize', onResize);
      tutorialOn = false;
      helpDevice = null;
    });
    this.layout();
    // options that carry over from the last training session
    if (this.opts.hitboxes && !this.tutorial) s.time.delayedCall(0, () => this.applyHitboxes());
    if (!this.tutorial) this.applySpeed();
  }

  private rnd = (): number => {
    // xorshift: the dummy's random DI / tech
    let x = this.rngState;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.rngState = x >>> 0;
    return (this.rngState % 100000) / 100000;
  };

  private layout(): void {
    const s = this.s;
    const w = s.scale.width;
    const h = s.scale.height;
    const u = hudUnit(h);
    this.menu?.layout(w, h, u);
    this.lessonSerial = -1;
  }

  private setHelpMode(m: HelpMode): void {
    helpMode = m;
    this.refreshHelp();
  }

  /** Rewrites the help block (the scene's HUD shows it) for the current mode and device, wrapped to the window. */
  private refreshHelp(): void {
    const s = this.s;
    const hud = s.hud;
    if (!hud?.helpText) return;
    const w = s.scale.width;
    const u = hudUnit(s.scale.height);
    const m = Math.round(8 * canvasDpr(s));
    const lines = helpLines(s.isTraining);
    hud.helpText.setText(up(wrapHelp(lines, Math.max(20, Math.floor((w - 2 * m) / (7 * u))))));
    s.st.plateX = s.st.plateY = -1;
    hud.setHelp(lines.length > 0 && (this.tutorial ? s.st.helpOn : true));
  }

  private helpShown = false;

  onEvent(type: WorldEventType, f: Fighter, x: number, y: number, mag: number, extra: number): void {
    this.chalTracker?.onEvent(type, f, this.s.world);
    this.runner?.onEvent(type, f, x, y, mag, extra);
    if (type === 'hit' && this.launchPreview) this.launchPreview.show(f, this.s.world);
    this.combo?.onEvent(type, f, extra);
    this.trial?.onEvent(type, f);
    this.tutorial?.onEvent(type, f);
  }

  // ---- menu -------------------------------------------------------------------------------------

  /** Opens the training menu (freezes the match). Callable from the pause menu: it un-pauses first. */
  openMenu(): void {
    const s = this.s;
    const m = this.menu;
    if (!m || m.open) return;
    if (s.st.paused) s.pauseUi.setPaused(false);
    if (this.recordingNow) this.stopRecording();
    m.show(this.tutorial ? this.tutorialPage() : this.mainPage());
    m.setOpen(true);
    s.st.stepMode = true; // the sim holds still while the menu is up
    s.st.stepOnce = false;
    menuInput.reset();
    this.layout();
  }

  closeMenu(): void {
    const m = this.menu;
    if (!m || !m.open) return;
    m.setOpen(false);
    this.applySpeed();
    this.s.ctl.sampleHumans(); // see update(): held keys are not fresh presses after the menu
    this.s.resumeClock();
    this.swallow = 30;
    this.menu?.setChip(chipLabel());
  }

  get menuOpen(): boolean {
    return !!this.menu?.open;
  }

  private row(label: string | (() => string), value: (() => string) | undefined, step: ((d: number) => void) | undefined, hint: string, confirm?: () => void): MenuItem {
    return {
      label,
      value,
      hint,
      onLeft: step ? () => step(-1) : undefined,
      onRight: step ? () => step(1) : undefined,
      onConfirm: confirm ?? (step ? () => step(1) : undefined),
    };
  }

  private mainPage(): TrainingMenuPage {
    const o = this.opts;
    const s = this.s;
    const ids = CHARACTER_LIST.map((c) => c.id);
    const stages = [sandboxStage, ...STAGE_LIST].map((st) => st.id);
    this.pickChar = session.players[0]?.character ?? s.fighters[0].data.id;
    this.pickDummy = session.players[1]?.character ?? s.fighters[1].data.id;
    this.pickStage = s.setup.stage.id;
    const name = (id: string) => (CHARACTERS[id]?.name ?? id).toUpperCase();
    const stageName = (id: string) => (STAGES[id]?.name ?? id).toUpperCase();
    const items: MenuItem[] = [
      this.row('RESUME', undefined, undefined, 'BACK TO PRACTICE', () => this.closeMenu()),
      this.row('DUMMY', () => this.behaviourLabel(), (d) => this.stepBehaviour(d), 'WHAT THE DUMMY DOES. RECORD: YOU CONTROL THE DUMMY FOR UP TO 10 S, THEN IT PLAYS BACK ON A LOOP.', () => this.confirmBehaviour()),
      this.row('CPU LEVEL', () => String(o.cpuLevel), (d) => {
        o.cpuLevel = Math.max(1, Math.min(9, o.cpuLevel + d));
        if (o.behaviour === 'cpu') this.applyBehaviour(false);
      }, 'SKILL OF THE CPU DUMMY (1-9)'),
      this.row('DI', () => o.di.toUpperCase(), (d) => (o.di = cycle(DI_OPTIONS, o.di, d)), 'DIRECTIONAL INFLUENCE THE DUMMY HOLDS WHEN LAUNCHED: IN = TOWARD YOU, OUT = AWAY'),
      this.row('TECH', () => o.tech.toUpperCase(), (d) => (o.tech = cycle(TECH_OPTIONS, o.tech, d)), 'HOW THE DUMMY TECHS WHEN IT HITS THE FLOOR'),
      this.row('SET %', () => `${Math.round(s.fighters[1].damage)}%`, (d) => this.setPercent(Math.max(0, Math.min(300, Math.round(s.fighters[1].damage / 10) * 10 + d * 10))), 'LEFT / RIGHT: DUMMY DAMAGE IN STEPS OF 10', () => this.setPercent(0)),
      this.row('LOCK %', () => (o.lockPercent ? `ON (${o.percent}%)` : 'OFF'), () => {
        o.lockPercent = !o.lockPercent;
        o.percent = Math.round(s.fighters[1].damage);
      }, 'KEEP THE DUMMY AT THIS DAMAGE WHENEVER IT RECOVERS'),
      this.row('SPEED', () => o.speed.toUpperCase(), (d) => {
        o.speed = cycle(SPEEDS, o.speed, d);
        this.applySpeed(true);
      }, `GAME SPEED. FRAME STEP: PRESS B TO ADVANCE ONE FRAME`),
      this.row('HITBOXES', () => (o.hitboxes ? 'ON' : 'OFF'), () => {
        o.hitboxes = !o.hitboxes;
        this.applyHitboxes();
      }, 'SHOW HITBOXES, HURTBOXES AND FRAME DATA'),
      this.row('HELP TEXT', () => helpMode.toUpperCase(), (d) => this.setHelpMode(cycle(['short', 'full', 'off'] as const, helpMode, d)), 'THE CONTROLS HELP IN THE TOP LEFT: ONE LINE, EVERY KEY, OR NONE'),
      this.row('INPUT DISPLAY', () => (o.inputDisplay ? 'ON' : 'OFF'), () => (o.inputDisplay = !o.inputDisplay), 'SHOW YOUR STICK AND BUTTONS'),
      this.row('COMBO COUNTER', () => (o.comboCounter ? 'ON' : 'OFF'), () => (o.comboCounter = !o.comboCounter), 'HITS, DAMAGE AND FRAME ADVANTAGE OF YOUR LAST HIT OR BLOCKED HIT'),
      this.row('SAVE POSITIONS', () => (this.saved ? 'SAVED' : ''), undefined, 'REMEMBER WHERE BOTH FIGHTERS ARE (AND THEIR %)', () => {
        this.saved = [saveFighter(s.fighters[0]), saveFighter(s.fighters[1])];
        s.hud.showToast('Positions saved');
      }),
      { ...this.row('RESTORE POSITIONS', undefined, undefined, 'PUT BOTH FIGHTERS BACK WHERE THEY WERE SAVED', () => this.restore(true)), enabled: () => !!this.saved },
      this.row('SPAWN ITEM', () => ITEM_NAMES[this.pickItem], (d) => (this.pickItem = cycle(ITEM_KINDS, this.pickItem, d)), 'LEFT / RIGHT: CHOOSE AN ITEM. CONFIRM DROPS IT IN FRONT OF YOU', () => this.dropItem()),
      this.row('SECOND DUMMY', () => (this.pickDummy2 ? name(this.pickDummy2) : 'OFF'), (d) => (this.pickDummy2 = cycle(['', ...ids], this.pickDummy2, d)), 'A SECOND DUMMY TO PRACTISE AGAINST TWO: CHOOSE, THEN CONFIRM TO LOAD (OFF REMOVES IT)', () => this.reload()),
      this.row('COMBO TRIALS', () => `${this.clearedCount()}/${trialsFor(s.fighters[0].data.id).length}`, undefined, "COMBOS TO LEARN FOR YOUR FIGHTER, AND ONE FOR ITS OWN MECHANIC. EACH HAS A DEMO", () => this.menu?.push(this.trialsPage())),
      { ...this.row('QUIT TRIAL', undefined, undefined, 'STOP THE CURRENT TRIAL', () => this.endTrial()), enabled: () => !!this.trial },
      this.row('YOUR FIGHTER', () => name(this.pickChar), (d) => (this.pickChar = cycle(ids, this.pickChar, d)), 'CHOOSE, THEN PRESS CONFIRM TO LOAD', () => this.reload()),
      this.row('DUMMY FIGHTER', () => name(this.pickDummy), (d) => (this.pickDummy = cycle(ids, this.pickDummy, d)), 'ANY FIGHTER CAN BE THE DUMMY: CHOOSE, THEN CONFIRM TO LOAD', () => this.reload()),
      this.row('STAGE', () => stageName(this.pickStage), (d) => (this.pickStage = cycle(stages, this.pickStage, d)), 'CHOOSE, THEN CONFIRM TO LOAD THE STAGE', () => this.reload()),
      this.row('RESET POSITIONS', undefined, undefined, 'BOTH FIGHTERS BACK TO THEIR SPAWN POINTS', () => {
        s.st.pendingReset = true;
        this.closeMenu();
      }),
    ];
    return {
      title: 'TRAINING',
      items,
      back: () => this.closeMenu(),
      info: () => {
        const lines: string[] = [];
        if (this.recording.length) lines.push(`RECORDING: ${this.recording.seconds.toFixed(1)} S`);
        if (this.trial) lines.push(`TRIAL: ${this.trial.trial.name}`);
        return lines.join('\n');
      },
    };
  }

  private trialsPage(): TrainingMenuPage {
    const f = this.s.fighters[0];
    const done = clearedTrials();
    const list = trialsFor(f.data.id);
    const items: MenuItem[] = list.map((t, i) => ({
      label: `${i + 1}. ${t.name}`,
      value: () => (done.has(`${f.data.id}:${t.id}`) ? 'CLEARED' : t.teaches ? 'MECHANIC' : ''),
      hint: `${t.teaches ? `TEACHES ${t.teaches}\n` : ''}${this.stepsText(t)}\n${t.tip}`,
      onConfirm: () => this.startTrial(t),
    }));
    this.demoPick = Math.min(this.demoPick, list.length - 1);
    items.push({
      label: 'WATCH DEMO',
      value: () => list[this.demoPick]?.name ?? '',
      hint: 'LEFT / RIGHT: CHOOSE A TRIAL. CONFIRM: A GHOST PERFORMS IT',
      onLeft: () => (this.demoPick = (this.demoPick + list.length - 1) % list.length),
      onRight: () => (this.demoPick = (this.demoPick + 1) % list.length),
      onConfirm: () => this.startDemo(list[this.demoPick]),
    });
    return { title: `${f.data.name.toUpperCase()} TRIALS`, items };
  }

  private tutorialPage(): TrainingMenuPage {
    const t = this.tutorial!;
    return {
      title: 'TUTORIAL',
      back: () => this.closeMenu(),
      info: () => `LESSON ${t.index + 1} / ${LESSONS.length}: ${t.lesson.title}`,
      items: [
        this.row('RESUME', undefined, undefined, 'BACK TO THE LESSON', () => this.closeMenu()),
        this.row('RESTART LESSON', undefined, undefined, 'START THIS LESSON OVER', () => {
          t.goto(t.index);
          this.closeMenu();
        }),
        this.row('SKIP LESSON', undefined, undefined, 'ON TO THE NEXT LESSON', () => {
          t.goto(t.index + 1);
          this.closeMenu();
        }),
        this.row('EXIT TUTORIAL', undefined, undefined, 'LEAVE THE TUTORIAL (IT STAYS IN THE MENUS)', () => this.s.scene.start(tutorialReturnScene())),
      ],
    };
  }

  private clearedCount(): number {
    const id = this.s.fighters[0].data.id;
    const done = clearedTrials();
    return trialsFor(id).filter((t) => done.has(`${id}:${t.id}`)).length;
  }

  private moveName(id: string): string {
    const m = this.s.fighters[0].data.moves;
    const mv = m[id] ?? Object.values(m).find((x) => x.id.startsWith(`${id}_`));
    return (mv?.name ?? id).toUpperCase();
  }

  private stepsText(t: Trial, progress = -1): string {
    return t.steps.map((st, i) => `${i < progress ? '+' : i === progress ? '>' : '-'} ${this.moveName(st)}`).join('\n');
  }

  private startTrial(t: Trial): void {
    const s = this.s;
    this.trial = new TrialChecker(t, s.fighters[0], s.fighters[1]);
    this.trial.world = s.world;
    this.trialDoneShown = false;
    this.opts.behaviour = 'stand';
    this.opts.lockPercent = true;
    this.opts.percent = t.percent;
    this.applyBehaviour(false);
    s.st.pendingReset = true;
    this.closeMenu();
    s.hud.showToast(`Trial: ${t.name}`);
  }

  private endTrial(): void {
    this.trial = null;
    this.opts.lockPercent = false;
    this.menu?.refresh(this.mainPage());
  }

  /** SPAWN ITEM: drops the chosen item a little in front of the player. */
  private dropItem(): void {
    const s = this.s;
    const p = s.fighters[0];
    if (spawnItem(s.world, this.pickItem, p.x + p.facing * 24, p.y - p.h - 30)) s.hud.showToast(`${ITEM_NAMES[this.pickItem].toLowerCase()} dropped`);
    this.closeMenu();
  }

  /**
   * WATCH DEMO: the trial's proved plan (the run the trial solver found) plays as a see-through ghost of the player and a
   * dummy, in its own world, while the practice freezes. It ends by itself (or when the menu opens again).
   */
  private startDemo(t: Trial | undefined): void {
    const s = this.s;
    const me = s.fighters[0].data.id;
    const plan = t && TRIAL_PLANS[`${me}:${t.id}`];
    if (!t || !plan) {
      s.hud.showToast('No demo for this trial');
      return;
    }
    this.endDemo(false);
    // against the training dummy when the plan clears on it, else on the dummy it was proved against
    const own = s.fighters[1].data.id;
    const dummyId = own !== me && new TrialRun(me, t, plan, own).run() ? own : defaultDummy(me);
    const run = new TrialRun(me, t, plan, dummyId);
    const layer = s.add.layer().setAlpha(0.6);
    s.cameras.main.ignore(layer);
    s.uiCam.ignore(layer);
    const dSkin = dummyId === own ? s.skins[1] : ensurePalette(s, CHARACTERS[dummyId], 0);
    const views = [new FighterView(s, layer, run.player, 0x9fe8ff, s.skins[0]), new FighterView(s, layer, run.dummy, 0xffc8a0, dSkin)];
    for (const v of views) v.platforms = run.world.platforms;
    this.demo = { run, views, layer, hold: 50 };
    this.closeMenu();
    s.st.stepMode = true; // the practice holds still while the ghost shows the way
    s.hud.showToast(`Demo: ${t.name}`);
  }

  private endDemo(resume = true): void {
    const d = this.demo;
    if (!d) return;
    this.demo = null;
    for (const v of d.views) v.destroy();
    d.layer.destroy();
    if (resume) this.applySpeed();
  }

  /** Per frame while a demo plays: one ghost tick (60 Hz displays; faster ones repeat a frame now and then). */
  private updateDemo(): void {
    const d = this.demo;
    if (!d) return;
    if (this.menuOpen) {
      this.endDemo(false);
      return;
    }
    this.s.st.stepMode = true;
    if (!d.run.done && !d.run.failed) d.run.step();
    else if (--d.hold <= 0) {
      this.endDemo();
      return;
    }
    for (const v of d.views) v.update(1, d.run.world.tick);
  }

  private setPercent(v: number): void {
    const d = this.s.fighters[1];
    d.damage = v;
    if (this.opts.lockPercent) this.opts.percent = v;
  }

  private reload(): void {
    const s = this.s;
    const sl = session.players;
    if (sl[0]) sl[0].character = this.pickChar;
    if (sl[1]) sl[1].character = this.pickDummy;
    // the second dummy: a third slot (or none)
    sl.length = Math.min(sl.length, 2);
    if (this.pickDummy2) sl.push({ index: 2, type: 'cpu', device: null, character: this.pickDummy2, cpuLevel: 1 });
    session.stage = this.pickStage;
    this.trial = null;
    s.scene.restart();
  }

  private restore(close: boolean): void {
    const s = this.s;
    if (!this.saved) return;
    restoreFighter(s.fighters[0], this.saved[0], s.world);
    restoreFighter(s.fighters[1], this.saved[1], s.world);
    this.recording.rewind();
    this.combo?.reset();
    if (close) this.closeMenu();
  }

  private behaviourLabel(): string {
    const o = this.opts;
    if (o.behaviour === 'cpu') return `CPU LV ${o.cpuLevel}`;
    if (o.behaviour === 'record') return 'RECORD';
    if (o.behaviour === 'playback') return this.recording.length ? `PLAYBACK ${this.recording.seconds.toFixed(1)}S` : 'PLAYBACK (EMPTY)';
    return o.behaviour.toUpperCase();
  }

  private stepBehaviour(d: number): void {
    this.opts.behaviour = cycle(DUMMY_BEHAVIOURS, this.opts.behaviour, d);
    if (this.opts.behaviour !== 'record') this.applyBehaviour(false);
  }

  /** Confirm on the behaviour row: RECORD starts recording (closing the menu); others just apply. */
  private confirmBehaviour(): void {
    if (this.opts.behaviour === 'record') {
      this.applyBehaviour(true);
      this.closeMenu();
    } else this.stepBehaviour(1);
  }

  /** Points the dummy slot at the controller for the current behaviour. `startRecord` begins a fresh recording. */
  private applyBehaviour(startRecord: boolean): void {
    const s = this.s;
    const o = this.opts;
    if (o.behaviour === 'cpu') {
      const lv = (o.cpuLevel <= 3 ? 1 : o.cpuLevel <= 6 ? 2 : 3) as CpuLevel;
      this.cpu = new CpuController(lv, 9, o.cpuLevel);
      s.ctl.controllers[1] = this.cpu;
    } else {
      this.cpu = null;
      s.ctl.controllers[1] = this.stance;
    }
    // the second dummy does what the first does (a CPU of its own; recordings play on the first dummy only)
    if (s.fighters[2]) {
      if (o.behaviour === 'cpu') {
        const lv = (o.cpuLevel <= 3 ? 1 : o.cpuLevel <= 6 ? 2 : 3) as CpuLevel;
        this.cpu2 = new CpuController(lv, 10, o.cpuLevel);
        s.ctl.controllers[2] = this.cpu2;
      } else {
        this.cpu2 = null;
        s.ctl.controllers[2] = this.stance2;
      }
    }
    if (o.behaviour === 'record' && startRecord) {
      this.recording.clear();
      this.recordingNow = true;
      s.hud.showToast(`Recording: you control the dummy (${menuKeyLabel()} stops)`);
    }
    if (o.behaviour === 'playback') this.recording.rewind();
  }

  private stopRecording(): void {
    this.recordingNow = false;
    this.opts.behaviour = 'playback';
    this.recording.rewind();
    this.s.hud.showToast(`Recorded ${this.recording.seconds.toFixed(1)} s: playing back`);
  }

  private applyHitboxes(): void {
    this.s.debug.setVisible(this.opts.hitboxes);
    this.s.hud.refreshHelp();
  }

  /** Puts the scene's speed flags in line with the speed option (`toast` reports it). */
  private applySpeed(toast = false): void {
    const st = this.s.st;
    const sp = this.opts.speed;
    st.slowMo = sp === '1/4';
    st.stepMode = sp === 'frame step' || this.menuOpen; // the menu keeps the sim frozen whatever the speed
    st.stepOnce = false;
    if (st.slowTicks <= 0) st.timeScale = sp === '1/2' ? 0.5 : 1;
    if (toast) this.s.hud.showToast(`Speed ${sp}`);
  }

  // ---- per tick ---------------------------------------------------------------------------------

  /** Right before a sim step: a running scenario drives the player, the dummy reacts, and queued hotkey actions apply. */
  beforeStep(inputs: FighterInput[]): void {
    const s = this.s;
    const st = s.st;
    const [p, d] = s.fighters;
    this.chalTracker?.beforeStep(s.world);
    if (this.swallow > 0) {
      const i0 = inputs[0];
      // (the buttons only: the sprint flags above them say how the device sprints, not that a button is down)
      if ((i0.held & 0xff) === 0 || --this.swallow === 0) this.swallow = 0;
      else {
        i0.held &= ~0xff;
        i0.pressed &= ~0xff;
      }
    }
    if (this.runner?.running) {
      const i = inputs[0];
      i.held = i.pressed = i.released = 0; // the scenario drives the player
      this.runner.step(i);
    }
    if (this.tutorial) this.tutorialTick(inputs);
    else if (s.isTraining && inputs[1]) this.dummyTick(inputs, p, d);
    if (st.pendingReset) {
      st.pendingReset = false;
      s.fighters.forEach((f) => s.runner.respawn(f.id));
      s.camera.cam.snap();
      this.trial?.reset();
      this.combo?.reset();
      this.recording.rewind();
      if (this.trial) {
        d.damage = this.trial.trial.percent;
        applyTrialSetup(this.trial.trial, p, d);
      }
    }
    if (st.pendingHitDummy) {
      st.pendingHitDummy = false;
      this.hit(d, d.x >= p.x ? 1 : -1);
    }
    if (st.pendingHitSelf) {
      st.pendingHitSelf = false;
      this.hit(p, p.x >= d.x ? 1 : -1);
    }
    // half speed (the kill-cam's own slow motion takes over while it runs)
    if (s.isTraining && st.slowTicks <= 0 && this.opts.speed === '1/2') st.timeScale = 0.5;
    this.combo?.tick();
    this.trial?.tick();
  }

  private dummyTick(inputs: FighterInput[], p: Fighter, d: Fighter): void {
    const o = this.opts;
    const di = inputs[1];
    if (this.recordingNow) {
      // the player drives the dummy; their own fighter stands still
      const i0 = inputs[0];
      di.stickX = i0.stickX;
      di.stickY = i0.stickY;
      di.held = i0.held & ~Button.Pause;
      di.pressed = i0.pressed & ~Button.Pause;
      di.released = i0.released;
      clearInput(i0);
      if (!this.recording.record(di)) this.stopRecording();
      return;
    }
    if (o.behaviour === 'playback') this.recording.play(di);
    if (o.behaviour !== 'cpu') applyDummyReactions(d, p, o, this.s.world, di, this.rnd, this.reactMemo);
    if (o.lockPercent && d.comboHits === 0 && isActionable(d) && d.damage !== o.percent) d.damage = o.percent;
    const d2 = this.s.fighters[2];
    if (d2 && inputs[2]) {
      if (o.behaviour !== 'cpu') applyDummyReactions(d2, p, o, this.s.world, inputs[2], this.rnd, this.reactMemo2);
      if (o.lockPercent && d2.comboHits === 0 && isActionable(d2) && d2.damage !== o.percent) d2.damage = o.percent;
    }
  }

  private tutorialTick(inputs: FighterInput[]): void {
    const t = this.tutorial!;
    const s = this.s;
    const jab = t.lesson.dummy === 'jab' && !t.cleared;
    const dc = s.ctl.dummy;
    dc.mode = jab ? 3 : 0;
    s.ctl.controllers[1] = dc;
    // the jabbing dummy keeps to its spot next to the player
    if (jab && inputs[1]) {
      const [p, d] = s.fighters;
      if (d.grounded && Math.abs(d.x - p.x) > 40 && d.state === 'idle') inputs[1].stickX = Math.sign(p.x - d.x);
      if (d.state === 'idle') d.facing = p.x >= d.x ? 1 : -1;
    }
    t.tick();
    if (t.finished && this.finishTimer < 0) {
      this.finishTimer = 200;
      markTutorialDone();
      sfx.play('ding', 0.9, 0);
      s.hud.showToast('Tutorial complete!');
    }
    if (this.finishTimer > 0 && --this.finishTimer === 0) s.scene.start(tutorialReturnScene());
  }

  private hit(target: Fighter, dir: 1 | -1): void {
    target.receiveHit({ damage: 8, base: 45, scaling: 1.1, angle: 40, direction: dir }, this.s.world);
  }

  /** Training key 6: stand / crouch / shield / jump, then a real CPU at skill 1, 5 and 9 to practise against. */
  private cycleDummy(): void {
    const o = this.opts;
    const order: [TrainingOptions['behaviour'], number][] = [['stand', 0], ['crouch', 0], ['shield', 0], ['jump', 0], ['cpu', 1], ['cpu', 5], ['cpu', 9]];
    const cur = order.findIndex(([b, l]) => b === o.behaviour && (b !== 'cpu' || l === o.cpuLevel));
    const [b, l] = order[(cur + 1) % order.length];
    o.behaviour = b;
    if (l) o.cpuLevel = l;
    this.recordingNow = false;
    this.applyBehaviour(false);
    this.s.hud.showToast(`Dummy: ${this.behaviourLabel().toLowerCase()}`);
  }

  /** Keyboard hotkeys while the match is running (not paused). */
  onKey(code: string): void {
    const s = this.s;
    const st = s.st;
    if (this.menu) {
      if (code === MENU_KEY) {
        if (this.menu.open) this.closeMenu();
        else this.openMenu();
        return;
      }
      if (this.menu.open) {
        // the menu has the keyboard (through menu input); its shared keys are also taken straight from the key event,
        // since a quick tap can fall between two menu polls on a slow frame
        const action = code === 'Escape' || code === 'Backspace' ? 'back' : code === 'Enter' || code === 'Space' ? 'confirm' : null;
        if (action) {
          const m = this.menu;
          if (!m.handle({ action, device: inputManager.keyboards[0] }) && action === 'back') this.closeMenu();
          menuInput.reset(); // the poll must not see the same press again
        }
        return;
      }
    }
    switch (code) {
      case 'Digit1':
        s.debug.setVisible(!s.debug.visible);
        this.opts.hitboxes = s.debug.visible;
        s.hud.refreshHelp();
        return;
      case 'KeyH':
        // Training: one line -> every key -> hidden; the tutorial and matches just show / hide it
        if (s.isTraining && !this.tutorial) this.setHelpMode(helpMode === 'short' ? 'full' : helpMode === 'full' ? 'off' : 'short');
        else s.hud.setHelp(!st.helpOn);
        return;
      case 'KeyT': {
        // tap-jump is a pad / touch setting: a keyboard-only player pressing T changes nothing they could feel
        const d = s.isTraining ? helpDevice : null;
        const padOrTouch = !d || d.kind === 'gamepad' || d.kind === 'touch' || (d.kind === 'merged' && inputManager.padList.length > 0);
        if (!padOrTouch) {
          s.hud.showToast('Tap-jump is for pads and touch (Settings)');
          return;
        }
        settings.tapJump = !settings.tapJump;
        saveSettings();
        s.hud.showToast(`Tap-jump ${settings.tapJump ? 'ON' : 'OFF'} (pads and touch)`);
        return;
      }
      case 'Backquote':
        s.perf.visible = !s.perf.visible;
        settings.showPerf = s.perf.visible;
        saveSettings();
        return;
      case 'KeyF':
        if (s.scale.isFullscreen) s.scale.stopFullscreen();
        else s.scale.startFullscreen();
        return;
      default:
        break;
    }
    const tr = this.runner;
    if (!tr || this.tutorial) return;
    switch (code) {
      case 'BracketLeft':
        tr.select(-1);
        this.scenarioUsed = true;
        break;
      case 'BracketRight':
        tr.select(1);
        this.scenarioUsed = true;
        break;
      case 'Enter':
        tr.start();
        this.scenarioUsed = true;
        break;
      case 'KeyM':
        this.opts.speed = st.slowMo ? '1x' : '1/4';
        this.applySpeed();
        break;
      case 'KeyN':
        this.opts.speed = st.stepMode ? '1x' : 'frame step';
        this.applySpeed();
        break;
      case 'KeyB':
        st.stepOnce = true;
        break;
      case 'Digit2':
        st.pendingHitDummy = true;
        break;
      case 'Digit3':
        st.pendingHitSelf = true;
        break;
      case 'Digit4':
        s.fighters[1].damage += 25;
        if (this.opts.lockPercent) this.opts.percent = Math.round(s.fighters[1].damage);
        break;
      case 'Digit5':
        s.fighters[0].damage = 0;
        s.fighters[1].damage = 0;
        if (this.opts.lockPercent) this.opts.percent = 0;
        break;
      case 'Digit0':
        st.pendingReset = true;
        break;
      case 'Digit6':
        this.cycleDummy();
        break;
      default:
        break;
    }
  }

  /** Per frame: the launch preview fade, the menu (input + drawing) and the gamepad menu button. */
  update(): void {
    this.launchPreview?.update();
    this.updateDemo();
    const m = this.menu;
    if (!m) return;
    const s = this.s;
    // the gamepad's View / Select button toggles the menu (rising edge)
    const pad = padButtonDown(MENU_PAD_BUTTON);
    if (pad && !this.padWasDown && !s.st.paused) {
      if (m.open) this.closeMenu();
      else this.openMenu();
    }
    this.padWasDown = pad;
    // prompts follow the device in use
    if (promptSerial() !== this.promptSerial || !this.helpShown) {
      this.promptSerial = promptSerial();
      m.setChip(chipLabel());
      this.lessonSerial = -1;
      // a merged keyboard + pad player: the help follows whichever of the two they use
      this.helpShown = true;
      this.refreshHelp();
    }
    if (m.open && !s.st.paused) {
      // humans keep being sampled (and discarded) so a key that closes the menu (Escape = pause, J = attack) is not a
      // fresh press for the fighter when the match resumes
      s.ctl.sampleHumans();
      for (const e of menuInput.poll()) {
        if (!m.open) break;
        if (!m.handle(e) && (e.action === 'start' || e.action === 'back')) this.closeMenu();
      }
      m.update(performance.now());
      inputManager.endTick();
    }
    this.updateLesson();
  }

  private updateLesson(): void {
    const t = this.tutorial;
    const txt = this.lessonText;
    const g = this.lessonPlate;
    if (!t || !txt || !g) return;
    txt.setVisible(!this.menuOpen); // the menu covers a narrow screen: the card steps aside
    g.setVisible(!this.menuOpen);
    if (t.serial === this.lessonSerial) return;
    this.lessonSerial = t.serial;
    const s = this.s;
    const w = s.scale.width;
    const u = hudUnit(s.scale.height);
    const l = t.lesson;
    const max = Math.max(20, Math.floor((w * 0.8) / (7 * u)));
    const head = t.finished ? 'TUTORIAL COMPLETE!' : `LESSON ${t.index + 1}/${LESSONS.length}: ${l.title}${t.cleared ? '  - CLEAR!' : ''}`;
    const body = t.finished ? 'YOU KNOW THE BASICS. TRY TRAINING, VERSUS OR ARCADE NEXT!' : l.goal(helpDevice);
    txt.setText(up(`${head}\n\n${wrap(body, max)}`)).setScale(u);
    txt.setTint(t.cleared || t.finished ? COLORS.good : COLORS.text);
    // below the help block (top left) on narrow windows, where the card would otherwise cover it
    const helpBottom = s.hud.helpText.visible && s.hud.helpText.text ? s.hud.helpText.y + s.hud.helpText.displayHeight : 0;
    const y = Math.round(Math.max(s.scale.height * 0.12, helpBottom + 10 * u));
    txt.setPosition(w / 2, y);
    const pad = 6 * u;
    // the progress bar: one segment per repetition the lesson asks for, filled as they land
    const barH = t.finished ? 0 : 6 * u;
    const bw = Math.max(txt.displayWidth, 80 * u);
    g.clear();
    drawPanel(g, w / 2 - bw / 2 - pad, y - pad, bw + pad * 2, txt.displayHeight + pad * 2 + (barH ? barH + 5 * u : 0), u, 0.85);
    if (barH) {
      const n = l.count;
      const gap = 2 * u;
      const segW = Math.min(30 * u, (bw - gap * (n - 1)) / n);
      const total = segW * n + gap * (n - 1);
      const by = y + txt.displayHeight + 5 * u;
      for (let k = 0; k < n; k++) {
        const x = w / 2 - total / 2 + k * (segW + gap);
        const on = k < t.progress;
        g.fillStyle(on ? COLORS.good : 0x1c1840, 1).fillRect(x, by, segW, barH);
        g.lineStyle(Math.max(1, u / 2), on ? COLORS.good : 0x5a5680, 1).strokeRect(x, by, segW, barH);
        if (on) g.fillStyle(0xffffff, 0.35).fillRect(x, by, segW, Math.max(1, u));
      }
    }
    if (t.cleared || t.finished) sfx.play('ding', 0.7, 0);
  }

  updateReadout(): void {
    const tr = this.runner;
    if (!tr) return;
    const s = this.s;
    const st = s.st;
    const o = this.opts;
    if (st.frameCount % 6 === 0) {
      const lines: string[] = [];
      if (this.trial) {
        const t = this.trial;
        lines.push(`TRIAL: ${t.trial.name}${t.done ? '  CLEAR!' : ''}`, this.stepsText(t.trial, t.done ? t.trial.steps.length : t.progress), t.trial.tip);
        if (t.done && !this.trialDoneShown) {
          this.trialDoneShown = true;
          markTrialCleared(s.fighters[0].data.id, t.trial.id);
          sfx.play('ding', 0.9, 0);
          s.hud.showToast(`Trial clear: ${t.trial.name}!`);
        }
      }
      if (this.scenarioUsed && !this.tutorial) lines.push(...tr.report());
      if (o.comboCounter && this.combo && this.combo.hits > 0 && !this.tutorial) lines.push(...this.combo.lines());
      if (this.recordingNow) lines.push(`REC ${this.recording.seconds.toFixed(1)} / ${(RECORD_MAX / 60).toFixed(0)} S  (${menuKeyLabel()} STOPS)`);
      else if (o.behaviour === 'playback' && !this.tutorial) lines.push(this.recording.length ? `PLAYBACK ${this.recording.seconds.toFixed(1)} S` : 'PLAYBACK: NOTHING RECORDED');
      if (o.lockPercent && !this.tutorial) lines.push(`DUMMY % LOCKED AT ${o.percent}`);
      if (st.slowMo) lines.push('SPEED 1/4');
      else if (this.demo) lines.push(`DEMO PLAYING  (${menuKeyLabel()} STOPS)`); // (a demo holds the practice in step mode)
      else if (st.stepMode && !this.menuOpen) lines.push('FRAME STEP (B)');
      else if (o.speed === '1/2') lines.push('SPEED 1/2');
      st.trainReport = up(lines.join('\n'));
    }
    let line = '';
    if (o.inputDisplay && !this.tutorial) {
      // live input display for player 1: stick direction + held buttons
      const i0 = s.ctl.inputs[0];
      const sx = i0.stickX > 0.3 ? 'R' : i0.stickX < -0.3 ? 'L' : '-';
      const sy = i0.stickY > 0.3 ? 'D' : i0.stickY < -0.3 ? 'U' : '-';
      let btn = '';
      for (const [name, bit] of INPUT_NAMES) if ((i0.held & bit) !== 0) btn += `${name} `;
      line = `${st.trainReport ? '\n' : ''}INPUT ${sy}${sx} ${btn}`;
    }
    if (line !== st.lastInputLine || st.frameCount % 6 === 0) {
      st.lastInputLine = line;
      s.hud.trainText.setText(st.trainReport + line);
    }
  }
}

/**
 * Hook for the pause menu: opens the training menu from a "TRAINING MENU" row (training only; un-pauses first).
 * Returns false outside training.
 */
export function openTrainingMenu(s: MatchScene): boolean {
  if (!s.isTraining || !s.trainer.menu) return false;
  s.trainer.openMenu();
  return true;
}
