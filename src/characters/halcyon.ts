import type { CharacterBehavior } from '../engine/behavior';
import { parseMoves, validateReferences, validateVariants, type CharacterJson } from '../engine/moves';
import type { CharacterData } from '../engine/types';
import { applyMovePoses } from '../engine/movePoses';
import { DEALT_RATE, GALE_MAX, LEVEL_AT, galeSpeed, galeTick } from './halcyonGale';
import { standardAnimations } from './common';
import movesJson from './halcyon.moves.json';
import fxJson from './halcyon.fx.json';
import { validateFx, type CharacterFx } from '../engine/fxTypes';

const fx = fxJson as unknown as CharacterFx;
validateFx('halcyon', fx);

const json = movesJson as unknown as CharacterJson;
const moves = parseMoves(json as never, 'halcyon');
validateReferences(moves, json.projectiles, json.deployables, 'halcyon');

/** The Javelin upgrades with Gale: `neutralB_0..2`, picked by `res.level`. */
const variants = { neutralB: { key: 'level', ids: ['neutralB_0', 'neutralB_1', 'neutralB_2'] } };
validateVariants(variants, moves, 'halcyon');

const behavior: CharacterBehavior = {
  onTick(f) {
    f.res.gale = galeTick(f.res.gale ?? 0, !f.grounded && f.state !== 'ledge' && f.state !== 'ledgeClimb');
    f.speedBonus = galeSpeed(f.res.level ?? 0); // the level is derived from the gale by the resource rule
  },
};

/** Only the rows she uses (every attack has its own pose row), so the big frames stay within the texture budget. */
function halcyonAnimations(): CharacterData['sprite']['animations'] {
  const std = standardAnimations(['glide']);
  const keep = ['idle', 'run', 'walk', 'dash', 'skid', 'crouch', 'jump', 'fall', 'glide', 'ledge', 'hurt', 'hurtL', 'hurtU', 'hurtD', 'down', 'ko', 'roll', 'held', 'shield', 'dodge'];
  const out: CharacterData['sprite']['animations'] = {};
  for (const k of keep) out[k] = std[k];
  out.jump = { frames: 3, fps: 10, loop: true }; // wing flap cycle
  out.fall = { frames: 2, fps: 6, loop: true };
  out.glide = { frames: 2, fps: 5, loop: true };
  return out;
}

/**
 * Halcyon: a storm-winged lancer. A long spear (sweet-spotted at the tip) and wings: three air flaps and a held-Jump glide.
 * GALE builds in the air and from landing hits; spend it on the Javelin volley, or ride it for a little extra speed.
 */
export const halcyon: CharacterData = {
  id: 'halcyon',
  fx,
  variants,
  resourceRules: [{ key: 'gale', max: GALE_MAX, gainDealt: DEALT_RATE, levels: { key: 'level', at: [...LEVEL_AT] } }],
  name: 'Halcyon',
  tagline: 'Storm-winged lancer. Own the sky, strike from the tip.',
  difficulty: 3,
  persona: {
    intro: 'Halcyon kept the sky-gate until the storm took the sky. The only way back up is the Ladder, one bout at a time.',
    taunt: 'You fight on the ground. I fight where the wind starts.',
    epilogue: 'At the top of the Ladder the roof tore open. Halcyon spread both wings, caught the first real wind in years, and did not look down.',
  },
  stats: {
    weight: 101,
    runSpeed: 2.35,
    airSpeed: 2.5,
    groundAccel: 0.3,
    groundFriction: 0.32,
    airAccel: 0.2,
    airFriction: 0.05,
    gravity: 0.4,
    fallSpeed: 5.4,
    fastFallSpeed: 8.6,
    jumpHeight: 64,
    shortHopHeight: 30,
    doubleJumpHeight: 42,
    doubleJumps: 3,
    jumpsquatFrames: 4,
  },
  body: { width: 16, height: 29, footHalfWidth: 5 },
  glide: { fall: 1.05, speed: 1.15, max: 80, attack: 'glideAttack' },
  sprite: {
    frameSize: 240,
    frameWidth: 288, // room for the spear and the wings
    portrait: [73, 84, 96],
    pixelScale: 0.29,
    animations: halcyonAnimations(),
    placeholder: {
      art: 'hi',
      skin: '#f0cfa8',
      armor: '#dfe7f4',
      armorDark: '#6b7fb0',
      accent: '#ffd35a',
      outline: '#141a30',
      build: { shoulderW: 12, torsoH: 11, legH: 12.5, headSize: 6.5, armLen: 12, helmet: 'winged' },
      weapon: 'spear',
    },
  },
  moves,
  projectiles: json.projectiles,
  resources: { gale: 0, quiet: 0, level: 0 },
  ultimate: { cost: 100, gainDealt: 0.3, gainTaken: 0.45 },
  hud: { resource: 'gale', max: 100, color: 0xffd35a, hotAt: 66, marks: [33, 66] },
  behavior,
};

applyMovePoses(halcyon);
