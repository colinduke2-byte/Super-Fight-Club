/**
 * Combo-trial solver: searches button timings until a fighter completes one of its combo trials against a standing dummy,
 * judged by the real TrialChecker (true combos only). Used by tests/trials.test.ts to prove every trial can be cleared.
 *
 * A plan is one segment per trial step. Each segment waits `delay` frames after the previous segment started, walks
 * toward the dummy for `walk` frames, then inputs the step's move: tilts / jabs / smashes / specials / throws from the
 * ground, aerials with a jump first (short or full hop, attack `rise` frames after the jump, drifting toward the dummy).
 */
import { CHARACTERS } from '../../src/characters';
import { Button, type FighterInput, makeInput } from '../../src/engine/buttons';
import { Fighter } from '../../src/engine/fighter';
import { World } from '../../src/engine/world';
import { type Trial, TrialChecker } from '../../src/game/trials';
import { STAGES } from '../../src/stages';

export interface Segment {
  step: string;
  delay: number;
  walk: number;
  /** Aerials: frames from the jump press to the attack press; and full hop (Jump held) or short hop. */
  rise: number;
  full: boolean;
  drift: boolean;
}

const AERIALS = new Set(['nair', 'fair', 'bair', 'uair', 'dair']);
const base = (s: string): string => s.replace(/_.*$/, '');

/** The input for frame `t` (0 = the segment's first frame) of `seg`, given the live fighters. */
function segInput(seg: Segment, t: number, p: Fighter, d: Fighter, inp: FighterInput): void {
  const toward = d.x >= p.x ? 1 : -1;
  const s = base(seg.step);
  const press = (b: number, sx = 0, sy = 0): void => {
    inp.pressed |= b;
    inp.held |= b;
    inp.stickX = sx;
    inp.stickY = sy;
  };
  if (t < seg.delay) return;
  t -= seg.delay;
  if (t < seg.walk) {
    inp.stickX = toward * 0.5;
    return;
  }
  t -= seg.walk;
  const f = p.facing;
  if (AERIALS.has(s)) {
    if (t === 0) press(Button.Jump, seg.drift ? toward * 0.6 : 0);
    else if (t < seg.rise) {
      if (seg.full) inp.held |= Button.Jump;
      if (seg.drift) inp.stickX = Math.abs(d.x - p.x) > 4 ? toward : 0;
    } else if (t === seg.rise) {
      const sx = s === 'fair' ? f : s === 'bair' ? -f : 0;
      press(Button.Attack, sx, s === 'uair' ? -1 : s === 'dair' ? 1 : 0);
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
  if (/^jab/.test(s)) press(Button.Attack);
  else if (s === 'dtilt') press(Button.Attack, 0, 1);
  else if (s === 'utilt') press(Button.Attack, 0, -1);
  else if (s === 'ftilt') press(Button.Attack, f * 0.8, 0);
  else if (s === 'fsmash') press(Button.Smash, f, 0);
  else if (s === 'usmash') press(Button.Smash, 0, -1);
  else if (s === 'dsmash') press(Button.Smash, 0, 1);
  else if (s === 'neutralB') press(Button.Special);
  else if (s === 'sideB') press(Button.Special, f, 0);
  else if (s === 'upB') press(Button.Special, 0, -1);
  else if (s === 'downB') press(Button.Special, 0, 1);
  else if (/throw$/.test(s)) press(Button.Grab);
  else throw new Error(`trialSolver: no input for step '${s}'`);
}

export interface RunResult {
  /** Highest trial progress reached. */
  progress: number;
  done: boolean;
  /** Frame at which each step was first credited. */
  at: number[];
}

/** Simulate `plan` (a prefix of the trial's steps is fine) and report how far the trial got. */
export function runPlan(fighterId: string, trial: Trial, plan: Segment[], gap: number, dummyId: string): RunResult {
  const world = new World(STAGES.classic);
  world.config.smashFlick = false;
  const p = new Fighter(0, CHARACTERS[fighterId]);
  const d = new Fighter(1, CHARACTERS[dummyId]);
  world.addFighter(p);
  world.addFighter(d);
  const g = world.platforms[0];
  p.standOn(g, -60);
  d.standOn(g, -60 + gap);
  p.facing = 1;
  d.facing = -1;
  p.invuln = d.invuln = 0;
  d.damage = trial.percent;
  const c = new TrialChecker(trial, p, d);
  world.listener = (t, f) => c.onEvent(t, f);
  const res: RunResult = { progress: 0, done: false, at: [] };
  const starts: number[] = [];
  const inp = makeInput();
  const idle = makeInput();
  let segStart = 0;
  let seg = 0;
  let prevHeld = 0;
  for (let frame = 0; frame < 400; frame++) {
    // the next segment starts once its predecessor's step has been credited (or right away for the first)
    if (seg < plan.length && (seg === 0 || res.at[seg - 1] !== undefined) && starts[seg] === undefined) {
      starts[seg] = seg === 0 ? 0 : res.at[seg - 1];
      segStart = starts[seg];
    }
    inp.pressed = inp.held = inp.released = 0;
    inp.stickX = inp.stickY = 0;
    const cur = starts.length - 1;
    if (cur >= 0 && cur < plan.length) segInput(plan[cur], frame - segStart, p, d, inp);
    inp.released = prevHeld & ~inp.held;
    prevHeld = inp.held;
    world.step([inp, idle]);
    c.tick();
    if (c.progress < res.progress) break; // the combo dropped
    if (c.progress > res.progress) {
      for (let k = res.progress; k < c.progress; k++) res.at[k] = frame;
      res.progress = c.progress;
    }
    if (c.done) {
      res.done = true;
      return res;
    }
    seg = starts.length;
    // the last segment had its chance
    if (cur >= plan.length - 1 && cur >= 0 && frame - segStart > 120) break;
  }
  return res;
}

function candidates(step: string, first: boolean): Segment[] {
  const s = base(step);
  const out: Segment[] = [];
  const delays = first ? [0] : [0, 1, 2, 3, 4, 6, 8, 10, 12, 14, 16, 18, 20, 24, 28, 32];
  const walks = first ? [0] : [0, 4, 8, 14];
  if (AERIALS.has(s)) {
    for (const delay of delays)
      for (const rise of [4, 6, 8, 10, 12, 14, 17, 20, 24])
        for (const full of [false, true]) for (const drift of [true, false]) out.push({ step, delay, walk: 0, rise, full, drift });
  } else {
    for (const walk of walks) for (const delay of delays) out.push({ step, delay, walk, rise: 0, full: false, drift: false });
  }
  return out;
}

/**
 * Search a plan that clears `trial` for `fighterId` (dummy: `dummyId`). Returns the plan, or null when nothing in the
 * search space clears it. Depth-first over steps with a bounded number of simulations.
 */
export function solveTrial(fighterId: string, trial: Trial, dummyId = fighterId === 'nova' ? 'vex' : 'nova', budget = 6000): { plan: Segment[]; gap: number } | null {
  let sims = 0;
  for (const gap of [18, 26, 36, 12]) {
    const dfs = (plan: Segment[]): Segment[] | null => {
      const i = plan.length;
      if (i === trial.steps.length) return plan;
      for (const cand of candidates(trial.steps[i], i === 0)) {
        if (++sims > budget) return null;
        const next = [...plan, cand];
        const r = runPlan(fighterId, trial, next, gap, dummyId);
        if (r.done) return next;
        if (r.progress > i) {
          const sol = dfs(next);
          if (sol) return sol;
          if (sims > budget) return null;
          // a step that connects but leads nowhere: try only a few more timings of it
          if (i > 0) continue;
          return null;
        }
      }
      return null;
    };
    const plan = dfs([]);
    if (plan) return { plan, gap };
    if (sims > budget) return null;
  }
  return null;
}
