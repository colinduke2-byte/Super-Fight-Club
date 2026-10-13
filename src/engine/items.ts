import { hitboxActive, hitboxRect, hurtRect } from './combat';
import type { World } from './world';

export const MAX_ITEMS = 4;
export type ItemKind = 'heal' | 'cell' | 'boost' | 'bomb' | 'aegis';
export const ITEM_KINDS: ItemKind[] = ['heal', 'cell', 'boost', 'bomb', 'aegis'];
/** Aegis Core: frames of invincibility. */
export const AEGIS_FRAMES = 300;
/** Shock Bomb: picked up and carried, thrown with Attack; bursts on any fighter, on landing, or when the fuse runs out. */
export const BOMB = { fuse: 150, speed: 6.2, lift: -3.2, upSpeed: -8.5, gravity: 0.32, radius: 30, damage: 14, base: 44, scaling: 0.85, angle: 62, ownerGrace: 14 };
const LIFE = 720;
const HALF = 7;
const GRAVITY = 0.3;
const MAX_FALL = 3.5;
/** Knocked items: launch speed from the hit, the fastest fall, floor bounce, wall bounce, ground friction. */
const KNOCK_MIN = 4;
const KNOCK_MAX = 11;
const KNOCK_FALL = 9;
const ITEM_BOUNCE = 0.45;
const ITEM_WALL = 0.6;
const ITEM_FRICTION = 0.82;
/** A knocked item flying at least this fast bumps the first fighter it meets (not the knocker or their team). */
const BUMP_SPEED = 3.5;
const BUMP = { damage: 4, base: 34, scaling: 0.35, angle: 38 };
/** Frames the knocker cannot catch the item they just hit, and between two knocks of one item. */
const KNOCK_GRACE = 24;
const KNOCK_COOLDOWN = 8;
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
  /** Who last knocked this item with an attack (-1 none), and frames left before they may pick it up. */
  knockedBy = -1;
  knockGrace = 0;
  knockCd = 0;
  /** Frames nobody may pick the item up (it just rebounded off someone). */
  pickDelay = 0;
  /** Flight spin (radians), for the view. */
  spin = 0;
  constructor(readonly index: number) {}
}

/** Heal -25%, Energy Cell +50 ultimate meter, Overdrive 10 s of +30% outgoing damage, Aegis Core 5 s of invincibility. */
export function applyItem(world: World, kind: ItemKind, fighterId: number): void {
  const f = world.fighters[fighterId];
  if (kind === 'heal') f.damage = Math.max(0, f.damage - 25);
  else if (kind === 'cell') f.addMeterRaw(50, world);
  else if (kind === 'aegis') {
    f.invuln = Math.max(f.invuln, AEGIS_FRAMES);
    f.aegisFrames = AEGIS_FRAMES;
  } else f.boostFrames = 600;
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
        slot.kind = roll < 0.34 ? 'heal' : roll < 0.6 ? 'cell' : roll < 0.76 ? 'boost' : roll < 0.93 ? 'bomb' : 'aegis';
        slot.thrown = false;
        slot.owner = -1;
        slot.x = main.x + 20 + rnd(world) * (main.w - 40);
        slot.y = main.top - 200;
        slot.vy = 0;
        slot.vx = 0;
        slot.spin = 0;
        slot.knockedBy = -1;
        slot.knockGrace = 0;
        slot.knockCd = 0;
        slot.pickDelay = 0;
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
    if (it.knockCd > 0) it.knockCd--;
    if (it.knockGrace > 0) it.knockGrace--;
    if (it.pickDelay > 0) it.pickDelay--;
    if (knockItem(world, it)) continue;
    moveFree(world, it);
    if (!it.active) continue;
    if (bumpFighters(world, it) || it.pickDelay > 0) continue;
    for (const f of world.fighters) {
      if (f.state === 'ko') continue;
      hurtRect(f, r);
      if (it.x + HALF > r[0] && it.x - HALF < r[0] + r[2] && it.y + HALF > r[1] && it.y - HALF < r[1] + r[3]) {
        if (f.id === it.knockedBy && it.knockGrace > 0) continue; // just batted it away
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

/** Free-item motion: falling, sliding, bouncing off floors and solid walls, riding moving platforms. */
function moveFree(world: World, it: Item): void {
  if (it.resting) {
    // slide to a stop; keep riding moving platforms; if nothing is underneath any more, fall again
    if (it.vx !== 0) {
      it.x += it.vx;
      it.vx *= ITEM_FRICTION;
      if (Math.abs(it.vx) < 0.05) it.vx = 0;
      it.spin += it.vx * 0.12;
      wallBounce(world, it);
    }
    let supported = false;
    for (const p of world.platforms) {
      if (it.x >= p.x && it.x <= p.right && Math.abs(it.y + HALF - p.top) < 3) {
        it.y = p.top - HALF;
        supported = true;
      }
    }
    if (!supported) it.resting = false;
    return;
  }
  const prev = it.y + HALF;
  it.vy = Math.min(it.knockedBy >= 0 ? KNOCK_FALL : MAX_FALL, it.vy + GRAVITY);
  it.x += it.vx;
  it.y += it.vy;
  it.spin += (it.vx || it.vy * 0.2) * 0.12;
  if (it.x < world.blast.left || it.x > world.blast.right) {
    it.active = false;
    return;
  }
  wallBounce(world, it);
  if (it.vy < 0) return;
  const bottom = it.y + HALF;
  for (const p of world.platforms) {
    if (it.x < p.x || it.x > p.right) continue;
    if (prev <= p.top + 1 && bottom >= p.top) {
      it.y = p.top - HALF;
      if (it.vy > 2.2) {
        // a hard landing bounces
        it.vy = -it.vy * ITEM_BOUNCE;
        it.vx *= 0.75;
      } else {
        it.vy = 0;
        it.resting = true;
      }
      break;
    }
  }
}

/** Bounce off the sides of solid platforms. */
function wallBounce(world: World, it: Item): void {
  for (const p of world.platforms) {
    if (p.kind !== 'solid' || it.y + HALF <= p.top + 2 || it.y - HALF >= p.top + p.h) continue;
    if (it.vx > 0 && it.x + HALF > p.x && it.x - it.vx + HALF <= p.x + 0.01) {
      it.x = p.x - HALF;
      it.vx = -it.vx * ITEM_WALL;
    } else if (it.vx < 0 && it.x - HALF < p.right && it.x - it.vx - HALF >= p.right - 0.01) {
      it.x = p.right + HALF;
      it.vx = -it.vx * ITEM_WALL;
    }
  }
}

const rh = [0, 0, 0, 0];

/**
 * Attacks knock loose items: the first live hitbox to touch an item sends it flying along the hit's angle, faster for
 * stronger hits. A knocked Shock Bomb arms and flies as if thrown by the hitter.
 */
function knockItem(world: World, it: Item): boolean {
  if (it.knockCd > 0) return false;
  for (const f of world.fighters) {
    const m = f.move;
    if (f.state !== 'attack' || !m || f.hitlag > 0) continue;
    for (const hb of m.hitboxes) {
      if (hb.grab || hb.throw || !hitboxActive(f, m, hb)) continue;
      hitboxRect(f, hb, rh);
      if (it.x + HALF <= rh[0] || it.x - HALF >= rh[0] + rh[2] || it.y + HALF <= rh[1] || it.y - HALF >= rh[1] + rh[3]) continue;
      const dir = hb.dir === 'away' ? (it.x >= f.x ? 1 : -1) : f.facing;
      const ang = ((hb.angle === 361 ? 45 : hb.angle) * Math.PI) / 180;
      const speed = Math.min(KNOCK_MAX, Math.max(KNOCK_MIN, 2.5 + hb.base * 0.05 + hb.damage * 0.3));
      it.vx = Math.cos(ang) * speed * dir;
      it.vy = Math.min(-2, -Math.sin(ang) * speed);
      it.resting = false;
      it.knockedBy = f.id;
      it.knockGrace = KNOCK_GRACE;
      it.knockCd = KNOCK_COOLDOWN;
      if (it.kind === 'bomb') {
        it.thrown = true;
        it.owner = f.id;
        it.fuse = BOMB.fuse;
        it.age = 0;
      }
      world.emit('itemKnock', f, it.x, it.y, speed, ITEM_KINDS.indexOf(it.kind));
      return it.thrown;
    }
  }
  return false;
}

/** A fast knocked item clips the first rival in its path: a small hit credited to the knocker, then it rebounds. */
function bumpFighters(world: World, it: Item): boolean {
  if (it.knockedBy < 0 || it.resting || Math.hypot(it.vx, it.vy) < BUMP_SPEED) return false;
  for (const f of world.fighters) {
    if (f.state === 'ko' || f.invuln > 0 || f.state === 'grabbed' || f.id === it.knockedBy || world.allied(it.knockedBy, f.id)) continue;
    hurtRect(f, r);
    if (it.x + HALF <= r[0] || it.x - HALF >= r[0] + r[2] || it.y + HALF <= r[1] || it.y - HALF >= r[1] + r[3]) continue;
    const dir: 1 | -1 = it.vx > 0.2 ? 1 : it.vx < -0.2 ? -1 : f.x >= it.x ? 1 : -1;
    if (f.state === 'shield' || f.state === 'shieldstun') {
      f.shieldHit(BUMP.damage, false, 1, dir, world);
      world.emit('shieldHit', f, f.x, f.y - f.h / 2, f.shieldRadius, BUMP.damage);
    } else {
      f.receiveHit({ ...BUMP, direction: dir, hitlag: 5, attackerId: it.knockedBy }, world);
    }
    it.vx = -it.vx * 0.35;
    it.vy = -2.5;
    it.knockGrace = 0;
    it.pickDelay = 20;
    it.knockedBy = -1; // spent: an ordinary falling item again
    return true;
  }
  return false;
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
