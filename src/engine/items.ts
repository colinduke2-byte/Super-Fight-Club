import { deliverHit, hitboxActive, hitboxRect, hurtRect } from './combat';
import { makeInput } from './buttons';
import type { Fighter } from './fighter';
import type { HitboxDef, MoveDef, ProjectileDef } from './moves';
import type { World } from './world';

export const MAX_ITEMS = 4;
export type ItemKind = 'heal' | 'cell' | 'boost' | 'bomb' | 'aegis' | 'sword' | 'raygun' | 'crate' | 'core';
/** Index order is part of the event contract (`itemPickup` / `itemSpawn` magnitude): append only. */
export const ITEM_KINDS: ItemKind[] = ['heal', 'cell', 'boost', 'bomb', 'aegis', 'sword', 'raygun', 'crate', 'core'];
/** Carried in hand (the `heldBomb` path): Attack uses them instead of the fighter's own attacks. */
export const HELD_KINDS: ReadonlySet<ItemKind> = new Set(['bomb', 'sword', 'raygun']);
/** Aegis Prism: frames of invincibility, lost early the moment its holder lands a hit. */
export const AEGIS_FRAMES = 180;
/** Energy Cell: ultimate meter added. */
export const CELL_METER = 25;
/** Shock Bomb: picked up and carried, thrown with Attack; bursts on any fighter, on landing, or when the fuse runs out. */
export const BOMB = { fuse: 150, speed: 6.2, lift: -3.2, upSpeed: -8.5, gravity: 0.32, radius: 30, damage: 14, base: 44, scaling: 0.85, angle: 62, ownerGrace: 14 };
/**
 * Beam Sword: Attack swings it with the fighter's own tilt / aerial animation (so every swing has that move's startup and
 * recovery), but the hit is the blade's: longer reach, one hit per swing. It burns out after `swings`.
 */
export const SWORD = { swings: 10, reach: 42, damage: 10, base: 32, scaling: 0.78, angle: 40, hitlag: 1.1 };
/** Ray Gun: Attack fires a straight laser (reflectable); a short cooldown, `shots` shots, then the next Attack tosses it. */
export const RAYGUN = { shots: 7, cooldown: 26, speed: 8.5, recoil: 0.7 };
/** Crate: attacks chip it (`hp` damage); a plain one spills 1-2 items, a hazard-striped one primes and blows after `fuse`. */
export const CRATE = { hp: 18, hw: 10, h: 18, volatileChance: 0.35, fuse: 40, radius: 46, damage: 16, base: 46, scaling: 0.9, angle: 60, hitCd: 10 };
/** Spawn odds (relative weights). Crates never drop crates. */
const SPAWN_WEIGHTS: readonly (readonly [ItemKind, number])[] = [
  ['heal', 20],
  ['cell', 15],
  ['boost', 11],
  ['bomb', 12],
  ['aegis', 5],
  ['sword', 9],
  ['raygun', 9],
  ['crate', 15],
  ['core', 4],
];
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
/** Spawns drop from this high above the chosen platform. */
const DROP_HEIGHT = 70;

/** The Ray Gun's laser (spawned straight into the projectile pool; owner = the shooter). */
const RAY_DEF: ProjectileDef = {
  w: 14,
  h: 4,
  life: 48,
  hit: { x: 0, y: 0, w: 0, h: 0, damage: 5, angle: 18, base: 22, scaling: 0.35, hitlag: 0.6, fx: 'zap' },
  reflectable: true,
  look: { shape: 'bolt', color: '#ff4a7a' },
};
export const RAYGUN_PROJECTILE = 'item:raygun';

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
  /** Crate: damage it can still take; hazard-striped (explodes); broken and counting down `fuse` to the blast. */
  hp = 0;
  volatile = false;
  primed = false;
  /** An emptied Ray Gun tossed away: not pickable, gone soon after it lands. */
  spent = false;
  constructor(readonly index: number) {}
}

function resetItem(it: Item, kind: ItemKind): void {
  it.active = true;
  it.kind = kind;
  it.thrown = false;
  it.owner = -1;
  it.vy = 0;
  it.vx = 0;
  it.spin = 0;
  it.fuse = 0;
  it.knockedBy = -1;
  it.knockGrace = 0;
  it.knockCd = 0;
  it.pickDelay = 0;
  it.age = 0;
  it.resting = false;
  it.hp = kind === 'crate' ? CRATE.hp : 0;
  it.volatile = false;
  it.primed = false;
  it.spent = false;
}

/** Per-fighter item state the fighter itself does not carry (what is in hand, ammo, the Aegis bookkeeping, view cues). */
export interface HeldState {
  /** The carried item while `heldBomb` is set (null = a plain Shock Bomb, e.g. set by a test). */
  kind: ItemKind | null;
  /** Swings / shots left. */
  uses: number;
  /** Ray Gun cooldown frames. */
  cd: number;
  /** The move a Beam Sword swing is riding, its blade direction and who it already hit. */
  swing: MoveDef | null;
  swingDir: SwingDir;
  swingMask: number;
  swingTick: number;
  shotTick: number;
  /** damageDealt when the Aegis was picked up: any rise means its holder landed a hit. */
  aegisDealt: number;
  aegisLostTick: number;
  /** Last pickup (view: the icon pops over the fighter). */
  popKind: ItemKind | null;
  popTick: number;
}
export type SwingDir = 'fwd' | 'back' | 'up' | 'low' | 'down' | 'spin';
const HELD = new WeakMap<World, HeldState[]>();

/** The item state of fighter `id` in `world` (created on first use; deterministic: keyed by the world). */
export function heldState(world: World, id: number): HeldState {
  let arr = HELD.get(world);
  if (!arr) {
    arr = [];
    HELD.set(world, arr);
  }
  while (arr.length <= id) arr.push({ kind: null, uses: 0, cd: 0, swing: null, swingDir: 'fwd', swingMask: 0, swingTick: -999, shotTick: -999, aegisDealt: 0, aegisLostTick: -999, popKind: null, popTick: -999 });
  return arr[id];
}

/** What fighter `id` carries: 'bomb' | 'sword' | 'raygun', or null. For the view and the CPU. */
export function heldItem(world: World, id: number): ItemKind | null {
  const f = world.fighters[id];
  if (!f?.heldBomb) return null;
  return heldState(world, id).kind ?? 'bomb';
}

/** Med-Kit -25%, Energy Cell +25 meter, Overdrive 10 s of +30% damage, Aegis Prism 3 s invincibility (lost on landing a hit), Core Fragment fills the meter. */
export function applyItem(world: World, kind: ItemKind, fighterId: number): void {
  const f = world.fighters[fighterId];
  if (kind === 'heal') f.damage = Math.max(0, f.damage - 25);
  else if (kind === 'cell') f.addMeterRaw(CELL_METER, world);
  else if (kind === 'core') f.addMeterRaw(1e6, world);
  else if (kind === 'aegis') {
    f.invuln = Math.max(f.invuln, AEGIS_FRAMES);
    f.aegisFrames = AEGIS_FRAMES;
    heldState(world, fighterId).aegisDealt = world.damageDealt[fighterId] ?? 0;
  } else if (kind === 'boost') f.boostFrames = 600;
}

/** Deterministic LCG so item drops replay identically. */
function rnd(world: World): number {
  world.itemSeed = (Math.imul(world.itemSeed, 1664525) + 1013904223) >>> 0;
  return world.itemSeed / 4294967296;
}

const r = [0, 0, 0, 0];

function rollKind(world: World, noCrate: boolean): ItemKind | null {
  const off = world.config.itemsOff ?? 0;
  const skip = (k: ItemKind): boolean => (noCrate && k === 'crate') || (off & (1 << ITEM_KINDS.indexOf(k))) !== 0;
  let total = 0;
  for (const [k, w] of SPAWN_WEIGHTS) if (!skip(k)) total += w;
  if (total <= 0) return null; // every kind switched off
  let roll = rnd(world) * total;
  for (const [k, w] of SPAWN_WEIGHTS) {
    if (skip(k)) continue;
    roll -= w;
    if (roll < 0) return k;
  }
  return 'heal';
}

const spawnAt = { x: 0, y: 0 };
/**
 * Choose where a new item drops: any static platform (weighted by width; moving ones less often), at a spot clear of stage
 * hazard columns and with open air above it. Falls back to the widest solid platform.
 */
function pickSpawn(world: World): void {
  const b = world.blast;
  let total = 0;
  for (const p of world.platforms) total += spawnWeight(world, p);
  for (let tries = 0; tries < 6 && total > 0; tries++) {
    let roll = rnd(world) * total;
    let plat = world.platforms[0];
    for (const p of world.platforms) {
      const w = spawnWeight(world, p);
      if (w <= 0) continue;
      plat = p;
      roll -= w;
      if (roll < 0) break;
    }
    const x = plat.x + 14 + rnd(world) * (plat.w - 28);
    if (!safeSpot(world, plat, x)) continue;
    spawnAt.x = x;
    spawnAt.y = Math.max(b.top + 30, plat.top - DROP_HEIGHT);
    return;
  }
  let main = world.platforms[0];
  for (const p of world.platforms) if (p.kind === 'solid' && p.w > (main.kind === 'solid' ? main.w : 0)) main = p;
  spawnAt.x = main.x + 20 + rnd(world) * Math.max(0, main.w - 40);
  spawnAt.y = Math.max(b.top + 30, main.top - DROP_HEIGHT);
}

function spawnWeight(world: World, p: import('./platform').Platform): number {
  if (p.dynamic || p.w < 30) return 0;
  const b = world.blast;
  if (p.top < b.top + 60 || p.top > b.bottom - 40 || p.x < b.left + 20 || p.right > b.right - 20) return 0;
  return Math.min(p.w, 360) * (p.kind === 'solid' ? 1 : 0.8) * (p.moving ? 0.35 : 1);
}

function safeSpot(world: World, plat: import('./platform').Platform, x: number): boolean {
  for (const hz of world.stage.hazards ?? []) {
    if (hz.kind === 'avalanche') continue;
    if (Math.abs(x - hz.x) < hz.w / 2 + 14) return false;
  }
  // open air above: no solid block between the drop height and the landing spot
  for (const q of world.platforms) {
    if (q === plat || q.kind !== 'solid' || x < q.x - 8 || x > q.right + 8) continue;
    if (q.bottom <= plat.top + 1 && q.bottom > plat.top - DROP_HEIGHT - 10) return false;
  }
  return true;
}

export function stepItems(world: World): void {
  const rate = world.config.itemRate;
  const items = world.items;
  if (rate > 0 && world.tick % ITEM_INTERVAL[rate] === 0 && world.tick > 0) {
    let live = 0;
    for (const it of items) if (it.active) live++;
    if (live < 2) {
      const slot = items.find((it) => !it.active);
      const kind = slot ? rollKind(world, false) : null;
      if (slot && kind) {
        resetItem(slot, kind);
        if (slot.kind === 'crate') slot.volatile = rnd(world) < CRATE.volatileChance;
        pickSpawn(world);
        slot.x = spawnAt.x;
        slot.y = spawnAt.y;
        world.emit('itemSpawn', world.fighters[0], slot.x, slot.y, ITEM_KINDS.indexOf(slot.kind), 0);
      }
    }
  }
  stepHolders(world);
  for (const it of items) {
    if (!it.active) continue;
    if (it.primed) {
      stepPrimed(world, it);
      continue;
    }
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
    if (it.kind === 'crate') {
      if (strikeCrate(world, it)) continue;
      moveFree(world, it);
      continue;
    }
    if (knockItem(world, it)) continue;
    moveFree(world, it);
    if (!it.active) continue;
    if (it.spent) {
      if (it.resting && it.age < LIFE - 45) it.age = LIFE - 45; // the empty gun blinks out
      bumpFighters(world, it);
      continue;
    }
    if (bumpFighters(world, it) || it.pickDelay > 0) continue;
    for (const f of world.fighters) {
      if (f.state === 'ko') continue;
      hurtRect(f, r);
      if (it.x + HALF > r[0] && it.x - HALF < r[0] + r[2] && it.y + HALF > r[1] && it.y - HALF < r[1] + r[3]) {
        if (f.id === it.knockedBy && it.knockGrace > 0) continue; // just batted it away
        const h = heldState(world, f.id);
        if (HELD_KINDS.has(it.kind)) {
          if (f.heldBomb || f.state === 'grabbed') continue; // one at a time
          f.heldBomb = true;
          h.kind = it.kind;
          h.uses = it.kind === 'sword' ? SWORD.swings : it.kind === 'raygun' ? RAYGUN.shots : 0;
          h.cd = 0;
          h.swing = null;
        } else applyItem(world, it.kind, f.id);
        it.active = false;
        h.popKind = it.kind;
        h.popTick = world.tick;
        world.emit('itemPickup', f, it.x, it.y, ITEM_KINDS.indexOf(it.kind), 0);
        break;
      }
    }
  }
}

/** Per fighter: forget items no longer in hand, run Beam Sword swings and Ray Gun cooldowns, strip an Aegis whose holder landed a hit. */
function stepHolders(world: World): void {
  for (const f of world.fighters) {
    const h = heldState(world, f.id);
    if (f.aegisFrames > 0) {
      const dealt = world.damageDealt[f.id] ?? 0;
      if (dealt > h.aegisDealt + 1e-6) {
        f.invuln = Math.max(0, f.invuln - f.aegisFrames);
        f.aegisFrames = 0;
        h.aegisLostTick = world.tick;
      } else h.aegisDealt = dealt;
    }
    if (!f.heldBomb) {
      h.kind = null;
      h.swing = null;
      continue;
    }
    if (h.cd > 0) h.cd--;
    if (h.kind !== 'sword') continue;
    if (h.swing && (f.state !== 'attack' || f.move !== h.swing)) h.swing = null; // swing over (or interrupted)
    if (h.swing) swordHits(world, f, h);
    else if (h.uses <= 0) {
      // the blade burns out once its last swing ends
      f.heldBomb = false;
      h.kind = null;
      world.emit('itemKnock', f, f.x + f.facing * 10, f.y - f.h * 0.55, 4, ITEM_KINDS.indexOf('sword'));
    }
  }
}

const rb = [0, 0, 0, 0];
const SWORD_HB: HitboxDef = { x: 0, y: 0, w: 0, h: 0, damage: SWORD.damage, angle: SWORD.angle, base: SWORD.base, scaling: SWORD.scaling, hitlag: SWORD.hitlag, fx: 'slash' };

/** The blade's box for the current swing (world rect into `rb`). */
function bladeRect(f: Fighter, dir: SwingDir): void {
  const reach = SWORD.reach * f.sizeMul;
  const h = f.h * f.sizeMul;
  let x0: number;
  let x1: number;
  let y0: number;
  let y1: number;
  if (dir === 'fwd' || dir === 'back') {
    const s = dir === 'fwd' ? f.facing : -f.facing;
    x0 = f.x + s * 4;
    x1 = f.x + s * (4 + reach);
    y0 = f.y - h * 1.05;
    y1 = f.y - h * 0.15;
  } else if (dir === 'up') {
    x0 = f.x - 26;
    x1 = f.x + 26;
    y0 = f.y - h - reach * 0.8;
    y1 = f.y - h * 0.45;
  } else if (dir === 'low') {
    x0 = f.x + f.facing * 4;
    x1 = f.x + f.facing * (8 + reach);
    y0 = f.y - 16;
    y1 = f.y + 2;
  } else if (dir === 'down') {
    x0 = f.x - 22;
    x1 = f.x + 22;
    y0 = f.y - h * 0.35;
    y1 = f.y + reach * 0.7;
  } else {
    x0 = f.x - reach + 6;
    x1 = f.x + reach - 6;
    y0 = f.y - h;
    y1 = f.y - h * 0.1;
  }
  rb[0] = Math.min(x0, x1);
  rb[1] = y0;
  rb[2] = Math.abs(x1 - x0);
  rb[3] = y1 - y0;
}

/** True while the swing's move is in its active frames (any live hitbox, or the startup..active window). */
function swingLive(f: Fighter, m: MoveDef): boolean {
  let any = false;
  for (const hb of m.hitboxes) {
    if (hb.grab || hb.throw) continue;
    any = true;
    if (hitboxActive(f, m, hb)) return true;
  }
  return !any && f.moveFrame >= m.startup && f.moveFrame < m.startup + Math.max(4, m.active);
}

function swordHits(world: World, f: Fighter, h: HeldState): void {
  const m = h.swing!;
  if (f.hitlag > 0 || !swingLive(f, m)) return;
  bladeRect(f, h.swingDir);
  for (const v of world.fighters) {
    if (v === f || v.state === 'ko' || v.invuln > 0 || v.state === 'grabbed' || world.allied(f.id, v.id) || h.swingMask & (1 << v.id)) continue;
    hurtRect(v, r);
    if (r[0] >= rb[0] + rb[2] || r[0] + r[2] <= rb[0] || r[1] >= rb[1] + rb[3] || r[1] + r[3] <= rb[1]) continue;
    h.swingMask |= 1 << v.id;
    const d = h.swingDir;
    const facing: 1 | -1 = d === 'back' ? (f.facing === 1 ? -1 : 1) : d === 'fwd' || d === 'low' ? f.facing : v.x >= f.x ? 1 : -1;
    SWORD_HB.angle = d === 'up' ? 86 : d === 'down' ? 285 : d === 'low' ? 28 : SWORD.angle;
    SWORD_HB.base = d === 'down' ? 24 : SWORD.base;
    deliverHit(world, { atk: f, ownerId: f.id, def: v, hb: SWORD_HB, damage: SWORD.damage * f.outMul, facing, originX: f.x, kbMult: 1, rect: rb });
    f.moveHit = true;
  }
}

/** Beam Sword: start the fighter's own tilt / aerial for the swing (its native hitboxes are muted; the blade hits instead). */
function swingSword(world: World, f: Fighter, h: HeldState, stickX: number, stickY: number): boolean {
  let id: string;
  let dir: SwingDir;
  if (f.grounded) {
    if (stickY < -0.5) [id, dir] = ['utilt', 'up'];
    else if (stickY > 0.5) [id, dir] = ['dtilt', 'low'];
    else {
      if (Math.abs(stickX) > 0.5) f.facing = stickX > 0 ? 1 : -1;
      [id, dir] = ['ftilt', 'fwd'];
    }
  } else if (stickY < -0.5) [id, dir] = ['uair', 'up'];
  else if (stickY > 0.5) [id, dir] = ['dair', 'down'];
  else if (stickX * f.facing < -0.5) [id, dir] = ['bair', 'back'];
  else if (Math.abs(stickX) > 0.5) [id, dir] = ['fair', 'fwd'];
  else [id, dir] = ['nair', 'spin'];
  const inp = makeInput();
  inp.stickX = stickX;
  inp.stickY = stickY;
  if (!f.startMove(id, inp, world)) {
    if (!f.startMove(f.grounded ? 'jab' : 'nair', inp, world)) return false;
    dir = f.grounded ? 'fwd' : 'spin';
  }
  f.hitMask.fill(0xffff); // the fist / kick under the blade does not land a second hit
  h.swing = f.move;
  h.swingDir = dir;
  h.swingMask = 0;
  h.swingTick = world.tick;
  h.uses--;
  world.emit('itemThrow', f, f.x + f.facing * 12, f.y - f.h * 0.6, 1, ITEM_KINDS.indexOf('sword'));
  return true;
}

/** Ray Gun: fire a laser (cooldown-gated); empty, the next press tosses the gun away. */
function fireRayGun(world: World, f: Fighter, h: HeldState): boolean {
  if (h.cd > 0) return false;
  if (h.uses <= 0) {
    f.heldBomb = false;
    h.kind = null;
    const slot = world.items.find((it) => !it.active);
    if (slot) {
      resetItem(slot, 'raygun');
      slot.spent = true;
      slot.x = f.x + f.facing * 8;
      slot.y = f.y - f.h * 0.6;
      slot.vx = f.facing * 7;
      slot.vy = -2.5;
      slot.knockedBy = f.id;
      slot.knockGrace = KNOCK_GRACE;
      slot.knockCd = KNOCK_COOLDOWN;
    }
    world.emit('itemThrow', f, f.x, f.y - f.h * 0.6, 3, ITEM_KINDS.indexOf('raygun'));
    return true;
  }
  const x = f.x + f.facing * 16 * f.sizeMul;
  const y = f.y - f.h * 0.55 * f.sizeMul;
  for (const p of world.projectiles) {
    if (p.active || (p.def?.blast && !p.exploded && p.age > 0)) continue;
    p.spawn(f.id, RAYGUN_PROJECTILE, RAY_DEF, x, y, f.facing * RAYGUN.speed, 0, f.outMul);
    h.uses--;
    h.cd = RAYGUN.cooldown;
    h.shotTick = world.tick;
    if (!f.grounded || f.state === 'run' || f.state === 'idle' || f.state === 'dash') f.vx -= f.facing * RAYGUN.recoil;
    world.emit('projectile', f, x, y, 0, 0);
    return true;
  }
  return false;
}

/** Attacks and projectiles chip a crate; it hops a little and breaks at 0 hp. Returns true when it broke this tick. */
function strikeCrate(world: World, it: Item): boolean {
  if (it.knockCd > 0) return false;
  const top = it.y + HALF - CRATE.h;
  const bottom = it.y + HALF;
  let dmg = 0;
  let by = -1;
  for (const f of world.fighters) {
    const m = f.move;
    if (f.state !== 'attack' || !m || f.hitlag > 0) continue;
    for (const hb of m.hitboxes) {
      if (hb.grab || hb.throw || !hitboxActive(f, m, hb)) continue;
      hitboxRect(f, hb, rh);
      if (it.x + CRATE.hw <= rh[0] || it.x - CRATE.hw >= rh[0] + rh[2] || bottom <= rh[1] || top >= rh[1] + rh[3]) continue;
      dmg = Math.max(dmg, hb.damage * f.outMul);
      by = f.id;
    }
    // a Beam Sword swing cuts crates too
    const h = heldState(world, f.id);
    if (h.swing === m && h.kind === 'sword' && swingLive(f, m)) {
      bladeRect(f, h.swingDir);
      if (!(it.x + CRATE.hw <= rb[0] || it.x - CRATE.hw >= rb[0] + rb[2] || bottom <= rb[1] || top >= rb[1] + rb[3])) {
        dmg = Math.max(dmg, SWORD.damage * f.outMul);
        by = f.id;
      }
    }
  }
  for (const p of world.projectiles) {
    if (!p.active || !p.def || p.def.blast) continue;
    if (it.x + CRATE.hw <= p.x - p.def.w / 2 || it.x - CRATE.hw >= p.x + p.def.w / 2 || bottom <= p.y - p.def.h / 2 || top >= p.y + p.def.h / 2) continue;
    dmg = Math.max(dmg, p.def.hit.damage * p.dmgMult);
    by = p.owner;
    if (!p.def.pierce) p.deactivate();
  }
  if (by < 0) return false;
  damageCrate(world, it, dmg, by);
  return !it.active || it.primed;
}

function damageCrate(world: World, it: Item, dmg: number, by: number): void {
  it.hp -= dmg;
  it.knockCd = CRATE.hitCd;
  const f = world.fighters[by] ?? world.fighters[0];
  world.emit('itemKnock', f, it.x, it.y - 4, Math.min(6, 1 + dmg * 0.2), ITEM_KINDS.indexOf('crate'));
  if (it.hp > 0) {
    if (it.resting) {
      it.vy = -1.6;
      it.resting = false;
    }
    return;
  }
  if (it.volatile) {
    // cracked open: a short, loud fuse, then it blows (whoever broke it gets the credit)
    it.primed = true;
    it.fuse = CRATE.fuse;
    it.owner = by;
    it.vx = 0;
    return;
  }
  // splinters: spill one or two items
  const n = rnd(world) < 0.4 ? 2 : 1;
  const x = it.x;
  const y = it.y - 6;
  it.active = false;
  for (let k = 0; k < n; k++) {
    const slot = k === 0 ? it : world.items.find((o) => !o.active);
    const kind = slot ? rollKind(world, true) : null;
    if (!slot || !kind) break;
    resetItem(slot, kind);
    slot.x = x;
    slot.y = y;
    slot.vx = n === 1 ? 0 : k === 0 ? -1.3 : 1.3;
    slot.vy = -4.2;
    slot.pickDelay = 14;
    world.emit('itemSpawn', f, x, y, ITEM_KINDS.indexOf(slot.kind), 1);
  }
}

/** A broken volatile crate: sits (falls if knocked off), blinks, blows. */
function stepPrimed(world: World, it: Item): void {
  it.age++;
  moveFree(world, it);
  if (!it.active) return;
  if (--it.fuse <= 0) explode(world, it, CRATE, 0);
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
  const h = heldState(world, fighterId);
  if (h.kind === 'sword') return swingSword(world, f, h, stickX, stickY);
  if (h.kind === 'raygun') return fireRayGun(world, f, h);
  const slot = world.items.find((it) => !it.active);
  if (!slot) return false;
  f.heldBomb = false;
  h.kind = null;
  if (stickX * f.facing < -0.5) f.facing = f.facing === 1 ? -1 : 1; // back-throw turns around
  resetItem(slot, 'bomb');
  slot.thrown = true;
  slot.owner = f.id;
  slot.fuse = BOMB.fuse;
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
  if (boom) explode(world, it, BOMB, BOMB.ownerGrace);
}

interface Blast {
  radius: number;
  damage: number;
  base: number;
  scaling: number;
  angle: number;
}
/**
 * Burst: everyone in the radius (the owner too, once `grace` frames have passed; never the owner's teammates) is launched away,
 * and crates caught in it take the hit (a hazard crate primes: chain reactions).
 */
function explode(world: World, it: Item, P: Blast, grace: number): void {
  it.active = false;
  const owner = world.fighters[it.owner] ?? world.fighters[0];
  world.emit('itemBoom', owner, it.x, it.y, P.radius, it.owner);
  for (const f of world.fighters) {
    if (f.state === 'ko' || f.invuln > 0 || f.state === 'grabbed') continue;
    if (f.id === it.owner && it.age < grace) continue;
    if (f.id !== it.owner && world.allied(it.owner, f.id)) continue;
    hurtRect(f, r);
    const cx = Math.max(r[0], Math.min(it.x, r[0] + r[2]));
    const cy = Math.max(r[1], Math.min(it.y, r[1] + r[3]));
    if (Math.hypot(cx - it.x, cy - it.y) > P.radius) continue;
    if (f.state === 'shield' || f.state === 'shieldstun') {
      // a shield soaks the blast (heavy shield damage, pushed back)
      f.shieldHit(P.damage, false, 1.5, f.x >= it.x ? 1 : -1, world);
      f.hitlag = 8;
      world.emit('shieldHit', f, f.x, f.y - f.h / 2, f.shieldRadius, P.damage);
      continue;
    }
    f.receiveHit({ damage: P.damage, base: P.base, scaling: P.scaling, angle: P.angle, direction: f.x >= it.x ? 1 : -1, hitlag: 10, attackerId: f.id !== it.owner && it.owner >= 0 ? it.owner : undefined }, world);
  }
  for (const c of world.items) {
    if (!c.active || c.kind !== 'crate' || c.primed || c === it) continue;
    if (Math.hypot(c.x - it.x, c.y - it.y) <= P.radius + CRATE.hw) damageCrate(world, c, CRATE.hp, it.owner >= 0 ? it.owner : 0);
  }
}
