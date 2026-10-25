import type { Fighter } from '../engine/fighter';
import type { CharacterFx, FxColor, FxNum, FxOp, FxPos, FxRule, FxWhen } from '../engine/fxTypes';
import type { MoveDef } from '../engine/moves';
import type { World } from '../engine/world';
import type { Effects } from '../ui/Effects';
import { BASIC_KINDS, basicOf, makeSwing, swingOf, swingVisible, validateBasic, type BasicEmitter, type BasicFx, type Swing } from './basicFx';
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

/** '#rrggbb' -> 0xRRGGBB, memoised (colours are resolved every frame; slicing a new string each time is garbage). */
const HEX = new Map<string, number>();
function hex(s: string): number {
  let v = HEX.get(s);
  if (v === undefined) {
    v = parseInt(s.slice(1), 16);
    HEX.set(s, v);
  }
  return v;
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
const TRAIL_CTX: FxContext = { fx: null as unknown as Effects, shake: () => {}, f: null as unknown as Fighter, tick: 0 };
export function fighterTrailColor(f: Fighter, tick = 0): number {
  const t = f.data.fx?.trail;
  if (t === undefined || t === '@trail') return hex(f.data.sprite.placeholder.accent);
  if (typeof t === 'number') return t;
  // (one reused context: this runs for every trail, smear and spark every frame)
  TRAIL_CTX.f = f;
  TRAIL_CTX.tick = tick;
  return color(t, TRAIL_CTX);
}

/** Resolve any fx colour for a fighter without allocating (one reused context). */
export function fighterColor(f: Fighter, col: FxColor, tick = 0): number {
  TRAIL_CTX.f = f;
  TRAIL_CTX.tick = tick;
  return color(col, TRAIL_CTX);
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

/** `id` is in the list, or is a listed id's variant (`<listed>_<suffix>`): no closures or template strings (runs every tick). */
function idListed(list: readonly string[], id: string): boolean {
  for (let i = 0; i < list.length; i++) {
    const l = list[i];
    if (id === l || (id.length > l.length && id.charCodeAt(l.length) === 95 /* _ */ && id.startsWith(l))) return true;
  }
  return false;
}

function whenOk(w: FxWhen | undefined, f: Fighter): boolean {
  if (!w) return f.hitlag === 0;
  if (f.hitlag > 0 && !w.hitlag) return false;
  if (w.states && !w.states.includes(f.state)) return false;
  if (w.charging !== undefined && (f.state === 'attack' && f.chargeFrames > 0) !== w.charging) return false;
  if (w.jetting !== undefined && f.jetting !== w.jetting) return false;
  const m = f.move;
  if (w.kinds || w.moves || w.phase || w.frames) {
    if (f.state !== 'attack' || !m) return false;
    if (w.kinds && !w.kinds.includes(m.kind)) return false;
    if (w.moves && !idListed(w.moves, m.id)) return false;
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
/** One context reused for every fighter's per-tick rules (no allocation per fighter per tick). */
const RULE_CTX: FxContext = { fx: null as unknown as Effects, shake: () => {}, f: null as unknown as Fighter, tick: 0 };

export function updateFighterFx(world: World, fx: Effects, tick: number, shake: (n: number) => void): void {
  updateBasicFx(world, fx, tick);
  for (const f of world.fighters) {
    if (f.state === 'ko') continue;
    const c = RULE_CTX;
    c.fx = fx;
    c.shake = shake;
    c.f = f;
    c.tick = tick;
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

// ---------------------------------------------------------------------------------------------
// Basic moves (jabs, tilts, smashes, dash attacks, aerials): character touches, charge sparks gathering at the striking limb,
// the flash on release, surface dust under ground moves and dash-attack speed lines. See fx/basicFx for the `basic` data.
// ---------------------------------------------------------------------------------------------
const SLOTS = 8;
const SW: Swing = makeSwing();
const B_CTX: FxContext = { fx: null as unknown as Effects, shake: () => {}, f: null as unknown as Fighter, tick: 0 };
let basicWorld: World | null = null;
const bMove: (MoveDef | null)[] = new Array(SLOTS).fill(null);
const bStarted = new Uint8Array(SLOTS);
const bHeld = new Uint8Array(SLOTS);
const bHeldFrac = new Float32Array(SLOTS);
const bLimbX = new Float32Array(SLOTS);
const bLimbY = new Float32Array(SLOTS);
const checked = new WeakSet<object>();
/** Fractional particle budget carried between ticks (density below 1 thins emitters without rounding them away). */
let budget = 0;

function basicFor(f: Fighter): BasicFx | undefined {
  const b = basicOf(f);
  if (b && !checked.has(b)) {
    validateBasic(f.data.id, b);
    checked.add(b);
  }
  return b;
}

function passes(e: BasicEmitter, m: MoveDef, s: Swing | null): boolean {
  if (e.kinds && !e.kinds.includes(m.kind)) return false;
  if (e.moves && !idListed(e.moves, m.id)) return false;
  if (e.limbs && (!s || !e.limbs.includes(s.look.limb))) return false;
  return true;
}

/** Run one emitter at the swing `s` (or, with no swing, around the body / at the limb point). */
function fire(e: BasicEmitter, f: Fighter, s: Swing | null, fx: Effects, tick: number, lx: number, ly: number): void {
  const c = B_CTX;
  c.fx = fx;
  c.f = f;
  c.tick = tick;
  const sm = f.sizeMul;
  let x: number;
  let y: number;
  switch (e.at ?? 'head') {
    case 'tail':
      x = s ? s.tx : f.x;
      y = s ? s.ty : f.y - f.h * sm * 0.5;
      break;
    case 'feet':
      x = f.x;
      y = f.y;
      break;
    case 'body':
      x = f.x;
      y = f.y - f.h * sm * 0.5;
      break;
    case 'back':
      x = f.x - f.facing * f.hw * sm;
      y = f.y - f.h * sm * 0.55;
      break;
    case 'limb':
      x = lx;
      y = ly;
      break;
    default:
      x = s ? s.hx : lx;
      y = s ? s.hy : ly;
  }
  const n0 = (e.count ?? 1) * fx.density;
  budget += n0;
  let n = Math.floor(budget);
  budget -= n;
  if (e.p === 'spark' || e.p === 'flash' || e.p === 'ring') n = n0 > 0 ? 1 : 0;
  const speed = e.speed ?? 30;
  const jit = e.jitter ?? 0;
  const spread = e.spread ?? 0;
  const cols = e.color;
  for (let i = 0; i < n; i++) {
    let dx = 0;
    let dy = 0;
    switch (e.dir ?? 'out') {
      case 'up':
        dy = -1;
        break;
      case 'back':
        dx = -f.facing;
        break;
      case 'swing':
        if (s) {
          dx = -s.ny;
          dy = s.nx;
          if (s.head < s.tail) {
            dx = -dx;
            dy = -dy;
          }
        }
        break;
      case 'random': {
        const a = Math.random() * Math.PI * 2;
        dx = Math.cos(a);
        dy = Math.sin(a);
        break;
      }
      default:
        dx = s ? s.nx : f.facing;
        dy = s ? s.ny : 0;
    }
    const vx = dx * speed + (jit ? (Math.random() - 0.5) * jit : 0);
    const vy = dy * speed + (jit ? (Math.random() - 0.5) * jit : 0);
    const px = x + (spread ? (Math.random() - 0.5) * spread : 0);
    const py = y + (spread ? (Math.random() - 0.5) * spread : 0);
    const col = color(Array.isArray(cols) ? cols[(tick + i) % cols.length] : cols, c);
    const life = e.life ?? 0.35;
    const size = e.size ?? 2;
    const grav = e.gravity ?? 0;
    const add = e.additive ?? true;
    switch (e.p) {
      case 'mote':
        fx.emit(px, py, vx, vy, life, col, size, grav, add);
        break;
      case 'spark':
        fx.burst(px, py, e.count ?? 3, speed, col, life, size);
        break;
      case 'line':
        fx.trail(px, py, px + vx * 0.12, py + vy * 0.12, col);
        break;
      case 'flash':
        fx.flash(px, py, size, col);
        break;
      case 'ring':
        fx.ring(px, py, size, col, life);
        break;
      default: {
        const sp = e.spin ?? 0;
        fx.shaped(px, py, vx, vy, life * (0.8 + Math.random() * 0.4), col, `fx-p-${e.p}`, size, grav, sp ? sp * (Math.random() < 0.5 ? -1 : 1) * (0.6 + Math.random() * 0.8) : 0, add, Math.random() * Math.PI * 2);
      }
    }
  }
}

function fireAll(b: BasicFx | undefined, on: string, f: Fighter, m: MoveDef, s: Swing | null, fx: Effects, tick: number, lx: number, ly: number): void {
  const list = b?.emitters;
  if (!list) return;
  for (const e of list) {
    if ((e.on ?? 'active') !== on) continue;
    if ((on === 'active' || on === 'charge') && tick % Math.max(1, e.every ?? 1) !== 0) continue;
    if (!passes(e, m, s)) continue;
    fire(e, f, s, fx, tick, lx, ly);
  }
}

const DUST_COUNT: Record<string, number> = { jab: 2, tilt: 3, dashAttack: 4, smash: 6 };

/** Per-tick basic-move effects for every fighter (once per sim tick; purely visual). */
export function updateBasicFx(world: World, fx: Effects, tick: number): void {
  if (world !== basicWorld) {
    basicWorld = world;
    bMove.fill(null);
    bHeld.fill(0);
    bStarted.fill(0);
  }
  for (const f of world.fighters) {
    const slot = f.id % SLOTS;
    const m = f.move;
    if (f.state !== 'attack' || !m || !BASIC_KINDS.has(m.kind)) {
      bMove[slot] = null;
      bHeld[slot] = 0;
      continue;
    }
    if (m !== bMove[slot]) {
      bMove[slot] = m;
      bStarted[slot] = 0;
      bHeld[slot] = 0;
    }
    const b = basicFor(f);
    // the swing on show this tick (first visible hitbox), and the striking limb / weapon point
    let s: Swing | null = null;
    let first: (typeof m.hitboxes)[number] | null = null;
    for (const hb of m.hitboxes) {
      if (hb.grab || hb.throw) continue;
      if (!first) first = hb;
      if (swingVisible(f, m, hb)) {
        s = swingOf(f, m, hb, SW);
        break;
      }
    }
    if (!first) continue;
    if (!s && m.charge) swingOf(f, m, first, SW);
    const lx = s ? s.hx : SW.rect[0] + SW.rect[2] / 2;
    const ly = s ? s.hy : SW.rect[1] + SW.rect[3] / 2;
    const held = !!m.charge && f.chargeFrames > 0 && f.moveFrame === m.charge.frame;
    if (held) {
      bLimbX[slot] = lx;
      bLimbY[slot] = ly;
      bHeldFrac[slot] = f.chargeFrac;
      if (f.hitlag === 0) chargeSparks(f, fx, tick, lx, ly, f.chargeFrac);
      fireAll(b, 'charge', f, m, s, fx, tick, lx, ly);
    } else if (bHeld[slot]) {
      // released: a flash at the striking limb, as bright as the charge was long
      const k = bHeldFrac[slot];
      const hot = fighterTrailColor(f, tick);
      fx.flash(bLimbX[slot], bLimbY[slot], 0.8 + 1.4 * k, hot);
      fx.ring(bLimbX[slot], bLimbY[slot], 10 + 16 * k, 0xffffff, 0.22);
      fireAll(b, 'release', f, m, s, fx, tick, bLimbX[slot], bLimbY[slot]);
    }
    bHeld[slot] = held ? 1 : 0;
    if (f.hitlag > 0 || !s) continue;
    if (s.live && !bStarted[slot]) {
      bStarted[slot] = 1;
      if (f.grounded && b?.dust !== false && m.kind !== 'aerial') {
        // ground moves kick up dust coloured by the floor underfoot (both ways for a down-smash)
        const n = DUST_COUNT[m.kind] ?? 2;
        if (s.look.shape === 'split') {
          fx.dust(f.x - 14, f.y, n, -1);
          fx.dust(f.x + 14, f.y, n, 1);
        } else fx.dust(f.x + f.facing * 6, f.y, n, m.kind === 'dashAttack' ? -f.facing : f.facing);
      }
      fireAll(b, 'start', f, m, s, fx, tick, lx, ly);
    }
    if (s.live) {
      fireAll(b, 'active', f, m, s, fx, tick, lx, ly);
      if (m.kind === 'dashAttack' && tick % 2 === 0) {
        // dash attacks leave speed lines behind them
        const yy = f.y - f.h * f.sizeMul * (0.2 + 0.6 * ((tick * 0.37) % 1));
        fx.trail(f.x - f.facing * 10, yy, f.x - f.facing * (30 + (tick % 3) * 6), yy, fighterTrailColor(f, tick));
      }
    }
  }
}

/** Sparks drawn in to the striking limb while a smash charges: more, faster and hotter as the charge builds. */
function chargeSparks(f: Fighter, fx: Effects, tick: number, lx: number, ly: number, k: number): void {
  const n0 = (1 + k * 2) * fx.density;
  budget += n0;
  let n = Math.floor(budget);
  budget -= n;
  const col = fighterTrailColor(f, tick);
  for (; n > 0; n--) {
    const a = Math.random() * Math.PI * 2;
    const r = 12 + Math.random() * 10;
    const px = lx + Math.cos(a) * r;
    const py = ly + Math.sin(a) * r;
    const pull = 4.2 + k * 2;
    fx.emit(px, py, (lx - px) * pull, (ly - py) * pull, 0.2, (tick + n) % 3 === 0 ? 0xffffff : col, 2, 0, true);
  }
  if (k >= 1 && tick % 4 === 0) fx.flash(lx, ly, 0.45, col);
}

/** A landed hit's character touch (emitters with `on: 'hit'`), at the hit point. */
export function basicHitFx(attacker: Fighter, fx: Effects, tick: number, x: number, y: number): void {
  const m = attacker.move;
  if (attacker.state !== 'attack' || !m || !BASIC_KINDS.has(m.kind)) return;
  const b = basicFor(attacker);
  if (!b?.emitters) return;
  fireAll(b, 'hit', attacker, m, null, fx, tick, x, y);
}
