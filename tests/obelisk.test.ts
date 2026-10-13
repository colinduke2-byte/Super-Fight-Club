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

describe('Obelisk fun pass', () => {
  it('its own smash knocks a pillar over: the shards fly the way the blow was going', () => {
    const t = rig(200);
    t.o.startMove('neutralB', null, t.world);
    t.run(40);
    const p = t.pillars()[0];
    expect(p).toBeDefined();
    t.o.x = p.x - 30; // right next to it, facing it
    t.o.facing = 1;
    t.o.startMove('fsmash', null, t.world);
    t.run(30);
    expect(t.pillars()).toHaveLength(0);
    const shards = t.world.projectiles.filter((s) => s.active && s.owner === 0);
    expect(shards.length).toBeGreaterThanOrEqual(4);
    for (const s of shards) expect(s.vx).toBeGreaterThan(3); // all forward, fast
  });

  it('a back air flings the pillar backwards', () => {
    const t = rig(200);
    t.o.startMove('neutralB', null, t.world);
    t.run(40);
    const p = t.pillars()[0];
    t.o.x = p.x + 22;
    t.o.facing = 1; // the pillar is behind
    t.o.y = p.plat!.top + 10;
    t.o.grounded = false;
    t.o.hover = true;
    t.o.setState('air');
    t.o.startMove('bair', null, t.world);
    t.run(20);
    const shards = t.world.projectiles.filter((s) => s.active && s.owner === 0);
    expect(shards.length).toBeGreaterThan(0);
    for (const s of shards) expect(s.vx).toBeLessThan(0);
  });

  it('special moves do not knock over its own pillars (Upheaval rides one)', () => {
    const t = rig(200);
    t.o.startMove('upB', null, t.world);
    t.run(12);
    expect(t.pillars()).toHaveLength(1);
  });

  it('ftilt routes into Crystal Spire on hit, which pops the rival up', () => {
    const t = rig(40);
    t.b.damage = 30;
    t.o.startMove('ftilt', null, t.world);
    let spire = false;
    for (let i = 0; i < 40; i++) {
      t.world.step([inp({ held: 4, pressed: i === 9 ? 4 : 0 }), inp()]);
      if (t.o.move?.id === 'neutralB') spire = true;
    }
    expect(spire).toBe(true);
    expect(t.pillars().length).toBe(1);
  });

  it('can wall jump (pillar parkour)', () => {
    expect(obelisk.wallJump).toBe(true);
  });
});

describe('Obelisk CPU', () => {
  it('knocks its own pillar into a rival standing beyond it', async () => {
    const { CpuController } = await import('../src/ai/cpu');
    let struck = 0;
    for (let seed = 1; seed <= 4; seed++) {
      const t = rig(120);
      t.o.startMove('neutralB', null, t.world);
      t.run(40);
      const p = t.pillars()[0];
      t.o.x = p.x - 24;
      const cpu = new CpuController(3, seed);
      const ia = inp();
      for (let i = 0; i < 120 && t.pillars().length > 0; i++) {
        Object.assign(ia, makeInput());
        cpu.update(t.o, t.world, ia);
        t.world.step([ia, inp()]);
      }
      t.run(2); // the shards fly out on the next tick
      if (t.pillars().length === 0 && t.world.projectiles.some((s) => s.active && s.owner === 0 && s.vx > 3)) struck++;
    }
    expect(struck).toBeGreaterThanOrEqual(2);
  });
});
