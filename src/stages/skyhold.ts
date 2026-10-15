import type { StageData } from '../engine/types';

/**
 * Skyhold Expanse: the large stage. A long bridge deck, two floating islands across a gap on either side, tiers of
 * pass-through platforms and a drifting cloud high over the middle. Wide blast zones: long stocks, room to run and fly.
 */
export const skyholdStage: StageData = {
  id: 'skyhold',
  name: 'Skyhold Expanse',
  platforms: [
    { x: -260, y: 0, w: 520, h: 84, kind: 'solid', ledges: true },
    { x: -580, y: -44, w: 160, h: 72, kind: 'solid', ledges: true },
    { x: 420, y: -44, w: 160, h: 72, kind: 'solid', ledges: true },
    { x: -214, y: -88, w: 84, h: 6, kind: 'pass' },
    { x: 130, y: -88, w: 84, h: 6, kind: 'pass' },
    { x: -42, y: -156, w: 84, h: 6, kind: 'pass' },
    { x: -520, y: -132, w: 76, h: 6, kind: 'pass' },
    { x: 444, y: -132, w: 76, h: 6, kind: 'pass' },
    { x: -372, y: -64, w: 70, h: 6, kind: 'pass', move: { axis: 'y', amplitude: 30, period: 420 } },
    { x: 302, y: -64, w: 70, h: 6, kind: 'pass', move: { axis: 'y', amplitude: 30, period: 420, phase: 0.5 } },
    { x: -60, y: -236, w: 120, h: 6, kind: 'pass', move: { axis: 'x', amplitude: 130, period: 720 } },
  ],
  blast: { left: -900, right: 900, top: -620, bottom: 440 },
  spawns: [
    { x: -150, y: -4 },
    { x: 150, y: -4 },
    { x: -50, y: -4 },
    { x: 50, y: -4 },
  ],
  background: { topColor: 0x4a2a6a, bottomColor: 0xf0a860, layers: ['clouds'], theme: 'dawn', light: { rim: 0xffe0b0, dir: [0.85, -0.5], strength: 0.25 } },
  music: 'dawn',
  blurb: 'The large stage: wide blast zones, floating islands across the gaps and tiers of platforms.',
};
