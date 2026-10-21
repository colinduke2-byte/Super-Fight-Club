import type { StageData } from '../engine/types';

/**
 * Harbour Pier: a night harbour. A long timber pier runs from the sea end (left, a ledge over the water) out into the
 * container docks on the right, past the edge of the screen: the right side is a walk-off, with no edge to hang on and
 * nothing to recover to (walking or being sent out that way is a KO). Lamp gantries above, and a cargo pallet swinging
 * up and down on the crane over the dock.
 */
export const harbourStage: StageData = {
  id: 'harbour',
  name: 'Harbour Pier',
  platforms: [
    { x: -210, y: 0, w: 900, h: 56, kind: 'solid', ledges: true },
    { x: -168, y: -78, w: 72, h: 6, kind: 'pass' },
    { x: 34, y: -98, w: 84, h: 6, kind: 'pass' },
    { x: 236, y: -96, w: 72, h: 6, kind: 'pass', move: { axis: 'y', amplitude: 34, period: 540 } },
  ],
  blast: { left: -580, right: 560, top: -460, bottom: 340 },
  walkOff: { right: true },
  spawns: [
    { x: -130, y: -4 },
    { x: 130, y: -4 },
    { x: -40, y: -4 },
    { x: 50, y: -4 },
  ],
  background: { topColor: 0x060a1c, bottomColor: 0x1c3a5a, layers: ['stars'], theme: 'harbour', light: { rim: 0xffd49a, dir: [0.6, -0.8], strength: 0.45 } },
  music: 'cove',
  blurb: 'A night pier running into the docks: the right side is a walk-off with no edge to grab. Two lamp gantries and a swinging crane pallet.',
};
