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

type Pending = { resolve: (px: unknown) => void; reject: (e: unknown) => void };

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
      w.onmessage = (e: MessageEvent<{ job: number; result: unknown }>) => {
        const p = pending.get(e.data.job);
        pending.delete(e.data.job);
        p?.resolve(e.data.result);
      };
      w.onerror = (e) => {
        // a worker that cannot run (CSP, old browser): build everything inline from now on
        failed = true;
        for (const p of pending.values()) p.reject(e);
        pending.clear();
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
  try {
    return await new Promise<T>((resolve, reject) => {
      pending.set(job, { resolve: resolve as (px: unknown) => void, reject });
      w.postMessage({ job, task });
    });
  } catch {
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
