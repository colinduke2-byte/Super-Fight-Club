import { describe, expect, it } from 'vitest';
import { brick } from '../src/characters/brick';
import {
  addHeat, canVent, DECAY_DELAY, DECAY_RATE, decayHeat, HEAT_ARMOR, HEAT_MAX, heatFromDealt, heatFromTaken, HEAVY_HIT, isHot, ventPower, VENT_MIN,
} from '../src/characters/brickHeat';
import { Button, makeInput, type FighterInput } from '../src/engine/buttons';
import { deliverHit } from '../src/engine/combat';
import { Fighter } from '../src/engine/fighter';
import { moveTotal } from '../src/engine/moves';
import { World, type WorldEventType } from '../src/engine/world';
import { sandboxStage } from '../src/stages/sandbox';

const inp = (o: Partial<FighterInput> = {}): FighterInput => ({ ...makeInput(), ...o });
const press = (b: number, o: Partial<FighterInput> = {}): FighterInput => inp({ pressed: b, held: b, ...o });

function rig(gap = 30) {
  const world = new World(sandboxStage);
  const a = new Fighter(0, brick);
  const b = new Fighter(1, brick);
  world.addFighter(a);
  world.addFighter(b);
  a.spawn(-gap / 2, -1, 1);
  b.spawn(gap / 2, -1, -1);
  const events: WorldEventType[] = [];
  world.listener = (t) => events.push(t);
  const tick = (ia = inp(), ib = inp()): void => world.step([ia, ib]);
  for (let i = 0; i < 125; i++) tick();
  events.length = 0;
  return { world, a, b, events, tick, run: (n: number, ia?: FighterInput, ib?: FighterInput) => { for (let i = 0; i < n; i++) tick(ia, ib); } };
}

describe('Heat math (pure)', () => {
  it('gains from damage taken, and only from heavy hits dealt', () => {
    expect(heatFromTaken(10)).toBeCloseTo(8);
    expect(heatFromDealt(HEAVY_HIT - 0.1)).toBe(0);
    expect(heatFromDealt(HEAVY_HIT)).toBeGreaterThan(0);
    expect(heatFromDealt(18)).toBeGreaterThan(heatFromDealt(10));
  });

  it('is clamped to 0..100', () => {
    expect(addHeat(95, 50)).toBe(HEAT_MAX);
    expect(addHeat(5, -50)).toBe(0);
  });

  it('only decays after the quiet delay, then at a steady rate', () => {
    expect(decayHeat(60, 0)).toBe(60);
    expect(decayHeat(60, DECAY_DELAY)).toBe(60);
    expect(decayHeat(60, DECAY_DELAY + 1)).toBeCloseTo(60 - DECAY_RATE);
    expect(decayHeat(0.01, DECAY_DELAY + 1)).toBe(0);
    // a full bar drains in roughly 20 seconds of quiet
    let h = 100;
    let frames = 0;
    while (h > 0 && frames < 5000) {
      h = decayHeat(h, DECAY_DELAY + 1);
      frames++;
    }
    expect(frames / 60).toBeGreaterThan(15);
    expect(frames / 60).toBeLessThan(30);
  });

  it('thresholds: armor at 50%, Vent from 30%', () => {
    expect(isHot(HEAT_ARMOR - 0.1)).toBe(false);
    expect(isHot(HEAT_ARMOR)).toBe(true);
    expect(canVent(VENT_MIN - 1)).toBe(false);
    expect(canVent(VENT_MIN)).toBe(true);
  });

  it('Vent damage and knockback scale up with Heat', () => {
    const lo = ventPower(VENT_MIN);
    const hi = ventPower(HEAT_MAX);
    expect(hi.damageMult).toBeGreaterThan(lo.damageMult);
    expect(hi.kbMult).toBeGreaterThan(lo.kbMult);
    expect(hi.damageMult).toBeCloseTo(2.0);
    expect(ventPower(0).damageMult).toBeCloseTo(0.7);
  });
});

describe('Heat in combat', () => {
  it('Brick heats up when he is hit, and from heavy hits he lands, but not from jabs', () => {
    const t = rig(26);
    t.a.startMove('jab1', null, t.world); // ~3 dmg: not heavy
    t.run(12);
    expect(t.a.res.heat).toBe(0);
    expect(t.b.res.heat).toBeCloseTo(heatFromTaken(brick.moves.jab1.hitboxes[0].damage)); // the victim gained heat

    const h = rig(26);
    h.a.startMove('fsmash', null, h.world); // ~17 dmg: heavy
    h.run(60);
    expect(h.a.res.heat).toBeCloseTo(heatFromDealt(brick.moves.fsmash.hitboxes[0].damage));
  });

  it('heat is kept while fighting and decays only after a quiet spell', () => {
    const r = rig(26);
    r.a.res.heat = 60;
    r.a.res.quiet = 0;
    r.run(DECAY_DELAY - 10);
    expect(r.a.res.heat).toBe(60);
    r.run(200);
    expect(r.a.res.heat).toBeLessThan(60);
  });

  it('at 50%+ heat smashes get super-armor that absorbs even a strong hit; below it usmash/dsmash have none', () => {
    const hot = rig(26);
    hot.a.res.heat = 60;
    hot.a.startMove('usmash', null, hot.world);
    hot.run(8);
    expect(hot.a.armorThreshold()).toBe(Infinity);
    // deliver a strong 18-damage hit straight into the armor window
    const hb = brick.moves.fsmash.hitboxes[0];
    deliverHit(hot.world, { atk: hot.b, ownerId: 1, def: hot.a, hb, damage: 18, facing: -1, originX: hot.b.x, kbMult: 1 });
    expect(hot.events).toContain('armorHit');
    expect(hot.a.state).toBe('attack'); // not interrupted
    expect(hot.a.damage).toBeCloseTo(18);

    const cold = rig(26);
    cold.a.res.heat = 20;
    cold.a.startMove('usmash', null, cold.world);
    cold.run(8);
    expect(cold.a.armorThreshold()).toBeLessThan(18); // only Tough Guy
    deliverHit(cold.world, { atk: cold.b, ownerId: 1, def: cold.a, hb, damage: 18, facing: -1, originX: cold.b.x, kbMult: 1 });
    expect(cold.events).not.toContain('armorHit');
    expect(cold.a.state).toBe('hitstun');
  });

  it('hot smashes deal +15% damage', () => {
    const dmg = (heat: number): number => {
      const r = rig(26);
      r.a.res.heat = heat;
      r.a.startMove('usmash', null, r.world);
      r.run(40);
      return r.b.damage;
    };
    expect(dmg(60) / dmg(0)).toBeCloseTo(1.15, 2);
  });

  it('Vent needs Heat, spends all of it, and hits much harder at 100% than at 30%', () => {
    const none = rig(26);
    none.a.res.heat = 10;
    expect(none.a.startMove('downB', null, none.world)).toBe(false);

    const run = (heat: number): { dmg: number; speed: number; left: number } => {
      const r = rig(26);
      r.a.res.heat = heat;
      expect(r.a.startMove('downB', null, r.world)).toBe(true);
      expect(r.a.res.heat).toBe(0);
      let speed = 0;
      r.world.listener = (t, f) => {
        if (t === 'hit' && f === r.b) speed = Math.hypot(r.b.vx, r.b.vy);
      };
      r.run(40);
      return { dmg: r.b.damage, speed, left: r.a.res.heat };
    };
    const small = run(30);
    const big = run(100);
    expect(big.dmg).toBeGreaterThan(small.dmg * 1.5);
    expect(big.speed).toBeGreaterThan(small.speed * 1.3);
  });

  it('Vent explosion pushes enemies away on both sides', () => {
    const r = rig(26);
    r.a.res.heat = 100;
    r.a.startMove('downB', null, r.world);
    r.run(30);
    expect(r.b.x).toBeGreaterThan(r.a.x); // b was on the right and got pushed further right
  });
});

describe('Charge Shoulder', () => {
  it('charges while Special is held; only a full charge breaks shields and has armor', () => {
    const full = rig(40);
    full.a.startMove('neutralB', null, full.world);
    full.run(70, inp({ held: Button.Special }), inp({ held: Button.Shield }));
    expect(full.a.chargeFrames).toBe(50);
    const sawArmor = (() => {
      for (let i = 0; i < 40 && full.a.state === 'attack'; i++) {
        full.tick(inp(), inp({ held: Button.Shield }));
        if (full.a.armorThreshold() === Infinity) return true;
      }
      return false;
    })();
    expect(sawArmor).toBe(true);

    const f2 = rig(40);
    f2.a.startMove('neutralB', null, f2.world);
    f2.run(70, inp({ held: Button.Special }), inp({ held: Button.Shield }));
    f2.run(40, inp(), inp({ held: Button.Shield }));
    expect(f2.events).toContain('shieldBreak');

    const none = rig(40);
    none.a.startMove('neutralB', null, none.world); // no charge
    none.run(60, inp(), inp({ held: Button.Shield }));
    expect(none.events).not.toContain('shieldBreak');
    expect(none.events).toContain('shieldHit');
    expect(none.a.armorThreshold()).toBeLessThan(10); // only Tough Guy
  });

  it('Shield mid-charge banks the charge; the next one starts from it (Giant Punch)', () => {
    const r = rig(120);
    r.tick(press(Button.Special));
    r.run(40, inp({ held: Button.Special }));
    expect(r.a.chargeFrames).toBeGreaterThan(30);
    r.tick(press(Button.Shield));
    expect(r.a.state).not.toBe('attack');
    const banked = r.a.res.punch;
    expect(banked).toBeGreaterThan(30);
    r.run(30);
    // fire it from a standstill: the charge picks up where it stopped, no need to hold
    r.tick(press(Button.Special));
    expect(r.a.move?.id).toBe('neutralB');
    expect(r.a.chargeFrames).toBe(banked);
    expect(r.a.res.punch).toBe(0);
  });

  it('a fully banked charge comes out at once, armored', () => {
    const r = rig(40);
    r.a.res.punch = brick.moves.neutralB.charge!.max;
    r.tick(press(Button.Special));
    let armored = false;
    for (let i = 0; i < 30; i++) {
      r.tick(inp(), inp({ held: Button.Shield }));
      if (r.a.armorThreshold() === Infinity) armored = true;
    }
    expect(armored).toBe(true);
    r.run(30, inp(), inp({ held: Button.Shield }));
    expect(r.events).toContain('shieldBreak');
  });

  it('a charged ram hits harder than an uncharged one', () => {
    const dmg = (hold: number): number => {
      const r = rig(40);
      r.a.startMove('neutralB', null, r.world);
      r.run(hold, inp({ held: Button.Special }));
      r.run(60);
      return r.b.damage;
    };
    expect(dmg(60)).toBeGreaterThan(dmg(0) * 1.2);
  });
});

describe('Grapple Slam', () => {
  it('grabs and slams a grounded opponent for the slam damage, even through a shield', () => {
    const r = rig(30);
    r.a.startMove('sideB', null, r.world);
    r.run(80);
    expect(r.b.damage).toBeCloseTo(brick.moves.slam.hitboxes[0].damage, 0);
    expect(r.events).toContain('grab');
    expect(r.events).toContain('throw');

    const s = rig(30);
    s.tick(inp(), press(Button.Shield));
    s.a.startMove('sideB', null, s.world);
    s.run(80, inp(), inp({ held: Button.Shield }));
    expect(s.b.damage).toBeCloseTo(brick.moves.slam.hitboxes[0].damage, 0);
  });

  it('can be avoided by being in the air', () => {
    const r = rig(30);
    r.b.hover = true;
    r.b.y = -34;
    r.b.grounded = false;
    r.b.groundPlat = null;
    r.b.setState('air');
    r.a.startMove('sideB', null, r.world);
    r.run(60);
    expect(r.events).not.toContain('grab');
    expect(r.b.damage).toBe(0);
  });

  it('has long whiff recovery (risky)', () => {
    expect(moveTotal(brick.moves.sideB)).toBeGreaterThanOrEqual(45);
  });
});

describe('Whirling Jet', () => {
  it('in the air: a fast spinning climb that hits several times, then helpless', () => {
    const r = rig(400);
    r.a.spawn(300, -200, -1); // well away from everything
    r.a.grounded = false;
    r.a.setState('air');
    r.tick(press(Button.Special, { stickY: -1 }));
    expect(r.a.move?.id).toBe('upB');
    let top = r.a.y;
    for (let i = 0; i < 120; i++) {
      r.tick();
      top = Math.min(top, r.a.y);
    }
    expect(-200 - top).toBeGreaterThan(40);
    expect(r.a.helpless).toBe(true);
    expect(brick.moves.upB.startup).toBeLessThanOrEqual(6);
  });

  it('on the ground: an intangible-start spin that travels and leaves Brick free to act', () => {
    const r = rig(200);
    const x0 = r.a.x;
    r.tick(press(Button.Special, { stickY: -1 }));
    expect(r.a.move?.id).toBe('upB_g');
    expect(brick.moves.upB_g.invuln![0]).toBe(1);
    r.run(60);
    expect(Math.abs(r.a.x - x0)).toBeGreaterThan(20);
    expect(r.a.grounded).toBe(true);
    expect(r.a.helpless).toBe(false);
  });

  it('works out of shield', () => {
    const r = rig(30);
    r.run(10, inp({ held: Button.Shield }));
    expect(r.a.state).toBe('shield');
    r.tick(inp({ held: Button.Shield | Button.Special, pressed: Button.Special, stickY: -1 }));
    expect(r.a.move?.id).toBe('upB_g');
    r.run(30);
    expect(r.b.damage).toBeGreaterThan(5);
  });
});

describe('Tough Guy', () => {
  it('light hits do not flinch Brick (he still takes the damage); real hits do', () => {
    const r = rig(26);
    const jab = { ...brick.moves.jab1.hitboxes[0], damage: 2 };
    deliverHit(r.world, { atk: r.b, ownerId: 1, def: r.a, hb: jab, damage: 2, facing: -1, originX: r.b.x, kbMult: 1 });
    expect(r.events).toContain('armorHit');
    expect(r.a.state).not.toBe('hitstun');
    expect(r.a.damage).toBeCloseTo(2);
    const big = brick.moves.ftilt.hitboxes[0];
    deliverHit(r.world, { atk: r.b, ownerId: 1, def: r.a, hb: big, damage: 8, facing: -1, originX: r.b.x, kbMult: 1 });
    expect(r.a.state).toBe('hitstun');
  });

  it('hot Brick shrugs off more', () => {
    const r = rig(26);
    r.a.res.heat = 70;
    r.tick();
    expect(r.a.armorThreshold()).toBeGreaterThan(brick.toughness! * 1.8);
  });
});

describe('Meltdown', () => {
  it('needs a full meter, plays the cinematic, and KOs at 0%', () => {
    const r = rig(26);
    r.tick(press(Button.Ultimate));
    expect(r.a.move?.id).not.toBe('ultimate'); // not enough meter: it taunts instead
    for (let i = 0; i < 70; i++) r.tick();
    r.a.meter = 100;
    r.a.res.heat = 80;
    r.tick(press(Button.Ultimate));
    expect(r.a.meter).toBe(0);
    for (let i = 0; i < 40 && !r.world.cinematic; i++) r.tick();
    expect(r.world.cinematic).not.toBeNull();
    expect(r.a.res.heat).toBe(0); // overloaded
    let ko = false;
    r.world.listener = (t, f) => {
      if (t === 'ko' && f === r.b) ko = true;
    };
    r.run(500);
    expect(r.b.damage).toBeCloseTo(30);
    expect(ko).toBe(true);
  });
});

describe('Brick identity', () => {
  it('is heavy, slow, falls fast and has a short double jump', () => {
    const s = brick.stats;
    expect(s.weight).toBe(120);
    expect(s.runSpeed).toBeLessThan(2.1);
    expect(s.airSpeed).toBeLessThanOrEqual(1.6); // still the slowest in the air, but enough drift to recover
    expect(s.fallSpeed).toBeGreaterThanOrEqual(8);
    expect(s.gravity).toBeGreaterThanOrEqual(0.6);
    expect(s.doubleJumps).toBe(1);
    expect(s.doubleJumpHeight).toBeLessThan(s.jumpHeight * 0.75);
  });

  it('smashes are slow but armored (fsmash slowest); his quick options are quick', () => {
    const smashes = ['fsmash', 'usmash', 'dsmash'].map((id) => brick.moves[id]);
    for (const m of smashes) expect(m.startup).toBeGreaterThanOrEqual(12);
    expect(brick.moves.fsmash.startup).toBeGreaterThan(brick.moves.usmash.startup);
    expect(brick.moves.fsmash.armor).toBeDefined();
    expect(brick.moves.jab1.startup).toBeLessThanOrEqual(4);
    expect(brick.moves.nair.startup).toBeLessThanOrEqual(5);
    expect(brick.moves.upB.startup).toBeLessThanOrEqual(6);
  });
});

describe('Brick CPU', () => {
  it('banks a full Charge Shoulder while the rival is far away', async () => {
    const { CpuController } = await import('../src/ai/cpu');
    const r = rig(320);
    const cpu = new CpuController(3, 7);
    const ia = inp();
    let banked = 0;
    for (let i = 0; i < 900 && banked < 50; i++) {
      Object.assign(ia, makeInput());
      cpu.update(r.a, r.world, ia);
      r.b.x = r.a.x + 320 * (r.a.x < 0 ? 1 : -1); // keep the rival out of reach
      r.tick(ia);
      banked = Math.max(banked, r.a.res.punch);
    }
    expect(banked).toBe(50);
  });
});

describe('Brick CPU out of shield', () => {
  it('answers a rival next to its shield with the ground Whirling Jet', async () => {
    const { CpuController } = await import('../src/ai/cpu');
    let spun = false;
    for (let seed = 1; seed <= 6 && !spun; seed++) {
      const r = rig(28);
      const cpu = new CpuController(3, seed);
      const ia = inp();
      for (let i = 0; i < 40 && !spun; i++) {
        if (r.a.state !== 'attack') {
          r.a.setState('shield'); // holding shield as the rival's move ends
          r.a.shieldHP = 50;
        }
        Object.assign(ia, makeInput());
        cpu.update(r.a, r.world, ia);
        r.tick(ia);
        if (r.a.move?.id === 'upB_g') spun = true;
      }
    }
    expect(spun).toBe(true);
  });
});
