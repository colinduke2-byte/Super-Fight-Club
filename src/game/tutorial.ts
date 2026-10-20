import type Phaser from 'phaser';
import type { Fighter } from '../engine/fighter';
import type { World, WorldEventType } from '../engine/world';
import { MergedDevice, type InputDevice } from '../input/device';
import { inputManager } from '../input/inputManager';
import { lastInput } from '../input/lastDevice';
import { promptFor } from '../input/prompts';
import { session } from './session';

/**
 * First-run tutorial: eight short lessons played in a training match on the sandbox (the training scene drives it;
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
  /** Player starts off the stage, in the air (recovery lesson). */
  offstage?: boolean;
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

export const LESSONS: Lesson[] = [
  { id: 'move', title: 'MOVE', goal: (d) => `RUN TO BOTH EDGES OF THE STAGE  (${words(d).sides})`, count: 2, dummy: 'stand', dummyPercent: 0 },
  { id: 'jump', title: 'JUMP', goal: (d) => { const { P } = words(d); return `PRESS ${P('jump')} TO JUMP, THEN ${P('jump')} AGAIN IN THE AIR TO DOUBLE JUMP`; }, count: 2, dummy: 'stand', dummyPercent: 0 },
  { id: 'attack', title: 'ATTACK', goal: (d) => `HIT THE DUMMY 3 TIMES WITH ${words(d).P('attack')}  (HOLD A DIRECTION FOR OTHER MOVES)`, count: 3, dummy: 'stand', dummyPercent: 0 },
  { id: 'special', title: 'SPECIALS', goal: (d) => { const { P } = words(d); return `USE 2 DIFFERENT SPECIALS: ${P('special')}, AND ${P('special')} + A DIRECTION`; }, count: 2, dummy: 'stand', dummyPercent: 0 },
  { id: 'shield', title: 'SHIELD', goal: (d) => `HOLD ${words(d).P('shield')} TO BLOCK 2 OF THE DUMMY'S ATTACKS`, count: 2, dummy: 'jab', dummyPercent: 0 },
  { id: 'grab', title: 'GRAB AND THROW', goal: (d) => `GET CLOSE, GRAB WITH ${words(d).P('grab')}, THEN PUSH ANY DIRECTION TO THROW`, count: 1, dummy: 'stand', dummyPercent: 0 },
  { id: 'recover', title: 'RECOVER', goal: (d) => { const { P, up } = words(d); return `GET BACK: DOUBLE JUMP, THEN ${P('special')} + ${up} TO REACH THE LEDGE`; }, count: 1, dummy: 'stand', dummyPercent: 0, offstage: true },
  { id: 'ko', title: 'KNOCK OUT', goal: (d) => { const { P } = words(d); return `THE DUMMY IS AT 150%: LAUNCH IT OFF THE SCREEN! (${P('smash')} OR A FLICK + ${P('attack')} FOR A SMASH)`; }, count: 1, dummy: 'stand', dummyPercent: 150 },
];

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
    if (l.offstage) {
      this.player.spawn(ground.x - 70, ground.top + 10, 1);
      this.player.jumpsLeft = this.player.stats.doubleJumps;
    } else if (this.player.state !== 'ko') this.player.standOn(ground, ground.x + ground.w * 0.3);
    if (this.dummy.state !== 'ko') this.dummy.standOn(ground, ground.x + ground.w * 0.6);
    this.player.facing = 1;
    this.dummy.facing = -1;
    this.dummy.damage = l.dummyPercent;
    this.player.damage = 0;
    this.player.snapped = this.dummy.snapped = true;
    this.pendingSetup = false;
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
      case 'recover':
        if (f === pl && (type === 'ledgeGrab' || (type === 'land' && pl.groundPlat === this.world.platforms[0]))) this.advance();
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
 * Starts the tutorial from any scene: a training match on the sandbox with the lesson overlay. Player 1 plays on `device`
 * (the one that chose the tutorial) when it is a pad or the touch controls; otherwise on keyboard 1 plus any pad, or on
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
        : new MergedDevice('p1', 'Keyboard + Gamepad', () => [inputManager.keyboards[0], ...inputManager.padList]);
  const char = character ?? session.players.find((p) => p.type === 'human')?.character ?? 'brick';
  session.mode = 'training';
  session.stage = 'sandbox';
  session.players = [
    { index: 0, type: 'human', device: dev, character: char, cpuLevel: 1 },
    { index: 1, type: 'cpu', device: null, character: char === 'vex' ? 'nova' : 'vex', cpuLevel: 1 }, // a light dummy (Brick's armour would shrug off light jabs)
  ];
  scene.scene.start('Match');
}
