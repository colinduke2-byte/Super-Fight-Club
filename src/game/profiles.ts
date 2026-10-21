/**
 * Local player profiles: up to PROFILE_MAX names kept in this browser (localStorage), picked on character select so the
 * name shows on the player's card, their in-match name tag and the results. Optional per-profile win counts.
 *
 * Storage can be missing or throw (private windows, blocked site data): every access is guarded, and the list then lives
 * for this session only.
 */
export const PROFILES_KEY = 'sfc.profiles.v1';
export const PROFILE_MAX = 8;
/** Longest name (it has to fit a name tag and a results row). */
export const PROFILE_NAME_MAX = 8;
/** Letters a name may use (the pixel font's set). */
export const PROFILE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 -.!?';

export interface PlayerProfile {
  id: string;
  name: string;
  /** Matches won and played while picked (versus and arcade fights). */
  wins: number;
  played: number;
}

interface Store {
  list: PlayerProfile[];
  /** The profile each lobby slot (0..3) last picked: offered again when that slot joins. */
  last: (string | null)[];
}

let cache: Store | null = null;
/** The profile each slot of the current match plays as (set on character select; not saved). */
const active: (string | null)[] = [null, null, null, null];

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/** Upper-case, the font's letters only, trimmed and cut to PROFILE_NAME_MAX. */
export function cleanName(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  const up = raw.toUpperCase();
  let out = '';
  for (const ch of up) if (PROFILE_CHARS.includes(ch)) out += ch;
  return out.replace(/\s+/g, ' ').trim().slice(0, PROFILE_NAME_MAX).trim();
}

const count = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0);

/** Validate a stored or imported profile list (bad entries dropped, duplicate names and ids removed, at most PROFILE_MAX). */
export function profilesFrom(d: unknown): PlayerProfile[] {
  const src = Array.isArray(d) ? d : d && typeof d === 'object' && Array.isArray((d as { list?: unknown }).list) ? (d as { list: unknown[] }).list : [];
  const out: PlayerProfile[] = [];
  for (const v of src) {
    if (!v || typeof v !== 'object') continue;
    const o = v as Record<string, unknown>;
    const name = cleanName(o.name);
    const id = typeof o.id === 'string' && /^[a-z0-9]{1,16}$/i.test(o.id) ? o.id : '';
    if (!name || !id || out.some((p) => p.id === id || p.name === name)) continue;
    const played = count(o.played);
    out.push({ id, name, wins: Math.min(count(o.wins), played || count(o.wins)), played });
    if (out.length >= PROFILE_MAX) break;
  }
  return out;
}

function load(): Store {
  if (cache) return cache;
  const st: Store = { list: [], last: [null, null, null, null] };
  try {
    const raw = storage()?.getItem(PROFILES_KEY);
    if (raw) {
      const d = JSON.parse(raw) as unknown;
      st.list = profilesFrom(d);
      const last = d && typeof d === 'object' ? (d as { last?: unknown }).last : null;
      if (Array.isArray(last)) st.last = [0, 1, 2, 3].map((i) => (typeof last[i] === 'string' && st.list.some((p) => p.id === last[i]) ? (last[i] as string) : null));
    }
  } catch {
    /* unreadable: start clean */
  }
  cache = st;
  return st;
}

function persist(): void {
  const st = load();
  try {
    storage()?.setItem(PROFILES_KEY, JSON.stringify({ list: st.list, last: st.last }));
  } catch {
    /* storage full / blocked: the change lasts for this session */
  }
}

/** Forget the cached copy (tests, and after a save import wrote the key directly). */
export function reloadProfiles(): void {
  cache = null;
}

export function listProfiles(): readonly PlayerProfile[] {
  return load().list;
}

export function profileById(id: string | null | undefined): PlayerProfile | undefined {
  return id ? load().list.find((p) => p.id === id) : undefined;
}

export type ProfileResult = { ok: true; profile: PlayerProfile } | { ok: false; error: string };

function newId(list: readonly PlayerProfile[]): string {
  for (let n = list.length + 1; ; n++) {
    const id = `p${Date.now().toString(36)}${n}`;
    if (!list.some((p) => p.id === id)) return id;
  }
}

/** Add a profile (the name is cleaned; empty, duplicate names and a full list are refused). */
export function createProfile(name: string): ProfileResult {
  const st = load();
  const n = cleanName(name);
  if (!n) return { ok: false, error: 'TYPE A NAME FIRST' };
  if (st.list.length >= PROFILE_MAX) return { ok: false, error: `${PROFILE_MAX} NAMES AT MOST` };
  if (st.list.some((p) => p.name === n)) return { ok: false, error: 'THAT NAME IS TAKEN' };
  const profile: PlayerProfile = { id: newId(st.list), name: n, wins: 0, played: 0 };
  st.list.push(profile);
  persist();
  return { ok: true, profile };
}

export function renameProfile(id: string, name: string): ProfileResult {
  const st = load();
  const p = st.list.find((x) => x.id === id);
  if (!p) return { ok: false, error: 'NO SUCH NAME' };
  const n = cleanName(name);
  if (!n) return { ok: false, error: 'TYPE A NAME FIRST' };
  if (st.list.some((x) => x !== p && x.name === n)) return { ok: false, error: 'THAT NAME IS TAKEN' };
  p.name = n;
  persist();
  return { ok: true, profile: p };
}

export function deleteProfile(id: string): boolean {
  const st = load();
  const i = st.list.findIndex((p) => p.id === id);
  if (i < 0) return false;
  st.list.splice(i, 1);
  st.last = st.last.map((x) => (x === id ? null : x));
  for (let k = 0; k < active.length; k++) if (active[k] === id) active[k] = null;
  persist();
  return true;
}

/** Replace the whole list (a save import). */
export function replaceProfiles(list: readonly PlayerProfile[]): void {
  const st = load();
  st.list = profilesFrom(list);
  st.last = st.last.map((x) => (x && st.list.some((p) => p.id === x) ? x : null));
  for (let k = 0; k < active.length; k++) if (active[k] && !st.list.some((p) => p.id === active[k])) active[k] = null;
  persist();
}

/** The profile lobby slot `slot` last picked (offered again when that slot joins). */
export function lastProfileFor(slot: number): string | null {
  const id = load().last[slot] ?? null;
  return id && profileById(id) ? id : null;
}

/**
 * The profile after `current` in the list for a slot, skipping ones other slots hold (`taken`); null = no name. Cycles
 * NONE -> first -> ... -> last -> NONE (dir -1 the other way).
 */
export function cycleProfile(current: string | null, dir: 1 | -1, taken: readonly (string | null)[] = []): string | null {
  const ids: (string | null)[] = [null, ...load().list.map((p) => p.id).filter((id) => id === current || !taken.includes(id))];
  const i = Math.max(0, ids.indexOf(current));
  return ids[(i + dir + ids.length) % ids.length];
}

/** Character select confirmed the line-up: who plays as whom this match (index = lobby slot / match port). */
export function setActiveProfiles(ids: readonly (string | null | undefined)[]): void {
  const st = load();
  for (let k = 0; k < active.length; k++) {
    const id = ids[k] ?? null;
    active[k] = id && profileById(id) ? id : null;
    if (k < ids.length) st.last[k] = active[k];
  }
  persist();
}

/** The name slot `slot` plays under this match (null: none picked). */
export function activeProfileName(slot: number): string | null {
  return profileById(active[slot])?.name ?? null;
}

/** A human's in-match label ('P2') becomes the profile name that player picked on character select, when they picked one. */
export function profileLabel(label: string): string {
  const m = /^P([1-4])$/.exec(label);
  return (m && activeProfileName(Number(m[1]) - 1)) ?? label;
}

export function activeProfileId(slot: number): string | null {
  return profileById(active[slot]) ? active[slot] : null;
}

/** A finished match: the profile on slot `winner` gets a win, every named human a match played (once per result object). */
const counted = new WeakSet<object>();
export function noteProfileResult(result: object, humanSlots: readonly number[], winnerSlots: readonly number[]): void {
  if (counted.has(result)) return;
  counted.add(result);
  let changed = false;
  for (const s of humanSlots) {
    const p = profileById(active[s]);
    if (!p) continue;
    p.played++;
    if (winnerSlots.includes(s)) p.wins++;
    changed = true;
  }
  if (changed) persist();
}
