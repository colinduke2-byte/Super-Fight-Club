import type { StageData } from '../engine/types';

/** Skyline Classic: a main stage with ledges and three pass-through platforms (two low, one high). */
export const classicStage: StageData = {
  id: 'classic',
  name: 'Skyline Classic',
  platforms: [
    { x: -170, y: 0, w: 340, h: 70, kind: 'solid', ledges: true },
    { x: -135, y: -70, w: 64, h: 6, kind: 'pass' },
    { x: 71, y: -70, w: 64, h: 6, kind: 'pass' },
    { x: -32, y: -138, w: 64, h: 6, kind: 'pass' },
  ],
  blast: { left: -540, right: 540, top: -440, bottom: 340 },
  spawns: [
    { x: -90, y: -4 },
    { x: 90, y: -4 },
    { x: -30, y: -4 },
    { x: 30, y: -4 },
  ],
  background: { topColor: 0x0b0a24, bottomColor: 0x3a1f5c, layers: ['stars', 'ruins'], theme: 'skyline', light: { rim: 0xc890ff, dir: [-0.6, -0.8], strength: 0.45 } },
  music: 'classic',
  blurb: 'A floating dusk platform with a skyline backdrop. Three pass-through platforms, no tricks.',
};
