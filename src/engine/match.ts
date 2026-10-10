import type { Fighter } from './fighter';
import type { World } from './world';

export type MatchMode = 'stock' | 'time' | 'training';

export interface MatchConfig {
  mode: MatchMode;
  stocks: number;
  /** Time-mode length in seconds. */
  timeLimitSec: number;
  /** Frames between a KO and the respawn. */
  respawnDelay: number;
}

export const DEFAULT_MATCH: MatchConfig = { mode: 'stock', stocks: 3, timeLimitSec: 180, respawnDelay: 70 };

export interface FighterScore {
  stocks: number;
  kos: number;
  falls: number;
  damageDealt: number;
  eliminated: boolean;
}

/**
 * Stocks, KOs, respawns and win conditions. Driven by the sim: call `onKo` from the world's 'ko'
 * event and `step` once per tick after `world.step`.
 */
export class Match {
  readonly scores: FighterScore[];
  /** Tick on which each fighter is due to respawn (-1 = not waiting). */
  private readonly respawnAt: number[];
  ticksLeft: number;
  over = false;
  /** Winning fighter id, or -1 for a draw / no winner yet. */
  winner = -1;
  /** Winning team in team battles (-1 otherwise). */
  winnerTeam = -1;
  /** Called with the fighter that should be placed back on the stage. */
  onRespawn: ((f: Fighter) => void) | null = null;

  constructor(
    private readonly world: World,
    readonly cfg: MatchConfig = DEFAULT_MATCH,
  ) {
    this.scores = world.fighters.map(() => ({ stocks: cfg.stocks, kos: 0, falls: 0, damageDealt: 0, eliminated: false }));
    this.respawnAt = world.fighters.map(() => -1);
    this.ticksLeft = cfg.timeLimitSec * 60;
  }

  get training(): boolean {
    return this.cfg.mode === 'training';
  }

  /** Register a KO. `killer` is the fighter id credited (or -1). */
  onKo(fighter: Fighter, killer: number): void {
    if (this.over) return;
    const s = this.scores[fighter.id];
    s.falls++;
    if (killer >= 0 && killer !== fighter.id) this.scores[killer].kos++;
    else if (this.cfg.mode === 'time') this.scores[fighter.id].kos--; // self-destruct costs a point
    if (!this.training) s.stocks--;
    if (s.stocks <= 0 && this.cfg.mode === 'stock') {
      s.eliminated = true;
      s.stocks = 0;
    } else {
      this.respawnAt[fighter.id] = this.world.tick + this.cfg.respawnDelay;
    }
  }

  step(): void {
    if (this.over) return;
    const w = this.world;
    for (const f of w.fighters) {
      const due = this.respawnAt[f.id];
      if (due >= 0 && w.tick >= due && f.state === 'ko') {
        this.respawnAt[f.id] = -1;
        f.damage = 0;
        this.onRespawn?.(f);
      }
    }
    if (this.cfg.mode === 'time') {
      if (--this.ticksLeft <= 0) this.finish();
    } else if (this.cfg.mode === 'stock') {
      const alive = this.scores.map((s, i) => (s.eliminated ? -1 : i)).filter((i) => i >= 0);
      const team0 = alive.length ? w.fighters[alive[0]].team : -1;
      const oneTeam = team0 >= 0 && alive.every((i) => w.fighters[i].team === team0);
      if (alive.length <= 1 || oneTeam) {
        this.winner = alive.length >= 1 ? alive[0] : -1;
        this.winnerTeam = alive.length >= 1 ? team0 : -1;
        this.over = true;
      }
    }
  }

  private finish(): void {
    this.over = true;
    let best = -Infinity;
    let winner = -1;
    let tie = false;
    const teams = this.world.fighters.some((f) => f.team >= 0);
    if (teams) {
      // team score = sum of member points; the winner is the best member of the best team
      const sums = new Map<number, number>();
      this.scores.forEach((s, i) => sums.set(this.world.fighters[i].team, (sums.get(this.world.fighters[i].team) ?? 0) + s.kos - s.falls));
      let bestTeam = -1;
      for (const [t, v] of sums) {
        if (v > best) {
          best = v;
          bestTeam = t;
          tie = false;
        } else if (v === best) tie = true;
      }
      this.winnerTeam = tie ? -1 : bestTeam;
      const mine = this.scores.map((_, i) => i).filter((i) => this.world.fighters[i].team === bestTeam);
      this.winner = tie ? -1 : mine.sort((a, b) => this.scores[b].kos - this.scores[a].kos)[0];
      return;
    }
    this.scores.forEach((s, i) => {
      const pts = s.kos - (this.cfg.mode === 'time' ? s.falls : 0);
      if (pts > best) {
        best = pts;
        winner = i;
        tie = false;
      } else if (pts === best) tie = true;
    });
    this.winner = tie ? -1 : winner;
  }
}
