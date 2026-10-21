import type { CharacterBehavior } from '../engine/behavior';
import { parseMoves, validateReferences, type CharacterJson } from '../engine/moves';
import type { CharacterData } from '../engine/types';
import { applyMovePoses } from '../engine/movePoses';
import { validateFx, type CharacterFx } from '../engine/fxTypes';
import { standardAnimations } from './common';
import movesJson from './overseer.moves.json';
import fxJson from './overseer.fx.json';

const fx = fxJson as unknown as CharacterFx;
validateFx('overseer', fx);

const json = movesJson as unknown as CharacterJson;

/** Phase-2 damage multiplier (set while `res.enrage` is on). */
export const ENRAGE_DAMAGE = 1.35;

const behavior: CharacterBehavior = {
  onTick(f) {
    // phase 2 (set by the boss script): hits harder
    f.damageMult = f.res.enrage > 0 ? ENRAGE_DAMAGE : 1;
  },
  // the boss script asks for the phase-2 roar through the taunt input (Ultimate with an empty meter): while a roar is
  // pending the taunt becomes the roar
  remapMove(f, id) {
    return id === 'taunt' && f.res.roar > 0 ? 'roar' : id;
  },
  onMoveStart(f, move) {
    if (move.id === 'roar') f.res.roar = 0;
  },
};

const moves = parseMoves(json as never, 'overseer');
validateReferences(moves, json.projectiles, json.deployables, 'overseer');

/**
 * The Overseer: the arena AI's warden body and the Arcade Ladder's final boss. Not in the roster. Huge (about 1.6x a
 * fighter), extremely heavy, armored; its attacks are driven by the scripted pattern controller in `ai/boss.ts`
 * (telegraphs, then punishes). Phase 2 (`res.enrage`) hits harder and has its own sheet: see `overseerPhase2`.
 */
export const overseer: CharacterData = {
  id: 'overseer',
  fx,
  name: 'The Overseer',
  tagline: 'The arena AI. It has been waiting for you.',
  persona: {
    intro: '',
    taunt: 'Challenger. The arena has counted every blow you threw, and has decided that you are surplus.',
    epilogue: '',
    victory: 'Surplus removed.',
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
    frameSize: 320,
    pixelScale: 0.25,
    portrait: [76, 64, 128],
    animations: standardAnimations(['castF', 'castU', 'castD', 'raid']),
    placeholder: {
      art: 'hi',
      skin: '#ff6a7a',
      // ivory plate over an obsidian frame, one cold violet light (phase 2 turns it red-hot)
      armor: '#ddd5c6',
      armorDark: '#221d2e',
      accent: '#b685ff',
      outline: '#08060e',
      // a towering build, not a fighter's: small head, long torso, legs and arms (the drawer is in art/hero/overseer.ts)
      build: { shoulderW: 30, torsoH: 26, legH: 20, headSize: 8, armLen: 22, helmet: 'monolith' },
      weapon: 'piston',
      extras: ['cloak', 'bracer'],
    },
  },
  moves,
  projectiles: json.projectiles,
  deployables: json.deployables,
  resources: { enrage: 0, roar: 0 },
  ultimate: { cost: 100, gainDealt: 0, gainTaken: 0 },
  behavior,
};

applyMovePoses(overseer);
// the results podium and the boss's own transitions: a defeat kneel, a victory with its held end pose, landing, getting up
// and a stun (kept to 17 frames so the sheet stays inside 12 x 11 cells)
Object.assign(overseer.sprite.animations, {
  land: { frames: 2, fps: 20, loop: false },
  getup: { frames: 3, fps: 10, loop: false },
  dizzy: { frames: 4, fps: 6, loop: true },
  victory: { frames: 4, fps: 8, loop: false },
  victoryHold: { frames: 2, fps: 3, loop: true },
  lose: { frames: 2, fps: 2, loop: true },
});

/** Texture / animation id of the enraged sheet (phase 2). */
export const OVERSEER_PHASE2_SKIN = 'overseer~rage';

/**
 * The phase-2 look as its own character data (same moves and frame layout, its own sheet id): the light turns red-hot, the
 * ivory scorches, and the drawer's `outfit 1` transforms the body: the mask splits and loses its jaw, the eye turns to a
 * slit with a second ring, the spire crown shatters over a ring of embers, the robe hangs loose on fire, energy blades burn
 * along the forearms and shell shards orbit it. Build it like an outfit (`buildSheetPixels(sheetSpec(overseerPhase2))` + `registerPixels`) and
 * show it by giving the boss's FighterView the skin `OVERSEER_PHASE2_SKIN` (see ui/BossCinematic.ts).
 */
export const overseerPhase2: CharacterData = {
  ...overseer,
  id: OVERSEER_PHASE2_SKIN,
  sprite: { ...overseer.sprite, placeholder: { ...overseer.sprite.placeholder, armor: '#9c8e86', armorDark: '#1c0c10', accent: '#ff4a2a', outfit: 1 } },
};
