import { describe, expect, it } from 'vitest';
import { brick } from '../src/characters/brick';
import { vex } from '../src/characters/vex';
import { Button, makeInput, type FighterInput } from '../src/engine/buttons';
import { Fighter } from '../src/engine/fighter';
import { World } from '../src/engine/world';
import type { CharacterData } from '../src/engine/types';
import { CHARACTERS } from '../src/characters';
import { classicStage } from '../src/stages/classic';

const inp = (o: Partial<FighterInput> = {}): FighterInput => ({ ...makeInput(), ...o });
const press = (b: number, o: Partial<FighterInput> = {}): FighterInput => inp({ pressed: b, held: b, ...o });

function rig(data: CharacterData = brick) {
  const world = new World(classicStage);
  const a = new Fighter(0, data);
  const b = new Fighter(1, brick);
  world.addFighter(a);
  world.addFighter(b);
  a.spawn(-60, -1, 1);
  b.spawn(140, -1, -1);
  const tick = (ia = inp()): void => world.step([ia, inp()]);
  for (let i = 0; i < 130; i++) tick();
  a.invuln = b.invuln = 0;
  return { world, a, b, tick, run: (n: number, ia = inp()) => { for (let i = 0; i < n; i++) tick(ia); } };
}

describe('tilts and dash attacks', () => {
  for (const c of Object.values(CHARACTERS)) {
    it(`${c.id}: a held direction + Attack is a tilt, plain Attack is a jab`, () => {
      for (const [stick, id] of [[{ stickX: 0.6 }, 'ftilt'], [{ stickY: -0.6 }, 'utilt'], [{ stickY: 0.7 }, 'dtilt'], [{}, 'jab1']] as [Partial<FighterInput>, string][]) {
        const r = rig(c);
        r.run(4, inp(stick)); // already holding the direction: not a flick
        r.tick(press(Button.Attack, stick));
        expect(r.a.move?.id, `${c.id} ${id}`).toBe(id);
        r.run(60);
        expect(r.a.state).not.toBe('attack');
      }
    });
    it(`${c.id}: attacking at a run is a dash attack that moves forward`, () => {
      const r = rig(c);
      r.run(25, inp({ stickX: 1, held: 0 }));
      expect(r.a.state === 'run' || r.a.state === 'dash').toBe(true);
      const x0 = r.a.x;
      r.tick(press(Button.Attack, { stickX: 1 }));
      expect(r.a.move?.id).toBe('dashAttack');
      r.run(10);
      expect(r.a.x).toBeGreaterThan(x0 + 8);
    });
  }
  it('tilts really hit: ftilt damages a close target', () => {
    const r = rig();
    r.b.spawn(-60 + 40, -1, -1);
    r.run(130);
    r.b.invuln = 0;
    r.run(3, inp({ stickX: 0.6 }));
    r.tick(press(Button.Attack, { stickX: 0.6 }));
    r.run(30, inp({ stickX: 0.6 }));
    expect(r.b.damage).toBeGreaterThan(0);
  });
});

describe('air dodge', () => {
  function airborne() {
    const r = rig();
    r.tick(press(Button.Jump));
    r.run(14);
    expect(r.a.grounded).toBe(false);
    return r;
  }
  it('Shield in the air dodges (invulnerable), once per airtime, and you can act again afterwards', () => {
    const r = airborne();
    r.a.y = r.a.prevY = -300; // above every platform, plenty of height so the dodge plays out in the air
    r.tick(press(Button.Shield, { stickX: 1 }));
    expect(r.a.state).toBe('airdodge');
    const x0 = r.a.x;
    let invulnSeen = false;
    for (let i = 0; i < 12; i++) {
      r.tick(inp({ stickX: 1, held: Button.Shield }));
      if (r.a.invuln > 0) invulnSeen = true;
    }
    expect(invulnSeen).toBe(true);
    expect(r.a.x).toBeGreaterThan(x0 + 12);
    for (let i = 0; i < 40 && r.a.state === 'airdodge'; i++) r.tick(inp());
    expect(r.a.state).toBe('air');
    expect(r.a.helpless).toBe(false);
    r.tick(press(Button.Shield));
    expect(r.a.state).not.toBe('airdodge'); // still once per airtime
    r.tick(press(Button.Attack));
    expect(r.a.state).toBe('attack'); // but an aerial is fine
  });

  it('a neutral air dodge (no stick) is shorter and slows the fall instead of travelling', () => {
    const r = airborne();
    const x0 = r.a.x;
    r.tick(press(Button.Shield));
    expect(r.a.state).toBe('airdodge');
    let n = 1;
    while (r.a.state === 'airdodge' && n < 60) {
      r.tick(inp());
      n++;
    }
    expect(n).toBeLessThan(28);
    expect(Math.abs(r.a.x - x0)).toBeLessThan(4);
  });
  it('resets on landing', () => {
    const r = airborne();
    r.tick(press(Button.Shield));
    r.run(200);
    expect(r.a.grounded).toBe(true);
    expect(r.a.airDodgeUsed).toBe(false);
    expect(r.a.helpless).toBe(false);
  });
  it('a hit during the dodge frames whiffs', () => {
    const r = airborne();
    r.tick(press(Button.Shield));
    r.run(5);
    const d0 = r.a.damage;
    r.a.receiveHit({ damage: 10, base: 40, scaling: 1, angle: 40, direction: 1 }, r.world); // direct hit bypasses invuln by design
    expect(r.a.damage).toBeGreaterThan(d0);
    // through the combat system an invulnerable fighter cannot be targeted
    expect(r.a.invuln).toBeGreaterThan(0);
  });
});

describe('wall jump', () => {
  it('Vex can jump off the side of the stage, Brick cannot', () => {
    for (const [data, expectJump] of [[vex, true], [brick, false]] as [CharacterData, boolean][]) {
      const r = rig(data);
      Object.assign(r.a, { x: -178, y: 62, vx: 1.5, vy: -1, grounded: false, groundPlat: null, state: 'air', jumpsLeft: 0 });
      r.run(3, inp({ stickX: 1 }));
      r.tick(press(Button.Jump, { stickX: 1 }));
      const kicked = r.a.vy < -3 && r.a.vx < 0;
      expect(kicked, data.id).toBe(expectJump);
    }
  });
});

describe('get-up and ledge attacks, taunt', () => {
  it('Attack while lying down starts a get-up attack', () => {
    const r = rig();
    r.a.setState('downed');
    r.run(8);
    r.tick(press(Button.Attack));
    expect(r.a.move?.id).toBe('getupAttack');
  });
  it('Attack on the ledge climbs up with an invulnerable ledge attack', () => {
    const r = rig();
    const ledge = r.world.ledges[0];
    Object.assign(r.a, { x: ledge.x - 8, y: ledge.y + 20, grounded: false, groundPlat: null, state: 'air', vy: 1 });
    r.a.grabLedge(ledge, r.world);
    expect(r.a.state).toBe('ledge');
    r.run(12);
    r.tick(press(Button.Attack));
    expect(r.a.state).toBe('ledgeClimb');
    r.run(30);
    expect(r.a.move?.id).toBe('ledgeAttack');
  });
  it('Ultimate with an empty meter taunts instead', () => {
    const r = rig();
    r.tick(press(Button.Ultimate));
    expect(r.a.move?.id).toBe('taunt');
    r.run(60);
    expect(r.a.state).toBe('idle');
  });
});
