/**
 * Target Smash course solver: proves a course can be cleared by a fighter in the real simulation.
 *
 * It does not search a whole run at once. Instead it builds the course's graph the way a player learns it:
 *  1. Which platforms can the fighter reach? From each platform it already reaches it jumps (or walks off) toward every
 *     other static platform with a simple steering policy (drift toward it, double jump at the top of the jump when still
 *     below it, up special when out of jumps) and keeps every platform it lands on.
 *  2. Can it break each target and live? From standing spots on reachable platforms it tries a short list of approaches
 *     (no jump / short hop / full hop, double jump or not) and attacks (aerials, tilts, specials), fired when the target
 *     comes within a trigger distance; after the target breaks it must land back on a static platform (same steering).
 *
 * Every step is a real `World` simulation with real inputs, so a target counts only if the fighter's own kit breaks it
 * and the fighter survives. Moving platforms take part in the world but are never a start or a landing goal.
 */
import { CHARACTERS } from '../../src/characters';
import { Button, makeInput, type FighterInput } from '../../src/engine/buttons';
import { Fighter } from '../../src/engine/fighter';
import type { StageData } from '../../src/engine/types';
import { World } from '../../src/engine/world';

type Plat = World['platforms'][number];

export interface TargetPlan {
  plat: number;
  x: number;
  jump: 0 | 1 | 2;
  dj: boolean;
  move: string;
  trig: number;
}

export interface CourseProof {
  /** Static platforms (indices into stage.platforms) the fighter can stand on. */
  reachable: number[];
  /** Per target: the plan that broke it and survived (null: none found). */
  plans: (TargetPlan | null)[];
  sims: number;
}

const MOVES = ['nair', 'uair', 'fair', 'dair', 'jab', 'utilt', 'ftilt', 'neutralB', 'sideB', 'upB', 'usmash', 'fsmash', 'downB'];

function isStatic(p: Plat): boolean {
  return !p.def.move;
}

function newWorld(stage: StageData, fighterId: string): { w: World; f: Fighter } {
  const w = new World(stage);
  w.config.smashFlick = false;
  const f = new Fighter(0, CHARACTERS[fighterId]);
  w.addFighter(f);
  f.invuln = 0;
  return { w, f };
}

/** Steering toward standing on `goal`: drift over it, double jump at the top of a jump while below it, up special last. */
function steer(f: Fighter, goal: Plat, inp: FighterInput, mem: { upB: boolean; djT: number }): void {
  const cx = goal.x + goal.w / 2;
  const half = goal.w / 2 - 6;
  const dx = cx - f.x;
  inp.stickX = Math.abs(dx) > Math.min(half, 10) ? Math.sign(dx) : 0;
  if (f.grounded) return;
  const below = f.y > goal.y - 2;
  const falling = f.vy >= 0;
  if (falling && (below || Math.abs(dx) > half + 30)) {
    if (f.jumpsLeft > 0 && mem.djT <= 0) {
      inp.pressed |= Button.Jump;
      inp.held |= Button.Jump;
      mem.djT = 12;
    } else if (!mem.upB && f.jumpsLeft <= 0 && (below || f.y > goal.y - 20)) {
      inp.pressed |= Button.Special;
      inp.held |= Button.Special;
      inp.stickY = -1;
      inp.stickX = Math.sign(dx) * 0.6;
      mem.upB = true;
    }
  }
  if (mem.djT > 0) {
    mem.djT--;
    inp.held |= Button.Jump;
  }
}

/** The static platform best to land on from here: the nearest top that is not far above. */
function homePlat(w: World, f: Fighter, among: number[]): Plat {
  let best = w.platforms[among[0]];
  let bd = Infinity;
  for (const i of among) {
    const p = w.platforms[i];
    const cx = Math.max(p.x + 6, Math.min(p.x + p.w - 6, f.x));
    const d = Math.abs(cx - f.x) + Math.max(0, f.y - p.y) * 0.3 + Math.max(0, p.y - f.y) * 0.1;
    if (d < bd) {
      bd = d;
      best = p;
    }
  }
  return best;
}

function landedOn(f: Fighter, w: World, among: number[]): number {
  if (!f.grounded || !f.groundPlat || f.state === 'ko') return -1;
  const i = w.platforms.indexOf(f.groundPlat);
  return among.includes(i) ? i : -1;
}

/** Fly from a spot on `from` to `to`; returns the static platform landed on (-1 none). */
function hop(stage: StageData, fighterId: string, from: number, x: number, to: number, jump: 0 | 1 | 2, statics: number[]): number {
  const { w, f } = newWorld(stage, fighterId);
  const p0 = w.platforms[from];
  f.standOn(p0, x);
  const goal = w.platforms[to];
  f.facing = goal.x + goal.w / 2 >= x ? 1 : -1;
  const inp = makeInput();
  const idle = makeInput();
  const mem = { upB: false, djT: 0 };
  let prev = 0;
  for (let t = 0; t < 360; t++) {
    inp.pressed = inp.held = inp.released = 0;
    inp.stickX = inp.stickY = 0;
    if (t < 3 && jump > 0) {
      if (t === 0) inp.pressed |= Button.Jump;
      inp.held |= Button.Jump;
    } else if (t < 14 && jump === 2) inp.held |= Button.Jump;
    if (t > 0 || jump === 0) steer(f, goal, inp, mem);
    inp.released = prev & ~inp.held;
    prev = inp.held;
    w.step([inp, idle]);
    if (f.state === 'ko') return -1;
    if (t > 6) {
      const l = landedOn(f, w, statics);
      if (l >= 0 && l !== from) return l;
      if (l === from && t > 40) return from;
    }
  }
  return -1;
}

function pressMove(move: string, f: Fighter, dx: number, dy: number, inp: FighterInput): void {
  const face = f.facing;
  const press = (b: number, sx: number, sy: number): void => {
    inp.pressed |= b;
    inp.held |= b;
    inp.stickX = sx;
    inp.stickY = sy;
  };
  switch (move) {
    case 'nair':
    case 'jab':
      return press(Button.Attack, 0, 0);
    case 'uair':
    case 'utilt':
      return press(Button.Attack, 0, -1);
    case 'dair':
      return press(Button.Attack, 0, 1);
    case 'fair':
    case 'ftilt':
      return press(Button.Attack, Math.sign(dx) || face, 0);
    case 'usmash':
      return press(Button.Smash, 0, -1);
    case 'fsmash':
      return press(Button.Smash, Math.sign(dx) || face, 0);
    case 'neutralB':
      return press(Button.Special, 0, 0);
    case 'sideB':
      return press(Button.Special, Math.sign(dx) || face, 0);
    case 'upB':
      return press(Button.Special, Math.abs(dx) > 20 ? Math.sign(dx) * 0.5 : 0, -1);
    case 'downB':
      return press(Button.Special, 0, 1);
    default:
      void dy;
  }
}

/** One attempt at target `ti`: true if it broke and the fighter landed safely afterwards. */
function attempt(stage: StageData, fighterId: string, plan: TargetPlan, ti: number, statics: number[]): boolean {
  const { w, f } = newWorld(stage, fighterId);
  const t0 = w.targets[ti];
  f.standOn(w.platforms[plan.plat], plan.x);
  f.facing = t0.x >= plan.x ? 1 : -1;
  const inp = makeInput();
  const idle = makeInput();
  const mem = { upB: false, djT: 0 };
  let prev = 0;
  let fired = -1;
  let broke = -1;
  let djDone = !plan.dj;
  for (let t = 0; t < 420; t++) {
    inp.pressed = inp.held = inp.released = 0;
    inp.stickX = inp.stickY = 0;
    const cy = f.y - f.h / 2;
    const dx = t0.x - f.x;
    const dy = t0.y - cy;
    if (broke < 0 && fired < 0) {
      // approach
      inp.stickX = Math.abs(dx) > 4 ? Math.sign(dx) : 0;
      if (plan.jump > 0 && t < 3) {
        if (t === 0) inp.pressed |= Button.Jump;
        inp.held |= Button.Jump;
      } else if (plan.jump === 2 && t < 14) inp.held |= Button.Jump;
      if (!djDone && !f.grounded && f.vy >= -0.5 && t > 4) {
        inp.pressed |= Button.Jump;
        inp.held |= Button.Jump;
        djDone = true;
      }
      const near = Math.hypot(dx, dy) <= plan.trig;
      const apex = !f.grounded && f.vy >= 0 && t > 4 && Math.abs(dx) < 40 && plan.trig >= 30;
      if ((near || apex || (plan.jump === 0 && t === 0 && plan.trig >= 99)) && f.state !== 'jumpsquat') {
        pressMove(plan.move, f, dx, dy, inp);
        fired = t;
      }
    } else if (broke < 0) {
      // the attack plays out (keep drifting toward the target a little)
      inp.stickX = Math.abs(dx) > 6 ? Math.sign(dx) * 0.5 : 0;
      if (t - fired > 70) return false;
    } else {
      steer(f, homePlat(w, f, statics), inp, mem);
    }
    inp.released = prev & ~inp.held;
    prev = inp.held;
    w.step([inp, idle]);
    if (f.state === 'ko') return false;
    if (broke < 0 && !t0.alive) broke = t;
    if (broke < 0 && fired < 0 && t > 200) return false;
    if (broke >= 0 && t > broke + 4 && landedOn(f, w, statics) >= 0) return true;
  }
  return false;
}

/** Proves `stage` for `fighterId` (see the file comment). `budget` caps the simulations per target. */
export function proveCourse(stage: StageData, fighterId: string, budget = 1500): CourseProof {
  const probe = new World(stage);
  const plats = probe.platforms;
  const statics = plats.map((p, i) => (isStatic(p) ? i : -1)).filter((i) => i >= 0);
  // the spawn platform: under the first spawn point
  const sp = stage.spawns[0];
  const start = statics.find((i) => sp.x >= plats[i].x && sp.x <= plats[i].x + plats[i].w && Math.abs(plats[i].y - sp.y) < 12) ?? statics[0];
  const reach = new Set<number>([start]);
  let sims = 0;
  // 1. reachability (breadth first)
  const queue = [start];
  while (queue.length) {
    const a = queue.shift()!;
    const pa = plats[a];
    for (const b of statics) {
      if (reach.has(b)) continue;
      const pb = plats[b];
      const edge = pb.x + pb.w / 2 >= pa.x + pa.w / 2 ? pa.x + pa.w - 8 : pa.x + 8;
      const mid = Math.max(pa.x + 8, Math.min(pa.x + pa.w - 8, pb.x + pb.w / 2));
      let got = -1;
      for (const x of [mid, edge])
        for (const j of [2, 1, 0] as const) {
          sims++;
          const l = hop(stage, fighterId, a, x, b, j, statics);
          if (l >= 0 && !reach.has(l)) {
            reach.add(l);
            queue.push(l);
          }
          if (l === b) {
            got = b;
            break;
          }
        }
      void got;
    }
  }
  const reachable = [...reach].sort((x, y) => x - y);
  // 2. every target
  const plans: (TargetPlan | null)[] = probe.targets.map((tg, ti) => {
    let n = 0;
    const order = [...reachable].sort((a, b) => dist(plats[a], tg) - dist(plats[b], tg));
    for (const pi of order.slice(0, 4)) {
      const p = plats[pi];
      const xs = [Math.max(p.x + 6, Math.min(p.x + p.w - 6, tg.x)), Math.max(p.x + 6, Math.min(p.x + p.w - 6, tg.x - 24)), Math.max(p.x + 6, Math.min(p.x + p.w - 6, tg.x + 24)), p.x + 10, p.x + p.w - 10];
      const xu = [...new Set(xs.map((v) => Math.round(v)))];
      for (const x of xu)
        for (const jump of [1, 2, 0] as const)
          for (const dj of [false, true]) {
            if (jump === 0 && dj) continue;
            for (const move of MOVES)
              for (const trig of [18, 30, 99]) {
                if (++n > budget) return null;
                sims++;
                const plan = { plat: pi, x, jump, dj, move, trig };
                if (attempt(stage, fighterId, plan, ti, reachable)) return plan;
              }
          }
    }
    return null;
  });
  return { reachable, plans, sims };
}

function dist(p: Plat, t: { x: number; y: number }): number {
  const cx = Math.max(p.x, Math.min(p.x + p.w, t.x));
  return Math.hypot(cx - t.x, p.y - t.y);
}
