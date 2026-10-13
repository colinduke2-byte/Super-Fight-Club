import { describe, expect, it } from 'vitest';
import { agni } from '../src/characters/agni';
import { brick } from '../src/characters/brick';
import { halcyon } from '../src/characters/halcyon';
import { riptide } from '../src/characters/riptide';
import { Button, makeInput, type FighterInput } from '../src/engine/buttons';
import { Fighter } from '../src/engine/fighter';
import type { CharacterData } from '../src/engine/types';
import { World } from '../src/engine/world';
import { sandboxStage } from '../src/stages/sandbox';

const inp = (o: Partial<FighterInput> = {}): FighterInput => ({ ...makeInput(), ...o });

function rig(data: CharacterData, gap = 40) {
  const world = new World(sandboxStage);
  const a = new Fighter(0, data);
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

describe('Agni: Shoryuken', () => {
  it('Rising Flare hits hardest on its first frames, and starts intangible', () => {
    for (let l = 0; l < 4; l++) {
      const m = agni.moves[`upB_${l}`];
      expect(m.hitboxes[0].window).toEqual([1, 2]);
      expect(m.hitboxes[0].damage).toBeGreaterThan(m.hitboxes[1].damage * 1.4);
      expect(m.invuln![0]).toBe(1);
    }
  });

  it('a landed down tilt cancels into Rising Flare', () => {
    const r = rig(agni, 34);
    r.b.damage = 40;
    r.a.startMove('dtilt', null, r.world);
    let flare = false;
    for (let i = 0; i < 30 && !flare; i++) {
      r.tick(inp({ held: Button.Special, pressed: i === 8 ? Button.Special : 0, stickY: -1 }));
      if (r.a.move?.id.startsWith('upB_')) flare = true;
    }
    expect(flare).toBe(true);
  });
});

describe('Halcyon: Talon Dive and aimed Javelin', () => {
  it('Attack while gliding starts the diving glide attack', () => {
    const r = rig(halcyon, 200);
    r.a.spawn(-60, -120, 1);
    r.a.grounded = false;
    r.a.setState('air');
    r.a.jumpsLeft = 0;
    for (let i = 0; i < 20; i++) r.tick(inp({ held: Button.Jump }));
    expect(r.a.gliding).toBe(true);
    r.tick(inp({ held: Button.Jump | Button.Attack, pressed: Button.Attack }));
    expect(r.a.move?.id).toBe('glideAttack');
  });

  it('holding up tilts the Javelin upward', () => {
    const shoot = (stickY: number): number => {
      const r = rig(halcyon, 160);
      r.b.spawn(-200, -1, 1);
      r.a.startMove('neutralB_0', null, r.world);
      r.run(15, inp({ stickY }));
      const p = r.world.projectiles.find((x) => x.active && x.owner === 0)!;
      return p.vy;
    };
    expect(shoot(-1)).toBeLessThan(shoot(0) - 1.5);
    expect(shoot(1)).toBeGreaterThan(shoot(0) + 1.5);
  });
});

describe('Riptide: Whirlpool pull and Shark Lunge confirms', () => {
  it('the whirlpool drags a rival standing near it', () => {
    const r = rig(riptide, 200);
    const d = r.world.spawnDeployable(0, 'whirlpool', 0, 0)!;
    r.b.x = 60;
    r.run(30);
    expect(d.active).toBe(true);
    expect(r.b.x).toBeLessThan(50);
  });

  it('jab, tilts and dash attack confirm into Shark Lunge', () => {
    for (const id of ['jab1', 'ftilt', 'dtilt', 'dashAttack']) expect(riptide.moves[id].cancels!.some((c) => c.into === 'sideB')).toBe(true);
  });
});
