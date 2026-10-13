import { describe, expect, it } from 'vitest';
import { havoc } from '../src/characters/havoc';
import { vex } from '../src/characters/vex';
import { Button, makeInput, type FighterInput } from '../src/engine/buttons';
import { Fighter } from '../src/engine/fighter';
import { World, type WorldEventType } from '../src/engine/world';
import { sandboxStage } from '../src/stages/sandbox';

const inp = (o: Partial<FighterInput> = {}): FighterInput => ({ ...makeInput(), ...o });
const press = (b: number, o: Partial<FighterInput> = {}): FighterInput => inp({ pressed: b, held: b, ...o });

function rig(gap = 60) {
  const world = new World(sandboxStage);
  const a = new Fighter(0, havoc);
  const b = new Fighter(1, vex);
  world.addFighter(a);
  world.addFighter(b);
  a.spawn(-gap / 2, -1, 1);
  b.spawn(gap / 2, -1, -1);
  const events: WorldEventType[] = [];
  world.listener = (t) => events.push(t);
  for (let i = 0; i < 125; i++) world.step([inp(), inp()]);
  a.invuln = b.invuln = 0;
  events.length = 0;
  const run = (n: number, ia = inp(), ib = inp()): void => {
    for (let i = 0; i < n; i++) world.step([ia, ib]);
  };
  return { world, a, b, run, events, tick: (ia = inp(), ib = inp()) => world.step([ia, ib]) };
}

describe('Havoc', () => {
  it('a Frag Grenade bounces, then explodes on its timer and catches a rival in the blast', () => {
    const r = rig(160);
    r.a.startMove('neutralB', null, r.world);
    let bounced = false;
    for (let i = 0; i < 140; i++) {
      r.tick();
      const g = r.world.projectiles.find((p) => p.active && p.defId === 'grenade');
      if (g && g.vy < -0.5 && g.age > 20) bounced = true;
      if (g && g.age === 85) r.b.x = g.x + 12; // step next to it just before it blows
    }
    expect(bounced).toBe(true);
    expect(r.events).toContain('blast');
    expect(r.b.damage).toBeGreaterThan(5);
  });

  it('the Remote Missile turns with the stick, and letting go of Special ends the steering', () => {
    const r = rig(300);
    r.b.spawn(-200, -1, 1);
    r.tick(press(Button.Special, { stickX: 1 }));
    expect(r.a.move?.id).toBe('sideB');
    r.run(14, inp({ held: Button.Special }));
    r.run(10, inp({ held: Button.Special, stickY: -1 }));
    const m = r.world.projectiles.find((p) => p.active && p.defId === 'missile')!;
    expect(m.vy).toBeLessThan(-1); // turned upward
    r.run(4, inp());
    r.run(16, inp());
    expect(r.a.move?.id).not.toBe('sideB'); // released: Havoc puts the controller away
  });

  it('C4 sticks to a rival in front; down special again sets it off', () => {
    const r = rig(24);
    r.a.startMove('downB', null, r.world);
    r.run(12);
    const c4 = r.world.deployables.find((d) => d.active && d.defId === 'c4')!;
    expect(c4.attached).toBe(1);
    r.b.x += 60; // the rival walks off with it
    r.run(16);
    expect(c4.x).toBeCloseTo(r.b.x, 0);
    r.tick(press(Button.Special, { stickY: 1 }));
    expect(r.a.move?.id).toBe('detonateC4');
    r.run(6);
    expect(c4.active).toBe(false);
    expect(r.b.damage).toBeGreaterThan(10);
  });

  it('C4 on the floor does not go off by itself when a rival walks over it', () => {
    const r = rig(120);
    r.a.startMove('downB', null, r.world);
    r.run(14);
    const c4 = r.world.deployables.find((d) => d.active && d.defId === 'c4')!;
    expect(c4.attached).toBe(-1);
    r.b.x = c4.x;
    r.run(20);
    expect(c4.active).toBe(true);
    expect(r.b.damage).toBe(0);
  });

  it('Airstrike rains missiles across the stage', () => {
    const r = rig(80);
    r.a.meter = 100;
    r.tick(press(Button.Ultimate));
    expect(r.a.move?.id).toBe('ultimate');
    let blasts = 0;
    r.world.listener = (t) => {
      if (t === 'blast') blasts++;
    };
    r.run(140);
    expect(blasts).toBeGreaterThan(8);
    expect(r.b.damage).toBeGreaterThan(6);
  });
});
