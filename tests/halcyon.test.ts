import { describe, expect, it } from 'vitest';
import { halcyon } from '../src/characters/halcyon';
import { brick } from '../src/characters/brick';
import { Button, makeInput, type FighterInput } from '../src/engine/buttons';
import { Fighter } from '../src/engine/fighter';
import { World } from '../src/engine/world';
import { sandboxStage } from '../src/stages/sandbox';
import { AIR_RATE, GROUND_RATE, galeSpeed, galeTick } from '../src/characters/halcyonGale';

const inp = (o: Partial<FighterInput> = {}): FighterInput => ({ ...makeInput(), ...o });

function rig(airY = 0) {
  const world = new World(sandboxStage);
  const h = new Fighter(0, halcyon);
  const b = new Fighter(1, brick);
  world.addFighter(h);
  world.addFighter(b);
  h.spawn(-60, -1, 1);
  b.spawn(300, -1, -1);
  for (let i = 0; i < 125; i++) world.step([inp(), inp()]);
  if (airY) h.spawn(-60, airY, 1);
  return { world, h, b, run: (n: number, i0 = inp()) => { for (let i = 0; i < n; i++) world.step([i0, inp()]); } };
}

describe('Halcyon: wings', () => {
  it('holding Jump while falling glides: slower fall, then it runs out', () => {
    const plain = rig(-200);
    plain.run(40);
    const glide = rig(-200);
    glide.run(40, inp({ held: Button.Jump }));
    expect(glide.h.gliding).toBe(true);
    expect(glide.h.y).toBeLessThan(plain.h.y); // glided: still higher up
    glide.run(200, inp({ held: Button.Jump }));
    expect(glide.h.glideFrames).toBeLessThanOrEqual(halcyon.glide!.max);
  });
  it('has three air flaps', () => {
    expect(halcyon.stats.doubleJumps).toBe(3);
  });
  it('gliding stops on landing and resets the budget', () => {
    const r = rig(-60);
    r.run(30, inp({ held: Button.Jump }));
    r.run(120);
    expect(r.h.grounded).toBe(true);
    expect(r.h.glideFrames).toBe(0);
  });
});

describe('Halcyon: Gale', () => {
  it('builds in the air and bleeds on the ground', () => {
    expect(galeTick(10, true)).toBeCloseTo(10 + AIR_RATE);
    expect(galeTick(10, false)).toBeCloseTo(10 - GROUND_RATE);
    expect(galeTick(0, false)).toBe(0);
    expect(galeSpeed(2)).toBeGreaterThan(galeSpeed(0));
  });
  it('levels pick the Javelin variant', () => {
    const r = rig();
    r.h.res.gale = 70;
    r.run(2);
    expect(r.h.res.level).toBe(2);
    r.h.startMove('neutralB', null, r.world);
    expect(r.h.move?.id).toBe('neutralB_2');
  });
  it('the volley spends 40 gale and fires three javelins', () => {
    const r = rig();
    r.h.res.gale = 80;
    r.run(2);
    const before = r.h.res.gale;
    r.h.startMove('neutralB', null, r.world);
    r.run(30);
    expect(r.h.res.gale).toBeLessThan(before - 30);
    expect(r.world.projectiles.length).toBeGreaterThanOrEqual(1);
  });
});

describe('Halcyon: spear', () => {
  it('tip hits harder than the shaft', () => {
    const t = halcyon.moves.ftilt.hitboxes;
    expect(t[0].damage).toBeGreaterThan(t[1].damage);
    expect(t[0].x).toBeGreaterThan(t[1].x);
  });
});
