import type { PlaceholderLook } from '../engine/types';

export interface AltLook extends Pick<PlaceholderLook, 'armor' | 'armorDark' | 'accent' | 'outfit'> {
  /** Colour name shown in character select. */
  name: string;
}

/**
 * Outfit names per fighter. Outfit 0 is the fighter's own design; outfits 1 and 2 change gear and shape (the hero
 * drawers read `look.outfit`), not just colour.
 */
export const OUTFIT_NAMES: Record<string, string[]> = {
  brick: ['STANDARD', 'SIEGE', 'DIVER'],
  vex: ['STANDARD', 'ONI', 'CYBER'],
  nova: ['STANDARD', 'STARGAZER', 'WITCH'],
  gizmo: ['STANDARD', 'STEAMWORKS', 'ASTRONAUT'],
  agni: ['STANDARD', 'INFERNO', 'TEMPLE'],
  riptide: ['STANDARD', 'PIRATE', 'HAMMERHEAD'],
  obelisk: ['STANDARD', 'ANCIENT', 'MOLTEN'],
  havoc: ['STANDARD', 'SNIPER', 'COMMANDO'],
  rime: ['STANDARD', 'KITSUNE', 'YETI'],
  halcyon: ['STANDARD', 'VALKYRIE', 'RAVEN'],
};

/**
 * Alternate looks per fighter (palette 0 is the character's own look). The hero renderers shade everything from
 * these three colours, so an alt is a full re-render, not a tint. The first three keep the original outfit in new
 * hue families; the next four are the two alternate outfits, two colours each.
 */
export const ALT_LOOKS: Record<string, AltLook[]> = {
  brick: [
    { armor: '#c84a4a', armorDark: '#7a2626', accent: '#ffe08a', name: 'CRIMSON' },
    { armor: '#4aa060', armorDark: '#245a32', accent: '#ff7a3a', name: 'JUNGLE' },
    { armor: '#44445a', armorDark: '#1e1e2c', accent: '#ffd34a', name: 'GUNMETAL' },
    { armor: '#8a8a96', armorDark: '#3a3a46', accent: '#ff5a2a', name: 'IRON', outfit: 1 },
    { armor: '#c8a040', armorDark: '#6a4a1a', accent: '#ff3a3a', name: 'GILDED', outfit: 1 },
    { armor: '#c8902e', armorDark: '#6a4614', accent: '#7ae8ff', name: 'BRASS', outfit: 2 },
    { armor: '#3a8a8a', armorDark: '#174646', accent: '#ffd35a', name: 'VERDIGRIS', outfit: 2 },
  ],
  vex: [
    { armor: '#9a3446', armorDark: '#4a1420', accent: '#4fe8ff', name: 'BLOOD' },
    { armor: '#5f45a0', armorDark: '#2a1c52', accent: '#9aff5a', name: 'VENOM' },
    { armor: '#c8ccd8', armorDark: '#5a6078', accent: '#ff3a5a', name: 'GHOST' },
    { armor: '#363644', armorDark: '#16161e', accent: '#ff3a3a', name: 'SHADOW', outfit: 1 },
    { armor: '#e8e0d0', armorDark: '#7a6a5a', accent: '#ff4a6a', name: 'BONE', outfit: 1 },
    { armor: '#2c344c', armorDark: '#121624', accent: '#3affd8', name: 'NEON', outfit: 2 },
    { armor: '#e8e8f0', armorDark: '#6a6a80', accent: '#ff4ad8', name: 'CHROME', outfit: 2 },
  ],
  nova: [
    { armor: '#b83f4f', armorDark: '#6c2030', accent: '#ffd35a', name: 'RUBY' },
    { armor: '#5aae78', armorDark: '#285c3c', accent: '#ffe08a', name: 'SAGE' },
    { armor: '#2e2e36', armorDark: '#101014', accent: '#ff9a3a', name: 'EMBER' },
    { armor: '#2a3a8a', armorDark: '#121a46', accent: '#ffe86a', name: 'MIDNIGHT', outfit: 1 },
    { armor: '#e8e4f4', armorDark: '#8a84a8', accent: '#7ac8ff', name: 'DAWN', outfit: 1 },
    { armor: '#2a2a32', armorDark: '#0e0e12', accent: '#8aff5a', name: 'HEX', outfit: 2 },
    { armor: '#7a2a8a', armorDark: '#3a1046', accent: '#ffa83a', name: 'HALLOW', outfit: 2 },
  ],
  gizmo: [
    { armor: '#3a7ad8', armorDark: '#1c3a7a', accent: '#ffb02e', name: 'COBALT' },
    { armor: '#5aa83a', armorDark: '#2c5a1c', accent: '#ff5a8a', name: 'LIME' },
    { armor: '#8a4ac8', armorDark: '#452070', accent: '#7affa0', name: 'GRAPE' },
    { armor: '#a86a2a', armorDark: '#5a3412', accent: '#ffd35a', name: 'COPPER', outfit: 1 },
    { armor: '#4a4a54', armorDark: '#1a1a20', accent: '#ff8a3a', name: 'SOOT', outfit: 1 },
    { armor: '#e8ecf2', armorDark: '#7a8494', accent: '#ff6a2a', name: 'APOLLO', outfit: 2 },
    { armor: '#ff8a2a', armorDark: '#8a4010', accent: '#4ae8ff', name: 'MARS', outfit: 2 },
  ],
  agni: [
    { armor: '#2c50b3', armorDark: '#101e56', accent: '#5ad8ff', name: 'BLUE FLAME' },
    { armor: '#2c8a3a', armorDark: '#10461a', accent: '#c8ff5a', name: 'JADE' },
    { armor: '#4a3434', armorDark: '#1a1010', accent: '#ffd35a', name: 'ASH' },
    { armor: '#2a1a1a', armorDark: '#0e0808', accent: '#ff5a1a', name: 'DEMON', outfit: 1 },
    { armor: '#e8e0d0', armorDark: '#8a7a6a', accent: '#5ab8ff', name: 'SPIRIT', outfit: 1 },
    { armor: '#e88a2a', armorDark: '#8a4010', accent: '#ffe08a', name: 'SAFFRON', outfit: 2 },
    { armor: '#8a2a3a', armorDark: '#461018', accent: '#ffd35a', name: 'MAROON', outfit: 2 },
  ],
  riptide: [
    { armor: '#3a9e64', armorDark: '#185036', accent: '#ffd35a', name: 'KELP' },
    { armor: '#a83a4a', armorDark: '#5a1824', accent: '#7fe8ff', name: 'CORAL' },
    { armor: '#3a3a4a', armorDark: '#16161e', accent: '#ff4fa8', name: 'ABYSS' },
    { armor: '#8a2a2a', armorDark: '#3a1010', accent: '#ffd35a', name: 'CAPTAIN', outfit: 1 },
    { armor: '#2a2a3a', armorDark: '#101018', accent: '#e8e8e8', name: 'BLACKBEARD', outfit: 1 },
    { armor: '#5a6a7a', armorDark: '#26303a', accent: '#ffb02e', name: 'STEEL', outfit: 2 },
    { armor: '#d8a83a', armorDark: '#6a4a14', accent: '#3ad8ff', name: 'GOLDEN', outfit: 2 },
  ],
  obelisk: [
    { armor: '#e86a9a', armorDark: '#5a2a3a', accent: '#ffd0e0', name: 'ROSE QUARTZ' },
    { armor: '#3ac87a', armorDark: '#2a3a30', accent: '#b0ffd0', name: 'EMERALD' },
    { armor: '#3a3a4e', armorDark: '#141418', accent: '#ff7a3a', name: 'OBSIDIAN' },
    { armor: '#6aa84a', armorDark: '#3a4a30', accent: '#d8ff8a', name: 'MOSS', outfit: 1 },
    { armor: '#c8b88a', armorDark: '#5a5040', accent: '#4ae8ff', name: 'SANDSTONE', outfit: 1 },
    { armor: '#ff6a1a', armorDark: '#2a1a18', accent: '#ffd35a', name: 'MAGMA', outfit: 2 },
    { armor: '#5ac8ff', armorDark: '#1a2a3a', accent: '#e8ffff', name: 'GLACIER', outfit: 2 },
  ],
  havoc: [
    { armor: '#b8a070', armorDark: '#5a4a30', accent: '#ff6a3a', name: 'DESERT' },
    { armor: '#e0e4ea', armorDark: '#7a8494', accent: '#3ac8ff', name: 'ARCTIC' },
    { armor: '#383b46', armorDark: '#17181f', accent: '#ff3a4a', name: 'NIGHT OPS' },
    { armor: '#4a6a2a', armorDark: '#22341a', accent: '#ffd35a', name: 'GHILLIE', outfit: 1 },
    { armor: '#8a7a5a', armorDark: '#3a3220', accent: '#ff5a3a', name: 'DUST', outfit: 1 },
    { armor: '#3a4a5a', armorDark: '#141c24', accent: '#ff3a3a', name: 'URBAN', outfit: 2 },
    { armor: '#8a2a2a', armorDark: '#3a1010', accent: '#ffd35a', name: 'RED BERET', outfit: 2 },
  ],
  rime: [
    { armor: '#c84a6a', armorDark: '#4a1428', accent: '#ffd0e0', name: 'SAKURA' },
    { armor: '#3a3a4a', armorDark: '#121218', accent: '#7affe0', name: 'MIDNIGHT' },
    { armor: '#e8eef6', armorDark: '#6a7a90', accent: '#7ab8ff', name: 'SNOWFIELD' },
    { armor: '#e86a2a', armorDark: '#6a2010', accent: '#ffe8c8', name: 'FOX FIRE', outfit: 1 },
    { armor: '#e8e8f0', armorDark: '#6a6a80', accent: '#ff4a6a', name: 'SHRINE', outfit: 1 },
    { armor: '#e8f0f8', armorDark: '#7a8aa0', accent: '#4ac8ff', name: 'WHITE FUR', outfit: 2 },
    { armor: '#7a5a3a', armorDark: '#3a2614', accent: '#ffd35a', name: 'BROWN FUR', outfit: 2 },
  ],
  halcyon: [
    { armor: '#4a4a62', armorDark: '#1c1c2a', accent: '#ff5a5a', name: 'STORM' },
    { armor: '#6fcf98', armorDark: '#24704e', accent: '#fff0a0', name: 'MEADOW' },
    { armor: '#5f9ef0', armorDark: '#22449a', accent: '#ffd35a', name: 'SKY' },
    { armor: '#e8e8f0', armorDark: '#7a7a90', accent: '#ffd35a', name: 'SILVER', outfit: 1 },
    { armor: '#d8a83a', armorDark: '#6a4a14', accent: '#ff5a3a', name: 'GOLDEN', outfit: 1 },
    { armor: '#2a2a34', armorDark: '#0e0e14', accent: '#ff3a5a', name: 'RAVEN', outfit: 2 },
    { armor: '#3a2a5a', armorDark: '#16102a', accent: '#7affd8', name: 'NIGHT', outfit: 2 },
  ],
};

/** Outfit and colour of a fighter's palette, for character select (e.g. `SIEGE / IRON`). */
export function lookName(id: string, palette: number): string {
  const alt = palette > 0 ? ALT_LOOKS[id]?.[palette - 1] : undefined;
  const outfit = OUTFIT_NAMES[id]?.[alt?.outfit ?? 0] ?? 'STANDARD';
  return `${outfit} / ${alt?.name ?? 'ORIGINAL'}`;
}

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
