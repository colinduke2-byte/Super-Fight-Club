import type { StageData } from '../engine/types';

/** Training Ring: one wide flat platform, nothing else. The honest stage for learning matchups. */
export const ringStage: StageData = {
  id: 'ring',
  name: 'Training Ring',
  platforms: [{ x: -210, y: 0, w: 420, h: 70, kind: 'solid', ledges: true }],
  blast: { left: -560, right: 560, top: -440, bottom: 340 },
  spawns: [
    { x: -120, y: -4 },
    { x: 120, y: -4 },
    { x: -40, y: -4 },
    { x: 40, y: -4 },
  ],
  background: { topColor: 0x061424, bottomColor: 0x2a6e8a, layers: ['stars'], theme: 'void' },
  music: 'ring',
};
