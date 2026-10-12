import { describe, expect, it } from 'vitest';
import { riptide } from '../src/characters/riptide';
import { brick } from '../src/characters/brick';
import { soakThrowBonus } from '../src/characters/riptideSoak';
import { Button, makeInput, type FighterInput } from '../src/engine/buttons';
import { Fighter, SOAK_LEVEL, SOAK_MAX } from '../src/engine/fighter';
import { World } from '../src/engine/world';
import { sandboxStage } from '../src/stages/sandbox';

const inp = (o: Partial<FighterInput> = {}): FighterInput => ({ ...makeInput(), ...o });

function rig(gap = 24, foe = brick) {
  const world = new World(sandboxStage);
  const r = new Fighter(0, riptide);
  const b = new Fighter(1, foe);
  world.addFighter(r);
  world.addFighter(b);
  r.spawn(0, -1, 1);
  b.spawn(gap, -1, -1);
  for (let i = 0; i < 125; i++) world.step([inp(), inp()]);
  r.invuln = b.invuln = 0;
  const run = (n: number, a = inp(), d = inp()) => {
    for (let i = 0; i < n; i++) world.step([a, d]);
  };
  return { world, r, b, run };
}

/** Grab with the standing grab, then throw forward; returns the victim's damage taken by the throw and its launch speed. */
function grabAndThrow(soakFrames: number): { dmg: number; speed: number; soakAfter: number } {
  const t = rig(22);
  t.b.status.soak = soakFrames;
  t.r.startMove('grab', null, t.world);
  for (let i = 0; i < 20 && t.b.state !== 'grabbed'; i++) t.run(1);
  expect(t.b.state).toBe('grabbed');
  const before = t.b.damage;
  let speed = 0;
  for (let i = 0; i < 40; i++) {
    t.run(1, inp({ stickX: 1 }));
    speed = Math.max(speed, Math.hypot(t.b.vx, t.b.vy));
    if (t.b.state === 'hitstun' && t.b.hitlag === 0) break;
  }
  return { dmg: t.b.damage - before, speed, soakAfter: t.b.status.soak };
}

describe('Riptide: Soak', () => {
  it('water hits soak the victim; soak stacks up to three levels and drips away', () => {
    const t = rig(28);
    t.r.startMove('ftilt', null, t.world);
    t.run(14);
    expect(t.b.status.soak).toBeGreaterThan(0);
    expect(t.b.soakLevel).toBe(1);
    t.b.applyStatus({ type: 'soak', frames: 999 }, t.world);
    expect(t.b.status.soak).toBe(SOAK_MAX);
    expect(t.b.soakLevel).toBe(3);
    const s = t.b.status.soak;
    t.run(SOAK_LEVEL);
    expect(t.b.status.soak).toBe(s - SOAK_LEVEL);
  });

  it('soaked fighters fly further from anyone\'s hits', () => {
    const launch = (soak: number): number => {
      const t = rig(110);
      t.b.status.soak = soak;
      t.b.damage = 20;
      t.b.receiveHit({ damage: 4, base: 20, scaling: 0.5, angle: 45, direction: 1, moveWeight: undefined, hitlag: 0 }, t.world);
      return Math.hypot(t.b.vx, t.b.vy);
    };
    expect(launch(SOAK_MAX)).toBeGreaterThan(launch(0) * 1.1);
  });

  it('water puts out fire, and fire boils a soak away instead of burning', () => {
    const t = rig(110);
    t.b.applyStatus({ type: 'burn', frames: 120, value: 0.05 }, t.world);
    expect(t.b.status.burn).toBe(120);
    t.b.applyStatus({ type: 'soak', frames: 120 }, t.world);
    expect(t.b.status.burn).toBe(0);
    t.b.applyStatus({ type: 'burn', frames: 30 }, t.world);
    expect(t.b.status.burn).toBe(0);
    expect(t.b.status.soak).toBeLessThan(120);
  });

  it('throws wring the soak out: more damage and a harder launch, and the soak is spent', () => {
    expect(soakThrowBonus(0)).toEqual({ damage: 1, launch: 1 });
    expect(soakThrowBonus(3).damage).toBeGreaterThan(soakThrowBonus(1).damage);
    const dry = grabAndThrow(0);
    const wet = grabAndThrow(SOAK_MAX);
    expect(wet.dmg).toBeGreaterThan(dry.dmg * 1.25);
    expect(wet.speed).toBeGreaterThan(dry.speed);
    expect(wet.soakAfter).toBe(0);
  });
});

describe('Riptide: specials', () => {
  it('Shark Lunge is a command grab that goes through shields and bites on its own', () => {
    const t = rig(70);
    const shield = inp({ held: Button.Shield });
    t.run(4, inp(), shield);
    expect(t.b.state).toBe('shield');
    t.r.startMove('sideB', null, t.world);
    let bit = false;
    for (let i = 0; i < 60; i++) {
      t.run(1, inp(), shield);
      if (t.r.move?.id === 'sideBite') bit = true;
    }
    expect(bit).toBe(true);
    expect(t.b.damage).toBeGreaterThan(10);
  });

  it('Whirlpool leaves a trap that soaks and pops up whoever walks in', () => {
    const t = rig(110);
    t.r.startMove('downB', null, t.world);
    t.run(16);
    const pool = t.world.deployables.find((d) => d.active && d.def?.look.shape === 'whirlpool');
    expect(pool).toBeDefined();
    t.run(20);
    t.b.spawn(pool!.x, -1, -1);
    t.b.invuln = 0;
    t.run(6);
    expect(t.b.status.soak).toBeGreaterThan(0);
    expect(t.b.vy).toBeLessThan(0);
  });

  it('Tidal Shot fires a soaking water orb', () => {
    const t = rig(90);
    t.r.startMove('neutralB', null, t.world);
    for (let i = 0; i < 60 && t.b.damage === 0; i++) t.run(1);
    expect(t.b.damage).toBeGreaterThan(0);
    expect(t.b.status.soak).toBeGreaterThan(0);
  });
});
