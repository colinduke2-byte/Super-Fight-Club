/**
 * Best results of the run modes added on top of the arcade ladder: Endless (most wins and KOs per fighter), Gauntlet
 * (best time per fighter) and Boss Battle (best time per difficulty). Kept in their own localStorage key; storage can be
 * missing or throw (private windows, blocked site data), so every access is guarded and a blocked run just is not kept.
 */
export const RUN_RECORDS_KEY = 'sfc.runRecords.v1';

export interface EndlessBest {
  /** Fights won in the run. */
  wins: number;
  kos: number;
}

export interface GauntletBest {
  sec: number;
  difficulty: number;
}

export interface BossBest {
  sec: number;
  fighter: string;
  coop?: boolean;
}

export interface RunRecords {
  endless: Record<string, EndlessBest>;
  gauntlet: Record<string, GauntletBest>;
  /** By difficulty (1..4). */
  boss: Record<string, BossBest>;
}

/** What a finished run improved, for the results card. */
export interface RunBestOutcome {
  newBest: boolean;
  /** The best before this run (null: none). */
  prev: number | null;
}

function empty(): RunRecords {
  return { endless: {}, gauntlet: {}, boss: {} };
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null);

export function loadRunRecords(): RunRecords {
  const out = empty();
  try {
    const raw = typeof localStorage === 'undefined' ? null : localStorage.getItem(RUN_RECORDS_KEY);
    if (!raw) return out;
    const p = JSON.parse(raw) as Partial<RunRecords>;
    for (const [k, v] of Object.entries(p.endless ?? {})) {
      const wins = num(v?.wins);
      const kos = num(v?.kos);
      if (wins !== null && kos !== null) out.endless[k] = { wins, kos };
    }
    for (const [k, v] of Object.entries(p.gauntlet ?? {})) {
      const sec = num(v?.sec);
      if (sec !== null) out.gauntlet[k] = { sec, difficulty: num(v?.difficulty) ?? 2 };
    }
    for (const [k, v] of Object.entries(p.boss ?? {})) {
      const sec = num(v?.sec);
      if (sec !== null && typeof v?.fighter === 'string') out.boss[k] = { sec, fighter: v.fighter, ...(v.coop ? { coop: true } : {}) };
    }
  } catch {
    /* unreadable: start clean */
  }
  return out;
}

function save(r: RunRecords): void {
  try {
    localStorage.setItem(RUN_RECORDS_KEY, JSON.stringify(r));
  } catch {
    /* storage blocked: the record lasts for this session's screens only */
  }
}

/** An Endless run ended: the best is the most wins (KOs break a tie). */
export function recordEndless(fighter: string, wins: number, kos: number): RunBestOutcome {
  const r = loadRunRecords();
  const prev = r.endless[fighter] ?? null;
  const better = !prev || wins > prev.wins || (wins === prev.wins && kos > prev.kos);
  if (better && wins > 0) {
    r.endless[fighter] = { wins, kos };
    save(r);
  }
  return { newBest: better && wins > 0, prev: prev ? prev.wins : null };
}

/** A Gauntlet was cleared in `sec` seconds. */
export function recordGauntlet(fighter: string, sec: number, difficulty: number): RunBestOutcome {
  const r = loadRunRecords();
  const prev = r.gauntlet[fighter] ?? null;
  const better = !prev || sec < prev.sec;
  if (better) {
    r.gauntlet[fighter] = { sec, difficulty };
    save(r);
  }
  return { newBest: better, prev: prev ? prev.sec : null };
}

/** The Overseer fell in `sec` seconds at `difficulty`. */
export function recordBoss(difficulty: number, sec: number, fighter: string, coop = false): RunBestOutcome {
  const r = loadRunRecords();
  const key = String(difficulty);
  const prev = r.boss[key] ?? null;
  const better = !prev || sec < prev.sec;
  if (better) {
    r.boss[key] = { sec, fighter, ...(coop ? { coop: true } : {}) };
    save(r);
  }
  return { newBest: better, prev: prev ? prev.sec : null };
}
