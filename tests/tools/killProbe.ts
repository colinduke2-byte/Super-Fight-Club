/**
 * Kill-percent probe: the lowest damage percent at which a move actually KOs a victim off a launch.
 *
 * Unlike a plain "did the victim die within N frames" check, the victim here gets no DI and no hitstun cancel during the
 * launch, then a best-effort recovery from a HARD CPU the moment hitstun ends. A KO only counts if it happens before the
 * victim is safe again (standing on solid ground or holding a ledge). Two numbers come out of every launch:
 *
 * - `recover`: KO'd despite the CPU recovery (the main figure: "this hit kills").
 * - `strict`:  KO'd within STRICT_GRACE frames of hitstun ending (pure launch distance, no recovery judgement at all).
 *
 * Hits are applied the way the engine applies them: melee and projectile hitboxes go through `deliverHit` (hitlag,
 * statuses, hooks), throws through the throw path (`receiveHit`, hitlag 0), and ultimates are actually performed (the
 * attacker presses Ultimate with full meter; cinematic grabs run their cutscene). Moves are fresh and uncharged; a
 * multi-hit move adds the damage of its earlier hit groups once before the launcher. Usage:
 *
 *   import { killPercent, probeFighter, VICTIMS } from './tools/killProbe';
 *   killPercent('brick', 'fsmash', 'nova', { position: 'ledge' }) // -> { recover: 125, strict: 130, dir: 'side', ... }
 */
import { CpuController } from '../../src/ai/cpu';
import { CHARACTERS } from '../../src/characters';
import { Button, type FighterInput, makeInput } from '../../src/engine/buttons';
import { deliverHit } from '../../src/engine/combat';
import { Fighter } from '../../src/engine/fighter';
import { computeKnockback } from '../../src/engine/knockback';
import type { HitboxDef, MoveDef } from '../../src/engine/moves';
import { World } from '../../src/engine/world';
import { STAGES } from '../../src/stages';

export type ProbePosition = 'centre' | 'ledge';
export type KoDir = 'top' | 'side' | 'bottom';

export interface ProbeOptions {
  /** Stage id (default: classic, the reference stage). */
  stage?: string;
  /** Victim standing at the middle of the main platform or right at its ledge (launched outward). */
  position?: ProbePosition;
  /** Highest percent tried (default 300). */
  maxPct?: number;
  /** Percent resolution (default 5). */
  step?: number;
  /** Debug: per-frame victim log of a launchOnce call is pushed here. */
  trace?: string[];
  /** Also search the best possible recovery (scripted jump / special timings) for the `best` figure (default true). */
  best?: boolean;
  /** A transforming ultimate with hits of its own: measure only those hits (killPercent compares both). */
  directOnly?: boolean;
}

export interface LaunchOutcome {
  /** KO'd before getting back to safety, with a HARD CPU recovering after hitstun. */
  ko: boolean;
  /** KO'd within STRICT_GRACE frames of hitstun ending. */
  strict: boolean;
  dir: KoDir | null;
  /** Whether the move connected at all (ultimates can whiff). */
  hit: boolean;
}

export interface ProbeResult {
  /** Lowest percent (multiple of `step`) that KOs with recovery; NEVER if none up to maxPct. */
  recover: number;
  /** Lowest percent that KOs under the strict rule; NEVER if none. */
  strict: number;
  /**
   * Lowest percent that KOs even with the best recovery found (every scripted jump / up-special / side-special timing in
   * RECOVERY_POLICIES, plus the CPU): what a victim who recovers well sees. NEVER if none; equals `strict` when skipped.
   */
  best: number;
  /** Blast zone crossed at `best`. */
  bestDir: KoDir | null;
  /** Blast zone crossed at `recover` ('bottom' after a side launch = launched too far to recover, fell). */
  dir: KoDir | null;
  /** Blast zone crossed at `strict` (where the launch itself carries the victim). */
  strictDir: KoDir | null;
  /** Short description of what was measured (hitbox / projectile / cinematic). */
  via: string;
}

export const NEVER = 999;
/** Frames after hitstun ends during which a KO still counts under the strict rule. */
export const STRICT_GRACE = 15;
/** Give up (count as survived) this many frames after the hit. */
const MAX_FRAMES = 900;

const ids = (): string[] => Object.keys(CHARACTERS).filter((c) => c !== 'overseer');

/**
 * Light / mid / heavy reference victims from the playable roster: the lightest, the one closest to the reference
 * weight 100 (a true middleweight: moves are tuned against weight 100), and the heaviest.
 */
export function victims(): { light: string; mid: string; heavy: string } {
  const byW = ids().sort((a, b) => CHARACTERS[a].stats.weight - CHARACTERS[b].stats.weight);
  const mid = byW.reduce((a, b) => (Math.abs(CHARACTERS[b].stats.weight - 100) < Math.abs(CHARACTERS[a].stats.weight - 100) ? b : a));
  return { light: byW[0], mid, heavy: byW[byW.length - 1] };
}

const isMeteor = (hb: HitboxDef): boolean => hb.angle >= 240 && hb.angle <= 300;
const isBack = (hb: HitboxDef): boolean => hb.angle !== 361 && hb.angle > 90 && hb.angle < 270;
const kbScore = (hb: HitboxDef): number => computeKnockback({ base: hb.base, scaling: hb.scaling, damagePercent: 100 + hb.damage, moveWeight: hb.weight, targetWeight: 100 });

interface HitPlan {
  hb: HitboxDef;
  /** Projectile / trap hit (does not freeze the owner). */
  ranged: boolean;
  throw: boolean;
  preDamage: number;
  via: string;
}

/** The launcher of a move: its hardest-hitting non-grab hitbox (including the shot of a projectile smash). */
function planHit(atkId: string, moveId: string): HitPlan | null {
  const data = CHARACTERS[atkId];
  const mv: MoveDef | undefined = data.moves[moveId];
  if (!mv) return null;
  const cands: { hb: HitboxDef; ranged: boolean; via: string }[] = mv.hitboxes.filter((h) => !h.grab).map((hb) => ({ hb, ranged: false, via: 'hitbox' }));
  for (const e of mv.events ?? []) {
    if (e.action !== 'projectile') continue;
    const p = data.projectiles?.[e.id];
    if (p?.hit) cands.push({ hb: p.hit, ranged: true, via: `projectile ${e.id}` });
  }
  if (!cands.length) return null;
  // prefer launchers that send the victim somewhere other than into the floor
  const pool = cands.some((c) => !isMeteor(c.hb)) ? cands.filter((c) => !isMeteor(c.hb)) : cands;
  const best = pool.reduce((a, b) => (kbScore(b.hb) > kbScore(a.hb) ? b : a));
  // earlier hit groups of a multi-hit melee move land first: count each other group's hardest hit once
  let preDamage = 0;
  if (!best.ranged) {
    const groups = new Map<number, number>();
    for (const h of mv.hitboxes) {
      const g = h.group ?? 0;
      if (h.grab || g === (best.hb.group ?? 0)) continue;
      groups.set(g, Math.max(groups.get(g) ?? 0, h.damage));
    }
    for (const d of groups.values()) preDamage += d;
  }
  return { hb: best.hb, ranged: best.ranged, throw: !!best.hb.throw || mv.kind === 'throw', preDamage, via: `${best.via} ${best.hb.damage}d ${best.hb.angle}deg b${best.hb.base} s${best.hb.scaling}` };
}

export function mainPlatform(stage: string): { left: number; right: number; top: number } {
  const plats = STAGES[stage].platforms.filter((p) => p.kind === 'solid');
  const p = plats.reduce((a, b) => (b.w > a.w ? b : a));
  return { left: p.x, right: p.x + p.w, top: p.y };
}

function koDir(world: World, v: Fighter): KoDir {
  const b = world.blast;
  if (v.koY <= b.top + 5) return 'top';
  if (v.koY >= b.bottom - 5) return 'bottom';
  return 'side';
}

/**
 * One launch: `victimId` at `pct` hit by `moveId`. The victim is always sent toward +x (the right ledge when
 * position = 'ledge'), whichever way the move launches: the attacker turns its back for backward-angled hits.
 */
export function launchOnce(atkId: string, moveId: string, victimId: string, pct: number, opts: ProbeOptions = {}, gap = 30, policy: RecoveryPolicy | null = null): LaunchOutcome {
  const stage = opts.stage ?? 'classic';
  const plat = mainPlatform(stage);
  const x0 = opts.position === 'ledge' ? plat.right - 16 : (plat.left + plat.right) / 2;
  const world = new World(STAGES[stage]);
  const a = new Fighter(0, CHARACTERS[atkId]);
  const v = new Fighter(1, CHARACTERS[victimId]);
  world.addFighter(a);
  world.addFighter(v);
  const mv = CHARACTERS[atkId].moves[moveId];
  const trans = isTransform(atkId, moveId);
  const ult = mv?.kind === 'ultimate' && !trans;
  let plan = ult ? null : trans ? planHit(atkId, transformMove(atkId) ?? '') : planHit(atkId, moveId);
  const back = !!plan && isBack(plan.hb) && plan.hb.dir !== 'away';
  // forward hits: attacker behind the victim facing it; backward hits: attacker in front with its back to the victim
  a.spawn(x0 - gap, plat.top - 1, back ? -1 : 1);
  v.spawn(x0, plat.top - 1, -1);
  const ins = [makeInput(), makeInput()];
  for (let i = 0; i < 20; i++) world.step(ins);
  if (trans) {
    // a transforming ultimate (Gizmo's mech): perform it, then measure the transformed form's strongest launcher
    a.meter = 1e6;
    ins[0].pressed = ins[0].held = Button.Ultimate;
    world.step(ins);
    ins[0].pressed = ins[0].held = 0;
    for (let i = 0; i < 120 && a.state === 'attack'; i++) world.step(ins);
    const id = a.data.behavior?.remapMove?.(a, 'fsmash') ?? 'fsmash';
    plan = planHit(atkId, id);
    v.spawn(x0, plat.top - 1, -1);
    for (let i = 0; i < 4; i++) world.step(ins);
  }
  a.invuln = v.invuln = 0; // no respawn invincibility: a cinematic grab has to connect
  v.damage = pct + (plan?.preDamage ?? 0);

  let ko = false;
  let dir: KoDir | null = null;
  let hit = false;
  world.listener = (t, f) => {
    if (f !== v) return;
    if (t === 'ko' && !ko) {
      ko = true;
      dir = koDir(world, v);
    }
    if (t === 'hit' || t === 'cinematicStart' || t === 'cinematicHit') hit = true;
  };
  if (ult) {
    a.meter = 1e6;
    ins[0].pressed = ins[0].held = Button.Ultimate;
  } else if (plan) {
    const kbMult = a.kbMult * a.rage;
    const damage = plan.hb.damage * a.outMul;
    if (plan.throw) {
      v.receiveHit({ damage, base: plan.hb.base, scaling: plan.hb.scaling, angle: plan.hb.angle, direction: a.facing, moveWeight: plan.hb.weight, hitlag: 0, attackerId: a.id, kbMult }, world);
      if (plan.hb.status) v.applyStatus(plan.hb.status, world);
    } else {
      deliverHit(world, { atk: a, ownerId: a.id, def: v, hb: plan.hb, damage, facing: a.facing, originX: a.x, kbMult, freezeOwner: plan.ranged ? false : undefined });
    }
    hit = true;
  } else return { ko: false, strict: false, dir: null, hit: false };

  const cpu = new CpuController(3, 1);
  const vin = makeInput();
  const neutral = makeInput();
  const pst = newPolicyState();
  let endedAt = -1;
  let strict = false;
  for (let i = 0; i < MAX_FRAMES && !ko; i++) {
    const attackerBusy = ult && (a.state === 'attack' || world.cinematic !== null);
    const launched = v.state === 'hitstun' || v.state === 'grabbed' || v.hitlag > 0;
    if (endedAt < 0 && hit && !launched && !attackerBusy) endedAt = i;
    if (endedAt >= 0) {
      // safe again: the launch is over
      if (i > endedAt && (v.grounded || v.state === 'ledge' || v.state === 'ledgeClimb')) break;
      if (policy) policyInput(v, plat, policy, pst, vin);
      else {
        cpu.update(v, world, vin);
        assistRecovery(v, plat, vin);
      }
    }
    world.step([ins[0], endedAt >= 0 ? vin : neutral]);
    opts.trace?.push(`${i} ${v.state} ${v.move?.id ?? ''} x${v.x.toFixed(0)} y${v.y.toFixed(0)} v${v.vx.toFixed(1)},${v.vy.toFixed(1)} jumps${v.jumpsLeft} in ${endedAt >= 0 ? `${vin.stickX.toFixed(1)},${vin.stickY.toFixed(1)} p${vin.pressed}` : '-'}`);
    if (i === 0) ins[0].pressed = ins[0].held = 0;
    if (ko && (endedAt < 0 || i - endedAt <= STRICT_GRACE)) strict = true;
    if (ult && !hit && i > 240) break; // the ultimate whiffed
  }
  return { ko, strict, dir, hit };
}

/**
 * The CPU's recovery is tuned to look human (it saves its jump until it is low), so help it to a best-effort line: once
 * off the stage, always drift toward the nearest ledge and spend the double jump as soon as the fall starts. The CPU
 * still picks when and where to aim the recovery special.
 */
function assistRecovery(v: Fighter, plat: { left: number; right: number; top: number }, inp: FighterInput): void {
  if (v.grounded || v.state === 'ledge' || v.state === 'ledgeClimb' || v.state === 'attack') return;
  const off = v.x > plat.right || v.x < plat.left;
  if (!off) return;
  inp.stickX = v.x > plat.right ? -1 : 1;
  // a recovering victim does not attack or fast-fall on its way back (the CPU sometimes swings at nobody off-stage)
  inp.pressed &= ~(Button.Attack | Button.Smash);
  inp.held &= ~(Button.Attack | Button.Smash);
  if (inp.stickY > 0.5) inp.stickY = 0;
  if (v.jumpsLeft > 0 && v.vy > 0 && (inp.pressed & Button.Special) === 0) {
    inp.pressed |= Button.Jump;
    inp.held |= Button.Jump;
  }
}

// ---- best possible recovery ----------------------------------------------------------------------------------------

/**
 * A scripted recovery: drift toward the stage the whole time, spend the double jump(s) at `jump` timing, optionally use a
 * horizontal special (`extra`) once, then the up special once the fighter has fallen to `upAt` px relative to the ledge
 * (negative = above it), aimed `aim`. Hover / glide fighters hold Jump while out of jumps. A last-resort up special fires
 * anyway once the fighter is well below the ledge.
 */
export interface RecoveryPolicy {
  jump: 'asap' | 'late';
  upAt: number;
  aim: 'diag' | 'up' | 'flat';
  extra: 'none' | 'sideB' | 'neutralB';
}

interface PolicyState {
  extraUsed: boolean;
  upUsed: boolean;
}
const newPolicyState = (): PolicyState => ({ extraUsed: false, upUsed: false });

/** Every policy tried for `fighterId` (the extra specials only for fighters whose specials travel). */
export function recoveryPolicies(fighterId: string): RecoveryPolicy[] {
  const moves = CHARACTERS[fighterId].moves;
  const travels = (id: string): boolean => {
    const m = moves[id] ?? Object.entries(moves).find(([k]) => k.startsWith(`${id}_`))?.[1];
    return !!m && ((m.motion ?? []).some((mo) => Math.abs(mo.vx ?? 0) >= 2) || (m.events ?? []).some((e) => e.action === 'teleport'));
  };
  const extras: RecoveryPolicy['extra'][] = ['none'];
  if (travels('sideB')) extras.push('sideB');
  if (travels('neutralB')) extras.push('neutralB');
  const out: RecoveryPolicy[] = [];
  for (const extra of extras)
    for (const jump of ['asap', 'late'] as const)
      for (const upAt of [-40, 0, 40, 90])
        for (const aim of ['diag', 'up', 'flat'] as const) out.push({ jump, upAt, aim, extra });
  return out;
}

/** Drive `v` for one frame under `pol` (fills `inp`). The stage is `plat`; the target ledge is the nearer edge. */
function policyInput(v: Fighter, plat: { left: number; right: number; top: number }, pol: RecoveryPolicy, st: PolicyState, inp: FighterInput): void {
  inp.pressed = inp.held = 0;
  inp.stickX = inp.stickY = 0;
  if (v.grounded || v.state === 'ledge' || v.state === 'ledgeClimb') return;
  const off = v.x > plat.right || v.x < plat.left;
  if (!off) return;
  const toward = v.x > plat.right ? -1 : 1;
  const edgeDx = v.x > plat.right ? v.x - plat.right : plat.left - v.x;
  const below = v.y - plat.top; // + = below the ledge
  inp.stickX = toward;
  if (v.state === 'attack' || v.helpless || v.state === 'tether') return;
  if (v.state !== 'air') return;
  if (v.jumpsLeft > 0) {
    const go = pol.jump === 'asap' ? v.vy > 0 : v.vy > 0 && below > -10;
    if (go) {
      inp.pressed = inp.held = Button.Jump;
      return;
    }
    if (below < 120) return;
  }
  if (v.data.hover || v.data.glide) inp.held |= Button.Jump;
  if (pol.extra !== 'none' && !st.extraUsed && edgeDx > 30 && v.vy > -1) {
    st.extraUsed = true;
    inp.pressed |= Button.Special;
    inp.held |= Button.Special;
    inp.stickX = pol.extra === 'sideB' ? toward : toward * 0.3;
    inp.stickY = 0;
    return;
  }
  if (!st.upUsed && v.vy >= 0 && (below >= pol.upAt || below > 100)) {
    st.upUsed = true;
    inp.pressed |= Button.Special;
    inp.held |= Button.Special;
    inp.stickX = pol.aim === 'up' ? 0 : pol.aim === 'diag' ? toward * 0.6 : toward * 0.75;
    inp.stickY = pol.aim === 'flat' ? -0.65 : pol.aim === 'diag' ? -0.8 : -1;
  }
}

/**
 * Recovery reach: the farthest a fighter can be from the ledge (px, horizontally, measured from the stage edge to its
 * body centre) and still make it back to the ledge or stage, starting airborne at rest with every jump and special
 * unused, `below` px under the stage's top (0 = level with the ledge). Best over every RecoveryPolicy. Classic stage.
 */
export function recoveryReach(fighterId: string, below = 0, stage = 'classic', upOnly = false): number {
  const plat = mainPlatform(stage);
  const pols = recoveryPolicies(fighterId).filter((p) => !upOnly || (p.extra === 'none' && p.jump === 'asap'));
  const makes = (d: number): boolean => pols.some((pol) => recovers(fighterId, plat, stage, d, below, pol, undefined, upOnly));
  let lo = 0;
  let hi = 400;
  if (!makes(lo)) return 0;
  while (hi - lo > 2) {
    const mid = Math.round((lo + hi) / 2);
    if (makes(mid)) lo = mid;
    else hi = mid;
  }
  return lo;
}

export function recovers(fighterId: string, plat: { left: number; right: number; top: number }, stage: string, d: number, below: number, pol: RecoveryPolicy, trace?: string[], upOnly = false): boolean {
  const world = new World(STAGES[stage]);
  const v = new Fighter(0, CHARACTERS[fighterId]);
  world.addFighter(v);
  v.spawn(plat.right + d, plat.top + below, -1);
  v.invuln = 0;
  if (upOnly) {
    v.jumpsLeft = 0;
    if (v.data.hover) v.jetFrames = v.data.hover.frames;
    if (v.data.glide) v.glideFrames = v.data.glide.max;
  }
  const inp = makeInput();
  const st = newPolicyState();
  let ko = false;
  world.listener = (t, f) => {
    if (t === 'ko' && f === v) ko = true;
  };
  for (let i = 0; i < 600 && !ko; i++) {
    if (v.grounded || v.state === 'ledge' || v.state === 'ledgeClimb') return v.y <= plat.top + 1 || v.state !== 'idle';
    policyInput(v, plat, pol, st, inp);
    world.step([inp]);
    trace?.push(`${i} ${v.state} ${v.move?.id ?? ''} x${v.x.toFixed(0)} y${v.y.toFixed(0)} v${v.vx.toFixed(1)},${v.vy.toFixed(1)} j${v.jumpsLeft} in ${inp.stickX.toFixed(1)},${inp.stickY.toFixed(1)} p${inp.pressed}`);
  }
  return false;
}

/**
 * Fighter ids with their recovery reach: `out` / `low` with everything (jumps, drift, hover, specials) level with the
 * ledge and from 60 px below it; `upOut` / `upLow` the same with the jumps (and hover / glide) already spent, so the up
 * special (plus drift) has to do it alone.
 */
export function recoveryTable(only?: string[]): { id: string; out: number; low: number; upOut: number; upLow: number }[] {
  return ids()
    .filter((id) => !only || only.includes(id))
    .map((id) => ({ id, out: recoveryReach(id, 0), low: recoveryReach(id, 60), upOut: recoveryReach(id, 0, 'classic', true), upLow: recoveryReach(id, 60, 'classic', true) }));
}

/**
 * A transforming ultimate: no projectiles or cutscene of its own; it changes the moves (remapMove) for a while. It may
 * open with a hit of its own (Gizmo's power-up shockwave): killPercent then takes the better of that hit and the launcher.
 */
function isTransform(atkId: string, moveId: string): boolean {
  const mv = CHARACTERS[atkId].moves[moveId];
  if (mv?.kind !== 'ultimate' || mv.cinematic) return false;
  if ((mv.events ?? []).some((e) => e.action === 'projectile' || e.action === 'deploy')) return false;
  return !!CHARACTERS[atkId].behavior?.remapMove;
}

/** The move a transformed fighter's forward smash becomes (measured as the ultimate's launcher). */
function transformMove(atkId: string): string | null {
  const data = CHARACTERS[atkId];
  const f = new Fighter(0, data);
  f.res.mech = 1;
  for (const k of Object.keys(f.res)) f.res[k] = Math.max(1, f.res[k]);
  const id = data.behavior?.remapMove?.(f, 'fsmash');
  return id && id !== 'fsmash' && data.moves[id] ? id : null;
}

/** Lowest percent at which the move KOs; see the module comment for the rules. */
export function killPercent(atkId: string, moveId: string, victimId: string, opts: ProbeOptions = {}): ProbeResult {
  const mv = CHARACTERS[atkId].moves[moveId];
  const none = (via: string): ProbeResult => ({ recover: NEVER, strict: NEVER, best: NEVER, dir: null, strictDir: null, bestDir: null, via });
  if (!mv) return none('missing');
  if (!opts.directOnly && isTransform(atkId, moveId)) {
    const id = transformMove(atkId);
    const plan = id ? planHit(atkId, id) : null;
    const viaLauncher = plan ? search(atkId, moveId, victimId, opts, 30, `transform, then ${id}: ${plan.via}`) : none('transform: no launcher');
    if (!mv.hitboxes.length) return viaLauncher;
    const direct = killPercent(atkId, moveId, victimId, { ...opts, directOnly: true });
    return direct.best < viaLauncher.best ? direct : viaLauncher;
  }
  if (mv.kind === 'ultimate') {
    // find a spacing at which the ultimate connects (cinematic grabs need to be close; beams and barrages reach further)
    const cin = mv.cinematic;
    const gap = (cin ? [26, 34] : [40, 90, 150, 220]).find((g) => launchOnce(atkId, moveId, victimId, 0, opts, g).hit);
    if (gap === undefined) return none('never connects (not a launcher)');
    const via = cin ? `cinematic, ${+cin.hits.reduce((s, h) => s + h.damage, 0).toFixed(1)}d total` : `performed at ${gap}px`;
    return search(atkId, moveId, victimId, opts, gap, via);
  }
  const plan = planHit(atkId, moveId);
  if (!plan) return none('no launcher');
  return search(atkId, moveId, victimId, opts, 30, plan.via + (plan.preDamage ? ` (+${+plan.preDamage.toFixed(1)}% earlier hits)` : ''));
}

function search(atkId: string, moveId: string, victimId: string, opts: ProbeOptions, gap: number, via: string): ProbeResult {
  const max = opts.maxPct ?? 300;
  const step = opts.step ?? 5;
  const res: ProbeResult = { recover: NEVER, strict: NEVER, best: NEVER, dir: null, strictDir: null, bestDir: null, via };
  for (let pct = 0; pct <= max && res.strict === NEVER; pct += step) {
    const r = launchOnce(atkId, moveId, victimId, pct, opts, gap);
    if (r.ko && res.recover === NEVER) {
      res.recover = pct;
      res.dir = r.dir;
    }
    if (r.strict) {
      res.strict = pct;
      res.strictDir = r.dir;
    }
  }
  res.best = res.strict;
  res.bestDir = res.strictDir;
  if (opts.best === false || res.recover === NEVER) return res;
  // best recovery: between the CPU figure and the pure-launch figure, the first percent no scripted recovery survives
  const pols = recoveryPolicies(victimId);
  for (let pct = res.recover; pct < res.strict; pct += step) {
    let dir: KoDir | null = null;
    let all = true;
    for (const pol of pols) {
      const r = launchOnce(atkId, moveId, victimId, pct, opts, gap, pol);
      if (!r.ko) {
        all = false;
        break;
      }
      dir = r.dir;
    }
    if (all) {
      res.best = pct;
      res.bestDir = dir;
      break;
    }
  }
  return res;
}

/** The two aerials with the most knockback (spikes excluded), strongest first. */
export function strongestAerials(atkId: string, n = 2): string[] {
  const moves = CHARACTERS[atkId].moves;
  const score = (id: string): number => {
    const hbs = moves[id]?.hitboxes.filter((h) => !h.grab && !isMeteor(h)) ?? [];
    return hbs.length ? Math.max(...hbs.map(kbScore)) : -1;
  };
  return ['nair', 'fair', 'bair', 'uair', 'dair'].filter((m) => score(m) > 0).sort((x, y) => score(y) - score(x)).slice(0, n);
}

/** The throw with the most knockback. */
export function strongestThrow(atkId: string): string | null {
  const moves = CHARACTERS[atkId].moves;
  const t = ['fthrow', 'bthrow', 'uthrow', 'dthrow'].filter((m) => moves[m]);
  if (!t.length) return null;
  const score = (id: string): number => Math.max(...moves[id].hitboxes.map(kbScore));
  return t.reduce((a, b) => (score(b) > score(a) ? b : a));
}

export interface ProbeRow {
  attacker: string;
  move: string;
  label: string;
  via: string;
  /** results[victim][position] */
  results: Record<string, Record<ProbePosition, ProbeResult>>;
}

/** Every measured kill move of one fighter: smashes, two strongest aerials, strongest throw, ultimate. */
export function probeMoves(atkId: string): { move: string; label: string }[] {
  const out = [
    { move: 'fsmash', label: 'f-smash' },
    { move: 'usmash', label: 'u-smash' },
    { move: 'dsmash', label: 'd-smash' },
    ...strongestAerials(atkId).map((m) => ({ move: m, label: m })),
  ];
  const t = strongestThrow(atkId);
  if (t) out.push({ move: t, label: t });
  if (CHARACTERS[atkId].moves.ultimate) out.push({ move: 'ultimate', label: 'ultimate' });
  return out;
}

export function probeFighter(atkId: string, opts: Omit<ProbeOptions, 'position'> = {}, victimIds = Object.values(victims())): ProbeRow[] {
  return probeMoves(atkId).map(({ move, label }) => {
    const results: ProbeRow['results'] = {};
    let via = '';
    for (const v of victimIds) {
      const centre = killPercent(atkId, move, v, { ...opts, position: 'centre' });
      const ledge = killPercent(atkId, move, v, { ...opts, position: 'ledge' });
      via = centre.via;
      results[v] = { centre, ledge };
    }
    return { attacker: atkId, move, label, via, results };
  });
}

export const playableIds = ids;

/**
 * Design targets for kill power (against the mid-weight reference victim, classic stage, `best` rule: the victim recovers
 * as well as it can, see RecoveryPolicy; KILL_RULE=recover / strict switches the rule):
 * KOs should start around 110-140%: each fighter's strongest move kills a middleweight around 110% from centre stage,
 * its typical kill moves by about 140%, and side KOs should be a real share (forward smashes launch out the side).
 */
export const KILL_TARGETS = {
  /** The fighter's strongest non-ultimate kill move from centre stage. */
  strongest: { min: 105, max: 130 },
  /** Median of the fighter's smashes (f/u/d) and best aerial from centre stage. */
  typical: { min: 120, max: 150 },
  /** No non-ultimate move kills a middleweight at centre stage below this. */
  floor: 90,
  /** Forward smash from the ledge: earlier than centre, but not absurdly early. */
  ledgeFsmash: { min: 75, max: 130 },
  /** The strongest throw from the ledge (throws are reliable, so they should be weak killers). */
  ledgeThrow: { min: 110, max: 200 },
  /** At least one non-ultimate move's pure launch kill (strict rule) from centre must leave through the side blast zone. */
  sideKiller: true,
} as const;

// ---- raw hits (stage hazards, items) --------------------------------------------------------------------------------

export interface RawHit {
  damage: number;
  base: number;
  scaling: number;
  angle: number;
  /** +1 sends the victim right. */
  direction?: 1 | -1;
  /** Soak frames applied with the hit (water geysers). */
  soak?: number;
}

/**
 * Lowest percent (steps of `step`) at which a raw hit (a stage hazard, an item blast) KOs `victimId` standing at `x` on
 * `stage`: `recover` with the HARD CPU recovering, `best` with the best scripted recovery as well (see RecoveryPolicy).
 */
export function hitKillPercent(victimId: string, hit: RawHit, stage: string, x: number, step = 5, max = 300): { recover: number; best: number } {
  const plat = mainPlatform(stage);
  const once = (pct: number, policy: RecoveryPolicy | null): boolean => {
    const world = new World({ ...STAGES[stage], hazards: [] });
    const v = new Fighter(0, CHARACTERS[victimId]);
    world.addFighter(v);
    v.spawn(x, plat.top - 1, -1);
    const neutral = makeInput();
    for (let i = 0; i < 20; i++) world.step([neutral]);
    v.invuln = 0;
    v.damage = pct;
    let ko = false;
    world.listener = (t, f) => {
      if (t === 'ko' && f === v) ko = true;
    };
    v.receiveHit({ damage: hit.damage, base: hit.base, scaling: hit.scaling, angle: hit.angle, direction: hit.direction ?? 1, hitlag: 8 }, world);
    if (hit.soak) v.applyStatus({ type: 'soak', frames: hit.soak }, world);
    const cpu = new CpuController(3, 0);
    const vin = makeInput();
    const pst = newPolicyState();
    let ended = false;
    for (let i = 0; i < MAX_FRAMES && !ko; i++) {
      if (!ended && v.state !== 'hitstun' && v.hitlag <= 0) ended = true;
      if (ended) {
        if (v.grounded || v.state === 'ledge' || v.state === 'ledgeClimb') break;
        if (policy) policyInput(v, plat, policy, pst, vin);
        else {
          cpu.update(v, world, vin);
          assistRecovery(v, plat, vin);
        }
      }
      world.step([ended ? vin : neutral]);
    }
    return ko;
  };
  let recover = NEVER;
  for (let pct = 0; pct <= max; pct += step) {
    if (once(pct, null)) {
      recover = pct;
      break;
    }
  }
  if (recover === NEVER) return { recover, best: NEVER };
  const pols = recoveryPolicies(victimId);
  for (let pct = recover; pct <= max; pct += step) if (pols.every((p) => once(pct, p))) return { recover, best: pct };
  return { recover, best: NEVER };
}
