import { Button, makeInput } from '../engine/buttons';
import { Fighter } from '../engine/fighter';
import type { Ledge } from '../engine/platform';
import { World } from '../engine/world';
import { applyHeld } from '../game/controllers';

/**
 * Recovery planning from the engine's own physics: candidate attempts (drift, double jump, air dodge, the up special aimed a
 * few ways) are flown with the real engine on a private copy of the stage, and the CPU picks one that gets back. Works
 * whatever the launch and move tuning is, and for every kind of recovery (see simulateRecovery).
 */

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

// ---- engine-simulated recovery (every recovery type) ----------------------------------------------------------------
/**
 * A recovery attempt the CPU could make from where it is: wait `specialAt` frames (drifting toward the stage), spend the
 * double jump at `jumpAt` (-1 = keep it), air dodge in at `dodgeAt` (-1 = no), then fire the up special with the stick at
 * (`inX` toward the stage, `sy`) and keep steering. `float` holds Jump once the jumps are spent (glide / jet hover).
 * Simulated with the real engine on a private copy of the stage, so it covers fixed, stick-aimed and teleport up specials,
 * tethers, glides, hovers and wall jumps alike.
 */
export interface RecPolicy {
  /** Optional aerial first: Attack pressed at `attackAt` with the stick at (ax, ay). */
  attackAt?: number;
  ax?: number;
  ay?: number;
  jumpAt: number;
  specialAt: number;
  dodgeAt: number;
  inX: number;
  sy: number;
  float: boolean;
}

interface SimRig {
  w: World;
  dummy: Fighter;
  ghosts: Map<string, Fighter>;
}
const rigs = new Map<string, SimRig>();
const simIn = makeInput();
/** Ledge occupant id that blocks every grab in the private world (no fighter has it). */
const BLOCKED = 99;

function rigFor(world: World, f: Fighter): { rig: SimRig; g: Fighter } {
  let rig = rigs.get(world.stage.id);
  if (!rig) {
    const w = new World(world.stage);
    const dummy = new Fighter(1, f.data);
    rig = { w, dummy, ghosts: new Map() };
    w.fighters.push(new Fighter(0, f.data), dummy);
    rigs.set(world.stage.id, rig);
  }
  let g = rig.ghosts.get(f.data.id);
  if (!g) {
    g = new Fighter(0, f.data);
    rig.ghosts.set(f.data.id, g);
  }
  rig.w.fighters[0] = g;
  return { rig, g };
}

/** Where the attempt aims: the hang point of ledge `l`, or a spot on the stage just in from it when we are above it. */
function aimX(g: Fighter, l: Ledge, landIn: number): number {
  return g.y < l.y - 2 ? l.x - l.side * (g.hw + landIn) : l.x + l.side * (g.hw + 4);
}

/** The stick for one frame of an attempt (shared by the simulation and the CPU, so the CPU flies what it simulated). */
export function policyStick(g: Fighter, l: Ledge, pol: RecPolicy, landIn: number, out: { x: number; y: number }): void {
  const dirIn = -l.side;
  if (g.state === 'attack' || g.state === 'tether') {
    // during the up special: hold the chosen direction (a teleport / tether reads it), drifting moves steer toward the target
    const dx = aimX(g, l, landIn) - g.x;
    out.x = pol.inX !== 0 ? dirIn * pol.inX : Math.abs(dx) < 4 ? 0 : Math.sign(dx) * 0.5;
    out.y = pol.sy;
    return;
  }
  const dx = aimX(g, l, landIn) - g.x;
  out.x = Math.abs(dx) < 5 ? dirIn * 0.4 : Math.sign(dx);
  out.y = 0;
  // never drift in under the stage's underside while below it
  if (g.y - g.h > l.y + 2 && (g.x - l.x) * l.side < g.hw + 4) out.x = l.side;
}

const stk = { x: 0, y: 0 };
/** Simulated fighter frames run by the planner (for measuring its cost). */
export const simStats = { calls: 0, frames: 0 };

/**
 * Fly `pol` from the fighter's current state on a private copy of the stage. Returns the frames it takes to stand on a
 * platform or hang on a ledge, or -1 if it falls / runs out of time. Ledges a rival hangs on can be taken by a ledge
 * trump (a grab, not a ledge snap or a tether); ones an ally or a climber holds are blocked.
 */
export function simulateRecovery(f: Fighter, world: World, l: Ledge, pol: RecPolicy, maxT = 110, landIn = 10, from?: Partial<Fighter>, log?: string[]): number {
  const { rig, g } = rigFor(world, f);
  const w = rig.w;
  simStats.calls++;
  for (let i = 0; i < w.ledges.length && i < world.ledges.length; i++) {
    const rl = world.ledges[i];
    const o = rl.occupant;
    const of = o >= 0 ? world.fighters[o] : null;
    let occ = o === -1 || o === f.id ? -1 : of && of.state === 'ledge' && !world.allied(f.id, o) ? 1 : BLOCKED;
    // a rival recovering right next to a free ledge may well take it first: plan as if it hangs there (a trump still works,
    // a ledge snap or a tether does not)
    if (occ === -1) {
      for (const r of world.fighters) {
        if (r === f || r.grounded || r.state === 'ko' || r.state === 'ledge' || world.allied(f.id, r.id)) continue;
        if (Math.abs(r.x - rl.x) < 90 && r.y > rl.y - 20 && r.y < rl.y + 160) occ = 1;
      }
    }
    w.ledges[i].occupant = occ;
  }
  rig.dummy.state = 'ledge';
  // moving platforms follow the tick: the private stage replays the same motion
  w.tick = world.tick;
  const res = g.res;
  g.spawn(f.x, f.y, f.facing);
  g.buffer.clear();
  // copy the state that decides the flight (fields set one by one: this runs many times a frame, so no temporary objects)
  g.vx = f.vx;
  g.vy = f.vy;
  g.jumpsLeft = f.jumpsLeft;
  g.airDodgeUsed = f.airDodgeUsed;
  g.helpless = f.helpless;
  g.fastFalling = f.fastFalling;
  g.glideFrames = f.glideFrames;
  g.jetFrames = f.jetFrames;
  g.wallJumps = f.wallJumps;
  g.grabCooldown = f.grabCooldown;
  g.coyote = f.coyote;
  g.wall = f.wall;
  g.damage = f.damage;
  g.invuln = 0;
  for (const k in res) if (!(k in f.res)) delete res[k];
  for (const k in f.res) res[k] = f.res[k];
  g.res = res;
  if (from) {
    const gg = g as unknown as Record<string, unknown>;
    const ff = from as unknown as Record<string, unknown>;
    for (const k in ff) gg[k] = ff[k];
  }
  let prev = 0;
  const b = w.blast;
  for (let t = 0; t < maxT; t++) {
    let held = 0;
    policyStick(g, l, pol, landIn, stk);
    let sx = stk.x;
    let sy = stk.y;
    if (g.state === 'air' && !g.helpless) {
      if (t === pol.attackAt) {
        held |= Button.Attack;
        sx = pol.ax ?? 0;
        sy = pol.ay ?? 0;
      } else if (t === pol.jumpAt) held |= Button.Jump;
      else if (t === pol.dodgeAt) {
        held |= Button.Shield;
        sx = -l.side * 0.7;
        sy = -0.7;
      } else if (t >= pol.specialAt && t < pol.specialAt + 2) {
        // Up selects the up special on the press (as the CPU presses it); the aimed direction is held once it runs
        held |= Button.Special;
        sx = pol.inX !== 0 ? -l.side * pol.inX : sx;
        sy = -1;
      } else if (pol.float && g.jumpsLeft === 0 && g.vy >= 0) held |= Button.Jump;
    }
    simIn.stickX = sx;
    simIn.stickY = sy;
    applyHeld(simIn, held, prev);
    prev = held;
    w.tick++;
    for (let i = 0; i < w.platforms.length; i++) w.platforms[i].update(w.tick);
    g.update(simIn, w);
    simStats.frames++;
    log?.push(`${t} ${g.state} ${g.move?.id}@${g.moveFrame} x${g.x.toFixed(0)} y${g.y.toFixed(0)} v${g.vx.toFixed(1)},${g.vy.toFixed(1)} in${sx.toFixed(1)},${sy.toFixed(1)} h${held}`);
    if (g.state === 'ledge' || g.state === 'ledgeClimb' || g.grounded) return t + 1;
    if (g.state === 'ko' || g.y - g.h > b.bottom || g.y > l.y + 300 || (g.helpless && g.y > l.y + 120)) return -1;
  }
  return -1;
}

/** Stick directions worth trying for this fighter's up special (inX toward the stage, sy). */
const DIRS_FIXED: [number, number][] = [[1, -1]];
const DIRS_TETHER: [number, number][] = [[1, -1], [0, -1]];
const DIRS_STICK: [number, number][] = [[1, -1], [0, -1], [1, 0], [1, 1]];
export function policyDirs(aim: 'stick8' | 'tether' | 'fixed'): readonly [number, number][] {
  return aim === 'fixed' ? DIRS_FIXED : aim === 'tether' ? DIRS_TETHER : DIRS_STICK;
}

export const NO_POLICY: RecPolicy = { jumpAt: -1, specialAt: -1, dodgeAt: -1, inX: 1, sy: -1, float: false };

/**
 * Can the fighter get back to `l` from the state described by `from` (a hypothetical spot: after a ledge drop, at the end of
 * an edge-guard leap's aerial)? Tries the double jump followed by the up special at a few timings.
 */
export function canGetBack(f: Fighter, world: World, l: Ledge, aim: 'stick8' | 'tether' | 'fixed', from: Partial<Fighter>, float: boolean, aerial?: { ax: number; ay: number; total: number }): boolean {
  const jumps = from.jumpsLeft ?? f.jumpsLeft;
  const pre = aerial ? aerial.total + 1 : 0;
  for (const [inX, sy] of policyDirs(aim)) {
    for (const s of jumps > 0 ? [10, 24, 40] : [0, 8]) {
      const pol: RecPolicy = { jumpAt: jumps > 0 ? pre + 2 : -1, specialAt: pre + s, dodgeAt: -1, inX, sy, float };
      if (aerial) Object.assign(pol, { attackAt: 0, ax: aerial.ax, ay: aerial.ay });
      if (simulateRecovery(f, world, l, pol, 130 + pre, 10, from) >= 0) return true;
    }
  }
  return false;
}
