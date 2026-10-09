import { parseMoves } from '../engine/moves';
import type { CharacterData } from '../engine/types';
import movesJson from './brick.moves.json';

/**
 * Brick: heavy cyber-knight bruiser. Slow and floaty-heavy to move, hard to launch.
 * (Attacks, armored smashes and the ground-pound ultimate land in the combat milestone.)
 */
export const brick: CharacterData = {
  id: 'brick',
  name: 'Brick',
  tagline: 'Heavy cyber-knight. Slow, armored, brutal.',
  stats: {
    weight: 125,
    runSpeed: 2.0,
    airSpeed: 1.5,
    groundAccel: 0.22,
    groundFriction: 0.28,
    airAccel: 0.12,
    airFriction: 0.05,
    gravity: 0.52,
    fallSpeed: 7.0,
    fastFallSpeed: 10.5,
    jumpHeight: 80,
    shortHopHeight: 36,
    doubleJumpHeight: 66,
    doubleJumps: 1,
    jumpsquatFrames: 4,
  },
  body: { width: 20, height: 28, footHalfWidth: 7 },
  sprite: {
    frameSize: 64,
    pixelScale: 0.5,
    animations: {
      idle: { frames: 4, fps: 5, loop: true },
      run: { frames: 6, fps: 11, loop: true },
      crouch: { frames: 1, fps: 1, loop: false },
      jump: { frames: 1, fps: 1, loop: false },
      fall: { frames: 1, fps: 1, loop: false },
      ledge: { frames: 1, fps: 1, loop: false },
      hurt: { frames: 1, fps: 1, loop: false },
      down: { frames: 1, fps: 1, loop: false },
      ko: { frames: 1, fps: 1, loop: false },
      // attack poses: frame 0 = wind-up, 1 = active, 2 = recovery (the view picks the frame from the move phase)
      jab: { frames: 3, fps: 1, loop: false },
      smashF: { frames: 3, fps: 1, loop: false },
      smashU: { frames: 3, fps: 1, loop: false },
      smashD: { frames: 3, fps: 1, loop: false },
      aerialN: { frames: 3, fps: 1, loop: false },
      aerialF: { frames: 3, fps: 1, loop: false },
      aerialB: { frames: 3, fps: 1, loop: false },
      aerialU: { frames: 3, fps: 1, loop: false },
      aerialD: { frames: 3, fps: 1, loop: false },
      grab: { frames: 2, fps: 1, loop: false },
      shield: { frames: 1, fps: 1, loop: false },
      dodge: { frames: 1, fps: 1, loop: false },
    },
    placeholder: {
      skin: '#f2c9a0',
      armor: '#4a78c8',
      armorDark: '#2c4a8a',
      accent: '#ffb02e',
      outline: '#10142a',
      build: { shoulderW: 18, torsoH: 10, legH: 8, headSize: 8, armLen: 8, helmet: 'visor' }, // 32px-grid units; the generator doubles them for the 64px frame
    },
  },
  moves: parseMoves(movesJson as never, 'brick'),
};
