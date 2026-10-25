import { describe, expect, it } from 'vitest';
import { CHARACTERS } from '../src/characters';
import { Fighter } from '../src/engine/fighter';
import { BASIC_KINDS, basicOf, makeSwing, moveLook, swingOf, swingVisible, validateBasic } from '../src/fx/basicFx';
import { drawCrack, drawSwing, type Deco } from '../src/ui/MoveFx';

/** A Graphics stand-in that only counts the calls (the trail code chains fillStyle / lineStyle). */
function fakeGraphics(): { g: never; calls: () => number } {
  let n = 0;
  const g: Record<string, unknown> = {};
  for (const k of ['fillStyle', 'lineStyle', 'fillPoints', 'strokePoints', 'lineBetween', 'fillTriangle', 'fillRect', 'fillCircle', 'fillEllipse']) {
    g[k] = (...a: unknown[]) => {
      for (const v of a) if (typeof v === 'number' && !Number.isFinite(v)) throw new Error(`${k}: non-finite argument`);
      n++;
      return g;
    };
  }
  return { g: g as never, calls: () => n };
}

const LAYERS = [[1.5, 0xff0000, 0.3], [1, 0x00ff00, 0.7], [0.5, 0xffffff, 0.9]] as const;

describe('basic move visuals', () => {
  it('every character fx.json basic block is valid', () => {
    for (const c of Object.values(CHARACTERS)) expect(() => validateBasic(c.id, (c.fx as { basic?: never } | undefined)?.basic)).not.toThrow();
    expect(() => validateBasic('x', { shapes: { jab1: 'zigzag' as never } })).toThrow();
    expect(() => validateBasic('x', { emitters: [{ p: 'confetti' as never, color: '#ffffff' }] })).toThrow();
  });

  it('picks a trail shape per kind of move', () => {
    const look = (c: string, id: string): string => {
      const f = new Fighter(0, CHARACTERS[c]);
      const m = CHARACTERS[c].moves[id];
      const l = moveLook(f, m);
      return l.weapon ? `${l.shape}:${l.weapon}` : l.shape;
    };
    expect(look('brick', 'jab1')).toBe('streak');
    expect(look('brick', 'ftilt')).toBe('thrust'); // a hook punch: thrust and shock ring
    expect(look('agni', 'ftilt')).toBe('sweep'); // a kick
    expect(look('brick', 'utilt')).toBe('fan');
    expect(look('brick', 'usmash')).toBe('fan');
    expect(look('brick', 'dsmash')).toBe('split');
    expect(look('brick', 'nair')).toBe('ring');
    expect(look('brick', 'dair')).toBe('spike');
    expect(look('brick', 'fair')).toBe('arc');
    expect(look('brick', 'bair')).toBe('arc');
    expect(look('brick', 'dashAttack')).toBe('lunge');
    expect(look('halcyon', 'ftilt')).toBe('thrust:spear');
    expect(look('riptide', 'fsmash')).toBe('arc:anchor');
    expect(look('rime', 'fsmash')).toBe('arc:blade');
    expect(look('havoc', 'ftilt')).toBe('thrust:stock');
    expect(look('havoc', 'dashAttack')).toBe('lunge:stock');
  });

  it('every basic move of every fighter draws finite geometry on every frame', () => {
    const swing = makeSwing();
    const deco: Deco[] = Array.from({ length: 8 }, () => ({ x: 0, y: 0, t: 0, nx: 0, ny: 0 }));
    const { g, calls } = fakeGraphics();
    for (const c of Object.values(CHARACTERS)) {
      const f = new Fighter(0, c);
      f.x = 10;
      f.y = 0;
      for (const facing of [1, -1] as const) {
        f.facing = facing;
        for (const m of Object.values(c.moves)) {
          if (!BASIC_KINDS.has(m.kind)) continue;
          f.move = m;
          f.state = 'attack';
          const total = m.startup + m.active + m.recovery;
          for (let fr = 1; fr <= total; fr++) {
            f.moveFrame = fr;
            for (const hb of m.hitboxes) {
              if (!swingVisible(f, m, hb)) continue;
              const s = swingOf(f, m, hb, swing);
              for (const v of [s.hx, s.hy, s.tx, s.ty, s.r, s.head, s.tail]) expect(Number.isFinite(v), `${c.id} ${m.id}`).toBe(true);
              if (s.look.shape !== 'none') drawSwing(g, f, s, LAYERS, 1, fr, deco, 0xffffff);
            }
          }
        }
      }
      void basicOf(f);
    }
    for (let a = 0; a < 22; a++) drawCrack(g, 0, 0, a, 30, 0xffffff);
    expect(calls()).toBeGreaterThan(1000);
  });
});
