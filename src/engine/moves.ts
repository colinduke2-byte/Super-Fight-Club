/**
 * Move / frame-data model. Moves live in JSON (one file per character) and are validated on load.
 *
 * Frame numbering: the frame the move starts on is frame 1. A move with `startup: 6` is
 * non-damaging on frames 1..6 and its first active frame is 7. Active frames are
 * `startup+1 .. startup+active`; the move ends after `startup+active+recovery` frames.
 * Hitbox positions are in world px relative to the fighter's feet-centre (x forward, y DOWN, so
 * y = -16 is roughly chest height).
 */

export interface HitboxDef {
  x: number;
  y: number;
  w: number;
  h: number;
  damage: number;
  /** Degrees, 0 = straight ahead, 90 = up, 180 = behind, 270 = spike. 361 = "Sakurai" (auto). */
  angle: number;
  base: number;
  scaling: number;
  /** Move weight (default 100) used by the knockback formula. */
  weight?: number;
  /** Active sub-window, relative to the first active frame (1-based, inclusive). Default: whole active period. */
  window?: [number, number];
  /** Multi-hit group. A group hits each victim once per move unless `rehit` is set. Default 0. */
  group?: number;
  /** Frames before the same group may hit the same victim again. */
  rehit?: number;
  /** 'facing': angle mirrored by attacker facing. 'away': victim is pushed away from attacker's centre. */
  dir?: 'facing' | 'away';
  hitlag?: number;
  /** Minimum hitstun (frames) so weak multi-hit/jab moves still link. */
  minHitstun?: number;
  grab?: boolean;
  throw?: boolean;
  unblockable?: boolean;
  breaksShield?: boolean;
  shieldDamage?: number;
  /** Cosmetic hit-effect tag. */
  fx?: string;
}

export type MoveKind = 'jab' | 'smash' | 'aerial' | 'special' | 'grab' | 'throw' | 'ultimate';

export interface MoveDef {
  id: string;
  name: string;
  kind: MoveKind;
  /** Sprite animation row used by the placeholder/real sheet. */
  anim: string;
  startup: number;
  active: number;
  recovery: number;
  hitboxes: HitboxDef[];
  /** Aerials: lag frames when landing during the move (outside autocancel windows). */
  landingLag?: number;
  /** Aerials: [from,to] move-frame ranges in which landing cancels all lag. */
  autocancel?: [number, number][];
  /** Smashes: hold at `frame` while the button is held, up to `max` frames. */
  charge?: { frame: number; max: number; damageMult: number; kbMult?: number };
  /** Armor window: hits with damage <= threshold do not interrupt (damage still taken). Omit threshold for super armor. */
  armor?: { from: number; to: number; threshold?: number };
  /** Jab chain: pressing Attack during [from,to] starts `id` once the move reaches frame `at`. */
  next?: { id: string; from: number; to: number; at: number };
  /** Velocity impulses: vx forward-relative. mode 'set' (default) replaces, 'add' accumulates. */
  motion?: { frame: number; vx?: number; vy?: number; mode?: 'set' | 'add' }[];
  /** Gravity multiplier while the move runs (airborne). Default 1. */
  gravityScale?: number;
  /** Invulnerable on these frames. */
  invuln?: [number, number];
  /** If the fighter lands during the active window, bounce up with this speed instead of taking landing lag. */
  landBounce?: number;
  /** Throw moves: stick direction that triggers this throw. */
  throwDir?: 'forward' | 'back' | 'up' | 'down';
}

export function moveTotal(m: MoveDef): number {
  return m.startup + m.active + m.recovery;
}

/** Absolute first/last frame in which a hitbox is live. */
export function hitboxFrames(m: MoveDef, hb: HitboxDef): [number, number] {
  const w = hb.window ?? [1, m.active];
  return [m.startup + w[0], m.startup + w[1]];
}

/** Validate and normalise a character's move JSON. Throws with a precise message on bad data. */
export function parseMoves(json: { moves: Record<string, Omit<MoveDef, 'id'>> }, owner = 'character'): Record<string, MoveDef> {
  const out: Record<string, MoveDef> = {};
  for (const [id, raw] of Object.entries(json.moves)) {
    const m: MoveDef = { ...raw, id };
    const where = `${owner}.${id}`;
    if (!(m.startup >= 0 && m.active >= 1 && m.recovery >= 0)) throw new Error(`${where}: bad startup/active/recovery`);
    if (!m.anim) throw new Error(`${where}: missing anim`);
    m.hitboxes.forEach((hb, i) => {
      const w = hb.window;
      if (w && !(w[0] >= 1 && w[1] >= w[0] && w[1] <= m.active)) throw new Error(`${where}.hitboxes[${i}]: window outside active period`);
      if (hb.w <= 0 || hb.h <= 0) throw new Error(`${where}.hitboxes[${i}]: empty box`);
      if ((hb.group ?? 0) >= 8) throw new Error(`${where}.hitboxes[${i}]: group must be < 8`);
    });
    if (m.charge && !(m.charge.frame >= 1 && m.charge.frame <= m.startup)) throw new Error(`${where}: charge frame must be inside startup`);
    out[id] = m;
  }
  for (const m of Object.values(out)) {
    if (m.next && !out[m.next.id]) throw new Error(`${owner}.${m.id}: next move '${m.next.id}' does not exist`);
  }
  return out;
}
