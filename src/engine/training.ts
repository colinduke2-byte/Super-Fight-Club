import type { FighterInput } from './buttons';
import { CRATE, ITEM_KINDS, type ItemKind } from './items';
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

// =============================================================================================
// Training menu options: dummy behaviour, DI / tech, % lock, speed, readouts. Pure state + per-tick logic, so the
// menu, the scene and the tests share one implementation. The options object lives at module level: it survives a
// scene restart (picking another dummy fighter or stage restarts the match).
// =============================================================================================

export const DUMMY_BEHAVIOURS = ['stand', 'crouch', 'shield', 'jump', 'cpu', 'record', 'playback'] as const;
export type DummyBehaviour = (typeof DUMMY_BEHAVIOURS)[number];
export const DI_OPTIONS = ['none', 'in', 'out', 'up', 'down', 'random'] as const;
export type DiOption = (typeof DI_OPTIONS)[number];
export const TECH_OPTIONS = ['none', 'in place', 'roll', 'random'] as const;
export type TechOption = (typeof TECH_OPTIONS)[number];
/** Game speed steps: 1x, 1/2, 1/4, frame step (advance with the step key). */
export const SPEEDS = ['1x', '1/2', '1/4', 'frame step'] as const;
export type SpeedOption = (typeof SPEEDS)[number];

export interface TrainingOptions {
  behaviour: DummyBehaviour;
  /** CPU skill when the behaviour is 'cpu' (1-9). */
  cpuLevel: number;
  di: DiOption;
  tech: TechOption;
  /** Dummy percent held at `percent` whenever the dummy is free to act. */
  lockPercent: boolean;
  percent: number;
  speed: SpeedOption;
  hitboxes: boolean;
  inputDisplay: boolean;
  comboCounter: boolean;
}

export function defaultTrainingOptions(): TrainingOptions {
  return { behaviour: 'stand', cpuLevel: 3, di: 'none', tech: 'none', lockPercent: false, percent: 0, speed: '1x', hitboxes: false, inputDisplay: true, comboCounter: true };
}

/** The live options (kept across restarts of the match scene). */
export const trainingOptions: TrainingOptions = defaultTrainingOptions();

/** Steps a value through a list (wrapping). */
export function cycle<T>(list: readonly T[], cur: T, dir: number): T {
  const i = Math.max(0, list.indexOf(cur));
  return list[(((i + dir) % list.length) + list.length) % list.length];
}

/** Ticks of dummy input the recorder holds (10 s at 60 Hz). */
export const RECORD_MAX = 600;

/** Records a fighter's inputs (stick + held buttons) and plays them back in a loop with fresh press / release edges. */
export class InputRecording {
  private sx = new Float32Array(RECORD_MAX);
  private sy = new Float32Array(RECORD_MAX);
  private held = new Uint8Array(RECORD_MAX);
  length = 0;
  private cursor = 0;
  private prev = 0;

  clear(): void {
    this.length = 0;
    this.cursor = 0;
    this.prev = 0;
  }

  /** Appends one tick; returns false once full. */
  record(inp: FighterInput): boolean {
    if (this.length >= RECORD_MAX) return false;
    this.sx[this.length] = inp.stickX;
    this.sy[this.length] = inp.stickY;
    this.held[this.length] = inp.held & 0x7f; // never Pause
    this.length++;
    return this.length < RECORD_MAX;
  }

  rewind(): void {
    this.cursor = 0;
    this.prev = 0;
  }

  /** Writes the next recorded tick into `out` (loops). Returns false when there is nothing recorded. */
  play(out: FighterInput): boolean {
    if (!this.length) return false;
    if (this.cursor >= this.length) {
      this.cursor = 0;
    }
    const i = this.cursor++;
    out.stickX = this.sx[i];
    out.stickY = this.sy[i];
    const held = this.held[i];
    out.held = held;
    out.pressed = held & ~this.prev;
    out.released = ~held & this.prev & 0xff;
    this.prev = held;
    return true;
  }

  get seconds(): number {
    return this.length / 60;
  }
}

/** Fighter states a fighter can act out of (used for the frame-advantage readout). */
const ACTIONABLE = new Set<Fighter['state']>(['idle', 'run', 'crouch', 'dash', 'air', 'shield', 'ledge']);

export function isActionable(f: Fighter): boolean {
  return f.hitlag === 0 && ACTIONABLE.has(f.state) && !f.helpless;
}

/**
 * The dummy's reactions layered over its behaviour input: directional influence while it is launched and a tech press
 * just before it slams into the floor. `rnd` decides the random options (seeded by the caller for repeatability).
 */
export function applyDummyReactions(d: Fighter, attacker: Fighter, opts: TrainingOptions, world: World, out: FighterInput, rnd: () => number, memo: { randDi: DiOption; randTech: TechOption; wasHit: boolean }): void {
  const hit = d.state === 'hitstun' || (d.hitlag > 0 && d.state !== 'attack');
  if (hit && !memo.wasHit) {
    // a fresh hit rolls the random choices once (a whole launch keeps one DI and one tech plan)
    memo.randDi = DI_OPTIONS[1 + Math.floor(rnd() * 4)];
    memo.randTech = TECH_OPTIONS[Math.floor(rnd() * 3)];
  }
  memo.wasHit = hit;
  if (!hit) return;
  const di = opts.di === 'random' ? memo.randDi : opts.di;
  const away = d.x >= attacker.x ? 1 : -1;
  out.stickX = di === 'in' ? -away : di === 'out' ? away : 0;
  out.stickY = di === 'up' ? -1 : di === 'down' ? 1 : 0;
  const tech = opts.tech === 'random' ? memo.randTech : opts.tech;
  if (tech === 'none' || d.state !== 'hitstun' || d.grounded || d.vy <= 0) return;
  // the floor under the dummy: press Shield a few ticks before the impact (inside the tech window)
  let floor = Infinity;
  for (const p of world.platforms) {
    if (d.x < p.x || d.x > p.right || p.top < d.y - 1) continue;
    floor = Math.min(floor, p.top);
  }
  const ticks = (floor - d.y) / Math.max(0.5, d.vy);
  if (ticks <= 6) {
    out.held |= 0x08; // Button.Shield
    out.pressed |= 0x08;
    if (tech === 'roll') out.stickX = rnd() < 0.5 ? -1 : 1;
    else out.stickX = 0;
  }
}

/** Combo counter and frame-advantage readout for hits / blocked hits the player lands on the dummy. */
export class ComboTracker {
  hits = 0;
  damage = 0;
  best = 0;
  /** Frame advantage of the last hit or blocked hit (+ = player acts first); null while measuring / none yet. */
  advantage: number | null = null;
  /** 'hit' or 'block' for the last advantage. */
  advKind: 'hit' | 'block' = 'hit';
  private measuring = false;
  private pFrames = -1;
  private dFrames = -1;
  private t = 0;

  constructor(
    private readonly player: Fighter,
    private readonly dummy: Fighter,
  ) {}

  onEvent(type: WorldEventType, f: Fighter, extra: number): void {
    if (f !== this.dummy || (type !== 'hit' && type !== 'shieldHit')) return;
    if (type === 'hit' && this.dummy.lastHitBy !== this.player.id) return;
    if (type === 'hit') {
      const combo = Math.max(1, this.dummy.comboHits);
      if (combo <= 1) {
        this.hits = 1;
        this.damage = extra;
      } else {
        this.hits = combo;
        this.damage += extra;
      }
      this.best = Math.max(this.best, this.hits);
    }
    this.advKind = type === 'hit' ? 'hit' : 'block';
    this.measuring = true;
    this.pFrames = this.dFrames = -1;
    this.t = 0;
  }

  /** Once per sim tick (after the world step or right before the next one). */
  tick(): void {
    if (!this.measuring) return;
    this.t++;
    if (this.pFrames < 0 && isActionable(this.player)) this.pFrames = this.t;
    if (this.dFrames < 0 && (isActionable(this.dummy) || this.dummy.state === 'downed')) this.dFrames = this.t;
    if (this.pFrames >= 0 && this.dFrames >= 0) {
      this.advantage = this.dFrames - this.pFrames;
      this.measuring = false;
    } else if (this.t > 240) this.measuring = false;
  }

  reset(): void {
    this.hits = this.damage = 0;
    this.advantage = null;
    this.measuring = false;
  }

  lines(): string[] {
    const out = [`COMBO ${this.hits} HIT${this.hits === 1 ? '' : 'S'}  ${this.damage.toFixed(1)}%  BEST ${this.best}`];
    if (this.advantage !== null) out.push(`FRAME ADV ON ${this.advKind.toUpperCase()}: ${this.advantage > 0 ? '+' : ''}${this.advantage}`);
    else if (this.measuring) out.push('FRAME ADV: ...');
    return out;
  }
}

/** Saved positions of both fighters (save / restore state). */
export interface SavedFighter {
  x: number;
  y: number;
  facing: 1 | -1;
  damage: number;
  grounded: boolean;
}

export function saveFighter(f: Fighter): SavedFighter {
  return { x: f.x, y: f.y, facing: f.facing, damage: f.damage, grounded: f.grounded };
}

export function restoreFighter(f: Fighter, s: SavedFighter, world: World): void {
  const plat = s.grounded ? world.platforms.find((p) => s.x >= p.x && s.x <= p.right && Math.abs(p.top - s.y) < 2) : undefined;
  f.facing = s.facing;
  if (plat) f.standOn(plat, s.x);
  else f.spawn(s.x, s.y, s.facing);
  f.facing = s.facing;
  f.damage = s.damage;
  f.invuln = 0;
  f.hitlag = 0;
  f.hover = false;
  f.helpless = false;
  f.snapped = true;
}

/**
 * Training: drops an item of `kind` at (x, y) into the world's item pool (the oldest live one makes way when the pool is
 * full). Returns false if the kind is unknown. Uses the same reset a natural spawn does, so the item behaves normally.
 */
export function spawnItem(world: World, kind: ItemKind, x: number, y: number): boolean {
  if (!ITEM_KINDS.includes(kind)) return false;
  const items = world.items;
  let slot = items.find((it) => !it.active);
  if (!slot) slot = items.reduce((a, b) => (b.age > a.age ? b : a), items[0]);
  if (!slot) return false;
  Object.assign(slot, {
    active: true,
    kind,
    thrown: false,
    owner: -1,
    vx: 0,
    vy: 0,
    spin: 0,
    fuse: 0,
    knockedBy: -1,
    knockGrace: 0,
    knockCd: 0,
    pickDelay: 0,
    age: 0,
    resting: false,
    hp: kind === 'crate' ? CRATE.hp : 0,
    volatile: false,
    primed: false,
    spent: false,
    x,
    y,
  });
  world.emit('itemSpawn', world.fighters[0], x, y, ITEM_KINDS.indexOf(kind), 0);
  return true;
}

/** Display names of the item kinds (training menu). */
export const ITEM_NAMES: Record<ItemKind, string> = {
  heal: 'HEALING ORB',
  cell: 'METER CELL',
  boost: 'SPEED BOOST',
  bomb: 'SHOCK BOMB',
  aegis: 'AEGIS',
  sword: 'BEAM SWORD',
  raygun: 'RAY GUN',
  crate: 'CRATE',
  core: 'ULTIMATE CORE',
  bat: 'HOME-RUN BAT',
  mine: 'PROXIMITY MINE',
  drone: 'ASSIST DRONE',
};
