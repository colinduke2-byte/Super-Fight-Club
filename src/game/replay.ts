import { BossController } from '../ai/boss';
import { BOSSES, CHARACTERS } from '../characters';
import { makeInput, type FighterInput } from '../engine/buttons';
import type { MatchConfig } from '../engine/match';
import { STAGES } from '../stages';
import { sandboxStage } from '../stages/sandbox';
import { targetCourseById } from '../stages/targetCourses';
import { ruledCharacter, ruledStage } from './modifiers';
import { MatchTally, MatchTimeline } from './results';
import { MatchRunner, type RunnerSetup } from './runner';
import { runnerExtras, type MatchRules } from './session';

/** One recorded fighter slot. */
export interface ReplayPlayer {
  character: string;
  palette?: number;
  /** Who played the slot (for the P1 / CPU labels when it is watched back). */
  type?: 'human' | 'cpu';
  /** Starting stocks when the slot had its own (arcade handicaps, the boss, challenges). */
  stocks?: number;
  /** The slot was the boss (its music, label and phase-2 look on playback). */
  boss?: boolean;
}

/** The modes whose matches are recorded (the last one is kept in memory for WATCH REPLAY / the replay vault). */
export type ReplayMode = 'versus' | 'arcade' | 'challenge';

/** Is a match of this mode recorded? (Training, Target Smash, Launch Contest and the attract demo are not.) */
export function recordsReplay(mode: string, demo = false): mode is ReplayMode {
  return !demo && (mode === 'versus' || mode === 'arcade' || mode === 'challenge');
}

/**
 * A finished match as data: the setup plus every fighter's input on every tick. The simulation is deterministic (no Math.random in
 * `src/engine`, seeded item drops), so feeding the same inputs into the same setup reproduces the match exactly.
 */
export interface Replay {
  /** The mode it was played in (absent: versus, older recordings). */
  mode?: ReplayMode;
  stage: string;
  rules: MatchRules;
  players: ReplayPlayer[];
  smashFlick: boolean;
  ticks: number;
  /** Per tick, per fighter: stickX, stickY. */
  sticks: Float64Array;
  /** Per tick, per fighter: held, pressed, released. */
  buttons: Int32Array;
}

/** Collects inputs tick by tick while a match is played. */
export class ReplayRecorder {
  private readonly sticks: number[] = [];
  private readonly buttons: number[] = [];
  private ticks = 0;

  constructor(
    private readonly stage: string,
    private readonly rules: MatchRules,
    private readonly players: ReplayPlayer[],
    private readonly smashFlick: boolean,
    private readonly mode: ReplayMode = 'versus',
  ) {}

  /** Call once per simulation tick, before `world.step`, with the inputs about to be used. */
  record(inputs: FighterInput[]): void {
    for (const i of inputs) {
      this.sticks.push(i.stickX, i.stickY);
      this.buttons.push(i.held, i.pressed, i.released);
    }
    this.ticks++;
  }

  finish(): Replay {
    return {
      mode: this.mode,
      stage: this.stage,
      rules: { ...this.rules },
      players: this.players.map((p) => ({ ...p })),
      smashFlick: this.smashFlick,
      ticks: this.ticks,
      sticks: Float64Array.from(this.sticks),
      buttons: Int32Array.from(this.buttons),
    };
  }
}

/** Writes the recorded inputs of `tick` into `out` (one entry per fighter). Returns false past the end. */
export function fillReplayInputs(r: Replay, tick: number, out: FighterInput[]): boolean {
  if (tick >= r.ticks) return false;
  const n = r.players.length;
  for (let i = 0; i < n; i++) {
    const k = tick * n + i;
    const o = out[i];
    o.stickX = r.sticks[k * 2];
    o.stickY = r.sticks[k * 2 + 1];
    o.held = r.buttons[k * 3];
    o.pressed = r.buttons[k * 3 + 1];
    o.released = r.buttons[k * 3 + 2];
  }
  return true;
}

// ---- game-data version ---------------------------------------------------------------------------------------------

/**
 * Bump when the simulation code changes in a way the fighter and stage data cannot show (physics, the knockback formula,
 * item logic...): every older replay is then marked outdated instead of playing back out of step.
 */
export const REPLAY_ENGINE_REV = 1;

/** Data keys that only change the look or the words (art, poses, effects, names): changing them keeps old replays playable. */
const COSMETIC = new Set(['name', 'tagline', 'difficulty', 'sprite', 'fx', 'persona', 'anim', 'pose', 'view', 'look', 'hud', 'background', 'music', 'blurb', 'portrait', 'colors', 'tint']);

function fnv(h: number, s: string): number {
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0;
  return h;
}

/** Hashes a data tree in a fixed key order (functions by name only, cycles cut, cosmetic keys skipped). */
function hashData(v: unknown, h: number, seen: Set<object>): number {
  if (v === null || v === undefined) return fnv(h, '~');
  const t = typeof v;
  if (t === 'number' || t === 'boolean' || t === 'string') return fnv(h, `${t[0]}${String(v)};`);
  if (t === 'function') return fnv(h, 'f;');
  if (t !== 'object') return h;
  const o = v as object;
  if (seen.has(o)) return fnv(h, '@');
  seen.add(o);
  if (Array.isArray(o) || ArrayBuffer.isView(o)) {
    const a = o as ArrayLike<unknown>;
    h = fnv(h, `[${a.length}`);
    for (let i = 0; i < a.length; i++) h = hashData(a[i], h, seen);
  } else {
    for (const k of Object.keys(o).sort()) {
      if (COSMETIC.has(k)) continue;
      h = fnv(h, `${k}:`);
      h = hashData((o as Record<string, unknown>)[k], h, seen);
    }
  }
  seen.delete(o);
  return h;
}

let dataVersion: string | null = null;

/**
 * The game-data version a replay is stamped with: the engine revision plus a hash of every fighter's and stage's gameplay
 * data. A replay stamped with another version may not play back the same (a move's damage changed, a platform moved), so the
 * vault shows it as outdated and does not play it.
 */
export function replayDataVersion(): string {
  if (dataVersion) return dataVersion;
  let h = 2166136261 >>> 0;
  h = hashData(CHARACTERS, h, new Set());
  h = hashData(BOSSES, h, new Set());
  h = hashData(STAGES, h, new Set());
  dataVersion = `${REPLAY_ENGINE_REV}.${h.toString(36)}`;
  return dataVersion;
}

// ---- metadata ------------------------------------------------------------------------------------------------------

/** What the vault shows about a replay without decoding its inputs. */
export interface ReplayMeta {
  /** When it was played (ms since 1970). */
  date: number;
  mode: ReplayMode;
  stage: string;
  fighters: { character: string; palette: number; type: 'human' | 'cpu'; boss?: boolean }[];
  /** Winner's slot (-1 draw / unknown) and winning team (-1 none). */
  winner: number;
  winnerTeam: number;
  /** One line: "P1 WINS", "TEAM RED WINS", "DRAW". */
  result: string;
  ticks: number;
  /** replayDataVersion() when it was recorded. */
  version: string;
  /** World hash at the last tick (a playback check). */
  endHash?: number;
}

/** Metadata for a replay (`result` from the match result when there is one). */
export function replayMeta(r: Replay, res: { winner: number; winnerTeam: number } | null, date = Date.now(), endHash?: number): ReplayMeta {
  const fighters = r.players.map((p) => ({ character: p.character, palette: p.palette ?? 0, type: p.type ?? ('cpu' as const), ...(p.boss ? { boss: true } : {}) }));
  const winner = res?.winner ?? -1;
  const winnerTeam = res?.winnerTeam ?? -1;
  return { date, mode: r.mode ?? 'versus', stage: r.stage, fighters, winner, winnerTeam, result: resultLine(fighters, winner, winnerTeam), ticks: r.ticks, version: replayDataVersion(), ...(endHash !== undefined ? { endHash } : {}) };
}

const TEAMS = ['BLUE', 'RED', 'GREEN', 'YELLOW'];

/** "P1 WINS" / "CPU WINS" / "TEAM RED WINS" / "DRAW", labelled the way the match labelled its fighters. */
export function resultLine(fighters: readonly { type: 'human' | 'cpu'; boss?: boolean }[], winner: number, winnerTeam: number): string {
  if (winnerTeam >= 0) return `TEAM ${TEAMS[winnerTeam] ?? winnerTeam + 1} WINS`;
  if (winner < 0 || !fighters[winner]) return 'DRAW';
  const f = fighters[winner];
  const cpus = fighters.filter((x) => x.type === 'cpu' && !x.boss).length;
  return `${f.boss ? 'BOSS' : f.type === 'cpu' ? (cpus > 1 ? `CPU${winner + 1}` : 'CPU') : `P${winner + 1}`} WINS`;
}

// ---- binary codec and share codes ----------------------------------------------------------------------------------

const MAGIC = [0x53, 0x46, 0x52]; // "SFR"
const FORMAT = 1;
/** Share-code prefix: compressed (z) or plain (u) bytes, base64url. */
export const SHARE_PREFIX = 'SFCR1';

class Bytes {
  buf = new Uint8Array(1024);
  n = 0;
  private grow(k: number): void {
    if (this.n + k <= this.buf.length) return;
    const b = new Uint8Array(Math.max(this.buf.length * 2, this.n + k));
    b.set(this.buf.subarray(0, this.n));
    this.buf = b;
  }
  byte(v: number): void {
    this.grow(1);
    this.buf[this.n++] = v & 0xff;
  }
  /** Unsigned varint of a zigzagged int32. */
  int(v: number): void {
    let z = ((v << 1) ^ (v >> 31)) >>> 0;
    while (z >= 0x80) {
      this.byte((z & 0x7f) | 0x80);
      z >>>= 7;
    }
    this.byte(z);
  }
  f64(v: number): void {
    this.grow(8);
    new DataView(this.buf.buffer).setFloat64(this.n, v, true);
    this.n += 8;
  }
  raw(b: Uint8Array): void {
    this.grow(b.length);
    this.buf.set(b, this.n);
    this.n += b.length;
  }
  done(): Uint8Array {
    return this.buf.slice(0, this.n);
  }
}

class Reader {
  i = 0;
  private readonly dv: DataView;
  constructor(private readonly b: Uint8Array) {
    this.dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  }
  byte(): number {
    if (this.i >= this.b.length) throw new Error('truncated');
    return this.b[this.i++];
  }
  int(): number {
    let z = 0;
    let s = 0;
    for (;;) {
      const c = this.byte();
      z |= (c & 0x7f) << s;
      if (c < 0x80) break;
      s += 7;
      if (s > 28) throw new Error('bad number');
    }
    z >>>= 0;
    return (z >>> 1) ^ -(z & 1);
  }
  f64(): number {
    if (this.i + 8 > this.b.length) throw new Error('truncated');
    const v = this.dv.getFloat64(this.i, true);
    this.i += 8;
    return v;
  }
  bytes(n: number): Uint8Array {
    if (this.i + n > this.b.length) throw new Error('truncated');
    const out = this.b.subarray(this.i, this.i + n);
    this.i += n;
    return out;
  }
}

/** A stick value: one byte when it is a multiple of 1/127 (keys, d-pads, most of a stick's travel), else the exact double. */
function putStick(w: Bytes, v: number): void {
  const k = Math.round(v * 127);
  if (k >= -127 && k <= 127 && k / 127 === v && !Object.is(v, -0)) w.byte(k + 127);
  else {
    w.byte(255);
    w.f64(v);
  }
}

function getStick(r: Reader): number {
  const k = r.byte();
  return k === 255 ? r.f64() : (k - 127) / 127;
}

/** A replay (and its metadata) as bytes: a JSON header, then per tick and fighter only the input fields that changed. */
export function encodeReplay(r: Replay, meta: ReplayMeta): Uint8Array {
  const w = new Bytes();
  for (const m of MAGIC) w.byte(m);
  w.byte(FORMAT);
  const head = new TextEncoder().encode(JSON.stringify({ meta, mode: r.mode ?? 'versus', stage: r.stage, rules: r.rules, players: r.players, smashFlick: r.smashFlick, ticks: r.ticks }));
  w.int(head.length);
  w.raw(head);
  const n = r.players.length;
  const prev = new Float64Array(n * 5);
  for (let t = 0; t < r.ticks; t++) {
    for (let i = 0; i < n; i++) {
      const k = t * n + i;
      const v = [r.sticks[k * 2], r.sticks[k * 2 + 1], r.buttons[k * 3], r.buttons[k * 3 + 1], r.buttons[k * 3 + 2]];
      let mask = 0;
      for (let j = 0; j < 5; j++) if (!Object.is(v[j], prev[i * 5 + j])) mask |= 1 << j;
      w.byte(mask);
      for (let j = 0; j < 5; j++) {
        if (!(mask & (1 << j))) continue;
        if (j < 2) putStick(w, v[j]);
        else w.int(v[j]);
        prev[i * 5 + j] = v[j];
      }
    }
  }
  return w.done();
}

/** Bytes back into a replay; throws on anything malformed. */
export function decodeReplay(bytes: Uint8Array): { replay: Replay; meta: ReplayMeta } {
  const rd = new Reader(bytes);
  for (const m of MAGIC) if (rd.byte() !== m) throw new Error('not a replay');
  const fmt = rd.byte();
  if (fmt > FORMAT) throw new Error('newer format');
  const head = JSON.parse(new TextDecoder().decode(rd.bytes(rd.int()))) as Record<string, unknown>;
  const players = head.players as ReplayPlayer[];
  const ticks = head.ticks as number;
  if (!Array.isArray(players) || players.length < 1 || players.length > 8 || !Number.isInteger(ticks) || ticks < 0 || ticks > 60 * 60 * 120) throw new Error('bad header');
  for (const p of players) if (!p || typeof p.character !== 'string') throw new Error('bad player');
  if (typeof head.stage !== 'string' || !head.rules || typeof head.rules !== 'object') throw new Error('bad header');
  const n = players.length;
  const sticks = new Float64Array(ticks * n * 2);
  const buttons = new Int32Array(ticks * n * 3);
  const prev = new Float64Array(n * 5);
  for (let t = 0; t < ticks; t++) {
    for (let i = 0; i < n; i++) {
      const mask = rd.byte();
      for (let j = 0; j < 5; j++) if (mask & (1 << j)) prev[i * 5 + j] = j < 2 ? getStick(rd) : rd.int();
      const k = t * n + i;
      sticks[k * 2] = prev[i * 5];
      sticks[k * 2 + 1] = prev[i * 5 + 1];
      buttons[k * 3] = prev[i * 5 + 2];
      buttons[k * 3 + 1] = prev[i * 5 + 3];
      buttons[k * 3 + 2] = prev[i * 5 + 4];
    }
  }
  const mode = (['versus', 'arcade', 'challenge'] as const).find((m) => m === head.mode) ?? 'versus';
  const replay: Replay = { mode, stage: head.stage, rules: head.rules as MatchRules, players, smashFlick: !!head.smashFlick, ticks, sticks, buttons };
  const m = (head.meta ?? {}) as Partial<ReplayMeta>;
  const meta: ReplayMeta = {
    date: typeof m.date === 'number' ? m.date : 0,
    mode,
    stage: replay.stage,
    fighters: players.map((p) => ({ character: p.character, palette: p.palette ?? 0, type: p.type === 'human' ? 'human' : 'cpu', ...(p.boss ? { boss: true } : {}) })),
    winner: typeof m.winner === 'number' ? m.winner : -1,
    winnerTeam: typeof m.winnerTeam === 'number' ? m.winnerTeam : -1,
    result: typeof m.result === 'string' ? m.result.slice(0, 40) : 'DRAW',
    ticks,
    version: typeof m.version === 'string' ? m.version : '?',
    ...(typeof m.endHash === 'number' ? { endHash: m.endHash } : {}),
  };
  return { replay, meta };
}

function toB64(b: Uint8Array): string {
  let s = '';
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64(s: string): Uint8Array {
  const t = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(t + '='.repeat((4 - (t.length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function pipe(b: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const blob = new Blob([b as unknown as BlobPart]);
  const out = await new Response(blob.stream().pipeThrough(stream)).arrayBuffer();
  return new Uint8Array(out);
}

const canCompress = (): boolean => typeof CompressionStream !== 'undefined' && typeof DecompressionStream !== 'undefined' && typeof Response !== 'undefined';

/** A replay as share text: "SFCR1z." + base64url of the deflated bytes (plain bytes where the browser cannot compress). */
export async function toShareCode(r: Replay, meta: ReplayMeta): Promise<string> {
  const bytes = encodeReplay(r, meta);
  if (canCompress()) {
    try {
      return `${SHARE_PREFIX}z.${toB64(await pipe(bytes, new CompressionStream('deflate')))}`;
    } catch {
      /* fall through to plain */
    }
  }
  return `${SHARE_PREFIX}u.${toB64(bytes)}`;
}

export type ShareResult = { ok: true; replay: Replay; meta: ReplayMeta } | { ok: false; error: string };

/** Share text back into a replay (spaces and line breaks from pasting are ignored). */
export async function fromShareCode(text: string): Promise<ShareResult> {
  const t = text.replace(/\s+/g, '');
  if (!t) return { ok: false, error: 'Paste a replay code first.' };
  const m = /^SFCR(\d+)([zu])\.([A-Za-z0-9_-]+)$/.exec(t);
  if (!m) return { ok: false, error: 'That is not a replay code.' };
  if (Number(m[1]) > 1) return { ok: false, error: 'That replay code is from a newer version of the game.' };
  try {
    let bytes = fromB64(m[3]);
    if (m[2] === 'z') {
      if (!canCompress()) return { ok: false, error: 'This browser cannot unpack replay codes.' };
      bytes = await pipe(bytes, new DecompressionStream('deflate'));
    }
    const { replay, meta } = decodeReplay(bytes);
    return { ok: true, replay, meta };
  } catch {
    return { ok: false, error: 'That replay code is damaged or incomplete.' };
  }
}

// ---- headless playback (seeking) -----------------------------------------------------------------------------------

/** Training and Launch Contest config never apply to a replay; this mirrors how the match scene sets up a replay's runner. */
export function replayRunnerSetup(rep: Replay): RunnerSetup {
  const rules = rep.rules;
  const base = STAGES[rep.stage] ?? targetCourseById(rep.stage)?.stage ?? sandboxStage;
  // the same form / hazards / ratio / launch-rate rules the live match was built with
  const stage = ruledStage(base, rules, true);
  const cfg: MatchConfig = { mode: rules.mode, stocks: rules.stocks, timeLimitSec: rules.timeSec, respawnDelay: 70, staminaHp: rules.staminaHp };
  return {
    stage,
    characters: rep.players.map((p, i) => ruledCharacter(p.character, rules, i)),
    rules: cfg,
    stocks: rep.players.map((p) => p.stocks),
    teams: !!rules.teams,
    itemRate: rules.items,
    launch: false,
    targets: false,
    smashFlick: rep.smashFlick,
    ...runnerExtras(rules, rep.players.length),
  };
}

/**
 * A replay played without any presentation, as fast as the machine allows: the same per-tick sequence the match scene runs
 * for a replay (recorded inputs, the boss script running beside them, the rules, the results tally and timeline). Seeking
 * backwards plays a fresh one from the start up to the wanted tick and hands its runner to the scene.
 *
 * (Periodic snapshots would need the whole world cloned, but part of its state lives outside it, in module-level WeakMaps
 * keyed by the world (held items, the next item drop), so a copy cannot be restored faithfully: re-simulation is exact.)
 */
export class ReplaySim {
  readonly runner: MatchRunner;
  readonly tally: MatchTally;
  readonly timeline: MatchTimeline;
  readonly shadows: (BossController | null)[];
  private readonly ins: FighterInput[];
  private readonly scratch = makeInput();

  constructor(
    readonly replay: Replay,
    setup: RunnerSetup = replayRunnerSetup(replay),
  ) {
    const runner = (this.runner = new MatchRunner(setup));
    const n = runner.fighters.length;
    this.tally = new MatchTally(n);
    this.timeline = new MatchTimeline(n);
    this.timeline.start(runner.fighters, runner.match.scores);
    this.shadows = replay.players.map((p, i) => (p.boss ? new BossController(() => runner.match.scores[i].stocks, 1) : null));
    this.ins = runner.fighters.map(() => makeInput());
    this.unsub = runner.subscribe((type, f, _x, _y, _m, extra) => {
      this.tally.onEvent(type, f, extra, runner.fighters, runner.world.cinematic?.attacker.id ?? -1);
      this.timeline.onEvent(type, f, extra, runner.world.tick);
    });
  }

  private unsub: (() => void) | null = null;

  /** Stops feeding the tally and timeline (the scene that adopts this runner feeds them from its own subscription). */
  detach(): void {
    this.unsub?.();
    this.unsub = null;
  }

  get tick(): number {
    return this.runner.world.tick;
  }

  /** One tick. False once the recording has run out. */
  step(): boolean {
    const rn = this.runner;
    if (!fillReplayInputs(this.replay, rn.world.tick, this.ins)) return false;
    replayShadowStep(this.shadows, rn, this.scratch);
    rn.step(this.ins);
    this.tally.step(rn.fighters);
    this.timeline.step(rn.fighters, rn.match.scores, rn.world.tick);
    return true;
  }

  /** Plays up to `tick` (or the end), stopping early after `budgetMs` of work. Returns true once there. */
  runTo(tick: number, budgetMs = Infinity, now: () => number = () => performance.now()): boolean {
    const end = Math.min(tick, this.replay.ticks);
    const t0 = budgetMs < Infinity ? now() : 0;
    let k = 0;
    while (this.runner.world.tick < end) {
      if (!this.step()) return true;
      if (budgetMs < Infinity && (++k & 63) === 0 && now() - t0 > budgetMs) return this.runner.world.tick >= end;
    }
    return true;
  }
}

/** The boss scripts that run beside a replay's recorded inputs (their own inputs thrown away into `scratch`). */
export function replayShadowStep(shadows: readonly (BossController | null)[], rn: MatchRunner, scratch: FighterInput): void {
  for (let i = 0; i < shadows.length; i++) shadows[i]?.update(rn.fighters[i], rn.world, scratch);
}

/** Where a replay being watched was opened from (where EXIT returns to). */
export type ReplayOrigin = 'results' | 'vault';
let origin: ReplayOrigin = 'results';
export function setReplayOrigin(o: ReplayOrigin): void {
  origin = o;
}
export function replayOrigin(): ReplayOrigin {
  return origin;
}
/** The origin for the replay starting now; the next one is from the results again unless set (the match scene calls this once). */
export function takeReplayOrigin(): ReplayOrigin {
  const o = origin;
  origin = 'results';
  return o;
}
