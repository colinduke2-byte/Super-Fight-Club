import { describe, expect, it } from 'vitest';
import { brick } from '../src/characters/brick';
import { vex } from '../src/characters/vex';
import { Button, makeInput } from '../src/engine/buttons';
import { Fighter } from '../src/engine/fighter';
import { World, type WorldEventType } from '../src/engine/world';
import { classicStage } from '../src/stages/classic';

function rig() {
  const world = new World(classicStage);
  const a = new Fighter(0, brick);
  const v = new Fighter(1, vex);
  world.addFighter(a);
  world.addFighter(v);
  a.spawn(-60, -1, 1);
  v.spawn(120, -1, -1);
  const ins = [makeInput(), makeInput()];
  const events: WorldEventType[] = [];
  world.listener = (t) => events.push(t);
  for (let i = 0; i < 125; i++) world.step(ins);
  a.invuln = v.invuln = 0;
  const it = world.items[0];
  const place = (kind: 'heal' | 'bomb', x: number): void => {
    Object.assign(it, { active: true, kind, x, y: -7, vx: 0, vy: 0, resting: true, thrown: false, age: 0, knockedBy: -1, knockGrace: 0, knockCd: 0, pickDelay: 0 });
  };
  const jab = (): void => {
    for (let i = 0; i < 30; i++) {
      ins[0].pressed = i === 0 ? Button.Attack : 0;
      ins[0].held = i < 3 ? Button.Attack : 0;
      world.step(ins);
    }
    ins[0].pressed = ins[0].held = 0;
  };
  return { world, a, v, it, ins, events, place, jab };
}

describe('items as physics objects', () => {
  it('an attack bats a loose item away instead of picking it up', () => {
    const t = rig();
    t.place('heal', t.a.x + 22);
    t.jab();
    expect(t.events).toContain('itemKnock');
    expect(t.it.active).toBe(true);
    expect(t.it.x).toBeGreaterThan(t.a.x + 30);
    expect(t.a.damage).toBe(0); // not consumed by the hitter
  });

  it('a knocked Shock Bomb arms and flies, credited to the hitter', () => {
    const t = rig();
    t.place('bomb', t.a.x + 22);
    t.jab();
    expect(t.events).toContain('itemKnock');
    expect(t.a.heldBomb).toBe(false);
    // it either flies armed or has already gone off
    expect((t.it.active && t.it.thrown && t.it.owner === 0) || t.events.includes('itemBoom')).toBe(true);
  });

  it('a fast knocked item bumps the rival it meets, credited to the knocker', () => {
    const t = rig();
    t.place('heal', t.v.x - 40);
    Object.assign(t.it, { resting: false, vx: 7, vy: -1, y: t.v.y - 15, knockedBy: 0, knockGrace: 24 });
    for (let i = 0; i < 12; i++) {
      t.world.step(t.ins);
    }
    expect(t.v.damage).toBeGreaterThan(0);
    expect(t.v.lastHitBy).toBe(0);
  });

  it('items bounce on a hard landing and slide to a stop', () => {
    const t = rig();
    t.place('heal', -40);
    Object.assign(t.it, { resting: false, y: -80, vx: 2, vy: 6, knockedBy: 0 });
    let bounced = false;
    for (let i = 0; i < 120; i++) {
      t.world.step(t.ins);
      if (t.it.vy < 0) bounced = true;
    }
    expect(bounced).toBe(true);
    expect(t.it.resting).toBe(true);
    expect(t.it.vx).toBe(0);
  });
});
