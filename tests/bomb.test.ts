import { describe, expect, it } from 'vitest';
import { brick } from '../src/characters/brick';
import { Button, makeInput, type FighterInput } from '../src/engine/buttons';
import { Fighter } from '../src/engine/fighter';
import { BOMB } from '../src/engine/items';
import { World } from '../src/engine/world';
import { classicStage } from '../src/stages/classic';

const inp = (o: Partial<FighterInput> = {}): FighterInput => ({ ...makeInput(), ...o });

function arena() {
  const world = new World(classicStage);
  const fs = [new Fighter(0, brick), new Fighter(1, brick)];
  fs.forEach((f, i) => {
    world.addFighter(f);
    f.spawn(-60 + i * 120, -1, 1);
  });
  const ins = fs.map(() => inp());
  for (let i = 0; i < 130; i++) world.step(ins);
  fs.forEach((f) => (f.invuln = 0));
  return { world, fs, ins };
}

/** Drop a resting bomb item on fighter 0. */
function giveBomb(world: World, f: Fighter): void {
  const it = world.items[0];
  it.active = true;
  it.kind = 'bomb';
  it.thrown = false;
  it.resting = true;
  it.age = 0;
  it.x = f.x;
  it.y = f.y - 10;
}

describe('Shock Bomb item', () => {
  it('is picked up on touch and carried, not used instantly', () => {
    const { world, fs, ins } = arena();
    giveBomb(world, fs[0]);
    world.step(ins);
    expect(fs[0].heldBomb).toBe(true);
    expect(world.items[0].active).toBe(false);
    expect(fs[0].damage).toBe(0);
  });

  it('Attack throws it forward; it bursts on the opponent and credits the thrower', () => {
    const { world, fs, ins } = arena();
    giveBomb(world, fs[0]);
    world.step(ins);
    const events: string[] = [];
    world.listener = (t) => events.push(t);
    ins[0] = inp({ pressed: Button.Attack, held: Button.Attack });
    world.step(ins);
    ins[0] = inp();
    expect(fs[0].heldBomb).toBe(false);
    expect(events).toContain('itemThrow');
    for (let i = 0; i < 80 && !events.includes('itemBoom'); i++) world.step(ins);
    expect(events).toContain('itemBoom');
    expect(fs[1].damage).toBeGreaterThan(BOMB.damage * 0.9);
    expect(fs[1].lastHitBy).toBe(0);
    expect(fs[0].damage).toBe(0);
  });

  it('dropped at your own feet it does not hurt you during the grace period, but a lit fuse eventually bursts', () => {
    const { world, fs, ins } = arena();
    fs[1].x = 400; // far away
    giveBomb(world, fs[0]);
    world.step(ins);
    // straight up: comes back down on the thrower after the grace period
    ins[0] = inp({ pressed: Button.Attack, held: Button.Attack, stickY: -1 });
    world.step(ins);
    ins[0] = inp();
    const events: string[] = [];
    world.listener = (t) => events.push(t);
    for (let i = 0; i < BOMB.fuse + 5 && !events.includes('itemBoom'); i++) world.step(ins);
    expect(events).toContain('itemBoom');
    expect(fs[0].damage).toBeGreaterThan(0); // what goes up...
  });

  it('is deterministic', () => {
    const run = (): number => {
      const { world, fs, ins } = arena();
      giveBomb(world, fs[0]);
      for (let i = 0; i < 120; i++) {
        ins[0] = i === 5 ? inp({ pressed: Button.Attack, held: Button.Attack }) : inp({ stickX: i % 40 < 20 ? 1 : 0 });
        world.step(ins);
      }
      return world.hash();
    };
    expect(run()).toBe(run());
  });
});
