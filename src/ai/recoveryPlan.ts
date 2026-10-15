import { Button, makeInput } from '../engine/buttons';
import { Fighter } from '../engine/fighter';
import type { Ledge } from '../engine/platform';
import { World } from '../engine/world';
import { applyHeld } from '../game/controllers';

/**
 * Recovery planning from the engine's own physics. A fighter's up special is flown once in an empty sky (a private World on
 * the same stage, far from every platform) and its path cached; the CPU then checks, frame by frame, whether that path
 * started from where it is (or where a drift / a double jump / an air dodge would take it) reaches the ledge or the
 * stage, and fires it at the last frame that still does. Works whatever the launch and move tuning is.
 */

interface Path {
  dx: Float32Array;
  dy: Float32Array;
  vy: Float32Array;
  n: number;
}

const paths = new Map<string, Path | null>();

/** The up special's path (dx forward, dy down-positive) when started falling at full speed, stick up + forward. */
export function upBPath(f: Fighter, world: World, slot: string): Path | null {
  const key = `${f.data.id}:${slot}`;
  if (paths.has(key)) return paths.get(key)!;
  let path: Path | null = null;
  try {
    const w = new World(world.stage);
    const g = new Fighter(0, f.data);
    w.addFighter(g);
    const b = w.blast;
    // high in the sky over the left blast zone side, clear of platforms
    const x0 = b.left + 120;
    const y0 = b.top + 140;
    g.spawn(x0, y0, 1);
    Object.assign(g, { grounded: false, groundPlat: null, state: 'air', vx: 0, vy: g.stats.fallSpeed, invuln: 0, jumpsLeft: 0 });
    const inp = makeInput();
    const dx = new Float32Array(120);
    const dy = new Float32Array(120);
    const vy = new Float32Array(120);
    let n = 0;
    let prev = 0;
    let started = false;
    for (let t = 0; t < 120; t++) {
      const held = t < 2 ? Button.Special : 0;
      inp.stickX = 1;
      inp.stickY = -1;
      applyHeld(inp, held, prev);
      prev = held;
      w.step([inp]);
      if (g.state === 'attack') started = true;
      dx[n] = g.x - x0;
      dy[n] = g.y - y0;
      vy[n] = g.vy;
      n++;
      if (started && g.helpless && g.vy > 0 && g.y > y0 + 40) break;
      if (g.state === 'ko' || g.grounded) break;
    }
    if (started) path = { dx, dy, vy, n };
  } catch {
    path = null;
  }
  paths.set(key, path);
  return path;
}

/**
 * Does the up special, started at (x, y) heading toward ledge `l`, end on the ledge (the grab box of Fighter.tryLedgeGrab,
 * which only catches a fighter no longer rising fast) or on top of the ledge's platform?
 */
export function pathReaches(f: Fighter, l: Ledge, p: Path, x: number, y: number, vx: number): boolean {
  const dirIn = -l.side;
  const top = l.y;
  const plat = l.platform;
  let py0 = y;
  for (let i = 0; i < p.n; i++) {
    // our current horizontal momentum fades over the first frames of the move
    const carry = vx * Math.min(i, 12) * 0.5;
    const px = x + dirIn * p.dx[i] + carry;
    const py = y + p.dy[i];
    const outside = (px - l.x) * l.side;
    const head = py - f.h - top;
    // rising into the underside of the stage stops the move dead: that path is blocked
    if (px > plat.x - f.hw && px < plat.right + f.hw && py > top + 4 && py - f.h < top + plat.h) return false;
    if (p.vy[i] >= -1 && outside > -f.hw * 0.4 && outside < f.hw + 14 && head > -8 && head < 20) return true;
    if (py >= top && py0 < top && px > plat.x + 4 && px < plat.right - 4) return true;
    py0 = py;
  }
  return false;
}

export interface Sim {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

/** One frame of free air drift toward `dir` (no move running). */
export function drift(f: Fighter, s: Sim, dir: number): void {
  const st = f.stats;
  const target = dir * st.airSpeed;
  s.vx = s.vx < target ? Math.min(target, s.vx + st.airAccel) : Math.max(target, s.vx - st.airAccel);
  s.vy = Math.min(st.fallSpeed, s.vy + st.gravity);
  s.x += s.vx;
  s.y += s.vy;
}

/** Starting a double jump now (vy reset, horizontal speed set by the stick), then drifting: does the path ever reach? */
export function jumpThenReaches(f: Fighter, l: Ledge, p: Path, s0: Sim, delay: number, frames = 60): boolean {
  const dir = -l.side;
  const s = { ...s0 };
  for (let i = 0; i < delay; i++) drift(f, s, dir);
  s.vy = -Math.sqrt(2 * f.stats.gravity * f.stats.doubleJumpHeight);
  s.vx = dir * f.stats.airSpeed;
  for (let t = 0; t < frames; t++) {
    drift(f, s, dir);
    if (t % 2 === 0 && pathReaches(f, l, p, s.x, s.y, s.vx)) return true;
    if (s.vy > 0 && s.y > l.y + 260) break;
  }
  return false;
}

/** Drifting (no jump) for up to `frames`: does the path ever reach from some point along it? */
export function driftThenReaches(f: Fighter, l: Ledge, p: Path, s0: Sim, frames = 60): boolean {
  const dir = -l.side;
  const s = { ...s0 };
  for (let t = 0; t < frames; t++) {
    drift(f, s, dir);
    if (t % 2 === 0 && pathReaches(f, l, p, s.x, s.y, s.vx)) return true;
    if (s.vy > 0 && s.y > l.y + 260) break;
  }
  return false;
}
