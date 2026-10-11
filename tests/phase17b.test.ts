import { describe, expect, it } from 'vitest';
import { agni } from '../src/characters/agni';
import { brick } from '../src/characters/brick';
import { nova } from '../src/characters/nova';
import { vex } from '../src/characters/vex';
import { Button, makeInput, type FighterInput } from '../src/engine/buttons';
import { BURST_COST, SLOW_GETUP_DAMAGE, WALK_SPEED_FRAC, WALL_CLING_FRAMES, Fighter } from '../src/engine/fighter';
import { validateVariants } from '../src/engine/moves';
import type { CharacterData } from '../src/engine/types';
import { World } from '../src/engine/world';
import { classicStage } from '../src/stages/classic';
import { sandboxStage } from '../src/stages/sandbox';

const inp = (o: Partial<FighterInput> = {}): FighterInput => ({ ...makeInput(), ...o });
const press = (b: number, o: Partial<FighterInput> = {}): FighterInput => inp({ pressed: b, held: b, ...o });

function duo(d0: CharacterData, d1: CharacterData, stage = sandboxStage, gap = 60) {
  const world = new World(stage);
  const a = new Fighter(0, d0);
  const b = new Fighter(1, d1);
  world.addFighter(a);
  world.addFighter(b);
  a.spawn(-gap / 2, -1, 1);
  b.spawn(gap / 2, -1, -1);
  const events: string[] = [];
  world.listener = (t) => events.push(t);
  for (let i = 0; i < 125; i++) world.step([inp(), inp()]);
  events.length = 0;
  return { world, a, b, events, run(n: number, ia?: FighterInput, ib?: FighterInput) { for (let i = 0; i < n; i++) world.step([ia ?? inp(), ib ?? inp()]); } };
}

describe('Declarative variants', () => {
  it('Nova picks her bolt by element and Agni picks every special by flame level', () => {
    const r = duo(nova, brick);
    for (let e = 0; e < 3; e++) {
      r.a.res.element = e;
      expect(r.a.resolveVariant('neutralB')).toBe(['neutralB_fire', 'neutralB_ice', 'neutralB_lightning'][e]);
    }
    const g = duo(agni, brick);
    g.a.res.level = 2;
    for (const slot of ['neutralB', 'sideB', 'upB', 'downB', 'ultimate']) expect(g.a.resolveVariant(slot)).toBe(`${slot}_2`);
    g.a.res.level = 9; // clamps
    expect(g.a.resolveVariant('upB')).toBe('upB_3');
    expect(g.a.resolveVariant('jab1')).toBe('jab1');
  });

  it('pressing the special button starts the resolved variant', () => {
    const g = duo(agni, brick);
    g.a.res.flame = 60;
    g.a.res.quiet = 0;
    g.run(1, press(Button.Special));
    expect(g.a.move?.id).toBe('neutralB_2');
  });

  it('rejects variant tables that point at missing moves', () => {
    expect(() => validateVariants({ neutralB: { key: 'x', ids: ['nope'] } }, nova.moves, 't')).toThrow(/unknown move/);
    expect(() => validateVariants({ neutralB: { key: '', ids: [] } }, nova.moves, 't')).toThrow(/needs a resource key/);
  });
});

describe('Declarative resources', () => {
  it('Agni flame fills from dealt and taken damage, derives its level, and drains after quiet time', () => {
    const g = duo(agni, brick);
    g.a.gainResourcesDealt(30);
    expect(g.a.res.flame).toBeCloseTo(27, 5);
    g.run(1);
    expect(g.a.res.level).toBe(1);
    g.a.gainResourcesTaken(50);
    g.run(1);
    expect(g.a.res.flame).toBeCloseTo(62, 5);
    expect(g.a.res.level).toBe(2);
    g.run(400);
    expect(g.a.res.flame).toBeLessThan(62);
    g.a.gainResourcesDealt(500);
    expect(g.a.res.flame).toBe(100);
  });

  it('Brick heat ignores light hits and caps at 100', () => {
    const g = duo(brick, agni);
    g.a.gainResourcesDealt(3);
    expect(g.a.res.heat).toBe(0);
    g.a.gainResourcesDealt(20);
    expect(g.a.res.heat).toBeGreaterThan(0);
    g.a.gainResourcesTaken(500);
    expect(g.a.res.heat).toBe(100);
  });
});

describe('Walk', () => {
  it('a gentle stick tilt walks slowly, a firm push runs', () => {
    const w = duo(agni, brick, sandboxStage, 200);
    w.run(40, inp({ stickX: 0.3 }));
    expect(Math.abs(w.a.vx)).toBeLessThan(agni.stats.runSpeed * WALK_SPEED_FRAC);
    expect(Math.abs(w.a.vx)).toBeGreaterThan(0.2);
    expect(w.a.anim).toBe('walk');
    const r = duo(agni, brick, sandboxStage, 200);
    r.run(40, inp({ stickX: 1 }));
    expect(r.a.vx).toBeCloseTo(agni.stats.runSpeed, 1);
    expect(r.a.anim).toBe('run');
  });
});

describe('Wall cling', () => {
  it('a wall-jumper holding toward a wall slides slowly for a limited time', () => {
    // a tall solid wall next to the main platform
    const stage = { ...sandboxStage, platforms: [...sandboxStage.platforms, { x: 120, y: -300, w: 40, h: 300, kind: 'solid' as const }] };
    const r = duo(vex, brick, stage, 200);
    r.a.x = 104;
    r.a.y = -200;
    r.a.vy = 0;
    r.a.grounded = false;
    r.a.groundPlat = null;
    r.a.setState('air');
    let slow = 0;
    for (let i = 0; i < WALL_CLING_FRAMES + 40; i++) {
      r.run(1, inp({ stickX: 1 }));
      if (r.a.vy > 0 && r.a.vy <= 1.0) slow++;
    }
    expect(slow).toBeGreaterThan(20);
    expect(slow).toBeLessThanOrEqual(WALL_CLING_FRAMES + 2);
    // a character without wallJump just falls
    const q = duo(brick, brick, stage, 200);
    q.a.x = 104;
    q.a.y = -200;
    q.a.vy = 0;
    q.a.grounded = false;
    q.a.groundPlat = null;
    q.a.setState('air');
    q.run(14, inp({ stickX: 1 }));
    expect(q.a.vy).toBeGreaterThan(3);
  });
});

describe('Ledge options', () => {
  const hang = (damage = 0) => {
    const r = duo(agni, brick, classicStage, 400);
    r.a.damage = damage;
    const ledge = r.world.ledges[0];
    r.a.grabLedge(ledge, r.world);
    r.run(20);
    return { r, ledge };
  };
  it('shield = ledge roll (longer, ends further inboard); damaged fighters get up slowly', () => {
    const fast = hang();
    const x0 = fast.r.a.x;
    fast.r.run(1, press(Button.Shield));
    expect(fast.r.a.state).toBe('ledgeClimb');
    let nFast = 0;
    while (fast.r.a.state === 'ledgeClimb' && nFast < 80) {
      fast.r.run(1);
      nFast++;
    }
    expect(Math.abs(fast.r.a.x - x0)).toBeGreaterThan(30);
    const slow = hang(SLOW_GETUP_DAMAGE + 20);
    slow.r.run(1, inp({ stickY: -1 }));
    let nSlow = 0;
    while (slow.r.a.state === 'ledgeClimb' && nSlow < 80) {
      slow.r.run(1);
      nSlow++;
    }
    const plain = hang();
    plain.r.run(1, inp({ stickY: -1 }));
    let nPlain = 0;
    while (plain.r.a.state === 'ledgeClimb' && nPlain < 80) {
      plain.r.run(1);
      nPlain++;
    }
    expect(nSlow).toBeGreaterThan(nPlain);
  });

  it('jump toward the stage is a ledge hop up and over; plain jump goes away', () => {
    const h = hang();
    const toward = -h.ledge.side;
    h.r.run(1, press(Button.Jump, { stickX: toward }));
    expect(h.r.a.state).toBe('air');
    expect(Math.sign(h.r.a.vx)).toBe(toward);
    const j = hang();
    j.r.run(1, press(Button.Jump));
    expect(Math.abs(j.r.a.vx)).toBeLessThan(Math.abs(h.r.a.vx)); // a neutral ledge jump is nearly vertical
  });
});

describe('Burst (combo breaker)', () => {
  it('costs meter, needs a long combo, shoves attackers away and grants invincibility', () => {
    const r = duo(brick, agni, sandboxStage, 30);
    const hit = { damage: 2, base: 10, scaling: 0.1, angle: 80, direction: 1 as const, hitlag: 0, attackerId: 0 };
    for (let i = 0; i < 4; i++) {
      r.b.receiveHit(hit, r.world);
      r.run(2);
    }
    r.b.meter = 100;
    expect(r.b.comboHits).toBeGreaterThanOrEqual(4);
    r.run(1, inp(), press(Button.Ultimate));
    expect(r.events).toContain('burst');
    expect(r.b.meter).toBe(100 - BURST_COST);
    expect(r.b.state).not.toBe('hitstun');
    expect(r.b.invuln).toBeGreaterThan(10);
    expect(r.a.state).toBe('hitstun'); // the attacker was shoved away

    const short = duo(brick, agni, sandboxStage, 30);
    short.b.receiveHit(hit, short.world);
    short.b.meter = 100;
    short.run(1, inp(), press(Button.Ultimate));
    expect(short.events).not.toContain('burst');
  });
});
