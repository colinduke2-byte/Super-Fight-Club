/**
 * Personal records kept in this browser: per-fighter versus numbers, Target Smash / Launch Contest bests, challenge
 * medals, arcade clears and lifetime stats. Storage can be unavailable: everything degrades to "no record".
 * Nothing here unlocks anything (the whole game is open); it only keeps score.
 */
const KEY = 'sfc-records-v1';

/** Lifetime numbers for one fighter (human-controlled matches only). */
export interface FighterRecord {
  played: number;
  wins: number;
  kos: number;
  falls: number;
}

/** Arcade Ladder clears for one fighter. `bestSec` 0 = never cleared; `hardestClear` 0 = never, else the difficulty (1 easy .. 4 very hard). */
export interface ArcadeRecord {
  clears: number;
  bestSec: number;
  bestScore: number;
  /** Clears without spending a continue. */
  noContinue: number;
  hardestClear: number;
}

/** Wins and losses of one fighter (yours) against another. */
export interface MatchupRecord {
  w: number;
  l: number;
}

/** Lifetime totals over every recorded match. */
export interface LifetimeStats {
  matches: number;
  /** Seconds of match time. */
  playSec: number;
  kos: number;
  falls: number;
  damage: number;
  /** Longest combo (hits) by a human, and with whom. */
  bestCombo: number;
  bestComboBy: string;
  ultimateKos: number;
  /** Matches per stage id. */
  stages: Record<string, number>;
  /** Matches per stage id that a human player won (alone or on the winning team). */
  stageWins: Record<string, number>;
  /** your fighter -> opponent fighter -> wins / losses. */
  matchups: Record<string, Record<string, MatchupRecord>>;
}

/** Best medal (1 bronze, 2 silver, 3 gold) and fastest clear (seconds) of one challenge. */
export interface ChallengeBest {
  tier: number;
  sec: number;
}

export interface Records {
  targets: Record<string, number>;
  fighters: Record<string, FighterRecord>;
  /** Launch Contest best distance (metres) per fighter. */
  launch: Record<string, number>;
  /** Cleared challenges: id -> the fighter that cleared it first. */
  challenges: Record<string, string>;
  /** Challenge medals and best times. */
  chalBest: Record<string, ChallengeBest>;
  /** Arcade Ladder clears per fighter. */
  arcade: Record<string, ArcadeRecord>;
  stats: LifetimeStats;
  /** The last HISTORY_MAX finished matches, newest first. */
  history: HistoryEntry[];
}

/** One finished match in the history. */
export interface HistoryEntry {
  /** When it ended (ms since 1970). */
  date: number;
  /** versus, arcade, challenge, targets, launch... */
  mode: string;
  stage: string;
  fighters: { character: string; type: 'human' | 'cpu'; placement: number }[];
  /** One line: "P1 WINS", "DRAW", "CLEAR 0:42.10"... */
  result: string;
  /** Match length in seconds. */
  sec: number;
}

/** Matches the history keeps. */
export const HISTORY_MAX = 50;

/** Version of the saved shape. v1: no version field; v2: same fields + version; v3 adds chalBest, arcade, stats. */
export const RECORDS_VERSION = 3;

const emptyStats = (): LifetimeStats => ({ matches: 0, playSec: 0, kos: 0, falls: 0, damage: 0, bestCombo: 0, bestComboBy: '', ultimateKos: 0, stages: {}, stageWins: {}, matchups: {} });
export const emptyRecords = (): Records => ({ targets: {}, fighters: {}, launch: {}, challenges: {}, chalBest: {}, arcade: {}, stats: emptyStats(), history: [] });
const empty = emptyRecords;

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const positive = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0;
const count = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0);
const amount = (v: unknown): number => (positive(v) ? v : 0);
/** Ids are short plain strings; anything else (or a prototype key) is dropped. */
const okId = (k: string): boolean => k.length > 0 && k.length <= 40 && k !== '__proto__' && k !== 'constructor' && k !== 'prototype';

function positives(v: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (isObj(v)) for (const [k, n] of Object.entries(v)) if (okId(k) && positive(n)) out[k] = n;
  return out;
}

function parseStats(v: unknown): LifetimeStats {
  const s = emptyStats();
  if (!isObj(v)) return s;
  s.matches = count(v.matches);
  s.playSec = amount(v.playSec);
  s.kos = count(v.kos);
  s.falls = count(v.falls);
  s.damage = amount(v.damage);
  s.bestCombo = count(v.bestCombo);
  s.bestComboBy = s.bestCombo && typeof v.bestComboBy === 'string' && okId(v.bestComboBy) ? v.bestComboBy : '';
  s.ultimateKos = count(v.ultimateKos);
  for (const [k, n] of Object.entries(positives(v.stages))) s.stages[k] = Math.floor(n);
  // wins can never exceed the matches played there
  for (const [k, n] of Object.entries(positives(v.stageWins))) if (s.stages[k]) s.stageWins[k] = Math.min(s.stages[k], Math.floor(n));
  if (isObj(v.matchups)) {
    for (const [me, row] of Object.entries(v.matchups)) {
      if (!okId(me) || !isObj(row)) continue;
      const out: Record<string, MatchupRecord> = {};
      for (const [them, m] of Object.entries(row)) {
        if (!okId(them) || !isObj(m)) continue;
        const w = count(m.w);
        const l = count(m.l);
        if (w || l) out[them] = { w, l };
      }
      if (Object.keys(out).length) s.matchups[me] = out;
    }
  }
  return s;
}

/** Parse saved records, dropping anything that is not a sane number (or fighter name, for challenges). */
export function parseRecords(raw: string | null): Records {
  if (!raw) return empty();
  let d: unknown;
  try {
    d = JSON.parse(raw);
  } catch {
    return empty();
  }
  return recordsFrom(d);
}

/** Validate an already-parsed object into records (used by parseRecords and the save import). */
export function recordsFrom(d: unknown): Records {
  const r = empty();
  if (!isObj(d)) return r;
  r.targets = positives(d.targets);
  r.launch = positives(d.launch);
  if (isObj(d.fighters)) {
    for (const [k, f] of Object.entries(d.fighters)) {
      if (!okId(k) || !isObj(f)) continue;
      const played = count(f.played);
      // wins can never exceed matches played
      r.fighters[k] = { played, wins: Math.min(played, count(f.wins)), kos: count(f.kos), falls: count(f.falls) };
    }
  }
  if (isObj(d.challenges)) for (const [k, c] of Object.entries(d.challenges)) if (okId(k) && typeof c === 'string' && c) r.challenges[k] = c;
  if (isObj(d.chalBest)) {
    for (const [k, b] of Object.entries(d.chalBest)) {
      if (!okId(k) || !isObj(b)) continue;
      const tier = Math.min(3, count(b.tier));
      if (tier) r.chalBest[k] = { tier, sec: amount(b.sec) };
    }
  }
  if (isObj(d.arcade)) {
    for (const [k, a] of Object.entries(d.arcade)) {
      if (!okId(k) || !isObj(a)) continue;
      const clears = count(a.clears);
      if (!clears) continue;
      r.arcade[k] = { clears, bestSec: amount(a.bestSec), bestScore: count(a.bestScore), noContinue: Math.min(clears, count(a.noContinue)), hardestClear: Math.min(MAX_DIFFICULTY, count(a.hardestClear)) };
    }
  }
  r.stats = parseStats(d.stats);
  r.history = parseHistory(d.history);
  return r;
}

const SHORT = /^[A-Za-z0-9 _.:%+\-!/()']{0,40}$/;

function parseHistory(v: unknown): HistoryEntry[] {
  if (!Array.isArray(v)) return [];
  const out: HistoryEntry[] = [];
  for (const h of v) {
    if (out.length >= HISTORY_MAX) break;
    if (!isObj(h) || !Array.isArray(h.fighters) || typeof h.mode !== 'string' || !okId(h.mode) || typeof h.stage !== 'string' || !okId(h.stage)) continue;
    const fighters = h.fighters
      .filter(isObj)
      .slice(0, 8)
      .filter((f) => typeof f.character === 'string' && okId(f.character))
      .map((f) => ({ character: f.character as string, type: f.type === 'human' ? ('human' as const) : ('cpu' as const), placement: Math.min(8, count(f.placement)) }));
    if (!fighters.length) continue;
    out.push({ date: amount(h.date), mode: h.mode, stage: h.stage, fighters, result: typeof h.result === 'string' && SHORT.test(h.result) ? h.result : '', sec: amount(h.sec) });
  }
  return out;
}

/** The parsed records, kept between calls; dropped when another tab writes them (storage event) or on reset. */
let cache: Records | null = null;

/** False once storage refused a read or a write: the cached copy is then the only up-to-date one. */
let storageOk = true;

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

/**
 * The records as they are in storage right now, for a change about to be written: another tab may have saved since this
 * one cached its copy, so every write starts from a fresh read and applies only its own change on top (two open tabs
 * never overwrite each other's results). Falls back to the cached copy when storage cannot be read or written.
 */
function loadForWrite(): Records {
  if (!storageOk && cache) return cache;
  let raw: string | null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    storageOk = false;
    return load();
  }
  cache = parseRecords(raw);
  return cache;
}

function save(r: Records): void {
  cache = r;
  try {
    localStorage.setItem(KEY, JSON.stringify({ version: RECORDS_VERSION, ...r }));
    storageOk = true;
  } catch {
    storageOk = false; // the records still last for this session
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

/** A deep copy of everything (save export, charts). */
export function recordsSnapshot(): Records {
  return JSON.parse(JSON.stringify(load())) as Records;
}

/** Replace everything (save import); the input is validated again, so a hand-edited save cannot store junk. */
export function replaceRecords(r: unknown): Records {
  const clean = recordsFrom(r);
  save(clean);
  return recordsSnapshot();
}

/** Best Target Smash time (sim ticks) for a fighter, or null. */
export function bestTargetTime(character: string): number | null {
  return load().targets[character] ?? null;
}

/** Record a cleared run; returns true when it beats the previous best. */
export function recordTargetTime(character: string, ticks: number): boolean {
  if (!positive(ticks)) return false;
  const r = loadForWrite();
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
  const r = loadForWrite();
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
  const r = loadForWrite();
  if (r.challenges[id]) return false;
  r.challenges[id] = character;
  save(r);
  return true;
}

/** Best medal and time per challenge id. */
export function challengeBests(): Record<string, ChallengeBest> {
  return Object.fromEntries(Object.entries(load().chalBest).map(([k, b]) => [k, { ...b }]));
}

export interface ChallengeRunOutcome {
  /** First clear of this challenge. */
  firstClear: boolean;
  /** A better medal than before. */
  newTier: boolean;
  /** A faster clear than before. */
  newBestTime: boolean;
  /** Best medal now held. */
  tier: number;
}

/**
 * Record a cleared challenge run: `tier` 1 bronze, 2 silver, 3 gold (0 = not cleared: nothing changes), `sec` its time.
 * Keeps the best medal and the fastest clear separately, and marks the challenge cleared (first fighter) as before.
 */
export function recordChallengeTier(id: string, character: string, tier: number, sec: number): ChallengeRunOutcome {
  const r = loadForWrite();
  const prev = r.chalBest[id];
  const t = Math.max(0, Math.min(3, Math.floor(tier || 0)));
  const out: ChallengeRunOutcome = { firstClear: false, newTier: false, newBestTime: false, tier: prev?.tier ?? 0 };
  if (!t) return out;
  out.firstClear = !r.challenges[id];
  if (out.firstClear) r.challenges[id] = character;
  const s = positive(sec) ? sec : 0;
  const next: ChallengeBest = { tier: Math.max(t, prev?.tier ?? 0), sec: prev?.sec ?? 0 };
  if (s && (!next.sec || s < next.sec)) {
    out.newBestTime = !!prev?.sec;
    next.sec = s;
  }
  out.newTier = next.tier > (prev?.tier ?? 0);
  out.tier = next.tier;
  r.chalBest[id] = next;
  save(r);
  return out;
}

/** m:ss.cc from sim ticks (60 Hz). */
export function formatTicks(ticks: number): string {
  const cs = Math.floor((ticks / 60) * 100);
  const m = Math.floor(cs / 6000);
  const s = Math.floor((cs % 6000) / 100);
  return `${m}:${String(s).padStart(2, '0')}.${String(cs % 100).padStart(2, '0')}`;
}

/** m:ss from seconds (h:mm:ss past an hour). */
export function formatSec(sec: number): string {
  const t = Math.max(0, Math.floor(sec));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}

/** Add one finished match for a human-controlled fighter. */
export function recordMatch(character: string, won: boolean, kos: number, falls: number): void {
  const r = loadForWrite();
  const f = r.fighters[character] ?? { played: 0, wins: 0, kos: 0, falls: 0 };
  f.played++;
  if (won) f.wins++;
  f.kos += count(kos);
  f.falls += count(falls);
  r.fighters[character] = f;
  save(r);
}

/** Add a finished match to the history (newest first; the oldest past HISTORY_MAX drops off). */
export function recordHistory(e: HistoryEntry): void {
  const clean = parseHistory([e]);
  if (!clean.length) return;
  const r = loadForWrite();
  r.history = [clean[0], ...r.history].slice(0, HISTORY_MAX);
  save(r);
}

/** The match history, newest first. */
export function matchHistory(): HistoryEntry[] {
  return load().history.map((h) => ({ ...h, fighters: h.fighters.map((f) => ({ ...f })) }));
}

/** Per stage: matches played with a human and how many a human won (win rate = wins / played). */
export function stageWinRates(): { stage: string; played: number; wins: number }[] {
  const s = load().stats;
  return Object.entries(s.stages)
    .map(([stage, played]) => ({ stage, played, wins: Math.min(played, s.stageWins[stage] ?? 0) }))
    .sort((a, b) => b.played - a.played);
}

/** One fighter's head-to-head record against every opponent it has met (most played first). */
export function fighterMatchups(character: string): { opponent: string; w: number; l: number }[] {
  const row = load().stats.matchups[character] ?? {};
  return Object.entries(row)
    .map(([opponent, m]) => ({ opponent, w: m.w, l: m.l }))
    .sort((a, b) => b.w + b.l - (a.w + a.l));
}

/** Every fighter's lifetime record (missing fighters have played nothing). */
export function fighterRecords(): Record<string, FighterRecord> {
  return Object.fromEntries(Object.entries(load().fighters).map(([k, f]) => [k, { ...f }]));
}

// ---- lifetime stats ------------------------------------------------------------------------------------------------

/** The slice of a finished match recordMatchStats reads (a MatchResult fits; `ultimateKos` is optional per player). */
export interface StatsMatch {
  winner: number;
  winnerTeam: number;
  durationSec: number;
  players: {
    index: number;
    character: string;
    type: 'human' | 'cpu';
    kos: number;
    falls: number;
    damageDealt: number;
    bestCombo?: number;
    placement: number;
    team: number;
    /** KOs scored with an ultimate (optional: the match flow counts them). */
    ultimateKos?: number;
  }[];
}

/**
 * Lifetime stats for one finished match: play time, stage use, totals and longest combo of the human players, and
 * the head-to-head table (each human against every opponent: a win when they finished ahead, by team or placement).
 * Does nothing for a match without a human. `ultimateKos` (player index -> KOs) overrides the per-player field.
 */
export function recordMatchStats(result: StatsMatch, stage: string, ultimateKos?: Record<number, number>): void {
  const humans = result.players.filter((p) => p.type === 'human');
  if (!humans.length) return;
  const r = loadForWrite();
  const s = r.stats;
  s.matches++;
  s.playSec += amount(result.durationSec);
  if (stage && okId(stage)) {
    s.stages[stage] = (s.stages[stage] ?? 0) + 1;
    const humanWon = humans.some((p) => (result.winnerTeam >= 0 ? p.team === result.winnerTeam : p.index === result.winner));
    if (humanWon) s.stageWins[stage] = (s.stageWins[stage] ?? 0) + 1;
  }
  for (const p of humans) {
    s.kos += count(p.kos);
    s.falls += count(p.falls);
    s.damage += amount(p.damageDealt);
    s.ultimateKos += count(ultimateKos?.[p.index] ?? p.ultimateKos);
    const combo = count(p.bestCombo);
    if (combo > s.bestCombo) {
      s.bestCombo = combo;
      s.bestComboBy = p.character;
    }
    for (const q of result.players) {
      if (q === p) continue;
      const teams = result.winnerTeam >= 0 || (p.team >= 0 && q.team >= 0);
      if (teams && p.team === q.team) continue; // a team-mate is not an opponent
      let won: boolean | null;
      if (result.winnerTeam >= 0) won = p.team === result.winnerTeam ? true : q.team === result.winnerTeam ? false : null;
      else if (result.winner === p.index) won = true;
      else if (result.winner === q.index) won = false;
      else won = p.placement < q.placement ? true : p.placement > q.placement ? false : null;
      if (won === null) continue;
      const row = (s.matchups[p.character] ??= {});
      const m = (row[q.character] ??= { w: 0, l: 0 });
      if (won) m.w++;
      else m.l++;
    }
  }
  save(r);
}

/** A copy of the lifetime stats. */
export function lifetimeStats(): LifetimeStats {
  return JSON.parse(JSON.stringify(load().stats)) as LifetimeStats;
}

/** The stage with the most recorded matches ('' when none). */
export function mostUsedStage(): string {
  let best = '';
  let n = 0;
  for (const [k, v] of Object.entries(load().stats.stages)) if (v > n) [best, n] = [k, v];
  return best;
}

// ---- arcade --------------------------------------------------------------------------------------------------------

/** What a finished (cleared) Arcade Ladder run reports. */
export interface ArcadeRun {
  /** Total KOs over the won fights. */
  kos: number;
  /** Seconds over the won fights. */
  seconds: number;
  continuesUsed: number;
  /** Difficulty the run was played at (1 easy, 2 normal, 3 hard, 4 very hard). */
  difficulty: number;
}

/** Arcade difficulties run 1 (easy) to 4 (very hard). */
export const MAX_DIFFICULTY = 4;
/** Names of the arcade difficulties (index 0: never cleared). */
export const DIFFICULTY_LABELS = ['-', 'EASY', 'NORMAL', 'HARD', 'VERY HARD'] as const;
/** Score multiplier per difficulty. */
const DIFFICULTY_SCORE = [0, 0.8, 1, 1.25, 1.5];
const difficultyOf = (d: unknown): number => Math.max(1, Math.min(MAX_DIFFICULTY, Math.round(Number(d) || 2)));

/** Score for a cleared run at or above this earns the third arcade star. */
export const ARCADE_STAR_SCORE = 45000;

/**
 * Arcade score: 10 000 for the clear, 500 per KO, 20 per second under a 20-minute par, 5 000 for a run without
 * continues and minus 2 500 per continue; the total is scaled by difficulty (x0.8 easy, x1 normal, x1.25 hard, x1.5 very hard),
 * rounded to tens and never negative.
 */
export function arcadeScore(run: ArcadeRun): number {
  const cont = count(run.continuesUsed);
  const raw = 10000 + count(run.kos) * 500 + Math.max(0, 1200 - amount(run.seconds)) * 20 + (cont ? -2500 * cont : 5000);
  const k = DIFFICULTY_SCORE[difficultyOf(run.difficulty)];
  return Math.max(0, Math.round((raw * k) / 10) * 10);
}

/** Arcade stars for a fighter: one for a clear, one for a clear without continues, one for a score of ARCADE_STAR_SCORE+. */
export function arcadeStars(a: ArcadeRecord | undefined): number {
  if (!a || !a.clears) return 0;
  return 1 + (a.noContinue > 0 ? 1 : 0) + (a.bestScore >= ARCADE_STAR_SCORE ? 1 : 0);
}

export interface ArcadeClearOutcome {
  score: number;
  newBestScore: boolean;
  newBestTime: boolean;
  firstClear: boolean;
  stars: number;
  prevStars: number;
}

/** Record a cleared Arcade Ladder run for `character`; returns the run's score and what it improved. */
export function recordArcadeClear(character: string, run: ArcadeRun): ArcadeClearOutcome {
  const r = loadForWrite();
  const prev = r.arcade[character];
  const prevStars = arcadeStars(prev);
  const score = arcadeScore(run);
  const sec = amount(run.seconds);
  const a: ArcadeRecord = prev ? { ...prev } : { clears: 0, bestSec: 0, bestScore: 0, noContinue: 0, hardestClear: 0 };
  a.clears++;
  if (!count(run.continuesUsed)) a.noContinue++;
  a.hardestClear = Math.max(a.hardestClear, difficultyOf(run.difficulty));
  const newBestScore = score > a.bestScore;
  if (newBestScore) a.bestScore = score;
  const newBestTime = sec > 0 && (!a.bestSec || sec < a.bestSec);
  if (newBestTime) a.bestSec = sec;
  r.arcade[character] = a;
  save(r);
  return { score, newBestScore: newBestScore && !!prev, newBestTime: newBestTime && !!prev?.bestSec, firstClear: !prev, stars: arcadeStars(a), prevStars };
}

/** Every fighter's arcade record (fighters with no clear are missing). */
export function arcadeRecords(): Record<string, ArcadeRecord> {
  return Object.fromEntries(Object.entries(load().arcade).map(([k, a]) => [k, { ...a }]));
}

// ---- resets --------------------------------------------------------------------------------------------------------

/** The parts of the save that can be reset on their own (Records > SAVE DATA). */
export type RecordSection = 'fighters' | 'arcade' | 'challenges' | 'targets' | 'launch' | 'stats' | 'history';
export const RECORD_SECTIONS: { id: RecordSection; label: string }[] = [
  { id: 'fighters', label: 'Versus records' },
  { id: 'arcade', label: 'Arcade clears' },
  { id: 'challenges', label: 'Challenge medals' },
  { id: 'targets', label: 'Target Smash times' },
  { id: 'launch', label: 'Launch Contest distances' },
  { id: 'stats', label: 'Lifetime stats and matchups' },
  { id: 'history', label: 'Match history' },
];

/** Forget one section. */
export function resetRecordSection(section: RecordSection): void {
  const r = loadForWrite();
  if (section === 'challenges') {
    r.challenges = {};
    r.chalBest = {};
  } else if (section === 'stats') r.stats = emptyStats();
  else if (section === 'history') r.history = [];
  else r[section] = {};
  save(r);
}

/** Forget everything (Records > RESET). */
export function resetRecords(): void {
  save(empty());
}
