import { moveTotal, type HitboxDef, type MoveDef } from '../engine/moves';
import type { CharacterData } from '../engine/types';
import type { CharacterAi } from './profiles';

/** What the CPU needs to know about one normal move, derived from its frame data. */
export interface AiMove {
  id: string;
  /** Position in the character's table (for per-move counters without string keys). */
  index: number;
  kind: 'jab' | 'tilt' | 'smash' | 'aerial' | 'grab' | 'dash' | 'special';
  startup: number;
  active: number;
  total: number;
  /** Damage of the strongest hitbox plus a share of the rest (multi-hit moves). */
  dmg: number;
  /** Strongest single hit (compared against an opponent's armor threshold). */
  maxHit: number;
  /** Launch strength proxy: base + scaling. */
  power: number;
  /** Union of hitboxes, forward-relative to the fighter's feet. */
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  charge: boolean;
  /** Reach comes (partly) from a projectile the move fires (Havoc's rocket / mortar), not only from hitboxes. */
  proj: boolean;
  /** Horizontal px the move's own motion carries the fighter (lunging smashes): see `travel`. */
  travel: number;
  /** Px of that travel already covered when the last hitbox ends (what extends the reach). */
  travelHit: number;
  /** The launching hit (strongest base + scaling at ~100%): base, scaling, angle, move weight, damage. Used to predict KOs. */
  kb: { base: number; scaling: number; angle: number; weight?: number; damage: number; away?: boolean } | null;
  /** Aerials: landing lag (frames) if it lands mid-move. */
  landingLag: number;
  /** Specials: the input slot (neutralB / sideB / upB / downB) and, for variant moves, the variant id this entry describes. */
  slot?: string;
  /** A command grab (a special whose hitbox grabs). */
  cmdGrab?: boolean;
  /** The move only works from the air (dives) / only on the ground. */
  air?: boolean;
}

/** The stick direction and button that start each normal. */
export interface MoveInput {
  /** -1 back, 0 neutral, 1 forward (relative to facing). */
  fwd: -1 | 0 | 1;
  up: -1 | 0 | 1;
  button: 'attack' | 'smash' | 'grab';
  /** Half-pressed stick (tilts): full deflection in the same frame would be read as a smash flick. */
  tilt?: boolean;
  /** Dash attack: only out of a run (Attack with the stick held forward once the dash flick has expired). */
  dash?: boolean;
}

export const NORMAL_INPUTS: Record<string, MoveInput> = {
  jab1: { fwd: 0, up: 0, button: 'attack' },
  ftilt: { fwd: 1, up: 0, button: 'attack', tilt: true },
  utilt: { fwd: 0, up: -1, button: 'attack', tilt: true },
  dtilt: { fwd: 0, up: 1, button: 'attack', tilt: true },
  fsmash: { fwd: 1, up: 0, button: 'smash' },
  usmash: { fwd: 0, up: -1, button: 'smash' },
  dsmash: { fwd: 0, up: 1, button: 'smash' },
  dashAttack: { fwd: 1, up: 0, button: 'attack', dash: true },
  nair: { fwd: 0, up: 0, button: 'attack' },
  fair: { fwd: 1, up: 0, button: 'attack' },
  bair: { fwd: -1, up: 0, button: 'attack' },
  uair: { fwd: 0, up: -1, button: 'attack' },
  dair: { fwd: 0, up: 1, button: 'attack' },
  grab: { fwd: 0, up: 0, button: 'grab' },
};

/** Frames of a projectile's flight the CPU counts as a normal's reach (later than that the target has moved anyway). */
const PROJ_FRAMES = 36;

/**
 * Horizontal distance (px, forward) a move's motion steps carry a grounded fighter (lunges like Vex's fsmash or a Shark
 * Lunge): each step sets the speed, which then bleeds off at `decel` px/frame (ground friction during attacks).
 */
export function travel(m: MoveDef | undefined, decel: number, upTo = Infinity): number {
  const mo = m?.motion;
  if (!m || !mo) return 0;
  const total = Math.min(upTo, moveTotal(m));
  let v = 0;
  let d = 0;
  for (let f = 1; f <= total; f++) {
    for (let i = 0; i < mo.length; i++) {
      const vx = mo[i].vx;
      if (mo[i].frame === f && vx !== undefined) v = mo[i].mode === 'add' ? v + vx : vx;
    }
    d += v;
    v = v > 0 ? Math.max(0, v - decel) : Math.min(0, v + decel);
  }
  return Math.max(0, d);
}

/** Ground friction during an attack (see Fighter.attackPhysics), for `travel`. */
export function attackDecel(data: CharacterData): number {
  return data.stats.groundFriction * 0.7;
}

const cache = new Map<string, AiMove[]>();

/** The hit that launches hardest at ~100% (what decides whether the move kills). */
function launcher(hbs: readonly HitboxDef[], best: AiMove['kb']): AiMove['kb'] {
  let out = best;
  for (const h of hbs) {
    if (h.damage <= 0 && !h.base) continue;
    if (!out || h.base + h.scaling * 100 > out.base + out.scaling * 100) out = { base: h.base, scaling: h.scaling, angle: h.angle, weight: h.weight, damage: h.damage, away: h.dir === 'away' };
  }
  return out;
}

/** Analyse one move (normal or special) into an AiMove; null if it cannot hit anything. */
function analyse(data: CharacterData, id: string, m: MoveDef, index: number, kind: AiMove['kind']): AiMove | null {
  const hbs = m.hitboxes.filter((h) => !h.throw);
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let best = 0;
  let rest = 0;
  let power = 0;
  let kb: AiMove['kb'] = null;
  // projectile normals (rocket launcher, mortar): their reach is the first stretch of the shot's flight path
  let proj = false;
  for (const ev of m.events ?? []) {
    if (ev.action !== 'projectile') continue;
    const pd = data.projectiles?.[ev.id];
    if (!pd) continue;
    proj = true;
    let px = ev.x;
    let py = ev.y;
    let vx = ev.vx;
    let vy = ev.vy;
    const r = pd.blast?.radius ?? 0;
    for (let t = 0; t < Math.min(pd.life, PROJ_FRAMES) && py < 4; t++) {
      minX = Math.min(minX, px - pd.w / 2 - r * 0.5);
      maxX = Math.max(maxX, px + pd.w / 2 + r * 0.5);
      minY = Math.min(minY, py - pd.h / 2 - r * 0.5);
      maxY = Math.max(maxY, py + pd.h / 2 + r * 0.5);
      vy = Math.min(pd.maxFall ?? Infinity, vy + (pd.gravity ?? 0));
      vx *= 1 - (pd.drag ?? 0);
      px += vx;
      py += vy;
    }
    const hit = pd.blast?.hit ?? pd.hit;
    kb = launcher([hit], kb);
    if (hit.damage > best) {
      rest += best * 0.4;
      best = hit.damage;
      power = hit.base + hit.scaling;
    }
  }
  if (hbs.length === 0 && !proj) return null;
  let lastEnd = m.startup;
  let cmdGrab = false;
  for (const h of hbs) {
    minX = Math.min(minX, h.x - h.w / 2);
    maxX = Math.max(maxX, h.x + h.w / 2);
    minY = Math.min(minY, h.y - h.h / 2);
    maxY = Math.max(maxY, h.y + h.h / 2);
    lastEnd = Math.max(lastEnd, m.startup + (h.window ? h.window[1] : m.active));
    if (h.grab) cmdGrab = true;
    if (h.damage > best) {
      rest += best * 0.4;
      best = h.damage;
      power = h.base + h.scaling;
    } else rest += h.damage * 0.4;
  }
  kb = launcher(hbs, kb);
  // jab strings: count the follow-up hits (the CPU keeps pressing while they connect)
  let chainDmg = 0;
  let chainFrames = 0;
  for (let nx = m.next ? data.moves[m.next.id] : undefined, n = 0; nx && n < 4; nx = nx.next ? data.moves[nx.next.id] : undefined, n++) {
    chainDmg += Math.max(0, ...nx.hitboxes.map((h) => h.damage)) * 0.7;
    chainFrames += nx.next ? nx.next.at : moveTotal(nx);
  }
  // a command grab's slam (`thenMove`) is where its damage and launch come from
  if (cmdGrab) {
    const then = hbs.find((h) => h.thenMove)?.thenMove;
    const tm = then ? data.moves[then] : undefined;
    if (tm) {
      for (const h of tm.hitboxes) best = Math.max(best, h.damage);
      kb = launcher(tm.hitboxes, kb);
    }
  }
  const decel = attackDecel(data);
  return {
    id,
    index,
    kind,
    startup: m.startup,
    active: m.active,
    total: moveTotal(m) + chainFrames * 0.5,
    dmg: best + rest + chainDmg,
    maxHit: best,
    power,
    minX,
    maxX,
    minY,
    maxY,
    charge: !!m.charge,
    proj,
    travel: travel(m, decel),
    travelHit: travel(m, decel, lastEnd),
    kb,
    landingLag: m.landingLag ?? 0,
    cmdGrab,
  };
}

/** Analyse a character's normals (and dash attack) once. */
export function moveTable(data: CharacterData): AiMove[] {
  const hit = cache.get(data.id);
  if (hit) return hit;
  const out: AiMove[] = [];
  for (const id of Object.keys(NORMAL_INPUTS)) {
    const m = data.moves[id];
    if (!m || m.hidden) continue;
    const kind: AiMove['kind'] = m.kind === 'grab' ? 'grab' : m.kind === 'dashAttack' ? 'dash' : (m.kind as AiMove['kind']);
    const a = analyse(data, id, m, out.length, kind);
    if (a) out.push(a);
  }
  cache.set(data.id, out);
  return out;
}

const specialCache = new Map<string, AiMove[]>();

/**
 * Close-range specials the profile names (command grab, resource spender, dive), one entry per variant (Agni's Flare
 * Burst has one per flame level: pick the one `Fighter.resolveVariant` names). Indices continue after the normals.
 */
export function specialTable(data: CharacterData, ai: CharacterAi): AiMove[] {
  const hit = specialCache.get(data.id);
  if (hit) return hit;
  const out: AiMove[] = [];
  const base = moveTable(data).length;
  const slots: [string, boolean | undefined][] = [];
  if (ai.commandGrab) slots.push([ai.commandGrab, undefined]);
  if (ai.spender) slots.push([ai.spender.slot, undefined]);
  if (ai.dive) slots.push([ai.dive, true]);
  for (const [slot, air] of slots) {
    const ids = data.moves[slot] ? [slot] : Object.keys(data.moves).filter((k) => k.startsWith(`${slot}_`));
    for (const id of ids) {
      const a = analyse(data, id, data.moves[id], base + out.length, 'special');
      if (!a) continue;
      a.slot = slot;
      a.air = air;
      out.push(a);
    }
  }
  specialCache.set(data.id, out);
  return out;
}
