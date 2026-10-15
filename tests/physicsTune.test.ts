import { describe, expect, it } from 'vitest';
import { agni } from '../src/characters/agni';
import { brick } from '../src/characters/brick';
import { Button, makeInput, type FighterInput } from '../src/engine/buttons';
import { hitsShieldBubble } from '../src/engine/combat';
import { Fighter, KILL_CREDIT_FRAMES, TAUNT_LOCKOUT } from '../src/engine/fighter';
import { World } from '../src/engine/world';
import { sandboxStage } from '../src/stages/sandbox';

const inp = (o: Partial<FighterInput> = {}): FighterInput => ({ ...makeInput(), ...o });
const press = (b: number, o: Partial<FighterInput> = {}): FighterInput => inp({ pressed: b, held: b, ...o });

function rig(gap = 40) {
  const world = new World(sandboxStage);
  const a = new Fighter(0, agni);
  const b = new Fighter(1, brick);
  world.addFighter(a);
  world.addFighter(b);
  a.spawn(-gap / 2, -1, 1);
  b.spawn(gap / 2, -1, -1);
  for (let i = 0; i < 125; i++) world.step([inp(), inp()]);
  return { world, a, b, run(n: number, ia?: FighterInput, ib?: FighterInput) { for (let i = 0; i < n; i++) world.step([ia ?? inp(), ib ?? inp()]); } };
}

const spike = { damage: 10, base: 60, scaling: 0.5, angle: 270, direction: 1 as const, hitlag: 0, attackerId: 0 };

describe('spikes on grounded victims', () => {
  it('bounce the victim off the floor instead of pinning it', () => {
    const r = rig();
    expect(r.b.grounded).toBe(true);
    r.b.receiveHit(spike, r.world);
    r.run(2);
    expect(r.b.grounded).toBe(false);
    expect(r.b.vy).toBeLessThan(0);
  });
  it('can be teched with a shield press', () => {
    const r = rig();
    r.b.receiveHit(spike, r.world);
    r.run(1, inp(), press(Button.Shield));
    expect(r.b.state).toBe('tech');
  });
});

describe('shields', () => {
  it('a hit that misses the shrunken bubble is not blocked', () => {
    const r = rig();
    const b = r.b;
    const cy = b.y - b.h / 2;
    expect(hitsShieldBubble(b, [b.x - 5, cy - 5, 10, 10])).toBe(true);
    b.shieldHP = 0; // smallest bubble
    expect(hitsShieldBubble(b, [b.x - 5, b.y - 4, 10, 4])).toBe(false); // a poke at the feet
  });
  it('a fresh aerial on shield is minus for the attacker (shieldstun below its landing lag)', () => {
    const r = rig();
    r.b.shieldHit(12, false, 1, 1, r.world, true);
    const aerial = r.b.shieldStun;
    r.b.shieldHit(12, false, 1, 1, r.world, false);
    expect(aerial).toBeLessThan(r.b.shieldStun);
    expect(aerial).toBeLessThanOrEqual((brick.moves.fair.landingLag ?? 8) - 3);
  });
});

describe('kill credit', () => {
  it('expires a while after the victim is back on the ground', () => {
    const r = rig();
    r.b.receiveHit({ ...spike, angle: 0, base: 5, scaling: 0 }, r.world);
    expect(r.b.lastHitBy).toBe(0);
    r.run(60);
    expect(r.b.lastHitBy).toBe(0);
    r.run(KILL_CREDIT_FRAMES + 30);
    expect(r.b.lastHitBy).toBe(-1);
  });
});

describe('grabs and taunts', () => {
  it('a grab out of a run is a dash grab with more reach; pulling back makes it a pivot grab', () => {
    const r = rig(300);
    r.run(20, inp({ stickX: 1, held: 0 }));
    expect(r.a.state).toBe('run');
    r.run(1, press(Button.Grab, { stickX: 1 }));
    expect(r.a.move?.id).toBe('dashGrab');
    const reach = (m: typeof r.a.move) => Math.max(...m!.hitboxes.map((h) => h.x + h.w / 2));
    expect(reach(r.a.move)).toBeGreaterThan(reach(agni.moves.grab));
    const q = rig(300);
    q.run(20, inp({ stickX: 1 }));
    q.run(1, press(Button.Grab, { stickX: -1 }));
    expect(q.a.move?.id).toBe('pivotGrab');
    expect(q.a.facing).toBe(-1);
  });
  it('an empty-meter Ultimate press does not taunt straight out of a hit', () => {
    const r = rig();
    r.a.receiveHit({ ...spike, angle: 0, base: 5, scaling: 0, attackerId: 1 }, r.world);
    while (r.a.state === 'hitstun') r.run(1);
    r.run(1, press(Button.Ultimate));
    expect(r.a.move?.id).not.toBe('taunt');
    r.run(TAUNT_LOCKOUT + 5);
    r.run(1, press(Button.Ultimate));
    expect(r.a.move?.id).toBe('taunt');
  });
});
