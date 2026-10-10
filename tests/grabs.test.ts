import { describe, expect, it } from 'vitest';
import { brick } from '../src/characters/brick';
import { makeInput } from '../src/engine/buttons';
import { Fighter } from '../src/engine/fighter';
import { World } from '../src/engine/world';
import { classicStage } from '../src/stages/classic';

describe('grabs', () => {
  it('a victim is released when its grabber is KO\'d (no permanent grab)', () => {
    const world = new World(classicStage);
    const a = new Fighter(0, brick);
    const b = new Fighter(1, brick);
    world.addFighter(a);
    world.addFighter(b);
    a.spawn(-12, -1, 1);
    b.spawn(12, -1, -1);
    const ins = [makeInput(), makeInput()];
    for (let i = 0; i < 130; i++) world.step(ins);
    b.invuln = 0;
    a.startMove('grab', null, world);
    let held = false;
    for (let i = 0; i < 40 && !held; i++) {
      world.step(ins);
      held = b.state === 'grabbed';
    }
    expect(held).toBe(true);
    // the grabber falls off the world while holding
    a.state = 'ko';
    world.step(ins);
    world.step(ins);
    expect(b.state).not.toBe('grabbed');
    expect(b.grabbedBy).toBe(-1);
    expect(a.grabTarget).toBe(-1);
  });

  it('two fighters grabbing each other on the same frame end up with one holder and one victim, then both are free', () => {
    const world = new World(classicStage);
    const a = new Fighter(0, brick);
    const b = new Fighter(1, brick);
    world.addFighter(a);
    world.addFighter(b);
    a.spawn(-12, -1, 1);
    b.spawn(12, -1, -1);
    const ins = [makeInput(), makeInput()];
    for (let i = 0; i < 130; i++) world.step(ins);
    a.invuln = b.invuln = 0;
    a.startMove('grab', null, world);
    b.startMove('grab', null, world);
    const seen = new Set<string>();
    for (let i = 0; i < 400; i++) {
      world.step(ins);
      seen.add(`${a.state}|${b.state}`);
      // never both 'grabbed' (that is the stuck state)
      expect(a.state === 'grabbed' && b.state === 'grabbed').toBe(false);
    }
    expect(a.state).not.toBe('grabbed');
    expect(b.state).not.toBe('grabbed');
    expect(a.grabbedBy).toBe(-1);
    expect(b.grabbedBy).toBe(-1);
  });
});
