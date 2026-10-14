import { describe, expect, it } from 'vitest';
import { agni } from '../src/characters/agni';
import { brick } from '../src/characters/brick';
import { Button, makeInput, type FighterInput } from '../src/engine/buttons';
import { Fighter } from '../src/engine/fighter';
import { World } from '../src/engine/world';
import { LAUNCH_GRACE, LAUNCH_TIMER, LaunchContest } from '../src/game/launch';
import { launchStage, LAUNCH_EDGE } from '../src/stages/launch';

const inp = (o: Partial<FighterInput> = {}): FighterInput => ({ ...makeInput(), ...o });

function setup(dmg: number) {
  const world = new World(launchStage);
  const p = new Fighter(0, agni);
  const bag = new Fighter(1, brick);
  world.addFighter(p);
  world.addFighter(bag);
  p.spawn(40, -2, 1);
  bag.spawn(80, -2, -1);
  for (let i = 0; i < 30; i++) world.step([inp(), inp()]);
  p.invuln = bag.invuln = 0;
  bag.damage = dmg;
  return { world, p, bag, lc: new LaunchContest(bag) };
}

const run = (world: World, lc: LaunchContest, i: FighterInput, n = 1) => {
  for (let k = 0; k < n; k++) {
    world.step([i, inp()]);
    lc.step();
  }
};

describe('Launch Contest', () => {
  it('the barrier keeps the dummy on the platform, even when smashed', () => {
    const { world, p, bag, lc } = setup(200);
    p.x = p.prevX = bag.x - 20;
    run(world, lc, inp({ stickX: 1, pressed: Button.Attack | Button.Smash, held: Button.Attack | Button.Smash }));
    run(world, lc, inp(), 200);
    expect(lc.phase).toBe('barrier');
    expect(bag.x).toBeLessThanOrEqual(LAUNCH_EDGE);
    expect(bag.state).not.toBe('ko');
  });

  it('after the barrier drops, a smash sends it down the runway and the run scores the distance', () => {
    const { world, p, bag, lc } = setup(150);
    run(world, lc, inp(), LAUNCH_TIMER);
    expect(lc.phase).toBe('open');
    p.x = p.prevX = bag.x - 20;
    p.facing = 1;
    run(world, lc, inp({ stickX: 1, pressed: Button.Attack | Button.Smash, held: Button.Attack | Button.Smash }));
    run(world, lc, inp(), 40 * 60);
    expect(lc.over).toBe(true);
    expect(lc.distance).toBeGreaterThan(20);
    // the runway is long enough that a strong launch lands on it instead of flying off the end
    expect(lc.distance * 4 + LAUNCH_EDGE).toBeLessThan(launchStage.blast.right);
  });

  it('never sent off: the run ends at zero once the grace period is over', () => {
    const { world, lc } = setup(0);
    run(world, lc, inp(), LAUNCH_TIMER + LAUNCH_GRACE + 5);
    expect(lc.over).toBe(true);
    expect(lc.distance).toBe(0);
  });

  it('a dummy flown off the end of the runway scores the point where it went out, not the tick before', () => {
    const { world, bag, lc } = setup(0);
    run(world, lc, inp(), LAUNCH_TIMER);
    bag.x = bag.prevX = launchStage.blast.right - 60;
    bag.y = -200;
    bag.launch(20, 0, 60);
    for (let i = 0; i < 10 && bag.state !== 'ko'; i++) run(world, lc, inp());
    expect(bag.state).toBe('ko');
    expect(lc.over).toBe(true);
    expect(lc.distance).toBeGreaterThanOrEqual((launchStage.blast.right - LAUNCH_EDGE) / 4);
  });
});
