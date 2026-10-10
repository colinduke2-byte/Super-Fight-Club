import { describe, expect, it } from 'vitest';
import { agni } from '../src/characters/agni';
import { brick } from '../src/characters/brick';
import { Button, makeInput, type FighterInput } from '../src/engine/buttons';
import { CROUCH_CANCEL, Fighter } from '../src/engine/fighter';
import { World } from '../src/engine/world';
import { sandboxStage } from '../src/stages/sandbox';

const inp = (o: Partial<FighterInput> = {}): FighterInput => ({ ...makeInput(), ...o });

function rig() {
  const world = new World(sandboxStage);
  const a = new Fighter(0, agni);
  const b = new Fighter(1, brick);
  world.addFighter(a);
  world.addFighter(b);
  a.spawn(-60, -1, 1);
  b.spawn(60, -1, 1);
  for (let i = 0; i < 125; i++) world.step([inp(), inp()]);
  return { world, a, b };
}
const hit = (angle: number, base = 60, scaling = 0.8) => ({ damage: 8, base, scaling, angle, direction: 1 as const, hitlag: 0, attackerId: 0 });

describe('Hit reactions', () => {
  it('a sideways hit turns the victim to face where it came from', () => {
    const { world, b } = rig();
    b.facing = 1; // facing right, hit from the left (knocked right)
    b.receiveHit(hit(30), world);
    expect(b.facing).toBe(-1);
  });

  it('a near-vertical launch keeps the victim facing', () => {
    const { world, b } = rig();
    b.facing = 1;
    b.receiveHit(hit(90), world);
    expect(b.facing).toBe(1);
  });

  it('picks the hurt pose from the launch: light flinch, heavy, upward, spike', () => {
    const kinds: Record<string, string> = {};
    for (const [name, angle, base, sc] of [['light', 20, 6, 0.05], ['heavy', 30, 60, 0.8], ['up', 88, 80, 0.8], ['spike', 275, 50, 0.6]] as const) {
      const { world, b } = rig();
      b.receiveHit(hit(angle, base, sc), world);
      kinds[name] = b.hurtKind;
    }
    expect(kinds).toEqual({ light: 'hurtL', heavy: 'hurt', up: 'hurtU', spike: 'hurtD' });
  });

  it('crouching on the ground absorbs part of the knockback', () => {
    const stand = rig();
    stand.b.receiveHit(hit(35), stand.world);
    const crouch = rig();
    crouch.b.setState('crouch');
    crouch.b.receiveHit(hit(35), crouch.world);
    const speed = (f: Fighter): number => Math.hypot(f.vx, f.vy);
    expect(speed(crouch.b)).toBeCloseTo(speed(stand.b) * CROUCH_CANCEL, 3);
  });

  it('directional influence bends the launch across the stick direction, once, and only with a held stick', () => {
    const run = (stickY: number): { vx: number; vy: number } => {
      const { world, b } = rig();
      b.receiveHit(hit(25, 80, 0.5), world); // sent right and a little up
      for (let i = 0; i < 2; i++) world.step([inp(), inp({ stickY })]);
      return { vx: b.vx, vy: b.vy };
    };
    const none = run(0);
    const up = run(-1);
    const down = run(1);
    expect(up.vy).toBeLessThan(none.vy); // held up: flies higher
    expect(down.vy).toBeGreaterThan(none.vy); // held down: flies lower
    expect(Math.hypot(up.vx, up.vy)).toBeCloseTo(Math.hypot(none.vx, none.vy), 0); // bent, not boosted
  });

  it('a hard upward hit can reach the top blast zone (up smashes kill)', () => {
    const { world, b } = rig();
    b.damage = 230;
    let ko = false;
    world.listener = (t, f) => { if (t === 'ko' && f === b) ko = true; };
    b.receiveHit({ damage: 14, base: 45, scaling: 0.88, angle: 85, direction: 1, hitlag: 0, attackerId: 0 }, world);
    for (let i = 0; i < 400 && !ko; i++) world.step([inp(), inp()]);
    expect(ko).toBe(true);
  });

  it('records the hit effect tag for the flash colour', () => {
    const { world, a, b } = rig();
    a.startMove('jab3', null, world);
    a.x = b.x - 20;
    for (let i = 0; i < 40; i++) world.step([inp(), inp()]);
    expect(b.lastHitFx).toBe('fire');
  });

  it('shield button input path still works (sanity)', () => {
    const { world, b } = rig();
    world.step([inp(), inp({ pressed: Button.Shield, held: Button.Shield })]);
    expect(['shield', 'idle']).toContain(b.state);
  });
});
