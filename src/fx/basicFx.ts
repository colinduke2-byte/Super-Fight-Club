import type { Fighter } from '../engine/fighter';
import type { FxColor } from '../engine/fxTypes';
import { hitboxEnd, hitboxStart, type HitboxDef, type MoveDef } from '../engine/moves';
import { hitboxActive, hitboxRect } from '../engine/combat';

/**
 * Presentation of the basic moves (jabs, tilts, smashes, dash attacks, aerials): which trail shape a move draws, which limb or
 * weapon strikes, and the per-character touches (`basic` in `<id>.fx.json`). Pure data and geometry, no Phaser: the trail is
 * drawn by ui/SlashArcs (with ui/MoveFx), the particles by fx/runner. Nothing here feeds back into the simulation.
 *
 * `basic` fields (all optional):
 *  - weapon: 'spear' | 'anchor' | 'blade' | 'stock' | 'claw'   what the weapon moves swing (its own trail look)
 *  - weaponMoves: move ids (or id prefixes before `_`) that swing the weapon; default: every slash / overhead / custom pose
 *  - shapes: { [move id or kind]: TrailShape }                 per-move trail override
 *  - emitters: BasicEmitter[]                                   character touches (particles), see below
 *  - impact: { colors?: FxColor[]; p?: ParticleLook }           tint / look of the sparks and debris this fighter's hits throw
 *  - ghosts: 0..2                                               aerial after-images per aerial (default 2)
 *  - crack: boolean                                             down-smash floor crack (default true)
 *  - dust: boolean                                              ground moves kick up surface dust (default true)
 *  - afterglow: FxColor                                         a tinted after-image left where a basic move starts
 *  - ribbon: boolean                                            flame ribbons trailing curved swings
 *  - trail2: FxColor                                            two-tone trails: the core colour (default white) under fx.trail
 */
export type TrailShape = 'streak' | 'thrust' | 'sweep' | 'fan' | 'split' | 'ring' | 'spike' | 'arc' | 'lunge' | 'none';
export const TRAIL_SHAPES: readonly TrailShape[] = ['streak', 'thrust', 'sweep', 'fan', 'split', 'ring', 'spike', 'arc', 'lunge', 'none'];
export type Weapon = 'spear' | 'anchor' | 'blade' | 'stock' | 'claw';
export const WEAPONS: readonly Weapon[] = ['spear', 'anchor', 'blade', 'stock', 'claw'];
export type Limb = 'fist' | 'foot' | 'weapon' | 'body';
/** Particle looks: plain motes / spark streaks, or a shaped sprite (see art/entityTextures 'fx-p-*'). */
export type ParticleLook = 'mote' | 'spark' | 'line' | 'ember' | 'crystal' | 'shard' | 'drop' | 'casing' | 'feather' | 'glyph' | 'bolt' | 'wisp' | 'debris' | 'flash' | 'ring';
export const PARTICLE_LOOKS: readonly ParticleLook[] = ['mote', 'spark', 'line', 'ember', 'crystal', 'shard', 'drop', 'casing', 'feather', 'glyph', 'bolt', 'wisp', 'debris', 'flash', 'ring'];

export interface BasicEmitter {
  p: ParticleLook;
  /** Where: the trail's head (default), its tail, the striking fist / foot / weapon tip, the feet, the body centre, behind. */
  at?: 'head' | 'tail' | 'limb' | 'feet' | 'body' | 'back';
  /** When: every active frame (default), the first active frame, while a smash charges, on its release, or on a hit landed. */
  on?: 'active' | 'start' | 'charge' | 'release' | 'hit';
  every?: number;
  count?: number;
  /** Launch speed (world units / s) along `dir`. */
  speed?: number;
  /** out: away from the trail (default); up; back: behind the fighter; swing: along the swing; random. */
  dir?: 'out' | 'up' | 'back' | 'swing' | 'random';
  /** Random velocity added (+-/2) and position scatter (+-/2). */
  jitter?: number;
  spread?: number;
  life?: number;
  size?: number;
  gravity?: number;
  /** Spin (radians / s) for shaped particles. */
  spin?: number;
  /** One colour or a list cycled per particle ('@trail' follows the current element / trail colour). */
  color: FxColor | FxColor[];
  additive?: boolean;
  /** Filters. */
  kinds?: string[];
  moves?: string[];
  limbs?: Limb[];
}

export interface BasicFx {
  weapon?: Weapon;
  weaponMoves?: string[];
  shapes?: Record<string, TrailShape>;
  emitters?: BasicEmitter[];
  impact?: { colors?: FxColor[]; p?: ParticleLook };
  ghosts?: number;
  crack?: boolean;
  dust?: boolean;
  afterglow?: FxColor;
  ribbon?: boolean;
  trail2?: FxColor;
}

export const BASIC_KINDS = new Set(['jab', 'tilt', 'smash', 'aerial', 'dashAttack']);

export function basicOf(f: Fighter): BasicFx | undefined {
  return (f.data.fx as { basic?: BasicFx } | undefined)?.basic;
}

function idMatch(list: readonly string[] | undefined, id: string): boolean {
  if (!list) return false;
  for (const s of list) if (id === s || id.startsWith(`${s}_`)) return true;
  return false;
}

/** How a move is drawn (cached per move: the move objects are per character and never change). */
export interface MoveLook {
  /** A basic move (the shapes); otherwise the plain crescent / streak / ring specials always had. */
  basic: boolean;
  shape: TrailShape;
  limb: Limb;
  weapon: Weapon | null;
}
const LOOKS = new WeakMap<MoveDef, MoveLook>();

/** The striking limb, from the move's key-pose template (or the character's weapon list). */
export function limbOf(m: MoveDef, b: BasicFx | undefined): Limb {
  if (b?.weapon && b.weaponMoves && idMatch(b.weaponMoves, m.id)) return 'weapon';
  const t = m.pose?.t ?? '';
  switch (t) {
    case 'kick':
    case 'sweep':
    case 'stomp':
      return 'foot';
    case 'punch':
    case 'hook':
    case 'uppercut':
    case 'elbow':
      return 'fist';
    case 'thrust':
    case 'slash':
    case 'overhead':
      return b?.weapon && !b.weaponMoves ? 'weapon' : 'fist';
    case 'spin':
    case 'slam':
      return 'body';
    default:
      return b?.weapon && !b.weaponMoves ? 'weapon' : limbFromKeys(m);
  }
}

/**
 * Hand-set key poses ('custom': [lean, crouch, frontHand, backHand, frontFoot, backFoot] per key): the limb that reaches
 * nearest the first hitbox at the strike key is the one striking.
 */
function limbFromKeys(m: MoveDef): Limb {
  const keys = m.pose?.keys as unknown as (number | number[])[][] | undefined;
  const hb = m.hitboxes.find((h) => !h.grab && !h.throw);
  const k = keys?.[1];
  if (!k || !hb || k.length < 6) return 'body';
  let best = Infinity;
  let limb: Limb = 'body';
  for (let i = 2; i < 6; i++) {
    const p = k[i] as number[];
    if (!Array.isArray(p)) continue;
    const d = Math.hypot(p[0] - hb.x, p[1] - hb.y);
    if (d < best) {
      best = d;
      limb = i < 4 ? 'fist' : 'foot';
    }
  }
  // a limb nowhere near the hitbox (spins, body slams, the hitbox all round the body): the body strikes
  return best > Math.max(hb.w, hb.h) * 0.9 ? 'body' : limb;
}

function startsWithAny(id: string, ...p: string[]): boolean {
  for (const s of p) if (id === s || id.startsWith(s)) return true;
  return false;
}

/** The trail shape for a move (see the brief in the file comment). */
export function shapeOf(m: MoveDef, b: BasicFx | undefined, limb: Limb): TrailShape {
  const o = b?.shapes?.[m.id] ?? b?.shapes?.[m.id.replace(/_.*$/, '')] ?? b?.shapes?.[m.kind];
  if (o) return o;
  const arc = m.view?.arc;
  if (arc === 'none') return 'none';
  const id = m.id;
  const t = m.pose?.t ?? '';
  if (m.kind === 'dashAttack') return 'lunge';
  if (m.kind === 'jab') {
    if (m.next) return 'streak';
    if (arc === 'ring' || t === 'spin') return 'ring';
    if (limb === 'foot') return 'sweep';
    if (limb === 'weapon' && arc !== 'line') return 'arc';
    return 'thrust';
  }
  if (startsWithAny(id, 'dsmash')) return 'split';
  if (startsWithAny(id, 'usmash', 'utilt', 'uair')) return t === 'spin' || arc === 'ring' ? 'ring' : 'fan';
  if (startsWithAny(id, 'nair')) return arc === 'ring' || t === 'spin' || t === 'custom' ? 'ring' : limb === 'foot' ? 'sweep' : 'arc';
  if (startsWithAny(id, 'dair')) return 'spike';
  if (startsWithAny(id, 'fair', 'bair')) return limb === 'weapon' && arc === 'line' ? 'thrust' : 'arc';
  if (startsWithAny(id, 'dtilt')) return limb === 'weapon' && arc === 'line' ? 'thrust' : 'sweep';
  if (arc === 'ring') return 'ring';
  if (limb === 'foot') return 'sweep';
  if (limb === 'fist') return t === 'uppercut' || t === 'slash' || t === 'overhead' || arc === 'curve' ? 'arc' : 'thrust';
  if (limb === 'weapon') return arc === 'line' || t === 'thrust' ? 'thrust' : 'arc';
  return arc === 'line' ? 'thrust' : 'arc';
}

export function moveLook(f: Fighter, m: MoveDef): MoveLook {
  let l = LOOKS.get(m);
  if (!l) {
    const b = basicOf(f);
    const basic = BASIC_KINDS.has(m.kind);
    const limb = basic ? limbOf(m, b) : 'body';
    // specials and the rest keep the plain crescent / streak they always had
    const shape: TrailShape = basic ? shapeOf(m, b, limb) : m.view?.arc === 'none' ? 'none' : m.view?.arc === 'ring' ? 'ring' : m.view?.arc === 'line' ? 'thrust' : 'arc';
    l = { basic, shape, limb, weapon: limb === 'weapon' ? (b?.weapon ?? null) : null };
    LOOKS.set(m, l);
  }
  return l;
}

/**
 * One swing's geometry this tick (facing space: angle 0 = forward, y down; world x = px + cos(a) * r * facing).
 * Filled by `swingOf` into a reused object.
 */
export interface Swing {
  look: MoveLook;
  live: boolean;
  /** 0..1 through the hitbox's live window (1 after it). */
  prog: number;
  /** Frames since the hitbox ended (0 while live / before). */
  after: number;
  /** 1 .. 0 over the tail end. */
  fade: number;
  /** Pivot the swing turns around. */
  px: number;
  py: number;
  r: number;
  centre: number;
  span: number;
  head: number;
  tail: number;
  /** Head point and the outward unit vector there (world). */
  hx: number;
  hy: number;
  nx: number;
  ny: number;
  /** Tail point. */
  tx: number;
  ty: number;
  /** Hitbox rect (x, y, w, h). */
  rect: number[];
  heavy: boolean;
}

export function makeSwing(): Swing {
  return { look: { basic: false, shape: 'arc', limb: 'body', weapon: null }, live: false, prog: 0, after: 0, fade: 1, px: 0, py: 0, r: 0, centre: 0, span: 0, head: 0, tail: 0, hx: 0, hy: 0, nx: 1, ny: 0, tx: 0, ty: 0, rect: [0, 0, 0, 0], heavy: false };
}

/** Is this hitbox showing a trail this tick (live, a frame before, or up to 5 frames after)? */
export function swingVisible(f: Fighter, m: MoveDef, hb: HitboxDef): boolean {
  if (hb.grab || hb.throw || hb.travel) return false;
  const a0 = hitboxStart(m, hb);
  const a1 = hitboxEnd(m, hb);
  if (hitboxActive(f, m, hb)) return true;
  const after = f.moveFrame - a1;
  return (after > 0 && after <= 5) || (f.moveFrame >= a0 - 1 && f.moveFrame < a0);
}

/**
 * Geometry of a swing for hitbox `hb` of the fighter's current move (call when `swingVisible` or for the charge pose).
 * Pivots: chest for arcs / thrusts, hip for kicks, the feet for down-smashes.
 */
export function swingOf(f: Fighter, m: MoveDef, hb: HitboxDef, s: Swing): Swing {
  const look = moveLook(f, m);
  s.look = look;
  const a0 = hitboxStart(m, hb);
  const a1 = hitboxEnd(m, hb);
  s.live = hitboxActive(f, m, hb);
  s.after = Math.max(0, f.moveFrame - a1);
  s.fade = s.after > 0 ? Math.max(0, 1 - s.after / 6) : 1;
  s.prog = s.after > 0 ? 1 : a1 > a0 ? Math.min(1, Math.max(0, (f.moveFrame - a0) / (a1 - a0 + 1))) : 0.6;
  const r4 = s.rect;
  hitboxRect(f, hb, r4);
  const sm = f.sizeMul;
  const shape = look.shape;
  s.px = f.x;
  s.py = shape === 'sweep' ? f.y - f.h * sm * 0.32 : shape === 'split' ? f.y - 2 : f.y - f.h * sm * 0.55;
  const dx = (r4[0] + r4[2] / 2 - s.px) * f.facing;
  const dy = r4[1] + r4[3] / 2 - s.py;
  let r = Math.max(10, Math.hypot(dx, dy));
  let centre = Math.atan2(dy, dx);
  let span = Math.min(1.25, Math.max(0.5, (Math.max(r4[2], r4[3]) * 0.95) / (r + 6)));
  let head: number;
  let tail: number;
  const p = s.prog;
  if (!look.basic) {
    // specials keep the plain crescent (a ring is a wide crescent round the chest)
    if (shape === 'ring') {
      r = Math.max(24, r);
      span = Math.PI * 0.98;
    }
    const dir = m.kind === 'aerial' && hb.y > 0 ? -1 : 1;
    head = centre + span * (2 * p - 1) * dir;
    tail = Math.max(centre - span, Math.min(centre + span, head - span * 1.5 * dir));
  } else switch (shape) {
    case 'ring':
      r = Math.max(18, Math.max(r4[2], r4[3]) * 0.48);
      head = centre - Math.PI / 2 + Math.PI * 2 * p;
      tail = head - Math.PI * 1.7;
      break;
    case 'fan':
      // a vertical fan over the head: from forward-up round to behind-up
      r = Math.max(20, r);
      head = -0.2 - (Math.PI - 0.4) * (0.15 + 0.85 * p);
      tail = -0.2;
      centre = -Math.PI / 2;
      span = Math.PI / 2 - 0.2;
      break;
    case 'split':
      // along the floor: from on top of the feet out to the side (the mirrored twin is drawn by the trail)
      r = Math.max(22, Math.abs(dx) + r4[2] * 0.3);
      head = -Math.PI / 2 + (Math.PI / 2 + 0.12) * (0.2 + 0.8 * p);
      tail = -Math.PI / 2;
      centre = -Math.PI / 4;
      break;
    case 'arc': {
      // fair / bair and other swings: turning forward over the top (clockwise in facing space)
      span = Math.max(span, 0.9);
      head = centre - span + 2 * span * p;
      tail = Math.max(centre - span, head - span * 1.5);
      break;
    }
    case 'sweep':
      span = Math.max(span, 0.85);
      // kicks travel up into the target from below (a low sweep stays low: it travels forward along the floor)
      head = dy > 4 ? centre - span * 0.6 + 1.6 * span * p : centre + span * 0.6 - 1.6 * span * p;
      tail = dy > 4 ? Math.max(centre - span * 1.4, head - span * 1.6) : Math.min(centre + span * 1.4, head + span * 1.6);
      break;
    default:
      head = centre + span * (2 * p - 1);
      tail = Math.max(centre - span, Math.min(centre + span, head - span * 1.5));
      break;
  }
  s.r = r;
  s.centre = centre;
  s.span = span;
  s.head = head;
  s.tail = tail;
  s.heavy = hb.damage >= 12 || m.kind === 'smash';
  if (shape === 'thrust' || shape === 'streak' || shape === 'lunge' || shape === 'spike') {
    // straight shapes: the head is the far edge of the hitbox along the strike
    const ux = dx / r;
    const uy = dy / r;
    const reach = r + Math.max(r4[2], r4[3]) * 0.3;
    s.hx = s.px + ux * reach * f.facing;
    s.hy = s.py + uy * reach;
    if (shape === 'spike') {
      s.hx = r4[0] + r4[2] / 2;
      s.hy = r4[1] + r4[3] + 4;
    }
    s.nx = ux * f.facing;
    s.ny = uy;
    s.tx = s.px;
    s.ty = s.py;
  } else {
    const ry = shape === 'split' ? 0.3 : shape === 'ring' && look.basic ? Math.min(1, r4[3] / Math.max(1, r4[2])) : 1;
    const cx = Math.cos(head);
    const cy = Math.sin(head);
    s.hx = s.px + cx * r * f.facing;
    s.hy = s.py + cy * r * ry;
    s.nx = cx * f.facing;
    s.ny = cy;
    s.tx = s.px + Math.cos(tail) * r * f.facing;
    s.ty = s.py + Math.sin(tail) * r * ry;
  }
  return s;
}

// ---------------------------------------------------------------------------------------------
// Validation (fails loudly on typos, like engine/fxTypes)
// ---------------------------------------------------------------------------------------------
export function validateBasic(owner: string, b: BasicFx | undefined): void {
  if (!b) return;
  if (b.weapon !== undefined && !WEAPONS.includes(b.weapon)) throw new Error(`${owner}.fx.basic.weapon: unknown weapon '${b.weapon}'`);
  for (const [k, v] of Object.entries(b.shapes ?? {})) if (!TRAIL_SHAPES.includes(v)) throw new Error(`${owner}.fx.basic.shapes.${k}: unknown shape '${v}'`);
  (b.emitters ?? []).forEach((e, i) => {
    if (!PARTICLE_LOOKS.includes(e.p)) throw new Error(`${owner}.fx.basic.emitters[${i}]: unknown particle '${e.p}'`);
    if (e.color === undefined) throw new Error(`${owner}.fx.basic.emitters[${i}]: needs a color`);
    for (const c of Array.isArray(e.color) ? e.color : [e.color]) {
      if (typeof c === 'string' && !(c === '@accent' || c === '@trail' || /^#[0-9a-fA-F]{6}$/.test(c))) throw new Error(`${owner}.fx.basic.emitters[${i}]: bad colour '${c}'`);
    }
    if (e.at && !['head', 'tail', 'limb', 'feet', 'body', 'back'].includes(e.at)) throw new Error(`${owner}.fx.basic.emitters[${i}]: bad 'at'`);
    if (e.on && !['active', 'start', 'charge', 'release', 'hit'].includes(e.on)) throw new Error(`${owner}.fx.basic.emitters[${i}]: bad 'on'`);
  });
  if (b.trail2 !== undefined && typeof b.trail2 === 'string' && !/^#[0-9a-fA-F]{6}$/.test(b.trail2) && b.trail2 !== '@accent') throw new Error(`${owner}.fx.basic.trail2: bad colour`);
  if (b.ghosts !== undefined && !(b.ghosts >= 0 && b.ghosts <= 2)) throw new Error(`${owner}.fx.basic.ghosts: 0..2`);
}
