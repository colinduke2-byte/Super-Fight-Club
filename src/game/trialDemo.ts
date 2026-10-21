/**
 * Combo-trial plans: a timing plan that performs a trial against a standing dummy, run in a headless world. The trial solver
 * (tests/tools/trialSolver.ts) searches these plans to prove every trial can be cleared; the Training menu's DEMO plays the
 * stored plan of a trial (src/game/trialPlans.ts) back as a ghost, so the demo is exactly the run the solver proved.
 *
 * A plan is one segment per trial step. Each segment starts once the previous step has been credited, waits `delay` frames,
 * walks toward the dummy for `walk` frames, then inputs the step's move: tilts / jabs / smashes / specials / throws from the
 * ground, aerials with a jump first (short or full hop, attack `rise` frames after the jump, drifting toward the dummy,
 * Jump held throughout for a hover). Before the first segment, the trial's `prep` moves are done one after another.
 */
import { CHARACTERS } from '../characters';
import { Button, type FighterInput, makeInput } from '../engine/buttons';
import { Fighter } from '../engine/fighter';
import { isActionable } from '../engine/training';
import type { StageData } from '../engine/types';
import { World } from '../engine/world';
import { STAGES } from '../stages';
import { type Trial, TrialChecker } from './trials';

export interface Segment {
  step: string;
  delay: number;
  walk: number;
  /** Aerials: frames from the jump press to the attack press; and full hop (Jump held) or short hop. */
  rise: number;
  full: boolean;
  drift: boolean;
  /** Aerials: keep Jump held throughout (a hover-capable fighter hangs in the air). */
  hover?: boolean;
}

/** A stored plan: the gap between the fighters at the start and the segments. */
export interface TrialPlan {
  gap: number;
  segs: Segment[];
}

const AERIALS = new Set(['nair', 'fair', 'bair', 'uair', 'dair']);
export const baseStep = (s: string): string => s.replace(/_.*$/, '');
/** Where the player stands at the start (the dummy stands `gap` to its right). */
export const PLAN_X = -60;
/** Frames a prep move gets before the next one (or the combo) starts, at most. */
const PREP_MAX = 70;

/** Presses the input of move `step` (ground or air) on this frame. */
export function pressStep(step: string, p: Fighter, inp: FighterInput): void {
  const s = baseStep(step);
  const f = p.facing;
  const press = (b: number, sx = 0, sy = 0): void => {
    inp.pressed |= b;
    inp.held |= b;
    inp.stickX = sx;
    inp.stickY = sy;
  };
  if (s === 'nair') press(Button.Attack);
  else if (s === 'fair') press(Button.Attack, f, 0);
  else if (s === 'bair') press(Button.Attack, -f, 0);
  else if (s === 'uair') press(Button.Attack, 0, -1);
  else if (s === 'dair') press(Button.Attack, 0, 1);
  else if (/^jab/.test(s)) press(Button.Attack);
  else if (s === 'dtilt') press(Button.Attack, 0, 1);
  else if (s === 'utilt') press(Button.Attack, 0, -1);
  else if (s === 'ftilt') press(Button.Attack, f * 0.8, 0);
  else if (s === 'fsmash') press(Button.Smash, f, 0);
  else if (s === 'usmash') press(Button.Smash, 0, -1);
  else if (s === 'dsmash') press(Button.Smash, 0, 1);
  else if (s === 'neutralB' || s === 'recall' || s === 'detonate') press(Button.Special);
  else if (s === 'sideB' || s === 'sideBite') press(Button.Special, f, 0);
  else if (s === 'upB') press(Button.Special, 0, -1);
  else if (s === 'downB' || s === 'detonateC4') press(Button.Special, 0, 1);
  else if (/throw$/.test(s)) press(Button.Grab);
  else throw new Error(`trial plan: no input for step '${s}'`);
}

/** The input for frame `t` (0 = the segment's first frame) of `seg`, given the live fighters. */
export function segInput(seg: Segment, t: number, p: Fighter, d: Fighter, inp: FighterInput): void {
  const toward = d.x >= p.x ? 1 : -1;
  const s = baseStep(seg.step);
  if (t < seg.delay) return;
  t -= seg.delay;
  if (t < seg.walk) {
    inp.stickX = toward * 0.5;
    return;
  }
  t -= seg.walk;
  const f = p.facing;
  if (AERIALS.has(s)) {
    if (seg.hover && t > 0) inp.held |= Button.Jump;
    if (t === 0) {
      inp.pressed |= Button.Jump;
      inp.held |= Button.Jump;
      inp.stickX = seg.drift ? toward * 0.6 : 0;
    } else if (t < seg.rise) {
      if (seg.full) inp.held |= Button.Jump;
      if (seg.drift) inp.stickX = Math.abs(d.x - p.x) > 4 ? toward : 0;
    } else if (t === seg.rise) {
      pressStep(s, p, inp);
    } else if (seg.drift && t < seg.rise + 20) inp.stickX = Math.abs(d.x - p.x) > 6 ? toward * 0.5 : 0;
    return;
  }
  if (t > 0) {
    if (/throw$/.test(s) && t < 30) {
      // hold the throw direction while the grab plays out
      inp.stickX = s === 'fthrow' ? f : s === 'bthrow' ? -f : 0;
      inp.stickY = s === 'uthrow' ? -1 : s === 'dthrow' ? 1 : 0;
    }
    return;
  }
  pressStep(s, p, inp);
}

/** A trial plan being played in its own world (the solver's run, and the demo ghost). */
export class TrialRun {
  readonly world: World;
  readonly player: Fighter;
  readonly dummy: Fighter;
  readonly checker: TrialChecker;
  /** Highest trial progress reached, and the frame each step was first credited on. */
  progress = 0;
  readonly at: number[] = [];
  done = false;
  /** The combo dropped, or the plan ran out of time. */
  failed = false;
  frame = 0;
  private readonly starts: number[] = [];
  private segStart = 0;
  private prevHeld = 0;
  private prepIdx = 0;
  private prepT = 0;
  private readonly inp = makeInput();
  private readonly idle = makeInput();

  constructor(
    fighterId: string,
    readonly trial: Trial,
    readonly plan: TrialPlan,
    dummyId = defaultDummy(fighterId),
    stage: StageData = STAGES.classic,
  ) {
    const world = (this.world = new World(stage));
    world.config.smashFlick = false;
    const p = (this.player = new Fighter(0, CHARACTERS[fighterId]));
    const d = (this.dummy = new Fighter(1, CHARACTERS[dummyId]));
    world.addFighter(p);
    world.addFighter(d);
    const g = world.platforms[0];
    p.standOn(g, PLAN_X);
    d.standOn(g, PLAN_X + plan.gap);
    p.facing = 1;
    d.facing = -1;
    p.invuln = d.invuln = 0;
    d.damage = trial.percent;
    applyTrialSetup(trial, p, d);
    const c = (this.checker = new TrialChecker(trial, p, d));
    c.world = world;
    world.listener = (t, f) => c.onEvent(t, f);
  }

  /** The input this frame (prep moves, then the plan's segments). */
  private input(): FighterInput {
    const inp = this.inp;
    const p = this.player;
    const d = this.dummy;
    inp.pressed = inp.held = inp.released = 0;
    inp.stickX = inp.stickY = 0;
    const prep = this.trial.prep ?? [];
    if (this.prepIdx < prep.length) {
      // '~move': turn away from the dummy first (a tap of the stick), then the move
      const away = prep[this.prepIdx].startsWith('~');
      const move = away ? prep[this.prepIdx].slice(1) : prep[this.prepIdx];
      const at = away ? 3 : 0;
      if (this.prepT < at) inp.stickX = (d.x >= p.x ? -1 : 1) * 0.4;
      else if (this.prepT === at) pressStep(move, p, inp);
      this.prepT++;
      if (this.prepT > at + 4 && (isActionable(p) || this.prepT >= PREP_MAX)) {
        this.prepIdx++;
        this.prepT = 0;
        p.facing = d.x >= p.x ? 1 : -1;
      }
      return inp;
    }
    const plan = this.plan.segs;
    const seg = this.starts.length;
    // the next segment starts once its predecessor's step has been credited (or right away for the first)
    if (seg < plan.length && (seg === 0 || this.at[seg - 1] !== undefined)) {
      this.starts[seg] = seg === 0 ? this.frame : this.at[seg - 1];
      this.segStart = this.starts[seg];
    }
    const cur = this.starts.length - 1;
    if (cur >= 0 && cur < plan.length) segInput(plan[cur], this.frame - this.segStart, p, d, inp);
    return inp;
  }

  /** One frame. Returns false once the run is over (done or failed). */
  step(): boolean {
    if (this.done || this.failed) return false;
    const inp = this.input();
    inp.released = this.prevHeld & ~inp.held;
    this.prevHeld = inp.held;
    this.world.step([inp, this.idle]);
    const c = this.checker;
    c.tick();
    if (c.progress < this.progress) {
      this.failed = true; // the combo dropped
      return false;
    }
    if (c.progress > this.progress) {
      for (let k = this.progress; k < c.progress; k++) this.at[k] = this.frame;
      this.progress = c.progress;
    }
    if (c.done) {
      this.done = true;
      return false;
    }
    const plan = this.plan.segs;
    const cur = this.starts.length - 1;
    // the last segment had its chance
    if ((cur >= plan.length - 1 && cur >= 0 && this.frame - this.segStart > 120) || this.frame > 500) this.failed = true;
    this.frame++;
    return !this.failed;
  }

  /** Runs to the end; returns whether the trial was cleared. */
  run(): boolean {
    while (this.step());
    return this.done;
  }
}

/** The dummy trials are solved against (a mirror match is avoided). */
export function defaultDummy(fighterId: string): string {
  return fighterId === 'nova' ? 'vex' : 'nova';
}

/** A trial's starting state: the player's resources and the dummy's chill stacks. */
export function applyTrialSetup(trial: Trial, p: Fighter, d: Fighter): void {
  for (const [k, v] of Object.entries(trial.res ?? {})) p.res[k] = v;
  if (trial.chill) {
    d.status.chill = trial.chill;
    d.status.chillT = 600;
  }
}
