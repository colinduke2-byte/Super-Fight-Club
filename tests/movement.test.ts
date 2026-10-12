import { describe, expect, it } from 'vitest';
import { agni } from '../src/characters/agni';
import { brick } from '../src/characters/brick';
import { Button, makeInput, type FighterInput } from '../src/engine/buttons';
import { DASH_SPEED_MULT, Fighter, INITIAL_DASH_FRAMES } from '../src/engine/fighter';
import type { CharacterData } from '../src/engine/types';
import { World } from '../src/engine/world';
import { sandboxStage } from '../src/stages/sandbox';

function setup(data: CharacterData = brick): { world: World; f: Fighter } {
  const world = new World(sandboxStage);
  const f = new Fighter(0, data);
  world.addFighter(f);
  f.spawn(0, -2);
  for (let i = 0; i < 40; i++) world.step([makeInput()]);
  f.invuln = 0;
  return { world, f };
}

const inp = (o: Partial<FighterInput> = {}): FighterInput => ({ ...makeInput(), ...o });
const step = (world: World, i: FighterInput, n = 1): void => {
  for (let k = 0; k < n; k++) world.step([i]);
};

describe('ground movement: initial dash, dash-dance, skid', () => {
  it('a flick bursts into an initial dash faster than the run, then settles to run speed', () => {
    const { world, f } = setup();
    const run = f.stats.runSpeed;
    step(world, inp({ stickX: 1 }), 3);
    expect(f.dashTimer).toBeGreaterThan(0);
    expect(f.anim).toBe('dash');
    expect(f.vx).toBeGreaterThan(run);
    expect(f.vx).toBeLessThanOrEqual(run * DASH_SPEED_MULT + 1e-6);
    step(world, inp({ stickX: 1 }), INITIAL_DASH_FRAMES + 8);
    expect(f.dashTimer).toBe(0);
    expect(f.vx).toBeCloseTo(run, 1);
    expect(f.anim).toBe('run');
  });

  it('flicking back inside the dash turns on the spot (dash-dance)', () => {
    const { world, f } = setup();
    step(world, inp({ stickX: 1 }), 4);
    expect(f.facing).toBe(1);
    step(world, inp({ stickX: 0 }), 1);
    step(world, inp({ stickX: -1 }), 1);
    expect(f.facing).toBe(-1);
    expect(f.vx).toBeLessThan(-f.stats.runSpeed * 0.7);
    expect(f.dashTimer).toBeGreaterThan(0);
  });

  it('a gentle tilt walks instead of dashing', () => {
    const { world, f } = setup();
    step(world, inp({ stickX: 0.3 }), 20);
    expect(f.dashTimer).toBe(0);
    expect(f.vx).toBeGreaterThan(0);
    expect(f.vx).toBeLessThan(f.stats.runSpeed * 0.5);
  });

  it('turning against a full run skids before the facing flips', () => {
    const { world, f } = setup(agni);
    step(world, inp({ stickX: 1 }), 30);
    expect(f.facing).toBe(1);
    step(world, inp({ stickX: 0.9 }), 1); // ease off the flick threshold so the turn is a hold, not a new dash
    step(world, inp({ stickX: -0.7 }), 1);
    expect(f.skidding).toBe(true);
    expect(f.facing).toBe(1);
    expect(f.anim).toBe('skid');
    step(world, inp({ stickX: -0.7 }), 20);
    expect(f.facing).toBe(-1);
    expect(f.vx).toBeLessThan(0);
  });

  it('jumping out of a dash keeps the dash momentum (a dash jump flies further than a standing one)', () => {
    const travel = (dash: boolean): number => {
      const { world, f } = setup();
      const x0 = f.x;
      if (dash) step(world, inp({ stickX: 1 }), 5);
      step(world, inp({ stickX: 1, pressed: Button.Jump, held: Button.Jump }), 1);
      step(world, inp({ stickX: 1, held: Button.Jump }), 10);
      step(world, inp({ stickX: 1 }), 20);
      return f.x - x0;
    };
    expect(travel(true)).toBeGreaterThan(travel(false));
  });

  it('flick then Attack a few frames later is still a forward smash out of the dash', () => {
    const { world, f } = setup();
    step(world, inp({ stickX: 1 }), 2);
    step(world, inp({ stickX: 1, pressed: Button.Attack, held: Button.Attack }), 1);
    expect(f.state).toBe('attack');
    expect(f.move?.kind).toBe('smash');
  });
});

describe('air: fast-fall aerials', () => {
  it('a fresh down flick during a falling aerial fast-falls it, and a fast fall carries into an aerial', () => {
    const { world, f } = setup(agni);
    f.y = f.prevY = -200;
    f.grounded = false;
    f.groundPlat = null;
    f.setState('air');
    f.vy = 1;
    step(world, inp({ pressed: Button.Attack, held: Button.Attack }), 1);
    expect(f.move?.id).toBe('nair');
    step(world, inp({ stickY: 1 }), 1);
    expect(f.fastFalling).toBe(true);
    expect(f.vy).toBeGreaterThan(f.stats.fallSpeed);

    const g = setup(agni);
    g.f.y = g.f.prevY = -200;
    g.f.grounded = false;
    g.f.groundPlat = null;
    g.f.setState('air');
    g.f.vy = 1;
    step(g.world, inp({ stickY: 1 }), 1);
    expect(g.f.fastFalling).toBe(true);
    step(g.world, inp({ stickY: 1, pressed: Button.Attack, held: Button.Attack }), 1);
    step(g.world, inp({ stickY: 1 }), 2);
    expect(g.f.state).toBe('attack');
    expect(g.f.vy).toBeGreaterThan(g.f.stats.fallSpeed); // previously the aerial capped the fall back to normal speed
  });
});

describe('hitstun canceling', () => {
  const launched = (hitstun: number) => {
    const { world, f } = setup(agni);
    f.y = f.prevY = -150;
    f.grounded = false;
    f.groundPlat = null;
    f.launch(0, -2, hitstun);
    return { world, f };
  };

  it('out of a big launch an aerial is allowed early, an air dodge a little earlier', () => {
    const { world, f } = launched(90);
    step(world, inp(), 30);
    step(world, inp({ pressed: Button.Attack, held: Button.Attack }), 1);
    expect(f.state).toBe('hitstun'); // too early
    step(world, inp(), 15);
    step(world, inp({ pressed: Button.Attack, held: Button.Attack }), 1);
    expect(f.state).toBe('attack');

    const d = launched(90);
    step(d.world, inp(), 41);
    step(d.world, inp({ pressed: Button.Shield, held: Button.Shield }), 1);
    expect(d.f.state).toBe('airdodge');
  });

  it('short combo hitstun cannot be canceled', () => {
    const { world, f } = launched(28);
    for (let i = 0; i < 27; i++) step(world, inp({ pressed: Button.Attack, held: Button.Attack }), 1);
    expect(f.state).toBe('hitstun');
  });
});

describe('specials: turnarounds', () => {
  it('a side special goes the way the stick points', () => {
    const { world, f } = setup(agni);
    expect(f.facing).toBe(1);
    step(world, inp({ stickX: -1, pressed: Button.Special, held: Button.Special }), 1);
    expect(f.move?.id.startsWith('sideB')).toBe(true);
    expect(f.facing).toBe(-1);
  });

  it('a back flick right after a neutral special turns it around (B-reverse) and flips the air drift', () => {
    const { world, f } = setup(agni);
    f.y = f.prevY = -200;
    f.grounded = false;
    f.groundPlat = null;
    f.setState('air');
    f.vx = 2;
    step(world, inp({ pressed: Button.Special, held: Button.Special }), 1);
    expect(f.move?.kind).toBe('special');
    step(world, inp({ stickX: -1 }), 1);
    expect(f.facing).toBe(-1);
    expect(f.vx).toBeLessThan(0);
  });
});

describe('getup options after a missed tech', () => {
  const downed = () => {
    const { world, f } = setup(agni);
    f.setState('downed');
    f.vx = 0;
    step(world, inp(), 6);
    return { world, f };
  };
  it('the stick rolls away, Jump stands straight up with a moment of invincibility', () => {
    const r = downed();
    const x0 = r.f.x;
    step(r.world, inp({ stickX: -1 }), 1);
    expect(r.f.state).toBe('roll');
    step(r.world, inp(), 20);
    expect(r.f.x).toBeLessThan(x0 - 20);

    const s = downed();
    step(s.world, inp({ pressed: Button.Jump, held: Button.Jump }), 1);
    expect(s.f.state).toBe('idle');
    expect(s.f.invuln).toBeGreaterThan(0);
  });
});

describe('clank', () => {
  function duel() {
    const world = new World(sandboxStage);
    const a = new Fighter(0, agni);
    const b = new Fighter(1, agni);
    world.addFighter(a);
    world.addFighter(b);
    a.spawn(-20, -2, 1);
    b.spawn(20, -2, -1);
    for (let i = 0; i < 40; i++) world.step([inp(), inp()]);
    a.invuln = b.invuln = 0;
    const events: string[] = [];
    world.listener = (t) => events.push(t);
    return { world, a, b, events };
  }

  it('two equal grounded attacks meeting cancel out: a clank, both rebound, nobody is hurt', () => {
    const { world, a, b, events } = duel();
    // place them so the two forward tilts meet in the middle before either reaches the other's body
    const reach = Math.max(...a.data.moves.ftilt.hitboxes.map((h) => h.x + h.w / 2));
    a.x = a.prevX = -reach * 0.9;
    b.x = b.prevX = reach * 0.9;
    world.step([inp({ stickX: 0.6, pressed: Button.Attack, held: Button.Attack }), inp({ stickX: -0.6, pressed: Button.Attack, held: Button.Attack })]);
    for (let i = 0; i < 20 && !events.includes('clank'); i++) world.step([inp(), inp()]);
    expect(events).toContain('clank');
    expect(a.damage).toBe(0);
    expect(b.damage).toBe(0);
    expect(a.state === 'landing' || a.hitlag > 0).toBe(true);
    expect(a.move).toBeNull();
    expect(b.move).toBeNull();
  });
});

describe('short-hop aerial shortcut', () => {
  it('Jump + Attack together (Jump still held) short hops straight into an aerial', () => {
    const { world, f } = setup(agni);
    step(world, inp({ pressed: Button.Jump | Button.Attack, held: Button.Jump | Button.Attack }), 1);
    let minY = f.y;
    let aerial = false;
    for (let i = 0; i < 40; i++) {
      step(world, inp({ held: Button.Jump }), 1);
      minY = Math.min(minY, f.y);
      if (f.move?.kind === 'aerial') aerial = true;
    }
    expect(aerial).toBe(true);
    expect(-minY).toBeLessThan(f.stats.shortHopHeight * 1.2);
  });
});

describe('hit confirm: landed normals recover faster', () => {
  const framesToAct = (withTarget: boolean, shield = false): number => {
    const world = new World(sandboxStage);
    const a = new Fighter(0, agni);
    const b = new Fighter(1, agni);
    world.addFighter(a);
    world.addFighter(b);
    a.spawn(0, -2, 1);
    b.spawn(withTarget ? 22 : 400, -2, -1);
    for (let i = 0; i < 40; i++) world.step([inp(), inp()]);
    a.invuln = b.invuln = 0;
    const hold = shield ? inp({ held: Button.Shield }) : inp();
    if (shield) for (let i = 0; i < 6; i++) world.step([inp(), hold]);
    world.step([inp({ stickX: 0.6, pressed: Button.Attack, held: Button.Attack }), hold]);
    expect(a.move?.id).toBe('ftilt');
    let n = 1;
    while (a.state === 'attack' && n < 120) {
      const frozen = a.hitlag > 0; // hit-stop frames do not count
      world.step([inp(), hold]);
      if (!frozen) n++;
    }
    return n;
  };

  it('a forward tilt that hits ends sooner than a whiff; a shielded one keeps its full recovery', () => {
    const whiff = framesToAct(false);
    const hit = framesToAct(true);
    const shielded = framesToAct(true, true);
    expect(hit).toBeLessThan(whiff - 4);
    expect(shielded).toBeGreaterThan(hit);
  });
});
