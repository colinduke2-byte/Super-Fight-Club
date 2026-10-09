import { describe, expect, it } from 'vitest';
import { brick } from '../src/characters/brick';
import { Button, makeInput, type FighterInput } from '../src/engine/buttons';
import { Fighter } from '../src/engine/fighter';
import { World } from '../src/engine/world';
import { sandboxStage } from '../src/stages/sandbox';

function setup(): { world: World; f: Fighter } {
  const world = new World(sandboxStage);
  const f = new Fighter(0, brick);
  world.addFighter(f);
  f.spawn(0, -2);
  return { world, f };
}

function input(over: Partial<FighterInput> = {}): FighterInput {
  return { ...makeInput(), ...over };
}

/** Steps the world; `script(i)` returns the input for tick i. */
function run(world: World, ticks: number, script: (i: number) => FighterInput = () => input()): void {
  for (let i = 0; i < ticks; i++) world.step([script(i)]);
}

describe('movement physics', () => {
  it('falls and lands on the main platform', () => {
    const { world, f } = setup();
    run(world, 30);
    expect(f.grounded).toBe(true);
    expect(f.y).toBeCloseTo(0);
    expect(['idle', 'landing']).toContain(f.state);
  });

  it('a held jump reaches roughly the configured full-hop height', () => {
    const { world, f } = setup();
    run(world, 30);
    let minY = 0;
    for (let i = 0; i < 60; i++) {
      world.step([i === 0 ? input({ held: Button.Jump, pressed: Button.Jump }) : input({ held: Button.Jump })]);
      minY = Math.min(minY, f.y);
    }
    const rise = -minY;
    expect(rise).toBeGreaterThan(brick.stats.jumpHeight * 0.9);
    expect(rise).toBeLessThan(brick.stats.jumpHeight * 1.15);
  });

  it('releasing jump during jumpsquat gives a short hop', () => {
    const { world, f } = setup();
    run(world, 30);
    let minY = 0;
    for (let i = 0; i < 60; i++) {
      world.step([i === 0 ? input({ held: Button.Jump, pressed: Button.Jump }) : input()]);
      minY = Math.min(minY, f.y);
    }
    const rise = -minY;
    expect(rise).toBeGreaterThan(brick.stats.shortHopHeight * 0.85);
    expect(rise).toBeLessThan(brick.stats.shortHopHeight * 1.2);
  });

  it('buffers a jump pressed up to 6 frames before landing', () => {
    const { world, f } = setup();
    // drop from above and press jump while still ~8px up; the buffered press fires on touchdown
    f.spawn(0, -40);
    let pressedAt = -1;
    let minY = 0;
    for (let i = 0; i < 40; i++) {
      const nearGround = f.y > -8 && pressedAt < 0;
      if (nearGround) pressedAt = i;
      world.step([nearGround ? input({ pressed: Button.Jump, held: Button.Jump }) : input({ held: pressedAt >= 0 ? Button.Jump : 0 })]);
      if (pressedAt >= 0) minY = Math.min(minY, f.y);
    }
    expect(pressedAt).toBeGreaterThan(0);
    expect(minY).toBeLessThan(-20); // left the ground again without a second press
  });

  it('allows a coyote jump just after walking off the edge, but not long after', () => {
    for (const [delay, shouldJump] of [[3, true], [20, false]] as const) {
      const { world, f } = setup();
      f.spawn(150, 0);
      run(world, 5);
      // walk right off the ledge
      let offAt = -1;
      for (let i = 0; i < 60 && offAt < 0; i++) {
        world.step([input({ stickX: 1 })]);
        if (!f.grounded) offAt = i;
      }
      expect(offAt).toBeGreaterThanOrEqual(0);
      // let `delay` ticks pass, then press jump (tap-jump style: no held button -> short hop)
      run(world, delay, () => input({ stickX: 1 }));
      const jumpsBefore = f.jumpsLeft;
      world.step([input({ stickX: 1, pressed: Button.Jump, held: Button.Jump })]);
      if (shouldJump) {
        expect(f.jumpsLeft).toBe(jumpsBefore); // ground-jump, double jump not spent
        expect(f.vy).toBeLessThan(0);
      } else {
        expect(f.jumpsLeft).toBe(jumpsBefore - 1); // spent the double jump
      }
    }
  });

  it('has exactly doubleJumps extra jumps in the air', () => {
    const { world, f } = setup();
    run(world, 30);
    const press = (): FighterInput => input({ pressed: Button.Jump, held: Button.Jump });
    world.step([press()]);
    run(world, 12); // through jumpsquat, rising
    expect(f.jumpsLeft).toBe(1);
    world.step([press()]);
    expect(f.jumpsLeft).toBe(0);
    const vy = f.vy;
    run(world, 3);
    world.step([press()]);
    expect(f.vy).toBeGreaterThan(vy); // no third jump: still decelerating under gravity
    expect(f.jumpsLeft).toBe(0);
  });

  it('fast-fall requires a fresh down flick and raises fall speed', () => {
    const { world, f } = setup();
    f.spawn(400, -300); // well off the stage so it keeps falling
    run(world, 40);
    expect(f.vy).toBeCloseTo(brick.stats.fallSpeed);
    world.step([input({ stickY: 1 })]);
    expect(f.fastFalling).toBe(true);
    expect(f.vy).toBeCloseTo(brick.stats.fastFallSpeed);
  });

  it('drops through a pass-through platform with down + jump, but a plain jump goes up through it', () => {
    const { world, f } = setup();
    f.spawn(-93, -70); // above left pass platform (top y=-68)
    run(world, 20);
    expect(f.grounded).toBe(true);
    expect(f.y).toBeCloseTo(-68);
    world.step([input({ stickY: 1, held: Button.Jump, pressed: Button.Jump })]);
    run(world, 25);
    expect(f.y).toBeGreaterThan(-60); // fell through, probably landed on main stage (y=0)
    // now jump up through it from below
    f.spawn(-93, 0);
    run(world, 10);
    for (let i = 0; i < 40; i++) world.step([i === 0 ? input({ held: Button.Jump, pressed: Button.Jump }) : input({ held: Button.Jump })]);
    expect(f.y).toBeLessThan(-30);
  });

  it('is carried by a moving platform', () => {
    const { world, f } = setup();
    const mover = world.platforms[3];
    f.spawn(mover.x + mover.w / 2, mover.y - 30);
    run(world, 20);
    expect(f.grounded).toBe(true);
    expect(f.groundPlat).toBe(mover);
    const x0 = f.x;
    const px0 = mover.x;
    run(world, 40);
    expect(f.groundPlat).toBe(mover);
    expect(f.x - x0).toBeCloseTo(mover.x - px0, 3);
  });

  it('stops at the edge of a solid block and cannot walk through the stage side', () => {
    const { world, f } = setup();
    f.spawn(-250, 20); // beside the main block, below its top
    run(world, 5);
    run(world, 60, () => input({ stickX: 1 }));
    expect(f.x + f.hw).toBeLessThanOrEqual(-160 + 0.01);
  });
});

describe('ledge', () => {
  it('grabs the ledge, gets invincibility, climbs up; later grabs give less invincibility', () => {
    const { world, f } = setup();
    // fall past the right ledge (x=160, y=0) facing the stage
    f.spawn(170, -10);
    f.facing = -1;
    let grabbed = false;
    for (let i = 0; i < 60 && !grabbed; i++) {
      world.step([input({ stickX: -0.1 })]);
      grabbed = f.state === 'ledge';
    }
    expect(grabbed).toBe(true);
    expect(f.invuln).toBeGreaterThan(40);
    const first = f.invuln;
    run(world, 12);
    world.step([input({ stickY: -1 })]); // up -> climb
    expect(f.state).toBe('ledgeClimb');
    run(world, 30);
    expect(f.grounded).toBe(true);
    expect(f.x).toBeLessThan(160);

    // chain grabs without touching ground: invincibility shrinks
    const g = setup();
    g.f.spawn(170, -10);
    g.f.facing = -1;
    const invs: number[] = [];
    for (let k = 0; k < 3; k++) {
      for (let i = 0; i < 80 && g.f.state !== 'ledge'; i++) g.world.step([input({ stickX: -0.1 })]);
      invs.push(g.f.invuln);
      run(g.world, 12);
      g.world.step([input({ stickY: 1 })]); // drop
      run(g.world, 31, () => input()); // wait out the re-grab cooldown, then get back beside the ledge
      g.f.x = 172;
      g.f.y = -10;
      g.f.vy = 0;
      g.f.facing = -1;
      run(g.world, 1);
    }
    expect(invs[1]).toBeLessThan(invs[0]);
    expect(invs[2]).toBeLessThan(invs[1]);
    expect(first).toBe(invs[0]);
  });

  it('only one fighter can hang on a ledge at a time', () => {
    const world = new World(sandboxStage);
    const a = new Fighter(0, brick);
    const b = new Fighter(1, brick);
    world.addFighter(a);
    world.addFighter(b);
    a.spawn(170, -10);
    a.facing = -1;
    b.spawn(172, -9);
    b.facing = -1;
    for (let i = 0; i < 60; i++) world.step([input({ stickX: -0.1 }), input({ stickX: -0.1 })]);
    const hanging = [a, b].filter((x) => x.state === 'ledge' || x.state === 'ledgeClimb').length;
    expect(hanging).toBeLessThanOrEqual(1);
  });

  it('auto-releases after the maximum hang time (anti-stall)', () => {
    const { world, f } = setup();
    f.spawn(170, -10);
    f.facing = -1;
    for (let i = 0; i < 40 && f.state !== 'ledge'; i++) world.step([input({ stickX: -0.1 })]);
    expect(f.state).toBe('ledge');
    run(world, 320);
    expect(f.state).not.toBe('ledge');
  });
});

describe('hitstun, bounce and tech', () => {
  it('knockback launches the fighter and bounces off the floor without a tech', () => {
    const { world, f } = setup();
    f.spawn(0, -60);
    f.damage = 60;
    f.receiveHit({ damage: 10, base: 60, scaling: 0.5, angle: -70, direction: 1 }, world);
    let bounced = 0;
    world.listener = (t) => {
      if (t === 'bounce') bounced++;
    };
    run(world, 60);
    expect(bounced).toBeGreaterThan(0);
  });

  it('a well-timed shield press techs the floor impact (no bounce, short invincibility)', () => {
    const { world, f } = setup();
    f.spawn(0, -60);
    f.damage = 60;
    f.receiveHit({ damage: 10, base: 60, scaling: 0.5, angle: -70, direction: 1 }, world);
    let bounced = 0;
    let teched = 0;
    world.listener = (t) => {
      if (t === 'bounce') bounced++;
      if (t === 'tech') teched++;
    };
    // press shield every few frames of the fall; first press buffers the tech window
    for (let i = 0; i < 40; i++) world.step([input({ pressed: i === 1 ? Button.Shield : 0, held: 0 })]);
    expect(teched).toBe(1);
    expect(bounced).toBe(0);
  });

  it('a heavy launch off the side reaches the blast zone and KOs', () => {
    const { world, f } = setup();
    run(world, 30);
    f.damage = 180;
    let ko = 0;
    world.listener = (t) => {
      if (t === 'ko') ko++;
    };
    f.receiveHit({ damage: 10, base: 60, scaling: 1.2, angle: 35, direction: 1 }, world);
    run(world, 400);
    expect(ko).toBe(1);
    expect(f.state).toBe('ko');
  });
});

describe('determinism', () => {
  function scripted(i: number): FighterInput {
    const sx = Math.sin(i * 0.05);
    const pressed = i % 37 === 0 ? Button.Jump : 0;
    return input({ stickX: sx > 0.3 ? 1 : sx < -0.3 ? -1 : 0, stickY: i % 91 < 6 ? 1 : 0, pressed, held: pressed });
  }
  function runHash(): number[] {
    const { world, f } = setup();
    const out: number[] = [];
    for (let i = 0; i < 1500; i++) {
      world.step([scripted(i)]);
      if (i % 100 === 0) out.push(world.hash());
      if (i === 700) f.receiveHit({ damage: 12, base: 40, scaling: 1, angle: 50, direction: -1 }, world);
    }
    return out;
  }
  it('identical inputs produce identical state on every run', () => {
    expect(runHash()).toEqual(runHash());
  });
});
