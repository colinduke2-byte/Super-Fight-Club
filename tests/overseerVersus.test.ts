import { describe, expect, it } from 'vitest';
import { BOSSES, CHARACTER_LIST, CHARACTERS, characterById } from '../src/characters';
import { overseer } from '../src/characters/overseer';
import { OVERSEER_VERSUS_ID, overseerVersus } from '../src/characters/overseerVersus';
import { ALT_LOOKS, OUTFIT_NAMES, paletteCount } from '../src/art/palettes';
import { aiFor } from '../src/ai/profiles';
import { sheetDims } from '../src/art/sheetLayout';
import { probeFighter, victims } from './tools/killProbe';

describe('the playable Overseer', () => {
  it('is the last roster fighter; the boss stays out of the roster under its own id', () => {
    expect(CHARACTER_LIST[CHARACTER_LIST.length - 1].id).toBe(OVERSEER_VERSUS_ID);
    expect(CHARACTER_LIST.slice(0, -1)).toHaveLength(10);
    expect(CHARACTERS.overseer).toBeUndefined();
    expect(BOSSES.overseer).toBe(overseer);
    expect(characterById('overseer')).toBe(overseer);
    expect(characterById(OVERSEER_VERSUS_ID)).toBe(overseerVersus);
  });

  it('is fighter-sized and fighter-weighted, with no boss scripts, armour on normals or enrage', () => {
    const v = overseerVersus;
    // 1/1.6 of the boss's body and drawn size
    expect(v.body.height).toBeCloseTo(overseer.body.height / 1.6, 0);
    expect(v.sprite.frameSize * v.sprite.pixelScale).toBeCloseTo((overseer.sprite.frameSize * overseer.sprite.pixelScale) / 1.6, 1);
    expect(v.stats.weight).toBeLessThanOrEqual(125);
    expect(v.behavior).toBeUndefined();
    expect(v.moves.roar).toBeUndefined();
    expect(v.ultimate!.gainDealt).toBeGreaterThan(0);
    for (const id of ['jab1', 'ftilt', 'utilt', 'dtilt', 'nair', 'fair', 'bair', 'uair', 'dair', 'neutralB', 'sideB']) expect(v.moves[id]?.armor, id).toBeUndefined();
    // the boss's kit: claws, the eye beam, blade spires, and a smaller Cataclysm
    expect(v.moves.sideB.name).toBe('Eye Beam');
    expect(v.moves.downB.events!.filter((e) => e.action === 'projectile')).toHaveLength(2);
    expect(v.moves.ultimate.name).toBe('Cataclysm');
    expect(v.moves.ultimate.startup).toBeLessThan(overseer.moves.ultimate.startup);
    expect(v.projectiles!.pillar.h).toBeLessThan(overseer.projectiles!.pillar.h);
    // a full fighter moveset
    for (const id of ['jab1', 'ftilt', 'utilt', 'dtilt', 'dashAttack', 'fsmash', 'usmash', 'dsmash', 'nair', 'fair', 'bair', 'uair', 'dair', 'grab', 'fthrow', 'bthrow', 'uthrow', 'dthrow', 'neutralB', 'sideB', 'upB', 'downB', 'ultimate', 'taunt'])
      expect(v.moves[id], id).toBeDefined();
  });

  it('leaves the boss exactly as it was (scale, armour, scripts)', () => {
    expect(overseer.body).toEqual({ width: 36, height: 54, footHalfWidth: 14 });
    expect(overseer.stats.weight).toBe(300);
    expect(overseer.sprite.frameSize).toBe(320);
    expect(overseer.moves.ultimate.startup).toBe(70);
    expect(overseer.moves.roar).toBeDefined();
    expect(overseer.behavior).toBeDefined();
  });

  it('has palettes and outfits (the phase-2 look is outfit 1), a CPU profile, and a sheet inside the texture limit', () => {
    expect(paletteCount(OVERSEER_VERSUS_ID)).toBe(8);
    expect(OUTFIT_NAMES[OVERSEER_VERSUS_ID]).toHaveLength(3);
    expect(ALT_LOOKS[OVERSEER_VERSUS_ID].find((a) => a.name === 'RAGE')?.outfit).toBe(1);
    const ai = aiFor(OVERSEER_VERSUS_ID);
    expect(ai.ranged).toContain('sideB');
    expect(ai.spender?.slot).toBe('downB');
    const d = sheetDims(overseerVersus);
    expect(Math.max(d.width, d.height)).toBeLessThanOrEqual(4096);
  });
});

// OVERSEER_PROBE=1 npx vitest run tests/overseerVersus.test.ts   prints its kill percents against the middleweight
describe.skipIf(!process.env.OVERSEER_PROBE)('kill probe', () => {
  it('prints', () => {
    const V = victims();
    for (const r of probeFighter(OVERSEER_VERSUS_ID, {}, [V.mid])) {
      const c = r.results[V.mid].centre;
      process.stdout.write(`${r.label.padEnd(30)} centre ${c.best} (recover ${c.recover}, strict ${c.strict}${c.strictDir ?? ''}) ledge ${r.results[V.mid].ledge.best}\n`);
    }
  }, 600_000);
});

// OVERSEER_SIM=2 npx vitest run tests/overseerVersus.test.ts   skill-9 1v1s against each roster fighter (N seeds per side),
// prints its win rate and kit usage
describe.skipIf(!process.env.OVERSEER_SIM)('match sim', () => {
  it('prints', async () => {
    const { playMatch, competitiveStages } = await import('./tools/matchSim');
    const seeds = Number(process.env.OVERSEER_SIM);
    const st = competitiveStages(2);
    let w = 0;
    let n = 0;
    const used: Record<string, number> = {};
    const hits: Record<string, number> = {};
    const died: string[] = [];
    const killed: string[] = [];
    for (const [k, foe] of CHARACTER_LIST.filter((c) => c.id !== OVERSEER_VERSUS_ID).entries()) {
      let fw = 0;
      for (let seed = 0; seed < seeds; seed++)
        for (const flip of [false, true]) {
          const pair = flip ? [foe.id, OVERSEER_VERSUS_ID] : [OVERSEER_VERSUS_ID, foe.id];
          const r = playMatch(pair, st[(k * 3 + seed) % st.length], 3, seed + 900, { skills: [9, 9] });
          const me = flip ? 1 : 0;
          if (r.winner >= 0) n++;
          if (r.winner === me) (w++, fw++);
          for (const [m, c] of Object.entries(r.moveCounts[me])) used[m] = (used[m] ?? 0) + c;
          for (const [m, c] of Object.entries(r.hitCounts[me])) hits[m] = (hits[m] ?? 0) + c;
          for (const ko of r.kos) (ko.victimIdx === me ? died : killed).push(`${ko.sd ? `SD:${ko.cause}/${ko.fail}` : ko.dir}@${Math.round(ko.pct)}`);
        }
      process.stdout.write(`vs ${foe.id}: ${fw}/${seeds * 2}\n`);
    }
    process.stdout.write(`win rate ${((100 * w) / Math.max(1, n)).toFixed(1)}% (${w}/${n})\nmoves ${JSON.stringify(used)}\nhits ${JSON.stringify(hits)}\ndied ${died.join(' ')}\nkilled ${killed.join(' ')}\n`);
  }, 1_800_000);
});
