import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BOSSES, CHARACTERS } from '../src/characters';
import { validateFx, validateOps, type FxOp } from '../src/engine/fxTypes';
import { validateStage } from '../src/engine/stageValidation';
import { LIBRARY_RECIPES } from '../src/fx/library';
import { STAGES } from '../src/stages';

const everyone = { ...CHARACTERS, ...BOSSES };

describe('character content conformance (runs for every registered fighter and the boss)', () => {
  for (const [id, c] of Object.entries(everyone)) {
    describe(id, () => {
      it('every move names an animation the sprite sheet has', () => {
        for (const m of Object.values(c.moves)) expect(c.sprite.animations[m.anim], `${id}.${m.id} -> anim '${m.anim}'`).toBeDefined();
      });

      it('every move fx event resolves to a recipe (own or library)', () => {
        for (const m of Object.values(c.moves)) {
          for (const ev of m.events ?? []) {
            if (ev.action !== 'fx') continue;
            const ok = !!(c.fx?.recipes?.[ev.name] ?? LIBRARY_RECIPES[ev.name]);
            expect(ok, `${id}.${m.id} plays unknown fx '${ev.name}'`).toBe(true);
          }
        }
      });

      it('has valid fx data, a persona, and the standard moves', () => {
        validateFx(id, c.fx);
        expect(c.persona, `${id} has no persona`).toBeDefined();
        const need = id in CHARACTERS ? ['jab1', 'fsmash', 'usmash', 'dsmash', 'nair', 'grab'] : ['fsmash'];
        for (const n of need) expect(c.moves[n], `${id}.${n}`).toBeDefined();
      });

      it('hurt / movement poses exist or have fallbacks', () => {
        for (const a of ['idle', 'run', 'jump', 'fall', 'hurt', 'down', 'shield']) expect(c.sprite.animations[a], `${id}.${a}`).toBeDefined();
      });

      it('every non-hidden move has sane frame data', () => {
        for (const m of Object.values(c.moves)) {
          expect(m.startup, m.id).toBeGreaterThanOrEqual(1);
          expect(m.startup + m.active + m.recovery, m.id).toBeLessThanOrEqual(260);
          for (const h of m.hitboxes) {
            expect(h.w, `${m.id} hitbox width`).toBeGreaterThan(0);
            expect(h.damage, `${m.id} damage`).toBeGreaterThanOrEqual(0);
          }
        }
      });
    });
  }
});

describe('fx validation catches mistakes', () => {
  it('rejects unknown ops, colours and number sources', () => {
    expect(() => validateOps('t', [{ op: 'sparkle' } as unknown as FxOp])).toThrow(/unknown effect op/);
    expect(() => validateOps('t', [{ op: 'ring', radius: 10, color: 'red' }])).toThrow(/bad colour/);
    expect(() => validateOps('t', [{ op: 'ring', radius: { from: 'bogus' }, color: 0xffffff }])).toThrow(/number source/);
  });
});

describe('stage conformance', () => {
  for (const [id, s] of Object.entries(STAGES)) {
    it(`${id} is a valid stage`, () => validateStage(s));
  }
  it('rejects broken stages', () => {
    const base = STAGES.classic;
    expect(() => validateStage({ ...base, spawns: base.spawns.slice(0, 2) })).toThrow(/spawn/);
    expect(() => validateStage({ ...base, blast: { left: 10, right: -10, top: -5, bottom: 5 } })).toThrow(/inverted/);
    expect(() => validateStage({ ...base, spawns: base.spawns.map((sp) => ({ ...sp, y: -400 })) })).toThrow(/no platform/);
  });
});

describe('architecture guard: no character-specific branches in shared code', () => {
  const walk = (dir: string, out: string[] = []): string[] => {
    for (const f of readdirSync(dir)) {
      const p = join(dir, f);
      if (statSync(p).isDirectory()) {
        if (p.endsWith('/characters')) continue;
        walk(p, out);
      } else if (p.endsWith('.ts')) out.push(p);
    }
    return out;
  };
  it('src/ outside src/characters never switches on a character id', () => {
    const offenders: string[] = [];
    const re = /(data\.id|\.id)\s*===?\s*'(brick|vex|nova|gizmo|agni|overseer)'|case '(brick|vex|nova|gizmo|agni)':/;
    for (const f of walk('src')) {
      const text = readFileSync(f, 'utf8');
      text.split('\n').forEach((line, i) => {
        if (re.test(line) && !line.includes('guard-ok')) offenders.push(`${f}:${i + 1}: ${line.trim()}`);
      });
    }
    expect(offenders).toEqual([]);
  });
});
