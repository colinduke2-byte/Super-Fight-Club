import type { CharacterBehavior } from '../engine/behavior';
import { parseMoves, validateReferences, type CharacterJson } from '../engine/moves';
import type { CharacterData } from '../engine/types';
import { applyMovePoses } from '../engine/movePoses';
import { soakThrowBonus } from './riptideSoak';
import { addMotionRows, standardAnimations } from './common';
import movesJson from './riptide.moves.json';
import fxJson from './riptide.fx.json';
import { validateFx, type CharacterFx } from '../engine/fxTypes';

const fx = fxJson as unknown as CharacterFx;
validateFx('riptide', fx);

const json = movesJson as unknown as CharacterJson;
const moves = parseMoves(json as never, 'riptide');
validateReferences(moves, json.projectiles, json.deployables, 'riptide');

const behavior: CharacterBehavior = {
  // throws (and the Shark Lunge bite) on a soaked rival wring the water out for extra damage and launch
  onHitDealt(f, victim, hb, damage, world) {
    if (f.move?.kind !== 'throw' || !f.move.hitboxes.includes(hb)) return;
    const lvl = victim.soakLevel;
    if (lvl <= 0) return;
    const b = soakThrowBonus(lvl);
    const extra = damage * (b.damage - 1);
    victim.damage += extra;
    world.damageDealt[f.id] = (world.damageDealt[f.id] ?? 0) + extra;
    victim.vx *= b.launch;
    victim.vy *= b.launch;
    victim.status.soak = 0;
    world.emit('status', victim, victim.x, victim.y - victim.h / 2, 0, 4);
  },
};

/**
 * Riptide: a cyber-shark gladiator, the grappler. An anchor on a chain for reach, a shark's jaws for a command grab,
 * and water: his tidal moves SOAK rivals, and his throws wring the soak out for extra damage and launch.
 */
export const riptide: CharacterData = {
  id: 'riptide',
  fx,
  name: 'Riptide',
  tagline: 'Cyber-shark grappler. Soak them, then drag them under.',
  difficulty: 2,
  persona: {
    intro: 'Riptide was bred in the flooded pits under the arena, a gladiator in a shark\'s skin. The tide has risen. So has he.',
    taunt: 'You can swim, right? Doesn\'t matter.',
    epilogue: 'At the top of the Ladder Riptide broke the floodgates open. The whole arena went under, and for the first time in years he was home.',
    victory: 'Tide\'s out. So are you.',
  },
  stats: {
    weight: 102,
    runSpeed: 2.05,
    airSpeed: 1.75,
    groundAccel: 0.26,
    groundFriction: 0.3,
    airAccel: 0.17,
    airFriction: 0.045,
    gravity: 0.5,
    fallSpeed: 6.6,
    fastFallSpeed: 9.8,
    jumpHeight: 66,
    shortHopHeight: 30,
    doubleJumpHeight: 50,
    doubleJumps: 1,
    jumpsquatFrames: 4,
  },
  body: { width: 19, height: 28, footHalfWidth: 6 },
  sprite: {
    frameSize: 176,
    frameWidth: 208, // room for the anchor and chain
    pixelScale: 0.29,
    animations: standardAnimations(['castF', 'castD']),
    placeholder: {
      art: 'hi',
      skin: '#9fb6c8',
      armor: '#2f7fa8',
      armorDark: '#163a5e',
      accent: '#ff7a4a',
      outline: '#0a1424',
      build: { shoulderW: 15, torsoH: 11.5, legH: 10, headSize: 7.5, armLen: 10.5, helmet: 'fin' },
      weapon: 'anchor',
    },
  },
  moves,
  projectiles: json.projectiles,
  deployables: json.deployables,
  resources: {},
  ultimate: { cost: 100, gainDealt: 0.28, gainTaken: 0.42 },
  behavior,
};

applyMovePoses(riptide);
addMotionRows(riptide); // full-motion rows (after the prune in applyMovePoses)
