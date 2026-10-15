import type { StageData } from '../engine/types';

const ROOF = -205;

/**
 * Amethyst Hollow: a geode cavern under the arena, Obelisk's home. A wide crystal-crusted floor with a low tier on the left,
 * two rock shelves and a high crystal ledge. Three stalactites take turns cracking loose from the roof (1.25 s warning): the
 * spike hurts and drives you down as it falls, then shatters on the floor into a crystal stump that stands for four seconds.
 */
const stalactite = (x: number, floor: number, offset: number) => ({
  kind: 'stalactite' as const,
  x,
  y: ROOF,
  w: 26,
  h: floor - ROOF,
  period: 540,
  offset,
  warn: 75,
  active: 26,
  damage: 10,
  base: 34,
  scaling: 0.6,
  angle: 280,
  stump: { w: 20, h: 18, frames: 240 },
});

export const hollowStage: StageData = {
  id: 'hollow',
  name: 'Amethyst Hollow',
  platforms: [
    { x: -200, y: 0, w: 400, h: 76, kind: 'solid', ledges: true },
    { x: -150, y: -18, w: 92, h: 18, kind: 'solid' },
    { x: -194, y: -92, w: 76, h: 6, kind: 'pass' },
    { x: 112, y: -84, w: 80, h: 6, kind: 'pass' },
    { x: -38, y: -150, w: 76, h: 6, kind: 'pass' },
  ],
  hazards: [stalactite(-104, -18, 0), stalactite(24, 0, 180), stalactite(140, 0, 360)],
  blast: { left: -600, right: 600, top: -470, bottom: 360 },
  spawns: [
    { x: -120, y: -22 },
    { x: 150, y: -4 },
    { x: -20, y: -4 },
    { x: 80, y: -4 },
  ],
  background: { topColor: 0x05030a, bottomColor: 0x4a2670, layers: ['stars'], theme: 'cavern', light: { rim: 0xc8a0ff, dir: [0.4, 0.9], strength: 0.7 } },
  music: 'hollow',
  blurb: 'A geode cavern under the arena: a crystal floor, a low tier, rock shelves, and stalactites that crack loose from the roof.',
};
