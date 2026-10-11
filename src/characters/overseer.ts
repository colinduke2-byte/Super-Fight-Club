import type { CharacterBehavior } from '../engine/behavior';
import { parseMoves, validateReferences, type CharacterJson } from '../engine/moves';
import type { CharacterData } from '../engine/types';
import { standardAnimations } from './common';
import movesJson from './overseer.moves.json';

const json = movesJson as unknown as CharacterJson;

const behavior: CharacterBehavior = {
  onTick(f) {
    // phase 2 (set by the boss script): hits harder
    f.damageMult = f.res.enrage > 0 ? 1.35 : 1;
  },
};

const moves = parseMoves(json as never, 'overseer');
validateReferences(moves, json.projectiles, json.deployables, 'overseer');

/**
 * The Overseer: the arena AI's warden body and the Arcade Ladder's final boss. Not in the roster. Huge, extremely heavy,
 * armored; its attacks are driven by the scripted pattern controller in `ai/boss.ts` (telegraphs, then punishes).
 */
export const overseer: CharacterData = {
  id: 'overseer',
  name: 'The Overseer',
  tagline: 'The arena AI. It has been waiting for you.',
  persona: {
    intro: '',
    taunt: 'Challenger. The arena has counted every blow you threw, and has decided that you are surplus.',
    epilogue: '',
  },
  stats: {
    weight: 300,
    runSpeed: 2.2,
    airSpeed: 1.5,
    groundAccel: 0.2,
    groundFriction: 0.3,
    airAccel: 0.1,
    airFriction: 0.05,
    gravity: 0.6,
    fallSpeed: 7.5,
    fastFallSpeed: 10,
    jumpHeight: 70,
    shortHopHeight: 30,
    doubleJumpHeight: 50,
    doubleJumps: 1,
    jumpsquatFrames: 6,
  },
  body: { width: 36, height: 54, footHalfWidth: 14 },
  sprite: {
    frameSize: 64,
    pixelScale: 0.95,
    animations: standardAnimations(['castF', 'castU', 'castD', 'raid']),
    placeholder: {
      skin: '#ff6a7a',
      armor: '#4a4668',
      armorDark: '#24203c',
      accent: '#ff4a6a',
      outline: '#0a0810',
      build: { shoulderW: 22, torsoH: 12, legH: 7, headSize: 11, armLen: 9, helmet: 'pointed' },
      weapon: 'piston',
      extras: ['cloak', 'bracer'],
    },
  },
  moves,
  projectiles: json.projectiles,
  deployables: json.deployables,
  resources: { enrage: 0 },
  ultimate: { cost: 100, gainDealt: 0, gainTaken: 0 },
  behavior,
};
