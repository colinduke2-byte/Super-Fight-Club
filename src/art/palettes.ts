import type { PlaceholderLook } from '../engine/types';

export type AltLook = Pick<PlaceholderLook, 'armor' | 'armorDark' | 'accent'>;

/**
 * Alternate colours per fighter (palette 0 is the character's own look). The hero renderers shade everything from
 * these three colours, so an alt is a full re-render, not a tint. Each alt keeps the fighter's silhouette and
 * swaps hue families so two of the same fighter read apart at a glance.
 */
export const ALT_LOOKS: Record<string, AltLook[]> = {
  brick: [
    { armor: '#c84a4a', armorDark: '#7a2626', accent: '#ffe08a' },
    { armor: '#4aa060', armorDark: '#245a32', accent: '#ff7a3a' },
    { armor: '#44445a', armorDark: '#1e1e2c', accent: '#ffd34a' },
  ],
  vex: [
    { armor: '#9a3446', armorDark: '#4a1420', accent: '#4fe8ff' },
    { armor: '#5f45a0', armorDark: '#2a1c52', accent: '#9aff5a' },
    { armor: '#c8ccd8', armorDark: '#5a6078', accent: '#ff3a5a' },
  ],
  nova: [
    { armor: '#b83f4f', armorDark: '#6c2030', accent: '#ffd35a' },
    { armor: '#3f8a5a', armorDark: '#1f4a30', accent: '#ffe08a' },
    { armor: '#2e2e36', armorDark: '#101014', accent: '#ff9a3a' },
  ],
  gizmo: [
    { armor: '#3a7ad8', armorDark: '#1c3a7a', accent: '#ffb02e' },
    { armor: '#5aa83a', armorDark: '#2c5a1c', accent: '#ff5a8a' },
    { armor: '#8a4ac8', armorDark: '#452070', accent: '#7affa0' },
  ],
  agni: [
    { armor: '#2c50b3', armorDark: '#101e56', accent: '#5ad8ff' },
    { armor: '#2c8a3a', armorDark: '#10461a', accent: '#c8ff5a' },
    { armor: '#4a3434', armorDark: '#1a1010', accent: '#ffd35a' },
  ],
  riptide: [
    { armor: '#2f8a5a', armorDark: '#164a32', accent: '#ffd35a' },
    { armor: '#a83a4a', armorDark: '#5a1824', accent: '#7fe8ff' },
    { armor: '#3a3a4a', armorDark: '#16161e', accent: '#ff4fa8' },
  ],
  obelisk: [
    { armor: '#e86a9a', armorDark: '#5a2a3a', accent: '#ffd0e0' }, // rose quartz
    { armor: '#3ac87a', armorDark: '#2a3a30', accent: '#b0ffd0' }, // emerald on basalt
    { armor: '#3a3a4e', armorDark: '#141418', accent: '#ff7a3a' }, // obsidian with ember veins
  ],
  halcyon: [
    { armor: '#4a4a62', armorDark: '#1c1c2a', accent: '#ff5a5a' },
    { armor: '#6fcf98', armorDark: '#24704e', accent: '#fff0a0' },
    { armor: '#5f9ef0', armorDark: '#22449a', accent: '#ffd35a' },
  ],
};

/** Number of palettes a fighter has, its own included. */
export function paletteCount(id: string): number {
  return 1 + (ALT_LOOKS[id]?.length ?? 0);
}

/**
 * Palettes for a lineup: each slot keeps the one it asked for unless an earlier slot with the same fighter already
 * has it, in which case it takes the next free one (so mirror matches never look identical).
 */
export function assignPalettes(slots: readonly { character: string; palette?: number }[]): number[] {
  const used = new Map<string, Set<number>>();
  return slots.map((s) => {
    const n = paletteCount(s.character);
    const taken = used.get(s.character) ?? new Set<number>();
    used.set(s.character, taken);
    let p = Math.max(0, Math.min(n - 1, s.palette ?? 0));
    for (let k = 0; k < n && taken.has(p); k++) p = (p + 1) % n;
    taken.add(p);
    return p;
  });
}
