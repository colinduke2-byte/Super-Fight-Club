import { describe, expect, it } from 'vitest';
import { CHARACTER_LIST } from '../src/characters';
import { ALT_LOOKS, assignPalettes, OUTFIT_NAMES, paletteCount } from '../src/art/palettes';

describe('colour palettes', () => {
  it('every roster fighter has alternates, all valid hex colours', () => {
    for (const c of CHARACTER_LIST) {
      expect(paletteCount(c.id), c.id).toBeGreaterThanOrEqual(4);
      for (const alt of ALT_LOOKS[c.id]) for (const v of [alt.armor, alt.armorDark, alt.accent]) expect(v).toMatch(/^#[0-9a-f]{6}$/i);
      // two alternate outfits, two colours each
      for (const o of [1, 2]) expect(ALT_LOOKS[c.id].filter((a) => a.outfit === o), `${c.id} outfit ${o}`).toHaveLength(2);
      expect(OUTFIT_NAMES[c.id], c.id).toHaveLength(3);
    }
  });

  it('keeps chosen palettes and bumps duplicates of the same fighter to a free one', () => {
    expect(assignPalettes([{ character: 'brick' }, { character: 'vex' }])).toEqual([0, 0]);
    expect(assignPalettes([{ character: 'brick' }, { character: 'brick' }, { character: 'brick' }])).toEqual([0, 1, 2]);
    expect(assignPalettes([{ character: 'nova', palette: 2 }, { character: 'nova', palette: 2 }])).toEqual([2, 3]);
    expect(assignPalettes([{ character: 'nova', palette: 7 }, { character: 'nova', palette: 7 }])).toEqual([7, 0]);
    expect(assignPalettes([{ character: 'agni', palette: 99 }])).toEqual([7]);
  });
});
