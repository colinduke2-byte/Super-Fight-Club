import type { FighterInput } from './buttons';
import type { Fighter } from './fighter';
import { hitboxFrames, moveTotal, type MoveDef } from './moves';
import { hitstunFrames } from './knockback';
import type { World, WorldEventType } from './world';

/** One practice setup per move: where to stand, where the dummy goes, how to trigger the move. */
export interface MoveScenario {
  index: number;
  moveId: string;
  label: string;
  /** Player starts in the air (aerials, recoveries). */
  air: boolean;
  /** Gravity off for both fighters until the dummy is hit (so long aerials can be inspected in place). */
  hover: boolean;
  playerX: number;
  playerY: number;
  playerFacing: 1 | -1;
  dummyX: number;
  dummyY: number;
  dummyPercent: number;
  stickX: number;
  stickY: number;
  /** Fill the ultimate meter first. */
  fillMeter: boolean;
  /** Throws need a grab first. */
  needsGrab: boolean;
  /** Resource the move is gated on (Heat for Vent): the scenario tops it up so the move can be demonstrated. */
  requires: { key: string; min: number } | null;
}

const GROUND_X = -40;
const NO_HITBOX_GAP = 110;

function stickFor(id: string): [number, number] {
  if (id === 'sideB') return [1, 0];
  if (id === 'upB') return [0, -1];
  if (id === 'downB') return [0, 1];
  return [0, 0];
}

function isRecovery(m: MoveDef): boolean {
  return m.id === 'upB' || !!m.events?.some((e) => e.action === 'tether' || e.action === 'ledgeSnap');
}

const KIND_ORDER = ['jab', 'tilt', 'dashAttack', 'smash', 'aerial', 'grab', 'throw', 'special', 'ultimate'];

/** Build one scenario per move of the given fighter's character, ordered by move kind. */
export function buildScenarios(f: Fighter): MoveScenario[] {
  const moves = Object.values(f.data.moves).filter((m) => !m.hidden).sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind));
  return moves.map((m, index) => {
    const hb = m.hitboxes.find((h) => !h.grab && !h.throw) ?? m.hitboxes[0];
    const aerial = m.kind === 'aerial';
    const recovery = isRecovery(m);
    const [sx, sy] = stickFor(m.id);
    let dummyX = GROUND_X + NO_HITBOX_GAP;
    if (hb) {
      const reach = hb.window || hb.travel ? hb.x + (hb.travel ? hb.travel.vx * Math.min(6, m.active) : 0) : hb.x;
      // moves that lunge before they become active (Charge Shoulder, Grapple Slam) need the dummy further out
      const activeStart = m.startup + 1;
      const lunge = (m.motion ?? []).reduce((sum, mv) => sum + (mv.vx && mv.frame < activeStart ? mv.vx * (activeStart - mv.frame) * 0.6 : 0), 0);
      dummyX = GROUND_X + (Math.abs(reach) < 12 ? 14 : reach) + lunge;
    }
    let playerX = GROUND_X;
    let playerY = 0;
    let dummyY = 0;
    let hover = false;
    if (aerial) {
      playerY = -60;
      dummyY = -60;
      hover = !m.landBounce;
      if (m.landBounce) {
        playerY = -75;
        dummyY = 0;
        dummyX = playerX;
      }
    }
    if (recovery) {
      playerX = -200;
      playerY = 30;
      dummyX = playerX + NO_HITBOX_GAP;
      dummyY = 0;
      hover = false;
    }
    return {
      index,
      moveId: m.id,
      label: `${m.name} (${m.id})`,
      air: aerial || recovery,
      hover,
      playerX,
      playerY,
      playerFacing: 1 as const,
      dummyX,
      dummyY,
      dummyPercent: 40,
      stickX: sx,
      stickY: sy,
      fillMeter: m.kind === 'ultimate',
      needsGrab: m.kind === 'throw',
      requires: m.requires ?? null,
    };
  });
}

export interface HitReport {
  damage: number;
  knockback: number;
  hitstun: number;
}

/**
 * Drives a scenario: resets the practice area, starts the move, and records what the dummy took.
 * The scene calls `step()` once per sim tick before `world.step()` and forwards world events to `onEvent`.
 */
export class TrainingRunner {
  scenarios: MoveScenario[] = [];
  index = 0;
  running = false;
  tick = 0;
  lastHit: HitReport | null = null;
  hits = 0;
  private started = false;
  private idleTicks = 0;

  constructor(
    private readonly world: World,
    private readonly player: Fighter,
    private readonly dummy: Fighter,
  ) {
    this.scenarios = buildScenarios(player);
  }

  get current(): MoveScenario {
    return this.scenarios[this.index];
  }

  get move(): MoveDef {
    return this.player.data.moves[this.current.moveId];
  }

  select(delta: number): void {
    const n = this.scenarios.length;
    this.index = (((this.index + delta) % n) + n) % n;
    this.reset();
  }

  /** Set up positions, percent, meter, clear traps / projectiles. */
  reset(): void {
    const sc = this.current;
    const w = this.world;
    for (const p of w.projectiles) {
      p.deactivate();
      p.exploded = true; // cleared away, not set off: a grenade in flight must not burst on the reset dummy next tick
    }
    for (const d of w.deployables) d.deactivate();
    w.cinematic = null;
    const ground = w.platforms[0];
    this.player.facing = sc.playerFacing;
    this.dummy.facing = (-sc.playerFacing) as 1 | -1;
    if (sc.air) {
      this.player.spawn(sc.playerX, sc.playerY, sc.playerFacing);
    } else {
      this.player.standOn(ground, sc.playerX);
    }
    if (sc.dummyY < 0) this.dummy.spawn(sc.dummyX, sc.dummyY, this.dummy.facing);
    else this.dummy.standOn(ground, sc.dummyX);
    for (const f of [this.player, this.dummy]) {
      f.invuln = 0;
      f.hitlag = 0;
      f.status.burn = f.status.slow = f.status.freeze = f.status.stun = 0;
      f.helpless = false;
    }
    this.player.hover = sc.hover;
    this.dummy.hover = sc.hover;
    this.dummy.damage = sc.dummyPercent;
    this.player.damage = 0;
    this.player.meter = sc.fillMeter ? 100 : this.player.meter;
    if (sc.requires) this.player.res[sc.requires.key] = Math.max(this.player.res[sc.requires.key] ?? 0, 100);
    this.player.snapped = true;
    this.dummy.snapped = true;
    this.running = false;
    this.started = false;
    this.tick = 0;
    this.idleTicks = 0;
    this.lastHit = null;
    this.hits = 0;
  }

  start(): void {
    this.reset();
    this.running = true;
  }

  /** Fills the player's input for this tick (stick held for the move's direction). Returns true while a scenario runs. */
  step(out: FighterInput): boolean {
    if (!this.running) return false;
    const sc = this.current;
    const p = this.player;
    out.stickX = sc.stickX * p.facing;
    out.stickY = sc.stickY;
    this.tick++;
    if (!this.started) {
      this.started = true;
      p.startMove(sc.needsGrab ? 'grab' : sc.moveId, out, this.world);
      return true;
    }
    if (sc.needsGrab && p.state === 'holding') p.startMove(sc.moveId, out, this.world);

    const busy = p.state === 'attack' || p.state === 'holding' || p.state === 'tether' || this.world.cinematic !== null;
    this.idleTicks = busy ? 0 : this.idleTicks + 1;
    if (this.idleTicks > 45 || this.tick > 600) {
      this.running = false;
      p.hover = false;
      this.dummy.hover = false;
    }
    return true;
  }

  onEvent(type: WorldEventType, f: Fighter, _x: number, _y: number, mag: number, extra: number): void {
    if (!this.running || f !== this.dummy) return;
    if (type === 'hit') {
      this.hits++;
      this.lastHit = { damage: extra, knockback: mag, hitstun: hitstunFrames(mag) };
    }
  }

  /** Text lines describing the selected move and the last result. */
  report(): string[] {
    const m = this.move;
    const lines = [`[${this.index + 1}/${this.scenarios.length}] ${m.name} (${m.id})`];
    const first = m.hitboxes.length ? Math.min(...m.hitboxes.map((h) => hitboxFrames(m, h)[0])) : m.startup + 1;
    lines.push(`startup ${m.startup}  active ${m.active}  recovery ${m.recovery}  total ${moveTotal(m)}  first hit f${first}`);
    const hb = m.hitboxes.find((h) => !h.grab);
    if (hb) lines.push(`dmg ${hb.damage}  angle ${hb.angle}  bkb ${hb.base}  kbg ${hb.scaling}${m.charge ? '  (charges)' : ''}`);
    if (m.landingLag) lines.push(`landing lag ${m.landingLag}`);
    if (this.lastHit) lines.push(`LAST HIT: ${this.lastHit.damage.toFixed(1)}%  kb ${this.lastHit.knockback.toFixed(0)}  hitstun ${this.lastHit.hitstun}f  (x${this.hits})`);
    else lines.push(this.running ? 'running...' : 'ENTER = run   [ ] = select');
    return lines;
  }
}
