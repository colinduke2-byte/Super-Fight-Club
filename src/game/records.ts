/** Personal records kept in this browser (Target Smash best times per fighter). Storage can be unavailable: everything degrades to "no record". */
const KEY = 'sfc-records-v1';

/** Lifetime numbers for one fighter (human-controlled matches only). */
export interface FighterRecord {
  played: number;
  wins: number;
  kos: number;
  falls: number;
}

export interface Records {
  targets: Record<string, number>;
  fighters: Record<string, FighterRecord>;
  /** Launch Contest best distance (metres) per fighter. */
  launch: Record<string, number>;
  /** Cleared challenges: id -> the fighter that cleared it first. */
  challenges: Record<string, string>;
}

/** Version of the saved shape (a save without one is the original v1 layout, which is the same minus the field). */
export const RECORDS_VERSION = 2;

const empty = (): Records => ({ targets: {}, fighters: {}, launch: {}, challenges: {} });

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const positive = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0;
const count = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0);

function positives(v: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (isObj(v)) for (const [k, n] of Object.entries(v)) if (positive(n)) out[k] = n;
  return out;
}

/** Parse saved records, dropping anything that is not a sane number (or fighter name, for challenges). */
export function parseRecords(raw: string | null): Records {
  const r = empty();
  if (!raw) return r;
  let d: unknown;
  try {
    d = JSON.parse(raw);
  } catch {
    return r;
  }
  if (!isObj(d)) return r;
  r.targets = positives(d.targets);
  r.launch = positives(d.launch);
  if (isObj(d.fighters)) {
    for (const [k, f] of Object.entries(d.fighters)) {
      if (!isObj(f)) continue;
      const played = count(f.played);
      // wins can never exceed matches played
      r.fighters[k] = { played, wins: Math.min(played, count(f.wins)), kos: count(f.kos), falls: count(f.falls) };
    }
  }
  if (isObj(d.challenges)) for (const [k, c] of Object.entries(d.challenges)) if (typeof c === 'string' && c) r.challenges[k] = c;
  return r;
}

/** The parsed records, kept between calls; dropped when another tab writes them (storage event) or on reset. */
let cache: Records | null = null;

function load(): Records {
  if (cache) return cache;
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    /* private mode / blocked storage */
  }
  cache = parseRecords(raw);
  return cache;
}

function save(r: Records): void {
  cache = r;
  try {
    localStorage.setItem(KEY, JSON.stringify({ version: RECORDS_VERSION, ...r }));
  } catch {
    /* ignore: the records still last for this session */
  }
}

/** Forget the cached copy so the next read comes from storage (tests; another tab's write). */
export function invalidateRecordsCache(): void {
  cache = null;
}

// another tab finished a match or cleared a challenge: re-read on next access
if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  window.addEventListener('storage', (e: StorageEvent) => {
    if (e.key === null || e.key === KEY) cache = null;
  });
}

/** Best Target Smash time (sim ticks) for a fighter, or null. */
export function bestTargetTime(character: string): number | null {
  return load().targets[character] ?? null;
}

/** Record a cleared run; returns true when it beats the previous best. */
export function recordTargetTime(character: string, ticks: number): boolean {
  if (!positive(ticks)) return false;
  const r = load();
  const prev = r.targets[character];
  if (prev !== undefined && prev <= ticks) return false;
  r.targets[character] = ticks;
  save(r);
  return true;
}

/** Best Launch Contest distance (metres) for a fighter, or null. */
export function bestLaunch(character: string): number | null {
  return load().launch[character] ?? null;
}

/** Record a launch; returns true when it beats the previous best (a zero never counts). */
export function recordLaunch(character: string, metres: number): boolean {
  if (!positive(metres)) return false;
  const r = load();
  const prev = r.launch[character];
  if (prev !== undefined && prev >= metres) return false;
  r.launch[character] = metres;
  save(r);
  return true;
}

/** Cleared challenges (id -> fighter). */
export function clearedChallenges(): Record<string, string> {
  return { ...load().challenges };
}

/** Mark a challenge cleared; returns true the first time. */
export function recordChallenge(id: string, character: string): boolean {
  const r = load();
  if (r.challenges[id]) return false;
  r.challenges[id] = character;
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
  f.kos += count(kos);
  f.falls += count(falls);
  r.fighters[character] = f;
  save(r);
}

/** Every fighter's lifetime record (missing fighters have played nothing). */
export function fighterRecords(): Record<string, FighterRecord> {
  return Object.fromEntries(Object.entries(load().fighters).map(([k, f]) => [k, { ...f }]));
}

/** Forget everything (Records > RESET). */
export function resetRecords(): void {
  save(empty());
}
