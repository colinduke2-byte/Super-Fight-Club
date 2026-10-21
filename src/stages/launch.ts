import type { PlatformDef, StageBackground, StageData } from '../engine/types';

/** Where the launch runway starts: distances are measured from here (the right edge of the main platform). */
export const LAUNCH_EDGE = 110;
/** Pixels per metre on the distance readout. */
export const LAUNCH_PX_PER_M = 4;
const SEGMENT = 640;
/** (Its own stadium backdrop and structure theme; engine/types' theme union does not list it yet.) */
const STADIUM_THEME = 'stadium' as NonNullable<StageBackground['theme']>;
const SEGMENTS = 7;

/**
 * Launch Pad: the Launch Contest course. A small main platform with a long, slightly lower runway running off to
 * the right, built from separate segments so each gets its own art. The left side is walled off by the contest.
 * Not offered in Stage Select. Dressed as a floodlit stadium: a red running track along a concrete wall of sponsor boards,
 * the stands and their camera flashes behind.
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
  background: { topColor: 0x0a0a24, bottomColor: 0xc86a50, layers: ['stars'], theme: STADIUM_THEME, light: { rim: 0xfff0d8, dir: [0.3, -1], strength: 0.35 } },
  music: 'launch',
  blurb: 'Ten seconds to pile on damage, then send the dummy down the runway.',
};
