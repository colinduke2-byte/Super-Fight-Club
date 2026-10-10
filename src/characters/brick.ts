import type { CharacterBehavior } from '../engine/behavior';
import { parseMoves, validateReferences } from '../engine/moves';
import type { CharacterData } from '../engine/types';
import movesJson from './brick.moves.json';
import { addHeat, decayHeat, HEAT_DAMAGE_BONUS, heatFromDealt, heatFromTaken, isHot, ventPower } from './brickHeat';

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
    runSpeed: 1.9,
    airSpeed: 1.3,
    groundAccel: 0.22,
    groundFriction: 0.28,
    airAccel: 0.12,
    airFriction: 0.05,
    gravity: 0.62,
    fallSpeed: 8.4,
    fastFallSpeed: 11.8,
    jumpHeight: 76,
    shortHopHeight: 34,
    doubleJumpHeight: 46,
    doubleJumps: 1,
    jumpsquatFrames: 5,
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
      chargeS: { frames: 3, fps: 1, loop: false },
      grapple: { frames: 3, fps: 1, loop: false },
      jet: { frames: 3, fps: 1, loop: false },
      vent: { frames: 3, fps: 1, loop: false },
      meltdown: { frames: 3, fps: 1, loop: false },
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
      build: { shoulderW: 21, torsoH: 12, legH: 8, headSize: 7, armLen: 9, helmet: 'visor' }, // 32px-grid units; the generator doubles them for the 64px frame
    },
  },
  moves: parseMoves(movesJson as never, 'brick'),
  resources: { heat: 0, quiet: 0, ventDmg: 1, ventKb: 1 },
  ultimate: { cost: 100, gainDealt: 0.2, gainTaken: 0.35 },
  hud: { resource: 'heat', max: 100, color: 0xff7a2a, hotAt: 50 },
  behavior: undefined as unknown as CharacterBehavior,
};
validateReferences(brick.moves, undefined, undefined, 'brick');

/** Heat: see brickHeat.ts for the numbers. State lives in `fighter.res` so it is deterministic and hashed. */
const heatBehavior: CharacterBehavior = {
  onTick(f) {
    f.res.quiet++;
    f.res.heat = decayHeat(f.res.heat, f.res.quiet);
    const m = f.move;
    const smash = m?.kind === 'smash';
    const hot = isHot(f.res.heat);
    const fullShoulder = m?.id === 'neutralB' && f.chargeFrac >= 1;
    // super-armor: smashes while hot, and a fully charged Charge Shoulder
    f.armorBonus = (smash && hot) || fullShoulder ? Infinity : 0;
    f.damageMult = smash && hot ? HEAT_DAMAGE_BONUS : m?.id === 'downB' ? f.res.ventDmg : 1;
    f.kbMult = m?.id === 'downB' ? f.res.ventKb : 1;
  },
  onMoveStart(f, m) {
    if (m.id === 'downB') {
      // Vent commits all the Heat: the burst scales with how much there was
      const p = ventPower(f.res.heat);
      f.res.ventDmg = p.damageMult;
      f.res.ventKb = p.kbMult;
      f.res.heat = 0;
    }
  },
  onHitDealt(f, _victim, _hb, damage) {
    const g = heatFromDealt(damage);
    if (g > 0) f.res.heat = addHeat(f.res.heat, g);
    f.res.quiet = 0;
  },
  onHitTaken(f, _attacker, damage) {
    f.res.heat = addHeat(f.res.heat, heatFromTaken(damage));
    f.res.quiet = 0;
  },
};
brick.behavior = heatBehavior;
