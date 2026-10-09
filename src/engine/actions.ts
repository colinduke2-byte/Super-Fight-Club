import type { FighterInput } from './buttons';
import { hurtRect } from './combat';
import type { Fighter } from './fighter';
import type { MoveEvent } from './moves';
import type { Ledge, Platform } from './platform';
import type { World } from './world';

const TELEPORT_STEP = 2;
const TETHER_STEP = 3;
const LEDGE_ATTACH_RADIUS = 14;
const tmpRect = [0, 0, 0, 0];

/** Runs one frame-timed move event for fighter `f`. */
export function executeMoveEvent(f: Fighter, ev: MoveEvent, inp: FighterInput, world: World): void {
  switch (ev.action) {
    case 'projectile':
      world.spawnProjectile(f.id, ev.id, f.x + f.facing * ev.x, f.y + ev.y, f.facing * ev.vx, ev.vy, f.damageMult * chargeScale(f));
      break;
    case 'deploy':
      world.spawnDeployable(f.id, ev.id, f.x + f.facing * ev.x, f.y + ev.y);
      break;
    case 'teleport':
      teleport(f, ev.dist, ev.dir ?? 'stick8', inp, world, ev.leaveMarker);
      break;
    case 'recall': {
      const m = world.findDeployables(f.id, ev.id)[0];
      if (m) {
        const ok = teleportTo(f, m.x, m.y, world);
        if (ok) m.deactivate();
      }
      break;
    }
    case 'barrier':
      f.barrier = { frames: ev.frames, x: ev.x, y: ev.y, w: ev.w, h: ev.h };
      break;
    case 'tether':
      fireTether(f, ev.angle, ev.range, ev.speed, !!ev.grabsOpponents, world, ev.cone ?? 0);
      break;
    case 'ledgeSnap':
      snapToLedge(f, ev.range, world);
      break;
    case 'status':
      f.applyStatus(ev.status, world);
      break;
    case 'resource':
      f.res[ev.key] = Math.max(0, (f.res[ev.key] ?? 0) + ev.add);
      break;
    case 'custom':
      f.data.behavior?.onMoveEvent?.(f, ev.name, ev.args ?? [], world);
      break;
    case 'fx':
      world.emit('fx', f, f.x, f.y, f.facing, 0, ev.name);
      break;
  }
}

/** Damage scale from the current move's charge (chargeable spells). */
function chargeScale(f: Fighter): number {
  const c = f.move?.charge;
  return c ? 1 + (c.damageMult - 1) * f.chargeFrac : 1;
}

// ---- teleport --------------------------------------------------------------------------------
/** 8-way direction from the stick (neutral = facing). Writes a unit vector into `out`. */
export function stick8(inp: FighterInput, facing: number, out: { x: number; y: number }): void {
  const sx = Math.abs(inp.stickX) > 0.4 ? Math.sign(inp.stickX) : 0;
  const sy = Math.abs(inp.stickY) > 0.4 ? Math.sign(inp.stickY) : 0;
  let x = sx;
  let y = sy;
  if (x === 0 && y === 0) x = facing;
  const len = Math.hypot(x, y);
  out.x = x / len;
  out.y = y / len;
}

function bodyFree(f: Fighter, x: number, y: number, world: World): boolean {
  for (const p of world.platforms) {
    if (p.kind !== 'solid') continue;
    if (x + f.hw > p.x && x - f.hw < p.right && y > p.top + 0.5 && y - f.h < p.bottom - 0.5) return false;
  }
  const b = world.blast;
  return x > b.left && x < b.right && y > b.top && y - f.h < b.bottom;
}

const dirTmp = { x: 0, y: 0 };

/** Instant move of up to `dist` px, stopping before solid geometry. Records the origin for effects. */
export function teleport(f: Fighter, dist: number, dir: 'stick8' | 'forward' | 'up' | 'up8' | 'back', inp: FighterInput, world: World, leaveMarker?: string): void {
  if (dir === 'stick8') stick8(inp, f.facing, dirTmp);
  else if (dir === 'up8') {
    // mostly up, leaning toward the stick horizontally
    const sx = Math.abs(inp.stickX) > 0.4 ? Math.sign(inp.stickX) * 0.6 : 0;
    const len = Math.hypot(sx, 1);
    dirTmp.x = sx / len;
    dirTmp.y = -1 / len;
  }
  else if (dir === 'forward') (dirTmp.x = f.facing), (dirTmp.y = 0);
  else if (dir === 'back') (dirTmp.x = -f.facing), (dirTmp.y = 0);
  else (dirTmp.x = 0), (dirTmp.y = -1);
  f.tpFromX = f.x;
  f.tpFromY = f.y;
  if (leaveMarker) world.spawnDeployable(f.id, leaveMarker, f.x, f.y); // Blink Trail: one marker, replaced by the newest
  let x = f.x;
  let y = f.y;
  for (let d = TELEPORT_STEP; d <= dist; d += TELEPORT_STEP) {
    const nx = f.x + dirTmp.x * d;
    const ny = f.y + dirTmp.y * d;
    if (!bodyFree(f, nx, ny, world)) break;
    x = nx;
    y = ny;
  }
  f.placeAt(x, y, world.platforms);
  if (Math.abs(dirTmp.x) > 0.3) f.facing = dirTmp.x > 0 ? 1 : -1;
  world.emit('teleport', f, x, y, Math.hypot(x - f.tpFromX, y - f.tpFromY), 0);
}

/** Return to a previously saved position (e.g. a Blink marker), if the spot is free. */
export function teleportTo(f: Fighter, x: number, y: number, world: World): boolean {
  if (!bodyFree(f, x, y, world)) return false;
  f.tpFromX = f.x;
  f.tpFromY = f.y;
  f.placeAt(x, y, world.platforms);
  world.emit('teleport', f, x, y, Math.hypot(x - f.tpFromX, y - f.tpFromY), 0);
  return true;
}

// ---- ledge snap ------------------------------------------------------------------------------
export function snapToLedge(f: Fighter, range: number, world: World): boolean {
  let best: Ledge | null = null;
  let bestD = range;
  const cx = f.x;
  const cy = f.y - f.h / 2;
  for (const l of world.ledges) {
    if (l.occupant !== -1 && l.occupant !== f.id) continue;
    const d = Math.hypot(l.x - cx, l.y - cy);
    if (d <= bestD) {
      best = l;
      bestD = d;
    }
  }
  if (!best) return false;
  f.grabLedge(best, world);
  return true;
}

// ---- tether ----------------------------------------------------------------------------------
/**
 * Fires a hook along `angle` degrees (0 = forward, 90 = up). It latches the nearest ledge or one-way
 * platform within `range`; with `grabsOpponents` a fighter in the way is grabbed instead.
 */
function fireTether(f: Fighter, angle: number, range: number, speed: number, grabsOpponents: boolean, world: World, cone: number): void {
  // try the aimed angle first, then fan out either side (a forgiving hook for recoveries)
  const offsets = [0];
  for (let c = 10; c <= cone; c += 10) offsets.push(-c, c);
  for (const off of offsets) if (tryTether(f, angle + off, range, speed, grabsOpponents, world)) return;
}

function tryTether(f: Fighter, angle: number, range: number, speed: number, grabsOpponents: boolean, world: World): boolean {
  const rad = (angle * Math.PI) / 180;
  const dx = Math.cos(rad) * f.facing;
  const dy = -Math.sin(rad);
  const ox = f.x + f.facing * 6;
  const oy = f.y - f.h * 0.6;
  for (let d = TETHER_STEP; d <= range; d += TETHER_STEP) {
    const px = ox + dx * d;
    const py = oy + dy * d;
    if (grabsOpponents) {
      for (const v of world.fighters) {
        if (v === f || v.state === 'ko' || v.invuln > 0 || v.state === 'grabbed') continue;
        hurtRect(v, tmpRect);
        if (px >= tmpRect[0] && px <= tmpRect[0] + tmpRect[2] && py >= tmpRect[1] && py <= tmpRect[1] + tmpRect[3]) {
          world.emit('tether', f, px, py, 1, v.id);
          f.grabVictim(v);
          v.x = f.x + f.facing * 18;
          v.y = f.y;
          return true;
        }
      }
    }
    // a hook passing close to a free ledge corner latches it (forgiving: it need not touch the stage itself)
    for (const l of world.ledges) {
      if (l.occupant !== -1 && l.occupant !== f.id) continue;
      if (Math.hypot(l.x - px, l.y - py) <= LEDGE_ATTACH_RADIUS) {
        f.beginTether(l.x, l.y, speed, l, null);
        world.emit('tether', f, l.x, l.y, 0, -1);
        return true;
      }
    }
    for (const p of world.platforms) {
      if (px < p.x - 2 || px > p.right + 2 || py < p.top - 2 || py > p.bottom + 2) continue;
      if (p.kind === 'solid') {
        // solids can only be hooked at a ledge corner
        if (!p.ledges) continue;
        const ledge = nearestLedge(world, p, px, py);
        if (!ledge) continue;
        f.beginTether(ledge.x, ledge.y, speed, ledge, null);
        world.emit('tether', f, ledge.x, ledge.y, 0, -1);
        return true;
      }
      f.beginTether(Math.min(p.right - 4, Math.max(p.x + 4, px)), p.top, speed, null, p);
      world.emit('tether', f, px, p.top, 0, -1);
      return true;
    }
  }
  return false;
}

function nearestLedge(world: World, p: Platform, px: number, py: number): Ledge | null {
  let best: Ledge | null = null;
  let bd = LEDGE_ATTACH_RADIUS;
  for (const l of world.ledges) {
    if (l.platform !== p || (l.occupant !== -1)) continue;
    const d = Math.hypot(l.x - px, l.y - py);
    if (d <= bd) {
      best = l;
      bd = d;
    }
  }
  return best;
}
