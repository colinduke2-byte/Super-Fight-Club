import type Phaser from 'phaser';
import { settings } from '../settings';
import type { Fighter } from '../engine/fighter';
import type { Ledge } from '../engine/platform';
import type { World, WorldEventType } from '../engine/world';
import { makeRaw, type DeviceKind, type InputDevice, type RawInput } from '../input/device';
import type { KeyboardSchemeId } from '../input/actions';
import { inputManager } from '../input/inputManager';
import { lastInput } from '../input/lastDevice';
import { promptFor } from '../input/prompts';
import { session } from './session';

/**
 * First-run tutorial: ten short lessons played in a training match on the sandbox (the training scene drives it;
 * see TrainingTools). Each lesson sets the scene up, shows a goal built from the player's live bindings, and is checked
 * by world events (jumps, hits, shield hits, throws, ledge grabs, KOs) rather than by watching keys.
 */
export interface Lesson {
  id: string;
  title: string;
  /** Goal text for the player's device (built when shown, so the prompts follow the device in use; none: the last one used). */
  goal: (device?: InputDevice | null) => string;
  /** How many times the goal has to happen. */
  count: number;
  /** Dummy behaviour for this lesson. */
  dummy: 'stand' | 'jab';
  /** Dummy percent at the start of the lesson. */
  dummyPercent: number;
  /** Where the player starts: off the stage in the air (recovery), or hanging on the left ledge. */
  start?: 'offstage' | 'ledge';
}

type Act = Parameters<typeof promptFor>[0];

/** What kind of controls `device` has (a merged keyboard + pad device: whichever was used last). */
export function deviceKind(device?: InputDevice | null): 'keyboard' | 'gamepad' | 'touch' {
  if (device && device.kind !== 'merged') return device.kind;
  return lastInput.kind;
}

/** Prompt words for one device: keys / buttons by name, and directions as the player would say them. */
function words(d?: InputDevice | null) {
  const kind = deviceKind(d);
  const P = (a: Act): string => promptFor(a, d);
  // keyboard: the actual keys ("A / D"); pads and touch: the stick
  const sides = kind === 'keyboard' ? `${P('left')} / ${P('right')}` : 'THE STICK LEFT / RIGHT';
  const up = kind === 'keyboard' ? P('up') : 'UP';
  return { P, kind, sides, up };
}

/** How to start a sprint on this device, by the SPRINT setting (Settings > Gameplay). */
function sprintGoal(d?: InputDevice | null): string {
  const { kind, sides } = words(d);
  const m = kind === 'keyboard' ? settings.sprintKeyboard : settings.sprintPad;
  if (kind === 'keyboard') return m === 'flick' ? `PRESS AND HOLD ${sides} TO SPRINT` : `DOUBLE-TAP ${sides} AND HOLD IT TO SPRINT`;
  const how = m === 'doubletap' ? 'DOUBLE-TAP' : m === 'flick' ? 'FLICK' : 'FLICK (OR DOUBLE-TAP)';
  return `${how} THE STICK LEFT OR RIGHT AND HOLD IT TO SPRINT`;
}

/** The jump control as the lessons name it: W / Up on a keyboard when it jumps (the default), else the jump button. */
function jumpKey(d?: InputDevice | null): string {
  const { P, kind } = words(d);
  return kind === 'keyboard' && settings.upJumpKeyboard ? P('up') : P('jump');
}

export const LESSONS: Lesson[] = [
  { id: 'move', title: 'MOVE', goal: (d) => `RUN TO BOTH EDGES OF THE STAGE  (${words(d).sides})`, count: 2, dummy: 'stand', dummyPercent: 0 },
  { id: 'sprint', title: 'SPRINT', goal: (d) => `${sprintGoal(d)}. SPRINT ACROSS THE STAGE!`, count: 1, dummy: 'stand', dummyPercent: 0 },
  { id: 'jump', title: 'JUMP', goal: (d) => { const j = jumpKey(d); return `PRESS ${j} TO JUMP, THEN ${j} AGAIN IN THE AIR TO DOUBLE JUMP`; }, count: 2, dummy: 'stand', dummyPercent: 0 },
  { id: 'attack', title: 'ATTACK', goal: (d) => `HIT THE DUMMY 3 TIMES WITH ${words(d).P('attack')}  (HOLD A DIRECTION FOR OTHER MOVES)`, count: 3, dummy: 'stand', dummyPercent: 0 },
  { id: 'special', title: 'SPECIALS', goal: (d) => { const { P } = words(d); return `USE 2 DIFFERENT SPECIALS: ${P('special')}, AND ${P('special')} + A DIRECTION`; }, count: 2, dummy: 'stand', dummyPercent: 0 },
  { id: 'shield', title: 'SHIELD', goal: (d) => `HOLD ${words(d).P('shield')} TO BLOCK 2 OF THE DUMMY'S ATTACKS`, count: 2, dummy: 'jab', dummyPercent: 0 },
  { id: 'grab', title: 'GRAB AND THROW', goal: (d) => `GET CLOSE, GRAB WITH ${words(d).P('grab')}, THEN PUSH ANY DIRECTION TO THROW`, count: 1, dummy: 'stand', dummyPercent: 0 },
  { id: 'ledge', title: 'LEDGE', goal: (d) => { const { P, up } = words(d); const toward = deviceKind(d) === 'keyboard' ? P('right') : 'RIGHT'; return `HANGING ON THE LEDGE: PRESS ${up} OR ${toward} TO CLIMB UP  (${P('jump')} JUMPS, ${P('shield')} ROLLS)`; }, count: 1, dummy: 'stand', dummyPercent: 0, start: 'ledge' },
  { id: 'recover', title: 'RECOVER', goal: (d) => { const { P, up } = words(d); return `KNOCKED OFF! DOUBLE JUMP (${jumpKey(d)}), THEN ${up} + ${P('special')} (UP SPECIAL) TO REACH THE LEDGE`; }, count: 2, dummy: 'stand', dummyPercent: 0, start: 'offstage' },
  { id: 'ko', title: 'KNOCK OUT', goal: (d) => { const { P } = words(d); return `THE DUMMY IS AT 150%: LAUNCH IT OFF THE SCREEN! (${P('smash')} OR A FLICK + ${P('attack')} FOR A SMASH)`; }, count: 1, dummy: 'stand', dummyPercent: 150 },
];

/** Recovery lesson start, from the main platform's left corner: far enough out that most fighters need the up special. */
export const RECOVER_OUT = 140;
export const RECOVER_DOWN = -40;
/** A fall this far under the stage top in the ledge / recovery lessons puts the player back to try again. */
const FALL_RESET = 260;

/** Drives the lessons: setup, event checks, progress. Pure enough to run headless in tests. */
export class TutorialRunner {
  index = 0;
  progress = 0;
  /** Ticks left on the "lesson clear" pause before the next lesson starts. */
  clearTicks = 0;
  finished = false;
  /** Bumped whenever the goal text / progress changes (the overlay redraws then). */
  serial = 0;
  private seen = new Set<string>();
  private pendingSetup = true;
  private wasKo = false;
  /** Recovery lesson: an up special was used on this try. */
  private usedUp = false;

  constructor(
    private readonly world: World,
    private readonly player: Fighter,
    private readonly dummy: Fighter,
  ) {}

  get lesson(): Lesson {
    return LESSONS[Math.min(this.index, LESSONS.length - 1)];
  }

  /** Start lesson `i` (clamped); past the last one the tutorial is finished. */
  goto(i: number): void {
    if (i >= LESSONS.length) {
      this.finished = true;
      this.serial++;
      return;
    }
    this.index = Math.max(0, i);
    this.progress = 0;
    this.clearTicks = 0;
    this.seen.clear();
    this.pendingSetup = true;
    this.serial++;
  }

  /** Place the fighters for the current lesson. */
  setup(): void {
    const l = this.lesson;
    const w = this.world;
    const ground = w.platforms[0];
    for (const p of w.projectiles) p.deactivate();
    const ledge = this.leftLedge();
    if (l.start === 'offstage') {
      this.player.spawn(ground.x - RECOVER_OUT, ground.top + RECOVER_DOWN, 1);
      this.player.jumpsLeft = this.player.stats.doubleJumps;
    } else if (l.start === 'ledge' && ledge && this.player.state !== 'ko') {
      this.player.spawn(ledge.x - this.player.hw - 1, ledge.y + this.player.h, 1);
      this.player.grabLedge(ledge, w);
    } else if (this.player.state !== 'ko') this.player.standOn(ground, ground.x + ground.w * 0.3);
    if (this.dummy.state !== 'ko') this.dummy.standOn(ground, ground.x + ground.w * 0.6);
    this.player.facing = 1;
    this.dummy.facing = -1;
    this.dummy.damage = l.dummyPercent;
    this.player.damage = 0;
    this.player.snapped = this.dummy.snapped = true;
    this.pendingSetup = false;
    // a lesson started over in place (a fall, a recovery without the up special) starts its count over too
    if (this.progress < l.count) {
      this.progress = 0;
      this.seen.clear();
      this.serial++;
    }
    this.usedUp = false;
  }

  /** The main platform's left corner (the ledge and recovery lessons use it). */
  private leftLedge(): Ledge | undefined {
    const g = this.world.platforms[0];
    return this.world.ledges.find((l) => l.platform === g && l.side === -1);
  }

  /** Once per sim tick, before the world steps. */
  tick(): void {
    if (this.finished) return;
    const pl = this.player;
    // a fall during a lesson: once the player is back, the lesson starts over in place
    if (pl.state === 'ko') this.wasKo = true;
    else if (this.wasKo) {
      this.wasKo = false;
      this.pendingSetup = true;
    }
    if (this.pendingSetup && pl.state !== 'ko' && this.dummy.state !== 'ko') this.setup();
    if (this.clearTicks > 0) {
      if (--this.clearTicks === 0) this.goto(this.index + 1);
      return;
    }
    const l = this.lesson;
    if (l.id === 'move' && pl.grounded) {
      const g = this.world.platforms[0];
      if (pl.x < g.x + 40) this.mark('left');
      if (pl.x > g.right - 40) this.mark('right');
    }
    // a sustained sprint (past the opening burst) counts
    if (l.id === 'sprint' && pl.sprinting && pl.sprintFrames >= 12) this.mark('sprint');
    if (l.id === 'ledge' && pl.state === 'ledgeClimb') this.mark('up');
    // let go of the ledge and fell (or hung on too long): back onto it to try again
    if ((l.id === 'ledge' || l.id === 'recover') && !this.cleared && pl.state !== 'ko' && !pl.grounded && pl.state !== 'ledge' && pl.y > this.world.platforms[0].top + FALL_RESET) this.pendingSetup = true;
    if (l.id === 'ko' && this.dummy.state !== 'ko' && this.dummy.damage < 100 && this.dummy.hitstun === 0) this.dummy.damage = l.dummyPercent; // the dummy came back: ready again
  }

  private mark(key: string): void {
    if (this.seen.has(key)) return;
    this.seen.add(key);
    this.advance();
  }

  private advance(n = 1): void {
    this.progress = Math.min(this.lesson.count, this.progress + n);
    this.serial++;
    if (this.progress >= this.lesson.count) this.clearTicks = 75;
  }

  get cleared(): boolean {
    return this.clearTicks > 0;
  }

  onEvent(type: WorldEventType, f: Fighter): void {
    if (this.finished || this.clearTicks > 0) return;
    const l = this.lesson;
    const pl = this.player;
    const d = this.dummy;
    switch (l.id) {
      case 'jump':
        if (f === pl && type === 'jump') this.mark('jump');
        if (f === pl && type === 'doubleJump') {
          this.mark('jump');
          this.mark('double');
        }
        break;
      case 'attack':
        if (type === 'hit' && f === d && d.lastHitBy === pl.id && pl.move && pl.move.kind !== 'special' && pl.move.kind !== 'ultimate') this.advance();
        break;
      case 'special':
        if (type === 'moveStart' && f === pl && pl.move?.kind === 'special') this.mark(pl.move.id.split('_')[0]);
        break;
      case 'shield':
        if (type === 'shieldHit' && f === pl) this.advance();
        break;
      case 'grab':
        if (type === 'throw' && f === d) this.advance();
        break;
      case 'ledge':
        // a ledge jump or hop that lands on the stage counts as getting up too
        if (f === pl && type === 'land' && pl.groundPlat === this.world.platforms[0]) this.mark('up');
        break;
      case 'recover':
        // both in one try: an up special, then the ledge (or the stage). Back without one: try again from the start.
        if (f === pl && type === 'moveStart' && pl.move?.id.startsWith('upB')) {
          this.usedUp = true;
          this.mark('up');
        }
        if (f === pl && (type === 'ledgeGrab' || (type === 'land' && pl.groundPlat === this.world.platforms[0]))) {
          if (this.usedUp) this.mark('reach');
          else this.pendingSetup = true;
        }
        break;
      case 'ko':
        if (type === 'ko' && f === d) this.advance();
        break;
      default:
        break;
    }
  }
}

// ---- first run ---------------------------------------------------------------------------------

const STORE_KEY = 'sfc.tutorial.v1';

interface Stored {
  offered?: boolean;
  done?: boolean;
}

function read(): Stored {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    const v = raw ? (JSON.parse(raw) as unknown) : null;
    return v && typeof v === 'object' ? (v as Stored) : {};
  } catch {
    return {};
  }
}

function write(v: Stored): void {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify({ ...read(), ...v }));
  } catch {
    // storage blocked: the offer just comes back next launch
  }
}

/** True on a first launch: the tutorial has neither been offered nor finished. Menus call this once at the title. */
export function shouldOfferTutorial(): boolean {
  const s = read();
  return !s.offered && !s.done;
}

/** Remember that the tutorial was offered (call when the player declines, so it is not offered again). */
export function markTutorialOffered(): void {
  write({ offered: true });
}

export function markTutorialDone(): void {
  write({ offered: true, done: true });
}

export function tutorialDone(): boolean {
  return !!read().done;
}

/** Set by `startTutorial`, consumed by the training scene that starts next. */
let pending = false;
/** Where the tutorial returns to when it ends. */
let returnTo = 'ModeSelect';

export function takePendingTutorial(): boolean {
  const p = pending;
  pending = false;
  return p;
}

export function tutorialReturnScene(): string {
  return returnTo;
}

/**
 * One player on the whole keyboard (either side: WASD + JKL or the arrows + , . /) plus any pad. Unlike a plain merged
 * device it reports the kind (and keyboard side / pad) it was last used as, so the match reads it by that device's own
 * rules: W / Up jumps and a double-tap sprints on the keys, tap-jump and flicks on a pad, and the prompts follow along.
 */
export class SoloDevice implements InputDevice {
  readonly id = 'p1';
  readonly label = 'Keyboard + Gamepad';
  readonly connected = true;
  private readonly tmp: RawInput = makeRaw();
  private active: 'keyboard' | 'gamepad';
  private activeScheme: KeyboardSchemeId;
  private activePad: string;
  constructor(private readonly devices: () => InputDevice[]) {
    this.active = lastInput.kind === 'gamepad' ? 'gamepad' : 'keyboard';
    this.activeScheme = lastInput.scheme;
    this.activePad = lastInput.padId;
  }
  get kind(): DeviceKind {
    return this.active;
  }
  /** The keyboard side used last (prompts name its keys). */
  get scheme(): KeyboardSchemeId {
    return this.activeScheme;
  }
  /** The pad used last (prompts name its buttons). */
  get padId(): string {
    return this.activePad;
  }
  sample(out: RawInput): void {
    out.stickX = 0;
    out.stickY = 0;
    out.held = 0;
    const list = this.devices();
    for (let i = 0; i < list.length; i++) {
      const d = list[i];
      const t = this.tmp;
      d.sample(t);
      if (t.held !== 0 || Math.abs(t.stickX) > 0.5 || Math.abs(t.stickY) > 0.5) {
        if (d.kind === 'keyboard') {
          this.active = 'keyboard';
          this.activeScheme = (d as { scheme?: KeyboardSchemeId }).scheme ?? this.activeScheme;
        } else if (d.kind === 'gamepad') {
          this.active = 'gamepad';
          this.activePad = (d as { padId?: string }).padId ?? this.activePad;
        }
      }
      if (Math.abs(t.stickX) > Math.abs(out.stickX)) out.stickX = t.stickX;
      if (Math.abs(t.stickY) > Math.abs(out.stickY)) out.stickY = t.stickY;
      out.held |= t.held;
    }
  }
}

/**
 * Starts the tutorial from any scene: a training match on the sandbox with the lesson overlay. Player 1 plays on `device`
 * (the one that chose the tutorial) when it is a pad or the touch controls; otherwise on the whole keyboard plus any pad, or on
 * the touch controls when a finger was the last thing used. `back` is the scene to return to when it ends or is quit.
 */
export function startTutorial(scene: Phaser.Scene, back = 'ModeSelect', character?: string, device?: InputDevice | null): void {
  pending = true;
  returnTo = back;
  markTutorialOffered();
  inputManager.init();
  const touch = inputManager.touch;
  const dev =
    device && (device.kind === 'gamepad' || device.kind === 'touch')
      ? device
      : !device && (lastInput.kind === 'touch' || touch.recentTouch())
        ? touch
        : new SoloDevice(() => [...inputManager.keyboards, ...inputManager.padList]);
  const char = character ?? session.players.find((p) => p.type === 'human')?.character ?? 'brick';
  session.mode = 'training';
  session.stage = 'sandbox';
  session.players = [
    { index: 0, type: 'human', device: dev, character: char, cpuLevel: 1 },
    { index: 1, type: 'cpu', device: null, character: char === 'vex' ? 'nova' : 'vex', cpuLevel: 1 }, // a light dummy (Brick's armour would shrug off light jabs)
  ];
  scene.scene.start('Match');
}
