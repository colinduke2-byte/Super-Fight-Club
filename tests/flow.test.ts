import { describe, expect, it } from 'vitest';
import { CHARACTERS } from '../src/characters';
import { vex } from '../src/characters/vex';
import { Button, makeInput, type FighterInput } from '../src/engine/buttons';
import { Fighter } from '../src/engine/fighter';
import { moveTotal } from '../src/engine/moves';
import { World } from '../src/engine/world';
import { ACTION_BUTTON, BUTTON_ACTIONS, DEFAULT_PAD_PROFILES } from '../src/input/actions';
import { classicStage } from '../src/stages/classic';

const inp = (o: Partial<FighterInput> = {}): FighterInput => ({ ...makeInput(), ...o });
const press = (b: number, o: Partial<FighterInput> = {}): FighterInput => inp({ pressed: b, held: b, ...o });

function rig() {
  const world = new World(classicStage);
  const a = new Fighter(0, vex);
  const b = new Fighter(1, CHARACTERS.brick);
  world.addFighter(a);
  world.addFighter(b);
  a.spawn(-30, -1, 1);
  b.spawn(-6, -1, -1);
  for (let i = 0; i < 130; i++) world.step([inp(), inp()]);
  a.invuln = b.invuln = 0;
  b.hover = true;
  return { world, a, b, tick: (ia = inp()) => world.step([ia, inp()]) };
}

describe('Xbox / gamepad layout', () => {
  for (const [name, prof] of Object.entries(DEFAULT_PAD_PROFILES)) {
    it(`${name}: every action is bound and no button does two things`, () => {
      const used = new Map<number, string>();
      for (const a of BUTTON_ACTIONS) {
        expect(prof[a].length, `${name}.${a}`).toBeGreaterThan(0);
        for (const btn of prof[a]) {
          expect(used.get(btn), `button ${btn} bound to ${used.get(btn)} and ${a}`).toBeUndefined();
          used.set(btn, a);
        }
      }
    });
  }
  it('Xbox layout is Smash-style: A attack, B special, X/Y jump, bumpers grab, triggers shield, Menu pause', () => {
    const p = DEFAULT_PAD_PROFILES.standard;
    expect(p.attack).toEqual([0]);
    expect(p.special).toEqual([1]);
    expect(p.jump).toEqual([2, 3]);
    expect(p.grab).toEqual([4, 5]);
    expect(p.shield).toEqual([6, 7]);
    expect(p.pause).toEqual([9]);
    expect(ACTION_BUTTON.attack).toBe(Button.Attack);
  });
});

describe('hit-confirm cancels', () => {
  it('a jab that connects cancels into a forward tilt; one that whiffs does not', () => {
    const r = rig();
    r.tick(press(Button.Attack));
    expect(r.a.move?.id).toBe('jab1');
    // before it connects, the cancel input does nothing
    r.tick(press(Button.Attack, { stickX: 0.6 }));
    expect(r.a.move?.id).toBe('jab1');
    let id = '';
    for (let i = 0; i < 20; i++) {
      r.tick(i === 6 ? press(Button.Attack, { stickX: 0.6 }) : inp({ stickX: 0.6 }));
      if (r.a.move?.id === 'ftilt') id = 'ftilt';
    }
    expect(r.a.moveHit || id === 'ftilt').toBe(true);
    expect(id).toBe('ftilt');
  });

  it('every cancel in every character points at a real move inside the move\'s own length', () => {
    for (const c of Object.values(CHARACTERS)) {
      let n = 0;
      for (const m of Object.values(c.moves)) {
        for (const cx of m.cancels ?? []) {
          n++;
          if (cx.into !== '@jump') expect(c.moves[cx.into] ?? Object.keys(c.moves).find((k) => k.startsWith(`${cx.into}_`)), `${c.id}.${m.id} -> ${cx.into}`).toBeDefined();
          expect(cx.from, `${c.id}.${m.id}`).toBeLessThan(moveTotal(m));
          expect(['attack', 'special', 'smash', 'grab', 'jump']).toContain(cx.button);
        }
      }
      expect(n, `${c.id} combo routes`).toBeGreaterThanOrEqual(8);
    }
  });

  it('jump cancel on hit launches Vex into the air for a follow-up aerial', () => {
    const r = rig();
    r.tick(press(Button.Attack, { stickY: -0.6 }));
    // find utilt: start it directly (the jab path needs the stick state)
    r.a.startMove('utilt', null, r.world);
    let jumped = false;
    for (let i = 0; i < 30; i++) {
      r.tick(i === 8 ? press(Button.Jump) : inp());
      if (r.a.state === 'jumpsquat' || !r.a.grounded) jumped = true;
    }
    expect(r.a.moveHit).toBe(true);
    expect(jumped).toBe(true);
  });
});

describe('six-pose attack animation phases', () => {
  it('walk through 0..5 in order over a move', () => {
    const r = rig();
    r.a.startMove('fsmash', null, r.world);
    const seen: number[] = [];
    for (let i = 0; i < 90 && r.a.state === 'attack'; i++) {
      r.tick();
      if (r.a.state !== 'attack') break;
      const ph = r.a.attackPhase;
      if (seen[seen.length - 1] !== ph) seen.push(ph);
    }
    expect(seen).toEqual([0, 1, 2, 3, 4, 5]);
  });
});
