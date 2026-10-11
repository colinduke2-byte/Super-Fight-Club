import { parseMoves, validateReferences, type CharacterJson } from '../engine/moves';
import type { CharacterData } from '../engine/types';
import { brick } from './brick';

/**
 * DEV-ONLY character that exercises every engine hook (projectiles, traps, teleport, tether, status,
 * barrier, ultimate...). Not part of the shipped roster: load it with `?char=proto`. Used by the tests and
 * as a visual smoke test for the entity renderers.
 */
const box = { x: 0, y: 0, w: 1, h: 1 };
const payload = { ...box, damage: 5, angle: 40, base: 40, scaling: 0.8 };

export const protoJson: CharacterJson = {
  projectiles: {
    bolt: { w: 8, h: 8, gravity: 0.2, life: 120, health: 3, hit: { ...payload }, look: { shape: 'orb', color: '#ff7a2a' } },
    floaty: { w: 8, h: 8, gravity: 0.03, life: 120, hit: { ...payload }, look: { shape: 'orb', color: '#7fe8ff' } },
    zig: { w: 8, h: 8, path: { kind: 'zigzag', amp: 2, period: 20 }, life: 90, hit: { ...payload }, look: { shape: 'bolt', color: '#ffee55' } },
    beam: { w: 30, h: 10, life: 40, pierce: true, hit: { ...payload, damage: 3 }, look: { shape: 'beam', color: '#ffffff' } },
    hopper: { w: 8, h: 8, gravity: 0.3, bounce: 0.7, life: 200, hit: { ...payload }, look: { shape: 'orb', color: '#ffffff' } },
    bullet: { w: 6, h: 4, life: 60, hit: { ...payload, damage: 2 }, look: { shape: 'bullet', color: '#ffd46a' } },
  },
  deployables: {
    mine: {
      w: 12, h: 8, health: 4, limit: 2, armFrames: 10, gravity: true,
      trigger: { hit: { ...payload, damage: 6, angle: 90, base: 50, scaling: 0.9, dir: 'away' } },
      look: { shape: 'mine', color: '#ff4a4a' },
    },
    turret: {
      w: 14, h: 14, health: 6, limit: 2, armFrames: 5, gravity: true,
      turret: { range: 140, interval: 30, projectile: 'bullet', muzzleX: 8, muzzleY: -8, speed: 4 },
      reward: { key: 'scrap', add: 3 },
      look: { shape: 'turret', color: '#9aa6bd' },
    },
    marker: { w: 8, h: 8, health: 0, limit: 1, replaceOldest: true, life: 180, look: { shape: 'marker', color: '#7fe8ff' } },
  },
  moves: {
    shoot: { name: 'Shoot', kind: 'special', anim: 'jab', startup: 6, active: 1, recovery: 10, hitboxes: [], events: [{ frame: 6, action: 'projectile', id: 'bolt', x: 16, y: -16, vx: 4, vy: -1 }] },
    shootFloaty: { name: 'Shoot floaty', kind: 'special', anim: 'jab', startup: 6, active: 1, recovery: 10, hitboxes: [], events: [{ frame: 6, action: 'projectile', id: 'floaty', x: 16, y: -16, vx: 4, vy: -1 }] },
    shootZig: { name: 'Zig', kind: 'special', anim: 'jab', startup: 3, active: 1, recovery: 4, hitboxes: [], events: [{ frame: 3, action: 'projectile', id: 'zig', x: 16, y: -16, vx: 3, vy: 0 }] },
    shootBeam: { name: 'Beam', kind: 'special', anim: 'jab', startup: 3, active: 1, recovery: 4, hitboxes: [], events: [{ frame: 3, action: 'projectile', id: 'beam', x: 20, y: -16, vx: 3, vy: 0 }] },
    mineDrop: { name: 'Mine', kind: 'special', anim: 'jab', startup: 4, active: 1, recovery: 6, hitboxes: [], events: [{ frame: 4, action: 'deploy', id: 'mine', x: 20, y: 0 }] },
    turretDrop: { name: 'Turret', kind: 'special', anim: 'jab', startup: 4, active: 1, recovery: 6, hitboxes: [], events: [{ frame: 4, action: 'deploy', id: 'turret', x: 24, y: 0 }] },
    markerDrop: { name: 'Marker', kind: 'special', anim: 'jab', startup: 4, active: 1, recovery: 6, hitboxes: [], events: [{ frame: 4, action: 'deploy', id: 'marker', x: 0, y: 0 }] },
    blink: { name: 'Blink', kind: 'special', anim: 'jab', startup: 3, active: 1, recovery: 8, hitboxes: [], events: [{ frame: 3, action: 'teleport', dist: 50, dir: 'stick8' }] },
    climb: {
      name: 'Climb', kind: 'special', anim: 'jab', startup: 5, active: 1, recovery: 20, helpless: true, noLedge: 12, hitboxes: [],
      events: [{ frame: 4, action: 'teleport', dist: 60, dir: 'up' }, { frame: 8, action: 'ledgeSnap', range: 90 }],
    },
    shieldUp: { name: 'Barrier', kind: 'special', anim: 'jab', startup: 2, active: 1, recovery: 20, hitboxes: [], events: [{ frame: 2, action: 'barrier', frames: 40, x: 22, y: -16, w: 30, h: 40 }] },
    hook: { name: 'Hook', kind: 'special', anim: 'jab', startup: 3, active: 1, recovery: 20, hitboxes: [], events: [{ frame: 3, action: 'tether', angle: 44, range: 120, speed: 6 }] },
    hookUp: { name: 'Hook up', kind: 'special', anim: 'jab', startup: 3, active: 1, recovery: 20, hitboxes: [], events: [{ frame: 3, action: 'tether', angle: 90, range: 120, speed: 6 }] },
    hookGrab: { name: 'Hook grab', kind: 'special', anim: 'jab', startup: 3, active: 1, recovery: 20, hitboxes: [], events: [{ frame: 3, action: 'tether', angle: 0, range: 100, speed: 6, grabsOpponents: true }] },
    burnPunch: { name: 'Burn', kind: 'jab', anim: 'jab', startup: 2, active: 2, recovery: 8, hitboxes: [{ x: 22, y: -16, w: 26, h: 18, damage: 3, angle: 361, base: 10, scaling: 0.1, status: { type: 'burn', frames: 120, value: 0.1 } }] },
    icePunch: { name: 'Ice', kind: 'jab', anim: 'jab', startup: 2, active: 2, recovery: 8, hitboxes: [{ x: 22, y: -16, w: 26, h: 18, damage: 3, angle: 361, base: 10, scaling: 0.1, status: { type: 'freeze', frames: 50, minPercent: 80, fallback: { type: 'slow', frames: 90, value: 0.5 } } }] },
    stunPunch: { name: 'Stun', kind: 'jab', anim: 'jab', startup: 2, active: 2, recovery: 8, hitboxes: [{ x: 22, y: -16, w: 26, h: 18, damage: 2, angle: 361, base: 5, scaling: 0.1, status: { type: 'stun', frames: 40 } }] },
    sweeper: { name: 'Sweep', kind: 'special', anim: 'jab', startup: 2, active: 12, recovery: 4, hitboxes: [{ x: 10, y: -16, w: 14, h: 14, damage: 2, angle: 40, base: 20, scaling: 0.3, travel: { vx: 6, vy: 0 } }] },
    ultimate: {
      name: 'Ult', kind: 'ultimate', anim: 'grab', startup: 4, active: 2, recovery: 20,
      hitboxes: [{ x: 22, y: -16, w: 30, h: 24, damage: 0, angle: 0, base: 0, scaling: 0, grab: true, unblockable: true, cinematic: true }],
      cinematic: { frames: 40, hits: [{ frame: 20, damage: 10 }, { frame: 40, damage: 20, launch: true, angle: 45, base: 80, scaling: 1.2 }] },
    },
  },
};


/** Proto character data without behaviour hooks. */
export function makeProtoBase(): CharacterData {
  const moves = parseMoves(protoJson as never, 'proto');
  validateReferences(moves, protoJson.projectiles, protoJson.deployables, 'proto');
  return {
    ...brick,
    resourceRules: undefined,
    fx: undefined,
    variants: undefined,
    id: 'proto',
    name: 'Proto',
    moves,
    projectiles: protoJson.projectiles,
    deployables: protoJson.deployables,
    resources: { scrap: 0, heat: 0 },
    dash: { speed: 5, frames: 12, invuln: [2, 8], cooldown: 20 },
    sprite: { ...brick.sprite, placeholder: { ...brick.sprite.placeholder, armor: '#8a4fd0', armorDark: '#4a2a80', accent: '#5fe8c8' } },
  };
}
