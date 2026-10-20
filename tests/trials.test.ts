import { describe, expect, it } from 'vitest';
import { CHARACTERS } from '../src/characters';
import { TRIALS, TrialChecker } from '../src/game/trials';
import { Fighter } from '../src/engine/fighter';
import { World } from '../src/engine/world';
import { STAGES } from '../src/stages';
import { solveTrial } from './tools/trialSolver';

describe('combo trials are true combos', () => {
  it('a string whose hits do not link (the dummy recovers in between) does not clear', () => {
    const world = new World(STAGES.classic);
    const p = new Fighter(0, CHARACTERS.brick);
    const d = new Fighter(1, CHARACTERS.nova);
    world.addFighter(p);
    world.addFighter(d);
    const c = new TrialChecker({ id: 't', name: 't', steps: ['jab1', 'jab1'], percent: 0, tip: '' }, p, d);
    c.onHit('jab1', 1);
    c.onHit('jab1', 1); // second hit lands as a fresh combo (the dummy was out of hitstun)
    expect(c.done).toBe(false);
    c.onHit('jab1', 2);
    expect(c.done).toBe(true);
  });

  // every trial of every fighter is cleared in the sim by a searched input timing, judged by the real TrialChecker
  for (const [id, trials] of Object.entries(TRIALS)) {
    it(`${id}: all ${trials.length} trials can be completed`, () => {
      for (const t of trials) expect(solveTrial(id, t), `${id} ${t.name} (${t.steps.join(' > ')} at ${t.percent}%)`).not.toBeNull();
    }, 120_000);
  }
});
