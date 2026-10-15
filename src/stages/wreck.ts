import type { StageData } from '../engine/types';

/**
 * Wreck Cove: the deck of a wrecked galleon in a moonlit cove. A raised quarterdeck on the stern, rigging spars and a crow's
 * nest above, and a raft bobbing off the bow. Two blowholes in the deck take turns throwing up water spouts (1.5 s warning)
 * that launch and soak whoever stands in them, so fire burns out and every hit sends them a little further.
 */
export const wreckStage: StageData = {
  id: 'wreck',
  name: 'Wreck Cove',
  platforms: [
    { x: -190, y: 0, w: 380, h: 70, kind: 'solid', ledges: true },
    { x: 92, y: -22, w: 76, h: 22, kind: 'solid' },
    { x: -168, y: -82, w: 82, h: 6, kind: 'pass' },
    { x: 90, y: -104, w: 74, h: 6, kind: 'pass' },
    { x: -40, y: -152, w: 80, h: 6, kind: 'pass' },
    { x: -318, y: 14, w: 64, h: 6, kind: 'pass', move: { axis: 'y', amplitude: 10, period: 300 } },
  ],
  hazards: [
    { kind: 'geyser', style: 'water', x: -112, y: 0, w: 34, h: 120, period: 720, offset: 0, warn: 90, active: 30, damage: 9, base: 50, scaling: 0.9, angle: 84, soak: 150 },
    { kind: 'geyser', style: 'water', x: 36, y: 0, w: 34, h: 120, period: 720, offset: 360, warn: 90, active: 30, damage: 9, base: 50, scaling: 0.9, angle: 96, soak: 150 },
  ],
  blast: { left: -600, right: 580, top: -470, bottom: 360 },
  spawns: [
    { x: -140, y: -4 },
    { x: 136, y: -26 },
    { x: -40, y: -4 },
    { x: 70, y: -4 },
  ],
  background: { topColor: 0x03060f, bottomColor: 0x215a6e, layers: ['stars'], theme: 'tide', light: { rim: 0xbfe8ff, dir: [-0.7, -0.7], strength: 0.45 } },
  music: 'cove',
  blurb: "A wrecked galleon in a moonlit cove: a raised stern, a crow's nest, a bobbing raft and blowholes that soak you.",
};
