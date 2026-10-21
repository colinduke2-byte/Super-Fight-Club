import type { MatchConfig, FighterScore } from '../engine/match';
import type { MatchResult, PlayerResult, PlayerSlot } from './session';

/**
 * Turns the live match scores into the results screen data.
 * Placement: the winner is 1st; in stock matches the rest rank by elimination order (last out = 2nd), then
 * stocks; in time matches by points (KOs - falls).
 */
export function buildResult(
  slots: readonly PlayerSlot[],
  scores: readonly FighterScore[],
  damageDealt: readonly number[],
  eliminatedAt: readonly number[],
  cfg: Pick<MatchConfig, 'mode'>,
  winner: number,
  durationTicks: number,
  teams: readonly number[] = [],
  winnerTeam = -1,
  bestCombo: readonly number[] = [],
  tally: Pick<MatchTally, 'ultKos' | 'ledgeGrabs' | 'biggestLaunch'> | null = null,
): MatchResult {
  const order = slots.map((_, i) => i);
  const points = (i: number): number => scores[i].kos - (cfg.mode === 'time' ? scores[i].falls : 0);
  order.sort((a, b) => {
    if (winnerTeam >= 0 && (teams[a] === winnerTeam) !== (teams[b] === winnerTeam)) return teams[a] === winnerTeam ? -1 : 1;
    if (a === winner) return -1;
    if (b === winner) return 1;
    if (cfg.mode === 'time') return points(b) - points(a);
    const ea = scores[a].eliminated ? eliminatedAt[a] : Infinity;
    const eb = scores[b].eliminated ? eliminatedAt[b] : Infinity;
    if (ea !== eb) return eb - ea; // eliminated later = better
    return scores[b].stocks - scores[a].stocks;
  });
  const players: PlayerResult[] = slots.map((s, i) => ({
    index: s.index,
    character: s.character,
    palette: s.palette ?? 0,
    type: s.type,
    stocks: scores[i].stocks,
    kos: scores[i].kos,
    falls: scores[i].falls,
    damageDealt: damageDealt[i] ?? 0,
    bestCombo: bestCombo[i] ?? 0,
    eliminated: scores[i].eliminated,
    placement: winnerTeam >= 0 && teams[i] === winnerTeam ? 1 : order.indexOf(i) + 1,
    team: teams[i] ?? -1,
    ...(tally ? { ultimateKos: tally.ultKos[i] ?? 0, ledgeGrabs: tally.ledgeGrabs[i] ?? 0, biggestLaunch: tally.biggestLaunch[i] ?? 0 } : {}),
  }));
  return { winner, winnerTeam, players, durationSec: Math.round(durationTicks / 60) };
}

/** The slice of a fighter the match tally reads (an engine Fighter fits). */
export interface TallyFighter {
  id: number;
  x: number;
  y: number;
  koX: number;
  koY: number;
  state: string;
  grounded: boolean;
  hitstun: number;
  lastHitBy: number;
  move: { kind: string } | null;
}

/** Metres per world pixel, the same scale the Launch Contest measures in. */
export const PX_PER_M = 4;
/** After an ultimate starts, hits by that fighter count as ultimate hits for this long (projectiles and blasts it leaves behind). */
const ULT_WINDOW = 240;

/**
 * Per-match numbers the score table does not keep, counted from world events: KOs scored with an ultimate, ledge grabs,
 * and the longest launch each fighter dealt (metres from the hit to where the flight ended: landing, the ledge, or the
 * blast line). Feed it every world event (`onEvent`) and call `step` once per simulated tick.
 */
export class MatchTally {
  readonly ultKos: number[];
  readonly ledgeGrabs: number[];
  readonly biggestLaunch: number[];
  private tick = 0;
  /** Per fighter: the tick its last ultimate started (-inf: none). */
  private readonly ultAt: number[];
  /** Per victim: the last hit came from an ultimate. */
  private readonly ultHit: boolean[];
  /** Per victim: the launch in flight (origin, who sent it, furthest point so far in px). */
  private readonly flights: ({ x: number; y: number; by: number; far: number; t: number } | null)[];

  constructor(n: number) {
    this.ultKos = Array.from({ length: n }, () => 0);
    this.ledgeGrabs = Array.from({ length: n }, () => 0);
    this.biggestLaunch = Array.from({ length: n }, () => 0);
    this.ultAt = Array.from({ length: n }, () => -Infinity);
    this.ultHit = Array.from({ length: n }, () => false);
    this.flights = Array.from({ length: n }, () => null);
  }

  private inUlt(by: number, fighters: readonly TallyFighter[], cinematicBy: number): boolean {
    const a = fighters[by];
    if (!a) return false;
    if (cinematicBy === by) return true;
    if (a.state === 'attack' && a.move?.kind === 'ultimate') return true;
    return this.tick - this.ultAt[by] <= ULT_WINDOW;
  }

  /** One world event (`extra` on a KO is the last attacker); `cinematicBy` is the fighter running a cinematic ultimate (-1 none). */
  onEvent(type: string, f: TallyFighter | null | undefined, extra: number, fighters: readonly TallyFighter[], cinematicBy = -1): void {
    if (!f || f.id < 0 || f.id >= this.ultKos.length) return;
    switch (type) {
      case 'moveStart':
        if (f.move?.kind === 'ultimate') this.ultAt[f.id] = this.tick;
        else if (f.state === 'attack' && this.tick - this.ultAt[f.id] > 30) this.ultAt[f.id] = -Infinity; // moved on to something else
        break;
      case 'cinematicStart': // (the attacker)
        this.ultAt[f.id] = this.tick;
        break;
      case 'ledgeGrab':
        this.ledgeGrabs[f.id]++;
        break;
      case 'hit':
      case 'cinematicHit': {
        const by = f.lastHitBy;
        if (by < 0 || by === f.id) break;
        this.ultHit[f.id] = this.inUlt(by, fighters, cinematicBy);
        this.flights[f.id] = { x: f.x, y: f.y, by, far: 0, t: 0 };
        break;
      }
      case 'ko': {
        const by = extra;
        if (by >= 0 && by !== f.id && by < this.ultKos.length && this.ultHit[f.id]) this.ultKos[by]++;
        const fl = this.flights[f.id];
        if (fl && fl.by === by) this.land(f.id, Math.hypot(f.koX - fl.x, f.koY - fl.y));
        this.flights[f.id] = null;
        this.ultHit[f.id] = false;
        break;
      }
    }
  }

  /** Once per simulated tick (after the world stepped): launches in flight measure how far they got. */
  step(fighters: readonly TallyFighter[]): void {
    this.tick++;
    for (let i = 0; i < this.flights.length; i++) {
      const fl = this.flights[i];
      const f = fighters[i];
      if (!fl || !f || f.state === 'ko') continue;
      fl.t++;
      const d = Math.hypot(f.x - fl.x, f.y - fl.y);
      if (d > fl.far) fl.far = d;
      // the flight ends when the fighter is back in control: landed, on the ledge, or out of hitstun
      if (fl.t > 2 && (f.hitstun <= 0 || f.grounded || f.state === 'ledge')) {
        this.land(i, fl.far);
        this.flights[i] = null;
      }
    }
  }

  private land(victim: number, px: number): void {
    const fl = this.flights[victim];
    if (!fl) return;
    const m = Math.round((Math.max(px, fl.far) / PX_PER_M) * 10) / 10;
    if (m > this.biggestLaunch[fl.by]) this.biggestLaunch[fl.by] = m;
  }
}

/** The slice of a fighter the timeline samples. */
export interface TimelineFighter {
  id: number;
  damage: number;
  state: string;
}

/** A KO on the timeline: when, who fell, who sent them (-1: a self-destruct or the stage). */
export interface TimelineKo {
  t: number;
  victim: number;
  by: number;
}

/** What a finished match's graphs are drawn from (see MatchTimeline). */
export interface TimelineData {
  /** Ticks between samples. */
  every: number;
  /** Per fighter: damage (%) at each sample. */
  damage: number[][];
  /** Per fighter: stocks left at each sample. */
  stocks: number[][];
  kos: TimelineKo[];
  /** Ticks the match ran. */
  ticks: number;
}

/** Samples kept at most; a longer match halves its sampling rate (every other sample dropped) to stay under it. */
const TIMELINE_MAX = 1200;

/**
 * The match as it unfolded, for the results graphs: each fighter's damage and stocks a few times a second and every KO, counted
 * from world events and the tick (it reads the runner, never the scene). Feed `onEvent` every world event and call `step` once
 * per simulated tick.
 */
export class MatchTimeline {
  every = 15;
  readonly damage: number[][];
  readonly stocks: number[][];
  readonly kos: TimelineKo[] = [];
  ticks = 0;

  constructor(n: number) {
    this.damage = Array.from({ length: n }, () => []);
    this.stocks = Array.from({ length: n }, () => []);
  }

  /** The first sample (tick 0), before anyone moves. */
  start(fighters: readonly TimelineFighter[], scores: readonly { stocks: number }[]): void {
    if (this.damage[0]?.length) return;
    this.sample(fighters, scores);
  }

  onEvent(type: string, f: TimelineFighter | null | undefined, extra: number, tick: number): void {
    if (type !== 'ko' || !f || f.id < 0 || f.id >= this.damage.length) return;
    this.kos.push({ t: tick, victim: f.id, by: extra >= 0 && extra < this.damage.length && extra !== f.id ? extra : -1 });
  }

  step(fighters: readonly TimelineFighter[], scores: readonly { stocks: number }[], tick: number): void {
    this.ticks = tick;
    if (tick % this.every !== 0) return;
    this.sample(fighters, scores);
    if ((this.damage[0]?.length ?? 0) > TIMELINE_MAX) {
      this.every *= 2;
      for (const a of [...this.damage, ...this.stocks]) {
        const kept = a.filter((_, i) => i % 2 === 0);
        a.length = 0;
        a.push(...kept);
      }
    }
  }

  private sample(fighters: readonly TimelineFighter[], scores: readonly { stocks: number }[]): void {
    for (let i = 0; i < this.damage.length; i++) {
      const f = fighters[i];
      this.damage[i].push(f && f.state !== 'ko' ? Math.round(f.damage) : 0);
      this.stocks[i].push(Math.max(0, scores[i]?.stocks ?? 0));
    }
  }

  /** A plain copy for the results screen. */
  data(): TimelineData {
    return { every: this.every, damage: this.damage.map((a) => [...a]), stocks: this.stocks.map((a) => [...a]), kos: this.kos.map((k) => ({ ...k })), ticks: this.ticks };
  }
}

/** The last live match's timeline (set when it ends; the results screen draws its graphs from it). Replays do not change it. */
let lastTimeline: TimelineData | null = null;
export function setLastTimeline(t: TimelineData | null): void {
  lastTimeline = t;
}
export function getLastTimeline(): TimelineData | null {
  return lastTimeline;
}

/**
 * Half the width a fighter takes on the podium, in podium units (s = 1, the winner at full size): from its body width,
 * with room for arms, wings and cloaks. A regular fighter is about 13; the Overseer about twice that.
 */
export function bodyHalf(c: { body: { width: number } }): number {
  return Math.max(10, c.body.width * 0.9);
}

/**
 * Podium scale for a fighter: a regular fighter 1; a giant (the Overseer, about twice as tall) is drawn smaller, so it
 * stands about as tall as a regular winner instead of towering over the whole screen.
 */
export function podiumShrink(c: { body: { height: number } }): number {
  const bulk = Math.max(1, c.body.height / 30);
  return 1 / Math.sqrt(bulk);
}

/**
 * Where the runners-up stand beside the winner (offsets in podium units, s = 1): 2nd on the left step, 3rd on the right, 4th
 * one step further right and lower. Each step is pushed out far enough that the fighter on it (`halves`: half-widths at
 * the runner-up scale) clears the winner (`champHalf`) and its neighbour; `hw` is the half-width of each step block.
 */
export function podiumSpots(champHalf: number, halves: readonly number[]): { dx: number; dy: number; hw: number }[] {
  const out: { dx: number; dy: number; hw: number }[] = [];
  halves.forEach((h, i) => {
    const hw = Math.max(i === 2 ? 15 : 18, h + 3);
    const base = i === 2 ? 76 : 42;
    // (a giant gets extra room: the winner's weapon swings out past its body)
    let dx = Math.max(base, champHalf + hw + 4, champHalf + h + 16);
    if (i === 2) dx = Math.max(dx, (out[1]?.dx ?? 42) + (out[1]?.hw ?? 18) + hw + 1);
    out.push({ dx: i === 0 ? -dx : dx, dy: i === 2 ? 12 : 7, hw });
  });
  return out;
}
