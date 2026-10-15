/**
 * A small pool of workers that build fighter sprite sheets in parallel (boot) and in the background (alternate outfits),
 * so the main thread never stalls on the pixel work. Falls back to building inline where workers are unavailable.
 */
import { packedHeroSheet, type PackedSheet, type SheetSpec } from './sheetPixels';
import { platformArtPixels, stageMassPixels, type ArtPixels } from './stageMass';
// a static import: the worker source is embedded in the bundle (the single-file build has no separate chunks)
import SheetWorker from './sheetWorker?worker&inline';

/** A unit of generated art: a fighter sheet, a solid stage structure or a pass-through platform. */
export type ArtTask =
  | { kind: 'sheet'; spec: SheetSpec }
  | { kind: 'mass'; args: Parameters<typeof stageMassPixels> }
  | { kind: 'plat'; args: Parameters<typeof platformArtPixels> };

type Pending = { resolve: (px: unknown) => void; reject: (e: unknown) => void; worker: Worker; timer: ReturnType<typeof setTimeout> };
type Reply = { job: number; result?: unknown; error?: string };

/** A job that has not come back after this long (plus a little per job queued ahead of it) is built inline instead. */
const JOB_TIMEOUT_MS = 15000;
const QUEUED_JOB_MS = 4000;

let workers: Worker[] | null = null;
let failed = false;
let nextJob = 0;
let rr = 0;
const pending = new Map<number, Pending>();

let starting: Promise<Worker[] | null> | null = null;

/** The shared pool, created once (concurrent first callers share the same start-up). */
function pool(): Promise<Worker[] | null> {
  starting ??= startPool();
  return starting;
}

function settle(job: number): Pending | undefined {
  const p = pending.get(job);
  if (!p) return undefined; // timed out earlier (already rebuilt inline) or unknown: drop the late reply
  pending.delete(job);
  clearTimeout(p.timer);
  return p;
}

/** Reject every job waiting on one worker (their callers rebuild those jobs inline). */
function rejectWorker(w: Worker, reason: unknown): void {
  for (const [job, p] of [...pending]) if (p.worker === w) settle(job)?.reject(reason);
}

async function startPool(): Promise<Worker[] | null> {
  if (workers || failed) return workers;
  if (typeof Worker === 'undefined') {
    failed = true;
    return null;
  }
  try {
    const n = Math.max(1, Math.min(6, (navigator.hardwareConcurrency || 4) - 1));
    workers = Array.from({ length: n }, () => {
      const w = new SheetWorker();
      w.onmessage = (e: MessageEvent<Reply>) => {
        const p = settle(e.data.job);
        if (!p) return;
        if (e.data.error !== undefined) p.reject(new Error(e.data.error));
        else p.resolve(e.data.result);
      };
      // a reply that cannot be deserialized carries no job id: retry that worker's outstanding jobs inline
      w.onmessageerror = (e) => rejectWorker(w, e);
      w.onerror = (e) => {
        // a worker that cannot run (CSP, old browser): build everything inline from now on
        e.preventDefault();
        failed = true;
        rejectWorker(w, e);
      };
      return w;
    });
  } catch {
    failed = true;
  }
  return workers;
}

function inline(task: ArtTask): unknown {
  if (task.kind === 'sheet') return packedHeroSheet(task.spec);
  return task.kind === 'mass' ? stageMassPixels(...task.args) : platformArtPixels(...task.args);
}

async function run<T>(task: ArtTask): Promise<T> {
  const ws = await pool();
  if (!ws || failed) return inline(task) as T;
  const job = nextJob++;
  const w = ws[rr++ % ws.length];
  let queued = 0;
  for (const p of pending.values()) if (p.worker === w) queued++;
  try {
    return await new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => settle(job)?.reject(new Error(`art job ${job} (${task.kind}) timed out`)), JOB_TIMEOUT_MS + queued * QUEUED_JOB_MS);
      pending.set(job, { resolve: resolve as (px: unknown) => void, reject, worker: w, timer });
      try {
        w.postMessage({ job, task });
      } catch (err) {
        settle(job)?.reject(err);
      }
    });
  } catch (err) {
    console.warn('[sheetPool] worker job failed, building inline:', err);
    // only this job falls back; an inline failure propagates to the caller
    return inline(task) as T;
  }
}

/** Build one fighter sheet off the main thread (or inline if workers are unavailable). */
export function buildSheetPixels(spec: SheetSpec): Promise<PackedSheet> {
  return run<PackedSheet>({ kind: 'sheet', spec });
}

/** Build a stage structure's or platform's art off the main thread. */
export function buildStageArt(task: Exclude<ArtTask, { kind: 'sheet' }>): Promise<ArtPixels> {
  return run<ArtPixels>(task);
}
