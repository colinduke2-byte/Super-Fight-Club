import type { StageBackground } from '../engine/types';

/**
 * How a stage lights its fighters (visual only, never read by the sim): the colour of the rim of light caught on their edges
 * and the direction it comes from. Dark stages use a stronger rim so fighters keep their silhouette against the backdrop.
 */
export interface StageLight {
  /** Rim colour (0xRRGGBB). */
  rim: number;
  /** Direction toward the light source in screen space (+x right, +y down); normalised when used. */
  dir: [number, number];
  /** 0..1 strength of the rim (default 0.5). */
  strength?: number;
}

declare module '../engine/types' {
  interface StageBackground {
    /** Rim / key light on the fighters (see StageLight). Falls back to a per-theme default. */
    light?: StageLight;
  }
}

/** Defaults by backdrop theme, for stages that do not set their own `background.light`. */
const THEME_LIGHT: Record<string, StageLight> = {
  skyline: { rim: 0xc890ff, dir: [-0.6, -0.8], strength: 0.45 },
  void: { rim: 0x8ff0ff, dir: [0.7, -0.7], strength: 0.4 },
  reactor: { rim: 0xffa040, dir: [0.2, 1], strength: 0.6 },
  storm: { rim: 0x9fd0ff, dir: [-0.5, -0.85], strength: 0.45 },
  temple: { rim: 0xffd890, dir: [0.8, -0.6], strength: 0.35 },
  tide: { rim: 0xbfe8ff, dir: [-0.7, -0.7], strength: 0.45 },
  cavern: { rim: 0xc8a0ff, dir: [0.4, 0.9], strength: 0.65 },
  frost: { rim: 0xdff0ff, dir: [-0.7, -0.7], strength: 0.3 },
  airship: { rim: 0xffc890, dir: [0.9, -0.4], strength: 0.3 },
  dawn: { rim: 0xffe0b0, dir: [0.85, -0.5], strength: 0.25 },
};

export function stageLight(bg: StageBackground): StageLight {
  return bg.light ?? THEME_LIGHT[bg.theme ?? 'skyline'] ?? THEME_LIGHT.skyline;
}
