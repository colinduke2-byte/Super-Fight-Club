import type { CharacterBehavior } from '../engine/behavior';
import { parseMoves, validateReferences, type CharacterJson } from '../engine/moves';
import type { CharacterData } from '../engine/types';
import { standardAnimations } from './common';
import movesJson from './gizmo.moves.json';
import { canAfford, clampScrap, MECH_FRAMES, OVERCLOCK_COST, OVERCLOCK_FRAMES, OVERCLOCK_RANGE, RECALL_REFUND, SCRAP_MAX, scrapFromDamage, UPGRADE_EFFECT, upgradeFromStick } from './gizmoScrap';

const json = movesJson as unknown as CharacterJson;
const MECH_SCALE = 1.7;

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
    // only one Rocket Fist in flight
    if (id === 'sideB' && world.projectiles.some((p) => p.active && p.owner === f.id && p.defId === 'fist')) return null;
    return id;
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
  name: 'Gizmo',
  tagline: 'Tinkerer mech. Set the trap, spend the scrap.',
  stats: {
    weight: 95,
    runSpeed: 2.4,
    airSpeed: 1.8,
    groundAccel: 0.3,
    groundFriction: 0.34,
    airAccel: 0.15,
    airFriction: 0.05,
    gravity: 0.5,
    fallSpeed: 6.6,
    fastFallSpeed: 9.8,
    jumpHeight: 66,
    shortHopHeight: 30,
    doubleJumpHeight: 54,
    doubleJumps: 1,
    jumpsquatFrames: 4,
  },
  body: { width: 16, height: 22, footHalfWidth: 6 },
  sprite: {
    frameSize: 64,
    pixelScale: 0.5,
    animations: standardAnimations(['castF', 'castU', 'castD', 'raid']),
    placeholder: {
      skin: '#9fe9ff',
      armor: '#e08a2c',
      armorDark: '#7a4a1c',
      accent: '#5fe8ff',
      outline: '#1a1208',
      build: { shoulderW: 14, torsoH: 8, legH: 6, headSize: 10, armLen: 7, helmet: 'dome' },
      weapon: 'wrench',
      extras: ['toolbox', 'grapple'],
    },
  },
  moves,
  projectiles: json.projectiles,
  deployables: json.deployables,
  resources: { scrap: 0, scrapBar: 0, mech: 0 },
  ultimate: { cost: 100, gainDealt: 0.28, gainTaken: 0.4 },
  hud: { resource: 'scrapBar', max: 100, color: 0xffb02e, hotAt: 50 },
  counter: { resource: 'scrap' },
  transform: { resource: 'mech', scale: MECH_SCALE, tint: 0xbfe0ff },
  behavior,
};
