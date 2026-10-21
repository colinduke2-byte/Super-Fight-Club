import type { CharacterBehavior } from '../engine/behavior';
import { parseMoves, validateReferences, type CharacterJson } from '../engine/moves';
import type { CharacterData } from '../engine/types';
import { applyMovePoses } from '../engine/movePoses';
import { addMotionRows, standardAnimations } from './common';
import movesJson from './gizmo.moves.json';
import fxJson from './gizmo.fx.json';
import { validateFx, type CharacterFx } from '../engine/fxTypes';
import { canAfford, clampScrap, MECH_FRAMES, OVERCLOCK_COST, OVERCLOCK_FRAMES, OVERCLOCK_RANGE, RECALL_REFUND, SCRAP_MAX, scrapFromDamage, UPGRADE_EFFECT, upgradeFromStick } from './gizmoScrap';

const fx = fxJson as unknown as CharacterFx;
validateFx('gizmo', fx);

const json = movesJson as unknown as CharacterJson;
const MECH_SCALE = 1.7;
/** Scrap refunded for catching the returning Rocket Fist. */
const CATCH_SCRAP = 1.5;

/** While Mech mode is on, attacks are swapped for these heavier versions. */
const MECH_REMAP: Record<string, string> = {
  jab1: 'mech_punch',
  fsmash: 'mech_punch',
  usmash: 'mech_stomp',
  dsmash: 'mech_stomp',
  neutralB: 'mech_missiles',
};

const behavior: CharacterBehavior = {
  onTick(f, world) {
    f.res.scrap = clampScrap(f.res.scrap);
    f.res.scrapBar = (f.res.scrap / SCRAP_MAX) * 100; // HUD seam
    if (f.res.mech > 0) {
      f.res.mech--;
      f.superArmor = true;
      f.sizeMul = MECH_SCALE;
      f.damageMult = 1.35;
      if (f.res.mech === 0) world.emit('fx', f, f.x, f.y, f.facing, 0, 'mechEnd');
    } else {
      f.superArmor = false;
      f.sizeMul = 1;
      f.damageMult = 1;
    }
  },
  remapMove(f, id) {
    return f.res.mech > 0 ? (MECH_REMAP[id] ?? id) : id;
  },
  chooseMove(f, id, world) {
    if (id !== 'sideB') return id;
    // only one Rocket Fist in flight; a caught one comes back out overcharged
    if (world.projectiles.some((p) => p.active && p.owner === f.id && (p.defId === 'fist' || p.defId === 'fist_hot'))) return null;
    return f.res.hotFist > 0 ? 'sideB_hot' : 'sideB';
  },
  onMoveStart(f, m) {
    if (m.id === 'sideB_hot') f.res.hotFist = 0;
  },
  // catching the returning Rocket Fist (R.O.B.'s Gyro): a little Scrap back, and the next one is overcharged
  onProjectileReturn(f, defId) {
    if (defId !== 'fist' && defId !== 'fist_hot') return;
    f.res.scrap = clampScrap(f.res.scrap + CATCH_SCRAP);
    if (defId === 'fist') f.res.hotFist = 1;
  },
  onHitDealt(f, _victim, _hb, damage) {
    f.res.scrap = clampScrap(f.res.scrap + scrapFromDamage(damage));
  },
  onDeployableDestroyed(f) {
    f.res.scrap = clampScrap(f.res.scrap); // the deployable's `reward` already granted the Scrap
  },
  onMoveEvent(f, name, _args, world) {
    if (name === 'mechStart') {
      f.res.mech = MECH_FRAMES;
      return;
    }
    if (name !== 'overclock') return;
    const turrets = world.findDeployables(f.id, 'turret').filter((t) => Math.abs(t.x - f.x) <= OVERCLOCK_RANGE);
    if (f.chargeFrac >= 0.5) {
      // hold: recall nearby turrets for a refund
      for (const t of turrets) {
        t.deactivate();
        f.res.scrap = clampScrap(f.res.scrap + RECALL_REFUND);
      }
      world.emit('fx', f, f.x, f.y, f.facing, 0, turrets.length ? 'recall' : 'fizzle');
      return;
    }
    if (turrets.length === 0 || !canAfford(f.res.scrap)) {
      world.emit('fx', f, f.x, f.y, f.facing, 0, 'fizzle');
      return;
    }
    f.res.scrap -= OVERCLOCK_COST;
    const e = UPGRADE_EFFECT[upgradeFromStick(f.stick.x, f.facing)];
    for (const t of turrets) {
      t.fireRateMul = e.fireRateMul;
      t.damageMul = e.damageMul;
      t.shield = e.shield;
      t.modFrames = OVERCLOCK_FRAMES;
    }
    world.emit('fx', f, f.x, f.y, f.facing, 0, 'overclock');
  },
};

const moves = parseMoves(json as never, 'gizmo');
validateReferences(moves, json.projectiles, json.deployables, 'gizmo');

/**
 * Gizmo: tricky tinkerer mech. Wins by setting up the battlefield: turrets, a boomerang fist, a grappling
 * hook, and SCRAP to upgrade it all. Weak without setup. Small, low-profile hurtbox.
 */
export const gizmo: CharacterData = {
  id: 'gizmo',
  fx,
  name: 'Gizmo',
  tagline: 'Tinkerer mech. Set the trap, spend the scrap.',
  difficulty: 3,
  persona: {
    intro: 'Gizmo wired the arena\'s first brain on a rainy Tuesday. Now the brain will not let anyone leave, and Gizmo feels responsible.',
    bio: 'The tinkerer who wired the arena\'s first brain, and now feels responsible for everything it does. Gizmo fights with turrets, traps and a backpack full of scrap that becomes whatever the moment needs.',
    taunt: 'One turret. Two turrets. You are outnumbered.',
    // in-match taunt bubbles take turns through these
    taunts: [
      'One turret. Two turrets. You are outnumbered.',
      'Hold still, I need to calibrate.',
      'I brought spare parts. Did you?',
      'That was a beta. This is version two.',
    ],
    epilogue: 'Gizmo pulls the last cable. The arena sighs and goes quiet. "Okay," he says to nobody. "Version two will have a snooze button."',
    victory: 'Recalibrating... still winning!',
    victories: [
      'Recalibrating... still winning!',
      'Bug fixed. The bug was you.',
      'Patch notes: you lost.',
    ],
    // against their RIVAL (routes.ts): the line before the fight, and the one after beating them
    rival: { taunt: 'Obelisk! I can explain the arena. Mostly. Please stop growling.', victory: 'See? Zero structural damage. To the cave, anyway.' },
  },
  stats: {
    weight: 88,
    runSpeed: 2.4,
    airSpeed: 1.8,
    groundAccel: 0.3,
    groundFriction: 0.34,
    airAccel: 0.15,
    airFriction: 0.055,
    gravity: 0.5,
    fallSpeed: 6.6,
    fastFallSpeed: 9.8,
    jumpHeight: 66,
    shortHopHeight: 30,
    doubleJumpHeight: 54,
    doubleJumps: 1,
    jumpsquatFrames: 4,
  },
  body: { width: 16, height: 25, footHalfWidth: 6 },
  wallJump: true,
  // jet hover: hold Jump while falling to hang in the air for 1 s per airtime
  hover: { frames: 60, drift: 1.15 },
  sprite: {
    frameSize: 160,
    pixelScale: 0.29,
    animations: standardAnimations(['castF', 'castU', 'castD', 'raid']),
    placeholder: {
      art: 'hi',
      skin: '#9fe9ff',
      armor: '#e08a2c',
      armorDark: '#7a4a1c',
      accent: '#5fe8ff',
      outline: '#1a1208',
      build: { shoulderW: 15, torsoH: 8, legH: 5.5, headSize: 10, armLen: 6.5, helmet: 'dome', round: true },
      weapon: 'wrench',
      extras: ['toolbox', 'grapple'],
    },
  },
  moves,
  projectiles: json.projectiles,
  deployables: json.deployables,
  resources: { scrap: 0, scrapBar: 0, mech: 0, hotFist: 0 },
  ultimate: { cost: 100, gainDealt: 0.28, gainTaken: 0.4 },
  hud: { resource: 'scrapBar', max: 100, color: 0xffb02e, hotAt: 50 },
  counter: { resource: 'scrap' },
  transform: { resource: 'mech', scale: MECH_SCALE, tint: 0xbfe0ff },
  behavior,
};

applyMovePoses(gizmo);
addMotionRows(gizmo); // full-motion rows (after the prune in applyMovePoses)
