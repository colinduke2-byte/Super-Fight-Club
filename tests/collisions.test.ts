import { describe, expect, it } from 'vitest';
import { brick } from '../src/characters/brick';
import { vex } from '../src/characters/vex';
import { makeInput } from '../src/engine/buttons';
import { Fighter } from '../src/engine/fighter';
import { World, type WorldEventType } from '../src/engine/world';
import { classicStage } from '../src/stages/classic';

function rig(flierData = brick, targetData = vex) {
  const world = new World(classicStage);
  const launcher = new Fighter(0, brick);
  const flier = new Fighter(1, flierData);
  const target = new Fighter(2, targetData);
  [launcher, flier, target].forEach((f) => world.addFighter(f));
  launcher.spawn(-150, -1, 1);
  flier.spawn(-90, -1, 1);
  target.spawn(10, -1, -1);
  const ins = [makeInput(), makeInput(), makeInput()];
  const events: WorldEventType[] = [];
  world.listener = (t) => events.push(t);
  for (let i = 0; i < 125; i++) world.step(ins);
  [launcher, flier, target].forEach((f) => (f.invuln = 0));
  const run = (n: number): void => {
    for (let i = 0; i < n; i++) world.step(ins);
  };
  /** The launcher sends the flier flying right, low and hard. */
  const launch = (base = 120): void => {
    flier.damage = 60;
    flier.receiveHit({ damage: 10, base, scaling: 0.6, angle: 12, direction: 1, hitlag: 0, attackerId: 0 }, world);
  };
  return { world, launcher, flier, target, run, launch, events };
}

describe('human projectiles', () => {
  it('a hard-launched fighter crashes into the one in its path: damage, a launch along the path, credit to the launcher', () => {
    const t = rig();
    t.launch();
    const speed0 = Math.hypot(t.flier.vx, t.flier.vy);
    let hit = false;
    for (let i = 0; i < 40 && !hit; i++) {
      t.run(1);
      hit = t.events.includes('collide');
    }
    expect(hit).toBe(true);
    expect(t.target.damage).toBeGreaterThan(2);
    expect(t.target.state).toBe('hitstun');
    expect(t.target.lastHitBy).toBe(0);
    t.run(8); // let hit-stop pass
    expect(t.target.vx).toBeGreaterThan(0); // sent the same way the flier was going
    expect(Math.hypot(t.flier.vx, t.flier.vy)).toBeLessThan(speed0);
  });

  it('only once per pair per launch, and never back and forth', () => {
    const t = rig();
    t.launch();
    t.run(60);
    expect(t.events.filter((e) => e === 'collide').length).toBe(1);
  });

  it('a slow push is not a crash, and teammates of the launcher are spared', () => {
    const slow = rig();
    slow.launch(20);
    slow.run(40);
    expect(slow.events.includes('collide')).toBe(false);
    const team = rig();
    team.launcher.team = 0;
    team.target.team = 0;
    team.flier.team = 1;
    team.launch();
    team.run(40);
    expect(team.events.includes('collide')).toBe(false);
  });

  it('a heavy body ploughs through a light one harder than the reverse', () => {
    // same flight speed, swapped bodies
    const fly = (t: ReturnType<typeof rig>): void => {
      t.flier.lastHitBy = 0;
      t.flier.x = -40;
      t.flier.y = -12;
      t.flier.grounded = false;
      t.flier.launch(9, 0, 40);
      t.run(40);
    };
    const heavy = rig(brick, vex);
    fly(heavy);
    const light = rig(vex, brick);
    fly(light);
    expect(heavy.target.damage).toBeGreaterThan(light.target.damage);
  });

  it('is deterministic', () => {
    const go = (): number => {
      const t = rig();
      t.launch();
      t.run(90);
      return t.world.hash();
    };
    expect(go()).toBe(go());
  });
});
