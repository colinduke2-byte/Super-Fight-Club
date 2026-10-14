import type { CharacterBehavior } from '../engine/behavior';
import { Button } from '../engine/buttons';
import { hurtRect } from '../engine/combat';
import { detonateDeployable } from '../engine/entityCombat';
import { moveTotal, parseMoves, validateReferences, type CharacterJson } from '../engine/moves';
import type { CharacterData } from '../engine/types';
import { applyMovePoses } from '../engine/movePoses';
import { standardAnimations } from './common';
import movesJson from './havoc.moves.json';
import fxJson from './havoc.fx.json';
import { validateFx, type CharacterFx } from '../engine/fxTypes';

const fx = fxJson as unknown as CharacterFx;
validateFx('havoc', fx);

const json = movesJson as unknown as CharacterJson;
const moves = parseMoves(json as never, 'havoc');
validateReferences(moves, json.projectiles, json.deployables, 'havoc');

/** C4: how far in front Havoc can slap it onto a rival, and the blast radius when it goes off. */
export const C4_REACH = 24;
export const C4_RADIUS = 36;
const rr = [0, 0, 0, 0];

const behavior: CharacterBehavior = {
  chooseMove(f, id, world) {
    // one Remote Missile at a time
    if (id === 'sideB' && world.projectiles.some((p) => p.active && p.owner === f.id && p.defId === 'missile')) return null;
    // C4 out: down special again sets it off
    if (id === 'downB' && world.deployables.some((d) => d.active && d.owner === f.id && d.defId === 'c4' && d.age >= (d.def?.armFrames ?? 0))) return 'detonateC4';
    return id;
  },
  onMoveFrame(f, m, frame, world) {
    // flying the Remote Missile: let go of Special (or lose the missile) and Havoc puts the controller away
    if (m.id !== 'sideB' || frame <= m.startup + 2) return;
    const flying = world.projectiles.some((p) => p.active && p.owner === f.id && p.defId === 'missile');
    if (!flying || (f.heldButtons & Button.Special) === 0) f.moveFrame = Math.max(f.moveFrame, moveTotal(m) - m.recovery);
  },
  onMoveEvent(f, name, args, world) {
    if (name === 'detonateC4') {
      for (const d of world.findDeployables(f.id, 'c4')) detonateDeployable(world, d, args[0] ?? C4_RADIUS);
      return;
    }
    if (name !== 'plantC4') return;
    // slap it onto a rival standing right in front, or stick it to the floor
    let target = -1;
    for (const o of world.fighters) {
      if (o.id === f.id || o.state === 'ko' || world.allied(f.id, o.id)) continue;
      hurtRect(o, rr);
      const ahead = (o.x - f.x) * f.facing;
      if (ahead > -4 && ahead < C4_REACH + o.hw && rr[1] < f.y && rr[1] + rr[3] > f.y - f.h) {
        target = o.id;
        break;
      }
    }
    const d = world.spawnDeployable(f.id, 'c4', f.x + f.facing * 14, f.y);
    if (d && target >= 0) {
      d.attached = target;
      world.emit('fx', f, d.x, d.y, f.facing, 0, 'stick');
    }
  },
};

/**
 * Havoc: a gadget soldier (Snake's toolbox). Close-quarters kicks and a combat knife up close, and explosives for
 * everything else: Frag Grenades that bounce, a Remote Missile he steers with the stick, a Cypher drone to fly back,
 * and C4 he plants on the floor or slaps onto a rival, then sets off by remote. Smashes: a rocket launcher and a mortar.
 */
export const havoc: CharacterData = {
  id: 'havoc',
  fx,
  name: 'Havoc',
  tagline: 'Gadget soldier. Plant it, steer it, blow it up.',
  difficulty: 4,
  persona: {
    intro: 'Havoc was sent in to shut the arena down quietly. Quiet is not really his style.',
    taunt: 'Fire in the hole. That means you.',
    epilogue: 'Havoc radios in: "Arena neutralised." Behind him the Hollow lights up like a festival. Mission accomplished, loudly.',
    victory: 'Mission complete. Collateral: you.',
  },
  stats: {
    weight: 96,
    runSpeed: 2.35,
    airSpeed: 1.8,
    groundAccel: 0.3,
    groundFriction: 0.34,
    airAccel: 0.16,
    airFriction: 0.05,
    gravity: 0.56,
    fallSpeed: 7.2,
    fastFallSpeed: 11,
    jumpHeight: 70,
    shortHopHeight: 31,
    doubleJumpHeight: 54,
    doubleJumps: 1,
    jumpsquatFrames: 4,
  },
  body: { width: 18, height: 28, footHalfWidth: 6 },
  sprite: {
    frameSize: 160,
    pixelScale: 0.29,
    animations: standardAnimations(['castF', 'castU', 'castD']),
    placeholder: {
      art: 'hi',
      skin: '#d8a888',
      armor: '#5a6a3a',
      armorDark: '#2a3420',
      accent: '#ffb02e',
      outline: '#10140c',
      build: { shoulderW: 13, torsoH: 11, legH: 11, headSize: 6, armLen: 9, helmet: 'goggles' },
    },
  },
  moves,
  projectiles: json.projectiles,
  deployables: json.deployables,
  resources: {},
  ultimate: { cost: 100, gainDealt: 0.28, gainTaken: 0.4 },
  behavior,
};

applyMovePoses(havoc);
