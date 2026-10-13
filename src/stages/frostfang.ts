import type { HazardDef, StageData } from '../engine/types';

/** The avalanche: a wall of snow that breaks loose from one side every 20 s, alternating sides (two-second rumble first). */
const avalanche = (fromLeft: boolean, offset: number): HazardDef => ({
  kind: 'avalanche',
  x: fromLeft ? -250 : 250,
  y: 0,
  w: 46,
  h: 44,
  travel: fromLeft ? 500 : -500,
  period: 2400,
  offset,
  warn: 120,
  active: 96,
  damage: 9,
  base: 48,
  scaling: 0.45,
  angle: 32,
});

/**
 * Frostfang Shrine: Rime's mountain shrine. A snowy stone terrace with a red torii gate and pines behind it; two icy
 * timber platforms (slippery footing) and a high one. Every twenty seconds an avalanche rumbles down from one side and
 * rolls across the terrace: jump it or ride the platforms.
 */
export const frostfangStage: StageData = {
  id: 'frostfang',
  name: 'Frostfang Shrine',
  platforms: [
    { x: -190, y: 0, w: 380, h: 72, kind: 'solid', ledges: true },
    { x: -152, y: -76, w: 84, h: 6, kind: 'pass', surface: 'ice' },
    { x: 68, y: -76, w: 84, h: 6, kind: 'pass', surface: 'ice' },
    { x: -42, y: -142, w: 84, h: 6, kind: 'pass' },
  ],
  hazards: [avalanche(true, 0), avalanche(false, 1200)],
  blast: { left: -570, right: 570, top: -450, bottom: 340 },
  spawns: [
    { x: -110, y: -4 },
    { x: 110, y: -4 },
    { x: -40, y: -4 },
    { x: 40, y: -4 },
  ],
  background: { topColor: 0x0a1430, bottomColor: 0x7a92b4, layers: ['stars'], theme: 'frost' },
  music: 'frostfang',
  blurb: "Rime's mountain shrine: a snowy terrace, icy timber platforms, and avalanches that roll across from either side.",
};
