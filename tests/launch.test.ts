import { describe, expect, it } from 'vitest';
import { agni } from '../src/characters/agni';
import { brick } from '../src/characters/brick';
import { Button, makeInput, type FighterInput } from '../src/engine/buttons';
import { Fighter } from '../src/engine/fighter';
import { World } from '../src/engine/world';
import { BOARD_SIZE, LAUNCH_ATTEMPTS, LAUNCH_BETWEEN, LAUNCH_GRACE, LAUNCH_TIMER, LaunchContest, launchBoard, recordLaunchBoard, resetLaunchBoardCache } from '../src/game/launch';
import { launchStage, LAUNCH_EDGE } from '../src/stages/launch';
import { memStorage } from './tools/memStorage';

const inp = (o: Partial<FighterInput> = {}): FighterInput => ({ ...makeInput(), ...o });

function setup(dmg: number, attempts = 1) {
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
  return { world, p, bag, lc: new LaunchContest(bag, undefined, undefined, attempts) };
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

  it('a run is three attempts; the dummy and the player are put back between them and the best attempt counts', () => {
    expect(LAUNCH_ATTEMPTS).toBe(3);
    const { world, p, bag, lc } = setup(150, 3);
    lc.attachPlayer(p);
    const smash = inp({ stickX: 1, pressed: Button.Attack | Button.Smash, held: Button.Attack | Button.Smash });
    // attempt 1: a real launch
    run(world, lc, inp(), LAUNCH_TIMER);
    p.x = p.prevX = bag.x - 20;
    p.facing = 1;
    run(world, lc, smash);
    for (let i = 0; i < 40 * 60 && lc.phase !== 'between'; i++) run(world, lc, inp());
    expect(lc.phase).toBe('between');
    expect(lc.attempts).toHaveLength(1);
    const first = lc.attempts[0].distance;
    expect(first).toBeGreaterThan(20);
    expect(lc.attempts[0].damage).toBeGreaterThan(100);
    run(world, lc, inp(), LAUNCH_BETWEEN);
    // attempt 2 starts clean: barrier up, dummy home at 0%
    expect(lc.phase).toBe('barrier');
    expect(lc.attempt).toBe(1);
    expect(bag.damage).toBe(0);
    expect(bag.x).toBeLessThan(LAUNCH_EDGE);
    expect(lc.over).toBe(false);
    // attempts 2 and 3: never sent off (zero), so the first one stays the best
    for (let k = 0; k < 2; k++) for (let i = 0; i < LAUNCH_TIMER + LAUNCH_GRACE + LAUNCH_BETWEEN + 10 && !lc.over; i++) run(world, lc, inp());
    expect(lc.over).toBe(true);
    expect(lc.attempts.map((a) => a.distance)).toEqual([first, 0, 0]);
    expect(lc.bestAttempt).toBe(0);
    expect(lc.distance).toBeCloseTo(first, 0);
  });

  it('the leaderboard keeps the top five per fighter, best first', () => {
    memStorage();
    resetLaunchBoardCache();
    expect(recordLaunchBoard('brick', 0, 0)).toBe(-1);
    const places = [50, 120, 80, 200, 10, 90, 5].map((m, i) => recordLaunchBoard('brick', m, 100 + i, '', i));
    expect(places[0]).toBe(0);
    expect(places[3]).toBe(0); // 200: the new top
    expect(places[6]).toBe(-1); // 5: off the board
    const b = launchBoard('brick');
    expect(b).toHaveLength(BOARD_SIZE);
    expect(b.map((e) => e.m)).toEqual([200, 120, 90, 80, 50]);
    expect(launchBoard('vex')).toHaveLength(0);
    resetLaunchBoardCache();
    expect(launchBoard('brick').map((e) => e.m)).toEqual([200, 120, 90, 80, 50]); // kept in storage
  });
});
