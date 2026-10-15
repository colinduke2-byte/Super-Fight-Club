import type { StageData } from '../engine/types';

/**
 * The Apex: the Overseer's chamber at the top of the arena, the Arcade Ladder's final stage (not in Stage Select). One
 * long dais built for a boss 1.6x a fighter's size, with two low ledges either side to dodge the Cataclysm's pillars and
 * a high perch over the middle. No hazards: the boss is the hazard. Its light rig (cold cyan in phase 1, red in phase 2)
 * is drawn by ui/BossCinematic.ts over the stock 'void' backdrop.
 */
export const apexStage: StageData = {
  id: 'apex',
  name: 'The Apex',
  platforms: [
    { x: -240, y: 0, w: 480, h: 80, kind: 'solid', ledges: true },
    { x: -200, y: -86, w: 84, h: 6, kind: 'pass' },
    { x: 116, y: -86, w: 84, h: 6, kind: 'pass' },
    { x: -46, y: -164, w: 92, h: 6, kind: 'pass' },
  ],
  blast: { left: -640, right: 640, top: -500, bottom: 360 },
  spawns: [
    { x: -150, y: -4 },
    { x: 150, y: -4 },
    { x: -60, y: -4 },
    { x: 60, y: -4 },
  ],
  background: { topColor: 0x04030c, bottomColor: 0x241048, layers: ['stars'], theme: 'void' },
  music: 'boss',
  blurb: 'The Overseer\'s chamber at the top of the arena. A long dais, two low ledges, one high perch, nowhere to hide.',
};
