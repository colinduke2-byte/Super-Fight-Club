import { fromShareCode, replayDataVersion, toShareCode, type Replay, type ReplayMeta, type ShareResult } from './replay';

/**
 * The replay vault: finished matches kept in this browser. The last VAULT_RECENT matches are kept automatically (older ones
 * drop off as new ones come in); up to VAULT_STARS starred favourites are kept until they are unstarred or deleted.
 *
 * Storage is IndexedDB (a replay is a few kilobytes of share code, too many for localStorage alone), falling back to
 * localStorage and then to memory (private windows, blocked storage: the vault then lasts for the session). Every change
 * reads the stored list afresh and applies only its own edit in one transaction, so two open tabs never undo each other's
 * changes; other tabs hear about it over a BroadcastChannel (or the storage event).
 */
export const VAULT_RECENT = 10;
export const VAULT_STARS = 50;
/** Longest name a replay can be given. */
export const VAULT_NAME_MAX = 24;

export interface VaultEntry {
  id: string;
  meta: ReplayMeta;
  /** The replay itself, as a share code (see toShareCode). */
  code: string;
  starred: boolean;
  /** The player's own name for it ('' = none). */
  name: string;
  /** When it entered the vault (or was last unstarred): the recent list keeps the newest. */
  savedAt: number;
}

/** Where the entries live. `edit` gets the stored list and returns what to write and delete, in one transaction. */
export interface VaultBackend {
  readonly kind: 'indexeddb' | 'localstorage' | 'memory';
  all(): Promise<VaultEntry[]>;
  edit<T>(fn: (entries: VaultEntry[]) => { put?: VaultEntry[]; del?: string[]; out: T }): Promise<T>;
}

// ---- backends ------------------------------------------------------------------------------------------------------

export class MemoryVault implements VaultBackend {
  readonly kind = 'memory' as const;
  private readonly map = new Map<string, VaultEntry>();
  async all(): Promise<VaultEntry[]> {
    return [...this.map.values()].map((e) => structuredCloneEntry(e));
  }
  async edit<T>(fn: (entries: VaultEntry[]) => { put?: VaultEntry[]; del?: string[]; out: T }): Promise<T> {
    const r = fn(await this.all());
    for (const id of r.del ?? []) this.map.delete(id);
    for (const e of r.put ?? []) this.map.set(e.id, structuredCloneEntry(e));
    return r.out;
  }
}

const LS_KEY = 'sfc.replays.v1';

export class LocalStorageVault implements VaultBackend {
  readonly kind = 'localstorage' as const;
  constructor(private readonly ls: Storage) {}
  async all(): Promise<VaultEntry[]> {
    return this.read();
  }
  private read(): VaultEntry[] {
    try {
      const v = JSON.parse(this.ls.getItem(LS_KEY) ?? '[]') as unknown;
      return Array.isArray(v) ? v.map(cleanEntry).filter((e): e is VaultEntry => !!e) : [];
    } catch {
      return [];
    }
  }
  async edit<T>(fn: (entries: VaultEntry[]) => { put?: VaultEntry[]; del?: string[]; out: T }): Promise<T> {
    const list = this.read();
    const r = fn(list.map(structuredCloneEntry));
    const del = new Set(r.del ?? []);
    const map = new Map(list.filter((e) => !del.has(e.id)).map((e) => [e.id, e]));
    for (const e of r.put ?? []) map.set(e.id, e);
    this.ls.setItem(LS_KEY, JSON.stringify([...map.values()])); // (a full store throws: the caller reports it)
    return r.out;
  }
}

const DB = 'sfc-replays';
const STORE = 'replays';

export class IdbVault implements VaultBackend {
  readonly kind = 'indexeddb' as const;
  constructor(private readonly db: IDBDatabase) {}

  static open(idb: IDBFactory, timeoutMs = 1500): Promise<IdbVault> {
    return new Promise((resolve, reject) => {
      let done = false;
      const timer = setTimeout(() => {
        done = true;
        reject(new Error('indexedDB timed out'));
      }, timeoutMs);
      let req: IDBOpenDBRequest;
      try {
        req = idb.open(DB, 1);
      } catch (e) {
        clearTimeout(timer);
        reject(e as Error);
        return;
      }
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: 'id' });
      };
      req.onsuccess = () => {
        clearTimeout(timer);
        if (done) req.result.close();
        else resolve(new IdbVault(req.result));
      };
      req.onerror = () => {
        clearTimeout(timer);
        reject(req.error ?? new Error('indexedDB failed'));
      };
      req.onblocked = () => {
        /* another tab holds an older version open: onsuccess follows once it closes */
      };
    });
  }

  all(): Promise<VaultEntry[]> {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).getAll();
      req.onsuccess = () => resolve((req.result as unknown[]).map(cleanEntry).filter((e): e is VaultEntry => !!e));
      req.onerror = () => reject(req.error);
    });
  }

  edit<T>(fn: (entries: VaultEntry[]) => { put?: VaultEntry[]; del?: string[]; out: T }): Promise<T> {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(STORE, 'readwrite');
      const st = tx.objectStore(STORE);
      let out: T;
      const req = st.getAll();
      req.onsuccess = () => {
        try {
          const r = fn((req.result as unknown[]).map(cleanEntry).filter((e): e is VaultEntry => !!e));
          out = r.out;
          for (const id of r.del ?? []) st.delete(id);
          for (const e of r.put ?? []) st.put(e);
        } catch (e) {
          tx.abort();
          reject(e as Error);
        }
      };
      tx.oncomplete = () => resolve(out);
      tx.onerror = () => reject(tx.error ?? new Error('vault write failed'));
      tx.onabort = () => reject(tx.error ?? new Error('vault write aborted'));
    });
  }
}

function structuredCloneEntry(e: VaultEntry): VaultEntry {
  return { ...e, meta: { ...e.meta, fighters: e.meta.fighters.map((f) => ({ ...f })) } };
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** A stored entry checked field by field (null: unreadable). */
export function cleanEntry(v: unknown): VaultEntry | null {
  if (!isObj(v) || typeof v.id !== 'string' || typeof v.code !== 'string' || !isObj(v.meta)) return null;
  const m = v.meta;
  if (!Array.isArray(m.fighters) || typeof m.stage !== 'string') return null;
  const fighters = m.fighters.filter(isObj).map((f) => ({ character: String(f.character ?? ''), palette: Number(f.palette) || 0, type: f.type === 'human' ? ('human' as const) : ('cpu' as const), ...(f.boss ? { boss: true } : {}) }));
  const num = (x: unknown, d: number): number => (typeof x === 'number' && Number.isFinite(x) ? x : d);
  const mode = m.mode === 'arcade' || m.mode === 'challenge' ? m.mode : 'versus';
  const meta: ReplayMeta = {
    date: num(m.date, 0),
    mode,
    stage: m.stage,
    fighters,
    winner: num(m.winner, -1),
    winnerTeam: num(m.winnerTeam, -1),
    result: typeof m.result === 'string' ? m.result.slice(0, 40) : 'DRAW',
    ticks: Math.max(0, num(m.ticks, 0)),
    version: typeof m.version === 'string' ? m.version : '?',
    ...(typeof m.endHash === 'number' ? { endHash: m.endHash } : {}),
  };
  return { id: v.id, meta, code: v.code, starred: v.starred === true, name: typeof v.name === 'string' ? v.name.slice(0, VAULT_NAME_MAX) : '', savedAt: num(v.savedAt, meta.date) };
}

// ---- the vault -----------------------------------------------------------------------------------------------------

let backend: Promise<VaultBackend> | null = null;

/** The storage in use: IndexedDB, else localStorage, else memory. */
export function vaultBackend(): Promise<VaultBackend> {
  if (backend) return backend;
  backend = (async (): Promise<VaultBackend> => {
    try {
      if (typeof indexedDB !== 'undefined') return await IdbVault.open(indexedDB);
    } catch {
      /* blocked: try localStorage */
    }
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.getItem(LS_KEY);
        return new LocalStorageVault(localStorage);
      }
    } catch {
      /* blocked too */
    }
    return new MemoryVault();
  })();
  return backend;
}

/** Use this storage instead (tests). */
export function setVaultBackend(b: VaultBackend | null): void {
  backend = b ? Promise.resolve(b) : null;
  cache = [];
}

/** The last list read (newest first), for code that cannot wait (the save export). */
let cache: VaultEntry[] = [];
export function vaultCached(): readonly VaultEntry[] {
  return cache;
}

const listeners = new Set<() => void>();
let channel: BroadcastChannel | null = null;

function ensureChannel(): void {
  if (channel || typeof BroadcastChannel === 'undefined') return;
  try {
    channel = new BroadcastChannel('sfc-replay-vault');
    channel.onmessage = () => notify();
  } catch {
    channel = null;
  }
  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('storage', (e: StorageEvent) => {
      if (e.key === LS_KEY) notify();
    });
  }
}

function notify(): void {
  for (const l of listeners) l();
}

function changed(): void {
  notify();
  try {
    channel?.postMessage('changed');
  } catch {
    /* closed */
  }
}

/** Called whenever the vault changes (here or in another tab). Returns an unsubscribe function. */
export function onVaultChange(fn: () => void): () => void {
  ensureChannel();
  listeners.add(fn);
  return () => listeners.delete(fn);
}

const newest = (a: VaultEntry, b: VaultEntry): number => b.meta.date - a.meta.date || b.savedAt - a.savedAt;

/** Every entry, newest match first. */
export async function vaultList(): Promise<VaultEntry[]> {
  const b = await vaultBackend();
  const list = (await b.all()).sort(newest);
  cache = list;
  return list;
}

/** Can this replay play in this version of the game? (Recorded with other game data: it is outdated.) */
export function isPlayable(meta: Pick<ReplayMeta, 'version'>): boolean {
  return meta.version === replayDataVersion();
}

/** Unstarred entries beyond the newest VAULT_RECENT (to delete). */
function overflow(list: VaultEntry[]): string[] {
  return list
    .filter((e) => !e.starred)
    .sort((a, b) => b.savedAt - a.savedAt || b.meta.date - a.meta.date)
    .slice(VAULT_RECENT)
    .map((e) => e.id);
}

let idSeq = 0;
function newId(now: number): string {
  return `${now.toString(36)}-${(idSeq++).toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`;
}

/** A finished match into the vault (as a recent; the oldest recent beyond VAULT_RECENT drops off). */
export async function vaultAdd(replay: Replay, meta: ReplayMeta, opts: { starred?: boolean; name?: string; now?: number } = {}): Promise<VaultEntry> {
  const code = await toShareCode(replay, meta);
  return vaultAddCode(code, meta, opts);
}

/** An entry from its share code and metadata (an import, a save's favourites). Starred when asked and there is room. */
export async function vaultAddCode(code: string, meta: ReplayMeta, opts: { starred?: boolean; name?: string; now?: number } = {}): Promise<VaultEntry> {
  const now = opts.now ?? Date.now();
  const b = await vaultBackend();
  const entry = await b.edit((list) => {
    const same = list.find((e) => e.code === code);
    if (same) {
      // already here: a starred import stars it (room permitting)
      if (opts.starred && !same.starred && list.filter((e) => e.starred).length < VAULT_STARS) {
        same.starred = true;
        if (opts.name) same.name = opts.name.slice(0, VAULT_NAME_MAX);
        return { put: [same], out: same };
      }
      return { out: same };
    }
    const starred = !!opts.starred && list.filter((e) => e.starred).length < VAULT_STARS;
    const e: VaultEntry = { id: newId(now), meta, code, starred, name: (opts.name ?? '').slice(0, VAULT_NAME_MAX), savedAt: now };
    return { put: [e], del: overflow([...list, e]).filter((id) => id !== e.id || !starred), out: e };
  });
  await vaultList();
  changed();
  return entry;
}

export type VaultResult = { ok: true } | { ok: false; error: string };

/** Star (keep for good) or unstar. Unstarring makes it the newest recent; starring fails once VAULT_STARS are starred. */
export async function vaultStar(id: string, on: boolean, now = Date.now()): Promise<VaultResult> {
  const b = await vaultBackend();
  const r = await b.edit<VaultResult>((list) => {
    const e = list.find((x) => x.id === id);
    if (!e) return { out: { ok: false, error: 'That replay is gone.' } };
    if (e.starred === on) return { out: { ok: true } };
    if (on && list.filter((x) => x.starred).length >= VAULT_STARS) return { out: { ok: false, error: `${VAULT_STARS} favourites already: unstar one first.` } };
    e.starred = on;
    if (!on) e.savedAt = now;
    return { put: [e], del: overflow(list), out: { ok: true } };
  });
  await vaultList();
  changed();
  return r;
}

export async function vaultRename(id: string, name: string): Promise<VaultResult> {
  const clean = name.replace(/[^\x20-\x7e]/g, '').trim().slice(0, VAULT_NAME_MAX);
  const b = await vaultBackend();
  const r = await b.edit<VaultResult>((list) => {
    const e = list.find((x) => x.id === id);
    if (!e) return { out: { ok: false, error: 'That replay is gone.' } };
    e.name = clean;
    return { put: [e], out: { ok: true } };
  });
  await vaultList();
  changed();
  return r;
}

export async function vaultDelete(id: string): Promise<void> {
  const b = await vaultBackend();
  await b.edit(() => ({ del: [id], out: null }));
  await vaultList();
  changed();
}

/** An entry's replay, decoded (and refused when outdated). */
export async function vaultLoad(e: VaultEntry): Promise<ShareResult> {
  if (!isPlayable(e.meta)) return { ok: false, error: 'This replay was recorded with an older version of the game and cannot play.' };
  return fromShareCode(e.code);
}

/** A pasted share code into the vault, starred when there is room. */
export async function vaultImport(text: string): Promise<{ ok: true; entry: VaultEntry; outdated: boolean } | { ok: false; error: string }> {
  const r = await fromShareCode(text);
  if (!r.ok) return r;
  const code = text.replace(/\s+/g, '');
  const entry = await vaultAddCode(code, r.meta, { starred: true });
  return { ok: true, entry, outdated: !isPlayable(r.meta) };
}

// ---- save export ---------------------------------------------------------------------------------------------------

/** What a save carries of the vault: the favourites (metadata, name and share code), as many as fit SAVE_VAULT_BYTES. */
export interface SavedFavourite {
  meta: ReplayMeta;
  name: string;
  code: string;
}
/** Share-code text a save carries at most (the newest favourites first); the rest are left out and counted. */
export const SAVE_VAULT_BYTES = 256 * 1024;

export function favouritesForSave(list: readonly VaultEntry[] = cache, limit = SAVE_VAULT_BYTES): { items: SavedFavourite[]; skipped: number } {
  const items: SavedFavourite[] = [];
  let used = 0;
  let skipped = 0;
  for (const e of [...list].filter((x) => x.starred).sort(newest)) {
    if (used + e.code.length > limit) {
      skipped++;
      continue;
    }
    used += e.code.length;
    items.push({ meta: e.meta, name: e.name, code: e.code });
  }
  return { items, skipped };
}

/** Validate the favourites from a save (bad ones are dropped). */
export function favouritesFrom(v: unknown): SavedFavourite[] {
  if (!Array.isArray(v)) return [];
  const out: SavedFavourite[] = [];
  for (const x of v.slice(0, VAULT_STARS)) {
    if (!isObj(x) || typeof x.code !== 'string' || !/^SFCR\d+[zu]\.[A-Za-z0-9_-]+$/.test(x.code)) continue;
    const e = cleanEntry({ id: 'x', code: x.code, meta: x.meta, name: x.name });
    if (e) out.push({ meta: e.meta, name: e.name, code: e.code });
  }
  return out;
}

/** Load a save's favourites into the vault (starred, skipping ones already there). Returns how many were added. */
export async function restoreFavourites(items: readonly SavedFavourite[]): Promise<number> {
  let n = 0;
  for (const f of items) {
    const before = cache.some((e) => e.code === f.code);
    await vaultAddCode(f.code, f.meta, { starred: true, name: f.name });
    if (!before) n++;
  }
  return n;
}
