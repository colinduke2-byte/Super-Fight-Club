import { describe, expect, it } from 'vitest';
import { brick } from '../src/characters/brick';
import { rime, SKATE_SPEED } from '../src/characters/rime';
import { Button, makeInput, type FighterInput } from '../src/engine/buttons';
import { deliverHit } from '../src/engine/combat';
import { CHILL_MAX, Fighter } from '../src/engine/fighter';
import { World } from '../src/engine/world';
import { sandboxStage } from '../src/stages/sandbox';

const inp = (o: Partial<FighterInput> = {}): FighterInput => ({ ...makeInput(), ...o });

function rig(gap = 40) {
  const world = new World(sandboxStage);
  const a = new Fighter(0, rime);
  const b = new Fighter(1, brick);
  world.addFighter(a);
  world.addFighter(b);
  a.spawn(-gap / 2, -1, 1);
  b.spawn(gap / 2, -1, -1);
  for (let i = 0; i < 125; i++) world.step([inp(), inp()]);
  a.invuln = b.invuln = 0;
  const run = (n: number, ia = inp(), ib = inp()): void => {
    for (let i = 0; i < n; i++) world.step([ia, ib]);
  };
  return { world, a, b, run, tick: (ia = inp(), ib = inp()) => world.step([ia, ib]) };
}

describe('Rime', () => {
  it('is the lightest, fastest fighter with two double jumps and a wall jump', () => {
    expect(rime.stats.weight).toBeLessThan(85);
    expect(rime.stats.runSpeed).toBeGreaterThanOrEqual(3.2);
    expect(rime.stats.doubleJumps).toBe(2);
    expect(rime.wallJump).toBe(true);
    expect(rime.moves.jab1.startup).toBe(3);
    expect(rime.moves.nair.startup).toBe(5);
  });

  it('Frostbite: hits stack chill; a full set freezes the rival solid', () => {
    const r = rig(26);
    const hb = rime.moves.ftilt.hitboxes[0];
    for (let i = 0; i < CHILL_MAX - 1; i++) {
      r.b.invuln = 0;
      r.b.setState('idle');
      deliverHit(r.world, { atk: r.a, ownerId: 0, def: r.b, hb, damage: 1, facing: 1, originX: r.a.x, kbMult: 1 });
    }
    expect(r.b.status.chill).toBe(CHILL_MAX - 1);
    // a light hit Brick's armor absorbs keeps the stack topped up but cannot freeze him
    r.b.invuln = 0;
    deliverHit(r.world, { atk: r.a, ownerId: 0, def: r.b, hb, damage: 1, facing: 1, originX: r.a.x, kbMult: 1 });
    expect(r.b.status.chill).toBe(CHILL_MAX - 1);
    expect(r.b.state).not.toBe('frozen');
    // a clean hit through the armor completes the set
    r.b.invuln = 0;
    deliverHit(r.world, { atk: r.a, ownerId: 0, def: r.b, hb, damage: 14, facing: 1, originX: r.a.x, kbMult: 1 });
    expect(r.b.status.chill).toBe(0);
    expect(r.b.state).toBe('frozen');
  });

  it('chill melts away if Rime stops hitting', () => {
    const r = rig(26);
    r.b.applyStatus({ type: 'chill', frames: 30, value: 2 }, r.world);
    expect(r.b.status.chill).toBe(2);
    r.run(40);
    expect(r.b.status.chill).toBe(0);
  });

  it('Substitution absorbs a melee hit, reappears behind the attacker and strikes', () => {
    const r = rig(34);
    r.b.facing = -1;
    r.a.startMove('downB', null, r.world);
    r.run(6);
    const hb = brick.moves.ftilt.hitboxes[0];
    deliverHit(r.world, { atk: r.b, ownerId: 1, def: r.a, hb, damage: 8, facing: -1, originX: r.b.x, kbMult: 1 });
    expect(r.a.damage).toBe(0);
    expect(r.a.x).toBeGreaterThan(r.b.x); // behind Brick (who faces left)
    expect(r.a.move?.id).toBe('counterStrike');
    r.run(20);
    expect(r.b.damage).toBeGreaterThan(8);
  });

  it('Frost Step leaves an ice patch: rivals slide on it, Rime skates faster', () => {
    const r = rig(160);
    r.a.startMove('sideB', null, r.world);
    r.run(30);
    const patch = r.world.deployables.find((d) => d.active && d.def?.slick);
    expect(patch).toBeDefined();
    r.b.x = patch!.x;
    r.run(2);
    expect(r.b.onIce).toBe(true);
    r.a.x = patch!.x;
    r.run(2);
    expect(r.a.onIce).toBe(false); // its own ice
    expect(r.a.speedBonus).toBe(SKATE_SPEED);
  });

  it('Ice Kunai: a tap throws one, a held charge throws three', () => {
    const count = (hold: number): number => {
      const r = rig(300);
      r.b.spawn(-200, -1, 1);
      r.a.startMove('neutralB', null, r.world);
      for (let i = 0; i < 30; i++) r.tick(inp({ held: i < hold ? Button.Special : 0 }));
      return r.world.projectiles.filter((p) => p.active && p.owner === 0).length;
    };
    expect(count(0)).toBe(1);
    expect(count(25)).toBe(3);
  });
});
