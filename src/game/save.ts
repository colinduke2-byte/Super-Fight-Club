import { CHARACTER_LIST } from '../characters';
import { DIFFICULTY_KEY } from './ladder';
import { LAST_FIGHTER_KEY, QUICK_CPU_KEY } from './quick';
import { RECORDS_VERSION, recordsFrom, recordsSnapshot, replaceRecords, type Records } from './records';
import { favouritesForSave, favouritesFrom, restoreFavourites, vaultCached, type SavedFavourite } from './replayVault';
import { RULES_KEY, sanitizeRules } from './rulesets';
import type { MatchRules } from './session';
import { RUN_RECORDS_KEY, loadRunRecords, type RunRecords } from './runRecords';
import { PROFILES_KEY, listProfiles, profilesFrom, reloadProfiles, type PlayerProfile } from './profiles';

/** Storage keys of the other progress a save carries (owned by trials.ts and tutorial.ts). */
export const TRIALS_KEY = 'sfc.trials.v1';
export const TUTORIAL_KEY = 'sfc.tutorial.v1';

/** Everything beyond the records that a save carries (format 2+). Each part is optional: absent = leave it as it is. */
export interface SaveExtras {
  /** Cleared combo trials, '<fighter>:<trial id>'. */
  trials?: string[];
  /** Tutorial progress. */
  tutorial?: { offered?: boolean; done?: boolean };
  /** Saved versus rules: the last used and the three custom presets. */
  rules?: { last: MatchRules | null; playerCount: number; custom: (MatchRules | null)[] };
  /** The fighter (and outfit) last picked. */
  lastFighter?: { character: string; palette: number };
  /** The arcade difficulty and Quick Match CPU skill last used. */
  arcadeDifficulty?: number;
  quickCpu?: number;
  /** Starred replays from the replay vault (metadata, name and share code), newest first, up to SAVE_VAULT_BYTES of codes. */
  vault?: SavedFavourite[];
  /** Endless, Gauntlet and Boss Battle bests (runRecords.ts). */
  runRecords?: RunRecords;
  /** Local player names and their win counts (profiles.ts). */
  profiles?: PlayerProfile[];
}

/** Validate run records from a save (the same rules runRecords.ts reads storage with; bad entries are dropped). */
export function runRecordsFrom(d: unknown): RunRecords {
  const out: RunRecords = { endless: {}, gauntlet: {}, boss: {} };
  if (!isObj(d)) return out;
  const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null);
  const key = (k: string): boolean => /^[a-z0-9_-]{1,40}$/i.test(k);
  for (const [k, v] of Object.entries(isObj(d.endless) ? d.endless : {})) {
    if (!key(k) || !isObj(v)) continue;
    const wins = num(v.wins);
    const kos = num(v.kos);
    if (wins !== null && kos !== null) out.endless[k] = { wins: Math.floor(wins), kos: Math.floor(kos) };
  }
  for (const [k, v] of Object.entries(isObj(d.gauntlet) ? d.gauntlet : {})) {
    if (!key(k) || !isObj(v)) continue;
    const sec = num(v.sec);
    if (sec !== null) out.gauntlet[k] = { sec, difficulty: Math.max(1, Math.min(4, Math.round(num(v.difficulty) ?? 2))) };
  }
  for (const [k, v] of Object.entries(isObj(d.boss) ? d.boss : {})) {
    if (!/^[1-4]$/.test(k) || !isObj(v)) continue;
    const sec = num(v.sec);
    if (sec !== null && typeof v.fighter === 'string' && key(v.fighter)) out.boss[k] = { sec, fighter: v.fighter, ...(v.coop === true ? { coop: true } : {}) };
  }
  return out;
}

/**
 * Save export / import as plain text (the page cannot download or upload files: the player copies the text out and
 * pastes it back in). The text is JSON: `{ game, save, exported, records, extras }` (`save` is the format version: 1 had
 * only the records; 2 adds `extras`, the trial clears, tutorial progress, saved rules and last picks). Import validates
 * everything again, so a hand-edited or damaged save can only ever load sane values, and old exports still load.
 */
export const SAVE_GAME_ID = 'super-fight-club';
export const SAVE_FORMAT = 2;

export interface SaveFile {
  game: typeof SAVE_GAME_ID;
  save: number;
  exported: string;
  records: Records & { version: number };
  extras?: SaveExtras;
}

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

function readJson(key: string): unknown {
  try {
    const raw = storage()?.getItem(key);
    return raw ? (JSON.parse(raw) as unknown) : null;
  } catch {
    return null;
  }
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const TRIAL_ID = /^[a-z0-9_-]{1,40}:[a-z0-9_-]{1,40}$/i;

/** Validate the extras of a save (anything unreadable is left out, so it does not overwrite what is there). */
export function extrasFrom(d: unknown): SaveExtras {
  const out: SaveExtras = {};
  if (!isObj(d)) return out;
  if (Array.isArray(d.trials)) out.trials = [...new Set(d.trials.filter((v): v is string => typeof v === 'string' && TRIAL_ID.test(v)))];
  if (isObj(d.tutorial)) out.tutorial = { ...(typeof d.tutorial.offered === 'boolean' ? { offered: d.tutorial.offered } : {}), ...(typeof d.tutorial.done === 'boolean' ? { done: d.tutorial.done } : {}) };
  if (isObj(d.rules)) {
    const r = d.rules;
    const pc = typeof r.playerCount === 'number' && Number.isFinite(r.playerCount) ? Math.max(2, Math.min(4, Math.round(r.playerCount))) : 2;
    const custom = Array.isArray(r.custom) ? r.custom : [];
    out.rules = { last: sanitizeRules(r.last), playerCount: pc, custom: [0, 1, 2].map((i) => sanitizeRules(custom[i])) };
  }
  if (isObj(d.lastFighter) && typeof d.lastFighter.character === 'string' && CHARACTER_LIST.some((c) => c.id === (d.lastFighter as { character: string }).character)) {
    const pal = d.lastFighter.palette;
    out.lastFighter = { character: d.lastFighter.character, palette: typeof pal === 'number' && Number.isFinite(pal) ? Math.max(0, Math.floor(pal)) : 0 };
  }
  const int = (v: unknown, lo: number, hi: number): number | undefined => (typeof v === 'number' && Number.isFinite(v) && Math.round(v) >= lo && Math.round(v) <= hi ? Math.round(v) : undefined);
  const ad = int(d.arcadeDifficulty, 1, 4);
  if (ad !== undefined) out.arcadeDifficulty = ad;
  const qc = int(d.quickCpu, 1, 9);
  if (qc !== undefined) out.quickCpu = qc;
  if (Array.isArray(d.vault)) out.vault = favouritesFrom(d.vault);
  if (isObj(d.runRecords)) out.runRecords = runRecordsFrom(d.runRecords);
  if (Array.isArray(d.profiles)) out.profiles = profilesFrom(d.profiles);
  return out;
}

/** The progress kept outside the records, read from storage (for the export). */
export function currentExtras(): SaveExtras {
  const n = (k: string): unknown => {
    const v = readJson(k);
    return typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : undefined;
  };
  const x = extrasFrom({ trials: readJson(TRIALS_KEY), tutorial: readJson(TUTORIAL_KEY), rules: readJson(RULES_KEY), lastFighter: readJson(LAST_FIGHTER_KEY), arcadeDifficulty: n(DIFFICULTY_KEY), quickCpu: n(QUICK_CPU_KEY) });
  // the vault's favourites as last read (the Records screen refreshes the vault before it shows the save)
  const fav = favouritesForSave(vaultCached());
  if (fav.items.length) x.vault = fav.items;
  const runs = loadRunRecords();
  if (Object.keys(runs.endless).length || Object.keys(runs.gauntlet).length || Object.keys(runs.boss).length) x.runRecords = runRecordsFrom(runs);
  const names = listProfiles();
  if (names.length) x.profiles = profilesFrom(names);
  return x;
}

/** Favourites a save export leaves out for size (see SAVE_VAULT_BYTES). */
export function vaultSkippedInSave(): number {
  return favouritesForSave(vaultCached()).skipped;
}

/** Write the extras a save carries into storage (parts it does not carry stay as they are). */
export function applyExtras(x: SaveExtras): void {
  const st = storage();
  if (!st) return;
  const put = (k: string, v: unknown): void => {
    try {
      st.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
    } catch {
      /* storage full / blocked: that part is not restored */
    }
  };
  if (x.trials) put(TRIALS_KEY, x.trials);
  if (x.tutorial) put(TUTORIAL_KEY, x.tutorial);
  if (x.rules) put(RULES_KEY, x.rules);
  if (x.lastFighter) put(LAST_FIGHTER_KEY, x.lastFighter);
  if (x.arcadeDifficulty !== undefined) put(DIFFICULTY_KEY, String(x.arcadeDifficulty));
  if (x.quickCpu !== undefined) put(QUICK_CPU_KEY, String(x.quickCpu));
  if (x.runRecords) put(RUN_RECORDS_KEY, x.runRecords);
  if (x.profiles) {
    put(PROFILES_KEY, { list: x.profiles, last: [] });
    reloadProfiles();
  }
  // the vault is asynchronous storage: its favourites arrive a moment later (and never replace what is there)
  if (x.vault?.length) void restoreFavourites(x.vault).catch(() => undefined);
}

/** The current records and the rest of the saved progress as save text (pretty enough to read, compact enough to paste). */
export function exportSave(now: Date = new Date()): string {
  const file: SaveFile = { game: SAVE_GAME_ID, save: SAVE_FORMAT, exported: now.toISOString(), records: { version: RECORDS_VERSION, ...recordsSnapshot() }, extras: currentExtras() };
  return JSON.stringify(file);
}

export type ImportResult = { ok: true; records: Records; summary: string; extras?: SaveExtras } | { ok: false; error: string };

/** Check save text without loading it: what it holds, or why it cannot be read. */
export function readSave(text: string): ImportResult {
  const t = text.trim();
  if (!t) return { ok: false, error: 'Paste a save first.' };
  let d: unknown;
  try {
    d = JSON.parse(t);
  } catch {
    return { ok: false, error: 'That is not save text (it is not valid JSON).' };
  }
  if (!d || typeof d !== 'object' || Array.isArray(d)) return { ok: false, error: 'That is not save text.' };
  const o = d as Record<string, unknown>;
  // a wrapped export, or a bare records object (what the game keeps in storage)
  let body: unknown = o;
  let extras: SaveExtras | undefined;
  if ('game' in o || 'save' in o) {
    if (o.game !== SAVE_GAME_ID) return { ok: false, error: 'That save is from another game.' };
    if (typeof o.save !== 'number' || o.save > SAVE_FORMAT) return { ok: false, error: 'That save is from a newer version of the game.' };
    body = o.records;
    if (o.save >= 2 && 'extras' in o) extras = extrasFrom(o.extras);
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { ok: false, error: 'That save holds no records.' };
  const v = (body as Record<string, unknown>).version;
  if (typeof v === 'number' && v > RECORDS_VERSION) return { ok: false, error: 'That save is from a newer version of the game.' };
  const known = ['targets', 'fighters', 'launch', 'challenges', 'chalBest', 'arcade', 'stats'];
  if (!known.some((k) => k in (body as object))) return { ok: false, error: 'That save holds no records.' };
  const records = recordsFrom(body);
  return { ok: true, records, summary: summarize(records, extras), ...(extras ? { extras } : {}) };
}

/** Load save text, replacing the current records (and the trial clears, tutorial progress, rules and picks it carries). */
export function importSave(text: string): ImportResult {
  const r = readSave(text);
  if (!r.ok) return r;
  const records = replaceRecords(r.records);
  if (r.extras) applyExtras(r.extras);
  return { ok: true, records, summary: summarize(records, r.extras), ...(r.extras ? { extras: r.extras } : {}) };
}

/** One line on what a save holds. */
export function summarize(r: Records, x?: SaveExtras): string {
  const played = Object.values(r.fighters).reduce((n, f) => n + f.played, 0);
  const clears = Object.values(r.arcade).reduce((n, a) => n + a.clears, 0);
  const chal = Object.keys(r.challenges).length;
  const trials = x?.trials ? `, ${x.trials.length} trials` : '';
  const vault = x?.vault?.length ? `, ${x.vault.length} favourite replays` : '';
  const runs = x?.runRecords ? Object.keys(x.runRecords.endless).length + Object.keys(x.runRecords.gauntlet).length + Object.keys(x.runRecords.boss).length : 0;
  const runText = runs ? `, ${runs} run records` : '';
  const names = x?.profiles?.length ? `, ${x.profiles.length} player names` : '';
  return `${played} versus matches, ${clears} arcade clears, ${chal} challenges cleared, ${Object.keys(r.targets).length} target times${trials}${vault}${runText}${names}`;
}
