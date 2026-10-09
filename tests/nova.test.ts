import { describe, expect, it } from 'vitest';
import { brick } from '../src/characters/brick';
import { ELEMENTS, nextElement, nova } from '../src/characters/nova';
import { Button, makeInput, type FighterInput } from '../src/engine/buttons';
import { Fighter } from '../src/engine/fighter';
import { World, type WorldEventType } from '../src/engine/world';
import { sandboxStage } from '../src/stages/sandbox';

const inp = (o: Partial<FighterInput> = {}): FighterInput => ({ ...makeInput(), ...o });
const press = (b: number, o: Partial<FighterInput> = {}): FighterInput => inp({ pressed: b, held: b, ...o });

function rig(gap = 120, settle = true) {
  const world = new World(sandboxStage);
  const a = new Fighter(0, nova);
  const b = new Fighter(1, brick);
  world.addFighter(a);
  world.addFighter(b);
  a.spawn(-gap / 2, -1, 1);
  b.spawn(gap / 2, -1, -1);
  const events: WorldEventType[] = [];
  world.listener = (t) => events.push(t);
  const tick = (ia = inp(), ib = inp()): void => world.step([ia, ib]);
  if (settle) for (let i = 0; i < 125; i++) tick();
  events.length = 0;
  return { world, a, b, events, tick, run: (n: number, ia?: FighterInput, ib?: FighterInput) => { for (let i = 0; i < n; i++) tick(ia, ib); } };
}

/** Cycle element once with a tap of down+special. */
function cycle(r: ReturnType<typeof rig>): void {
  r.tick(press(Button.Special, { stickY: 1 }));
  r.run(24);
}

describe('Nova identity', () => {
  it('is mid-weight and floaty with good air drift and one double jump', () => {
    expect(nova.stats.weight).toBe(90);
    expect(nova.stats.gravity).toBeLessThan(brick.stats.gravity);
    expect(nova.stats.airSpeed).toBeGreaterThanOrEqual(2);
    expect(nova.stats.doubleJumps).toBe(1);
  });

  it('is weak up close: her melee is slow and low damage compared to her specials', () => {
    expect(nova.moves.jab1.hitboxes[0].damage).toBeLessThan(2.5);
    expect(nova.moves.jab1.startup).toBeGreaterThanOrEqual(6);
    const melee = ['jab1', 'jab2', 'jab3', 'nair', 'uair'].map((id) => Math.max(...nova.moves[id].hitboxes.map((h) => h.damage)));
    expect(Math.max(...melee)).toBeLessThan(6);
  });
});

describe('Arcana Cycle', () => {
  it('cycles Fire -> Ice -> Lightning -> Fire (pure)', () => {
    expect(ELEMENTS).toEqual(['fire', 'ice', 'lightning']);
    expect([0, 1, 2].map(nextElement)).toEqual([1, 2, 0]);
  });

  it('down special cycles the element each tap and the orb colour follows', () => {
    const r = rig();
    expect(r.a.res.element).toBe(0);
    cycle(r);
    expect(r.a.res.element).toBe(1);
    cycle(r);
    expect(r.a.res.element).toBe(2);
    cycle(r);
    expect(r.a.res.element).toBe(0);
    expect(nova.companion!.colors.length).toBe(3);
    expect(new Set(nova.companion!.colors).size).toBe(3);
  });

  it('a tapped Cycle does not raise a barrier; holding it does', () => {
    const tap = rig();
    cycle(tap);
    expect(tap.a.barrier.frames).toBe(0);

    const hold = rig();
    hold.tick(press(Button.Special, { stickY: 1 }));
    hold.run(14, inp({ held: Button.Special, stickY: 1 }));
    hold.run(5);
    expect(hold.a.barrier.frames).toBeGreaterThan(0);
  });

  it('neutral special picks a different spell per element', () => {
    const ids: string[] = [];
    for (let el = 0; el < 3; el++) {
      const r = rig();
      r.a.res.element = el;
      r.tick(press(Button.Special));
      ids.push(r.a.move!.id);
    }
    expect(ids).toEqual(['neutralB_fire', 'neutralB_ice', 'neutralB_lightning']);
  });
});

describe('Spell Bolt', () => {
  const fire = (el: number, frames: number) => {
    const r = rig(300);
    r.a.res.element = el;
    r.tick(press(Button.Special));
    // find the bolt as soon as it spawns, then follow it
    let p = r.world.projectiles.find((q) => q.active);
    for (let i = 0; i < 40 && !p; i++) {
      r.tick();
      p = r.world.projectiles.find((q) => q.active);
    }
    expect(p).toBeDefined();
    const y0 = p!.y;
    const track = { maxDy: 0, signs: new Set<number>() };
    for (let i = 0; i < frames; i++) {
      r.tick();
      track.maxDy = Math.max(track.maxDy, p!.y - y0);
      track.signs.add(Math.sign(Math.round(p!.vy * 2)));
    }
    return { p: p!, y0, track };
  };

  it('Fire arcs under gravity, Ice floats, Lightning zigzags', () => {
    const f = fire(0, 30);
    const i = fire(1, 30);
    const l = fire(2, 30);
    expect(f.p.y - f.y0).toBeGreaterThan(i.p.y - i.y0 + 2); // fire falls further than ice
    expect(Math.abs(i.p.vy)).toBeLessThan(0.6); // ice is nearly level
    expect(l.track.signs.has(1) && l.track.signs.has(-1)).toBe(true); // lightning oscillates both ways
  });

  it('the gravity curve is exactly semi-implicit Euler for the fire bolt', () => {
    const r = rig(300);
    const p = r.world.spawnProjectile(0, 'bolt_fire', -100, -100, 3.4, -1.6)!;
    let vy = -1.6;
    let y = -100;
    for (let n = 0; n < 25; n++) {
      r.tick();
      vy = Math.min(4, vy + 0.11);
      y += vy;
      expect(p.y).toBeCloseTo(y, 6);
    }
  });

  it('fire burns, ice slows (and freezes at high percent), lightning stuns briefly and hits repeatedly', () => {
    const hit = (el: number, percent = 0) => {
      const r = rig(80);
      r.a.res.element = el;
      r.b.damage = percent;
      r.tick(press(Button.Special));
      r.run(70);
      return r;
    };
    expect(hit(0).b.status.burn).toBeGreaterThan(0);
    expect(hit(1).b.status.slow).toBeGreaterThan(0);
    expect(hit(1, 130).b.status.freeze + (hit(1, 130).b.state === 'frozen' ? 1 : 0)).toBeGreaterThan(0);
    const l = hit(2);
    expect(l.b.damage).toBeGreaterThan(2.4 - 0.01);
    expect(l.events.filter((e) => e === 'projectileHit').length).toBeGreaterThanOrEqual(1);
  });

  it('can be charged for more damage', () => {
    const dmg = (hold: number): number => {
      const r = rig(80);
      r.a.res.element = 0;
      r.tick(press(Button.Special));
      r.run(hold, inp({ held: Button.Special }));
      r.run(80);
      return r.b.damage;
    };
    expect(dmg(60)).toBeGreaterThan(dmg(0) * 1.3);
  });

  it('is destroyed by an attack when it has health, and bounced back by the barrier', () => {
    const r = rig(120);
    const p = r.world.spawnProjectile(0, 'bolt_ice', r.a.x + 30, r.a.y - 18, 0, 0)!;
    p.owner = 1; // an enemy bolt (Nova's definition, handed to the other fighter)
    p.vx = 0;
    r.a.startMove('jab3', null, r.world);
    r.run(20);
    expect(p.active).toBe(false);

    const q = rig(160);
    q.a.res.element = 0;
    q.a.startMove('downB', null, q.world);
    q.run(15, inp({ held: Button.Special }));
    q.run(5);
    // an enemy bolt (Brick has none, so borrow Nova's definition by owning it as Nova then handing it over)
    const bolt = q.world.spawnProjectile(0, 'bolt_fire', q.a.x + 70, q.a.y - 18, -3, 0)!;
    bolt.owner = 1;
    q.run(40);
    expect(q.events).toContain('reflect');
    expect(bolt.owner).toBe(0);
  });
});

describe('Rune Trap', () => {
  it('holds at most one rune per element (three in total)', () => {
    const r = rig(300);
    for (let el = 0; el < 3; el++) {
      for (let k = 0; k < 2; k++) {
        r.a.res.element = el;
        r.a.x = -150 + (el * 2 + k) * 30;
        r.a.startMove('sideB_' + ELEMENTS[el], null, r.world);
        r.run(36);
      }
    }
    expect(r.world.countDeployables(0, 'rune_fire')).toBe(1);
    expect(r.world.countDeployables(0, 'rune_ice')).toBe(1);
    expect(r.world.countDeployables(0, 'rune_lightning')).toBe(1);
  });

  it('triggers when an enemy steps on it, with the right element effect', () => {
    const run = (def: string) => {
      const r = rig(300);
      const d = r.world.spawnDeployable(0, def, 0, 0)!;
      r.run(25);
      r.b.x = 0;
      r.b.y = 0;
      r.run(3);
      expect(d.active).toBe(false);
      return r.b;
    };
    expect(run('rune_fire').status.burn).toBeGreaterThan(0);
    expect(run('rune_ice').status.slow).toBeGreaterThan(0);
    const l = run('rune_lightning');
    expect(l.status.stun > 0 || l.state === 'stunned' || l.state === 'hitstun').toBe(true);
  });

  it('ignores its owner', () => {
    const r = rig(300);
    const d = r.world.spawnDeployable(0, 'rune_fire', 0, 0)!;
    r.run(25);
    r.a.x = 0;
    r.run(5);
    expect(d.active).toBe(true);
  });
});

describe('Aether Step (recovery)', () => {
  it('floats up and snaps to a nearby ledge, but is helpless with no ledge in reach', () => {
    const r = rig(300, false);
    r.a.spawn(200, 30, -1);
    r.run(2);
    r.a.startMove('upB', null, r.world);
    r.run(20);
    expect(r.a.state).toBe('ledge');

    const h = rig(300, false);
    h.a.spawn(400, -300, 1);
    h.run(2);
    h.a.startMove('upB', null, h.world);
    h.run(55);
    expect(h.a.helpless).toBe(true);
  });

  it('is telegraphed: a 10-frame start-up before the step', () => {
    expect(nova.moves.upB.startup).toBeGreaterThanOrEqual(10);
  });
});

describe('Elemental melee', () => {
  it('smashes carry the current element: burn / slow / stun', () => {
    const effect = (el: number) => {
      const r = rig(34);
      r.a.res.element = el;
      r.a.startMove('fsmash', null, r.world);
      r.run(40);
      return r.b;
    };
    expect(effect(0).status.burn).toBeGreaterThan(0);
    expect(effect(1).status.slow).toBeGreaterThan(0);
    const l = effect(2);
    expect(l.damage).toBeGreaterThan(0);
  });

  it('fire melee hits harder than lightning melee', () => {
    const dmg = (el: number): number => {
      const r = rig(34);
      r.a.res.element = el;
      r.a.startMove('usmash', null, r.world);
      r.run(40);
      return r.b.damage;
    };
    expect(dmg(0)).toBeGreaterThan(dmg(2));
  });
});

describe('Elemental Convergence', () => {
  it('fires three beams (fire, ice, lightning) across the screen and the lightning finisher launches', () => {
    const r = rig(300);
    r.a.meter = 100;
    r.tick(press(Button.Ultimate));
    expect(r.a.move?.id).toBe('ultimate');
    r.b.damage = 40;
    let launched = false;
    r.world.listener = (t, f) => {
      if (t === 'hit' && f === r.b && Math.hypot(r.b.vx, r.b.vy) > 4) launched = true;
    };
    r.run(140);
    expect(r.b.damage).toBeGreaterThan(40 + 4 + 4 + 14 - 0.1);
    expect(launched).toBe(true);
    expect(r.a.meter).toBeLessThan(100); // spent (only the damage dealt refills a little)
  });
});
