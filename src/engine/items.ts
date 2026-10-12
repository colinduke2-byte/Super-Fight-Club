import { hurtRect } from './combat';
import type { World } from './world';

export const MAX_ITEMS = 4;
export type ItemKind = 'heal' | 'cell' | 'boost' | 'bomb';
export const ITEM_KINDS: ItemKind[] = ['heal', 'cell', 'boost', 'bomb'];
/** Shock Bomb: picked up and carried, thrown with Attack; bursts on any fighter, on landing, or when the fuse runs out. */
export const BOMB = { fuse: 150, speed: 6.2, lift: -3.2, upSpeed: -8.5, gravity: 0.32, radius: 30, damage: 14, base: 44, scaling: 0.85, angle: 62, ownerGrace: 14 };
const LIFE = 720;
const HALF = 7;
const GRAVITY = 0.3;
const MAX_FALL = 3.5;
/** Frames between spawn attempts for each item setting (1 = low, 2 = high). */
export const ITEM_INTERVAL = [0, 900, 480];

export class Item {
  active = false;
  kind: ItemKind = 'heal';
  x = 0;
  y = 0;
  vy = 0;
  age = 0;
  resting = false;
  /** In flight after a throw: burst on contact (bombs). */
  thrown = false;
  vx = 0;
  owner = -1;
  fuse = 0;
  constructor(readonly index: number) {}
}

/** Heal -25%, Energy Cell +50 ultimate meter, Overdrive 10 s of +30% outgoing damage. */
export function applyItem(world: World, kind: ItemKind, fighterId: number): void {
  const f = world.fighters[fighterId];
  if (kind === 'heal') f.damage = Math.max(0, f.damage - 25);
  else if (kind === 'cell') f.addMeterRaw(50, world);
  else f.boostFrames = 600;
}

/** Deterministic LCG so item drops replay identically. */
function rnd(world: World): number {
  world.itemSeed = (Math.imul(world.itemSeed, 1664525) + 1013904223) >>> 0;
  return world.itemSeed / 4294967296;
}

const r = [0, 0, 0, 0];

export function stepItems(world: World): void {
  const rate = world.config.itemRate;
  const items = world.items;
  if (rate > 0 && world.tick % ITEM_INTERVAL[rate] === 0 && world.tick > 0) {
    let live = 0;
    for (const it of items) if (it.active) live++;
    if (live < 2) {
      const slot = items.find((it) => !it.active);
      let main = world.platforms[0];
      for (const p of world.platforms) if (p.kind === 'solid' && p.w > (main.kind === 'solid' ? main.w : 0)) main = p;
      if (slot) {
        const roll = rnd(world);
        slot.active = true;
        slot.kind = roll < 0.36 ? 'heal' : roll < 0.64 ? 'cell' : roll < 0.8 ? 'boost' : 'bomb';
        slot.thrown = false;
        slot.owner = -1;
        slot.x = main.x + 20 + rnd(world) * (main.w - 40);
        slot.y = main.top - 200;
        slot.vy = 0;
        slot.age = 0;
        slot.resting = false;
        world.emit('itemSpawn', world.fighters[0], slot.x, slot.y, ITEM_KINDS.indexOf(slot.kind), 0);
      }
    }
  }
  for (const it of items) {
    if (!it.active) continue;
    if (it.thrown) {
      stepThrown(world, it);
      continue;
    }
    it.age++;
    if (it.age > LIFE || it.y > world.blast.bottom) {
      it.active = false;
      continue;
    }
    if (!it.resting) {
      const prev = it.y + HALF;
      it.vy = Math.min(MAX_FALL, it.vy + GRAVITY);
      it.y += it.vy;
      const bottom = it.y + HALF;
      for (const p of world.platforms) {
        if (it.x < p.x || it.x > p.right) continue;
        if (prev <= p.top + 1 && bottom >= p.top) {
          it.y = p.top - HALF;
          it.vy = 0;
          it.resting = true;
          break;
        }
      }
    } else {
      // keep riding moving platforms: if nothing is underneath any more, fall again
      let supported = false;
      for (const p of world.platforms) {
        if (it.x >= p.x && it.x <= p.right && Math.abs(it.y + HALF - p.top) < 3) {
          it.y = p.top - HALF;
          supported = true;
        }
      }
      if (!supported) it.resting = false;
    }
    for (const f of world.fighters) {
      if (f.state === 'ko') continue;
      hurtRect(f, r);
      if (it.x + HALF > r[0] && it.x - HALF < r[0] + r[2] && it.y + HALF > r[1] && it.y - HALF < r[1] + r[3]) {
        if (it.kind === 'bomb') {
          if (f.heldBomb || f.state === 'grabbed') continue; // one at a time
          f.heldBomb = true;
          it.active = false;
          world.emit('itemPickup', f, it.x, it.y, ITEM_KINDS.indexOf(it.kind), 0);
          break;
        }
        it.active = false;
        applyItem(world, it.kind, f.id);
        world.emit('itemPickup', f, it.x, it.y, ITEM_KINDS.indexOf(it.kind), 0);
        break;
      }
    }
  }
}

/** Throw the bomb `f` is carrying: forward in an arc, straight up, or dropped at the feet (stick up / down). */
export function throwBomb(world: World, fighterId: number, stickX: number, stickY: number): boolean {
  const f = world.fighters[fighterId];
  if (!f.heldBomb) return false;
  const slot = world.items.find((it) => !it.active);
  if (!slot) return false;
  f.heldBomb = false;
  if (stickX * f.facing < -0.5) f.facing = f.facing === 1 ? -1 : 1; // back-throw turns around
  slot.active = true;
  slot.kind = 'bomb';
  slot.thrown = true;
  slot.owner = f.id;
  slot.fuse = BOMB.fuse;
  slot.age = 0;
  slot.resting = false;
  slot.x = f.x + f.facing * 8;
  slot.y = f.y - f.h * 0.7;
  if (stickY < -0.5) {
    slot.vx = f.vx * 0.3;
    slot.vy = BOMB.upSpeed;
  } else if (stickY > 0.5) {
    slot.vx = 0;
    slot.vy = f.grounded ? -1 : 4;
  } else {
    slot.vx = f.facing * BOMB.speed + f.vx * 0.4;
    slot.vy = BOMB.lift;
  }
  world.emit('itemThrow', f, slot.x, slot.y, 3, 0);
  return true;
}

function stepThrown(world: World, it: Item): void {
  it.age++;
  it.fuse--;
  const prevBottom = it.y + HALF;
  it.vy = Math.min(9, it.vy + BOMB.gravity);
  it.x += it.vx;
  it.y += it.vy;
  if (it.y > world.blast.bottom || it.x < world.blast.left || it.x > world.blast.right) {
    it.active = false;
    return;
  }
  let boom = it.fuse <= 0;
  if (!boom && it.vy > 0) {
    for (const p of world.platforms) {
      if (it.x < p.x || it.x > p.right) continue;
      if (prevBottom <= p.top + 1 && it.y + HALF >= p.top) {
        it.y = p.top - HALF;
        boom = true;
        break;
      }
    }
  }
  if (!boom) {
    for (const f of world.fighters) {
      if (f.state === 'ko' || (f.id === it.owner && it.age < BOMB.ownerGrace) || world.allied(it.owner, f.id) && f.id !== it.owner) continue;
      hurtRect(f, r);
      if (it.x + HALF > r[0] && it.x - HALF < r[0] + r[2] && it.y + HALF > r[1] && it.y - HALF < r[1] + r[3]) {
        boom = true;
        break;
      }
    }
  }
  if (boom) explode(world, it);
}

/** Shock burst: everyone in the radius (the thrower too, once the grace period is over; never teammates) is launched away. */
function explode(world: World, it: Item): void {
  it.active = false;
  const owner = world.fighters[it.owner] ?? world.fighters[0];
  world.emit('itemBoom', owner, it.x, it.y, BOMB.radius, it.owner);
  for (const f of world.fighters) {
    if (f.state === 'ko' || f.invuln > 0 || f.state === 'grabbed') continue;
    if (f.id === it.owner && it.age < BOMB.ownerGrace) continue;
    if (f.id !== it.owner && world.allied(it.owner, f.id)) continue;
    hurtRect(f, r);
    const cx = Math.max(r[0], Math.min(it.x, r[0] + r[2]));
    const cy = Math.max(r[1], Math.min(it.y, r[1] + r[3]));
    if (Math.hypot(cx - it.x, cy - it.y) > BOMB.radius) continue;
    if (f.state === 'shield' || f.state === 'shieldstun') {
      // a shield soaks the blast (heavy shield damage, pushed back)
      f.shieldHit(BOMB.damage, false, 1.5, f.x >= it.x ? 1 : -1, world);
      f.hitlag = 8;
      world.emit('shieldHit', f, f.x, f.y - f.h / 2, f.shieldRadius, BOMB.damage);
      continue;
    }
    f.receiveHit({ damage: BOMB.damage, base: BOMB.base, scaling: BOMB.scaling, angle: BOMB.angle, direction: f.x >= it.x ? 1 : -1, hitlag: 10, attackerId: f.id !== it.owner ? it.owner : undefined }, world);
  }
}
