import type { CharacterBehavior } from '../engine/behavior';
import { parseMoves, validateReferences, type CharacterJson } from '../engine/moves';
import type { CharacterData } from '../engine/types';
import { applyMovePoses } from '../engine/movePoses';
import { shatterPillars } from '../engine/pillars';
import { PILLAR_SLAM, pillarBehind } from './obeliskPillars';
import { standardAnimations } from './common';
import movesJson from './obelisk.moves.json';
import fxJson from './obelisk.fx.json';
import { validateFx, type CharacterFx } from '../engine/fxTypes';

const fx = fxJson as unknown as CharacterFx;
validateFx('obelisk', fx);

const json = movesJson as unknown as CharacterJson;
const moves = parseMoves(json as never, 'obelisk');
validateReferences(moves, json.projectiles, json.deployables, 'obelisk');

const behavior: CharacterBehavior = {
  // Bedrock Stomp: every one of Obelisk's pillars in range bursts into shards
  onMoveEvent(f, name, args, world) {
    if (name === 'shatter') shatterPillars(world, f.id, f.x, args[0] ?? 120);
  },
  // Rock Bottom into one of its own pillars: the rival is slammed through it for extra damage and launch
  onHitDealt(f, victim, hb, damage, world) {
    if (f.move?.id !== 'bthrow' || !f.move.hitboxes.includes(hb)) return;
    const d = pillarBehind(world, f.id, f.x, f.facing);
    if (!d) return;
    const extra = damage * (PILLAR_SLAM.damage - 1);
    victim.damage += extra;
    world.damageDealt[f.id] = (world.damageDealt[f.id] ?? 0) + extra;
    victim.vx *= PILLAR_SLAM.launch;
    victim.vy *= PILLAR_SLAM.launch;
    d.shatter = true;
    d.deactivate();
  },
};

/**
 * Obelisk: a grumpy living obelisk of granite and amethyst, the terrain builder (a light middleweight). Crystal Spire raises amethyst pillars (walls, platforms, shields
 * against shots); Shard Volley and Bedrock Stomp shatter them into flying shards; Upheaval rides a pillar up to recover.
 */
export const obelisk: CharacterData = {
  id: 'obelisk',
  fx,
  name: 'Obelisk',
  tagline: 'Crystal golem. Builds walls, then breaks them over your head.',
  difficulty: 4,
  persona: {
    intro: 'Obelisk slept under the arena for ten thousand years, until someone built a fighting pit on its roof. It has come up to complain.',
    taunt: 'Get out of my cave.',
    epilogue: 'Obelisk tore the Super Fight Club down to the bedrock and grew a mountain over the hole. It is quiet now. That is how it likes it.',
  },
  stats: {
    weight: 90,
    runSpeed: 2.02,
    airSpeed: 1.85,
    groundAccel: 0.24,
    groundFriction: 0.32,
    airAccel: 0.15,
    airFriction: 0.05,
    gravity: 0.5,
    fallSpeed: 6.5,
    fastFallSpeed: 9.6,
    jumpHeight: 66,
    shortHopHeight: 28,
    doubleJumpHeight: 52,
    doubleJumps: 1,
    jumpsquatFrames: 4,
  },
  body: { width: 17, height: 30, footHalfWidth: 6 },
  // pillar parkour: kick off the side of a pillar (or any wall)
  wallJump: true,
  sprite: {
    frameSize: 176,
    frameWidth: 200,
    pixelScale: 0.3,
    animations: standardAnimations(['castF', 'castD']),
    placeholder: {
      art: 'hi',
      skin: '#8e847a',
      armor: '#9a5ad6',
      armorDark: '#4a3a32',
      accent: '#d8b0ff',
      outline: '#140c1c',
      build: { shoulderW: 14, torsoH: 16, legH: 10.5, headSize: 7.5, armLen: 11, helmet: 'geode' },
    },
  },
  moves,
  projectiles: json.projectiles,
  deployables: json.deployables,
  resources: {},
  ultimate: { cost: 100, gainDealt: 0.28, gainTaken: 0.42 },
  behavior,
};

applyMovePoses(obelisk);
