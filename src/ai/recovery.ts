import type { Fighter } from '../engine/fighter';
import { Ledge, type Platform } from '../engine/platform';
import type { World } from '../engine/world';
import type { CharacterAi, LevelParams } from './profiles';
import { NO_POLICY, policyDirs, policyStick, simulateRecovery, type RecPolicy } from './recoveryPlan';

/**
 * True if the fighter is airborne with no stage under it: no solid platform spans its x with a top at or below its feet.
 * (Judged per platform, so a raised block or a side island does not make the air above the main stage count as "off".)
 */
export function offstage(f: Fighter, world: World): boolean {
  if (f.grounded || f.state === 'ledge' || f.state === 'ledgeClimb' || f.state === 'ko') return false;
  let solid = false;
  for (const p of world.platforms) {
    if (p.kind !== 'solid') continue;
    solid = true;
    if (f.x >= p.x - 4 && f.x <= p.right + 4 && f.y <= p.top + 6) return false;
  }
  return solid;
}

/** Is the point (x, y) over a solid platform top (at or above it)? */
export function overStage(x: number, y: number, world: World): boolean {
  for (const p of world.platforms) if (p.kind === 'solid' && x >= p.x + 4 && x <= p.right - 4 && y <= p.top + 6) return true;
  return false;
}

export interface RecoveryEpisode {
  ledge: Ledge | null;
  /** Randomised mistakes for this attempt (0 for a perfect CPU). */
  jumpDelay: number;
  specialDelay: number;
  aimError: number;
  startTick: number;
  specialPressed: boolean;
  /**
   * Where this attempt aims (a mixup, chosen per episode by `LevelParams.recoveryMix`): 'ledge' hangs on the ledge, 'high'
   * lands on the stage a little way in, 'low' sinks below the ledge before jumping (under an edge-guarder's reach).
   */
  aim: 'ledge' | 'high' | 'low';
  /** The horizontal recovery special (sideRecovery) was used this attempt. */
  sideUsed: boolean;
  /** A recall (Vex's Blink Recall) was tried this attempt. */
  recallTried: boolean;
  /** Recovery variety of the CPU (copied from its LevelParams). */
  mix: number;
  /** Planner state: the attempt chosen, frames between plans, waits for the last moment (precise) or fires at once. */
  pol: RecPolicy | null;
  nextPlan: number;
  planEvery: number;
  precise: boolean;
  decision: 'special' | 'jump' | 'dodge' | 'wait' | 'none';
  /** Episode tick a planned delayed up special is due (-1 = none). */
  waitFire: number;
  /** Winged / jet fighter: holds Jump to glide / hover once the jumps are spent. */
  float: boolean;
  /**
   * The platform the fighter was heading for when it left the ground on its own (a hop across a gap to a rival on another
   * platform): its ledges win over a nearer one behind, so the CPU does not turn round and fly back to where it jumped from
   * (and loop there for ever). Dropped as soon as no simulated attempt reaches it.
   */
  prefer: Platform | null;
}

export function newEpisode(world: World, p: LevelParams, rnd: () => number, prefer: Platform | null = null): RecoveryEpisode {
  const sloppy = 1 - p.recovery;
  const r = rnd();
  const mix = p.recoveryMix ?? 0;
  const aim = r < mix * 0.3 ? 'high' : r < mix * 0.55 ? 'low' : 'ledge';
  return {
    ledge: null,
    jumpDelay: Math.round(rnd() * sloppy * 40),
    specialDelay: Math.round(rnd() * sloppy * 36),
    aimError: (rnd() - 0.5) * sloppy * 1.6,
    startTick: world.tick,
    specialPressed: false,
    aim,
    sideUsed: false,
    recallTried: false,
    mix,
    pol: null,
    nextPlan: 0,
    // re-plan every frame at the top, every ~4 at the bottom (a slower read of the same physics)
    planEvery: 2 + Math.round((1 - p.recovery) * 7),
    precise: mix >= 0.25,
    decision: 'none',
    waitFire: -1,
    float: false,
    prefer,
  };
}

function landInFor(ep: RecoveryEpisode): number {
  return ep.aim === 'high' ? 34 : 10;
}

const stick = { x: 0, y: 0 };

/** Scratch attempts for planRecovery (reused: it runs every frame or two of a recovery). */
const polPool: RecPolicy[] = Array.from({ length: 24 }, () => ({ jumpAt: -1, specialAt: -1, dodgeAt: -1, inX: 1, sy: -1, float: false }));
const probe: RecPolicy = { jumpAt: -1, specialAt: -1, dodgeAt: -1, inX: 1, sy: -1, float: false };

function setPol(p: RecPolicy, jumpAt: number, specialAt: number, dodgeAt: number, inX: number, sy: number, float: boolean): RecPolicy {
  p.jumpAt = jumpAt;
  p.specialAt = specialAt;
  p.dodgeAt = dodgeAt;
  p.inX = inX;
  p.sy = sy;
  p.float = float;
  return p;
}

/** The chosen attempt is kept on the episode (its own object, so the pool can be reused). */
function keep(ep: RecoveryEpisode, p: RecPolicy): void {
  ep.pol = setPol(ep.pol ?? { jumpAt: -1, specialAt: -1, dodgeAt: -1, inX: 1, sy: -1, float: false }, p.jumpAt, p.specialAt, p.dodgeAt, p.inX, p.sy, p.float);
}

/** One planning step: what to do now so that a simulated attempt gets back (see simulateRecovery). */
function planRecovery(f: Fighter, world: World, l: Ledge, ai: CharacterAi, ep: RecoveryEpisode): RecoveryEpisode['decision'] {
  const dirs = policyDirs(ai.recovery.aim);
  const float = !!(f.data.glide || f.data.hover);
  ep.float = float;
  const landIn = landInFor(ep);
  // a glide / jet hover drifts in slowly: give those attempts a longer horizon
  const horizon = float ? 170 : 100;
  const ok = (pol: RecPolicy): boolean => simulateRecovery(f, world, l, pol, horizon, landIn) >= 0;
  const hangY = l.y + f.h * 0.9;
  // below the hang point with a jump left and falling: the jump comes first (it keeps a margin for a ledge taken by a
  // rival meanwhile, a hit, a misjudged snap); above it the up special alone may do
  const jumpFirst = f.jumpsLeft > 0 && f.vy >= 0 && f.y > hangY - 10;
  const jumpStep = (): RecoveryEpisode['decision'] | null => {
    if (f.jumpsLeft <= 0 || f.vy <= -2) return null;
    let n = 0;
    setPol(polPool[n++], 0, 999, -1, 1, -1, float);
    if (!ep.specialPressed) for (let d = 0; d < Math.min(2, dirs.length); d++) for (const s of SPECIAL_AFTER_JUMP) setPol(polPool[n++], 0, s, -1, dirs[d][0], dirs[d][1], float);
    for (let i = 0; i < n; i++) {
      const pol = polPool[i];
      if (!ok(pol)) continue;
      keep(ep, pol);
      // a precise CPU holds the jump while jumping a few frames later still makes it (and it is not yet below the hang point)
      if (ep.precise && f.vy >= 0 && !jumpFirst && ok(setPol(probe, 5, pol.specialAt + 5, -1, pol.inX, pol.sy, float))) return 'wait';
      return 'jump';
    }
    return null;
  };
  if (jumpFirst) {
    const d = jumpStep();
    if (d) return d;
  }
  // 1) the up special now
  if (!ep.specialPressed) {
    for (const [inX, sy] of dirs) {
      const pol = setPol(polPool[0], -1, 0, -1, inX, sy, float);
      if (!ok(pol)) continue;
      keep(ep, pol);
      // a precise CPU keeps drifting while firing 6 frames later still works (comes in lower, keeps its options)
      if (ep.precise && ok(setPol(probe, -1, 6, -1, inX, sy, float))) return 'wait';
      return 'special';
    }
  }
  // 2) the double jump now, then the up special (or no special at all)
  if (f.jumpsLeft > 0 && f.vy > -2) return jumpStep() ?? 'none';
  if (ep.specialPressed) return 'none';
  // 3) an air dodge in, then the up special
  if (!f.airDodgeUsed && f.vy > -1) {
    for (const [inX, sy] of dirs)
      for (const s of [16, 24]) {
        const pol = setPol(polPool[0], -1, s, 0, inX, sy, float);
        if (ok(pol)) {
          keep(ep, pol);
          return 'dodge';
        }
      }
  }
  // 4) float / drift a while, then the up special: first the attempt already under way (its special is that much nearer
  // now; re-trying only fixed delays would put it off for ever), then fresh ones
  const left = ep.waitFire - (world.tick - ep.startTick);
  if (ep.pol && left > 0 && ep.pol.jumpAt < 0 && ep.pol.dodgeAt < 0) {
    const pol = setPol(polPool[0], -1, left, -1, ep.pol.inX, ep.pol.sy, float);
    if (ok(pol)) return 'wait';
  }
  for (const [inX, sy] of dirs)
    for (const s of float ? FLOAT_WAITS : DRIFT_WAITS) {
      const pol = setPol(polPool[0], -1, s, -1, inX, sy, float);
      if (ok(pol)) {
        keep(ep, pol);
        ep.waitFire = world.tick - ep.startTick + s;
        return 'wait';
      }
    }
  return 'none';
}

const SPECIAL_AFTER_JUMP = [8, 18, 32];
const DRIFT_WAITS = [8, 20, 36];
const FLOAT_WAITS = [8, 20, 36, 60, 90];

export interface RecoveryOut {
  sx: number;
  sy: number;
  jump: boolean;
  special: boolean;
  /** Air dodge (Shield) this frame, toward (sx, sy). Optional so older callers' scratch objects still fit. */
  dodge?: boolean;
  /** True while a recovery special is the thing to keep steering. */
  steering: boolean;
}

/**
 * A rival standing at the edge we are heading for (or waiting off it), close enough to hit us as we come back: an
 * edge-guarder. Returns its horizontal distance from the ledge corner (Infinity if none).
 */
export function edgeGuarder(f: Fighter, world: World, l: Ledge): number {
  let best = Infinity;
  for (const o of world.fighters) {
    if (o === f || o.state === 'ko' || world.allied(f.id, o.id)) continue;
    const inward = (l.x - o.x) * l.side; // + when on the stage side of the corner
    if (inward < -60 || inward > 90 || Math.abs(o.y - l.y) > 80) continue;
    best = Math.min(best, Math.abs(inward));
  }
  return best;
}

/**
 * Is ledge `l` worth aiming for? A free ledge, or one a rival holds: hanging rivals can be knocked off by grabbing it (a
 * ledge trump) and climbing ones are gone in a moment (the stage top is there anyway). One an ally holds is not.
 */
export function ledgeOpen(f: Fighter, world: World, l: Ledge): boolean {
  if (l.occupant === -1 || l.occupant === f.id) return true;
  return !world.allied(f.id, l.occupant);
}

/** How much nearer (px of pickLedge cost) a ledge of the platform a hop was heading for counts. */
const PREFER_BONUS = 160;

const cornerCache = new WeakMap<World, Ledge[]>();

/**
 * Stage corners with no ledge to hang on (a block flush with the edge, like Stormrunner's crate): still somewhere to recover
 * to, by landing on top. Returned as ledge-shaped aim points that are not in `world.ledges`, so nothing can grab them.
 */
export function bareCorners(world: World): Ledge[] {
  let out = cornerCache.get(world);
  if (out) return out;
  out = [];
  for (const p of world.platforms) {
    if (p.kind !== 'solid' || p.dynamic) continue;
    for (const side of [-1, 1] as const) {
      if (world.ledges.some((l) => l.platform === p && l.side === side)) continue;
      const cx = side === -1 ? p.x : p.right;
      // a corner sitting on (or covered by) another solid block is not an edge of the stage
      const inner = world.platforms.some((q) => q !== p && q.kind === 'solid' && cx > q.x + 2 && cx < q.right - 2 && q.top >= p.top - 1 && q.top <= p.top + 140);
      const covered = world.platforms.some((q) => q !== p && q.kind === 'solid' && Math.abs(q.bottom - p.top) < 1 && cx >= q.x - 12 && cx <= q.right + 12);
      if (!inner && !covered) out.push(new Ledge(p, side));
    }
  }
  cornerCache.set(world, out);
  return out;
}

/**
 * The best ledge to aim for: nearest to the fighter (a trumpable one costs a little extra), preferring ones it can reach.
 * Ledges of `prefer` (the platform a voluntary hop was heading for) count as much nearer.
 */
export function pickLedge(f: Fighter, world: World, keep: Ledge | null, prefer: Platform | null = null): Ledge | null {
  const cost = (l: Ledge): number => Math.abs(l.x + l.side * (f.hw + 4) - f.x) + Math.abs(l.y + f.h * 0.9 - f.y) * 1.6 + (l.occupant !== -1 && l.occupant !== f.id ? 30 : 0) - (prefer && l.platform === prefer ? PREFER_BONUS : 0);
  let best: Ledge | null = null;
  let bestD = Infinity;
  // keep the current choice unless another one became much nearer
  if (keep && ledgeOpen(f, world, keep)) {
    best = keep;
    bestD = cost(keep) - 120;
  }
  const corners = bareCorners(world);
  const n = world.ledges.length;
  for (let i = 0; i < n + corners.length; i++) {
    const l = i < n ? world.ledges[i] : corners[i - n];
    if (!ledgeOpen(f, world, l)) continue;
    const d = cost(l) + (i < n ? 0 : 20);
    if (d < bestD) {
      bestD = d;
      best = l;
    }
  }
  return best;
}

/**
 * One frame of recovery input: drift to the ledge, double-jump when level with / below it, then use the recovery
 * special, aiming at the hang point. Mistakes (late jump, early/late special, aim error) scale with the CPU level.
 */
export function recoveryStep(f: Fighter, world: World, ai: CharacterAi, ep: RecoveryEpisode, out: RecoveryOut): void {
  out.sx = 0;
  out.sy = 0;
  out.jump = false;
  out.special = false;
  out.dodge = false;
  out.steering = false;
  ep.ledge = pickLedge(f, world, ep.ledge, ep.prefer);
  const l = ep.ledge;
  if (!l) return;
  const guard = edgeGuarder(f, world, l);
  // a rival waiting at the corner: do not aim to land on top of it, hang on the ledge (or come in low) instead
  if (ep.aim === 'high' && guard < 50) ep.aim = 'ledge';
  // still above the stage's top: land on it (a little way in from the corner) instead of dropping to the hang point
  const above = f.y < l.y - 2;
  const landIn = ep.aim === 'high' ? 34 : 10;
  const hx = above ? l.x - l.side * (f.hw + landIn) : l.x + l.side * (f.hw + 4);
  const hy = above ? l.y : l.y + f.h * 0.9;
  const dx = hx - f.x;
  const dy = hy - f.y; // > 0: the hang point is below us, < 0: above us
  out.sx = Math.abs(dx) < 5 ? 0 : Math.sign(dx);
  // after reaching the horizontal position keep drifting inward so the ledge-grab's "facing the stage" test passes
  if (Math.abs(dx) < 5) out.sx = -l.side * 0.4;

  const rec = ai.recovery;
  const t = world.tick - ep.startTick;
  const canAct = f.state === 'air' && !f.helpless;

  if (f.state === 'attack' && ep.pol && ep.specialPressed) {
    // a planned up special: fly it the way the simulation did
    out.steering = true;
    policyStick(f, l, ep.pol, landInFor(ep), stick);
    out.sx = stick.x;
    out.sy = stick.y;
    return;
  }
  if (f.state === 'attack') {
    // mid recovery special: steer toward the ledge
    out.steering = true;
    if (rec.aim === 'stick8' || rec.aim === 'tether') {
      const len = Math.hypot(dx, dy) || 1;
      let ax = dx / len;
      let ay = dy / len;
      const c = Math.cos(ep.aimError);
      const s = Math.sin(ep.aimError);
      [ax, ay] = [ax * c - ay * s, ax * s + ay * c];
      // up8 snaps to 8 directions: keep the vertical component only when the ledge is clearly above
      out.sx = Math.abs(ax) < 0.25 ? 0 : Math.sign(ax);
      out.sy = ay < -0.3 ? -1 : ay > 0.5 ? 1 : 0;
      if (rec.aim === 'tether') {
        out.sx = ax;
        out.sy = ay;
      }
    } else {
      out.sx = Math.abs(dx) < 4 ? 0 : Math.sign(dx);
      out.sy = -1;
    }
    return;
  }
  if (!canAct) return;

  const below = f.y - hy; // > 0 means we are lower than the hang point
  const reach = rec.up;
  // wall jump (characters that have it): kick off the side of the stage on the way up
  if (f.data.wallJump && f.wall !== 0 && f.wallJumps < 2 && below > 0) {
    out.jump = true;
    return;
  }
  // air dodge onto the stage: out of jumps but already above the stage's top and close to the corner, a directional air
  // dodge carries us onto it without spending (and going helpless after) the up special
  const toCorner = (f.x - l.x) * l.side; // px beyond the corner
  if (above && ep.mix > 0 && f.jumpsLeft === 0 && !f.airDodgeUsed && !ep.specialPressed && toCorner > -4 && toCorner < 34 && l.y - f.y < 50 && f.vy > -1) {
    out.dodge = true;
    out.sx = -l.side * 0.75;
    out.sy = 0.66;
    return;
  }
  // a recall to a marker left on the stage (Vex's Blink Recall): warps straight back, invulnerable on arrival
  const rc = ai.recall;
  if (rc && !ep.recallTried && (below > -20 || f.jumpsLeft === 0)) {
    const mk = world.findDeployables(f.id, rc.marker)[0];
    if (mk && overStage(mk.x, mk.y, world)) {
      ep.recallTried = true;
      out.special = true;
      out.sx = 0;
      out.sy = 0;
      return;
    }
  }
  // engine-simulated recovery (every recovery type, every level): fire the up special when a simulated attempt from here
  // reaches the ledge / stage (a precise CPU waits for the last frame that still does), spend the double jump only when
  // waiting longer would lose it, air dodge in when that is what it takes. A weaker CPU re-plans less often and fires as
  // soon as an attempt works instead of waiting for the last moment.
  if (t >= ep.nextPlan) {
    ep.nextPlan = t + ep.planEvery;
    // the planned moment for a delayed up special has come and nothing reaches now (the world moved): fire it anyway
    const due = ep.waitFire >= 0 && t >= ep.waitFire && !ep.specialPressed;
    ep.decision = planRecovery(f, world, l, ai, ep);
    // nothing reaches from here: look again a little later (the plain rules below steer meanwhile)
    if (ep.decision === 'none') ep.nextPlan = t + Math.max(4, ep.planEvery);
    // the platform the hop was heading for is out of reach after all: go for the nearest ledge instead (next frame)
    if (ep.decision === 'none' && ep.prefer && l.platform === ep.prefer) {
      ep.prefer = null;
      ep.ledge = null; // no keep bias for it either
      ep.nextPlan = t + 1;
    }
    if (ep.decision === 'none' && due && ep.ledge) ep.decision = 'special';
    if (ep.decision !== 'wait') ep.waitFire = -1;
  } else if (ep.decision !== 'wait' && ep.decision !== 'none') ep.decision = 'wait';
  if (ep.decision !== 'none') {
    const pol = ep.pol ?? NO_POLICY;
    policyStick(f, l, pol, landInFor(ep), stick);
    out.sx = stick.x;
    out.sy = 0;
    switch (ep.decision) {
      case 'special':
        ep.specialPressed = true;
        out.special = true;
        out.steering = true;
        out.sx = -l.side * pol.inX;
        out.sy = -1; // Up selects the up special; the aimed direction is held once it runs (policyStick)
        break;
      case 'jump':
        out.jump = true;
        break;
      case 'dodge':
        out.dodge = true;
        out.sx = -l.side * 0.7;
        out.sy = -0.7;
        break;
      default:
        // waiting: winged / jet fighters out of jumps float while they drift in
        if (ep.float && f.jumpsLeft === 0 && f.vy >= 0) out.jump = true;
    }
    if (ep.decision !== 'wait') ep.decision = 'wait';
    return;
  }
  // horizontal recovery special (Pirate's Dash, Frost Step, Skewer Dash): from far out, at about stage height, it covers
  // the gap the jump and the up special could not
  const side = ai.sideRecovery;
  const far = Math.abs(dx) - rec.out - (f.jumpsLeft > 0 ? 70 : 20);
  if (side && !ep.sideUsed && far > 30 && below < reach * 0.3 && below > -140 && f.vy >= -1.5 && (f.jumpsLeft === 0 || far > 90)) {
    ep.sideUsed = true;
    out.special = true;
    out.sx = Math.sign(dx);
    out.sy = 0;
    out.steering = true;
    return;
  }
  // 1) double jump: once we are no longer rising and level with / below the hang point. With an edge-guarder waiting, a
  // recovery-savvy CPU holds the jump a little (comes in lower, out of the guard's reach) while it still has the height
  const holdLow = (ep.aim === 'low' || guard < 70) && ep.mix > 0 && below < reach * 0.45 && f.vy < 5 && Math.abs(dx) < rec.out + 60;
  if (f.jumpsLeft > 0 && f.vy >= -0.5 && below > -6 && t >= ep.jumpDelay && !(holdLow && below < 24)) {
    out.jump = true;
    return;
  }
  // 2) recovery special
  const horizontalOk = Math.abs(dx) <= rec.out + 20;
  const lastChance = below > reach * 0.55;
  const jumpsGone = f.jumpsLeft === 0;
  if (!ep.specialPressed && (jumpsGone || lastChance) && below > -10 && (horizontalOk || lastChance) && t >= ep.specialDelay && f.vy >= -1) {
    out.special = true;
    out.steering = true;
    out.sy = -1; // Up must be held on the press frame to select the up special; aim is refined while it runs
    out.sx = Math.abs(dx) < 4 ? 0 : Math.sign(dx);
  }
  // never drift in under the stage's underside while below it (an up special from there hits the floor's bottom)
  if (!out.special && f.y - f.h > l.y + 2 && (f.x - l.x) * l.side < f.hw + 4) out.sx = l.side;
  // winged fighters out of flaps hold Jump to glide toward the stage
  if (f.data.glide && f.jumpsLeft === 0 && !out.special && f.vy > f.data.glide.fall && Math.abs(dx) > 8 && f.glideFrames < f.data.glide.max) out.jump = true;
}
