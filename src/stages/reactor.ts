import type { StageData } from '../engine/types';

/**
 * Reactor Core: a short main stage, two moving platforms, and a plasma geyser in the middle that erupts every
 * ten seconds (1.5 s warning). The geyser hurts and launches upward but never KOs outright, so it is a
 * positioning pressure, not a coin flip.
 */
export const reactorStage: StageData = {
  id: 'reactor',
  name: 'Reactor Core',
  platforms: [
    { x: -140, y: 0, w: 280, h: 70, kind: 'solid', ledges: true },
    { x: -34, y: -92, w: 68, h: 6, kind: 'pass', move: { axis: 'x', amplitude: 120, period: 540 } },
    { x: -230, y: -40, w: 52, h: 6, kind: 'pass', move: { axis: 'y', amplitude: 40, period: 400 } },
    { x: 178, y: -40, w: 52, h: 6, kind: 'pass', move: { axis: 'y', amplitude: 40, period: 400, phase: 0.5 } },
  ],
  hazards: [{ kind: 'geyser', x: 0, y: 0, w: 44, h: 130, period: 600, offset: 0, warn: 90, active: 36, damage: 12, base: 55, scaling: 1.0, angle: 88 }],
  blast: { left: -520, right: 520, top: -430, bottom: 340 },
  spawns: [
    { x: -90, y: -4 },
    { x: 90, y: -4 },
    { x: -60, y: -4 },
    { x: 60, y: -4 },
  ],
  background: { topColor: 0x240808, bottomColor: 0xc0501a, layers: ['stars', 'ruins'], theme: 'reactor' },
  music: 'reactor',
};
