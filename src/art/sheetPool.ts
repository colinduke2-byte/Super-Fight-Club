/**
 * A small pool of workers that build fighter sprite sheets in parallel (boot) and in the background (alternate outfits),
 * so the main thread never stalls on the pixel work. Falls back to building inline where workers are unavailable.
 */
import { packedHeroSheet, type PackedSheet, type SheetSpec } from './sheetPixels';

type Pending = { resolve: (px: PackedSheet) => void; reject: (e: unknown) => void };

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
    const { default: SheetWorker } = await import('./sheetWorker?worker&inline');
    const n = Math.max(1, Math.min(6, (navigator.hardwareConcurrency || 4) - 1));
    workers = Array.from({ length: n }, () => {
      const w = new SheetWorker();
      w.onmessage = (e: MessageEvent<{ job: number; sheet: PackedSheet }>) => {
        const p = pending.get(e.data.job);
        pending.delete(e.data.job);
        p?.resolve(e.data.sheet);
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

/** Build one sheet off the main thread (or inline if workers are unavailable). */
export async function buildSheetPixels(spec: SheetSpec): Promise<PackedSheet> {
  const ws = await pool();
  if (!ws || failed) return packedHeroSheet(spec);
  const job = nextJob++;
  const w = ws[rr++ % ws.length];
  try {
    return await new Promise<PackedSheet>((resolve, reject) => {
      pending.set(job, { resolve, reject });
      w.postMessage({ job, spec });
    });
  } catch {
    return packedHeroSheet(spec);
  }
}
