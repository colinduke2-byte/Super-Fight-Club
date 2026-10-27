import type { StageData } from '../engine/types';

/**
 * Sunken Temple: a jungle ziggurat. The wide main floor has a raised centre tier (a low wall to fight around, jump over or
 * wall-jump off), two side platforms and a slowly bobbing altar slab on top. No hazards: the terrain is the twist.
 */
export const templeStage: StageData = {
  id: 'temple',
  name: 'Sunken Temple',
  platforms: [
    { x: -210, y: 0, w: 420, h: 76, kind: 'solid', ledges: true },
    { x: -56, y: -26, w: 112, h: 26, kind: 'solid' },
    { x: -190, y: -86, w: 76, h: 6, kind: 'pass' },
    { x: 114, y: -86, w: 76, h: 6, kind: 'pass' },
    { x: -40, y: -146, w: 80, h: 6, kind: 'pass', move: { axis: 'y', amplitude: 16, period: 360 } },
  ],
  blast: { left: -580, right: 580, top: -460, bottom: 360 },
  spawns: [
    { x: -150, y: -4 },
    { x: 150, y: -4 },
    { x: -30, y: -30 },
    { x: 30, y: -30 },
  ],
  background: { topColor: 0x081a1e, bottomColor: 0x6a8a5a, layers: ['stars'], theme: 'temple', light: { rim: 0xffd890, dir: [0.8, -0.6], strength: 0.35 } },
  music: 'temple',
  blurb: 'A jungle ziggurat with a raised centre tier to fight around, two side platforms and a bobbing altar on top.',
};
