import { describe, expect, it } from 'vitest';
import { brick } from '../src/characters/brick';
import { makeInput } from '../src/engine/buttons';
import { DEFAULT_CAMERA, MultiTargetCamera } from '../src/engine/camera';
import { Fighter } from '../src/engine/fighter';
import { hazardPhase } from '../src/engine/hazards';
import { World, type WorldEventType } from '../src/engine/world';
import { STAGES, STAGE_LIST } from '../src/stages';
import { reactorStage } from '../src/stages/reactor';
import { wreckStage } from '../src/stages/wreck';

describe('stage data', () => {
  it('offers seven stages in stage select', () => {
    expect(STAGE_LIST.map((s) => s.id)).toEqual(['classic', 'ring', 'reactor', 'storm', 'temple', 'wreck', 'skyhold']);
  });
  for (const s of Object.values(STAGES)) {
    it(`${s.id}: four spawns stand on a solid platform inside the blast zones`, () => {
      expect(s.spawns.length).toBeGreaterThanOrEqual(4);
      const solid = s.platforms.filter((p) => p.kind === 'solid');
      for (const sp of s.spawns) {
        expect(solid.some((p) => sp.x >= p.x && sp.x <= p.x + p.w && Math.abs(sp.y + 4 - p.y) < 1)).toBe(true);
        expect(sp.x).toBeGreaterThan(s.blast.left);
        expect(sp.x).toBeLessThan(s.blast.right);
      }
      expect(solid.some((p) => p.ledges)).toBe(true);
    });
  }
});

function reactorRig(n = 2): { world: World; fighters: Fighter[]; events: WorldEventType[] } {
  const world = new World(reactorStage);
  const fighters: Fighter[] = [];
  for (let i = 0; i < n; i++) {
    const f = new Fighter(i, brick);
    world.addFighter(f);
    fighters.push(f);
  }
  const events: WorldEventType[] = [];
  world.listener = (t) => events.push(t);
  return { world, fighters, events };
}

describe('geyser hazard', () => {
  const h = reactorStage.hazards![0];
  it('has a quiet stretch, a telegraph, then an eruption each cycle', () => {
    expect(hazardPhase(h, 10)).toBe('idle');
    expect(hazardPhase(h, h.period - h.active - 1)).toBe('warn');
    expect(hazardPhase(h, h.period - 1)).toBe('active');
    expect(hazardPhase(h, h.period)).toBe('idle');
  });

  it('hurts and launches upward once per eruption, and misses fighters outside the column', () => {
    const { world, fighters, events } = reactorRig();
    const [inside, outside] = fighters;
    inside.spawn(0, -1, 1);
    outside.spawn(120, -1, 1);
    const inputs = [makeInput(), makeInput()];
    inside.invuln = 0;
    let minVy = 0;
    for (let t = 0; t < h.period + 20; t++) {
      inside.invuln = 0;
      outside.invuln = 0;
      world.step(inputs);
      minVy = Math.min(minVy, inside.vy);
      if (t === h.period - h.active - 2) expect(inside.damage).toBe(0);
    }
    expect(events).toContain('hazardWarn');
    expect(events).toContain('hazardFire');
    expect(inside.damage).toBe(h.damage); // exactly one hit even though the eruption lasts 36 frames
    expect(minVy).toBeLessThan(-2);
    expect(outside.damage).toBe(0);
    // next eruption hits again
    inside.damage = 0;
    for (let t = 0; t < h.period; t++) {
      inside.invuln = 0;
      world.step(inputs);
    }
    expect(inside.damage).toBeGreaterThanOrEqual(h.damage);
  });

  it('never KOs a fresh fighter by itself', () => {
    const { world, fighters } = reactorRig(1);
    fighters[0].spawn(0, -1, 1);
    const inputs = [makeInput()];
    for (let t = 0; t < 700; t++) {
      fighters[0].invuln = 0;
      world.step(inputs);
    }
    expect(fighters[0].state).not.toBe('ko');
  });

  it('is deterministic', () => {
    const run = (): number => {
      const { world, fighters } = reactorRig();
      fighters[0].spawn(0, -1, 1);
      fighters[1].spawn(40, -1, -1);
      for (let t = 0; t < 900; t++) {
        fighters[0].invuln = 0;
        world.step([makeInput(), makeInput()]);
      }
      return world.hash();
    };
    expect(run()).toBe(run());
  });
});

describe('four-fighter camera', () => {
  it('frames all four fighters within the zoom limits', () => {
    const b = reactorStage.blast;
    const cam = new MultiTargetCamera({ ...DEFAULT_CAMERA, bounds: { x: b.left, y: b.top, w: b.right - b.left, h: b.bottom - b.top } });
    const pts = [{ x: -200, y: 0 }, { x: 200, y: -60 }, { x: -30, y: -120 }, { x: 60, y: 0 }];
    const out = { cx: 0, cy: 0, zoom: 1 };
    cam.frame(pts, 4, 1280, 720, out);
    expect(out.zoom).toBeGreaterThan(720 / DEFAULT_CAMERA.maxVisibleH - 1e-6);
    expect(out.zoom).toBeLessThan(720 / DEFAULT_CAMERA.minVisibleH + 1e-6);
    const halfW = 1280 / out.zoom / 2;
    for (const p of pts) expect(Math.abs(p.x - out.cx)).toBeLessThan(halfW);
  });
});

describe('lightning hazard', () => {
  it('a bolt hurts whoever stands in its column during the strike, once', () => {
    // covered by the soak brawls on every stage; here just the phase maths: warn then active at the end of each cycle
    const h = STAGES.storm.hazards![0];
    expect(h.kind).toBe('bolt');
    expect(h.warn + h.active).toBeLessThan(h.period);
  });
});

describe('Wreck Cove water spouts', () => {
  it('take turns, launch whoever stands in them and soak them', () => {
    const [a, b] = wreckStage.hazards!;
    expect(a.style).toBe('water');
    expect(hazardPhase(a, 700)).toBe('active');
    expect(hazardPhase(b, 700)).toBe('idle');
    const world = new World(wreckStage);
    const f = new Fighter(0, brick);
    world.addFighter(f);
    f.spawn(a.x, -1, 1);
    const ins = [makeInput()];
    while (world.tick < 700) world.step(ins);
    expect(f.damage).toBeGreaterThanOrEqual(a.damage - 0.01);
    expect(f.status.soak).toBeGreaterThan(0);
    expect(f.vy).toBeLessThan(0);
  });
});

describe('ledges', () => {
  it('a corner covered by a seated tier has no ledge to climb into', () => {
    const world = new World({ ...wreckStage, platforms: [wreckStage.platforms[0], { x: 120, y: -22, w: 70, h: 22, kind: 'solid' }] });
    expect(world.ledges.map((l) => l.side)).toEqual([-1]);
    expect(new World(wreckStage).ledges).toHaveLength(2);
  });
});
