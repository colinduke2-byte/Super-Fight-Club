import type { CharacterBehavior } from '../engine/behavior';
import { parseMoves, validateReferences, type CharacterJson } from '../engine/moves';
import type { CharacterData } from '../engine/types';
import { applyMovePoses } from '../engine/movePoses';
import { addMotionRows } from './common';
import movesJson from './brick.moves.json';
import fxJson from './brick.fx.json';
import { validateFx, type CharacterFx } from '../engine/fxTypes';
import { DEALT_RATE, DECAY_DELAY, DECAY_RATE, HEAT_DAMAGE_BONUS, HEAT_MAX, HEAVY_HIT, isHot, TAKEN_RATE, ventPower } from './brickHeat';

const fx = fxJson as unknown as CharacterFx;
validateFx('brick', fx);
const json = movesJson as unknown as CharacterJson;

/** Tough Guy: hits up to this much damage never flinch Brick (more while Heat is hot). */
export const TOUGH = 2.2;
export const TOUGH_HOT = 4.5;
/** Crater Stomp's landing shockwave: speed of the two ground waves. */
const QUAKE_SPEED = 4.2;
/** Whirling Jet on the ground: top travel speed while the stick steers it. */
const GROUND_SPIN_SPEED = 2.6;

/**
 * Brick: heavy cyber-knight bruiser. Slow and floaty-heavy to move, hard to launch.
 * (Attacks, armored smashes and the ground-pound ultimate land in the combat milestone.)
 */
export const brick: CharacterData = {
  id: 'brick',
  fx,
  name: 'Brick',
  tagline: 'Heavy cyber-knight. Tough, armoured, brutal.',
  difficulty: 1,
  persona: {
    intro: 'Brick was built to guard a gate that fell long ago. Tonight he chooses to break the line instead of holding it.',
    bio: 'A cyber-knight built to guard a gate that fell long ago. Brick is slow to anger and slower to fall, and a hit that lands while he is armoured only makes the next swing hotter.',
    taunt: 'Not many get past me. Fewer get up.',
    // in-match taunt bubbles take turns through these
    taunts: [
      'Not many get past me. Fewer get up.',
      'Go ahead. Hit the wall.',
      'I have stood here longer than you have been alive.',
      'Halt. That was the polite version.',
    ],
    epilogue: 'Brick sets his shield down on the cracked floor. For the first time in years there is nothing left to guard, and he does not mind.',
    victory: 'Shake it off. Or don\'t.',
    victories: [
      'Shake it off. Or don\'t.',
      'The line holds.',
      'Next.',
    ],
    // against their RIVAL (routes.ts): the line before the fight, and the one after beating them
    rival: { taunt: 'Havoc. You want through this gate, you go through me.', victory: 'Gate held. Tell your commander to send someone heavier.' },
  },
  stats: {
    weight: 120,
    runSpeed: 2.0,
    airSpeed: 1.6,
    groundAccel: 0.22,
    groundFriction: 0.28,
    airAccel: 0.14,
    airFriction: 0.035,
    gravity: 0.62,
    fallSpeed: 8.4,
    fastFallSpeed: 11.8,
    jumpHeight: 76,
    shortHopHeight: 34,
    doubleJumpHeight: 54,
    doubleJumps: 1,
    jumpsquatFrames: 5,
  },
  body: { width: 20, height: 28, footHalfWidth: 7 },
  toughness: TOUGH,
  sprite: {
    frameSize: 160,
    frameWidth: 208, // room for the piston punches
    pixelScale: 0.29,
    animations: {
      idle: { frames: 6, fps: 7, loop: true },
      run: { frames: 8, fps: 14, loop: true },
      crouch: { frames: 1, fps: 1, loop: false },
      jump: { frames: 3, fps: 12, loop: false },
      fall: { frames: 2, fps: 5, loop: true },
      ledge: { frames: 1, fps: 1, loop: false },
      hurt: { frames: 1, fps: 1, loop: false },
      down: { frames: 1, fps: 1, loop: false },
      ko: { frames: 1, fps: 1, loop: false },
      walk: { frames: 6, fps: 7, loop: true },
      dash: { frames: 2, fps: 14, loop: true },
      skid: { frames: 1, fps: 1, loop: false },
      roll: { frames: 1, fps: 1, loop: false },
      held: { frames: 1, fps: 1, loop: false },
      hurtL: { frames: 1, fps: 1, loop: false },
      hurtU: { frames: 1, fps: 1, loop: false },
      hurtD: { frames: 1, fps: 1, loop: false },
      // attack poses: frame 0 = wind-up, 1 = active, 2 = recovery (the view picks the frame from the move phase)
      jab: { frames: 6, fps: 1, loop: false },
      smashF: { frames: 6, fps: 1, loop: false },
      smashU: { frames: 6, fps: 1, loop: false },
      smashD: { frames: 6, fps: 1, loop: false },
      aerialN: { frames: 6, fps: 1, loop: false },
      aerialF: { frames: 6, fps: 1, loop: false },
      aerialB: { frames: 6, fps: 1, loop: false },
      aerialU: { frames: 6, fps: 1, loop: false },
      aerialD: { frames: 6, fps: 1, loop: false },
      shoulder: { frames: 6, fps: 1, loop: false },
      sweep: { frames: 6, fps: 1, loop: false },
      jabB: { frames: 6, fps: 1, loop: false },
      throwF: { frames: 6, fps: 1, loop: false },
      throwB: { frames: 6, fps: 1, loop: false },
      throwU: { frames: 6, fps: 1, loop: false },
      throwD: { frames: 6, fps: 1, loop: false },
      chargeS: { frames: 6, fps: 1, loop: false },
      grapple: { frames: 6, fps: 1, loop: false },
      jet: { frames: 6, fps: 1, loop: false },
      vent: { frames: 6, fps: 1, loop: false },
      meltdown: { frames: 6, fps: 1, loop: false },
      grab: { frames: 2, fps: 1, loop: false },
      shield: { frames: 1, fps: 1, loop: false },
      dodge: { frames: 1, fps: 1, loop: false },
    },
    placeholder: {
      art: 'hi',
      skin: '#f2c9a0',
      armor: '#4a78c8',
      armorDark: '#2c4a8a',
      accent: '#ffb02e',
      outline: '#10142a',
      build: { shoulderW: 19, torsoH: 12, legH: 9.5, headSize: 7, armLen: 9, helmet: 'visor' }, // 32px-grid units; the generator doubles them for the 64px frame
    },
  },
  moves: parseMoves(movesJson as never, 'brick'),
  projectiles: json.projectiles,
  resources: { heat: 0, quiet: 0, ventDmg: 1, ventKb: 1, punch: 0, stomp: 0 },
  resourceRules: [{ key: 'heat', max: HEAT_MAX, gainDealt: DEALT_RATE, minDealt: HEAVY_HIT, gainTaken: TAKEN_RATE, decayAfter: DECAY_DELAY, decayRate: DECAY_RATE }],
  ultimate: { cost: 100, gainDealt: 0.2, gainTaken: 0.35 },
  hud: { resource: 'heat', max: 100, color: 0xff7a2a, hotAt: 50, marks: [50] },
  behavior: undefined as unknown as CharacterBehavior,
};
validateReferences(brick.moves, json.projectiles, undefined, 'brick');

/** Heat: see brickHeat.ts for the numbers. State lives in `fighter.res` so it is deterministic and hashed. */
const heatBehavior: CharacterBehavior = {
  onTick(f) {
    const m = f.move;
    const smash = m?.kind === 'smash';
    const hot = isHot(f.res.heat);
    const fullShoulder = m?.id === 'neutralB' && f.chargeFrac >= 1;
    // super-armor: smashes while hot, and a fully charged Charge Shoulder
    f.armorBonus = (smash && hot) || fullShoulder ? Infinity : 0;
    f.damageMult = smash && hot ? HEAT_DAMAGE_BONUS : m?.id === 'downB' ? f.res.ventDmg : 1;
    f.kbMult = m?.id === 'downB' ? f.res.ventKb : 1;
    if (hot) f.toughness = TOUGH_HOT;
    // Crater Stomp is live from its first active frame: landing now sends out the shockwave (see onLand)
    f.res.stomp = m?.id === 'dair' && f.moveFrame > m.startup ? 1 : 0;
  },
  onMoveFrame(f, m, frame) {
    // the ground spin is steerable: it drifts forward, faster in whichever way the stick holds
    if (m.id === 'upB_g' && frame >= m.startup && frame <= m.startup + m.active) {
      const steer = Math.abs(f.stick.x) > 0.3 ? f.stick.x : f.facing * 0.5;
      f.vx = steer * GROUND_SPIN_SPEED;
    }
  },
  chooseMove(f, id) {
    // Whirling Jet: a travelling spin on the ground (out of shield), a climbing spin in the air
    return id === 'upB' && f.grounded ? 'upB_g' : id;
  },
  onLand(f, _speed, world) {
    if (f.res.stomp <= 0) return;
    f.res.stomp = 0;
    for (const dir of [-1, 1]) world.spawnProjectile(f.id, 'quake', f.x + dir * 12, f.y - 6, dir * QUAKE_SPEED, 0);
    world.emit('fx', f, f.x, f.y, f.facing, 0, 'quake');
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
};
brick.behavior = heatBehavior;

applyMovePoses(brick);
addMotionRows(brick); // full-motion rows (after the prune in applyMovePoses)
