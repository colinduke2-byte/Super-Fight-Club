import { describe, expect, it } from 'vitest';
import { CHARACTERS } from '../src/characters';
import { Button, makeInput, type FighterInput } from '../src/engine/buttons';
import { CROUCH_CANCEL, CROUCH_CANCEL_MAX_KB, Fighter, LEDGE_REFRESH_GRABS } from '../src/engine/fighter';
import { applyItem, CORE_METER, CRATE, ITEM_INTERVAL, itemInReach, MAX_LIVE_ITEMS, SWORD } from '../src/engine/items';
import { World } from '../src/engine/world';
import { STAGES } from '../src/stages';
import { hitKillPercent, launchOnce, NEVER, recoveryReach } from './tools/killProbe';

const inp = (o: Partial<FighterInput> = {}): FighterInput => ({ ...makeInput(), ...o });

function duo(a = 'nova', b = 'brick', gap = 30) {
  const world = new World(STAGES.classic);
  const fa = new Fighter(0, CHARACTERS[a]);
  const fb = new Fighter(1, CHARACTERS[b]);
  world.addFighter(fa);
  world.addFighter(fb);
  fa.standOn(world.platforms[0], -gap / 2);
  fb.standOn(world.platforms[0], gap / 2);
  fa.facing = 1;
  fb.facing = -1;
  fa.invuln = fb.invuln = 0;
  return { world, fa, fb };
}

describe('set knockback', () => {
  it('jab links launch the same at 0% and at 150%', () => {
    const speeds = [0, 150].map((pct) => {
      const { world, fa, fb } = duo('nova', 'vex');
      fb.damage = pct;
      const hb = fa.data.moves.jab1.hitboxes[0];
      expect(hb.setKb).toBeDefined();
      fb.receiveHit({ damage: hb.damage, base: hb.base, scaling: hb.scaling, angle: hb.angle, direction: 1, setKb: hb.setKb }, world);
      return [Math.hypot(fb.vx, fb.vy), fb.hitstun];
    });
    expect(speeds[1]).toEqual(speeds[0]);
  });
});

describe('crouch cancel', () => {
  it('softens light hits only', () => {
    const kbOf = (crouch: boolean, base: number): number => {
      const { world, fb } = duo();
      if (crouch) fb.setState('crouch');
      fb.receiveHit({ damage: 5, base, scaling: 0, angle: 0, direction: 1 }, world);
      return Math.abs(fb.vx);
    };
    expect(kbOf(true, 30) / kbOf(false, 30)).toBeCloseTo(CROUCH_CANCEL, 3);
    expect(kbOf(true, CROUCH_CANCEL_MAX_KB * 1.2 * 1.2)).toBeCloseTo(kbOf(false, CROUCH_CANCEL_MAX_KB * 1.2 * 1.2), 5);
  });
});

describe('ledge regrabs', () => {
  it(`after ${LEDGE_REFRESH_GRABS} grabs in one airtime the ledge stops refreshing jumps and the air dodge; the match total keeps counting`, () => {
    const world = new World(STAGES.classic);
    const f = new Fighter(0, CHARACTERS.nova);
    world.addFighter(f);
    f.spawn(0, -1, 1);
    f.invuln = 0;
    const l = world.ledges[0];
    for (let n = 1; n <= LEDGE_REFRESH_GRABS + 1; n++) {
      f.releaseLedge();
      f.setState('air');
      f.jumpsLeft = 0;
      f.airDodgeUsed = true;
      f.grabLedge(l, world);
      const refreshed = n <= LEDGE_REFRESH_GRABS;
      expect(f.jumpsLeft, `grab ${n}`).toBe(refreshed ? f.stats.doubleJumps : 0);
      expect(f.airDodgeUsed, `grab ${n}`).toBe(!refreshed);
      expect(f.invuln).toBe(0); // and never any invincibility
    }
    expect(f.ledgeGrabsTotal).toBe(LEDGE_REFRESH_GRABS + 1);
    // landing resets the airtime counter but not the match total
    f.releaseLedge();
    f.standOn(world.platforms[0], 0);
    world.step([inp()]);
    expect(f.ledgeGrabs).toBe(0);
    expect(f.ledgeGrabsTotal).toBe(LEDGE_REFRESH_GRABS + 1);
  });
});

describe('items', () => {
  function withItem(kind: 'sword' | 'heal' | 'bomb', dx: number, airborne = false) {
    const { world, fa, fb } = duo('nova', 'brick', 200);
    if (airborne) {
      fa.x = 0;
      fa.y = -60;
      fa.grounded = false;
      fa.setState('air');
    }
    const it = world.items[0];
    Object.assign(it, { active: true, kind, x: fa.x + dx, y: fa.y - 7, vx: 0, vy: 0, resting: !airborne, thrown: false, age: 0, knockedBy: -1, knockGrace: 0, knockCd: 0, pickDelay: 0, hp: CRATE.hp, volatile: false, primed: false, spent: false });
    return { world, fa, fb, it };
  }

  it('carried items need Attack or Grab next to them (in the air too); instant-use ones still apply on touch', () => {
    for (const btn of [Button.Attack, Button.Grab]) {
      const t = withItem('sword', 4);
      t.world.step([inp(), inp()]);
      expect(t.fa.heldBomb).toBe(false);
      expect(itemInReach(t.world, 0)).toBe(t.it);
      t.world.step([inp({ pressed: btn, held: btn }), inp()]);
      expect(t.fa.heldBomb).toBe(true);
      expect(t.fa.state).not.toBe('attack'); // picking up is not an attack
    }
    const air = withItem('bomb', 2, true);
    air.world.step([inp({ pressed: Button.Grab, held: Button.Grab }), inp()]);
    expect(air.fa.heldBomb).toBe(true);
    const heal = withItem('heal', 0);
    heal.fa.damage = 40;
    heal.world.step([inp(), inp()]);
    expect(heal.fa.damage).toBeLessThan(40);
  });

  it('the Core Fragment gives part of the meter, the Beam Sword hits for less than 10', () => {
    const { world, fa } = duo();
    fa.meter = 0;
    applyItem(world, 'core', 0);
    expect(fa.meter).toBe(CORE_METER);
    expect(fa.meter).toBeLessThan(fa.data.ultimate?.cost ?? 100);
    expect(SWORD.damage).toBeLessThan(10);
  });

  it(`up to ${MAX_LIVE_ITEMS} items are out at once, and spawns are spaced out`, () => {
    const world = new World(STAGES.classic);
    const f = new Fighter(0, CHARACTERS.brick);
    world.addFighter(f);
    f.spawn(-150, -1, 1);
    world.config.itemRate = 2;
    const ticks: number[] = [];
    world.listener = (t) => {
      if (t === 'itemSpawn') ticks.push(world.tick);
    };
    let most = 0;
    for (let t = 0; t < ITEM_INTERVAL[2] * 8; t++) {
      f.invuln = 99;
      for (const it of world.items) if (it.kind === 'crate' || it.kind === 'heal' || it.kind === 'cell' || it.kind === 'boost' || it.kind === 'aegis' || it.kind === 'core') it.age = Math.min(it.age, 10); // keep them around
      world.step([inp()]);
      most = Math.max(most, world.items.filter((x) => x.active).length);
    }
    expect(most).toBe(MAX_LIVE_ITEMS);
    const gaps = ticks.slice(1).map((t, i) => t - ticks[i]);
    expect(new Set(gaps).size).toBeGreaterThan(1); // not a metronome
  });

  it('a volatile crate does not kill a middleweight below 110%', () => {
    expect(hitKillPercent('nova', CRATE, 'classic', 0).recover).toBeGreaterThanOrEqual(110);
    expect(hitKillPercent('nova', CRATE, 'classic', 150, 5).recover).toBeGreaterThanOrEqual(110);
  });
});

describe('stage hazards', () => {
  it('no hazard kills a middleweight below 110%', () => {
    for (const [id, st] of Object.entries(STAGES)) {
      for (const h of st.hazards ?? []) {
        const x = h.kind === 'avalanche' ? 0 : h.x;
        const r = hitKillPercent('nova', { damage: h.damage, base: h.base, scaling: h.scaling, angle: h.angle, direction: (h.travel ?? 1) >= 0 ? 1 : -1, soak: h.soak }, id, x, 10);
        expect(r.recover, `${id} ${h.kind} at ${h.x}`).toBeGreaterThanOrEqual(110);
      }
    }
  }, 60_000);
});

describe('recoveries', () => {
  it('every fighter can get back from 240 px out level with the ledge (about two thirds of the way to the side blast zone), and the up special alone covers 150 px', () => {
    for (const id of Object.keys(CHARACTERS).filter((c) => c !== 'overseer')) {
      expect(recoveryReach(id, 0), id).toBeGreaterThanOrEqual(240);
      expect(recoveryReach(id, 0, 'classic', true), `${id} up special`).toBeGreaterThanOrEqual(150);
    }
  }, 120_000);

  it('Nova survives light aerials at the ledge at 0%', () => {
    for (const [a, m] of [
      ['brick', 'nair'],
      ['vex', 'bair'],
      ['havoc', 'bair'],
      ['gizmo', 'fair'],
      ['agni', 'fair'],
      ['riptide', 'fair'],
      ['obelisk', 'fair'],
    ] as const) {
      if (!CHARACTERS[a].moves[m]) continue;
      for (const pct of [0, 20]) expect(launchOnce(a, m, 'nova', pct, { position: 'ledge' }).ko, `${a} ${m} at ${pct}%`).toBe(false);
    }
  }, 60_000);

  it('the kill probe measures every ultimate, Gizmo\'s mech included', async () => {
    const { killPercent } = await import('./tools/killProbe');
    expect(killPercent('gizmo', 'ultimate', 'nova', { step: 20, best: false }).recover).toBeLessThan(NEVER);
  }, 60_000);
});
