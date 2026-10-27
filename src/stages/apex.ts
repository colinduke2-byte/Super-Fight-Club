import type { StageBackground, StageData } from '../engine/types';

/** (Its own backdrop and structure theme; engine/types' theme union does not list it yet.) */
const APEX_THEME = 'apex' as NonNullable<StageBackground['theme']>;

/**
 * The Apex: the Overseer's chamber at the top of the arena, the Arcade Ladder's final stage (also in Stage Select). One
 * long dais built for a boss 1.6x a fighter's size, with two low ledges either side to dodge the Cataclysm's pillars and
 * a high perch over the middle. No hazards: the boss is the hazard. Its own 'apex' look: the Overseer's throne-citadel above
 * the clouds at the top of the world, an ivory dais on an obsidian spire under the vast shadow of its spire crown and eye.
 * The sky, the crown's eye and the light rig (ui/BossCinematic.ts) turn from cold violet to burning red in phase 2.
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
  background: { topColor: 0x05030c, bottomColor: 0x4a2a6a, layers: ['stars'], theme: APEX_THEME, light: { rim: 0xc8a8ff, dir: [0, -1], strength: 0.5 } },
  music: 'boss',
  blurb: 'The Overseer\'s chamber at the top of the arena. A long dais, two low platforms, one high perch, nowhere to hide.',
};
