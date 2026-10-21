/**
 * Combo-trial solver: searches button timings until a fighter completes one of its combo trials against a standing dummy,
 * judged by the real TrialChecker (true combos only). Used by tests/trials.test.ts to prove every trial can be cleared, and
 * (with UPDATE_TRIAL_PLANS=1) to write the proved plans to src/game/trialPlans.ts, which the Training menu's DEMO plays.
 *
 * The plan format and the way a plan is played (prep moves, then one segment per step) live in src/game/trialDemo.ts, so
 * the solver and the in-game demo run exactly the same inputs.
 */
import { type Segment, type TrialPlan, TrialRun, baseStep, defaultDummy } from '../../src/game/trialDemo';
import type { Trial } from '../../src/game/trials';

export type { Segment } from '../../src/game/trialDemo';

const AERIALS = new Set(['nair', 'fair', 'bair', 'uair', 'dair']);

export interface RunResult {
  /** Highest trial progress reached. */
  progress: number;
  done: boolean;
  /** Frame at which each step was first credited. */
  at: number[];
}

/** Simulate `plan` (a prefix of the trial's steps is fine) and report how far the trial got. */
export function runPlan(fighterId: string, trial: Trial, plan: Segment[], gap: number, dummyId: string): RunResult {
  const r = new TrialRun(fighterId, trial, { gap, segs: plan }, dummyId);
  r.run();
  return { progress: r.progress, done: r.done, at: r.at };
}

function candidates(step: string, first: boolean, hover: boolean): Segment[] {
  const s = baseStep(step);
  const out: Segment[] = [];
  const delays = first ? [0] : [0, 1, 2, 3, 4, 6, 8, 10, 12, 14, 16, 18, 20, 24, 28, 32];
  const walks = first ? [0] : [0, 4, 8, 14];
  if (AERIALS.has(s)) {
    for (const delay of delays)
      for (const rise of hover ? [14, 20, 26, 32, 40] : [4, 6, 8, 10, 12, 14, 17, 20, 24])
        for (const full of [false, true]) for (const drift of [true, false]) out.push({ step, delay, walk: 0, rise, full, drift, ...(hover ? { hover: true } : {}) });
  } else {
    for (const walk of walks) for (const delay of delays) out.push({ step, delay, walk, rise: 0, full: false, drift: false });
  }
  return out;
}

/**
 * Search a plan that clears `trial` for `fighterId` (dummy: `dummyId`). Returns the plan, or null when nothing in the
 * search space clears it. Depth-first over steps with a bounded number of simulations.
 */
export function solveTrial(fighterId: string, trial: Trial, dummyId = defaultDummy(fighterId), budget = 6000): TrialPlan | null {
  let sims = 0;
  for (const gap of [18, 26, 36, 12, 48]) {
    const dfs = (plan: Segment[]): Segment[] | null => {
      const i = plan.length;
      if (i === trial.steps.length) return plan;
      for (const cand of candidates(trial.steps[i], i === 0, trial.cond?.[i] === 'hover')) {
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
    if (plan) return { gap, segs: plan };
    if (sims > budget) return null;
  }
  return null;
}
