import { describe, expect, it } from 'vitest';
import { agni } from '../src/characters/agni';
import { Button, makeInput, type FighterInput } from '../src/engine/buttons';
import { Fighter } from '../src/engine/fighter';
import { Match } from '../src/engine/match';
import { World } from '../src/engine/world';
import { formatTicks } from '../src/game/records';
import { targetsStage } from '../src/stages/targets';

const inp = (o: Partial<FighterInput> = {}): FighterInput => ({ ...makeInput(), ...o });

function course() {
  const world = new World(targetsStage);
  const f = new Fighter(0, agni);
  world.addFighter(f);
  f.spawn(0, -4, 1);
  const match = new Match(world, { mode: 'stock', stocks: 1, timeLimitSec: 0, respawnDelay: 70 });
  world.listener = (t, ff, _x, _y, _m, extra) => {
    if (t === 'ko') match.onKo(ff, extra);
  };
  for (let i = 0; i < 40; i++) world.step([inp()]);
  return { world, f, match };
}

describe('Target Smash', () => {
  it('the course has ten targets inside the blast zones, and a lone fighter does not end the match by itself', () => {
    const { world, match } = course();
    expect(world.targets.length).toBe(10);
    for (const t of world.targets) {
      expect(t.x).toBeGreaterThan(targetsStage.blast.left);
      expect(t.x).toBeLessThan(targetsStage.blast.right);
    }
    match.step();
    expect(match.over).toBe(false);
  });

  it('a live hitbox breaks a target (and emits the count left)', () => {
    const { world, f } = course();
    const t = world.targets[0];
    const left: number[] = [];
    world.listener = (type, _f, _x, _y, mag) => {
      if (type === 'target') left.push(mag);
    };
    // stand just behind the target and jab it
    f.x = f.prevX = t.x - 14;
    f.facing = 1;
    world.step([inp({ pressed: Button.Attack, held: Button.Attack })]);
    for (let i = 0; i < 20; i++) world.step([inp()]);
    expect(t.alive).toBe(false);
    expect(left).toEqual([9]);
  });

  it('falling off ends the run', () => {
    const { world, f, match } = course();
    f.y = f.prevY = targetsStage.blast.bottom + 50;
    f.grounded = false;
    f.groundPlat = null;
    f.setState("air");
    world.step([inp()]);
    match.step();
    expect(match.over).toBe(true);
  });

  it('formats times as m:ss.cc', () => {
    expect(formatTicks(60 * 75 + 30)).toBe('1:15.50');
  });
});
