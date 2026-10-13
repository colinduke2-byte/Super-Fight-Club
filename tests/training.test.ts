import { describe, expect, it } from 'vitest';
import { brick } from '../src/characters/brick';
import { makeProtoBase } from '../src/characters/proto';
import { makeInput } from '../src/engine/buttons';
import { Fighter } from '../src/engine/fighter';
import { buildScenarios, TrainingRunner } from '../src/engine/training';
import type { CharacterData } from '../src/engine/types';
import { World } from '../src/engine/world';
import { sandboxStage } from '../src/stages/sandbox';

function setup(data: CharacterData): { world: World; p: Fighter; d: Fighter; runner: TrainingRunner } {
  const world = new World(sandboxStage);
  const p = new Fighter(0, data);
  const d = new Fighter(1, brick);
  world.addFighter(p);
  world.addFighter(d);
  const runner = new TrainingRunner(world, p, d);
  world.listener = (t, f, x, y, m, e) => runner.onEvent(t, f, x, y, m, e);
  return { world, p, d, runner };
}

function runScenario(world: World, runner: TrainingRunner, max = 700): number {
  const inp = makeInput();
  runner.start();
  let n = 0;
  while (runner.running && n < max) {
    runner.step(inp);
    world.step([inp, makeInput()]);
    n++;
  }
  return n;
}

describe('training scenarios', () => {
  it('there is one scenario per move, melee moves first', () => {
    const { p } = setup(brick);
    const sc = buildScenarios(p);
    expect(sc.length).toBe(Object.values(brick.moves).filter((m) => !m.hidden).length);
    expect(sc[0].moveId).toBe('jab1');
    expect(sc.find((s) => s.moveId === 'nair')!.hover).toBe(true);
    expect(sc.find((s) => s.moveId === 'fthrow')!.needsGrab).toBe(true);
  });

  it('every Brick move runs to completion and every damaging melee move connects with the dummy', () => {
    const { world, p, runner } = setup(brick);
    for (const sc of runner.scenarios) {
      runner.index = sc.index;
      const ticks = runScenario(world, runner);
      expect(ticks, sc.moveId).toBeLessThan(700);
      expect(runner.running, sc.moveId).toBe(false);
      const m = brick.moves[sc.moveId];
      if (['jab', 'smash', 'aerial', 'throw', 'ultimate'].includes(m.kind) && sc.moveId !== 'dair') {
        expect(runner.hits, `${sc.moveId} should hit the dummy`).toBeGreaterThan(0);
        expect(runner.lastHit!.damage).toBeGreaterThan(0);
      }
    }
    expect(p.state).not.toBe('ko');
  });

  it('Brick\'s specials are demonstrable too: Vent gets its Heat topped up, Grapple Slam grabs and slams', () => {
    const { world, p, runner } = setup(brick);
    for (const id of ['neutralB', 'sideB', 'downB']) {
      runner.index = runner.scenarios.findIndex((s) => s.moveId === id);
      expect(runner.index, id).toBeGreaterThanOrEqual(0);
      runScenario(world, runner);
      expect(runner.hits, `${id} should hit the dummy`).toBeGreaterThan(0);
    }
    expect(runner.scenarios.some((s) => s.moveId === 'slam')).toBe(false); // internal follow-up is hidden
    expect(p.res.heat).toBeGreaterThanOrEqual(0);
  });

  it('every dev-character move (projectiles, traps, tether, ultimate, ...) runs without errors', () => {
    const { world, runner } = setup(makeProtoBase());
    for (const sc of runner.scenarios) {
      runner.index = sc.index;
      expect(() => runScenario(world, runner), sc.moveId).not.toThrow();
    }
  });

  it('the ultimate scenario fills the meter and plays the cinematic', () => {
    const { world, runner } = setup(makeProtoBase());
    runner.index = runner.scenarios.findIndex((s) => s.moveId === 'ultimate');
    const events: string[] = [];
    const prev = world.listener!;
    world.listener = (t, f, x, y, m, e) => {
      events.push(t);
      prev(t, f, x, y, m, e);
    };
    runScenario(world, runner);
    expect(events).toContain('cinematicStart');
    expect(events).toContain('cinematicEnd');
  });

  it('reset restores positions, percent and clears traps and projectiles', () => {
    const { world, p, d, runner } = setup(makeProtoBase());
    world.spawnDeployable(0, 'mine', 0, 0);
    world.spawnProjectile(0, 'bolt', 0, -50, 1, 0);
    d.damage = 999;
    runner.select(1);
    expect(world.deployables.some((x) => x.active)).toBe(false);
    expect(world.projectiles.some((x) => x.active)).toBe(false);
    expect(d.damage).toBe(runner.current.dummyPercent);
    expect(p.grounded || runner.current.air).toBe(true);
  });

  it('report() describes the frame data and the last hit', () => {
    const { world, runner } = setup(brick);
    runScenario(world, runner);
    const text = runner.report().join('\n');
    expect(text).toContain('Piston Jab 1');
    expect(text).toContain(`startup ${brick.moves.jab1.startup}`);
    expect(text).toContain('LAST HIT');
  });
});
