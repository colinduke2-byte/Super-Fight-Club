/**
 * Persistent cache of packed fighter sheets (pixels + frame boxes) in IndexedDB, so a repeat visit skips the procedural
 * render entirely. Used from the sheet workers (lookups, gzip compression and stores all happen off the main thread) and
 * from the main thread for housekeeping (pruning entries of older art builds).
 *
 * Keys are `<art version>/<hash of the sheet spec>`: the art version is a hash of the worker bundle that renders the
 * sheets (sheetPool.ts) plus ART_CACHE_SALT, and the spec carries the look, palette, frame sizes, animations and poses, so
 * any change to the art code or its inputs misses the cache. Every storage call is wrapped: private mode, blocked
 * storage, quota errors or a missing IndexedDB / CompressionStream just mean "no cache".
 */
import type { PackedSheet } from './sheetPixels';

/** Bump to drop every cached sheet (e.g. if the art changes in a way the bundle hash would not see). */
export const ART_CACHE_SALT = 1;

const DB_NAME = 'sfc-art-cache';
const STORE = 'sheets';
const OPEN_TIMEOUT_MS = 2500;
const OP_TIMEOUT_MS = 8000;

interface SheetRecord {
  key: string;
  width: number;
  height: number;
  cellW: number;
  cellH: number;
  frames: Int32Array;
  /** The RGBA pixels, gzip-compressed when `gz` (raw otherwise). */
  bytes: ArrayBuffer;
  gz: boolean;
}

/** 53-bit string hash (cyrb53), as 14 hex digits. */
function cyrb53(s: string, seed: number): string {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, '0');
}

/** A ~106-bit content hash of a string (two seeded cyrb53 passes). */
export function hashText(s: string): string {
  return cyrb53(s, 1) + cyrb53(s, 0x9e3779b9);
}

/** The cache key of a sheet: art version plus a hash of everything the sheet is rendered from. */
export function sheetCacheKey(version: string, spec: unknown): string {
  return `${version}/${hashText(JSON.stringify(spec))}`;
}

let dbPromise: Promise<IDBDatabase | null> | null = null;

function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise<T>((resolve) => {
    const t = setTimeout(() => resolve(fallback), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      () => {
        clearTimeout(t);
        resolve(fallback);
      },
    );
  });
}

/** The cache database, opened once per thread; null when IndexedDB is unavailable or blocked. */
function db(): Promise<IDBDatabase | null> {
  dbPromise ??= withTimeout(
    new Promise<IDBDatabase | null>((resolve) => {
      try {
        if (typeof indexedDB === 'undefined') return resolve(null);
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => {
          try {
            if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: 'key' });
          } catch {
            /* the open fails below */
          }
        };
        req.onsuccess = () => {
          const d = req.result;
          // another tab upgrading the schema: let it, and stop using this connection
          d.onversionchange = () => {
            try {
              d.close();
            } catch {
              /* already closed */
            }
            dbPromise = null;
          };
          resolve(d);
        };
        req.onerror = () => resolve(null);
        req.onblocked = () => resolve(null);
      } catch {
        resolve(null);
      }
    }),
    OPEN_TIMEOUT_MS,
    null,
  );
  return dbPromise;
}

function request<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  return withTimeout(
    db().then(
      (d) =>
        new Promise<T | undefined>((resolve) => {
          if (!d) return resolve(undefined);
          try {
            const tx = mode === 'readwrite' ? d.transaction(STORE, mode, { durability: 'relaxed' }) : d.transaction(STORE, mode);
            const r = fn(tx.objectStore(STORE));
            let value: T | undefined;
            if (r) r.onsuccess = () => (value = r.result);
            tx.oncomplete = () => resolve(value);
            tx.onerror = () => resolve(undefined);
            tx.onabort = () => resolve(undefined);
          } catch {
            resolve(undefined);
          }
        }),
    ),
    OP_TIMEOUT_MS,
    undefined,
  );
}

const canGzip = (): boolean => typeof CompressionStream !== 'undefined' && typeof DecompressionStream !== 'undefined' && typeof Response !== 'undefined';

/** A cached sheet, or null on a miss (or any storage / decode problem). */
export async function cacheGet(key: string): Promise<PackedSheet | null> {
  try {
    const rec = await request<SheetRecord>('readonly', (s) => s.get(key) as IDBRequest<SheetRecord>);
    if (!rec || rec.key !== key || !(rec.frames instanceof Int32Array) || !(rec.bytes instanceof ArrayBuffer)) return null;
    let bytes: ArrayBuffer;
    if (rec.gz) {
      if (!canGzip()) return null;
      bytes = await new Response(new Blob([rec.bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
    } else bytes = rec.bytes;
    if (bytes.byteLength !== rec.width * rec.height * 4 || rec.width <= 0 || rec.height <= 0) return null;
    return { width: rec.width, height: rec.height, cellW: rec.cellW, cellH: rec.cellH, frames: rec.frames, data: new Uint8ClampedArray(bytes) };
  } catch {
    return null;
  }
}

/**
 * Store a sheet. The pixels are copied synchronously before this returns its promise, so the caller may transfer (detach)
 * the sheet's buffers straight after calling it. Resolves once stored (or given up on); never rejects.
 */
export function cachePut(key: string, sheet: PackedSheet): Promise<void> {
  let raw: Blob;
  let frames: Int32Array;
  try {
    raw = new Blob([sheet.data as Uint8ClampedArray<ArrayBuffer>]);
    frames = sheet.frames.slice();
  } catch {
    return Promise.resolve();
  }
  const { width, height, cellW, cellH } = sheet;
  return (async () => {
    try {
      const gz = canGzip();
      const bytes = gz ? await new Response(raw.stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer() : await raw.arrayBuffer();
      const rec: SheetRecord = { key, width, height, cellW, cellH, frames, bytes, gz };
      await request('readwrite', (s) => {
        s.put(rec);
      });
    } catch {
      /* no cache this time */
    }
  })();
}

/** Delete every cached sheet that does not belong to art version `version` (older builds of the game). */
export async function cachePrune(version: string): Promise<void> {
  try {
    await request('readwrite', (s) => {
      s.delete(IDBKeyRange.upperBound(`${version}/`, true));
      s.delete(IDBKeyRange.lowerBound(`${version}/￿`, true));
    });
  } catch {
    /* nothing to prune */
  }
}

/** Drop the whole cache (debug: `?artcache=clear`). */
export async function cacheClear(): Promise<void> {
  try {
    await request('readwrite', (s) => {
      s.clear();
    });
  } catch {
    /* nothing to clear */
  }
}
