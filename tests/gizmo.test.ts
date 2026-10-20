import { describe, expect, it } from 'vitest';
import { brick } from '../src/characters/brick';
import { gizmo } from '../src/characters/gizmo';
import {
  canAfford, clampScrap, MECH_FRAMES, OVERCLOCK_COST, RECALL_REFUND, SCRAP_MAX, scrapFromDamage, UPGRADE_EFFECT, upgradeFromStick,
} from '../src/characters/gizmoScrap';
import { Button, makeInput, type FighterInput } from '../src/engine/buttons';
import { Fighter } from '../src/engine/fighter';
import { World, type WorldEventType } from '../src/engine/world';
import { sandboxStage } from '../src/stages/sandbox';

const inp = (o: Partial<FighterInput> = {}): FighterInput => ({ ...makeInput(), ...o });
const press = (b: number, o: Partial<FighterInput> = {}): FighterInput => inp({ pressed: b, held: b, ...o });

function rig(gap = 120, settle = true) {
  const world = new World(sandboxStage);
  const a = new Fighter(0, gizmo);
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

describe('Scrap economy (pure)', () => {
  it('scrap comes from damage dealt and is capped', () => {
    expect(scrapFromDamage(10)).toBeCloseTo(3);
    expect(scrapFromDamage(-5)).toBe(0);
    expect(clampScrap(100)).toBe(SCRAP_MAX);
    expect(clampScrap(-3)).toBe(0);
  });

  it('upgrade choice follows the stick: forward damage, back shield, neutral fire rate', () => {
    expect(upgradeFromStick(1, 1)).toBe('damage');
    expect(upgradeFromStick(-1, 1)).toBe('shield');
    expect(upgradeFromStick(0, 1)).toBe('fireRate');
    expect(upgradeFromStick(1, -1)).toBe('shield'); // facing left, stick right = back
    expect(UPGRADE_EFFECT.fireRate.fireRateMul).toBe(2);
    expect(UPGRADE_EFFECT.damage.damageMul).toBeGreaterThan(1.4);
    expect(UPGRADE_EFFECT.shield.shield).toBeGreaterThan(0);
  });

  it('affordability', () => {
    expect(canAfford(OVERCLOCK_COST)).toBe(true);
    expect(canAfford(OVERCLOCK_COST - 0.1)).toBe(false);
  });
});

describe('Gizmo identity', () => {
  it('is mid-weight with a single double jump and a small low-profile hurtbox', () => {
    expect(gizmo.stats.weight).toBe(88);
    expect(gizmo.stats.doubleJumps).toBe(1);
    expect(gizmo.body.height).toBeLessThan(brick.body.height);
    expect(gizmo.body.height).toBeLessThanOrEqual(25);
  });

  it('is weak without setup: normals are modest', () => {
    expect(Math.max(...gizmo.moves.jab1.hitboxes.map((h) => h.damage))).toBeLessThan(3);
    expect(gizmo.moves.neutralB.hitboxes.length).toBe(0); // the turret does the work
  });
});

describe('Scrap in play', () => {
  it('gaining scrap from dealt damage, shown above Gizmo', () => {
    const r = rig(30);
    r.a.startMove('fsmash', null, r.world);
    r.run(70);
    expect(r.a.res.scrap).toBeGreaterThan(2);
    expect(r.a.res.scrapBar).toBeCloseTo((r.a.res.scrap / SCRAP_MAX) * 100);
    expect(gizmo.counter!.resource).toBe('scrap');
  });

  it('turret shots that land count too', () => {
    const r = rig(100);
    r.world.spawnDeployable(0, 'turret', r.a.x + 20, 0);
    r.run(200);
    expect(r.b.damage).toBeGreaterThan(0);
    expect(r.a.res.scrap).toBeGreaterThan(0);
  });

  it('a turret broken by an enemy refunds 3 scrap to its owner', () => {
    const r = rig(70);
    const t = r.world.spawnDeployable(0, 'turret', r.b.x - 24, 0)!;
    t.hp = 2;
    r.run(30);
    r.b.facing = -1;
    r.b.startMove('jab1', null, r.world);
    r.run(40);
    expect(t.active).toBe(false);
    expect(r.a.res.scrap).toBeGreaterThanOrEqual(3);
  });

  it('never exceeds the cap', () => {
    const r = rig(30);
    r.a.res.scrap = 39.9;
    r.a.startMove('fsmash', null, r.world);
    r.run(70);
    expect(r.a.res.scrap).toBe(SCRAP_MAX);
  });
});

describe('Turrets', () => {
  it('Turret Deploy places up to two; a third is refused', () => {
    const r = rig(300);
    for (let i = 0; i < 3; i++) {
      r.a.x = -100 + i * 40;
      r.a.startMove('neutralB', null, r.world);
      r.run(36);
    }
    expect(r.world.countDeployables(0, 'turret')).toBe(2);
  });

  it('fires slow projectiles at an enemy in range at its interval', () => {
    const r = rig(100);
    r.world.spawnDeployable(0, 'turret', r.a.x + 20, 0);
    let shots = 0;
    let speed = 0;
    r.world.listener = (t) => {
      if (t === 'projectile') {
        shots++;
        speed = Math.abs(r.world.projectiles.find((p) => p.active)!.vx);
      }
    };
    r.run(180);
    expect(shots).toBeGreaterThanOrEqual(2);
    expect(speed).toBeLessThan(3.5);
  });
});

describe('Overclock', () => {
  function withTurret() {
    const r = rig(300);
    r.world.spawnDeployable(0, 'turret', r.a.x + 30, 0);
    r.run(30);
    return r;
  }
  const overclock = (r: ReturnType<typeof rig>, stickX = 0, hold = 0): void => {
    r.tick(press(Button.Special, { stickY: 1 }));
    r.run(hold, inp({ held: Button.Special, stickY: 1, stickX }));
    r.run(24, inp({ stickX }));
  };

  it('spends scrap to boost nearby turrets: fire rate by default, damage forward, shield back', () => {
    const fr = withTurret();
    fr.a.res.scrap = 12;
    overclock(fr);
    const t = fr.world.findDeployables(0, 'turret')[0];
    expect(fr.a.res.scrap).toBeCloseTo(12 - OVERCLOCK_COST);
    expect(t.fireRateMul).toBe(2);

    const dm = withTurret();
    dm.a.res.scrap = 12;
    dm.tick(press(Button.Special, { stickY: 1, stickX: 1 }));
    dm.run(24, inp({ stickX: 1 }));
    expect(dm.world.findDeployables(0, 'turret')[0].damageMul).toBeGreaterThan(1.4);

    const sh = withTurret();
    sh.a.res.scrap = 12;
    sh.tick(press(Button.Special, { stickY: 1, stickX: -1 }));
    sh.run(24, inp({ stickX: -1 }));
    expect(sh.world.findDeployables(0, 'turret')[0].shield).toBeGreaterThan(0);
  });

  it('does nothing (and costs nothing) without enough scrap or without turrets', () => {
    const poor = withTurret();
    poor.a.res.scrap = 2;
    overclock(poor);
    expect(poor.a.res.scrap).toBe(2);
    expect(poor.world.findDeployables(0, 'turret')[0].fireRateMul).toBe(1);

    const none = rig(300);
    none.a.res.scrap = 20;
    overclock(none);
    expect(none.a.res.scrap).toBe(20);
  });

  it('the buff wears off after a few seconds', () => {
    const r = withTurret();
    r.a.res.scrap = 12;
    overclock(r);
    const t = r.world.findDeployables(0, 'turret')[0];
    expect(t.fireRateMul).toBe(2);
    r.run(430);
    expect(t.fireRateMul).toBe(1);
  });

  it('a boosted turret fires faster and a shielded turret survives hits it would not otherwise', () => {
    const shots = (boost: boolean): number => {
      const r = rig(100);
      const t = r.world.spawnDeployable(0, 'turret', r.a.x + 20, 0)!;
      if (boost) {
        t.fireRateMul = 2;
        t.modFrames = 1000;
      }
      let n = 0;
      r.world.listener = (ev) => { if (ev === 'projectile') n++; };
      r.run(240);
      return n;
    };
    expect(shots(true)).toBeGreaterThan(shots(false) * 1.5);
  });

  it('holding Overclock recalls turrets for a scrap refund', () => {
    const r = rig(300);
    r.world.spawnDeployable(0, 'turret', r.a.x + 30, 0);
    r.world.spawnDeployable(0, 'turret', r.a.x + 50, 0);
    r.run(30);
    r.a.res.scrap = 0;
    overclock(r, 0, 12);
    expect(r.world.countDeployables(0, 'turret')).toBe(0);
    expect(r.a.res.scrap).toBe(2 * RECALL_REFUND);
  });
});

describe('Rocket Fist', () => {
  it('flies out, returns, and can hit twice; only one at a time', () => {
    const r = rig(100);
    r.b.hover = true;
    let hits = 0;
    r.world.listener = (t, f) => { if (t === 'hit' && f === r.b) hits++; };
    r.tick(press(Button.Special, { stickX: 1 }));
    for (let i = 0; i < 90; i++) {
      r.b.vx = 0;
      r.tick();
      if (i === 8) {
        // second press while the fist is out is refused
        r.tick(press(Button.Special, { stickX: 1 }));
      }
    }
    expect(hits).toBeGreaterThanOrEqual(2);
    expect(r.world.projectiles.filter((p) => p.active && p.defId === 'fist').length).toBe(0);
  });

  it('the return trip hauls the opponent toward Gizmo', () => {
    const r = rig(100);
    r.a.startMove('sideB', null, r.world);
    r.run(100);
    expect(r.b.damage).toBeGreaterThan(9);
  });
});

describe('Grapple Tether (recovery)', () => {
  it('hooks a distant ledge with a wide cone and pulls Gizmo to it', () => {
    const r = rig(300, false);
    r.a.spawn(215, 55, -1); // well below and to the right of the right ledge (160, 0)
    r.run(2);
    r.a.startMove('upB', null, r.world);
    r.run(40);
    expect(r.a.state).toBe('ledge');
  });

  it('can grab an opponent mid-air instead', () => {
    const r = rig(300, false);
    r.a.spawn(130, -100, 1);
    r.b.spawn(150, -170, -1); // clear of the floating platforms
    r.b.invuln = 0;
    r.b.hover = true;
    r.run(2);
    r.a.startMove('upB', null, r.world);
    r.run(14);
    expect(r.events).toContain('tether');
    expect(r.a.state === 'holding' || r.b.state === 'grabbed' || r.a.state === 'tether').toBe(true);
  });

  it('is helpless if the hook finds nothing', () => {
    const r = rig(300, false);
    r.a.spawn(400, -300, 1);
    r.run(2);
    r.a.startMove('upB', null, r.world);
    r.run(50);
    expect(r.a.helpless).toBe(true);
  });
});

describe('Mega Mech Mode', () => {
  function mech() {
    const r = rig(120);
    r.a.meter = 100;
    r.tick(press(Button.Ultimate));
    r.run(30);
    return r;
  }

  it('lasts 8 seconds: bigger, super-armored, harder-hitting, then reverts', () => {
    const r = mech();
    expect(r.a.res.mech).toBeGreaterThan(MECH_FRAMES - 40);
    expect(r.a.res.mech).toBeLessThanOrEqual(MECH_FRAMES);
    expect(r.a.sizeMul).toBeGreaterThan(1.5);
    expect(r.a.superArmor).toBe(true);
    expect(r.a.damageMult).toBeGreaterThan(1.2);
    r.run(MECH_FRAMES);
    expect(r.a.res.mech).toBe(0);
    expect(r.a.sizeMul).toBe(1);
    expect(r.a.superArmor).toBe(false);
  });

  it('attacks are replaced by mech moves: punch, stomp, missiles', () => {
    const r = mech();
    r.run(20);
    r.tick(press(Button.Attack));
    expect(r.a.move?.id).toBe('mech_punch');
    r.run(40);
    r.tick(press(Button.Smash, { stickY: 1 }));
    expect(r.a.move?.id).toBe('mech_stomp');
    r.run(40);
    r.tick(press(Button.Special));
    expect(r.a.move?.id).toBe('mech_missiles');
    r.run(30);
    expect(r.events.filter((e) => e === 'projectile').length).toBe(3);
  });

  it('super armor: strong hits do not interrupt', () => {
    const r = mech();
    r.run(20);
    r.a.startMove('jab1', null, r.world);
    r.run(2);
    const before = r.a.damage;
    r.b.startMove('fsmash', null, r.world);
    r.b.x = r.a.x + 30;
    r.run(40);
    expect(r.a.state).not.toBe('hitstun');
    expect(r.a.damage).toBeGreaterThanOrEqual(before);
  });

  it('is easier to hit while big: the hurtbox grows with the suit', () => {
    const r = mech();
    r.run(10);
    expect(r.a.hurtH).toBeGreaterThan(gizmo.body.height * 1.5);
  });
});

describe('Gizmo fun pass', () => {
  it('jet hover: holding Jump at the top of a jump hangs Gizmo in the air until the fuel runs out', () => {
    const r = rig(120);
    r.tick(press(Button.Jump));
    let hung = 0;
    let lowest = -Infinity;
    for (let i = 0; i < 200; i++) {
      r.tick(inp({ held: Button.Jump }));
      if (r.a.jetting) hung++;
      if (i > 30 && i < 30 + gizmo.hover!.frames * 0.6) lowest = Math.max(lowest, r.a.y);
    }
    expect(hung).toBe(gizmo.hover!.frames);
    expect(r.a.grounded).toBe(true); // ran out and came down
    expect(lowest).toBeLessThan(-20); // stayed up during the hover
  });

  it('an aerial thrown from a hover keeps hovering', () => {
    const r = rig(120);
    r.tick(press(Button.Jump));
    for (let i = 0; i < 40; i++) r.tick(inp({ held: Button.Jump }));
    expect(r.a.jetting).toBe(true);
    const y = r.a.y;
    r.tick(inp({ held: Button.Jump | Button.Attack, pressed: Button.Attack }));
    expect(r.a.state).toBe('attack');
    r.run(12, inp({ held: Button.Jump }));
    expect(Math.abs(r.a.y - y)).toBeLessThan(1);
  });

  it('catching the returning Rocket Fist refunds Scrap and overcharges the next one', () => {
    const r = rig(120);
    r.b.spawn(-200, -1, 1); // behind Gizmo, out of the fist's way
    r.a.res.scrap = 0;
    r.tick(press(Button.Special, { stickX: 1 }));
    expect(r.a.move?.id).toBe('sideB');
    let caught = false;
    r.world.listener = (t, _f, _x, _y, _m, _e, tag) => {
      if (t === 'fx' && tag === 'catch') caught = true;
    };
    for (let i = 0; i < 120 && !caught; i++) r.tick();
    expect(caught).toBe(true);
    expect(r.a.res.scrap).toBeGreaterThan(1);
    expect(r.a.res.hotFist).toBe(1);
    r.run(10);
    r.tick(press(Button.Special, { stickX: 1 }));
    expect(r.a.move?.id).toBe('sideB_hot');
    r.run(14);
    expect(r.world.projectiles.some((p) => p.active && p.defId === 'fist_hot')).toBe(true);
    expect(r.a.res.hotFist).toBe(0);
  });

  it('can wall jump, and its specials come out quickly', () => {
    expect(gizmo.wallJump).toBe(true);
    expect(gizmo.moves.neutralB.startup).toBeLessThanOrEqual(11);
    expect(gizmo.moves.sideB.startup).toBeLessThanOrEqual(11);
  });

  it('the grapple tether never grabs a teammate', () => {
    const r = rig(60);
    r.a.team = 0;
    r.b.team = 0;
    r.b.spawn(r.a.x + 10, -40, -1);
    r.b.hover = true;
    r.a.startMove('upB', null, r.world);
    r.run(10);
    expect(r.b.state).not.toBe('grabbed');
  });
});
