/**
 * Headless CPU-vs-CPU stock matches with KO bookkeeping, shared by the balance report and anyone else who wants to
 * measure how matches actually play out (who wins, how and when fighters die, and why a self-destruct happened).
 */
import { CpuController } from '../../src/ai/cpu';
import type { CpuLevel } from '../../src/ai/profiles';
import { offstage } from '../../src/ai/recovery';
import { CHARACTERS } from '../../src/characters';
import { makeInput } from '../../src/engine/buttons';
import { Fighter } from '../../src/engine/fighter';
import { Match } from '../../src/engine/match';
import { World } from '../../src/engine/world';
import { STAGE_LIST, STAGES } from '../../src/stages';

export type KoDir = 'top' | 'side' | 'bottom';

/**
 * A KO with no hit taken within this many ticks counts as a self-destruct when the fighter never stood on the stage (or hung
 * on a ledge) since that hit. A fighter that was safe again after its last hit and then died is always a self-destruct; one
 * hit while off the stage and still trying to get back is the hitter's KO however long the recovery took.
 */
export const SD_WINDOW = 240;

/**
 * How a self-destructing fighter left the stage:
 * - `ledge-drop` / `ledge-jump`: let go of the ledge (drop, or jump away) and did not make it back
 * - `hang-timeout`: hung on the ledge until the automatic drop
 * - `trumped`: knocked off the ledge by a rival grabbing it
 * - `edgeguard-leap`: jumped off the stage after an off-stage rival
 * - `slid-off`: walked, ran or slid off an edge (no jump, not attacking)
 * - `attack-off`: a move (a lunge, an aerial out of a jump over the edge) carried it off
 * - `jumped-off`: jumped / drifted off the stage in neutral (chasing an aerial, a short hop)
 * - `respawn`: never touched the stage after respawning
 * - `other`
 */
export type SdCause = 'ledge-drop' | 'ledge-jump' | 'hang-timeout' | 'trumped' | 'edgeguard-leap' | 'slid-off' | 'attack-off' | 'jumped-off' | 'respawn' | 'other';
/**
 * How the recovery then failed: `occupied-ledge` (the ledge it was going for was taken), `upB-short` (used the up special and
 * fell helpless), `no-upB` (died with the up special unused).
 */
export type SdFail = 'occupied-ledge' | 'upB-short' | 'no-upB' | '';

export interface KoRecord {
  victim: string;
  /** Character credited with the KO (last fighter to hit the victim), or null for a self-destruct. */
  killer: string | null;
  /** Fighter index of the killer (or -1). */
  killerIdx: number;
  victimIdx: number;
  dir: KoDir;
  /** Victim's damage percent when it left the blast zone. */
  pct: number;
  sd: boolean;
  /** Self-destructs: how the fighter left the stage, and how the recovery failed. */
  cause?: SdCause;
  fail?: SdFail;
  /** The old rule's verdict (no hit in SD_WINDOW ticks), for comparison. */
  sd240: boolean;
  /** Ticks between the last hit and the KO (Infinity if never hit this stock). */
  sinceHit: number;
  /** The killing hit came from the killer's ultimate. */
  ult: boolean;
  /** With `trace`: the victim's last ticks (self-destructs only). */
  trace?: string[];
  /** Id of the move that last hit the victim ('' if unknown). */
  move: string;
  tick: number;
  /** The last hit before the KO came from a stage hazard. */
  hazard?: boolean;
}

export interface MatchResult {
  chars: string[];
  stage: string;
  /** Winning fighter index, -1 for a draw / time out. */
  winner: number;
  ticks: number;
  kos: KoRecord[];
  /** Ultimates started per fighter. */
  ults: number[];
  /** Moves started per fighter, by move id. */
  moveCounts: Record<string, number>[];
  /** Hits landed per fighter, by the hitter's move id at the time. */
  hitCounts: Record<string, number>[];
  /** Damage dealt per fighter (to rivals). */
  dealt: number[];
  /** Ticks with two live fighters in fighting range (within 200 across and 150 up/down). */
  near: number;
  /** Fighter-ticks spent offstage (summed over fighters). */
  offTicks: number;
}

/** Stages offered in Stage Select (competitive rotation). */
export const competitiveStages = (players = 2): string[] => STAGE_LIST.filter((s) => s.spawns.length >= players).map((s) => s.id);

export interface MatchOpts {
  stocks?: number;
  maxTicks?: number;
  items?: number;
  /** Per-fighter skills on the 1..9 scale (override `level`). */
  skills?: number[];
  /** Attach the last ticks of each self-destructing fighter (position, state, CPU plan) to its KoRecord. */
  trace?: boolean;
}

interface Track {
  lastHit: number;
  /** Last tick standing on a platform or hanging on a ledge (not in hitstun). */
  lastSafe: number;
  wasOff: boolean;
  /** Why it left the stage this time (decided when it went off with no hit since it was last safe). */
  cause: SdCause;
  prevState: string;
  prevGrounded: boolean;
  prevVy: number;
  prevLedgeFrames: number;
  /** CPU mode the tick it last left the ground / ledge. */
  leftFrom: SdCause;
  trumpedAt: number;
  helpless: boolean;
  upBUsed: boolean;
  sawOccupied: boolean;
  respawned: boolean;
  log: string[];
  /** Tick of the last stage-hazard hit. */
  lastHazard: number;
}

export function playMatch(chars: string[], stage: string, level: CpuLevel | CpuLevel[], seed: number, opts: MatchOpts = {}): MatchResult {
  const st = STAGES[stage];
  const world = new World(st);
  if (opts.items !== undefined) world.config.itemRate = opts.items;
  const fs = chars.map((c, i) => new Fighter(i, CHARACTERS[c]));
  fs.forEach((f) => world.addFighter(f));
  const match = new Match(world, { mode: 'stock', stocks: opts.stocks ?? 3, timeLimitSec: 0, respawnDelay: 70 });
  const sp = st.spawns;
  const place = (f: Fighter, air = false): void => f.spawn(sp[f.id].x, sp[f.id].y - (air ? 130 : 1), sp[f.id].x <= 0 ? 1 : -1);
  fs.forEach((f) => place(f));
  const tr: Track[] = fs.map(() => ({ lastHit: -1e9, lastSafe: 0, wasOff: false, cause: 'other', prevState: 'idle', prevGrounded: true, prevVy: 0, prevLedgeFrames: 0, leftFrom: 'other', trumpedAt: -1e9, helpless: false, upBUsed: false, sawOccupied: false, respawned: false, log: [], lastHazard: -1e9 }));
  let tick = 0;
  match.onRespawn = (f) => {
    place(f, true);
    Object.assign(tr[f.id], { lastHit: -1e9, lastSafe: tick, wasOff: false, cause: 'respawn', leftFrom: 'respawn', upBUsed: false, sawOccupied: false, respawned: true, prevState: 'air', prevGrounded: false });
  };
  const lastHitUlt = fs.map(() => false);
  const lastHitMove = fs.map(() => '');
  const ults = fs.map(() => 0);
  const moveCounts: Record<string, number>[] = fs.map(() => ({}));
  const hitCounts: Record<string, number>[] = fs.map(() => ({}));
  const dealt = fs.map(() => 0);
  const kos: KoRecord[] = [];
  const b = world.blast;
  const lv = Array.isArray(level) ? level : chars.map(() => level);
  const cpus = chars.map((_, i) => new CpuController(lv[i], seed * 7 + i + 1, opts.skills?.[i]));
  world.listener = (type, f, _x, _y, _m, extra) => {
    if (type === 'hit' || type === 'cinematicHit' || type === 'armorHit') {
      tr[f.id].lastHit = tick;
      const atk = world.fighters[f.lastHitBy];
      const cine = world.cinematic?.victim === f ? world.cinematic.move : null;
      const mv = cine ?? (atk && atk !== f ? atk.move : null);
      lastHitMove[f.id] = mv?.id ?? '';
      lastHitUlt[f.id] = mv?.kind === 'ultimate';
      if (atk && atk !== f && type === 'hit') {
        const id = cine?.id ?? (f.lastHitMove || 'trap');
        hitCounts[atk.id][id] = (hitCounts[atk.id][id] ?? 0) + 1;
        dealt[atk.id] += extra;
      }
    }
    if (type === 'moveStart' && f.move) moveCounts[f.id][f.move.id] = (moveCounts[f.id][f.move.id] ?? 0) + 1;
    if (type === 'trump') tr[f.id].trumpedAt = tick;
    if (type === 'moveStart' && f.move?.kind === 'ultimate') ults[f.id]++;
    if (type === 'moveStart' && f.move && !f.grounded && /^upB/.test(f.move.id)) tr[f.id].upBUsed = true;
    if (type === 'ko') {
      if (!match.over) {
        const t = tr[f.id];
        const sinceHit = tick - t.lastHit;
        // hit after it was last safe: the hitter's KO (a long recovery after an edge-guard hit is still their KO)
        const hitSinceSafe = t.lastHit >= t.lastSafe;
        const sd = extra < 0 || extra === f.id || !hitSinceSafe || (sinceHit > SD_WINDOW && t.lastHit < 0);
        const dir: KoDir = f.koY < b.top ? 'top' : f.koY - f.h > b.bottom ? 'bottom' : 'side';
        const fail: SdFail = !sd ? '' : t.sawOccupied ? 'occupied-ledge' : t.upBUsed || t.helpless ? 'upB-short' : 'no-upB';
        kos.push({
          victim: chars[f.id],
          victimIdx: f.id,
          killer: sd ? null : chars[extra],
          killerIdx: sd ? -1 : extra,
          dir,
          pct: Math.round(f.damage),
          sd,
          cause: sd ? (t.wasOff ? t.cause : t.leftFrom) : undefined,
          fail: sd ? fail : undefined,
          sd240: sinceHit > SD_WINDOW || extra < 0 || extra === f.id,
          sinceHit: t.lastHit < 0 ? Infinity : sinceHit,
          ult: !sd && lastHitUlt[f.id],
          move: sd ? '' : lastHitMove[f.id],
          tick,
          trace: sd && opts.trace ? t.log.slice() : undefined,
          hazard: !sd && t.lastHazard === t.lastHit,
        });
      }
      match.onKo(f, extra);
    }
  };
  const ins = fs.map(() => makeInput());
  const lim = opts.maxTicks ?? 14400;
  let near = 0;
  let offTicks = 0;
  const hz = world.hazardHit.map((row) => fs.map((f) => row[f.id]));
  for (; tick < lim && !match.over; tick++) {
    fs.forEach((f, i) => cpus[i].update(f, world, ins[i]));
    world.step(ins);
    // a hazard hit shows as a new cycle in world.hazardHit (the hit itself also fires 'hit', so lastHit is this tick too)
    world.hazardHit.forEach((row, i) =>
      fs.forEach((f) => {
        if (row[f.id] !== hz[i][f.id]) {
          hz[i][f.id] = row[f.id];
          tr[f.id].lastHazard = tick;
        }
      }),
    );
    match.step();
    let close = false;
    for (const f of fs) {
      observe(f, tr[f.id], cpus[f.id]);
      if (f.state === 'ko') continue;
      if (offstage(f, world)) offTicks++;
      for (const g of fs) if (g !== f && g.state !== 'ko' && Math.abs(g.x - f.x) < 200 && Math.abs(g.y - f.y) < 150) close = true;
    }
    if (close) near++;
  }
  function observe(f: Fighter, t: Track, cpu: CpuController): void {
    if (f.state === 'ko') return;
    const safe = (f.grounded || f.state === 'ledge' || f.state === 'ledgeClimb') && f.state !== 'hitstun';
    // leaving the ground / the ledge: remember how (the cause if it turns into a fall)
    if (t.prevState === 'ledge' && f.state !== 'ledge' && f.state !== 'ledgeClimb') {
      t.leftFrom = tick - t.trumpedAt < 3 ? 'trumped' : t.prevLedgeFrames >= 298 ? 'hang-timeout' : f.vy < 0 ? 'ledge-jump' : 'ledge-drop';
    } else if (t.prevGrounded && !f.grounded && f.state !== 'ledge') {
      const mode = cpu.currentMode;
      t.leftFrom = mode === 'edgeguard' ? 'edgeguard-leap' : t.prevState === 'attack' || f.state === 'attack' ? 'attack-off' : f.vy < 0 || t.prevState === 'jumpsquat' ? 'jumped-off' : 'slid-off';
    }
    if (safe) {
      t.lastSafe = tick;
      t.upBUsed = false;
      t.sawOccupied = false;
      t.respawned = false;
    }
    const off = offstage(f, world);
    if (off && !t.wasOff) t.cause = t.leftFrom;
    if (off) {
      // a ledge within reach that somebody else is hanging on
      for (const l of world.ledges) {
        if (l.occupant === -1 || l.occupant === f.id) continue;
        if (Math.abs(l.x - f.x) < 90 && Math.abs(l.y - f.y) < 110) t.sawOccupied = true;
      }
    }
    if (opts.trace) {
      const ep = cpu.recoveryEpisode;
      t.log.push(`${tick} ${f.state}${f.helpless ? '!' : ''} x${f.x.toFixed(0)} y${f.y.toFixed(0)} v${f.vx.toFixed(1)},${f.vy.toFixed(1)} j${f.jumpsLeft} ${cpu.currentMode} ${cpu.planLabel} ${ep ? `${ep.decision}${ep.specialPressed ? '*' : ''} L${ep.ledge ? ep.ledge.x : '-'}` : ''} hit${t.lastHit}`);
      if (t.log.length > 160) t.log.shift();
    }
    t.wasOff = off;
    t.helpless = f.helpless;
    t.prevState = f.state;
    t.prevGrounded = f.grounded;
    t.prevVy = f.vy;
    t.prevLedgeFrames = f.ledgeFrames;
  }
  return { chars, stage, winner: match.over ? match.winner : -1, ticks: tick, kos, ults, moveCounts, hitCounts, dealt, near, offTicks };
}
