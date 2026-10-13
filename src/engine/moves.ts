/**
 * Move / frame-data model. Moves live in JSON (one file per character) and are validated on load.
 *
 * Frame numbering: the frame the move starts on is frame 1. A move with `startup: 6` is
 * non-damaging on frames 1..6 and its first active frame is 7. Active frames are
 * `startup+1 .. startup+active`; the move ends after `startup+active+recovery` frames.
 * Hitbox positions are in world px relative to the fighter's feet-centre (x forward, y DOWN, so
 * y = -16 is roughly chest height).
 */

export type StatusType = 'burn' | 'slow' | 'freeze' | 'stun' | 'soak';

/** A status applied by a hit (or by a move to its own user). */
export interface StatusApply {
  type: StatusType;
  frames: number;
  /** slow: speed multiplier (0.6 = 40% slower). burn: damage per tick. soak: frames are added (stacking up to SOAK_MAX). */
  value?: number;
  /** Only applies if the victim's percent is at least this; otherwise `fallback` is used instead. */
  minPercent?: number;
  fallback?: StatusApply;
}

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
  /** Status applied to the victim on a clean hit. */
  status?: StatusApply;
  /** The hitbox travels (px/frame, forward-relative) from its first live frame (beams, sweeps). */
  travel?: { vx: number; vy: number };
  /** Grab that starts a cinematic (see MoveDef.cinematic) instead of a normal hold. */
  cinematic?: boolean;
  /** Only live if the move's charge is at least this fraction (0..1), e.g. a full-charge-only shield breaker. */
  minCharge?: number;
  /** After a grab connects, the attacker immediately starts this move (command grabs that slam on their own). */
  thenMove?: string;
}

/** Things a move does at a given frame, in addition to its hitboxes. Positions are forward-relative from the feet. */
export type MoveEvent =
  | { frame: number; /** Only runs if the move's charge is at least this fraction (hold-to-activate effects). */ minCharge?: number; action: 'projectile'; id: string; x: number; y: number; vx: number; vy: number; /** Up / down on the stick tilts the shot up to 25 degrees. */ aim?: boolean }
  | { frame: number; /** Only runs if the move's charge is at least this fraction (hold-to-activate effects). */ minCharge?: number; action: 'deploy'; id: string; x: number; y: number }
  | { frame: number; /** Only runs if the move's charge is at least this fraction (hold-to-activate effects). */ minCharge?: number; action: 'teleport'; dist: number; dir?: 'stick8' | 'forward' | 'up' | 'up8' | 'back'; /** Deployable id to drop at the departure point (Blink marker). */ leaveMarker?: string }
  | { frame: number; /** Only runs if the move's charge is at least this fraction (hold-to-activate effects). */ minCharge?: number; action: 'recall'; id: string }
  | { frame: number; /** Only runs if the move's charge is at least this fraction (hold-to-activate effects). */ minCharge?: number; action: 'barrier'; frames: number; x: number; y: number; w: number; h: number }
  | { frame: number; /** Only runs if the move's charge is at least this fraction (hold-to-activate effects). */ minCharge?: number; action: 'tether'; angle: number; range: number; speed: number; grabsOpponents?: boolean; /** Also try angles up to +-cone degrees either side (forgiving recoveries). */ cone?: number }
  | { frame: number; /** Only runs if the move's charge is at least this fraction (hold-to-activate effects). */ minCharge?: number; action: 'ledgeSnap'; range: number }
  | { frame: number; /** Only runs if the move's charge is at least this fraction (hold-to-activate effects). */ minCharge?: number; action: 'status'; status: StatusApply }
  | { frame: number; /** Only runs if the move's charge is at least this fraction (hold-to-activate effects). */ minCharge?: number; action: 'resource'; key: string; add: number }
  | { frame: number; /** Only runs if the move's charge is at least this fraction (hold-to-activate effects). */ minCharge?: number; action: 'fx'; name: string }
  | { frame: number; /** Only runs if the move's charge is at least this fraction (hold-to-activate effects). */ minCharge?: number; action: 'custom'; name: string; args?: number[] };

/** Scripted ultimate: world freezes while the attacker's sequence plays, then hits land. */
export interface Cinematic {
  frames: number;
  hits: { frame: number; damage: number; hitlag?: number; launch?: boolean; angle?: number; base?: number; scaling?: number }[];
  /** Camera hint for the renderer. */
  zoom?: number;
}

export type MoveKind = 'jab' | 'tilt' | 'dashAttack' | 'smash' | 'aerial' | 'special' | 'grab' | 'throw' | 'ultimate';

/**
 * Hit-confirm / whiff cancel: while the move is in [from, to] (and, by default, after it has connected) a buffered press of
 * `button` in direction `dir` immediately starts move `into` (or '@jump': a jump cancel). This is what makes combos flow.
 */
export interface MoveCancel {
  button: 'attack' | 'special' | 'smash' | 'grab' | 'jump';
  /** Stick direction relative to facing. 'side' = forward or back. Default 'any'. */
  dir?: 'neutral' | 'forward' | 'back' | 'side' | 'up' | 'down' | 'any';
  into: string;
  from: number;
  to?: number;
  /** Only after the move hit something (default true). */
  onHit?: boolean;
  /** true: only in the air, false: only on the ground, omitted: either. */
  air?: boolean;
}

/**
 * Compact description of a move's key poses (wind-up, strike, recovery). The sprite generator builds the six animation frames
 * from it, so every move can have its own animation without hand-drawing frames. `t` picks a template (see art/poseTemplates.ts):
 * punch, hook, uppercut, kick, sweep, slash, thrust, spin, slam, stomp, elbow, overhead, or `custom` with explicit `keys`.
 */
export interface PoseSpec {
  t: string;
  hand?: 'front' | 'back' | 'both';
  foot?: 'front' | 'back';
  /** Forward reach of the striking limb at the strike pose. */
  reach?: number;
  /** Height of the strike relative to the resting hand (negative = up). */
  h?: number;
  /** Wind-up limb position [x, y]. */
  wind?: [number, number];
  /** slash: the limb path from -> to. */
  from?: [number, number];
  to?: [number, number];
  lean?: number;
  crouch?: number;
  /** Front foot step at the strike. */
  step?: number;
  lift?: number;
  /** Weapon axis (degrees: 0 forward, -90 up, 90 down) at the three key poses; for spear carriers. */
  aim?: [number, number, number];
  /** Wing posture 0..1 at the three key poses; for winged fighters. */
  wing?: [number, number, number];
  /** custom: three explicit key poses [lean, crouch, frontHand, backHand, frontFoot, backFoot]. */
  keys?: [number, number, [number, number], [number, number], [number, number], [number, number]][];
}

/** Optional per-move presentation tweaks (all visual): body squash / lean through the phases, smear and afterimage strength. */
export interface MoveView {
  /** Stretch along the facing direction at the strike (1 = none). */
  stretch?: number;
  /** Squash during the wind-up (1 = none; <1 squashes tall). */
  squash?: number;
  /** Lean of the whole body into the strike, radians (positive = forward). */
  lean?: number;
  /** Strength of the motion-blur smear on the strike frames (0..1.5, default 1). */
  smear?: number;
  /** Afterimage ghosts while the strike is active. */
  ghosts?: boolean;
  /** Swing arc shape: curved crescent (default), straight streak, full ring, or none. */
  arc?: 'curve' | 'line' | 'ring' | 'none';
}

export interface MoveDef {
  id: string;
  name: string;
  kind: MoveKind;
  /** Sprite animation row used by the placeholder/real sheet. */
  anim: string;
  /** Generates this move's own animation (`mv_<id>`) from key poses; overrides `anim` (see applyMovePoses). */
  pose?: PoseSpec;
  view?: MoveView;
  startup: number;
  active: number;
  recovery: number;
  hitboxes: HitboxDef[];
  /** Aerials: lag frames when landing during the move (outside autocancel windows). */
  landingLag?: number;
  /** Aerials: [from,to] move-frame ranges in which landing cancels all lag. */
  autocancel?: [number, number][];
  /** Smashes: hold at `frame` while the button is held, up to `max` frames. */
  /** `store`: a resource key; Shield during the hold banks the charge there and the next use starts from it. */
  charge?: { frame: number; max: number; damageMult: number; kbMult?: number; store?: string };
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
  /** Frame-timed actions (spawn projectile / deployable, teleport, barrier, tether, ...). */
  events?: MoveEvent[];
  /** Ledge cannot be grabbed for this many frames after the move starts (punishable recoveries). */
  noLedge?: number;
  /** Specials: can the fighter grab the ledge while this move is airborne? Default true. */
  ledgeGrab?: boolean;
  /** After an airborne move ends the fighter is helpless (no actions) until landing / ledge / hit. */
  helpless?: boolean;
  /** Cinematic ultimate script (the move needs a hitbox with `cinematic: true`). */
  cinematic?: Cinematic;
  /** Not listed in training mode (internal follow-up moves such as a command grab's slam). */
  hidden?: boolean;
  /** Cancel windows into other moves (combo routes). */
  cancels?: MoveCancel[];
  /** Gate: a resource must be at least this much to start the move (the cost is spent by an event). */
  requires?: { key: string; min: number };
}

export interface ProjectileDef {
  w: number;
  h: number;
  /** Downward acceleration px/frame^2: this is what makes bolts arc. */
  gravity?: number;
  /** Fraction of horizontal speed lost per frame. */
  drag?: number;
  maxFall?: number;
  /** Lifetime in frames. */
  life: number;
  /** Damage/knockback payload (position fields are ignored). */
  hit: HitboxDef;
  /** Keeps flying after hitting (beams). Default: destroyed on hit. */
  pierce?: boolean;
  /** Fighters' attacks can destroy it by dealing this much damage. 0 / undefined = cannot be destroyed. */
  health?: number;
  /** Barriers can reflect it. Default true. */
  reflectable?: boolean;
  /** Vertical motion override: zigzag oscillation of +-amp px around the launch height. */
  path?: { kind: 'zigzag'; amp: number; period: number };
  /** Boomerang: flies out for `out` frames, then homes back to its owner and can hit a second time. */
  boomerang?: { out: number; speed: number };
  /** Keeps this fraction of speed when bouncing off solid floors. 0 = vanishes on contact. */
  bounce?: number;
  look: { shape: 'orb' | 'bolt' | 'bullet' | 'fist' | 'beam' | 'shard' | 'wave'; color: string; size?: number };
}

export interface DeployableDef {
  w: number;
  h: number;
  /** A vortex: rivals within `radius` px (horizontally, near its height) are dragged toward it, up to `strength` px a frame. */
  pull?: { radius: number; strength: number };
  health: number;
  /** Frames until it expires (0 = permanent). */
  life?: number;
  /** Max alive at once per owner (within `limitGroup`, default = this def's id). */
  limit: number;
  limitGroup?: string;
  /** When over the limit: replace the oldest (true) or refuse to deploy (false, default). */
  replaceOldest?: boolean;
  /** Falls and rests on the ground. */
  gravity?: boolean;
  armFrames?: number;
  /** Triggers on enemy contact: applies `hit` then (by default) disappears. */
  trigger?: { hit: HitboxDef; persistent?: boolean };
  turret?: { range: number; interval: number; projectile: string; muzzleX: number; muzzleY: number; speed: number };
  /** Granted to the owner when an enemy destroys it. */
  reward?: { key: string; add: number };
  look: { shape: 'mine' | 'turret' | 'rune' | 'marker' | 'whirlpool' | 'pillar'; color: string };
  /**
   * A crystal pillar: the deployable raises a temporary solid platform `w` x `h` from its base (x, y = ground). It blocks
   * fighters and projectiles, can be stood on, and sinks back over `sinkFrames` before its `life` runs out.
   */
  pillar?: {
    riseFrames: number;
    sinkFrames?: number;
    /** Hit dealt (once each) to rivals the pillar rises into. */
    riseHit?: { damage: number; base: number; scaling: number; angle: number; hitlag?: number };
    /** Shattering (by its owner) bursts it into this many shard projectiles. */
    shards?: { projectile: string; count: number; speed: number };
  };
}

export function moveTotal(m: MoveDef): number {
  return m.startup + m.active + m.recovery;
}

/** Absolute first / last frame in which a hitbox is live (allocation-free; used in the per-tick hot path). */
export function hitboxStart(m: MoveDef, hb: HitboxDef): number {
  return m.startup + (hb.window ? hb.window[0] : 1);
}
export function hitboxEnd(m: MoveDef, hb: HitboxDef): number {
  return m.startup + (hb.window ? hb.window[1] : m.active);
}

/** Absolute first/last frame in which a hitbox is live, as a pair (convenience for tools; allocates). */
export function hitboxFrames(m: MoveDef, hb: HitboxDef): [number, number] {
  return [hitboxStart(m, hb), hitboxEnd(m, hb)];
}

/** Everything a character's JSON file defines. */
export interface CharacterJson {
  moves: Record<string, Omit<MoveDef, 'id'>>;
  projectiles?: Record<string, ProjectileDef>;
  deployables?: Record<string, DeployableDef>;
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
    if (m.cinematic && !m.hitboxes.some((h) => h.cinematic)) throw new Error(`${owner}.${m.id}: cinematic move needs a hitbox with cinematic: true`);
    for (const ev of m.events ?? []) {
      if (ev.frame < 1 || ev.frame > m.startup + m.active + m.recovery) throw new Error(`${owner}.${m.id}: event at frame ${ev.frame} is outside the move`);
    }
  }
  return out;
}

/** Check every projectile / deployable id referenced by moves and deployables exists. Throws on a dangling id. */
export function validateReferences(moves: Record<string, MoveDef>, projectiles: Record<string, ProjectileDef> = {}, deployables: Record<string, DeployableDef> = {}, owner = 'character'): void {
  for (const m of Object.values(moves)) {
    for (const ev of m.events ?? []) {
      if (ev.action === 'projectile' && !projectiles[ev.id]) throw new Error(`${owner}.${m.id}: unknown projectile '${ev.id}'`);
      if (ev.action === 'deploy' && !deployables[ev.id]) throw new Error(`${owner}.${m.id}: unknown deployable '${ev.id}'`);
    }
  }
  for (const [id, d] of Object.entries(deployables)) {
    if (d.turret && !projectiles[d.turret.projectile]) throw new Error(`${owner}.${id}: turret uses unknown projectile '${d.turret.projectile}'`);
    if (d.pillar?.shards && !projectiles[d.pillar.shards.projectile]) throw new Error(`${owner}.${id}: pillar shards use unknown projectile '${d.pillar.shards.projectile}'`);
  }
}

/** Variant tables must point at real moves. */
export function validateVariants(variants: Record<string, { key: string; ids: string[] }> | undefined, moves: Record<string, MoveDef>, owner = 'character'): void {
  for (const [slot, v] of Object.entries(variants ?? {})) {
    if (!v.key || v.ids.length === 0) throw new Error(`${owner}.variants.${slot}: needs a resource key and at least one move`);
    for (const id of v.ids) if (!moves[id]) throw new Error(`${owner}.variants.${slot}: unknown move '${id}'`);
  }
}
