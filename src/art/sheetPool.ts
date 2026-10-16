/**
 * A small pool of workers that build fighter sprite sheets in parallel (boot) and in the background (alternate outfits,
 * the boss), so the main thread never stalls on the pixel work. Falls back to building inline where workers are unavailable.
 *
 * Scheduling: one central queue, biggest job first; a job goes to a worker as soon as one is free (so the least busy
 * worker always gets the next job), and workers are started on demand up to the pool size. Workers that sit idle for a
 * while are terminated (their memory goes back to the system) and recreated when more work arrives.
 *
 * Caching: sheet jobs carry a key into the persistent sheet cache (sheetCache.ts); the worker answers from it when it
 * can and stores what it builds, so a repeat visit boots without rendering. The art version in that key is a hash of the
 * worker bundle itself (the code that renders the sheets), so a new build of the art never reads stale sheets.
 */
import { packedHeroSheet, sheetCost, type PackedSheet, type SheetSpec } from './sheetPixels';
import { platformArtPixels, stageMassPixels, type ArtPixels } from './stageMass';
import { ART_CACHE_SALT, cacheClear, cachePrune, hashText } from './sheetCache';
// a static import: the worker source is embedded in the bundle (the single-file build has no separate chunks)
import SheetWorker from './sheetWorker?worker&inline';

/** A unit of generated art: a fighter sheet, a solid stage structure or a pass-through platform. */
export type ArtTask =
  | { kind: 'sheet'; spec: SheetSpec }
  | { kind: 'mass'; args: Parameters<typeof stageMassPixels> }
  | { kind: 'plat'; args: Parameters<typeof platformArtPixels> };

/** The message a worker receives. */
export interface ArtJob {
  job: number;
  task: ArtTask;
  /** Sheet jobs only: where this sheet lives in the persistent cache (absent: no caching). */
  cacheKey?: string;
}

type Reply = { job: number; result?: unknown; error?: string; cached?: boolean; storing?: boolean; stored?: boolean };

interface Slot {
  w: Worker;
  /** The job this worker is running (one at a time, so it is free exactly when this is null). */
  busy: number | null;
  /** Cache writes still in flight on this worker (it is not terminated while it is still storing). */
  storing: number;
  idleSince: number;
}

interface Queued {
  job: number;
  task: ArtTask;
  cacheKey?: string;
  cost: number;
  resolve: (px: unknown) => void;
  reject: (e: unknown) => void;
  timer?: ReturnType<typeof setTimeout>;
  /** The worker running it, once dispatched. */
  slot?: Slot;
}

/** A job that has not come back this long after it was handed to a worker is built inline instead. */
const JOB_TIMEOUT_MS = 30000;
/**
 * Workers idle for this long are terminated (and recreated on demand): each holds its own heap (the bundle, the rendering
 * scratch of the last sheet it built), which only goes back to the system when the worker ends. Starting one again costs
 * a few tens of ms, so they are not kept around between bursts of work.
 */
const IDLE_MS = 4000;

/**
 * Pool size: one worker per spare core, at most 6, and fewer where memory is tight. Every busy worker holds a whole sheet
 * being built (tens of MB for the big fighters) in its own heap, so six at once during boot measured ~+230 MB of peak
 * renderer memory over two: enough to get a phone's tab killed. Phones (coarse pointer) and small-memory devices
 * (navigator.deviceMemory, in GB, where the browser reports it) get fewer workers; they build the same sheets, just fewer
 * at a time.
 */
export function poolSize(nav: { hardwareConcurrency?: number; deviceMemory?: number } | undefined = typeof navigator !== 'undefined' ? navigator : undefined, coarse = coarsePointer()): number {
  const cores = nav?.hardwareConcurrency || 4;
  const mem = nav?.deviceMemory;
  const memCap = mem === undefined ? 6 : mem <= 2 ? 1 : mem <= 4 ? 2 : 6;
  return Math.max(1, Math.min(6, cores - 1, memCap, coarse ? 3 : 6));
}

function coarsePointer(): boolean {
  try {
    return typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  } catch {
    return false;
  }
}

let poolCap = 0;
const size = (): number => (poolCap ||= poolSize());

const slots: Slot[] = [];
let failed = typeof Worker === 'undefined';
let nextJob = 0;
const queue: Queued[] = [];
/** Jobs handed to a worker, by job id. */
const running = new Map<number, Queued>();
let pumpScheduled = false;
let reaper: ReturnType<typeof setInterval> | null = null;

/** The art version for cache keys: null until known, or when the cache is off (dev server, no workers, ?artcache=off). */
let version: string | null = null;
let versionPromise: Promise<string | null> | null = null;
let capturedBlob: Blob | null = null;

function cacheMode(): string | null {
  try {
    return typeof location === 'undefined' ? null : new URLSearchParams(location.search).get('artcache');
  } catch {
    return null;
  }
}

/**
 * Start a worker. The first one also captures the worker bundle (the inline worker is built from a Blob URL) so its
 * hash can version the sheet cache; in dev the worker is a plain module URL, nothing is captured and the cache stays off.
 */
function spawn(): Slot | null {
  if (failed) return null;
  let w: Worker;
  const U = typeof URL !== 'undefined' ? URL : null;
  const orig = U?.createObjectURL;
  try {
    if (U && orig && !capturedBlob) {
      U.createObjectURL = (obj: Blob | MediaSource) => {
        if (obj instanceof Blob) capturedBlob = obj;
        return orig.call(U, obj);
      };
    }
    w = new SheetWorker();
  } catch {
    failed = true;
    return null;
  } finally {
    if (U && orig) U.createObjectURL = orig;
  }
  const slot: Slot = { w, busy: null, storing: 0, idleSince: performance.now() };
  w.onmessage = (e: MessageEvent<Reply>) => onReply(slot, e.data);
  // a reply that cannot be deserialized carries no job id: retry that worker's job inline
  w.onmessageerror = (e) => failSlot(slot, e, false);
  w.onerror = (e) => {
    // a worker that cannot run (CSP, old browser): build everything inline from now on
    e.preventDefault();
    failed = true;
    failSlot(slot, e, true);
  };
  slots.push(slot);
  reaper ??= setInterval(() => reapIdleWorkers(), IDLE_MS / 2);
  return slot;
}

function onReply(slot: Slot, r: Reply): void {
  if (r.stored) {
    slot.storing = Math.max(0, slot.storing - 1);
    slot.idleSince = performance.now();
    return;
  }
  if (r.storing) slot.storing++;
  if (slot.busy === r.job) {
    slot.busy = null;
    slot.idleSince = performance.now();
  }
  const q = running.get(r.job);
  if (q) {
    // a reply after its timeout finds nothing here: the job was already rebuilt inline, drop it
    running.delete(r.job);
    clearTimeout(q.timer);
    if (r.error !== undefined) q.reject(new Error(r.error));
    else q.resolve(r.result);
  }
  schedulePump();
}

/** A worker broke: reject its job (the caller rebuilds it inline); a dead worker leaves the pool. */
function failSlot(slot: Slot, reason: unknown, dead: boolean): void {
  for (const [job, q] of [...running]) {
    if (q.slot !== slot) continue;
    running.delete(job);
    clearTimeout(q.timer);
    q.reject(reason);
  }
  slot.busy = null;
  if (dead) {
    const i = slots.indexOf(slot);
    if (i >= 0) slots.splice(i, 1);
    try {
      slot.w.terminate();
    } catch {
      /* already gone */
    }
  }
  if (failed) {
    // no more workers: everything still queued is built inline by its caller
    for (const q of queue.splice(0)) q.reject(new Error('art workers unavailable'));
  } else schedulePump();
}

/** Terminate workers that have been idle (and done storing) for a while (exported for tests, which pass a later `now`). */
export function reapIdleWorkers(now = performance.now()): void {
  for (const s of [...slots]) {
    if (s.busy !== null || s.storing > 0 || now - s.idleSince < IDLE_MS || queue.length) continue;
    slots.splice(slots.indexOf(s), 1);
    try {
      s.w.terminate();
    } catch {
      /* already gone */
    }
  }
  if (!slots.length && reaper) {
    clearInterval(reaper);
    reaper = null;
  }
}

function schedulePump(): void {
  if (pumpScheduled) return;
  pumpScheduled = true;
  // a macrotask, so every job submitted in the same burst (e.g. all of boot) is queued before the first is picked
  setTimeout(pump, 0);
}

/** Hand the biggest queued jobs to free workers, starting workers up to the pool size. */
function pump(): void {
  pumpScheduled = false;
  queue.sort((a, b) => b.cost - a.cost || a.job - b.job);
  while (queue.length && !failed) {
    const slot = slots.find((s) => s.busy === null) ?? (slots.length < size() ? spawn() : null);
    if (!slot) break;
    const q = queue.shift()!;
    slot.busy = q.job;
    q.slot = slot;
    running.set(q.job, q);
    q.timer = setTimeout(() => {
      if (running.get(q.job) !== q) return;
      running.delete(q.job);
      q.reject(new Error(`art job ${q.job} (${q.task.kind}) timed out`));
    }, JOB_TIMEOUT_MS);
    try {
      slot.w.postMessage({ job: q.job, task: q.task, cacheKey: q.cacheKey } satisfies ArtJob);
    } catch (err) {
      running.delete(q.job);
      clearTimeout(q.timer);
      slot.busy = null;
      q.reject(err);
    }
  }
  // no workers after all (they could not be started): every queued job is built inline by its caller
  if (failed) for (const q of queue.splice(0)) q.reject(new Error('art workers unavailable'));
}

/** The art version for cache keys (starts the first worker to learn it); null means "do not cache". */
function artVersion(): Promise<string | null> {
  versionPromise ??= (async () => {
    const mode = cacheMode();
    if (mode === 'clear') await cacheClear();
    if (failed || mode === 'off' || mode === 'clear') return null;
    if (!slots.length) spawn();
    const blob = capturedBlob as Blob | null;
    if (!blob) return null;
    try {
      version = `${hashText(await blob.text())}-${ART_CACHE_SALT}`;
    } catch {
      return null;
    }
    // housekeeping once boot has settled: drop sheets cached by older builds of the game
    const v = version;
    setTimeout(() => void cachePrune(v), 15000);
    return version;
  })().catch(() => null);
  return versionPromise;
}

function inline(task: ArtTask): unknown {
  if (task.kind === 'sheet') return packedHeroSheet(task.spec);
  return task.kind === 'mass' ? stageMassPixels(...task.args) : platformArtPixels(...task.args);
}

function costOf(task: ArtTask): number {
  return task.kind === 'sheet' ? sheetCost(task.spec) : task.args[1] * task.args[2];
}

async function run<T>(task: ArtTask, cacheKey?: string): Promise<T> {
  if (failed) return inline(task) as T;
  try {
    return await new Promise<T>((resolve, reject) => {
      queue.push({ job: nextJob++, task, cacheKey, cost: costOf(task), resolve: resolve as (px: unknown) => void, reject });
      schedulePump();
    });
  } catch (err) {
    console.warn('[sheetPool] worker job failed, building inline:', err);
    // only this job falls back; an inline failure propagates to the caller
    return inline(task) as T;
  }
}

/** Build one fighter sheet off the main thread (or inline if workers are unavailable), from the persistent cache when possible. */
export function buildSheetPixels(spec: SheetSpec): Promise<PackedSheet> {
  // one build per sheet at a time: a second request while it is in flight shares the result (the sheet is only read)
  const id = hashText(JSON.stringify(spec));
  let p = inFlight.get(id);
  if (!p) {
    p = (async () => {
      const v = failed ? null : await artVersion();
      return run<PackedSheet>({ kind: 'sheet', spec }, v ? `${v}/${id}` : undefined);
    })();
    const mine = p;
    inFlight.set(id, mine);
    const done = (): void => {
      if (inFlight.get(id) === mine) inFlight.delete(id);
    };
    mine.then(done, done);
  }
  return p;
}
/** Sheet builds in flight, by spec hash. */
const inFlight = new Map<string, Promise<PackedSheet>>();

/** Build a stage structure's or platform's art off the main thread. */
export function buildStageArt(task: Exclude<ArtTask, { kind: 'sheet' }>): Promise<ArtPixels> {
  return run<ArtPixels>(task);
}

/** Debug / tests: pool state. */
export function poolStats(): { workers: number; busy: number; queued: number; cacheVersion: string | null } {
  return { workers: slots.length, busy: slots.filter((s) => s.busy !== null).length, queued: queue.length, cacheVersion: version };
}
