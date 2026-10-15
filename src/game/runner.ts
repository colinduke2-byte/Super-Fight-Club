import { characterById, CHARACTERS } from '../characters';
import type { FighterInput } from '../engine/buttons';
import { Fighter } from '../engine/fighter';
import { Match, type MatchConfig } from '../engine/match';
import type { CharacterData, StageData } from '../engine/types';
import { World, type WorldListener } from '../engine/world';
import { LaunchContest } from './launch';

/** Everything a headless match needs: who fights where, under which rules. */
export interface RunnerSetup {
  stage: StageData;
  /** Character id per slot (an unknown id falls back to Brick). */
  characters: (string | CharacterData)[];
  rules: MatchConfig;
  /** Per-slot starting stocks (handicap / boss stocks); a missing or 0 entry keeps `rules.stocks`. */
  stocks?: (number | undefined)[];
  /** Team battle: with exactly four fighters, slots 0-1 are team 0 and slots 2-3 team 1. */
  teams?: boolean;
  /** Item drop rate (0 = off). */
  itemRate?: number;
  /** Launch Contest: fighter 1 is the bag, and the contest ends the match. */
  launch?: boolean;
  /** Target Smash: the run ends when the last of the stage's targets breaks. */
  targets?: boolean;
  /** Smash input mode (flick vs. button); can be changed between steps via `smashFlick`. */
  smashFlick?: boolean;
}

export function resolveCharacter(c: string | CharacterData): CharacterData {
  return typeof c === 'string' ? (characterById(c) ?? CHARACTERS.brick) : c;
}

/**
 * The match without any presentation: owns the world and the match rules (spawn and respawn placement, KOs, per-slot
 * stocks, teams, Launch Contest / Target Smash end conditions, elimination ticks). The scene, replays and the soak tests all
 * drive a match through this, so they cannot drift apart. Views subscribe to world events with `subscribe`; the rules
 * (KO -> stock loss) are applied before any subscriber sees the event, so they never depend on a view.
 */
export class MatchRunner {
  readonly world: World;
  readonly fighters: Fighter[];
  readonly match: Match;
  readonly stage: StageData;
  /** Launch Contest run (null in other modes). */
  readonly launch: LaunchContest | null;
  /** Target Smash run (single fighter, break every target). */
  readonly isTargets: boolean;
  /** Launch Contest: damage on the bag at the moment it left the platform. */
  launchDamage = 0;
  /** Target Smash: the tick the last target broke (-1 = not cleared). */
  targetTicks = -1;
  /** Tick each fighter was eliminated on (-1 = still in). */
  readonly elimAt: number[];
  smashFlick: boolean;
  private readonly listeners: WorldListener[] = [];
  private readonly sdListeners: ((ids: number[]) => void)[] = [];

  constructor(setup: RunnerSetup) {
    const stage = (this.stage = setup.stage);
    this.world = new World(stage);
    this.fighters = setup.characters.map((c, i) => new Fighter(i, resolveCharacter(c)));
    this.elimAt = this.fighters.map(() => -1);
    this.smashFlick = setup.smashFlick ?? this.world.config.smashFlick;
    for (const f of this.fighters) {
      this.world.addFighter(f);
      this.respawn(f.id);
    }
    if (setup.teams && this.fighters.length === 4) this.fighters.forEach((f, i) => (f.team = i < 2 ? 0 : 1));
    this.isTargets = !!setup.targets && this.world.targets.length > 0;
    this.world.config.itemRate = setup.itemRate ?? 0;
    // Launch Contest: no stocks (falls just respawn); the contest ends the match itself
    this.launch = setup.launch ? new LaunchContest(this.fighters[1]) : null;
    if (this.launch) this.fighters.forEach((f) => (f.invuln = 0)); // the bag can be hit from the first frame
    this.match = new Match(this.world, setup.rules);
    this.match.onRespawn = (f) => this.respawn(f.id, true);
    this.match.onSuddenDeath = (ids) => {
      for (const l of this.sdListeners) l(ids);
    };
    setup.stocks?.forEach((s, i) => {
      if (s && this.match.scores[i]) this.match.scores[i].stocks = s;
    });
    this.world.listener = (type, f, x, y, mag, extra, tag) => {
      if (type === 'ko') this.match.onKo(f, extra);
      for (const l of this.listeners) l(type, f, x, y, mag, extra, tag);
    };
  }

  /** Receive every world event (after the rules have handled it). Returns an unsubscribe function. */
  subscribe(l: WorldListener): () => void {
    this.listeners.push(l);
    return () => {
      const i = this.listeners.indexOf(l);
      if (i >= 0) this.listeners.splice(i, 1);
    };
  }

  /** Called once when time-mode sudden death starts (after the contenders respawned). */
  onSuddenDeath(fn: (ids: number[]) => void): void {
    this.sdListeners.push(fn);
  }

  /** Puts fighter `i` on its spawn point (dropping in from above for a respawn). */
  respawn(i: number, fromAbove = false): void {
    const sp = this.stage.spawns[i % this.stage.spawns.length];
    this.fighters[i].spawn(sp.x, sp.y - (fromAbove ? 130 : 1), sp.x <= 0 ? 1 : -1);
  }

  get over(): boolean {
    return this.match.over;
  }

  /** One 60 Hz tick: the world, then stocks / respawns / win conditions, then the mode's own end conditions. */
  step(inputs: FighterInput[]): void {
    const w = this.world;
    w.config.smashFlick = this.smashFlick;
    w.step(inputs);
    this.match.step();
    const lc = this.launch;
    if (lc && !this.match.over) {
      const was = lc.phase;
      lc.step();
      if (was !== 'flying' && lc.phase === 'flying') this.launchDamage = this.fighters[1].damage;
      if (lc.over) {
        this.match.over = true;
        this.match.winner = 0;
      }
    }
    this.match.scores.forEach((s, i) => {
      if (s.eliminated && this.elimAt[i] < 0) this.elimAt[i] = w.tick;
    });
    // Target Smash: the run ends when the last target breaks (or when the fighter falls)
    if (this.isTargets && !this.match.over && w.targets.every((t) => !t.alive)) {
      this.match.over = true;
      this.match.winner = 0;
      this.targetTicks = w.tick;
    }
  }
}
