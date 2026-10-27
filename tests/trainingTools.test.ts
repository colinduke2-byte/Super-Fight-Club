import { describe, expect, it } from 'vitest';
import { CHARACTERS } from '../src/characters';
import { brick } from '../src/characters/brick';
import { vex } from '../src/characters/vex';
import { Button, makeInput } from '../src/engine/buttons';
import { Fighter } from '../src/engine/fighter';
import { applyDummyReactions, ComboTracker, cycle, defaultTrainingOptions, InputRecording, RECORD_MAX, restoreFighter, saveFighter, type DiOption, type TechOption } from '../src/engine/training';
import { World } from '../src/engine/world';
import { MECHANIC_TRIALS, stepMatches, TRIALS, TrialChecker, trialsFor } from '../src/game/trials';
import { LESSONS, TutorialRunner } from '../src/game/tutorial';
import { sandboxStage } from '../src/stages/sandbox';

function setup(): { world: World; p: Fighter; d: Fighter } {
  const world = new World(sandboxStage);
  const p = new Fighter(0, brick);
  const d = new Fighter(1, vex);
  world.addFighter(p);
  world.addFighter(d);
  const g = world.platforms[0];
  p.standOn(g, -40);
  d.standOn(g, 0);
  return { world, p, d };
}

describe('training options', () => {
  it('cycle wraps both ways', () => {
    expect(cycle(['a', 'b', 'c'], 'a', -1)).toBe('c');
    expect(cycle(['a', 'b', 'c'], 'c', 1)).toBe('a');
  });

  it('records up to 10 s and plays back with fresh press edges, looping', () => {
    const r = new InputRecording();
    const inp = makeInput();
    for (let i = 0; i < 3; i++) {
      inp.held = i === 1 ? Button.Attack : 0;
      inp.stickX = i;
      r.record(inp);
    }
    const out = makeInput();
    r.play(out);
    expect(out.held).toBe(0);
    r.play(out);
    expect(out.pressed & Button.Attack).toBeTruthy();
    expect(out.stickX).toBe(1);
    r.play(out);
    expect(out.released & Button.Attack).toBeTruthy();
    r.play(out); // loops
    expect(out.stickX).toBe(0);
    const full = new InputRecording();
    let n = 0;
    while (full.record(inp)) n++;
    expect(full.length).toBe(RECORD_MAX);
    expect(n).toBe(RECORD_MAX - 1);
  });

  it('dummy DI holds toward / away from the attacker while launched', () => {
    const { world, p, d } = setup();
    const o = defaultTrainingOptions();
    const memo = { randDi: 'none' as DiOption, randTech: 'none' as TechOption, wasHit: false };
    d.receiveHit({ damage: 10, base: 60, scaling: 1, angle: 45, direction: 1, attackerId: 0 }, world);
    for (const [di, sx, sy] of [['in', -1, 0], ['out', 1, 0], ['up', 0, -1], ['down', 0, 1]] as const) {
      o.di = di;
      const out = makeInput();
      applyDummyReactions(d, p, o, world, out, () => 0.5, memo);
      expect([out.stickX, out.stickY], di).toEqual([sx, sy]);
    }
  });

  it('dummy tech: presses shield just before landing in hitstun and techs', () => {
    const { world, p, d } = setup();
    const o = defaultTrainingOptions();
    o.tech = 'in place';
    const memo = { randDi: 'none' as DiOption, randTech: 'none' as TechOption, wasHit: false };
    d.spawn(0, -80, -1);
    d.damage = 60;
    d.receiveHit({ damage: 10, base: 60, scaling: 1, angle: -70, direction: 1, attackerId: 0 }, world); // a spike into the floor
    let teched = false;
    world.listener = (t, f) => {
      if (t === 'tech' && f === d) teched = true;
    };
    for (let i = 0; i < 240 && !teched; i++) {
      const out = makeInput();
      applyDummyReactions(d, p, o, world, out, () => 0.5, memo);
      world.step([makeInput(), out]);
    }
    // a soft landing lies down instead of bouncing: either way the dummy never stays in tumble
    expect(teched).toBe(true);
  });

  it('combo counter counts a combo and measures frame advantage', () => {
    const { world, p, d } = setup();
    const c = new ComboTracker(p, d);
    world.listener = (t, f, _x, _y, _m, e) => c.onEvent(t, f, e);
    d.receiveHit({ damage: 5, base: 20, scaling: 0, angle: 45, direction: 1, attackerId: 0 }, world);
    d.receiveHit({ damage: 6, base: 20, scaling: 0, angle: 45, direction: 1, attackerId: 0 }, world);
    expect(c.hits).toBe(2);
    expect(c.damage).toBeCloseTo(11);
    for (let i = 0; i < 200 && c.advantage === null; i++) {
      c.tick();
      world.step([makeInput(), makeInput()]);
    }
    expect(c.advantage).not.toBeNull();
    expect(c.advantage!).toBeGreaterThan(0); // the player was free the whole time
  });

  it('save / restore puts a fighter back with its damage', () => {
    const { world, p } = setup();
    p.damage = 42;
    const s = saveFighter(p);
    p.spawn(100, -100, -1);
    p.damage = 0;
    restoreFighter(p, s, world);
    expect(p.x).toBeCloseTo(-40);
    expect(p.damage).toBe(42);
    expect(p.grounded || p.state === 'idle' || p.y === s.y).toBe(true);
  });
});

describe('combo trials', () => {
  it('every roster fighter has its combo trials and a trial of its own mechanic, whose moves exist', () => {
    for (const id of Object.keys(CHARACTERS)) {
      const list = trialsFor(id);
      expect(list.length, id).toBeGreaterThanOrEqual(3);
      expect(TRIALS[id], id).toBeDefined();
      expect(MECHANIC_TRIALS[id]?.teaches, id).toBeTruthy();
      expect(list[list.length - 1], id).toBe(MECHANIC_TRIALS[id]);
      // no generic jab strings left
      expect(list.filter((t) => t.name === 'JAB STRING'), id).toHaveLength(0);
      const ids = Object.keys(CHARACTERS[id].moves);
      for (const t of list) for (const st of t.steps) expect(ids.some((m) => stepMatches(m, st)), `${id} ${t.id} ${st}`).toBe(true);
    }
  });

  it('progresses in order within a combo and restarts when it drops', () => {
    const { p, d } = setup();
    const c = new TrialChecker({ id: 'x', name: 'X', steps: ['dtilt', 'ftilt', 'sideB'], percent: 0, tip: '' }, p, d);
    c.onHit('dtilt', 1);
    c.onHit('dtilt', 2); // multi-hit of the same move: ignored
    c.onHit('ftilt', 3);
    expect(c.progress).toBe(2);
    c.onHit('jab1', 1); // dropped and something else
    expect(c.progress).toBe(0);
    c.onHit('dtilt', 1);
    c.onHit('ftilt', 2);
    c.onHit('sideB_hot', 3);
    expect(c.done).toBe(true);
  });
});

describe('tutorial', () => {
  it('has 6-10 lessons with goals', () => {
    expect(LESSONS.length).toBeGreaterThanOrEqual(6);
    expect(LESSONS.length).toBeLessThanOrEqual(10);
    for (const l of LESSONS) expect(l.goal().length).toBeGreaterThan(10);
  });

  it('lessons clear from sim events and the tutorial finishes', () => {
    const { world, p, d } = setup();
    const t = new TutorialRunner(world, p, d);
    world.listener = (ty, f) => t.onEvent(ty, f);
    t.goto(0);
    t.tick();
    const g = world.platforms[0];
    // move: both edges
    p.standOn(g, g.x + 10);
    t.tick();
    p.standOn(g, g.right - 10);
    t.tick();
    expect(t.cleared).toBe(true);
    for (let i = 0; i < 80; i++) t.tick();
    expect(t.index).toBe(1);
    // sprint: a sustained sprint
    p.sprinting = true;
    p.sprintFrames = 20;
    t.tick();
    p.sprinting = false;
    expect(t.cleared).toBe(true);
    for (let i = 0; i < 80; i++) t.tick();
    expect(t.lesson.id).toBe('jump');
    // jump: real jumps in the sim
    for (let i = 0; i < 60 && !t.cleared; i++) {
      t.tick();
      const inp = makeInput();
      if (i === 2 || i === 20) inp.pressed = inp.held = Button.Jump;
      world.step([inp, makeInput()]);
    }
    expect(t.cleared).toBe(true);
    // the rest via events
    while (!t.finished) {
      for (let i = 0; i < 80; i++) t.tick();
      if (t.finished) break;
      const l = t.lesson.id;
      if (l === 'attack') {
        p.move = brick.moves.jab1;
        d.lastHitBy = 0;
        for (let k = 0; k < 3; k++) t.onEvent('hit', d);
      } else if (l === 'special') {
        p.move = brick.moves.neutralB;
        t.onEvent('moveStart', p);
        p.move = brick.moves.sideB;
        t.onEvent('moveStart', p);
      } else if (l === 'shield') {
        t.onEvent('shieldHit', p);
        t.onEvent('shieldHit', p);
      } else if (l === 'grab') t.onEvent('throw', d);
      else if (l === 'ledge') {
        expect(p.state).toBe('ledge'); // the lesson starts hanging on the ledge
        p.standOn(g, g.x + 20);
        t.onEvent('land', p);
      } else if (l === 'recover') {
        // reaching the ledge without the up special does not count
        t.onEvent('ledgeGrab', p);
        expect(t.progress).toBe(0);
        t.tick();
        p.move = brick.moves.upB;
        t.onEvent('moveStart', p);
        t.onEvent('ledgeGrab', p);
      }
      else if (l === 'ko') t.onEvent('ko', d);
      expect(t.cleared, l).toBe(true);
    }
    expect(t.finished).toBe(true);
  });
});

describe('combo trials in the sim', () => {
  it("Vex's four-hit flurry clears by tapping Attack next to the dummy", () => {
    // a player stands at the right spacing: try a few
    const clears = (gap: number): boolean => {
      const world = new World(sandboxStage);
      const p = new Fighter(0, CHARACTERS.vex);
      const d = new Fighter(1, CHARACTERS.nova);
      world.addFighter(p);
      world.addFighter(d);
      const g = world.platforms[0];
      p.standOn(g, -40);
      d.standOn(g, -40 + gap);
      p.facing = 1;
      d.facing = -1;
      const c = new TrialChecker(trialsFor('vex')[0], p, d);
      world.listener = (t, f) => c.onEvent(t, f);
      let prev = 0;
      for (let i = 0; i < 240 && !c.done; i++) {
        const inp = makeInput();
        inp.held = i % 6 < 2 ? Button.Attack : 0;
        inp.pressed = inp.held & ~prev;
        inp.released = ~inp.held & prev;
        prev = inp.held;
        world.step([inp, makeInput()]);
        c.tick();
      }
      return c.done;
    };
    expect([8, 14, 22, 30, 40].some((gap) => clears(gap))).toBe(true);
  });
});
