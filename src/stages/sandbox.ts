import type { StageData } from '../engine/types';

/**
 * Physics sandbox: one solid main platform with grabbable ledges, two pass-through platforms,
 * a horizontally moving pass-through platform above, and a vertically moving one off to the right.
 */
export const sandboxStage: StageData = {
  id: 'sandbox',
  name: 'Physics Sandbox',
  platforms: [
    { x: -160, y: 0, w: 320, h: 70, kind: 'solid', ledges: true },
    { x: -125, y: -68, w: 64, h: 6, kind: 'pass' },
    { x: 61, y: -68, w: 64, h: 6, kind: 'pass' },
    { x: -32, y: -128, w: 64, h: 6, kind: 'pass', move: { axis: 'x', amplitude: 70, period: 420 } },
    { x: 215, y: -60, w: 52, h: 6, kind: 'pass', move: { axis: 'y', amplitude: 50, period: 360 } },
  ],
  blast: { left: -520, right: 520, top: -430, bottom: 340 },
  spawns: [
    { x: -70, y: -4 },
    { x: 70, y: -4 },
    { x: -20, y: -4 },
    { x: 20, y: -4 },
  ],
  background: { topColor: 0x0b0a24, bottomColor: 0x3a1f5c, layers: ['stars', 'ruins'] },
};
