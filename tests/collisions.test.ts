import { describe, expect, it } from 'vitest';
import { deliverHit } from '../src/engine/combat';
import { brick } from '../src/characters/brick';
import { vex } from '../src/characters/vex';
import { Button, makeInput } from '../src/engine/buttons';
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

describe('impact splats', () => {
  function spike(tech: boolean) {
    const world = new World(classicStage);
    const a = new Fighter(0, brick);
    const v = new Fighter(1, vex);
    world.addFighter(a);
    world.addFighter(v);
    a.spawn(-150, -1, 1);
    v.spawn(0, -1, 1);
    const ins = [makeInput(), makeInput()];
    const events: { t: WorldEventType; extra: number }[] = [];
    world.listener = (t, _f, _x, _y, _m, extra) => events.push({ t, extra });
    for (let i = 0; i < 125; i++) world.step(ins);
    v.invuln = 0;
    v.y = -70;
    v.grounded = false;
    v.damage = 50;
    v.receiveHit({ damage: 8, base: 110, scaling: 0.5, angle: 270, direction: 1, hitlag: 0, attackerId: 0 }, world);
    const before = v.damage;
    for (let i = 0; i < 40; i++) {
      ins[1].pressed = tech && i > 2 && i % 25 === 3 ? Button.Shield : 0;
      world.step(ins);
    }
    return { events, before, v, world };
  }

  it('an untech\'d spike into the floor splats: extra damage, credited to the attacker', () => {
    const r = spike(false);
    const s = r.events.find((e) => e.t === 'splat');
    expect(s).toBeDefined();
    expect(s!.extra).toBeGreaterThan(0);
    expect(r.v.damage).toBeGreaterThan(r.before);
    expect(r.world.damageDealt[0]).toBeGreaterThan(8);
  });

  it('teching the slam avoids the splat', () => {
    const r = spike(true);
    expect(r.events.some((e) => e.t === 'tech')).toBe(true);
    expect(r.events.some((e) => e.t === 'splat')).toBe(false);
  });
});

describe('momentum hits', () => {
  function hitWhileMoving(atkVx: number): number {
    const world = new World(classicStage);
    const a = new Fighter(0, brick);
    const v = new Fighter(1, vex);
    world.addFighter(a);
    world.addFighter(v);
    a.spawn(-20, -1, 1);
    v.spawn(20, -1, -1);
    const ins = [makeInput(), makeInput()];
    for (let i = 0; i < 125; i++) world.step(ins);
    v.invuln = 0;
    v.damage = 40;
    a.vx = atkVx;
    const hb = { x: 0, y: 0, w: 10, h: 10, damage: 8, base: 30, scaling: 0.5, angle: 40 } as never;
    deliverHit(world, { atk: a, ownerId: 0, def: v, hb, damage: 8, facing: 1, originX: a.x, kbMult: 1 });
    return v.vx;
  }

  it('running into a hit launches further than standing; backing away adds nothing', () => {
    const still = hitWhileMoving(0);
    const run = hitWhileMoving(3);
    const back = hitWhileMoving(-3);
    expect(run).toBeGreaterThan(still + 0.5);
    expect(back).toBeCloseTo(still, 5);
  });
});

describe('launch prediction', () => {
  it('matches the real flight of an undisturbed launch and calls KOs', async () => {
    const { predictLaunch } = await import('../src/engine/physics');
    const t = rig();
    t.target.spawn(400, -1, 1); // out of the way
    t.flier.damage = 30;
    t.flier.receiveHit({ damage: 5, base: 40, scaling: 0.3, angle: 70, direction: 1, hitlag: 0, attackerId: 0 }, t.world);
    const path: number[] = [];
    const end = predictLaunch(t.flier, t.world, path, 240, 2);
    expect(end).toBe('land');
    t.run(20);
    // after 20 frames the real fighter sits on the predicted point for frame 20 (index 10), give or take DI-free drift
    expect(Math.abs(t.flier.x - path[20])).toBeLessThan(3);
    expect(Math.abs(t.flier.y - t.flier.h / 2 - path[21])).toBeLessThan(3);

    t.flier.damage = 250;
    t.flier.receiveHit({ damage: 5, base: 120, scaling: 1.2, angle: 50, direction: 1, hitlag: 0, attackerId: 0 }, t.world);
    expect(predictLaunch(t.flier, t.world, path)).toBe('ko');
  });
});
