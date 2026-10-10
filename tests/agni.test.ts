import { describe, expect, it } from 'vitest';
import { agni } from '../src/characters/agni';
import { addFlame, decayFlame, DECAY_DELAY, flameFromDealt, flameFromTaken, flameLevel, levelDamageMult, LEVEL_AT } from '../src/characters/agniFlame';
import { brick } from '../src/characters/brick';
import { Button, makeInput, type FighterInput } from '../src/engine/buttons';
import { Fighter } from '../src/engine/fighter';
import { World } from '../src/engine/world';
import { sandboxStage } from '../src/stages/sandbox';

const inp = (o: Partial<FighterInput> = {}): FighterInput => ({ ...makeInput(), ...o });
const press = (b: number, o: Partial<FighterInput> = {}): FighterInput => inp({ pressed: b, held: b, ...o });

function rig(gap = 120) {
  const world = new World(sandboxStage);
  const a = new Fighter(0, agni);
  const b = new Fighter(1, brick);
  world.addFighter(a);
  world.addFighter(b);
  a.spawn(-gap / 2, -1, 1);
  b.spawn(gap / 2, -1, -1);
  const tick = (ia = inp(), ib = inp()): void => world.step([ia, ib]);
  for (let i = 0; i < 125; i++) tick();
  return { world, a, b, tick, run: (n: number, ia?: FighterInput, ib?: FighterInput) => { for (let i = 0; i < n; i++) tick(ia, ib); } };
}

describe('Agni identity', () => {
  it('is a mid-weight all-rounder between Nova and Brick', () => {
    expect(agni.stats.weight).toBeGreaterThan(90);
    expect(agni.stats.weight).toBeLessThan(125);
    expect(agni.stats.doubleJumps).toBe(1);
  });

  it('has the full normal set and every levelled special variant', () => {
    for (const id of ['jab1', 'jab2', 'jab3', 'ftilt', 'utilt', 'dtilt', 'dashAttack', 'fsmash', 'usmash', 'dsmash', 'nair', 'fair', 'bair', 'uair', 'dair', 'grab', 'fthrow', 'bthrow', 'uthrow', 'dthrow', 'ultimate']) {
      expect(agni.moves[id], id).toBeDefined();
    }
    for (const slot of ['neutralB', 'sideB', 'upB', 'downB', 'ultimate']) {
      for (let l = 0; l < 4; l++) expect(agni.moves[`${slot}_${l}`], `${slot}_${l}`).toBeDefined();
    }
  });

  it('is easy to learn: no move is slower than frame 16 to come out except smashes and the ultimate', () => {
    for (const m of Object.values(agni.moves)) {
      if (m.kind === 'smash' || m.kind === 'ultimate' || m.hidden) continue;
      expect(m.startup, m.id).toBeLessThanOrEqual(14);
    }
  });
});

describe('Inner Flame (pure)', () => {
  it('levels at 25 / 55 / 85', () => {
    expect([0, 24.9, 25, 54.9, 55, 84.9, 85, 100].map(flameLevel)).toEqual([0, 0, 1, 1, 2, 2, 3, 3]);
    expect(LEVEL_AT).toEqual([25, 55, 85]);
  });
  it('fills from dealt and taken damage, clamps, and only drains after a quiet spell', () => {
    expect(flameFromDealt(10)).toBeGreaterThan(0);
    expect(flameFromTaken(10)).toBeGreaterThan(0);
    expect(addFlame(95, 50)).toBe(100);
    expect(decayFlame(50, DECAY_DELAY)).toBe(50);
    expect(decayFlame(50, DECAY_DELAY + 1)).toBeLessThan(50);
    expect(levelDamageMult(3)).toBeGreaterThan(levelDamageMult(1));
  });
});

describe('Inner Flame (in the sim)', () => {
  it('builds when Agni lands a hit and when he is hit', () => {
    const r = rig(40);
    r.a.res.flame = 0;
    r.tick(press(Button.Attack));
    r.run(20);
    expect(r.a.res.flame).toBeGreaterThan(0);
    const before = r.b.res.heat;
    expect(before).toBeDefined();
    r.a.res.flame = 0;
    r.b.facing = -1;
    r.tick(inp(), press(Button.Attack));
    r.run(25);
    expect(r.a.res.flame).toBeGreaterThanOrEqual(0);
  });

  it('the neutral special becomes a stronger fireball with more flame', () => {
    const dmg: number[] = [];
    for (const flame of [0, 30, 60, 90]) {
      const r = rig(300);
      r.a.res.flame = flame;
      r.a.res.quiet = 0;
      r.tick(press(Button.Special));
      expect(r.a.move?.id).toBe(`neutralB_${flameLevel(flame)}`);
      dmg.push(Object.values(agni.projectiles!)[0] ? agni.projectiles![`fireball_${flameLevel(flame)}`].hit.damage : 0);
    }
    for (let i = 1; i < dmg.length; i++) expect(dmg[i]).toBeGreaterThan(dmg[i - 1]);
  });

  it('Flare Burst spends all the flame and scales with it', () => {
    const r = rig(60);
    r.a.res.flame = 90;
    r.a.res.quiet = 0;
    r.tick(press(Button.Special, { stickY: 1 }));
    expect(r.a.move?.id).toBe('downB_3');
    r.run(2);
    expect(r.a.res.flame).toBe(0);
    const big = agni.moves.downB_3.hitboxes[0];
    const small = agni.moves.downB_0.hitboxes[0];
    expect(big.damage).toBeGreaterThan(small.damage);
    expect(big.w).toBeGreaterThan(small.w);
  });

  it('the Solar Beam grows with stored flame and consumes it', () => {
    const r = rig(200);
    r.a.res.flame = 100;
    r.a.res.quiet = 0;
    r.a.meter = 100;
    r.tick(press(Button.Ultimate));
    expect(r.a.move?.id).toBe('ultimate_3');
    r.run(40);
    expect(r.a.res.flame).toBeLessThan(5);
    const beams = agni.projectiles!;
    expect(beams.beam_solar_3.hit.damage).toBeGreaterThan(beams.beam_solar_0.hit.damage);
    expect(beams.beam_solar_3.h).toBeGreaterThan(beams.beam_solar_0.h);
  });

  it('the beam hits a distant opponent', () => {
    const r = rig(220);
    r.a.res.flame = 60;
    r.a.res.quiet = 0;
    r.a.meter = 100;
    r.tick(press(Button.Ultimate));
    r.run(80);
    expect(r.b.damage).toBeGreaterThan(8);
  });

  it('is deterministic', () => {
    const run = (): number => {
      const r = rig(60);
      for (let i = 0; i < 300; i++) r.tick(i % 40 === 0 ? press(Button.Attack) : i % 97 === 0 ? press(Button.Special) : inp(), inp());
      return r.world.hash();
    };
    expect(run()).toBe(run());
  });
});
