import { hurtRect } from './combat';
import type { World } from './world';

export const MAX_ITEMS = 4;
export type ItemKind = 'heal' | 'cell' | 'boost';
export const ITEM_KINDS: ItemKind[] = ['heal', 'cell', 'boost'];
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
        slot.kind = roll < 0.45 ? 'heal' : roll < 0.8 ? 'cell' : 'boost';
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
        it.active = false;
        applyItem(world, it.kind, f.id);
        world.emit('itemPickup', f, it.x, it.y, ITEM_KINDS.indexOf(it.kind), 0);
        break;
      }
    }
  }
}
