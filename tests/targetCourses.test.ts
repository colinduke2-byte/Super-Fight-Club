import { describe, expect, it } from 'vitest';
import { CHARACTERS } from '../src/characters';
import { Button, makeInput, type FighterInput } from '../src/engine/buttons';
import { validateStage } from '../src/engine/stageValidation';
import { MatchRunner } from '../src/game/runner';
import { bestCourseRun, Ghost, InputTape, quantizeStick, recordCourseRun, resetCourseRunCache, splitDelta, TapeReader } from '../src/game/targetRuns';
import { courseFor, SHARED_COURSES, TARGET_COURSES, targetCourseById } from '../src/stages/targetCourses';
import { memStorage } from './tools/memStorage';
import { proveCourse } from './tools/targetSolver';

const ROSTER = Object.keys(CHARACTERS);

describe('Target Smash courses', () => {
  it('a course per fighter and three shared ones of rising difficulty, all valid stages with ten targets inside the blast zones', () => {
    for (const id of ROSTER) {
      const c = courseFor(id);
      expect(c.fighter, id).toBe(id);
      expect(c.id).toBe(c.stage.id);
    }
    expect(SHARED_COURSES.map((c) => c.difficulty)).toEqual([1, 2, 3]);
    expect(new Set(TARGET_COURSES.map((c) => c.id)).size).toBe(TARGET_COURSES.length);
    for (const c of TARGET_COURSES) {
      expect(() => validateStage(c.stage), c.id).not.toThrow();
      const ts = c.stage.targets ?? [];
      expect(ts, c.id).toHaveLength(10);
      const b = c.stage.blast;
      for (const t of ts) expect(t.x > b.left && t.x < b.right && t.y > b.top && t.y < b.bottom, `${c.id} ${t.x},${t.y}`).toBe(true);
      expect(targetCourseById(c.id)).toBe(c);
    }
  });

  // proof in the sim: from the spawn, every target can be broken by the fighter's own kit and the fighter lands safely
  for (const c of TARGET_COURSES) {
    const who = c.fighter ? [c.fighter] : ROSTER;
    it(`${c.id} (${c.stage.name}) is clearable by ${c.fighter ?? 'every fighter'}`, () => {
      for (const id of who) {
        const proof = proveCourse(c.stage, id, 600);
        const missing = proof.plans.map((p, i) => (p ? -1 : i)).filter((i) => i >= 0);
        expect(missing, `${c.id} with ${id}: targets with no route ${missing.join(', ')}`).toEqual([]);
      }
    }, 240_000);
  }
});

/** A pseudo-random but repeatable input stream: runs, jumps and attacks, with analog stick values. */
function script(t: number, out: FighterInput): void {
  const k = Math.floor(t / 23);
  out.stickX = [0.73, -0.41, 1, 0, -1, 0.2][k % 6];
  out.stickY = t % 47 < 4 ? -0.9 : 0;
  out.held = (t % 31 < 3 ? Button.Jump : 0) | (t % 17 === 5 ? Button.Attack : 0) | (t % 89 === 40 ? Button.Special : 0);
  out.pressed = out.held & ~(t % 31 > 0 && t % 31 < 3 ? Button.Jump : 0);
  out.released = 0;
}

describe('Target Smash ghosts and splits', () => {
  it('a tape replays a run exactly: the ghost follows the live fighter tick for tick', () => {
    const c = courseFor('vex');
    const cfg = { mode: 'stock' as const, stocks: 3, timeLimitSec: 0, respawnDelay: 70 };
    const live = new MatchRunner({ stage: c.stage, characters: ['vex'], rules: cfg, targets: true });
    const tape = new InputTape();
    const inp = makeInput();
    const xs: number[] = [];
    for (let t = 0; t < 900 && !live.over; t++) {
      script(t, inp);
      inp.stickX = quantizeStick(inp.stickX);
      inp.stickY = quantizeStick(inp.stickY);
      tape.record(inp);
      live.step([inp]);
      xs.push(live.fighters[0].x, live.fighters[0].y);
    }
    expect(tape.data.length / 6).toBeLessThan(tape.ticks); // a change list, not every tick
    const ghost = new Ghost(c.stage, 'vex', cfg, { ticks: 1, splits: [], tape: tape.data, tapeTicks: tape.ticks, flick: live.smashFlick });
    for (let t = 0; t < tape.ticks; t++) {
      ghost.step();
      expect(ghost.fighter.x, `x at ${t}`).toBe(xs[t * 2]);
      expect(ghost.fighter.y, `y at ${t}`).toBe(xs[t * 2 + 1]);
    }
    expect(ghost.over).toBe(true);
  });

  it('the tape reader gives back each tick as recorded', () => {
    const tape = new InputTape();
    const a = makeInput();
    const seen: string[] = [];
    for (let t = 0; t < 50; t++) {
      script(t, a);
      a.stickX = quantizeStick(a.stickX);
      tape.record(a);
      seen.push(JSON.stringify([a.stickX, quantizeStick(a.stickY), a.held, a.pressed, a.released]));
    }
    const r = new TapeReader(tape);
    const b = makeInput();
    for (let t = 0; t < 50; t++) {
      r.next(b);
      expect(JSON.stringify([b.stickX, b.stickY, b.held, b.pressed, b.released]), `tick ${t}`).toBe(seen[t]);
    }
  });

  it('only a faster clear replaces the best run; split deltas read ahead / behind', () => {
    memStorage();
    resetCourseRunCache();
    const run = (ticks: number) => ({ ticks, splits: [ticks / 2, ticks], tape: [0, 0, 0, 0, 0, 0], tapeTicks: ticks, flick: false });
    expect(bestCourseRun('targets-vex', 'vex')).toBeNull();
    expect(recordCourseRun('targets-vex', 'vex', run(1200))).toBe(true);
    expect(recordCourseRun('targets-vex', 'vex', run(1300))).toBe(false);
    expect(recordCourseRun('targets-vex', 'vex', run(1100))).toBe(true);
    resetCourseRunCache();
    expect(bestCourseRun('targets-vex', 'vex')?.ticks).toBe(1100);
    expect(bestCourseRun('targets-vex', 'brick')).toBeNull();
    expect(splitDelta(570, 600)).toBe('-0.50');
    expect(splitDelta(663, 600)).toBe('+1.05');
  });
});
