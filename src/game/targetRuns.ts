import { Button, INPUT_MASK, type FighterInput } from '../engine/buttons';

/** Every input bit but Pause (the buttons and the sprint flags). */
const TAPE_MASK = INPUT_MASK & ~Button.Pause;
import type { MatchConfig } from '../engine/match';
import type { StageData } from '../engine/types';
import { courseFor, targetCourseById, type TargetCourse } from '../stages/targetCourses';
import { MatchRunner } from './runner';

/**
 * Target Smash runs beyond the per-fighter best time in records.ts: which course is played, the best run per course and
 * fighter (time, the split at each target and the run's inputs), and the ghost that replays that best run beside you.
 */

// ---- course choice -----------------------------------------------------------------------------

/** 'own': each fighter plays its own course; otherwise a course id (a shared course) everyone plays. */
let choice = 'own';

/** Picks the course the next Target Smash runs play ('own' or a course id). */
export function setTargetCourse(id: string): void {
  choice = id === 'own' || targetCourseById(id) ? id : 'own';
}

export function targetCourseChoice(): string {
  return choice;
}

/** The course `character` plays under the current choice. */
export function chosenCourse(character: string): TargetCourse {
  return (choice !== 'own' && targetCourseById(choice)) || courseFor(character);
}

// ---- input tapes (ghosts) ----------------------------------------------------------------------

/** Stick values are kept to 1/256 (the live run's input is rounded the same way, so its ghost replays it exactly). */
export const STICK_STEPS = 256;
export function quantizeStick(v: number): number {
  return Math.round(Math.max(-1, Math.min(1, v)) * STICK_STEPS) / STICK_STEPS;
}

/**
 * A run's inputs as a change list: [tick, stickX*256, stickY*256, held, pressed, released] for each tick that differs from
 * the one before (most ticks repeat the last), flattened.
 */
export class InputTape {
  data: number[] = [];
  ticks = 0;
  private last = [NaN, NaN, NaN, NaN, NaN];

  record(inp: FighterInput): void {
    const v = [Math.round(inp.stickX * STICK_STEPS), Math.round(inp.stickY * STICK_STEPS), inp.held & TAPE_MASK, inp.pressed & TAPE_MASK, inp.released & TAPE_MASK];
    const l = this.last;
    if (v[0] !== l[0] || v[1] !== l[1] || v[2] !== l[2] || v[3] !== l[3] || v[4] !== l[4]) {
      this.data.push(this.ticks, ...v);
      this.last = v;
    }
    this.ticks++;
  }

  static from(data: number[], ticks: number): InputTape {
    const t = new InputTape();
    t.data = data;
    t.ticks = ticks;
    return t;
  }
}

/** Plays an InputTape back one tick at a time. */
export class TapeReader {
  private i = 0;
  private cur = [0, 0, 0, 0, 0];
  private tick = 0;
  constructor(private readonly tape: InputTape) {}

  get done(): boolean {
    return this.tick >= this.tape.ticks;
  }

  next(out: FighterInput): void {
    const d = this.tape.data;
    while (this.i < d.length && d[this.i] <= this.tick) {
      if (d[this.i] === this.tick) this.cur = d.slice(this.i + 1, this.i + 6);
      this.i += 6;
    }
    out.stickX = this.cur[0] / STICK_STEPS;
    out.stickY = this.cur[1] / STICK_STEPS;
    out.held = this.cur[2];
    out.pressed = this.cur[3];
    out.released = this.cur[4];
    this.tick++;
  }
}

// ---- best runs ---------------------------------------------------------------------------------

export interface CourseRun {
  ticks: number;
  /** Tick each target broke on, in breaking order. */
  splits: number[];
  /** The run's inputs (InputTape data) and length. */
  tape: number[];
  tapeTicks: number;
  /** Smash input mode the run was played in (the ghost replays it the same way). */
  flick: boolean;
}

const KEY = 'sfc.targetCourses.v1';
type Store = Record<string, CourseRun>;
let cache: Store | null = null;

function load(): Store {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(KEY);
    const v = raw ? (JSON.parse(raw) as unknown) : {};
    cache = v && typeof v === 'object' ? (v as Store) : {};
  } catch {
    cache = {};
  }
  return cache;
}

function save(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(cache ?? {}));
  } catch {
    // storage full or blocked: bests last for this session only
  }
}

const key = (course: string, character: string): string => `${course}:${character}`;

/** The best run on `course` with `character` (null: none yet). */
export function bestCourseRun(course: string, character: string): CourseRun | null {
  const r = load()[key(course, character)];
  return r && typeof r.ticks === 'number' && Array.isArray(r.splits) ? r : null;
}

/** Keeps a cleared run if it beats the best. Returns true for a new best. */
export function recordCourseRun(course: string, character: string, run: CourseRun): boolean {
  const best = bestCourseRun(course, character);
  if (best && best.ticks <= run.ticks) return false;
  load()[key(course, character)] = run;
  save();
  return true;
}

/** Test hook: forget the cache (re-read storage). */
export function resetCourseRunCache(): void {
  cache = null;
}

/** Split difference text against the best: '-0.42' (ahead) or '+1.05' (behind), in seconds. */
export function splitDelta(ticks: number, bestTicks: number): string {
  const d = (ticks - bestTicks) / 60;
  return `${d <= 0 ? '-' : '+'}${Math.abs(d).toFixed(2)}`;
}

// ---- ghost -------------------------------------------------------------------------------------

/** The best run replayed in its own headless match beside the live one (same course, same fighter, same inputs). */
export class Ghost {
  readonly runner: MatchRunner;
  private readonly reader: TapeReader;
  private readonly inp: FighterInput[];

  constructor(stage: StageData, character: string, cfg: MatchConfig, run: CourseRun) {
    this.runner = new MatchRunner({ stage, characters: [character], rules: cfg, targets: true, smashFlick: run.flick });
    this.reader = new TapeReader(InputTape.from(run.tape, run.tapeTicks));
    this.inp = [{ stickX: 0, stickY: 0, held: 0, pressed: 0, released: 0 }];
  }

  get fighter() {
    return this.runner.fighters[0];
  }

  /** Over: the tape ran out or its run ended (it holds its last pose). */
  get over(): boolean {
    return this.reader.done || this.runner.over;
  }

  step(): void {
    if (this.over) return;
    this.reader.next(this.inp[0]);
    this.runner.step(this.inp);
  }
}
