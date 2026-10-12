import { describe, expect, it } from 'vitest';
import { CHARACTER_LIST } from '../src/characters';
import { ALT_LOOKS, assignPalettes, paletteCount } from '../src/art/palettes';

describe('colour palettes', () => {
  it('every roster fighter has alternates, all valid hex colours', () => {
    for (const c of CHARACTER_LIST) {
      expect(paletteCount(c.id), c.id).toBeGreaterThanOrEqual(4);
      for (const alt of ALT_LOOKS[c.id]) for (const v of Object.values(alt)) expect(v).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it('keeps chosen palettes and bumps duplicates of the same fighter to a free one', () => {
    expect(assignPalettes([{ character: 'brick' }, { character: 'vex' }])).toEqual([0, 0]);
    expect(assignPalettes([{ character: 'brick' }, { character: 'brick' }, { character: 'brick' }])).toEqual([0, 1, 2]);
    expect(assignPalettes([{ character: 'nova', palette: 2 }, { character: 'nova', palette: 2 }])).toEqual([2, 3]);
    expect(assignPalettes([{ character: 'nova', palette: 3 }, { character: 'nova', palette: 3 }])).toEqual([3, 0]);
    expect(assignPalettes([{ character: 'agni', palette: 9 }])).toEqual([3]);
  });
});
