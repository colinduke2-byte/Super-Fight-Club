import type { Fighter } from '../engine/fighter';
import type { CharacterFx, FxColor, FxNum, FxOp, FxPos, FxRule, FxWhen } from '../engine/fxTypes';
import type { World } from '../engine/world';
import type { Effects } from '../ui/Effects';
import { ALWAYS_RULES, DEFAULT_RULES, LIBRARY_RECIPES } from './library';

/** What a recipe needs to play: the particle pool, camera shake / punch callbacks and the fighter it belongs to. */
export interface FxContext {
  fx: Effects;
  shake: (amount: number) => void;
  punch?: (amount: number) => void;
  f: Fighter;
  tick: number;
  /** Anchor override (world position of the event); default = the fighter's feet. */
  x?: number;
  y?: number;
  /** Event data: `mag` (e.g. facing / magnitude) and `extra` (e.g. damage). */
  mag?: number;
  extra?: number;
}

function hex(s: string): number {
  return parseInt(s.slice(1), 16);
}

/** Read a number source for the fighter. */
function source(from: string, c: FxContext, n: Exclude<FxNum, number>): number {
  if (from.startsWith('res:')) return c.f.res[from.slice(4)] ?? 0;
  switch (from) {
    case 'charge':
      return c.f.chargeFrac;
    case 'speed':
      return Math.abs(c.f.vx);
    case 'extra':
      return c.extra ?? 0;
    case 'mag':
      return c.mag ?? 0;
    case 'sin':
      return Math.sin(c.tick * (n.freq ?? 0.2) + (n.phase ?? 0));
    case 'cos':
      return Math.cos(c.tick * (n.freq ?? 0.2) + (n.phase ?? 0));
    default:
      return 0;
  }
}

export function num(n: FxNum | undefined, c: FxContext, dflt = 0): number {
  if (n === undefined) return dflt;
  if (typeof n === 'number') return n;
  let v = source(n.from, c, n) * (n.mul ?? 1) + (n.add ?? 0);
  if (n.min !== undefined) v = Math.max(n.min, v);
  if (n.max !== undefined) v = Math.min(n.max, v);
  return v;
}

/** Resolve a colour to 0xRRGGBB. */
export function color(col: FxColor | undefined, c: FxContext): number {
  if (col === undefined) return 0xffffff;
  if (typeof col === 'number') return col;
  if (typeof col === 'string') {
    if (col === '@accent') return hex(c.f.data.sprite.placeholder.accent);
    if (col === '@trail') return fighterTrailColor(c.f, c.tick);
    return hex(col);
  }
  const idx = Math.max(0, Math.min(col.colors.length - 1, Math.round(source(col.from, c, { from: col.from }))));
  const v = col.colors[idx];
  return typeof v === 'number' ? v : color(v, c);
}

/** Colour of a fighter's slash arcs / trails. */
export function fighterTrailColor(f: Fighter, tick = 0): number {
  const t = f.data.fx?.trail;
  if (t === undefined || t === '@trail') return hex(f.data.sprite.placeholder.accent);
  return color(t, { fx: null as unknown as Effects, shake: () => {}, f, tick });
}

function pos(p: FxPos | undefined, c: FxContext, out: { x: number; y: number }): void {
  const f = c.f;
  const ax = c.x ?? f.x;
  const ay = c.y ?? f.y;
  const dir = f.facing;
  out.x = ax + dir * num(p?.x, c) + ((p?.jx ?? 0) ? (Math.random() - 0.5) * (p!.jx as number) : 0);
  out.y = ay + num(p?.y, c) - (p?.yh ?? 0) * f.h * f.sizeMul + ((p?.jy ?? 0) ? (Math.random() - 0.5) * (p!.jy as number) : 0);
}

const P = { x: 0, y: 0 };
const Q = { x: 0, y: 0 };

export function runOps(ops: readonly FxOp[], c: FxContext): void {
  const e = c.fx;
  const f = c.f;
  for (const o of ops) {
    switch (o.op) {
      case 'burst':
        pos(o, c, P);
        e.burst(P.x, P.y, num(o.count, c), num(o.speed, c), color(o.color, c), o.life ?? 0.35, o.size ?? 2);
        break;
      case 'ring':
        pos(o, c, P);
        e.ring(P.x, P.y, num(o.radius, c), color(o.color, c), o.life ?? 0.35);
        break;
      case 'flash':
        pos(o, c, P);
        e.flash(P.x, P.y, num(o.power, c), color(o.color, c));
        break;
      case 'dust':
        pos(o, c, P);
        e.dust(P.x, P.y, num(o.count, c), (o.dir ?? 0) * f.facing);
        break;
      case 'emit': {
        pos(o, c, P);
        const jvx = o.jvx ?? 0;
        const jvy = o.jvy ?? 0;
        e.emit(
          P.x,
          P.y,
          f.facing * num(o.vx, c) + (jvx ? (Math.random() - 0.5) * jvx : 0),
          num(o.vy, c) + (jvy ? (Math.random() - 0.5) * jvy : 0),
          o.life,
          color(o.color, c),
          o.size ?? 2,
          o.gravity ?? 0,
          o.additive ?? true,
        );
        break;
      }
      case 'trail': {
        pos(o, c, P);
        pos(o.to, c, Q);
        if (o.random) {
          const a = Math.random() * Math.PI;
          const mx = (P.x + Q.x) / 2;
          const my = (P.y + Q.y) / 2;
          const hl = Math.hypot(Q.x - P.x, Q.y - P.y) / 2;
          e.trail(mx - Math.cos(a) * hl, my - Math.sin(a) * hl, mx + Math.cos(a) * hl, my + Math.sin(a) * hl, color(o.color, c));
        } else e.trail(P.x, P.y, Q.x, Q.y, color(o.color, c));
        break;
      }
      case 'converge': {
        const cx = c.x ?? f.x;
        const cy = (c.y ?? f.y) - f.h * f.sizeMul * 0.5;
        const a = Math.random() * Math.PI * 2;
        const r = o.radius[0] + Math.random() * (o.radius[1] - o.radius[0]);
        const px = cx + Math.cos(a) * r;
        const py = cy + Math.sin(a) * r;
        const sw = o.swirl ?? 0;
        e.emit(px, py, (cx - px) * o.pull - Math.sin(a) * sw, (cy - py) * o.pull + Math.cos(a) * sw, o.life, color(o.color, c), o.size ?? 2, 0, o.additive ?? true);
        break;
      }
      case 'shake':
        c.shake(num(o.amount, c));
        break;
      case 'punch':
        c.punch?.(num(o.amount, c));
        break;
    }
  }
}

/** Play the named recipe for a fighter (its own recipes first, then the shared library). Returns false if nothing matched. */
export function playRecipe(name: string, c: FxContext): boolean {
  const ops = c.f.data.fx?.recipes?.[name] ?? LIBRARY_RECIPES[name];
  if (!ops) return false;
  runOps(ops, c);
  return true;
}

function whenOk(w: FxWhen | undefined, f: Fighter): boolean {
  if (!w) return f.hitlag === 0;
  if (f.hitlag > 0 && !w.hitlag) return false;
  if (w.states && !w.states.includes(f.state)) return false;
  if (w.charging !== undefined && (f.state === 'attack' && f.chargeFrames > 0) !== w.charging) return false;
  const m = f.move;
  if (w.kinds || w.moves || w.phase || w.frames) {
    if (f.state !== 'attack' || !m) return false;
    if (w.kinds && !w.kinds.includes(m.kind)) return false;
    if (w.moves && !w.moves.includes(m.id) && !w.moves.some((id) => m.id.startsWith(`${id}_`))) return false;
    if (w.frames && (f.moveFrame < w.frames[0] || f.moveFrame > w.frames[1])) return false;
    if (w.phase) {
      const live = f.moveFrame > m.startup && f.moveFrame <= m.startup + m.active;
      if (w.phase === 'startup' && f.moveFrame > m.startup) return false;
      if (w.phase === 'active' && !live) return false;
      if (w.phase === 'recovery' && f.moveFrame <= m.startup + m.active) return false;
    }
  }
  if (w.chargeMin !== undefined && f.chargeFrac < w.chargeMin) return false;
  if (w.minSpeed !== undefined && Math.abs(f.vx) < w.minSpeed) return false;
  if (w.res) {
    const v = f.res[w.res.key] ?? 0;
    if (w.res.min !== undefined && v < w.res.min) return false;
    if (w.res.max !== undefined && v > w.res.max) return false;
  }
  return true;
}

function hasChargeRule(fx: CharacterFx | undefined): boolean {
  return !!fx?.rules?.some((r) => r.when?.charging === true);
}

/** Per-tick auras, trails and charge effects for every fighter (once per sim tick; purely visual). */
export function updateFighterFx(world: World, fx: Effects, tick: number, shake: (n: number) => void): void {
  for (const f of world.fighters) {
    if (f.state === 'ko') continue;
    const c: FxContext = { fx, shake, f, tick };
    const rules: readonly FxRule[] = f.data.fx?.rules ?? [];
    for (const r of rules) {
      if (!whenOk(r.when, f)) continue;
      const every = Math.max(1, Math.round(num(r.every, c, 1)));
      if (tick % every !== 0) continue;
      runOps(r.ops, c);
    }
    for (const r of ALWAYS_RULES) {
      if (!whenOk(r.when, f)) continue;
      if (tick % Math.max(1, Math.round(num(r.every, c, 1))) !== 0) continue;
      runOps(r.ops, c);
    }
    if (!hasChargeRule(f.data.fx)) {
      for (const r of DEFAULT_RULES) {
        if (!whenOk(r.when, f)) continue;
        if (tick % Math.max(1, Math.round(num(r.every, c, 1))) !== 0) continue;
        runOps(r.ops, c);
      }
    }
  }
}
