import { describe, expect, it } from 'vitest';
import { agni } from '../src/characters/agni';
import { brick } from '../src/characters/brick';
import { executeMoveEvent, snapToLedge } from '../src/engine/actions';
import { Button, makeInput, type FighterInput } from '../src/engine/buttons';
import { COMBO_GAP, COMBO_STUN_MIN, PARRY_FRAMES, PARRY_HITLAG, SDI_DIST, SHIELD_DROP_FRAMES, SHIELD_DROP_LAG, STALE_PER_USE, Fighter } from '../src/engine/fighter';
import { computeKnockback, hitstunFrames } from '../src/engine/knockback';
import type { StageData } from '../src/engine/types';
import { World } from '../src/engine/world';
import { classicStage } from '../src/stages/classic';
import { sandboxStage } from '../src/stages/sandbox';

const inp = (o: Partial<FighterInput> = {}): FighterInput => ({ ...makeInput(), ...o });
const press = (b: number, o: Partial<FighterInput> = {}): FighterInput => inp({ pressed: b, held: b, ...o });
const hold = (b: number, o: Partial<FighterInput> = {}): FighterInput => inp({ held: b, ...o });

function rig(stage: StageData = sandboxStage, gap = 40) {
  const world = new World(stage);
  const a = new Fighter(0, agni);
  const b = new Fighter(1, brick);
  world.addFighter(a);
  world.addFighter(b);
  a.spawn(-gap / 2, -1, 1);
  b.spawn(gap / 2, -1, -1);
  const events: string[] = [];
  world.listener = (t) => events.push(t);
  for (let i = 0; i < 125; i++) world.step([inp(), inp()]);
  events.length = 0;
  return { world, a, b, events, tick: (ia = inp(), ib = inp()) => world.step([ia, ib]), run(n: number, ia?: FighterInput, ib?: FighterInput) { for (let i = 0; i < n; i++) world.step([ia ?? inp(), ib ?? inp()]); } };
}

describe('Perfect shield', () => {
  it('a hit landing in the first frames after raising the shield is parried: no shield damage, attacker frozen longer', () => {
    const r = rig();
    r.a.startMove('jab1', null, r.world); // starts up in 4 frames: connects while the shield is still fresh
    r.run(2);
    r.tick(inp(), press(Button.Shield));
    expect(r.b.state).toBe('shield');
    const hp = r.b.shieldHP;
    r.run(30, inp(), hold(Button.Shield));
    expect(r.b.parryCount).toBe(1);
    expect(r.b.shieldHP).toBeGreaterThanOrEqual(hp - 4); // only the slow hold decay, no hit damage
    expect(r.events).toContain('parry');
    expect(r.b.damage).toBe(0);
  });

  it('a late shield takes shield damage instead', () => {
    const r = rig();
    r.run(PARRY_FRAMES + 8, inp(), hold(Button.Shield));
    const hp = r.b.shieldHP;
    r.a.startMove('fsmash', null, r.world);
    r.run(30, inp(), hold(Button.Shield));
    expect(r.b.parryCount).toBe(0);
    expect(r.b.shieldHP).toBeLessThan(hp - 6);
  });

  it('dropping the shield locks it out briefly (no shield mashing)', () => {
    const r = rig();
    r.run(10, inp(), hold(Button.Shield));
    expect(r.b.state).toBe('shield');
    r.tick(inp(), inp()); // release
    expect(r.b.shieldCooldown).toBeGreaterThan(0);
    r.tick(inp(), hold(Button.Shield));
    expect(r.b.state).not.toBe('shield');
    r.run(SHIELD_DROP_LAG + 2, inp(), hold(Button.Shield));
    expect(r.b.state).toBe('shield');
  });

  it('parry freezes the attacker for extra frames', () => {
    expect(PARRY_HITLAG).toBeGreaterThan(0);
  });
});

describe('Out of shield', () => {
  it('Attack + up from shield is an up smash, any special works too', () => {
    const r = rig();
    r.run(10, inp(), hold(Button.Shield));
    r.tick(inp(), press(Button.Attack, { held: Button.Shield | Button.Attack, stickY: -1 }));
    expect(r.b.move?.id).toBe('usmash');
    // up special comes straight out of shield
    const u = rig();
    u.run(10, inp(), hold(Button.Shield));
    u.tick(inp(), press(Button.Special, { held: Button.Shield | Button.Special, stickY: -1 }));
    expect(u.b.state).toBe('attack');
    expect(u.b.move?.id.startsWith('upB')).toBe(true);
    // any other special drops the shield first, then comes out from the buffer
    const q = rig();
    q.run(10, inp(), hold(Button.Shield));
    q.tick(inp(), press(Button.Special, { held: Button.Shield | Button.Special }));
    expect(q.b.state).toBe('landing');
    expect(q.b.anim).toBe('shield');
    q.run(SHIELD_DROP_FRAMES, inp(), hold(Button.Special));
    expect(q.b.state).toBe('attack');
    expect(q.b.move?.kind).toBe('special');
  });

  it('forward / down smash out of shield wait for the shield drop; grab and jump do not', () => {
    for (const [btn, o, instant] of [
      [Button.Smash, {}, false],
      [Button.Smash, { stickY: 1 }, false],
      [Button.Grab, {}, true],
      [Button.Jump, {}, true],
    ] as const) {
      const r = rig();
      r.run(10, inp(), hold(Button.Shield));
      r.tick(inp(), press(btn, { held: Button.Shield | btn, ...o }));
      if (instant) {
        expect(r.b.state === 'attack' || r.b.state === 'jumpsquat' || r.b.state === 'holding').toBe(true);
        continue;
      }
      expect(r.b.state).toBe('landing');
      // Shield still held: the buffered smash still comes out once the shield is down
      r.run(SHIELD_DROP_FRAMES - 1, inp(), hold(btn | Button.Shield, o));
      expect(r.b.state).toBe('landing');
      r.tick(inp(), hold(btn | Button.Shield, o));
      expect(r.b.state).toBe('attack');
      expect(r.b.move?.kind).toBe('smash');
    }
  });

  it('letting go of shield costs the shield-drop frames before the next action', () => {
    const r = rig();
    r.run(10, inp(), hold(Button.Shield));
    r.tick(inp(), inp());
    expect(r.b.state).toBe('landing');
    r.tick(inp(), press(Button.Attack));
    expect(r.b.state).toBe('landing');
    r.run(SHIELD_DROP_FRAMES);
    expect(r.b.state).toBe('attack');
  });
});

describe('Dodge staleness', () => {
  it('repeated dodges lose invincibility frames and recover over time', () => {
    const r = rig();
    const invulnFrames = (): number => {
      let n = 0;
      r.b.setState('idle');
      r.b.invuln = 0;
      r.run(3, inp(), hold(Button.Shield));
      r.tick(inp(), hold(Button.Shield, { stickY: 1, pressed: 0 })); // flick down in shield = spot dodge
      (r.b as unknown as { flickDown: number }).flickDown = 1;
      r.tick(inp(), hold(Button.Shield, { stickY: 1 }));
      for (let i = 0; i < 40 && (r.b.state === 'spotdodge' || r.b.state === 'shield'); i++) {
        if (r.b.invuln > 0) n++;
        r.tick(inp(), inp());
      }
      r.run(30);
      return n;
    };
    const first = invulnFrames();
    invulnFrames();
    invulnFrames();
    const third = invulnFrames();
    expect(r.b.dodgeStale).toBeGreaterThan(1);
    expect(third).toBeLessThanOrEqual(first);
    r.run(600);
    expect(r.b.dodgeStale).toBe(0);
  });
});

describe('Stale-move negation', () => {
  it('repeating the same move deals less damage; other moves refresh it', () => {
    const r = rig();
    const dmgOf = (id: string): number => {
      const before = r.b.damage;
      r.b.damage = 0;
      r.b.comboHits = 0;
      r.run(40);
      r.a.x = r.b.x - 30;
      r.a.facing = 1;
      r.a.startMove(id, null, r.world);
      r.run(60);
      const d = r.b.damage;
      r.b.damage = before;
      r.b.setState('idle');
      r.b.invuln = 0;
      r.run(40);
      r.b.x = 30;
      r.b.y = -1;
      return d;
    };
    const first = dmgOf('ftilt');
    const second = dmgOf('ftilt');
    expect(first).toBeGreaterThan(0);
    expect(second).toBeLessThan(first);
    expect(second).toBeCloseTo(first * (1 - STALE_PER_USE), 1);
    dmgOf('utilt'); // different moves push the old ones out of the queue only after 9 hits, but do not themselves go stale
    expect(r.a.staleMult('dtilt')).toBe(1);
  });
});

describe('Rage', () => {
  it('attackers at high damage launch harder', () => {
    const low = rig();
    low.a.damage = 0;
    low.a.startMove('fsmash', null, low.world);
    low.run(40);
    const high = rig();
    high.a.damage = 150;
    high.a.startMove('fsmash', null, high.world);
    high.run(40);
    expect(high.a.rage).toBeGreaterThan(low.a.rage);
    // compare the launch they produced: higher rage = more speed right after the hit
    expect(Math.hypot(high.b.vx, high.b.vy) + high.b.hitstun).toBeGreaterThan(Math.hypot(low.b.vx, low.b.vy) + low.b.hitstun);
  });
});

describe('Combo scaling', () => {
  it('true combos (hits into hitstun) decay hitstun, floored; damage is never cut; the decay resets once the victim is free', () => {
    const r = rig();
    const hit = { damage: 10, base: 20, scaling: 0.1, angle: 80, direction: 1 as const, hitlag: 0, attackerId: 0 };
    const gains: number[] = [];
    const stuns: number[] = [];
    for (let i = 0; i < 20; i++) {
      const before = r.b.damage;
      r.b.receiveHit(hit, r.world);
      gains.push(r.b.damage - before);
      stuns.push(r.b.hitstunTotal / hitstunFrames(computeKnockback({ base: 20, scaling: 0.1, damagePercent: r.b.damage, targetWeight: r.b.stats.weight })));
      r.run(3); // stays in hitstun between hits
    }
    for (const g of gains) expect(g).toBeCloseTo(10, 5);
    expect(stuns[0]).toBeCloseTo(1, 1);
    expect(stuns[3]).toBeLessThan(stuns[1]);
    expect(Math.min(...stuns)).toBeGreaterThanOrEqual(COMBO_STUN_MIN - 0.05);
    r.run(200);
    expect(r.b.comboHits).toBe(0);
    r.b.receiveHit(hit, r.world);
    expect(r.b.hitstunTotal).toBe(hitstunFrames(computeKnockback({ base: 20, scaling: 0.1, damagePercent: r.b.damage, targetWeight: r.b.stats.weight })));
    expect(COMBO_GAP).toBeGreaterThan(0);
  });
});

describe('Hitlag SDI', () => {
  it('a stick flick during hit-stop shifts the victim a few pixels, a limited number of times', () => {
    const r = rig();
    r.b.receiveHit({ damage: 12, base: 50, scaling: 0.5, angle: 40, direction: 1, hitlag: 20, attackerId: 0 }, r.world);
    const x0 = r.b.x;
    // flick right, release, flick again
    for (let i = 0; i < 4; i++) {
      r.tick(inp(), inp({ stickX: i % 2 === 0 ? 1 : 0 }));
    }
    expect(r.b.x - x0).toBeGreaterThan(0);
    expect(r.b.x - x0).toBeLessThanOrEqual(SDI_DIST * 3 + 0.01);
    const x1 = r.b.x;
    for (let i = 0; i < 6; i++) r.tick(inp(), inp({ stickX: i % 2 === 0 ? 1 : 0 }));
    expect(r.b.x - x1).toBeLessThanOrEqual(SDI_DIST + 0.01); // capped at SDI_MAX per hit
  });
});

describe('Ledge trump', () => {
  it('grabbing an occupied ledge knocks the hanging fighter off', () => {
    const r = rig(classicStage, 200);
    const ledge = r.world.ledges[0];
    r.b.grabLedge(ledge, r.world);
    r.run(30);
    expect(r.b.state).toBe('ledge');
    // a second fighter drifts in from the air outside the ledge
    const outside = ledge.x + ledge.side * (r.a.hw + 1);
    r.a.x = outside;
    r.a.y = ledge.y + r.a.h * 0.9;
    r.a.vx = 0;
    r.a.vy = 0.5;
    r.a.grounded = false;
    r.a.groundPlat = null;
    r.a.setState('air');
    r.a.facing = (-ledge.side) as 1 | -1;
    r.run(6, inp({ stickX: -ledge.side }));
    expect(r.a.state).toBe('ledge');
    expect(r.b.state).not.toBe('ledge');
    expect(r.events).toContain('trump');
  });

  const hangB = (r: ReturnType<typeof rig>) => {
    const ledge = r.world.ledges[0];
    r.b.grabLedge(ledge, r.world);
    r.run(20);
    r.events.length = 0;
    const air = (x: number, y: number): void => {
      Object.assign(r.a, { x, y, vx: 0, vy: 0, grounded: false, groundPlat: null, invuln: 0 });
      r.a.setState('air');
      r.a.facing = (-ledge.side) as 1 | -1;
    };
    return { ledge, air };
  };

  it('a ledge snap (teleport recoveries) trumps a rival hanging on the ledge, with no invincibility', () => {
    const r = rig(classicStage, 200);
    const { ledge, air } = hangB(r);
    air(ledge.x + ledge.side * 30, ledge.y + 60);
    expect(snapToLedge(r.a, 110, r.world)).toBe(true);
    expect(r.a.state).toBe('ledge');
    expect(ledge.occupant).toBe(r.a.id);
    expect(r.b.state).toBe('air');
    expect(r.events).toContain('trump');
    expect(r.a.invuln).toBe(0);
  });

  it('a tether that latches an occupied ledge trumps the hanging rival on arrival', () => {
    const r = rig(classicStage, 200);
    const { ledge, air } = hangB(r);
    air(ledge.x + ledge.side * 70, ledge.y + 70);
    executeMoveEvent(r.a, { action: 'tether', angle: 55, range: 160, speed: 7, cone: 35 } as never, inp(), r.world);
    expect(r.a.state).toBe('tether');
    for (let i = 0; i < 40 && r.a.state === 'tether'; i++) r.tick(inp(), hold(0));
    expect(r.a.state).toBe('ledge');
    expect(r.b.state).not.toBe('ledge');
    expect(r.events).toContain('trump');
  });

  it('a snap does not take a ledge an ally holds or one being climbed', () => {
    const r = rig(classicStage, 200);
    const { ledge, air } = hangB(r);
    r.b.setState('ledgeClimb');
    air(ledge.x + ledge.side * 30, ledge.y + 60);
    expect(snapToLedge(r.a, 110, r.world)).toBe(false);
  });
});

describe('Surfaces and platform momentum', () => {
  const surfaceStage = (surface: 'normal' | 'ice' | 'conveyor' | 'sticky', conveyor?: number): StageData => ({
    ...sandboxStage,
    platforms: sandboxStage.platforms.map((p, i) => (i === 0 ? { ...p, surface, conveyor } : p)),
  });
  const slide = (surface: 'normal' | 'ice' | 'sticky'): number => {
    const r = rig(surfaceStage(surface));
    r.a.x = -100;
    r.run(40, inp({ stickX: 1 }));
    r.a.vx = Math.min(r.a.vx, r.a.stats.runSpeed);
    const x0 = r.a.x;
    r.run(60, inp());
    return r.a.x - x0;
  };
  it('ice slides further than normal ground, sticky stops sooner', () => {
    const normal = slide('normal');
    expect(slide('ice')).toBeGreaterThan(normal * 2);
    expect(slide('sticky')).toBeLessThan(normal);
  });

  it('a conveyor carries an idle fighter', () => {
    const r = rig(surfaceStage('conveyor', 0.6));
    const x0 = r.a.x;
    r.run(60);
    expect(r.a.x - x0).toBeGreaterThan(20);
  });
});
