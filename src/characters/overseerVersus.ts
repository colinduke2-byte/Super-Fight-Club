import { parseMoves, validateReferences, type CharacterJson } from '../engine/moves';
import type { CharacterData } from '../engine/types';
import { applyMovePoses } from '../engine/movePoses';
import { ALT_LOOKS, OUTFIT_NAMES } from '../art/palettes';
import { standardAnimations } from './common';
import { overseer } from './overseer';
import movesJson from './overseerVersus.moves.json';

const json = movesJson as unknown as CharacterJson;

/** Frame size of the playable Overseer's sheet: 15 x 15 cells of it fit the 4096px texture limit. */
const VERSUS_FRAME = 272;

/** Roster id of the playable Overseer (the boss keeps the id `overseer`). */
export const OVERSEER_VERSUS_ID = 'overseer-versus';

const moves = parseMoves(json as never, OVERSEER_VERSUS_ID);
validateReferences(moves, json.projectiles, json.deployables, OVERSEER_VERSUS_ID);

/**
 * The Overseer as a roster fighter (versus, training, random, replays): the boss's art, claws, eye beam and blade spires at
 * a fighter's size (the boss is 1.6x), with a full moveset, normal stats and meter, and no boss HP, armour or scripts. Its
 * ultimate is a smaller Cataclysm: six spires burst from the floor around it after a telegraph. The arcade boss is still
 * `overseer` (ai/boss.ts drives it); this entry never takes the boss slot.
 */
export const overseerVersus: CharacterData = {
  id: OVERSEER_VERSUS_ID,
  fx: overseer.fx,
  name: 'The Overseer',
  tagline: 'The arena AI, cut down to fighting size.',
  difficulty: 3,
  persona: {
    intro: 'The arena AI has watched every fight ever held here. Tonight it steps into the ring in a body built to scale.',
    bio: 'The arena AI in a body cut down to fighting size: the same claws, the same eye, the same blade spires, and none of the boss\'s armour. It wants to learn what the fighters feel.',
    taunt: 'Every blow you throw is already counted.',
    taunts: ['Every blow you throw is already counted.', 'This body is smaller. The math is not.', 'Your pattern repeats. Correcting.'],
    epilogue: 'The Overseer files the result, then plays it back, and back again. For the first time it is not sure what it is looking at.',
    victory: 'Result recorded.',
    victories: ['Result recorded.', 'Prediction confirmed.', 'You may try again. I will remember this one.'],
    rival: { taunt: 'Gizmo. You wrote my first line of code. I have questions about the rest.', victory: 'Thank you for building me. I will take it from here.' },
  },
  stats: {
    weight: 115,
    runSpeed: 1.9,
    airSpeed: 1.55,
    groundAccel: 0.2,
    groundFriction: 0.28,
    airAccel: 0.12,
    airFriction: 0.035,
    gravity: 0.62,
    fallSpeed: 8.4,
    fastFallSpeed: 11.6,
    jumpHeight: 74,
    shortHopHeight: 32,
    doubleJumpHeight: 54,
    doubleJumps: 1,
    jumpsquatFrames: 5,
  },
  // the boss's body (36 x 54) at a fighter's scale
  body: { width: 22, height: 34, footHalfWidth: 9 },
  sprite: {
    // the boss's body at its own pixel size, shown at 1/1.6 of the boss's 0.25 world size; the frame is shorter than the
    // boss's 320 (the drawer gives this body a compact crown in it) so a fighter's full set of rows fits in one sheet
    frameSize: VERSUS_FRAME,
    pixelScale: (0.25 / 1.6) * (320 / VERSUS_FRAME),
    portrait: overseer.sprite.portrait,
    animations: standardAnimations(['castF', 'castU', 'castD', 'raid']),
    // a fighter's build of the same body: shorter in the leg and torso, the head (and its eye) a size up, so it stands in
    // its frame with the crown clear of the top and reads at a fighter's size
    placeholder: { ...overseer.sprite.placeholder, build: { ...overseer.sprite.placeholder.build, shoulderW: 28, torsoH: 22, legH: 18, headSize: 8.5, armLen: 20 } },
  },
  moves,
  projectiles: json.projectiles,
  deployables: json.deployables,
  // the shared fx read `res:enrage` for their colour: held at 0 here (phase-1 violet)
  resources: { enrage: 0 },
  ultimate: { cost: 100, gainDealt: 0.2, gainTaken: 0.35 },
};

applyMovePoses(overseerVersus);
// the boss's transition and results rows; every move (each jab, tilt, smash, aerial, throw and special, and its own taunt)
// has a row of its own in overseerVersus.moves.json, drawn wind-up, anticipation, strike, follow-through and recovery
Object.assign(overseerVersus.sprite.animations, {
  land: { frames: 2, fps: 20, loop: false },
  getup: { frames: 3, fps: 10, loop: false },
  dizzy: { frames: 4, fps: 6, loop: true },
  victory: { frames: 4, fps: 8, loop: false },
  victoryHold: { frames: 2, fps: 3, loop: true },
  lose: { frames: 2, fps: 2, loop: true },
});

// palettes: three colourways of its own look, the boss's phase-2 transformation as outfit 1, and a bare-frame outfit 2
OUTFIT_NAMES[OVERSEER_VERSUS_ID] = ['STANDARD', 'OVERLOAD', 'WARDEN'];
ALT_LOOKS[OVERSEER_VERSUS_ID] = [
  { armor: '#2a2a34', armorDark: '#0c0c14', accent: '#4ae8ff', name: 'VOID' },
  { armor: '#d8c890', armorDark: '#4a3a1a', accent: '#ffd35a', name: 'GILDED' },
  { armor: '#b8d0e0', armorDark: '#1a2a3a', accent: '#5aff9a', name: 'GLASS' },
  { armor: '#9c8e86', armorDark: '#1c0c10', accent: '#ff4a2a', name: 'RAGE', outfit: 1 },
  { armor: '#4a4a5a', armorDark: '#141018', accent: '#ffb02e', name: 'EMBER', outfit: 1 },
  { armor: '#8a8a96', armorDark: '#2a2a36', accent: '#ff3a6a', name: 'STEEL', outfit: 2 },
  { armor: '#e8e4f4', armorDark: '#5a4a7a', accent: '#7ac8ff', name: 'HALO', outfit: 2 },
];
