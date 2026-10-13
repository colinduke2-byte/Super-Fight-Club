import { describe, expect, it } from 'vitest';
import { brick } from '../src/characters/brick';
import { vex } from '../src/characters/vex';
import { Button, makeInput, type FighterInput } from '../src/engine/buttons';
import { Fighter } from '../src/engine/fighter';
import { computeKnockback } from '../src/engine/knockback';
import { moveTotal } from '../src/engine/moves';
import { World, type WorldEventType } from '../src/engine/world';
import { sandboxStage } from '../src/stages/sandbox';

const inp = (o: Partial<FighterInput> = {}): FighterInput => ({ ...makeInput(), ...o });
const press = (b: number, o: Partial<FighterInput> = {}): FighterInput => inp({ pressed: b, held: b, ...o });

function rig(gap = 60, victim = brick, settle = true) {
  const world = new World(sandboxStage);
  const a = new Fighter(0, vex);
  const b = new Fighter(1, victim);
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

const marker = (r: ReturnType<typeof rig>) => r.world.findDeployables(0, 'marker')[0];

/** Blink Strike: tap Special with a neutral stick, then push a direction during the start-up. */
function blink(r: ReturnType<typeof rig>, dx: number, dy = 0): void {
  r.tick(press(Button.Special));
  r.run(5, inp({ stickX: dx, stickY: dy }));
}

describe('Vex identity', () => {
  it('is light, very fast, floaty, with two double jumps and a dash with i-frames', () => {
    const s = vex.stats;
    expect(s.weight).toBe(107);
    expect(s.weight).toBeLessThan(brick.stats.weight); // still lighter than the heavy, even if the roster's weights were compressed for balance
    expect(s.runSpeed).toBeGreaterThanOrEqual(3);
    expect(s.runSpeed).toBeGreaterThan(brick.stats.runSpeed * 1.4);
    expect(s.airSpeed).toBeGreaterThan(brick.stats.airSpeed);
    expect(s.fallSpeed).toBeLessThan(brick.stats.fallSpeed);
    expect(s.gravity).toBeLessThan(brick.stats.gravity);
    expect(s.doubleJumps).toBe(2);
    expect(vex.dash!.invuln[1] - vex.dash!.invuln[0]).toBeLessThan(8); // short window
  });

  it('every normal is fast: jabs start in <=4 frames, no aerial is slower than 9', () => {
    for (const id of ['jab1', 'jab2', 'jab3', 'jab4']) expect(vex.moves[id].startup).toBeLessThanOrEqual(4);
    for (const id of ['nair', 'fair', 'bair', 'uair']) expect(vex.moves[id].startup).toBeLessThanOrEqual(9);
  });

  it('modest damage: no single normal exceeds 16 damage', () => {
    for (const m of Object.values(vex.moves)) for (const h of m.hitboxes) expect(h.damage).toBeLessThanOrEqual(16);
  });
});

describe('Blink Trail', () => {
  it('Blink Strike teleports along the stick direction and leaves one marker at the origin', () => {
    const r = rig(200);
    const x0 = r.a.x;
    blink(r, 1);
    expect(r.events).toContain('teleport');
    expect(r.a.x - x0).toBeGreaterThan(45);
    const m = marker(r);
    expect(m).toBeDefined();
    expect(m.x).toBeCloseTo(x0, 0);
    expect(r.world.countDeployables(0, 'marker')).toBe(1);
  });

  it('teleports in all 8 directions', () => {
    const dirs: [number, number][] = [[1, 0], [-1, 0], [0, -1], [1, -1], [-1, -1], [0, 1], [1, 1], [-1, 1]];
    for (const [dx, dy] of dirs) {
      const r = rig(300, brick, false);
      r.a.spawn(0, -150, 1);
      r.run(2);
      const x0 = r.a.x;
      const y0 = r.a.y;
      blink(r, dx, dy);
      const moved = Math.hypot(r.a.x - x0, r.a.y - y0);
      expect(moved, `${dx},${dy}`).toBeGreaterThan(40);
      if (dx !== 0) expect(Math.sign(r.a.x - x0)).toBe(dx);
      if (dy < 0) expect(r.a.y).toBeLessThan(y0 - 20);
    }
  });

  it('pressing special again recalls Vex to the marker and consumes it', () => {
    const r = rig(200);
    const x0 = r.a.x;
    blink(r, 1);
    r.run(4);
    const blinked = r.a.x;
    expect(blinked - x0).toBeGreaterThan(45);
    // wait out the recovery, then press special again
    r.run(14);
    r.tick(press(Button.Special));
    r.run(6);
    expect(Math.abs(r.a.x - x0)).toBeLessThan(6);
    expect(marker(r)).toBeUndefined(); // used up: only one recall per marker
    expect(r.a.invuln).toBeGreaterThan(0); // brief safety on arrival
  });

  it('the marker expires after 3 seconds, so special blinks again instead of recalling', () => {
    const r = rig(200);
    blink(r, 1);
    r.run(3);
    expect(marker(r)).toBeDefined();
    r.run(185);
    expect(marker(r)).toBeUndefined();
    const x = r.a.x;
    blink(r, -1);
    expect(r.a.x).toBeLessThan(x - 40); // a fresh blink, not a recall
  });

  it('only one marker exists: a new teleport moves it to the new departure point', () => {
    const r = rig(200);
    blink(r, 1);
    r.run(3);
    const first = marker(r).x;
    // use Shadow Climb (also leaves a marker) while the first still exists
    r.a.startMove('upB', null, r.world);
    r.run(6);
    expect(r.world.countDeployables(0, 'marker')).toBe(1);
    expect(marker(r).x).not.toBeCloseTo(first, 0);
  });

  it('Blink Strike works once per airtime and recharges on landing', () => {
    const r = rig(300, brick, false);
    r.a.spawn(0, -150, 1);
    r.run(2);
    blink(r, 1);
    r.run(3);
    expect(r.a.res.blinkAir).toBe(0);
    // marker expiry then try again in the air: swallowed
    r.run(200); // (falls and lands; also expires the marker) -> recharged
    expect(r.a.grounded).toBe(true);
    expect(r.a.res.blinkAir).toBe(1);

    const q = rig(300, brick, false);
    q.a.spawn(0, -600, 1);
    q.run(2);
    blink(q, 1);
    q.run(190); // marker expires, still in the air
    expect(q.a.grounded).toBe(false);
    const x = q.a.x;
    q.tick(press(Button.Special));
    q.run(6, inp({ stickX: 1 }));
    expect(q.a.state).not.toBe('attack'); // no second air blink
    expect(Math.abs(q.a.x - x)).toBeLessThan(25);
  });

  it('the marker is shown on the HUD seam as remaining time', () => {
    const r = rig(200);
    expect(r.a.res.markerTime).toBe(0);
    blink(r, 1);
    r.run(5);
    expect(r.a.res.markerTime).toBeGreaterThan(90);
    r.run(90);
    expect(r.a.res.markerTime).toBeLessThan(60);
  });
});

describe('Shadow Climb (recovery)', () => {
  it('teleports up, grabs a distant ledge, and is helpless on arrival otherwise', () => {
    const r = rig(400, brick, false);
    r.a.spawn(215, 40, -1); // below and right of the right ledge (160, 0)
    r.run(2);
    r.a.startMove('upB', null, r.world);
    r.run(10);
    expect(r.a.state).toBe('ledge');

    const h = rig(400, brick, false);
    h.a.spawn(400, -300, 1);
    h.run(2);
    h.a.startMove('upB', null, h.world);
    h.run(45);
    expect(h.a.helpless).toBe(true); // arrival is vulnerable: no actions until landing
    expect(moveTotal(vex.moves.upB)).toBeGreaterThanOrEqual(30);
  });
});

describe('Snare Mine', () => {
  it('one mine at a time; down special again sets it off by remote', () => {
    const r = rig(300);
    r.a.startMove('downB', null, r.world);
    r.run(30);
    expect(r.world.countDeployables(0, 'mine')).toBe(1);
    const m = r.world.findDeployables(0, 'mine')[0];
    r.b.spawn(m.x + 10, -1, -1);
    r.b.invuln = 0;
    r.b.x = m.x + 24; // near it, but not touching
    r.a.x = m.x - 120;
    r.run(2);
    expect(m.active).toBe(true);
    r.tick(press(Button.Special, { stickY: 1 }));
    expect(r.a.move?.id).toBe('detonate');
    r.run(6);
    expect(r.world.countDeployables(0, 'mine')).toBe(0);
    expect(r.b.damage).toBeGreaterThan(5);
  });

  it('triggers on an enemy, launching them upward, and ignores its owner', () => {
    const r = rig(300);
    const d = r.world.spawnDeployable(0, 'mine', 0, 0)!;
    r.run(25);
    r.a.x = 0;
    r.run(3);
    expect(d.active).toBe(true);
    r.b.x = 0;
    r.b.y = 0;
    r.run(2);
    expect(d.active).toBe(false);
    expect(r.b.damage).toBeCloseTo(7);
    expect(r.b.vy).toBeLessThan(-1);
  });

  it('enemies can destroy it with an attack', () => {
    const r = rig(60);
    const d = r.world.spawnDeployable(0, 'mine', r.b.x - 40, 0)!;
    r.run(25);
    r.b.facing = -1;
    r.b.startMove('jab1', null, r.world);
    r.b.startMove('fsmash', null, r.world);
    r.run(40);
    expect(d.active).toBe(false);
    expect(r.events).toContain('deployableDestroyed');
  });
});

describe('moves', () => {
  it('the 5-hit jab chains when attack is tapped and ends in an angled finisher', () => {
    const r = rig(24, brick);
    r.b.hover = true; // keep the victim in place so the chain can be counted
    let hits = 0;
    r.world.listener = (t, f) => { if ((t === 'hit' || t === 'armorHit') && f === r.b) hits++; }; // Brick shrugs the light ones off
    r.tick(press(Button.Attack));
    for (let i = 0; i < 70; i++) {
      r.b.vx = 0;
      r.tick(i % 7 === 0 ? press(Button.Attack) : inp());
    }
    expect(hits).toBeGreaterThanOrEqual(5);
    expect(vex.moves.jab5.hitboxes[0].angle).toBeLessThan(90);
  });

  it('Double Cross: the second slash launches upward', () => {
    const r = rig(30);
    r.b.damage = 30;
    r.a.startMove('fsmash', null, r.world);
    let upward = false;
    r.world.listener = (t, f) => {
      if (t === 'hit' && f === r.b && r.b.vy < -2) upward = true;
    };
    r.run(60);
    expect(r.b.damage).toBeGreaterThan(30 + 12);
    expect(upward).toBe(true);
  });

  it('Diagonal Slash spikes only on its late hit', () => {
    const fair = vex.moves.fair.hitboxes;
    expect(fair[0].angle).toBeLessThan(90);
    expect(fair[1].angle).toBeGreaterThan(260);
    expect(fair[1].window![0]).toBeGreaterThan(fair[0].window![1]);
  });

  it('Dive Kick bounces Vex off the opponent', () => {
    const r = rig(200, brick, false);
    r.a.spawn(-26, -70, 1);
    r.b.spawn(0, -1, -1);
    r.b.invuln = 0;
    r.run(2);
    r.a.startMove('dair', null, r.world);
    let bounced = false;
    for (let i = 0; i < 60; i++) {
      r.tick();
      if (r.a.vy < -3 && r.events.includes('hit')) bounced = true;
    }
    expect(r.events).toContain('hit');
    expect(bounced).toBe(true);
  });

  it('Pirate\'s Dash slides Vex forward and hits', () => {
    const r = rig(70);
    const x0 = r.a.x;
    r.a.startMove('sideB', null, r.world);
    r.run(30);
    expect(r.a.x - x0).toBeGreaterThan(30);
    expect(r.b.damage).toBeGreaterThan(0);
  });

  it('ground dash has an invulnerability window and a cooldown', () => {
    const r = rig(300);
    r.tick(inp({ stickX: 1 }));
    expect(r.a.state).toBe('dash');
    r.run(3, inp({ stickX: 1 }));
    expect(r.a.invuln).toBeGreaterThan(0);
    expect(r.a.vx).toBeGreaterThan(5);
  });

  it('Pirate King\'s Raid: needs a full meter, many hits, and a big finisher', () => {
    const r = rig(26);
    r.a.meter = 100;
    r.tick(press(Button.Ultimate));
    for (let i = 0; i < 20 && !r.world.cinematic; i++) r.tick();
    expect(r.world.cinematic).not.toBeNull();
    let cineHits = 0;
    r.world.listener = (t) => { if (t === 'cinematicHit') cineHits++; };
    r.run(200);
    expect(cineHits).toBe(10);
    expect(r.b.damage).toBeCloseTo(34.5);
  });

  it('is easier to KO than Brick: the same hit launches Vex farther', () => {
    const kb = (weight: number): number => computeKnockback({ base: 40, scaling: 1, damagePercent: 60, targetWeight: weight });
    expect(kb(vex.stats.weight)).toBeGreaterThan(kb(brick.stats.weight));
  });
});
