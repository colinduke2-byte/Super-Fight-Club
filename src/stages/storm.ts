import type { StageData } from '../engine/types';

/**
 * Stormspire: a narrow tower top in a thunderstorm. Two drifting cloud platforms and a high perch, and lightning that
 * strikes the tower top (left then right, telegraphed for 1.3 s). Lightning hurts and throws you up but never KOs outright.
 */
export const stormStage: StageData = {
  id: 'storm',
  name: 'Stormspire',
  platforms: [
    { x: -150, y: 0, w: 300, h: 80, kind: 'solid', ledges: true },
    { x: -290, y: -48, w: 92, h: 6, kind: 'pass', move: { axis: 'x', amplitude: 36, period: 520 } },
    { x: 198, y: -48, w: 92, h: 6, kind: 'pass', move: { axis: 'x', amplitude: 36, period: 520, phase: 0.5 } },
    { x: -190, y: -96, w: 58, h: 6, kind: 'pass' },
    { x: 132, y: -96, w: 58, h: 6, kind: 'pass' },
    { x: -46, y: -136, w: 92, h: 6, kind: 'pass', move: { axis: 'y', amplitude: 22, period: 380 } },
  ],
  hazards: [
    { kind: 'bolt', x: -92, y: -380, w: 40, h: 380, period: 560, offset: 0, warn: 80, active: 14, damage: 11, base: 48, scaling: 1.0, angle: 84 },
    { kind: 'bolt', x: 92, y: -380, w: 40, h: 380, period: 560, offset: 280, warn: 80, active: 14, damage: 11, base: 48, scaling: 1.0, angle: 96 },
  ],
  blast: { left: -580, right: 580, top: -480, bottom: 360 },
  spawns: [
    { x: -100, y: -4 },
    { x: 100, y: -4 },
    { x: -34, y: -4 },
    { x: 34, y: -4 },
  ],
  background: { topColor: 0x0a1426, bottomColor: 0x2c4a6a, layers: ['clouds'], theme: 'storm' },
  music: 'storm',
  blurb: 'Lightning strikes the tower top, left then right, while storm clouds drift overhead.',
};
