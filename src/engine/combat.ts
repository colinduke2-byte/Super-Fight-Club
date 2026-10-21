import { MAX_GROUPS, GRAB_DISTANCE, PARRY_HITLAG, type Fighter } from './fighter';
import { hitboxEnd, hitboxStart, type HitboxDef, type MoveDef } from './moves';
import type { World } from './world';

/** Damage difference below which two simultaneous hits both land (a trade). */
export const TRADE_THRESHOLD = 8;
const HITLAG_BASE = 2;
const HITLAG_PER_DAMAGE = 0.4;
/** Extra freeze per damage above HEAVY_FREEZE_FROM: light hits stay snappy, heavy hits crunch. */
const HEAVY_FREEZE_FROM = 8;
const HEAVY_FREEZE_PER_DAMAGE = 0.35;
const HITLAG_MAX = 28;
/** Momentum hits: attacker speed (px/frame) toward the victim above MIN carries into the launch at CARRY, up to MAX. */
const MOMENTUM_MIN = 0.6;
/** Hit-stop the attacker suffers when its blow lands on a counter. */
const COUNTER_FREEZE = 16;
const MOMENTUM_CARRY = 0.5;
const MOMENTUM_MAX = 2;
const MAX_CANDIDATES = 16;

interface Candidate {
  atk: Fighter;
  def: Fighter;
  hb: HitboxDef;
  move: MoveDef;
  damage: number;
  alive: boolean;
  /** Connected through the box's inner part (point blank). */
  inner: boolean;
}

const pool: Candidate[] = Array.from({ length: MAX_CANDIDATES }, () => ({ atk: null as unknown as Fighter, def: null as unknown as Fighter, hb: null as unknown as HitboxDef, move: null as unknown as MoveDef, damage: 0, alive: false, inner: false }));
let count = 0;

/** Hitbox rect in world space. Writes into `out` = [x, y, w, h] (top-left). */
export function hitboxRect(f: Fighter, hb: HitboxDef, out: number[]): void {
  let ox = hb.x;
  let oy = hb.y;
  if (hb.travel && f.move) {
    // beams / sweeps: the box moves from its first live frame
    const off = Math.max(0, f.moveFrame - hitboxStart(f.move, hb));
    ox += hb.travel.vx * off;
    oy += hb.travel.vy * off;
  }
  const cx = f.x + f.facing * ox;
  const cy = f.y + oy;
  out[0] = cx - hb.w / 2;
  out[1] = cy - hb.h / 2;
  out[2] = hb.w;
  out[3] = hb.h;
}

export function hurtRect(f: Fighter, out: number[]): void {
  const h = f.hurtH;
  out[0] = f.x - f.hw * f.sizeMul;
  out[1] = f.y - h;
  out[2] = f.hw * 2 * f.sizeMul;
  out[3] = h;
}

const rA = [0, 0, 0, 0];
const rB = [0, 0, 0, 0];

function overlap(a: number[], b: number[]): boolean {
  return a[0] < b[0] + b[2] && a[0] + a[2] > b[0] && a[1] < b[1] + b[3] && a[1] + a[3] > b[1];
}

/** Is this hitbox live on the fighter's current move frame? */
export function hitboxActive(f: Fighter, m: MoveDef, hb: HitboxDef): boolean {
  const a = hitboxStart(m, hb);
  const b = hitboxEnd(m, hb);
  if (hb.minCharge !== undefined && f.chargeFrac < hb.minCharge) return false;
  return f.moveFrame >= a && f.moveFrame <= b;
}

function canHit(world: World, atk: Fighter, def: Fighter, hb: HitboxDef): boolean {
  const g = hb.group ?? 0;
  if ((atk.hitMask[def.id] & (1 << g)) !== 0) return false;
  if (def.state === 'ko' || def.id === atk.id || world.shielded(atk.id, def.id)) return false;
  if (hb.throw) return def.grabbedBy === atk.id;
  if (def.state === 'grabbed') return false; // grabbed fighters can only be hit by their captor's throw
  if (def.invuln > 0) return false;
  return true;
}

/** Frames of recoil when an attack is stopped by a clank. */
export const REBOUND_FRAMES = 14;
const rC = [0, 0, 0, 0];

/** First live, hitting (not grab / throw) hitbox of `f`'s move that overlaps rect `r`, else null. */
function liveBoxOver(f: Fighter, r: number[]): HitboxDef | null {
  const m = f.move!;
  for (const hb of m.hitboxes) {
    if (hb.grab || hb.throw || !hitboxActive(f, m, hb)) continue;
    hitboxRect(f, hb, rC);
    if (overlap(rC, r)) return hb;
  }
  return null;
}

/**
 * Clank: two grounded attacks whose hitboxes meet cancel each other out with a spark (both rebound) unless one is clearly
 * stronger (TRADE_THRESHOLD), in which case only the weaker one is stopped. Aerials and teammates never clank.
 */
function resolveClanks(world: World): void {
  const fs = world.fighters;
  for (let i = 0; i < fs.length; i++) {
    const a = fs[i];
    if (a.state !== 'attack' || !a.move || !a.grounded || a.hitlag > 0 || a.move.kind === 'grab' || a.move.kind === 'throw') continue;
    for (let j = i + 1; j < fs.length; j++) {
      if (!a.move || a.state !== 'attack') break; // a was stopped by an earlier clank this tick
      const b = fs[j];
      if (b.state !== 'attack' || !b.move || !b.grounded || b.hitlag > 0 || b.move.kind === 'grab' || b.move.kind === 'throw' || world.allied(a.id, b.id)) continue;
      if ((a.hitMask[b.id] & 0xff) !== 0 || (b.hitMask[a.id] & 0xff) !== 0) continue; // already connected this move
      let hbA: HitboxDef | null = null;
      let hbB: HitboxDef | null = null;
      for (const hb of b.move.hitboxes) {
        if (hb.grab || hb.throw || !hitboxActive(b, b.move, hb)) continue;
        hitboxRect(b, hb, rB);
        hbA = liveBoxOver(a, rB);
        if (hbA) {
          hbB = hb;
          break;
        }
      }
      if (!hbA || !hbB) continue;
      const dA = hbA.damage * a.outMul * a.moveStale;
      const dB = hbB.damage * b.outMul * b.moveStale;
      const diff = dA - dB;
      const stopA = diff < TRADE_THRESHOLD;
      const stopB = -diff < TRADE_THRESHOLD;
      if (stopA) rebound(a, b);
      if (stopB) rebound(b, a);
      a.hitlag = Math.max(a.hitlag, 6);
      b.hitlag = Math.max(b.hitlag, 6);
      world.emit('clank', a, (a.x + b.x) / 2, Math.min(a.y, b.y) - Math.min(a.h, b.h) * 0.55, Math.max(dA, dB), stopA && stopB ? 2 : 1);
    }
  }
}

/** The attack is knocked back: the move ends, a short recoil, a little pushback. */
function rebound(f: Fighter, other: Fighter): void {
  f.hitMask[other.id] = 0xff; // this attack can no longer hit the fighter it clanked with
  f.rebound(REBOUND_FRAMES, f.x === other.x ? -f.facing : f.x > other.x ? 1 : -1);
}

/**
 * Collect every hit that connects this tick, resolve simultaneous-hit trades, then apply them.
 * Deterministic: attackers are processed in id order.
 */
export function resolveCombat(world: World): void {
  count = 0;
  const fs = world.fighters;
  trackMoveStarts(fs);
  resolveClanks(world);
  for (const atk of fs) {
    const m = atk.move;
    if (atk.state !== 'attack' || !m || atk.hitlag > 0) continue;
    for (const def of fs) {
      if (def === atk) continue;
      hurtRect(def, rB);
      let hb0: HitboxDef | null = null;
      for (const hb of m.hitboxes) {
        if (!hitboxActive(atk, m, hb) || !canHit(world, atk, def, hb)) continue;
        hitboxRect(atk, hb, rA);
        if (!overlap(rA, rB)) continue;
        addCandidate(atk, def, hb, m, false);
        hb0 = hb;
        break; // first overlapping hitbox in the list has priority
      }
      if (hb0 === null) {
        // point blank: the rival stands inside the attacker, between its body centre and the hitbox
        const inner = innerBoxOver(atk, m, def, rB);
        if (inner && canHit(world, atk, def, inner)) addCandidate(atk, def, inner, m, true);
      }
    }
  }

  // trades: A hits B while B hits A on the same tick
  for (let i = 0; i < count; i++) {
    const a = pool[i];
    if (!a.alive || a.hb.grab || a.hb.throw) continue;
    for (let j = i + 1; j < count; j++) {
      const b = pool[j];
      if (!b.alive || b.hb.grab || b.hb.throw) continue;
      if (a.atk !== b.def || a.def !== b.atk) continue;
      const diff = a.damage - b.damage;
      if (diff >= TRADE_THRESHOLD) b.alive = false; // stronger move cleanly beats the weaker one
      else if (-diff >= TRADE_THRESHOLD) a.alive = false;
      else world.emit('trade', a.atk, (a.atk.x + b.atk.x) / 2, a.atk.y - a.atk.h / 2, 0, 0);
    }
  }

  for (let i = 0; i < count; i++) {
    const c = pool[i];
    if (c.alive) applyHit(world, c);
  }
}

function addCandidate(atk: Fighter, def: Fighter, hb: HitboxDef, m: MoveDef, inner: boolean): void {
  if (count >= MAX_CANDIDATES) return;
  const c = pool[count++];
  c.atk = atk;
  c.def = def;
  c.hb = hb;
  c.move = m;
  c.damage = hb.damage * atk.outMul * atk.moveStale * damageCharge(atk, m);
  c.alive = true;
  c.inner = inner;
}

/** Move kinds whose hitboxes reach back to the body centre at point blank (not specials, throws or ultimates: they keep their exact shapes). */
const INNER_KINDS: ReadonlySet<MoveDef['kind']> = new Set<MoveDef['kind']>(['jab', 'tilt', 'smash', 'dashAttack', 'aerial', 'grab']);
/** A hitbox whose near edge is at most this far from the attacker's centre gets an inner part (disjointed far pokes stay disjointed). */
export const INNER_MAX_GAP = 22;
/** A lunging move's inner part also trails behind the centre by the ground it covered since it started, up to this far: the lunge runs through a rival standing inside it and still catches them. */
export const LUNGE_INNER_BACK = 16;
const rI = [0, 0, 0, 0];

/** Where each fighter's current move started (x), to know how far a lunge has carried it. */
const moveStart = new WeakMap<Fighter, { move: MoveDef | null; frame: number; x: number }>();

function trackMoveStarts(fs: readonly Fighter[]): void {
  for (const f of fs) {
    let s = moveStart.get(f);
    if (!s) {
      s = { move: null, frame: 0, x: f.x };
      moveStart.set(f, s);
    }
    if (f.move !== s.move || f.moveFrame < s.frame) s.x = f.x;
    s.move = f.move;
    s.frame = f.moveFrame;
  }
}

/** Forward distance the fighter has travelled since its current move started (0 if it went backwards). */
function lungeDistance(f: Fighter): number {
  const s = moveStart.get(f);
  return s && s.move === f.move ? Math.max(0, Math.min(LUNGE_INNER_BACK, (f.x - s.x) * f.facing)) : 0;
}

/**
 * Inner part of a melee hitbox: the strip from the attacker's body centre to the box's near edge, at the box's height. Two
 * bodies standing inside each other would otherwise both swing past (every box starts in front of the body). Writes the rect
 * into `out`; returns false when the box has no inner part (it already covers the centre, travels, or is far disjointed).
 */
export function innerRect(f: Fighter, m: MoveDef, hb: HitboxDef, out: number[]): boolean {
  if (hb.travel || hb.throw || !INNER_KINDS.has(m.kind)) return false;
  hitboxRect(f, hb, out);
  const back = lungeDistance(f);
  const left = out[0];
  const right = out[0] + out[2];
  if (left > f.x) {
    // box in front of the body (facing right, or a back hit while facing left)
    if (left - f.x > INNER_MAX_GAP) return false;
    const from = f.x - (f.facing === 1 ? back : 0);
    out[0] = from;
    out[2] = left - from;
    return true;
  }
  if (right < f.x) {
    if (f.x - right > INNER_MAX_GAP) return false;
    const to = f.x + (f.facing === -1 ? back : 0);
    out[0] = right;
    out[2] = to - right;
    return true;
  }
  return false;
}

/** Nearest live hitbox of `m` whose inner part overlaps rect `r` (the rival's hurtbox), else null. Writes that inner rect into rA. */
function innerBoxOver(atk: Fighter, m: MoveDef, def: Fighter, r: number[]): HitboxDef | null {
  let best: HitboxDef | null = null;
  let bestGap = Infinity;
  for (const hb of m.hitboxes) {
    if (!hitboxActive(atk, m, hb) || !innerRect(atk, m, hb, rI) || !overlap(rI, r)) continue;
    if (hb.grab && def.grounded !== atk.grounded) continue;
    const gap = rI[2];
    if (gap < bestGap) {
      bestGap = gap;
      best = hb;
    }
  }
  return best;
}

function damageCharge(atk: Fighter, m: MoveDef): number {
  return m.charge ? 1 + (m.charge.damageMult - 1) * atk.chargeFrac : 1;
}

function applyHit(world: World, c: Candidate): void {
  const { atk, def, hb, move } = c;
  const g = hb.group ?? 0;
  atk.hitMask[def.id] |= 1 << g;
  if (hb.rehit) atk.rehit[def.id * MAX_GROUPS + g] = hb.rehit;
  if (!atk.moveHit) atk.pushStale(move.id); // stale-move negation: the move connected
  atk.moveHit = true;
  const midY = def.y - def.h / 2;

  // --- grabs ---
  if (hb.grab) {
    if (def.state === 'hitstun' || def.state === 'ledge') return;
    // simultaneous mutual grabs: whichever candidate applies first wins; the other attacker was grabbed this very tick
    if (atk.state !== 'attack' || def.state === 'grabbed' || def.state === 'holding') return;
    if (hb.cinematic && move.cinematic) {
      if (world.cinematic) return; // only one cutscene at a time: a second simultaneous ultimate grab simply whiffs
      world.startCinematic(atk, def, move);
      return;
    }
    atk.grabVictim(def);
    def.x = atk.x + atk.facing * GRAB_DISTANCE;
    def.y = atk.y;
    def.facing = (-atk.facing) as 1 | -1;
    world.emit('grab', def, def.x, midY, 0, 0);
    atk.data.behavior?.onGrab?.(atk, def, world);
    atk.grabMove = move.id;
    if (hb.thenMove) atk.startMove(hb.thenMove, null, world); // command grab: slam straight away
    return;
  }

  const away: 1 | -1 = def.x === atk.x ? atk.facing : def.x > atk.x ? 1 : -1;
  const kbMult = (move.charge ? 1 + ((move.charge.kbMult ?? 1) - 1) * atk.chargeFrac : 1) * atk.kbMult * atk.rage;

  // --- throws: victim is already held; release and launch ---
  if (hb.throw) {
    const direction: 1 | -1 = hb.dir === 'away' ? away : atk.facing;
    def.releaseGrab();
    def.grabbedBy = -1;
    def.lastHitMove = move.hidden && atk.grabMove ? atk.grabMove : move.id; // a command grab's own slam counts as the grab
    def.receiveHit({ damage: c.damage, base: hb.base, scaling: hb.scaling, angle: hb.angle, direction, moveWeight: hb.weight, hitlag: 0, attackerId: atk.id, kbMult }, world);
    def.lastHitFx = hb.fx ?? '';
    atk.grabTarget = -1;
    atk.gainMeter(c.damage, world);
    atk.gainResourcesDealt(c.damage);
    atk.data.behavior?.onHitDealt?.(atk, def, hb, c.damage, world);
    // a throw's own status (a soaking / chilling throw) sticks after the hooks, so a wring-out bonus spends only the old soak
    if (hb.status) def.applyStatus(hb.status, world);
    world.emit('throw', def, def.x, midY, 0, c.damage);
    atk.data.behavior?.onThrow?.(atk, def, world);
    return;
  }

  if (!c.inner || !innerRect(atk, move, hb, rA)) hitboxRect(atk, hb, rA);
  deliverHit(world, { atk, ownerId: atk.id, def, hb, damage: c.damage, facing: atk.facing, originX: atk.x, kbMult, rect: rA });
}

/** Everything needed to land one hit, whatever produced it (a fighter's hitbox, a projectile, a trap). */
export interface HitDelivery {
  /** The fighter that owns the hit (receives hitlag / meter / hooks). Null if the owner is gone. */
  atk: Fighter | null;
  ownerId: number;
  def: Fighter;
  hb: HitboxDef;
  damage: number;
  facing: 1 | -1;
  /** X of the hit source, used for `dir: 'away'`. */
  originX: number;
  kbMult: number;
  /** Projectiles / traps do not freeze their owner. */
  freezeOwner?: boolean;
  /** World rect [x, y, w, h] of the hitting box. When given, a shield only blocks the hit if the box touches the bubble. */
  rect?: readonly number[];
  /** Move the hit is credited to (default: the attacker's current move; projectiles pass the move that fired them). */
  source?: string;
}

/** Does the hit rect touch the defender's shield bubble (the circle the view draws: body centre, `shieldRadius`)? */
export function hitsShieldBubble(def: Fighter, r: readonly number[]): boolean {
  const cx = def.x;
  const cy = def.y - def.h / 2;
  const nx = Math.max(r[0], Math.min(cx, r[0] + r[2]));
  const ny = Math.max(r[1], Math.min(cy, r[1] + r[3]));
  const rad = def.shieldRadius;
  return (nx - cx) * (nx - cx) + (ny - cy) * (ny - cy) <= rad * rad;
}

/** Shield -> armor -> clean-hit resolution shared by every hit source. */
export function deliverHit(world: World, d: HitDelivery): void {
  const { atk, def, hb } = d;
  const midY = def.y - def.h / 2;
  const away: 1 | -1 = def.x === d.originX ? d.facing : def.x > d.originX ? 1 : -1;
  const direction: 1 | -1 = hb.dir === 'away' ? away : d.facing;
  const hl = Math.round(Math.min(HITLAG_MAX, (d.damage * HITLAG_PER_DAMAGE + HITLAG_BASE + Math.max(0, d.damage - HEAVY_FREEZE_FROM) * HEAVY_FREEZE_PER_DAMAGE) * (hb.hitlag ?? 1)));
  const owner = d.freezeOwner === false ? null : atk;
  // a hit that slips past a shrunken bubble (a poke at the feet / head) is not blocked at all
  const covered = !d.rect || hitsShieldBubble(def, d.rect);

  // --- counter: a hit into a counter window is absorbed and answered ---
  const cm = def.move;
  if (def.state === 'attack' && cm?.counter && def.moveFrame >= cm.counter.from && def.moveFrame <= cm.counter.to && !hb.grab && !hb.throw) {
    const c = cm.counter;
    const fromX = def.x;
    const fromY = def.y;
    if (c.behind && atk && d.freezeOwner !== false) {
      // reappear just behind the attacker, facing its back
      def.x = atk.x - atk.facing * (atk.hw * atk.sizeMul + def.hw + 6);
      def.y = atk.grounded ? atk.y : def.y;
      def.facing = atk.facing;
    } else if (atk) def.facing = atk.x >= def.x ? 1 : -1;
    if (owner) owner.hitlag = Math.max(owner.hitlag, COUNTER_FREEZE);
    def.invuln = Math.max(def.invuln, 8);
    world.emit('counter', def, fromX, fromY - def.h / 2, d.damage, atk?.id ?? -1);
    def.startMove(c.into, null, world);
    return;
  }

  // --- perfect shield: a shield raised in the last few frames deflects the hit for free ---
  if (def.state === 'shield' && def.parryFrames > 0 && !hb.unblockable && covered) {
    def.parryCount++;
    def.hitlag = 2;
    def.vx = 0;
    if (owner) {
      owner.hitlag = hl + PARRY_HITLAG;
      if (owner.grounded) owner.vx = -away * 2.2;
    }
    world.emit('parry', def, def.x, midY, def.shieldRadius, d.damage);
    def.data.behavior?.onParry?.(def, atk, world);
    return;
  }

  // --- shield ---
  if ((def.state === 'shield' || def.state === 'shieldstun') && !hb.unblockable && covered) {
    const aerial = !!atk && d.freezeOwner !== false && atk.move?.kind === 'aerial';
    def.shieldHit(d.damage, !!hb.breaksShield, hb.shieldDamage ?? 1, away, world, aerial);
    def.hitlag = Math.round(hl * 0.8);
    if (owner) {
      owner.hitlag = Math.round(hl * 0.8);
      if (owner.grounded) owner.vx = -away * 1.2;
    }
    world.emit('shieldHit', def, def.x, midY, def.shieldRadius, d.damage);
    def.data.behavior?.onShieldHit?.(def, atk, d.damage, world);
    return;
  }

  // --- armor ---
  const armor = def.armorThreshold(d.freezeOwner === false);
  if (armor >= 0 && d.damage <= armor) {
    def.damage += d.damage;
    def.hitlag = Math.round(hl * 0.6);
    if (owner) owner.hitlag = hl;
    def.lastHitBy = d.ownerId;
    def.gainMeterTaken(d.damage);
    def.gainResourcesTaken(d.damage);
    def.data.behavior?.onHitTaken?.(def, atk, d.damage, world);
    world.emit('armorHit', def, def.x, midY, d.damage, d.damage);
    // lingering statuses still stick to an armored body (control effects like stun and freeze do not, see Fighter.absorbing)
    def.absorbing = true;
    if (hb.status && (hb.status.type === 'chill' || hb.status.type === 'burn' || hb.status.type === 'soak')) def.applyStatus(hb.status, world);
    if (atk) {
      // the hit still connected: it feeds the attacker's meter, resources and hooks, and counts as landed for cancels
      if (d.freezeOwner !== false) atk.moveLanded = true;
      atk.gainMeter(d.damage, world);
      atk.gainResourcesDealt(d.damage);
      atk.data.behavior?.onHitDealt?.(atk, def, hb, d.damage, world);
    }
    def.absorbing = false;
    return;
  }

  // --- clean hit ---
  def.lastHitMove = d.source ?? (d.freezeOwner === false ? '' : (atk?.move?.id ?? ''));
  // momentum: a body moving into its own melee hit (a dash attack, a drifting aerial) carries part of its speed into the launch
  let carryVx = 0;
  if (atk && d.freezeOwner !== false && atk.vx * direction > MOMENTUM_MIN) {
    carryVx = Math.min(MOMENTUM_MAX, (atk.vx * direction - MOMENTUM_MIN) * MOMENTUM_CARRY) * direction;
  }
  def.receiveHit(
    { damage: d.damage, base: hb.base, scaling: hb.scaling, angle: hb.angle, direction, moveWeight: hb.weight, hitlag: hl, minHitstun: hb.minHitstun, setKb: hb.setKb, kbMult: d.kbMult, attackerId: d.ownerId, carryVx: hb.setKb !== undefined ? 0 : carryVx },
    world,
  );
  def.lastHitFx = hb.fx ?? '';
  if (hb.status) def.applyStatus(hb.status, world);
  if (owner) owner.hitlag = hl;
  if (atk) {
    if (d.freezeOwner !== false) atk.moveLanded = true; // melee, not projectiles or traps
    atk.gainMeter(d.damage, world);
    atk.gainResourcesDealt(d.damage);
    atk.data.behavior?.onHitDealt?.(atk, def, hb, d.damage, world);
  }
}
