import { describe, expect, it } from 'vitest';
import { brick } from '../src/characters/brick';
import { makeInput } from '../src/engine/buttons';
import { Fighter } from '../src/engine/fighter';
import type { DeployableDef, ProjectileDef } from '../src/engine/moves';
import { shatterPillars } from '../src/engine/pillars';
import type { CharacterData } from '../src/engine/types';
import { World } from '../src/engine/world';
import { classicStage } from '../src/stages/classic';

const PILLAR: DeployableDef = {
  w: 20,
  h: 44,
  health: 30,
  life: 300,
  limit: 2,
  replaceOldest: true,
  look: { shape: 'pillar', color: '#a868e0' },
  pillar: { riseFrames: 10, sinkFrames: 12, riseHit: { damage: 6, base: 30, scaling: 0.5, angle: 80 }, shards: { projectile: 'shard', count: 5, speed: 5 } },
};
const SHARD: ProjectileDef = { w: 6, h: 6, life: 40, gravity: 0.2, hit: { x: 0, y: 0, w: 6, h: 6, damage: 4, angle: 45, base: 20, scaling: 0.4 }, look: { shape: 'bolt', color: '#c898f6' } };
const builder: CharacterData = { ...brick, id: 'builder', deployables: { ...(brick.deployables ?? {}), pillar: PILLAR }, projectiles: { ...(brick.projectiles ?? {}), shard: SHARD } };

function rig(): { world: World; me: Fighter; foe: Fighter; step: (n: number) => void } {
  const world = new World(classicStage);
  const me = new Fighter(0, builder);
  const foe = new Fighter(1, builder);
  world.addFighter(me);
  world.addFighter(foe);
  me.spawn(-120, -1, 1);
  foe.spawn(120, -1, -1);
  const ins = [makeInput(), makeInput()];
  const step = (n: number): void => {
    for (let i = 0; i < n; i++) world.step(ins);
  };
  step(130); // let the spawn invincibility run out and everyone settle
  return { world, me, foe, step };
}

describe('crystal pillars', () => {
  it('rise out of the ground into a solid platform, and refuse to grow over a pit', () => {
    const { world, step } = rig();
    const n = world.platforms.length;
    const d = world.spawnDeployable(0, 'pillar', 0, -10)!;
    expect(d.y).toBe(0); // snapped to the floor
    step(1);
    expect(world.platforms.length).toBe(n + 1);
    step(12);
    expect(d.plat!.top).toBeCloseTo(-44);
    expect(world.spawnDeployable(0, 'pillar', 400, -10)).toBeNull();
  });

  it('lift whoever stands where they come up, and hit a rival they rise into once', () => {
    const { world, foe, step } = rig();
    foe.spawn(0, -1, 1);
    step(130);
    const before = foe.damage;
    const d = world.spawnDeployable(0, 'pillar', 0, 0)!;
    step(14);
    expect(foe.damage).toBeCloseTo(before + 6);
    // launched off, or carried up: either way the rival is never left inside the pillar
    const p = d.plat!;
    const inside = foe.x + foe.hw > p.x && foe.x - foe.hw < p.right && foe.y > p.top + 1 && foe.y - foe.h < p.bottom;
    expect(inside).toBe(false);
  });

  it('carry the owner up and block a rival walking into them', () => {
    const { world, me, foe, step } = rig();
    const d = world.spawnDeployable(0, 'pillar', me.x, 0)!;
    step(14);
    expect(me.grounded).toBe(true);
    expect(me.y).toBeCloseTo(d.plat!.top);
    // a rival running at the pillar stops at its side
    const ins = [makeInput(), makeInput()];
    ins[1].stickX = -1;
    for (let t = 0; t < 120; t++) world.step(ins);
    expect(foe.x - foe.hw).toBeGreaterThanOrEqual(d.plat!.right - 0.5);
  });

  it('stop projectiles: a rival shot chips them, the owner shatters them into shards', () => {
    const { world, step } = rig();
    const d = world.spawnDeployable(0, 'pillar', 0, 0)!;
    step(14);
    world.spawnProjectile(1, 'shard', 30, -20, -6, 0);
    world.projectiles.find((p) => p.active)!.def = SHARD;
    step(8);
    expect(d.active).toBe(true);
    expect(d.hp).toBeLessThan(30);
    world.spawnProjectile(0, 'shard', -30, -20, 6, 0);
    step(8);
    expect(d.active).toBe(false);
    step(1);
    expect(world.platforms.includes(d.plat as never)).toBe(false);
    expect(world.projectiles.filter((p) => p.active && p.owner === 0).length).toBeGreaterThanOrEqual(4);
  });

  it('crumble at the end of their life and drop whoever stands on them', () => {
    const { world, me, step } = rig();
    const d = world.spawnDeployable(0, 'pillar', me.x, 0)!;
    step(14);
    expect(me.groundPlat).toBe(d.plat);
    step(300);
    expect(d.active).toBe(false);
    expect(me.groundPlat?.dynamic ?? false).toBe(false);
    step(60);
    expect(me.grounded).toBe(true);
    expect(me.y).toBeCloseTo(0);
  });

  it('two at a time: a third replaces the oldest; a stomp shatters the ones in range', () => {
    const { world, step } = rig();
    world.spawnDeployable(0, 'pillar', -60, 0);
    const b = world.spawnDeployable(0, 'pillar', 0, 0)!;
    const c = world.spawnDeployable(0, 'pillar', 60, 0)!; // reuses the oldest's slot
    step(14);
    const live = world.deployables.filter((d) => d.active && d.def?.pillar).map((d) => d.x).sort((p, q) => p - q);
    expect(live).toEqual([0, 60]);
    expect(world.platforms.filter((p) => p.dynamic)).toHaveLength(2);
    expect(shatterPillars(world, 0, 40, 30)).toBe(1);
    step(2);
    expect(c.active).toBe(false);
    expect(b.active).toBe(true);
  });

  it('are deterministic', () => {
    const run = (): number => {
      const { world, step } = rig();
      world.spawnDeployable(0, 'pillar', 0, 0);
      step(20);
      world.spawnProjectile(0, 'shard', -30, -20, 6, 0);
      step(60);
      return world.hash();
    };
    expect(run()).toBe(run());
  });
});
