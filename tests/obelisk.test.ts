import { describe, expect, it } from 'vitest';
import { brick } from '../src/characters/brick';
import { obelisk } from '../src/characters/obelisk';
import { PILLAR_SLAM } from '../src/characters/obeliskPillars';
import { makeInput, type FighterInput } from '../src/engine/buttons';
import { Fighter } from '../src/engine/fighter';
import { World } from '../src/engine/world';
import { sandboxStage } from '../src/stages/sandbox';

const inp = (o: Partial<FighterInput> = {}): FighterInput => ({ ...makeInput(), ...o });

function rig(gap = 60) {
  const world = new World(sandboxStage);
  const o = new Fighter(0, obelisk);
  const b = new Fighter(1, brick);
  world.addFighter(o);
  world.addFighter(b);
  o.spawn(-20, -1, 1);
  b.spawn(-20 + gap, -1, -1);
  for (let i = 0; i < 125; i++) world.step([inp(), inp()]);
  o.invuln = b.invuln = 0;
  const run = (n: number, a = inp(), d = inp()): void => {
    for (let i = 0; i < n; i++) world.step([a, d]);
  };
  const pillars = () => world.deployables.filter((d) => d.active && d.def?.pillar);
  return { world, o, b, run, pillars };
}

describe('Obelisk', () => {
  it('Crystal Spire raises a pillar in front, and two is the limit', () => {
    const t = rig(140);
    t.o.startMove('neutralB', null, t.world);
    t.run(40);
    expect(t.pillars()).toHaveLength(1);
    const p = t.pillars()[0];
    expect(p.x).toBeCloseTo(t.o.x + 38, 0);
    expect(p.plat!.top).toBeLessThan(-40);
    for (let k = 0; k < 2; k++) {
      t.o.x -= 30;
      t.o.startMove('neutralB', null, t.world);
      t.run(40);
    }
    expect(t.pillars()).toHaveLength(2);
  });

  it('a pillar soaks up a rival shot aimed at Obelisk', () => {
    const t = rig(140);
    t.o.startMove('neutralB', null, t.world);
    t.run(40);
    const before = t.o.damage;
    t.world.spawnProjectile(0, 'volley', t.o.x + 120, -20, -5, 0)!.owner = 1;
    t.run(40);
    expect(t.o.damage).toBe(before);
  });

  it('Shard Volley into its own pillar shatters it into a burst of shards', () => {
    const t = rig(160);
    t.o.startMove('neutralB', null, t.world);
    t.run(40);
    t.o.startMove('sideB', null, t.world);
    t.run(30);
    expect(t.pillars()).toHaveLength(0);
  });

  it('Bedrock Stomp shatters every pillar in range and hits rivals on both sides', () => {
    const t = rig(36);
    t.o.startMove('neutralB', null, t.world);
    t.run(40);
    expect(t.pillars()).toHaveLength(1);
    const before = t.b.damage;
    t.o.startMove('downB', null, t.world);
    t.run(30);
    expect(t.pillars()).toHaveLength(0);
    expect(t.b.damage).toBeGreaterThan(before);
  });

  it('Upheaval leaves a pillar to land on and carries Obelisk well up', () => {
    const t = rig(160);
    const y0 = t.o.y;
    t.o.startMove('upB', null, t.world);
    let top = y0;
    for (let i = 0; i < 40; i++) {
      t.run(1);
      top = Math.min(top, t.o.y);
    }
    expect(y0 - top).toBeGreaterThan(50);
    expect(t.pillars()).toHaveLength(1);
  });

  it('Rock Bottom into its own pillar hits harder and breaks the pillar', () => {
    const throwDamage = (withPillar: boolean): { dmg: number; pillars: number } => {
      const t = rig(22);
      if (withPillar) {
        t.world.spawnDeployable(0, 'pillar', t.o.x - 40, 0);
        t.run(14);
      }
      t.o.startMove('grab', null, t.world);
      for (let i = 0; i < 20 && t.b.state !== 'grabbed'; i++) t.run(1);
      expect(t.b.state).toBe('grabbed');
      const before = t.b.damage;
      for (let i = 0; i < 40; i++) {
        t.run(1, inp({ stickX: -1 }));
        if (t.b.state === 'hitstun' && t.b.hitlag === 0) break;
      }
      t.run(2);
      return { dmg: t.b.damage - before, pillars: t.pillars().length };
    };
    const plain = throwDamage(false);
    const slam = throwDamage(true);
    expect(slam.dmg).toBeCloseTo(plain.dmg * PILLAR_SLAM.damage, 1);
    expect(slam.pillars).toBe(0);
  });
});
