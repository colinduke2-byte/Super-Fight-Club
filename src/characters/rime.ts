import type { CharacterBehavior } from '../engine/behavior';
import { moveTotal, parseMoves, validateReferences, type CharacterJson } from '../engine/moves';
import type { CharacterData } from '../engine/types';
import { applyMovePoses } from '../engine/movePoses';
import { standardAnimations } from './common';
import movesJson from './rime.moves.json';
import fxJson from './rime.fx.json';
import { validateFx, type CharacterFx } from '../engine/fxTypes';

const fx = fxJson as unknown as CharacterFx;
validateFx('rime', fx);

const json = movesJson as unknown as CharacterJson;
const moves = parseMoves(json as never, 'rime');
validateReferences(moves, json.projectiles, json.deployables, 'rime');

/** Rime skates on its own ice patches: run speed while standing on one. */
export const SKATE_SPEED = 1.22;

const behavior: CharacterBehavior = {
  onTick(f, world) {
    // skating: on its own ice Rime runs faster (rivals slip on it instead, see World.markIce)
    let skate = false;
    if (f.grounded) {
      for (const d of world.deployables) {
        if (d.active && d.owner === f.id && d.def?.slick && Math.abs(f.x - d.x) <= d.def.w / 2 && Math.abs(f.y - d.y) < 4) {
          skate = true;
          break;
        }
      }
    }
    f.speedBonus = skate ? SKATE_SPEED : 1;
    f.res.skate = skate ? 1 : 0;
  },
  onHitDealt(f, _victim, hb) {
    // Avalanche Kick bounces off the rival into the next hit (only the kick itself: a kunai landing meanwhile does not count)
    if (f.move?.id === 'dair' && f.move.hitboxes.includes(hb)) {
      f.vy = -6.4;
      f.vx *= -0.3;
      f.moveFrame = Math.max(f.moveFrame, moveTotal(f.move) - 6);
    }
  },
};

/**
 * Rime: a frost ninja, the lightest and fastest fighter. Three-frame jabs, two double jumps, a wall cling, and FROSTBITE:
 * nearly every hit adds a chill stack to the rival, and a full set of six freezes them solid for a free follow-up.
 * Ice Kunai (neutral), Frost Step (side: a slashing dash that leaves a slippery ice patch), Shatter Ascent (up: an icy
 * teleport that bursts on arrival), Substitution (down: a counter that leaves an ice decoy and strikes from behind).
 */
export const rime: CharacterData = {
  id: 'rime',
  fx,
  name: 'Rime',
  tagline: 'Frost ninja. Faster than the cold can bite.',
  difficulty: 4,
  persona: {
    intro: 'Rime guarded the Frostfang Shrine for a hundred winters. The arena stole its bell, so the snow came down to fetch it.',
    taunt: 'You will not feel the cut until spring.',
    epilogue: 'The bell rings once at the top of the mountain. Rime is already gone; only footprints in the snow remember the fight.',
    victory: 'Winter always wins.',
  },
  stats: {
    weight: 80,
    runSpeed: 3.3,
    airSpeed: 2.3,
    groundAccel: 0.46,
    groundFriction: 0.42,
    airAccel: 0.22,
    airFriction: 0.05,
    gravity: 0.52,
    fallSpeed: 6.6,
    fastFallSpeed: 10.4,
    jumpHeight: 70,
    shortHopHeight: 30,
    doubleJumpHeight: 58,
    doubleJumps: 2,
    jumpsquatFrames: 3,
  },
  body: { width: 15, height: 25, footHalfWidth: 5 },
  wallJump: true,
  sprite: {
    frameSize: 160,
    pixelScale: 0.29,
    animations: standardAnimations(['castF', 'castU', 'castD', 'dashS', 'raid']),
    placeholder: {
      art: 'hi',
      skin: '#f0d8c8',
      armor: '#4a8ad0',
      armorDark: '#1c3260',
      accent: '#bfeaff',
      outline: '#0a1424',
      build: { shoulderW: 10, torsoH: 9, legH: 13, headSize: 5.5, armLen: 8.5, helmet: 'kasa' },
      weapon: 'blades',
      extras: ['scarf'],
    },
  },
  moves,
  projectiles: json.projectiles,
  deployables: json.deployables,
  resources: { skate: 0 },
  ultimate: { cost: 100, gainDealt: 0.32, gainTaken: 0.42 },
  behavior,
};

applyMovePoses(rime);
