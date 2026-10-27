import type { StageData } from '../engine/types';

/**
 * Stormrunner: a sky galleon flying through a sunset storm. The scenery streams past below. A long deck with a raised
 * quarterdeck at the stern, the foremast yard and the crow's nest above; a docking skiff drifts alongside off the bow and
 * peels away again. Lightning finds the mainmast now and then: the strike runs down the mast to the deck.
 */
export const stormrunnerStage: StageData = {
  id: 'stormrunner',
  name: 'Stormrunner',
  platforms: [
    { x: -200, y: 0, w: 400, h: 60, kind: 'solid', ledges: true },
    // (set in from the stern rail: a block flush with the corner would cover the deck's right ledge, see World)
    { x: 76, y: -18, w: 84, h: 18, kind: 'solid' },
    { x: -168, y: -72, w: 64, h: 6, kind: 'pass' },
    { x: -46, y: -128, w: 58, h: 6, kind: 'pass' },
    { x: 292, y: -36, w: 66, h: 8, kind: 'pass', move: { axis: 'x', amplitude: 92, period: 840 } },
  ],
  hazards: [{ kind: 'bolt', x: -17, y: -330, w: 22, h: 330, period: 720, offset: 300, warn: 90, active: 14, damage: 12, base: 42, scaling: 0.62, angle: 80 }],
  blast: { left: -620, right: 620, top: -460, bottom: 330 },
  spawns: [
    { x: -120, y: -4 },
    { x: 120, y: -22 },
    { x: -40, y: -4 },
    { x: 60, y: -4 },
  ],
  background: { topColor: 0x1a1030, bottomColor: 0xffc88a, layers: ['stars'], theme: 'airship', light: { rim: 0xffc890, dir: [0.9, -0.4], strength: 0.3 } },
  music: 'stormrunner',
  blurb: 'A sky galleon in a sunset storm: a long deck, a quarterdeck, the crow\'s nest, a skiff that comes alongside, and lightning on the mainmast.',
};
