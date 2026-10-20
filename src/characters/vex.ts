import type { CharacterBehavior } from '../engine/behavior';
import { detonateDeployable } from '../engine/entityCombat';
import { moveTotal, parseMoves, validateReferences, type CharacterJson } from '../engine/moves';
import type { CharacterData } from '../engine/types';
import { applyMovePoses } from '../engine/movePoses';
import { addMotionRows, standardAnimations } from './common';
import movesJson from './vex.moves.json';
import fxJson from './vex.fx.json';
import { validateFx, type CharacterFx } from '../engine/fxTypes';

const fx = fxJson as unknown as CharacterFx;
validateFx('vex', fx);

const json = movesJson as unknown as CharacterJson;
const MARKER_LIFE = 180; // 3 seconds

/**
 * Vex: fast space-pirate rogue. Hit-and-run, mixups and traps.
 * BLINK TRAIL: any teleport (Blink Strike, Shadow Climb) leaves a glowing marker at the departure point for
 * 3 seconds. Pressing neutral special again recalls Vex to it (invulnerable on arrival). One marker at a time.
 * Blink Strike can be used once per airtime.
 */
const behavior: CharacterBehavior = {
  onTick(f, world) {
    if (f.grounded || f.state === 'ledge') f.res.blinkAir = 1;
    // HUD seam: remaining marker time (0..100)
    const m = world.findDeployables(f.id, 'marker')[0];
    f.res.markerTime = m ? Math.max(0, (1 - m.age / MARKER_LIFE) * 100) : 0;
  },
  chooseMove(f, id, world) {
    // Snare Mine: press down special again to set it off by remote (once it is armed)
    if (id === 'downB') return world.findDeployables(f.id, 'mine').some((m) => m.age >= (m.def?.armFrames ?? 0)) ? 'detonate' : id;
    if (id !== 'neutralB') return id;
    if (world.findDeployables(f.id, 'marker').length > 0) return 'recall'; // press special again to return
    if (!f.grounded && (f.res.blinkAir ?? 0) <= 0) return null; // one air blink per airtime
    return 'neutralB';
  },
  onMoveStart(f, m) {
    if (m.id === 'neutralB' && !f.grounded) f.res.blinkAir = 0;
  },
  onMoveEvent(f, name, args, world) {
    if (name !== 'detonate') return;
    for (const m of world.findDeployables(f.id, 'mine')) detonateDeployable(world, m, args[0] ?? 36);
  },
  onHitDealt(f, _victim, hb) {
    // Dive Kick bounces off the opponent (the kick itself, not a mine or bolt landing meanwhile)
    if (f.move?.id === 'dair' && f.move.hitboxes.includes(hb)) {
      f.vy = -6.2;
      f.vx *= -0.3;
      f.moveFrame = Math.max(f.moveFrame, moveTotal(f.move) - 6); // skip to the tail so Vex regains control quickly
    }
  },
};

const moves = parseMoves(json as never, 'vex');
validateReferences(moves, json.projectiles, json.deployables, 'vex');

export const vex: CharacterData = {
  id: 'vex',
  fx,
  name: 'Vex',
  tagline: 'Space-pirate rogue. Blink, bait, and vanish.',
  difficulty: 3,
  persona: {
    intro: 'Vex came for the vault beneath the arena. The only door is the Ladder, and the Ladder only opens for winners.',
    taunt: 'Catch me if you can. You cannot.',
    epilogue: 'The vault was empty, except for a single note: "Thanks for the distraction." Vex laughs all the way up the stairs.',
    victory: 'Too slow. Again.',
  },
  stats: {
    weight: 98,
    runSpeed: 3.0,
    airSpeed: 2.2,
    groundAccel: 0.42,
    groundFriction: 0.4,
    airAccel: 0.2,
    airFriction: 0.06,
    gravity: 0.4,
    fallSpeed: 5.4,
    fastFallSpeed: 8.6,
    jumpHeight: 70,
    shortHopHeight: 32,
    doubleJumpHeight: 60,
    doubleJumps: 2,
    jumpsquatFrames: 3,
  },
  body: { width: 16, height: 26, footHalfWidth: 5 },
  wallJump: true,
  dash: { speed: 5.4, frames: 11, invuln: [2, 7], cooldown: 22 },
  sprite: {
    frameSize: 160,
    pixelScale: 0.29,
    animations: standardAnimations(['castF', 'castU', 'castD', 'dashS', 'raid']),
    placeholder: {
      art: 'hi',
      skin: '#e8b890',
      armor: '#2f7f95',
      armorDark: '#183a52',
      accent: '#ff4fa8',
      outline: '#0c1022',
      build: { shoulderW: 11, torsoH: 9.5, legH: 13, headSize: 5.5, armLen: 8.5, helmet: 'hood' },
      weapon: 'blades',
      extras: ['scarf', 'bracer'],
    },
  },
  moves,
  deployables: json.deployables,
  resources: { blinkAir: 1, markerTime: 0 },
  ultimate: { cost: 100, gainDealt: 0.3, gainTaken: 0.4 },
  hud: { resource: 'markerTime', max: 100, color: 0x7fe8ff, hotAt: 101 },
  behavior,
};

applyMovePoses(vex);
addMotionRows(vex); // full-motion rows (after the prune in applyMovePoses)
