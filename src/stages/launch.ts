import type { PlatformDef, StageData } from '../engine/types';

/** Where the launch runway starts: distances are measured from here (the right edge of the main platform). */
export const LAUNCH_EDGE = 110;
/** Pixels per metre on the distance readout. */
export const LAUNCH_PX_PER_M = 4;
const SEGMENT = 640;
const SEGMENTS = 7;

/**
 * Launch Pad: the Launch Contest course. A small main platform with a long, slightly lower runway running off to
 * the right, built from separate segments so each gets its own art. The left side is walled off by the contest.
 * Not offered in Stage Select.
 */
export const launchStage: StageData = {
  id: 'launch',
  name: 'Launch Pad',
  platforms: [
    { x: -110, y: 0, w: 220, h: 60, kind: 'solid', ledges: true },
    ...Array.from({ length: SEGMENTS }, (_, i): PlatformDef => ({ x: LAUNCH_EDGE + i * SEGMENT, y: 48, w: SEGMENT, h: 44, kind: 'solid' })),
  ],
  blast: { left: -420, right: LAUNCH_EDGE + SEGMENTS * SEGMENT + 400, top: -2200, bottom: 420 },
  spawns: [
    { x: -60, y: -4 },
    { x: 20, y: -4 },
    { x: -20, y: -4 },
    { x: 60, y: -4 },
  ],
  background: { topColor: 0x0a1030, bottomColor: 0x6a4a8a, layers: ['stars'], theme: 'dawn' },
  music: 'classic',
  blurb: 'Ten seconds to pile on damage, then send the dummy down the runway.',
};
