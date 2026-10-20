import { describe, expect, it } from 'vitest';
import { CHARACTERS } from '../src/characters';
import { Button, makeInput, type FighterInput } from '../src/engine/buttons';
import { Fighter } from '../src/engine/fighter';
import { AEGIS_FRAMES, applyItem, CELL_METER, CORE_METER, CRATE, heldItem, heldState, ITEM_INTERVAL, RAYGUN, RAYGUN_PROJECTILE, SWORD, type ItemKind } from '../src/engine/items';
import { World } from '../src/engine/world';
import { STAGES } from '../src/stages';

function rig(a = 'brick', b = 'vex', gap = 40) {
  const world = new World(STAGES.classic);
  const fa = new Fighter(0, CHARACTERS[a]);
  const fb = new Fighter(1, CHARACTERS[b]);
  world.addFighter(fa);
  world.addFighter(fb);
  fa.spawn(-gap / 2, -1, 1);
  fb.spawn(gap / 2, -1, -1);
  const ins: FighterInput[] = [makeInput(), makeInput()];
  const events: string[] = [];
  world.listener = (t) => events.push(t);
  for (let i = 0; i < 125; i++) world.step(ins);
  fa.invuln = fb.invuln = 0;
  const run = (n: number): void => {
    for (let i = 0; i < n; i++) world.step(ins);
  };
  const press = (btn: number, stickX = 0, stickY = 0, wait = 40): void => {
    ins[0] = { ...makeInput(), pressed: btn, held: btn, stickX, stickY };
    world.step(ins);
    ins[0] = makeInput();
    run(wait);
  };
  /** Drop a resting item of `kind` at x. */
  const place = (kind: ItemKind, x: number, slot = 0) => {
    const it = world.items[slot];
    Object.assign(it, { active: true, kind, x, y: -7, vx: 0, vy: 0, resting: true, thrown: false, age: 0, knockedBy: -1, knockGrace: 0, knockCd: 0, pickDelay: 0, hp: CRATE.hp, volatile: false, primed: false, spent: false });
    return it;
  };
  return { world, fa, fb, ins, events, run, press, place };
}

describe('item effects', () => {
  it('Energy Cell adds 25 meter; a Core Fragment adds a big chunk (not the whole bar)', () => {
    const t = rig();
    t.fa.meter = 0;
    applyItem(t.world, 'cell', 0);
    expect(t.fa.meter).toBe(CELL_METER);
    expect(CELL_METER).toBe(25);
    applyItem(t.world, 'core', 0);
    expect(t.fa.meter).toBe(CELL_METER + CORE_METER);
    expect(CORE_METER).toBeLessThan(100);
  });

  it('the Aegis Prism lasts three seconds and breaks the moment its holder lands a hit', () => {
    const t = rig('brick', 'vex', 40);
    expect(AEGIS_FRAMES).toBe(180);
    applyItem(t.world, 'aegis', 0);
    t.run(10);
    expect(t.fa.aegisFrames).toBeGreaterThan(0);
    t.press(Button.Attack, 1);
    expect(t.fb.damage).toBeGreaterThan(0);
    expect(t.fa.aegisFrames).toBe(0);
    expect(t.fa.invuln).toBe(0);
  });

  it('an Aegis holder who never attacks keeps it for the full duration', () => {
    const t = rig('brick', 'vex', 200);
    applyItem(t.world, 'aegis', 0);
    t.run(AEGIS_FRAMES - 5);
    expect(t.fa.aegisFrames).toBe(5);
    expect(t.fa.invuln).toBeGreaterThan(0);
  });
});

describe('item spawns', () => {
  const spawns = (stage: string, n: number): { x: number; y: number }[] => {
    const world = new World(STAGES[stage]);
    const f = new Fighter(0, CHARACTERS.brick);
    world.addFighter(f);
    f.spawn(0, -1, 1);
    world.config.itemRate = 2;
    const out: { x: number; y: number }[] = [];
    world.listener = (type, _f, x, y) => {
      if (type === 'itemSpawn') out.push({ x, y });
    };
    const ins = [makeInput()];
    for (let t = 0; t < ITEM_INTERVAL[2] * n + 1; t++) {
      f.invuln = 99;
      for (const it of world.items) if (it.active && it.resting) it.active = false; // keep slots free
      world.step(ins);
    }
    return out;
  };

  it('drop onto more than one platform, deterministically, and away from hazards', () => {
    const a = spawns('classic', 40);
    const b = spawns('classic', 40);
    expect(a).toEqual(b);
    const tops = new Set(a.map((s) => Math.round(s.y)));
    expect(tops.size).toBeGreaterThan(1);
    for (const st of Object.keys(STAGES)) {
      const hz = STAGES[st].hazards ?? [];
      if (!hz.length) continue;
      for (const s of spawns(st, 12)) for (const h of hz) if (h.kind !== 'avalanche') expect(Math.abs(s.x - h.x)).toBeGreaterThanOrEqual(h.w / 2 + 14);
    }
  });
});

describe('Beam Sword', () => {
  it('is carried, swings with reach beyond the fist, and burns out after its swings', () => {
    const t = rig('vex', 'brick', 44);
    t.place('sword', t.fa.x);
    t.run(1);
    expect(heldItem(t.world, 0)).toBe(null); // carried items wait for a press
    t.press(Button.Grab, 0, 0, 1);
    expect(heldItem(t.world, 0)).toBe('sword');
    expect(t.fa.heldBomb).toBe(true);
    t.press(Button.Attack, 0, 0, 1);
    expect(t.fa.state).toBe('attack');
    t.run(40);
    expect(t.fb.damage).toBeGreaterThanOrEqual(SWORD.damage * 0.9);
    expect(heldState(t.world, 0).uses).toBe(SWORD.swings - 1);
    for (let k = 1; k < SWORD.swings; k++) t.press(Button.Attack, 0, 0, 45);
    t.run(5);
    expect(heldItem(t.world, 0)).toBe(null);
    expect(t.fa.heldBomb).toBe(false);
  });

  it('one swing hits a rival once (the fighter move under it does not add a second hit)', () => {
    const t = rig('brick', 'vex', 30);
    t.place('sword', t.fa.x);
    t.run(1);
    expect(heldItem(t.world, 0)).toBe(null); // carried items wait for a press
    t.press(Button.Grab, 0, 0, 1);
    t.press(Button.Attack, 0, 0, 40);
    expect(t.fb.damage).toBeCloseTo(SWORD.damage, 5);
  });
});

describe('Ray Gun', () => {
  it('fires lasers at range with a cooldown, then is tossed when empty', () => {
    const t = rig('brick', 'vex', 140);
    t.place('raygun', t.fa.x);
    t.run(1);
    expect(heldItem(t.world, 0)).toBe(null); // carried items wait for a press
    t.press(Button.Grab, 0, 0, 1);
    expect(heldItem(t.world, 0)).toBe('raygun');
    t.press(Button.Attack, 0, 0, 0);
    expect(t.world.projectiles.some((p) => p.active && p.defId === RAYGUN_PROJECTILE)).toBe(true);
    // a second press inside the cooldown does nothing
    t.press(Button.Attack, 0, 0, 0);
    expect(heldState(t.world, 0).uses).toBe(RAYGUN.shots - 1);
    t.run(40);
    expect(t.fb.damage).toBeGreaterThan(0);
    for (let k = 1; k < RAYGUN.shots; k++) t.press(Button.Attack, 0, 0, RAYGUN.cooldown + 2);
    expect(heldState(t.world, 0).uses).toBe(0);
    t.press(Button.Attack, 0, 0, 1);
    expect(t.fa.heldBomb).toBe(false);
    const gun = t.world.items.find((i) => i.active && i.kind === 'raygun');
    expect(gun?.spent).toBe(true);
  });
});

describe('Crates', () => {
  it('are not picked up; attacks break a plain crate into items', () => {
    const t = rig('brick', 'vex', 200);
    const c = t.place('crate', t.fa.x + 24);
    t.run(5);
    expect(c.active).toBe(true);
    expect(t.fa.heldBomb).toBe(false);
    for (let k = 0; k < 8 && c.active && c.kind === 'crate'; k++) t.press(Button.Attack, 0, 0, 30);
    expect(t.events).toContain('itemSpawn');
    expect(t.world.items.some((i) => i.active && i.kind !== 'crate')).toBe(true);
  });

  it('a hazard crate primes when broken and blows up on whoever stands next to it', () => {
    const t = rig('brick', 'vex', 60);
    const c = t.place('crate', 0);
    c.volatile = true;
    for (let k = 0; k < 8 && !c.primed; k++) t.press(Button.Attack, 1, 0, 25);
    expect(c.primed || t.events.includes('itemBoom')).toBe(true);
    t.run(CRATE.fuse + 2);
    expect(t.events).toContain('itemBoom');
    expect(t.fb.damage + t.fa.damage).toBeGreaterThan(CRATE.damage * 0.9);
  });
});

describe('determinism with every item in play', () => {
  const play = (): number => {
    const world = new World(STAGES.skyhold);
    const ids = ['halcyon', 'brick', 'vex', 'havoc'];
    const fs = ids.map((id, i) => new Fighter(i, CHARACTERS[id]));
    fs.forEach((f, i) => {
      world.addFighter(f);
      const sp = STAGES.skyhold.spawns[i % STAGES.skyhold.spawns.length];
      f.spawn(sp.x, sp.y - 1, 1);
    });
    world.config.itemRate = 2;
    // seeded button mashing toward the nearest rival: walks onto items, picks them up, swings, shoots and breaks crates
    let seed = 99;
    const rand = (): number => ((seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) / 4294967296);
    const ins = fs.map(() => makeInput());
    const btns = [Button.Attack, Button.Attack, Button.Jump, Button.Special, Button.Shield, 0, 0, 0];
    for (let t = 0; t < 3000; t++) {
      fs.forEach((f, i) => {
        const o = fs[(i + 1) % fs.length];
        const b = btns[Math.floor(rand() * btns.length)];
        ins[i] = { ...makeInput(), stickX: rand() < 0.7 ? Math.sign(o.x - f.x) : rand() * 2 - 1, stickY: rand() < 0.15 ? -1 : rand() < 0.15 ? 1 : 0, pressed: rand() < 0.3 ? b : 0, held: b };
      });
      world.step(ins);
      // respawn the KO'd so the match keeps going
      for (const f of fs) if (f.state === 'ko' && f.stateFrame === 0) f.spawn(0, -150, 1);
    }
    return world.hash();
  };
  it('two identical runs hash the same', () => {
    expect(play()).toBe(play());
  }, 60_000);
});
