import { describe, expect, it } from 'vitest';
import { brick } from '../src/characters/brick';
import { Button, makeInput, type FighterInput } from '../src/engine/buttons';
import { TRADE_THRESHOLD } from '../src/engine/combat';
import { Fighter } from '../src/engine/fighter';
import { Match } from '../src/engine/match';
import { hitboxFrames, moveTotal, parseMoves } from '../src/engine/moves';
import { World, type WorldEventType } from '../src/engine/world';
import { sandboxStage } from '../src/stages/sandbox';

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

/** Two Bricks standing on the main platform, a facing b. */
function rig(gap = 30): Rig {
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
  for (let i = 0; i < 125; i++) tick(); // land + spawn invulnerability expires
  events.length = 0;
  return { world, a, b, events, tick, run: (n, ia, ib) => { for (let i = 0; i < n; i++) tick(ia, ib); } };
}

describe('frame data (brick.moves.json)', () => {
  it('parses and every move is internally consistent', () => {
    for (const m of Object.values(brick.moves)) {
      expect(moveTotal(m)).toBe(m.startup + m.active + m.recovery);
      expect(m.hitboxes.length).toBeGreaterThan(0);
      for (const hb of m.hitboxes) {
        const [from, to] = hitboxFrames(m, hb);
        expect(from).toBeGreaterThan(m.startup);
        expect(to).toBeLessThanOrEqual(m.startup + m.active);
        expect(hb.base).toBeGreaterThanOrEqual(0);
      }
      if (m.next) expect(brick.moves[m.next.id]).toBeDefined();
      if (m.kind === 'aerial') expect(m.landingLag).toBeGreaterThan(0);
    }
  });

  it('rejects bad data with a clear message', () => {
    expect(() => parseMoves({ moves: { x: { name: 'x', kind: 'jab', anim: 'jab', startup: 3, active: 2, recovery: 3, hitboxes: [{ x: 0, y: 0, w: 5, h: 5, damage: 1, angle: 0, base: 0, scaling: 0, window: [1, 9] }] } } }, 't')).toThrow(/window outside active/);
    expect(() => parseMoves({ moves: { x: { name: 'x', kind: 'jab', anim: 'jab', startup: 3, active: 2, recovery: 3, hitboxes: [], next: { id: 'nope', from: 1, to: 2, at: 2 } } } }, 't')).toThrow(/does not exist/);
  });

  it('smash armor covers frames 8-20 as specified', () => {
    expect(brick.moves.fsmash.armor).toMatchObject({ from: 8, to: 20 });
  });
});

describe('hit detection and hitlag', () => {
  it('a jab damages only from its first active frame, then both fighters freeze in hitlag', () => {
    const r = rig();
    const m = brick.moves.jab1;
    r.tick(press(Button.Attack));
    expect(r.a.move?.id).toBe('jab1');
    // frames 1..startup are harmless
    for (let f = 2; f <= m.startup; f++) {
      expect(r.b.damage).toBe(0);
      r.tick();
    }
    expect(r.b.damage).toBe(0);
    r.tick(); // frame startup+1
    expect(r.b.damage).toBeCloseTo(3);
    expect(r.a.hitlag).toBeGreaterThan(0);
    expect(r.b.hitlag).toBeGreaterThan(0);
    const frame = r.a.moveFrame;
    r.tick();
    expect(r.a.moveFrame).toBe(frame); // frozen
  });

  it('a single-hit move hits once even though its hitbox stays active', () => {
    const r = rig();
    r.tick(press(Button.Attack));
    r.run(40);
    expect(r.b.damage).toBeCloseTo(3);
  });

  it('multi-hit moves re-hit on their rehit interval', () => {
    const r = rig(10);
    r.a.spawn(-5, -300, 1);
    r.b.spawn(5, -300, -1);
    r.b.vx = r.b.vy = 0;
    let hits = 0;
    r.world.listener = (t) => { if (t === 'hit') hits++; };
    r.tick(press(Button.Attack));
    for (let i = 0; i < 30; i++) {
      r.b.x = r.a.x + 10; r.b.y = r.a.y; r.b.vx = 0; r.b.vy = 0; r.b.hitlag = 0; r.b.invuln = 0; r.b.setState('air');
      r.tick();
    }
    expect(hits).toBeGreaterThanOrEqual(2);
  });

  it('knockback uses the victim\'s percent and weight (heavier = launched less)', () => {
    const near = rig();
    near.b.damage = 100;
    near.a.facing = 1;
    near.tick(press(Button.Smash));
    near.run(60);
    const dx = Math.abs(near.b.x - 15);
    expect(dx).toBeGreaterThan(5); // launched
  });
});

describe('trades', () => {
  it('two similar simultaneous hits both land (a trade)', () => {
    const r = rig(26);
    r.tick(press(Button.Attack), press(Button.Attack));
    r.run(8);
    expect(r.events.filter((e) => e === 'trade').length).toBeGreaterThan(0);
    expect(r.a.damage).toBeGreaterThan(0);
    expect(r.b.damage).toBeGreaterThan(0);
  });

  it(`a hit ${TRADE_THRESHOLD}+ damage stronger beats the weaker one outright`, () => {
    const r = rig(26);
    const dsActive = brick.moves.dsmash.startup + 1; // 13
    const jabActive = brick.moves.jab1.startup + 1; // 6
    r.tick(press(Button.Smash, { stickY: 1 })); // a: down smash (12 dmg)
    for (let i = 0; i < dsActive - jabActive - 1; i++) r.tick();
    r.tick(inp(), press(Button.Attack)); // b: jab (3 dmg) arriving on the same tick as the smash
    r.run(dsActive + 4);
    expect(r.events).not.toContain('trade');
    expect(r.b.damage).toBeGreaterThan(0); // smash landed
    expect(r.a.damage).toBe(0); // jab was cancelled by the stronger hit
  });
})

describe('armor', () => {
  it('fsmash armor absorbs a weak hit (damage taken, no flinch) but not outside the window', () => {
    const r = rig();
    r.tick(press(Button.Smash, { stickX: 1 }));
    r.run(9); // inside frames 8-20 (charging holds at frame 6 only while held; button released)
    expect(r.a.armorThreshold()).toBeGreaterThan(0);
    const jab = r.b.data.moves.jab1;
    void jab;
    r.a.damage = 0;
    r.b.setState('attack');
    r.b.startMove('jab1', null, r.world);
    r.run(brick.moves.jab1.startup + 2);
    expect(r.events).toContain('armorHit');
    expect(r.a.state).not.toBe('hitstun');
    expect(r.a.damage).toBeGreaterThan(0);
  });

  it('a hit outside the armor window launches normally', () => {
    const r = rig();
    r.a.startMove('dsmash', null, r.world); // no armor on dsmash
    r.run(2);
    r.b.startMove('jab1', null, r.world);
    r.run(brick.moves.jab1.startup + 2);
    expect(r.events).toContain('hit');
  });
});

describe('smash charge', () => {
  it('holding the button charges and increases damage', () => {
    const fresh = rig();
    fresh.tick(press(Button.Smash, { stickX: 1 }));
    fresh.run(80);
    const base = fresh.b.damage;
    const ch = rig();
    ch.tick(press(Button.Smash, { stickX: 1 }));
    for (let i = 0; i < 70; i++) ch.tick(inp({ held: Button.Smash, stickX: 1 }));
    expect(ch.a.chargeFrames).toBeGreaterThan(30);
    ch.run(60);
    expect(ch.b.damage).toBeGreaterThan(base);
  });
});

describe('shield', () => {
  it('shielding blocks damage, drains shield, and shrinks the bubble', () => {
    const r = rig();
    r.tick(inp(), press(Button.Shield));
    r.run(2, inp(), inp({ held: Button.Shield }));
    expect(r.b.state).toBe('shield');
    const radius0 = r.b.shieldRadius;
    r.a.startMove('fsmash', null, r.world);
    for (let i = 0; i < 40; i++) r.tick(inp(), inp({ held: Button.Shield }));
    expect(r.b.damage).toBe(0);
    expect(r.b.shieldHP).toBeLessThan(50);
    expect(r.b.shieldRadius).toBeLessThan(radius0);
    expect(r.events).toContain('shieldHit');
  });

  it('a shield that is depleted breaks and leaves the fighter helpless', () => {
    const r = rig();
    r.b.shieldHP = 10;
    r.tick(inp(), press(Button.Shield));
    r.run(2, inp(), inp({ held: Button.Shield }));
    r.a.startMove('fsmash', null, r.world);
    for (let i = 0; i < 40; i++) r.tick(inp(), inp({ held: Button.Shield }));
    expect(r.events).toContain('shieldBreak');
    expect(r.b.state).toBe('shieldbreak');
  });

  it('spot dodge is invulnerable in its window; roll moves the fighter', () => {
    const r = rig();
    r.tick(inp(), press(Button.Shield));
    r.run(2, inp(), inp({ held: Button.Shield }));
    r.tick(inp(), inp({ held: Button.Shield, stickY: 1 })); // down flick
    r.tick(inp(), inp({ held: Button.Shield, stickY: 1 }));
    expect(r.b.state).toBe('spotdodge');
    r.run(5);
    expect(r.b.invuln).toBeGreaterThan(0);

    const q = rig();
    q.tick(inp(), press(Button.Shield));
    q.run(2, inp(), inp({ held: Button.Shield }));
    const x0 = q.b.x;
    q.tick(inp(), inp({ held: Button.Shield, stickX: 1 }));
    q.run(30);
    expect(q.b.x).toBeGreaterThan(x0 + 20);
  });
});

describe('grab and throw', () => {
  it('grab beats shield, holds the victim, and a throw launches them', () => {
    const r = rig();
    r.tick(inp(), press(Button.Shield));
    r.run(2, inp(), inp({ held: Button.Shield }));
    r.tick(press(Button.Grab), inp({ held: Button.Shield }));
    r.run(brick.moves.grab.startup + 2, inp(), inp({ held: Button.Shield }));
    expect(r.a.state).toBe('holding');
    expect(r.b.state).toBe('grabbed');
    expect(r.b.damage).toBe(0);
    r.tick(inp({ stickX: 1 }));
    r.run(brick.moves.fthrow.startup + 4);
    expect(r.b.damage).toBeCloseTo(brick.moves.fthrow.hitboxes[0].damage);
    expect(r.b.state).not.toBe('grabbed');
    expect(r.b.x).toBeGreaterThan(r.a.x);
  });

  it('the victim can button-mash out of a grab', () => {
    const r = rig();
    r.tick(press(Button.Grab));
    r.run(brick.moves.grab.startup + 2);
    expect(r.b.state).toBe('grabbed');
    for (let i = 0; i < 80 && r.b.state === 'grabbed'; i++) r.tick(inp(), inp({ pressed: Button.Jump, held: Button.Jump }));
    expect(r.b.state).not.toBe('grabbed');
    expect(r.a.state).not.toBe('holding');
  });
});

describe('aerials', () => {
  it('landing during an aerial costs landing lag; an autocancel window removes it', () => {
    const r = rig(200);
    r.a.spawn(-145, -50, 1);
    r.tick(press(Button.Attack, { stickX: 0.9 })); // fair
    expect(r.a.move?.id).toBe('fair');
    for (let i = 0; i < 40 && r.a.state === 'attack'; i++) r.tick();
    expect(r.a.state).toBe('landing');
    expect(r.a.lagFrames).toBe(brick.moves.fair.landingLag);

    const q = rig(200);
    q.a.spawn(-145, -3, 1);
    q.tick(press(Button.Attack)); // nair, early autocancel window [1,4]
    q.run(3);
    expect(q.a.state).toBe('landing');
    expect(q.a.lagFrames).toBe(0);
  });

  it('dair bounces on landing instead of lagging', () => {
    const r = rig(200);
    r.a.spawn(-145, -90, 1);
    r.tick(press(Button.Attack, { stickY: 1 }));
    for (let i = 0; i < 60 && !r.events.includes('landBounce'); i++) r.tick(inp({ stickY: 1 }));
    expect(r.events).toContain('landBounce');
  });
});

describe('stocks and KOs', () => {
  it('a KO costs a stock, credits the attacker, respawns, and the last fighter standing wins', () => {
    const r = rig();
    const match = new Match(r.world, { mode: 'stock', stocks: 2, timeLimitSec: 60, respawnDelay: 20 });
    r.world.listener = (t, f, _x, _y, _m, extra) => { if (t === 'ko') match.onKo(f, extra); };
    match.onRespawn = (f) => f.spawn(0, -100);
    r.b.damage = 200;
    for (let k = 0; k < 2; k++) {
      r.b.state === 'ko' ? null : null;
      r.b.setState('idle');
      r.b.x = 15; r.b.y = 0; r.b.vx = 0; r.b.vy = 0; r.b.grounded = true; r.b.invuln = 0; r.b.hitlag = 0;
      r.a.x = -15; r.a.y = 0; r.a.setState('idle'); r.a.hitlag = 0;
      r.tick(press(Button.Smash, { stickX: 1 }));
      for (let i = 0; i < 400 && r.b.state !== 'ko'; i++) { r.tick(); match.step(); }
      expect(r.b.state).toBe('ko');
      for (let i = 0; i < 40; i++) { r.tick(); match.step(); }
      r.b.damage = 200;
    }
    expect(match.scores[0].kos).toBe(2);
    expect(match.scores[1].stocks).toBe(0);
    expect(match.over).toBe(true);
    expect(match.winner).toBe(0);
  });

  it('training mode never takes stocks or ends', () => {
    const r = rig();
    const match = new Match(r.world, { mode: 'training', stocks: 3, timeLimitSec: 0, respawnDelay: 10 });
    match.onKo(r.b, 0);
    expect(match.scores[1].stocks).toBe(3);
    match.step();
    expect(match.over).toBe(false);
  });

  it('time mode: a tie goes to sudden death at 300%, first to fall loses', () => {
    const r = rig();
    const match = new Match(r.world, { mode: 'time', stocks: 0, timeLimitSec: 1, respawnDelay: 5 });
    let sd: number[] = [];
    match.onRespawn = (f) => f.spawn(f.id === 0 ? -20 : 20, -2);
    match.onSuddenDeath = (ids) => (sd = ids);
    for (let i = 0; i < 70; i++) match.step();
    expect(match.over).toBe(false);
    expect(match.suddenDeath).toBe(true);
    expect(sd).toEqual([0, 1]);
    expect(r.a.damage).toBe(300);
    expect(r.b.damage).toBe(300);
    match.onKo(r.b, 0);
    match.step();
    expect(match.over).toBe(true);
    expect(match.winner).toBe(0);
  });

  it('time mode: most KOs wins outright', () => {
    const r = rig();
    const match = new Match(r.world, { mode: 'time', stocks: 0, timeLimitSec: 1, respawnDelay: 5 });
    match.onKo(r.b, 0);
    for (let i = 0; i < 70; i++) match.step();
    expect(match.over).toBe(true);
    expect(match.winner).toBe(0);
  });
});

describe('determinism with combat', () => {
  it('same inputs give the same state', () => {
    const run = (): number => {
      const r = rig();
      for (let i = 0; i < 600; i++) {
        const ia = i % 50 === 0 ? press(Button.Attack, { stickX: i % 100 === 0 ? 1 : 0 }) : inp({ stickX: i % 70 < 20 ? 1 : 0 });
        const ib = i % 60 === 0 ? press(Button.Smash) : inp({ stickX: -1 * (i % 90 < 30 ? 1 : 0) });
        r.tick(ia, ib);
      }
      return r.world.hash();
    };
    expect(run()).toBe(run());
  });
});
