/** Personal records kept in this browser (Target Smash best times per fighter). Storage can be unavailable: everything degrades to "no record". */
const KEY = 'sfc-records-v1';

/** Lifetime numbers for one fighter (human-controlled matches only). */
export interface FighterRecord {
  played: number;
  wins: number;
  kos: number;
  falls: number;
}

interface Records {
  targets: Record<string, number>;
  fighters: Record<string, FighterRecord>;
}

function load(): Records {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const r = JSON.parse(raw) as Partial<Records>;
      return { targets: { ...(r.targets ?? {}) }, fighters: { ...(r.fighters ?? {}) } };
    }
  } catch {
    /* private mode / blocked storage */
  }
  return { targets: {}, fighters: {} };
}

function save(r: Records): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(r));
  } catch {
    /* ignore */
  }
}

/** Best Target Smash time (sim ticks) for a fighter, or null. */
export function bestTargetTime(character: string): number | null {
  return load().targets[character] ?? null;
}

/** Record a cleared run; returns true when it beats the previous best. */
export function recordTargetTime(character: string, ticks: number): boolean {
  const r = load();
  const prev = r.targets[character];
  if (prev !== undefined && prev <= ticks) return false;
  r.targets[character] = ticks;
  save(r);
  return true;
}

/** m:ss.cc from sim ticks (60 Hz). */
export function formatTicks(ticks: number): string {
  const cs = Math.floor((ticks / 60) * 100);
  const m = Math.floor(cs / 6000);
  const s = Math.floor((cs % 6000) / 100);
  return `${m}:${String(s).padStart(2, '0')}.${String(cs % 100).padStart(2, '0')}`;
}

/** Add one finished match for a human-controlled fighter. */
export function recordMatch(character: string, won: boolean, kos: number, falls: number): void {
  const r = load();
  const f = r.fighters[character] ?? { played: 0, wins: 0, kos: 0, falls: 0 };
  f.played++;
  if (won) f.wins++;
  f.kos += kos;
  f.falls += falls;
  r.fighters[character] = f;
  save(r);
}

/** Every fighter's lifetime record (missing fighters have played nothing). */
export function fighterRecords(): Record<string, FighterRecord> {
  return load().fighters;
}

/** Forget everything (Records > RESET). */
export function resetRecords(): void {
  save({ targets: {}, fighters: {} });
}
