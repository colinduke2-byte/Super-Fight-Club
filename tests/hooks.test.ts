import { beforeEach, describe, expect, it } from 'vitest';
import { Button, makeInput, type FighterInput } from '../src/engine/buttons';
import { Fighter } from '../src/engine/fighter';
import { parseMoves, validateReferences } from '../src/engine/moves';
import { World, type WorldEventType } from '../src/engine/world';
import { sandboxStage } from '../src/stages/sandbox';
import { hookLog, makeProto, protoJson } from './fixtures/protoChar';

const inp = (o: Partial<FighterInput> = {}): FighterInput => ({ ...makeInput(), ...o });
const press = (b: number, o: Partial<FighterInput> = {}): FighterInput => inp({ pressed: b, held: b, ...o });

interface Rig {
  world: World;
  a: Fighter;
  b: Fighter;
  events: WorldEventType[];
  tick: (ia?: FighterInput, ib?: FighterInput) => void;
  run: (n: number, ia?: FighterInput, ib?: FighterInput) => void;
}

/** Two proto fighters on the main platform (a left facing right, b right facing left), spawn protection gone. */
function rig(gap = 60, withBehavior = false, settle = true): Rig {
  const world = new World(sandboxStage);
  const data = makeProto(withBehavior);
  const a = new Fighter(0, data);
  const b = new Fighter(1, data);
  world.addFighter(a);
  world.addFighter(b);
  a.spawn(-gap / 2, -1, 1);
  b.spawn(gap / 2, -1, -1);
  const events: WorldEventType[] = [];
  world.listener = (t) => events.push(t);
  const tick = (ia = inp(), ib = inp()): void => world.step([ia, ib]);
  if (settle) for (let i = 0; i < 125; i++) tick();
  events.length = 0;
  return { world, a, b, events, tick, run: (n, ia, ib) => { for (let i = 0; i < n; i++) tick(ia, ib); } };
}

beforeEach(() => {
  for (const k of Object.keys(hookLog) as (keyof typeof hookLog)[]) hookLog[k] = 0;
});

describe('data validation', () => {
  it('rejects dangling projectile / deployable references', () => {
    const bad = parseMoves({ moves: { m: { name: 'm', kind: 'special', anim: 'jab', startup: 2, active: 1, recovery: 2, hitboxes: [], events: [{ frame: 2, action: 'projectile', id: 'nope', x: 0, y: 0, vx: 1, vy: 0 }] } } }, 't');
    expect(() => validateReferences(bad, {}, {}, 't')).toThrow(/unknown projectile/);
    const bad2 = parseMoves({ moves: { m: { name: 'm', kind: 'special', anim: 'jab', startup: 2, active: 1, recovery: 2, hitboxes: [], events: [{ frame: 2, action: 'deploy', id: 'nope', x: 0, y: 0 }] } } }, 't');
    expect(() => validateReferences(bad2, {}, {}, 't')).toThrow(/unknown deployable/);
  });

  it('rejects events outside the move and cinematic moves without a cinematic grab', () => {
    expect(() => parseMoves({ moves: { m: { name: 'm', kind: 'special', anim: 'jab', startup: 2, active: 1, recovery: 2, hitboxes: [], events: [{ frame: 99, action: 'custom', name: 'x' }] } } }, 't')).toThrow(/outside the move/);
    expect(() => parseMoves({ moves: { m: { name: 'm', kind: 'ultimate', anim: 'jab', startup: 2, active: 1, recovery: 2, hitboxes: [], cinematic: { frames: 5, hits: [] } } } }, 't')).toThrow(/cinematic: true/);
  });

  it('the proto fixture itself is valid', () => {
    expect(() => makeProto()).not.toThrow();
    expect(Object.keys(protoJson.moves).length).toBeGreaterThan(10);
  });
});

describe('projectiles', () => {
  it('follow a gravity curve: y(n) matches semi-implicit Euler, and heavier gravity drops faster', () => {
    const r = rig();
    const p = r.world.spawnProjectile(0, 'bolt', -200, -100, 3, -2)!;
    let vy = -2;
    let y = -100;
    for (let n = 1; n <= 30; n++) {
      r.world.step([inp(), inp()]);
      vy += 0.2;
      y += vy;
      expect(p.y).toBeCloseTo(y, 6);
    }
    expect(p.vy).toBeCloseTo(-2 + 0.2 * 30);
    const f = r.world.spawnProjectile(0, 'floaty', -200, -100, 3, -2)!;
    for (let n = 0; n < 30; n++) r.world.step([inp(), inp()]);
    expect(f.y).toBeLessThan(p.y); // the Ice-style bolt floats higher than the Fire-style one
  });

  it('a move spawns the bolt at the event frame with the fighter\'s facing', () => {
    const r = rig();
    r.a.startMove('shoot', null, r.world); // frame 1
    r.run(4); // frames 2..5
    expect(r.world.projectiles.some((p) => p.active)).toBe(false);
    r.tick();
    const p = r.world.projectiles.find((q) => q.active)!;
    expect(p.owner).toBe(0);
    expect(p.vx).toBeGreaterThan(0);
    expect(p.x).toBeGreaterThan(r.a.x);
  });

  it('zigzag paths oscillate vertically', () => {
    const r = rig();
    const p = r.world.spawnProjectile(0, 'zig', -300, -100, 2, 0)!;
    let up = false;
    let down = false;
    for (let i = 0; i < 40; i++) {
      r.tick();
      if (p.vy > 0.5) down = true;
      if (p.vy < -0.5) up = true;
    }
    expect(up && down).toBe(true);
  });

  it('hits the enemy (not the owner), deals damage and disappears', () => {
    const r = rig(80);
    const p = r.world.spawnProjectile(0, 'bullet', r.a.x + 20, r.a.y - 14, 4, 0)!;
    r.run(30);
    expect(r.b.damage).toBeCloseTo(2);
    expect(r.a.damage).toBe(0);
    expect(p.active).toBe(false);
    expect(r.events).toContain('projectileHit');
  });

  it('piercing projectiles hit each fighter once and keep flying', () => {
    const r = rig(80);
    const p = r.world.spawnProjectile(0, 'beam', r.a.x + 20, r.a.y - 14, 4, 0)!;
    r.run(30);
    expect(r.b.damage).toBeCloseTo(3);
    expect(p.active).toBe(true);
  });

  it('are stopped by solid stage geometry and can bounce on floors', () => {
    const r = rig();
    const wall = r.world.spawnProjectile(0, 'bullet', -240, 20, 6, 0)!;
    r.run(20);
    expect(wall.active).toBe(false);
    const hop = r.world.spawnProjectile(0, 'hopper', 100, -80, 0, 0)!;
    let bounced = false;
    for (let i = 0; i < 60; i++) {
      const vy0 = hop.vy;
      r.tick();
      if (vy0 > 0 && hop.vy < 0) bounced = true;
    }
    expect(bounced).toBe(true);
    expect(hop.active).toBe(true);
  });

  it('can be destroyed by attacks when they have health', () => {
    const r = rig(120);
    const p = r.world.spawnProjectile(1, 'bolt', r.a.x + 24, r.a.y - 16, 0, 0)!;
    p.vx = 0;
    r.a.startMove('burnPunch', null, r.world); // 3 dmg vs bolt health 3
    r.run(10);
    expect(p.active).toBe(false);
  });

  it('a reflecting barrier flips owner and direction and hits harder', () => {
    const r = rig(120);
    // b raises a barrier; a's bolt flies into it
    r.b.startMove('shieldUp', null, r.world);
    r.run(3);
    const p = r.world.spawnProjectile(0, 'bullet', r.b.x - 40, r.b.y - 16, 3, 0)!;
    r.run(14);
    expect(r.events).toContain('reflect');
    expect(p.owner).toBe(1);
    expect(p.vx).toBeLessThan(0);
    expect(p.dmgMult).toBeCloseTo(1.3);
    r.run(40);
    expect(r.a.damage).toBeCloseTo(2 * 1.3);
    expect(r.b.damage).toBe(0);
  });

  it('beams (moving hitboxes) sweep forward', () => {
    const r = rig(80);
    r.a.startMove('sweeper', null, r.world);
    r.run(14);
    expect(r.b.damage).toBeGreaterThan(0); // 100px away: only reachable because the box travels
  });
});

describe('deployables and limits', () => {
  it('enforces a per-owner limit (refuses over the limit) and tracks counts independently per owner', () => {
    const r = rig();
    expect(r.world.spawnDeployable(0, 'mine', -100, 0)).not.toBeNull();
    expect(r.world.spawnDeployable(0, 'mine', -90, 0)).not.toBeNull();
    expect(r.world.spawnDeployable(0, 'mine', -80, 0)).toBeNull();
    expect(r.world.countDeployables(0, 'mine')).toBe(2);
    expect(r.world.spawnDeployable(1, 'mine', 100, 0)).not.toBeNull(); // other owner has its own budget
    expect(r.world.countDeployables(1, 'mine')).toBe(1);
  });

  it('replaceOldest swaps the oldest when over the limit (single Blink marker)', () => {
    const r = rig();
    const first = r.world.spawnDeployable(0, 'marker', -50, 0)!;
    const firstSerial = first.serial;
    const second = r.world.spawnDeployable(0, 'marker', -20, 0)!;
    expect(r.world.countDeployables(0, 'marker')).toBe(1);
    expect(second.active).toBe(true);
    expect(second.x).toBe(-20);
    expect(second.serial).toBeGreaterThan(firstSerial);
  });

  it('a move can plant one and expiry frees the slot', () => {
    const r = rig();
    r.a.startMove('markerDrop', null, r.world);
    r.run(6);
    const m = r.world.findDeployables(0, 'marker');
    expect(m.length).toBe(1);
    r.run(200);
    expect(r.world.countDeployables(0, 'marker')).toBe(0);
  });

  it('a mine arms after its delay, ignores its owner, and launches an enemy upward on contact', () => {
    const r = rig(200);
    const d = r.world.spawnDeployable(0, 'mine', r.a.x + 10, 0)!;
    r.run(20); // armed, owner standing next to it
    expect(d.active).toBe(true);
    r.a.x = d.x; // owner walks over it: nothing
    r.run(5);
    expect(d.active).toBe(true);
    r.b.x = d.x;
    r.b.y = 0;
    r.b.vx = 0;
    r.run(2);
    expect(r.events).toContain('deployableTrigger');
    expect(d.active).toBe(false);
    expect(r.b.damage).toBeCloseTo(6);
    expect(r.b.vy).toBeLessThan(0); // launched up
  });

  it('is not triggered while still arming', () => {
    const r = rig(200);
    r.b.x = -100;
    const d = r.world.spawnDeployable(0, 'mine', -100, 0)!;
    r.b.x = d.x;
    r.run(3);
    expect(d.active).toBe(true);
  });

  it('a turret fires at an enemy in range at its interval', () => {
    const r = rig(100);
    r.world.spawnDeployable(0, 'turret', r.a.x + 20, 0);
    let shots = 0;
    r.world.listener = (t) => { if (t === 'projectile') shots++; };
    r.run(100);
    expect(shots).toBeGreaterThanOrEqual(2);
    expect(r.b.damage).toBeGreaterThan(0);
  });

  it('enemy attacks destroy a deployable and reward its owner (Scrap from broken turrets)', () => {
    const r = rig(70, true);
    const t = r.world.spawnDeployable(0, 'turret', r.b.x - 24, 0)!;
    t.hp = 2; // a stun punch deals 2
    r.b.facing = -1;
    r.b.startMove('stunPunch', null, r.world);
    r.run(40);
    expect(t.active).toBe(false);
    expect(r.a.res.scrap).toBe(3);
    expect(hookLog.deployDestroyed).toBe(1);
    expect(r.events).toContain('deployableDestroyed');
  });

  it('a KO\'d owner\'s deployables vanish', () => {
    const r = rig();
    r.world.spawnDeployable(1, 'mine', 100, 0);
    r.b.damage = 500;
    r.b.launch(30, -10, 100);
    r.run(200);
    expect(r.b.state).toBe('ko');
    expect(r.world.countDeployables(1, 'mine')).toBe(0);
  });
});

describe('status effects', () => {
  it('burn deals damage over time and then ends', () => {
    const r = rig(26);
    r.a.startMove('burnPunch', null, r.world);
    r.run(14);
    const after = r.b.damage;
    expect(r.b.status.burn).toBeGreaterThan(0);
    r.run(60);
    expect(r.b.damage).toBeGreaterThan(after + 4);
    r.run(100);
    const end = r.b.damage;
    r.run(30);
    expect(r.b.damage).toBe(end);
  });

  it('slow reduces speed; freeze needs enough percent otherwise falls back to slow', () => {
    const lo = rig(26);
    lo.a.startMove('icePunch', null, lo.world);
    lo.run(14);
    expect(lo.b.status.slow).toBeGreaterThan(0);
    expect(lo.b.status.freeze).toBe(0);
    expect(lo.b.speedMul).toBeCloseTo(0.5);

    const hi = rig(26);
    hi.b.damage = 120;
    hi.a.startMove('icePunch', null, hi.world);
    hi.run(14);
    expect(hi.b.status.freeze).toBeGreaterThan(0);
    expect(hi.b.state).toBe('frozen');
  });

  it('a frozen fighter cannot act and is freed by being hit', () => {
    const r = rig(26);
    r.b.damage = 120;
    r.a.startMove('icePunch', null, r.world);
    r.run(12);
    expect(r.b.state).toBe('frozen');
    const x = r.b.x;
    r.run(5, inp(), inp({ stickX: -1, held: Button.Attack, pressed: Button.Attack }));
    expect(r.b.x).toBeCloseTo(x, 3);
    r.a.startMove('burnPunch', null, r.world);
    r.run(8);
    expect(r.b.status.freeze).toBe(0);
    expect(r.b.state).not.toBe('frozen');
  });

  it('stun removes control for its duration', () => {
    const r = rig(26);
    r.a.startMove('stunPunch', null, r.world);
    let stunned = false;
    for (let i = 0; i < 80; i++) {
      r.tick(inp(), inp({ stickX: -1 }));
      if (r.b.state === 'stunned') stunned = true;
    }
    expect(stunned).toBe(true);
    expect(r.b.status.stun).toBe(0);
    expect(['idle', 'run', 'air', 'landing']).toContain(r.b.state);
  });

  it('a slowed fighter runs slower', () => {
    const run = (slow: boolean): number => {
      const r = rig(300);
      if (slow) r.b.applyStatus({ type: 'slow', frames: 300, value: 0.5 }, r.world);
      const x0 = r.b.x;
      r.run(30, inp(), inp({ stickX: -1 }));
      return Math.abs(r.b.x - x0);
    };
    expect(run(true)).toBeLessThan(run(false) * 0.75);
  });
});

describe('movement primitives', () => {
  it('teleports 8-way along the stick direction and stops before solid walls', () => {
    const r = rig(400);
    r.a.spawn(0, -100, 1);
    r.a.startMove('blink', null, r.world);
    r.run(1);
    const x0 = r.a.x;
    const y0 = r.a.y;
    r.tick(inp({ stickX: 1, stickY: -1 }));
    r.tick(inp({ stickX: 1, stickY: -1 })); // event frame 3 happens here
    expect(r.events).toContain('teleport');
    expect(r.a.x - x0).toBeCloseTo(35.4, 0); // 50 * cos(45deg)
    expect(y0 - r.a.y).toBeGreaterThan(30);

    const w = rig(400);
    w.a.spawn(-195, 30, 1);
    w.a.grounded = false;
    w.a.startMove('blink', null, w.world);
    w.run(4);
    expect(w.a.x + w.a.hw).toBeLessThanOrEqual(-160 + 0.01); // stopped at the stage side
  });

  it('teleportTo returns to a marker location when free', async () => {
    const { teleportTo } = await import('../src/engine/actions');
    const r = rig();
    const m = r.world.spawnDeployable(0, 'marker', -120, 0)!;
    expect(teleportTo(r.a, m.x, m.y, r.world)).toBe(true);
    expect(r.a.x).toBeCloseTo(-120);
    expect(teleportTo(r.a, -100, 30, r.world)).toBe(false); // inside the stage block
  });

  it('a recovery move can snap to a distant ledge, is helpless afterwards, and respects noLedge', () => {
    const r = rig(400);
    r.a.spawn(200, -10, -1);
    r.a.x = 195;
    r.a.y = 80; // below and right of the right ledge (160, 0)
    r.a.startMove('climb', null, r.world);
    r.run(10);
    expect(r.a.state).toBe('ledge'); // teleport up + ledgeSnap(range 90)
    // noLedge: with a ledge in reach but grabCooldown active, the fighter does not grab while flying past
    const q = rig(400);
    q.a.spawn(172, -4, -1);
    q.a.startMove('climb', null, q.world);
    expect(q.a.grabCooldown).toBeGreaterThan(0);

    // helpless: after the move ends in the air, no new actions until landing
    const h = rig(400);
    h.a.spawn(400, -300, 1);
    h.a.startMove('climb', null, h.world);
    h.run(40);
    expect(h.a.helpless).toBe(true);
    const jumps = h.a.jumpsLeft;
    h.run(2, press(Button.Jump), inp());
    expect(h.a.jumpsLeft).toBe(jumps);
    expect(h.a.state).toBe('air');
  });

  it('dash is fast, invulnerable in its window, and has a cooldown', () => {
    const r = rig(300);
    r.a.damage = 0;
    // flick right from standstill triggers the dash
    r.tick(inp({ stickX: 1 }));
    expect(r.a.state).toBe('dash');
    r.run(3, inp({ stickX: 1 }));
    expect(r.a.invuln).toBeGreaterThan(0);
    expect(r.a.vx).toBeCloseTo(5);
    r.run(14, inp({ stickX: 1 }));
    expect(r.a.state).not.toBe('dash');
    r.tick(inp());
    r.tick(inp({ stickX: 1 }));
    expect(r.a.state).not.toBe('dash'); // cooldown still running
  });

  it('a tether latches a ledge and pulls the fighter onto it', () => {
    const r = rig(400);
    r.a.spawn(190, 40, -1);
    r.a.startMove('hook', null, r.world);
    r.run(5);
    expect(r.a.state).toBe('tether');
    r.run(20);
    expect(r.a.state).toBe('ledge');
    expect(r.a.ledge?.side).toBe(1);
  });

  it('a tether to a one-way platform pulls the fighter on top of it', () => {
    const r = rig(400);
    r.a.spawn(90, -10, 1);
    r.run(30);
    r.a.startMove('hookUp', null, r.world);
    r.run(40);
    expect(r.a.grounded).toBe(true);
    expect(r.a.y).toBeCloseTo(-68, 0);
  });

  it('a tether can grab an opponent in the air', () => {
    const r = rig(70);
    r.a.startMove('hookGrab', null, r.world);
    r.run(8);
    expect(r.a.state).toBe('holding');
    expect(r.b.state).toBe('grabbed');
  });
});

describe('meter, ultimate and cinematics', () => {
  it('meter fills from damage dealt and taken and announces when full', () => {
    const r = rig(26);
    r.a.startMove('stunPunch', null, r.world);
    r.run(12);
    expect(r.a.meter).toBeGreaterThan(0);
    expect(r.b.meter).toBeGreaterThan(0);
    expect(r.b.meter).toBeGreaterThan(r.a.meter); // taking damage charges faster than dealing it
    r.a.gainMeter(1000, r.world);
    expect(r.a.meter).toBe(100);
    expect(r.events).toContain('meterFull');
  });

  it('the ultimate needs a full meter, spends it, and the world freezes during the cinematic', () => {
    const r = rig(26);
    r.tick(press(Button.Ultimate));
    expect(r.a.state).not.toBe('attack'); // not enough meter
    r.a.meter = 100;
    const bx = r.b.x;
    r.tick(press(Button.Ultimate));
    expect(r.a.meter).toBe(0);
    expect(r.a.move?.id).toBe('ultimate');
    for (let i = 0; i < 20 && !r.world.cinematic; i++) r.tick();
    expect(r.world.cinematic).not.toBeNull();
    expect(r.events).toContain('cinematicStart');
    const tickBefore = r.a.stateFrame;
    r.b.vx = 5; // would move if the world were running
    r.run(10);
    expect(r.a.stateFrame).toBe(tickBefore); // frozen
    expect(r.b.state).toBe('grabbed');
    r.run(40);
    expect(r.world.cinematic).toBeNull();
    expect(r.events).toContain('cinematicHit');
    expect(r.events).toContain('cinematicEnd');
    expect(r.b.damage).toBeCloseTo(30);
    expect(r.b.state).toBe('hitstun'); // the final blow launched
    void bx;
  });
});

describe('behavior hooks and resources', () => {
  it('hooks run (tick, move frames, hits dealt/taken) and resources are per fighter', () => {
    const r = rig(26, true);
    r.a.startMove('stunPunch', null, r.world);
    r.run(12);
    expect(hookLog.ticks).toBeGreaterThan(100);
    expect(hookLog.moveFrames).toBeGreaterThan(0);
    expect(hookLog.hitDealt).toBe(1);
    expect(hookLog.hitTaken).toBe(1);
    expect(r.a.res.heat).toBe(5);
    expect(r.b.res.heat).toBe(0);
  });

  it('custom move events call the behavior', () => {
    const r = rig(26, true);
    const d = makeProto(true);
    d.moves.customMove = { id: 'customMove', name: 'c', kind: 'special', anim: 'jab', startup: 2, active: 1, recovery: 2, hitboxes: [], events: [{ frame: 2, action: 'custom', name: 'ping', args: [1] }] };
    const f = new Fighter(2, d);
    r.world.addFighter(f);
    f.spawn(-300, -1);
    r.world.step([inp(), inp(), inp()]);
    f.startMove('customMove', null, r.world);
    r.world.step([inp(), inp(), inp()]);
    expect(hookLog.custom).toBe(1);
  });

  it('resource events add to the store and requires gates a move', () => {
    const r = rig();
    const d = makeProto();
    d.moves.gain = { id: 'gain', name: 'g', kind: 'special', anim: 'jab', startup: 1, active: 1, recovery: 1, hitboxes: [], events: [{ frame: 1, action: 'resource', key: 'scrap', add: 4 }] };
    d.moves.gated = { id: 'gated', name: 'g', kind: 'special', anim: 'jab', startup: 1, active: 1, recovery: 1, hitboxes: [], requires: { key: 'scrap', min: 5 } };
    const f = new Fighter(2, d);
    r.world.addFighter(f);
    f.spawn(-300, -1);
    expect(f.startMove('gated', null, r.world)).toBe(false);
    f.startMove('gain', null, r.world);
    expect(f.res.scrap).toBe(4);
  });
});

describe('determinism with entities', () => {
  it('projectiles, deployables, statuses and resources are reproducible', () => {
    const run = (): number => {
      const r = rig(60, true);
      for (let i = 0; i < 700; i++) {
        const ia = i % 90 === 0 ? 'shoot' : i % 90 === 20 ? 'mineDrop' : i % 90 === 40 ? 'burnPunch' : '';
        if (ia && r.a.state !== 'attack') r.a.startMove(ia, null, r.world);
        if (i % 130 === 0 && r.b.state !== 'attack') r.b.startMove('turretDrop', null, r.world);
        r.tick(inp({ stickX: i % 60 < 20 ? 1 : 0 }), inp({ stickX: i % 80 < 20 ? -1 : 0 }));
      }
      return r.world.hash();
    };
    expect(run()).toBe(run());
  });
});
