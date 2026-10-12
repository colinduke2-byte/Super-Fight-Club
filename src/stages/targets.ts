import type { StageData } from '../engine/types';

/**
 * Target Gauntlet: the Target Smash course. Ten targets spread over a small main stage, a free-standing pillar, a shelf, tiers of
 * pass-through platforms (one drifting) and a couple of spots off the stage that need a real recovery. Not offered in Stage Select.
 */
export const targetsStage: StageData = {
  id: 'targets',
  name: 'Target Gauntlet',
  platforms: [
    { x: -150, y: 0, w: 300, h: 60, kind: 'solid', ledges: true },
    { x: -270, y: -90, w: 50, h: 120, kind: 'solid', ledges: true },
    { x: 200, y: -60, w: 70, h: 24, kind: 'solid', ledges: true },
    { x: -100, y: -80, w: 60, h: 6, kind: 'pass' },
    { x: 40, y: -120, w: 60, h: 6, kind: 'pass' },
    { x: -40, y: -190, w: 60, h: 6, kind: 'pass', move: { axis: 'x', amplitude: 60, period: 420 } },
    { x: 150, y: -200, w: 50, h: 6, kind: 'pass' },
  ],
  targets: [
    { x: -120, y: -18 },
    { x: 120, y: -18 },
    { x: 0, y: -105 },
    { x: -245, y: -108 },
    { x: 235, y: -78 },
    { x: 70, y: -150 },
    { x: 175, y: -230 },
    { x: -10, y: -232 },
    { x: -172, y: 36 },
    { x: -320, y: -40 },
  ],
  blast: { left: -540, right: 520, top: -460, bottom: 320 },
  spawns: [
    { x: 0, y: -4 },
    { x: -60, y: -4 },
    { x: 60, y: -4 },
    { x: 100, y: -4 },
  ],
  background: { topColor: 0x061424, bottomColor: 0x2a6e8a, layers: ['stars'], theme: 'void' },
  music: 'ring',
  blurb: 'Break all ten targets as fast as you can.',
};
